"""
Check the 3D house view (assets/house3d.js) against the floor sketch cards in data/agent/house3d_samples.json: cards captured from
the sandbox (company example data and the public branch) and live-shaped cards (a real outline, parcel, height and storeys).

  uv run --no-project --python 3.12 --with playwright==1.60.0 python scripts/check_house3d.py [--port 8982] [--shots DIR]

Serves the repository on 127.0.0.1 (no backend), opens a small test page (served by the browser route, never written to disk)
and, for every sample card at 1440x900 and 390x844 in light and dark:
  - the view draws with no console error and no sideways scroll;
  - every item and run of the card is one object in the scene, and likely ones are flagged likely (translucent, dashed);
  - the view, floor, layer and "Behind this wall" controls work, and tapping an item opens its card;
  - "Download model" saves <address>.glb, which loads back in three.js GLTFLoader with the same item and run count;
  - "Example address" is written only on a card from company example data, and a company record there says "(example data)";
  - a live card: the outline is public and solid, the walls follow it, the parcel edge is drawn, the shell's basis follows the
    height, rooms, inside walls, items and runs sit inside the outline, wire and duct runs are drawn, "Behind this wall" lists the
    runs touching each wall with their basis and never calls a wall clear, and the file carries the footprint, the parcel and a
    basis on every object, placed east and south of the card's origin.
With --shots it saves the Outside, Cutaway and Top views of the first two samples. Network: only the library host.
"""

import argparse
import functools
import http.server
import json
import os
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(ROOT, 'data', 'agent', 'house3d_samples.json')
LOADER = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js/+esm'

PAGE = """<!doctype html><html lang="en"%s><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>House view check</title><link rel="stylesheet" href="/assets/system.css"></head>
<body style="margin:0;padding:16px"><div id="host"></div><script type="module">
import * as H from '/assets/house3d.js';
const data = await (await fetch('/data/agent/house3d_samples.json')).json();
const i = Number(new URLSearchParams(location.search).get('i')) || 0;
window.card = data.samples[i].card; window.H = H;
window.h = H.renderHouse3D(document.getElementById('host'), window.card, {});
window.ok = await window.h.ready; window.done = true;
</script></body></html>"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(port):
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


FORBIDDEN_WALL = ('clear', 'nothing here', 'safe', 'no pipes', 'no wires')
SHELL_ROLES = {'item', 'run', 'wall', 'slab', 'room', 'roof', 'outline', 'parcel', 'outbuilding'}


def is_example(card):
    """The rule of assets/house3d.js isExampleCard, restated."""
    if card.get('example') is True:
        return True
    if card.get('example') is False or isinstance(card.get('building'), dict) or isinstance(card.get('place'), dict):
        return False
    import re
    return card.get('basis') in ('record', 'mixed') and bool(re.search(r'sandbox|fictional|example data', card.get('source_line') or '', re.I))


def basis_word(b, example):
    if b == 'record':
        return 'Company record (example data)' if example else 'Company record'
    return 'Public record' if b == 'public' else 'Likely'


def in_ring(p, r):
    inside = False
    j = len(r) - 1
    for i in range(len(r)):
        a, b = r[i], r[j]
        if (a[1] > p[1]) != (b[1] > p[1]) and p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
        j = i
    return inside


def to_ring_dist(p, r):
    best = 1e9
    for i in range(len(r)):
        a, b = r[i], r[(i + 1) % len(r)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dy * dy
        t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) if L else 0
        best = min(best, ((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2) ** 0.5)
    return best


def live_checks(check, page, card, st, tag):
    """The checks of a card with a live building (design_live_address.md section 3)."""
    b = card['building']
    site = st['site']
    ring = site['ring']
    shell = {o['name']: o for o in st['shell']}
    out = shell.get('Building outline')
    check(f'outline is public and solid [{tag}]', out is not None and out['basis'] == 'public' and not out['transparent']
          and not out['dashedEdges'] and len(ring) == len(b['footprint']['ring_m']))
    has_parcel = bool((b.get('parcel') or {}).get('ring_m'))
    par = shell.get('Parcel edge')
    check(f'parcel edge [{tag}]', (par is not None and par['basis'] == 'public' and not par['transparent']) if has_parcel else par is None)
    area = abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))) / 2
    want_area = b['footprint'].get('area_m2') or site['area']
    check(f'outline area kept [{tag}]', abs(area - want_area) <= 0.01 * want_area, f'{area:.1f} vs {want_area}')
    first = [w for w in st['walls'] if w['level'] == 'first' and not w['inside']]
    edges = sum(1 for i in range(len(ring)) if ((ring[i][0] - ring[(i + 1) % len(ring)][0]) ** 2 + (ring[i][1] - ring[(i + 1) % len(ring)][1]) ** 2) ** 0.5 > 0.16)
    on_ring = all(min(((w[k][0] - q[0]) ** 2 + (w[k][1] - q[1]) ** 2) ** 0.5 for q in ring) < 0.05 for w in first for k in ('a', 'b'))
    check(f'walls follow the outline [{tag}]', len(first) == edges and on_ring, f'{len(first)} walls, {edges} edges')
    hb = b.get('height', {}).get('basis')
    sb = b.get('storeys', {}).get('basis')
    want = 'public' if hb == 'public' and sb == 'public' else 'likely'
    above = [w for w in st['walls'] if not w['inside'] and w['level'] != 'basement']
    check(f'shell basis follows the height [{tag}]', above and all(w['basis'] == want and w['dashedEdges'] == (want == 'likely') for w in above),
          f'{want} {[w["basis"] for w in above][:3]}')
    inside_items = [o for o in st['items'] if o['level'] != 'outside']
    check(f'items inside the outline [{tag}]', all(in_ring(o['at'], ring) for o in inside_items)
          and all(not in_ring(o['at'], ring) for o in st['items'] if o['level'] == 'outside'),
          str([(o['name'], o['at']) for o in st['items'] if (o['level'] != 'outside') != in_ring(o['at'], ring)]))
    n_rooms = sum(len(f.get('rooms') or []) for f in card['floors'])
    rooms = [o for o in st['shell'] if o['role'] == 'room']
    check(f'rooms fitted inside [{tag}]', len(rooms) == n_rooms and all(o['basis'] == 'likely' for o in rooms), f'{len(rooms)} vs {n_rooms}')
    inner = [w for w in st['walls'] if w['inside']]
    check(f'inside walls inside the outline [{tag}]', inner and all(
        (in_ring(w[k], ring) or to_ring_dist(w[k], ring) < 0.05) for w in inner for k in ('a', 'b'))
        and all(in_ring([(w['a'][0] + w['b'][0]) / 2, (w['a'][1] + w['b'][1]) / 2], ring) for w in inner), f'{len(inner)}')
    n_wd = sum(1 for f in card['floors'] for r in f.get('runs') or [] if r['kind'] in ('wire', 'duct'))
    wd = [o for o in st['runs'] if o['kind'] in ('wire', 'duct')]
    check(f'wire and duct runs drawn [{tag}]', n_wd > 0 and len(wd) == n_wd and all(o['layer'] == ('elec' if o['kind'] == 'wire' else 'hvac') for o in wd)
          and all(o['transparent'] for o in wd if o['likely']))
    addr = page.inner_text('.h3-addr')
    txt = page.inner_text('.h3').lower()
    check(f'typed address, no example words [{tag}]', addr.strip() == card['address'] and not any(w in txt for w in ('example', 'sandbox', 'fictional')), addr)
    key = page.inner_text('.h3-key')
    check(f'key names the basis held [{tag}]', 'Public record' in key and 'Likely' in key
          and ('Company record' in key) == any(i.get('basis') == 'record' for f in card['floors'] for i in (f.get('items') or []) + (f.get('runs') or [])))
    page.evaluate("() => window.h.select('outline')")
    t = page.inner_text('.h3-info')
    old = b['footprint'].get('as_of', '') < '2021'
    check(f'outline card [{tag}]', 'Building outline' in t and 'Public record' in t and 'Outline from imagery dated' in t
          and ('may be out of date' in t) == old and ('parcel not matched' in t) == (card.get('place', {}).get('precision') == 'typed'), t[:160])
    page.evaluate('() => window.h.select(null)')
    # Behind this wall, on every wall that has something near it: each run listed with its basis; no wall is called clear
    page.click('[data-h3="wallmode"]')
    ok, seen, bad = True, 0, ''
    for wl in st['behind']:
        if not wl['list'] or seen >= 6:
            continue
        seen += 1
        page.evaluate('i => window.h.selectWall(i)', wl['i'])
        tx = page.inner_text('.h3-info')
        rows = page.eval_on_selector_all('.h3-info-list li', 'els => els.map(e => e.innerText)')
        for x in wl['list']:
            word = basis_word(x['basis'], False)
            if not any(x['label'] in r and word in r for r in rows):
                ok, bad = False, f"{wl['name']}: {x['label']} {word} not in {rows}"
        if any(f in tx.lower() for f in FORBIDDEN_WALL):
            ok, bad = False, tx
    page.click('[data-h3="wallmode"]')
    check(f'behind each wall lists runs and basis [{tag}]', ok and seen > 0, bad[:200])


def file_checks(check, card, back, tag):
    b = card['building']
    site = back.get('site') or {}
    fp = site.get('footprint') or {}
    same = lambda a, c: len(a) == len(c) and all(abs(p[0] - q[0]) < 0.011 and abs(p[1] - q[1]) < 0.011 for p, q in zip(a, c))
    check(f'file carries the footprint [{tag}]', fp.get('basis') == 'public' and same(fp.get('ring_m') or [], b['footprint']['ring_m'])
          and (same((site.get('parcel') or {}).get('ring_m') or [], b['parcel']['ring_m']) if b.get('parcel') else not site.get('parcel'))
          and site.get('height', {}).get('basis') == b['height']['basis'] and site.get('storeys', {}).get('basis') == b['storeys']['basis']
          and site.get('example') is False, json.dumps(site)[:200])
    ring = b['footprint']['ring_m']
    want = [min(p[0] for p in ring), max(p[0] for p in ring), -max(p[1] for p in ring), -min(p[1] for p in ring)]
    got = back.get('outlineBox') or [0, 0, 0, 0]
    check(f'file outline in place [{tag}]', all(abs(g - w) < 0.12 for g, w in zip(got, want)), f'{got} vs {want}')
    check(f'every object has a basis [{tag}]', back['roles'] > 0 and back['noBasis'] == [], ', '.join(back['noBasis'][:6]))


def card_counts(card):
    items = sum(len(f.get('items') or []) for f in card['floors']) + len(card.get('outside') or [])
    runs = sum(len([r for r in f.get('runs') or [] if len(r.get('points') or []) >= 2]) for f in card['floors'])
    likely = sum(1 for f in card['floors'] for i in f.get('items') or [] if i.get('basis') != 'record') + \
        sum(1 for o in card.get('outside') or [] if o.get('basis') != 'record') + \
        sum(1 for f in card['floors'] for r in f.get('runs') or [] if r.get('basis') != 'record')
    return items, runs, likely


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8982)
    ap.add_argument('--shots', default='')
    ap.add_argument('--downloads', default='')
    a = ap.parse_args()
    samples = json.load(open(SAMPLES))['samples']
    httpd = serve(a.port)
    base = f'http://127.0.0.1:{a.port}'
    results, fails = [], []

    def check(name, ok, detail=''):
        results.append((name, bool(ok), detail))
        if not ok:
            fails.append(f'{name}: {detail}')

    with sync_playwright() as p:
        br = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for theme in ('light', 'dark'):
            for vw, vh in ((1440, 900), (390, 844)):
                ctx = br.new_context(viewport={'width': vw, 'height': vh}, accept_downloads=True,
                                     color_scheme='dark' if theme == 'dark' else 'light')
                html = PAGE % (' data-sys-theme="dark"' if theme == 'dark' else '')
                ctx.route(f'{base}/__house3d_check.html*', lambda r: r.fulfill(status=200, content_type='text/html', body=html))
                for i, s in enumerate(samples):
                    card = s['card']
                    tag = f'{card["address"]} {vw}x{vh} {theme}'
                    page = ctx.new_page()
                    errs = []
                    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
                    page.on('pageerror', lambda e: errs.append(str(e)))
                    page.goto(f'{base}/__house3d_check.html?i={i}')
                    page.wait_for_function('window.done === true', timeout=60000)
                    check(f'draws [{tag}]', page.evaluate('window.ok') is True and page.locator('.h3[data-ready="1"]').count() == 1)
                    st = page.evaluate('window.h.stats()')
                    n_items, n_runs, n_likely = card_counts(card)
                    check(f'every item is an object [{tag}]', len(st['items']) == n_items, f"{len(st['items'])} vs {n_items}")
                    check(f'every run is an object [{tag}]', len(st['runs']) == n_runs, f"{len(st['runs'])} vs {n_runs}")
                    lk = [o for o in st['items'] + st['runs'] if o['likely']]
                    check(f'likely flagged [{tag}]', len(lk) == n_likely and all(o['basis'] == 'likely' and o['transparent'] for o in lk)
                          and all(o['dashedEdges'] for o in st['items'] if o['likely'])
                          and all(not o['likely'] and o['basis'] in ('record', 'public') for o in st['items'] + st['runs'] if o not in lk),
                          f'{len(lk)} vs {n_likely}')
                    labels = page.eval_on_selector_all('.h3-label', 'els => els.map(e => e.textContent)')
                    check(f'likely labels say likely [{tag}]', sum(1 for t in labels if t.endswith(', likely')) == n_likely)
                    ex = is_example(card)
                    addr = page.inner_text('.h3-addr')
                    check(f'key and example address [{tag}]', page.locator('.h3-key').count() == 1
                          and len(page.inner_text('.h3-key').split()) <= 8 and ('Example address' in addr) == ex
                          and addr.startswith(card['address']) and page.evaluate('window.h.stats().example') == ex, addr)
                    sw = page.evaluate('document.documentElement.scrollWidth')
                    check(f'no sideways scroll [{tag}]', sw <= vw, f'{sw}')
                    # controls
                    page.click('[data-h3="layer"][data-layer="water"]')
                    st2 = page.evaluate('window.h.stats()')
                    water = [o for o in st2['items'] + st2['runs'] if o['layer'] == 'water']
                    check(f'Water layer hides [{tag}]', water and not any(o['visible'] for o in water) and st2['layers']['water'] is False)
                    page.click('[data-h3="layer"][data-layer="water"]')
                    st2 = page.evaluate('window.h.stats()')
                    check(f'Water layer shows [{tag}]', all(o['visible'] for o in st2['items'] + st2['runs'] if o['layer'] == 'water'))
                    page.click('[data-h3="layer"][data-layer="walls"]')
                    st2 = page.evaluate('window.h.stats()')
                    check(f'Walls layer [{tag}]', not any(w['visible'] for w in st2['walls']))
                    page.click('[data-h3="layer"][data-layer="walls"]')
                    levels = st['levels']
                    top_i = len(levels) - 1
                    page.click(f'[data-h3="floor"][data-floor="0"]')
                    st2 = page.evaluate('window.h.stats()')
                    check(f'floor switch [{tag}]', st2['floor'] == levels[0] and not any(
                        w['visible'] for w in st2['walls'] if w['level'] != levels[0]))
                    page.click('[data-h3="floor"][data-floor="all"]')
                    for v in ('cutaway', 'top', 'outside'):
                        page.click(f'[data-h3="view"][data-v="{v}"]')
                        st2 = page.evaluate('window.h.stats()')
                        ok = st2['view'] == v and page.get_attribute(f'[data-h3="view"][data-v="{v}"]', 'aria-pressed') == 'true'
                        if v == 'cutaway':
                            ok = ok and not any(w['visible'] for w in st2['walls'] if w['name'] == 'Front wall')
                        if v == 'top':
                            ok = ok and len({w['level'] for w in st2['walls'] if w['visible']}) == 1
                        check(f'view {v} [{tag}]', ok)
                    # tap an item: its card says what it is and where it comes from
                    first = card['floors'][0]['items'][0] if card['floors'][0]['items'] else None
                    if first:
                        page.evaluate("k => window.h.select(k)", f"{card['floors'][0]['id']}-i0")
                        txt = page.inner_text('.h3-info')
                        want = basis_word(first['basis'], ex)
                        check(f'item card [{tag}]', first['label'] in txt and want in txt and (not first.get('detail') or first['detail'] in txt), txt[:120])
                    # a real tap at the canvas centre does not throw and leaves the view consistent
                    box = page.locator('.h3-canvas').bounding_box()
                    page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                    # one-finger turn: a drag moves the camera
                    before = page.evaluate("document.querySelector('.h3-canvas').toDataURL().length")
                    page.mouse.move(box['x'] + 100, box['y'] + 100)
                    page.mouse.down()
                    page.mouse.move(box['x'] + 220, box['y'] + 130, steps=6)
                    page.mouse.up()
                    page.wait_for_timeout(120)
                    after = page.evaluate("document.querySelector('.h3-canvas').toDataURL().length")
                    check(f'drag turns the house [{tag}]', before != after)
                    # Behind this wall
                    page.click('[data-h3="wallmode"]')
                    page.evaluate("() => window.h.select('Front wall')")
                    txt = page.inner_text('.h3-info')
                    exp = [x for x in st['behind'] if x['name'] == 'Front wall'][0]['list']
                    wires = any(r['kind'] in ('wire', 'electric') for f in card['floors'] for r in f.get('runs') or [])
                    check(f'behind this wall [{tag}]', 'Front wall' in txt and all(x['label'] in txt for x in exp)
                          and ('Wire runs: not in records' in txt) == (not wires) and not any(f in txt.lower() for f in FORBIDDEN_WALL), txt[:160])
                    page.click('[data-h3="wallmode"]')
                    if isinstance(card.get('building'), dict):
                        live_checks(check, page, card, st, tag)
                    # the file
                    if theme == 'light':
                        with page.expect_download() as dl:
                            page.click('[data-h3="download"]')
                        d = dl.value
                        check(f'file name [{tag}]', d.suggested_filename == card['address'] + '.glb', d.suggested_filename)
                        path = d.path()
                        if a.downloads and vw == 1440:
                            os.makedirs(a.downloads, exist_ok=True)
                            d.save_as(os.path.join(a.downloads, d.suggested_filename))
                        data = open(path, 'rb').read()
                        back = page.evaluate("""async ([b, url]) => {
                            const { GLTFLoader } = await import(url);
                            const buf = Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer;
                            const g = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
                            const out = { items: 0, runs: 0, likely: 0, names: [], roles: 0, noBasis: [], site: null, outlineBox: null };
                            const ROLES = ['item', 'run', 'wall', 'slab', 'room', 'roof', 'outline', 'parcel', 'outbuilding'];
                            g.scene.updateMatrixWorld(true);
                            g.scene.traverse(o => { const u = o.userData || {};
                              if (u.role === 'item') out.items++; if (u.role === 'run') out.runs++;
                              if ((u.role === 'item' || u.role === 'run') && u.basis === 'likely') out.likely++;
                              if (ROLES.includes(u.role)) { out.roles++; if (!['public', 'record', 'likely'].includes(u.basis)) out.noBasis.push(o.name); }
                              if (u.role === 'site') out.site = u;
                              if (u.role === 'outline' && o.isMesh) { o.geometry.computeBoundingBox(); const bb = new o.geometry.boundingBox.constructor().setFromObject(o, true);
                                out.outlineBox = [bb.min.x, bb.max.x, bb.min.z, bb.max.z].map(v => v + 0); }
                              if (o.name && out.names.length < 400) out.names.push(o.name); });
                            return out; }""", [__import__('base64').b64encode(data).decode(), LOADER])
                        check(f'file loads back [{tag}]', back['items'] == n_items and back['runs'] == n_runs and back['likely'] == n_likely,
                              json.dumps({k: back[k] for k in ('items', 'runs', 'likely')}))
                        check(f'file names [{tag}]', 'Walls' in back['names'] and 'Roof' in back['names']
                              and any(n.endswith('(likely)') for n in back['names']) == (n_likely > 0), ', '.join(back['names'][:12]))
                        if isinstance(card.get('building'), dict):
                            file_checks(check, card, back, tag)
                    if a.shots and i < 2 and theme == 'light' and vw == 1440:
                        os.makedirs(a.shots, exist_ok=True)
                        page.evaluate('() => window.h.select(null)')
                        for v in ('outside', 'cutaway', 'top'):
                            page.click(f'[data-h3="view"][data-v="{v}"]')
                            page.wait_for_timeout(700)
                            page.locator('.h3').screenshot(path=os.path.join(a.shots, f'house3d_{i}_{v}.png'))
                    if a.shots and i == 0 and vw == 390:
                        os.makedirs(a.shots, exist_ok=True)
                        page.evaluate('() => window.h.select(null)')
                        page.click('[data-h3="view"][data-v="cutaway"]')
                        page.wait_for_timeout(700)
                        page.screenshot(path=os.path.join(a.shots, f'house3d_phone_{theme}.png'), full_page=True)
                    check(f'no console error [{tag}]', not errs, ' | '.join(errs)[:300])
                    page.close()
                ctx.close()
        # no WebGL: nothing is drawn and the caller keeps the 2D sketch
        ctx = br.new_context(viewport={'width': 390, 'height': 844})
        ctx.add_init_script("""(() => { const g = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/.test(t) ? null : g.call(this, t, ...r); }; })();""")
        ctx.route(f'{base}/__house3d_check.html*', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGE % ''))
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'{base}/__house3d_check.html?i=0')
        page.wait_for_function('window.done === true', timeout=30000)
        check('no WebGL: fallback', page.evaluate('window.h.fallback === true && window.H.supports3D() === false')
              and page.locator('.h3').count() == 0 and not errs)
        # the plan rules, read without drawing
        live = [s['card'] for s in samples if isinstance(s['card'].get('building'), dict)]
        got = page.evaluate('''cards => cards.map(c => window.H.isExampleCard(c))''', [s['card'] for s in samples])
        check('example rule', got == [is_example(s['card']) for s in samples] and sum(got) >= 1, str(got))
        check('a live card is never example data', page.evaluate('''cards => cards.every(c => !window.H.isExampleCard(
              { ...c, basis: 'record', source_line: 'sandbox record, example data' }))''', live))
        check('town precision draws no outline', page.evaluate('''cards => cards.every(c => window.H.planOf({ ...c, place: { ...c.place, precision: 'town' } }).site === null
              && window.H.planOf(c).site !== null)''', live))
        rots = page.evaluate('''cards => cards.map(c => { const p = window.H.planOf(c); return [c.building.footprint.rot_deg ?? null,
              c.front, p.front, ((p.site.rot % 360) + 360) % 360, c.building.front && c.building.front.bearing_deg]; })''', live)
        ok = True
        for given, front, pfront, rot, bearing in rots:
            want = ((given + (180 if front == 'top' else 0)) % 360) if given is not None else ((bearing - 180) % 360)
            ok = ok and pfront == 'bottom' and abs(rot - want) < 0.5
        check('rotation: given, turned for a front at the top, or worked out from the outline', ok and any(r[0] is None for r in rots)
              and any(r[1] == 'top' for r in rots), str(rots))
        ctx.close()
        br.close()
    httpd.shutdown()
    for name, ok, detail in results:
        print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail and not ok else ''))
    print(f'{sum(1 for r in results if r[1])}/{len(results)} passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
