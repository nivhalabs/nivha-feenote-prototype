/* Document sign-offs — who approved each shipped pack file, and when.

   One Airtable row per approved file version, in the same base as the Policy
   Register. A file counts as signed off only while the row's Version matches
   CURRENT_VERSIONS below — bump a version when a file changes and it goes
   straight back through review, with the old approval kept as history.

   With no AIRTABLE_PAT sign-offs live in memory, like the register. */
'use strict';

const { at, escapeFormula, DRY_RUN } = require('./airtable');

const TABLE = process.env.AIRTABLE_SIGNOFF_TABLE_ID || 'tblk1APn4EiJMMbml';

/* The pack files that ship to buyers, and the version currently in the repo. */
const CURRENT_VERSIONS = {
  'nivha_pack_01_employee_leaflet.docx': 'v1.0',
  'nivha_pack_02_manager_guidance.docx': 'v1.0',
  'nivha_pack_03_toolbox_talk_condensed.pptx': 'v1.0',
  'nivha_pack_03b_signoff_sheet.docx': 'v1.0',
  'nivha_pack_03c_delivery_script.docx': 'v1.0',
  'nivha_pack_05_contract_clauses.docx': 'v1.0'
};

/* ---------------- state ---------------- */

const dryRows = [];               /* { Filename, Version, 'Signed off by', 'Signed off at' } */
let cache = null;                 /* Map filename -> { by, at } for current versions */
let cacheAt = 0;
const TTL_MS = 30 * 1000;

function invalidate() { cache = null; cacheAt = 0; }

async function fetchRows() {
  if (DRY_RUN) return dryRows.slice();
  const rows = [];
  let offset = '';
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    if (offset) q.set('offset', offset);
    const page = await at('GET', `${TABLE}?${q}`);
    for (const r of page.records || []) rows.push(r.fields || {});
    offset = page.offset || '';
  } while (offset);
  return rows;
}

/* Map of filename -> { by, at } covering only files whose sign-off matches the
   currently shipped version. */
async function signedOff() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const map = new Map();
  try {
    for (const f of await fetchRows()) {
      const file = String(f['Filename'] || '');
      if (CURRENT_VERSIONS[file] && f['Version'] === CURRENT_VERSIONS[file]) {
        map.set(file, { by: String(f['Signed off by'] || ''), at: String(f['Signed off at'] || '') });
      }
    }
    cache = map; cacheAt = Date.now();
  } catch (e) {
    /* A register read failure must fail safe: nothing counts as signed off,
       so nothing is delivered on a guess. */
    console.error('sign-off lookup failed (treating all as unsigned):', e.message);
  }
  return map;
}

async function recordSignoff({ filename, name, notes }) {
  const version = CURRENT_VERSIONS[filename];
  if (!version) throw new Error(`not a shipped pack file: ${filename}`);
  const fields = {
    'Filename': filename,
    'Version': version,
    'Signed off by': name,
    'Signed off at': new Date().toISOString(),
    'Notes': notes || ''
  };
  if (DRY_RUN) {
    dryRows.push(fields);
  } else {
    await at('POST', TABLE, { records: [{ fields }], typecast: true });
  }
  invalidate();
  return fields;
}

module.exports = { CURRENT_VERSIONS, signedOff, recordSignoff, invalidate, TABLE };
