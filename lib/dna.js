/* DNA relationship testing fee notes: server side.
   Pricing is recomputed here from the same catalogue the browser uses, the case
   and its participants are stored in Airtable (DNA_FeeNote and DNA_Participants),
   the fee note PDF is generated and emailed, and private clients pay by card.
   References run DNA-1000 upwards. */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const airtable = require('./airtable');
const stripe = require('./stripe');
const { generateDnaFeeNote } = require('./dna-pdf');
const { uploadFeeNote } = require('./dropbox');
const email = require('./email');

const DNA_FEE_TABLE = process.env.AIRTABLE_DNA_FEE_TABLE_ID || 'tbldh5IjH8WIFjcAA';          // DNA_FeeNote
const DNA_PART_TABLE = process.env.AIRTABLE_DNA_PARTICIPANTS_TABLE_ID || 'tblHx8ijv1ec9e4IN'; // DNA_Participants
const DNA_PDF_FIELD = process.env.AIRTABLE_DNA_PDF_FIELD_ID || 'fldrW8yFUqnko3Fia';           // Fee note PDF
const LEADS_TABLE = process.env.AIRTABLE_LEADS_TABLE_ID || 'tbl91O7LF3iezIKv2';
const OFFICE = process.env.DNA_OFFICE_EMAIL || 'info@nivha.net';
const DRY_RUN = airtable.DRY_RUN;
const { at } = airtable;

/* ---------- catalogue: one source for browser and server ---------- */
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'dna-catalogue.js'), 'utf8') +
  ';this.__C = { DNA_VAT_RATE, DNA_INCLUDED_PEOPLE, DNA_ADDITIONAL_PERSON_FEE, DNA_COLLECTION, DNA_TESTS, DNA_TURNAROUND, DNA_MARKER_CLAIM, DNA_LEGAL_REPORT, DNA_FEES, DNA_ADDITIONAL_SAMPLES };',
  sandbox
);
const CAT = sandbox.__C;
const TEST_BY_ID = {};
CAT.DNA_TESTS.forEach(t => { TEST_BY_ID[t.id] = t; });

const ROUTE_MAP = { solicitor: 'Solicitor', trust: 'Trust', private: 'Private' };
const TEST_MAP = { paternity: 'Paternity', maternity: 'Maternity', sibling: 'Sibling', auntuncle: 'Aunt or uncle', extended: 'Extended family' };
const ROLE_MAP = {
  father: 'Potential father', mother: 'Mother', child: 'Child', sibling: 'Sibling', auntuncle: 'Aunt or uncle',
  niecenephew: 'Niece or nephew', grandparent: 'Grandparent', grandchild: 'Grandchild'
};
const METHOD_MAP = { belfast: 'Belfast', derry: 'Derry~Londonderry', gp: 'GP surgery' };
const METHOD_NAME = { belfast: 'NIVHA office, Belfast', derry: 'NIVHA office, Derry~Londonderry', gp: 'Own GP surgery' };

const round2 = n => Math.round(n * 100) / 100;
const clean = (s, n = 200) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s));
function ageOn(dob, now = new Date()) {
  const d = new Date(dob);
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

/* ---------- validation and pricing ---------- */
function normalise(body) {
  const b = body || {};
  const err = msg => { const e = new Error(msg); e.status = 400; throw e; };
  if (!ROUTE_MAP[b.route]) err('Unknown route');
  const test = TEST_BY_ID[b.test];
  if (!test) err('Unknown test');

  const d = b.details || {};
  const details = {};
  ['org', 'orgAddress', 'orgTown', 'orgPostcode', 'caseref', 'legalAidRef', 'costCentre', 'approverName', 'contactName', 'contactEmail', 'contactPhone']
    .forEach(k => { details[k] = clean(d[k], k === 'orgAddress' ? 300 : 160); });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contactEmail)) err('A valid contact email is required');
  if (!details.contactName) err('Contact name is required');
  if (b.route !== 'private' && !(details.org && details.orgAddress && details.orgTown && details.orgPostcode)) {
    err('Organisation name and address are required');
  }

  const rawParts = Array.isArray(b.participants) ? b.participants : [];
  if (rawParts.length < 1 || rawParts.length > 12) err('Check the number of participants');
  const roleCounts = {};
  const participants = rawParts.map(p => {
    const role = clean(p.role, 40);
    if (!ROLE_MAP[role]) err('Unknown participant role');
    roleCounts[role] = (roleCounts[role] || 0) + 1;
    const name = clean(p.name, 120);
    const dob = clean(p.dob, 10);
    if (!name) err('Every participant needs a name');
    if (!isDate(dob)) err('Every participant needs a valid date of birth');
    const age = ageOn(dob);
    if (age < 0 || age > 120) err('Check the date of birth entered');
    const minor = age < 18;
    const guardianName = clean(p.guardianName, 120);
    if (minor && !guardianName) err('Name the person who will sign on the child\u2019s behalf');
    let collection = clean(p.collection, 10) || clean(b.collection, 10) || 'belfast';
    if (b.attendance === 'together') collection = clean(b.collection, 10) || 'belfast';
    if (!METHOD_MAP[collection]) err('Unknown collection method');
    let gpName = clean(p.gpName, 160), gpAddress = clean(p.gpAddress, 300);
    if (b.attendance === 'together') { gpName = clean((b.gp || {}).name, 160); gpAddress = clean((b.gp || {}).address, 300); }
    if (collection === 'gp' && !gpName) err('Enter the GP surgery name');
    return { role, name, dob, minor, guardianName: minor ? guardianName : '', collection, gpName: collection === 'gp' ? gpName : '', gpAddress: collection === 'gp' ? gpAddress : '' };
  });
  /* Roster rules for the chosen test */
  const roles = new Set(test.roster.map(r => r.role));
  participants.forEach(p => { if (!roles.has(p.role)) err('That participant does not belong in this test'); });
  test.roster.forEach(r => {
    const n = roleCounts[r.role] || 0;
    if (n < r.min || n > r.max) err(`Check the number of ${r.plural.toLowerCase()}`);
  });
  /* Roster order: the first two people are covered by the headline price */
  const order = test.roster.map(r => r.role);
  participants.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

  const acc = b.acceptance || {};
  if (acc.declaration !== true) err('Please confirm the declaration');
  if (b.route === 'private' && acc.consent !== true) err('Please confirm consent to processing');

  return { route: b.route, test, details, participants, acceptance: acc, attendance: b.attendance === 'separately' ? 'separately' : 'together', leadEmail: clean(b.leadEmail, 200).toLowerCase(), clientTotal: b.totals && Number(b.totals.total) };
}

/* Mirrors js/dna.js collectionUsage and computeTotals. GP is charged per kit
   (one per person collected at a surgery); the offices are charged once. */
function price(c) {
  const t = c.test;
  const n = c.participants.length;
  const poa = !t.priced;
  const base = t.priced ? t.price : 0;
  const extra = Math.max(0, n - CAT.DNA_INCLUDED_PEOPLE);
  const extraFee = extra * CAT.DNA_ADDITIONAL_PERSON_FEE;
  const usage = new Map();
  c.participants.forEach(p => {
    const unit = CAT.DNA_COLLECTION[p.collection].fee;
    if (p.collection === 'gp') {
      const key = 'gp|' + (p.gpName + '|' + p.gpAddress).toLowerCase();
      if (!usage.has(key)) usage.set(key, { id: 'gp', label: CAT.DNA_COLLECTION.gp.label, unit, kits: 0, fee: 0, detail: p.gpName + (p.gpAddress ? ', ' + p.gpAddress : '') });
      const g = usage.get(key); g.kits += 1; g.fee = round2(g.unit * g.kits);
    } else if (!usage.has(p.collection)) {
      usage.set(p.collection, { id: p.collection, label: CAT.DNA_COLLECTION[p.collection].label, unit, kits: 0, fee: unit, detail: '' });
    }
  });
  const collections = [...usage.values()];
  const collectionTotal = collections.reduce((s, x) => s + x.fee, 0);
  const net = round2(base + extraFee + collectionTotal);
  const vat = round2(net * CAT.DNA_VAT_RATE);
  return { poa, base, extra, extraFee, collections, collectionTotal, net, vat, total: round2(net + vat), people: n, gpKits: collections.filter(x => x.id === 'gp').reduce((s, x) => s + x.kits, 0) };
}

/* ---------- reference ---------- */
const dryCounter = { n: 999 };
async function nextReference() {
  if (DRY_RUN) return `DNA-${++dryCounter.n}`;
  let max = 999, offset;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    q.append('fields[]', 'Reference');
    if (offset) q.set('offset', offset);
    const data = await at('GET', `${DNA_FEE_TABLE}?${q}`);
    for (const r of data.records) {
      const m = /^DNA-(\d+)$/.exec((r.fields && r.fields.Reference) || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    offset = data.offset;
  } while (offset);
  return `DNA-${max + 1}`;
}

/* ---------- records ---------- */
function acceptanceText(c, ref) {
  const a = c.acceptance;
  const bits = ['Declaration ticked: details correct, authorised to instruct.'];
  if (c.route === 'private') bits.push('Consent given to processing of personal information, including special category (health) data, UK/EU GDPR Art 9(2)(a). Withdrawal possible before analysis begins.');
  else bits.push('Data Sharing Terms accepted (click-wrap): /data-sharing-terms');
  bits.push('Laboratory additional samples statement shown on the fee note.');
  bits.push(`Accepted by: ${c.details.contactName} <${c.details.contactEmail}>`);
  if (a.acceptedAt) bits.push(`Accepted at (client): ${clean(a.acceptedAt, 40)}`);
  bits.push(`Recorded at (server): ${new Date().toISOString()}`);
  return bits.join('\n');
}

function collectionSummary(c, pr) {
  const parts = c.participants.map(p => `${p.name} (${ROLE_MAP[p.role]}): ${METHOD_NAME[p.collection]}${p.collection === 'gp' ? ' - ' + p.gpName + (p.gpAddress ? ', ' + p.gpAddress : '') : ''}`);
  return parts.join('\n');
}

function caseFields(c, pr, ref) {
  const d = c.details;
  return {
    'Reference': ref,
    'Status': pr.poa ? 'Quote requested' : (c.route === 'private' ? 'Awaiting payment' : 'New'),
    'Route': ROUTE_MAP[c.route],
    'Test': TEST_MAP[c.test.id],
    'Participant count': pr.people,
    'Organisation': d.org, 'Org address': d.orgAddress, 'Org town': d.orgTown, 'Org postcode': d.orgPostcode,
    'Case / PO reference': d.caseref, 'Cost centre': d.costCentre, 'Approver name': d.approverName, 'Legal Aid reference': d.legalAidRef,
    'Contact name': d.contactName, 'Contact email': d.contactEmail, 'Contact phone': d.contactPhone,
    'Collection summary': collectionSummary(c, pr),
    'GP kits': pr.gpKits,
    'Subtotal': pr.poa ? 0 : pr.net, 'VAT': pr.poa ? 0 : pr.vat, 'Total': pr.poa ? 0 : pr.total,
    'Quote on request': pr.poa,
    'Needs price review': pr.poa,
    'Laboratory statement shown': true,
    'Participants JSON': JSON.stringify(c.participants.map(p => ({ role: p.role, name: p.name, dob: p.dob, guardianName: p.guardianName, collection: p.collection, gpName: p.gpName, gpAddress: p.gpAddress })), null, 2),
    'Acceptance record': acceptanceText(c, ref),
    'Chase emails sent': 0,
    'Source system': 'dna v1',
    'Submitted at': new Date().toISOString()
  };
}

function participantRows(c, pr, caseId) {
  return c.participants.map((p, idx) => ({
    fields: {
      'Participant': `${p.name} (${ROLE_MAP[p.role]})`,
      'Case': [caseId],
      'Role': ROLE_MAP[p.role],
      'Full name': p.name,
      'Date of birth': p.dob,
      'Under 18': p.minor,
      'Person signing on the child\u2019s behalf': p.guardianName,
      'Collection method': METHOD_MAP[p.collection],
      'GP surgery name': p.gpName,
      'GP surgery address': p.gpAddress,
      'Kit fee': p.collection === 'gp' && !pr.poa ? CAT.DNA_COLLECTION.gp.fee : 0,
      'Additional person fee': !pr.poa && idx >= CAT.DNA_INCLUDED_PEOPLE ? CAT.DNA_ADDITIONAL_PERSON_FEE : 0
    }
  }));
}

/* PDF input from a stored record: the PDF can be rebuilt at any time. */
function pdfDataFromRecord(f) {
  let parts = [];
  try { parts = JSON.parse(f['Participants JSON'] || '[]'); } catch (e) { /* empty */ }
  const routeKey = Object.keys(ROUTE_MAP).find(k => ROUTE_MAP[k] === f['Route']) || 'trust';
  const testId = Object.keys(TEST_MAP).find(k => TEST_MAP[k] === f['Test']) || 'paternity';
  const c = {
    route: routeKey, test: TEST_BY_ID[testId],
    details: {
      org: f['Organisation'] || '', orgAddress: f['Org address'] || '', orgTown: f['Org town'] || '', orgPostcode: f['Org postcode'] || '',
      caseref: f['Case / PO reference'] || '', costCentre: f['Cost centre'] || '', approverName: f['Approver name'] || '', legalAidRef: f['Legal Aid reference'] || '',
      contactName: f['Contact name'] || '', contactEmail: f['Contact email'] || '', contactPhone: f['Contact phone'] || ''
    },
    participants: parts.map(p => ({ ...p, minor: !!p.dob && ageOn(p.dob) < 18 }))
  };
  const pr = price(c);
  return {
    ref: f['Reference'] || '', route: routeKey, test: c.test, details: c.details, participants: c.participants, pricing: pr,
    issued: f['Submitted at'] ? new Date(f['Submitted at']) : new Date(),
    payment: f['Paid at'] ? { paidAt: f['Paid at'], cardRef: f['Stripe payment ID'] || '' } : null,
    cat: CAT
  };
}

async function pdfBufferFor(recordId) {
  const rec = await at('GET', `${DNA_FEE_TABLE}/${recordId}`);
  const f = rec.fields || {};
  const data = pdfDataFromRecord(f);
  const tmp = path.join(os.tmpdir(), `dna-${recordId}-${Date.now()}.pdf`);
  await generateDnaFeeNote(data, tmp);
  const buf = fs.readFileSync(tmp);
  fs.unlink(tmp, () => {});
  return { buf, data, fields: f };
}

async function sendCaseEmails({ baseUrl, recordId, isNew }) {
  try {
    const { buf, data, fields } = await pdfBufferFor(recordId);
    uploadFeeNote({ reference: data.ref, pdfBuffer: buf }).catch(e => console.error('dropbox archive failed (non-fatal):', e.message));
    /* Keep a copy on the Airtable record, once */
    airtable.uploadAttachment(recordId, DNA_PDF_FIELD, { filename: `NIVHA-DNA-fee-note-${data.ref}.pdf`, contentType: 'application/pdf', buffer: buf })
      .catch(e => console.error('airtable pdf attach failed (non-fatal):', e.message));
    const poa = data.pricing.poa;
    const paid = !!fields['Paid at'];
    if (fields['Contact email']) {
      await email.dnaFeeNoteEmail({
        baseUrl, to: fields['Contact email'], reference: data.ref, route: data.route, poa, paid,
        collectionMethods: [...new Set(data.participants.map(p => p.collection))],
        pdfBuffer: buf, downloadLink: `${baseUrl}/api/dna/fee-notes/${recordId}/pdf`, statement: CAT.DNA_ADDITIONAL_SAMPLES
      });
    }
    if (isNew || paid) {
      await email.dnaOfficeEmail({ to: OFFICE, data, fields, paid });
    }
  } catch (e) {
    console.error('dna emails failed (non-fatal):', e.message);
  }
}

async function markPaid(baseUrl, recordId, paymentId) {
  if (DRY_RUN || !recordId) return;
  const rec = await at('GET', `${DNA_FEE_TABLE}/${recordId}`);
  const f = rec.fields || {};
  if (f['Status'] === 'Paid' || f['Paid at']) return;
  await at('PATCH', DNA_FEE_TABLE, {
    records: [{ id: recordId, fields: { 'Status': 'Paid', 'Paid at': new Date().toISOString(), 'Stripe payment ID': String(paymentId || '').slice(0, 100) } }],
    typecast: true
  });
  sendCaseEmails({ baseUrl, recordId, isNew: false });
}

/* ---------- routes ---------- */
function register(app, { baseUrl }) {
  const idOk = id => /^rec[A-Za-z0-9]{14,20}$/.test(String(id || ''));

  app.post('/api/dna/fee-notes', async (req, res) => {
    try {
      const c = normalise(req.body);
      const pr = price(c);
      const mismatch = c.clientTotal != null && !pr.poa && Math.abs(c.clientTotal - pr.total) > 0.01;
      if (mismatch) console.warn(`dna totals mismatch: client ${c.clientTotal} vs server ${pr.total}; server wins`);
      const reference = await nextReference();
      const fields = caseFields(c, pr, reference);
      if (mismatch) fields['Needs price review'] = true;
      if (DRY_RUN) {
        console.log(`[dry-run] DNA fee note ${reference}:`, JSON.stringify({ ...fields, 'Participants JSON': '...' }));
        return res.json({ ok: true, reference, recordId: null, dryRun: true, totals: pr.poa ? null : { net: pr.net, vat: pr.vat, total: pr.total }, poa: pr.poa });
      }
      const created = await at('POST', DNA_FEE_TABLE, { records: [{ fields }], typecast: true });
      const recordId = created.records[0].id;
      const rows = participantRows(c, pr, recordId);
      await at('POST', DNA_PART_TABLE, { records: rows, typecast: true });

      if (c.leadEmail) {
        try {
          const q = new URLSearchParams({ filterByFormula: `LOWER({Email})='${airtable.escapeFormula(c.leadEmail)}'`, pageSize: '1' });
          const found = await at('GET', `${LEADS_TABLE}?${q}`);
          if (found.records.length) await at('PATCH', DNA_FEE_TABLE, { records: [{ id: recordId, fields: { 'Lead': [found.records[0].id] } }] });
        } catch (e) { console.error('dna lead linking failed (non-fatal):', e.message); }
      }
      /* Invoiced routes and quote requests are emailed now; private clients
         receive theirs, marked paid, once payment clears. */
      if (c.route !== 'private' || pr.poa) sendCaseEmails({ baseUrl, recordId, isNew: true });
      res.json({ ok: true, reference, recordId, totals: pr.poa ? null : { net: pr.net, vat: pr.vat, total: pr.total }, poa: pr.poa });
    } catch (err) {
      if (err.status === 400) return res.status(400).json({ ok: false, error: err.message });
      console.error('POST /api/dna/fee-notes failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not create the fee note' });
    }
  });

  /* Card payment (private clients). Amount always read from the stored record. */
  app.post('/api/dna/checkout', async (req, res) => {
    try {
      const b = req.body || {};
      if (DRY_RUN || !idOk(b.recordId)) {
        if (stripe.SIMULATED) return res.json({ ok: true, simulated: true });
        return res.status(400).json({ ok: false, error: 'Nothing to pay' });
      }
      const rec = await at('GET', `${DNA_FEE_TABLE}/${b.recordId}`);
      const f = rec.fields || {};
      if (f['Route'] !== 'Private') return res.status(400).json({ ok: false, error: 'Only private fee notes are paid by card' });
      if (f['Status'] === 'Paid' || f['Paid at']) return res.json({ ok: true, alreadyPaid: true, reference: f['Reference'] });
      const amount = Number(f['Total']);
      if (!(amount > 0)) return res.status(400).json({ ok: false, error: 'Nothing to pay' });
      if (stripe.SIMULATED) return res.json({ ok: true, simulated: true });
      const session = await stripe.createCheckoutSession({
        baseUrl, reference: f['Reference'], amountPence: Math.round(amount * 100), email: (f['Contact email'] || '').trim(), recordId: b.recordId,
        kind: 'dna', productName: `DNA fee note ${f['Reference']} - relationship testing`,
        description: 'NIVHA Laboratory Services Ltd - DNA relationship testing, collection and legal report as itemised on your fee note.',
        returnPath: '/dna'
      });
      res.json({ ok: true, url: session.url });
    } catch (err) {
      console.error('POST /api/dna/checkout failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not start the payment' });
    }
  });

  app.get('/api/dna/checkout/confirm', async (req, res) => {
    try {
      if (stripe.SIMULATED) return res.status(400).json({ ok: false, error: 'Payments are simulated in this environment' });
      const sid = String(req.query.session_id || '');
      if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return res.status(400).json({ ok: false, error: 'Bad session id' });
      const session = await stripe.getSession(sid);
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return res.json({ ok: true, paid: false });
      const meta = session.metadata || {};
      if (meta.kind !== 'dna') return res.status(400).json({ ok: false, error: 'Not a DNA payment' });
      await markPaid(baseUrl, meta.recordId, session.payment_intent || session.id);
      res.json({ ok: true, paid: true, reference: meta.reference || '', amount: (session.amount_total || 0) / 100, receipt: String(session.payment_intent || sid) });
    } catch (err) {
      console.error('GET /api/dna/checkout/confirm failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not confirm the payment' });
    }
  });

  /* Prototype only: marks paid when Stripe is not configured. */
  app.post('/api/dna/fee-notes/:id/simulated-paid', async (req, res) => {
    try {
      if (!stripe.SIMULATED) return res.status(400).json({ ok: false, error: 'Payments are confirmed by Stripe' });
      if (DRY_RUN || !idOk(req.params.id)) return res.json({ ok: true, dryRun: true });
      await at('PATCH', DNA_FEE_TABLE, { records: [{ id: req.params.id, fields: { 'Status': 'Paid', 'Paid at': new Date().toISOString(), 'Stripe payment ID': 'SIMULATED - prototype' } }], typecast: true });
      sendCaseEmails({ baseUrl, recordId: req.params.id, isNew: false });
      res.json({ ok: true });
    } catch (err) {
      console.error('simulated paid failed:', err.message);
      res.status(502).json({ ok: false });
    }
  });

  app.get('/api/dna/fee-notes/:recordId/pdf', async (req, res) => {
    try {
      if (DRY_RUN) return res.status(400).json({ ok: false, error: 'Records are not stored in this environment' });
      if (!idOk(req.params.recordId)) return res.status(400).json({ ok: false, error: 'Bad record id' });
      const { buf, data, fields } = await pdfBufferFor(req.params.recordId);
      if (data.route === 'private' && !data.pricing.poa && !fields['Paid at']) {
        return res.status(403).json({ ok: false, error: 'The fee note becomes available once payment clears' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="NIVHA-DNA-fee-note-${data.ref}.pdf"`);
      res.send(buf);
    } catch (err) {
      console.error('GET /api/dna/fee-notes/:id/pdf failed:', err.message);
      res.status(502).json({ ok: false, error: 'Could not generate the fee note PDF' });
    }
  });
}

module.exports = { register, markPaid, normalise, price, pdfDataFromRecord, CAT };
