"""
Check the five answer pictures (assets/agent-views.js: scorecard, bridge, heatmap, pipeline_board, ranked_bars) against the
fixtures in data/agent/views_samples.json.

  uv run --no-project --python 3.12 --with playwright==1.60.0 python scripts/check_agent_views.py [--port 0] [--shots DIR] [--base URL]

Serves the repository on 127.0.0.1 (no backend; --base uses a server that is already running) and opens a small test page (served
by the browser route, never written to disk). For every fixture at 1440x900 and 390x844, in light and dark:
  - the card draws with no console error, one card of the right kind, no empty-state text;
  - nothing scrolls sideways (the page, the card, and no element reaches past the card's edge);
  - every item of the data is on the page, once, visible, with its basis and a visible mark;
  - the title, a lead of 40 words at most, the source line (data-src) and the draft button are there;
  - the draft button fires "bsp:draft" once, with a copy of the fixture's draft as detail, and it bubbles to the document;
  - a table becomes cards at 390 px and a board stacks into one column; the draft button is a 44 px target on a phone.
Then, once: hostile text is escaped, a long lead is cut at 40 words, an unknown kind and an empty view do not throw, a missing value
draws "No record", the stylesheet carries the importer's ?v= stamp, and destroy() removes the card.
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
SAMPLES = os.path.join(ROOT, 'data', 'agent', 'views_samples.json')
KINDS = ['scorecard', 'bridge', 'heatmap', 'pipeline_board', 'ranked_bars']
MARKS = {'example': 'Company record (example data)', 'est': 'est.', 'public': 'Public record', 'likely': 'Likely',
         'record': 'Company record', 'derived': 'Derived'}

PAGE = """<!doctype html><html lang="en"%s><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Views check</title><link rel="stylesheet" href="/assets/system.css"></head>
<body style="margin:0;padding:16px"><div id="host"></div><script type="module">
import * as V from '/assets/agent-views.js%s';
const data = await (await fetch('/data/agent/views_samples.json')).json();
window.V = V; window.samples = data.samples;
const i = new URLSearchParams(location.search).get('i');
window.events = [];
document.addEventListener('bsp:draft', e => window.events.push({ detail: e.detail, target: e.target.dataset.avKind, bubbles: e.bubbles }));
if (i !== null) { window.h = V.renderView(document.getElementById('host'), data.samples[Number(i)].view); await window.h.ready; }
window.done = true;
</script></body></html>"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(port):
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def page_route(html):
    return lambda route: route.fulfill(status=200, content_type='text/html', body=html)


def expected_items(view):
    d = view['data']
    k = view['kind']
    if k in ('scorecard', 'heatmap'):
        return len(d['rows']) * len(d['cols'])
    if k == 'bridge':
        return len(d['steps']) + 2
    if k == 'pipeline_board':
        return len(d['cards'])
    return len(d['bars'])


def expected_marks(view):
    """The basis every item must resolve to (item, then row, then view), as a list in document order."""
    d, k, vb = view['data'], view['kind'], view.get('basis', '')
    out = []
    if k in ('scorecard', 'heatmap'):
        for ri, r in enumerate(d['rows']):
            for ci in range(len(d['cols'])):
                cell = d['cells'][ri][ci]
                out.append((cell.get('basis') if isinstance(cell, dict) else None) or r.get('basis') or vb)
    elif k == 'bridge':
        out = [vb] + [s.get('basis') or vb for s in d['steps']] + [vb]
    elif k == 'pipeline_board':
        order = [s['id'] for s in d['stages']] + [c['stage'] for c in d['cards'] if c['stage'] not in [s['id'] for s in d['stages']]]
        for sid in dict.fromkeys(order):
            out += [c.get('basis') or vb for c in d['cards'] if c['stage'] == sid]
    else:
        out = [b.get('basis') or vb for b in d['bars']]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=0)
    ap.add_argument('--base', default='')
    ap.add_argument('--shots', default='')
    a = ap.parse_args()
    samples = json.load(open(SAMPLES))['samples']
    httpd = None
    if a.base:
        base = a.base.rstrip('/')
    else:
        httpd = serve(a.port)
        base = f'http://127.0.0.1:{httpd.server_address[1]}'
    results, fails = [], []

    def check(name, ok, detail=''):
        results.append((name, bool(ok), detail))
        if not ok:
            fails.append(f'{name}: {detail}')

    # the fixtures themselves
    seen = {s['view']['kind'] for s in samples}
    check('fixtures cover the five kinds', seen == set(KINDS), str(sorted(seen)))
    for s in samples:
        v = s['view']
        check(f'fixture envelope [{v["kind"]} {v["title"]}]', all(k in v for k in ('kind', 'title', 'lead', 'data', 'basis', 'source', 'as_of', 'draft'))
              and v['draft'].get('action') and v['draft'].get('label'))
        check(f'fixture lead is 40 words or fewer [{v["title"]}]', len(v['lead'].split()) <= 40, str(len(v['lead'].split())))
        check(f'fixture has no raw identifiers or addresses [{v["title"]}]', not re.search(r'@|\bst-[a-z]+-\d|\bsf-|\bfi-|\bdc-\d', json.dumps({k: x for k, x in v.items() if k != 'data'}))
              and not re.search(r'[a-z]+_[a-z]+', v['title'] + v['lead']))

    with sync_playwright() as p:
        br = p.chromium.launch()
        for theme in ('light', 'dark'):
            for vw, vh in ((1440, 900), (390, 844)):
                ctx = br.new_context(viewport={'width': vw, 'height': vh}, color_scheme='dark' if theme == 'dark' else 'light')
                html = PAGE % (' data-sys-theme="dark"' if theme == 'dark' else '', '')
                ctx.route(f'{base}/__views_check.html*', page_route(html))
                for i, s in enumerate(samples):
                    v = s['view']
                    tag = f'{v["kind"]} "{v["title"][:28]}" {vw}x{vh} {theme}'
                    page = ctx.new_page()
                    errs = []
                    page.on('console', lambda m, errs=errs: errs.append(m.text) if m.type == 'error' else None)
                    page.on('pageerror', lambda e, errs=errs: errs.append(str(e)))
                    page.goto(f'{base}/__views_check.html?i={i}')
                    page.wait_for_function('window.done === true', timeout=30000)
                    card = page.locator('section.av')
                    check(f'draws one card of its kind [{tag}]', card.count() == 1 and card.get_attribute('data-av-kind') == v['kind']
                          and page.locator('.av-empty').count() == 0)
                    check(f'no console error [{tag}]', not errs, '; '.join(errs)[:200])
                    check(f'stylesheet loaded [{tag}]', page.evaluate("getComputedStyle(document.querySelector('.av')).containerType") == 'inline-size')
                    # sideways scroll: page, card, and every element inside the card
                    sw = page.evaluate('document.documentElement.scrollWidth')
                    over = page.evaluate("""() => { const r = document.querySelector('.av').getBoundingClientRect(); const bad = [];
                        document.querySelectorAll('.av *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > r.right + 1 || b.left < r.left - 1)) bad.push(e.className || e.tagName); });
                        return { sw: document.querySelector('.av').scrollWidth - document.querySelector('.av').clientWidth, bad: bad.slice(0, 5) }; }""")
                    check(f'no sideways scroll [{tag}]', sw <= vw and over['sw'] <= 1 and not over['bad'], f'page {sw}, card {over}')
                    # every item
                    items = page.eval_on_selector_all('[data-av-item]', """els => els.map(e => { const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
                        const row = e.closest('[data-av-row]'); const m = e.querySelector('[data-av-mark]') || (row && row.querySelector('[data-av-mark]'));
                        const mb = m ? m.getBoundingClientRect() : null;
                        return { id: e.dataset.avItem, basis: e.dataset.basis, vis: b.width > 0 && b.height > 0 && cs.visibility !== 'hidden',
                                 mark: m ? m.textContent.trim() : '', markKey: m ? m.dataset.avMark : '', markVis: !!(mb && mb.width > 0 && mb.height > 0) }; })""")
                    want = expected_items(v)
                    check(f'every item is present once [{tag}]', len(items) == want and len({i['id'] for i in items}) == want, f'{len(items)} vs {want}')
                    check(f'every item is visible [{tag}]', all(i['vis'] for i in items))
                    exp = expected_marks(v)
                    check(f'every item shows its basis mark [{tag}]', len(items) == len(exp) and all(
                        i['basis'] == e and i['markVis'] and i['mark'] == MARKS.get(e, e) for i, e in zip(items, exp)),
                        str([(i['basis'], i['mark']) for i, e in zip(items, exp) if not (i['basis'] == e and i['markVis'])][:3]))
                    # text parts
                    title = page.inner_text('.av-title').strip()
                    lead = page.inner_text('.av-lead').strip() if page.locator('.av-lead').count() else ''
                    check(f'title and lead [{tag}]', title == v['title'] and 0 < len(lead.split()) <= 40 and lead == v['lead'], f'{len(lead.split())} words')
                    src = page.locator('[data-src]')
                    check(f'source line is marked data-src [{tag}]', src.count() == 1 and src.inner_text().strip() == v['source'])
                    check(f'as-of chip [{tag}]', page.locator('.av-asof').count() == 1 and page.inner_text('.av-asof').startswith('As of '))
                    # draft button and event
                    btn = page.locator('[data-av-draft]')
                    check(f'one draft button with its label [{tag}]', btn.count() == 1 and btn.inner_text().strip() == v['draft']['label'])
                    if vw < 560:
                        bb = btn.bounding_box()
                        check(f'draft button is a 44 px target on a phone [{tag}]', bb and bb['height'] >= 44 and bb['width'] >= 44, str(bb))
                    btn.click()
                    ev = page.evaluate('window.events')
                    check(f'draft event fires once with the draft [{tag}]', len(ev) == 1 and ev[0]['detail'] == v['draft'] and ev[0]['bubbles'] and ev[0]['target'] == v['kind'], str(ev)[:160])
                    # layout answers to the width
                    k = v['kind']
                    if k == 'scorecard':
                        hd = page.evaluate("getComputedStyle(document.querySelector('.av-sc-hd')).display")
                        cl = page.evaluate("getComputedStyle(document.querySelector('.av-sc-cell .av-cl')).display")
                        check(f'scorecard is a table wide, cards narrow [{tag}]', (hd != 'none' and cl == 'none') if vw > 560 else (hd == 'none' and cl != 'none'), f'{hd} {cl}')
                    if k == 'heatmap':
                        hd = page.evaluate("getComputedStyle(document.querySelector('.av-hm-hd')).display")
                        check(f'heat map is a grid wide, cards narrow [{tag}]', (hd != 'none') if vw > 560 else (hd == 'none'), hd)
                    if k == 'pipeline_board':
                        xs = page.eval_on_selector_all('.av-pb-col', 'els => els.map(e => Math.round(e.getBoundingClientRect().left))')
                        check(f'board columns side by side wide, stacked narrow [{tag}]', (len(set(xs)) > 1) if vw > 560 else (len(set(xs)) == 1), str(xs))
                    if k == 'heatmap':
                        hot = page.eval_on_selector_all('.av-hm-c[data-value]', 'els => els.map(e => [Number(e.dataset.value), parseFloat(e.style.getPropertyValue("--t"))])')
                        good_low = v['data'].get('good') != 'high'
                        hi, lo = max(hot, key=lambda x: x[0]), min(hot, key=lambda x: x[0])
                        check(f'heat map: worse is darker [{tag}]', (hi[1] > lo[1]) if good_low else (hi[1] < lo[1]), f'{hi} {lo}')
                    if k == 'bridge':
                        rows = page.eval_on_selector_all('.av-br-row', 'els => els.map(e => [e.className, e.dataset.delta || null])')
                        steps = v['data']['steps']
                        ok = all(('is-up' in r[0]) == (s['delta'] > 0) and ('is-down' in r[0]) == (s['delta'] < 0) for r, s in zip(rows[1:-1], steps))
                        check(f'bridge: favourable and unfavourable steps are told apart [{tag}]', ok, str(rows))
                    if k == 'ranked_bars':
                        w = page.eval_on_selector_all('.av-rb-bar', 'els => els.map(e => e.getBoundingClientRect().width)')
                        vals = [b['value'] for b in v['data']['bars']]
                        check(f'bars are in proportion [{tag}]', all((w[j] <= w[j + 1] + 1) == (vals[j] <= vals[j + 1]) or abs(w[j] - w[j + 1]) < 2 for j in range(len(w) - 1)), str(w))
                        if any('plan' in b for b in v['data']['bars']):
                            check(f'bars show the plan mark [{tag}]', page.locator('.av-rb-plan').count() == len(v['data']['bars']))
                    if a.shots and (vw, theme) in ((1440, 'light'), (390, 'light'), (1440, 'dark'), (390, 'dark')):
                        os.makedirs(a.shots, exist_ok=True)
                        page.locator('section.av').screenshot(path=os.path.join(a.shots, f'{i}-{k}-{vw}-{theme}.png'))
                    page.close()
                ctx.close()

        # once: robustness, escaping, the stamp, destroy
        ctx = br.new_context(viewport={'width': 1440, 'height': 900})
        ctx.route(f'{base}/__views_check.html*', page_route(PAGE % ('', '?v=20261123172325')))
        page = ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'{base}/__views_check.html')
        page.wait_for_function('window.done === true', timeout=30000)
        res = page.evaluate("""async () => {
          const host = document.getElementById('host'), V = window.V, S = window.samples.map(s => s.view);
          const out = {};
          // 1. hostile text is escaped, long lead cut at 40 words
          const bad = JSON.parse(JSON.stringify(S.find(v => v.kind === 'ranked_bars')));
          bad.title = '<img src=x onerror="window.pwned=1">'; bad.lead = Array.from({length: 60}, (_, i) => 'word' + i).join(' ');
          bad.data.bars[0].label = '<script>window.pwned=2<\\/script>'; bad.source = '<b>src</b>';
          const h1 = V.renderView(host, bad); await h1.ready;
          out.escaped = !host.querySelector('img') && !host.querySelector('script') && window.pwned === undefined && host.querySelector('.av-title').textContent === bad.title;
          out.leadWords = host.querySelector('.av-lead').textContent.split(/\\s+/).length;
          out.stamp = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')).filter(h => /agent-views/.test(h));
          // 2. destroy removes the card and no event fires after
          let n = 0; const f = () => n++; document.addEventListener('bsp:draft', f);
          const btn = h1.el.querySelector('[data-av-draft]'); h1.destroy(); btn.click();
          out.destroyed = !host.querySelector('.av') && n === 0; document.removeEventListener('bsp:draft', f);
          // 3. unknown kind, empty view, no container
          let threw = false, el1, el2, el3;
          try { const a = V.renderView(host, { kind: 'pie', title: 'x', data: {} }); el1 = host.querySelector('.av-empty')?.textContent; a.destroy();
                const b = V.renderView(host, null); el2 = host.querySelector('.av-empty')?.textContent; b.destroy();
                const c = V.renderView(null, S[0]); el3 = typeof c.destroy;
                for (const k of ['scorecard','bridge','heatmap','pipeline_board','ranked_bars']) { const z = V.renderView(host, { kind: k, title: 't', data: { rows: 5, cells: 'x', bars: [null, 3] } }); z.destroy(); } }
          catch (e) { threw = String(e); }
          out.robust = { threw, el1, el2, el3 };
          // 4. a missing value draws "No record" and keeps its item
          const sc = JSON.parse(JSON.stringify(S.find(v => v.kind === 'scorecard'))); sc.data.cells[1][2] = null;
          const h2 = V.renderView(host, sc); await h2.ready;
          out.noRecord = h2.el.querySelectorAll('[data-av-item]').length === sc.data.rows.length * sc.data.cols.length && /No record/.test(h2.el.querySelector('.is-none')?.textContent || '');
          h2.destroy();
          const hm = JSON.parse(JSON.stringify(S.find(v => v.kind === 'heatmap'))); hm.data.cells[0][0] = null;
          const h3 = V.renderView(host, hm); await h3.ready;
          out.noRecordHeat = h3.el.querySelectorAll('[data-av-item]').length === hm.data.rows.length * hm.data.cols.length && /No record/.test(h3.el.querySelector('.av-hm-c.is-none')?.textContent || '');
          h3.destroy();
          // 5. a draft without a label draws no button; a view without a draft too
          const nd = JSON.parse(JSON.stringify(S[0])); nd.draft = null;
          const h4 = V.renderView(host, nd); out.noDraft = !h4.el.querySelector('[data-av-draft]'); h4.destroy();
          // 6. formatting
          out.fmt = [V.fmtValue(1983, '$k'), V.fmtValue(252, '$k'), V.fmtValue(23992, '$k'), V.fmtValue(3.2, '$M'), V.fmtValue(43, '%'), V.fmtValue(-12, '$k'), V.fmtValue(null, '%'), V.fmtValue(14, 'jobs')];
          return out; }""")
        check('hostile text is escaped', res['escaped'])
        check('lead is cut at 40 words', res['leadWords'] == 40, str(res['leadWords']))
        check('stylesheet carries the importer stamp', res['stamp'] == ['http://127.0.0.1:%s/assets/agent-views.css?v=20261123172325' % base.rsplit(':', 1)[1]] or (len(res['stamp']) == 1 and res['stamp'][0].endswith('agent-views.css?v=20261123172325')), str(res['stamp']))
        check('destroy removes the card and its listener', res['destroyed'])
        rb = res['robust']
        check('unknown kind, empty view, no container do not throw', not rb['threw'] and rb['el1'] and rb['el2'] and rb['el3'] == 'function', str(rb))
        check('a missing scorecard value draws No record', res['noRecord'])
        check('a missing heat map value draws No record', res['noRecordHeat'])
        check('no draft, no button', res['noDraft'])
        check('number formats', res['fmt'] == ['$1.98M', '$252k', '$24.0M', '$3.2M', '43%', '−$12k', 'No record', '14 jobs'], str(res['fmt']))
        check('no console error in the robustness run', not errs, '; '.join(errs)[:200])
        ctx.close()
        br.close()
    if httpd:
        httpd.shutdown()
    for name, ok, detail in results:
        if not ok:
            print('FAIL', name, detail)
    print(f'{sum(1 for r in results if r[1])}/{len(results)} checks passed')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
