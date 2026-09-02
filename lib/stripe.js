/* Minimal Stripe client — Checkout Sessions and webhook signature checks.
 * Uses the plain REST API (form-encoded) so no SDK dependency is needed.
 * Simulated mode (no STRIPE_SECRET_KEY) keeps the walkthrough usable. */
'use strict';

const crypto = require('crypto');

const KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const SIMULATED = !KEY;
const LIVEMODE_KEY = /^(sk|rk)_live_/.test(KEY);

/* Flatten { a: { b: 1 }, c: [ { d: 2 } ] } into Stripe's form encoding. */
function formEncode(obj, prefix, out) {
  out = out || new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripeReq(method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      /* Pin the API version: no-cost (100%-discounted) orders need 2023-08-16+,
         and older accounts default to the version they were created on. */
      'Stripe-Version': '2023-08-16'
    },
    body: params ? formEncode(params).toString() : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `Stripe ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* One line item per fee note — the itemisation lives on the fee note itself. */
async function createCheckoutSession({ baseUrl, reference, amountPence, email, recordId }) {
  return stripeReq('POST', 'checkout/sessions', {
    mode: 'payment',
    customer_email: email || undefined,
    client_reference_id: reference,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'gbp',
        unit_amount: amountPence,
        product_data: {
          name: `Fee note ${reference} — laboratory testing`,
          description: 'NIVHA Laboratory Services Ltd — drug and alcohol testing, collection and reporting as itemised on your fee note.'
        }
      }
    }],
    /* No payment_intent_data: Stripe rejects it on no-cost (100%-discounted)
       orders, and the line item already names the fee note. */
    allow_promotion_codes: true,
    metadata: { reference, recordId: recordId || '' },
    success_url: `${baseUrl}/?paid=1&sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?canceled=1`
  });
}

const getSession = id => stripeReq('GET', `checkout/sessions/${encodeURIComponent(id)}`);

/* ---------------- policy builder ----------------
 * Multi-line-item Checkout for policy orders. Amounts arrive already priced
 * server-side by lib/policy-pricing: unit_amount is the VAT-inclusive figure
 * for UK buyers and the ex-VAT figure for Republic of Ireland buyers, whose
 * VAT is accounted for under the reverse charge. */

/* The annual review renews by payment link, never by subscription — the buyer
 * clicks and pays each year (client-initiated), so the card-scheme rules on
 * recurring billing do not apply and no card is ever stored. The renewal price
 * is a one-off Stripe price found by lookup key. Two variants: UK (£60 + VAT)
 * and ROI (£60, reverse charge). */
const REVIEW_PRICES = {
  uk: { lookupKey: 'policy_annual_review', unitAmount: 7200, name: 'Annual policy review', description: 'Annual refresh of your drug and alcohol policy on the latest NIVHA master, including re-issues when the law materially changes. £60 + VAT a year.' },
  roi: { lookupKey: 'policy_annual_review_roi', unitAmount: 6000, name: 'Annual policy review (reverse charge)', description: 'Annual refresh of your drug and alcohol policy on the latest NIVHA master, including re-issues when the law materially changes. £60 a year, VAT accounted for by the recipient under the reverse charge.' }
};
const priceCache = new Map();

/* Find the one-off renewal price by lookup key, creating the product and
 * price the first time. An earlier build created these lookup keys against
 * recurring prices; if the key still points at one, the key is transferred to
 * a fresh one-off price. Cached per process. */
async function ensureReviewPrice(roi) {
  const spec = roi ? REVIEW_PRICES.roi : REVIEW_PRICES.uk;
  if (priceCache.has(spec.lookupKey)) return priceCache.get(spec.lookupKey);
  const found = await stripeReq('GET', `prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(spec.lookupKey)}`);
  let price = (found.data || [])[0];
  if (price && price.recurring) price = null; /* legacy recurring price — replace */
  if (!price) {
    const product = await stripeReq('POST', 'products', {
      name: spec.name,
      description: spec.description
    });
    price = await stripeReq('POST', 'prices', {
      currency: 'gbp',
      unit_amount: spec.unitAmount,
      product: product.id,
      lookup_key: spec.lookupKey,
      transfer_lookup_key: 'true'
    });
  }
  priceCache.set(spec.lookupKey, price.id);
  return price.id;
}

/* Build the Checkout parameters for a policy order. Pure — no network — so
 * the shape can be unit tested without touching Stripe. Every line, the
 * annual review's first year included, is charged today as a one-off
 * payment; renewals are sold separately by payment link a year on. */
function policySessionParams({ baseUrl, orderRef, recordId, email, order }) {
  const oneOff = order.lines.filter(l => l.grossPence > 0);
  const params = {
    mode: 'payment',
    customer_email: email || undefined,
    client_reference_id: orderRef,
    line_items: oneOff.map(l => ({
      quantity: 1,
      price_data: {
        currency: 'gbp',
        unit_amount: l.grossPence,
        product_data: { name: l.name, description: l.description }
      }
    })),
    /* Same as fee notes: lets the office hand out Stripe promotion codes
       (including 100%-off test codes) at the Checkout page. */
    allow_promotion_codes: true,
    metadata: { orderRef, recordId: recordId || '', kind: 'policy' },
    success_url: `${baseUrl}/policy?paid=1&sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/policy?canceled=1`
  };
  return params;
}

async function createPolicyCheckoutSession({ baseUrl, orderRef, recordId, email, order }) {
  const params = policySessionParams({ baseUrl, orderRef, recordId, email, order });
  return stripeReq('POST', 'checkout/sessions', params);
}

/* A payment link for one year's review renewal. Payment links do not expire,
 * so the office can send one about 30 days ahead and the buyer pays when
 * ready. The link metadata comes back on the Checkout session the link
 * creates, which is how the webhook recognises a renewal. */
async function createReviewRenewalLink({ roi, orderRef, recordId }) {
  const priceId = await ensureReviewPrice(roi);
  const link = await stripeReq('POST', 'payment_links', {
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { kind: 'policy_review_renewal', orderRef: orderRef || '', recordId: recordId || '' }
  });
  return { id: link.id, url: link.url };
}

/* Renewal links are single-use: once paid, turn the link off. */
async function deactivatePaymentLink(id) {
  return stripeReq('POST', `payment_links/${encodeURIComponent(id)}`, { active: 'false' });
}

const MODE = SIMULATED ? 'simulated' : (LIVEMODE_KEY ? 'live' : 'test');

/* Verify a `stripe-signature` header against the raw request body. */
function verifyWebhook(rawBody, sigHeader, toleranceSec = 300) {
  if (!WEBHOOK_SECRET || !sigHeader || !rawBody) return false;
  const parts = Object.create(null);
  for (const bit of String(sigHeader).split(',')) {
    const [k, v] = bit.split('=');
    if (k === 't') parts.t = v;
    if (k === 'v1') (parts.v1 = parts.v1 || []).push(v);
  }
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)
    .update(`${parts.t}.${rawBody}`).digest('hex');
  return parts.v1.some(sig => {
    try {
      return sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch (e) { return false; }
  });
}

module.exports = {
  SIMULATED, LIVEMODE_KEY, WEBHOOK_SECRET, MODE,
  createCheckoutSession, getSession, verifyWebhook,
  createPolicyCheckoutSession, policySessionParams, ensureReviewPrice,
  createReviewRenewalLink, deactivatePaymentLink
};
