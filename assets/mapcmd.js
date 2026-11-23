/* Broad Sky OS map command bus: one contract any part of the product can use to steer the globe, without importing
   the engine (assets/godseye.js) or the screen (modules/globe.js).

   Send a command either way:
     window.dispatchEvent(new CustomEvent('bsp:map', { detail: {
       title: 'Best 3 add-on targets',
       steps: [ { lat, lon, label, sub, figures: [[name, value, 'est'?]…], reason, href, link, zoom, pitch, bearing, hold_ms, kind } … ],
       marks: [ { lat, lon, label } … ],
       source: 'Hand-researched list · est.' } }))
     MapCmd.run(cmd)                       // same thing; returns the cleaned command, or null when it was refused
   A prepared tour by id:  MapCmd.run({ tour: 'best3' })
   Deep links:             #/globe/view?tour=<id>   and   #/globe/view?lat=…&lon=…&label=…[&kind=address][&zoom=…]
   If the globe screen is not open, the command is kept and the screen is opened; it runs the command when it mounts.

   Rules (validate): numbers in range, at most 12 steps and 40 marks, labels under 60 characters, links that stay on
   this site (a hash address, or app.html with a hash). A step with kind 'address' always reads "Example address"
   and never comes closer than street level. */

export const EVENT = 'bsp:map';
export const MAX_STEPS = 12, MAX_MARKS = 40, MAX_LABEL = 59;
export const STREET_ZOOM = 17;            // the closest any 'address' step may come
const MAX_ZOOM = 18.5, MIN_ZOOM = 0;
const HOLD = [1500, 20000];
const GLOBE_HASH = '#/globe/view';

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

function cleanStep(s, errors, i) {
  if (!s || typeof s !== 'object') { errors.push(`step ${i + 1}: not an object`); return null; }
  const lat = numIn(s.lat, -85, 85), lon = numIn(s.lon, -180, 180);
  if (lat == null || lon == null) { errors.push(`step ${i + 1}: lat or lon out of range`); return null; }
  const address = s.kind === 'address';
  const out = {
    lat, lon, kind: address ? 'address' : 'place',
    label: address ? 'Example address' : str(s.label, MAX_LABEL) || 'Place',
    sub: str(s.sub, 80), reason: str(s.reason, 120),
    zoom: clampN(s.zoom, MIN_ZOOM, address ? STREET_ZOOM : MAX_ZOOM, address ? STREET_ZOOM : 12.5),
    pitch: clampN(s.pitch, 0, 75, address ? 60 : 55), bearing: clampN(s.bearing, -360, 360, null),
    hold_ms: clampN(s.hold_ms, HOLD[0], HOLD[1], 6000),
    figures: (Array.isArray(s.figures) ? s.figures : []).slice(0, 4).filter(f => Array.isArray(f) && f.length >= 2).map(f => [str(f[0], 24), str(f[1], 24), f[2] === 'est' ? 'est' : null]),
    href: safeHref(s.href), link: str(s.link, 28), co: /^(cet|pp|fl|ts|bpi|fh)$/.test(s.co || '') ? s.co : null,
  };
  if (address) out.zoom = Math.min(out.zoom, STREET_ZOOM);   // never closer than street level
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
    const v = validate({ title: p.label || '', steps: [{ lat: p.lat, lon: p.lon, label: p.label, kind: p.kind, zoom: p.zoom, pitch: p.pitch, bearing: p.bearing }] });
    return v.ok ? v.cmd : null;
  }
  return null;
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

/** Run a command: steer the open globe, or open the globe and run it there. Returns the cleaned command or null. */
export function run(raw) {
  const v = validate(raw);
  if (!v.ok) { console.warn('[map] command refused:', v.errors.join('; ')); return null; }
  if (v.errors.length) console.warn('[map]', v.errors.join('; '));
  if (isOpen()) window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...v.cmd, _clean: true } }));
  else park(v.cmd);
  return v.cmd;
}

// a 'bsp:map' event sent while the globe is closed opens it (the open screen listens for itself)
if (typeof window !== 'undefined' && !window.__bspMapBus) {
  window.__bspMapBus = true;
  window.addEventListener(EVENT, e => { if (isOpen() || e.detail?._clean) return; const v = validate(e.detail); if (v.ok) park(v.cmd); });
}

export const MapCmd = { EVENT, run, validate, fromAddress, safeHref, takePending, MAX_STEPS, STREET_ZOOM };
if (typeof window !== 'undefined') window.MapCmd = MapCmd;
export default MapCmd;
