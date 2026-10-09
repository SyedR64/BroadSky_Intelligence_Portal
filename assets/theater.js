/* ═══════════════════════════════════════════════════════════════════════════
   BSP Desk — 3D map engine (ES module, no build step)
   GPU-rendered, cinematic map presentations over the portal's real datasets.

   Stack (CDN only, verified 2026-10-06):
     MapLibre GL JS 4.x  https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js (+ .css)   fallback: cdn.jsdelivr.net/npm
     deck.gl 9.x UMD     https://unpkg.com/deck.gl@9/dist.min.js → global `deck`        fallback: cdn.jsdelivr.net/npm
     Basemap             OpenFreeMap vector styles (key-free): /styles/dark, fallback /styles/positron
     Terrain             AWS Terrarium DEM tiles (CORS-enabled), exaggeration 1.4, plus hillshade
   Usage:
     import { Theater } from './assets/theater.js?v=20261009184141';
     await Theater.mount(el, { autoplay: true, scene: 'S1', onScene: (id, scene) => {} });
     Theater.play(); Theater.pause(); Theater.goTo('S3'); Theater.destroy();
   window.BSPTheater exposes the same API (plus state()) for automation.
   ═══════════════════════════════════════════════════════════════════════════ */

import { label } from './frame.js?v=20261009184141';
/* Caption source lines: dataset keys become their readable names (Frame.label); {id, note} adds a note in brackets. */
const RX_KEY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const SRC = (...parts) => [...new Set(parts.map(p => typeof p === 'string' ? (RX_KEY.test(p) ? label(p) : p) : `${label(p.id)} (${p.note})`))].join(' · ');

const LIBS = {
  mlJs: ['https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.js', 'https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.js'],
  mlCss: ['https://unpkg.com/maplibre-gl@4/dist/maplibre-gl.css', 'https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.css'],
  deckJs: ['https://unpkg.com/deck.gl@9/dist.min.js', 'https://cdn.jsdelivr.net/npm/deck.gl@9/dist.min.js'],
  leafletJs: ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'],
  leafletCss: ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'],
};
const STYLES = ['https://tiles.openfreemap.org/styles/dark', 'https://tiles.openfreemap.org/styles/positron'];
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DEM_ATTR = 'Terrain: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a> (SRTM, GMTED)';

/* ── small utilities ──────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const rgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const fin = v => typeof v === 'number' && isFinite(v);
const num = n => n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const compact = n => n == null || !isFinite(n) ? '—' : Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(Math.abs(n) >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(Math.abs(n) >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(Math.round(n));
const money = n => n == null || !isFinite(n) ? '—' : '$' + compact(n);
const DAY = 864e5;
const dayOf = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : NaN; };
const dateOfDay = d => new Date(d * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).replace(/^Sep /, 'Sept ');   // the site writes Sept
const sleep = ms => new Promise(r => setTimeout(r, ms));

const _loads = new Map();
function loadScript(urls, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  const key = urls[0]; if (_loads.has(key)) return _loads.get(key);
  const p = (async () => {
    let lastErr;
    for (const u of urls) {
      try {
        await new Promise((res, rej) => { const s = document.createElement('script'); s.src = u; s.async = true; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => { s.remove(); rej(new Error('Failed to load ' + u)); }; document.head.appendChild(s); });
        if (!globalName || window[globalName]) return window[globalName];
      } catch (e) { lastErr = e; console.warn('[theater]', e.message, '— trying fallback'); }
    }
    throw lastErr || new Error('Script unavailable: ' + key);
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
function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/* ── fixed geography ──────────────────────────────────────────────────────── */
const C = { cet: '#4c8dff', pp: '#f08a3c', fl: '#9d7bff', ts: '#2ecc8f', bpi: '#e05c8a', fh: '#3fd0e0', bsp: '#d9622b', amber: '#f5b73d', cyan: '#3fd0e0', red: '#ff5c5c', green: '#2ecc8f' };
const HQ = [
  { id: 'cet', label: 'CET · Worcester', short: 'CET', lat: 42.2626, lon: -71.8023, hex: C.cet, group: ['major', 'cet'] },
  { id: 'cet-taunton', label: 'CET · Taunton', short: 'Taunton', lat: 41.9001, lon: -71.0898, hex: C.cet, group: ['cet'] },
  { id: 'nuwave', label: 'NuWave · Norwell', short: 'NuWave', lat: 42.1615, lon: -70.7928, hex: C.cet, group: ['cet'] },
  { id: 'horton', label: 'Horton · Canton CT', short: 'Horton', lat: 41.84, lon: -72.89, hex: '#8ab4ff', group: ['cet'] },
  { id: 'pp', label: 'Punctual Pros · East Hempfield', short: 'Punctual Pros', lat: 40.0629, lon: -76.37, hex: C.pp, group: ['major', 'pp', 'origin'] },
  { id: 'horvath', label: 'Horvath · Toms River', short: 'Horvath', lat: 39.95, lon: -74.2, hex: C.amber, group: ['pp'] },
  { id: 'fl', label: 'Frontline · St. Louis', short: 'Frontline', lat: 38.627, lon: -90.1994, hex: C.fl, group: ['major'] },
  { id: 'ts', label: 'Thomas Scientific · Swedesboro', short: 'Thomas', lat: 39.7476, lon: -75.3105, hex: C.ts, group: ['major'] },
  { id: 'bpi', label: 'BPI · Washington DC', short: 'BPI', lat: 38.9072, lon: -77.0369, hex: C.bpi, group: ['major'] },
  { id: 'fh', label: 'Fair Harbor · New York', short: 'Fair Harbor', lat: 40.7128, lon: -74.006, hex: C.fh, group: ['major'] },
];
const PP_ORIGIN = [-76.37, 40.0629];
const FALLBACK_HUBS = [
  { name: 'Lancaster', lat: 40.038, lon: -76.3057 }, { name: 'York', lat: 39.9625, lon: -76.7277 }, { name: 'Harrisburg', lat: 40.2663, lon: -76.8861 },
  { name: 'Reading', lat: 40.3353, lon: -75.9279 }, { name: 'Chambersburg', lat: 39.9375, lon: -77.6613 }, { name: 'Toms River', lat: 39.9528, lon: -74.1967 },
];
/* expansion geography → anchor cities (pp_nationwide expansion_phase.geography strings are free text) */
const GEO = [
  [/central\s*&?\s*eastern pa/i, [['Harrisburg', 40.2732, -76.8867], ['Reading', 40.3356, -75.9269], ['Allentown', 40.6084, -75.4902]]],
  [/jersey shore/i, [['Toms River', 39.9537, -74.1979]]],
  [/south jersey/i, [['Cherry Hill', 39.9348, -75.0307], ['Atlantic City', 39.3643, -74.4229]]],
  [/northern md/i, [['Frederick MD', 39.4143, -77.4105], ['Bel Air MD', 39.5359, -76.3483]]],
  [/delaware(?!\s*county)/i, [['Wilmington DE', 39.7391, -75.5398], ['Dover DE', 39.1582, -75.5244]]],
  [/southern ny|southern tier|hudson/i, [['Binghamton NY', 42.0987, -75.918], ['Poughkeepsie NY', 41.7004, -73.921]]],
  [/baltimore/i, [['Baltimore', 39.2904, -76.6122]]],
  [/washington dc|\bdc\b/i, [['Washington DC', 38.9072, -77.0369]]],
  [/richmond/i, [['Richmond VA', 37.5407, -77.436]]],
  [/philadelphia/i, [['Philadelphia suburbs', 40.1013, -75.3836]]],
  [/pittsburgh/i, [['Pittsburgh', 40.4406, -79.9959]]],
  [/sun belt/i, [['Charlotte', 35.2271, -80.8431], ['Atlanta', 33.749, -84.388], ['Nashville', 36.1627, -86.7816], ['Tampa', 27.9506, -82.4572], ['Dallas', 32.7767, -96.797], ['Phoenix', 33.4484, -112.074]]],
  [/midwest/i, [['Columbus', 39.9612, -82.9988], ['Indianapolis', 39.7684, -86.1581]]],
];
const DEFAULT_DEST = [
  [2, 'Harrisburg', 40.2732, -76.8867], [2, 'Reading', 40.3356, -75.9269], [2, 'Toms River', 39.9537, -74.1979], [2, 'Wilmington DE', 39.7391, -75.5398],
  [3, 'Baltimore', 39.2904, -76.6122], [3, 'Philadelphia suburbs', 40.1013, -75.3836], [3, 'Richmond VA', 37.5407, -77.436], [3, 'Pittsburgh', 40.4406, -79.9959], [3, 'Washington DC', 38.9072, -77.0369],
  [4, 'Charlotte', 35.2271, -80.8431], [4, 'Columbus', 39.9612, -82.9988], [4, 'Nashville', 36.1627, -86.7816],
];
const PHASE_COL = { 2: C.pp, 3: C.amber, 4: C.cyan };
const CAP_COL = { wastewater: '#3fd0e0', pump_station: '#4c8dff', electrical_construction: '#8ab4ff', ev_charging: '#2ecc8f', generator: '#f5b73d', solar: '#ffd166', storage: '#9d7bff', controls: '#e05c8a', energy_efficiency: '#7bd88f', utility: '#f08a3c' };
const CAP_LABEL = { wastewater: 'Wastewater', pump_station: 'Pump station', electrical_construction: 'Electrical construction', ev_charging: 'EV charging', generator: 'Generator', solar: 'Solar', storage: 'Storage', controls: 'Controls', energy_efficiency: 'Energy efficiency', utility: 'Utility' };
const SEV = { Extreme: { h: 34000, c: [255, 60, 110] }, Severe: { h: 24000, c: [255, 92, 92] }, Moderate: { h: 13000, c: [245, 183, 61] }, Minor: { h: 6500, c: [63, 208, 224] }, Unknown: { h: 4000, c: [140, 160, 190] } };
const PRICE_RANGE = [[24, 52, 120], [38, 110, 196], [63, 208, 224], [245, 215, 110], [240, 138, 60], [255, 76, 96]];
const FIT_RANGE = [[34, 58, 100], [60, 110, 200], [76, 141, 255], [138, 180, 255], [200, 225, 255]];

/* ── scenes ───────────────────────────────────────────────────────────────── */
const SCENES = [
  { id: 'S1', name: 'Portfolio', color: C.bsp, duration: 15000, labels: 'major',
    layers: ['hq', 'ppCore', 'cetCounties'],
    keys: [{ at: 0, center: [-80.5, 39.6], zoom: 4.75, pitch: 45, bearing: -8 }, { at: 4200, center: [-74.6, 41.2], zoom: 6.15, pitch: 52, bearing: -18, duration: 9000 }],
    caption: s => ({ kicker: 'BSP · portfolio', title: `${s.holdings === 6 ? 'Six' : s.holdings} companies, one map`, line: `CET across New England, Punctual Pros in Central PA and the Jersey Shore, plus Frontline, Thomas Scientific, BPI and Fair Harbor. Orange hexes: ${num(s.ppCoreZips)} Punctual Pros core zips, raised by housing units. Blue columns: CET county fit across ${num(s.cetCounties)} New England counties.`, src: SRC('bsp_firm', { id: 'pp_zips', note: 'Census ACS' }, 'cet_ne_counties') }),
    legend: () => [['dot', C.pp, 'PP core zips · height = housing units'], ['dot', C.cet, 'CET county fit · height = score'], ['ring', '#ffffff', 'Company headquarters']] },
  { id: 'S2', name: 'Where the homes trade', color: C.pp, duration: 17000, labels: 'pp', needs: 'sales',
    layers: ['hq', 'sales', 'salesNew'],
    keys: [{ at: 0, center: [-75.95, 39.86], zoom: 7.35, pitch: 56, bearing: -14 }, { at: 3800, center: [-75.85, 39.98], zoom: 7.75, pitch: 60, bearing: 10, duration: 12000 }],
    caption: s => s.sales ? ({ kicker: 'Punctual Pros · demand signal', title: 'Where the homes trade', line: `${num(s.sales.n)} recorded sales across ${num(s.sales.counties)} PA and NJ counties, ${dateOfDay(s.sales.minDay)} to ${dateOfDay(s.sales.maxDay)}. Column height = sales per 1.5 km hex; colour = median price. Pulsing points: the ${num(s.sales.n90)} sales in the newest 90 days. Each is a new owner who will need HVAC, plumbing and electrical work.`, src: SRC('County deed records and NJ SR1A filings', 'pp_sales_pa_a', 'pp_sales_pa_b', 'pp_sales_nj') })
      : ({ kicker: 'Punctual Pros · demand signal', title: 'Where the homes trade', line: s.salesError ? 'The home-sales files could not be loaded. Reload the page, or open the home-sales view in the portal.' : 'Loading every recorded home sale in the territory…', src: SRC('pp_sales_pa_a', 'pp_sales_pa_b', 'pp_sales_nj') }),
    legend: s => [['ramp', PRICE_RANGE, 'Median sale price per hex', s.sales ? `low → high · territory median ${money(s.sales.median)}` : 'low → high'], ['dot', '#ffe9b0', 'Sold in the newest 90 days']] },
  { id: 'S3', name: 'Nationwide', color: C.amber, duration: 17000, labels: 'origin',
    layers: ['hq', 'ppCore', 'arcs', 'destLabels', 'ppTargets'],
    keys: [{ at: 0, center: [-76.6, 40.1], zoom: 6.4, pitch: 50, bearing: -10 }, { at: 3200, center: [-78.6, 39.0], zoom: 5.5, pitch: 52, bearing: -18, duration: 4200 }, { at: 7600, center: [-87.5, 36.9], zoom: 4.25, pitch: 48, bearing: -24, duration: 5200 }],
    caption: s => ({ kicker: 'Punctual Pros · the nationwide plan', title: 'From East Hempfield to the Sun Belt', line: `${s.phaseLine} Columns: ${num(s.ppTargets)} screened add-on targets; height = fit score.`, src: s.nationwide ? SRC({ id: 'pp_nationwide', note: 'expansion phases' }, 'ma_targets_pp') : SRC('Illustrative phase geography', 'ma_targets_pp') }),
    legend: () => [['line', PHASE_COL[2], 'Phase 2 · tuck-ins, 9–24 mo'], ['line', PHASE_COL[3], 'Phase 3 · metro anchors, 18–36 mo'], ['line', PHASE_COL[4], 'Phase 4 · national, 36–60 mo'], ['dot', '#ffb37a', 'Add-on target · height = fit']] },
  { id: 'S4', name: 'New England grid', color: C.cet, duration: 21000, labels: 'cet', zoomScaled: true,
    layers: ['hq', 'cetOpps', 'wwtp', 'cetSales'],
    keys: [{ at: 0, center: [-71.8023, 42.2626], zoom: 12.4, pitch: 70, bearing: -32 }, { at: 3600, center: [-72.68, 41.77], zoom: 10.2, pitch: 66, bearing: 18, duration: 6000 }, { at: 10200, center: [-71.25, 41.72], zoom: 8.7, pitch: 62, bearing: 42, duration: 5200 }, { at: 15600, center: [-72.75, 41.55], zoom: 7.3, pitch: 56, bearing: 6, duration: 4400 }],
    caption: s => ({ kicker: 'CET · New England grid', title: 'Wastewater, solar and the Horton opening', line: `${num(s.cetOpps)} tracked opportunities worth ${money(s.cetOppValue)} (est., where disclosed). Column height = estimated value; colour = lead capability. Floating discs: ${num(s.wwtp)} municipal wastewater plants sized by design flow. Horton (Canton CT, Sept 2026) makes this work prime-able.`, src: SRC('cet_opportunities', { id: 'cet_wwtp_targets', note: 'EPA ECHO, Connecticut Clean Water Fund' }, 'cet_home_sales_ma', 'cet_home_sales_ct_ri') }),
    legend: () => [...['wastewater', 'pump_station', 'electrical_construction', 'ev_charging', 'generator', 'solar'].map(k => ['dot', CAP_COL[k], CAP_LABEL[k]]), ['ring', C.cyan, 'WWTP · disc size = design flow (MGD)']] },
  { id: 'S5', name: 'Storm', color: C.red, duration: 14000, labels: 'pp', needs: 'alerts',
    layers: ['hq', 'ppCore', 'alerts', 'hubs', 'territory'],
    keys: [{ at: 0, center: [-75.7, 39.95], zoom: 6.9, pitch: 52, bearing: -22 }, { at: 3200, center: [-76.0, 40.05], zoom: 7.25, pitch: 58, bearing: 14, duration: 10000 }],
    caption: s => {
      const a = s.alerts;
      if (!a) return { kicker: 'Punctual Pros · live weather', title: 'Storm watch', line: 'Checking the National Weather Service for active alerts over Pennsylvania and New Jersey…', src: 'National Weather Service alerts (live)' };
      if (a.error) return { kicker: 'Punctual Pros · live weather', title: 'Storm watch', line: 'The NWS alerts feed did not respond. Territory counties and weather hubs are shown; retry from the portal\'s Weather view.', src: 'National Weather Service alerts (live)' };
      if (!a.polys) return { kicker: 'Punctual Pros · live weather', title: 'Calm over the territory', line: `${a.count ? `${num(a.count)} NWS alert${a.count === 1 ? '' : 's'} active in PA/NJ, none with a mappable footprint` : 'No active NWS alerts over Pennsylvania or New Jersey'} as of ${a.asof}. Territory counties and the ${num(s.hubs)} weather hubs that drive call-volume staffing are shown.`, src: SRC('National Weather Service alerts (live)', { id: 'pp_demand_model', note: 'weather hubs' }) };
      return { kicker: 'Punctual Pros · live weather', title: a.severe ? 'Severe weather in PA and NJ' : 'Storm watch', line: `${num(a.count)} active NWS alerts touch PA/NJ, ${num(a.severe)} severe or extreme. Extrusion height = severity. The ${num(s.hubs)} weather hubs convert these into call-volume and staffing calls. As of ${a.asof}.`, src: SRC('National Weather Service alerts (live)', { id: 'pp_demand_model', note: 'weather hubs' }) };
    },
    legend: () => [['dot', 'rgb(255,92,92)', 'Severe / extreme alert'], ['dot', 'rgb(245,183,61)', 'Moderate alert'], ['dot', 'rgb(63,208,224)', 'Minor alert'], ['ring', '#ffffff', 'PP weather hub']] },
  { id: 'S6', name: 'Close', color: C.bsp, duration: 15000, labels: 'none',
    layers: ['hq', 'ppCore', 'cetCounties', 'sales', 'arcs', 'destLabels', 'ppTargets', 'cetOpps', 'wwtp', 'alerts', 'hubs'],
    keys: [{ at: 0, center: [-80.6, 38.4], zoom: 4.75, pitch: 56, bearing: -18 }, { at: 3800, center: [-78.4, 39.6], zoom: 5.05, pitch: 62, bearing: 6, duration: 10500 }],
    caption: s => ({ kicker: 'BSP', title: 'One operating system for the portfolio', line: `${s.platforms} companies to date (${s.holdings} held today) · ${s.addOns} add-ons · ${s.exits} exit. ${s.sales ? num(s.sales.n) + ' home sales, ' : ''}${num(s.cetOpps)} CET opportunities, ${num(s.ppTargets + s.cetTargets)} screened add-on targets and live weather, every layer built from public and licensed data.`, src: 'All portal datasets · verify before use' }),
    legend: () => [['dot', C.pp, 'Punctual Pros'], ['dot', C.cet, 'CET'], ['line', C.amber, 'Expansion arcs'], ['ring', '#ffffff', 'Headquarters']] },
];

/* ── cached data (survives remounts in the portal) ────────────────────────── */
let _base = null, _sales = null, _cetSales = null, _alerts = null;

async function fetchJSON(rel) { const r = await fetch(new URL(rel, import.meta.url), { cache: 'force-cache' }); if (!r.ok) throw new Error(`${rel} ${r.status}`); return r.json(); }
/** Decode the columnar sales files straight into typed arrays (lon, lat, price, day). */
function decodeSales(files) {
  let n = 0; for (const j of files) n += j.rows.length;
  const LON = new Float32Array(n), LAT = new Float32Array(n), PRICE = new Float32Array(n), DAYS = new Int32Array(n);
  const counties = new Set(); let k = 0;
  for (const j of files) {
    const ci = c => j.cols.indexOf(c); const iLat = ci('lat'), iLon = ci('lon'), iP = ci('price'), iD = ci('sale_date'), iC = ci('county'), iS = ci('state');
    const en = j.enums || {}; const dEnum = en.sale_date ? en.sale_date.map(dayOf) : null; const cEnum = en.county, sEnum = en.state;
    for (const r of j.rows) {
      const la = r[iLat], lo = r[iLon]; if (!fin(la) || !fin(lo) || la === 0) continue;
      LAT[k] = la; LON[k] = lo; PRICE[k] = fin(r[iP]) ? r[iP] : NaN;
      const dv = r[iD]; DAYS[k] = dv == null ? -1 : dEnum ? dEnum[dv] : dayOf(dv);
      if (iC >= 0 && r[iC] != null) counties.add((cEnum ? cEnum[r[iC]] : r[iC]) + '|' + (iS >= 0 && r[iS] != null ? (sEnum ? sEnum[r[iS]] : r[iS]) : ''));
      k++;
    }
  }
  let minDay = Infinity, maxDay = -Infinity; const prices = new Float32Array(k); let np = 0;
  for (let i = 0; i < k; i++) { const d = DAYS[i]; if (d > 0) { if (d < minDay) minDay = d; if (d > maxDay) maxDay = d; } const p = PRICE[i]; if (p > 1e4 && p < 2e7) prices[np++] = p; }
  const ps = prices.subarray(0, np).sort();
  const cutoff = maxDay - 90; const idx = new Array(k); const recent = [];
  for (let i = 0; i < k; i++) { idx[i] = i; if (DAYS[i] > cutoff) recent.push(i); }
  return { n: k, LON, LAT, PRICE, DAYS, idx, recent, n90: recent.length, minDay, maxDay, counties: counties.size, median: np ? ps[np >> 1] : null };
}
function loadSales() {
  if (!_sales) { _sales = Promise.all(['../data/sales/pp_sales_pa_a.json', '../data/sales/pp_sales_pa_b.json', '../data/sales/pp_sales_nj.json'].map(fetchJSON)).then(decodeSales); _sales.catch(() => { _sales = null; }); }
  return _sales;
}
function loadCetSales() {
  if (!_cetSales) { _cetSales = Promise.all(['../data/sales/cet_home_sales_ma.json', '../data/sales/cet_home_sales_ct_ri.json'].map(u => fetchJSON(u).catch(() => null))).then(fs => decodeSales(fs.filter(Boolean))); _cetSales.catch(() => { _cetSales = null; }); }
  return _cetSales;
}
async function loadBase(core) {
  if (_base) return _base;
  const D = core.Data; const R = n => D.research('research/' + n).catch(() => null);
  const [zips, counties, opps, wwtp, tPP, tCET, nation, firm, demand] = await Promise.all([
    D.load('pp_zips').catch(() => []), D.load('cet_ne_counties').catch(() => []), R('cet_opportunities'), R('cet_wwtp_targets'), R('ma_targets_pp'), R('ma_targets_cet'), R('pp_nationwide'), R('bsp_firm'), R('pp_demand_model'),
  ]);
  const core0 = (zips || []).filter(z => z.service_territory_flag === 1 && fin(z.lat) && fin(z.lon));
  const cty = (counties || []).filter(c => fin(c.centroid_lat) && fin(c.centroid_lng));
  // territory county labels (centroid of each county's core zips)
  const byC = new Map(); for (const z of core0) { const k = `${z.county}|${z.state}`; const b = byC.get(k) || { name: String(z.county || '').replace(/ County$/i, ''), state: z.state, lat: 0, lon: 0, n: 0 }; b.lat += z.lat; b.lon += z.lon; b.n++; byC.set(k, b); }
  const terr = [...byC.values()].filter(b => b.n >= 3).map(b => ({ name: b.name.toUpperCase(), lat: b.lat / b.n, lon: b.lon / b.n, n: b.n }));
  // Horvath (NJ) footprint is not flagged in pp_zips; add Ocean + Monmouth as labels
  if (!terr.some(t => /OCEAN/.test(t.name))) terr.push({ name: 'OCEAN', lat: 39.92, lon: -74.3, n: 0 }, { name: 'MONMOUTH', lat: 40.26, lon: -74.22, n: 0 });
  // expansion arcs
  const phases = (nation?.items || []).filter(i => i.kind === 'expansion_phase');
  let dest = []; const seen = new Set();
  for (const ph of phases) {
    const p = Number((/Phase\s*(\d)/i.exec(ph.phase || ph.id || '') || [])[1]); if (!(p >= 2 && p <= 4)) continue;
    for (const g of [].concat(ph.geography || [])) for (const [re, cities] of GEO) if (re.test(g)) for (const [name, lat, lon] of cities) if (!seen.has(name)) { seen.add(name); dest.push({ phase: p, name, lat, lon, months: ph.months }); }
  }
  const fromData = dest.length >= 4;
  if (!fromData) dest = DEFAULT_DEST.map(([phase, name, lat, lon]) => ({ phase, name, lat, lon }));
  const months = {}; for (const ph of phases) { const p = Number((/Phase\s*(\d)/i.exec(ph.phase || '') || [])[1]); if (p) months[p] = ph.months; }
  const hubs0 = (demand?.items || []).filter(i => i.component === 'weather_hub' && fin(i.lat) && fin(i.lon)).map(h => ({ name: h.name, lat: h.lat, lon: h.lon }));
  const oppItems = (opps?.items || []).filter(o => fin(o.lat) && fin(o.lon));
  const stats = firm?.firm?.stats || { platforms: 7, current_holdings: 6, add_ons: 23, exits: 1 };
  _base = {
    zips: core0, counties: cty, terr, opps: oppItems, wwtp: (wwtp?.items || []).filter(w => fin(w.lat) && fin(w.lon)),
    tPP: (tPP?.items || []).filter(t => fin(t.lat) && fin(t.lon)), tCET: (tCET?.items || []).filter(t => fin(t.lat) && fin(t.lon)),
    dest, fromData, months, hubs: hubs0.length ? hubs0 : FALLBACK_HUBS,
    stats: { platforms: stats.platforms ?? 7, holdings: stats.current_holdings ?? 6, addOns: stats.add_ons ?? 23, exits: stats.exits ?? 1 },
    nationwide: !!nation,
  };
  return _base;
}
/** NWS alerts for PA + NJ, with zone geometry fetched for zone-only alerts (capped). */
function loadAlerts(core) {
  if (_alerts && Date.now() - _alerts.t < 4 * 60e3) return _alerts.p;
  const p = (async () => {
    const L = core.Live; let list = [];
    try { const [pa, nj] = await Promise.all([L.nwsAlerts('PA'), L.nwsAlerts('NJ')]); list = [...pa, ...nj]; }
    catch (e) { console.warn('[theater] NWS alerts unavailable:', e.message); return { error: true, features: [], count: 0, polys: 0, severe: 0 }; }
    const seenIds = new Set(); list = list.filter(a => a && !seenIds.has(a.id) && seenIds.add(a.id));
    const feats = [];
    for (const a of list) if (a.geometry) feats.push({ type: 'Feature', geometry: a.geometry, properties: { event: a.event, severity: a.severity, headline: a.headline, areaDesc: a.areaDesc } });
    const zoneOnly = list.filter(a => !a.geometry);
    const ugcs = [...new Set(zoneOnly.flatMap(a => a.zones || []))].slice(0, 36);
    if (ugcs.length) {
      const geo = new Map();
      await Promise.all(ugcs.map(async u => {
        try {
          const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
          const r = await fetch(`https://api.weather.gov/zones/${u[2] === 'C' ? 'county' : 'forecast'}/${u}`, { headers: { Accept: 'application/geo+json' }, signal: ctl.signal });
          clearTimeout(to); if (r.ok) { const j = await r.json(); if (j.geometry) geo.set(u, j.geometry); }
        } catch { }
      }));
      for (const a of zoneOnly) for (const u of a.zones || []) { const g = geo.get(u); if (g) feats.push({ type: 'Feature', geometry: g, properties: { event: a.event, severity: a.severity, headline: a.headline, areaDesc: a.areaDesc } }); }
    }
    const asof = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
    return { features: feats, count: list.length, polys: feats.length, severe: list.filter(a => /Extreme|Severe/.test(a.severity)).length, asof, list };
  })();
  _alerts = { t: Date.now(), p };
  return p;
}

/* ── scoped CSS ───────────────────────────────────────────────────────────── */
const CSS = `
/* UI chrome reads the system tokens (assets/system.css); the stage is always a dark band (data-sys-theme="dark" on the root),
   so the same tokens resolve to the dark set on the light site and in the light portal. Fallbacks cover a page without system.css. */
.bsp-theater{position:relative;width:100%;height:100%;min-height:420px;overflow:hidden;background:var(--sys-bg,#0a0e14);color:var(--sys-ink,#e6edf3);font-family:var(--sys-font,Inter,system-ui,sans-serif);--sc:var(--sys-brand,#f0874a);--bt-glass:color-mix(in srgb,var(--sys-bg,#0a0e14) 66%,transparent)}
.bsp-theater .bt-map{position:absolute;inset:0;z-index:0;background:var(--sys-bg-2,#0e141c)}
.bsp-theater .bt-map canvas{outline:none}
.bsp-theater .bt-shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,color-mix(in srgb,var(--sys-bg) 55%,transparent) 0%,transparent 18%,transparent 52%,color-mix(in srgb,var(--sys-bg) 82%,transparent) 100%),radial-gradient(120% 90% at 50% 45%,transparent 55%,color-mix(in srgb,var(--sys-bg) 45%,transparent) 100%)}
.bsp-theater .bt-cap{position:absolute;z-index:2;left:var(--sys-gut,24px);bottom:clamp(26px,5.5vh,64px);max-width:min(640px,calc(100% - 300px));pointer-events:none;transition:opacity .6s var(--sys-ease),transform .6s var(--sys-ease)}
.bsp-theater .bt-cap.out{opacity:0;transform:translateY(10px)}
.bsp-theater .bt-kicker{display:flex;align-items:center;gap:10px;margin-bottom:var(--sys-sp-4);font:600 var(--sys-fs-xs)/1 var(--sys-mono);letter-spacing:var(--sys-tr-label);text-transform:uppercase;color:var(--sc)}
.bsp-theater .bt-kicker:before{content:"";width:18px;height:2px;border-radius:2px;background:var(--sc);flex-shrink:0}
.bsp-theater .bt-title{margin:0 0 var(--sys-sp-3);font-size:var(--sys-fs-2xl);line-height:1.06;font-weight:800;letter-spacing:var(--sys-tr-head);color:var(--sys-ink);text-shadow:0 2px 24px color-mix(in srgb,var(--sys-bg) 70%,transparent)}
.bsp-theater .bt-line{max-width:600px;font-size:clamp(14px,1.1vw,16px);line-height:1.6;color:var(--sys-ink-2);text-shadow:0 1px 10px var(--sys-bg)}
.bsp-theater .bt-src{margin-top:var(--sys-sp-3);font:500 var(--sys-fs-xs)/1.5 var(--sys-mono);color:var(--sys-mute)}
.bsp-theater .bt-prog{margin-top:var(--sys-sp-4);height:2px;width:220px;background:var(--sys-line-2);border-radius:var(--sys-r-pill);overflow:hidden}
.bsp-theater .bt-prog i{display:block;height:100%;width:0;background:var(--sc)}
.bsp-theater .bt-rail{position:absolute;top:16px;right:16px;z-index:3;display:flex;flex-direction:column;gap:2px;min-width:206px;padding:var(--sys-sp-2);border:1px solid var(--sys-line);border-radius:var(--sys-r);background:var(--bt-glass);box-shadow:var(--sys-sh-2);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.bsp-theater .bt-rail button{all:unset;box-sizing:border-box;position:relative;display:flex;align-items:center;gap:10px;min-height:32px;padding:0 var(--sys-sp-3);border-radius:var(--sys-r-pill);font:500 var(--sys-fs-sm)/1.2 var(--sys-font);color:var(--sys-ink-2);cursor:pointer;transition:background var(--sys-t),color var(--sys-t)}
.bsp-theater .bt-rail button:hover{background:var(--sys-bg-3);color:var(--sys-ink)}
.bsp-theater .bt-rail button:focus-visible{outline:2px solid var(--sys-focus);outline-offset:-2px}
.bsp-theater .bt-rail button .n{width:20px;font:600 var(--sys-fs-2xs)/1 var(--sys-mono);color:var(--sys-mute)}
.bsp-theater .bt-rail button.on{background:color-mix(in srgb,var(--bc) 14%,transparent);color:var(--sys-ink)}
.bsp-theater .bt-rail button.on .n{color:color-mix(in srgb,var(--bc) 80%,var(--sys-ink))}
.bsp-theater .bt-ctl{display:flex;gap:6px;margin-top:6px;padding-top:var(--sys-sp-2);border-top:1px solid var(--sys-line)}
.bsp-theater .bt-ctl button{flex:1;justify-content:center;border:1px solid var(--sys-line-2);background:var(--sys-surface)}
.bsp-theater .bt-ctl button:hover{border-color:var(--sys-ink)}
.bsp-theater .bt-hint{margin-top:6px;text-align:center;font:500 var(--sys-fs-2xs)/1.3 var(--sys-mono);color:var(--sys-mute-2)}
.bsp-theater .bt-legend{position:absolute;right:16px;bottom:34px;z-index:2;display:flex;flex-direction:column;gap:5px;max-width:270px;padding:10px 12px;border:1px solid var(--sys-line);border-radius:var(--sys-r-sm);background:var(--bt-glass);box-shadow:var(--sys-sh-1);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font-size:var(--sys-fs-xs);color:var(--sys-ink-2);transition:opacity .5s}
.bsp-theater .bt-legend .li{display:flex;align-items:center;gap:8px}
.bsp-theater .bt-legend .sw{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.bsp-theater .bt-legend .sw.ring{background:transparent!important;border:2px solid currentColor;width:8px;height:8px}
.bsp-theater .bt-legend .sw.ln{width:16px;height:3px;border-radius:var(--sys-r-pill)}
.bsp-theater .bt-legend .ramp{height:8px;width:150px;border-radius:var(--sys-r-pill)}
.bsp-theater .bt-legend .sub{font-size:var(--sys-fs-2xs);color:var(--sys-mute)}
.bsp-theater .bt-status{position:absolute;left:16px;top:16px;z-index:3;display:flex;align-items:center;gap:8px;min-height:30px;padding:0 12px;border:1px solid var(--sys-line-2);border-radius:var(--sys-r-pill);background:var(--bt-glass);font:500 var(--sys-fs-xs)/1.2 var(--sys-mono);color:var(--sys-ink-2);transition:opacity .4s}
.bsp-theater .bt-status:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--sc);animation:btp 1.2s ease-in-out infinite}
.bsp-theater .bt-status.hide{opacity:0;pointer-events:none}
@keyframes btp{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){.bsp-theater .bt-status:before{animation:none}}
.bsp-theater .bt-tip{position:absolute;z-index:4;pointer-events:none;max-width:280px;padding:8px 10px;border:1px solid var(--sys-line-2);border-radius:var(--sys-r-xs);background:var(--sys-surface);box-shadow:var(--sys-sh-2);font-size:var(--sys-fs-xs);line-height:1.45;color:var(--sys-ink-2)}
.bsp-theater :is(.bt-tip,.bt-tip-deck) b{color:var(--sys-ink)} .bsp-theater :is(.bt-tip,.bt-tip-deck) .d{color:var(--sys-mute);font-size:var(--sys-fs-2xs)}
.bsp-theater .bt-fallback{position:absolute;left:16px;right:16px;top:60px;z-index:5;max-width:520px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--sys-warn) 32%,transparent);border-left:3px solid var(--sys-warn);border-radius:var(--sys-r-sm);background:color-mix(in srgb,var(--sys-warn) 10%,var(--sys-surface));font-size:var(--sys-fs-sm);color:var(--sys-ink-2)}
.bsp-theater .maplibregl-ctrl-attrib{background:color-mix(in srgb,var(--sys-bg) 70%,transparent)!important;color:var(--sys-mute);font-size:10px}
.bsp-theater .maplibregl-ctrl-attrib a{color:var(--sys-ink-2)}
.bsp-theater .maplibregl-ctrl-attrib-button{filter:invert(1) opacity(.6)}
.bsp-theater.lite .bt-rail{min-width:0}
.bsp-theater.lite .leaflet-top.leaflet-left{top:104px}
@media (max-width:760px){
 .bsp-theater .bt-rail{flex-direction:row;flex-wrap:wrap;left:12px;right:12px;top:12px;min-width:0;padding:6px;gap:2px}
 .bsp-theater .bt-rail button{padding:0 9px}
 .bsp-theater .bt-rail button .t{display:none}
 .bsp-theater .bt-ctl{margin:0;padding:0;border:0;flex:1 0 100%}
 .bsp-theater .bt-hint{display:none}
 .bsp-theater .bt-cap{max-width:calc(100% - 32px);bottom:40px}
 .bsp-theater .bt-prog{display:none}
 .bsp-theater .bt-legend{display:none}
 .bsp-theater .bt-status{top:auto;bottom:8px}
}`;

/* ── accessors (stable references so deck.gl never re-aggregates) ─────────── */
let S = null; // current sales typed arrays (module-level for accessor speed)
let SC = null; // CET sales
const salesPos = i => [S.LON[i], S.LAT[i]];
const cetSalesPos = i => [SC.LON[i], SC.LAT[i]];
const salesMedian = pts => { const a = []; for (const i of pts) { const p = S.PRICE[i]; if (p > 1e4 && p < 2e7) a.push(p); } if (!a.length) return 0; a.sort((x, y) => x - y); return a[a.length >> 1]; };
const posLL = d => [d.lon, d.lat];
const zipWeight = z => z.housing_units || 1;

/* ═══════════════════════════════════════════════════════════════════════════ */
class TheaterInstance {
  constructor(el, opts) {
    this.el = el; this.opts = opts; this.core = opts.core || null;
    this.alpha = {}; this.target = {}; this.timers = []; this.timers0 = []; this.raf = 0; this.playing = !!opts.autoplay; this.elapsed = 0;
    this.scene = null; this.sceneStart = 0; this.arcT0 = 0; this.destroyed = false; this.lastFrame = 0; this.layersCache = {};
    this.ready = this._init().catch(e => { console.error('[theater]', e); this._status('Theater failed to start: ' + e.message); });
  }
  _status(msg) { const s = this.$status; if (!s) return; if (msg) { s.textContent = msg; s.classList.remove('hide'); } else s.classList.add('hide'); }

  async _init() {
    if (!document.getElementById('bsp-theater-css')) { const st = document.createElement('style'); st.id = 'bsp-theater-css'; st.textContent = CSS; document.head.appendChild(st); }
    const root = document.createElement('div'); root.className = 'bsp-theater'; root.dataset.sysTheme = 'dark'; this.root = root;   // a dark band: system tokens resolve to the dark set here on any page
    const ht = document.querySelector('h1') ? 'h2' : 'h1';   // the scene title is the page heading unless the page already has one
    root.innerHTML = `<div class="bt-map"></div><div class="bt-shade"></div>
      <div class="bt-cap out" aria-live="polite"><div class="bt-kicker"></div><${ht} class="bt-title"></${ht}><div class="bt-line"></div><div class="bt-src"></div><div class="bt-prog"><i></i></div></div>
      <nav class="bt-rail" aria-label="Scenes">${SCENES.map((s, i) => `<button type="button" data-s="${s.id}" style="--bc:${s.color}" title="${esc(s.name)}" aria-label="Scene ${i + 1}: ${esc(s.name)}"><span class="n">0${i + 1}</span><span class="t">${esc(s.name)}</span></button>`).join('')}
        <div class="bt-ctl"><button type="button" data-act="prev" title="Previous (←)" aria-label="Previous scene">‹</button><button type="button" data-act="play" title="Play / pause (space)" aria-label="Play or pause">▶</button><button type="button" data-act="next" title="Next (→)" aria-label="Next scene">›</button></div><div class="bt-hint">← → scenes · space play</div></nav>
      <div class="bt-legend"></div><div class="bt-status">Loading 3D engine…</div><div class="bt-tip" hidden></div>`;
    this.el.appendChild(root);
    const q = s => root.querySelector(s);
    this.$map = q('.bt-map'); this.$cap = q('.bt-cap'); this.$status = q('.bt-status'); this.$legend = q('.bt-legend'); this.$prog = q('.bt-prog i'); this.$tip = q('.bt-tip'); this.$play = q('[data-act=play]');
    root.querySelectorAll('.bt-rail [data-s]').forEach(b => b.onclick = () => this.goTo(b.dataset.s));
    q('[data-act=prev]').onclick = () => this.step(-1); q('[data-act=next]').onclick = () => this.step(1);
    this.$play.onclick = () => (this.playing ? this.pause() : this.play());
    this._onKey = e => {
      if (!this.root.isConnected || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); } else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); this.playing ? this.pause() : this.play(); }
    };
    window.addEventListener('keydown', this._onKey);
    this._syncPlay();

    if (!this.core) this.core = await import('./core.js?v=20261009184141');
    const baseP = loadBase(this.core);
    if (!webglOK() || this.opts.forceFallback) return this._fallback(this.opts.forceFallback ? 'Static fallback requested.' : 'WebGL is not available in this browser, so the 3D map is showing a static 2D map.', baseP);
    loadCss(LIBS.mlCss, 'maplibre-css');
    let base;
    try { [base] = await Promise.all([baseP, loadScript(LIBS.mlJs, 'maplibregl'), loadScript(LIBS.deckJs, 'deck')]); }
    catch (e) { return this._fallback('The 3D libraries could not be loaded (' + esc(e.message) + '). Showing a static 2D map.', baseP); }
    if (this.destroyed) return;
    this.base = base;
    this._status('Loading basemap & terrain…');
    await this._createMap();
    if (this.destroyed) return;
    // background loads
    loadSales().then(s => { S = s; this.salesReady = true; this._dataArrived('sales'); }).catch(e => { console.warn('[theater] sales', e); this.salesError = true; this._dataArrived('sales'); });
    loadAlerts(this.core).then(a => { this.alerts = a; this._dataArrived('alerts'); });
    const first = SCENES.find(s => s.id === String(this.opts.scene || '').toUpperCase()) || SCENES[0];
    this._enter(first, true);
    this._loop();
  }

  _createMap() {
    const ml = window.maplibregl;
    return new Promise((resolve) => {
      let styleIdx = 0; let settled = false;
      const opts = { container: this.$map, style: STYLES[0], center: [-80.5, 39.6], zoom: 4.6, pitch: 45, bearing: -8, maxPitch: 85, attributionControl: false, antialias: true, fadeDuration: 0, dragRotate: true, preserveDrawingBuffer: !!this.opts.preserveDrawingBuffer };
      const map = new ml.Map(opts); this.map = map;
      map.on('styleimagemissing', e => { try { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); } catch { } });
      map.addControl(new ml.AttributionControl({ compact: true, customAttribution: DEM_ATTR }), 'bottom-right');
      const fold = () => { if (this.$map && this.$map.clientWidth < 760) this.$map.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'); };
      map.once('idle', fold); map.once('load', fold);
      let styleOK = false;
      map.on('error', e => {
        const msg = e?.error?.message || ''; console.debug('[theater] map error', msg);
        if (!settled && !styleOK && styleIdx < STYLES.length - 1) { styleIdx++; console.warn('[theater] style failed, falling back to', STYLES[styleIdx]); map.setStyle(STYLES[styleIdx]); }
      });
      const done = () => { if (settled || this.destroyed) return; settled = true; this._decorate(); this._addOverlay(); resolve(); };
      map.once('style.load', () => { styleOK = true; done(); });
      map.on('load', done);
      setTimeout(() => { if (!settled && !this.destroyed && map.isStyleLoaded && map.isStyleLoaded()) done(); }, 12000);
      setTimeout(() => {
        if (settled) return; settled = true;
        if (this.destroyed) return resolve();
        console.warn('[theater] basemap slow; continuing');
        try { this._addOverlay(); } catch { }
        // still add terrain / hillshade / buildings as soon as the style is usable (tiles may lag behind 'load')
        const late = () => { if (this.destroyed || this.map !== map) return; if (map.isStyleLoaded && map.isStyleLoaded()) this._decorate(); else this.timers0.push(setTimeout(late, 500)); };
        late(); resolve();
      }, 20000);
    });
  }

  /** Terrain, hillshade, sky and 3D buildings on top of the vector style. */
  _decorate() {
    const map = this.map; if (!map || map.getSource('bt-dem')) return;
    try {
      const layers = map.getStyle().layers || [];
      const firstSymbol = layers.find(l => l.type === 'symbol')?.id;
      const bld = layers.find(l => /building/.test(l.id))?.id;
      map.addSource('bt-dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      map.addSource('bt-hs', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      map.addLayer({ id: 'bt-hillshade', type: 'hillshade', source: 'bt-hs', paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#02040a', 'hillshade-highlight-color': '#2c3b52', 'hillshade-accent-color': '#0b1420', 'hillshade-illumination-direction': 315 } }, bld || firstSymbol);
      map.setTerrain({ source: 'bt-dem', exaggeration: 1.4 });
      const src = Object.entries(map.getStyle().sources || {}).find(([, s]) => s.type === 'vector')?.[0];
      if (src) map.addLayer({ id: 'bt-buildings-3d', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 12, paint: { 'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#18263a', 40, '#2a4166', 120, '#4c6fa5'], 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.2, ['coalesce', ['get', 'render_height'], 8]], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.88 } }, firstSymbol);
      try { map.setSky({ 'sky-color': '#061226', 'sky-horizon-blend': 0.85, 'horizon-color': '#173252', 'horizon-fog-blend': 0.85, 'fog-color': '#0b1626', 'fog-ground-blend': 0.55, 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0] }); } catch { }
    } catch (e) { console.warn('[theater] decorate', e.message); }
  }

  _addOverlay() {
    if (this.overlay) return;
    const D = window.deck;
    this.overlay = new D.MapboxOverlay({ interleaved: false, layers: [], getTooltip: info => this._tooltip(info), pickingRadius: 6 });
    this.map.addControl(this.overlay);
  }

  _tooltip({ object, layer }) {
    if (!object || !layer) return null;
    const id = layer.id; let html = '';
    if (id === 'bt-hq') html = `<b>${esc(object.label)}</b>`;
    else if (id === 'bt-cetOpps') html = `<b>${esc(object.title)}</b><div class="d">${esc(object.owner_or_agency || '')} · ${esc(object.city || '')}, ${esc(object.state || '')}</div><div>${object.est_value_usd ? money(object.est_value_usd) + ' est.' : 'Value not disclosed'} · fit ${esc(object.fit_score ?? '—')}</div>`;
    else if (id === 'bt-wwtp') html = `<b>${esc(object.facility_name)}</b><div class="d">${esc(object.town || '')}, ${esc(object.state || '')}</div><div>${object.design_flow_mgd != null ? esc(object.design_flow_mgd) + ' MGD design flow' : ''}${object.horton_fit != null ? ` · Horton fit ${esc(object.horton_fit)}` : ''}</div>`;
    else if (id === 'bt-ppTargets' || id === 'bt-cetTargets') html = `<b>${esc(object.company)}</b><div class="d">${esc(object.hq_city || '')}, ${esc(object.state || '')}</div><div>Fit score ${esc(object.fit_score ?? '—')}</div>`;
    else if (id === 'bt-cetCounties') html = `<b>${esc(object.county_name)}, ${esc(object.state)}</b><div>CET fit ${esc(object.cet_fit_score)} · ${esc(object.cet_fit_tier || '')}</div>`;
    else if (id === 'bt-alerts') html = `<b>${esc(object.properties?.event)}</b><div class="d">${esc(object.properties?.severity || '')}</div><div>${esc(String(object.properties?.areaDesc || '').slice(0, 160))}</div>`;
    else if (id === 'bt-sales' && object.count != null) html = `<b>${num(object.count)} sales</b> in this 1.5 km hex<div>Median ${money(object.colorValue)}</div>`;
    else if (id === 'bt-hubs') html = `<b>${esc(object.name)}</b><div class="d">Punctual Pros weather hub</div>`;
    else return null;
    return { html, className: 'bt-tip-deck', style: { background: 'var(--sys-surface)', color: 'var(--sys-ink-2)', border: '1px solid var(--sys-line-2)', borderRadius: 'var(--sys-r-xs)', boxShadow: 'var(--sys-sh-2)', fontSize: 'var(--sys-fs-xs)', lineHeight: '1.45', padding: '8px 10px', maxWidth: '280px', fontFamily: 'var(--sys-font)' } };
  }

  /* ── scene control ── */
  stats() {
    const b = this.base || {};
    const phaseLine = (() => {
      const m = b.months || {}; const cnt = p => (b.dest || []).filter(d => d.phase === p).length;
      return `Phase 2 tuck-ins across PA, NJ, MD, DE and southern NY${m[2] ? ` (${m[2]} mo)` : ''}; Phase 3 metro anchors along I-81 / I-95${m[3] ? ` (${m[3]} mo)` : ''}; Phase 4 a national consolidator inside the Authority Brands system${m[4] ? ` (${m[4]} mo)` : ''}. ${num(cnt(2) + cnt(3) + cnt(4))} anchor markets.`;
    })();
    return {
      platforms: b.stats?.platforms ?? 7, holdings: b.stats?.holdings ?? 6, addOns: b.stats?.addOns ?? 23, exits: b.stats?.exits ?? 1,
      ppCoreZips: b.zips?.length || 0, cetCounties: b.counties?.length || 0, ppTargets: b.tPP?.length || 0, cetTargets: b.tCET?.length || 0,
      cetOpps: b.opps?.length || 0, cetOppValue: (b.opps || []).reduce((a, o) => a + (o.est_value_usd || 0), 0), wwtp: b.wwtp?.length || 0, hubs: b.hubs?.length || 0,
      sales: this.salesReady ? S : null, salesError: this.salesError, alerts: this.alerts || null, phaseLine, nationwide: b.nationwide,
    };
  }
  _dataArrived(kind) {
    if (this.destroyed || !this.scene) return;
    if (this.scene.needs === kind) this._status(null);
    if (this.scene.needs === kind || this.scene.id === 'S6') { this._caption(this.scene, true); this._legend(this.scene); }
    this._invalidate();
    if (kind === 'sales' && !_cetSales) setTimeout(() => !this.destroyed && loadCetSales().then(s => { SC = s; this._invalidate(); }).catch(() => { }), 6000);
  }
  _invalidate() { this.layersCache = {}; this.dirty = true; }
  step(d) { const i = SCENES.indexOf(this.scene); const n = SCENES[(i + d + SCENES.length) % SCENES.length]; this.goTo(n.id); }
  goTo(id) { const s = SCENES.find(x => x.id === String(id).toUpperCase()); if (!s) return false; this._enter(s, false); return true; }
  play() { this.playing = true; this._syncPlay(); }
  pause() { this.playing = false; this._syncPlay(); }
  _syncPlay() { if (this.$play) { this.$play.textContent = this.playing ? '❚❚' : '▶'; this.$play.title = this.playing ? 'Pause (space)' : 'Play (space)'; } }

  _enter(scene, instant) {
    if (this.destroyed) return;
    this.scene = scene; this.elapsed = 0; this.sceneStart = performance.now(); this.arcT0 = scene.id === 'S3' ? performance.now() : 0;
    this.root.style.setProperty('--sc', scene.color);
    this.root.querySelectorAll('.bt-rail [data-s]').forEach(b => { const on = b.dataset.s === scene.id; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    for (const k of Object.keys(this.target)) this.target[k] = 0;
    for (const k of scene.layers) this.target[k] = 1;
    if (scene.id === 'S4' && !SC && S) loadCetSales().then(s => { SC = s; this._invalidate(); }).catch(() => { });
    if (scene.id === 'S5' && !this.alerts) loadAlerts(this.core).then(a => { this.alerts = a; this._dataArrived('alerts'); });
    this._invalidate();
    this._caption(scene, false);
    this._legend(scene);
    this._camera(scene, instant);
    if (scene.needs === 'sales' && !this.salesReady && !this.salesError) this._status('Loading home sales…');
    else if (scene.needs === 'alerts' && !this.alerts) this._status('Fetching live NWS alerts…');
    else this._status(null);
    try { this.opts.onScene && this.opts.onScene(scene.id, scene); } catch (e) { console.warn(e); }
    if (this.leaflet) this._fallbackScene(scene);
  }
  _camera(scene, instant) {
    for (const t of this.timers) clearTimeout(t); this.timers = [];
    const map = this.map; if (!map) return;
    const [k0, ...rest] = scene.keys; const cam = k => ({ center: k.center, zoom: k.zoom, pitch: k.pitch, bearing: k.bearing });
    map.stop();
    if (instant) map.jumpTo(cam(k0)); else map.flyTo({ ...cam(k0), duration: 3400, curve: 1.35, speed: 0.9, essential: true, easing: ease });
    const off = instant ? 0 : 1800;
    for (const k of rest) this.timers.push(setTimeout(() => { if (this.scene === scene && !this.destroyed) map.easeTo({ ...cam(k), duration: k.duration || 6000, easing: ease, essential: true }); }, k.at + off));
  }
  _caption(scene, update) {
    const cap = this.$cap;
    const fill = () => { if (this.scene !== scene) return; const c = scene.caption(this.stats()); cap.querySelector('.bt-kicker').textContent = c.kicker; cap.querySelector('.bt-title').textContent = c.title; cap.querySelector('.bt-line').textContent = c.line; cap.querySelector('.bt-src').textContent = c.src ? 'Source: ' + c.src : ''; };
    if (update) { fill(); return; }
    cap.classList.add('out'); clearTimeout(this._capT);
    this._capT = setTimeout(() => { fill(); cap.classList.remove('out'); }, 420);
  }
  _legend(scene) {
    const items = scene.legend ? scene.legend(this.stats()) : [];
    this.$legend.innerHTML = items.map(([kind, col, label, sub]) => kind === 'ramp' ? `<div class="li" style="flex-direction:column;align-items:flex-start;gap:4px"><span>${esc(label)}</span><span class="ramp" style="background:linear-gradient(90deg,${col.map(c => `rgb(${c.join(',')})`).join(',')})"></span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>` : `<div class="li"><span class="sw ${kind === 'ring' ? 'ring' : kind === 'line' ? 'ln' : ''}" style="background:${col};color:${col}"></span>${esc(label)}</div>`).join('');
    this.$legend.style.display = items.length ? '' : 'none';
  }

  /* ── render loop ── */
  _loop() {
    const tick = () => {
      if (this.destroyed) return;
      const now = performance.now();
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(500, now - (this.lastFrame || now)); this.lastFrame = now;
      const sc = this.scene; if (!sc) return;
      if (this.playing) { this.elapsed += dt; if (this.elapsed >= sc.duration) { this.step(1); return; } }
      if (this.$prog) this.$prog.style.width = (this.playing ? clamp(this.elapsed / sc.duration) * 100 : 0) + '%';
      let moving = false; const rate = 1 - Math.pow(0.045, dt / 1000 * 1.6);
      const keys = new Set([...Object.keys(this.alpha), ...Object.keys(this.target)]);
      for (const k of keys) { const a = this.alpha[k] || 0, t = this.target[k] || 0; if (Math.abs(a - t) > 0.004) { this.alpha[k] = a + (t - a) * rate; moving = true; } else this.alpha[k] = t; }
      const zb = this.map ? Math.round(this.map.getZoom() * 4) : 0; if (zb !== this._zb) { this._zb = zb; this.dirty = true; }
      const animated = (this.alpha.salesNew > 0.01 && S) || (this.alpha.arcs > 0.01 && this._arcsAnimating(now)) || (sc.zoomScaled && this.map && this.map.isMoving());
      if (!this.overlay || !(moving || animated || this.dirty)) return;
      this.dirty = false;
      try { this.overlay.setProps({ layers: this._layers(now) }); } catch (e) { console.warn('[theater] layers', e); }
    };
    this.raf = requestAnimationFrame(tick);
  }
  _arcsAnimating(now) { return this.scene?.id === 'S3' && now - this.arcT0 < 9000; }
  _arcProgress(d, now) {
    if (this.scene?.id !== 'S3' || !this.arcT0) return 1;
    const delay = 700 + (d.phase - 2) * 2600 + (d._i || 0) * 120;
    return easeOut((now - this.arcT0 - delay) / 1700);
  }

  _layers(now) {
    const D = window.deck; const b = this.base; if (!D || !b) return [];
    const A = k => this.alpha[k] || 0; const on = k => A(k) > 0.01; const out = [];
    const labelMode = this.scene?.labels || 'major'; const zoom = this.map ? this.map.getZoom() : 6;
    // near-constant on-screen size: at the z12.4 Worcester opener the old 0.6 exponent left 600 m columns and 4 km discs filling the frame
    const zf = c => (this.scene?.zoomScaled ? Math.pow(2, (c - zoom) * 0.9) : 1);

    if (on('ppCore') && b.zips.length) out.push(new D.HexagonLayer({ id: 'bt-ppCore', data: b.zips, getPosition: posLL, getElevationWeight: zipWeight, elevationAggregation: 'SUM', getColorWeight: zipWeight, colorAggregation: 'SUM', radius: 5000, coverage: 0.86, extruded: true, elevationRange: [0, 26000], elevationScale: easeOut(A('ppCore')), colorRange: [[120, 52, 10], [178, 84, 24], [226, 116, 44], [240, 138, 60], [255, 178, 110], [255, 222, 180]], opacity: 0.85 * A('ppCore'), material: { ambient: 0.55, diffuse: 0.6, shininess: 24 }, pickable: false }));
    if (on('cetCounties') && b.counties.length) out.push(new D.ColumnLayer({ id: 'bt-cetCounties', data: b.counties, getPosition: d => [d.centroid_lng, d.centroid_lat], getElevation: d => (d.cet_fit_score || 0) * 520, elevationScale: easeOut(A('cetCounties')), radius: 7500, diskResolution: 24, extruded: true, getFillColor: d => { const s = d.cet_fit_score || 0; const c = FIT_RANGE[Math.min(4, Math.floor(s / 20))]; return [...c, 215]; }, opacity: A('cetCounties'), pickable: true, material: { ambient: 0.6, diffuse: 0.6 } }));
    if (on('cetSales') && SC && this.scene?.id === 'S4') out.push(new D.HexagonLayer({ id: 'bt-cetSales', data: SC.idx, getPosition: cetSalesPos, radius: 2200, coverage: 0.9, extruded: true, elevationRange: [0, 3500], elevationScale: easeOut(A('cetSales')), colorRange: [[16, 30, 58], [22, 44, 84], [30, 60, 112], [40, 78, 140], [52, 98, 170], [70, 120, 200]], opacity: 0.55 * A('cetSales'), pickable: false, gpuAggregation: true }));
    if (on('sales') && S) {
      out.push(new D.HexagonLayer({ id: 'bt-sales', data: S.idx, getPosition: salesPos, getColorValue: salesMedian, gpuAggregation: false, colorScaleType: 'quantile', colorRange: PRICE_RANGE, radius: 1500, coverage: 0.88, extruded: true, elevationRange: [0, 22000], elevationUpperPercentile: 99.5, elevationScale: easeOut(A('sales')), opacity: (this.scene?.id === 'S6' ? 0.75 : 0.95) * A('sales'), material: { ambient: 0.5, diffuse: 0.65, shininess: 40, specularColor: [80, 80, 80] }, pickable: this.scene?.id === 'S2' }));
    }
    if (on('salesNew') && S && S.recent.length) {
      const ph = (now / 1000) * 2.2; const pulse = 0.5 + 0.5 * Math.sin(ph);
      out.push(new D.ScatterplotLayer({ id: 'bt-salesNew-glow', data: S.recent, getPosition: salesPos, getRadius: 520, radiusUnits: 'meters', radiusScale: 0.6 + 1.4 * pulse, radiusMinPixels: 2, radiusMaxPixels: 26, getFillColor: [255, 214, 140, 60], opacity: A('salesNew') * (0.25 + 0.5 * (1 - pulse)), parameters: { depthCompare: 'always', depthWriteEnabled: false } }));
      out.push(new D.ScatterplotLayer({ id: 'bt-salesNew', data: S.recent, getPosition: salesPos, getRadius: 170, radiusUnits: 'meters', radiusMinPixels: 1.4, radiusMaxPixels: 6, getFillColor: [255, 236, 190, 235], opacity: A('salesNew'), parameters: { depthCompare: 'always', depthWriteEnabled: false } }));
    }
    if (on('arcs') && b.dest.length) {
      const dest = b.dest; dest.forEach((d, i) => { d._i = dest.filter((x, j) => j < i && x.phase === d.phase).length; d._p = this._arcProgress(d, now); });
      const tick = Math.round(now / 16);
      const visible = dest.filter(d => d._p > 0.001);
      out.push(new D.ArcLayer({ id: 'bt-arcs', data: visible, getSourcePosition: () => PP_ORIGIN, getTargetPosition: d => [PP_ORIGIN[0] + (d.lon - PP_ORIGIN[0]) * d._p, PP_ORIGIN[1] + (d.lat - PP_ORIGIN[1]) * d._p], getSourceColor: d => [...rgb(PHASE_COL[d.phase]), 90], getTargetColor: d => [...rgb(PHASE_COL[d.phase]), 255], getWidth: d => (d.phase === 4 ? 3.2 : 2.6), widthMinPixels: 1.5, getHeight: d => (d.phase === 2 ? 0.55 : 0.42), getTilt: d => (d.phase === 4 ? 8 : 0), greatCircle: false, opacity: A('arcs'), updateTriggers: { getTargetPosition: tick } }));
      out.push(new D.ScatterplotLayer({ id: 'bt-arc-ends', data: visible.filter(d => d._p > 0.98), getPosition: posLL, getRadius: 9000, radiusMinPixels: 3, radiusMaxPixels: 9, getFillColor: d => [...rgb(PHASE_COL[d.phase]), 230], stroked: true, getLineColor: [255, 255, 255, 200], lineWidthMinPixels: 1, opacity: A('arcs') }));
      const minZ = { 2: 5.3, 3: 4.7, 4: 0 };
      if (on('destLabels')) out.push(new D.TextLayer({ id: 'bt-destLabels', data: visible.filter(d => d._p > 0.98 && zoom >= (this.scene?.id === 'S6' ? 99 : minZ[d.phase])), getPosition: posLL, getText: d => d.name, getSize: 12.5, getColor: d => [...rgb(PHASE_COL[d.phase]).map(v => Math.min(255, v + 50)), 255], getPixelOffset: [10, 0], getTextAnchor: 'start', getAlignmentBaseline: 'center', fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 600, fontSettings: { sdf: true, radius: 12, buffer: 6 }, outlineWidth: 3, outlineColor: [5, 8, 12, 230], opacity: A('destLabels'), billboard: true, parameters: { depthCompare: 'always' } }));
    }
    if (on('ppTargets') && b.tPP.length) out.push(new D.ColumnLayer({ id: 'bt-ppTargets', data: b.tPP, getPosition: posLL, getElevation: d => Math.max(10, d.fit_score || 40) * 520, elevationScale: easeOut(A('ppTargets')), radius: 3200, diskResolution: 16, extruded: true, getFillColor: d => (d.fit_score || 0) >= 70 ? [255, 179, 122, 240] : [200, 120, 70, 200], opacity: A('ppTargets'), pickable: true, material: { ambient: 0.6, diffuse: 0.6 } }));
    if (on('cetOpps') && b.opps.length) out.push(new D.ColumnLayer({ id: 'bt-cetOpps', data: b.opps, getPosition: posLL, getElevation: d => d.est_value_usd > 1e5 ? 1400 + 3400 * Math.log10(d.est_value_usd / 1e5) : 1100, elevationScale: easeOut(A('cetOpps')) * (this.scene?.id === 'S6' ? 3 : 1), radius: this.scene?.id === 'S6' ? 6000 : clamp(1300 * zf(9.8), 150, 4200), diskResolution: 20, extruded: true, getFillColor: d => [...rgb(CAP_COL[(d.capability_match || [])[0]] || '#8ab4ff'), 235], opacity: A('cetOpps'), pickable: true, material: { ambient: 0.55, diffuse: 0.65, shininess: 32 }, updateTriggers: { getElevation: 1 } }));
    if (on('wwtp') && b.wwtp.length) {
      const big = this.scene?.id === 'S6' ? 2.2 : clamp(zf(9.5), 0.2, 1.9);
      out.push(new D.ScatterplotLayer({ id: 'bt-wwtp', data: b.wwtp, getPosition: d => [d.lon, d.lat, 1600 * big], getRadius: d => Math.min(9000, 380 + 820 * Math.sqrt(d.design_flow_mgd || 0.5)) * big, radiusUnits: 'meters', billboard: false, filled: true, stroked: true, getFillColor: d => [63, 208, 224, 40 + Math.round((d.horton_fit || 50) * 0.9)], getLineColor: [150, 240, 250, 230], lineWidthUnits: 'pixels', getLineWidth: 1.2, opacity: A('wwtp'), pickable: true, updateTriggers: { getPosition: big, getRadius: big } }));
    }
    if (on('alerts') && this.alerts?.features?.length) out.push(new D.GeoJsonLayer({ id: 'bt-alerts', data: this.alerts.features, extruded: true, wireframe: true, filled: true, stroked: false, getElevation: f => (SEV[f.properties.severity] || SEV.Unknown).h, elevationScale: easeOut(A('alerts')), getFillColor: f => [...(SEV[f.properties.severity] || SEV.Unknown).c, 88], getLineColor: f => [...(SEV[f.properties.severity] || SEV.Unknown).c, 200], opacity: A('alerts'), pickable: true, material: { ambient: 0.7, diffuse: 0.5 } }));
    if (on('territory') && b.terr.length && !(this.alerts?.features?.length)) out.push(new D.TextLayer({ id: 'bt-territory', data: b.terr, getPosition: posLL, getText: d => d.name, getSize: 11, getColor: [255, 214, 170, 210], fontFamily: 'JetBrains Mono, Menlo, monospace', fontWeight: 600, characterSet: 'auto', fontSettings: { sdf: true, radius: 12, buffer: 6 }, outlineWidth: 3, outlineColor: [5, 8, 12, 220], opacity: A('territory') * 0.9, getPixelOffset: [0, 14], parameters: { depthCompare: 'always' } }));
    if (on('hubs') && b.hubs.length) {
      out.push(new D.ScatterplotLayer({ id: 'bt-hubs', data: b.hubs, getPosition: posLL, getRadius: 2600, radiusMinPixels: 4, radiusMaxPixels: 14, stroked: true, filled: true, getFillColor: [255, 255, 255, 40], getLineColor: [255, 255, 255, 230], lineWidthMinPixels: 1.5, opacity: A('hubs'), pickable: true, parameters: { depthCompare: 'always' } }));
      if (this.scene?.id === 'S5') out.push(new D.TextLayer({ id: 'bt-hubLabels', data: b.hubs, getPosition: posLL, getText: d => d.name, getSize: 12, getColor: [255, 255, 255, 235], getPixelOffset: [0, -16], fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 600, fontSettings: { sdf: true, radius: 12, buffer: 6 }, outlineWidth: 3, outlineColor: [5, 8, 12, 230], opacity: A('hubs'), parameters: { depthCompare: 'always' } }));
    }
    if (on('hq')) {
      const ph = 0.5 + 0.5 * Math.sin(now / 900);
      out.push(new D.ScatterplotLayer({ id: 'bt-hq-glow', data: HQ, getPosition: posLL, getRadius: 16, radiusUnits: 'pixels', getFillColor: d => [...rgb(d.hex), 70], opacity: A('hq') * (0.5 + 0.4 * ph), parameters: { depthCompare: 'always', depthWriteEnabled: false } }));
      out.push(new D.ScatterplotLayer({ id: 'bt-hq', data: HQ, getPosition: posLL, getRadius: 6, radiusUnits: 'pixels', stroked: true, getFillColor: d => [...rgb(d.hex), 255], getLineColor: [255, 255, 255, 255], getLineWidth: 2, lineWidthUnits: 'pixels', opacity: A('hq'), pickable: true, parameters: { depthCompare: 'always', depthWriteEnabled: false } }));
      const lab = this.layersCache['hqlab:' + labelMode] || (this.layersCache['hqlab:' + labelMode] = HQ.filter(h => h.group.includes(labelMode)));
      if (lab.length)
      out.push(new D.TextLayer({ id: 'bt-hq-labels', data: lab, getPosition: posLL, getText: d => (labelMode === 'major' ? d.label.replace(/ · .*/, '') : d.label), getSize: labelMode === 'major' ? 13 : 12.5, getColor: [255, 255, 255, 245], getPixelOffset: [12, 0], getTextAnchor: 'start', getAlignmentBaseline: 'center', fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 700, characterSet: 'auto', fontSettings: { sdf: true, radius: 12, buffer: 6 }, outlineWidth: 3.2, outlineColor: [5, 8, 12, 235], opacity: A('hq'), parameters: { depthCompare: 'always' }, updateTriggers: { getText: labelMode, getSize: labelMode } }));
    }
    return out;
  }

  /* ── WebGL-less fallback: static Leaflet via core Maps ── */
  async _fallback(reason, baseP) {
    this.root.classList.add('lite');
    const note = document.createElement('div'); note.className = 'bt-fallback'; note.innerHTML = esc(reason); this.root.appendChild(note);
    this._status('Loading 2D fallback…');
    try {
      loadCss(LIBS.leafletCss, 'leaflet-css-theater');
      if (!window.L) await loadScript(LIBS.leafletJs, 'L');
      this.base = await baseP; if (this.destroyed) return;
      const M = this.core.Maps; const map = M.create(this.$map, { center: [40.5, -76], zoom: 6 }); this.leaflet = map;
      for (const h of HQ) M.marker(map, h.lat, h.lon, { color: h.hex, label: h.short, popup: esc(h.label) });
      const L = window.L; this.fl = {};
      this.fl.pp = M.points(map, this.base.zips, { color: C.pp, radius: 3, cluster: false, opacity: 0.6, weight: 0 }); map.removeLayer(this.fl.pp.layer);
      this.fl.cet = M.points(map, this.base.opps, { color: C.cet, radius: 5, cluster: false, popup: o => `<b>${esc(o.title)}</b><br>${money(o.est_value_usd)}` }); map.removeLayer(this.fl.cet.layer);
      this.fl.wwtp = M.points(map, this.base.wwtp, { color: C.cyan, radius: 4, cluster: false, opacity: 0.5 }); map.removeLayer(this.fl.wwtp.layer);
      this.fl.tgt = M.points(map, this.base.tPP, { color: '#ffb37a', radius: 5, cluster: false, popup: t => `<b>${esc(t.company)}</b><br>Fit ${esc(t.fit_score)}` }); map.removeLayer(this.fl.tgt.layer);
      this.fl.arcs = L.layerGroup(this.base.dest.map(d => L.polyline([[PP_ORIGIN[1], PP_ORIGIN[0]], [d.lat, d.lon]], { color: PHASE_COL[d.phase], weight: 2, opacity: 0.8 }).bindTooltip(esc(d.name))));
      this._status(null);
      loadSales().then(s => { S = s; this.salesReady = true; this.fl.sales = M.points(map, Array.from(s.recent, i => ({ lat: s.LAT[i], lon: s.LON[i] })), { color: '#ffe9b0', radius: 2.5, cluster: true }); map.removeLayer(this.fl.sales.layer); this._dataArrived('sales'); if (this.scene) this._fallbackScene(this.scene); }).catch(() => { this.salesError = true; });
      loadAlerts(this.core).then(a => { this.alerts = a; this.fl.alerts = L.geoJSON({ type: 'FeatureCollection', features: a.features }, { style: f => ({ color: `rgb(${(SEV[f.properties.severity] || SEV.Unknown).c.join(',')})`, weight: 1, fillOpacity: 0.2 }) }); this._dataArrived('alerts'); if (this.scene) this._fallbackScene(this.scene); });
      const first = SCENES.find(s => s.id === String(this.opts.scene || '').toUpperCase()) || SCENES[0];
      this._enter(first, true); this._loop();
    } catch (e) { this._status('2D fallback unavailable: ' + e.message); }
  }
  _fallbackScene(scene) {
    const map = this.leaflet; if (!map) return; const fl = this.fl || {};
    const want = { S1: ['pp', 'cet'], S2: ['sales'], S3: ['arcs', 'tgt'], S4: ['cet', 'wwtp'], S5: ['pp', 'alerts'], S6: ['pp', 'cet', 'wwtp', 'tgt', 'arcs', 'alerts'] }[scene.id] || [];
    for (const [k, g] of Object.entries(fl)) { if (!g) continue; const lyr = g.layer || g; const has = map.hasLayer(lyr); if (want.includes(k) && !has) lyr.addTo(map); else if (!want.includes(k) && has) map.removeLayer(lyr); }
    const k = scene.keys[scene.keys.length - 1]; map.flyTo([k.center[1], k.center[0]], Math.round(k.zoom + 0.6), { duration: 1.2 });
  }

  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.raf); for (const t of [...this.timers, ...this.timers0]) clearTimeout(t); clearTimeout(this._capT);
    window.removeEventListener('keydown', this._onKey);
    try { this.map && this.map.remove(); } catch { }
    try { this.leaflet && this.leaflet.remove(); } catch { }
    this.root?.remove(); this.map = null; this.overlay = null;
  }
  state() { return { scene: this.scene?.id, playing: this.playing, elapsed: Math.round(this.elapsed), salesReady: !!this.salesReady, alerts: this.alerts ? { count: this.alerts.count, polys: this.alerts.polys } : null, fallback: !!this.leaflet, layers: Object.entries(this.alpha).filter(([, a]) => a > 0.5).map(([k]) => k) }; }
}

/* ── public API ───────────────────────────────────────────────────────────── */
let current = null;
export const Theater = {
  scenes: SCENES.map(s => ({ id: s.id, name: s.name, duration: s.duration })),
  /** Mount into el. opts: {autoplay, scene, onScene(id, scene), core:{Data, Live, Maps}, forceFallback}. Returns a promise that resolves when the first scene is on screen. */
  async mount(el, opts = {}) {
    if (current) current.destroy();
    const qp = new URLSearchParams(location.search);
    const o = { ...opts }; if (o.scene == null && qp.get('scene')) o.scene = qp.get('scene'); if (o.autoplay == null && qp.has('autoplay')) o.autoplay = qp.get('autoplay') !== '0';
    current = new TheaterInstance(el, o); window.BSPTheater = Theater;
    await current.ready; return Theater;
  },
  play() { current?.play(); }, pause() { current?.pause(); },
  goTo(id) { return current ? current.goTo(id) : false; },
  next() { current?.step(1); }, prev() { current?.step(-1); },
  destroy() { if (current) { current.destroy(); current = null; } },
  state() { return current ? current.state() : null; },
  get map() { return current?.map || null; },
};
window.BSPTheater = Theater;
export default Theater;
