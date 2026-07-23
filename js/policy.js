/* NIVHA drug and alcohol policy builder — funnel + wizard (prototype)
   Free layer: two-minute policy health check -> personalised snapshot ->
   email gate -> teaser clause. Paid layer: full policy builder with
   document pack upsell and simulated payment. Reuses the fee note
   design system (css/style.css). */
(function () {
  'use strict';

  /* ---------------- state ---------------- */
  const state = {
    step: 0,                       /* paid wizard step, 0 = free layer */
    maxVisited: 1,
    quiz: {},                      /* jurisdiction, headcount, sector, safety_critical, testing_today, policy_today */
    lead: { email: '', company: '' },
    unlocked: false,               /* email gate passed */
    /* paid answers */
    stance: null,                  /* zero_tolerance | support_first */
    alcoholEvents: null,           /* none | authorised */
    testingEnabled: null,          /* active | reserve */
    testingTypes: [],
    randomMethod: 'independent_random',
    sampleTypes: [],
    provider: null,                /* nivha | other | undecided */
    scTypes: [],
    scScope: 'subset',
    support: { eap: null, oh: null, selfReferral: 'yes' },
    details: {},                   /* policyOwner, dpContact, reviewCycle, contactName, contactEmail, contactPhone */
    packItems: [],
    clientCode: '',
    clientApplied: false,
    accepted: false,
    refNumber: '',
    paid: false
  };
  state.details.reviewCycle = '12';

  const LEAD_KEY = 'nivha-policy-lead';

  const gbp = n => '\u00a3' + (n % 1 === 0
    ? n.toLocaleString('en-GB')
    : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const esc = s => String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- icons ---------------- */
  const ICONS = {
    check: '<path d="m5 13 4.5 4.5L19 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".5" fill="currentColor"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4L12 4z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".5" fill="currentColor"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15.5h5"/>',
    shield: '<path d="M12 3 5 5.5v6c0 4.5 3 7.5 7 9.5 4-2 7-5 7-9.5v-6z"/><path d="m9 11.5 2.2 2.2L15.5 9"/>'
  };
  const icon = (name, size = 22) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  /* ---------------- navigation (paid wizard) ---------------- */
  const sections = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-pay', 'step-done'];

  function goTo(step) {
    state.step = step;
    if (step <= 5) state.maxVisited = Math.max(state.maxVisited, step);
    document.getElementById('quiz').hidden = true;
    document.getElementById('snapshot').hidden = true;
    sections.forEach((id, i) => {
      document.getElementById(id).hidden = (i + 1 !== step);
    });
    renderStepper();
    if (step === 1) renderStance();
    if (step === 2) { renderTesting(); renderSummary(2); }
    if (step === 3) { renderSupport(); renderSummary(3); }
    if (step === 4) { renderGovForm(); renderSummary(4); }
    if (step === 5) { renderDocMap(); renderPackUpsell(); renderClientCode(); renderDeclaration(); }
    if (step === 6) renderCheckout();
    if (step === 7) renderConfirmation();
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
    el.addEventListener('click', () => {
      if (state.step === 1) { showSnapshot(); return; }
      goTo(state.step - 1);
    }));

  /* ================================================================
     FREE LAYER — the health check quiz
     ================================================================ */
  function renderQuiz() {
    const panel = document.getElementById('quiz');
    panel.innerHTML = `
      <div class="gate-hero">
        <p class="marker">NIVHA Laboratory Services</p>
        <h1>Does your drug and alcohol policy hold up?</h1>
        <p class="lede">Six quick questions — no email needed. You get an instant, personalised snapshot of what your policy has to cover, built from the same framework we use for workplace testing under EWDTS guidelines.</p>
      </div>
      ${QUIZ.map(q => `
        <div class="quiz-group" data-q="${q.id}">
          <h2 class="form-section-head">${q.label}</h2>
          ${q.hint ? `<p class="field-hint">${q.hint}</p>` : ''}
          <div class="radio-cards quiz-cards">
            ${q.options.map(o => `
              <button class="radio-card ${state.quiz[q.id] === o.id ? 'selected' : ''}" data-q="${q.id}" data-opt="${o.id}">
                <span class="radio-title">${o.title}</span>
              </button>`).join('')}
          </div>
        </div>`).join('')}
      <div class="panel-actions">
        <button class="btn primary" id="quiz-go" disabled>Show my snapshot</button>
      </div>
      <div class="dev-fill-bar">
        <span>Prototype helper</span>
        <button type="button" class="btn small ghost" id="dev-quiz">Fill sample answers</button>
      </div>`;

    panel.querySelectorAll('.radio-card').forEach(el =>
      el.addEventListener('click', () => {
        state.quiz[el.dataset.q] = el.dataset.opt;
        el.closest('.quiz-cards').querySelectorAll('.radio-card').forEach(x =>
          x.classList.toggle('selected', x === el));
        syncQuizCta();
      }));

    panel.querySelector('#quiz-go').addEventListener('click', () => {
      if (!quizComplete()) return;
      showSnapshot();
    });
    panel.querySelector('#dev-quiz').addEventListener('click', () => {
      state.quiz = { jurisdiction: 'ni', headcount: 'small', sector: 'construction', safety_critical: 'yes', testing_today: 'planning', policy_today: 'old' };
      renderQuiz();
      syncQuizCta();
    });
    syncQuizCta();
  }

  const quizComplete = () => QUIZ.every(q => state.quiz[q.id]);
  function syncQuizCta() {
    const btn = document.getElementById('quiz-go');
    if (btn) btn.disabled = !quizComplete();
  }

  /* ================================================================
     FREE LAYER — snapshot + email gate + teaser
     ================================================================ */
  function snapshotItems() {
    const q = state.quiz;
    const jur = JURISDICTIONS[q.jurisdiction];
    const items = [];

    items.push({
      open: true, icon: 'shield', title: 'The legal framework your policy must cite',
      body: `<ul>${jur.legislation.map(l => `<li>${l}</li>`).join('')}</ul>`
    });

    items.push({
      open: true, icon: 'shield', title: 'Test results are special category health data',
      body: `<p>Under data protection law, a drug or alcohol test result is health data — the most protected category there is. Your policy must name a lawful basis for testing, say who sees results, how long they are kept and how someone gets a copy of their own. A policy that is silent on this is a live liability, whatever else it gets right.</p>`
    });

    if (q.safety_critical !== 'no') {
      items.push({
        open: true, icon: 'alert', title: q.safety_critical === 'unsure' ? 'You may have safety-critical roles — the policy must decide' : 'Safety-critical roles need their own standard',
        body: `<p>Where impairment could cost a life — driving, machinery, height, care of vulnerable people — a general "fit for work" rule is not enough. A defensible policy designates the work, applies a stricter standard to it, and never softens that standard, however supportive the rest of the document is.${q.safety_critical === 'unsure' ? ' If you are unsure, the builder walks you through the recognised categories.' : ''}</p>`
      });
    }

    const lockedItems = [
      { icon: 'lock', title: 'What a defensible testing section contains', sub: 'Chain of custody to EWDTS guidelines, laboratory confirmation of every screening result, medical review before anyone is told, and the B sample right.' },
      { icon: 'lock', title: 'Medication and medicinal cannabis', sub: 'Legally prescribed cannabis products exist — a policy written before that will call a lawful prescription a breach.' },
      { icon: 'lock', title: 'Refusal, adulteration and non-attendance', sub: 'What happens when someone refuses or interferes with a test — the clause most older policies are missing.' },
      { icon: 'lock', title: `Roles and responsibilities for a ${q.headcount === 'micro' ? 'team of ten or fewer' : q.headcount === 'small' ? 'team of eleven to fifty' : q.headcount === 'medium' ? 'workforce of fifty to two hundred and fifty' : 'workforce of more than two hundred and fifty'}`, sub: 'Who owns what — sized to your organisation, not a corporate org chart pasted in.' }
    ];
    if (q.testing_today !== 'no') {
      lockedItems.splice(2, 0, { icon: 'lock', title: 'Random testing needs a documented selection method', sub: 'Random and unannounced are not the same thing — and an unfair selection method is where testing programmes get challenged.' });
    }
    return { items, lockedItems };
  }

  function policyAgeFlag() {
    const q = state.quiz;
    if (q.policy_today === 'none') return {
      tone: 'warn',
      text: 'There is no written policy today. Without one, testing is very hard to defend, and the duty to provide a safe system of work is largely undocumented. The good news: starting fresh means no legacy wording to untangle.'
    };
    if (q.policy_today === 'old') return {
      tone: 'warn',
      text: 'A policy over two years old commonly predates three things: prescribed medicinal cannabis, the enforcement reality of the Psychoactive Substances Act 2016, and current expectations on random selection methodology. Worth checking yours against all three.'
    };
    return {
      tone: 'ok',
      text: 'A recently reviewed policy is a strong position. The snapshot below is still worth a look — it shows what a complete policy covers, so you can check nothing is missing.'
    };
  }

  function showSnapshot() {
    state.step = 0;
    sections.forEach(id => { document.getElementById(id).hidden = true; });
    document.querySelector('.stepper').hidden = true;
    document.getElementById('quiz').hidden = true;
    const panel = document.getElementById('snapshot');
    panel.hidden = false;
    renderSnapshot();
    updateMobileBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSnapshot() {
    const panel = document.getElementById('snapshot');
    const { items, lockedItems } = snapshotItems();
    const flag = policyAgeFlag();
    const sectorNote = SECTOR_NOTES[state.quiz.sector];

    const openHtml = items.map(it => `
      <div class="snap-item">
        <span class="snap-icon">${icon(it.icon, 18)}</span>
        <div><strong>${it.title}</strong>${it.body}</div>
      </div>`).join('');

    const lockedHtml = lockedItems.map(it => `
      <div class="snap-item ${state.unlocked ? '' : 'locked'}">
        <span class="snap-icon">${icon(state.unlocked ? 'check' : 'lock', 18)}</span>
        <div><strong>${it.title}</strong><p>${it.sub}</p></div>
      </div>`).join('');

    panel.innerHTML = `
      <div class="panel-head">
        <p class="marker">Your policy snapshot</p>
        <h1>Here is what your policy has to get right</h1>
        <p class="lede">Built from your answers — ${JURISDICTIONS[state.quiz.jurisdiction].name}, ${headcountLabel()}, ${sectorLabel()}.</p>
      </div>
      <div class="notice ${flag.tone === 'warn' ? 'notice-warn' : ''}">${icon(flag.tone === 'warn' ? 'alert' : 'check', 18)}<p>${flag.text}</p></div>
      <div class="notice">${icon('info', 18)}<p>${sectorNote}</p></div>
      <div class="snap-list">
        ${openHtml}
        ${state.unlocked ? '' : `<p class="snap-locked-label">${icon('lock', 14)} Four more items are in your full snapshot — free, emailed to you</p>`}
        ${lockedHtml}
      </div>
      ${state.unlocked ? teaserHtml() : gateHtml()}
      <p class="gate-small snap-disclaimer">The snapshot and the policy builder provide template documents and general information for your organisation to review — they are not legal advice.</p>`;

    if (!state.unlocked) bindGate(panel);
    else bindTeaser(panel);
  }

  const headcountLabel = () => ({ micro: '1 to 10 people', small: '11 to 50 people', medium: '51 to 250 people', large: 'more than 250 people' }[state.quiz.headcount]);
  const sectorLabel = () => ({ construction: 'construction and trades', transport: 'transport and logistics', manufacturing: 'manufacturing and engineering', care: 'health, care and education', office: 'office and professional services', other: 'your sector' }[state.quiz.sector]);

  /* ---------------- email gate ---------------- */
  function gateHtml() {
    return `
      <div class="gate-card" id="gate-card">
        <h2>Get the full snapshot — free</h2>
        <p>Everything above plus the four locked items, as a tidy PDF for your board or your files. We also draft your policy statement paragraph as a taste of the full builder.</p>
        <div class="gate-form">
          <input type="text" id="gate-company" placeholder="Organisation name" autocomplete="organization" value="${esc(state.lead.company)}">
          <input type="email" id="gate-email" placeholder="you@organisation.co.uk" autocomplete="email" value="${esc(state.lead.email)}">
          <button class="btn primary" id="gate-send">Email my snapshot</button>
        </div>
        <p class="gate-error" id="gate-error" hidden>Enter your organisation name and a valid email address.</p>
        <p class="gate-small">We use these details to send your snapshot and to follow up about your policy. How we handle personal information is set out in our <a href="/privacy" target="_blank" rel="noopener">privacy notice</a>.</p>
      </div>
      <div class="dev-fill-bar gate-dev">
        <span>Prototype helper — skip the email step</span>
        <button type="button" class="btn small ghost" id="dev-gate">Unlock the snapshot</button>
      </div>`;
  }

  function bindGate(panel) {
    panel.querySelector('#gate-send').addEventListener('click', () => {
      const email = panel.querySelector('#gate-email').value.trim();
      const company = panel.querySelector('#gate-company').value.trim();
      if (!company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        panel.querySelector('#gate-error').hidden = false;
        return;
      }
      unlock(email, company);
    });
    panel.querySelector('#dev-gate').addEventListener('click', () => unlock('test@example.com', 'Example Contracts Ltd'));
  }

  function unlock(email, company) {
    state.lead = { email: email.toLowerCase(), company };
    state.unlocked = true;
    state.details.contactEmail = state.details.contactEmail || state.lead.email;
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(state.lead)); } catch (e) {}
    renderSnapshot();
    const t = document.querySelector('.teaser-clause');
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------------- teaser clause ---------------- */
  function teaserClauseText() {
    const co = state.lead.company || 'The organisation';
    const q = state.quiz;
    const acts = {
      ni: 'the Health and Safety at Work (Northern Ireland) Order 1978',
      gb: 'the Health and Safety at Work etc. Act 1974',
      roi: 'the Safety, Health and Welfare at Work Act 2005',
      uk_roi: 'health and safety at work legislation in each jurisdiction in which it operates'
    }[q.jurisdiction];
    const sc = q.safety_critical !== 'no'
      ? ` Because some of the work ${co} does is safety-critical, any impairment in that work presents an immediate risk to life — and this policy applies its strictest standard to it.`
      : '';
    return `${co} is committed to providing a safe, healthy and productive working environment for everyone who works for it, everyone who works alongside it, and everyone its work touches. No one may attend work, or carry out work, while their ability to do so safely is impaired by alcohol or drugs.${sc} This commitment is made under ${acts}, and it is matched by a commitment in return: anyone who comes forward about a problem with alcohol or drugs before it becomes a conduct matter will be met with support, not punishment.`;
  }

  function teaserHtml() {
    return `
      <div class="success-banner">${icon('check', 20)}
        <div>
          <strong>Snapshot sent to ${esc(state.lead.email)}</strong>
          <span>Prototype — the email send is simulated at this stage.</span>
        </div>
      </div>
      <div class="teaser-clause">
        <p class="marker">${icon('doc', 15)} Drafted from your answers — section 2 of your policy</p>
        <blockquote>${esc(teaserClauseText())}</blockquote>
        <p class="teaser-note">That is one paragraph of a fifteen-section document. The full builder tailors every section the same way — your jurisdiction, your roles, your testing programme, your names and dates.</p>
      </div>
      <div class="gate-card snap-cta">
        <h2>Your snapshot PDF is on its way — the full policy is ${gbp(POLICY_PRICE)} + VAT</h2>
        <p>The snapshot tells you what your policy has to cover. The builder writes it: about four minutes of questions and your answers become the complete tailored policy — fifteen sections, two appendices, aligned to EWDTS guidelines — delivered as a Word and PDF document.</p>
        <div class="sum-rows">
          <div class="sum-row"><span>Tailored policy document</span><span>${gbp(POLICY_PRICE)} + VAT</span></div>
          <div class="sum-row"><span>Supporting document pack</span><span>optional, from ${gbp(PACK_ITEM_PRICE)} + VAT</span></div>
        </div>
        <button class="btn primary full" id="start-builder">Start building — ${gbp(POLICY_PRICE)} + VAT</button>
        <p class="gate-small">NIVHA testing clients get a discounted rate — there is a code box at review. Payment is taken at the end, once you have seen exactly what the document contains.</p>
      </div>`;
  }

  function bindTeaser(panel) {
    panel.querySelector('#start-builder').addEventListener('click', startBuilder);
  }

  function startBuilder() {
    /* carry quiz answers into the paid state */
    if (state.testingEnabled === null) {
      state.testingEnabled = state.quiz.testing_today === 'no' ? 'reserve' : 'active';
    }
    document.querySelector('.stepper').hidden = false;
    goTo(1);
  }

  /* ================================================================
     PAID WIZARD
     ================================================================ */

  /* ---------------- step 1 — stance ---------------- */
  function renderStance() {
    const scNote = state.quiz.safety_critical !== 'no'
      ? `<div class="notice">${icon('info', 18)}<p>Whichever stance you choose, safety-critical work keeps the strictest standard — a supportive policy never softens it. The document handles this automatically.</p></div>`
      : '';
    document.getElementById('stance-body').innerHTML = `
      <h2 class="form-section-head">The organisation's position</h2>
      <div class="radio-cards">
        <button class="radio-card stance-card ${state.stance === 'zero_tolerance' ? 'selected' : ''}" data-stance="zero_tolerance">
          <span class="radio-title">Zero tolerance</span>
          <span class="radio-sub">Any confirmed policy breach is treated as gross misconduct. Clear, strict, common in safety-led sectors.</span>
        </button>
        <button class="radio-card stance-card ${state.stance === 'support_first' ? 'selected' : ''}" data-stance="support_first">
          <span class="radio-title">Support first</span>
          <span class="radio-sub">Voluntary disclosure is met with support and a route back to work. Breaches still carry consequences — the emphasis differs.</span>
        </button>
      </div>
      ${scNote}
      <h2 class="form-section-head">Alcohol at work events</h2>
      <div class="radio-cards">
        <button class="radio-card ${state.alcoholEvents === 'none' ? 'selected' : ''}" data-alc="none">
          <span class="radio-title">No alcohol at any work event</span>
          <span class="radio-sub">The simplest rule to communicate and enforce.</span>
        </button>
        <button class="radio-card ${state.alcoholEvents === 'authorised' ? 'selected' : ''}" data-alc="authorised">
          <span class="radio-title">Permitted at authorised events only</span>
          <span class="radio-sub">Management-authorised occasions, with fitness for any further duties still required.</span>
        </button>
      </div>`;
    const body = document.getElementById('stance-body');
    body.querySelectorAll('[data-stance]').forEach(el =>
      el.addEventListener('click', () => { state.stance = el.dataset.stance; renderStance(); }));
    body.querySelectorAll('[data-alc]').forEach(el =>
      el.addEventListener('click', () => { state.alcoholEvents = el.dataset.alc; renderStance(); }));
    const next = document.getElementById('to-step-2');
    next.disabled = !(state.stance && state.alcoholEvents);
  }

  document.getElementById('to-step-2').addEventListener('click', () => {
    if (state.stance && state.alcoholEvents) goTo(2);
  });

  /* ---------------- step 2 — testing programme ---------------- */
  function checkRow(group, id, name, sub, checked) {
    return `
      <label class="check-row">
        <input type="checkbox" data-group="${group}" value="${id}" ${checked ? 'checked' : ''}>
        <div><strong>${name}</strong>${sub ? `<p>${sub}</p>` : ''}</div>
      </label>`;
  }

  function renderTesting() {
    const active = state.testingEnabled === 'active';
    const showSc = state.quiz.safety_critical !== 'no';
    document.getElementById('testing-body').innerHTML = `
      <h2 class="form-section-head">Does the policy include an active testing programme?</h2>
      <div class="radio-cards">
        <button class="radio-card ${active ? 'selected' : ''}" data-ten="active">
          <span class="radio-title">Yes — an active programme</span>
          <span class="radio-sub">The policy sets out when testing happens and how it is run.</span>
        </button>
        <button class="radio-card ${state.testingEnabled === 'reserve' ? 'selected' : ''}" data-ten="reserve">
          <span class="radio-title">Not yet — reserve the right</span>
          <span class="radio-sub">The policy reserves the right to introduce testing, so starting later does not need a rewrite.</span>
        </button>
      </div>
      ${active ? `
        <h2 class="form-section-head">When can testing happen?</h2>
        <div class="check-items">
          ${TESTING_TYPES.map(t => checkRow('testingTypes', t.id, t.name, t.sub, state.testingTypes.includes(t.id))).join('')}
        </div>
        ${state.testingTypes.includes('random') ? `
          <h2 class="form-section-head">How are people selected for random testing?</h2>
          <div class="radio-cards">
            <button class="radio-card ${state.randomMethod === 'independent_random' ? 'selected' : ''}" data-rnd="independent_random">
              <span class="radio-title">Independent random selection</span>
              <span class="radio-sub">A documented, computer-generated selection no one in the organisation can influence.</span>
            </button>
            <button class="radio-card ${state.randomMethod === 'whole_site' ? 'selected' : ''}" data-rnd="whole_site">
              <span class="radio-title">Whole site or shift, unannounced</span>
              <span class="radio-sub">Everyone present is tested — no individual selection takes place.</span>
            </button>
          </div>` : ''}
        <h2 class="form-section-head">Which sample types?</h2>
        <p class="field-hint">Every sample is collected under chain of custody and confirmed by an accredited laboratory before anything is reported.</p>
        <div class="check-items sample-checks">
          ${SAMPLE_TYPES.map(t => checkRow('sampleTypes', t.id, t.name, '', state.sampleTypes.includes(t.id))).join('')}
        </div>
        <h2 class="form-section-head">Who runs your testing?</h2>
        <div class="radio-cards">
          <button class="radio-card ${state.provider === 'nivha' ? 'selected' : ''}" data-prov="nivha">
            <span class="radio-title">NIVHA</span>
            <span class="radio-sub">The policy names NIVHA Laboratory Services as the testing provider.</span>
          </button>
          <button class="radio-card ${state.provider === 'other' ? 'selected' : ''}" data-prov="other">
            <span class="radio-title">Another provider</span>
            <span class="radio-sub">The policy refers to your appointed provider generically.</span>
          </button>
          <button class="radio-card ${state.provider === 'undecided' ? 'selected' : ''}" data-prov="undecided">
            <span class="radio-title">No provider yet</span>
            <span class="radio-sub">The policy stays provider-neutral — and a case manager can talk you through options, no obligation.</span>
          </button>
        </div>` : `
        <div class="notice">${icon('info', 18)}<p>The policy will state that the organisation reserves the right to introduce testing with notice — the recognised way to keep the door open without running a programme today.</p></div>`}
      ${showSc ? `
        <h2 class="form-section-head">Which work is safety-critical?</h2>
        <p class="field-hint">Tick what applies — each becomes a designated category in section 8.</p>
        <div class="check-items">
          ${SC_TYPES.map(t => checkRow('scTypes', t.id, t.name, '', state.scTypes.includes(t.id))).join('')}
        </div>
        <h2 class="form-section-head">Who does the stricter standard apply to?</h2>
        <div class="radio-cards">
          <button class="radio-card ${state.scScope === 'subset' ? 'selected' : ''}" data-scope="subset">
            <span class="radio-title">Designated roles only</span>
            <span class="radio-sub">The stricter standard applies to the safety-critical work above.</span>
          </button>
          <button class="radio-card ${state.scScope === 'all_staff' ? 'selected' : ''}" data-scope="all_staff">
            <span class="radio-title">Everyone</span>
            <span class="radio-sub">The organisation treats all roles to the same strict standard — with the rationale stated.</span>
          </button>
        </div>` : ''}
      <div class="panel-actions">
        <button class="btn ghost" data-back-2>Back</button>
        <button class="btn primary" id="to-step-3">Continue — support</button>
      </div>`;

    const body = document.getElementById('testing-body');
    body.querySelectorAll('[data-ten]').forEach(el =>
      el.addEventListener('click', () => { state.testingEnabled = el.dataset.ten; renderTesting(); renderSummary(2); }));
    body.querySelectorAll('[data-rnd]').forEach(el =>
      el.addEventListener('click', () => { state.randomMethod = el.dataset.rnd; renderTesting(); }));
    body.querySelectorAll('[data-prov]').forEach(el =>
      el.addEventListener('click', () => { state.provider = el.dataset.prov; renderTesting(); renderSummary(2); }));
    body.querySelectorAll('[data-scope]').forEach(el =>
      el.addEventListener('click', () => { state.scScope = el.dataset.scope; renderTesting(); }));
    body.querySelectorAll('input[type="checkbox"]').forEach(inp =>
      inp.addEventListener('change', () => {
        const arr = state[inp.dataset.group];
        const i = arr.indexOf(inp.value);
        if (inp.checked && i === -1) arr.push(inp.value);
        if (!inp.checked && i > -1) arr.splice(i, 1);
        if (inp.dataset.group === 'testingTypes' && inp.value === 'random') renderTesting();
        renderSummary(2);
      }));
    body.querySelector('[data-back-2]').addEventListener('click', () => goTo(1));
    body.querySelector('#to-step-3').addEventListener('click', () => {
      if (!validateTesting()) return;
      goTo(3);
    });
  }

  function validateTesting() {
    if (state.testingEnabled === 'active') {
      if (!state.testingTypes.length) { alertNotice('Choose at least one occasion when testing can happen.'); return false; }
      if (!state.sampleTypes.length) { alertNotice('Choose at least one sample type.'); return false; }
      if (!state.provider) { alertNotice('Tell us who runs your testing — "no provider yet" is a fine answer.'); return false; }
    }
    return true;
  }

  function alertNotice(msg) {
    const body = document.getElementById('testing-body');
    let n = body.querySelector('.notice-inline-error');
    if (!n) {
      n = document.createElement('div');
      n.className = 'notice notice-warn notice-inline-error';
      body.querySelector('.panel-actions').before(n);
    }
    n.innerHTML = `${icon('alert', 18)}<p>${msg}</p>`;
    n.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------------- step 3 — support ---------------- */
  function yesNo(key, label, hint, extra) {
    const val = state.support[key];
    return `
      <h2 class="form-section-head">${label}</h2>
      ${hint ? `<p class="field-hint">${hint}</p>` : ''}
      <div class="radio-cards">
        <button class="radio-card ${val === 'yes' ? 'selected' : ''}" data-sup="${key}" data-val="yes"><span class="radio-title">Yes</span>${extra && extra.yes ? `<span class="radio-sub">${extra.yes}</span>` : ''}</button>
        <button class="radio-card ${val === 'no' ? 'selected' : ''}" data-sup="${key}" data-val="no"><span class="radio-title">No</span>${extra && extra.no ? `<span class="radio-sub">${extra.no}</span>` : ''}</button>
      </div>`;
  }

  function renderSupport() {
    document.getElementById('support-body').innerHTML = `
      ${yesNo('eap', 'Is there an employee assistance programme?', 'A confidential helpline or counselling service your people can use.', { yes: 'The policy points people to it by name.', no: 'The policy points to the GP and recognised charities instead.' })}
      ${yesNo('oh', 'Is there occupational health support?', null, { yes: 'Occupational health handles fitness-for-work referrals.', no: 'Referrals route through management and external providers.' })}
      ${yesNo('selfReferral', 'Protect people who come forward voluntarily?', 'The strongest lever a policy has for surfacing problems early.', { yes: 'Recommended — voluntary disclosure before an incident or a test is met with support, not discipline.', no: 'Disclosure carries no special protection. Less common, and it tends to drive problems underground.' })}
      <div class="panel-actions">
        <button class="btn ghost" data-back-3>Back</button>
        <button class="btn primary" id="to-step-4">Continue — governance</button>
      </div>`;
    const body = document.getElementById('support-body');
    body.querySelectorAll('[data-sup]').forEach(el =>
      el.addEventListener('click', () => { state.support[el.dataset.sup] = el.dataset.val; renderSupport(); }));
    body.querySelector('[data-back-3]').addEventListener('click', () => goTo(2));
    body.querySelector('#to-step-4').addEventListener('click', () => {
      if (state.support.eap && state.support.oh && state.support.selfReferral) goTo(4);
    });
  }

  /* ---------------- step 4 — governance + contacts ---------------- */
  function field(id, label, opts = {}) {
    const { type = 'text', required = false, hint = '', placeholder = '' } = opts;
    return `
      <div class="form-field" data-field="${id}">
        <label for="${id}">${label}${required ? '' : ' <span class="optional">optional</span>'}</label>
        ${hint ? `<p class="field-hint">${hint}</p>` : ''}
        <input type="${type}" id="${id}" name="${id}" placeholder="${placeholder}" value="${esc(state.details[id])}" ${required ? 'required' : ''} autocomplete="off">
        <p class="field-error" hidden>This is needed to generate the policy.</p>
      </div>`;
  }

  function renderGovForm() {
    const form = document.getElementById('gov-form');
    form.innerHTML = `
      <h2 class="form-section-head">The organisation</h2>
      ${field('company', 'Organisation name as it should appear in the policy', { required: true })}
      <div class="form-2col">
        ${field('policyOwner', 'Who owns this policy', { required: true, hint: 'A role, not a person — for example managing director or HR manager.', placeholder: 'Managing director' })}
        ${field('dpContact', 'Data protection contact', { required: true, hint: 'Who answers questions about test results and personal data.', placeholder: 'Office manager' })}
      </div>
      <h2 class="form-section-head">Review cycle</h2>
      <div class="radio-cards">
        <button type="button" class="radio-card ${state.details.reviewCycle === '12' ? 'selected' : ''}" data-cycle="12"><span class="radio-title">Every 12 months</span><span class="radio-sub">Recommended — testing practice and case law move quickly.</span></button>
        <button type="button" class="radio-card ${state.details.reviewCycle === '24' ? 'selected' : ''}" data-cycle="24"><span class="radio-title">Every 24 months</span><span class="radio-sub">The outer edge of what is defensible.</span></button>
      </div>
      <h2 class="form-section-head">Where we send the documents</h2>
      ${field('contactName', 'Your name', { required: true })}
      ${field('contactEmail', 'Email address', { type: 'email', required: true, hint: 'The finished policy is delivered here as a Word and PDF document.' })}
      ${field('contactPhone', 'Phone number', { type: 'tel' })}
      <div class="dev-fill-bar">
        <span>Prototype helper</span>
        <button type="button" class="btn small ghost" id="dev-fill">Fill sample details</button>
      </div>
      <div class="panel-actions">
        <button type="button" class="btn ghost" data-back-4>Back</button>
        <button type="button" class="btn primary" id="to-step-5">Continue — review</button>
      </div>`;

    if (!state.details.company && state.lead.company) state.details.company = state.lead.company;
    const co = form.querySelector('#company');
    if (co && !co.value) co.value = state.lead.company;

    form.querySelectorAll('input').forEach(inp =>
      inp.addEventListener('input', () => { state.details[inp.id] = inp.value; }));
    form.addEventListener('submit', e => e.preventDefault());
    form.querySelectorAll('[data-cycle]').forEach(el =>
      el.addEventListener('click', () => { state.details.reviewCycle = el.dataset.cycle; renderGovForm(); }));
    form.querySelector('[data-back-4]').addEventListener('click', () => goTo(3));
    form.querySelector('#to-step-5').addEventListener('click', () => {
      if (validateGov()) goTo(5);
    });
    form.querySelector('#dev-fill').addEventListener('click', () => {
      Object.assign(state.details, {
        company: state.lead.company || 'Example Contracts Ltd',
        policyOwner: 'Managing director',
        dpContact: 'Office manager',
        contactName: 'Chris Elliott',
        contactEmail: state.lead.email || 'chris@example.co.uk',
        contactPhone: '028 9018 0000'
      });
      renderGovForm();
    });
  }

  function validateGov() {
    const form = document.getElementById('gov-form');
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

  /* ---------------- totals ---------------- */
  function computeTotals() {
    const allPack = state.packItems.length === PACK_ITEMS.length;
    const packNet = allPack ? PACK_BUNDLE_PRICE : state.packItems.length * PACK_ITEM_PRICE;
    let net = POLICY_PRICE + packNet;
    let discount = 0;
    if (state.clientApplied) {
      discount = Math.round(net * CLIENT_DISCOUNT * 100) / 100;
      net = net - discount;
    }
    const vat = Math.round(net * VAT_RATE * 100) / 100;
    return { policy: POLICY_PRICE, packNet, allPack, discount, net, vat, total: Math.round((net + vat) * 100) / 100 };
  }

  /* ---------------- summary aside ---------------- */
  function summaryRows() {
    const q = state.quiz;
    const rows = [
      ['Jurisdiction', JURISDICTIONS[q.jurisdiction].name],
      ['Workforce', headcountLabel()],
      ['Stance', state.stance ? (state.stance === 'zero_tolerance' ? 'Zero tolerance' : 'Support first') : '\u2014'],
      ['Testing', state.testingEnabled === 'active'
        ? (state.testingTypes.length ? state.testingTypes.length + ' occasion' + (state.testingTypes.length === 1 ? '' : 's') + ' drafted' : 'Active programme')
        : 'Right reserved']
    ];
    if (state.provider === 'undecided') rows.push(['Provider', 'To be decided']);
    if (state.provider === 'nivha') rows.push(['Provider', 'NIVHA']);
    return rows;
  }

  function renderSummary(step) {
    const el = document.getElementById('summary-' + step);
    if (!el) return;
    const tot = computeTotals();
    el.innerHTML = `
      <div class="summary-card">
        <h2>Your policy</h2>
        <div class="sum-rows">
          ${summaryRows().map(r => `<div class="sum-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}
        </div>
        <div class="sum-totals">
          <div class="sum-row"><span>Policy document</span><span>${gbp(tot.policy)}</span></div>
          ${tot.packNet ? `<div class="sum-row"><span>Document pack${tot.allPack ? ' (all five)' : ''}</span><span>${gbp(tot.packNet)}</span></div>` : ''}
          ${tot.discount ? `<div class="sum-row"><span>NIVHA client rate</span><span>\u2212${gbp(tot.discount)}</span></div>` : ''}
          <div class="sum-row"><span>VAT at 20%</span><span>${gbp(tot.vat)}</span></div>
          <div class="sum-row grand"><span>Total</span><span>${gbp(tot.total)}</span></div>
        </div>
        <p class="sum-note">${icon('doc', 14)} Delivered as a Word and PDF document, drafted from your answers.</p>
      </div>`;
  }

  /* ---------------- step 5 — review ---------------- */
  function docVariantNotes() {
    const q = state.quiz;
    const notes = {};
    notes['2'] = state.stance === 'zero_tolerance' ? 'Zero tolerance statement' : 'Support-first statement';
    notes['4'] = JURISDICTIONS[q.jurisdiction].name + ' legal framework';
    notes['5'] = (q.headcount === 'micro' || q.headcount === 'small') ? 'Sized for a smaller team' : 'Full responsibilities structure';
    notes['6'] = state.alcoholEvents === 'none' ? 'No alcohol at work events' : 'Authorised events only';
    notes['8'] = q.safety_critical === 'no' ? 'Recorded as not applicable — with the reasoning stated'
      : (state.scScope === 'all_staff' ? 'Strict standard applied to everyone, rationale stated' : state.scTypes.length + ' designated categor' + (state.scTypes.length === 1 ? 'y' : 'ies'));
    notes['9'] = state.testingEnabled === 'active'
      ? [state.testingTypes.length + ' testing occasion' + (state.testingTypes.length === 1 ? '' : 's'),
         state.sampleTypes.length + ' sample type' + (state.sampleTypes.length === 1 ? '' : 's'),
         'EWDTS chain of custody, laboratory confirmation, medical review, B sample'].join(' \u00b7 ')
      : 'Right to introduce testing reserved';
    notes['11'] = state.support.selfReferral === 'yes' ? 'Voluntary disclosure protected' : 'Standard support wording';
    notes['12'] = q.jurisdiction === 'roi' ? 'EU GDPR wording' : (q.jurisdiction === 'uk_roi' ? 'UK and EU GDPR wording' : 'UK GDPR wording');
    notes['15'] = 'Reviewed every ' + state.details.reviewCycle + ' months';
    notes['B'] = state.packItems.length ? state.packItems.length + ' supporting document' + (state.packItems.length === 1 ? '' : 's') + ' included' : 'No supporting documents selected';
    return notes;
  }

  function renderDocMap() {
    const notes = docVariantNotes();
    const co = state.details.company || state.lead.company || 'Your organisation';
    document.getElementById('doc-map').innerHTML = `
      <div class="doc">
        <div class="doc-head">
          <div class="doc-brand">
            <span class="doc-brand-name">Drug and alcohol policy</span>
            <span class="doc-brand-sub">${esc(co)} \u00b7 prepared by NIVHA Laboratory Services</span>
          </div>
          <span class="doc-label">Document map</span>
        </div>
        <table class="doc-table doc-map-table">
          <tbody>
            ${DOC_SECTIONS.map(s => `
              <tr>
                <td class="num">${s.num}</td>
                <td><strong>${s.title}</strong>${notes[s.num] ? `<span class="doc-subline">${notes[s.num]}</span>` : ''}</td>
                <td class="doc-included">${icon('check', 15)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p class="doc-small">Scientific figures such as laboratory cut-off levels are confirmed against the current NIVHA laboratory schedule at generation and shown in a versioned appendix. The document carries a version stamp and a review date ${state.details.reviewCycle} months out.</p>
      </div>`;
  }

  function renderPackUpsell() {
    const tot = computeTotals();
    document.getElementById('pack-upsell').innerHTML = `
      <h2 class="form-section-head">Add the supporting documents</h2>
      <p class="field-hint">A policy nobody has heard of protects nobody. These are how it lands with your people — each tailored with your organisation's name and choices. ${gbp(PACK_ITEM_PRICE)} + VAT each, or all five for ${gbp(PACK_BUNDLE_PRICE)} + VAT.</p>
      <div class="check-items">
        ${PACK_ITEMS.map(p => `
          <label class="check-row">
            <input type="checkbox" data-pack="${p.id}" ${state.packItems.includes(p.id) ? 'checked' : ''}>
            <div><strong>${p.name}</strong><p>${p.sub}</p></div>
          </label>`).join('')}
      </div>
      ${tot.allPack ? `<div class="notice">${icon('check', 18)}<p>Full pack selected — bundle price applied, saving ${gbp(PACK_ITEMS.length * PACK_ITEM_PRICE - PACK_BUNDLE_PRICE)}.</p></div>` : ''}`;
    document.querySelectorAll('[data-pack]').forEach(inp =>
      inp.addEventListener('change', () => {
        const i = state.packItems.indexOf(inp.dataset.pack);
        if (inp.checked && i === -1) state.packItems.push(inp.dataset.pack);
        if (!inp.checked && i > -1) state.packItems.splice(i, 1);
        renderDocMap(); renderPackUpsell(); renderClientCode(); renderDeclaration();
      }));
  }

  function renderClientCode() {
    document.getElementById('client-code-box').innerHTML = `
      <h2 class="form-section-head">NIVHA client code</h2>
      <p class="field-hint">Testing clients get the client rate — the code is on your latest fee note or from your case manager.</p>
      <div class="gate-form code-form">
        <input type="text" id="client-code" placeholder="Client code" value="${esc(state.clientCode)}" ${state.clientApplied ? 'disabled' : ''}>
        <button class="btn ${state.clientApplied ? 'ghost' : 'outline'}" id="apply-code" ${state.clientApplied ? 'disabled' : ''}>${state.clientApplied ? 'Client rate applied' : 'Apply code'}</button>
      </div>
      <p class="gate-error" id="code-error" hidden>That code is not recognised — check your latest fee note, or continue without it.</p>`;
    document.getElementById('apply-code').addEventListener('click', () => {
      const v = document.getElementById('client-code').value.trim().toUpperCase();
      state.clientCode = v;
      if (v === DEMO_CLIENT_CODE) {
        state.clientApplied = true;
        renderClientCode(); renderDeclaration();
      } else {
        document.getElementById('code-error').hidden = false;
      }
    });
  }

  function renderDeclaration() {
    const tot = computeTotals();
    document.getElementById('declaration-box').innerHTML = `
      <div class="sum-totals">
        <div class="sum-row"><span>Policy document</span><span>${gbp(tot.policy)}</span></div>
        ${tot.packNet ? `<div class="sum-row"><span>Supporting documents${tot.allPack ? ' \u2014 full pack' : ''}</span><span>${gbp(tot.packNet)}</span></div>` : ''}
        ${tot.discount ? `<div class="sum-row"><span>NIVHA client rate (40% off)</span><span>\u2212${gbp(tot.discount)}</span></div>` : ''}
        <div class="sum-row"><span>VAT at 20%</span><span>${gbp(tot.vat)}</span></div>
        <div class="sum-row grand"><span>Total to pay</span><span>${gbp(tot.total)}</span></div>
      </div>
      <label class="check-row declaration-row">
        <input type="checkbox" id="accept" ${state.accepted ? 'checked' : ''}>
        <div><strong>I understand what I am buying</strong><p>A tailored template policy for ${esc(state.details.company || 'my organisation')} to review and adopt — not legal advice. NIVHA recommends the document is reviewed by the organisation before it takes effect.</p></div>
      </label>`;
    document.getElementById('accept').addEventListener('change', e => {
      state.accepted = e.target.checked;
      document.getElementById('submit-btn').disabled = !state.accepted;
    });
    document.getElementById('submit-btn').disabled = !state.accepted;
  }

  document.getElementById('submit-btn').addEventListener('click', () => {
    if (!state.accepted) return;
    if (!state.refNumber) state.refNumber = 'POL-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
    goTo(6);
  });

  /* ---------------- payment ---------------- */
  function renderCheckout() {
    const tot = computeTotals();
    document.getElementById('checkout').innerHTML = `
      <div class="panel-head">
        <p class="marker">Payment</p>
        <h1>Secure card payment</h1>
        <p class="lede">Order ${state.refNumber}. Payment is taken securely in advance — your documents are generated as soon as it clears.</p>
      </div>
      <div class="summary-card checkout-card">
        <h2>Drug and alcohol policy \u00b7 ${esc(state.details.company || state.lead.company)}</h2>
        <div class="sum-rows">
          <div class="sum-row"><span>Tailored policy document</span><span>${gbp(tot.policy)}</span></div>
          ${tot.packNet ? `<div class="sum-row"><span>Supporting documents${tot.allPack ? ' \u2014 full pack' : ''}</span><span>${gbp(tot.packNet)}</span></div>` : ''}
          ${tot.discount ? `<div class="sum-row"><span>NIVHA client rate</span><span>\u2212${gbp(tot.discount)}</span></div>` : ''}
          <div class="sum-row"><span>VAT at 20%</span><span>${gbp(tot.vat)}</span></div>
        </div>
        <div class="sum-totals">
          <div class="sum-row grand"><span>Total to pay</span><span>${gbp(tot.total)}</span></div>
        </div>
        <button class="btn primary full" id="pay-btn">${icon('lock', 16)} Pay ${gbp(tot.total)} securely</button>
        <p class="sum-note">${icon('card', 14)} Payment is processed by Stripe. NIVHA never sees your card details.</p>
        <p class="sum-note">Prototype — no card is charged at this stage.</p>
      </div>`;
    document.getElementById('pay-btn').addEventListener('click', () => {
      state.paid = true;
      goTo(7);
    });
  }

  /* ---------------- confirmation ---------------- */
  function renderConfirmation() {
    const tot = computeTotals();
    const d = state.details;
    const providerHook = state.provider === 'undecided' && state.testingEnabled === 'active';
    const steps = [
      ['Your policy is ready now', 'Drafted from your answers — download it below as a Word document' + (state.packItems.length ? ', with your ' + state.packItems.length + ' supporting document' + (state.packItems.length === 1 ? '' : 's') + ' to follow' : '') + '. A copy also goes to ' + esc(d.contactEmail || 'you') + '.'],
      ['Review and adopt', 'Read it, adjust anything that does not fit, and set the date it takes effect. The document carries its version stamp and a review date ' + d.reviewCycle + ' months out.'],
      ['Communicate it', state.packItems.includes('toolbox_talk') ? 'The toolbox talk and sign-off sheet give you evidence the policy was briefed to every team.' : 'A policy nobody has heard of protects nobody — brief it to every team and keep a record.']
    ];
    if (providerHook) steps.push(['A case manager will be in touch', 'You told us there is no testing provider yet. A NIVHA case manager will call to talk through what a programme would look like for ' + esc(d.company || 'your organisation') + ' — no obligation.']);

    document.getElementById('confirmation').innerHTML = `
      <div class="success-banner">${icon('check', 20)}
        <div>
          <strong>Payment received — your policy is on its way</strong>
          <span>Order ${state.refNumber} \u00b7 ${esc(d.company || state.lead.company)} \u00b7 ${gbp(tot.total)} inc. VAT</span>
        </div>
      </div>
      <ol class="process-strip confirm-strip" aria-label="What happens next">
        ${steps.map((s, i) => `<li><span class="ps-num">${i + 1}</span><div><strong>${s[0]}</strong><span>${s[1]}</span></div></li>`).join('')}
      </ol>
      <div class="panel-actions">
        <button class="btn primary" id="download-policy">${icon('doc', 16)} Download your policy (Word)</button>
        <a class="btn outline" href="/policy">Start another policy</a>
        <a class="btn ghost" href="/">Drug and alcohol testing</a>
      </div>
      <p class="gate-small" id="download-note">Generated from your answers just now — the same document that is emailed to you.</p>`;

    document.getElementById('download-policy').addEventListener('click', downloadPolicy);
  }

  async function downloadPolicy() {
    const btn = document.getElementById('download-policy');
    const note = document.getElementById('download-note');
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = 'Generating your policy\u2026';
    try {
      const res = await fetch('/api/policy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quiz: state.quiz, lead: state.lead, stance: state.stance,
          alcoholEvents: state.alcoholEvents, testingEnabled: state.testingEnabled,
          testingTypes: state.testingTypes, randomMethod: state.randomMethod,
          sampleTypes: state.sampleTypes, provider: state.provider,
          scTypes: state.scTypes, scScope: state.scScope, support: state.support,
          details: state.details, packItems: state.packItems, refNumber: state.refNumber
        })
      });
      if (!res.ok) throw new Error('generate failed');
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') || '';
      const m = dispo.match(/filename="([^"]+)"/);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : 'Drug-and-alcohol-policy.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      if (note) note.textContent = 'Something went wrong generating the document — please try again.';
    }
    btn.disabled = false;
    btn.innerHTML = label;
  }

  /* ---------------- mobile bar ---------------- */
  function updateMobileBar() {
    const bar = document.getElementById('mobile-total');
    const onPaid = state.step >= 1 && state.step <= 5;
    bar.hidden = !onPaid || window.innerWidth > 900;
    if (bar.hidden) return;
    const tot = computeTotals();
    document.getElementById('mt-count').textContent = 'Policy' + (state.packItems.length ? ' + ' + state.packItems.length + ' doc' + (state.packItems.length === 1 ? '' : 's') : '');
    document.getElementById('mt-amount').textContent = gbp(tot.total) + ' inc. VAT';
    const btn = document.getElementById('mt-continue');
    btn.onclick = () => {
      if (state.step === 1) document.getElementById('to-step-2').click();
      else if (state.step === 2) { const b = document.querySelector('#testing-body #to-step-3'); if (b) b.click(); }
      else if (state.step === 3) { const b = document.querySelector('#support-body #to-step-4'); if (b) b.click(); }
      else if (state.step === 4) { const b = document.querySelector('#gov-form #to-step-5'); if (b) b.click(); }
      else if (state.step === 5) document.getElementById('submit-btn').click();
    };
  }
  window.addEventListener('resize', updateMobileBar);

  /* ---------------- init ---------------- */
  try {
    const saved = JSON.parse(localStorage.getItem(LEAD_KEY) || 'null');
    if (saved && saved.email) state.lead = saved;
  } catch (e) {}
  renderQuiz();
})();
