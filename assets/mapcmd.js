/* Broad Sky OS map command bus: one contract any part of the product can use to steer the globe, without importing
   a renderer (assets/godseye.js, assets/godseye-cesium.js) or the screen (modules/globe.js).

   Send a command any of these ways:
     window.dispatchEvent(new CustomEvent('bsp:map', { detail: {
       title: 'Best 3 add-on targets',
       steps: [ { lat, lon, label, sub, figures: [[name, value, 'est'?]…], reason, href, link, zoom, pitch, bearing, hold_ms, kind } … ],
       marks: [ { lat, lon, label } … ],
       source: 'Hand-researched list · est.' } }))
     MapCmd.run(cmd)                       // same thing; returns the cleaned command, or null when it was refused
     parent.postMessage({ type: 'bsp:map', cmd }, location.origin)   // from a page embedded in the shell (same origin only)
   Inside an embedded page MapCmd.run(cmd) posts to the shell itself, so the agent page can simply call it.
   A prepared tour by id:  MapCmd.run({ tour: 'best3' })
   A live address card:    MapCmd.run(MapCmd.site(card))   // town level, then down to the building (see site())
   Deep links:             #/globe/view?tour=<id>   and   #/globe/view?lat=…&lon=…&label=…[&kind=site&precision=typed][&zoom=…]
   If the globe screen is not open, the command is kept and the screen is opened; it runs the command when it mounts.

   Step kinds
     place    (default) a town, a company, a target.
     site     a real address a visitor typed. The label is the typed address. How close the camera may come is set by
              how well the point is known: precision 'parcel' zoom 19, 'typed' 16.5, 'town' 12.5 (missing or unknown
              precision counts as 'town'). Only 'parcel' keeps an outline (≤ 48 [lon, lat]), a parcel edge (≤ 40) and a
              height (height_m, height_basis 'public' | 'likely'). front_deg (the compass direction the front wall faces)
              sets the camera to look at the front when no bearing is given.
     address  an example record inside a company's own system only: always reads "Example address", never closer than
              street level (zoom 17).

   Rules (validate): numbers in range, at most 12 steps and 40 marks, labels under 60 characters, links that stay on
   this site (a hash address, or app.html with a hash). Every cleaned step carries `ceiling`, the closest zoom any
   renderer may show for it (manual zoom included). */

export const EVENT = 'bsp:map';
export const MAX_STEPS = 12, MAX_MARKS = 40, MAX_LABEL = 59;
export const STREET_ZOOM = 17;            // the closest any 'address' step may come
/** The closest zoom for a 'site' step, by how well its point is known. */
export const SITE_CEILING = Object.freeze({ parcel: 19, typed: 16.5, town: 12.5 });
export const MAX_OUTLINE = 48, MAX_PARCEL = 40;
const SITE_ZOOM = { parcel: 18.5, typed: 16.5, town: 12 };   // where a site step lands when it names no zoom
const SITE_PITCH = { parcel: 60, typed: 50, town: 40 };
const MAX_ZOOM = 18.5, MIN_ZOOM = 0, FREE_CEILING = 22;
const HOLD = [1500, 20000];
const GLOBE_HASH = '#/globe/view';
const RING_REACH = 0.01;                  // degrees: every outline point within about a kilometre of the step

const str = (v, n) => { const s = String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const numIn = (v, a, b) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) && n >= a && n <= b ? n : null; };
const clampN = (v, a, b, d) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };

/** A link must stay on this site: '#/…' or 'app.html#/…'. Anything else is dropped. */
export function safeHref(h) {
  const s = String(h ?? '').trim();
  if (/^#\/[\w\-./?=&%+,:~]*$/.test(s)) return s;
  const m = /^(?:\.?\/)?app\.html(#\/[\w\-./?=&%+,:~]*)$/.exec(s);
  return m ? m[1] : null;
}

/** A ring of [lon, lat] pairs near (lon0, lat0): at least 3 points, at most `max`, else null. */
function cleanRing(r, lon0, lat0, max) {
  if (!Array.isArray(r)) return null;
  const pts = [];
  for (const p of r.slice(0, max + 1)) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const lon = numIn(p[0], -180, 180), lat = numIn(p[1], -85, 85);
    if (lon == null || lat == null || Math.abs(lon - lon0) > RING_REACH || Math.abs(lat - lat0) > RING_REACH) return null;
    pts.push([lon, lat]);
  }
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) pts.pop(); }   // an explicitly closed ring
  return pts.length >= 3 && pts.length <= max ? pts : null;
}

function cleanStep(s, errors, i) {
  if (!s || typeof s !== 'object') { errors.push(`step ${i + 1}: not an object`); return null; }
  const lat = numIn(s.lat, -85, 85), lon = numIn(s.lon, -180, 180);
  if (lat == null || lon == null) { errors.push(`step ${i + 1}: lat or lon out of range`); return null; }
  const kind = s.kind === 'address' ? 'address' : s.kind === 'site' ? 'site' : 'place';
  const address = kind === 'address', site = kind === 'site';
  const precision = site ? (Object.hasOwn(SITE_CEILING, s.precision) ? s.precision : 'town') : null;
  const ceiling = address ? STREET_ZOOM : site ? SITE_CEILING[precision] : FREE_CEILING;
  const front = site ? clampN(s.front_deg, -360, 360, null) : null;
  const out = {
    lat, lon, kind,
    label: address ? 'Example address' : str(s.label, MAX_LABEL) || (site ? 'Address' : 'Place'),
    sub: str(s.sub, 80), reason: str(s.reason, 120),
    zoom: clampN(s.zoom, MIN_ZOOM, address ? STREET_ZOOM : site ? ceiling : MAX_ZOOM, address ? STREET_ZOOM : site ? SITE_ZOOM[precision] : 12.5),
    pitch: clampN(s.pitch, 0, 75, address ? 60 : site ? SITE_PITCH[precision] : 55),
    bearing: clampN(s.bearing, -360, 360, front != null ? (front + 180) % 360 : null),
    hold_ms: clampN(s.hold_ms, HOLD[0], HOLD[1], 6000),
    figures: (Array.isArray(s.figures) ? s.figures : []).slice(0, 4).filter(f => Array.isArray(f) && f.length >= 2).map(f => [str(f[0], 24), str(f[1], 24), f[2] === 'est' ? 'est' : null]),
    href: safeHref(s.href), link: str(s.link, 28), co: /^(cet|pp|fl|ts|bpi|fh)$/.test(s.co || '') ? s.co : null,
    ceiling,
  };
  out.zoom = Math.min(out.zoom, ceiling);   // never closer than the kind and precision allow
  if (site) {
    out.precision = precision;
    if (precision === 'parcel') {
      const outline = cleanRing(s.outline, lon, lat, MAX_OUTLINE), parcel = cleanRing(s.parcel, lon, lat, MAX_PARCEL);
      if (s.outline != null && !outline) errors.push(`step ${i + 1}: outline dropped`);
      if (s.parcel != null && !parcel) errors.push(`step ${i + 1}: parcel edge dropped`);
      if (outline) {
        out.outline = outline;
        out.height_m = clampN(s.height_m, 2, 120, 8);
        out.height_basis = s.height_basis === 'public' && numIn(s.height_m, 2, 120) != null ? 'public' : 'likely';
      }
      if (parcel) out.parcel = parcel;
    } else if (s.outline != null || s.parcel != null) errors.push(`step ${i + 1}: no outline below parcel precision`);
  }
  return out;
}

/** Clean a command. Returns { ok, cmd, errors }. A command is a prepared tour ({ tour }) or a list of steps. */
export function validate(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, cmd: null, errors: ['not an object'] };
  if (raw.tour != null) {
    const id = String(raw.tour);
    if (!/^[a-z0-9-]{1,40}$/.test(id)) return { ok: false, cmd: null, errors: ['bad tour id'] };
    return { ok: true, cmd: { tour: id }, errors };
  }
  const stepsIn = Array.isArray(raw.steps) ? raw.steps : [];
  if (stepsIn.length > MAX_STEPS) errors.push(`more than ${MAX_STEPS} steps: the rest are dropped`);
  const steps = stepsIn.slice(0, MAX_STEPS).map((s, i) => cleanStep(s, errors, i)).filter(Boolean);
  const marks = (Array.isArray(raw.marks) ? raw.marks : []).slice(0, MAX_MARKS).map(m => {
    const lat = numIn(m?.lat, -85, 85), lon = numIn(m?.lon, -180, 180);
    return lat == null || lon == null ? null : { lat, lon, label: str(m.label, MAX_LABEL) };
  }).filter(Boolean);
  if (!steps.length && !marks.length) return { ok: false, cmd: null, errors: [...errors, 'no usable step or mark'] };
  return { ok: true, errors, cmd: { title: str(raw.title, 60) || (steps[0]?.label ?? 'Places'), steps, marks, source: str(raw.source, 140) } };
}

/** A command from the screen's address parameters, or null. */
export function fromAddress(params) {
  const p = params instanceof URLSearchParams ? Object.fromEntries(params) : (params || {});
  if (p.tour) return validate({ tour: p.tour }).cmd;
  if (p.lat != null && p.lon != null) {
    const v = validate({ title: p.label || '', steps: [{ lat: p.lat, lon: p.lon, label: p.label, kind: p.kind, precision: p.precision, zoom: p.zoom, pitch: p.pitch, bearing: p.bearing }] });
    return v.ok ? v.cmd : null;
  }
  return null;
}

/* ── a live address card to a command ─────────────────────────────────────── */
const R_EARTH = 6378137, DEG = 180 / Math.PI;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Local metres east and north of an origin to [lon, lat] (equirectangular, centimetres at one lot). */
function ringLL(ringM, o) {
  if (!Array.isArray(ringM) || !o) return null;
  const k = Math.cos(o.lat / DEG);
  const out = ringM.filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])).map(([x, y]) => [+(o.lon + x / (R_EARTH * k) * DEG).toFixed(7), +(o.lat + y / R_EARTH * DEG).toFixed(7)]);
  return out.length >= 3 ? out : null;
}
const monthYear = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || '')); return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };
/** "12 Elm St, Lititz, PA 17543" -> "Lititz, PA" (the town step's label). */
function townOf(label) {
  const parts = String(label || '').split(',').map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  return parts.slice(1).join(', ').replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
}

/**
 * The command for a live address card (`floor_sketch` from the site lookup, or the lookup's whole response, or
 * `{ place, building }`): one step from wherever the camera is to the town, then a `site` step down to the building,
 * facing the street side. With only a town known, one step. Returns null when the card carries no usable place.
 */
export function site(card) {
  if (!card || typeof card !== 'object') return null;
  if (Array.isArray(card.cards)) { const fs = card.cards.find(c => c?.kind === 'floor_sketch') || {}; card = { ...fs, place: fs.place || card.place }; }
  const p = card.place || {};
  const lat = numIn(p.lat, -85, 85), lon = numIn(p.lon, -180, 180);
  if (lat == null || lon == null) return null;
  const precision = Object.hasOwn(SITE_CEILING, p.precision) ? p.precision : 'town';
  const label = str(p.label || card.address, MAX_LABEL) || 'Address';
  const b = card.building || {};
  const origin = b.frame?.origin && numIn(b.frame.origin.lat, -85, 85) != null ? b.frame.origin : { lat, lon };
  const fp = b.footprint || {};
  const outline = precision === 'parcel' ? (fp.ring_ll || ringLL(fp.ring_m, origin)) : null;
  const parcel = precision === 'parcel' ? (b.parcel?.ring_ll || ringLL(b.parcel?.ring_m, origin)) : null;
  const hgt = b.height || {};
  const height = numIn(hgt.ridge_m, 2, 120) ?? numIn(hgt.eave_m, 2, 120);
  const heightBasis = hgt.basis === 'public' ? 'public' : 'likely';
  const storeys = b.storeys?.n ?? card.house?.stories;
  const storeysBasis = b.storeys?.basis || card.house?.stories_basis || 'likely';
  const year = card.house?.year, yearBasis = card.house?.year_basis || 'likely';
  const figures = [];
  if (year) figures.push(['Built', String(year), yearBasis === 'likely' ? 'est' : null]);
  if (storeys) figures.push(['Storeys', String(storeys), storeysBasis === 'likely' ? 'est' : null]);
  if (outline && height != null) figures.push(['Height', `${Math.round(height * 10) / 10} m`, heightBasis === 'likely' ? 'est' : null]);
  const dated = monthYear(fp.as_of);
  const sub = precision === 'parcel' ? `Parcel match${outline && dated ? ` · outline from imagery dated ${dated}` : ''}`
    : precision === 'typed' ? 'Street match · house not pinned' : 'Town only · house not found';
  const front = numIn(b.front?.bearing_deg, -360, 360);
  const step = { kind: 'site', lat, lon, label, sub, precision, figures, hold_ms: 8000 };
  if (front != null) step.front_deg = front;
  if (outline) { step.outline = outline.slice(0, MAX_OUTLINE); step.height_m = height ?? undefined; step.height_basis = heightBasis; }
  if (parcel) step.parcel = parcel.slice(0, MAX_PARCEL);
  const town = townOf(label);
  const steps = precision === 'town' ? [step]
    : [{ kind: 'site', lat, lon, label: town || label, precision: 'town', zoom: 12, pitch: 40, hold_ms: 1500 }, step];
  const v = validate({ title: label, steps, source: card.source_line || '' });
  return v.ok ? v.cmd : null;
}

/* the screen marks itself open; a command sent while it is closed waits here until it mounts */
let pending = null;
const isOpen = () => !!(typeof window !== 'undefined' && window.__bspGlobeOpen);
/** The command waiting for the screen (taken once). */
export function takePending() { const c = pending; pending = null; try { sessionStorage.removeItem('bsp-map-pending'); } catch { } return c; }
function park(cmd) {
  pending = cmd;
  try { sessionStorage.setItem('bsp-map-pending', JSON.stringify(cmd)); } catch { }
  if (!String(location.hash).startsWith(GLOBE_HASH)) location.hash = GLOBE_HASH;
}
try { const s = sessionStorage.getItem('bsp-map-pending'); if (s) pending = JSON.parse(s); } catch { }

/** The shell when this page is embedded in it (same origin), else null. */
function shellWindow() {
  try { if (typeof window === 'undefined' || window.parent === window) return null; return window.parent.location.origin === location.origin ? window.parent : null; } catch { return null; }
}

/** Run a command: steer the open globe, or open the globe and run it there. Inside an embedded page, hand it to the
 *  shell. Returns the cleaned command or null. */
export function run(raw) {
  const v = validate(raw);
  if (!v.ok) { console.warn('[map] command refused:', v.errors.join('; ')); return null; }
  if (v.errors.length) console.warn('[map]', v.errors.join('; '));
  const shell = shellWindow();
  if (shell) { shell.postMessage({ type: EVENT, cmd: v.cmd }, location.origin); return v.cmd; }
  if (isOpen()) window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...v.cmd, _clean: true } }));
  else park(v.cmd);
  return v.cmd;
}

if (typeof window !== 'undefined' && !window.__bspMapBus) {
  window.__bspMapBus = true;
  // a 'bsp:map' event sent while the globe is closed opens it (the open screen listens for itself)
  window.addEventListener(EVENT, e => { if (isOpen() || e.detail?._clean) return; const v = validate(e.detail); if (v.ok) park(v.cmd); });
  // a command posted by a page embedded in the shell (the agent): same origin only, the shape { type: 'bsp:map', cmd }
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || e.source === window) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.type !== EVENT || !d.cmd || typeof d.cmd !== 'object') return;
    if (shellWindow()) return;   // only the shell runs commands
    run(d.cmd);
  });
}

export const MapCmd = { EVENT, run, validate, fromAddress, site, safeHref, takePending, MAX_STEPS, STREET_ZOOM, SITE_CEILING };
if (typeof window !== 'undefined') window.MapCmd = MapCmd;
export default MapCmd;
