/* Unit tests for the policy commerce pipeline. No network: Stripe is exercised
   through the pure parameter builder and a synthetic signed webhook, Airtable
   and Postmark run in their dry-run modes.

   Run: node test/policy-commerce.test.js */
'use strict';

process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret_for_unit_tests';
process.env.CLIENT_CODES = 'NIVHA-TESTCODE';
process.env.ADMIN_TOKEN = 'unit-test-admin-token';
delete process.env.AIRTABLE_PAT;
delete process.env.POSTMARK_TOKEN;
delete process.env.STRIPE_SECRET_KEY;

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const express = require('express');

const pricing = require('../lib/policy-pricing');
const stripe = require('../lib/stripe');
const register = require('../lib/policy-register');
const fulfilment = require('../lib/policy-fulfilment');
const policyOrders = require('../lib/policy-orders');

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ---------------- pricing ---------------- */

test('policy only, card, UK: 10% pay-now discount then VAT', () => {
  const o = pricing.computeOrder({ payMethod: 'card', billingCountry: 'uk' });
  assert.strictEqual(o.subtotal, 112.5);
  assert.strictEqual(o.vat, 22.5);
  assert.strictEqual(o.total, 135);
  assert.strictEqual(o.promptDiscountPence, 1250);
  assert.strictEqual(o.clientDiscountPence, 0);
});

test('policy only, invoice, UK: list price, no pay-now discount', () => {
  const o = pricing.computeOrder({ payMethod: 'invoice', billingCountry: 'uk' });
  assert.strictEqual(o.subtotal, 125);
  assert.strictEqual(o.total, 150);
  assert.strictEqual(o.promptDiscountPence, 0);
});

test('full pack is cheaper than the three items bought separately', () => {
  const all = pricing.computeOrder({ packItems: pricing.PACK_IDS, payMethod: 'invoice' });
  const two = pricing.computeOrder({ packItems: ['employee_awareness_leaflet', 'manager_guidance'], payMethod: 'invoice' });
  assert.ok(all.lines.some(l => l.id === 'full_pack'));
  assert.strictEqual(all.subtotal, 200);   /* 125 + 75 bundle */
  assert.strictEqual(two.subtotal, 170);   /* 125 + 10 + 35   */
});

test('client rate then pay-now, review excluded from both', () => {
  const o = pricing.computeOrder({
    packItems: pricing.PACK_IDS, reviewService: true, clientRate: true,
    payMethod: 'card', billingCountry: 'uk'
  });
  assert.strictEqual(o.clientDiscountPence, 8000);
  assert.strictEqual(o.promptDiscountPence, 1200);
  assert.strictEqual(o.subtotal, 168);
  assert.strictEqual(o.vat, 33.6);
  assert.strictEqual(o.total, 201.6);
  const review = o.lines.find(l => l.id === 'annual_review');
  assert.strictEqual(review.netPence, review.listPence, 'the review is never discounted');
});

test('an invoice never carries the pay-now discount, even at the client rate', () => {
  const o = pricing.computeOrder({ clientRate: true, payMethod: 'invoice' });
  assert.strictEqual(o.subtotal, 75);
  assert.strictEqual(o.promptDiscountPence, 0);
});

test('Republic of Ireland billing: no VAT and the reverse charge note', () => {
  const o = pricing.computeOrder({ packItems: ['employee_awareness_leaflet'], payMethod: 'invoice', billingCountry: 'roi' });
  assert.strictEqual(o.vat, 0);
  assert.strictEqual(o.total, 135);
  assert.ok(o.reverseCharge);
  assert.ok(/Article 196/.test(o.vatNote));
});

test('contract clause wording is free and always with the policy', () => {
  const o = pricing.computeOrder({ payMethod: 'card' });
  const cc = o.lines.find(l => l.id === 'contract_clauses');
  assert.ok(cc && cc.grossPence === 0);
});

test('line totals reconcile to the order totals, to the penny', () => {
  const o = pricing.computeOrder({ packItems: pricing.PACK_IDS, reviewService: true, clientRate: true, payMethod: 'card' });
  const sum = o.lines.reduce((s, l) => s + l.grossPence, 0);
  assert.strictEqual(sum, o.totalPence);
  assert.strictEqual(o.subtotalPence + o.vatPence, o.totalPence);
});

test('client codes come from the environment; the demo code is refused in production mode', () => {
  assert.strictEqual(pricing.validateClientCode('nivha-testcode').valid, true);
  assert.strictEqual(pricing.validateClientCode('NIVHA-CLIENT').valid, false);
  assert.strictEqual(pricing.validateClientCode('NIVHA-CLIENT', { allowDemo: true }).valid, true);
  assert.strictEqual(pricing.validateClientCode('').valid, false);
});

/* ---------------- Stripe parameters ---------------- */

test('checkout parameters: gross amounts, policy metadata and return URLs', () => {
  const order = pricing.computeOrder({ packItems: pricing.PACK_IDS, payMethod: 'card' });
  const p = stripe.policySessionParams({
    baseUrl: 'https://example.test', orderRef: 'POL-ABCD', recordId: 'recABC1234567890',
    email: 'buyer@example.test', order
  });
  assert.strictEqual(p.mode, 'payment');
  assert.strictEqual(p.metadata.kind, 'policy');
  assert.strictEqual(p.metadata.orderRef, 'POL-ABCD');
  assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));
  assert.ok(p.cancel_url.endsWith('/policy?canceled=1'));
  const total = p.line_items.reduce((s, li) => s + li.price_data.unit_amount, 0);
  assert.strictEqual(total, order.totalPence, 'Stripe is asked for exactly the order total');
  assert.ok(!p.line_items.some(li => li.price_data && li.price_data.unit_amount === 0), 'free lines are not sent to Stripe');
});

test('with the annual review the card is saved so the subscription can start later', () => {
  const order = pricing.computeOrder({ reviewService: true, payMethod: 'card' });
  const p = stripe.policySessionParams({
    baseUrl: 'https://example.test', orderRef: 'POL-ABCD', recordId: 'recABC1234567890',
    order, reviewPriceId: 'price_test123'
  });
  assert.strictEqual(p.mode, 'payment');
  assert.strictEqual(p.customer_creation, 'always');
  assert.strictEqual(p.payment_intent_data.setup_future_usage, 'off_session');
  assert.strictEqual(p.metadata.reviewMode, 'setup');
  assert.strictEqual(p.metadata.reviewPriceId, 'price_test123');
  const oneOff = order.lines.filter(l => !l.recurring && l.grossPence > 0).reduce((s, l) => s + l.grossPence, 0);
  assert.strictEqual(p.line_items.reduce((s, li) => s + li.price_data.unit_amount, 0), oneOff,
    'the review is not charged today');
});

test('webhook signatures: a good one verifies, a tampered one does not', () => {
  const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${ts}.${body}`).digest('hex');
  assert.strictEqual(stripe.verifyWebhook(body, `t=${ts},v1=${sig}`), true);
  assert.strictEqual(stripe.verifyWebhook(body, `t=${ts},v1=${'0'.repeat(64)}`), false);
  assert.strictEqual(stripe.verifyWebhook(Buffer.from('{"id":"evt_2"}'), `t=${ts},v1=${sig}`), false);
  assert.strictEqual(stripe.verifyWebhook(body, `t=${ts - 4000},v1=${sig}`), false, 'old timestamps are rejected');
});

/* ---------------- fulfilment ---------------- */

test('jurisdictions: uk expands, unknown values fall back to Northern Ireland', () => {
  assert.deepStrictEqual(fulfilment.jurisdictionsFrom({ quiz: { jurisdiction: 'ni_roi' } }), ['ni', 'roi']);
  assert.deepStrictEqual(fulfilment.jurisdictionsFrom({ quiz: { jurisdictions: ['uk'] } }), ['ni', 'gb']);
  assert.deepStrictEqual(fulfilment.jurisdictionsFrom({ quiz: {} }), ['ni']);
  assert.deepStrictEqual(fulfilment.registerJurisdictions({ quiz: { jurisdiction: 'roi' } }), ['Republic of Ireland']);
});

test('a two-jurisdiction order with the full pack produces one file set, no duplicates', async () => {
  const order = pricing.computeOrder({ packItems: pricing.PACK_IDS, payMethod: 'card' });
  const files = await fulfilment.buildOrderFiles({
    answers: { details: { company: 'Test Org Ltd' }, quiz: { jurisdiction: 'ni_gb' } }, order
  });
  const names = files.map(f => f.filename);
  assert.strictEqual(new Set(names).size, names.length, 'no file is attached twice');
  assert.ok(names.includes('Drug-and-alcohol-policy-Test-Org-Ltd-Northern-Ireland.docx'));
  assert.ok(names.includes('Drug-and-alcohol-policy-Test-Org-Ltd-Great-Britain.docx'));
  assert.ok(names.includes('nivha_pack_03_toolbox_talk_condensed.pptx'));
  assert.ok(names.includes('nivha_pack_05_contract_clauses.docx'), 'clause wording rides with the policy');
  assert.strictEqual(files.length, 8);
});

test('a pack-only order gets no policy document and no clause wording', async () => {
  const order = pricing.computeOrder({ policy: false, packItems: ['manager_guidance'], payMethod: 'card' });
  const files = await fulfilment.buildOrderFiles({ answers: { details: { company: 'X' }, quiz: {} }, order });
  assert.deepStrictEqual(files.map(f => f.filename), ['nivha_pack_02_manager_guidance.docx']);
});

/* ---------------- routes, end to end in dry run ---------------- */

function startApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  policyOrders.mount(app, { baseUrl: 'http://127.0.0.1:0' });
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function req(port, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({
      host: '127.0.0.1', port, method, path,
      headers: Object.assign({ 'content-type': 'application/json' }, data ? { 'content-length': data.length } : {}, headers || {})
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(raw.toString('utf8')); } catch (e) { /* not json */ }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const TOKEN = process.env.ADMIN_TOKEN;
const sampleOrder = extra => Object.assign({
  payMethod: 'invoice',
  packItems: [],
  reviewService: false,
  acknowledgements: { understanding: true, businessBuyer: true },
  details: { company: 'Route Test Ltd', contactName: 'A Buyer', contactEmail: 'buyer@example.test', billingCountry: 'uk' },
  quiz: { jurisdiction: 'ni', sector: 'construction' }
}, extra || {});

test('the order routes: validation, invoice order, admin gate, approval and delivery', async () => {
  const { server, port } = await startApp();
  try {
    /* validation */
    let r = await req(port, 'POST', '/api/policy/orders', sampleOrder({ details: { company: '', contactEmail: 'x@y.z', contactName: 'A' } }));
    assert.strictEqual(r.status, 400);
    r = await req(port, 'POST', '/api/policy/orders', sampleOrder({ details: { company: 'A Ltd', contactName: 'A', contactEmail: 'not-an-email' } }));
    assert.strictEqual(r.status, 400);
    r = await req(port, 'POST', '/api/policy/orders', sampleOrder({ acknowledgements: { understanding: true, businessBuyer: false } }));
    assert.strictEqual(r.status, 400, 'both declarations are required');
    r = await req(port, 'POST', '/api/policy/orders', sampleOrder({ clientCode: 'MADE-UP' }));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.json.badCode, true);

    /* card is withheld while Stripe is unconfigured */
    r = await req(port, 'POST', '/api/policy/orders', sampleOrder({ payMethod: 'card' }));
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.json.cardUnavailable, true);
    assert.ok(!/!/.test(r.json.error), 'no exclamation marks in buyer-facing copy');

    /* a real invoice order */
    r = await req(port, 'POST', '/api/policy/orders', sampleOrder({ clientCode: 'NIVHA-TESTCODE' }));
    assert.strictEqual(r.status, 200);
    assert.match(r.json.orderRef, /^POL-[A-Z0-9]{4}$/);
    assert.strictEqual(r.json.totals.total, 90);   /* 125 less the 40% client rate, plus VAT */
    const recordId = r.json.recordId;

    const rec = await register.getOrder(recordId);
    assert.strictEqual(rec.fields['Status'], register.STATUS.INVOICED);
    assert.strictEqual(rec.fields['Payment method'], 'Invoice');
    assert.strictEqual(rec.fields['Client code used'], 'NIVHA-TESTCODE');
    assert.deepStrictEqual(rec.fields['Items'], ['Policy']);
    assert.deepStrictEqual(rec.fields['Jurisdictions'], ['Northern Ireland']);
    assert.ok(JSON.parse(rec.fields['Answers JSON']).order, 'the priced order is snapshotted');

    /* fulfilment runs in the background */
    for (let i = 0; i < 40; i++) {
      const cur = await register.getOrder(recordId);
      if (cur.fields['Fulfilment status'] === register.FULFILMENT.AWAITING) break;
      await new Promise(s => setTimeout(s, 100));
    }
    assert.strictEqual((await register.getOrder(recordId)).fields['Fulfilment status'], register.FULFILMENT.AWAITING);
    assert.strictEqual((await register.documentsFor(recordId)).length, 2);

    /* the admin gate */
    r = await req(port, 'GET', '/api/admin/policy/orders');
    assert.strictEqual(r.status, 404, 'no token, no gate');
    r = await req(port, 'GET', '/api/admin/policy/orders', null, { 'x-admin-token': TOKEN + 'x' });
    assert.strictEqual(r.status, 404, 'a wrong token is a 404, not a 401');
    r = await req(port, 'GET', '/api/admin/policy/orders', null, { 'x-admin-token': TOKEN });
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.orders.some(o => o.id === recordId));

    /* document proxy */
    r = await req(port, 'GET', `/api/admin/policy/orders/${recordId}/documents/0`, null, { 'x-admin-token': TOKEN });
    assert.strictEqual(r.status, 200);
    assert.ok(r.raw.length > 5000);
    assert.strictEqual(r.raw.slice(0, 2).toString(), 'PK', 'a real Office file comes back');
    r = await req(port, 'GET', `/api/admin/policy/orders/${recordId}/documents/9`, null, { 'x-admin-token': TOKEN });
    assert.strictEqual(r.status, 404);

    /* the sign-off gate: clause wording is still stamped as a draft */
    r = await req(port, 'POST', `/api/admin/policy/orders/${recordId}/approve`, { approvedBy: 'Tester' }, { 'x-admin-token': TOKEN });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.json.awaitingSignoff, true);
    assert.ok(/awaiting final sign-off/i.test(r.json.error));
    assert.strictEqual((await register.getOrder(recordId)).fields['Fulfilment status'], register.FULFILMENT.AWAITING,
      'a blocked order stays where it was');

    /* once the pack is signed off, approval delivers */
    const realDraftCheck = fulfilment.draftStamped;
    fulfilment.draftStamped = () => [];
    policyOrders.draftStampedShipped.cache = null;
    try {
      /* the module caches its scan, so clear it through a fresh require */
      delete require.cache[require.resolve('../lib/policy-orders')];
      const fresh = require('../lib/policy-orders');
      const app2 = express();
      app2.use(express.json());
      fresh.mount(app2, { baseUrl: 'http://127.0.0.1:0' });
      const s2 = await new Promise(res2 => { const s = app2.listen(0, '127.0.0.1', () => res2(s)); });
      const p2 = s2.address().port;
      const r2 = await req(p2, 'POST', `/api/admin/policy/orders/${recordId}/approve`, { approvedBy: 'Tester' }, { 'x-admin-token': TOKEN });
      s2.close();
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(r2.json.delivered, true);
      assert.strictEqual(r2.json.files, 2);
      const done = await register.getOrder(recordId);
      assert.strictEqual(done.fields['Fulfilment status'], register.FULFILMENT.DELIVERED);
      assert.strictEqual(done.fields['Approved by'], 'Tester');
      assert.ok(done.fields['Delivered at']);
      assert.ok(done.fields['Postmark message IDs']);
    } finally {
      fulfilment.draftStamped = realDraftCheck;
    }

    /* hold writes to the register notes */
    r = await req(port, 'POST', `/api/admin/policy/orders/${recordId}/hold`, { note: 'Checking the wording' }, { 'x-admin-token': TOKEN });
    assert.strictEqual(r.status, 200);
    assert.ok(/Checking the wording/.test((await register.getOrder(recordId)).fields['Notes']));

    /* confirm needs Stripe */
    r = await req(port, 'GET', '/api/policy/orders/confirm?sid=cs_test_123');
    assert.strictEqual(r.status, 400);
  } finally {
    server.close();
  }
});

test('order references are unique across a burst', async () => {
  const refs = await Promise.all(Array.from({ length: 40 }, () => register.nextOrderRef()));
  assert.strictEqual(new Set(refs).size, refs.length);
  refs.forEach(r => assert.match(r, /^POL-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/));
});

/* ---------------- run ---------------- */

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`  ok  ${name}`);
    } catch (err) {
      console.error(`FAIL  ${name}\n      ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
})();
