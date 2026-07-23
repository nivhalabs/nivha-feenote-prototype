/* NIVHA DNA relationship testing — guided fee note wizard (prototype)
   Reuses the fee note design system (css/style.css) and mirrors the
   drug and alcohol wizard's structure. Front-end prototype: submission,
   payment and PDF generation are simulated for review. */
(function () {
  'use strict';

  /* ---------------- state ---------------- */
  const state = {
    step: 0,
    maxVisited: 1,
    route: null,                 /* solicitor | trust | private */
    test: null,                  /* DNA_TESTS id */
    participants: [],            /* { uid, role, name, dob, guardianName } */
    attendance: 'together',      /* together | separately */
    collection: 'belfast',       /* group collection when attending together */
    gp: { name: '', address: '' },
    details: {},
    acceptance: null,
    refNumber: '',
    paid: false
  };

  const byId = {};
  DNA_TESTS.forEach(t => { byId[t.id] = t; });

  let uidSeq = 1;
  const nextUid = () => 'p' + (uidSeq++);

  const gbp = n => '\u00a3' + (n % 1 === 0
    ? n.toLocaleString('en-GB')
    : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const esc = s => String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ageOf = dob => {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d)) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  };
  const isMinor = p => { const a = ageOf(p.dob); return a !== null && a < 18; };

  /* ---------------- icons (shared set) ---------------- */
  const ICONS = {
    check: '<path d="m5 13 4.5 4.5L19 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".5" fill="currentColor"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".5" fill="currentColor"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
    pin: '<path d="M12 21s-6.5-5.5-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.5 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8"/><circle cx="12" cy="17" r=".5" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    dna: '<path d="M7 3c0 5 10 7 10 12M17 3c0 2-1.6 3.6-4 5M7 21c0-5 10-7 10-12M7 21c0-2 1.6-3.6 4-5"/><path d="M8.5 7h7M8.5 17h7"/>'
  };
  const icon = (name, size = 22) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ---------------- routes ---------------- */
  const ROUTES = [
    {
      id: 'solicitor',
      title: 'Solicitor or legal representative',
      sub: 'Instructing DNA testing on behalf of a client in family proceedings.',
      points: ['Fee note addressed to your practice', 'Can be submitted to the Legal Aid Authority for approval', 'Invoiced — results released on payment', 'Full legal report suitable for court']
    },
    {
      id: 'trust',
      title: 'Trust or social services',
      sub: 'Health and social care trusts, family support and safeguarding teams.',
      points: ['Fee note raised against your team or purchase order', 'Invoiced — results released on payment', 'Full legal report suitable for court']
    },
    {
      id: 'private',
      title: 'Private individual',
      sub: 'Arranging and paying for your own relationship testing.',
      points: ['Plain-English guidance throughout', 'Secure card payment in advance', 'Your results stay confidential to you']
    }
  ];

  /* ---------------- navigation ---------------- */
  const sections = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6', 'step-pay', 'step-done'];

  function goTo(step) {
    state.step = step;
    if (step <= 6) state.maxVisited = Math.max(state.maxVisited, step);
    sections.forEach((id, i) => {
      document.getElementById(id).hidden = (i + 1 !== step);
    });
    renderStepper();
    if (step === 3) { renderRoster(); renderSummary(); }
    if (step === 4) { renderCollection(); renderSummary(); }
    if (step === 5) { renderDetailsForm(); renderSummary(); }
    if (step === 6) { renderFeeNote(); renderChecklist(); renderDeclaration(); }
    if (step === 7) renderCheckout();
    if (step === 8) renderConfirmation();
    updateMobileBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderStepper() {
    document.querySelectorAll('#stepper .step').forEach(el => {
      const s = +el.dataset.step;
      el.classList.toggle('active', s === state.step);
      el.classList.toggle('done', s < state.step && state.step <= 6);
      el.disabled = s > state.maxVisited || state.step > 6;
    });
    document.querySelector('.stepper').style.display = state.step > 6 ? 'none' : '';
  }

  document.querySelectorAll('#stepper .step').forEach(el =>
    el.addEventListener('click', () => goTo(+el.dataset.step)));
  document.querySelectorAll('[data-back]').forEach(el =>
    el.addEventListener('click', () => goTo(state.step - 1)));

  /* ---------------- step 1 — routes ---------------- */
  function renderRoutes() {
    const grid = document.getElementById('route-grid');
    grid.innerHTML = ROUTES.map(r => `
      <button class="route-card ${state.route === r.id ? 'selected' : ''}" data-route="${r.id}">
        <span class="route-title">${r.title}</span>
        <span class="route-sub">${r.sub}</span>
        <ul class="route-points">
          ${r.points.map(p => `<li>${icon('check', 16)}<span>${p}</span></li>`).join('')}
        </ul>
        <span class="route-cta">${state.route === r.id ? 'Selected' : 'Choose this route'} \u2192</span>
      </button>`).join('');
    grid.querySelectorAll('.route-card').forEach(el =>
      el.addEventListener('click', () => {
        state.route = el.dataset.route;
        renderRoutes();
        setTimeout(() => goTo(2), 220);
      }));
  }

  /* ---------------- step 2 — which test ---------------- */
  function renderTests() {
    const grid = document.getElementById('test-grid');
    grid.innerHTML = DNA_TESTS.map(t => `
      <button class="test-card ${state.test === t.id ? 'selected' : ''}" data-test="${t.id}">
        <span class="test-card-top">
          <span class="test-q">${t.question}</span>
          <span class="test-price">${t.priced ? gbp(t.price) + ' + VAT' : 'Quote on request'}</span>
        </span>
        <strong class="test-name">${t.name}</strong>
        <span class="test-proves">${t.proves}</span>
        <span class="test-meta">${t.priced
          ? `Covers up to ${DNA_INCLUDED_PEOPLE} people \u00b7 each additional person ${gbp(DNA_ADDITIONAL_PERSON_FEE)} + VAT`
          : 'Priced case by case with a case manager \u2014 build the fee note and we confirm the quote'}</span>
        <span class="concern-tick" aria-hidden="true">${icon('check', 14)}</span>
      </button>`).join('');
    grid.querySelectorAll('.test-card').forEach(el =>
      el.addEventListener('click', () => selectTest(el.dataset.test)));
    renderTriage();
    document.getElementById('to-step-3').disabled = !state.test;
  }

  function selectTest(id) {
    if (state.test !== id) {
      state.test = id;
      seedRoster();
    }
    renderTests();
    document.getElementById('to-step-3').disabled = false;
  }

  /* Short triage for "not sure" — mirrors the recommendation logic agreed
     at the workshop: availability of the potential father decides the test. */
  const triageState = { open: false, fatherAvailable: null };
  function renderTriage() {
    const box = document.getElementById('triage');
    if (!triageState.open) {
      box.innerHTML = `
        <button class="triage-open" id="triage-open">
          ${icon('help', 18)}
          <span><strong>Not sure which test?</strong> Answer one question and we point you to the right one.</span>
        </button>`;
      box.querySelector('#triage-open').addEventListener('click', () => {
        triageState.open = true; renderTriage();
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return;
    }
    const rec = (id, why) => {
      const t = byId[id];
      return `
        <div class="triage-rec">
          <p class="doc-label">Our recommendation</p>
          <strong>${t.name} \u2014 ${t.priced ? gbp(t.price) + ' + VAT' : 'quote on request'}</strong>
          <p>${why} ${DNA_MARKER_CLAIM}</p>
          <button class="btn primary small" data-pick="${id}">Use the ${t.name.toLowerCase()}</button>
        </div>`;
    };
    let body = `
      <p class="triage-q"><strong>Is the potential father available to give a sample?</strong></p>
      <div class="triage-answers">
        <button class="btn outline small" data-father="yes" ${triageState.fatherAvailable === 'yes' ? 'aria-pressed="true"' : ''}>Yes</button>
        <button class="btn outline small" data-father="no" ${triageState.fatherAvailable === 'no' ? 'aria-pressed="true"' : ''}>No \u2014 he is unavailable or unwilling</button>
      </div>`;
    if (triageState.fatherAvailable === 'yes') {
      body += rec('paternity', 'Testing the potential father directly is the most conclusive option.');
    } else if (triageState.fatherAvailable === 'no') {
      body += `
        <p class="triage-q"><strong>Who from his side of the family could take part instead?</strong></p>
        <div class="triage-answers stack">
          <button class="btn outline small" data-pick="sibling">A full brother or sister of the child</button>
          <button class="btn outline small" data-pick="auntuncle">The potential father\u2019s brother or sister</button>
          <button class="btn outline small" data-pick="extended">The potential father\u2019s parents</button>
        </div>`;
    }
    box.innerHTML = `<div class="triage-card">${body}</div>`;
    box.querySelectorAll('[data-father]').forEach(b =>
      b.addEventListener('click', () => { triageState.fatherAvailable = b.dataset.father; renderTriage(); }));
    box.querySelectorAll('[data-pick]').forEach(b =>
      b.addEventListener('click', () => selectTest(b.dataset.pick)));
  }

  document.getElementById('to-step-3').addEventListener('click', () => goTo(3));

  /* ---------------- step 3 — participant roster ---------------- */
  function seedRoster() {
    const t = byId[state.test];
    state.participants = [];
    t.roster.forEach(group => {
      for (let i = 0; i < group.min; i++) {
        state.participants.push({ uid: nextUid(), role: group.role, name: '', dob: '', guardianName: '', collection: 'belfast', gpName: '', gpAddress: '' });
      }
    });
  }

  const roleLabel = (t, role, i, count) => {
    const g = t.roster.find(r => r.role === role);
    return count > 1 ? `${g.label} ${i + 1}` : g.label;
  };

  function renderRoster() {
    const t = byId[state.test];
    if (!t) { goTo(2); return; }
    document.getElementById('roster-title').textContent = `Who is being tested? \u2014 ${t.name.toLowerCase()}`;
    document.getElementById('roster-lede').textContent = t.priced
      ? `Name each person taking part. The ${gbp(t.price)} fee covers up to ${DNA_INCLUDED_PEOPLE} people \u2014 each additional person adds ${gbp(DNA_ADDITIONAL_PERSON_FEE)} + VAT, and the total updates as you go.`
      : 'Name each person taking part. This combination is priced case by case \u2014 a case manager confirms the quote before anything proceeds.';

    const box = document.getElementById('roster');
    box.innerHTML = t.roster.map(group => {
      const members = state.participants.filter(p => p.role === group.role);
      const canAdd = group.addLabel && members.length < group.max;
      return `
        <div class="roster-group" data-role="${group.role}">
          <h2>${group.max > 1 ? group.plural : group.label}</h2>
          ${members.map((p, i) => participantCard(t, p, i, members.length, members.length > group.min)).join('')}
          ${canAdd ? `
            <button class="add-person" data-add="${group.role}">
              <span class="add-person-plus">+</span>
              <span>${group.addLabel}</span>
              <span class="add-person-fee">${t.priced && state.participants.length >= DNA_INCLUDED_PEOPLE ? '+ ' + gbp(DNA_ADDITIONAL_PERSON_FEE) + ' + VAT' : 'included in the fee'}</span>
            </button>` : ''}
        </div>`;
    }).join('');

    const noticeBox = document.getElementById('roster-notices');
    noticeBox.innerHTML = `
      <div class="notice notice-saving">${icon('info', 18)}
        <p>Every participant gets their own checklist with the fee note, so each person knows exactly what to bring. ${DNA_TURNAROUND}</p>
      </div>`;

    box.querySelectorAll('[data-add]').forEach(b =>
      b.addEventListener('click', () => {
        state.participants.push({ uid: nextUid(), role: b.dataset.add, name: '', dob: '', guardianName: '', collection: 'belfast', gpName: '', gpAddress: '' });
        renderRoster(); renderSummary(); updateMobileBar();
      }));
    box.querySelectorAll('[data-remove]').forEach(b =>
      b.addEventListener('click', () => {
        state.participants = state.participants.filter(p => p.uid !== b.dataset.remove);
        renderRoster(); renderSummary(); updateMobileBar();
      }));
    box.querySelectorAll('input[data-uid]').forEach(bindRosterInput);
  }

  function bindRosterInput(inp) {
    inp.addEventListener('input', () => {
      const p = state.participants.find(x => x.uid === inp.dataset.uid);
      if (!p) return;
      p[inp.dataset.prop] = inp.value;
      if (inp.dataset.prop === 'dob') syncMinorBlock(inp, p);
      renderSummary(); updateMobileBar();
    });
  }

  /* Toggle the under-18 block in place — never rebuild the card while the
     user is typing, or the date field loses focus mid-entry. */
  function syncMinorBlock(inp, p) {
    const card = inp.closest('.participant-card');
    if (!card) return;
    const minor = isMinor(p);
    const existing = card.querySelector('.minor-block');
    card.classList.toggle('is-minor', minor);
    if (minor && !existing) {
      card.insertAdjacentHTML('beforeend', minorBlockHtml(p));
      const g = card.querySelector('#guardian-' + p.uid);
      if (g) bindRosterInput(g);
    } else if (!minor && existing) {
      existing.remove();
    }
  }

  function minorBlockHtml(p) {
    const fatherRule = state.test === 'paternity'
      ? ' and cannot be the potential father'
      : ' and must not be one of the people being tested';
    return `
          <div class="minor-block">
            <p class="minor-head">${icon('alert', 16)} Under 18 \u2014 an accompanying adult is required</p>
            <p>The adult must bring their own photographic ID, must be legally able to sign on the child\u2019s behalf${fatherRule}. Where a care order is in place, a copy is required and the child may need to attend with a social worker or someone holding parental responsibility.</p>
            <div class="form-field">
              <label for="guardian-${p.uid}">Accompanying adult\u2019s full name</label>
              <input type="text" id="guardian-${p.uid}" data-uid="${p.uid}" data-prop="guardianName" value="${esc(p.guardianName)}" autocomplete="off">
            </div>
          </div>`;
  }

  function participantCard(t, p, i, count, removable) {
    const minor = isMinor(p);
    return `
      <div class="participant-card ${minor ? 'is-minor' : ''}">
        <div class="participant-head">
          <span class="participant-role">${icon('user', 16)} ${roleLabel(t, p.role, i, count)}</span>
          ${removable ? `<button class="participant-remove" data-remove="${p.uid}">Remove</button>` : ''}
        </div>
        <div class="participant-fields">
          <div class="form-field">
            <label for="name-${p.uid}">Full name</label>
            <input type="text" id="name-${p.uid}" data-uid="${p.uid}" data-prop="name" value="${esc(p.name)}" autocomplete="off" placeholder="As it appears on their ID">
          </div>
          <div class="form-field">
            <label for="dob-${p.uid}">Date of birth</label>
            <input type="date" id="dob-${p.uid}" data-uid="${p.uid}" data-prop="dob" value="${esc(p.dob)}" max="${new Date().toISOString().slice(0, 10)}">
          </div>
        </div>
        ${minor ? minorBlockHtml(p) : ''}
      </div>`;
  }

  function validateRoster() {
    const missing = state.participants.some(p => !p.name.trim() || !p.dob);
    const guardianMissing = state.participants.some(p => isMinor(p) && !p.guardianName.trim());
    if (missing || guardianMissing) {
      const noticeBox = document.getElementById('roster-notices');
      noticeBox.innerHTML = `
        <div class="notice notice-warn">${icon('alert', 18)}
          <p>${missing ? 'Every participant needs a full name and date of birth. ' : ''}${guardianMissing ? 'Participants under 18 need the accompanying adult\u2019s name.' : ''}</p>
        </div>`;
      noticeBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  /* ---------------- step 4 — collection ---------------- */
  function collectionCards(selectedId, onsiteAllowed) {
    const cards = [
      { id: 'belfast', title: 'NIVHA office \u2014 Belfast', sub: 'Collection is included in your fee. Unit 1B, Concourse 1, Catalyst, Queens Road, Belfast.' },
      { id: 'derry', title: 'NIVHA office \u2014 Derry~Londonderry', sub: gbp(DNA_COLLECTION.derry.fee) + ' + VAT collection fee, added to your fee note.' },
      { id: 'gp', title: 'Your own GP surgery', sub: gbp(DNA_COLLECTION.gp.fee) + ' per surgery \u2014 we post the kit to the surgery, the GP collects, and the surgery posts it direct to the lab.', flag: 'The standard, recommended route for participants in the Republic of Ireland.' },
      { id: 'onsite', title: 'Your location \u2014 we come to you', sub: gbp(DNA_COLLECTION.onsite.fee) + ' + VAT. Professional environments only \u2014 we do not collect in private homes.', locked: !onsiteAllowed, flag: onsiteAllowed ? null : 'Available to instructing organisations only.' }
    ];
    return cards.map(c => `
      <button class="route-card location-card ${selectedId === c.id ? 'selected' : ''} ${c.locked ? 'locked' : ''}" data-collect="${c.id}" ${c.locked ? 'disabled' : ''}>
        <span class="route-title">${c.title}</span>
        <span class="route-sub">${c.sub}</span>
        ${c.flag ? `<span class="location-flag">${icon('info', 15)}<span>${c.flag}</span></span>` : ''}
        <span class="route-cta">${selectedId === c.id ? 'Selected' : 'Choose'} \u2192</span>
      </button>`).join('');
  }

  function gpFields(prefix, name, address) {
    return `
      <div class="gp-fields">
        <p class="field-hint">We post the kit to the surgery, so we need to know where it is going.</p>
        <div class="form-2col">
          <div class="form-field">
            <label for="${prefix}-gp-name">GP surgery name</label>
            <input type="text" id="${prefix}-gp-name" data-gp="${prefix}" data-prop="gpName" value="${esc(name)}" autocomplete="off">
          </div>
          <div class="form-field">
            <label for="${prefix}-gp-address">Surgery address</label>
            <input type="text" id="${prefix}-gp-address" data-gp="${prefix}" data-prop="gpAddress" value="${esc(address)}" autocomplete="off">
          </div>
        </div>
      </div>`;
  }

  function renderCollection() {
    const onsiteAllowed = state.route !== 'private';
    const box = document.getElementById('collection');
    const together = state.attendance === 'together';

    let html = `
      <div class="attend-toggle" role="radiogroup" aria-label="How participants attend">
        <button class="attend-option ${together ? 'selected' : ''}" data-attend="together" role="radio" aria-checked="${together}">
          <strong>Everyone attends together</strong>
          <span>One collection, one place \u2014 the simplest option where everyone is nearby.</span>
        </button>
        <button class="attend-option ${!together ? 'selected' : ''}" data-attend="separately" role="radio" aria-checked="${!together}">
          <strong>Participants attend separately</strong>
          <span>Different places or times \u2014 for example one parent in Belfast and a child in the Republic via their GP.</span>
        </button>
      </div>`;

    if (together) {
      html += `<div class="location-grid">${collectionCards(state.collection, onsiteAllowed)}</div>`;
      if (state.collection === 'gp') html += gpFields('group', state.gp.name, state.gp.address);
    } else {
      const t = byId[state.test];
      html += state.participants.map((p, idx) => {
        const members = state.participants.filter(x => x.role === p.role);
        const i = members.findIndex(x => x.uid === p.uid);
        return `
          <div class="collect-person" data-uid="${p.uid}">
            <p class="collect-person-name">${icon('user', 16)} <strong>${esc(p.name) || roleLabel(t, p.role, i, members.length)}</strong>${p.name ? ` <span>\u00b7 ${roleLabel(t, p.role, i, members.length)}</span>` : ''}</p>
            <div class="location-grid compact">${collectionCards(p.collection, onsiteAllowed).replace(/data-collect="/g, `data-uid-collect="${p.uid}|`)}</div>
            ${p.collection === 'gp' ? gpFields(p.uid, p.gpName, p.gpAddress) : ''}
          </div>`;
      }).join('');
      html += `
        <div class="notice notice-saving">${icon('info', 18)}
          <p>Participants sharing a GP surgery share the ${gbp(DNA_COLLECTION.gp.fee)} charge \u2014 enter the same surgery name and address and we post one kit. ${DNA_TURNAROUND}</p>
        </div>`;
    }

    html += `
      <div class="panel-actions">
        <button class="btn ghost" data-back-4>Back</button>
        <button class="btn primary" id="to-step-5">Continue to your details</button>
      </div>`;

    box.innerHTML = html;

    box.querySelectorAll('[data-attend]').forEach(b =>
      b.addEventListener('click', () => {
        state.attendance = b.dataset.attend;
        renderCollection(); renderSummary(); updateMobileBar();
      }));
    box.querySelectorAll('[data-collect]').forEach(b =>
      b.addEventListener('click', () => {
        state.collection = b.dataset.collect;
        renderCollection(); renderSummary(); updateMobileBar();
      }));
    box.querySelectorAll('[data-uid-collect]').forEach(b =>
      b.addEventListener('click', () => {
        const [uid, method] = b.dataset.uidCollect.split('|');
        const p = state.participants.find(x => x.uid === uid);
        if (p) p.collection = method;
        renderCollection(); renderSummary(); updateMobileBar();
      }));
    box.querySelectorAll('input[data-gp]').forEach(inp =>
      inp.addEventListener('input', () => {
        const key = inp.dataset.gp, prop = inp.dataset.prop;
        if (key === 'group') state.gp[prop === 'gpName' ? 'name' : 'address'] = inp.value;
        else {
          const p = state.participants.find(x => x.uid === key);
          if (p) p[prop] = inp.value;
        }
        renderSummary();
      }));
    const back = box.querySelector('[data-back-4]');
    if (back) back.addEventListener('click', () => goTo(3));
    box.querySelector('#to-step-5').addEventListener('click', () => {
      if (!validateCollection()) return;
      goTo(5);
    });
  }

  function validateCollection() {
    let ok = true, msg = '';
    if (state.attendance === 'together' && state.collection === 'gp' && (!state.gp.name.trim() || !state.gp.address.trim())) {
      ok = false; msg = 'Enter the GP surgery name and address so we know where to post the kit.';
    }
    if (state.attendance === 'separately') {
      const bad = state.participants.some(p => p.collection === 'gp' && (!p.gpName.trim() || !p.gpAddress.trim()));
      if (bad) { ok = false; msg = 'Every participant using a GP surgery needs the surgery name and address so we know where to post the kit.'; }
    }
    if (!ok) {
      const box = document.getElementById('collection');
      let warn = box.querySelector('.notice-warn');
      if (!warn) {
        warn = document.createElement('div');
        warn.className = 'notice notice-warn';
        box.querySelector('.panel-actions').before(warn);
      }
      warn.innerHTML = `${icon('alert', 18)}<p>${msg}</p>`;
      warn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  /* ---------------- pricing ---------------- */
  function collectionUsage() {
    /* Returns [{ id, label, fee, detail, count }] for every method in use */
    const usage = [];
    if (state.attendance === 'together') {
      const c = DNA_COLLECTION[state.collection];
      usage.push({
        id: c.id, label: c.label, fee: c.fee,
        detail: c.id === 'gp' ? (state.gp.name ? state.gp.name + (state.gp.address ? ', ' + state.gp.address : '') : 'surgery to be confirmed') : null,
        count: 1
      });
      return usage;
    }
    const methods = new Map();
    state.participants.forEach(p => {
      if (p.collection === 'gp') {
        const key = 'gp|' + (p.gpName + '|' + p.gpAddress).toLowerCase().trim();
        if (!methods.has(key)) methods.set(key, {
          id: 'gp', label: DNA_COLLECTION.gp.label, fee: DNA_COLLECTION.gp.fee,
          detail: p.gpName ? p.gpName + (p.gpAddress ? ', ' + p.gpAddress : '') : 'surgery to be confirmed', count: 1
        });
      } else if (!methods.has(p.collection)) {
        const c = DNA_COLLECTION[p.collection];
        methods.set(p.collection, { id: c.id, label: c.label, fee: c.fee, detail: null, count: 1 });
      }
    });
    return [...methods.values()];
  }

  function computeTotals() {
    const t = byId[state.test];
    if (!t) return { poa: true, lines: [], net: 0, vat: 0, total: 0, extra: 0 };
    const n = state.participants.length;
    const extra = Math.max(0, n - DNA_INCLUDED_PEOPLE);
    const poa = !t.priced;
    const base = t.priced ? t.price : 0;
    const extraFee = extra * DNA_ADDITIONAL_PERSON_FEE;
    const collections = collectionUsage();
    const collectionTotal = collections.reduce((s, c) => s + c.fee, 0);
    const net = base + extraFee + collectionTotal;
    const vat = Math.round(net * DNA_VAT_RATE * 100) / 100;
    return { poa, base, extra, extraFee, collections, collectionTotal, net, vat, total: net + vat, people: n };
  }

  /* Names of the people charged as "additional" — everyone beyond the first two */
  const extraPeople = () => state.participants.slice(DNA_INCLUDED_PEOPLE);

  /* ---------------- summary aside ---------------- */
  function renderSummary() {
    const t = byId[state.test];
    if (!t) return;
    const tot = computeTotals();

    const rows = tot.poa
      ? `<div class="sum-row"><span>${t.name} \u2014 ${tot.people} ${tot.people === 1 ? 'person' : 'people'}</span><span>On request</span></div>`
      : `<div class="sum-row"><span>${t.name} \u2014 covers up to ${DNA_INCLUDED_PEOPLE} people</span><span>${gbp(t.price)}</span></div>` +
        extraPeople().map(p => `<div class="sum-row sub"><span>Additional person${p.name ? ' \u2014 ' + esc(p.name) : ''}</span><span>${gbp(DNA_ADDITIONAL_PERSON_FEE)}</span></div>`).join('');

    const collRows = tot.collections.map(c =>
      c.fee === 0
        ? `<div class="sum-row sub"><span>Collection \u2014 ${c.label}</span><span>Included</span></div>`
        : `<div class="sum-row sub"><span>Collection \u2014 ${c.label}${c.detail ? ' (' + esc(c.detail) + ')' : ''}</span><span>${tot.poa ? 'On request' : gbp(c.fee)}</span></div>`).join('');

    const totals = tot.poa
      ? `<div class="sum-totals"><p class="sum-poa">This combination is priced on request \u2014 a case manager confirms the full quote, including collection, before anything proceeds.</p></div>`
      : `<div class="sum-totals">
           <div class="sum-row"><span>Subtotal</span><span>${gbp(tot.net)}</span></div>
           <div class="sum-row"><span>VAT at 20%</span><span>${gbp(tot.vat)}</span></div>
           <div class="sum-row grand"><span>Total</span><span>${gbp(tot.total)}</span></div>
         </div>`;

    const html = `
      <div class="summary-card">
        <h2>Your fee note</h2>
        <p class="sum-loc">${t.name} \u00b7 ${tot.people} ${tot.people === 1 ? 'person' : 'people'}</p>
        <div class="sum-rows">${rows}${state.step >= 4 ? collRows : ''}</div>
        ${totals}
        <p class="sum-note">${DNA_TURNAROUND}</p>
        ${state.step === 3 ? `<button class="btn primary full" id="sum-continue">Continue to collection</button>` : ''}
        ${state.step === 5 ? `<button class="btn primary full" id="sum-review">Review fee note</button>` : ''}
      </div>`;

    ['summary-3', 'summary-4', 'summary-5'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el && state.step === i + 3) el.innerHTML = html;
    });
    const c = document.getElementById('sum-continue');
    if (c) c.addEventListener('click', () => { if (validateRoster()) goTo(4); });
    const r = document.getElementById('sum-review');
    if (r) r.addEventListener('click', () => { if (validateDetails()) goTo(6); });
  }

  /* ---------------- mobile bar ---------------- */
  function updateMobileBar() {
    const bar = document.getElementById('mobile-total');
    const show = state.step >= 3 && state.step <= 5 && state.participants.length > 0;
    bar.hidden = !show;
    if (!show) return;
    const t = computeTotals();
    document.getElementById('mt-count').textContent =
      t.people + (t.people === 1 ? ' person' : ' people') + (t.poa ? '' : ' \u00b7 inc. VAT');
    document.getElementById('mt-amount').textContent = t.poa ? 'On request' : gbp(t.total);
    const btn = document.getElementById('mt-continue');
    btn.textContent = state.step === 5 ? 'Review fee note' : 'Continue';
    btn.onclick = () => {
      if (state.step === 3) { if (validateRoster()) goTo(4); }
      else if (state.step === 4) { if (validateCollection()) goTo(5); }
      else { if (validateDetails()) goTo(6); }
    };
  }

  /* ---------------- step 5 — details ---------------- */
  function field(id, label, opts = {}) {
    const { type = 'text', required = false, hint = '', placeholder = '' } = opts;
    return `
      <div class="form-field" data-field="${id}">
        <label for="${id}">${label}${required ? '' : ' <span class="optional">optional</span>'}</label>
        ${hint ? `<p class="field-hint">${hint}</p>` : ''}
        <input type="${type}" id="${id}" name="${id}" placeholder="${placeholder}" value="${esc(state.details[id])}" ${required ? 'required' : ''} autocomplete="off">
        <p class="field-error" hidden>This is needed to raise the fee note.</p>
      </div>`;
  }

  function renderDetailsForm() {
    const form = document.getElementById('details-form');
    const r = state.route;
    let html = '';
    if (r === 'solicitor') {
      html = `
        <h2 class="form-section-head">Your practice</h2>
        ${field('org', 'Practice or firm name', { required: true })}
        ${field('orgAddress', 'Address', { required: true })}
        <div class="form-2col">
          ${field('orgTown', 'Town or city', { required: true })}
          ${field('orgPostcode', 'Postcode', { required: true })}
        </div>
        ${field('caseref', 'Your case or matter reference', { hint: 'Quoted on the fee note and all correspondence.' })}
        ${field('legalAidRef', 'Legal Aid reference', { hint: 'If the instruction is legally aided \u2014 the fee note can be submitted to the Legal Aid Authority for approval.' })}
        <h2 class="form-section-head">Who we correspond with</h2>
        ${field('contactName', 'Your name', { required: true })}
        ${field('contactEmail', 'Email address', { type: 'email', required: true, hint: 'The fee note PDF and each participant\u2019s checklist are sent here.' })}
        ${field('contactPhone', 'Phone number', { type: 'tel' })}`;
    } else if (r === 'trust') {
      html = `
        <h2 class="form-section-head">Your organisation</h2>
        ${field('org', 'Trust or organisation', { required: true })}
        ${field('orgAddress', 'Address', { required: true })}
        <div class="form-2col">
          ${field('orgTown', 'Town or city', { required: true })}
          ${field('orgPostcode', 'Postcode', { required: true })}
        </div>
        <div class="form-2col">
          ${field('costCentre', 'Cost centre or PO number')}
          ${field('caseref', 'Your case reference')}
        </div>
        ${field('approverName', 'Approving officer', { hint: 'If a manager approves spend on this case.' })}
        <h2 class="form-section-head">Who we correspond with</h2>
        ${field('contactName', 'Your name', { required: true })}
        ${field('contactEmail', 'Email address', { type: 'email', required: true, hint: 'The fee note PDF and each participant\u2019s checklist are sent here.' })}
        ${field('contactPhone', 'Phone number', { type: 'tel' })}`;
    } else {
      html = `
        <h2 class="form-section-head">About you</h2>
        ${field('contactName', 'Your full name', { required: true })}
        ${field('contactEmail', 'Email address', { type: 'email', required: true, hint: 'Your fee note, payment receipt and each participant\u2019s checklist are sent here.' })}
        ${field('contactPhone', 'Phone number', { type: 'tel' })}`;
    }
    html += `
      <div class="dev-fill-bar">
        <span>Prototype helper</span>
        <button type="button" class="btn small ghost" id="dev-fill">Fill sample details</button>
      </div>`;
    form.innerHTML = html;

    form.querySelectorAll('input').forEach(inp =>
      inp.addEventListener('input', () => { state.details[inp.id] = inp.value; }));
    form.addEventListener('submit', e => e.preventDefault());
    const dev = form.querySelector('#dev-fill');
    if (dev) dev.addEventListener('click', () => {
      const samples = {
        solicitor: { org: 'McKeown & Harte Solicitors', orgAddress: '14 Chichester Street', orgTown: 'Belfast', orgPostcode: 'BT1 4JB', caseref: 'MH/2026/0412', legalAidRef: '', contactName: 'Claire McKeown', contactEmail: 'cmckeown@example.co.uk', contactPhone: '028 9024 0000' },
        trust: { org: 'Northern Health and Social Care Trust', orgAddress: 'Bretten Hall, Bush Road', orgTown: 'Antrim', orgPostcode: 'BT41 2RL', costCentre: 'PO-88231', caseref: 'FS-2026-118', approverName: 'D. Hughes', contactName: 'Sean Donnelly', contactEmail: 'sdonnelly@example.hscni.net', contactPhone: '028 9441 0000' },
        private: { contactName: 'Laura Simpson', contactEmail: 'laura.simpson@example.com', contactPhone: '07700 900123' }
      };
      Object.assign(state.details, samples[r]);
      renderDetailsForm();
    });
  }

  function validateDetails() {
    const form = document.getElementById('details-form');
    let ok = true;
    form.querySelectorAll('input[required]').forEach(inp => {
      const wrap = inp.closest('.form-field');
      const bad = !inp.value.trim() || (inp.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value.trim()));
      wrap.classList.toggle('invalid', bad);
      wrap.querySelector('.field-error').hidden = !bad;
      if (bad && ok) { inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); ok = false; }
      else if (bad) ok = false;
    });
    return ok;
  }

  /* ---------------- step 6 — fee note ---------------- */
  function renderFeeNote() {
    const t = byId[state.test];
    const tot = computeTotals();
    const d = state.details;
    const isPrivate = state.route === 'private';
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    document.getElementById('submit-btn').textContent =
      tot.poa ? 'Submit and request your quote'
        : isPrivate ? 'Submit and continue to payment' : 'Submit fee note';

    const money = v => tot.poa ? '\u2014' : gbp(v);

    const participantLines = state.participants.map((p, idx) => {
      const members = state.participants.filter(x => x.role === p.role);
      const i = members.findIndex(x => x.uid === p.uid);
      const extraCharge = !tot.poa && idx >= DNA_INCLUDED_PEOPLE;
      return `
        <tr${idx === 0 ? '' : ' class="doc-subline"'}>
          <td>${idx === 0 ? `<span class="code-chip small">${t.code}</span>` : ''}</td>
          <td>${esc(p.name) || '\u2014'} <span class="doc-detects">${roleLabel(t, p.role, i, members.length)}${isMinor(p) ? ' \u00b7 under 18 \u00b7 accompanied by ' + (esc(p.guardianName) || 'TBC') : ''}</span></td>
          <td class="num">${idx === 0 ? money(tot.base) : extraCharge ? money(DNA_ADDITIONAL_PERSON_FEE) : tot.poa ? '\u2014' : 'Included'}</td>
        </tr>`;
    }).join('');

    const collectionLines = tot.collections.map(c => `
      <tr>
        <td></td>
        <td>Collection \u2014 ${c.label}${c.detail ? ` <span class="doc-detects">${esc(c.detail)}</span>` : ''}</td>
        <td class="num">${c.fee === 0 ? 'Included' : money(c.fee)}</td>
      </tr>`).join('');

    document.getElementById('feenote-doc').innerHTML = `
      <div class="doc">
        <div class="doc-head">
          <div class="doc-brand">
            <img class="doc-logo" src="assets/nivha-logo.png" alt="NIVHA" width="428" height="96">
            <div>
              <p class="doc-brand-name">NIVHA Laboratory Services Ltd</p>
              <p class="doc-brand-sub">DNA relationship testing \u2014 chain of custody</p>
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
            <p><strong>${esc(isPrivate ? d.contactName : d.org) || '\u2014'}</strong></p>
            ${!isPrivate ? `<p>${[d.orgAddress, d.orgTown, d.orgPostcode].filter(Boolean).map(esc).join(', ') || '\u2014'}</p>` : ''}
            ${!isPrivate && d.caseref ? `<p>Ref: ${esc(d.caseref)}</p>` : ''}
            ${state.route === 'solicitor' && d.legalAidRef ? `<p>Legal Aid reference: ${esc(d.legalAidRef)}</p>` : ''}
            ${state.route === 'trust' && d.costCentre ? `<p>Cost centre: ${esc(d.costCentre)}</p>` : ''}
            ${state.route === 'trust' && d.approverName ? `<p>Approver: ${esc(d.approverName)}</p>` : ''}
            ${!isPrivate ? `<p>Attn: ${esc(d.contactName) || '\u2014'}</p>` : ''}
          </div>
          <div>
            <p class="doc-label">Test instructed</p>
            <p><strong>${t.name}</strong></p>
            <p>${tot.people} ${tot.people === 1 ? 'participant' : 'participants'} \u00b7 mouth swabs under chain of custody</p>
            <p>Analysed at up to 68 genetic markers</p>
          </div>
        </div>

        <table class="doc-table">
          <thead><tr><th>Code</th><th>Participant</th><th class="num">Fee</th></tr></thead>
          <tbody>
            ${participantLines}
            ${collectionLines}
          </tbody>
          <tfoot>
            ${tot.poa
              ? `<tr class="doc-total"><td colspan="2">Total</td><td class="num">Priced on request</td></tr>`
              : `<tr><td colspan="2">Subtotal</td><td class="num">${gbp(tot.net)}</td></tr>
                 <tr><td colspan="2">VAT at 20%</td><td class="num">${gbp(tot.vat)}</td></tr>
                 <tr class="doc-total"><td colspan="2">Total</td><td class="num">${gbp(tot.total)}</td></tr>`}
          </tfoot>
        </table>
        ${tot.poa ? `<p class="doc-small">Extended family combinations are priced case by case. A case manager confirms the full quote \u2014 including collection \u2014 before anything proceeds.</p>` : ''}

        <div class="doc-terms">
          <div>
            <p class="doc-label">Payment</p>
            <p>${tot.poa
              ? 'Nothing is payable now. A case manager confirms the quote and payment terms with you before the case proceeds.'
              : isPrivate
                ? 'Payment is taken securely in advance by card. Results are released to you on completion of analysis.'
                : 'Invoiced to the instructing organisation. Analysis proceeds on booking; results are released on payment of the fee note.' + (state.route === 'solicitor' ? ' This fee note can be submitted to the Legal Aid Authority for approval.' : '')}</p>
          </div>
          <div>
            <p class="doc-label">Turnaround</p>
            <p>${DNA_TURNAROUND}</p>
          </div>
          <div>
            <p class="doc-label">The report</p>
            <p>${DNA_LEGAL_REPORT} ${DNA_MARKER_CLAIM}</p>
            <p class="doc-small">Scientific figures shown are indicative and awaiting scientific sign-off.</p>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- step 6 — participant checklist ---------------- */
  function renderChecklist() {
    const t = byId[state.test];
    const fatherRule = state.test === 'paternity'
      ? 'cannot be the potential father'
      : 'must not be one of the people being tested';

    const where = p => {
      const method = state.attendance === 'together' ? state.collection : p.collection;
      if (method === 'gp') {
        const gp = state.attendance === 'together' ? state.gp : { name: p.gpName, address: p.gpAddress };
        return 'Via GP surgery \u2014 ' + (gp.name ? esc(gp.name) + (gp.address ? ', ' + esc(gp.address) : '') : 'surgery to be confirmed');
      }
      return DNA_COLLECTION[method].label;
    };

    const items = state.participants.map((p, idx) => {
      const members = state.participants.filter(x => x.role === p.role);
      const i = members.findIndex(x => x.uid === p.uid);
      const minor = isMinor(p);
      return `
        <div class="check-person">
          <p class="check-person-name"><strong>${esc(p.name) || '\u2014'}</strong> \u00b7 ${roleLabel(t, p.role, i, members.length)} \u00b7 ${where(p)}</p>
          <ul class="check-items">
            ${minor ? `
              <li>${icon('check', 15)}<span>Birth certificate</span></li>
              <li>${icon('check', 15)}<span>2 passport photographs</span></li>
              <li>${icon('check', 15)}<span>Accompanied by <strong>${esc(p.guardianName) || 'an adult'}</strong>, who brings their own photographic ID, is legally able to sign on the child\u2019s behalf, and ${fatherRule}</span></li>
              <li>${icon('check', 15)}<span>Where a care order is in place: a copy of the order \u2014 the child may need to attend with a social worker or someone holding parental responsibility</span></li>` : `
              <li>${icon('check', 15)}<span>Photographic ID \u2014 passport or driving licence</span></li>
              <li>${icon('check', 15)}<span>2 passport photographs</span></li>`}
          </ul>
        </div>`;
    }).join('');

    document.getElementById('checklist-doc').innerHTML = `
      <div class="doc checklist">
        <div class="doc-head">
          <div class="doc-brand">
            <div>
              <p class="doc-brand-name">Participant checklist</p>
              <p class="doc-brand-sub">Issued with your fee note \u2014 one copy for each participant</p>
            </div>
          </div>
        </div>
        ${items}
        <div class="doc-terms">
          <div>
            <p class="doc-label">Fees to be aware of</p>
            <p>Late cancellation (less than 24 hours before the appointment): ${gbp(DNA_FEES.lateCancellation)} + VAT. Non-attendance: ${gbp(DNA_FEES.nonAttendance)} + VAT. Passport photos taken by NIVHA: ${gbp(DNA_FEES.nivhaPhotos)} + VAT per donor.</p>
          </div>
          <div>
            <p class="doc-label">Turnaround</p>
            <p>${DNA_TURNAROUND}</p>
          </div>
          <div>
            <p class="doc-label">On the day</p>
            <p>Samples are simple mouth swabs, taken under chain of custody by an HCPC-registered practitioner. The laboratory may request additional documentation in some cases \u2014 we tell you before the appointment if so.</p>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- declaration ---------------- */
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
          <span>I consent to NIVHA processing the personal information in this fee note \u2014 including sensitive test information \u2014 to provide the testing service, as described in the <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>.</span>
        </label>
        <p class="data-note">You can withdraw your consent at any time before analysis begins by contacting info@nivha.net \u2014 collection and cancellation fees already incurred remain payable. Each adult participant confirms their own agreement at the collection appointment; an accompanying adult signs for a child. Your consent is recorded against this fee note with the date and time.</p>`;
    } else {
      const org = d.org ? esc(d.org) : 'my organisation';
      box.innerHTML = `
        <label class="check-row">
          <input type="checkbox" id="declaration-check" ${a.declaration ? 'checked' : ''}>
          <span>I confirm the details above are correct, that I am authorised to instruct this testing on behalf of ${org}, and that I accept NIVHA's <a href="/data-sharing-terms" target="_blank" rel="noopener">Data Sharing Terms</a> for medico-legal instructions.</span>
        </label>
        <p class="data-note">The Data Sharing Terms set out how NIVHA and your organisation handle the information in this fee note as independent controllers \u2014 including the specialist providers we use, security, retention and breach notification. Your acceptance is recorded against this fee note with the version, date and time. Each adult participant confirms their own agreement at the collection appointment; an accompanying adult signs for a child. Our <a href="/privacy" target="_blank" rel="noopener">privacy notice</a> explains how we handle personal information, including participant details.</p>`;
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

  document.getElementById('submit-btn').addEventListener('click', () => {
    const tot = computeTotals();
    state.refNumber = 'DNA-' + String(Math.floor(1000 + Math.random() * 9000));
    if (!tot.poa && state.route === 'private') goTo(7);
    else goTo(8);
  });

  /* ---------------- payment (private, prototype) ---------------- */
  function renderCheckout() {
    const tot = computeTotals();
    const t = byId[state.test];
    document.getElementById('checkout').innerHTML = `
      <div class="panel-head">
        <p class="marker">Payment</p>
        <h1>Secure card payment</h1>
        <p class="lede">Your fee note ${state.refNumber} is raised. Payment is taken securely in advance \u2014 booking opens as soon as it clears.</p>
      </div>
      <div class="summary-card checkout-card">
        <h2>${t.name} \u00b7 ${tot.people} ${tot.people === 1 ? 'person' : 'people'}</h2>
        <div class="sum-rows">
          <div class="sum-row"><span>Fee note ${state.refNumber}</span><span>${gbp(tot.net)}</span></div>
          <div class="sum-row"><span>VAT at 20%</span><span>${gbp(tot.vat)}</span></div>
        </div>
        <div class="sum-totals">
          <div class="sum-row grand"><span>Total to pay</span><span>${gbp(tot.total)}</span></div>
        </div>
        <button class="btn primary full" id="pay-btn">${icon('lock', 16)} Pay ${gbp(tot.total)} securely</button>
        <p class="sum-note">${icon('card', 14)} Payment is processed by Stripe. NIVHA never sees your card details.</p>
        <p class="sum-note">Prototype \u2014 no card is charged at this stage.</p>
      </div>`;
    document.getElementById('pay-btn').addEventListener('click', () => {
      state.paid = true;
      goTo(8);
    });
  }

  /* ---------------- confirmation ---------------- */
  function renderConfirmation() {
    const tot = computeTotals();
    const t = byId[state.test];
    const d = state.details;
    const isPrivate = state.route === 'private';
    const anyGp = (state.attendance === 'together' ? state.collection === 'gp' : state.participants.some(p => p.collection === 'gp'));

    const steps = tot.poa ? [
      ['A case manager calls you', 'We confirm the right combination of people to test and the full quote \u2014 nothing proceeds until you approve it.'],
      ['Your fee note and checklists follow', 'Once the quote is agreed, the fee note PDF and each participant\u2019s checklist are emailed to ' + (esc(d.contactEmail) || 'you') + '.'],
      ['Samples are collected', 'Mouth swabs under chain of custody, at the locations you chose.'],
      ['The legal report is issued', '15 working days from the laboratory receiving all samples.']
    ] : [
      ['Your fee note PDF is on its way', 'Emailed to ' + (esc(d.contactEmail) || 'you') + (isPrivate ? ' with your payment receipt.' : ' \u2014 our back office is notified and the case is opened.')],
      ['Each participant gets a checklist', 'One per person, listing exactly what to bring' + (anyGp ? ' \u2014 and we post the GP kit as soon as the surgery is confirmed.' : '.')],
      ['Samples are collected', 'Mouth swabs under chain of custody, at the locations you chose.'],
      ['The legal report is issued', '15 working days from the laboratory receiving all samples. ' + (isPrivate ? 'Results are released to you on completion.' : 'Results are released on payment of the fee note.')]
    ];

    document.getElementById('confirmation').innerHTML = `
      <div class="success-banner">${icon('check', 20)}
        <div>
          <strong>${tot.poa ? 'Quote request received' : state.paid ? 'Payment received \u2014 fee note submitted' : 'Fee note submitted'}</strong>
          <span>Reference ${state.refNumber} \u00b7 ${t.name} \u00b7 ${tot.people} ${tot.people === 1 ? 'participant' : 'participants'}${tot.poa ? '' : ' \u00b7 ' + gbp(tot.total) + ' inc. VAT'}</span>
        </div>
      </div>
      <ol class="process-strip confirm-strip" aria-label="What happens next">
        ${steps.map((s, i) => `<li><span class="ps-num">${i + 1}</span><div><strong>${s[0]}</strong><span>${s[1]}</span></div></li>`).join('')}
      </ol>
      <div class="panel-actions">
        <a class="btn outline" href="/dna">Start another DNA fee note</a>
        <a class="btn ghost" href="/">Drug and alcohol testing</a>
      </div>`;
  }

  /* ---------------- gate ---------------- */
  const GATE_KEY = 'nivha-gate-email';
  function renderGate() {
    const gate = document.getElementById('gate');
    gate.innerHTML = `
      <div class="gate-hero">
        <p class="marker">NIVHA Laboratory Services</p>
        <h1>Court-ready DNA relationship testing, with an itemised fee note in about three minutes</h1>
        <p class="lede">Paternity, maternity, sibling and family relationship testing for care proceedings, legal cases and personal certainty \u2014 analysed at up to 68 genetic markers by our partner laboratory DNA Legal.</p>
      </div>
      <div class="gate-points">
        <div class="gate-point"><strong>Priced as you build it</strong><p>The fee covers two people \u2014 add each extra person and watch the total update before you commit.</p></div>
        <div class="gate-point"><strong>Full legal report</strong><p>Suitable for court \u2014 samples collected under chain of custody by an HCPC-registered practitioner.</p></div>
        <div class="gate-point"><strong>Everyone knows what to bring</strong><p>Each participant gets their own checklist with the fee note \u2014 ID, photographs and consent, spelled out per person.</p></div>
      </div>
      <div class="gate-card" id="gate-card">
        <h2>Get your secure link</h2>
        <p>Enter your email address and we send a link that unlocks the fee note tool.</p>
        <div class="gate-form">
          <input type="email" id="gate-email" placeholder="you@organisation.co.uk" autocomplete="email">
          <button class="btn primary" id="gate-send">Email my secure link</button>
        </div>
        <p class="gate-error" id="gate-error" hidden>Enter a valid email address to receive your link.</p>
        <p class="gate-small">We use your email address to send your secure link and to follow up about your fee note. How we handle personal information for medico-legal testing is set out in our <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>.</p>
      </div>
      <div class="dev-fill-bar gate-dev">
        <span>Prototype helper \u2014 skip the email step</span>
        <button type="button" class="btn small ghost" id="dev-gate-new">Enter the DNA fee note tool</button>
      </div>`;
    gate.querySelector('#gate-send').addEventListener('click', () => {
      const email = gate.querySelector('#gate-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        gate.querySelector('#gate-error').hidden = false;
        return;
      }
      unlock(email);
    });
    gate.querySelector('#dev-gate-new').addEventListener('click', () => unlock('test@example.com'));
  }

  function unlock(email) {
    try { localStorage.setItem(GATE_KEY, email.trim().toLowerCase()); } catch (e) {}
    document.getElementById('gate').hidden = true;
    document.querySelector('.stepper').hidden = false;
    goTo(1);
  }

  /* ---------------- init ---------------- */
  renderRoutes();
  renderTests();
  let unlocked = '';
  try { unlocked = localStorage.getItem(GATE_KEY) || ''; } catch (e) {}
  if (unlocked) {
    document.getElementById('gate').hidden = true;
    document.querySelector('.stepper').hidden = false;
    goTo(1);
  } else {
    renderGate();
  }
})();
