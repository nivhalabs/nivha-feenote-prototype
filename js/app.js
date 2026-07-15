/* NIVHA Fee Note wizard — payment and booking are simulated; submissions are
   recorded through the fee note API when the service is available. */
(function () {
  'use strict';

  /* ---------------- API (fee note service) ---------------- */
  async function apiCall(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!res.ok) { const e = new Error('API ' + res.status); e.status = res.status; throw e; }
      return await res.json();
    } finally { clearTimeout(timer); }
  }
  /* Published Data Sharing Terms version accepted by Trust/solicitor routes.
     Keep in step with docs/data-sharing-terms.md and /data-sharing-terms. */
  const DST_VERSION = 'v0.1 (draft, July 2026)';

  const API = {
    post: (path, body) => apiCall('POST', path, body),
    patch: (path, body) => apiCall('PATCH', path, body),
    get: path => fetch(path).then(r => r.json().then(data => {
      if (!r.ok) { const e = new Error(data.error || r.statusText); e.status = r.status; throw e; }
      return data;
    }))
  };

  /* ---------------- state ---------------- */
  const state = {
    step: 1,
    maxVisited: 1,
    route: null,                 // 'solicitor' | 'trust' | 'private'
    privateAck: false,           // private clients acknowledge the legal-representation note
    concerns: new Set(),
    basket: new Map(),           // code -> { variant: int, qty: int }
    opts: new Map(),             // code -> { variant, qty } chosen before adding
    expanded: new Set(),         // panel cards opened for detail on step 3
    fastTrack: false,            // fast track applies to the whole instruction
    notices: [],
    collection: null,            // 'belfast' | 'derry' | 'onsite'
    details: {},
    refNumber: null,
    payment: null,               // { receipt, amount } once the simulated payment clears
    booking: null,               // { typeLabel, dateLabel, time, location, notes } once booked
    bookingSkipped: false,
    onsiteArranged: false        // on-site visits are scheduled by the team, not the calendar
  };

  const byCode = Object.fromEntries(CATALOGUE.map(p => [p.code, p]));
  const gbp = n => '£' + n.toLocaleString('en-GB');
  const disp = code => code.replace('H-EtG-FAEE', 'H-EtG/FAEE');

  const getOpts = code => state.opts.get(code) || { variant: 0, qty: 1 };
  const unitPrice = (p, o) => p.variants ? p.variants[o.variant].price : p.price;
  const lineTotal = (p, o) => unitPrice(p, o) * (o.qty || 1);
  const lineLabel = (p, o) => {
    let s = p.name;
    if (p.variants && o.variant > 0) s += ' — ' + p.variants[o.variant].short.toLowerCase();
    if (p.series && o.qty > 1) s += ' — series of ' + (o.qty === 2 ? 'two' : 'three');
    return s;
  };

  /* ---------------- routes (step 1) ---------------- */
  const ROUTES = [
    {
      id: 'solicitor',
      title: 'Solicitor or legal representative',
      sub: 'Instructing on behalf of a client in family or criminal proceedings.',
      points: ['Fee note addressed to your practice', 'Can be submitted to the Legal Aid Authority for approval', 'Invoiced — results released on payment', 'Court-ready expert reports']
    },
    {
      id: 'trust',
      title: 'Trust or social services',
      sub: 'Health and social care trusts, family support and safeguarding teams.',
      points: ['Fee note raised against your team or purchase order', 'Invoiced — results released on payment', 'Court-ready expert reports']
    },
    {
      id: 'private',
      title: 'Private individual',
      sub: 'Arranging and paying for your own testing.',
      points: ['Plain-English guidance throughout', 'Secure card payment in advance', 'Your results stay confidential to you']
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
      sub: gbp(DERRY_COLLECTION_FEE) + ' + VAT collection fee, added to your fee note.',
      flag: 'Limited panel range — nail testing is not available at this location.'
    },
    {
      id: 'onsite',
      title: 'At your location — we come to you',
      sub: 'From ' + gbp(ONSITE_COLLECTION_FROM) + ' + VAT, priced on request — we confirm the fee before the visit.',
      flag: 'Professional environments only, where a private collection room is made available — we do not collect in private homes. A witness may be required to be present.'
    }
  ];

  const nailUnavailable = () => state.collection === 'derry';
  const nailWhere = () => 'at our Derry~Londonderry office';

  const locLabel = () =>
    state.collection === 'onsite' ? 'Your location — on-site collection'
      : state.collection === 'derry' ? 'NIVHA office — Derry~Londonderry' : 'NIVHA office — Belfast';

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
    alert: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".5" fill="currentColor"/>',
    check: '<path d="m5 13 4.5 4.5L19 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".5" fill="currentColor"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    scale: '<path d="M12 3v18M5 21h14"/><path d="M12 5 5.5 7.5 12 5l6.5 2.5"/><path d="M5.5 7.5 3 13a3 3 0 0 0 5 0L5.5 7.5zM18.5 7.5 16 13a3 3 0 0 0 5 0l-2.5-5.5z"/>',
    pin: '<path d="M12 21s-6.5-5.5-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.5 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'
  };
  const icon = (name, size = 22) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ---------------- navigation ---------------- */
  const sections = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-pay', 'step-book', 'step-done'];

  function goTo(step) {
    state.step = step;
    if (step <= 5) state.maxVisited = Math.max(state.maxVisited, step);
    sections.forEach((id, i) => {
      document.getElementById(id).hidden = (i + 1 !== step);
    });
    renderStepper();
    if (step === 3) { renderSampleStrip(); renderCatalogue(); renderNotices(); renderSummary(); }
    if (step === 4) { renderDetailsForm(); renderSummary(); }
    if (step === 5) renderFeeNote();
    if (step === 6) renderCheckout();
    if (step === 7) renderBooking(true);
    if (step === 8) renderConfirmation();
    updateMobileBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderStepper() {
    document.querySelectorAll('#stepper .step').forEach(el => {
      const s = +el.dataset.step;
      el.classList.toggle('active', s === state.step);
      el.classList.toggle('done', s < state.step && state.step <= 5);
      el.disabled = s > state.maxVisited || state.step > 5;
    });
    document.querySelector('.stepper').style.display = state.step > 5 ? 'none' : '';
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
        state.refNumber = null; // assigned by the fee note service on submission
        if (state.route !== 'private') state.privateAck = false;
        if (state.route === 'private' && state.collection === 'onsite') state.collection = null;
        renderRoutes();
        renderPrivateAdvice();
        renderLocations();
        setTimeout(() => {
          const target = state.route === 'private' && !state.privateAck
            ? document.getElementById('private-advice')
            : document.getElementById('location-block');
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }));
  }

  /* Private clients see a note on legal representation before they proceed */
  function renderPrivateAdvice() {
    const block = document.getElementById('private-advice');
    block.hidden = state.route !== 'private';
    if (block.hidden) { block.innerHTML = ''; return; }
    block.innerHTML = `
      <div class="advice-block">
        <div class="advice-head">${icon('scale', 24)}<h2>Before you proceed — a note on legal representation</h2></div>
        <p><strong>If these results may be relied on in court — for example in family proceedings — we strongly advise instructing the testing through a solicitor.</strong>
          A legal representative can agree the scope of testing with the other parties in advance, make sure the report addresses exactly what the court needs, and manage how the results are disclosed. Testing instructed that way is far less likely to be challenged or repeated.</p>
        <p>That said, many people choose to test privately first — often to confirm a negative result before seeking legal advice — and we are happy to help.
          Your results are released to you, or an authorised representative, and to no one else. If matters do go to court, be aware that the court may direct that testing is repeated under formal instruction.</p>
        <div class="advice-ack">
          <label class="check-row">
            <input type="checkbox" id="private-ack" ${state.privateAck ? 'checked' : ''}>
            <span>I have read this and would like to continue as a private individual</span>
          </label>
        </div>
      </div>`;
    block.querySelector('#private-ack').addEventListener('change', e => {
      state.privateAck = e.target.checked;
      renderLocations();
      if (state.privateAck) setTimeout(() =>
        document.getElementById('location-block').scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    });
  }

  function renderLocations() {
    const block = document.getElementById('location-block');
    block.hidden = !state.route || (state.route === 'private' && !state.privateAck);
    if (block.hidden) return;
    const grid = document.getElementById('location-grid');
    const isPrivate = state.route === 'private';
    grid.innerHTML = LOCATIONS.map(l => {
      if (isPrivate && l.id === 'onsite') return `
      <div class="route-card location-card locked">
        <span class="route-title">${l.title}</span>
        <span class="route-sub">Available to organisations only. Private appointments take place at our Belfast or Derry~Londonderry offices.</span>
        <span class="location-flag">${icon('info', 15)}<span>Solicitors and trusts can arrange on-site collection in professional environments.</span></span>
        <span class="route-cta">Organisations only</span>
      </div>`;
      return `
      <button class="route-card location-card ${state.collection === l.id ? 'selected' : ''}" data-location="${l.id}">
        <span class="route-title">${l.title}</span>
        <span class="route-sub">${l.sub}</span>
        ${l.flag ? `<span class="location-flag">${icon('info', 15)}<span>${l.flag}</span></span>` : ''}
        <span class="route-cta">${state.collection === l.id ? 'Selected' : 'Choose this location'}</span>
      </button>`;
    }).join('');
    grid.querySelectorAll('[data-location]').forEach(card =>
      card.addEventListener('click', () => {
        state.collection = card.dataset.location;
        if (nailUnavailable()) removeNailPanels();
        renderLocations();
        setTimeout(() => goTo(2), 220);
      }));
  }

  function removeNailPanels() {
    const removed = [];
    [...state.basket.keys()].forEach(code => {
      if (byCode[code].group === 'nail') { state.basket.delete(code); removed.push(code); }
    });
    if (removed.length && !state.notices.some(n => n.key === 'no-nail')) {
      state.notices.push({
        key: 'no-nail', type: 'warn',
        html: `<strong>Nail testing is not available ${nailWhere()}.</strong> We have removed ${removed.map(disp).join(', ')} from your fee note. Hair panels cover around 3 months, or choose the Belfast office or an on-site collection for a 6 to 12 month nail history.`
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
      if (nailUnavailable() && byCode[code].group === 'nail') {
        if (!state.notices.some(n => n.key === 'no-nail')) {
          state.notices.push({
            key: 'no-nail', type: 'warn',
            html: `<strong>Nail testing is not available ${nailWhere()}.</strong> We have not added the nail panel — hair panels cover around 3 months, or go back and choose the Belfast office or an on-site collection for a 6 to 12 month nail history.`
          });
        }
        return;
      }
      if (!state.basket.has(code)) state.basket.set(code, { ...getOpts(code) });
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
    COMBINED_RATES.forEach(rule => {
      const key = 'combo-' + rule.codes.join('-');
      const active = rule.codes.every(c => state.basket.has(c));
      const idx = state.notices.findIndex(n => n.key === key);
      if (active && idx === -1) {
        state.notices.push({
          key, type: 'saving',
          html: `<strong>Combined rate applied.</strong> ${rule.codes.map(disp).join(' and ')} together are ${gbp(rule.price)} + VAT — a saving of ${gbp(rule.saving)}.`
        });
      } else if (!active && idx > -1) {
        state.notices.splice(idx, 1);
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

  /* ---------------- step 3 — sample type explainer ---------------- */
  function renderSampleStrip() {
    const el = document.getElementById('sample-strip');
    const groups = ['hair', 'nail', 'urine', 'blood'];
    el.innerHTML = `
      <div class="sample-strip">
        <p class="chips-label">The four sample types at a glance</p>
        <div class="sample-grid">
          ${groups.map(g => {
            const m = GROUP_META[g];
            return `
            <div class="sample-card">
              <div class="sample-card-head">${icon(m.icon, 18)}<strong>${m.label}</strong><span class="sample-window">${m.windowShort}</span></div>
              <p>${m.typical}</p>
              <button class="sample-jump" data-jump="${g}">See ${m.label.toLowerCase()} panels</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    el.querySelectorAll('[data-jump]').forEach(b =>
      b.addEventListener('click', () => {
        const t = document.getElementById('group-' + b.dataset.jump);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
  }

  /* ---------------- step 3 — catalogue ---------------- */
  function renderCatalogue() {
    const wrap = document.getElementById('catalogue');
    const groups = ['hair', 'urine', 'blood', 'nail'];
    wrap.innerHTML = groups.map(g => {
      const meta = GROUP_META[g];
      const items = CATALOGUE.filter(p => p.group === g);
      return `
        <div class="cat-group" id="group-${g}">
          <div class="cat-group-head"><h2>${meta.label}</h2><p>${meta.note}</p></div>
          ${meta.compare ? `<div class="compare-note">${icon('info', 18)}<div>${meta.compare}</div></div>` : ''}
          <div class="cat-list">${items.map(renderPanelCard).join('')}</div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-expand]').forEach(b => b.addEventListener('click', () => {
      state.expanded.add(b.dataset.expand);
      renderCatalogue();
    }));
    wrap.querySelectorAll('[data-collapse]').forEach(b => b.addEventListener('click', () => {
      state.expanded.delete(b.dataset.collapse);
      renderCatalogue();
    }));
    wrap.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
      state.basket.set(b.dataset.add, { ...getOpts(b.dataset.add) });
      resolveConflicts(true);
      renderCatalogue(); renderNotices(); renderSummary(); updateMobileBar();
    }));
    wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      state.basket.delete(b.dataset.remove);
      state.expanded.add(b.dataset.remove); /* keep the card open after removing */
      resolveConflicts(true);
      renderCatalogue(); renderNotices(); renderSummary(); updateMobileBar();
    }));
    wrap.querySelectorAll('[data-variant]').forEach(sel => sel.addEventListener('change', () => {
      const code = sel.dataset.variant, v = +sel.value;
      state.opts.set(code, { ...getOpts(code), variant: v });
      if (state.basket.has(code)) state.basket.get(code).variant = v;
      renderCatalogue(); renderSummary(); updateMobileBar();
    }));
    wrap.querySelectorAll('[data-qty]').forEach(sel => sel.addEventListener('change', () => {
      const code = sel.dataset.qty, q = +sel.value;
      state.opts.set(code, { ...getOpts(code), qty: q });
      if (state.basket.has(code)) state.basket.get(code).qty = q;
      renderCatalogue(); renderSummary(); updateMobileBar();
    }));
    wrap.querySelectorAll('[data-ft]').forEach(t => t.addEventListener('change', () => {
      const code = t.dataset.ft;
      state.fastTrack = t.checked;
      if (t.checked && !state.basket.has(code)) {
        state.basket.set(code, { ...getOpts(code) });
        resolveConflicts(true);
      }
      updateFtNotice();
      renderCatalogue(); renderNotices(); renderSummary(); updateMobileBar();
    }));
  }

  /* Fast track is all-or-nothing across the instruction */
  function updateFtNotice() {
    const idx = state.notices.findIndex(n => n.key === 'ft-all');
    if (state.fastTrack) {
      const inelig = [...state.basket.keys()].filter(c => !byCode[c].fastTrack);
      const html = `<strong>Fast track applies to your whole instruction.</strong> Every eligible panel on your fee note is fast tracked at ${gbp(FAST_TRACK_FEE)} + VAT each — panels cannot be fast tracked individually.`
        + (inelig.length ? ` ${inelig.map(disp).join(', ')} ${inelig.length === 1 ? 'is' : 'are'} not eligible and ${inelig.length === 1 ? 'keeps' : 'keep'} the standard turnaround.` : '');
      if (idx > -1) state.notices[idx].html = html;
      else state.notices.push({ key: 'ft-all', type: 'saving', html });
    } else if (idx > -1) {
      state.notices.splice(idx, 1);
    }
  }

  function renderDrugChips(p) {
    if (!p.drugs && !p.adds) return `<p class="panel-detects">${p.detects}</p>`;
    const base = p.base
      ? `<span class="drug-chip base">${icon('check', 13)} Everything in ${disp(p.base)} — the ${byCode[p.base].name.toLowerCase().replace('alcohol — ', '')}</span>`
      : '';
    const main = (p.drugs || []).map(d => `<span class="drug-chip">${d}</span>`).join('');
    const adds = (p.adds || []).map(d => `<span class="drug-chip add">+ ${d}</span>`).join('');
    return `<p class="chips-label">This panel tests for</p><div class="drug-chips">${base}${main}${adds}</div>`;
  }

  function briefLine(p) {
    if (p.base) return `Everything in ${disp(p.base)} plus ${p.adds.length} addition${p.adds.length === 1 ? '' : 's'}`;
    const names = (p.drugs || []).map(d => d.split(' — ')[0]);
    if (names.length > 3) return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
    return names.join(', ');
  }

  function renderPanelCard(p) {
    const inBasket = state.basket.has(p.code);
    const item = state.basket.get(p.code) || getOpts(p.code);
    const unavailable = nailUnavailable() && p.group === 'nail';
    const expanded = (inBasket || state.expanded.has(p.code)) && !unavailable;

    /* collapsed row — basic info with expand / add */
    if (!expanded) {
      return `
      <article class="panel-card collapsed ${unavailable ? 'unavailable' : ''}">
        <div class="pc-row">
          <div class="pc-main">
            <div class="panel-card-id">
              <span class="code-chip">${disp(p.code)}</span>
              ${p.popular ? '<span class="popular-chip">Most requested</span>' : ''}
            </div>
            <h3>${p.name}</h3>
            <p class="pc-brief">${GROUP_META[p.group].windowShort} · ${briefLine(p)}</p>
          </div>
          <div class="pc-side">
            <span class="panel-price">${gbp(unitPrice(p, item))} <small>+ VAT</small></span>
            ${unavailable ? '' : `
            <div class="pc-actions">
              <button class="btn small ghost" data-expand="${p.code}">Details</button>
              <button class="btn small outline" data-add="${p.code}">Add</button>
            </div>`}
          </div>
        </div>
        ${unavailable ? `<p class="ft-na">Not collected at our Derry~Londonderry office — go back to step 1 and choose the Belfast office or an on-site collection if you need this panel.</p>` : ''}
      </article>`;
    }

    const ftToggle = p.fastTrack
      ? `<label class="ft-toggle">
           <input type="checkbox" data-ft="${p.code}" ${state.fastTrack ? 'checked' : ''}>
           <span>Fast track <small>whole instruction · + ${gbp(FAST_TRACK_FEE)} + VAT per panel</small></span>
         </label>`
      : '<span class="ft-na">Fast track not available for this panel</span>';
    const options = (p.variants || p.series) ? `
      <div class="panel-options">
        ${p.variants ? `
          <label class="opt-field"><span>Analysis</span>
            <select data-variant="${p.code}">
              ${p.variants.map((v, i) => `<option value="${i}" ${item.variant === i ? 'selected' : ''}>${v.label} — ${gbp(v.price)} + VAT</option>`).join('')}
            </select>
          </label>` : ''}
        ${p.series ? `
          <label class="opt-field"><span>Collections</span>
            <select data-qty="${p.code}">
              <option value="1" ${(item.qty || 1) === 1 ? 'selected' : ''}>One collection — ${gbp(p.price)} + VAT</option>
              <option value="2" ${item.qty === 2 ? 'selected' : ''}>Unannounced series of two — ${gbp(p.price * 2)} + VAT</option>
              <option value="3" ${item.qty === 3 ? 'selected' : ''}>Unannounced series of three — ${gbp(p.price * 3)} + VAT</option>
            </select>
          </label>` : ''}
      </div>` : '';
    return `
      <article class="panel-card ${inBasket ? 'in-basket' : ''}">
        <div class="panel-card-top">
          <div class="panel-card-id">
            <span class="code-chip">${disp(p.code)}</span>
            ${p.popular ? '<span class="popular-chip">Most requested</span>' : ''}
          </div>
          <span class="panel-price">${gbp(lineTotal(p, item))} <small>+ VAT</small></span>
        </div>
        <h3>${p.name}</h3>
        ${renderDrugChips(p)}
        ${options}
        <dl class="panel-facts">
          <div><dt>Covers</dt><dd>${p.window}</dd></div>
          <div><dt>Standard</dt><dd>${p.turnaround}</dd></div>
          <div><dt>Fast track</dt><dd>${p.fastTrack
            ? `About 5 working days from the lab receiving the sample — ${gbp(FAST_TRACK_FEE)} + VAT per panel, applied to the whole instruction.`
            : 'Not available for this panel.'}</dd></div>
        </dl>
        <details class="panel-help"><summary>When to choose this</summary><p>${p.help}</p></details>
        <div class="panel-card-actions">
          ${inBasket
            ? `<button class="btn small ghost" data-remove="${p.code}">Remove</button>
               ${ftToggle}
               <span class="added-flag">${icon('check', 15)} On your fee note</span>`
            : `<button class="btn small outline" data-add="${p.code}">Add to fee note</button>
               ${ftToggle}
               <button class="btn small ghost" data-collapse="${p.code}">Hide details</button>`}
        </div>
      </article>`;
  }

  /* ---------------- totals & summary ---------------- */
  function computeTotals() {
    let panels = 0, ftCount = 0, saving = 0;
    state.basket.forEach((item, code) => {
      panels += lineTotal(byCode[code], item);
      if (byCode[code].fastTrack) ftCount++;
    });
    COMBINED_RATES.forEach(rule => {
      if (rule.codes.every(c => state.basket.has(c))) saving += rule.saving;
    });
    const fastTrack = state.fastTrack ? ftCount * FAST_TRACK_FEE : 0;
    const collection = state.collection === 'derry' ? DERRY_COLLECTION_FEE : 0;
    const onsite = state.collection === 'onsite';
    const net = panels - saving + fastTrack + collection;
    const vat = Math.round(net * VAT_RATE * 100) / 100;
    return { panels, saving, fastTrack, collection, onsite, net, vat, total: net + vat };
  }

  function renderSummary() {
    const t = computeTotals();
    const rows = [...state.basket.keys()].map(code => {
      const p = byCode[code], item = state.basket.get(code);
      return `<div class="sum-row"><span>${disp(p.code)} · ${lineLabel(p, item)}</span><span>${gbp(lineTotal(p, item))}</span></div>
        ${state.fastTrack && p.fastTrack ? `<div class="sum-row sub"><span>Fast track</span><span>${gbp(FAST_TRACK_FEE)}</span></div>` : ''}`;
    }).join('');

    const empty = state.basket.size === 0;
    const html = `
      <div class="summary-card">
        <h2>Your fee note</h2>
        <p class="sum-loc">Collection: ${locLabel()}</p>
        ${empty
          ? `<p class="sum-empty">Nothing here yet. Add at least one panel to continue — if you are unsure, the standard drug panel and alcohol abstinence assessment cover most instructions.</p>`
          : `<div class="sum-rows">${rows}
              ${t.saving ? `<div class="sum-row saving"><span>Combined rate — H-DP1 + H-DP3</span><span>−${gbp(t.saving)}</span></div>` : ''}
              ${t.collection ? `<div class="sum-row"><span>Collection — Derry~Londonderry office</span><span>${gbp(t.collection)}</span></div>` : ''}
              ${t.onsite ? `<div class="sum-row"><span>On-site collection — from ${gbp(ONSITE_COLLECTION_FROM)}</span><span>On request</span></div>` : ''}
             </div>
             <div class="sum-totals">
               <div class="sum-row"><span>Subtotal</span><span>${gbp(t.net)}</span></div>
               <div class="sum-row"><span>VAT at 20%</span><span>${gbp(t.vat)}</span></div>
               <div class="sum-row grand"><span>Total</span><span>${gbp(t.total)}</span></div>
               ${t.onsite ? `<p class="sum-poa">The on-site collection fee (from ${gbp(ONSITE_COLLECTION_FROM)} + VAT) is priced on request and confirmed before the visit — it is not included in this total.</p>` : ''}
             </div>
             <p class="sum-note">${state.route === 'private'
                ? 'Payment is taken securely in advance by card. Booking opens as soon as payment clears.'
                : 'We invoice your organisation — results are released on payment of the fee note.'}</p>`}
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
    const hasDSD = state.basket.has('H-DSD') || state.basket.has('N-DSD');
    const office = state.collection === 'derry' ? 'Derry~Londonderry' : 'Belfast';
    const onsite = state.collection === 'onsite';

    form.innerHTML = `
      <div class="dev-fill-bar">
        <span>Prototype helper</span>
        <button type="button" class="btn small ghost" id="dev-fill">Fill with sample data</button>
      </div>
      ${!isPrivate ? `
      <fieldset>
        <legend>Instructing organisation</legend>
        <div class="form-field" data-field="org">
          <label for="org">${state.route === 'trust' ? 'Trust or team' : 'Practice name'}</label>
          <p class="field-hint">Type to search the public register — choose your organisation and we fill in the address, or enter it yourself below.</p>
          <div class="combo">
            <input type="text" id="org" name="org" role="combobox" aria-expanded="false" aria-autocomplete="list"
              placeholder="Search by organisation name" value="${state.details.org || ''}" required autocomplete="off">
            <div class="combo-results" id="org-results" hidden></div>
          </div>
          <p class="field-error" hidden>This is needed to raise the fee note.</p>
        </div>
        ${field('orgAddress', 'Address', { required: true, placeholder: 'Building and street' })}
        <div class="form-2col">
          ${field('orgTown', 'Town or city', { required: true })}
          ${field('orgPostcode', 'Postcode', { required: true })}
        </div>
        ${field('caseref', 'Your case or purchase order reference', { hint: 'Appears on the fee note so your accounts team can match it.' })}
        ${state.route === 'solicitor' ? field('legalAidRef', 'Legal Aid reference', { hint: 'If this fee note will be submitted to the Legal Aid Authority, the reference prints on the fee note so it can go straight to the court or admin office.' }) : ''}
        ${state.route === 'trust' ? `
        ${field('costCentre', 'Cost centre', { required: true, hint: 'So your finance team can allocate the fee.' })}
        <div class="form-2col">
          ${field('approverName', 'Approver name', { required: true })}
          ${field('authoriserName', 'Authoriser name', { required: true })}
        </div>` : ''}
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
        ${hasDSD ? field('dsdDrug', 'Which single drug should we test for?', { required: true, hint: 'You have chosen a single specified drug panel.' }) : ''}
      </fieldset>

      <fieldset>
        <legend>Booking the appointment</legend>
        <div class="booking-callout">
          ${icon('calendar', 20)}
          <div>
            ${onsite ? `
            <p><strong>You request the visit — we confirm availability.</strong></p>
            <p>${isPrivate
              ? `As soon as your payment clears, you tell us your preferred date and time of day, and our team confirms availability within one working day — along with the collection room and the final collection fee.`
              : `As soon as your fee note is submitted, you tell us where to come and your preferred date and time of day. We confirm availability within one working day, along with the collection room and the final collection fee (from ${gbp(ONSITE_COLLECTION_FROM)} + VAT) — once confirmed, a purchase order number confirms the collection. The report is released on receipt of payment.`} A private room must be made available and a witness may be required to be present.</p>`
            : `
            <p><strong>You choose the time — no phone calls needed.</strong></p>
            <p>${isPrivate
              ? `As soon as your payment clears, our scheduling calendar opens right here — choose an appointment at our ${office} office at a time that suits you. We also email the link, so you can book later if you prefer.`
              : `As soon as your fee note is submitted, our scheduling calendar opens right here — choose an appointment at our ${office} office at a time that suits the donor. We also email the link, so it can be booked later.`} Cancellation is free up to 24 hours before.</p>`}
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

    form.querySelector('#dev-fill').addEventListener('click', () => {
      const sample = {
        contactName: 'Test Contact',
        contactEmail: 'test@example.com',
        contactPhone: '07700 900123',
        donorName: 'Test Donor',
        donorDob: '1990-01-01'
      };
      if (!isPrivate) {
        sample.org = state.route === 'trust' ? 'Example HSC Trust — Family Support Team' : 'Example & Partners Solicitors';
        sample.orgAddress = '1 Example Street';
        sample.orgTown = 'Belfast';
        sample.orgPostcode = 'BT1 1AA';
        sample.caseref = 'TEST-001';
        if (state.route === 'solicitor') sample.legalAidRef = 'LA-2026-00123';
        if (state.route === 'trust') {
          sample.costCentre = 'CC-4021';
          sample.approverName = 'Test Approver';
          sample.authoriserName = 'Test Authoriser';
        }
      }
      if (hasDSD) sample.dsdDrug = 'Codeine';
      if (isPrivate && state.collection === 'onsite') {
        sample.onsiteVenueName = 'Example Workplace Ltd';
        sample.onsiteVenueAddress = '10 Example Road';
        sample.onsiteVenueTown = 'Belfast';
        sample.onsiteVenuePostcode = 'BT2 2BB';
        sample.onsiteVenueNotes = 'Ask for reception';
      }
      Object.assign(state.details, sample);
      renderDetailsForm();
    });

    const orgInput = form.querySelector('#org');
    if (orgInput) setupOrgSearch(form, orgInput);

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

  /* Organisation lookup — searches the public register (simulated),
     never a list of NIVHA clients. Selecting a result fills the address. */
  function setupOrgSearch(form, input) {
    const box = form.querySelector('#org-results');
    let timer;

    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); };

    const open = matches => {
      box.innerHTML = matches.map((m, i) => `
          <button type="button" class="combo-item" data-pick="${i}">
            <strong>${m.name}</strong><span>${m.address}, ${m.town}, ${m.postcode}</span>
          </button>`).join('')
        + `<p class="combo-note">${matches.length ? 'Not the right one?' : 'No match in the register.'} Just keep the name as typed and enter the address below.</p>`;
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      box.querySelectorAll('[data-pick]').forEach(btn =>
        btn.addEventListener('click', () => {
          const m = matches[+btn.dataset.pick];
          state.details.org = m.name;
          state.details.orgAddress = m.address;
          state.details.orgTown = m.town;
          state.details.orgPostcode = m.postcode;
          input.value = m.name;
          ['orgAddress', 'orgTown', 'orgPostcode'].forEach(id => {
            const el = form.querySelector('#' + id);
            if (el) {
              el.value = state.details[id];
              const f = el.closest('.form-field');
              if (f) { f.classList.remove('invalid'); const e = f.querySelector('.field-error'); if (e) e.hidden = true; }
            }
          });
          close();
        }));
    };

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) { close(); return; }
        const matches = REGISTER.filter(m =>
          m.name.toLowerCase().includes(q) || m.town.toLowerCase().includes(q) || m.postcode.toLowerCase().includes(q)
        ).slice(0, 6);
        open(matches);
      }, 120);
    });

    input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.addEventListener('click', e => {
      if (!box.hidden && !e.target.closest('.combo') && !e.target.closest('#org-results')) close();
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

    document.getElementById('submit-btn').textContent = isPrivate ? 'Submit and continue to payment' : 'Submit fee note';

    const lines = [...state.basket.keys()].map(code => {
      const p = byCode[code], item = state.basket.get(code);
      return `
        <tr>
          <td><span class="code-chip small">${disp(p.code)}</span></td>
          <td>${lineLabel(p, item)} <span class="doc-detects">${p.detects}</span></td>
          <td class="num">${gbp(lineTotal(p, item))}</td>
        </tr>
        ${state.fastTrack && p.fastTrack ? `
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
            <p><span>Fee note</span><strong>${state.refNumber || 'Assigned on submission'}</strong></p>
            <p><span>Date</span><strong>${today}</strong></p>
          </div>
        </div>

        <div class="doc-parties">
          <div>
            <p class="doc-label">Prepared for</p>
            <p><strong>${isPrivate ? (d.contactName || '—') : (d.org || '—')}</strong></p>
            ${!isPrivate ? `<p>${[d.orgAddress, d.orgTown, d.orgPostcode].filter(Boolean).join(', ') || '—'}</p>` : ''}
            ${!isPrivate && d.caseref ? `<p>Ref: ${d.caseref}</p>` : ''}
            ${state.route === 'solicitor' && d.legalAidRef ? `<p>Legal Aid reference: ${d.legalAidRef}</p>` : ''}
            ${state.route === 'trust' && d.costCentre ? `<p>Cost centre: ${d.costCentre}</p>` : ''}
            ${state.route === 'trust' && (d.approverName || d.authoriserName) ? `<p>${[d.approverName ? 'Approver: ' + d.approverName : '', d.authoriserName ? 'Authoriser: ' + d.authoriserName : ''].filter(Boolean).join(' · ')}</p>` : ''}
            ${!isPrivate ? `<p>Attn: ${d.contactName || '—'}</p>` : ''}
          </div>
          <div>
            <p class="doc-label">Donor</p>
            <p><strong>${donorName || '—'}</strong></p>
            ${d.donorDob && !(isPrivate && d.selfDonor) ? `<p>Date of birth: ${new Date(d.donorDob).toLocaleDateString('en-GB')}</p>` : ''}
            <p>Collection: ${locLabel()}</p>
          </div>
        </div>

        <table class="doc-table">
          <thead><tr><th>Code</th><th>Analysis</th><th class="num">Fee</th></tr></thead>
          <tbody>
            ${lines}
            ${t.saving ? `<tr><td></td><td>Combined rate — H-DP1 + H-DP3</td><td class="num">−${gbp(t.saving)}</td></tr>` : ''}
            ${t.collection ? `<tr><td></td><td>Collection — NIVHA office, Derry~Londonderry</td><td class="num">${gbp(t.collection)}</td></tr>` : ''}
            ${t.onsite ? `<tr><td></td><td>On-site collection — at your premises, priced on request and confirmed before the visit (not included in the totals below)</td><td class="num">from ${gbp(ONSITE_COLLECTION_FROM)}</td></tr>` : ''}
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
              ? 'Payment is taken securely in advance by card. Results are released to you, or an authorised representative, on completion of analysis.'
              : 'Invoiced to the instructing organisation. Analysis proceeds on booking; results are released on payment of the fee note.'}${state.route === 'solicitor' ? ' This fee note can be submitted to the Legal Aid Authority for approval.' : ''}</p>
          </div>
          <div>
            <p class="doc-label">Appointments</p>
            <p>${state.collection === 'onsite'
              ? `On-site visits are arranged as a request — you tell us your preferred date and time and we confirm availability.${isPrivate ? '' : ' Once availability and the collection fee are confirmed, a purchase order number confirms the collection; the report is released on receipt of payment.'} Collections take place in professional environments only, where a private collection room is made available — we do not collect in private homes. A witness may be required to be present. If the venue or collection room is not as declared on arrival, the visit may be paused or cancelled and the collection fee remains payable. The donor must bring photo ID.`
              : 'Booked online — straight after submission or via the emailed scheduling link. Please do not send the donor to attend without a booking. The donor must bring photo ID. Cancellation is free up to 24 hours before; missed appointments incur a £50 + VAT fee.'}</p>
          </div>
          <div>
            <p class="doc-label">Reports</p>
            <p>A written report with expert interpretation is issued where applicable. Interim reports are not normally issued without part-payment.</p>
            ${isPrivate ? '' : `<p class="doc-small">Court and reporting rates, where required, are itemised on page 2 of the issued fee note. Where the instruction is legally aided, the applicable legal aid authority's rates are observed.</p>`}
          </div>
        </div>
      </div>`;

    renderDeclaration();
  }

  /* ---------------- declaration & acceptance (route-aware) ---------------- */
  function renderDeclaration() {
    const box = document.getElementById('declaration-box');
    const isPrivate = state.route === 'private';
    const d = state.details;
    if (!state.acceptance) state.acceptance = { declaration: false, consent: false };
    const a = state.acceptance;

    if (isPrivate) {
      box.innerHTML = `
        <label class="check-row">
          <input type="checkbox" id="declaration-check" ${a.declaration ? 'checked' : ''}>
          <span>I confirm the details above are correct and that I am authorised to instruct this testing.</span>
        </label>
        <label class="check-row">
          <input type="checkbox" id="consent-check" ${a.consent ? 'checked' : ''}>
          <span>I consent to NIVHA processing the personal information in this fee note — including sensitive test information — to provide the testing service, as described in the <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>.</span>
        </label>
        <p class="data-note">You can withdraw your consent at any time before analysis begins by contacting info@nivha.net — collection and cancellation fees already incurred remain payable. ${d.selfDonor ? '' : 'The person being tested confirms their own agreement at the collection appointment. '}Your consent is recorded against this fee note with the date and time.</p>`;
    } else {
      const org = d.org ? d.org : 'my organisation';
      box.innerHTML = `
        <label class="check-row">
          <input type="checkbox" id="declaration-check" ${a.declaration ? 'checked' : ''}>
          <span>I confirm the details above are correct, that I am authorised to instruct this testing on behalf of ${org}, and that I accept NIVHA's <a href="/data-sharing-terms" target="_blank" rel="noopener">Data Sharing Terms</a> for medico-legal instructions.</span>
        </label>
        <p class="data-note">The Data Sharing Terms set out how NIVHA and your organisation handle the information in this fee note as independent controllers — including the specialist providers we use, security, retention and breach notification. Your acceptance is recorded against this fee note with the version, date and time. A countersigned copy is available on request. Our <a href="/privacy" target="_blank" rel="noopener">privacy notice</a> explains how we handle personal information, including donor details.</p>`;
    }

    const checks = [...box.querySelectorAll('input[type="checkbox"]')];
    const sync = () => {
      a.declaration = !!document.getElementById('declaration-check')?.checked;
      a.consent = isPrivate ? !!document.getElementById('consent-check')?.checked : false;
      document.getElementById('submit-btn').disabled = !checks.every(c => c.checked);
    };
    checks.forEach(c => c.addEventListener('change', sync));
    sync();
  }

  function buildFeeNotePayload() {
    const t = computeTotals();
    const d = state.details;
    const lines = [...state.basket.keys()].map(code => {
      const p = byCode[code], item = state.basket.get(code);
      return { code: disp(p.code), label: lineLabel(p, item), amount: lineTotal(p, item) };
    });
    const summary = lines.map(l => `${l.code} · ${l.label} — £${l.amount.toFixed(2)}`);
    if (t.saving) summary.push(`Combined rate — H-DP1 + H-DP3 — −£${t.saving.toFixed(2)}`);
    if (t.fastTrack) summary.push(`Fast track — £${t.fastTrack.toFixed(2)}`);
    if (t.collection) summary.push(`Collection — Derry~Londonderry office — £${t.collection.toFixed(2)}`);
    if (t.onsite) summary.push('On-site collection — priced on request');
    if (t.saving) lines.push({ code: '', label: 'Combined rate — H-DP1 + H-DP3', amount: -t.saving });
    if (t.fastTrack) lines.push({ code: '', label: 'Fast track', amount: t.fastTrack });
    if (t.collection) lines.push({ code: '', label: 'Collection — Derry~Londonderry office', amount: t.collection });
    if (t.onsite) lines.push({ code: '', label: 'On-site collection — priced on request', amount: 0 });
    let gateEmail = '';
    try { gateEmail = localStorage.getItem(GATE_KEY) || ''; } catch (e) {}
    return {
      route: state.route,
      location: state.collection,
      fastTrack: !!state.fastTrack,
      basket: rawBasket(),
      details: {
        org: d.org || '', orgAddress: d.orgAddress || '', orgTown: d.orgTown || '', orgPostcode: d.orgPostcode || '',
        caseref: d.caseref || '', costCentre: d.costCentre || '', legalAidRef: d.legalAidRef || '',
        approverName: d.approverName || '', authoriserName: d.authoriserName || '',
        contactName: d.contactName || '', contactEmail: d.contactEmail || '', contactPhone: d.contactPhone || '',
        donorName: d.donorName || '', donorDob: d.donorDob || '', dsdDrug: d.dsdDrug || ''
      },
      panels: lines,
      panelSummary: summary.join('\n') + `\n—\nSubtotal £${t.net.toFixed(2)} · VAT £${t.vat.toFixed(2)} · Total £${t.total.toFixed(2)}`
        + (d.dsdDrug ? `\nSingle specified drug: ${d.dsdDrug}` : ''),
      totals: { net: t.net, vat: t.vat, total: t.total },
      needsPriceReview: !!d.dsdDrug,
      leadEmail: gateEmail,
      acceptance: {
        declaration: true,
        dataSharingTermsVersion: state.route !== 'private' ? DST_VERSION : null,
        explicitConsent: state.route === 'private',
        acceptedAt: new Date().toISOString()
      }
    };
  }

  document.getElementById('submit-btn').addEventListener('click', async () => {
    const btn = document.getElementById('submit-btn');
    if (btn.disabled) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Submitting';
    saveClientRecord();
    try {
      const res = await API.post('/api/fee-notes', buildFeeNotePayload());
      state.refNumber = res.reference;
      state.recordId = res.recordId || null;
    } catch (e) {
      /* Service unreachable — continue the walkthrough with a placeholder reference */
      state.refNumber = (state.route === 'private' ? 'PCN-9' : 'CCN-9') + String(Date.now()).slice(-3);
      state.recordId = null;
    }
    btn.disabled = false;
    btn.textContent = original;
    goTo(state.route === 'private' ? 6 : 7);
  });

  /* ---------------- step 6 — payment (private) ---------------- */
  const PAY_STATE_KEY = 'nivha-pay-state';

  function rawBasket() {
    return [...state.basket.entries()].map(([code, o]) => ({ code, variant: (o && o.variant) || 0, qty: (o && o.qty) || 1 }));
  }

  /* The wizard state lives in memory, so it is parked in sessionStorage for
     the round trip to the payment provider and restored on return. */
  function persistForPayment() {
    try {
      sessionStorage.setItem(PAY_STATE_KEY, JSON.stringify({
        route: state.route,
        basket: [...state.basket.entries()],
        fastTrack: !!state.fastTrack,
        collection: state.collection,
        details: state.details,
        refNumber: state.refNumber,
        recordId: state.recordId || null
      }));
    } catch (e) {}
  }

  function restoreFromPayment() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(PAY_STATE_KEY) || 'null'); } catch (e) {}
    if (!saved || saved.route !== 'private' || !saved.refNumber) return false;
    state.route = saved.route;
    state.privateAck = true;
    state.basket = new Map(saved.basket || []);
    state.fastTrack = !!saved.fastTrack;
    state.collection = saved.collection;
    state.details = saved.details || {};
    state.refNumber = saved.refNumber;
    state.recordId = saved.recordId || null;
    state.maxVisited = 5;
    document.getElementById('gate').hidden = true;
    document.querySelector('.stepper').hidden = false;
    return true;
  }

  function renderCheckout() {
    const t = computeTotals();
    const d = state.details;
    const notice = state.payNotice || null;
    state.payNotice = null;
    const rows = [...state.basket.keys()].map(code => {
      const p = byCode[code], item = state.basket.get(code);
      return `<div class="sum-row"><span>${disp(p.code)} · ${lineLabel(p, item)}</span><span>${gbp(lineTotal(p, item))}</span></div>
        ${state.fastTrack && p.fastTrack ? `<div class="sum-row sub"><span>Fast track</span><span>${gbp(FAST_TRACK_FEE)}</span></div>` : ''}`;
    }).join('');

    document.getElementById('checkout').innerHTML = `
      <div class="success-banner">
        ${icon('check', 20)}
        <div><strong>Fee note ${state.refNumber} submitted</strong>
        <span>One step left — private instructions are paid in advance. Booking opens as soon as payment is confirmed.</span></div>
      </div>
      ${notice ? `<div class="pay-notice">${icon('info', 18)}<span>${notice}</span></div>` : ''}
      <div class="panel-head">
        <p class="marker">Payment</p>
        <h1>Secure payment</h1>
        <p class="lede">Pay by card to confirm your instruction. Your appointment calendar opens straight after.</p>
      </div>
      <div class="pay-grid">
        <div class="pay-summary">
          <h2>Paying NIVHA Laboratory Services Ltd</h2>
          <p class="sum-loc">Fee note ${state.refNumber} · Collection: ${locLabel()}</p>
          <div class="sum-rows">${rows}
            ${t.saving ? `<div class="sum-row saving"><span>Combined rate — H-DP1 + H-DP3</span><span>−${gbp(t.saving)}</span></div>` : ''}
            ${t.collection ? `<div class="sum-row"><span>Collection — Derry~Londonderry office</span><span>${gbp(t.collection)}</span></div>` : ''}
            ${t.onsite ? `<div class="sum-row"><span>On-site collection — from ${gbp(ONSITE_COLLECTION_FROM)}</span><span>On request</span></div>` : ''}
          </div>
          <div class="sum-totals">
            <div class="sum-row"><span>Subtotal</span><span>${gbp(t.net)}</span></div>
            <div class="sum-row"><span>VAT at 20%</span><span>${gbp(t.vat)}</span></div>
            <div class="sum-row grand"><span>Total to pay today</span><span>${gbp(t.total)}</span></div>
            ${t.onsite ? `<p class="sum-poa">The on-site collection fee (from ${gbp(ONSITE_COLLECTION_FROM)} + VAT) is priced on request — we confirm it with you and invoice it separately before the visit.</p>` : ''}
          </div>
        </div>
        <div class="pay-card" id="pay-card">
          <div class="pay-brand">${icon('lock', 18)}<span class="pay-secure">Secure card payment · handled by our payment provider</span></div>
          <p class="pay-explain">You are taken to Stripe's secure checkout to pay by card. NIVHA never sees or stores your card details.</p>
          <button type="button" class="btn primary full" id="pay-btn">Pay ${gbp(t.total)} securely</button>
          <p class="pay-error" id="pay-error" hidden></p>
          <p class="pay-note">${icon('info', 14)}<span>Your receipt is emailed to you automatically. Booking opens as soon as payment is confirmed — and if you close the page, we email you a secure link so you can book later.</span></p>
        </div>
      </div>
      <div class="panel-actions">
        <button class="btn ghost" id="pay-back">Back to review</button>
      </div>`;

    document.getElementById('pay-back').addEventListener('click', () => goTo(5));
    document.getElementById('pay-btn').addEventListener('click', startPayment);

    async function startPayment() {
      const btn = document.getElementById('pay-btn');
      const errEl = document.getElementById('pay-error');
      if (btn.disabled) return;
      btn.disabled = true;
      errEl.hidden = true;
      btn.innerHTML = '<span class="spinner"></span> Opening secure checkout';
      try {
        const resp = await API.post('/api/checkout', {
          recordId: state.recordId || undefined,
          reference: state.refNumber,
          basket: rawBasket(),
          fastTrack: !!state.fastTrack,
          location: state.collection,
          email: d.contactEmail || ''
        });
        if (resp.url) { persistForPayment(); location.assign(resp.url); return; }
        if (resp.alreadyPaid) { state.payment = { receipt: 'confirmed', amount: t.total }; goTo(7); return; }
        if (resp.simulated) { renderSimulatedCard(); return; }
        throw new Error('No checkout URL');
      } catch (e) {
        btn.disabled = false;
        btn.textContent = `Pay ${gbp(t.total)} securely`;
        errEl.textContent = 'We could not open the secure checkout just now. Please try again in a moment — nothing has been taken.';
        errEl.hidden = false;
      }
    }

    /* Fallback while no payment key is configured — keeps the walkthrough usable. */
    function renderSimulatedCard() {
      document.getElementById('pay-card').outerHTML = `
        <form class="pay-card" id="pay-form" novalidate>
          <div class="pay-brand">${icon('lock', 18)}<span class="pay-secure">Secure card payment · encrypted end to end</span></div>
          <div class="form-field"><label for="pay-email">Email</label>
            <input type="email" id="pay-email" value="${d.contactEmail || ''}" autocomplete="off"></div>
          <div class="form-field"><label for="pay-cardno">Card number</label>
            <input type="text" id="pay-cardno" inputmode="numeric" value="4242 4242 4242 4242" autocomplete="off"></div>
          <div class="form-2col">
            <div class="form-field"><label for="pay-exp">Expiry</label>
              <input type="text" id="pay-exp" value="12/28" autocomplete="off"></div>
            <div class="form-field"><label for="pay-cvc">CVC</label>
              <input type="text" id="pay-cvc" inputmode="numeric" value="123" autocomplete="off"></div>
          </div>
          <div class="form-field"><label for="pay-name">Name on card</label>
            <input type="text" id="pay-name" value="${d.contactName || ''}" autocomplete="off"></div>
          <button type="submit" class="btn primary full" id="pay-btn">Pay ${gbp(t.total)} securely</button>
          <p class="pay-note">${icon('info', 14)}<span>This is a simulation — no payment is taken and card details are pre-filled with test values. Card payments are handled by our payment provider; NIVHA never stores card details.</span></p>
        </form>`;
      document.getElementById('pay-form').addEventListener('submit', e => {
        e.preventDefault();
        const btn = document.getElementById('pay-btn');
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Processing payment';
        setTimeout(() => {
          state.payment = { receipt: 'NV-8362', amount: t.total };
          if (state.recordId) API.patch('/api/fee-notes/' + state.recordId, { event: 'paid', amount: t.total }).catch(() => {});
          goTo(7);
        }, 1400);
      });
    }
  }

  /* Return from the payment provider: /?paid=1&sid=... or /?canceled=1 */
  async function initPaymentReturn() {
    const params = new URLSearchParams(location.search);
    const paidSid = params.get('paid') === '1' ? params.get('sid') : null;
    const canceled = params.get('canceled') === '1';
    if (!paidSid && !canceled) return false;
    history.replaceState(null, '', location.pathname);
    if (!restoreFromPayment()) return false;
    if (canceled) {
      state.payNotice = 'Payment was cancelled — nothing has been taken. You can pay when you are ready.';
      goTo(6);
      return true;
    }
    sections.forEach(id => { document.getElementById(id).hidden = id !== 'step-pay'; });
    document.getElementById('checkout').innerHTML = `
      <div class="panel-head">
        <p class="marker">Payment</p>
        <h1>Confirming your payment</h1>
        <p class="lede">One moment — we are confirming your payment with our payment provider.</p>
      </div>`;
    try {
      const resp = await API.get('/api/checkout/confirm?session_id=' + encodeURIComponent(paidSid));
      if (resp.paid) {
        state.payment = { receipt: resp.receipt || state.refNumber, amount: resp.amount || computeTotals().total };
        goTo(7);
        return true;
      }
      state.payNotice = 'Your payment has not been confirmed yet — this can take a moment. Try again shortly, or contact info@nivha.net. You are never charged twice.';
    } catch (e) {
      state.payNotice = 'We could not confirm the payment just now. If you completed payment, we email you a secure link to book — or contact info@nivha.net.';
    }
    goTo(6);
    return true;
  }

  /* ---------------- step 7 — simulated booking (embedded scheduling calendar) ---------------- */
  /* Appointment types mirror the live NIVHA booking calendar */
  function bookingTypeFromBasket() {
    const gs = new Set([...state.basket.keys()].map(c => byCode[c].group));
    let label;
    if (gs.has('hair') && gs.has('urine')) label = 'Dual collection — hair and urine';
    else if (gs.has('nail') && gs.has('urine')) label = 'Dual collection — nail and urine';
    else if (gs.has('hair')) label = 'Hair collection';
    else if (gs.has('nail')) label = 'Nail collection';
    else if (gs.has('urine')) label = 'Urine collection';
    else label = 'Blood collection';
    const notes = [];
    if (gs.has('nail') && gs.has('hair')) notes.push('Nail samples are collected at the same appointment.');
    if (gs.has('nail')) notes.push('Nail polish and false nails must be removed before the appointment.');
    if (gs.has('blood') && label !== 'Blood collection') notes.push('Blood samples (PEth, LFT or CDT) are taken at the same visit by our clinician.');
    return { label, notes };
  }

  const SLOT_TIMES = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];
  const hashStr = s => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  function bookingWindow() {
    const today = startOfDay(new Date());
    const min = new Date(today);
    if (state.route === 'private') {
      let added = 0;
      while (added < 5) {
        min.setDate(min.getDate() + 1);
        const dw = min.getDay();
        if (dw !== 0 && dw !== 6) added++;
      }
    } else {
      min.setDate(min.getDate() + 2);
    }
    const max = new Date(today); max.setDate(max.getDate() + 35);
    return { min, max };
  }

  function slotsFor(d) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return [];
    const { min, max } = bookingWindow();
    if (d < min || d > max) return [];
    const key = dayKey(d);
    const times = SLOT_TIMES.filter(t => hashStr(key + t) % 3 !== 0);
    return times;
  }

  const bk = { view: 0, date: null, time: null, live: undefined, availDates: null, timesCache: {}, error: null };

  function bookingMonths() {
    const from = startOfDay(new Date());
    const { max } = bookingWindow();
    const months = [{ y: from.getFullYear(), m: from.getMonth() }];
    if (max.getFullYear() !== from.getFullYear() || max.getMonth() !== from.getMonth()) {
      months.push({ y: max.getFullYear(), m: max.getMonth() });
    }
    return months;
  }

  function renderBooking(reset) {
    if (reset) { bk.view = 0; bk.date = null; bk.time = null; }
    const isPrivate = state.route === 'private';
    const type = bookingTypeFromBasket();
    const d = state.details;
    const donorName = (isPrivate && d.selfDonor) ? d.contactName : d.donorName;
    if (state.collection === 'onsite') { renderOnsiteArrange(isPrivate, type, d, donorName); return; }
    if (state.collection === 'derry') { renderDerryRequest(isPrivate, type, d, donorName); return; }

    /* Belfast — check once whether live Acuity availability is configured */
    if (bk.live === undefined) {
      bk.live = 'checking';
      const mos = bookingMonths().map(({ y: y2, m: m2 }) => `${y2}-${String(m2 + 1).padStart(2, '0')}`);
      Promise.all(mos.map(mo => API.get('/api/booking/dates?month=' + mo)))
        .then(rs => {
          if (rs.every(r => Array.isArray(r.dates))) { bk.live = true; bk.availDates = new Set(rs.flatMap(r => r.dates)); }
          else bk.live = false;
          renderBooking(false);
        })
        .catch(() => { bk.live = false; renderBooking(false); });
    }
    const months = bookingMonths();
    const { y, m } = months[Math.min(bk.view, months.length - 1)];
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    const dayAvailable = date => {
      if (bk.live === 'checking') return false;
      if (bk.live === true) {
        /* Live mode trusts Acuity — its own scheduling limits decide the
           earliest bookable slot. We only cap how far ahead we show. */
        const { max } = bookingWindow();
        if (date < startOfDay(new Date()) || date > max) return false;
        return bk.availDates.has(dayKey(date));
      }
      return slotsFor(date).length > 0;
    };
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(y, m, day);
      const key = dayKey(date);
      const avail = dayAvailable(date);
      cells += `<button class="bk-day ${avail ? 'avail' : ''} ${bk.date === key ? 'selected' : ''}"
        ${avail ? `data-day="${key}"` : 'disabled'}>${day}</button>`;
    }

    const selDate = bk.date ? new Date(bk.date + 'T00:00:00') : null;
    let slots = [];
    let slotsLoading = false;
    if (selDate) {
      if (bk.live === true) {
        const cached = bk.timesCache[bk.date];
        if (Array.isArray(cached)) slots = cached.map(t2 => t2.label);
        else {
          slotsLoading = true;
          if (cached !== 'loading') {
            bk.timesCache[bk.date] = 'loading';
            API.get('/api/booking/times?date=' + bk.date)
              .then(r => { bk.timesCache[bk.date] = Array.isArray(r.times) ? r.times : []; renderBooking(false); })
              .catch(() => { bk.timesCache[bk.date] = []; renderBooking(false); });
          }
        }
      } else {
        slots = slotsFor(selDate);
      }
    }
    const bkError = bk.error; bk.error = null;

    document.getElementById('booking').innerHTML = `
      <div class="success-banner">
        ${icon('check', 20)}
        <div>
          <strong>${isPrivate && state.payment
            ? `Payment received — ${gbp(state.payment.amount)} · receipt ${state.payment.receipt}`
            : `Fee note ${state.refNumber} submitted`}</strong>
          <span>${isPrivate && state.payment
            ? `Fee note ${state.refNumber} is confirmed. A VAT receipt is on its way to ${d.contactEmail || 'your inbox'}.`
            : `A PDF copy is on its way to ${d.contactEmail || 'your inbox'} — now choose the appointment.`}</span>
        </div>
      </div>
      <div class="panel-head">
        <p class="marker">Booking</p>
        <h1>Book the collection appointment</h1>
        <p class="lede">Choose a time that suits ${isPrivate ? 'you' : 'the donor'}. The appointment takes about 30 minutes.</p>
      </div>
      <div class="bk-shell">
        <div class="bk-meta">
          <p class="doc-label">Appointment</p>
          <p class="bk-type">${type.label}</p>
          <p class="bk-meta-line">${icon('clock', 16)}<span>30 minutes</span></p>
          <p class="bk-meta-line">${icon('pin', 16)}<span>${locLabel()}</span></p>
          ${donorName ? `<p class="bk-meta-line">${icon('user', 16)}<span>Donor: ${donorName} — photo ID required</span></p>` : `<p class="bk-meta-line">${icon('user', 16)}<span>The donor brings photo ID</span></p>`}
          ${type.notes.map(n => `<p class="bk-note">${n}</p>`).join('')}

        </div>
        <div class="bk-cal-card">
          <div class="bk-cal-head">
            <strong>${monthLabel}</strong>
            <div class="bk-nav">
              <button id="bk-prev" aria-label="Previous month" ${bk.view === 0 ? 'disabled' : ''}>‹</button>
              <button id="bk-next" aria-label="Next month" ${bk.view >= months.length - 1 ? 'disabled' : ''}>›</button>
            </div>
          </div>
          <div class="bk-grid">
            ${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d2 => `<span class="bk-dow">${d2}</span>`).join('')}
            ${cells}
          </div>
          <div class="bk-slots">
            ${bk.live === 'checking' ? `<p class="bk-empty">Loading availability…</p>`
            : bk.date ? `
              <p class="bk-slots-label">Available times — ${selDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              ${slotsLoading ? `<p class="bk-empty">Loading times…</p>` : slots.length ? `
              <div class="bk-slot-grid">
                ${slots.map(t2 => `<button class="bk-slot ${bk.time === t2 ? 'selected' : ''}" data-slot="${t2}">${t2}</button>`).join('')}
              </div>` : `<p class="bk-empty">No times left on this day — choose another highlighted day.</p>`}`
            : `<p class="bk-empty">Select a highlighted day to see available times.</p>`}
          </div>
          ${bkError ? `<p class="req-error">${bkError}</p>` : ''}
          <div class="bk-actions">
            <button class="btn primary" id="bk-confirm" ${bk.date && bk.time ? '' : 'disabled'}>Confirm appointment</button>
            <button class="btn ghost" id="bk-skip">Book later using the emailed link</button>
          </div>
          <p class="bk-caption">${bk.live === true ? 'Availability is live from our Belfast booking calendar.' : 'In the live service this is our online booking calendar, embedded here — this prototype simulates it.'}</p>
        </div>
      </div>`;

    const wrap = document.getElementById('booking');
    wrap.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
      bk.date = b.dataset.day; bk.time = null; renderBooking(false);
    }));
    wrap.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => {
      bk.time = b.dataset.slot; renderBooking(false);
    }));
    const prev = wrap.querySelector('#bk-prev'), next = wrap.querySelector('#bk-next');
    if (prev) prev.addEventListener('click', () => { if (bk.view > 0) { bk.view--; renderBooking(false); } });
    if (next) next.addEventListener('click', () => { if (bk.view < months.length - 1) { bk.view++; renderBooking(false); } });
    wrap.querySelector('#bk-confirm').addEventListener('click', async () => {
      if (!bk.date || !bk.time) return;
      const btn = wrap.querySelector('#bk-confirm');
      const dd = new Date(bk.date + 'T00:00:00');
      const cached = bk.live === true ? bk.timesCache[bk.date] : null;
      const iso = Array.isArray(cached) ? (cached.find(t2 => t2.label === bk.time) || {}).iso : null;
      const datetime = iso || (bk.date + 'T' + bk.time + ':00');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Confirming';
      try {
        await API.post('/api/booking/confirm', { recordId: state.recordId, datetime, label: type.label });
      } catch (e) {
        if (bk.live === true) {
          /* Live calendar — the slot may have just gone. Refresh and let them re-pick. */
          bk.error = e.status === 409
            ? 'That time has just been taken — choose another.'
            : 'We could not confirm the appointment just now — please try again.';
          bk.timesCache[bk.date] = undefined;
          bk.time = null;
          renderBooking(false);
          return;
        }
        /* Simulated mode — the walkthrough continues regardless. */
      }
      state.booking = {
        typeLabel: type.label,
        dateLabel: dd.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
        time: bk.time,
        location: locLabel()
      };
      state.bookingSkipped = false;
      goTo(8);
    });
    wrap.querySelector('#bk-skip').addEventListener('click', () => {
      state.booking = null;
      state.bookingSkipped = true;
      goTo(8);
    });
  }

  /* ---------------- step 7 (Derry~Londonderry) — appointment by request ---------------- */
  function derryMinDate() {
    const d2 = new Date(); d2.setHours(0, 0, 0, 0);
    let added = 0;
    while (added < 5) {
      d2.setDate(d2.getDate() + 1);
      const w = d2.getDay();
      if (w !== 0 && w !== 6) added++;
    }
    return d2;
  }

  function renderDerryRequest(isPrivate, type, d, donorName) {
    const req = { date: '', window: 'Morning' };
    const min = derryMinDate();
    const max = new Date(); max.setHours(0, 0, 0, 0); max.setDate(max.getDate() + 35);
    const minLabel = min.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    document.getElementById('booking').innerHTML = `
      <div class="success-banner">
        ${icon('check', 20)}
        <div>
          <strong>${isPrivate && state.payment
            ? `Payment received — ${gbp(state.payment.amount)} · receipt ${state.payment.receipt}`
            : `Fee note ${state.refNumber} submitted`}</strong>
          <span>${isPrivate && state.payment
            ? `Fee note ${state.refNumber} is confirmed. A VAT receipt is on its way to ${d.contactEmail || 'your inbox'}.`
            : `A PDF copy is on its way to ${d.contactEmail || 'your inbox'} — now request the appointment.`}</span>
        </div>
      </div>
      <div class="panel-head">
        <p class="marker">Booking</p>
        <h1>Request your appointment</h1>
        <p class="lede">Appointments at our Derry~Londonderry office are arranged by request — tell us what suits and we confirm by email within one working day.</p>
      </div>
      <div class="bk-shell">
        <div class="bk-meta">
          <p class="doc-label">Appointment</p>
          <p class="bk-type">${type.label}</p>
          <p class="bk-meta-line">${icon('clock', 16)}<span>30 minutes</span></p>
          <p class="bk-meta-line">${icon('pin', 16)}<span>${locLabel()}</span></p>
          ${donorName ? `<p class="bk-meta-line">${icon('user', 16)}<span>Donor: ${donorName} — photo ID required</span></p>` : `<p class="bk-meta-line">${icon('user', 16)}<span>The donor brings photo ID</span></p>`}
          ${type.notes.map(n => `<p class="bk-note">${n}</p>`).join('')}
          <p class="bk-note">Derry~Londonderry requests need five working days’ notice — the earliest date you can request is ${minLabel}.</p>
        </div>
        <div class="bk-cal-card">
          <div class="bk-arrange">
            <h2>Choose what suits</h2>
            <div class="req-field">
              <p class="req-label">Preferred date</p>
              <input type="date" class="req-input" id="dr-date" min="${dayKey(min)}" max="${dayKey(max)}">
              <p class="req-error" id="dr-error" hidden></p>
              <p class="req-hint">Monday to Friday. The earliest date you can request is ${minLabel}.</p>
            </div>
            <div class="req-field">
              <p class="req-label">Preferred time of day</p>
              <div class="req-opts" id="dr-window">
                <button type="button" class="req-opt selected" data-win="Morning">Morning<span class="req-opt-sub">09:00–12:30</span></button>
                <button type="button" class="req-opt" data-win="Afternoon">Afternoon<span class="req-opt-sub">13:30–16:30</span></button>
              </div>
            </div>
            <div class="bk-actions">
              <button class="btn primary" id="dr-send" disabled>Send booking request</button>
              <button class="btn ghost" id="dr-skip">Request later using the emailed link</button>
            </div>
            <p class="bk-caption">This is a request, not a confirmed booking — we confirm availability by email within one working day.</p>
          </div>
        </div>
      </div>`;

    const dateInput = document.getElementById('dr-date');
    const errEl = document.getElementById('dr-error');
    const sendBtn = document.getElementById('dr-send');
    const validate = () => {
      errEl.hidden = true;
      if (!dateInput.value) { sendBtn.disabled = true; return; }
      const chosen = new Date(dateInput.value + 'T00:00:00');
      const w = chosen.getDay();
      if (w === 0 || w === 6) {
        errEl.textContent = 'Choose a weekday — collections run Monday to Friday.';
        errEl.hidden = false; sendBtn.disabled = true; return;
      }
      if (chosen < min) {
        errEl.textContent = `The earliest date you can request is ${minLabel}.`;
        errEl.hidden = false; sendBtn.disabled = true; return;
      }
      req.date = dateInput.value;
      sendBtn.disabled = false;
    };
    dateInput.addEventListener('change', validate);
    dateInput.addEventListener('input', validate);
    document.getElementById('dr-window').addEventListener('click', e => {
      const b = e.target.closest('[data-win]'); if (!b) return;
      req.window = b.dataset.win;
      document.querySelectorAll('#dr-window .req-opt').forEach(x => x.classList.toggle('selected', x === b));
    });
    sendBtn.addEventListener('click', () => {
      if (sendBtn.disabled || !req.date) return;
      const pretty = new Date(req.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      state.booking = { request: true, derryRequest: true, typeLabel: type.label, dateLabel: pretty, window: req.window, location: locLabel() };
      state.bookingSkipped = false;
      if (state.recordId) {
        API.post('/api/booking/request', { recordId: state.recordId, preferredDate: req.date, window: req.window }).catch(() => {});
      }
      goTo(8);
    });
    document.getElementById('dr-skip').addEventListener('click', () => {
      state.booking = null;
      state.bookingSkipped = true;
      goTo(8);
    });
  }

  /* ---------------- step 7 (on-site) — visit requested, team confirms availability ---------------- */
  function renderOnsiteArrange(isPrivate, type, d, donorName) {
    const req = { when: 'asap', date: '', window: 'Morning', risk: null };
    const { min, max } = bookingWindow();
    let underage = false;
    if (d.donorDob) {
      const dob = new Date(d.donorDob); const t = new Date();
      let age = t.getFullYear() - dob.getFullYear();
      const m = t.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && t.getDate() < dob.getDate())) age--;
      underage = age < 18;
    }
    document.getElementById('booking').innerHTML = `
      <div class="success-banner">
        ${icon('check', 20)}
        <div>
          <strong>${isPrivate && state.payment
            ? `Payment received — ${gbp(state.payment.amount)} · receipt ${state.payment.receipt}`
            : `Fee note ${state.refNumber} submitted`}</strong>
          <span>${isPrivate && state.payment
            ? `Fee note ${state.refNumber} is confirmed. A VAT receipt is on its way to ${d.contactEmail || 'your inbox'}.`
            : `A PDF copy is on its way to ${d.contactEmail || 'your inbox'}.`}</span>
        </div>
      </div>
      <div class="panel-head">
        <p class="marker">Booking</p>
        <h1>Request your on-site visit</h1>
        <p class="lede">On-site collections are arranged as a request — tell us what suits and we confirm availability with you.</p>
      </div>
      <div class="bk-shell">
        <div class="bk-meta">
          <p class="doc-label">Visit</p>
          <p class="bk-type">${type.label}</p>
          <p class="bk-meta-line">${icon('pin', 16)}<span>${locLabel()}</span></p>
          ${donorName ? `<p class="bk-meta-line">${icon('user', 16)}<span>Donor: ${donorName} — photo ID required</span></p>` : `<p class="bk-meta-line">${icon('user', 16)}<span>The donor brings photo ID</span></p>`}
          ${type.notes.map(n => `<p class="bk-note">${n}</p>`).join('')}
          <p class="bk-note">Collections take place in professional environments only, where a private collection room is made available. A witness may be required to be present.</p>
          <p class="bk-note">The collection fee starts at ${gbp(ONSITE_COLLECTION_FROM)} + VAT and is confirmed before the visit.</p>
        </div>
        <div class="bk-cal-card">
          <div class="bk-arrange">
            <h2>Arrange the visit</h2>
            <div class="dev-fill-bar">
              <span>Prototype helper</span>
              <button type="button" class="btn small ghost" id="dev-fill-req">Fill with sample data</button>
            </div>
            <div class="req-field">
              <p class="req-label">Collection address</p>
              ${!isPrivate ? `<p class="req-hint" style="margin-top:0; margin-bottom: var(--space-2);">We have prefilled your organisation address — change it if the collection happens somewhere else.</p>` : ''}
              <input type="text" class="req-input" id="req-venue" placeholder="Organisation or venue name" value="${d.onsiteVenueName ?? (!isPrivate ? d.org || '' : '')}" autocomplete="off">
              <input type="text" class="req-input" id="req-address" placeholder="Building and street" value="${d.onsiteVenueAddress ?? (!isPrivate ? d.orgAddress || '' : '')}" autocomplete="off">
              <div class="req-2col">
                <input type="text" class="req-input" id="req-town" placeholder="Town or city" value="${d.onsiteVenueTown ?? (!isPrivate ? d.orgTown || '' : '')}" autocomplete="off">
                <input type="text" class="req-input" id="req-postcode" placeholder="Postcode" value="${d.onsiteVenuePostcode ?? (!isPrivate ? d.orgPostcode || '' : '')}" autocomplete="off">
              </div>
              <input type="text" class="req-input" id="req-access" placeholder="Access note — optional, e.g. ask for reception" value="${d.onsiteVenueNotes || ''}" autocomplete="off">
              <p class="req-hint">Professional environments only — a private collection room must be made available.</p>
            </div>
            <div class="req-field">
              <p class="req-label">On-site contact</p>
              <p class="req-hint" style="margin-top:0; margin-bottom: var(--space-2);">The person who meets our collector and confirms the collection room.</p>
              <input type="text" class="req-input" id="req-contact-name" placeholder="Contact name" value="${d.onsiteContactName ?? d.contactName ?? ''}" autocomplete="off">
              <input type="tel" class="req-input" id="req-contact-phone" placeholder="Mobile number" value="${d.onsiteContactPhone ?? d.contactPhone ?? ''}" autocomplete="off">
            </div>
            <div class="req-field">
              <p class="req-label">Preferred date</p>
              <div class="req-opts" id="req-when">
                <button type="button" class="req-opt selected" data-when="asap">As soon as possible</button>
                <button type="button" class="req-opt" data-when="date">A specific date</button>
              </div>
              <input type="date" id="req-date" min="${dayKey(min)}" max="${dayKey(max)}" hidden>
            </div>
            <div class="req-field">
              <p class="req-label">Preferred time of day</p>
              <div class="req-opts" id="req-window">
                <button type="button" class="req-opt selected" data-win="Morning">Morning<span class="req-opt-sub">08:00–12:00</span></button>
                <button type="button" class="req-opt" data-win="Afternoon">Afternoon<span class="req-opt-sub">12:00–16:00</span></button>
                <button type="button" class="req-opt" data-win="Evening">Evening<span class="req-opt-sub">16:00–20:00</span><span class="req-opt-note">higher rate may apply</span></button>
              </div>
            </div>
            ${!isPrivate ? `
            <div class="req-field">
              <p class="req-label">Purchase order number <span class="req-optional">optional at this stage</span></p>
              <input type="text" class="req-input" id="req-po" placeholder="e.g. PO-2026-0147" value="${d.caseref || ''}" autocomplete="off">
              <p class="req-hint">Not needed to send the request — we ask for a purchase order once the test and collection fee are confirmed. The report is released on receipt of payment of the fee note.</p>
            </div>` : ''}
            <div class="req-field">
              <p class="req-label">Safeguarding</p>
              <div class="req-checks">
                <label class="check-row"><input type="checkbox" id="sg-venue"><span>This is a professional environment, not a private residence.</span></label>
                <label class="check-row"><input type="checkbox" id="sg-room"><span>A private collection room will be made available, with a toilet nearby.</span></label>
                <label class="check-row"><input type="checkbox" id="sg-witness"><span>I understand a witness may be required to be present.</span></label>
                <label class="check-row"><input type="checkbox" id="sg-consent"><span>The donor is aware of this visit and has agreed to provide a sample.</span></label>
                ${underage ? `<label class="check-row"><input type="checkbox" id="sg-guardian"><span>The donor is under 18 — a parent or guardian has consented and will be present at the collection.</span></label>` : ''}
              </div>
            </div>
            <div class="req-field">
              <p class="req-label">Anything our collector should know before attending?</p>
              <div class="req-opts" id="req-risk">
                <button type="button" class="req-opt" data-risk="no">No</button>
                <button type="button" class="req-opt" data-risk="yes">Yes</button>
              </div>
              <textarea class="req-input req-textarea" id="req-risk-detail" rows="2" placeholder="For example a history of aggression, or anything that affects safe access" hidden></textarea>
              <p class="req-hint">This covers safety and access. A yes does not stop the request — we review it before confirming the visit.</p>
            </div>
            <div class="req-field">
              <p class="req-label">Support needs <span class="req-optional">optional</span></p>
              <input type="text" class="req-input" id="req-support" placeholder="e.g. an interpreter or an appropriate adult" value="${d.onsiteSupport || ''}" autocomplete="off">
            </div>
            <div class="req-fee">
              ${icon('info', 17)}
              <span>Collection fee — from <strong>${gbp(ONSITE_COLLECTION_FROM)} + VAT</strong>. The final fee depends on location and is confirmed with you before the visit.</span>
            </div>
            <div class="bk-actions">
              <button class="btn primary" id="bk-onsite">Request the visit</button>
            </div>
            <p class="bk-caption">This is a request, not a confirmed booking — our team confirms availability within one working day.</p>
          </div>
        </div>
      </div>`;

    const dateInput = document.getElementById('req-date');
    const poInput = document.getElementById('req-po');
    const submitBtn = document.getElementById('bk-onsite');
    const venueEls = {
      name: document.getElementById('req-venue'),
      address: document.getElementById('req-address'),
      town: document.getElementById('req-town'),
      postcode: document.getElementById('req-postcode'),
      notes: document.getElementById('req-access'),
      contactName: document.getElementById('req-contact-name'),
      contactPhone: document.getElementById('req-contact-phone'),
      support: document.getElementById('req-support')
    };
    const venueKeys = {
      name: 'onsiteVenueName', address: 'onsiteVenueAddress', town: 'onsiteVenueTown',
      postcode: 'onsiteVenuePostcode', notes: 'onsiteVenueNotes',
      contactName: 'onsiteContactName', contactPhone: 'onsiteContactPhone', support: 'onsiteSupport'
    };
    const sgIds = ['sg-venue', 'sg-room', 'sg-witness', 'sg-consent'].concat(underage ? ['sg-guardian'] : []);
    const riskDetail = document.getElementById('req-risk-detail');
    const refresh = () => {
      const venueOk = ['name', 'address', 'town', 'postcode', 'contactName', 'contactPhone'].every(k => venueEls[k].value.trim());
      const sgOk = sgIds.every(id => document.getElementById(id).checked);
      const riskOk = req.risk === 'no' || (req.risk === 'yes' && riskDetail.value.trim());
      submitBtn.disabled = (req.when === 'date' && !req.date) || !venueOk || !sgOk || !riskOk;
    };
    Object.entries(venueEls).forEach(([k, el]) =>
      el.addEventListener('input', () => { state.details[venueKeys[k]] = el.value; refresh(); }));
    sgIds.forEach(id => document.getElementById(id).addEventListener('change', refresh));
    document.getElementById('req-risk').addEventListener('click', e => {
      const b = e.target.closest('[data-risk]'); if (!b) return;
      req.risk = b.dataset.risk;
      document.querySelectorAll('#req-risk .req-opt').forEach(x => x.classList.toggle('selected', x === b));
      riskDetail.hidden = req.risk !== 'yes';
      refresh();
    });
    riskDetail.addEventListener('input', refresh);
    document.getElementById('dev-fill-req').addEventListener('click', () => {
      const sample = {
        name: 'Example Workplace Ltd', address: '10 Example Road', town: 'Belfast',
        postcode: 'BT2 2BB', notes: 'Ask for reception',
        contactName: 'Test Contact', contactPhone: '07700 900123'
      };
      Object.entries(sample).forEach(([k, v]) => {
        if (!venueEls[k].value.trim()) { venueEls[k].value = v; state.details[venueKeys[k]] = v; }
      });
      sgIds.forEach(id => { document.getElementById(id).checked = true; });
      const noBtn = document.querySelector('#req-risk [data-risk=no]');
      req.risk = 'no';
      document.querySelectorAll('#req-risk .req-opt').forEach(x => x.classList.toggle('selected', x === noBtn));
      riskDetail.hidden = true;
      refresh();
    });
    document.getElementById('req-when').addEventListener('click', e => {
      const b = e.target.closest('[data-when]'); if (!b) return;
      req.when = b.dataset.when;
      document.querySelectorAll('#req-when .req-opt').forEach(x => x.classList.toggle('selected', x === b));
      dateInput.hidden = req.when !== 'date';
      refresh();
    });
    dateInput.addEventListener('change', () => { req.date = dateInput.value; refresh(); });
    document.getElementById('req-window').addEventListener('click', e => {
      const b = e.target.closest('[data-win]'); if (!b) return;
      req.window = b.dataset.win;
      document.querySelectorAll('#req-window .req-opt').forEach(x => x.classList.toggle('selected', x === b));
    });
    submitBtn.addEventListener('click', () => {
      const dateLabel = req.when === 'asap'
        ? 'As soon as possible'
        : new Date(req.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      state.booking = {
        request: true, typeLabel: type.label, dateLabel, window: req.window, location: locLabel(),
        po: poInput && poInput.value.trim() ? poInput.value.trim() : null,
        venue: {
          name: venueEls.name.value.trim(), address: venueEls.address.value.trim(),
          town: venueEls.town.value.trim(), postcode: venueEls.postcode.value.trim(),
          notes: venueEls.notes.value.trim()
        },
        contact: { name: venueEls.contactName.value.trim(), phone: venueEls.contactPhone.value.trim() },
        safeguarding: {
          declarations: true, donorConsent: true, guardian: underage,
          risk: req.risk, riskDetail: req.risk === 'yes' ? riskDetail.value.trim() : '',
          support: venueEls.support.value.trim()
        }
      };
      state.bookingSkipped = false;
      state.onsiteArranged = true;
      if (state.recordId) {
        const b = state.booking;
        const detail = [
          `When: ${b.dateLabel} · ${b.window}`,
          `Venue: ${b.venue.name}, ${b.venue.address}, ${b.venue.town} ${b.venue.postcode}`,
          b.venue.notes ? `Access notes: ${b.venue.notes}` : '',
          `On-site contact: ${b.contact.name} · ${b.contact.phone}`,
          b.po ? `PO: ${b.po}` : 'PO: to follow once the collection fee is confirmed',
          `Risk flag: ${b.safeguarding.risk === 'yes' ? 'YES — ' + b.safeguarding.riskDetail : 'no'}`,
          b.safeguarding.support ? `Support needs: ${b.safeguarding.support}` : '',
          b.safeguarding.guardian ? 'Donor under 18 — guardian consent confirmed' : ''
        ].filter(Boolean).join('\n');
        API.patch('/api/fee-notes/' + state.recordId, { event: 'onsite-request', detail }).catch(() => {});
      }
      goTo(8);
    });
    refresh();
  }

  /* ---------------- confirmation ---------------- */
  function renderConfirmation() {
    const isPrivate = state.route === 'private';
    const booked = state.booking;
    const analysisCopy = 'Samples travel to the laboratory under chain of custody. Urine reports take about 10 working days; hair, nail and PEth about 15.'
      + (state.fastTrack && [...state.basket.keys()].some(c => byCode[c].fastTrack) ? ' Your fast-tracked panels are reported in about 5 working days.' : '');
    const isRequest = booked && booked.request;
    const bookingStep = state.collection === 'onsite'
      ? ['Visit requested', `You asked for ${isRequest && booked.dateLabel !== 'As soon as possible' ? booked.dateLabel : 'the earliest available date'}${isRequest ? ', ' + booked.window.toLowerCase() : ''}${isRequest && booked.venue && booked.venue.name ? `, at ${booked.venue.name}, ${booked.venue.address}, ${booked.venue.town} ${booked.venue.postcode}` : ''}. Our team confirms availability within one working day and agrees the private collection room and the final collection fee (from ${gbp(ONSITE_COLLECTION_FROM)} + VAT) with you.${!isPrivate ? (isRequest && booked.po ? ` The collection is raised against purchase order ${booked.po}.` : ' Once the fee is confirmed, a purchase order number confirms the collection.') : ''} A witness may be required to be present, and the donor brings photo ID.${isRequest && booked.contact && booked.contact.name ? ` Our collector asks for ${booked.contact.name} on arrival.` : ''}${isRequest && booked.safeguarding && booked.safeguarding.risk === 'yes' ? ' We review the note you left for our collector before confirming.' : ''}`]
      : booked && booked.derryRequest
      ? ['Appointment requested', `You asked for ${booked.dateLabel}, ${booked.window.toLowerCase()}, at our Derry~Londonderry office. We confirm the appointment by email within one working day. ${isPrivate ? 'Bring' : 'The donor brings'} photo ID.`]
      : booked
      ? ['Appointment booked', `${booked.typeLabel} — ${booked.dateLabel} at ${booked.time}, ${booked.location}. ${isPrivate ? 'Bring' : 'The donor brings'} photo ID. Cancellation is free up to 24 hours before.`]
      : ['Book online', `A secure link to our scheduling calendar is in your inbox — choose a time that suits ${isPrivate ? 'you' : 'the donor'} whenever you are ready. ${isPrivate ? 'Bring' : 'The donor brings'} photo ID.`];

    const steps = isPrivate
      ? [
        ['Payment received', gbp(state.payment ? state.payment.amount : computeTotals().total) + ' paid by card — receipt ' + (state.payment ? state.payment.receipt : 'NV-8362') + '. A VAT receipt is on its way to ' + (state.details.contactEmail || 'your inbox') + '.'],
        bookingStep,
        ['Analysis', analysisCopy],
        ['Your results', 'Your report is released to you, or an authorised representative, and to no one else, as soon as analysis is complete.']
      ]
      : [
        ['Your fee note', 'A PDF of fee note ' + state.refNumber + ' is on its way to ' + (state.details.contactEmail || 'your inbox') + ' — ready to file or present.'],
        bookingStep,
        ['Analysis', analysisCopy],
        ['The report', 'A court-ready expert report is released on payment of the fee note.']
      ];

    document.getElementById('confirmation').innerHTML = `
      <div class="confirm">
        <div class="confirm-badge">${icon('check', 30)}</div>
        <p class="marker">Fee note ${state.refNumber}</p>
        <h1>${booked && booked.derryRequest ? 'Thank you — your appointment is requested' : isRequest ? 'Thank you — your visit is requested' : booked ? 'All set — the appointment is booked' : 'Thank you — your instruction is in'}</h1>
        <p class="lede">Here is ${booked && !isRequest ? 'everything in one place' : 'what happens next'}.</p>
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
  }

  /* ---------------- landing gate ---------------- */
  const GATE_KEY = 'nivha-gate-email';
  const clientKey = email => 'nivha-client-' + email.trim().toLowerCase();

  function seedDemoClient() {
    try {
      localStorage.setItem(clientKey('returning@example.com'), JSON.stringify({
        route: 'trust',
        details: {
          org: 'Example HSC Trust — Family Support Team',
          orgAddress: '1 Example Street',
          orgTown: 'Belfast',
          orgPostcode: 'BT1 1AA',
          caseref: 'TEST-001',
          costCentre: 'CC-4021',
          approverName: 'Test Approver',
          authoriserName: 'Test Authoriser',
          contactName: 'Test Contact',
          contactEmail: 'returning@example.com',
          contactPhone: '07700 900123'
        }
      }));
    } catch (e) { /* storage unavailable — the gate still works */ }
  }

  function saveClientRecord() {
    const email = (state.details.contactEmail || '').trim().toLowerCase();
    if (!email) return;
    const keys = ['org', 'orgAddress', 'orgTown', 'orgPostcode', 'caseref', 'costCentre', 'legalAidRef',
      'approverName', 'authoriserName', 'contactName', 'contactEmail', 'contactPhone'];
    const details = {};
    keys.forEach(k => { if (state.details[k]) details[k] = state.details[k]; });
    try { localStorage.setItem(clientKey(email), JSON.stringify({ route: state.route, details })); } catch (e) {}
  }

  function renderGate() {
    const gate = document.getElementById('gate');
    gate.innerHTML = `
      <div class="gate-hero">
        <p class="marker">NIVHA Laboratory Services</p>
        <h1>Court-ready drug and alcohol testing, with an itemised fee note in about three minutes</h1>
        <p class="lede">Hair, nail and urine testing for care proceedings and personal reassurance — collected at our Belfast and Derry~Londonderry offices, or on site for organisations.</p>
      </div>
      <div class="gate-points">
        <div class="gate-point"><strong>Instant itemised pricing</strong><p>See exactly what each panel costs before you commit — unlocked with a secure link sent to your inbox.</p></div>
        <div class="gate-point"><strong>Expert reports for proceedings</strong><p>Reports prepared by our reporting scientists, worded for solicitors, trusts and the courts.</p></div>
        <div class="gate-point"><strong>Book online</strong><p>Choose a time at our offices, or arrange on-site collection for organisations — no phone calls needed.</p></div>
      </div>
      <div class="gate-card" id="gate-card">
        <h2>Get your secure link</h2>
        <p>Enter your email address and we send a link that unlocks the fee note tool.</p>
        <div class="gate-form">
          <input type="email" id="gate-email" placeholder="you@organisation.co.uk" autocomplete="email">
          <button class="btn primary" id="gate-send">Email my secure link</button>
        </div>
        <p class="gate-error" id="gate-error" hidden>Enter a valid email address to receive your link.</p>
        <p class="gate-small">We use your email address to send your secure link and to follow up about your fee note. How we handle personal information for medico-legal testing — including donor details — is set out in our <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>.</p>
        <p class="gate-small">Used NIVHA before? Use the same email and we prefill your organisation and contact details — never donor information.</p>
      </div>
      <div class="dev-fill-bar gate-dev">
        <span>Prototype helper — skip the email step</span>
        <button type="button" class="btn small ghost" id="dev-gate-new">Enter as new visitor</button>
        <button type="button" class="btn small ghost" id="dev-gate-return">Enter as returning client</button>
      </div>`;

    gate.querySelector('#gate-send').addEventListener('click', async () => {
      const email = gate.querySelector('#gate-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        gate.querySelector('#gate-error').hidden = false;
        return;
      }
      const btn = gate.querySelector('#gate-send');
      btn.disabled = true; btn.textContent = 'Sending\u2026';
      try {
        const resp = await API.post('/api/gate/request', { email: email.toLowerCase() });
        showGateCode(email.toLowerCase(), resp);
      } catch (e) {
        const err = gate.querySelector('#gate-error');
        err.textContent = 'We could not send your link just now. Please try again.';
        err.hidden = false;
        btn.disabled = false; btn.textContent = 'Email my secure link';
      }
    });
    gate.querySelector('#gate-email').addEventListener('keydown', e => {
      if (e.key === 'Enter') gate.querySelector('#gate-send').click();
    });
    gate.querySelector('#dev-gate-new').addEventListener('click', () => unlock('test@example.com'));
    gate.querySelector('#dev-gate-return').addEventListener('click', () => unlock('returning@example.com'));
  }

  function showGateCode(email, resp) {
    const card = document.getElementById('gate-card');
    card.innerHTML = `
      <h2>Check your inbox</h2>
      <p>We have sent a secure link and a six-digit code to <strong>${email}</strong>. Open the link, or enter the code below. Both stay valid for 24 hours.</p>
      <div class="gate-form gate-code-form">
        <input type="text" id="gate-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" aria-label="Six-digit code">
        <button class="btn primary" id="gate-verify">Continue</button>
      </div>
      <p class="gate-error" id="gate-code-error" hidden></p>
      ${resp && resp.emailDryRun ? `<p class="gate-small gate-dev-hint">Prototype helper — email sending is switched off in this environment. Your code is <strong>${resp.devCode}</strong>.</p>` : ''}
      <p class="gate-small">Nothing arrived after a couple of minutes? Check your junk folder, or <button type="button" class="linklike" id="gate-resend">send a fresh code</button>.</p>
      <button class="btn ghost small" id="gate-back">Use a different email</button>`;
    const codeInput = card.querySelector('#gate-code');
    const showErr = msg => { const el = card.querySelector('#gate-code-error'); el.textContent = msg; el.hidden = false; };
    const verify = async () => {
      const code = codeInput.value.replace(/\D/g, '');
      if (code.length !== 6) { showErr('Enter the six-digit code from your email.'); return; }
      const btn = card.querySelector('#gate-verify');
      btn.disabled = true; btn.textContent = 'Checking\u2026';
      try {
        await API.post('/api/gate/verify', { email, code });
        unlock(email, { viaGate: true });
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Continue';
        if (e.status === 410) showErr('That code has expired. Send a fresh one below.');
        else if (e.status === 429) showErr('Too many attempts. Send a fresh code below.');
        else showErr('That code does not match. Check your email and try again.');
      }
    };
    card.querySelector('#gate-verify').addEventListener('click', verify);
    codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });
    codeInput.focus();
    card.querySelector('#gate-resend').addEventListener('click', async () => {
      try {
        const fresh = await API.post('/api/gate/request', { email });
        showGateCode(email, fresh);
      } catch (e) { showErr('We could not send a fresh code just now. Please try again.'); }
    });
    card.querySelector('#gate-back').addEventListener('click', renderGate);
  }

  function unlock(email, opts = {}) {
    try { localStorage.setItem(GATE_KEY, email.trim().toLowerCase()); } catch (e) {}
    // The gate request already recorded the lead server-side; only post from dev shortcuts.
    if (!opts.viaGate) API.post('/api/leads', { email: email.trim().toLowerCase(), source: 'fee-note gate' }).catch(() => {});
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(clientKey(email)) || 'null'); } catch (e) {}
    if (saved && saved.details) {
      Object.assign(state.details, saved.details);
      state.returning = true;
    }
    document.getElementById('gate').hidden = true;
    document.querySelector('.stepper').hidden = false;
    if (state.returning && !document.getElementById('returning-banner')) {
      const banner = document.createElement('div');
      banner.className = 'success-banner';
      banner.id = 'returning-banner';
      banner.innerHTML = `${icon('check', 20)}<div><strong>Welcome back</strong><span>We have prefilled your organisation and contact details from your last fee note. Donor details always start fresh.</span></div>`;
      document.getElementById('step-1').prepend(banner);
    }
    goTo(1);
  }

  async function initGate() {
    seedDemoClient();
    renderGate();
    // Magic link: /?gate=TOKEN arrives from the sign-in email — verify and unlock.
    const token = new URLSearchParams(location.search).get('gate');
    if (!token) return;
    history.replaceState(null, '', location.pathname);
    try {
      const sess = await API.get('/api/gate/session/' + encodeURIComponent(token));
      unlock(sess.email, { viaGate: true });
    } catch (e) {
      const err = document.getElementById('gate-error');
      if (err) {
        err.textContent = 'That secure link has expired. Enter your email and we send a fresh one.';
        err.hidden = false;
      }
    }
  }

  /* ---------------- init ---------------- */
  renderRoutes();
  renderPrivateAdvice();
  renderLocations();
  renderConcerns();
  initPaymentReturn()
    .then(handled => { if (!handled) initGate(); })
    .catch(() => initGate());
})();
