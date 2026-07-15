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
      'Content-Type': 'application/x-www-form-urlencoded'
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
    payment_intent_data: { description: `Fee note ${reference}` },
    metadata: { reference, recordId: recordId || '' },
    success_url: `${baseUrl}/?paid=1&sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?canceled=1`
  });
}

const getSession = id => stripeReq('GET', `checkout/sessions/${encodeURIComponent(id)}`);

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

module.exports = { SIMULATED, LIVEMODE_KEY, WEBHOOK_SECRET, createCheckoutSession, getSession, verifyWebhook };
