/* Airtable REST helper — shared by the fee note tables and the Policy Register.
   Identical behaviour to the original helper in server.js: JSON in, JSON out,
   errors carry the status and a truncated body. Dry run whenever no PAT is
   set, so the whole platform runs locally without credentials. */
'use strict';

const PAT = process.env.AIRTABLE_PAT || '';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appSr0GuDnDK0bdfy';
const AT_URL = 'https://api.airtable.com/v0';
const CONTENT_URL = 'https://content.airtable.com/v0';
const DRY_RUN = !PAT;

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

/* Attachment upload — base64 through the content API, which keeps the file in
   Airtable rather than relying on a public URL we would have to host. */
async function uploadAttachment(recordId, fieldId, { filename, contentType, buffer }) {
  const res = await fetch(`${CONTENT_URL}/${BASE_ID}/${recordId}/${fieldId}/uploadAttachment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contentType,
      file: buffer.toString('base64'),
      filename
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Airtable upload ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const escapeFormula = s => String(s).replace(/'/g, "\\'");

module.exports = { at, uploadAttachment, escapeFormula, PAT, BASE_ID, DRY_RUN };
