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
let dryCounter = 1000; // dry-run references count up from FN-1001 per process

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

/* Next FN reference: scan existing references, take max + 1 (pilot volumes) */
async function nextReference() {
  if (DRY_RUN) return `FN-${++dryCounter}`;
  let max = 1000;
  let offset;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    q.append('fields[]', 'Reference');
    if (offset) q.set('offset', offset);
    const data = await at('GET', `${FEE_TABLE}?${q}`);
    for (const r of data.records) {
      const m = /^FN-(\d+)$/.exec((r.fields && r.fields.Reference) || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
    offset = data.offset;
  } while (offset);
  return `FN-${max + 1}`;
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
  return fields;
}

const round2 = n => (typeof n === 'number' && isFinite(n) ? Math.round(n * 100) / 100 : 0);
const escapeFormula = s => String(s).replace(/'/g, "\\'");

/* ---------------- routes ---------------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mode: DRY_RUN ? 'dry-run' : 'live' });
});

/* Gate email capture -> LegalSocial_Leads (upsert by email) */
app.post('/api/leads', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'A valid email is required' });
    }
    const now = new Date().toISOString();
    if (DRY_RUN) return res.json({ ok: true, dryRun: true });

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
      return res.json({ ok: true, recordId: rec.id, returning: true });
    }
    const created = await at('POST', LEADS_TABLE, {
      records: [{
        fields: {
          'Email': email,
          'First seen': now,
          'Last link sent': now,
          'Links requested': 1,
          'Source': String(req.body.source || 'fee-note gate').slice(0, 100)
        }
      }]
    });
    res.json({ ok: true, recordId: created.records[0].id, returning: false });
  } catch (err) {
    console.error('POST /api/leads failed:', err.message);
    res.status(502).json({ ok: false, error: 'Could not record the email' });
  }
});

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

    const reference = await nextReference();
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
