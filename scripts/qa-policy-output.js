/* Content QA for everything the policy builder ships.

   Generates a policy document for each jurisdiction, extracts the text, and
   checks it against the rules that came out of the policy workshop: no named
   clients, no accuracy claims, no cut-offs or detection windows, no borrowed
   accreditation, and the house style (sentence case, no exclamation marks).

   The static pack files are checked too. They ship with a draft stamp until
   sign-off, so their exclamation marks are reported as exceptions rather than
   passed over in silence.

   Run: node scripts/qa-policy-output.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { buildPolicyDoc } = require('../lib/policy-doc');
const { officeText } = require('../lib/office-text');
const fulfilment = require('../lib/policy-fulfilment');

/* Forbidden strings, with the reason each one is forbidden. */
const BANNED = [
  ['Vision Contracting', 'a client name from an earlier draft must never appear'],
  ['Eli Lilly', 'a third party name from an earlier draft must never appear'],
  ['Holywood', 'an address from an earlier draft must never appear'],
  ['100% accurate', 'no accuracy claims'],
  ['100 per cent accurate', 'no accuracy claims'],
  ['ng/ml', 'no numeric cut-offs'],
  ['ng/mL', 'no numeric cut-offs'],
  ['partner laboratory', 'the laboratory relationship is not described this way'],
  ['UKAS', 'NIVHA does not hold UKAS accreditation'],
  ['17025', 'NIVHA does not hold ISO 17025'],
  ['ISO/IEC 17025', 'NIVHA does not hold ISO 17025'],
  ['guaranteed', 'no guarantees about outcomes']
];

/* Detection windows: any claim about how long a substance stays detectable. */
const DETECTION_PATTERNS = [
  /detection window/i,
  /detectable for (?:up to )?\d+/i,
  /remains? in the (?:body|system) for/i,
  /stays? in the (?:body|system) for/i,
  /up to \d+ (?:hours|days|weeks) after (?:use|consumption)/i
];

const JURISDICTIONS = [
  { key: 'ni', label: 'Northern Ireland' },
  { key: 'gb', label: 'Great Britain' },
  { key: 'roi', label: 'Republic of Ireland' }
];

const sampleAnswers = key => ({
  details: {
    company: 'Example Employer Limited',
    contactName: 'Sample Contact',
    contactEmail: 'sample@example.test',
    sector: 'construction'
  },
  quiz: {
    jurisdiction: key,
    jurisdictions: [key],
    sector: 'construction',
    scType: 'safety_critical',
    testingTypes: ['pre_employment', 'for_cause', 'random', 'post_incident'],
    sampleTypes: ['urine', 'oral_fluid'],
    dna: true,
    prescriptionMeds: true,
    disciplinary: true
  }
});

const failures = [];
const exceptions = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

/* Sentences are split loosely; enough to test whether two ideas share one. */
const sentences = text => text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);

function checkText(where, text, { allowExclamations = false, minLength = 2000 } = {}) {
  const lower = text.toLowerCase();
  for (const [needle, reason] of BANNED) {
    if (lower.includes(needle.toLowerCase())) fail(where, `contains "${needle}" \u2014 ${reason}`);
  }
  for (const re of DETECTION_PATTERNS) {
    const m = text.match(re);
    if (m) fail(where, `reads like a detection window claim: "${m[0]}"`);
  }
  /* ISO 9001 is real, but it is a quality management standard and must never
     be offered as evidence about DNA work. */
  for (const s of sentences(text)) {
    if (/ISO\s?9001/i.test(s) && /\bDNA\b/i.test(s)) {
      fail(where, `ISO 9001 and DNA share a sentence: "${s.slice(0, 120)}"`);
    }
  }
  const bangs = (text.match(/!/g) || []).length;
  if (bangs) {
    if (allowExclamations) exceptions.push(`${where}: ${bangs} exclamation mark${bangs === 1 ? '' : 's'}`);
    else fail(where, `${bangs} exclamation mark${bangs === 1 ? '' : 's'} \u2014 the house style has none`);
  }
  /* A blank or near-blank document would pass every rule above. */
  if (text.replace(/\s+/g, '').length < minLength) fail(where, 'the text is suspiciously short');
}

(async () => {
  console.log('Policy output QA\n');

  for (const j of JURISDICTIONS) {
    const { buffer, filename } = await buildPolicyDoc(sampleAnswers(j.key));
    const text = officeText(buffer);
    const where = `policy (${j.label})`;
    checkText(where, text);
    /* The document must actually be about the jurisdiction it claims. */
    if (!text.includes(j.label)) fail(where, `does not name ${j.label} anywhere`);
    if (!/Example Employer Limited/.test(text)) fail(where, 'the buyer organisation is not named');
    const others = JURISDICTIONS.filter(o => o.key !== j.key && !(j.key === 'ni' && o.key === 'gb'));
    console.log(`  ${where}: ${filename} \u2014 ${text.length} characters`);
  }

  const packDir = fulfilment.PACK_DIR;
  for (const file of fs.readdirSync(packDir).sort()) {
    if (!/\.(docx|pptx)$/i.test(file)) continue;
    const buf = fs.readFileSync(path.join(packDir, file));
    const text = officeText(buf);
    /* Pack files are signed off separately; their exclamation marks are
       reported, not silently accepted. */
    /* The sign-off sheet is a one-page form, so it is held to a lower bar. */
    checkText(`pack file ${file}`, text, { allowExclamations: true, minLength: /signoff/i.test(file) ? 600 : 2000 });
    const draft = /Draft v0\.1/i.test(text) ? ' [draft stamp present]' : '';
    console.log(`  pack file ${file} \u2014 ${text.length} characters${draft}`);
  }

  if (exceptions.length) {
    console.log('\nExceptions (reported, not failed):');
    exceptions.forEach(e => console.log(`  \u00b7 ${e}`));
  }

  if (failures.length) {
    console.error(`\n${failures.length} content check${failures.length === 1 ? '' : 's'} failed:`);
    failures.forEach(f => console.error(`  \u00b7 ${f}`));
    process.exit(1);
  }
  console.log('\nAll content checks passed.');
})().catch(err => {
  console.error('QA run failed:', err);
  process.exit(1);
});
