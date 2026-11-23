/* Globe renderer on CesiumJS (photorealistic when a key is configured).

   Steers the same map command as assets/godseye.js:
     { title, steps:[{lat,lon,label,sub,figures,href,zoom,pitch,bearing,hold_ms,kind,precision,outline,parcel,height_m}],
       marks:[{lat,lon,label}], source }

   export createGlobe(container, opts) -> { ready, tiles, run(cmd), fly(step), mark(points), clear(), mode(name), destroy(), state(),
                                            goTo(i), next(), prev(), pause(), resume(), home() }
     opts: { maps, listen, mode, controls (false: no Next and Reset buttons, the host screen has its own),
             onStop(i, step), onEnd() }
   export openGlobe(container, opts)   -> the same instance for the whole page view (one metered session).

   Nothing is fetched when this module is imported. CesiumJS (pinned, unpkg then jsdelivr) and any tiles load only
   when createGlobe() runs, which the screen calls after the visitor presses the control that opens the globe.

   Imagery
     - assets/runtime.json "maps": { "google3dTilesKey": "", "cesiumIonToken": "" }, both empty by default.
     - google3dTilesKey set: Google Photorealistic 3D Tiles, set up as Google's CesiumJS guide shows (root tileset
       https://tile.googleapis.com/v1/3dtiles/root.json?key=…, showCreditsOnScreen, no Cesium globe or terrain under the
       tiles, as Google's FAQ advises against pairing them). Google's logo and attribution line sit in Cesium's credit
       bar, which the product's controls never cover.
     - cesiumIonToken set (and no Google key, or the Google route failed): the same tiles through Cesium ion, asset 2275207.
     - Neither: a key-free globe. NASA GIBS Blue Marble and VIIRS night lights (NASA, no restrictions on use), and
       USDA/USGS The National Map orthoimagery over the lower 48 states (US public domain). Sun lighting by the time of day.

   Camera language (adapted from the MIT-licensed reference listed in THIRD_PARTY_NOTICES.md): orbit height, a
   great-circle flight, a descent that tilts to oblique, a slow orbit around the stop while its card shows, then on.
   prefers-reduced-motion cuts instead of flying. A step that is not a surveyed address never comes below FLOOR_M.

   A 'site' step (a real address typed by a visitor, assets/mapcmd.js) is labelled with the typed address. Its floor
   follows how well the point is known, as the zoom ceiling does in mapcmd.js: parcel 150 m (zoom 19), typed 900 m
   (zoom 16.5), town 12,000 m (zoom 12.5). With a parcel match its outline is drawn extruded to its height (the roof
   edge dashed when the height is likely) and the parcel edge as a thin line. The 3,000 m floor and the "Example
   address" chip are for kind 'address' only (example records).
*/

export const CESIUM_VERSION = '1.146.0';
export const CESIUM_CDNS = [
  `https://unpkg.com/cesium@${CESIUM_VERSION}/Build/Cesium/`,
  `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`,
];
export const GOOGLE_ROOT = 'https://tile.googleapis.com/v1/3dtiles/root.json';
export const ION_GOOGLE_ASSET = 2275207;

/* One line for the screen's Method material (OS_SPEC 7.4). */
export const GLOBE_METHOD = 'Photorealistic imagery is Google’s. Example addresses are never shown at house level; a typed address comes as close as its match allows.';

/* Lowest camera height above the ground, in metres, by kind of stop. At 3,000 m a house is a few pixels wide. */
export const FLOOR_M = { address: 3000, area: 3000, surveyed: 300, parcel: 150, typed: 900, town: 12000 };
/* The closest map zoom for a 'site' step, by precision (the same table as assets/mapcmd.js SITE_CEILING). */
export const SITE_CEILING = { parcel: 19, typed: 16.5, town: 12.5 };
const SITE_ZOOM = { parcel: 18.5, typed: 16.5, town: 12 };
const SURVEYED = new Set(['surveyed', 'record']);

export const MODES = [
  { id: 'natural', label: 'Natural' },
  { id: 'night', label: 'Night' },
  { id: 'thermal', label: 'Thermal look' },
  { id: 'blueprint', label: 'Blueprint' },
];

const START = { lon: -78, lat: 36, height: 14_000_000 };
const ORBIT_DEG_S = 3;          // slow orbit while a card shows
const HOLD_MS = 5200;
const MAX_STEPS = 12;
const US48 = [-125.0, 24.0, -66.5, 49.5];

const ASSET_Q = (() => { try { return new URL(import.meta.url).search || ''; } catch { return ''; } })();

/* ───────────────────────── loading ───────────────────────── */

let libPromise = null;

function addScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error('load ' + src)); };
    document.head.appendChild(s);
  });
}
function addCss(href, id) {
  if (id && document.getElementById(id)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; if (id) l.id = id;
  document.head.appendChild(l);
}

export function loadCesium() {
  if (window.Cesium && window.Cesium.Viewer) return Promise.resolve(window.Cesium);
  if (libPromise) return libPromise;
  libPromise = (async () => {
    let lastErr = null;
    for (const base of CESIUM_CDNS) {
      try {
        window.CESIUM_BASE_URL = base;          // read by Cesium when it resolves workers and assets
        await addScript(base + 'Cesium.js');
        if (!window.Cesium || !window.Cesium.Viewer) throw new Error('no Cesium global');
        addCss(base + 'Widgets/widgets.css', 'gx-cesium-widgets');
        return window.Cesium;
      } catch (e) { lastErr = e; }
    }
    libPromise = null;
    throw lastErr || new Error('Cesium did not load');
  })();
  return libPromise;
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const lose = gl.getExtension && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch { return false; }
}

async function readMaps(opts) {
  if (opts && opts.maps) return opts.maps;
  try {
    const r = await fetch(new URL('./runtime.json', import.meta.url).href, { cache: 'no-store' });
    if (!r.ok) return {};
    const j = await r.json();
    return (j && j.maps) || {};
  } catch { return {}; }
}

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const isPhone = () => {
  try { return window.matchMedia('(max-width: 767px), (pointer: coarse)').matches; } catch { return false; }
};

/* ───────────────────────── command checks ───────────────────────── */

const str = (v, n = 120) => (typeof v === 'string' ? v.trim().slice(0, n) : (typeof v === 'number' && isFinite(v) ? String(v) : ''));
const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const safeHref = (h) => (typeof h === 'string' && /^#\/[\w\-/?=&.%,:+]*$/.test(h.trim()) ? h.trim() : '');

function cleanRing(r, lon0, lat0, max) {
  if (!Array.isArray(r)) return null;
  const pts = r.slice(0, max).map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN]))
    .filter(([x, y]) => isFinite(x) && isFinite(y) && Math.abs(x - lon0) <= 0.01 && Math.abs(y - lat0) <= 0.01);
  return pts.length >= 3 && pts.length === Math.min(r.length, max) ? pts : null;
}

export function cleanStep(s) {
  if (!s || typeof s !== 'object') return null;
  const lat = Number(s.lat), lon = Number(s.lon);
  if (!isFinite(lat) || !isFinite(lon) || lat < -85 || lat > 85 || lon < -180 || lon > 180) return null;
  const kind = str(s.kind, 24) || 'area';
  const site = kind === 'site';
  const prec = str(s.precision, 24);
  // a site step with no known precision counts as a town; any step that names a precision takes its floor
  const precision = site ? (Object.hasOwn(SITE_CEILING, prec) ? prec : 'town') : (Object.hasOwn(SITE_CEILING, prec) ? prec : '');
  const surveyed = SURVEYED.has(kind) || SURVEYED.has(prec);
  const floor = kind === 'address' ? FLOOR_M.address : precision ? FLOOR_M[precision] : surveyed ? FLOOR_M.surveyed : FLOOR_M.area;
  const ceiling = precision ? SITE_CEILING[precision] : 19;
  const out = {
    lat, lon, kind,
    label: str(s.label, 80), sub: str(s.sub, 120),
    figures: Array.isArray(s.figures) ? s.figures.filter((f) => Array.isArray(f) && f.length >= 2)
      .slice(0, 3).map((f) => [str(f[0], 40), str(f[1], 40)]).filter((f) => f[0] && f[1]) : [],
    href: safeHref(s.href),
    zoom: num(s.zoom, 2, ceiling, site ? SITE_ZOOM[precision] : Math.min(12.5, ceiling)),
    pitch: num(s.pitch, 0, 70, 50),
    bearing: num(s.bearing, -360, 360, 0),
    hold_ms: num(s.hold_ms, 1500, 30000, HOLD_MS),
    floor,
  };
  if (precision) out.precision = precision;
  if (site && precision === 'parcel') {
    const outline = cleanRing(s.outline, lon, lat, 48), parcel = cleanRing(s.parcel, lon, lat, 40);
    if (outline) {
      out.outline = outline;
      out.height_m = num(s.height_m, 2, 120, 8);
      out.height_basis = s.height_basis === 'public' ? 'public' : 'likely';
    }
    if (parcel) out.parcel = parcel;
  }
  return out;
}

/* A town-level site step right before the address it stages: skipped under reduced motion (nothing to fly). */
function viaTown(s, next) {
  return !!(s && next && s.kind === 'site' && s.precision === 'town' && next.kind === 'site' && next.precision !== 'town'
    && Math.abs(s.lat - next.lat) < 0.05 && Math.abs(s.lon - next.lon) < 0.05);
}

export function cleanCommand(cmd) {
  const c = cmd && typeof cmd === 'object' ? cmd : {};
  const steps = (Array.isArray(c.steps) ? c.steps : []).map(cleanStep).filter(Boolean).slice(0, MAX_STEPS);
  const marks = (Array.isArray(c.marks) ? c.marks : []).map((m) => {
    const lat = Number(m && m.lat), lon = Number(m && m.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
    return { lat, lon, label: str(m.label, 60) };
  }).filter(Boolean).slice(0, 200);
  return { title: str(c.title, 80), steps, marks, source: str(c.source, 120) };
}

/* Camera height for a map zoom at a latitude, for a view `px` CSS pixels across (the wider side). */
export function heightForZoom(zoom, lat, px, fovRad = Math.PI / 3) {
  const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  return (mpp * px) / 2 / Math.tan(fovRad / 2);
}

/* ───────────────────────── visual modes (post-process) ───────────────────────── */
/* Night and Thermal look are reduced adaptations of the reference's night-vision and thermal styles
   (MIT, see THIRD_PARTY_NOTICES.md); Blueprint is new. Each is one PostProcessStage, off by default. */

const SHADERS = {
  night: `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    in vec2 v_textureCoordinates;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 uv = v_textureCoordinates;
      vec2 texel = 1.0 / colorTextureDimensions;
      vec3 c = texture(colorTexture, uv).rgb;
      vec3 halo = vec3(0.0);
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) halo += texture(colorTexture, uv + vec2(float(i), float(j)) * texel * 2.0).rgb;
      halo /= 25.0;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      float h = dot(halo, vec3(0.299, 0.587, 0.114));
      l = pow(clamp(l * 1.9 + smoothstep(0.55, 1.0, h) * 0.35, 0.0, 1.0), 0.8);
      l += (hash(uv * colorTextureDimensions) - 0.5) * 0.06;
      vec2 cc = uv * 2.0 - 1.0; cc.x *= colorTextureDimensions.x / colorTextureDimensions.y;
      float vig = 1.0 - smoothstep(0.75, 1.55, length(cc));
      vec3 phosphor = vec3(0.30, 1.0, 0.42);
      out_FragColor = vec4(phosphor * l * vig, 1.0);
    }`,
  thermal: `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    in vec2 v_textureCoordinates;
    vec3 ironbow(float t){
      t = clamp(t, 0.0, 1.0);
      vec3 c0 = vec3(0.0), c1 = vec3(0.13, 0.0, 0.30), c2 = vec3(0.49, 0.0, 0.45), c3 = vec3(0.86, 0.10, 0.18),
           c4 = vec3(1.0, 0.55, 0.0), c5 = vec3(1.0, 0.91, 0.32), c6 = vec3(1.0);
      float s = t * 6.0;
      if (s < 1.0) return mix(c0, c1, s);
      if (s < 2.0) return mix(c1, c2, s - 1.0);
      if (s < 3.0) return mix(c2, c3, s - 2.0);
      if (s < 4.0) return mix(c3, c4, s - 3.0);
      if (s < 5.0) return mix(c4, c5, s - 4.0);
      return mix(c5, c6, s - 5.0);
    }
    void main(){
      vec2 uv = v_textureCoordinates;
      vec2 texel = 1.0 / colorTextureDimensions;
      vec3 b = vec3(0.0); float w = 0.0;
      for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
        float k = exp(-0.5 * float(x * x + y * y) / 2.0);
        b += texture(colorTexture, uv + vec2(float(x), float(y)) * texel * 1.5).rgb * k; w += k;
      }
      b /= w;
      float t = dot(b, vec3(0.299, 0.587, 0.114));
      t = clamp((t - 0.08) / 0.8, 0.0, 1.0);
      float band = smoothstep(0.04, 0.06, abs(fract(t * 12.0) - 0.5));
      t *= mix(1.0, band * 0.85 + 0.15, 0.25);
      out_FragColor = vec4(ironbow(t), 1.0);
    }`,
  blueprint: `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    in vec2 v_textureCoordinates;
    float lum(vec2 uv){ return dot(texture(colorTexture, uv).rgb, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec2 uv = v_textureCoordinates;
      vec2 t = 1.0 / colorTextureDimensions;
      float gx = -lum(uv + vec2(-t.x, -t.y)) - 2.0 * lum(uv + vec2(-t.x, 0.0)) - lum(uv + vec2(-t.x, t.y))
                 + lum(uv + vec2(t.x, -t.y)) + 2.0 * lum(uv + vec2(t.x, 0.0)) + lum(uv + vec2(t.x, t.y));
      float gy = -lum(uv + vec2(-t.x, -t.y)) - 2.0 * lum(uv + vec2(0.0, -t.y)) - lum(uv + vec2(t.x, -t.y))
                 + lum(uv + vec2(-t.x, t.y)) + 2.0 * lum(uv + vec2(0.0, t.y)) + lum(uv + vec2(t.x, t.y));
      float edge = smoothstep(0.08, 0.45, length(vec2(gx, gy)));
      vec2 px = uv * colorTextureDimensions;
      float grid = max(step(fract(px.x / 48.0), 1.0 / 48.0), step(fract(px.y / 48.0), 1.0 / 48.0)) * 0.12;
      vec3 paper = vec3(0.06, 0.20, 0.42) + lum(uv) * 0.10;
      out_FragColor = vec4(mix(paper + grid, vec3(0.88, 0.95, 1.0), edge), 1.0);
    }`,
};

/* ───────────────────────── small math ───────────────────────── */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoother = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const win = (t, a, b) => smoother((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const shortAngle = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

/* ───────────────────────── DOM helpers ───────────────────────── */

function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of [].concat(kids || [])) if (k) n.appendChild(k);
  return n;
}

function pinCanvas(text, fill, size) {
  const r = window.devicePixelRatio > 1 ? 2 : 1;
  const w = size, h = Math.round(size * 1.3);
  const c = document.createElement('canvas');
  c.width = w * r; c.height = h * r;
  const g = c.getContext('2d');
  g.scale(r, r);
  const cx = w / 2, cy = w / 2, rad = w / 2 - 2;
  g.beginPath();
  g.moveTo(cx, h - 1);
  g.bezierCurveTo(cx - rad * 0.55, cy + rad * 1.05, cx - rad, cy + rad * 0.5, cx - rad, cy);
  g.arc(cx, cy, rad, Math.PI, 0);
  g.bezierCurveTo(cx + rad, cy + rad * 0.5, cx + rad * 0.55, cy + rad * 1.05, cx, h - 1);
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#ffffff'; g.stroke();
  if (text) {
    g.fillStyle = '#0a0e14';
    g.font = `700 ${Math.round(size * 0.42)}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, cx, cy + 1);
  } else {
    g.beginPath(); g.arc(cx, cy, rad * 0.35, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  }
  return c;
}

/* ───────────────────────── the globe ───────────────────────── */

let shared = null;

/* The page-view instance: a second open reuses the viewer and its tileset (one metered session). */
export function openGlobe(container, opts = {}) {
  if (shared && !shared._dead) {
    if (container && shared._root.parentNode !== container) container.appendChild(shared._root);
    return shared;
  }
  shared = createGlobe(container, opts);
  return shared;
}

export function createGlobe(container, opts = {}) {
  if (!container || !container.appendChild) throw new TypeError('createGlobe needs a container element');

  addCss(new URL('./godseye-cesium.css' + ASSET_Q, import.meta.url).href, 'gx-cesium-css');

  const root = el('div', { class: 'gx-globe', role: 'region', 'aria-label': 'Globe' });
  const stage = el('div', { class: 'gx-stage' });
  const ui = el('div', { class: 'gx-ui' });
  const live = el('div', { class: 'sys-sr', 'aria-live': 'polite' });
  root.append(stage, ui, live);
  container.appendChild(root);

  let C = null, viewer = null, tileset = null, route = 'none', keyed = false, usgsLayer = null;
  let dead = false, paused = false, currentMode = 'natural';
  const stages = {};
  const listeners = [];
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); listeners.push(() => t.removeEventListener(ev, fn, o)); };

  // sequence state
  let anim = null;                 // { tick(dt) -> bool(still running) }
  let runToken = 0;                // bumps to cancel a run
  let floorM = 0;                  // active floor above ground
  let groundM = 0;
  let current = null;              // current step
  let lastFrame = 0;
  let pins = [];                   // entities
  let markEntities = [];
  let pendingNext = null;          // resolves the hold early (Next button)
  let cmdNow = null;
  let siteEntities = [];
  let stepIndex = -1, userPaused = false;
  const stats = { minHeightAbove: Infinity, flights: 0, cuts: 0 };

  /* UI: card, controls, fallback */
  const card = el('section', { class: 'gx-card sys-card', hidden: true, 'aria-live': 'polite' });
  const modes = el('div', { class: 'gx-modes', role: 'group', 'aria-label': 'Look' },
    MODES.map((m) => el('button', { type: 'button', class: 'sys-chip gx-chip', 'data-mode': m.id, 'aria-pressed': m.id === 'natural' ? 'true' : 'false', text: m.label })));
  const btnNext = el('button', { type: 'button', class: 'sys-btn sys-btn--secondary sys-btn--sm gx-next', text: 'Next', hidden: true });
  const btnReset = el('button', { type: 'button', class: 'sys-btn sys-btn--secondary sys-btn--sm gx-reset', text: 'Reset' });
  const bar = el('div', { class: 'gx-bar' }, [modes, el('div', { class: 'gx-acts' }, opts.controls === false ? [] : [btnNext, btnReset])]);
  ui.append(bar, card);

  on(modes, 'click', (e) => { const b = e.target.closest('[data-mode]'); if (b) api.mode(b.dataset.mode); });
  on(btnNext, 'click', () => { if (pendingNext) pendingNext(); });
  on(btnReset, 'click', () => { api.clear(); home(); });

  function showFallback(cmd) {
    root.classList.add('gx-globe--flat');
    stage.replaceChildren();
    bar.hidden = true;
    const list = (cmd && cmd.steps && cmd.steps.length)
      ? el('ol', { class: 'gx-list' }, cmd.steps.map((s) => el('li', null, [
        el('b', { text: s.label || '' }), s.sub ? document.createTextNode(' · ' + s.sub) : null])))
      : null;
    const box = el('div', { class: 'gx-fallback' }, [el('p', { class: 'gx-fallback-line', text: 'This browser cannot draw the 3D globe.' }), list]);
    const old = ui.querySelector('.gx-fallback'); if (old) old.remove();
    ui.appendChild(box);
  }

  /* ── boot ── */
  const ready = (async () => {
    if (!hasWebGL()) { showFallback(null); return { ok: false, reason: 'webgl' }; }
    let maps;
    try { [C, maps] = await Promise.all([loadCesium(), readMaps(opts)]); }
    catch (e) { showFallback(null); return { ok: false, reason: 'library' }; }
    if (dead) return { ok: false, reason: 'destroyed' };
    try { boot(maps || {}); }
    catch (e) {
      try { viewer && viewer.destroy(); } catch {}
      viewer = null; showFallback(null);
      return { ok: false, reason: 'webgl' };
    }
    return { ok: true, keyed };
  })();

  let tilesResolve;
  const tiles = new Promise((r) => { tilesResolve = r; });

  function boot(maps) {
    C.Ion.defaultAccessToken = '';                  // never fall back to Cesium's shared demo token
    const phone = isPhone();
    const gibs = (layer, ext, extra = '') => new C.UrlTemplateImageryProvider({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${extra}GoogleMapsCompatible_Level8/{z}/{y}/{x}.${ext}`,
      tilingScheme: new C.WebMercatorTilingScheme(), maximumLevel: 8,
      credit: new C.Credit('Imagery: NASA GIBS', true),
    });
    const base = new C.ImageryLayer(gibs('BlueMarble_ShadedRelief_Bathymetry', 'jpeg'));

    viewer = new C.Viewer(stage, {
      baseLayer: base, terrainProvider: new C.EllipsoidTerrainProvider(),
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
      vrButton: false, projectionPicker: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
      useBrowserRecommendedResolution: false, msaaSamples: phone ? 1 : 4,
      contextOptions: { webgl: { alpha: false, antialias: false, powerPreference: 'high-performance' } },
    });
    const scene = viewer.scene, globe = scene.globe;

    // pixel ratio cap: 1.5 on phones, 2 elsewhere
    const dpr = window.devicePixelRatio || 1;
    viewer.resolutionScale = Math.min(dpr, phone ? 1.5 : 2) / dpr;

    // night lights on the dark side, US orthoimagery up close
    const night = viewer.imageryLayers.addImageryProvider(gibs('VIIRS_Black_Marble', 'png', '2016-01-01/'));
    night.dayAlpha = 0.0; night.nightAlpha = 1.0; night.brightness = 2.4;
    const usgs = viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({
      url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
      tilingScheme: new C.WebMercatorTilingScheme(), minimumLevel: 6, maximumLevel: 16,
      rectangle: C.Rectangle.fromDegrees(...US48),
      credit: new C.Credit('USDA, USGS The National Map', true),
    }));
    usgs.alpha = 0;                                  // faded in on the way down (see tick); no requests while 0
    usgsLayer = usgs;

    // time-of-day sun, atmosphere; lighting fades out near the ground so towns read in daylight
    viewer.clock.shouldAnimate = false;
    viewer.clock.currentTime = C.JulianDate.now();
    globe.enableLighting = true;
    globe.dynamicAtmosphereLighting = true;
    globe.showGroundAtmosphere = true;
    globe.lightingFadeOutDistance = 1.2e6; globe.lightingFadeInDistance = 4.5e6;
    globe.baseColor = C.Color.fromCssColorString('#0b1a2c');
    globe.maximumScreenSpaceError = phone ? 2.5 : 1.5;
    scene.skyAtmosphere.show = true;
    scene.fog.enabled = true;
    scene.highDynamicRange = false;
    scene.backgroundColor = C.Color.fromCssColorString('#04070c');
    scene.screenSpaceCameraController.minimumZoomDistance = 150;
    scene.screenSpaceCameraController.maximumZoomDistance = 3.0e7;

    viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(START.lon, START.lat, START.height) });

    scene.preRender.addEventListener(tick);
    scene.postRender.addEventListener(guard);

    // any manual input stops a running command
    const cancelOnInput = () => { if (anim || pendingNext) stop(); };
    on(viewer.canvas, 'pointerdown', cancelOnInput);
    on(viewer.canvas, 'wheel', cancelOnInput, { passive: true });
    on(viewer.canvas, 'touchstart', cancelOnInput, { passive: true });
    on(document, 'visibilitychange', () => setPaused(document.hidden));
    if (document.hidden) setPaused(true);

    // credit bar height feeds the CSS so the card and controls never cover the attribution
    const credits = viewer.cesiumWidget.creditContainer;
    if (credits && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(() => root.style.setProperty('--gx-credit-h', Math.ceil(credits.getBoundingClientRect().height) + 'px'));
      ro.observe(credits); listeners.push(() => ro.disconnect());
    }

    // photorealistic tiles, only with a configured key; one tileset for the life of this globe
    const gKey = str(maps.google3dTilesKey, 200), ionTok = str(maps.cesiumIonToken, 2000);
    if (gKey || ionTok) {
      keyed = true;
      loadTiles(gKey, ionTok).then((r) => tilesResolve(r));
    } else tilesResolve({ route: 'none' });
    scene.requestRender();
  }

  async function loadTiles(gKey, ionTok) {
    const attempts = [];
    // Google's CesiumJS route: root tileset with ?key=, showCreditsOnScreen (Google logo via GoogleMaps default credit)
    if (gKey) attempts.push(['google', () => C.createGooglePhotorealistic3DTileset(
      { key: gKey, onlyUsingWithGoogleGeocoder: true },   // this globe has no geocoder of any kind
      { showCreditsOnScreen: true, maximumScreenSpaceError: isPhone() ? 24 : 16 })]);
    if (ionTok) attempts.push(['ion', async () => C.Cesium3DTileset.fromUrl(
      await C.IonResource.fromAssetId(ION_GOOGLE_ASSET, { accessToken: ionTok }),
      { showCreditsOnScreen: true, maximumScreenSpaceError: isPhone() ? 24 : 16 })]);
    const errors = [];
    for (const [name, make] of attempts) {
      try {
        const ts = await make();
        if (dead) { try { ts.destroy(); } catch {} return { route: 'none' }; }
        tileset = viewer.scene.primitives.add(ts);
        // Google's guide and FAQ: the tiles carry their own ground; no Cesium globe or terrain beneath them
        viewer.scene.globe.show = false;
        route = name;
        if (name === 'google') {
          // Google's logo stays on screen for as long as its tiles are shown, not only while a tile carries it
          const logo = C.GoogleMaps.getDefaultCredit();
          logo.showOnScreen = true;
          viewer.creditDisplay.addStaticCredit(logo);
        }
        for (const p of pins.concat(markEntities)) if (p) setClamp(p);
        viewer.scene.requestRender();
        return { route: name };
      } catch (e) { errors.push(String(e && e.message || e)); }
    }
    route = 'none';
    return { route: 'none', errors };
  }

  function setClamp(entity) {
    // a pin on a drawn building sits on its roof, whatever the ground is
    const ref = entity._onRoof ? C.HeightReference.RELATIVE_TO_GROUND : tileset ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE;
    if (entity.billboard) entity.billboard.heightReference = ref;
    if (entity.label) entity.label.heightReference = ref;
  }

  function setPaused(p) {
    paused = !!p;
    if (viewer && !viewer.isDestroyed()) viewer.useDefaultRenderLoop = !paused;
    if (!paused) lastFrame = 0;
  }

  /* ── per-frame ── */
  function tick() {
    const now = performance.now();
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (usgsLayer) {
      // US orthoimagery only near the ground: no seam on the globe from orbit, no tiles fetched up there
      const h = viewer.camera.positionCartographic.height;
      usgsLayer.alpha = clamp01((2.5e6 - h) / 1.5e6);
    }
    if (anim) {
      const more = anim.tick(dt);
      if (!more) { const a = anim; anim = null; a.done && a.done(); }
    }
    viewer.scene.requestRenderMode = !anim;
    if (anim) viewer.scene.requestRender();
  }

  function heightAboveGround() {
    const c = viewer.camera.positionCartographic;
    return c.height - groundM;
  }

  function guard() {
    if (!viewer || viewer.isDestroyed()) return;
    const h = heightAboveGround();
    if (floorM > 0 && h < stats.minHeightAbove) stats.minHeightAbove = h;
    if (floorM > 0 && h < floorM - 1) {
      // lift the camera straight up to the floor, keeping where it looks
      const cam = viewer.camera, c = cam.positionCartographic;
      const hpr = { heading: cam.heading, pitch: cam.pitch, roll: 0 };
      cam.lookAtTransform(C.Matrix4.IDENTITY);
      cam.setView({ destination: C.Cartesian3.fromRadians(c.longitude, c.latitude, groundM + floorM), orientation: hpr });
      viewer.scene.requestRender();
    }
  }

  function groundAt(lon, lat) {
    const carto = C.Cartographic.fromDegrees(lon, lat);
    try {
      if (tileset && viewer.scene.sampleHeightSupported) {
        const h = viewer.scene.sampleHeight(carto);
        if (isFinite(h)) return h;
      }
      const g = viewer.scene.globe.show ? viewer.scene.globe.getHeight(carto) : undefined;
      return isFinite(g) ? g : 0;
    } catch { return 0; }
  }

  /* ── camera moves ── */

  function lookTarget() {
    const cam = viewer.camera, canvas = viewer.canvas;
    const mid = new C.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    let p = cam.pickEllipsoid(mid, C.Ellipsoid.WGS84);
    if (!p) p = C.Ellipsoid.WGS84.scaleToGeodeticSurface(cam.positionWC, new C.Cartesian3());
    const range = C.Cartesian3.distance(cam.positionWC, p);
    return { p, range, heading: cam.heading, pitch: cam.pitch };
  }

  function viewFor(step) {
    const px = Math.max(viewer.canvas.clientWidth, viewer.canvas.clientHeight) || 1024;
    const fov = (viewer.camera.frustum && viewer.camera.frustum.fov) || Math.PI / 3;
    // a site step's zoom is on the 512-pixel tile scale its ceiling is written in (assets/mapcmd.js, MapLibre): one level closer here
    const h = Math.max(step.floor + 50, heightForZoom(step.kind === 'site' ? step.zoom + 1 : step.zoom, step.lat, px, fov));
    const pitch = -C.Math.toRadians(90 - step.pitch);
    const range = h / Math.sin(-pitch);
    return { h, pitch, range, heading: C.Math.toRadians(step.bearing) };
  }

  function flight(step, token) {
    return new Promise((resolve) => {
      const from = lookTarget();
      groundM = groundAt(step.lon, step.lat);
      const to = C.Cartesian3.fromDegrees(step.lon, step.lat, groundM);
      const v = viewFor(step);
      const a = C.Cartesian3.normalize(from.p, new C.Cartesian3());
      const b = C.Cartesian3.normalize(to, new C.Cartesian3());
      const ang = Math.acos(Math.min(1, Math.max(-1, C.Cartesian3.dot(a, b))));
      const distKm = ang * 6371;
      floorM = step.floor;
      const target = new C.Cartesian3();
      const hpr = new C.HeadingPitchRange();
      const place = (u, t) => {
        // great circle: slerp of the two surface directions
        const s = Math.sin(ang);
        const w1 = s < 1e-6 ? 1 - u : Math.sin((1 - u) * ang) / s;
        const w2 = s < 1e-6 ? u : Math.sin(u * ang) / s;
        C.Cartesian3.add(C.Cartesian3.multiplyByScalar(a, w1, new C.Cartesian3()), C.Cartesian3.multiplyByScalar(b, w2, new C.Cartesian3()), target);
        C.Ellipsoid.WGS84.scaleToGeodeticSurface(target, target);
        const carto = C.Cartographic.fromCartesian(target);
        const tgt = C.Cartesian3.fromRadians(carto.longitude, carto.latitude, groundM * u);
        // range: log-interpolated, lifted to a cruise height on long hops
        const r0 = Math.max(from.range, 1), r1 = v.range;
        const cruise = Math.max(r0, r1, distKm * 1000 * 0.9);
        const lift = Math.log(cruise / Math.max(r0, r1)) * Math.pow(Math.sin(Math.PI * t), 1.4);
        hpr.range = Math.exp(lerp(Math.log(r0), Math.log(r1), u) + lift);
        // look straight down while cruising, tilt to oblique on the descent
        const p0 = from.pitch, pTop = -C.Math.toRadians(88);
        hpr.pitch = t < 0.5 ? lerp(p0, pTop, win(t, 0, 0.3)) : lerp(pTop, v.pitch, win(t, 0.55, 1));
        hpr.heading = from.heading + shortAngle(from.heading, v.heading) * u;
        viewer.camera.lookAt(tgt, hpr);
      };
      if (reducedMotion()) {
        stats.cuts++;
        place(1, 1);
        viewer.scene.requestRender();
        resolve({ target: to, view: v });
        return;
      }
      stats.flights++;
      const dur = Math.min(7.5, Math.max(2.8, 2.4 + Math.log10(1 + distKm) * 1.25));
      let t = 0;
      anim = {
        tick(dt) {
          if (token !== runToken) return false;
          t = Math.min(1, t + dt / dur);
          place(smoother(t), t);
          return t < 1;
        },
        done() { resolve({ target: to, view: v }); },
      };
      viewer.scene.requestRender();
    });
  }

  function hold(at, step, token) {
    return new Promise((resolve) => {
      const hpr = new C.HeadingPitchRange(at.view.heading, at.view.pitch, at.view.range);
      let left = step.hold_ms / 1000;
      const finish = () => { pendingNext = null; btnNext.hidden = true; resolve(); };
      pendingNext = () => { left = 0; if (!anim) finish(); };
      btnNext.hidden = false;
      if (reducedMotion()) {
        // no orbit; the card stays until the time is up or Next
        const tm = { left };
        anim = {
          tick(dt) { if (token !== runToken) return false; if (!paused && !userPaused) tm.left -= dt; return tm.left > 0 && left > 0; },
          done: finish,
        };
        viewer.scene.requestRender();
        return;
      }
      anim = {
        tick(dt) {
          if (token !== runToken) return false;
          if (userPaused) return left > 0;     // the card stays, the camera holds still
          left -= dt;
          hpr.heading += C.Math.toRadians(ORBIT_DEG_S) * dt;
          viewer.camera.lookAt(at.target, hpr);
          return left > 0;
        },
        done: finish,
      };
      viewer.scene.requestRender();
    });
  }

  function release() {
    if (viewer && !viewer.isDestroyed()) viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  }

  function stop() {
    runToken++;
    const a = anim; anim = null;
    if (a && a.done) a.done();                    // settles the waiting flight or hold; the run sees the new token
    if (pendingNext) { const p = pendingNext; pendingNext = null; p(); }
    btnNext.hidden = true;
    release();
    if (viewer && !viewer.isDestroyed()) {
      // the floor stays while an address is on screen; manual zoom cannot pass it either
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = Math.max(150, floorM);
      viewer.scene.requestRenderMode = true; viewer.scene.requestRender();
    }
  }

  function home() {
    if (!viewer) return;
    floorM = 0; groundM = 0; current = null; stepIndex = -1;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 150;
    const dest = C.Cartesian3.fromDegrees(START.lon, START.lat, START.height);
    if (reducedMotion()) viewer.camera.setView({ destination: dest });
    else viewer.camera.flyTo({ destination: dest, duration: 2.5 });
    viewer.scene.requestRender();
  }

  /* ── pins and card ── */

  function addPin(step, n) {
    const roof = step.outline ? step.height_m || 8 : 0;
    const e = viewer.entities.add({
      position: C.Cartesian3.fromDegrees(step.lon, step.lat, roof),
      billboard: {
        image: pinCanvas(String(n), '#f0874a', 34), verticalOrigin: C.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY, scale: 1,
      },
      label: {
        text: step.label || '', font: '600 14px Inter, system-ui, sans-serif',
        fillColor: C.Color.WHITE, showBackground: true,
        backgroundColor: C.Color.fromCssColorString('rgba(10,14,20,0.82)'), backgroundPadding: new C.Cartesian2(8, 5),
        verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -50),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: undefined,
      },
    });
    if (roof) { e._onRoof = true; e._pinScale = 0.7; e.billboard.scale = 0.7; e.label.pixelOffset = new C.Cartesian2(0, -36); }
    setClamp(e);
    return e;
  }

  function addMark(m) {
    const e = viewer.entities.add({
      position: C.Cartesian3.fromDegrees(m.lon, m.lat, 0),
      billboard: { image: pinCanvas('', '#6aa2ff', 22), verticalOrigin: C.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: m.label ? {
        text: m.label, font: '500 12px Inter, system-ui, sans-serif', fillColor: C.Color.WHITE, showBackground: true,
        backgroundColor: C.Color.fromCssColorString('rgba(10,14,20,0.72)'), backgroundPadding: new C.Cartesian2(6, 4),
        verticalOrigin: C.VerticalOrigin.BOTTOM, pixelOffset: new C.Cartesian2(0, -32),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new C.NearFarScalar(2.0e6, 1.0, 8.0e6, 0.0),
      } : undefined,
    });
    setClamp(e);
    return e;
  }

  /* a real address: the outline extruded to its height (roof edge dashed when the height is likely), the parcel edge */
  function addSite(step) {
    const out = [];
    const g = groundAt(step.lon, step.lat);
    const pos = (ring, h) => C.Cartesian3.fromDegreesArrayHeights(ring.concat([ring[0]]).flatMap(([x, y]) => [x, y, h]));
    if (step.parcel) {
      out.push(viewer.entities.add({ polyline: { positions: pos(step.parcel, g + 0.3), width: 2,
        material: C.Color.fromCssColorString('#ffd479').withAlpha(0.95), arcType: C.ArcType.NONE } }));
    }
    if (step.outline) {
      const h = step.height_m || 8, likely = step.height_basis !== 'public';
      out.push(viewer.entities.add({ polygon: {
        hierarchy: C.Cartesian3.fromDegreesArray(step.outline.flat()), height: g, extrudedHeight: g + h,
        material: C.Color.fromCssColorString('#f0874a').withAlpha(likely ? 0.42 : 0.62), outline: false, perPositionHeight: false } }));
      out.push(viewer.entities.add({ polyline: { positions: pos(step.outline, g + 0.3), width: 3, material: C.Color.WHITE, arcType: C.ArcType.NONE } }));
      out.push(viewer.entities.add({ polyline: { positions: pos(step.outline, g + h), width: 2, arcType: C.ArcType.NONE,
        material: likely ? new C.PolylineDashMaterialProperty({ color: C.Color.WHITE, dashLength: 10 }) : C.Color.WHITE } }));
    }
    return out;
  }
  function clearSites() {
    if (!viewer || viewer.isDestroyed()) { siteEntities = []; return; }
    for (const e of siteEntities) viewer.entities.remove(e);
    siteEntities = [];
  }

  function highlight(i) {
    pins.forEach((p, k) => { if (p) p.billboard.scale = (p._pinScale || 1) * (k === i ? 1.25 : 0.9); });
  }

  function showCard(step, i, n, title) {
    const head = [title, n > 1 ? `${i + 1} of ${n}` : ''].filter(Boolean).join(' · ');
    const kids = [];
    if (head) kids.push(el('div', { class: 'sys-card-label', text: head }));
    kids.push(el('h3', { class: 'sys-card-title gx-card-title', text: step.label || '' }));
    if (step.sub) kids.push(el('p', { class: 'gx-sub', text: step.sub }));
    if (step.figures.length) kids.push(el('dl', { class: 'gx-figs' }, step.figures.map(([k, v]) =>
      el('div', { class: 'gx-fig' }, [el('dt', { class: 'sys-kpi-label', text: k }), el('dd', { class: 'gx-fig-v', text: v })]))));
    if (step.kind === 'address') kids.push(el('div', { class: 'sys-chips' }, [el('span', { class: 'sys-chip sys-chip--warn gx-example', text: 'Example address' })]));
    if (step.href) kids.push(el('div', { class: 'sys-card-foot' }, [el('a', { href: step.href, class: 'gx-open', text: 'Open' })]));
    card.replaceChildren(...kids);
    card.hidden = false;
    live.textContent = [step.label, step.sub].filter(Boolean).join(', ');
  }

  function clearPins() {
    if (!viewer || viewer.isDestroyed()) return;
    for (const p of pins) if (p) viewer.entities.remove(p);
    pins = [];
  }

  /* ── public ── */

  async function playStep(step, i, n, title, token) {
    current = step; stepIndex = i;
    highlight(i);
    try { opts.onStop && opts.onStop(i, step); } catch {}
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = Math.max(150, step.floor);
    card.hidden = true;
    const at = await flight(step, token);
    if (token !== runToken) return false;
    showCard(step, i, n, title);
    await hold(at, step, token);
    return token === runToken;
  }

  async function play(from) {
    const c = cmdNow, token = runToken;
    for (let i = from; i < c.steps.length; i++) {
      if (reducedMotion() && viaTown(c.steps[i], c.steps[i + 1])) continue;
      const ok = await playStep(c.steps[i], i, c.steps.length, c.title, token);
      if (!ok) return { done: false };
    }
    if (token === runToken) {
      release(); viewer.scene.requestRenderMode = true; viewer.scene.requestRender();
      try { opts.onEnd && opts.onEnd(); } catch {}
    }
    return { done: token === runToken };
  }

  const api = {
    ready, tiles,
    get _root() { return root; },
    get _dead() { return dead; },
    get _viewer() { return viewer; },

    async run(cmd) {
      const c = cleanCommand(cmd);
      cmdNow = c;
      const r = await ready;
      if (dead) return { done: false };
      if (!r.ok) { showFallback(c); return { done: false, fallback: true }; }
      stop();
      clearPins(); clearSites();
      card.hidden = true;
      root.dataset.source = c.source || '';
      if (c.marks.length) api.mark(c.marks);
      // a town step that only stages its own address gets no pin of its own (the two would sit on one spot)
      pins = c.steps.map((s, k) => (viaTown(s, c.steps[k + 1]) ? null : addPin(s, k + 1)));
      for (const s of c.steps) if (s.kind === 'site') siteEntities.push(...addSite(s));
      return play(0);
    },

    /** Play the current command from stop i (the screen's stop list and its Previous and Next). */
    goTo(i) { if (cmdNow && cmdNow.steps[i] && viewer) { stop(); userPaused = false; play(i); } },
    next() { if (!cmdNow) return; if (pendingNext && stepIndex >= 0 && stepIndex < cmdNow.steps.length - 1) { userPaused = false; pendingNext(); } else api.goTo(Math.min(cmdNow.steps.length - 1, stepIndex + 1)); },
    prev() { if (cmdNow) api.goTo(Math.max(0, stepIndex - 1)); },
    pause() { userPaused = true; if (viewer) viewer.scene.requestRender(); },
    resume() { userPaused = false; if (viewer) viewer.scene.requestRender(); },
    home() { api.clear(); home(); },

    get index() { return stepIndex; },

    async fly(step) {
      const s = cleanStep(step);
      const r = await ready;
      if (!s || dead || !r.ok) return { done: false };
      stop();
      const token = runToken;
      clearPins();
      pins = [addPin(s, 1)];
      const ok = await playStep(s, 0, 1, '', token);
      release();
      return { done: ok };
    },

    async mark(points) {
      const r = await ready;
      if (dead || !r.ok) return 0;
      for (const m of markEntities) viewer.entities.remove(m);
      markEntities = cleanCommand({ marks: points }).marks.map(addMark);
      viewer.scene.requestRender();
      return markEntities.length;
    },

    clear() {
      if (!viewer) { card.hidden = true; return; }
      stop();
      clearPins(); clearSites(); stepIndex = -1; userPaused = false;
      for (const m of markEntities) viewer.entities.remove(m);
      markEntities = [];
      card.hidden = true;
      current = null;
      viewer.scene.requestRender();
    },

    mode(name) {
      const id = MODES.some((m) => m.id === name) ? name : 'natural';
      currentMode = id;
      for (const b of modes.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', b.dataset.mode === id ? 'true' : 'false');
      if (!viewer || viewer.isDestroyed()) return id;
      for (const [k, st] of Object.entries(stages)) st.enabled = k === id;
      if (id !== 'natural' && !stages[id]) {
        try {
          stages[id] = viewer.scene.postProcessStages.add(new C.PostProcessStage({ name: 'gx_' + id, fragmentShader: SHADERS[id] }));
          stages[id].enabled = true;
        } catch { /* a shader this GPU cannot take: stay natural */ }
      }
      root.dataset.mode = id;
      viewer.scene.requestRender();
      return id;
    },

    state() {
      const out = { ready: !!viewer, keyed, route, mode: currentMode, paused, running: !!anim || !!pendingNext,
        floor: floorM, ground: groundM, userPaused, index: stepIndex, siteEntities: siteEntities.length,
        precision: current ? current.precision || null : null, flights: stats.flights, cuts: stats.cuts,
        minHeightAboveDuringFloor: isFinite(stats.minHeightAbove) ? stats.minHeightAbove : null,
        step: current ? current.label : null };
      if (viewer && !viewer.isDestroyed()) {
        out.height = viewer.camera.positionCartographic.height;
        out.heightAboveGround = heightAboveGround();
        out.resolutionScale = viewer.resolutionScale;
        out.canvasScale = viewer.canvas.width / Math.max(1, viewer.canvas.clientWidth);
        out.globeShown = viewer.scene.globe.show;
        out.sitesDrawn = siteEntities.length > 0 && viewer.dataSourceDisplay.ready;
        out.tilesLoaded = viewer.scene.globe.show ? viewer.scene.globe.tilesLoaded : !!(tileset && tileset.tilesLoaded);
      }
      return out;
    },

    destroy() {
      if (dead) return;
      dead = true;
      runToken++; anim = null; pendingNext = null;
      for (const off of listeners.splice(0)) { try { off(); } catch {} }
      if (viewer && !viewer.isDestroyed()) {
        const canvas = viewer.canvas;
        let gl = null;
        try { gl = viewer.scene.context._gl; } catch {}
        try { viewer.destroy(); } catch {}
        try { const ext = gl && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch {}
        try { canvas.width = 1; canvas.height = 1; } catch {}
      }
      viewer = null; tileset = null;
      root.remove();
      if (shared === api) shared = null;
    },
  };

  if (opts.listen) {
    on(window, 'bsp:map', (e) => { if (e && e.detail) api.run(e.detail); });
  }
  if (opts.mode) api.mode(opts.mode);
  return api;
}

export default createGlobe;
