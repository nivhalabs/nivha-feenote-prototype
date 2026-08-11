#!/usr/bin/env bash
# End-to-end smoke test of the policy commerce pipeline in dry-run mode:
# no Airtable PAT, no Postmark token, no Stripe key. Everything that touches an
# external service is simulated, so this runs anywhere.
set -uo pipefail
cd "$(dirname "$0")/.."
PORT=3999
BASE="http://127.0.0.1:$PORT"
pkill -f "node server.js" >/dev/null 2>&1 || true
sleep 1
PORT=$PORT ADMIN_TOKEN=smoke-token-1234 APP_BASE_URL="$BASE" node server.js >/tmp/smoke-server.log 2>&1 &
for i in $(seq 1 30); do curl -sf "$BASE/api/version" >/dev/null && break; sleep 0.5; done

say() { printf '\n=== %s ===\n' "$1"; }

say "version"
curl -s "$BASE/api/version"; echo

say "quote: policy + full pack + review, client code, card"
curl -s -X POST "$BASE/api/policy/quote" -H 'content-type: application/json' -d '{
 "packItems":["employee_awareness_leaflet","manager_guidance","toolbox_talk"],
 "reviewService":true,"clientCode":"NIVHA-CLIENT","payMethod":"card",
 "details":{"billingCountry":"uk"}}'; echo

say "client code check (bad)"
curl -s -X POST "$BASE/api/policy/client-code" -H 'content-type: application/json' -d '{"code":"NOPE"}'; echo

say "order: card while Stripe is unconfigured (expect 503 cardUnavailable)"
curl -s -o /tmp/smoke-card.json -w '%{http_code}\n' -X POST "$BASE/api/policy/orders" -H 'content-type: application/json' -d '{
 "payMethod":"card","packItems":[],"reviewService":false,
 "acknowledgements":{"understanding":true,"businessBuyer":true},
 "details":{"company":"Smoke Test Ltd","contactName":"A Buyer","contactEmail":"buyer@example.com","billingCountry":"uk"},
 "quiz":{"jurisdiction":"ni"}}'
cat /tmp/smoke-card.json; echo

say "order: invoice, policy only, Northern Ireland"
curl -s -o /tmp/smoke-order.json -w '%{http_code}\n' -X POST "$BASE/api/policy/orders" -H 'content-type: application/json' -d '{
 "payMethod":"invoice","packItems":[],"reviewService":false,
 "acknowledgements":{"understanding":true,"businessBuyer":true},
 "details":{"company":"Smoke Test Ltd","contactName":"A Buyer","contactEmail":"buyer@example.com","billingCountry":"uk"},
 "quiz":{"jurisdiction":"ni","sector":"construction","testingTypes":["pre_employment"],"sampleTypes":["urine"]}}'
cat /tmp/smoke-order.json; echo
REC1=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/smoke-order.json','utf8')).recordId||'')")

say "order: invoice, policy + full pack + review, two jurisdictions, ROI billing"
curl -s -o /tmp/smoke-order2.json -w '%{http_code}\n' -X POST "$BASE/api/policy/orders" -H 'content-type: application/json' -d '{
 "payMethod":"invoice","packItems":["employee_awareness_leaflet","manager_guidance","toolbox_talk"],
 "reviewService":true,"clientCode":"NIVHA-CLIENT",
 "acknowledgements":{"understanding":true,"businessBuyer":true},
 "details":{"company":"Cross Border Ltd","contactName":"B Buyer","contactEmail":"b@example.com","billingCountry":"roi","vatNumber":"IE1234567X"},
 "quiz":{"jurisdiction":"ni_roi","sector":"construction","testingTypes":["for_cause"],"sampleTypes":["oral_fluid"]}}'
cat /tmp/smoke-order2.json; echo
REC2=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/tmp/smoke-order2.json','utf8')).recordId||'')")

sleep 4

say "admin gate without a token (expect 404)"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/admin/fulfilment"

say "admin gate with the token (expect 200)"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/admin/fulfilment?token=smoke-token-1234"

say "orders awaiting approval"
curl -s "$BASE/api/admin/policy/orders" -H 'x-admin-token: smoke-token-1234' | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);
console.log('orders:', d.orders.length);
d.orders.forEach(o=>console.log(' -', o.orderRef, o.organisation, '| docs:', o.documents.map(x=>x.filename).join(', '), '| blocked:', o.blocked.join(', ')||'none'));});"

say "document download (order 1, doc 0)"
curl -s -o /tmp/smoke-doc.docx -w '%{http_code} %{size_download} bytes\n' "$BASE/api/admin/policy/orders/$REC1/documents/0?token=smoke-token-1234"

say "document download without a token (expect 404)"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/admin/policy/orders/$REC1/documents/0"

say "approve order 1 (policy only, expect delivery)"
curl -s -X POST "$BASE/api/admin/policy/orders/$REC1/approve" -H 'x-admin-token: smoke-token-1234' -H 'content-type: application/json' -d '{"approvedBy":"Smoke Test"}'; echo

say "approve order 2 (pack files still draft stamped, expect a block)"
curl -s -X POST "$BASE/api/admin/policy/orders/$REC2/approve" -H 'x-admin-token: smoke-token-1234' -H 'content-type: application/json' -d '{"approvedBy":"Smoke Test"}'; echo

say "hold order 2"
curl -s -X POST "$BASE/api/admin/policy/orders/$REC2/hold" -H 'x-admin-token: smoke-token-1234' -H 'content-type: application/json' -d '{"note":"Waiting on the signed-off pack"}'; echo

say "static guards"
for p in /assets/fulfilment/nivha_pack_01_employee_leaflet.docx /docs/TRACK_A_BUILD_SPEC.md /server.js /lib/stripe.js; do
  printf '%s -> %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")"
done

say "existing endpoints still work"
printf 'policy page -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/policy")"
printf 'health -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health")"
printf 'policy generate -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/policy/generate" -H 'content-type: application/json' -d '{"details":{"company":"X Ltd"},"quiz":{"jurisdiction":"ni"}}')"
printf 'policy generate with admin token -> %s\n' "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/policy/generate?token=smoke-token-1234" -H 'content-type: application/json' -d '{"details":{"company":"X Ltd"},"quiz":{"jurisdiction":"ni"}}')"

pkill -f "node server.js" >/dev/null 2>&1 || true
say "server log tail"
tail -25 /tmp/smoke-server.log
