/* ═══════════════════════════════════════════════════════════════════════════
   CET — Commonwealth Electrical Technologies (Worcester + Taunton MA; NuWave, Norwell MA;
   Horton Electrical Services, CT). New England only — NYC analysis archived (CEO guidance).
   ═══════════════════════════════════════════════════════════════════════════ */
import { renderTargets, renderFilings, opportunityCard, fitTierOf } from '../assets/components.js?v=20260924203049';

const COLOR = 'var(--c-cet)';
const HEX = { cet: '#4c8dff', cyan: '#3fd0e0', amber: '#f5b73d', green: '#2ecc8f', purple: '#9d7bff', blue: '#4c8dff', muted: '#8b98a8', red: '#ff5c5c', orange: '#f08a3c', dim: '#5b6b7f', pink: '#e05c8a', sky: '#8ab4ff' };
const DAY = 864e5;
const NE_BOUNDS = [[41.15, -73.6], [45.2, -69.6]];
const SNE_BOUNDS = [[41.1, -73.75], [42.9, -69.9]];
const NODES = [
  { lat: 42.2626, lon: -71.8023, label: 'CET HQ · Worcester', color: HEX.cet, size: 14 },
  { lat: 41.9001, lon: -71.0898, label: 'CET · Taunton', color: HEX.cet, size: 11 },
  { lat: 42.1615, lon: -70.7928, label: 'NuWave · Norwell', color: HEX.purple, size: 11 },
];
/* Connecticut county centroids (approx.) — the legacy county table has null CT centroids. */
const CT_CENTROIDS = { Fairfield: [41.27, -73.39], Hartford: [41.81, -72.73], Litchfield: [41.79, -73.24], Middlesex: [41.43, -72.52], 'New Haven': [41.41, -72.90], 'New London': [41.47, -72.10], Tolland: [41.86, -72.34], Windham: [41.83, -71.99] };
const STATES = ['MA', 'CT', 'RI', 'NH', 'VT', 'ME'];
const SRC = {
  opp: ['CET opportunity radar (CT DEEP CWF, ME/VT CWSRF, BidNet, USASpending)', 'https://portal.ct.gov/deep/water/municipal-wastewater/clean-water-fund'],
  wwtp: ['EPA ECHO + CT DEEP CWF FY26-27 + MassDEP 2026 CWSRF IUP + RIDEM SFY27 IUP', 'https://echo.epa.gov/'],
  counties: ['CET legacy county model (Census CBP/ACS, permit proxies)', null],
  targets: ['ZoomInfo + company websites + press (ma_targets_cet)', null],
};

/* ── helpers ────────────────────────────────────────────────────────────── */
function ensureCss() { if (!document.getElementById('css-cet')) { const l = document.createElement('link'); l.id = 'css-cet'; l.rel = 'stylesheet'; l.href = 'modules/cet.css?v=20260924203049'; document.head.appendChild(l); } }
const safe = p => Promise.resolve(p).catch(e => { console.warn(e?.message || String(e)); return null; });
const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const median = a => { const v = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const groupBy = (a, f) => { const m = new Map(); for (const x of a) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const mdy = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
const addDays = (iso, n) => { const d = new Date(iso); if (isNaN(d)) return null; d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const actionsList = (items, esc) => `<div class="actions-list">${items.map((a, i) => `<div class="act"><span class="n">${i + 1}</span><div>${a}</div></div>`).join('')}</div>`;
const bold1 = (s, esc) => { const t = String(s || '').replace(/^\s*\d+\.\s*/, ''); const i = t.indexOf(':'); return i > 0 && i < 110 ? `<b>${esc(t.slice(0, i))}</b>${esc(t.slice(i))}` : esc(t); };

function hortonNode(filings) {
  const txt = filings ? JSON.stringify(filings) : '';
  if (/Horton's Canton|97 River Road|Canton HQ/i.test(txt)) return { lat: 41.8243, lon: -72.8937, label: 'Horton · Canton CT', town: 'Canton, CT', basis: 'cet_filings: Canton HQ (97 River Road)' };
  return { lat: 41.6, lon: -72.7, label: 'Horton · Connecticut', town: 'Connecticut', basis: 'state centroid (town not in research)' };
}
function addNodes(ctx, map, horton) {
  const { maps, esc } = ctx;
  for (const n of NODES) maps.marker(map, n.lat, n.lon, { color: n.color, label: n.label, size: n.size, popup: `<b>${esc(n.label)}</b>` });
  if (horton) maps.marker(map, horton.lat, horton.lon, { color: HEX.cyan, label: horton.label, size: 12, popup: `<b>Horton Electrical Services</b><br>${esc(horton.town)} · acquired Sept 15 2026<br><span class="muted">Wastewater / pump-station electrical, solar, generators, civil</span>` });
}

/* capability classes for the radar */
const CAPS = [
  { k: 'wastewater', label: 'Wastewater / pump station', color: HEX.cyan, has: s => s.has('wastewater') || s.has('pump_station') },
  { k: 'solar', label: 'Solar / storage', color: HEX.amber, has: s => s.has('solar') || s.has('storage') },
  { k: 'ev', label: 'EV charging', color: HEX.green, has: s => s.has('ev_charging') },
  { k: 'efficiency', label: 'Energy efficiency', color: HEX.purple, has: s => s.has('energy_efficiency') },
  { k: 'electrical', label: 'Electrical · generator · controls', color: HEX.blue, has: s => s.has('electrical_construction') || s.has('generator') || s.has('controls') || s.has('utility') },
  { k: 'other', label: 'Other / unclassified', color: HEX.muted, has: () => true },
];
const capOf = arr => { const s = new Set(arr || []); return CAPS.find(c => c.has(s)); };
const FIT_MAP = { High: 70, Medium: 55, Low: 35 };
const LEG_TAG = { 'fire-alarm': 'electrical_construction', HVAC: 'energy_efficiency', lighting: 'energy_efficiency', electrical: 'electrical_construction', generator: 'generator', solar: 'solar', MEP: 'electrical_construction' };
const DEV_STAGE = { application: 'planned', permit: 'permitted', press_release: 'awarded', permit_summary: 'aggregate' };
const STAGE_COLOR = { open: HEX.green, planned: HEX.sky, awarded: HEX.muted, recurring: HEX.purple, expired: HEX.red, permitted: HEX.amber, aggregate: HEX.dim };

function gazetteer(opps, wwtp, dev) {
  const g = new Map(); const add = (t, st, lat, lon) => { if (!t || !st || lat == null || lon == null) return; const k = `${String(t).toLowerCase().trim()}|${st}`; if (!g.has(k)) g.set(k, { lat, lon, t: String(t).trim() }); };
  for (const o of opps) if (o.geo_precision === 'city' || o.geo_precision === 'address') add(o.city, o.state, o.lat, o.lon);
  for (const w of wwtp) add(w.town, w.state, w.lat, w.lon);
  for (const d of dev) add(d.city, d.state, d.lat, d.lng);
  return g;
}
function geocodeAgency(agency, state, g) {
  const a = String(agency || '');
  const m = /(?:City|Town) of ([A-Za-z .'-]+)/i.exec(a);
  if (m) { const hit = g.get(`${m[1].trim().toLowerCase()}|${state}`); if (hit) return hit; }
  let best = null; const low = a.toLowerCase();
  for (const [k, v] of g) { const [t, st] = k.split('|'); if (st !== state || t.length < 5) continue; if (new RegExp(`\\b${reEsc(t)}\\b`).test(low) && (!best || t.length > best.t.length)) best = v; }
  return best;
}
function devCaps(r) {
  const t = new Set(r.cet_signal_tags || []); const c = [];
  if (t.has('solar') || t.has('renewable') || /Renewable/.test(r.scope_class || '')) c.push('solar');
  if (t.has('battery_storage')) c.push('storage');
  if (t.has('ev_utility') || /EV/.test(r.scope_class || '')) c.push('ev_charging', 'utility');
  if (!t.has('aggregate')) c.push('electrical_construction');
  return c;
}
/** One list: research opportunities + legacy COMMBUYS RFPs + 90-day development feed. */
function buildRadar(ctx, opp, rfps, dev, wwtp) {
  const { fmt } = ctx; const out = [];
  for (const o of opp?.items || []) out.push({ ...o, _src: 'research', _fitBasis: 'Research fit score (0–100)' });
  const g = gazetteer(opp?.items || [], wwtp?.items || [], dev || []);
  const seen = new Set();
  for (const r of rfps || []) {
    if (seen.has(r.id)) continue; seen.add(r.id);
    const due = mdy(r.due_date); const d = fmt.days(due); const geo = geocodeAgency(r.agency, r.state, g);
    out.push({ id: 'leg-' + r.id, _src: 'legacy', type: 'legacy rfp', title: String(r.title || '').replace(/\s+/g, ' ').trim(), owner_or_agency: r.agency, state: r.state, city: geo ? titleCase(geo.t) : '', county: '', lat: geo?.lat ?? null, lon: geo?.lon ?? null, geo_precision: geo ? 'agency town (inferred)' : 'none', posted_date: null, due_date: due, est_value_usd: r.estimated_value_m ? r.estimated_value_m * 1e6 : null, scope_tags: r.cet_signal_tags || [], capability_match: [...new Set((r.cet_signal_tags || []).map(t => LEG_TAG[t]).filter(Boolean))], fit_score: FIT_MAP[r.cet_fit] ?? null, fit_rationale: r.scope_summary, stage: d != null && d < 0 ? 'expired' : 'open', competitors_noted: [], source_url: r.source_url, source_name: `${r.source_portal || 'COMMBUYS'} (legacy feed)`, retrieved: null, _fitBasis: `Legacy rating "${r.cet_fit}" mapped to ${FIT_MAP[r.cet_fit] ?? '—'}` });
  }
  for (const r of dev || []) out.push({ id: 'dev-' + r.id, _src: 'development', type: 'development', title: r.title, owner_or_agency: r.applicant_or_owner || r.source_name, state: r.state, city: r.city, county: r.county, lat: r.lat, lon: r.lng, geo_precision: r.address ? 'address / zip' : 'city', posted_date: r.filed_date, due_date: null, est_value_usd: r.value_usd || null, scope_tags: [r.scope_class, r.category].filter(Boolean), capability_match: devCaps(r), fit_score: FIT_MAP[r.cet_fit] ?? null, fit_rationale: r.description_short, stage: DEV_STAGE[r.source_type] || 'pipeline', competitors_noted: [], source_url: r.source_url, source_name: r.source_name, retrieved: null, _fitBasis: `Legacy rating "${r.cet_fit}" mapped to ${FIT_MAP[r.cet_fit] ?? '—'}` });
  for (const o of out) { o._cap = capOf(o.capability_match); o._days = fmt.days(o.due_date); }
  return out;
}
const crewFor = o => (o.state === 'CT' || o._cap?.k === 'wastewater') ? 'Horton (Canton CT)' : (o.state === 'RI' || /Bristol|Plymouth|Barnstable|Norfolk/.test(o.county || '')) ? 'Taunton office' : o._cap?.k === 'efficiency' ? 'NuWave (Norwell)' : 'Worcester HQ';
function nextAction(o, fmt) {
  const d = o._days;
  if (o._src === 'development') return o.stage === 'aggregate' ? 'County permit aggregate: use as a demand signal for crew planning; there is no single owner to pursue.' : `Identify the GC and electrical engineer of record from the filing; offer design-assist electrical plus a NuWave efficiency package before trade bids are let. Lead: ${crewFor(o)}.`;
  if (o.stage === 'expired') return 'Past due: request the bid tabulation / award notice for pricing intelligence and put the owner on the rebid calendar.';
  switch (o.type) {
    case 'rfp': case 'legacy rfp': return d != null && d >= 0 ? `Go/no-go by ${fmt.dateShort(addDays(o.due_date, -7))}: pull bid documents, confirm prequalification (DCAMM / MassDOT / CT DAS) and bonding, assign an estimator. Lead: ${crewFor(o)}.` : `Confirm status with the owner; if still open, assign an estimator. Lead: ${crewFor(o)}.`;
    case 'capital_plan': return `Meet the engineer of record while in design to shape electrical / I&C specs; secure preferred-subcontractor status with likely GCs before bid. Lead: ${crewFor(o)}.`;
    case 'award': return 'Contact the awardee / GC for electrical subcontract or O&M scope; if self-performed, log as competitor intelligence.';
    case 'program': return 'Register / qualify as a program vendor or installer; package a repeatable offer and target list against the program criteria.';
    case 'project': return `Contact the owner's project manager; position CET for electrical scope and NuWave for energy scope. Lead: ${crewFor(o)}.`;
    default: return 'Qualify the lead: confirm owner, scope, schedule and procurement route.';
  }
}
function openOpp(ctx, o, extra = {}) {
  const { ui, fmt, esc, inspector } = ctx; const d = o._days;
  const due = o.due_date ? `${fmt.date(o.due_date)} ${d != null ? fmt.chip(d < 0 ? `${-d}d ago` : `in ${d}d`, d < 0 ? 'var(--dim)' : d <= 14 ? 'var(--red)' : d <= 45 ? 'var(--amber)' : 'var(--green)') : ''}` : null;
  inspector.open({
    title: esc(o.title), sub: `${esc(o.owner_or_agency || '')} · ${esc(o.city || '')}${o.state ? ', ' + esc(o.state) : ''}`, color: o._cap?.color || COLOR,
    sections: [
      { label: 'Snapshot', html: ui.kv({ Type: fmt.chip(String(o.type || '').replace(/_/g, ' '), o._cap?.color), Stage: fmt.chip(o.stage || '—', STAGE_COLOR[o.stage]), 'Est. value': o.est_value_usd ? `${fmt.moneyFull(o.est_value_usd)} <span class="dim small">est.</span>` : '<span class="dim">not stated</span>', Posted: o.posted_date ? fmt.date(o.posted_date) : null, Due: due, 'Fit score': fmt.score(o.fit_score), 'Fit basis': esc(o._fitBasis || ''), Capability: esc(o._cap?.label || ''), County: esc(o.county || ''), 'Geo precision': esc(o.geo_precision || '') }) },
      { label: 'Why it fits', html: `<div class="small text-2">${esc(o.fit_rationale || '—')}</div>` },
      (o.scope_tags || []).length ? { label: 'Scope', html: `<div class="row wrap gap-4">${o.scope_tags.map(t => fmt.chip(t)).join('')}</div>` } : null,
      (o.capability_match || []).length ? { label: 'Capability match', html: `<div class="row wrap gap-4">${o.capability_match.map(t => fmt.chip(String(t).replace(/_/g, ' '), o._cap?.color)).join('')}</div>` } : null,
      { label: 'Competitors noted', html: (o.competitors_noted || []).length ? `<div class="row wrap gap-4">${o.competitors_noted.map(t => fmt.chip(t, 'var(--red)')).join('')}</div>` : '<span class="dim small">None noted in source</span>' },
      { label: 'Source', html: `<div class="small">${o.source_url ? fmt.link(o.source_url, o.source_name || o.source_url) : esc(o.source_name || '—')}</div>${o.retrieved ? `<div class="dim small mt-8">Retrieved ${esc(o.retrieved)}</div>` : ''}` },
      { label: 'Next action', html: `<div class="small text-2">${esc(nextAction(o, fmt))}</div>` },
    ].filter(Boolean),
    actions: [o.source_url ? { label: 'Open source ↗', href: o.source_url } : null, ...(extra.actions || [])].filter(Boolean),
  });
}
function indexEntities(ctx, { opp, wwtp, counties }) {
  const { app } = ctx; const items = [];
  for (const o of (opp?.items || []).slice(0, 200)) items.push({ label: o.title, sub: `CET opportunity · ${o.owner_or_agency || ''} · ${o.state}`, href: `#/cet/opportunities?id=${encodeURIComponent(o.id)}`, kind: 'Opportunity', color: HEX.cet });
  for (const w of (wwtp?.items || []).slice(0, 200)) items.push({ label: w.facility_name, sub: `CET/Horton WWTP · ${w.town}, ${w.state}`, href: `#/cet/wastewater?id=${encodeURIComponent(w.id)}`, kind: 'WWTP', color: HEX.cyan });
  for (const c of counties || []) items.push({ label: `${c.county_name} County, ${c.state}`, sub: `CET territory · ${c.cet_fit_tier} · fit ${c.cet_fit_score}`, href: `#/cet/territory?fips=${c.fips}`, kind: 'County', color: HEX.cet });
  app.index(items);
}
/* fit after Leaflet has measured its container (maps.create invalidates at 60ms) */
const fitLater = (map, b, maxZoom = 10) => { try { map.fitBounds(b, { maxZoom }); } catch { } setTimeout(() => { try { if (map._loaded !== false && map.getContainer().isConnected) { map.invalidateSize(); map.fitBounds(b, { maxZoom }); } } catch { } }, 120); };
const wrap = html => `<div class="m-cet">${html}</div>`;

/* ═══ 1. Overview ═══════════════════════════════════════════════════════════ */
async function overview(ctx) {
  ensureCss();
  const { el, ui, fmt, data, maps, charts, esc, app } = ctx;
  const [opp, wwtp, counties, targets, rfps, nyc, firm, filings] = await Promise.all([
    data.research('cet_opportunities'), data.research('cet_wwtp_targets'), safe(data.load('cet_ne_counties')), data.research('ma_targets_cet'),
    safe(data.load('cet_ne_rfps')), safe(data.load('cet_nyc_archive_summary')), data.research('bsp_firm'), data.research('cet_filings')]);
  const items = opp?.items || []; const plants = wwtp?.items || []; const cnt = counties || [];
  const valued = items.filter(o => o.est_value_usd); const totalVal = sum(valued, o => o.est_value_usd);
  const legacyDue = (rfps || []).map(r => ({ title: String(r.title || '').replace(/\s+/g, ' '), owner_or_agency: r.agency, state: r.state, due_date: mdy(r.due_date), _src: 'legacy', id: 'leg-' + r.id }));
  const dueSoon = [...items.filter(o => o.stage !== 'awarded'), ...legacyDue].map(o => ({ ...o, _d: fmt.days(o.due_date) })).filter(o => o._d != null && o._d >= 0 && o._d <= 60).sort((a, b) => a._d - b._d);
  const funded = plants.filter(p => /_funded$/.test(p.project_class)); const fundedPipe = sum(funded, p => p.pipeline_value_usd);
  const t1 = cnt.filter(c => c.cet_fit_tier === 'Tier 1'), t2 = cnt.filter(c => c.cet_fit_tier === 'Tier 2');
  const horton = hortonNode(filings);
  const cetFirm = (firm?.items || []).find(p => /Commonwealth/i.test(p.company || ''));
  const byState = STATES.map(s => ({ s, n: items.filter(o => o.state === s).length, v: sum(items.filter(o => o.state === s), o => o.est_value_usd) }));

  el.innerHTML = wrap(ui.pageHead({
    title: 'Commonwealth Electrical Technologies (CET)',
    sub: opp ? `<b>So what:</b> CET works only in New England and has <b>${fmt.money(totalVal)}</b> of sourced, est. electrical / wastewater / energy pipeline across all six states. ${wwtp ? `Horton turns <b>${funded.length}</b> funded CT–MA–RI plant projects (${fmt.money(fundedPipe)} pipeline) into work CET can prime.` : 'Horton adds CT wastewater and pump-station references (plant-level research pending).'} Priorities: win the <b>${dueSoon.length}</b> bids due in the next 60 days, get in front of the engineers on funded plants, and cross-sell NuWave efficiency and solar into every Horton account.` : 'Electrical, solar, EV and energy-efficiency contractor · Worcester + Taunton MA · NuWave (Norwell MA) · Horton (CT)',
    chips: `${fmt.chip('Licensed in all 6 New England states', COLOR)}${fmt.chip('Platform since Feb 2025', 'var(--c-bsp)')}${fmt.chip('Add-ons: NuWave (Oct 2025) · Horton (Sept 2026)', 'var(--purple)')}${fmt.chip('No NYC expansion (CEO guidance)', 'var(--dim)')}`,
    actions: `<a class="btn" href="#/cet/opportunities">Opportunity radar →</a><a class="btn" href="#/cet/wastewater">Horton cross-sell →</a>`,
  }) +
  (opp ? '' : ui.note('Research dataset <b>cet_opportunities</b> is not available yet — pipeline KPIs are partial.', 'warn')) +
  (wwtp ? '' : ui.note('Research dataset <b>cet_wwtp_targets</b> is not available yet — wastewater KPIs and map layer are omitted.', 'warn')) +
  ui.kpis([
    { label: 'Opportunities tracked', value: fmt.num(items.length), sub: `sourced · ${fmt.num((rfps || []).length)} legacy RFPs + 90-day dev feed on radar`, color: COLOR },
    { label: 'Est. pipeline value', value: fmt.money(totalVal), sub: `est. · ${valued.length} of ${items.length} opportunities valued`, color: HEX.green },
    { label: 'Bids due ≤60 days', value: fmt.num(dueSoon.length), sub: dueSoon[0] ? `next: ${fmt.dateShort(dueSoon[0].due_date)} (${dueSoon[0]._d}d)` : 'none open', color: dueSoon.length ? HEX.amber : HEX.muted },
    { label: 'Funded WWTP accounts', value: wwtp ? fmt.num(funded.length) : '—', sub: wwtp ? `${fmt.money(fundedPipe)} pipeline (est.) · of ${fmt.num(plants.length)} plants` : 'dataset pending', color: HEX.cyan },
    { label: 'Tier-1 counties', value: fmt.num(t1.length), sub: `${esc(t1.map(c => `${c.county_name} ${c.state}`).join(', ') || '—')} · ${t2.length} Tier-2`, color: HEX.cet },
    { label: 'Add-on targets screened', value: fmt.num(targets?.items?.length || 0), sub: targets ? `top: ${esc(targets.meta?.ranked_top_10?.[0]?.company || '—')}` : 'dataset pending', color: 'var(--c-ma)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Operating footprint', sub: 'CET nodes, Horton, county fit tiers and funded wastewater plants (Horton cross-sell anchors)', body: `<div class="map tall" id="cet-ov-map"></div>`, flush: true, foot: `${ui.source('CET / Broad Sky press releases', 'https://comelectrical.com/commonwealth-electrical-technologies-acquires-horton-electrical-services/', 'Sept 2026')} ${ui.source(SRC.wwtp[0], SRC.wwtp[1], wwtp?.meta?.generated)}` })}
    ${ui.panel({ title: 'Top 10 actions', sub: 'From the opportunity research — what the CET team should do next', body: opp?.meta?.top_10_actions?.length ? actionsList(opp.meta.top_10_actions.map(a => bold1(a, esc)), esc) : ui.note('Top actions will populate from cet_opportunities.', 'warn'), scroll: true, accent: true, foot: ui.source(SRC.opp[0], SRC.opp[1], opp?.meta?.generated) })}
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Platform build', sub: 'Broad Sky entry and add-ons', body: `<div id="cet-tl"></div>`, foot: ui.source('Broad Sky / CET press releases', 'https://broadskypartners.com/news/', firm?.meta?.generated) })}
    ${ui.panel({ title: 'Bid slate · next 60 days', sub: `${dueSoon.length} solicitations with a due date · click to open on the radar`, body: dueSoon.length ? `<div class="mini-list" id="cet-due">${dueSoon.slice(0, 9).map((o, i) => `<div class="it" data-i="${i}"><div class="grow"><div class="t ellipsis">${esc(o.title)}</div><div class="s ellipsis">${esc(o.owner_or_agency || '')} · ${esc(o.state || '')}${o._src === 'legacy' ? ' · legacy feed' : ''}</div></div><div class="r">${fmt.chip(`${o._d}d`, o._d <= 14 ? 'var(--red)' : 'var(--amber)')}<div class="dim small mt-8" style="margin-top:3px">${fmt.dateShort(o.due_date)}</div></div></div>`).join('')}</div>${dueSoon.length > 9 ? `<div class="more">+${dueSoon.length - 9} more on the radar</div>` : ''}` : ui.empty('No open bids due in the next 60 days'), scroll: true, foot: ui.source('BidNet / owner portals / COMMBUYS', null, opp?.meta?.generated) })}
    ${ui.panel({ title: 'Sourced pipeline by state', sub: 'Est. value of sourced opportunities (count in label)', body: `${charts.hbar(byState.map(s => ({ label: `${s.s} · ${s.n} opps`, value: s.v, color: s.s === 'CT' ? HEX.cyan : HEX.cet })), { fmt: v => fmt.money(v), labelW: 96 })}<div class="row wrap gap-4 mt-12">${Object.entries(opp?.meta?.coverage_by_stage || {}).map(([k, v]) => fmt.chip(`${k} ${v}`, STAGE_COLOR[k])).join('')}</div><div class="bar-caption">Values are requested / estimated amounts, not bid values; ${items.length - valued.length} opportunities have no stated value.</div>`, foot: ui.source(SRC.opp[0], SRC.opp[1], opp?.meta?.generated) })}
  </div>
  <div class="archived">${fmt.chip('Archived')}<span>NYC pipeline (${fmt.num(nyc?.total || 0)} leads) archived. Per CEO guidance, CET is not expanding into New York City, so NYC is excluded from every view.</span></div>`);

  // timeline
  const ons = cetFirm?.add_ons || [];
  const tl = [
    { date: '2025-02', color: 'var(--c-bsp)', html: `<b>Broad Sky becomes majority investor in CET</b><div class="dim small">Worcester HQ + Taunton office · founded 2008 · ~140 staff (Oct 2025)</div>` },
    ...ons.map(a => ({ date: a.date, color: /Horton/.test(a.name) ? HEX.cyan : HEX.purple, html: `<b>${esc(a.name)}</b> · ${esc(a.hq || '')}${a.source_url ? ` <a class="dim" href="${esc(a.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}<div class="dim small">${esc(String(a.note || '').slice(0, 170))}${String(a.note || '').length > 170 ? '…' : ''}</div>` })),
    { date: 'Next', color: 'var(--c-ma)', html: `<b>Add-on #3</b> · ranked screen of ${fmt.num(targets?.items?.length || 0)} New England targets <a href="#/cet/targets">→</a><div class="dim small">Top: ${esc((targets?.meta?.ranked_top_10 || []).slice(0, 3).map(t => t.company).join(' · ') || '—')}</div>` },
  ];
  if (!ons.length) tl.splice(1, 0, { date: '2025-10-07', color: HEX.purple, html: '<b>NuWave Energy Solutions</b> · Norwell, MA' }, { date: '2026-09-15', color: HEX.cyan, html: `<b>Horton Electrical Services</b> · ${esc(horton.town)}` });
  el.querySelector('#cet-tl').innerHTML = ui.timeline(tl);
  el.querySelectorAll('#cet-due .it').forEach(n => n.onclick = () => { const o = dueSoon[Number(n.dataset.i)]; app.go('cet', 'opportunities', { id: o.id }); });

  // map
  const map = maps.create(el.querySelector('#cet-ov-map'), { center: [42.6, -71.2], zoom: 7 });
  const cpts = cnt.map(c => { const fb = c.centroid_lat == null && c.state === 'CT' ? CT_CENTROIDS[c.county_name] : null; return { ...c, lat: c.centroid_lat ?? fb?.[0], lon: c.centroid_lng ?? fb?.[1], _fb: !!fb }; }).filter(c => c.lat != null);
  const tierHex = t => t === 'Tier 1' ? HEX.green : t === 'Tier 2' ? HEX.cet : '#34465e';
  maps.points(map, cpts, { color: r => tierHex(r.cet_fit_tier), radius: r => r.cet_fit_tier === 'Tier 1' ? 16 : r.cet_fit_tier === 'Tier 2' ? 12 : 4 + Math.sqrt(r.cet_fit_score || 0) * 1.3, cluster: false, opacity: .45, stroke: '#0a0e14', popup: r => `<b>${esc(r.county_name)} County, ${esc(r.state)}</b><br>CET fit ${esc(r.cet_fit_score)} · ${esc(r.cet_fit_tier)} (rank ${esc(r.rank)})<br><span class="muted">${esc((r.fit_drivers || []).join(' · '))}</span>${r._fb ? '<br><span class="muted">Centroid approximated (CT)</span>' : ''}<br><a href="#/cet/territory?fips=${esc(r.fips)}">Open in Territory →</a>` });
  maps.points(map, funded, { color: HEX.cyan, radius: r => Math.min(11, 4 + Math.sqrt(r.design_flow_mgd || 1)), cluster: false, opacity: .9, popup: r => `<b>${esc(r.facility_name)}</b><br>${esc(r.town)}, ${esc(r.state)} · ${fmt.num(r.design_flow_mgd, 1)} MGD<br>${esc(r.recent_or_planned_project || '')}<br>${fmt.money(r.pipeline_value_usd)} pipeline<br><a href="#/cet/wastewater?id=${esc(r.id)}">Open account →</a>` });
  addNodes(ctx, map, horton);
  maps.legend(map, [{ color: HEX.cet, label: 'CET / NuWave node' }, { color: HEX.cyan, label: 'Horton + funded WWTP project' }, { color: HEX.green, label: 'Tier-1 county' }, { color: HEX.cet, label: 'Tier-2 county' }, { color: '#34465e', label: 'Tier-3 county (size = fit)' }], 'Footprint');
  maps.overlay(map, `<b>Licensed in all six New England states</b><div class="row wrap gap-4 mt-8">${STATES.map(s => fmt.chip(s, COLOR)).join('')}</div><div class="dim small mt-8">Horton: ${esc(horton.town)}</div>`);
  fitLater(map, NE_BOUNDS);
  indexEntities(ctx, { opp, wwtp, counties: cnt });
  return () => map.remove();
}

/* ═══ 2. Opportunity radar ══════════════════════════════════════════════════ */
async function opportunities(ctx) {
  ensureCss();
  const { el, ui, fmt, data, maps, esc, params } = ctx;
  const [opp, rfps, dev, wwtp] = await Promise.all([data.research('cet_opportunities'), safe(data.load('cet_ne_rfps')), safe(data.load('cet_ne_development')), data.research('cet_wwtp_targets')]);
  const all = buildRadar(ctx, opp, rfps, dev, wwtp);
  const uniq = f => [...new Set(all.map(f).flat().filter(Boolean))].sort();
  el.innerHTML = `<div class="m-cet split">
    <div class="side">
      <div class="side-head"><div class="grow"><h1>Opportunity radar</h1><div class="sub"><b>So what:</b> one ranked New England list covering ${fmt.num(opp?.items?.length || 0)} sourced opportunities, ${fmt.num((rfps || []).length)} legacy COMMBUYS RFPs and ${fmt.num((dev || []).length)} development filings. Filter to a capability and a due window, then take each card's next action.</div></div><button class="btn sm" id="op-csv">⇩ CSV</button></div>
      ${opp ? '' : ui.note('Research dataset <b>cet_opportunities</b> is not available yet — showing legacy feeds only.', 'warn')}
      <div id="op-kpis"></div><div id="op-f"></div><div id="op-cards"></div>
      <div class="src-line mt-12">Sources: ${esc(SRC.opp[0])} · COMMBUYS legacy feed · Boston/Cambridge permits, USASpending, Census BPS (dev feed) · retrieved ${esc(opp?.meta?.generated || '')}</div>
    </div>
    <div class="mapside"><div class="map fill" id="op-map"></div></div>
  </div>`;
  const map = maps.create(el.querySelector('#op-map'), { center: [42.8, -71.3], zoom: 7 });
  fitLater(map, NE_BOUNDS);
  addNodes(ctx, map, hortonNode(await data.research('cet_filings')));
  maps.legend(map, CAPS.map(c => ({ color: c.color, label: c.label })), 'Primary capability');
  const overlay = maps.overlay(map, '');
  let layer = null, rows = [];
  const rad = o => o.est_value_usd ? Math.min(17, 4 + 2.3 * Math.log10(Math.max(1, o.est_value_usd / 1e5))) : 4;
  const open = o => { openOpp(ctx, o, { actions: [{ id: 'op-zoom', label: 'Zoom map', onClick: () => o.lat != null && map.setView([o.lat, o.lon], 11) }] }); const c = el.querySelector(`#op-cards .card[data-id="${CSS.escape(o.id)}"]`); if (c) { el.querySelectorAll('#op-cards .card').forEach(x => x.classList.toggle('selected', x === c)); c.scrollIntoView({ block: 'nearest' }); } };
  const apply = st => {
    const q = (st.q || '').toLowerCase();
    rows = all.filter(o => (!st.state || o.state === st.state) && (!st.type || o.type === st.type) && (!st.cap || (o.capability_match || []).includes(st.cap)) && (!st.stage || o.stage === st.stage) && (!st.src || o._src === st.src)
      && (!st.due || (o._days != null && o._days >= 0 && o._days <= Number(st.due))) && (!st.hide || (!(o._days != null && o._days < 0 && o.stage !== 'awarded') && o.stage !== 'expired' && (o.stage !== 'aggregate' || st.stage === 'aggregate')))
      && (!q || `${o.title} ${o.owner_or_agency} ${o.city} ${o.county} ${(o.scope_tags || []).join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1) || (b.est_value_usd || 0) - (a.est_value_usd || 0));
    f.setCount(`${rows.length} / ${all.length}`);
    const due30 = rows.filter(o => o._days != null && o._days >= 0 && o._days <= 30).length;
    el.querySelector('#op-kpis').innerHTML = ui.kpis([{ label: 'In view', value: fmt.num(rows.length), color: COLOR }, { label: 'Sourced est. value', value: fmt.money(sum(rows.filter(o => o._src !== 'development'), o => o.est_value_usd)), color: HEX.green }, { label: 'Due ≤30d', value: fmt.num(due30), color: due30 ? HEX.amber : HEX.muted }]);
    const top = rows.slice(0, 120);
    const cards = top.map(o => { const c = opportunityCard(ctx, o, o._cap.color); if (o._src !== 'research') c.chips += fmt.chip(o._src === 'legacy' ? 'legacy rfp' : 'dev feed', 'var(--dim)'); if (o.stage) c.chips += fmt.chip(o.stage, STAGE_COLOR[o.stage]); return c; });
    const box = el.querySelector('#op-cards');
    box.innerHTML = rows.length ? ui.cards(cards) + (rows.length > top.length ? `<div class="more">Showing top ${top.length} of ${fmt.num(rows.length)} by fit — refine filters or export CSV for all.</div>` : '') : ui.empty('No opportunities match these filters');
    ui.bindCards(box, top, o => open(o));
    if (layer) layer.remove();
    layer = maps.points(map, rows, { color: o => o._cap.color, radius: rad, cluster: false, opacity: .8, onClick: open, popup: o => `<b>${esc(o.title)}</b><br>${esc(o.owner_or_agency || '')} · ${esc(o.city || '')}, ${esc(o.state || '')}<br>${o.est_value_usd ? fmt.money(o.est_value_usd) + ' est. · ' : ''}fit ${esc(o.fit_score ?? '—')}` });
    const unm = rows.filter(o => o.lat == null).length; const approx = rows.filter(o => /state|region|statewide/.test(o.geo_precision || '')).length;
    overlay.getContainer().innerHTML = `<b>${fmt.num(rows.length - unm)}</b> mapped · <span class="dim">${fmt.num(unm)} without geocode (list only) · ${fmt.num(approx)} at state/region centroid</span><div class="dim small">Circle size = est. value (log) · click for detail</div>`;
  };
  const f = ui.filters(el.querySelector('#op-f'), [
    { key: 'q', label: 'Search title, owner, town, scope…', type: 'search', value: params.q || '' },
    { key: 'state', label: 'State', options: STATES.filter(s => all.some(o => o.state === s)), value: params.state || '' },
    { key: 'type', label: 'Type', options: uniq(o => o.type).map(t => ({ value: t, label: t.replace(/_/g, ' ') })) },
    { key: 'cap', label: 'Capability', options: uniq(o => o.capability_match || []).map(t => ({ value: t, label: t.replace(/_/g, ' ') })), value: params.cap || '' },
    { key: 'stage', label: 'Stage', options: uniq(o => o.stage) },
    { key: 'due', label: 'Due', options: [{ value: '30', label: '≤30 days' }, { value: '60', label: '≤60 days' }, { value: '90', label: '≤90 days' }], value: params.due || '' },
    { key: 'src', label: 'Source', options: [{ value: 'research', label: 'Sourced research' }, { value: 'legacy', label: 'Legacy RFP feed' }, { value: 'development', label: 'Development feed' }] },
    { key: 'hide', label: 'Hide past-due & county aggregates', type: 'toggle', value: !params.id },
  ], apply);
  apply(f.state);
  el.querySelector('#op-csv').onclick = () => ui.exportCSV(rows.map(o => ({ ...o, capability: o._cap.label, source_dataset: o._src, next_action: nextAction(o, fmt) })), ['id', 'source_dataset', 'type', 'stage', 'title', 'owner_or_agency', 'city', 'county', 'state', 'lat', 'lon', 'posted_date', 'due_date', 'est_value_usd', 'fit_score', 'capability', 'capability_match', 'scope_tags', 'competitors_noted', 'fit_rationale', 'next_action', 'source_name', 'source_url'].map(k => ({ key: k })), 'cet_opportunity_radar');
  if (params.id) { const o = all.find(x => x.id === params.id); if (o) { open(o); if (o.lat != null) setTimeout(() => map.getContainer().isConnected && map.setView([o.lat, o.lon], 10), 200); } }
  indexEntities(ctx, { opp, wwtp });
  return () => map.remove();
}

/* ═══ 3. Wastewater accounts (Horton cross-sell) ════════════════════════════ */
const CLASS = {
  plant_funded: { label: 'Plant · funded', color: HEX.green }, ps_funded: { label: 'Pump station · funded', color: '#7be3b5' },
  plant_requested: { label: 'Plant · requested', color: HEX.amber }, ps_requested: { label: 'Pump station · requested', color: HEX.orange },
  planning: { label: 'Planning', color: HEX.purple }, collection: { label: 'Collection system', color: HEX.sky }, none: { label: 'No listed project', color: '#465569' },
};
const CROSS = {
  solar: ['Solar', HEX.amber, 'Behind-the-meter PV on plant land, roofs or covered tanks to offset aeration and pumping load; CET/NuWave design-build with state incentive programs.'],
  storage: ['Storage', HEX.purple, 'Battery storage for demand-charge reduction and resiliency, stacked with utility demand-response programs.'],
  generator: ['Generator', HEX.orange, 'Standby generator / ATS replacement at the plant and pump stations (Horton core), plus a 24/7 service agreement.'],
  efficiency: ['Efficiency', HEX.green, 'NuWave energy audit: aeration blowers and VFDs, lighting and HVAC; utility-incentive funded (Mass Save / Energize CT / RI Energy).'],
  ev: ['EV', HEX.sky, 'Municipal fleet / DPW-yard EV charging installed alongside the plant electrical work.'],
};
const permitColor = s => s === 'Expired' ? 'var(--red)' : s === 'Admin Continued' ? 'var(--amber)' : 'var(--dim)';
function plantNext(p) {
  switch (p.project_class) {
    case 'plant_funded': case 'ps_funded': return 'Funded: meet the engineer of record and the GC shortlist this month; submit Horton E&I qualifications and propose a NuWave efficiency add-alternate.';
    case 'plant_requested': case 'ps_requested': return 'Requested, not yet funded: brief the utility director on electrical scope and resiliency; help them justify the funding application (generators, SCADA, aeration efficiency).';
    case 'planning': return 'Planning stage: offer an electrical condition assessment and energy baseline so CET/Horton shape the upgrade spec.';
    case 'collection': return 'Collection-system work: target the pump-station electrical and generator packages inside the program.';
    default: return p.npdes_permit_status_echo && p.npdes_permit_status_echo !== 'Effective' ? 'No listed project, but the permit is expired or admin-continued, so an upgrade is likely. Book an intro and an energy audit ahead of the permit renewal.' : 'Not yet an active project: offer a service agreement (generators, O&M) and a NuWave energy audit to build the relationship.';
  }
}
function openPlant(ctx, p, map) {
  const { ui, fmt, esc, inspector } = ctx; const cl = CLASS[p.project_class] || CLASS.none;
  inspector.open({
    title: esc(p.facility_name), sub: `${esc(p.town)}, ${esc(p.state)} · ${esc(p.operator || '')}`, color: cl.color,
    sections: [
      { label: 'Horton fit', html: `<div class="row gap-12"><div class="kpi grow" style="--kc:${cl.color}"><div class="label">Horton fit</div><div class="value">${esc(p.horton_fit ?? '—')}</div><div class="sub">${esc(cl.label)}</div></div><div class="kpi grow" style="--kc:${HEX.cyan}"><div class="label">Design flow</div><div class="value">${fmt.num(p.design_flow_mgd, 1)}<small>MGD</small></div><div class="sub">${esc(p.design_flow_source || 'n/a')}</div></div></div>` },
      { label: 'Facility', html: ui.kv({ Address: esc([p.street, p.town, p.state].filter(Boolean).join(', ')), County: esc(p.county || ''), Operator: esc(p.operator || ''), 'NPDES permit': `${esc(p.permit_id || '—')} ${p.npdes_permit_status_echo ? fmt.chip(p.npdes_permit_status_echo, permitColor(p.npdes_permit_status_echo)) : ''}`, 'Permit expires': esc(p.npdes_permit_expiration || ''), 'Funding program': esc(p.funding_program || ''), Stage: esc(p.project_stage || ''), 'Pipeline (all listed)': p.pipeline_value_usd ? `${fmt.moneyFull(p.pipeline_value_usd)} <span class="dim small">est.</span>` : null }) },
      { label: `Projects (${(p.projects || []).length})`, html: (p.projects || []).length ? `<div class="m-cet"><div class="mini-list">${p.projects.map(x => `<div class="it" style="cursor:default"><div class="grow"><div class="t" style="white-space:normal">${esc(x.title)}</div><div class="s">${esc(x.stage || '')}${x.funding_program ? ' · ' + esc(x.funding_program) : ''}${x.note ? ' · ' + esc(x.note) : ''}</div>${x.source_url ? `<div class="small">${fmt.link(x.source_url, 'source')}</div>` : ''}</div><div class="r">${fmt.money(x.value_usd)}</div></div>`).join('')}</div></div>` : '<span class="dim small">No project on the current CT / MA / RI SRF lists</span>' },
      p.energy_signal ? { label: 'Energy signal', html: `<div class="small text-2">${esc(p.energy_signal)}</div>` } : null,
      { label: 'Cross-sell recommendations', html: (p.cross_sell || []).length ? `<div class="col gap-8">${p.cross_sell.map(k => { const c = CROSS[k] || [k, HEX.muted, '']; return `<div>${fmt.chip(c[0], c[1])} <span class="small text-2">${esc(c[2])}</span></div>`; }).join('')}</div>` : '<span class="dim small">—</span>' },
      { label: 'Next action', html: `<div class="small text-2">${esc(plantNext(p))}</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small">${(p.source_urls || [p.source_url]).filter(Boolean).map(u => fmt.link(u, fmt.host(u) || u)).join('')}</div><div class="dim small mt-8">${esc(p.source_name || '')} · retrieved ${esc(p.retrieved || '')}</div>` },
    ].filter(Boolean),
    actions: [p.source_url ? { label: 'Open source ↗', href: p.source_url } : null, map ? { id: 'ww-zoom', label: 'Zoom map', onClick: () => map.setView([p.lat, p.lon], 12) } : null].filter(Boolean),
  });
}
async function wastewater(ctx) {
  ensureCss();
  const { el, ui, fmt, data, maps, charts, esc, params } = ctx;
  const [wwtp, filings] = await Promise.all([data.research('cet_wwtp_targets'), data.research('cet_filings')]);
  if (!wwtp) { el.innerHTML = wrap(ui.pageHead({ title: 'Wastewater accounts', sub: 'Horton cross-sell engine' }) + ui.note('Research dataset <b>cet_wwtp_targets</b> is not available yet.', 'warn')); return; }
  const P = wwtp.items || []; const m = wwtp.meta || {};
  const funded = P.filter(p => /_funded$/.test(p.project_class)); const withProj = P.filter(p => p.project_class && p.project_class !== 'none');
  const fundedPipe = sum(funded, p => p.pipeline_value_usd), allPipe = sum(P, p => p.pipeline_value_usd);
  const permitSig = P.filter(p => p.npdes_permit_status_echo === 'Expired' || p.npdes_permit_status_echo === 'Admin Continued');
  const mgd = sum(P, p => p.design_flow_mgd); const hi = P.filter(p => (p.horton_fit || 0) >= 80);
  const solarAdd = withProj.filter(p => (p.cross_sell || []).includes('solar'));
  const genPS = withProj.filter(p => /^ps_/.test(p.project_class) || (p.cross_sell || []).includes('generator'));
  const permitNoProj = permitSig.filter(p => p.project_class === 'none');
  el.innerHTML = wrap(ui.pageHead({
    title: 'Wastewater accounts: Horton cross-sell engine',
    sub: `<b>So what:</b> ${fmt.num(P.length)} CT–MA–RI treatment plants treat ${fmt.num(mgd, 0)} MGD. ${fmt.num(funded.length)} have <b>funded</b> projects (${fmt.money(fundedPipe)} pipeline), and ${fmt.num(withProj.length)} have any listed project. Horton's plant references win the electrical and I&C scope; NuWave and CET then sell efficiency, solar and generators into the same account.`,
    chips: `${Object.entries(m.counts_by_state || {}).map(([k, v]) => fmt.chip(`${k} ${v}`, COLOR)).join('')}${fmt.chip('Horton fit 0–98 heuristic', 'var(--dim)')}`,
    actions: `<button class="btn" id="ww-csv">⇩ Account list CSV</button>`,
  }) +
  ui.kpis([
    { label: 'Facilities', value: fmt.num(P.length), sub: `${fmt.num(hi.length)} with Horton fit ≥80`, color: HEX.cyan },
    { label: 'Total design flow', value: fmt.num(mgd, 0), small: 'MGD', sub: `${fmt.num(P.filter(p => p.design_flow_mgd != null).length)} plants with flow data`, color: HEX.cet },
    { label: 'Funded pipeline', value: fmt.money(fundedPipe), sub: `${funded.length} plants · ${fmt.money(allPipe)} incl. requested/planning (est.)`, color: HEX.green },
    { label: 'Plants with listed projects', value: fmt.num(withProj.length), sub: `${fmt.num(P.length - withProj.length)} without — relationship plays`, color: HEX.amber },
    { label: 'Permit upgrade signal', value: fmt.num(permitSig.length), sub: 'NPDES expired / admin-continued', color: HEX.red },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Account map', sub: 'Circle size = design flow (MGD) · colour = project class · click a plant', body: `<div class="map tall" id="ww-map"></div>`, flush: true, foot: ui.source(SRC.wwtp[0], SRC.wwtp[1], m.generated) })}
    ${ui.panel({ title: 'Priority top 15', sub: 'Ranked by Horton fit, with the research rationale', body: `<div class="mini-list" id="ww-top">${(m.priority_top_15 || []).map(t => `<div class="it" data-id="${esc(t.id)}"><span class="rk">#${esc(t.rank)}</span><div class="grow"><div class="t">${esc(t.facility_name)} <span class="dim small">${esc(t.state)}</span></div><div class="s" style="white-space:normal">${esc(t.rationale)}</div></div><div class="r">${fmt.score(t.horton_fit)}</div></div>`).join('') || ui.empty('Priority list pending')}</div>`, scroll: true, accent: true, foot: ui.source('cet_wwtp_targets · meta.priority_top_15', null, m.generated) })}
  </div>
  <div class="mt-12" id="ww-f"></div><div id="ww-table"></div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Pipeline by project class', sub: 'Sum of listed facility pipeline (est.)', body: charts.hbar(Object.entries(CLASS).filter(([k]) => k !== 'none').map(([k, c]) => ({ label: `${c.label} · ${P.filter(p => p.project_class === k).length}`, value: sum(P.filter(p => p.project_class === k), p => p.pipeline_value_usd), color: c.color })), { fmt: v => fmt.money(v), labelW: 170 }), foot: ui.source('State SRF / CWF lists', null, m.generated) })}
    ${ui.panel({ title: 'Cross-sell demand', sub: 'Plants with a listed project, by recommended add-on', body: charts.hbar(Object.entries(CROSS).map(([k, c]) => ({ label: c[0], value: withProj.filter(p => (p.cross_sell || []).includes(k)).length, color: c[1] })), { fmt: v => fmt.num(v), labelW: 90 }) + `<div class="bar-caption">Rule-based: solar if ≥1 MGD without large on-site renewables; storage if ≥10 MGD or has renewables/cogen; generator for pump stations and resiliency work.</div>`, foot: ui.source('cet_wwtp_targets method', null, m.generated) })}
    ${ui.panel({ title: 'NPDES permit status', sub: 'An expired or admin-continued permit often means an upgrade is coming', body: charts.donut(['Effective', 'Admin Continued', 'Expired'].map(s => ({ label: s, value: P.filter(p => p.npdes_permit_status_echo === s).length, color: s === 'Expired' ? HEX.red : s === 'Admin Continued' ? HEX.amber : '#465569' })), { fmt: v => fmt.num(v) }) + `<div class="bar-caption">ECHO status mostly reflects EPA / state permitting backlog, not plant condition. Treat it as a timing signal only.</div>`, foot: ui.source('EPA ECHO CWA REST', 'https://echo.epa.gov/', m.generated) })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Action list', sub: 'Horton cross-sell plan', accent: true, body: actionsList([
    `<b>Prime the funded plants.</b> Book engineer-of-record and GC meetings on the ${funded.length} funded plants (${fmt.money(fundedPipe)}). Start with ${esc(funded.slice().sort((a, b) => (b.horton_fit || 0) - (a.horton_fit || 0)).slice(0, 3).map(p => `${p.facility_name} (${p.state})`).join(', '))}.`,
    `<b>Solar and efficiency bundle.</b> ${solarAdd.length} plants with active projects qualify for behind-the-meter solar. Pair each with a NuWave aeration/VFD audit, since aeration is the largest energy load.`,
    `<b>Generator and pump-station book.</b> ${genPS.length} project accounts need generator/ATS or pump-station electrical work. Quote one crew plan and offer 24/7 service agreements for recurring revenue.`,
    `<b>Permit-renewal watchlist.</b> ${permitNoProj.length} plants have expired or admin-continued permits but no listed project. Open the relationship now, before their upgrade reaches the SRF lists.`,
    `<b>Fill the MA gap.</b> The MA IUP is itemized here, but ${fmt.num(P.filter(p => p.state === 'MA' && p.project_class === 'none').length)} MA plants have no listed project. Work them out of Worcester/Taunton with service and audit offers.`,
  ], esc), foot: `<span class="dim">${esc((m.caveats || []).slice(0, 2).join(' '))}</span>` })}</div>`);

  const map = maps.create(el.querySelector('#ww-map'), { center: [41.9, -71.8], zoom: 8 });
  let layer = null, rows = P, tbl;
  const draw = rs => { if (layer) layer.remove(); layer = maps.points(map, rs.slice().sort((a, b) => (b.design_flow_mgd || 0) - (a.design_flow_mgd || 0)), { color: p => (CLASS[p.project_class] || CLASS.none).color, radius: p => p.design_flow_mgd ? Math.min(22, 3.5 + Math.sqrt(p.design_flow_mgd) * 2.2) : 3.5, cluster: false, opacity: .8, onClick: p => { openPlant(ctx, p, map); tbl?.select(p.id); }, popup: p => `<b>${esc(p.facility_name)}</b><br>${esc(p.town)}, ${esc(p.state)} · ${fmt.num(p.design_flow_mgd, 1)} MGD<br>${esc(p.recent_or_planned_project || 'No listed project')}<br>Horton fit ${esc(p.horton_fit)}` }); };
  addNodes(ctx, map, hortonNode(filings));
  maps.legend(map, Object.values(CLASS).map(c => ({ color: c.color, label: c.label })), 'Project class');
  fitLater(map, SNE_BOUNDS);
  const columns = [
    { key: 'horton_fit', label: 'Fit', num: true, width: '90px', fmt: v => fmt.score(v) },
    { key: 'facility_name', label: 'Facility', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(r.operator || '')}</div>` },
    { key: 'town', label: 'Town', fmt: (v, r) => `${esc(v)}, ${esc(r.state)}` },
    { key: 'design_flow_mgd', label: 'MGD', num: true, fmt: v => fmt.num(v, 1) },
    { key: 'recent_or_planned_project', label: 'Project', title: r => r.recent_or_planned_project || '', fmt: v => `<span class="small text-2 ellipsis" style="display:inline-block;max-width:260px;vertical-align:middle">${esc(v || '—')}</span>` },
    { key: 'project_value_usd', label: 'Value', num: true, fmt: v => fmt.money(v) },
    { key: 'pipeline_value_usd', label: 'Pipeline', num: true, fmt: v => fmt.money(v) },
    { key: 'project_class', label: 'Stage', fmt: v => fmt.chip((CLASS[v] || CLASS.none).label, (CLASS[v] || CLASS.none).color) },
    { key: 'npdes_permit_status_echo', label: 'Permit', fmt: v => v ? fmt.chip(v, permitColor(v)) : '—' },
    { key: 'cross_sell', label: 'Cross-sell', fmt: v => `<span class="cs">${(v || []).map(k => fmt.chip((CROSS[k] || [k])[0], (CROSS[k] || [0, HEX.muted])[1])).join('')}</span>` },
  ];
  const apply = st => {
    const q = (st.q || '').toLowerCase();
    rows = P.filter(p => (!st.state || p.state === st.state) && (!st.cls || p.project_class === st.cls) && (!st.cs || (p.cross_sell || []).includes(st.cs)) && (!st.permit || p.npdes_permit_status_echo === st.permit) && (!st.proj || p.project_class !== 'none') && (!q || `${p.facility_name} ${p.town} ${p.county} ${p.operator} ${p.recent_or_planned_project}`.toLowerCase().includes(q)));
    f.setCount(`${rows.length} / ${P.length}`);
    tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#ww-table'), { columns, rows, pageSize: 25, sortKey: 'horton_fit', exportName: 'cet_wwtp_accounts', onRow: p => { openPlant(ctx, p, map); map.setView([p.lat, p.lon], 11); } }));
    draw(rows);
  };
  const f = ui.filters(el.querySelector('#ww-f'), [
    { key: 'q', label: 'Search facility, town, operator, project…', type: 'search' },
    { key: 'state', label: 'State', options: ['CT', 'MA', 'RI'] },
    { key: 'cls', label: 'Project class', options: Object.entries(CLASS).map(([k, c]) => ({ value: k, label: c.label })) },
    { key: 'cs', label: 'Cross-sell', options: Object.entries(CROSS).map(([k, c]) => ({ value: k, label: c[0] })) },
    { key: 'permit', label: 'Permit', options: ['Effective', 'Admin Continued', 'Expired'] },
    { key: 'proj', label: 'With projects only', type: 'toggle', value: false },
  ], apply);
  apply(f.state);
  el.querySelectorAll('#ww-top .it').forEach(n => n.onclick = () => { const p = P.find(x => x.id === n.dataset.id); if (p) { openPlant(ctx, p, map); map.setView([p.lat, p.lon], 11); } });
  el.querySelector('#ww-csv').onclick = () => ui.exportCSV(rows.map(p => ({ ...p, projects_count: (p.projects || []).length, next_action: plantNext(p) })), ['id', 'horton_fit', 'facility_name', 'town', 'county', 'state', 'operator', 'design_flow_mgd', 'permit_id', 'npdes_permit_status_echo', 'npdes_permit_expiration', 'recent_or_planned_project', 'project_value_usd', 'pipeline_value_usd', 'project_class', 'project_stage', 'funding_program', 'cross_sell', 'energy_signal', 'next_action', 'street', 'lat', 'lon', 'source_url'].map(k => ({ key: k })), 'cet_horton_accounts');
  if (params.id) { const p = P.find(x => x.id === params.id); if (p) { openPlant(ctx, p, map); setTimeout(() => map.getContainer().isConnected && map.setView([p.lat, p.lon], 11), 200); } }
  indexEntities(ctx, { wwtp });
  return () => map.remove();
}

/* ═══ 4. Territory fit ══════════════════════════════════════════════════════ */
async function territory(ctx) {
  ensureCss();
  const { el, ui, fmt, data, maps, charts, esc, params, inspector } = ctx;
  const [counties, opp, wwtp, filings] = await Promise.all([safe(data.load('cet_ne_counties')), data.research('cet_opportunities'), data.research('cet_wwtp_targets'), data.research('cet_filings')]);
  if (!counties) { el.innerHTML = wrap(ui.pageHead({ title: 'Territory fit' }) + ui.note('County table <b>cet_ne_counties</b> is not available.', 'warn')); return; }
  const key = (c, s) => `${String(c || '').toLowerCase()}|${s}`;
  const oppBy = groupBy(opp?.items || [], o => key(o.county, o.state)); const ww = groupBy(wwtp?.items || [], w => key(w.county, w.state));
  const C = counties.map(c => { const fb = c.centroid_lat == null && c.state === 'CT' ? CT_CENTROIDS[c.county_name] : null; const os = oppBy.get(key(c.county_name, c.state)) || []; const ws = ww.get(key(c.county_name, c.state)) || []; return { ...c, lat: c.centroid_lat ?? fb?.[0] ?? null, lon: c.centroid_lng ?? fb?.[1] ?? null, _fb: !!fb, _gap: !c.total_establishments, _opps: os.length, _oppVal: sum(os, o => o.est_value_usd), _wwtp: ws.length, _wwPipe: sum(ws, w => w.pipeline_value_usd), _wwFunded: ws.filter(w => /_funded$/.test(w.project_class)).length, _oppList: os, _wwList: ws }; });
  const t1 = C.filter(c => c.cet_fit_tier === 'Tier 1'), t2 = C.filter(c => c.cet_fit_tier === 'Tier 2'); const gaps = C.filter(c => c._gap);
  const byState = STATES.map(s => { const cs = C.filter(c => c.state === s); return { label: s, value: cs.length ? sum(cs, c => c.cet_fit_score) / cs.length : 0, max: Math.max(0, ...cs.map(c => c.cet_fit_score || 0)), n: cs.length }; });
  const understated = C.filter(c => c._gap && (c._wwPipe > 0 || c._opps > 0)).sort((a, b) => b._wwPipe - a._wwPipe);
  const tierHex = t => t === 'Tier 1' ? HEX.green : t === 'Tier 2' ? HEX.cet : HEX.amber;
  el.innerHTML = wrap(ui.pageHead({
    title: 'Territory fit: 67 New England counties',
    sub: `<b>So what:</b> demand is concentrated in eastern MA. ${esc(t1.map(c => c.county_name + ' ' + c.state).join(', '))} is the only Tier-1 county, and ${esc(t2.map(c => c.county_name).join(', '))} are Tier 2, all within about an hour of Worcester or Taunton. The legacy model has no establishment data for ${gaps.length} counties (all of CT), so it understates Horton's CT home market; the ${fmt.money(sum(understated, c => c._wwPipe))} of CT wastewater pipeline shows the real demand.`,
    chips: `${fmt.chip(`${t1.length} Tier 1`, 'var(--green)')}${fmt.chip(`${t2.length} Tier 2`, 'var(--accent)')}${fmt.chip(`${C.length - t1.length - t2.length} Tier 3`, 'var(--amber)')}${fmt.chip(`${gaps.length} with data gaps`, 'var(--red)')}`,
  }) +
  ui.kpis([
    { label: 'Counties scored', value: fmt.num(C.length), sub: '6 states · New England only', color: COLOR },
    { label: 'Tier-1 / Tier-2', value: `${t1.length} / ${t2.length}`, sub: esc([...t1, ...t2].map(c => c.county_name).join(' · ')), color: HEX.green },
    { label: 'Top fit score', value: fmt.num(Math.max(...C.map(c => c.cet_fit_score || 0)), 1), sub: esc(`${C.slice().sort((a, b) => b.cet_fit_score - a.cet_fit_score)[0]?.county_name || ''} (index, 0–100)`), color: HEX.cet },
    { label: 'Establishments (scored)', value: fmt.compact(sum(C, c => c.total_establishments)), sub: `${fmt.compact(sum(C, c => c.construction_establishments))} construction`, color: HEX.purple },
    { label: 'Counties w/ sourced opps', value: fmt.num(C.filter(c => c._opps).length), sub: `${fmt.num(C.filter(c => c._wwtp).length)} with WWTP accounts`, color: HEX.cyan },
    { label: 'Data gaps', value: fmt.num(gaps.length), sub: 'CT: no CBP / permit inputs in legacy pull', color: HEX.red },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'County fit map', sub: 'Colour = tier · size = establishments · CT centroids approximated', body: `<div class="map tall" id="tr-map"></div>`, flush: true, foot: ui.source(SRC.counties[0], null, 'legacy 2026') })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Average fit by state', sub: 'Mean county fit index (bar) · max in label', body: charts.bar(byState.map(s => ({ label: `${s.label} (${fmt.num(s.max, 0)})`, value: s.value, color: s.label === 'CT' ? HEX.cyan : HEX.cet })), { h: 170, fmt: v => fmt.num(v, 0) }), foot: ui.source(SRC.counties[0]) })}
      ${ui.panel({ title: 'How the score works', body: ui.note(`<b>CET fit index (0–100, legacy model).</b> Counties are scored on commercial establishment density, healthcare and manufacturing establishment counts, 90-day commercial permit volume and value, a data-center proxy score and an EV-infrastructure score, then indexed to the top county (Middlesex MA ≈ 98.5). Tiers: Tier 1 ≥ 60, Tier 2 50–60, Tier 3 below 50. Weights were not documented in the legacy tool, so treat scores as relative. <b>CT counties have zero establishment and permit inputs</b> (a data gap, not a lack of demand) and score on the DC/EV proxies only. Read them together with the WWTP and opportunity columns.`, 'warn') + `<div class="legend-inline"><span><i style="background:${HEX.green}"></i>Tier 1</span><span><i style="background:${HEX.cet}"></i>Tier 2</span><span><i style="background:${HEX.amber}"></i>Tier 3</span></div>` })}
    </div>
  </div>
  <div class="mt-12" id="tr-f"></div><div id="tr-table"></div>
  <div class="mt-12">${ui.panel({ title: 'Action list', sub: 'Where to add crews, sellers and add-ons', accent: true, body: actionsList([
    `<b>Defend and deepen ${esc(t1[0]?.county_name || 'Middlesex')} ${esc(t1[0]?.state || 'MA')}.</b> It is the highest-fit county (${esc(fmt.num(t1[0]?.cet_fit_score, 1))}), with ${fmt.num(t1[0]?.commercial_permits_90d_proxy)} commercial permits and $${fmt.num(t1[0]?.permit_total_value_90d_m, 1)}M of permitted value in 90 days. Assign a dedicated estimator for lab, healthcare and data-center electrical work.`,
    `<b>Tier-2 ring (${esc(t2.map(c => c.county_name).join(', '))}).</b> All are within an hour of Worcester or Taunton. Staff them from existing offices before opening any new branch.`,
    `<b>Re-score Connecticut.</b> Load CBP establishment and permit data for the ${gaps.length} CT counties. ${esc(understated.slice(0, 3).map(c => `${c.county_name} (${fmt.money(c._wwPipe)} WWTP pipeline)`).join(', '))} are underweighted even though they are Horton's home market.`,
    `<b>Northern New England through programs, not branches.</b> ME, NH and VT are Tier 3 (rural). Work them through CWSRF-funded pump stations and NEVI / efficiency programs and mobilize crews per project.`,
  ], esc) })}</div>`);

  const map = maps.create(el.querySelector('#tr-map'), { center: [43.2, -71.0], zoom: 7 });
  maps.points(map, C.filter(c => c.lat != null), { color: c => tierHex(c.cet_fit_tier), radius: c => Math.max(5, Math.min(22, 4 + Math.sqrt(c.total_establishments || 0) / 10)), cluster: false, opacity: .6, onClick: c => openCounty(c), popup: c => `<b>${esc(c.county_name)} County, ${esc(c.state)}</b><br>Fit ${esc(c.cet_fit_score)} · ${esc(c.cet_fit_tier)} · rank ${esc(c.rank)}<br>${fmt.num(c.total_establishments)} establishments${c._fb ? '<br><span class="muted">Centroid approximated</span>' : ''}` });
  addNodes(ctx, map, hortonNode(filings));
  maps.legend(map, [{ color: HEX.green, label: 'Tier 1' }, { color: HEX.cet, label: 'Tier 2' }, { color: HEX.amber, label: 'Tier 3' }], 'CET fit tier');
  fitLater(map, NE_BOUNDS);
  function openCounty(c) {
    inspector.open({ title: `${esc(c.county_name)} County, ${esc(c.state)}`, sub: `CET fit ${esc(c.cet_fit_score)} · ${esc(c.cet_fit_tier)} · rank ${esc(c.rank)} of ${C.length}`, color: tierHex(c.cet_fit_tier), sections: [
      { label: 'Fit inputs', html: ui.kv({ Population: fmt.num(c.population), Households: fmt.num(c.households), 'Median HH income': c.median_household_income ? fmt.moneyFull(c.median_household_income) : null, Establishments: fmt.num(c.total_establishments), Construction: fmt.num(c.construction_establishments), Manufacturing: fmt.num(c.manufacturing_establishments), Healthcare: fmt.num(c.healthcare_establishments), 'Commercial permits (90d)': fmt.num(c.commercial_permits_90d_proxy), 'Permit value (90d)': `$${fmt.num(c.permit_total_value_90d_m, 1)}M`, 'Data-center proxy': fmt.num(c.data_center_proxy_score), 'EV infrastructure': fmt.num(c.ev_infrastructure_score), FIPS: esc(c.fips) }) + (c._gap ? ui.note('Legacy pull has no establishment/permit inputs for this county — score understated.', 'warn') : '') },
      { label: 'Fit drivers', html: `<div class="row wrap gap-4">${(c.fit_drivers || []).map(d => fmt.chip(d, COLOR)).join('')}</div>${c.notes ? `<div class="small text-2 mt-8">${esc(c.notes)}</div>` : ''}` },
      { label: `Sourced opportunities (${c._opps})`, html: c._opps ? `<div class="m-cet"><div class="mini-list">${c._oppList.slice(0, 6).map(o => `<a class="it" href="#/cet/opportunities?id=${encodeURIComponent(o.id)}" style="color:inherit;text-decoration:none"><div class="grow"><div class="t ellipsis">${esc(o.title)}</div><div class="s">${esc(o.type)} · ${esc(o.stage)}</div></div><div class="r">${fmt.money(o.est_value_usd)}</div></a>`).join('')}</div></div>` : '<span class="dim small">None in current research</span>' },
      { label: `WWTP accounts (${c._wwtp})`, html: c._wwtp ? `<div class="small text-2">${fmt.num(c._wwFunded)} funded · ${fmt.money(c._wwPipe)} pipeline (est.)</div><div class="m-cet"><div class="mini-list">${c._wwList.slice().sort((a, b) => (b.horton_fit || 0) - (a.horton_fit || 0)).slice(0, 5).map(w => `<a class="it" href="#/cet/wastewater?id=${encodeURIComponent(w.id)}" style="color:inherit;text-decoration:none"><div class="grow"><div class="t ellipsis">${esc(w.facility_name)}</div><div class="s">${esc(w.town)} · ${fmt.num(w.design_flow_mgd, 1)} MGD</div></div><div class="r">${esc(w.horton_fit)}</div></a>`).join('')}</div></div>` : '<span class="dim small">No WWTP accounts (CT/MA/RI only)</span>' },
      { label: 'Next action', html: `<div class="small text-2">${esc(c.cet_fit_tier === 'Tier 1' ? 'Dedicated estimator + key-account seller; target lab, healthcare and data-center electrical packages; track permits weekly.' : c.cet_fit_tier === 'Tier 2' ? 'Cover from the nearest CET office; build a GC relationship list and bid every electrical package over $250k.' : c._gap && c._wwPipe ? 'Horton-led: work funded WWTP and pump-station projects first; re-score the county once CBP data is loaded.' : 'Program-led coverage: pursue SRF-funded municipal and NEVI / efficiency program work; mobilize crews per project.')}</div>` },
      { label: 'Source', html: `<div class="small dim">${esc(SRC.counties[0])}; opportunity & WWTP joins by county name.</div>` },
    ], actions: [{ id: 'tr-zoom', label: 'Zoom map', onClick: () => c.lat != null && map.setView([c.lat, c.lon], 9) }] });
  }
  const columns = [
    { key: 'rank', label: '#', num: true, width: '44px' },
    { key: 'county_name', label: 'County', fmt: (v, r) => `<b>${esc(v)}</b>, ${esc(r.state)}${r._gap ? ' ' + fmt.chip('data gap', 'var(--red)') : ''}` },
    { key: 'cet_fit_score', label: 'Fit', num: true, fmt: v => fmt.score(v) },
    { key: 'cet_fit_tier', label: 'Tier', fmt: v => fmt.tier(v) },
    { key: 'total_establishments', label: 'Estab.', num: true, fmt: v => fmt.num(v) },
    { key: 'construction_establishments', label: 'Constr.', num: true, fmt: v => fmt.num(v) },
    { key: 'manufacturing_establishments', label: 'Mfg', num: true, fmt: v => fmt.num(v) },
    { key: 'healthcare_establishments', label: 'Health', num: true, fmt: v => fmt.num(v) },
    { key: 'commercial_permits_90d_proxy', label: 'Permits 90d', num: true, fmt: v => fmt.num(v) },
    { key: 'permit_total_value_90d_m', label: '$M 90d', num: true, fmt: v => fmt.num(v, 1) },
    { key: '_opps', label: 'Opps', num: true, fmt: v => v ? fmt.num(v) : '<span class="dim">—</span>' },
    { key: '_wwPipe', label: 'WWTP pipe.', num: true, fmt: v => v ? fmt.money(v) : '<span class="dim">—</span>' },
    { key: 'fit_drivers', label: 'Fit drivers', wrap: true, fmt: v => `<span class="cs">${(v || []).slice(0, 3).map(d => fmt.chip(d)).join('')}</span>` },
  ];
  let tbl;
  const apply = st => { const q = (st.q || '').toLowerCase(); const rows = C.filter(c => (!st.state || c.state === st.state) && (!st.tier || c.cet_fit_tier === st.tier) && (!q || `${c.county_name} ${c.notes} ${(c.fit_drivers || []).join(' ')}`.toLowerCase().includes(q))); f.setCount(`${rows.length} / ${C.length}`); tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#tr-table'), { columns, rows, pageSize: 25, sortKey: 'cet_fit_score', exportName: 'cet_county_fit', onRow: c => { openCounty(c); if (c.lat != null) map.setView([c.lat, c.lon], 9); } })); };
  const f = ui.filters(el.querySelector('#tr-f'), [{ key: 'q', label: 'Search county, driver…', type: 'search' }, { key: 'state', label: 'State', options: STATES }, { key: 'tier', label: 'Tier', options: ['Tier 1', 'Tier 2', 'Tier 3'] }], apply);
  apply(f.state);
  if (params.fips) { const c = C.find(x => x.fips === params.fips); if (c) { openCounty(c); if (c.lat != null) setTimeout(() => map.getContainer().isConnected && map.setView([c.lat, c.lon], 9), 200); } }
  indexEntities(ctx, { counties });
  return () => map.remove();
}

/* ═══ 5. Property transfers (new owner = retrofit trigger) + home sales ═════ */
const SEG_OF = { commercial: 'ci', industrial: 'ci', mixed: 'ci', residential: 'res', land: 'land', other: 'other' };
const SEGS = [{ value: 'ci', label: 'Commercial & industrial' }, { value: 'res', label: 'Home sales' }, { value: 'land', label: 'Land' }, { value: 'all', label: 'All transfers' }];
const USE_HEX = { commercial: HEX.cet, industrial: HEX.purple, mixed: HEX.cyan, residential: HEX.amber, land: HEX.green, other: HEX.muted };
const ENTITY_RE = /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|CO|COMPANY|TRUST|TRUSTEE|TR|LP|LLP|LTD|REALTY|PROPERTIES|PROPERTY|HOLDINGS|PARTNERS|ASSOC|ASSOCIATES|BANK|DEVELOPMENT|GROUP|FUND|VENTURES|ENTERPRISES|CITY|TOWN|AUTHORITY|UNIVERSITY|CHURCH)\b/i;
let _xfer = null;
async function loadTransfers(data) {
  if (_xfer) return _xfer;
  // transfer files carry the non-residential rows; the home-sale (residential) rows live in separate cet_home_sales_* files
  const [ma, ct, hma, hct] = await Promise.all([safe(data.load('sales/cet_transfers_ma')), safe(data.load('sales/cet_transfers_ct_ri')), safe(data.load('sales/cet_home_sales_ma')), safe(data.load('sales/cet_home_sales_ct_ri'))]);
  const sets = [ma, ct, hma, hct].filter(s => s && Array.isArray(s.items));
  const rows = [];
  for (const s of sets) for (const r of s.items) { const t = Date.parse(r.sale_date); if (isNaN(t)) continue; r._t = t; r._seg = SEG_OF[r.use_type] || 'other'; r._entity = ENTITY_RE.test(r.buyer || ''); rows.push(r); }
  rows.sort((a, b) => b._t - a._t);
  const out = { ma, ct, hma, hct, rows, loaded: [ma, ct].filter(s => s && Array.isArray(s.items)).length };
  if (sets.length) _xfer = out;
  return out;
}
function offerFor(r) {
  const old = r.year_built && r.year_built < 1990;
  if (r._seg === 'res') return 'Residential: EV charger + panel/service upgrade or rooftop solar lead (market signal; not CET core).';
  if (r.use_type === 'industrial') return `Power-quality study, MCC/VFD and switchgear upgrades, standby generator${old ? '; pre-1990 building: full electrical assessment' : ''}.`;
  if (r.use_type === 'land') return 'Vacant land: pre-construction outreach for site electrical, utility service and EV make-ready.';
  return `LED lighting + controls retrofit (utility-incentive funded), EV charging, rooftop solar${old ? '; pre-1990 building: service/panel upgrade' : ''}.`;
}
function openTransfer(ctx, r, map) {
  const { ui, fmt, esc, inspector } = ctx;
  inspector.open({
    title: esc(titleCase(r.addr || 'Unknown address')), sub: `${esc(r.muni || '')}, ${esc(r.state)} · ${esc(r.county || '')} County · ${esc(r.use_type)}`, color: USE_HEX[r.use_type] || HEX.muted,
    sections: [
      { label: 'Transfer', html: ui.kv({ 'Sale date': fmt.date(r.sale_date), Price: fmt.moneyFull(r.price), 'Buyer (owner of record)': `${esc(r.buyer || '—')}${r._entity ? ' ' + fmt.chip('entity', COLOR) : ''}`, Seller: r.seller ? esc(r.seller) : '<span class="dim">not published in source</span>', Use: `${esc(r.use_type)}${r.use_desc ? ' · ' + esc(r.use_desc) : ''}`, 'Use code': esc(r.use_code_raw || ''), 'Year built': r.year_built ? esc(r.year_built) : null, 'Sq ft': r.sqft ? fmt.num(r.sqft) : null, Beds: r.beds ? esc(r.beds) : null, 'Deed ref': esc(r.deed_ref || ''), 'Geo precision': esc(r.geo_precision || '') }) },
      { label: 'Why it matters', html: `<div class="small text-2">${r._seg === 'res' ? 'Home sale in a CET-served county. A new homeowner signals residential EV-charger, panel-upgrade and solar demand, and home-sales volume is a leading indicator for local construction work.' : 'A new owner typically sets a capital plan in the first 6–12 months: lighting and controls retrofits, service upgrades, EV charging and solar. Reaching the owner before the incumbent electrician does is the retrofit trigger.'}</div>` },
      { label: 'Suggested offer', html: `<div class="small text-2">${esc(offerFor(r))}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${r._seg === 'res' ? 'Aggregate into the county demand view; no individual outreach from CET.' : `Resolve the buyer entity (Secretary of State registry) to a facilities or asset manager, then send the CET/NuWave new-owner letter within 30 days of recording. Lead: ${r.state === 'CT' ? 'Horton (Canton CT)' : /Bristol|Plymouth|Norfolk/.test(r.county || '') || r.state === 'RI' ? 'Taunton office / NuWave' : 'Worcester HQ'}.`}</div>` },
      { label: 'Source', html: `<div class="small">${r.source_url ? fmt.link(r.source_url, `${r.source} record`) : esc(r.source || '')}</div><div class="dim small mt-8">Assessor / recorder data · retrieved ${esc(r.retrieved || '')}</div>` },
    ],
    actions: [r.source_url ? { label: 'Open record ↗', href: r.source_url } : null, map && r.lat != null ? { id: 'tx-zoom', label: 'Zoom map', onClick: () => map.setView([r.lat, r.lon], 15) } : null].filter(Boolean),
  });
}
async function transfers(ctx) {
  ensureCss();
  const { el, ui, fmt, data, maps, charts, esc, params } = ctx;
  el.innerHTML = wrap(ui.pageHead({ title: 'Property transfers: new owner = retrofit trigger', sub: 'Loading commercial, industrial and residential transfers for CET-served counties in MA, CT and RI…' }) + ui.loading('Loading MassGIS / CT OPM / CT CAMA / RI parcel transfers…'));
  const X = await loadTransfers(data);
  if (!el.isConnected) return;
  if (!X.rows.length) { el.innerHTML = wrap(ui.pageHead({ title: 'Property transfers', sub: 'Commercial / industrial property transfers and home sales in CET counties' }) + ui.note('Property-transfer datasets <b>sales/cet_transfers_ma</b> and <b>sales/cet_transfers_ct_ri</b> are not available yet.', 'warn')); return; }
  const R = X.rows;
  const metas = [X.ma?.meta, X.ct?.meta, X.hma?.meta, X.hct?.meta].filter(Boolean);
  const coverage = metas.flatMap(m => (m.coverage || []).map(c => ({ ...c, _ds: m.dataset, source: /home_sales/.test(m.dataset || '') ? `Home sales · ${c.source || ''}` : c.source })));
  const counties = [...new Set(R.map(r => `${r.county}|${r.state}`))].sort().map(k => { const [c, s] = k.split('|'); return { value: k, label: `${c}, ${s}` }; });
  // home sales by county (user-requested): all residential arm's-length sales in the files
  const resAll = R.filter(r => r._seg === 'res' && (r.price || 0) > 1000);
  let homeByCounty = [...groupBy(resAll, r => `${r.county}|${r.state}`)].map(([k, rs]) => { const [county, state] = k.split('|'); const ts = rs.map(r => r._t); return { id: k, county, state, n: rs.length, median: median(rs.map(r => r.price)), vol: sum(rs, r => r.price), from: new Date(Math.min(...ts)).toISOString().slice(0, 10), to: new Date(Math.max(...ts)).toISOString().slice(0, 10), munis: new Set(rs.map(r => r.muni)).size, basis: 'records' }; }).sort((a, b) => b.n - a.n);
  // Fallback: residential rows may be stripped from the published (compacted) files — use per-county counts from dataset metadata.
  const homeFromMeta = !resAll.length;
  if (homeFromMeta) {
    homeByCounty = [];
    for (const c of X.ma?.meta?.coverage || []) if (c.count_by_use_type?.residential) homeByCounty.push({ id: `${c.county}|${c.state}`, county: c.county, state: c.state, n: c.count_by_use_type.residential, median: null, vol: null, munis: c.munis_with_records ?? null, from: X.ma.meta.segments?.residential_window?.slice(0, 10) || c.date_from, to: c.date_to, basis: 'reported' });
    const ctRes = X.ct?.meta?.counts_by_use_type?.residential;
    if (ctRes) {
      // CT/RI meta has no per-county residential split: allocate the reported residential total by each county's share of the
      // rows removed from the published file (residential + land < $500K). Labelled as an estimate; the column sums to the reported total.
      const cov = X.ct.meta.coverage || []; const kept = groupBy(X.ct.items || [], r => `${r.county}|${r.state}`);
      const byC = [...groupBy(cov, c => `${c.county}|${c.state}`)].map(([k, cs]) => { const [county, state] = k.split('|'); return { k, county, state, removed: Math.max(0, sum(cs, c => c.count) - (kept.get(k) || []).length), from: cs.map(c => c.date_from).filter(Boolean).sort()[0], to: cs.map(c => c.date_to).filter(Boolean).sort().pop() }; });
      const totRem = sum(byC, c => c.removed);
      if (totRem > 0) {
        const raw = byC.map(c => ({ ...c, x: c.removed / totRem * ctRes })); raw.forEach(c => { c.n = Math.floor(c.x); });
        let left = ctRes - sum(raw, c => c.n); raw.slice().sort((a, b) => (b.x - b.n) - (a.x - a.n)).forEach(c => { if (left > 0) { c.n++; left--; } });
        for (const c of raw) homeByCounty.push({ id: c.k, county: c.county, state: c.state, n: c.n, median: null, vol: null, munis: null, from: c.from, to: c.to, basis: 'est. (allocated)' });
      } else homeByCounty.push({ id: 'CT/RI', county: 'CT + RI (all covered counties)', state: 'CT/RI', n: ctRes, median: null, vol: null, munis: null, from: cov.map(c => c.date_from).sort()[0], to: cov.map(c => c.date_to).sort().pop(), basis: 'reported (CT+RI total)' });
    }
    homeByCounty.sort((a, b) => b.n - a.n);
  }
  const homeTotal = homeFromMeta ? sum(homeByCounty, h => h.n) : resAll.length;
  const homeEst = homeByCounty.some(h => /^est\./.test(h.basis || ''));
  let seg = params.seg || 'ci', town = null, rollBy = 'n', filtered = [], layer = null, tbl, ttbl;
  el.innerHTML = wrap(ui.pageHead({
    title: 'Property transfers: new owner = retrofit trigger',
    sub: `<b>So what:</b> every commercial or industrial sale in CET's MA, CT and RI counties brings a new owner who will set a capital plan, the best moment to sell lighting and controls retrofits, service upgrades, EV charging and solar. This view ranks ${fmt.num(R.filter(r => r._seg === 'ci').length)} C&I transfers into an outreach list. Per your request it also covers <b>${fmt.num(homeTotal)} home sales</b> in the same counties, summarized by county below${homeFromMeta ? ' (counts from dataset metadata; residential rows are not in the published files)' : ''}.`,
    chips: `${fmt.chip(`${fmt.num(R.length)} recorded transfers`, COLOR)}${fmt.chip(`${fmt.num(new Set(R.map(r => r.county + r.state)).size)} counties`, 'var(--accent)')}${fmt.chip('MA · CT · RI', 'var(--dim)')}${X.loaded < 2 ? fmt.chip('one dataset missing', 'var(--red)') : ''}`,
    actions: `<button class="btn primary" id="tx-out">⇩ New-owner outreach list</button>`,
  }) +
  `<div class="seg-row"><div id="tx-seg"></div><span id="tx-town"></span></div>
  <div id="tx-f"></div>
  <div id="tx-kpis"></div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Transfer map', sub: 'Most recent 5,000 in filter · colour = use type · clusters below zoom 9', body: `<div class="map tall" id="tx-map"></div>`, flush: true, foot: `${ui.source('MassGIS L3 parcels', 'https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0', X.ma?.meta?.generated?.slice(0, 10))} ${ui.source('CT OPM sales + CT CAMA; RI town parcels', 'https://data.ct.gov/resource/5mzw-sjtu.json', X.ct?.meta?.generated)}` })}
    ${ui.panel({ title: 'Town rollup · top 25', sub: 'Click a town to focus map and table', actions: `<div id="tx-roll-seg"></div>`, body: `<div id="tx-roll"></div>`, flush: true, scroll: true })}
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Home sales by county', sub: homeFromMeta ? 'Residential sale counts for every county covered for CET, from the dataset metadata' : 'Residential sales over $1K in every county covered for CET (all months in the files)', body: `${homeFromMeta ? `<div style="padding:10px 12px 0">${ui.note(`Residential rows are not in the published transfer files (compacted for page size), so this table shows the <b>record counts the source pull reported</b>.${homeEst ? ' MA counts are exact per county; CT/RI counties are <b>est.</b>: the CT/RI residential total is allocated by each county&#39;s share of the rows removed from the file (residential + land under $500K).' : ''} Medians and $ volume need the full residential extract.`, 'warn')}</div>` : ''}<div id="tx-home"></div>`, flush: true, foot: ui.source('MassGIS L3 (last sale), CT OPM / CAMA, Cranston RI parcels · sales/cet_home_sales_ma, cet_home_sales_ct_ri', null, X.hct?.meta?.generated || X.hma?.meta?.generated || '2026-09-24') })}
    ${ui.panel({ title: 'Monthly volume in filter', sub: 'Transfers per month over the Months-back window (latest months still being recorded)', body: `<div id="tx-month"></div><div class="bar-caption">The source windows differ: MA non-residential from Sept 2024, MA residential from Sept 2025, CT OPM through Sept 2025 then CT CAMA (last sale only). Month-to-month steps reflect those windows, not the market.</div>` })}
  </div>
  <h3 class="mt-16 mb-8">Transfers in filter · click a row for the retrofit play</h3><div id="tx-table"></div>
  <div class="mt-12">${ui.panel({ title: 'Coverage & caveats', sub: 'Per-county source windows, plus what could not be pulled', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>County</th><th>Source</th><th class="num">From</th><th class="num">To</th><th class="num">Records</th></tr></thead><tbody>${coverage.map(c => `<tr><td>${esc(c.county)}, ${esc(c.state)}</td><td class="wrap small">${esc(c.source || '')}</td><td class="num">${esc(c.date_from || '')}</td><td class="num">${esc(c.date_to || '')}</td><td class="num">${fmt.num(c.count)}</td></tr>`).join('')}</tbody></table></div><ul class="prose small mt-12">${metas.flatMap(m => (m.caveats || []).slice(0, 3)).map(c => `<li>${esc(c)}</li>`).join('')}</ul><div class="small dim mt-8">Not pulled: ${esc(metas.flatMap(m => (m.failed_sources || []).map(f => f.source)).join(' · ') || '—')}</div>` })}</div>`);

  const segOpts = homeFromMeta ? SEGS.filter(x => x.value !== 'res') : SEGS; if (!segOpts.some(x => x.value === seg)) seg = 'ci';
  UI_seg(ctx, el.querySelector('#tx-seg'), segOpts, seg, v => { seg = v; apply(f.state); });
  UI_seg(ctx, el.querySelector('#tx-roll-seg'), [{ value: 'n', label: 'by count' }, { value: 'vol', label: 'by $' }], rollBy, v => { rollBy = v; renderRoll(); });
  const map = maps.create(el.querySelector('#tx-map'), { center: [42.0, -72.0], zoom: 8 });
  addNodes(ctx, map, { lat: 41.8243, lon: -72.8937, label: 'Horton · Canton CT', town: 'Canton, CT' });
  maps.legend(map, Object.entries(USE_HEX).map(([k, c]) => ({ color: c, label: k === 'residential' ? 'residential (home sale)' : k })), 'Use type');
  fitLater(map, [[41.0, -73.73], [42.75, -70.6]]);

  const homeCols = [
    { key: 'county', label: 'County', fmt: (v, r) => `<b>${esc(v)}</b>, ${esc(r.state)}` },
    { key: 'n', label: 'Home sales', num: true, fmt: v => fmt.num(v) },
    ...(homeFromMeta ? [] : [{ key: 'median', label: 'Median', num: true, fmt: v => fmt.money(v) }, { key: 'vol', label: '$ volume', num: true, fmt: v => fmt.money(v) }]),
    { key: 'munis', label: 'Towns', num: true, fmt: v => fmt.num(v) },
    { key: 'from', label: 'Window', fmt: (v, r) => `<span class="num small">${esc(v || '')} → ${esc(r.to || '')}</span>` },
    ...(homeFromMeta ? [{ key: 'basis', label: 'Basis', fmt: v => `<span class="dim small">${esc(v)}</span>` }] : []),
  ];
  ui.table(el.querySelector('#tx-home'), { columns: homeCols, rows: homeByCounty, pageSize: 12, sortKey: 'n', exportName: 'cet_home_sales_by_county', onRow: r => { if (homeFromMeta) return; const k = `${r.county}|${r.state}`; seg = 'res'; el.querySelectorAll('#tx-seg button').forEach(b => b.classList.toggle('active', b.dataset.v === 'res')); const s = el.querySelector('#tx-f select[data-k="county"]'); if (s) s.value = k; f.state.county = k; apply(f.state); } });

  const cols = [
    { key: 'sale_date', label: 'Date', num: true, fmt: v => fmt.date(v) },
    { key: 'addr', label: 'Address', fmt: (v, r) => `<b>${esc(titleCase(v || '—'))}</b><div class="dim small">${esc(r.muni || '')}</div>` },
    { key: 'county', label: 'County', fmt: (v, r) => `${esc(v)}, ${esc(r.state)}` },
    { key: 'use_type', label: 'Use', fmt: (v, r) => `${fmt.chip(v, USE_HEX[v])}<div class="dim small ellipsis" style="max-width:180px">${esc(r.use_desc || r.use_code_raw || '')}</div>` },
    { key: 'price', label: 'Price', num: true, fmt: v => fmt.money(v) },
    { key: 'buyer', label: 'Buyer (owner of record)', fmt: (v, r) => `<span class="ellipsis" style="display:inline-block;max-width:240px;vertical-align:middle">${esc(v || '—')}</span>${r._entity ? ' ' + fmt.chip('entity', COLOR) : ''}` },
    { key: 'year_built', label: 'Built', num: true, fmt: v => v ? esc(v) : '—' },
    { key: 'sqft', label: 'Sq ft', num: true, fmt: v => fmt.num(v) },
  ];
  const cutoff = m => m ? Date.now() - Number(m) * 30.44 * DAY : 0;
  function apply(st) {
    const cut = cutoff(st.months), minP = Number(st.minp || 0), q = (st.q || '').toLowerCase();
    const base = r => (!st.state || r.state === st.state) && (!st.county || `${r.county}|${r.state}` === st.county) && r._t >= cut && (r.price || 0) >= minP && (!town || (r.muni === town.muni && r.state === town.state));
    filtered = R.filter(r => base(r) && (seg === 'all' || r._seg === seg) && (!st.use || r.use_type === st.use) && (!st.ent || r._entity) && (!q || `${r.addr} ${r.buyer} ${r.muni}`.toLowerCase().includes(q)));
    const homes = R.filter(r => base(r) && r._seg === 'res' && (r.price || 0) > 1000);
    f.setCount(`${fmt.num(filtered.length)} / ${fmt.num(R.length)}`);
    const vol = sum(filtered, r => r.price), ent = filtered.filter(r => r._entity).length, old = filtered.filter(r => r.year_built && r.year_built < 1990).length;
    const towns = groupBy(filtered, r => `${r.muni}|${r.state}`); const topTown = [...towns].sort((a, b) => b[1].length - a[1].length)[0];
    const segLabel = SEGS.find(s => s.value === seg)?.label || 'All';
    el.querySelector('#tx-kpis').innerHTML = ui.kpis([
      { label: `${segLabel}`, value: fmt.num(filtered.length), sub: `${fmt.num(ent)} to entity buyers (${filtered.length ? Math.round(ent / filtered.length * 100) : 0}%)`, color: COLOR },
      { label: 'Transfer $ volume', value: fmt.money(vol), sub: `median ${fmt.money(median(filtered.map(r => r.price)))}`, color: HEX.green },
      { label: 'Pre-1990 buildings', value: fmt.num(old), sub: 'older electrical, likely retrofit need', color: HEX.amber },
      homeFromMeta ? { label: 'Home sales (all CET counties)', value: fmt.num(homeTotal), sub: 'count from dataset metadata', color: HEX.orange } : { label: 'Home sales (same area/window)', value: fmt.num(homes.length), sub: `median ${fmt.money(median(homes.map(r => r.price)))}`, color: HEX.orange },
      { label: 'Towns with activity', value: fmt.num(towns.size), sub: topTown ? esc(`top: ${topTown[0].split('|')[0]} (${topTown[1].length})`) : '—', color: HEX.purple },
    ]);
    if (layer) layer.remove();
    layer = maps.points(map, filtered.slice(0, 5000), { color: r => USE_HEX[r.use_type] || HEX.muted, radius: r => r._seg === 'res' ? 3 : Math.min(9, 3 + Math.log10(Math.max(10, r.price || 10)) - 4), cluster: true, opacity: .8, onClick: r => openTransfer(ctx, r, map), popup: r => `<b>${esc(titleCase(r.addr || ''))}</b><br>${esc(r.muni)}, ${esc(r.state)} · ${esc(r.use_type)}<br>${fmt.date(r.sale_date)} · ${fmt.money(r.price)}<br><span class="muted">${esc(r.buyer || '')}</span>` });
    tbl ? tbl.update(filtered) : (tbl = ui.table(el.querySelector('#tx-table'), { columns: cols, rows: filtered, pageSize: 25, sortKey: 'sale_date', exportName: 'cet_property_transfers', rowKey: r => r.id, onRow: r => { openTransfer(ctx, r, map); if (r.lat != null) map.setView([r.lat, r.lon], 15); } }));
    el.querySelector('#tx-town').innerHTML = town ? `<span class="chip town-chip" style="--cc:var(--c-cet)" id="tx-town-x">Town: ${esc(town.muni)}, ${esc(town.state)} ✕</span>` : '';
    const tx = el.querySelector('#tx-town-x'); if (tx) tx.onclick = () => { town = null; apply(f.state); map.fitBounds([[41.0, -73.73], [42.75, -70.6]]); };
    renderRoll(); renderMonth();
  }
  function renderRoll() {
    const agg = [...groupBy(filtered, r => `${r.muni}|${r.state}`)].map(([k, rs]) => { const [muni, state] = k.split('|'); return { id: k, muni, state, county: rs[0].county, n: rs.length, vol: sum(rs, r => r.price), med: median(rs.map(r => r.price)), ent: rs.filter(r => r._entity).length }; }).sort((a, b) => b[rollBy] - a[rollBy]).slice(0, 25);
    const rc = [
      { key: 'muni', label: 'Town', fmt: (v, r) => `<b>${esc(v)}</b> <span class="dim small">${esc(r.state)}</span>` },
      { key: 'n', label: 'Count', num: true, fmt: v => fmt.num(v) },
      { key: 'vol', label: '$ vol', num: true, fmt: v => fmt.money(v) },
      { key: 'med', label: 'Median', num: true, fmt: v => fmt.money(v) },
      { key: 'ent', label: 'Entity', num: true, fmt: v => fmt.num(v) },
    ];
    ttbl = ui.table(el.querySelector('#tx-roll'), { columns: rc, rows: agg, pageSize: 25, sortKey: rollBy, exportName: 'cet_transfers_by_town', onRow: r => { town = { muni: r.muni, state: r.state }; apply(f.state); const pts = filtered.filter(x => x.lat != null).map(x => [x.lat, x.lon]); maps.fitPoints(map, pts, 13); } });
  }
  function renderMonth() {
    const now = new Date(); const months = []; const nM = Math.max(3, Math.min(24, Number(f.state.months) || 24)); for (let i = nM - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
    const cnt = groupBy(filtered, r => String(r.sale_date).slice(0, 7));
    el.querySelector('#tx-month').innerHTML = charts.bar(months.map(m => ({ label: m.slice(2).replace('-', '/'), value: (cnt.get(m) || []).length, color: USE_HEX[seg === 'res' ? 'residential' : seg === 'land' ? 'land' : 'commercial'] })), { h: 200, labelEvery: nM > 12 ? 3 : nM > 6 ? 2 : 1, fmt: v => fmt.compact(v) });
  }
  const f = ui.filters(el.querySelector('#tx-f'), [
    { key: 'q', label: 'Search address, buyer, town…', type: 'search' },
    { key: 'state', label: 'State', options: [...new Set(R.map(r => r.state))].sort() },
    { key: 'county', label: 'County', options: counties },
    { key: 'use', label: 'Use type', options: [...new Set(R.map(r => r.use_type))].filter(Boolean).sort() },
    { key: 'minp', label: 'Min price', value: '1001', options: [{ value: '1001', label: '> $1K (excl. nominal)' }, { value: '100000', label: '≥ $100K' }, { value: '500000', label: '≥ $500K' }, { value: '1000000', label: '≥ $1M' }, { value: '5000000', label: '≥ $5M' }] },
    { key: 'months', label: 'Months back', value: '12', options: [{ value: '3', label: '3' }, { value: '6', label: '6' }, { value: '12', label: '12' }, { value: '24', label: '24' }] },
    { key: 'ent', label: 'Entity buyers only', type: 'toggle', value: false },
  ], apply);
  apply(f.state);
  el.querySelector('#tx-out').onclick = () => {
    const rows = filtered.filter(r => r._seg !== 'res').map(r => ({ ...r, entity_buyer: r._entity ? 'yes' : 'no', suggested_offer: offerFor(r), lead_office: r.state === 'CT' ? 'Horton (Canton CT)' : /Bristol|Plymouth|Norfolk/.test(r.county || '') || r.state === 'RI' ? 'Taunton / NuWave' : 'Worcester HQ' }));
    if (!rows.length) return ui.toast('No non-residential transfers in the current filter — switch segment to Commercial & industrial');
    ui.exportCSV(rows, ['sale_date', 'buyer', 'entity_buyer', 'addr', 'muni', 'county', 'state', 'use_type', 'use_desc', 'use_code_raw', 'price', 'year_built', 'sqft', 'suggested_offer', 'lead_office', 'lat', 'lon', 'source', 'source_url'].map(k => ({ key: k })), 'cet_new_owner_outreach');
  };
  return () => map.remove();
}
/* segmented control helper (ui.seg writes into el) */
function UI_seg(ctx, el, options, value, onChange) { if (el) ctx.ui.seg(el, options, value, onChange); }

/* ═══ 6. Add-on targets ═════════════════════════════════════════════════════ */
async function targets(ctx) {
  ensureCss();
  const { el, ui, fmt, data, maps, esc, inspector } = ctx;
  const [ma, filings] = await Promise.all([data.research('ma_targets_cet'), data.research('cet_filings')]);
  if (!ma) { el.innerHTML = wrap(ui.pageHead({ title: 'Add-on targets', sub: 'CET add-on screen' }) + ui.note('Research dataset <b>ma_targets_cet</b> is not available yet.', 'warn')); return; }
  const T = ma.items || []; const m = ma.meta || {};
  const fam = T.filter(t => t.ownership === 'founder' || t.ownership === 'family'); const near = T.filter(t => (t.nearest_cet_node_miles ?? 999) <= 30);
  const top = m.ranked_top_10 || []; const pe = m.pe_backed_competitors || [];
  el.innerHTML = wrap(ui.pageHead({
    title: 'Add-on targets: New England electrical roll-up',
    sub: `<b>So what:</b> ${fmt.num(T.length)} private New England electrical, solar, controls, generator and W/WW I&C companies were screened. ${fmt.num(fam.length)} are confirmed founder- or family-owned and ${fmt.num(near.length)} sit within 30 miles of a CET node. ${fmt.num(pe.length)} PE-backed consolidators are already active, so approach the founder-owned top 10 first, and prioritize controls/SCADA and generator service to extend Horton.`,
    chips: `${fmt.chip(`${fmt.num(T.length)} screened`, 'var(--c-ma)')}${fmt.chip(`${fmt.num(fam.length)} founder/family`, 'var(--green)')}${fmt.chip(`${fmt.num(pe.length)} PE-backed rivals`, 'var(--red)')}${fmt.chip(`${fmt.num((m.screened_and_excluded || []).length)} excluded`, 'var(--dim)')}`,
  }) +
  ui.kpis([
    { label: 'Targets screened', value: fmt.num(T.length), sub: esc(Object.entries(T.reduce((a, t) => (a[t.state] = (a[t.state] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(' · ')), color: 'var(--c-ma)' },
    { label: 'Tier 1–2 fit (≥65)', value: fmt.num(T.filter(t => (t.fit_score || 0) >= 65).length), sub: `top score ${fmt.num(Math.max(...T.map(t => t.fit_score || 0)))}`, color: HEX.green },
    { label: 'Founder / family owned', value: fmt.num(fam.length), sub: `${fmt.num(T.filter(t => t.ownership === 'unknown').length)} ownership unknown`, color: HEX.cet },
    { label: 'Within 30 mi of a node', value: fmt.num(near.length), sub: 'Worcester · Taunton · Norwell', color: HEX.purple },
    { label: 'Est. revenue (top 10)', value: fmt.money(sum(T.filter(t => top.some(x => x.id === t.id)), t => t.revenue_est_usd)), sub: 'ZoomInfo modeled · est.', color: HEX.amber },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Target map', sub: 'Colour = fit tier · size = employees · CET / Horton nodes', body: `<div class="map" id="tg-map" style="min-height:500px"></div>`, flush: true, foot: ui.source(SRC.targets[0], null, m.generated) })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Ranked top 10', sub: 'Research ranking · click for profile', body: `<div class="mini-list" id="tg-top">${top.map(t => `<div class="it" data-id="${esc(t.id)}"><span class="rk">#${esc(t.rank)}</span><div class="grow"><div class="t">${esc(t.company)}</div><div class="s">${esc(T.find(x => x.id === t.id)?.hq_city || '')}, ${esc(t.state)} · ${esc((T.find(x => x.id === t.id)?.specialties || []).slice(0, 2).join(', '))}</div></div><div class="r">${fmt.score(t.fit_score)}</div></div>`).join('') || ui.empty('Ranking pending')}</div>`, scroll: true, accent: true })}
    </div>
  </div>
  <div class="mt-12">${ui.panel({ title: 'PE-backed competitors already consolidating New England', sub: 'Who else is buying and where they collide with CET', body: pe.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Company</th><th>HQ</th><th>Owner / sponsor</th><th class="num">Year</th><th>Note</th><th>Sources</th></tr></thead><tbody>${pe.map(p => `<tr style="cursor:default"><td><b>${esc(p.company)}</b></td><td>${esc(p.hq || '')}</td><td>${fmt.chip(p.owner || '—', 'var(--red)')}</td><td class="num">${esc(p.year || '')}</td><td class="wrap small text-2">${esc(p.note || '')}</td><td class="small">${(p.sources || []).slice(0, 2).map(u => fmt.link(u)).join('<br>')}</td></tr>`).join('')}</tbody></table></div>` : ui.empty('No PE-backed competitors listed'), foot: `<span class="dim">Scoring rubric: ${esc(Object.entries(m.scoring_rubric || {}).map(([k, v]) => `${k} ${v.split(':')[0]}`).join(' · '))}</span>` })}</div>
  <h3 class="mt-16 mb-8">Full target screen</h3><div id="tg-screen"></div>`);
  renderTargets(ctx, el.querySelector('#tg-screen'), { items: T, color: 'var(--c-ma)', platformLabel: 'CET', exportName: 'cet_addon_targets', extraColumns: [{ key: 'nearest_cet_node_miles', label: 'Mi to node', num: true, fmt: (v, r) => v != null ? `${fmt.num(v)} <span class="dim small">${esc(String(r.nearest_cet_node || '').split(' ')[0])}</span>` : '—' }] });
  const map = maps.create(el.querySelector('#tg-map'), { center: [42.3, -71.6], zoom: 7 });
  const tierHex = s => s >= 80 ? HEX.green : s >= 65 ? HEX.cet : s >= 50 ? HEX.amber : HEX.muted;
  const openT = t => inspector.open({ title: esc(t.company), sub: `${esc(t.hq_city || '')}, ${esc(t.state)} · ${esc(fitTierOf(t.fit_score || 0))} · fit ${esc(t.fit_score)}`, color: tierHex(t.fit_score), sections: [
    { label: 'Profile', html: ui.kv({ Employees: fmt.num(t.employees), 'Revenue (est.)': t.revenue_est_usd ? `${fmt.money(t.revenue_est_usd)} <span class="dim small">ZoomInfo est.</span>` : null, Founded: t.founded_year ? esc(t.founded_year) : null, Ownership: esc(t.ownership || ''), 'Nearest CET node': `${esc(t.nearest_cet_node || '')} · ${fmt.num(t.nearest_cet_node_miles)} mi`, Specialties: (t.specialties || []).map(s => esc(s)).join(', '), 'End markets': (t.end_markets || []).map(s => esc(s)).join(', '), Website: t.website ? fmt.link(t.website) : null }) },
    t.fit_breakdown ? { label: 'Fit breakdown', html: ctx.charts.hbar(Object.entries(t.fit_breakdown).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: Number(v) || 0 })), { max: 30, fmt: v => v, labelW: 130, color: 'var(--c-ma)' }) } : null,
    { label: 'Strategic rationale', html: `<div class="small text-2">${esc(t.strategic_rationale || '')}</div>` },
    t.ownership_notes ? { label: 'Ownership notes', html: `<div class="small text-2">${esc(t.ownership_notes)}</div>` } : null,
    (t.risk_flags || []).length ? { label: 'Risk flags', html: t.risk_flags.map(r => fmt.chip(r, 'var(--amber)')).join(' ') } : null,
    { label: 'Sources', html: `<div class="col gap-4 small">${(t.sources || []).map(s => fmt.link(s, fmt.host(s) || s)).join('')}</div>` },
    { label: 'Next action', html: `<div class="small text-2">Warm intro via PRG or the CET CEO. Confirm succession intent, request 3 years of financials and customer concentration, and test fit with ${esc(t.nearest_cet_node || 'the nearest CET office')} for crew and supervision consolidation.</div>` },
  ].filter(Boolean), actions: [t.website ? { label: 'Website ↗', href: t.website } : null].filter(Boolean) });
  maps.points(map, T, { color: t => tierHex(t.fit_score), radius: t => Math.max(4, Math.min(14, 3 + Math.sqrt(t.employees || 0) * .8)), cluster: false, opacity: .85, onClick: openT, popup: t => `<b>${esc(t.company)}</b><br>${esc(t.hq_city || '')}, ${esc(t.state)} · fit ${esc(t.fit_score)}<br>${fmt.num(t.employees)} staff · ${esc(t.ownership || '')}` });
  addNodes(ctx, map, hortonNode(filings));
  maps.legend(map, [{ color: HEX.green, label: 'Fit ≥80' }, { color: HEX.cet, label: 'Fit 65–79' }, { color: HEX.amber, label: 'Fit 50–64' }, { color: HEX.muted, label: 'Fit <50' }], 'Target fit');
  fitLater(map, T.filter(t => t.lat != null).map(t => [t.lat, t.lon]), 9);
  el.querySelectorAll('#tg-top .it').forEach(n => n.onclick = () => { const t = T.find(x => x.id === n.dataset.id); if (t) { openT(t); if (t.lat != null) map.setView([t.lat, t.lon], 10); } });
  return () => map.remove();
}

/* ═══ 7. Filings & financials ═══════════════════════════════════════════════ */
async function filingsView(ctx) {
  ensureCss();
  const { el, ui, fmt, data } = ctx;
  const f = await data.research('cet_filings');
  const est = f?.meta?.estimate_table || [];
  const pick = re => est.find(e => re.test(e.metric))?.estimate;
  el.innerHTML = wrap(ui.pageHead({
    title: 'Filings & financials: CET',
    sub: f ? `<b>So what:</b> public filings (PPP, Form D, Form ADV, press) put standalone CET at about <b>${ctx.esc(pick(/standalone revenue/i) || '$35–55M')}</b> revenue. With NuWave and Horton, the platform is roughly 260–290 staff. No lender is disclosed, so leverage is inferred from lower-middle-market norms. All figures are estimates, not audited results.` : 'Financial picture from public filings',
    chips: f ? `${fmt.chip(`${fmt.num((f.items || []).length)} filings / records`, COLOR)}${fmt.chip(`${est.length} estimates`, 'var(--amber)')}${fmt.chip('Estimates · low–medium confidence', 'var(--dim)')}` : '',
  }) + `<div id="cet-fil"></div>`);
  // normalise object-shaped sources_summary entries ({source, records}) to strings for the shared renderer
  const fx = f ? { ...f, meta: { ...(f.meta || {}), sources_summary: (f.meta?.sources_summary || []).map(x => typeof x === 'string' ? x : x?.source || JSON.stringify(x)) } } : null;
  renderFilings(ctx, el.querySelector('#cet-fil'), { data: fx, color: COLOR, title: 'CET' });
}

export default {
  id: 'cet', name: 'Commonwealth Electrical (CET)', tag: 'New England', color: 'var(--c-cet)', group: 'Portfolio',
  tagline: 'Electrical, solar, EV & energy efficiency across New England — Worcester + Taunton MA, NuWave (Norwell MA), Horton (CT)',
  hq: { lat: 42.2626, lon: -71.8023, label: 'Worcester, MA' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'opportunities', name: 'Opportunity radar', icon: '◎', flush: true, render: opportunities },
    { id: 'wastewater', name: 'Wastewater accounts', icon: '◍', render: wastewater },
    { id: 'territory', name: 'Territory fit', icon: '▦', render: territory },
    { id: 'transfers', name: 'Property transfers', icon: '⇄', render: transfers },
    { id: 'targets', name: 'Add-on targets', icon: '◆', render: targets },
    { id: 'filings', name: 'Filings & financials', icon: '§', render: filingsView },
  ],
  tour: [
    { order: 200, hash: '#/cet/overview', caption: '<b>CET:</b> a New England-only platform. Horton turns funded wastewater plants into prime-able work; the top-10 action list drives the week.', narration: 'CET is New England only. Horton turns funded wastewater plants into work CET can prime.', duration: 6500 },
    { order: 210, hash: '#/cet/opportunities', caption: '<b>Opportunity radar:</b> sourced bids, capital plans and legacy feeds in one ranked list, colour-coded by capability.', narration: 'The radar ranks every sourced bid, capital plan and award by capability, value and due date.', duration: 7000 },
    { order: 220, hash: '#/cet/wastewater', caption: '<b>Horton cross-sell:</b> 183 CT–MA–RI treatment plants ranked by fit, with funded projects and solar, storage, generator and efficiency plays.', narration: 'Every treatment plant in Connecticut, Massachusetts and Rhode Island, ranked for the Horton cross-sell, with funded projects flagged.', duration: 7500 },
    { order: 230, hash: '#/cet/transfers', caption: '<b>New owner = retrofit trigger.</b> Commercial & industrial sales become an outreach list; ~46K home sales across CET\'s MA, CT and RI counties add the residential demand signal.', narration: 'Each commercial sale brings a new owner with a capital plan. The view also maps about forty-six thousand home sales in CET counties.', duration: 9500 },
  ],
};
