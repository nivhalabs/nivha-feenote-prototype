/* NIVHA policy builder — staff review page data.
   Every question the builder asks and every clause the template can produce,
   quoted verbatim from js/policy.js, js/policy-catalogue.js and lib/policy-doc.js.
   Tokens in angle brackets mark details filled in from answers. */
'use strict';

/* Block shapes:
   ['p', text]                  plain paragraph
   ['hint', text]               muted hint (as shown to buyers)
   ['copy', text]               verbatim copy block
   ['opts', [[title, sub], …]]  answer cards / checkboxes as shown
   ['bullets', [text, …]]       bulleted verbatim list
   ['table', [[a, b], …], hasHead]  two-column table
   ['variant', label, [blocks]] wording used only when the label applies
   ['flag', text]               a point flagged for staff review
   ['note', text]               neutral explanatory note                     */

const REVIEW_PARTS = [
{
  id: 'part-questions',
  title: 'Part 1 — what the builder asks',
  intro: 'Every question, option and piece of on-screen copy a buyer sees, in the order they see it. Wording in the shaded blocks is verbatim. Where an answer changes the finished document, the item says which sections it shapes.',
  groups: [
  {
    id: 'g-quiz', title: 'The free health check',
    items: [
      { ref: 'FC-0', title: 'Page opening copy', blocks: [
        ['copy', 'Does your drug and alcohol policy hold up?'],
        ['copy', 'Six quick questions — no email needed. You get an instant, personalised snapshot of what a policy like yours typically needs to cover, built from the same framework we use for workplace testing under EWDTS guidelines.'],
        ['note', 'Page meta description: "Check your workplace drug and alcohol policy in two minutes, then build a tailored starter policy structured with reference to EWDTS guidelines — for Northern Ireland, Great Britain and the Republic of Ireland."'],
      ]},
      { ref: 'Q1', title: 'Where do your people work?', badges: ['multi-select'], blocks: [
        ['hint', 'Select all that apply. The legal framework your policy must cite depends on where people are employed — one policy covers every jurisdiction you pick.'],
        ['opts', [['Northern Ireland', ''], ['Great Britain', ''], ['Republic of Ireland', '']]],
        ['note', 'Shapes section 4 (legal framework), section 11 (jurisdiction-specific dependency clauses), section 12 (UK or EU GDPR wording), section 14.2 (fair-process codes) and the acts cited in the drafted policy statement paragraph.'],
      ]},
      { ref: 'Q2', title: 'How many people work for the organisation?', blocks: [
        ['hint', 'Counting employees, and contractors if you use them.'],
        ['opts', [['1 to 10', ''], ['11 to 50', ''], ['51 to 250', ''], ['More than 250', '']]],
        ['note', 'Shapes section 5 — up to 50 people gets a compact three-row responsibilities table; 51 and above gets the full structure with senior management and human resources.'],
      ]},
      { ref: 'Q3', title: 'Which is closest to what you do?', blocks: [
        ['opts', [['Construction and trades', ''], ['Transport and logistics', ''], ['Manufacturing and engineering', ''], ['Health, care and education', ''], ['Office and professional services', ''], ['Something else', '']]],
        ['note', 'Shapes the sector note on the snapshot, and section 4 — transport and logistics adds the statutory transport testing regimes clause.'],
      ]},
      { ref: 'Q4', title: 'Do any roles involve safety-critical work?', blocks: [
        ['hint', 'Driving for work, operating machinery, working at height, care of vulnerable people — work where impairment could cost a life.'],
        ['opts', [['Yes', ''], ['No', ''], ['Not sure', '']]],
        ['note', 'Decides whether section 8 exists, which safety-critical snapshot item shows, whether the stance-step notice appears, and whether the safety-critical questions are asked in step 2. "Not sure" is treated like yes for the questions — the wizard helps the buyer decide.'],
      ]},
      { ref: 'Q5', title: 'Does the organisation test for drugs or alcohol today?', blocks: [
        ['opts', [['Yes, we test', ''], ['No, but we are considering it', ''], ['No, and no plans to', '']]],
        ['note', 'Sets the default answer for "active programme or reserve the right" in step 2 ("No, and no plans to" defaults to reserve), and whether the random-selection snapshot item shows.'],
      ]},
      { ref: 'Q6', title: 'Does a written drug and alcohol policy exist today?', blocks: [
        ['opts', [['No policy', ''], ['Yes, but over two years old', ''], ['Yes, reviewed recently', '']]],
        ['note', 'Decides which of the three policy-age flags opens the snapshot — see "Policy age flag" below.'],
      ]},
    ],
  },
  {
    id: 'g-snapshot', title: 'The snapshot, email gate and teaser',
    items: [
      { ref: 'SN-1', title: 'Snapshot heading', blocks: [
        ['copy', 'Your policy snapshot'],
        ['copy', 'Here is what your policy has to get right'],
        ['copy', 'Built from your answers — ⟨jurisdiction⟩, ⟨workforce size⟩, ⟨sector⟩.'],
      ]},
      { ref: 'SN-2', title: 'Policy age flag', blocks: [
        ['variant', 'No policy today', [
          ['copy', 'There is no written policy today. Without one, testing is very hard to defend, and the duty to provide a safe system of work is largely undocumented. The good news: starting fresh means no legacy wording to untangle.'],
        ]],
        ['variant', 'Policy over two years old', [
          ['copy', 'A policy over two years old commonly predates three things: prescribed medicinal cannabis, the enforcement reality of the Psychoactive Substances Act 2016, and current expectations on random selection methodology. Worth checking yours against all three.'],
        ]],
        ['variant', 'Reviewed recently', [
          ['copy', 'A recently reviewed policy is a strong position. The snapshot below is still worth a look — it shows the ground a policy like yours typically covers, so you can check nothing is missing.'],
        ]],
      ]},
      { ref: 'SN-3', title: 'Sector notes', blocks: [
        ['table', [
          ['Construction and trades', 'On construction sites, for-cause and post-incident testing arrangements are increasingly expected by principal contractors — many main contractors now ask to see your policy at pre-qualification.'],
          ['Transport and logistics', 'Where people drive for work, road traffic law sits alongside workplace law — and your policy needs to separate the two clearly.'],
          ['Manufacturing and engineering', 'Around plant and machinery, an impairment-at-work standard on its own is hard to operate — designated safety-critical roles with a stricter standard are the recognised approach.'],
          ['Health, care and education', 'Where your people care for vulnerable people, regulators and commissioners increasingly expect substance misuse arrangements as part of safeguarding.'],
          ['Office and professional services', 'Lower physical risk does not remove the duty of care — and alcohol at client events is where office policies most often go wrong.'],
          ['Something else', 'Whatever the setting, the duty of care to provide a safe system of work applies — and a policy is the recognised way to discharge it.'],
        ], false],
      ]},
      { ref: 'SN-4', title: 'Snapshot — the legal framework your policy must cite', blocks: [
        ['variant', 'Northern Ireland only', [
          ['bullets', [
            'Health and Safety at Work (Northern Ireland) Order 1978 — the duty of care your policy is built on',
            'Misuse of Drugs Act 1971 — controlled drugs on your premises',
            'Psychoactive Substances Act 2016 — so-called legal highs, missed by most older policies',
            'UK GDPR and Data Protection Act 2018 — test results are special category health data',
          ]],
        ]],
        ['variant', 'Great Britain only', [
          ['bullets', [
            'Health and Safety at Work etc. Act 1974 — the duty of care your policy is built on',
            'Misuse of Drugs Act 1971 — controlled drugs on your premises',
            'Psychoactive Substances Act 2016 — so-called legal highs, missed by most older policies',
            'UK GDPR and Data Protection Act 2018 — test results are special category health data',
          ]],
        ]],
        ['variant', 'Republic of Ireland only', [
          ['bullets', [
            'Safety, Health and Welfare at Work Act 2005 — including the section 13 duty not to be under the influence of an intoxicant at work',
            'Misuse of Drugs Acts 1977 to 2017 — controlled drugs on your premises',
            'EU GDPR and Data Protection Act 2018 — test results are special category health data',
          ]],
        ]],
        ['variant', 'All three selected', [
          ['bullets', [
            'Health and Safety at Work etc. Act 1974 (Great Britain) and the Health and Safety at Work (Northern Ireland) Order 1978, plus the Safety, Health and Welfare at Work Act 2005 with its section 13 intoxicants duty in the Republic of Ireland',
            'Misuse of Drugs Act 1971 (UK) and Misuse of Drugs Acts 1977 to 2017 (Ireland)',
            'Psychoactive Substances Act 2016 (UK)',
            'UK GDPR and EU GDPR with the respective Data Protection Acts 2018 — test results are special category health data in both',
          ]],
        ]],
        ['note', 'Two-jurisdiction combinations merge the same wording under the headings "United Kingdom", "Northern Ireland and Republic of Ireland" or "Great Britain and Republic of Ireland".'],
      ]},
      { ref: 'SN-5', title: 'Open snapshot item — special category health data', blocks: [
        ['copy', 'Test results are special category health data'],
        ['copy', 'Under data protection law, a drug or alcohol test result is health data — the most protected category there is. Your policy must name a lawful basis for testing, say who sees results, how long they are kept and how someone gets a copy of their own. A policy that is silent on this is a live liability, whatever else it gets right.'],
      ]},
      { ref: 'SN-6', title: 'Open snapshot item — safety-critical roles', badges: ['unless answered "No"'], blocks: [
        ['variant', 'Answered yes', [['copy', 'Safety-critical roles need their own standard']]],
        ['variant', 'Answered not sure', [['copy', 'You may have safety-critical roles — the policy must decide']]],
        ['copy', 'Where impairment could cost a life — driving, machinery, height, care of vulnerable people — a general "fit for work" rule is not enough. A well-drafted policy designates the work, applies a stricter standard to it, and never softens that standard, however supportive the rest of the document is.'],
        ['variant', 'Extra sentence when answered not sure', [['copy', 'If you are unsure, the builder walks you through the recognised categories.']]],
      ]},
      { ref: 'SN-7', title: 'Locked snapshot items', blocks: [
        ['copy', 'Four more items are in your full snapshot — free, emailed to you'],
        ['opts', [
          ['What a well-run testing section contains', 'Chain of custody to EWDTS guidelines, laboratory confirmation of every screening result, medical review before anyone is told, and the B sample right.'],
          ['Medication and medicinal cannabis', 'Legally prescribed cannabis products exist — a policy written before that will call a lawful prescription a breach.'],
          ['Random testing needs a documented selection method', 'Random and unannounced are not the same thing — and an unfair selection method is where testing programmes get challenged. (Shown unless the buyer answered "No, and no plans to" on testing.)'],
          ['Refusal, adulteration and non-attendance', 'What happens when someone refuses or interferes with a test — the clause most older policies are missing.'],
          ['Roles and responsibilities for a ⟨team of ten or fewer / team of eleven to fifty / workforce of fifty to two hundred and fifty / workforce of more than two hundred and fifty⟩', 'Who owns what — sized to your organisation, not a corporate org chart pasted in.'],
        ]],
        ['flag', 'The label always says "four more items", but five items are listed unless the buyer answered "No, and no plans to" on testing today.'],
      ]},
      { ref: 'SN-8', title: 'Email gate', blocks: [
        ['copy', 'Get the full snapshot — free'],
        ['copy', 'Everything above plus the four locked items, as a tidy PDF for your board or your files. We also draft your policy statement paragraph as a taste of the full builder.'],
        ['note', 'Fields: "Organisation name" and "you@organisation.co.uk". Button: "Email my snapshot". Error line: "Enter your organisation name and a valid email address."'],
        ['copy', 'We use these details to send your snapshot and to follow up about your policy. How we handle personal information is set out in our privacy notice.'],
        ['flag', 'The snapshot email and PDF are still simulated — the success banner says so ("Prototype — the email send is simulated at this stage."). The gate copy promises a PDF that does not exist yet. Both are on the productionisation list.'],
      ]},
      { ref: 'SN-9', title: 'Drafted policy statement paragraph (the teaser clause)', blocks: [
        ['copy', 'Drafted from your answers — section 2 of your policy'],
        ['copy', '⟨Organisation⟩ is committed to providing a safe, healthy and productive working environment for everyone who works for it, everyone who works alongside it, and everyone its work touches. No one may attend work, or carry out work, while their ability to do so safely is impaired by alcohol or drugs.⟨ extra safety-critical sentence, shown below⟩ This commitment is made under ⟨acts for the selected jurisdictions⟩, and it is matched by a commitment in return: anyone who comes forward about a problem with alcohol or drugs before it becomes a conduct matter will be met with support, not punishment.'],
        ['variant', 'Extra sentence when safety-critical work was not ruled out', [
          ['copy', 'Because some of the work ⟨organisation⟩ does is safety-critical, any impairment in that work presents an immediate risk to life — and this policy applies its strictest standard to it.'],
        ]],
        ['copy', 'That is one paragraph of a fifteen-section document. The full builder tailors every section the same way — your jurisdiction, your roles, your testing programme, your names and dates.'],
        ['flag', 'This paragraph is drafted before the stance and voluntary-disclosure questions are asked. A buyer who later chooses zero tolerance with no disclosure protection receives a policy that does not make the "support, not punishment" promise this teaser makes.'],
      ]},
      { ref: 'SN-10', title: 'Builder call to action', blocks: [
        ['copy', 'Your snapshot PDF is on its way — the full policy is £125 + VAT'],
        ['copy', 'The snapshot shows the ground your policy needs to cover. The builder drafts it: about four minutes of questions and your answers become a tailored starter policy — fifteen sections, two appendices, structured with reference to EWDTS guidelines — delivered as a Word and PDF document for your advisers to check and your organisation to adopt.'],
        ['note', 'Price rows: "Tailored policy document — £125 + VAT" and "Supporting document pack — optional, from £10 + VAT". Button: "Start building — £125 + VAT".'],
        ['copy', 'NIVHA testing clients get a discounted rate — there is a code box at review. Payment is taken at the end, once you have seen exactly what the document contains.'],
        ['flag', '"Delivered as a Word and PDF document" — the builder currently generates a Word document only. The same promise appears in the summary card, the email field hint at step 4, and this needs a decision: add PDF output, or change the copy.'],
      ]},
      { ref: 'SN-11', title: 'Snapshot disclaimer', blocks: [
        ['copy', 'The snapshot and the policy builder provide template documents and general information for your organisation to review — they are not legal advice.'],
      ]},
    ],
  },
  {
    id: 'g-step1', title: 'Paid step 1 — stance',
    items: [
      { ref: 'W1-0', title: 'Step heading', blocks: [
        ['copy', 'Where does the organisation stand?'],
        ['copy', 'Two decisions that shape the tone of the whole document. There is no wrong answer — the policy is drafted around the position you choose.'],
      ]},
      { ref: 'W1-1', title: 'The organisation\u2019s position', blocks: [
        ['opts', [
          ['Zero tolerance', 'Any confirmed policy breach is treated as gross misconduct. Clear, strict, common in safety-led sectors.'],
          ['Support first', 'Voluntary disclosure is met with support and a route back to work. Breaches still carry consequences — the emphasis differs.'],
        ]],
        ['note', 'Shapes section 2 (policy statement), clause 6.2 (the alcohol standard), clause 6.5, and clause 14.1 (how breaches are treated).'],
      ]},
      { ref: 'W1-2', title: 'Safety-critical notice on this step', badges: ['unless health check answered "No"'], blocks: [
        ['copy', 'Whichever stance you choose, safety-critical work keeps the strictest standard — a supportive policy never softens it. The document handles this automatically.'],
      ]},
      { ref: 'W1-3', title: 'Alcohol at work events', blocks: [
        ['opts', [
          ['No alcohol at any work event', 'The simplest rule to communicate and enforce.'],
          ['Permitted at authorised events only', 'Management-authorised occasions, with fitness for any further duties still required.'],
        ]],
        ['note', 'Shapes clause 6.3, and the exception wording in the second rule of clause 6.1.'],
      ]},
    ],
  },
  {
    id: 'g-step2', title: 'Paid step 2 — testing programme',
    items: [
      { ref: 'W2-0', title: 'Step heading', blocks: [
        ['copy', 'Your testing programme'],
        ['copy', 'The policy describes when testing happens, how samples are taken and what happens to a result. Choose what applies — every selection is drafted with reference to EWDTS chain of custody guidelines.'],
      ]},
      { ref: 'W2-1', title: 'Should your new policy include an active testing programme?', blocks: [
        ['opts', [
          ['Yes — an active programme', 'Your policy will set out when testing happens and how it is run.'],
          ['Not yet — reserve the right', 'Your policy will reserve the right to introduce testing, so starting later does not need a rewrite.'],
        ]],
        ['note', 'Decides which version of section 9 is drafted, the tense of section 10, whether clauses 13.3 and 14.5 appear, and whether appendix A is included.'],
      ]},
      { ref: 'W2-2', title: 'When should testing be able to happen?', badges: ['active programme only'], blocks: [
        ['opts', [
          ['Pre-employment', 'Screening after a conditional job offer — the policy applies it at offer stage, never before.'],
          ['Unannounced random', 'Testing without notice, of people selected by an independent, documented method.'],
          ['For cause', 'Where behaviour, appearance or other evidence gives reasonable belief of impairment.'],
          ['Post-incident', 'After an accident, near miss or significant operational incident.'],
          ['Return to work and monitoring', 'Part of an agreed plan after treatment or a previous breach.'],
        ]],
        ['note', 'Each tick adds the matching paragraph to clause 9.1.'],
      ]},
      { ref: 'W2-3', title: 'How are people selected for unannounced testing?', badges: ['only when random is ticked'], blocks: [
        ['opts', [
          ['Independent random selection', 'A documented, computer-generated selection no one in the organisation can influence.'],
          ['Whole site or shift, unannounced', 'Everyone present is tested — no individual selection takes place.'],
        ]],
        ['note', 'Decides which unannounced-testing paragraph appears in clause 9.1.'],
      ]},
      { ref: 'W2-4', title: 'Which sample types?', badges: ['active programme only'], blocks: [
        ['hint', 'Every sample is collected under chain of custody and confirmed by an accredited laboratory before anything is reported.'],
        ['opts', [['Urine', ''], ['Oral fluid', ''], ['Hair', ''], ['Breath (alcohol)', '']]],
        ['note', 'Feeds the sample list in clause 9.2. Breath adds the second-reading paragraph in 9.2, the calibration-records sentence in 9.6, and a step in appendix A.'],
      ]},
      { ref: 'W2-5', title: 'Who runs your testing?', badges: ['active programme only'], blocks: [
        ['opts', [
          ['NIVHA', 'The policy names NIVHA Laboratory Services as the testing provider.'],
          ['Another provider', 'The policy refers to your appointed provider generically.'],
          ['No provider yet', 'The policy stays provider-neutral — and a case manager can talk you through options, no obligation.'],
        ]],
        ['note', 'Decides the "Testing provider" definition in section 3, and whether the case-manager follow-up appears on the confirmation page.'],
      ]},
      { ref: 'W2-6', title: 'Reserve-the-right notice', badges: ['reserve only'], blocks: [
        ['copy', 'The policy will state that the organisation reserves the right to introduce testing with notice — the recognised way to keep the door open without running a programme today.'],
      ]},
      { ref: 'W2-7', title: 'Which work is safety-critical?', badges: ['unless health check answered "No"'], blocks: [
        ['hint', 'Tick what applies — each becomes a designated category in section 8.'],
        ['opts', [
          ['Driving any vehicle for work', ''],
          ['Operating plant, machinery or powered equipment', ''],
          ['Working at height', ''],
          ['Electrical, gas or pressurised systems work', ''],
          ['Care of vulnerable people, or clinical duties', ''],
          ['Security or lone working', ''],
        ]],
        ['note', 'Each tick becomes a designated category in clause 8.1 — the exact document wording for each is shown at clause 8.1 below. Driving also adds the road traffic clause in section 4.'],
        ['flag', 'Fixed in this build: until now, ticking "Electrical, gas or pressurised systems work" or "Care of vulnerable people, or clinical duties" silently dropped that category from the finished document. All six options now carry through.'],
      ]},
      { ref: 'W2-8', title: 'Who does the stricter standard apply to?', badges: ['unless health check answered "No"'], blocks: [
        ['opts', [
          ['Designated roles only', 'The stricter standard applies to the safety-critical work above.'],
          ['Everyone', 'The organisation treats all roles to the same strict standard — with the rationale stated.'],
        ]],
        ['note', 'Decides which version of clause 8.1 is drafted.'],
      ]},
      { ref: 'W2-9', title: 'Validation messages on this step', blocks: [
        ['bullets', [
          'Choose at least one occasion when testing can happen.',
          'Choose at least one sample type.',
          'Tell us who runs your testing — "no provider yet" is a fine answer.',
        ]],
      ]},
    ],
  },
  {
    id: 'g-step3', title: 'Paid step 3 — support',
    items: [
      { ref: 'W3-0', title: 'Step heading', blocks: [
        ['copy', 'Support for your people'],
        ['copy', 'A credible policy pairs clear rules with a genuine route to help. Tell us what support exists so the policy reflects it honestly.'],
      ]},
      { ref: 'W3-1', title: 'Is there an employee assistance programme?', blocks: [
        ['hint', 'A confidential helpline or counselling service your people can use.'],
        ['opts', [
          ['Yes', 'The policy points people to it by name.'],
          ['No', 'The policy points to the GP and recognised charities instead.'],
        ]],
        ['note', 'Shapes the support list in section 11.'],
        ['flag', 'The "Yes" card says the policy points people to the EAP "by name", but the builder never asks for the EAP\u2019s name — the document says "the organisation\u2019s employee assistance programme". Either ask for the name or soften this card.'],
      ]},
      { ref: 'W3-2', title: 'Is there occupational health support?', blocks: [
        ['opts', [
          ['Yes', 'Occupational health handles fitness-for-work referrals.'],
          ['No', 'Referrals route through management and external providers.'],
        ]],
        ['note', 'Shapes clause 7.1, the support list in section 11, the no-occupational-health clause in section 11, and the occupational health row in the large-organisation version of section 5.'],
      ]},
      { ref: 'W3-3', title: 'Protect people who come forward voluntarily?', blocks: [
        ['hint', 'The strongest lever a policy has for surfacing problems early.'],
        ['opts', [
          ['Yes', 'Recommended — voluntary disclosure before an incident or a test is met with support, not discipline.'],
          ['No', 'Disclosure carries no special protection. Less common, and it tends to drive problems underground.'],
        ]],
        ['note', 'Decides whether the voluntary-disclosure protection clause (11.1) appears. See the open question on the timing of that protection at clause 11.1 below.'],
      ]},
    ],
  },
  {
    id: 'g-step4', title: 'Paid step 4 — governance and contacts',
    items: [
      { ref: 'W4-0', title: 'Step heading', blocks: [
        ['copy', 'Governance and contacts'],
        ['copy', 'Who owns the policy, who answers data protection questions, and where we send the finished document.'],
      ]},
      { ref: 'W4-1', title: 'The organisation fields', blocks: [
        ['note', 'Field: "Organisation name as it should appear in the policy" (required).'],
        ['note', 'Field: "Who owns this policy" (required). Hint: "A role, not a person — for example managing director or HR manager." Placeholder: "Managing director".'],
        ['note', 'Field: "Data protection contact" (required). Hint: "Who answers questions about test results and personal data." Placeholder: "Office manager".'],
      ]},
      { ref: 'W4-2', title: 'Review cycle', blocks: [
        ['opts', [
          ['Every 12 months', 'Recommended — testing practice and case law move quickly.'],
          ['Every 24 months', 'The longest interval we suggest between reviews.'],
        ]],
        ['note', 'Shapes the document control table, the review date on the cover and clause 15.3.'],
      ]},
      { ref: 'W4-3', title: 'Where we send the documents', blocks: [
        ['note', 'Fields: "Your name" (required), "Email address" (required), "Phone number" (optional).'],
        ['copy', 'Your documents are delivered here as Word and PDF.'],
        ['flag', 'Same Word-and-PDF promise as the snapshot page — the builder currently produces Word only.'],
      ]},
    ],
  },
  {
    id: 'g-step5', title: 'Paid step 5 — review, payment and confirmation',
    items: [
      { ref: 'W5-0', title: 'Step heading', blocks: [
        ['copy', 'Review your policy'],
        ['copy', 'This is the document your answers build — section by section, tailored to your organisation. Add supporting documents if you want the full pack.'],
      ]},
      { ref: 'W5-1', title: 'Document map header and small print', blocks: [
        ['copy', '⟨Organisation⟩ · base template supplied by NIVHA Laboratory Services'],
        ['copy', 'The policy refers to laboratory cut-off levels generically — the current published schedule of the analysing laboratory applies at the time of any test, so the document does not go out of date when a schedule changes. It carries a version stamp and a review date ⟨12 or 24⟩ months out.'],
        ['flag', 'The versioned cut-off appendix does not ship until scientific sign-off is complete — the generated document says figures "are confirmed … and issued as a versioned appendix following scientific sign-off". These two statements should be checked against each other before launch.'],
      ]},
      { ref: 'W5-2', title: 'Supporting documents upsell', blocks: [
        ['copy', 'Add the supporting documents'],
        ['copy', 'A policy only works once your people know about it. These are how it lands with your teams — each tailored with your organisation\'s name and choices, with a "what\u2019s included" list under each one. £10 to £45 + VAT each, or all three for £75 + VAT (£90 individually).'],
        ['opts', [
          ['Employee awareness leaflet — £10 + VAT', 'A plain-language summary of the policy for all staff — what it means for them, in one page.'],
          ['Manager guidance — £35 + VAT', 'The document that stops a well-meaning supervisor creating a tribunal claim — recognising possible impairment, holding the conversation, and arranging for-cause testing without getting it wrong.'],
          ['Toolbox talk — £45 + VAT', 'A ready-to-deliver 25 to 35 minute briefing — fourteen-slide deck with NI, ROI and GB versions of the statistics and support slides, a word-for-word delivery script booklet, and a sign-off sheet as evidence the policy was communicated.'],
        ]],
        ['note', 'Two former pack items were removed on 4 August 2026: collection records and declarations are supplied by the testing provider on collection day, and the contract clause wording is now included with every policy purchase at no charge, listed in the accompanying-documents appendix.'],
        ['copy', 'Full pack selected — bundle price applied, saving £15.'],
        ['flag', 'All three pack documents plus the contract clause wording are signed off — the toolbox talk pack (deck, delivery script booklet and sign-off sheet) was issued as v1.0 on 11 August 2026. File generation and delivery are not yet wired into the builder, so fulfilment must be wired up before launch, or the upsell held back.'],
      ]},
      { ref: 'W5-3', title: 'NIVHA client code', blocks: [
        ['copy', 'Testing clients get the client rate — the code is on your latest fee note or from your case manager.'],
        ['note', 'Error line: "That code is not recognised — check your latest fee note, or continue without it." The prototype accepts the demo code only; the client rate is 40% off.'],
      ]},
      { ref: 'W5-4', title: 'Declaration — price note and two checkboxes', badges: ['both must be ticked to continue'], blocks: [
        ['copy', '⟨£125⟩ + VAT buys a tailored starter template for your advisers to check and your organisation to adopt. It is not a legal opinion and it is not a substitute for advice on your own circumstances.'],
        ['note', 'First checkbox.'],
        ['copy', 'I understand what I am buying'],
        ['copy', 'This is a starter template drafted from my answers. It is not legal advice, and NIVHA is not acting as my organisation\u2019s legal adviser. Before this policy takes effect, ⟨organisation⟩ will have it reviewed by its own legal or HR adviser and will check it fits its contracts, procedures and operations — NIVHA has not seen those and cannot assess them. NIVHA\u2019s liability is limited as set out in the terms of sale, which cap it at the greater of the price paid and £500; liability for death or personal injury caused by negligence, or for fraud, is never excluded.'],
        ['note', 'Second checkbox.'],
        ['copy', 'I am buying for an organisation in the course of business'],
        ['copy', 'I have authority to bind ⟨organisation⟩, and I have read and agree to the terms of sale (⟨v1.0⟩), including the starter-template, professional-review and liability provisions above.'],
        ['note', 'The terms-of-sale link opens /policy-terms in a new tab, with the accepted version stamp (v1.0) recorded with the order acknowledgements.'],
      ]},
      { ref: 'W5-5', title: 'Summary card note', blocks: [
        ['copy', 'Delivered as a Word and PDF document, drafted from your answers.'],
        ['flag', 'Third appearance of the Word-and-PDF promise.'],
      ]},
      { ref: 'W5-6', title: 'Payment page', blocks: [
        ['copy', 'Secure card payment'],
        ['copy', 'Order ⟨reference⟩. Payment is taken securely in advance — your documents are generated as soon as it clears.'],
        ['copy', 'Pay ⟨total⟩ — order starter template'],
        ['copy', 'By paying you accept the terms of sale and confirm you are buying in the course of a business.'],
        ['copy', 'Payment is processed by Stripe. NIVHA never sees your card details.'],
        ['note', 'The prototype line "Prototype — no card is charged at this stage." shows until live Stripe is wired in.'],
      ]},
      { ref: 'CO-1', title: 'Terms of sale page (/policy-terms)', badges: ['new page'], blocks: [
        ['copy', 'Terms of sale — drug and alcohol policy builder'],
        ['copy', 'These terms apply to every purchase made through the NIVHA policy builder. Please read them before you pay — the acknowledgements at checkout refer to them.'],
        ['copy', 'The short version. You are buying a starter template, not a finished policy and not legal advice. It is generated automatically from your answers. Before your organisation adopts it, it must be checked and approved by your own legal or HR advisers, and you are responsible for that step. Our liability is capped as set out in section 9 — we never exclude liability for death or personal injury caused by our negligence, or for fraud.'],
        ['bullets', [
          '1. What you are buying',
          '2. Business buyers only',
          '3. What you must do before using the product',
          '4. What we do not do',
          '5. No third-party reliance',
          '6. Our service standard and your remedy',
          '7. Price and payment',
          '8. Intellectual property',
          '9. Liability',
          '10. Non-reliance',
          '11. Order records',
          '12. Changes to these terms',
          '13. Governing law',
        ]],
        ['note', 'The page carries a "Draft v1.0 — for review" flag and is linked from the second declaration checkbox and from the payment page. Both links open in a new tab.'],
      ]},
      { ref: 'W5-7', title: 'Confirmation page — what happens next', blocks: [
        ['opts', [
          ['Your policy is ready now', 'Drafted from your answers — download it below as a Word document⟨, with your N supporting documents to follow⟩. A copy also goes to ⟨email⟩.'],
          ['Have it reviewed, then adopt', 'Have your own legal or HR adviser check it, adjust anything that does not fit, and complete the adoption record inside the document before it takes effect. The document carries its version stamp and a review date ⟨12 or 24⟩ months out.'],
          ['Communicate it', 'Brief it to every team and keep a record — a policy only protects the organisation once people know it. (With the toolbox talk selected: "The toolbox talk and sign-off sheet give you evidence the policy was briefed to every team.")'],
          ['A case manager will be in touch', 'Shown only when the buyer chose "No provider yet" with an active programme: "You told us there is no testing provider yet. A NIVHA case manager will call to talk through what a programme would look like for ⟨organisation⟩ — no obligation."'],
        ]],
        ['note', 'Download button: "Download your policy (Word)". Note under it: "Generated from your answers just now — the same document that is emailed to you." The email send is not yet built — same productionisation item as the snapshot email.'],
      ]},
    ],
  },
  ],
},
{
  id: 'part-template',
  title: 'Part 2 — the document the answers build',
  intro: 'Every clause the template can produce, in document order, quoted verbatim from the generator. The badge on each clause says when it appears. Where an answer changes the wording, each version is shown with the answer that produces it. Clause numbers renumber automatically when conditional clauses drop out — the numbers shown are for the fullest build. Rule D7 applies throughout: no numeric cut-offs or detection windows appear anywhere; figures are referenced only against ⟨the current laboratory schedule of the organisation\u2019s testing provider, NIVHA Laboratory Services / the current laboratory schedule of the organisation\u2019s appointed testing provider⟩, which the generator inserts through its schedRef helper.',
  groups: [
  {
    id: 't-cover', title: 'Cover and document control',
    items: [
      { ref: 'COV', title: 'Cover page', badges: ['all builds'], blocks: [
        ['copy', 'Drug and alcohol policy'],
        ['copy', '⟨Organisation name⟩'],
        ['copy', 'Document version 1.0 · generated ⟨date⟩⟨ · order ⟨reference⟩⟩'],
        ['copy', 'This policy is issued and owned by ⟨organisation⟩.'],
        ['copy', 'Base template supplied by NIVHA Laboratory Services. It is not legal advice and must be reviewed by the organisation\u2019s own advisers before adoption — see the notice on the next page.'],
      ]},
      { ref: 'CTRL', title: 'Document control table', badges: ['all builds'], blocks: [
        ['table', [
          ['Policy owner', '⟨Policy owner⟩'],
          ['Applies to', 'Operations in ⟨Northern Ireland / Great Britain / the United Kingdom⟩⟨ and the Republic of Ireland⟩, applied according to the jurisdiction of employment ⟨suffix only for multi-jurisdiction builds⟩'],
          ['Date adopted', 'To be completed on adoption'],
          ['Next review', '⟨date⟩ (annual review / two-yearly review)'],
          ['Document version', '1.0 · generated ⟨date⟩'],
        ], false],
      ]},
      { ref: 'NOTICE', title: 'Important notice — read before adopting this policy', badges: ['all builds'], blocks: [
        ['copy', '**Important notice — read before adopting this policy.** This document is a base template. It was generated from answers given by ⟨organisation⟩ and has not been reviewed by a lawyer for ⟨organisation⟩\u2019s circumstances. It is not legal advice, and NIVHA Laboratory Services is not ⟨organisation⟩\u2019s legal adviser.'],
        ['copy', 'Before this policy is issued, ⟨organisation⟩ should have it reviewed by its own legal or HR adviser and should check that it is consistent with its contracts of employment, disciplinary procedure, data protection records and any collective agreement, and that it reflects the law in each jurisdiction where its people work. Employment law, data protection law and testing practice change; ⟨organisation⟩ is responsible for keeping this policy up to date.'],
        ['copy', '⟨Organisation⟩ is responsible for the content of this policy once adopted. NIVHA Laboratory Services accepts no responsibility to any employee, worker, contractor or other person for the content or application of this policy, and its responsibility to ⟨organisation⟩ is limited as set out in the terms of sale under which the template was supplied. Nothing in this notice limits liability for death or personal injury caused by negligence, or for fraud.'],
      ]},
      { ref: 'ADOPT', title: 'Adoption record', badges: ['all builds'], blocks: [
        ['copy', 'Adoption record'],
        ['copy', 'To be completed before this policy takes effect.'],
        ['table', [
          ['Reviewed by (name and role)', 'Name: ……………………   Role: ……………………   Date: ………………'],
          ['External review (legal or HR adviser)', 'Adviser: ……………………   Date: ………………'],
          ['Approved for issue by', 'Name: ……………………   Date: ………………'],
          ['Effective from', '………………'],
        ], false],
      ]},
    ],
  },
  {
    id: 't-s1', title: 'Section 1 — purpose and scope',
    items: [
      { ref: '1.1', title: 'Purpose', badges: ['all builds'], blocks: [
        ['copy', '1.1 This policy sets out the approach of ⟨organisation⟩ ("the organisation") to alcohol, drugs and other psychoactive substances in connection with work. Its purpose is to protect the health, safety and wellbeing of employees and others affected by the organisation\u2019s activities, to ensure the organisation meets its legal duties, and to make expectations clear to everyone who works for or with the organisation.'],
      ]},
      { ref: '1.2', title: 'Who and when it applies to', badges: ['all builds'], blocks: [
        ['copy', '1.2 This policy applies to all employees, workers and officers of the organisation, and to contractors, agency workers and others engaged to carry out work for the organisation as set out in section 13. It applies during working hours, whenever someone is on organisation premises or worksites, when driving or travelling for work, when operating equipment or vehicles provided by the organisation, when on call or on standby for work, and at work-related events.'],
      ]},
      { ref: '1.3', title: 'Status and consultation', badges: ['all builds'], blocks: [
        ['copy', '1.3 This policy does not form part of any contract of employment and may be amended following consultation. Testing arrangements are introduced, and materially changed, only after consultation with employees and any recognised workforce representatives. The current version is available from the ⟨policy owner⟩.'],
      ]},
    ],
  },
  {
    id: 't-s2', title: 'Section 2 — policy statement',
    items: [
      { ref: '2.1–2.2', title: 'Policy statement', badges: ['wording set by stance'], blocks: [
        ['variant', 'Zero tolerance', [
          ['copy', '2.1 The organisation operates a zero tolerance approach. No one may report for work, remain at work or carry out any work activity while under the influence of alcohol, illegal drugs or other psychoactive substances. Breaches of this policy are dealt with under section 14 and will normally be treated as gross misconduct, for which dismissal is a potential outcome.'],
          ['copy', '2.2 The organisation nevertheless recognises that substance dependence is a health condition. Anyone who comes forward voluntarily to seek help before a breach arises will be supported as set out in section 11.'],
        ]],
        ['variant', 'Support first', [
          ['copy', '2.1 The organisation is committed to a safe, healthy and productive working environment. No one may report for work, remain at work or carry out any work activity while impaired by alcohol, illegal drugs or other psychoactive substances.'],
          ['copy', '2.2 The organisation recognises that problems with alcohol or drugs are often health matters. Where someone comes forward, or a problem comes to light, the organisation\u2019s first response will be to offer support and treatment as set out in section 11. Support does not displace the standards in this policy: impairment at work, and any breach involving safety-critical duties, remains a disciplinary matter.'],
        ]],
      ]},
    ],
  },
  {
    id: 't-s3', title: 'Section 3 — definitions',
    items: [
      { ref: '3-DEF', title: 'Definitions table', badges: ['all builds'], blocks: [
        ['table', [
          ['Term', 'Meaning'],
          ['Alcohol', 'Any beverage or substance containing ethanol, in any quantity.'],
          ['Drugs', 'Controlled drugs within the meaning of the applicable misuse of drugs legislation, together with any other substance taken for its intoxicating effect. Medication used in accordance with section 7 is dealt with under that section.'],
          ['Psychoactive substances', 'Substances which produce a psychoactive effect, including so-called "legal highs" and solvents, whether or not their supply is unlawful. Nitrous oxide is a controlled drug and falls within "Drugs" above.'],
          ['Medication', 'Prescribed medicines, over-the-counter medicines and medicinal cannabis products, used in accordance with the prescriber\u2019s or manufacturer\u2019s directions.'],
          ['Impairment', 'A state in which a person\u2019s ability to work safely and effectively is, or may reasonably be believed to be, adversely affected by alcohol, drugs, psychoactive substances or medication.'],
          ['Under the influence', 'Having alcohol or drugs in the body above the standard applied by this policy, as confirmed through the testing procedure in section 9, or displaying signs of impairment.'],
          ['Safety-critical work', 'Work where impaired performance could result in a risk of significant harm to the worker or others⟨, as defined in section 8⟩.'],
        ], true],
      ]},
      { ref: '3-PROV', title: 'Definition — testing provider', badges: ['wording set by provider answer'], blocks: [
        ['variant', 'NIVHA chosen', [
          ['copy', 'NIVHA Laboratory Services, the organisation\u2019s appointed workplace testing provider, operating collection services from Belfast and Derry~Londonderry.'],
        ]],
        ['variant', 'Another provider', [
          ['copy', 'The organisation\u2019s appointed workplace testing provider, as notified to staff.'],
        ]],
        ['variant', 'No provider yet', [
          ['copy', 'An accredited workplace testing provider appointed by the organisation.'],
        ]],
      ]},
    ],
  },
  {
    id: 't-s4', title: 'Section 4 — legal framework',
    intro: 'Clauses in this section renumber automatically — only the ones that apply appear.',
    items: [
      { ref: '4-DUTY', title: 'Health and safety duty', badges: ['UK builds only'], blocks: [
        ['p', 'The duty citation varies: “the Health and Safety at Work etc. Act 1974 (in Great Britain) and the Health and Safety at Work (Northern Ireland) Order 1978 (in Northern Ireland)” when both are selected; each act alone otherwise.'],
        ['copy', '4.x The organisation has duties under ⟨duty citation⟩ to ensure, so far as is reasonably practicable, the health, safety and welfare at work of its employees and of others affected by its undertaking. Employees have corresponding duties to take reasonable care of themselves and others and to cooperate with the organisation on health and safety matters.'],
      ]},
      { ref: '4-MISUSE', title: 'Misuse of drugs and psychoactive substances', badges: ['UK builds only'], blocks: [
        ['copy', '4.x The Misuse of Drugs Act 1971 makes it an offence to possess, supply, produce or (as an occupier of premises) knowingly permit the supply or production of controlled drugs. The organisation will not knowingly permit controlled drugs on its premises and may report suspected offences to the police. The Psychoactive Substances Act 2016 makes it an offence to produce or supply psychoactive substances for their psychoactive effect.'],
      ]},
      { ref: '4-ROI', title: 'Republic of Ireland framework', badges: ['ROI builds only'], blocks: [
        ['copy', '4.x ⟨In the Republic of Ireland, the / The⟩ organisation has duties under the Safety, Health and Welfare at Work Act 2005. Under section 13 of that Act, employees must not be under the influence of an intoxicant at work to the extent that they may endanger their own safety, health or welfare at work or that of any other person. The regulations needed to bring the Act\u2019s workplace intoxicant testing provisions into operation have not been made, so any testing in the Republic of Ireland is carried out under the arrangements in this policy, with the individual\u2019s agreement recorded at the point of collection, and is applied in a reasonable and proportionate way with the safeguards in sections 9 and 12. The Misuse of Drugs Acts 1977 to 2017 govern controlled drugs.'],
      ]},
      { ref: '4-ROAD', title: 'Road traffic law', badges: ['only when driving is a designated category'], blocks: [
        ['copy', '4.x Driving while unfit through drink or drugs is an offence under ⟨the Road Traffic (Northern Ireland) Order 1995 / the Road Traffic Act 1988 / the Road Traffic Acts, labelled per jurisdiction in multi-jurisdiction builds⟩. Anyone who drives for work must comply with the driving-for-work rules in section 8.'],
      ]},
      { ref: '4-TRANS', title: 'Statutory transport regimes', badges: ['transport and logistics sector only'], blocks: [
        ['copy', '4.x Some transport activities are covered by their own statutory alcohol and drugs regimes with prescribed limits, testing powers or programme requirements — ⟨regimes for the selected jurisdictions, joined with semicolons⟩. Where such a regime applies to the organisation\u2019s operations, the organisation complies with that regime and this policy operates subject to it.'],
        ['table', [
          ['Jurisdiction selected', 'Regime wording in the document'],
          ['Great Britain', 'in Great Britain, the Transport and Works Act 1992 (railways and other guided transport systems)'],
          ['Northern Ireland', 'in Northern Ireland, the Railway Safety Act (Northern Ireland) 2002 and the Railways (Safety Management) Regulations (Northern Ireland) 2006 (railways)'],
          ['Northern Ireland or Great Britain', 'in the United Kingdom, the Railways and Transport Safety Act 2003 (aviation and shipping)'],
          ['Republic of Ireland', 'in the Republic of Ireland, Part 9 of the Railway Safety Act 2005, which requires railway undertakings to operate their own intoxicant programme for safety-critical railway workers'],
          ['All builds in this sector', 'in aviation, Regulation (EU) 2018/1042, which provides for psychoactive substance testing of flight and cabin crew'],
        ], true],
      ]},
      { ref: '4-DATA', title: 'Health information', badges: ['all builds'], blocks: [
        ['copy', '4.x Information about workers\u2019 health, including drug and alcohol test results, is special category data under data protection law and is handled as set out in section 12.'],
      ]},
    ],
  },
  {
    id: 't-s5', title: 'Section 5 — roles and responsibilities',
    items: [
      { ref: '5-SMALL', title: 'Responsibilities table — up to 50 people', badges: ['1 to 10 or 11 to 50'], blocks: [
        ['table', [
          ['Who', 'Responsibilities'],
          ['⟨Policy owner⟩', 'Owns this policy; decides when testing is required; handles concerns, disclosures and breaches; arranges support; keeps this policy under review.'],
          ['Line managers', 'Apply this policy consistently; remain alert to signs of impairment; remove anyone who appears unfit from work⟨ (especially safety-critical work)⟩ and escalate to the ⟨policy owner⟩ without delay.'],
          ['All employees and workers', 'Comply with this policy; report fitness-for-work concerns; declare relevant medication as required by section 7⟨; cooperate with testing under section 9⟩.'],
        ], true],
      ]},
      { ref: '5-LARGE', title: 'Responsibilities table — 51 people and above', badges: ['51 to 250 or more than 250'], blocks: [
        ['table', [
          ['Who', 'Responsibilities'],
          ['Senior management', 'Ensure this policy is resourced, communicated and applied consistently across the organisation.'],
          ['⟨Policy owner⟩', 'Owns this policy; ⟨oversees the testing programme and provider relationship;⟩ keeps this policy under review.'],
          ['Human resources', 'Advise managers on the application of this policy; coordinate support, investigations and any disciplinary process.'],
          ['Line managers', 'Remain alert to signs of impairment; remove anyone who appears unfit from work and escalate; support attendance at treatment where agreed.'],
          ['Occupational health ⟨row only when OH answered yes⟩', 'Provide confidential advice on fitness for work, medication and rehabilitation.'],
          ['All employees and workers', 'Comply with this policy; report fitness-for-work concerns; declare relevant medication as required by section 7⟨; cooperate with testing under section 9⟩.'],
        ], true],
      ]},
    ],
  },
  {
    id: 't-s6', title: 'Section 6 — rules and standards',
    items: [
      { ref: '6.1', title: 'The rules', badges: ['all builds'], blocks: [
        ['copy', '6.1 The following rules apply to everyone within the scope of this policy. No one may:'],
        ['bullets', [
          'report for work, remain at work or carry out work while under the influence of alcohol, drugs or psychoactive substances;',
          'consume alcohol, drugs or psychoactive substances during working hours, including breaks⟨, except as permitted under rule 6.3⟩;',
          'possess, use, supply, offer to supply or produce illegal drugs or psychoactive substances on organisation premises, in organisation vehicles or at worksites;',
          'drive or operate plant, machinery or equipment in connection with work while impaired by any substance, including medication.',
        ]],
        ['note', 'The exception in the second rule appears only when alcohol is permitted at authorised events.'],
      ]},
      { ref: '6.2', title: 'The alcohol standard', badges: ['wording set by stance'], blocks: [
        ['variant', 'Zero tolerance', [
          ['copy', '6.2 The standard for alcohol at work is zero tolerance: no alcohol may be consumed before or during a working period, and a confirmed result above the zero-tolerance cut-off in ⟨the current laboratory schedule of the organisation\u2019s testing provider, NIVHA Laboratory Services / the current laboratory schedule of the organisation\u2019s appointed testing provider⟩ is treated as a breach. That cut-off is set at a level which excludes naturally occurring (endogenous) alcohol.'],
        ]],
        ['variant', 'Support first', [
          ['copy', '6.2 The standard for alcohol at work is a confirmed result above the alcohol cut-off in ⟨the current laboratory schedule of the organisation\u2019s testing provider, NIVHA Laboratory Services / the current laboratory schedule of the organisation\u2019s appointed testing provider⟩.'],
        ]],
      ]},
      { ref: '6.3', title: 'Alcohol at work events', badges: ['wording set by events answer'], blocks: [
        ['variant', 'Permitted at authorised events only', [
          ['copy', '6.3 Moderate consumption of alcohol may be permitted at defined work-related social events with the advance approval of the ⟨policy owner⟩. Anyone attending such an event must not drive for work afterwards while impaired and must be fit for duty at the start of their next working period.⟨ Safety-critical duties must never follow such consumption within the same working period.⟩'],
          ['note', 'The final sentence appears only when safety-critical categories exist.'],
        ]],
        ['variant', 'No alcohol at any work event', [
          ['copy', '6.3 Alcohol is not provided or permitted at work-related events organised by the organisation.'],
        ]],
      ]},
      { ref: '6.4', title: 'Alcohol on premises', badges: ['all builds'], blocks: [
        ['copy', '6.4 Alcohol must not be brought onto or stored on organisation premises, worksites or in organisation vehicles. The only exception⟨s are alcohol provided for an event authorised under rule 6.3, and / is⟩ alcohol in an unopened container — for example a gift or a purchase for use away from work — which may be transported or stored unopened with the knowledge of a line manager.'],
        ['note', 'The plural opening, with the authorised-event exception, appears only when alcohol is permitted at authorised events.'],
      ]},
      { ref: '6.5', title: 'Safety-critical override', badges: ['support first + safety-critical only'], blocks: [
        ['copy', '6.5 Where duties are safety-critical (section 8), the strictest standard applies regardless of the organisation\u2019s overall supportive approach: any impairment, and any confirmed positive result, requires immediate removal from safety-critical duties while the matter is dealt with under this policy.'],
        ['note', 'Zero-tolerance builds do not need this clause — the strict standard already applies to everyone.'],
      ]},
    ],
  },
  {
    id: 't-s7', title: 'Section 7 — medication and medicinal cannabis',
    items: [
      { ref: '7.1', title: 'Declaring medication', badges: ['all builds'], blocks: [
        ['copy', '7.1 Some prescribed and over-the-counter medicines can affect alertness, coordination or judgement. Anyone taking medication that could affect their ability to work safely must check the guidance provided with the medicine, seek advice from the prescriber or a pharmacist where unsure, and inform ⟨occupational health or ⟩their line manager or the ⟨policy owner⟩ before starting work⟨, and always before carrying out safety-critical work⟩.'],
        ['note', '"Occupational health or" appears when OH answered yes; the closing phrase when safety-critical categories exist.'],
      ]},
      { ref: '7.2', title: 'Privacy of the condition', badges: ['all builds'], blocks: [
        ['copy', '7.2 No one is required to disclose the medical condition being treated — only that they are taking medication which may affect fitness for work. Disclosures are handled confidentially under section 12, and reasonable adjustments to duties will be considered.'],
      ]},
      { ref: '7.3', title: 'Medicinal cannabis', badges: ['all builds'], blocks: [
        ['copy', '7.3 Cannabis-based products for medicinal use may lawfully be prescribed. A valid prescription is handled in the same way as any other medication under this section. Use of cannabis without a prescription remains a breach of this policy, and a medical review of any laboratory finding will distinguish prescribed use from misuse before any result is reported as a policy violation.'],
      ]},
      { ref: '7.4', title: 'CBD and hemp products', badges: ['all builds'], blocks: [
        ['copy', '7.4 Over-the-counter CBD, hemp or similar products are not prescribed medication and are not regulated for strength or purity; some contain traces of controlled substances such as THC. They are consumed at the individual\u2019s own risk, and their use will not excuse a confirmed positive laboratory result.'],
      ]},
      { ref: '7.5', title: 'Failure to declare', badges: ['all builds'], blocks: [
        ['copy', '7.5 Failing to declare medication as required by this section, where that failure creates a safety risk, may itself be treated as a breach of this policy.'],
      ]},
    ],
  },
  {
    id: 't-s8', title: 'Section 8 — safety-critical roles',
    intro: 'Section 8 now appears in every build. Where at least one safety-critical category is ticked it designates the work; where none is ticked, the section records that the organisation considered the question and concluded that it does not carry out safety-critical work.',
    items: [
      { ref: '8.1', title: 'Designation', badges: ['safety-critical builds only'], blocks: [
        ['variant', 'Designated roles only', [
          ['copy', '8.1 The following work carried out for the organisation is designated safety-critical:'],
          ['note', 'Followed by a bullet for each ticked category, using the document wording below.'],
        ]],
        ['variant', 'Everyone', [
          ['copy', '8.1 Because of the nature of the organisation\u2019s work, all roles are designated safety-critical for the purposes of this policy. This designation is deliberate and reflects the risk profile of the organisation\u2019s activities, including ⟨the ticked categories, joined⟩.'],
        ]],
        ['table', [
          ['Wizard option ticked', 'Wording in the document'],
          ['Driving any vehicle for work', 'driving any vehicle for work, including to and between worksites'],
          ['Operating plant, machinery or powered equipment', 'operating plant, machinery or powered equipment'],
          ['Working at height', 'working at height'],
          ['Electrical, gas or pressurised systems work', 'work on electrical, gas or pressurised systems'],
          ['Care of vulnerable people, or clinical duties', 'care of vulnerable people, or clinical duties'],
          ['Security or lone working', 'security duties or lone working in circumstances where impairment would create significant risk'],
        ], true],
        ['flag', 'Mismatch: the step 5 document map says section 8 is "Recorded as not applicable — with the reasoning stated" when no safety-critical work is identified, but the generated document simply omits section 8 with nothing recorded. One of the two needs to change.'],
      ]},
      { ref: '8-NONE', title: 'No safety-critical work identified', badges: ['builds with no category ticked'], blocks: [
        ['copy', '8.1 The organisation has considered whether any work carried out for it is safety-critical for the purposes of this policy and has concluded that it is not. This conclusion is recorded here so that it can be revisited: if the organisation\u2019s activities change, this section and the standards in section 6 must be reviewed. The general requirement in section 6 not to work while impaired applies to all work.'],
        ['note', 'This else-branch is new: the generator now records the conclusion rather than omitting section 8, which addresses the mismatch flagged at clause 8.1 above.'],
      ]},
      { ref: '8.2', title: 'The stricter standard', badges: ['safety-critical builds only'], blocks: [
        ['copy', '8.2 Anyone carrying out safety-critical work must not do so while impaired by any substance, including medication, and must declare medication in accordance with section 7 before starting such work. Managers must remove anyone from safety-critical duties immediately where there is a reasonable concern about fitness for work; removal on this basis is a precaution, not a disciplinary sanction.'],
      ]},
    ],
  },
  {
    id: 't-s9', title: 'Section 9 — alcohol and drug testing',
    items: [
      { ref: '9-RES', title: 'Reserve-the-right version', badges: ['reserve builds only'], blocks: [
        ['copy', '9.1 The organisation does not currently operate a programme of workplace testing. It reserves the right to introduce testing, following consultation and reasonable notice, where it considers testing necessary to meet its health and safety duties. Any future programme will follow recognised standards for workplace testing, including chain of custody, laboratory confirmation, medical review of results and a right of appeal.'],
        ['note', 'Reserve builds get this single clause in place of everything below.'],
      ]},
      { ref: '9.1', title: 'When testing may take place', badges: ['active builds; one paragraph per ticked occasion'], blocks: [
        ['variant', 'Pre-employment ticked', [
          ['copy', '**Pre-employment.** Where testing applies to a role, it takes place only after a conditional offer of employment has been made, and the offer states that condition. The organisation does not ask health questions or require a test before an offer is made, and candidates receive the same information and safeguards as employees.'],
          ['variant', 'Extra sentence in ROI builds', [
            ['copy', 'In the Republic of Ireland, pre-employment testing is used only where the organisation is satisfied it is justified and proportionate for the role concerned.'],
          ]],
        ]],
        ['variant', 'Unannounced random ticked — independent selection', [
          ['copy', '**Unannounced random testing.** A proportion of the workforce is selected for unannounced testing at intervals through the year. Selection is generated independently by the testing provider so that everyone within scope has an equal chance of selection on each occasion, and no one within the organisation can influence who is selected.'],
        ]],
        ['variant', 'Unannounced random ticked — whole site or shift', [
          ['copy', '**Unannounced testing.** The organisation may arrange unannounced testing of an entire site, team or shift. Everyone present within the selected group is tested; no individual selection takes place.'],
        ]],
        ['variant', 'For cause ticked', [
          ['copy', '**For cause.** Testing may be required where there is a reasonable belief, based on observed behaviour, appearance or other evidence, that someone may be under the influence of alcohol or drugs. The grounds will be recorded before the test is arranged.'],
        ]],
        ['variant', 'Post-incident ticked', [
          ['copy', '**Post-incident.** Testing may be required following an accident, near miss or significant operational incident, where substance involvement cannot reasonably be ruled out. Testing is arranged as soon as reasonably practicable after the incident. Where time has passed between an incident and an alcohol test, the organisation may ask the testing provider to arrange an assessment by a suitably qualified toxicologist of the likely alcohol level at the time of the incident (a back-calculation). No such estimate is made for drug results, where back-calculation is not scientifically supported; drug results are interpreted at medical review in the context of the incident.'],
        ]],
        ['variant', 'Return to work ticked', [
          ['copy', '**Return to work and monitoring.** Where someone returns to duties following treatment or a previous breach, unannounced testing at intervals may form part of an agreed return-to-work plan for a defined period, normally up to six months.'],
        ]],
      ]},
      { ref: '9.2', title: 'How testing is conducted', badges: ['active builds only'], blocks: [
        ['copy', 'Testing is carried out by the testing provider using ⟨sample list⟩ samples as appropriate to the circumstances. Collection follows a documented chain of custody aligned with the European Workplace Drug Testing Society (EWDTS) guidelines: identity is verified, samples are collected and sealed in the donor\u2019s presence, and each transfer is recorded.'],
        ['variant', 'Breath selected', [
          ['copy', 'Where breath testing for alcohol is used, any reading above the applied standard is followed by a second confirmatory reading after a documented interval during which the donor consumes nothing and does not smoke or vape, so that alcohol remaining in the mouth cannot affect the result. The lower of the two readings is taken as the result, and calibration records for the device are retained and made available on request under section 9.6.'],
        ]],
        ['copy', 'Screening results that indicate the possible presence of a substance ("non-negative" results) are not treated as positive. Every non-negative screening result⟨, other than a breath alcohol reading (which is confirmed by the second reading described above),⟩ is sent for laboratory confirmation at a laboratory accredited to ISO/IEC 17025 for the relevant methods, with results assessed against the confirmation cut-off levels in ⟨the current laboratory schedule of the organisation\u2019s testing provider, NIVHA Laboratory Services / the current laboratory schedule of the organisation\u2019s appointed testing provider⟩.'],
        ['note', 'The breath carve-out in angle brackets appears only when breath is a selected sample type.'],
        ['copy', 'Anyone whose screening result is non-negative, or who is judged unfit for duty, will be stood down from work for the remainder of the working period on full pay pending the outcome. They will not be permitted to drive: the organisation will help arrange safe transport home. Both measures are precautionary duty-of-care steps, not sanctions.'],
      ]},
      { ref: '9.3', title: 'Medical review', badges: ['active builds only'], blocks: [
        ['copy', 'Confirmed laboratory results are reviewed before being reported to the organisation, so that legitimate explanations — including declared medication and prescribed cannabis-based products — are identified. Only results upheld on review are reported as policy violations.'],
      ]},
      { ref: '9.4', title: 'Split samples', badges: ['active builds only'], blocks: [
        ['copy', 'Where the sample type allows, samples are collected in split form. The second portion (the B sample) is retained by the laboratory for at least twelve months, and the donor may request analysis of the B sample at an independent accredited laboratory.'],
      ]},
      { ref: '9.5', title: 'Cooperation with testing', badges: ['active builds only'], blocks: [
        ['copy', 'Samples are collected only with the donor\u2019s written agreement, recorded at the point of collection on a collection record and declaration. No one will ever be physically compelled to provide a sample. The organisation does not rely on this agreement as its lawful basis for processing test results under data protection law — that basis is set out in section 12. Section 10 explains how a refusal is treated.'],
      ]},
      { ref: '9.6', title: 'Appeals', badges: ['active builds only'], blocks: [
        ['copy', 'Anyone whose confirmed result is reported as a policy violation may appeal in writing to the ⟨policy owner⟩ within five working days of being notified of the result. Grounds of appeal may include a failure to follow the procedures in this section, a legitimate explanation not identified at medical review, or a challenge to the analysis itself.'],
        ['copy', 'As part of an appeal, the donor may request analysis of the retained B sample (section 9.4) at an independent accredited laboratory. The cost of B sample analysis is met by the appellant and refunded in full if the analysis does not confirm the original result.⟨ Where the result under appeal is a breath alcohol reading, the appellant may ask to see the calibration records of the device used.⟩'],
        ['copy', 'An appeal does not suspend precautionary measures already in place, but no disciplinary decision will be finalised while an appeal under this section is outstanding.'],
      ]},
    ],
  },
  {
    id: 't-s10', title: 'Section 10 — refusal, adulteration and non-compliance',
    items: [
      { ref: '10.1', title: 'What counts as refusal', badges: ['all builds; tense follows testing answer'], blocks: [
        ['copy', '10.1 ⟨The following are / If testing is introduced under section 9, the following will be⟩ treated as serious misconduct and ⟨will / would⟩ normally be dealt with in the same way as a confirmed positive result:'],
        ['bullets', [
          'refusing to provide a sample when required under section 9 without a reasonable explanation;',
          'failing to attend a collection appointment without a reasonable explanation;',
          'tampering with, adulterating, substituting or otherwise interfering with a sample or the collection process;',
          'attempting to influence the selection process for testing.',
        ]],
      ]},
      { ref: '10.2', title: 'Telling people at the time', badges: ['all builds'], blocks: [
        ['copy', '10.2 Anyone asked to provide a sample will be told, at the time, that refusal is treated in this way.'],
      ]},
    ],
  },
  {
    id: 't-s11', title: 'Section 11 — support and assistance',
    intro: 'Clauses in this section renumber automatically — only the ones that apply appear.',
    items: [
      { ref: '11.1', title: 'Voluntary disclosure protection', badges: ['only when protection answered yes'], blocks: [
        ['copy', '11.x Anyone who believes they have a problem with alcohol or drugs is strongly encouraged to come forward. A voluntary disclosure made before the individual is notified of a requirement to take a test, and before it is prompted by a specific incident or a formal performance or conduct process already under way, will be treated as a health matter and not as a breach of this policy. A disclosure of personal use made under this clause will not be reported to the police, and clause 14.3 does not apply to it. The organisation will agree a support plan, which may include adjusted duties, time off for treatment and return-to-work testing. The support plan and the fact of the disclosure are recorded separately from disciplinary records and shared only with those named in the plan.'],
        ['flag', 'Open question for this review: rail-industry precedent ends this protection when someone is notified of a requirement to take a test, not at selection. Proposed tightening: "A voluntary disclosure made before being notified of a requirement to take a test, and before any incident or performance concern arises…" — this stops someone tipped off about an imminent test from using disclosure as a shield, and matches how Network Rail, VolkerRail and Irish Rail draw the line. Comments welcome.'],
      ]},
      { ref: '11-SUP', title: 'Support available', badges: ['all builds; fragments follow the support answers'], blocks: [
        ['copy', '11.x Support available includes ⟨the organisation\u2019s employee assistance programme, which provides free and confidential advice and counselling, ⟩⟨referral to occupational health, ⟩signposting to GP and community services, and reasonable time off to attend agreed treatment.'],
      ]},
      { ref: '11-NOOH', title: 'No occupational health service', badges: ['only when OH answered no'], blocks: [
        ['copy', '11.x The organisation does not retain an occupational health service. Fitness-for-work questions that need clinical input will be referred to the individual\u2019s GP or an appropriate external adviser, arranged through the ⟨policy owner⟩.'],
      ]},
      { ref: '11-ROI', title: 'Dependency as illness — Republic of Ireland', badges: ['ROI builds only'], blocks: [
        ['copy', '11.x ⟨In the Republic of Ireland, dependency / Dependency⟩ on alcohol or drugs is treated as an illness, and the Workplace Relations Commission has recognised alcohol dependency as capable of amounting to a disability under the Employment Equality Acts 1998 to 2015. Where an individual\u2019s dependency amounts to a disability, the organisation will consider what reasonable accommodation can be made, and will obtain independent medical or addiction-specialist advice before taking any decision that could bring employment to an end.'],
      ]},
      { ref: '11-UK', title: 'Dependency and equality law — UK', badges: ['UK builds only'], blocks: [
        ['copy', '11.x ⟨In the United Kingdom, addiction / Addiction⟩ to alcohol or drugs is not of itself a disability under equality law, although health conditions arising from dependency may be. The organisation treats dependency as a health condition in either case, and this section applies in full.'],
      ]},
      { ref: '11-ACC', title: 'Support and accountability', badges: ['all builds'], blocks: [
        ['copy', '11.x Engagement with support does not remove accountability for conduct. Where a breach has already occurred, support may run alongside, but does not replace, the procedures in section 14.'],
      ]},
    ],
  },
  {
    id: 't-s12', title: 'Section 12 — confidentiality and data protection',
    items: [
      { ref: '12.1', title: 'Confidentiality', badges: ['all builds'], blocks: [
        ['copy', '12.1 Information handled under this policy — including disclosures, medication declarations, referrals and test results — is confidential and shared only with those who need it to carry out this policy.'],
      ]},
      { ref: '12.2', title: 'Special category data and lawful basis', badges: ['basis wording follows jurisdictions'], blocks: [
        ['copy', '12.2 Drug and alcohol test results and related health information are special category data. ⟨basis wording⟩ Testing is carried out only where it is a necessary and proportionate way of meeting these duties, and only the minimum information needed is collected. A data protection impact assessment is completed before testing is introduced or materially changed.'],
        ['variant', 'UK builds', [
          ['copy', 'They are processed under UK GDPR and the Data Protection Act 2018, on the basis of the organisation\u2019s obligations and rights in the field of employment and its legal duties to protect health and safety at work.'],
          ['copy', 'The organisation maintains the appropriate policy document required by Schedule 1 to the Data Protection Act 2018 for this processing.'],
        ]],
        ['variant', 'ROI builds (appended with "also" when UK is present too)', [
          ['copy', 'They are ⟨also ⟩processed under the EU General Data Protection Regulation and the Data Protection Act 2018 (Ireland), on the basis of the organisation\u2019s obligations and rights in the field of employment and its statutory duties under the Safety, Health and Welfare at Work Act 2005.'],
          ['copy', 'In the Republic of Ireland, this processing is carried out with the suitable and specific measures required by section 36 of the Data Protection Act 2018 (Ireland).'],
        ]],
        ['note', 'The basis wording is assembled in order: the UK basis sentence, then the ROI basis sentence, then the UK Schedule 1 sentence, then the ROI section 36 sentence — only the sentences for the selected jurisdictions appear.'],
      ]},
      { ref: '12.3', title: 'The testing provider\u2019s role', badges: ['all builds'], blocks: [
        ['copy', '12.3 The organisation is the controller for the decisions it makes under this policy. The testing provider and its analysing laboratory are responsible for the collection and analysis they perform, acting as controller or processor as set out in the contract and privacy information governing the testing programme. The provider\u2019s privacy information is made available to every donor at the point of collection, and results are provided to the organisation on a need-to-know basis.'],
      ]},
      { ref: '12.4', title: 'Retention and rights', badges: ['all builds'], blocks: [
        ['copy', '12.4 Records created under this policy are kept only as long as necessary for the purposes described here and are then securely destroyed. As a guide, records of negative results are kept only for a short period, while records relating to confirmed policy violations are kept in line with the organisation\u2019s retention schedule. Individuals have the rights given by data protection law, including access to their own records. Questions should be directed to the ⟨data protection contact⟩.'],
      ]},
    ],
  },
  {
    id: 't-s13', title: 'Section 13 — contractors, agency workers and visitors',
    items: [
      { ref: '13.1', title: 'Contractors comply', badges: ['all builds'], blocks: [
        ['copy', '13.1 Contractors and agency workers must comply with this policy while carrying out work for the organisation. Engagement terms should reflect this, and the organisation may require evidence that a contractor operates equivalent standards of its own.'],
      ]},
      { ref: '13.2', title: 'Removal from site', badges: ['all builds'], blocks: [
        ['copy', '13.2 The organisation may remove from its premises or worksites any contractor, agency worker or visitor who appears to be under the influence of alcohol or drugs, and may end an engagement where this policy is breached.'],
      ]},
      { ref: '13.3', title: 'Testing contractors', badges: ['active builds only'], blocks: [
        ['copy', '13.3 Where testing applies to contractors or agency workers, it is conducted using the same procedure and the same safeguards as for employees — chain of custody, laboratory confirmation, medical review, the B sample right where the sample type allows, and the appeal route in section 9.6. The consequences of a confirmed result or a refusal are a matter for the engagement terms or the agency\u2019s own arrangements, and are dealt with under clause 13.2 rather than the disciplinary procedure in section 14.'],
      ]},
    ],
  },
  {
    id: 't-s14', title: 'Section 14 — breaches and disciplinary action',
    items: [
      { ref: '14.1', title: 'How breaches are treated', badges: ['wording set by stance'], blocks: [
        ['variant', 'Zero tolerance', [
          ['copy', '14.1 Breaches of this policy are dealt with under the organisation\u2019s disciplinary procedure. A confirmed positive result, refusal or adulteration under section 10, or being under the influence at work will normally be treated as gross misconduct, for which dismissal is a potential outcome.'],
        ]],
        ['variant', 'Support first', [
          ['copy', '14.1 Breaches of this policy are dealt with under the organisation\u2019s disciplinary procedure. The response will take account of the circumstances, including any voluntary disclosure, engagement with support and the safety implications of the role. ⟨Being under the influence while carrying out safety-critical work, supplying / Supplying⟩ drugs, and refusal or adulteration under section 10 will normally be treated as gross misconduct.'],
          ['note', 'The longer opening of the final sentence appears when safety-critical categories exist.'],
        ]],
      ]},
      { ref: '14.2', title: 'Fair process', badges: ['codes follow jurisdictions'], blocks: [
        ['copy', '14.2 Disciplinary action under this policy follows a fair process consistent with ⟨the Labour Relations Agency Code of Practice on disciplinary and grievance procedures (Northern Ireland) / the Acas Code of Practice on disciplinary and grievance procedures (Great Britain) / the Code of Practice on Grievance and Disciplinary Procedures (S.I. No. 146 of 2000) (Republic of Ireland)⟩, including the right to be accompanied or represented at formal hearings.'],
        ['note', 'Jurisdiction labels in brackets appear only in multi-jurisdiction builds.'],
      ]},
      { ref: '14.3', title: 'Police reporting', badges: ['all builds'], blocks: [
        ['copy', '14.3 Possession, supply or production of illegal drugs on organisation premises may also be reported to the police.'],
      ]},
      { ref: '14.4', title: 'Precautionary suspension', badges: ['all builds'], blocks: [
        ['copy', '14.4 Nothing in this policy prevents the organisation taking precautionary action, including suspension on full pay, while a matter is investigated. Precautionary suspension is a neutral act, not a disciplinary sanction.'],
      ]},
      { ref: '14.5', title: 'Follow-up testing', badges: ['active builds only'], blocks: [
        ['copy', '14.5 Where employment continues following a confirmed positive result, the organisation may require unannounced follow-up testing at intervals for a defined period, normally up to six months. The requirement is recorded in a written return-to-work agreement setting out its duration, frequency and review, and is agreed with the individual; where agreement is not reached the organisation will consider the matter under its normal procedures rather than imposing the requirement unilaterally.'],
      ]},
    ],
  },
  {
    id: 't-s15', title: 'Section 15 — communication, training and review',
    items: [
      { ref: '15.1', title: 'Issue and induction', badges: ['all builds'], blocks: [
        ['copy', '15.1 This policy is issued to everyone within its scope, forms part of induction, and is available on request from the ⟨policy owner⟩.'],
      ]},
      { ref: '15.2', title: 'Manager guidance', badges: ['all builds; pack sentences conditional'], blocks: [
        ['copy', '15.2 Managers receive guidance on recognising possible signs of impairment and on applying this policy consistently.⟨ The accompanying manager guidance document supports this.⟩⟨ A toolbox talk is provided for briefing work teams.⟩'],
        ['note', 'The extra sentences appear when the matching pack items are bought.'],
      ]},
      { ref: '15.3', title: 'Review', badges: ['cycle follows the governance answer'], blocks: [
        ['copy', '15.3 This policy is reviewed ⟨annually / every two years⟩, and sooner where legislation, case law or official guidance changes, where the testing provider or a laboratory\u2019s published cut-off schedule changes, following any incident, grievance or dispute that tests how the policy operates, or where the organisation\u2019s activities change materially. The next review is due by ⟨review date⟩.'],
      ]},
    ],
  },
  {
    id: 't-appendix', title: 'Appendices and closing note',
    items: [
      { ref: 'APP-A', title: 'Appendix A — testing procedure summary for donors', badges: ['active builds only'], blocks: [
        ['copy', 'This summary is given to anyone asked to provide a sample. It reflects sections 9 and 10 of the policy.'],
        ['bullets', [
          '1. You will be told why you are being asked to provide a sample (for example random selection or post-incident testing) and asked to confirm your identity.',
          '2. A trained collector will explain the process and ask you to sign a collection record and declaration. You may ask questions at any point. You will be told how a refusal is treated before you decide.',
          '3. You may declare any medication you are taking. You do not have to say what condition it treats.',
          '4. Your sample is collected and sealed in front of you, labelled with a unique reference, and sent to the laboratory under a documented chain of custody.',
          '5. A screening result that is not negative is always confirmed by laboratory analysis before anyone treats it as positive, and confirmed results are medically reviewed to rule out legitimate explanations.',
          '6. Where the sample type allows, a second sealed portion (the B sample) is retained, and you may ask for it to be analysed at an independent accredited laboratory.',
          '7. ⟨Breath builds only⟩ If a breath alcohol reading is above the applied standard, a second confirmatory reading is taken after a short interval and the lower of the two readings is used.',
          '8. If a confirmed result is reported as a policy violation, you may appeal in writing within five working days, including asking for the B sample to be analysed (section 9.6).',
          '9. You will be given a copy of the privacy information explaining how your data is used, and you can ask for a copy of your own results.',
        ]],
      ]},
      { ref: 'APP-B', title: 'Appendix B — accompanying documents', badges: ['all builds'], blocks: [
        ['copy', 'The following documents accompany this policy:'],
        ['bullets', [
          'Contract clause wording — wording for employment contracts and contractor engagement terms referencing this policy (included with every policy).',
          'Employee awareness leaflet — a plain-language summary of this policy for all staff (when bought).',
          'Manager guidance — recognising possible impairment, holding the conversation, and arranging for-cause testing (when bought).',
          'Toolbox talk pack — a briefing presentation with delivery script booklet and sign-off sheet (when bought).',
        ]],
        ['note', 'The appendix renders on every build because the contract clause wording is always included. Lettered A when there is no appendix A (reserve builds).'],
      ]},
      { ref: 'CLOSE', title: 'Closing note', badges: ['all builds'], blocks: [
        ['copy', 'Confirmation cut-off levels and related scientific figures are those in ⟨the current laboratory schedule of the organisation\u2019s testing provider, NIVHA Laboratory Services / the current laboratory schedule of the organisation\u2019s appointed testing provider⟩, which is available to the organisation on request. This document is a template for the organisation to review and adopt — it is not legal advice.'],
      ]},
    ],
  },
  ],
},
];
