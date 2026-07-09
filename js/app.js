/* NIVHA Fee Note wizard — simulation, no data leaves the page */
(function () {
  'use strict';

  /* ---------------- state ---------------- */
  const state = {
    step: 1,
    maxVisited: 1,
    route: null,                 // 'solicitor' | 'trust' | 'private'
    concerns: new Set(),
    basket: new Map(),           // code -> { fastTrack: bool }
    notices: [],
    collection: null,        // 'belfast' | 'derry' | 'mobile'
    details: {},
    refNumber: null
  };

  const byCode = Object.fromEntries(CATALOGUE.map(p => [p.code, p]));
  const gbp = n => '£' + n.toLocaleString('en-GB');
  const disp = code => code.replace('H-EtG-FAEE', 'H-EtG/FAEE');

  /* ---------------- routes (step 1) ---------------- */
  const ROUTES = [
    {
      id: 'solicitor',
      title: 'Solicitor or legal representative',
      sub: 'Instructing on behalf of a client in family or criminal proceedings.',
      points: ['Fee note addressed to your practice', 'Results released on payment or 30-day guarantee', 'Court-ready expert reports']
    },
    {
      id: 'trust',
      title: 'Trust or social services',
      sub: 'Health and social care trusts, family support and safeguarding teams.',
      points: ['Fee note raised against your team or purchase order', 'Invoiced to the trust', 'Court-ready expert reports']
    },
    {
      id: 'private',
      title: 'Private individual',
      sub: 'Arranging and paying for your own testing.',
      points: ['Plain-English guidance throughout', 'Secure payment in advance', 'Your results stay confidential to you']
    }
  ];

  /* ---------------- locations (step 1) ---------------- */
  const LOCATIONS = [
    {
      id: 'belfast',
      title: 'NIVHA office — Belfast',
      sub: 'Collection is included in your fee. Every sample type — hair, nail, urine and blood — is collected here.'
    },
    {
      id: 'derry',
      title: 'NIVHA office — Derry~Londonderry',
      sub: 'Collection is included in your fee.',
      flag: 'Limited panel range — nail testing is not available at this location.'
    },
    {
      id: 'mobile',
      title: 'Our collector comes to you',
      sub: gbp(MOBILE_COLLECTION_FEE) + ' + VAT, up to 40 miles. Added to your fee note.'
    }
  ];

  const locLabel = () =>
    state.collection === 'belfast' ? 'NIVHA office — Belfast'
    : state.collection === 'derry' ? 'NIVHA office — Derry~Londonderry'
    : 'mobile collection at your offices';

  /* ---------------- icons ---------------- */
  const ICONS = {
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    pill: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="m8.5 8.5 7 7" transform="rotate(0)"/>',
    shield: '<path d="M12 3 5 5.5v6c0 4.5 3 7.5 7 9.5 4-2 7-5 7-9.5v-6L12 3z"/><path d="m9 11.5 2.2 2.2L15.5 9"/>',
    wave: '<path d="M3 15c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>',
    history: '<path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 12H1.5M4 12l-1.8 2.5"/><path d="M12 8v4l3 2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>',
    check: '<path d="m5 13 4.5 4.5L19 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".5" fill="currentColor"/>'
  };
  const icon = (name, size = 22) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ---------------- navigation ---------------- */
  const sections = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-done'];

  function goTo(step) {
    state.step = step;
    state.maxVisited = Math.max(state.maxVisited, step);
    sections.forEach((id, i) => {
      document.getElementById(id).hidden = (i + 1 !== step) && !(step === 6 && id === 'step-done');
    });
    if (step === 6) sections.slice(0, 5).forEach(id => document.getElementById(id).hidden = true);
    renderStepper();
    if (step === 3) { renderCatalogue(); renderNotices(); renderSummary(); }
    if (step === 4) { renderDetailsForm(); renderSummary(); }
    if (step === 5) renderFeeNote();
    updateMobileBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderStepper() {
    document.querySelectorAll('#stepper .step').forEach(el => {
      const s = +el.dataset.step;
      el.classList.toggle('active', s === state.step);
      el.classList.toggle('done', s < state.step && state.step <= 5);
      el.disabled = s > state.maxVisited || state.step === 6;
    });
    document.querySelector('.stepper').style.display = state.step === 6 ? 'none' : '';
  }

  document.querySelectorAll('#stepper .step').forEach(el =>
    el.addEventListener('click', () => goTo(+el.dataset.step)));
  document.querySelectorAll('[data-back]').forEach(el =>
    el.addEventListener('click', () => goTo(state.step - 1)));

  /* ---------------- step 1 ---------------- */
  function renderRoutes() {
    const grid = document.getElementById('route-grid');
    grid.innerHTML = ROUTES.map(r => `
      <button class="route-card ${state.route === r.id ? 'selected' : ''}" data-route="${r.id}">
        <span class="route-title">${r.title}</span>
        <span class="route-sub">${r.sub}</span>
        <ul class="route-points">${r.points.map(p => `<li>${icon('check', 15)}<span>${p}</span></li>`).join('')}</ul>
        <span class="route-cta">Start here</span>
      </button>`).join('');
    grid.querySelectorAll('.route-card').forEach(card =>
      card.addEventListener('click', () => {
        state.route = card.dataset.route;
        state.refNumber = (state.route === 'private' ? 'PCN-' : 'CCN-') + (state.route === 'private' ? '0214' : '9281');
        renderRoutes();
        renderLocations();
        setTimeout(() =>
          document.getElementById('location-block').scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
      }));
  }

  function renderLocations() {
    const block = document.getElementById('location-block');
    block.hidden = !state.route;
    if (!state.route) return;
    const grid = document.getElementById('location-grid');
    grid.innerHTML = LOCATIONS.map(l => `
      <button class="route-card location-card ${state.collection === l.id ? 'selected' : ''}" data-location="${l.id}">
        <span class="route-title">${l.title}</span>
        <span class="route-sub">${l.sub}</span>
        ${l.flag ? `<span class="location-flag">${icon('info', 15)}<span>${l.flag}</span></span>` : ''}
        <span class="route-cta">${state.collection === l.id ? 'Selected' : 'Choose this location'}</span>
      </button>`).join('');
    grid.querySelectorAll('[data-location]').forEach(card =>
      card.addEventListener('click', () => {
        state.collection = card.dataset.location;
        if (state.collection === 'derry') removeNailPanels();
        renderLocations();
        setTimeout(() => goTo(2), 220);
      }));
  }

  function removeNailPanels() {
    const removed = [];
    [...state.basket.keys()].forEach(code => {
      if (byCode[code].group === 'nail') { state.basket.delete(code); removed.push(code); }
    });
    if (removed.length && !state.notices.some(n => n.key === 'derry-nail')) {
      state.notices.push({
        key: 'derry-nail', type: 'warn',
        html: `<strong>Nail testing is not available at our Derry~Londonderry office.</strong> We have removed ${removed.map(disp).join(', ')} from your fee note. Hair panels cover around 3 months, or choose the Belfast office for a 6 to 12 month nail history.`
      });
    }
  }

  /* ---------------- step 2 ---------------- */
  function renderConcerns() {
    const grid = document.getElementById('concern-grid');
    grid.innerHTML = CONCERNS.map(c => `
      <button class="concern-card ${state.concerns.has(c.id) ? 'selected' : ''}" data-concern="${c.id}" aria-pressed="${state.concerns.has(c.id)}">
        <span class="concern-icon">${icon(c.icon)}</span>
        <span class="concern-text"><strong>${c.title}</strong><span>${c.sub}</span></span>
        <span class="concern-tick">${icon('check', 16)}</span>
      </button>`).join('');
    grid.querySelectorAll('.concern-card').forEach(card =>
      card.addEventListener('click', () => {
        const id = card.dataset.concern;
        state.concerns.has(id) ? state.concerns.delete(id) : state.concerns.add(id);
        renderConcerns();
        updateComboHint();
        document.getElementById('to-step-3').disabled = state.concerns.size === 0;
      }));
    updateComboHint();
    document.getElementById('to-step-3').disabled = state.concerns.size === 0;
  }

  function updateComboHint() {
    const el = document.getElementById('combo-hint');
    if (state.concerns.has('drugs-months') && !state.concerns.has('drugs-recent')) {
      el.hidden = false;
      el.innerHTML = `${icon('info', 18)}<div><strong>Worth knowing.</strong> New drug use takes about a week to appear in hair. Where cannabis or very recent use is a concern, courts often ask for a urine test alongside hair — you can add one on the next step.</div>`;
    } else {
      el.hidden = true;
    }
  }

  document.getElementById('to-step-3').addEventListener('click', () => {
    applyRecommendations();
    goTo(3);
  });

  function applyRecommendations() {
    const recommended = new Set();
    state.concerns.forEach(id => {
      const c = CONCERNS.find(x => x.id === id);
      c.recommends.forEach(code => recommended.add(code));
    });
    recommended.forEach(code => {
      if (state.collection === 'derry' && byCode[code].group === 'nail') {
        if (!state.notices.some(n => n.key === 'derry-nail')) {
          state.notices.push({
            key: 'derry-nail', type: 'warn',
            html: `<strong>Nail testing is not available at our Derry~Londonderry office.</strong> We have not added the nail panel — hair panels cover around 3 months, or go back and choose the Belfast office for a 6 to 12 month nail history.`
          });
        }
        return;
      }
      if (!state.basket.has(code)) state.basket.set(code, { fastTrack: false });
    });
    resolveConflicts(true);
  }

  /* ---------------- conflicts ---------------- */
  function resolveConflicts(silent) {
    INCLUSION_RULES.forEach(rule => {
      if (state.basket.has(rule.superset) && state.basket.has(rule.subset)) {
        state.basket.delete(rule.subset);
        const sup = byCode[rule.superset], sub = byCode[rule.subset];
        state.notices.push({
          type: 'saving',
          html: `<strong>${disp(sup.code)} already includes everything in ${disp(sub.code)}.</strong> We have removed ${disp(sub.code)} from your fee note and saved you ${gbp(sub.price)} + VAT.`
        });
      }
    });
    if (!silent) { renderNotices(); }
  }

  function renderNotices() {
    const el = document.getElementById('notices');
    el.innerHTML = state.notices.map((n, i) => `
      <div class="notice notice-${n.type}">
        ${icon(n.type === 'saving' ? 'check' : 'info', 18)}
        <div>${n.html}</div>
        <button class="notice-dismiss" data-dismiss="${i}" aria-label="Dismiss">×</button>
      </div>`).join('');
    el.querySelectorAll('[data-dismiss]').forEach(b =>
      b.addEventListener('click', () => { state.notices.splice(+b.dataset.dismiss, 1); renderNotices(); }));
  }

  /* ---------------- step 3 — catalogue ---------------- */
  function renderCatalogue() {
    const wrap = document.getElementById('catalogue');
    const groups = ['hair', 'urine', 'blood', 'nail'];
    wrap.innerHTML = groups.map(g => {
      const meta = GROUP_META[g];
      const items = CATALOGUE.filter(p => p.group === g);
      return `
        <div class="cat-group">
          <div class="cat-group-head"><h2>${meta.label}</h2><p>${meta.note}</p></div>
          <div class="cat-list">${items.map(renderPanelCard).join('')}</div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
      state.basket.set(b.dataset.add, { fastTrack: false });
      resolveConflicts(true);
      renderCatalogue(); renderNotices(); renderSummary(); updateMobileBar();
    }));
    wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      state.basket.delete(b.dataset.remove);
      renderCatalogue(); renderSummary(); updateMobileBar();
    }));
    wrap.querySelectorAll('[data-ft]').forEach(t => t.addEventListener('change', () => {
      const code = t.dataset.ft;
      if (state.basket.has(code)) {
        state.basket.get(code).fastTrack = t.checked;
      } else if (t.checked) {
        state.basket.set(code, { fastTrack: true });
        resolveConflicts(true);
        renderCatalogue(); renderNotices();
      }
      renderSummary(); updateMobileBar();
    }));
  }

  function renderPanelCard(p) {
    const inBasket = state.basket.has(p.code);
    const item = state.basket.get(p.code);
    const unavailable = state.collection === 'derry' && p.group === 'nail';
    const ftToggle = p.fastTrack
      ? `<label class="ft-toggle">
           <input type="checkbox" data-ft="${p.code}" ${item && item.fastTrack ? 'checked' : ''}>
           <span>Fast track <small>+ ${gbp(FAST_TRACK_FEE)} + VAT</small></span>
         </label>`
      : '<span class="ft-na">Fast track not available</span>';
    return `
      <article class="panel-card ${inBasket ? 'in-basket' : ''} ${unavailable ? 'unavailable' : ''}">
        <div class="panel-card-top">
          <div class="panel-card-id">
            <span class="code-chip">${disp(p.code)}</span>
            ${p.popular ? '<span class="popular-chip">Most requested</span>' : ''}
          </div>
          <span class="panel-price">${gbp(p.price)} <small>+ VAT</small></span>
        </div>
        <h3>${p.name}</h3>
        <p class="panel-detects">${p.detects}</p>
        <dl class="panel-facts">
          <div><dt>Covers</dt><dd>${p.window}</dd></div>
          <div><dt>Standard</dt><dd>${p.turnaround}</dd></div>
          <div><dt>Fast track</dt><dd>${p.fastTrack
            ? `Prioritised by the laboratory — ${gbp(FAST_TRACK_FEE)} + VAT per panel.`
            : 'Not available for this panel.'}</dd></div>
        </dl>
        <details class="panel-help"><summary>When to choose this</summary><p>${p.help}</p></details>
        <div class="panel-card-actions">
          ${unavailable
            ? `<span class="ft-na">Not collected at Derry~Londonderry — go back to step 1 and choose the Belfast office if you need this panel.</span>`
            : inBasket
              ? `<button class="btn small ghost" data-remove="${p.code}">Remove</button>
                 ${ftToggle}
                 <span class="added-flag">${icon('check', 15)} On your fee note</span>`
              : `<button class="btn small outline" data-add="${p.code}">Add to fee note</button>
                 ${ftToggle}`}
        </div>
      </article>`;
  }

  /* ---------------- totals & summary ---------------- */
  function computeTotals() {
    let panels = 0, fastTrack = 0;
    state.basket.forEach((item, code) => {
      panels += byCode[code].price;
      if (item.fastTrack && byCode[code].fastTrack) fastTrack += FAST_TRACK_FEE;
    });
    const collection = state.collection === 'mobile' ? MOBILE_COLLECTION_FEE : 0;
    const net = panels + fastTrack + collection;
    const vat = Math.round(net * VAT_RATE * 100) / 100;
    return { panels, fastTrack, collection, net, vat, total: net + vat };
  }

  function renderSummary() {
    const t = computeTotals();
    const rows = [...state.basket.keys()].map(code => {
      const p = byCode[code], item = state.basket.get(code);
      return `<div class="sum-row"><span>${p.code.replace('H-EtG-FAEE', 'H-EtG/FAEE')} · ${p.name}</span><span>${gbp(p.price)}</span></div>
        ${item.fastTrack && p.fastTrack ? `<div class="sum-row sub"><span>Fast track</span><span>${gbp(FAST_TRACK_FEE)}</span></div>` : ''}`;
    }).join('');

    const empty = state.basket.size === 0;
    const html = `
      <div class="summary-card">
        <h2>Your fee note</h2>
        <p class="sum-loc">Collection: ${locLabel()}</p>
        ${empty
          ? `<p class="sum-empty">Nothing here yet. Add at least one panel to continue — if you are unsure, the standard drug panel and alcohol abstinence assessment cover most instructions.</p>`
          : `<div class="sum-rows">${rows}
              ${t.collection ? `<div class="sum-row"><span>Mobile collection at your offices</span><span>${gbp(t.collection)}</span></div>` : ''}
             </div>
             <div class="sum-totals">
               <div class="sum-row"><span>Subtotal</span><span>${gbp(t.net)}</span></div>
               <div class="sum-row"><span>VAT at 20%</span><span>${gbp(t.vat)}</span></div>
               <div class="sum-row grand"><span>Total</span><span>${gbp(t.total)}</span></div>
             </div>
             <p class="sum-note">${state.route === 'private'
                ? 'Payment is taken securely in advance. Results are released to you on completion.'
                : 'Results are released on payment or under our 30-day payment guarantee.'}</p>`}
        ${state.step === 3 ? `<button class="btn primary full" id="sum-continue" ${empty ? 'disabled' : ''}>Continue to your details</button>` : ''}
        ${state.step === 4 ? `<button class="btn primary full" id="sum-review" ${empty ? 'disabled' : ''}>Review fee note</button>` : ''}
      </div>`;

    const el3 = document.getElementById('summary-3'), el4 = document.getElementById('summary-4');
    if (state.step === 3) el3.innerHTML = html;
    if (state.step === 4) el4.innerHTML = html;
    const c = document.getElementById('sum-continue');
    if (c) c.addEventListener('click', () => goTo(4));
    const r = document.getElementById('sum-review');
    if (r) r.addEventListener('click', () => validateDetails() && goTo(5));
  }

  /* ---------------- mobile bar ---------------- */
  function updateMobileBar() {
    const bar = document.getElementById('mobile-total');
    const show = (state.step === 3 || state.step === 4) && state.basket.size > 0;
    bar.hidden = !show;
    if (!show) return;
    const t = computeTotals();
    document.getElementById('mt-count').textContent =
      state.basket.size + (state.basket.size === 1 ? ' panel' : ' panels') + ' · inc. VAT';
    document.getElementById('mt-amount').textContent = gbp(t.total);
    document.getElementById('mt-continue').textContent = state.step === 3 ? 'Continue' : 'Review fee note';
    document.getElementById('mt-continue').onclick = () =>
      state.step === 3 ? goTo(4) : (validateDetails() && goTo(5));
  }

  /* ---------------- step 4 — details ---------------- */
  function field(id, label, opts = {}) {
    const { type = 'text', required = false, hint = '', list = '', placeholder = '' } = opts;
    return `
      <div class="form-field" data-field="${id}">
        <label for="${id}">${label}${required ? '' : ' <span class="optional">optional</span>'}</label>
        ${hint ? `<p class="field-hint">${hint}</p>` : ''}
        <input type="${type}" id="${id}" name="${id}" ${list ? `list="${list}"` : ''}
          placeholder="${placeholder}" value="${state.details[id] || ''}" ${required ? 'required' : ''} autocomplete="off">
        <p class="field-error" hidden>This is needed to raise the fee note.</p>
      </div>`;
  }

  function renderDetailsForm() {
    const form = document.getElementById('details-form');
    const isPrivate = state.route === 'private';
    const hasDSD = state.basket.has('H-DSD');
    const bookingPlace = state.collection === 'mobile'
      ? 'a time for our collector to visit'
      : `an appointment at our ${state.collection === 'derry' ? 'Derry~Londonderry' : 'Belfast'} office`;

    form.innerHTML = `
      ${!isPrivate ? `
      <fieldset>
        <legend>Instructing organisation</legend>
        ${field('org', state.route === 'trust' ? 'Trust or team' : 'Practice name', { required: true, list: 'org-list', hint: 'Start typing — we will match you to organisations we already work with, so your fee note is addressed consistently.', placeholder: 'e.g. Belfast Health and Social Care Trust' })}
        <datalist id="org-list">${KNOWN_ORGS.map(o => `<option value="${o}">`).join('')}</datalist>
        ${field('caseref', 'Your case or purchase order reference', { hint: 'Appears on the fee note so your accounts team can match it.' })}
      </fieldset>` : ''}

      <fieldset>
        <legend>${isPrivate ? 'Your details' : 'Your contact details'}</legend>
        ${field('contactName', 'Full name', { required: true })}
        ${field('contactEmail', 'Email', { type: 'email', required: true, hint: 'Your fee note and appointment confirmation go here.' })}
        ${field('contactPhone', 'Phone', { type: 'tel', required: true })}
      </fieldset>

      <fieldset>
        <legend>About the donor</legend>
        <p class="fieldset-hint">The donor is the person being tested. They will need to bring photo ID to the appointment.</p>
        ${isPrivate ? `
          <div class="form-field">
            <label class="check-row"><input type="checkbox" id="self-donor" ${state.details.selfDonor ? 'checked' : ''}><span>I am the person being tested</span></label>
          </div>` : ''}
        <div id="donor-fields" ${isPrivate && state.details.selfDonor ? 'hidden' : ''}>
          ${field('donorName', 'Donor full name', { required: !(isPrivate && state.details.selfDonor) })}
          ${field('donorDob', 'Donor date of birth', { type: 'date' })}
        </div>
        ${hasDSD ? field('dsdDrug', 'Which single drug should we test for?', { required: true, hint: 'You have chosen the single specified drug panel (H-DSD).' }) : ''}
      </fieldset>

      <fieldset>
        <legend>Booking the appointment</legend>
        <div class="booking-callout">
          ${icon('calendar', 20)}
          <div>
            <p><strong>You choose the time — no phone calls needed.</strong></p>
            <p>After you submit, we email you a secure link to our online scheduling calendar. Use it to book ${bookingPlace} at a time that suits ${isPrivate ? 'you' : 'the donor'}. Cancellation is free up to 24 hours before.</p>
          </div>
        </div>
      </fieldset>

      <div class="panel-actions">
        <button type="button" class="btn ghost" data-back-4>Back</button>
        <button type="submit" class="btn primary">Review fee note</button>
      </div>`;

    form.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        if (inp.type !== 'radio' && inp.type !== 'checkbox') state.details[inp.id] = inp.value;
        const f = inp.closest('.form-field');
        if (f) { f.classList.remove('invalid'); const e = f.querySelector('.field-error'); if (e) e.hidden = true; }
      });
    });

    const self = form.querySelector('#self-donor');
    if (self) self.addEventListener('change', () => {
      state.details.selfDonor = self.checked;
      renderDetailsForm();
    });

    form.querySelector('[data-back-4]').addEventListener('click', () => goTo(3));
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (validateDetails()) goTo(5);
    });
  }

  function validateDetails() {
    const form = document.getElementById('details-form');
    if (!form.innerHTML) return false;
    let ok = true, first = null;
    form.querySelectorAll('input[required]').forEach(inp => {
      const valid = inp.type === 'email'
        ? /.+@.+\..+/.test(inp.value.trim())
        : inp.value.trim().length > 0;
      const f = inp.closest('.form-field');
      if (!valid) {
        ok = false;
        if (f) { f.classList.add('invalid'); const e = f.querySelector('.field-error'); if (e) e.hidden = false; }
        if (!first) first = f || inp;
      }
    });
    if (!ok && first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return ok;
  }

  /* ---------------- step 5 — fee note ---------------- */
  function renderFeeNote() {
    const t = computeTotals();
    const d = state.details;
    const isPrivate = state.route === 'private';
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const donorName = (isPrivate && d.selfDonor) ? d.contactName : d.donorName;

    const lines = [...state.basket.keys()].map(code => {
      const p = byCode[code], item = state.basket.get(code);
      return `
        <tr>
          <td><span class="code-chip small">${p.code.replace('H-EtG-FAEE', 'H-EtG/FAEE')}</span></td>
          <td>${p.name} <span class="doc-detects">${p.detects}</span></td>
          <td class="num">${gbp(p.price)}</td>
        </tr>
        ${item.fastTrack && p.fastTrack ? `
        <tr class="doc-subline">
          <td></td><td>Fast track analysis</td><td class="num">${gbp(FAST_TRACK_FEE)}</td>
        </tr>` : ''}`;
    }).join('');

    document.getElementById('feenote-doc').innerHTML = `
      <div class="doc">
        <div class="doc-head">
          <div class="doc-brand">
            <img class="doc-logo" src="assets/nivha-logo.png" alt="NIVHA" width="428" height="96">
            <div>
              <p class="doc-brand-name">NIVHA Laboratory Services Ltd</p>
              <p class="doc-brand-sub">Chain-of-custody drug and alcohol testing</p>
            </div>
          </div>
          <div class="doc-meta">
            <p><span>Fee note</span><strong>${state.refNumber}</strong></p>
            <p><span>Date</span><strong>${today}</strong></p>
          </div>
        </div>

        <div class="doc-parties">
          <div>
            <p class="doc-label">Prepared for</p>
            <p><strong>${isPrivate ? (d.contactName || '—') : (d.org || '—')}</strong></p>
            ${!isPrivate && d.caseref ? `<p>Ref: ${d.caseref}</p>` : ''}
            ${!isPrivate ? `<p>Attn: ${d.contactName || '—'}</p>` : ''}
          </div>
          <div>
            <p class="doc-label">Donor</p>
            <p><strong>${donorName || '—'}</strong></p>
            ${d.donorDob && !(isPrivate && d.selfDonor) ? `<p>Date of birth: ${new Date(d.donorDob).toLocaleDateString('en-GB')}</p>` : ''}
            <p>Collection: ${state.collection === 'belfast' ? 'NIVHA office — Belfast'
              : state.collection === 'derry' ? 'NIVHA office — Derry~Londonderry'
              : 'Mobile collection at your offices'}</p>
          </div>
        </div>

        <table class="doc-table">
          <thead><tr><th>Code</th><th>Analysis</th><th class="num">Fee</th></tr></thead>
          <tbody>
            ${lines}
            ${t.collection ? `<tr><td></td><td>Mobile collection at your offices (up to 40 miles)</td><td class="num">${gbp(t.collection)}</td></tr>` : ''}
          </tbody>
          <tfoot>
            <tr><td colspan="2">Subtotal</td><td class="num">${gbp(t.net)}</td></tr>
            <tr><td colspan="2">VAT at 20%</td><td class="num">${gbp(t.vat)}</td></tr>
            <tr class="doc-total"><td colspan="2">Total</td><td class="num">${gbp(t.total)}</td></tr>
          </tfoot>
        </table>

        <div class="doc-terms">
          <div>
            <p class="doc-label">Payment</p>
            <p>${isPrivate
              ? 'Payment is taken securely in advance by card. Results are released to you on completion of analysis.'
              : 'Results are released on payment, or under our 30-day payment guarantee for instructing practices and trusts.'}</p>
          </div>
          <div>
            <p class="doc-label">Appointments</p>
            <p>Booked online via the scheduling link we email after submission. The donor must bring photo ID. Cancellation is free up to 24 hours before; missed appointments incur a £50 + VAT fee.</p>
          </div>
          <div>
            <p class="doc-label">Reports</p>
            <p>Expert reports are prepared for court. Additional expert time, if required, is charged at £75 + VAT per hour.</p>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- submit & confirmation ---------------- */
  document.getElementById('declaration-check').addEventListener('change', e => {
    document.getElementById('submit-btn').disabled = !e.target.checked;
  });

  document.getElementById('submit-btn').addEventListener('click', () => {
    const isPrivate = state.route === 'private';
    const t = computeTotals();
    const anyFT = [...state.basket.values()].some(i => i.fastTrack);
    const bookingPlace = state.collection === 'mobile'
      ? 'a time for our collector to visit'
      : `a time at our ${state.collection === 'derry' ? 'Derry~Londonderry' : 'Belfast'} office`;
    const analysisCopy = 'Samples travel to the laboratory under chain of custody. Urine takes about 10 working days, hair about 15.'
      + (anyFT ? ' Your fast-tracked panels are prioritised by the laboratory.' : '');
    const steps = isPrivate
      ? [
        ['Pay securely', 'A payment link for ' + gbp(t.total) + ' arrives by email within a few minutes. Your booking opens once payment clears.'],
        ['Book online', 'An automated email follows with a secure link to our online scheduling calendar — choose ' + bookingPlace + ' that suits you. Bring photo ID.'],
        ['Analysis', analysisCopy],
        ['Your results', 'Your report is released to you, and to no one else, as soon as analysis is complete.']
      ]
      : [
        ['Your fee note', 'A PDF of fee note ' + state.refNumber + ' is on its way to ' + (state.details.contactEmail || 'your inbox') + ' — ready to file or present.'],
        ['Book online', 'An automated email follows with a secure link to our online scheduling calendar — choose ' + bookingPlace + ' that suits the donor. The donor brings photo ID.'],
        ['Analysis', analysisCopy],
        ['The report', 'A court-ready expert report is released on payment, or under our 30-day payment guarantee.']
      ];

    document.getElementById('confirmation').innerHTML = `
      <div class="confirm">
        <div class="confirm-badge">${icon('check', 30)}</div>
        <p class="marker">Fee note ${state.refNumber}</p>
        <h1>Thank you — your instruction is in</h1>
        <p class="lede">Here is what happens next.</p>
        <ol class="timeline">
          ${steps.map(([h, b], i) => `
            <li><span class="timeline-num">${String(i + 1).padStart(2, '0')}</span>
              <div><strong>${h}</strong><p>${b}</p></div></li>`).join('')}
        </ol>
        <div class="confirm-actions">
          <button class="btn outline" id="restart">Start another fee note</button>
        </div>
      </div>`;
    document.getElementById('restart').addEventListener('click', () => location.reload());
    goTo(6);
  });

  /* ---------------- init ---------------- */
  renderRoutes();
  renderLocations();
  renderConcerns();
  goTo(1);
})();
