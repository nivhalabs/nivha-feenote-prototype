/* NIVHA policy builder — generates a tailored drug and alcohol policy DOCX
   from the policy wizard answers. Derived from the modernised CPP5 V3 template.
   Rule D7: no numeric screening cut-offs, alcohol figures or detection windows
   appear anywhere in this document — figures ship as a versioned appendix once
   scientific sign-off is complete. */
'use strict';

const docx = require('docx');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageNumber, PageBreak,
} = docx;

const ACCENT = '01696F';
const HEAD = '28251D';
const BODY = '33312B';
const FONT = 'Open Sans';

/* **bold** inline support */
function runs(text, opts = {}) {
  const out = [];
  const re = /\*\*[^*]+\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...opts }));
    out.push(new TextRun({ text: m[0].slice(2, -2), bold: true, ...opts }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...opts }));
  return out;
}

const p = (text, extra = {}) => new Paragraph({ children: runs(text), spacing: { after: 120 }, ...extra });
const bullet = (text) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: runs(text), spacing: { after: 60 } });
const step = (text, last) => new Paragraph({ numbering: { reference: 'steps', level: 0 }, children: runs(text), spacing: { after: last ? 120 : 60 } });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(text) });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(text) });
const pagebreak = () => new Paragraph({ children: [new PageBreak()] });

const thin = { style: BorderStyle.SINGLE, size: 1, color: 'C9C6BF' };
const allB = { top: thin, bottom: thin, left: thin, right: thin };
const cell = (text, w, o = {}) => new TableCell({
  borders: allB, width: { size: w, type: WidthType.DXA },
  shading: o.head ? { fill: 'EEF3F3', type: ShadingType.CLEAR } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [new Paragraph({ children: runs(text, o.head ? { bold: true } : {}) })],
});
const twoColTable = (rows, w1, w2) => new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: [w1, w2],
  rows: rows.map((r, i) => new TableRow({ children: [cell(r[0], w1, { head: r[2] === true }), cell(r[1], w2, { head: r[2] === true })] })),
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const SC_LABELS = {
  driving: 'driving any vehicle for work, including to and between worksites',
  plant_machinery: 'operating plant, machinery or powered equipment',
  working_at_height: 'working at height',
  care_of_others: 'work involving the care, supervision or safeguarding of others',
  security: 'security duties',
  hazardous_substances: 'work with hazardous substances or in hazardous atmospheres',
  lone_working: 'lone working in circumstances where impairment would create significant risk',
};

const PACK_LABELS = {
  employee_awareness_leaflet: 'Employee awareness leaflet — a plain-language summary of this policy for all staff.',
  manager_guidance: 'Manager guidance — recognising possible impairment, holding the conversation, and arranging for-cause testing.',
  toolbox_talk: 'Toolbox talk — a 10-minute team briefing with sign-off sheet.',
  consent_forms: 'Consent and declaration forms — testing consent and medication declaration templates.',
  contract_clause: 'Contract clause — wording for employment contracts and contractor engagement terms referencing this policy.',
};

/* normalise + default the answers payload */
function normalise(a) {
  const q = a.quiz || {};
  const details = a.details || {};
  const jurisdiction = ['ni', 'gb', 'roi', 'uk_roi'].includes(q.jurisdiction) ? q.jurisdiction : 'ni';
  const now = new Date();
  const reviewMonths = details.reviewCycle === '24' ? 24 : 12;
  const review = new Date(now); review.setMonth(review.getMonth() + reviewMonths);
  return {
    company: String(details.company || a.lead && a.lead.company || 'The organisation').trim().slice(0, 120),
    jurisdiction,
    headcount: q.headcount || 'small',
    stance: a.stance === 'zero_tolerance' ? 'zero_tolerance' : 'support_first',
    alcoholEvents: a.alcoholEvents === 'authorised' ? 'authorised' : 'none',
    testingEnabled: a.testingEnabled === 'reserve' ? 'reserve' : 'active',
    testingTypes: Array.isArray(a.testingTypes) ? a.testingTypes : [],
    randomMethod: a.randomMethod === 'whole_site' ? 'whole_site' : 'independent_random',
    sampleTypes: Array.isArray(a.sampleTypes) && a.sampleTypes.length ? a.sampleTypes : ['urine'],
    provider: ['nivha', 'other', 'undecided'].includes(a.provider) ? a.provider : 'undecided',
    scTypes: (Array.isArray(a.scTypes) ? a.scTypes : []).filter(t => SC_LABELS[t]),
    scScope: a.scScope === 'all_staff' ? 'all_staff' : 'subset',
    hasSC: (Array.isArray(a.scTypes) && a.scTypes.length > 0),
    support: { eap: (a.support || {}).eap === 'yes', oh: (a.support || {}).oh === 'yes', selfReferral: (a.support || {}).selfReferral !== 'no' },
    policyOwner: String(details.policyOwner || 'the policy owner').trim().slice(0, 80),
    dpContact: String(details.dpContact || 'the policy owner').trim().slice(0, 80),
    reviewMonths,
    packItems: (Array.isArray(a.packItems) ? a.packItems : []).filter(k => PACK_LABELS[k]),
    generated: fmtDate(now),
    reviewDate: fmtDate(review),
    refNumber: String(a.refNumber || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 20),
  };
}

function appliesTo(j) {
  return {
    ni: 'Operations in Northern Ireland',
    gb: 'Operations in Great Britain',
    roi: 'Operations in the Republic of Ireland',
    uk_roi: 'Operations in the United Kingdom and the Republic of Ireland, applied according to the jurisdiction of employment',
  }[j];
}

function buildChildren(v) {
  const c = [];
  const co = v.company;
  const owner = v.policyOwner;
  const isUK = v.jurisdiction === 'ni' || v.jurisdiction === 'gb' || v.jurisdiction === 'uk_roi';
  const isROI = v.jurisdiction === 'roi' || v.jurisdiction === 'uk_roi';
  const scDriving = v.hasSC && v.scTypes.includes('driving');
  const testing = v.testingEnabled === 'active';
  const largeOrg = v.headcount === 'medium' || v.headcount === 'large';

  /* cover */
  c.push(
    new Paragraph({ spacing: { before: 2400, after: 240 }, children: [new TextRun({ text: 'Drug and alcohol policy', bold: true, size: 64, color: HEAD })] }),
    new Paragraph({ spacing: { after: 480 }, children: [new TextRun({ text: co, bold: true, size: 36, color: ACCENT })] }),
    p(`Document version 1.0 \u00b7 generated ${v.generated}${v.refNumber ? ' \u00b7 order ' + v.refNumber : ''}`),
    p('Prepared with NIVHA Laboratory Services'),
    pagebreak(),
  );

  /* document control */
  c.push(h1('Document control'));
  c.push(twoColTable([
    ['Policy owner', owner],
    ['Applies to', appliesTo(v.jurisdiction)],
    ['Date adopted', 'To be completed on adoption'],
    ['Next review', `${v.reviewDate} (${v.reviewMonths === 12 ? 'annual review' : 'two-yearly review'})`],
    ['Document version', `1.0 \u00b7 generated ${v.generated}`],
  ], 3000, 6026));
  c.push(p(''));
  c.push(p('**Important notice.** This policy is a template prepared for general use and is not legal advice. Organisations should take their own advice on employment law matters, particularly before dismissal decisions.'));

  /* 1 purpose and scope */
  c.push(h1('1. Purpose and scope'));
  c.push(p(`1.1 This policy sets out the approach of ${co} ("the organisation") to alcohol, drugs and other psychoactive substances in connection with work. Its purpose is to protect the health, safety and wellbeing of employees and others affected by the organisation\u2019s activities, to ensure the organisation meets its legal duties, and to make expectations clear to everyone who works for or with the organisation.`));
  c.push(p('1.2 This policy applies to all employees, workers and officers of the organisation, and to contractors, agency workers and others engaged to carry out work for the organisation as set out in section 13. It applies during working hours, whenever someone is on organisation premises or worksites, when driving or travelling for work, when operating equipment or vehicles provided by the organisation, and at work-related events.'));
  c.push(p(`1.3 This policy does not form part of any contract of employment and may be amended following consultation. The current version is available from the ${owner.toLowerCase()}.`));

  /* 2 policy statement */
  c.push(h1('2. Policy statement'));
  if (v.stance === 'zero_tolerance') {
    c.push(p('2.1 The organisation operates a zero tolerance approach. No one may report for work, remain at work or carry out any work activity while under the influence of alcohol, illegal drugs or other psychoactive substances. Breaches of this policy are treated as serious misconduct and may result in dismissal.'));
    c.push(p('2.2 The organisation nevertheless recognises that substance dependence is a health condition. Anyone who comes forward voluntarily to seek help before a breach arises will be supported as set out in section 11.'));
  } else {
    c.push(p('2.1 The organisation is committed to a safe, healthy and productive working environment. No one may report for work, remain at work or carry out any work activity while impaired by alcohol, illegal drugs or other psychoactive substances.'));
    c.push(p('2.2 The organisation recognises that problems with alcohol or drugs are often health matters. Where someone comes forward, or a problem comes to light, the organisation\u2019s first response will be to offer support and treatment as set out in section 11. Support does not displace the standards in this policy: impairment at work, and any breach involving safety-critical duties, remains a disciplinary matter.'));
  }

  /* 3 definitions */
  const providerDef = v.provider === 'nivha'
    ? 'NIVHA Laboratory Services, the organisation\u2019s appointed workplace testing provider, operating collection services from Belfast and Derry~Londonderry.'
    : v.provider === 'other'
      ? 'The organisation\u2019s appointed workplace testing provider, as notified to staff.'
      : 'An accredited workplace testing provider appointed by the organisation.';
  c.push(h1('3. Definitions'));
  c.push(twoColTable([
    ['Term', 'Meaning', true],
    ['Alcohol', 'Any beverage or substance containing ethanol, in any quantity.'],
    ['Drugs', 'Controlled drugs within the meaning of the applicable misuse of drugs legislation, whether or not prescribed, together with any other substance taken for its intoxicating effect.'],
    ['Psychoactive substances', 'Substances which produce a psychoactive effect, including so-called "legal highs", nitrous oxide and solvents, whether or not their supply is unlawful.'],
    ['Medication', 'Prescribed medicines, over-the-counter medicines and medicinal cannabis products, used in accordance with the prescriber\u2019s or manufacturer\u2019s directions.'],
    ['Impairment', 'A state in which a person\u2019s ability to work safely and effectively is, or may reasonably be believed to be, adversely affected by alcohol, drugs, psychoactive substances or medication.'],
    ['Under the influence', 'Having alcohol or drugs in the body above the standard applied by this policy, as confirmed through the testing procedure in section 9, or displaying signs of impairment.'],
    ['Safety-critical work', 'Work where impaired performance could result in a risk of significant harm to the worker or others' + (v.hasSC ? ', as defined in section 8.' : '.')],
    ['Testing provider', providerDef],
  ], 2600, 6426));

  /* 4 legal framework */
  c.push(h1('4. Legal framework'));
  let clause = 1;
  if (v.jurisdiction === 'ni' || v.jurisdiction === 'uk_roi') {
    c.push(p(`4.${clause++} The organisation has duties under the Health and Safety at Work (Northern Ireland) Order 1978 to ensure, so far as is reasonably practicable, the health, safety and welfare at work of its employees and of others affected by its undertaking. Employees have corresponding duties to take reasonable care of themselves and others and to cooperate with the organisation on health and safety matters.`));
    c.push(p(`4.${clause++} The Misuse of Drugs Act 1971 makes it an offence to possess, supply, produce or (as an occupier of premises) knowingly permit the supply or production of controlled drugs. The organisation will not knowingly permit controlled drugs on its premises and may report suspected offences to the police. The Psychoactive Substances Act 2016 makes it an offence to produce or supply psychoactive substances for their psychoactive effect.`));
    if (scDriving) c.push(p(`4.${clause++} Driving while unfit through drink or drugs is an offence under the Road Traffic (Northern Ireland) Order 1995. Anyone who drives for work must comply with the driving-for-work rules in section 8.`));
  }
  if (v.jurisdiction === 'gb') {
    c.push(p(`4.${clause++} The organisation has duties under the Health and Safety at Work etc. Act 1974 to ensure, so far as is reasonably practicable, the health, safety and welfare at work of its employees and of others affected by its undertaking. Employees have corresponding duties to take reasonable care of themselves and others.`));
    c.push(p(`4.${clause++} The Misuse of Drugs Act 1971 makes it an offence to possess, supply, produce or (as an occupier of premises) knowingly permit the supply or production of controlled drugs. The Psychoactive Substances Act 2016 makes it an offence to produce or supply psychoactive substances for their psychoactive effect.`));
    if (scDriving) c.push(p(`4.${clause++} Driving while unfit through drink or drugs is an offence under the Road Traffic Act 1988. Anyone who drives for work must comply with the driving-for-work rules in section 8.`));
  }
  if (isROI) {
    c.push(p(`4.${clause++} The organisation has duties under the Safety, Health and Welfare at Work Act 2005. Under section 13 of that Act, employees must not be under the influence of an intoxicant at work to the extent that they may endanger themselves or others, and must, if reasonably required, submit to appropriate tests conducted in accordance with regulations. The Misuse of Drugs Acts 1977 to 2016 govern controlled drugs.`));
    if (scDriving) c.push(p(`4.${clause++} The Road Traffic Acts make it an offence to drive while under the influence of an intoxicant. Anyone who drives for work must comply with the driving-for-work rules in section 8.`));
  }
  c.push(p(`4.${clause} Information about workers\u2019 health, including drug and alcohol test results, is special category data under data protection law and is handled as set out in section 12.`));

  /* 5 roles and responsibilities */
  c.push(h1('5. Roles and responsibilities'));
  if (!largeOrg) {
    c.push(twoColTable([
      ['Who', 'Responsibilities', true],
      [owner, 'Owns this policy; decides when testing is required; handles concerns, disclosures and breaches; arranges support; keeps this policy under review.'],
      ['Line managers', `Apply this policy consistently; remain alert to signs of impairment; remove anyone who appears unfit from work${v.hasSC ? ' (especially safety-critical work)' : ''} and escalate to the ${owner.toLowerCase()} without delay.`],
      ['All employees and workers', 'Comply with this policy; report fitness-for-work concerns; declare relevant medication as required by section 7' + (testing ? '; cooperate with testing under section 9.' : '.')],
    ], 3200, 5826));
  } else {
    const rows = [
      ['Who', 'Responsibilities', true],
      ['Senior management', 'Ensure this policy is resourced, communicated and applied consistently across the organisation.'],
      [owner, `Owns this policy; ${testing ? 'oversees the testing programme and provider relationship; ' : ''}keeps this policy under review.`],
      ['Human resources', 'Advise managers on the application of this policy; coordinate support, investigations and any disciplinary process.'],
      ['Line managers', 'Remain alert to signs of impairment; remove anyone who appears unfit from work and escalate; support attendance at treatment where agreed.'],
    ];
    if (v.support.oh) rows.push(['Occupational health', 'Provide confidential advice on fitness for work, medication and rehabilitation.']);
    rows.push(['All employees and workers', 'Comply with this policy; report fitness-for-work concerns; declare relevant medication as required by section 7' + (testing ? '; cooperate with testing under section 9.' : '.')]);
    c.push(twoColTable(rows, 3200, 5826));
  }

  /* 6 rules and standards */
  c.push(h1('6. Rules and standards'));
  c.push(p('6.1 The following rules apply to everyone within the scope of this policy. No one may:'));
  c.push(bullet('report for work, remain at work or carry out work while under the influence of alcohol, drugs or psychoactive substances;'));
  c.push(bullet(`consume alcohol, drugs or psychoactive substances during working hours, including breaks${v.alcoholEvents === 'authorised' ? ', except as permitted under rule 6.3' : ''};`));
  c.push(bullet('possess, use, supply, offer to supply or produce illegal drugs or psychoactive substances on organisation premises, in organisation vehicles or at worksites;'));
  c.push(bullet('drive or operate plant, machinery or equipment in connection with work while impaired by any substance, including medication.'));
  c.push(p(v.stance === 'zero_tolerance'
    ? '6.2 The standard for alcohol at work is zero: no one may have alcohol in their system during working hours.'
    : '6.2 The standard for alcohol at work is a confirmed result above the screening cut-off applied by the testing provider, confirmed against the current NIVHA laboratory schedule.'));
  c.push(p(v.alcoholEvents === 'authorised'
    ? `6.3 Moderate consumption of alcohol may be permitted at defined work-related social events with the advance approval of the ${owner.toLowerCase()}. Anyone attending such an event must not drive for work afterwards while impaired and must be fit for duty at the start of their next working period.${v.hasSC ? ' Safety-critical duties must never follow such consumption within the same working period.' : ''}`
    : '6.3 Alcohol is not provided or permitted at work-related events organised by the organisation.'));
  if (v.hasSC && v.stance === 'support_first') {
    c.push(p('6.4 Where duties are safety-critical (section 8), the strictest standard applies regardless of the organisation\u2019s overall supportive approach: any impairment, and any confirmed positive result, requires immediate removal from safety-critical duties while the matter is dealt with under this policy.'));
  }

  /* 7 medication */
  c.push(h1('7. Medication and medicinal cannabis'));
  c.push(p(`7.1 Some prescribed and over-the-counter medicines can affect alertness, coordination or judgement. Anyone taking medication that could affect their ability to work safely must check the guidance provided with the medicine, seek advice from the prescriber or a pharmacist where unsure, and inform ${v.support.oh ? 'occupational health or ' : ''}their line manager or the ${owner.toLowerCase()} before starting work${v.hasSC ? ', and always before carrying out safety-critical work' : ''}.`));
  c.push(p('7.2 No one is required to disclose the medical condition being treated — only that they are taking medication which may affect fitness for work. Disclosures are handled confidentially under section 12, and reasonable adjustments to duties will be considered.'));
  c.push(p('7.3 Cannabis-based products for medicinal use may lawfully be prescribed. A valid prescription is handled in the same way as any other medication under this section. Use of cannabis without a prescription remains a breach of this policy, and a medical review of any laboratory finding will distinguish prescribed use from misuse before any result is reported as a policy violation.'));
  c.push(p('7.4 Failing to declare medication as required by this section, where that failure creates a safety risk, may itself be treated as a breach of this policy.'));

  /* 8 safety-critical roles — included when any SC work identified */
  if (v.hasSC) {
    c.push(h1('8. Safety-critical roles'));
    if (v.scScope === 'all_staff') {
      c.push(p(`8.1 Because of the nature of the organisation\u2019s work, all roles are designated safety-critical for the purposes of this policy. This designation is deliberate and reflects the risk profile of the organisation\u2019s activities, including ${v.scTypes.map(t => SC_LABELS[t]).join('; ')}.`));
    } else {
      c.push(p('8.1 The following work carried out for the organisation is designated safety-critical:'));
      v.scTypes.forEach((t, i) => c.push(bullet(SC_LABELS[t] + (i === v.scTypes.length - 1 ? '.' : ';'))));
    }
    c.push(p('8.2 Anyone carrying out safety-critical work must not do so while impaired by any substance, including medication, and must declare medication in accordance with section 7 before starting such work. Managers must remove anyone from safety-critical duties immediately where there is a reasonable concern about fitness for work; removal on this basis is a precaution, not a disciplinary sanction.'));
  }

  /* 9 testing */
  c.push(h1('9. Alcohol and drug testing'));
  if (!testing) {
    c.push(p('9.1 The organisation does not currently operate a programme of workplace testing. It reserves the right to introduce testing, following consultation and reasonable notice, where it considers testing necessary to meet its health and safety duties. Any future programme will follow recognised standards for legally defensible workplace testing, including laboratory confirmation and medical review of results.'));
  } else {
    c.push(h2('9.1 When testing may take place'));
    if (v.testingTypes.includes('pre_employment')) c.push(p('**Pre-employment.** Offers of employment for relevant roles are conditional on a negative test result.'));
    if (v.testingTypes.includes('random')) {
      c.push(p('**Random testing.** ' + (v.randomMethod === 'whole_site'
        ? 'The organisation may arrange unannounced testing of an entire site, team or shift. Everyone present within the selected group is tested; no individual selection takes place.'
        : 'A proportion of the workforce is selected for unannounced testing at intervals through the year. Selection is generated independently by the testing provider so that everyone within scope has an equal chance of selection on each occasion, and no one within the organisation can influence who is selected.')));
    }
    if (v.testingTypes.includes('for_cause')) c.push(p('**For cause.** Testing may be required where there is a reasonable belief, based on observed behaviour, appearance or other evidence, that someone may be under the influence of alcohol or drugs. The grounds will be recorded before the test is arranged.'));
    if (v.testingTypes.includes('post_incident')) c.push(p('**Post-incident.** Testing may be required following an accident, near miss or significant operational incident, where substance involvement cannot reasonably be ruled out.'));
    if (v.testingTypes.includes('return_to_work')) c.push(p('**Return to work and monitoring.** Where someone returns to duties following treatment or a previous breach, testing may form part of an agreed return-to-work plan for a defined period.'));

    const samples = ['urine', 'oral_fluid', 'hair', 'breath']
      .filter(s => v.sampleTypes.includes(s))
      .map(s => ({ urine: 'urine', oral_fluid: 'oral fluid', hair: 'hair', breath: 'breath' }[s]));
    const sampleList = samples.length > 1 ? samples.slice(0, -1).join(', ') + ' and ' + samples[samples.length - 1] : samples[0];
    c.push(h2('9.2 How testing is conducted'));
    c.push(p(`Testing is carried out by the testing provider using ${sampleList} samples as appropriate to the circumstances. Collection follows a documented chain of custody aligned with the European Workplace Drug Testing Society (EWDTS) guidelines: identity is verified, samples are collected and sealed in the donor\u2019s presence, and each transfer is recorded.`));
    c.push(p('Screening results that indicate the possible presence of a substance ("non-negative" results) are not treated as positive. Every non-negative screening result is sent for laboratory confirmation using accredited confirmatory analysis, with results assessed against the cut-off levels confirmed against the current NIVHA laboratory schedule.'));
    c.push(h2('9.3 Medical review'));
    c.push(p('Confirmed laboratory results are reviewed before being reported to the organisation, so that legitimate explanations — including declared medication and prescribed cannabis-based products — are identified. Only results upheld on review are reported as policy violations.'));
    c.push(h2('9.4 Split samples'));
    c.push(p('Where the sample type allows, samples are collected in split form. The second portion (the B sample) is retained by the laboratory for at least twelve months, and the donor may request analysis of the B sample at an independent accredited laboratory.'));
    c.push(h2('9.5 Consent'));
    c.push(p('Testing takes place only with the donor\u2019s informed consent, recorded at the point of collection. Consent is a condition of this policy rather than a favour: section 10 explains how a refusal is treated. No one will ever be physically compelled to provide a sample.'));
  }

  /* 10 refusal — only meaningful alongside testing, but reserve-right orgs keep it for future use */
  c.push(h1('10. Refusal, adulteration and non-compliance'));
  c.push(p(`10.1 ${testing ? 'The following are' : 'If testing is introduced under section 9, the following will be'} treated as serious misconduct and ${testing ? 'will' : 'would'} normally be dealt with in the same way as a confirmed positive result:`));
  c.push(bullet('refusing to provide a sample when required under section 9 without a reasonable explanation;'));
  c.push(bullet('failing to attend a collection appointment without a reasonable explanation;'));
  c.push(bullet('tampering with, adulterating, substituting or otherwise interfering with a sample or the collection process;'));
  c.push(bullet('attempting to influence the selection process for testing.'));
  c.push(p('10.2 Anyone asked to provide a sample will be told, at the time, that refusal is treated in this way.'));

  /* 11 support */
  c.push(h1('11. Support and assistance'));
  if (v.support.selfReferral) {
    c.push(p('11.1 Anyone who believes they have a problem with alcohol or drugs is strongly encouraged to come forward. A voluntary disclosure made before selection for testing, and before any incident or performance concern arises, will be treated as a health matter and not as a breach of this policy. The organisation will agree a support plan, which may include adjusted duties, time off for treatment and return-to-work testing.'));
  }
  c.push(p(`11.2 Support available includes ${v.support.eap ? 'the organisation\u2019s employee assistance programme, which provides free and confidential advice and counselling, ' : ''}${v.support.oh ? 'referral to occupational health, ' : ''}signposting to GP and community services, and reasonable time off to attend agreed treatment.`));
  if (!v.support.oh) {
    c.push(p(`11.3 The organisation does not retain an occupational health service. Fitness-for-work questions that need clinical input will be referred to the individual\u2019s GP or an appropriate external adviser, arranged through the ${owner.toLowerCase()}.`));
  }
  c.push(p('11.4 Engagement with support does not remove accountability for conduct. Where a breach has already occurred, support may run alongside, but does not replace, the procedures in section 14.'));

  /* 12 data protection */
  c.push(h1('12. Confidentiality and data protection'));
  c.push(p('12.1 Information handled under this policy — including disclosures, medication declarations, referrals and test results — is confidential and shared only with those who need it to carry out this policy.'));
  let dpBasis = '';
  if (isUK) dpBasis += 'They are processed under UK GDPR and the Data Protection Act 2018, on the basis of the organisation\u2019s obligations and rights in the field of employment and its legal duties to protect health and safety at work.';
  if (isROI) dpBasis += (dpBasis ? ' ' : '') + 'They are ' + (isUK ? 'also ' : '') + 'processed under the EU General Data Protection Regulation and the Data Protection Act 2018 (Ireland), on the basis of the organisation\u2019s obligations and rights in the field of employment and its statutory duties under the Safety, Health and Welfare at Work Act 2005.';
  c.push(p('12.2 Drug and alcohol test results and related health information are special category data. ' + dpBasis));
  c.push(p('12.3 The testing provider acts as a controller for the laboratory analysis it performs and provides the organisation with results on a need-to-know basis. The provider\u2019s privacy information is made available to every donor at the point of collection.'));
  c.push(p(`12.4 Records created under this policy are kept only as long as necessary for the purposes described here and are then securely destroyed. Individuals have the rights given by data protection law, including access to their own records. Questions should be directed to the ${v.dpContact.toLowerCase()}.`));

  /* 13 contractors */
  c.push(h1('13. Contractors, agency workers and visitors'));
  c.push(p('13.1 Contractors and agency workers must comply with this policy while carrying out work for the organisation. Engagement terms should reflect this, and the organisation may require evidence that a contractor operates equivalent standards of its own.'));
  c.push(p('13.2 The organisation may remove from its premises or worksites any contractor, agency worker or visitor who appears to be under the influence of alcohol or drugs, and may end an engagement where this policy is breached.'));
  if (testing) c.push(p('13.3 Where testing applies to contractors or agency workers, it is conducted on the same basis, and with the same safeguards, as for employees.'));

  /* 14 breaches */
  c.push(h1('14. Breaches and disciplinary action'));
  c.push(p('14.1 Breaches of this policy are dealt with under the organisation\u2019s disciplinary procedure. ' + (v.stance === 'zero_tolerance'
    ? 'A confirmed positive result, refusal or adulteration under section 10, or being under the influence at work will normally be treated as gross misconduct, for which dismissal is a potential outcome.'
    : `The response will take account of the circumstances, including any voluntary disclosure, engagement with support and the safety implications of the role. ${v.hasSC ? 'Being under the influence while carrying out safety-critical work, supplying' : 'Supplying'} drugs, and refusal or adulteration under section 10 will normally be treated as gross misconduct.`)));
  c.push(p('14.2 Possession, supply or production of illegal drugs on organisation premises may also be reported to the police.'));
  c.push(p('14.3 Nothing in this policy prevents the organisation taking precautionary action, including suspension on pay, while a matter is investigated.'));

  /* 15 communication and review */
  c.push(h1('15. Communication, training and review'));
  c.push(p(`15.1 This policy is issued to everyone within its scope, forms part of induction, and is available on request from the ${owner.toLowerCase()}.`));
  c.push(p('15.2 Managers receive guidance on recognising possible signs of impairment and on applying this policy consistently.'
    + (v.packItems.includes('manager_guidance') ? ' The accompanying manager guidance document supports this.' : '')
    + (v.packItems.includes('toolbox_talk') ? ' A toolbox talk is provided for briefing work teams.' : '')));
  c.push(p(`15.3 This policy is reviewed ${v.reviewMonths === 12 ? 'annually' : 'every two years'}, and sooner where legislation, guidance or the organisation\u2019s operations change. The next review is due by ${v.reviewDate}.`));

  /* appendix A — only when testing is active */
  if (testing) {
    c.push(pagebreak());
    c.push(h1('Appendix A — testing procedure summary for donors'));
    c.push(p('This summary is given to anyone asked to provide a sample. It reflects sections 9 and 10 of the policy.'));
    [
      'You will be told why you are being asked to provide a sample (for example random selection or post-incident testing) and asked to confirm your identity.',
      'A trained collector will explain the process and ask you to sign a consent form. You may ask questions at any point. You will be told how a refusal is treated before you decide.',
      'You may declare any medication you are taking. You do not have to say what condition it treats.',
      'Your sample is collected and sealed in front of you, labelled with a unique reference, and sent to the laboratory under a documented chain of custody.',
      'A screening result that is not negative is always confirmed by laboratory analysis before anyone treats it as positive, and confirmed results are medically reviewed to rule out legitimate explanations.',
      'Where the sample type allows, a second sealed portion (the B sample) is retained, and you may ask for it to be analysed at an independent accredited laboratory.',
      'You will be given a copy of the privacy information explaining how your data is used, and you can ask for a copy of your own results.',
    ].forEach((t, i, arr) => c.push(step(t, i === arr.length - 1)));
  }

  /* appendix B — only when pack items selected */
  if (v.packItems.length) {
    if (!testing) c.push(pagebreak());
    c.push(h1(`Appendix ${testing ? 'B' : 'A'} — document pack`));
    c.push(p('The following supporting documents accompany this policy:'));
    v.packItems.forEach(k => c.push(bullet(PACK_LABELS[k])));
  }

  /* closing note */
  c.push(p(''));
  c.push(p('Laboratory cut-off levels and related scientific figures are confirmed against the current NIVHA laboratory schedule and issued as a versioned appendix following scientific sign-off. This document is a template for the organisation to review and adopt — it is not legal advice.'));

  return c;
}

async function buildPolicyDoc(answers) {
  const v = normalise(answers || {});
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: BODY }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 30, bold: true, font: FONT, color: HEAD },
          paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, font: FONT, color: HEAD },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Drug and alcohol policy — ${v.company} — v1.0`, color: '999999', size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Page ', size: 16, color: '999999' }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' }), new TextRun({ text: ' of ', size: 16, color: '999999' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '999999' })] })] }) },
      children: buildChildren(v),
    }],
  });
  const buf = await Packer.toBuffer(doc);
  return { buffer: buf, filename: `Drug-and-alcohol-policy-${v.company.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'policy'}.docx` };
}

module.exports = { buildPolicyDoc };
