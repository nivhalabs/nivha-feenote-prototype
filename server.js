/* NIVHA Fee Note platform v2 — API skeleton
 * Serves the static wizard and writes fee notes / leads to Airtable.
 * Runs in dry-run mode (no records written) until AIRTABLE_PAT is set.
 */
'use strict';

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

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
      if (['Booked', 'On-site requested'].includes(status)) return;
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

/* Post-submission status events (simulated pay / booking in the prototype;
 * Stripe and Acuity webhooks replace these calls in later build steps). */
app.patch('/api/fee-notes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return res.status(400).json({ ok: false, error: 'Bad record id' });
    const { event } = req.body || {};
    const now = new Date().toISOString();
    let fields;

    if (event === 'paid') {
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

/* ---------------- static site ---------------- */
app.use((req, res, next) => {
  if (/\.(html|js|css)$/.test(req.path) || req.path === '/') {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`NIVHA fee note service on :${port} — Airtable ${DRY_RUN ? 'DRY RUN (set AIRTABLE_PAT to go live)' : 'live'}`);
});
