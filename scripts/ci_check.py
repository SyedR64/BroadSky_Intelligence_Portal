#!/usr/bin/env python3
"""Headless smoke test for the static site: every HTML page and every app route must load
without console errors or uncaught page errors.

  python3 scripts/ci_check.py                    # starts its own static server if :8765 is free
  python3 scripts/ci_check.py --base http://127.0.0.1:8765 --out ci-report --settle 2500

Pages:  every *.html in the repo except scripts/, .git/, node_modules/.
Routes: app.html#/<module>/<view> for each module/view parsed from modules/*.js (cross-checked against the
        live App registry once the app boots).
Ignored noise: luma.gl / deck.gl warnings and map-tile failures.
Warnings (listed in the report, never fatal): console errors caused by external hosts, i.e. third-party URLs (live
        public APIs, CDNs) answering 429 or 5xx, timing out, failing CORS or dropping the connection. The site
        falls back to data/live snapshots for those, so a rate limit upstream must not fail CI.
Errors (fatal): everything local: same-origin 4xx/5xx (a missing file in this repo), uncaught page errors and any
        console error that does not come from an external resource.
Exit 1 if any page or route has errors. Writes <out>/ci_summary.json and <out>/ci_summary.md.
Requires: pip install playwright && python -m playwright install chromium
"""
import argparse, asyncio, functools, http.server, json, os, re, socket, sys, tempfile, threading, time
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCLUDE_DIRS = {'legacy', 'scripts', '.git', 'node_modules', '.github', '.claude'}

IGNORE_TEXT = [
    re.compile(r'luma\.gl|deck\.gl|@deck\.gl|luma', re.I),
    re.compile(r'WebGL|GPU stall|GL Driver Message|CONTEXT_LOST|THREE\.WebGLRenderer', re.I),   # headless GPU noise
    re.compile(r'Download the React DevTools', re.I),
]
URL_RX = re.compile(r"https?://[^\s'\"()<>]+")
TILE_RX = re.compile(r'tile|/\d+/\d+/\d+(@2x)?\.(png|jpg|jpeg|webp|pbf|mvt)|basemaps|cartocdn|openstreetmap|arcgisonline|mapbox|stadiamaps|maptiler', re.I)


def find_pages():
    out = []
    for dp, dns, fns in os.walk(ROOT):
        rel = os.path.relpath(dp, ROOT)
        dns[:] = [d for d in dns if d not in EXCLUDE_DIRS and not d.startswith('.')]
        if rel != '.' and rel.split(os.sep)[0] in EXCLUDE_DIRS:
            continue
        out += [os.path.normpath(os.path.join(rel, f)).replace(os.sep, '/') for f in fns if f.endswith('.html')]
    return sorted(out)


def _matching(s, i, open_ch, close_ch):
    depth = 0
    for j in range(i, len(s)):
        if s[j] == open_ch: depth += 1
        elif s[j] == close_ch:
            depth -= 1
            if depth == 0: return j
    return len(s)


def parse_routes():
    """[(module_id, view_id)] from each module's `export default { id, views: [...] }`."""
    reg = os.path.join(ROOT, 'modules', 'registry.js')
    order = re.findall(r"import\s+\w+\s+from\s+'\./([\w-]+)\.js", open(reg).read()) if os.path.exists(reg) else []
    files = order or sorted(f[:-3] for f in os.listdir(os.path.join(ROOT, 'modules')) if f.endswith('.js'))
    routes = []
    for stem in files:
        src = open(os.path.join(ROOT, 'modules', stem + '.js')).read()
        k = src.find('export default {')
        if k < 0: continue
        body = src[k:]
        m = re.search(r"\bid:\s*'([\w-]+)'", body[:400])
        mid = m.group(1) if m else None
        if not mid:  # e.g. id: CFG.id
            cm = re.search(r"const\s+CFG\s*=\s*\{[^}]*?\bid:\s*'([\w-]+)'", src, re.S)
            mid = cm.group(1) if cm else stem
        v = body.find('views:')
        if v < 0: continue
        a = body.find('[', v); b = _matching(body, a, '[', ']')
        arr = body[a:b + 1]
        # top-level objects in the array only
        depth, views = 0, []
        for i, ch in enumerate(arr):
            if ch in '[{(': depth += 1
            elif ch in ']})': depth -= 1
            if ch == '{' and depth == 2:
                mm = re.match(r"\{\s*id:\s*'([\w-]+)'", arr[i:i + 80])
                if mm: views.append(mm.group(1))
        routes += [(mid, vid) for vid in views]
    return routes


def port_open(host, port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def start_server(port):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Collector:
    """errors fail the run; warnings (external hosts: 429/5xx, CORS, timeouts, dropped connections) are listed only."""
    RESOURCE_RX = re.compile(r'Failed to load resource|net::ERR_|blocked by CORS policy|CORS request did not succeed', re.I)

    def __init__(self, origin):
        self.origin, self.errors, self.warnings, self.ignored = origin, [], [], 0
        self.host = urlparse(origin).netloc

    def _external(self, url):
        n = urlparse(url).netloc if url else ''
        return bool(n) and n != self.host

    def _warn(self, kind, text, url=''):
        if url and TILE_RX.search(url): self.ignored += 1; return   # map tiles are noise, not a signal
        if any(w['text'] == text[:300] for w in self.warnings): return   # retries log the same line twice
        self.warnings.append({'kind': kind, 'text': text[:300], 'url': url})

    def on_console(self, msg):
        if msg.type != 'error': return
        loc = (msg.location or {}).get('url', '') if isinstance(msg.location, dict) else ''
        text = msg.text
        if any(rx.search(text) for rx in IGNORE_TEXT): self.ignored += 1; return
        if self.RESOURCE_RX.search(text):
            # the failing resource is the console location, or the first URL in the message (CORS, net::ERR_*)
            urls = [loc] + URL_RX.findall(text) if 'Failed to load resource' in text else URL_RX.findall(text) + [loc]
            target = next((u for u in urls if u and u.startswith('http')), '')
            if target and self._external(target): self._warn('external', text, target); return
            if not target and not loc: self._warn('external', text); return   # resource errors with no url are external fetches
        self.errors.append({'kind': 'console', 'text': text[:500], 'url': loc})

    def on_pageerror(self, err):
        text = str(err)
        if any(rx.search(text) for rx in IGNORE_TEXT): self.ignored += 1; return
        self.errors.append({'kind': 'pageerror', 'text': text[:500]})

    def on_response(self, resp):
        if resp.status < 400 or TILE_RX.search(resp.url): return
        if not self._external(resp.url):
            self.errors.append({'kind': 'http', 'text': f'{resp.status} {resp.url}'})
        elif resp.status == 429 or resp.status >= 500:
            self._warn('external', f'{resp.status} {resp.url}', resp.url)

    def on_requestfailed(self, req):
        if not self._external(req.url): return   # a local request that never completes surfaces as a console or http error
        f = req.failure
        reason = (f.get('errorText') if isinstance(f, dict) else f) or 'failed'
        if 'ERR_ABORTED' in str(reason): return   # our own 6 s timeout or a navigation, not an upstream failure
        self._warn('external', f'{reason} {req.url}', req.url)


def attach(page, col):
    page.on('console', col.on_console)
    page.on('pageerror', col.on_pageerror)
    page.on('response', col.on_response)
    page.on('requestfailed', col.on_requestfailed)


async def check_page(ctx, base, path, settle, sem):
    async with sem:
        page = await ctx.new_page(); col = Collector(base); attach(page, col); t0 = time.time()
        try:
            await page.goto(f'{base}/{path}', wait_until='load', timeout=45000)
            await page.wait_for_timeout(settle)
        except Exception as e:
            col.errors.append({'kind': 'navigation', 'text': str(e)[:300]})
        finally:
            await page.close()
        return {'target': path, 'errors': col.errors, 'warnings': col.warnings, 'ignored': col.ignored, 'seconds': round(time.time() - t0, 1)}


async def check_routes(ctx, base, routes, settle):
    """One app instance; navigate by hash so each route renders exactly as a user would reach it."""
    page = await ctx.new_page(); col = Collector(base); attach(page, col); results = []
    await page.goto(f'{base}/app.html#/{routes[0][0]}/{routes[0][1]}', wait_until='load', timeout=45000)
    await page.wait_for_function('() => window.BSP && window.BSP.App && window.BSP.App.modules.length > 0', timeout=30000)
    live = await page.evaluate('() => window.BSP.App.modules.flatMap(m => m.views.map(v => [m.id, v.id]))')
    missing = [r for r in map(tuple, live) if r not in routes]
    for mid, vid in routes + missing:
        n0, w0 = len(col.errors), len(col.warnings); t0 = time.time()
        try:
            await page.evaluate('h => { if (location.hash !== h) location.hash = h; }', f'#/{mid}/{vid}')
            await page.wait_for_function(
                "([m, v]) => window.BSP.App.current && window.BSP.App.current.id === m && window.BSP.App.view && window.BSP.App.view.id === v && !document.querySelector('#content > .loading')",
                arg=[mid, vid], timeout=30000)
            await page.wait_for_timeout(settle)
            failed = await page.evaluate("() => { const e = document.querySelector('#content .empty'); return e && /failed to render/i.test(e.textContent) ? e.textContent.trim() : null; }")
            if failed: col.errors.append({'kind': 'render', 'text': failed[:300]})
        except Exception as e:
            col.errors.append({'kind': 'navigation', 'text': str(e)[:300]})
        results.append({'target': f'app.html#/{mid}/{vid}', 'errors': col.errors[n0:], 'warnings': col.warnings[w0:], 'ignored': 0, 'seconds': round(time.time() - t0, 1)})
    await page.close()
    unknown = [f'{m}/{v}' for m, v in routes if [m, v] not in live]
    return results, unknown


async def run(args):
    from playwright.async_api import async_playwright
    pages, routes = find_pages(), parse_routes()
    if args.only:
        pages = [p for p in pages if args.only in p]; routes = [r for r in routes if args.only in f'{r[0]}/{r[1]}']
    print(f'ci_check: {len(pages)} pages, {len(routes)} app routes -> {args.base}')
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await browser.new_context(viewport={'width': 1440, 'height': 900}, service_workers='block')
        await ctx.add_init_script("try { localStorage.setItem('bsp-ci', '1'); } catch (e) {}")
        sem = asyncio.Semaphore(args.concurrency)
        page_results = await asyncio.gather(*[check_page(ctx, args.base, p, args.settle, sem) for p in pages])
        route_results, unknown = (await check_routes(ctx, args.base, routes, args.route_settle)) if routes else ([], [])
        # one retry for failing standalone pages: a deterministic error reproduces; a timing flake is reported but not fatal
        page_results = list(page_results)
        for _ in range(args.retries):
            for i, r in enumerate(page_results):
                if r['errors']:
                    again = await check_page(ctx, args.base, r['target'], args.settle * 2, sem)
                    if not again['errors']:
                        again['flaky_first_run'] = r['errors']; page_results[i] = again
        await browser.close()
    results = page_results + route_results
    flaky = [r['target'] for r in results if r.get('flaky_first_run')]
    bad = [r for r in results if r['errors']]
    warned = [r for r in results if r.get('warnings')]
    summary = {'base': args.base, 'checked_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'pages': len(pages), 'routes': len(route_results),
               'failed': len(bad), 'ok': not bad, 'warned': len(warned), 'flaky_passed_on_retry': flaky, 'routes_parsed_but_not_registered': unknown, 'results': results}
    os.makedirs(args.out, exist_ok=True)
    json.dump(summary, open(os.path.join(args.out, 'ci_summary.json'), 'w'), indent=1)
    md = [f"# Pages check: {'PASS' if not bad else 'FAIL'}", '', f"{len(pages)} pages and {len(route_results)} app routes checked; {len(bad)} with errors, {len(warned)} with external-host warnings (not failing).", '']
    if unknown: md += [f"Routes in modules/*.js not registered at runtime: {', '.join(unknown)}", '']
    if flaky: md += [f"Passed on retry (first run had errors): {', '.join(flaky)}", '']
    md += ['| Target | Result | Time |', '|---|---|---|']
    for r in results:
        res = 'ok' if not r['errors'] else str(len(r['errors'])) + ' error(s)'
        if r.get('warnings'): res += f" · {len(r['warnings'])} warning(s)"
        md.append(f"| `{r['target']}` | {res} | {r['seconds']}s |")
    for r in bad:
        md += ['', f"## {r['target']}"] + [f"- **{e['kind']}**: {e['text']}" for e in r['errors'][:20]]
    if warned:
        md += ['', '## Warnings: external hosts (not failing)', '']
        for r in warned:
            md += [f"- `{r['target']}`: {w['text']}" for w in r['warnings'][:10]]
    open(os.path.join(args.out, 'ci_summary.md'), 'w').write('\n'.join(md) + '\n')
    for r in results:
        print(f"  {'ok  ' if not r['errors'] else 'FAIL'}  {r['target']}  ({r['seconds']}s){'  [flaky: passed on retry]' if r.get('flaky_first_run') else ''}")
        for e in r['errors'][:8]:
            print(f"        {e['kind']}: {e['text'][:220]}")
        for w in (r.get('warnings') or [])[:4]:
            print(f"        warning (external): {w['text'][:200]}")
    print(f"ci_check: {'PASS' if not bad else 'FAIL'} - {len(results) - len(bad)}/{len(results)} clean, {len(warned)} with external-host warnings. Summary: {os.path.join(args.out, 'ci_summary.md')}")
    return 0 if not bad else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--base', default='http://127.0.0.1:8765')
    ap.add_argument('--out', default=os.path.join(tempfile.gettempdir(), 'bsp-ci-report'))
    ap.add_argument('--settle', type=int, default=2500, help='ms to wait after load on each page')
    ap.add_argument('--route-settle', type=int, default=1200, help='ms to wait after each app route renders')
    ap.add_argument('--concurrency', type=int, default=4)
    ap.add_argument('--retries', type=int, default=1, help='re-check a failing standalone page this many times')
    ap.add_argument('--only', default='', help='substring filter for pages/routes')
    args = ap.parse_args()
    u = urlparse(args.base)
    srv = None
    if u.hostname in ('127.0.0.1', 'localhost') and not port_open(u.hostname, u.port or 80):
        srv = start_server(u.port or 80); print(f'ci_check: started static server on {args.base}')
    try:
        return asyncio.run(run(args))
    finally:
        if srv: srv.shutdown()


if __name__ == '__main__':
    sys.exit(main())
