"""
Check the 3D house view (assets/house3d.js) against the captured floor sketch cards in data/agent/house3d_samples.json.

  uv run --no-project --python 3.12 --with playwright==1.60.0 python scripts/check_house3d.py [--port 8982] [--shots DIR]

Serves the repository on 127.0.0.1 (no backend), opens a small test page (served by the browser route, never written to disk)
and, for every sample card at 1440x900 and 390x844 in light and dark:
  - the view draws with no console error and no sideways scroll;
  - every item and run of the card is one object in the scene, and likely ones are flagged likely (translucent, dashed);
  - the view, floor, layer and "Behind this wall" controls work, and tapping an item opens its card;
  - "Download model" saves <address>.glb, which loads back in three.js GLTFLoader with the same item and run count.
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
                          and all(not o['likely'] and o['basis'] == 'record' for o in st['items'] + st['runs'] if o not in lk),
                          f'{len(lk)} vs {n_likely}')
                    labels = page.eval_on_selector_all('.h3-label', 'els => els.map(e => e.textContent)')
                    check(f'likely labels say likely [{tag}]', sum(1 for t in labels if t.endswith(', likely')) == n_likely)
                    check(f'key and example address [{tag}]', page.locator('.h3-key').count() == 1
                          and len(page.inner_text('.h3-key').split()) <= 8 and 'Example address' in page.inner_text('.h3-addr'))
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
                        want = 'From records' if first['basis'] == 'record' else 'Likely'
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
                    check(f'behind this wall [{tag}]', 'Front wall' in txt and all(x['label'] in txt for x in exp)
                          and ('Wire runs: not in records' in txt), txt[:160])
                    page.click('[data-h3="wallmode"]')
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
                            const out = { items: 0, runs: 0, likely: 0, names: [] };
                            g.scene.traverse(o => { const u = o.userData || {};
                              if (u.role === 'item') out.items++; if (u.role === 'run') out.runs++;
                              if ((u.role === 'item' || u.role === 'run') && u.basis === 'likely') out.likely++;
                              if (o.name && out.names.length < 400) out.names.push(o.name); });
                            return out; }""", [__import__('base64').b64encode(data).decode(), LOADER])
                        check(f'file loads back [{tag}]', back['items'] == n_items and back['runs'] == n_runs and back['likely'] == n_likely,
                              json.dumps({k: back[k] for k in ('items', 'runs', 'likely')}))
                        check(f'file names [{tag}]', 'Walls' in back['names'] and 'Roof' in back['names']
                              and any(n.endswith('(likely)') for n in back['names']) == (n_likely > 0), ', '.join(back['names'][:12]))
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
        ctx.close()
        br.close()
    httpd.shutdown()
    for name, ok, detail in results:
        print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail and not ok else ''))
    print(f'{sum(1 for r in results if r[1])}/{len(results)} passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
