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
   also carries the footprint, the parcel, the height and the storeys with their basis, in east, up, south metres.
   The view draws a lit architectural model: matte physically based materials, a key light with soft shadows and a fill, tone
   mapping, the ground at grade with a faint grid that fades out (a basement shows through it, with a line where grade meets the
   walls), and faint outlines for what is cut away or above the chosen floor. Its finish never changes the basis rule: anything
   likely stays see-through with dashed edges, anything recorded or public is solid. Equipment is a simple solid per kind; "Start
   here" items glow in the accent and stand on an accent ring. It draws only while something moves. */

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
  sewer_cleanout: ['cyl', 0.07, 0.3, 0, 0], electric_meter: ['box', 0.3, 0.42, 0.2, 1.1],
};
// other names the cards use for the same equipment: drawn with the same symbol
const SHAPE_ALIAS = { cleanout: 'sewer_cleanout', sump: 'sump_pump', meter: 'electric_meter', ac_condenser: 'condenser', shutoff: 'main_water' };
const shapeKind = k => (SHAPE[k] ? k : SHAPE_ALIAS[k] || k);
const shapeOf = k => SHAPE[shapeKind(k)] || ['box', 0.4, 0.4, 0.4, 0];
// the frame takes in another building on the lot only while it stays this close: past 2.5 times the drawn building's own
// bounding radius the drawn building would shrink to a speck. The nearest buildings join first and each one that would
// push the frame past this is left out; when none fits, the drawn building keeps its own frame.
const OTHER_FRAME_MAX = 2.5;
// the parts that make up the drawn building in the picture: its walls, story lines, floors, roof and outline on the ground
const FRAME_ROLES = ['wall', 'storey', 'slab', 'roof', 'outline'];
// share of the half picture, each way from the centre, that the corners in that wider frame may reach (the rest is margin)
const FIT_SHARE = 0.9;
const VIEWS = { outside: [0.62, 1.08, 0.95], cutaway: [0.38, 0.86, 0.88], top: [0, 0.001, 0.8] };
const COLOR_VARS = {
  water: '--sys-info', drain: '--sys-ink-2', gas: '--sys-warn', elec: '--sys-bad', hvac: '--sys-good', walls: '--sys-mute',
  shell: '--sys-mute-2', room: '--sys-line-2', other: '--sys-ink', bg: '--sys-surface-2', pick: '--sys-ink',
  pub: '--sys-ink', rec: '--sys-violet', accent: '--sys-brand',
  // the stage: the model's tones, the ground and its grid are worked out from these (applyTheme)
  page: '--sys-bg', page2: '--sys-bg-2', page3: '--sys-bg-3', surface: '--sys-surface', ink: '--sys-ink', ink2: '--sys-ink-2',
  line: '--sys-line', line2: '--sys-line-2', mute: '--sys-mute', orange: '--sys-orange', coral: '--sys-coral',
};
// equipment is drawn as pale lit solids, as in the film; a few carry the colour of their part (the yellow gas valve, the red switch plate)
const ITEM_TONE = { gas_shutoff: 'warn', main_water: 'brass', service_switch: 'bad', fixture_shutoffs: 'brass', panel: 'steel', gas_meter: 'steel',
  sewer_cleanout: 'dark', sump_pump: 'dark', furnace: 'steel', boiler: 'steel', oil_tank: 'steel' };
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
  // another sizeable building on the lot (kind 'building', a second building and not a shed) is drawn as a plain block
  const outb = (Array.isArray(fp.outbuildings) ? fp.outbuildings : []).map(o => ({ r: cleanRing(o && o.ring_m), other: !!o && o.kind === 'building' })).filter(o => o.r.length >= 3);
  const hgt = b.height && typeof b.height === 'object' ? b.height : {};
  const st = b.storeys && typeof b.storeys === 'object' ? b.storeys : {};
  return {
    ringM, ring, kx, kz, rot: R.r, centre: R.c, U: R.U, V: R.V,
    basis: basisOf(fp.basis || 'public'), asOf: String(fp.as_of || ''), method: String(fp.method || ''), area: Math.abs(polyArea(ringM)),
    parcelM, parcel: parcelM.map(toPlan), parcelBasis: basisOf(pc && pc.basis || 'public'),
    outbuildings: outb.map(o => ({ ringM: o.r, ring: o.r.map(toPlan), other: o.other })),
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
    // matte, physically based: the view lights it; the file keeps the plain colour, opacity and side
    const m = new T.MeshStandardMaterial({ color: 0x888888, roughness: 0.86, metalness: 0, transparent: likely || kind === 'shell', opacity: kind === 'shell' ? 0.22 : likely ? 0.5 : 1,
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
    addEdges(slab, 'shell', slab.userData.basis);
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
      const s = shapeOf(it.kind);
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
      const s = shapeOf(o.kind);
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
    const sheds = site.outbuildings.filter(o => !o.other), others = site.outbuildings.filter(o => o.other);
    site.outbuildings.forEach(ob => {
      // a shed or detached garage: 2.4 m; another building on the lot: a plain flat block about 4 m high, named for what it is
      const set = ob.other ? others : sheds, i = set.indexOf(ob), word = ob.other ? 'Other building' : 'Outbuilding';
      const m = new T.Mesh(prismGeom(T, ob.ring.map(M), 0, ob.other ? 4 : 2.4), mat('shell', 'likely', 'shell'));
      m.name = `${word}${set.length > 1 ? ` ${i + 1}` : ''}`;
      m.userData = { role: 'outbuilding', kind: ob.other ? 'building' : 'outbuilding', layer: 'site', level: 'site', basis: 'likely', outline_basis: 'public', label: word };
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

/** A simple solid for each kind of equipment, built from a few boxes and cylinders (a symbol, never a likeness): a tank with its
    flue, a cabinet with its plenum, a valve with its handle. Centred as the plain shape was: a box or cylinder spans -h/2 to h/2
    on y, a valve sits round the origin. One merged geometry, so each item stays one object. */
function itemGeom(T, kind, s) {
  const [type, a, h, d] = s, P = [];
  const add = (g, x = 0, y = 0, z = 0) => { g.translate(x, y, z); P.push(g); };
  const box = (w, hh, dd, x, y, z) => add(new T.BoxGeometry(w, hh, dd), x, y, z);
  const cyl = (r, hh, x, y, z, axis, r2 = r) => {
    const g = new T.CylinderGeometry(r, r2, hh, 24);
    if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    add(g, x, y, z);
  };
  const k = shapeKind(kind);
  if (k === 'water_heater') { cyl(a, h * 0.86, 0, -h * 0.07); cyl(a * 0.92, h * 0.04, 0, h * 0.38); cyl(a * 0.18, h * 0.1, 0, h * 0.45); cyl(a * 0.5, h * 0.03, 0, h * 0.4) }
  else if (k === 'furnace' || k === 'air_handler') { box(a, h * 0.74, d, 0, -h * 0.13); box(a * 0.84, h * 0.24, d * 0.84, 0, h * 0.37); if (k === 'furnace') cyl(0.06, h * 0.2, a * 0.28, h * 0.4, -d * 0.2); }
  else if (k === 'boiler') { box(a, h * 0.86, d, 0, -h * 0.07); box(a * 0.5, h * 0.06, d * 0.5, 0, h * 0.39); cyl(0.07, h * 0.12, 0, h * 0.44, -d * 0.15); }
  else if (k === 'oil_tank') { cyl(Math.min(a, h) * 0.5, d * 0.96, 0, h * 0.5 - Math.min(a, h) * 0.5, 0, 'z'); box(a * 0.7, h * 0.3, 0.08, 0, -h * 0.35, d * 0.3); box(a * 0.7, h * 0.3, 0.08, 0, -h * 0.35, -d * 0.3); }
  else if (k === 'heat_pump' || k === 'condenser') { box(a, h * 0.9, d, 0, -h * 0.05); cyl(a * 0.36, h * 0.06, 0, h * 0.42); cyl(a * 0.1, h * 0.1, 0, h * 0.44); }
  else if (k === 'generator') { box(a, h * 0.8, d, 0, -h * 0.1); box(a * 0.94, h * 0.18, d * 0.9, 0, h * 0.39); cyl(0.04, h * 0.2, a * 0.38, h * 0.4, 0); }
  else if (k === 'panel') { box(a, h, d); box(a * 0.86, h * 0.88, 0.02, 0, 0, d / 2 + 0.01); }
  else if (k === 'service_switch') { box(a, h, d); box(0.03, h * 0.4, 0.04, 0, 0, d / 2 + 0.02); }
  else if (k === 'gas_meter' || k === 'electric_meter') {
    box(a, h * 0.74, d * 0.8, 0, -h * 0.13);
    cyl(a * 0.28, d * 0.3, 0, -h * 0.08, d * 0.48, 'z');
    if (k === 'gas_meter') { cyl(0.025, h * 0.26, -a * 0.26, h * 0.37); cyl(0.025, h * 0.26, a * 0.26, h * 0.37); } else box(a * 0.5, h * 0.24, d * 0.4, 0, h * 0.38);
  }
  else if (k === 'sump_pump') { cyl(a, h * 0.3, 0, -h * 0.35); cyl(a * 0.45, h * 0.45, 0, -h * 0.02); cyl(0.025, h * 0.5, a * 0.3, h * 0.24); }
  else if (k === 'sewer_cleanout') { cyl(a, h * 0.82, 0, -h * 0.09); cyl(a * 1.35, h * 0.18, 0, h * 0.41); }
  else if (k === 'gas_shutoff') { cyl(0.03, 0.36, 0, 0, 0, 'x'); cyl(0.06, 0.12, 0, 0, 0, 'x'); box(0.22, 0.025, 0.04, 0.08, 0.075, 0); }
  else if (k === 'main_water') { cyl(0.035, 0.38, 0, 0, 0, 'x'); cyl(0.065, 0.13, 0, 0, 0, 'x'); cyl(0.012, 0.08, 0, 0.08, 0); const t = new T.TorusGeometry(0.08, 0.014, 8, 24); t.rotateX(Math.PI / 2); add(t, 0, 0.12, 0); }
  else if (k === 'fixture_shutoffs') { cyl(0.02, 0.22, 0, 0, 0, 'x'); cyl(0.04, 0.08, 0, 0, 0, 'x'); box(0.07, 0.035, 0.02, 0, 0.05, 0); }
  else if (type === 'cyl') cyl(a, h);
  else if (type === 'ball') add(new T.SphereGeometry(a, 20, 14));
  else box(a, h, d);
  const g = mergeGeoms(T, P);
  if (k === 'gas_shutoff' || k === 'main_water' || k === 'fixture_shutoffs') g.scale(1.7, 1.7, 1.7);   // a valve is drawn larger than life, so it reads
  return g;
}

function itemMesh(T, it, mat, addEdges) {
  const g = itemGeom(T, it.kind, shapeOf(it.kind));
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
    label, note: String(it.note || ''), detail: it.detail ? String(it.detail) : '', focus: it.focus === true, focusOff: it.focus === false, key: it.key, pick: true, snapped: !!it.snapped };
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
        plan_rot_deg: Math.round(site.rot * 100) / 100, outbuildings: site.outbuildings.map(o => ({ ring_m: o.ringM, basis: 'public', ...(o.other ? { kind: 'building' } : {}) })) },
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
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mixC = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = c => `rgb(${c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',')})`;
const INTRO_MS = 2600;        // the turn-in when the view first opens (none under reduced motion)
const SECTION = 1.2;          // the cutaway cuts the walls of the floor in view at this height, so you look over them (a dollhouse section)
// a card frames the floor in view at a three-quarter angle, looking down about 37 degrees, the house about 70 percent of the stage
const CARD_VIEWS = { outside: [0.62, 1.02], cutaway: [0.6, 0.93], top: [0, 0.001] };
const CARD_SHARE = 0.9;
const MOVE_MS = 650;          // a turn to an item or a floor
const CUT_FACING = 0.3;       // in the cutaway, an outside wall that faces the camera this much or more is cut away
const easeInOut = t => 0.5 - 0.5 * Math.cos(Math.PI * t);

/**
 * Draws the house in `container`. opts: { onClose?: () => void, view?: 'outside'|'cutaway'|'top',
 *   embed?: true (inside a card: no own heading, compact controls), follow?: true (open on the floor that holds the "Start here"
 *   items, frame that floor, and turn to a floor or an item when it is chosen), intro?: true (a slow turn-in on first draw, none
 *   under reduced motion), onSelect?: (key | null) => void (an item or line was picked in the model, or the pick was cleared) }.
 * Returns { destroy, setLayer(name, on), setFloor(n | id | 'all'), view(name), focus(key), hover(key | null), stats(), ready }
 * — `ready` resolves once drawn. Without WebGL it draws nothing and returns { fallback: true } with the same methods as no-ops.
 * The scene is drawn only when something changes (a turn, a pick, a theme change), never in a standing loop.
 */
export function renderHouse3D(container, card, opts = {}) {
  const noop = () => {};
  if (!container || !supports3D()) {
    return { fallback: true, destroy: noop, setLayer: noop, setFloor: noop, view: noop, focus: noop, hover: noop, stats: () => null, ready: Promise.resolve(false) };
  }
  ensureCss();
  const plan = planOf(card);
  const embed = !!opts.embed, follow = !!opts.follow;
  const el = document.createElement('section');
  el.className = embed ? 'h3 is-embed' : 'h3 sys-card'; el.dataset.co = 'pp';   // inside a card it is part of that card, not a card of its own
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
  const views = `<div class="sys-chips h3-row" role="group" aria-label="View">${chip('data-h3="view" data-v="outside"', 'Outside', true)}${plan.large ? '' : chip('data-h3="view" data-v="cutaway"', 'Cutaway', false)}${chip('data-h3="view" data-v="top"', 'Top', false)}</div>`;
  const floorsRow = plan.large ? '' : `<div class="sys-chips h3-row" role="group" aria-label="Floor">${chip('data-h3="floor" data-floor="all"', 'All floors', true)}${levelChips}</div>`;
  const layersRow = plan.large ? '' : `<div class="sys-chips h3-row" role="group" aria-label="Layers">${LAYERS.map(([k, n]) => chip(`data-h3="layer" data-layer="${k}"`, n, true)).join('')}</div>`;   // a shell has no lines to show
  const download = '<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-h3="download">Download model</button>';
  const acts = `<div class="h3-row h3-acts">${plan.large ? '' : chip('data-h3="wallmode"', 'Behind this wall', false)}${download}</div>`;
  const head = embed ? '' : `<div class="h3-head"><h3 class="sys-card-title h3-addr">${esc(plan.address || (plan.large ? 'Building' : 'House'))}${plan.example ? ' <span class="h3-ex">· Example address</span>' : ''}</h3>`
    + (opts.onClose ? `<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm h3-close" data-h3="close">Close</button>` : '') + `</div>`;
  // inside a card the view and floor chips stay in reach; the layers, "Behind this wall" and the file fold under "Layers and file"
  const bar = embed
    ? `<div class="h3-bar"><div class="h3-main">${views}${floorsRow}</div>`
      + (plan.large ? `<div class="h3-row h3-acts">${download}</div>` : `<details class="h3-more"><summary>Layers and file</summary><div class="h3-more-body">${layersRow}${acts}</div></details>`) + `</div>`
    : `<div class="h3-bar">${views}${floorsRow}${layersRow}${acts}</div>`;
  el.innerHTML = head
    + `<div class="h3-stage"><canvas class="h3-canvas" role="img" aria-label="${plan.large ? '3D building model' : '3D house model'}"></canvas><div class="h3-labels" aria-hidden="true"></div>`
    + `<p class="h3-key">${key}</p>`
    // inside a card the picked item's details sit under the stage, never over the model
    + (embed ? `</div><div class="h3-info" aria-live="polite" hidden></div>` : `<div class="h3-info" aria-live="polite" hidden></div></div>`)
    + bar;
  container.appendChild(el);
  const canvas = el.querySelector('canvas'), labelsEl = el.querySelector('.h3-labels'), info = el.querySelector('.h3-info');

  const state = { layers: Object.fromEntries(LAYERS.map(([k]) => [k, true])), floor: 'all', view: opts.view || 'outside', wallMode: false, picked: null, hover: null, dead: false };
  // a card opens on the floor that holds the "Start here" items, with the floors above it drawn as faint outlines
  if (follow && !plan.large && plan.focusLevel && plan.levels.length > 1 && plan.focusLevel !== plan.levels[plan.levels.length - 1].id) state.floor = plan.focusLevel;
  let T, renderer, scene, under, camera, model, raf = 0, colors = {}, lights = null, ground = null, ghosts = [], marks = [], pickRing = null, lastCut = '';
  const contact = [], glowLines = [];   // a second, additive copy of each structural edge: a soft glow on the dark stage   // soft contact shadows: under the house, under each item, along the foot of each wall
  const orbit = { theta: 0.62, phi: 1.08, r: 20, target: null, anim: null, spin: null, fit: null, own: 0, preset: false, base: null };
  const api = { fallback: false, destroy, setLayer, setFloor, view: setView, focus: focusOn, hover: hoverKey, stats, ready: null, el };

  api.ready = (async () => {
    try { T = await loadThree(); } catch (e) {
      el.querySelector('.h3-stage').hidden = true; el.querySelector('.h3-bar').hidden = true;
      console.warn('house view: three.js did not load', e); return false;
    }
    if (state.dead) return false;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    renderer.toneMapping = T.NeutralToneMapping ?? T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;   // filtered with a radius: soft edges at a fraction of the cost
    scene = new T.Scene();
    under = new T.Scene();   // the ground, drawn first and under everything, so the basement shows through it below grade
    camera = new T.PerspectiveCamera(40, 1, 0.05, 500);
    model = buildModel(T, card);
    scene.add(model.root);
    const { W, D, top, bottom } = model.size;
    orbit.target = new T.Vector3(0, (top + bottom) / 2, 0);
    orbit.span = Math.max(W, D, top - bottom);
    orbit.radius = orbit.own = 0.5 * Math.hypot(W + 2, D + 2, top - bottom);
    frameOthers();
    orbit.base = { target: orbit.target.clone(), fit: orbit.fit };
    stage();
    makeLabels();
    applyTheme(true); bindInput(); resize(); setView(state.view, true); apply();
    if (opts.intro && !reduced()) {
      // the turn-in: from a quarter turn back and a little further off, eased into the resting view, then it stops
      const goal = { theta: orbit.theta, phi: orbit.phi, r: orbit.r };
      Object.assign(orbit, { theta: goal.theta - 1.05, phi: Math.max(0.3, goal.phi - 0.2), r: goal.r * 1.32 });
      animateTo(goal, INTRO_MS);
    }
    el.dataset.ready = '1';
    return true;
  })();

  // another building on the lot joins the frame, so the picture holds it whole; sheds and the parcel edge never widen it
  function frameOthers() {
    const others = model.shell.filter(o => o.userData.role === 'outbuilding' && o.userData.kind === 'building');
    if (!others.length) return;
    model.root.updateMatrixWorld(true);
    // the drawn building as one box, roof included; each other block by its own corners
    const own = new T.Box3();
    model.root.traverse(o => { if (o.isMesh && FRAME_ROLES.includes(o.userData.role)) own.expandByObject(o); });
    if (own.isEmpty()) return;
    const centre = own.getCenter(new T.Vector3()), pts = [];
    for (let i = 0; i < 8; i++) pts.push(new T.Vector3(i & 1 ? own.max.x : own.min.x, i & 2 ? own.max.y : own.min.y, i & 4 ? own.max.z : own.min.z));
    const blocks = others.map(o => {
      const p = o.geometry.attributes.position, v = [];
      for (let i = 0; i < p.count; i++) v.push(new T.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
      const b = new T.Box3().setFromPoints(v);
      // the gap on the ground between the drawn building and this block, then how far its centre is
      const gap = Math.hypot(Math.max(0, b.min.x - own.max.x, own.min.x - b.max.x), Math.max(0, b.min.z - own.max.z, own.min.z - b.max.z));
      return { v, b, gap, d: b.getCenter(new T.Vector3()).distanceTo(centre) };
    }).sort((a, b) => a.gap - b.gap || a.d - b.d);
    // nearest first: each block joins while the frame stays within OTHER_FRAME_MAX of the drawn building's own reach
    const box = own.clone(), s = new T.Vector3();
    let kept = 0;
    for (const k of blocks) {
      const next = box.clone().union(k.b); next.getSize(s);
      if (0.5 * Math.hypot(s.x + 2, s.z + 2, s.y) > OTHER_FRAME_MAX * orbit.own) continue;
      box.copy(next); pts.push(...k.v); kept++;
    }
    if (!kept) return;   // every other building is far off: the drawn building keeps its own frame
    box.getSize(s);
    orbit.target = box.getCenter(new T.Vector3());
    orbit.radius = 0.5 * Math.hypot(s.x + 2, s.z + 2, s.y);
    orbit.fit = pts;
    camera.far = Math.max(camera.far, orbit.radius * 14); camera.updateProjectionMatrix();   // the far block stays drawn out to the widest zoom
  }
  // how far back the camera stands, looking along (theta, phi) at `target`, so every point is inside FIT_SHARE of the picture
  function fitDistance(pts, theta, phi, vf, hf, target = orbit.target, share = follow && !orbit.base?.fit ? CARD_SHARE : FIT_SHARE) {
    const dir = new T.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
    const up = phi < 0.01 ? new T.Vector3(-Math.sin(theta), 0, -Math.cos(theta)) : new T.Vector3(0, 1, 0);
    const m = new T.Matrix4().lookAt(dir, new T.Vector3(), up), right = new T.Vector3(), camUp = new T.Vector3(), z = new T.Vector3();
    m.extractBasis(right, camUp, z);
    const tx = Math.tan(hf / 2) * share, ty = Math.tan(vf / 2) * share, c = new T.Vector3();
    let d = 0;
    for (const p of pts) {
      c.subVectors(p, target);
      d = Math.max(d, c.dot(dir) + Math.abs(c.dot(right)) / tx, c.dot(dir) + Math.abs(c.dot(camUp)) / ty);
    }
    return d;
  }
  /** The frame for a floor (or 'all'): what the camera looks at and the points it keeps in the picture. Without `follow`, and on a
      lot with another building, it is always the drawn building's own frame. */
  function frameFor(id) {
    if (!follow || orbit.base.fit) return orbit.base;
    const lv = id === 'all' ? null : plan.levels.find(l => l.id === id);
    const { bottom, top } = model.size;
    const y0 = lv ? lv.base - 0.1 : bottom, y1 = lv ? lv.base + Math.min(lv.height, SECTION + 0.4) : top + (plan.large ? 0.3 : 0);
    const ring = plan.site ? plan.site.ring.map(p => [(p[0] - plan.w / 2) * plan.site.kx, (p[1] - plan.h / 2) * plan.site.kz])
      : [[-model.size.W / 2, -model.size.D / 2], [model.size.W / 2, -model.size.D / 2], [model.size.W / 2, model.size.D / 2], [-model.size.W / 2, model.size.D / 2]];
    const pts = [];
    for (const [x, z] of ring) { pts.push(new T.Vector3(x, y0, z), new T.Vector3(x, y1, z)); }
    for (const o of model.items) if (o.userData.outside) { const p = o.getWorldPosition(new T.Vector3()); pts.push(p); }
    // the whole building stays in the picture (the floors above as faint outlines); the camera looks a little towards the chosen floor
    const box = new T.Box3().setFromPoints(pts), whole = new T.Box3().setFromPoints(pts.concat(lv ? [new T.Vector3(0, bottom, 0), new T.Vector3(0, top, 0)] : []));
    const target = whole.getCenter(new T.Vector3()).lerp(box.getCenter(new T.Vector3()), 0.7);
    // the chosen floor is the subject: it is framed whole with about one storey above and below it, so its fixtures are large
    // enough to read. The rest of the house (faint glass) may run out of the top of the picture; "All floors" shows it whole.
    model.roof.geometry.computeBoundingBox();
    const roofTop = model.roof.geometry.boundingBox.max.y + model.roof.position.y;
    const lo = Math.max(bottom, y0 - 1.2), hi = Math.min(roofTop, y1 + 2.2);
    const all = lv ? pts.concat(ring.flatMap(([x, z]) => [new T.Vector3(x, lo, z), new T.Vector3(x, hi, z)])) : pts;
    return { target, fit: all };
  }

  /* the stage: lights, a soft shadow on the ground, the ground with a faint grid, faint outlines for what is cut or hidden */
  function stage() {
    const R = orbit.radius;
    const hemi = new T.HemisphereLight(0xffffff, 0xffffff, 1.1);
    const key = new T.DirectionalLight(0xffffff, 2.4);
    const fill = new T.DirectionalLight(0xffffff, 0.55);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 3;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025;
    if ('intensity' in key.shadow) key.shadow.intensity = 0.8;
    const sc = key.shadow.camera, ext = R * 1.6;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.1; sc.far = R * 10;
    const t = orbit.target;
    key.position.set(t.x - R * 1.3, t.y + R * 2.6, t.z + R * 1.7); key.target.position.copy(t);
    fill.position.set(t.x + R * 2, t.y + R * 0.8, t.z - R * 1.6); fill.target.position.copy(t);
    scene.add(hemi, key, key.target, fill, fill.target);
    lights = { hemi, key, fill };
    // shadows land on a plane at grade with a hole where the building stands (the floors carry their own)
    const gR = Math.max(R * 5, 30, ...(plan.site && plan.site.parcel.length ? plan.site.parcel.map(p => 1.3 * Math.hypot((p[0] - plan.w / 2) * plan.site.kx, (p[1] - plan.h / 2) * plan.site.kz)) : [0]));
    const shape = new T.Shape([[-gR, -gR], [gR, -gR], [gR, gR], [-gR, gR]].map(p => new T.Vector2(p[0], p[1])));
    const foot = plan.site ? plan.site.ring.map(p => [(p[0] - plan.w / 2) * plan.site.kx, (plan.front === 'top' ? -1 : 1) * (p[1] - plan.h / 2) * plan.site.kz])
      : [[-model.size.W / 2, -model.size.D / 2], [model.size.W / 2, -model.size.D / 2], [model.size.W / 2, model.size.D / 2], [-model.size.W / 2, model.size.D / 2]];
    shape.holes.push(new T.Path(foot.map(p => new T.Vector2(p[0], -p[1]))));
    const sg = new T.ShapeGeometry(shape); sg.rotateX(-Math.PI / 2);
    const shadow = new T.Mesh(sg, new T.ShadowMaterial({ opacity: 0.28, transparent: true, depthWrite: false }));
    shadow.position.y = 0.002; shadow.receiveShadow = true; shadow.renderOrder = -1; shadow.raycast = () => {};
    scene.add(shadow);
    const tex = new T.CanvasTexture(document.createElement('canvas'));
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const disc = new T.Mesh(new T.CircleGeometry(gR, 96), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.004;
    under.add(disc);
    ground = { disc, tex, shadow, R: gR };
    // a line round the building at grade, where a basement goes below the ground
    if (plan.levels.some(l => l.below)) {
      const pts = foot.map(p => new T.Vector3(p[0], 0.012, p[1])); pts.push(pts[0].clone());
      const grade = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false }));
      grade.userData = { colorKey: 'grade' }; grade.raycast = () => {};
      scene.add(grade); ground.grade = grade;
    }
    // shadows: the floors, the equipment and the lines cast; a see-through wall does not
    model.root.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } });
    // a barely-there outline of the floors and roof above the floor in view
    model.root.updateMatrixWorld(true);
    const gm = new T.LineBasicMaterial({ transparent: true, opacity: 0.1, depthWrite: false });
    gm.userData = { colorKey: 'ghost' };
    // and the outside walls and roof above it as very faint frosted glass, so the whole house still reads
    const glass = new T.MeshStandardMaterial({ transparent: true, opacity: 0.08, depthWrite: false, roughness: 0.3, metalness: 0, side: T.DoubleSide });
    glass.userData = { colorKey: 'walls' }; ghosts.glass = glass;
    for (const o of model.shell) {
      const u = o.userData;
      if (!((u.role === 'wall' && !u.inside) || u.role === 'roof')) continue;
      const g = new T.Mesh(o.geometry, glass);
      g.matrixAutoUpdate = false; g.matrix.copy(o.matrixWorld); g.visible = false; g.raycast = () => {};
      g.userData = { of: o }; scene.add(g); ghosts.push(g);
    }
    for (const o of model.shell) {
      const u = o.userData;
      if (!(u.role === 'slab' || u.role === 'roof' || (u.role === 'wall' && !u.inside))) continue;
      const g = new T.LineSegments(new T.EdgesGeometry(o.geometry, 20), gm);
      g.matrixAutoUpdate = false; g.matrix.copy(o.matrixWorld); g.visible = false; g.raycast = () => {};
      g.userData = { of: o }; scene.add(g); ghosts.push(g);
    }
    ghosts.mat = gm;
    // the outward direction of each outside wall on the ground, for the cut
    const flip = plan.front === 'top' ? -1 : 1;
    for (const w of model.walls) {
      const u = w.userData, wl = u.wall; if (u.inside || !wl) continue;
      let n;
      if (plan.site) {
        const [a, b] = [wl.a, wl.b], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (inRing([m[0] + n[0] * 0.3, m[1] + n[1] * 0.3], plan.site.ring)) n = [-n[0], -n[1]];
        n = [n[0], flip * n[1]];
      } else n = { front: [0, 1], rear: [0, -1], left: [-1, 0], right: [1, 0] }[u.side] || [0, 0];
      u.normal = n;
    }
    // the cut edge of each wall: a lighter cap where the section cuts it
    for (const w of model.walls) {
      const len = w.geometry.parameters.width;
      const cm = new T.MeshStandardMaterial({ roughness: 0.9, metalness: 0, transparent: true, depthWrite: false });
      cm.userData = { colorKey: 'cap' };
      const cap = new T.Mesh(new T.BoxGeometry(len, 0.012, WALL_T + 0.004), cm);
      cap.position.set(w.position.x, 0, w.position.z); cap.rotation.y = w.rotation.y; cap.visible = false; cap.raycast = () => {};
      scene.add(cap); w.userData.cap = cap;
    }
    contactShadows(foot);
    model.root.traverse(o => {
      if (!(o.isLineSegments && o.userData.role === 'edge')) return;
      const r = o.parent?.userData.role; if (!['wall', 'slab', 'roof', 'outbuilding'].includes(r)) return;
      const src = o.material, m = src.isLineDashedMaterial ? new T.LineDashedMaterial({ dashSize: src.dashSize, gapSize: src.gapSize }) : new T.LineBasicMaterial();
      Object.assign(m, { transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
      const g = new T.LineSegments(o.geometry, m); g.raycast = () => {}; g.userData = { role: 'glow' }; g.scale.setScalar(1.004);
      o.parent.add(g); glowLines.push(g);
    });
    // "Start here": an accent ring on the floor under each item (and a thin stem up to one on the wall); the picked item gets its own
    for (const o of model.items) if (isFocusItem(o)) marks.push(ringFor(o, 'accent'));
    pickRing = ringFor(null, 'pick');
  }
  /** Soft dark textures standing in for ambient shadow, so the house sits on the ground and things on their floors even where the
      shadow map is faint: a pool under the house, a spot under each item, a soft band along the foot of each wall. */
  function contactShadows(foot) {
    const tex = (w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); return t; };
    const blob = tex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    const band = tex(8, 64, (g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    const mk = (map, op, of) => {
      const m = new T.MeshBasicMaterial({ alphaMap: map, transparent: true, opacity: op, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      m.userData = { colorKey: 'shade' };
      const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      const x = new T.Mesh(g, m); x.raycast = () => {}; x.userData = { of }; x.renderOrder = 1; scene.add(x); contact.push(x); return x;
    };
    contact.maps = [blob, band];
    // under the house: a pool a little wider than the outline, at grade
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of foot) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const pool = mk(blob, 0.5, model.walls[0] || model.root);
    pool.scale.set((x1 - x0) * 1.25 + 1.5, 1, (z1 - z0) * 1.25 + 1.5);
    contact.pool = pool; pool.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2);
    pool.userData.of = { visible: true };
    scene.remove(pool); under.add(pool); pool.material.depthTest = false;   // drawn with the ground, under everything: it never darkens the house itself
    for (const o of model.items) {
      const b = new T.Box3().setFromObject(o), sz = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
      const y = o.userData.level === 'outside' ? 0 : floorYOf(o);
      const k = Math.max(0.35, Math.max(sz.x, sz.z) * 1.7);
      const sh = mk(blob, b.min.y - y > 0.3 ? 0.3 : 0.6, o);
      sh.scale.set(k, 1, k); sh.position.set(c.x, y + 0.03, c.z);
    }
    for (const w of model.walls) {
      const lv = plan.levels.find(l => l.id === w.userData.level); if (!lv) continue;
      const st = mk(band, w.userData.inside ? 0.28 : 0.38, w);
      st.scale.set(w.geometry.parameters.width, 1, 0.75); st.rotation.y = w.rotation.y; st.position.set(w.position.x, lv.base + 0.03, w.position.z);
    }
  }
  function floorYOf(o) {
    const lv = plan.levels.find(l => l.id === o.userData.level);
    return lv ? lv.base : 0;
  }
  function ringFor(o, colorKey) {
    const grp = new T.Group(); grp.raycast = () => {};
    const m = new T.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false, side: T.DoubleSide });
    m.userData = { colorKey };
    const ring = new T.Mesh(new T.RingGeometry(1, 1.16, 48), m); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2;
    const stem = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 1, 6), m); stem.renderOrder = 2;
    grp.add(ring, stem); grp.userData = { of: null, ring, stem, mat: m };
    scene.add(grp);
    placeRing(grp, o);
    return grp;
  }
  function placeRing(grp, o) {
    grp.userData.of = o; grp.visible = !!o;
    if (!o) return;
    const b = new T.Box3().setFromObject(o), s = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
    const y = Math.max(floorYOf(o), o.userData.level === 'outside' ? 0 : -99), r = Math.max(0.22, Math.max(s.x, s.z) / 2 + 0.14) * (grp.userData.mat.userData.colorKey === 'pick' ? 1.25 : 1);
    const { ring, stem } = grp.userData;
    ring.scale.set(r, r, 1); ring.position.set(c.x, y + 0.03, c.z);
    const gap = b.min.y - y;
    stem.visible = gap > 0.25;
    stem.scale.set(1, Math.max(0.01, gap), 1); stem.position.set(c.x, y + gap / 2, c.z);
  }
  const isFocusItem = o => !!o && o.userData.role === 'item' && (o.userData.focus || (!o.userData.focusOff && plan.focus.includes(o.userData.kind)));

  /* colours follow the page theme: the model's tones are worked out from the tokens, so both themes read as a lit model */
  function drawGround() {
    if (!ground) return;
    const N = 1024, c = ground.tex.image;
    c.width = c.height = N;
    const g = c.getContext('2d'), R = ground.R;
    g.clearRect(0, 0, N, N);
    // a pool of light under the house, the ground falling off into the stage around it
    const pool = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    pool.addColorStop(0, css(colors.groundLit)); pool.addColorStop(0.3, css(colors.groundFill)); pool.addColorStop(1, css(colors.groundFill));
    g.fillStyle = pool; g.fillRect(0, 0, N, N);
    // a faint grid: a line a metre apart (wider on a big lot), every fifth a little stronger
    const pxm = N / (2 * R);
    let step = 1; while (step * pxm < 9) step *= 2.5;
    g.lineWidth = 1;
    for (let i = 0, k = 0; i <= R; i += step, k++) {
      for (const s of i ? [-1, 1] : [1]) {
        const p = N / 2 + s * i * pxm;
        g.strokeStyle = css(k % 5 ? colors.gridMinor : colors.gridMajor);
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, N); g.moveTo(0, p); g.lineTo(N, p); g.stroke();
      }
    }
    // fades out towards the edge of the disc, so the ground has no hard rim
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(N / 2, N / 2, N * 0.08, N / 2, N / 2, N / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.3, 'rgba(0,0,0,0.9)'); fade.addColorStop(0.65, 'rgba(0,0,0,0.35)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'source-over';
    ground.tex.needsUpdate = true;
  }
  function applyTheme(noDraw) {
    if (!model) return;
    for (const [k, v] of Object.entries(COLOR_VARS)) colors[k] = readColor(el, v);
    const dark = lum(colors.page) < 0.4;
    // the model: a pale matte card-stock tone on the dark stage, a soft grey on the light one; edges a step darker
    colors.walls = dark ? mixC(colors.ink2, colors.ink, 0.3) : mixC(colors.line2, colors.surface, 0.25);
    colors.shell = dark ? mixC(colors.ink2, colors.surface, 0.12) : mixC(colors.line2, colors.ink2, 0.12);
    colors.room = dark ? mixC(colors.ink2, colors.ink, 0.15) : mixC(colors.line, colors.surface, 0.4);
    // edges: a cool near-white that glows on the dark stage (ink with a little info), a cool slate on the light one
    colors.edge = dark ? mixC(colors.ink, colors.water, 0.28) : mixC(colors.ink2, colors.water, 0.3);
    colors.ghost = colors.edge;
    colors.concrete = dark ? mixC(colors.ink2, colors.page, 0.5) : mixC(colors.line2, colors.mute, 0.35);
    colors.concreteFloor = dark ? mixC(colors.ink2, colors.page, 0.6) : mixC(colors.line2, colors.mute, 0.2);
    // lines: copper water, yellow gas, dark grey drain (the plan's key keeps its own)
    colors.pipe = { water: mixC(colors.orange, colors.coral, 0.35).map(v => v * 0.85), gas: colors.gas, drain: dark ? mixC(colors.ink2, colors.page, 0.62) : mixC(colors.ink2, colors.ink, 0.4),
      elec: colors.elec, hvac: dark ? mixC(colors.ink2, colors.ink, 0.3) : colors.mute };
    colors.fixture = dark ? mixC(colors.ink, colors.ink2, 0.35) : mixC(colors.surface, colors.line2, 0.55);
    colors.itemTone = { warn: colors.gas, bad: colors.elec, brass: mixC(colors.orange, colors.gas, 0.5), steel: dark ? mixC(colors.ink2, colors.page, 0.25) : mixC(colors.line2, colors.mute, 0.5),
      dark: dark ? mixC(colors.ink2, colors.page, 0.7) : mixC(colors.ink2, colors.ink, 0.3) };
    colors.grade = colors.ghost;
    colors.groundFill = dark ? mixC(colors.page3, colors.surface, 0.35) : mixC(colors.page2, colors.surface, 0.2);
    colors.groundLit = dark ? mixC(colors.groundFill, colors.ink2, 0.12) : colors.surface;
    // a faint cool grid, as on the film's studio floor
    colors.gridMinor = dark ? mixC(mixC(colors.line2, colors.water, 0.18), colors.groundFill, 0.25) : mixC(colors.line, colors.groundFill, 0.4);
    colors.gridMajor = dark ? mixC(colors.line2, colors.water, 0.32) : mixC(colors.line, colors.line2, 0.5);
    const set = (m, c) => m.color.setRGB(c[0], c[1], c[2], T.SRGBColorSpace);
    for (const m of model.mats) {
      const k = m.userData.colorKey;
      const structural = k === 'walls' || k === 'shell' || k === 'room';
      set(m, (m.isLineBasicMaterial || m.isLineDashedMaterial) && structural ? colors.edge : colors[k] || colors.other);
    }
    model.root.traverse(o => {
      if (!o.isMesh) return;
      const u = o.userData, below = plan.levels.find(l => l.id === u.level)?.below;
      if (u.role === 'storey') set(o.material, colors.edge);
      else if (u.role === 'run') set(o.material, colors.pipe[u.layer] || colors.pipe.water);
      else if (u.role === 'item') set(o.material, ITEM_TONE[shapeKind(u.kind)] ? colors.itemTone[ITEM_TONE[shapeKind(u.kind)]] : colors.fixture);
      else if (below && u.role === 'wall') set(o.material, colors.concrete);   // the basement: concrete
      else if (below && (u.role === 'slab' || u.role === 'room')) set(o.material, colors.concreteFloor);
    });
    for (const g of glowLines) { set(g.material, colors.edge); g.visible = dark; }
    if (ghosts.mat) { set(ghosts.mat, colors.ghost); ghosts.mat.opacity = dark ? 0.4 : 0.3; }
    if (ground && ground.grade) set(ground.grade.material, colors.grade);
    for (const g of [...marks, pickRing].filter(Boolean)) set(g.userData.mat, g.userData.mat.userData.colorKey === 'pick' ? colors.pick : colors.accent);
    colors.cap = dark ? mixC(colors.ink, colors.walls, 0.25) : mixC(colors.surface, colors.walls, 0.15);
    colors.shade = dark ? mixC(colors.page, [0, 0, 0], 0.5) : mixC(colors.ink, colors.page, 0.15);
    for (const w of model.walls) if (w.userData.cap) set(w.userData.cap.material, colors.cap);
    for (const x of contact) set(x.material, colors.shade);
    if (contact.pool) contact.pool.material.opacity = dark ? 0.55 : 0.22;
    if (ghosts.glass) { set(ghosts.glass, colors.walls); ghosts.glass.opacity = dark ? 0.1 : 0.14; }
    // each room a slightly different floor tone, so the rooms can be told apart
    model.shell.filter(o => o.userData.role === 'room').forEach((o, i) => set(o.material, mixC(colors.room, i % 2 ? colors.walls : colors.shell, [0, 0.35, 0.18, 0.5][i % 4])));
    if (lights) {
      // a warm key from one side, a cool fill from the other
      const warm = mixC([1, 1, 1], colors.accent, 0.16), cool = mixC([1, 1, 1], colors.water, 0.28);
      lights.key.color.setRGB(warm[0], warm[1], warm[2], T.SRGBColorSpace); lights.fill.color.setRGB(cool[0], cool[1], cool[2], T.SRGBColorSpace);
      lights.hemi.color.setRGB(1, 1, 1);
      const gc = mixC(colors.page, [1, 1, 1], dark ? 0.35 : 0.1);
      lights.hemi.groundColor.setRGB(gc[0], gc[1], gc[2], T.SRGBColorSpace);
      lights.hemi.intensity = dark ? 0.85 : 1.0;
      lights.key.intensity = dark ? 3.2 : 3.0;
      lights.fill.intensity = dark ? 1.0 : 0.8;
      if (ground) ground.shadow.material.opacity = dark ? 0.55 : 0.3;
    }
    drawGround();
    for (const o of [...model.items, ...model.runs, ...model.walls]) glow(o);
    if (!noDraw) draw();
  }
  const themeObs = new MutationObserver(() => applyTheme());
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sys-theme', 'data-theme', 'class'] });
  let mq = null; try { mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', applyTheme); } catch { /* old browsers */ }

  /* labels: one per item and line. "Start here" items and the picked one are always named; any other only while pointed at or
     focused in the list. A label that would overlap one already placed moves up a step, then is left out (the picked one never). */
  let labelNodes = [];
  function makeLabels() {
    const all = [...model.items, ...model.runs].sort((a, b) => Number(isFocusItem(b)) - Number(isFocusItem(a)));
    labelNodes = all.map(o => {
      const d = document.createElement('span');
      d.className = `h3-label is-${basisOf(o.userData.basis)}${isFocusItem(o) ? ' is-focus' : ''}`;
      d.textContent = o.userData.likely ? `${o.userData.label}, likely` : o.userData.label;
      d.hidden = true;
      labelsEl.appendChild(d);
      if (o.userData.role === 'item') { const b = new T.Box3().setFromObject(o); o.userData.top = [(b.min.x + b.max.x) / 2, b.max.y + 0.06, (b.min.z + b.max.z) / 2]; }
      return { o, d };
    });
  }
  const named = o => isFocusItem(o) || o === state.picked || o === state.hover;
  function placeLabels() {
    const r = canvas.getBoundingClientRect(), v = new T.Vector3();
    const keyEl = el.querySelector('.h3-key');   // the key sits top left: labels keep out of it
    const placed = keyEl && keyEl.offsetWidth ? [[keyEl.offsetLeft - 4, 0, keyEl.offsetLeft + keyEl.offsetWidth + 4, keyEl.offsetTop + keyEl.offsetHeight + 2]] : [];
    const order = [...labelNodes].sort((a, b) => Number(b.o === state.picked) - Number(a.o === state.picked) || Number(b.o === state.hover) - Number(a.o === state.hover));
    for (const { o, d } of order) {
      let vis = isShown(o) && named(o);
      if (vis) {
        if (o.userData.anchor) v.fromArray(o.userData.anchor); else if (o.userData.top) v.fromArray(o.userData.top); else { o.getWorldPosition(v); v.y += 0.35; }
        v.project(camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) vis = false;
      }
      if (!vis) { d.hidden = true; continue; }
      d.hidden = false;   // measured shown: a label hidden on the last frame reads 0 px wide, and its real box would overlap
      d.classList.toggle('is-on', o === state.picked);
      const w = d.offsetWidth || 80, h = d.offsetHeight || 18;
      const x = Math.min(r.width - w / 2 - 4, Math.max(w / 2 + 4, (v.x + 1) / 2 * r.width)), py = (1 - v.y) / 2 * r.height;
      let box = null, stem = 10;
      // up a step at a time; a "Start here" or picked label may also move to one side or below its item, and is always shown
      const must = isFocusItem(o) || o === state.picked, step = h + 6, side = w / 2 + 8;
      const tries = [[0, 0], [0, 1], [0, 2]].concat(must ? [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, 3], [0, -2.2], [-1, 2], [1, 2]] : []);
      for (const [sx, lift] of tries) {
        const cx = Math.min(r.width - w / 2 - 4, Math.max(w / 2 + 4, x + sx * side));
        const y = Math.min(r.height - 4, Math.max(h + 6, py - 10 - lift * step));
        const b = [cx - w / 2, y - h, cx + w / 2, y];
        if (!placed.some(q => !(b[2] + 3 < q[0] || b[0] > q[2] + 3 || b[3] + 3 < q[1] || b[1] > q[3] + 3))) { box = b; stem = sx ? 0 : Math.max(0, py - y); break; }
      }
      if (!box && o === state.picked) { const y = Math.max(h + 6, py - 10); box = [x - w / 2, y - h, x + w / 2, y]; stem = Math.max(4, py - y); }
      d.hidden = !box;
      if (box) { d.style.transform = `translate(${Math.round(box[0])}px,${Math.round(box[1])}px)`; d.style.setProperty('--h3-stem', `${Math.round(stem)}px`); placed.push(box); }
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
  // in the cutaway the walls of the floor in view (the chosen one, or the top one shown) are cut at SECTION, so you look over them
  function sectionLevel() {
    if (state.view !== 'cutaway' || plan.large) return null;
    const sel = effectiveFloor();
    if (sel !== 'all') return sel;
    return plan.levels.filter(l => levelShown(l.id)).at(-1)?.id || null;
  }
  const isCut = () => false;   // (no wall is taken away: the section shows them all)
  function isShown(o) {
    const u = o.userData;
    if (u.layer && state.layers[u.layer] === false) return false;
    if (u.role === 'roof') return state.view === 'outside' && state.floor === 'all' && state.layers.walls;
    if (u.level && !levelShown(u.level)) return false;
    if (isCut(u)) return false;
    return true;
  }
  const cutKey = () => `${state.view}:${sectionLevel()}`;
  function applySection() {
    const sec = sectionLevel();
    for (const w of model.walls) {
      const u = w.userData, lv = plan.levels.find(l => l.id === u.level);
      if (!lv) continue;
      const h = w.geometry.parameters.height, cut = u.level === sec && h > SECTION + 0.05;
      u.section = cut;
      w.scale.y = cut ? SECTION / h : 1;
      w.position.y = lv.base + (cut ? SECTION : h) / 2;
      const cap = u.cap;
      if (cap) { cap.visible = cut && isShown(w); cap.position.y = lv.base + SECTION + 0.006; cap.material.opacity = isSolid(u.basis) ? 1 : 0.75; }
    }
  }
  function apply(noDraw) {
    if (!model) return;
    const sel = effectiveFloor();
    model.root.traverse(o => {
      if (!o.isMesh) return;
      o.visible = isShown(o);
      const u = o.userData;
      const dim = sel !== 'all' && u.level !== sel && u.level !== 'outside' && u.level !== 'site';
      let op = 1;
      if (u.role === 'item' || u.role === 'run') {
        op = (u.likely ? 0.55 : 1) * (dim ? 0.35 : 1);
      } else if (o.material && o.material.userData) {
        // recorded or public parts are solid; likely ones are see-through, walls most of all, so the inside reads
        const solid = isSolid(u.basis);
        if (u.role === 'wall') op = solid ? (state.view === 'top' ? 0.35 : 1) : state.view === 'top' ? 0.16 : u.inside ? 0.32 : 0.38;
        else if (u.role === 'slab') op = solid ? 1 : 0.9;
        else if (u.role === 'room') op = solid ? 1 : 0.6;
        else if (u.role === 'roof' || u.role === 'outbuilding') op = solid ? 1 : 0.42;
        else if (u.role === 'storey') op = solid ? 1 : 0.7;
        else op = solid ? 1 : 0.55;
        if (dim) op *= 0.5;
        if (state.wallMode && u.role === 'wall') op = Math.max(op, 0.3);
        if (u.role === 'wall' && o === state.picked) op = Math.max(op, 0.55);
      }
      if (u.role === 'wall') o.material.roughness = isSolid(u.basis) ? 0.9 : 0.35;   // a likely wall is frosted glass, a recorded one matte
      o.material.opacity = op;
      const tr = op < 1;
      if (o.material.transparent !== tr) { o.material.transparent = tr; o.material.needsUpdate = true; }
      o.material.depthWrite = !tr || u.role === 'slab';
      o.castShadow = o.visible && (u.role === 'item' || u.role === 'run' || ((u.role === 'slab' || u.role === 'wall' || u.role === 'roof' || u.role === 'outbuilding' || u.role === 'storey') && op >= 0.8));
    });
    for (const g of ghosts) {
      const o = g.userData.of, u = o.userData;
      g.visible = state.view !== 'top' && !o.visible && !(u.layer && state.layers[u.layer] === false) && (u.role !== 'roof' || state.layers.walls);
    }
    for (const g of marks) g.visible = !!g.userData.of && isShown(g.userData.of);
    if (pickRing) pickRing.visible = !!state.picked && state.picked.userData.role === 'item' && isShown(state.picked);
    if (ground && ground.grade) ground.grade.visible = state.view !== 'top';
    lastCut = cutKey();
    applySection();
    for (const x of contact) x.visible = !!x.userData.of && x.userData.of.visible;
    // controls reflect the state
    el.querySelectorAll('[data-h3="view"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.view)));
    el.querySelectorAll('[data-h3="floor"]').forEach(b => {
      const v = b.dataset.floor === 'all' ? 'all' : plan.levels[Number(b.dataset.floor)]?.id;
      b.setAttribute('aria-pressed', String(v === state.floor));
    });
    el.querySelectorAll('[data-h3="layer"]').forEach(b => b.setAttribute('aria-pressed', String(state.layers[b.dataset.layer] !== false)));
    el.querySelector('[data-h3="wallmode"]')?.setAttribute('aria-pressed', String(state.wallMode));
    el.classList.toggle('is-wallmode', state.wallMode);
    if (!noDraw) draw();
  }

  /* camera: one finger turns, two fingers or the wheel zoom; a turn keeps going a little and slows to a stop */
  function placeCamera() {
    const t = orbit.target, r = orbit.r;
    camera.position.set(t.x + r * Math.sin(orbit.phi) * Math.sin(orbit.theta), t.y + r * Math.cos(orbit.phi), t.z + r * Math.sin(orbit.phi) * Math.cos(orbit.theta));
    camera.up.set(0, 1, 0);
    if (orbit.phi < 0.01) camera.up.set(-Math.sin(orbit.theta), 0, -Math.cos(orbit.theta));
    camera.lookAt(t);
  }
  function animateTo(goal, ms) {
    orbit.spin = null;
    const from = { theta: orbit.theta, phi: orbit.phi, r: orbit.r, target: orbit.target.clone() };
    if (!ms || reduced()) {
      orbit.anim = null;
      Object.assign(orbit, { theta: goal.theta, phi: goal.phi, r: goal.r });
      if (goal.target) orbit.target.copy(goal.target);
      apply(); return;
    }
    const t0 = performance.now(), ease = ms === INTRO_MS ? easeInOut : t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
    orbit.anim = () => {
      const t = Math.min(1, (performance.now() - t0) / ms), e = ease(t);
      orbit.theta = from.theta + (goal.theta - from.theta) * e; orbit.phi = from.phi + (goal.phi - from.phi) * e; orbit.r = from.r + (goal.r - from.r) * e;
      if (goal.target) orbit.target.lerpVectors(from.target, goal.target, e);
      if (t >= 1) orbit.anim = null;
    };
    apply();
  }
  function aspectFov() {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const vf = (camera.fov * Math.PI) / 180;
    return [vf, 2 * Math.atan(Math.tan(vf / 2) * aspect)];
  }
  function setView(name, instant) {
    if (!VIEWS[name]) return;
    state.view = name;
    if (!camera) return;
    const [th, ph] = follow ? CARD_VIEWS[name] : VIEWS[name], k = VIEWS[name][2];
    orbit.preset = true;   // the camera stands where the view puts it until someone turns or zooms
    const [vf, hf] = aspectFov();
    const F = follow ? frameFor(state.floor) : orbit.base;
    // far enough that the whole house (its bounding sphere) fits the narrower side of the picture
    const r = F.fit ? fitDistance(F.fit, th, ph, vf, hf, F.target)   // the drawn building and another on the lot, each whole in the picture
      : (orbit.radius / Math.sin(Math.min(vf, hf) / 2)) * (plan.large && name === 'top' ? k * 1.3 : k);   // a long shell seen from above needs room
    animateTo({ theta: th, phi: ph, r, target: follow ? F.target : null }, instant ? 0 : 450);
  }
  /** On a card, choosing a floor turns the camera to frame it (the angle is kept). */
  function frameFloor(instant) {
    if (!follow || !camera) return;
    const [vf, hf] = aspectFov(), F = frameFor(state.floor);
    orbit.preset = true;
    animateTo({ theta: orbit.theta, phi: orbit.phi, r: fitDistance(F.fit, orbit.theta, orbit.phi, vf, hf, F.target), target: F.target }, instant ? 0 : MOVE_MS);
  }
  function stepSpin() {
    const s = orbit.spin;
    orbit.theta -= s.th; orbit.phi = Math.min(1.5, Math.max(0.001, orbit.phi - s.ph));
    s.th *= 0.9; s.ph *= 0.9;
    if (Math.abs(s.th) + Math.abs(s.ph) < 0.0004) orbit.spin = null;
  }
  function render() {
    renderer.clear();
    renderer.render(under, camera);
    renderer.render(scene, camera);
  }
  function draw() {
    if (!renderer || raf || state.dead) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (state.dead) return;
      if (orbit.anim) orbit.anim();
      if (orbit.spin) stepSpin();
      if (cutKey() !== lastCut) apply(true);   // turning round the cutaway changes which outside walls are cut
      placeCamera(); render(); placeLabels();
      if (orbit.anim || orbit.spin) draw();   // drawn only while something moves
    });
  }
  function resize() {
    if (!renderer) return;
    if (!canvas.isConnected) { destroy(); return; }   // the card was taken off the page: free what the view drew
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    // a frame that holds another building is fitted to the picture's size, so it is fitted again when the picture changes size,
    // unless someone has turned or zoomed since the view was chosen
    if (follow && orbit.preset && !orbit.anim && orbit.base) frameFloor(true);
    else if (orbit.fit && orbit.preset) setView(state.view, !orbit.anim); else draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  const pointers = new Map(); let down = null, pinch = 0, lastMove = null, hoverAt = null, hoverRaf = 0;
  function bindInput() {
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      orbit.spin = null;
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); if (down) down.moved = 99; }
    });
    canvas.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) { if (e.pointerType === 'mouse') queueHover(e.clientX, e.clientY); return; }
      const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) {
        const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
        if (down) down.moved += Math.abs(dx) + Math.abs(dy);
        orbit.anim = null; orbit.preset = false;
        orbit.theta -= dx * 0.008;
        orbit.phi = Math.min(1.5, Math.max(0.001, orbit.phi - dy * 0.008));
        lastMove = { th: dx * 0.008, ph: dy * 0.008, t: performance.now() };
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
      // let go mid-turn: the house keeps turning a little and slows to a stop (not under reduced motion)
      else if (was && pointers.size === 0 && lastMove && performance.now() - lastMove.t < 80 && !reduced()) { orbit.spin = { th: lastMove.th, ph: lastMove.ph }; draw(); }
      if (pointers.size === 0) { down = null; lastMove = null; }
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); down = null; lastMove = null; });
    canvas.addEventListener('pointerleave', () => { if (!pointers.size) setHover(null); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
    el.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      // Escape closes the item's card first, then leaves "Behind this wall"
      if (state.picked) { select(null); e.stopPropagation(); }
      else if (state.wallMode) { state.wallMode = false; apply(); e.stopPropagation(); }
    });
  }
  function zoom(f) { orbit.anim = null; orbit.spin = null; orbit.preset = false; orbit.r = Math.min(orbit.radius * 12, Math.max(orbit.own * 0.6, orbit.r * f)); draw(); }   // in as close as to the drawn building alone

  /* pointing (a mouse): the item or line under it is named and the pointer says it can be pressed */
  function queueHover(x, y) {
    hoverAt = [x, y];
    if (hoverRaf || !model) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (!hoverAt || state.dead || state.wallMode) return;
      setHover(hitAt(hoverAt[0], hoverAt[1]));
    });
  }
  function setHover(o) {
    if (state.hover === o) return;
    state.hover = o;
    canvas.style.cursor = o ? 'pointer' : '';
    draw();
  }
  function hoverKey(k) { if (model) setHover(k ? findKey(k) : null); }

  /* tapping: an item or line opens its card; in "Behind this wall" a wall lists what runs inside it */
  function hitAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    const rc = new T.Raycaster(); rc.setFromCamera(new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const pool = (state.wallMode ? model.walls : [...model.items, ...model.runs, ...[model.outline, model.parcel].filter(Boolean)]).filter(o => o.visible && isShown(o));
    const hit = rc.intersectObjects(pool, false)[0];
    return hit ? hit.object : null;
  }
  function pick(cx, cy) {
    if (!model) return;
    select(hitAt(cx, cy), true);
  }
  // the glow: "Start here" items in the accent from the start; the picked one stronger (a wall in the ink tone)
  function glow(o) {
    const m = o && o.material; if (!m || !m.emissive) return;
    const on = o === state.picked, f = isFocusItem(o);
    const c = on ? (o.userData.role === 'wall' ? colors.pick : colors.accent) : f ? colors.accent : null;
    const k = on ? 0.5 : 0.28;
    if (c) m.emissive.setRGB(c[0] * k, c[1] * k, c[2] * k, T.SRGBColorSpace); else m.emissive.setRGB(0, 0, 0);
  }
  function select(o, fromModel) {
    const was = state.picked;
    state.picked = o;
    if (was) glow(was);
    if (pickRing) placeRing(pickRing, o && o.userData.role === 'item' ? o : null);
    if (!o) { info.hidden = true; info.innerHTML = ''; apply(); if (fromModel || was) notify(null, fromModel); return; }
    glow(o);
    info.innerHTML = o.userData.role === 'wall' ? wallCard(o) : o.userData.role === 'outline' || o.userData.role === 'parcel' ? siteCard(o) : itemCard(o);
    info.hidden = false;
    info.querySelector('[data-h3="dismiss"]')?.addEventListener('click', () => select(null, true));
    apply();
    notify(o, fromModel);
  }
  function notify(o, fromModel) {
    if (!fromModel || typeof opts.onSelect !== 'function') return;
    const k = o && (o.userData.role === 'item' || o.userData.role === 'run') ? o.userData.key : null;
    try { opts.onSelect(k); } catch (e) { console.warn('house view: select callback failed', e); }
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
    else if (k === 'wallmode') { state.wallMode = !state.wallMode; select(null, true); if (state.wallMode) { state.layers.walls = true; setHover(null); } apply(); }
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
    if (state.picked && !isShown(state.picked)) select(null, true);
    apply();
  }
  function setFloor(n) {
    if (n === 'all' || n === undefined || n === null) state.floor = 'all';
    else if (typeof n === 'number') state.floor = plan.levels[n]?.id || 'all';
    else state.floor = plan.levels.find(l => l.id === n || l.name === n)?.id || 'all';
    if (state.picked && !isShown(state.picked)) select(null, true);
    apply();
    frameFloor();
  }
  const findKey = k => [...(model?.items || []), ...(model?.runs || [])].find(o => o.userData.key === k || o.name === k) || null;
  /** Turns the model to an item or line (by key): shows its floor, turns the camera round to its side of the house (the near walls
      are cut there, so it is in sight) and picks it. Returns false when there is no such object. */
  function focusOn(k) {
    if (!model) return false;
    const o = findKey(k); if (!o) return false;
    const u = o.userData;
    if (u.layer && state.layers[u.layer] === false) state.layers[u.layer] = true;
    const lv = plan.levels.find(l => l.id === u.level);
    if (lv && !levelShown(lv.id)) state.floor = lv.id;
    if (follow && lv && state.floor !== 'all' && state.floor !== lv.id) state.floor = lv.id;
    if (state.view === 'outside' && !plan.large) state.view = 'cutaway';
    select(o);
    const F = follow ? frameFor(state.floor) : orbit.base;
    const p = u.top ? new T.Vector3().fromArray(u.top) : u.anchor ? new T.Vector3().fromArray(u.anchor) : o.getWorldPosition(new T.Vector3());
    const dx = p.x - F.target.x, dz = p.z - F.target.z;
    let th = Math.hypot(dx, dz) > 0.4 ? Math.atan2(dx, dz) : orbit.theta;
    th += Math.round((orbit.theta - th) / (2 * Math.PI)) * 2 * Math.PI;   // the short way round
    const ph = state.view === 'top' ? VIEWS.top[1] : (follow ? CARD_VIEWS : VIEWS).cutaway[1];
    const [vf, hf] = aspectFov();
    const target = F.target.clone().lerp(p, 0.7);
    const r = (F.fit ? fitDistance(F.fit, th, ph, vf, hf, target) : orbit.radius / Math.sin(Math.min(vf, hf) / 2)) * 0.95;
    orbit.preset = false;
    animateTo({ theta: th, phi: ph, r, target }, MOVE_MS);
    return true;
  }
  /** What the scene holds, for checks: every item and run with its basis, and what is visible now. */
  function stats() {
    if (!model) return null;
    const row = o => ({ name: o.name, role: o.userData.role, kind: o.userData.kind, layer: o.userData.layer, level: o.userData.level, basis: o.userData.basis,
      likely: !!o.userData.likely, visible: o.visible && isShown(o), dashedEdges: o.children.some(c => c.material?.isLineDashedMaterial),
      transparent: !!o.material.transparent,
      ...(o.userData.role === 'run' ? (() => { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox;
        return { points: o.userData.points, risers: o.userData.risers || 0, snapped: !!o.userData.snapped, top: bb.max.y, bottom: bb.min.y }; })() : {}),
      ...(o.userData.role === 'outbuilding' ? (() => { o.geometry.computeBoundingBox(); return { top: o.geometry.boundingBox.max.y, label: o.userData.label }; })() : {}) });
    const at = o => [Math.round(o.position.x * 1000) / 1000, Math.round(o.position.z * 1000) / 1000];
    const S = plan.site;
    const toM = p => [(p[0] - plan.w / 2) * S.kx, (p[1] - plan.h / 2) * S.kz];
    return { items: model.items.map(o => ({ ...row(o), at: at(o), snapped: !!o.userData.snapped, focus: isFocusItem(o), glow: !!o.material.emissive && o.material.emissive.r + o.material.emissive.g + o.material.emissive.b > 0 })),
      runs: model.runs.map(row),
      walls: model.walls.map(o => ({ ...row(o), inside: !!o.userData.inside, section: !!o.userData.section, a: S ? toM(o.userData.wall.a) : null, b: S ? toM(o.userData.wall.b) : null })),
      roofVisible: model.roof.visible,
      shell: model.shell.map(row), address: plan.address, example: plan.example, large: plan.large, note: plan.note,
      rooms: plan.levels.reduce((n, l) => n + l.rooms.length, 0), levelRows: plan.levels.map(l => ({ id: l.id, name: l.name, base: l.base, height: l.height })),
      roof: { top: model.size.top, flat: plan.large },
      site: S ? { ring: S.ring.map(toM), parcel: S.parcel.map(toM), basis: S.basis, heightBasis: S.heightBasis, storeysBasis: S.storeysBasis,
        shellBasis: plan.shellBasis, rot: S.rot, snapped: plan.snapped, storeyH: plan.storeyH, area: S.area } : null,
      view: state.view, floor: state.floor, layers: { ...state.layers }, levels: plan.levels.map(l => l.id),
      behind: model.walls.map((w, i) => ({ i, name: w.name, level: w.userData.level, list: behindWall(plan, w.userData.level, w.userData.wall) })),
      picked: state.picked ? state.picked.userData.key || state.picked.name : null, moving: !!(orbit.anim || orbit.spin), drawing: !!raf,
      labels: labelNodes.filter(n => !n.d.hidden).map(n => n.d.textContent),
      render: { toneMapped: renderer.toneMapping !== T.NoToneMapping, shadows: renderer.shadowMap.enabled, pixelRatio: renderer.getPixelRatio(), programs: renderer.info.programs?.length || 0,
        ghosts: ghosts.filter(g => g.visible).length, section: model.walls.filter(w => w.userData.section && w.visible).map(w => w.name), contact: contact.filter(x => x.visible).length },
      frame: frameStats() };
  }
  /** Where the camera stands and what the picture holds, for checks: the screen box (canvas px) of the drawn building's walls,
      story lines, floors, roof and outline and of each outbuilding, for the camera as it is now, and whether any corner is cut by the near or far plane. */
  function frameStats() {
    const w = canvas.clientWidth, h = canvas.clientHeight, v = new T.Vector3();
    placeCamera(); camera.updateMatrixWorld(); model.root.updateMatrixWorld(true);
    const box = meshes => {
      const b = [Infinity, Infinity, -Infinity, -Infinity]; let clipped = false;
      for (const m of meshes) {
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).project(camera);
          if (Math.abs(v.z) > 1) clipped = true;   // past the far plane or nearer than the near one
          const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
          b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
        }
      }
      return { box: b.map(n => Math.round(n * 10) / 10), clipped };
    };
    const building = [];
    model.root.traverse(o => { if (o.isMesh && FRAME_ROLES.includes(o.userData.role)) building.push(o); });
    return { w, h, fov: camera.fov, size: { ...model.size }, target: orbit.target.toArray(), radius: orbit.radius, own: orbit.own, r: orbit.r,
      theta: orbit.theta, phi: orbit.phi, preset: orbit.preset, fitted: !!orbit.fit,
      building: box(building),
      outbuildings: model.shell.filter(o => o.userData.role === 'outbuilding').map(o => ({ name: o.name, kind: o.userData.kind, ...box([o]) })) };
  }
  function destroy() {
    if (state.dead) return;
    state.dead = true; ro.disconnect(); themeObs.disconnect(); try { mq?.removeEventListener('change', applyTheme); } catch { /* */ }
    if (raf) cancelAnimationFrame(raf);
    if (hoverRaf) cancelAnimationFrame(hoverRaf);
    const free = root => root?.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m && !model?.mats.includes(m)) { m.map?.dispose?.(); m.dispose?.(); } });
    if (model) { model.root.traverse(o => { o.geometry?.dispose?.(); }); model.mats.forEach(m => m.dispose()); }
    free(scene); free(under);
    ground?.tex.dispose(); (contact.maps || []).forEach(t => t.dispose());
    if (renderer) { renderer.dispose(); try { renderer.forceContextLoss(); } catch { /* */ } }
    el.remove();
  }
  api.pickAt = (x, y) => pick(x, y);
  api.selectWall = i => select(plan.large ? null : model?.walls[i] || null);
  api.select = key => select([...(model?.items || []), ...(model?.runs || []), ...(plan.large ? [] : model?.walls || []), model?.outline, model?.parcel].filter(Boolean)
    .find(o => o.userData.key === key || o.name === key) || null);
  return api;
}
