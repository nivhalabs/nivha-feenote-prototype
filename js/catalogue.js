/* NIVHA Fee Note — product catalogue (simulation)
   Prices from NIVHA Medico-Legal Fee Schedule, Northern Ireland. All prices exclusive of VAT. */

const VAT_RATE = 0.20;
const FAST_TRACK_FEE = 80;
const MOBILE_COLLECTION_FEE = 200;

const CATALOGUE = [
  /* ---------- HAIR ---------- */
  {
    code: 'H-DP1', group: 'hair', price: 330, fastTrack: true, popular: true,
    name: 'Standard drug panel',
    detects: 'Cannabis, cocaine, opiates (including heroin), amphetamines and methamphetamine.',
    window: 'Around 3 months of history (3cm of head hair). New use takes about a week to appear in hair.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'The panel most courts ask for. If you need ketamine, methadone or benzodiazepines as well, choose the extended panel instead — it already includes everything in this one.'
  },
  {
    code: 'H-DP2', group: 'hair', price: 450, fastTrack: true, includes: ['H-DP1'],
    name: 'Extended drug panel',
    detects: 'Everything in the standard panel, plus ketamine, methadone, buprenorphine and benzodiazepines.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Includes the full standard panel — you do not need to order both.'
  },
  {
    code: 'H-DP3', group: 'hair', price: 330, fastTrack: true,
    name: 'Prescription analgesics panel',
    detects: 'Tramadol, pregabalin, gabapentin, oxycodone and related prescription painkillers.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Choose this where misuse of prescribed painkillers is a concern. Often ordered alongside the standard panel.'
  },
  {
    code: 'H-DP4', group: 'hair', price: 350, fastTrack: false,
    name: 'Street benzodiazepines panel',
    detects: 'The street benzodiazepines most prevalent in Northern Ireland.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Targets non-prescribed benzodiazepines circulating locally. Fast track is not available for this panel.'
  },
  {
    code: 'H-DNPS', group: 'hair', price: 450, fastTrack: true,
    name: 'Novel psychoactive substances',
    detects: 'New and emerging psychoactive substances not covered by standard panels.',
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Only needed where specific novel substances are suspected — our team can advise if unsure.'
  },
  {
    code: 'H-DAS', group: 'hair', price: 450, fastTrack: true,
    name: 'Anabolic steroids panel',
    detects: 'Anabolic steroids and related performance-enhancing substances.',
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
    help: 'A focused test for one named substance — tell us which drug when you complete your details.'
  },
  {
    code: 'H-EtG', group: 'hair', price: 330, fastTrack: true, popular: true,
    name: 'Alcohol — abstinence assessment',
    detects: 'EtG, the alcohol marker used to assess claimed abstinence.',
    window: 'Around 3 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'The right choice where someone says they are not drinking and the court needs that verified.'
  },
  {
    code: 'H-EtG-FAEE', group: 'hair', price: 500, fastTrack: true, includes: ['H-EtG'],
    name: 'Alcohol — chronic excessive assessment',
    detects: 'EtG and FAEE together, the paired markers used to assess chronic excessive drinking.',
    window: 'Around 3 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Includes the abstinence marker — you do not need to order both alcohol tests.'
  },

  /* ---------- NAIL ---------- */
  {
    code: 'N-DP1', group: 'nail', price: 355, fastTrack: true,
    name: 'Standard drug panel',
    detects: 'Cannabis, cocaine, opiates, amphetamines and methamphetamine.',
    window: '6 to 12 months of history. Nails show sustained use rather than one-off events.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Useful where hair is too short or treated, or a longer history is needed. Nail polish and false nails must be removed before collection.'
  },
  {
    code: 'N-DP2', group: 'nail', price: 475, fastTrack: true, includes: ['N-DP1'],
    name: 'Extended drug panel',
    detects: 'Everything in the standard nail panel, plus ketamine, methadone, buprenorphine and benzodiazepines.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Includes the full standard nail panel — you do not need to order both.'
  },
  {
    code: 'N-DP3', group: 'nail', price: 355, fastTrack: true,
    name: 'Prescription analgesics panel',
    detects: 'Tramadol, pregabalin, gabapentin, oxycodone and related prescription painkillers.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'The nail equivalent of the hair analgesics panel.'
  },
  {
    code: 'N-DAS', group: 'nail', price: 475, fastTrack: true,
    name: 'Anabolic steroids panel',
    detects: 'Anabolic steroids and related performance-enhancing substances.',
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'Choose this where steroid use is a specific concern.'
  },
  {
    code: 'N-EtG', group: 'nail', price: 355, fastTrack: true,
    name: 'Alcohol — abstinence assessment',
    detects: 'EtG, the alcohol marker, measured in nail.',
    window: '6 to 12 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample.',
    help: 'An alternative where head hair is unavailable.'
  },

  /* ---------- URINE ---------- */
  {
    code: 'U-MUI-1', group: 'urine', price: 130, fastTrack: false, popular: true,
    name: 'Standard urine panel',
    detects: 'Common drugs of abuse, with alcohol checked by breath test at the appointment.',
    window: 'Roughly the last 3 to 4 days. Cannabis and benzodiazepines can show for longer.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Shows recent use that hair cannot — new drug use takes about a week to appear in hair. Where cannabis is suspected, courts often want urine and hair together.'
  },
  {
    code: 'U-AS', group: 'urine', price: 400, fastTrack: false,
    name: 'Anabolic steroids panel',
    detects: 'Anabolic steroids and related substances in urine.',
    window: 'Recent use — days rather than months.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Choose this where recent steroid use is a specific concern.'
  },
  {
    code: 'U-NPS', group: 'urine', price: 425, fastTrack: false,
    name: 'Novel psychoactive substances',
    detects: 'New and emerging psychoactive substances in urine.',
    window: 'Recent use — days rather than months.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Only needed where specific novel substances are suspected.'
  },

  /* ---------- BLOOD ---------- */
  {
    code: 'DBS-PEth', group: 'blood', price: 250, fastTrack: true, popular: true,
    name: 'PEth — recent alcohol marker',
    detects: 'Phosphatidylethanol, a direct blood marker of alcohol consumption.',
    window: 'Roughly the last 28 days — bridges the gap between breath tests and hair.',
    turnaround: 'About 10 working days. A full interpreted expert report is issued.',
    help: 'A strong complement to hair alcohol markers — hair covers months, PEth covers the last four weeks.'
  },
  {
    code: 'B-LFT', group: 'blood', price: 125, fastTrack: false,
    name: 'Liver function test',
    detects: 'Liver enzyme levels sometimes affected by sustained heavy drinking.',
    window: 'General health indicator rather than a dated window.',
    turnaround: 'About 10 working days. Laboratory results are provided without a NIVHA expert report.',
    help: 'An indirect marker. Clinical interpretation can be arranged separately if required.'
  },
  {
    code: 'B-CDT', group: 'blood', price: 145, fastTrack: false,
    name: 'CDT — alcohol blood marker',
    detects: 'Carbohydrate-deficient transferrin, raised by sustained heavy drinking.',
    window: 'Roughly the last 2 to 4 weeks of heavy drinking.',
    turnaround: 'About 10 working days. Laboratory comments are provided without a NIVHA expert report.',
    help: 'An indirect marker. Most instructions now use PEth instead, which comes with a full expert report.'
  }
];

/* Panels that already include another panel — used for automatic conflict resolution */
const INCLUSION_RULES = [
  { superset: 'H-DP2', subset: 'H-DP1' },
  { superset: 'N-DP2', subset: 'N-DP1' },
  { superset: 'H-EtG-FAEE', subset: 'H-EtG' }
];

const GROUP_META = {
  hair:  { label: 'Hair',  note: 'Around 3 months of history. Collected at either office.' },
  nail:  { label: 'Nail',  note: '6 to 12 months of history. Belfast office only — polish and false nails must be removed.' },
  urine: { label: 'Urine', note: 'Recent use — the last few days. Alcohol checked by breath test.' },
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
    sub: 'Including ketamine, methadone or benzodiazepines',
    recommends: ['H-DP2']
  },
  {
    id: 'analgesics', icon: 'pill',
    title: 'Prescription painkiller misuse',
    sub: 'Tramadol, pregabalin, gabapentin and similar',
    recommends: ['H-DP3']
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
