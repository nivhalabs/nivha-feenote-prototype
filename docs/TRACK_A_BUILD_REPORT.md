# Track A — policy builder commerce build report

Built 11 August 2026 against `docs/TRACK_A_BUILD_SPEC.md`. Branch `master`, deployed to
https://nivha-feenote-prototype-production.up.railway.app.

## Commits

| Hash | What |
| --- | --- |
| `b0badb8` | Policy commerce back end: pricing, register, Stripe, fulfilment and approval gate |
| `77d52d7` | Wire the policy wizard to real orders and retire the prototype helpers |
| `c8c8116` | Keep the wizard answers across the trip to Stripe so the confirmation is complete |
| `276eb08` | Take card payments only once the fulfilment gate exists |

Deployed and confirmed live: `/api/version` returns
`{"sha":"276eb0847b6608c614acf3e26945589deb46b6d0","policyCommerce":true,"stripeMode":"live","cardPayments":false,"fulfilmentGate":false,"emailDryRun":false,"airtableDryRun":false}`.

## What shipped

**New libraries**

- `lib/policy-pricing.js` — the single source of truth for money. Prices every order in pence
  from the raw wizard answers: policy £125, leaflet £10, manager guidance £35, toolbox talk £45,
  full pack £75, annual review £60 a year, contract clauses free with every policy. Client code
  takes 40% off the policy and pack lines, the pay-now card discount then takes a further 10% of
  the same lines, and the review is excluded from both. UK buyers get 20% VAT; buyers billing in
  the Republic of Ireland are charged ex VAT with the Article 196 reverse-charge wording.
- `lib/airtable.js` — the shared `at()` helper lifted out of server.js, plus attachment upload
  through `https://content.airtable.com/v0/{base}/{record}/{fieldId}/uploadAttachment`.
- `lib/policy-register.js` — the Policy Register (`tblcAx5hNimJz4MIh`, override with
  `AIRTABLE_POLICY_TABLE_ID`). Order references are `POL-` plus four characters from an
  unambiguous alphabet, collision-checked against the table. Full in-memory dry run when no PAT
  is set, so the pipeline runs end to end locally.
- `lib/policy-fulfilment.js` — turns an order into files: one tailored policy per jurisdiction,
  the pack files bought, and the contract clause wording that rides free with every policy.
- `lib/policy-orders.js` — the order endpoints, payment confirmation, fulfilment runner and the
  `/admin/fulfilment` approval gate.
- `lib/office-text.js` — dependency-free DOCX and PPTX text extraction, used by the QA script and
  by the draft-stamp check.

**Extended**

- `lib/stripe.js` — multi-line Checkout for policy orders, the annual review price
  (`policy_annual_review` and `policy_annual_review_roi` lookup keys, created on first use),
  subscription creation, payment-intent lookup, billing portal links, and `MODE`.
- `lib/email.js` — order confirmation (card and invoice), delivery email with attachments and a
  line explaining each file, and the office notification. `send()` now returns the Postmark
  message id. House style throughout: sentence case, no exclamation marks.
- `lib/dropbox.js` — `uploadPolicyFile()` as the fallback archive when an Airtable attachment
  upload fails.
- `server.js` — policy routing in `/api/stripe/webhook`, the extended `/api/version`, a guard that
  404s `/assets/fulfilment/*` and `/docs/*` before the static allowlist, and `/api/policy/generate`
  is now office-only once `ADMIN_TOKEN` is set (it stays open until then, so nothing breaks today).
- `js/policy.js` and `policy.html` — the order step posts to the real endpoints, client codes are
  checked by the server, order references come from the register, prototype wording is gone, and
  the sample-fill helpers only appear with `?dev=1` on a server reporting dry-run mode.

**Assets** — the six signed-off-pending pack files are in `assets/fulfilment/`, unreachable over
HTTP.

## Flow

1. `POST /api/policy/orders` — validates the buyer's details and both declarations, prices the
   order server-side (the browser's totals are never used), creates the register record with the
   answers and the priced order snapshotted into Answers JSON.
2. Card: Stripe Checkout, `success_url /policy?paid=1&sid={CHECKOUT_SESSION_ID}`, metadata
   `kind=policy`. Invoice: the record is marked Invoiced, the buyer gets a confirmation, the office
   gets a notification, and fulfilment proceeds without waiting for payment.
3. Payment lands twice by design — `/api/stripe/webhook` and `GET /api/policy/orders/confirm?sid=`
   both call the same idempotent handler, which no-ops if the record is already Paid.
4. Fulfilment generates the documents, attaches each to the Documents field, sets Fulfilment status
   to Awaiting approval and emails the office. Failures set Failed, write the reason to Notes and
   alert the office rather than failing the buyer's page.
5. `/admin/fulfilment` lists what is waiting, streams each document through an authenticated proxy
   (Airtable attachment URLs are never exposed), and offers "Approve and send" or "Hold".

## Decisions worth knowing

**Annual review billing — `setup` mode, not `subscription` mode.** The spec asked for
`mode=subscription` with `subscription_data.trial_end`, subject to verifying in test mode that
Stripe still charges the one-time line items today. That verification was impossible (see Stripe
E2E pending, below), and the failure mode is expensive: if Stripe defers the one-time items to the
trial end, NIVHA ships documents and gets paid in a year. So the default is `POLICY_REVIEW_MODE=setup`:
`mode=payment` with `customer_creation: always` and `payment_intent_data.setup_future_usage:
off_session`, and the webhook then creates the yearly subscription with `trial_end = now + 365
days` against the saved card. One-time items are certainly charged today. The subscription path is
implemented and one env var away — set `POLICY_REVIEW_MODE=subscription` after confirming the
behaviour in test mode.

**Card payments wait for the fulfilment gate.** With no `ADMIN_TOKEN` the approval page does not
exist, so a paid order could be generated but never delivered. The order endpoint therefore
withholds the card route until both a Stripe key and an `ADMIN_TOKEN` are configured, and offers
invoice instead — recoverable in a way that taking money is not. `/api/version` exposes
`cardPayments` and `fulfilmentGate` so this state is visible.

**Invoice terms.** Normally restricted to buyers with a valid client code. While card payments are
unavailable the restriction lifts, otherwise the wizard would have no route to an order at all.

**Draft stamps block delivery.** `nivha_pack_01`, `nivha_pack_02` and `nivha_pack_05` still carry
"Draft v0.1". The approval endpoint refuses to send any order containing them and returns
"awaiting final sign-off", which the admin page shows against the order. Because the contract
clause file (pack 05) goes out free with every policy, **no policy order can be delivered until
that file is restamped** (Track B). That is deliberate, but it is the one thing that will stop the
first real order, so it should be first in the sign-off queue.

**`/api/policy/generate`.** Still open, so today's behaviour is unchanged. The moment `ADMIN_TOKEN`
is set it becomes office-only (404 without the token) and the paid flow is the only public route.

## Verified

- 17 unit and route tests pass (`node test/policy-commerce.test.js`): pricing across eight
  scenarios including bundle, client rate, pay-now, reverse charge and penny reconciliation;
  Checkout parameter construction; webhook signature accept, tamper and stale-timestamp reject;
  jurisdiction expansion; file sets with no duplicates; order validation; the admin gate returning
  404 for absent and wrong tokens; document proxying; the sign-off block; approval, delivery and
  register updates; unique references across 40 concurrent draws.
- `node scripts/qa-policy-output.js` passes: policy documents for all three jurisdictions and all
  six pack files are clear of client names, "100% accurate", "ng/ml", "partner laboratory", "UKAS",
  "17025", detection-window phrasing, and ISO 9001 never shares a sentence with DNA. Zero
  exclamation marks anywhere, so no exceptions had to be reported. One wording change was needed:
  `lib/policy-doc.js` previously named ISO/IEC 17025; it now reads "confirmatory laboratory testing
  by a mass spectrometry method at an accredited laboratory".
- `bash scripts/smoke-policy-commerce.sh` runs the whole pipeline in dry run: quote, client code,
  card withheld, two invoice orders (one two-jurisdiction ROI order with the full pack and review),
  fulfilment, admin listing, document download, sign-off block, hold, static guards.
- `node --check` clean on every touched file.
- Production after deploy: `/policy` 200, `/api/version` shows the new fields,
  `/admin/fulfilment` 404 (no token set), `/api/admin/policy/orders` 404,
  `/assets/fulfilment/*` 404, `/docs/*` 404, `/api/policy/quote` prices a UK card policy at
  £112.50 + £22.50 = £135.00.

## Pending

**STRIPE E2E PENDING.** The sandbox Stripe credential is invalid — `GET /v1/balance` returned HTTP
401, `Invalid API Key provided: mk_1TtPW***************9XPW`. No live or test Stripe call was made
at any point. Untested against the real API: session creation, the review price lookup/creation,
subscription creation from a saved payment method, the billing portal link, and a genuine webhook
delivery. All of it is covered by offline tests of the request shapes and synthetic signed
webhooks, which is not the same thing. Run one £1-level test-mode order end to end before opening
this to buyers.

**Production has a live Stripe key.** `/api/version` reports `stripeMode: "live"`. Nothing can
charge a card yet because `ADMIN_TOKEN` is unset, but the moment that token is added the card route
opens against a **live** key. Swap `STRIPE_SECRET_KEY` for a test key, verify end to end, then swap
back.

**Airtable live writes untested.** No PAT in the sandbox, so every register write ran in dry run.
The field names are exactly those in the spec, but the first live order should be watched: single
selects (Status, Fulfilment status, Payment method, VAT treatment, Review status) and multiples
(Jurisdictions, Items) will reject values whose options do not already exist in the table.

**Postmark untested.** Dry run only. The delivery email attaches every document; a full pack order
is roughly 0.6 MB, well inside Postmark's limit, but the first live send should be checked.

**Not built:** an invoice PDF. The invoice path emails a confirmation and notifies the office; the
fee note itself is raised the usual way.

## Railway environment variables

| Variable | Needed | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes, for cards | Use the **test** key first. Currently a live key is set. |
| `STRIPE_WEBHOOK_SECRET` | Yes, for cards | From the webhook endpoint created below. |
| `ADMIN_TOKEN` | Yes | Long random string. Until it is set, `/admin/fulfilment` does not exist and cards stay off. |
| `CLIENT_CODES` | Yes | Comma-separated, e.g. `NIVHA-ACME,NIVHA-BUILDCO`. The demo code is refused in production. |
| `POSTMARK_TOKEN` | Already set | Emails are live (`emailDryRun: false`). |
| `POSTMARK_FROM` | Optional | Defaults to info@nivha.net; change when the policies@ decision lands. |
| `POLICY_NOTIFY_EMAIL` | Optional | Office notifications, defaults to info@nivha.net. |
| `AIRTABLE_POLICY_TABLE_ID` | Optional | Defaults to `tblcAx5hNimJz4MIh`. |
| `AIRTABLE_POLICY_DOCS_FIELD_ID` | Optional | Defaults to `fldDVHvvInaaYkyxI`. |
| `POLICY_REVIEW_MODE` | Optional | `setup` (default) or `subscription`. |
| `POLICY_VERSION` | Optional | Stamped on the register, defaults to `1.0`. |

## Stripe webhook to register

Dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://nivha-feenote-prototype-production.up.railway.app/api/stripe/webhook`
- Events: `checkout.session.completed` (the fee note flow uses the same endpoint and event)
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

Or by API:

```bash
curl https://api.stripe.com/v1/webhook_endpoints \
  -u "$STRIPE_SECRET_KEY:" \
  -d url="https://nivha-feenote-prototype-production.up.railway.app/api/stripe/webhook" \
  -d "enabled_events[]=checkout.session.completed" \
  -d description="NIVHA fee notes and policy orders"
```

## Go-live order

1. Restamp `nivha_pack_05_contract_clauses.docx` (and 01, 02) without "Draft v0.1" — nothing can be
   delivered until pack 05 is clean.
2. Set `ADMIN_TOKEN` and `CLIENT_CODES`. Check `/admin/fulfilment?token=…` loads.
3. Place one invoice order for a test organisation. Confirm the register record, the attachments,
   the office email, then approve and send and check the delivery email.
4. Swap `STRIPE_SECRET_KEY` to the test key, add the webhook and its secret, and run one card order
   through Checkout with a test card. Confirm the register goes to Paid, that the one-time items
   were charged today, and that the review subscription exists with a trial ending in 12 months.
5. Swap back to the live key and watch the first real order.
