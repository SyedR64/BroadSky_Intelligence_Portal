/* Frontline Managed Services — legal managed IT, cyber and revenue-cycle services for law firms.
   Views: overview · amlaw · midsize · targets · filings. Data: fl_lawfirms, research/fl_midsize_firms,
   research/ma_targets_fl_ts (platform==='frontline'), research/frontline_filings, research/public_comps. */
import { renderTargets, renderFilings, fitTierOf } from '../assets/components.js?v=20260924203049';

const COLOR = 'var(--c-fl)', HEX = '#9d7bff';
const TIER_HEX = { 'Tier 1': '#2ecc8f', 'Tier 2': '#4c8dff', 'Tier 3': '#f5b73d', 'Tier 4': '#5b6b7f' };
const AI_HEX = { planning: '#2ecc8f', partial: '#4c8dff', none: '#5b6b7f' };
const AI_LABEL = { planning: 'Planning AI program', partial: 'Partial / pilots', none: 'No public signal' };
const CYBER_HEX = ['#5b6b7f', '#5b6b7f', '#8ab4ff', '#f5b73d', '#f08a3c', '#ff5c5c'];
const OFFER_LABEL = { managed_it: 'Managed IT', bundle: 'Bundle (IT+cyber+RCM)', ebilling: 'eBilling / RCM', service_desk: 'Service desk', cyber: 'Cybersecurity' };
const OFFER_HEX = { managed_it: '#4c8dff', bundle: '#9d7bff', ebilling: '#f5b73d', service_desk: '#3fd0e0', cyber: '#ff5c5c' };
const OFFICE_METRO = /new york|st\.? louis|toledo|cleveland|columbus|ohio|honolulu|nashville|washington/i;
const AMLAW_SRC = ['AM Law 200 (2025) rankings + analyst scoring', 'https://www.law.com/americanlawyer/'];
const FL_SRC = ['frontlinems.com (About, press)', 'https://frontlinems.com/about-frontline/'];

/* Frontline offices (frontlinems.com About page; frontline_filings fl-010). */
const OFFICES = [
  { name: 'St. Louis, MO', lat: 38.627, lon: -90.1994, role: 'HQ · service desk · RCM' },
  { name: 'Toledo, OH', lat: 41.6528, lon: -83.5379, role: 'Service desk hub (~200 jobs, 2020)' },
  { name: 'New York, NY', lat: 40.7128, lon: -74.006, role: 'Glasser Tech legacy · NYC legal IT' },
  { name: 'Washington, DC', lat: 38.9072, lon: -77.0369, role: 'Regional office' },
  { name: 'Nashville, TN', lat: 36.1627, lon: -86.7816, role: 'Regional office' },
  { name: 'Honolulu, HI', lat: 21.3069, lon: -157.8583, role: 'Pacific time-zone coverage' },
  { name: 'Toronto, ON', lat: 43.6532, lon: -79.3832, role: 'Canada (since 2010)' },
  { name: 'London, UK', lat: 51.5074, lon: -0.1278, role: 'UK / EMEA (since 2009)' },
  { name: 'Hyderabad, IN', lat: 17.385, lon: 78.4867, role: 'Offshore delivery' },
  { name: 'Goa, IN', lat: 15.4909, lon: 73.8278, role: 'Offshore delivery · RCM' },
  { name: 'Cape Town, ZA', lat: -33.9249, lon: 18.4241, role: 'Follow-the-sun desk (Jul 2023)' },
];

/* City → lat/lon for US legal markets (city centroids), then state centroids as fallback. */
const CITY = {
  'New York|NY': [40.7128, -74.006], 'Chicago|IL': [41.8781, -87.6298], 'Los Angeles|CA': [34.0522, -118.2437], 'Philadelphia|PA': [39.9526, -75.1652],
  'Boston|MA': [42.3601, -71.0589], 'Kansas City|MO': [39.0997, -94.5786], 'Washington|DC': [38.9072, -77.0369], 'Minneapolis|MN': [44.9778, -93.265],
  'Cleveland|OH': [41.4993, -81.6944], 'San Francisco|CA': [37.7749, -122.4194], 'Atlanta|GA': [33.749, -84.388], 'Houston|TX': [29.7604, -95.3698],
  'Pittsburgh|PA': [40.4406, -79.9959], 'Cincinnati|OH': [39.1031, -84.512], 'Detroit|MI': [42.3314, -83.0458], 'Seattle|WA': [47.6062, -122.3321],
  'Miami|FL': [25.7617, -80.1918], 'Milwaukee|WI': [43.0389, -87.9065], 'Indianapolis|IN': [39.7684, -86.1581], 'Phoenix|AZ': [33.4484, -112.074],
  'Newark|NJ': [40.7357, -74.1724], 'Fort Lauderdale|FL': [26.1224, -80.1373], 'Louisville|KY': [38.2527, -85.7585], 'Birmingham|AL': [33.5186, -86.8104],
  'St. Louis|MO': [38.627, -90.1994], 'Saint Louis|MO': [38.627, -90.1994], 'Clayton|MO': [38.6426, -90.3237], 'Columbus|OH': [39.9612, -82.9988], 'Tampa|FL': [27.9506, -82.4572],
  'Palo Alto|CA': [37.4419, -122.143], 'Silicon Valley|CA': [37.3875, -122.0575], 'Richmond|VA': [37.5407, -77.436], 'Winston-Salem|NC': [36.0999, -80.2442],
  'Roseland|NJ': [40.8207, -74.2938], 'Portland|OR': [45.5152, -122.6784], 'Greenville|SC': [34.8526, -82.394], 'White Plains|NY': [41.034, -73.7629],
  'Birmingham|MI': [42.5467, -83.2113], 'Dallas|TX': [32.7767, -96.797], 'Hartford|CT': [41.7658, -72.6734], 'Grand Rapids|MI': [42.9634, -85.6681],
  'Baltimore|MD': [39.2904, -76.6122], 'Buffalo|NY': [42.8864, -78.8784], 'Columbia|SC': [34.0007, -81.0348], 'Akron|OH': [41.0814, -81.519],
  'Orlando|FL': [28.5383, -81.3792], 'Ridgeland|MS': [32.4285, -90.1323], 'Omaha|NE': [41.2565, -95.9345], 'West Palm Beach|FL': [26.7153, -80.0534],
  'Toledo|OH': [41.6528, -83.5379], 'Nashville|TN': [36.1627, -86.7816], 'Rochester|NY': [43.1566, -77.6088], 'Portland|ME': [43.6591, -70.2568],
  'Harrisburg|PA': [40.2732, -76.8867], 'Irvine|CA': [33.6846, -117.8265], 'Leesburg|VA': [39.1157, -77.5636], 'Raleigh|NC': [35.7796, -78.6382],
  'Southfield|MI': [42.4734, -83.2219], 'Austin|TX': [30.2672, -97.7431], 'San Antonio|TX': [29.4241, -98.4936], 'Fort Worth|TX': [32.7555, -97.3308],
  'Denver|CO': [39.7392, -104.9903], 'Salt Lake City|UT': [40.7608, -111.891], 'San Diego|CA': [32.7157, -117.1611], 'Las Vegas|NV': [36.1699, -115.1398],
  'New Orleans|LA': [29.9511, -90.0715], 'Memphis|TN': [35.1495, -90.049], 'Charlotte|NC': [35.2271, -80.8431], 'Jacksonville|FL': [30.3322, -81.6557],
  'Sacramento|CA': [38.5816, -121.4944], 'Albany|NY': [42.6526, -73.7562], 'Providence|RI': [41.824, -71.4128], 'Oklahoma City|OK': [35.4676, -97.5164],
  'Tulsa|OK': [36.154, -95.9928], 'Des Moines|IA': [41.5868, -93.625], 'Little Rock|AR': [34.7465, -92.2896], 'Jackson|MS': [32.2988, -90.1848],
  'Charleston|SC': [32.7765, -79.9311], 'Charleston|WV': [38.3498, -81.6326], 'Boise|ID': [43.615, -116.2023], 'Albuquerque|NM': [35.0844, -106.6504],
  'Honolulu|HI': [21.3069, -157.8583], 'Wilmington|DE': [39.7391, -75.5398], 'Stamford|CT': [41.0534, -73.5387], 'Morristown|NJ': [40.7968, -74.4815],
  'Princeton|NJ': [40.3573, -74.6672], 'Overland Park|KS': [38.9822, -94.6708], 'Wichita|KS': [37.6872, -97.3301], 'Lexington|KY': [38.0406, -84.5037],
  'Knoxville|TN': [35.9606, -83.9207], 'Chattanooga|TN': [35.0456, -85.3097], 'Dayton|OH': [39.7589, -84.1916], 'Syracuse|NY': [43.0481, -76.1474],
  'Madison|WI': [43.0731, -89.4012], 'Anchorage|AK': [61.2181, -149.9003], 'Spokane|WA': [47.6588, -117.426], 'Tallahassee|FL': [30.4383, -84.2807],
  'Baton Rouge|LA': [30.4515, -91.1871], 'Mobile|AL': [30.6954, -88.0399], 'Tucson|AZ': [32.2226, -110.9747], 'Scottsdale|AZ': [33.4942, -111.9261],
  'Boca Raton|FL': [26.3683, -80.1289], 'Coral Gables|FL': [25.7215, -80.2684], 'Long Island|NY': [40.7891, -73.1349], 'Garden City|NY': [40.7268, -73.6343],
  'Melville|NY': [40.7934, -73.4151], 'Uniondale|NY': [40.7004, -73.593], 'Cherry Hill|NJ': [39.9348, -75.0307], 'Bethesda|MD': [38.9847, -77.0947],
  'Tysons|VA': [38.9187, -77.2311], 'McLean|VA': [38.9339, -77.1773], 'Reston|VA': [38.9586, -77.357], 'Norfolk|VA': [36.8508, -76.2859],
  'Virginia Beach|VA': [36.8529, -75.978], 'Greensboro|NC': [36.0726, -79.792], 'Durham|NC': [35.994, -78.8986], 'Savannah|GA': [32.0809, -81.0912],
  'Springfield|IL': [39.7817, -89.6501], 'Springfield|MO': [37.209, -93.2923], 'Springfield|MA': [42.1015, -72.5898], 'Worcester|MA': [42.2626, -71.8023],
  'New Haven|CT': [41.3083, -72.9279], 'Manchester|NH': [42.9956, -71.4548], 'Burlington|VT': [44.4759, -73.2121], 'Santa Monica|CA': [34.0195, -118.4912],
  'Century City|CA': [34.0557, -118.4166], 'Pasadena|CA': [34.1478, -118.1445], 'Newport Beach|CA': [33.6189, -117.9298], 'Oakland|CA': [37.8044, -122.2712],
  'San Jose|CA': [37.3382, -121.8863], 'Fresno|CA': [36.7378, -119.7871], 'Reno|NV': [39.5296, -119.8138], 'Bellevue|WA': [47.6101, -122.2015],
  'St. Paul|MN': [44.9537, -93.09], 'Saint Paul|MN': [44.9537, -93.09], 'Fargo|ND': [46.8772, -96.7898], 'Sioux Falls|SD': [43.5446, -96.7311],
  'Lincoln|NE': [40.8136, -96.7026], 'Evansville|IN': [37.9716, -87.5711], 'Fort Wayne|IN': [41.0793, -85.1394], 'Peoria|IL': [40.6936, -89.589],
  'Lansing|MI': [42.7325, -84.5555], 'Ann Arbor|MI': [42.2808, -83.743], 'Troy|MI': [42.6064, -83.1498], 'Canton|OH': [40.7989, -81.3784],
  'Youngstown|OH': [41.0998, -80.6495], 'Wheeling|WV': [40.064, -80.7209], 'Scranton|PA': [41.4089, -75.6624], 'Allentown|PA': [40.6084, -75.4902],
  'Lancaster|PA': [40.0379, -76.3055], 'Wilkes-Barre|PA': [41.2459, -75.8813], 'Toronto|ON': [43.6532, -79.3832], 'London|UK': [51.5074, -0.1278],
};
const STATE = { AL: [32.8, -86.8], AK: [61.4, -152.3], AZ: [34.2, -111.7], AR: [34.9, -92.4], CA: [36.8, -119.4], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.7, -83.4], HI: [21.3, -157.8], ID: [44.2, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.0, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.3, -69.2], MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [43.3, -84.5], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.5, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [44.0, -120.5], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.0, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.9], WY: [43.0, -107.6] };
const geo = (city, st) => { const c = String(city || '').replace(/\s+/g, ' ').trim(), s = String(st || '').trim().toUpperCase(); return CITY[`${c}|${s}`] || CITY[`${c.replace(/^St\.? /, 'St. ')}|${s}`] || (STATE[s] ? [...STATE[s], 'state'] : null); };

/* ── helpers ────────────────────────────────────────────────────────────── */
const n = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);
const sum = (a, f) => a.reduce((s, x) => s + (n(f(x)) || 0), 0);
const median = a => { const v = a.filter(x => x != null).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const countBy = (a, f) => a.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const pctTxt = (v, d = 1) => v == null || isNaN(v) ? '—' : `${Number(v).toFixed(d)}%`;   // values already in percent units
const cssOnce = () => { if (!document.getElementById('css-fl')) { const l = document.createElement('link'); l.id = 'css-fl'; l.rel = 'stylesheet'; l.href = 'modules/fl.css?v=20260924203049'; document.head.appendChild(l); } };
const root = el => { el.classList.add('m-fl'); return el; };
const unroot = el => () => el.classList.remove('m-fl');
const pips = (v, max = 5) => { const x = Math.round(n(v) || 0); return `<span class="pips" style="--pc:${CYBER_HEX[Math.min(5, x)]}">${Array.from({ length: max }, (_, i) => `<i class="${i < x ? 'on' : ''}"></i>`).join('')}</span><span class="pv">${x || '—'}</span>`; };
const aiChip = (fmt, v) => fmt.chip(v || '—', AI_HEX[v] || 'var(--dim)');
const SVC_SHORT = ['IT', 'Desk', 'Cyber', 'RCM', 'AI'];
const svcChips = (fmt, f) => f._bundle.map((b, i) => b.fit === 'High' ? fmt.chip(SVC_SHORT[i], ['#4c8dff', '#3fd0e0', '#ff5c5c', '#f5b73d', '#2ecc8f'][i]) : '').join(' ') || '<span class="dim small">none High</span>';
/* Keep Leaflet maps sized to late layout changes (grid stretch, fonts); fit once the container settles. */
const autoSize = (map, fit) => { let t = null, n0 = 0; const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { map.invalidateSize({ animate: false }); if (fit && n0++ < 3) fit(); }, 60); }); ro.observe(map.getContainer()); return () => { clearTimeout(t); ro.disconnect(); }; };
const fitRows = (map, rows, maxZoom = 6) => { const v = rows.filter(r => r.lat != null && r.lon != null && r.lon > -130 && r.lat > 23); /* contiguous US: Honolulu stays plotted, not fitted */ if (v.length) map.fitBounds(L.latLngBounds(v.map(r => [r.lat, r.lon])), { padding: [18, 18], maxZoom, animate: false }); };
const coName = s => /[a-z]/.test(String(s || '')) ? String(s) : String(s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Inc|Ltd)\b\.?/g, '$1.').replace(/\.\./g, '.');
/* ui.table re-binds its CSV button on every sort/page render; intercept in the capture phase so the full-field export always wins. */
const csvOverride = (host, fn) => host && host.addEventListener('click', e => { if (e.target.closest('[data-export]')) { e.stopPropagation(); e.preventDefault(); fn(); } }, true);
const googleNews = q => `https://www.google.com/search?tbm=nws&q=${encodeURIComponent(q)}`;

/* Normalise fl_lawfirms rows once. Revenue is null for ~half the list → est. from attorneys × band-median revenue/lawyer. */
let _firms = null;
async function loadFirms(data) {
  if (_firms) return _firms;
  const raw = await data.load('fl_lawfirms');
  const rplBand = {};
  for (const band of new Set(raw.map(r => r.tier_label))) rplBand[band] = median(raw.filter(r => r.tier_label === band).map(r => n(r.revenue_per_lawyer_k)));
  const byCity = {};
  _firms = raw.map((r, i) => {
    const g = geo(r.hq_city, r.hq_state); const key = `${r.hq_city}|${r.hq_state}`; const k = byCity[key] = (byCity[key] ?? -1) + 1;
    const a = k * 2.39996, rad = k ? 0.13 * Math.sqrt(k) : 0;   // golden-angle spiral so co-located HQs stay visible
    const rev = n(r.revenue_m), rpl = n(r.revenue_per_lawyer_k) ?? rplBand[r.tier_label];
    const revEst = rev ?? (rpl && r.attorney_count ? (rpl * r.attorney_count) / 1000 : null);
    const f = { ...r, id: `fl-firm-${i}`, _hq: `${r.hq_city}, ${r.hq_state}`, lat: g ? g[0] + rad * Math.sin(a) : null, lon: g ? g[1] + rad * Math.cos(a) * 1.3 : null, _geoState: g?.[2] === 'state',
      _rev: revEst, _revIsEst: rev == null, _rpl: n(r.revenue_per_lawyer_k), _cyber: n(r.cyber_urgency_score) || 0, _size: r.attorney_count >= 1000 ? '1,000+' : r.attorney_count >= 500 ? '500–999' : r.attorney_count >= 250 ? '250–499' : '<250' };
    f._rcm = f._cyber >= 4 || r.ai_opportunity_signal === 'planning';
    f._bundle = bundleFor(f); f._lead = f._bundle.slice().sort((x, y) => y.w - x.w)[0];
    return f;
  });
  return _firms;
}

/* Recommended service bundle per firm (rules on the scored fields; transparent in the inspector). */
function bundleFor(f) {
  const lvl = w => w >= 3 ? 'High' : w >= 2 ? 'Medium' : 'Low';
  const it = f.office_count >= 15 || f.international_offices ? 3 : f.office_count >= 6 ? 2 : 1;
  const sd = f.attorney_count >= 1000 ? 3 : f.attorney_count >= 400 ? 2 : 1;
  const cy = f._cyber >= 4 ? 3 : f._cyber === 3 ? 2 : 1;
  const rc = (f._rev || 0) >= 1000 || f.attorney_count >= 1000 ? 3 : f.attorney_count >= 400 ? 2 : 1;
  const ai = f.ai_opportunity_signal === 'planning' ? 3 : f.ai_opportunity_signal === 'partial' ? 2 : 1;
  return [
    { svc: 'Managed IT & infrastructure', w: it + 0.1, fit: lvl(it), why: `${f.office_count} offices${f.international_offices ? ' incl. international' : ''} — follow-the-sun coverage from St. Louis/Toledo + Hyderabad/Goa/Cape Town` },
    { svc: '24/7 legal service desk', w: sd, fit: lvl(sd), why: `${Number(f.attorney_count).toLocaleString()} attorneys (≈${Math.round(f.attorney_count * 2).toLocaleString()} end users incl. staff, est. 1:1)` },
    { svc: 'Cybersecurity (MDR / OCG audits)', w: cy + 0.2, fit: lvl(cy), why: `Cyber urgency ${f._cyber}/5 — ${f.practice_areas ? String(f.practice_areas).split(',').slice(0, 2).join(', ') : 'sensitive matters'} data exposure` },
    { svc: 'Revenue cycle (eBilling · AR · accounting)', w: rc + 0.15, fit: lvl(rc), why: `${f._rev ? '$' + Math.round(f._rev).toLocaleString() + 'M revenue' + (f._revIsEst ? ' (est.)' : '') : 'revenue n/a'} — eBilling compliance (InvoicePrep) and AR days` },
    { svc: 'AI readiness (HELIX AI desk · M365/DMS)', w: ai + 0.05, fit: lvl(ai), why: AI_LABEL[f.ai_opportunity_signal] || 'No signal' },
  ];
}

function nextActionFor(f) {
  const lead = f._lead?.svc || 'Managed IT';
  const opener = f._cyber >= 4 ? 'Open with a no-cost cyber posture / outside-counsel-guideline (OCG) audit-readiness review'
    : f.ai_opportunity_signal === 'planning' ? 'Open with an AI-readiness workshop (M365 Copilot, DMS hygiene, HELIX AI service desk)'
    : 'Open with an eBilling rejection-rate and AR-days benchmark from the revenue-cycle team';
  return `Confirm in CRM whether ${f.firm_name} is already one of Frontline's 800+ clients (dataset client flag is not populated). If not a client: ${opener}; lead offer <b>${lead}</b>. If a client: cross-sell the highest-fit service not yet under contract.`;
}

function openFirm(ctx, f) {
  const { fmt, ui, inspector, esc } = ctx;
  inspector.open({
    title: esc(f.firm_name), sub: `AM Law #${esc(f.amlaw_rank)} · ${esc(f.tier_label)} · ${esc(f._hq)}`, color: COLOR,
    sections: [
      { label: 'Priority', html: `<div class="row wrap">${fmt.tier(f.priority_tier)}${fmt.chip(`score ${f.overall_score}`, fmt.scoreColor(f.overall_score / 1.45))}${aiChip(fmt, f.ai_opportunity_signal)}${fmt.chip(`cyber ${f._cyber}/5`, CYBER_HEX[f._cyber])}${f._rcm ? fmt.chip('RCM candidate', 'var(--c-fl)') : ''}</div>` },
      { label: 'Profile', html: ui.kv({ Attorneys: fmt.num(f.attorney_count), 'Equity partners': f.equity_partners != null ? fmt.num(f.equity_partners) : null, Revenue: f._rev ? `${fmt.money(f._rev * 1e6)}${f._revIsEst ? ' <span class="dim small">est. = attorneys × band median RPL</span>' : ''}` : '—', 'Revenue / lawyer': f._rpl ? fmt.money(f._rpl * 1e3) : null, 'Profit / partner': f.ppp_k ? fmt.money(f.ppp_k * 1e3) : null, Offices: `${fmt.num(f.office_count)}${f.international_offices ? ' · international' : ' · US only'}`, HQ: esc(f._hq), 'Practice mix': `${f.practice_mix_score}/5 sensitivity` }) },
      { label: 'Practice areas', html: String(f.practice_areas || '').split(',').map(s => s.trim()).filter(Boolean).map(s => fmt.chip(s)).join(' ') || '—' },
      { label: 'Analyst notes', html: `<div class="small text-2">${esc(f.priority_notes || '—')}</div>` },
      { label: 'Recommended bundle', html: `<div class="m-fl-b">${f._bundle.map(b => `<span>${esc(b.svc)}</span>${fmt.chip(b.fit, b.fit === 'High' ? 'var(--green)' : b.fit === 'Medium' ? 'var(--accent)' : 'var(--dim)')}<div class="why">${esc(b.why)}</div>`).join('')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${nextActionFor({ ...f, firm_name: esc(f.firm_name) })}</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small">${fmt.link(AMLAW_SRC[1], 'The American Lawyer — AM Law 200 rankings')}${fmt.link(googleNews(f.firm_name + ' law firm technology OR cybersecurity OR AI'), 'Recent news search')}<span class="dim">Scores: legacy Frontline target tool (analyst scoring, 2025 data)</span></div>` },
    ],
    actions: [{ label: 'News ↗', href: googleNews(f.firm_name) }, { id: 'fl-copy', label: 'Copy brief', onClick: () => { try { navigator.clipboard.writeText(`${f.firm_name} (AM Law #${f.amlaw_rank}, ${f._hq}) — ${f.attorney_count} attorneys; AI: ${f.ai_opportunity_signal}; cyber ${f._cyber}/5; lead offer: ${f._lead?.svc}. ${f.priority_notes || ''}`); ui.toast('Brief copied'); } catch { ui.toast('Clipboard unavailable'); } } }],
  });
}

/* Mid-size schema accessors (dataset still being verified: tolerate field-name variants). */
const MS = {
  name: r => r.firm_name ?? r.name ?? r.firm ?? r.company ?? '—',
  metro: r => r.metro ?? r.hq_metro ?? r.market ?? r.msa ?? r.hq_city ?? r.city ?? '',
  city: r => r.hq_city ?? r.city ?? '',
  state: r => r.hq_state ?? r.state ?? '',
  atty: r => n(r.attorney_count ?? r.attorneys ?? r.lawyer_count ?? r.lawyers),
  fit: r => n(r.frontline_fit_score ?? r.fit_score ?? r.score),
  offer: r => { const o = r.recommended_offer; return Array.isArray(o) ? o.map(x => typeof x === 'object' ? (x.offer || x.name || JSON.stringify(x)) : x).join(' + ') : typeof o === 'object' && o ? (o.offer || o.name || o.primary || JSON.stringify(o)) : (o || ''); },
  offerKey: r => { const o = r.recommended_offer; const v = Array.isArray(o) ? o[0] : typeof o === 'object' && o ? (o.primary || o.offer || o.name) : o; return typeof v === 'string' ? v : v ? JSON.stringify(v) : ''; },
  signals: r => (Array.isArray(r.signals) ? r.signals : []).map(s => typeof s === 'string' ? { text: s } : { date: s.date ?? s.signal_date ?? s.published ?? s.dated ?? s.observed, type: s.type ?? s.signal_type ?? s.category ?? s.kind, text: s.title ?? s.headline ?? s.note ?? s.summary ?? s.description ?? s.text ?? s.detail, url: s.source_url ?? s.url ?? (typeof s.source === 'string' && /^https?:/.test(s.source) ? s.source : null), src: s.source_name ?? (typeof s.source === 'string' && !/^https?:/.test(s.source) ? s.source : null) }),
  site: r => r.website ?? r.url ?? null,
};

/* Generic renderer for meta objects of unknown shape (segment_summary, top_20_ranked). */
function autoTable(ctx, v, { max = 30 } = {}) {
  const { esc, fmt } = ctx;
  const cell = x => x == null ? '—' : typeof x === 'number' ? fmt.num(x, Number.isInteger(x) ? 0 : 1) : Array.isArray(x) ? esc(x.slice(0, 4).join(', ')) : typeof x === 'object' ? esc(JSON.stringify(x).slice(0, 80)) : esc(String(x).slice(0, 140));
  if (!v) return null;
  if (typeof v === 'string') return `<div class="prose small">${esc(v)}</div>`;
  let rows = Array.isArray(v) ? v : Object.entries(v).map(([k, x]) => (x && typeof x === 'object' && !Array.isArray(x)) ? { segment: k, ...x } : { segment: k, value: x });
  if (!rows.length) return null;
  if (typeof rows[0] !== 'object') return `<ol class="prose small">${rows.slice(0, max).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => !/url|source|id$/i.test(k)).slice(0, 6);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${keys.map(k => `<th class="${typeof rows[0][k] === 'number' ? 'num' : ''}">${esc(k.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, max).map(r => `<tr>${keys.map(k => `<td class="${typeof r[k] === 'number' ? 'num' : 'wrap small'}">${cell(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* ══ 1. Overview ═════════════════════════════════════════════════════════ */
async function overview(ctx) {
  cssOnce();
  const { el, ui, fmt, data, maps, charts, esc, app } = ctx; root(el);
  const [firms, mid, ma] = await Promise.all([loadFirms(data), data.research('fl_midsize_firms'), data.research('ma_targets_fl_ts')]);
  const targets = (ma?.items || []).filter(t => t.platform === 'frontline');
  const t1 = firms.filter(f => f.priority_tier === 'Tier 1');
  const atty = sum(firms, f => f.attorney_count), attyT1 = sum(t1, f => f.attorney_count);
  const rcm = firms.filter(f => f._rcm);
  const planning = firms.filter(f => f.ai_opportunity_signal === 'planning');
  const cyber5T1 = t1.filter(f => f._cyber >= 5);
  const midItems = mid?.items || [];
  const clients = firms.filter(f => f.current_frontline_client).length;
  const priGeo = targets.filter(t => ['CA', 'TX', 'FL', 'GA'].includes(t.state) || t.country === 'United Kingdom');

  el.innerHTML = ui.pageHead({
    title: 'Frontline Managed Services',
    sub: `<b>So what:</b> ${fmt.num(t1.length)} of ${fmt.num(firms.length)} screened AM Law firms are Tier-1 targets (${fmt.compact(attyT1)} attorneys), and ${fmt.num(rcm.length)} show a cyber or revenue-cycle buying trigger. Frontline already serves more than half of the AM Law 200, but the dataset flags only ${clients} of ${firms.length} firms as current clients (the flag is not maintained). Reconcile against the CRM first, then grow by cross-selling cyber + RCM bundles and moving into mid-size firms.`,
    chips: `${fmt.chip('HQ St. Louis, MO', COLOR)}${fmt.chip('BSP since Dec 2024')}${fmt.chip('800+ law-firm clients (900+ per Jun-2026 release)')}${fmt.chip('>50% of AM Law 200')}${fmt.chip('~1,100 staff · 11 offices')}${fmt.chip('CEO Tim Britt (Jan 2026)')}`,
    actions: `<a class="btn" href="#/fl/amlaw">AM Law targets</a><a class="btn" href="#/fl/targets">Add-on targets</a>`,
  }) +
  ui.kpis([
    { label: 'AM Law targets', value: fmt.num(firms.length), sub: `${countBy(firms, f => f.tier_label)['AM Law 1-100'] || 0} AM 100 · ${countBy(firms, f => f.tier_label)['AM Law 101-200'] || 0} AM 101–200 · ${countBy(firms, f => f.tier_label)['AM Law 201-500'] || 0} other`, color: COLOR },
    { label: 'Tier-1 targets', value: fmt.num(t1.length), sub: `${fmt.num(cyber5T1.length)} with cyber urgency 5/5`, color: 'var(--green)' },
    { label: 'Attorneys addressable', value: fmt.compact(atty), sub: `≈${fmt.compact(atty * 2)} end users incl. staff (est.)`, color: 'var(--accent)' },
    { label: 'Mid-size firms screened', value: mid ? fmt.num(midItems.length) : '—', sub: mid ? `${fmt.num(midItems.filter(r => (MS.fit(r) || 0) >= 65).length)} Tier 1–2 fit (≥65)` : 'research pending', color: 'var(--cyan)' },
    { label: 'Add-on targets', value: targets.length ? fmt.num(targets.length) : '—', sub: `${fmt.num(priGeo.length)} in CEO-priority geographies`, color: 'var(--c-ma)' },
    { label: 'Revenue-cycle candidates', value: fmt.num(rcm.length), sub: `cyber ≥4 or AI “planning” · ${fmt.num(planning.length)} planning`, color: 'var(--amber)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Where the targets are', sub: 'AM Law firm HQs (size = attorneys, colour = priority tier) · Frontline offices · off-map delivery: London, Hyderabad, Goa, Cape Town (24/7 follow-the-sun desk + RCM)', body: `<div class="map" id="fl-map"></div>`, flush: true, cls: 'fill-panel', foot: `${ui.source(...AMLAW_SRC, '2025 ranking')} · ${ui.source(...FL_SRC, 'Sept 2026')}` })}
    ${ui.panel({ title: 'Value-creation levers', sub: 'Ranked by near-term revenue impact · click to act', body: `<div class="acts" id="fl-acts"></div>`, accent: true })}
  </div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Priority call list', sub: 'Top 10 AM Law firms by overall score · services rated High by the bundle rules · click for detail', body: `<div id="fl-top10"></div>`, flush: true, foot: ui.source(...AMLAW_SRC) })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Targets by tier', sub: 'Priority tier × AM Law band (firm count)', body: `<div id="fl-heat"></div>`, foot: ui.source(...AMLAW_SRC) })}
      ${ui.panel({ title: 'AI program signal', sub: 'Public evidence of firm AI programs', body: `<div id="fl-ai"></div>`, foot: ui.source('Analyst scoring of firm announcements', null) })}
    </div>
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Cyber urgency', sub: 'Firms by score (1–5): practice data sensitivity + footprint', body: `<div id="fl-cy"></div>`, foot: ui.source('Analyst scoring', null) })}
    ${ui.panel({ title: 'Attorneys by HQ state', sub: 'Top 10 states, AM Law targets', body: `<div id="fl-st"></div>`, foot: ui.source(...AMLAW_SRC) })}
    ${ui.panel({ title: 'Mid-size pipeline by metro', sub: mid ? 'Firms screened · avg Frontline fit' : 'Screen pending', body: `<div id="fl-mid"></div>`, foot: ui.source('fl_midsize_firms (firm websites)', null, mid?.meta?.generated || 'pending') })}
  </div>`;

  // map
  const map = maps.create(el.querySelector('#fl-map'), { center: [38.6, -93], zoom: 4 });
  const midPts = midItems.map(r => { const g = n(r.lat) != null ? [n(r.lat), n(r.lon ?? r.lng)] : geo(MS.city(r) || MS.metro(r), MS.state(r)); return g ? { r, lat: g[0] + (Math.random() - .5) * .15, lon: g[1] + (Math.random() - .5) * .2 } : null; }).filter(Boolean);
  if (midPts.length) maps.points(map, midPts, { color: '#3fd0e0', radius: 3.5, cluster: false, opacity: .7, popup: p => `<b>${esc(MS.name(p.r))}</b><br>${esc(MS.metro(p.r))} · fit ${MS.fit(p.r) ?? '—'}<br><a href="#/fl/midsize?q=${encodeURIComponent(MS.name(p.r))}">Open mid-size screen →</a>` });
  maps.points(map, firms, { color: f => TIER_HEX[f.priority_tier] || '#5b6b7f', radius: f => 3 + Math.sqrt(f.attorney_count) / 6, cluster: false, opacity: .8, onClick: f => openFirm(ctx, f), popup: f => `<b>${esc(f.firm_name)}</b><br>AM Law #${f.amlaw_rank} · ${fmt.num(f.attorney_count)} attorneys<br>${esc(f.priority_tier)} · AI ${esc(f.ai_opportunity_signal)} · cyber ${f._cyber}/5` });
  for (const o of OFFICES) maps.marker(map, o.lat, o.lon, { color: HEX, label: o.name.split(',')[0], size: o.name.startsWith('St. Louis') ? 14 : 10, popup: `<b>Frontline · ${esc(o.name)}</b><br><span class="muted">${esc(o.role)}</span>` });
  maps.legend(map, [{ color: TIER_HEX['Tier 1'], label: 'Tier 1 firm HQ' }, { color: TIER_HEX['Tier 2'], label: 'Tier 2 firm HQ' }, { color: TIER_HEX['Tier 3'], label: 'Tier 3 firm HQ' }, ...(midPts.length ? [{ color: '#3fd0e0', label: 'Mid-size firm' }] : []), { color: HEX, label: 'Frontline office', ring: true }], 'Layers');
  const fp = maps.points(map, firms.filter(f => !f._geoState), { radius: 0, opacity: 0, weight: 0 }); fp.remove();
  const stopSize = autoSize(map, () => fitRows(map, fp.rows));

  // levers
  const topT = targets.slice().sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))[0];
  const levers = [
    { h: `Reconcile ${fmt.num(firms.length)} AM Law targets against the CRM`, d: `The dataset flags ${clients} of ${firms.length} firms as current clients, yet Frontline serves >50% of the AM Law 200. Split the list into cross-sell accounts and new logos before outreach.`, go: 'List →', href: '#/fl/amlaw' },
    { h: `Cyber-first entry: ${fmt.num(cyber5T1.length)} Tier-1 firms score 5/5 on cyber urgency`, d: `Lead with MDR + outside-counsel-guideline audit readiness. Examples: ${esc(cyber5T1.slice(0, 3).map(f => f.firm_name).join(', '))}.`, go: 'Filter →', href: '#/fl/amlaw?tier=Tier%201&cyber=5' },
    { h: `AI-readiness bundle for ${fmt.num(planning.length)} firms planning AI programs`, d: 'Package the HELIX AI service desk with KL Software M365/SharePoint legal apps (partnership announced Aug 2026) and DMS clean-up.', go: 'Filter →', href: '#/fl/amlaw?ai=planning' },
    { h: `Revenue-cycle cross-sell: ${fmt.num(firms.filter(f => f.attorney_count >= 1000).length)} firms with 1,000+ attorneys`, d: 'eBilling (InvoicePrep), AR and outsourced accounting (added Nov 2025) scale with billing volume, which makes the largest firms the highest-value RCM targets.', go: 'Filter →', href: '#/fl/amlaw?size=1%2C000%2B' },
    { h: mid ? `Move down-market: ${fmt.num(midItems.length)} mid-size firms screened` : 'Move down-market into mid-size firms (screen pending)', d: mid ? `${fmt.num(midItems.filter(r => (MS.fit(r) || 0) >= 65).length)} reach Tier 1–2 fit and ${fmt.num(midItems.filter(r => /insurance/i.test(r.client_base || '')).length)} have insurance-defense books (carrier eBilling makes RCM the wedge). Packaged managed IT + eBilling offers suit firms with 40–350 attorneys.` : 'The mid-size screen (signals, fit score, recommended offer) is still being verified. It will populate the Mid-size view.', go: 'Open →', href: '#/fl/midsize' },
    { h: topT ? `Tuck-in M&A: ${esc(topT.company)} (fit ${topT.fit_score})` : 'Tuck-in M&A pipeline', d: `${fmt.num(targets.length)} legal-IT/RCM candidates, ${fmt.num(priGeo.length)} of them in the CEO's stated priority geographies (CA, TX, Atlanta, South Florida, UK).`, go: 'Targets →', href: '#/fl/targets' },
  ];
  el.querySelector('#fl-acts').innerHTML = levers.map(l => `<a class="act" href="${l.href}"><div><div class="h">${l.h}</div><div class="d">${l.d}</div></div><span class="go">${l.go}</span></a>`).join('');

  // top 10
  const top10 = firms.slice().sort((a, b) => b.overall_score - a.overall_score || a.amlaw_rank - b.amlaw_rank).slice(0, 10);
  el.querySelector('#fl-top10').innerHTML = `<table class="mini"><thead><tr><th>#</th><th>Firm</th><th class="num">Attys</th><th>AI</th><th>Cyber</th><th>High-fit services</th></tr></thead><tbody>${top10.map((f, i) => `<tr class="click" data-i="${firms.indexOf(f)}"><td class="rk">${i + 1}</td><td><b>${esc(f.firm_name)}</b><div class="dim small">#${f.amlaw_rank} · ${esc(f._hq)}</div></td><td class="num">${fmt.num(f.attorney_count)}</td><td>${aiChip(fmt, f.ai_opportunity_signal)}</td><td>${pips(f._cyber)}</td><td>${svcChips(fmt, f)}</td></tr>`).join('')}</tbody></table>`;
  el.querySelectorAll('#fl-top10 tr.click').forEach(tr => tr.onclick = () => openFirm(ctx, firms[Number(tr.dataset.i)]));

  // charts
  const tiers = ['Tier 1', 'Tier 2', 'Tier 3'], bands = ['AM Law 1-100', 'AM Law 101-200', 'AM Law 201-500'];
  el.querySelector('#fl-heat').innerHTML = charts.heatgrid(tiers, bands.map(b => b.replace('AM Law ', 'AM ')), tiers.map(t => bands.map(b => firms.filter(f => f.priority_tier === t && f.tier_label === b).length)), { color: '157,123,255' }) + `<div class="kv-note">Tier 1 = ${fmt.num(t1.length)} firms · ${fmt.compact(attyT1)} attorneys</div>`;
  const ai = countBy(firms, f => f.ai_opportunity_signal);
  el.querySelector('#fl-ai').innerHTML = charts.donut(['planning', 'partial', 'none'].map(k => ({ label: AI_LABEL[k], value: ai[k] || 0, color: AI_HEX[k] })), { size: 110, fmt: v => fmt.num(v) });
  const cy = countBy(firms, f => f._cyber);
  el.querySelector('#fl-cy').innerHTML = charts.bar([1, 2, 3, 4, 5].map(k => ({ label: `Score ${k}`, value: cy[k] || 0, color: CYBER_HEX[k] })), { h: 170, fmt: v => fmt.num(v) }) + `<div class="kv-note">${fmt.num((cy[4] || 0) + (cy[5] || 0))} firms at ≥4 → MDR / audit-readiness entry point</div>`;
  const st = Object.entries(firms.reduce((m, f) => { m[f.hq_state] = (m[f.hq_state] || 0) + f.attorney_count; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  el.querySelector('#fl-st').innerHTML = charts.hbar(st.map(([k, v]) => ({ label: k, value: v, color: HEX })), { labelW: 36, fmt: v => fmt.compact(v) });
  if (midItems.length) {
    const byM = Object.entries(midItems.reduce((m, r) => { const k = MS.metro(r) || MS.state(r) || '—'; (m[k] ||= []).push(MS.fit(r) || 0); return m; }, {})).map(([k, v]) => ({ k, n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.n - a.n).slice(0, 10);
    el.querySelector('#fl-mid').innerHTML = `<table class="mini"><thead><tr><th>Metro</th><th class="num">Firms</th><th>Avg fit</th></tr></thead><tbody>${byM.map(m => `<tr class="click" data-m="${esc(m.k)}"><td>${esc(m.k)}${OFFICE_METRO.test(m.k) ? ' <span class="chip" style="--cc:var(--c-fl)">FL</span>' : ''}</td><td class="num">${fmt.num(m.n)}</td><td>${fmt.score(m.avg)}</td></tr>`).join('')}</tbody></table>`;
    el.querySelectorAll('#fl-mid tr.click').forEach(tr => tr.onclick = () => app.go('fl', 'midsize', { metro: tr.dataset.m }));
  } else el.querySelector('#fl-mid').innerHTML = ui.note('Mid-size screen (fl_midsize_firms) not yet available.', 'warn');

  app.index(firms.map(f => ({ label: f.firm_name, sub: `AM Law #${f.amlaw_rank} · ${f._hq} · ${f.priority_tier}`, href: `#/fl/amlaw?firm=${encodeURIComponent(f.firm_name)}`, kind: 'Law firm', color: COLOR })));
  return () => { stopSize(); map.remove(); unroot(el)(); };
}

/* ══ 2. AM Law 200 targets ═══════════════════════════════════════════════ */
async function amlaw(ctx) {
  cssOnce();
  const { el, ui, fmt, data, charts, esc, params, app } = ctx; root(el);
  const firms = await loadFirms(data);
  const states = [...new Set(firms.map(f => f.hq_state))].sort();
  el.innerHTML = ui.pageHead({
    title: 'AM Law 200 targets',
    sub: '<b>So what:</b> apply the filters to build a call list. Every firm opens a recommended service bundle (managed IT · service desk · cyber · revenue cycle · AI readiness) with the rule that drove each rating, plus a next action. Revenue-cycle candidates = cyber urgency ≥4 or an AI program in planning.',
    chips: `${fmt.chip(`${firms.length} firms`, COLOR)}${fmt.chip(`Revenue reported for ${firms.filter(x => !x._revIsEst).length} firms; ${firms.filter(x => x._revIsEst).length} est. from band-median revenue/lawyer`, 'var(--amber)')}${fmt.chip('Client flag not populated — reconcile with CRM', 'var(--red)')}`,
  }) + `<div id="fl-am-kpis"></div><div class="mt-12" id="fl-am-f"></div><div id="fl-am-t"></div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Lead offer mix (filtered)', sub: 'Highest-rated bundle component per firm', body: '<div id="fl-am-lead"></div>', foot: ui.source('Bundle rules on AM Law + analyst scores', null) })}
    ${ui.panel({ title: 'AI signal × cyber urgency (filtered)', sub: 'Firm counts — top-right = strongest trigger', body: '<div id="fl-am-heat"></div>', foot: ui.source(...AMLAW_SRC) })}
    ${ui.panel({ title: 'Illustrative wallet (filtered)', sub: 'Sizing logic — assumptions labelled', body: '<div id="fl-am-wallet"></div>', foot: '<span class="src">Illustrative: IT spend ≈ 4.5% of revenue (assumption); managed-services-addressable share ≈ 35% (assumption)</span>' })}
  </div>`;
  const columns = [
    { key: 'amlaw_rank', label: 'Rank', num: true, width: '56px' },
    { key: 'firm_name', label: 'Firm', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.tier_label)}</div>` },
    { key: '_hq', label: 'HQ' },
    { key: 'attorney_count', label: 'Attorneys', num: true, fmt: v => fmt.num(v) },
    { key: '_rev', label: 'Revenue', num: true, fmt: (v, r) => v ? `${fmt.money(v * 1e6)}${r._revIsEst ? '<span class="dim"> e</span>' : ''}` : '—' },
    { key: '_rpl', label: 'Rev/lawyer', num: true, fmt: v => v ? fmt.money(v * 1e3) : '—' },
    { key: 'office_count', label: 'Offices', num: true, fmt: (v, r) => `${fmt.num(v)}${r.international_offices ? ' <span class="dim">intl</span>' : ''}` },
    { key: 'ai_opportunity_signal', label: 'AI signal', fmt: v => aiChip(fmt, v) },
    { key: '_cyber', label: 'Cyber', num: true, fmt: v => pips(v) },
    { key: 'overall_score', label: 'Score', num: true, fmt: v => fmt.score(Math.round(v / 1.45)).replace(/>\d+<\/span>$/, `>${v}</span>`) },
    { key: 'priority_tier', label: 'Tier', fmt: v => fmt.tier(v) },
  ];
  const csvCols = [{ key: 'amlaw_rank' }, { key: 'firm_name' }, { key: 'tier_label' }, { key: 'hq_city' }, { key: 'hq_state' }, { key: 'attorney_count' }, { key: 'revenue_m' }, { key: '_rev' }, { key: 'revenue_per_lawyer_k' }, { key: 'office_count' }, { key: 'international_offices' }, { key: 'practice_areas' }, { key: 'ai_opportunity_signal' }, { key: 'cyber_urgency_score' }, { key: 'overall_score' }, { key: 'priority_tier' }, { key: '_leadSvc' }, { key: 'priority_notes' }];
  let tbl;
  const f = ui.filters(el.querySelector('#fl-am-f'), [
    { key: 'q', label: 'Search firm, city, practice, notes…', type: 'search', value: params.q || params.firm || '' },
    { key: 'tier', label: 'Tier', options: ['Tier 1', 'Tier 2', 'Tier 3'], value: params.tier || '' },
    { key: 'band', label: 'Band', options: ['AM Law 1-100', 'AM Law 101-200', 'AM Law 201-500'], value: params.band || '' },
    { key: 'state', label: 'State', options: states, value: params.state || '' },
    { key: 'ai', label: 'AI signal', options: ['planning', 'partial', 'none'], value: params.ai || '' },
    { key: 'cyber', label: 'Cyber ≥', options: ['2', '3', '4', '5'], value: params.cyber || '' },
    { key: 'size', label: 'Attorneys', options: ['1,000+', '500–999', '250–499', '<250'], value: params.size || '' },
    { key: 'client', label: 'Client flag', options: [{ value: 'yes', label: 'Current client' }, { value: 'no', label: 'Not flagged' }], value: params.client || '' },
    { key: 'rcm', label: 'RCM candidates', type: 'toggle', value: params.rcm === '1' },
  ], apply);
  function apply(st) {
    const q = (st.q || '').toLowerCase();
    const rows = firms.filter(r => (!st.tier || r.priority_tier === st.tier) && (!st.band || r.tier_label === st.band) && (!st.state || r.hq_state === st.state) && (!st.ai || r.ai_opportunity_signal === st.ai) && (!st.cyber || r._cyber >= Number(st.cyber)) && (!st.size || r._size === st.size) && (!st.client || (st.client === 'yes') === !!r.current_frontline_client) && (!st.rcm || r._rcm)
      && (!q || `${r.firm_name} ${r._hq} ${r.practice_areas} ${r.priority_notes}`.toLowerCase().includes(q))).map(r => Object.assign(r, { _leadSvc: r._lead.svc }));
    f.setCount(`${rows.length} / ${firms.length} firms`);
    if (tbl) tbl.update(rows); else tbl = ui.table(el.querySelector('#fl-am-t'), { columns, rows, pageSize: 20, sortKey: 'overall_score', exportName: 'frontline_amlaw_targets', onRow: r => openFirm(ctx, r) });
    summarize(rows);
  }
  function summarize(rows) {
    const revKnown = rows.filter(r => !r._revIsEst), rev = sum(rows, r => r._rev);
    el.querySelector('#fl-am-kpis').innerHTML = ui.kpis([
      { label: 'Firms in view', value: fmt.num(rows.length), sub: `${fmt.num(rows.filter(r => r.priority_tier === 'Tier 1').length)} Tier 1`, color: COLOR },
      { label: 'Attorneys', value: fmt.compact(sum(rows, r => r.attorney_count)), sub: `median ${fmt.num(median(rows.map(r => r.attorney_count)))} per firm` },
      { label: 'Revenue', value: fmt.money(rev * 1e6), sub: `${fmt.num(revKnown.length)} reported · ${fmt.num(rows.length - revKnown.length)} est.`, color: 'var(--green)' },
      { label: 'AI planning', value: fmt.num(rows.filter(r => r.ai_opportunity_signal === 'planning').length), sub: `${fmt.num(rows.filter(r => r.ai_opportunity_signal === 'partial').length)} partial`, color: AI_HEX.planning },
      { label: 'Cyber urgency ≥4', value: fmt.num(rows.filter(r => r._cyber >= 4).length), sub: `avg ${fmt.num(rows.length ? sum(rows, r => r._cyber) / rows.length : null, 1)} / 5`, color: 'var(--red)' },
      { label: 'RCM candidates', value: fmt.num(rows.filter(r => r._rcm).length), sub: 'cyber ≥4 or AI planning', color: 'var(--amber)' },
    ]);
    const lead = countBy(rows, r => r._lead.svc);
    el.querySelector('#fl-am-lead').innerHTML = rows.length ? charts.hbar(Object.entries(lead).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k.split(/ [(&]/)[0], value: v, color: HEX })), { labelW: 130, fmt: v => fmt.num(v) }) : ui.empty('No firms in view');
    const ais = ['planning', 'partial', 'none'], cys = [1, 2, 3, 4, 5];
    el.querySelector('#fl-am-heat').innerHTML = charts.heatgrid(ais, cys.map(c => `${c}/5`), ais.map(a => cys.map(c => rows.filter(r => r.ai_opportunity_signal === a && r._cyber === c).length || null)), { color: '157,123,255' });
    const it = rev * 0.045, ms = it * 0.35;
    el.querySelector('#fl-am-wallet').innerHTML = `<div class="stat-line"><span>Firm revenue in view</span><span class="v">${fmt.money(rev * 1e6)}</span></div><div class="stat-line"><span>× IT spend 4.5% (assumption)</span><span class="v">${fmt.money(it * 1e6)}</span></div><div class="stat-line"><span>× outsourceable share 35% (assumption)</span><span class="v">${fmt.money(ms * 1e6)}</span></div><div class="stat-line"><span><b>Illustrative managed-services wallet / yr</b></span><span class="v" style="color:var(--c-fl)">${fmt.money(ms * 1e6)}</span></div><div class="kv-note">Illustrative only. Revenue is AM Law-reported where available and estimated elsewhere (attorneys × band-median revenue per lawyer). Validate the IT-spend ratio against ILTA/Gartner legal benchmarks before using it in a model.</div>`;
  }
  apply(f.state);
  csvOverride(el.querySelector('#fl-am-t'), () => ui.exportCSV(tbl.rows, csvCols, 'frontline_amlaw_targets'));
  if (params.firm) { const hit = firms.find(x => x.firm_name === params.firm); if (hit) openFirm(ctx, hit); }
  app.index(firms.map(x => ({ label: x.firm_name, sub: `AM Law #${x.amlaw_rank} · ${x._hq} · ${x.priority_tier}`, href: `#/fl/amlaw?firm=${encodeURIComponent(x.firm_name)}`, kind: 'Law firm', color: COLOR })));
  return unroot(el);
}

/* ══ 3. Mid-size firm targets ════════════════════════════════════════════ */
async function midsize(ctx) {
  cssOnce();
  const { el, ui, fmt, data, charts, maps, esc, params, inspector, app } = ctx; root(el);
  const mid = await data.research('fl_midsize_firms');
  if (!mid || !(mid.items || []).length) {
    const firms = await loadFirms(data); const proxy = firms.filter(f => f.tier_label === 'AM Law 201-500');
    el.innerHTML = ui.pageHead({ title: 'Mid-size firm targets', sub: '<b>So what:</b> mid-size firms (roughly 40–350 attorneys) are the next growth segment. They are under-served by the big legal MSPs and buy packaged managed IT + cyber. The verified screen is not published yet, so the AM Law 201–500 firms below serve as a proxy.' }) +
      ui.note('Research dataset <b>fl_midsize_firms</b> is not yet available. This view populates automatically (signals, fit score, recommended offer, metro summary, top-20) once the file lands.', 'warn') +
      `<div class="mt-12"></div>` + ui.kpis([{ label: 'Proxy firms (AM 201–500)', value: fmt.num(proxy.length), color: COLOR }, { label: 'Attorneys', value: fmt.compact(sum(proxy, f => f.attorney_count)) }, { label: 'AI planning / partial', value: `${proxy.filter(f => f.ai_opportunity_signal === 'planning').length} / ${proxy.filter(f => f.ai_opportunity_signal === 'partial').length}`, color: AI_HEX.planning }, { label: 'Cyber ≥4', value: fmt.num(proxy.filter(f => f._cyber >= 4).length), color: 'var(--red)' }]) +
      `<div class="mt-12">${ui.panel({ title: 'Proxy list — AM Law 201–500 firms', sub: 'Click for recommended bundle', body: '<div id="fl-ms-proxy"></div>', flush: true, foot: ui.source(...AMLAW_SRC) })}</div>`;
    ui.table(el.querySelector('#fl-ms-proxy'), { columns: [{ key: 'amlaw_rank', label: 'Rank', num: true }, { key: 'firm_name', label: 'Firm', fmt: v => `<b>${esc(v)}</b>` }, { key: '_hq', label: 'HQ' }, { key: 'attorney_count', label: 'Attorneys', num: true, fmt: v => fmt.num(v) }, { key: 'ai_opportunity_signal', label: 'AI', fmt: v => aiChip(fmt, v) }, { key: '_cyber', label: 'Cyber', num: true, fmt: v => pips(v) }, { key: 'overall_score', label: 'Score', num: true }, { key: 'priority_tier', label: 'Tier', fmt: v => fmt.tier(v) }], rows: proxy, pageSize: 25, sortKey: 'overall_score', exportName: 'frontline_midsize_proxy', onRow: r => openFirm(ctx, r) });
    return unroot(el);
  }
  const meta = mid.meta || {};
  const rows = mid.items.map((r, i) => {
    const sig = MS.signals(r).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const g = n(r.lat) != null && n(r.lon ?? r.lng) != null ? [n(r.lat), n(r.lon ?? r.lng)] : geo(MS.city(r) || MS.metro(r), MS.state(r));
    return { ...r, id: r.id ?? `ms-${i}`, _name: MS.name(r), _metro: MS.metro(r) || MS.state(r), _st: MS.state(r), _city: MS.city(r), _atty: MS.atty(r), _approx: /approx/i.test(r.attorney_count_confidence || ''), _fit: MS.fit(r), _tier: fitTierOf(MS.fit(r) || 0), _offer: MS.offer(r), _offerKey: MS.offerKey(r), _client: r.client_base || '', _ins: /insurance/i.test(r.client_base || ''), _spend: r.estimated_it_spend_band?.band || (typeof r.estimated_it_spend_band === 'string' ? r.estimated_it_spend_band : ''), _sig: sig, _nsig: sig.length, _last: sig.find(s => s.date)?.date || null, _types: [...new Set(sig.map(s => s.type).filter(Boolean))], lat: g ? g[0] : null, lon: g ? g[1] : null };
  });
  { const seen = {}; for (const r of rows) if (r.lat != null) { const k = `${r.lat.toFixed(2)}|${r.lon.toFixed(2)}`; const i = seen[k] = (seen[k] ?? -1) + 1; if (i) { const a = i * 2.39996, d = 0.09 * Math.sqrt(i); r.lat += d * Math.sin(a); r.lon += d * Math.cos(a) * 1.3; } } }   // spread co-located (city-precision) HQs
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const metros = [...new Set(rows.map(r => r._metro).filter(Boolean))].sort();
  const offers = [...new Set(rows.map(r => r._offerKey).filter(Boolean))].sort();
  const sigTypes = [...new Set(rows.flatMap(r => r._types))].sort();
  const t12 = rows.filter(r => (r._fit || 0) >= 65);
  const withSig = rows.filter(r => r._nsig);
  const recent = rows.filter(r => r._last && fmt.days(r._last) != null && fmt.days(r._last) >= -120);
  const ins = rows.filter(r => r._ins);
  const offerCounts = Object.entries(countBy(rows.filter(r => r._offerKey), r => r._offerKey)).sort((a, b) => b[1] - a[1]);
  const sigCounts = Object.entries(countBy(rows.flatMap(r => r._sig), s => s.type || 'other')).sort((a, b) => b[1] - a[1]);
  const seg = meta.segment_summary && typeof meta.segment_summary === 'object' && !Array.isArray(meta.segment_summary)
    ? Object.entries(meta.segment_summary).map(([k, v]) => ({ metro: k, ...(typeof v === 'object' ? v : { value: v }) }))
    : Array.isArray(meta.segment_summary) ? meta.segment_summary.map(v => ({ metro: v.metro ?? v.segment ?? v.name, ...v })) : Object.entries(countBy(rows, r => r._metro)).map(([k, v]) => ({ metro: k, firm_count: v }));
  seg.forEach(s => { const rs = rows.filter(r => r._metro === s.metro); s.firm_count ??= rs.length; s.total_attorneys ??= sum(rs, r => r._atty); s.avg_fit_score ??= rs.length ? sum(rs, r => r._fit) / rs.length : null; s._t12 = rs.filter(r => (r._fit || 0) >= 65).length; s._office = OFFICE_METRO.test(s.metro); });
  seg.sort((a, b) => (b.avg_fit_score || 0) * Math.sqrt(b.firm_count || 0) - (a.avg_fit_score || 0) * Math.sqrt(a.firm_count || 0));
  const bestSeg = seg[0];
  const srcLine = ui.source('Firm websites & sitemaps (fl_midsize_firms)', null, meta.generated || 'Sept 2026');
  const offerTxt = k => OFFER_LABEL[k] || String(k || '—').replace(/_/g, ' ');

  el.innerHTML = ui.pageHead({
    title: 'Mid-size firm targets',
    sub: `<b>So what:</b> ${fmt.num(rows.length)} independent mid-size firms (40–350 attorneys) screened across ${metros.length} metros, holding ${fmt.compact(sum(rows, r => r._atty))} attorneys. ${fmt.num(t12.length)} reach Tier 1–2 fit (≥65), and ${fmt.num(ins.length)} have insurance-defense books, where carrier eBilling (LEDES) makes RCM the wedge. Start in <b>${esc(bestSeg?.metro || '—')}</b> (${fmt.num(bestSeg?.firm_count)} firms, avg fit ${fmt.num(bestSeg?.avg_fit_score, 1)}) and lead with <b>${esc(offerTxt(offerCounts[0]?.[0]))}</b>.`,
    chips: `${fmt.chip(`${metros.length} metros`, COLOR)}${fmt.chip(`${fmt.num(rows.filter(r => r._approx).length)} headcounts approx. (±25%)`, 'var(--amber)')}${(() => { const ex = meta.excluded_absorbed_or_out_of_range || []; const oor = ex.filter(x => /above|cap|am law 200|borderline|out of range/i.test(x.note || '')).length; return fmt.chip(`${ex.length - oor} absorbed by mergers · ${oor} above size range`, 'var(--red)'); })()}${meta.generated ? fmt.chip(`generated ${meta.generated}`) : ''}`,
  }) + ui.kpis([
    { label: 'Firms screened', value: fmt.num(rows.length), sub: `${metros.length} metros · ${fmt.compact(sum(rows, r => r._atty))} attorneys`, color: COLOR },
    { label: 'Tier 1–2 fit (≥65)', value: fmt.num(t12.length), sub: `${fmt.num(rows.filter(r => (r._fit || 0) >= 80).length)} at ≥80 · median ${fmt.num(median(rows.map(r => r._fit)))}`, color: 'var(--green)' },
    { label: 'Insurance-defense books', value: fmt.num(ins.length), sub: 'carrier eBilling → RCM wedge', color: 'var(--amber)' },
    { label: 'High IT-spend band', value: fmt.num(rows.filter(r => r._spend === 'high').length), sub: `${fmt.num(rows.filter(r => r._spend === 'mid').length)} mid · heuristic`, color: 'var(--accent)' },
    { label: 'Firms with signals', value: fmt.num(withSig.length), sub: `${fmt.num(sum(rows, r => r._nsig))} signals · ${fmt.num(recent.length)} dated ≤120 d`, color: 'var(--cyan)' },
    { label: 'Near a Frontline office', value: fmt.num(rows.filter(r => OFFICE_METRO.test(r._metro)).length), sub: 'NYC · STL · Ohio · DC · Honolulu metros', color: HEX },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Mid-size firm map', sub: 'Colour = fit tier · size = attorneys · Frontline offices ringed · click a firm', body: '<div class="map" id="fl-ms-map"></div>', flush: true, cls: 'fill-panel', foot: srcLine })}
    ${ui.panel({ title: 'Top 20 ranked', sub: 'Research ranking with the key signal · click to inspect', body: '<div id="fl-ms-top"></div>', flush: true, scroll: true, foot: srcLine })}
  </div>
  ${ui.panel({ title: 'Screen', sub: 'Filter by metro, fit, offer, signal · export for the mid-market sales pod', body: '<div id="fl-ms-f"></div><div id="fl-ms-t"></div>', cls: 'mt-12', foot: `${srcLine} · <span>Fit = transparent heuristic: ${esc(String(meta.scoring_formula || '').slice(0, 120))}…</span>` })}
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Metro summary', sub: 'Sorted by avg fit × √firms · click to filter', body: '<div id="fl-ms-seg"></div>', flush: true, foot: ui.source('meta.segment_summary', null, meta.generated) })}
    ${ui.panel({ title: 'Recommended offer & signal mix', body: `<h4 class="mb-8">Recommended offer</h4>${offerCounts.length ? charts.hbar(offerCounts.map(([k, v]) => ({ label: offerTxt(k), value: v, color: HEX })), { labelW: 150, fmt: v => fmt.num(v) }) : ui.empty('No offers')}<h4 class="mt-12 mb-8">Signals by type</h4>${sigCounts.length ? charts.hbar(sigCounts.map(([k, v]) => ({ label: String(k).replace(/_/g, ' '), value: v, color: '#3fd0e0' })), { labelW: 150, fmt: v => fmt.num(v) }) : ui.empty('No signals')}`, foot: srcLine })}
    ${ui.panel({ title: 'Consolidation watch', sub: 'Mid-size firms disappearing into larger firms, and firms whose size is unverified', body: '<div id="fl-ms-cons"></div>', scroll: true, foot: srcLine })}
  </div>`;

  // map
  const map = maps.create(el.querySelector('#fl-ms-map'), { center: [38.6, -93], zoom: 4 });
  const tierHex = r => TIER_HEX[r._tier] || '#5b6b7f';
  const pts = maps.points(map, rows, { color: tierHex, radius: r => 3 + Math.sqrt(r._atty || 40) / 3, cluster: false, opacity: .85, onClick: r => open(r), popup: r => `<b>${esc(r._name)}</b><br>${esc(r._metro)} · ${fmt.num(r._atty)} attorneys · fit ${r._fit}<br>${esc(offerTxt(r._offerKey))}` });
  for (const o of OFFICES) maps.marker(map, o.lat, o.lon, { color: HEX, label: o.name.split(',')[0], size: 9, popup: `<b>Frontline · ${esc(o.name)}</b><br><span class="muted">${esc(o.role)}</span>` });
  maps.legend(map, [{ color: TIER_HEX['Tier 1'], label: 'Fit ≥80' }, { color: TIER_HEX['Tier 2'], label: 'Fit 65–79' }, { color: TIER_HEX['Tier 3'], label: 'Fit 50–64' }, { color: TIER_HEX['Tier 4'], label: 'Fit <50' }, { color: HEX, label: 'Frontline office', ring: true }], 'Mid-size firms');
  const stopSize = autoSize(map, () => fitRows(map, pts.rows));

  // table
  const columns = [
    { key: '_fit', label: 'Fit', num: true, fmt: v => fmt.score(v), width: '86px' },
    { key: '_name', label: 'Firm', wrap: true, fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc([r._city, r._st].filter(Boolean).join(', '))}</div>` },
    { key: '_metro', label: 'Metro', wrap: true },
    { key: '_atty', label: 'Attys', num: true, fmt: (v, r) => `${fmt.num(v)}${r._approx ? '<span class="dim">~</span>' : ''}` },
    { key: '_client', label: 'Client base', wrap: true, width: '170px', fmt: (v, r) => `<span class="small ${r._ins ? '' : 'text-2'}" style="${r._ins ? 'color:var(--amber)' : ''}">${esc(String(v || '—').slice(0, 44))}</span>` },
    { key: '_offerKey', label: 'Offer', fmt: v => fmt.chip(offerTxt(v), OFFER_HEX[v] || HEX) },
    { key: '_spend', label: 'IT spend', fmt: v => v ? fmt.chip(v, v === 'high' ? 'var(--green)' : v === 'mid' ? 'var(--accent)' : 'var(--dim)') : '—' },
    { key: '_nsig', label: 'Signals', num: true, fmt: (v, r) => v ? `${fmt.num(v)}<div class="dim small" style="font-family:var(--font)">${esc(r._types.slice(0, 2).map(t => t.replace(/_/g, ' ')).join(', '))}</div>` : '<span class="dim">0</span>' },
    { key: '_last', label: 'Latest', num: true, fmt: v => v ? fmt.date(v) : '—' },
  ];
  const csvCols = [{ key: 'id' }, { key: '_name' }, { key: '_metro' }, { key: '_city' }, { key: '_st' }, { key: '_atty' }, { key: 'attorney_count_confidence' }, { key: '_client' }, { key: '_fit' }, { key: '_offerKey' }, { key: '_spend' }, { key: '_nsig' }, { key: '_last' }, { key: 'fit_rationale' }, { key: 'website' }];
  let tbl;
  const f = ui.filters(el.querySelector('#fl-ms-f'), [
    { key: 'q', label: 'Search firm, city, practice, signal…', type: 'search', value: params.q || '' },
    { key: 'metro', label: 'Metro', options: metros, value: params.metro || '' },
    { key: 'tier', label: 'Fit', options: ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'].map(t => ({ value: t, label: `${t} (${t === 'Tier 1' ? '≥80' : t === 'Tier 2' ? '65–79' : t === 'Tier 3' ? '50–64' : '<50'})` })), value: params.tier || '' },
    { key: 'offer', label: 'Offer', options: offers.map(o => ({ value: o, label: offerTxt(o) })), value: params.offer || '' },
    { key: 'sig', label: 'Signal', options: sigTypes.map(s => ({ value: s, label: s.replace(/_/g, ' ') })), value: params.sig || '' },
    { key: 'ins', label: 'Insurance defense', type: 'toggle', value: params.ins === '1' },
    { key: 'hasSig', label: 'Has signal', type: 'toggle', value: params.hasSig === '1' },
  ], st => applyMs(st));
  function applyMs(st) {
    const q = (st.q || '').toLowerCase();
    const out = rows.filter(r => (!st.metro || r._metro === st.metro) && (!st.tier || r._tier === st.tier) && (!st.offer || r._offerKey === st.offer) && (!st.sig || r._types.includes(st.sig)) && (!st.ins || r._ins) && (!st.hasSig || r._nsig) && (!q || `${r._name} ${r._city} ${r._metro} ${(r.practice_focus || []).join(' ')} ${r._client} ${r._sig.map(s => s.text).join(' ')}`.toLowerCase().includes(q)));
    f.setCount(`${out.length} / ${rows.length} firms`);
    tbl ? tbl.update(out) : (tbl = ui.table(el.querySelector('#fl-ms-t'), { columns, rows: out, pageSize: 20, sortKey: '_fit', exportName: 'frontline_midsize_targets', onRow: open }));
  }
  applyMs(f.state);
  csvOverride(el.querySelector('#fl-ms-t'), () => ui.exportCSV(tbl.rows, csvCols, 'frontline_midsize_targets'));
  function open(r) {
    if (!r) return;
    const why = r.fit_rationale ?? r.rationale ?? r.why ?? r.notes;
    const srcs = [...(Array.isArray(r.sources) ? r.sources : []), r.attorney_count_source?.url, ...r._sig.map(s => s.url)].filter(s => typeof s === 'string' && /^https?:/.test(s));
    const bundle = { managed_it: 'Managed IT + co-sourced service desk; add MDR at renewal', bundle: 'Full bundle: managed IT + cyber (MDR) + eBilling/RCM', ebilling: 'eBilling/LEDES submission + invoice-appeal + AR collections (InvoicePrep); land-and-expand into IT', service_desk: '24/7 legal service desk (co-sourced with in-house IT)', cyber: 'Cyber posture assessment → MDR/SOC' }[r._offerKey];
    inspector.open({ title: esc(r._name), sub: `${esc([r._city, r._st].filter(Boolean).join(', '))} · ${esc(r._metro)} · mid-size firm`, color: COLOR,
      sections: [
        { label: 'Fit', html: `<div class="row wrap">${fmt.score(r._fit)}${fmt.tier(r._tier)}${r.fit_rank ? fmt.chip(`rank #${r.fit_rank}`) : ''}${r._spend ? fmt.chip(`IT spend ${r._spend}`, r._spend === 'high' ? 'var(--green)' : 'var(--accent)') : ''}</div>${why ? `<div class="small text-2 mt-8">${esc(typeof why === 'string' ? why : JSON.stringify(why))}</div>` : ''}` },
        { label: 'Recommended offer', html: `<div class="small">${fmt.chip(offerTxt(r._offerKey), OFFER_HEX[r._offerKey] || HEX)} <span class="text-2">${esc(bundle || r._offer || '')}</span></div>` },
        { label: 'Profile', html: ui.kv({ Attorneys: r._atty != null ? `${fmt.num(r._atty)} <span class="dim small">${esc(r.attorney_count_confidence || '')}</span>` : null, 'Client base': esc(r._client), Practice: (r.practice_focus || []).map(p => String(p)),   /* ui.kv escapes array items itself */ Offices: r.offices?.length ? `${fmt.num(r.office_count_known ?? r.offices.length)} · <span class="small text-2">${esc(r.offices.slice(0, 6).join(' · '))}</span>` : null, Founded: r.founded ? esc(r.founded) : null, 'IT spend band': r.estimated_it_spend_band?.rationale ? `<span class="small text-2">${esc(r.estimated_it_spend_band.rationale)}</span>` : null, Website: r.website ? fmt.link(r.website) : null }) },
        r.attorney_count_source?.quote ? { label: 'Headcount evidence', html: `<div class="small text-2">“${esc(r.attorney_count_source.quote)}”</div>${r.attorney_count_source.url ? `<div class="small">${fmt.link(r.attorney_count_source.url)}</div>` : ''}` } : null,
        { label: `Signals timeline (${r._sig.length})`, html: r._sig.length ? r._sig.map(s => `<div class="m-fl-sig"><div class="d">${esc(s.date || 'undated')}${s.type ? ` · ${esc(String(s.type).replace(/_/g, ' '))}` : ''}</div><div class="t">${esc(s.text || '—')}</div>${s.url ? `<div class="small">${fmt.link(s.url, s.src || fmt.host(s.url))}</div>` : s.src ? `<div class="dim small">${esc(s.src)}</div>` : ''}</div>`).join('') : `<div class="dim small">No dated signals on the firm's own pages. Use cadence outreach instead of trigger-based outreach.</div>` },
        { label: 'Next action', html: `<div class="small text-2">Route to the mid-market pod${OFFICE_METRO.test(r._metro) ? ` (on-site support from the ${esc(r._metro)} Frontline office)` : ''}. Open with <b>${esc(offerTxt(r._offerKey))}</b>${r._sig[0]?.text ? `, referencing “${esc(String(r._sig[0].text).slice(0, 90))}”` : ''}. Offer a 30-minute IT/cyber health check${r._ins ? ' plus an eBilling rejection-rate audit on the carrier invoices' : ''}. Check the firm against the existing client list first.</div>` },
        { label: 'Sources', html: `<div class="col gap-4 small">${[...new Set(srcs)].slice(0, 8).map(s => fmt.link(s, s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))).join('') || '—'}</div><div class="dim small mt-8">Retrieved ${esc(r.retrieved || meta.generated || '')}</div>` },
      ].filter(Boolean),
      actions: [MS.site(r) ? { label: 'Website ↗', href: MS.site(r) } : null, { label: 'News ↗', href: googleNews(r._name) }].filter(Boolean) });
  }
  // top 20
  const top = Array.isArray(meta.top_20_ranked) ? meta.top_20_ranked : null;
  const topRows = (top || rows.slice().sort((a, b) => (b._fit || 0) - (a._fit || 0)).slice(0, 20)).map((t, i) => { const hit = (t.id && byId[t.id]) || rows.find(r => r._name === (t.firm_name ?? t.name ?? t._name)); return { rank: t.rank ?? i + 1, name: t.firm_name ?? t.name ?? t._name, score: n(t.frontline_fit_score ?? t.fit_score ?? t._fit), metro: t.metro ?? t._metro ?? '', atty: n(t.attorney_count ?? t._atty), offer: t.recommended_offer ?? t._offerKey, sig: t.key_signal ?? hit?._sig?.[0]?.text ?? '', hit }; });
  el.querySelector('#fl-ms-top').innerHTML = `${top ? '' : `<div class="note warn" style="margin:8px">meta.top_20_ranked is missing, so this list is sorted by fit score</div>`}<table class="mini"><tbody>${topRows.slice(0, 20).map((t, i) => `<tr class="${t.hit ? 'click' : ''}" data-i="${i}"><td class="rk">${esc(t.rank)}</td><td style="white-space:normal"><b>${esc(t.name)}</b> <span class="dim small">${esc(t.metro)} · ${fmt.num(t.atty)} attys</span><div class="small text-2" style="max-width:420px">${esc(String(t.sig || '').slice(0, 110))}</div></td><td>${fmt.chip(offerTxt(t.offer), OFFER_HEX[t.offer] || HEX)}</td><td class="num">${t.score != null ? fmt.score(t.score) : ''}</td></tr>`).join('')}</tbody></table>`;
  el.querySelectorAll('#fl-ms-top tr.click').forEach(tr => tr.onclick = () => open(topRows[Number(tr.dataset.i)].hit));
  // metro summary
  el.querySelector('#fl-ms-seg').innerHTML = `<table class="mini"><thead><tr><th>Metro</th><th class="num">Firms</th><th class="num">Attys</th><th class="num">Ins.</th><th class="num">Sig.</th><th class="num">Avg fit</th></tr></thead><tbody>${seg.map(s => `<tr class="click" data-m="${esc(s.metro)}"><td>${esc(s.metro)}${s._office ? ' <span class="chip" style="--cc:var(--c-fl)">FL</span>' : ''}</td><td class="num">${fmt.num(s.firm_count)}</td><td class="num">${fmt.num(s.total_attorneys)}</td><td class="num">${s.insurance_defense_firms != null ? fmt.num(s.insurance_defense_firms) : '—'}</td><td class="num">${s.firms_with_signals != null ? fmt.num(s.firms_with_signals) : '—'}</td><td class="num">${fmt.num(s.avg_fit_score, 1)}</td></tr>`).join('')}</tbody></table>`;
  el.querySelectorAll('#fl-ms-seg tr.click').forEach(tr => tr.onclick = () => app.go('fl', 'midsize', { metro: tr.dataset.m }));
  // consolidation watch
  const exc = meta.excluded_absorbed_or_out_of_range || [], wl = meta.watchlist_unverified_size || [];
  el.querySelector('#fl-ms-cons').innerHTML = (exc.length || wl.length) ? `${exc.length ? `<h4 class="mb-8">Absorbed / out of range (${exc.length})</h4><div class="col gap-4">${exc.map(x => `<div class="small"><b>${esc(x.firm_name)}</b> <span class="text-2">— ${esc(x.note || '')}</span> ${x.source_url ? `<a class="dim" href="${esc(x.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}</div>`).join('')}</div>` : ''}${wl.length ? `<h4 class="mt-12 mb-8">Watchlist — size unverified (${wl.length})</h4><div class="col gap-4">${wl.map(x => `<div class="small"><b>${esc(x.firm_name)}</b> <span class="text-2">— ${esc(x.note || '')}</span> ${x.source_url ? `<a class="dim" href="${esc(x.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}</div>`).join('')}</div>` : ''}<div class="kv-note">Every merger that removes an independent mid-size firm also changes that firm's IT buyer. Call newly combined firms during integration.</div>` : ui.empty('No consolidation notes');
  app.index(rows.slice(0, 300).map(r => ({ label: r._name, sub: `Mid-size firm · ${r._metro} · fit ${r._fit ?? '—'}`, href: `#/fl/midsize?q=${encodeURIComponent(r._name)}`, kind: 'Law firm', color: COLOR })));
  if (params.q) { const hit = rows.find(r => r._name === params.q); if (hit) open(hit); }
  return () => { stopSize(); map.remove(); unroot(el)(); };
}

/* ══ 4. Add-on targets ═══════════════════════════════════════════════════ */
async function targetsView(ctx) {
  cssOnce();
  const { el, ui, fmt, data, maps, esc, inspector } = ctx; root(el);
  const ma = await data.research('ma_targets_fl_ts');
  if (!ma) { el.innerHTML = ui.pageHead({ title: 'Add-on targets' }) + ui.note('Research dataset <b>ma_targets_fl_ts</b> is not yet available.', 'warn'); return unroot(el); }
  const fm = ma.meta?.frontline || {}; const pc = fm.platform_context || {};
  const items = (ma.items || []).filter(t => t.platform === 'frontline');
  // fit_breakdown is on a 1–5 scale; renderTargets draws it against max 100 → rescale for display.
  const disp = items.map(t => ({ ...t, fit_breakdown: Object.fromEntries(Object.entries(t.fit_breakdown || {}).map(([k, v]) => [`${k} (×20)`, (n(v) || 0) * 20])) }));
  const top8 = (fm.ranked_top_8 || []).map(r => ({ ...r, item: items.find(t => t.id === r.id) }));
  const priGeo = items.filter(t => ['CA', 'TX', 'FL', 'GA'].includes(t.state) || t.country === 'United Kingdom');
  const tuck = items.filter(t => t.revenue_est_usd && t.revenue_est_usd <= 15e6);
  const large = items.filter(t => t.revenue_est_usd && t.revenue_est_usd >= 20e6);
  const rcmT = items.filter(t => /billing|revenue|invoice|accounting|time entry/i.test(JSON.stringify(t.offerings || [])));
  const comp = fm.pe_backed_competitors || [];
  const avgTop = top8.length ? top8.reduce((a, r) => a + (r.fit_score || 0), 0) / top8.length : null;

  el.innerHTML = ui.pageHead({
    title: 'Add-on targets',
    sub: `<b>So what:</b> ${fmt.num(items.length)} legal-IT and revenue-cycle add-on candidates screened. The top 8 average ${fmt.num(avgTop, 0)} fit. ${fmt.num(priGeo.length)} sit in the CEO's stated priority geographies (California, Texas, Atlanta, South Florida, UK), and ${fmt.num(tuck.length)} match the ~$5M-revenue tuck-in profile (ZoomInfo revenue ≤$15M, modelled). Roll-up competition is active: ${fmt.num(comp.length)} sponsor-backed or strategic consolidators are profiled.`,
    chips: `${fmt.chip('Criteria: tuck-ins ~$5M rev / $1–2M EBITDA; platforms $20M+', COLOR)}${fmt.chip('Revenue = ZoomInfo modelled est.', 'var(--amber)')}`,
  }) + ui.kpis([
    { label: 'Candidates', value: fmt.num(items.length), sub: `${fmt.num(items.filter(t => t.fit_score >= 80).length)} fit ≥80`, color: 'var(--c-ma)' },
    { label: 'Top-8 avg fit', value: fmt.num(avgTop, 0), sub: esc(top8[0]?.company || '—'), color: 'var(--green)' },
    { label: 'Priority geographies', value: fmt.num(priGeo.length), sub: 'CA · TX · GA · FL · UK', color: COLOR },
    { label: 'Tuck-in size (≤$15M est.)', value: fmt.num(tuck.length), sub: `${fmt.num(large.length)} at $20M+ (platform-scale)` },
    { label: 'RCM / billing specialists', value: fmt.num(rcmT.length), sub: 'extend InvoicePrep / eBilling', color: 'var(--amber)' },
    { label: 'Combined staff (est.)', value: fmt.num(sum(items, t => t.employees)), sub: 'ZoomInfo headcount', color: 'var(--accent)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Target geography vs. Frontline footprint', sub: `Size = fit score · ${items.filter(t => t.country === 'United Kingdom').length} UK targets off-map (London office adjacency)`, body: '<div class="map" id="fl-tg-map" style="min-height:420px"></div>', flush: true, foot: ui.source('ma_targets_fl_ts (ZoomInfo + websites)', null, ma.meta?.generated) })}
    ${ui.panel({ title: 'Ranked top 8', sub: 'Research-team ranking (capability 30% · customer overlap 25% · scale · ownership · geography 15% each)', body: '<div id="fl-tg-top"></div>', flush: true, foot: ui.source('ma_targets_fl_ts meta.frontline.ranked_top_8', null, ma.meta?.generated) })}
  </div>
  ${ui.panel({ title: 'Full screen', sub: 'Filter, sort, export · click a row for fit breakdown, rationale, sources', body: '<div id="fl-tg-list" class="m-fl-tg"></div>', cls: 'mt-12', foot: `${ui.source('ZoomInfo search_companies, company websites, press', null, ma.meta?.generated)} · <span>fit breakdown bars rescaled ×20 (source scale 1–5)</span>` })}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'PE-backed & strategic consolidators', sub: 'Who else is rolling up legal IT — bid competition and potential exits', body: '<div id="fl-tg-comp"></div>', flush: true, foot: ui.source('Sponsor sites, press releases, ZoomInfo', null, ma.meta?.generated) })}
    ${ui.panel({ title: 'Frontline M&A playbook', sub: 'Prior deals and stated criteria', body: `<h4>Prior acquisitions</h4><ul class="ctx-list mt-8">${(pc.prior_acquisitions || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul><h4 class="mt-12">Divestitures</h4><ul class="ctx-list mt-8">${(pc.divestitures || []).map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul>${pc.recent ? `<h4 class="mt-12">Recent</h4><div class="small text-2 mt-8">${esc(pc.recent)}</div>` : ''}${pc.stated_criteria ? `<h4 class="mt-12">Stated criteria</h4><div class="small text-2 mt-8">${esc(pc.stated_criteria)}</div>` : ''}<h4 class="mt-12">Next actions</h4><ul class="ctx-list mt-8"><li>Approach the top 3 (${esc(top8.slice(0, 3).map(t => t.company).join(', '))}) through PRG before the consolidators do</li><li>Before any LOI, check whether revenue claims are ZoomInfo estimates (e.g. Helm360's $116.5M)</li><li>Prioritise RCM/billing tuck-ins that extend InvoicePrep margins</li></ul>`, foot: `<span class="src">Sources: ${(pc.sources || []).slice(0, 4).map(s => fmt.link(s, fmt.host(s))).join(' · ')}</span>` })}
  </div>`;

  const map = maps.create(el.querySelector('#fl-tg-map'), { center: [39, -96], zoom: 4 });
  for (const o of OFFICES) maps.marker(map, o.lat, o.lon, { color: HEX, label: o.name.split(',')[0], size: 9, popup: `<b>Frontline · ${esc(o.name)}</b><br><span class="muted">${esc(o.role)}</span>` });
  maps.points(map, items, { color: t => fmt.scoreColor(t.fit_score).includes('green') ? '#2ecc8f' : t.fit_score >= 60 ? '#4c8dff' : '#f5b73d', radius: t => 4 + (t.fit_score || 50) / 12, cluster: false, opacity: .85, popup: t => `<b>${esc(t.company)}</b><br>${esc(t.hq_city || '')}, ${esc(t.state || t.country || '')} · fit ${t.fit_score}<br>${fmt.num(t.employees)} staff · ${fmt.money(t.revenue_est_usd)} est.` });
  maps.legend(map, [{ color: '#2ecc8f', label: 'Fit ≥80' }, { color: '#4c8dff', label: 'Fit 60–79' }, { color: '#f5b73d', label: 'Fit <60' }, { color: HEX, label: 'Frontline office', ring: true }], 'Add-on targets');
  const stopSize = autoSize(map, () => fitRows(map, items.filter(t => t.country !== 'United Kingdom')));


  el.querySelector('#fl-tg-top').innerHTML = top8.length ? `<table class="mini"><thead><tr><th>#</th><th>Company</th><th class="num">Staff</th><th class="num">Rev. est.</th><th class="num">Fit</th></tr></thead><tbody>${top8.map((r, i) => `<tr class="click" data-i="${i}"><td class="rk">${r.rank}</td><td style="white-space:normal"><b>${esc(r.company)}</b><div class="dim small">${esc(r.item ? `${r.item.hq_city || ''}, ${r.item.state || ''}` : '')} · ${esc((r.item?.ownership || '').split(/[;(]/)[0].slice(0, 44))}</div></td><td class="num">${fmt.num(r.item?.employees)}</td><td class="num">${fmt.money(r.item?.revenue_est_usd)}</td><td class="num">${fmt.score(r.fit_score)}</td></tr>`).join('')}</tbody></table>` : ui.empty('ranked_top_8 not available');
  const tg = renderTargets(ctx, el.querySelector('#fl-tg-list'), { items: disp, color: COLOR, platformLabel: 'Frontline', exportName: 'frontline_addon_targets', pageSize: 25 });
  const clickCompany = name => { const rowsNow = el.querySelectorAll('#fl-tg-list tbody tr'); const all = tg.rows(); const idx = all.findIndex(t => t.company === name); if (idx >= 0 && idx < 25) rowsNow[idx]?.click(); else { const t = disp.find(x => x.company === name); if (t) openTargetLite(t); } };
  function openTargetLite(t) { inspector.open({ title: esc(t.company), sub: `${esc(t.hq_city || '')}, ${esc(t.state || '')} · Frontline add-on candidate`, color: COLOR, sections: [{ label: 'Fit', html: `${fmt.score(t.fit_score)}` }, { label: 'Rationale', html: `<div class="small text-2">${esc(t.strategic_rationale || '')}</div>` }, { label: 'Next action', html: '<div class="small text-2">Route to PRG for a founder-level intro; verify ZoomInfo revenue/headcount against the website and LinkedIn before any LOI, and check overlap with Frontline\'s existing law-firm clients.</div>' }, { label: 'Sources', html: `<div class="col gap-4 small">${(t.sources || []).map(s => fmt.link(s, fmt.host(s))).join('')}</div>` }], actions: t.website ? [{ label: 'Website ↗', href: t.website }] : [] }); }
  el.querySelectorAll('#fl-tg-top tr.click').forEach(tr => tr.onclick = () => clickCompany(top8[Number(tr.dataset.i)].company));

  const compTbl = ui.table(el.querySelector('#fl-tg-comp'), {
    columns: [{ key: 'company', label: 'Consolidator', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.hq || '')}</div>` }, { key: 'sponsor', label: 'Sponsor', wrap: true, fmt: v => `<span class="small">${esc(v || 'not verified')}</span>` }, { key: 'scale', label: 'Scale', wrap: true, fmt: v => `<span class="small text-2">${esc(v || '—')}</span>` }, { key: 'notes', label: 'Notes', wrap: true, fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 120))}</span>` }],
    rows: comp.map((c, i) => ({ ...c, id: `comp-${i}` })), pageSize: 10, exportName: 'frontline_pe_competitors',
    onRow: c => inspector.open({ title: esc(c.company), sub: `${esc(c.hq || 'HQ n/a')} · legal-IT consolidator`, color: 'var(--c-pe)', sections: [{ label: 'Profile', html: ui.kv({ Sponsor: esc(c.sponsor || 'not verified'), Scale: esc(c.scale || '—') }) }, { label: 'Notes', html: `<div class="small text-2">${esc(c.notes || '')}</div>` }, { label: 'Implication for Frontline', html: `<div class="small text-2">Likely rival bidder for the same tuck-ins and a benchmark for exit multiples. Track its add-ons in the PE landscape module and move early on overlapping targets.</div>` }, { label: 'Sources', html: `<div class="col gap-4 small">${(c.sources || []).map(s => fmt.link(s, fmt.host(s))).join('')}</div>` }], actions: [{ label: 'PE landscape →', href: '#/pe' }] }),
  });
  return () => { stopSize(); map.remove(); unroot(el)(); };
}

/* ══ 5. Filings & financials ═════════════════════════════════════════════ */
async function filings(ctx) {
  cssOnce();
  const { el, ui, fmt, data, charts, esc, inspector } = ctx; root(el);
  const [fil, comps] = await Promise.all([data.research('frontline_filings'), data.research('public_comps')]);
  const byId = id => (fil?.items || []).find(i => i.id === id)?.key_figures || {};
  const k1 = byId('fl-001'), k2 = byId('fl-002'), k3 = byId('fl-003'), k4 = byId('fl-004'), k11 = byId('fl-011'), k9 = byId('fl-009');
  const fv = k3.fair_value_usd || {}; const fvKeys = Object.keys(fv).sort(); const fvLast = fv[fvKeys[fvKeys.length - 1]];
  const est = Object.fromEntries((fil?.meta?.estimate_table || []).map(e => [e.metric, e]));
  const legal = (comps?.items || []).filter(c => /legal|bpo/i.test(c.sector_tag || '') || (c.secondary_sector_tags || []).some(s => /legal|bpo/i.test(s)));
  const bench = comps?.meta?.sector_benchmarks?.legal_bpo_managed_services || null;

  el.innerHTML = ui.pageHead({
    title: 'Filings & financials',
    sub: `<b>So what:</b> Broad Sky bought Frontline in Dec 2024 for an estimated ${esc(est['Transaction enterprise value']?.estimate || '$230–260M')} EV, about 60% equity and a $90M NXT/Audax term loan. That implies ${esc(est['Adjusted EBITDA at close (2024 run-rate)']?.estimate || '$16–20M')} EBITDA at ${esc(est['Entry EV/EBITDA']?.estimate || '12–15x')} (est.). Carlyle AlpInvest's co-invest mark is up ~${fmt.num(k3.markup_vs_cost_2026_06_30_pct ?? 9.5, 1)}% versus cost, and the estimated 13–18% EBITDA margin sits at or just below the BPO public-comp median${bench ? ` (${pctTxt(bench.median_ebitda_margin_latest_pct)})` : ''}.`,
    chips: `${fmt.chip('Estimates, not audited figures', 'var(--amber)')}${fmt.chip('SEC Form D · N-PORT · UK Companies House', COLOR)}`,
  }) + (fil ? '' : ui.note('Research dataset <b>frontline_filings</b> is not available. The KPIs below show the last verified snapshot (Form D / N-PORT, Sept 2026) and will refresh when the file returns.', 'warn') + '<div class="mt-12"></div>') + ui.kpis([
    { label: 'BSP-FL LP equity (Form D)', value: fmt.money(k1.total_amount_sold_usd ?? 136952357), sub: `${fmt.num(k1.investors ?? 21)} investors · Dec 2024`, color: COLOR },
    { label: 'Initial term loan', value: fmt.money(k4.group_initial_term_loan_usd ?? 9e7), sub: esc((k4.lenders || ['NXT Capital', 'Audax Private Debt']).join(' + ')), color: 'var(--red)' },
    { label: 'Co-invest vehicle', value: fmt.money(k2.total_amount_sold_usd ?? 3e7), sub: `of ${fmt.money(k2.total_offering_usd ?? 375e5)} offered · BSP-FL Co-Invest`, color: 'var(--accent)' },
    { label: 'Carlyle mark (latest)', value: fmt.money(fvLast ?? 13715215), sub: `+${fmt.num(k3.markup_vs_cost_2026_06_30_pct ?? 9.5, 1)}% vs $12.5M cost · ${esc(fvKeys[fvKeys.length - 1] || '2026-06-30')}`, color: 'var(--green)' },
    { label: 'Revenue (est.)', value: esc(String(est['Revenue (2025 run-rate)']?.estimate || '$100-140M').replace(/-/g, '–')), sub: `${esc(est['Revenue (2025 run-rate)']?.confidence || 'low')} confidence · ~1,100 staff`, color: 'var(--amber)' },
    { label: 'MSP 501 rank', value: '#36', sub: esc(String(k9['2026'] || 'highest-ranked legal-only MSP').replace(/^#36 of 501; /, '')), color: HEX },
  ]) +
  `<div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Capital disclosed at close', sub: 'Sources of funds from public filings ($M) — components may overlap; not additive', body: `<div id="fl-fi-cap"></div><h4 class="mt-12">Carlyle AlpInvest fair value — BSP-FL Intermediate Inc.</h4><div id="fl-fi-fv" class="mt-8"></div>`, foot: `${ui.source('SEC Form D / N-PORT; UK Companies House', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=2048389', fil?.meta?.generated)}` })}
    ${ui.panel({ title: 'Public comps — legal / BPO / managed services', sub: 'Latest FY · SEC XBRL · click a row for detail', body: '<div id="fl-fi-comps"></div>', flush: true, foot: ui.source('SEC XBRL companyfacts (public_comps)', 'https://www.sec.gov/edgar/search/', comps?.meta?.generated) })}
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Growth vs. margin — where Frontline sits', sub: 'Latest-FY revenue growth and approx. EBITDA margin (%) · Frontline EBITDA-margin est. for reference', body: '<div id="fl-fi-chart"></div>', foot: ui.source('public_comps · frontline_filings estimate table', null, 'Sept 2026') })}
    ${ui.panel({ title: 'What the comps imply for Frontline', body: bench ? `<div class="prose small">${esc(bench.what_this_implies_for_bsp)}</div><div class="mt-12">${[['Median growth (latest)', pctTxt(bench.median_revenue_growth_latest_pct)], ['Median 3-yr CAGR', pctTxt(bench.median_revenue_cagr_2023_latest_pct)], ['Median operating margin', pctTxt(bench.median_operating_margin_latest_pct)], ['Median EBITDA margin (approx.)', pctTxt(bench.median_ebitda_margin_latest_pct)], ['Frontline EBITDA margin (est.)', esc(est['EBITDA margin']?.estimate || '13–18%')], ['Median revenue / employee', fmt.money(bench.median_revenue_per_employee_usd)]].map(([k, v]) => `<div class="stat-line"><span>${k}</span><span class="v">${v}</span></div>`).join('')}</div>` : ui.note('Public comps benchmark not available yet.', 'warn'), foot: ui.source('public_comps sector_benchmarks', null, comps?.meta?.generated) })}
  </div>
  <div class="mt-12 m-fl-fil" id="fl-fi-filings"></div>`;

  // capital bars
  const cap = [
    { label: 'BSP-FL LP (Form D)', value: (k1.total_amount_sold_usd ?? 0) / 1e6, color: HEX },
    { label: 'Term loan (NXT + Audax)', value: (k4.group_initial_term_loan_usd ?? 0) / 1e6, color: '#ff5c5c' },
    { label: 'BSP-FL Co-Invest (Form D)', value: (k2.total_amount_sold_usd ?? 0) / 1e6, color: '#8ab4ff' },
    { label: 'Carlyle AlpInvest direct', value: (k3.cost_usd_2026_03_31 ?? 12.5e6) / 1e6, color: '#2ecc8f' },
  ].filter(c => c.value);
  el.querySelector('#fl-fi-cap').innerHTML = cap.length ? charts.hbar(cap, { labelW: 170, fmt: v => `$${fmt.num(v, 1)}M` }) : ui.empty('No capital figures');
  el.querySelector('#fl-fi-fv').innerHTML = fvKeys.length ? charts.line([{ name: 'Fair value', color: '#2ecc8f', points: fvKeys.map(k => [`Q${Math.ceil(Number(k.slice(5, 7)) / 3)}'${k.slice(2, 4)}`, fv[k] / 1e6]) }], { h: 150, fmt: v => `$${Number(v).toFixed(1)}M`, area: true }) + `<div class="kv-note">Held at cost for 5 quarters, then marked up ~10% at 3/31/2026 after the Jan-2026 CEO change (Tim Britt, ex-Synoptek).</div>` : ui.empty('No fair-value series');

  // comps table
  if (legal.length) {
    ui.table(el.querySelector('#fl-fi-comps'), {
      columns: [
        { key: 'ticker', label: 'Ticker', fmt: (v, r) => `<b class="mono">${esc(v)}</b>` },
        { key: 'company', label: 'Company', fmt: v => esc(coName(v)) },
        { key: 'latest_fy', label: 'FY', num: true },
        { key: 'revenue_growth_latest_pct', label: 'Growth', num: true, fmt: v => `<span style="color:${v >= 10 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-2)'}">${pctTxt(v)}</span>` },
        { key: 'revenue_cagr_2023_latest_pct', label: 'CAGR', num: true, fmt: v => pctTxt(v) },
        { key: 'operating_margin_latest_pct', label: 'Op. margin', num: true, fmt: v => pctTxt(v) },
        { key: 'ebitda_margin_latest_pct', label: 'EBITDA m.', num: true, fmt: v => pctTxt(v) },
        { key: 'revenue_per_employee_usd', label: 'Rev/emp', num: true, fmt: v => fmt.money(v) },
      ],
      rows: legal.map(c => ({ ...c, id: c.id })), pageSize: 10, sortKey: 'revenue_growth_latest_pct', exportName: 'frontline_public_comps',
      onRow: c => inspector.open({ title: `${esc(c.ticker)} · ${esc(coName(c.company))}`, sub: `${esc(c.sector_tag)} · FY${esc(c.latest_fy)} · ${esc(c.tenk_form || '')} filed ${esc(c.tenk_filed || '')}`, color: 'var(--c-fin)',
        sections: [
          { label: 'Fiscal years', html: `<div class="m-fl"><table class="mini"><thead><tr><th>FY</th><th class="num">Revenue</th><th class="num">Op. m.</th><th class="num">EBITDA m.</th><th class="num">Staff</th></tr></thead><tbody>${(c.fiscal_years || []).map(y => `<tr><td>${esc(y.fy)}</td><td class="num">${fmt.money(y.revenue_usd)}</td><td class="num">${pctTxt(y.operating_margin_pct)}</td><td class="num">${pctTxt(y.ebitda_margin_pct)}</td><td class="num">${fmt.compact(y.employees)}</td></tr>`).join('')}</tbody></table></div>` },
          { label: 'What it tells us', html: `<div class="small text-2">${esc(c.what_it_tells_us || '')}</div>` },
          c.status_note ? { label: 'Status', html: `<div class="small text-2">${esc(c.status_note)}</div>` } : null,
          { label: 'Next action', html: '<div class="small text-2">Use this peer as a margin and revenue-per-employee benchmark in the Frontline value-creation plan. Compare the offshore delivery mix (Hyderabad/Goa/Cape Town) against its cost structure.</div>' },
          { label: 'Sources', html: `<div class="col gap-4 small">${fmt.link(c.tenk_url, `${c.tenk_form || '10-K'} filing`)}${fmt.link(c.source_url, 'SEC XBRL companyfacts')}</div>` },
        ].filter(Boolean), actions: c.tenk_url ? [{ label: 'Open 10-K ↗', href: c.tenk_url }] : [] }),
    });
    const sorted = legal.slice().sort((a, b) => (b.revenue_growth_latest_pct ?? -99) - (a.revenue_growth_latest_pct ?? -99));
    const fe = String(est['EBITDA margin']?.estimate || '13-18%').match(/(\d+)\D+(\d+)/);
    el.querySelector('#fl-fi-chart').innerHTML = `<div class="grid grid-2"><div><h4 class="mb-8">Revenue growth</h4>${charts.hbar(sorted.map(c => ({ label: c.ticker, value: Math.max(0, c.revenue_growth_latest_pct ?? 0), color: (c.revenue_growth_latest_pct ?? 0) < 0 ? '#ff5c5c' : '#4c8dff' })), { labelW: 44, fmt: v => pctTxt(v) })}<div class="kv-note">Negative growth drawn as zero (WNS −0.6%). CBIZ inflated by the Marcum deal.</div></div><div><h4 class="mb-8">EBITDA margin (approx.)</h4>${charts.hbar([...sorted.map(c => ({ label: c.ticker, value: c.ebitda_margin_latest_pct, color: '#2ecc8f' })), ...(fe ? [{ label: 'FL est.', value: (Number(fe[1]) + Number(fe[2])) / 2, color: HEX }] : [])], { labelW: 44, max: 25, fmt: v => pctTxt(v) })}<div class="kv-note">EBITDA margin (approx.) · Frontline bar = midpoint of ${esc(fe ? `${fe[1]}–${fe[2]}%` : 'est.')} (low confidence)</div></div></div>`;
  } else {
    el.querySelector('#fl-fi-comps').innerHTML = ui.note('Public comps dataset not available (or no legal/BPO peers tagged).', 'warn');
    el.querySelector('#fl-fi-chart').innerHTML = ui.empty('No comps');
  }
  // renderFilings expects array meta fields; frontline_filings ships sources_summary as a '; '-separated string → normalise.
  const arr = v => Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(/;\s+(?![^()]*\))/) : [];
  // key_figures may hold nested objects/arrays (fair-value series, charge history) → flatten to readable strings so the shared table never prints [object Object].
  const flat = v => v == null ? '' : typeof v === 'number' ? v.toLocaleString() : Array.isArray(v) ? v.map(flat).join(', ') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}: ${flat(x)}`).join('; ') : String(v);
  const flatKF = kf => kf && typeof kf === 'object' ? Object.fromEntries(Object.entries(kf).map(([k, v]) => [k, v && typeof v === 'object' ? (Array.isArray(v) && v.some(x => x && typeof x === 'object') ? v.map(x => `(${flat(x)})`).join(' ') : flat(v)) : v])) : kf;
  const filN = fil ? { ...fil, items: (fil.items || []).map(i => ({ ...i, key_figures: flatKF(i.key_figures) })), meta: { ...(fil.meta || {}), sources_summary: arr(fil.meta?.sources_summary), data_gaps: arr(fil.meta?.data_gaps), next_pulls: arr(fil.meta?.next_pulls), estimate_table: Array.isArray(fil.meta?.estimate_table) ? fil.meta.estimate_table : [] } } : null;
  renderFilings(ctx, el.querySelector('#fl-fi-filings'), { data: filN, color: COLOR, title: 'Frontline Managed Services' });
  return unroot(el);
}

export default {
  id: 'fl', name: 'Frontline Managed Services', tag: 'Legal IT', color: COLOR, group: 'Portfolio',
  tagline: 'Managed IT, service desk, cybersecurity and revenue-cycle services for 800+ law firms, including more than half of the AM Law 200',
  hq: { lat: 38.627, lon: -90.1994, label: 'St. Louis, MO' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'amlaw', name: 'AM Law 200 targets', icon: '⚖', render: amlaw },
    { id: 'midsize', name: 'Mid-size firms', icon: '◧', render: midsize },
    { id: 'targets', name: 'Add-on targets', icon: '⊕', render: targetsView },
    { id: 'filings', name: 'Filings & financials', icon: '§', render: filings },
  ],
  tour: [
    { order: 400, hash: '#/fl/overview', caption: '<b>Frontline Managed Services.</b> 149 AM Law firms mapped against 11 offices. 93 are Tier 1; growth comes from cross-selling cyber + RCM bundles.', narration: 'Frontline runs IT, security and revenue cycle for over eight hundred law firms; ninety-three AM Law firms are Tier-one targets.', duration: 8500 },
    { order: 410, hash: '#/fl/amlaw?tier=Tier%201&cyber=5', caption: '<b>Cyber-first entry.</b> Tier-1 firms scoring 5/5 on cyber urgency. Each firm opens a recommended bundle and a next action.', narration: 'Filter to Tier-one firms with the highest cyber urgency; each opens a service bundle and a next action.', duration: 7500 },
    { order: 420, hash: '#/fl/filings', caption: '<b>Deal math from public filings.</b> ~$137M Form D equity plus a $90M term loan implies a ~$230–260M EV. Carlyle\'s co-invest mark is up ~10%.', narration: 'Public filings imply an enterprise value of roughly two hundred thirty to two hundred sixty million dollars.', duration: 7000 },
  ],
};
