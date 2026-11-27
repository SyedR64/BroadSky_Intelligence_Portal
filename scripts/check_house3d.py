"""
Check the 3D house view (assets/house3d.js) against the floor sketch cards in data/agent/house3d_samples.json: cards captured from
the sandbox (company example data and the public branch) and live-shaped cards (a real outline, parcel, height and storeys).

  uv run --no-project --python 3.12 --with playwright==1.60.0 python scripts/check_house3d.py [--port 8982] [--shots DIR]

Serves the repository on 127.0.0.1 (no backend), opens a small test page (served by the browser route, never written to disk)
and, for every sample card at 1440x900 and 390x844 in light and dark:
  - the view draws with no console error and no sideways scroll;
  - every item and run of the card is one object in the scene, and likely ones are flagged likely (translucent, dashed);
  - the view, floor, layer and "Behind this wall" controls work (the cutaway cuts the top floor's walls low), and tapping an item opens its card;
  - "Download model" saves <address>.glb, which loads back in three.js GLTFLoader with the same item and run count;
  - "Example address" is written only on a card from company example data, and a company record there says "(example data)";
  - a large building (building.kind "large" or layout.from "none"): the shell only, the real outline stood up with a line at each
    storey and a flat roof, no rooms, no inside walls, no lines, no "Behind this wall", no floor chips, the layout note shown, and no
    word house, home, garage, living, bedroom or kitchen on screen, in the labels or in the file;
  - square runs (every segment axis-aligned in the card): drawn as the card has them (never moved), and a run with risers draws
    vertical pieces through the floor, paired on the floor above or below;
  - a live card: the outline is public and solid, the walls follow it, the parcel edge is drawn, the shell's basis follows the
    height, rooms, inside walls, items and runs sit inside the outline, wire and duct runs are drawn, "Behind this wall" lists the
    runs touching each wall with their basis and never calls a wall clear, and the file carries the footprint, the parcel and a
    basis on every object, placed east and south of the card's origin;
  - card mode (embed, follow, intro), as the agent's floor sketch card opens it: a lit model (tone mapping, shadows, pixel ratio at
    most 2) in the cutaway on the "Start here" floor (its walls cut low), the floors above as faint glass, contact shadows, "Start here" items glowing and always
    named, a turn-in that stops (none under reduced motion), focus(key) picking an item on its floor, likely parts still
    see-through and dashed, and destroy freeing the canvas;
  - framing (reduced motion, canvas 328, 358, 700 and 1000 px wide): on a lot with another building (the town hall sample and the
    nj_full fixture) every corner of the drawn building and of each "Other building" block is at least 6 px inside the picture in
    every view offered, also when the picture narrows after the view was chosen (a turn is kept then); with three more buildings
    round the hall the frame still holds the nearest that fit, and with one more 300 m off the garage is whole; any other card, and
    the town hall with its other building moved 600 m off, keeps the drawn building's own frame (target, radius and distance as
    before, to the last digit).
With --shots it saves the Outside, Cutaway and Top views of the first two samples. Network: only the library host.
"""

import argparse
import functools
import http.server
import json
import os
import re
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
HOUSE_WORDS = ('house', 'home', 'garage', 'living', 'bedroom', 'kitchen')
RUN_LAYER = {'water': 'water', 'drain': 'drain', 'gas': 'gas', 'wire': 'elec', 'electric': 'elec', 'power': 'elec', 'duct': 'hvac'}
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
    n_wd = sum(1 for f in card['floors'] for r in f.get('runs') or [] if r['kind'] in ('wire', 'duct', 'power'))
    wd = [o for o in st['runs'] if o['kind'] in ('wire', 'duct', 'power')]
    check(f'wire and duct runs drawn [{tag}]', n_wd > 0 and len(wd) == n_wd and all(o['layer'] == RUN_LAYER[o['kind']] for o in wd)
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
    m = re.search(r'\b(\d+) (story|stories)\b', t)
    check(f'outline card spells story, stories, never the other spelling [{tag}]',
          bool(m) and m.group(2) == ('story' if m.group(1) == '1' else 'stories') and 'storey' not in t.lower(), t[:160])
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


def is_square(pts):
    return all(abs(a[0] - b[0]) < 0.05 or abs(a[1] - b[1]) < 0.05 for a, b in zip(pts, pts[1:]))


def square_checks(check, card, st, tag):
    """A card whose runs are all square: the scene draws them as given, risers stand through the floor and pair up across floors."""
    runs = [r for lvl in st['levels'] for f in card['floors'] if f['id'] == lvl for r in f.get('runs') or [] if len(r.get('points') or []) >= 2]
    if not runs or not all(is_square(r['points']) for r in runs):
        return
    rows = st['runs']
    same = len(rows) == len(runs) and all(
        len(o['points']) == len(r['points']) and all(abs(p[0] - q[0]) < 0.01 and abs(p[1] - q[1]) < 0.01 for p, q in zip(o['points'], r['points']))
        and o['kind'] == r['kind'] for o, r in zip(rows, runs))
    check(f'square runs drawn as the card has them [{tag}]', same and not any(o['snapped'] for o in rows) and all(is_square(o['points']) for o in rows),
          str([o['points'] for o in rows if not is_square(o['points']) or o['snapped']])[:200])
    want = [len(r.get('risers') or []) for r in runs]
    check(f'risers counted on every run [{tag}]', [o['risers'] for o in rows] == want, f"{[o['risers'] for o in rows]} vs {want}")
    tall = all((o['top'] - o['bottom'] > 0.45) == (n > 0) for o, n in zip(rows, want))
    check(f'a riser stands through the floor, a plain run lies flat [{tag}]', tall,
          str([(o['kind'], round(o['top'] - o['bottom'], 2), n) for o, n in zip(rows, want)]))
    # the same spot on the floor above or below carries the matching riser
    spots = {}
    for lvl in st['levels']:
        for f in card['floors']:
            if f['id'] == lvl:
                for r in f.get('runs') or []:
                    for x, y, d in r.get('risers') or []:
                        spots.setdefault(lvl, []).append((x, y, d, r['kind']))
    order = st['levels']
    ok, bad = True, ''
    for i, lvl in enumerate(order):
        for x, y, d, k in spots.get(lvl, []):
            j = i + (1 if d == 'up' else -1)
            partner = 'down' if d == 'up' else 'up'
            if not (0 <= j < len(order) and any(abs(x - a) < 0.05 and abs(y - b) < 0.05 and dd == partner and kk == k for a, b, dd, kk in spots.get(order[j], []))):
                ok, bad = False, f'{lvl} {k} riser {d} at {x},{y} has no {partner} riser on the next floor'
    check(f'risers pair on the next floor [{tag}]', ok and any(spots.values()), bad)


def large_checks(check, page, card, st, tag):
    """A large building: the shell only, and the plan says the interior is not on record."""
    b = card['building']
    site = st['site']
    ring = site['ring']
    shell = {o['name']: o for o in st['shell']}
    out = shell.get('Building outline')
    check(f'large: outline is public and solid [{tag}]', out is not None and out['basis'] == 'public' and not out['transparent'] and not out['dashedEdges']
          and len(ring) == len(b['footprint']['ring_m']))
    first = [w for w in st['walls'] if w['level'] == st['levels'][0] and not w['inside']]
    edges = sum(1 for i in range(len(ring)) if ((ring[i][0] - ring[(i + 1) % len(ring)][0]) ** 2 + (ring[i][1] - ring[(i + 1) % len(ring)][1]) ** 2) ** 0.5 > 0.16)
    on_ring = all(min(((w[k][0] - q[0]) ** 2 + (w[k][1] - q[1]) ** 2) ** 0.5 for q in ring) < 0.05 for w in first for k in ('a', 'b'))
    check(f'large: walls follow the outline [{tag}]', len(first) == edges and on_ring, f'{len(first)} walls, {edges} edges')
    n = b['storeys']['n']
    check(f'large: one level per storey [{tag}]', st['large'] is True and len(st['levels']) == min(12, n) and st['levels'][0] == 'first', str(st['levels']))
    check(f'large: no rooms, no inside walls, no lines, no items inside [{tag}]', st['rooms'] == 0 and not [w for w in st['walls'] if w['inside']]
          and not [o for o in st['shell'] if o['role'] == 'room'] and st['runs'] == [] and all(o['level'] == 'outside' for o in st['items']))
    lines = [o for o in st['shell'] if o['role'] == 'storey']
    check(f'large: a line at the top of each storey [{tag}]', len(lines) == len(st['levels']) and all(o['level'] == lv for o, lv in zip(lines, st['levels'])))
    rows = st['levelRows']
    height = rows[-1]['base'] + rows[-1]['height']
    check(f'large: stood up to the storeys, flat roof above [{tag}]', st['roof']['flat'] and abs(st['roof']['top'] - height) < 0.01
          and all(abs(rows[i + 1]['base'] - (rows[i]['base'] + rows[i]['height'])) < 0.01 for i in range(len(rows) - 1))
          and (not b.get('height', {}).get('eave_m') or abs(height - max(2.4 * n, min(5 * n, b['height']['eave_m']))) < 0.2), f"{height} vs {b.get('height')}")
    check(f'large: the outside items stand outside on the street side [{tag}]', len(st['items']) == len(card['outside']) and all(o['level'] == 'outside' for o in st['items'])
          and all(not in_ring(o['at'], ring) for o in st['items']))
    check(f'large: no floor chips, no "Behind this wall" [{tag}]', page.locator('[data-h3="floor"]').count() == 0 and page.locator('[data-h3="wallmode"]').count() == 0
          and page.evaluate("() => (window.h.selectWall(0), document.querySelector('.h3-info').hidden)") is True)
    check(f'large: the note is the plan\'s, not repeated on the 3D panel [{tag}]', page.locator('.h3-note').count() == 0 and st['note'] == card['layout']['note'])
    check(f'large: no layer chips or cutaway for a shell [{tag}]', page.locator('[data-h3="layer"]').count() == 0
          and page.locator('[data-v="cutaway"]').count() == 0)
    seen = page.evaluate("""() => { const el = document.querySelector('.h3'); const out = [el.innerText];
        el.querySelectorAll('[aria-label],[title]').forEach(e => out.push(e.getAttribute('aria-label') || '', e.getAttribute('title') || '')); return out.join(' | ').toLowerCase(); }""")
    check(f'large: no house word on screen or in a label [{tag}]', not any(w in seen for w in HOUSE_WORDS), seen[:200])
    check(f'large: not called example [{tag}]', 'example' not in seen)


def other_checks(check, card, st, tag):
    """Another sizeable building on the lot (outbuildings kind "building") stands as a plain block about 4 m high named "Other
    building"; a shed or detached garage stays a 2.4 m "Outbuilding"."""
    outs = ((card.get('building') or {}).get('footprint') or {}).get('outbuildings') or []
    if not outs:
        return
    got = [o for o in st['shell'] if o['role'] == 'outbuilding']
    others = [o for o in got if o.get('kind') == 'building']
    sheds = [o for o in got if o.get('kind') != 'building']
    n_other = sum(1 for o in outs if o.get('kind') == 'building')
    check(f'another building on the lot is "Other building", about 4 m, not an outbuilding [{tag}]',
          len(others) == n_other and all(o['name'].startswith('Other building') and o['label'] == 'Other building' and abs((o.get('top') or 0) - 4) < 0.05 for o in others),
          json.dumps(others)[:200])
    check(f'a shed stays a 2.4 m outbuilding [{tag}]', len(sheds) == len(outs) - n_other
          and all(o['name'].startswith('Outbuilding') and abs((o.get('top') or 0) - 2.4) < 0.05 for o in sheds), json.dumps(sheds)[:200])


FIXTURE = os.path.join(ROOT, 'server', 'tests', 'fixtures', 'site', 'nj_full.json')
FRAME_WIDTHS = ((430, 932, 328), (430, 932, 358), (1440, 900, 700), (1440, 900, 1000))   # page size, canvas width
VIEWS = {'outside': (0.62, 1.08, 0.95), 'cutaway': (0.38, 0.86, 0.88), 'top': (0, 0.001, 0.8)}   # as in assets/house3d.js


def has_other(card):
    return any(o.get('kind') == 'building' for o in ((card.get('building') or {}).get('footprint') or {}).get('outbuildings') or [])


def main_frame(f, view, large):
    """The camera of a card with no other building on the lot: the drawn building's own frame, as on main."""
    import math
    W, D, top, bottom = f['size']['W'], f['size']['D'], f['size']['top'], f['size']['bottom']
    radius = 0.5 * math.hypot(W + 2, D + 2, top - bottom)
    th, ph, k = VIEWS[view]
    vf = f['fov'] * math.pi / 180
    hf = 2 * math.atan(math.tan(vf / 2) * f['w'] / max(1, f['h']))
    r = radius / math.sin(min(vf, hf) / 2) * (k * 1.3 if large and view == 'top' else k)
    return [0, (top + bottom) / 2, 0], radius, r


def same_num(a, b):
    return abs(a - b) <= 1e-9 * max(1, abs(a), abs(b))


SETTLE = """async w => { await new Promise(r => { const t0 = performance.now(); (function wait() {
    const c = document.querySelector('.h3-canvas');
    if ((c && Math.abs(c.clientWidth - w) <= 1) || performance.now() - t0 > 5000) r(); else requestAnimationFrame(wait); })(); });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))); }"""   # the canvas has its width and the resize has run
MOUNT = """async ([c, w]) => { if (window.h) window.h.destroy(); const host = document.getElementById('host'); host.style.width = '';
    window.h = window.H.renderHouse3D(host, c, {}); await window.h.ready;
    const d = host.clientWidth - document.querySelector('.h3-canvas').clientWidth; host.style.width = (w + d) + 'px'; }"""
WIDEN = """w => { const host = document.getElementById('host'); const d = host.clientWidth - document.querySelector('.h3-canvas').clientWidth;
    host.style.width = (w + d) + 'px'; }"""


def frame_of(page):
    """stats().frame, or None when the page has no frame stats (an older house3d.js): the checks then fail instead of stopping."""
    f = page.evaluate('window.h.stats() && window.h.stats().frame')
    return f if isinstance(f, dict) and 'building' in f and 'outbuildings' in f else None


def whole(f, names=None):
    """The drawn building and the "Other building" blocks lie 6 px inside the canvas, none cut. names: None for every block, a list
    of block names for those blocks, or 'any' for at least one block (with the wider frame in use)."""
    if not f:
        return False
    inside = lambda b: b['box'][0] >= 6 and b['box'][1] >= 6 and b['box'][2] <= f['w'] - 6 and b['box'][3] <= f['h'] - 6 and not b['clipped']
    blocks = [o for o in f['outbuildings'] if o['kind'] == 'building']
    if names == 'any':
        return f.get('fitted') is True and inside(f['building']) and any(inside(o) for o in blocks)
    blocks = [o for o in blocks if names is None or o['name'] in names]
    return bool(blocks) and inside(f['building']) and all(inside(o) for o in blocks)


def framing_checks(br, base, samples, check):
    """The camera frames the drawn building and every "Other building" block together: in each view and at canvas widths 328, 358,
    700 and 1000 px, every corner of both is at least 6 px inside the picture, also when the picture changes size after the view
    was chosen. When several other buildings stand round the lot, the nearest stays whole even if the farther ones would make the
    frame too wide. A card with no other building (or one far off) keeps the drawn building's own frame, to the last digit."""
    fixture = json.load(open(FIXTURE))['card']
    cards = [(f'sample {i}', s['card']) for i, s in enumerate(samples)] + [('nj_full fixture', fixture)]
    # the same lot with its other building moved 600 m off: past the limit, so the drawn building keeps its own frame
    far = json.loads(json.dumps(samples[6]['card']))
    for o in far['building']['footprint']['outbuildings']:
        if o.get('kind') == 'building':
            o['ring_m'] = [[x + 600, y] for x, y in o['ring_m']]
    cards.append(('sample 6, other building 600 m off', far))
    # past the limit only with every building together, the frame keeps the nearer ones instead of none
    sq = lambda x0, y0, x1, y1: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    more = lambda rings: [{'ring_m': r, 'basis': 'public', 'kind': 'building'} for r in rings]
    crowd = json.loads(json.dumps(samples[6]['card']))   # three more buildings round the hall: the nearest that fit are whole
    crowd['building']['footprint']['outbuildings'] += more((sq(40, -20, 80, 20), sq(-80, -20, -45, 20), sq(-20, 50, 20, 80)))
    cards.append(('sample 6, three more buildings round it', crowd))
    garage = json.loads(json.dumps(samples[6]['card']))   # the garage beside the hall and one building 300 m off: the garage is whole
    garage['building']['footprint']['outbuildings'] += more((sq(300, -20, 340, 20),))
    cards.append(('sample 6, one more building 300 m off', garage))
    need = {'sample 6, three more buildings round it': 'any', 'sample 6, one more building 300 m off': ['Other building 1']}
    n_other = 0
    for vw, vh, cw in FRAME_WIDTHS:
        start = max(w for pw, ph, w in FRAME_WIDTHS if (pw, ph) == (vw, vh))   # the widest canvas on this page, to shrink from
        ctx = br.new_context(viewport={'width': vw, 'height': vh}, reduced_motion='reduce')
        ctx.route(f'{base}/__house3d_check.html*', lambda r: r.fulfill(status=200, content_type='text/html', body=PAGE % ''))
        page = ctx.new_page()
        page.goto(f'{base}/__house3d_check.html?i=0')
        page.wait_for_function('window.done === true', timeout=60000)
        for name, card in cards:
            tag = f'{name} canvas {cw}'
            other = has_other(card) and name != 'sample 6, other building 600 m off'
            names = need.get(name)
            if other and cw != start:
                # the picture narrows after the view is chosen, with no view pressed: the frame is fitted again
                page.evaluate(MOUNT, [card, start]); page.evaluate(SETTLE, start)
                page.evaluate(WIDEN, cw); page.evaluate(SETTLE, cw)
                f = frame_of(page)
                check(f'frame: still whole after the picture narrows from {start} px [{tag} outside]', f and abs(f['w'] - cw) <= 1 and whole(f, names),
                      json.dumps(f and {'w': f['w'], 'building': f['building'], 'others': f['outbuildings']}))
                # after a turn the camera stays where the person put it when the picture changes size
                page.evaluate(MOUNT, [card, start]); page.evaluate(SETTLE, start)
                box = page.locator('.h3-canvas').bounding_box()
                page.mouse.move(box['x'] + 100, box['y'] + 100); page.mouse.down()
                page.mouse.move(box['x'] + 160, box['y'] + 100, steps=4); page.mouse.up()
                f0 = frame_of(page)
                page.evaluate(WIDEN, cw); page.evaluate(SETTLE, cw)
                f1 = frame_of(page)
                check(f'frame: a turn is kept when the picture narrows [{tag}]', f0 and f1 and not f1.get('preset', True) and same_num(f0['r'], f1['r'])
                      and same_num(f0['theta'], f1['theta']) and abs(f0['theta'] - 0.62) > 0.1,
                      json.dumps([f0 and [f0['r'], f0['theta']], f1 and [f1['r'], f1['theta']]]))
            page.evaluate(MOUNT, [card, cw]); page.evaluate(SETTLE, cw)
            st = page.evaluate('window.h.stats()')
            n_other += other
            views = ('outside', 'top') if st['large'] else ('outside', 'cutaway', 'top')
            for v in views:
                page.evaluate('v => window.h.view(v)', v)
                f = frame_of(page)
                if other:
                    check(f'frame: the drawn building and the other building are whole in the picture, 6 px in [{tag} {v}]',
                          f and abs(f['w'] - cw) <= 1 and whole(f, names),
                          json.dumps(f and {'w': f['w'], 'h': f['h'], 'building': f['building'], 'others': f['outbuildings']}))
                elif cw in (358, 1000):
                    t, rad, r = main_frame(f, v, st['large']) if f else ([0, 0, 0], 0, 0)
                    check(f'frame: unchanged without another building nearby [{tag} {v}]', f and all(same_num(a, b) for a, b in zip(f['target'], t))
                          and same_num(f['radius'], rad) and same_num(f['r'], r),
                          json.dumps({'got': f and [f['target'], f['radius'], f['r']], 'want': [t, rad, r]}))
        ctx.close()
    check('frame: the samples and the fixture hold a lot with another building', n_other >= 8, str(n_other))


CARD_MOUNT = """async ([c, o]) => { if (window.h) window.h.destroy(); const host = document.getElementById('host');
    window.h = window.H.renderHouse3D(host, c, o); await window.h.ready; return true; }"""


def card_mode_checks(br, base, samples, check):
    """The view as a card opens it (embed, follow, intro): a lit model (tone mapping, shadows, pixel ratio at most 2), opened in the
    cutaway on the floor that holds the "Start here" items, its walls cut low (a dollhouse section), the floors above as faint glass,
    soft contact shadows; "Start here" items glow and are always named, other items only while pointed at; a slow turn-in that stops (none
    under reduced motion) and nothing drawn after; focus(key) shows the item's floor, picks it and turns the camera to it; the
    likely parts stay see-through with dashed edges; destroy frees the canvas. Light and dark, 1440 and 390 px."""
    plumber = next(s['card'] for s in samples if s['card']['address'].startswith('27 Brindlemoor'))
    for theme, (vw, vh), red in (('dark', (1440, 900), False), ('light', (390, 844), True)):
        ctx = br.new_context(viewport={'width': vw, 'height': vh}, reduced_motion='reduce' if red else 'no-preference', color_scheme=theme)
        html = PAGE % (' data-sys-theme="dark"' if theme == 'dark' else '')
        ctx.route(f'{base}/__house3d_check.html*', lambda r: r.fulfill(status=200, content_type='text/html', body=html))
        page = ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'{base}/__house3d_check.html?i=0')
        page.wait_for_function('window.done === true', timeout=60000)
        tag = f'card mode {vw} {theme}{" reduced" if red else ""}'
        for card in (plumber,) + tuple(s['card'] for s in samples if (s['card'].get('building') or {}).get('kind') == 'house'):
            t = f"{tag} {card['address']}"
            page.evaluate(CARD_MOUNT, [card, {'embed': True, 'follow': True, 'intro': True, 'view': 'cutaway'}])
            st = page.evaluate('window.h.stats()')
            r = st['render']
            check(f'card mode: a lit model, tone mapped, soft shadows, pixel ratio at most 2 [{t}]', r['toneMapped'] and r['shadows'] and 0 < r['pixelRatio'] <= 2, json.dumps(r))
            check(f'card mode: no heading or Close of its own inside a card [{t}]', page.locator('.h3-addr').count() == 0 and page.locator('[data-h3="close"]').count() == 0)
            focus = [o for o in st['items'] if o['focus']]
            fl = st['floor']
            # the floor of the first "Start here" kind in the card's own focus order (as planOf picks it)
            want_floor = next((o['level'] for k in card.get('focus') or [] for o in focus if o['kind'] == k and o['level'] != 'outside'),
                              next((o['level'] for o in focus if o['level'] != 'outside'), None))
            top = st['levels'][-1]
            check(f'card mode: opens in the cutaway on the "Start here" floor, its walls cut low, the floors above as faint glass, contact shadows [{t}]', st['view'] == 'cutaway'
                  and (fl == want_floor if want_floor and want_floor != top else fl == 'all') and (r['ghosts'] > 0 or fl == 'all') and r['section'] and r['contact'] > 0,
                  json.dumps({'floor': fl, 'want': want_floor, 'ghosts': r['ghosts'], 'section': r['section'], 'contact': r['contact']}))
            check(f'card mode: "Start here" items glow and only they are named at rest [{t}]', all(o['glow'] for o in focus)
                  and not any(o['glow'] for o in st['items'] if not o['focus'])
                  and all(any(l.split(',')[0] == o['name'].replace(' (likely)', '') for l in st['labels']) for o in focus if o['visible'])
                  and len(st['labels']) <= sum(1 for o in focus if o['visible']), json.dumps({'labels': st['labels'], 'focus': [o['name'] for o in focus]}))
            lk = [o for o in st['items'] + st['runs'] if o['likely']]
            walls = [w for w in st['walls'] if w['basis'] == 'likely']
            check(f'card mode: likely stays see-through and dashed, recorded stays solid [{t}]', all(o['transparent'] for o in lk)
                  and all(o['dashedEdges'] for o in st['items'] if o['likely']) and all(w['dashedEdges'] and w['transparent'] for w in walls if w['visible'])
                  and all(not o['transparent'] for o in st['items'] + st['runs'] if not o['likely'] and o['level'] in (fl, 'outside')))
            if red:
                check(f'card mode: no turn-in under reduced motion [{t}]', not st['moving'])
            else:
                f0 = st['frame']
                page.wait_for_timeout(400)
                moving = page.evaluate('window.h.stats().moving')
                page.wait_for_function('() => !window.h.stats().moving && !window.h.stats().drawing', timeout=20000)
                f1 = page.evaluate('window.h.stats().frame')
                page.wait_for_timeout(300)
                idle = page.evaluate('window.h.stats().drawing')
                # the turn is timed, not counted in frames: a slow software frame may outlast it, so the turn is read from where the camera went
                check(f'card mode: a slow turn-in that stops, nothing drawn after [{t}]', abs(f1['theta'] - f0['theta']) > 0.3 and not idle,
                      json.dumps({'moving': moving, 'theta': [f0['theta'], f1['theta']]}))
            item = next((o for o in st['items'] if not o['focus'] and o['level'] != 'outside'), None)
            if item:
                ok = page.evaluate("""n => { const s = window.h.stats(), o = s.items.find(x => x.name === n);
                    const lv = o.level, idx = s.items.filter(x => x.level === lv).findIndex(x => x.name === n); return window.h.focus(lv + '-i' + idx); }""", item['name'])
                page.wait_for_function('() => { const s = window.h.stats(); return !s.moving && !s.drawing; }', timeout=20000)
                s2 = page.evaluate('window.h.stats()')
                o2 = next(o for o in s2['items'] if o['name'] == item['name'])
                check(f'card mode: focus(key) shows its floor, picks it and names it [{t}]', ok and o2['visible'] and o2['glow']
                      and item['name'].replace(' (likely)', '') in ' '.join(s2['labels']) and s2['picked'],
                      json.dumps({'ok': ok, 'picked': s2['picked'], 'labels': s2['labels'], 'floor': s2['floor']}))
            page.keyboard.press('Escape')
        n = page.evaluate("() => { window.h.destroy(); return document.querySelectorAll('.h3, canvas').length; }")
        check(f'card mode: destroy frees the view [{tag}]', n == 0)
        sw = page.evaluate('document.documentElement.scrollWidth')
        check(f'card mode: no sideways scroll, no console error [{tag}]', sw <= vw and not errs, ' | '.join(errs)[:300])
        ctx.close()



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
        br = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
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
                    large3d = (card.get('building') or {}).get('kind') == 'large' or (card.get('layout') or {}).get('from') == 'none'
                    if not large3d:                                     # a shell has no layer chips
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
                    if not st['large']:
                        page.click(f'[data-h3="floor"][data-floor="0"]')
                        st2 = page.evaluate('window.h.stats()')
                        check(f'floor switch [{tag}]', st2['floor'] == levels[0] and not any(
                            w['visible'] for w in st2['walls'] if w['level'] != levels[0]))
                        page.click('[data-h3="floor"][data-floor="all"]')
                    for v in (('top', 'outside') if large3d else ('cutaway', 'top', 'outside')):   # a shell offers no cutaway
                        page.click(f'[data-h3="view"][data-v="{v}"]')
                        st2 = page.evaluate('window.h.stats()')
                        ok = st2['view'] == v and page.get_attribute(f'[data-h3="view"][data-v="{v}"]', 'aria-pressed') == 'true'
                        if v == 'cutaway':
                            # a dollhouse section: the walls of the top floor shown are cut low (you look over them), none stands full height
                            top_lv = st2['levels'][-1]
                            ok = ok and all(w['section'] for w in st2['walls'] if w['level'] == top_lv and w['visible']) and any(w['section'] for w in st2['walls'])
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
                    # Behind this wall (not offered on a large building)
                    if not st['large']:
                        page.click('[data-h3="wallmode"]')
                        page.evaluate("() => window.h.select('Front wall')")
                        txt = page.inner_text('.h3-info')
                        exp = [x for x in st['behind'] if x['name'] == 'Front wall'][0]['list']
                        wires = any(r['kind'] in ('wire', 'electric') for f in card['floors'] for r in f.get('runs') or [])
                        check(f'behind this wall [{tag}]', 'Front wall' in txt and all(x['label'] in txt for x in exp)
                              and ('Wire runs: not in records' in txt) == (not wires) and not any(f in txt.lower() for f in FORBIDDEN_WALL), txt[:160])
                        page.click('[data-h3="wallmode"]')
                    if isinstance(card.get('building'), dict):
                        if st['large']:
                            large_checks(check, page, card, st, tag)
                        else:
                            live_checks(check, page, card, st, tag)
                            square_checks(check, card, st, tag)
                        other_checks(check, card, st, tag)
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
                        if st['large']:
                            low = ' '.join(back['names']).lower()
                            check(f'large: the file holds a building, no rooms, no house word [{tag}]', 'Building' in back['names'] and 'Rooms' not in back['names']
                                  and 'House' not in back['names'] and not any(w in low for w in HOUSE_WORDS) and back['runs'] == 0, ', '.join(back['names'][:14]))
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
        framing_checks(br, base, samples, check)
        card_mode_checks(br, base, samples, check)
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
        # the large rule and the square-run rules, read without drawing
        cards = [s['card'] for s in samples]
        large = [c for c in cards if (c.get('building') or {}).get('kind') == 'large']
        square = [c for c in cards if (c.get('building') or {}).get('kind') == 'house' and any(
            r.get('risers') for f in c['floors'] for r in f.get('runs') or [])]
        check('samples hold two large cards and a square-run house with risers', len(large) == 2 and len(square) == 1
              and all(c['layout']['from'] == 'none' and [f['id'] for f in c['floors']] == ['first'] and c['floors'][0]['name'] == 'Ground floor'
                      and not c['floors'][0]['rooms'] and not c['floors'][0]['items'] and not c['floors'][0]['runs'] for c in large))
        check('samples hold a lot with another building and a shed (the town hall card)', any(
            {o.get('kind') for o in ((c.get('building') or {}).get('footprint') or {}).get('outbuildings') or []} == {'building', None} for c in cards))
        check('large rule: kind "large" or layout "none", never a house', page.evaluate('''cards => {
              const L = window.H.isLargeCard, c = cards[0];
              return L({ building: { kind: 'large' } }) && L({ layout: { from: 'none' } }) && !L({ building: { kind: 'house' }, layout: { from: 'outline' } })
                && !L({}) && !L(null) && !L({ building: {} }) && L(c) && !L({ ...c, building: { ...c.building, kind: 'house' }, layout: { from: 'outline' } }); }''', large))
        check('large rule: a card that carries rooms, items and runs still draws none', page.evaluate('''cards => cards.every(c => {
              const f = { ...c.floors[0], rooms: [{ x: 5, y: 5, w: 20, h: 20, label: 'Living room' }], items: [{ kind: 'main_water', label: 'Main', x: 9, y: 9 }],
                runs: [{ kind: 'water', points: [[9, 9], [9, 30]] }] };
              const p = window.H.planOf({ ...c, floors: [f] });
              return p.large && p.levels.every(l => l.rooms.length === 0 && l.items.length === 0 && l.runs.length === 0) && p.outside.length === c.outside.length; })''', large))
        check('large rule: storeys stand to the recorded height, capped at twelve, ground floor named by the card', page.evaluate('''cards => cards.every(c => {
              const mk = n => window.H.planOf({ ...c, building: { ...c.building, storeys: { n, basis: 'public' }, height: { eave_m: n * 3.6, basis: 'likely' } } });
              const a = mk(3), b = mk(30);
              return a.levels.length === 3 && a.levels[0].name === 'Ground floor' && a.levels[1].name === 'Floor 2' && Math.abs(a.levels[2].base - 2 * a.storeyH) < 1e-6
                && Math.abs(a.storeyH - 3.6) < 1e-6 && b.levels.length === 12 && !a.levels.some(l => l.below); })''', large))
        check('large rule: no outline (town precision) still draws a shell and says so', page.evaluate('''cards => cards.every(c => {
              const p = window.H.planOf({ ...c, place: { ...c.place, precision: 'town' } });
              return p.large && p.site === null && p.levels.length >= 1 && p.note === c.layout.note; })''', large))
        check('large rule: no house word in the large cards', not any(w in json.dumps(c).lower() for c in large for w in HOUSE_WORDS))
        check('square runs stay square: a point on the wall is kept, one far outside is moved in, a flipped card stays square', page.evaluate('''c => {
              const sq = p => p.levels.every(l => l.runs.every(r => r.points.every((q, i) => !i || Math.abs(q[0] - r.points[i - 1][0]) < 0.05 || Math.abs(q[1] - r.points[i - 1][1]) < 0.05)));
              const base = window.H.planOf(c);
              if (!sq(base) || base.snapped !== 0) return 'base ' + base.snapped;
              const first = c.floors.find(f => f.id === 'first'), r0 = first.runs[0];
              const near = window.H.planOf({ ...c, floors: c.floors.map(f => f.id !== 'first' ? f : { ...f, runs: [{ ...r0, points: [[r0.points[0][0], 33.2], ...r0.points.slice(1)] }] }) });
              const far = window.H.planOf({ ...c, floors: c.floors.map(f => f.id !== 'first' ? f : { ...f, runs: [{ ...r0, points: [[r0.points[0][0], 60], ...r0.points.slice(1)] }] }) });
              const flip = window.H.planOf({ ...c, front: 'top' });
              const rs = p => p.levels.find(l => l.id === 'first').runs[0].points[0];
              if (near.snapped !== 0 || rs(near)[1] !== 33.2) return 'near ' + near.snapped + ' ' + rs(near);
              if (far.snapped < 1 || rs(far)[1] > 33.05) return 'far ' + far.snapped + ' ' + rs(far);
              const f1 = base.levels.find(l => l.id === 'first').runs[0];
              const g1 = flip.levels.find(l => l.id === 'first').runs[0];
              const w = base.w, h = base.h;
              if (!sq(flip) || flip.snapped !== 0 || g1.points.some((q, i) => Math.abs(q[0] - (w - f1.points[i][0])) > 0.01 || Math.abs(q[1] - (h - f1.points[i][1])) > 0.01)) return 'flip';
              if (JSON.stringify(g1.risers) !== JSON.stringify(f1.risers.map(q => [w - q[0], h - q[1], q[2]]))) return 'flip risers ' + JSON.stringify(g1.risers);
              return 'ok'; }''', square[0]) == 'ok')
        check('power runs are electrical, and a service line alone is not wire in the walls', page.evaluate('''c => {
              const p = window.H.planOf(c);
              return p.levels.some(l => l.runs.some(r => r.kind === 'power')) && p.wires === false; }''', square[0]))
        ctx.close()
        br.close()
    httpd.shutdown()
    for name, ok, detail in results:
        print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail and not ok else ''))
    print(f'{sum(1 for r in results if r[1])}/{len(results)} passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
