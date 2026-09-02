/* Policy Register — the order book for the policy builder.
   Airtable base appSr0GuDnDK0bdfy, table tblcAx5hNimJz4MIh. Field names here
   must match the register exactly; anything else is silently dropped by
   Airtable and an order would go missing.

   With no AIRTABLE_PAT the module keeps orders in memory and logs the payload
   it would have written, so the whole flow — order, payment, fulfilment,
   approval, delivery — can be walked through locally and in any environment
   where credentials are not yet set. */
'use strict';

const crypto = require('crypto');
const { at, uploadAttachment, escapeFormula, DRY_RUN } = require('./airtable');

const TABLE = process.env.AIRTABLE_POLICY_TABLE_ID || 'tblcAx5hNimJz4MIh';
const DOCS_FIELD_ID = process.env.AIRTABLE_POLICY_DOCS_FIELD_ID || 'fldDVHvvInaaYkyxI';

const STATUS = { AWAITING_PAYMENT: 'Awaiting payment', PAID: 'Paid', INVOICED: 'Invoiced', CANCELLED: 'Cancelled' };
const FULFILMENT = { PENDING: 'Pending generation', AWAITING: 'Awaiting approval', APPROVED: 'Approved', DELIVERED: 'Delivered', FAILED: 'Failed' };

/* ---------------- dry-run store ---------------- */
const dryRecords = new Map();   /* recordId -> fields */
const dryDocs = new Map();      /* recordId -> [{ filename, contentType, buffer }] */

/* POL- plus four upper alphanumerics. Ambiguous characters are kept out so a
   reference read down the phone is not mistyped. */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomRef() {
  let s = '';
  for (let i = 0; i < 4; i++) s += REF_ALPHABET[crypto.randomInt(0, REF_ALPHABET.length)];
  return `POL-${s}`;
}

async function refExists(ref) {
  if (DRY_RUN) return [...dryRecords.values()].some(f => f['Order ref'] === ref);
  const q = new URLSearchParams({ filterByFormula: `{Order ref}='${escapeFormula(ref)}'`, pageSize: '1' });
  q.append('fields[]', 'Order ref');
  const found = await at('GET', `${TABLE}?${q}`);
  return found.records.length > 0;
}

async function nextOrderRef() {
  for (let i = 0; i < 8; i++) {
    const ref = randomRef();
    try {
      if (!(await refExists(ref))) return ref;
    } catch (e) {
      /* A register lookup failure must not stop an order — collisions are
         vanishingly unlikely across a 32^4 space at pilot volumes. */
      console.error('order ref collision check failed (non-fatal):', e.message);
      return ref;
    }
  }
  return randomRef();
}

/* ---------------- records ---------------- */
async function createOrder(fields) {
  if (DRY_RUN) {
    const id = 'recDRY' + crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 11);
    dryRecords.set(id, { ...fields });
    console.log(`[dry-run] policy register create ${fields['Order ref']}:`, JSON.stringify(fields));
    return { recordId: id, dryRun: true };
  }
  const created = await at('POST', TABLE, { records: [{ fields }], typecast: true });
  return { recordId: created.records[0].id, dryRun: false };
}

async function patchOrder(recordId, fields) {
  if (DRY_RUN) {
    const cur = dryRecords.get(recordId) || {};
    dryRecords.set(recordId, { ...cur, ...fields });
    console.log(`[dry-run] policy register patch ${recordId}:`, JSON.stringify(fields));
    return { dryRun: true };
  }
  await at('PATCH', TABLE, { records: [{ id: recordId, fields }], typecast: true });
  return { dryRun: false };
}

async function getOrder(recordId) {
  if (DRY_RUN) {
    const f = dryRecords.get(recordId);
    return f ? { id: recordId, fields: f } : null;
  }
  try {
    const rec = await at('GET', `${TABLE}/${recordId}`);
    return { id: rec.id, fields: rec.fields || {} };
  } catch (e) {
    if (/Airtable 404/.test(e.message)) return null;
    throw e;
  }
}

async function findBySessionId(sid) {
  if (DRY_RUN) {
    for (const [id, f] of dryRecords) if (f['Stripe session ID'] === sid) return { id, fields: f };
    return null;
  }
  const q = new URLSearchParams({ filterByFormula: `{Stripe session ID}='${escapeFormula(sid)}'`, pageSize: '1' });
  const found = await at('GET', `${TABLE}?${q}`);
  if (!found.records.length) return null;
  return { id: found.records[0].id, fields: found.records[0].fields || {} };
}

/* Orders the office still has to look at, newest first. */
async function listByFulfilment(status) {
  if (DRY_RUN) {
    return [...dryRecords.entries()]
      .filter(([, f]) => f['Fulfilment status'] === status)
      .map(([id, f]) => ({ id, fields: f }));
  }
  const q = new URLSearchParams({
    filterByFormula: `{Fulfilment status}='${escapeFormula(status)}'`,
    pageSize: '50'
  });
  const found = await at('GET', `${TABLE}?${q}`);
  return found.records.map(r => ({ id: r.id, fields: r.fields || {} }));
}

/* Orders with the annual review running, soonest due first — the admin
   reviews queue. */
async function listActiveReviews() {
  if (DRY_RUN) {
    return [...dryRecords.entries()]
      .filter(([, f]) => f['Review status'] === 'Active')
      .map(([id, f]) => ({ id, fields: f }))
      .sort((a, b) => String(a.fields['Review due'] || '').localeCompare(String(b.fields['Review due'] || '')));
  }
  const q = new URLSearchParams({
    filterByFormula: "{Review status}='Active'",
    pageSize: '100',
    'sort[0][field]': 'Review due',
    'sort[0][direction]': 'asc'
  });
  const found = await at('GET', `${TABLE}?${q}`);
  return found.records.map(r => ({ id: r.id, fields: r.fields || {} }));
}

/* ---------------- documents ---------------- */
/* Upload one file to the record's Documents attachment field. */
async function attachDocument(recordId, file) {
  if (DRY_RUN) {
    const list = dryDocs.get(recordId) || [];
    list.push(file);
    dryDocs.set(recordId, list);
    console.log(`[dry-run] policy register attach ${recordId}: ${file.filename} (${file.buffer.length} bytes)`);
    return { dryRun: true };
  }
  return uploadAttachment(recordId, DOCS_FIELD_ID, file);
}

/* Every document on an order, as buffers ready to email or stream. */
async function documentsFor(recordId) {
  if (DRY_RUN) return (dryDocs.get(recordId) || []).map((f, i) => ({ index: i, ...f }));
  const rec = await getOrder(recordId);
  if (!rec) return [];
  const atts = rec.fields['Documents'] || [];
  const out = [];
  for (let i = 0; i < atts.length; i++) {
    const a = atts[i];
    const res = await fetch(a.url);
    if (!res.ok) throw new Error(`Could not fetch attachment ${a.filename} (${res.status})`);
    out.push({
      index: i,
      filename: a.filename,
      contentType: a.type || 'application/octet-stream',
      buffer: Buffer.from(await res.arrayBuffer())
    });
  }
  return out;
}

function documentNames(record) {
  if (DRY_RUN) return (dryDocs.get(record.id) || []).map(f => f.filename);
  return ((record.fields || {})['Documents'] || []).map(a => a.filename);
}

module.exports = {
  TABLE, DOCS_FIELD_ID, STATUS, FULFILMENT, DRY_RUN,
  nextOrderRef, createOrder, patchOrder, getOrder, findBySessionId,
  listByFulfilment, listActiveReviews, attachDocument, documentsFor, documentNames
};
