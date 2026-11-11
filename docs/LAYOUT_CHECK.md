# Layout check

An automated check that the fee note does not spill out of its boxes on phones, tablets or desktops.

## What it does

`test/layout_check.py` starts the app locally, then walks the quote journey in three browser engines:

- Chromium (Chrome, Edge)
- Firefox
- WebKit (the engine behind Safari on iPhone, iPad and Mac)

It does this at five widths: 320, 375 and 414 px (phones), 768 px (tablet) and 1280 px (laptop).

Each journey uses the worst realistic case: about 20 panels added, hair set to 6 months month by month, fast track on, urine add-ons on, and very long names, addresses, references and email addresses. Dublin collection runs as a lighter case.

At each step it looks for:

- the page scrolling sideways
- anything sticking out past the edge of the screen
- a child sticking out of its parent box
- text running out of a button, chip or table cell, or being clipped
- anything that scrolls sideways inside itself on a phone (the step bar and service switcher are allowed, as they are designed to)

Typed text inside an input is ignored, because a long value scrolls inside its field by design.

It never submits a quote, so it cannot reach Stripe, Airtable or email. Payment keys and Airtable keys are removed from the test server's environment.

## Running it

```
pip install playwright
python3 -m playwright install chromium firefox webkit
npm run test:layout:quick   # Chromium only, three sizes, about 3 minutes
npm run test:layout         # everything, about 25 to 40 minutes
python3 test/layout_check.py --browsers webkit --viewports phone-375 --scenarios heavy-private --screens
```

`--screens` also saves a full-page screenshot of every step so you can look at it. Results go to `test/layout-out/` (not committed): `report.md` lists each problem once, with a screenshot where the offending element is outlined in red.

The exit code is 1 when a problem is found. The GitHub workflow `.github/workflows/layout-check.yml` runs the full check on every pull request that touches CSS, JavaScript, HTML or the server.

## What it does not replace

It does not judge how a page looks, and it does not use real devices. Before launch, still look at the fee note on a real iPhone and a real Android phone. If something is wrong that the check missed, add the case to `SCENARIOS` or `DETECT_JS` in the script so it is caught next time.
