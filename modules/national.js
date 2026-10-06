/* ═══════════════════════════════════════════════════════════════════════════
   National expansion — every US county scored for a home-services company
   Views: scorer · phases · markets · method
   Data: data/national_counties.json (columnar, 3,144 counties), data/research/county_cbsa.json
         (OMB July 2023 metro crosswalk), data/research/pp_nationwide.json (Punctual Pros phases 1–4).
   All scores are computed client-side from percentile ranks; every score is a modelled estimate.
   ═══════════════════════════════════════════════════════════════════════════ */
import { EST } from './copy.js?v=20261006143735';

const COLOR = 'var(--c-pp)';
const PP_HEX = '#f08a3c';
const LS_KEY = 'bsp-national-weights';
const COUNTIES_URL = new URL('../data/national_counties.json', import.meta.url).href;

/* ── score factors (weights are relative; the score renormalises over the inputs a county has) ── */
const FACTORS = [
  { id: 'age', label: 'Housing age', hint: 'Share of homes built before 1980', vint: 'ACS 2019–23', w: 15, fields: ['pre1980_share', 'median_year_built'] },
  { id: 'owner', label: 'Owner share', hint: 'Owner-occupied share of occupied homes', vint: 'ACS 2019–23', w: 15, fields: ['owner_occupied_share'] },
  { id: 'permits', label: 'Permits momentum', hint: 'Units permitted per 1,000 homes in 2025, blended with the Jan–Aug 2026 pace against the US', vint: 'BPS 2025 · Jan–Aug 2026', w: 10, fields: ['permits_per_1k_hu_2025', 'permits_units_2025ytd', 'permits_units_2026ytd'] },
  { id: 'sales', label: 'Sales velocity', hint: 'Home sales in the last 12 months per 100 homes (new owners)', vint: 'Redfin 12 mo', w: 15, fields: ['home_sales_12m', 'housing_units'] },
  { id: 'income', label: 'Income', hint: 'Median household income', vint: 'ACS 2019–23', w: 15, fields: ['median_household_income'] },
  { id: 'climate', label: 'Climate demand', hint: 'Normal heating plus cooling degree days (HVAC run time)', vint: 'NOAA 1991–2020', w: 10, fields: ['hdd_normal_1991_2020', 'cdd_normal_1991_2020'] },
  { id: 'comp', label: 'Competitor density', hint: 'Fewer HVAC, plumbing and electrical contractors per 10,000 homes scores higher', vint: 'CBP 2022', w: 10, fields: ['hvac_plumbing_electrical_establishments', 'housing_units'] },
  { id: 'growth', label: 'Population growth', hint: 'Population change July 2020 to July 2024', vint: 'PEP V2024', w: 10, fields: ['pop_growth_2020_2024'] },
  { id: 'adj', label: 'Adjacency', hint: 'Full credit within 30 miles of a Punctual Pros hub county (PA core, Ocean and Monmouth NJ), none beyond 150 miles', vint: 'Gazetteer 2023 · plan Oct 2026', w: 0, fields: ['lat', 'lon'] },
];
/* Punctual Pros hub counties for the adjacency input: the Phase 1 core (PA) plus the Horvath Home Services counties (NJ) */
const HUB_NJ = ['Ocean', 'Monmouth'];
const DEFAULT_W = Object.fromEntries(FACTORS.map(f => [f.id, f.w]));
const PRESETS = [
  { id: 'balanced', label: 'Balanced', w: DEFAULT_W },
  { id: 'aging', label: 'Aging owner stock', w: { age: 30, owner: 25, permits: 0, sales: 15, income: 15, climate: 10, comp: 5, growth: 0 } },
  { id: 'growth', label: 'Growth markets', w: { age: 0, owner: 10, permits: 25, sales: 20, income: 10, climate: 5, comp: 5, growth: 25 } },
  { id: 'hvac', label: 'HVAC climate', w: { age: 15, owner: 15, permits: 5, sales: 10, income: 10, climate: 35, comp: 5, growth: 5 } },
  /* the nationwide plan's own argument: older housing stock, heating and cooling run time, and route density next to the hubs it already runs */
  { id: 'thesis', label: 'Punctual Pros thesis', w: { age: 30, owner: 5, permits: 0, sales: 5, income: 10, climate: 20, comp: 0, growth: 0, adj: 30 } },
];
const THESIS = PRESETS.find(p => p.id === 'thesis');
const BINS = [
  { min: 0.95, label: 'Top 5%', hex: '#fcfdbf' },
  { min: 0.90, label: 'Top 10%', hex: '#fe9f6d' },
  { min: 0.75, label: 'Top 25%', hex: '#de4968' },
  { min: 0.50, label: 'Top 50%', hex: '#8c2981' },
  { min: -1, label: 'Bottom 50%', hex: '#3b0f70' },
];
const binOf = p => BINS.find(b => p >= b.min) || BINS[BINS.length - 1];
const PHASE_HEX = { 1: '#f08a3c', 2: '#f5b73d', 3: '#4c8dff', 4: '#9d7bff' };
const OUT_HEX = '#7d8a9c';
const SUNBELT = ['AL', 'AR', 'AZ', 'FL', 'GA', 'LA', 'MS', 'NC', 'NM', 'NV', 'OK', 'SC', 'TN', 'TX'];
const MIDWEST = ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'];
const STATE_NAMES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
/* Central & Eastern PA counties outside Phases 1 and 3 — analyst reading of the Phase 2 text (the source names the region, not counties) */
const P2_PA = ['Northampton', 'Luzerne', 'Lackawanna', 'Monroe', 'Carbon', 'Columbia', 'Montour', 'Union', 'Snyder', 'Juniata', 'Mifflin', 'Centre', 'Huntingdon', 'Blair', 'Fulton'];
const P1_FALLBACK = { core: ['Lancaster', 'York', 'Dauphin', 'Cumberland', 'Berks', 'Lebanon', 'Franklin', 'Adams', 'Perry'], ring: 'Schuylkill, Lehigh, Chester, Montgomery, Northumberland PA; Frederick, Washington, Harford, Carroll, Cecil, Baltimore Co. MD' };

/* ── small helpers ── */
const fin = v => v != null && Number.isFinite(Number(v));
const sum = (a, f) => a.reduce((s, x) => { const v = f(x); return s + (fin(v) ? Number(v) : 0); }, 0);
const pctTxt = (v, d = 0) => fin(v) ? `${(v * 100).toFixed(d)}%` : '—';
const signed = (v, d = 1) => fin(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%` : '—';
const normName = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/\b(county|parish|borough|census area|city and borough|municipality)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const lsGet = () => { try { const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); return j && typeof j === 'object' ? j : null; } catch { return null; } };
const lsSet = w => { try { localStorage.setItem(LS_KEY, JSON.stringify(w)); } catch { } };
const monthLbl = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+m[2] - 1]} ${m[1]}` : null; };

function css() {
  if (document.getElementById('css-national')) return;
  const l = document.createElement('link'); l.id = 'css-national'; l.rel = 'stylesheet'; l.href = new URL('./national.css', import.meta.url).href; document.head.appendChild(l);
}

/* ── state shared across views ── */
const S = { weights: { ...DEFAULT_W, ...(lsGet() || {}) }, minHU: 25000, state: '', mapMode: 'top', metroMin: 150000 };
let MODEL = null;

/* ═══ model: load, derive raw factor values, percentile ranks ═══ */
async function loadModel(ctx) {
  if (MODEL) return MODEL;
  const t0 = performance.now();
  const [nc, cbsa, pn] = await Promise.all([
    fetch(COUNTIES_URL, { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).then(j => j ? ctx.data.decode(j) : null).catch(() => null),
    ctx.data.research('county_cbsa'),
    ctx.data.research('pp_nationwide'),
  ]);
  if (!nc || !Array.isArray(nc.items)) return null;
  const meta = nc.meta || {};
  const rows = nc.items;
  const byFips = new Map(rows.map(r => [r.fips, r]));
  // vintages parsed from the dataset's own source notes
  const srcOf = key => (meta.sources || []).find(s => String(s.field_group || '').split(',').map(x => x.trim()).some(g => g === key || (g.endsWith('*') && key.startsWith(g.slice(0, -1)))));
  const salesSrc = srcOf('home_sales_12m');
  const sw = /months ending (\d{4}-\d{2})-\d{2}\s*\.\.\s*(\d{4}-\d{2})/.exec(salesSrc?.vintage || '');
  const salesWin = sw ? `${monthLbl(sw[1] + '-01')}–${monthLbl(sw[2] + '-01')}` : '12 months';
  const salesEnd = sw ? monthLbl(sw[2] + '-01') : null;
  const p26 = /co(\d{2})(\d{2})y/.exec(String(srcOf('permits_units_2026ytd')?.vintage || ''));
  const p26Lbl = p26 ? `Jan–${monthLbl(`20${p26[1]}-${p26[2]}-01`).split(' ')[0]} 20${p26[1]}` : '2026 YTD';
  const salesF = FACTORS.find(f => f.id === 'sales'); if (sw) salesF.vint = `Redfin ${salesWin}`;
  const V = { acs: 'ACS 2019–23', pep: 'PEP V2024', sales: salesWin, salesEnd: salesEnd || 'latest month', p25: '2025', p24: '2024', p26: p26Lbl, noaa: '1991–2020 normals', cbp: 'CBP 2022', ab: 'Oct 2026', gaz: 'Gazetteer 2023' };

  // national permit pace: Jan–Aug 2026 vs full 2025 across counties reporting both (removes seasonality from the county ratio)
  const both = rows.filter(r => fin(r.permits_units_2025ytd) && r.permits_units_2025ytd > 0 && fin(r.permits_units_2026ytd));
  const natPace = sum(both, r => r.permits_units_2026ytd) / Math.max(1, sum(both, r => r.permits_units_2025ytd));
  for (const r of rows) {
    const hu = fin(r.housing_units) && r.housing_units > 0 ? r.housing_units : null;
    r._name = `${r.county_name}, ${r.state}`;
    r._turn = hu && fin(r.home_sales_12m) ? (r.home_sales_12m / hu) * 100 : null;
    r._trend = fin(r.permits_units_2025ytd) && r.permits_units_2025ytd >= 20 && fin(r.permits_units_2026ytd) ? (r.permits_units_2026ytd / r.permits_units_2025ytd) / natPace - 1 : null;
    r._dd = fin(r.hdd_normal_1991_2020) && fin(r.cdd_normal_1991_2020) ? r.hdd_normal_1991_2020 + r.cdd_normal_1991_2020 : null;
    r._dens = hu && fin(r.hvac_plumbing_electrical_establishments) ? (r.hvac_plumbing_electrical_establishments / hu) * 1e4 : null;
  }
  // percentile ranks (ties averaged), 0..1
  const pctRank = (getter, invert = false) => {
    const idx = []; for (let i = 0; i < rows.length; i++) { const v = getter(rows[i]); if (fin(v)) idx.push([i, Number(v)]); }
    idx.sort((a, b) => a[1] - b[1]); const out = new Float64Array(rows.length).fill(NaN); const n = idx.length;
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && idx[j + 1][1] === idx[i][1]) j++; const p = n > 1 ? ((i + j) / 2) / (n - 1) : 0.5; for (let k = i; k <= j; k++) out[idx[k][0]] = invert ? 1 - p : p; i = j + 1; }
    return out;
  };
  const P = {
    age: pctRank(r => r.pre1980_share), owner: pctRank(r => r.owner_occupied_share), per1k: pctRank(r => r.permits_per_1k_hu_2025), trend: pctRank(r => r._trend),
    sales: pctRank(r => r._turn), income: pctRank(r => r.median_household_income), climate: pctRank(r => r._dd), comp: pctRank(r => r._dens, true), growth: pctRank(r => r.pop_growth_2020_2024),
  };
  rows.forEach((r, i) => {
    const per = [P.per1k[i], P.trend[i]].filter(v => !isNaN(v));
    r._p = { age: P.age[i], owner: P.owner[i], permits: per.length ? per.reduce((a, b) => a + b, 0) / per.length : NaN, sales: P.sales[i], income: P.income[i], climate: P.climate[i], comp: P.comp[i], growth: P.growth[i] };
    r._permParts = { per1k: P.per1k[i], trend: P.trend[i] };
  });
  // metro crosswalk
  const cbsaOf = new Map(); const metros = [];
  for (const it of cbsa?.items || []) {
    const cs = (it.counties || []).map(c => byFips.get(c.fips)).filter(Boolean);
    const m = { id: it.cbsa_code, title: it.cbsa_title, type: it.type, csa: it.csa_title, counties: cs, central: new Set((it.counties || []).filter(c => c.central).map(c => c.fips)), source_url: it.source_url, retrieved: it.retrieved };
    for (const c of cs) cbsaOf.set(c.fips, m);
    metros.push(m);
  }
  for (const r of rows) r._cbsa = cbsaOf.get(r.fips) || null;
  const phases = buildPhases(rows, pn, metros);
  // adjacency: great-circle distance to the nearest Punctual Pros hub county, inverted percentile (closer = higher)
  const hubs = rows.filter(r => (r._phase === 1 && phases[0]?.basis.get(r.fips) === 'Punctual Pros core (Phase 1 source list)') || (r.state === 'NJ' && HUB_NJ.includes(String(r.county_name).replace(/\s+County$/i, ''))));
  const km = (a, b) => { const R = 6371, rad = Math.PI / 180, dLa = (b.lat - a.lat) * rad, dLo = (b.lon - a.lon) * rad; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  for (const r of rows) r._adjKm = hubs.length && fin(r.lat) && fin(r.lon) ? Math.min(...hubs.map(h => km(r, h))) : null;
  // not a percentile: the plan's own radius. Full credit inside the 30-mile density tuck-in radius, falling to zero at 150 miles (the Phase 2 reach)
  const ADJ_IN = 30 / 0.621371, ADJ_OUT = 150 / 0.621371;
  for (const r of rows) r._p.adj = r._adjKm == null ? NaN : r._adjKm <= ADJ_IN ? 1 : r._adjKm >= ADJ_OUT ? 0 : 1 - (r._adjKm - ADJ_IN) / (ADJ_OUT - ADJ_IN);
  MODEL = { meta, rows, byFips, metros, cbsaMeta: cbsa?.meta || null, pn, phases, hubs, V, natPace, srcOf, loadMs: Math.round(performance.now() - t0) };
  score(MODEL);
  return MODEL;
}

/* recompute every county's score for the current weights (≈3k rows × 8 factors) */
function score(M) {
  const w = S.weights; const tot0 = FACTORS.reduce((a, f) => a + (w[f.id] || 0), 0);
  const ww = tot0 > 0 ? w : DEFAULT_W;
  for (const r of M.rows) {
    let s = 0, t = 0, miss = 0, used = 0;
    for (const f of FACTORS) { const wi = ww[f.id] || 0; if (!wi) continue; const p = r._p[f.id]; if (isNaN(p)) { miss++; continue; } s += wi * p; t += wi; used++; }
    r._score = t > 0 ? (s / t) * 100 : null; r._miss = miss; r._used = used;
  }
  const scored = M.rows.filter(r => r._score != null).sort((a, b) => b._score - a._score);
  const n = scored.length; scored.forEach((r, i) => { r._rank = i + 1; r._pctl = n > 1 ? 1 - i / (n - 1) : 1; });
  M.rows.filter(r => r._score == null).forEach(r => { r._rank = null; r._pctl = null; });
  M.scored = scored;
  M.version = (M.version || 0) + 1;
}
/* national rank of every county under a given weight set, without touching the live scores (fips → rank) */
function rankWith(M, w) {
  const out = []; for (const r of M.rows) { let s = 0, t = 0; for (const f of FACTORS) { const wi = w[f.id] || 0; if (!wi) continue; const p = r._p[f.id]; if (isNaN(p)) continue; s += wi * p; t += wi; } if (t > 0) out.push([r.fips, s / t]); }
  out.sort((a, b) => b[1] - a[1]); return new Map(out.map(([f], i) => [f, i + 1]));
}
const median = a => { const v = a.filter(fin).map(Number).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const scoreHtml = (fmt, r) => r._score == null ? '—' : `${fmt.score(r._score, PP_HEX)}${EST}`;
const isCustom = () => FACTORS.some(f => (S.weights[f.id] || 0) !== DEFAULT_W[f.id]);
const wName = () => { const p = PRESETS.find(p => FACTORS.every(f => (p.w[f.id] || 0) === (S.weights[f.id] || 0))); return p ? `${p.id === 'thesis' ? p.label : p.label.toLowerCase()} weights` : 'custom weights'; };

/* ═══ phases: Punctual Pros Phase 1–4 geographies mapped onto county FIPS ═══ */
function buildPhases(rows, pn, metros) {
  const idx = new Map(); for (const r of rows) idx.set(`${r.state}|${normName(r.county_name)}`, r);
  const find = (name, st) => { let k = normName(name); if (/\bco\.?$/i.test(String(name).trim())) k = normName(String(name).replace(/\bco\.?$/i, '')); return idx.get(`${st}|${k}`) || null; };
  const items = (pn?.items || []).filter(i => i.kind === 'expansion_phase');
  const ph = n => items.find(i => i.id === `pn-phase-${n}`) || null;
  const out = [];
  const add = (n, list, basis) => { const o = out.find(p => p.n === n); for (const r of list) if (r && !o.fips.has(r.fips)) { o.fips.add(r.fips); o.basis.set(r.fips, basis); } };
  for (let n = 1; n <= 4; n++) { const it = ph(n); out.push({ n, item: it, title: it ? String(it.phase).replace(/^Phase \d+\s*-\s*/, '') : ['Densify the PA core + adjacent ring', 'Tuck-ins across PA, NJ, MD, DE and southern NY', 'Mid-Atlantic portfolio company along I-81 / I-95', 'National consolidator inside the Authority Brands network'][n - 1], months: it?.months || ['0-12', '9-24', '18-36', '36-60'][n - 1], fips: new Set(), basis: new Map(), fromSource: !!it }); }
  // Phase 1: core counties + parsed adjacent ring
  const g1 = ph(1)?.geography || []; const core = g1.filter(x => !/:/.test(x)); const ringTxt = (g1.find(x => /adjacent ring/i.test(x)) || '').replace(/^.*?:\s*/, '') || P1_FALLBACK.ring;
  add(1, (core.length ? core : P1_FALLBACK.core).map(c => find(c, 'PA')), 'Punctual Pros core (Phase 1 source list)');
  for (const seg of ringTxt.split(';')) { const m = /^(.*)\s([A-Z]{2})\s*$/.exec(seg.trim()); if (!m) continue; add(1, m[1].split(',').map(c => find(c.trim(), m[2])), 'Adjacent ring (Phase 1 source list)'); }
  // Phase 2: source metros + Delaware + analyst PA list
  for (const m of ph(2)?.data_points?.metros || []) add(2, (m.counties || []).map(c => find(c, m.state)), `${m.metro} (Phase 2 source list)`);
  add(2, rows.filter(r => r.state === 'DE'), 'Delaware (Phase 2 geography)');
  add(2, P2_PA.map(c => find(c, 'PA')), 'Central & Eastern PA (analyst county mapping)');
  // Phase 3: source metros + Richmond VA from the OMB metro definition
  for (const m of ph(3)?.data_points?.metros || []) add(3, (m.counties || []).map(c => find(c, m.state)), `${m.metro} (Phase 3 source list)`);
  const ric = metros.find(m => m.id === '40060'); if (ric) add(3, ric.counties, 'Richmond, VA metro (OMB 2023 delineation)');
  // Phase 4: Sun Belt + Midwest counties with a One Hour / Ben Franklin / Mister Sparky office
  add(4, rows.filter(r => (SUNBELT.includes(r.state) || MIDWEST.includes(r.state)) && (r.authority_brands_presence || 0) > 0), 'Sun Belt or Midwest county with an Authority Brands office');
  // earliest phase wins
  const seen = new Map();
  for (const p of out) { p.overlap = 0; for (const f of [...p.fips]) { if (seen.has(f)) { p.fips.delete(f); p.overlap++; } else seen.set(f, p.n); } }
  for (const r of rows) r._phase = seen.get(r.fips) || null;
  return out;
}
function phaseStats(M, p) {
  const cs = [...p.fips].map(f => M.byFips.get(f)).filter(Boolean);
  const hu = sum(cs, r => r.housing_units);
  const sc = cs.filter(r => r._score != null && fin(r.housing_units));
  return {
    cs, n: cs.length, hu, sales: sum(cs, r => r.home_sales_12m), salesN: cs.filter(r => fin(r.home_sales_12m)).length,
    p25: sum(cs, r => r.permits_units_2025ytd), p26: sum(cs, r => r.permits_units_2026ytd), permN: cs.filter(r => fin(r.permits_units_2025ytd)).length,
    ab: sum(cs, r => r.authority_brands_presence), estab: sum(cs, r => r.hvac_plumbing_electrical_establishments),
    score: sc.length ? sum(sc, r => r._score * r.housing_units) / Math.max(1, sum(sc, r => r.housing_units)) : null,
    top10: cs.filter(r => r._pctl != null && r._pctl >= 0.9).length,
  };
}

/* ═══ metro roll-ups ═══ */
function metroRoll(M) {
  return M.metros.filter(m => m.type === 'metro' && m.counties.length).map(m => {
    const cs = m.counties; const sc = cs.filter(r => r._score != null && fin(r.housing_units));
    const hu = sum(cs, r => r.housing_units); const sales = sum(cs, r => r.home_sales_12m); const salesHu = sum(cs.filter(r => fin(r.home_sales_12m)), r => r.housing_units);
    const abKnown = cs.some(r => fin(r.authority_brands_presence));
    const p25 = sum(cs, r => r.permits_units_2025ytd), p26 = sum(cs, r => r.permits_units_2026ytd);
    const estab = sum(cs, r => r.hvac_plumbing_electrical_establishments);
    const states = [...new Set(cs.map(r => r.state))];
    let lat = 0, lon = 0; for (const r of cs) { lat += r.lat * (r.housing_units || 1); lon += r.lon * (r.housing_units || 1); } const wt = sum(cs, r => r.housing_units || 1);
    return {
      id: m.id, title: m.title, metro: m, states: states.join(', '), n: cs.length, hu, sales: sales || null, turn: salesHu ? (sales / salesHu) * 100 : null,
      p25, p26, trend: p25 >= 50 ? (p26 / p25) / M.natPace - 1 : null, estab, dens: hu ? estab / hu * 1e4 : null,
      ab: abKnown ? sum(cs, r => r.authority_brands_presence) : null, abBrands: abKnown ? [['One Hour', sum(cs, r => r.ab_onehour)], ['Benjamin Franklin', sum(cs, r => r.ab_benfranklin)], ['Mister Sparky', sum(cs, r => r.ab_mistersparky)]] : null,
      score: sc.length ? sum(sc, r => r._score * r.housing_units) / Math.max(1, sum(sc, r => r.housing_units)) : null,
      phase: Math.min(...cs.map(r => r._phase || 9)), lat: lat / wt, lon: lon / wt,
    };
  }).filter(m => m.score != null);
}

/* ═══ shared UI pieces ═══ */
const FIELD_ROWS = M => [
  ['Geography', [['land_sqmi', 'Land area (sq mi)', 'num1', M.V.gaz], ['population', 'Population', 'num', M.V.acs], ['pop_est_2024', 'Population, July 2024', 'num', M.V.pep], ['pop_growth_2020_2024', 'Population change 2020–24', 'signed', M.V.pep]]],
  ['Housing stock', [['housing_units', 'Housing units', 'num', M.V.acs], ['owner_occupied_share', 'Owner-occupied share', 'pct', M.V.acs], ['median_year_built', 'Median year built', 'yr', M.V.acs], ['pre1980_share', 'Built before 1980', 'pct', M.V.acs], ['median_household_income', 'Median household income', 'money', `${M.V.acs}, 2023 $`], ['heating_fuel_oil_propane_share', 'Heated by oil or propane', 'pct', M.V.acs], ['heating_electric_share', 'Electric heat', 'pct', M.V.acs]]],
  ['Construction', [['permits_units_2024', 'Units permitted, 2024', 'num', 'BPS 2024'], ['permits_units_2025ytd', 'Units permitted, 2025 (full year)', 'num', 'BPS 2025'], ['permits_1unit_2025', 'Single-family units permitted, 2025', 'num', 'BPS 2025'], ['permits_units_2026ytd', `Units permitted, ${M.V.p26}`, 'num', `BPS ${M.V.p26}`], ['permits_per_1k_hu_2025', 'Units permitted per 1,000 homes, 2025', 'num1', 'BPS 2025 · ACS']]],
  ['Home sales', [['home_sales_12m', 'Home sales, 12 months', 'num', `Redfin ${M.V.sales}`], ['median_sale_price', 'Median sale price', 'money', `Redfin ${M.V.salesEnd}`], ['median_dom', 'Median days on market', 'num', `Redfin ${M.V.salesEnd}`]]],
  ['Climate', [['hdd_normal_1991_2020', 'Heating degree days', 'num', M.V.noaa], ['cdd_normal_1991_2020', 'Cooling degree days', 'num', M.V.noaa], ['cdd_hdd_proxy', 'Cooling share of degree days', 'pct', M.V.noaa]]],
  ['Contractors & franchise', [['estab_238220_plumbing_hvac', 'Plumbing & HVAC contractors (NAICS 238220)', 'num', M.V.cbp], ['estab_238210_electrical', 'Electrical contractors (NAICS 238210)', 'num', M.V.cbp], ['hvac_plumbing_electrical_establishments', 'Trade contractors, total', 'num', M.V.cbp], ['ab_onehour', 'One Hour Heating & Air offices', 'num', M.V.ab], ['ab_benfranklin', 'Benjamin Franklin Plumbing offices', 'num', M.V.ab], ['ab_mistersparky', 'Mister Sparky offices', 'num', M.V.ab], ['authority_brands_presence', 'Authority Brands offices (3 brands)', 'num', M.V.ab]]],
];
const fmtVal = (fmt, kind, v) => !fin(v) ? '—' : kind === 'pct' ? pctTxt(v) : kind === 'signed' ? signed(v) : kind === 'money' ? fmt.moneyFull(v) : kind === 'yr' ? String(Math.round(v)) : kind === 'num1' ? fmt.num(v, 1) : fmt.num(v);
/* a source URL written as a file template (…/acsdt5y2023-{b01003|b25001}.dat) is not a page: link its directory instead */
const srcUrl = s => { const u = Array.isArray(s?.url) ? s.url[0] : s?.url; return typeof u === 'string' && /[{|}]/.test(u) ? u.slice(0, u.lastIndexOf('/', u.indexOf('{')) + 1) : u; };
const srcLink = (fmt, s, esc) => { if (!s) return '—'; const u = srcUrl(s); const nm = String(s.name || '').split('(')[0].split(',')[0].trim(); return u && /^https?:/.test(u) ? fmt.link(u, nm) : esc(nm || '—'); };
const factorRaw = (M, f, r, fmt) => ({
  age: `${pctTxt(r.pre1980_share)} pre-1980 · median ${fin(r.median_year_built) ? Math.round(r.median_year_built) : '—'}`,
  owner: pctTxt(r.owner_occupied_share),
  permits: `${fmt.num(r.permits_per_1k_hu_2025, 1)} per 1k homes · ${M.V.p26} pace ${signed(r._trend, 0)} vs US`,
  sales: fin(r._turn) ? `${fmt.num(r._turn, 1)} per 100 homes (${fmt.num(r.home_sales_12m)} sales)` : '—',
  income: fin(r.median_household_income) ? fmt.moneyFull(r.median_household_income) : '—',
  climate: fin(r._dd) ? `${fmt.num(r._dd)} degree days (${pctTxt(r.cdd_hdd_proxy)} cooling)` : '—',
  comp: fin(r._dens) ? `${fmt.num(r._dens, 1)} per 10k homes (${fmt.num(r.hvac_plumbing_electrical_establishments)} firms)` : '—',
  growth: signed(r.pop_growth_2020_2024),
  adj: fin(r._adjKm) ? (r._adjKm < 1 ? 'a Punctual Pros hub county' : `${fmt.num(r._adjKm * 0.621371)} mi from the nearest Punctual Pros hub county`) : '—',
}[f.id]);
function nextStep(r) {
  const ab = r.authority_brands_presence;
  if (r._pctl == null) return 'Not scored: too few inputs. Fill the missing fields before ranking.';
  if (r._pctl >= 0.9 && ab > 0) return `Top-decile county with ${ab} Authority Brands office${ab > 1 ? 's' : ''}: map the franchisee(s) as conversion or acquisition conversations and check territory availability with Authority Brands.`;
  if (r._pctl >= 0.9) return 'Top-decile county with no tri-brand office listed: screen independent HVAC and plumbing contractors here for a founder-owned tuck-in or a greenfield territory request.';
  if (r._pctl >= 0.75) return 'Top-quartile county: add to the watch list and pull the independent contractor roster (NAICS 238220) before the next sourcing sprint.';
  return 'Below the top quartile on current weights: monitor only, unless it sits next to an existing hub.';
}
function openCounty(ctx, M, r) {
  const { inspector, fmt, esc, app } = ctx; if (!r) return;
  const ww = S.weights; const tot = FACTORS.reduce((a, f) => a + (isNaN(r._p[f.id]) ? 0 : (ww[f.id] || 0)), 0) || 1;
  const contrib = `<table class="tbl m-national-ctb"><thead><tr><th>Input · value</th><th class="num">Pctl</th><th class="num">Wt</th><th class="num">Pts</th></tr></thead><tbody>${FACTORS.map(f => { const p = r._p[f.id]; const w = ww[f.id] || 0; const pts = isNaN(p) || !w ? null : (w / tot) * p * 100; return `<tr><td class="wrap"><b>${esc(f.label)}</b> <span class="dim small">${esc(f.vint)}</span><div class="small text-2">${esc(factorRaw(M, f, r, fmt))}</div></td><td class="num">${isNaN(p) ? '—' : Math.round(p * 100)}</td><td class="num">${w ? `${Math.round((w / tot) * 100)}%` : '0'}</td><td class="num">${pts == null ? '—' : pts.toFixed(1)}</td></tr>`; }).join('')}</tbody></table>`;
  const inputs = FIELD_ROWS(M).map(([grp, fs]) => `<div class="m-national-grp">${esc(grp)}</div><table class="tbl m-national-in"><tbody>${fs.map(([k, l, kind, vint]) => { const s = M.srcOf(k); return `<tr><td>${esc(l)}<div class="dim small">${esc(vint)}</div></td><td class="num">${fmtVal(fmt, kind, r[k])}</td><td class="small">${srcLink(fmt, s, esc)}</td></tr>`; }).join('')}</tbody></table>`).join('');
  const ph = r._phase ? M.phases.find(p => p.n === r._phase) : null;
  inspector.open({
    title: esc(r._name), sub: `${r._cbsa ? esc(r._cbsa.title) + (r._cbsa.type === 'metro' ? ' metro' : ' micro area') : 'Outside any metro or micro area'} · FIPS ${esc(r.fips)}`, color: r._pctl != null ? binOf(r._pctl).hex : PP_HEX,
    sections: [
      { label: 'Expansion score', html: ctx.ui.kv({ Score: scoreHtml(fmt, r), 'National rank': r._rank ? `#${fmt.num(r._rank)} of ${fmt.num(M.scored.length)} (top ${Math.max(1, Math.ceil((1 - r._pctl) * 100))}%)` : '—', Inputs: `${r._used} of ${FACTORS.filter(f => S.weights[f.id]).length} weighted inputs${r._miss ? ` · ${r._miss} missing, weight spread over the rest` : ''}`, 'Punctual Pros phase': ph ? `Phase ${ph.n} · ${esc(ph.title)}<div class="dim small">${esc(ph.basis.get(r.fips) || '')}</div>` : 'Not in a mapped phase', Weights: isCustom() ? `${wName()} (set on the scorer)` : 'balanced default' }) },
      { label: 'Score build-up (current weights)', html: contrib + `<div class="dim small mt-8">Each input is the county’s percentile among all US counties with that field; points = weight share × percentile. Score = sum of points.</div>` },
      { label: 'Next step', html: `<div class="small">${esc(nextStep(r))}</div>` },
      { label: 'Every input, with vintage and source', html: inputs },
    ],
    actions: [
      { id: 'st', label: `Top counties in ${esc(r.state)}`, onClick: () => app.go('national', 'scorer', { state: r.state }) },
      ...(r._cbsa && r._cbsa.type === 'metro' ? [{ id: 'mt', label: 'Open metro roll-up', onClick: () => app.go('national', 'markets', { cbsa: r._cbsa.id }) }] : []),
      ...(['PA', 'NJ'].includes(r.state) ? [{ id: 'pp', label: 'Punctual Pros territory', onClick: () => app.go('pp', 'territory', { county: String(r.county_name).replace(/\s+County$/i, '') }) }] : []),
    ],
  });
}
const fitUS = map => { const go = () => { if (map._nxDead) return; map.fitBounds([[25, -124.5], [49, -67]], { padding: [6, 6] }); }; go(); setTimeout(() => { if (map._nxDead) return; map.invalidateSize(); go(); }, 260); };
const kill = map => { map._nxDead = true; map.off(); map.remove(); };
const radiusHU = hu => Math.min(22, 2 + Math.sqrt(Math.max(0, hu || 0) / 1000) * 0.45);
const legendHtml = (esc, title, items) => `<div class="m-national-lg"><b>${esc(title)}</b>${items.map(i => `<span><i style="background:${i.hex}"></i>${esc(i.label)}</span>`).join('')}</div>`;
/* Source names and vintages carry raw field keys and file names (GEO_ID, LAST_UPDATED, co2025a.txt …): plain English for the method view */
const SRC_TEXT = [
  [/\s*\(county rows, GEO_ID [^)]*\)/, ' (county rows)'], [/,\s*table-based summary file/, ', summary file'],
  [/\s*\(co-est2024-alldata\.csv\)/, ''], [/\s*\(cbp22co\)/, ''], [/,\s*county file\b/, ', county file'],
  [/\(HDD element 25, CDD element 26, period code 0010 = 1991-2020\)/, '(heating and cooling degree-day normals, 1991 to 2020)'],
  [/\(All Residential, not seasonally adjusted, monthly rows\)/, '(all residential, not seasonally adjusted, monthly)'],
];
const VINT_TEXT = [
  [/^ACS (\d{4}) 5-yr$/, (m, y) => `ACS ${+y - 4} to ${y}, five-year estimates`],
  [/^V(\d{4}) \(July 1 (\d{4})-(\d{4})\)$/, (m, v, a, b) => `Vintage ${v} (July 1, ${a} to ${b})`],
  [/^co\d{4}a\.txt \((\d{4}) annual, Jan-Dec; final file - \d{4} is complete\)$/, (m, y) => `${y} annual, January to December (final)`],
  [/^co\d{4}y\.txt \(Jan-(\w{3}) (\d{4}) cumulative\)$/, (m, mo, y) => `January to ${({ Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' })[mo] || mo} ${y}, cumulative`],
  [/^months ending (\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2}); file LAST_UPDATED (\d{4}-\d{2}-\d{2}).*$/, (m, a, b, u) => `12-month windows ending ${isoWords(a)} through ${isoWords(b)}; file last updated ${isoWords(u)}`],
  [/^(\d{4})-(\d{4}) normals, files (\d{4})(\d{2})(\d{2})$/, (m, a, b, y, mo, d) => `${a} to ${b} normals, files dated ${isoWords(`${y}-${mo}-${d}`)}`],
  [/^as listed on (\d{4}-\d{2}-\d{2})$/, (m, d) => `as listed on ${isoWords(d)}`],
];
const isoWords = iso => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(iso || '').trim()); if (!m) return String(iso || '—'); const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][+m[2] - 1]; return m[3] ? `${mon} ${+m[3]}, ${m[1]}` : `${mon} ${m[1]}`; };
const plainSrc = t => SRC_TEXT.reduce((x, [rx, to]) => x.replace(rx, to), String(t || '')).replace(/\b([A-Z]+)_([A-Z_]+)\b/g, m => m.toLowerCase().replace(/_/g, ' ')).replace(/\b((?:19|20)\d\d)-((?:19|20)\d\d)\b/g, '$1 to $2');
const plainVint = t => { const v = String(t || '').trim(); for (const [rx, fn] of VINT_TEXT) if (rx.test(v)) return v.replace(rx, fn); return plainSrc(v).replace(/\b(\d{4}-\d{2}-\d{2})\b/g, d => isoWords(d)); };
const RAW_LBL = { fips: 'FIPS code', state: 'state', county_name: 'county name', lat: 'latitude', lon: 'longitude', permits_units_2024: 'units permitted 2024' };
const missingNote = (ui) => `<div class="m-national">${ui.note('The national county table is not yet available. Run the county builder to publish it, then reload.', 'warn')}</div>`;

/* ═══ VIEW: scorer ═══ */
async function scorer(ctx) {
  const { el, ui, fmt, esc, maps, params, app } = ctx; css();
  const M = await loadModel(ctx); if (!M) { el.innerHTML = missingNote(ui); return; }
  const t0 = performance.now();
  if (params.state && STATE_NAMES[params.state]) S.state = params.state;
  const states = Object.keys(STATE_NAMES).sort();
  const V = M.V;
  el.innerHTML = `<div class="m-national">
    <div id="nx-head"></div>
    <div id="nx-kpis"></div>
    <div class="mt-12" id="nx-why"></div>
    <div class="grid grid-side mt-12">
      ${ui.panel({ title: 'Weights', sub: 'Relative weights · the score renormalises over the inputs each county has', actions: `<button class="btn xs" id="nx-reset">Reset</button>`, body: `<div class="m-national-presets" id="nx-presets"></div><div class="m-national-sliders" id="nx-sl"></div>`, foot: `<span class="src">Inputs: ACS 2019–23 · PEP V2024 · Census building permits 2025 + ${esc(V.p26)} · Redfin ${esc(V.sales)} · NOAA 1991–2020 normals · CBP 2022</span>` })}
      ${ui.panel({ title: 'County score map', sub: 'Colour = score band (national percentile) · size = housing units (ACS 2019–23) · click a county', actions: `<div id="nx-mode"></div>`, body: `<div class="map tall" id="nx-map" style="min-height:700px"></div>`, flush: true, foot: ui.source('National county table: Census, Redfin, NOAA, CBP · OMB metro crosswalk', 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/', 'Oct 2026') })}
    </div>
    <div class="mt-12">${ui.panel({ title: 'Top 50 counties', sub: `Ranked by score on current weights · homes and income ACS 2019–23 · sales ${esc(V.sales)} · permits 2025 and pace ${esc(V.p26)} vs US · Authority Brands offices Oct 2026 · click a row for every input and its source`, actions: `<button class="btn xs" id="nx-all">⇩ All 3,144 counties CSV</button>`, body: `<div id="nx-f"></div><div id="nx-t"></div>`, foot: ui.source(`ACS 2019–23 · Redfin ${V.sales} · Census building permits · CBP 2022 · Authority Brands location pages`, null, 'Oct 2026') })}</div>
    <div class="mt-12" id="nx-note"></div>
  </div>`;
  const $ = s => el.querySelector(s);
  // sliders
  const drawSliders = () => {
    const tot = FACTORS.reduce((a, f) => a + (S.weights[f.id] || 0), 0) || 1;
    $('#nx-sl').innerHTML = FACTORS.map(f => `<label class="m-national-sl"><span class="t">${esc(f.label)} <span class="v" data-v="${f.id}">${Math.round(((S.weights[f.id] || 0) / tot) * 100)}%</span></span><input type="range" min="0" max="40" step="1" value="${S.weights[f.id] || 0}" style="--f:${((S.weights[f.id] || 0) / 40 * 100).toFixed(1)}%" data-f="${f.id}" aria-label="${esc(f.label)} weight"><span class="h">${esc(f.hint)} · ${esc(f.vint)}</span></label>`).join('');
    $('#nx-presets').innerHTML = PRESETS.map(p => `<button class="btn xs ${FACTORS.every(f => (p.w[f.id] || 0) === (S.weights[f.id] || 0)) ? 'active' : ''}" data-p="${p.id}">${esc(p.label)}</button>`).join('');
    el.querySelectorAll('#nx-sl input').forEach(i => i.oninput = () => { S.weights[i.dataset.f] = Number(i.value); i.style.setProperty('--f', `${(Number(i.value) / 40 * 100).toFixed(1)}%`); const t = FACTORS.reduce((a, f) => a + (S.weights[f.id] || 0), 0) || 1; FACTORS.forEach(f => { const v = el.querySelector(`[data-v="${f.id}"]`); if (v) v.textContent = `${Math.round(((S.weights[f.id] || 0) / t) * 100)}%`; }); el.querySelectorAll('#nx-presets button').forEach(b => b.classList.toggle('active', FACTORS.every(f => ((PRESETS.find(p => p.id === b.dataset.p).w[f.id]) || 0) === (S.weights[f.id] || 0)))); lsSet(S.weights); recompute(); });
    el.querySelectorAll('#nx-presets button').forEach(b => b.onclick = () => { S.weights = { ...PRESETS.find(p => p.id === b.dataset.p).w }; lsSet(S.weights); drawSliders(); recompute(); });
  };
  $('#nx-reset').onclick = () => { S.weights = { ...DEFAULT_W }; lsSet(S.weights); drawSliders(); recompute(); };
  // filters + table
  const HU_OPTS = [{ value: '0', label: 'Any size' }, { value: '10000', label: '10K+ homes' }, { value: '25000', label: '25K+ homes' }, { value: '50000', label: '50K+ homes' }, { value: '100000', label: '100K+ homes' }, { value: '250000', label: '250K+ homes' }];
  const f = ui.filters($('#nx-f'), [
    { key: 'state', label: 'State', type: 'select', options: states.map(s => ({ value: s, label: STATE_NAMES[s] })), value: S.state },
    { key: 'minHU', label: 'Size', type: 'select', options: HU_OPTS, value: String(S.minHU) },
    { key: 'q', label: 'Find a county…', type: 'search', value: '' },
  ], st => { S.state = st.state; S.minHU = Number(st.minHU || 0); drawTable(); drawMap(); drawKpis(); });
  // the shared filter bar adds an "All" option; the size select uses "Any size" for 0 instead
  const cols = [
    { key: '_rank', label: 'US rank', num: true, fmt: v => v ? `#${fmt.num(v)}` : '—', sort: (a, b) => (a._rank || 1e9) - (b._rank || 1e9) },
    { key: '_name', label: 'County', fmt: (v, r) => `<b>${esc(r.county_name)}</b> <span class="dim">${esc(r.state)}</span>${r._cbsa?.type === 'metro' ? `<div class="dim small ellipsis" style="max-width:190px">${esc(r._cbsa.title)}</div>` : ''}` },
    { key: '_score', label: 'Score', num: true, fmt: (v, r) => scoreHtml(fmt, r) },
    { key: 'housing_units', label: 'Homes', num: true, fmt: v => fmt.compact(v) },
    { key: 'owner_occupied_share', label: 'Owner', num: true, fmt: v => pctTxt(v) },
    { key: 'pre1980_share', label: 'Pre-1980', num: true, fmt: v => pctTxt(v) },
    { key: 'home_sales_12m', label: 'Sales 12 mo', num: true, fmt: v => fmt.num(v) },
    { key: '_turn', label: 'Per 100', num: true, fmt: v => fmt.num(v, 1) },
    { key: 'permits_units_2025ytd', label: 'Permits 25', num: true, fmt: v => fmt.num(v) },
    { key: '_trend', label: 'Pace 26', num: true, fmt: v => signed(v, 0) },
    { key: 'median_household_income', label: 'Income', num: true, fmt: v => fmt.money(v) },
    { key: 'authority_brands_presence', label: 'AB offices', num: true, fmt: v => fin(v) ? (v > 0 ? `<b>${v}</b>` : '0') : '—' },
    { key: '_phase', label: 'PP phase', fmt: v => v ? `<span class="chip" style="--cc:${PHASE_HEX[v]}">P${v}</span>` : '<span class="dim">—</span>' },
  ];
  const filtered = () => { const q = (f.state.q || '').trim().toLowerCase(); return M.scored.filter(r => (!S.state || r.state === S.state) && (r.housing_units || 0) >= S.minHU && (!q || r._name.toLowerCase().includes(q))); };
  let table = null;
  const drawTable = () => {
    const rows = filtered(); const top = rows.slice(0, 50);
    if (!table) table = ui.table($('#nx-t'), { columns: cols, rows: top, pageSize: 25, sortKey: '_rank', sortDir: 1, rowKey: r => r.fips, onRow: r => { selectCounty(r); }, exportName: 'national_top50_counties' });
    else table.update(top);
    f.setCount(`${fmt.num(Math.min(50, rows.length))} of ${fmt.num(rows.length)} counties`);
  };
  // KPIs + headline
  const drawKpis = () => {
    const rows = filtered(); const top = rows.slice(0, 50);
    const core = M.phases[0] ? [...M.phases[0].fips].map(x => M.byFips.get(x)).filter(r => r && r._phase === 1 && r._rank) : [];
    const coreMed = core.length ? core.map(r => r._rank).sort((a, b) => a - b)[Math.floor(core.length / 2)] : null;
    const byState = {}; top.forEach(r => byState[r.state] = (byState[r.state] || 0) + 1); const stTop = Object.entries(byState).sort((a, b) => b[1] - a[1]);
    const full = M.rows.filter(r => r._miss === 0 && r._score != null).length;
    const lead = top[0];
    $('#nx-head').innerHTML = ui.pageHead({
      title: 'National expansion scorer',
      sub: `<b>So what:</b> ${lead ? `on ${wName()} the strongest county${S.state ? ` in ${esc(STATE_NAMES[S.state])}` : ''} is <b>${esc(lead._name)}</b> (score ${Math.round(lead._score)}${EST})${[stTop.length && !S.state ? `${esc(stTop.slice(0, 3).map(([s, n]) => `${s} ${n}`).join(', '))} lead the top ${Math.min(50, top.length)}` : '', coreMed ? `the Punctual Pros Phase 1 counties sit at a median national rank of #${fmt.num(coreMed)} of ${fmt.num(M.scored.length)}` : ''].filter(Boolean).map(x => '; ' + x).join('')}.` : 'no county passes the current filters.'} Drag the weights to test a different thesis.`,
      chips: `${fmt.chip(`${fmt.num(M.rows.length)} counties · 50 states + DC`, COLOR)}${fmt.chip(`${fmt.num(full)} with every input`)}${fmt.chip(wName(), isCustom() ? 'var(--amber)' : null)}`,
    });
    const withSales = top.filter(r => fin(r.home_sales_12m));
    $('#nx-kpis').innerHTML = ui.kpis([
      { label: 'Counties scored', value: fmt.num(M.scored.length), sub: `${fmt.num(rows.length)} pass the size${S.state ? ' and state' : ''} filter`, color: COLOR },
      { label: 'Top 50 · homes', value: fmt.compact(sum(top, r => r.housing_units)), sub: 'housing units, ACS 2019–23', color: 'var(--accent)' },
      { label: 'Top 50 · home sales', value: fmt.compact(sum(top, r => r.home_sales_12m)), sub: `${esc(V.sales)} · ${withSales.length} of ${top.length} counties report`, color: 'var(--green)' },
      { label: 'Top 50 · permits', value: fmt.compact(sum(top, r => r.permits_units_2025ytd)), sub: `units permitted in 2025 · ${fmt.compact(sum(top, r => r.permits_units_2026ytd))} in ${esc(V.p26)}`, color: 'var(--amber)' },
      { label: 'Top 50 · AB offices', value: fmt.num(sum(top, r => r.authority_brands_presence)), sub: `${top.filter(r => r.authority_brands_presence > 0).length} counties with a One Hour, Ben Franklin or Mister Sparky office (Oct 2026)`, color: 'var(--purple)' },
      { label: 'PP Phase 1 median rank', value: coreMed ? `#${fmt.num(coreMed)}` : '—', sub: `of ${fmt.num(M.scored.length)} counties · ${core.length} core + ring counties`, color: PP_HEX },
    ]);
    $('#nx-note').innerHTML = ui.note(`<b>How the score works.</b> Each input is converted to the county’s percentile among all US counties that report it (contractor density is inverted: fewer contractors per home scores higher). The score is the weighted average of those percentiles on a 0–100 scale; a county missing an input has that weight spread over the rest, and its inspector says so. Scores are model outputs, so every score carries an est. badge. Full formulas, vintages and coverage are on the <a href="#/national/method">Method</a> tab.`, 'brand');
  };
  // why the Pennsylvania core ranks mid-pack, and the same counties on the plan's own weights (both views side by side)
  const drawWhy = () => {
    const core = (M.hubs || []).filter(r => r.state === 'PA'); if (!core.length) { $('#nx-why').innerHTML = ''; return; }
    const bal = rankWith(M, DEFAULT_W), th = rankWith(M, THESIS.w), n = M.scored.length;
    const medRank = rk => median(core.map(r => rk.get(r.fips)));
    const pct = k => median(core.map(r => r._p[k])), pp = v => { if (!fin(v)) return '—'; const n = Math.round(v * 100), t = n % 100; return `${n}${t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`; };
    const band = v => !fin(v) ? 'unknown' : v < 1 / 3 ? 'in the bottom third' : v < 2 / 3 ? 'in the middle third' : 'in the top third';
    const ownP = pct('owner'), ownV = median(core.map(r => r.owner_occupied_share)), ownUS = median(M.rows.map(r => r.owner_occupied_share));
    const pace = median(core.map(r => r._trend)), paceP = median(core.map(r => r._permParts.trend));
    const top50 = (rk, sts) => M.rows.filter(r => sts.includes(r.state) && (rk.get(r.fips) || 1e9) <= 50).length;
    const bestPaNj = rk => M.rows.filter(r => ['PA', 'NJ'].includes(r.state) && rk.get(r.fips)).sort((a, b) => rk.get(a.fips) - rk.get(b.fips))[0];
    const bB = bestPaNj(bal), bT = bestPaNj(th);
    const card = (title, rk, body, preset) => `<div class="m-national-why-c"><div class="m-national-why-h"><b>${esc(title)}</b>${fmt.chip(`core median #${fmt.num(medRank(rk))} of ${fmt.num(n)}`, preset === 'thesis' ? PP_HEX : null)}</div><div class="small text-2">${body}</div><div class="row wrap gap-4 mt-8"><span class="dim small">PA and NJ counties in the national top 50: <b>${fmt.num(top50(rk, ['PA', 'NJ']))}</b> · best: ${bestPaNj(rk) ? `${esc(bestPaNj(rk)._name)} #${fmt.num(rk.get(bestPaNj(rk).fips))}` : '—'}</span><button class="btn xs" data-why="${preset}">${preset === 'thesis' ? 'Score on the Punctual Pros thesis' : 'Score on balanced weights'}</button></div></div>`;
    $('#nx-why').innerHTML = ui.panel({
      title: 'Why the Pennsylvania core ranks mid-pack',
      sub: `The nine Phase 1 core counties (${esc(core.map(r => String(r.county_name).replace(/\s+County$/i, '')).join(', '))}) on two weight sets. Ranks are national, across ${fmt.num(n)} scored counties; every score is an estimate.`,
      body: `<div class="m-national-why">${card('Balanced weights: the market view', bal,
        `Two inputs hold the core back. <b>Owner share</b>: a median ${pctTxt(ownV)} of homes are owner-occupied, ${fin(ownV) && fin(ownUS) && ownV < ownUS ? 'below' : 'close to'} the median US county (${pctTxt(ownUS)}), because rural counties everywhere own more; that is the ${pp(ownP)} percentile. <b>2026 permit pace</b>: January to August 2026 permits run ${signed(pace, 0)} against the US pace, the ${pp(paceP)} percentile, so building momentum also sits ${band(paceP)}. Older homes (${pp(pct('age'))} percentile) and income (${pp(pct('income'))}) help, but not enough to lift the core into the top quartile on market-wide weights.`, 'balanced')}
      ${card('Punctual Pros thesis: the plan’s view', th,
        `The nationwide plan argues from <b>older housing</b> (30% weight), <b>heating and cooling demand</b> (20%) and <b>adjacency</b> to the hubs Punctual Pros already runs (30%), with income, owner share and sales as tie-breakers. On those weights the same counties score on what route density and furnace and boiler replacement actually depend on, and the plan’s next counties surface in Pennsylvania and New Jersey first. Adjacency is the one input built for the plan: full credit within 30 miles of a core or Toms River hub county, none beyond 150 miles.`, 'thesis')}</div>`,
      foot: ui.source('National county table (ACS 2019–23, Census building permits Jan–Aug 2026) · Punctual Pros nationwide plan', null, 'Oct 2026'),
    });
    el.querySelectorAll('[data-why]').forEach(b => b.onclick = () => { S.weights = { ...(b.dataset.why === 'thesis' ? THESIS.w : DEFAULT_W) }; lsSet(S.weights); drawSliders(); recompute(); });
  };
  // map
  const map = maps.create($('#nx-map'), { center: [38.6, -96.5], zoom: 4, minZoom: 3 }); fitUS(map);
  const layer = L.layerGroup().addTo(map); let ring = null;
  const legend = L.control({ position: 'bottomright' }); legend.onAdd = () => { const d = L.DomUtil.create('div', 'map-legend'); d.innerHTML = `<div class="t">Score band</div>${BINS.map(b => `<div class="li"><span class="sw" style="background:${b.hex}"></span>${esc(b.label)}</div>`).join('')}<div class="li dim">Size = housing units</div>`; return d; }; legend.addTo(map);
  const drawMap = () => {
    layer.clearLayers();
    const z = map.getZoom();
    if (S.mapMode === 'states') {
      const g = new Map();
      for (const r of M.scored) { if ((r.housing_units || 0) < S.minHU) continue; let s = g.get(r.state); if (!s) { s = { state: r.state, hu: 0, w: 0, lat: 0, lon: 0, n: 0, sales: 0, ab: 0 }; g.set(r.state, s); } const h = r.housing_units || 0; s.hu += h; s.w += r._score * h; s.lat += r.lat * h; s.lon += r.lon * h; s.n++; s.sales += r.home_sales_12m || 0; s.ab += r.authority_brands_presence || 0; }
      const arr = [...g.values()].map(s => ({ ...s, score: s.w / Math.max(1, s.hu), lat: s.lat / Math.max(1, s.hu), lon: s.lon / Math.max(1, s.hu) })).sort((a, b) => b.score - a.score);
      arr.forEach((s, i) => { const p = arr.length > 1 ? 1 - i / (arr.length - 1) : 1; const m = L.circleMarker([s.lat, s.lon], { renderer: map._renderer, radius: Math.min(30, 4 + Math.sqrt(s.hu / 1e4) * 1.1), color: '#0a0e14', weight: 1, fillColor: binOf(p).hex, fillOpacity: .85 }); m.bindTooltip(() => `<b>${esc(STATE_NAMES[s.state] || s.state)}</b><br>Score ${Math.round(s.score)} est. (housing-weighted) · rank ${i + 1} of ${arr.length}<br>${fmt.num(s.n)} counties · ${fmt.compact(s.hu)} homes · ${fmt.compact(s.sales)} sales`, { direction: 'top' }); m.on('click', () => { f.state.state = s.state; S.state = s.state; const sel = el.querySelector('#nx-f select[data-k=state]'); if (sel) sel.value = s.state; drawTable(); drawKpis(); }); layer.addLayer(m); });
      return;
    }
    let list = M.scored.filter(r => (r.housing_units || 0) >= S.minHU && (!S.state || r.state === S.state));
    if (S.mapMode === 'top' && z < 7) list = list.slice(0, 300);
    else if (list.length > 1500) { const b = map.getBounds().pad(0.2); list = list.filter(r => b.contains([r.lat, r.lon])); }
    for (let i = list.length - 1; i >= 0; i--) { const r = list[i]; const m = L.circleMarker([r.lat, r.lon], { renderer: map._renderer, radius: radiusHU(r.housing_units), color: '#0a0e14', weight: .6, fillColor: binOf(r._pctl).hex, fillOpacity: .88 }); m.bindTooltip(() => `<b>${esc(r._name)}</b><br>Score ${Math.round(r._score)} est. · #${fmt.num(r._rank)}<br>${fmt.compact(r.housing_units)} homes · ${fmt.num(r.home_sales_12m)} sales (${esc(V.sales)})`, { direction: 'top' }); m.on('click', () => selectCounty(r)); layer.addLayer(m); }
  };
  const selectCounty = r => { if (ring) map.removeLayer(ring); ring = L.circleMarker([r.lat, r.lon], { radius: radiusHU(r.housing_units) + 5, color: PP_HEX, weight: 2.5, fill: false, interactive: false }).addTo(map); openCounty(ctx, M, r); };
  ui.seg($('#nx-mode'), [{ value: 'top', label: 'Top 300' }, { value: 'all', label: 'All' }, { value: 'states', label: 'States' }], S.mapMode, v => { S.mapMode = v; drawMap(); });
  const onMove = debounce(() => { if (!map._nxDead && S.mapMode !== 'states') drawMap(); }, 120); map.on('zoomend moveend', onMove);
  const recompute = debounce(() => { if (map._nxDead) return; score(M); drawKpis(); drawTable(); drawMap(); }, 70);
  $('#nx-all').onclick = () => ui.exportCSV(M.rows.slice().sort((a, b) => (a._rank || 1e9) - (b._rank || 1e9)).map(r => ({ ...r, score: r._score != null ? Math.round(r._score * 10) / 10 : null, national_rank: r._rank, inputs_missing: r._miss, sales_per_100_homes: r._turn != null ? Math.round(r._turn * 100) / 100 : null, permit_pace_vs_us: r._trend != null ? Math.round(r._trend * 1000) / 1000 : null, contractors_per_10k_homes: r._dens != null ? Math.round(r._dens * 100) / 100 : null, metro: r._cbsa?.title || null, pp_phase: r._phase })), [{ key: 'national_rank' }, { key: 'fips' }, { key: 'county_name' }, { key: 'state' }, { key: 'score' }, { key: 'inputs_missing' }, { key: 'metro' }, { key: 'pp_phase' }, ...['housing_units', 'owner_occupied_share', 'pre1980_share', 'median_year_built', 'median_household_income', 'pop_growth_2020_2024', 'permits_units_2024', 'permits_units_2025ytd', 'permits_units_2026ytd', 'permits_per_1k_hu_2025', 'home_sales_12m', 'median_sale_price', 'median_dom', 'hdd_normal_1991_2020', 'cdd_normal_1991_2020', 'hvac_plumbing_electrical_establishments', 'authority_brands_presence'].map(k => ({ key: k })), { key: 'sales_per_100_homes' }, { key: 'permit_pace_vs_us' }, { key: 'contractors_per_10k_homes' }], 'national_county_scores');
  drawSliders(); drawKpis(); drawWhy(); drawTable(); drawMap();
  // search index (top counties on default weights) + deep link
  app.index(M.scored.slice(0, 300).map(r => ({ label: r._name, sub: `County score ${Math.round(r._score)} · rank #${r._rank}`, href: `#/national/scorer?fips=${r.fips}`, kind: 'County', color: PP_HEX })));
  if (params.fips && M.byFips.get(params.fips)) { const r = M.byFips.get(params.fips); selectCounty(r); map.setView([r.lat, r.lon], 7); }
  el.querySelector('.m-national').dataset.renderMs = String(Math.round(performance.now() - t0 + M.loadMs));
  return () => { map.off('zoomend moveend', onMove); kill(map); };
}

/* ═══ VIEW: phases ═══ */
async function phases(ctx) {
  const { el, ui, fmt, esc, maps } = ctx; css();
  const M = await loadModel(ctx); if (!M) { el.innerHTML = missingNote(ui); return; }
  const t0 = performance.now();
  const V = M.V;
  const st = M.phases.map(p => ({ p, ...phaseStats(M, p) }));
  const tg = p => p.item?.kpi_targets || null;
  const p1 = st[0], p4 = st[3];
  el.innerHTML = `<div class="m-national">${ui.pageHead({
    title: 'Punctual Pros phases on the national map',
    sub: `<b>So what:</b> Phases 1–3 cover ${fmt.num(st[0].n + st[1].n + st[2].n)} Mid-Atlantic counties with ${fmt.compact(st[0].hu + st[1].hu + st[2].hu)} homes and ${fmt.compact(st[0].sales + st[1].sales + st[2].sales)} home sales a year; Phase 4’s Sun Belt and Midwest counties with an Authority Brands office add ${fmt.compact(p4.hu)} homes and ${fmt.num(p4.ab)} tri-brand offices, the pool of multi-territory franchisees to buy. ${p1.score != null && p4.score != null ? `On ${wName()} the Phase 4 pool scores ${Math.round(p4.score)}${EST} against ${Math.round(p1.score)}${EST} for Phase 1.` : ''}`,
    chips: `${fmt.chip('Phases from the Punctual Pros nationwide plan', COLOR)}${fmt.chip('each county counted once, in its earliest phase')}${fmt.chip(wName(), isCustom() ? 'var(--amber)' : null)}`,
  })}
  <div class="m-national-phases">${st.map(s => `<div class="m-national-ph" style="--pc:${PHASE_HEX[s.p.n]}"><div class="k">Phase ${s.p.n} · months ${esc(String(s.p.months).replace('-', '–'))}</div><div class="t">${esc(s.p.title)}</div>
    <div class="g"><div><b>${fmt.num(s.n)}</b><span>counties</span></div><div><b>${fmt.compact(s.hu)}</b><span>homes · ACS 19–23</span></div><div><b>${fmt.compact(s.sales)}</b><span>sales · ${esc(V.sales)}</span></div><div><b>${fmt.compact(s.p25)}</b><span>permits 2025</span></div><div><b>${fmt.compact(s.p26)}</b><span>permits ${esc(V.p26)}</span></div><div><b>${s.score != null ? Math.round(s.score) : '—'}${s.score != null ? EST : ''}</b><span>score, home-weighted</span></div></div>
    <div class="f">${fmt.num(s.ab)} Authority Brands offices · ${fmt.num(s.estab)} trade contractors (CBP 2022) · ${s.top10} top-decile counties${s.salesN < s.n ? ` · sales reported for ${s.salesN} of ${s.n}` : ''}${tg(s.p) ? `<br>Plan target: ${fmt.money(tg(s.p).revenue_usd)} revenue, ${fmt.num(tg(s.p).territories)} territories ${EST} <span class="dim">(analyst assumption)</span>` : ''}</div></div>`).join('')}</div>
  <div class="mt-12">${ui.panel({ title: 'Phase comparison', sub: 'Totals over each phase’s counties · vintages in the row labels', body: `<div class="tbl-wrap"><table class="tbl" id="ph-cmp"><thead><tr><th>Measure</th>${st.map(s => `<th class="num"><span class="chip" style="--cc:${PHASE_HEX[s.p.n]}">P${s.p.n}</span></th>`).join('')}</tr></thead><tbody>${[
      ['Counties', s => fmt.num(s.n)], ['Housing units (ACS 2019–23)', s => fmt.compact(s.hu)], [`Home sales (${V.sales})`, s => fmt.compact(s.sales)], ['Sales per 100 homes', s => s.hu ? fmt.num(s.sales / sum(s.cs.filter(r => fin(r.home_sales_12m)), r => r.housing_units) * 100, 1) : '—'],
      ['Units permitted (2025)', s => fmt.compact(s.p25)], [`Units permitted (${V.p26})`, s => fmt.compact(s.p26)], ['Permits per 1,000 homes (2025)', s => s.hu ? fmt.num(s.p25 / s.hu * 1000, 1) : '—'],
      ['Trade contractors (CBP 2022)', s => fmt.num(s.estab)], ['Authority Brands offices (Oct 2026)', s => fmt.num(s.ab)], ['Top-decile counties', s => fmt.num(s.top10)], ['Score, home-weighted', s => s.score != null ? `${Math.round(s.score)}${EST}` : '—'],
    ].map(([l, f]) => `<tr><td>${esc(l)}</td>${st.map(s => `<td class="num">${f(s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, foot: ui.source(`ACS 2019–23 · Redfin ${V.sales} · Census building permits · CBP 2022 · Authority Brands location pages`, null, 'Oct 2026') })}</div>
  <div class="mt-12">${ui.panel({ title: 'Phase geography', sub: 'Colour = phase · size = housing units · click a county for its score and inputs', body: `<div class="map tall" id="ph-map"></div>`, flush: true, foot: ui.source('Punctual Pros nationwide plan (phase geographies) · national county table · OMB 2023 metro crosswalk (Richmond)', M.pn?.items?.find(i => i.id === 'pn-phase-3')?.source_url || null, 'Oct 2026') })}</div>
  <div class="mt-12">${ui.panel({ title: 'Counties by phase', sub: 'Every mapped county with its score and the basis for its phase assignment', body: '<div id="ph-f"></div><div id="ph-t"></div>', foot: ui.source('Punctual Pros nationwide plan · national county table', null, 'Oct 2026') })}</div>
  <div class="mt-12">${ui.note(`<b>How phases map to counties.</b> Phase 1 uses the plan’s core and adjacent-ring county lists. Phase 2 uses the plan’s four metro county lists, all of Delaware and an analyst reading of “Central & Eastern PA” (${esc(P2_PA.join(', '))}). Phase 3 uses the plan’s four metro lists plus the Richmond, VA metro from the OMB July 2023 delineation. Phase 4 is an analyst proxy for “Sun Belt and Midwest multi-territory franchisees”: counties in ${esc(SUNBELT.join(', '))} (Sun Belt) and ${esc(MIDWEST.join(', '))} (Census Midwest) with at least one One Hour, Benjamin Franklin or Mister Sparky office. A county listed in two phases is counted once, in the earlier phase (${st.map(s => `P${s.p.n}: ${s.p.overlap} moved`).join(', ')}).`, 'brand')}</div>
  </div>`;
  const map = maps.create(el.querySelector('#ph-map'), { center: [37.5, -88], zoom: 4, minZoom: 3 }); fitUS(map);
  const all = st.flatMap(s => s.cs);
  for (const r of all.slice().sort((a, b) => (b._phase || 0) - (a._phase || 0))) { const m = L.circleMarker([r.lat, r.lon], { renderer: map._renderer, radius: radiusHU(r.housing_units), color: '#0a0e14', weight: .6, fillColor: PHASE_HEX[r._phase], fillOpacity: .85 }); m.bindTooltip(() => `<b>${esc(r._name)}</b><br>Phase ${r._phase} · score ${r._score != null ? Math.round(r._score) : '—'} est.<br>${fmt.compact(r.housing_units)} homes`, { direction: 'top' }); m.on('click', () => openCounty(ctx, M, r)); m.addTo(map); }
  maps.legend(map, st.map(s => ({ color: PHASE_HEX[s.p.n], label: `Phase ${s.p.n} · ${s.n} counties` })), 'Punctual Pros phase');
  const cols = [
    { key: '_phase', label: 'Phase', fmt: v => `<span class="chip" style="--cc:${PHASE_HEX[v]}">P${v}</span>` },
    { key: '_name', label: 'County', fmt: (v, r) => `<b>${esc(r.county_name)}</b> <span class="dim">${esc(r.state)}</span>` },
    { key: '_basis', label: 'Basis', wrap: true, fmt: v => `<span class="small text-2">${esc(v)}</span>` },
    { key: '_score', label: 'Score', num: true, fmt: (v, r) => scoreHtml(fmt, r) },
    { key: '_rank', label: 'US rank', num: true, fmt: v => v ? `#${fmt.num(v)}` : '—' },
    { key: 'housing_units', label: 'Homes (ACS)', num: true, fmt: v => fmt.compact(v) },
    { key: 'home_sales_12m', label: `Sales (${V.sales})`, num: true, fmt: v => fmt.num(v) },
    { key: 'permits_units_2025ytd', label: 'Permits 2025', num: true, fmt: v => fmt.num(v) },
    { key: 'permits_units_2026ytd', label: `Permits ${V.p26}`, num: true, fmt: v => fmt.num(v) },
    { key: 'authority_brands_presence', label: 'AB offices', num: true, fmt: v => fmt.num(v) },
  ];
  const rows = all.map(r => Object.assign(r, { _basis: M.phases.find(p => p.n === r._phase)?.basis.get(r.fips) || '' }));
  const t = ui.table(el.querySelector('#ph-t'), { columns: cols, rows, pageSize: 25, sortKey: '_score', rowKey: r => r.fips, onRow: r => openCounty(ctx, M, r), exportName: 'pp_phase_counties' });
  const fl = ui.filters(el.querySelector('#ph-f'), [{ key: 'ph', label: 'Phase', type: 'select', options: [1, 2, 3, 4].map(n => ({ value: String(n), label: `Phase ${n}` })) }, { key: 'state', label: 'State', type: 'select', options: [...new Set(rows.map(r => r.state))].sort().map(s => ({ value: s, label: STATE_NAMES[s] || s })) }], s => { const out = rows.filter(r => (!s.ph || String(r._phase) === s.ph) && (!s.state || r.state === s.state)); t.update(out); fl.setCount(`${fmt.num(out.length)} counties`); });
  fl.setCount(`${fmt.num(rows.length)} counties`);
  el.querySelector('.m-national').dataset.renderMs = String(Math.round(performance.now() - t0));
  return () => kill(map);
}

/* ═══ VIEW: markets (metro roll-ups) ═══ */
async function markets(ctx) {
  const { el, ui, fmt, esc, maps, charts, params, app } = ctx; css();
  const M = await loadModel(ctx); if (!M) { el.innerHTML = missingNote(ui); return; }
  const t0 = performance.now();
  const V = M.V;
  if (!M.metros.length) { el.innerHTML = `<div class="m-national">${ui.pageHead({ title: 'Metro markets' })}${ui.note('Research dataset not yet available: the county-to-metro crosswalk is missing, so metro roll-ups cannot be built.', 'warn')}</div>`; return; }
  const all = metroRoll(M);
  el.innerHTML = `<div class="m-national"><div id="mk-head"></div><div id="mk-kpis"></div>
    <div class="mt-12">${ui.panel({ title: 'Top 25 metros', sub: `Score = housing-weighted average of member-county scores · homes ACS 2019–23 · sales ${esc(V.sales)} · permits 2025 and ${esc(V.p26)} pace vs US · contractors CBP 2022 · click a metro for its counties`, actions: '<div id="mk-size"></div>', body: '<div id="mk-t"></div>', foot: ui.source('OMB July 2023 metro delineation (Census List 1) · national county table', M.cbsaMeta?.source?.url || null, M.cbsaMeta?.source?.retrieved || 'Oct 2026') })}</div>
    <div class="grid grid-main mt-12">
      ${ui.panel({ title: 'Metro map', sub: 'Top 25 in colour, other metros grey · size = housing units', body: '<div class="map tall" id="mk-map"></div>', flush: true, foot: ui.source('OMB 2023 metro delineation · ACS 2019–23', M.cbsaMeta?.source?.url || null, 'Oct 2026') })}
      <div class="col gap-12">${ui.panel({ title: 'Score, top 25 metros', body: '<div id="mk-bar"></div>', foot: ui.source('Expansion score on current weights (model output)', null, 'Oct 2026') })}
      ${ui.panel({ title: 'Authority Brands footprint in the top 25', sub: 'One Hour, Benjamin Franklin and Mister Sparky offices with a listed address, geocoded to county (Oct 2026)', body: '<div id="mk-ab"></div>', foot: ui.source('Authority Brands public location pages', 'https://www.onehourheatandair.com/locations/', 'Oct 2026') })}</div>
    </div></div>`;
  const $ = s => el.querySelector(s);
  const SIZES = [{ value: '50000', label: '50K+' }, { value: '150000', label: '150K+' }, { value: '500000', label: '500K+' }, { value: '1000000', label: '1M+' }];
  let table = null, map = null, layer = null;
  const cols = [
    { key: '_r', label: '#', num: true },
    { key: 'title', label: 'Metro', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${fmt.num(r.n)} ${r.n === 1 ? 'county' : 'counties'}${r.phase < 9 ? ` · <span class="chip" style="--cc:${PHASE_HEX[r.phase]}">PP phase ${r.phase}</span>` : ''}</div>` },
    { key: 'score', label: 'Score', num: true, fmt: v => `${fmt.score(v, PP_HEX)}${EST}` },
    { key: 'hu', label: 'Homes (ACS)', num: true, fmt: v => fmt.compact(v) },
    { key: 'sales', label: 'Sales 12 mo', num: true, fmt: v => fmt.compact(v) },
    { key: 'turn', label: 'Per 100 homes', num: true, fmt: v => fmt.num(v, 1) },
    { key: 'p25', label: 'Permits 2025', num: true, fmt: v => fmt.compact(v) },
    { key: 'trend', label: 'Pace 26', num: true, fmt: v => signed(v, 0) },
    { key: 'estab', label: 'Contractors', num: true, fmt: v => fmt.num(v) },
    { key: 'ab', label: 'AB offices', num: true, fmt: v => fin(v) ? (v ? `<b>${v}</b>` : '0') : '<span class="dim" title="Connecticut planning regions have no franchise counts">—</span>' },
  ];
  const openMetro = m => {
    const cs = m.metro.counties.slice().sort((a, b) => (b._score ?? -1) - (a._score ?? -1));
    ctx.inspector.open({
      title: esc(m.title), sub: `OMB metro code ${esc(m.id)} · ${fmt.num(m.n)} ${m.n === 1 ? 'county' : 'counties'} · ${esc(m.states)}`, color: PP_HEX,
      sections: [
        { label: 'Roll-up', html: ui.kv({ Score: `${fmt.score(m.score, PP_HEX)}${EST}`, 'Housing units (ACS 2019–23)': fmt.num(m.hu), [`Home sales (${V.sales})`]: fmt.num(m.sales), 'Sales per 100 homes': fmt.num(m.turn, 1), 'Units permitted 2025': fmt.num(m.p25), [`Units permitted ${V.p26}`]: fmt.num(m.p26), [`${V.p26} pace vs US`]: signed(m.trend, 0), 'Trade contractors (CBP 2022)': `${fmt.num(m.estab)} · ${fmt.num(m.dens, 1)} per 10k homes`, 'Authority Brands offices (Oct 2026)': m.abBrands ? `${fmt.num(m.ab)} · ${m.abBrands.map(([b, n]) => `${esc(b)} ${n}`).join(' · ')}` : '— (not available)', 'Combined area': m.metro.csa ? esc(m.metro.csa) : '—', 'Punctual Pros phase': m.phase < 9 ? `Phase ${m.phase}` : 'Outside the mapped phases' }) },
        { label: 'Counties inside', html: `<table class="tbl"><thead><tr><th>County</th><th class="num">Score</th><th class="num">Homes</th><th class="num">Sales</th><th class="num">AB</th></tr></thead><tbody>${cs.map(r => `<tr data-f="${esc(r.fips)}" style="cursor:pointer"><td>${esc(r.county_name)} <span class="dim">${esc(r.state)}</span>${m.metro.central.has(r.fips) ? '' : ' <span class="dim small">outlying</span>'}</td><td class="num">${r._score != null ? Math.round(r._score) : '—'}</td><td class="num">${fmt.compact(r.housing_units)}</td><td class="num">${fmt.num(r.home_sales_12m)}</td><td class="num">${fin(r.authority_brands_presence) ? r.authority_brands_presence : '—'}</td></tr>`).join('')}</tbody></table><div class="dim small mt-8">Click a county to open its inputs.</div>` },
        { label: 'Next step', html: `<div class="small">${esc(m.ab > 0 ? `List the ${m.ab} tri-brand office${m.ab > 1 ? 's' : ''} here by owner and approach multi-territory franchisees first; then screen independents for density.` : 'No tri-brand office listed: this is an independent-tuck-in or new-territory market. Pull the NAICS 238220 roster and check territory availability with Authority Brands.')}</div>` },
        { label: 'Source', html: `<div class="small">${fmt.link(m.metro.source_url, 'OMB July 2023 delineation (Census List 1)')} · retrieved ${esc(m.metro.retrieved || '—')}</div>` },
      ],
    });
    setTimeout(() => document.querySelectorAll('#inspector tr[data-f]').forEach(tr => tr.onclick = () => openCounty(ctx, M, M.byFips.get(tr.dataset.f))), 0);
  };
  const draw = () => {
    const min = S.metroMin; const pool = all.filter(m => m.hu >= min).sort((a, b) => b.score - a.score); pool.forEach((m, i) => m._r = i + 1); const top = pool.slice(0, 25);
    $('#mk-head').innerHTML = ui.pageHead({
      title: 'Metro markets',
      sub: `<b>So what:</b> among ${fmt.num(pool.length)} metros with ${fmt.compact(min)}+ homes, <b>${esc(top[0]?.title || '—')}</b> leads on ${wName()}; the top 25 hold ${fmt.compact(sum(top, m => m.hu))} homes, ${fmt.compact(sum(top, m => m.sales))} sales a year and ${fmt.num(sum(top, m => m.ab))} Authority Brands offices. ${top.filter(m => !m.ab).length} of them have no tri-brand office, so entry there means an independent tuck-in or a new territory.`,
      chips: `${fmt.chip(`${fmt.num(M.metros.filter(m => m.type === 'metro').length)} metro areas (OMB 2023)`, COLOR)}${fmt.chip(wName(), isCustom() ? 'var(--amber)' : null)}`,
    });
    $('#mk-kpis').innerHTML = ui.kpis([
      { label: 'Metros in pool', value: fmt.num(pool.length), sub: `${fmt.compact(min)}+ housing units`, color: COLOR },
      { label: 'Top 25 · homes', value: fmt.compact(sum(top, m => m.hu)), sub: 'ACS 2019–23', color: 'var(--accent)' },
      { label: 'Top 25 · home sales', value: fmt.compact(sum(top, m => m.sales)), sub: esc(V.sales), color: 'var(--green)' },
      { label: 'Top 25 · permits', value: fmt.compact(sum(top, m => m.p25)), sub: `2025 · ${fmt.compact(sum(top, m => m.p26))} in ${esc(V.p26)}`, color: 'var(--amber)' },
      { label: 'Top 25 · AB offices', value: fmt.num(sum(top, m => m.ab)), sub: `${top.filter(m => m.ab > 0).length} metros with a tri-brand office (Oct 2026)`, color: 'var(--purple)' },
      { label: 'Top 25 · contractors', value: fmt.compact(sum(top, m => m.estab)), sub: 'plumbing, HVAC, electrical (CBP 2022)', color: 'var(--cyan)' },
    ]);
    if (!table) table = ui.table($('#mk-t'), { columns: cols, rows: top, pageSize: 25, sortKey: '_r', sortDir: 1, rowKey: r => r.id, onRow: openMetro, exportName: 'national_top25_metros' }); else table.update(top);
    $('#mk-bar').innerHTML = charts.hbar(top.map(m => ({ label: m.title, value: m.score, color: m.phase < 9 ? PHASE_HEX[m.phase] : OUT_HEX })), { fmt: v => fmt.num(v, 0), labelW: 190, max: 100 }) + legendHtml(esc, 'Bar colour', [1, 2, 3, 4].map(n => ({ hex: PHASE_HEX[n], label: `PP phase ${n}` })).concat([{ hex: OUT_HEX, label: 'outside the mapped phases' }]));
    const abTop = top.filter(m => fin(m.ab)).sort((a, b) => b.ab - a.ab).slice(0, 12);
    $('#mk-ab').innerHTML = abTop.some(m => m.ab > 0) ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Metro</th><th class="num">One Hour</th><th class="num">Ben Franklin</th><th class="num">Mister Sparky</th><th class="num">Total</th></tr></thead><tbody>${abTop.map(m => `<tr><td>${esc(m.title)}</td>${m.abBrands.map(([, n]) => `<td class="num">${fmt.num(n)}</td>`).join('')}<td class="num"><b>${fmt.num(m.ab)}</b></td></tr>`).join('')}</tbody></table></div>` : ui.empty('No Authority Brands offices listed in the top 25 metros');
    if (map) { layer.clearLayers(); const topIds = new Set(top.map(m => m.id)); for (const m of all.filter(x => x.hu >= 50000).sort((a, b) => (topIds.has(a.id) ? 1 : 0) - (topIds.has(b.id) ? 1 : 0))) { const on = topIds.has(m.id); const c = L.circleMarker([m.lat, m.lon], { renderer: map._renderer, radius: Math.min(26, 3 + Math.sqrt(m.hu / 1e4) * 1.0), color: '#0a0e14', weight: .7, fillColor: on ? PP_HEX : '#5b6b7f', fillOpacity: on ? .9 : .35 }); c.bindTooltip(() => `<b>${esc(m.title)}</b><br>Score ${Math.round(m.score)} est.${on ? ` · #${m._r} of top 25` : ''}<br>${fmt.compact(m.hu)} homes · ${fmt.num(m.ab)} AB offices`, { direction: 'top' }); c.on('click', () => openMetro(m)); layer.addLayer(c); } }
  };
  ui.seg($('#mk-size'), SIZES, String(S.metroMin), v => { S.metroMin = Number(v); draw(); });
  map = maps.create($('#mk-map'), { center: [38.6, -96.5], zoom: 4, minZoom: 3 }); fitUS(map); layer = L.layerGroup().addTo(map);
  draw();
  app.index(all.sort((a, b) => b.score - a.score).slice(0, 100).map(m => ({ label: m.title, sub: `Metro score ${Math.round(m.score)}`, href: `#/national/markets?cbsa=${m.id}`, kind: 'Metro', color: PP_HEX })));
  if (params.cbsa) { const m = all.find(x => x.id === params.cbsa); if (m) { openMetro(m); map.setView([m.lat, m.lon], 7); } }
  el.querySelector('.m-national').dataset.renderMs = String(Math.round(performance.now() - t0));
  return () => kill(map);
}

/* ═══ VIEW: method ═══ */
async function method(ctx) {
  const { el, ui, fmt, esc } = ctx; css();
  const M = await loadModel(ctx); if (!M) { el.innerHTML = missingNote(ui); return; }
  const meta = M.meta, cov = meta.coverage || {}, V = M.V;
  const covOf = k => fin(cov[k]) ? cov[k] : (() => { const n = M.rows.filter(r => fin(r[k])).length; return n / Math.max(1, M.rows.length); })();
  const derived = { _turn: 'Sales per 100 homes', _trend: 'Permit pace vs US', _dd: 'Total degree days', _dens: 'Contractors per 10k homes' };
  const factorCov = f => { const n = M.rows.filter(r => !isNaN(r._p[f.id])).length; return n / M.rows.length; };
  const FORM = {
    age: 'percentile of pre-1980 share = (built 1979 or earlier) / all housing units (ACS B25034)',
    owner: 'percentile of owner-occupied / occupied housing units (ACS B25003)',
    permits: `mean of two percentiles: units permitted per 1,000 homes in 2025, and the county’s ${V.p26} ÷ 2025 ratio divided by the US ratio (${M.natPace.toFixed(3)}) minus 1; the pace term needs 20+ units in 2025`,
    sales: `percentile of Redfin home sales (${V.sales}) ÷ housing units × 100; left blank unless all 12 months are reported`,
    income: 'percentile of median household income (ACS B19013, 2023 dollars)',
    climate: 'percentile of normal heating degree days + cooling degree days (base 65°F, NOAA 1991–2020)',
    comp: 'inverted percentile of (NAICS 238220 + 238210 establishments, CBP 2022) ÷ housing units × 10,000',
    growth: 'percentile of PEP July 2024 ÷ July 2020 population − 1',
    adj: 'not a percentile: 1.0 when the county’s internal point is within 30 miles (the plan’s density tuck-in radius) of a Punctual Pros hub county (the nine Phase 1 core counties in PA, Ocean and Monmouth in NJ), falling in a straight line to 0 at 150 miles (the Phase 2 reach); weighted only in the Punctual Pros thesis preset',
  };
  const srcRows = (meta.sources || []).map(s => ({ name: plainSrc(s.name), fields: s.field_group, vint: plainVint(s.vintage), ret: isoWords(s.retrieved), url: srcUrl(s) }));
  if (M.cbsaMeta?.source) srcRows.push({ name: plainSrc(M.cbsaMeta.source.name), fields: 'metro roll-ups (county to metro area)', vint: plainVint(M.cbsaMeta.source.vintage), ret: isoWords(M.cbsaMeta.source.retrieved), url: M.cbsaMeta.source.url });
  const pnMeta = M.pn?.meta; if (pnMeta) srcRows.push({ name: 'Punctual Pros nationwide plan (phases 1–4)', fields: 'phase geographies, plan targets', vint: isoWords(pnMeta.generated), ret: isoWords(pnMeta.generated), url: M.pn.items.find(i => i.id === 'pn-phase-1')?.source_url || null });
  const covFields = FIELD_ROWS(M).flatMap(([g, fs]) => fs.map(([k, l, , v]) => ({ k, l, v, c: covOf(k) })));
  el.innerHTML = `<div class="m-national">${ui.pageHead({
    title: 'Method, sources and coverage',
    sub: `<b>So what:</b> every county score is rebuilt in the browser from ${FACTORS.length} public inputs; the weakest coverage is Redfin home sales (${pctTxt(covOf('home_sales_12m'))} of counties, mostly missing in small rural ones), so rural scores lean on the other inputs and say so in the inspector.`,
    chips: `${fmt.chip(`${fmt.num(M.rows.length)} counties`, COLOR)}${fmt.chip(`table generated ${esc(isoWords(String(meta.generated || '').slice(0, 10)))}`)}${fmt.chip(`${srcRows.length} sources`)}`,
  })}
  <div class="grid grid-2">
    ${ui.panel({ title: 'Score formula', sub: 'Score = Σ (weight × percentile) ÷ Σ weights over the inputs a county has, × 100', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Input</th><th class="num">Now</th><th class="num">Default</th><th style="width:52%">Formula</th><th class="num">Coverage</th></tr></thead><tbody>${FACTORS.map(f => `<tr><td><b>${esc(f.label)}</b><div class="dim small">${esc(f.vint)}</div></td><td class="num">${S.weights[f.id] || 0}</td><td class="num">${f.w}</td><td class="wrap small">${esc(FORM[f.id])}</td><td class="num">${pctTxt(factorCov(f), 1)}</td></tr>`).join('')}</tbody></table></div><div class="small text-2 mt-8">Percentiles use average ranks for ties across all ${fmt.num(M.rows.length)} counties, so 0.5 is the median US county. Score bands on the maps are national percentiles of the score itself. Metro and phase scores are housing-weighted averages of county scores. Every score is a model output and carries an est. badge.</div>`, foot: ui.source('Analyst model over the national county table', null, 'Oct 2026') })}
    ${ui.panel({ title: 'Coverage per field', sub: 'Share of the 3,144 counties with a value', body: `<div class="m-national-cov">${covFields.map(x => `<div class="r"><span class="l">${esc(x.l)} <span class="dim">${esc(x.v)}</span></span><span class="b"><i style="width:${(x.c * 100).toFixed(1)}%;background:${x.c >= .95 ? 'var(--green)' : x.c >= .75 ? 'var(--amber)' : 'var(--red)'}"></i></span><span class="n">${pctTxt(x.c, 1)}</span></div>`).join('')}</div>`, foot: ui.source('National county table: coverage block', null, meta.generated) })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Sources and vintages', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Source</th><th>Fields</th><th>Vintage</th><th>Retrieved</th></tr></thead><tbody>${srcRows.map(s => `<tr><td class="wrap">${s.url && /^https?:/.test(s.url) ? fmt.link(s.url, s.name) : esc(s.name)}</td><td class="wrap small text-2">${esc(String(s.fields || '').split(',').map(x => x.trim()).filter(Boolean).map(k => FIELD_ROWS(M).flatMap(([, fs]) => fs).find(f => f[0] === k)?.[1] || RAW_LBL[k] || (/\*$/.test(k) ? k.replace(/_\*$/, '').replace(/_/g, ' ') + ' fields' : k.replace(/_/g, ' '))).join(', '))}</td><td class="wrap small">${esc(s.vint || '—')}</td><td class="small">${esc(s.ret || '—')}</td></tr>`).join('')}</tbody></table></div>`, foot: ui.source('Source notes carried in each dataset', null, meta.generated) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Derived measures', body: ui.kv({ [derived._turn]: `home sales (${esc(V.sales)}) ÷ housing units × 100`, [derived._trend]: `(${esc(V.p26)} units ÷ 2025 units) ÷ US ratio ${M.natPace.toFixed(3)} − 1; the US ratio removes the Jan–Aug seasonality`, [derived._dd]: 'HDD + CDD normals (base 65°F)', [derived._dens]: 'trade contractors ÷ housing units × 10,000 (CBP 2022 vs ACS 2019–23)', 'Metro roll-up': 'sums over member counties; score is housing-weighted; Authority Brands offices summed where the county has a count', 'Phase assignment': 'earliest phase wins when a county is named twice' }), foot: ui.source('Analyst definitions', null, 'Oct 2026') })}
    ${ui.panel({ title: 'Caveats', body: `<ul class="m-national-cav">${(meta.caveats || []).map(c => `<li>${esc(String(c).replace(/\bnull\b/g, 'blank').replace(/HDD\/CDD\/cdd_hdd_proxy/g, 'heating and cooling degree days and the cooling share').replace(/\bcdd_hdd_proxy\b/g, 'cooling share of degree days').replace(/\bab_onehour\b/g, 'One Hour offices').replace(/\bab_benfranklin\b/g, 'Benjamin Franklin offices').replace(/\bab_mistersparky\b/g, 'Mister Sparky offices').replace(/\bhome_sales_12m\b/g, 'home sales over 12 months').replace(/\bZCTA\b/g, 'ZIP-code area'))}</li>`).join('')}<li>Phase 2 “Central & Eastern PA” and the whole of Phase 4 are analyst mappings of the plan’s wording, not county lists from the source.</li><li>Authority Brands counts are offices with a street address, not service territories; one office can cover several counties.</li></ul>`, scroll: true, foot: ui.source('National county table caveats · analyst notes', null, meta.generated) })}
  </div></div>`;
}

export default {
  id: 'national', name: 'National expansion', tag: 'Counties', color: COLOR, group: 'Intelligence',
  tagline: 'Every US county scored for home-services expansion, with Punctual Pros phases and metro roll-ups',
  views: [
    { id: 'scorer', name: 'Scorer', icon: '◎', render: scorer },
    { id: 'phases', name: 'Phases', icon: '▦', render: phases },
    { id: 'markets', name: 'Markets', icon: '◆', render: markets },
    { id: 'method', name: 'Method', icon: '▤', render: method },
  ],
  tour: [
    { order: 940, hash: '#/national/scorer', caption: '<b>National expansion scorer.</b> All 3,144 US counties scored 0–100 on eight weighted signals: housing age, owner share, permits, home-sales velocity, income, climate, contractor density and growth. Drag a weight and the map re-ranks.', narration: 'The national scorer ranks every US county on eight public signals. Change a weight and the map and the top fifty re-rank instantly.', duration: 9000 },
    { order: 943, hash: '#/national/phases', caption: '<b>Punctual Pros phases, nationally.</b> Phase 1 core and ring, Phase 2 tuck-ins, Phase 3 Mid-Atlantic metros and Phase 4 Sun Belt and Midwest franchise markets, each with homes, home sales and permits.', narration: 'The four Punctual Pros phases sit on the same county scores, each with its homes, home sales and building permits.', duration: 8000 },
    { order: 946, hash: '#/national/markets', caption: '<b>Top 25 metros.</b> County scores rolled up to OMB metro areas, with the counties inside and the Authority Brands offices already there.', narration: 'County scores roll up to the top twenty-five metro areas, with the Authority Brands offices already in each.', duration: 7000 },
  ],
};
