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

    def pick(role):
        # the sheet maps every role at once: open it and press the role
        page.locator('.ca-role-head .ca-change').click()
        opened = poll(lambda: pop.is_visible(), 3)
        pop.locator(f'.sys-viewas-role[data-role="{role}"]').click()
        page.wait_for_timeout(300)
        return opened

    check('Change role opens the Viewing as switch', pick('bsp-managing-partner'))
    check('the Viewing as sheet closes after the pick', not pop.is_visible())
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
    pick('pp-ceo')
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
      const reach = k => (k.ring ? 19.25 : 15);   // focus ring r 18 + half its 2.5 stroke; marker r 14 + half its 2 stroke (CSS px since the plan is drawn at the card's width)
      for (const t of svg.querySelectorAll('.ca-fs-room-t')) { const b = t.getBBox();
        for (const k of marks) { const d = Math.hypot(Math.max(b.x - k.x, 0, k.x - (b.x + b.width)), Math.max(b.y - k.y, 0, k.y - (b.y + b.height))); if (d < reach(k)) r.labelOver.push(`${k.t} on ${t.textContent}`); } }
      for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) { const a = marks[i], b = marks[j];
        if ((a.ring || b.ring) && Math.hypot(a.x - b.x, a.y - b.y) < reach(a) + reach(b)) r.ringOver.push(`${a.t}/${b.t}`); }
      for (const k of marks.filter(k => k.ring)) if (k.x - reach(k) < vb.x || k.x + reach(k) > vb.x + vb.width || k.y - reach(k) < vb.y || k.y + reach(k) > vb.y + vb.height) r.clipped.push(k.t);
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


# ── wave 3: the signature question, live floor plans, pictures and the globe ─────────────────────
PREPARED = os.path.join(ROOT, 'data', 'agent', 'prepared.json')
VIEWS = os.path.join(ROOT, 'data', 'agent', 'views_samples.json')
SITE_CARD = os.path.join(ROOT, 'server', 'tests', 'fixtures', 'site', 'nj_full.json')
# a firm role, a company office role and a field role, each with its own picture
# a firm role with ranked bars (the partner's catalogue question is now its live deals board), a company office role, a field role
SIG_ROLES = (('bsp-associate', 'ranked_bars'), ('cet-estimator', 'pipeline_board'), ('pp-plumber', 'floor_sketch'))
# the 3D view's pinned three.js (WAVE3 ruling 11), the only other host a page here may load
THREE_RX = re.compile(r'^https://(unpkg\.com|cdn\.jsdelivr\.net/npm)/three@\d+\.\d+\.\d+/')
SIZES = ((1440, 900, False), (390, 844, True), (1440, 900, True), (390, 844, False))


def _offline_ctx(browser, site, w, h, dark):
    """A context in which nothing but the local site loads (fonts aside): no backend, no model, no other host."""
    ctx, page = new_page(browser, w, h, dark=dark, reduced=True)
    outside = []

    def route(r):
        u = r.request.url
        if u.startswith(site) or 'fonts.googleapis.com' in u or 'fonts.gstatic.com' in u or THREE_RX.match(u):
            return r.continue_()
        outside.append(u)
        return r.abort()
    ctx.route('**/*', route)
    return ctx, page, outside


def signature_checks(browser, site, catalog):
    """The role's signature question is the first chip; one tap shows the prepared answer from data/agent/prepared.json with the
    backend off: its text, its picture through renderCard, the draft card and the "Waiting for approval" list. No model call."""
    prepared = json.load(open(PREPARED, encoding='utf-8'))['roles']
    roles = {r['id']: r for r in catalog['roles']}
    for role, kind in SIG_ROLES:
        for w, h, dark in SIZES:
            label = f"signature {role} {w} px {'dark' if dark else 'light'}"
            ctx, page, outside = _offline_ctx(browser, site, w, h, dark)
            con = Console(page, site)
            posts = []
            page.on('request', lambda r: r.method == 'POST' and posts.append(r.url))
            page.goto(f'{site}/agent.html?role={role}&backend=off')
            wait_ready(page)
            page.wait_for_timeout(300)
            first = page.evaluate("""() => { const all = [...document.querySelectorAll('#ca-chat button.sys-chip, #ca-chat button.ch-chip')].filter(b => b.offsetParent);
              return all[0] ? { text: all[0].textContent.trim(), sig: all[0].dataset.ca === 'sig' } : null; }""")
            want_q = roles[role]['signature']['question']
            check(f'{label}: the first chip is the signature question', first and first['sig'] and first['text'] == want_q, json.dumps(first))
            page.locator('[data-ca="sig"]').click()
            ok = poll(lambda: page.evaluate("() => !!document.querySelector('#ca-chat .ch-turn.bot[data-prepared] .ch-answer p')"), 8)
            got = page.evaluate("""() => { const t = document.querySelector('#ca-chat .ch-turn.bot[data-prepared]'); if (!t) return {};
              return { q: [...document.querySelectorAll('#ca-chat .ch-turn.user')].at(-1)?.textContent.trim(), text: t.querySelector('.ch-answer').textContent.trim(),
                       kinds: [...t.querySelectorAll('.ch-blocks > *')].map(e => e.querySelector('[data-av-kind]')?.dataset.avKind || (e.matches('.ca-sketch') ? 'floor_sketch' : e.matches('.ca-draft') ? 'action_draft' : e.className)),
                       draft: t.querySelector('.ca-draft .sys-card-title')?.textContent.trim() || '' }; }""")
            if kind != 'floor_sketch':
                poll(lambda: page.evaluate(f"() => !!document.querySelector('#ca-chat [data-av-kind=\"{kind}\"]')"), 6)
                got['kinds'] = page.evaluate("""() => [...document.querySelectorAll('#ca-chat .ch-turn.bot[data-prepared] .ch-blocks > *')].map(e => e.querySelector('[data-av-kind]')?.dataset.avKind || (e.matches('.ca-draft') ? 'action_draft' : e.className))""")
            p = prepared[role]
            draft = next(c for c in p['cards'] if c.get('kind') == 'action_draft')
            check(f'{label}: the answer is the prepared text under the question', ok and got.get('q') == want_q and got.get('text') == p['text'], json.dumps(got)[:200])
            check(f'{label}: the picture ({kind}) and the draft render through renderCard', got.get('kinds') == [kind, 'action_draft'] and got.get('draft') == draft['title'], json.dumps(got.get('kinds')))
            appr = page.evaluate("JSON.parse(localStorage.getItem('bsp-os-approvals') || '[]')")
            check(f'{label}: the draft is in Waiting for approval', any(a.get('id') == draft['id'] and a.get('status') == 'draft' and a.get('role') == role for a in appr), json.dumps(appr)[:160])
            sw = page.evaluate('document.documentElement.scrollWidth')
            check(f'{label}: no model call, no other host, no sideways scroll, no console errors',
                  not posts and not outside and sw == w and not con.errors, json.dumps({'posts': posts[:2], 'outside': outside[:2], 'sw': sw, 'errors': con.errors[:2]}))
            ctx.close()
    # the managing partner's question is the best-three globe tour: its own line, the tour on the globe, the post retitled
    ctx, page, outside = _offline_ctx(browser, site, 1440, 900, False)
    page.goto(f'{site}/agent.html?role=bsp-managing-partner&backend=off')
    wait_ready(page)
    page.evaluate("() => { window.__sent = []; window.MapCmd = { run: c => { window.__sent.push(c); return c; } }; }")
    page.locator('[data-ca="sig"]').click()
    poll(lambda: page.evaluate("() => !!document.querySelector('#ca-chat .ch-turn.bot[data-prepared] .ca-draft')"), 8)
    r = page.evaluate("""() => { const t = document.querySelector('#ca-chat .ch-turn.bot[data-prepared]');
      return { text: t.querySelector('.ch-answer').textContent, sent: window.__sent, map: t.querySelectorAll('.ca-map [data-ca="map"]').length,
               draft: t.querySelector('.ca-draft .sys-card-title')?.textContent }; }""")
    check('signature bsp-managing-partner: the best-three tour runs once, with its own line and the post retitled',
          r['sent'] == [{'tour': 'best3'}] and r['map'] == 1 and 'Midland' in r['text'] and r['draft'] == 'Post the three targets to the partners channel' and not outside, json.dumps(r)[:240])
    ctx.close()


CARD_JS = """async ([card, opts]) => {
  const m = await import('./assets/agent-cards.js');
  let box = document.getElementById('ca-t'); if (!box) { box = document.createElement('div'); box.id = 'ca-t'; document.querySelector('.ca-main').prepend(box); }
  const turn = document.createElement('div'); turn.className = 'ch-turn bot'; turn.innerHTML = '<span class="ch-avatar sm" aria-hidden="true"></span><div class="ch-col"><div class="ch-blocks"></div></div>'; box.append(turn);
  const el = window.__agent.state.cards.renderCard(card, { turn, widget: { root: box }, live: !!opts.live });
  if (el) { el.dataset.cardId = card.id; turn.querySelector('.ch-blocks').append(el); }
  return true;
}"""


def live_card_checks(browser, site):
    """A live floor_sketch card (a recorded public-building card): the real outline behind the plan, the place chip, the key, the
    facts in a closed section, no "Example address"; the 3D control opens and closes cleanly; a company-record card keeps
    "Example address". 1440x900 and 390x844, light and dark."""
    fx = json.load(open(SITE_CARD, encoding='utf-8'))
    live, cmd_card = fx['card'], fx['map_command']
    sandbox = json.load(open(PREPARED, encoding='utf-8'))['roles']['pp-plumber']['cards'][0]
    for w, h, dark in SIZES:
        label = f"live card {w} px {'dark' if dark else 'light'}"
        ctx, page, outside = _offline_ctx(browser, site, w, h, dark)
        con = Console(page, site)
        page.goto(f'{site}/agent.html?role=pp-dispatcher&backend=off')
        wait_ready(page)
        page.evaluate(CARD_JS, [live, {}])
        r = page.evaluate("""() => { const a = document.querySelector('#ca-t article.ca-sketch'), svg = a.querySelector('.ca-fs-svg:not([hidden]) svg');
          const poly = svg.querySelector('polygon.ca-fs-outline'), d = a.querySelector('details.ca-facts');
          const P = poly ? poly.getAttribute('points').trim().split(/\\s+/).map(q => q.split(',').map(Number)) : [], rect = svg.querySelector('rect.ca-fs-wall');
          const ext = P.length ? [Math.max(...P.map(q => q[0])) - Math.min(...P.map(q => q[0])), Math.max(...P.map(q => q[1])) - Math.min(...P.map(q => q[1]))] : [];
          return { outline: P.length, ext, rect: !!rect, has: svg.classList.contains('has-outline'),
                   place: a.querySelector('.ca-fs-place')?.textContent || '', precision: a.querySelector('.ca-fs-place')?.dataset.precision,
                   title: a.querySelector('.ca-fs-title').textContent, dated: a.querySelector('.ca-fs-outline-t')?.textContent || '',
                   key: [...a.querySelectorAll('.ca-legend [data-basis]')].map(s => s.dataset.basis + ':' + s.textContent),
                   factsOpen: d ? d.open : null, facts: d ? d.querySelectorAll('.ca-fact-list > div').length : 0, srcs: d ? d.querySelectorAll('.ca-fact-src').length : 0,
                   srcList: d ? d.querySelectorAll('.ca-fact-srcs li').length : 0, text: a.innerText, wide: a.scrollWidth - a.clientWidth,
                   map: a.querySelectorAll('.ca-map-btn').length }; }""")
        ring = len(live['building']['footprint']['ring_m']) - 1   # recorded closed; drawn open
        check(f'{label}: the real outline is drawn behind the plan', r['outline'] == ring and r['has'], f"{r['outline']} points vs {ring}")
        f0 = live['floors'][0]
        ratio = (r['ext'][0] / r['ext'][1]) / (f0['w'] / f0['h']) if len(r['ext']) == 2 and r['ext'][1] else 0
        check(f'{label}: the outline is the wall, square on the plan (no bounding rectangle; proportions within 5%)', not r['rect'] and abs(ratio - 1) < 0.05, f"rect {r['rect']}, ratio {ratio:.3f}")
        check(f'{label}: place chip with the typed address and its precision, title is the typed address',
              live['address'] in r['place'] and 'Parcel match' in r['place'] and r['precision'] == 'parcel' and r['title'] == live['address'], r['place'])
        check(f'{label}: outline date shown', r['dated'].startswith('Outline from imagery dated Aug 2024'), r['dated'])
        check(f'{label}: the key names public record and likely, no company record',
              r['key'] == ['public:Public record', 'likely:Likely, confirm on site'], json.dumps(r['key']))
        nf = len(live['facts']) + (1 if live.get('permits') else 0)
        check(f'{label}: facts sit in a closed section, each with its source and date', r['factsOpen'] is False and r['facts'] == nf and r['srcs'] == nf and r['srcList'] == len(live['sources']),
              json.dumps({k: r[k] for k in ('factsOpen', 'facts', 'srcs', 'srcList')}))
        check(f'{label}: no "Example address", sandbox or fictional words on a live card', not re.search(r'example address|sandbox|fictional', r['text'], re.I))
        check(f'{label}: "Show on map" built from the place', r['map'] == 1)
        # 3D: opens assets/house3d.js under the plan, and a second press removes it cleanly
        btn = page.locator('#ca-t article.ca-sketch [data-ca="3d"]')
        btn.click()
        opened = poll(lambda: page.evaluate("() => { const h = document.querySelector('#ca-t .ca-3d'); return !h.hidden && !!h.querySelector('.h3, p.sys-src:not(.ca-3d-wait)'); }"), 10)
        mod = page.evaluate("() => [...performance.getEntriesByType('resource')].some(e => /assets\\/house3d\\.js\\?v=/.test(e.name))")
        check(f'{label}: 3D opens the house view (lazy, stamped import)', opened and mod and btn.get_attribute('aria-expanded') == 'true')
        btn.click()
        gone = page.evaluate("() => { const h = document.querySelector('#ca-t .ca-3d'); return h.hidden && h.childElementCount === 0; }")
        check(f'{label}: a second press removes the 3D view', gone and btn.get_attribute('aria-expanded') == 'false')
        # a company-record card (example data) still says so
        page.evaluate(CARD_JS, [{**sandbox, 'id': 'fs-sbx'}, {}])
        ex = page.evaluate("() => [...document.querySelectorAll('#ca-t article.ca-sketch')].at(-1).querySelector('.ca-fs-ex')?.textContent || ''")
        key = page.evaluate("() => [...[...document.querySelectorAll('#ca-t article.ca-sketch')].at(-1).querySelectorAll('.ca-legend [data-basis]')].map(s => s.textContent)")
        check(f'{label}: a company-record card shows "Example address" and "Company record (example data)"', ex == 'Example address' and 'Company record (example data)' in key, json.dumps([ex, key]))
        sw = page.evaluate('document.documentElement.scrollWidth')
        check(f'{label}: no sideways scroll, nothing outside the site, no console errors', sw == w and r['wide'] <= 1 and not outside and not con.errors,
              json.dumps({'sw': sw, 'wide': r['wide'], 'outside': outside[:2], 'errors': con.errors[:2]}))
        ctx.close()


# ── the plan drawing rules (FLOORPLAN_SPEC R1, R2, R3, R4, R6, R7): cards built to the new card contract ───────────────────
def _plan_card(scale=1.0, large=False):
    """An L-shaped two-storey house (or, large=True, the same outline as a building with no rooms) in the new card contract:
    a real outline (metres, north up, street to the south), rooms with short names, square runs with risers. `scale` grows or
    shrinks the whole building so the glyph checks can see that text and markers keep their size."""
    k = scale
    ft = 0.3048
    ring = [[0, 0], [36.3 * ft * k, 0], [36.3 * ft * k, 9.9 * ft * k], [56 * ft * k, 9.9 * ft * k], [56 * ft * k, 33 * ft * k], [0, 33 * ft * k]]
    room = lambda lab, sh, x0, y0, x1, y1: {'x': x0 * k, 'y': y0 * k, 'w': (x1 - x0) * k, 'h': (y1 - y0) * k, 'label': lab, 'short': sh, 'kind': 'room', 'floor': 'first', 'basis': 'likely'}  # noqa: E731
    item = lambda s, x, y: {'kind': 'fixture_shutoffs', 'label': 'Fixture shutoffs', 'short': s, 'basis': 'likely', 'focus': True, 'note': 'Under each sink', 'x': x * k, 'y': y * k}  # noqa: E731
    pts = lambda *q: [[x * k, y * k] for x, y in q]  # noqa: E731
    rooms = [room('Kitchen', 'Kitchen', 0, 0, 16, 13), room('Dining', 'Dining', 16, 0, 28, 13), room('Family room', 'Family', 28, 0, 56, 13),
             room('Half bath', 'Half ba', 0, 13, 6, 23.1), room('Stairs', 'Stairs', 6, 13, 16, 23.1), room('Hall', 'Hall', 16, 13, 36.3, 23.1),
             room('Garage', 'Garage', 36.3, 13, 56, 23.1), room('Living room', 'Living', 0, 23.1, 22, 33), room('Den', 'Den', 22, 23.1, 36.3, 33)]
    runs = [{'kind': 'water', 'label': 'Water', 'basis': 'likely', 'points': pts((8, 1.6), (7.5, 1.6), (7.5, 12), (3, 12), (3, 21.6)), 'risers': [[7.5 * k, 12 * k, 'down']]},
            {'kind': 'drain', 'label': 'Drain', 'basis': 'likely', 'points': pts((9.5, 1.6), (9.5, 4), (4.5, 4), (4.5, 12.6), (1.5, 12.6), (1.5, 20)), 'risers': [[4.5 * k, 12.6 * k, 'down']]}]
    floor = {'id': 'first', 'name': 'First floor', 'w': 56 * k, 'h': 33 * k, 'rooms': rooms, 'items': [item('FX', 8, 1.6), item('FX', 3, 21.6)], 'runs': runs, 'wet_walls': []}
    card = {'type': 'card', 'kind': 'floor_sketch', 'id': f'fs-plan-{k}-{large}', 'address': '1 Plan Test Rd', 'basis': 'likely', 'front': 'bottom', 'example': False,
            'focus': ['fixture_shutoffs'], 'floors': [floor], 'outside': [], 'layout': {'from': 'outline', 'basis': 'likely'},
            'place': {'lat': 40.05, 'lon': -76.3, 'precision': 'parcel', 'label': '1 Plan Test Rd'},
            'building': {'kind': 'house', 'frame': {'origin': {'lat': 40.05, 'lon': -76.3}, 'units': 'm'}, 'footprint': {'ring_m': ring, 'basis': 'public'},
                         'front': {'bearing_deg': 180, 'basis': 'public'}}}
    if large:
        card['floors'] = [{'id': 'first', 'name': 'Ground floor', 'w': 56 * k, 'h': 33 * k, 'rooms': [], 'items': [], 'runs': [], 'wet_walls': []}]
        card['building']['kind'] = 'large'
        card['layout'] = {'from': 'none', 'basis': 'likely', 'note': 'Interior layout is not on public record.'}
        card['outside'] = [{'kind': 'main_water', 'label': 'Water service', 'short': 'W', 'side': 'front', 'at': 0.3, 'floor': 'first', 'basis': 'likely', 'focus': True,
                            'note': 'Building shutoff in the mechanical room; ask the site contact'}]
        card['focus'] = ['main_water']
    return card


PLAN_JS = """async (card) => {
  const m = await import('./assets/agent-cards.js');
  document.getElementById('ca-plan')?.remove();
  const host = document.createElement('div'); host.id = 'ca-plan'; document.querySelector('.ca-main').prepend(host);
  const a = m.renderCard(card, { widget: { root: host } }); host.append(a);
  await new Promise(r => setTimeout(r, 400));
  return true;
}"""
PLAN_MEASURE = """() => {
  const a = document.querySelector('#ca-plan article.ca-sketch'), box = a.querySelector('.ca-fs-svg:not([hidden])'), svg = box.querySelector('svg.ca-fs');
  const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  const R = e => { const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };
  const fonts = [...svg.querySelectorAll('text')].map(t => parseFloat(getComputedStyle(t).fontSize) * k);
  const marks = [...svg.querySelectorAll('g.ca-fs-m')].map(g => [...g.querySelectorAll('circle')].map(c => +c.getAttribute('r') * 2 * k));
  const centre = [...svg.querySelectorAll('g.ca-fs-m')].map(g => { const c = g.querySelector('circle:not(.ca-fs-ring):not(.ca-fs-halo)'), r = c.getBoundingClientRect(), ring = !!g.querySelector('.ca-fs-ring');
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, reach: (ring ? 19.25 : 15) * k }; });
  const names = [...svg.querySelectorAll('.ca-fs-room-t')].map(t => ({ t: t.textContent, ...R(t) }));
  const rooms = [...svg.querySelectorAll('rect.ca-fs-room')].map(R);
  const hit = (p, q) => p.x0 < q.x1 - 0.5 && q.x0 < p.x1 - 0.5 && p.y0 < q.y1 - 0.5 && q.y0 < p.y1 - 0.5;
  const nameOverlaps = [], nameOnMarker = [], nameOutside = [];
  names.forEach((n, i) => {
    names.slice(i + 1).forEach(o => { if (hit(n, o)) nameOverlaps.push(n.t + ' / ' + o.t); });
    centre.forEach(c => { if (Math.hypot(Math.max(n.x0 - c.x, 0, c.x - n.x1), Math.max(n.y0 - c.y, 0, c.y - n.y1)) < c.reach) nameOnMarker.push(n.t); });
    if (!rooms.some(r => n.x0 >= r.x0 - 1 && n.x1 <= r.x1 + 1 && n.y0 >= r.y0 - 1 && n.y1 <= r.y1 + 1)) nameOutside.push(n.t);
  });
  const dash = e => e ? getComputedStyle(e).strokeDasharray : null;
  const runs = [...svg.querySelectorAll('.ca-fs-run:not(.ca-fs-link)')];
  const diag = runs.filter(p => { const q = p.getAttribute('points').trim().split(/\\s+/).map(v => v.split(',').map(Number)); return q.some((v, i) => i && Math.abs(v[0] - q[i - 1][0]) > 0.5 && Math.abs(v[1] - q[i - 1][1]) > 0.5); }).length;
  return { k, width: svg.viewBox.baseVal.width, inner: box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight),
    fonts: [Math.min(...fonts), Math.max(...fonts)], marks: [Math.min(...marks.flat()), Math.max(...marks.flat())],
    rect: svg.querySelectorAll('rect.ca-fs-wall').length, outline: dash(svg.querySelector('polygon.ca-fs-outline')), roomDash: dash(svg.querySelector('rect.ca-fs-room')),
    runDash: runs.map(dash), rounded: runs.every(p => /Q/.test(p.getAttribute('d'))), diag, risers: svg.querySelectorAll('.ca-fs-riser').length,
    riserKey: !!a.querySelector('.ca-legend [data-key="riser"]'), names: names.map(n => n.t), nameOverlaps, nameOnMarker, nameOutside,
    dims: [...svg.querySelectorAll('.ca-fs-dim-t')].map(t => t.textContent), north: svg.querySelectorAll('.ca-fs-north').length,
    street: svg.querySelector('.ca-fs-street')?.textContent || '', note: [...svg.querySelectorAll('.ca-fs-note')].map(t => t.textContent).join(' '),
    roomsN: svg.querySelectorAll('.ca-fs-room').length, runsN: runs.length, text: a.innerText + ' ' + svg.getAttribute('aria-label') };
}"""


def _dims_ok(r):
    """R7: the width and the depth in feet on two sides, or on a phone with outside markers on both sides one figure "56 ft × 33 ft"."""
    return sorted(r['dims']) == ['33 ft', '56 ft'] or (r['width'] < 480 and r['dims'] == ['56 ft × 33 ft'])


def _basement_card():
    """The L-shaped house's basement as a phone sees it at its worst: an outside marker on each side wall (electric meter left,
    heat pump right), two focus markers at the front wall, three more inside, and a run that only passes through (points [S, S])."""
    card = _plan_card(1.0)
    room = lambda lab, sh, x0, y0, x1, y1: {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'label': lab, 'short': sh, 'kind': 'room', 'floor': 'basement', 'basis': 'likely'}  # noqa: E731
    item = lambda kind, lab, s, x, y, focus: {'kind': kind, 'label': lab, 'short': s, 'basis': 'likely', 'focus': focus, 'note': 'Likely', 'x': x, 'y': y}  # noqa: E731
    card['floors'] = [{'id': 'basement', 'name': 'Basement', 'w': 56, 'h': 33, 'wet_walls': [],
                       'rooms': [room('Storage', 'Storage', 0, 0, 16, 13), room('Utility', 'Utility', 16, 0, 36.3, 13), room('Workshop', 'Shop', 36.3, 0, 56, 23.1),
                                 room('Rec room', 'Rec rm', 0, 13, 36.3, 33)],
                       'items': [item('main_water', 'Main water shutoff', 'W', 8.4, 31.4, True), item('sewer_cleanout', 'Sewer cleanout', 'C', 28, 31.5, True),
                                 item('water_heater', 'Water heater', 'WH', 34.8, 1.6, False), item('air_handler', 'Air handler', 'AH', 18.2, 23.8, False),
                                 item('panel', 'Electrical panel', 'P', 1.6, 16.5, False)],
                       'runs': [{'kind': 'water', 'label': 'Water', 'basis': 'likely', 'points': [[8.4, 31.4], [8.4, 1.6], [34.8, 1.6]]},
                                {'kind': 'drain', 'label': 'Drain', 'basis': 'likely', 'points': [[28, 31.5], [32.4, 31.5], [32.4, 11.2]], 'risers': [[32.4, 11.2, 'up']]},
                                {'kind': 'water', 'label': 'Water', 'basis': 'likely', 'points': [[6.6, 8.3], [6.6, 8.3]], 'risers': [[6.6, 8.3, 'up']]}]}]
    card['outside'] = [{'kind': 'heat_pump', 'label': 'Heat pump', 'short': 'HP', 'floor': 'basement', 'side': 'right', 'at': 0.35, 'basis': 'likely', 'note': 'Outside on a pad'},
                       {'kind': 'electric_meter', 'label': 'Electric meter', 'short': 'EM', 'floor': 'basement', 'side': 'left', 'at': 0.5, 'basis': 'likely', 'note': 'Outside'}]
    card['focus'] = ['main_water', 'sewer_cleanout']
    card['id'] = 'fs-plan-basement'
    return card


PHONE_MEASURE = """() => {
  const svg = document.querySelector('#ca-plan .ca-fs-svg:not([hidden]) svg.ca-fs'), sr = svg.getBoundingClientRect();
  const ol = svg.querySelector('[data-outline]'), ob = ol.getBoundingClientRect(), ctm = ol.getScreenCTM(), k = sr.width / svg.viewBox.baseVal.width;
  const P = [...ol.points].map(p => { const q = p.matrixTransform(ctm); return [q.x, q.y]; });
  const inPoly = (x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const segD = (x, y, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - ax - t * dx, y - ay - t * dy); };
  const outerOf = c => { const r = c.getBoundingClientRect(); return r.width / 2 + parseFloat(getComputedStyle(c).strokeWidth) * k / 2; };
  const marks = [...svg.querySelectorAll('g.ca-fs-m')].map(g => {
    const c = g.querySelector('circle:not(.ca-fs-ring):not(.ca-fs-halo)'), ring = g.querySelector('.ca-fs-ring'), r = c.getBoundingClientRect();
    const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2, outer = outerOf(ring || c);
    return { t: g.textContent.trim(), x, y, outer, inside: inPoly(x, y), wall: Math.min(...P.map((p, i) => segD(x, y, p, P[(i + 1) % P.length]))) };
  });
  const close = [], crossing = [];
  marks.forEach((a, i) => marks.slice(i + 1).forEach(b => { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < a.outer + b.outer + 2 - 0.3) close.push(`${a.t}/${b.t} ${d.toFixed(1)} < ${(a.outer + b.outer + 2).toFixed(1)}`); }));
  for (const m of marks) if (m.inside && m.wall < m.outer - 2 - 0.3) crossing.push(`${m.t} ${m.wall.toFixed(1)}`);
  const runs = [...svg.querySelectorAll('.ca-fs-run')].map(p => p.getAttribute('points').trim().split(/\\s+/).map(v => v.split(',').map(Number)));
  const still = runs.filter(q => q.every(v => Math.abs(v[0] - q[0][0]) < 0.5 && Math.abs(v[1] - q[0][1]) < 0.5)).length;
  return { width: svg.viewBox.baseVal.width, share: ob.width / sr.width, close, crossing, still, risers: svg.querySelectorAll('.ca-fs-riser').length,
    marks: marks.length, sizes: [...svg.querySelectorAll('g.ca-fs-m circle:not(.ca-fs-halo)')].map(c => Math.round(c.getBoundingClientRect().width)),
    fonts: Math.min(...[...svg.querySelectorAll('text')].map(t => parseFloat(getComputedStyle(t).fontSize) * k)),
    dims: [...svg.querySelectorAll('.ca-fs-dim-t')].map(t => t.textContent), sideways: document.documentElement.scrollWidth > innerWidth + 1 };
}"""


def plan_phone_checks(browser, site):
    """On a phone the house plan fills the frame (N1: the outline at least 72% of the drawing's width under 480 px, even with an
    outside marker on each side wall; no smaller at 768 and 1100 than before), markers never sit on each other and an inside
    marker's ring crosses the wall by under 2 px (N2, at every width), and a run that only passes through draws no line or dot,
    only its riser ring (N3)."""
    ctx, page, outside = _offline_ctx(browser, site, 1280, 900, False)
    con = Console(page, site)
    page.goto(f'{site}/agent.html?role=pp-dispatcher&backend=off')
    wait_ready(page)
    floor_share = {768: 0.74, 1280: 0.74}   # the plan's share before the phone work (76 and 81): it must not drop below these
    for w in (360, 390, 768, 1280):
        page.set_viewport_size({'width': w, 'height': 900})
        for name, card in (('basement', _basement_card()), ('first floor', _plan_card(1.0))):
            page.evaluate(PLAN_JS, card)
            r = page.evaluate(PHONE_MEASURE)
            tag = f'plan {w} px, {name}'
            if name == 'basement':
                need = 0.72 if r['width'] < 480 else floor_share.get(w, 0.72)
                check(f'{tag}: N1 the plan fills the frame (outline {need:.0%} of the drawing or more), text 11 px or more, no sideways scroll',
                      r['share'] >= need and r['fonts'] >= 10.9 and not r['sideways'] and _dims_ok(r), json.dumps({k: r[k] for k in ('width', 'share', 'fonts', 'dims', 'sideways')}))
                check(f'{tag}: N3 a run that only passes through draws no line or dot, only its riser ring (named Stack where there is room)', r['still'] == 0 and r['risers'] == 2,
                      json.dumps({k: r[k] for k in ('still', 'risers')}))
            check(f'{tag}: N2 markers never on each other (focus rings counted, 2 px apart), inside rings cross the wall by under 2 px',
                  r['marks'] >= 2 and not r['close'] and not r['crossing'], json.dumps({k: r[k] for k in ('marks', 'close', 'crossing', 'sizes')}))
    check('plan phone: no console errors, nothing outside the site', not con.errors and not outside, json.dumps({'errors': con.errors[:2], 'outside': outside[:2]}))
    ctx.close()


def plan_rules_checks(browser, site):
    """R1 text 11 to 13 px and markers 26 to 36 px on screen at every card width and building size, redrawn when the card
    resizes; R2 the outline is the wall (solid, no bounding rectangle), likely things dashed; R3 runs square with rounded
    corners and risers drawn; R4 names fit their rooms (full or short), never overlap each other or a marker; R6 a large
    building has no rooms or lines, its note, and no house words; R7 overall feet on two sides, a north arrow, the street side."""
    ctx, page, outside = _offline_ctx(browser, site, 1280, 900, False)
    con = Console(page, site)
    page.goto(f'{site}/agent.html?role=pp-dispatcher&backend=off')
    wait_ready(page)
    labels = {r['label'] for r in _plan_card()['floors'][0]['rooms']} | {r['short'] for r in _plan_card()['floors'][0]['rooms']}
    for w in (1280, 768, 390, 360):
        page.set_viewport_size({'width': w, 'height': 900})
        for scale in (0.5, 1.0, 6.0):
            page.evaluate(PLAN_JS, _plan_card(scale))
            r = page.evaluate(PLAN_MEASURE)
            tag = f'plan {w} px, building x{scale}'
            lo, hi = (25.9, 34.1) if r['width'] < 420 else (25.9, 36.1)   # a drawing under 420 px: 26 px markers, focus ring 34 px
            check(f'{tag}: R1 drawn at the card width, text 11-13 px, markers {lo:.0f}-{hi:.0f} px', abs(r['width'] - r['inner']) <= 1 and 10.9 <= r['fonts'][0] and r['fonts'][1] <= 13.1
                  and lo <= r['marks'][0] and r['marks'][1] <= hi, json.dumps({k: r[k] for k in ('width', 'inner', 'fonts', 'marks')}))
            if scale != 1.0:
                continue
            check(f'{tag}: R2 the outline is the wall (solid, no bounding rectangle), rooms and likely lines dashed',
                  r['rect'] == 0 and r['outline'] == 'none' and r['roomDash'] not in (None, 'none') and all(d not in (None, 'none') for d in r['runDash']),
                  json.dumps({k: r[k] for k in ('rect', 'outline', 'roomDash', 'runDash')}))
            check(f'{tag}: R3 runs square with rounded corners, risers drawn and in the key', r['diag'] == 0 and r['rounded'] and r['risers'] == 2 and r['riserKey'],
                  json.dumps({k: r[k] for k in ('diag', 'rounded', 'risers', 'riserKey')}))
            check(f'{tag}: R4 names fit their rooms (full or short), wholly inside one room (never across a room line), never overlap each other or a marker',
                  r['names'] and set(r['names']) <= labels and not r['nameOverlaps'] and not r['nameOnMarker'] and not r['nameOutside'],
                  json.dumps({k: r[k] for k in ('names', 'nameOverlaps', 'nameOnMarker', 'nameOutside')}))
            check(f'{tag}: R7 overall feet on two sides, a north arrow, the street side', _dims_ok(r) and r['north'] == 1 and r['street'] == 'Street side',
                  json.dumps({k: r[k] for k in ('dims', 'north', 'street')}))
        page.evaluate(PLAN_JS, _plan_card(1.0, large=True))
        r = page.evaluate(PLAN_MEASURE)
        tag = f'plan {w} px, large building'
        bad = re.findall(r'\b(house|home|garage|living|bedroom|kitchen)\b', r['text'], re.I)
        check(f'{tag}: R6 no rooms, no lines, its note, sizes and street side, no house words',
              r['roomsN'] == 0 and r['runsN'] == 0 and r['note'] == 'Interior layout is not on public record.' and _dims_ok(r)
              and r['street'] == 'Street side' and not bad and r['rect'] == 0 and 10.9 <= r['fonts'][0] and r['fonts'][1] <= 13.1, json.dumps({k: r[k] for k in ('roomsN', 'runsN', 'note', 'dims', 'fonts')}) + ' ' + str(bad))
    # one card, drawn at 1280, then the window narrows: the plan is redrawn at the new width and its text keeps its size
    page.set_viewport_size({'width': 1280, 'height': 900})
    page.evaluate(PLAN_JS, _plan_card(1.0))
    before = page.evaluate(PLAN_MEASURE)
    page.set_viewport_size({'width': 390, 'height': 900})
    page.wait_for_timeout(500)
    after = page.evaluate(PLAN_MEASURE)
    page.wait_for_timeout(800)
    again = page.evaluate("() => document.querySelector('#ca-plan svg.ca-fs').viewBox.baseVal.width")
    check('plan: R1 redrawn when the card narrows, text and markers keep their size, no redraw loop',
          before['width'] > after['width'] and abs(after['width'] - after['inner']) <= 1 and again == after['width'] and 10.9 <= after['fonts'][0] and after['fonts'][1] <= 13.1
          and 25.9 <= after['marks'][0], json.dumps({'before': before['width'], 'after': after['width'], 'inner': after['inner'], 'again': again, 'fonts': after['fonts']}))
    # string output without a DOM: the module's sketchSVG takes a width and returns an SVG at that width
    sv = page.evaluate("""async (card) => { const m = await import('./assets/agent-cards.js'); const f = card.floors[0];
      const o = m.outlinePoints(card, f.w, f.h, 1); const s = m.sketchSVG(f, [], { width: 500, outline: o });
      return { ok: typeof s === 'string' && s.startsWith('<svg') && /viewBox="0 0 500 /.test(s) && /data-outline/.test(s), north: o && o.north }; }""", _plan_card())
    check('plan: sketchSVG returns the SVG string at the width asked, with the outline and its north', sv['ok'] and sv['north'] and abs(sv['north'][1] + 1) < 1e-6, json.dumps(sv))
    check('plan: no console errors, nothing outside the site', not con.errors and not outside, json.dumps({'errors': con.errors[:2], 'outside': outside[:2]}))
    ctx.close()


def view_card_checks(browser, site):
    """A card of each picture kind, both as { kind: 'view', view } and as the server's own card (source_line, long basis words),
    drawn by assets/agent-views.js; a company record reads "Company record (example data)"; the picture's draft button adds a draft."""
    samples = json.load(open(VIEWS, encoding='utf-8'))['samples']
    srv = json.load(open(PREPARED, encoding='utf-8'))['roles']['pp-cfo']['cards'][0]   # a bridge with basis 'company record (example data)'
    for w, h, dark in SIZES:
        label = f"view cards {w} px {'dark' if dark else 'light'}"
        ctx, page, outside = _offline_ctx(browser, site, w, h, dark)
        con = Console(page, site)
        page.goto(f'{site}/agent.html?role=pp-cfo&backend=off')
        wait_ready(page)
        for i, s in enumerate(samples):
            page.evaluate(CARD_JS, [{'type': 'card', 'kind': 'view', 'id': f'v{i}', 'view': s['view']}, {}])
        page.evaluate(CARD_JS, [srv, {}])
        poll(lambda: page.evaluate(f"() => document.querySelectorAll('#ca-t [data-av-kind]').length === {len(samples) + 1}"), 10)
        r = page.evaluate("""() => ({ kinds: [...document.querySelectorAll('#ca-t [data-av-kind]')].map(e => e.dataset.avKind),
          empty: document.querySelectorAll('#ca-t .av-empty, #ca-t [data-av-empty]').length,
          srvMarks: [...[...document.querySelectorAll('#ca-t [data-av-kind]')].at(-1).querySelectorAll('[data-av-mark]')].map(e => e.textContent.trim()),
          srvSrc: [...document.querySelectorAll('#ca-t [data-av-kind]')].at(-1).querySelector('[data-src]')?.textContent || '',
          wide: Math.max(...[...document.querySelectorAll('#ca-t .ca-view')].map(e => e.scrollWidth - e.clientWidth)) })""")
        want = [s['view']['kind'] for s in samples] + ['bridge']
        check(f'{label}: every picture kind draws ({", ".join(sorted(set(want)))})', r['kinds'] == want and set(want) >= {'scorecard', 'bridge', 'heatmap', 'pipeline_board', 'ranked_bars'}, json.dumps(r['kinds']))
        check(f'{label}: a server card reads "Company record (example data)" and carries its source', r['srvMarks'] and all(m == 'Company record (example data)' for m in r['srvMarks'])
              and r['srvSrc'] and not r['srvSrc'].lower().startswith('source:'), json.dumps([r['srvMarks'][:2], r['srvSrc'][:60]]))
        n0 = page.evaluate("JSON.parse(localStorage.getItem('bsp-os-approvals') || '[]').length")
        page.locator('#ca-t [data-av-draft]').first.click()
        poll(lambda: page.locator('#ca-t .ca-draft').count() == 1, 4)
        n1 = page.evaluate("JSON.parse(localStorage.getItem('bsp-os-approvals') || '[]').length")
        check(f'{label}: a picture\'s draft button adds a draft card and an approval item', page.locator('#ca-t .ca-draft').count() == 1 and n1 == n0 + 1, f'{n0} -> {n1}')
        sw = page.evaluate('document.documentElement.scrollWidth')
        check(f'{label}: no sideways scroll, no console errors', sw == w and r['wide'] <= 1 and not outside and not con.errors,
              json.dumps({'sw': sw, 'wide': r['wide'], 'errors': con.errors[:2]}))
        ctx.close()


def map_checks(browser, site):
    """"Show on map": a live answer runs the map command once; a restored card waits for a tap; the shell (MapCmd) gets it on the
    page that has it, the parent gets it by postMessage from inside a frame, and a plain page gets a link to the globe."""
    fx = json.load(open(SITE_CARD, encoding='utf-8'))
    live, cmd_card = fx['card'], fx['map_command']
    for w, h, dark in ((1440, 900, False), (390, 844, True)):
        tag = f"{w} px {'dark' if dark else 'light'}"
        ctx, page, outside = _offline_ctx(browser, site, w, h, dark)
        con = Console(page, site)
        page.goto(f'{site}/agent.html?role=pp-dispatcher&backend=off')
        wait_ready(page)
        page.evaluate("() => { window.__sent = []; window.MapCmd = { run: c => { window.__sent.push(c); return c; } }; }")
        page.evaluate(CARD_JS, [live, {}])
        # same turn: the map card joins the sketch's control (live: it runs once)
        page.evaluate("""async c => { const t = [...document.querySelectorAll('#ca-t .ch-turn')].at(-1);
          const el = window.__agent.state.cards.renderCard(c, { turn: t, live: true }); if (el) t.querySelector('.ch-blocks').append(el); }""", cmd_card)
        r1 = page.evaluate("() => ({ sent: window.__sent.length, ctrl: document.querySelectorAll('#ca-t .ch-turn:last-child [data-ca=\"map\"]').length })")
        check(f'map {tag}: a live answer runs the command once, one "Show on map" in the answer', r1 == {'sent': 1, 'ctrl': 1}, json.dumps(r1))
        page.locator('#ca-t .ch-turn:last-child [data-ca="map"]').click()
        sent = page.evaluate('window.__sent')
        check(f'map {tag}: "Show on map" sends the answer\'s own command to MapCmd', len(sent) == 2 and sent[1] == cmd_card['cmd'], json.dumps(sent[-1])[:160])
        # restored: nothing runs by itself
        page.evaluate("() => { window.__sent = []; }")
        page.evaluate(CARD_JS, [{**cmd_card, 'id': 'mc-restored'}, {}])
        n = page.evaluate('window.__sent.length')
        ctl = page.locator('#ca-t .ch-turn:last-child .ca-map [data-ca="map"]')
        check(f'map {tag}: a restored map card shows "Show on map" and does nothing by itself', n == 0 and ctl.count() == 1)
        ctl.click()
        check(f'map {tag}: tapping it then sends the command', page.evaluate('window.__sent.length') == 1)
        check(f'map {tag}: no console errors, nothing outside the site', not con.errors and not outside, '; '.join(con.errors[:2]))
        ctx.close()
    # a plain page (no shell, no frame): a link to the globe with the place
    ctx, page, outside = _offline_ctx(browser, site, 1440, 900, False)
    page.goto(f'{site}/agent.html?role=pp-dispatcher&backend=off')
    wait_ready(page)
    page.evaluate("() => { delete window.MapCmd; }")
    page.evaluate(CARD_JS, [live, {}])
    href = page.evaluate("() => document.querySelector('#ca-t a[data-ca=\"map-link\"]')?.getAttribute('href') || ''")
    q = urllib.parse.parse_qs(href.split('?', 1)[1]) if '?' in href else {}
    check('map: without the shell, "Show on map" is a link to the globe at the place',
          href.startswith('app.html#/globe/view?') and abs(float(q.get('lat', ['0'])[0]) - live['place']['lat']) < 1e-6 and float(q.get('zoom', ['99'])[0]) <= 19, href)
    ctx.close()
    # inside the shell's frame: the command goes to the parent by postMessage
    ctx, page, outside = _offline_ctx(browser, site, 1440, 900, False)
    page.goto(f'{site}/agent.html?role=pp-dispatcher&backend=off')
    wait_ready(page)
    page.evaluate("""() => { window.__msgs = []; addEventListener('message', e => { if (e.origin === location.origin) window.__msgs.push(e.data); });
      const f = document.createElement('iframe'); f.id = 'shellframe'; f.src = 'agent.html?role=pp-dispatcher&backend=off&embed=1'; f.style.cssText = 'width:900px;height:700px';
      document.body.prepend(f); }""")
    frame = None
    for _ in range(80):
        frame = next((f for f in page.frames if 'embed=1' in f.url), None)
        if frame and frame.evaluate("() => !!(window.__agent && window.__agent.state.cards)"):
            break
        page.wait_for_timeout(150)
    frame.evaluate(CARD_JS, [live, {}])
    frame.locator('#ca-t [data-ca="map"]').click()
    poll(lambda: page.evaluate('window.__msgs.length') > 0, 3)
    msgs = page.evaluate('window.__msgs')
    ok = msgs and msgs[0].get('type') == 'bsp:map' and (msgs[0].get('cmd') or {}).get('steps', [{}])[0].get('kind') == 'site'
    check('map: inside a frame, "Show on map" posts { type: "bsp:map", cmd } to the parent', ok, json.dumps(msgs)[:200])
    ctx.close()


# ── several buildings on one lot: the address box's chooser ─────────────────────────────────────
FAKE_BACKEND = 'http://127.0.0.1:9'      # never reached: the page's calls to it are answered inside the browser context
LEAFLET_RX = re.compile(r'^https://unpkg\.com/leaflet@\d+\.\d+\.\d+/')   # the home's map library, pinned
LOT_RECORD = '2 buildings on this lot. Showing the one that best fits the recorded size.'
LOT_CHOSEN = '2 buildings on this lot. Showing the one you picked.'
HALL_NOTE = 'Outline: about 22,500 sq ft of ground. Record: 15,226 sq ft. They do not agree.'
GARAGE_NOTE = 'Outline: about 37,100 sq ft of ground. Record: 15,226 sq ft. They do not agree.'
TOWN_HALL = '33 Washington St, Toms River'
THREAD_JS = """el => ({ q: [...el.querySelectorAll('.ch-turn.user')].map(t => t.textContent.trim()),
  a: [...el.querySelectorAll('.ch-turn.bot .ch-answer')].map(t => t.textContent.trim()) })"""
REPLAY_ANSWERS = r'''
import datetime, json, os, sys
root, out = sys.argv[1], sys.argv[2]
server = os.path.join(root, 'server'); sys.path.insert(0, server)
if not os.path.exists(os.path.join(server, 'sandbox', 'roles.json')):
    os.environ['WORKSPACE_SANDBOX_DIR'] = os.path.join(server, 'tests', 'fixtures', 'sandbox_min')
import httpx
import property as homes, site_sources as sources, workspace
S = workspace.site_module()
workspace.reset(); S.reset()
workspace.today = lambda: datetime.date(2026, 11, 17)
sources._today = lambda: datetime.date(2026, 11, 23)
homes.LIVE_ON = True
homes.lookup_record = lambda a: {'status': 'not_found', 'record': None, 'choose': [], 'match': ''}
fx = json.load(open(os.path.join(server, 'tests', 'fixtures', 'site', 'nj_full.json'), encoding='utf-8'))
norm = lambda p: json.dumps({k: str(v) for k, v in p.items()}, sort_keys=True)
def replay(url, params, timeout=None):
    for c in fx['calls']:
        if c['url'] == url and norm(c['params']) == norm(params):
            return json.loads(json.dumps(c['response']))
    raise httpx.ConnectError('not recorded')
homes._get_json = replay
text = fx['typed'] + ' for a sink repair'
res = {'typed': text}
for k in (None, 1, 2):
    res[str(k or 0)] = S.brief(text, 'pp-plumber', [], **({'building': k} if k else {}))
json.dump(res, open(out, 'w', encoding='utf-8'))
'''


def site_answers(tmp):
    """The real /site-brief answers for the town hall (default, building 1, building 2): nj_full's recorded calls replayed through
    server/site.py in a child process (no network, no model). Keys '0', '1', '2' and 'typed'."""
    import subprocess
    out = os.path.join(tmp, 'site_answers.json')
    if os.path.exists(out):
        return json.load(open(out, encoding='utf-8'))
    subprocess.run([sys.executable, '-c', REPLAY_ANSWERS, ROOT, out], check=True, cwd=os.path.join(ROOT, 'server'), timeout=120)
    return json.load(open(out, encoding='utf-8'))


def _is_fake(u):
    """A request to the fake backend: its origin exactly (a site served on a port that starts with 9 is not it)."""
    return u == FAKE_BACKEND or u.startswith(FAKE_BACKEND + '/') or u.startswith(FAKE_BACKEND + '?')


def _home_ctx(browser, site, w, h, dark, answers, delay_ms=0, llm=False, site_status=200, chats=None):
    """The home of a role whose dock takes addresses; the backend is answered inside the context from the replayed answers
    (POST /site-brief by its building, or `site_status` when that is not 200), /health says the lookup is on (and the model when
    `llm`), POST /chat is counted into `chats` and refused, every other backend call fails, nothing else loads."""
    ctx, page = new_page(browser, w, h, dark=dark, reduced=True)
    outside, calls = [], []

    def route(r):
        u = r.request.url
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}
        if _is_fake(u):
            path = u[len(FAKE_BACKEND):].split('?')[0]
            if r.request.method == 'OPTIONS':
                return r.fulfill(status=204, headers=cors)
            if path == '/health':
                return r.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'llm': llm, 'site': True}), headers=cors)
            if path == '/chat':
                if chats is not None:
                    chats.append(r.request.post_data or '')
                return r.fulfill(status=503, content_type='application/json', body='{"ok":false,"error":"test"}', headers=cors)
            if path == '/site-brief':
                body = r.request.post_data_json or {}
                calls.append(body)
                if delay_ms:
                    time.sleep(delay_ms / 1000)
                if site_status != 200:
                    return r.fulfill(status=site_status, content_type='application/json', body='{"ok":false}', headers=cors)
                k = body.get('building')
                ans = answers.get(str(k if isinstance(k, int) and str(k) in answers else 0))
                return r.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, **ans}), headers=cors)
            return r.fulfill(status=404, content_type='application/json', body='{"ok":false}', headers=cors)
        if u.startswith(site) or 'fonts.googleapis.com' in u or 'fonts.gstatic.com' in u or THREE_RX.match(u) or LEAFLET_RX.match(u):
            return r.continue_()
        outside.append(u)
        return r.abort()
    ctx.route('**/*', route)
    return ctx, page, outside, calls


CHOOSER_MEASURE = """() => {
  const out = document.getElementById('hm-out');
  const g = out && out.querySelector('[role="group"][aria-label="Buildings on this lot, largest first"]');
  const bs = g ? [...g.querySelectorAll('button')] : [];
  const ans = out && out.querySelector('.sl-ans');
  const small = [];
  for (const el of ans ? ans.querySelectorAll('*') : []) {
    if (el.closest('svg') || !el.getClientRects().length) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) small.push(el.tagName + ' ' + fs + ' ' + el.textContent.trim().slice(0, 30));
  }
  const after = g && ans ? !!(ans.querySelector('.sl-text').compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING) : false;
  const top = bs[0] ? bs[0].getBoundingClientRect().top : null, bottom = bs.length ? bs.at(-1).getBoundingClientRect().bottom : null;
  return { n: bs.length, labels: bs.map(b => b.textContent), pressed: bs.map(b => b.getAttribute('aria-pressed')),
    cls: bs.map(b => b.className), bg: bs.map(b => getComputedStyle(b).backgroundColor), after, answers: out ? out.querySelectorAll('.sl-ans').length : 0,
    text: ans?.querySelector('.sl-text')?.textContent || '', house: ans?.querySelector('.ca-house')?.textContent || '', small,
    top, bottom, vh: innerHeight, scroll: document.querySelector('.hm-mainc')?.scrollTop ?? scrollY,
    src: document.querySelectorAll('#drawer-hold .drawer-list[data-drawer="src"] > .drawer-item, #inspector .drawer-list[data-drawer="src"] > .drawer-item').length,
    focus: document.activeElement?.dataset?.sl === 'building' ? document.activeElement.getAttribute('aria-pressed') : null,
    sideways: document.documentElement.scrollWidth > innerWidth, wide: bs.some(b => b.getBoundingClientRect().right > innerWidth + 0.5) };
}"""


def chooser_checks(browser, site, tmp):
    """Several sizeable buildings on one lot, in the home's answer area, from the real answers the server gives for the town hall
    (nj_full replayed through server/site.py). At 1440 px the address is typed into the docked agent's composer (inside its frame):
    it is not sent to the agent, the thread shows it and the one-line reply, and the home runs the lookup in its own column. At
    phone widths it comes in through #/home/overview?address= (the Ask panel's hand-over). Then: under the answer one button
    each ("Building 1 · 37,100 sq ft"), largest first, the
    drawn one pressed and looking pressed; the card's notes word for word. Scrolled down to the row, pressing another keeps the
    old answer on screen while it loads, runs the lookup again with building set, replaces the answer in place, keeps the row in
    view and focused, and leaves one copy of the sources in the Sources drawer. Pressing the shown one does nothing. No sideways
    scroll at 360 and 390 px, no text under 11 px. The assistant's card for the same answer carries the notes and no row."""
    answers = site_answers(tmp)
    fs0 = next(c for c in answers['0']['cards'] if c.get('kind') == 'floor_sketch')
    lot = fs0['building'].get('lot') or {}
    check('chooser: the replayed town hall answer carries a lot block of two buildings, the second shown',
          lot.get('n') == 2 and lot.get('shown') == 2 and lot.get('why') == 'record', json.dumps(lot))
    for w, h, dark in ((360, 640, False), (390, 844, True), (1440, 900, False)):
        tag = f"chooser {w} px {'dark' if dark else 'light'}"
        ctx, page, outside, calls = _home_ctx(browser, site, w, h, dark, answers, delay_ms=700)
        con = Console(page, site)
        if w >= 1200:
            # the dock is open at this width: type the address into the agent's composer inside its frame
            page.goto(f'{site}/app.html?role=pp-plumber&backend={FAKE_BACKEND}#/home/overview')
            page.wait_for_selector('#hm-out', state='attached', timeout=15000)
            dock = page.frame_locator('.hm-dock iframe')
            dock.locator('#ca-chat textarea').wait_for(timeout=15000)
            fq = urllib.parse.parse_qs(urllib.parse.urlparse(page.eval_on_selector('.hm-dock iframe', 'f => f.src')).query)
            check(f'{tag}: the docked agent is handed the shell\'s backend address (not the hosted one)', fq.get('backend') == [FAKE_BACKEND], json.dumps(fq))
            dock.locator('#ca-chat textarea').fill(answers['typed'])
            dock.locator('#ca-chat textarea').press('Enter')
            ok = poll(lambda: page.evaluate("() => !!document.querySelector('#hm-out [data-sl=\"building\"]')"), 10)
            th = poll(lambda: (lambda t: t if t['a'] and t['a'][0].startswith('The answer for') else None)(dock.locator('#ca-chat').evaluate(THREAD_JS)), 5) \
                or dock.locator('#ca-chat').evaluate(THREAD_JS)
            check(f'{tag}: the address typed in the dock stays out of the agent: its bubble, one reply line that says where the answer is, the lookup in the home',
                  ok and th['q'] == [answers['typed']] and th['a'] == [f'The answer for {TOWN_HALL} is on the left.'], json.dumps(th)[:240])
        else:
            # the Ask panel's hand-over: the typed address travels in the hash and runs in the answer area at once
            page.goto(f'{site}/app.html?role=pp-plumber&backend={FAKE_BACKEND}#/home/overview?address={urllib.parse.quote(answers["typed"])}')
            page.wait_for_selector('#hm-out', state='attached', timeout=15000)
            ok = poll(lambda: page.evaluate("() => !!document.querySelector('#hm-out [data-sl=\"building\"]')"), 10)
        page.wait_for_timeout(300)
        r = page.evaluate(CHOOSER_MEASURE)
        check(f'{tag}: one row of buttons under the answer, largest first, with the ground area',
              ok and r['n'] == 2 and r['after'] and r['labels'] == ['Building 1 · 37,100 sq ft', 'Building 2 · 22,500 sq ft']
              and all('sys-btn' in c and 'sys-btn--secondary' in c and 'sys-btn--sm' in c for c in r['cls']), json.dumps({k: r[k] for k in ('n', 'labels', 'after')}))
        check(f'{tag}: the drawn building is pressed and looks pressed', r['pressed'] == ['false', 'true'] and r['bg'][0] != r['bg'][1], json.dumps({k: r[k] for k in ('pressed', 'bg')}))
        check(f'{tag}: the card says how many buildings and which one, word for word, as the server wrote it',
              f'{LOT_RECORD} {HALL_NOTE}' in r['house'] and r['text'].startswith('33 Washington St, Toms River. Town hall, 15,226 sq ft, two stories (public record).')
              , r['house'])
        check(f'{tag}: no sideways scroll, the buttons wrap, no text under 11 px', not r['sideways'] and not r['wide'] and not r['small'], json.dumps({k: r[k] for k in ('sideways', 'wide', 'small')})[:300])
        if not r['n']:
            check(f'{tag}: pressing Building 1 runs the lookup again with building 1', False, 'no chooser row')
            ctx.close()
            continue
        # scroll so the row sits near the top of the screen, as after reading the answer on a phone, then press Building 1
        page.evaluate("() => document.querySelector('#hm-out [data-sl=\"building\"]').scrollIntoView({ block: 'start' })")
        page.wait_for_timeout(200)
        before = page.evaluate(CHOOSER_MEASURE)
        # every change to the answer area while it loads is noted in the page (the stubbed backend holds the answer back)
        page.evaluate("""() => { const out = document.getElementById('hm-out'); window.__mid = [];
          const note = () => window.__mid.push({ ans: out.querySelectorAll('.sl-ans').length, keep: out.querySelector('.sl-keep')?.textContent || '',
            top: out.querySelector('[data-sl="building"]')?.getBoundingClientRect().top ?? null });
          window.__midObs = new MutationObserver(note); window.__midObs.observe(out, { childList: true, subtree: true }); }""")
        page.focus('#hm-out [data-sl="building"]')
        page.keyboard.press('Enter')
        poll(lambda: page.evaluate("() => document.querySelector('#hm-out [data-sl=\"building\"][aria-pressed=\"true\"]')?.textContent.startsWith('Building 1')"), 8)
        mid = page.evaluate("() => { window.__midObs.disconnect(); return window.__mid; }")
        loading = [m for m in mid if m['keep'].startswith('Looking up')]
        check(f'{tag}: while the other building loads the answer stays on screen with one progress line under the row',
              loading and all(m['ans'] == 1 for m in mid) and all(m['top'] is not None and abs(m['top'] - before['top']) < 2 for m in loading),
              json.dumps({'mid': mid[:4], 'before': before['top']}))
        page.wait_for_timeout(300)
        r2 = page.evaluate(CHOOSER_MEASURE)
        check(f'{tag}: pressing Building 1 runs the lookup again with building 1 and replaces the answer in place',
              [c.get('building') for c in calls] == [None, 1] and calls[1].get('text') == answers['typed'] and r2['pressed'] == ['true', 'false']
              and r2['answers'] == 1 and r2['focus'] == 'true' and f'{LOT_CHOSEN} {GARAGE_NOTE}' in r2['house'],
              json.dumps({'calls': [c.get('building') for c in calls], 'pressed': r2['pressed'], 'focus': r2['focus'], 'house': r2['house'][-160:]}))
        check(f'{tag}: the row of buttons stays in view where it was, the page does not jump',
              r2['top'] is not None and r2['top'] >= 0 and r2['bottom'] <= r2['vh'] and abs(r2['top'] - before['top']) < 60,
              json.dumps({'before': [before['top'], before['scroll']], 'after': [r2['top'], r2['scroll']], 'vh': r2['vh']}))
        check(f'{tag}: the Sources drawer keeps one copy of the answer\'s sources', before['src'] >= 1 and r2['src'] == before['src'], json.dumps({'before': before['src'], 'after': r2['src']}))
        n = len(calls)
        page.locator('#hm-out [data-sl="building"][aria-pressed="true"]').click()
        page.wait_for_timeout(400)
        r3 = page.evaluate(CHOOSER_MEASURE)
        check(f'{tag}: pressing the shown building again makes no lookup', len(calls) == n and r3['n'] == 2 and r3['pressed'] == ['true', 'false'], json.dumps({'calls': len(calls) - n}))
        page.locator('#hm-out [data-sl="building"]').nth(1).click()
        poll(lambda: page.evaluate("() => document.querySelector('#hm-out [data-sl=\"building\"][aria-pressed=\"true\"]')?.textContent.startsWith('Building 2')"), 8)
        page.wait_for_timeout(300)
        r4 = page.evaluate(CHOOSER_MEASURE)
        check(f'{tag}: back to Building 2: the notes and the one copy of the sources come back', [c.get('building') for c in calls][-1] == 2
              and r4['pressed'] == ['false', 'true'] and r4['src'] == before['src'], json.dumps({'pressed': r4['pressed'], 'src': r4['src']}))
        check(f'{tag}: nothing outside the site, no console errors', not outside and not con.errors, json.dumps({'outside': outside[:2], 'errors': con.errors[:2]}))
        ctx.close()
    # an embedded page uses the backend address it is handed for that load and stores none (the shell keeps or clears its own)
    ctx, page, outside, calls = _home_ctx(browser, site, 900, 700, False, answers)
    page.goto(f'{site}/agent.html?role=pp-plumber&embed=1&backend={FAKE_BACKEND}')
    page.wait_for_function("() => !!(window.__agent && document.querySelector('#ca-chat textarea'))", timeout=15000)
    got = page.evaluate("""async () => { const { Backend } = await import(document.querySelector('link[rel="modulepreload"][href*="assets/backend.js"]').href);
      const ep = await Backend.discover({ force: true }); return { ep, kept: localStorage.getItem('bsp-backend-endpoint') }; }""")
    check('embedded page: uses the address it is handed and stores no backend setting', got == {'ep': FAKE_BACKEND, 'kept': None} and not outside, json.dumps({**got, 'outside': outside[:2]}))
    ctx.close()
    # the assistant's own card for the same answer (agent.html draws it with renderCard): the notes, never a row of buttons
    ctx, page, outside = _offline_ctx(browser, site, 390, 844, False)
    con = Console(page, site)
    page.goto(f'{site}/agent.html?role=pp-plumber&backend=off')
    wait_ready(page)
    got = page.evaluate("""async (card) => {
      const src = await (await fetch('./assets/agent.js')).text();
      const stamp = (src.match(/agent-cards\\.js(\\?v=[^']*)'/) || [, ''])[1];
      const { renderCard } = await import('./assets/agent-cards.js' + stamp);
      const el = renderCard(card, {}); document.querySelector('.ca-main').prepend(el);
      return { house: el.querySelector('.ca-house')?.textContent || '', rows: document.querySelectorAll('[data-sl="building"], [aria-label="Buildings on this lot, largest first"]').length };
    }""", fs0)
    check('chooser: the assistant\'s card carries the notes word for word and no row of buttons',
          f'{LOT_RECORD} {HALL_NOTE}' in got['house'] and got['rows'] == 0 and not con.errors and not outside, json.dumps(got)[:300])
    ctx.close()


# ── the home's dock ─────────────────────────────────────────────────────────────────────────────
DOCK_STATE = """() => { const d = document.querySelector('.hm-dock'), l = document.querySelector('.ch-floating .ch-launch');
  const ask = [...document.querySelectorAll('.hm-mainc [data-hm="ask"]')].filter(a => a.getClientRects().length);
  return { open: !!d && !d.hidden, ls: localStorage.getItem('bsp-os-dock'), exp: document.querySelector('[data-sys-ask]')?.getAttribute('aria-expanded'),
    launcher: !!l && getComputedStyle(l).display !== 'none' && getComputedStyle(l).visibility !== 'hidden', flag: 'homeDock' in document.documentElement.dataset,
    askBtn: ask.map(a => a.textContent.trim()), clear: !!d && !d.querySelector('[data-hm="clear"]').hidden, hash: location.hash,
    act: document.activeElement?.tagName + '#' + (document.activeElement?.id || ''), out: (document.getElementById('hm-out')?.textContent || '').trim().slice(0, 80),
    outRole: document.getElementById('hm-out')?.getAttribute('role'), outLive: document.getElementById('hm-out')?.getAttribute('aria-live'),
    say: document.getElementById('hm-say')?.textContent || '', slText: document.querySelector('#hm-out .sl-text, #hm-out .sl-fail')?.textContent || '' };
}"""
TABLE_JS = """() => { const w = document.querySelector('.hm-cos .sys-table-wrap'), st = [...document.querySelectorAll('.hm-cos td.hm-st')];
  const wr = w.getBoundingClientRect();
  return { sw: w.scrollWidth, cw: w.clientWidth, docked: document.querySelector('.hm-split').classList.contains('is-docked'),
    status: st.length && st.every(td => { const r = td.getBoundingClientRect(); return r.width > 20 && r.right <= wr.right + 1; }) }; }"""


def _drawn(u, site):
    """What a page may load offline: the site itself, the fonts, and the pinned map and 3D libraries it draws with."""
    return u.startswith(site) or 'fonts.googleapis.com' in u or 'fonts.gstatic.com' in u or bool(THREE_RX.match(u) or LEAFLET_RX.match(u))


def _dock_open(page, site, role, w, extra=''):
    page.goto(f'{site}/app.html?role={role}&backend={FAKE_BACKEND}{extra}#/home/overview')
    page.wait_for_selector('.hm-mainc .hm-head', timeout=15000)
    page.wait_for_timeout(300)


def _press(page, sel):
    """Clicks `sel` when it shows within 3 s; False when it never does (the check that needs it then fails, the run goes on)."""
    try:
        page.locator(sel).first.click(timeout=3000)
        return True
    except Exception:  # noqa: BLE001
        return False


def _dock_type(page, text):
    dock = page.frame_locator('.hm-dock iframe')
    dock.locator('#ca-chat textarea').wait_for(timeout=15000)
    page.wait_for_function("() => !!document.querySelector('.hm-dock iframe')?.contentWindow?.__agent", timeout=15000)
    dock.locator('#ca-chat textarea').fill(text)
    dock.locator('#ca-chat textarea').press('Enter')
    return dock


def dock_checks(browser, site, tmp):
    """The agent docked on the home (modules/home.js mountDock, agent.html?embed=1&dock=1), offline: the backend is answered inside
    the context (nj_full's town hall replayed through server/site.py; /chat counted and refused). A site address typed in the dock
    goes to the home for every role, as in the floating Ask panel (no /chat, one /site-brief), the reply line then says where the
    answer is or why there is none, the address goes into the hash (a reload keeps the answer), Clear empties the thread and the
    answer. The Ask hotkey opens and closes the dock with the keyboard inside it too. Open by default at 1440 px, the choice
    remembered; closed at 1024 and 390 px, where every home shows "Ask the agent". The six-company table keeps Status in view
    beside the docked column. No request leaves the site."""
    answers = site_answers(tmp)
    typed = answers['typed']
    done = f'The answer for {TOWN_HALL} is on the left.'
    # every role hands a typed address to the home: a field role and a leadership role that never had the address box
    for role in ('cet-field-electrician', 'pp-ceo'):
        tag = f'dock 1440 px {role}'
        chats = []
        ctx, page, outside, calls = _home_ctx(browser, site, 1440, 900, False, answers, llm=True, chats=chats)
        con = Console(page, site)
        _dock_open(page, site, role, 1440)
        st0 = page.evaluate(DOCK_STATE)
        dock = _dock_type(page, typed)
        ok = poll(lambda: page.evaluate("() => !!document.querySelector('#hm-out .sl-ans')"), 10)
        th = poll(lambda: (lambda t: t if t['a'] and t['a'][-1] == done else None)(dock.locator('#ca-chat').evaluate(THREAD_JS)), 5) or dock.locator('#ca-chat').evaluate(THREAD_JS)
        st = page.evaluate(DOCK_STATE)
        check(f'{tag}: the dock is open by default, Ask says so, the floating launcher steps aside',
              st0['open'] and st0['exp'] == 'true' and not st0['launcher'] and st0['flag'] and not st0['askBtn'], json.dumps(st0)[:300])
        check(f'{tag}: a typed address goes to the home, not to the model: no /chat, one /site-brief, the answer in the home',
              ok and not chats and len(calls) == 1 and calls[0].get('role') == role and st['out'].startswith(TOWN_HALL), json.dumps({'chat': len(chats), 'site': len(calls), 'out': st['out']}))
        check(f'{tag}: the reply line says where the answer is once it is there', th['q'] == [typed] and th['a'] == [done], json.dumps(th)[:240])
        check(f'{tag}: the answer area is a labelled region, not live; one status line reads the answer\'s first sentence',
              st['outRole'] == 'region' and st['outLive'] is None and st['say'] and st['say'] == st['slText'] and st['act'] == 'DIV#hm-out',
              json.dumps({k: st[k] for k in ('outRole', 'outLive', 'say', 'act')})[:300])
        check(f'{tag}: the address is in the hash and Clear shows', st['hash'] == '#/home/overview?address=' + urllib.parse.quote(typed, safe='') and st['clear'],
              json.dumps({k: st[k] for k in ('hash', 'clear')}))
        if role == 'cet-field-electrician':
            page.reload()
            page.wait_for_selector('.hm-mainc .hm-head', timeout=15000)
            back = poll(lambda: page.evaluate("() => !!document.querySelector('#hm-out .sl-ans')"), 10)
            check(f'{tag}: a reload keeps the answer (the hash runs it again)', back and len(calls) == 2 and not chats, json.dumps({'site': len(calls)}))
            _press(page, '.hm-dock [data-hm="clear"]')
            gone = poll(lambda: (lambda s: s if not s['out'] and not s['clear'] else None)(page.evaluate(DOCK_STATE)), 5) or page.evaluate(DOCK_STATE)
            check(f'{tag}: Clear empties the answer, takes the address out of the hash and hides itself',
                  not gone['out'] and gone['hash'] == '#/home/overview' and not gone['clear'] and not gone['say'], json.dumps(gone)[:300])
            # the hotkey: from the page, then with the keyboard in the dock's composer, then again
            page.locator('.hm-mainc .hm-head').click()
            seq = []
            for _ in range(3):
                page.keyboard.press('Control+J')
                page.wait_for_timeout(700)
                seq.append(page.evaluate("""() => ({ open: !document.querySelector('.hm-dock').hidden, act: document.activeElement?.tagName,
                  inner: document.activeElement?.tagName === 'IFRAME' ? document.activeElement.contentDocument.activeElement?.tagName : null })"""))
            check(f'{tag}: the Ask hotkey closes the dock, opens it with the keyboard in the composer, and closes it from inside',
                  [x['open'] for x in seq] == [False, True, False] and seq[1]['inner'] == 'TEXTAREA' and seq[2]['act'] == 'BUTTON', json.dumps(seq))
            page.keyboard.press('Control+J')
            page.wait_for_timeout(500)
            _press(page, '.hm-dock [data-hm="close"]')
            page.reload()
            page.wait_for_selector('.hm-mainc .hm-head', timeout=15000)
            page.wait_for_timeout(500)
            st2 = page.evaluate(DOCK_STATE)
            check(f'{tag}: Close is remembered across a reload, and the home then shows "Ask the agent"',
                  not st2['open'] and st2['ls'] == 'closed' and st2['exp'] == 'false' and st2['askBtn'] == ['Ask the agent'], json.dumps(st2)[:300])
            pressed = _press(page, '.hm-mainc [data-hm="ask"]')
            page.wait_for_timeout(500)
            check(f'{tag}: "Ask the agent" opens the dock', pressed and page.evaluate(DOCK_STATE)['open'])
            who = page.evaluate("() => { const b = document.querySelector('.hm-dock [data-hm=\"who\"]'); return { pop: b.getAttribute('aria-haspopup'), label: b.getAttribute('aria-label') }; }")
            check(f'{tag}: the dock\'s role line says it opens the "Viewing as" sheet', who['pop'] == 'dialog' and who['label'].startswith('Viewing as ') and who['label'].endswith('. Change'), json.dumps(who))
        check(f'{tag}: nothing outside the site, no console errors', not outside and not con.errors, json.dumps({'outside': outside[:2], 'errors': con.errors[:2]}))
        ctx.close()
    # a lookup that fails: the reply line gives the reason the home gives
    ctx, page, outside, calls = _home_ctx(browser, site, 1440, 900, False, answers, site_status=500)
    con = Console(page, site)
    _dock_open(page, site, 'pp-plumber', 1440)
    dock = _dock_type(page, typed)
    msg = 'The address lookup did not answer. Try again shortly.'
    th = poll(lambda: (lambda t: t if t['a'] and t['a'][-1] == msg else None)(dock.locator('#ca-chat').evaluate(THREAD_JS)), 8) or dock.locator('#ca-chat').evaluate(THREAD_JS)
    st = page.evaluate(DOCK_STATE)
    check('dock 1440 px, lookup answers 500: the reply line and the home both give the reason, nothing says it is still looking',
          th['a'] == [msg] and st['out'] == msg and st['say'] == msg, json.dumps({'a': th['a'], 'out': st['out'], 'say': st['say']}))
    con.errors[:] = [e for e in con.errors if '500' not in e]   # the refused lookup itself
    check('dock 1440 px, lookup answers 500: nothing outside the site, no other console errors', not outside and not con.errors, json.dumps({'outside': outside[:2], 'errors': con.errors[:2]}))
    ctx.close()
    # narrower: the dock starts closed, every home shows "Ask the agent"; an address typed in the dock closes it and lands in the home
    for w, h, role in ((1024, 768, 'bsp-partner'), (390, 844, 'cet-ceo'), (390, 844, 'pp-plumber')):
        tag = f'dock {w} px {role}'
        ctx, page, outside, calls = _home_ctx(browser, site, w, h, w < 500, answers)
        con = Console(page, site)
        _dock_open(page, site, role, w)
        st0 = page.evaluate(DOCK_STATE)
        check(f'{tag}: the dock starts closed and the home shows "Ask the agent"', not st0['open'] and st0['askBtn'] == ['Ask the agent'] and not st0['launcher'], json.dumps(st0)[:300])
        if not _press(page, '.hm-mainc [data-hm="ask"]'):
            _press(page, '[data-sys-ask]')   # the top bar's Ask opens it too
        page.wait_for_timeout(500)
        ph = page.frame_locator('.hm-dock iframe').locator('#ca-chat textarea').get_attribute('placeholder', timeout=15000) or ''
        named = role != 'cet-ceo'   # the roles that had the home's address box name the address in the placeholder
        check(f'{tag}: the composer\'s placeholder reads as one thought' + (' and names the address' if named else ''),
              ph and not re.search(r'[?.] Or an address$', ph) and (('address' in ph) == named) and (not ph.endswith('address') or ph.endswith(' or an address')), ph)
        dock = _dock_type(page, typed)
        ok = poll(lambda: page.evaluate("() => !!document.querySelector('#hm-out .sl-ans')"), 10)
        page.wait_for_timeout(400)
        st = page.evaluate(DOCK_STATE)
        check(f'{tag}: an address typed in the dock closes it, the answer lands in the home and takes the focus',
              ok and not st['open'] and len(calls) == 1 and st['act'] == 'DIV#hm-out' and st['out'].startswith(TOWN_HALL), json.dumps({k: st[k] for k in ('open', 'act', 'out')}) + f' calls={len(calls)}')
        page.locator('[data-sys-ask]').click()
        page.wait_for_timeout(500)
        th = dock.locator('#ca-chat').evaluate(THREAD_JS)
        st = page.evaluate(DOCK_STATE)
        check(f'{tag}: reopened, the thread says the answer is on the home screen and Clear shows',
              th['a'] == [f'The answer for {TOWN_HALL} is on the home screen.'] and st['open'] and st['clear'], json.dumps(th)[:200])
        if role == 'bsp-partner':
            page.keyboard.press('Escape')
            page.evaluate("location.hash = '#/fin/portfolio'")
            page.wait_for_timeout(1200)
            away = page.evaluate(DOCK_STATE)
            check(f'{tag}: off the home the floating launcher is back', away['launcher'] and not away['flag'], json.dumps({k: away[k] for k in ('launcher', 'flag')}))
        check(f'{tag}: nothing outside the site, no console errors', not outside and not con.errors, json.dumps({'outside': outside[:2], 'errors': con.errors[:2]}))
        ctx.close()
    # the six-company table beside the docked column: Status in view, no sideways scroll
    for w in (1200, 1280, 1366, 1440):
        ctx, page = new_page(browser, w, 900, reduced=True)
        ctx.route('**/*', lambda r: r.continue_() if _drawn(r.request.url, site) else r.abort())
        page.goto(f'{site}/app.html?backend=off#/home/overview')
        page.wait_for_selector('.hm-cos tbody tr', timeout=15000)
        page.wait_for_timeout(300)
        t = page.evaluate(TABLE_JS)
        check(f'dock {w} px firm home: beside the docked column the company table fits and every Status shows', t['docked'] and t['sw'] <= t['cw'] + 1 and t['status'], json.dumps(t))
        ctx.close()


# ── the "Viewing as" sheet ──────────────────────────────────────────────────────────────────────
SHEET_JS = """() => { const p = document.getElementById('sys-viewas-pop'), rs = [...p.querySelectorAll('.sys-viewas-role')];
  const small = [];
  for (const e of p.querySelectorAll('*')) { if (!e.getClientRects().length || e.closest('.sys-vh') || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11) small.push(e.className + ' ' + fs); }
  const st = p.querySelector('[role="status"]');
  return { open: !p.hidden, n: rs.length, uniq: new Set(rs.map(r => r.dataset.role)).size, first: rs[0]?.dataset.role, last: rs.at(-1)?.dataset.role,
    lit: rs.filter(r => !r.classList.contains('is-dim')).map(r => r.dataset.role), cur: rs.filter(r => r.hasAttribute('aria-current')).map(r => r.dataset.role),
    status: st ? st.textContent : null, statusShown: !!st && !st.classList.contains('sys-vh') && st.getClientRects().length > 0,
    inPop: p.contains(document.activeElement), act: document.activeElement?.dataset?.role || document.activeElement?.className || '',
    small, sideways: document.documentElement.scrollWidth > innerWidth, role: p.getAttribute('role'), modal: p.getAttribute('aria-modal') }; }"""


def sheet_checks(browser, site):
    """The "Viewing as" sheet (assets/frame.js bindViewAs) at 1440 and 390 px, offline: all 44 roles once each, the role in view
    marked; search narrows (with a count for a screen reader, and "No role matches." on screen when none does); Home and End;
    Tab stays inside; Escape closes and returns focus; a pick changes the role and shows "Back to Managing partner"; no text under
    11 px, no sideways scroll, no console errors, nothing outside the site."""
    for w, h, dark in ((1440, 900, False), (390, 844, True)):
        tag = f"sheet {w} px {'dark' if dark else 'light'}"
        ctx, page = new_page(browser, w, h, dark=dark, reduced=True)
        outside = []
        ctx.route('**/*', lambda r: r.continue_() if _drawn(r.request.url, site) else (outside.append(r.request.url), r.abort())[1])
        con = Console(page, site)
        page.goto(f'{site}/app.html?backend=off#/home/overview')
        page.wait_for_selector('.sys-viewas-btn', timeout=15000)
        page.wait_for_timeout(400)
        btn = page.locator('.sys-viewas-btn')
        check(f'{tag}: the path is one button that opens a dialog', btn.get_attribute('aria-haspopup') == 'dialog' and (btn.get_attribute('aria-label') or '').endswith('. Change'), btn.get_attribute('aria-label') or '')
        btn.click()
        page.wait_for_selector('#sys-viewas-pop', state='visible')
        s = page.evaluate(SHEET_JS)
        check(f'{tag}: 44 roles once each, the role in view marked and focused, a modal dialog',
              s['n'] == 44 and s['uniq'] == 44 and s['cur'] == ['bsp-managing-partner'] and s['act'] == 'bsp-managing-partner' and s['role'] == 'dialog' and s['modal'] == 'true',
              json.dumps({k: s[k] for k in ('n', 'uniq', 'cur', 'act', 'role', 'modal')}))
        check(f'{tag}: no text under 11 px, no sideways scroll', not s['small'] and not s['sideways'], json.dumps({'small': s['small'][:3], 'sideways': s['sideways']}))
        find = page.locator('#sys-viewas-pop input')
        find.fill('plumb')
        page.wait_for_timeout(150)
        s = page.evaluate(SHEET_JS)
        check(f'{tag}: "plumb" leaves the Plumber lit, and the count goes to a screen reader', s['lit'] == ['pp-plumber'] and s['status'] == '1 role matches' and not s['statusShown'], json.dumps({k: s[k] for k in ('lit', 'status', 'statusShown')}))
        find.fill('zzzqq')
        page.wait_for_timeout(150)
        find.press('ArrowDown')
        s = page.evaluate(SHEET_JS)
        check(f'{tag}: a search with no match says "No role matches." on screen and ArrowDown stays in the field',
              not s['lit'] and s['status'] == 'No role matches.' and s['statusShown'] and 'sys-input' in s['act'], json.dumps({k: s[k] for k in ('lit', 'status', 'statusShown', 'act')}))
        find.fill('')
        page.wait_for_timeout(150)
        s = page.evaluate(SHEET_JS)
        check(f'{tag}: an empty search lights every role and says nothing', len(s['lit']) == 44 and s['status'] == '', json.dumps({'lit': len(s['lit']), 'status': s['status']}))
        find.press('ArrowDown')
        page.keyboard.press('End')
        end = page.evaluate(SHEET_JS)['act']
        page.keyboard.press('Home')
        home = page.evaluate(SHEET_JS)['act']
        check(f'{tag}: End and Home go to the last and the first role', end == s['last'] and home == s['first'] == 'bsp-managing-partner', json.dumps({'end': end, 'home': home, 'last': s['last']}))
        for _ in range(12):
            page.keyboard.press('Tab')
        check(f'{tag}: Tab stays inside the sheet', page.evaluate(SHEET_JS)['inPop'])
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        s = page.evaluate(SHEET_JS)
        check(f'{tag}: Escape closes it and returns focus to the button', not s['open'] and page.evaluate("() => document.activeElement?.classList.contains('sys-viewas-btn')"), json.dumps({'open': s['open'], 'act': s['act']}))
        btn.click()
        page.wait_for_selector('#sys-viewas-pop', state='visible')
        page.locator('#sys-viewas-pop .sys-viewas-role[data-role="pp-plumber"]').click()
        page.wait_for_timeout(500)
        back = page.evaluate("() => [...document.querySelectorAll('.sys-viewas-back')].filter(e => e.getClientRects().length).map(e => e.textContent.trim())")
        if w < 700 and not back:   # on a phone Back sits in the sheet's header
            btn.click()
            page.wait_for_selector('#sys-viewas-pop', state='visible')
            back = page.evaluate("() => [...document.querySelectorAll('.sys-viewas-back')].filter(e => e.getClientRects().length).map(e => e.textContent.trim())")
        check(f'{tag}: a pick changes the role and "Back to Managing partner" shows', page.evaluate("() => document.querySelector('.sys-viewas-btn').getAttribute('aria-label')").startswith('Viewing as Plumber')
              and back == ['Back to Managing partner'], json.dumps(back))
        check(f'{tag}: nothing outside the site, no console errors', not outside and not con.errors, json.dumps({'outside': outside[:2], 'errors': con.errors[:2]}))
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
    ap.add_argument('--only-wave3', action='store_true', help='run only the signature, live card, picture and map checks')
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
                signature_checks(browser, site, catalog)
                live_card_checks(browser, site)
                plan_rules_checks(browser, site)
                plan_phone_checks(browser, site)
                view_card_checks(browser, site)
                map_checks(browser, site)
                chooser_checks(browser, site, tmp)
                dock_checks(browser, site, tmp)
                sheet_checks(browser, site)
                if not args.only_wave3:
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
