/* Policy builder commerce — order intake, payment confirmation, fulfilment and
   the human approval gate. Mounted on the existing Express app by server.js.

   The shape of the pipeline:
     order  -> Policy Register (Awaiting payment | Invoiced)
     card   -> Stripe Checkout -> webhook or return-confirm -> Paid
     both   -> generate documents -> attach to the register -> Awaiting approval
     office -> /admin/fulfilment -> approve -> Postmark delivery -> Delivered

   Everything degrades: with no Stripe key the card option is withheld and the
   invoice route still works; with no Airtable PAT orders live in memory; with
   no Postmark token emails are logged. Production behaviour therefore never
   depends on an environment variable arriving before the code does. */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pricing = require('./policy-pricing');
const signoffs = require('./signoffs');
const register = require('./policy-register');
const stripe = require('./stripe');
const fulfilment = require('./policy-fulfilment');
const { uploadPolicyFile } = require('./dropbox');
const {
  policyOrderEmail, policyDeliveryEmail, policyAdminEmail, orderRows, EMAIL_DRY_RUN
} = require('./email');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const OFFICE_EMAIL = process.env.POLICY_NOTIFY_EMAIL || 'info@nivha.net';
const POLICY_VERSION = process.env.POLICY_VERSION || '1.0';

/* Card payments are only taken once someone can approve the delivery: with no
   ADMIN_TOKEN the fulfilment page does not exist, so a paid order could not be
   sent. Until then the wizard offers the invoice route and the office is
   emailed, which is recoverable in a way that taking money is not. */
const cardPaymentsEnabled = () => !stripe.SIMULATED && !!ADMIN_TOKEN;

const isRecordId = id => /^rec[A-Za-z0-9]{6,20}$/.test(String(id || ''));
const clean = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const iso = d => d.toISOString();
const dateOnly = d => d.toISOString().slice(0, 10);

/* Constant-time token check, so the admin gate cannot be probed a character
   at a time. Absent env means the gate does not exist at all. */
function adminOk(req) {
  if (!ADMIN_TOKEN) return false;
  const supplied = String(req.get('x-admin-token') || req.query.token || '');
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) {
    /* Still burn a comparison so the failure takes the same time. */
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

const escHtml = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------------- order intake ---------------- */

/* Rebuild the priced order from the raw wizard answers. The browser's totals
   are read only to log a mismatch; they never reach a payment or an invoice. */
function priceFromAnswers(a) {
  const clientCode = pricing.validateClientCode(a.clientCode, { allowDemo: EMAIL_DRY_RUN });
  const order = pricing.computeOrder({
    packItems: Array.isArray(a.packItems) ? a.packItems : [],
    reviewService: !!a.reviewService,
    clientRate: clientCode.valid,
    payMethod: a.payMethod === 'invoice' ? 'invoice' : 'card',
    billingCountry: (a.details && a.details.billingCountry) === 'roi' ? 'roi' : 'uk'
  });
  return { order, clientCode };
}

function registerFieldsFor({ orderRef, answers, order, clientCode, invoice }) {
  const d = answers.details || {};
  const now = new Date();
  const fields = {
    'Order ref': orderRef,
    'Status': invoice ? register.STATUS.INVOICED : register.STATUS.AWAITING_PAYMENT,
    'Fulfilment status': register.FULFILMENT.PENDING,
    'Organisation': clean(d.company, 200),
    'Contact name': clean(d.contactName, 120),
    'Email': clean(d.contactEmail, 200),
    'Phone': clean(d.contactPhone, 60),
    'Jurisdictions': fulfilment.registerJurisdictions(answers),
    'Items': order.registerItems,
    'Client code used': clientCode.valid ? clientCode.code : '',
    'Payment method': invoice ? 'Invoice' : 'Card',
    'VAT treatment': order.reverseCharge ? 'ROI reverse charge' : 'UK VAT 20%',
    'Subtotal ex VAT': order.subtotal,
    'VAT': order.vat,
    'Total': order.total,
    'Policy version': POLICY_VERSION,
    'Issue date': dateOnly(now),
    'Review status': 'None',
    'Answers JSON': JSON.stringify({ orderRef, answers, order }, null, 2).slice(0, 99000)
  };
  if (order.hasReview) {
    const due = new Date(now); due.setMonth(due.getMonth() + 12);
    fields['Review due'] = dateOnly(due);
  }
  if (d.billingCountry === 'roi' && d.vatNumber) {
    fields['Notes'] = `Buyer VAT number (Republic of Ireland): ${clean(d.vatNumber, 30)}`;
  }
  return fields;
}

/* Append to Notes without losing what is already there. */
async function addNote(recordId, text) {
  try {
    const rec = await register.getOrder(recordId);
    const existing = (rec && rec.fields && rec.fields['Notes']) || '';
    const stamped = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} \u2014 ${text}`;
    await register.patchOrder(recordId, { 'Notes': (existing ? existing + '\n' : '') + stamped });
  } catch (e) {
    console.error('policy register note failed (non-fatal):', e.message);
  }
}

/* ---------------- fulfilment ---------------- */

/* Generate the documents for an order and park them for human approval.
   Never throws to the caller: a failure marks the register and alerts the
   office rather than breaking the buyer's confirmation page. */
async function runFulfilment({ baseUrl, recordId }) {
  let orderRef = '';
  try {
    const rec = await register.getOrder(recordId);
    if (!rec) throw new Error('Order not found in the register');
    const payload = JSON.parse(rec.fields['Answers JSON'] || '{}');
    const answers = payload.answers || {};
    const order = payload.order;
    orderRef = payload.orderRef || rec.fields['Order ref'] || '';
    if (!order) throw new Error('Order pricing snapshot missing');

    const files = await fulfilment.buildOrderFiles({ answers, order });
    if (!files.length) throw new Error('No documents were produced for this order');

    const dropboxPaths = [];
    for (const f of files) {
      try {
        await register.attachDocument(recordId, {
          filename: f.filename, contentType: f.contentType, buffer: f.buffer
        });
      } catch (e) {
        console.error(`attachment upload failed for ${f.filename}:`, e.message);
        try {
          const up = await uploadPolicyFile({ orderRef, filename: f.filename, buffer: f.buffer });
          dropboxPaths.push(up.path || f.filename);
        } catch (e2) {
          console.error(`dropbox fallback failed for ${f.filename}:`, e2.message);
          dropboxPaths.push(`${f.filename} \u2014 upload failed: ${e2.message}`);
        }
      }
    }
    if (dropboxPaths.length) {
      await addNote(recordId, `Airtable attachment upload failed; files archived to Dropbox: ${dropboxPaths.join(', ')}`);
    }

    await register.patchOrder(recordId, { 'Fulfilment status': register.FULFILMENT.AWAITING });

    const flagged = fulfilment.draftStamped(files);
    await policyAdminEmail({
      baseUrl,
      to: OFFICE_EMAIL,
      subject: `Policy order ${orderRef} \u2014 awaiting approval`,
      heading: `Order ${orderRef} has been generated and is waiting for approval before delivery.`,
      rows: [
        ['Organisation', rec.fields['Organisation'] || ''],
        ['Contact', `${rec.fields['Contact name'] || ''} <${rec.fields['Email'] || ''}>`],
        ['Payment', `${rec.fields['Payment method'] || ''} \u00b7 ${rec.fields['Status'] || ''}`],
        ['Total', `\u00a3${(rec.fields['Total'] || 0).toFixed ? rec.fields['Total'].toFixed(2) : rec.fields['Total']}`],
        ['Documents', String(files.length)]
      ],
      note: flagged.length
        ? `Delivery is blocked until sign-off: ${flagged.join(', ')} still ${flagged.length === 1 ? 'carries' : 'carry'} a draft stamp.`
        : 'Open the fulfilment page, check the documents, then approve and send.',
      link: `${baseUrl}/admin/fulfilment`,
      linkLabel: 'Open the fulfilment page'
    });
    return { ok: true, files: files.length, flagged };
  } catch (err) {
    console.error('policy fulfilment failed:', err.message);
    try {
      await register.patchOrder(recordId, { 'Fulfilment status': register.FULFILMENT.FAILED });
      await addNote(recordId, `Fulfilment failed: ${err.message}`);
      await policyAdminEmail({
        baseUrl, to: OFFICE_EMAIL,
        subject: `Policy order ${orderRef || recordId} \u2014 fulfilment failed`,
        heading: 'An order could not be fulfilled automatically and needs attention.',
        rows: [['Record', recordId], ['Error', err.message]]
      });
    } catch (e) { console.error('fulfilment failure handling failed:', e.message); }
    return { ok: false, error: err.message };
  }
}

/* ---------------- payment confirmation ---------------- */

/* Mark a card order paid. Safe to call twice — the webhook and the buyer's
   return from Stripe race each other by design. */
async function markPolicyPaid({ baseUrl, session }) {
  const meta = session.metadata || {};
  let recordId = meta.recordId;
  if (!isRecordId(recordId)) {
    const found = await register.findBySessionId(session.id);
    recordId = found && found.id;
  }
  if (!recordId) throw new Error('No register record for this session');
  const rec = await register.getOrder(recordId);
  if (!rec) throw new Error('Register record not found');
  if (rec.fields['Status'] === register.STATUS.PAID) {
    return { alreadyPaid: true, recordId, orderRef: rec.fields['Order ref'] || meta.orderRef || '' };
  }

  const payload = JSON.parse(rec.fields['Answers JSON'] || '{}');
  const order = payload.order;
  const now = new Date();
  const fields = {
    'Status': register.STATUS.PAID,
    'Paid at': iso(now),
    'Stripe session ID': session.id,
    'Stripe payment ID': String(session.payment_intent || ''),
    'Fulfilment status': register.FULFILMENT.PENDING
  };

  /* The annual review: either the subscription Stripe already created, or one
     we start now against the card saved at Checkout. */
  let subscriptionId = session.subscription || '';
  if (order && order.hasReview && !subscriptionId && meta.reviewPriceId && session.customer) {
    try {
      let paymentMethod = '';
      if (session.payment_intent) {
        const pi = await stripe.getPaymentIntent(String(session.payment_intent));
        paymentMethod = pi.payment_method || '';
      }
      const sub = await stripe.createReviewSubscription({
        customer: session.customer,
        paymentMethod,
        priceId: meta.reviewPriceId,
        orderRef: rec.fields['Order ref'] || meta.orderRef || '',
        recordId
      });
      subscriptionId = sub.id;
    } catch (e) {
      console.error('review subscription creation failed:', e.message);
      await addNote(recordId, `Annual review subscription could not be created automatically: ${e.message}`);
    }
  }
  if (subscriptionId) fields['Stripe subscription ID'] = String(subscriptionId);
  if (order && order.hasReview) {
    const due = new Date(now); due.setMonth(due.getMonth() + 12);
    fields['Review due'] = dateOnly(due);
    fields['Review status'] = 'Active';
  }
  await register.patchOrder(recordId, fields);

  const orderRef = rec.fields['Order ref'] || meta.orderRef || '';
  if (order && rec.fields['Email']) {
    try {
      await policyOrderEmail({
        baseUrl, to: rec.fields['Email'], orderRef,
        organisation: rec.fields['Organisation'] || '', order, invoice: false,
        bcc: OFFICE_EMAIL
      });
    } catch (e) { console.error('policy order email failed (non-fatal):', e.message); }
  }
  /* Documents are generated in the background; the buyer's page never waits. */
  runFulfilment({ baseUrl, recordId }).catch(e => console.error('fulfilment kickoff failed:', e.message));
  return { alreadyPaid: false, recordId, orderRef, total: rec.fields['Total'] };
}

/* ---------------- routes ---------------- */

function mount(app, { baseUrl }) {
  /* Place an order. Card orders come back with a Stripe Checkout URL; invoice
     orders are confirmed on the spot and go straight into fulfilment. */
  app.post('/api/policy/orders', async (req, res) => {
    try {
      const a = req.body || {};
      const d = a.details || {};
      if (!clean(d.company, 200)) return res.status(400).json({ ok: false, error: 'An organisation name is required.' });
      if (!isEmail(d.contactEmail)) return res.status(400).json({ ok: false, error: 'A valid email address is required.' });
      if (!clean(d.contactName, 120)) return res.status(400).json({ ok: false, error: 'A contact name is required.' });
      const ack = a.acknowledgements || {};
      if (!ack.understanding || !ack.businessBuyer) {
        return res.status(400).json({ ok: false, error: 'Both declarations must be accepted before an order can be placed.' });
      }
      const invoice = a.payMethod === 'invoice';
      const { order, clientCode } = priceFromAnswers(a);
      /* Invoice terms belong to testing clients. The exception is an
         environment where card payments are not configured yet: withholding
         both routes would leave a buyer with no way to order at all. */
      if (invoice && !clientCode.valid && cardPaymentsEnabled()) {
        return res.status(400).json({
          ok: false, needsClientCode: true,
          error: 'Invoice terms are for NIVHA testing clients \u2014 enter your client code, or pay by card.'
        });
      }
      if (!order) return res.status(400).json({ ok: false, error: 'There is nothing to order.' });
      if (a.clientCode && !clientCode.valid) {
        return res.status(400).json({ ok: false, error: 'That client code is not recognised \u2014 check your latest fee note, or continue without it.', badCode: true });
      }
      if (!invoice && !cardPaymentsEnabled()) {
        return res.status(503).json({
          ok: false, cardUnavailable: true,
          error: 'Card payments are available shortly \u2014 choose invoice to place your order.'
        });
      }

      const orderRef = await register.nextOrderRef();
      const fields = registerFieldsFor({ orderRef, answers: a, order, clientCode, invoice });
      const { recordId, dryRun } = await register.createOrder(fields);

      if (invoice) {
        try {
          await policyOrderEmail({
            baseUrl, to: d.contactEmail, orderRef, organisation: d.company,
            order, invoice: true, bcc: OFFICE_EMAIL
          });
        } catch (e) { console.error('invoice confirmation email failed (non-fatal):', e.message); }
        try {
          await policyAdminEmail({
            baseUrl, to: OFFICE_EMAIL,
            subject: `Policy order ${orderRef} \u2014 invoice requested`,
            heading: `A policy order has been placed on invoice terms and needs an invoice raising.`,
            rows: [
              ['Organisation', d.company],
              ['Contact', `${d.contactName} <${d.contactEmail}>`],
              ...orderRows(order),
              ['Terms', '14 days from invoice date']
            ],
            note: 'Fulfilment continues now; the documents wait on approval, not on payment.',
            link: `${baseUrl}/admin/fulfilment`, linkLabel: 'Open the fulfilment page'
          });
        } catch (e) { console.error('invoice notification failed (non-fatal):', e.message); }
        runFulfilment({ baseUrl, recordId }).catch(e => console.error('fulfilment kickoff failed:', e.message));
        return res.json({
          ok: true, orderRef, recordId, dryRun, invoice: true,
          totals: { subtotal: order.subtotal, vat: order.vat, total: order.total }
        });
      }

      const session = await stripe.createPolicyCheckoutSession({
        baseUrl, orderRef, recordId, email: d.contactEmail, order
      });
      await register.patchOrder(recordId, { 'Stripe session ID': session.id });
      res.json({
        ok: true, orderRef, recordId, dryRun, url: session.url,
        totals: { subtotal: order.subtotal, vat: order.vat, total: order.total }
      });
    } catch (err) {
      console.error('POST /api/policy/orders failed:', err.message);
      res.status(502).json({ ok: false, error: 'The order could not be placed \u2014 please try again.' });
    }
  });

  /* Server-side price check for the wizard, so the figures on screen are the
     figures that will be charged. */
  app.post('/api/policy/quote', (req, res) => {
    try {
      const a = req.body || {};
      const { order, clientCode } = priceFromAnswers(a);
      if (!order) return res.status(400).json({ ok: false, error: 'There is nothing to price.' });
      res.json({
        ok: true,
        clientRate: clientCode.valid,
        badCode: !!(a.clientCode && !clientCode.valid),
        lines: order.lines.map(l => ({ id: l.id, name: l.name, net: l.netPence / 100, list: l.listPence / 100 })),
        clientDiscount: order.clientDiscountPence / 100,
        promptDiscount: order.promptDiscountPence / 100,
        subtotal: order.subtotal, vat: order.vat, total: order.total,
        reverseCharge: order.reverseCharge, vatNote: order.vatNote
      });
    } catch (err) {
      console.error('POST /api/policy/quote failed:', err.message);
      res.status(500).json({ ok: false, error: 'The order could not be priced.' });
    }
  });

  /* Client code check for the review step. */
  app.post('/api/policy/client-code', (req, res) => {
    const result = pricing.validateClientCode((req.body || {}).code, { allowDemo: EMAIL_DRY_RUN });
    res.json({ ok: true, valid: result.valid, code: result.code });
  });

  /* Webhook-less fallback: the buyer returns from Stripe with the session id. */
  app.get('/api/policy/orders/confirm', async (req, res) => {
    try {
      if (stripe.SIMULATED) return res.status(400).json({ ok: false, error: 'Card payments are not configured in this environment.' });
      const sid = String(req.query.sid || req.query.session_id || '');
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ ok: false, error: 'Bad session id' });
      const session = await stripe.getSession(sid);
      if ((session.metadata || {}).kind !== 'policy') {
        return res.status(400).json({ ok: false, error: 'That session is not a policy order' });
      }
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        return res.json({ ok: true, paid: false });
      }
      const out = await markPolicyPaid({ baseUrl, session });
      res.json({ ok: true, paid: true, orderRef: out.orderRef, amount: (session.amount_total || 0) / 100 });
    } catch (err) {
      console.error('GET /api/policy/orders/confirm failed:', err.message);
      res.status(502).json({ ok: false, error: 'The payment could not be confirmed.' });
    }
  });

  /* ---------------- admin fulfilment gate ---------------- */

  const guard = (req, res) => {
    /* With no ADMIN_TOKEN the gate does not exist, and says so as a 404. */
    if (!ADMIN_TOKEN || !adminOk(req)) { res.status(404).send('Not found'); return false; }
    return true;
  };

  app.get('/api/admin/policy/orders', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const awaiting = await register.listByFulfilment(register.FULFILMENT.AWAITING);
      const pack = await fulfilment.packStatus();
      const notReady = pack.filter(p => !p.signedOff || p.draftStamped).map(p => p.file);
      const orders = awaiting.map(r => {
        const names = register.documentNames(r);
        const blocked = names.filter(n => notReady.includes(n));
        return {
          id: r.id,
          orderRef: r.fields['Order ref'] || '',
          organisation: r.fields['Organisation'] || '',
          contact: r.fields['Contact name'] || '',
          email: r.fields['Email'] || '',
          items: r.fields['Items'] || [],
          jurisdictions: r.fields['Jurisdictions'] || [],
          status: r.fields['Status'] || '',
          paymentMethod: r.fields['Payment method'] || '',
          total: r.fields['Total'] || 0,
          notes: r.fields['Notes'] || '',
          documents: names.map((n, i) => ({ index: i, filename: n })),
          blocked
        };
      });
      res.json({ ok: true, orders, dryRun: register.DRY_RUN });
    } catch (err) {
      console.error('GET /api/admin/policy/orders failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not load the orders.' });
    }
  });

  /* Documents are streamed through here, never linked to directly: an Airtable
     attachment URL would be a public link to a sold document. */
  app.get('/api/admin/policy/orders/:id/documents/:index', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!isRecordId(req.params.id)) return res.status(400).json({ ok: false, error: 'Bad record id' });
      const docs = await register.documentsFor(req.params.id);
      const doc = docs[Number(req.params.index)];
      if (!doc) return res.status(404).json({ ok: false, error: 'No such document' });
      res.setHeader('Content-Type', doc.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/[^A-Za-z0-9._-]/g, '-')}"`);
      res.send(doc.buffer);
    } catch (err) {
      console.error('admin document download failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not fetch the document.' });
    }
  });

  app.post('/api/admin/policy/orders/:id/approve', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!isRecordId(req.params.id)) return res.status(400).json({ ok: false, error: 'Bad record id' });
      const recordId = req.params.id;
      const rec = await register.getOrder(recordId);
      if (!rec) return res.status(404).json({ ok: false, error: 'Order not found' });
      if (rec.fields['Fulfilment status'] === register.FULFILMENT.DELIVERED) {
        return res.json({ ok: true, alreadyDelivered: true });
      }
      const approvedBy = clean((req.body || {}).approvedBy, 80) || 'NIVHA office';
      const docs = await register.documentsFor(recordId);
      if (!docs.length) return res.status(400).json({ ok: false, error: 'This order has no documents to send.' });

      /* Sign-off gate: nothing leaves until every shipped pack file in the
         order is signed off on /admin/signoff and the signed-off copy is
         stamp-free. Generated policy documents pass \u2014 they are tailored per
         order and covered by the approval click itself. */
      const pack = await fulfilment.packStatus();
      const byFile = new Map(pack.map(p => [p.file, p]));
      const problems = docs.map(d => {
        const p = byFile.get(d.filename);
        if (!p) return null;
        if (!p.signedOff) return `${d.filename} (not yet signed off)`;
        if (p.draftStamped) return `${d.filename} (still carries a draft stamp)`;
        return null;
      }).filter(Boolean);
      if (problems.length) {
        return res.status(409).json({
          ok: false, awaitingSignoff: true, blocked: problems,
          error: `Awaiting sign-off \u2014 ${problems.join(', ')}. Review and sign off each document on the sign-off page, then approve again.`
        });
      }

      const payload = JSON.parse(rec.fields['Answers JSON'] || '{}');
      const order = payload.order || {};
      const noteFor = filename => {
        const gen = /^Drug-and-alcohol-policy-/.test(filename);
        if (gen) return 'your tailored policy document';
        for (const specs of Object.values(fulfilment.PACK_FILES)) {
          const hit = specs.find(s => s.file === filename);
          if (hit) return hit.note;
        }
        return '';
      };
      /* Ship the effective pack files \u2014 if a draft copy was attached to the
         register before its document was signed off, the signed-off final
         replaces it here, so a buyer can never receive a draft. */
      const files = [];
      for (const d of docs) {
        let buffer = d.buffer;
        if (byFile.has(d.filename)) {
          const eff = await fulfilment.packFileBuffer(d.filename);
          if (eff) buffer = eff;
        }
        files.push({
          Name: d.filename,
          Content: buffer.toString('base64'),
          ContentType: d.contentType,
          Note: noteFor(d.filename)
        });
      }

      let portalUrl = '';
      if (rec.fields['Stripe subscription ID'] && !stripe.SIMULATED) {
        try {
          const sess = await stripe.getSession(rec.fields['Stripe session ID']);
          if (sess.customer) portalUrl = await stripe.billingPortalUrl({ customer: sess.customer, returnUrl: `${baseUrl}/policy` });
        } catch (e) { console.error('billing portal link failed (non-fatal):', e.message); }
      }

      const sent = await policyDeliveryEmail({
        baseUrl,
        to: rec.fields['Email'],
        orderRef: rec.fields['Order ref'] || '',
        organisation: rec.fields['Organisation'] || '',
        files,
        hasReview: !!order.hasReview,
        portalUrl,
        bcc: OFFICE_EMAIL
      });

      const existingIds = rec.fields['Postmark message IDs'] || '';
      await register.patchOrder(recordId, {
        'Fulfilment status': register.FULFILMENT.DELIVERED,
        'Approved by': approvedBy,
        'Delivered at': iso(new Date()),
        'Postmark message IDs': (existingIds ? existingIds + '\n' : '') + (sent.messageId || 'sent')
      });
      res.json({ ok: true, delivered: true, files: files.length, dryRun: !!sent.dryRun });
    } catch (err) {
      console.error('approve and send failed:', err.message);
      res.status(502).json({ ok: false, error: 'The documents could not be sent.' });
    }
  });

  app.post('/api/admin/policy/orders/:id/hold', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      if (!isRecordId(req.params.id)) return res.status(400).json({ ok: false, error: 'Bad record id' });
      const note = clean((req.body || {}).note, 2000) || 'Held for review by the office.';
      await addNote(req.params.id, `Held: ${note}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('hold failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not record the hold.' });
    }
  });

  app.get('/admin/fulfilment', (req, res) => {
    if (!guard(req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.type('html').send(adminPage(String(req.query.token || '')));
  });

  /* ---------------- document sign-off ---------------- */

  let notesCache = null;
  const packNotes = () => {
    if (!notesCache) {
      try { notesCache = JSON.parse(fs.readFileSync(path.join(fulfilment.PACK_DIR, 'notes.json'), 'utf8')); }
      catch (e) { console.error('could not read the pack notes:', e.message); notesCache = {}; }
    }
    return notesCache;
  };

  /* Page images for a document, in reading order. Rendered at build time \u2014
     images work in every browser where an embedded PDF does not. */
  function previewPages(file) {
    const dir = path.join(fulfilment.PACK_DIR, 'previews', 'pages', file.replace(/\.(docx|pptx)$/, ''));
    try {
      return fs.readdirSync(dir)
        .filter(f => /^page-\d+\.jpg$/.test(f))
        .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
    } catch (e) { return []; }
  }

  app.get('/api/admin/signoff/docs', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const notes = packNotes();
      const pack = await fulfilment.packStatus();
      res.json({
        ok: true,
        docs: pack.map(p => ({
          file: p.file, version: p.version, signedOff: p.signedOff,
          signedOffBy: p.signedOffBy, signedOffAt: p.signedOffAt,
          draftStamped: p.draftStamped, notes: notes[p.file] || null,
          pages: previewPages(p.file)
        }))
      });
    } catch (err) {
      console.error('GET /api/admin/signoff/docs failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not load the documents.' });
    }
  });

  app.post('/api/admin/signoff', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const filename = clean((req.body || {}).filename, 120);
      const name = clean((req.body || {}).signedOffBy, 80);
      if (!name) return res.status(400).json({ ok: false, error: 'A name is required \u2014 the register records who signed off.' });
      if (!signoffs.CURRENT_VERSIONS[filename]) return res.status(400).json({ ok: false, error: 'Not a shipped pack file.' });
      const rec = await signoffs.recordSignoff({ filename, name });
      res.json({ ok: true, filename, version: rec['Version'], signedOffBy: name });
    } catch (err) {
      console.error('POST /api/admin/signoff failed:', err.message);
      res.status(502).json({ ok: false, error: 'The sign-off could not be recorded.' });
    }
  });

  /* Previews are pre-rendered PDFs of the version that would ship after
     sign-off \u2014 the reviewer reads exactly what a buyer would receive. */
  app.get('/admin/signoff/preview/:file', (req, res) => {
    if (!guard(req, res)) return;
    const file = String(req.params.file || '');
    if (!signoffs.CURRENT_VERSIONS[file]) return res.status(404).send('Not found');
    const pdf = path.join(fulfilment.PACK_DIR, 'previews', file.replace(/\.(docx|pptx)$/, '.pdf'));
    if (!fs.existsSync(pdf)) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.set('Cache-Control', 'no-store');
    res.send(fs.readFileSync(pdf));
  });

  app.get('/admin/signoff/preview-page/:file/:page', (req, res) => {
    if (!guard(req, res)) return;
    const file = String(req.params.file || '');
    const page = String(req.params.page || '');
    if (!signoffs.CURRENT_VERSIONS[file] || !/^page-\d+\.jpg$/.test(page)) return res.status(404).send('Not found');
    const img = path.join(fulfilment.PACK_DIR, 'previews', 'pages', file.replace(/\.(docx|pptx)$/, ''), page);
    if (!fs.existsSync(img)) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(fs.readFileSync(img));
  });

  app.get('/admin/signoff', (req, res) => {
    if (!guard(req, res)) return;
    res.set('Cache-Control', 'no-store');
    res.type('html').send(signoffPage(String(req.query.token || '')));
  });

  app.get('/admin', async (req, res) => {
    if (!guard(req, res)) return;
    res.set('Cache-Control', 'no-store');
    let signed = 0, total = 0, awaiting = null;
    try {
      const pack = await fulfilment.packStatus();
      total = pack.length;
      signed = pack.filter(p => p.signedOff && !p.draftStamped).length;
    } catch (e) { /* cards degrade to em dashes */ total = 0; }
    try {
      const rows = await register.listByFulfilment(register.FULFILMENT.AWAITING);
      awaiting = rows.length;
    } catch (e) { awaiting = null; }
    res.type('html').send(adminHomePage(String(req.query.token || ''), { signed, total, awaiting }));
  });

  return { markPolicyPaid, runFulfilment };
}

/* Plain, functional page — Atlas takes the real interface later. */
function adminPage(token) {
  const t = escHtml(token);
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Policy fulfilment</title>
<style>
 body{font-family:'Open Sans',Arial,sans-serif;color:#2c2d2f;background:#f4f6f7;margin:0;padding:28px;line-height:1.55}
 h1{font-size:22px;margin:0 0 4px} p.lede{color:#5d6467;margin:0 0 22px;font-size:14px}
 .order{background:#fff;border:1px solid #dfe6e9;border-radius:8px;padding:18px 20px;margin:0 0 16px;max-width:860px}
 .ref{font-weight:700} .meta{color:#5d6467;font-size:13px;margin:2px 0 10px}
 ul{margin:6px 0 12px;padding-left:20px;font-size:14px}
 button{font:inherit;padding:9px 16px;border-radius:6px;border:1px solid #2a8ba3;background:#2a8ba3;color:#fff;cursor:pointer}
 button.ghost{background:#fff;color:#2a8ba3}
 .blocked{background:#fdf3e7;border:1px solid #e8c496;padding:10px 12px;border-radius:6px;font-size:13px;margin:0 0 12px}
 .msg{font-size:13px;margin:10px 0 0;color:#1d6478} .empty{color:#5d6467}
 a{color:#1d6478}
</style></head><body>
<p style="margin:0 0 10px;font-size:13px"><a href="/admin?token=${t}">\u2039 Admin home</a></p>
<h1>Policy fulfilment</h1>
<p class="lede">Orders waiting on approval. Check the documents, then approve and send \u2014 the buyer receives them by email and the register is updated.</p>
<div id="list"><p class="empty">Loading orders\u2026</p></div>
<script>
 var TOKEN = ${JSON.stringify(token)};
 var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
 function api(path, opts) {
   opts = opts || {};
   opts.headers = Object.assign({ 'x-admin-token': TOKEN, 'Content-Type': 'application/json' }, opts.headers || {});
   return fetch(path, opts).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Unexpected response' }; }); });
 }
 function load() {
   api('/api/admin/policy/orders').then(function (d) {
     var el = document.getElementById('list');
     if (!d.ok) { el.innerHTML = '<p class="empty">Could not load the orders.</p>'; return; }
     if (!d.orders.length) { el.innerHTML = '<p class="empty">No orders are waiting for approval.</p>'; return; }
     el.innerHTML = d.orders.map(function (o) {
       var docs = o.documents.map(function (doc) {
         return '<li><a href="/api/admin/policy/orders/' + o.id + '/documents/' + doc.index + '?token=' + encodeURIComponent(TOKEN) + '">' + esc(doc.filename) + '</a></li>';
       }).join('');
       return '<div class="order" id="o-' + o.id + '">' +
         '<div class="ref">' + esc(o.orderRef) + ' \\u00b7 ' + esc(o.organisation) + '</div>' +
         '<p class="meta">' + esc(o.contact) + ' &lt;' + esc(o.email) + '&gt; \\u00b7 ' + esc(o.paymentMethod) + ' \\u00b7 ' + esc(o.status) + ' \\u00b7 \\u00a3' + Number(o.total || 0).toFixed(2) + '<br>' +
         esc((o.items || []).join(', ')) + ' \\u00b7 ' + esc((o.jurisdictions || []).join(', ')) + '</p>' +
         (o.blocked && o.blocked.length ? '<div class="blocked">Awaiting sign-off \\u2014 ' + esc(o.blocked.join(', ')) + '. <a href="/admin/signoff?token=' + encodeURIComponent(TOKEN) + '">Review and sign off each document</a>, then approve here.</div>' : '') +
         '<ul>' + docs + '</ul>' +
         '<button data-approve="' + o.id + '">Approve and send</button> ' +
         '<button class="ghost" data-hold="' + o.id + '">Hold</button>' +
         '<p class="msg" id="m-' + o.id + '"></p></div>';
     }).join('');
     el.querySelectorAll('[data-approve]').forEach(function (b) {
       b.addEventListener('click', function () {
         var id = b.getAttribute('data-approve');
         var who = prompt('Approved by (your name)') || '';
         if (!who) return;
         b.disabled = true;
         api('/api/admin/policy/orders/' + id + '/approve', { method: 'POST', body: JSON.stringify({ approvedBy: who }) })
           .then(function (r) {
             document.getElementById('m-' + id).textContent = r.ok ? 'Sent \\u2014 the register is updated.' : (r.error || 'Could not send.');
             if (r.ok) setTimeout(load, 900);
             else b.disabled = false;
           });
       });
     });
     el.querySelectorAll('[data-hold]').forEach(function (b) {
       b.addEventListener('click', function () {
         var id = b.getAttribute('data-hold');
         var note = prompt('Why is this order on hold?') || '';
         if (!note) return;
         api('/api/admin/policy/orders/' + id + '/hold', { method: 'POST', body: JSON.stringify({ note: note }) })
           .then(function (r) { document.getElementById('m-' + id).textContent = r.ok ? 'Hold recorded in the register notes.' : (r.error || 'Could not record the hold.'); });
       });
     });
   });
 }
 load();
</script>
</body></html>`;
}

/* The document sign-off page — one card per shipped pack file, with the
   preview, the reviewer notes (what is written and why), and a sign-off
   button that records who approved it in the register. */
function signoffPage(token) {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Document sign-off</title>
<style>
 body{font-family:'Open Sans',Arial,sans-serif;color:#2c2d2f;background:#f4f6f7;margin:0;padding:28px;line-height:1.55}
 h1{font-size:22px;margin:0 0 4px} p.lede{color:#5d6467;margin:0 0 22px;font-size:14px;max-width:860px}
 .doc{background:#fff;border:1px solid #dfe6e9;border-radius:8px;padding:22px;margin:0 0 26px;max-width:1360px;display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:24px;align-items:start}
 .preview{min-width:0}
 .notes{min-width:0}
 .t{font-weight:700;font-size:17px} .file{color:#5d6467;font-size:12px;font-family:ui-monospace,monospace;margin:2px 0 0}
 .chip{display:inline-block;font-size:12px;padding:3px 10px;border-radius:999px;margin-left:8px;vertical-align:middle;white-space:nowrap}
 .chip.ok{background:#e7f4ec;color:#1e6b3a;border:1px solid #b9dcc6}
 .chip.wait{background:#fdf3e7;color:#8a5a1d;border:1px solid #e8c496}
 .role{font-size:13px;color:#5d6467;margin:8px 0 2px}
 h3{font-size:13px;margin:16px 0 4px;color:#1d6478}
 ul{margin:4px 0 8px;padding-left:20px;font-size:13.5px} li{margin:0 0 5px}
 .pane{height:82vh;min-height:560px;overflow-y:auto;border:1px solid #dfe6e9;border-radius:6px;background:#e9edef;padding:14px}
 .pane img{width:100%;display:block;margin:0 auto 14px;box-shadow:0 1px 4px rgba(44,45,47,.18);background:#fff}
 .pane img:last-child{margin-bottom:0}
 .pdflink{font-size:12.5px;margin:8px 0 0;color:#5d6467}
 .signrow{margin-top:16px;padding-top:16px;border-top:1px solid #eef2f4}
 input[type=text]{font:inherit;padding:8px 10px;border:1px solid #c6d0d4;border-radius:6px;width:100%;max-width:260px;box-sizing:border-box;margin-bottom:8px;display:block}
 button{font:inherit;padding:9px 16px;border-radius:6px;border:1px solid #2a8ba3;background:#2a8ba3;color:#fff;cursor:pointer}
 button:disabled{opacity:.5;cursor:default}
 .signed{font-size:13.5px;color:#1e6b3a}
 .msg{font-size:13px;margin:8px 0 0;color:#1d6478}
 .warn{font-size:12.5px;color:#8a5a1d;margin:8px 0 0}
 a{color:#1d6478}
 @media (max-width:1000px){.doc{grid-template-columns:1fr}.notes{order:-1}.pane{height:70vh}}
</style></head><body>
<p style="margin:0 0 10px;font-size:13px"><a href="/admin?token=${encodeURIComponent(token)}">\u2039 Admin home</a></p>
<h1>Document sign-off</h1>
<p class="lede">These are the standard documents that ship with policy orders. Each one is shown in full, exactly as a buyer receives it, with the reviewer notes beside it \u2014 what is written, why, and what to check. Scan the document, scan the notes, sign it off. A document is only ever emailed to a buyer after it is signed off here, and the register records who approved each version. <a href="/admin/fulfilment?token=${encodeURIComponent(token)}">Back to the fulfilment queue</a>.</p>
<div id="list"><p>Loading documents\u2026</p></div>
<script>
 var TOKEN = ${JSON.stringify(token)};
 var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
 function api(path, opts) {
   opts = opts || {};
   opts.headers = Object.assign({ 'x-admin-token': TOKEN, 'Content-Type': 'application/json' }, opts.headers || {});
   return fetch(path, opts).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Unexpected response' }; }); });
 }
 function section(title, items) {
   if (!items || !items.length) return '';
   return '<h3>' + esc(title) + '</h3><ul>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
 }
 function load() {
   api('/api/admin/signoff/docs').then(function (d) {
     var el = document.getElementById('list');
     if (!d.ok) { el.innerHTML = '<p>Could not load the documents.</p>'; return; }
     el.innerHTML = d.docs.map(function (doc) {
       var n = doc.notes || {};
       var chip = doc.signedOff
         ? '<span class="chip ok">Signed off by ' + esc(doc.signedOffBy) + (doc.signedOffAt ? ' \\u00b7 ' + esc(String(doc.signedOffAt).slice(0, 10)) : '') + '</span>'
         : '<span class="chip wait">Awaiting sign-off</span>';
       var sign = doc.signedOff
         ? '<p class="signed">This version is released \\u2014 buyers receive the issued document.</p>'
         : '<input type="text" id="n-' + esc(doc.file) + '" placeholder="Your name" autocomplete="name"> ' +
           '<button data-sign="' + esc(doc.file) + '">Sign off this document</button>' +
           '<p class="warn">Signing off releases this version for delivery in live orders. It is recorded in the register with your name, the version and the time.</p>';
       return '<div class="doc">' +
         '<div class="preview"><div class="pane">' +
           (doc.pages || []).map(function (pg, i) {
             return '<img src="/admin/signoff/preview-page/' + encodeURIComponent(doc.file) + '/' + encodeURIComponent(pg) + '?token=' + encodeURIComponent(TOKEN) + '" alt="Page ' + (i + 1) + '" loading="lazy">';
           }).join('') +
         '</div>' +
         '<p class="pdflink">' + (doc.pages || []).length + ' page' + ((doc.pages || []).length === 1 ? '' : 's') + ' \\u00b7 <a href="/admin/signoff/preview/' + encodeURIComponent(doc.file) + '?token=' + encodeURIComponent(TOKEN) + '" target="_blank" rel="noopener">open as PDF</a></p></div>' +
         '<div class="notes">' +
           '<span class="t">' + esc(n.title || doc.file) + '</span>' + chip +
           '<div class="file">' + esc(doc.file) + ' \\u00b7 ' + esc(n.issued || doc.version) + '</div>' +
           (n.role ? '<p class="role">' + esc(n.role) + '</p>' : '') +
           section('What is in it', n.summary) +
           section('Why it is written this way', n.decisions) +
           section('Before you sign', n.checks) +
           '<div class="signrow">' + sign + '<p class="msg" id="m-' + esc(doc.file) + '"></p></div>' +
         '</div>' +
         '</div>';
     }).join('');
     el.querySelectorAll('[data-sign]').forEach(function (b) {
       b.addEventListener('click', function () {
         var file = b.getAttribute('data-sign');
         var input = document.getElementById('n-' + file);
         var who = (input && input.value || '').trim();
         var msg = document.getElementById('m-' + file);
         if (!who) { msg.textContent = 'Enter your name first \\u2014 the register records who signed off.'; return; }
         if (!confirm('Sign off ' + file + '? Buyers will receive this version from now on.')) return;
         b.disabled = true;
         api('/api/admin/signoff', { method: 'POST', body: JSON.stringify({ filename: file, signedOffBy: who }) })
           .then(function (r) {
             if (r.ok) { msg.textContent = 'Signed off.'; setTimeout(load, 700); }
             else { msg.textContent = r.error || 'Could not record the sign-off.'; b.disabled = false; }
           });
       });
     });
   });
 }
 load();
</script>
</body></html>`;
}

/* One place to start: two cards, live counts, links through to the two working pages. */
function adminHomePage(token, data) {
  const t = escHtml(token);
  const docsValue = data.total ? `${data.signed} of ${data.total}` : '\u2014';
  const docsNote = data.total
    ? (data.signed === data.total ? 'All documents signed off.' : `${data.total - data.signed} still to sign off.`)
    : 'Counts unavailable \u2014 open the page to check.';
  const ordersValue = data.awaiting === null ? '\u2014' : String(data.awaiting);
  const ordersNote = data.awaiting === null
    ? 'Counts unavailable \u2014 open the page to check.'
    : (data.awaiting === 0 ? 'Nothing waiting on approval.' : `Waiting on approval \u2014 buyers receive their pack once approved.`);
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>NIVHA admin</title>
<style>
 body{font-family:'Open Sans',Arial,sans-serif;color:#2c2d2f;background:#f4f6f7;margin:0;padding:28px;line-height:1.55}
 h1{font-size:22px;margin:0 0 4px} p.lede{color:#5d6467;margin:0 0 22px;font-size:14px;max-width:640px}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;max-width:720px}
 a.card{display:block;background:#fff;border:1px solid #dfe6e9;border-radius:8px;padding:20px 22px;text-decoration:none;color:inherit}
 a.card:hover{border-color:#2a8ba3}
 .card h2{font-size:15px;margin:0 0 10px;color:#1d6478}
 .num{font-size:34px;font-weight:700;color:#2c2d2f;line-height:1.1}
 .note{color:#5d6467;font-size:13px;margin-top:8px}
 .go{display:inline-block;margin-top:14px;font-size:13px;color:#1d6478;font-weight:600}
</style></head><body>
<h1>NIVHA admin</h1>
<p class="lede">The working screens for the policy builder while this lives outside Atlas. Documents first \u2014 orders can only be approved once every document in them is signed off.</p>
<div class="cards">
 <a class="card" href="/admin/signoff?token=${t}">
  <h2>Documents</h2>
  <div class="num">${escHtml(docsValue)}</div>
  <div class="note">${docsNote} Review each document and record who signed it off.</div>
  <span class="go">Open document sign-off</span>
 </a>
 <a class="card" href="/admin/fulfilment?token=${t}">
  <h2>Orders</h2>
  <div class="num">${escHtml(ordersValue)}</div>
  <div class="note">${ordersNote}</div>
  <span class="go">Open order approval</span>
 </a>
</div>
</body></html>`;
}

module.exports = {
  mount, markPolicyPaid, runFulfilment, adminOk, ADMIN_TOKEN, OFFICE_EMAIL,
  cardPaymentsEnabled
};
