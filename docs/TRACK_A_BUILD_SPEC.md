# Track A — policy builder commerce build spec (11 Aug 2026)

Goal: take the /policy wizard from "generates a document for free" to a real sales pipeline:
order → payment (Stripe Checkout or invoice) → Airtable Policy Register → gated fulfilment
(human approval) → Postmark delivery. Plus de-prototyping. All in this repo (feenote-app).

## Non-negotiable brand/business rules
- Sentence case everywhere. NO exclamation marks. No hype. No emojis. Open Sans.
- Never mention client names (never "Vision Contracting"). Never "Eli Lilly". Never "Holywood".
- No numeric cut-offs or detection windows in any generated/sold document (rule D7) —
  only "confirmed against the current published cut-off schedule of the analysing laboratory".
- NIVHA holds ONLY ISO 9001 (BSI FS 586180). ISO 17025/UKAS belongs to analysing labs, never NIVHA.
- VAT number appears only on /terms and policy-terms.html. Company number NI024042 elsewhere.
- Liability cap: greater of price paid and £500.

## Locked pricing (ex VAT)
- Policy £125 · leaflet £10 · manager guidance £35 · toolbox talk pack £45
- Full pack bundle £75 (vs £90 individually) — leaflet + manager guidance + toolbox talk
- Annual review £60/yr (excluded from every discount)
- Contract clauses: FREE with every policy (include the DOCX in fulfilment, £0 line)
- Client code: 40% off policy + pack items (not review)
- Card "pay now": 10% discount on everything except the review
- Invoice option: organisations only, 14-day terms, no 10% discount
- VAT: UK buyers 20%. ROI buyers: reverse charge — charge ex VAT, wording
  "VAT reverse charge — VAT to be accounted for by the recipient under Article 196 of Council Directive 2006/112/EC",
  capture their VAT number (optional field, ROI only).

## Airtable Policy Register (already created)
Base appSr0GuDnDK0bdfy, table tblcAx5hNimJz4MIh ("Policy Register").
Fields (exact names): Order ref, Status (Awaiting payment/Paid/Invoiced/Cancelled),
Fulfilment status (Pending generation/Awaiting approval/Approved/Delivered/Failed),
Organisation, Contact name, Email, Phone, Jurisdictions (Northern Ireland/Great Britain/Republic of Ireland),
Items (Policy/Employee leaflet/Manager guidance/Toolbox talk/Full pack/Annual review),
Client code used, Payment method (Card/Invoice), VAT treatment (UK VAT 20%/ROI reverse charge),
Subtotal ex VAT, VAT, Total, Stripe session ID, Stripe payment ID, Stripe subscription ID,
Paid at, Policy version, Issue date, Review due, Review status (None/Active/Lapsed/Cancelled),
Approved by, Delivered at, Answers JSON, Documents (attachments), Postmark message IDs, Notes.
Reuse the existing `at()` Airtable helper in server.js; add env `AIRTABLE_POLICY_TABLE_ID`
defaulting to tblcAx5hNimJz4MIh. Dry-run behaviour identical to fee notes when no PAT.

## Build items
1. **Order model + endpoints.** POST /api/policy/orders creates a register record from wizard
   answers (server-side pricing recomputation — never trust client totals). Order ref format
   POL- + 4 upper alphanumerics (collision-checked). Snapshot answers into Answers JSON.
2. **Stripe Checkout (card path).** Extend lib/stripe.js:
   - Multi-line-item session, price_data per item with the discounted ex-VAT+VAT-inclusive
     amounts computed server-side; per-item description notes "£X + VAT" (UK) or reverse charge (ROI).
   - If Annual review in basket: mode=subscription — create/lookup a persistent Product+Price
     "Annual policy review" £60+VAT recurring yearly (lookup_key policy_annual_review, and a
     zero-VAT variant for ROI, lookup_key policy_annual_review_roi); one-time items go in
     line_items alongside; subscription_data.trial_end = now + 365 days so the first review
     charge lands at month 12 while one-time items are paid today. VERIFY this works in test
     mode: Stripe bills one-time line_items immediately at Checkout even with trialing
     subscription. If it does NOT (one-time items deferred to trial end), fall back to:
     mode=payment with setup_future_usage=off_session, then webhook creates the subscription
     with trial_end = +365d using the saved payment method. Choose whichever actually works
     in test mode and document the choice.
   - success_url /policy?paid=1&sid={CHECKOUT_SESSION_ID}, cancel_url /policy?canceled=1.
   - metadata: orderRef, recordId, kind=policy.
3. **Webhook + confirm.** Extend the existing /api/stripe/webhook to route policy sessions
   (metadata.kind) → mark register Paid (Paid at, Stripe payment/subscription IDs, Review due
   = +12 months when review bought, Review status Active) → set Fulfilment status
   Pending generation → run generation (item 5). Also extend /api/checkout/confirm
   equivalent for the policy flow (GET /api/policy/orders/confirm?sid=) as the
   webhook-less fallback, idempotent with the webhook.
4. **Invoice path.** Order recorded as Invoiced, no online payment. Confirmation email to the
   buyer ("your order is confirmed — invoice with 14-day terms follows from our office") and
   a notification email to info@nivha.net with the order summary. Fulfilment proceeds the
   same gated way (fulfil on approval — do not wait for invoice payment; that mirrors
   quote-then-invoice practice and the invoice option is organisations only).
5. **Fulfilment generation.** On Paid/Invoiced: generate the policy DOCX per selected
   jurisdiction via lib/policy-doc.js (one file per jurisdiction), plus static pack files
   from assets/fulfilment/ (copy from workspace, see below), plus contract clauses when a
   policy is bought. Upload every file to the register record's Documents field via
   Airtable's content upload endpoint (https://content.airtable.com/v0/{base}/{record}/{fieldId}/uploadAttachment,
   base64, all files < 5 MB; Documents fieldId fldDVHvvInaaYkyxI). If upload fails, fall back
   to lib/dropbox.js and record paths in Notes. Then set Fulfilment status Awaiting approval
   and email info@nivha.net "order awaiting approval" with the admin link.
6. **Human approval gate (workshop decision D4).** New page /admin/fulfilment (server-rendered
   or static+API), protected by ADMIN_TOKEN env (query/header token; constant-time compare;
   404 when env unset). Lists orders Awaiting approval with buyer, items, jurisdictions and
   document download links (proxied through an authed endpoint — never expose Airtable URLs
   in the page unauthenticated). Buttons: "Approve and send" → Postmark email to buyer with
   all documents attached (lib/email.js, existing attachment support), register → Approved
   then Delivered (Delivered at, Postmark message IDs), and "Hold" (Notes). Keep it plain and
   functional — Atlas gets the real UI later.
7. **Buyer emails (lib/email.js house style, sentence case, no exclamation marks):**
   - Order confirmation (card paid / invoice confirmed): summary table, amounts, VAT treatment
     line, "your documents follow once our team completes final checks — usually within one
     working day", reviewed-by-a-person framing (that is the gate).
   - Delivery email: documents attached, what each file is, one line on the annual review if
     bought ("we will be in touch about 30 days before your review date"; cancellation via
     billing portal link when subscription exists), NIVHA contact scoped to pack-file problems
     only (info@nivha.net) — no free Q&A promise.
   - Sender: info@nivha.net until the D5 decision (policies@) is made — read from POSTMARK_FROM.
8. **Client code validation.** Replace the hardcoded check: env CLIENT_CODES (comma-separated)
   is authoritative; DEMO code 'NIVHA-CLIENT' accepted ONLY when the server runs in email
   dry-run mode (i.e. not production). Invalid code = clear inline error, order can proceed
   without discount.
9. **De-prototype.** Remove the dev-fill bars and sample-fill buttons from /policy production
   UI (gate them behind ?dev=1 AND server /api/version reporting dryRun true). Remove the
   "prototype" footer wording on policy pages if present. Sweep all client-visible policy
   wizard strings for exclamation marks, "prototype", "demo".
10. **QA sweep script.** scripts/qa-policy-output.js: generates a policy DOCX for each of the
    3 jurisdictions with representative answers, extracts text, asserts NONE of: "Vision
    Contracting", "Eli Lilly", "Holywood", "100% accurate", "!", "ng/ml", "ng/mL", "partner
    laboratory", "UKAS", "17025", detection-window phrases ("detectable for", "detection
    window of N"), and that ISO 9001 never appears in the same sentence as DNA. Run it and
    make it pass. Also run it against the fulfilment pack files' extracted text (allow "!"
    exceptions only if genuinely present in signed-off pack — report, don't silently pass).
11. **Version/health.** Extend /api/version with policyCommerce: true, stripeMode:
    simulated|test|live, emailDryRun, airtableDryRun so the runbook verification step can
    assert production state at cutover.

## Environment/testing notes
- Local testing: run the server via the start_server pplx-tool with
  api_credentials=['custom-cred:api.stripe.com'] and env STRIPE_SECRET_KEY=proxy — the HTTPS
  proxy injects real auth (NODE_EXTRA_CA_CERTS is already set for Node). IMPORTANT: the
  currently active saved Stripe credential is being replaced; before any Stripe write, GET
  /v1/balance and require livemode !== true AND no invalid-key error. If the key is live or
  invalid, SKIP all real Stripe calls: build everything, unit-test pricing and session-param
  construction offline, test webhook handling by signing synthetic payloads with a local
  STRIPE_WEBHOOK_SECRET, and leave a clearly marked "STRIPE E2E PENDING" section in the report.
- Airtable local testing: server env AIRTABLE_PAT is NOT available in the sandbox — the
  register writes will be dry-run locally. Structure the code so the Airtable payloads are
  logged in dry-run; verify field names match the schema above exactly.
- Postmark: no token in sandbox — email dry-run logs. Fine.
- Pack fulfilment files: copy into feenote-app/assets/fulfilment/ from
  /home/user/workspace/doc_out/pack/: nivha_pack_01_employee_leaflet.docx,
  nivha_pack_02_manager_guidance.docx, nivha_pack_03_toolbox_talk_condensed.pptx,
  nivha_pack_03b_signoff_sheet.docx, nivha_pack_03c_delivery_script.docx,
  nivha_pack_05_contract_clauses.docx. NOTE: 01, 02 and 05 still carry "Draft v0.1" footers —
  ship them into the repo as-is (they get restamped on sign-off; Track B), but the server must
  refuse to DELIVER (approve-and-send) while a shipped file still contains "Draft v0.1" —
  check at approval time and surface "awaiting final sign-off" in the admin gate instead.
- express.static serves the whole repo root: add a guard BEFORE the static middleware that
  404s /assets/fulfilment/* and /docs/* so sold goods and specs are never public.
- git: commit in logical chunks on master, push with `git push origin HEAD` using
  api_credentials=["github"]. Do NOT push until the QA script passes and node --check passes
  on every touched file. Railway auto-deploys from master — production must never break:
  everything new must degrade gracefully to current behaviour when new env vars are absent.
  The /policy wizard's existing free-generation endpoint (/api/policy/generate) must KEEP
  working until the new flow is verified — wire the new order flow into the UI as the
  primary path (replacing the free download CTA with the basket/payment step) in the same
  push, but keep the code path intact behind the admin token for regeneration needs.
- After push, wait ~3 min and verify https://nivha-feenote-prototype-production.up.railway.app/policy
  still loads, /api/version shows the new fields, and the wizard end-to-end works in
  simulated mode (production has no Stripe env vars yet — that is expected and must be graceful:
  card option should show "card payments available shortly — choose invoice" style fallback
  messaging, sentence case, no exclamation marks).

## Report back
Write docs/TRACK_A_BUILD_REPORT.md covering: what shipped, commit hashes, the Stripe
mode decision (subscription trial vs setup_future_usage), what is verified vs pending
(Stripe E2E, Airtable live writes, Postmark), the exact Railway env vars Andy must add
(STRIPE_SECRET_KEY test, STRIPE_WEBHOOK_SECRET, ADMIN_TOKEN, CLIENT_CODES, POSTMARK_TOKEN,
AIRTABLE_POLICY_TABLE_ID optional), and the Stripe dashboard webhook endpoint to register
(URL + events) or the API call to create it.
