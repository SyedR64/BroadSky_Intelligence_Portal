/* ═══════════════════════════════════════════════════════════════════════════
   Punctual Pros — residential HVAC · plumbing · electrical (Central PA + Jersey Shore)
   Views: overview · weather & demand · new-mover marketing · territory · market · targets · filings
   ═══════════════════════════════════════════════════════════════════════════ */
import { renderTargets, renderFilings } from '../assets/components.js?v=20260924203049';

const PP = '#f08a3c';
const HQ = { lat: 40.0629, lon: -76.37, label: 'PP HQ · East Hempfield' };
const HORVATH = { lat: 39.939, lon: -74.2021, label: 'Horvath · Beachwood NJ' };
const CORE = ['Lancaster', 'York', 'Dauphin', 'Cumberland', 'Berks', 'Lebanon', 'Franklin', 'Adams', 'Perry'];
const NJ_H = ['Ocean', 'Monmouth'];
const NJ_ALL = ['Ocean', 'Monmouth', 'Atlantic', 'Burlington'];
const JOBS_PER_TECH = 6;
const TRADES = ['HVAC', 'Plumbing', 'Electrical'];
const TRADE_RGB = { HVAC: '240,138,60', Plumbing: '76,141,255', Electrical: '245,183,61' };
const TRADE_HEX = { HVAC: '#f08a3c', Plumbing: '#4c8dff', Electrical: '#f5b73d' };
const FALLBACK_BASE = { HVAC: 10, Plumbing: 16, Electrical: 7 };
const FALLBACK_HUBS = [
  { name: 'Lancaster', lat: 40.038, lon: -76.3057, county: 'Lancaster', state: 'PA' },
  { name: 'York', lat: 39.9625, lon: -76.7277, county: 'York', state: 'PA' },
  { name: 'Harrisburg', lat: 40.2663, lon: -76.8861, county: 'Dauphin', state: 'PA' },
  { name: 'Reading', lat: 40.3353, lon: -75.9279, county: 'Berks', state: 'PA' },
  { name: 'Chambersburg', lat: 39.9375, lon: -77.6613, county: 'Franklin', state: 'PA' },
  { name: 'Toms River', lat: 39.9528, lon: -74.1967, county: 'Ocean', state: 'NJ' },
];
const STATUS = {
  territory: { label: 'PP core', color: 'var(--c-pp)', hex: '#f08a3c' },
  horvath: { label: 'Horvath NJ', color: 'var(--amber)', hex: '#f5b73d' },
  adjacent: { label: 'Adjacent ring', color: 'var(--accent)', hex: '#8ab4ff' },
  outer: { label: 'Outer', color: 'var(--dim)', hex: '#5b6b7f' },
};
const TIER_HEX = { 'Tier I': '#2ecc8f', 'Tier II': '#4c8dff', 'Tier III': '#5b6b7f' };
const SEV = { Extreme: 'var(--red)', Severe: 'var(--brand-2)', Moderate: 'var(--amber)', Minor: 'var(--accent)' };
const SRC = {
  acs: 'https://data.census.gov/', nws: 'https://api.weather.gov', meteo: 'https://open-meteo.com/', ncei: 'https://www.ncei.noaa.gov/access/storm-events-database/',
};

/* ── helpers ──────────────────────────────────────────────────────────── */
const cty = s => String(s || '').replace(/\s+County$/i, '').trim();
const num = v => (v == null || v === '' || isNaN(v)) ? NaN : Number(v);
const fin = v => Number.isFinite(v);
const sum = (a, f = x => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const avg = (a, f = x => x) => { const v = a.map(f).filter(fin); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const median = a => { const v = a.filter(fin).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const mid = r => Array.isArray(r) ? (Number(r[0]) + Number(r[1] ?? r[0])) / 2 : Number(r);
const noon = s => String(s || '').slice(0, 10) + 'T12:00:00';
/* normalize sale dates: ISO 'YYYY-MM-DD…' or US 'MM-DD-YYYY' / 'MM/DD/YYYY' (legacy 90-day layer, Chester) → 'YYYY-MM-DD' */
const isoDay = s => { const t = String(s || '').trim(); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10); const m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const dayMs = 864e5;
const daysSince = s => { const t = Date.parse(noon(s)); return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / dayMs)); };
const dlab = s => new Date(noon(s)).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
const dfull = (fmt, s) => !s ? '—' : /^\d{4}-\d{2}$/.test(String(s)) ? new Date(s + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : /^\d{4}-\d{2}-\d{2}/.test(String(s)) ? fmt.date(noon(s)) : String(s);
const miles = (a, b, c, d) => { const R = 3958.8, t = x => x * Math.PI / 180; const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const pctTxt = v => v == null || !fin(v) ? '—' : `${Math.round(v * 100)}%`;
const tierChip = (esc, t) => { const n = { 'Tier I': 1, 'Tier II': 2, 'Tier III': 3 }[t] || 4; return t ? `<span class="chip t${n}"><i class="cdot"></i>${esc(t)}</span>` : '—'; };
const statusChip = (fmt, s) => fmt.chip(STATUS[s]?.label || s, STATUS[s]?.color);
const basisConf = b => { const s = String(b || '').toLowerCase(); return s.startsWith('sourced') ? ['high', 'var(--green)'] : s.startsWith('derived') ? ['medium', 'var(--amber)'] : ['low · assumption', 'var(--dim)']; };
const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== '') return o[k]; return null; };

function css() {
  if (!document.getElementById('css-pp')) { const l = document.createElement('link'); l.id = 'css-pp'; l.rel = 'stylesheet'; l.href = 'modules/pp.css?v=20260924203049'; document.head.appendChild(l); }
}

/* ── shared data ──────────────────────────────────────────────────────── */
let ZP = null;
async function loadZips(data) {
  if (ZP) return ZP;
  const rows = await data.load('pp_zips');
  const zips = rows.map(z => {
    const c = cty(z.county);
    const status = z.service_territory_flag === 1 ? 'territory' : (z.state === 'NJ' && NJ_H.includes(c)) ? 'horvath' : z.adjacent_to_service_territory === 1 ? 'adjacent' : 'outer';
    return { ...z, zip: String(z.zip).padStart(5, '0'), _county: c, _status: status, _served: status === 'territory' || status === 'horvath' };
  });
  const byZip = new Map(zips.map(z => [z.zip, z]));
  const g = new Map();
  for (const z of zips) { if (!fin(z.lat) || !fin(z.lon)) continue; const k = `${Math.floor(z.lat * 10)}:${Math.floor(z.lon * 10)}`; if (!g.has(k)) g.set(k, []); g.get(k).push(z); }
  const nearest = (lat, lon) => {
    if (!fin(lat) || !fin(lon)) return null;
    const a = Math.floor(lat * 10), b = Math.floor(lon * 10); let best = null, bd = Infinity;
    for (let r = 1; r <= 4 && !best; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const L = g.get(`${a + i}:${b + j}`); if (L) for (const z of L) { const d = (z.lat - lat) ** 2 + ((z.lon - lon) * 0.77) ** 2; if (d < bd) { bd = d; best = z; } } }
    return best;
  };
  ZP = { zips, byZip, nearest };
  return ZP;
}
const servedHU = (Z, county, state) => sum(Z.zips.filter(z => z._county === county && z.state === state && z._served), z => z.housing_units);

function countyRollup(Z) {
  const m = new Map();
  for (const z of Z.zips) {
    if (!z._served) continue;
    const k = `${z._county}|${z.state}`;
    if (!m.has(k)) m.set(k, { county: z._county, state: z.state, footprint: z._status === 'horvath' ? 'Horvath NJ' : 'PP core', rows: [] });
    m.get(k).rows.push(z);
  }
  return [...m.values()].map(c => ({
    ...c, zips: c.rows.length, hu: sum(c.rows, z => z.housing_units), owner_occ: avg(c.rows, z => z.owner_occupancy_rate), old_share: avg(c.rows, z => z.old_housing_share),
    priority: avg(c.rows, z => z.practical_priority_score), tier1: c.rows.filter(z => z.practical_priority_tier === 'Tier I').length, moves: sum(c.rows, z => z.recent_owner_moves), sales90: sum(c.rows, z => z.meaningful_sale_count_90d),
  })).sort((a, b) => b.hu - a.hu);
}

/* NWS alert → territory county matcher (UGC zone/county codes + SAME FIPS, fallback areaDesc names) */
function territoryMatcher(model) {
  const zones = (model?.items || []).filter(i => i.component === 'nws_zone');
  const ugc = new Map(), fips = new Map();
  for (const z of zones) { for (const u of z.all_ugcs || []) ugc.set(u, z); if (z.county_fips) fips.set('0' + z.county_fips, z); }
  const names = zones.length ? zones : [...CORE.map(c => ({ county: c, state: 'PA', pp_territory_tier: 'core' })), ...NJ_H.map(c => ({ county: c, state: 'NJ', pp_territory_tier: 'horvath_nj' }))];
  return a => {
    const hit = new Map();
    for (const u of a.zones || []) if (ugc.has(u)) hit.set(ugc.get(u).county, ugc.get(u));
    for (const f of a.fips || []) if (fips.has(f)) hit.set(fips.get(f).county, fips.get(f));
    if (!hit.size && (!zones.length || !(a.zones || []).length)) { const ad = String(a.areaDesc || '').toLowerCase(); for (const z of names) if (z.state === a.state && new RegExp(`\\b${z.county.toLowerCase()}\\b`).test(ad)) hit.set(z.county, z); }
    return [...hit.values()];
  };
}
function playbookFor(pbs, event) {
  const e = String(event || '').toLowerCase().trim();
  return pbs.find(p => String(p.nws_event || '').toLowerCase() === e) || pbs.find(p => (p.aliases_and_related || []).some(a => a.replace(/\s*\(.*\)\s*/g, '').toLowerCase().trim() === e)) || null;
}
async function territoryAlerts(live, model) {
  const match = territoryMatcher(model);
  const pbs = (model?.items || []).filter(i => i.component === 'event_playbook');
  const [pa, nj] = await Promise.all([live.nwsAlerts('PA').catch(() => null), live.nwsAlerts('NJ').catch(() => null)]);
  const seen = new Set(), out = [];
  for (const a of [...(pa || []), ...(nj || [])]) {
    if (seen.has(a.id)) continue; seen.add(a.id);
    const counties = match(a); if (!counties.length) continue;
    out.push({ ...a, counties, pb: playbookFor(pbs, a.event) });
  }
  const rank = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };
  out.sort((x, y) => (rank[x.severity] ?? 4) - (rank[y.severity] ?? 4));
  return { alerts: out, ok: !!(pa || nj), failed: !pa && !nj };
}

/* ── demand model parameters ──────────────────────────────────────────── */
function modelParams(model) {
  const it = model?.items || [];
  const byId = Object.fromEntries(it.map(i => [i.id, i]));
  const base = {}; for (const t of TRADES) { const b = it.find(i => i.component === 'baseline' && i.trade === t); base[t] = fin(num(b?.value_point)) ? Number(b.value_point) : FALLBACK_BASE[t]; }
  const pw = (id, k, fb) => { const p = byId[id]?.piecewise?.[k]?.multiplier; const v = p ? mid(p) : NaN; return fin(v) ? v : fb; };
  const lo = (id, k, fb) => { const p = byId[id]?.piecewise?.[k]?.multiplier; return Array.isArray(p) && fin(Number(p[0])) ? Number(p[0]) : fb; };
  const pbs = it.filter(i => i.component === 'event_playbook');
  const ws = playbookFor(pbs, 'Winter Storm Warning')?.expected_call_volume_multiplier || { HVAC: [1.2, 1.6], Plumbing: [1.1, 1.5], Electrical: [1.2, 1.8] };
  const M = {
    c85: pw('mult_hvac_cooling_tmax', 1, 1.10), c90: pw('mult_hvac_cooling_tmax', 2, 1.175), cWave: pw('mult_hvac_cooling_tmax', 3, 1.225), c95: pw('mult_hvac_cooling_tmax', 4, 1.45),
    h25: pw('mult_hvac_heating_tmin', 1, 1.10), h20: pw('mult_hvac_heating_tmin', 2, 1.35), h10: pw('mult_hvac_heating_tmin', 3, 1.75), h0: pw('mult_hvac_heating_tmin', 4, 2.5), hSnap: pw('mult_hvac_heating_tmin', 5, 1.45),
    f1: pw('mult_plumbing_hard_freeze', 0, 1.125), f2: pw('mult_plumbing_hard_freeze', 1, 2.0), f3: pw('mult_plumbing_hard_freeze', 2, 2.75), thaw: pw('mult_plumbing_hard_freeze', 3, 2.5),
    r1: pw('mult_plumbing_heavy_rain', 0, 1.2), r15: pw('mult_plumbing_heavy_rain', 1, 1.65),
    w40: pw('mult_electrical_wind', 1, 1.25), w58: pw('mult_electrical_wind', 2, 2.0),
    ts: lo('mult_electrical_lightning', 0, 1.2),
    snowHeavy: Object.fromEntries(TRADES.map(t => [t, mid(ws[t] || [1, 1])])), snowLight: Object.fromEntries(TRADES.map(t => [t, Number((ws[t] || [1])[0])])),
  };
  return { base, M, pbs, fromModel: !!it.length };
}
/* model rule: max driver + 0.5 × each additional independent driver; correlated drivers (same hazard family, e.g. gust + wind alert) collapse to their max */
const combine = arr => { if (!arr.length) return 1; const fam = new Map(); for (const x of arr) { const k = x.f || x.l; if (!fam.has(k) || fam.get(k) < x.m) fam.set(k, x.m); } const ms = [...fam.values()].sort((a, b) => b - a); return ms[0] + 0.5 * sum(ms.slice(1), m => m - 1); };
const alertFam = e => /Heat/i.test(e) ? 'heat' : /Cold|Chill/i.test(e) ? 'cold' : /Freeze|Frost/i.test(e) ? 'freeze' : /Winter|Ice|Snow|Blizzard/i.test(e) ? 'snow' : /Thunder|Tornado/i.test(e) ? 'thunder' : /Flood|Rain/i.test(e) ? 'rain' : /Tropical|Hurricane|Surge/i.test(e) ? 'tropical' : /Wind/i.test(e) ? 'wind' : e;

function dayDrivers(days, i, M, hubAlerts) {
  const d = days[i]; const out = { HVAC: [], Plumbing: [], Electrical: [] };
  const add = (t, m, l, f) => { if (fin(m) && m > 1.0001) out[t].push({ m, l, f }); };
  const tx = j => days[j] ? num(days[j].tmax) : NaN, tn = j => days[j] ? num(days[j].tmin) : NaN;
  const tmax = tx(i), tmin = tn(i), pr = num(d.precip), gust = num(d.gust), snow = num(d.snow), code = num(d.code);
  const f0 = v => fin(v) ? Math.round(v) : '—';
  // HVAC cooling
  const hot = j => tx(j) >= 90 && tn(j) >= 70;
  if (tmax >= 95) add('HVAC', M.c95, `TMAX ${f0(tmax)}°F ≥ 95 (extreme-heat tier)`, 'heat');
  else if (tmax >= 90) { const wave = hot(i) && (hot(i - 1) || hot(i + 1)); add('HVAC', wave ? Math.max(M.cWave, M.c90) : M.c90, wave ? `heat wave: ≥2 days ≥90°F with ≥70°F nights` : `TMAX ${f0(tmax)}°F (90–94)`, 'heat'); }
  else if (tmax >= 85) add('HVAC', M.c85, `TMAX ${f0(tmax)}°F (85–89)`, 'heat');
  // HVAC heating
  if (tmin <= 0) add('HVAC', M.h0, `TMIN ${f0(tmin)}°F ≤ 0`, 'cold');
  else if (tmin <= 10) add('HVAC', M.h10, `TMIN ${f0(tmin)}°F (0–10)`, 'cold');
  else if (tmin <= 20) add('HVAC', M.h20, `TMIN ${f0(tmin)}°F (10–20)`, 'cold');
  else if (tmin <= 25) add('HVAC', M.h25, `TMIN ${f0(tmin)}°F (20–25)`, 'cold');
  const meanCold = j => (tx(j) + tn(j)) / 2 <= 40;
  if (String(d.date).slice(5) >= '10-01' && meanCold(i) && ![...Array(i).keys()].some(meanCold)) add('HVAC', M.hSnap, 'first cold snap in window (mean ≤40°F after Oct 1) — no-heat start-ups', 'cold');
  // Plumbing freeze / thaw
  const fz = j => tn(j) <= 20, fz10 = j => tn(j) <= 10, hard = j => fz(j) && (fz(j - 1) || fz(j + 1));
  if (fz(i)) { const consec = hard(i); const severe = (consec && fz10(i) && (fz10(i - 1) || fz10(i + 1))) || tmax < 32; add('Plumbing', severe ? M.f3 : consec ? M.f2 : M.f1, severe ? 'deep freeze (≥2 days ≤10°F or TMAX <32°F)' : consec ? 'hard freeze: ≥2 days TMIN ≤20°F' : `single night TMIN ${f0(tmin)}°F ≤ 20`, 'freeze'); }
  else if (tmax > 40 && [1, 2, 3].some(k => hard(i - k))) add('Plumbing', M.thaw, 'thaw after hard freeze — bursts surface', 'freeze');
  // Plumbing rain
  if (pr >= 1.5) add('Plumbing', M.r15, `rain ${pr.toFixed(2)} in ≥ 1.5 (sump/backup tier)`, 'rain');
  else if (pr >= 1.0) add('Plumbing', M.r1, `rain ${pr.toFixed(2)} in ≥ 1.0`, 'rain');
  // Electrical wind / thunder
  if (gust >= 58) add('Electrical', M.w58, `gust ${f0(gust)} mph ≥ 58 (High Wind criteria)`, 'wind');
  else if (gust >= 40) add('Electrical', M.w40, `gust ${f0(gust)} mph (40–57)`, 'wind');
  if (code >= 95) add('Electrical', M.ts, 'thunderstorm forecast (SVR lower bound)', 'thunder');
  // Snow → winter-storm playbook
  if (snow >= 4) TRADES.forEach(t => add(t, M.snowHeavy[t], `snow ${snow.toFixed(1)} in (winter-storm tier)`, 'snow'));
  else if (snow >= 1) TRADES.forEach(t => add(t, M.snowLight[t], `snow ${snow.toFixed(1)} in (light)`, 'snow'));
  // Live NWS alerts with a playbook entry
  for (const a of hubAlerts) {
    if (!a.pb) continue; const on = String(a.onset || a.sent || '').slice(0, 10), en = String(a.ends || a.onset || '').slice(0, 10);
    const soft = /Watch|Advisory|Statement/i.test(a.event);
    if (on && d.date >= on && d.date <= (en || on)) TRADES.forEach(t => { const m0 = mid(a.pb.expected_call_volume_multiplier?.[t] || [1, 1]); add(t, soft ? 1 + 0.5 * (m0 - 1) : m0, `NWS ${a.event} (playbook midpoint${soft ? ', ½ effect for watch/advisory' : ''})`, alertFam(a.pb.nws_event || a.event)); });
  }
  return out;
}

function hubList(model, Z) {
  const it = model?.items || []; const zones = it.filter(i => i.component === 'nws_zone');
  let hubs = it.filter(i => i.component === 'weather_hub').map(h => {
    const z = zones.find(z => (z.all_ugcs || []).includes(h.county_ugc));
    return { id: h.id, name: h.name, lat: h.lat, lon: h.lon, county: z?.county || '', state: z?.state || '', tier: z?.pp_territory_tier || '', station: h.climatology_station_name, proxy: h.climatology_proxy, src: h.source_url, grid: h.nws_grid };
  }).filter(h => fin(h.lat) && fin(h.lon));
  if (!hubs.length) hubs = FALLBACK_HUBS.map(h => ({ ...h, id: 'hub_' + h.name.toLowerCase().replace(/\W+/g, '_'), tier: NJ_H.includes(h.county) ? 'horvath_nj' : 'core', src: SRC.meteo }));
  for (const h of hubs) { h.hu = servedHU(Z, h.county, h.state) + (h.county === 'Dauphin' ? servedHU(Z, 'Perry', 'PA') : 0); h.note = h.county === 'Dauphin' ? 'incl. Perry Co.' : ''; }
  return hubs;
}

/* stacked bar SVG (days × trades) with dashed baseline */
function stackBars(labels, series, { h = 210, baseline, fmtv = v => Math.round(v) } = {}) {
  const w = 600, padL = 40, padB = 24, padT = 12, n = labels.length;
  const totals = labels.map((_, i) => sum(series, s => s.values[i]));
  const max = Math.max(1, baseline || 0, ...totals) * 1.12; const bw = (w - padL - 8) / Math.max(1, n); const y = v => h - padB - (v / max) * (h - padB - padT);
  let out = [0, .5, 1].map(t => `<g class="tick"><line x1="${padL}" x2="${w - 4}" y1="${y(max * t)}" y2="${y(max * t)}"/><text x="${padL - 4}" y="${y(max * t) + 3}" text-anchor="end">${fmtv(max * t)}</text></g>`).join('');
  labels.forEach((l, i) => {
    let acc = 0; const x = padL + i * bw + bw * .16, bwi = bw * .68;
    series.forEach(s => { const v = s.values[i] || 0; out += `<rect x="${x}" y="${y(acc + v)}" width="${bwi}" height="${Math.max(0, y(acc) - y(acc + v))}" fill="${s.color}" rx="1.5"><title>${s.name} · ${l}: ${fmtv(v)}</title></rect>`; acc += v; });
    out += `<text x="${x + bwi / 2}" y="${y(acc) - 4}" text-anchor="middle" style="fill:var(--text-2);font-family:var(--mono)">${fmtv(acc)}</text><text x="${x + bwi / 2}" y="${h - 8}" text-anchor="middle">${l}</text>`;
  });
  if (baseline) out += `<line x1="${padL}" x2="${w - 4}" y1="${y(baseline)}" y2="${y(baseline)}" stroke="var(--text-2)" stroke-dasharray="4 3" stroke-width="1"/>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${h}px">${out}</svg>`;
}

/* ═══ 1. OVERVIEW ═════════════════════════════════════════════════════════ */
async function overview(ctx) {
  const { el, ui, fmt, data, maps, live, esc, app, inspector } = ctx; css();
  const [Z, meta, sales90, ma, storms, model] = await Promise.all([
    loadZips(data), data.load('pp_meta').catch(() => null), data.load('pp_sales_90d').catch(() => []), data.research('ma_targets_pp'), data.research('pp_storm_events'), data.research('pp_demand_model'),
  ]);
  const terr = Z.zips.filter(z => z._status === 'territory'), horv = Z.zips.filter(z => z._status === 'horvath'), adj = Z.zips.filter(z => z._status === 'adjacent');
  const adjT1 = adj.filter(z => z.practical_priority_tier === 'Tier I');
  const huTerr = sum(terr, z => z.housing_units), huH = sum(horv, z => z.housing_units), huAdjT1 = sum(adjT1, z => z.housing_units);
  const servedCounties = new Set([...CORE, ...NJ_H]);
  const s90 = (sales90 || []).filter(s => num(s.price) >= 10000 && servedCounties.has(cty(s.county)));
  const win = meta?.sales_layer; const winTxt = win ? `${dfull(fmt, win.window_start)} – ${dfull(fmt, win.window_end)}` : 'Jan–Apr 2026';
  const targets = ma?.items || []; const top = (ma?.meta?.ranked_top_10 || [])[0];
  const pbs = (model?.items || []).filter(i => i.component === 'event_playbook');
  const epsYr = sum(pbs, p => p.local_history?.avg_episodes_per_year);
  const peCount = (ma?.meta?.pe_backed_competitors || []).filter(p => !/^Other|franchisor/i.test(p.platform || '')).length;
  const counties = countyRollup(Z);
  const ctot = storms?.meta?.county_totals_2019_2025 || {};
  counties.forEach(c => { c.storms = ctot[`${c.county}, ${c.state}`]?.events_2019_2025 ?? null; });
  const topCounty = counties[0];
  const missing = [['ma_targets_pp', ma], ['pp_demand_model', model], ['pp_storm_events', storms]].filter(x => !x[1]).map(x => x[0]);

  const kpis = alerts => ui.kpis([
    { label: 'Core territory zips', value: fmt.num(terr.length), sub: `9 PA counties · +${horv.length} Horvath NJ zips`, color: 'var(--c-pp)' },
    { label: 'Housing units served', value: fmt.compact(huTerr + huH), sub: `${fmt.compact(huTerr)} PA core · ${fmt.compact(huH)} Ocean/Monmouth`, color: 'var(--c-pp)' },
    { label: 'Home sales (90-day layer)', value: fmt.num(s90.length), sub: `≥$10K deeds · served counties · ${esc(winTxt)}`, color: 'var(--green)' },
    { label: 'Live NWS alerts in territory', value: alerts == null ? '…' : fmt.num(alerts.alerts.length), sub: alerts == null ? 'querying api.weather.gov' : alerts.failed ? 'feed unavailable' : `${alerts.alerts.filter(a => /Extreme|Severe/.test(a.severity)).length} severe/extreme · PA + NJ`, color: alerts?.alerts?.some(a => /Extreme|Severe/.test(a.severity)) ? 'var(--red)' : 'var(--amber)' },
    { label: 'Tier-I expansion zips (adjacent)', value: fmt.num(adjT1.length), sub: `${fmt.compact(huAdjT1)} housing units next door`, color: 'var(--green)' },
    { label: 'Add-on targets screened', value: ma ? fmt.num(targets.length) : '—', sub: top ? `#1 ${esc(String(top.company).split(/[,(]/)[0].trim())} · fit ${top.fit_score}` : 'ma_targets_pp', color: 'var(--c-ma)' },
  ]);

  const levers = [
    { n: fmt.num(s90.length), u: 'movers / 90d', t: 'New-mover marketing', d: `Every closed sale is a home that needs a tune-up, inspection or plan. Score and mail each served-county buyer within 30 days of closing; 12-month county deed files loaded in the New-mover view.`, h: '#/pp/movers' },
    { n: model ? fmt.num(Math.round(epsYr)) : '—', u: 'alert episodes / yr', t: 'Weather-driven capacity', d: `${model ? `Territory averages ~${Math.round(epsYr)} NWS warning episodes a year (Storm Events 2019–25).` : 'Episode frequency pending pp_demand_model.'} Convert maintenance slots to repair capacity when the pressure index clears 120 and pre-stage parts.`, h: '#/pp/weather' },
    { n: fmt.num(adjT1.length), u: 'Tier-I zips', t: 'Contiguous expansion', d: `${fmt.compact(huAdjT1)} housing units in adjacent Tier-I zips (Schuylkill, Chester, Montgomery, northern MD) can be served from existing hubs with route density.`, h: '#/pp/territory' },
    { n: top ? String(top.fit_score) : '—', u: 'top fit score', t: 'Tuck-in M&A', d: top ? `${esc(top.company)} leads a ${targets.length}-company screen; Authority Brands franchisees in West Chester, Wilmington and South Jersey are same-playbook tuck-ins.` : 'Target screen pending.', h: '#/pp/targets' },
    { n: ma ? fmt.num(peCount) : '—', u: 'PE platforms', t: 'Competitive defense', d: `Sila (ECS Comfort, Palmyra) and HomeX (Haller, Lititz) are consolidating inside the core; protect membership base and technician bench.`, h: '#/pp/market' },
  ];

  el.innerHTML = `<div class="m-pp">${ui.pageHead({
    title: 'Punctual Pros — operating picture',
    sub: `<b>So what:</b> PP serves ~${fmt.compact(huTerr + huH)} housing units across ${terr.length} Central PA zips and the Horvath Jersey Shore footprint; the fastest levers are new-mover capture (${fmt.num(s90.length)} served-county sales in the 90-day layer alone), weather-driven surge staffing, and ${adjT1.length} Tier-I zips directly adjacent to today’s routes.`,
    chips: `${fmt.chip('One Hour · Benjamin Franklin · Mister Sparky', 'var(--c-pp)')}${fmt.chip('Horvath Home Services (Dec 2024)', 'var(--amber)')}${fmt.chip('HQ East Hempfield, Lancaster Co.')}`,
    actions: `<a class="btn" href="#/pp/weather">Weather & demand</a><a class="btn" href="#/pp/movers">New movers</a>`,
  })}
  ${missing.length ? ui.note(`Research dataset not yet available: <b>${esc(missing.join(', '))}</b> — dependent KPIs, levers and storm columns show “—”.`, 'warn') : ''}
  <div id="pp-ov-kpis">${kpis(null)}</div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Service territory', sub: 'Core zips (orange), Horvath NJ (amber), adjacent expansion ring (blue) · click a zip for detail', body: `<div class="map tall" id="pp-ov-map"></div>`, flush: true, foot: ui.source('pp_zips v6 (ACS 5-yr, analyst scoring)', SRC.acs, meta?.sales_layer?.window_end || '2026') })}
    ${ui.panel({ title: 'Value-creation levers', sub: 'Ranked by speed to EBITDA · click to open the working view', body: `<div>${levers.map(l => `<a class="pp-lever" href="${l.h}"><div class="n">${l.n}<small>${esc(l.u)}</small></div><div class="b"><b>${esc(l.t)}</b><div class="small text-2">${l.d}</div></div><span class="go">open →</span></a>`).join('')}</div>`, foot: ui.source('pp_zips · pp_sales_90d · pp_demand_model · ma_targets_pp', null, '2026-09-24') })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'County rollup — served footprint', sub: `Housing mass, priority and storm exposure by county · ${esc(topCounty ? `${topCounty.county} is the largest book (${fmt.compact(topCounty.hu)} units)` : '')} · click a row to open its zips`, body: `<div id="pp-ov-cty"></div>`, foot: ui.source('pp_zips (ACS 5-yr) · NOAA Storm Events 2019–2025', SRC.ncei, '2026-09') })}</div>
  </div>`;

  // map
  const map = maps.create(el.querySelector('#pp-ov-map'), { center: [40.1, -76.1], zoom: 7 });
  const zpop = z => `<b>${esc(z.zip)} · ${esc(z.city)}</b><br>${esc(z.county)}, ${esc(z.state)}<br>${esc(STATUS[z._status].label)} · ${esc(z.practical_priority_tier)} (${Math.round(z.practical_priority_score)})<br><span class="muted">${fmt.num(z.housing_units)} housing units</span>`;
  maps.points(map, adj, { color: '#8ab4ff', radius: 3.5, cluster: false, opacity: .28, weight: 0, popup: zpop, onClick: z => openZip(ctx, z) });
  maps.points(map, horv, { color: STATUS.horvath.hex, radius: 4.5, cluster: false, opacity: .8, popup: zpop, onClick: z => openZip(ctx, z) });
  maps.points(map, terr, { color: PP, radius: 4.5, cluster: false, opacity: .85, popup: zpop, onClick: z => openZip(ctx, z) });
  maps.marker(map, HQ.lat, HQ.lon, { color: '#ffffff', label: HQ.label, popup: '<b>Punctual Pros HQ</b><br>Running Pump Rd, East Hempfield Twp (Lancaster Co.)' });
  maps.marker(map, HORVATH.lat, HORVATH.lon, { color: '#f5b73d', label: HORVATH.label, popup: '<b>Horvath Home Services</b><br>Beachwood / Toms River NJ (acq. Dec 2024) · city centroid' });
  maps.legend(map, [{ color: PP, label: `PP core zips (${terr.length})` }, { color: STATUS.horvath.hex, label: `Horvath NJ zips (${horv.length})` }, { color: '#8ab4ff', label: `Adjacent ring (${adj.length})` }], 'Footprint');
  maps.fitPoints(map, [...terr, ...horv].map(z => [z.lat, z.lon]), 8);

  // county table
  ui.table(el.querySelector('#pp-ov-cty'), {
    columns: [
      { key: 'county', label: 'County', fmt: (v, r) => `<b>${esc(v)}</b> <span class="dim">${esc(r.state)}</span>` },
      { key: 'footprint', label: 'Footprint', fmt: v => fmt.chip(v, v === 'PP core' ? 'var(--c-pp)' : 'var(--amber)') },
      { key: 'zips', label: 'Zips', num: true },
      { key: 'hu', label: 'Housing units', num: true, fmt: v => fmt.num(v) },
      { key: 'owner_occ', label: 'Owner-occ.', num: true, fmt: v => pctTxt(v) },
      { key: 'old_share', label: 'Older stock', num: true, fmt: v => pctTxt(v) },
      { key: 'priority', label: 'Avg priority', num: true, fmt: v => fmt.score(v) },
      { key: 'tier1', label: 'Tier-I zips', num: true },
      { key: 'moves', label: 'Owner moves (ACS)', num: true, fmt: v => fmt.num(v) },
      { key: 'storms', label: 'Storm events 19–25', num: true, fmt: v => v == null ? '—' : fmt.num(v) },
    ], rows: counties, pageSize: 20, sortKey: 'hu', exportName: 'pp_county_rollup', rowKey: r => r.county + r.state,
    onRow: r => app.go('pp', 'territory', { county: r.county }),
  });

  app.index([
    ...counties.map(c => ({ label: `${c.county} County, ${c.state}`, sub: `Punctual Pros · ${fmt.num(c.zips)} zips · ${fmt.compact(c.hu)} units`, href: `#/pp/territory?county=${encodeURIComponent(c.county)}`, kind: 'County', color: PP })),
    ...terr.slice().sort((a, b) => b.housing_units - a.housing_units).slice(0, 250).map(z => ({ label: `${z.zip} ${z.city}`, sub: `PP core zip · ${z.county}`, href: `#/pp/territory?zip=${z.zip}`, kind: 'Zip', color: PP })),
  ]);

  // live alerts (non-blocking)
  const root = el.querySelector('.m-pp');
  territoryAlerts(live, model).then(r => { if (root.isConnected) root.querySelector('#pp-ov-kpis').innerHTML = kpis(r); }).catch(() => { });
  return () => map.remove();
}

/* zip inspector (overview + territory) */
function openZip(ctx, z) {
  const { inspector, fmt, esc, ui } = ctx;
  const next = z._served ? `In footprint: run the new-mover mailer for ${z.zip} and check membership penetration vs. ${fmt.num(z.housing_units)} housing units.`
    : z.practical_priority_tier === 'Tier I' ? `Expansion candidate (“${esc(z.practical_priority_label)}”): add ${z.zip} to the next route-density test — 90-day mailer to recent movers, then measure booked calls per 1,000 units.`
      : z.practical_priority_tier === 'Tier II' ? 'Build: include in marketing radius only when an adjacent Tier-I zip is activated.' : 'Monitor: no near-term action.';
  inspector.open({
    title: `${esc(z.zip)} · ${esc(z.city)}`, sub: `${esc(z.county)}, ${esc(z.state)} · ${esc(STATUS[z._status].label)}`, color: STATUS[z._status].color,
    sections: [
      { label: 'Priority', html: `<div class="row gap-12 wrap">${tierChip(esc, z.practical_priority_tier)}${fmt.chip(z.practical_priority_label || '', 'var(--c-pp)')}${fmt.chip(`data ${z.data_confidence}`, z.data_confidence === 'High' ? 'var(--green)' : z.data_confidence === 'Medium' ? 'var(--amber)' : 'var(--red)')}</div><div class="mt-8">${ctx.charts.hbar([{ label: 'Practical priority', value: z.practical_priority_score }, { label: 'Opportunity v3', value: z.opportunity_score_v3 }, { label: 'Executive rank', value: z.executive_rank_score }, { label: 'Cluster score', value: z.cluster_score }, { label: 'Blended (w/ sales)', value: z.blended_expansion_priority_score }], { max: 100, fmt: v => fmt.num(v, 0), labelW: 120, color: PP })}</div>` },
      { label: 'Housing', html: ui.kv({ 'Housing units': fmt.num(z.housing_units), 'Owner-occupied': pctTxt(z.owner_occupancy_rate), 'Older stock share': pctTxt(z.old_housing_share), 'Density / sq mi': fmt.num(z.housing_density_per_sqmi), 'Owner base (ACS)': fmt.num(z.owner_base_size), 'Recent owner moves': fmt.num(z.recent_owner_moves), 'Tier-I peers ≤20 km': fmt.num(z.nearby_tier1_count), '90-day deeds (homeowner/builder)': `${fmt.num(z.homeowner_sale_count_90d)} / ${fmt.num(z.builder_sale_count_90d)}` }) },
      { label: 'Why this score', html: `<div class="small text-2">${esc(z.v3_reason || '—')}</div>` },
      { label: 'Sales layer', html: `<div class="small text-2">${esc(z.sales_layer_reason || '—')}</div>` },
      { label: 'Tailwind', html: `<div class="small" style="color:var(--green)">${esc(z.expansion_tailwind || '—')}</div>` },
      { label: 'Headwind', html: `<div class="small" style="color:var(--amber)">${esc(z.expansion_headwind || '—')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${next}</div>` },
      { label: 'Sources', html: `<div class="small col gap-4">${fmt.link(SRC.acs, 'US Census ACS 5-yr (B25038 owner tenure, housing age)')}<span class="dim">pp_zips v6 · analyst scoring (weights in pp_meta)</span></div>` },
    ],
    actions: [{ id: 'mv', label: 'New movers in county', onClick: () => ctx.app.go('pp', 'movers', { county: z._county }) }, { id: 'tr', label: 'Open in territory', onClick: () => ctx.app.go('pp', 'territory', { zip: z.zip }) }],
  });
}

/* ═══ 2. WEATHER & DEMAND ═════════════════════════════════════════════════ */
async function weather(ctx) {
  const { el, ui, fmt, data, live, charts, inspector, esc } = ctx; css();
  const [model, storms, Z] = await Promise.all([data.research('pp_demand_model'), data.research('pp_storm_events'), loadZips(data)]);
  const P = modelParams(model);
  const hubs = hubList(model, Z);
  const state = { trade: 'HVAC', share: 0.10 };
  const mMeta = model?.meta || {};
  const modelSrc = ui.source('pp_demand_model (AHS, ServiceTitan, NWS, NCEI GHCN-Daily)', 'https://www.servicetitan.com/blog/hvac-revenue-heat-waves', mMeta.generated);

  el.innerHTML = `<div class="m-pp">${ui.pageHead({
    title: 'Weather & demand',
    sub: `<span id="wx-sowhat">Loading live NWS alerts and 7-day forecasts for ${hubs.length} weather hubs…</span>`,
    chips: `${fmt.chip(`${hubs.length} weather hubs`, 'var(--c-pp)')}${fmt.chip('NWS alerts · live', 'var(--red)')}${fmt.chip('Open-Meteo 7-day · live', 'var(--accent)')}${fmt.chip(`${JOBS_PER_TECH} jobs / tech-day (assumption)`, 'var(--dim)')}`,
  })}
  ${model ? '' : ui.note('Demand model dataset <b>pp_demand_model</b> is not available — using fallback hubs (Lancaster, York, Harrisburg, Reading, Chambersburg, Toms River) and default baselines (HVAC 10 · Plumbing 16 · Electrical 7 calls/day per 10k households).', 'warn')}
  <div id="wx-kpis">${ui.kpis([{ label: 'Territory alerts (live)', value: '…' }, { label: 'Peak HVAC pressure', value: '…' }, { label: 'Peak plumbing pressure', value: '…' }, { label: 'Peak electrical pressure', value: '…' }, { label: 'Peak-day PP calls (est.)', value: '…' }, { label: 'Surge techs, peak day', value: '…' }])}</div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Service-Call Pressure Index · hubs × days', sub: '100 = baseline day for the trade · first 2 columns observed, then 7-day forecast · click a cell for drivers', actions: '<div id="wx-trade"></div>', body: `<div id="wx-heat">${ui.loading(`Fetching Open-Meteo forecasts for ${hubs.length} hubs…`)}</div><div class="pp-legend" id="wx-heat-leg"></div>`, foot: `${ui.source('Open-Meteo forecast API', SRC.meteo, 'live')} ${modelSrc}` })}
    ${ui.panel({ title: 'Live NWS alerts touching the territory', sub: 'PA + NJ feeds filtered to 15 territory counties by UGC zone/county code and FIPS', body: `<div id="wx-alerts">${ui.loading('Querying api.weather.gov…')}</div>`, scroll: true, foot: ui.source('National Weather Service alerts API', 'https://api.weather.gov/alerts/active?area=PA', 'live') })}
  </div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Staffing implication · expected PP calls by trade', sub: 'Market calls × PP share (assumption) → techs = ⌈calls ÷ 6 jobs per tech-day⌉', actions: '<div id="wx-share"></div>', body: `<div id="wx-staff">${ui.loading()}</div>`, foot: `${modelSrc}<span class="dim">Households = housing units of served zips (ACS), Perry rolled into Harrisburg hub</span>` })}
    ${ui.panel({ title: 'Hub conditions · next 7 days', sub: 'Extremes driving the index · served housing units per hub', body: `<div id="wx-hubs">${ui.loading()}</div>`, foot: ui.source('Open-Meteo · pp_zips housing units', SRC.meteo, 'live') })}
  </div>
  <div class="pp-sec">Historical storm exposure · NOAA Storm Events 2019–2026 YTD</div>
  <div id="wx-hist"></div>
  <div class="pp-sec">Model transparency · baselines, multipliers, playbook</div>
  <div id="wx-model"></div>
  </div>`;
  const root = el.querySelector('.m-pp'); const alive = () => root.isConnected;

  renderHistory(ctx, root.querySelector('#wx-hist'), storms);
  renderModel(ctx, root.querySelector('#wx-model'), model, P);

  // live: alerts first (they feed the forecast drivers), forecasts in parallel
  const alertsP = territoryAlerts(live, model).catch(() => ({ alerts: [], failed: true }));
  const fcP = Promise.allSettled(hubs.map(h => live.forecast(h.lat, h.lon)));
  const AR = await alertsP; if (!alive()) return;
  renderAlerts(ctx, root.querySelector('#wx-alerts'), AR);
  const fcs = await fcP; if (!alive()) return;

  const grid = hubs.map((h, k) => {
    const r = fcs[k]; if (r.status !== 'fulfilled' || !r.value?.length) return { hub: h, days: null };
    const days = r.value; const ha = AR.alerts.filter(a => a.counties.some(c => c.county === h.county));
    return { hub: h, days, cells: days.map((d, i) => { const drv = dayDrivers(days, i, P.M, ha); const idx = {}; TRADES.forEach(t => idx[t] = combine(drv[t])); return { d, drv, idx }; }) };
  });
  const okRows = grid.filter(g => g.days);
  if (!okRows.length) {
    root.querySelector('#wx-heat').innerHTML = ui.note('Live forecast unavailable (Open-Meteo did not respond). Alerts and historical exposure remain valid; retry in a few minutes.', 'warn');
    root.querySelector('#wx-staff').innerHTML = ui.empty('Needs forecast'); root.querySelector('#wx-hubs').innerHTML = ui.empty('Needs forecast');
    root.querySelector('#wx-sowhat').innerHTML = `<b>So what:</b> ${AR.alerts.length} live NWS alerts touch the territory; forecast feed unavailable.`;
    return;
  }
  const dates = okRows[0].days.map(d => d.date); const fIdx = okRows[0].days.map((d, i) => i).filter(i => !okRows[0].days[i].past);

  const drawHeat = () => {
    const t = state.trade; const rgb = t === 'Peak' ? '255,92,92' : TRADE_RGB[t];
    const val = c => t === 'Peak' ? Math.max(...TRADES.map(x => c.idx[x])) : c.idx[t];
    const all = okRows.flatMap(g => g.cells.map(val)); const mx = Math.max(1.3, ...all);
    root.querySelector('#wx-heat').innerHTML = `<div class="tbl-wrap" style="border:0;background:transparent"><table class="pp-heat"><thead><tr><th style="text-align:left">Hub</th>${dates.map((d, i) => `<th class="${okRows[0].days[i].past ? 'past' : ''}">${esc(dlab(d))}${okRows[0].days[i].past ? '<span class="obs">observed</span>' : i === 2 ? '<span class="obs">today</span>' : ''}</th>`).join('')}</tr></thead><tbody>${grid.map((g, gi) => `<tr><td class="lbl">${esc(g.hub.name)} <span class="dim">${esc(g.hub.county)}${g.hub.state ? ' ' + esc(g.hub.state) : ''}</span></td>${g.days ? g.cells.map((c, i) => { const v = val(c); const a = Math.max(0, Math.min(1, (v - 1) / (mx - 1))); return `<td class="${c.d.past ? 'past' : ''}" data-g="${gi}" data-i="${i}" style="background:${v > 1.0001 ? `rgba(${rgb},${(0.12 + a * 0.78).toFixed(2)})` : 'var(--surface-2)'};color:${a > .5 ? '#0a0e14' : v > 1.0001 ? 'var(--text)' : 'var(--dim)'}" title="${esc(g.hub.name)} ${esc(c.d.date)}: ${Math.round(v * 100)}">${Math.round(v * 100)}</td>`; }).join('') : `<td class="na" colspan="${dates.length}">forecast unavailable</td>`}</tr>`).join('')}</tbody></table></div>`;
    root.querySelector('#wx-heat-leg').innerHTML = `<span><i style="background:var(--surface-2)"></i>100 = baseline</span><span><i style="background:rgba(${rgb},.35)"></i>110–120 elevated</span><span><i style="background:rgba(${rgb},.9)"></i>≥${Math.round(mx * 100)} peak in window</span><span class="dim">Combination: max driver + 0.5 × each additional independent hazard (model formula); correlated drivers of one hazard count once</span>`;
    root.querySelectorAll('#wx-heat td[data-g]').forEach(td => td.onclick = () => openCell(grid[+td.dataset.g], +td.dataset.i));
  };
  ui.seg(root.querySelector('#wx-trade'), [...TRADES.map(t => ({ value: t, label: t })), { value: 'Peak', label: 'Max' }], state.trade, v => { state.trade = v; drawHeat(); });

  const hubCalls = (g, i, t) => P.base[t] * (g.hub.hu / 1e4) * g.cells[i].idx[t];
  const staffCalc = () => {
    const rows = fIdx.map(i => {
      const o = { date: dates[i] }; TRADES.forEach(t => { o[t] = sum(okRows, g => hubCalls(g, i, t)) * state.share; o['b' + t] = sum(okRows, g => P.base[t] * g.hub.hu / 1e4) * state.share; });
      o.total = sum(TRADES, t => o[t]); o.base = sum(TRADES, t => o['b' + t]); o.techs = Math.ceil(o.total / JOBS_PER_TECH); o.baseTechs = Math.ceil(o.base / JOBS_PER_TECH); o.surge = o.techs - o.baseTechs;
      const drv = okRows.flatMap(g => TRADES.flatMap(t => g.cells[i].drv[t].map(x => ({ ...x, t, hub: g.hub.name })))).sort((a, b) => b.m - a.m)[0]; o.driver = drv ? `${drv.t}: ${drv.l} (${drv.hub})` : 'no weather driver';
      return o;
    });
    return rows;
  };
  const drawStaff = () => {
    const rows = staffCalc();
    root.querySelector('#wx-staff').innerHTML = stackBars(rows.map(r => dlab(r.date)), TRADES.map(t => ({ name: t, color: TRADE_HEX[t], values: rows.map(r => r[t]) })), { baseline: rows[0]?.base }) +
      `<div class="pp-legend">${TRADES.map(t => `<span><i style="background:${TRADE_HEX[t]}"></i>${t}</span>`).join('')}<span class="dim">dashed = baseline-day calls (${fmt.num(rows[0]?.base)}) at ${Math.round(state.share * 100)}% share</span></div>
      <div class="tbl-wrap mt-8"><table class="tbl"><thead><tr><th>Day</th>${TRADES.map(t => `<th class="num">${t}</th>`).join('')}<th class="num">PP calls</th><th class="num">vs base</th><th class="num">Techs</th><th class="num">Surge</th><th>Top driver</th></tr></thead><tbody>${rows.map(r => `<tr><td class="nowrap">${esc(dlab(r.date))}</td>${TRADES.map(t => `<td class="num">${fmt.num(r[t])}</td>`).join('')}<td class="num"><b>${fmt.num(r.total)}</b></td><td class="num" style="color:${r.total > r.base * 1.02 ? 'var(--amber)' : 'var(--muted)'}">${r.total >= r.base ? '+' : ''}${fmt.num((r.total / r.base - 1) * 100, 0)}%</td><td class="num">${fmt.num(r.techs)}</td><td class="num" style="color:${r.surge > 0 ? 'var(--red)' : 'var(--muted)'}">${r.surge > 0 ? '+' : ''}${fmt.num(r.surge)}</td><td class="small text-2" title="${esc(r.driver)}">${esc(r.driver)}</td></tr>`).join('')}</tbody></table></div>
      <div class="note mt-8">Market-wide calls use model baselines (HVAC ${P.base.HVAC} · Plumbing ${P.base.Plumbing} · Electrical ${P.base.Electrical} per 10k households/day) × served housing units × daily multiplier. <b>PP share (${Math.round(state.share * 100)}%) and ${JOBS_PER_TECH} jobs per tech-day are assumptions</b> — replace with ServiceTitan booked-call history to calibrate. Excludes planned maintenance (schedulable).</div>`;
    return rows;
  };
  const drawAll = () => {
    drawHeat(); const rows = drawStaff();
    // KPIs + so-what
    const peak = t => { let best = { v: 0 }; okRows.forEach(g => fIdx.forEach(i => { const v = g.cells[i].idx[t]; if (v > best.v) best = { v, hub: g.hub.name, date: dates[i], drv: g.cells[i].drv[t][0]?.l }; })); return best; };
    const pk = Object.fromEntries(TRADES.map(t => [t, peak(t)]));
    const pday = rows.slice().sort((a, b) => b.total - a.total)[0];
    const sev = AR.alerts.filter(a => /Extreme|Severe/.test(a.severity)).length;
    const k = t => ({ label: `Peak ${t === 'HVAC' ? 'HVAC' : t.toLowerCase()} pressure`, value: `${Math.round(pk[t].v * 100)}`, sub: pk[t].v > 1.0001 ? `${esc(pk[t].hub)} · ${esc(dlab(pk[t].date))} · ${esc(String(pk[t].drv || '').split(' (')[0].slice(0, 34))}` : 'baseline all week', color: pk[t].v >= 1.2 ? 'var(--red)' : pk[t].v > 1.0001 ? 'var(--amber)' : 'var(--green)' });
    root.querySelector('#wx-kpis').innerHTML = ui.kpis([
      { label: 'Territory alerts (live)', value: AR.failed ? 'n/a' : fmt.num(AR.alerts.length), sub: AR.failed ? 'NWS feed unavailable' : `${sev} severe · ${AR.alerts.filter(a => a.pb).length} with playbook`, color: sev ? 'var(--red)' : AR.alerts.length ? 'var(--amber)' : 'var(--green)' },
      k('HVAC'), k('Plumbing'), k('Electrical'),
      { label: 'Peak-day PP calls (est.)', value: fmt.num(pday?.total), sub: `${esc(dlab(pday?.date))} · ${pday && pday.total >= pday.base ? '+' : ''}${fmt.num(pday ? (pday.total / pday.base - 1) * 100 : 0, 0)}% vs baseline · ${Math.round(state.share * 100)}% share`, color: 'var(--c-pp)' },
      { label: 'Surge techs, peak day', value: `${pday?.surge > 0 ? '+' : ''}${fmt.num(pday?.surge)}`, sub: `${fmt.num(pday?.techs)} vs ${fmt.num(pday?.baseTechs)} base · 6 jobs/tech (assum.)`, color: pday?.surge > 0 ? 'var(--red)' : 'var(--green)' },
    ]);
    const hot = TRADES.filter(t => pk[t].v >= 1.1).sort((a, b) => pk[b].v - pk[a].v);
    root.querySelector('#wx-sowhat').innerHTML = `<b>So what:</b> ${hot.length ? `${hot.map(t => `${t} pressure peaks at <b>${Math.round(pk[t].v * 100)}</b> (${esc(pk[t].hub)}, ${esc(dlab(pk[t].date))})`).join('; ')} — ${pday?.surge > 0 ? `plan <b>+${pday.surge} techs</b> on ${esc(dlab(pday.date))} and convert maintenance slots to repair capacity` : 'absorbable within current capacity'}.` : 'a quiet week — no hub clears 110 on any trade; keep maintenance and membership tune-ups on the board and push new-mover campaigns.'} ${AR.failed ? 'NWS alert feed unavailable.' : AR.alerts.length ? `${AR.alerts.length} live NWS alert${AR.alerts.length > 1 ? 's' : ''} touch the territory${sev ? ` (${sev} severe)` : ''}.` : 'No active NWS alerts in territory.'}`;
  };
  ui.seg(root.querySelector('#wx-share'), [0.05, 0.10, 0.15, 0.20].map(v => ({ value: String(v), label: `${Math.round(v * 100)}% share` })), String(state.share), v => { state.share = Number(v); drawAll(); });

  // hub conditions table
  const hubRows = grid.map(g => {
    if (!g.days) return { hub: g.hub.name, county: g.hub.county, hu: g.hub.hu, na: true };
    const f = fIdx.map(i => g.days[i]); const peakI = fIdx.reduce((b, i) => Math.max(...TRADES.map(t => g.cells[i].idx[t])) > Math.max(...TRADES.map(t => g.cells[b].idx[t])) ? i : b, fIdx[0]);
    return { hub: g.hub.name, county: `${g.hub.county}${g.hub.note ? ' · ' + g.hub.note : ''}`, hu: g.hub.hu, tmax: Math.max(...f.map(d => num(d.tmax)).filter(fin)), tmin: Math.min(...f.map(d => num(d.tmin)).filter(fin)), precip: Math.max(...f.map(d => num(d.precip)).filter(fin)), gust: Math.max(...f.map(d => num(d.gust)).filter(fin)), snow: sum(f, d => d.snow), peak: Math.round(Math.max(...TRADES.map(t => g.cells[peakI].idx[t])) * 100), _g: g };
  });
  ui.table(root.querySelector('#wx-hubs'), {
    columns: [
      { key: 'hub', label: 'Hub', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.county)} · ${fmt.compact(r.hu)} units</div>` },
      { key: 'tmax', label: 'Hi / Lo °F', num: true, fmt: (v, r) => fin(v) ? `<span style="color:${v >= 90 ? 'var(--red)' : v >= 85 ? 'var(--amber)' : 'inherit'}">${Math.round(v)}</span> / <span style="color:${r.tmin <= 20 ? 'var(--accent-2)' : 'inherit'}">${fin(r.tmin) ? Math.round(r.tmin) : '—'}</span>` : '—' },
      { key: 'precip', label: 'Rain"', num: true, fmt: v => fin(v) ? v.toFixed(2) : '—' },
      { key: 'gust', label: 'Gust', num: true, fmt: v => fin(v) ? Math.round(v) : '—' },
      { key: 'peak', label: 'Peak', num: true, fmt: v => v ? `<b style="color:${v >= 120 ? 'var(--red)' : v > 100 ? 'var(--amber)' : 'var(--muted)'}">${v}</b>` : '—' },
    ], rows: hubRows, pageSize: 12, sortKey: 'peak', exportName: 'pp_hub_conditions', rowKey: r => r.hub,
    onRow: r => r._g && openCell(r._g, fIdx.reduce((b, i) => Math.max(...TRADES.map(t => r._g.cells[i].idx[t])) > Math.max(...TRADES.map(t => r._g.cells[b].idx[t])) ? i : b, fIdx[0])),
  });

  function openCell(g, i) {
    if (!g?.days) return; const c = g.cells[i]; const d = c.d;
    const calls = Object.fromEntries(TRADES.map(t => [t, P.base[t] * g.hub.hu / 1e4 * c.idx[t]]));
    inspector.open({
      title: `${esc(g.hub.name)} · ${esc(dfull(fmt, d.date))}`, sub: `${esc(g.hub.county)} ${esc(g.hub.state)} · ${d.past ? 'observed' : 'forecast'} · ${esc(live.wmo(d.code))}`, color: 'var(--c-pp)',
      sections: [
        { label: 'Pressure index', html: charts.hbar(TRADES.map(t => ({ label: t, value: Math.round(c.idx[t] * 100), color: TRADE_HEX[t] })), { max: Math.max(150, ...TRADES.map(t => c.idx[t] * 100)), fmt: v => v, labelW: 80 }) },
        { label: 'Weather', html: ui.kv({ 'High / low': `${fin(num(d.tmax)) ? Math.round(d.tmax) : '—'}°F / ${fin(num(d.tmin)) ? Math.round(d.tmin) : '—'}°F`, Precipitation: `${fin(num(d.precip)) ? Number(d.precip).toFixed(2) : '—'} in${d.pop != null ? ` · ${d.pop}% chance` : ''}`, 'Peak gust': `${fin(num(d.gust)) ? Math.round(d.gust) : '—'} mph`, Snow: `${fin(num(d.snow)) ? Number(d.snow).toFixed(1) : '0'} in`, Condition: esc(live.wmo(d.code)) }) },
        { label: 'Active drivers', html: TRADES.some(t => c.drv[t].length) ? `<div class="col gap-4">${TRADES.flatMap(t => c.drv[t].map(x => `<div class="row small"><span class="chip" style="--cc:${TRADE_HEX[t]}">${t}</span><span class="num">×${x.m.toFixed(2)}</span><span class="text-2">${esc(x.l)}</span></div>`)).join('')}</div>` : '<div class="small dim">No driver above threshold — baseline day.</div>' },
        { label: 'Expected market calls (all providers)', html: ui.kv(Object.fromEntries([...TRADES.map(t => [t, `${fmt.num(calls[t])} <span class="dim">(base ${fmt.num(P.base[t] * g.hub.hu / 1e4)})</span>`]), ['Served units', fmt.num(g.hub.hu)], [`PP @ ${Math.round(state.share * 100)}% share`, `${fmt.num(sum(TRADES, t => calls[t]) * state.share)} calls → ${Math.ceil(sum(TRADES, t => calls[t]) * state.share / JOBS_PER_TECH)} techs`]])) },
        { label: 'Next action', html: `<div class="small text-2">${Math.max(...TRADES.map(t => c.idx[t])) >= 1.2 ? 'Pull maintenance visits forward/back out of this day, extend dispatch hours, pre-stage parts for the driving trade and open CSR overflow.' : Math.max(...TRADES.map(t => c.idx[t])) > 1.0001 ? 'Hold 10–15% of slots open for same-day demand in the driving trade.' : 'Normal schedule; use capacity for maintenance and membership visits.'}</div>` },
        { label: 'Sources', html: `<div class="small col gap-4">${fmt.link(SRC.meteo, 'Open-Meteo forecast (hub point)')}${g.hub.src ? fmt.link(g.hub.src, `NWS point metadata${g.hub.grid ? ' · ' + g.hub.grid : ''}`) : ''}<span class="dim">Climatology station: ${esc(g.hub.station || '—')}</span></div>` },
      ],
    });
  }
  drawAll();
  return () => { };
}

function renderAlerts(ctx, box, AR) {
  const { ui, fmt, esc, inspector } = ctx;
  if (AR.failed) { box.innerHTML = ui.note('NWS alert feed unavailable right now (api.weather.gov). The playbook below still applies when alerts are issued.', 'warn'); return; }
  if (!AR.alerts.length) { box.innerHTML = `<div class="empty">No active NWS alerts touch the 15 territory counties.<br><span class="small">Checked PA + NJ statewide feeds · ${esc(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }))}</span></div>`; return; }
  box.innerHTML = AR.alerts.map((a, k) => {
    const tierOf = c => c.pp_territory_tier === 'core' ? 'var(--c-pp)' : c.pp_territory_tier === 'horvath_nj' ? 'var(--amber)' : 'var(--accent)';
    const m = a.pb?.expected_call_volume_multiplier;
    return `<div class="pp-alert" data-k="${k}" style="--cc:${SEV[a.severity] || 'var(--muted)'}"><div class="h"><span class="t">${esc(a.event)}</span>${fmt.chip(a.severity || 'Unknown', SEV[a.severity])}<span class="small dim num">${esc(dfull(fmt, a.onset || a.sent))} → ${esc(a.ends ? dfull(fmt, a.ends) : 'until further notice')}</span></div>
      <div class="row wrap mt-8" style="gap:4px">${a.counties.map(c => fmt.chip(`${c.county} ${c.state}`, tierOf(c))).join('')}</div>
      ${a.pb ? `<div class="row wrap mt-8" style="gap:4px">${TRADES.map(t => m?.[t] ? `<span class="chip" style="--cc:${TRADE_HEX[t]}">${t} ×${m[t][0]}–${m[t][1]}</span>` : '').join('')}</div><ul>${(a.pb.actions || []).slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div class="small dim mt-8">No playbook entry for this event type — monitor; log outcomes for calibration.</div>`}</div>`;
  }).join('');
  box.querySelectorAll('.pp-alert').forEach(n => n.onclick = () => {
    const a = AR.alerts[+n.dataset.k];
    inspector.open({
      title: esc(a.event), sub: `${esc(a.severity)} · ${esc(a.urgency || '')} · ${esc(a.sender || '')}`, color: SEV[a.severity] || 'var(--amber)',
      sections: [
        { label: 'Territory counties', html: a.counties.map(c => fmt.chip(`${c.county}, ${c.state} · ${String(c.pp_territory_tier || '').replace('_', ' ')}`)).join(' ') },
        { label: 'Headline', html: `<div class="small text-2">${esc(a.headline || '')}</div>` },
        { label: 'Timing', html: ui.kv({ Onset: esc(a.onset || a.sent || '—'), Ends: esc(a.ends || '—'), 'Lead time (model)': a.pb ? esc(a.pb.lead_time || '—') : null }) },
        a.pb ? { label: 'Playbook actions', html: `<ul class="prose small">${(a.pb.actions || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="small dim mt-8">Expected call multipliers: ${TRADES.map(t => `${t} ×${esc((a.pb.expected_call_volume_multiplier?.[t] || []).join('–'))}`).join(' · ')} (${esc(a.pb.multiplier_basis || '')})</div>` } : null,
        a.pb?.local_history ? { label: 'Local history', html: `<div class="small text-2">${fmt.num(a.pb.local_history.territory_episodes_2019_2025)} episodes 2019–25 (~${a.pb.local_history.avg_episodes_per_year}/yr) · ${esc(a.pb.local_history.basis || '')}</div>` } : null,
        { label: 'NWS text', html: `<div class="small text-2" style="white-space:pre-wrap;max-height:260px;overflow:auto">${esc(String(a.description || '').slice(0, 2400))}</div>${a.instruction ? `<div class="small mt-8" style="white-space:pre-wrap">${esc(String(a.instruction).slice(0, 800))}</div>` : ''}` },
        { label: 'Next action', html: `<div class="small text-2">${a.pb ? esc(a.pb.actions?.[0] || '') : 'Brief dispatch; no model playbook for this event.'}</div>` },
        { label: 'Source', html: `<div class="small">${fmt.link(String(a.id || '').startsWith('http') ? a.id : 'https://api.weather.gov/alerts/active', 'api.weather.gov alert record')}${a.pb?.source_url ? ` · ${fmt.link(a.pb.source_url, 'playbook basis')}` : ''}</div>` },
      ].filter(Boolean),
    });
  });
}

function renderHistory(ctx, box, storms) {
  const { ui, fmt, charts, esc, inspector } = ctx;
  if (!storms) { box.innerHTML = ui.note('Storm history dataset (pp_storm_events) is not available yet.', 'warn'); return; }
  const m = storms.meta || {}; const items = storms.items || [];
  const src = ui.source('NOAA NCEI Storm Events Database', SRC.ncei, m.generated);
  const seas = m.seasonality || {}; const types = Object.keys(seas).sort((a, b) => (seas[b].total || 0) - (seas[a].total || 0)).slice(0, 12);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yrs = Object.keys(m.annual_totals || {}).sort();
  const at = m.annual_totals || {};
  const full = yrs.filter(y => !at[y].partial_year);
  const avgEv = avg(full, y => at[y].event_count), avgEp = avg(full, y => at[y].episode_count);
  const maxY = full.slice().sort((a, b) => at[b].event_count - at[a].event_count)[0];
  const tiers = { core: 0, horvath_nj: 1, adjacent: 2 };
  const cmap = new Map(); for (const r of items) { if (r.partial_year || r.year > 2025) continue; const k = `${r.county}|${r.state}`; if (!cmap.has(k)) cmap.set(k, { county: r.county, state: r.state, tier: r.pp_territory_tier, t: {} }); const c = cmap.get(k); c.t[r.event_type] = (c.t[r.event_type] || 0) + (r.episode_count || 0); }
  const cRows = [...cmap.values()].sort((a, b) => (tiers[a.tier] ?? 9) - (tiers[b.tier] ?? 9) || a.county.localeCompare(b.county));
  const cTypes = types.filter(t => cRows.some(c => c.t[t])).slice(0, 10);
  box.innerHTML = `<div class="grid grid-2">
    ${ui.panel({ title: 'Seasonality · events by month', sub: `Top event types, all 15 counties, ${esc(m.seasonality_basis || '2019–2025')} · July is the convective peak, Jan–Feb the freeze/winter peak`, body: charts.heatgrid(types, months, types.map(t => seas[t].monthly_event_counts || []), { color: '240,138,60', fmt: v => v || '' }), foot: src })}
    ${ui.panel({ title: 'Annual event totals', sub: `Avg ${fmt.num(avgEv)} events / ${fmt.num(avgEp)} episodes per full year · busiest ${esc(maxY || '—')} · ${yrs.some(y => at[y].partial_year) ? `${esc(yrs.find(y => at[y].partial_year))} is partial (NCEI lag)` : ''}`, body: charts.line([{ name: 'Events', color: '#f08a3c', points: yrs.map(y => [y + (at[y].partial_year ? '*' : ''), at[y].event_count]) }, { name: 'Episodes', color: '#4c8dff', points: yrs.map(y => [y + (at[y].partial_year ? '*' : ''), at[y].episode_count]) }], { h: 200, area: true }) + `<div class="pp-legend"><span><i style="background:#f08a3c"></i>Event reports</span><span><i style="background:#4c8dff"></i>Distinct episodes</span><span class="dim">* partial year</span></div><div class="tbl-wrap mt-8"><table class="tbl"><thead><tr><th>Year</th><th class="num">Events</th><th class="num">Episodes</th><th class="num">Property damage</th><th class="num">Deaths</th></tr></thead><tbody>${yrs.map(y => `<tr><td>${esc(y)}${at[y].partial_year ? ' <span class="dim">(partial)</span>' : ''}</td><td class="num">${fmt.num(at[y].event_count)}</td><td class="num">${fmt.num(at[y].episode_count)}</td><td class="num">${fmt.money(at[y].total_damage_property_usd)}</td><td class="num">${fmt.num(at[y].deaths)}</td></tr>`).join('')}</tbody></table></div>`, foot: src })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Notable events', sub: 'Largest damage / casualty events in territory counties · click for NWS narrative', body: '<div id="wx-notable"></div>', foot: src })}</div>
  <div class="mt-12">${ui.panel({ title: 'County × event type · distinct episodes 2019–2025', sub: 'Episodes de-duplicate zone-split counties · core PA first, then Horvath NJ, then adjacent', body: charts.heatgrid(cRows.map(c => `${c.county} ${c.state} · ${c.tier === 'core' ? 'core' : c.tier === 'horvath_nj' ? 'Horvath' : 'adj.'}`), cTypes, cRows.map(c => cTypes.map(t => c.t[t] || null)), { color: '76,141,255', fmt: v => v ?? '' }), foot: src })}</div>`;
  const ne = (m.notable_events || []).map(e => ({ ...e, _cas: (e.deaths || 0) + (e.injuries || 0) }));
  ui.table(box.querySelector('#wx-notable'), {
    columns: [
      { key: 'begin_date', label: 'Date', num: true, fmt: v => esc(dfull(ctx.fmt, v)) },
      { key: 'event_type', label: 'Event', fmt: v => fmt.chip(v, /Flood/.test(v) ? 'var(--accent)' : /Heat/.test(v) ? 'var(--red)' : /Winter|Snow|Ice|Cold|Blizzard/.test(v) ? 'var(--cyan)' : 'var(--amber)') },
      { key: 'county', label: 'County', fmt: (v, r) => `${esc(v)}, ${esc(r.state)}` },
      { key: 'begin_location', label: 'Location' },
      { key: 'damage_property_usd', label: 'Damage', num: true, fmt: v => v ? fmt.money(v) : '—' },
      { key: '_cas', label: 'Deaths / inj.', num: true, fmt: (v, r) => `${r.deaths || 0} / ${r.injuries || 0}` },
      { key: 'narrative', label: 'Narrative', wrap: true, fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 150))}${String(v || '').length > 150 ? '…' : ''}</span>` },
    ], rows: ne, pageSize: 8, sortKey: 'damage_property_usd', exportName: 'pp_notable_storm_events', rowKey: r => r.event_id,
    onRow: e => inspector.open({ title: `${esc(e.event_type)} · ${esc(e.county)}, ${esc(e.state)}`, sub: `${esc(dfull(fmt, e.begin_date))} · ${esc(e.begin_location || '')}`, color: 'var(--c-pp)', sections: [{ label: 'Impact', html: ui.kv({ 'Property damage': fmt.moneyFull(e.damage_property_usd), Deaths: e.deaths, Injuries: e.injuries, Magnitude: e.magnitude != null ? `${e.magnitude} ${e.magnitude_type || ''}` : null, 'Tornado scale': e.tor_f_scale, 'NCEI event id': e.event_id }) }, { label: 'NWS narrative', html: `<div class="small text-2">${esc(e.narrative || '')}</div>` }, { label: 'Operating read-across', html: `<div class="small text-2">${/Flood|Rain/.test(e.event_type) ? 'Flood events drive sump-pump, water-heater and basement electrical calls 0–3 days later; pre-position pumps and restoration partners.' : /Wind|Tornado|Thunder/.test(e.event_type) ? 'Wind/convective damage drives service-drop, meter-base and surge-protection work; coordinate with utility restoration crews.' : 'Temperature extremes drive no-heat / no-cool and frozen-pipe calls; stage parts and extend dispatch.'}</div>` }, { label: 'Source', html: fmt.link(e.source_url, 'NCEI Storm Events record') }], actions: e.source_url ? [{ label: 'NCEI record ↗', href: e.source_url }] : [] }),
  });
}

function renderModel(ctx, box, model, P) {
  const { ui, fmt, esc } = ctx;
  if (!model) { box.innerHTML = ui.note('pp_demand_model not available — the index above uses fallback thresholds (heat ≥90°F, cold ≤20°F, rain ≥1.5 in, gusts ≥40 mph, snow ≥1 in) and default baselines.', 'warn'); return; }
  const it = model.items || []; const m = model.meta || {};
  const conf = b => { const [l, c] = basisConf(b); return fmt.chip(l, c); };
  const baselines = it.filter(i => i.component === 'baseline');
  const mults = it.filter(i => i.component === 'multiplier');
  const pbs = it.filter(i => i.component === 'event_playbook');
  box.innerHTML = `<div>
    ${ui.panel({ title: 'Baselines & multipliers', sub: 'What the index multiplies · confidence from the model’s own basis tag', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Trade</th><th>Component</th><th>Value / tiers</th><th>Conf.</th><th>Source</th></tr></thead><tbody>
      ${baselines.map(b => `<tr><td><span class="chip" style="--cc:${TRADE_HEX[b.trade]}">${esc(b.trade)}</span></td><td class="wrap small">Baseline calls / day / 10k households</td><td class="num" style="text-align:left">${esc(b.value_point)} <span class="dim">(${esc((b.value_range || []).join('–'))})</span></td><td>${conf(b.basis)}</td><td>${fmt.link(b.source_url, fmt.host(b.source_url))}</td></tr>`).join('')}
      ${mults.map(x => `<tr><td><span class="chip" style="--cc:${TRADE_HEX[x.trade] || 'var(--muted)'}">${esc(x.trade)}</span></td><td class="wrap small" style="min-width:200px;max-width:260px">${esc(x.driver)}</td><td class="wrap small text-2" style="max-width:none">${(x.piecewise || []).filter(p => mid(p.multiplier) > 1).map(p => `<div>${esc(String(p.condition).slice(0, 110))} <span class="num" style="color:${TRADE_HEX[x.trade] || 'var(--text)'}">×${esc((p.multiplier || []).join('–'))}</span></div>`).join('')}</td><td>${conf(x.basis)}</td><td>${fmt.link(x.source_url, fmt.host(x.source_url))}</td></tr>`).join('')}
    </tbody></table></div>`, foot: ui.source('pp_demand_model', null, m.generated) })}
    <div class="mt-12"></div>${ui.panel({ title: 'NWS alert playbook', sub: 'Expected call multipliers and first actions per warning type · territory frequency from Storm Events', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>NWS event</th>${TRADES.map(t => `<th class="num">${t}</th>`).join('')}<th class="num">Episodes / yr</th><th>Lead time</th><th>First action</th></tr></thead><tbody>${pbs.map(p => `<tr><td class="wrap"><b>${esc(p.nws_event)}</b>${(p.aliases_and_related || []).length ? `<div class="dim small">${esc(p.aliases_and_related.join(' · '))}</div>` : ''}</td>${TRADES.map(t => `<td class="num">×${esc((p.expected_call_volume_multiplier?.[t] || []).join('–'))}</td>`).join('')}<td class="num">${p.local_history?.avg_episodes_per_year ?? '—'}</td><td class="wrap small text-2" style="max-width:none">${esc(String(p.lead_time || '').slice(0, 140))}</td><td class="wrap small text-2" style="max-width:none;min-width:260px">${esc((p.actions || [])[0] || '')}</td></tr>`).join('')}</tbody></table></div>`, foot: ui.source('NWS warning definitions · NOAA Storm Events', 'https://www.weather.gov/lwx/WarningsDefined', m.generated) })}
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'How the portal computes the index', body: `<ul class="prose small"><li><b>Formula (model):</b> ${esc(m.formula?.['expected_calls[trade,county,day]'] || 'baseline × households/10k × multiplier')}</li><li><b>Point estimates:</b> midpoint of each multiplier range (${esc(m.formula?.multiplier_point_estimate || 'model guidance')}); thunderstorm days use the lower bound of the Severe-Thunderstorm range (×${P.M.ts}).</li><li><b>Thresholds applied to hub forecasts:</b> TMAX ≥85/90/95°F and heat waves; TMIN ≤25/20/10/0°F; hard freeze ≥2 days ≤20°F and thaw rebound; rain ≥1.0/1.5 in; gusts ≥40/58 mph; snow ≥1/4 in (winter-storm playbook); live NWS alerts with a playbook entry apply on their active days.</li><li><b>Not yet applied:</b> monthly seasonality index (model: null until PP history loads), housing-age modifier ×1.2–1.5 for pre-1960 cores, heat-wave season decay.</li><li><b>Assumptions:</b> PP market share (selector), ${JOBS_PER_TECH} completed jobs per technician-day.</li></ul>` })}
    ${ui.panel({ title: 'Caveats (from the model)', body: `<ul class="prose small">${(m.caveats || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>`, foot: `<span class="dim">Calibration: ${esc(m.formula?.calibration || 'regress PP booked calls on hub weather once 12+ months are loaded')}</span>` })}
  </div>`;
}

/* ═══ 3. NEW-MOVER MARKETING ═════════════════════════════════════════════ */
let LEADS = null;
const addrKey = a => String(a || '').toUpperCase().split(',')[0].replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
async function loadLeads(data, Z, onProgress) {
  if (LEADS) return LEADS;
  const files = [
    { name: 'sales/pp_sales_pa_a', label: 'PA county parcel/CAMA layers (Lancaster · York · Cumberland · Dauphin)' },
    { name: 'sales/pp_sales_pa_b', label: 'PA county parcel/CAMA layers (Berks · Lebanon · Franklin · Adams · Perry · Chester · Montgomery)' },
    { name: 'sales/pp_sales_nj', label: 'NJ Taxation SR1A (Ocean · Monmouth · Atlantic · Burlington)' },
    { name: 'pp_sales_90d', label: 'Legacy 90-day deed layer (Jan–Apr 2026)' },
  ];
  let done = 0;
  const loaded = await Promise.all(files.map(f => data.load(f.name).then(j => { onProgress && onProgress(++done, files.length); return j; }).catch(() => { onProgress && onProgress(++done, files.length); return null; })));
  const cov = new Map(); const recs = []; const seen = new Set(); const covMeta = new Map(); const fileStatus = [];
  const yearNow = new Date().getFullYear();
  files.forEach((f, fi) => {
    const j = loaded[fi]; fileStatus.push({ ...f, ok: !!j, meta: j?.meta || null, n: Array.isArray(j) ? j.length : (j?.items?.length || 0) });
    if (!j) return;
    for (const c of j.meta?.coverage || []) covMeta.set(`${cty(c.county)}|${c.state}`, c);
    const legacy = Array.isArray(j); const items = legacy ? j : (j.items || []);
    for (const r0 of items) {
      const r = legacy ? { county: r0.county, muni: r0.muni, addr: r0.addr, zip: r0.zip, lat: r0.lat, lon: r0.lon, sale_date: r0.date, price: r0.price, buyer: r0.grantee, seller: r0.grantor, builder_flag: r0.builder === 1, use_type: null, source: 'pp_sales_90d legacy deed layer' } : r0;
      const county = cty(r.county); const state = r.state || (NJ_ALL.includes(county) ? 'NJ' : 'PA');
      const ck = `${county}|${state}`;
      if (!cov.has(ck)) cov.set(ck, { county, state, raw: 0, legacyRaw: 0, leads: 0, first: null, last: null, legacy: 0, dupes: 0, sources: new Set(), urls: new Set() });
      const c = cov.get(ck); c.raw++; if (legacy) c.legacyRaw++; if (r.source) c.sources.add(String(r.source)); if (r.source_url) c.urls.add(r.source_url);
      const sd = isoDay(r.sale_date);
      if (sd) { if (!c.first || sd < c.first) c.first = sd; if (!c.last || sd > c.last) c.last = sd; }
      const price = num(r.price);
      if (!(price >= 10000) || r.arms_length === false || !sd) continue;
      if (r.use_type && r.use_type !== 'residential') continue;
      const key = `${county}|${r.addr ? addrKey(r.addr) : `${r.lat},${r.lon}`}|${sd}`;
      if (seen.has(key)) { c.dupes++; continue; } seen.add(key);
      const yb = num(r.year_built); const ybOk = fin(yb) && yb > 1700 && yb <= yearNow + 1 ? yb : null;
      const builder = r.builder_flag === true || r.new_construction === true || (ybOk != null && ybOk >= +sd.slice(0, 4) - 1);
      let zip = r.zip ? String(r.zip).padStart(5, '0') : null; let zr = zip ? Z.byZip.get(zip) : null; let zipInf = false;
      const lat = num(r.lat), lon = num(r.lon);
      if (!zr) { const nz = Z.nearest(lat, lon); if (nz) { zr = nz; if (!zip) { zip = nz.zip; zipInf = true; } } }
      const statusZ = zr ? zr._status : 'outer';
      const status = (state === 'NJ' && NJ_H.includes(county)) ? 'horvath' : statusZ === 'horvath' ? 'adjacent' : statusZ;
      const L = { id: `${ck}|${recs.length}`, state, county, muni: r.muni || '', addr: r.addr || '(no situs address)', zip: zip || '', zip_inferred: zipInf, lat: fin(lat) ? lat : null, lon: fin(lon) ? lon : null, sale_date: sd, price, buyer: r.buyer || null, year_built: ybOk, sqft: num(r.sqft) || null, builder, status, served: status === 'territory' || status === 'horvath', old_share: zr?.old_housing_share ?? null, zip_tier: zr?.practical_priority_tier || null, src: r.source || f.label, src_url: r.source_url || null, legacy };
      L.days = daysSince(sd);
      scoreLead(L, yearNow);
      recs.push(L); c.leads++; if (legacy) c.legacy++;
    }
  });
  LEADS = { recs, cov, covMeta, fileStatus };
  return LEADS;
}
function scoreLead(L, yearNow) {
  const d = L.days ?? 999;
  const rec = d <= 60 ? 35 : d <= 120 ? 26 : d <= 180 ? 18 : d <= 365 ? 9 : 3;
  const pr = L.price >= 600000 ? 20 : L.price >= 350000 ? 16 : L.price >= 200000 ? 11 : 6;
  let age; if (L.year_built) { const a = yearNow - L.year_built; age = a >= 45 ? 20 : a >= 25 ? 15 : a >= 10 ? 8 : 3; } else age = Math.round(20 * (L.old_share ?? 0.5));
  const res = L.builder ? 0 : 10;
  const ter = L.served ? 15 : L.status === 'adjacent' ? 7 : 0;
  L.parts = { Recency: rec, 'Price band': pr, 'Housing age': age, Resale: res, Territory: ter };
  L.score = rec + pr + age + res + ter;
  L.pre1980 = L.year_built ? L.year_built < 1980 : (L.old_share ?? 0) >= 0.7;
  L.p_old25 = L.year_built ? (yearNow - L.year_built > 25 ? 1 : 0) : (L.old_share ?? 0);
  L.offer = L.builder ? 'Maintenance plan (new build)' : L.pre1980 ? 'Safety inspection (pre-1980)' : 'Welcome tune-up';
  L.band = L.price >= 600000 ? '$600K+' : L.price >= 350000 ? '$350–600K' : L.price >= 200000 ? '$200–350K' : '<$200K';
}
const scoreHex = s => s >= 75 ? '#2ecc8f' : s >= 55 ? '#4c8dff' : s >= 35 ? '#f5b73d' : '#5b6b7f';
const OFFER_C = { 'Welcome tune-up': 'var(--c-pp)', 'Safety inspection (pre-1980)': 'var(--red)', 'Maintenance plan (new build)': 'var(--green)' };

async function movers(ctx) {
  const { el, ui, fmt, data, maps, charts, esc, inspector, app, params } = ctx; css();
  el.innerHTML = `<div class="m-pp">${ui.pageHead({ title: 'New-mover marketing', sub: 'Loading 12 months of county deed and assessment transfers for every served county…', chips: '' })}<div id="mv-load">${ui.loading('Loading county sales files (≈90K transfers)…')}</div></div>`;
  const root = el.querySelector('.m-pp'); const alive = () => root.isConnected;
  const Z = await loadZips(data);
  const LD = await loadLeads(data, Z, (d, n) => { const b = root.querySelector('#mv-load .loading'); if (b) b.lastChild.textContent = `Loading county sales files… ${d}/${n}`; });
  if (!alive()) return;
  const all = LD.recs;
  if (!all.length) { root.innerHTML = ui.pageHead({ title: 'New-mover marketing', sub: 'No sales files available.' }) + ui.note('None of the property-transfer datasets (sales/pp_sales_pa_a, pp_sales_pa_b, pp_sales_nj, pp_sales_90d) could be loaded.', 'warn'); return; }
  const counties = [...new Set(all.map(r => r.county))].sort();
  const initCounty = params.county && counties.includes(params.county) ? params.county : '';
  const lastDate = all.reduce((m, r) => r.sale_date > m ? r.sale_date : m, '');
  const winFrom = all.filter(r => r.served).reduce((m, r) => !m || r.sale_date < m ? r.sale_date : m, '');
  const nServedAll = all.filter(r => r.served).length;

  root.innerHTML = `${ui.pageHead({
    title: 'New-mover marketing',
    sub: `<b>So what:</b> ${fmt.num(nServedAll)} market-rate home sales (${esc(dfull(fmt, winFrom))} – ${esc(dfull(fmt, lastDate))}, county files) sit inside PP/Horvath zips — every one is a household that just inherited an unknown HVAC system, water heater and panel. Mail within 60 days of closing, lead with the offer that fits the house, and route the top-scored ${fmt.num(all.filter(r => r.served && r.score >= 75).length)} to outbound calls.`,
    chips: `${fmt.chip(`${fmt.num(all.length)} residential sales ≥$10K`, 'var(--c-pp)')}${fmt.chip(`${LD.cov.size} counties`, 'var(--accent)')}${fmt.chip(`latest ${dfull(fmt, lastDate)}`)}`,
    actions: `<button class="btn brand" id="mv-mail">⇩ Mailing list CSV</button>`,
  })}
  <div id="mv-filters"></div>
  <div id="mv-kpis"></div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Lead map', sub: 'Colored by lead score (highest on top) · capped at ~6,000 most recent leads, allocated by county volume · click a point for the lead', body: `<div class="map tall" id="mv-map"></div>`, flush: true, foot: ui.source('County parcel/CAMA layers · NJ Taxation SR1A', 'https://www.nj.gov/treasury/taxation/lpt/statdata/YTDSR1A2026.zip', '2026-09-24') })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Campaigns', sub: 'Target counts from the filtered list · in-footprint vs. all', body: '<div id="mv-camp"></div>', foot: '<span class="dim">Response 2–4% is an industry-typical direct-mail assumption (illustrative)</span>' })}
      ${ui.panel({ title: 'Lead flow by sale month', sub: 'Filtered leads · source lags make the last 1–3 months look light', body: '<div id="mv-month"></div>' })}
    </div>
  </div>
  <div class="mt-12">${ui.panel({ title: 'Lead list', sub: 'Sorted by score · click a lead for score breakdown and next action', body: '<div id="mv-table"></div>', foot: ui.source('Normalized from 4 transfer datasets; de-duplicated on county + address + sale date', null, '2026-09-24') })}</div>
  <div class="mt-12">
    ${ui.panel({ title: 'Sales-record coverage by served county', sub: 'Home-sale records gathered for every county PP and Horvath serve · recording lag and gaps flagged', body: '<div id="mv-cov"></div>', foot: ui.source('County GIS / assessment layers; NJ Division of Taxation SR1A', null, '2026-09-24') })}
  </div><div class="mt-12">
    ${ui.panel({ title: 'Lead score (0–100) — method', body: `<div class="small text-2"><table class="tbl"><tbody>
      <tr><td><b>Recency</b> · 35</td><td class="wrap">≤60 days 35 · ≤120 26 · ≤180 18 · ≤365 9 · older 3 (new owners book in the first 60 days)</td></tr>
      <tr><td><b>Price band</b> · 20</td><td class="wrap">$600K+ 20 · $350–600K 16 · $200–350K 11 · &lt;$200K 6 (bigger homes = bigger/multi-zone systems)</td></tr>
      <tr><td><b>Housing age</b> · 20</td><td class="wrap">Year built when published (≥45 yrs 20 · 25–44 15 · 10–24 8 · &lt;10 3); else 20 × zip older-stock share (pp_zips)</td></tr>
      <tr><td><b>Resale</b> · 10</td><td class="wrap">Resale 10 · builder / new construction 0 (routes to maintenance-plan offer instead)</td></tr>
      <tr><td><b>Territory</b> · 15</td><td class="wrap">PP core or Horvath zip 15 · adjacent ring 7 · outside 0</td></tr></tbody></table>
      <div class="note mt-8">Filters out nominal (&lt;$10K) and non-arms-length deeds and non-residential use. Missing zips are inferred from the nearest pp_zips centroid. Buyer names are shown only where the county publishes them; NJ SR1A redacts names, so NJ mailers address “Current Resident”.</div></div>` })}
  </div>`;

  const map = maps.create(root.querySelector('#mv-map'), { center: [40.1, -76.0], zoom: 7 });
  maps.marker(map, HQ.lat, HQ.lon, { color: '#ffffff', label: 'PP HQ' });
  maps.marker(map, HORVATH.lat, HORVATH.lon, { color: '#f5b73d', label: 'Horvath' });
  maps.legend(map, [{ color: '#2ecc8f', label: 'Score ≥75' }, { color: '#4c8dff', label: '55–74' }, { color: '#f5b73d', label: '35–54' }, { color: '#5b6b7f', label: '<35' }], 'Lead score');
  let pts = null, tbl = null, cur = all, fitted = false;
  const tcols = [
    { key: 'score', label: 'Score', num: true, width: '96px', fmt: v => fmt.score(v, scoreHex(v)) },
    { key: 'sale_date', label: 'Sold', num: true, fmt: v => esc(dfull(fmt, v)) },
    { key: 'days', label: 'Days', num: true },
    { key: 'addr', label: 'Address', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.muni)}${r.zip ? ` · ${esc(r.zip)}${r.zip_inferred ? '*' : ''}` : ''}</div>` },
    { key: 'county', label: 'County', fmt: (v, r) => `${esc(v)} <span class="dim">${esc(r.state)}</span>` },
    { key: 'price', label: 'Price', num: true, fmt: v => fmt.money(v) },
    { key: 'year_built', label: 'Built', num: true, sort: (a, b) => (a.year_built || -1) - (b.year_built || -1), fmt: v => v || '—' },
    { key: 'offer', label: 'Suggested offer', fmt: v => fmt.chip(v, OFFER_C[v]) },
    { key: 'status', label: 'Footprint', fmt: v => statusChip(fmt, v) },
  ];
  const f = ui.filters(root.querySelector('#mv-filters'), [
    { key: 'q', label: 'Search address, town, zip…', type: 'search' },
    { key: 'county', label: 'County', options: counties, value: initCounty },
    { key: 'band', label: 'Price', options: ['<$200K', '$200–350K', '$350–600K', '$600K+'] },
    { key: 'days', label: 'Sold within', options: [{ value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: '90', label: '90 days' }, { value: '180', label: '180 days' }, { value: '365', label: '12 months' }] },
    { key: 'kind', label: 'Type', options: [{ value: 'resale', label: 'Resale' }, { value: 'builder', label: 'Builder / new construction' }] },
    { key: 'offer', label: 'Offer', options: Object.keys(OFFER_C) },
    { key: 'served', label: 'In-footprint only', type: 'toggle', value: false },
  ], st => apply(st));

  function apply(st) {
    const q = (st.q || '').toLowerCase(); const dmax = st.days ? Number(st.days) : Infinity;
    cur = all.filter(r => (!st.county || r.county === st.county) && (!st.band || r.band === st.band) && (r.days ?? 9999) <= dmax && (!st.kind || (st.kind === 'builder' ? r.builder : !r.builder)) && (!st.offer || r.offer === st.offer) && (!st.served || r.served) && (!q || `${r.addr} ${r.muni} ${r.zip} ${r.county}`.toLowerCase().includes(q)));
    f.setCount(`${fmt.num(cur.length)} / ${fmt.num(all.length)} leads`);
    const served = cur.filter(r => r.served);
    const addr = sum(cur, r => r.p_old25);
    root.querySelector('#mv-kpis').innerHTML = ui.kpis([
      { label: 'Leads (filtered)', value: fmt.num(cur.length), sub: `${fmt.num(cur.filter(r => r.score >= 75).length)} scored ≥75`, color: 'var(--c-pp)' },
      { label: 'In PP / Horvath footprint', value: fmt.num(served.length), sub: `${cur.length ? Math.round(served.length / cur.length * 100) : 0}% of filtered`, color: 'var(--green)' },
      { label: 'Avg sale price', value: fmt.money(avg(cur, r => r.price)), sub: `median ${fmt.money(median(cur.map(r => r.price)))}`, color: 'var(--accent)' },
      { label: 'Median days since sale', value: fmt.num(median(cur.map(r => r.days))), sub: `${fmt.num(cur.filter(r => r.days <= 60).length)} within 60 days`, color: 'var(--amber)' },
      { label: 'Addressable HVAC replacements', value: fmt.num(addr), sub: 'est. · homes >25 yrs (year built or zip older-stock share)', color: 'var(--red)' },
      { label: 'New-construction buyers', value: fmt.num(cur.filter(r => r.builder).length), sub: 'maintenance-plan offer', color: 'var(--green)' },
    ]);
    // map (cap 6000 most recent)
    const geoRows = cur.filter(r => r.lat != null); const byC = new Map(); for (const r of geoRows) { if (!byC.has(r.county)) byC.set(r.county, []); byC.get(r.county).push(r); }
    // cap ~6,000: most recent per county, proportional to county volume (keeps lagging NJ files on the map)
    const mp = geoRows.length <= 6000 ? geoRows.slice() : [...byC.values()].flatMap(L => L.sort((a, b) => b.sale_date.localeCompare(a.sale_date)).slice(0, Math.ceil(6000 * L.length / geoRows.length)));
    mp.sort((a, b) => a.score - b.score);
    if (pts) pts.remove();
    pts = maps.points(map, mp, { color: r => scoreHex(r.score), radius: r => r.score >= 75 ? 4 : 3, cluster: false, weight: 0, opacity: .8, popup: r => `<b>${esc(r.addr)}</b><br>${esc(r.muni)} ${esc(r.zip)} · ${esc(r.county)}, ${esc(r.state)}<br>Sold ${esc(dfull(fmt, r.sale_date))} · ${fmt.money(r.price)}<br>Score <b>${r.score}</b> · ${esc(r.offer)}`, onClick: openLead });
    if (!fitted || st.county) { if (mp.length) { pts.fit(); fitted = true; } }
    tbl ? tbl.update(cur) : (tbl = ui.table(root.querySelector('#mv-table'), { columns: tcols, rows: cur, pageSize: 25, sortKey: 'score', exportName: 'pp_new_mover_leads', onRow: openLead, rowKey: r => r.id }));
    drawCampaigns(); drawMonths();
  }

  function campaignRows(kind) { return cur.filter(r => r.offer === kind); }
  function drawCampaigns() {
    const C = [
      { k: 'Welcome tune-up', t: 'Welcome tune-up', d: 'Resale buyers in post-1980 stock: first-visit tune-up + membership enrollment inside 30 days of closing.', when: 'Mail at day 7–21 after sale' },
      { k: 'Safety inspection (pre-1980)', t: 'Panel & plumbing safety inspection', d: 'Pre-1980 homes (year built, else zip older-stock ≥70%): panel/aluminum-wiring, water-heater and sewer-line inspection; Mister Sparky + Ben Franklin cross-sell.', when: 'Mail at day 14; call top scores' },
      { k: 'Maintenance plan (new build)', t: 'New-construction maintenance plan', d: 'Builder sales and year-built ≥ sale year − 1: warranty-safe maintenance plan and IAQ/water-treatment add-ons.', when: 'Mail at day 30–60' },
    ];
    root.querySelector('#mv-camp').innerHTML = C.map(c => {
      const rows = campaignRows(c.k); const inF = rows.filter(r => r.served).length;
      return `<div class="pp-camp" style="--cc:${OFFER_C[c.k]}"><div class="top"><b>${esc(c.t)}</b><span class="big">${fmt.num(inF)}</span></div><div class="small text-2 mt-8">${esc(c.d)}</div><div class="meta">${fmt.chip(`${fmt.num(rows.length)} filtered · ${fmt.num(inF)} in footprint`)}${fmt.chip(`median ${fmt.money(median(rows.map(r => r.price)))}`)}${fmt.chip(`${fmt.num(inF * 0.02)}–${fmt.num(inF * 0.04)} responses (illustrative)`, 'var(--dim)')}<span class="small dim">${esc(c.when)}</span><button class="btn xs" data-camp="${esc(c.k)}" style="margin-left:auto">⇩ list</button></div></div>`;
    }).join('');
    root.querySelectorAll('[data-camp]').forEach(b => b.onclick = () => exportMail(campaignRows(b.dataset.camp).filter(r => r.served), `pp_campaign_${b.dataset.camp.split(' ')[0].toLowerCase()}`));
  }
  function drawMonths() {
    const m = new Map(); for (const r of cur) { const k = r.sale_date.slice(0, 7); m.set(k, (m.get(k) || 0) + 1); }
    const ks = [...m.keys()].sort().slice(-13);
    root.querySelector('#mv-month').innerHTML = ks.length ? charts.bar(ks.map(k => ({ label: new Date(k + '-15T12:00:00').toLocaleDateString('en-US', { month: 'short' }) + " '" + k.slice(2, 4), value: m.get(k) })), { h: 150, color: PP, fmt: fmt.compact }) : ui.empty('No leads');
  }
  function exportMail(rows, name) {
    ui.exportCSV(rows.slice().sort((a, b) => b.score - a.score).map(r => ({ addr: r.addr, muni: r.muni, zip: r.zip, county: r.county, state: r.state, sale_date: r.sale_date, price: r.price, score: r.score, suggested_offer: r.offer, addressee: r.buyer || 'Current Resident' })), ['addr', 'muni', 'zip', 'county', 'state', 'sale_date', 'price', 'score', 'suggested_offer', 'addressee'].map(key => ({ key })), name);
  }
  root.querySelector('#mv-mail').onclick = () => exportMail(cur, 'pp_mailing_list');

  function openLead(r) {
    const next = r.builder ? 'Enroll in the new-construction maintenance-plan mailer (day 30–60); flag builder community for a group offer.' : r.pre1980 ? 'Send the safety-inspection mailer (panel, water heater, sewer line) at day 14; if score ≥75 add to outbound call list.' : 'Send the welcome tune-up + membership mailer at day 7–21.';
    inspector.open({
      title: esc(r.addr), sub: `${esc(r.muni)} ${esc(r.zip)}${r.zip_inferred ? ' (zip inferred)' : ''} · ${esc(r.county)}, ${esc(r.state)}`, color: scoreHex(r.score),
      sections: [
        { label: `Lead score · ${r.score}`, html: ctx.charts.hbar(Object.entries(r.parts).map(([k, v]) => ({ label: k, value: v })), { max: 35, fmt: v => v, labelW: 90, color: PP }) },
        { label: 'Sale', html: ui.kv({ 'Sale date': esc(dfull(fmt, r.sale_date)), 'Days since': fmt.num(r.days), Price: fmt.moneyFull(r.price), 'Year built': r.year_built || '—', 'Living area': r.sqft ? `${fmt.num(r.sqft)} sq ft` : null, Buyer: r.buyer ? esc(r.buyer) : '<span class="dim">not published</span>', Type: r.builder ? 'Builder / new construction' : 'Resale' }) },
        { label: 'Zip context', html: ui.kv({ Footprint: statusChip(fmt, r.status), 'Zip priority tier': r.zip_tier ? tierChip(esc, r.zip_tier) : '—', 'Older-stock share': pctTxt(r.old_share) }) },
        { label: 'Suggested offer', html: fmt.chip(r.offer, OFFER_C[r.offer]) },
        { label: 'Next action', html: `<div class="small text-2">${esc(next)}</div>` },
        { label: 'Source', html: `<div class="small">${r.src_url ? fmt.link(r.src_url, r.src) : esc(r.src)}</div>` },
      ],
      actions: [{ id: 'z', label: 'Open zip', onClick: () => r.zip && app.go('pp', 'territory', { zip: r.zip }) }],
    });
  }

  // coverage table (all served + adjacent counties, plus any served county with no records)
  const cyear = new Date();
  const covRows = [...LD.cov.values()].map(c => {
    const m = LD.covMeta.get(`${c.county}|${c.state}`); const lag = c.last ? Math.floor((cyear - Date.parse(noon(c.last))) / dayMs) : null;
    const foot = CORE.includes(c.county) && c.state === 'PA' ? 'PP core' : NJ_H.includes(c.county) && c.state === 'NJ' ? 'Horvath NJ' : 'Adjacent';
    const status = (c.raw - c.legacyRaw) < 500 && foot !== 'Adjacent' ? 'partial' : lag != null && lag > 150 ? 'stale' : lag != null && lag > 60 ? 'lagging' : 'current';
    return { county: c.county, state: c.state, foot, raw: c.raw, leads: c.leads, legacy: c.legacy, first: c.first, last: c.last, lag, status, source: m?.source || [...c.sources][0] || '', url: m?.source_url || [...c.urls][0] || null };
  });
  for (const cn of [...CORE.map(c => [c, 'PA']), ...NJ_H.map(c => [c, 'NJ'])]) if (!covRows.some(r => r.county === cn[0] && r.state === cn[1])) covRows.push({ county: cn[0], state: cn[1], foot: cn[1] === 'NJ' ? 'Horvath NJ' : 'PP core', raw: 0, leads: 0, status: 'missing', source: 'no file', url: null });
  const stC = { current: 'var(--green)', lagging: 'var(--amber)', stale: 'var(--red)', partial: 'var(--red)', missing: 'var(--red)' };
  const fo = { 'PP core': 0, 'Horvath NJ': 1, Adjacent: 2 };
  covRows.sort((a, b) => fo[a.foot] - fo[b.foot] || b.leads - a.leads);
  const gaps = covRows.filter(r => r.foot !== 'Adjacent' && r.status !== 'current');
  root.querySelector('#mv-cov').innerHTML = `${gaps.length ? ui.note(`<b>Coverage gaps in served counties:</b> ${gaps.map(g => `${esc(g.county)} (${esc(g.status)}${g.last ? `, latest ${esc(dfull(fmt, g.last))}` : ''})`).join(' · ')}. Dauphin is partly back-filled by the legacy 90-day deed layer; next pulls: Dauphin Recorder of Deeds bulk export or a licensed feed (ATTOM/CoreLogic), Franklin CAMA refresh, NJ SR1A monthly refresh.`, 'warn') : ''}<div id="mv-cov-t" class="mt-8 pp-cov"></div>`;
  ui.table(root.querySelector('#mv-cov-t'), {
    columns: [
      { key: 'county', label: 'County', fmt: (v, r) => `<b>${esc(v)}</b> <span class="dim">${esc(r.state)}</span>` },
      { key: 'foot', label: 'Footprint', fmt: v => fmt.chip(v, v === 'PP core' ? 'var(--c-pp)' : v === 'Horvath NJ' ? 'var(--amber)' : 'var(--accent)') },
      { key: 'raw', label: 'Records', num: true, fmt: v => fmt.num(v) },
      { key: 'leads', label: 'Home-sale leads', num: true, fmt: (v, r) => `${fmt.num(v)}${r.legacy ? `<div class="dim small">${fmt.num(r.legacy)} from 90d layer</div>` : ''}` },
      { key: 'last', label: 'Window', num: true, fmt: (v, r) => r.first ? `${esc(dfull(fmt, r.first))} → ${esc(dfull(fmt, v))}` : '—' },
      { key: 'lag', label: 'Lag (d)', num: true, sort: (a, b) => (a.lag ?? -1) - (b.lag ?? -1), fmt: v => v == null ? '—' : fmt.num(v) },
      { key: 'status', label: 'Status', fmt: v => fmt.chip(v, stC[v]) },
      { key: 'source', label: 'Source', wrap: true, fmt: (v, r) => `<span class="small">${r.url ? fmt.link(r.url, String(v).slice(0, 60)) : esc(String(v).slice(0, 60))}</span>` },
    ], rows: covRows, pageSize: 20, exportName: 'pp_sales_coverage', rowKey: r => r.county + r.state,
    onRow: r => { const s = root.querySelector('#mv-filters select[data-k="county"]'); if (s && counties.includes(r.county)) { s.value = r.county; s.onchange(); } },
  });

  apply(f.state);
  app.index(counties.map(c => ({ label: `New movers · ${c}`, sub: 'Punctual Pros lead list', href: `#/pp/movers?county=${encodeURIComponent(c)}`, kind: 'Lead list', color: PP })));
  return () => map.remove();
}

/* ═══ 4. TERRITORY & EXPANSION ═══════════════════════════════════════════ */
async function territory(ctx) {
  const { el, ui, fmt, data, maps, charts, esc, app, params } = ctx; css();
  const [Z, meta] = await Promise.all([loadZips(data), data.load('pp_meta').catch(() => null)]);
  const zips = Z.zips;
  const terr = zips.filter(z => z._status === 'territory'), adj = zips.filter(z => z._status === 'adjacent'), horv = zips.filter(z => z._status === 'horvath');
  const exp = zips.filter(z => !z._served && z.practical_priority_tier === 'Tier I');
  const adjT1 = adj.filter(z => z.practical_priority_tier === 'Tier I');
  // clusters: county groups of non-footprint Tier-I zips
  const cm = new Map(); for (const z of exp) { const k = `${z._county}|${z.state}`; if (!cm.has(k)) cm.set(k, { county: z._county, state: z.state, rows: [] }); cm.get(k).rows.push(z); }
  const nodes = [HQ, HORVATH, ...FALLBACK_HUBS.filter(h => ['Harrisburg', 'York', 'Reading', 'Chambersburg'].includes(h.name))];
  const clusters = [...cm.values()].map(c => ({ ...c, n: c.rows.length, hu: sum(c.rows, z => z.housing_units), score: avg(c.rows, z => z.practical_priority_score), adjShare: c.rows.filter(z => z._status === 'adjacent').length / c.rows.length, moves: sum(c.rows, z => z.recent_owner_moves), lat: avg(c.rows, z => z.lat), lon: avg(c.rows, z => z.lon) }))
    .map(c => { c.mi = Math.min(...nodes.map(n => miles(c.lat, c.lon, n.lat, n.lon))); c.rank = c.hu / 1e3 * (c.score / 100) * (0.4 + 0.6 * c.adjShare) * Math.max(0.02, 1 - c.mi / 80) ** 2; return c; }).sort((a, b) => b.rank - a.rank);
  const topC = clusters.slice(0, 10);
  const w = meta?.weights || {};
  const counties = [...new Set(zips.map(z => z._county))].sort();
  const initCounty = params.county && counties.includes(params.county) ? params.county : '';
  el.innerHTML = `<div class="m-pp">${ui.pageHead({
    title: 'Territory & expansion',
    sub: `<b>So what:</b> ${adjT1.length} Tier-I (“Go now”) zips with ${fmt.compact(sum(adjT1, z => z.housing_units))} housing units sit directly on the edge of today’s ${terr.length}-zip footprint; ${esc(topC[0] ? `${topC[0].county} ${topC[0].state}` : '')}${topC[1] ? ` and ${esc(topC[1].county)} ${esc(topC[1].state)}` : ''} are the densest clusters to extend routes into before a tuck-in is needed.`,
    chips: `${fmt.chip(`${fmt.num(zips.length)} zips scored`, 'var(--c-pp)')}${fmt.chip(`radius ${meta?.radius_km || 20} km peer clusters`)}${fmt.chip(`model ${meta?.version || 'v6'}`)}`,
  })}
  ${ui.kpis([
    { label: 'PP core zips', value: fmt.num(terr.length), sub: `${fmt.compact(sum(terr, z => z.housing_units))} housing units`, color: 'var(--c-pp)' },
    { label: 'Horvath NJ zips', value: fmt.num(horv.length), sub: `${fmt.compact(sum(horv, z => z.housing_units))} units · Ocean + Monmouth`, color: 'var(--amber)' },
    { label: 'Adjacent ring', value: fmt.num(adj.length), sub: `${fmt.num(adjT1.length)} Tier I · ${fmt.num(adj.filter(z => z.practical_priority_tier === 'Tier II').length)} Tier II`, color: 'var(--accent)' },
    { label: 'Tier-I units next door', value: fmt.compact(sum(adjT1, z => z.housing_units)), sub: 'adjacent Tier-I housing units', color: 'var(--green)' },
    { label: 'Tier-I zips beyond ring', value: fmt.num(exp.length - adjT1.length), sub: 'need a tuck-in or new hub', color: 'var(--purple)' },
    { label: 'Avg core priority', value: fmt.num(avg(terr, z => z.practical_priority_score), 0), sub: `vs ${fmt.num(avg(adjT1, z => z.practical_priority_score), 0)} adjacent Tier I`, color: 'var(--c-pp)' },
  ])}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Priority map', sub: 'Non-footprint zips colored by practical priority tier · footprint in orange/amber · click for reasons', body: `<div class="map tall" id="tr-map" style="min-height:640px"></div>`, flush: true, foot: ui.source('pp_zips v6 · ACS 5-yr · analyst scoring', SRC.acs, meta?.sales_layer?.window_end) })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Top expansion clusters', sub: 'Tier-I zips outside the footprint by county · ranked by units × score × adjacency × proximity to a PP hub · click to zoom', body: `<div class="tbl-wrap"><table class="tbl" id="tr-clu"><thead><tr><th>Cluster</th><th class="num">Tier-I zips</th><th class="num">Units</th><th class="num">Adjacent</th><th class="num">Mi to hub</th><th class="num">Score</th></tr></thead><tbody>${topC.map((c, i) => `<tr data-i="${i}"><td><b>${esc(c.county)}</b> <span class="dim">${esc(c.state)}</span></td><td class="num">${c.n}</td><td class="num">${fmt.compact(c.hu)}</td><td class="num">${pctTxt(c.adjShare)}</td><td class="num">${fmt.num(c.mi)}</td><td class="num">${fmt.num(c.score, 0)}</td></tr>`).join('')}</tbody></table></div>`, foot: ui.source('pp_zips practical_priority_tier', null, meta?.version) })}
      ${ui.panel({ title: 'Tier-I housing units by county (outside footprint)', body: charts.hbar(clusters.slice(0, 12).map(c => ({ label: `${c.county} ${c.state}`, value: c.hu, color: c.adjShare >= .5 ? '#2ecc8f' : '#4c8dff' })), { fmt: fmt.compact, labelW: 120 }) + `<div class="pp-legend"><span><i style="background:#2ecc8f"></i>mostly adjacent ring</span><span><i style="background:#4c8dff"></i>beyond ring</span></div>` })}
    </div>
  </div>
  <div class="mt-12">${ui.note(`<b>Scoring weights (pp_meta ${esc(meta?.version || '')}):</b> ${Object.entries(w).map(([k, v]) => `${esc(k.replace(/_/g, ' '))} ${Math.round(v * 100)}%`).join(' · ') || 'n/a'}. Practical priority tiers: Tier I “Go now”, Tier II “Build”, Tier III “Monitor”. Sales-layer blend: ${Object.entries(meta?.sales_layer?.blended_weights || {}).map(([k, v]) => `${esc(k.replace(/_/g, ' '))} ${Math.round(v * 100)}%`).join(' · ')} (90-day window ${esc(meta?.sales_layer?.window_start || '')} → ${esc(meta?.sales_layer?.window_end || '')}). Peer clusters within ${meta?.radius_km || 20} km.`, 'brand')}</div>
  <div class="mt-12">${ui.panel({ title: 'Zip table', sub: 'All scored zips · filter by footprint, tier, state, county', body: '<div id="tr-f"></div><div id="tr-t"></div>', foot: ui.source('pp_zips v6', SRC.acs, meta?.sales_layer?.window_end) })}</div>
  </div>`;
  const root = el.querySelector('.m-pp');
  const map = maps.create(root.querySelector('#tr-map'), { center: [40.1, -76.3], zoom: 7 });
  const pop = z => `<b>${esc(z.zip)} · ${esc(z.city)}</b><br>${esc(z.county)}, ${esc(z.state)}<br>${esc(STATUS[z._status].label)} · ${esc(z.practical_priority_tier)} ${Math.round(z.practical_priority_score)}<br><span class="muted">${fmt.num(z.housing_units)} units</span>`;
  const rad = z => Math.max(2.5, Math.min(8, Math.sqrt(z.housing_units || 0) / 14));
  const others = zips.filter(z => !z._served);
  maps.points(map, others.filter(z => z.practical_priority_tier !== 'Tier I'), { color: z => TIER_HEX[z.practical_priority_tier] || '#5b6b7f', radius: z => rad(z) * .7, cluster: false, opacity: .22, weight: 0, popup: pop, onClick: z => openZip(ctx, z) });
  maps.points(map, exp, { color: '#2ecc8f', radius: rad, cluster: false, opacity: .8, popup: pop, onClick: z => openZip(ctx, z) });
  maps.points(map, [...terr, ...horv], { color: z => STATUS[z._status].hex, radius: rad, cluster: false, opacity: .9, popup: pop, onClick: z => openZip(ctx, z) });
  maps.marker(map, HQ.lat, HQ.lon, { color: '#ffffff', label: 'PP HQ' });
  maps.marker(map, HORVATH.lat, HORVATH.lon, { color: '#f5b73d', label: 'Horvath' });
  maps.fitPoints(map, [...terr, ...horv, ...adj].map(z => [z.lat, z.lon]), 9);
  maps.legend(map, [{ color: PP, label: 'PP core' }, { color: '#f5b73d', label: 'Horvath NJ' }, { color: '#2ecc8f', label: 'Tier I · Go now' }, { color: '#4c8dff', label: 'Tier II · Build' }, { color: '#5b6b7f', label: 'Tier III · Monitor' }], 'Practical priority');
  root.querySelectorAll('#tr-clu tbody tr').forEach(tr => tr.onclick = () => { const c = topC[+tr.dataset.i]; maps.fitPoints(map, c.rows.map(z => [z.lat, z.lon]), 10); const s = root.querySelector('#tr-f select[data-k="county"]'); if (s) { s.value = c.county; s.onchange(); } });

  const cols = [
    { key: 'zip', label: 'Zip', fmt: (v, r) => `<b class="num">${esc(v)}</b>` },
    { key: 'city', label: 'Place', fmt: (v, r) => `${esc(String(v || '—').replace(/ (city|borough|CDP|township|town|village)$/i, '') || '—')}<div class="dim small">${esc(r._county)}, ${esc(r.state)}</div>` },
    { key: '_status', label: 'Footprint', fmt: v => statusChip(fmt, v) },
    { key: 'practical_priority_tier', label: 'Tier', fmt: v => tierChip(esc, v) },
    { key: 'practical_priority_score', label: 'Priority', num: true, fmt: v => fmt.score(v) },
    { key: 'opportunity_score_v3', label: 'Opp. v3', num: true, fmt: v => fmt.num(v, 0) },
    { key: 'housing_units', label: 'Units', num: true, fmt: v => fmt.num(v) },
    { key: 'owner_occupancy_rate', label: 'Owner-occ.', num: true, fmt: v => pctTxt(v) },
    { key: 'old_housing_share', label: 'Older stock', num: true, fmt: v => pctTxt(v) },
    { key: 'recent_owner_moves', label: 'Owner moves', num: true, fmt: v => fmt.num(v) },
    { key: 'expansion_headwind', label: 'Headwind', wrap: true, fmt: v => `<span class="small ${v && !/^no major/.test(v) ? '' : 'dim'}">${esc(v || '')}</span>` },
  ];
  let tbl;
  const f = ui.filters(root.querySelector('#tr-f'), [
    { key: 'q', label: 'Search zip, place, county…', type: 'search', value: params.zip || '' },
    { key: 'st', label: 'Footprint', options: Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label })) },
    { key: 'tier', label: 'Tier', options: ['Tier I', 'Tier II', 'Tier III'] },
    { key: 'state', label: 'State', options: [...new Set(zips.map(z => z.state))].sort() },
    { key: 'county', label: 'County', options: counties, value: initCounty },
  ], st => {
    const q = (st.q || '').toLowerCase();
    const rows = zips.filter(z => (!st.st || z._status === st.st) && (!st.tier || z.practical_priority_tier === st.tier) && (!st.state || z.state === st.state) && (!st.county || z._county === st.county) && (!q || `${z.zip} ${z.city} ${z.county}`.toLowerCase().includes(q)));
    f.setCount(`${fmt.num(rows.length)} / ${fmt.num(zips.length)} zips`);
    tbl ? tbl.update(rows) : (tbl = ui.table(root.querySelector('#tr-t'), { columns: cols, rows, pageSize: 25, sortKey: 'practical_priority_score', exportName: 'pp_zip_scores', rowKey: r => r.zip, onRow: z => openZip(ctx, z) }));
    if (st.county) { const pts = rows.filter(z => fin(z.lat)).map(z => [z.lat, z.lon]); if (pts.length) maps.fitPoints(map, pts, 10); }
  });
  f.state.county = initCounty; f.state.q = params.zip || '';
  root.querySelector('#tr-f select[data-k="county"]').dispatchEvent(new Event('change'));
  if (params.zip && Z.byZip.get(params.zip)) { const z = Z.byZip.get(params.zip); openZip(ctx, z); map.setView([z.lat, z.lon], 11); }
  app.index(exp.slice().sort((a, b) => b.housing_units - a.housing_units).slice(0, 150).map(z => ({ label: `${z.zip} ${z.city}`, sub: `PP expansion · Tier I · ${z.county}`, href: `#/pp/territory?zip=${z.zip}`, kind: 'Zip', color: '#2ecc8f' })));
  return () => map.remove();
}

/* ═══ 5. MARKET & COMPETITORS ════════════════════════════════════════════ */
function cityGeocoder(Z, targets) {
  const m = new Map(); const norm = s => String(s || '').toLowerCase().replace(/\s+(city|borough|cdp|township|town|village|twp)$/i, '').replace(/[^a-z ]/g, '').trim();
  for (const z of Z.zips) { const k = `${norm(z.city)}|${z.state}`; if (!m.has(k) || (z.housing_units || 0) > m.get(k).hu) m.set(k, { lat: z.lat, lon: z.lon, hu: z.housing_units || 0 }); }
  for (const t of targets || []) if (fin(t.lat)) { const k = `${norm(t.hq_city)}|${t.state}`; if (!m.has(k)) m.set(k, { lat: t.lat, lon: t.lon, hu: 0 }); }
  return (city, state) => m.get(`${norm(city)}|${state}`) || null;
}

async function market(ctx) {
  const { el, ui, fmt, data, maps, esc, inspector, app } = ctx; css();
  const [mk, ma, Z] = await Promise.all([data.research('pp_market'), data.research('ma_targets_pp'), loadZips(data)]);
  const items = mk?.items || []; const K = k => items.filter(i => String(i.kind || '').toLowerCase() === k);
  const comps = K('competitor').map(c => ({ ...c })), fts = K('franchise_territory'), incs = K('incentive'), profs = K('county_profile'), sigs = K('market_signal');
  const mm = mk?.meta || {}; const mSrc = ui.source('pp_market (ZoomInfo, ACS 2024 5-yr, Census PEP/BPS, utility sites, press)', null, mm.generated);
  const pe = (ma?.meta?.pe_backed_competitors || []).filter(p => !/^Other/i.test(p.platform || ''));
  const peHigh = pe.filter(p => /^High/i.test(p.threat || ''));
  // competitors with no ownership tag: cross-reference PE platforms' regional holdings (e.g. Haller → HomeX)
  for (const c of comps) if (!c.ownership) { const nm = String(c.name || '').split(' (')[0].toLowerCase(); const p = nm && pe.find(p => (p.regional_holdings || []).some(h => String(h).toLowerCase().includes(nm))); if (p) { c.ownership = 'pe_backed'; c.parent_owner = c.parent_owner || `${p.platform} (per M&A screen)`; } }
  const geo = cityGeocoder(Z, ma?.items);
  // franchise sites: prefer pp_market; fall back to ma_targets_pp authority map
  const sites = fts.length ? fts.map(f => ({ brand: f.brand, name: f.name, city: f.city, state: f.state, address: f.address, owner: f.pp_affiliation || f.franchisee_name || '', aff: f.pp_affiliation_status || 'no_public_evidence', basis: f.pp_affiliation_basis, rating: f.location_rating, reviews: f.location_review_count, lat: num(f.lat), lon: num(f.lon), website: f.website, sources: f.source_urls || [f.source_url].filter(Boolean), note: f.note || f.rating_note }))
    : (ma?.meta?.authority_brands_territory_map || []).map(a => { const g = geo(a.city, a.state); return { brand: a.brand, name: a.location, city: a.city, state: a.state, address: a.address, owner: a.owner || '', aff: /owned/.test(a.owner_status) ? 'confirmed' : /inferred/.test(a.owner_status) ? 'likely' : 'no_public_evidence', basis: a.owner_status, lat: g?.lat ?? null, lon: g?.lon ?? null, sources: a.sources || [], note: a.note, target: (String(a.owner_status).match(/pp-t\d+/) || [])[0] || null }; });
  const AFF = { confirmed: ['PP confirmed', PP], yes: ['PP confirmed', PP], likely: ['PP likely', '#f5b73d'], possible: ['PP possible', '#c9a0ff'], no_public_evidence: ['Other franchisee', '#4c8dff'] };
  const affOf = s => AFF[s] || AFF.no_public_evidence;
  const ppSites = sites.filter(x => /confirmed|yes|likely/.test(x.aff));
  const OWN = { pe_backed: ['PE-backed', '#ff5c5c'], 'utility-affiliated': ['Utility', '#9d7bff'], independent: ['Independent', '#2ecc8f'] };
  const ownOf = o => OWN[o] || ['Unknown', '#8b98a8'];
  const core = profs.filter(p => /core/i.test(p.territory_role || ''));
  const oilHH = sum(core, p => p.oil_plus_propane_households);
  const activeInc = incs.filter(i => /^active/i.test(i.status || ''));
  const intens = Object.entries(mm.competitive_intensity_by_county || {}).map(([county, v]) => ({ county, ...v, pe_n: (v.pe_backed_competitors || []).length }));
  const thesis = Array.isArray(mm.expansion_thesis) ? mm.expansion_thesis.slice().sort((a, b) => (a.priority === 'watch') - (b.priority === 'watch') || (a.priority - b.priority)) : mm.expansion_thesis ? [{ priority: 1, move: String(mm.expansion_thesis) }] : [];
  const peComps = comps.filter(c => c.ownership === 'pe_backed');

  el.innerHTML = `<div class="m-pp">${ui.pageHead({
    title: 'Market & competitors',
    sub: `<b>So what:</b> ${!mk && !ma ? 'Market study (pp_market) and add-on screen (ma_targets_pp) are not yet available — competitor, franchise and PE views will populate when published.' : mk ? `PE capital is already inside the core (${esc(peComps.slice(0, 3).map(c => c.name.split(' (')[0]).join('; '))}), and ${peHigh.length} platforms rate a high threat. PP’s counter: densify the growth corridor, tuck in same-brand franchisees, and sell the ${fmt.compact(oilHH)} oil/propane-heated core households onto heat pumps while ${activeInc.length} incentive programs are live.` : `${peHigh.length} PE-backed platforms rate a high threat and are buying inside the core; Authority Brands franchisees nearby are same-playbook tuck-ins.`}`,
    chips: `${fmt.chip(`${comps.length || '—'} competitors tracked`, 'var(--accent)')}${fmt.chip(`${pe.length} PE platforms profiled`, 'var(--red)')}${fmt.chip(`${sites.length} Authority Brands sites`, 'var(--c-pp)')}${mm.generated ? fmt.chip(`pp_market ${mm.generated}`) : ''}`,
  })}
  ${mk ? '' : ui.note('<b>pp_market</b> (competitor census, franchise territories, incentives, county profiles, market signals) is not published yet — showing the Authority Brands territory map and PE landscape from the add-on screen.', 'warn')}
  ${ui.kpis([
    { label: 'Competitors tracked', value: comps.length ? fmt.num(comps.length) : '—', sub: comps.length ? `${peComps.length} PE-backed · ${comps.filter(c => c.ownership === 'utility-affiliated').length} utility · ${comps.filter(c => c.ownership === 'independent').length} indep.` : 'pending pp_market', color: 'var(--accent)' },
    { label: 'PE platforms (rival bidders)', value: ma ? fmt.num(pe.length) : '—', sub: ma ? `${peHigh.length} rated high threat to PP` : 'pending ma_targets_pp', color: 'var(--red)' },
    { label: 'Authority sites · PP', value: fmt.num(ppSites.length), sub: `confirmed + likely · of ${sites.length} Authority Brands sites`, color: 'var(--c-pp)' },
    { label: 'Oil + propane homes (core)', value: oilHH ? fmt.compact(oilHH) : '—', sub: 'heat-pump conversion pool · ACS', color: 'var(--amber)' },
    { label: 'Incentives live', value: incs.length ? fmt.num(activeInc.length) : '—', sub: incs.length ? `of ${incs.length} tracked · rest expired/pending` : 'pending pp_market', color: 'var(--green)' },
    { label: 'Market signals', value: sigs.length ? fmt.num(sigs.length) : '—', sub: sigs.length ? `latest ${esc(dfull(fmt, sigs.map(x => x.date).filter(Boolean).sort().pop()))}` : 'pending pp_market', color: 'var(--purple)' },
  ])}
  ${thesis.length ? `<div class="mt-12">${ui.panel({ title: 'Expansion thesis', sub: 'Ranked moves from the market study · evidence and named targets', accent: true, body: `<div class="pp-kgrid">${thesis.map(t => `<div class="pp-camp" style="--cc:${t.priority === 'watch' ? 'var(--dim)' : t.priority === 1 ? 'var(--c-pp)' : 'var(--accent)'}"><div class="top"><span class="chip solid" style="--cc:${t.priority === 'watch' ? '#8b98a8' : PP}">${t.priority === 'watch' ? 'WATCH' : '#' + esc(t.priority)}</span><b>${esc(t.move)}</b></div><div class="small text-2 mt-8">${esc(String(t.evidence || '').slice(0, 260))}${String(t.evidence || '').length > 260 ? '…' : ''}</div>${t.targets ? `<div class="small mt-8"><span class="dim">Targets:</span> ${esc(String(t.targets).slice(0, 200))}${String(t.targets).length > 200 ? '…' : ''}</div>` : ''}</div>`).join('')}</div>`, foot: mSrc })}</div>` : ''}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Competitor & franchise map', sub: 'Competitors by ownership (size = reviews) · Authority Brands sites by PP affiliation · click for detail', body: `<div class="map tall" id="mk-map"></div>`, flush: true, foot: mSrc })}
    ${intens.length ? ui.panel({ title: 'Competitive intensity by county', sub: 'Tracked competitors, PE presence and households per competitor', body: '<div id="mk-int"></div>', foot: mSrc }) : ui.panel({ title: 'PE-backed competitors', body: '<div id="mk-pe2"></div>' })}
  </div>
  ${comps.length ? `<div class="mt-12">${ui.panel({ title: 'Competitors', sub: 'Ownership: PE-backed red · utility purple · independent green · click for notes, sources and next action', body: '<div id="mk-comp"></div>', foot: mSrc })}</div>` : ''}
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'PE-backed platforms (rival bidders)', sub: 'Sponsor, regional holdings, threat to PP', body: '<div id="mk-pe"></div>', foot: ui.source('Sponsor press releases · roll-up trackers', null, ma?.meta?.generated) })}
    ${ui.panel({ title: 'Franchise territories — One Hour · Ben Franklin · Mister Sparky', sub: 'Which Authority Brands sites are PP/Horvath vs. other franchisees (tuck-in pool)', body: '<div id="mk-ft"></div>', foot: ui.source('Authority Brands location directories', 'https://www.onehourheatandair.com/locations/', mm.generated || ma?.meta?.generated) })}
  </div>
  ${profs.length ? `<div class="mt-12">${ui.panel({ title: 'County profiles · where the replacement and conversion demand is', sub: 'Shading is per column · oil/propane share = heat-pump conversion opportunity · pre-1980 share = replacement & safety demand · growth = new-build demand', body: '<div id="mk-prof"></div>', foot: ui.source('ACS 2020–2024 5-yr · Census PEP 2025 · Census BPS', SRC.acs, mm.generated) })}</div>` : ''}
  ${incs.length || sigs.length ? `<div class="grid grid-2 mt-12">
    ${incs.length ? ui.panel({ title: 'Incentives that fund the ticket', sub: 'Utility rebates and state/federal programs a tech can quote · check status before quoting', body: '<div id="mk-inc"></div>', foot: mSrc }) : ''}
    ${sigs.length ? ui.panel({ title: 'Market signals', sub: 'Dated events that move demand, labor or competition', body: '<div id="mk-sig"></div>', foot: mSrc }) : ''}
  </div>` : ''}
  ${(mm.caveats || []).length ? `<div class="mt-12">${ui.note(`<b>Caveats:</b> ${(mm.caveats || []).slice(0, 3).map(c => esc(c)).join(' ')}`, 'warn')}</div>` : ''}
  </div>`;
  const root = el.querySelector('.m-pp');

  // map
  const map = maps.create(root.querySelector('#mk-map'), { center: [40.0, -75.8], zoom: 7 });
  const sPts = sites.filter(x => fin(x.lat));
  maps.points(map, sPts, { color: x => affOf(x.aff)[1], radius: x => /confirmed|yes|likely/.test(x.aff) ? 8 : 6, cluster: false, opacity: .9, popup: x => `<b>${esc(x.name)}</b><br>${esc(x.city)}, ${esc(x.state)}<br><span class="muted">${esc(affOf(x.aff)[0])}${x.owner ? ' · ' + esc(x.owner) : ''}</span>`, onClick: openSite });
  const cPts = comps.filter(c => fin(num(c.lat)));
  maps.points(map, cPts, { color: c => ownOf(c.ownership)[1], radius: c => fin(num(c.review_count)) ? Math.max(4, Math.min(12, Math.sqrt(c.review_count) / 7)) : 4, cluster: false, opacity: .75, popup: c => `<b>${esc(c.name)}</b><br>${esc(c.hq)} · ${esc(ownOf(c.ownership)[0])}${c.parent_owner ? ' · ' + esc(c.parent_owner) : ''}<br><span class="muted">${c.review_count ? fmt.num(c.review_count) + ' reviews' : ''}</span>`, onClick: openComp });
  maps.marker(map, HQ.lat, HQ.lon, { color: '#ffffff', label: 'PP HQ' });
  maps.legend(map, [{ color: PP, label: 'Authority site · PP confirmed' }, { color: '#f5b73d', label: 'Authority site · PP likely' }, { color: '#4c8dff', label: 'Authority site · other franchisee' }, { color: '#ff5c5c', label: 'Competitor · PE-backed' }, { color: '#9d7bff', label: 'Competitor · utility' }, { color: '#2ecc8f', label: 'Competitor · independent' }], 'Ownership');
  maps.fitPoints(map, [...cPts.map(c => [c.lat, c.lon]), ...sPts.filter(x => ['PA', 'NJ'].includes(x.state)).map(x => [x.lat, x.lon])], 8);

  if (intens.length) ui.table(root.querySelector('#mk-int'), {
    columns: [
      { key: 'county', label: 'County', fmt: v => `<b>${esc(v)}</b>` },
      { key: 'intensity', label: 'Intensity', fmt: v => fmt.chip(v || '—', /high/i.test(v) ? 'var(--red)' : /medium|moderate/i.test(v) ? 'var(--amber)' : 'var(--green)') },
      { key: 'tracked_competitors', label: 'Tracked', num: true },
      { key: 'pe_n', label: 'PE-backed', num: true, fmt: v => v ? `<b style="color:var(--red)">${v}</b>` : '0' },
      { key: 'households_per_tracked_competitor', label: 'HH / comp.', num: true, fmt: v => fmt.compact(v) },
    ], rows: intens, pageSize: 15, sortKey: 'tracked_competitors', exportName: 'pp_competitive_intensity', rowKey: r => r.county,
    onRow: r => inspector.open({ title: `${esc(r.county)} · ${esc(r.intensity || '')} intensity`, sub: `${fmt.num(r.tracked_competitors)} tracked competitors · ${fmt.num(r.occupied_households)} occupied households`, color: 'var(--c-pp)', sections: [
      { label: 'PE-backed', html: (r.pe_backed_competitors || []).map(x => fmt.chip(x, 'var(--red)')).join(' ') || '<span class="dim small">none tracked</span>' },
      { label: 'Utility-affiliated', html: (r.utility_affiliated || []).map(x => fmt.chip(x, 'var(--purple)')).join(' ') || '<span class="dim small">none</span>' },
      { label: 'Largest tracked', html: `<div class="small text-2">${fmt.list(r.largest_tracked || [], 8)}</div>` },
      { label: 'Authority Brands sites', html: `<div class="small text-2">${fmt.list(r.authority_brands_sites || [], 8)}</div>` },
      { label: 'Read', html: `<div class="small text-2">${esc(r.rationale || '')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${r.pe_n ? 'Defend share: prioritize membership renewals and technician retention in this county; watch for PE roll-up of remaining independents.' : 'Offense: no PE consolidator present — best county for organic share gain and independent tuck-ins.'}</div>` },
    ] }),
  });
  if (comps.length) ui.table(root.querySelector('#mk-comp'), {
    columns: [
      { key: 'name', label: 'Competitor', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.hq || '')}</div>` },
      { key: 'ownership', label: 'Ownership', fmt: v => fmt.chip(ownOf(v)[0], ownOf(v)[1]) },
      { key: 'parent_owner', label: 'Parent / status', wrap: true, fmt: (v, r) => `<span class="small">${esc(String(v || r.ownership_status || '—').slice(0, 60))}</span>` },
      { key: 'trades', label: 'Trades', wrap: true, fmt: v => `<span class="small">${fmt.list(v || [], 3)}</span>` },
      { key: 'employees_est', label: 'Staff est.', num: true, fmt: v => v ? fmt.num(v) : '—' },
      { key: '_rev', label: 'Reviews', num: true, fmt: (v, r) => v >= 0 ? `${fmt.num(v)}${r.rating ? ` · ${r.rating}★` : ''}` : '—' },
      { key: 'territory_overlap', label: 'Overlap with PP', wrap: true, fmt: v => `<span class="small">${fmt.list(v || [], 4)}</span>` },
    ], rows: comps.map(c => ({ ...c, _rev: fin(num(c.review_count)) ? Number(c.review_count) : -1 })), pageSize: 15, sortKey: '_rev', exportName: 'pp_competitors', rowKey: r => r.name, onRow: openComp,
  });
  ui.table(root.querySelector('#mk-pe'), {
    columns: [
      { key: 'platform', label: 'Platform', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(String(r.sponsor || 'sponsor n/a').split(/[;(]/)[0])}</div>` },
      { key: 'threat', label: 'Threat', fmt: v => fmt.chip(String(v || '—').split(':')[0].split(' ')[0], /^High/i.test(v) ? 'var(--red)' : /^Medium/i.test(v) ? 'var(--amber)' : 'var(--muted)') },
      { key: 'regional_holdings', label: 'Regional holdings', wrap: true, fmt: v => `<span class="small text-2">${fmt.list(v || [], 2)}</span>` },
    ], rows: pe, pageSize: 8, exportName: 'pp_pe_competitors', rowKey: r => r.platform, onRow: openPE,
  });
  if (!intens.length && root.querySelector('#mk-pe2')) root.querySelector('#mk-pe2').innerHTML = ui.empty('See PE-backed platforms below');
  ui.table(root.querySelector('#mk-ft'), {
    columns: [
      { key: 'brand', label: 'Brand', fmt: v => fmt.chip(String(v).replace(/ Heating & Air Conditioning| Plumbing/, ''), /One Hour/.test(v) ? 'var(--accent)' : /Franklin/.test(v) ? 'var(--cyan)' : 'var(--amber)') },
      { key: 'city', label: 'Site', fmt: (v, r) => `<b>${esc(v)}, ${esc(r.state)}</b><div class="dim small">${esc(r.owner || 'franchisee not published')}</div>` },
      { key: 'aff', label: 'PP affiliation', fmt: v => fmt.chip(affOf(v)[0], affOf(v)[1]) },
      { key: 'reviews', label: 'Reviews', num: true, sort: (a, b) => (num(a.reviews) || -1) - (num(b.reviews) || -1), fmt: (v, r) => v ? `${fmt.num(v)}${r.rating ? ` · ${r.rating}★` : ''}` : '—' },
    ], rows: sites.slice().sort((a, b) => (/confirmed|yes/.test(b.aff) - /confirmed|yes/.test(a.aff)) || (/likely/.test(b.aff) - /likely/.test(a.aff)) || String(a.state).localeCompare(String(b.state))), pageSize: 10, exportName: 'pp_authority_territories', rowKey: r => r.name + r.brand, onRow: openSite,
  });
  if (profs.length) {
    const cols = [
      { k: 'housing_units', l: 'Housing units', f: v => fmt.compact(v) }, { k: 'share_built_pre1980', l: 'Pre-1980', f: pctTxt }, { k: 'median_year_built', l: 'Median built', f: v => v ?? '—', inv: true, noShade: false },
      { k: 'oil_plus_propane_share', l: 'Oil+propane', f: pctTxt }, { k: 'oil_plus_propane_households', l: 'Oil+propane HH', f: v => fmt.compact(v) }, { k: 'owner_occupied_share', l: 'Owner-occ.', f: pctTxt },
      { k: 'pop_growth_2020_2025', l: 'Pop. growth 20–25', f: v => fin(v) ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '—' }, { k: 'sf_permits_2025', l: 'SF permits 2025', f: v => fmt.num(v) }, { k: 'median_household_income', l: 'Median HH inc.', f: v => fmt.money(v) },
    ];
    const rng = Object.fromEntries(cols.map(c => { const v = profs.map(p => num(p[c.k])).filter(fin); return [c.k, [Math.min(...v), Math.max(...v)]]; }));
    const shade = (c, v) => { const [lo, hi] = rng[c.k]; if (!fin(v) || hi === lo) return ''; let a = (v - lo) / (hi - lo); if (c.inv) a = 1 - a; return `background:rgba(240,138,60,${(0.08 + a * 0.62).toFixed(2)});${a > .6 ? 'color:#0a0e14;' : ''}`; };
    const pr = profs.slice().sort((a, b) => (/core/i.test(b.territory_role) - /core/i.test(a.territory_role)) || (b.housing_units - a.housing_units));
    root.querySelector('#mk-prof').innerHTML = `<div class="tbl-wrap"><table class="tbl heat"><thead><tr><th style="text-align:left">County</th>${cols.map(c => `<th>${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${pr.map((p, i) => `<tr data-i="${i}"><td style="text-align:left;font-family:var(--font);white-space:nowrap"><b>${esc(String(p.name).replace(/ County/, ''))}</b><div class="dim small">${esc(String(p.territory_role || '').split(' (')[0])}</div></td>${cols.map(c => `<td style="${shade(c, num(p[c.k]))}">${c.f(p[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="pp-mini mt-8">Darker = more of the opportunity (for median year built, darker = older stock). Click a county for its heating-fuel mix.</div>`;
    root.querySelectorAll('#mk-prof tbody tr').forEach(tr => tr.onclick = () => { const p = pr[+tr.dataset.i]; const hf = p.heating_fuel_mix || {};
      inspector.open({ title: esc(p.name), sub: `${esc(p.territory_role || '')} · ${esc(p.acs_vintage || '')}`, color: 'var(--c-pp)', sections: [
        { label: 'Heating fuel mix', html: ctx.charts.hbar(Object.entries(hf).filter(([, v]) => v >= 0.001).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v * 100, color: /oil|propane/.test(k) ? '#f08a3c' : '#4c8dff' })), { max: 100, fmt: v => `${v.toFixed(1)}%`, labelW: 130 }) },
        { label: 'Housing & growth', html: ui.kv({ Population: fmt.num(p.population_acs), 'Housing units': fmt.num(p.housing_units), 'Median year built': p.median_year_built != null ? esc(p.median_year_built) : null, 'Built pre-1980': pctTxt(p.share_built_pre1980), 'Single-family detached': pctTxt(p.single_family_detached_share), 'Oil+propane households': fmt.num(p.oil_plus_propane_households), 'Pop. growth 2020–25': fin(num(p.pop_growth_2020_2025)) ? `${(p.pop_growth_2020_2025 * 100).toFixed(1)}%` : '—', 'SF permits 2024 / 2025': `${fmt.num(p.sf_permits_2024)} / ${fmt.num(p.sf_permits_2025)}`, 'Median HH income': fmt.moneyFull(p.median_household_income) }) },
        { label: 'Notes', html: `<div class="small text-2">${esc(p.notes || '')}</div>` },
        { label: 'Next action', html: `<div class="small text-2">${p.oil_plus_propane_share >= 0.25 ? `Launch a heat-pump / hybrid conversion campaign to ~${fmt.compact(p.oil_plus_propane_households)} oil and propane households, stacked with live utility rebates.` : p.share_built_pre1980 >= 0.55 ? 'Lead with panel, water-heater and sewer-line safety inspections for pre-1980 stock.' : 'Lean on new-construction maintenance plans and new-mover welcome offers.'}</div>` },
        { label: 'Sources', html: `<div class="small col gap-4">${(p.source_urls || [p.source_url]).filter(Boolean).slice(0, 5).map(u => fmt.link(u)).join('')}</div>` },
      ] }); });
  }
  if (incs.length) ui.table(root.querySelector('#mk-inc'), {
    columns: [
      { key: 'name', label: 'Program', wrap: true, fmt: (v, r) => `<b class="small">${esc(v)}</b><div class="dim small">${esc(r.sponsor || '')} · ${esc(r.state || '')}</div>` },
      { key: 'amount_max', label: 'Amount', num: true, fmt: (v, r) => fin(num(v)) ? (r.amount_min != null && r.amount_min !== v ? `${fmt.money(r.amount_min)}–${fmt.money(v)}` : fmt.money(v)) : `<span class="small">${esc(String(r.amount_usd || '—').slice(0, 24))}</span>` },
      { key: 'status', label: 'Status', fmt: v => fmt.chip(String(v || '—').split(/[ (-]/)[0], /^active/i.test(v) ? 'var(--green)' : /expired|lapsed/i.test(v) ? 'var(--red)' : 'var(--amber)') },
    ], rows: incs.slice().sort((a, b) => /^active/i.test(b.status) - /^active/i.test(a.status)), pageSize: 8, exportName: 'pp_incentives', rowKey: r => r.name,
    onRow: r => inspector.open({ title: esc(r.name), sub: `${esc(r.sponsor || '')} · ${esc(r.state || '')}`, color: /^active/i.test(r.status) ? 'var(--green)' : 'var(--amber)', sections: [
      { label: 'Program', html: ui.kv({ Measure: esc(r.measure || ''), Amount: esc(r.amount_usd ?? ''), Eligibility: esc(r.eligibility || ''), Status: esc(r.status || ''), Dates: esc(r.dates || ''), Counties: r.counties_affected || [] }) },
      { label: 'Notes', html: `<div class="small text-2">${esc(r.notes || '')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${/^active/i.test(r.status) ? 'Load into the ServiceTitan pricebook as a financing/rebate line and train CSRs to quote it on replacement calls.' : 'Do not quote; monitor for relaunch and remove from marketing copy.'}</div>` },
      { label: 'Source', html: `<div class="small col gap-4">${(r.source_urls || [r.source_url]).filter(Boolean).map(u => fmt.link(u)).join('')}</div>` },
    ], actions: r.source_url ? [{ label: 'Program page ↗', href: r.source_url }] : [] }),
  });
  if (sigs.length) ui.table(root.querySelector('#mk-sig'), {
    columns: [
      { key: 'date', label: 'Date', num: true, sort: (a, b) => String(a.date || '0000').localeCompare(String(b.date || '0000')), fmt: v => esc(dfull(fmt, v)) },
      { key: 'category', label: 'Category', fmt: v => fmt.chip(v || '—', /labor/.test(v) ? 'var(--purple)' : /housing/.test(v) ? 'var(--green)' : /energy|utility/.test(v) ? 'var(--amber)' : /PE|consolid/.test(v) ? 'var(--red)' : 'var(--accent)') },
      { key: 'name', label: 'Signal', wrap: true, fmt: (v, r) => `<b class="small">${esc(v)}</b><div class="dim small">${esc(r.geography || '')}</div>` },
    ], rows: sigs, pageSize: 8, sortKey: 'date', exportName: 'pp_market_signals', rowKey: r => r.name,
    onRow: r => inspector.open({ title: esc(r.name), sub: `${esc(dfull(fmt, r.date))} · ${esc(r.geography || '')} · ${esc(r.category || '')}`, color: 'var(--purple)', sections: [
      { label: 'Detail', html: `<div class="small text-2">${esc(r.detail || '')}</div>` },
      r.wage_median_hvac ? { label: 'Median wages', html: ui.kv({ HVAC: fmt.moneyFull(r.wage_median_hvac), Plumber: fmt.moneyFull(r.wage_median_plumber), Electrician: fmt.moneyFull(r.wage_median_electrician) }) } : null,
      { label: 'Implication for PP', html: `<div class="small text-2">${esc(r.implication || '')}</div>` },
      { label: 'Source', html: `<div class="small col gap-4">${(r.source_urls || [r.source_url]).filter(Boolean).map(u => fmt.link(u)).join('')}</div>` },
    ].filter(Boolean) }),
  });

  function openSite(x) {
    inspector.open({ title: esc(x.name), sub: `${esc(x.brand)} · ${esc(x.city)}, ${esc(x.state)}`, color: affOf(x.aff)[1], sections: [
      { label: 'Affiliation', html: `${fmt.chip(affOf(x.aff)[0], affOf(x.aff)[1])}<div class="small text-2 mt-8">${esc(x.basis || '')}</div>` },
      { label: 'Site', html: ui.kv({ Address: esc(x.address || ''), Owner: esc(x.owner || 'not published'), Reviews: x.reviews ? `${fmt.num(x.reviews)} · ${x.rating || ''}★` : null, Website: x.website ? fmt.link(x.website) : null, Note: x.note ? esc(x.note) : null }) },
      { label: 'Next action', html: `<div class="small text-2">${/confirmed|yes/.test(x.aff) ? 'PP site: benchmark review velocity and membership penetration against neighbouring franchisees.' : /likely|possible/.test(x.aff) ? 'Verify ownership (state business filings, FDD franchisee list) before counting it in the PP footprint.' : 'Tuck-in pool: identify the franchisee, confirm Authority Brands transfer path, add to the target screen.'}</div>` },
      { label: 'Sources', html: `<div class="small col gap-4">${(x.sources || []).map(s => fmt.link(s)).join('') || '—'}</div>` },
    ], actions: [{ id: 'tg', label: 'Open add-on targets', onClick: () => app.go('pp', 'targets') }] });
  }
  function openComp(c) {
    inspector.open({ title: esc(c.name), sub: `${esc(c.hq || '')} · ${esc(ownOf(c.ownership)[0])}`, color: ownOf(c.ownership)[1], sections: [
      { label: 'Profile', html: ui.kv({ Ownership: esc(ownOf(c.ownership)[0]), 'Parent / status': esc(c.parent_owner || c.ownership_status || '—'), Founded: c.founded != null ? esc(c.founded) : null, Trades: c.trades || [], 'Employees (est.)': c.employees_est ? `${fmt.num(c.employees_est)} <span class="dim small">${esc(c.employees_source || '')}</span>` : null, Reviews: c.review_count ? `${fmt.num(c.review_count)} · ${c.rating || ''}★ <span class="dim small">${esc(c.review_source || '')}</span>` : null, 'Overlap with PP': c.territory_overlap || [], Website: c.website ? fmt.link(c.website) : null }) },
      { label: 'Notes', html: `<div class="small text-2">${esc(c.notes || '')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${c.ownership === 'pe_backed' ? 'Defend: map overlapping zips, protect memberships and technicians there; expect aggressive hiring offers.' : c.ownership === 'utility-affiliated' ? 'Partner or flank: utility-affiliated shops win on bill-pay access; compete on speed and brand guarantees.' : 'Assess as tuck-in (family/founder ownership, reviews, trade mix) before a PE platform does.'}</div>` },
      { label: 'Sources', html: `<div class="small col gap-4">${(c.source_urls || [c.source_url]).filter(Boolean).map(u => fmt.link(u)).join('')}</div><div class="dim small mt-8">Retrieved ${esc(c.retrieved || '')}</div>` },
    ], actions: c.website ? [{ label: 'Website ↗', href: c.website }] : [] });
  }
  function openPE(p) {
    inspector.open({ title: esc(p.platform), sub: `${esc(p.hq || 'HQ n/a')} · ${esc(String(p.sponsor || 'sponsor n/a').split(';')[0])}`, color: /^High/i.test(p.threat || '') ? 'var(--red)' : 'var(--amber)', sections: [
      { label: 'Threat to PP', html: `<div class="small text-2">${esc(p.threat || '—')}</div>` },
      { label: 'Sponsor', html: `<div class="small text-2">${esc(p.sponsor || '—')}</div>` },
      { label: 'Footprint', html: `<div class="small text-2">${esc(p.footprint || '—')}</div>` },
      { label: 'Regional holdings', html: `<ul class="prose small">${(p.regional_holdings || []).map(h => `<li>${esc(h)}</li>`).join('') || '<li>—</li>'}</ul>` },
      { label: 'Next action', html: `<div class="small text-2">${/^High/i.test(p.threat || '') ? 'Defend: lock key technicians, accelerate membership renewals in overlapping zips, and move first on independents they are courting.' : 'Track deal flow; expect them as rival bidders on targets in the screen.'}</div>` },
      { label: 'Sources', html: `<div class="small col gap-4">${(p.sources || []).map(s => fmt.link(s)).join('') || '—'}</div>` },
    ] });
  }
  app.index([...comps.map(c => ({ label: c.name, sub: `PP competitor · ${ownOf(c.ownership)[0]} · ${c.hq || ''}`, href: '#/pp/market', kind: 'Competitor', color: ownOf(c.ownership)[1] })), ...pe.map(p => ({ label: p.platform, sub: `PE platform · ${p.threat || ''}`, href: '#/pp/market', kind: 'Competitor', color: 'var(--red)' }))].slice(0, 120));
  return () => map.remove();
}

/* ═══ 6. ADD-ON TARGETS ═════════════════════════════════════════════════ */
async function targets(ctx) {
  const { el, ui, fmt, data, maps, esc, inspector, app } = ctx; css();
  const ma = await data.research('ma_targets_pp');
  if (!ma) { el.innerHTML = `<div class="m-pp">${ui.pageHead({ title: 'Add-on targets', sub: 'Punctual Pros tuck-in screen' })}${ui.note('Research dataset not yet available (ma_targets_pp).', 'warn')}</div>`; return; }
  const items = ma.items || []; const m = ma.meta || {};
  const top = m.ranked_top_10 || []; const byId = new Map(items.map(t => [t.id, t]));
  const t1 = items.filter(t => t.fit_score >= 80), near = items.filter(t => t.distance_mi_from_lancaster <= 60 || t.distance_mi_from_toms_river <= 40);
  const fam = items.filter(t => /family|founder/.test(t.ownership || ''));
  const franchisees = items.filter(t => /franchisee/.test(t.ownership || ''));
  el.innerHTML = `<div class="m-pp">${ui.pageHead({
    title: 'Add-on targets',
    sub: `<b>So what:</b> ${t1.length} of ${items.length} screened companies score Tier 1 (≥80). ${top[0] ? `${esc(top[0].company)} (fit ${top[0].fit_score}) is the highest-density tuck-in; ` : ''}${franchisees.length} Authority Brands franchisees can fold in with no rebrand, and ${fam.length} family/founder-owned independents are the succession pipeline.`,
    chips: `${fmt.chip(`${items.length} companies`, 'var(--c-pp)')}${fmt.chip(`PA ${items.filter(t => t.state === 'PA').length} · NJ ${items.filter(t => t.state === 'NJ').length} · MD ${items.filter(t => t.state === 'MD').length} · DE ${items.filter(t => t.state === 'DE').length}`)}${fmt.chip(`screened ${m.generated || ''}`)}`,
  })}
  ${ui.kpis([
    { label: 'Targets screened', value: fmt.num(items.length), sub: `${fmt.num(m.excluded_pe_or_strategic_owned?.length || 0)} PE/strategic-owned excluded`, color: 'var(--c-pp)' },
    { label: 'Tier 1 (fit ≥80)', value: fmt.num(t1.length), sub: `${fmt.num(items.filter(t => t.fit_score >= 65 && t.fit_score < 80).length)} Tier 2`, color: 'var(--green)' },
    { label: 'Within route reach', value: fmt.num(near.length), sub: '≤60 mi Lancaster or ≤40 mi Toms River', color: 'var(--accent)' },
    { label: 'Authority franchisees', value: fmt.num(franchisees.length), sub: 'same brands · no rebrand', color: 'var(--c-pp)' },
    { label: 'Family / founder-owned', value: fmt.num(fam.length), sub: 'succession-driven sellers', color: 'var(--amber)' },
    { label: 'Median distance · Lancaster', value: `${fmt.num(median(items.map(t => t.distance_mi_from_lancaster)))} mi`, sub: 'straight-line, city centroids', color: 'var(--dim)' },
  ])}
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Ranked top 10', sub: 'Analyst ranking · click for profile', body: `<div class="pp-top10">${top.map(t => `<div class="r" data-id="${esc(t.id)}"><span class="rk">#${t.rank}</span><div class="grow"><b class="small">${esc(t.company)}</b><div class="small text-2">${esc(String(t.why || '').slice(0, 170))}</div></div>${fmt.score(t.fit_score)}</div>`).join('') || ui.empty('No ranking')}</div>`, scroll: true, foot: ui.source('ma_targets_pp ranked_top_10', null, m.generated) })}
    ${ui.panel({ title: 'Target map', sub: 'Fit tier · Tier 1 green · Tier 2 blue · Tier 3+ amber', body: `<div class="map tall" id="tg-map" style="min-height:520px"></div>`, flush: true, foot: ui.source('ZoomInfo search · company sites · Authority directories', null, m.generated) })}
    ${ui.panel({ title: 'PE-backed competitors (rival bidders)', sub: 'Who else is buying in PA / NJ / MD / DE', body: `<div class="col gap-8">${(m.pe_backed_competitors || []).filter(p => !/^Other/i.test(p.platform)).map(p => `<div class="row" style="align-items:flex-start"><span class="chip" style="--cc:${/^High/i.test(p.threat || '') ? 'var(--red)' : /^Medium/i.test(p.threat || '') ? 'var(--amber)' : 'var(--muted)'};flex-shrink:0">${esc(String(p.threat || '—').split(':')[0].split(' ')[0])}</span><div class="grow"><b class="small">${esc(p.platform)}</b><div class="small text-2">${esc(String(p.sponsor || 'sponsor n/a').split(/[;(]/)[0])}${p.regional_holdings?.length ? ` · ${esc(p.regional_holdings.slice(0, 2).join(', '))}` : ''}</div></div></div>`).join('')}</div>`, scroll: true, foot: ui.source('Sponsor press releases · roll-up trackers', null, m.generated) })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Target screen', sub: `Fit rubric: ${esc(Object.keys(m.scoring_rubric || {}).map(k => k.replace(/_/g, ' ')).join(' · '))} (20 pts each)`, body: '<div id="tg-screen"></div>', foot: ui.source('ma_targets_pp', null, m.generated) })}</div>
  ${(m.caveats || []).length ? `<div class="mt-12">${ui.note(`<b>Caveats:</b> ${(m.caveats || []).slice(0, 3).map(c => esc(c)).join(' ')}`, 'warn')}</div>` : ''}
  </div>`;
  const root = el.querySelector('.m-pp');
  renderTargets(ctx, root.querySelector('#tg-screen'), {
    items, color: 'var(--c-pp)', platformLabel: 'Punctual Pros', exportName: 'pp_addon_targets', pageSize: 25,
    extraColumns: [
      { key: 'distance_mi_from_lancaster', label: 'Mi (Lanc / TR)', num: true, fmt: (v, r) => `${v == null ? '—' : fmt.num(v)}<span class="dim"> / ${r.distance_mi_from_toms_river == null ? '—' : fmt.num(r.distance_mi_from_toms_river)}</span>` },
      { key: 'review_count', label: 'Reviews', num: true, fmt: (v, r) => v ? `${fmt.num(v)}${r.review_rating ? ` · ${esc(r.review_rating)}★` : ''}` : '<span class="dim">—</span>' },
    ],
  });
  const map = maps.create(root.querySelector('#tg-map'), { center: [40.0, -75.9], zoom: 7 });
  const tc = s => s >= 80 ? '#2ecc8f' : s >= 65 ? '#4c8dff' : '#f5b73d';
  maps.points(map, items.filter(t => fin(t.lat)), { color: t => tc(t.fit_score), radius: t => Math.max(4, (t.fit_score - 40) / 6), cluster: false, popup: t => `<b>${esc(t.company)}</b><br>${esc(t.hq_city)}, ${esc(t.state)} · fit ${t.fit_score}<br><span class="muted">${esc(t.ownership || '')}</span>`, onClick: openT });
  maps.marker(map, HQ.lat, HQ.lon, { color: '#ffffff', label: 'PP HQ' });
  maps.marker(map, HORVATH.lat, HORVATH.lon, { color: '#f5b73d', label: 'Horvath' });
  maps.circle(map, HQ.lat, HQ.lon, 60 * 1609, { color: '#f08a3c', fill: .03, dash: '4 4' });
  maps.legend(map, [{ color: '#2ecc8f', label: 'Tier 1 (≥80)' }, { color: '#4c8dff', label: 'Tier 2 (65–79)' }, { color: '#f5b73d', label: 'Tier 3+ (<65)' }, { color: '#f08a3c', label: '60 mi from HQ', ring: true }], 'Fit');
  maps.fitPoints(map, items.filter(t => fin(t.lat)).map(t => [t.lat, t.lon]), 8);
  root.querySelectorAll('.pp-top10 .r').forEach(r => r.onclick = () => { const t = byId.get(r.dataset.id); if (t) openT(t); });
  function openT(t) {
    const fb = t.fit_breakdown || {};
    inspector.open({ title: esc(t.company), sub: `${esc(t.hq_city || '')}, ${esc(t.state || '')} · fit ${t.fit_score}`, color: tc(t.fit_score), sections: [
      { label: 'Fit breakdown', html: Object.keys(fb).length ? ctx.charts.hbar(Object.entries(fb).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v })), { max: 20, fmt: v => v, labelW: 130, color: PP }) : '—' },
      { label: 'Profile', html: ui.kv({ Founded: t.founded_year != null ? esc(t.founded_year) : null, Ownership: esc(t.ownership || ''), 'Ownership notes': esc(t.ownership_notes || ''), Brands: esc(t.brands_or_franchise || ''), Trades: t.trades || [], 'Mi from Lancaster': t.distance_mi_from_lancaster, 'Mi from Toms River': t.distance_mi_from_toms_river, Reviews: t.review_count ? `${fmt.num(t.review_count)} · ${esc(t.review_rating || '')}★` : null, Website: t.website ? fmt.link(t.website) : null }) },
      { label: 'Strategic rationale', html: `<div class="small text-2">${esc(t.strategic_rationale || '')}</div>` },
      t.risk_flags?.length ? { label: 'Risk flags', html: t.risk_flags.map(r => fmt.chip(r, 'var(--amber)')).join(' ') } : null,
      { label: 'Next action', html: `<div class="small text-2">Log in pipeline → PRG-led owner outreach → request 3-yr P&L, membership count and tech roster → indicative value at sector multiple (see Filings & financials).${/franchisee/.test(t.ownership || '') ? ' Confirm Authority Brands transfer approval path.' : ''}</div>` },
      { label: 'Sources', html: `<div class="small col gap-4">${(t.sources || []).map(s => fmt.link(s)).join('') || '—'}</div><div class="dim small mt-8">Retrieved ${esc(t.retrieved || '')}</div>` },
    ].filter(Boolean), actions: t.website ? [{ label: 'Website ↗', href: t.website }] : [] });
  }
  return () => map.remove();
}

/* ═══ 7. FILINGS & FINANCIALS ════════════════════════════════════════════ */
async function filings(ctx) {
  const { el, ui, data, esc, fmt } = ctx; css();
  const d = await data.research('pp_filings');
  el.innerHTML = `<div class="m-pp">${ui.pageHead({ title: 'Filings & financials', sub: d ? (() => { const et = d.meta?.estimate_table || []; const f = re => et.find(e => re.test(e.metric || '')); const rv = f(/pro forma total revenue/i) || f(/revenue/i), eb = f(/EBITDA/i); return `<b>So what:</b> no audited financials are public; triangulating PPP, SEC Form D, FDD Item 19 and assessment records puts ${rv ? `${esc(rv.metric)} at <b>${esc(rv.estimate)}</b> (${esc(rv.confidence)} confidence)` : 'revenue in a wide range'}${eb ? ` and ${esc(eb.metric)} at <b>${esc(eb.estimate)}</b> (${esc(eb.confidence)})` : ''} — use these to frame diligence asks, not valuation.`; })() : 'Public-record financial picture for Punctual Pros', chips: d ? `${fmt.chip(`${(d.items || []).length} records`, 'var(--c-pp)')}${fmt.chip(`${(d.meta?.estimate_table || []).length} estimates`)}${fmt.chip(`generated ${d.meta?.generated || ''}`)}` : '' })}<div id="pp-fil"></div></div>`;
  // shared renderFilings prints nested key_figures objects as "[object Object]" and snake_case keys do not wrap — flatten to readable text first
  const flat = v => Array.isArray(v) ? v.map(flat).join(', ') : v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k.replace(/_/g, ' ')} ${typeof x === 'number' ? x.toLocaleString('en-US') : flat(x)}`).join(', ') : v;
  const dd = d ? { ...d, items: (d.items || []).map(i => i.key_figures && typeof i.key_figures === 'object' ? { ...i, key_figures: Object.fromEntries(Object.entries(i.key_figures).map(([k, v]) => [k.replace(/_/g, ' '), flat(v)])) } : i) } : d;
  renderFilings(ctx, el.querySelector('#pp-fil'), { data: dd, color: 'var(--c-pp)', title: 'Punctual Pros' });
  // split the numbered synthesis into a scannable list
  const pr = el.querySelector('#pp-fil .prose');
  if (pr && d?.meta?.financial_picture) { const parts = String(d.meta.financial_picture).split(/\s*(?=\b\d{1,2}\)\s)/).map(x => x.replace(/^\d{1,2}\)\s*/, '').trim()).filter(Boolean); if (parts.length > 2) pr.outerHTML = `<ol class="pp-fp small">${parts.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`; }
}

/* ═══ module ═══════════════════════════════════════════════════════════ */
export default {
  id: 'pp', name: 'Punctual Pros', tag: 'PA · NJ', color: 'var(--c-pp)', group: 'Portfolio',
  tagline: 'Residential HVAC, plumbing & electrical — Central PA and the Jersey Shore',
  hq: { lat: 40.0629, lon: -76.37, label: 'East Hempfield, PA' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'weather', name: 'Weather & demand', icon: '☂', render: weather },
    { id: 'movers', name: 'New movers', icon: '⌂', render: movers },
    { id: 'territory', name: 'Territory', icon: '▦', render: territory },
    { id: 'market', name: 'Market', icon: '◎', render: market },
    { id: 'targets', name: 'Add-on targets', icon: '◆', render: targets },
    { id: 'filings', name: 'Filings', icon: '▤', render: filings },
  ],
  tour: [
    { order: 300, hash: '#/pp/overview', caption: '<b>Punctual Pros.</b> ~1.6M housing units: 248 Central PA zips plus Horvath on the Jersey Shore — three levers: new movers, weather surge, adjacent zips.', narration: 'Punctual Pros serves Central Pennsylvania and the Jersey Shore. The levers: new movers, weather staffing and adjacent zips.', duration: 7500 },
    { order: 310, hash: '#/pp/weather', caption: '<b>Weather → calls → techs.</b> Live NWS alerts and 7-day hub forecasts become a Service-Call Pressure Index per trade and a surge-staffing number.', narration: 'Live alerts and forecasts become a service-call pressure index, and from there, how many extra technicians to schedule.', duration: 7500 },
    { order: 320, hash: '#/pp/movers', caption: '<b>Every home sale is a lead.</b> 12 months of county deed records, scored 0–100, with the right offer for each house and a mailing list ready to export.', narration: 'Every closed home sale in the footprint becomes a scored new-mover lead, with the right offer attached.', duration: 7000 },
    { order: 330, hash: '#/pp/targets', caption: '<b>Tuck-ins.</b> 61 screened HVAC/plumbing/electrical operators — Authority Brands franchisees and family-owned independents — against the PE platforms bidding for them.', narration: 'Sixty-one screened tuck-ins, led by same-brand franchisees, set against the private-equity platforms competing for them.', duration: 6500 },
  ],
};
