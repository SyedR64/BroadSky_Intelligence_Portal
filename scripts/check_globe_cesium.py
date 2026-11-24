"""Proof for the photorealistic globe renderer (assets/godseye-cesium.js).

Serves the repo's assets/ and a small test page (written to a scratch folder) from one local server, then drives
it with Playwright (headless Chromium, SwiftShader WebGL). The test page imports only the renderer's own files.

Run:
  uv run --no-project --python 3.12 --with playwright==1.60.0 python scripts/check_globe_cesium.py \
      [--port 8983] [--scratch DIR] [--quick] [--screen http://127.0.0.1:<port> [--screen-only]]

--screen also drives the Globe screen of a served copy of the site (python3 OS/serve.py <copy> <port>): the map
command's 'site' kind and its precision ceilings, MapCmd.site(card), both renderers behind the same command (the
keyed path with runtime.json answered by the test and Google's root request blocked and asserted), a command posted
from a frame, reduced motion, the field level and teardown, at 1440x900 and 390x844.

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


MV = "?v=20261123172325"

# A public building (the county courthouse block in Lancaster, PA); the rings are a check fixture, not looked up.
CARD = {
    "kind": "floor_sketch", "address": "50 N Duke St, Lancaster, PA 17602",
    "house": {"year": 1854, "year_basis": "public", "stories": 3},
    "place": {"label": "50 N Duke St, Lancaster, PA 17602", "lat": 40.0396, "lon": -76.3047, "precision": "parcel", "basis": "public"},
    "building": {"frame": {"origin": {"lon": -76.3047, "lat": 40.0396}, "units": "m"},
                 "footprint": {"ring_m": [[-20, -15], [20, -15], [20, 15], [-20, 15]], "as_of": "2010-08-17", "basis": "public"},
                 "height": {"eave_m": 14, "ridge_m": 18, "basis": "likely"},
                 "parcel": {"ring_m": [[-30, -25], [30, -25], [30, 25], [-30, 25]]},
                 "front": {"bearing_deg": 270}},
}


CARD_LOG = """window.CARDS = []; window.CARDT = []; new MutationObserver(() => { const c = document.querySelector('.gx-card');
  if (!c || c.hidden || c.classList.contains('out')) return; const t = c.innerText; if (!t) return;
  if (window.CARDS[window.CARDS.length - 1] !== t) { window.CARDS.push(t); window.CARDT.push(performance.now()); } })
  .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });"""


def run_screen(browser, base, ck, shots):
    def new_page(w, h, role="bsp-managing-partner", reduced=None, keyed=False, dsf=1):
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=dsf, reduced_motion=reduced or "no-preference",
                                  is_mobile=w < 768, has_touch=w < 768)
        ctx.add_init_script(CARD_LOG)
        page = ctx.new_page()
        log = {"errors": [], "metered": [], "cdn": [], "runtime": 0}
        page.on("console", lambda m: log["errors"].append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: log["errors"].append("pageerror: " + str(e)))

        def handle(route):
            url = route.request.url
            if any(c in url for c in CDN):
                log["cdn"].append(url)
            if "/assets/runtime.json" in url:
                log["runtime"] += 1
                if keyed:
                    return route.fulfill(status=200, content_type="application/json",
                                         body=json.dumps({"chatEndpoint": "", "maps": {"google3dTilesKey": FAKE_KEY}}))
            if any(m in url for m in METERED) and not url.endswith("/google-credit.png"):
                log["metered"].append(url)
                return route.abort()
            return route.continue_()
        page.route("**/*", handle)
        page.goto(f"{base}/app.html?role={role}#/home/overview")
        page.wait_for_function("!!window.MapCmd", timeout=30000)
        return ctx, page, log

    def open_globe(page, timeout=90000):
        page.evaluate("location.hash = '#/globe/view'")
        page.wait_for_function("window.BSPGlobe && window.BSPGlobe.mode && window.BSPGlobe.mode !== 'none'", timeout=timeout)
        return page.evaluate("({ renderer: window.BSPGlobe.renderer, mode: window.BSPGlobe.mode })")

    def wait_card(page, text, timeout=90, after=0):
        """The first place card (from the n-th one logged on) whose text holds `text`, and the globe's state then."""
        t0 = time.time()
        while time.time() - t0 < timeout:
            cards = page.evaluate("window.CARDS")
            hit = next((c for c in cards[after:] if text in c), None)
            if hit:
                return page.evaluate("window.BSPGlobe && window.BSPGlobe.state()"), hit
            time.sleep(0.25)
        return page.evaluate("window.BSPGlobe && window.BSPGlobe.state()"), None

    def ncards(page):
        return page.evaluate("window.CARDS.length")

    # ── 1. contract: ceilings, outline rules, MapCmd.site ──
    ctx, page, log = new_page(1440, 900)
    r = page.evaluate(f"""async () => {{ const M = window.MapCmd; const v = s => M.validate({{ steps: [s] }});
      const at = {{ lat: 40.0396, lon: -76.3047 }};
      const ring = [[-76.3049, 40.0395], [-76.3045, 40.0395], [-76.3045, 40.0397], [-76.3049, 40.0397]];
      const far = [[-76.4, 40.0395], [-76.3045, 40.0395], [-76.3045, 40.0397]];
      const z = (p, zoom) => v({{ kind: 'site', ...at, label: '50 N Duke St, Lancaster', precision: p, zoom }}).cmd.steps[0];
      const big = Array.from({{ length: 49 }}, (_, k) => [-76.3047 + 0.0002 * Math.cos(k / 49 * 6.28), 40.0396 + 0.0002 * Math.sin(k / 49 * 6.28)]);
      return {{
        parcel: z('parcel', 25).zoom, typed: z('typed', 25).zoom, town: z('town', 25).zoom, unknown: z(undefined, 25).zoom, junk: z('rooftop', 25).zoom,
        ceil: [z('parcel').ceiling, z('typed').ceiling, z('town').ceiling],
        defaults: [z('parcel').zoom, z('typed').zoom, z('town').zoom],
        address: v({{ kind: 'address', ...at, label: '50 N Duke St', zoom: 25 }}).cmd.steps[0],
        siteLabel: z('parcel').label,
        outlineParcel: v({{ kind: 'site', ...at, precision: 'parcel', outline: ring, height_m: 18, parcel: ring }}).cmd.steps[0],
        outlineTyped: v({{ kind: 'site', ...at, precision: 'typed', outline: ring, height_m: 18 }}).cmd.steps[0],
        outlineFar: v({{ kind: 'site', ...at, precision: 'parcel', outline: far }}).cmd.steps[0],
        outlineBig: v({{ kind: 'site', ...at, precision: 'parcel', outline: big }}).cmd.steps[0],
        badHeight: v({{ kind: 'site', ...at, precision: 'parcel', outline: ring, height_m: 9999, height_basis: 'public' }}).cmd.steps[0],
        nanOutline: v({{ kind: 'site', ...at, precision: 'parcel', outline: [[NaN, 1], [2, 3], [4, 5]] }}).cmd.steps[0],
        front: v({{ kind: 'site', ...at, precision: 'parcel', front_deg: 270 }}).cmd.steps[0].bearing,
        site: M.site({json.dumps(CARD)}),
        siteResp: M.site({{ status: 'found', place: {json.dumps(CARD['place'])}, cards: [{json.dumps(CARD)}] }}),
        siteTown: M.site({{ place: {{ label: 'Lititz, PA', lat: 40.157, lon: -76.307, precision: 'town' }} }}),
        siteNone: M.site({{ place: {{}} }}),
      }}; }}""")
    ck.ok("contract: zoom ceilings by precision (parcel 19, typed 16.5, town 12.5; unknown counts as town)",
          [r["parcel"], r["typed"], r["town"], r["unknown"], r["junk"]] == [19, 16.5, 12.5, 12.5, 12.5] and r["ceil"] == [19, 16.5, 12.5],
          json.dumps([r["parcel"], r["typed"], r["town"], r["unknown"], r["junk"], r["ceil"]]))
    ck.ok("contract: default landing zooms 18.5 / 16.5 / 12", r["defaults"] == [18.5, 16.5, 12], json.dumps(r["defaults"]))
    ck.ok("contract: 'address' stays the example kind (label Example address, zoom 17)",
          r["address"]["label"] == "Example address" and r["address"]["zoom"] == 17 and r["address"]["ceiling"] == 17)
    ck.ok("contract: a site step keeps the typed address as its label", r["siteLabel"] == "50 N Duke St, Lancaster")
    op = r["outlineParcel"]
    ck.ok("contract: parcel precision keeps outline, parcel edge and height", len(op.get("outline", [])) == 4 and len(op.get("parcel", [])) == 4 and op.get("height_m") == 18 and op.get("height_basis") == "likely", json.dumps(op)[:200])
    ck.ok("contract: typed precision drops the outline", "outline" not in r["outlineTyped"] and "height_m" not in r["outlineTyped"])
    ck.ok("contract: an outline far from its point, over 48 points, or with a bad number is dropped",
          "outline" not in r["outlineFar"] and "outline" not in r["outlineBig"] and "outline" not in r["nanOutline"])
    ck.ok("contract: height clamped to 120 m and an out-of-range height is not 'public'", r["badHeight"]["height_m"] == 120 and r["badHeight"]["height_basis"] == "likely")
    ck.ok("contract: front_deg 270 (front faces west) turns the camera to bearing 90 (looking east at it)", r["front"] == 90, str(r["front"]))
    s = r["site"]
    ok_site = s and len(s["steps"]) == 2 and s["steps"][0]["precision"] == "town" and s["steps"][0]["label"] == "Lancaster, PA" \
        and s["steps"][0]["zoom"] <= 12.5 and s["steps"][1]["precision"] == "parcel" and s["steps"][1]["label"] == "50 N Duke St, Lancaster, PA 17602" \
        and len(s["steps"][1]["outline"]) == 4 and len(s["steps"][1]["parcel"]) == 4 and s["steps"][1]["height_m"] == 18 and s["steps"][1]["bearing"] == 90
    ck.ok("MapCmd.site(card): town step, then the building (typed label, outline, parcel, height, street-facing bearing)", ok_site, json.dumps(s)[:400])
    ck.ok("MapCmd.site(card): outline date and facts on the card",
          s["steps"][1]["sub"] == "Parcel match · outline from imagery dated Aug 2010"
          and s["steps"][1]["figures"] == [["Built", "1854", None], ["Storeys", "3", "est"], ["Height", "18 m", "est"]], json.dumps([s["steps"][1]["sub"], s["steps"][1]["figures"]]))
    ox, oy = s["steps"][1]["outline"][1]
    ck.ok("MapCmd.site(card): local metres become lon/lat (20 m east, 15 m south)", abs((ox + 76.3047) * 111320 * 0.7657 - 20) < 0.2 and abs((oy - 40.0396) * 110574 + 15) < 0.2, f"{ox},{oy}")
    ck.ok("MapCmd.site(response): the endpoint's whole response works the same", r["siteResp"] == s)
    ck.ok("MapCmd.site: town only is one step at 12.5 at most, no outline; no place gives null",
          r["siteTown"] and len(r["siteTown"]["steps"]) == 1 and r["siteTown"]["steps"][0]["zoom"] <= 12.5 and "outline" not in r["siteTown"]["steps"][0] and r["siteNone"] is None)
    words = json.dumps(s).lower()
    ck.ok("MapCmd.site: no 'example', 'sandbox' or 'fictional' anywhere in a live address command", not any(w in words for w in ("example", "sandbox", "fictional")))
    ck.ok("nothing metered or CesiumJS before the globe opens (home screen)", not log["metered"] and not log["cdn"], json.dumps(log["metered"][:2] + log["cdn"][:2]))
    ck.ok("runtime.json not read before the globe opens", log["runtime"] == 0, str(log["runtime"]))
    ctx.close()

    # ── 2. MapLibre renderer (no key): the two-step site command at both viewports ──
    for (w, h, dsf) in [(1440, 900, 1), (390, 844, 3)]:
        name = f"{w}x{h}"
        ctx, page, log = new_page(w, h, dsf=dsf)
        o = open_globe(page)
        ck.ok(f"open {name}: no key -> MapLibre renderer", o["renderer"] == "open" and o["mode"] == "open", json.dumps(o))
        n0 = ncards(page)
        page.evaluate(f"window.MapCmd.run(window.MapCmd.site({json.dumps(CARD)}))")
        st0, card0 = wait_card(page, "Lancaster, PA", 60, n0)
        st, card = wait_card(page, "50 N Duke St", 90, n0)
        page.wait_for_timeout(2500)
        st = page.evaluate("window.BSPGlobe.state()")
        page.screenshot(path=str(shots / f"site_open_{name}.png"))
        cam = st.get("camera") or {}
        ck.ok(f"open {name}: flies to town level first (card 'Lancaster, PA', zoom <= 12.5)", card0 and "1 / 2" in card0 and st0["camera"]["zoom"] <= 12.51, json.dumps([card0, st0.get("camera")]))
        ck.ok(f"open {name}: then down to the building, card labelled with the typed address, no 'Example'",
              card and "50 N Duke St, Lancaster, PA 17602" in card and "Example" not in card and "Parcel match" in card, (card or "").replace("\n", " | ")[:160])
        ck.ok(f"open {name}: camera down at the building (zoom 18 to 19), facing the street side", 18 <= cam.get("zoom", 99) <= 19.0 and abs(((cam.get("bearing", 0) - 90 + 540) % 360) - 180) < 40, json.dumps(cam))
        pins = page.evaluate("[...document.querySelectorAll('.gx-pin.stop .gx-lbl')].map(e => e.textContent)")
        ck.ok(f"open {name}: one pin, the typed address (the town step that stages it has none)", pins == ["50 N Duke St, Lancaster, PA 17602"], json.dumps(pins))
        ck.ok(f"open {name}: outline extruded, edge and parcel drawn; map buildings dimmed", st.get("siteFeatures") == 3 and st.get("dimmed") is True, json.dumps({k: st.get(k) for k in ("siteFeatures", "dimmed")}))
        ck.ok(f"open {name}: map zoom limited to 19 while the site shows", st.get("maxZoom") == 19, str(st.get("maxZoom")))
        page.mouse.move(w / 2, h / 2)
        for _ in range(20):
            page.mouse.wheel(0, -900)
            page.wait_for_timeout(40)
        page.wait_for_timeout(1200)
        z = page.evaluate("window.BSPGlobe.state().camera.zoom")
        ck.ok(f"open {name}: manual zoom cannot pass 19", z <= 19.0, str(z))
        # typed precision: no outline, ceiling 16.5
        n0 = ncards(page)
        page.evaluate("""window.MapCmd.run({ title: 'T', steps: [{ kind: 'site', lat: 40.0396, lon: -76.3047, label: 'Typed 50 N Duke St', precision: 'typed', zoom: 19, hold_ms: 1500, outline: [[-76.3049,40.0395],[-76.3045,40.0395],[-76.3045,40.0397]] }] })""")
        st, card = wait_card(page, "Typed 50 N Duke St", 60, n0)
        page.wait_for_timeout(800)
        st = page.evaluate("window.BSPGlobe.state()")
        ck.ok(f"open {name}: typed precision stops at 16.5 and draws no outline; buildings not dimmed",
              st["camera"]["zoom"] <= 16.51 and st.get("maxZoom") == 16.5 and st.get("siteFeatures") == 0 and st.get("dimmed") is False, json.dumps({k: st.get(k) for k in ("camera", "maxZoom", "siteFeatures", "dimmed")}))
        ck.ok(f"open {name}: no console error, nothing metered", not log["errors"] and not log["metered"] and not log["cdn"], "; ".join(log["errors"][:3]))
        # teardown
        res = page.evaluate("""async () => { location.hash = '#/home/overview'; await new Promise(r => setTimeout(r, 1500));
          return { open: !!window.__bspGlobeOpen, g: !!window.BSPGlobe, stage: document.querySelectorAll('.gx-stage, .gx-globe, .maplibregl-map').length, markers: document.querySelectorAll('.gx-pin').length }; }""")
        ck.ok(f"teardown {name}: leaving the screen removes the map and stops listening", res == {"open": False, "g": False, "stage": 0, "markers": 0}, json.dumps(res))
        ctx.close()

    # ── 3. a command posted from an embedded page (same origin only); MapCmd.run inside a frame forwards ──
    ctx, page, log = new_page(1440, 900)
    open_globe(page)
    page.evaluate("""() => { const f = document.createElement('iframe'); f.id = 'fr'; f.src = '/assets/runtime.json'; f.style.cssText = 'position:fixed;width:10px;height:10px;bottom:0;right:0;opacity:0';
      document.body.appendChild(f); const x = document.createElement('iframe'); x.id = 'xo'; x.src = location.href.replace('127.0.0.1', 'localhost').replace(/app\\.html.*/, 'assets/runtime.json'); x.style.cssText = f.style.cssText; document.body.appendChild(x); }""")
    page.wait_for_timeout(1500)
    fr = next(f for f in page.frames if f.url.startswith("http://127.0.0.1") and f.url.endswith("/assets/runtime.json"))
    xo = next(f for f in page.frames if f.url.startswith("http://localhost"))
    cmd_x = {"title": "X", "steps": [{"kind": "place", "lat": 10, "lon": 10, "label": "Other origin", "hold_ms": 1500}]}
    xo.evaluate(f"parent.postMessage({{ type: 'bsp:map', cmd: {json.dumps(cmd_x)} }}, '*')")
    page.wait_for_timeout(1200)
    t = page.evaluate("document.querySelector('.gx-title')?.textContent || ''")
    ck.ok("message: a command from another origin is ignored", "Other origin" not in t and t != "X", t)
    site_cmd = page.evaluate(f"window.MapCmd.site({json.dumps(CARD)})")
    n0 = ncards(page)
    fr.evaluate(f"parent.postMessage({{ type: 'bsp:map', cmd: {json.dumps(site_cmd)} }}, location.origin)")
    st, card = wait_card(page, "Lancaster, PA", 60, n0)
    t = page.evaluate("document.querySelector('.gx-title')?.textContent || ''")
    ck.ok("message: { type: 'bsp:map', cmd } from a same-origin frame runs on the globe", t == "50 N Duke St, Lancaster, PA 17602" and card and "Lancaster, PA" in card, json.dumps([t, card]))
    fr.evaluate(f"""async () => {{ const M = (await import(location.origin + '/assets/mapcmd.js{MV}')).MapCmd;
        M.run({{ title: 'From frame', steps: [{{ kind: 'site', lat: 40.0396, lon: -76.3047, label: '50 N Duke St, Lancaster, PA', precision: 'typed', hold_ms: 1500 }}] }}); }}""")
    page.wait_for_timeout(1500)
    t = page.evaluate("document.querySelector('.gx-title')?.textContent || ''")
    fh = fr.evaluate("location.href")
    ck.ok("message: MapCmd.run inside an embedded page hands the command to the shell (the frame does not navigate)",
          t == "From frame" and fh.endswith("/assets/runtime.json"), json.dumps([t, fh]))
    ck.ok("message: no console error", not log["errors"], "; ".join(log["errors"][:3]))
    # globe closed: a posted command opens the globe and runs there
    page.evaluate("location.hash = '#/home/overview'")
    page.wait_for_timeout(1200)
    page.evaluate("document.getElementById('fr') || null")
    fr2 = [f for f in page.frames if f.url.startswith("http://127.0.0.1") and f.url.endswith("/assets/runtime.json")]
    if fr2:
        fr2[0].evaluate(f"parent.postMessage({{ type: 'bsp:map', cmd: {json.dumps(site_cmd)} }}, location.origin)")
        page.wait_for_function("location.hash.startsWith('#/globe/view') && window.BSPGlobe", timeout=30000)
        page.wait_for_timeout(1500)
        t = page.evaluate("document.querySelector('.gx-title')?.textContent || ''")
        ck.ok("message: with the globe closed, a posted command opens it and runs", t == "50 N Duke St, Lancaster, PA 17602", t)
    else:
        ck.ok("message: with the globe closed, a posted command opens it and runs", False, "frame gone with the screen")
    ctx.close()

    # ── 4. reduced motion: cut straight to the building ──
    ctx, page, log = new_page(1440, 900, reduced="reduce")
    open_globe(page)
    page.evaluate(f"window.__T0 = performance.now(); window.MapCmd.run(window.MapCmd.site({json.dumps(CARD)}))")
    st, card = wait_card(page, "50 N Duke St", 30)
    dt = page.evaluate("(window.CARDT[window.CARDS.findIndex(c => c.includes('50 N Duke St'))] - window.__T0) / 1000")
    town = page.evaluate("window.CARDS.some(c => c.includes('1 / 2'))")
    st = page.evaluate("window.BSPGlobe.state()")
    ck.ok("reduced motion: the town step is skipped and the camera cuts to the building", card and not town and dt < 3 and 18 <= st["camera"]["zoom"] <= 19 and not st["orbiting"],
          json.dumps({"card_after_s": round(dt, 2), "town_card": town, "camera": st["camera"], "orbiting": st["orbiting"]}))
    ctx.close()

    # ── 5. field role: a site command is shown (no tours) ──
    ctx, page, log = new_page(390, 844, role="pp-plumber", dsf=2)
    page.evaluate(f"window.MapCmd.run(window.MapCmd.site({json.dumps(CARD)}))")
    page.wait_for_function("window.BSPGlobe && window.BSPGlobe.mode !== 'none'", timeout=60000)
    st, card = wait_card(page, "Lancaster, PA", 60)
    n = page.evaluate("document.querySelectorAll('.gx-stops li').length")
    tours = page.evaluate("document.querySelectorAll('.gx-tours [data-tour]').length")
    ck.ok("field level: the typed-address command runs (2 stops, no tours)", n == 2 and tours == 0 and card, json.dumps([n, tours, card]))
    ctx.close()

    # ── 6. keyed: the CesiumJS renderer behind the same command, Google's root request blocked and asserted ──
    for (w, h, dsf) in [(1440, 900, 1), (390, 844, 3)]:
        name = f"{w}x{h}"
        ctx, page, log = new_page(w, h, keyed=True, dsf=dsf)
        seen = []

        def google(route):
            rq = route.request
            seen.append({"url": rq.url, "method": rq.method})
            route.abort()
        page.route("**://tile.googleapis.com/**", google)
        page.wait_for_timeout(800)
        ck.ok(f"keyed {name}: nothing sent to Google or the CesiumJS CDN before the globe opens", not seen and not log["cdn"], json.dumps(seen[:1]))
        o = open_globe(page)
        page.wait_for_function("window.BSPGlobe.api && window.BSPGlobe.api.tiles", timeout=60000)
        tiles = page.evaluate("window.BSPGlobe.api.tiles")
        page.wait_for_timeout(500)
        ck.ok(f"keyed {name}: key in runtime.json -> CesiumJS renderer", o["renderer"] == "cesium" and o["mode"] == "cesium" and log["cdn"], json.dumps(o))
        u = seen[0]["url"] if seen else ""
        ck.ok(f"keyed {name}: one blocked GET to tile.googleapis.com/v1/3dtiles/root.json with the configured key, then the key-free globe",
              len(seen) == 1 and seen[0]["method"] == "GET" and u.split("?")[0] == "https://tile.googleapis.com/v1/3dtiles/root.json" and f"key={FAKE_KEY}" in u and tiles.get("route") == "none",
              json.dumps({"n": len(seen), "url": u.replace(FAKE_KEY, "<key>"), "tiles": tiles}))
        n0 = ncards(page)
        page.evaluate(f"window.MapCmd.run(window.MapCmd.site({json.dumps(CARD)}))")
        st0, card0 = wait_card(page, "1 OF 2", 90, n0)
        st, card = wait_card(page, "2 OF 2", 120, n0)
        drawn = False
        for _ in range(60):   # the outline's geometry is built off the main thread; SwiftShader is slow
            drawn = page.evaluate("window.BSPGlobe.state().sitesDrawn")
            if drawn:
                break
            page.wait_for_timeout(500)
        page.wait_for_timeout(3000)   # a few frames for the built geometry to reach the screen before the picture
        st = page.evaluate("window.BSPGlobe.state()")
        page.screenshot(path=str(shots / f"site_cesium_{name}.png"))
        ck.ok(f"keyed {name}: the outline geometry is built and shown", drawn)
        ex = page.evaluate("document.querySelector('.gx-example')?.textContent || null")
        ck.ok(f"keyed {name}: same command: town first, then the building with its typed label (no 'Example address' chip)",
              card0 and "Lancaster, PA" in card0 and card and "50 N Duke St, Lancaster, PA 17602" in card and ex is None, json.dumps([card0, card, ex])[:300])
        ck.ok(f"keyed {name}: parcel floor 150 m held on every frame; outline, roof edge and parcel edge drawn",
              st["precision"] == "parcel" and st["floor"] == 150 and (st["minHeightAboveDuringFloor"] or 0) >= 149 and st["siteEntities"] == 4,
              json.dumps({k: st.get(k) for k in ("precision", "floor", "minHeightAboveDuringFloor", "siteEntities")}))
        rects = page.evaluate("""() => { const r = s => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; };
          return { panel: r('.gx-panel'), card: r('.gx-globe .gx-card'), bar: r('.gx-bar .gx-modes') }; }""")
        ov = lambda a, b: a and b and not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])
        ck.ok(f"keyed {name}: the place card and look chips do not sit under the panel", not ov(rects["panel"], rects["card"]) and not ov(rects["panel"], rects["bar"]), json.dumps(rects))
        if w == 1440:
            # typed precision: 900 m floor, no outline
            n0 = ncards(page)
            page.evaluate("""window.MapCmd.run({ title: 'T', steps: [{ kind: 'site', lat: 40.0396, lon: -76.3047, label: 'Typed 50 N Duke St', precision: 'typed', zoom: 19, hold_ms: 1500 }] })""")
            st, card = wait_card(page, "Typed 50 N Duke St", 60, n0)
            st = page.evaluate("window.BSPGlobe.state()")
            ck.ok("keyed: typed precision floor 900 m, nothing drawn for the building",
                  st["precision"] == "typed" and st["floor"] == 900 and st["heightAboveGround"] >= 899 and st["siteEntities"] == 0,
                  json.dumps({k: st.get(k) for k in ("precision", "floor", "heightAboveGround", "siteEntities")}))
            # the panel's controls steer the CesiumJS renderer
            n0 = ncards(page)
            page.evaluate(f"(() => {{ const c = window.MapCmd.site({json.dumps(CARD)}); c.steps.forEach(s => s.hold_ms = 20000); window.MapCmd.run(c); }})()")
            wait_card(page, "1 OF 2", 60, n0)
            page.click(".gx-ctl [data-act=pause]")
            page.wait_for_timeout(300)
            p1 = page.evaluate("window.BSPGlobe.state().userPaused")
            page.click(".gx-ctl [data-act=next]")
            st, card = wait_card(page, "2 OF 2", 60, n0)
            ck.ok("keyed: the panel's Pause and Next steer the CesiumJS renderer", p1 is True and card and "50 N Duke St" in card, json.dumps([p1, card])[:200])
        errs = [e for e in log["errors"] if "net::ERR_FAILED" not in e]   # the blocked root request logs one
        ck.ok(f"keyed {name}: no console error, no other metered request", not errs and all("tile.googleapis.com/v1/3dtiles/root.json" in m for m in log["metered"]), "; ".join(errs[:3] + log["metered"][:2]))
        res = page.evaluate("""async () => { const c = document.querySelector('.gx-globe canvas'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
          location.hash = '#/home/overview'; await new Promise(r => setTimeout(r, 1500));
          return { open: !!window.__bspGlobeOpen, g: !!window.BSPGlobe, left: document.querySelectorAll('.gx-globe, .cesium-widget').length, lost: gl ? gl.isContextLost() : null }; }""")
        ck.ok(f"keyed teardown {name}: leaving the screen destroys the viewer and frees its WebGL context", res == {"open": False, "g": False, "left": 0, "lost": True}, json.dumps(res))
        ctx.close()


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
    ap.add_argument("--screen", default="", help="base URL of a served copy of the site: also check the Globe screen")
    ap.add_argument("--screen-only", action="store_true", help="with --screen: skip the renderer checks")
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

        if args.screen:
            run_screen(browser, args.screen.rstrip("/"), ck, shots)
        if args.screen_only:
            browser.close()
            srv.shutdown()
            fails = [r for r in ck.results if not r[1]]
            print(f"\n{len(ck.results) - len(fails)} passed, {len(fails)} failed. Screenshots: {shots}")
            sys.exit(1 if fails else 0)

        # ── 1. import alone loads nothing heavy ──
        ctx, page, log = new_page(1440, 900)
        time.sleep(1.0)
        ck.ok("import: no CesiumJS or tile request before the globe is opened",
              not log["cdn"] and not log["metered"] and not any("gibs" in u or "nationalmap" in u for u in log["requests"]))
        fl = page.evaluate("""() => { const f = s => window.GX.cleanStep(s); const at = { lat: 40.0396, lon: -76.3047 };
            const ring = [[-76.3049, 40.0395], [-76.3045, 40.0395], [-76.3045, 40.0397], [-76.3049, 40.0397]];
            return { parcel: f({ ...at, kind: 'site', precision: 'parcel', zoom: 25 }), typed: f({ ...at, kind: 'site', precision: 'typed', zoom: 25, outline: ring }),
              town: f({ ...at, kind: 'site', zoom: 25 }), address: f({ ...at, kind: 'address', zoom: 25 }),
              areaTyped: f({ ...at, kind: 'area', precision: 'typed' }), outlined: f({ ...at, kind: 'site', precision: 'parcel', outline: ring, parcel: ring, height_m: 18 }) }; }""")
        ck.ok("site: floors follow precision (parcel 150 m, typed 900 m, town 12,000 m); 3,000 m stays for 'address'",
              [fl["parcel"]["floor"], fl["typed"]["floor"], fl["town"]["floor"], fl["address"]["floor"], fl["areaTyped"]["floor"]] == [150, 900, 12000, 3000, 900],
              json.dumps([fl[k]["floor"] for k in ("parcel", "typed", "town", "address", "areaTyped")]))
        ck.ok("site: zoom ceilings 19 / 16.5 / 12.5 in the renderer too", [fl["parcel"]["zoom"], fl["typed"]["zoom"], fl["town"]["zoom"]] == [19, 16.5, 12.5])
        ck.ok("site: outline, parcel edge and height kept only at parcel precision",
              len(fl["outlined"].get("outline", [])) == 4 and len(fl["outlined"].get("parcel", [])) == 4 and fl["outlined"]["height_m"] == 18 and "outline" not in fl["typed"])
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
