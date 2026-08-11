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

/* The annual review is a real recurring price, created once and then found by
 * lookup key. Two variants: UK (£60 + VAT) and ROI (£60, reverse charge). */
const REVIEW_PRICES = {
  uk: { lookupKey: 'policy_annual_review', unitAmount: 7200, name: 'Annual policy review', description: 'Annual refresh of your drug and alcohol policy on the latest NIVHA master, including re-issues when the law materially changes. £60 + VAT a year.' },
  roi: { lookupKey: 'policy_annual_review_roi', unitAmount: 6000, name: 'Annual policy review (reverse charge)', description: 'Annual refresh of your drug and alcohol policy on the latest NIVHA master, including re-issues when the law materially changes. £60 a year, VAT accounted for by the recipient under the reverse charge.' }
};
const priceCache = new Map();

/* Find the recurring price by lookup key, creating the product and price the
 * first time. Cached per process so repeat orders cost one round trip. */
async function ensureReviewPrice(roi) {
  const spec = roi ? REVIEW_PRICES.roi : REVIEW_PRICES.uk;
  if (priceCache.has(spec.lookupKey)) return priceCache.get(spec.lookupKey);
  const found = await stripeReq('GET', `prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(spec.lookupKey)}`);
  let price = (found.data || [])[0];
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
      recurring: { interval: 'year' }
    });
  }
  priceCache.set(spec.lookupKey, price.id);
  return price.id;
}

/* Which shape of Checkout session a basket containing the annual review uses.
 * 'setup'        — mode=payment with the card saved off-session; the webhook
 *                  creates the yearly subscription with a 365-day trial once
 *                  payment clears. One-time items are certain to be charged
 *                  today, which is the behaviour the business relies on.
 * 'subscription' — mode=subscription with subscription_data.trial_end and the
 *                  one-time items alongside. Set POLICY_REVIEW_MODE=subscription
 *                  once it is confirmed in test mode that Stripe charges the
 *                  one-time line items immediately despite the trial. */
const REVIEW_MODE = process.env.POLICY_REVIEW_MODE === 'subscription' ? 'subscription' : 'setup';
const YEAR_SECONDS = 365 * 24 * 60 * 60;

/* Build the Checkout parameters for a policy order. Pure — no network — so
 * the shape can be unit tested without touching Stripe. */
function policySessionParams({ baseUrl, orderRef, recordId, email, order, reviewPriceId, now }) {
  const oneOff = order.lines.filter(l => !l.recurring && l.grossPence > 0);
  const nowSec = Math.floor((now || Date.now()) / 1000);
  const params = {
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
    metadata: { orderRef, recordId: recordId || '', kind: 'policy' },
    success_url: `${baseUrl}/policy?paid=1&sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/policy?canceled=1`
  };
  if (order.hasReview && REVIEW_MODE === 'subscription') {
    params.mode = 'subscription';
    params.line_items.push({ quantity: 1, price: reviewPriceId });
    params.subscription_data = {
      trial_end: nowSec + YEAR_SECONDS,
      metadata: { orderRef, recordId: recordId || '', kind: 'policy' }
    };
  } else {
    params.mode = 'payment';
    if (order.hasReview) {
      /* Save the card so the webhook can start the review subscription. */
      params.customer_creation = 'always';
      params.payment_intent_data = { setup_future_usage: 'off_session' };
      params.metadata.reviewPriceId = reviewPriceId || '';
      params.metadata.reviewMode = 'setup';
    }
  }
  return params;
}

async function createPolicyCheckoutSession({ baseUrl, orderRef, recordId, email, order }) {
  const reviewPriceId = order.hasReview ? await ensureReviewPrice(order.reverseCharge) : null;
  const params = policySessionParams({ baseUrl, orderRef, recordId, email, order, reviewPriceId });
  return stripeReq('POST', 'checkout/sessions', params);
}

/* Start the annual review a year out, on the card saved at Checkout. */
async function createReviewSubscription({ customer, paymentMethod, priceId, orderRef, recordId, now }) {
  const nowSec = Math.floor((now || Date.now()) / 1000);
  return stripeReq('POST', 'subscriptions', {
    customer,
    items: [{ price: priceId }],
    trial_end: nowSec + YEAR_SECONDS,
    default_payment_method: paymentMethod || undefined,
    metadata: { orderRef, recordId: recordId || '', kind: 'policy' }
  });
}

const getPaymentIntent = id => stripeReq('GET', `payment_intents/${encodeURIComponent(id)}`);

/* Billing portal link so a buyer can cancel the annual review themselves. */
async function billingPortalUrl({ customer, returnUrl }) {
  const s = await stripeReq('POST', 'billing_portal/sessions', { customer, return_url: returnUrl });
  return s.url;
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
  SIMULATED, LIVEMODE_KEY, WEBHOOK_SECRET, MODE, REVIEW_MODE, YEAR_SECONDS,
  createCheckoutSession, getSession, verifyWebhook,
  createPolicyCheckoutSession, policySessionParams, ensureReviewPrice,
  createReviewSubscription, getPaymentIntent, billingPortalUrl
};
