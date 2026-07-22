/* NIVHA DNA relationship testing — catalogue and pricing
   Decisions locked at the fee note DNA workshop (July 2026):
   - Lab partner: DNA Legal · analysis at up to 68 genetic markers (industry standard is 16)
   - Headline price covers up to 2 people; each additional person £165 + VAT
   - Analysis-only tier removed — collection is always included
   - Extended family: no fixed price, quote on request via a case manager
   - Turnaround: 15 working days from the lab receiving ALL samples
   NOTE (prototype): scientific figures and the court-report claim are indicative
   and awaiting scientific sign-off before publication. */

const DNA_VAT_RATE = 0.20;
const DNA_ADDITIONAL_PERSON_FEE = 165;   /* + VAT, per person beyond the 2 included */
const DNA_INCLUDED_PEOPLE = 2;

/* Collection — DNA-specific pricing (differs from drug and alcohol) */
const DNA_COLLECTION = {
  belfast: { id: 'belfast', fee: 0,   label: 'NIVHA office — Belfast' },
  derry:   { id: 'derry',   fee: 150, label: 'NIVHA office — Derry~Londonderry' },
  gp:      { id: 'gp',      fee: 20,  label: 'Your own GP surgery' },
  onsite:  { id: 'onsite',  fee: 250, label: 'Your location — we come to you' }
};

const DNA_TESTS = [
  {
    code: 'DNA-PAT',
    id: 'paternity',
    name: 'Paternity test',
    question: 'Is he the biological father?',
    price: 465,
    priced: true,
    proves: 'Establishes whether a man is the biological father of a child. The most commonly instructed relationship test in family proceedings.',
    detects: 'Potential father and child compared at up to 68 genetic markers',
    roster: [
      { role: 'father', label: 'Potential father', plural: 'Potential father', min: 1, max: 1, addLabel: null },
      { role: 'child', label: 'Child', plural: 'Children', min: 1, max: 6, addLabel: 'Add another child' }
    ]
  },
  {
    code: 'DNA-MAT',
    id: 'maternity',
    name: 'Maternity test',
    question: 'Is she the biological mother?',
    price: 465,
    priced: true,
    proves: 'Establishes whether a woman is the biological mother of a child — often instructed in adoption, surrogacy or records cases.',
    detects: 'Mother and child compared at up to 68 genetic markers',
    roster: [
      { role: 'mother', label: 'Mother', plural: 'Mother', min: 1, max: 1, addLabel: null },
      { role: 'child', label: 'Child', plural: 'Children', min: 1, max: 6, addLabel: 'Add another child' }
    ]
  },
  {
    code: 'DNA-SIB',
    id: 'sibling',
    name: 'Sibling test',
    question: 'Are they biological siblings?',
    price: 490,
    priced: true,
    proves: 'Establishes whether two or more people share one or both biological parents — used where a parent is not available to test.',
    detects: 'Siblings compared at up to 68 genetic markers',
    roster: [
      { role: 'sibling', label: 'Sibling', plural: 'Siblings', min: 2, max: 6, addLabel: 'Add another sibling' }
    ]
  },
  {
    code: 'DNA-AVU',
    id: 'auntuncle',
    name: 'Aunt or uncle test',
    question: 'Is the child related to the alleged father\u2019s family?',
    price: 490,
    priced: true,
    proves: 'Compares a child with a full sibling of the alleged parent — used where the alleged father or mother is not available to test.',
    detects: 'Aunt or uncle and niece or nephew compared at up to 68 genetic markers',
    roster: [
      { role: 'auntuncle', label: 'Aunt or uncle', plural: 'Aunts or uncles', min: 1, max: 3, addLabel: 'Add another aunt or uncle' },
      { role: 'niecenephew', label: 'Niece or nephew', plural: 'Nieces or nephews', min: 1, max: 4, addLabel: 'Add another niece or nephew' }
    ]
  },
  {
    code: 'DNA-EXT',
    id: 'extended',
    name: 'Extended family test',
    question: 'Is the child related to the grandparents?',
    price: null,
    priced: false,
    proves: 'Compares grandchildren with one or both grandparents to establish a biological link — used where the alleged parent is not available to test. Priced case by case because the right combination of people varies.',
    detects: 'Grandparents and grandchildren compared at up to 68 genetic markers',
    roster: [
      { role: 'grandparent', label: 'Grandparent', plural: 'Grandparents', min: 1, max: 2, addLabel: 'Add the other grandparent' },
      { role: 'grandchild', label: 'Grandchild', plural: 'Grandchildren', min: 1, max: 4, addLabel: 'Add another grandchild' }
    ]
  }
];

/* Shared wording — single source so the wizard, fee note and checklist never drift */
const DNA_TURNAROUND =
  'The legal report is issued 15 working days from the laboratory receiving all samples. ' +
  'Analysis cannot begin until every participant\u2019s sample has arrived, so one outstanding participant delays the result for the whole case.';

const DNA_MARKER_CLAIM =
  'Samples are analysed by our partner laboratory DNA Legal at up to 68 genetic markers \u2014 the industry standard is 16 \u2014 giving a stronger, more conclusive result.';

const DNA_LEGAL_REPORT =
  'A full legal report suitable for court is issued for every test \u2014 samples are collected under chain of custody by an HCPC-registered practitioner.';

/* Checklist fees (surfaced on the participant checklist) */
const DNA_FEES = {
  lateCancellation: 50,   /* + VAT, less than 24 hours before the appointment */
  nonAttendance: 50,      /* + VAT */
  nivhaPhotos: 5          /* + VAT per donor, if NIVHA takes the passport photos */
};
