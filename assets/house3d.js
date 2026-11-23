/* The 3D house for a service call, built only from a `floor_sketch` card (server/workspace.py sketch()).
   renderHouse3D(container, card, opts) draws it with three.js (loaded from unpkg, jsdelivr fallback, only when the view opens);
   houseGLB(card) returns the same model as a binary glTF file. Nothing here makes a network call besides loading the library.

   What the card holds and how it is drawn:
   - floors[].w / h (feet) give the footprint; house.stories and house.foundation give the storeys and the basement. The server
     derives the footprint from the floor area, so the shell (walls, floors, rooms, roof) is always drawn as likely: translucent,
     with dashed edges.
   - floors[].rooms are the rooms as the sketch lays them out (today: the basement and an attached garage).
   - floors[].items and outside[] are equipment; floors[].runs are water, gas and drain lines. Each keeps its own basis:
     "record" is drawn solid, anything else is likely (translucent, dashed outline or dashed line, label ends in "likely").
   - Heights are a drawing convention (the card has none): lines on a basement floor run under its ceiling, drains near the
     floor; on a slab or crawlspace house they run just under the first floor.
   Every item and run becomes one named object whose userData (and glTF extras) carry role, kind, layer, basis and floor. */

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
const RUN_LAYER = { water: 'water', drain: 'drain', gas: 'gas', wire: 'elec', electric: 'elec', duct: 'hvac' };
const RUN_NAME = { water: 'Water line', drain: 'Drain', gas: 'Gas line', wire: 'Wire run', electric: 'Wire run', duct: 'Duct' };
const RUN_R = { water: 0.03, gas: 0.025, drain: 0.055, wire: 0.015, electric: 0.015, duct: 0.12 };
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
};

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

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isRec = b => b === 'record';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* ── the plan: the card read into levels, items, runs, walls (pure data, feet and metres) ───────────────────────────────── */

/** The card as levels (bottom to top) with their contents; used by the scene, the file and "Behind this wall". */
export function planOf(card) {
  const c = card && typeof card === 'object' ? card : {};
  const house = c.house && typeof c.house === 'object' ? c.house : {};
  const floors = (Array.isArray(c.floors) ? c.floors : []).filter(f => f && typeof f === 'object');
  const f0 = floors[0] || {};
  const w = Math.max(10, num(f0.w) || 40), h = Math.max(10, num(f0.h) || 30);
  const stories = Math.max(1, num(house.stories) || 1);
  const hasBase = house.foundation === 'basement' && house.basement !== 'none' || floors.some(f => f.id === 'basement');
  const levels = [];
  if (hasBase) levels.push({ id: 'basement', name: 'Basement', base: -BASE_H, height: BASE_H, below: true });
  const names = ['First floor', 'Second floor', 'Third floor'], ids = ['first', 'second', 'third'];
  const n = Math.min(3, Math.ceil(stories));
  for (let i = 0; i < n; i++) {
    const half = i === n - 1 && stories % 1 !== 0;
    levels.push({ id: ids[i], name: names[i], base: i * STOREY, height: half ? HALF : STOREY, half });
  }
  for (const f of floors) {
    if (!levels.some(l => l.id === f.id)) levels.push({ id: String(f.id), name: String(f.name || f.id), base: levels.length * STOREY, height: STOREY });
  }
  levels.sort((a, b) => a.base - b.base);
  for (const l of levels) {
    const f = floors.find(x => x.id === l.id);
    l.inCard = !!f;
    if (f && f.name) l.name = String(f.name);
    l.rooms = (f && Array.isArray(f.rooms) ? f.rooms : []).filter(r => r && typeof r === 'object').map(r => ({
      x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h), label: String(r.label || 'Room'),
    }));
    l.items = (f && Array.isArray(f.items) ? f.items : []).filter(i => i && typeof i === 'object').map((it, i) => ({ ...it, key: `${l.id}-i${i}` }));
    l.runs = (f && Array.isArray(f.runs) ? f.runs : []).filter(r => r && typeof r === 'object' && Array.isArray(r.points))
      .map((r, i) => ({ ...r, key: `${l.id}-r${i}`, points: r.points.filter(p => Array.isArray(p)).map(p => [num(p[0]), num(p[1])]) }))
      .filter(r => r.points.length >= 2);
  }
  const outside = (Array.isArray(c.outside) ? c.outside : []).filter(o => o && typeof o === 'object').map((o, i) => ({ ...o, key: `out-${i}` }));
  const front = c.front === 'top' ? 'top' : 'bottom';
  const focusLevel = (() => {
    const focus = (Array.isArray(c.focus) ? c.focus : []).map(String);
    for (const k of focus) { const l = levels.find(x => x.items.some(i => String(i.kind) === k)); if (l) return l.id; }
    let best = levels[0]?.id, nmax = -1;
    for (const l of levels) { const k = l.items.length + l.runs.length; if (k > nmax) { nmax = k; best = l.id; } }
    return best;
  })();
  return { address: String(c.address || ''), w, h, levels, outside, front, focusLevel, focus: (Array.isArray(c.focus) ? c.focus : []).map(String),
    wires: levels.some(l => l.runs.some(r => RUN_LAYER[r.kind] === 'elec')) };
}

/** Exterior walls of a level as segments in feet: front is the street side. */
function exteriorWalls(plan) {
  const { w, h, front } = plan;
  const fy = front === 'top' ? 0 : h, ry = front === 'top' ? h : 0;
  return [
    { id: 'front', name: 'Front wall', a: [0, fy], b: [w, fy], side: 'front' },
    { id: 'rear', name: 'Rear wall', a: [0, ry], b: [w, ry], side: 'rear' },
    { id: 'left', name: 'Left wall', a: [0, 0], b: [0, h], side: 'left' },
    { id: 'right', name: 'Right wall', a: [w, 0], b: [w, h], side: 'right' },
  ];
}
/** Room walls that are not on the outside of the house. */
function roomWalls(plan, level) {
  const out = [];
  const onEdge = (a, b) => (a[0] === b[0] && (a[0] <= 0 || a[0] >= plan.w)) || (a[1] === b[1] && (a[1] <= 0 || a[1] >= plan.h));
  level.rooms.forEach((r, ri) => {
    if (r.x <= 0 && r.y <= 0 && r.w >= plan.w && r.h >= plan.h) return;   // a room that is the whole floor has no walls of its own
    const c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      if (!onEdge(a, b)) out.push({ id: `room${ri}-${i}`, name: `${r.label} wall`, a, b, side: null });
    }
  });
  return out;
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
  const parts = geoms.map(g => { const ng = g.index ? g : g.toNonIndexed(); return ng; });
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
/** A line through points as one mesh: whole when solid, short dashes when dashed. */
function lineGeom(T, pts, r, dashed) {
  const parts = [];
  const dash = 0.28, gap = 0.18;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = a.distanceTo(b);
    if (!dashed) { const s = segment(T, a, b, r); if (s) parts.push(s); }
    else {
      for (let t = 0; t < L; t += dash + gap) {
        const s = segment(T, a.clone().lerp(b, t / L), a.clone().lerp(b, Math.min(L, t + dash) / L), r); if (s) parts.push(s);
      }
    }
    if (!dashed && i > 0) { const j = new T.SphereGeometry(r, 8, 6); j.translate(a.x, a.y, a.z); parts.push(j); }
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

/** Builds the model as a three.js Group (metres, Y up, the street side towards +Z). Every object carries userData. */
function buildModel(T, card) {
  const plan = planOf(card);
  const W = plan.w * FT, D = plan.h * FT;
  const flip = plan.front === 'top' ? -1 : 1;
  const X = x => (num(x) - plan.w / 2) * FT, Z = y => flip * (num(y) - plan.h / 2) * FT;
  const root = new T.Group(); root.name = 'House';
  root.userData = { role: 'house', address: plan.address };
  const mats = [];
  const mat = (colorKey, basis, kind = 'solid') => {
    const likely = !isRec(basis);
    const m = new T.MeshLambertMaterial({ color: 0x888888, transparent: likely || kind === 'shell', opacity: kind === 'shell' ? 0.22 : likely ? 0.5 : 1,
      depthWrite: !(likely || kind === 'shell'), side: kind === 'shell' ? T.DoubleSide : T.FrontSide });
    m.name = `${colorKey}${likely ? ' likely' : ' record'}`;
    m.userData = { colorKey, base: m.opacity };
    mats.push(m); return m;
  };
  const edgeMat = (colorKey, basis) => {
    const m = isRec(basis) ? new T.LineBasicMaterial({ color: 0x888888 }) : new T.LineDashedMaterial({ color: 0x888888, dashSize: 0.12, gapSize: 0.08 });
    m.userData = { colorKey }; mats.push(m); return m;
  };
  const addEdges = (mesh, colorKey, basis) => {
    const e = new T.LineSegments(new T.EdgesGeometry(mesh.geometry, 20), edgeMat(colorKey, basis));
    e.computeLineDistances(); e.userData = { role: 'edge' }; e.raycast = () => {}; mesh.add(e);
  };
  const group = (parent, name, data = {}) => { const g = new T.Group(); g.name = name; g.userData = data; parent.add(g); return g; };
  const sysGroups = (parent, lvl) => Object.fromEntries(LAYERS.filter(([k]) => k !== 'walls').map(([k, n]) => [k, group(parent, n, { role: 'group', layer: k, level: lvl })]));

  const items = [], runs = [], walls = [];
  const top = plan.levels.reduce((m, l) => Math.max(m, l.base + l.height), 0);

  for (const l of plan.levels) {
    const g = group(root, l.name, { role: 'level', level: l.id });
    // floor slab and walls: the shell is always likely (the footprint is worked out from the floor area)
    const slab = new T.Mesh(new T.BoxGeometry(W, 0.06, D), mat('shell', 'likely', 'shell'));
    slab.position.set(0, l.base - 0.03, 0); slab.name = `${l.name} floor`;
    slab.userData = { role: 'slab', layer: 'structure', level: l.id, basis: 'likely' };
    g.add(slab);
    const wg = group(g, 'Walls', { role: 'group', layer: 'walls', level: l.id });
    for (const wall of [...exteriorWalls(plan), ...roomWalls(plan, l)]) {
      const ax = X(wall.a[0]), az = Z(wall.a[1]), bx = X(wall.b[0]), bz = Z(wall.b[1]);
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.05) continue;
      const m = new T.Mesh(new T.BoxGeometry(len, l.height, WALL_T), mat('walls', 'likely', 'shell'));
      m.position.set((ax + bx) / 2, l.base + l.height / 2, (az + bz) / 2);
      m.rotation.y = -Math.atan2(bz - az, bx - ax);
      m.name = wall.name;
      m.userData = { role: 'wall', layer: 'walls', level: l.id, basis: 'likely', wall: { ...wall }, side: wall.side, pick: true, label: wall.name };
      addEdges(m, 'walls', 'likely');
      wg.add(m); walls.push(m);
    }
    if (l.rooms.length) {
      const rg = group(g, 'Rooms', { role: 'group', layer: 'structure', level: l.id });
      for (const r of l.rooms) {
        const m = new T.Mesh(new T.BoxGeometry(Math.max(0.1, r.w * FT - 0.1), 0.02, Math.max(0.1, r.h * FT - 0.1)), mat('room', 'likely', 'shell'));
        m.position.set(X(r.x + r.w / 2), l.base + 0.01, Z(r.y + r.h / 2));
        m.name = r.label; m.userData = { role: 'room', layer: 'structure', level: l.id, basis: 'likely', label: r.label };
        rg.add(m);
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
      const ceil = l.base + l.height - 0.25;
      const y = l.below ? (r.kind === 'drain' ? l.base + 0.15 : ceil) : (r.kind === 'drain' ? l.base - 0.35 : l.base - 0.18);
      const pts = r.points.map(p => new T.Vector3(X(p[0]), y, Z(p[1])));
      if (r.kind === 'drain' && pts.length >= 2) pts[pts.length - 1].y -= 0.1;   // a drain falls towards its exit
      const geo = lineGeom(T, pts, RUN_R[r.kind] || 0.03, !isRec(r.basis));
      if (!geo) continue;
      const m = new T.Mesh(geo, mat(layer, r.basis));
      const label = RUN_NAME[r.kind] || 'Line';
      m.name = `${label}${isRec(r.basis) ? '' : ' (likely)'}`;
      m.userData = { role: 'run', kind: String(r.kind || ''), layer, level: l.id, basis: isRec(r.basis) ? 'record' : 'likely', likely: !isRec(r.basis),
        label, key: r.key, pick: true, anchor: pts[Math.floor((pts.length - 1) / 2)].clone().lerp(pts[Math.ceil((pts.length - 1) / 2)], 0.5).toArray() };
      sg[layer].add(m); runs.push(m);
    }
  }
  if (plan.outside.length) {
    const og = group(root, 'Outside', { role: 'level', level: 'outside' });
    const sg = sysGroups(og, 'outside');
    for (const o of plan.outside) {
      const at = Math.min(1, Math.max(0, num(o.at) || 0.5)), d = 3;
      const side = String(o.side || 'right');
      const p = side === 'left' ? [-d, at * plan.h] : side === 'right' ? [plan.w + d, at * plan.h]
        : side === 'rear' ? [at * plan.w, plan.front === 'top' ? plan.h + d : -d] : [at * plan.w, plan.front === 'top' ? -d : plan.h + d];
      const m = itemMesh(T, o, mat, addEdges);
      const s = SHAPE[o.kind] || ['box', 0.4, 0.4, 0.4, 0];
      placeItem(m, s, X(p[0]), s[4], Z(p[1]));
      tagItem(m, o, 'outside', true);
      (sg[KIND_LAYER[o.kind]] || sg.hvac).add(m); items.push(m);
    }
  }
  // a plain gable roof on the top storey: its shape is not in the card, so it is likely
  const ridge = Math.min(W, D) * 0.32;
  const roof = new T.Mesh(roofGeom(T, W + 0.3, D + 0.3, ridge), mat('shell', 'likely', 'shell'));
  roof.position.y = top; roof.name = 'Roof';
  roof.userData = { role: 'roof', layer: 'walls', level: 'roof', basis: 'likely' };
  addEdges(roof, 'shell', 'likely');
  root.add(roof);
  return { root, plan, items, runs, walls, roof, mats, size: { W, D, top, bottom: plan.levels[0]?.base || 0 } };
}

function itemMesh(T, it, mat, addEdges) {
  const s = SHAPE[it.kind] || ['box', 0.4, 0.4, 0.4, 0];
  const g = s[0] === 'cyl' ? new T.CylinderGeometry(s[1], s[1], s[2], 18) : s[0] === 'ball' ? new T.SphereGeometry(s[1], 14, 10) : new T.BoxGeometry(s[1], s[2], s[3]);
  const layer = KIND_LAYER[it.kind] || 'other';
  const m = new T.Mesh(g, mat(layer, it.basis));
  if (!isRec(it.basis)) addEdges(m, layer, it.basis);
  return m;
}
function placeItem(m, s, x, y0, z) {
  const h = s[0] === 'ball' ? 0 : s[2];
  m.position.set(x, y0 + h / 2 + (s[0] === 'ball' ? s[1] : 0), z);
}
function tagItem(m, it, level, outside) {
  const likely = !isRec(it.basis);
  const label = String(it.label || 'Item');
  m.name = `${label}${likely ? ' (likely)' : ''}`;
  m.userData = { role: 'item', kind: String(it.kind || ''), layer: KIND_LAYER[it.kind] || 'other', level, outside, basis: likely ? 'likely' : 'record', likely,
    label, note: String(it.note || ''), detail: it.detail ? String(it.detail) : '', focus: it.focus === true, key: it.key, pick: true };
}

/* ── the file ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The model as a binary glTF 2.0 file (metres, Y up). Named nodes per level, room and system; extras carry role and basis. */
export async function houseGLB(card) {
  const T = await loadThree();
  const model = buildModel(T, card);
  model.root.updateMatrixWorld(true);
  const blob = writeGLB(T, model.root, model.mats);
  model.root.traverse(o => { o.geometry?.dispose?.(); });
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
    for (const k of ['role', 'kind', 'layer', 'level', 'basis', 'label', 'note', 'detail', 'address']) if (u && u[k] !== undefined && u[k] !== '') e[k] = u[k];
    if (u && u.role === 'item') e.outside = !!u.outside;
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
  const a = String(card?.address || 'House').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'House';
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
  el.setAttribute('aria-label', '3D house');
  const levelChips = plan.levels.map((l, i) => chip(`data-h3="floor" data-floor="${i}"`, l.name, false)).join('');
  el.innerHTML = `<div class="h3-head"><h3 class="sys-card-title h3-addr">${esc(plan.address || 'House')} <span class="h3-ex">· Example address</span></h3>`
    + (opts.onClose ? `<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm h3-close" data-h3="close">Close</button>` : '') + `</div>`
    + `<div class="h3-stage"><canvas class="h3-canvas" role="img" aria-label="3D house model"></canvas><div class="h3-labels" aria-hidden="true"></div>`
    + `<p class="h3-key"><span class="h3-key-solid"></span>From records <span class="h3-key-dash"></span>Likely</p>`
    + `<div class="h3-info" aria-live="polite" hidden></div></div>`
    + `<div class="h3-bar">`
    + `<div class="sys-chips h3-row" role="group" aria-label="View">${chip('data-h3="view" data-v="outside"', 'Outside', true)}${chip('data-h3="view" data-v="cutaway"', 'Cutaway', false)}${chip('data-h3="view" data-v="top"', 'Top', false)}</div>`
    + `<div class="sys-chips h3-row" role="group" aria-label="Floor">${chip('data-h3="floor" data-floor="all"', 'All floors', true)}${levelChips}</div>`
    + `<div class="sys-chips h3-row" role="group" aria-label="Layers">${LAYERS.map(([k, n]) => chip(`data-h3="layer" data-layer="${k}"`, n, true)).join('')}</div>`
    + `<div class="h3-row h3-acts">${chip('data-h3="wallmode"', 'Behind this wall', false)}<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-h3="download">Download model</button></div>`
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
      d.className = `h3-label${o.userData.likely ? ' is-likely' : ''}`;
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
    if (sel === 'all' || levelId === 'outside') return true;
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
        if (sel !== 'all' && u.level !== sel && u.level !== 'outside') op *= 0.5;
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
    el.querySelector('[data-h3="wallmode"]').setAttribute('aria-pressed', String(state.wallMode));
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
    const r = (orbit.radius / Math.sin(Math.min(vf, hf) / 2)) * k;
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
    const pool = (state.wallMode ? model.walls : [...model.items, ...model.runs]).filter(o => o.visible && isShown(o));
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
    info.innerHTML = o.userData.role === 'wall' ? wallCard(o) : itemCard(o);
    info.hidden = false;
    info.querySelector('[data-h3="dismiss"]')?.addEventListener('click', () => select(null));
    draw();
  }
  const basisChip = b => (isRec(b) ? '<span class="sys-chip sys-chip--good">From records</span>' : '<span class="sys-chip sys-chip--warn">Likely</span>');
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
      : '<li><span>No lines or equipment known here</span></li>';
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
      transparent: !!o.material.transparent });
    return { items: model.items.map(row), runs: model.runs.map(row), walls: model.walls.map(row), roofVisible: model.roof.visible,
      view: state.view, floor: state.floor, layers: { ...state.layers }, levels: plan.levels.map(l => l.id),
      behind: model.walls.map(w => ({ name: w.name, level: w.userData.level, list: behindWall(plan, w.userData.level, w.userData.wall) })) };
  }
  function destroy() {
    state.dead = true; ro.disconnect(); themeObs.disconnect(); try { mq?.removeEventListener('change', applyTheme); } catch { /* */ }
    if (raf) cancelAnimationFrame(raf);
    if (model) { model.root.traverse(o => { o.geometry?.dispose?.(); }); model.mats.forEach(m => m.dispose()); }
    renderer?.dispose(); el.remove();
  }
  api.pickAt = (x, y) => pick(x, y);
  api.select = key => select([...(model?.items || []), ...(model?.runs || []), ...(model?.walls || [])].find(o => o.userData.key === key || o.name === key) || null);
  return api;
}
