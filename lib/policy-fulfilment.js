/* Fulfilment for policy orders — turns a paid or invoiced order into the set
   of files the buyer receives. One tailored policy per jurisdiction, plus the
   signed-off pack files for whatever was bought, plus the contract clause
   wording that comes free with every policy.

   Nothing is emailed from here. Files go to the Policy Register and wait for a
   person to approve them in /admin/fulfilment — the gate agreed at workshop
   decision D4. */
'use strict';

const fs = require('fs');
const path = require('path');
const { buildPolicyDoc } = require('./policy-doc');
const { officeText } = require('./office-text');
const signoffs = require('./signoffs');

const PACK_DIR = path.join(__dirname, '..', 'assets', 'fulfilment');

/* Final issued versions live alongside the drafts. The draft in PACK_DIR is
   what ships until the file is signed off in /admin/signoff — from then on
   the final version is served everywhere, including for orders whose draft
   copies were attached to the register before sign-off happened. */
const FINAL_DIR = path.join(PACK_DIR, 'final');

function effectivePackPath(file, signedSet) {
  if (signedSet && signedSet.has(file)) {
    const finalPath = path.join(FINAL_DIR, file);
    if (fs.existsSync(finalPath)) return finalPath;
  }
  return path.join(PACK_DIR, file);
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/* Static pack files, keyed by the item that entitles the buyer to them. */
const PACK_FILES = {
  employee_awareness_leaflet: [
    { file: 'nivha_pack_01_employee_leaflet.docx', type: DOCX, note: 'the one-page summary of the policy for every member of staff' }
  ],
  manager_guidance: [
    { file: 'nivha_pack_02_manager_guidance.docx', type: DOCX, note: 'guidance for supervisors on recognising possible impairment and holding the conversation' }
  ],
  toolbox_talk: [
    { file: 'nivha_pack_03_toolbox_talk_condensed.pptx', type: PPTX, note: 'the slide deck for the team briefing — the full word-for-word delivery script is in the speaker notes' },
    { file: 'nivha_pack_03b_signoff_sheet.docx', type: DOCX, note: 'the print-ready sign-off sheet, your record that the policy was briefed' }
  ],
  contract_clauses: [
    { file: 'nivha_pack_05_contract_clauses.docx', type: DOCX, note: 'clause wording for contracts and subcontracts, included free with your policy' }
  ]
};

const JURISDICTION_NAMES = { ni: 'Northern Ireland', gb: 'Great Britain', roi: 'Republic of Ireland' };

const slug = s => String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/* Which jurisdictions the buyer selected, in a stable order. */
function jurisdictionsFrom(answers) {
  const q = (answers && answers.quiz) || {};
  const raw = Array.isArray(q.jurisdictions) ? q.jurisdictions
    : typeof q.jurisdiction === 'string' ? q.jurisdiction.split('_') : [];
  const set = new Set();
  raw.forEach(t => {
    if (t === 'uk') { set.add('ni'); set.add('gb'); }
    else if (JURISDICTION_NAMES[t]) set.add(t);
  });
  if (!set.size) set.add('ni');
  return ['ni', 'gb', 'roi'].filter(j => set.has(j));
}

const registerJurisdictions = answers => jurisdictionsFrom(answers).map(j => JURISDICTION_NAMES[j]);

/* Build every file for an order. One policy document per jurisdiction, so a
   buyer operating in two places gets two documents that each read cleanly
   rather than one that hedges on every page. */
async function buildOrderFiles({ answers, order }) {
  const files = [];
  const org = (answers && answers.details && answers.details.company) || 'policy';
  if (order.hasPolicy) {
    const jurs = jurisdictionsFrom(answers);
    for (const j of jurs) {
      const single = { ...answers, quiz: { ...(answers.quiz || {}), jurisdiction: j, jurisdictions: [j] } };
      const { buffer } = await buildPolicyDoc(single);
      files.push({
        filename: `Drug-and-alcohol-policy-${slug(org)}-${slug(JURISDICTION_NAMES[j])}.docx`,
        contentType: DOCX,
        buffer,
        note: `your tailored policy for ${JURISDICTION_NAMES[j]}`,
        generated: true
      });
    }
  }
  const packIds = new Set(order.lines.some(l => l.id === 'full_pack')
    ? ['employee_awareness_leaflet', 'manager_guidance', 'toolbox_talk']
    : order.lines.map(l => l.id));
  if (order.hasPolicy) packIds.add('contract_clauses');
  const signedSet = await signoffs.signedOff();
  for (const id of packIds) {
    for (const spec of (PACK_FILES[id] || [])) {
      const full = effectivePackPath(spec.file, signedSet);
      if (!fs.existsSync(full)) {
        console.error(`fulfilment file missing: ${spec.file}`);
        continue;
      }
      files.push({
        filename: spec.file,
        contentType: spec.type,
        buffer: fs.readFileSync(full),
        note: spec.note,
        generated: false
      });
    }
  }
  return files;
}

/* Files that still carry a draft stamp must not go out. They ship in the repo
   so fulfilment is ready the moment they are signed off, but the approval gate
   refuses to deliver them until the stamp is gone. */
const DRAFT_MARK = /Draft v0\.1/i;

function draftStamped(files) {
  const flagged = [];
  for (const f of files) {
    if (f.generated) continue;
    try {
      if (DRAFT_MARK.test(officeText(f.buffer))) flagged.push(f.filename);
    } catch (e) {
      console.error(`could not read ${f.filename} for the draft check:`, e.message);
    }
  }
  return flagged;
}

/* Per-file status for the sign-off page and the approval gate: the effective
   file (final once signed off, draft until then), whether that file still
   carries a draft stamp, and who signed it off. */
async function packStatus() {
  const signedSet = await signoffs.signedOff();
  const out = [];
  for (const [file, version] of Object.entries(signoffs.CURRENT_VERSIONS)) {
    const full = effectivePackPath(file, signedSet);
    let stamped = false;
    try {
      const buf = fs.readFileSync(full);
      stamped = module.exports.draftStamped([{ filename: file, buffer: buf, generated: false }]).length > 0;
    } catch (e) {
      console.error(`pack status could not read ${file}:`, e.message);
      stamped = true; /* unreadable fails safe */
    }
    const s = signedSet.get(file);
    out.push({
      file, version,
      signedOff: !!s,
      signedOffBy: s ? s.by : '',
      signedOffAt: s ? s.at : '',
      draftStamped: stamped,
      effectivePath: full
    });
  }
  return out;
}

/* The effective buffer for a shipped pack file — what should actually be
   emailed to a buyer right now. */
async function packFileBuffer(file) {
  if (!signoffs.CURRENT_VERSIONS[file]) return null;
  const signedSet = await signoffs.signedOff();
  try {
    return fs.readFileSync(effectivePackPath(file, signedSet));
  } catch (e) {
    return null;
  }
}

module.exports = {
  buildOrderFiles, draftStamped, jurisdictionsFrom, registerJurisdictions,
  packStatus, packFileBuffer, effectivePackPath,
  JURISDICTION_NAMES, PACK_FILES, PACK_DIR, FINAL_DIR, DOCX, PPTX
};
