#!/usr/bin/env python3
"""Browser checks for the company agent page (SPEC 6.3 item 3). Headless Chromium through Playwright.

Starts its own static server (and, for the last check, the mock Claude API and a test backend) on free ports, prints one
PASS/FAIL line per check, stops everything it started and exits 1 if any check failed.

  uv run --no-project --python 3.12 --with playwright==1.60.0 --with-requirements server/requirements-dev.txt \
      python scripts/check_agent_page.py            # every check
  ... python scripts/check_agent_page.py --no-backend   # skip the check against a real (mock-driven) backend
  ... python scripts/check_agent_page.py --no-axe       # skip the axe-core checks (they load axe from cdnjs)

The page-only checks need nothing but Playwright; the backend check also needs the server requirements in the same Python.
"""
import argparse
import base64
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'server', 'tests'))
import procs  # noqa: E402  (standard library only: free ports, the static server, the mock and the backend)

FIXTURE = os.path.join(ROOT, 'scripts', 'fixtures', 'agent_cards.json')
CATALOG = os.path.join(ROOT, 'data', 'agent', 'catalog.json')
AXE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'
AXE_RULES = ['color-contrast', 'button-name', 'label', 'duplicate-id']
TECH = 'pp-hvac-technician'
BANNED_TEXT = ('Waiting for your OK', 'scopes', 'the server', 'Answers:')
MONTH_RX = re.compile(r'\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|'
                      r'Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b')
# agent.js fills {month:n} tokens with these names (its MONTHS list); the filled-in token is the one allowed month word
PAGE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)
    return bool(ok)


def poll(fn, timeout=8.0, every=0.1):
    t0 = time.time()
    v = fn()
    while not v and time.time() - t0 < timeout:
        time.sleep(every)
        v = fn()
    return v


class Console:
    """Collects console errors, page errors and failed same-origin requests for one page."""

    def __init__(self, page, origin):
        self.errors = []
        page.on('console', lambda m: m.type == 'error' and self.errors.append('console: ' + m.text[:200]))
        page.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)[:200]))
        page.on('requestfailed', lambda r: r.url.startswith(origin) and self.errors.append(f'failed: {r.url}'))
        page.on('response', lambda r: r.url.startswith(origin) and r.status >= 400 and self.errors.append(f'{r.status}: {r.url}'))


def new_page(browser, w, h, dark=False, reduced=False):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce' if reduced else 'no-preference')
    if dark:
        ctx.add_init_script("try{localStorage.setItem('bsp-theme','dark')}catch(e){}")
    return ctx, ctx.new_page()


def wait_ready(page):
    page.wait_for_selector('.ca-role-head .sys-card-title', timeout=15000)
    page.wait_for_function("() => !!(window.__agent && document.querySelector('#ca-chat textarea'))", timeout=15000)


def token_months(catalog):
    """Every month word a {month:n} token can produce, so the visible-text check can tell a token from copy."""
    return set(PAGE_MONTHS) if '{month:' in json.dumps(catalog) else set()


def visible_text_ok(page, catalog, label):
    text = page.evaluate("""() => [document.querySelector('main'), ...document.querySelectorAll('dialog[open]')]
      .filter(Boolean).map(e => e.innerText).join('\\n')""")
    bad = [w for w in BANNED_TEXT if w in text]
    # month words: allowed only where agent.js filled a {month:n} token ("... reported for Oct.")
    role = page.evaluate('() => window.__agent.state.role.id')
    r = next((x for x in catalog['roles'] if x['id'] == role), {})
    filled = []
    for s in json.dumps(r.get('home', {})).split('"'):
        if '{month:' in s:
            for m in PAGE_MONTHS:
                filled.append(re.sub(r'\{month:-?\d+\}', m, s))
    t = text
    for f in sorted(filled, key=len, reverse=True):
        t = t.replace(f, '')
    months = sorted(set(MONTH_RX.findall(t)))
    return check(f'{label}: no banned words or month names in the page text', not bad and not months, f'{bad} {months}' if bad or months else '')


# ── page checks (backend off) ───────────────────────────────────────────────────────────────────
def page_checks(browser, site, catalog):
    url = f'{site}/agent.html?role={TECH}&backend=off'
    ctx, page = new_page(browser, 390, 844)
    con = Console(page, site)
    page.goto(url)
    wait_ready(page)
    page.wait_for_timeout(600)
    sw = page.evaluate('document.documentElement.scrollWidth')
    check('390 px: no horizontal scroll', sw == 390, f'scrollWidth {sw}')
    head = page.text_content('.ca-role-head') or ''
    check('role head shows HVAC technician', 'HVAC technician' in head)
    check('role head shows "Punctual Pros · Field service"', 'Punctual Pros · Field service' in head, ' '.join(head.split())[:80])
    home_btn = page.locator('.ca-home button', has_text="Connect ServiceTitan to see today's jobs")
    check("home offers Connect ServiceTitan to see today's jobs", home_btn.count() == 1)
    visible_text_ok(page, catalog, 'technician, nothing connected')

    n_connect = page.locator('.ca-main [data-ca="connect"]').count()
    n_kpis = page.locator('.ca-main .ca-kpis').count()
    check('one Connect button in the role and home cards, no KPI tiles before connecting', n_connect == 1 and n_kpis == 0, f'{n_connect} buttons, {n_kpis} tile rows')

    # consent and sync, from the home summary
    home_btn.click()
    dlg = page.locator('#ca-consent')
    check('Connect opens the consent dialog', poll(lambda: dlg.evaluate('d => d.open'), 3))
    first = (dlg.locator('.sys-card-label').first.text_content() or '').strip()
    check('first dialog label is "BSP Desk sandbox"', first == 'BSP Desk sandbox', first)
    n_inputs = dlg.locator('input, select, textarea').count()
    check('consent dialog has no input, select or textarea', n_inputs == 0, f'{n_inputs} found')
    visible_text_ok(page, catalog, 'consent dialog')
    dlg.locator('button', has_text='Allow read-only access').click()
    jobs = dlg.locator('.ca-sync li', has_text='Jobs').locator('.ca-sync-n')
    check('sync counts Jobs up to 25', poll(lambda: jobs.inner_text().strip() == '25', 5), jobs.inner_text())
    check('Done gets focus when the sync ends', poll(lambda: page.evaluate("document.activeElement?.dataset?.ca === 'done'"), 4))
    page.wait_for_timeout(2000)
    check('dialog stays open 2 s after the sync', dlg.evaluate('d => d.open'))
    dlg.locator('[data-ca="done"]').click()
    check('Done closes the dialog', poll(lambda: not dlg.evaluate('d => d.open'), 2))
    chip = page.locator('#apps .ca-app[data-app="servicetitan"] .ca-app-status').inner_text().strip()
    check('ServiceTitan tile reads Connected', chip == 'Connected', chip)
    lead = page.inner_text('.ca-home')
    check('home shows "4 jobs today"', '4 jobs today' in lead, lead.splitlines()[1] if len(lead.splitlines()) > 1 else lead)

    # first screen on a phone's visible area
    page.set_viewport_size({'width': 390, 'height': 664})
    page.evaluate('window.scrollTo(0, 0)')
    page.wait_for_timeout(300)
    ta_top = page.evaluate("document.querySelector('#ca-chat textarea').getBoundingClientRect().top")
    row_bottom = page.evaluate("document.querySelector('.ca-home .ca-row')?.getBoundingClientRect().bottom ?? 1e9")
    check('390x664: composer above the fold', ta_top < 664, f'top {ta_top:.0f}')
    check("390x664: first Today's jobs row above the fold", row_bottom < 664, f'bottom {row_bottom:.0f}')
    page.set_viewport_size({'width': 390, 'height': 844})

    # role sheet -> Managing partner
    page.locator('.ca-role-head .ca-change').click()
    sheet = page.locator('#ca-role-sheet')
    check('Change role opens the role sheet', poll(lambda: sheet.evaluate('d => d.open'), 3))
    check('role sheet: BSP is open at the root', sheet.locator('details.ca-org[data-org="bsp"]').evaluate('d => d.open'))
    sheet.locator('.ca-role[data-role="bsp-managing-partner"]').click()
    page.wait_for_timeout(300)
    title = page.inner_text('.ca-role-head .sys-card-title').strip()
    check('role head updates to Managing partner', title == 'Managing partner', title)
    check('apps panel lists DealCloud', 'DealCloud' in page.inner_text('#apps'))
    check('?role= follows the pick', 'role=bsp-managing-partner' in page.url, page.url)
    focus = page.evaluate("document.activeElement?.className || ''")
    check('focus returns to Change role', 'ca-change' in focus, focus)
    check('composer not focused after the pick', not page.evaluate("document.activeElement?.tagName === 'TEXTAREA'"))
    visible_text_ok(page, catalog, 'managing partner')

    # access table
    page.locator('.ca-filter [data-org="all"]').click()
    n_all = page.locator('.ca-access tbody tr').count()
    check('access table: 44 roles with All', n_all == 44, str(n_all))
    page.locator('.ca-role-head .ca-change').click()
    poll(lambda: sheet.evaluate('d => d.open'), 3)
    sheet.locator('.ca-start [data-role="pp-ceo"]').click()   # the "Punctual Pros CEO" start chip
    page.wait_for_timeout(300)
    pressed = page.locator('.ca-filter [aria-pressed="true"]').inner_text().strip()
    n_pp = page.locator('.ca-access tbody tr').count()
    check('access table: a Punctual Pros role filters to Punctual Pros', pressed == 'Punctual Pros', pressed)
    check('access table: 8 Punctual Pros roles', n_pp == 8, str(n_pp))
    visible_text_ok(page, catalog, 'Punctual Pros CEO')

    # card renderers against the fixture (contract C4)
    cards_checks(page)
    check('no console errors (390 px walk)', not con.errors, '; '.join(con.errors[:3]))
    ctx.close()

    # dark theme at 390 px
    ctx, page = new_page(browser, 390, 844, dark=True)
    con = Console(page, site)
    page.goto(url)
    wait_ready(page)
    page.wait_for_timeout(400)
    theme = page.evaluate("document.documentElement.getAttribute('data-sys-theme')")
    sw = page.evaluate('document.documentElement.scrollWidth')
    check('390 px dark: no horizontal scroll', theme == 'dark' and sw == 390, f'theme {theme}, scrollWidth {sw}')
    check('no console errors (dark)', not con.errors, '; '.join(con.errors[:3]))
    ctx.close()


def fixture_counts(ev):
    focus = [str(k) for k in ev.get('focus') or []]
    markers = []
    for fi, f in enumerate(ev.get('floors') or []):
        for it in f.get('items') or []:
            markers.append((fi, it))
    ids = [str(f.get('id')) for f in ev.get('floors') or []]
    for it in ev.get('outside') or []:
        fi = ids.index(str(it.get('floor'))) if str(it.get('floor')) in ids else 0
        markers.append((fi, it))
    is_focus = lambda it: it.get('focus') is True or (str(it.get('kind')) in focus and it.get('focus') is not False)  # noqa: E731
    runs = sum(1 for f in ev.get('floors') or [] for r in f.get('runs') or [] if isinstance(r.get('points'), list) and len(r['points']) >= 2)
    first_floor = next((fi for k in focus for fi, it in markers if str(it.get('kind')) == k), None)
    return {
        'record': sum(1 for _, it in markers if it.get('basis') == 'record'),
        'likely': sum(1 for _, it in markers if it.get('basis') != 'record'),
        'focus': sum(1 for _, it in markers if is_focus(it)),
        'runs': runs,
        'floor': first_floor,
    }


def cards_checks(page):
    events = json.load(open(FIXTURE, encoding='utf-8'))
    sketch = next(e for e in events if e.get('kind') == 'floor_sketch')
    draft = next(e for e in events if e.get('kind') == 'action_draft')
    want = fixture_counts(sketch)
    got = page.evaluate("""async ([sketch, draft]) => {
      const m = await import('./assets/agent-cards.js');
      const box = document.createElement('div'); box.id = 'ca-test'; document.querySelector('main').append(box);
      const t1 = document.createElement('div'), t2 = document.createElement('div'), t3 = document.createElement('div');
      box.append(t1, t2, t3);
      const a = m.renderCard(JSON.parse(JSON.stringify(sketch)), { widget: { root: box }, turn: t1 });
      a.dataset.cardId = sketch.id; t1.append(a);
      const svg = sel => a.querySelectorAll('svg.ca-fs ' + sel).length;
      const shown = a.querySelector('.ca-fs-svg:not([hidden])')?.dataset.floor;
      const pressed = a.querySelector('[data-ca="floor"][aria-pressed="true"]')?.dataset.floor;
      const again = m.renderCard(JSON.parse(JSON.stringify(sketch)), { widget: { root: box }, turn: t2 });
      if (again) t2.append(again);
      const d = m.renderCard(JSON.parse(JSON.stringify(draft)), { widget: { root: box }, turn: t3 });
      t3.append(d);
      const unknown = m.renderCard({ type: 'card', kind: 'no_such_card', id: 'x' }, {});
      return { record: svg('.ca-fs-m.is-record'), likely: svg('.ca-fs-m.is-likely'), focus: svg('.ca-fs-m.is-focus'),
               runs: svg('.ca-fs-run'), shown, pressed, again: again ? again.textContent.trim() : null, unknown: unknown === null };
    }""", [sketch, draft])
    for k in ('record', 'likely', 'focus', 'runs'):
        check(f'sketch card: {k} count matches the fixture', got[k] == want[k], f'{got[k]} vs {want[k]}')
    check('sketch card: opens on the first focus item\'s floor', str(want['floor']) == str(got['shown']) == str(got['pressed']),
          f"shown {got['shown']}, pressed {got['pressed']}, want {want['floor']}")
    check('sketch card: a repeat in a later turn reads "Floor sketch above"', got['again'] == 'Floor sketch above', str(got['again']))
    check('unknown card kinds render nothing', got['unknown'])
    page.locator('#ca-test .ca-draft [data-ca="approve"]').click()
    foot = page.inner_text('#ca-test .ca-draft')
    check('draft card: Approve shows Approved and "Nothing was sent."', 'Approved' in foot and 'Nothing was sent.' in foot, foot.splitlines()[-1] if foot else '')
    page.evaluate("document.getElementById('ca-test')?.remove()")


# ── axe-core ───────────────────────────────────────────────────────────────────────────────────
def axe_checks(browser, site):
    url = f'{site}/agent.html?role={TECH}&backend=off&apps=all'
    for dark in (False, True):
        for w, h in ((1400, 900), (390, 844)):
            ctx, page = new_page(browser, w, h, dark=dark, reduced=True)
            page.goto(url)
            wait_ready(page)
            page.wait_for_timeout(500)
            label = f"axe {w} px {'dark' if dark else 'light'}"
            try:
                page.add_script_tag(url=AXE_URL)
            except Exception as e:  # noqa: BLE001
                check(label, False, f'axe did not load: {str(e)[:80]}')
                ctx.close()
                continue
            res = page.evaluate("""async rules => {
              const r = await axe.run(document, { runOnly: { type: 'rule', values: rules } });
              return r.violations.map(v => ({ id: v.id, n: v.nodes.length,
                nodes: v.nodes.slice(0, 3).map(x => x.target.join(' ') + ' ' + (x.any[0]?.message || '').slice(0, 90)) }));
            }""", AXE_RULES)
            detail = '; '.join(f"{v['id']} x{v['n']}: {' | '.join(v['nodes'])}" for v in res)
            check(f'{label}: no {", ".join(AXE_RULES)} violations', not res, detail[:600])
            ctx.close()


# ── the page against a real backend (mock Claude upstream) ──────────────────────────────────────
def backend_checks(browser, site, tmp):
    ports = {k: procs.free_port() for k in ('mock', 'api')}
    started = []
    try:
        started.append(procs.start_mock(ports['mock'], os.path.join(tmp, 'mock.log')))
        started.append(procs.start_server(ports['api'], os.path.join(tmp, 'api.log'), os.path.join(tmp, 'api.db'), mock_port=ports['mock'],
                                           ALLOWED_ORIGINS=site))
        api = f"http://127.0.0.1:{ports['api']}"
        plan = [['site_brief', {'address': '418 Wexcombe Ln, Lititz, PA 17543', 'issue': 'no heat'}]]
        b64 = base64.urlsafe_b64encode(json.dumps(plan).encode()).decode().rstrip('=')
        q = f'418 Wexcombe Ln, Lititz, no heat. Where do I start? [mock:plan:{b64}]'
        url = (f'{site}/agent.html?backend={urllib.parse.quote(api, safe=":/")}&role={TECH}&apps=all&q={urllib.parse.quote(q)}')
        ctx, page = new_page(browser, 390, 844, reduced=True)
        con = Console(page, site)
        bodies = []
        page.on('request', lambda r: r.method == 'POST' and r.url.startswith(api + '/chat') and bodies.append(r.post_data or ''))
        page.goto(url)
        wait_ready(page)
        got = poll(lambda: page.locator('#ca-chat .ca-sketch').count() >= 1, 25, 0.25)
        body = json.loads(bodies[0]) if bodies else {}
        ws = body.get('workspace') or {}
        check('backend: the request carries workspace', ws.get('role') == TECH and 'servicetitan' in (ws.get('connected') or []), json.dumps(ws)[:120])
        check('backend: one floor sketch renders from the card event', got and page.locator('#ca-chat .ca-sketch').count() == 1,
              str(page.locator('#ca-chat .ca-sketch').count()))
        cites = lambda: page.evaluate("[...document.querySelectorAll('#ca-chat .ch-sources .m')].map(e => e.textContent).join(' | ')")  # noqa: E731
        poll(lambda: 'Sandbox app' in cites(), 10, 0.25)
        check('backend: a citation reads "Sandbox app"', 'Sandbox app' in cites(), cites()[:120])
        check('backend: q is gone from the URL', 'q=' not in urllib.parse.urlsplit(page.url).query, page.url)
        check('backend: no console errors', not con.errors, '; '.join(con.errors[:3]))
        ctx.close()
    except Exception as e:  # noqa: BLE001
        check('backend: started the mock and the test backend', False, str(e)[:200])
    finally:
        for p in reversed(started):
            p.stop()


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--no-backend', action='store_true', help='skip the check against a mock-driven backend')
    ap.add_argument('--no-axe', action='store_true', help='skip the axe-core checks')
    args = ap.parse_args()
    catalog = json.load(open(CATALOG, encoding='utf-8'))
    tmp = tempfile.mkdtemp(prefix='agent-page-')
    port = procs.free_port()
    static = procs.start_static(port, os.path.join(tmp, 'static.log'), ROOT, ready_path='/agent.html')
    site = f'http://127.0.0.1:{port}'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                page_checks(browser, site, catalog)
                if not args.no_axe:
                    axe_checks(browser, site)
                if not args.no_backend:
                    backend_checks(browser, site, tmp)
            finally:
                browser.close()
    finally:
        static.stop()
    bad = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(bad)} passed, {len(bad)} failed.')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
