/* NIVHA Fee Note — product catalogue (simulation)
   Content and pricing taken from the live NIVHA fee note form
   (form.jotform.com/nivha/FeeNoteDandATesting). All prices exclusive of VAT. */

const VAT_RATE = 0.20;
const FAST_TRACK_FEE = 80;            /* per panel, + VAT */
const DERRY_COLLECTION_FEE = 75;      /* Derry~Londonderry office collection, + VAT */

/* Combined panel rates from the form — applied automatically when both panels are chosen */
const COMBINED_RATES = [
  { codes: ['H-DP1', 'H-DP3'], price: 600, saving: 60, label: 'Combined rate — H-DP1 + H-DP3' }
];

const CATALOGUE = [
  /* ---------- HAIR ---------- */
  {
    code: 'H-DP1', group: 'hair', price: 330, fastTrack: true, popular: true,
    name: 'Standard drug panel',
    detects: 'Cannabis, cocaine and metabolites, ecstasy drugs, amphetamine and methamphetamine, opiates including heroin, and common benzodiazepines such as diazepam, temazepam and alprazolam.',
    window: 'Around 3 months of history (3cm of head hair). New use takes about a week to appear in hair.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'The panel most courts ask for. If you need ketamine, methadone or the wider benzodiazepine and sleep-medicine range as well, choose the extended panel instead — it already includes everything in this one. Additional hair segments can be analysed — priced on application.'
  },
  {
    code: 'H-DP2', group: 'hair', price: 450, fastTrack: true, includes: ['H-DP1'],
    name: 'Extended drug panel',
    detects: 'Everything in the standard panel, plus ketamine, methadone, buprenorphine and a wider benzodiazepine range including sleep medicines such as zopiclone and zolpidem.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Includes the full standard panel — you do not need to order both. Additional hair segments can be analysed — priced on application.'
  },
  {
    code: 'H-DP3', group: 'hair', price: 330, fastTrack: true,
    name: 'Prescription analgesics panel',
    detects: 'Tramadol, oxycodone, dihydrocodeine, hydrocodone, hydromorphone, and the anticonvulsants pregabalin and gabapentin.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Choose this where misuse of prescribed painkillers is a concern. Ordered together with the standard panel, the combined rate of £600 + VAT applies automatically — a £60 saving.'
  },
  {
    code: 'H-DP4', group: 'hair', price: 350, fastTrack: false,
    name: 'Prevalent benzodiazepines panel',
    detects: 'Etizolam, bromazolam, clonazolam, flualprazolam, flubromazolam, meclonazepam and clobazam — non-pharmaceutical benzodiazepines currently prevalent in forensic casework.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Useful where street or non-pharmaceutical benzodiazepines are suspected. Fast track is not available for this panel.'
  },
  {
    code: 'H-DNPS', group: 'hair', price: 450, fastTrack: true,
    name: 'Novel psychoactive substances',
    detects: 'Synthetic cannabinoid receptor agonists, cathinones, tryptamines, phenethylamines and fentanyls. Drugs already covered by the standard panels are not included.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Only needed where specific novel substances are suspected — our team can advise if unsure.',
    variants: [
      { short: 'Qualitative', label: 'Qualitative', price: 450 },
      { short: 'Quantitative', label: 'Quantitative estimation (if reference standard available)', price: 510 }
    ]
  },
  {
    code: 'H-DAS', group: 'hair', price: 450, fastTrack: true,
    name: 'Anabolic steroids panel',
    detects: 'Synthetic anabolic steroids and steroid esters.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Choose this where steroid use is a specific concern.'
  },
  {
    code: 'H-DSD', group: 'hair', price: 300, fastTrack: true,
    name: 'Single specified drug',
    detects: 'One drug of your choosing, named at instruction.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'A focused test for one named substance — tell us which drug when you complete your details.',
    variants: [
      { short: 'Standard', label: 'Standard analysis', price: 300 },
      { short: 'Confirmatory only', label: 'Confirmatory analysis only', price: 350 }
    ]
  },
  {
    code: 'H-EtG', group: 'hair', price: 330, fastTrack: true, popular: true,
    name: 'Alcohol — abstinence assessment',
    detects: 'EtG, the alcohol marker recommended for assessing claimed abstinence.',
    window: 'Around 3 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'The right choice where someone says they are not drinking and the court needs that verified.'
  },
  {
    code: 'H-EtG-FAEE', group: 'hair', price: 500, fastTrack: true, includes: ['H-EtG'],
    name: 'Alcohol — chronic excessive assessment',
    detects: 'EtG and FAEE together, the paired markers recommended for assessing chronic excessive drinking.',
    window: 'Around 3 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Includes the abstinence marker — you do not need to order both alcohol tests.'
  },

  /* ---------- NAIL ---------- */
  {
    code: 'N-DP1', group: 'nail', price: 355, fastTrack: true,
    name: 'Standard drug panel',
    detects: 'Cannabis, cocaine and metabolites, ecstasy drugs, amphetamine and methamphetamine, opiates including heroin, and common benzodiazepines such as diazepam, temazepam and alprazolam.',
    window: '6 to 12 months of history. Nails show sustained use rather than one-off events.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Useful where hair is too short or treated, or a longer history is needed. Nail polish and false nails must be removed before collection.'
  },
  {
    code: 'N-DP2', group: 'nail', price: 475, fastTrack: true, includes: ['N-DP1'],
    name: 'Extended drug panel',
    detects: 'Everything in the standard nail panel, plus ketamine, methadone, buprenorphine and a wider benzodiazepine range including sleep medicines such as zopiclone and zolpidem.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Includes the full standard nail panel — you do not need to order both.'
  },
  {
    code: 'N-DP3', group: 'nail', price: 355, fastTrack: true,
    name: 'Prescription analgesics panel',
    detects: 'Tramadol, oxycodone, dihydrocodeine, hydrocodone, hydromorphone, and the anticonvulsants pregabalin and gabapentin.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'The nail equivalent of the hair analgesics panel.'
  },
  {
    code: 'N-DNPS', group: 'nail', price: 475, fastTrack: true,
    name: 'Novel psychoactive substances',
    detects: 'Synthetic cannabinoid receptor agonists, cathinones, tryptamines, phenethylamines and fentanyls. Drugs already covered by the standard panels are not included.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Only needed where specific novel substances are suspected — our team can advise if unsure.',
    variants: [
      { short: 'Qualitative', label: 'Qualitative', price: 475 },
      { short: 'Quantitative', label: 'Quantitative estimation (if reference standard available)', price: 535 }
    ]
  },
  {
    code: 'N-DAS', group: 'nail', price: 475, fastTrack: true,
    name: 'Anabolic steroids panel',
    detects: 'Synthetic anabolic steroids and steroid esters.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Choose this where steroid use is a specific concern.'
  },
  {
    code: 'N-DSD', group: 'nail', price: 325, fastTrack: true,
    name: 'Single specified drug',
    detects: 'One drug of your choosing, named at instruction.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'A focused test for one named substance — tell us which drug when you complete your details.'
  },
  {
    code: 'N-EtG', group: 'nail', price: 355, fastTrack: true,
    name: 'Alcohol — abstinence assessment',
    detects: 'EtG, the alcohol marker, measured in nail.',
    window: '6 to 12 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'An alternative where head hair is unavailable. Where suitable hair cannot be collected, blood PEth can also be considered.'
  },

  /* ---------- URINE ---------- */
  {
    code: 'U-MUI-1', group: 'urine', price: 130, fastTrack: false, popular: true, series: true,
    name: 'Standard urine panel',
    detects: 'Cannabis, cocaine, ecstasy drugs, amphetamine and methamphetamine, ketamine, opiates including heroin, methadone, tramadol and common benzodiazepines. Alcohol is checked by breath test at the appointment.',
    window: 'Roughly the last 3 to 4 days. Cannabis and benzodiazepines can show for longer.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Shows recent use that hair cannot — new drug use takes about a week to appear in hair. An unannounced series of two or three collections can monitor ongoing abstention.'
  },
  {
    code: 'U-MUI-2', group: 'urine', price: 130, fastTrack: false, series: true,
    name: 'Cathinones and additional analgesics',
    detects: 'Pregabalin, gabapentin, buprenorphine and cathinones including mephedrone and MDPV. Alcohol is checked by breath test at the appointment.',
    window: 'Roughly the last 3 to 4 days.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Covers drugs the standard urine panel does not. Individual drugs from this panel can instead be added to the standard panel at £50 + VAT per drug — call us to arrange that.'
  },
  {
    code: 'U-EtG-EtS', group: 'urine', price: 130, fastTrack: false, series: true,
    name: 'Alcohol markers — EtG and EtS',
    detects: 'Ethyl glucuronide and ethyl sulphate, minor alcohol metabolites used in clinical alcohol assessment.',
    window: 'Very recent drinking — a few days at most.',
    turnaround: 'About 10 working days. Laboratory results are provided without a NIVHA expert report.',
    help: 'A clinical check on recent alcohol use. Where the court needs an interpreted expert report on alcohol, hair EtG or blood PEth is usually the better choice.'
  },
  {
    code: 'U-AS', group: 'urine', price: 400, fastTrack: false,
    name: 'Anabolic steroids panel',
    detects: 'Synthetic anabolic steroids in urine.',
    window: 'Recent use — days rather than months.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Choose this where recent steroid use is a specific concern.'
  },
  {
    code: 'U-NPS', group: 'urine', price: 425, fastTrack: false,
    name: 'Novel psychoactive substances',
    detects: 'Synthetic cannabinoid receptor agonists, cathinones, tryptamines, phenethylamines and fentanyls in urine.',
    window: 'Recent use — days rather than months.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Only needed where specific novel substances are suspected.',
    variants: [
      { short: 'Qualitative', label: 'Qualitative', price: 425 },
      { short: 'Quantitative', label: 'Quantitative estimation (if reference standard available)', price: 485 }
    ]
  },

  /* ---------- BLOOD ---------- */
  {
    code: 'DBS-PEth', group: 'blood', price: 250, fastTrack: true, popular: true,
    name: 'PEth — recent alcohol marker',
    detects: 'Phosphatidylethanol, a direct blood marker of alcohol consumption, measured in dried blood spots.',
    window: 'Roughly the last 28 days — bridges the gap between breath tests and hair.',
    turnaround: 'About 15 working days. A full interpreted expert report is issued.',
    help: 'A strong complement to hair alcohol markers — hair covers months, PEth covers the last four weeks.'
  },
  {
    code: 'B-LFT', group: 'blood', price: 125, fastTrack: false,
    name: 'Liver function test',
    detects: 'Liver enzyme levels sometimes affected by sustained heavy drinking.',
    window: 'General health indicator rather than a dated window.',
    turnaround: 'Laboratory results are provided without a NIVHA expert report.',
    help: 'An indirect marker. Clinical interpretation of the results can be added at £125 + VAT.'
  },
  {
    code: 'B-CDT', group: 'blood', price: 145, fastTrack: false,
    name: 'CDT — alcohol blood marker',
    detects: 'Carbohydrate-deficient transferrin, raised by sustained heavy drinking.',
    window: 'Roughly the last 2 to 4 weeks of heavy drinking.',
    turnaround: 'Laboratory results are provided without a NIVHA expert report.',
    help: 'An indirect marker. Most instructions now use PEth instead, which comes with a full expert report. Clinical interpretation of the results can be added at £125 + VAT.'
  }
];

/* Panels that already include another panel — used for automatic conflict resolution */
const INCLUSION_RULES = [
  { superset: 'H-DP2', subset: 'H-DP1' },
  { superset: 'N-DP2', subset: 'N-DP1' },
  { superset: 'H-EtG-FAEE', subset: 'H-EtG' }
];

const GROUP_META = {
  hair:  { label: 'Hair',  note: 'Around 3 months of history. Collected at either office. Additional segments priced on application.' },
  nail:  { label: 'Nail',  note: '6 to 12 months of history. Belfast office only — polish and false nails must be removed.' },
  urine: { label: 'Urine', note: 'Recent use — the last few days. Alcohol checked by breath test. Unannounced series of two or three collections available.' },
  blood: { label: 'Blood', note: 'Alcohol markers covering roughly the last month.' }
};

/* Step 2 — concern-to-panel mapping */
const CONCERNS = [
  {
    id: 'drugs-months', icon: 'calendar',
    title: 'Drug use over recent months',
    sub: 'A picture of the last 3 months or so',
    recommends: ['H-DP1']
  },
  {
    id: 'drugs-recent', icon: 'clock',
    title: 'Drug use in the last few days',
    sub: 'Very recent use that hair cannot yet show',
    recommends: ['U-MUI-1']
  },
  {
    id: 'drugs-extended', icon: 'layers',
    title: 'A wider range of drugs',
    sub: 'Including ketamine, methadone and sleep medicines',
    recommends: ['H-DP2']
  },
  {
    id: 'analgesics', icon: 'pill',
    title: 'Prescription painkiller misuse',
    sub: 'Tramadol, pregabalin, gabapentin and similar',
    recommends: ['H-DP3']
  },
  {
    id: 'street-benzos', icon: 'alert',
    title: 'Street benzodiazepines',
    sub: 'Etizolam and other non-prescribed benzodiazepines',
    recommends: ['H-DP4']
  },
  {
    id: 'alc-abstinence', icon: 'shield',
    title: 'Alcohol — verifying abstinence',
    sub: 'Someone says they are not drinking',
    recommends: ['H-EtG']
  },
  {
    id: 'alc-chronic', icon: 'wave',
    title: 'Alcohol — chronic excessive drinking',
    sub: 'Evidence of sustained heavy drinking',
    recommends: ['H-EtG-FAEE', 'DBS-PEth']
  },
  {
    id: 'long-history', icon: 'history',
    title: 'A longer history — 6 to 12 months',
    sub: 'Sustained use over a longer period',
    recommends: ['N-DP1']
  },
  {
    id: 'not-sure', icon: 'help',
    title: 'Not sure — recommend for me',
    sub: 'We will start you with the most common instruction',
    recommends: ['H-DP1', 'H-EtG']
  }
];

const KNOWN_ORGS = [
  'Belfast Health and Social Care Trust',
  'Northern Health and Social Care Trust',
  'South Eastern Health and Social Care Trust',
  'Southern Health and Social Care Trust',
  'Western Health and Social Care Trust',
  'Kristina Murray Solicitors',
  'Breen Lenzi Maguire Solicitors',
  'JJ Rice and Co Solicitors',
  'Denis Humphrey Solicitors, Bangor',
  'Donard King & Co Solicitors',
  'Francis Hanna and Company',
  'Madden & Finucane Solicitors',
  'MMP Solicitors',
  'McIlvenny Law',
  'Boyd Rice Solicitors',
  'Michelle Crilly Family Law'
];
