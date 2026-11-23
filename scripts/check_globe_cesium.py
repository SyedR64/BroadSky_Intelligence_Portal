"""Proof for the photorealistic globe renderer (assets/godseye-cesium.js).

Serves the repo's assets/ and a small test page (written to a scratch folder) from one local server, then drives
it with Playwright (headless Chromium, SwiftShader WebGL). The test page imports only the renderer's own files.

Run:
  uv run --no-project --python 3.12 --with playwright==1.60.0 python scripts/check_globe_cesium.py \
      [--port 8983] [--scratch DIR] [--quick]

Needs the network for the CesiumJS CDN and the key-free imagery (NASA GIBS, USGS The National Map). Every request to
Google or Cesium ion is intercepted: nothing metered is ever called, and no key is ever real.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
FAKE_KEY = "TEST-KEY-not-a-real-key"
FAKE_ION = "TEST-ION-not-a-real-token"
METERED = ("tile.googleapis.com", "api.cesium.com", "assets.ion.cesium.com", "assets.cesium.com",
           "virtualearth.net", "maps.googleapis.com")
CDN = ("unpkg.com/cesium@", "cdn.jsdelivr.net/npm/cesium@")

PAGE = """<!doctype html>
<html lang="en" data-sys-theme="dark"__THEME__>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Globe check</title>
<link rel="stylesheet" href="/assets/system.css">
<style>html,body{margin:0;height:100%;background:var(--sys-bg)}#g{position:fixed;inset:0}</style></head>
<body><div id="g"></div>
<script type="module">
import * as GX from '/assets/godseye-cesium.js';
window.GX = GX; window.GX_LOADED = true;
</script></body></html>
"""

THREE = {
    "title": "Top 3 add-on targets",
    "source": "Check fixture",
    "steps": [
        {"lat": 41.1839, "lon": -96.0314, "label": "1 · Example target", "sub": "La Vista, NE", "kind": "area",
         "figures": [["Fit", "92"], ["Revenue", "$18M est."], ["Staff", "120"]], "href": "#/ma/pipeline", "zoom": 12,
         "pitch": 50, "bearing": 20, "hold_ms": 1500},
        {"lat": 40.1001, "lon": -76.3541, "label": "2 · Example target", "sub": "East Petersburg, PA", "kind": "area",
         "figures": [["Fit", "84"], ["Revenue", "$9M est."]], "href": "#/ma/pipeline", "zoom": 12.5, "pitch": 55,
         "bearing": -30, "hold_ms": 1500},
        {"lat": 42.2626, "lon": -71.8023, "label": "3 · Example target", "sub": "Worcester, MA", "kind": "area",
         "figures": [["Fit", "83"]], "href": "https://example.com/not-allowed", "zoom": 12, "pitch": 45,
         "hold_ms": 1500},
    ],
    "marks": [{"lat": 39.95, "lon": -75.16, "label": "Mark"}],
}
ADDRESS = {
    "title": "Job view",
    "steps": [{"lat": 40.181, "lon": -76.2954, "label": "418 Wexcombe Ln", "sub": "Lititz, PA · sink repair",
               "kind": "address", "zoom": 19, "pitch": 65, "hold_ms": 2500, "figures": [["Floors", "2"]]}],
}

# A minimal, empty 3D Tiles tileset used to answer the intercepted root request (not Google content).
EMPTY_TILESET = {"asset": {"version": "1.0", "copyright": "Check fixture"}, "geometricError": 1000,
                 "root": {"boundingVolume": {"sphere": [0, 0, 0, 1]}, "geometricError": 0, "refine": "REPLACE"}}


def make_server(port: int, scratch: Path):
    class H(http.server.SimpleHTTPRequestHandler):
        def translate_path(self, path):
            p = urlparse(path).path
            if p.startswith("/assets/"):
                return str(ROOT / p.lstrip("/"))
            return str(scratch / p.lstrip("/"))

        def log_message(self, *a):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Check:
    def __init__(self):
        self.results = []

    def ok(self, name, cond, detail=""):
        self.results.append((name, bool(cond), detail))
        print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)
        return cond


def rects_overlap(a, b):
    if not a or not b:
        return False
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])


CARD_LOG_JS = """() => { window.CARDS = []; const root = document.querySelector('.gx-globe'); if (!root) return;
  const snap = () => { const c = root.querySelector('.gx-card'); if (!c || c.hidden) return;
    const label = c.querySelector('.sys-card-label')?.textContent || c.querySelector('.gx-card-title')?.textContent;
    if (window.CARDS.length && window.CARDS[window.CARDS.length - 1].label === label) return;
    window.CARDS.push({ t: performance.now(), label, title: c.querySelector('.gx-card-title')?.textContent,
      figs: [...c.querySelectorAll('.gx-fig')].map(f => [f.querySelector('dt').textContent, f.querySelector('dd').textContent]),
      href: c.querySelector('a.gx-open')?.getAttribute('href') || null }); };
  new MutationObserver(snap).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] }); }"""

RECT_JS = """(sel) => { const e = document.querySelector(sel); if (!e || e.hidden || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null;
  const r = e.getBoundingClientRect(); return r.width && r.height ? {x:r.x,y:r.y,w:r.width,h:r.height} : null; }"""


def measure(page):
    """Bytes the visitor downloads when the key-free globe opens (gzip as the CDN serves it), from the page's own
    resource list; each file is fetched once more here because cross-origin timing hides transfer sizes."""
    import urllib.request
    names = page.evaluate("[...new Set(performance.getEntriesByType('resource').map(e => e.name))]")
    lib = [n for n in names if any(c in n for c in CDN)]
    tiles = [n for n in names if "gibs.earthdata" in n or "nationalmap.gov" in n]

    def size(u):
        try:
            rq = urllib.request.Request(u, headers={"Accept-Encoding": "gzip", "User-Agent": "globe-check"})
            with urllib.request.urlopen(rq, timeout=30) as r:
                return len(r.read())
        except Exception:
            return 0

    lib_bytes = sum(size(u) for u in lib)
    js = [u for u in lib if u.endswith("Cesium.js")]
    return {"cesium_files": len(lib), "cesium_bytes_gzip": lib_bytes,
            "cesium_js_bytes_gzip": sum(size(u) for u in js), "imagery_tiles_at_open": len(tiles)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8983)
    ap.add_argument("--scratch", default=os.environ.get("GX_SCRATCH") or tempfile.mkdtemp(prefix="gx_cesium_"))
    ap.add_argument("--quick", action="store_true", help="one viewport and theme for the render pass")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    scratch = Path(args.scratch)
    (scratch / "t").mkdir(parents=True, exist_ok=True)
    shots = scratch / "shots"
    shots.mkdir(exist_ok=True)
    (scratch / "t" / "light.html").write_text(PAGE.replace("__THEME__", ' data-theme="light"'))
    (scratch / "t" / "dark.html").write_text(PAGE.replace("__THEME__", ""))

    srv = make_server(args.port, scratch)
    base = f"http://127.0.0.1:{args.port}"
    ck = Check()
    measured = {}

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed, args=[
            "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])

        def new_page(w, h, dsf=1, theme="dark", reduced=None, init=None):
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=dsf,
                                      reduced_motion=reduced or "no-preference",
                                      is_mobile=w < 768, has_touch=w < 768)
            if init:
                ctx.add_init_script(init)
            page = ctx.new_page()
            log = {"errors": [], "requests": [], "metered": [], "cdn": []}

            def on_console(m):
                if m.type == "error":
                    log["errors"].append(m.text)

            page.on("console", on_console)
            page.on("pageerror", lambda e: log["errors"].append("pageerror: " + str(e)))

            # Every request passes this handler (XHR and image loads included, which page "request" events can miss).
            # Metered hosts are aborted; Google's logo image, which Cesium hosts on its asset server, is let through.
            def handle(route):
                url = route.request.url
                log["requests"].append(url)
                if any(c in url for c in CDN):
                    log["cdn"].append(url)
                if any(m in url for m in METERED) and not url.endswith("/google-credit.png"):
                    log["metered"].append(url)
                    return route.abort()
                return route.continue_()

            page.route("**/*", handle)
            page.goto(f"{base}/t/{theme}.html")
            page.wait_for_function("window.GX_LOADED === true", timeout=20000)
            return ctx, page, log

        def open_globe(page, maps="{}", timeout=90000):
            page.evaluate(f"""async () => {{ window.G = window.GX.createGlobe(document.getElementById('g'), {{ maps: {maps} }});
                const r = await window.G.ready; window.GR = r; return r; }}""")
            page.evaluate(CARD_LOG_JS)
            r = page.evaluate("window.GR")
            return r

        def wait_tiles(page, timeout=60):
            t0 = time.time()
            while time.time() - t0 < timeout:
                st = page.evaluate("window.G.state()")
                if st.get("tilesLoaded"):
                    return True
                time.sleep(0.5)
            return False

        # ── 1. import alone loads nothing heavy ──
        ctx, page, log = new_page(1440, 900)
        time.sleep(1.0)
        ck.ok("import: no CesiumJS or tile request before the globe is opened",
              not log["cdn"] and not log["metered"] and not any("gibs" in u or "nationalmap" in u for u in log["requests"]))
        ctx.close()

        # ── 2. key-free globe renders: viewports x themes ──
        combos = [(1440, 900, 1, "light"), (1440, 900, 1, "dark"), (390, 844, 3, "light"), (390, 844, 3, "dark")]
        if args.quick:
            combos = combos[:1] + combos[3:]
        for (w, h, dsf, theme) in combos:
            ctx, page, log = new_page(w, h, dsf, theme)
            # this one reads assets/runtime.json (no "maps" field: key-free)
            page.evaluate("""async () => { window.G = window.GX.createGlobe(document.getElementById('g')); window.GR = await window.G.ready; }""")
            r = page.evaluate("window.GR")
            loaded = wait_tiles(page)
            time.sleep(1.0)
            st = page.evaluate("window.G.state()")
            name = f"{w}x{h} {theme}"
            ck.ok(f"render {name}: globe ready without a key", r.get("ok") and not r.get("keyed"), json.dumps(r))
            ck.ok(f"render {name}: imagery tiles loaded", loaded)
            ck.ok(f"render {name}: no console error", not log["errors"], "; ".join(log["errors"][:3]))
            ck.ok(f"render {name}: no metered request", not log["metered"], ", ".join(log["metered"][:3]))
            credits = page.evaluate("() => (document.querySelector('.cesium-widget-credits')||{}).innerText || ''")
            ck.ok(f"render {name}: key-free sources credited on screen", "NASA GIBS" in credits and "USGS" in credits, credits.replace("\n", " | ")[:160])
            if dsf > 1:
                ck.ok(f"render {name}: pixel ratio capped on phones", st["canvasScale"] <= 1.51, f"canvas scale {st['canvasScale']:.2f} at DPR {dsf}")
            page.screenshot(path=str(shots / f"orbit_{w}x{h}_{theme}.png"))
            if w == 1440 and not measured:
                measured = measure(page)
                print("MEASURE", json.dumps(measured), flush=True)
            ctx.close()

        # ── 3. three-stop command runs to the end; cards; screenshots of descent and a stop ──
        ctx, page, log = new_page(1440, 900, 1, "dark")
        open_globe(page)
        wait_tiles(page, 30)
        page.evaluate(f"void (window.RUN = window.G.run({json.dumps(THREE)}).then(r => window.RUN_RESULT = r))")
        descent_shot, stop_shot = False, False
        t0 = time.time()
        while time.time() - t0 < 240:
            st, ncards, finished, card_up = page.evaluate(
                "[window.G.state(), window.CARDS.length, !!window.RUN_RESULT, !document.querySelector('.gx-card').hidden]")
            if ncards and not stop_shot:
                page.screenshot(path=str(shots / "stop_1440x900.png"))
                stop_shot = True
            if not descent_shot and not card_up and st.get("running") and st.get("flights", 0) >= 1 and 2e4 < st.get("height", 0) < 3e6:
                page.screenshot(path=str(shots / "descent_1440x900.png"))
                descent_shot = True
            if finished:
                break
            time.sleep(0.1)
        cards = page.evaluate("window.CARDS")
        res = page.evaluate("window.RUN_RESULT || null")
        ck.ok("three stops: command runs to the end", res and res.get("done") is True, json.dumps(res))
        ck.ok("three stops: a card for each stop", len(cards) == 3, json.dumps([c["label"] for c in cards]))
        want = [s["figures"] for s in THREE["steps"]]
        ck.ok("three stops: each card shows its figures", [c["figs"] for c in cards] == want, json.dumps([c["figs"] for c in cards]))
        ck.ok("three stops: the link is kept only when it stays inside the product",
              [c["href"] for c in cards] == ["#/ma/pipeline", "#/ma/pipeline", None])
        ck.ok("three stops: screenshots of descent and stop saved", descent_shot and stop_shot, f"descent {descent_shot}, stop {stop_shot}")
        ck.ok("three stops: no console error", not log["errors"], "; ".join(log["errors"][:3]))
        # attribution never covered by our controls or the card
        cr = page.evaluate(RECT_JS, ".cesium-widget-credits")
        bar = page.evaluate(RECT_JS, ".gx-bar")
        crd = page.evaluate(RECT_JS, ".gx-card")
        ck.ok("attribution line not covered at 1440x900", cr and not rects_overlap(cr, bar) and not rects_overlap(cr, crd),
              json.dumps({"credits": cr, "bar": bar, "card": crd}))

        # ── 4. address step never passes its floor (camera height read every frame by the renderer) ──
        page.evaluate(f"void (window.RUN_RESULT = null, window.G.run({json.dumps(ADDRESS)}).then(r => window.RUN_RESULT = r))")
        lows = []
        t0 = time.time()
        while time.time() - t0 < 90:
            st = page.evaluate("window.G.state()")
            if st.get("floor"):
                lows.append(st["heightAboveGround"])
            if page.evaluate("window.RUN_RESULT"):
                break
            time.sleep(0.1)
        st = page.evaluate("window.G.state()")
        floor = page.evaluate("window.GX.FLOOR_M.address")
        ex = page.evaluate("() => document.querySelector('.gx-example')?.textContent || null")
        page.screenshot(path=str(shots / "address_1440x900.png"))
        lowest = min(lows) if lows else None
        ck.ok("address: camera never below the floor during the run",
              lowest is not None and lowest >= floor - 1 and (st["minHeightAboveDuringFloor"] or 0) >= floor - 1,
              f"floor {floor} m, lowest polled {lowest and round(lowest)} m, lowest any frame {round(st['minHeightAboveDuringFloor'] or 0)} m, asked zoom 19")
        ck.ok("address: card says 'Example address'", ex == "Example address", str(ex))
        # manual zoom-in after the run cannot pass the floor either
        page.mouse.move(720, 450)
        for _ in range(40):
            page.mouse.wheel(0, -800)
            page.wait_for_timeout(30)
        page.wait_for_timeout(1500)
        st = page.evaluate("window.G.state()")
        ck.ok("address: manual zoom cannot pass the floor", st["heightAboveGround"] >= floor - 1, f"{round(st['heightAboveGround'])} m")

        # ── 5. hidden tab pauses rendering ──
        page.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
            document.dispatchEvent(new Event('visibilitychange')); }""")
        p1 = page.evaluate("window.G.state().paused")
        page.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
            document.dispatchEvent(new Event('visibilitychange')); }""")
        p2 = page.evaluate("window.G.state().paused")
        ck.ok("hidden tab pauses the render loop and resumes", p1 is True and p2 is False)

        # ── 6. modes ──
        for m in ["night", "thermal", "blueprint", "natural"]:
            page.click(f".gx-chip[data-mode='{m}']")
            page.wait_for_timeout(600)
            if m != "natural":
                page.screenshot(path=str(shots / f"mode_{m}.png"))
        ck.ok("modes: Night, Thermal look, Blueprint, Natural switch without error",
              page.evaluate("window.G.state().mode") == "natural" and not log["errors"], "; ".join(log["errors"][:2]))
        labels = page.evaluate("() => [...document.querySelectorAll('.gx-chip')].map(b => b.textContent)")
        ck.ok("modes: labelled plainly", labels == ["Natural", "Night", "Thermal look", "Blueprint"], json.dumps(labels))

        # ── 7. destroy frees the WebGL context ──
        res = page.evaluate("""() => { const c = document.querySelector('.gx-stage canvas');
            const gl = c.getContext('webgl2') || c.getContext('webgl');
            const before = gl && !gl.isContextLost();
            window.G.destroy();
            return { before, lost: gl ? gl.isContextLost() : null, left: document.querySelectorAll('.gx-globe, .cesium-widget').length }; }""")
        ck.ok("destroy: WebGL context lost and DOM removed", res["before"] and res["lost"] is True and res["left"] == 0, json.dumps(res))
        ctx.close()

        # ── 8. reduced motion cuts ──
        ctx, page, log = new_page(1440, 900, 1, "light", reduced="reduce")
        open_globe(page)
        two = {"title": "Two", "steps": [dict(THREE["steps"][0], hold_ms=1500), dict(THREE["steps"][1], hold_ms=1500)]}
        page.evaluate(f"void (window.RUN_T0 = performance.now(), window.G.run({json.dumps(two)}).then(r => window.RUN_RESULT = r))")
        page.wait_for_function("window.RUN_RESULT", timeout=60000)
        first_card = (page.evaluate("window.CARDS[0] ? window.CARDS[0].t - window.RUN_T0 : 1e9")) / 1000
        st = page.evaluate("window.G.state()")
        ck.ok("reduced motion: cuts, no flight", st["cuts"] == 2 and st["flights"] == 0, json.dumps({k: st[k] for k in ("cuts", "flights")}))
        ck.ok("reduced motion: first card shows at once", first_card < 3.0, f"{first_card:.2f} s")
        ctx.close()

        # ── 9. no WebGL: plain fallback line ──
        no_gl = """(() => { const g = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/i.test(t) ? null : g.call(this, t, o); }; })();"""
        ctx, page, log = new_page(390, 844, 2, "dark", init=no_gl)
        r = open_globe(page)
        page.evaluate(f"void (window.G.run({json.dumps(THREE)}))")
        page.wait_for_selector(".gx-list li", timeout=5000)
        line = page.evaluate("() => document.querySelector('.gx-fallback-line')?.textContent")
        items = page.evaluate("() => document.querySelectorAll('.gx-list li').length")
        try:
            page.screenshot(path=str(shots / "fallback_390x844.png"))
        except Exception as e:  # some headless builds cannot capture a page whose WebGL is switched off
            print("note: fallback screenshot not captured:", str(e).splitlines()[0], flush=True)
        ck.ok("no WebGL: fallback line and the stops as text, nothing thrown",
              r.get("ok") is False and r.get("reason") == "webgl" and line == "This browser cannot draw the 3D globe." and items == 3 and not log["errors"],
              json.dumps({"ready": r, "line": line, "items": items, "errors": log["errors"][:2]}))
        ck.ok("no WebGL: CesiumJS never downloaded", not log["cdn"])
        ctx.close()

        # ── 10. keyed path: the documented Google request, network blocked ──
        ctx, page, log = new_page(1440, 900, 1, "dark")
        seen_google = []

        def google(route):
            rq = route.request
            seen_google.append({"url": rq.url, "method": rq.method, "headers": rq.headers})
            route.abort()

        page.route("**://tile.googleapis.com/**", google)
        ck.ok("keyed: nothing sent to Google before the globe opens", not seen_google)
        r = open_globe(page, json.dumps({"google3dTilesKey": FAKE_KEY}))
        t = page.evaluate("window.G.tiles")
        g0 = seen_google[0] if seen_google else {}
        u = urlparse(g0.get("url", ""))
        q = parse_qs(u.query)
        hdr = {k.lower(): v for k, v in (g0.get("headers") or {}).items()}
        ck.ok("keyed: one root request, GET https://tile.googleapis.com/v1/3dtiles/root.json?key=…",
              len(seen_google) == 1 and g0["method"] == "GET" and f"{u.scheme}://{u.netloc}{u.path}" == "https://tile.googleapis.com/v1/3dtiles/root.json"
              and q.get("key") == [FAKE_KEY], json.dumps({"n": len(seen_google), "url": g0.get("url", "").replace(FAKE_KEY, "<key>")}))
        ck.ok("keyed: key only in the query string (no auth header, no key header)",
              "authorization" not in hdr and "x-goog-api-key" not in hdr, json.dumps(sorted(hdr)))
        ck.ok("keyed: a blocked root request falls back to the key-free globe without error",
              r.get("ok") and t.get("route") == "none" and page.evaluate("window.G.state().globeShown") is True)
        page.evaluate("void (window.G.run({steps:[{lat:40.7,lon:-74,label:'x',zoom:13,hold_ms:1500}]}))")
        page.wait_for_timeout(4000)
        ck.ok("keyed: one tileset per session (no second root request after a flight)", len(seen_google) == 1, str(len(seen_google)))
        ctx.close()

        # keyed, answered locally with an empty tileset (not Google content): logo and attribution stay visible
        ctx, page, log = new_page(390, 844, 2, "light")
        hits = []

        def fake_root(route):
            hits.append(route.request.url)
            if "/v1/3dtiles/root.json" in route.request.url:
                route.fulfill(status=200, content_type="application/json", body=json.dumps(EMPTY_TILESET),
                              headers={"Access-Control-Allow-Origin": "*"})
            else:
                route.abort()

        page.route("**://tile.googleapis.com/**", fake_root)
        open_globe(page, json.dumps({"google3dTilesKey": FAKE_KEY}))
        t = page.evaluate("window.G.tiles")
        page.evaluate(f"void (window.G.run({json.dumps({'title': 'T', 'steps': [THREE['steps'][1]]})}))")
        page.wait_for_selector(".gx-card:not([hidden])", timeout=60000)
        page.wait_for_timeout(800)
        st = page.evaluate("window.G.state()")
        logo = page.evaluate("""() => [...document.querySelectorAll('.cesium-widget-credits img, .cesium-credit-logoContainer img')]
            .map(i => (i.getAttribute('src') || '').slice(0, 60) + ' ' + (i.alt || i.title || ''))""")
        has_google = any("google" in s.lower() for s in logo) or page.evaluate(
            "() => /google/i.test(document.querySelector('.cesium-widget-credits')?.innerHTML || '')")
        cr = page.evaluate(RECT_JS, ".cesium-widget-credits")
        bar = page.evaluate(RECT_JS, ".gx-bar")
        crd = page.evaluate(RECT_JS, ".gx-card")
        page.screenshot(path=str(shots / "keyed_fixture_390x844.png"))
        ck.ok("keyed: tileset added and Cesium's globe hidden under it (Google FAQ: no Cesium terrain with the tiles)",
              t.get("route") == "google" and st["globeShown"] is False, json.dumps({"tiles": t, "globe": st["globeShown"]}))
        ck.ok("keyed: Google logo in the on-screen credits", has_google, json.dumps(logo)[:200])
        ck.ok("keyed: credits not covered by the card or controls at 390x844",
              cr and not rects_overlap(cr, bar) and not rects_overlap(cr, crd), json.dumps({"credits": cr, "bar": bar, "card": crd}))
        ctx.close()

        # Cesium ion route, blocked
        ctx, page, log = new_page(1440, 900, 1, "dark")
        seen_ion = []

        def ion(route):
            rq = route.request
            seen_ion.append({"url": rq.url, "headers": rq.headers})
            route.abort()

        page.route("**://api.cesium.com/**", ion)
        r = open_globe(page, json.dumps({"cesiumIonToken": FAKE_ION}))
        t = page.evaluate("window.G.tiles")
        i0 = seen_ion[0] if seen_ion else {}
        u = urlparse(i0.get("url", ""))
        hdr = {k.lower(): v for k, v in (i0.get("headers") or {}).items()}
        tok_ok = parse_qs(u.query).get("access_token") == [FAKE_ION] or hdr.get("authorization") == f"Bearer {FAKE_ION}"
        ck.ok("ion: endpoint request for asset 2275207 with the configured token",
              u.path == "/v1/assets/2275207/endpoint" and tok_ok and t.get("route") == "none",
              (i0.get("url", "") or "").replace(FAKE_ION, "<token>"))
        ctx.close()

        browser.close()
    srv.shutdown()

    fails = [r for r in ck.results if not r[1]]
    print(f"\n{len(ck.results) - len(fails)} passed, {len(fails)} failed. Screenshots: {shots}")
    if measured:
        print("Load size:", json.dumps(measured))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
