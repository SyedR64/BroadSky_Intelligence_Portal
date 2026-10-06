/* CET growth plan: renders every section from the portal's research datasets
   (CET growth plan, opportunity radar, wastewater-plant screen, add-on screen, filings review,
   county fit model, sponsor landscape, firm profile, GridOS evidence base, portfolio agent model).
   The page frame (top bar, concept notice, breadcrumb, footer) comes from assets/frame.js. */
import { humanizeText } from '../../assets/frame.js?v=20261006143735';

const NE = ['MA', 'CT', 'RI', 'NH', 'ME', 'VT'];
const STATE_NAME = { MA: 'Massachusetts', CT: 'Connecticut', RI: 'Rhode Island', NH: 'New Hampshire', ME: 'Maine', VT: 'Vermont' };
const PHASE_COLOR = ['#2563eb', '#7c5cff', '#12a170', '#d64545'];
const PHASE_STATES = [['MA', 'CT'], ['RI', 'NH', 'ME', 'VT'], NE];
const NODES = [
  { name: 'Worcester HQ', sub: 'CET · founded 2008', lat: 42.2626, lon: -71.8023, dir: 'top' },
  { name: 'Taunton', sub: 'CET office', lat: 41.9001, lon: -71.0898, dir: 'bottom' },
  { name: 'Norwell', sub: 'NuWave · Oct 2025', lat: 42.1615, lon: -70.7928, dir: 'right' },
  { name: 'Canton CT', sub: 'Horton · Sep 2026', lat: 41.8237, lon: -72.8937, dir: 'left' },
];
const TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
  attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors',
};
const LEVER_ORDER = ['cp-lev-01', 'cp-lev-02', 'cp-lev-05', 'cp-lev-06', 'cp-lev-04', 'cp-lev-09', 'cp-lev-08', 'cp-lev-10'];
const AG_GROUPS = [
  { id: 'all', label: 'Everyone', rx: /./ },
  { id: 'est', label: 'Estimators & BD', rx: /estimat|business dev/i },
  { id: 'pm', label: 'PMs & back office', rx: /project manager|cfo/i },
  { id: 'field', label: 'Field crews & safety', rx: /field|foremen|safety|operations/i },
  { id: 'cust', label: 'Customers & plant operators', rx: /customer|operator|municipal/i },
];

let D = {}; let H = {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const M = v => v == null || isNaN(v) ? '—' : '$' + (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'K' : Math.round(v));
const N = v => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US');
const EST = '<span class="sys-est">est.</span>';
const STAGE = { open: 'open bid', planned: 'planned', recurring: 'recurring program', awarded: 'awarded' };
const OWN = { founder: 'Founder-owned', family: 'Family-owned', unknown: 'Ownership unknown' };
const srcLabel = s => plain(String(s || '').replace(/\s*\((?:web search result|search result|retrieved)[^)]*\)/gi, '').replace(/USAspending\.gov API\s*\(spending_by_award\)/i, 'USAspending.gov award search'));
const CAPN = { wastewater: 'Wastewater', pump_station: 'Pump stations', generator: 'Generators', controls: 'Controls and SCADA', solar: 'Solar', storage: 'Storage', ev_charging: 'EV charging', energy_efficiency: 'Efficiency', utility: 'Utility', electrical_construction: 'Electrical construction', data_center: 'Data centers' };
const srcA = (u, t) => u ? `<a href="${H.raw(u)}" target="_blank" rel="noopener">${H.esc(t || host(u))}</a>` : '';
/* plain(): turn dataset IDs, raw JSON values and ALL-CAPS tags into reader copy before escaping */
const PLAIN = [
  [/\s*\((?:meta\.)?kpi_roadmap\)/g, ''], [/\bmeta\.kpi_roadmap\b|\bkpi_roadmap\b/g, 'the 36-month roadmap'], [/\bkpi_targets\b/g, 'the phase targets'],
  [/\bcet_filings\b/g, 'our filings review'], [/\bserviceos_evidence\b/g, 'the GridOS evidence base'], [/\bcet_wwtp_targets\b/g, 'the wastewater screen'],
  [/\bcet_opportunities\b/g, 'the bid radar'], [/\bma_targets_cet\b/g, 'the add-on screen'], [/\bcet_ne_counties\b/g, 'the county screen'],
  [/\bpe_landscape\b/g, 'the sponsor landscape'], [/\bbsp_firm\b/g, 'the Broad Sky firm profile'], [/\bai_agents_portfolio\b/g, 'the portfolio agent model'], [/\bpp_nationwide\b/g, 'the Punctual Pros research'],
  [/\best_value_usd\b/g, 'estimated value'], [/\bpipeline_value_usd\b/g, 'pipeline value'], [/\bproject_value_usd\b/g, 'project value'],
  [/\b(?:meta\.)?estimate_table\b/g, 'estimate table'], [/\bdata_gaps\b/g, 'data gaps'], [/\bdata_points\b/g, 'data points'],
  [/\s+(?:ra-cet|cet-\d{3})\b/g, ''], [/\(baseline null\)/g, '(baseline not public)'], [/\bbaseline null\b/g, 'baseline not public'],
  [/\ba 3-4 year hold\b/g, 'about three years left in the hold'],
  [/at most one Phase 4 anchor/g, 'New England only, no new region needed'], [/;\s*also the Phase 4 gate test/g, ''],
  [/\bASSUMPTION\b/g, 'assumption'],
  [/\$(\d{4,}(?:\.\d+)?)M\b/g, (_, v) => '$' + (parseFloat(v) / 1000).toFixed(2) + 'B'],
];
const plain = v => { let t = String(v ?? ''); for (const [rx, to] of PLAIN) t = t.replace(rx, to); t = humanizeText(t); return t.replace(/\bthe (the|our) /g, '$1 ').replace(/(^|[.!?]\s+)(our|the|assumption)\b/g, (_, p, w) => p + w[0].toUpperCase() + w.slice(1)); };
const miles = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 3958.8 * 2 * Math.asin(Math.sqrt(x)); };
const nearestNode = t => { if (t.lat == null) return { mi: t.nearest_cet_node_miles, name: String(t.nearest_cet_node || '').replace(/\s*\(.*\)/, '') }; let best = null; for (const n of NODES) { const mi = miles(t.lat, t.lon, n.lat, n.lon); if (!best || mi < best.mi) best = { mi, name: n.name.replace(' HQ', '') }; } return { mi: Math.round(best.mi), name: best.name }; };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function boot({ Data, Fmt, esc, Chat, frame }) {
  H = { Data, Fmt, esc: s => esc(plain(s)), raw: esc, Chat, frame };
  rationaleLinks();
  const names = ['cet_playbook', 'cet_opportunities', 'cet_wwtp_targets', 'ma_targets_cet', 'cet_filings', 'pe_landscape', 'bsp_firm', 'serviceos_evidence', 'ai_agents_portfolio'];
  const [pb, opp, wwtp, tgt, fil, pe, firm, sev, agp, counties] = await Promise.all([...names.map(n => Data.research('research/' + n)), Data.load('cet_ne_counties').catch(() => [])]);
  D = { pb, opp: opp?.items || [], oppMeta: opp?.meta || {}, wwtp: wwtp?.items || [], tgt: tgt?.items || [], tgtMeta: tgt?.meta || {}, fil, pe: pe?.items || [], firm, sev: sev?.items || [], sevMeta: sev?.meta || {}, agp: agp?.items || [], counties: Array.isArray(counties) ? counties : [] };
  D.items = pb?.items || []; D.K = k => D.items.filter(i => i.kind === k && !(k === 'expansion_phase' && /gated option/i.test(i.phase || '')));
  D.road = pb?.meta?.kpi_roadmap || [];
  const steps = [sld, kpis, strip, template, mapSection, stateTable, levers, agents, talent, addons, finance, roadmap, bridge, risks, sources, chat];
  for (const f of steps) { try { f(); } catch (e) { console.warn('growth plan section failed:', f.name, e); } }
}

/* ── rationale deep links (the concept notice itself belongs to the frame) ─ */
function rationaleLinks() {
  const openRat = () => { const d = $('#rat-drawer'); if (d) d.open = true; };
  $$('a[href="#rationale"]').forEach(a => a.addEventListener('click', openRat));
  if (location.hash === '#rationale') openRat();
}

/* ── hero single-line diagram ───────────────────────────────────────────── */
function sld() {
  const s = $('#sld'); if (!s) return;
  const nodes = [{ x: 64, n: 'Worcester', s: 'HQ · CET' }, { x: 164, n: 'Taunton', s: 'CET' }, { x: 264, n: 'Norwell', s: 'NuWave' }, { x: 364, n: 'Canton CT', s: 'Horton' }];
  const p2 = [{ x: 70, n: 'RI' }, { x: 163, n: 'NH' }, { x: 256, n: 'ME' }, { x: 349, n: 'VT' }];
  const bolt = (x, y) => `<path d="M${x + 2} ${y - 8} l-6 9 h4.5 l-2 7 l6.5 -9.5 h-4.5 z" fill="#0a1730"/>`;
  s.innerHTML = `
  <text class="pb-sub" x="24" y="24">MAIN BUS · MONTH 0 · 4 SITES · ~275 PEOPLE (EST.)</text>
  <line x1="24" y1="40" x2="416" y2="40" stroke="#ffb627" stroke-width="4" stroke-linecap="round"/>
  ${nodes.map(d => `<line x1="${d.x}" y1="40" x2="${d.x}" y2="86" stroke="#ffb627" stroke-width="2.5"/>
    <circle cx="${d.x}" cy="100" r="15" fill="#ffb627"/>${bolt(d.x, 100)}
    <text class="pb-lbl" x="${d.x}" y="134" text-anchor="middle">${d.n}</text><text class="pb-sub" x="${d.x}" y="147" text-anchor="middle">${d.s}</text>`).join('')}
  <line class="pb-flow" x1="214" y1="40" x2="214" y2="196" stroke="#7aa2ff" stroke-width="2"/>
  <circle cx="214" cy="160" r="8" fill="#0a1730" stroke="#7aa2ff" stroke-width="2"/><circle cx="214" cy="171" r="8" fill="none" stroke="#7aa2ff" stroke-width="2"/>
  <text class="pb-sub" x="228" y="168">PHASE 2 · MO 9–24</text>
  <line x1="40" y1="196" x2="400" y2="196" stroke="#7aa2ff" stroke-width="3" stroke-dasharray="7 6"/>
  ${p2.map(d => `<line class="pb-flow" x1="${d.x}" y1="196" x2="${d.x}" y2="214" stroke="#7aa2ff" stroke-width="2"/>
    <circle cx="${d.x}" cy="228" r="14" fill="#13254a" stroke="#7aa2ff" stroke-width="2" stroke-dasharray="4 3"/>
    <text class="pb-lbl" x="${d.x}" y="232" text-anchor="middle">${d.n}</text>`).join('')}
  <text class="pb-sub" x="40" y="262">Licensed in all six states. Crews today sit only in MA and CT.</text>
  <rect x="24" y="280" width="146" height="40" rx="8" fill="#0f2a22" stroke="#12a170" stroke-width="1.5"/>
  <text class="pb-lbl" x="34" y="297">Phase 3 · recurring O&amp;M</text><text class="pb-sub" x="34" y="311">SCADA·PV·EV·efficiency</text>
  <line x1="400" y1="196" x2="400" y2="300" stroke="#5a6f96" stroke-width="2" stroke-dasharray="4 4"/>
  <line x1="400" y1="300" x2="384" y2="300" stroke="#8ea2c6" stroke-width="2"/>
  <line x1="384" y1="300" x2="366" y2="288" stroke="#8ea2c6" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="384" cy="300" r="2.5" fill="#8ea2c6"/><circle cx="362" cy="300" r="2.5" fill="#8ea2c6"/>
  <line x1="362" y1="300" x2="346" y2="300" stroke="#8ea2c6" stroke-width="2"/>
  <rect x="182" y="280" width="164" height="40" rx="8" fill="none" stroke="#8ea2c6" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text class="pb-lbl" x="192" y="297" style="fill:#c4d0e6">Phase 4 · optional</text><text class="pb-sub" x="192" y="311">board decision at mo 24</text>`;
}

/* ── KPIs ───────────────────────────────────────────────────────────────── */
function kpis() {
  const r = D.road; if (!r.length) return;
  const a = r[0], z = r[r.length - 1];
  const defs = [
    { l: 'Revenue', k: 'revenue_usd', f: M, n: 'Pro forma run-rate' },
    { l: 'EBITDA', k: 'ebitda_usd', f: M, n: `${(a.ebitda_usd / a.revenue_usd * 100).toFixed(1)}% to ${(z.ebitda_usd / z.revenue_usd * 100).toFixed(1)}% margin` },
    { l: 'People', k: 'headcount', f: N, n: 'Licensed electricians are the constraint' },
    { l: 'Sites', k: 'locations_or_accounts', f: N, n: `${a.locations_or_accounts} today in 2 states; the plan reaches all 6` },
  ];
  $('#kpis').innerHTML = defs.map(d => { const max = Math.max(...r.map(x => x[d.k] || 0)); return `<div class="sys-kpi" data-co="cet">
    <span class="sys-kpi-label">${d.l}</span>
    <span class="sys-kpi-value"><span class="pb-kfrom">${d.f(a[d.k])} →</span>${d.f(z[d.k])}${EST}<span class="pb-kx">${(z[d.k] / a[d.k]).toFixed(1)}x</span></span>
    <div class="pb-spark" aria-hidden="true">${r.map(x => `<i style="height:${Math.max(8, (x[d.k] / max) * 100)}%" title="Month ${x.month}"></i>`).join('')}</div>
    <span class="sys-kpi-sub">Months 0, 12, 24 and 36. ${H.esc(d.n)}.</span></div>`; }).join('');
}

function strip() {
  const open = D.opp.filter(o => o.stage === 'open').length;
  const proj = D.wwtp.filter(w => /plant_|ps_/.test(w.project_class || '')); const projV = proj.reduce((s, w) => s + (w.project_value_usd || 0), 0);
  const fit80 = D.opp.filter(o => (o.fit_score || 0) >= 80).length;
  const fit70 = D.tgt.filter(t => t.fit_score >= 70).length;
  const t12 = D.counties.filter(c => /Tier [12]/.test(c.cet_fit_tier || '')).length;
  const sp = D.pe.filter(p => (p.overlap_with_bsp || []).includes('cet')); const hi = sp.filter(p => p.threat_level === 'high').length;
  const cells = [
    ['Bid radar', N(D.opp.length), `Bids and programs · ${open} open now`],
    ['Wastewater projects', N(proj.length), `Funded or requested plant and pump-station projects · ${M(projV)} total project cost*`],
    ['Add-on targets', N(D.tgt.length), `${fit70} score 70 or more`],
    ['Counties scored', N(D.counties.length), `New England · ${t12} in tiers 1–2`],
    ['Competing sponsors', N(sp.length), `PE firms chasing similar deals · ${hi} high threat`],
    ['High-fit bids', N(fit80), 'Radar items scoring 80 or more; first through GridOS go/no-go'],
  ];
  $('#hero-strip').innerHTML = cells.map(([l, b, s]) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${H.esc(l)}</span><span class="sys-kpi-value">${H.esc(b)}</span><span class="sys-kpi-sub">${H.esc(s)}</span></div>`).join('');
  const sn = $('#strip-note'); if (sn) sn.innerHTML = `<b>Source:</b> CET opportunity radar, wastewater-plant screen, add-on screen, county fit model and sponsor landscape, Sept 2026. *One wastewater measure is used throughout this page: the ${N(proj.length)} plant and pump-station projects that are funded or requested on the CT, MA and RI state lists, at the applicant’s total project cost (${M(projV)}). CET’s electrical scope is typically about 10–20% of that, so the addressable work is roughly ${M(projV * .1)}–${M(projV * .2)}${EST}. Bid-radar values are a separate universe (see the state table).`;
}

/* ── template ───────────────────────────────────────────────────────────── */
function template() {
  const t = D.K('template');
  const sh = t.filter(x => /^cp-tpl-0[1-7]$/.test(x.id)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const an = t.filter(x => !sh.includes(x)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const draw = f => {
    const list = f === 'sh' ? sh : an;
    $('#timeline').innerHTML = list.map(x => {
      const [head, ...rest] = String(x.event).split(/(?<=[.:])\s+(?=CET parallel)/);
      return `<li class="${x.id === 'cp-tpl-07' ? 'is-exit' : f === 'an' ? 'is-an' : ''}">
        <div class="pb-tl-date">${H.esc(fmtDate(x.date))} · ${H.esc(x.location || '')}</div>
        <div class="pb-tl-h">${H.esc(x.company)}</div>
        ${x.metric ? `<p class="pb-tl-m">${H.esc(x.metric)}</p>` : ''}
        <p class="pb-tl-e">${H.esc(head.replace(/\s*CET parallel:.*$/, ''))}</p>
        <div class="sys-note sys-note--co pb-tl-cet"><span><b>CET move:</b> ${H.esc(x.cet_move || '')}</span></div>
        <p class="sys-src"><b>Source:</b> ${srcA(x.source_url)}</p></li>`; }).join('');
  };
  draw('sh');
  $$('#tpl-seg button').forEach(b => b.onclick = () => { $$('#tpl-seg button').forEach(x => { x.setAttribute('aria-selected', x === b); x.setAttribute('aria-pressed', x === b); }); draw(b.dataset.f); });
  const a = D.road[0] || {}, z = D.road[D.road.length - 1] || {};
  const rows = [
    ['Starting base', '~100 professionals, 1 office', `~${N(a.headcount)} people, ${N(a.locations_or_accounts)} sites${EST}`],
    ['Time frame', '3.5 years, entry to exit', 'Entered Feb 2025. This plan runs Oct 2026 to Oct 2029'],
    ['Add-ons', '9', '2 closed (NuWave, Horton) + ~6–7 planned'],
    ['First adjacent-state deal', 'Market Street, ~9 months in', 'Horton (CT), ~19 months in'],
    ['Revenue', '~4x', `<b>${(z.revenue_usd / a.revenue_usd).toFixed(1)}x</b> (${M(a.revenue_usd)} to ${M(z.revenue_usd)})${EST}`],
    ['Headcount', '8x', `<b>${(z.headcount / a.headcount).toFixed(1)}x</b>${EST}`],
    ['Locations', '1 to 11', `<b>${a.locations_or_accounts} to ${z.locations_or_accounts}</b>${EST}`],
    ['Delivery leverage', 'AI tools + offshore center in India', 'GridOS: 9 AI agents + shared back office'],
    ['Exit', 'TPG Growth, Aug 2026', 'Month 36 is Q4 2029, about 4.7 years after entry (a sale at month 24–30 would be about 3.7–4.2 years)'],
  ];
  $('#compare').innerHTML = `<span class="sys-card-label">Template against this plan</span><h3 class="sys-card-title">Smith + Howard and the CET plan</h3><p class="sys-card-body">Smith + Howard facts are sourced. CET figures are labelled assumptions.</p>
    <table class="pb-cmp"><thead><tr><th></th><th>Smith + Howard</th><th>CET plan</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
    <div class="sys-note sys-note--co"><span><b>Why about 3x and not 4x.</b> CET starts about 2.7x larger by headcount than Smith + Howard did. The multiple comes from mix (recurring O&amp;M) and margin (10% to 12.5%), not only from adding sites.</span></div>
    <div class="sys-note sys-note--info"><span><b>The hold is longer.</b> Smith + Howard took 3.5 years. CET reaches month 36 about 4.7 years after Broad Sky’s entry, so the returns card in section 07 shows IRR as well as MOIC.</span></div>`;
}
const fmtDate = s => { if (!s) return ''; const [y, m, d] = String(s).split('-'); const mo = m ? new Date(2000, +m - 1, 1).toLocaleString('en-US', { month: 'short' }) : ''; return [mo, d ? +d : '', y].filter(Boolean).join(' ').replace(/ (\d{4})$/, d ? ', $1' : ' $1'); };

/* ── map ────────────────────────────────────────────────────────────────── */
let MAP, LAY = {}, PHASE = 'all', PLAY = null;
function mapSection() {
  const ph = D.K('expansion_phase');
  const bar = $('#phase-bar');
  bar.innerHTML = `<button type="button" class="sys-chip" data-p="all" aria-pressed="true" title="Months 0–36"><i class="pb-sw" aria-hidden="true"></i>Whole plan</button>` +
    ph.map((p, i) => `<button type="button" class="sys-chip" data-p="${i}" aria-pressed="false" style="--pc:${PHASE_COLOR[i]}" title="Phase ${i + 1} · months ${H.esc(p.months)}"><i class="pb-sw" aria-hidden="true"></i>Phase ${i + 1} · ${H.esc(shortPhase(p.phase))}</button>`).join('') +
    `<button type="button" class="sys-btn sys-btn--primary sys-btn--sm pb-ph-play" id="ph-play" aria-label="Play through the phases"><span>▶ Play</span></button>`;
  $$('.sys-chip[data-p]', bar).forEach(b => b.onclick = () => { stopPlay(); setPhase(b.dataset.p); });
  $('#ph-play').onclick = () => { if (PLAY) return stopPlay(); let i = 0; setPhase('0'); $('#ph-play span').textContent = '❚❚ Pause'; PLAY = setInterval(() => { i++; if (i > ph.length - 1) return stopPlay(); setPhase(String(i)); }, 3800); };
  if (!window.L) { $('#leaf').innerHTML = '<p class="sys-src" style="padding:20px">The map library did not load.</p>'; phasePanel(); return; }
  MAP = L.map('leaf', { center: [43.0, -72.2], zoom: 6, scrollWheelZoom: false, preferCanvas: true, zoomSnap: 0.25 });
  L.tileLayer(TILES.url, { attribution: TILES.attr, maxZoom: 16, maxNativeZoom: 16 }).addTo(MAP);
  L.tileLayer(TILES.ref, { maxZoom: 16, maxNativeZoom: 16, pane: 'shadowPane', opacity: .9 }).addTo(MAP);
  const R = L.canvas({ padding: .5 });
  LAY = { county: L.layerGroup(), wwtp: L.layerGroup(), opp: L.layerGroup(), tgt: L.layerGroup(), node: L.layerGroup() };
  LAY.R = R;
  const legend = [['county', 'County fit', '#9db8ef', ''], ['wwtp', 'Wastewater plants', '#0ea5b7', 'sq'], ['opp', 'Bids and programs', '#ffb627', ''], ['tgt', 'Add-on targets', '#7c5cff', ''], ['node', 'CET sites today', '#0a1730', '']];
  $('#map-legend').innerHTML = legend.map(([k, l, c, cls]) => `<label><input type="checkbox" data-l="${k}" checked> <i class="${cls ? 'pb-sq' : ''}" style="background:${c}"></i>${l}</label>`).join('');
  $$('#map-legend input').forEach(i => i.onchange = () => { const g = LAY[i.dataset.l]; i.checked ? g.addTo(MAP) : MAP.removeLayer(g); });
  Object.entries(LAY).forEach(([k, g]) => { if (k !== 'R') g.addTo(MAP); });
  setPhase('all');
  setTimeout(() => MAP.invalidateSize(), 200);
}
const shortPhase = s => String(s).replace(/^Phase\s*\d+\s*(\(gated option\))?\s*[-–—]\s*/i, '').split(/[:(]/)[0].replace(/,.*$/, '').trim();
function stopPlay() { if (PLAY) clearInterval(PLAY); PLAY = null; const b = $('#ph-play span'); if (b) b.textContent = '▶ Play'; }

function setPhase(p) {
  PHASE = p;
  $$('#phase-bar .sys-chip[data-p]').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
  phasePanel(); highlightStates();
  if (!MAP) return;
  Object.entries(LAY).forEach(([k, g]) => { if (k !== 'R') g.clearLayers(); });
  const i = p === 'all' ? -1 : +p; const R = LAY.R;
  const states = i < 0 ? NE : PHASE_STATES[i];
  const recurring = /solar|storage|ev_charging|energy_efficiency|controls/;
  // counties
  for (const c of D.counties) {
    if (c.centroid_lat == null || !states.includes(c.state)) continue;
    const v = i === 2 ? Math.max(c.data_center_proxy_score || 0, c.ev_infrastructure_score || 0) : c.cet_fit_score || 0;
    L.circleMarker([c.centroid_lat, c.centroid_lng], { renderer: R, radius: 6 + v / 6, color: '#5b82d6', weight: 1, fillColor: '#9db8ef', fillOpacity: .28 })
      .bindPopup(`<b>${H.esc(c.county_name)} County, ${H.esc(c.state)}</b><br><span class="pb-pop-k">${H.esc(c.cet_fit_tier || '')} · CET fit ${H.esc(c.cet_fit_score)}</span><br>Data-center proxy ${H.esc(c.data_center_proxy_score ?? '—')} · EV infra ${H.esc(c.ev_infrastructure_score ?? '—')}<br>${H.esc((c.fit_drivers || []).join(' · '))}`).addTo(LAY.county);
  }
  // wwtp
  for (const w of D.wwtp) {
    if (w.lat == null || !states.includes(w.state)) continue;
    const xs = (w.cross_sell || []).length; const hot = (w.horton_fit || 0) >= 80;
    const rad = i === 2 ? 3 + xs * 1.3 : hot ? 7 : 3.5 + Math.min(4, (w.design_flow_mgd || 0) / 6);
    L.circleMarker([w.lat, w.lon], { renderer: R, radius: rad, color: '#0b7f8d', weight: hot ? 2 : 1, fillColor: '#0ea5b7', fillOpacity: hot ? .9 : .55 })
      .bindPopup(`<b>${H.esc(w.facility_name)}</b><br><span class="pb-pop-k">${H.esc(w.town)}, ${H.esc(w.state)} · ${H.esc(w.design_flow_mgd ?? '—')} MGD · Horton fit ${H.esc(w.horton_fit ?? '—')}</span>${w.recent_or_planned_project ? `<br>${H.esc(w.recent_or_planned_project)}${w.project_value_usd ? ` (${M(w.project_value_usd)})` : ''}` : ''}${xs ? `<br>Cross-sell: ${H.esc(w.cross_sell.join(', '))}` : ''}`).addTo(LAY.wwtp);
  }
  // opportunities
  for (const o of D.opp) {
    if (o.lat == null || !states.includes(o.state)) continue;
    const rec = recurring.test((o.capability_match || []).join(' ')) || o.stage === 'recurring';
    if (i === 2 && !rec) continue;
    L.circleMarker([o.lat, o.lon], { renderer: R, radius: 4 + (o.fit_score || 0) / 20, color: '#a86b00', weight: 1.2, fillColor: '#ffb627', fillOpacity: o.stage === 'open' ? .95 : .6 })
      .bindPopup(`<b>${H.esc(o.title)}</b><br><span class="pb-pop-k">${H.esc(o.owner_or_agency || '')} · ${H.esc(o.state)} · ${H.esc(STAGE[o.stage] || o.stage)} · fit ${H.esc(o.fit_score ?? '—')}</span>${o.est_value_usd ? `<br>Value ${M(o.est_value_usd)}${EST} (total project)` : ''}${o.due_date ? `<br>Due ${H.esc(fmtDate(o.due_date))}` : ''}<br>${srcA(o.source_url, srcLabel(o.source_name) || 'Source')}`).addTo(LAY.opp);
  }
  // targets
  for (const t of D.tgt) {
    if (t.lat == null || !states.includes(t.state) || i === 2) continue;
    L.circleMarker([t.lat, t.lon], { renderer: R, radius: 4 + (t.fit_score || 0) / 14, color: '#4b2fd1', weight: 1.5, fillColor: '#7c5cff', fillOpacity: t.fit_score >= 70 ? .9 : .5 })
      .bindPopup(`<b>${H.esc(t.company)}</b><br><span class="pb-pop-k">${H.esc(t.hq_city)}, ${H.esc(t.state)} · fit ${H.esc(t.fit_score)} · ~${H.esc(t.employees ?? '—')} staff</span><br>${H.esc((t.specialties || []).slice(0, 3).join(', '))}<br>Revenue ${M(t.revenue_est_usd)}${EST} (ZoomInfo model) · ${H.esc(OWN[t.ownership] || 'Ownership unknown')}`).addTo(LAY.tgt);
  }
  // nodes
  for (const n of NODES) L.circleMarker([n.lat, n.lon], { renderer: R, radius: 8, color: '#0a1730', weight: 3, fillColor: '#ffb627', fillOpacity: 1 }).bindTooltip(`<b>${n.name}</b> · ${n.sub}`, { permanent: i === 0, direction: n.dir, offset: n.dir === 'right' ? [8, 0] : n.dir === 'left' ? [-8, 0] : [0, 0] }).addTo(LAY.node);
  const B = i === 0 ? [[40.95, -73.8], [42.95, -69.9]] : [[41.0, -73.8], [47.4, -66.9]];
  if (MAP._pbInit) MAP.flyToBounds(B, { duration: .8, padding: [10, 10] }); else { MAP.fitBounds(B, { padding: [10, 10] }); MAP._pbInit = true; }
}

function phasePanel() {
  const el = $('#phase-panel'); const ph = D.K('expansion_phase');
  if (PHASE === 'all') {
    el.style.removeProperty('--pc');
    el.innerHTML = `<span class="pb-pp-months">Months 0–36 · ${ph.length} phases</span><h3 class="sys-h3">The whole plan</h3>
      <p class="pb-th">${H.esc(String(D.pb?.meta?.narrative || '').split('. ').slice(2, 4).join('. '))}.</p>
      <p class="sys-card-label">Phases</p><ul>${ph.map((p, i) => `<li><b style="color:${PHASE_COLOR[i]}">Phase ${i + 1}</b> (months ${H.esc(p.months)}): ${H.esc(shortPhase(p.phase))}</li>`).join('')}</ul>
      <p class="sys-card-label">How to read the map</p><ul><li>Amber: bids, capital plans and programs (brighter means open now)</li><li>Teal: wastewater plants; a bold ring means Horton fit of 80 or more</li><li>Violet: add-on targets (solid means fit of 70 or more)</li><li>Blue bubbles: county fit score</li></ul><p class="pb-th">Everything on this map, and every number on this page, is New England. Anything beyond is outside the plan (see Risks).</p>`;
    return;
  }
  const i = +PHASE, p = ph[i]; if (!p) return; const dp = p.data_points || {};
  el.style.setProperty('--pc', PHASE_COLOR[i]);
  const kt = p.kpi_targets || {}; const kLab = { revenue_usd: ['Revenue', M], ebitda_usd: ['EBITDA', M], headcount: ['People', N], locations: ['Sites', N], recurring_service_share_pct: ['Recurring mix', v => v + '%'], managed_ev_ports: ['Managed EV ports', N], solar_availability_pct: ['PV availability', v => v + '%'] };
  const kHtml = Object.entries(kt).filter(([k]) => kLab[k]).map(([k, v]) => `<div><b>${kLab[k][1](v)}${EST}</b><span>${kLab[k][0]} target</span></div>`).join('');
  let lists = '';
  const ul = (h, a, n = 5) => a?.length ? `<p class="sys-card-label">${h}</p><ul>${a.slice(0, n).map(x => `<li>${H.esc(x)}</li>`).join('')}</ul>` : '';
  if (i === 0) lists = ul('Wastewater plants Horton should call first', dp.wwtp_priority_top_10, 6) + ul('MA tuck-ins that add capacity', dp.top_ma_ct_targets, 4);
  if (i === 1) lists = ul('Second-ring targets (none scores 70 yet)', dp.top_second_ring_targets, 5) + ul('Densify CT after Horton', dp.ct_densify_targets_after_horton, 3);
  if (i === 2) { const cap = dp.opportunity_value_by_capability_usd_m || {}; lists = `<p class="sys-card-label">Radar value by capability</p><ul>${Object.entries(cap).sort((a, b) => b[1].est_value_usd_m - a[1].est_value_usd_m).slice(0, 6).map(([k, v]) => `<li><b>${H.esc(CAPN[k] || plain(k).replace(/_/g, ' '))}</b>: ${v.opportunities} items · $${N(v.est_value_usd_m)}M${EST}</li>`).join('')}</ul>` + ul('Data-center proxy, top counties', dp.county_data_center_proxy_top, 4) + (dp.gridos_roadmap_assumption ? `<p class="sys-card-label">GridOS</p><p class="pb-th">${H.esc(dp.gridos_roadmap_assumption)}</p>` : ''); }
  el.innerHTML = `<span class="pb-pp-months">Phase ${i + 1} · months ${H.esc(p.months)}</span><h3 class="sys-h3">${H.esc(shortPhase(p.phase))}</h3>
    <p class="pb-th">${H.esc(p.thesis)}</p>${kHtml ? `<div class="pb-pp-kpis">${kHtml}</div>` : ''}${lists}
    ${ul('Market evidence', p.market_evidence, 3)}<p class="sys-src"><b>Sources:</b> ${(p.source_urls || [p.source_url]).slice(0, 4).map(u => srcA(u)).join(' · ')}</p>`;
}

/* ── state table ────────────────────────────────────────────────────────── */
function stateTable() {
  const rows = NE.map(s => {
    const o = D.opp.filter(x => x.state === s), w = D.wwtp.filter(x => x.state === s), t = D.tgt.filter(x => x.state === s), c = D.counties.filter(x => x.state === s).sort((a, b) => (b.cet_fit_score || 0) - (a.cet_fit_score || 0))[0];
    return { s, opp: o.length, open: o.filter(x => x.stage === 'open').length, val: o.reduce((a, x) => a + (x.est_value_usd || 0), 0), wwtp: w.length, proj: w.filter(x => /plant_|ps_/.test(x.project_class || '')).length, projV: w.filter(x => /plant_|ps_/.test(x.project_class || '')).reduce((a, x) => a + (x.project_value_usd || 0), 0), tgt: t.length, t70: t.filter(x => x.fit_score >= 70).length, fam: t.filter(x => /founder|family/.test(x.ownership || '')).length, county: c ? `${c.county_name} (${c.cet_fit_score})` : '—' };
  });
  const sum = k => rows.reduce((a, r) => a + r[k], 0);
  const n = 'class="sys-n"';
  $('#state-table').innerHTML = `<table class="sys-table pb-tbl">
    <thead><tr><th>State</th><th ${n}>Opportunities</th><th ${n}>Open now</th><th ${n}>Value* ${EST}</th><th ${n}>Treatment plants</th><th ${n}>Plant and pump-station projects</th><th ${n}>Project cost†</th><th ${n}>Targets</th><th ${n}>Fit 70+</th><th ${n}>Founder or family</th><th>Top county (fit)</th></tr></thead>
    <tbody>${rows.map(r => `<tr data-s="${r.s}"><td>${STATE_NAME[r.s]}</td><td ${n}>${r.opp}</td><td ${n}>${r.open}</td><td ${n}>${M(r.val)}</td><td ${n}>${r.wwtp || '—'}</td><td ${n}>${r.proj || '—'}</td><td ${n}>${r.projV ? M(r.projV) : '—'}</td><td ${n}>${r.tgt}</td><td ${n}>${r.t70}</td><td ${n}>${r.fam}</td><td>${H.esc(r.county)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>New England</td><td ${n}>${sum('opp')}</td><td ${n}>${sum('open')}</td><td ${n}>${M(sum('val'))}</td><td ${n}>${sum('wwtp')}</td><td ${n}>${sum('proj')}</td><td ${n}>${M(sum('projV'))}</td><td ${n}>${sum('tgt')}</td><td ${n}>${sum('t70')}</td><td ${n}>${sum('fam')}</td><td>—</td></tr></tfoot>
    <caption>Source: CET opportunity radar, wastewater-plant screen (Maine, New Hampshire and Vermont are not screened yet), add-on screen and county fit model, Sept 2026. *Bid radar: total project or program cost where stated (${D.opp.filter(x => x.est_value_usd).length} of ${D.opp.length} items). †Funded or requested plant and pump-station projects on the state lists, at the applicant’s total project cost. Neither is CET’s electrical scope, which is typically about 10–20% of project cost.</caption></table>`;
  highlightStates();
}
function highlightStates() { const i = PHASE === 'all' ? -1 : +PHASE; const st = i < 0 ? [] : i === 2 ? [] : PHASE_STATES[i]; $$('#state-table tbody tr').forEach(tr => tr.classList.toggle('is-on', st.includes(tr.dataset.s))); }

/* ── levers ─────────────────────────────────────────────────────────────── */
function levers() {
  const all = D.K('growth_lever'); const pick = LEVER_ORDER.map(id => all.find(x => x.id === id)).filter(Boolean);
  const fmt = (v, u) => v == null ? '—' : /USD/.test(u || '') ? M(v) : (Number.isInteger(v) ? N(v) : v.toFixed(1)) + (/^%/.test(u || '') ? '%' : /^x /.test(u || '') ? 'x' : '');
  const z = D.road[D.road.length - 1]; const ra = D.sev.find(x => x.id === 'ra-cet');
  const recon = {
    'cp-lev-08': z ? `The roadmap lands at ${(z.ebitda_usd / z.revenue_usd * 100).toFixed(1)}% by month 36. This lever's target is the IES benchmark ceiling.` : '',
    'cp-lev-10': ra ? `Top of the ${ra.multiple_expansion_turns.join('–')}-turn evidence range. The value bridge below starts at the 1.0-turn midpoint.` : '',
  };
  $('#lever-grid').innerHTML = pick.map((l, k) => {
    const b = l.baseline, t = l.target; const max = Math.max(b || 0, t || 0) * 1.12 || 1; const down = b != null && t < b;
    const bw = b == null ? 100 : (b / max) * 100, tw = (t / max) * 100;
    const bar = b == null ? `<i class="pb-base is-null"></i><i class="pb-tgt" style="width:${tw}%"></i>` : down ? `<i class="pb-base" style="width:${bw}%"></i><i class="pb-tgt is-down" style="width:${tw}%"></i>` : `<i class="pb-tgt" style="width:${tw}%"></i><i class="pb-base" style="width:${bw}%"></i>`;
    const unit = String(l.unit || '').replace(/^% (of )?/, '').replace(/^x /, '');
    return `<article class="sys-card pb-lever" data-co="cet"><span class="sys-card-label">Lever ${k + 1}</span><h3 class="sys-card-title">${H.esc(l.lever)}</h3>
      <div class="pb-lv-vals"><span class="pb-lv-b">${b == null ? 'Not public' : fmt(b, l.unit)}</span><span aria-hidden="true">→</span><span class="pb-lv-t">${fmt(t, l.unit)}</span>${EST}<span class="pb-lv-u">${H.esc(unit)}</span></div>
      <div class="pb-lv-bar" role="img" aria-label="Baseline ${b == null ? 'not public' : fmt(b, l.unit)}, target ${fmt(t, l.unit)}">${bar}</div>
      <div class="pb-lv-leg">${b == null ? 'Baseline not public: set in the first 30 days' : down ? 'Grey is today; green is the target (lower is better)' : 'Grey is today; colour is the uplift'}</div>
      ${recon[l.id] ? `<p class="sys-note sys-note--info pb-lv-recon"><span>${H.esc(recon[l.id])}</span></p>` : ''}<p class="sys-card-body pb-lv-ev">${H.esc(l.evidence)}</p><p class="sys-src"><b>Source:</b> ${srcA(l.source_url)}</p></article>`;
  }).join('');
  const rest = all.filter(x => !LEVER_ORDER.includes(x.id));
  if (rest.length) $('#lever-more').innerHTML = `<b>Also tracked:</b> ${rest.map(l => `${H.esc(l.lever)} (${H.esc(l.baseline ?? 'not public')} to ${H.esc(l.target)} ${H.esc(String(l.unit || '').replace(/^x /, ''))})`).join('; ')}.`;
}

/* ── agents ─────────────────────────────────────────────────────────────── */
function agents() {
  const ag = D.K('ai_agent');
  const inG = (a, g) => g.rx.test(a.who_it_helps || '');
  $('#ag-seg').innerHTML = AG_GROUPS.map((g, k) => `<button class="sys-chip" type="button" role="tab" aria-selected="${k === 0}" aria-pressed="${k === 0}" data-g="${g.id}">${g.label}<span class="pb-n">${ag.filter(a => inG(a, g)).length}</span></button>`).join('');
  const fmtM = a => a.metric_value == null ? '—' : a.metric_unit && /GBP/.test(a.metric_unit) ? '£' + Math.round(a.metric_value / 1000) + 'K' : /USD/.test(a.metric_unit || '') ? M(a.metric_value) : N(a.metric_value) + (/^%/.test(a.metric_unit || '') ? '%' : /percentage points/.test(a.metric_unit || '') ? ' pts' : '');
  $('#agent-grid').innerHTML = ag.map(a => `<article class="sys-card pb-agent" data-id="${a.id}"><span class="sys-card-label">${H.esc(a.who_it_helps)}</span><h3 class="sys-card-title">${H.esc(a.agent)}</h3><p class="sys-card-body">${H.esc(a.job_to_be_done)}</p>
    ${a.metric_value == null ? '<div class="pb-metric"><span class="sys-chip">Qualitative vendor claim</span></div>' : `<div class="pb-metric"><b class="sys-num">${fmtM(a)}</b><span>${H.esc(String(a.metric_unit || '').replace(/^% /, '').replace(/^USD /, '').replace(/^GBP /, '').replace(/^percentage points /, ''))}</span></div>`}
    <p class="pb-claim">${H.esc(a.metric_claim)}</p>
    <div class="sys-chips pb-meta"><span class="sys-chip sys-chip--soft">${a.weeks_to_deploy ?? '—'} weeks to deploy</span>${(a.vendor_examples || []).slice(0, 2).map(v => `<span class="sys-chip">${H.esc(v)}</span>`).join('')}</div>
    <p class="sys-src">${H.esc(a.cost_model || '')} · ${srcA(a.source_url)}</p></article>`).join('');
  const sorted = ag.slice().sort((a, b) => (a.weeks_to_deploy || 99) - (b.weeks_to_deploy || 99));
  const maxW = Math.max(...ag.map(a => a.weeks_to_deploy || 0), 10);
  const val = D.agp.filter(x => x.company === 'cet').reduce((s, x) => s + (x.est_annual_value_usd || 0), 0);
  const ra = D.sev.find(x => x.id === 'ra-cet');
  $('#runway').innerHTML = `<span class="sys-card-label">Go-live runway (weeks)</span>${sorted.map(a => `<div class="pb-rw-row" data-id="${a.id}"><span>${H.esc(a.agent.replace(/\s*\(.*\)$/, ''))}</span><div class="pb-tr"><i style="width:${((a.weeks_to_deploy || 0) / maxW) * 100}%"></i></div></div>`).join('')}<div class="pb-rw-ax"><span>0</span><span>${maxW} weeks</span></div>
    ${val ? `<p class="pb-ag-total">The portfolio agent model values the GridOS agents at <b>${M(val)}</b>${EST} a year in EBITDA-equivalent after ramp${ra ? `, inside the ${M(ra.ebitda_impact_usd[0])}–${M(ra.ebitda_impact_usd[1])} GridOS range` : ''}.</p>` : ''}`;
  $$('#ag-seg button').forEach(b => b.onclick = () => {
    $$('#ag-seg button').forEach(x => { x.setAttribute('aria-selected', x === b); x.setAttribute('aria-pressed', x === b); }); const g = AG_GROUPS.find(x => x.id === b.dataset.g);
    $$('#agent-grid .pb-agent').forEach(c => { const a = ag.find(x => x.id === c.dataset.id); c.classList.toggle('is-off', !inG(a, g)); });
    $$('#runway .pb-rw-row').forEach(c => { const a = ag.find(x => x.id === c.dataset.id); c.classList.toggle('is-off', !inG(a, g)); });
  });
}

/* ── talent ─────────────────────────────────────────────────────────────── */
function talent() {
  const me = D.pb?.meta?.market_evidence || {}; const el = me.electrician_labor_us || {}, gap = me.construction_worker_gap_2026 || {};
  const cells = [
    ['Electrician openings', N(el.annual_openings), 'A year in the US, BLS 2024–34', el.source_url, 'BLS'],
    ['Job growth', `+${el.growth_2024_34_pct ?? '—'}%`, 'Electricians, 2024–34, BLS', el.source_url, 'BLS'],
    ['Median pay', M(el.median_pay_usd_2024), 'Electricians, 2024, BLS', el.source_url, 'BLS'],
    ['Workers needed', gap.value ? Math.round(gap.value / 1000) + 'K' : '—', 'Net new construction workers in 2026, ABC', gap.source_url, 'ABC'],
  ];
  $('#shortage').innerHTML = cells.map(([l, b, s, u, who]) => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${H.esc(l)}</span><span class="sys-kpi-value">${H.esc(b)}</span><span class="sys-kpi-sub">${H.esc(s)}</span>${u ? `<span class="sys-src">${srcA(u, `${who} source ↗`)}</span>` : ''}</div>`).join('');
  const icons = [
    '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    '<path d="M12 3v4M5 8l3 2M19 8l-3 2M7 21h10l-1-8H8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    '<path d="M12 3v18M17 7H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<path d="M13 3 5 14h6l-1 7 8-11h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    '<circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 010 7M21 20c0-2.6-1.6-4.8-4-5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<path d="M4 12h5l2-5 3 10 2-5h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  ];
  $('#programs').innerHTML = D.K('talent_program').map((t, k) => `<article class="sys-card pb-prog"><span class="pb-ic"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${icons[k % icons.length]}</svg></span>
    <h3 class="sys-card-title">${H.esc(t.program)}</h3><span class="sys-card-label">For ${H.esc(t.who_it_helps)}</span><span class="pb-pm sys-num">${H.esc(t.metric)}</span><p class="sys-card-body">${H.esc(t.evidence)}</p><p class="sys-src"><b>Source:</b> ${srcA(t.source_url)}</p></article>`).join('');
}

/* ── add-ons ────────────────────────────────────────────────────────────── */
function addons() {
  const T = D.tgt.slice().sort((a, b) => b.fit_score - a.fit_score);
  const seg = $('#ad-seg'); const opts = ['All', ...NE];
  seg.innerHTML = opts.map((s, k) => `<button class="sys-chip" type="button" role="tab" aria-selected="${k === 0}" aria-pressed="${k === 0}" data-s="${s}">${s === 'All' ? 'All states' : s}<span class="pb-n">${s === 'All' ? T.length : T.filter(t => t.state === s).length}</span></button>`).join('');
  const draw = s => {
    const list = (s === 'All' ? T : T.filter(t => t.state === s)).slice(0, 8);
    $('#targets').innerHTML = list.map(t => `<article class="sys-card pb-tg"><span class="pb-rk sys-num">${T.indexOf(t) + 1}</span><div class="pb-tg-main"><h3 class="sys-card-title">${H.esc(t.company)}</h3>
      <div class="pb-ln">${H.esc(t.hq_city)}, ${H.esc(t.state)} · about ${H.esc(t.employees ?? '—')} staff · ${M(t.revenue_est_usd)} revenue${EST} (ZoomInfo model) · ${H.esc(OWN[t.ownership] || 'Ownership unknown')} · ${(nn => `${H.esc(nn.mi ?? '—')} miles from ${H.esc(nn.name)}`)(nearestNode(t))}</div>
      <div class="sys-chips pb-sp">${(t.specialties || []).slice(0, 3).map(x => `<span class="sys-chip">${H.esc(x)}</span>`).join('')}</div>${(t.risk_flags || [])[0] ? `<div class="pb-rf">Watch: ${H.esc(t.risk_flags[0])}</div>` : ''}</div>
      <div class="pb-fit"><b class="sys-num">${t.fit_score}</b><small>fit out of 100</small><div class="pb-fb"><i style="width:${t.fit_score}%"></i></div></div></article>`).join('') || '<p class="sys-src">No targets screened in this state yet. That gap is why Phase 2 needs an outreach-led sourcing pass.</p>';
  };
  draw('All');
  $$('button', seg).forEach(b => b.onclick = () => { $$('button', seg).forEach(x => { x.setAttribute('aria-selected', x === b); x.setAttribute('aria-pressed', x === b); }); draw(b.dataset.s); });
  const med = D.pb?.items?.find(x => x.id === 'cp-phase-2')?.data_points?.target_screen_median_revenue_usd;
  $('#ad-sub').innerHTML = `Ranked from the portal’s add-on screen. Fit is scored out of 100 on capability, geography, scale and ownership readiness. Median target: ${M(med)} revenue${EST}, about 71 staff. Revenue figures are ZoomInfo models and still need checking.`;
  const maxC = Math.max(...NE.map(s => T.filter(t => t.state === s).length));
  $('#ad-states').innerHTML = `<h3 class="sys-card-title">Targets by state</h3><div class="pb-bars-h">${NE.map(s => { const n = T.filter(t => t.state === s).length, f = T.filter(t => t.state === s && t.fit_score >= 70).length; return `<div class="pb-bh-r"><b>${s}</b><div class="pb-tr"><i class="is-fit" style="width:${(f / maxC) * 100}%"></i><i style="width:${((n - f) / maxC) * 100}%"></i></div><span>${n}</span></div>`; }).join('')}</div><p class="sys-src"><i class="pb-key is-fit"></i>Fit 70 or more <i class="pb-key"></i>Other. Outside MA, only one target scores 70 or more. <b>Source:</b> CET add-on screen, Sept 2026.</p>`;
  const hd = [['Day 0', 'Retention agreements for named managers. The brand, license holders and 24/7 on-call crews stay in place.'], ['Weeks 1–4', 'Estimating moves onto Accubid and the GridOS bid board. The add-on’s bids start going through go/no-go scoring.'], ['Weeks 4–8', 'Safety, payroll, AP and job costing move onto the shared back office. Apprentices enroll in the MA/CT tax credits.'], ['Month 3', 'Crew scheduling moves onto the shared bench, so labor can be lent across MA, CT and new states.'], ['Months 3–6', 'Cross-sell: CET generators and controls, plus NuWave efficiency work, into the add-on’s accounts.'], ['Month 6+', 'Field practices change last. Measure against the lever baselines.']];
  $('#hundred').innerHTML = `<h3 class="sys-card-title">Day one, the same way every time</h3><ol class="pb-hd">${hd.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ol><p class="sys-src">Back office first and field last, because about 70% of mergers miss their revenue-synergy targets (McKinsey).</p>`;
  const pbc = D.tgtMeta.pe_backed_competitors || []; const sp = D.pe.filter(p => (p.overlap_with_bsp || []).includes('cet'));
  $('#rivals').innerHTML = `<h3 class="sys-card-title">Who else is buying</h3><div class="sys-card-body"><p><b>${pbc.length}</b> New England electrical and energy firms are already sponsor- or strategic-owned, and <b>${sp.length}</b> PE firms compete for CET-type deals (${sp.filter(p => p.threat_level === 'high').length} high threat).</p>
    <ul class="sys-card-list pb-mt">${pbc.slice(0, 4).map(c => `<li><b>${H.esc(c.company)}</b>: ${H.esc(c.owner)}${c.year ? `, ${c.year}` : ''}</li>`).join('')}</ul>
    <p class="pb-mt">High-threat sponsors: ${sp.filter(p => p.threat_level === 'high').map(p => H.esc(p.firm)).join(', ')}.</p></div><p class="sys-src"><b>Source:</b> Private-equity landscape and CET add-on screen, Sept 2026.</p>`;
}

/* ── financing ──────────────────────────────────────────────────────────── */
const FIN_OVERRIDE = {
  'cp-fin-01': { source_of_funds: 'Sponsor equity and co-invest', amount_or_range: 'Co-invest vehicle (Form D, Feb 2025)', evidence: 'Broad Sky has already set up a dedicated CET co-invest vehicle alongside the fund. A Phase 2 add-on wave can reuse that route instead of drawing only on the fund.' },
};
function finance() {
  $('#fin-grid').innerHTML = D.K('financing').map(f => ({ ...f, ...(FIN_OVERRIDE[f.id] || {}) })).map((f, k) => `<article class="sys-card pb-fin" data-co="cet"><span class="sys-card-label">Source of funds ${k + 1}</span><h3 class="sys-card-title">${H.esc(f.source_of_funds)}</h3><div class="pb-amt sys-num">${H.esc(f.amount_or_range)}</div><p class="sys-card-body">${H.esc((() => { const ss = String(f.evidence).split('. '); const two = ss.slice(0, 2).join('. '); return (two.length > 260 ? ss[0] : two).replace(/\.$/, ''); })())}.</p><p class="sys-src"><b>Source:</b> ${srcA(f.source_url)}</p></article>`).join('');
}

function roadmap() {
  const r = D.road; if (!r.length) return;
  if (!roadmap._mq) { roadmap._mq = matchMedia('(max-width:640px)'); roadmap._mq.addEventListener?.('change', () => roadmap()); }
  const narrow = matchMedia('(max-width:640px)').matches; const W = narrow ? 420 : 560, Hh = 270, pl = narrow ? 40 : 46, pr = 14, pt = 22, pb = 54; const maxV = Math.ceil(Math.max(...r.map(x => x.revenue_usd)) / 5e7) * 5e7;
  const y = v => pt + (Hh - pt - pb) * (1 - v / maxV); const bw = narrow ? 44 : 56; const gx = k => pl + (k + .5) * ((W - pl - pr) / r.length);
  const grid = Array.from({ length: maxV / 5e7 + 1 }, (_, k) => k / (maxV / 5e7)).map(f => { const v = maxV * f; return `<line class="pb-grid" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="pb-ax" x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${M(v)}</text>`; }).join('');
  const bars = r.map((x, k) => `<rect class="pb-rev" x="${gx(k) - bw / 2}" y="${y(x.revenue_usd)}" width="${bw}" height="${y(0) - y(x.revenue_usd)}" rx="6" opacity="${.45 + k * .18}"/>
    <rect class="pb-ebitda" x="${gx(k) - bw / 2 + 10}" y="${y(x.ebitda_usd)}" width="${bw - 20}" height="${y(0) - y(x.ebitda_usd)}" rx="4"/>
    <text class="pb-vl" x="${gx(k)}" y="${y(x.revenue_usd) - 7}" text-anchor="middle">${M(x.revenue_usd)}</text>
    <text class="pb-vl2" x="${gx(k) + bw / 2 + 4}" y="${y(x.ebitda_usd) + 4}">${M(x.ebitda_usd)}</text>
    <text class="pb-ax pb-ax--b" x="${gx(k)}" y="${Hh - 36}" text-anchor="middle">Month ${x.month}</text><text class="pb-ax" x="${gx(k)}" y="${Hh - 21}" text-anchor="middle">${N(x.headcount)} people</text><text class="pb-ax" x="${gx(k)}" y="${Hh - 7}" text-anchor="middle">${x.locations_or_accounts} sites</text>`).join('');
  $('#road-chart').innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Revenue and EBITDA by month: ${r.map(x => `month ${x.month} ${M(x.revenue_usd)} revenue, ${M(x.ebitda_usd)} EBITDA`).join('; ')}">${grid}${bars}</svg>
    <p class="sys-src"><i class="pb-key pb-key--rev"></i>Revenue <i class="pb-key pb-key--ebitda"></i>EBITDA, same scale. <b>Source:</b> CET growth plan roadmap, analyst assumptions, Oct 2026.</p>`;
  const n = 'class="sys-n"';
  $('#road-table').innerHTML = `<table class="sys-table pb-tbl"><thead><tr><th>Month</th><th ${n}>Revenue</th><th ${n}>EBITDA</th><th ${n}>Margin</th><th ${n}>People</th><th ${n}>Sites</th><th>Basis</th></tr></thead><tbody>${r.map(x => `<tr><td>${x.month}</td><td ${n}>${M(x.revenue_usd)}</td><td ${n}>${M(x.ebitda_usd)}</td><td ${n}>${(x.ebitda_usd / x.revenue_usd * 100).toFixed(1)}%</td><td ${n}>${N(x.headcount)}</td><td ${n}>${x.locations_or_accounts}</td><td class="pb-note">${H.esc(String(x.note || '').replace(/^ASSUMPTION\.\s*/, ''))}</td></tr>`).join('')}</tbody><caption>All figures are analyst estimates, not company guidance.</caption></table>`;
}

/* Shared deal arithmetic (all est.): organic growth ~8%/yr per the month-12 roadmap note; acquired revenue
   is bought at ~10% EBITDA margin for ~5.5x EBITDA (lower-middle-market electrical, PKF 5–6x band). */
const ORG_G = 0.08, ACQ_MARGIN = 0.10, ACQ_X = 5.5;
function split(rev36, e36) {
  const a = D.road[0]; const orgRev = a.revenue_usd * (1 + ORG_G) ** 3; const acqRev = Math.max(0, rev36 - orgRev);
  const acqE = acqRev * ACQ_MARGIN; return { orgRev, acqRev, acqE, orgE: e36 - a.ebitda_usd - acqE, spend: acqE * ACQ_X };
}
function bridge() {
  const r = D.road; if (!r.length) return; const a = r[0], z = r[r.length - 1];
  const ra = D.sev.find(x => x.id === 'ra-cet');
  const mx = $('#mx'), os = $('#os');
  if (ra?.multiple_expansion_turns) { os.max = String(ra.multiple_expansion_turns[1]); }
  const sp = split(z.revenue_usd, z.ebitda_usd);
  const draw = () => {
    const m = +mx.value, t = +os.value; $('#mx-out').textContent = m.toFixed(1) + 'x'; $('#os-out').textContent = t.toFixed(2).replace(/0$/, '') + (t === 1 ? ' turn' : ' turns');
    const ev0 = a.ebitda_usd * m, go = sp.orgE * m, ga = sp.acqE * m, p = z.ebitda_usd * t, ev1 = ev0 + go + ga + p, net = ev1 - sp.spend;
    const steps = [[['Today'], 0, ev0, 'pb-b0', ''], [['Organic', 'growth'], ev0, go, 'pb-b1', '+'], [['Acquired', 'EBITDA'], ev0 + go, ga, 'pb-b2', '+'], [['Quality', 'premium'], ev0 + go + ga, p, 'pb-b3', '+'], [['Paid for', 'add-ons'], net, sp.spend, 'pb-b4', '−'], [['Month 36,', 'net'], 0, net, 'pb-b5', '']];
    const W = 460, Hh = 250, pl = 6, pt = 24, pb = 42, max = ev1 * 1.08; const y = v => pt + (Hh - pt - pb) * (1 - v / max); const cw = (W - pl * 2) / steps.length, bw = cw * .66;
    $('#bridge').innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Enterprise value bridge: today ${M(ev0)}, plus ${M(go)} organic EBITDA growth, plus ${M(ga)} acquired EBITDA, plus ${M(p)} quality premium, minus ${M(sp.spend)} paid for add-ons, equals ${M(net)} at month 36 net of add-on capital">
      <line class="pb-grid" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
      ${steps.map(([l, b, v, c, sg], k) => { const x = pl + k * cw + (cw - bw) / 2; const top = sg === '−' ? b + v : b + v; const lvl = sg === '−' ? b : b + v; return `<rect class="${c}" x="${x}" y="${y(top)}" width="${bw}" height="${Math.max(1, y(b) - y(b + v))}" rx="5"/>${k < steps.length - 1 ? `<line class="pb-link" x1="${x + bw}" x2="${x + cw}" y1="${y(lvl)}" y2="${y(lvl)}"/>` : ''}<text class="pb-vl" x="${x + bw / 2}" y="${y(top) - 7}" text-anchor="middle">${sg}${M(v)}</text><text class="pb-ax" x="${x + bw / 2}" y="${Hh - 24}" text-anchor="middle">${l[0]}</text>${l[1] ? `<text class="pb-ax" x="${x + bw / 2}" y="${Hh - 9}" text-anchor="middle">${l[1]}</text>` : ''}`; }).join('')}</svg>`;
    $('#bridge-note').innerHTML = `Enterprise value = EBITDA × multiple. Today: ${M(a.ebitda_usd)} × ${m.toFixed(1)}x = ${M(ev0)}. Month 36: ${M(z.ebitda_usd)} × (${m.toFixed(1)}x + ${t.toFixed(2).replace(/0$/, '')} ${t === 1 ? 'turn' : 'turns'}) = <b>${M(ev1)}</b>, or <b>${(ev1 / ev0).toFixed(1)}x today's EV, gross of add-on capital</b>. Not all of that is created: at ~8% organic growth CET reaches ~${M(sp.orgRev)} of revenue on its own, so ~${M(sp.acqRev)} of the ${M(z.revenue_usd)} is bought. That brings ~${M(sp.acqE)} of EBITDA at an est. ${ACQ_X}x, or <b>~${M(sp.spend)} of capital paid for add-ons</b>. Net of that capital, month-36 value is <b>${M(net)}</b>, ${M(net - ev0)} above today. Capstone/IMAP put typical middle-market deals at 6.8x and premium deals at 9.8x. PKF puts project-heavy contractors at 5–6x and repeatable service at 10x+. The GridOS evidence base credits CET with ${ra ? ra.multiple_expansion_turns.join('–') : '0.5–1.5'} turns. All figures are estimates${EST}. <b>Source:</b> CET growth plan roadmap, GridOS evidence base, Capstone and IMAP 2026 survey, PKF summer 2026 update.`;
  };
  mx.oninput = draw; os.oninput = draw; draw();
  if (ra) {
    const tv = ra.multiple_expansion_turns.map(t => t * z.ebitda_usd);
    $('#gridos-case').innerHTML = `<div class="sys-kpi"><span class="sys-kpi-value">${M(ra.investment_usd[0])}–${M(ra.investment_usd[1])}${EST}</span><span class="sys-kpi-sub">GridOS investment · ${ra.time_to_value_months.join('–')} months to value</span></div>
      <div class="sys-kpi"><span class="sys-kpi-value">${M(ra.ebitda_impact_usd[0])}–${M(ra.ebitda_impact_usd[1])}${EST}</span><span class="sys-kpi-sub">EBITDA impact (${ra.ebitda_impact_pct_revenue.join('–')} points of revenue)</span></div>
      <div class="sys-kpi"><span class="sys-kpi-value">${M(tv[0])}–${M(tv[1])}${EST}</span><span class="sys-kpi-sub">Value of ${ra.multiple_expansion_turns.join('–')} turns on month-36 EBITDA</span></div>`;
  }
  returns();
}

/* ── equity returns (PRG view): downside / base / upside ─────────────────── */
function returns() {
  const el = $('#returns-body'); if (!el) return; const r = D.road; const a = r[0], z = r[r.length - 1];
  try { if (/[?&]prg=1\b/.test(location.search) || location.hash === '#returns-card') $('#returns-card').open = true; } catch {}
  const ra = D.sev.find(x => x.id === 'ra-cet'); const [t0, t1] = ra?.multiple_expansion_turns || [0.5, 1.5];
  const EQ0 = 35e6, DEBT_X0 = 4.0, DEBT_SHARE = 0.55, FCF = 0.30, FEES = 0.02, HOLD = 56 / 12, ADD_T = 38 / 12;
  const med = D.items.find(x => x.id === 'cp-phase-2')?.data_points?.target_screen_median_revenue_usd || 15e6;
  const cases = [
    { k: 'Downside', rev: z.revenue_usd - 2 * med, mg: 0.11, mult: 6.8, prem: 0, why: `Two fewer add-ons, 11% margin, 6.8x flat, no premium` },
    { k: 'Base', rev: z.revenue_usd, mg: z.ebitda_usd / z.revenue_usd, mult: 6.8, prem: 1.0, why: `The roadmap: ${M(z.revenue_usd)}, ${(z.ebitda_usd / z.revenue_usd * 100).toFixed(1)}% margin, 6.8x + 1.0 turn` },
    { k: 'Upside', rev: z.revenue_usd, mg: z.ebitda_usd / z.revenue_usd, mult: 6.8, prem: t1, why: `The roadmap, plus the top of the ${t0}–${t1}-turn GridOS range` },
  ].map(c => {
    const e36 = c.rev * c.mg, sp = split(c.rev, e36); const ev = e36 * (c.mult + c.prem);
    const nd = a.ebitda_usd * DEBT_X0 + sp.spend * DEBT_SHARE - FCF * (a.ebitda_usd + e36) / 2 * 3;
    const eqOut = ev * (1 - FEES) - nd, addEq = sp.spend * (1 - DEBT_SHARE), eqIn = EQ0 + addEq;
    const npv = rr => -EQ0 - addEq / (1 + rr) ** ADD_T + eqOut / (1 + rr) ** HOLD;
    let lo = -0.5, hi = 1.5; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; npv(mid) > 0 ? lo = mid : hi = mid; }
    return { ...c, e36, sp, ev, nd, eqOut, eqIn, moic: eqOut / eqIn, irr: lo };
  });
  const row = (l, f, cls = '') => `<tr class="${cls}"><td>${l}</td>${cases.map(c => `<td class="sys-n">${f(c)}</td>`).join('')}</tr>`;
  el.innerHTML = `<div class="sys-table-wrap"><table class="sys-table pb-tbl pb-ret-tbl"><thead><tr><th></th>${cases.map(c => `<th class="sys-n">${c.k}</th>`).join('')}</tr></thead><tbody>
    ${row('Month-36 revenue', c => M(c.rev))}${row('EBITDA (margin)', c => `${M(c.e36)} <small>(${(c.mg * 100).toFixed(1)}%)</small>`)}
    ${row('Exit multiple', c => `${(c.mult + c.prem).toFixed(1)}x`)}${row('Exit EV', c => M(c.ev))}
    ${row('Paid for add-ons', c => M(c.sp.spend))}${row('Net debt at exit', c => `${M(c.nd)} <small>(${(c.nd / c.e36).toFixed(1)}x)</small>`)}
    ${row('Equity value at exit', c => M(c.eqOut), 'is-sum')}${row('Equity in', c => M(c.eqIn))}
    ${row('MOIC', c => `<b>${c.moic.toFixed(1)}x</b>${EST}`, 'is-hl')}${row('IRR', c => `<b>${Math.round(c.irr * 100)}%</b>${EST}`, 'is-hl')}
    </tbody></table></div>
    <ul class="sys-card-list pb-ret-why">${cases.map(c => `<li><b>${c.k}:</b> ${H.esc(c.why)}.</li>`).join('')}</ul>
    <p class="sys-src">All figures are estimates${EST}, deal level, gross of carry. <b>Equity in</b> = ${M(EQ0)} at entry in Feb 2025 (midpoint of an outside $25–45M estimate that includes the co-invest; not disclosed), plus the equity share (${Math.round((1 - DEBT_SHARE) * 100)}%, incl. seller rollover) of add-on spend, assumed paid mid-plan. <b>Add-on spend</b> = acquired EBITDA × ${ACQ_X}x, where acquired revenue = month-36 revenue less ~8%/yr organic growth, at ${ACQ_MARGIN * 100}% margin. <b>Net debt</b> starts at ${DEBT_X0.toFixed(1)}x today's EBITDA (GF Data lower-middle-market average), adds ${Math.round(DEBT_SHARE * 100)}% of add-on spend and pays down ${Math.round(FCF * 100)}% of cumulative EBITDA; every case stays under the 4.5x ceiling. Exit costs ${FEES * 100}% of EV. Exit at month 36 (Oct 2029) is ≈${HOLD.toFixed(1)} years after entry. Horton's seller rollover is not modelled separately.</p>`;
}

/* ── risks & asks ───────────────────────────────────────────────────────── */
function risks() {
  const sp = D.pe.filter(p => (p.overlap_with_bsp || []).includes('cet')); const pbc = (D.tgtMeta.pe_backed_competitors || []).length;
  const ra = D.sev.find(x => x.id === 'ra-cet');
  const second = D.tgt.filter(t => ['RI', 'NH', 'ME', 'VT'].includes(t.state));
  const R = [
    ['h', 'Every baseline is an estimate', 'Revenue, EBITDA, headcount and margin come from PPP payroll, revenue per employee and peer margins (low confidence). CET does not disclose them.', 'Run a 30-day data request and re-base the roadmap and the lever baselines on actuals before the next board meeting.'],
    ['h', 'Licensed electricians are scarce', 'BLS expects ~81,000 electrician openings a year, and ABC says 499K net new construction workers are needed in 2026. Growth stalls if crews can’t be staffed.', 'Two apprenticeship lanes, tax-credit capture, a journeyman fast track and broad-based equity for foremen (section 05).'],
    ['h', 'Horton integration and key people', 'Horton is third-generation and founder-led, and it holds the CT wastewater relationships. McKinsey finds ~70% of mergers miss their revenue-synergy targets.', 'Keep the brand and the 24/7 crews. Sign retention agreements with named managers. Integrate the back office first and the field last.'],
    ['m', 'Sponsors competing for the same targets', `${pbc} New England electrical/energy firms are already sponsor-owned. ${sp.length} PE firms overlap with CET, ${sp.filter(p => p.threat_level === 'high').length} rated high threat. Crete United’s RELCO is ~10 miles from Taunton.`, 'Lead with founder rollover and a partner model where brands stay, plus proprietary owner-succession outreach, not banker auctions.'],
    ['m', 'The second-ring target pool is thin', `${second.length} RI/NH/ME/VT targets are screened and none scores ≥ 70. Maine, NH and VT plants are not yet in the wastewater screen.`, 'Run an outreach-led sourcing pass through NECA and IEC chapters, and extend the wastewater screen to ME, NH and VT SRF lists.'],
    ['m', 'Bonding capacity and public-bid exposure', 'Surety capacity, debt terms and DCAMM certification are not public. SRF project values are applicant estimates, not awards.', 'Arrange surety introductions early. Bid selectively through GridOS go/no-go scoring, and keep public hard-bid work below a set share of backlog.'],
    ['m', 'Union and merit-shop mix', 'CET shows as non-union on OSHA records, and several targets (e.g., McDonald’s ANJ division, Murphy, Averill) are union. That limits which crews can take which public or utility jobs.', 'Run union add-ons as divisions alongside the IEC merit-shop lane. Don’t convert either.'],
    ['l', 'Data-center hype', 'ISO-NE says New England data-center load lags other regions, so data-center electrical is upside, not the core of the plan.', `Price it as an option. ${ra ? `GridOS value is booked only inside the ${ra.multiple_expansion_turns.join('–')}-turn evidence range.` : ''}`],
  ];
  const z = D.road[D.road.length - 1] || {}, m24 = D.road.find(x => x.month === 24) || {};
  const by = $('#beyond'); if (by) by.innerHTML = `<span><b>Beyond this plan, not in the numbers.</b> Any move into NY, NJ or eastern PA would be a separate board decision at month 24, and only if month-24 revenue and margin are at or above plan (${M(m24.revenue_usd)}, ${m24.revenue_usd ? (m24.ebitda_usd / m24.revenue_usd * 100).toFixed(1) : '—'}%). The ${M(z.revenue_usd)} month-36 figure does not depend on it. New York City is out either way.</span>`;
  $('#risk-list').innerHTML = R.map(([s, h, p, m]) => `<li><span class="pb-sev pb-sev--${s}">${s === 'h' ? 'High' : s === 'm' ? 'Medium' : 'Low'}</span><div><b>${H.esc(h)}</b><p>${H.esc(p)}</p><p class="pb-mit"><b>Mitigation:</b> ${H.esc(m)}</p></div></li>`).join('');
  const A = [
    ['A 30-day data request', 'actual revenue, EBITDA, backlog, recurring share, utilization and bid-hit ratio by state, to replace every est. on this page.', 'Nov 2026'],
    [`Approve the GridOS budget (${ra ? `${M(ra.investment_usd[0])}–${M(ra.investment_usd[1])}` : '$0.8–1.8M'})`, 'start with the three fastest agents: 24/7 dispatcher (3 wks), bid-radar triage (4 wks) and contract review (4 wks).', 'Q4 2026'],
    ['Sourcing support', 'owner-succession outreach in RI, NH, ME and VT, introductions to NECA and IEC chapters, and LOIs for two MA tuck-ins from the top of the screen.', 'Phase 1'],
    ['Capital', 'confirm delayed-draw capacity (lower middle market averages ~4.0x total leverage) and line up co-invest for the Phase 2 wave, following the BSP-CET Co-Invest precedent.', 'by month 9'],
    ['Surety and bonding introductions', 'to support public wastewater and SRF-funded bids at a larger size.', 'Q1 2027'],
    ['People design', 'an equity pool for licensed electricians and foremen, plus a plan to claim MA RATC (up to $100K per employer) and the CT apprenticeship credit.', 'Q1 2027'],
  ];
  $('#ask-list').innerHTML = A.map(([h, p, w]) => `<li><b>${H.esc(h)}</b>: ${H.esc(p)} <span class="sys-chip sys-chip--soft pb-when">${H.esc(w)}</span></li>`).join('');
}

/* ── sources ────────────────────────────────────────────────────────────── */
function sources() {
  const m = D.pb?.meta || {}; const urls = [...new Set(D.items.flatMap(i => [i.source_url, ...(i.source_urls || [])]).filter(Boolean))];
  const byHost = {}; urls.forEach(u => { const h = host(u); (byHost[h] = byHost[h] || []).push(u); });
  const method = `Template events come from Broad Sky, Smith + Howard and trade-press releases (Accounting Today, CPA Practice Advisor), checked ${fmtDate(m.generated) || '—'}. Vertical analogs (Pfingsten NEC Group, Ridgemont Crete United, Kohlberg Loenbro, IES Holdings) come from PE Hub, PrivSource and SEC 8-K filings. AI-agent, talent and growth-lever evidence comes from vendor case studies, government sources (BLS, DOL, mass.gov, CT DRS, EPA, NREL, ISO-NE, PJM) and banker and legal commentary (Taft, Capstone/IMAP, PKF, GF Data). Phase figures are computed from the portal's research: the bid radar (${D.opp.length} items), the wastewater screen (${D.wwtp.length} plants), the add-on screen (${D.tgt.length} targets), the county fit model (${D.counties.length} counties), our filings review and the GridOS evidence base. Every revenue, EBITDA, headcount and margin target is an analyst assumption anchored to filings-based estimates.`;
  const caveats = (m.caveats || []).map(c => /NY\/NJ\/PA/.test(c) ? 'Management guidance is a New England focus with no NYC expansion. This plan and every number on this page are New England only. A move into NY, NJ or eastern PA would be a separate board decision and is not modelled.' : String(c).replace(/\b\d{4}-\d{2}-\d{2}\b/g, d => fmtDate(d)));
  $('#src-body').innerHTML = `<p><b>Method.</b> ${H.esc(method)}</p>
    <p><b>Wastewater dollars.</b> The page uses one measure: funded or requested plant and pump-station projects on the CT, MA and RI state lists, at the applicant's total project cost (the first-listed project per plant). The underlying screen also carries a broader "pipeline" total that adds every facility-related line, including collection-system and tributary-town work. It is larger and is not used here. Neither figure is an award or CET's electrical scope.</p>
    <p><b>Caveats</b></p><ul>${caveats.map(c => `<li>${H.esc(c)}</li>`).join('')}</ul>
    <p><b>${urls.length} sources</b> (${Object.keys(byHost).length} domains), retrieved ${H.esc(fmtDate(m.generated) || '—')}:</p><p class="pb-src-links">${Object.entries(byHost).map(([h, us]) => us.map((u, k) => srcA(u, k ? `${h} (${k + 1})` : h)).join(' · ')).join(' · ')}</p>`;
}

/* ── chat ───────────────────────────────────────────────────────────────── */
function chat() {
  const r = D.road, a = r[0] || {}, z = r[r.length - 1] || {}; const ph = D.K('expansion_phase');
  const top = D.tgt.slice().sort((x, y) => y.fit_score - x.fit_score).slice(0, 5);
  const ra = D.sev.find(x => x.id === 'ra-cet');
  const faq = [
    { q: 'What is the value-creation plan for CET?', href: '#map', a: `<p>CET follows Broad Sky’s Smith + Howard template, aiming for about <b>3x revenue in 36 months</b>: ${M(a.revenue_usd)} → ${M(z.revenue_usd)}, with EBITDA ${M(a.ebitda_usd)} → ${M(z.ebitda_usd)} (est.).</p><ul>${ph.map((p, i) => `<li><b>Phase ${i + 1}</b> (mo ${H.esc(p.months)}): ${H.esc(shortPhase(p.phase))}</li>`).join('')}</ul><p>All figures are analyst assumptions anchored to our filings review, and are New England only.</p>` },
    { q: 'Which add-on targets should CET call first?', href: '#addons', a: `<p>Top of the 48-company screen (fit out of 100):</p><ul>${top.map(t => `<li><b>${H.esc(t.company)}</b> (${H.esc(t.hq_city)}, ${t.state}): fit ${t.fit_score}, ~${t.employees ?? '—'} staff, ${H.esc((t.specialties || [])[0] || '')}</li>`).join('')}</ul><p>No target in RI, NH, ME or VT scores ≥ 70 yet, so Phase 2 needs outreach-led sourcing.</p>` },
    { q: 'How does CET earn a higher exit multiple?', href: '#returns', a: `<p>The multiple comes from mix. Moving from one-off hard bids to <b>~25% recurring</b> O&amp;M (SCADA and pump-station monitoring, solar and storage O&amp;M, EV charger management, NuWave efficiency) moves CET toward the premium band. PKF puts project-heavy firms at 5–6x and repeatable service at 10x+. Capstone/IMAP put typical deals at 6.8x and premium deals at 9.8x.</p><p>GridOS (est.): ${ra ? `${M(ra.investment_usd[0])}–${M(ra.investment_usd[1])} investment, ${M(ra.ebitda_impact_usd[0])}–${M(ra.ebitda_impact_usd[1])} EBITDA impact and <b>${ra.multiple_expansion_turns.join('–')} turns</b>` : '0.5–1.5 turns'} of multiple expansion.</p>` },
    { q: 'Will CET expand into New York City?', href: '#risks', a: `<p><b>No.</b> Management guidance is a New England focus with no NYC expansion, and this plan is New England only. Every number on the page, including ${M(z.revenue_usd)} at month 36, comes from the six New England states. Anything beyond would be a separate board decision, not part of this plan.</p>` },
  ];
  const inst = H.Chat.mount(null, { persona: 'cet', short_name: 'CET', mode: 'floating', theme: 'light', faq, suggestions: faq.map(f => f.q) });
  H.frame?.setChat?.(inst);
}
