/* NIVHA Fee Note platform v2 — API skeleton
 * Serves the static wizard and writes fee notes / leads to Airtable.
 * Runs in dry-run mode (no records written) until AIRTABLE_PAT is set.
 */
'use strict';

const express = require('express');
const path = require('path');

const app = express();
/* Keep the raw body for Stripe webhook signature verification. */
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

/* ---------------- config ---------------- */
const PAT = process.env.AIRTABLE_PAT || '';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appSr0GuDnDK0bdfy';
const FEE_TABLE = process.env.AIRTABLE_FEE_TABLE_ID || 'tblg5dALJogJxLL4j';   // LegalSocial_FeeNote_v2
const LEADS_TABLE = process.env.AIRTABLE_LEADS_TABLE_ID || 'tbl91O7LF3iezIKv2'; // LegalSocial_Leads
const AT_URL = 'https://api.airtable.com/v0';
const DRY_RUN = !PAT;
const dryCounters = { CCN: 999, PCN: 999 }; // dry-run references count up from 1000 per process

const crypto = require('crypto');
const { gateEmail, bookLaterEmail, EMAIL_DRY_RUN } = require('./lib/email');
const pricing = require('./lib/pricing');
const stripe = require('./lib/stripe');
const acuity = require('./lib/acuity');
const BASE_URL = (process.env.APP_BASE_URL || 'https://nivha-feenote-prototype-production.up.railway.app').replace(/\/$/, '');
const BOOK_EMAIL_DELAY_MS = Number(process.env.BOOK_EMAIL_DELAY_MS || 15 * 60 * 1000);

/* ---------------- airtable helper ---------------- */
async function at(method, pathPart, body) {
  const res = await fetch(`${AT_URL}/${BASE_ID}/${pathPart}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Airtable ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/* Next reference. Conventions: CCN (client case number) for trust and
   solicitor instructions, PCN (private case number) for private clients,
   both starting at 1000. DNA casework will use a DNA prefix when built.
   Scan existing references for the prefix, take max + 1 (pilot volumes). */
async function nextReference(route) {
  const prefix = route === 'private' ? 'PCN' : 'CCN';
  if (DRY_RUN) return `${prefix}-${++dryCounters[prefix]}`;
  let max = 999;
  let offset;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    q.append('fields[]', 'Reference');
    if (offset) q.set('offset', offset);
    const data = await at('GET', `${FEE_TABLE}?${q}`);
    for (const r of data.records) {
      const m = re.exec((r.fields && r.fields.Reference) || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    offset = data.offset;
  } while (offset);
  return `${prefix}-${max + 1}`;
}

/* ---------------- mapping ---------------- */
const ROUTE_MAP = { solicitor: 'Solicitor', trust: 'Trust', private: 'Private' };
const LOCATION_MAP = { belfast: 'Belfast', derry: 'Derry~Londonderry', onsite: 'On-site' };

function feeNoteFields(p, reference) {
  const d = p.details || {};
  const status = p.route === 'private' ? 'Awaiting payment' : 'New';
  const fields = {
    'Reference': reference,
    'Status': status,
    'Route': ROUTE_MAP[p.route] || null,
    'Location': LOCATION_MAP[p.location] || null,
    'Turnaround': p.fastTrack ? 'Fast track' : 'Standard',
    'Organisation': d.org || '',
    'Org address': d.orgAddress || '',
    'Org town': d.orgTown || '',
    'Org postcode': d.orgPostcode || '',
    'Case / PO reference': d.caseref || '',
    'Legal Aid reference': d.legalAidRef || '',
    'Cost centre': d.costCentre || '',
    'Approver name': d.approverName || '',
    'Authoriser name': d.authoriserName || '',
    'Contact name': d.contactName || '',
    'Contact email': d.contactEmail || '',
    'Contact phone': d.contactPhone || '',
    'Donor name': d.donorName || (p.route === 'private' && d.contactName ? d.contactName : ''),
    'Panel summary': p.panelSummary || '',
    'Panels JSON': JSON.stringify(p.panels || [], null, 2),
    'Subtotal': round2(p.totals && p.totals.net),
    'VAT': round2(p.totals && p.totals.vat),
    'Total': round2(p.totals && p.totals.total),
    'Needs price review': Boolean(p.needsPriceReview),
    'Chase emails sent': 0,
    'Source system': 'v2',
    'Submitted at': new Date().toISOString()
  };
  if (d.donorDob && /^\d{4}-\d{2}-\d{2}$/.test(d.donorDob)) fields['Donor DOB'] = d.donorDob;
  if (p.acceptance && p.acceptance.declaration) {
    const a = p.acceptance;
    const bits = ['Declaration ticked — details correct, authorised to instruct.'];
    if (a.dataSharingTermsVersion) {
      bits.push(`Data Sharing Terms accepted (click-wrap) — ${a.dataSharingTermsVersion} — /data-sharing-terms`);
    }
    if (a.explicitConsent) {
      bits.push('Explicit consent given to processing of personal information, including special category (health) data — UK/EU GDPR Art 9(2)(a). Withdrawal possible before analysis begins.');
    }
    bits.push(`Accepted by: ${d.contactName || 'unknown'} <${d.contactEmail || ''}>`);
    if (a.acceptedAt) bits.push(`Accepted at (client): ${a.acceptedAt}`);
    bits.push(`Recorded at (server): ${new Date().toISOString()}`);
    fields['Acceptance record'] = bits.join('\n');
  }
  return fields;
}

const round2 = n => (typeof n === 'number' && isFinite(n) ? Math.round(n * 100) / 100 : 0);
const escapeFormula = s => String(s).replace(/'/g, "\\'");

/* ---------------- routes ---------------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: DRY_RUN ? 'dry-run' : 'live' });
});

/* Lead upsert by email -> LegalSocial_Leads */
async function upsertLead(email, source) {
  const now = new Date().toISOString();
  if (DRY_RUN) return { dryRun: true };
  const q = new URLSearchParams({
    filterByFormula: `LOWER({Email})='${escapeFormula(email)}'`,
    pageSize: '1'
  });
  const found = await at('GET', `${LEADS_TABLE}?${q}`);
  if (found.records.length) {
    const rec = found.records[0];
    const count = (rec.fields['Links requested'] || 0) + 1;
    await at('PATCH', LEADS_TABLE, {
      records: [{ id: rec.id, fields: { 'Last link sent': now, 'Links requested': count } }]
    });
    return { recordId: rec.id, returning: true };
  }
  const created = await at('POST', LEADS_TABLE, {
    records: [{
      fields: {
        'Email': email,
        'First seen': now,
        'Last link sent': now,
        'Links requested': 1,
        'Source': String(source || 'fee-note gate').slice(0, 100)
      }
    }]
  });
  return { recordId: created.records[0].id, returning: false };
}

/* Gate email capture -> LegalSocial_Leads (upsert by email) */
app.post('/api/leads', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'A valid email is required' });
    }
    const out = await upsertLead(email, req.body.source);
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error('POST /api/leads failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not record the email' });
  }
});

/* ---------------- landing gate: sign-in codes and magic links ----------------
   In-memory store, 24 h validity. Fine for the pilot on a single Railway
   instance; codes are reissued on request so a restart is not disruptive. */
const gateByEmail = new Map(); // email -> { code, token, expires, attempts }
const gateByToken = new Map(); // token -> email

function issueGate(email) {
  const prev = gateByEmail.get(email);
  if (prev) gateByToken.delete(prev.token);
  const entry = {
    code: String(crypto.randomInt(100000, 1000000)),
    token: crypto.randomBytes(24).toString('base64url'),
    expires: Date.now() + 24 * 60 * 60 * 1000,
    attempts: 0
  };
  gateByEmail.set(email, entry);
  gateByToken.set(entry.token, email);
  return entry;
}

app.post('/api/gate/request', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'A valid email is required' });
    }
    const entry = issueGate(email);
    upsertLead(email, 'fee-note gate').catch(err => console.error('lead upsert failed:', err.message));
    await gateEmail({
      baseUrl: BASE_URL,
      to: email,
      code: entry.code,
      link: `${BASE_URL}/?gate=${entry.token}`
    });
    /* devCode keeps the walkthrough usable until POSTMARK_TOKEN is set */
    res.json({ ok: true, emailDryRun: EMAIL_DRY_RUN, devCode: EMAIL_DRY_RUN ? entry.code : undefined });
  } catch (err) {
    console.error('POST /api/gate/request failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not send the email' });
  }
});

app.post('/api/gate/verify', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const entry = gateByEmail.get(email);
  if (!entry || Date.now() > entry.expires) {
    return res.status(410).json({ ok: false, error: 'Code expired — request a new one' });
  }
  entry.attempts += 1;
  if (entry.attempts > 6) {
    return res.status(429).json({ ok: false, error: 'Too many attempts — request a new code' });
  }
  if (code !== entry.code) {
    return res.status(401).json({ ok: false, error: 'That code does not match' });
  }
  res.json({ ok: true, email });
});

app.get('/api/gate/session/:token', (req, res) => {
  const email = gateByToken.get(req.params.token);
  const entry = email && gateByEmail.get(email);
  if (!entry || Date.now() > entry.expires) {
    return res.status(410).json({ ok: false, error: 'Link expired — request a new one' });
  }
  res.json({ ok: true, email });
});

/* Book-later nudge: after a delay, if the fee note still has no booking,
   email a secure link so the appointment can be made later. */
function scheduleBookLater(recordId) {
  if (DRY_RUN || !recordId) return;
  setTimeout(async () => {
    try {
      const rec = await at('GET', `${FEE_TABLE}/${recordId}`);
      const f = rec.fields || {};
      const status = f['Status'] || '';
      if (['Booked', 'On-site requested', 'Booking requested'].includes(status)) return;
      if (f['Route'] === 'Private' && status !== 'Paid') return; // pay first, then nudge
      const email = (f['Contact email'] || '').trim().toLowerCase();
      if (!email) return;
      const entry = issueGate(email);
      await bookLaterEmail({
        baseUrl: BASE_URL,
        to: email,
        reference: f['Reference'] || '',
        isPrivate: f['Route'] === 'Private',
        link: `${BASE_URL}/?gate=${entry.token}`
      });
      await at('PATCH', FEE_TABLE, {
        records: [{ id: recordId, fields: { 'Chase emails sent': (f['Chase emails sent'] || 0) + 1 } }],
        typecast: true
      });
      console.log(`book-later email sent for ${f['Reference']} (${recordId})`);
    } catch (err) {
      console.error('book-later check failed:', err.message);
    }
  }, BOOK_EMAIL_DELAY_MS);
}

/* Wizard submission -> LegalSocial_FeeNote_v2 */
app.post('/api/fee-notes', async (req, res) => {
  try {
    const p = req.body || {};
    if (!ROUTE_MAP[p.route]) return res.status(400).json({ ok: false, error: 'Unknown route' });
    if (!LOCATION_MAP[p.location]) return res.status(400).json({ ok: false, error: 'Unknown location' });
    if (!p.details || !p.details.contactEmail) {
      return res.status(400).json({ ok: false, error: 'Contact email is required' });
    }
    if (!Array.isArray(p.panels) || p.panels.length === 0) {
      return res.status(400).json({ ok: false, error: 'At least one panel is required' });
    }

    /* Authoritative pricing — recompute from the raw basket and overwrite
       whatever totals the browser sent. Private fee notes are charged by
       card, so they must be priceable server-side. */
    const serverTotals = pricing.computeTotals({ basket: p.basket, fastTrack: !!p.fastTrack, location: p.location });
    if (serverTotals) {
      if (p.totals && Math.abs((Number(p.totals.total) || 0) - serverTotals.total) > 0.01) {
        console.warn(`totals mismatch — client £${p.totals.total} vs server £${serverTotals.total}; server wins`);
        p.needsPriceReview = true;
      }
      p.totals = { net: serverTotals.net, vat: serverTotals.vat, total: serverTotals.total };
    } else if (p.route === 'private') {
      return res.status(400).json({ ok: false, error: 'Could not price the fee note' });
    }

    const reference = await nextReference(p.route);
    if (DRY_RUN) {
      console.log(`[dry-run] fee note ${reference}:`, JSON.stringify(feeNoteFields(p, reference)));
      return res.json({ ok: true, reference, recordId: null, dryRun: true });
    }

    const created = await at('POST', FEE_TABLE, {
      records: [{ fields: feeNoteFields(p, reference) }],
      typecast: true
    });
    const recordId = created.records[0].id;

    // Link the lead if the gate email matches an existing lead record
    const leadEmail = String(p.leadEmail || '').trim().toLowerCase();
    if (leadEmail) {
      try {
        const q = new URLSearchParams({
          filterByFormula: `LOWER({Email})='${escapeFormula(leadEmail)}'`,
          pageSize: '1'
        });
        const found = await at('GET', `${LEADS_TABLE}?${q}`);
        if (found.records.length) {
          await at('PATCH', FEE_TABLE, {
            records: [{ id: recordId, fields: { 'Lead': [found.records[0].id] } }]
          });
        }
      } catch (e) {
        console.error('Lead linking failed (non-fatal):', e.message);
      }
    }

    // Trust/solicitor routes can book straight away; nudge later if they don't.
    // Private waits for payment — the nudge is scheduled on the 'paid' event instead.
    if (p.route !== 'private') scheduleBookLater(recordId);

    res.json({ ok: true, reference, recordId });
  } catch (err) {
    console.error('POST /api/fee-notes failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not create the fee note' });
  }
});

/* ---------------- payment (Stripe Checkout) ----------------
 * Amounts are always computed server-side: from the stored Airtable record
 * when live, or from the raw basket via lib/pricing when in dry run. With no
 * STRIPE_SECRET_KEY the client falls back to the simulated card form. */
app.post('/api/checkout', async (req, res) => {
  try {
    const b = req.body || {};
    let amount = null, reference = '', email = '', recordId = null;

    if (!DRY_RUN && b.recordId && /^rec[A-Za-z0-9]{14}$/.test(b.recordId)) {
      const rec = await at('GET', `${FEE_TABLE}/${b.recordId}`);
      const f = rec.fields || {};
      if (f['Route'] !== 'Private') return res.status(400).json({ ok: false, error: 'Only private fee notes are paid by card' });
      if (f['Status'] === 'Paid' || f['Status'] === 'Booked') return res.json({ ok: true, alreadyPaid: true, reference: f['Reference'] });
      amount = Number(f['Total']);
      reference = f['Reference'] || '';
      email = (f['Contact email'] || '').trim();
      recordId = b.recordId;
    } else {
      /* Dry run — price the raw basket with the shared catalogue. */
      const t = pricing.computeTotals({ basket: b.basket, fastTrack: !!b.fastTrack, location: b.location });
      if (!t) return res.status(400).json({ ok: false, error: 'Could not price the fee note' });
      amount = t.total;
      reference = String(b.reference || '').slice(0, 20);
      email = String(b.email || '').trim();
    }

    if (!(amount > 0) || !reference) return res.status(400).json({ ok: false, error: 'Nothing to pay' });
    if (stripe.SIMULATED) return res.json({ ok: true, simulated: true });

    const session = await stripe.createCheckoutSession({
      baseUrl: BASE_URL,
      reference,
      amountPence: Math.round(amount * 100),
      email,
      recordId
    });
    res.json({ ok: true, url: session.url });
  } catch (err) {
    console.error('POST /api/checkout failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not start the payment' });
  }
});

/* Mark a fee note paid in Airtable (idempotent) and start the book-later nudge. */
async function markPaid(recordId, paymentId) {
  if (DRY_RUN || !recordId) return;
  const rec = await at('GET', `${FEE_TABLE}/${recordId}`);
  const f = rec.fields || {};
  if (f['Status'] === 'Paid' || f['Status'] === 'Booked') return;
  await at('PATCH', FEE_TABLE, {
    records: [{ id: recordId, fields: {
      'Status': 'Paid',
      'Paid at': new Date().toISOString(),
      'Stripe payment ID': String(paymentId || '').slice(0, 100)
    } }],
    typecast: true
  });
  scheduleBookLater(recordId);
}

/* The browser returns from Stripe with ?paid=1&sid=... — confirm server-side. */
app.get('/api/checkout/confirm', async (req, res) => {
  try {
    if (stripe.SIMULATED) return res.status(400).json({ ok: false, error: 'Payments are simulated in this environment' });
    const sid = String(req.query.session_id || '');
    if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ ok: false, error: 'Bad session id' });
    const session = await stripe.getSession(sid);
    if (session.payment_status !== 'paid') return res.json({ ok: true, paid: false });
    const meta = session.metadata || {};
    await markPaid(meta.recordId, session.payment_intent);
    res.json({
      ok: true,
      paid: true,
      reference: meta.reference || session.client_reference_id || '',
      amount: (session.amount_total || 0) / 100,
      receipt: String(session.payment_intent || sid)
    });
  } catch (err) {
    console.error('GET /api/checkout/confirm failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not confirm the payment' });
  }
});

/* Stripe webhook — the authoritative 'paid' signal (survives closed tabs). */
app.post('/api/stripe/webhook', async (req, res) => {
  try {
    if (!stripe.WEBHOOK_SECRET) return res.status(503).json({ ok: false, error: 'Webhook secret not configured' });
    if (!stripe.verifyWebhook(req.rawBody, req.headers['stripe-signature'])) {
      return res.status(400).json({ ok: false, error: 'Bad signature' });
    }
    const event = req.body || {};
    if (event.type === 'checkout.session.completed') {
      const session = (event.data && event.data.object) || {};
      if (session.payment_status === 'paid') {
        const meta = session.metadata || {};
        await markPaid(meta.recordId, session.payment_intent);
        console.log(`stripe: fee note ${meta.reference || '?'} paid (${session.payment_intent})`);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('POST /api/stripe/webhook failed:', err.message);
    res.status(500).json({ ok: false });
  }
});

/* Post-submission status events (simulated pay / booking in the prototype;
 * the simulated 'paid' path is ignored once Stripe is configured). */
app.patch('/api/fee-notes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ ok: false, error: 'Bad record id' });
    const { event } = req.body || {};
    const now = new Date().toISOString();
    let fields;

    if (event === 'paid') {
      if (!stripe.SIMULATED) return res.status(400).json({ ok: false, error: 'Payments are confirmed by Stripe' });
      fields = {
        'Status': 'Paid',
        'Paid at': now,
        'Stripe payment ID': 'SIMULATED — prototype'
      };
    } else if (event === 'booked') {
      fields = {
        'Status': 'Booked',
        'Acuity appointment ID': 'SIMULATED — prototype'
      };
      if (req.body.appointmentAt) fields['Appointment at'] = req.body.appointmentAt;
    } else if (event === 'onsite-request') {
      fields = {
        'Status': 'On-site requested',
        'On-site request detail': String(req.body.detail || '').slice(0, 5000)
      };
    } else {
      return res.status(400).json({ ok: false, error: 'Unknown event' });
    }

    if (DRY_RUN) {
      console.log(`[dry-run] ${event} on ${id}:`, JSON.stringify(fields));
      return res.json({ ok: true, dryRun: true });
    }
    await at('PATCH', FEE_TABLE, { records: [{ id, fields }], typecast: true });
    if (event === 'paid') scheduleBookLater(id); // private route: paid, not yet booked
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/fee-notes failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not update the fee note' });
  }
});

/* ---------------- booking — Belfast calendar via Acuity, Derry by request ---------------- */

/* One-off helper: list appointment types so ACUITY_TYPE_BELFAST can be set. */
app.get('/api/booking/types', async (req, res) => {
  if (acuity.SIMULATED) return res.json({ ok: true, simulated: true });
  try {
    const types = await acuity.getTypes();
    res.json({ ok: true, configuredType: acuity.TYPE_BELFAST || null,
      types: types.map(t => ({ id: t.id, name: t.name, duration: t.duration, active: t.active, private: t.private })) });
  } catch (err) {
    console.error('GET /api/booking/types failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not reach the booking calendar' });
  }
});

app.get('/api/booking/dates', async (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ ok: false, error: 'Bad month' });
  if (acuity.SIMULATED || !acuity.TYPE_BELFAST) return res.json({ ok: true, simulated: true });
  try {
    const dates = await acuity.getDates(month);
    res.json({ ok: true, dates: dates.map(d => d.date) });
  } catch (err) {
    console.error('GET /api/booking/dates failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not load availability' });
  }
});

app.get('/api/booking/times', async (req, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'Bad date' });
  if (acuity.SIMULATED || !acuity.TYPE_BELFAST) return res.json({ ok: true, simulated: true });
  try {
    const times = await acuity.getTimes(date);
    res.json({ ok: true, times: times.map(t => ({ iso: t.time, label: t.time.slice(11, 16) })) });
  } catch (err) {
    console.error('GET /api/booking/times failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not load times' });
  }
});

/* Confirm a Belfast appointment. Live mode creates it in Acuity; simulated
   mode records the choice against the fee note exactly as before. */
app.post('/api/booking/confirm', async (req, res) => {
  try {
    const { recordId, datetime, label } = req.body || {};
    if (!datetime || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(datetime))) {
      return res.status(400).json({ ok: false, error: 'Bad datetime' });
    }
    if (!recordId) return res.json({ ok: true, offline: true });
    if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) return res.status(400).json({ ok: false, error: 'Bad record id' });

    if (acuity.SIMULATED || !acuity.TYPE_BELFAST) {
      const fields = {
        'Status': 'Booked',
        'Acuity appointment ID': 'SIMULATED — prototype',
        'Appointment at': String(datetime).slice(0, 19)
      };
      if (DRY_RUN) { console.log(`[dry-run] booking confirm on ${recordId}:`, JSON.stringify(fields)); return res.json({ ok: true, dryRun: true, simulated: true }); }
      await at('PATCH', FEE_TABLE, { records: [{ id: recordId, fields }], typecast: true });
      return res.json({ ok: true, simulated: true });
    }

    const rec = await at('GET', `${FEE_TABLE}/${recordId}`);
    const f = rec.fields || {};
    if (f['Status'] === 'Booked') return res.json({ ok: true, alreadyBooked: true });
    if (f['Route'] === 'Private' && f['Status'] !== 'Paid') {
      return res.status(403).json({ ok: false, error: 'Payment must be confirmed before booking' });
    }
    const contactName = String(f['Contact name'] || '').trim();
    const firstName = contactName.split(/\s+/)[0] || 'Fee';
    const lastName = contactName.split(/\s+/).slice(1).join(' ') || 'note';
    const appt = await acuity.createAppointment({
      datetime,
      firstName, lastName,
      email: String(f['Contact email'] || '').trim(),
      phone: String(f['Contact phone'] || '').trim(),
      notes: `Fee note ${f['Reference'] || ''}${label ? ' — ' + label : ''}`
    });
    await at('PATCH', FEE_TABLE, {
      records: [{ id: recordId, fields: {
        'Status': 'Booked',
        'Acuity appointment ID': String(appt.id),
        'Appointment at': String(appt.datetime || datetime).slice(0, 19)
      } }],
      typecast: true
    });
    res.json({ ok: true, appointmentId: appt.id });
  } catch (err) {
    console.error('POST /api/booking/confirm failed:', err.message);
    const slotGone = err.status === 400 && /not available|no longer/i.test(err.message);
    res.status(slotGone ? 409 : 502).json({ ok: false, error: slotGone ? 'That time has just been taken — choose another' : 'Could not confirm the appointment' });
  }
});

/* Derry~Londonderry appointments are by request — preferred date and morning
   or afternoon, with five working days' notice enforced server-side. */
function minRequestDate(workingDays) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < workingDays) {
    d.setDate(d.getDate() + 1);
    const dw = d.getDay();
    if (dw !== 0 && dw !== 6) added++;
  }
  return d;
}

app.post('/api/booking/request', async (req, res) => {
  try {
    const { recordId, preferredDate, window: win } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(preferredDate || ''))) return res.status(400).json({ ok: false, error: 'Bad date' });
    if (!['Morning', 'Afternoon'].includes(win)) return res.status(400).json({ ok: false, error: 'Bad time window' });
    const chosen = new Date(preferredDate + 'T00:00:00');
    const dw = chosen.getDay();
    if (dw === 0 || dw === 6) return res.status(400).json({ ok: false, error: 'Choose a weekday' });
    if (chosen < minRequestDate(5)) return res.status(400).json({ ok: false, error: 'Requests need five working days\u2019 notice' });

    if (!recordId) return res.json({ ok: true, offline: true });
    if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) return res.status(400).json({ ok: false, error: 'Bad record id' });

    const pretty = chosen.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fields = {
      'Status': 'Booking requested',
      'Booking request detail': `Derry~Londonderry office — preferred ${pretty}, ${win}`
    };
    if (DRY_RUN) { console.log(`[dry-run] booking request on ${recordId}:`, JSON.stringify(fields)); return res.json({ ok: true, dryRun: true }); }
    await at('PATCH', FEE_TABLE, { records: [{ id: recordId, fields }], typecast: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/booking/request failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not send the request' });
  }
});

/* ---------------- static site ---------------- */
/* Serve only the public web assets. Server code, libraries, internal
   documents and tooling must never be reachable over HTTP. */
app.use((req, res, next) => {
  if (/\.(html|js|css)$/.test(req.path) || req.path === '/') {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

const PUBLIC_PAGES = new Set(['/', '/index', '/index.html',
  '/privacy', '/privacy.html', '/data-sharing-terms', '/data-sharing-terms.html']);
app.use((req, res, next) => {
  const p = req.path;
  if (PUBLIC_PAGES.has(p) || p.startsWith('/css/') || p.startsWith('/js/') || p.startsWith('/assets/') || p === '/favicon.ico') return next();
  if (p.startsWith('/api/')) return next();
  return res.status(404).send('Not found');
});
app.use(express.static(path.join(__dirname), { extensions: ['html'], index: 'index.html' }));

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`NIVHA fee note service on :${port} — Airtable ${DRY_RUN ? 'DRY RUN (set AIRTABLE_PAT to go live)' : 'live'}`);
});
