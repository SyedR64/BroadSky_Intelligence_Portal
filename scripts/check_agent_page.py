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
    # R1: a sandbox tool counts as connected until the visitor disconnects it (the Connections screen gives the same answer)
    # R2: a role named in the address is an explicit choice and is stored; a role nobody chose never is
    check('a role named in the address is stored (R2)', TECH in (page.evaluate("localStorage.getItem('bsp-agent-role')") or ''))
    ctx0, page0 = new_page(browser, 1440, 900)
    page0.goto(f'{site}/agent.html?backend=off')
    wait_ready(page0)
    page0.wait_for_timeout(400)
    check('fresh visit with no role in the address stores no role (R2)', page0.evaluate("localStorage.getItem('bsp-agent-role')") is None)
    ctx0.close()
    check('fresh visit: no page role list beside the Viewing as switch',
          page.locator('.ca-roles').count() == 0 and page.locator('[data-sys-viewas] .sys-viewas-btn').count() == 1)
    lead0 = page.inner_text('.ca-home')
    check('fresh visit: sandbox ServiceTitan counts as connected, home shows "4 jobs today"',
          '4 jobs today' in lead0 and page.locator('.ca-main [data-ca="connect"]').count() == 0, ' '.join(lead0.split())[:80])
    ws0 = page.evaluate('window.__agent.workspace()') or {}
    check('fresh visit: the request carries the sandbox apps', 'servicetitan' in (ws0.get('connected') or []), json.dumps(ws0)[:120])
    page.locator('#apps .ca-app[data-app="servicetitan"] [data-ca="disconnect"]').click()
    stored = page.evaluate("JSON.parse(localStorage.getItem('bsp-os-connections') || '{}')")
    check("Disconnect stores 'available' for the company", (stored.get('pp') or {}).get('servicetitan') == 'available', json.dumps(stored))
    ws1 = page.evaluate('window.__agent.workspace()') or {}
    check('after Disconnect the request leaves ServiceTitan out', 'servicetitan' not in (ws1.get('connected') or []), json.dumps(ws1)[:120])
    home_btn = page.locator('.ca-home button', has_text="Connect ServiceTitan to see today's jobs")
    check("home offers Connect ServiceTitan to see today's jobs", home_btn.count() == 1)
    visible_text_ok(page, catalog, 'technician, ServiceTitan disconnected')

    n_connect = page.locator('.ca-main [data-ca="connect"]').count()
    n_kpis = page.locator('.ca-main .ca-kpis').count()
    check('one Connect button in the role and home cards, no KPI tiles while disconnected', n_connect == 1 and n_kpis == 0, f'{n_connect} buttons, {n_kpis} tile rows')

    # consent and sync, from the home summary
    home_btn.click()
    dlg = page.locator('#ca-consent')
    check('Connect opens the consent dialog', poll(lambda: dlg.evaluate('d => d.open'), 3))
    first = (dlg.locator('.sys-card-label').first.text_content() or '').strip()
    check('first dialog label is "Broad Sky OS sandbox"', first == 'Broad Sky OS sandbox', first)
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

    # Change role -> the top bar's Viewing as switch -> Managing partner
    pop = page.locator('#sys-viewas-pop')

    def pick(level, role):
        page.locator('.ca-role-head .ca-change').click()
        opened = poll(lambda: pop.is_visible(), 3)
        pop.locator(f'[data-level="{level}"]').click()
        pop.locator(f'[data-role="{role}"]').click()
        page.wait_for_timeout(300)
        return opened

    check('Change role opens the Viewing as switch', pick('firm_leadership', 'bsp-managing-partner'))
    title = page.inner_text('.ca-role-head .sys-card-title').strip()
    check('role head updates to Managing partner', title == 'Managing partner', title)
    check('apps panel lists DealCloud', 'DealCloud' in page.inner_text('#apps'))
    check('?role= follows the pick', 'role=bsp-managing-partner' in page.url, page.url)
    focus = page.evaluate("document.activeElement?.className || ''")
    check('focus returns to the Viewing as switch', 'sys-viewas-btn' in focus, focus)
    check('the pick is stored', page.evaluate("localStorage.getItem('bsp-agent-role')") == '"bsp-managing-partner"')
    check('composer not focused after the pick', not page.evaluate("document.activeElement?.tagName === 'TEXTAREA'"))
    visible_text_ok(page, catalog, 'managing partner')

    # access table
    page.locator('.ca-filter [data-org="all"]').click()
    n_all = page.locator('.ca-access tbody tr').count()
    check('access table: 44 roles with All', n_all == 44, str(n_all))
    pick('co_leadership', 'pp-ceo')
    pressed = page.locator('.ca-filter [aria-pressed="true"]').inner_text().strip()
    n_pp = page.locator('.ca-access tbody tr').count()
    check('access table: a Punctual Pros role filters to Punctual Pros', pressed == 'Punctual Pros', pressed)
    check('access table: 8 Punctual Pros roles', n_pp == 8, str(n_pp))
    visible_text_ok(page, catalog, 'Punctual Pros CEO')

    # card renderers against the fixture (contract C4)
    cards_checks(page)
    sketch_geometry_checks(page)
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
               runs: svg('.ca-fs-run:not(.ca-fs-link)'), shown, pressed, again: again ? again.textContent.trim() : null, unknown: unknown === null };
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


# ── floor sketch geometry (phone text sizes) ────────────────────────────────────────────────────
def _plumber_sketch(meter_side='right'):
    """A basement like the plumber's record: water heater and gas shutoff in the rear-left corner under the room name, a recorded
    gas line from the left wall, and a likely gas meter outside on `meter_side`."""
    item = lambda k, s, x, y, focus=False: {'kind': k, 'label': k.replace('_', ' ').capitalize(), 'short': s, 'basis': 'record', 'focus': focus, 'x': x, 'y': y}  # noqa: E731
    return {'type': 'card', 'kind': 'floor_sketch', 'id': f'fs-geo-{meter_side}', 'address': '27 Test Ct', 'basis': 'mixed', 'front': 'bottom',
            'focus': ['water_heater', 'gas_shutoff', 'main_water'],
            'floors': [{'id': 'basement', 'name': 'Basement', 'w': 35, 'h': 23, 'rooms': [{'x': 0, 'y': 0, 'w': 35, 'h': 23, 'label': 'Unfinished basement'}],
                        'items': [item('water_heater', 'WH', 5.2, 1.8, True), item('gas_shutoff', 'GS', 7.2, 1.8, True), item('main_water', 'W', 29.8, 21.2, True),
                                  item('furnace', 'F', 17.5, 11.5), item('service_switch', 'SW', 14.0, 13.8), item('panel', 'P', 32.9, 11.5),
                                  item('cleanout', 'C', 17.5, 21.2), item('sump', 'S', 29.8, 1.8)],
                        'runs': [{'kind': 'water', 'basis': 'record', 'points': [[29.8, 21.2], [5.2, 1.8]]},
                                 {'kind': 'gas', 'basis': 'record', 'points': [[2.1, 11.5], [17.5, 11.5], [5.2, 1.8]]},
                                 {'kind': 'drain', 'basis': 'record', 'points': [[17.5, 1.8], [17.5, 21.2]]}]}],
            'outside': [{'kind': 'gas_meter', 'label': 'Gas meter', 'short': 'G', 'basis': 'likely', 'side': meter_side, 'at': 0.35, 'floor': 'basement'}]}


def _corner_sketch():
    """A small room in the floor's rear-left corner with a likely oil tank on its name, and a focused heat pump outside on the right."""
    return {'type': 'card', 'kind': 'floor_sketch', 'id': 'fs-geo-corner', 'address': '1 Test Ln', 'basis': 'likely', 'front': 'bottom', 'focus': ['heat_pump'],
            'floors': [{'id': 'basement', 'name': 'Basement', 'w': 30, 'h': 24, 'rooms': [{'x': 0, 'y': 0, 'w': 20, 'h': 15, 'label': 'Partial basement'}],
                        'items': [{'kind': 'oil_tank', 'label': 'Oil tank', 'short': 'OT', 'basis': 'likely', 'x': 4.5, 'y': 1.9}], 'runs': []}],
            'outside': [{'kind': 'heat_pump', 'label': 'Heat pump', 'short': 'HP', 'basis': 'record', 'side': 'right', 'at': 0.5, 'floor': 'basement', 'focus': True}]}


SKETCH_GEOMETRY_JS = """async (evs) => {
  const m = await import('./assets/agent-cards.js');
  const out = {};
  for (const [name, ev] of Object.entries(evs)) {
    const host = document.createElement('div'); host.id = 'ca-geo'; document.querySelector('main').append(host);
    host.append(m.renderCard(JSON.parse(JSON.stringify(ev)), { widget: { root: host } }));
    host.querySelectorAll('.ca-fs-svg').forEach(d => { d.hidden = false; });
    const r = { labelOver: [], ringOver: [], clipped: [], arrowGap: [], links: [], runs: [] };
    for (const svg of host.querySelectorAll('svg.ca-fs')) {
      const vb = svg.viewBox.baseVal;
      const marks = [...svg.querySelectorAll('.ca-fs-m')].map(g => { const c = g.querySelector('circle:not(.ca-fs-ring):not(.ca-fs-halo)');
        return { t: g.querySelector('text').textContent, x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), ring: !!g.querySelector('.ca-fs-ring') }; });
      const reach = k => (k.ring ? 28.5 : 21);
      for (const t of svg.querySelectorAll('.ca-fs-room-t')) { const b = t.getBBox();
        for (const k of marks) { const d = Math.hypot(Math.max(b.x - k.x, 0, k.x - (b.x + b.width)), Math.max(b.y - k.y, 0, k.y - (b.y + b.height))); if (d < reach(k)) r.labelOver.push(`${k.t} on ${t.textContent}`); } }
      for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) { const a = marks[i], b = marks[j];
        if ((a.ring || b.ring) && Math.hypot(a.x - b.x, a.y - b.y) < reach(a) + reach(b)) r.ringOver.push(`${a.t}/${b.t}`); }
      for (const k of marks.filter(k => k.ring)) if (k.x - 28.5 < vb.x || k.x + 28.5 > vb.x + vb.width || k.y - 28.5 < vb.y || k.y + 28.5 > vb.y + vb.height) r.clipped.push(k.t);
      const arrow = svg.querySelector('.ca-fs-arrow'), st = svg.querySelector('.ca-fs-street');
      if (arrow && st) { const tip = +(arrow.getAttribute('d').match(/V(-?[\\d.]+)/) || [])[1];   // the shaft ends at the tip
        r.arrowGap.push(+st.getAttribute('y') - tip - parseFloat(getComputedStyle(st).fontSize) * 0.73); }   // baseline to cap top: 0.73 em
      r.links.push(...[...svg.querySelectorAll('.ca-fs-link')].map(l => ({ cls: l.getAttribute('class'), pts: l.getAttribute('points') })));
      r.runs.push(...[...svg.querySelectorAll('.ca-fs-run:not(.ca-fs-link)')].map(l => ({ cls: l.getAttribute('class'), n: l.getAttribute('points').split(' ').length })));
    }
    r.font = getComputedStyle(host.querySelector('.ca-fs-room-t')).fontSize;
    out[name] = r; host.remove();
  }
  return out;
}"""


def sketch_geometry_checks(page):
    """PH-4, PH-6, ADDR-8: room names stay readable, focus rings do not overlap or clip, the street arrow clears its label, and a gas
    line joins the meter only from the meter's own wall, as its own dashed link."""
    events = json.load(open(FIXTURE, encoding='utf-8'))
    flagship = next(e for e in events if e.get('kind') == 'floor_sketch')
    got = page.evaluate(SKETCH_GEOMETRY_JS, {'flagship': flagship, 'plumber': _plumber_sketch('right'), 'left': _plumber_sketch('left'), 'corner': _corner_sketch()})
    for name, r in got.items():
        check(f'sketch geometry ({name}, {r["font"]}): no marker on a room name', not r['labelOver'], ', '.join(r['labelOver']))
        check(f'sketch geometry ({name}): focus rings do not overlap other markers', not r['ringOver'], ', '.join(r['ringOver']))
        check(f'sketch geometry ({name}): no focus ring clipped by the drawing edge', not r['clipped'], ', '.join(r['clipped']))
        gaps = [round(g, 1) for g in r['arrowGap']]
        check(f'sketch geometry ({name}): the street arrow clears its label', all(g >= 3 for g in gaps), str(gaps))
    p = got['plumber']
    check('gas line: a meter on the far wall is not joined across the house', not p['links'], json.dumps(p['links']))
    left = got['left']
    gas = [x for x in left['runs'] if 'k-gas' in x['cls']]
    check('gas line: a meter on its own wall gets a separate dashed link', len(left['links']) == 1 and 'is-likely' in left['links'][0]['cls']
          and gas and gas[0]['n'] == 3 and 'is-record' in gas[0]['cls'], json.dumps(left['links']) + ' ' + json.dumps(gas))


# ── recorded-style answers replayed into the page (no backend, no model) ──────────────────────────
REPLAY = 'http://replay.test'
# Answers /health and /chat for the replay origin from window.__replay.queue (one list of events per question, each event sent after
# its __wait milliseconds), so the page streams like the live backend. Everything else goes to the network as usual.
REPLAY_SHIM = """(() => {
  const orig = window.fetch.bind(window), R = window.__replay = { queue: [], bodies: [] };
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  window.fetch = async function (url, opts = {}) {
    const u = String((url && url.url) || url);
    if (!u.startsWith('%s')) return orig(url, opts);
    const path = new URL(u).pathname;
    if (path === '/health') return json({ ok: true, llm: true, llm_state: 'ok', model: 'replay', workspace: true });
    if (path !== '/chat') return json({ ok: false }, 404);
    R.bodies.push(opts.body || '');
    const evs = R.queue.shift() || [{ type: 'text', text: 'Nothing queued.' }, { type: 'done' }], enc = new TextEncoder();
    const body = new ReadableStream({ async start(c) {
      for (const e of evs) { await new Promise(r => setTimeout(r, e.__wait ?? 25)); const x = { ...e }; delete x.__wait; c.enqueue(enc.encode('data: ' + JSON.stringify(x) + '\\n\\n')); }
      c.close(); } });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
})();""" % REPLAY


def _text_events(text, size=40):
    return [{'type': 'text', 'text': text[i:i + size]} for i in range(0, len(text), size)]


def _ask(page, q, events):
    """Queues one answer, asks q through the widget and waits until the turn is finished. Returns the finished bot turn's index."""
    n = page.evaluate("() => document.querySelectorAll('#ca-chat .ch-turn.bot').length")
    page.evaluate('evs => { window.__replay.queue.push(evs); }', events)
    page.evaluate('q => { window.__agent.state.inst.ask(q); }', q)
    done = poll(lambda: page.evaluate("""n => { const t = [...document.querySelectorAll('#ca-chat .ch-turn.bot')];
      return t.length > n && !!t.at(-1)._rec && !t.at(-1).classList.contains('ch-streaming'); }""", n), 20, 0.1)
    page.wait_for_timeout(700)   # any smooth scroll settles
    return n if done else None


TURN_JS = """i => { const t = document.querySelectorAll('#ca-chat .ch-turn.bot')[i], u = document.querySelectorAll('#ca-chat .ch-turn.user')[i];
  const R = e => e ? Math.round(e.getBoundingClientRect().top) : null;
  return { userTop: R(u), answerTop: R(t.querySelector('.ch-answer')), sketchTop: R(t.querySelector('article.ca-sketch')), minHeight: t.style.minHeight,
           height: Math.round(t.getBoundingClientRect().height), content: Math.round([...t.querySelector('.ch-col').children].reduce((s, c) => s + c.getBoundingClientRect().height, 0)),
           paras: [...t.querySelectorAll('.ch-answer > p')].map(p => p.textContent), html: t.querySelector('.ch-answer').innerHTML,
           history: window.__agent.state.inst.history.at(-1)?.text || '' }; }"""


def replay_checks(browser, site):
    events = json.load(open(FIXTURE, encoding='utf-8'))
    sketch = {**next(e for e in events if e.get('kind') == 'floor_sketch'), 'id': 'fs-replay'}
    url = f'{site}/agent.html?role={TECH}&apps=all&backend={urllib.parse.quote(REPLAY, safe=":/")}'
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce', is_mobile=True, has_touch=True)
    ctx.add_init_script(REPLAY_SHIM)
    page = ctx.new_page()
    con = Console(page, site)
    page.goto(url)
    wait_ready(page)
    poll(lambda: page.evaluate("() => !document.querySelector('.ca-kpis') ? false : true"), 5)
    page.wait_for_timeout(600)

    # PH-1: the sketch and a long answer arrive after the page scrolled the question to the top; the question must stay in view.
    answer = ' '.join(f'Step {i}: check the burner, the flame sensor and the inducer before you open the gas valve [1].' for i in range(1, 13))
    evs = [{'type': 'meta', 'model': 'replay'}, {'type': 'status', 'text': 'Checking the service area'},
           {'type': 'sources', 'sources': [{'title': 'Customer record', 'url': '', 'kind': 'sandbox'}]},
           {**sketch, '__wait': 1600}, *_text_events(answer.replace('. Step', '.\n\nStep')), {'type': 'done', 'model': 'replay'}]
    i = _ask(page, "hey I'm going to 418 Wexcombe Ln, customer says no heat", evs)
    t = page.evaluate(TURN_JS, i) if i is not None else {}
    check('phone replay: the first answer finishes', i is not None)
    check('phone replay: the question stays in view after the sketch and answer arrive (scroll anchor)', 0 <= (t.get('userTop') or -1) <= 400,
          f"question top {t.get('userTop')}, answer top {t.get('answerTop')}, sketch top {t.get('sketchTop')}")

    # PH-2: a follow-up reserves no blank space when the page, not the message list, scrolls.
    i = _ask(page, 'Text: 10 minutes out', [{'type': 'meta', 'model': 'replay'}, *_text_events('On my way, about 10 minutes out.'), {'type': 'done'}])
    t = page.evaluate(TURN_JS, i) if i is not None else {}
    check('phone replay: a follow-up turn reserves no blank min-height', i is not None and not t.get('minHeight') and t.get('height', 9999) - t.get('content', 0) < 80,
          f"min-height {t.get('minHeight')!r}, height {t.get('height')}, content {t.get('content')}")

    # D1 / copy-6 backstop: text after a tool step starts a new paragraph, once, also when the server already sent the break.
    evs = [{'type': 'meta', 'model': 'replay'}, *_text_events('Open the key emails.'), {'type': 'status', 'text': 'Opening a record'},
           *_text_events("This week's priorities are covenants."), {'type': 'status', 'text': 'Opening a record'},
           {'type': 'text', 'text': '\n\nLate reporting is next.'}, {'type': 'done'}]
    i = _ask(page, 'What needs my attention?', evs)
    t = page.evaluate(TURN_JS, i) if i is not None else {}
    paras = t.get('paras') or []
    check('answer steps: text after a tool step is its own paragraph, with no doubled break', paras == ['Open the key emails.', "This week's priorities are covenants.", 'Late reporting is next.'], json.dumps(paras))
    # PH-5: the text kept for the history (and Copy, Read aloud) keeps paragraph and list breaks.
    i = _ask(page, 'List the checks', [{'type': 'meta', 'model': 'replay'}, *_text_events('Check these first.\n\n- Filter\n- Flame sensor\n\nThen call the office.'), {'type': 'done'}])
    t = page.evaluate(TURN_JS, i) if i is not None else {}
    check('answer text for copy and history keeps paragraph and list breaks', t.get('history') == 'Check these first.\n\n- Filter\n- Flame sensor\n\nThen call the office.', repr(t.get('history')))

    # D2: a markdown pipe table renders as a table; number columns are right-aligned.
    table = 'Here is the month.\n| Month | Revenue | vs plan |\n|---|---|---|\n| Aug | $4.1M | -2.0% |\n| Sept | $4.3M | +1.5% |\n\nSept beat plan.'
    i = _ask(page, 'This month vs plan', [{'type': 'meta', 'model': 'replay'}, *_text_events(table, 23), {'type': 'done'}])
    tb = page.evaluate("""i => { const a = document.querySelectorAll('#ca-chat .ch-turn.bot')[i].querySelector('.ch-answer');
      return { wrapped: a.querySelectorAll('.ch-tbl > table').length, rows: a.querySelectorAll('tbody tr').length, tdn: a.querySelectorAll('td.n').length,
               thn: a.querySelectorAll('th.n').length, pipes: [...a.querySelectorAll('p')].some(p => p.textContent.includes('|')),
               history: window.__agent.state.inst.history.at(-1)?.text || '' }; }""", i) if i is not None else {}
    check('markdown table: renders as a table with right-aligned number columns', tb.get('wrapped') == 1 and tb.get('rows') == 2 and tb.get('tdn') == 4 and tb.get('thn') == 2 and not tb.get('pipes'), json.dumps(tb)[:200])

    # D4 / copy-3 / D6: cited sources lead the chips (numbers unchanged), links and Open use cited sources only, labels stay in their pills.
    srcs = [{'title': 'https://portal.ct.gov/-/media/deep/water/municipal_wastewater/cwffy26-27-draft-prioirty-list-with-tables-12-29-25.pdf?rev=d7e5d1bb&hash=8A92AE0D', 'url': 'https://portal.ct.gov/-/media/deep/water/list.pdf?rev=d7e5', 'kind': 'reference'},
            {'title': 'CET wastewater-plant targets: summary', 'url': 'https://example.org/cet-targets', 'kind': 'research'},
            {'title': 'News and insights', 'url': 'https://example.org/news', 'kind': 'web'},
            {'title': 'Plant upgrade notes', 'url': 'https://example.org/notes', 'kind': 'web'},
            {'title': 'Lender update', 'url': 'https://example.org/lender', 'kind': 'web'},
            {'title': 'Thread: covenant test', 'url': '', 'kind': 'sandbox'},
            {'title': 'Deal: pipeline review', 'url': '', 'kind': 'sandbox'},
            {'title': 'https://portal.ct.gov/-/media/deep/water/municipal_wastewater/priority_list_with_tables.pdf?rev=1', 'url': 'https://portal.ct.gov/-/media/deep/water/municipal_wastewater/priority_list_with_tables.pdf?rev=1', 'kind': 'web', 'publisher': 'CT DEEP'},
            {'title': 'A very long public page title about wastewater treatment plant upgrades across Connecticut and Rhode Island', 'url': 'https://example.org/long', 'kind': 'web'}]
    evs = [{'type': 'meta', 'model': 'replay'}, {'type': 'sources', 'sources': srcs},
           *_text_events('Covenant tests are close [6][7]. The state list is out [8]. Upgrades continue [9].'), {'type': 'done'}]
    i = _ask(page, 'Draft IC agenda', evs)
    s = page.evaluate("""i => { const t = document.querySelectorAll('#ca-chat .ch-turn.bot')[i], box = t.querySelector('.ch-links');
      const links = [...t.querySelectorAll('.ch-links .ch-link')];
      return { chips: [...t.querySelectorAll('.ch-cites .ch-cite:not(.more) .n')].map(n => n.textContent),
               chipLabels: [...t.querySelectorAll('.ch-cites .ch-cite:not(.more) .t')].map(n => n.textContent),
               links: links.map(a => a.getAttribute('href')), open: t.querySelector('[data-act="open"]')?.getAttribute('href') || null,
               labels: links.map(a => a.textContent.trim()),
               pills: links.map(a => { const r = a.getBoundingClientRect(), b = box.getBoundingClientRect(), x = a.querySelector('.t');
                 return { h: Math.round(r.height), inside: r.left >= b.left - 1 && r.right <= b.right + 1, cut: !!x && x.scrollWidth > x.clientWidth }; }) }; }""", i) if i is not None else {}
    check('source chips: cited sources first, each keeping its number', (s.get('chips') or [])[:4] == ['6', '7', '8', '9'], json.dumps(s.get('chips')))
    check('related links and Open: only cited sources', s.get('links') == [srcs[7]['url'], srcs[8]['url']] and s.get('open') == srcs[7]['url'], json.dumps({k: s.get(k) for k in ('links', 'open')}))
    check('source labels: a document titled with its address shows its publisher, not the URL',
          not any('http' in x or '?' in x for x in (s.get('labels') or []) + (s.get('chipLabels') or [])) and (s.get('labels') or [''])[0].startswith('CT DEEP'), json.dumps(s.get('labels')))
    pills = s.get('pills') or []
    check('link pills: one line, inside the row, long labels cut with an ellipsis', pills and all(p['h'] <= 32 and p['inside'] for p in pills) and pills[-1]['cut'], json.dumps(pills))
    check('no console errors (replay)', not con.errors, '; '.join(con.errors[:3]))
    ctx.close()


def desktop_role_list_checks(browser, site):
    """One role control: on laptops the top bar's Viewing as switch picks the role. The page shows no role list of its own, the
    role card's Change role is visible and opens the switch, and the agent and the apps fill the width."""
    for w, h in ((1440, 900), (1024, 768)):
        for role in ('bsp-managing-partner', 'fh-ecommerce-manager'):
            ctx, page = new_page(browser, w, h)
            page.goto(f'{site}/agent.html?role={role}&backend=off')
            wait_ready(page)
            page.wait_for_timeout(400)
            r = page.evaluate("""() => ({ list: document.querySelectorAll('.ca-roles').length, change: !!document.querySelector('.ca-change')?.offsetParent,
              sw: document.documentElement.scrollWidth, apps: Math.round(document.getElementById('apps').getBoundingClientRect().top) })""")
            page.locator('.ca-change').click()
            opened = poll(lambda: page.locator('#sys-viewas-pop').is_visible(), 3)
            check(f'{w} px {role}: no page role list, Change role opens the switch, no sideways scroll',
                  r['list'] == 0 and r['change'] and opened and r['sw'] == w, json.dumps(r))
            ctx.close()


def embed_checks(browser, site):
    """R9: inside the shell (?embed=1) only today's list, the question box and the answers; links to other pages open on top."""
    for w, h in ((1440, 900), (390, 844)):
        ctx, page = new_page(browser, w, h)
        con = Console(page, site)
        page.goto(f'{site}/agent.html?role=pp-dispatcher&backend=off&embed=1')
        page.wait_for_function("() => !!(window.__agent && document.querySelector('#ca-chat textarea'))", timeout=15000)
        page.wait_for_timeout(300)
        shown = page.evaluate("""() => ['.sys-top', '.sys-subnav', '.sys-hero', '.ca-roles', '.ca-role-head', '#apps', '#access', '.ca-about-sec', '[data-sys-footer]']
          .filter(s => [...document.querySelectorAll(s)].some(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed' && e.getClientRects().length))""")
        home = page.locator('.ca-home .ca-row').count()
        check(f'embed {w} px: no bar, role card, apps or access table; today and the question box show',
              not shown and home > 0 and page.locator('#ca-chat textarea').is_visible(), json.dumps(shown))
        target = page.evaluate("""() => { const a = document.createElement('a'); a.href = 'app.html#/home/overview'; a.textContent = 'x';
          document.querySelector('.ca-home').append(a); let t = null;
          addEventListener('click', e => { t = a.target; e.preventDefault(); }, { once: true }); a.click(); a.remove(); return t; }""")
        check(f'embed {w} px: a link to another page opens in the top window', target == '_top', str(target))
        sw = page.evaluate('document.documentElement.scrollWidth')
        check(f'embed {w} px: no sideways scroll, no console errors', sw == w and not con.errors, f'{sw}; ' + '; '.join(con.errors[:2]))
        ctx.close()


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
                replay_checks(browser, site)
                desktop_role_list_checks(browser, site)
                embed_checks(browser, site)
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
