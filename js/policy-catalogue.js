/* NIVHA drug and alcohol policy builder — catalogue (prototype)
   Quiz questions, jurisdiction content, snapshot logic and pricing.
   All prices are indicative and for NIVHA review. */

/* ---------------- pricing (indicative, + VAT) ---------------- */
const POLICY_PRICE = 125;            /* tailored policy document */
const PACK_ITEM_PRICE = 55;          /* each supporting document */
const PACK_BUNDLE_PRICE = 220;       /* all five supporting documents */
const CLIENT_DISCOUNT = 0.4;         /* NIVHA client rate — 40% off */
const DEMO_CLIENT_CODE = 'NIVHA-CLIENT';
const VAT_RATE = 0.2;

/* ---------------- document pack ---------------- */
const PACK_ITEMS = [
  { id: 'employee_awareness_leaflet', name: 'Employee awareness leaflet', sub: 'A plain-language summary of the policy for all staff — what it means for them, in one page.' },
  { id: 'manager_guidance', name: 'Manager guidance', sub: 'Recognising possible impairment, holding the conversation, and arranging for-cause testing without getting it wrong.' },
  { id: 'toolbox_talk', name: 'Toolbox talk', sub: 'A ten-minute team briefing with a sign-off sheet — evidence the policy was communicated.' },
  { id: 'consent_forms', name: 'Consent and declaration forms', sub: 'Testing consent and medication declaration templates, ready to use on collection day.' },
  { id: 'contract_clause', name: 'Contract clause wording', sub: 'Wording for employment contracts and contractor engagement terms referencing the policy.' }
];

/* ---------------- quiz (free layer) ---------------- */
const QUIZ = [
  {
    id: 'jurisdiction', label: 'Where do your people work?',
    hint: 'The legal framework your policy must cite depends on jurisdiction.',
    options: [
      { id: 'ni', title: 'Northern Ireland' },
      { id: 'gb', title: 'Great Britain' },
      { id: 'roi', title: 'Republic of Ireland' },
      { id: 'uk_roi', title: 'Both UK and Republic of Ireland' }
    ]
  },
  {
    id: 'headcount', label: 'How many people work for the organisation?',
    hint: 'Counting employees, and contractors if you use them.',
    options: [
      { id: 'micro', title: '1 to 10' },
      { id: 'small', title: '11 to 50' },
      { id: 'medium', title: '51 to 250' },
      { id: 'large', title: 'More than 250' }
    ]
  },
  {
    id: 'sector', label: 'Which is closest to what you do?',
    options: [
      { id: 'construction', title: 'Construction and trades' },
      { id: 'transport', title: 'Transport and logistics' },
      { id: 'manufacturing', title: 'Manufacturing and engineering' },
      { id: 'care', title: 'Health, care and education' },
      { id: 'office', title: 'Office and professional services' },
      { id: 'other', title: 'Something else' }
    ]
  },
  {
    id: 'safety_critical', label: 'Do any roles involve safety-critical work?',
    hint: 'Driving for work, operating machinery, working at height, care of vulnerable people — work where impairment could cost a life.',
    options: [
      { id: 'yes', title: 'Yes' },
      { id: 'no', title: 'No' },
      { id: 'unsure', title: 'Not sure' }
    ]
  },
  {
    id: 'testing_today', label: 'Does the organisation test for drugs or alcohol today?',
    options: [
      { id: 'yes', title: 'Yes, we test' },
      { id: 'planning', title: 'No, but we are considering it' },
      { id: 'no', title: 'No, and no plans to' }
    ]
  },
  {
    id: 'policy_today', label: 'Does a written drug and alcohol policy exist today?',
    options: [
      { id: 'none', title: 'No policy' },
      { id: 'old', title: 'Yes, but over two years old' },
      { id: 'recent', title: 'Yes, reviewed recently' }
    ]
  }
];

/* ---------------- jurisdiction content ---------------- */
const JURISDICTIONS = {
  ni: {
    name: 'Northern Ireland',
    legislation: [
      'Health and Safety at Work (Northern Ireland) Order 1978 — the duty of care your policy is built on',
      'Misuse of Drugs Act 1971 — controlled drugs on your premises',
      'Psychoactive Substances Act 2016 — so-called legal highs, missed by most older policies',
      'UK GDPR and Data Protection Act 2018 — test results are special category health data'
    ]
  },
  gb: {
    name: 'Great Britain',
    legislation: [
      'Health and Safety at Work etc. Act 1974 — the duty of care your policy is built on',
      'Misuse of Drugs Act 1971 — controlled drugs on your premises',
      'Psychoactive Substances Act 2016 — so-called legal highs, missed by most older policies',
      'UK GDPR and Data Protection Act 2018 — test results are special category health data'
    ]
  },
  roi: {
    name: 'Republic of Ireland',
    legislation: [
      'Safety, Health and Welfare at Work Act 2005 — including the section 13 duty not to be under the influence of an intoxicant at work',
      'Misuse of Drugs Acts 1977 to 2016 — controlled drugs on your premises',
      'EU GDPR and Data Protection Act 2018 — test results are special category health data'
    ]
  },
  uk_roi: {
    name: 'UK and Republic of Ireland',
    legislation: [
      'Health and Safety at Work legislation in each UK jurisdiction, plus the Safety, Health and Welfare at Work Act 2005 with its section 13 intoxicants duty in the Republic of Ireland',
      'Misuse of Drugs Act 1971 (UK) and Misuse of Drugs Acts 1977 to 2016 (Ireland)',
      'Psychoactive Substances Act 2016 (UK)',
      'UK GDPR and EU GDPR with the respective Data Protection Acts 2018 — test results are special category health data in both'
    ]
  }
};

const SECTOR_NOTES = {
  construction: 'On construction sites, for-cause and post-incident testing arrangements are increasingly expected by principal contractors — many main contractors now ask to see your policy at pre-qualification.',
  transport: 'Where people drive for work, road traffic law sits alongside workplace law — and a defensible policy separates the two clearly.',
  manufacturing: 'Around plant and machinery, an impairment-at-work standard on its own is hard to operate — designated safety-critical roles with a stricter standard are the recognised approach.',
  care: 'Where your people care for vulnerable people, regulators and commissioners increasingly expect substance misuse arrangements as part of safeguarding.',
  office: 'Lower physical risk does not remove the duty of care — and alcohol at client events is where office policies most often go wrong.',
  other: 'Whatever the setting, the duty of care to provide a safe system of work applies — and a policy is the recognised way to discharge it.'
};

/* ---------------- paid wizard content ---------------- */
const SC_TYPES = [
  { id: 'driving', name: 'Driving any vehicle for work' },
  { id: 'plant_machinery', name: 'Operating plant, machinery or powered equipment' },
  { id: 'working_at_height', name: 'Working at height' },
  { id: 'electrical_gas', name: 'Electrical, gas or pressurised systems work' },
  { id: 'care_clinical', name: 'Care of vulnerable people, or clinical duties' },
  { id: 'security', name: 'Security or lone working' }
];

const TESTING_TYPES = [
  { id: 'pre_employment', name: 'Pre-employment', sub: 'Screening as part of recruitment, before a start date is confirmed.' },
  { id: 'random', name: 'Random', sub: 'Unannounced testing of people selected by an independent, documented method.' },
  { id: 'for_cause', name: 'For cause', sub: 'Where behaviour, appearance or other evidence gives reasonable belief of impairment.' },
  { id: 'post_incident', name: 'Post-incident', sub: 'After an accident, near miss or significant operational incident.' },
  { id: 'return_to_work', name: 'Return to work and monitoring', sub: 'Part of an agreed plan after treatment or a previous breach.' }
];

const SAMPLE_TYPES = [
  { id: 'urine', name: 'Urine' },
  { id: 'oral_fluid', name: 'Oral fluid' },
  { id: 'hair', name: 'Hair' },
  { id: 'breath', name: 'Breath (alcohol)' }
];

/* ---------------- policy document map (review step) ---------------- */
const DOC_SECTIONS = [
  { num: '1', title: 'Purpose and scope' },
  { num: '2', title: 'Policy statement' },
  { num: '3', title: 'Definitions' },
  { num: '4', title: 'Legal framework' },
  { num: '5', title: 'Roles and responsibilities' },
  { num: '6', title: 'Rules' },
  { num: '7', title: 'Medication and medicinal cannabis' },
  { num: '8', title: 'Safety-critical roles' },
  { num: '9', title: 'Testing' },
  { num: '10', title: 'Refusal and adulteration' },
  { num: '11', title: 'Support and rehabilitation' },
  { num: '12', title: 'Data protection' },
  { num: '13', title: 'Contractors and third parties' },
  { num: '14', title: 'Breaches of this policy' },
  { num: '15', title: 'Communication and review' },
  { num: 'A', title: 'Appendix A — testing procedure summary for donors' },
  { num: 'B', title: 'Appendix B — document pack' }
];
