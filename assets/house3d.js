/* The 3D house for a service call, built only from a `floor_sketch` card (server/workspace.py sketch()).
   renderHouse3D(container, card, opts) draws it with three.js (loaded from unpkg, jsdelivr fallback, only when the view opens);
   houseGLB(card) returns the same model as a binary glTF file. Nothing here makes a network call besides loading the library.

   Two kinds of card:
   - A live card (a real typed address) carries `building` (design_live_address.md section 3): the footprint ring in local
     metres east and north of `building.frame.origin`, its oriented rectangle (`rot_deg`: the plan's +x axis points to compass
     bearing rot_deg + 90 and the plan's +y, towards the front when `front` is "bottom", to rot_deg + 180), the height, the storeys,
     the parcel ring and the outbuildings. The outline is public; the height and everything inside are likely unless the card
     says otherwise. The ring is extruded storey by storey, the parcel edge is drawn on the ground, and the rooms, inside walls,
     items and runs (laid out in the plan rectangle, floors[].w by .h feet) are fitted inside the real outline.
   - A card with no `building` (or whose place is known only to the town) draws as before: the footprint is a rectangle worked out
     from the floor area, so the shell is likely.
   - A large or non-residential building (`building.kind` "large", or `layout.from` "none") draws as a shell only: the real outline
     stood up to the recorded or likely height, a line at each storey, a flat roof, and what stands outside on the street side. No
     rooms, no inside walls, no lines and no "Behind this wall": the interior is not on public record, and the view says so.
   - Runs are square (axis-aligned in the plan). A run's `risers` are short vertical pieces through the floor at the same spot on both
     floors the line joins; each floor draws its own half, so the two meet in the middle.
   Every element is marked by its basis: "public" (a named public record) solid in one tone, "record" (a company system) solid in
   another, anything else likely (translucent, dashed edges or dashed line, label ends in "likely"). "Example address" is written
   only on a card built from company example data (isExampleCard).
   - floors[].rooms are the rooms as the sketch lays them out; floors[].items and outside[] are equipment; floors[].runs are water,
     gas, drain, wire and duct lines. Heights are a drawing convention (the card has none for these).
   Every item and run becomes one named object whose userData (and glTF extras) carry role, kind, layer, basis and floor; the file
   also carries the footprint, the parcel, the height and the storeys with their basis, in east, up, south metres. */

const THREE_URLS = [
  'https://unpkg.com/three@0.169.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js',
];
const FT = 0.3048;                 // metres per foot: the card is in feet, the model in metres
const STOREY = 2.7, BASE_H = 2.4, HALF = 1.5, WALL_T = 0.12;
const NEAR_WALL_FT = 3;            // "Behind this wall": a line or item this close to a wall counts as in it

const LAYERS = [
  ['water', 'Water'], ['drain', 'Drain'], ['gas', 'Gas'], ['elec', 'Electrical'], ['hvac', 'Heating and cooling'], ['walls', 'Walls'],
];
const KIND_LAYER = {
  main_water: 'water', water_heater: 'water', fixture_shutoffs: 'water',
  sewer_cleanout: 'drain', sump_pump: 'drain',
  gas_meter: 'gas', gas_shutoff: 'gas',
  panel: 'elec', generator: 'elec', service_switch: 'elec',
  furnace: 'hvac', boiler: 'hvac', heat_pump: 'hvac', air_handler: 'hvac', condenser: 'hvac', oil_tank: 'hvac',
};
const RUN_LAYER = { water: 'water', drain: 'drain', gas: 'gas', wire: 'elec', electric: 'elec', power: 'elec', duct: 'hvac' };
const RUN_NAME = { water: 'Water line', drain: 'Drain', gas: 'Gas line', wire: 'Wire run', electric: 'Wire run', power: 'Power line', duct: 'Duct' };
const RUN_R = { water: 0.03, gas: 0.025, drain: 0.055, wire: 0.015, electric: 0.015, power: 0.02, duct: 0.12 };
const RISER_UP = 1.1, RISER_DOWN = 1.0, RISER_STUB = 0.5;   // metres a riser stands above or below the line it belongs to
const LARGE_STOREY = 3.6, RUN_EDGE_FT = 0.35;   // a large building's storey height when none is recorded; how near the wall a line point may sit
const MAX_STOREYS = 12;            // a large building is drawn up to this many storeys
// Symbol sizes in metres [width, height, depth], and the height the symbol's base sits at. Generic shapes, never a likeness.
const SHAPE = {
  furnace: ['box', 0.6, 1.3, 0.75, 0], boiler: ['box', 0.65, 1.1, 0.8, 0], air_handler: ['box', 0.6, 1.2, 0.6, 0],
  water_heater: ['cyl', 0.28, 1.5, 0, 0], oil_tank: ['box', 0.7, 1.1, 1.5, 0], sump_pump: ['cyl', 0.25, 0.35, 0, 0],
  heat_pump: ['box', 0.85, 0.85, 0.85, 0], condenser: ['box', 0.8, 0.8, 0.8, 0], generator: ['box', 1.2, 0.8, 0.7, 0],
  panel: ['box', 0.4, 0.75, 0.12, 1.2], service_switch: ['box', 0.12, 0.18, 0.06, 1.3], gas_meter: ['box', 0.35, 0.45, 0.25, 0.7],
  gas_shutoff: ['ball', 0.09, 0, 0, 0.9], main_water: ['ball', 0.1, 0, 0, 0.4], fixture_shutoffs: ['ball', 0.08, 0, 0, 0.5],
  sewer_cleanout: ['cyl', 0.07, 0.3, 0, 0],
};
const VIEWS = { outside: [0.62, 1.08, 0.95], cutaway: [0.38, 0.86, 0.88], top: [0, 0.001, 0.8] };
const COLOR_VARS = {
  water: '--sys-info', drain: '--sys-ink-2', gas: '--sys-warn', elec: '--sys-bad', hvac: '--sys-good', walls: '--sys-mute',
  shell: '--sys-mute-2', room: '--sys-line-2', other: '--sys-ink', bg: '--sys-surface-2', pick: '--sys-ink',
  pub: '--sys-ink', rec: '--sys-violet',
};
const BASIS_WORD = { public: 'Public record', record: 'Company record', likely: 'Likely' };
const EXAMPLE_LINE = 'Company record (example data)';

let threeP = null;
/** three.js as an ES module: unpkg first, jsdelivr if that fails. Loaded once. */
export function loadThree() {
  if (!threeP) {
    threeP = (async () => {
      let err;
      for (const u of THREE_URLS) { try { return await import(u); } catch (e) { err = e; } }
      threeP = null; throw err;
    })();
  }
  return threeP;
}

/** True when this browser can draw WebGL; the "3D" control is shown only then. */
export function supports3D() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

const num = v => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
/** The three basis words: "record" (company system), "public" (named public record), "likely" (anything else). */
export const basisOf = b => (b === 'record' || b === 'public' ? b : 'likely');
const isSolid = b => basisOf(b) !== 'likely';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* ── the plan: the card read into levels, items, runs, walls (pure data, feet and metres) ───────────────────────────────── */

/** True only for a card built from company example data (the sandbox): the card says so (`example: true`), or, on a card with
    no live building, its basis is a record and its source line names the sandbox or example data. A live card is never one. */
export function isExampleCard(card) {
  const c = card && typeof card === 'object' ? card : {};
  if (c.example === true) return true;
  if (c.example === false || (c.building && typeof c.building === 'object') || (c.place && typeof c.place === 'object')) return false;
  return (c.basis === 'record' || c.basis === 'mixed') && /sandbox|fictional|example data/i.test(String(c.source_line || ''));
}

/** True for a large or non-residential building: the card says `building.kind` is "large", or that no layout is known (`layout.from`
    is "none"). Such a card is drawn as a shell only, never with rooms. */
export function isLargeCard(card) {
  const c = card && typeof card === 'object' ? card : {};
  return !!((c.building && typeof c.building === 'object' && c.building.kind === 'large') || (c.layout && typeof c.layout === 'object' && c.layout.from === 'none'));
}

/* ── plane geometry in plan feet (x to the right, y towards the front) ───────────────────────────────────────────────────── */

function cleanRing(r) {
  const pts = (Array.isArray(r) ? r : []).filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map(p => [Number(p[0]), Number(p[1])]);
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) pts.pop(); }
  return pts.length >= 3 ? pts : [];
}
function polyArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
/** Point in polygon (even-odd). */
export function inRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function nearestOnRing(p, r) {
  let best = null;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = { q, d, i };
  }
  return best;
}
/** A point moved inside the ring when it falls outside: to the nearest edge, then `inset` feet in. */
function snapInside(p, r, inset = 1.5) {
  if (inRing(p, r)) return null;
  const { q } = nearestOnRing(p, r);
  for (const k of [inset, inset / 2, 0.25]) {
    const cands = [];
    for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; cands.push([q[0] + Math.cos(t) * k, q[1] + Math.sin(t) * k]); }
    const ins = cands.filter(c => inRing(c, r)).sort((u, v) => nearestOnRing(v, r).d - nearestOnRing(u, r).d);
    if (ins.length) return ins[0].map(v => Math.round(v * 10) / 10);
  }
  return q;
}
/** Sutherland-Hodgman: the ring cut to an axis-aligned rectangle [x0, y0, x1, y1]. */
function clipToRect(poly, [x0, y0, x1, y1]) {
  let out = poly;
  const edges = [[p => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [p => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [p => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]],
    [p => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
/** The parts of segment a-b that lie inside the ring and away from its edge (an inside wall never doubles an outside one). */
function clipSegment(a, b, r) {
  const ts = [0, 1];
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    const d = (b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]);
    if (Math.abs(d) < 1e-12) continue;
    const t = ((p[0] - a[0]) * (q[1] - p[1]) - (p[1] - a[1]) * (q[0] - p[0])) / d;
    const u = ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / d;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < 1e-6) continue;
    const m = at((ts[i] + ts[i + 1]) / 2);
    if (inRing(m, r) && nearestOnRing(m, r).d > 0.6) out.push([at(ts[i]), at(ts[i + 1])]);
  }
  return out;
}
function hull(pts) {
  const p = pts.map(x => x.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const axes = rDeg => { const r = (rDeg * Math.PI) / 180; return { ex: [Math.cos(r), -Math.sin(r)], ey: [-Math.sin(r), -Math.cos(r)] }; };
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
/** The plan rectangle in the footprint frame: its rotation, centre and size (metres) for a ring in local metres. */
export function orientRect(ringM, rotDeg, frontBearing) {
  const fit = r => {
    const { ex, ey } = axes(r);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of ringM) { const u = p[0] * ex[0] + p[1] * ex[1], v = p[0] * ey[0] + p[1] * ey[1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    return { r, ex, ey, U: u1 - u0, V: v1 - v0, c: [cu * ex[0] + cv * ey[0], cu * ex[1] + cv * ey[1]] };
  };
  if (Number.isFinite(rotDeg)) return fit(rotDeg);
  const h = hull(ringM);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const phi = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;   // edge direction, degrees anticlockwise from east
    for (let k = 0; k < 4; k++) {
      const f = fit(-phi + 90 * k);
      const area = f.U * f.V, fb = f.r + 180;
      const score = Number.isFinite(frontBearing) ? angDiff(fb, frontBearing) : (f.U + 1e-6 >= f.V ? 0 : 1000) + angDiff(fb, 180);
      if (!best || area < best.area * 0.999 || (area <= best.area * 1.001 && score < best.score)) best = { ...f, area, score };
    }
  }
  return best || fit(0);
}

/** The live building read from the card in plan feet: null when the card has none (or the place is known only to the town). */
function siteOf(c, w, h, flipped) {
  const b = c.building;
  if (!b || typeof b !== 'object' || (c.place && c.place.precision === 'town')) return null;
  const fp = b.footprint && typeof b.footprint === 'object' ? b.footprint : {};
  const ringM = cleanRing(fp.ring_m);
  if (ringM.length < 3 || Math.abs(polyArea(ringM)) < 4) return null;
  const rot = fp.rot_deg === undefined || fp.rot_deg === null || fp.rot_deg === '' || !Number.isFinite(Number(fp.rot_deg)) ? NaN : Number(fp.rot_deg) + (flipped ? 180 : 0);
  const fb = b.front && Number.isFinite(Number(b.front.bearing_deg)) && b.front.bearing_deg !== null ? Number(b.front.bearing_deg) : NaN;
  const R = orientRect(ringM, rot, fb);
  const kx = R.U / w, kz = R.V / h;
  const toPlan = p => { const d = [p[0] - R.c[0], p[1] - R.c[1]]; return [(d[0] * R.ex[0] + d[1] * R.ex[1]) / kx + w / 2, (d[0] * R.ey[0] + d[1] * R.ey[1]) / kz + h / 2]; };
  const ring = ringM.map(toPlan);
  const pc = b.parcel && typeof b.parcel === 'object' ? b.parcel : null;
  const parcelM = pc ? cleanRing(pc.ring_m) : [];
  const outb = (Array.isArray(fp.outbuildings) ? fp.outbuildings : []).map(o => cleanRing(o && o.ring_m)).filter(r => r.length >= 3);
  const hgt = b.height && typeof b.height === 'object' ? b.height : {};
  const st = b.storeys && typeof b.storeys === 'object' ? b.storeys : {};
  return {
    ringM, ring, kx, kz, rot: R.r, centre: R.c, U: R.U, V: R.V,
    basis: basisOf(fp.basis || 'public'), asOf: String(fp.as_of || ''), method: String(fp.method || ''), area: Math.abs(polyArea(ringM)),
    parcelM, parcel: parcelM.map(toPlan), parcelBasis: basisOf(pc && pc.basis || 'public'),
    outbuildings: outb.map(r => ({ ringM: r, ring: r.map(toPlan) })),
    eave: num(hgt.eave_m), ridge: num(hgt.ridge_m), heightBasis: basisOf(hgt.basis), storeys: num(st.n), storeysBasis: basisOf(st.basis),
    frontBasis: basisOf(b.front && b.front.basis), precision: String(c.place && c.place.precision || ''),
    origin: b.frame && b.frame.origin && typeof b.frame.origin === 'object' ? { lon: num(b.frame.origin.lon), lat: num(b.frame.origin.lat) } : null,
  };
}

/** The card as levels (bottom to top) with their contents; used by the scene, the file and "Behind this wall". */
export function planOf(card) {
  const c = card && typeof card === 'object' ? card : {};
  const house = c.house && typeof c.house === 'object' ? c.house : {};
  let floors = (Array.isArray(c.floors) ? c.floors : []).filter(f => f && typeof f === 'object');
  const f0 = floors[0] || {};
  const w = Math.max(10, num(f0.w) || 40), h = Math.max(10, num(f0.h) || 30);
  let front = c.front === 'top' ? 'top' : 'bottom';
  // a live building with the front at the top is turned half round, so the street side is always +y (the rotation follows)
  const live = !!(c.building && typeof c.building === 'object');
  const flipped = live && front === 'top';
  if (flipped) {
    const P = p => (Array.isArray(p) ? [w - num(p[0]), h - num(p[1])] : p);
    floors = floors.map(f => ({ ...f,
      rooms: (Array.isArray(f.rooms) ? f.rooms : []).map(r => (r && typeof r === 'object' ? { ...r, x: w - num(r.x) - num(r.w), y: h - num(r.y) - num(r.h) } : r)),
      items: (Array.isArray(f.items) ? f.items : []).map(i => (i && typeof i === 'object' ? { ...i, x: w - num(i.x), y: h - num(i.y) } : i)),
      runs: (Array.isArray(f.runs) ? f.runs : []).map(r => (r && typeof r === 'object' && Array.isArray(r.points)
        ? { ...r, points: r.points.map(P), risers: (Array.isArray(r.risers) ? r.risers : []).map(q => (Array.isArray(q) ? [...P(q), q[2]] : q)) } : r)) }));
    front = 'bottom';
  }
  const large = isLargeCard(c);
  const site = siteOf(c, w, h, flipped);
  const stories = Math.max(1, (site && site.storeys) || (!large && num(house.stories)) || 1);
  const storeyH = large ? (site && site.eave ? Math.min(5, Math.max(2.4, site.eave / stories)) : LARGE_STOREY)
    : site && site.eave ? Math.min(3.6, Math.max(2.4, site.eave / stories)) : STOREY;
  const hasBase = large ? floors.some(f => f.id === 'basement') : house.foundation === 'basement' && house.basement !== 'none' || floors.some(f => f.id === 'basement');
  const levels = [];
  if (hasBase) levels.push({ id: 'basement', name: 'Basement', base: -BASE_H, height: BASE_H, below: true });
  const names = large ? ['Ground floor'] : ['First floor', 'Second floor', 'Third floor'], ids = ['first', 'second', 'third'];
  const n = Math.min(large ? MAX_STOREYS : 3, Math.ceil(stories));
  for (let i = 0; i < n; i++) {
    const half = i === n - 1 && stories % 1 !== 0;
    levels.push({ id: ids[i] || `s${i + 1}`, name: names[i] || (large ? `Floor ${i + 1}` : ids[i]), base: i * storeyH, height: half ? HALF : storeyH, half });
  }
  for (const f of floors) {
    if (!levels.some(l => l.id === f.id)) levels.push({ id: String(f.id), name: String(f.name || f.id), base: levels.length * storeyH, height: storeyH });
  }
  levels.sort((a, b) => a.base - b.base);
  let snapped = 0;
  const fit = p => { if (!site) return p; const s = snapInside(p, site.ring); if (s) { snapped++; return s; } return p; };
  // a line point on the wall (within a few inches) stays where it is: moving it would turn a square run crooked
  const fitRun = p => (site && nearestOnRing(p, site.ring).d < RUN_EDGE_FT ? p : fit(p));
  for (const l of levels) {
    const f = floors.find(x => x.id === l.id);
    l.inCard = !!f;
    if (f && f.name) l.name = String(f.name);
    // a large building has no interior on record: whatever the card holds inside is not drawn
    l.rooms = (!large && f && Array.isArray(f.rooms) ? f.rooms : []).filter(r => r && typeof r === 'object').map(r => ({
      x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h), label: String(r.label || 'Room'), basis: basisOf(r.basis),
    }));
    if (site) {
      for (const r of l.rooms) {
        r.poly = clipToRect(site.ring, [r.x, r.y, r.x + r.w, r.y + r.h]);
        if (r.poly.length < 3 || Math.abs(polyArea(r.poly)) < 4) r.poly = null;
      }
      l.rooms = l.rooms.filter(r => r.poly);
    }
    l.items = (!large && f && Array.isArray(f.items) ? f.items : []).filter(i => i && typeof i === 'object').map((it, i) => {
      const o = { ...it, key: `${l.id}-i${i}` };
      if (site) { const p = fit([num(it.x), num(it.y)]); if (p[0] !== num(it.x) || p[1] !== num(it.y)) { o.x = p[0]; o.y = p[1]; o.snapped = true; } }
      return o;
    });
    l.runs = (!large && f && Array.isArray(f.runs) ? f.runs : []).filter(r => r && typeof r === 'object' && Array.isArray(r.points))
      .map((r, i) => {
        const raw = r.points.filter(p => Array.isArray(p)).map(p => [num(p[0]), num(p[1])]);
        const points = raw.map(fitRun);
        const risers = (Array.isArray(r.risers) ? r.risers : []).filter(q => Array.isArray(q) && q.length >= 2)
          .map(q => { const p = fitRun([num(q[0]), num(q[1])]); return [p[0], p[1], q[2] === 'down' ? 'down' : 'up']; });
        return { ...r, key: `${l.id}-r${i}`, points, risers, snapped: points.some((p, k) => p[0] !== raw[k][0] || p[1] !== raw[k][1]) };
      })
      .filter(r => r.points.length >= 2);
  }
  const outside = (Array.isArray(c.outside) ? c.outside : []).filter(o => o && typeof o === 'object').map((o, i) => ({ ...o, key: `out-${i}` }));
  const focusLevel = (() => {
    const focus = (Array.isArray(c.focus) ? c.focus : []).map(String);
    if (large) return levels[levels.length - 1]?.id;
    for (const k of focus) { const l = levels.find(x => x.items.some(i => String(i.kind) === k)); if (l) return l.id; }
    let best = levels[0]?.id, nmax = -1;
    for (const l of levels) { const k = l.items.length + l.runs.length; if (k > nmax) { nmax = k; best = l.id; } }
    return best;
  })();
  const address = String(c.address || (c.place && c.place.label) || '');
  const note = large ? String((c.layout && c.layout.note) || 'Interior layout is not on public record.') : '';
  return { address, w, h, levels, outside, front, focusLevel, focus: (Array.isArray(c.focus) ? c.focus : []).map(String), large, note,
    wires: levels.some(l => l.runs.some(r => r.kind === 'wire' || r.kind === 'electric')), site, storeyH, snapped, example: isExampleCard(c),
    shellBasis: site && site.heightBasis !== 'likely' && site.storeysBasis !== 'likely' ? site.heightBasis : 'likely' };
}

/** Exterior walls of a level as segments in feet: front is the street side. A live card's walls follow its outline. */
function exteriorWalls(plan) {
  const { w, h, front, site } = plan;
  if (site) {
    const r = site.ring, segs = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.5) continue;
      let n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (inRing([m[0] + n[0] * 0.3, m[1] + n[1] * 0.3], r)) n = [-n[0], -n[1]];
      const side = Math.abs(n[1]) >= Math.abs(n[0]) ? (n[1] > 0 ? 'front' : 'rear') : (n[0] > 0 ? 'right' : 'left');
      segs.push({ a, b, side, L, i });
    }
    const out = [];
    for (const side of ['front', 'rear', 'left', 'right']) {
      const S = side[0].toUpperCase() + side.slice(1);
      segs.filter(s => s.side === side).sort((x, y) => y.L - x.L)
        .forEach((s, k) => out.push({ id: `${side}${k ? k + 1 : ''}`, name: k ? `${S} wall ${k + 1}` : `${S} wall`, a: s.a, b: s.b, side }));
    }
    return out;
  }
  const fy = front === 'top' ? 0 : h, ry = front === 'top' ? h : 0;
  return [
    { id: 'front', name: 'Front wall', a: [0, fy], b: [w, fy], side: 'front' },
    { id: 'rear', name: 'Rear wall', a: [0, ry], b: [w, ry], side: 'rear' },
    { id: 'left', name: 'Left wall', a: [0, 0], b: [0, h], side: 'left' },
    { id: 'right', name: 'Right wall', a: [w, 0], b: [w, h], side: 'right' },
  ];
}
/** Room walls that are not on the outside of the house (on a live card, the parts inside the real outline). */
function roomWalls(plan, level) {
  const out = [];
  const onEdge = (a, b) => (a[0] === b[0] && (a[0] <= 0 || a[0] >= plan.w)) || (a[1] === b[1] && (a[1] <= 0 || a[1] >= plan.h));
  level.rooms.forEach((r, ri) => {
    if (r.x <= 0 && r.y <= 0 && r.w >= plan.w && r.h >= plan.h) return;   // a room that is the whole floor has no walls of its own
    const c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      if (onEdge(a, b)) continue;
      if (!plan.site) { out.push({ id: `room${ri}-${i}`, name: `${r.label} wall`, a, b, side: null, basis: r.basis }); continue; }
      clipSegment(a, b, plan.site.ring).forEach((s, k) => out.push({ id: `room${ri}-${i}${k ? `-${k}` : ''}`, name: `${r.label} wall`, a: s[0], b: s[1], side: null, basis: r.basis }));
    }
  });
  // two rooms side by side share a wall: draw it once
  const seen = new Set();
  return out.filter(wl => {
    const k = [wl.a, wl.b].map(p => p.map(v => Math.round(v * 2) / 2).join(',')).sort().join('|');
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function crosses(p1, p2, a, b) {
  const d = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  const d1 = d(a, b, p1), d2 = d(a, b, p2), d3 = d(p1, p2, a), d4 = d(p1, p2, b);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function segSegDist(p1, p2, a, b) {
  if (crosses(p1, p2, a, b)) return 0;
  return Math.min(segDist(p1, a, b), segDist(p2, a, b), segDist(a, p1, p2), segDist(b, p1, p2));
}

/** What runs inside one wall: lines and items of that level within 3 feet of it, and outside equipment on that side. */
export function behindWall(plan, levelId, wall) {
  const level = plan.levels.find(l => l.id === levelId);
  if (!level || !wall) return [];
  const out = [];
  for (const r of level.runs) {
    let near = false;
    for (let i = 0; i < r.points.length - 1 && !near; i++) near = segSegDist(r.points[i], r.points[i + 1], wall.a, wall.b) <= NEAR_WALL_FT;
    if (near) out.push({ key: r.key, label: RUN_NAME[r.kind] || 'Line', basis: r.basis, what: 'run' });
  }
  for (const it of level.items) {
    if (segDist([num(it.x), num(it.y)], wall.a, wall.b) <= NEAR_WALL_FT) out.push({ key: it.key, label: String(it.label || 'Item'), basis: it.basis, what: 'item' });
  }
  if (wall.side) {
    const lowest = plan.levels.find(l => !l.below)?.id;
    for (const o of plan.outside) {
      if (String(o.side) === wall.side && (levelId === lowest || levelId === 'basement')) out.push({ key: o.key, label: String(o.label || 'Item'), basis: o.basis, what: 'outside' });
    }
  }
  return out;
}

/* ── geometry helpers (three.js) ──────────────────────────────────────────────────────────────────────────────────────── */

function mergeGeoms(T, geoms) {
  let nv = 0, ni = 0;
  const parts = geoms;
  for (const g of parts) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
    const n = g.attributes.position.count;
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov; oi += g.index.count; }
    else { for (let i = 0; i < n; i++) idx[oi + i] = i + ov; oi += n; }
    ov += n; g.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setIndex(new T.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
/** A cylinder from a to b (three Vector3). */
function segment(T, a, b, r) {
  const len = a.distanceTo(b); if (len < 1e-4) return null;
  const g = new T.CylinderGeometry(r, r, len, 10, 1, false);
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z);
  return g;
}
/** One straight piece a to b: whole when solid, short dashes when dashed. */
function pieces(T, a, b, r, dashed, dash = 0.28, gap = 0.18) {
  const parts = [], L = a.distanceTo(b);
  if (!dashed) { const s = segment(T, a, b, r); if (s) parts.push(s); return parts; }
  for (let t = 0; t < L; t += dash + gap) {
    const s = segment(T, a.clone().lerp(b, t / L), a.clone().lerp(b, Math.min(L, t + dash) / L), r); if (s) parts.push(s);
  }
  return parts;
}
/** A line through points as one mesh: whole when solid, short dashes when dashed. `risers` are [x, z, y0, y1] short vertical pieces
    through a floor (a collar marks the spot) that join the same mesh; `dash` and `gap` set the dash length when dashed. */
function lineGeom(T, pts, r, dashed, { risers = [], dash = 0.28, gap = 0.18 } = {}) {
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    parts.push(...pieces(T, a, b, r, dashed, dash, gap));
    if (!dashed && i > 0) { const j = new T.SphereGeometry(r, 8, 6); j.translate(a.x, a.y, a.z); parts.push(j); }
  }
  for (const [x, z, y0, y1] of risers) {
    parts.push(...pieces(T, new T.Vector3(x, y0, z), new T.Vector3(x, y1, z), r * 1.6, dashed, dash, gap));
    const c = new T.SphereGeometry(r * 3, 10, 8); c.translate(x, y0, z); parts.push(c);
  }
  return parts.length ? mergeGeoms(T, parts) : null;
}
function roofGeom(T, W, D, H) {
  // A plain gable along the longer side. Vertices: eaves rectangle at 0, ridge at H.
  const alongX = W >= D;
  const hw = W / 2, hd = D / 2;
  const v = alongX
    ? [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, H, 0], [hw, H, 0]]
    : [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [0, H, -hd], [0, H, hd]];
  const tris = alongX
    ? [[0, 4, 5], [0, 5, 1], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2]]
    : [[0, 4, 3], [3, 4, 5], [1, 2, 5], [1, 5, 4], [0, 1, 4], [3, 5, 2]];
  const pos = [];
  for (const t of tris) for (const i of t) pos.push(...v[i]);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/* ── the model ────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** A flat polygon (model metres, [x, z] pairs) lifted to a prism from y0 to y0 + d. */
function prismGeom(T, pts, y0, d) {
  const sh = new T.Shape(pts.map(p => new T.Vector2(p[0], -p[1])));
  const g = new T.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return g;
}
/** A roof for an outline that is not a rectangle: the eaves follow the outline and rise to a smaller copy of it at the ridge. */
function tentRoofGeom(T, pts, H) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const inner = pts.map(p => [cx + (p[0] - cx) * 0.35, cz + (p[1] - cz) * 0.35]);
  const pos = [];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length, a = [...pts[i]], b = [...pts[j]], ai = inner[i], bi = inner[j];
    pos.push(a[0], 0, a[1], b[0], 0, b[1], bi[0], H, bi[1], a[0], 0, a[1], bi[0], H, bi[1], ai[0], H, ai[1]);
  }
  const side = new T.BufferGeometry(); side.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); side.computeVertexNormals();
  const cap = new T.ShapeGeometry(new T.Shape(inner.map(p => new T.Vector2(p[0], -p[1])))); cap.rotateX(-Math.PI / 2); cap.translate(0, H, 0);
  return mergeGeoms(T, [side, cap]);
}

/** Builds the model as a three.js Group (metres, Y up, the street side towards +Z). Every object carries userData. */
function buildModel(T, card) {
  const plan = planOf(card);
  const site = plan.site;
  const kx = site ? site.kx : FT, kz = site ? site.kz : FT;
  const W = plan.w * kx, D = plan.h * kz;
  const flip = plan.front === 'top' ? -1 : 1;
  const X = x => (num(x) - plan.w / 2) * kx, Z = y => flip * (num(y) - plan.h / 2) * kz;
  const M = p => [X(p[0]), Z(p[1])];
  const root = new T.Group(); root.name = plan.large ? 'Building' : 'House';
  root.userData = { role: plan.large ? 'building' : 'house', kind: plan.large ? 'large' : 'house', address: plan.address, example: plan.example };
  const mats = [];
  const mat = (colorKey, basis, kind = 'solid') => {
    const likely = !isSolid(basis);
    const m = new T.MeshLambertMaterial({ color: 0x888888, transparent: likely || kind === 'shell', opacity: kind === 'shell' ? 0.22 : likely ? 0.5 : 1,
      depthWrite: !(likely || kind === 'shell'), side: kind === 'shell' ? T.DoubleSide : T.FrontSide });
    m.name = `${colorKey} ${basisOf(basis)}`;
    m.userData = { colorKey, base: m.opacity };
    mats.push(m); return m;
  };
  // edges: a solid line in the tone of its basis (public or company record), dashed in the object's colour when likely
  const edgeMat = (colorKey, basis) => {
    const b = basisOf(basis);
    const m = b !== 'likely' ? new T.LineBasicMaterial({ color: 0x888888 }) : new T.LineDashedMaterial({ color: 0x888888, dashSize: 0.12, gapSize: 0.08 });
    m.userData = { colorKey: b === 'record' ? 'rec' : b === 'public' ? 'pub' : colorKey }; mats.push(m); return m;
  };
  const addEdges = (mesh, colorKey, basis) => {
    const e = new T.LineSegments(new T.EdgesGeometry(mesh.geometry, 20), edgeMat(colorKey, basis));
    e.computeLineDistances(); e.userData = { role: 'edge' }; e.raycast = () => {}; mesh.add(e);
  };
  const group = (parent, name, data = {}) => { const g = new T.Group(); g.name = name; g.userData = data; parent.add(g); return g; };
  const sysGroups = (parent, lvl) => Object.fromEntries(LAYERS.filter(([k]) => k !== 'walls').map(([k, n]) => [k, group(parent, n, { role: 'group', layer: k, level: lvl })]));

  const items = [], runs = [], walls = [], shell = [];
  // drawing heights: drains low, wires in the joists of a basement and at outlet height in a wall above, ducts at the ceiling
  const runY = (l, kind) => {
    const ceil = l.base + l.height - 0.25;
    return kind === 'duct' ? ceil - 0.05
      : (kind === 'wire' || kind === 'electric' || kind === 'power') ? (l.below ? ceil + 0.1 : l.base + 0.4)
        : l.below ? (kind === 'drain' ? l.base + 0.15 : ceil) : (kind === 'drain' ? l.base - 0.35 : l.base - 0.18);
  };
  const top = plan.levels.reduce((m, l) => Math.max(m, l.base + l.height), 0);
  const shellBasis = plan.shellBasis;
  const ringM = site ? site.ring.map(M) : null;

  for (const l of plan.levels) {
    const g = group(root, l.name, { role: 'level', level: l.id });
    // the floor: on a live card the real outline; otherwise a rectangle worked out from the floor area (likely)
    const slab = new T.Mesh(site ? prismGeom(T, ringM, l.base - 0.06, 0.06) : new T.BoxGeometry(W, 0.06, D), mat('shell', 'likely', 'shell'));
    if (!site) slab.position.set(0, l.base - 0.03, 0);
    slab.name = `${l.name} floor`;
    slab.userData = { role: 'slab', layer: 'structure', level: l.id, basis: site && !l.below ? shellBasis : 'likely' };
    g.add(slab); shell.push(slab);
    const wg = group(g, 'Walls', { role: 'group', layer: 'walls', level: l.id });
    const outer = exteriorWalls(plan);
    for (const wall of [...outer, ...roomWalls(plan, l)]) {
      const ax = X(wall.a[0]), az = Z(wall.a[1]), bx = X(wall.b[0]), bz = Z(wall.b[1]);
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue;
      // an outside wall stands on the public outline; its height (and a basement's) is likely unless the card says otherwise
      const basis = wall.side ? (site && !l.below ? shellBasis : 'likely') : basisOf(wall.basis);
      const m = new T.Mesh(new T.BoxGeometry(len, l.height, WALL_T), mat('walls', 'likely', 'shell'));
      m.position.set((ax + bx) / 2, l.base + l.height / 2, (az + bz) / 2);
      m.rotation.y = -Math.atan2(bz - az, bx - ax);
      m.name = wall.name;
      m.userData = { role: 'wall', layer: 'walls', level: l.id, basis, wall: { ...wall }, side: wall.side, pick: true, label: wall.name, inside: !wall.side };
      addEdges(m, 'walls', basis);
      wg.add(m); walls.push(m); shell.push(m);
    }
    if (plan.large) {
      // a line round the outline at the top of each storey: the one thing inside a large shell that is drawn
      const ring = ringM || [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
      const pts = ring.map(q => new T.Vector3(q[0], l.base + l.height, q[1])); pts.push(pts[0].clone());
      const sb = site && !l.below ? shellBasis : 'likely';
      const geo = lineGeom(T, pts, 0.04, !isSolid(sb), { dash: 0.7, gap: 0.45 });
      if (geo) {
        const m = new T.Mesh(geo, mat('walls', sb));
        m.name = `${l.name} top`;
        m.userData = { role: 'storey', layer: 'walls', level: l.id, basis: sb, label: `${l.name} top` };
        wg.add(m); shell.push(m);
      }
    }
    if (l.rooms.length) {
      const rg = group(g, 'Rooms', { role: 'group', layer: 'structure', level: l.id });
      for (const r of l.rooms) {
        let m;
        if (r.poly) m = new T.Mesh(prismGeom(T, r.poly.map(M), l.base + 0.005, 0.02), mat('room', r.basis, 'shell'));
        else {
          m = new T.Mesh(new T.BoxGeometry(Math.max(0.1, r.w * kx - 0.1), 0.02, Math.max(0.1, r.h * kz - 0.1)), mat('room', 'likely', 'shell'));
          m.position.set(X(r.x + r.w / 2), l.base + 0.01, Z(r.y + r.h / 2));
        }
        m.name = r.label; m.userData = { role: 'room', layer: 'structure', level: l.id, basis: site ? r.basis : 'likely', label: r.label };
        rg.add(m); shell.push(m);
      }
    }
    const sg = sysGroups(g, l.id);
    for (const it of l.items) {
      const attic = /^in the attic/i.test(String(it.note || ''));
      const m = itemMesh(T, it, mat, addEdges);
      const s = SHAPE[it.kind] || ['box', 0.4, 0.4, 0.4, 0];
      const y0 = attic ? top + 0.1 : l.base + s[4];
      placeItem(m, s, X(it.x), y0, Z(it.y));
      tagItem(m, it, l.id, false);
      (sg[KIND_LAYER[it.kind]] || sg.hvac).add(m); items.push(m);
    }
    for (const r of l.runs) {
      const layer = RUN_LAYER[r.kind] || 'water';
      const y = runY(l, r.kind);
      const pts = r.points.map(p => new T.Vector3(X(p[0]), y, Z(p[1])));
      if (r.kind === 'drain' && pts.length >= 2) pts[pts.length - 1].y -= 0.1;   // a drain falls towards its exit
      // a riser stands through the floor at its spot: up into the wall of the floor above, down into the floor below. Each floor draws
      // its own half, so the two meet; with no floor beyond, a short stub shows where the line leaves the plan.
      const li = plan.levels.indexOf(l);
      const rise = (r.risers || []).map(q => {
        const up = q[2] !== 'down', nb = plan.levels[li + (up ? 1 : -1)];
        const y1 = up ? Math.min(y + RISER_UP, nb ? nb.base + nb.height - 0.1 : y + RISER_STUB) : Math.max(y - RISER_DOWN, nb ? nb.base + 0.1 : y - RISER_STUB);
        return [X(q[0]), Z(q[1]), y, y1];
      });
      const geo = lineGeom(T, pts, RUN_R[r.kind] || 0.03, !isSolid(r.basis), { risers: rise });
      if (!geo) continue;
      const b = basisOf(r.basis);
      const m = new T.Mesh(geo, mat(layer, b));
      const label = RUN_NAME[r.kind] || 'Line';
      m.name = `${label}${b === 'likely' ? ' (likely)' : ''}`;
      m.userData = { role: 'run', kind: String(r.kind || ''), layer, level: l.id, basis: b, likely: b === 'likely', risers: rise.length,
        label, key: r.key, pick: true, anchor: pts[Math.floor((pts.length - 1) / 2)].clone().lerp(pts[Math.ceil((pts.length - 1) / 2)], 0.5).toArray(),
        points: r.points.map(p => [p[0], p[1]]), snapped: !!r.snapped };
      sg[layer].add(m); runs.push(m);
    }
  }
  if (plan.outside.length) {
    const og = group(root, 'Outside', { role: 'level', level: 'outside' });
    const sg = sysGroups(og, 'outside');
    for (const o of plan.outside) {
      const p = outsidePoint(plan, o);
      const m = itemMesh(T, o, mat, addEdges);
      const s = SHAPE[o.kind] || ['box', 0.4, 0.4, 0.4, 0];
      placeItem(m, s, X(p[0]), s[4], Z(p[1]));
      tagItem(m, o, 'outside', true);
      (sg[KIND_LAYER[o.kind]] || sg.hvac).add(m); items.push(m);
    }
  }
  // the roof: its shape is in no record, so it is likely. A gable over the plan rectangle, or a hip that follows an odd outline.
  const ridge = site && site.ridge > (site.eave || top) ? Math.min(6, site.ridge - (site.eave || top)) : Math.min(W, D) * 0.32;
  const rectLike = !site || site.area / Math.max(1, site.U * site.V) >= 0.97;
  // a large building has a flat roof slab over its outline; a house has a gable, or a hip that follows an odd outline
  const roofG = plan.large ? prismGeom(T, ringM || [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]], 0, 0.3)
    : rectLike ? roofGeom(T, W + 0.3, D + 0.3, ridge) : tentRoofGeom(T, ringM, ridge);
  const roof = new T.Mesh(roofG, mat('shell', 'likely', 'shell'));
  roof.position.y = top; roof.name = 'Roof';
  roof.userData = { role: 'roof', layer: 'walls', level: 'roof', basis: 'likely' };
  addEdges(roof, 'shell', 'likely');
  root.add(roof); shell.push(roof);
  let outline = null, parcel = null;
  if (site) {
    // the outline on the ground (public), the parcel edge, and any outbuildings (their outline is public, their height likely)
    const sgp = group(root, 'Site', { role: 'group', layer: 'site', level: 'site' });
    const loop = (ring, y) => { const p = ring.map(q => new T.Vector3(q[0], y, q[1])); p.push(p[0].clone()); return p; };
    outline = new T.Mesh(lineGeom(T, loop(ringM, 0.03), 0.05, false), mat('pub', site.basis));
    outline.name = 'Building outline';
    outline.userData = { role: 'outline', layer: 'site', level: 'site', basis: site.basis, label: 'Building outline', key: 'outline', pick: true,
      as_of: site.asOf, anchor: [ringM[0][0], 0.1, ringM[0][1]] };
    sgp.add(outline); shell.push(outline);
    if (site.parcel.length >= 3) {
      parcel = new T.Mesh(lineGeom(T, loop(site.parcel.map(M), 0.015), 0.03, !isSolid(site.parcelBasis)), mat('pub', site.parcelBasis));
      parcel.name = 'Parcel edge';
      parcel.userData = { role: 'parcel', layer: 'site', level: 'site', basis: site.parcelBasis, label: 'Parcel edge', key: 'parcel', pick: true };
      sgp.add(parcel); shell.push(parcel);
    }
    site.outbuildings.forEach((ob, i) => {
      const m = new T.Mesh(prismGeom(T, ob.ring.map(M), 0, 2.4), mat('shell', 'likely', 'shell'));
      m.name = `Outbuilding${site.outbuildings.length > 1 ? ` ${i + 1}` : ''}`;
      m.userData = { role: 'outbuilding', layer: 'site', level: 'site', basis: 'likely', outline_basis: 'public', label: 'Outbuilding' };
      addEdges(m, 'shell', 'likely');
      sgp.add(m); shell.push(m);
    });
  }
  return { root, plan, items, runs, walls, roof, shell, outline, parcel, mats, size: { W, D, top, bottom: plan.levels[0]?.base || 0 } };
}

/** Where an outside item stands (plan feet): 3 feet out from its side of the house, against the real outline when there is one. */
function outsidePoint(plan, o) {
  const at = Math.min(1, Math.max(0, num(o.at) || 0.5)), d = 3;
  const side = String(o.side || 'right');
  if (!plan.site) {
    return side === 'left' ? [-d, at * plan.h] : side === 'right' ? [plan.w + d, at * plan.h]
      : side === 'rear' ? [at * plan.w, plan.front === 'top' ? plan.h + d : -d] : [at * plan.w, plan.front === 'top' ? -d : plan.h + d];
  }
  const N = side === 'left' ? [-1, 0] : side === 'rear' ? [0, -1] : side === 'front' ? [0, 1] : [1, 0];
  const P = side === 'left' ? [0, at * plan.h] : side === 'rear' ? [at * plan.w, 0] : side === 'front' ? [at * plan.w, plan.h] : [plan.w, at * plan.h];
  const depth = N[0] ? plan.w : plan.h;
  for (let t = 0; t <= depth; t += 0.5) {
    const q = [P[0] - N[0] * t, P[1] - N[1] * t];
    if (inRing(q, plan.site.ring)) return [q[0] + N[0] * d, q[1] + N[1] * d];
  }
  return [P[0] + N[0] * d, P[1] + N[1] * d];
}

function itemMesh(T, it, mat, addEdges) {
  const s = SHAPE[it.kind] || ['box', 0.4, 0.4, 0.4, 0];
  const g = s[0] === 'cyl' ? new T.CylinderGeometry(s[1], s[1], s[2], 18) : s[0] === 'ball' ? new T.SphereGeometry(s[1], 14, 10) : new T.BoxGeometry(s[1], s[2], s[3]);
  const layer = KIND_LAYER[it.kind] || 'other';
  const m = new T.Mesh(g, mat(layer, basisOf(it.basis)));
  addEdges(m, layer, basisOf(it.basis));
  return m;
}
function placeItem(m, s, x, y0, z) {
  const h = s[0] === 'ball' ? 0 : s[2];
  m.position.set(x, y0 + h / 2 + (s[0] === 'ball' ? s[1] : 0), z);
}
function tagItem(m, it, level, outside) {
  const b = basisOf(it.basis), likely = b === 'likely';
  const label = String(it.label || 'Item');
  m.name = `${label}${likely ? ' (likely)' : ''}`;
  m.userData = { role: 'item', kind: String(it.kind || ''), layer: KIND_LAYER[it.kind] || 'other', level, outside, basis: b, likely,
    label, note: String(it.note || ''), detail: it.detail ? String(it.detail) : '', focus: it.focus === true, key: it.key, pick: true, snapped: !!it.snapped };
}

/* ── the file ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The model as a binary glTF 2.0 file (metres, Y up). Named nodes per level, room and system; extras carry role and basis.
    A live card's file is placed in the footprint frame: x east, y up, z south, in metres from `building.frame.origin`, under a
    node "Site" whose extras hold the footprint ring, the parcel ring, the height and the storeys, each with its basis. */
export async function houseGLB(card) {
  const T = await loadThree();
  const model = buildModel(T, card);
  let top = model.root;
  const site = model.plan.site;
  if (site) {
    top = new T.Group(); top.name = 'Site';
    const b = card.building || {};
    top.userData = { role: 'site', kind: model.plan.large ? 'large' : 'house', address: model.plan.address, example: false,
      frame: { origin: site.origin, units: 'm', x: 'east', y: 'up', z: 'south' },
      footprint: { ring_m: site.ringM, area_m2: Math.round(site.area * 10) / 10, basis: site.basis, as_of: site.asOf || undefined, method: site.method || undefined,
        plan_rot_deg: Math.round(site.rot * 100) / 100, outbuildings: site.outbuildings.map(o => ({ ring_m: o.ringM, basis: 'public' })) },
      ...(site.parcelM.length >= 3 ? { parcel: { ring_m: site.parcelM, basis: site.parcelBasis } } : {}),
      height: { eave_m: site.eave || undefined, ridge_m: site.ridge || undefined, basis: site.heightBasis, from: (b.height && b.height.from) || undefined },
      storeys: { n: model.plan.levels.filter(l => !l.below).length, basis: site.storeysBasis },
      front: { bearing_deg: b.front && Number.isFinite(Number(b.front.bearing_deg)) ? Number(b.front.bearing_deg) : undefined, basis: site.frontBasis },
      ...(card.place && card.place.precision ? { place: { precision: String(card.place.precision) } } : {}) };
    top.add(model.root);
    // model x runs along the plan's width and z towards the front; turn and move it so x is east and z is south
    model.root.rotation.y = (site.rot * Math.PI) / 180 * -1;
    model.root.position.set(site.centre[0], 0, -site.centre[1]);
  }
  top.updateMatrixWorld(true);
  const blob = writeGLB(T, top, model.mats);
  top.traverse(o => { o.geometry?.dispose?.(); });
  model.mats.forEach(m => m.dispose());
  return blob;
}

function writeGLB(T, root, mats) {
  const json = { asset: { version: '2.0', generator: 'Broad Sky OS house view' }, scene: 0, scenes: [{ name: root.name, nodes: [] }],
    nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const chunks = []; let byteLen = 0;
  const push = (arr, target) => {
    const pad = (4 - (byteLen % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); byteLen += pad; }
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    chunks.push(u8.slice());
    json.bufferViews.push({ buffer: 0, byteOffset: byteLen, byteLength: u8.byteLength, ...(target ? { target } : {}) });
    byteLen += u8.byteLength;
    return json.bufferViews.length - 1;
  };
  const matIdx = new Map();
  const material = m => {
    if (matIdx.has(m.uuid)) return matIdx.get(m.uuid);
    const c = m.color || new T.Color(1, 1, 1);
    const blend = m.transparent && m.opacity < 1;
    json.materials.push({ name: m.name || 'Material', pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, blend ? m.opacity : 1], metallicFactor: 0, roughnessFactor: 1 },
      ...(blend ? { alphaMode: 'BLEND' } : {}), doubleSided: m.side === T.DoubleSide });
    matIdx.set(m.uuid, json.materials.length - 1); return json.materials.length - 1;
  };
  const mesh = o => {
    const g = o.geometry;
    const pos = g.attributes.position.array instanceof Float32Array ? g.attributes.position.array : new Float32Array(g.attributes.position.array);
    if (!g.attributes.normal) g.computeVertexNormals();
    const nor = new Float32Array(g.attributes.normal.array);
    const n = g.attributes.position.count;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    json.accessors.push({ bufferView: push(pos, 34962), componentType: 5126, count: n, type: 'VEC3', min, max });
    const aPos = json.accessors.length - 1;
    json.accessors.push({ bufferView: push(nor, 34962), componentType: 5126, count: n, type: 'VEC3' });
    const aNor = json.accessors.length - 1;
    const prim = { attributes: { POSITION: aPos, NORMAL: aNor }, material: material(o.material) };
    if (g.index) {
      const idx = new Uint32Array(g.index.array);
      json.accessors.push({ bufferView: push(idx, 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
      prim.indices = json.accessors.length - 1;
    }
    json.meshes.push({ name: o.name, primitives: [prim] });
    return json.meshes.length - 1;
  };
  const extras = u => {
    const e = {};
    for (const k of ['role', 'kind', 'layer', 'level', 'basis', 'label', 'note', 'detail', 'address', 'as_of', 'outline_basis']) if (u && u[k] !== undefined && u[k] !== '') e[k] = u[k];
    for (const k of ['frame', 'footprint', 'parcel', 'height', 'storeys', 'front', 'place']) if (u && u[k] && typeof u[k] === 'object') e[k] = JSON.parse(JSON.stringify(u[k]));
    if (u && (u.role === 'house' || u.role === 'building' || u.role === 'site')) e.example = !!u.example;
    if (u && u.role === 'item') { e.outside = !!u.outside; if (u.snapped) e.snapped = true; }
    return e;
  };
  const node = o => {
    const nd = { name: o.name || o.type };
    const ex = extras(o.userData); if (Object.keys(ex).length) nd.extras = ex;
    const p = o.position, q = o.quaternion, s = o.scale;
    if (p.x || p.y || p.z) nd.translation = [p.x, p.y, p.z];
    if (q.x || q.y || q.z || q.w !== 1) nd.rotation = [q.x, q.y, q.z, q.w];
    if (s.x !== 1 || s.y !== 1 || s.z !== 1) nd.scale = [s.x, s.y, s.z];
    if (o.isMesh) nd.mesh = mesh(o);
    json.nodes.push(nd); const i = json.nodes.length - 1;
    const kids = o.children.filter(c => !c.isLine && !c.isLineSegments).map(node);
    if (kids.length) nd.children = kids;
    return i;
  };
  json.scenes[0].nodes.push(node(root));
  json.buffers.push({ byteLength: byteLen });
  const bin = new Uint8Array(byteLen); let off = 0;
  for (const c of chunks) { bin.set(c, off); off += c.byteLength; }
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  if (jpad) { const t = new Uint8Array(jsonBytes.length + jpad).fill(0x20); t.set(jsonBytes); jsonBytes = t; }
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const head = new DataView(new ArrayBuffer(12)); head.setUint32(0, 0x46546C67, true); head.setUint32(4, 2, true); head.setUint32(8, total, true);
  const jh = new DataView(new ArrayBuffer(8)); jh.setUint32(0, jsonBytes.length, true); jh.setUint32(4, 0x4E4F534A, true);
  const bh = new DataView(new ArrayBuffer(8)); bh.setUint32(0, bin.length, true); bh.setUint32(4, 0x004E4942, true);
  return new Blob([head.buffer, jh.buffer, jsonBytes, bh.buffer, bin], { type: 'model/gltf-binary' });
}

/** A file name from the address: "<address>.glb", with characters file systems refuse taken out. */
export function glbName(card) {
  const a = String(card?.address || (isLargeCard(card) ? 'Building' : 'House')).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || (isLargeCard(card) ? 'Building' : 'House');
  return `${a}.glb`;
}

/* ── the view ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

let cssDone = false;
function ensureCss() {
  if (cssDone) return; cssDone = true;
  try {
    if (document.querySelector('link[data-house3d]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.house3d = '1';
    l.href = new URL('./house3d.css' + new URL(import.meta.url).search, import.meta.url).href;
    document.head.appendChild(l);
  } catch { /* the view still works unstyled */ }
}

function readColor(el, v) {
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${v})`;
  el.appendChild(probe);
  const s = getComputedStyle(probe).color; probe.remove();
  let m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255];
  m = s.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [0.5, 0.5, 0.5];
}

const chip = (attrs, text, pressed) => `<button type="button" class="sys-chip" ${attrs}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${esc(text)}</button>`;

/**
 * Draws the house in `container`. opts: { onClose?: () => void, view?: 'outside'|'cutaway'|'top' }.
 * Returns { destroy, setLayer(name, on), setFloor(n | id | 'all'), view(name), stats(), ready } — `ready` resolves once drawn.
 * Without WebGL it draws nothing and returns { fallback: true } with the same methods as no-ops.
 */
export function renderHouse3D(container, card, opts = {}) {
  const noop = () => {};
  if (!container || !supports3D()) {
    return { fallback: true, destroy: noop, setLayer: noop, setFloor: noop, view: noop, stats: () => null, ready: Promise.resolve(false) };
  }
  ensureCss();
  const plan = planOf(card);
  const el = document.createElement('section');
  el.className = 'h3 sys-card'; el.dataset.co = 'pp';
  el.setAttribute('aria-label', plan.large ? '3D building' : '3D house');
  if (plan.large) el.classList.add('is-large');
  const levelChips = plan.levels.map((l, i) => chip(`data-h3="floor" data-floor="${i}"`, l.name, false)).join('');
  // the key names only the kinds of basis this card holds; the address line is the typed address, marked only for example data
  const held = new Set(['likely']);
  if (plan.site) held.add(plan.site.basis);
  for (const l of plan.levels) for (const x of [...l.items, ...l.runs]) held.add(basisOf(x.basis));
  for (const o of plan.outside) held.add(basisOf(o.basis));
  if (plan.site) for (const b of [plan.shellBasis, plan.site.parcelBasis]) held.add(b);
  const key = (held.has('public') ? '<span class="h3-key-i"><span class="h3-key-solid h3-key-pub"></span>Public record</span> ' : '')
    + (held.has('record') ? '<span class="h3-key-i"><span class="h3-key-solid h3-key-rec"></span>Company record</span> ' : '')
    + '<span class="h3-key-i"><span class="h3-key-dash"></span>Likely</span>';
  el.innerHTML = `<div class="h3-head"><h3 class="sys-card-title h3-addr">${esc(plan.address || (plan.large ? 'Building' : 'House'))}${plan.example ? ' <span class="h3-ex">· Example address</span>' : ''}</h3>`
    + (opts.onClose ? `<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm h3-close" data-h3="close">Close</button>` : '') + `</div>`
    + `<div class="h3-stage"><canvas class="h3-canvas" role="img" aria-label="${plan.large ? '3D building model' : '3D house model'}"></canvas><div class="h3-labels" aria-hidden="true"></div>`
    + `<p class="h3-key">${key}</p>`
    + `<div class="h3-info" aria-live="polite" hidden></div></div>`
    + `<div class="h3-bar">`
    + `<div class="sys-chips h3-row" role="group" aria-label="View">${chip('data-h3="view" data-v="outside"', 'Outside', true)}${plan.large ? '' : chip('data-h3="view" data-v="cutaway"', 'Cutaway', false)}${chip('data-h3="view" data-v="top"', 'Top', false)}</div>`
    + (plan.large ? '' : `<div class="sys-chips h3-row" role="group" aria-label="Floor">${chip('data-h3="floor" data-floor="all"', 'All floors', true)}${levelChips}</div>`)
    + (plan.large ? '' : `<div class="sys-chips h3-row" role="group" aria-label="Layers">${LAYERS.map(([k, n]) => chip(`data-h3="layer" data-layer="${k}"`, n, true)).join('')}</div>`)   // a shell has no lines to show
    + `<div class="h3-row h3-acts">${plan.large ? '' : chip('data-h3="wallmode"', 'Behind this wall', false)}<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-h3="download">Download model</button></div>`
    + `</div>`;
  container.appendChild(el);
  const canvas = el.querySelector('canvas'), labelsEl = el.querySelector('.h3-labels'), info = el.querySelector('.h3-info');

  const state = { layers: Object.fromEntries(LAYERS.map(([k]) => [k, true])), floor: 'all', view: opts.view || 'outside', wallMode: false, picked: null, dead: false };
  let T, renderer, scene, camera, model, raf = 0, colors = {};
  const orbit = { theta: 0.62, phi: 1.08, r: 20, target: null, anim: null };
  const api = { fallback: false, destroy, setLayer, setFloor, view: setView, stats, ready: null, el };

  api.ready = (async () => {
    try { T = await loadThree(); } catch (e) {
      el.querySelector('.h3-stage').hidden = true; el.querySelector('.h3-bar').hidden = true;
      console.warn('house view: three.js did not load', e); return false;
    }
    if (state.dead) return false;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, 0.05, 500);
    scene.add(new T.HemisphereLight(0xffffff, 0x777777, 2.2));
    const sun = new T.DirectionalLight(0xffffff, 1.4); sun.position.set(8, 14, 10); scene.add(sun);
    model = buildModel(T, card);
    scene.add(model.root);
    const { W, D, top, bottom } = model.size;
    orbit.target = new T.Vector3(0, (top + bottom) / 2, 0);
    orbit.span = Math.max(W, D, top - bottom);
    orbit.radius = 0.5 * Math.hypot(W + 2, D + 2, top - bottom);
    makeLabels();
    applyTheme(); bindInput(); resize(); setView(state.view, true); apply();
    el.dataset.ready = '1';
    return true;
  })();

  /* colours follow the page theme */
  function applyTheme() {
    if (!model) return;
    for (const [k, v] of Object.entries(COLOR_VARS)) colors[k] = readColor(el, v);
    for (const m of model.mats) { const c = colors[m.userData.colorKey] || colors.other; m.color.setRGB(c[0], c[1], c[2], T.SRGBColorSpace); }
    const bg = colors.bg; scene.background = new T.Color().setRGB(bg[0], bg[1], bg[2], T.SRGBColorSpace);
    if (state.picked) highlight(state.picked, true);
    draw();
  }
  const themeObs = new MutationObserver(() => applyTheme());
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sys-theme', 'data-theme', 'class'] });
  let mq = null; try { mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', applyTheme); } catch { /* old browsers */ }

  /* labels: one per item and run; a label that would overlap one already placed is skipped, focus items first */
  let labelNodes = [];
  function makeLabels() {
    const all = [...model.items, ...model.runs].sort((a, b) => Number(b.userData.focus) - Number(a.userData.focus));
    labelNodes = all.map(o => {
      const d = document.createElement('span');
      d.className = `h3-label is-${basisOf(o.userData.basis)}`;
      d.textContent = o.userData.likely ? `${o.userData.label}, likely` : o.userData.label;
      labelsEl.appendChild(d);
      return { o, d };
    });
  }
  function placeLabels() {
    const r = canvas.getBoundingClientRect(), placed = [], v = new T.Vector3();
    for (const { o, d } of labelNodes) {
      let vis = isShown(o);
      if (vis) {
        if (o.userData.anchor) v.fromArray(o.userData.anchor); else { o.getWorldPosition(v); v.y += 0.35; }
        v.project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) vis = false;
      }
      if (!vis) { d.hidden = true; continue; }
      const w = d.offsetWidth || 80, h = d.offsetHeight || 18;
      const x = Math.min(r.width - w / 2 - 4, Math.max(w / 2 + 4, (v.x + 1) / 2 * r.width)), y = Math.max(h + 6, (1 - v.y) / 2 * r.height);
      const box = [x - w / 2, y - h - 4, x + w / 2, y - 4];
      const hit = placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]));
      const keep = !hit || o === state.picked;
      d.hidden = !keep;
      if (keep) { d.style.transform = `translate(${Math.round(box[0])}px,${Math.round(box[1])}px)`; placed.push(box); }
    }
  }

  /* visibility */
  function levelShown(levelId) {
    const sel = effectiveFloor();
    if (sel === 'all' || levelId === 'outside' || levelId === 'site') return true;
    if (state.view === 'top') return levelId === sel;
    const lv = plan.levels.find(l => l.id === levelId), s = plan.levels.find(l => l.id === sel);
    return !!lv && !!s && lv.base <= s.base;     // the chosen floor and what is under it
  }
  function effectiveFloor() { return state.floor === 'all' && state.view === 'top' ? plan.focusLevel : state.floor; }
  function isShown(o) {
    const u = o.userData;
    if (u.layer && state.layers[u.layer] === false) return false;
    if (u.role === 'roof') return state.view === 'outside' && state.floor === 'all' && state.layers.walls;
    if (u.level && !levelShown(u.level)) return false;
    if (u.role === 'wall' && state.view === 'cutaway' && u.side === 'front') return false;
    return true;
  }
  function apply() {
    if (!model) return;
    const sel = effectiveFloor();
    model.root.traverse(o => {
      if (!o.isMesh) return;
      o.visible = isShown(o);
      const u = o.userData;
      if (o.material && o.material.userData && u.role !== 'item' && u.role !== 'run') {
        // walls are see-through inside the house; dimmer under the chosen floor
        const base = o.material.userData.base;
        let op = base;
        if (u.role === 'wall') op = state.view === 'outside' && sel === 'all' ? 0.3 : state.view === 'top' ? 0.12 : 0.2;
        if (sel !== 'all' && u.level !== sel && u.level !== 'outside' && u.level !== 'site') op *= 0.5;
        if (state.wallMode && u.role === 'wall') op = Math.max(op, 0.3);
        o.material.opacity = op;
      }
      if (u.role === 'item' || u.role === 'run') {
        const dim = sel !== 'all' && u.level !== sel && u.level !== 'outside';
        o.material.opacity = (u.likely ? 0.5 : 1) * (dim ? 0.35 : 1);
        const tr = u.likely || dim;
        if (o.material.transparent !== tr) { o.material.transparent = tr; o.material.needsUpdate = true; }
        o.material.depthWrite = !tr;
      }
    });
    // controls reflect the state
    el.querySelectorAll('[data-h3="view"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.view)));
    el.querySelectorAll('[data-h3="floor"]').forEach(b => {
      const v = b.dataset.floor === 'all' ? 'all' : plan.levels[Number(b.dataset.floor)]?.id;
      b.setAttribute('aria-pressed', String(v === state.floor));
    });
    el.querySelectorAll('[data-h3="layer"]').forEach(b => b.setAttribute('aria-pressed', String(state.layers[b.dataset.layer] !== false)));
    el.querySelector('[data-h3="wallmode"]')?.setAttribute('aria-pressed', String(state.wallMode));
    el.classList.toggle('is-wallmode', state.wallMode);
    draw();
  }

  /* camera: one finger turns, two fingers or the wheel zoom */
  function placeCamera() {
    const t = orbit.target, r = orbit.r;
    camera.position.set(t.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta), t.y + r * Math.cos(orbit.phi), t.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    camera.up.set(0, 1, 0);
    if (orbit.phi < 0.01) camera.up.set(-Math.sin(orbit.theta), 0, -Math.cos(orbit.theta));
    camera.lookAt(t);
  }
  function setView(name, instant) {
    if (!VIEWS[name]) return;
    state.view = name;
    if (!camera) return;
    const [th, ph, k] = VIEWS[name];
    // far enough that the whole house (its bounding sphere) fits the narrower side of the picture
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const r = (orbit.radius / Math.sin(Math.min(vf, hf) / 2)) * (plan.large && name === 'top' ? k * 1.3 : k);   // a long shell seen from above needs room
    const goal = { theta: th, phi: ph, r };
    if (instant || reduced()) { Object.assign(orbit, goal); apply(); return; }
    const from = { theta: orbit.theta, phi: orbit.phi, r: orbit.r }, t0 = performance.now();
    orbit.anim = () => {
      const t = Math.min(1, (performance.now() - t0) / 450), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      orbit.theta = from.theta + (goal.theta - from.theta) * e; orbit.phi = from.phi + (goal.phi - from.phi) * e; orbit.r = from.r + (goal.r - from.r) * e;
      if (t >= 1) orbit.anim = null;
    };
    apply();
  }
  function draw() {
    if (!renderer || raf || state.dead) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (orbit.anim) { orbit.anim(); draw(); }
      placeCamera(); renderer.render(scene, camera); placeLabels();
    });
  }
  function resize() {
    if (!renderer) return;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  const pointers = new Map(); let down = null, pinch = 0;
  function bindInput() {
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); if (down) down.moved = 99; }
    });
    canvas.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) {
        const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
        if (down) down.moved += Math.abs(dx) + Math.abs(dy);
        orbit.anim = null;
        orbit.theta -= dx * 0.008;
        orbit.phi = Math.min(1.5, Math.max(0.001, orbit.phi - dy * 0.008));
        draw();
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoom(pinch / d); pinch = d;
      }
    });
    const up = e => {
      const was = pointers.has(e.pointerId); pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (was && down && pointers.size === 0 && down.moved < 8 && performance.now() - down.t < 600) pick(e.clientX, e.clientY);
      if (pointers.size === 0) down = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); down = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  }
  function zoom(f) { orbit.anim = null; orbit.r = Math.min(orbit.radius * 12, Math.max(orbit.radius * 0.6, orbit.r * f)); draw(); }

  /* tapping: an item or line opens its card; in "Behind this wall" a wall lists what runs inside it */
  const ray = () => new T.Raycaster();
  function pick(cx, cy) {
    if (!model) return;
    const r = canvas.getBoundingClientRect();
    const rc = ray(); rc.setFromCamera(new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const pool = (state.wallMode ? model.walls : [...model.items, ...model.runs, ...[model.outline, model.parcel].filter(Boolean)]).filter(o => o.visible && isShown(o));
    const hit = rc.intersectObjects(pool, false)[0];
    select(hit ? hit.object : null);
  }
  function highlight(o, on) {
    if (!o) return;
    const c = on ? colors.pick : colors[o.material.userData.colorKey] || colors.other;
    o.material.emissive?.setRGB(on ? c[0] * 0.35 : 0, on ? c[1] * 0.35 : 0, on ? c[2] * 0.35 : 0, T.SRGBColorSpace);
    if (o.userData.role === 'wall') o.material.opacity = on ? 0.55 : o.material.opacity;
  }
  function select(o) {
    if (state.picked) highlight(state.picked, false);
    state.picked = o;
    if (!o) { info.hidden = true; info.innerHTML = ''; apply(); return; }
    highlight(o, true);
    info.innerHTML = o.userData.role === 'wall' ? wallCard(o) : o.userData.role === 'outline' || o.userData.role === 'parcel' ? siteCard(o) : itemCard(o);
    info.hidden = false;
    info.querySelector('[data-h3="dismiss"]')?.addEventListener('click', () => select(null));
    draw();
  }
  // one chip per basis; a company record on an example card says so
  const basisChip = b => {
    const k = basisOf(b);
    const text = k === 'record' && plan.example ? EXAMPLE_LINE : BASIS_WORD[k];
    return `<span class="sys-chip ${k === 'record' ? 'sys-chip--good' : k === 'public' ? 'sys-chip--info' : 'sys-chip--warn'}">${esc(text)}</span>`;
  };
  const month = d => { const m = /^(\d{4})-(\d{2})/.exec(String(d || '')); return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1] || ''} ${m[1]}`.trim() : ''; };
  function siteCard(o) {
    const u = o.userData, S = plan.site;
    const lines = [];
    if (u.role === 'outline') {
      if (S.asOf && month(S.asOf)) lines.push(`Outline from imagery dated ${month(S.asOf)}`);
      const asOf = Date.parse(String(card.as_of || '')) || Date.now(), then = Date.parse(S.asOf);
      if (then && asOf - then > 5 * 365.25 * 864e5) lines.push('Outline may be out of date');
      if (S.precision === 'typed') lines.push('Nearest outline to the point; parcel not matched');
      const n = plan.levels.filter(l => !l.below).length;
      lines.push(`${n} ${n === 1 ? 'story' : 'stories'}: ${BASIS_WORD[S.storeysBasis].toLowerCase()} · Height: ${BASIS_WORD[S.heightBasis].toLowerCase()}`);
    }
    return `<div class="h3-info-h"><b>${esc(u.label)}</b>${basisChip(u.basis)}<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-h3="dismiss" aria-label="Close">×</button></div>`
      + lines.map(t => `<p class="h3-info-l">${esc(t)}</p>`).join('');
  }
  function floorName(id) { return id === 'outside' ? 'Outside' : plan.levels.find(l => l.id === id)?.name || ''; }
  function itemCard(o) {
    const u = o.userData;
    const where = [u.note, u.role === 'item' && !u.outside && !/^in the attic/i.test(u.note) ? floorName(u.level) : u.outside && !/^outside/i.test(u.note) ? 'Outside' : '']
      .filter(Boolean).join(' · ');
    return `<div class="h3-info-h"><b>${esc(u.label)}</b>${basisChip(u.basis)}<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-h3="dismiss" aria-label="Close">×</button></div>`
      + (where ? `<p class="h3-info-l">${esc(where)}</p>` : '') + (u.detail ? `<p class="h3-info-l">${esc(u.detail)}</p>` : '');
  }
  function wallCard(o) {
    const u = o.userData;
    const list = behindWall(plan, u.level, u.wall);
    const rows = list.length ? list.map(x => `<li><span>${esc(x.label)}${x.what === 'outside' ? ' (outside)' : ''}</span>${basisChip(x.basis)}</li>`).join('')
      : '<li><span>None drawn near this wall. Confirm on site</span></li>';
    const wires = plan.wires ? '' : '<li><span>Wire runs: not in records</span></li>';
    return `<div class="h3-info-h"><b>${esc(u.label)}, ${esc(floorName(u.level))}</b><button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-h3="dismiss" aria-label="Close">×</button></div>`
      + `<ul class="h3-info-list">${rows}${wires}</ul>`;
  }

  /* controls */
  el.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-h3]'); if (!b || !el.contains(b)) return;
    const k = b.dataset.h3;
    if (k === 'view') setView(b.dataset.v);
    else if (k === 'floor') setFloor(b.dataset.floor === 'all' ? 'all' : Number(b.dataset.floor));
    else if (k === 'layer') setLayer(b.dataset.layer, state.layers[b.dataset.layer] === false);
    else if (k === 'wallmode') { state.wallMode = !state.wallMode; select(null); if (state.wallMode) state.layers.walls = true; apply(); }
    else if (k === 'close') opts.onClose?.();
    else if (k === 'download') {
      b.disabled = true;
      try {
        const blob = await houseGLB(card);
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = glbName(card);
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch (err) { console.warn('house view: model file failed', err); }
      b.disabled = false;
    }
  });

  function setLayer(name, on) {
    const key = LAYERS.find(([k, n]) => k === name || n.toLowerCase() === String(name).toLowerCase())?.[0];
    if (!key) return;
    state.layers[key] = !!on;
    if (state.picked && !isShown(state.picked)) select(null);
    apply();
  }
  function setFloor(n) {
    if (n === 'all' || n === undefined || n === null) state.floor = 'all';
    else if (typeof n === 'number') state.floor = plan.levels[n]?.id || 'all';
    else state.floor = plan.levels.find(l => l.id === n || l.name === n)?.id || 'all';
    if (state.picked && !isShown(state.picked)) select(null);
    apply();
  }
  /** What the scene holds, for checks: every item and run with its basis, and what is visible now. */
  function stats() {
    if (!model) return null;
    const row = o => ({ name: o.name, role: o.userData.role, kind: o.userData.kind, layer: o.userData.layer, level: o.userData.level, basis: o.userData.basis,
      likely: !!o.userData.likely, visible: o.visible && isShown(o), dashedEdges: o.children.some(c => c.material?.isLineDashedMaterial),
      transparent: !!o.material.transparent,
      ...(o.userData.role === 'run' ? (() => { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox;
        return { points: o.userData.points, risers: o.userData.risers || 0, snapped: !!o.userData.snapped, top: bb.max.y, bottom: bb.min.y }; })() : {}) });
    const at = o => [Math.round(o.position.x * 1000) / 1000, Math.round(o.position.z * 1000) / 1000];
    const S = plan.site;
    const toM = p => [(p[0] - plan.w / 2) * S.kx, (p[1] - plan.h / 2) * S.kz];
    return { items: model.items.map(o => ({ ...row(o), at: at(o), snapped: !!o.userData.snapped })), runs: model.runs.map(row),
      walls: model.walls.map(o => ({ ...row(o), inside: !!o.userData.inside, a: S ? toM(o.userData.wall.a) : null, b: S ? toM(o.userData.wall.b) : null })),
      roofVisible: model.roof.visible,
      shell: model.shell.map(row), address: plan.address, example: plan.example, large: plan.large, note: plan.note,
      rooms: plan.levels.reduce((n, l) => n + l.rooms.length, 0), levelRows: plan.levels.map(l => ({ id: l.id, name: l.name, base: l.base, height: l.height })),
      roof: { top: model.size.top, flat: plan.large },
      site: S ? { ring: S.ring.map(toM), parcel: S.parcel.map(toM), basis: S.basis, heightBasis: S.heightBasis, storeysBasis: S.storeysBasis,
        shellBasis: plan.shellBasis, rot: S.rot, snapped: plan.snapped, storeyH: plan.storeyH, area: S.area } : null,
      view: state.view, floor: state.floor, layers: { ...state.layers }, levels: plan.levels.map(l => l.id),
      behind: model.walls.map((w, i) => ({ i, name: w.name, level: w.userData.level, list: behindWall(plan, w.userData.level, w.userData.wall) })) };
  }
  function destroy() {
    state.dead = true; ro.disconnect(); themeObs.disconnect(); try { mq?.removeEventListener('change', applyTheme); } catch { /* */ }
    if (raf) cancelAnimationFrame(raf);
    if (model) { model.root.traverse(o => { o.geometry?.dispose?.(); }); model.mats.forEach(m => m.dispose()); }
    renderer?.dispose(); el.remove();
  }
  api.pickAt = (x, y) => pick(x, y);
  api.selectWall = i => select(plan.large ? null : model?.walls[i] || null);
  api.select = key => select([...(model?.items || []), ...(model?.runs || []), ...(plan.large ? [] : model?.walls || []), model?.outline, model?.parcel].filter(Boolean)
    .find(o => o.userData.key === key || o.name === key) || null);
  return api;
}
