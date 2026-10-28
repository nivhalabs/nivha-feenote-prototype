/* NIVHA Fee Note — product catalogue (simulation)
   Content and pricing taken from the live NIVHA fee note form
   (form.jotform.com/nivha/FeeNoteDandATesting). All prices exclusive of VAT. */

const VAT_RATE = 0.20;
const FAST_TRACK_FEE = 80;            /* per panel, + VAT */
const DERRY_COLLECTION_FEE = 75;      /* Derry~Londonderry office collection, + VAT */
const ONSITE_COLLECTION_FROM = 250;   /* on-site collection starts here — priced on request, + VAT */

/* No combined panel rates. The live form's H-DP1 + H-DP3 price field is hidden and not offered, so every panel is charged at list price.
   Kept as an empty list so the pricing code does not change if a rate is ever agreed. */
const COMBINED_RATES = [];

/* ---------- Full drug lists ----------
   Wording follows the live fee note form (form.jotform.com/nivha/FeeNoteDandATesting), group by group.
   Where the form names only a group, the group is shown as written — no compounds are added.
   `add: true` marks what the extended panel adds to the standard panel. */
const LIST_FOOTER = 'The laboratory report lists the specific drugs analysed in each case. Minor variation in the drugs listed is possible.';
const STD_DRUG_GROUPS = [
  { name: 'Amphetamine & methylamphetamine' },
  { name: 'Cannabis' },
  { name: 'Ecstasy drugs' },
  { name: 'Cocaine & metabolites' },
  { name: 'Opiates (1)', drugs: ['Morphine', 'Codeine', 'Heroin metabolite'] },
  { name: 'Benzodiazepines (1)', note: 'Common benzodiazepines', drugs: ['Diazepam', 'Nordiazepam', 'Oxazepam', 'Bromazepam', 'Lorazepam', 'Temazepam', 'Alprazolam'] }
];
const EXT_DRUG_GROUPS = [
  { name: 'Ketamine', add: true },
  { name: 'Opiates (2)', add: true, drugs: ['Methadone', 'Buprenorphine'] },
  { name: 'Benzodiazepines (2)', add: true, drugs: ['Chlordiazepoxide', 'Clonazepam', 'Flunitrazepam', 'Midazolam', 'Zopiclone', 'Zaleplon', 'Zolpidem'] }
];
const ANALGESIC_GROUPS = [
  { name: 'Opiates (3)', drugs: ['Dihydrocodeine', 'Hydromorphone', 'Hydrocodone', 'Oxycodone', 'Tramadol'] },
  { name: 'Anticonvulsants', drugs: ['Pregabalin', 'Gabapentin'] }
];
const STEROID_GROUPS = [{ name: 'Synthetic anabolic steroids & steroid esters' }];
const NPS_GROUPS = [{ name: 'NPS drugs include', drugs: ['Synthetic cannabinoid receptor agonists', 'Cathinones', 'Tryptamines', 'Phenethylamines', 'Fentanyls'] }];
const NPS_NOTE = 'Covers a wide range of NPS drugs but excludes common drugs. Drugs already listed in the standard panels are not included in this analysis.';
const DRUG_LISTS = {
  'H-DP1': { groups: STD_DRUG_GROUPS },
  'H-DP2': { groups: [...STD_DRUG_GROUPS, ...EXT_DRUG_GROUPS] },
  'H-DP3': { groups: ANALGESIC_GROUPS },
  'H-DP4': { groups: [{ name: 'Non-pharmaceutical benzodiazepines', drugs: ['Clobazam', 'Flubromazolam', 'Flualprazolam', 'Etizolam', 'Meclonazepam', 'Bromazolam', 'Clonazolam'] }] },
  'H-DNPS': { groups: NPS_GROUPS, note: NPS_NOTE },
  'H-DAS': { groups: STEROID_GROUPS },
  'H-DSD': { groups: [], note: 'One drug of your choice. You name the drug when you add this to the fee note.' },
  'H-EtG': { groups: [{ name: 'Alcohol marker', drugs: ['EtG'] }], note: 'EtG only. Recommended in abstinence assessment.' },
  'H-EtG-FAEE': { groups: [{ name: 'Alcohol markers', drugs: ['EtG', 'FAEE'] }], note: 'EtG plus FAEE. Recommended in chronic excessive assessment.' },
  'N-DP1': { groups: STD_DRUG_GROUPS },
  'N-DP2': { groups: [...STD_DRUG_GROUPS, ...EXT_DRUG_GROUPS] },
  'N-DP3': { groups: ANALGESIC_GROUPS },
  'N-DAS': { groups: STEROID_GROUPS },
  'N-DSD': { groups: [], note: 'One drug of your choice. You name the drug when you add this to the fee note.' },
  'N-EtG': { groups: [{ name: 'Alcohol marker', drugs: ['EtG'] }], note: 'EtG only. Recommended in abstinence assessment.' },
  'U-MUI-1': {
    groups: [
      { name: 'Amphetamine & methylamphetamine' }, { name: 'Cannabis' }, { name: 'Cocaine' }, { name: 'Ecstasy drugs' }, { name: 'Ketamine' },
      { name: 'Opiates (1)', drugs: ['Heroin', 'Morphine', 'Codeine', 'Dihydrocodeine'] },
      { name: 'Opiates (2)', drugs: ['Methadone', 'Tramadol'] },
      { name: 'Benzodiazepine (1)', note: 'Common benzodiazepines, including', drugs: ['Diazepam', 'Lorazepam', 'Temazepam'] }
    ],
    note: 'Alcohol is tested with a breath tester.'
  },
  'U-MUI-2': {
    groups: [
      { name: 'Analgesics and anticonvulsants', drugs: ['Pregabalin', 'Gabapentin', 'Buprenorphine'] },
      { name: 'Cathinone', drugs: ['Mephedrone', 'MDPV', 'Methcathinone', 'Cathinone'] }
    ],
    note: 'Alcohol is tested with a breath tester.'
  },
  'U-AS': { groups: [{ name: 'Synthetic anabolic steroids' }] },
  'U-NPS': { groups: NPS_GROUPS, note: NPS_NOTE },
  'U-EtG-EtS': { groups: [{ name: 'Minor alcohol metabolites', drugs: ['Ethyl glucuronide', 'Ethyl sulphate'] }] },
  'DBS-PEth': { groups: [{ name: 'Direct alcohol marker', drugs: ['Phosphatidylethanol (PEth)'] }] },
  'B-LFT': { groups: [{ name: 'Clinical alcohol marker', drugs: ['Liver function test'] }] },
  'B-CDT': { groups: [{ name: 'Clinical alcohol marker', drugs: ['Carbohydrate deficient transferrin'] }] }
};
/* Plain text version — used on the fee note PDF. */
function drugListText(code) {
  const l = DRUG_LISTS[code];
  if (!l) return '';
  const parts = l.groups.map(g => g.drugs ? `${g.name}: ${g.drugs.join(', ')}` : g.name);
  return parts.join('; ') + (l.note ? '. ' + l.note : '');
}

const CATALOGUE = [
  /* ---------- HAIR ---------- */
  {
    code: 'H-DP1', group: 'hair', price: 330, fastTrack: true, popular: true, upgradeTo: 'H-DP2',
    name: 'Standard drug panel',
    detects: 'Cannabis, cocaine and metabolites, ecstasy drugs, amphetamine and methamphetamine, opiates including heroin, and common benzodiazepines such as diazepam, temazepam and alprazolam.',
    drugs: ['Cannabis', 'Cocaine', 'Ecstasy (MDMA)', 'Amphetamines', 'Heroin and other opiates', 'Prescribed benzodiazepines — diazepam, temazepam, alprazolam'],
    window: 'Around 3 months of history (3cm of head hair). New use takes about a week to appear in hair.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'The panel most courts ask for. If you need ketamine, methadone or the further benzodiazepines and sleep medicines (see the full drug list) as well, tick the extended option on this panel — it includes everything in the standard panel. Additional hair segments can be analysed — priced on application.'
  },
  {
    code: 'H-DP2', group: 'hair', price: 450, fastTrack: true, includes: ['H-DP1'],
    name: 'Extended drug panel',
    detects: 'Everything in the standard panel, plus ketamine, methadone, buprenorphine and seven further benzodiazepines and sleep medicines: chlordiazepoxide, clonazepam, flunitrazepam, midazolam, zopiclone, zaleplon and zolpidem.',
    base: 'H-DP1',
    adds: ['Ketamine', 'Methadone', 'Buprenorphine', 'Chlordiazepoxide', 'Clonazepam', 'Flunitrazepam', 'Midazolam', 'Zopiclone', 'Zaleplon', 'Zolpidem'],
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Includes the full standard panel. Additional hair segments can be analysed — priced on application.'
  },
  {
    code: 'H-DP3', group: 'hair', price: 330, fastTrack: true,
    name: 'Prescription analgesics panel',
    detects: 'Tramadol, oxycodone, dihydrocodeine, hydrocodone, hydromorphone, and the anticonvulsants pregabalin and gabapentin.',
    drugs: ['Tramadol', 'Oxycodone', 'Dihydrocodeine', 'Hydrocodone', 'Hydromorphone', 'Pregabalin', 'Gabapentin'],
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Choose this where misuse of prescribed painkillers is a concern. It can be added to the standard or extended panel, or ordered on its own.'
  },
  {
    code: 'H-DP4', group: 'hair', price: 350, fastTrack: false,
    name: 'Prevalent benzodiazepines panel',
    detects: 'Etizolam, bromazolam, clonazolam, flualprazolam, flubromazolam, meclonazepam and clobazam — non-pharmaceutical benzodiazepines currently prevalent in forensic casework.',
    drugs: ['Etizolam', 'Bromazolam', 'Clonazolam', 'Flualprazolam', 'Flubromazolam', 'Meclonazepam', 'Clobazam'],
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Useful where street or non-pharmaceutical benzodiazepines are suspected. Fast track is not available for this panel.'
  },
  {
    code: 'H-DNPS', group: 'hair', price: 450, fastTrack: true,
    name: 'Novel psychoactive substances',
    detects: 'Synthetic cannabinoid receptor agonists, cathinones, tryptamines, phenethylamines and fentanyls. Drugs already covered by the standard panels are not included.',
    drugs: ['Synthetic cannabinoids', 'Cathinones', 'Tryptamines', 'Phenethylamines', 'Fentanyls'],
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
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
    drugs: ['Anabolic steroids', 'Steroid esters'],
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Choose this where steroid use is a specific concern.'
  },
  {
    code: 'H-DSD', group: 'hair', price: 300, fastTrack: true,
    name: 'Single specified drug',
    detects: 'One drug of your choosing, named at instruction.',
    drugs: ['One named drug of your choice'],
    window: 'Around 3 months of history (3cm of head hair).',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
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
    drugs: ['EtG — the abstinence marker for alcohol'],
    window: 'Around 3 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'The right choice where someone says they are not drinking and the court needs that verified.'
  },
  {
    code: 'H-EtG-FAEE', group: 'hair', price: 500, fastTrack: true, includes: ['H-EtG'],
    name: 'Alcohol — chronic excessive assessment',
    detects: 'EtG and FAEE together, the paired markers recommended for assessing chronic excessive drinking.',
    base: 'H-EtG',
    adds: ['FAEE — the second alcohol marker, needed to evidence chronic excessive drinking'],
    window: 'Around 3 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Includes the abstinence marker — you do not need to order both alcohol tests.'
  },

  /* ---------- NAIL ---------- */
  {
    code: 'N-DP1', group: 'nail', price: 355, fastTrack: true, upgradeTo: 'N-DP2',
    name: 'Standard drug panel',
    detects: 'Cannabis, cocaine and metabolites, ecstasy drugs, amphetamine and methamphetamine, opiates including heroin, and common benzodiazepines such as diazepam, temazepam and alprazolam.',
    drugs: ['Cannabis', 'Cocaine', 'Ecstasy (MDMA)', 'Amphetamines', 'Heroin and other opiates', 'Prescribed benzodiazepines — diazepam, temazepam, alprazolam'],
    window: '6 to 12 months of history. Nails show sustained use rather than one-off events.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Useful where hair is too short or treated, or a longer history is needed. Nail polish and false nails must be removed before collection.'
  },
  {
    code: 'N-DP2', group: 'nail', price: 475, fastTrack: true, includes: ['N-DP1'],
    name: 'Extended drug panel',
    detects: 'Everything in the standard nail panel, plus ketamine, methadone, buprenorphine and seven further benzodiazepines and sleep medicines: chlordiazepoxide, clonazepam, flunitrazepam, midazolam, zopiclone, zaleplon and zolpidem.',
    base: 'N-DP1',
    adds: ['Ketamine', 'Methadone', 'Buprenorphine', 'Chlordiazepoxide', 'Clonazepam', 'Flunitrazepam', 'Midazolam', 'Zopiclone', 'Zaleplon', 'Zolpidem'],
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Includes the full standard nail panel.'
  },
  {
    code: 'N-DP3', group: 'nail', price: 355, fastTrack: true,
    name: 'Prescription analgesics panel',
    detects: 'Tramadol, oxycodone, dihydrocodeine, hydrocodone, hydromorphone, and the anticonvulsants pregabalin and gabapentin.',
    drugs: ['Tramadol', 'Oxycodone', 'Dihydrocodeine', 'Hydrocodone', 'Hydromorphone', 'Pregabalin', 'Gabapentin'],
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'The nail equivalent of the hair analgesics panel.'
  },
  {
    code: 'N-DAS', group: 'nail', price: 475, fastTrack: true,
    name: 'Anabolic steroids panel',
    detects: 'Synthetic anabolic steroids and steroid esters.',
    drugs: ['Anabolic steroids', 'Steroid esters'],
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'Choose this where steroid use is a specific concern.'
  },
  {
    code: 'N-DSD', group: 'nail', price: 325, fastTrack: true,
    name: 'Single specified drug',
    detects: 'One drug of your choosing, named at instruction.',
    drugs: ['One named drug of your choice'],
    window: '6 to 12 months of history.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'A focused test for one named substance — tell us which drug when you complete your details.'
  },
  {
    code: 'N-EtG', group: 'nail', price: 355, fastTrack: true,
    name: 'Alcohol — abstinence assessment',
    detects: 'EtG, the alcohol marker, measured in nail.',
    drugs: ['EtG — the abstinence marker for alcohol'],
    window: '6 to 12 months of drinking history.',
    turnaround: 'About 15 working days from the lab receiving the sample — allow 2 working days for post.',
    help: 'An alternative where head hair is unavailable. Where suitable hair cannot be collected, blood PEth can also be considered.'
  },

  /* ---------- URINE ---------- */
  {
    code: 'U-MUI-1', group: 'urine', price: 130, fastTrack: false, popular: true, series: true,
    name: 'Standard urine panel',
    detects: 'Cannabis, cocaine, ecstasy drugs, amphetamine and methamphetamine, ketamine, opiates including heroin, methadone, tramadol and common benzodiazepines. Alcohol is checked by breath test at the appointment.',
    drugs: ['Cannabis', 'Cocaine', 'Ecstasy (MDMA)', 'Amphetamines', 'Ketamine', 'Heroin and other opiates', 'Methadone', 'Tramadol', 'Common benzodiazepines', 'Alcohol — breath test at the appointment'],
    window: 'Roughly the last 3 to 4 days. Cannabis and benzodiazepines can show for longer.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Shows recent use that hair cannot — new drug use takes about a week to appear in hair. An unannounced series of two or three collections can monitor ongoing abstention.'
  },
  {
    code: 'U-MUI-2', group: 'urine', price: 130, fastTrack: false, series: true,
    name: 'Cathinones and additional analgesics',
    detects: 'Pregabalin, gabapentin, buprenorphine and cathinones including mephedrone and MDPV. Alcohol is checked by breath test at the appointment.',
    drugs: ['Pregabalin', 'Gabapentin', 'Buprenorphine', 'Cathinones — mephedrone, MDPV', 'Alcohol — breath test at the appointment'],
    window: 'Roughly the last 3 to 4 days.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Covers drugs the standard urine panel does not. Individual drugs from this panel can instead be added to the standard panel at £50 + VAT per drug — call us to arrange that.'
  },
  {
    code: 'U-EtG-EtS', group: 'urine', price: 130, fastTrack: false, series: true,
    name: 'Alcohol markers — EtG and EtS',
    detects: 'Ethyl glucuronide and ethyl sulphate, minor alcohol metabolites used in clinical alcohol assessment.',
    drugs: ['EtG', 'EtS'],
    window: 'Very recent drinking — a few days at most.',
    turnaround: 'About 10 working days. Laboratory results are provided without a NIVHA expert report.',
    help: 'A clinical check on recent alcohol use. Where the court needs an interpreted expert report on alcohol, hair EtG or blood PEth is usually the better choice.'
  },
  {
    code: 'U-AS', group: 'urine', price: 400, fastTrack: false,
    name: 'Anabolic steroids panel',
    detects: 'Synthetic anabolic steroids in urine.',
    drugs: ['Anabolic steroids'],
    window: 'Recent use — days rather than months.',
    turnaround: 'About 10 working days from the lab receiving the sample.',
    help: 'Choose this where recent steroid use is a specific concern.'
  },
  {
    code: 'U-NPS', group: 'urine', price: 425, fastTrack: false,
    name: 'Novel psychoactive substances',
    detects: 'Synthetic cannabinoid receptor agonists, cathinones, tryptamines, phenethylamines and fentanyls in urine.',
    drugs: ['Synthetic cannabinoids', 'Cathinones', 'Tryptamines', 'Phenethylamines', 'Fentanyls'],
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
    drugs: ['PEth — a direct alcohol marker'],
    window: 'Roughly the last 28 days — bridges the gap between breath tests and hair.',
    turnaround: 'About 15 working days. A full interpreted expert report is issued.',
    help: 'A strong complement to hair alcohol markers — hair covers months, PEth covers the last four weeks.'
  },
  {
    code: 'B-LFT', group: 'blood', price: 125, fastTrack: false,
    name: 'Liver function test',
    detects: 'Liver enzyme levels sometimes affected by sustained heavy drinking.',
    drugs: ['Liver enzymes — an indirect health indicator'],
    window: 'General health indicator rather than a dated window.',
    turnaround: 'Laboratory results are provided without a NIVHA expert report.',
    help: 'An indirect marker. Clinical interpretation of the results can be added at £125 + VAT.'
  },
  {
    code: 'B-CDT', group: 'blood', price: 145, fastTrack: false,
    name: 'CDT — alcohol blood marker',
    detects: 'Carbohydrate-deficient transferrin, raised by sustained heavy drinking.',
    drugs: ['CDT — an indirect alcohol marker'],
    window: 'Roughly the last 2 to 4 weeks of heavy drinking.',
    turnaround: 'Laboratory results are provided without a NIVHA expert report.',
    help: 'An indirect marker. Most instructions now use PEth instead, which comes with a full expert report. Clinical interpretation of the results can be added at £125 + VAT.'
  }
];

/* Panels that cannot be ordered on the same fee note. The extended drug panels are offered as an
   option on the standard panel (upgradeTo), so DP1/DP2 can never be chosen together. */
const BLOCK_RULES = [
  { codes: ['H-DP4', 'H-EtG-FAEE'], reason: 'H-DP4 and H-EtG/FAEE cannot be ordered together. H-EtG (EtG only) can be ordered with H-DP4.' }
];

/* Panels that already include another panel — safety net for automatic conflict resolution */
const INCLUSION_RULES = [
  { superset: 'H-DP2', subset: 'H-DP1' },
  { superset: 'N-DP2', subset: 'N-DP1' },
  { superset: 'H-EtG-FAEE', subset: 'H-EtG' }
];

const GROUP_META = {
  hair:  { label: 'Hair', icon: 'calendar', windowShort: 'Around 3 months',
           note: 'Around 3 months of history. Collected at either office. Additional segments priced on application.',
           typical: 'The default evidence for most court instructions — a month-by-month picture of drug or alcohol use. Collected at both offices.',
           compare: '<strong>Standard or extended?</strong> The standard panel covers the drugs most often raised in proceedings. The extended panel is everything in the standard panel plus ketamine, methadone, buprenorphine and prescription sleep medicines — add it only when those drugs are relevant to the case. It is the standard panel plus the additions, not a second panel.' },
  nail:  { label: 'Nail', icon: 'history', windowShort: '6 to 12 months',
           note: '6 to 12 months of history. Belfast office only — polish and false nails must be removed.',
           typical: 'For when hair is too short, treated or unavailable — or when the court needs a longer pattern of sustained use. Belfast office only.',
           compare: '<strong>Standard or extended?</strong> Exactly as with hair — the extended nail panel is the standard panel plus ketamine, methadone, buprenorphine and sleep medicines. It is the standard panel plus the additions, not a second panel.' },
  urine: { label: 'Urine', icon: 'clock', windowShort: 'The last few days',
           note: 'Recent use — the last few days. Alcohol checked by breath test. Unannounced series of two or three collections available.',
           typical: 'Shows very recent use that hair cannot yet — often ordered alongside hair, or as an unannounced series to monitor ongoing abstention.' },
  blood: { label: 'Blood', icon: 'wave', windowShort: 'Around the last month',
           note: 'Alcohol markers covering roughly the last month.',
           typical: 'PEth is the recent alcohol marker — it bridges the gap between a breath test on the day and months of hair history.' }
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
    title: "Unsure \u2014 I'll browse the panels",
    sub: 'Nothing is added for you. Read about each panel and choose what you need.',
    recommends: []
  }
];

/* Organisation search — simulates a lookup of the public registers
   (Companies House and the Law Society of Northern Ireland directory).
   In production this would query those registers live; no NIVHA client
   data is shown. Addresses are illustrative for the simulation. */
const REGISTER = [
  { name: 'Belfast Health and Social Care Trust', address: 'Trust Headquarters, Belfast City Hospital, 51 Lisburn Road', town: 'Belfast', postcode: 'BT9 7AB' },
  { name: 'Northern Health and Social Care Trust', address: 'Trust Headquarters, Bretten Hall, Bush Road', town: 'Antrim', postcode: 'BT41 2RL' },
  { name: 'South Eastern Health and Social Care Trust', address: 'Trust Headquarters, Ulster Hospital, Upper Newtownards Road', town: 'Dundonald', postcode: 'BT16 1RH' },
  { name: 'Southern Health and Social Care Trust', address: 'Trust Headquarters, Craigavon Area Hospital, 68 Lurgan Road', town: 'Portadown', postcode: 'BT63 5QQ' },
  { name: 'Western Health and Social Care Trust', address: 'Trust Headquarters, Altnagelvin Hospital, Glenshane Road', town: 'Derry~Londonderry', postcode: 'BT47 6SB' },
  { name: 'Carson McDowell LLP', address: 'Murray House, Murray Street', town: 'Belfast', postcode: 'BT1 6DN' },
  { name: 'Tughans LLP', address: 'The Ewart, 3 Bedford Square', town: 'Belfast', postcode: 'BT2 7EP' },
  { name: 'Cleaver Fulton Rankin', address: '50 Bedford Street', town: 'Belfast', postcode: 'BT2 7FW' },
  { name: 'Arthur Cox', address: 'Victoria House, Gloucester Street', town: 'Belfast', postcode: 'BT1 4LS' },
  { name: 'Millar McCall Wylie', address: 'Imperial House, Donegall Square East', town: 'Belfast', postcode: 'BT1 5HD' },
  { name: 'Worthingtons Solicitors', address: '24–38 Gordon Street', town: 'Belfast', postcode: 'BT1 2LG' },
  { name: 'Caldwell & Robinson Solicitors', address: '12 Castle Street', town: 'Derry~Londonderry', postcode: 'BT48 6HQ' },
  { name: 'Babington & Croasdaile Solicitors', address: '4 Clarendon Street', town: 'Derry~Londonderry', postcode: 'BT48 7ES' },
  { name: 'Wilson Nesbitt Solicitors', address: '33 Hamilton Road', town: 'Bangor', postcode: 'BT20 4LF' },
  { name: 'MKB Law', address: '9 Upper Crescent', town: 'Belfast', postcode: 'BT7 1NT' }
];

/* Court and reporting — standing rates (updated July 2026).
   Where the instruction is legally aided, the applicable legal aid
   authority's rates are observed. */
const COURT_RATES = {
  lines: [
    { label: 'Report preparation / additional reports (per hour)', price: 150 },
    { label: 'Court attendance — half day (up to 4 hours)', price: 600 },
    { label: 'Court attendance — full day', price: 1000 },
    { label: 'Cancellation within 48 hours of court attendance', text: '50% of the agreed fee' }
  ],
  note: "Where the instruction is legally aided, the applicable legal aid authority's rates are observed."
};

/* Node export so the server prices fee notes from the same catalogue.
   Browsers ignore this block. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DRUG_LISTS, LIST_FOOTER, drugListText, CATALOGUE, COMBINED_RATES, BLOCK_RULES, INCLUSION_RULES, VAT_RATE, FAST_TRACK_FEE, DERRY_COLLECTION_FEE, ONSITE_COLLECTION_FROM };
}
