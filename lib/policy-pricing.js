/* Server-side pricing for the policy builder — the single source of truth for
   what a policy order costs. The browser's figures are never trusted: every
   order is repriced here from the raw selections before anything is charged,
   recorded or invoiced.

   Locked pricing (ex VAT):
     policy £125 · employee leaflet £10 · manager guidance £35 · toolbox talk £45
     full pack £75 (all three, against £90 individually)
     annual review £60 a year — excluded from every discount
     contract clauses — free with every policy, shown as a £0 line
     client code — 40% off the policy and pack items
     card pay now — a further 10% off everything except the review
     invoice — organisations only, 14-day terms, no pay-now discount
     VAT — UK buyers 20%; Republic of Ireland buyers reverse charge at 0% */
'use strict';

const cat = require('../js/policy-catalogue');

const VAT_RATE = cat.VAT_RATE;                       /* 0.2 */
const CLIENT_DISCOUNT = cat.CLIENT_DISCOUNT;         /* 0.4 */
const CARD_PROMPT_DISCOUNT = cat.CARD_PROMPT_DISCOUNT; /* 0.1 */

const REVERSE_CHARGE_NOTE =
  'VAT reverse charge \u2014 VAT to be accounted for by the recipient under Article 196 of Council Directive 2006/112/EC';

/* Catalogue of sellable lines. `register` is the Airtable Items option name. */
const PACK_BY_ID = Object.fromEntries(cat.PACK_ITEMS.map(p => [p.id, p]));

const ITEMS = {
  policy: { name: 'Tailored drug and alcohol policy', price: cat.POLICY_PRICE, register: 'Policy', discountable: true },
  employee_awareness_leaflet: { name: PACK_BY_ID.employee_awareness_leaflet.name, price: PACK_BY_ID.employee_awareness_leaflet.price, register: 'Employee leaflet', discountable: true },
  manager_guidance: { name: PACK_BY_ID.manager_guidance.name, price: PACK_BY_ID.manager_guidance.price, register: 'Manager guidance', discountable: true },
  toolbox_talk: { name: PACK_BY_ID.toolbox_talk.name, price: PACK_BY_ID.toolbox_talk.price, register: 'Toolbox talk', discountable: true },
  full_pack: { name: 'Supporting document pack \u2014 all three documents', price: cat.PACK_BUNDLE_PRICE, register: 'Full pack', discountable: true },
  contract_clauses: { name: 'Contract clause wording', price: 0, register: null, discountable: true },
  annual_review: { name: 'Annual policy review', price: cat.REVIEW_PRICE, register: 'Annual review', discountable: false, recurring: true }
};

const PACK_IDS = ['employee_awareness_leaflet', 'manager_guidance', 'toolbox_talk'];
const pence = n => Math.round(n * 100);
const round2 = n => Math.round(n * 100) / 100;
const money = p => (p / 100).toFixed(2);

/* Price an order.
   input: { packItems: [ids], reviewService, policy (default true),
            clientRate, payMethod: 'card'|'invoice', billingCountry: 'uk'|'roi' }
   Returns pence-accurate lines so the Stripe amounts, the Airtable totals and
   the emails can never disagree by a rounding penny. */
function computeOrder(input) {
  const inp = input || {};
  const wantsPolicy = inp.policy !== false;
  const packSelected = PACK_IDS.filter(id => (inp.packItems || []).includes(id));
  const fullPack = packSelected.length === PACK_IDS.length;
  const review = !!inp.reviewService;
  const clientRate = !!inp.clientRate;
  const payMethod = inp.payMethod === 'invoice' ? 'invoice' : 'card';
  const reverseCharge = inp.billingCountry === 'roi';
  /* The pay-now discount rewards card payment; invoices never carry it. */
  const promptRate = payMethod === 'card' ? CARD_PROMPT_DISCOUNT : 0;

  const chosen = [];
  if (wantsPolicy) chosen.push('policy');
  if (fullPack) chosen.push('full_pack');
  else packSelected.forEach(id => chosen.push(id));
  if (wantsPolicy) chosen.push('contract_clauses');
  if (review) chosen.push('annual_review');
  if (!chosen.length) return null;

  const lines = chosen.map(id => {
    const item = ITEMS[id];
    const listPence = pence(item.price);
    const factor = item.discountable
      ? (1 - (clientRate ? CLIENT_DISCOUNT : 0)) * (1 - promptRate)
      : 1;
    const netPence = Math.round(listPence * factor);
    const vatPence = reverseCharge ? 0 : Math.round(netPence * VAT_RATE);
    return {
      id,
      name: item.name,
      register: item.register,
      recurring: !!item.recurring,
      listPence,
      netPence,
      vatPence,
      grossPence: netPence + vatPence,
      /* Per-item wording for the Stripe line and the confirmation email. */
      description: id === 'contract_clauses'
        ? 'Included free with your policy \u2014 clause wording for contracts and subcontracts.'
        : (reverseCharge
          ? `\u00a3${money(netPence)}${item.recurring ? ' a year' : ''} \u2014 ${REVERSE_CHARGE_NOTE}`
          : `\u00a3${money(netPence)}${item.recurring ? ' a year' : ''} + VAT`)
    };
  });

  const sum = key => lines.reduce((s, l) => s + l[key], 0);
  const listTotal = sum('listPence');
  const subtotalPence = sum('netPence');
  const vatPence = sum('vatPence');
  const totalPence = sum('grossPence');
  const discountPence = listTotal - subtotalPence;

  /* Split the saving for display: the client rate first, then pay-now. */
  const discountableList = lines.filter(l => ITEMS[l.id].discountable).reduce((s, l) => s + l.listPence, 0);
  const clientPence = clientRate ? Math.round(discountableList * CLIENT_DISCOUNT) : 0;
  const promptPence = Math.max(0, discountPence - clientPence);

  return {
    lines,
    payMethod,
    clientRate,
    reverseCharge,
    vatTreatment: reverseCharge ? 'ROI reverse charge' : 'UK VAT 20%',
    vatNote: reverseCharge ? REVERSE_CHARGE_NOTE : 'VAT at 20% is included in the total.',
    hasReview: review,
    hasPolicy: wantsPolicy,
    registerItems: lines.map(l => l.register).filter(Boolean),
    listPence: listTotal,
    clientDiscountPence: clientPence,
    promptDiscountPence: promptPence,
    discountPence,
    subtotalPence,
    vatPence,
    totalPence,
    /* Pounds, for Airtable currency fields and for the emails. */
    subtotal: round2(subtotalPence / 100),
    vat: round2(vatPence / 100),
    total: round2(totalPence / 100)
  };
}

/* A client code is valid when it is listed in CLIENT_CODES. The demo code is
   accepted only outside production — that is, while email is in dry run. */
function validateClientCode(code, opts) {
  const raw = String(code || '').trim().toUpperCase();
  if (!raw) return { valid: false, code: '' };
  const configured = String(process.env.CLIENT_CODES || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (configured.includes(raw)) return { valid: true, code: raw };
  const demoAllowed = !!(opts && opts.allowDemo);
  if (demoAllowed && raw === cat.DEMO_CLIENT_CODE) return { valid: true, code: raw, demo: true };
  return { valid: false, code: raw };
}

module.exports = {
  computeOrder, validateClientCode, ITEMS, PACK_IDS,
  VAT_RATE, CLIENT_DISCOUNT, CARD_PROMPT_DISCOUNT, REVERSE_CHARGE_NOTE, money
};
