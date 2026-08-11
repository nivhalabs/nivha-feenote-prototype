#!/usr/bin/env python3
"""One-off patch for js/policy.js: wire the wizard to the order endpoints,
retire the prototype helpers and prototype wording."""
import re, sys

p = 'js/policy.js'
s = open(p, encoding='utf-8').read()
orig = s


def sub(old, new, count=1):
    global s
    assert old in s, f'not found: {old[:80]}'
    s = s.replace(old, new, count)


# 1. header
sub("""/* NIVHA drug and alcohol policy builder — funnel + wizard (prototype)
   Free layer: two-minute policy health check -> personalised snapshot ->
   email gate -> teaser clause. Paid layer: full policy builder with
   document pack upsell and simulated payment. Reuses the fee note
   design system (css/style.css). */""",
    """/* NIVHA drug and alcohol policy builder — funnel + wizard.
   Free layer: two-minute policy health check -> personalised snapshot ->
   email gate -> teaser clause. Paid layer: the full builder, the document
   pack upsell, and a real order placed against /api/policy/orders — the
   server prices the order and Stripe takes the payment. Reuses the fee note
   design system (css/style.css). */""")

# 2. state additions
sub("""    refNumber: '',
    paid: false
  };""",
    """    refNumber: '',
    recordId: '',
    paid: false,
    placing: false,
    orderError: ''
  };

  /* Environment, read from the server at start-up. The fill helpers below only
     appear with ?dev=1 on an environment that is not wired to live services. */
  const env = { stripeMode: 'simulated', emailDryRun: true, airtableDryRun: true, ready: false };
  const devRequested = /(^|[?&])dev=1(&|$)/.test(location.search);
  const devTools = () => devRequested && env.ready && env.emailDryRun && env.airtableDryRun;
  const cardAvailable = () => env.stripeMode !== 'simulated';""")

# 3. dev bars — quiz
sub("""      <div class="dev-fill-bar">
        <span>Prototype helper</span>
        <button type="button" class="btn small ghost" id="dev-quiz">Fill sample answers</button>
      </div>`;""",
    """      ${devTools() ? `<div class="dev-fill-bar">
        <span>Test helper</span>
        <button type="button" class="btn small ghost" id="dev-quiz">Fill sample answers</button>
      </div>` : ''}`;""")
sub("""    panel.querySelector('#dev-quiz').addEventListener('click', () => {""",
    """    const devQuiz = panel.querySelector('#dev-quiz');
    if (devQuiz) devQuiz.addEventListener('click', () => {""")

# 4. dev bar — gate
sub("""      <div class="dev-fill-bar gate-dev">
        <span>Prototype helper — skip the email step</span>
        <button type="button" class="btn small ghost" id="dev-gate">Unlock the snapshot</button>
      </div>`;""",
    """      ${devTools() ? `<div class="dev-fill-bar gate-dev">
        <span>Test helper — skip the email step</span>
        <button type="button" class="btn small ghost" id="dev-gate">Unlock the snapshot</button>
      </div>` : ''}`;""")
sub("""    panel.querySelector('#dev-gate').addEventListener('click', () => unlock('test@example.com', 'Example Contracts Ltd'));""",
    """    const devGate = panel.querySelector('#dev-gate');
    if (devGate) devGate.addEventListener('click', () => unlock('test@example.com', 'Example Contracts Ltd'));""")

# 5. dev bar — details form
sub("""      <div class="dev-fill-bar">
        <span>Prototype helper</span>
        <button type="button" class="btn small ghost" id="dev-fill">Fill sample details</button>
      </div>""",
    """      ${devTools() ? `<div class="dev-fill-bar">
        <span>Test helper</span>
        <button type="button" class="btn small ghost" id="dev-fill">Fill sample details</button>
      </div>` : ''}""")
sub("""    form.querySelector('#dev-fill').addEventListener('click', () => {""",
    """    const devFill = form.querySelector('#dev-fill');
    if (devFill) devFill.addEventListener('click', () => {""")

# 6. teaser wording
sub("""          <span>Prototype — the email send is simulated at this stage.</span>""",
    """          <span>It should arrive in the next few minutes. Check your junk folder if it does not.</span>""")

# 7. totals: pay-now discount for any card payment, invoice availability
sub("""    /* pay-now discount — clients choosing card over invoice; excludes the review subscription */
    const promptDiscount = (state.clientApplied && state.payMethod === 'card')
      ? Math.round(goodsNet * CARD_PROMPT_DISCOUNT * 100) / 100 : 0;""",
    """    /* pay-now discount — for paying by card rather than on invoice; the
       review subscription is excluded. Mirrors lib/policy-pricing.js, which
       is the figure actually charged. */
    const promptDiscount = state.payMethod === 'card'
      ? Math.round(goodsNet * CARD_PROMPT_DISCOUNT * 100) / 100 : 0;""")
sub("""invoiceAvailable: state.clientApplied,""",
    """invoiceAvailable: state.clientApplied || !cardAvailable(),""")

# 8. client code — validated by the server
sub("""    document.getElementById('apply-code').addEventListener('click', () => {
      const v = document.getElementById('client-code').value.trim().toUpperCase();
      state.clientCode = v;
      if (v === DEMO_CLIENT_CODE) {
        state.clientApplied = true;
        renderClientCode(); renderDeclaration();
      } else {
        document.getElementById('code-error').hidden = false;
      }
    });""",
    """    document.getElementById('apply-code').addEventListener('click', async () => {
      const btn = document.getElementById('apply-code');
      const v = document.getElementById('client-code').value.trim().toUpperCase();
      state.clientCode = v;
      btn.disabled = true;
      try {
        const res = await fetch('/api/policy/client-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: v })
        });
        const data = await res.json();
        state.clientApplied = !!data.valid;
      } catch (e) {
        state.clientApplied = false;
      }
      if (state.clientApplied) { renderClientCode(); renderDeclaration(); updateMobileBar(); }
      else {
        btn.disabled = false;
        document.getElementById('code-error').hidden = false;
      }
    });""")

# 9. reference number is issued by the server
sub("""    if (!state.accepted || !state.businessAccepted) return;
    if (!state.refNumber) state.refNumber = 'POL-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
    goTo(6);""",
    """    if (!state.accepted || !state.businessAccepted) return;
    goTo(6);""")

# 10. checkout copy and the pay button
sub("""        <p class="lede">Order ${state.refNumber}. ${inv ? 'As a NIVHA testing client you can pay on account — your documents are generated now and a fee note follows by email.' : 'Payment is taken securely in advance — your documents are generated as soon as it clears.'}</p>""",
    """        <p class="lede">${inv ? 'Your documents are prepared now and a fee note follows by email with 14-day terms.' : 'Payment is taken securely in advance — your documents are prepared as soon as it clears.'}</p>""")
sub("""        ${inv ? `<p class="sum-note">${icon('doc', 14)} The fee note is issued to ${esc(state.details.contactEmail || 'your billing contact')} with 14-day payment terms, and this order appears on your NIVHA account like any other instruction.</p>` : `<p class="sum-note">${icon('card', 14)} Payment is processed by Stripe. NIVHA never sees your card details.</p>`}
        <p class="sum-note">Prototype — no card is charged at this stage.</p>
      </div>`;""",
    """        ${inv ? `<p class="sum-note">${icon('doc', 14)} The fee note is issued to ${esc(state.details.contactEmail || 'your billing contact')} with 14-day payment terms, and this order appears on your NIVHA account like any other instruction.</p>` : `<p class="sum-note">${icon('card', 14)} Payment is processed by Stripe. NIVHA never sees your card details.</p>`}
        ${!cardAvailable() && !inv ? `<p class="sum-note">Card payments are available shortly — choose invoice to place your order and we will send a fee note.</p>` : ''}
        <p class="gate-error" id="order-error" ${state.orderError ? '' : 'hidden'}>${esc(state.orderError)}</p>
      </div>`;""")
sub("""    document.getElementById('pay-btn').addEventListener('click', () => {
      state.paid = true;
      goTo(7);
    });""",
    """    document.getElementById('pay-btn').addEventListener('click', placeOrder);""")

# 11. the order call itself, inserted before the confirmation section
sub("""  /* ---------------- confirmation ---------------- */""",
    """  /* Everything the server needs to price, register and fulfil the order. The
     totals on screen are advisory: the server prices it again from these
     answers and that is the figure charged. */
  function orderPayload() {
    return {
      quiz: state.quiz, lead: state.lead, stance: state.stance,
      alcoholEvents: state.alcoholEvents, testingEnabled: state.testingEnabled,
      testingTypes: state.testingTypes, randomMethod: state.randomMethod,
      sampleTypes: state.sampleTypes, provider: state.provider,
      scTypes: state.scTypes, scScope: state.scScope, support: state.support,
      details: state.details,
      packItems: state.packItems,
      reviewService: state.reviewService,
      payMethod: state.payMethod,
      clientCode: state.clientApplied ? state.clientCode : '',
      acknowledgements: {
        understanding: state.accepted,
        businessBuyer: state.businessAccepted,
        termsVersion: state.termsVersion,
        acceptedAt: new Date().toISOString()
      }
    };
  }

  async function placeOrder() {
    if (state.placing) return;
    state.placing = true;
    const btn = document.getElementById('pay-btn');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = state.payMethod === 'invoice' ? 'Placing your order\\u2026' : 'Taking you to secure payment\\u2026';
    state.orderError = '';
    try {
      const res = await fetch('/api/policy/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload())
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.url) { window.location.href = data.url; return; }
      if (res.ok && data.ok && data.invoice) {
        state.refNumber = data.orderRef;
        state.recordId = data.recordId || '';
        state.paid = false;
        state.placing = false;
        goTo(7);
        return;
      }
      if (data.cardUnavailable) {
        env.stripeMode = 'simulated';
        state.payMethod = 'invoice';
        state.orderError = data.error || 'Card payments are available shortly \\u2014 choose invoice to place your order.';
      } else {
        state.orderError = data.error || 'The order could not be placed \\u2014 please try again.';
      }
    } catch (e) {
      state.orderError = 'The order could not be placed \\u2014 check your connection and try again.';
    }
    state.placing = false;
    btn.disabled = false;
    btn.innerHTML = label;
    renderCheckout();
  }

  /* Returning from Stripe with ?paid=1&sid=... — confirm with the server so the
     order is recorded even if the webhook has not landed yet. */
  async function confirmFromStripe(sid) {
    try {
      const res = await fetch('/api/policy/orders/confirm?sid=' + encodeURIComponent(sid));
      const data = await res.json();
      if (data.ok && data.paid) {
        state.paid = true;
        state.refNumber = data.orderRef || state.refNumber;
      }
      return data.ok && data.paid;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- confirmation ---------------- */""")

# 12. confirmation copy: documents are checked, then emailed
sub("""    const steps = [
      ['Your policy is ready now', 'Drafted from your answers — download it below as a Word document' + (state.packItems.length ? ', with your ' + state.packItems.length + ' supporting document' + (state.packItems.length === 1 ? '' : 's') + ' to follow' : '') + '. A copy also goes to ' + esc(d.contactEmail || 'you') + '.'],""",
    """    const steps = [
      ['Your documents are being prepared', 'Drafted from your answers' + (state.packItems.length ? ', with your ' + state.packItems.length + ' supporting document' + (state.packItems.length === 1 ? '' : 's') : '') + '. A member of the NIVHA team checks the pack, then it is emailed to ' + esc(d.contactEmail || 'you') + ' \\u2014 usually the same working day.'],""")
sub("""      <div class="panel-actions">
        <button class="btn primary" id="download-policy">${icon('doc', 16)} Download your policy (Word)</button>
        <a class="btn outline" href="/policy">Start another policy</a>
        <a class="btn ghost" href="/">Drug and alcohol testing</a>
      </div>
      <p class="gate-small" id="download-note">Generated from your answers just now — the same document that is emailed to you.</p>`;

    document.getElementById('download-policy').addEventListener('click', downloadPolicy);
  }""",
    """      <div class="panel-actions">
        <a class="btn outline" href="/policy">Start another policy</a>
        <a class="btn ghost" href="/">Drug and alcohol testing</a>
      </div>
      <p class="gate-small">Keep this order reference. If anything is missing when your documents arrive, email info@nivha.net and quote it.</p>`;
  }""")

# 13. remove the direct download helper
s = re.sub(r"\n  async function downloadPolicy\(\) \{.*?\n  \}\n\n  /\* ---------------- mobile bar",
           "\n  /* ---------------- mobile bar", s, flags=re.S)
assert 'downloadPolicy' not in s, 'download helper still referenced'

# 14. init: read the environment, then handle a return from Stripe
sub("""  /* ---------------- init ---------------- */
  try {
    const saved = JSON.parse(localStorage.getItem(LEAD_KEY) || 'null');
    if (saved && saved.email) state.lead = saved;
  } catch (e) {}
  renderQuiz();""",
    """  /* ---------------- init ---------------- */
  try {
    const saved = JSON.parse(localStorage.getItem(LEAD_KEY) || 'null');
    if (saved && saved.email) state.lead = saved;
  } catch (e) {}

  (async function init() {
    try {
      const res = await fetch('/api/version');
      const v = await res.json();
      env.stripeMode = v.stripeMode || 'simulated';
      env.emailDryRun = !!v.emailDryRun;
      env.airtableDryRun = !!v.airtableDryRun;
    } catch (e) { /* the wizard works either way; invoice is offered instead */ }
    env.ready = true;
    if (!cardAvailable()) state.payMethod = 'invoice';

    const params = new URLSearchParams(location.search);
    const sid = params.get('sid');
    if (params.get('paid') === '1' && sid) {
      const paid = await confirmFromStripe(sid);
      if (paid) {
        history.replaceState({}, '', '/policy');
        renderConfirmation();
        goTo(7);
        return;
      }
    }
    if (params.get('canceled') === '1') history.replaceState({}, '', '/policy');
    renderQuiz();
  })();""")

open(p, 'w', encoding='utf-8').write(s)
print('patched', p, len(orig), '->', len(s))
