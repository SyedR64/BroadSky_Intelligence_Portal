/* ═══════════════════════════════════════════════════════════════════════════
   Broad Sky OS: the god's eye globe (ES module, no build step)
   A full-bleed 3D globe steered by command (assets/mapcmd.js): fly from orbit to a street, orbit a point, tilt,
   and run a sequence of stops with a pause and a place card at each.

   Libraries (pinned; unpkg first, jsdelivr fallback, as assets/theater.js loads them):
     MapLibre GL JS 5.24.0 (globe projection, sky and atmosphere, terrain). Loaded under its own name so the 3D map
       screen's MapLibre 4 keeps working beside it.
   Imagery and terrain (no key; all free to use with attribution, shown in the map's attribution control):
     USGS The National Map, USGSImageryOnly tiles: public domain (US Government); global small-scale imagery,
       US orthoimagery to zoom 16. Credit: "USGS The National Map".
     AWS Terrain Tiles (Terrarium): open data on the Registry of Open Data on AWS, with attribution.
     OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data, ODbL): place and road names, 3D buildings.
   This is the renderer with no key. With a Google key in assets/runtime.json the screen (modules/globe.js) uses the
   CesiumJS renderer (assets/godseye-cesium.js) instead, through the same command.

   A 'site' step (a real address, assets/mapcmd.js) draws its building outline extruded to its height, the parcel edge
   as a thin line, and dims the map's own buildings; while the camera is at a site or address step, manual zoom stops
   at the step's ceiling (its `ceiling`, set by mapcmd.js from the step's precision).

   Usage:
     import { mount } from './godseye.js?v=…';
     const g = await mount(el, { onStop(i, step), onEnd(), onFallback(reason) });
     g.run({ title, steps, marks }); g.fly(step); g.orbit(); g.tilt(65); g.pause(); g.resume(); g.next(); g.prev(); g.destroy();
   ═══════════════════════════════════════════════════════════════════════════ */

const ML_VER = '5.24.0';
const LIBS = {
  mlJs: [`https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`, `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`],
  mlCss: [`https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`, `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`],
};
const SAT = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const OMT = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const ATTR = {
  sat: 'Imagery <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener">USGS The National Map</a>',
  dem: 'Terrain <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a>',
  omt: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
};
const HOME = { center: [-84, 37.5], zoom: 2.15, pitch: 0, bearing: 0 };
const FREE_ZOOM = 22;                     // the map's own limit when no site or address step is on screen
const BLDG_OPACITY = ['interpolate', ['linear'], ['zoom'], 15, 0, 16, .55];
const SITE_SRC = 'gx-site', SITE_EMPTY = { type: 'FeatureCollection', features: [] };

/* ── small utilities ──────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const _loads = new Map();
function loadScript(urls, check) {
  const key = urls[0]; if (_loads.has(key)) return _loads.get(key);
  const p = (async () => {
    let last;
    for (const u of urls) {
      try {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = u; s.async = true; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('load failed: ' + u)); }; document.head.appendChild(s); });
        return check();
      } catch (e) { last = e; console.warn('[globe]', e.message); }
    }
    throw last || new Error('library unavailable');
  })();
  _loads.set(key, p); p.catch(() => _loads.delete(key));
  return p;
}
function loadCss(urls, id) {
  if (document.getElementById(id)) return;
  const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = urls[0];
  l.onerror = () => { if (urls[1] && l.href !== urls[1]) l.href = urls[1]; };
  document.head.appendChild(l);
}
/** MapLibre 5 under its own name: the 3D map screen keeps window.maplibregl (version 4) for itself. */
async function maplibre5() {
  if (window.__maplibre5) return window.__maplibre5;
  const cur = window.maplibregl;
  if (cur && /^5\./.test(cur.getVersion?.() || '')) return (window.__maplibre5 = cur);
  const prev = cur;
  return loadScript(LIBS.mlJs, () => {
    const m = window.maplibregl;
    if (!m || !/^5\./.test(m.getVersion?.() || '')) throw new Error('MapLibre 5 missing');
    window.__maplibre5 = m;
    if (prev) window.maplibregl = prev;   // give the older copy back to whoever loaded it
    return m;
  });
}
export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/* ── the style with no key: imagery, terrain, atmosphere, names and buildings ── */
function style() {
  const name = ['coalesce', ['get', 'name:en'], ['get', 'name']];
  const halo = { 'text-color': '#f4f7fb', 'text-halo-color': 'rgba(6,10,16,.85)', 'text-halo-width': 1.4, 'text-halo-blur': .4 };
  return {
    version: 8, projection: { type: 'globe' }, glyphs: GLYPHS,
    sources: {
      sat: { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 16, attribution: ATTR.sat },
      dem: { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: ATTR.dem },
      omt: { type: 'vector', url: OMT, attribution: ATTR.omt },
    },
    sky: {
      'sky-color': '#0b1d3a', 'horizon-color': '#6aa7e8', 'fog-color': '#9cc6ef', 'sky-horizon-blend': .6, 'horizon-fog-blend': .55, 'fog-ground-blend': .4,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, .9, 10, .35, 13, 0],
    },
    light: { anchor: 'map', position: [1.5, 200, 40], intensity: .35 },
    terrain: { source: 'dem', exaggeration: 1.25 },
    layers: [
      { id: 'space', type: 'background', paint: { 'background-color': '#050912' } },
      { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 180, 'raster-saturation': .08, 'raster-contrast': .06 } },
      { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
        paint: { 'line-color': 'rgba(255,240,214,.32)', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, .4, 17, 2.2] } },
      { id: 'buildings', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 15,
        paint: { 'fill-extrusion-color': '#d9dee6', 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, .55],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } },
      { id: 'road-names', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15,
        layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: halo },
      { id: 'places', type: 'symbol', source: 'omt', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'state', 'country']]],
        layout: { 'text-field': name, 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], 'country', 13, 'state', 11, 'city', 13, 12],
          'text-transform': ['match', ['get', 'class'], ['country', 'state'], 'uppercase', 'none'], 'text-letter-spacing': ['match', ['get', 'class'], ['country', 'state'], .12, 0],
          'symbol-sort-key': ['get', 'rank'], 'text-max-width': 8 },
        paint: { ...halo, 'text-opacity': ['match', ['get', 'class'], ['country', 'state'], .75, .95] } },
    ],
  };
}

/* ── scoped CSS (system tokens; the stage is a dark band, data-sys-theme="dark") ── */
const CSS = `
.gx-stage{position:absolute;inset:0;overflow:hidden;background:radial-gradient(120% 90% at 50% 40%,#0d1830 0%,#050912 70%);color:var(--sys-ink);font-family:var(--sys-font)}
.gx-stage .gx-map{position:absolute;inset:0}
.gx-stage .gx-map canvas{outline:none}
.gx-pin{all:unset;box-sizing:border-box;position:relative;display:flex;align-items:center;gap:6px;cursor:pointer;transform:translateY(-50%)}
.gx-pin .gx-dot{position:relative;width:12px;height:12px;border-radius:50%;background:var(--co,var(--sys-brand));border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.5);flex-shrink:0}
.gx-pin .gx-lbl{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 9px;border-radius:var(--sys-r-pill);background:rgba(8,12,20,.78);border:1px solid rgba(255,255,255,.16);font:600 12px/1.3 var(--sys-font);color:#f4f7fb;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.gx-pin.mark .gx-dot{width:9px;height:9px;border-width:1.5px}
.gx-pin.mark .gx-lbl{font-weight:500;font-size:11px}
.gx-pin:focus-visible .gx-lbl{outline:2px solid var(--sys-focus);outline-offset:2px}
.gx-pin.on{z-index:3}
.gx-pin.on .gx-lbl{background:rgba(8,12,20,.92);border-color:var(--co,var(--sys-brand))}
.gx-pin.on .gx-dot::before,.gx-pin.on .gx-dot::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid var(--co,var(--sys-brand));box-shadow:0 0 18px color-mix(in srgb,var(--co,var(--sys-brand)) 60%,transparent)}
.gx-pin.on .gx-dot::after{animation:gxring 2.2s ease-out infinite;opacity:0}
@keyframes gxring{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.6);opacity:0}}
.gx-pin.addr .gx-dot{border-radius:3px}
.gx-card{position:absolute;z-index:4;left:16px;bottom:34px;width:min(340px,calc(100% - 32px));gap:8px;padding:16px 18px;background:color-mix(in srgb,var(--sys-surface) 92%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:var(--sys-sh-2);transition:opacity .35s var(--sys-ease),transform .35s var(--sys-ease)}
.gx-card[hidden]{display:none}
.gx-card.out{opacity:0;transform:translateY(8px)}
.gx-card .gx-sub{font-size:var(--sys-fs-xs);color:var(--sys-mute)}
.gx-card .gx-figs{display:flex;flex-wrap:wrap;gap:6px 18px;margin:2px 0}
.gx-card .gx-fig{display:flex;flex-direction:column;gap:3px;min-width:0}
.gx-card .gx-fig b{font:600 18px/1.1 var(--sys-mono);letter-spacing:-.03em;color:var(--sys-ink);font-variant-numeric:tabular-nums}
.gx-card .gx-why{font-size:var(--sys-fs-sm);line-height:1.45;color:var(--sys-ink-2)}
.gx-card .gx-n{font:600 var(--sys-fs-2xs)/1 var(--sys-mono);color:var(--sys-mute)}
.gx-fallback{position:absolute;inset:0;overflow:auto;padding:var(--sys-sp-6,24px) var(--sys-gut,16px);background:var(--sys-bg)}
.gx-fallback ol{margin:var(--sys-sp-3,12px) 0 0;padding-left:20px;display:flex;flex-direction:column;gap:8px}
.gx-stage .maplibregl-ctrl-attrib{background:rgba(5,9,18,.72)!important;color:#d5dde7;font-size:10px}
.gx-stage .maplibregl-ctrl-attrib-inner{color:#d5dde7}
.gx-stage .maplibregl-ctrl-attrib a{color:#e6edf3}
.gx-stage .maplibregl-ctrl-attrib-button{filter:invert(1) opacity(.7)}
.gx-stage .maplibregl-ctrl-group{background:rgba(8,12,20,.78);border:1px solid rgba(255,255,255,.14)}
.gx-stage .maplibregl-ctrl-group button .maplibregl-ctrl-icon{filter:invert(1)}
@media (prefers-reduced-motion:reduce){.gx-pin.on .gx-dot::after{animation:none}.gx-card{transition:none}}
@media (max-width:760px){.gx-card{left:12px;right:12px;width:auto;bottom:30px;padding:12px 14px}.gx-pin .gx-lbl{max-width:150px}}`;

/** A town-level site step right before the address it stages (same place, within a few kilometres). */
function viaTown(s, next) {
  return !!(s && next && s.kind === 'site' && s.precision === 'town' && next.kind === 'site' && next.precision !== 'town'
    && Math.abs(s.lat - next.lat) < .05 && Math.abs(s.lon - next.lon) < .05);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
class Globe {
  constructor(el, opts) {
    this.el = el; this.opts = opts || {}; this.destroyed = false; this.markers = []; this.cmd = null; this.i = -1; this.token = 0;
    this.paused = false; this.orbitRaf = 0; this.orbiting = false; this.frames = 0; this.fpsT0 = 0; this.fps = null; this.mode = 'none';
  }
  async init() {
    if (!document.getElementById('gx-css')) { const s = document.createElement('style'); s.id = 'gx-css'; s.textContent = CSS; document.head.appendChild(s); }
    const root = document.createElement('div'); root.className = 'gx-stage'; root.dataset.sysTheme = 'dark';
    root.innerHTML = `<div class="gx-map" role="region" aria-label="Globe"></div><div class="sys-card gx-card out" hidden aria-live="polite"></div>`;
    this.el.appendChild(root); this.root = root; this.$map = root.querySelector('.gx-map'); this.$card = root.querySelector('.gx-card');
    if (!webglOK() || this.opts.forceFallback) return this._fallback('nowebgl');
    let ml;
    try { loadCss(LIBS.mlCss, 'maplibre5-css'); ml = await maplibre5(); }
    catch (e) { console.warn('[globe]', e); return this._fallback('nolib'); }
    if (this.destroyed) return this;
    this.ml = ml; this.mode = 'open';
    try {
      this.map = new ml.Map({ container: this.$map, style: style(), ...HOME, maxPitch: 78, attributionControl: false, fadeDuration: 0, renderWorldCopies: false, canvasContextAttributes: { antialias: true, preserveDrawingBuffer: !!this.opts.preserveDrawingBuffer } });
    } catch (e) { console.warn('[globe]', e); return this._fallback('nowebgl'); }
    const map = this.map;
    map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new ml.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
    map.on('styleimagemissing', e => { try { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); } catch { } });
    map.on('error', e => console.debug('[globe] map', e?.error?.message || e));
    const stopOrbit = () => this.stopOrbit();
    for (const ev of ['mousedown', 'touchstart', 'wheel', 'dragstart']) map.on(ev, stopOrbit);
    map.on('render', () => { this.frames++; });
    this._onVis = () => { if (document.hidden) { this._wasOrbit = this.orbiting; this.stopOrbit(); } else if (this._wasOrbit && !this.paused) this.orbit(); };
    document.addEventListener('visibilitychange', this._onVis);
    await new Promise(res => { let done = false; const ok = () => { if (!done) { done = true; res(); } }; map.once('load', ok); setTimeout(ok, 15000); });
    if (this.destroyed) return this;
    return this;
  }

  _fallback(reason) {
    this.mode = 'fallback'; this.fallbackReason = reason;
    this.$map.remove(); this.$card.remove();
    this.$fb = document.createElement('div'); this.$fb.className = 'gx-fallback'; this.root.appendChild(this.$fb);
    this.root.removeAttribute('data-sys-theme');
    this._drawFallback();
    try { this.opts.onFallback?.(reason); } catch { }
    return this;
  }
  _drawFallback() {
    if (!this.$fb) return;
    const steps = this.cmd?.steps || [];
    this.$fb.innerHTML = `<p class="sys-card-body">This device cannot draw the 3D globe.</p>${steps.length ? `<ol class="sys-card-body">${steps.map(s => `<li><b>${esc(s.label)}</b>${s.sub ? ` · ${esc(s.sub)}` : ''}${s.figures?.length ? ` · ${s.figures.map(f => `${esc(f[0])} ${esc(f[1])}${f[2] ? ' <span class="sys-est">est.</span>' : ''}`).join(' · ')}` : ''}${s.href ? ` · <a href="${esc(s.href)}">${esc(s.link || 'Open')}</a>` : ''}</li>`).join('')}</ol>` : ''}`;
  }

  /* ── camera ──────────────────────────────────────────────────────────────── */
  /** Fly to a point (ease in and out); a cut, not a flight, with reduced motion. Resolves when the camera arrives. */
  fly(to, { duration } = {}) {
    const map = this.map; if (!map) return Promise.resolve();
    const cam = { center: [to.lon, to.lat], zoom: to.zoom ?? 12.5, pitch: to.pitch ?? 55, bearing: to.bearing ?? (map.getBearing() + 25) % 360 };
    if (reduced()) { map.jumpTo(cam); return Promise.resolve(); }
    const far = this._distKm(map.getCenter(), { lng: to.lon, lat: to.lat });
    const ms = duration ?? Math.max(2600, Math.min(9000, 2200 + far * 2.2));
    return new Promise(res => {
      let done = false; const fin = () => { if (!done) { done = true; clearTimeout(t); map.off('moveend', fin); res(); } };
      const t = setTimeout(fin, ms + 3000);
      map.once('moveend', fin);
      map.flyTo({ ...cam, duration: ms, curve: 1.5, speed: 1.1, essential: false, easing: k => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
    });
  }
  _distKm(a, b) { const r = Math.PI / 180, h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); }
  /** Slow orbit around the camera's centre (degrees per second). Off with reduced motion. */
  orbit(degPerSec = 5) {
    if (!this.map || reduced() || document.hidden) return;
    this.stopOrbit(); this.orbiting = true; let t0 = performance.now();
    const tick = now => { if (!this.orbiting || this.destroyed) return; const dt = Math.min(64, now - t0); t0 = now; this.map.setBearing(this.map.getBearing() + degPerSec * dt / 1000); this.orbitRaf = requestAnimationFrame(tick); };
    this.orbitRaf = requestAnimationFrame(tick);
  }
  stopOrbit() { this.orbiting = false; cancelAnimationFrame(this.orbitRaf); this.orbitRaf = 0; }
  /** Tilt down to an oblique view (or back up). */
  tilt(pitch = 65, duration = 1600) { if (!this.map) return; if (reduced()) this.map.setPitch(pitch); else this.map.easeTo({ pitch, duration }); }
  home() { this.stop(); this._clearMarks(); this._clearSites(); this._ceiling(FREE_ZOOM); this._card(null); if (!this.map) return; reduced() ? this.map.jumpTo(HOME) : this.map.flyTo({ ...HOME, duration: 2400 }); }

  /* ── marks and the place card ───────────────────────────────────────────── */
  _clearMarks() { for (const m of this.markers) m.remove(); this.markers = []; }
  _marks(cmd) {
    this._clearMarks(); if (!this.map) return;
    const add = (p, i, cls) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = `gx-pin ${cls}${p.kind === 'address' || p.kind === 'site' ? ' addr' : ''}`;
      if (p.co) el.dataset.co = p.co;
      el.innerHTML = `<span class="gx-dot" aria-hidden="true"></span><span class="gx-lbl">${esc(p.label)}</span>`;
      el.setAttribute('aria-label', p.label);
      if (i != null) el.onclick = e => { e.stopPropagation(); this.goTo(i); };
      const mk = new this.ml.Marker({ element: el, anchor: 'left', offset: [-6, 0] }).setLngLat([p.lon, p.lat]).addTo(this.map);
      mk._i = i; this.markers.push(mk);
    };
    (cmd.marks || []).forEach(m => add(m, null, 'mark'));
    // a town step that only stages its own address gets no pin of its own (the two would sit on one spot)
    (cmd.steps || []).forEach((s, i, all) => { if (!viaTown(s, all[i + 1])) add(s, i, 'stop'); });
  }
  /* ── a real address: its outline extruded, the parcel edge, the map's own buildings dimmed ── */
  _sites(cmd) {
    const map = this.map; if (!map) return;
    const feats = [];
    for (const s of cmd.steps || []) {
      if (s.kind !== 'site') continue;
      if (s.parcel) feats.push({ type: 'Feature', properties: { part: 'parcel' }, geometry: { type: 'LineString', coordinates: [...s.parcel, s.parcel[0]] } });
      if (s.outline) {
        const ring = [...s.outline, s.outline[0]];
        feats.push({ type: 'Feature', properties: { part: 'building', h: s.height_m || 8, basis: s.height_basis || 'likely' }, geometry: { type: 'Polygon', coordinates: [ring] } });
        feats.push({ type: 'Feature', properties: { part: 'edge' }, geometry: { type: 'LineString', coordinates: ring } });
      }
    }
    this.siteFeatures = feats.length;
    try {
      if (!map.getSource(SITE_SRC)) {
        if (!feats.length) return;
        map.addSource(SITE_SRC, { type: 'geojson', data: SITE_EMPTY });
        const before = map.getLayer('road-names') ? 'road-names' : undefined;
        map.addLayer({ id: 'gx-site-parcel', type: 'line', source: SITE_SRC, filter: ['==', ['get', 'part'], 'parcel'],
          paint: { 'line-color': '#ffd479', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, .8, 19, 2.2], 'line-opacity': .9 } }, before);
        map.addLayer({ id: 'gx-site-building', type: 'fill-extrusion', source: SITE_SRC, filter: ['==', ['get', 'part'], 'building'],
          paint: { 'fill-extrusion-color': ['match', ['get', 'basis'], 'public', '#f0874a', '#f6a777'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .72 } }, before);
        map.addLayer({ id: 'gx-site-edge', type: 'line', source: SITE_SRC, filter: ['==', ['get', 'part'], 'edge'],
          paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1, 19, 2.6] } }, before);
      }
      map.getSource(SITE_SRC).setData({ type: 'FeatureCollection', features: feats });
      if (map.getLayer('buildings')) map.setPaintProperty('buildings', 'fill-extrusion-opacity', feats.some(f => f.properties.part === 'building') ? ['interpolate', ['linear'], ['zoom'], 15, 0, 16, .16] : BLDG_OPACITY);
    } catch (e) { console.warn('[globe] site', e); }
  }
  _clearSites() {
    const map = this.map; this.siteFeatures = 0; if (!map) return;
    try { map.getSource(SITE_SRC)?.setData(SITE_EMPTY); if (map.getLayer('buildings')) map.setPaintProperty('buildings', 'fill-extrusion-opacity', BLDG_OPACITY); } catch { }
  }
  /** While a site or address step is on screen, manual zoom stops at its ceiling. */
  _ceiling(z) {
    const map = this.map; if (!map) return;
    try {
      map.setMaxZoom(Math.min(FREE_ZOOM, z ?? FREE_ZOOM));
      // MapLibre 5.24 on the globe keeps the old limit for the next flight after a bearing change (the orbit); a
      // jump in place settles the new one
      map.jumpTo({ zoom: map.getZoom() });
    } catch { }
  }

  _highlight(i) { for (const m of this.markers) m.getElement().classList.toggle('on', m._i === i); }
  _card(s, i, n) {
    const c = this.$card; if (!c) return;
    if (!s) { c.classList.add('out'); c.hidden = true; return; }
    c.dataset.co = s.co || ''; c.style.setProperty('--co', s.co ? `var(--co-${s.co})` : 'var(--sys-brand)');
    c.innerHTML = `${n > 1 ? `<div class="gx-n">${i + 1} / ${n}</div>` : ''}<div class="sys-card-title">${esc(s.label)}</div>${s.sub ? `<div class="gx-sub">${esc(s.sub)}</div>` : ''}
      ${s.figures?.length ? `<div class="gx-figs">${s.figures.map(f => `<div class="gx-fig"><span class="sys-kpi-label">${esc(f[0])}</span><b>${esc(f[1])}${f[2] ? '<span class="sys-est">est.</span>' : ''}</b></div>`).join('')}</div>` : ''}
      ${s.reason ? `<div class="gx-why">${esc(s.reason)}</div>` : ''}${s.href ? `<div><a class="sys-btn sys-btn--secondary sys-btn--sm" href="${esc(s.href)}">${esc(s.link || 'Open')}</a></div>` : ''}`;
    c.hidden = false; requestAnimationFrame(() => c.classList.remove('out'));
  }

  /* ── the sequence runner ────────────────────────────────────────────────── */
  /** Run a cleaned command (assets/mapcmd.js validate): marks, then each step in turn with a pause at each. */
  run(cmd) {
    this.stop(); this.cmd = cmd; this.i = -1; this.paused = false;
    if (this.mode === 'fallback') { this._drawFallback(); try { this.opts.onStop?.(0, cmd.steps?.[0]); } catch { } return Promise.resolve(); }
    this._marks(cmd);
    this._clearSites(); this._sites(cmd);
    if (!cmd.steps?.length) { if (cmd.fit !== false) this._fitMarks(cmd.marks); return Promise.resolve(); }
    return this._loop(++this.token, 0);
  }
  async _loop(tok, from) {
    const steps = this.cmd.steps;
    for (let i = from; i < steps.length; i++) {
      if (tok !== this.token || this.destroyed) return;
      // with reduced motion there is no flight to stage: the town step before its own address is skipped
      if (reduced() && viaTown(steps[i], steps[i + 1])) continue;
      this.i = i; this.stopOrbit(); this._highlight(i); this._card(null);
      try { this.opts.onStop?.(i, steps[i]); } catch { }
      this._ceiling(FREE_ZOOM);
      await this.fly(steps[i]);
      if (tok !== this.token || this.destroyed) return;
      this._ceiling(steps[i].ceiling);
      this._card(steps[i], i, steps.length);
      if (steps.length === 1) { this.orbit(4); return; }
      this.orbit(4);
      await this._hold(tok, steps[i].hold_ms || 6000);
    }
    if (tok === this.token) { this.stopOrbit(); try { this.opts.onEnd?.(); } catch { } }
  }
  /** A wait that stops counting while paused or while the tab is hidden. */
  _hold(tok, ms) {
    return new Promise(res => { let left = ms; let t = performance.now(); const iv = setInterval(() => { const now = performance.now(); if (tok !== this.token || this.destroyed) { clearInterval(iv); return res(); } if (!this.paused && !document.hidden) left -= now - t; t = now; if (left <= 0) { clearInterval(iv); res(); } }, 100); });
  }
  _fitMarks(marks) { if (!marks?.length || !this.map) return; const b = new this.ml.LngLatBounds(); marks.forEach(m => b.extend([m.lon, m.lat])); this.map.fitBounds(b, { padding: 80, maxZoom: 9, duration: reduced() ? 0 : 2400 }); }
  goTo(i) { if (!this.cmd?.steps?.[i]) return; this.paused = false; if (this.mode === 'fallback') return; this._loop(++this.token, i); }
  next() { this.goTo(Math.min((this.cmd?.steps?.length || 1) - 1, this.i + 1)); }
  prev() { this.goTo(Math.max(0, this.i - 1)); }
  pause() { this.paused = true; this.stopOrbit(); }
  resume() { this.paused = false; if (this.i >= 0) this.orbit(4); }
  stop() { this.token++; this.stopOrbit(); try { this.map?.stop(); } catch { } }
  /** For checks: what the globe is showing. */
  state() {
    const m = this.map; const now = performance.now();
    if (now - this.fpsT0 > 900) { this.fps = this.fpsT0 ? Math.round(this.frames * 1000 / (now - this.fpsT0)) : null; this.frames = 0; this.fpsT0 = now; }
    return { mode: this.mode, step: this.i, steps: this.cmd?.steps?.length || 0, paused: this.paused, orbiting: this.orbiting, renderFps: this.fps,
      maxZoom: m ? m.getMaxZoom() : null, siteFeatures: this.siteFeatures || 0,
      dimmed: !!(m && m.getLayer('buildings') && JSON.stringify(m.getPaintProperty('buildings', 'fill-extrusion-opacity')) !== JSON.stringify(BLDG_OPACITY)),
      camera: m ? { lon: +m.getCenter().lng.toFixed(4), lat: +m.getCenter().lat.toFixed(4), zoom: +m.getZoom().toFixed(2), pitch: +m.getPitch().toFixed(1), bearing: +m.getBearing().toFixed(1), projection: m.getProjection?.()?.type } : null,
      card: this.$card && !this.$card.hidden ? this.$card.innerText : null };
  }
  destroy() {
    if (this.destroyed) return; this.destroyed = true; this.token++; this.stopOrbit();
    document.removeEventListener('visibilitychange', this._onVis);
    this._clearMarks();
    try { this.map?.style?.on?.('error', () => { }); } catch { }
    try { this.map?.remove(); } catch { }
    this.map = null; this.root?.remove();
  }
}

/** Mount the globe into el. Never throws: with no WebGL it shows one plain line and the list of places. */
export async function mount(el, opts) {
  const g = new Globe(el, opts);
  try { await g.init(); } catch (e) { console.warn('[globe]', e); if (g.mode !== 'fallback' && !g.destroyed) { try { g.map?.remove(); } catch { } g.map = null; g._fallback('error'); } }
  return g;
}
export default { mount, webglOK };
