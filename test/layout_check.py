#!/usr/bin/env python3
"""
Cross-browser layout check for the fee note.

Starts the app locally, walks the quote journey in Chromium, Firefox and WebKit (Safari's engine) at
phone, tablet and desktop widths, and fails if anything spills out of its container or the page scrolls
sideways. It never submits a quote, so it cannot reach Stripe, Airtable or email.

    python3 test/layout_check.py                 # all browsers, all sizes, all scenarios
    python3 test/layout_check.py --quick         # Chromium only, three sizes
    python3 test/layout_check.py --browsers firefox webkit --scenarios heavy-solicitor

Needs: pip install playwright && python3 -m playwright install chromium firefox webkit
Output: test/layout-out/report.md and one screenshot per failure (the offending element is outlined in red).
Exit code 1 when any problem is found.
"""
import argparse, json, os, re, socket, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / 'layout-out'

VIEWPORTS = {
    'phone-320': (320, 640),
    'phone-375': (375, 812),
    'phone-414': (414, 896),
    'tablet-768': (768, 1024),
    'laptop-1280': (1280, 800),
}

# Long, awkward text that real users type. These are what usually break a layout.
LONG = {
    'org': 'The Northern Ireland Health and Social Care Family Support and Safeguarding Partnership Team',
    'orgAddress': 'Unit 14b, The Very Long Named Business Park and Enterprise Centre, Off Some Extremely Long Road Name',
    'caseref': 'REF/2026/BELFAST/FAMILY/CARE/ORDER/0001234567/APPEAL/EXTRA-LONG-REFERENCE',
    'contactName': 'Bartholomew Montgomery-Featherstonehaugh',
    'email': 'bartholomew.montgomery-featherstonehaugh.family.support@northern-ireland-health-trust.example.org.uk',
    'costCentre': 'CC-4021-FAMILY-SUPPORT-NORTH-AND-WEST-BELFAST',
}

# Browser-side detector. Returns a list of problems, de-duplicated by selector and rule.
DETECT_JS = r"""
() => {
  const out = [], seen = new Set();
  const vw = document.documentElement.clientWidth;
  const label = el => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    if (c) s += '.' + c;
    const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return t ? s + ' "' + t + '"' : s;
  };
  const visible = el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    if (el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const isClipHidden = el => {   // visually-hidden helper text (the element itself or a wrapper around it)
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || (cs.position === 'absolute' && a.getBoundingClientRect().width <= 1)) return true;
    }
    return false;
  };
  const scroller = el => {       // inside a deliberate horizontal scroller
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const boxParent = el => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const d = getComputedStyle(a).display;
      if (d !== 'inline' && d !== 'contents') return a;
    }
    return null;
  };
  const add = (rule, el, detail) => {
    const key = rule + '|' + label(el);
    if (seen.has(key)) return;
    seen.add(key);
    el.setAttribute('data-ovf', String(out.length));
    out.push({ rule, el: label(el), detail, idx: out.length });
  };

  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) add('page-scrolls-sideways', document.body, 'page is ' + de.scrollWidth + 'px wide in a ' + vw + 'px window');

  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || isClipHidden(el)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'USE'].includes(el.tagName.toUpperCase())) continue;
    if (el.closest('svg')) continue;

    // 1. Sticks out past the edge of the screen
    if (!scroller(el) && (r.right > vw + 1.5 || r.left < -1.5)) {
      add('past-screen-edge', el, 'left ' + Math.round(r.left) + ', right ' + Math.round(r.right) + ' in a ' + vw + 'px window');
      continue;
    }
    // 2. Sticks out of its parent box
    const p = boxParent(el);
    if (p && p !== document.body && p !== document.documentElement && !scroller(el)) {
      const pr = p.getBoundingClientRect(), pcs = getComputedStyle(p);
      const pos = cs.position;
      if (pos !== 'fixed' && pos !== 'absolute' && pcs.display !== 'none' && pr.width > 1) {
        const padL = parseFloat(pcs.paddingLeft) || 0, padR = parseFloat(pcs.paddingRight) || 0;
        if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) {
          add('spills-out-of-parent', el, 'child ' + Math.round(r.left) + '–' + Math.round(r.right) + ' vs parent ' + Math.round(pr.left) + '–' + Math.round(pr.right) + ' (' + label(p) + ')');
          continue;
        }
      }
    }
    // 3. Content wider than its own box (text running out of a button, chip, cell)
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) continue;   // typed text scrolls inside a field by design
    if (el !== document.body && cs.display !== 'inline' && cs.display !== 'table-row' && cs.display !== 'table-row-group' && !['TABLE', 'TBODY', 'THEAD', 'TR'].includes(el.tagName)) {
      const ox = cs.overflowX;
      if (el.scrollWidth > el.clientWidth + 1.5 && el.clientWidth > 0) {
        if (ox === 'visible') add('content-wider-than-box', el, 'content ' + el.scrollWidth + 'px in a ' + el.clientWidth + 'px box');
        else if (ox === 'hidden' || ox === 'clip') add('text-clipped', el, 'content ' + el.scrollWidth + 'px clipped to ' + el.clientWidth + 'px');
        else if ((ox === 'auto' || ox === 'scroll') && vw < 500 && !el.closest('#stepper, .service-switch-inner')) add('scrolls-inside-on-phone', el, 'content ' + el.scrollWidth + 'px scrolls inside ' + el.clientWidth + 'px');
      }
    }
  }
  return out;
}
"""

MARK_JS = """(i) => { const e = document.querySelector('[data-ovf="' + i + '"]'); if (e) { e.style.outline = '3px solid red'; e.scrollIntoView({block:'center'}); } }"""


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def start_server():
    port = free_port()
    env = dict(os.environ, PORT=str(port))
    for k in list(env):  # never let a test run talk to real services
        if k.startswith(('STRIPE', 'AIRTABLE', 'POSTMARK', 'RESEND')):
            env.pop(k)
    proc = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            socket.create_connection(('127.0.0.1', port), timeout=0.3).close(); return proc, f'http://127.0.0.1:{port}'
        except OSError:
            time.sleep(0.2)
    proc.kill(); raise SystemExit('server did not start')


def unlock(page, base):
    page.goto(base, wait_until='networkidle')
    page.fill('#gate-email', 'qa@test.example')
    page.click('#gate-send')
    page.wait_for_selector('#gate-code', timeout=8000)
    code = re.search(r'(\d{6})', page.text_content('.gate-dev-hint')).group(1)
    page.fill('#gate-code', code)
    page.click('#gate-verify')
    page.wait_for_selector('#step-1:not([hidden])', timeout=8000)


def step1_2(page, route, location, concerns):
    page.click(f'[data-route="{route}"]')
    if route == 'private':
        page.check('#private-ack')
    page.click(f'[data-location="{location}"]')
    for c in concerns:
        page.click(f'[data-concern="{c}"]')


def click_js(page, selector):
    return page.evaluate("(s) => { const e = document.querySelector(s); if (!e || e.disabled) return false; e.click(); return true; }", selector)


def fill_basket_heavy(page):
    """Add every panel that can be added together, then push each option to its worst case."""
    codes = page.evaluate("() => [...new Set([...document.querySelectorAll('[data-add]')].map(b => b.dataset.add))]")
    for code in codes:
        click_js(page, f'[data-add="{code}"]')
    # worst-case hair: 6 months, month by month, with fast track
    for code in ('H-DP2', 'H-DP1', 'H-EtG-FAEE'):
        click_js(page, f'[data-period="{code}:6"]')
        click_js(page, f'[data-preset="{code}:monthly"]')
    page.evaluate("() => document.querySelectorAll('[data-ft]').forEach(t => { if (!t.checked) t.click(); })")
    page.evaluate("() => document.querySelectorAll('[data-addon]').forEach(b => b.click())")
    page.evaluate("() => document.querySelectorAll('select[data-qty]').forEach(s => { s.value = s.options[s.options.length - 1].value; s.dispatchEvent(new Event('change', {bubbles: true})); })")
    page.evaluate("() => document.querySelectorAll('select[data-variant]').forEach(s => { s.value = s.options[s.options.length - 1].value; s.dispatchEvent(new Event('change', {bubbles: true})); })")
    page.evaluate("() => document.querySelectorAll('[data-expand]').forEach(b => b.click())")
    page.evaluate("() => document.querySelectorAll('[data-alc-one]').forEach(b => b.click())")  # accept alcohol as one result


def fill_basket_single(page):
    click_js(page, '[data-add="H-DP1"]')


def stress_details(page, route):
    """Sample data, then replace the free-text fields with long, awkward values."""
    click_js(page, '#dev-fill')
    page.wait_for_timeout(150)
    sets = [('#org', LONG['org']), ('#orgAddress', LONG['orgAddress']), ('#caseref', LONG['caseref']), ('#contactName', LONG['contactName']),
            ('#contactEmail', LONG['email']), ('#costCentre', LONG['costCentre']), ('#approverName', LONG['contactName']),
            ('#authoriserName', LONG['contactName']), ('#orgTown', 'Belfast'), ('#orgPostcode', 'BT1 1AA'),
            ('#contactPhone', '07700 900123'), ('#donorName', 'Test Donor'), ('#dsdDrug', 'Codeine')]
    for sel, val in sets:
        loc = page.locator(sel)
        if loc.count():
            try:
                loc.first.fill(val, timeout=1500)
                loc.first.dispatch_event('change')
            except Exception:
                pass
    page.keyboard.press('Escape')


SCENARIOS = {
    # name: (route, location, concerns, basket filler, stress long text)
    'heavy-solicitor': ('solicitor', 'belfast', ['drugs-months', 'alc-chronic', 'analgesics', 'street-benzos'], fill_basket_heavy, True),
    'heavy-trust': ('trust', 'belfast', ['drugs-months', 'alc-chronic', 'analgesics', 'street-benzos'], fill_basket_heavy, True),
    'heavy-private': ('private', 'belfast', ['drugs-months', 'alc-chronic', 'analgesics', 'street-benzos'], fill_basket_heavy, True),
    'single-dublin': ('solicitor', 'dublin', ['drugs-months'], fill_basket_single, True),
}


def concern_ids(page):
    return page.evaluate("() => [...document.querySelectorAll('[data-concern]')].map(b => b.dataset.concern)")


SHOW = False


def check(page, results, ctx, step, shot_dir):
    if SHOW:
        height = page.evaluate('document.documentElement.scrollHeight')
        clip = {'x': 0, 'y': 0, 'width': page.viewport_size['width'], 'height': min(height, 12000)}   # very tall pages exceed browser limits
        page.screenshot(path=str(shot_dir / f"view-{ctx['browser']}-{ctx['viewport']}-{ctx['scenario']}-{step}.png"), full_page=True, clip=clip)
    probs = page.evaluate(DETECT_JS)
    for pr in probs:
        pr.update(ctx, step=step)
        shot = shot_dir / f"{ctx['browser']}-{ctx['viewport']}-{ctx['scenario']}-{step}-{pr['idx']}.png"
        try:
            page.evaluate(MARK_JS, pr['idx'])
            page.screenshot(path=str(shot))
            pr['shot'] = str(shot.relative_to(ROOT))
        except Exception:
            pr['shot'] = ''
        results.append(pr)
    page.evaluate("() => document.querySelectorAll('[data-ovf]').forEach(e => { e.style.outline=''; e.removeAttribute('data-ovf'); })")
    return len(probs)


def run_one(pw, bname, vname, size, sname, base, results, shot_dir):
    route, location, concerns, filler, stress = SCENARIOS[sname]
    browser = getattr(pw, bname).launch()
    ctx = browser.new_context(viewport={'width': size[0], 'height': size[1]}, device_scale_factor=2 if size[0] < 500 else 1,
                              is_mobile=(size[0] < 500) and bname != 'firefox', has_touch=size[0] < 500 and bname != 'firefox')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    c = dict(browser=bname, viewport=vname, scenario=sname)
    try:
        unlock(page, base)
        check(page, results, c, '1-who', shot_dir)
        step1_2(page, route, location, [x for x in concerns if x in concern_ids(page)] or concern_ids(page)[:1])
        page.wait_for_selector('#step-2:not([hidden])', timeout=5000)
        check(page, results, c, '2-needs', shot_dir)
        page.click('#to-step-3')
        page.wait_for_selector('#step-3:not([hidden])')
        page.wait_for_timeout(200)
        check(page, results, c, '3-panels-empty', shot_dir)
        filler(page)
        page.wait_for_timeout(300)
        check(page, results, c, '3-panels-full', shot_dir)
        # open each expanded card too
        page.evaluate("() => document.querySelectorAll('[data-expand]').forEach(b => b.click())")
        page.wait_for_timeout(200)
        check(page, results, c, '3-cards-open', shot_dir)
        if size[0] < 900:
            page.evaluate("() => { const b = document.getElementById('mt-continue'); }")
        # summary / continue
        if page.locator('#sum-continue').count() and page.locator('#sum-continue').is_visible() is False:
            page.evaluate("() => document.getElementById('sum-continue') && document.getElementById('sum-continue').click()")
        else:
            click_js(page, '#sum-continue')
        if not page.locator('#step-4:not([hidden])').count():
            click_js(page, '#mt-continue')
        page.wait_for_selector('#step-4:not([hidden])', timeout=6000)
        if stress:
            stress_details(page, route)
        else:
            click_js(page, '#dev-fill')
        page.wait_for_timeout(200)
        check(page, results, c, '4-details', shot_dir)
        click_js(page, '#details-form button[type="submit"]')
        page.wait_for_selector('#step-5:not([hidden])', timeout=8000)
        page.wait_for_timeout(300)
        check(page, results, c, '5-review', shot_dir)
    except Exception as e:
        try: page.screenshot(path=str(shot_dir / f'FAILED-{bname}-{vname}-{sname}.png'))
        except Exception: pass
        try: why = page.evaluate("() => [...document.querySelectorAll('.field-error, .error, [role=alert]')].filter(e => e.offsetParent).map(e => e.closest('label, .field, div').id || e.textContent.trim().slice(0, 50)).slice(0, 6).join(' | ')")
        except Exception: why = ''
        results.append(dict(rule='test-could-not-finish', el='', detail=(str(e).splitlines()[0][:120] + ' ' + why)[:260], idx=-1, step='?', shot='', **c))
    for e in errors:
        results.append(dict(rule='page-script-error', el='', detail=e[:200], idx=-1, step='?', shot='', **c))
    browser.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--browsers', nargs='+', default=['chromium', 'firefox', 'webkit'])
    ap.add_argument('--viewports', nargs='+', default=list(VIEWPORTS))
    ap.add_argument('--scenarios', nargs='+', default=list(SCENARIOS))
    ap.add_argument('--quick', action='store_true', help='Chromium only, three sizes, two scenarios')
    ap.add_argument('--screens', action='store_true', help='also save a full-page screenshot of every step (view-*.png) for eyeballing')
    ap.add_argument('--base', help='test an already running copy instead of starting one')
    a = ap.parse_args()
    if a.quick:
        a.browsers, a.viewports, a.scenarios = ['chromium'], ['phone-375', 'tablet-768', 'laptop-1280'], ['heavy-solicitor', 'heavy-private']
    global SHOW
    SHOW = a.screens
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.png'): f.unlink()
    proc = None
    base = a.base
    if not base: proc, base = start_server()
    results, runs = [], 0
    try:
        with sync_playwright() as pw:
            for b in a.browsers:
                for v in a.viewports:
                    for s in a.scenarios:
                        n0 = len(results)
                        run_one(pw, b, v, VIEWPORTS[v], s, base, results, OUT)
                        runs += 1
                        print(f'{b:9} {v:12} {s:16} {len(results) - n0} problem(s)', flush=True)
    finally:
        if proc: proc.kill()
    lines = [f'# Fee note layout check', '', f'{runs} runs across {len(a.browsers)} browser(s). Problems found: {len(results)}.', '']
    by = {}
    for r in results:
        by.setdefault((r['rule'], r['el']), []).append(r)
    for (rule, el), rs in sorted(by.items()):
        where = sorted({f"{r['browser']} {r['viewport']} {r['scenario']} step {r['step']}" for r in rs})
        lines += [f'## {rule}: {el}', f'- {rs[0]["detail"]}', f'- seen in {len(where)} run(s), e.g. {where[0]}', f'- screenshot: {rs[0]["shot"]}', '']
    (OUT / 'report.md').write_text('\n'.join(lines))
    (OUT / 'report.json').write_text(json.dumps(results, indent=1))
    print(f'\n{len(by)} distinct problem(s). Report: {OUT / "report.md"}')
    sys.exit(1 if results else 0)


if __name__ == '__main__':
    main()
