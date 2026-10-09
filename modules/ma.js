import * as Copy from './copy.js?v=20261009181341';
/* ═══════════════════════════════════════════════════════════════════════════
   Acquisition engine (M&A) — cross-portfolio buy-and-build intelligence.
   Datasets: CET add-on targets, Punctual Pros add-on targets, Frontline and Thomas Scientific add-on targets, Competitor filings,
             Public comparables, Private-equity landscape, BSP firm profile; sales/* (property transfers, lazy, theses view).
   ═══════════════════════════════════════════════════════════════════════════ */
import { renderTargets, fitTierOf } from '../assets/components.js?v=20261009181341';
import * as DL from './deal-lib.js?v=20261009181341';

/* ── Constants ───────────────────────────────────────────────────────────── */
const PLAT = {
  cet: { key: 'cet', label: 'CET', long: 'Commonwealth Electrical (CET)', color: 'var(--co-cet)', module: 'cet', bench: 'commercial_electrical_energy', firmId: 'bsp-cet', heat: 'cet' },
  pp: { key: 'pp', label: 'Punctual Pros', long: 'Punctual Pros', color: 'var(--co-pp)', module: 'pp', bench: 'residential_home_services', firmId: 'bsp-pp', heat: 'punctual_pros' },
  fl: { key: 'fl', label: 'Frontline', long: 'Frontline Managed Services', color: 'var(--co-fl)', module: 'fl', bench: 'legal_bpo_managed_services', firmId: 'bsp-fl', heat: 'frontline' },
  ts: { key: 'ts', label: 'Thomas Scientific', long: 'Thomas Scientific', color: 'var(--co-ts)', module: 'ts', bench: 'lab_distribution', firmId: 'bsp-ts', heat: 'thomas_scientific' },
};
const PKEYS = ['cet', 'pp', 'fl', 'ts'];
const OVERLAP = {
  punctual_pros: { label: 'Punctual Pros', color: 'var(--co-pp)', p: 'pp' }, cet: { label: 'CET', color: 'var(--co-cet)', p: 'cet' },
  frontline: { label: 'Frontline', color: 'var(--co-fl)', p: 'fl' }, thomas_scientific: { label: 'Thomas Sci.', color: 'var(--co-ts)', p: 'ts' },
  bpi: { label: 'BPI', color: 'var(--co-bpi)' }, fair_harbor: { label: 'Fair Harbor', color: 'var(--co-fh)' },
};
/* fit_breakdown dimension maxima per company rubric (from each dataset's scoring_rubric / scoring_weights) */
const DIM_MAX = {
  cet: { capability: 30, geography: 30, scale: 20, ownership_readiness: 20 },
  pp: { density_adjacency: 20, trade_mix: 20, scale: 20, ownership_readiness: 20, brand_alignment: 20 },
  fl: { capability: 5, customer_overlap: 5, scale: 5, ownership_readiness: 5, geography: 5 },
  ts: { capability: 5, customer_overlap: 5, scale: 5, ownership_readiness: 5, geography: 5 },
};
/* Company accents are system tokens (--co-*); Smith + Howard, the exited benchmark, reads in ink. */
const COMPANY_HEX = [[/CET|Commonwealth/i, 'var(--co-cet)'], [/Punctual/i, 'var(--co-pp)'], [/Frontline/i, 'var(--co-fl)'], [/Thomas/i, 'var(--co-ts)'], [/Bully|BPI/i, 'var(--co-bpi)'], [/Fair Harbor/i, 'var(--co-fh)'], [/Smith/i, 'var(--sys-ink)']];
const hexFor = s => (COMPANY_HEX.find(([re]) => re.test(String(s || ''))) || [0, 'var(--sys-mute)'])[1];
/* Resolve a token to its current value for the canvas map renderer, which cannot read CSS variables. */
const tok = v => { const m = /^var\((--[\w-]+)\)$/.exec(String(v || '')); return m ? (getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || v) : v; };

/* Canonical rival companies (rival_filings entities vary in naming; one item can cover several rivals). */
const RIVALS = [
  { id: 'wrench', name: 'Wrench Group', re: /Wrench Group/, owner: 'Leonard Green & Partners', pe: 'leonard_green', prefix: 'wrench', est: 'Wrench Group' },
  { id: 'apex', name: 'Apex Service Partners', re: /Apex Service Partners/, owner: 'Alpine Investors', pe: 'alpine', prefix: 'apex' },
  { id: 'anyhour', name: 'Any Hour', re: /Any Hour/, owner: 'Knox Lane', pe: 'knox_lane', prefix: 'any_hour', est: 'Any Hour' },
  { id: 'redwood', name: 'Redwood Services', re: /Redwood Services/, owner: 'Altas Partners (with Union Main Group)', pe: 'altas_redwood', prefix: 'redwood' },
  { id: 'turnpoint', name: 'TurnPoint Services', re: /TurnPoint/, owner: 'OMERS Private Equity', pe: 'omers_pe' },
  { id: 'horizon', name: 'Horizon Services', re: /Horizon Services/, owner: 'New Mountain Capital (lenders also hold common equity)', est: 'Horizon Services' },
  { id: 'len', name: 'Len the Plumber', re: /Len the Plumber/, owner: 'Thompson Street Capital Partners' },
  { id: 'heartland', name: 'Heartland Home Services', re: /Heartland Home/, owner: 'The Jordan Company (Cobepa minority)' },
  { id: 'legacy', name: 'Legacy Service Partners', re: /Legacy Service/, owner: 'Gridiron Capital', pe: 'gridiron' },
  { id: 'sila', name: 'Sila Services', re: /^Sila /, owner: 'Goldman Sachs Alternatives', pe: 'gs_sila', est: 'Sila Services' },
  { id: 'haller', name: 'Haller Enterprises', re: /^Haller/, owner: 'HomeX Services Group', type: 'Strategic consolidator' },
  { id: 'ies', name: 'IES Holdings', re: /^IES Holdings/, owner: 'Public (NASDAQ: IESC)', type: 'Public strategic', est: 'Commercial electrical' },
  { id: 'sciens', name: 'Sciens Building Solutions', re: /^Sciens/, owner: 'Carlyle (acquired from Huron, Dec 2021)' },
  { id: 'interstate', name: 'Interstate Electrical Services', re: /^Interstate Electrical/, owner: 'Private, family-owned', type: 'Private', est: 'Interstate Electrical' },
  { id: 'jmbrown', name: 'J&M Brown', re: /^J\.&M\. Brown/, owner: 'Private, family-owned', type: 'Private', est: 'J&M Brown' },
  { id: 'consilio', name: 'Consilio', re: /^Consilio/, owner: 'Stone Point Capital (Trident VIII)', pe: 'stone_point', est: 'Consilio' },
  { id: 'epiq', name: 'Epiq', re: /^Epiq/, owner: 'Sponsor-owned (sponsor not verified in dataset)' },
  { id: 'integreon', name: 'Integreon', re: /^Integreon/, owner: 'EagleTree Capital', pe: 'eagletree' },
  { id: 'kraft', name: 'Kraft Kennedy', re: /^Kraft/, owner: 'Private, independent', type: 'Private', est: 'Kraft Kennedy' },
  { id: 'avantor', name: 'Avantor (VWR)', re: /^Avantor/, owner: 'Public (NYSE: AVTR)', type: 'Public strategic', est: 'VWR' },
  { id: 'calibre', name: 'Calibre Scientific', re: /^Calibre/, owner: 'StoneCalibre', pe: 'stonecalibre' },
  { id: 'celltreat', name: 'CELLTREAT Scientific', re: /^CELLTREAT/, owner: 'Private', type: 'Private' },
  { id: 'stagwell', name: 'Stagwell (incl. SKDK)', re: /^Stagwell|^SKDK/, owner: 'Public (NASDAQ: STGW)', type: 'Public strategic', est: 'Stagwell' },
  { id: 'fgs', name: 'FGS Global', re: /^FGS Global/, owner: 'KKR (c.50% stake from WPP, 2024)', est: 'FGS Global' },
  { id: 'precision', name: 'Precision Strategies', re: /^Precision Strategies/, owner: 'Private (lender-financed, Mar 2026)', type: 'Private', est: 'Precision Strategies' },
  { id: 'chubbies', name: 'Chubbies (Solo Brands)', re: /^Solo Brands|^Chubbies/, owner: 'Solo Brands (SBDS; NYSE delisting filed Jul 2026)', type: 'Public strategic', rev: /^chubbies_net_sales_fy(\d{4})_usd$/, est: 'Chubbies' },
];

/* White-space candidate sectors: regexes run over pe_landscape platforms_relevant + deals_2025_2026. */
const WS = [
  { id: 'tic', name: 'Fire, life-safety & testing / inspection (TIC)', re: /fire|life.safety|inspection|testing|certification|calibration/i, bspSector: 'Testing, Inspection & Certification Services', adj: 'cet', adjScore: 22, bench: null,
    why: 'Non-discretionary, code-mandated recurring revenue; CET already holds electrical licences in all six New England states and fire-alarm/low-voltage capability shows up in its target pool.', next: 'Pull NE fire-alarm, sprinkler inspection and electrical-testing contractors (25–250 staff) and score with the CET rubric.' },
  { id: 'facility', name: 'Commercial facility & building-exterior services', re: /facility|access solutions|janitorial|building exterior|moisture|re-roofing|roofing/i, bspSector: 'Commercial & Facility Services', adj: 'cet', adjScore: 15, bench: null,
    why: 'BSP names Commercial & Facility Services as a target sector but holds no portfolio company; route-density and technician-productivity approaches from PP and CET transfer directly.', next: 'Map Northeast facility-services operators with >60% contracted/recurring revenue; test founder succession signals.' },
  { id: 'grounds', name: 'Commercial landscaping & vegetation management', re: /landscap|grounds management|vegetation/i, bspSector: 'Commercial & Facility Services', adj: 'pp', adjScore: 10, bench: null,
    why: 'Highly fragmented, contract-based and route-dense; three sponsors bought anchor companies recently, which shows exit demand, but cross-sell with BSP companies is limited.', next: 'Screen Mid-Atlantic commercial landscapers ($10–60M revenue); check snow/ice mix and labour (H-2B) exposure.' },
  { id: 'utility', name: 'Utility & infrastructure field services', re: /utility|infrastructure (?:services|contract|engineering)|locating|power systems|fleet services/i, bspSector: 'Infrastructure Services', adj: 'cet', adjScore: 20, bench: 'commercial_electrical_energy',
    why: 'Grid, water and wastewater capex is the fastest-growing public comp set; Horton brings W/WW and utility work into CET. Could be run as a CET adjacency or a second infrastructure company.', next: 'Size NE utility locating, vegetation and substation-service firms; decide adjacency (CET add-on) versus standalone portfolio company.' },
  { id: 'prof', name: 'Accounting, tax & advisory (post–Smith + Howard)', re: /accounting|\btax\b|\bCPA\b|valuation|financial advisory/i, bspSector: 'Professional Services', adj: null, adjScore: 18, bench: 'legal_bpo_managed_services',
    why: 'The Smith + Howard exit (about 100 to 800 professionals, 9 add-ons, sold to TPG Growth) leaves BSP with a proven alternative-practice-structure growth plan and no professional-services company.', next: 'Re-open the S+H sourcing list: CPA firms with $20–80M revenue outside S+H’s Southeast footprint (Mid-Atlantic, New England).' },
  { id: 'compliance', name: 'Regulatory compliance & information services', re: /compliance|regulatory|records|information management|information services/i, bspSector: 'Professional Services', adj: 'fl', adjScore: 14, bench: 'legal_bpo_managed_services',
    why: 'Recurring, regulation-driven demand from the same GC and law-firm buyers that Frontline and BPI serve; MidOcean (Zachem lineage) is building here.', next: 'List corporate-compliance, registered-agent and records-management providers with 70%+ recurring revenue.' },
  { id: 'resi', name: 'Residential specialty services (garage, windows, pools, foundations)', re: /garage|window|pool|foundation|waterproof|franchisor/i, bspSector: 'Residential Services', adj: 'pp', adjScore: 17, bench: 'residential_home_services',
    why: 'Uses PP’s homeowner base, call-centre and membership engine, but it is a separate trade stack; sponsors (Alpine, Trivest, Riverside) are buying anchor companies now.', next: 'Test cross-sell: share of PP members who bought garage/window/foundation work in 24 months; screen PA/NJ operators.' },
  { id: 'itot', name: 'IT/OT & cyber managed services (non-legal)', re: /IT\/OT|cyber|IT services|IT managed|managed services roll-up|networking|database|cloud/i, bspSector: 'IT & Tech Services', adj: 'fl', adjScore: 16, bench: 'legal_bpo_managed_services', exclude: /Frontline/i,
    why: 'Frontline’s HELIX service desk and SOC capabilities could serve adjacent regulated verticals, but generalist MSP roll-ups (Alpine’s Evergreen, CIVC, Tailwind) crowd the space.', next: 'Decide whether Frontline’s moat is legal-vertical depth (stay focused) or service-desk scale (expand to accounting/financial firms).' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const num = v => v == null || v === '' || isNaN(v) ? null : Number(v);
const median = a => { const v = a.filter(x => x != null && !isNaN(x)).map(Number).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const countBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); if (k != null && k !== '') m[k] = (m[k] || 0) + 1; return m; }, {});
const topN = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
const clip = (s, n = 170) => { s = String(s ?? ''); if (s.length <= n) return s; const cut = s.slice(0, n); const i = cut.lastIndexOf('. '); return i > 70 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, '') + '…'; };
const pctOf = (n, d) => d ? Math.round((n / d) * 100) : 0;
const titleCase = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
const ownerClass = s => { const x = String(s || '').toLowerCase().replace(/no sponsor disclosed|no pe affiliation/g, ''); if (!x.trim()) return 'Unverified'; if (/subsidiary|part of|venture-backed|pe-backed|private equity|backed by|\bpe\b/.test(x)) return 'Sponsor / corporate'; if (/founder|family/.test(x)) return 'Founder / family'; if (/unknown|unverified|not disclosed|not verified/.test(x)) return 'Unverified'; if (/esop|employee-owned/.test(x)) return 'ESOP'; if (/franchisee/.test(x)) return 'Franchisee'; return 'Private independent'; };
const OWNER_COLOR = { 'Founder / family': 'var(--sys-good)', 'Private independent': 'var(--sys-info)', Franchisee: 'var(--sys-violet)', ESOP: 'var(--sys-warn)', Unverified: 'var(--sys-mute-2)', 'Sponsor / corporate': 'var(--sys-bad)' };
const injectCss = () => { if (!document.getElementById('css-ma')) { const l = document.createElement('link'); l.id = 'css-ma'; l.rel = 'stylesheet'; l.href = 'modules/ma.css?v=20261009181341'; document.head.appendChild(l); } };
const shortList = a => { const v = (Array.isArray(a) ? a : [a]).filter(Boolean).map(x => { const y = String(x).replace(/\s*\(.*?\)\s*/g, ' ').replace(/_/g, ' ').trim(); return y.length > 26 ? y.slice(0, 25).trim() + '…' : y; }); return v.length > 2 ? [...v.slice(0, 2), `+${v.length - 2}`] : v; };
const andList = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const pctTxt = (fmt, v, d = 1) => v == null || isNaN(v) ? '—' : `${fmt.num(v, d)}%`;
const multTxt = (fmt, v) => v == null || isNaN(v) ? '—' : `${fmt.num(v, 1)}x`;

/* Name-collision guard: a target trading under a BSP platform's own name (e.g. "PHE, Inc. d/b/a The Punctual Pros NJ")
   may already be an affiliate or related party. It is held out of every ranking until the company confirms its status. */
const affilFlag = t => /punctual\s*pros/i.test(String(t?.company || '')) || (t?.risk_flags || []).some(r => /name collision|already affiliated/i.test(r));
const affilNote = t => (t.risk_flags || []).find(r => /name collision|affiliat/i.test(r)) || 'Trades under a BSP portfolio company’s name; confirm it is not already affiliated before outreach';
/* Leadership guard: Frontline's CEO changed in Jan 2026 (Tim Britt succeeded Seelin Naidoo, who moved to the board; bsp_firm, frontline_filings).
   Screen text written earlier attributes criteria to "CEO Seelin Naidoo"; restate it so it is not presented as current leadership's view. */
const ceoFix = s => s == null ? s : Copy.text(String(s))
  .replace(/Frontline CEO Seelin Naidoo['’]s stated expansion geographies(?:\s*\(California, Texas\))?/g, 'Frontline’s stated priority geographies (CA, TX; set under former CEO Naidoo, to be re-confirmed with CEO Tim Britt)')
  .replace(/(?:Frontline )?CEO Seelin Naidoo(?:['’]s)?/g, m => /['’]s$/.test(m) ? 'former CEO Seelin Naidoo’s (pre-Jan 2026; re-confirm with CEO Tim Britt)' : 'Former CEO Seelin Naidoo (pre-Jan 2026; re-confirm with CEO Tim Britt)');
/* Route reach — ONE definition for density vs new-hub (PP and CET). Distances are straight-line (the datasets carry no drive times);
   30 mi straight-line ≈ 45 drive-minutes on Central-PA / Shore roads and matches the PP rubric's top density band (≤30 mi from a PP node). */
const ROUTE_REACH_MI = 30;
const PP_NODES = [['Lancaster', 40.06, -76.37], ['Harrisburg', 40.2732, -76.8867], ['York', 39.9626, -76.7277], ['Toms River', 39.9537, -74.1979]];
const REACH_TXT = { pp: `≤${ROUTE_REACH_MI} mi straight-line (≈45 drive-min) of Lancaster, Harrisburg, York or Toms River`, cet: `≤${ROUTE_REACH_MI} mi straight-line (≈45 drive-min) of Worcester, Taunton or Norwell` };
const miles = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, h = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 2 * 3958.8 * Math.asin(Math.sqrt(h)); };
function reachOf(t, p) {
  let node = null, mi = null;
  if (p === 'pp') {
    if (t.lat != null && t.lon != null) for (const [n, la, lo] of PP_NODES) { const d = miles(t.lat, t.lon, la, lo); if (mi == null || d < mi) { mi = d; node = n; } }
    else { const a = num(t.distance_mi_from_lancaster), c = num(t.distance_mi_from_toms_river); if (a != null || c != null) { if (c == null || (a != null && a <= c)) { mi = a; node = 'Lancaster'; } else { mi = c; node = 'Toms River'; } } }
  } else if (p === 'cet') { mi = num(t.nearest_cet_node_miles); node = t.nearest_cet_node || null; }
  else return { reach: null, node: null, mi: null };
  return { reach: mi == null ? null : mi <= ROUTE_REACH_MI ? 'Density tuck-in' : 'New-hub anchor', node, mi: mi == null ? null : Math.round(mi) };
}
const REACH_COLOR = { 'Density tuck-in': 'var(--sys-good)', 'New-hub anchor': 'var(--sys-info)' };

function normT(t, p) {
  const fit = num(t.fit_score); const rc = reachOf(t, p);
  return { ...t, strategic_rationale: ceoFix(t.strategic_rationale), _p: p, platform: PLAT[p].label, fit_score: fit, employees: num(t.employees), revenue_est_usd: num(t.revenue_est_usd), _tier: fitTierOf(fit || 0), _state: t.state || t.hq_state || '', _owner: ownerClass(t.ownership), _affil: affilFlag(t), _reach: rc.reach, _node: rc.node, _nodeMi: rc.mi };
}

/* One shared load for every view (research() caches per file; this caches the derived bundle). */
let _bundle = null, _last = null;
function loadBundle(data) {
  if (_bundle) return _bundle;
  _bundle = (async () => {
    const names = ['ma_targets_cet', 'ma_targets_pp', 'ma_targets_fl_ts', 'rival_filings', 'public_comps', 'pe_landscape', 'bsp_firm'];
    // the acquisition model's assumptions ride along (deal math in every profile) but never count as a missing screen
    const [res, dm] = await Promise.all([Promise.all(names.map(n => data.research(n))), data.research('deal_model').catch(() => null)]);
    const [cet, pp, flts, rivals, comps, pe, firm] = res;
    const missing = names.filter((n, i) => !res[i]);
    const targets = [];
    (cet?.items || []).forEach(t => targets.push(normT(t, 'cet')));
    (pp?.items || []).forEach(t => targets.push(normT(t, 'pp')));
    (flts?.items || []).forEach(t => targets.push(normT(t, t.platform === 'frontline' ? 'fl' : 'ts')));
    const b = { cet, pp, flts, rivals, comps, pe, firm, dm, missing, targets };
    b.byId = new Map(targets.map(t => [t.id, t]));
    b.rivalRows = rivals ? buildRivals(rivals) : [];
    return b;
  })();
  _bundle.then(b => { _last = b; if (b.missing.length) _bundle = null; }).catch(() => { _bundle = null; });
  return _bundle;
}
const rankedRaw = (b, p) => (p === 'cet' ? b.cet?.meta?.ranked_top_10 : p === 'pp' ? b.pp?.meta?.ranked_top_10 : p === 'fl' ? b.flts?.meta?.frontline?.ranked_top_8 : b.flts?.meta?.thomas_scientific?.ranked_top_8) || [];
/* Ranked shortlist with affiliation-flagged names held out and ranks re-numbered (the screen authors' list is otherwise kept as-is). */
const rankedFor = (b, p) => rankedRaw(b, p).filter(r => !affilFlag(r) && !b.byId.get(r.id)?._affil).map((r, i) => ({ ...r, rank: i + 1, why: ceoFix(r.why) }));
const affilFor = (b, p) => b.targets.filter(t => t._affil && (!p || t._p === p));
const metaFor = (b, p) => (p === 'cet' ? b.cet?.meta : p === 'pp' ? b.pp?.meta : b.flts?.meta) || null;
function competitorsFor(b, p) {
  const src = p === 'cet' ? b.cet?.meta?.pe_backed_competitors : p === 'pp' ? b.pp?.meta?.pe_backed_competitors : p === 'fl' ? b.flts?.meta?.frontline?.pe_backed_competitors : b.flts?.meta?.thomas_scientific?.pe_backed_competitors;
  return (src || []).map(c => ({ name: c.company || c.platform, owner: c.owner || c.sponsor || 'sponsor n/d', note: c.note || c.notes || c.threat || c.footprint || '', src: (c.sources || [])[0] }));
}
const missingNote = (ui, esc, b) => b.missing.length ? ui.note(`Research dataset${b.missing.length > 1 ? 's' : ''} not yet available: ${b.missing.map(esc).join(', ')}. Views that depend on ${b.missing.length > 1 ? 'them' : 'it'} show partial results.`, 'warn') + '<div class="mt-12"></div>' : '';
const sourceFoot = (ui, meta, label) => meta ? ui.source(label || (meta.dataset ? Copy.dataset(meta.dataset) : 'Research screen'), null, meta.generated) : '';
const nextActionFor = p => ({
  cet: 'Warm introduction through CET leadership (or the NuWave/Horton networks) → confirm ownership and succession intent → request 3-yr P&L, backlog, bonding capacity, union status and licences → indicative bid inside the LMM multiple band (see Valuation).',
  pp: 'PRG-led owner outreach (for Authority Brands franchisees, open the territory-transfer path with the franchisor) → request 3-yr P&L, membership count, technician roster and call-centre metrics → indicative bid inside the LMM multiple band.',
  fl: 'Re-confirm tuck-in criteria with CEO Tim Britt (the ~$5M revenue / $1–2M EBITDA profile was stated under former CEO Naidoo) → approach → review law-firm client list overlap, contract terms and SOC 2 posture → indicative bid; plan service-desk (HELIX) migration.',
  ts: 'Line-card overlap analysis versus the Thomas catalogue → supplier change-of-control consents → request customer concentration and gross margin by line → indicative bid ahead of Calibre Scientific.',
})[p];

/* ── Deal math and "How we estimated this" ──────────────────────────────────────────────────────────────────────
   Each target's figures are built in plain steps: staff (company database, checked against the company's own site), revenue
   (the vendor's modelled figure, checked against staff × listed-peer revenue per employee), EBITDA (revenue × the acquisition
   model's sector margin), a likely price (EBITDA × the multiple deals of that size fetch) and financing (the model's market
   defaults). targetVals / priceBand / dealSummary come from deal-lib, so "Model this deal" opens the model on the same numbers.
   Confidence: high = a figure stated by the company and confirmed by a second source; medium = one sourced figure that passes
   a cross-check; low = modelled from an assumption (margin, multiple) or failing its cross-check. */
const CONF_COLOR = { high: 'var(--sys-good)', medium: 'var(--sys-warn)', low: 'var(--sys-bad)', market: 'var(--sys-info)' };
const CONF_RULE = 'High: stated by the company and confirmed by a second source. Medium: one sourced figure that passes a cross-check. Low: modelled from an assumption, or fails its check.';
const PEER_WORDS = { cet: 'listed electrical contractors', pp: 'listed residential-services companies', fl: 'listed legal and managed-services firms', ts: 'listed lab distributors' };
const dmSector = (b, p) => (b.dm?.items || []).find(i => i.kind === 'sector' && i.co === p) || null;
const dmParent = (b, p) => (b.dm?.items || []).find(i => i.kind === 'preset' && i.co === p) || null;
const dmSource = (b, id) => (b.dm?.meta?.sources || []).find(s => s.id === id) || null;
const money$M = (fmt, v) => v == null || !isFinite(v) ? '—' : fmt.money(v * 1e6);
const pct1 = v => v == null || !isFinite(v) ? 'n/m' : `${(v * 100).toFixed(1)}%`;
const mult1 = v => v == null || !isFinite(v) ? 'n/m' : `${Number(v).toFixed(1)}x`;
const noRetrieved = s => String(s || '').replace(/\s*\((?:retrieved|as of)[^)]*\)/i, '').replace(/\s*(?:modell?ed\s+)?estimate\b/i, '').trim();
/** Estimates for one screened target, or null when the acquisition model's assumptions are not loaded. */
function estimateFor(b, t) {
  if (!b || !t) return null;
  const p = t._p, dm = b.dm, sec = dmSector(b, p), par = dmParent(b, p);
  if (!dm || !sec || !par) return null;
  const sized = !(t.revenue_est_usd > 0);
  // a target with no revenue on record is sized at the median screened target, exactly as the model's preset does
  const revM = sized ? median(b.targets.filter(x => x._p === p && !x._affil && x.revenue_est_usd > 0).map(x => x.revenue_est_usd / 1e6)) : t.revenue_est_usd / 1e6;
  if (revM == null) return null;
  const vals = DL.targetVals(dm.meta.base, dm.meta.target_defaults, sec, par.inputs, revM);
  const S = DL.dealSummary(vals);
  const band = DL.priceBand(S.ebitda, vals.em, dm.items.filter(i => i.kind === 'benchmark'));
  const peer = b.comps?.meta?.sector_benchmarks?.[PLAT[p].bench] || null;
  const rpe = num(peer?.median_revenue_per_employee_usd);
  const emp = t.employees;
  const ceiling = emp && rpe ? emp * rpe / 1e6 : null;
  const ratio = !sized && ceiling ? revM / ceiling : null;
  const stated = num(String(t.employees_note || '').replace(/,/g, '').match(/(\d+)/)?.[1]);
  const empConf = emp == null ? null : stated && Math.abs(stated - emp) / emp <= 0.15 ? 'high' : 'medium';
  const revConf = sized ? 'low' : ratio != null && ratio >= 0.25 && ratio <= 1 ? 'medium' : 'low';
  return { p, sec, par, sized, revM, vals, S, band, peer, rpe, emp, ceiling, ratio, empConf, revConf, td: dm.meta.target_defaults,
    hash: t._affil ? null : `#/deal/returns?p=${encodeURIComponent(t.id)}`, rollHash: t._affil ? null : `#/deal/rollup?p=${encodeURIComponent(t.id)}` };
}
const confChip = (esc, c) => c ? `<span class="ma-conf" style="--cc:${CONF_COLOR[c]}">${esc(c === 'market' ? 'market average' : `${c} confidence`)}</span>` : '';
const srcLabel = s => s.label.split('(')[0].split(':')[0].trim();
const srcLinks = (b, esc, ids) => [...new Set(ids)].map(id => dmSource(b, id)).filter(Boolean).map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(srcLabel(s))}</a>` : esc(srcLabel(s))).join(' · ');
/** "How we estimated this": a disclosure with one row per estimate (value, method and inputs, source, confidence, as-of date). */
function howHtml(ctx, b, t, E, open = false) {
  const { esc, fmt } = ctx; const P = PLAT[t._p]; const td = E.td; const S = E.S; const v = E.vals;
  const asOf = dayWords(t.retrieved || b[t._p === 'fl' || t._p === 'ts' ? 'flts' : t._p]?.meta?.generated);
  const mktDate = dayWords((b.dm?.meta?.sources || []).find(s => s.id === 'gf-q2-2026')?.retrieved);
  const empSrc = t.employees_source || 'company database search (ZoomInfo)';
  const rows = [
    { k: 'Staff', v: E.emp != null ? fmt.num(E.emp) : 'not on record', conf: E.empConf,
      how: E.emp != null ? `Headcount from the ${esc(Copy.text(empSrc))}${t.employees_note ? `; ${esc(Copy.text(t.employees_note))}` : ''}.` : 'No headcount on record. Confirm it in the first call.', src: '' },
    { k: 'Revenue', v: `${money$M(fmt, E.revM)}${Copy.EST}`, conf: E.revConf,
      how: E.sized ? `No revenue on record. Sized at the median screened ${esc(P.label)} target, so treat it as a placeholder.`
        : `Modelled by ${esc(noRetrieved(Copy.text(t.revenue_source || 'the company database')))}, not reported by the company.${E.ceiling ? ` Check: ${fmt.num(E.emp)} staff × ${fmt.money(E.rpe)} revenue per employee at ${fmt.num(E.peer?.n)} ${esc(PEER_WORDS[t._p])} = ${money$M(fmt, E.ceiling)} ceiling. The modelled figure is ${fmt.money(E.revM * 1e6 / E.emp)} per employee, ${Math.round(E.ratio * 100)}% of the peer rate${E.ratio > 1 ? ', above the ceiling, so treat it as high' : E.ratio < 0.25 ? ', far below it, so confirm size early' : ', inside the ceiling'}.` : ' No headcount to cross-check it against.'}`,
      src: E.ceiling ? 'SEC filings of listed peers' : '' },
    { k: 'EBITDA', v: `${money$M(fmt, S.ebitda)}${Copy.EST}`, conf: 'low', how: `Revenue × ${fmt.num(E.sec.margin_pct)}% margin. ${esc(E.sec.basis)}`, src: srcLinks(b, esc, E.sec.source_ids || []) },
    E.band ? { k: 'Likely price', v: `${money$M(fmt, E.band.lo)}–${money$M(fmt, E.band.hi)}${Copy.EST}`, conf: 'low',
      how: `EBITDA × ${mult1(E.band.mLo)} to ${mult1(E.band.mHi)}, the ${esc(E.band.label)}. The model starts at ${mult1(v.em)}: ${money$M(fmt, S.price)}${E.band.inBand ? '' : ', below this band, so raise the entry multiple to test it'}.`, src: srcLinks(b, esc, E.band.source_ids) } : null,
    { k: 'Financing', v: `${money$M(fmt, S.debt)} debt · ${money$M(fmt, S.equity)} equity${Copy.EST}`, conf: 'market',
      how: `Debt of ${mult1(td.lev)} EBITDA at ${fmt.num(td.ir, 1)}% interest, the current market averages; ${fmt.num(v.fee, 0)}% deal fees (analyst assumption). The equity check is ${S.eqShare == null ? 'n/m' : `${Math.round(S.eqShare * 100)}%`} of the cost.`, src: srcLinks(b, esc, td.source_ids || []) },
    { k: 'Return', v: `${pct1(S.irr)} a year${Copy.EST}`, conf: 'low',
      how: `Sold at the same ${mult1(v.xm)} after ${S.years} years, growing ${fmt.num(v.gr)}% a year: ${S.moic == null ? 'n/m' : `${S.moic.toFixed(2)}x`} the money. No gain from merging into ${esc(P.label)} is counted; the roll-up view adds it.`, src: '' },
  ].filter(Boolean);
  const tsrc = (t.sources || []).slice(0, 4).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(fmt.host(s) || 'source')}</a>`).join(' · ');
  return `<details class="ma-how"${open ? ' open' : ''}><summary>How we estimated this</summary>
    <ol class="ma-how-steps">${rows.map(r => `<li><div class="ma-how-h"><span class="ma-how-k">${esc(r.k)}</span><span class="ma-how-v">${r.v}</span>${confChip(esc, r.conf)}</div><div class="ma-how-t">${r.how}</div>${r.src ? `<div class="ma-how-s">Source: ${r.src}</div>` : ''}</li>`).join('')}</ol>
    <div class="ma-how-foot">Screen as of ${esc(asOf)}; market figures retrieved ${esc(mktDate)}.${tsrc ? ` Company sources: ${tsrc}.` : ''} ${esc(CONF_RULE)} <a href="#/fin/methods">Methods and data gaps →</a></div>
  </details>`;
}
/** Inspector section: the deal math at the model's defaults, the disclosure and the links into the acquisition model. */
function dealSection(ctx, b, t) {
  const { esc, fmt, ui } = ctx; const E = estimateFor(b, t); const P = PLAT[t._p];
  if (!E) return null;
  if (t._affil) return { label: 'Deal math', html: `<div class="m-ma-insp">${ui.note('Not modelled until affiliation is confirmed.', 'warn')}</div>` };
  const S = E.S;
  return { label: 'Deal math', html: `<div class="m-ma-insp ma-dealsec">${ui.kv({
      'Revenue': `${money$M(fmt, E.revM)}${Copy.EST}${E.sized ? ' <span class="dim small">placeholder: median screened target</span>' : ''}`,
      'EBITDA': `${money$M(fmt, S.ebitda)}${Copy.EST} <span class="dim small">at a ${fmt.num(E.sec.margin_pct)}% margin</span>`,
      'Likely price': E.band ? `${money$M(fmt, E.band.lo)}–${money$M(fmt, E.band.hi)}${Copy.EST} <span class="dim small">${mult1(E.band.mLo)} to ${mult1(E.band.mHi)}</span>` : null,
      'Model price': `${money$M(fmt, S.price)}${Copy.EST} <span class="dim small">at ${mult1(E.vals.em)}</span>`,
      'Debt and equity': `${money$M(fmt, S.debt)} debt${Copy.EST} <span class="dim small">${mult1(E.td.lev)} at ${fmt.num(E.td.ir, 1)}%</span> · ${money$M(fmt, S.equity)} equity${Copy.EST}`,
      'Return': `${pct1(S.irr)} a year${Copy.EST} <span class="dim small">${S.moic == null ? '' : `${S.moic.toFixed(2)}x in ${S.years} years, sold at ${mult1(E.vals.xm)}`}</span>`,
    })}${howHtml(ctx, b, t, E)}<div class="ma-deal-ft"><a class="sys-btn sys-btn--primary sys-btn--sm" href="${esc(E.hash)}">Model this deal →</a><a class="sys-btn sys-btn--secondary sys-btn--sm" href="${esc(E.rollHash)}">Roll it into ${esc(P.label)}</a></div></div>` };
}
const modelAction = (ctx, b, t) => { const E = !t._affil && estimateFor(b, t); return E ? { id: 'model', label: 'Model this deal', onClick: () => { location.hash = E.hash; } } : null; };

/* Target inspector (used everywhere except the renderTargets table, which has its own). */
function openTarget(ctx, t, _b = _last) {
  const { ui, fmt, inspector, esc, charts, app } = ctx; const P = PLAT[t._p]; const mx = DIM_MAX[t._p] || {};
  const fb = Object.entries(t.fit_breakdown || {}).map(([k, v]) => { const m = mx[k] || (t._p === 'fl' || t._p === 'ts' ? 5 : 20); return { label: `${titleCase(k)} (${num(v) ?? '—'}/${m})`, value: Math.round(((num(v) || 0) / m) * 100) }; });
  inspector.open({
    title: esc(t.company), color: P.color,
    sub: `${esc(t.hq_city || '')}${t.hq_city ? ', ' : ''}${esc(t._state)} · ${esc(P.long)} add-on candidate · ${esc(t._tier)}${t._affil ? ' · held out: verify affiliation' : ''}`,
    sections: [
      t._affil ? { label: 'Verify affiliation · do not contact yet', html: `<div class="m-ma-insp">${ui.note(`<b>${esc(affilNote(t))}.</b> Held out of every ranking. ${esc(P.label)} leadership to confirm status (owned · related party · independent); if independent, resolve the trade-name overlap, then re-score.`, 'warn')}</div>` } : null,
      { label: 'Fit', html: `<div class="sys-kpi kpi" data-co="" style="--co:${P.color}"><div class="sys-kpi-label">Fit score (${esc(P.label)} rubric)</div><div class="sys-kpi-value">${fmt.num(t.fit_score)}</div><div class="sys-kpi-sub">${esc(t._tier)} · rubrics differ by company</div></div>${fb.length ? `<div class="mt-8">${charts.hbar(fb, { max: 100, fmt: v => `${v}%`, labelW: 170, color: P.color })}</div>` : ''}` },
      { label: 'Profile', html: '<div class="m-ma-insp">' + ui.kv({ Founded: t.founded_year, Employees: t.employees != null ? fmt.num(t.employees) : null, 'Revenue (est.)': t.revenue_est_usd ? `${fmt.money(t.revenue_est_usd)} <span class="dim small">ZoomInfo modeled</span>` : null, Ownership: t.ownership ? `${esc(t.ownership)}${t.ownership_notes ? `<div class="dim small">${esc(clip(t.ownership_notes, 200))}</div>` : ''}` : null, Brands: t.brands_or_franchise ? esc(t.brands_or_franchise) : null, 'Specialties / trades': t.specialties || t.trades || t.offerings, 'End markets': t.end_markets || t.customer_segments, 'Route reach': t._reach ? `${fmt.chip(t._reach, REACH_COLOR[t._reach])} <span class="dim small">${fmt.num(t._nodeMi)} mi from ${esc(t._node || 'nearest node')} · straight-line; reach = ${esc(REACH_TXT[t._p])}</span>` : null, 'Nearest CET node': t.nearest_cet_node ? `${esc(t.nearest_cet_node)} · ${fmt.num(t.nearest_cet_node_miles)} mi` : null, 'Distance (Lancaster / Toms River)': t.distance_mi_from_lancaster != null ? `${fmt.num(t.distance_mi_from_lancaster)} / ${fmt.num(t.distance_mi_from_toms_river)} mi` : null, Reviews: t.review_count ? `${fmt.num(t.review_count)}${t.review_rating ? ` · ${esc(t.review_rating)}★` : ''}` : null, Website: t.website ? fmt.link(t.website) : null }) + '</div>' },
      dealSection(ctx, _b, t),
      { label: 'Strategic rationale', html: `<div class="small text-2">${esc(t.strategic_rationale || '—')}</div>` },
      t.risk_flags?.length ? { label: 'Risk flags', html: `<div class="m-ma-insp row wrap gap-4">${t.risk_flags.map(r => fmt.chip(r, 'var(--sys-warn)')).join(' ')}</div>` } : null,
      { label: 'Sources', html: `<div class="col gap-4 small">${(t.sources || []).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(fmt.host(s) || s)}</a>`).join('') || '—'}</div><div class="dim small mt-8">Retrieved ${esc(t.retrieved || '—')} · ${esc(Copy.text(t.revenue_source || 'revenue source not stated'))}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${esc(t._affil ? `Do not contact. ${P.label} CEO to confirm ownership / related-party status first; only if independent, re-score and log in the pipeline.` : nextActionFor(t._p))}</div>` },
    ].filter(Boolean),
    actions: [modelAction(ctx, _b, t), t.website ? { label: 'Website ↗', href: t.website } : null, { id: 'pipe', label: 'Open in pipeline', onClick: () => app.go('ma', 'pipeline', { platform: t._p, id: t.id }) }, { id: 'mod', label: `${esc(P.label)} module`, onClick: () => app.go(P.module) }].filter(Boolean),
  });
}

/* Interleave each company's ranked list: every #1, then every #2, … (rubrics are not comparable across companies). */
function topTen(b) {
  const lists = PKEYS.map(p => { const ranked = rankedFor(b, p).map(r => b.byId.get(r.id)).filter(Boolean); const rest = b.targets.filter(t => t._p === p && !t._affil && !ranked.includes(t)).sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0)); return [...ranked, ...rest]; });
  const out = [];
  for (let r = 0; out.length < 10 && r < 20; r++) {
    const tier = lists.map((l, i) => ({ t: l[r], p: PKEYS[i] })).filter(x => x.t).sort((x, y) => (y.t.fit_score || 0) - (x.t.fit_score || 0));
    for (const x of tier) if (out.length < 10) out.push({ ...x, rank: r + 1 });
  }
  return out;
}
const whyFor = (b, t) => { const r = rankedFor(b, t._p).find(x => x.id === t.id); return r?.why || clip(t.strategic_rationale, 250); };

/* ── Rival parsing ───────────────────────────────────────────────────────── */
function buildRivals(rf) {
  const est = rf.meta?.estimate_table || [];
  const rows = RIVALS.map(r => ({ ...r, type: r.type || 'PE-backed', items: [], overlap: new Set() }));
  for (const it of rf.items || []) {
    const hits = rows.filter(r => r.re.test(it.entity || ''));
    for (const r of hits) { r.items.push({ it, multi: hits.length > 1 }); (it.bsp_overlap || []).forEach(o => r.overlap.add(o)); }
  }
  return rows.filter(r => r.items.length).map(r => {
    const kf = []; // [key, value, date]
    for (const { it, multi } of r.items) for (const [k, v] of Object.entries(it.key_figures || {})) {
      if (multi) { if (!r.prefix || !k.startsWith(r.prefix + '_')) continue; kf.push([k.slice(r.prefix.length + 1), v, it.filed_or_dated]); } else kf.push([k, v, it.filed_or_dated]);
    }
    const nums = kf.filter(([, v]) => typeof v === 'number');
    // reported revenue: latest fiscal year
    let rev = null, revFy = null, oi = null;
    const revRe = r.rev || /^(?:revenue|net_sales)_fy(\d{4})_usd$/;
    for (const [k, v] of nums) { const m = k.match(revRe); if (m && (revFy == null || +m[1] > revFy)) { revFy = +m[1]; rev = v; } }
    if (revFy) { const o = nums.find(([k]) => k === `operating_income_fy${revFy}_usd`); if (o) oi = o[1]; }
    let margin = rev && oi != null ? (oi / rev) * 100 : null, marginNote = margin != null ? `FY${revFy} operating margin` : '';
    if (margin == null) { const m = nums.find(([k]) => /(operating|op)_margin.*_pct$/.test(k)); if (m) { margin = m[1]; marginNote = titleCase(m[0]); } }
    const marks = nums.filter(([k]) => /mark|pct_of_par/.test(k) && !/net_assets/.test(k)).map(([, v]) => v).filter(v => v > 30 && v <= 110);
    // implied marks: fair value ÷ par for matching key pairs (e.g. tl_fair_value_usd / tl_par_usd)
    for (const { it, multi } of r.items) { const f = Object.entries(it.key_figures || {}).filter(([k, v]) => typeof v === 'number' && (!multi || (r.prefix && k.startsWith(r.prefix + '_'))));
      for (const [k, v] of f) if (/fair_value_usd$/.test(k)) { const par = f.find(([k2]) => k2 === k.replace('fair_value', 'par')); if (par && par[1] > 0) { const mk = (v / par[1]) * 100; if (mk > 30 && mk <= 110) marks.push(Math.round(mk * 10) / 10); } } }
    const pars = nums.filter(([k]) => /par_usd$|funded_usd$|commitment_usd$/.test(k) && !/unfunded/.test(k)).map(([, v]) => v);
    const parsM = nums.filter(([k]) => /par_usd_m$/.test(k)).map(([, v]) => v * 1e6);
    const maxPar = Math.max(0, ...pars, ...parsM) || null;
    const ltd = nums.filter(([k]) => /long_term_debt/.test(k)).map(([, v]) => v);
    const spread = (kf.find(([k, v]) => /spread/.test(k) && typeof v === 'string') || [])[1] || null;
    const pik = kf.some(([k, v]) => /pik/i.test(k) || (typeof v === 'string' && /PIK/.test(v)));
    const maturities = kf.filter(([k, v]) => /maturity/.test(k) && typeof v === 'string' && /^\d{4}-\d{2}/.test(v)).map(([, v]) => v).sort();
    const ev = (nums.find(([k]) => /enterprise_value_usd/.test(k)) || [])[1] || null;
    const price = (nums.find(([k]) => /estimated_price_usd/.test(k)) || [])[1] || null;
    const scaleTxt = (kf.find(([k]) => /^(employees|team_members|jobs_reported|experts)/.test(k)) || [])[1];
    const estRows = r.est ? est.filter(e => String(e.metric).includes(r.est)) : [];
    const estRev = estRows.find(e => /revenue/i.test(e.metric));
    const estEbitda = estRows.find(e => /EBITDA/i.test(e.metric));
    const dates = r.items.map(x => String(x.it.filed_or_dated || '').slice(0, 10)).filter(d => /^\d{4}/.test(d)).sort();
    const minMark = marks.length ? Math.min(...marks) : null;
    const nearMat = maturities.length && maturities[0].slice(0, 7) <= '2027-12';
    const hasLoan = marks.length || maxPar || spread;
    const signal = r.type === 'Public strategic' ? 'Public — reported' : pik || (minMark != null && minMark < 95) ? 'Stressed' : nearMat ? 'Refi due' : hasLoan ? 'Performing' : 'No lender data';
    return {
      ...r, overlapList: [...r.overlap], n: r.items.length, rev, revFy, margin, marginNote, minMark, maxMark: marks.length ? Math.max(...marks) : null, maxPar, ltd: ltd.length ? Math.max(...ltd) : null,
      spread, pik, maturity: maturities[0] || null, ev, price, scaleTxt, estRev, estEbitda, estRows, latest: dates[dates.length - 1] || null, signal,
      _scale: rev ?? (estRev ? parseRange(estRev.estimate) : null),
    };
  });
}
function parseRange(s) { const m = String(s || '').replace(/,/g, '').match(/\$?([\d.]+)\s*(?:[–-]\s*\$?([\d.]+))?\s*([BMK])?/i); if (!m) return null; const a = +m[1], b2 = m[2] ? +m[2] : a; const mult = { B: 1e9, M: 1e6, K: 1e3 }[String(m[3] || 'M').toUpperCase()] || 1e6; return ((a + b2) / 2) * mult; }
const shortSpread = s => { if (!s) return '—'; const x = String(s).replace(/\b[13]M\s+/g, '').replace(/SOFR\s*\+\s*/g, 'S+').replace(/,?\s*[\d.]+% floor/g, '').replace(/\s*\(.*?\)/g, '').replace(/\s+cash\s*/g, ' ').replace(/[\s\/,]+$/, '').trim(); return x.length > 22 ? x.slice(0, 21) + '…' : x; };
const SIGNAL_COLOR = { Stressed: 'var(--sys-bad)', 'Refi due': 'var(--sys-warn)', Performing: 'var(--sys-good)', 'Public — reported': 'var(--sys-info)', 'No lender data': 'var(--sys-mute-2)' };
const INTENSITY_COLOR = s => /very high/i.test(s) ? 'var(--sys-bad)' : /^high/i.test(s) ? 'var(--sys-orange)' : /medium/i.test(s) && !/low/i.test(s) ? 'var(--sys-warn)' : /low-medium/i.test(s) ? 'var(--sys-info)' : 'var(--sys-mute-2)';

/* "From screen to price": each company's top-ranked add-on with a revenue estimate, priced, financed and modelled, with the
   working behind every figure one click away. Leads the overview so the deal math is the first thing a deal team sees. */
function dealDeskHtml(ctx, b) {
  const { ui, fmt, esc } = ctx;
  const best = p => b.targets.filter(t => t._p === p && !t._affil && t.revenue_est_usd > 0).sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0))[0];
  const picks = PKEYS.map(p => rankedFor(b, p).map(r => b.byId.get(r.id)).find(t => t && !t._affil && t.revenue_est_usd > 0) || best(p)).filter(Boolean).map(t => ({ t, E: estimateFor(b, t) })).filter(x => x.E);
  if (!picks.length) return '';
  const flow = [
    ['Screen', `${fmt.num(b.targets.length)} add-ons and ${fmt.num(b.rivalRows.length)} rival companies, with sources`],
    ['Estimate', 'Staff, revenue and EBITDA, each cross-checked and given a confidence'],
    ['Price and finance', 'A likely price from current deal multiples, then debt, rate and equity check'],
    ['Model', 'Returns, DCF, buy-and-build and sensitivity, downloadable to Excel'],
  ];
  const card = ({ t, E }) => { const P = PLAT[t._p], S = E.S;
    return `<article class="sys-card ma-deal" data-co="" style="--co:${P.color}">
      <div class="ma-deal-hd">${fmt.chip(`${P.label} add-on`, P.color)}<span class="ma-deal-fit">fit ${fmt.num(t.fit_score)}</span></div>
      <h3 class="sys-card-title ma-deal-nm">${esc(t.company)}</h3>
      <div class="ma-deal-sub">${esc(t.hq_city || '')}${t.hq_city ? ', ' : ''}${esc(t._state)}${E.emp != null ? ` · ${fmt.num(E.emp)} staff` : ''} · ${esc(t._owner.toLowerCase())}</div>
      <dl class="ma-dl">
        <div><dt>Revenue</dt><dd>${money$M(fmt, E.revM)}${Copy.EST}</dd></div>
        <div><dt>EBITDA</dt><dd>${money$M(fmt, S.ebitda)}${Copy.EST}</dd></div>
        <div><dt>Likely price</dt><dd>${E.band ? `${money$M(fmt, E.band.lo)}–${money$M(fmt, E.band.hi)}` : money$M(fmt, S.price)}${Copy.EST}</dd></div>
        <div><dt>Debt</dt><dd>${money$M(fmt, S.debt)}${Copy.EST}</dd></div>
        <div><dt>Equity check</dt><dd>${money$M(fmt, S.equity)}${Copy.EST}</dd></div>
        <div><dt>Return a year</dt><dd>${pct1(S.irr)}${Copy.EST}</dd></div>
      </dl>
      ${howHtml(ctx, b, t, E)}
      <div class="ma-deal-ft"><a class="sys-btn sys-btn--primary sys-btn--sm" href="${esc(E.hash)}">Model this deal →</a><button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-desk="${esc(t.id)}">Profile</button></div>
    </article>`; };
  return `<div class="mt-12">${ui.panel({ title: 'From screen to price', accent: true,
    sub: 'Each company’s top-ranked add-on with a revenue estimate, priced and financed at today’s market averages. Every figure shows how it was built.',
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn" href="#/ma/pipeline">Price any target →</a>`,
    body: `<ol class="ma-flow">${flow.map(([h, d], i) => `<li><span class="ma-flow-n sys-num">${i + 1}</span><div><b>${esc(h)}</b><span>${esc(d)}</span></div></li>`).join('')}</ol><div class="ma-deals">${picks.map(card).join('')}</div>`,
    foot: `${ui.source('Add-on screens (ZoomInfo, company websites); listed peers (SEC filings); deal multiples and debt terms (GF Data, Capstone)', null, b.dm?.meta?.generated)}<span class="src">Return a year: sold at the price paid after five years, before any gain from merging (see the roll-up view).</span>` })}</div>`;
}

/* ═══ View 1: Overview ════════════════════════════════════════════════════ */
async function overview(ctx) {
  const { el, ui, fmt, maps, charts, esc, app } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  const T = b.targets;
  if (!T.length) { el.innerHTML = ui.pageHead({ title: 'Acquisition engine', sub: 'Cross-portfolio buy-and-build engine' }) + ui.note('M&A target screens (CET add-on targets, Punctual Pros add-on targets, Frontline and Thomas Scientific add-on targets) are not yet available.', 'warn'); return; }
  const byP = Object.fromEntries(PKEYS.map(p => [p, T.filter(t => t._p === p)]));
  const t1 = T.filter(t => t._tier === 'Tier 1'), t2 = T.filter(t => t._tier === 'Tier 2');
  const t1By = Object.fromEntries(PKEYS.map(p => [p, byP[p].filter(t => t._tier === 'Tier 1').length]));
  const t12By = Object.fromEntries(PKEYS.map(p => [p, byP[p].filter(t => (t.fit_score || 0) >= 65).length]));
  const medRev = median(T.map(t => t.revenue_est_usd)), medEmp = median(T.map(t => t.employees));
  const nRev = T.filter(t => t.revenue_est_usd).length;
  const ownerReady = T.filter(t => t._owner === 'Founder / family').length;
  const stats = b.firm?.firm?.stats || { add_ons: 23, platforms: 7 };
  const firmItems = b.firm?.items || [];
  const namedFromItems = firmItems.flatMap(i => (i.add_ons || []).filter(a => !/unidentified/i.test(a.name || '')).map(a => ({ ...a, company: i.company })));
  const shEvents = (b.firm?.timeline || []).filter(e => e.type === 'add_on' && /Smith/i.test(e.company || ''));
  const named = b.firm ? namedFromItems.length + shEvents.length : null;
  const rivals = b.rivalRows; const stressed = rivals.filter(r => r.signal === 'Stressed' || r.signal === 'Refi due');
  const peBacked = rivals.filter(r => r.type === 'PE-backed').length;
  const shortlistIds = new Set(PKEYS.flatMap(p => rankedFor(b, p).map(r => r.id)));
  const topP = PKEYS.slice().sort((x, y) => t12By[y] - t12By[x]);
  const heat = b.pe?.meta?.sector_heatmap || {};

  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: 'Acquisition engine',
    sub: `<b>${fmt.num(t1.length)} of ${fmt.num(T.length)} screened targets are Tier 1.</b> Most of the actionable pool sits in ${esc(PLAT[topP[0]].label)} and ${esc(PLAT[topP[1]].label)}; the median target is an est. ${fmt.money(medRev)} tuck-in.`,
    chips: `${fmt.chip('Screened ' + (b.cet?.meta?.generated || b.pp?.meta?.generated || '—'), 'var(--c-ma)')}${fmt.chip('Rubrics differ by company')}${fmt.chip('Revenue modelled est.')}`,
    actions: `<a class="sys-btn sys-btn--primary btn" href="#/deal/returns?p=typical">Acquisition model →</a><a class="sys-btn sys-btn--secondary btn" href="#/ma/pipeline">Full pipeline →</a><a class="sys-btn sys-btn--secondary btn" href="#/ma/theses">Company theses</a>`,
  }) + missingNote(ui, esc, b) +
  ui.kpis([
    { label: 'Targets screened', value: fmt.num(T.length), sub: PKEYS.map(p => `${PLAT[p].key.toUpperCase()} ${byP[p].length}`).join(' · '), color: 'var(--c-ma)' },
    { label: 'Tier-1 targets', value: fmt.num(t1.length), sub: `fit ≥80 · ${fmt.num(t2.length)} more at Tier 2`, color: 'var(--sys-good)' },
    { label: 'Companies screened', value: `${PKEYS.length}<small>of ${firmItems.filter(i => i.status === 'held').length || 6} held</small>`, sub: `BPI and Fair Harbor not yet screened`, color: 'var(--sys-brand)' },
    { label: 'Median target size', value: fmt.money(medRev), sub: `revenue est. · ${fmt.num(medEmp)} staff median`, color: 'var(--sys-info)' },
    { label: 'Rival companies tracked', value: fmt.num(rivals.length), sub: `${peBacked} PE-backed · ${stressed.length} under credit stress`, color: 'var(--sys-bad)' },
    { label: 'BSP add-ons completed', value: fmt.num(stats.add_ons), sub: named != null ? `${named} identified by name` : 'stated by BSP', color: 'var(--sys-brand)' },
  ]) + dealDeskHtml(ctx, b) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Where the targets are', cls: 'ma-fill', sub: 'Every screened add-on by company (size = fit tier); rings are BSP portfolio company HQs. Click a point to inspect.', body: `<div class="map" id="ma-map"></div>`, flush: true, foot: ui.source('ZoomInfo search and company websites (add-on target lists); BSP firm profile', null, b.cet?.meta?.generated) })}
    ${ui.panel({ title: 'This quarter’s top 10', sub: 'Each company’s #1 pick, then its #2, and so on (rubrics are not comparable across companies). Names that collide with a BSP company are held out.', body: `<div class="ma-top" id="ma-top10"></div><div id="ma-affil"></div>`, scroll: true, foot: `<span class="src">Ranking: portfolio company shortlists (top 10 for CET and Punctual Pros, top 8 for Frontline and Thomas Scientific), affiliation-flagged names removed and ranks re-numbered · reasons from screen authors</span>` })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Smith + Howard benchmark · add-on pace and headcount since BSP entry', sub: 'Cumulative dated add-ons by years since BSP’s investment, each held portfolio company against the S+H trajectory (entry Nov 2022 → TPG exit Aug 2026)', accent: true, body: `<div class="ma-sh"><div><div id="ma-sh-chart"></div><div class="sys-chips ma-sh-leg" id="ma-sh-leg"></div></div><div><div id="ma-sh-tbl"></div><div class="h-note mt-8" id="ma-sh-read"></div></div></div>`, foot: ui.source('BSP firm profile (portfolio add-ons, timeline, employee estimates); S+H headcount and ~4x revenue from the BSP exit release', 'https://broadskypartners.com/broad-sky-partners-completes-sale-of-smith-howard-to-tpg/', b.firm?.meta?.generated) })}</div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Screening funnel · portfolio company × fit tier', sub: 'Targets per fit tier (T1 ≥80, T2 65–79, T3 50–64, T4 <50). Listed = on the screen authors’ ranked shortlist; Owner = confirmed founder/family owner.', body: `<div id="ma-heat"></div><div class="sys-card-label th-h mt-12">Conversion across all companies</div><div id="ma-funnel"></div><div class="sys-card-label th-h mt-12">Read-out <span class="sys-est sys-est--illus analyst">analyst view</span></div><ul class="bul" id="ma-readout"></ul>`, foot: ui.source('CET, Punctual Pros, Frontline and Thomas Scientific add-on targets', null, b.pp?.meta?.generated) })}
    ${ui.panel({ title: 'BSP add-on track record', sub: `${stats.add_ons} add-ons stated by BSP${named != null ? ` · ${named} identified by name` : ''}`, body: `<div id="ma-cadence"></div><div id="ma-byplat" class="mt-8"></div><div class="sys-card-label th-h mt-12">Timeline</div><div id="ma-tl" style="max-height:230px;overflow:auto"></div>`, foot: ui.source('BSP and portfolio press releases (BSP firm profile)', 'https://broadskypartners.com/news/', b.firm?.meta?.generated) })}
    ${ui.panel({ title: 'Buy-and-build plan', sub: 'How a target moves from screen to integrated add-on', body: `<div class="sys-grid steps" id="ma-steps"></div><div class="sys-card-label th-h mt-16">Actions this week <span class="sys-est sys-est--illus analyst">analyst view</span></div><ol class="acts" id="ma-acts"></ol>`, foot: ui.source('PRG description from broadskypartners.com; PE landscape implications', null, b.pe?.meta?.generated) })}
  </div></div>`;

  // Top 10
  const top = topTen(b);
  el.querySelector('#ma-top10').innerHTML = top.map((x, i) => { const t = x.t, P = PLAT[x.p]; return `<div class="sys-card sys-card--link it" tabindex="0" role="button" data-co="" data-id="${esc(t.id)}" style="--co:${P.color}"><div class="rk sys-num">${i + 1}</div><div class="grow"><div class="sys-card-title nm">${esc(t.company)}</div><div class="sys-card-body why">${esc(whyFor(b, t))}</div><div class="sys-chips meta">${fmt.chip(P.label, P.color)}${fmt.chip(`#${x.rank} in ${P.label} list`)}${t.revenue_est_usd ? fmt.chip(`${fmt.money(t.revenue_est_usd)} est.`) : ''}${(E => E && t.revenue_est_usd ? fmt.chip(E.band ? `likely price ${money$M(fmt, E.band.lo)}–${money$M(fmt, E.band.hi)} est.` : `price ${money$M(fmt, E.S.price)} est.`, 'var(--c-ma)') : '')(estimateFor(b, t))}${t.employees ? fmt.chip(`${fmt.num(t.employees)} staff`) : ''}${fmt.chip(t._owner, OWNER_COLOR[t._owner])}${fmt.chip(`${t.hq_city || ''}${t.hq_city ? ', ' : ''}${t._state}`)}</div></div><div class="sc">${fmt.score(t.fit_score)}</div></div>`; }).join('');
  el.querySelectorAll('#ma-top10 .it').forEach(n => n.onclick = () => openTarget(ctx, b.byId.get(n.dataset.id), b));
  el.querySelectorAll('[data-desk]').forEach(n => n.onclick = () => openTarget(ctx, b.byId.get(n.dataset.desk), b));
  // Affiliation bucket: names that collide with a BSP company are shown with their risk flags inline, never ranked.
  const affT = affilFor(b);
  el.querySelector('#ma-affil').innerHTML = affT.length ? `<div class="sys-card-label th-h mt-12">Verify affiliation · held out of ranking (${affT.length})</div>${affT.map(t => `<div class="sys-card sys-card--link it ma-affil" tabindex="0" role="button" data-co="" data-id="${esc(t.id)}" style="--co:var(--sys-bad)"><div class="rk sys-num">!</div><div class="grow"><div class="sys-card-title nm">${esc(t.company)}</div><div class="sys-chips meta">${fmt.chip(PLAT[t._p].label, PLAT[t._p].color)}${fmt.chip('name collision · verify', 'var(--sys-bad)')}${(t.risk_flags || []).map(r => fmt.chip(clip(r, 90), /collision|affiliat/i.test(r) ? 'var(--sys-bad)' : 'var(--sys-warn)')).join('')}</div></div><div class="sc">${fmt.score(t.fit_score)}</div></div>`).join('')}` : '';
  el.querySelectorAll('#ma-affil .it').forEach(n => n.onclick = () => openTarget(ctx, b.byId.get(n.dataset.id)));
  shBenchmark(ctx, el, b);

  // Heat grid + funnel
  const cols = ['T1', 'T2', 'T3', 'T4', 'Listed', 'Owner'];
  const vals = PKEYS.map(p => [...['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'].map(tt => byP[p].filter(t => t._tier === tt).length), byP[p].filter(t => shortlistIds.has(t.id)).length, byP[p].filter(t => t._owner === 'Founder / family').length]);
  el.querySelector('#ma-heat').innerHTML = charts.heatgrid(PKEYS.map(p => `${PLAT[p].key.toUpperCase()} · ${byP[p].length}`), cols, vals, { color: '245,183,61', fmt: v => v });
  const sl = T.filter(t => shortlistIds.has(t.id));
  el.querySelector('#ma-funnel').innerHTML = charts.hbar([
    { label: 'Screened', value: T.length }, { label: 'Tier 1–2 (fit ≥65)', value: T.filter(t => (t.fit_score || 0) >= 65).length }, { label: 'Tier 1 (fit ≥80)', value: t1.length },
    { label: 'Shortlisted (ranked)', value: sl.length }, { label: 'Shortlisted + founder/family', value: sl.filter(t => t._owner === 'Founder / family').length },
  ], { labelW: 160, color: 'var(--c-ma)', fmt: v => fmt.num(v) });

  const shareT12 = p => pctOf(t12By[p], byP[p].length), shareOwn = p => pctOf(byP[p].filter(t => t._owner === 'Founder / family').length, byP[p].length);
  const hiQ = PKEYS.slice().sort((x, y) => shareT12(y) - shareT12(x)), loOwn = PKEYS.slice().sort((x, y) => shareOwn(x) - shareOwn(y));
  const unv = PKEYS.map(p => [p, byP[p].filter(t => t._owner === 'Unverified').length]).sort((x, y) => y[1] - x[1])[0];
  el.querySelector('#ma-readout').innerHTML = [
    `${esc(PLAT[hiQ[0]].label)} has the highest-quality pool (${shareT12(hiQ[0])}% Tier 1–2); ${esc(PLAT[hiQ[3]].label)} the thinnest (${shareT12(hiQ[3])}%), so widen that screen before adding outreach capacity.`,
    `Owner readiness is lowest at ${esc(PLAT[loOwn[0]].label)} (${shareOwn(loOwn[0])}% confirmed founder/family); ${unv[1]} ${esc(PLAT[unv[0]].label)} targets still have unverified ownership, so verify before the first call.`,
    `${fmt.num(sl.length - sl.filter(t => t._owner === 'Founder / family').length)} shortlisted targets lack a confirmed founder/family owner and need ownership checks.`,
  ].map(x => `<li>${x}</li>`).join('');

  // Add-on cadence + by company + timeline
  const addEvents = (b.firm?.timeline || []).filter(e => e.type === 'add_on');
  const byYear = countBy(addEvents, e => String(e.date || '').slice(0, 4));
  const years = Object.keys(byYear).sort();
  el.querySelector('#ma-cadence').innerHTML = years.length ? `<div class="sys-card-label th-h">Add-on announcements per year</div>${charts.bar(years.map(y => ({ label: y, value: byYear[y] })), { h: 120, color: 'var(--c-ma)', fmt: v => fmt.num(v) })}` : ui.empty('No add-on timeline available');
  const byCo = !b.firm ? [] : [...firmItems.map(i => ({ label: i.company.replace(/\s*\(.*\)$/, ''), value: (i.add_ons || []).filter(a => !/unidentified/i.test(a.name || '')).length, color: hexFor(i.company) })), { label: 'Smith + Howard (exited)', value: shEvents.length, color: hexFor('Smith') }].sort((x, y) => y.value - x.value);
  el.querySelector('#ma-byplat').innerHTML = !byCo.length ? '' : `<div class="sys-card-label th-h">Named add-ons by company</div>${charts.hbar(byCo, { labelW: 170, fmt: v => fmt.num(v) })}<div class="soft mt-8">${esc(stats.add_on_reconciliation || '')}</div>`;
  el.querySelector('#ma-tl').innerHTML = ui.timeline(addEvents.slice().sort((x, y) => String(y.date).localeCompare(String(x.date))).map(e => ({ date: e.date, color: hexFor(e.company), html: `${esc(e.event)}${e.source_url ? ` <a class="dim" href="${esc(e.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` })));

  // Playbook
  const prg = b.firm?.firm?.prg; const prgLead = (prg?.members || [])[0];
  el.querySelector('#ma-steps').innerHTML = [
    { n: '01', t: 'Sourcing', d: 'ZoomInfo pulls, franchise directories and web verification; fit rubric per company', k: `${fmt.num(T.length)} screened` },
    { n: '02', t: 'PRG outreach', d: `Portfolio Resource Group${prgLead ? ` (${prgLead.name})` : ''} plus portfolio-company CEO warm intros; founder/family owners first`, k: `${fmt.num(sl.filter(t => t._owner === 'Founder / family').length)} founder/family-owned` },
    { n: '03', t: 'Diligence', d: '3-yr P&L, QoE, customer concentration, licensing/labour; price inside the LMM band', k: `${fmt.num(t1.length)} Tier-1` },
    { n: '04', t: 'Integration', d: '100-day plan: brand and dispatch (PP), crews and licences (CET), service desk (FL), line cards and ERP (TS)', k: `${fmt.num(stats.add_ons)} done` },
  ].map(s => `<div class="sys-card sys-card--flat step"><div class="sys-card-label n">${s.n}</div><div class="sys-card-title t">${esc(s.t)}</div><div class="sys-card-body d">${esc(s.d)}</div><div class="sys-num k">${esc(s.k)}</div></div>`).join('');
  const best = p => rankedFor(b, p).slice(0, 2).map(r => r.company.replace(/\s*\(.*\)$/, '').split(' / ')[0]);
  const acts = [];
  if (byP.pp.length) acts.push(`<b>Punctual Pros:</b> open owner conversations with ${best('pp').map(esc).join(' and ')} before an auction; the PE landscape rates residential services “${esc(heat.punctual_pros?.intensity || 'very high')}” intensity, with Sila and Legacy buying in PP’s counties.`);
  if (byP.cet.length) acts.push(`<b>CET:</b> prioritise ${best('cet').map(esc).join(' and ')} (Eastern MA density) and CT capability near Horton while Kohlberg and Huron electrical companies are still outside New England.`);
  if (byP.fl.length) acts.push(`<b>Frontline:</b> approach ${best('fl').map(esc).join(' and ')}. They match Frontline’s stated priority geographies and ~$5M-revenue tuck-in profile (set under former CEO Naidoo; re-confirm both with Tim Britt, CEO since Jan 2026).`);
  if (byP.ts.length) acts.push(`<b>Thomas Scientific:</b> bid for ${best('ts').map(esc).join(' and ')} ahead of Calibre Scientific, the most active lab-distribution consolidator.`);
  if (affT.length) acts.push(`<b>Verify affiliation:</b> ${affT.map(t => esc(clip(t.company.replace(/\s*\(.*\)$/, ''), 50))).join(', ')} trade${affT.length === 1 ? 's' : ''} under a BSP company’s name. Confirm ownership with portfolio-company leadership before anyone calls; held out of all rankings.`);
  if (stressed.length) acts.push(`<b>Watch-list:</b> ${stressed.slice(0, 4).map(r => esc(r.name)).join(', ')} show PIK interest, sub-95 lender marks or near-term maturities. They are more likely to sell assets than to bid.`);
  el.querySelector('#ma-acts').innerHTML = acts.map(a => `<li><span>${a}</span></li>`).join('');

  // Map
  const map = maps.create(el.querySelector('#ma-map'), { center: [39.6, -86], zoom: 4 });
  for (const p of PKEYS) maps.points(map, byP[p], { color: tok(PLAT[p].color), stroke: tok('var(--sys-surface)'), radius: t => t._tier === 'Tier 1' ? 7.5 : t._tier === 'Tier 2' ? 5.5 : 4, cluster: false, opacity: .85, popup: t => `<b>${esc(t.company)}</b><br>${esc(PLAT[p].label)} · fit ${fmt.num(t.fit_score)} (${esc(t._tier)})<br><span class="muted">${esc(t.hq_city || '')}, ${esc(t._state)}${t.revenue_est_usd ? ' · ' + fmt.money(t.revenue_est_usd) + ' est.' : ''}</span>`, onClick: t => openTarget(ctx, t) });
  for (const i of firmItems) { const p = PKEYS.find(k => PLAT[k].firmId === i.id); if (p && i.lat != null) maps.marker(map, i.lat, i.lon, { color: tok(PLAT[p].color), label: PLAT[p].key.toUpperCase(), size: 13, popup: `<b>${esc(i.company)}</b><br>${esc(i.hq_city || '')}, ${esc(i.state || '')}<br><a href="#/${PLAT[p].module}">Open module →</a>` }); }
  maps.legend(map, [...PKEYS.map(p => ({ color: tok(PLAT[p].color), label: `${PLAT[p].label} targets (${byP[p].length})` })), { color: tok('var(--sys-mute)'), label: 'Company HQ', ring: true }], 'Add-on targets');

  app.index([...T.slice(0, 260).map(t => ({ label: t.company, sub: `${PLAT[t._p].label} add-on target · ${t.hq_city || ''} ${t._state} · fit ${t.fit_score ?? '—'}`, href: `#/ma/pipeline?platform=${t._p}&q=${encodeURIComponent(t.company)}`, kind: 'Target', color: PLAT[t._p].color })), ...rivals.map(r => ({ label: r.name, sub: `Rival company · ${r.owner}`, href: `#/ma/rivals?r=${r.id}`, kind: 'Rival', color: 'var(--sys-bad)' }))]);
  return () => map.remove();
}

/* Smith + Howard benchmark: add-on pace and headcount by years since BSP entry, S+H against each held platform. */
const HEADCOUNT = { // parsed from BSP firm profile employees_est (estimates); S+H from the BSP exit release
  sh: { from: 100, to: 800, note: '~100 → ~800 professionals at exit (BSP release)' },
  'bsp-cet': { from: 140, to: 260, note: '~140 (Oct 2025) → ~260+ with Horton’s 120+ staff (Sep 2026)' },
  'bsp-pp': { from: 113, to: null, note: '~113 at acquisition; current headcount not disclosed' },
  'bsp-fl': { from: 1000, to: 1100, note: '~1,000 at investment → ~1,100 (Jan 2026)' },
  'bsp-bpi': { from: 200, to: 250, note: '200+ at entry (Apr 2023), plus 50+ from BOLDT and later deals' },
};
const SHORT = { 'bsp-cet': 'CET', 'bsp-pp': 'Punctual Pros', 'bsp-fl': 'Frontline', 'bsp-ts': 'Thomas Scientific', 'bsp-bpi': 'BPI', 'bsp-fh': 'Fair Harbor' };
function shBenchmark(ctx, el, b) {
  const { ui, fmt, esc, charts } = ctx;
  const cEl = el.querySelector('#ma-sh-chart'), tEl = el.querySelector('#ma-sh-tbl'), rEl = el.querySelector('#ma-sh-read'), lEl = el.querySelector('#ma-sh-leg');
  if (!cEl) return;
  if (!b.firm) { cEl.innerHTML = ui.empty('Firm dataset (BSP firm profile) not available'); return; }
  const day = d => { const s = String(d || ''); return new Date(/^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s); };
  const yrs = (a, z) => (day(z) - day(a)) / (365.25 * 864e5);
  const tl = b.firm.timeline || [];
  const isSH = e => /Smith/i.test(e.company || '');
  const shEntry = tl.find(e => e.type === 'platform' && isSH(e))?.date || '2022-11-15';
  const shExit = tl.filter(e => e.type === 'exit' && isSH(e)).map(e => e.date).sort().pop() || '2026-08-06';
  const shAdds = tl.filter(e => e.type === 'add_on' && isSH(e)).map(e => yrs(shEntry, e.date)).sort((x, y) => x - y);
  const shStated = 9, shHeld = yrs(shEntry, shExit);
  const shAt = y => shAdds.filter(x => x <= y + 1e-9).length;
  const now = new Date().toISOString().slice(0, 10);
  const hc = h => h ? `${h.from ? fmt.num(h.from) : '—'} → ${h.to ? fmt.num(h.to) : 'n/d'}` : 'not disclosed';
  const plats = (b.firm.items || []).filter(i => i.status === 'held' && i.entry_date).map(i => {
    const held = yrs(i.entry_date, now); const adds = i.add_ons || []; const dated = adds.filter(a => a.date).map(a => yrs(i.entry_date, a.date)).sort((x, y) => x - y);
    const stated = adds.length, same = shAt(held), h = HEADCOUNT[i.id];
    return { id: i.id, name: SHORT[i.id] || i.company.replace(/\s*\(.*\)$/, ''), color: hexFor(i.company), entry: String(i.entry_date).slice(0, 7), held, stated, dated, named: adds.filter(a => !/unidentified/i.test(a.name || '')).length, pace: held > 0 ? stated / held : null, same, gap: stated - same, hc: hc(h), hcNote: h?.note || 'not disclosed', growth: h?.from && h?.to ? h.to / h.from : null };
  });
  const sh = { id: 'sh', name: 'Smith + Howard (exited)', color: hexFor('Smith'), entry: shEntry.slice(0, 7), held: shHeld, stated: shStated, dated: shAdds, named: shAdds.length, pace: shStated / shHeld, same: null, gap: null, hc: hc(HEADCOUNT.sh), hcNote: HEADCOUNT.sh.note, growth: 8, _sh: true };
  const maxY = Math.ceil(Math.max(shHeld, ...plats.map(p => p.held)) * 2) / 2;
  const steps = []; for (let y = 0; y <= maxY + 1e-9; y += 0.5) steps.push(y);
  // Half-year steps; the step that contains "today" (or the S+H exit) carries everything closed to date.
  const series = [sh, ...plats].map(r => ({ name: r.name, color: r.color, points: steps.map(y => [y, y - 0.5 < r.held ? r.dated.filter(x => x <= Math.min(y, r.held) + 1e-9).length : null]) }));
  cEl.innerHTML = charts.line(series, { h: 210, fmt: v => fmt.num(v, 0), xLabels: steps.map(y => Number.isInteger(y) ? `Yr ${y}` : '') });
  lEl.innerHTML = [sh, ...plats].map(r => `<span><i style="background:${r.color}${r._sh ? ';height:3px' : ''}"></i>${esc(r.name)}</span>`).join('') + '<span class="sys-muted">x = years since BSP entry · y = cumulative dated add-ons</span>';
  ui.table(tEl, { rows: [sh, ...plats], pageSize: 10, sortKey: 'pace', exportName: 'ma_sh_benchmark', rowKey: r => r.id,
    columns: [
      { key: 'name', label: 'Company', fmt: (v, r) => `<span class="sys-dot" style="--co:${r.color}" aria-hidden="true"></span> <b>${esc(v)}</b><div class="dim small">entry ${esc(r.entry)}</div>` },
      { key: 'held', label: 'Yrs', num: true, fmt: v => fmt.num(v, 1) },
      { key: 'stated', label: 'Add-ons', num: true, fmt: (v, r) => `${fmt.num(v)}${r.named < v ? `<span class="dim small"> (${r.named} named)</span>` : ''}` },
      { key: 'pace', label: '/ yr', num: true, fmt: v => v == null ? '—' : fmt.num(v, 1) },
      { key: 'same', label: 'S+H same age', num: true, fmt: v => v == null ? '<span class="dim">—</span>' : fmt.num(v) },
      { key: 'gap', label: 'Gap', num: true, fmt: v => v == null ? '<span class="dim">—</span>' : `<span class="${v >= 0 ? 'sys-delta--up' : 'sys-delta--down'}">${v > 0 ? '+' : ''}${fmt.num(v)}</span>` },
      { key: 'hc', label: 'Staff (est.)', fmt: (v, r) => `<span class="small" title="${esc(r.hcNote)}">${esc(v)}</span>` },
      { key: 'growth', label: 'Growth', num: true, fmt: v => v == null ? '<span class="dim">n/d</span>' : `${fmt.num(v, 1)}x` },
    ] });
  const ahead = plats.filter(p => p.gap >= 0 && p.stated > 0).sort((x, y) => y.pace - x.pace), behind = plats.filter(p => p.gap < 0 && p.stated > 0).sort((x, y) => y.pace - x.pace), none = plats.filter(p => !p.stated);
  const nm = p => `${esc(p.name)} (${p.stated} in ${fmt.num(p.held, 1)} yrs vs S+H ${p.same})`;
  rEl.innerHTML = `S+H closed ${shStated} add-ons in ${fmt.num(shHeld, 1)} years (${fmt.num(shStated / shHeld, 1)} a year) and grew headcount about 8x. ${ahead.length ? `On or ahead of that pace at the same age: ${ahead.map(nm).join('; ')}.` : 'No current company is on the S+H pace at the same age.'} ${behind.length ? `Closest: ${behind.slice(0, 2).map(nm).join('; ')}${behind.length > 2 ? `; then ${andList(behind.slice(2).map(p => esc(p.name)))}` : ''}.` : ''} ${none.length ? `${andList(none.map(p => esc(p.name)))} ${none.length === 1 ? 'has' : 'have'} no add-on yet, so ${none.length === 1 ? 'it is' : 'they are'} the biggest gap to the plan${none.some(p => p.id === 'bsp-fl') ? `; Frontline already has a ${b.targets.filter(t => t._p === 'fl').length}-target screen in Pipeline` : ''}.` : ''} Headcount is from press releases (est.); revenue by year is not disclosed for current companies. <span class="sys-est sys-est--illus analyst">analyst view</span>`;
}

/* ═══ View 2: Pipeline ════════════════════════════════════════════════════ */
/* Deal-stage tracker: stage, deal owner and next-step date per target. The portal is a static site with no shared
   store, so entries are kept in this browser (localStorage) and the ⇩ Tracker CSV is the hand-off to the team. */
const STAGES = ['Screened', 'Contacted', 'Meeting', 'NDA', 'IOI', 'Pass'];
const STAGE_COLOR = { Screened: 'var(--sys-mute-2)', Contacted: 'var(--sys-info)', Meeting: 'var(--sys-violet)', NDA: 'var(--sys-warn)', IOI: 'var(--sys-good)', Pass: 'var(--sys-bad)' };
const STAGE_KEY = 'bsp.ma.pipeline.v1';
const stageStore = {
  read() { try { const o = JSON.parse(localStorage.getItem(STAGE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } },
  write(o) { try { localStorage.setItem(STAGE_KEY, JSON.stringify(o)); return true; } catch { return false; } },
};
const stageOf = (S, id) => S[id] || { stage: 'Screened', owner: '', next: '' };
const todayISO = () => new Date().toISOString().slice(0, 10);
function stageCell(fmt, esc, st) {
  const late = st.next && st.next < todayISO() && !['Screened', 'Pass'].includes(st.stage);
  return `${fmt.chip(st.stage, STAGE_COLOR[st.stage])}${st.owner || st.next ? `<div class="dim small">${esc(st.owner || '')}${st.owner && st.next ? ' · ' : ''}${st.next ? `<span style="${late ? 'color:var(--sys-bad-ink)' : ''}">${esc(st.next)}${late ? ' overdue' : ''}</span>` : ''}</div>` : ''}`;
}

async function pipeline(ctx) {
  const { el, ui, fmt, esc, app, params } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  const idT = params.id ? b.byId.get(params.id) : null; // a single target opened from a profile link or the model
  const sel = PKEYS.includes(params.platform) ? params.platform : idT ? idT._p : 'all';
  const q = idT ? String(idT.company) : String(params.q || '').trim();
  const showPass = params.pass === '1';
  const S = stageStore.read();
  let base = b.targets.filter(t => sel === 'all' || t._p === sel);
  if (idT) base = base.filter(t => t.id === idT.id);
  else if (q) base = base.filter(t => String(t.company).toLowerCase().includes(q.toLowerCase()));
  const passed = base.filter(t => stageOf(S, t.id).stage === 'Pass');
  const rows = showPass || q ? base : base.filter(t => stageOf(S, t.id).stage !== 'Pass');
  const t1 = rows.filter(t => t._tier === 'Tier 1').length, t2 = rows.filter(t => t._tier === 'Tier 2').length;
  const ff = rows.filter(t => t._owner === 'Founder / family').length;
  const states = new Set(rows.map(t => t._state).filter(Boolean));
  const P = sel === 'all' ? null : PLAT[sel];
  const meta = sel === 'all' ? null : metaFor(b, sel);
  const topState = topN(countBy(rows, t => t._state), 3).map(([s, n]) => `${s} ${n}`).join(', ');
  const inPlay = rows.filter(t => !['Screened', 'Pass'].includes(stageOf(S, t.id).stage));
  const overdue = inPlay.filter(t => { const n = stageOf(S, t.id).next; return n && n < todayISO(); }).length;
  const byStage = countBy(inPlay, t => stageOf(S, t.id).stage);
  const affN = rows.filter(t => t._affil).length;
  const dens = rows.filter(t => !t._affil && t._reach === 'Density tuck-in').length, hub = rows.filter(t => !t._affil && t._reach === 'New-hub anchor').length;
  const passParams = { ...(sel !== 'all' ? { platform: sel } : {}), ...(q ? { q } : {}), ...(showPass ? {} : { pass: '1' }) };
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: `Add-on pipeline${P ? ` · ${esc(P.label)}` : ''}`,
    sub: rows.length ? `<b>${fmt.num(rows.length)} target${rows.length === 1 ? '' : 's'}${q ? ` matching “${esc(q)}”` : P ? '' : ' across all four companies'}; ${fmt.num(t1)} Tier-1 and ${fmt.num(t2)} Tier-2${inPlay.length ? `; ${fmt.num(inPlay.length)} in play` : ''}.</b> ${pctOf(ff, rows.length)}% have a confirmed founder or family owner. Click a row to set stage and owner.` : 'No targets match the current filter.',
    chips: `${fmt.chip('Rubrics differ by company')}${fmt.chip('Revenue modelled est.', 'var(--sys-warn)')}${passed.length && !showPass && !q ? fmt.chip(`${passed.length} passed · hidden`, 'var(--sys-bad)') : ''}`,
    actions: `<button class="sys-btn sys-btn--secondary btn" id="ma-trk-csv">⇩ Tracker CSV</button><a class="sys-btn sys-btn--secondary btn" href="#/ma/theses">Company theses →</a>`,
  }) + missingNote(ui, esc, b) +
  ui.kpis([
    { label: 'Targets in view', value: fmt.num(rows.length), sub: `${sel === 'all' ? `of ${fmt.num(b.targets.length)} screened` : `${esc(P.long)} screen`} · ${fmt.num(states.size)} states/countries`, color: P?.color || 'var(--c-ma)' },
    { label: 'Tier 1 / Tier 2', value: `${fmt.num(t1)}<small>/ ${fmt.num(t2)}</small>`, sub: 'fit ≥80 / 65–79', color: 'var(--sys-good)' },
    { label: 'Median fit', value: fmt.num(median(rows.map(t => t.fit_score))), sub: 'portfolio company rubric, 0–100', color: 'var(--sys-info)' },
    { label: 'Median revenue (est.)', value: fmt.money(median(rows.map(t => t.revenue_est_usd))), sub: `median staff ${fmt.num(median(rows.map(t => t.employees)))} · ZoomInfo modeled`, color: 'var(--c-ma)' },
    { label: 'Founder/family-owned', value: `${pctOf(ff, rows.length)}%`, sub: `${fmt.num(ff)} confirmed · ${esc(topState || '—')}`, color: 'var(--sys-good)' },
    { label: 'In play', value: fmt.num(inPlay.length), sub: inPlay.length ? `${STAGES.filter(s => byStage[s]).map(s => `${s} ${byStage[s]}`).join(' · ')}${overdue ? ` · ${overdue} overdue` : ''}` : 'set stage in the row inspector', color: overdue ? 'var(--sys-bad)' : 'var(--sys-violet)' },
  ]) +
  `<div class="sys-filters ma-seg-row mt-12"><span class="sys-field-label lbl">Portfolio company</span><div id="ma-seg"></div>${q ? `${fmt.chip(`Search: ${q}`, 'var(--c-ma)')}<a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/ma/pipeline${sel !== 'all' ? `?platform=${sel}` : ''}">Clear ✕</a>` : ''}${!q ? `<button class="sys-btn sys-btn--secondary sys-btn--sm btn xs ${showPass ? 'active' : ''}" id="ma-pass" aria-pressed="${showPass}">${showPass ? 'Hide' : 'Show'} passed (${passed.length})</button>` : ''}</div>
  <div id="ma-tg"></div>
  <div class="sys-src src-line mt-8">${sel === 'all' ? 'Sources: CET add-on targets, Punctual Pros add-on targets, Frontline and Thomas Scientific add-on targets (ZoomInfo company search, franchise directories, company websites)' : esc(clip(ceoFix(meta?.method || ''), 320))} · generated ${esc(meta?.generated || b.pp?.meta?.generated || '—')} · stages saved in this browser</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'How to work this list', sub: 'Recommended sequence for deal teams', body: `<ol class="acts"><li><span><b>Filter to Tier 1–2 and founder/family-owned</b> for PRG outreach this quarter; density tuck-ins first, new-hub anchors only with a branch plan.</span></li><li><span><b>Set stage, owner and next-step date</b> in the row inspector (Screened → Contacted → Meeting → NDA → IOI, or Pass). Passed targets drop out of the default view.</span></li><li><span><b>Share the tracker</b> with ⇩ Tracker CSV; stages are kept in this browser only.</span></li><li><span><b>Check risk flags</b> in the inspector. ZoomInfo revenue is modeled, so confirm size in the first call. Never contact a target flagged “verify affiliation”.</span></li><li><span><b>Price it</b> in the row inspector: Deal math shows the likely price, debt, equity check and return, and how each was estimated. Model this deal opens the full model, ready to download to Excel.</span></li></ol>` })}
    ${ui.panel({ title: 'Data caveats', sub: 'From the screen authors — read before outreach', body: `<ul class="bul">${(sel === 'all' ? [b.cet?.meta, b.pp?.meta, b.flts?.meta] : [meta]).filter(Boolean).flatMap(m => (m.caveats || []).slice(0, sel === 'all' ? 2 : 5)).map(c => `<li>${esc(clip(ceoFix(c), 260))}</li>`).join('') || '<li>—</li>'}</ul>` })}
  </div></div>`;
  ui.seg(el.querySelector('#ma-seg'), [{ value: 'all', label: `All (${b.targets.length})` }, ...PKEYS.map(p => ({ value: p, label: `${PLAT[p].label} (${b.targets.filter(t => t._p === p).length})` }))], sel, v => app.go('ma', 'pipeline', { ...(v === 'all' ? {} : { platform: v }), ...(showPass ? { pass: '1' } : {}) }));
  const pb = el.querySelector('#ma-pass'); if (pb) pb.onclick = () => app.go('ma', 'pipeline', passParams);
  el.querySelector('#ma-trk-csv').onclick = () => {
    const ids = new Set([...rows.map(t => t.id), ...Object.keys(S)]);
    const out = b.targets.filter(t => ids.has(t.id)).map(t => { const st = stageOf(S, t.id); return { platform: PLAT[t._p].label, company: t.company, hq: `${t.hq_city || ''}${t.hq_city ? ', ' : ''}${t._state}`, fit_score: t.fit_score, tier: t._tier, route_reach: t._reach ? `${t._reach} (${t._nodeMi} mi ${t._node})` : '', ownership: t._owner, revenue_est_usd: t.revenue_est_usd, verify_affiliation: t._affil ? 'YES' : '', stage: st.stage, deal_owner: st.owner || '', next_step_date: st.next || '', stage_updated: st.updated || '', website: t.website || '' }; });
    ui.exportCSV(out, null, `ma_deal_tracker_${sel}`);
  };
  const host = el.querySelector('#ma-tg');
  if (!b.targets.length) { host.innerHTML = ui.note('Target screens are not yet available.', 'warn'); return; }
  // Normalise fit_breakdown to % of each dimension's maximum so the shared inspector bars are comparable across rubrics.
  // Ownership is normalised to 6 classes (raw text restored in the inspector); long FL/TS offering strings are shortened for the table.
  // Affiliation-flagged names carry the flag inline (brand line and Why column) so the warning is visible without opening the row.
  const items = rows.map(t => { const mx = DIM_MAX[t._p] || {}; const fb = {}; for (const [k, v] of Object.entries(t.fit_breakdown || {})) { const m = mx[k] || 20; fb[`${k} (${v}/${m})`] = Math.round(((num(v) || 0) / m) * 100); } const st = stageOf(S, t.id);
    return { ...t, fit_breakdown: fb, ownership: t._owner, _ownRaw: t.ownership, specialties: shortList(t.specialties || t.trades || t.offerings || []), brands_or_franchise: t._affil ? `⚠ VERIFY AFFILIATION · ${clip(affilNote(t), 110)}` : t.brands_or_franchise, strategic_rationale: t._affil ? `⚠ Held out of ranking: ${clip(affilNote(t), 120)}` : clip(t.strategic_rationale, 95), _why: t.strategic_rationale, route_reach: t._reach ? `${t._reach} (${t._nodeMi} mi ${t._node})` : '', stage: st.stage, deal_owner: st.owner || '', next_date: st.next || '', ...(E => ({ _price: E ? E.S.price : null, _sized: !!E?.sized }))(t._affil ? null : estimateFor(b, t)) }; });
  const byName = new Map(rows.map(t => [esc(t.company), t]));
  const bindStage = t => {
    const box = [...document.querySelectorAll('#inspector [data-stage-for]')].find(n => n.dataset.stageFor === t.id); if (!box) return;
    const save = () => {
      const v = Object.fromEntries([...box.querySelectorAll('[data-f]')].map(n => [n.dataset.f, String(n.value || '').trim().slice(0, 60)]));
      if (v.stage === 'Screened' && !v.owner && !v.next) delete S[t.id]; else S[t.id] = { stage: STAGES.includes(v.stage) ? v.stage : 'Screened', owner: v.owner, next: /^\d{4}-\d{2}-\d{2}$/.test(v.next) ? v.next : '', updated: todayISO() };
      const ok = stageStore.write(S);
      host.querySelectorAll('[data-stage-cell]').forEach(n => { if (n.dataset.stageCell === t.id) n.innerHTML = stageCell(fmt, esc, stageOf(S, t.id)); });
      ui.toast(ok ? `${t.company.slice(0, 40)}: ${stageOf(S, t.id).stage}` : 'Could not save (browser storage blocked); use ⇩ Tracker CSV');
    };
    box.querySelectorAll('[data-f]').forEach(n => n.addEventListener('change', save));
  };
  // Wrap the inspector so the shared renderTargets panel gains the deal-stage form, raw ownership detail, the affiliation warning and a company-specific next action.
  const insp = { ...ctx.inspector, open: cfg => { const t = byName.get(cfg.title); if (t) { const st = stageOf(S, t.id);
    cfg = { ...cfg, sections: cfg.sections.map(sec => sec.label === 'Strategic rationale' ? { label: sec.label, html: `<div class="small text-2">${esc(t.strategic_rationale || '—')}</div>` } : sec.label === 'Next action' ? { label: 'Next action', html: `<div class="small text-2">${esc(t._affil ? `Do not contact. ${PLAT[t._p].label} CEO to confirm ownership / related-party status first; only if independent, re-score and set a stage.` : nextActionFor(t._p))}</div>` } : sec) };
    const i = cfg.sections.findIndex(sec => sec.label === 'Profile');
    cfg.sections.splice(i + 1, 0, { label: 'Ownership detail', html: `<div class="small text-2">${esc(t.ownership || '—')}${t.ownership_notes ? ` · ${esc(t.ownership_notes)}` : ''}</div>` }, t._reach ? { label: 'Route reach', html: `<div class="small text-2">${fmt.chip(t._reach, REACH_COLOR[t._reach])} ${fmt.num(t._nodeMi)} mi from ${esc(t._node || 'nearest node')} (straight-line). Reach = ${esc(REACH_TXT[t._p])}.</div>` } : null, dealSection(ctx, b, t));
    cfg.sections = cfg.sections.filter(Boolean);
    cfg.actions = [modelAction(ctx, b, t), ...(cfg.actions || [])].filter(Boolean);
    cfg.sections.unshift({ label: 'Deal stage', html: `<div class="m-ma-insp ma-stage" data-stage-for="${esc(t.id)}"><label>Stage<select data-f="stage">${STAGES.map(s => `<option ${s === st.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Deal owner<input data-f="owner" type="text" maxlength="60" placeholder="e.g. PRG lead" value="${esc(st.owner || '')}"></label><label>Next step<input data-f="next" type="date" value="${esc(st.next || '')}"></label><div class="dim small">Saved in this browser${st.updated ? ` · last update ${esc(st.updated)}` : ''} · share with ⇩ Tracker CSV</div></div>` });
    if (t._affil) cfg.sections.unshift({ label: 'Verify affiliation · do not contact yet', html: ui.note(`<b>${esc(affilNote(t))}.</b> Held out of every ranking until ${esc(PLAT[t._p].label)} leadership confirms status (owned · related party · independent).`, 'warn') });
  } ctx.inspector.open(cfg); if (t) bindStage(t); } };
  // Platform + route reach share one column (reach applies to PP and CET only) to keep the table inside the panel.
  const extra = [{ key: 'platform', label: 'Portfolio company · reach', fmt: (v, r) => `${fmt.chip(v, PLAT[r._p]?.color)}${r._reach ? `<div class="small" style="margin-top:var(--sys-sp-1)"><span class="sys-dot" style="--co:${REACH_COLOR[r._reach]}" aria-hidden="true"></span> ${r._reach === 'Density tuck-in' ? 'Density' : 'New hub'} <span class="dim">· ${fmt.num(r._nodeMi)} mi ${esc(r._node || '')}</span></div>` : ''}` }];
  extra.push({ key: 'stage', label: 'Stage', fmt: (v, r) => `<span data-stage-cell="${esc(r.id)}">${stageCell(fmt, esc, stageOf(S, r.id))}</span>` });
  // the price the acquisition model opens at (EBITDA at the sector margin × its entry multiple), first of the extra columns so it
  // sits near revenue; the row opens the full working
  extra.unshift({ key: '_price', label: 'Model price est.', num: true, fmt: (v, r) => v == null ? '<span class="dim">—</span>' : `${fmt.money(v * 1e6)}${r._sized ? '<span class="dim small"> sized</span>' : ''}` });
  renderTargets({ ...ctx, inspector: insp }, host, { items: Copy.targets(items), color: P?.color || 'var(--c-ma)', platformLabel: P ? P.label : 'Cross-portfolio', exportName: `ma_pipeline_${sel}`, pageSize: 40, extraColumns: extra });
  if (q && rows.length === 1) host.querySelector('#tg-table tbody tr[data-i]')?.click(); // opens the stage-aware inspector
}

/* ═══ View 3: Company theses ═════════════════════════════════════════════ */
function thesisStats(b, p) {
  const T = b.targets.filter(t => t._p === p);
  const n = T.length; const own = countBy(T, t => t._owner);
  const dims = {}; const mx = DIM_MAX[p];
  T.forEach(t => Object.entries(t.fit_breakdown || {}).forEach(([k, v]) => { (dims[k] = dims[k] || []).push((num(v) || 0) / (mx[k] || 20)); }));
  const dimAvg = Object.entries(dims).map(([k, a]) => [k, a.reduce((s, x) => s + x, 0) / a.length]).sort((x, y) => y[1] - x[1]);
  return {
    T, n, t1: T.filter(t => t._tier === 'Tier 1').length, t2: T.filter(t => t._tier === 'Tier 2').length, medEmp: median(T.map(t => t.employees)), medRev: median(T.map(t => t.revenue_est_usd)),
    ff: own['Founder / family'] || 0, unv: own.Unverified || 0, own, states: topN(countBy(T, t => t._state), 6), dimAvg,
    risks: topN(countBy(T.flatMap(t => t.risk_flags || []), x => x), 4), top5: T.filter(t => !t._affil).sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0)).slice(0, 5),
    affil: T.filter(t => t._affil), dens: T.filter(t => !t._affil && t._reach === 'Density tuck-in').length, hub: T.filter(t => !t._affil && t._reach === 'New-hub anchor').length,
  };
}
function thesisText(b, p, s, fmt) {
  const T = s.T, heat = b.pe?.meta?.sector_heatmap || {};
  const stateMix = s.states.map(([k, v]) => `${k} ${v}`).join(', ');
  if (p === 'cet') {
    const ct = T.filter(t => t._state === 'CT').length;
    return `CET’s pool is ${s.n} New England electrical, solar, controls and generator contractors (${stateMix}). ${s.dens} of ${s.n} are density tuck-ins (${REACH_TXT.cet}); the other ${s.hub} would be new-hub or capability anchors. ${ct} are in Connecticut, where Horton (120+ staff, Sept 2026) now gives CET a base. The median target has ${fmt.num(s.medEmp)} staff and ${fmt.money(s.medRev)} of modeled revenue, so these are tuck-ins, not mergers of equals. Ownership is the main risk: ${s.unv} of ${s.n} have unverified ownership and only ${s.ff} are confirmed founder or family-owned. Analyst view: CET should buy capability (W/WW I&C, generators, solar O&M, controls) and Eastern-MA density now. The PE landscape rates the sector “${heat.cet?.intensity || 'medium, rising'}”, and the Kohlberg and Huron electrical companies have not yet entered New England.`;
  }
  if (p === 'pp') {
    const tri = T.filter(t => ['hvac', 'plumbing', 'electrical'].every(x => (t.trades || []).includes(x))).length;
    const auth = T.filter(t => /One Hour|Benjamin Franklin|Mister Sparky/i.test(`${t.brands_or_franchise || ''} ${t.company}`)).length;
    const rev1k = T.filter(t => (t.review_count || 0) >= 1000).length;
    return `Punctual Pros has ${s.n} residential HVAC, plumbing and electrical operators screened across PA, NJ, MD and DE (${stateMix}). ${s.dens} are density tuck-ins (${REACH_TXT.pp}) that add route density to existing dispatch; the other ${s.hub} are new-hub anchors, i.e. branch acquisitions that need their own GM, dispatch and marketing plan. ${s.affil.length ? `${s.affil.length} more trade${s.affil.length === 1 ? 's' : ''} under the Punctual Pros name and ${s.affil.length === 1 ? 'is' : 'are'} held out until affiliation is confirmed. ` : ''}${tri} already run all three trades, ${auth} operate Authority Brands territories that could transfer, and ${rev1k} have 1,000+ reviews. Most are small (median ${fmt.num(s.medEmp)} staff, ${fmt.money(s.medRev)} est. revenue), and ${pctOf(s.ff, s.n)}% are family- or founder-owned, so the likely sellers are owners planning succession. Analyst view: PP has to win proprietary deals before they go to auction. The PE landscape rates the sector “${heat.punctual_pros?.intensity || 'very high'}”, and Sila (Goldman Sachs), Legacy (Gridiron) and Ally (Watchtower) are all buying in its counties.`;
  }
  if (p === 'fl') {
    const catx = T.filter(t => ['CA', 'TX'].includes(t._state)).length; const intl = T.filter(t => t.country && t.country !== 'United States').length;
    const bill = T.filter(t => /billing|rcm|revenue|invoice|accounting/i.test((t.offerings || []).join(' '))).length;
    const small = T.filter(t => t.revenue_est_usd != null && t.revenue_est_usd <= 15e6).length;
    return `Frontline has ${s.n} legal-IT managed-service and law-firm billing/RCM targets (${stateMix}; ${intl} outside the US). ${catx} are in California or Texas, two of Frontline’s stated priority geographies (set under former CEO Naidoo; re-confirm with Tim Britt, CEO since Jan 2026), and ${bill} offer billing, eBilling or RCM services that extend Frontline’s second product line. ${small} of ${s.n} have modeled revenue at or below $15M, which fits the previously stated tuck-in profile of ~$5M revenue and $1–2M EBITDA. Analyst view: the PE landscape rates the sector “${heat.frontline?.intensity || 'low-medium'}” and finds no sponsor-backed copy of the legal IT + RCM model. The window to lock in law-firm MSP and billing add-ons is open, but it will close once a generalist MSP roll-up (Alpine’s Evergreen) builds a legal vertical.`;
  }
  const cr = T.filter(t => /cleanroom|controlled/i.test((t.offerings || []).join(' ') + ' ' + (t.strategic_rationale || ''))).length;
  const nonNE = T.filter(t => !['NJ', 'NY', 'PA', 'MA', 'CT'].includes(t._state)).length;
  return `Thomas Scientific has ${s.n} lab-supply, life-science and cleanroom distributors (${stateMix}). ${nonNE} are outside Thomas’s Northeast core and would extend its distribution network, and ${cr} bring cleanroom or controlled-environment lines. The screen found no public Thomas acquisition since late 2023, so the company’s earlier add-on pace (regional distributors: NCI, Quintana, Day, Arrowhead) has stalled. The median target has ${fmt.num(s.medEmp)} staff and ${fmt.money(s.medRev)} of modeled revenue. Analyst view: restart the programme with exclusive line-card and regional-coverage deals. Calibre Scientific (StoneCalibre) is the main bidder, but its focus is mostly Europe, which leaves room in the US.`;
}
const IDEAL = {
  cet: ['25–400 employees and $8–120M revenue (rubric scale band)', `Density tuck-in: ${REACH_TXT.cet}; new-hub anchor: CT near Horton`, 'Capabilities that extend CET lines: solar O&M, EV, energy efficiency, W/WW I&C, generators, controls', 'Founder or family owner with a succession need; labour model compatible with CET’s', 'Licensed in several New England states; recurring service/maintenance mix'],
  pp: ['Tri-trade HVAC + plumbing + electrical (top trade-mix score, 20)', '30–150 employees (rubric scale 17–20)', `Density tuck-in: ${REACH_TXT.pp}; farther = new-hub anchor (branch plan needed)`, 'Founder or multi-generation family owner with long tenure', 'Authority Brands franchisee, or 1,000+ reviews and ready to rebrand'],
  fl: ['Law-firm-focused MSP or billing/eBilling/RCM provider', 'Tuck-in ~$5M revenue / $1–2M EBITDA; larger targets at $20M+ revenue', 'Priority geographies: California, Texas, Atlanta, South Florida, UK (stated under former CEO Naidoo; re-confirm with CEO Tim Britt)', 'Point solutions, proprietary software or GenAI capability', 'Founder- or partner-owned, with clean SOC 2 / security posture'],
  ts: ['Regional life-science, clinical or cleanroom distributor', 'Exclusive or hard-to-replicate supplier line cards', 'Geography outside the Northeast core (Midwest, West, Canada)', 'Family or founder owner; 20–150 staff', 'Private-label or kitting capability (margin lever vs 4–5% pure-distributor margins)'],
};
const INTEG = {
  cet: ['Union vs open-shop labour models across add-ons', 'Licence and bonding transfer on change of control', 'Backlog quality and project-margin discipline (public comps: 6–10% op. margin)'],
  pp: ['Brand-conversion dis-synergy when retiring heritage brands', 'Technician retention through dispatch and pay-plan changes', 'Franchisor approval needed for Authority Brands territory transfers'],
  fl: ['Law-firm client concentration and partner-level relationships', 'Service-desk tooling migration onto HELIX', 'Security and compliance posture (SOC 2) of acquired MSPs'],
  ts: ['Supplier change-of-control consents on line cards', 'ERP and catalogue migration; pricing harmonisation', 'Customer overlap with existing Northeast accounts'],
};
async function theses(ctx) {
  const { el, ui, fmt, esc } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  let alive = true;
  const S = Object.fromEntries(PKEYS.map(p => [p, thesisStats(b, p)]));
  const tot = PKEYS.reduce((a, p) => a + S[p].n, 0);
  const best = PKEYS.slice().sort((x, y) => (S[y].t1 + S[y].t2) / (S[y].n || 1) - (S[x].t1 + S[x].t2) / (S[x].n || 1))[0];
  const hardest = b.pe?.meta?.sector_heatmap?.punctual_pros?.intensity || 'very high';
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: 'Company theses',
    sub: `<b>${esc(PLAT[best].label)} has the richest pool (${pctOf(S[best].t1 + S[best].t2, S[best].n)}% Tier 1–2).</b> Punctual Pros faces the hardest competition; CET has the most open field.`,
    chips: PKEYS.map(p => fmt.chip(`${PLAT[p].key.toUpperCase()} ${S[p].n} · ${S[p].t1} T1`, PLAT[p].color)).join(''),
    actions: `<a class="sys-btn sys-btn--secondary btn" href="#/ma/pipeline">Pipeline →</a>`,
  }) + missingNote(ui, esc, b) +
  `<div class="grid grid-2 ma-theses">${PKEYS.map(p => thesisPanel(ctx, b, p, S[p])).join('')}</div>
  <div class="mt-12" id="ma-housing"></div></div>`;
  el.querySelectorAll('[data-tid]').forEach(n => n.onclick = () => { const t = b.byId.get(n.dataset.tid); if (t) openTarget(ctx, t); });
  housingPanel(ctx, el.querySelector('#ma-housing'), b, () => alive);
  return () => { alive = false; };
}
function thesisPanel(ctx, b, p, s) {
  const { ui, fmt, esc } = ctx; const P = PLAT[p]; const meta = metaFor(b, p);
  if (!s.n) return ui.panel({ title: esc(P.long), body: ui.note(`Target screen for ${esc(P.label)} is not yet available.`, 'warn') });
  const ranked = rankedFor(b, p); const comps = competitorsFor(b, p);
  const riskList = [...s.risks.map(([r, c]) => `${esc(r)} <span class="soft">(${c} targets)</span>`), ...INTEG[p].map(esc)];
  const weakest = s.dimAvg[s.dimAvg.length - 1], strongest = s.dimAvg[0];
  return ui.panel({
    title: `${esc(P.long)}`, accent: true, sub: `${fmt.num(s.n)} targets · ${s.t1} Tier 1 · ${s.t2} Tier 2`,
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/ma/pipeline?platform=${p}">Pipeline →</a>`,
    body: `<div style="--cc:${P.color}">
      <div class="sys-chips stat-row">${fmt.chip(`median ${fmt.num(s.medEmp)} staff`)}${fmt.chip(`median ${fmt.money(s.medRev)} rev. est.`)}${fmt.chip(`${pctOf(s.ff, s.n)}% founder/family`, 'var(--sys-good)')}${s.unv ? fmt.chip(`${s.unv} ownership unverified`, 'var(--sys-warn)') : ''}${s.dens + s.hub ? fmt.chip(`${s.dens} density · ${s.hub} new-hub`, 'var(--sys-info)') : ''}${s.affil.length ? fmt.chip(`${s.affil.length} held · verify affiliation`, 'var(--sys-bad)') : ''}${strongest ? fmt.chip(`strongest: ${titleCase(strongest[0])} ${Math.round(strongest[1] * 100)}%`, P.color) : ''}${weakest ? fmt.chip(`weakest: ${titleCase(weakest[0])} ${Math.round(weakest[1] * 100)}%`, 'var(--sys-warn)') : ''}</div>
      <div class="sys-card-label th-h">Thesis <span class="sys-est sys-est--illus analyst">analyst view</span></div>
      <div class="h-note">${esc(thesisText(b, p, s, fmt))}</div>
      <div class="th-two"><div><div class="sys-card-label th-h">Ideal target profile</div><ul class="bul">${IDEAL[p].map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><div class="sys-card-label th-h">Integration risks</div><ul class="bul">${riskList.slice(0, 6).map(x => `<li>${x}</li>`).join('')}</ul></div></div>
      <div class="sys-card-label th-h">Top 5 by fit</div>
      <div class="sys-table-wrap"><table class="sys-table mini"><caption>Fit on the ${esc(P.label)} rubric · revenue is ZoomInfo modeled</caption><thead><tr><th>Company</th><th>HQ</th><th class="sys-n">Staff</th><th class="sys-n">Rev. est.</th><th>Owner</th><th class="sys-n">Fit</th></tr></thead><tbody>${s.top5.map(t => `<tr data-tid="${esc(t.id)}"><td class="nm">${esc(t.company)}</td><td>${esc(t.hq_city || '')}${t.hq_city ? ', ' : ''}${esc(t._state)}</td><td class="sys-n">${fmt.num(t.employees)}</td><td class="sys-n">${t.revenue_est_usd ? `${fmt.money(t.revenue_est_usd)}<span class="sys-est">est.</span>` : '—'}</td><td>${fmt.chip(t._owner, OWNER_COLOR[t._owner])}</td><td class="sys-n">${fmt.score(t.fit_score)}</td></tr>`).join('')}${s.affil.map(t => `<tr data-tid="${esc(t.id)}" class="ma-affil-row"><td class="nm" colspan="5"><b>Held out · verify affiliation:</b> ${esc(t.company)}<div class="flags">${(t.risk_flags || []).map(r => fmt.chip(r, /collision|affiliat/i.test(r) ? 'var(--sys-bad)' : 'var(--sys-warn)')).join('')}</div></td><td class="sys-n">${fmt.score(t.fit_score)}</td></tr>`).join('')}</tbody></table></div>
      <div class="sys-card-label th-h">Screen authors’ ranked shortlist (${ranked.length})${rankedRaw(b, p).length > ranked.length ? ` <span class="soft">· ${rankedRaw(b, p).length - ranked.length} held out for affiliation check, re-numbered</span>` : ''}</div>
      ${ranked.length ? `<ol class="shortlist">${ranked.map(r => `<li data-tid="${esc(r.id)}" style="cursor:pointer" title="${esc(r.why || '')}"><span class="r">${esc(r.rank)}</span><span class="ellipsis">${esc(r.company)}</span><span class="s">${esc(r.fit_score ?? '')}</span></li>`).join('')}</ol>` : ui.empty('No ranked list in dataset')}
      <div class="sys-card-label th-h">Competing sponsor-backed buyers (${comps.length})</div>
      <div class="row wrap gap-4">${comps.slice(0, 12).map(c => { const lbl = clip(String(c.name || '').replace(/\s*\(.*?\)/g, ''), 34); const tip = `${c.name} · owner: ${c.owner}${c.note ? ' · ' + clip(c.note, 140) : ''}`; return c.src ? `<a href="${esc(c.src)}" target="_blank" rel="noopener" title="${esc(tip)}">${fmt.chip(lbl, 'var(--sys-bad)')}</a>` : `<span title="${esc(tip)}">${fmt.chip(lbl, 'var(--sys-bad)')}</span>`; }).join('')}${comps.length > 12 ? `<span class="soft">+${comps.length - 12} more</span>` : ''}${comps.length ? '' : '<span class="soft">None listed</span>'}</div><div class="soft mt-8">Hover a chip for owner and note; click for source.</div>
    </div>`,
    foot: sourceFoot(ui, meta, `${P.label} add-on screen (ZoomInfo + websites)`),
  });
}

/* Property-transfer demand signal: home and commercial sales gathered in the counties every platform serves (lazy).
   PP and CET counties are joined to their add-on targets; BPI (DC) and Fair Harbor (Manhattan) are HQ-market context;
   Frontline (St. Louis, MO: non-disclosure state) has no records yet and is listed as a next pull; Thomas Scientific (Gloucester NJ) is covered. */
/* Raw county GIS layer and file names carried in the sales datasets' coverage notes → plain English (first match wins). */
const LAYER_LABELS = [
  [/Parcels_HUBnew/i, 'Lancaster County parcel map (county GIS)'],
  [/OPEN_DATA Parcels/i, 'York County parcel map (county open data)'],
  [/Tax Parcel Tax Estimates/i, 'Cumberland County tax parcel map'],
  [/DEVNET wEdge|DC_Parcels/i, 'Dauphin County property tax sales history'],
  [/GIS_BOA_LAND/i, 'Montgomery County assessment land records'],
  [/Parcels_owners/i, 'Chester County parcel owner map'],
  [/CAMA Master\/Residential|BerksCountyGIS/i, 'Berks County assessment records and parcel map'],
  [/LandRecords\/TaxParcels|lebcogis/i, 'Lebanon County tax parcel map'],
  [/FC_TaxRecords/i, 'Franklin County tax records'],
  [/Parcel_Owners/i, 'Adams County parcel owner map'],
  [/Perry_County_Web_Map/i, 'Perry County parcel web map'],
  [/SR1A.*MOD-IV/i, 'New Jersey deed sales file joined to the state parcel and assessment map'],
  [/SR1A/i, 'New Jersey deed sales file joined to the state parcel map'],
  [/^ct_cama_parcels$|CT Statewide CAMA/i, 'Connecticut statewide assessor parcel map'],
  [/^ct_opm_sales$|CT OPM Real Estate Sales/i, 'Connecticut real estate sales (state Office of Policy and Management)'],
  [/^cranston_ri_parcels$|Cranston RI Parcels/i, 'Cranston, RI parcel map'],
  [/Lincoln RI Parcels/i, 'Lincoln, RI parcel map'],
  [/MassGIS L3/i, 'MassGIS standardized assessor parcels'],
];
const layerLabel = src => { const t = String(src || ''); const hit = LAYER_LABELS.find(([rx]) => rx.test(t)); return hit ? hit[1] : Copy.text(t.replace(/\b([A-Za-z]+)_([A-Za-z0-9_]+)\b/g, (m) => m.replace(/_/g, ' '))); };
const dayWords = iso => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(iso || '')); if (!m) return iso ? String(iso) : '—'; const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1]; return m[3] ? `${mon} ${+m[3]}, ${m[1]}` : `${mon} ${m[1]}`; };
const cname = r => /n\/a/.test(r.county) ? `${r.state} (county n/a)` : `${r.county} ${r.state}`;
const HP = { ...Object.fromEntries(PKEYS.map(p => [p, { label: PLAT[p].label, color: PLAT[p].color }])), bpi: { label: 'BPI', color: 'var(--co-bpi)' }, fh: { label: 'Fair Harbor', color: 'var(--co-fh)' } };
const SALES = [{ n: 'sales/pp_sales_pa_a', p: 'pp' }, { n: 'sales/pp_sales_pa_b', p: 'pp' }, { n: 'sales/pp_sales_nj', p: 'pp' }, { n: 'sales/cet_transfers_ma', p: 'cet' }, { n: 'sales/cet_transfers_ct_ri', p: 'cet' }, { n: 'sales/cet_home_sales_ma', p: 'cet' }, { n: 'sales/cet_home_sales_ct_ri', p: 'cet' }, { n: 'sales/ts_sales_gloucester_nj', p: 'ts' }, { n: 'sales/bpi_sales_dc', p: 'bpi' }, { n: 'sales/fh_sales_nyc', p: 'fh' }];
/* Counties where each platform is headquartered or has an operating base (bsp_firm: HQ and add-on locations). */
const PORTCO_COUNTIES = [
  { p: 'pp', state: 'PA', county: 'Lancaster', why: 'HQ (East Hempfield Twp.)' }, { p: 'pp', state: 'NJ', county: 'Ocean', why: 'Horvath Home Services (Toms River)' }, { p: 'pp', state: 'NJ', county: 'Monmouth', why: 'Horvath Home Services service area' },
  { p: 'cet', state: 'MA', county: 'Worcester', why: 'HQ (Worcester)' }, { p: 'cet', state: 'MA', county: 'Bristol', why: 'Taunton office' }, { p: 'cet', state: 'MA', county: 'Plymouth', why: 'NuWave Energy Solutions (Norwell)' },
  { p: 'fl', state: 'MO', county: 'St. Louis City', why: 'HQ (St. Louis)' }, { p: 'ts', state: 'NJ', county: 'Gloucester', why: 'HQ and distribution centre (Swedesboro)' },
  { p: 'bpi', state: 'DC', county: 'District of Columbia', why: 'HQ (1445 New York Ave NW)' }, { p: 'fh', state: 'NY', county: 'New York', why: 'Owned store (Prince St, SoHo)' },
];
async function housingPanel(ctx, host, b, alive) {
  const { ui, fmt, esc, data } = ctx;
  const TITLE = 'Demand signal · home sales in portfolio-company counties';
  host.innerHTML = ui.panel({ title: TITLE, sub: 'Home sales and commercial/industrial transfers from county and state records, joined to each portfolio company’s counties and target pool', body: ui.loading('Loading and aggregating property-transfer records…') });
  const res = await Promise.all(SALES.map(f => data.load(f.n).catch(() => null)));
  if (!alive()) return;
  const agg = new Map(); const cov = []; const rel = {};
  res.forEach((d, i) => {
    if (!d) return; const items = Array.isArray(d) ? d : (d.items || []); const p = SALES[i].p;
    if (d.meta?.relevance_to_portco) rel[p] = d.meta.relevance_to_portco;
    const first = items.find(r => r.source_url) || {};
    [].concat(d.meta?.coverage || []).forEach(c => cov.push({ ...c, p, source: c.source || d.meta?.dataset || first.source || SALES[i].n, source_url: c.source_url || first.source_url || null }));
    for (const r of items) {
      if (!r.county || !r.state) continue; const k = `${r.state}|${r.county}`; let a = agg.get(k);
      if (!a) { a = { state: r.state, county: r.county, p, res: 0, prices: [], nonres: 0, lat: 0, lon: 0, nll: 0, from: null, to: null }; agg.set(k, a); }
      const price = num(r.price);
      if (r.use_type === 'residential') { a.res++; if (price >= 10000 && r.arms_length !== false) a.prices.push(price); }
      else if (['commercial', 'industrial', 'mixed'].includes(r.use_type)) a.nonres++;
      if (r.lat != null && r.lon != null) { a.lat += r.lat; a.lon += r.lon; a.nll++; }
      const dt = r.sale_date; if (dt) { if (!a.from || dt < a.from) a.from = dt; if (!a.to || dt > a.to) a.to = dt; }
    }
  });
  const loaded = res.filter(Boolean).length;
  if (!agg.size) { host.innerHTML = ui.panel({ title: TITLE, body: ui.note(`Property-transfer datasets (${SALES.map(s => esc(s.n)).join(', ')}) are not available yet.`, 'warn') }); return; }
  const counties = [...agg.values()].map(a => { const months = a.from && a.to ? Math.max(1, (new Date(a.to) - new Date(a.from)) / (30.44 * 864e5)) : null; return { ...a, clat: a.nll ? a.lat / a.nll : null, clon: a.nll ? a.lon / a.nll : null, medPrice: median(a.prices), months, resPerMo: months ? a.res / months : null, nonresPerMo: months ? a.nonres / months : null, targets: [] }; });
  const byKey = new Map(counties.map(c => [`${c.state}|${c.county}`, c]));
  const uncovered = new Map();
  const R = 6371, dist = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, x = (lo2 - lo1) * r * Math.cos(((la1 + la2) / 2) * r), y = (la2 - la1) * r; return Math.sqrt(x * x + y * y) * R; };
  for (const t of b.targets.filter(t => t._p === 'pp' || t._p === 'cet')) {
    let c = null;
    if (t.county) c = byKey.get(`${t._state}|${String(t.county).replace(/\s+County$/i, '')}`);
    if (!c && !t.county && t.lat != null) { let best = null, bd = 45; for (const k of counties) if (k.state === t._state && k.clat != null) { const d = dist(t.lat, t.lon, k.clat, k.clon); if (d < bd) { bd = d; best = k; } } c = best; }
    if (c) c.targets.push(t); else { const k = `${t._state}|${t.county || '(no county record)'}`; if (!uncovered.has(k)) uncovered.set(k, { state: t._state, county: t.county || 'county n/a', p: t._p, targets: [] }); uncovered.get(k).targets.push(t); }
  }
  const hqFor = (st, co) => PORTCO_COUNTIES.filter(h => h.state === st && h.county === co);
  const med = p => median(counties.filter(c => c.p === p).map(c => p === 'pp' ? c.resPerMo : c.nonresPerMo));
  const medPP = med('pp'), medCET = med('cet');
  const rows = counties.map(c => { const screened = c.p === 'pp' || c.p === 'cet'; const act = c.p === 'cet' ? (c.nonresPerMo || 0) : (c.resPerMo || 0); const hi = screened && act >= (c.p === 'pp' ? medPP : medCET); const nT = c.targets.length; const good = c.targets.filter(t => (t.fit_score || 0) >= 65).length; const top = c.targets.slice().sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0))[0];
    const hq = hqFor(c.state, c.county);
    const signal = !screened ? 'HQ market' : nT && hi ? 'Density play' : !nT && hi ? 'Sourcing gap' : nT ? 'Targets, lower turnover' : 'Monitor';
    return { id: `${c.state}|${c.county}`, _list: c.targets, platform: HP[c.p].label, _p: c.p, county: c.county, state: c.state, hq: hq.map(h => `${HP[h.p].label}: ${h.why}`).join('; '), res: c.res, resPerMo: c.resPerMo, medPrice: c.medPrice, nonres: c.nonres, nonresPerMo: c.nonresPerMo, window: c.from ? `${c.from.slice(0, 7)} → ${c.to.slice(0, 7)}` : '—', _scr: screened, targets: screened ? nT : 0, good: screened ? good : 0, top: top ? top.company : '', topId: top?.id, signal };
  });
  [...uncovered.values()].forEach(u => rows.push({ id: `${u.state}|${u.county}|x`, _list: u.targets, platform: HP[u.p].label, _p: u.p, county: u.county, state: u.state, hq: hqFor(u.state, u.county).map(h => `${HP[h.p].label}: ${h.why}`).join('; '), res: null, resPerMo: null, medPrice: null, nonres: null, nonresPerMo: null, window: 'no records gathered', _scr: true, targets: u.targets.length, good: u.targets.filter(t => (t.fit_score || 0) >= 65).length, top: u.targets.slice().sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0))[0]?.company || '', topId: u.targets[0]?.id, signal: 'Pull records' }));
  // Platform HQ / operating counties with no gathered records → explicit next pulls.
  const missingHq = PORTCO_COUNTIES.filter(h => !rows.some(r => r.state === h.state && r.county === h.county));
  missingHq.forEach(h => rows.push({ id: `${h.state}|${h.county}|hq`, _list: [], platform: HP[h.p].label, _p: h.p, county: h.county, state: h.state, hq: `${HP[h.p].label}: ${h.why}`, res: null, resPerMo: null, medPrice: null, nonres: null, nonresPerMo: null, window: 'no records gathered', _scr: false, targets: 0, good: 0, top: '', topId: null, signal: 'Pull records' }));
  const totRes = counties.reduce((s, c) => s + c.res, 0), totNon = counties.reduce((s, c) => s + c.nonres, 0);
  const ppT = b.targets.filter(t => t._p === 'pp'); const ppCovered = counties.filter(c => c.p === 'pp').reduce((s, c) => s + c.targets.length, 0);
  const gaps = rows.filter(r => r.signal === 'Sourcing gap').sort((x, y) => (y.resPerMo || y.nonresPerMo || 0) - (x.resPerMo || x.nonresPerMo || 0));
  const dens = rows.filter(r => r.signal === 'Density play').sort((x, y) => y.good - x.good);
  const pulls = rows.filter(r => r.signal === 'Pull records').sort((x, y) => (y.hq ? 1 : 0) - (x.hq ? 1 : 0) || y.targets - x.targets);
  const hqRows = rows.filter(r => r.hq && r.res);
  const coveredCos = [...new Set(hqRows.map(r => r._p))], missingCos = [...new Set(Object.keys(HP).filter(p => !coveredCos.includes(p)))];
  const SIG = { 'Density play': 'var(--sys-good)', 'Sourcing gap': 'var(--sys-warn)', 'Targets, lower turnover': 'var(--sys-info)', Monitor: 'var(--sys-mute-2)', 'Pull records': 'var(--sys-bad)', 'HQ market': 'var(--sys-violet)' };
  const srcs = [...new Map(cov.filter(c => c.source_url).map(c => [c.source_url, c])).values()].slice(0, 7);
  const hqTxt = hqRows.filter(r => r.medPrice).sort((x, y) => (y.medPrice || 0) - (x.medPrice || 0)).map(r => `${esc(cname(r))} (${esc(r.platform)}) ${fmt.money(r.medPrice)}, ${fmt.num(r.resPerMo, 0)}/mo`).join('; ');
  host.innerHTML = ui.panel({
    title: TITLE, accent: true,
    sub: `${fmt.num(totRes)} home sales and ${fmt.num(totNon)} commercial/industrial transfers across ${counties.length} counties served by ${Object.keys(HP).filter(p => counties.some(c => c.p === p)).length} portfolio companies`,
    body: `<div class="h-note">${ppT.length ? `${fmt.num(ppCovered)} of ${fmt.num(ppT.length)} Punctual Pros targets are headquartered in a county with gathered home-sales records. ` : ''}Home turnover (sales per month) is a leading indicator of replacement, repair and new-mover demand. ${dens.length ? `Density plays, meaning high turnover plus Tier 1–2 targets, are strongest in ${dens.slice(0, 3).map(r => esc(cname(r))).join(', ')}.` : ''} ${gaps.length ? `Sourcing gaps, meaning high turnover with no screened target, are ${gaps.slice(0, 3).map(r => esc(cname(r))).join(', ')}: extend the screen there.` : ''} ${hqTxt ? `Portfolio home markets (median home price, sales per month): ${hqTxt}.` : ''} ${missingCos.length ? `No home-sales records yet for ${andList(missingCos.map(p => esc(HP[p].label)))}${missingCos.includes('cet') ? ' (CET pulls hold commercial/industrial transfers only)' : ''}.` : ''} ${pulls.length ? `${pulls.length} counties have no records yet (${pulls.slice(0, 4).map(r => esc(cname(r))).join(', ')}${pulls.length > 4 ? ', …' : ''}), so pull them next.` : ''} <span class="sys-est sys-est--illus analyst">analyst view</span></div><div id="ma-house-tbl"></div>`,
    foot: `${srcs.map(c => ui.source(`${c.county} ${c.state}: ${layerLabel(c.source)}`, c.source_url, c.date_to)).join('')}<span class="src">CET counties are matched to the nearest county centroid within 45 km (approximate). Records hold each parcel’s last sale. BPI and Fair Harbor rows are HQ-market context (no add-on screen yet).</span>`,
  });
  ctx.ui.table(host.querySelector('#ma-house-tbl'), {
    rows, pageSize: 15, sortKey: 'targets', exportName: 'ma_county_home_sales_vs_targets',
    columns: [
      { key: 'platform', label: 'Portfolio co.', fmt: (v, r) => fmt.chip(v, HP[r._p].color) },
      { key: 'county', label: 'County', fmt: (v, r) => `<b>${esc(v)}</b>, ${esc(r.state)}${r.hq ? ` <span class="sys-chip sys-chip--soft chip" data-co="" style="--co:${HP[r._p].color}" title="${esc(r.hq)}">HQ/ops</span>` : ''}` },
      { key: 'signal', label: 'Signal', fmt: v => fmt.chip(v, SIG[v]) },
      { key: 'resPerMo', label: 'Home sales / mo', num: true, fmt: (v, r) => v == null || !r.res ? '—' : fmt.num(v, 0) },
      { key: 'res', label: 'Home sales', num: true, fmt: v => v ? fmt.num(v) : '—' },
      { key: 'medPrice', label: 'Median price', num: true, fmt: v => fmt.money(v) },
      { key: 'nonresPerMo', label: 'Comm./ind. / mo', num: true, fmt: v => v == null ? '—' : fmt.num(v, 1) },
      { key: 'targets', label: 'Targets', num: true, fmt: (v, r) => r._scr ? fmt.num(v) : '<span class="dim" title="No add-on screen for this portfolio company yet">n/a</span>' },
      { key: 'good', label: 'T1–2', num: true, fmt: (v, r) => r._scr ? fmt.num(v) : '<span class="dim">n/a</span>' },
      { key: 'top', label: 'Top target', fmt: v => `<span class="small">${esc(clip(v, 30)) || '—'}</span>` },
      { key: 'window', label: 'Window', fmt: v => `<span class="small">${esc(v)}</span>` },
      { key: 'hq', label: 'Portfolio presence', fmt: v => v ? `<span class="small dim">${esc(clip(v, 44))}</span>` : '—' },
    ],
    onRow: r => ctx.inspector.open({ title: `${esc(r.county)}${/n\/a|District|City$/.test(r.county) ? '' : ' County'}, ${esc(r.state)}`, sub: `${esc(r.platform)} demand signal · ${esc(r.signal)}`, color: HP[r._p].color,
      sections: [
        { label: 'Transfers', html: ui.kv({ 'Home sales': r.res ? `${fmt.num(r.res)} (${fmt.num(r.resPerMo, 0)}/mo)` : r.nonres ? 'not in this pull (commercial/industrial only)' : 'not gathered', 'Median home price': r.medPrice ? `${fmt.moneyFull(r.medPrice)} <span class="dim small">arms-length, ≥$10K</span>` : null, 'Comm./ind. transfers': r.nonres != null ? `${fmt.num(r.nonres)} (${fmt.num(r.nonresPerMo, 1)}/mo)` : null, Window: esc(r.window), 'Portfolio presence': r.hq ? esc(r.hq) : null }) },
        rel[r._p] && r.signal === 'HQ market' ? { label: 'Why it matters', html: `<div class="small text-2">${esc(rel[r._p])}</div>` } : null,
        r._scr ? { label: 'Screened targets in county', html: `<div class="col gap-4 small">${(r._list || []).slice().sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0)).map(t => `<span>${fmt.score(t.fit_score)} ${esc(t.company)}</span>`).join('') || '<span class="dim">None screened. Extend the ZoomInfo radius pass to this county.</span>'}</div>` } : null,
        { label: 'Sources', html: `<div class="col gap-4 small">${cov.filter(c => c.county === r.county && c.state === r.state).map(c => `${c.source_url ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener">${esc(c.source ? layerLabel(c.source) : 'County records')}</a>` : esc(layerLabel(c.source))} <span class="dim">${esc(dayWords(c.date_from))} to ${esc(dayWords(c.date_to))}</span>`).join('') || '<span class="dim">No county records gathered yet</span>'}</div>` },
        { label: 'Next action', html: `<div class="small text-2">${esc(r.signal === 'Pull records' ? `Gather county deed/assessor sales for ${cname(r)} (same method as the PA/NJ/MA/DC/NYC pulls) so ${r.platform} can be read against local housing turnover.` : r.signal === 'HQ market' ? `Use as ${r.platform}’s home-market context (cost-of-living and customer affluence); refresh with each quarterly pull.` : r.signal === 'Sourcing gap' ? 'High turnover and no screened target: run a ZoomInfo radius pass plus franchise-directory check for this county.' : r.signal === 'Density play' ? 'Prioritise outreach to the Tier 1–2 targets here; overlay PP new-mover marketing once acquired.' : 'Keep on watch; re-rank when the next sales pull lands.')}</div>` },
      ].filter(Boolean) }),
  });
}

/* ═══ View 4: Rival companies ═════════════════════════════════════════════ */
async function rivalsView(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  if (!b.rivals) { el.innerHTML = `<div class="m-ma">${ui.pageHead({ title: 'Rival companies', sub: 'PE-backed and strategic competitors for the same add-ons' })}${ui.note('Research dataset Competitor filings is not yet available.', 'warn')}</div>`; return; }
  const all = b.rivalRows; const m = b.rivals.meta || {};
  const sel = Object.keys(OVERLAP).includes(params.o) ? params.o : 'all';
  const rows = all.filter(r => sel === 'all' || r.overlapList.includes(sel));
  const stressed = all.filter(r => r.signal === 'Stressed'), refi = all.filter(r => r.signal === 'Refi due');
  const peN = all.filter(r => r.type === 'PE-backed').length, pubN = all.filter(r => r.type === 'Public strategic').length;
  const ppR = all.filter(r => r.overlapList.includes('punctual_pros')).length;
  const heat = b.pe?.meta?.sector_heatmap || {};
  const peName = id => (b.pe?.items || []).find(f => f.id === id)?.firm || titleCase(id);
  const targetNames = b.targets.map(t => String(t.company).toLowerCase());
  all.forEach(r => { const w = r.name.toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z0-9&]+/).map(x => x.replace(/[^a-z0-9]/g, '')).filter(x => x.length > 1).slice(0, 2); const re = w.length === 2 ? new RegExp(`\\b${w[0].replace(/[^a-z0-9]/g, '')}\\b.*\\b${w[1].replace(/[^a-z0-9]/g, '')}\\b`) : null; r.alsoTarget = !!re && targetNames.some(n => re.test(n)); });
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: 'Rival companies',
    sub: `<b>${stressed.length} of ${all.length} rivals show credit stress and ${refi.length} face debt maturing by 2027.</b> Stressed rivals sell rather than bid; the healthy consolidators set add-on prices.`,
    chips: `${fmt.chip('Marks: one lender’s slice', 'var(--sys-warn)')}${fmt.chip('Estimates labelled est.')}`,
    actions: `<a class="sys-btn sys-btn--secondary btn" href="#/pe">Private equity →</a><a class="sys-btn sys-btn--secondary btn" href="#/fin/methods">Methods and gaps</a>`,
  }) +
  ui.kpis([
    { label: 'Rival companies', value: fmt.num(all.length), sub: `${fmt.num(b.rivals.items?.length)} filings parsed`, color: 'var(--sys-bad)' },
    { label: 'PE-backed', value: fmt.num(peN), sub: `${pubN} public strategics · ${all.length - peN - pubN} private/other`, color: 'var(--c-pe)' },
    { label: 'Credit stress', value: fmt.num(stressed.length), sub: esc(stressed.slice(0, 3).map(r => r.name).join(', ') || '—'), color: 'var(--sys-bad)' },
    { label: 'Refi due ≤2027', value: fmt.num(refi.length), sub: esc(refi.map(r => r.name).slice(0, 2).join(', ') || '—'), color: 'var(--sys-warn)' },
    { label: 'Competing with PP', value: fmt.num(ppR), sub: 'most contested BSP portfolio company', color: 'var(--co-pp)' },
    { label: 'Also on a BSP target list', value: fmt.num(all.filter(r => r.alsoTarget).length), sub: esc(all.filter(r => r.alsoTarget).map(r => r.name).join(', ') || '—'), color: 'var(--sys-good)' },
  ]) +
  `<div class="sys-filters ma-seg-row mt-12"><span class="sys-field-label lbl">Competes with</span><div id="ma-rseg"></div></div>
  <div id="ma-rtbl"></div>
  <div class="sys-src src-line mt-8">Sources: SEC EDGAR BDC schedules of investments (10-Q/10-K, N-PORT), issuer 10-Ks, Form D and SBA PPP FOIA (Competitor filings, ${esc(fmt.num(b.rivals.items?.length))} filings) · estimates labelled est. · generated ${esc(m.generated || '—')}</div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Competitive intensity by sector', sub: 'Private-equity heat map: most active sponsors per BSP company sector. Click a row for detail.', body: `<div class="intens" id="ma-heatrows"></div>`, foot: ui.source('Private-equity landscape: sector heatmap', null, b.pe?.meta?.generated) })}
    ${ui.panel({ title: 'What the filings say', sub: 'Synthesis by the research team (competitor filings)', body: `<div class="fp">${(Array.isArray(m.financial_picture) ? m.financial_picture : [m.financial_picture]).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</div><div class="sys-card-label th-h">How rival figures are built</div><ul class="bul"><li><b>Lender filings.</b> Funds that lend to rivals list each loan, its size, its rate and what they think it is worth, which shows debt, stress and when it falls due.</li><li><b>Loan records.</b> Payroll in pandemic-era loan records, divided by the share of revenue spent on labour, gives a revenue range.</li><li><b>Annual reports.</b> Listed rivals report revenue, profit and headcount.</li><li><b>Headcount.</b> For private rivals, staff × typical revenue per employee, with the range stated. Each estimate carries its confidence; open a rival to see the working.</li></ul><div class="sys-card-label th-h">Where to look next</div><ul class="bul">${(m.next_pulls || []).slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, scroll: true, foot: ui.source('SEC EDGAR (BDC 10-Q/10-K, N-PORT, 10-K, Form D), SBA PPP FOIA', 'https://efts.sec.gov/LATEST/search-index', m.generated) })}
  </div></div>`;
  ui.seg(el.querySelector('#ma-rseg'), [{ value: 'all', label: `All (${all.length})` }, ...Object.entries(OVERLAP).map(([k, o]) => ({ value: k, label: `${o.label} (${all.filter(r => r.overlapList.includes(k)).length})` }))], sel, v => app.go('ma', 'rivals', v === 'all' ? undefined : { o: v }));
  const columns = [
    { key: 'name', label: 'Rival', fmt: (v, r) => `<b>${esc(v)}</b>${r.alsoTarget ? ` ${fmt.chip('also a target', 'var(--sys-good)')}` : ''}<div class="small"><span class="sys-dot" style="--co:${r.type === 'PE-backed' ? 'var(--c-pe)' : r.type === 'Public strategic' ? 'var(--sys-info)' : 'var(--sys-mute)'}" aria-hidden="true"></span> ${esc(r.type)} <span class="dim">· ${esc(clip(r.owner, 38))}</span></div>` },
    { key: 'overlapList', label: 'Overlap', sort: (a, c) => a.overlapList.length - c.overlapList.length, fmt: v => v.map(o => fmt.chip(OVERLAP[o]?.label || o, OVERLAP[o]?.color)).join(' ') },
    { key: 'signal', label: 'Credit signal', fmt: v => fmt.chip(v, SIGNAL_COLOR[v]) },
    { key: '_scale', label: 'Revenue', num: true, fmt: (v, r) => r.rev ? `${fmt.money(r.rev)} <span class="dim small">FY${r.revFy}</span>` : r.estRev ? `<span title="${esc(r.estRev.basis)}">${esc(r.estRev.estimate)} <span class="dim small">est.</span></span>` : r.scaleTxt ? `<span class="dim small">${esc(r.scaleTxt)} staff</span>` : '—' },
    { key: 'margin', label: 'Op. margin', num: true, fmt: (v, r) => v != null ? `<span title="${esc(r.marginNote)}">${pctTxt(fmt, v)}</span>` : r.estEbitda ? `<span class="small" title="${esc(r.estEbitda.basis)}">EBITDA ${esc(r.estEbitda.estimate)} est.</span>` : '—' },
    { key: 'maxPar', label: 'Largest visible loan', num: true, fmt: (v, r) => v ? fmt.money(v) : r.ltd ? `${fmt.money(r.ltd)} <span class="dim small">LTD</span>` : '—' },
    { key: 'minMark', label: 'Lender mark', num: true, fmt: (v, r) => v == null ? '—' : `<span style="color:${v < 95 ? 'var(--sys-bad-ink)' : v < 98 ? 'var(--sys-warn-ink)' : 'var(--sys-good-ink)'}">${fmt.num(v, 1)}</span>${r.maxMark != null && r.maxMark !== v ? `<span class="dim small">–${fmt.num(r.maxMark, 1)}</span>` : ''}` },
    { key: 'maturity', label: 'Pricing · maturity', fmt: (v, r) => r.spread || v ? `<span class="small num" title="${esc(r.spread || '')}">${r.spread ? esc(shortSpread(r.spread)) + (v ? ' · ' : '') : ''}${v ? esc(String(v).slice(0, 7)) : ''}</span>${r.pik ? ` ${fmt.chip('PIK', 'var(--sys-bad)')}` : ''}` : '—' },
    { key: 'ev', label: 'Valuation', num: true, fmt: (v, r) => v ? `${fmt.money(v)} <span class="dim small">EV</span>` : r.price ? `${fmt.money(r.price)} <span class="dim small">deal est.</span>` : '—' },
    { key: 'n', label: 'Filings', num: true, fmt: (v, r) => `${fmt.num(v)} <span class="dim small">${esc(String(r.latest || '').slice(0, 7))}</span>` },
  ];
  const tbl = ui.table(el.querySelector('#ma-rtbl'), { columns, rows, pageSize: 30, sortKey: 'n', exportName: 'ma_rival_companies', onRow: r => openRival(ctx, b, r, peName) });
  // Intensity rows
  const heatRows = Object.entries(heat).map(([k, h]) => ({ k, h, o: OVERLAP[k] }));
  el.querySelector('#ma-heatrows').innerHTML = heatRows.map(({ k, h, o }) => `<div class="r" data-k="${esc(k)}"><div><div class="co"><span class="sys-dot" style="--co:${o?.color || 'var(--sys-mute)'}" aria-hidden="true"></span> ${esc(o?.label || titleCase(k))}</div><div class="soft">${all.filter(r => r.overlapList.includes(k)).length} rivals in filings</div></div><div>${fmt.chip(h.intensity, INTENSITY_COLOR(h.intensity))}</div><div><div class="nt">${esc(h.note || '')}</div><div class="sp">Most active: ${esc((h.most_active || []).map(peName).slice(0, 6).join(', '))}</div></div></div>`).join('') || ui.empty('Sector heat map not available');
  el.querySelectorAll('#ma-heatrows .r').forEach(n => n.onclick = () => { const h = heat[n.dataset.k]; const firms = (h.most_active || []).map(id => (b.pe?.items || []).find(f => f.id === id)).filter(Boolean);
    ctx.inspector.open({ title: esc(OVERLAP[n.dataset.k]?.label || titleCase(n.dataset.k)), sub: `${esc(h.sector)} · intensity ${esc(h.intensity)}`, color: OVERLAP[n.dataset.k]?.color,
      sections: [{ label: 'Read-out', html: `<div class="small text-2">${esc(h.note || '')}</div>` }, { label: `Most active sponsors (${firms.length})`, html: `<div class="m-ma-insp">${firms.map(f => `<div class="it"><div class="t">${esc(f.firm)} ${fmt.chip(`threat ${f.threat_level}`, f.threat_level === 'high' ? 'var(--sys-bad)' : f.threat_level === 'medium' ? 'var(--sys-warn)' : 'var(--sys-mute-2)')}</div><div class="w">${esc(clip(f.threat_rationale || f.strategy || '', 220))}</div>${f.website ? `<div class="kf"><a href="${esc(f.website)}" target="_blank" rel="noopener">${esc(fmt.host(f.website))}</a></div>` : ''}</div>`).join('')}</div>` },
        { label: 'Next action', html: `<div class="small text-2">Review sponsor deal flow in the Private equity module; flag any target in this sector that a listed sponsor has approached.</div>` }],
      actions: [{ id: 'pe', label: 'Open Private equity', onClick: () => app.go('pe') }] }); });
  app.index(all.map(r => ({ label: r.name, sub: `Rival company · ${r.owner}`, href: `#/ma/rivals?r=${r.id}`, kind: 'Rival', color: 'var(--sys-bad)' })));
  if (params.r) { const r = all.find(x => x.id === params.r); if (r) { tbl.select(r.id); openRival(ctx, b, r, peName); } }
}
/* A rival has no model preset, so "Model this deal" is a scenario link written with deal-lib's encode(): the typical
   lower-middle-market deal with this rival's own figures laid over it (revenue, margin, price multiple and debt where the
   filings give them; the model's market defaults where they do not). `for` names the rival on the model page. */
function rivalScenario(b, r) {
  const dm = b.dm, typ = (dm?.items || []).find(i => i.kind === 'preset' && i.id === 'typical');
  if (!typ) return null;
  const base = { ...dm.meta.base, ...typ.inputs }, lim = Object.fromEntries((dm.meta.inputs || []).map(i => [i.key, i]));
  const secP = r.overlapList.map(o => OVERLAP[o]?.p).find(Boolean), sec = secP ? dmSector(b, secP) : null;
  const revEst = r.rev ? r.rev / 1e6 : r.estRev ? parseRange(r.estRev.estimate) / 1e6 : null;
  const ebEst = r.estEbitda ? parseRange(r.estEbitda.estimate) / 1e6 : null;
  const why = {}; let rev = revEst, mg;
  if (rev && ebEst) { mg = ebEst / rev * 100; why.mg = 'EBITDA estimate divided by revenue'; }
  else if (rev && r.type === 'Public strategic' && r.margin > 0) { mg = r.margin; why.mg = `${r.marginNote || 'operating margin'}, reported (EBITDA runs a little higher)`; }
  else if (rev) { mg = sec ? sec.margin_pct : base.mg; why.mg = sec ? `the model’s ${sec.label.toLowerCase()} margin` : 'the typical deal margin'; }
  else if (ebEst) { mg = sec ? sec.margin_pct : base.mg; rev = ebEst / (mg / 100); why.rev = `backed out of the EBITDA estimate at a ${mg}% margin`; }
  else return { none: 'The filings give no revenue or EBITDA figure to build a model on yet.' };
  if (rev > lim.rev.max) return { none: 'Too large for this model (revenue above $5B); use it as a price benchmark instead.' };
  const e = rev * mg / 100;
  let em = typ.inputs.em; why.em = 'the average buyout multiple (GF Data)';
  if (r.ev && e > 0) { em = r.ev / 1e6 / e; why.em = 'disclosed enterprise value divided by EBITDA'; }
  else if (r.price && e > 0) { em = r.price / 1e6 / e; why.em = 'estimated deal price divided by EBITDA'; }
  const debt = r.maxPar != null ? r.maxPar : r.ltd;
  let lev = typ.inputs.lev; why.lev = 'typical deal debt (GF Data range)';
  if (debt != null && e > 0) { lev = debt / 1e6 / e; why.lev = r.maxPar != null ? 'largest visible loan divided by EBITDA (one lender’s share, so a floor)' : 'reported long-term debt divided by EBITDA'; }
  const clampK = (k, x) => Math.min(lim[k].max, Math.max(lim[k].min, x));
  const vals = { ...typ.inputs, rev: Math.round(clampK('rev', rev) * 10) / 10, mg: Math.round(clampK('mg', mg) * 10) / 10, em: Math.round(clampK('em', em) * 10) / 10, lev: Math.round(clampK('lev', lev) * 100) / 100 };
  vals.nd = Math.round(vals.rev * vals.mg / 100 * vals.lev * 10) / 10;
  const hash = `#/deal/returns?${DL.encode({ preset: 'typical', vals }, typ.inputs)}&for=${encodeURIComponent(r.name)}`;
  return { vals, hash, why, S: DL.dealSummary(vals), revSrc: r.rev ? `reported for FY${r.revFy}` : r.estRev ? 'analyst estimate' : null };
}
/** How a rival's figures were built: the analyst estimates with their basis and confidence, the reported and lender figures, then the model inputs. */
function rivalHowHtml(ctx, b, r, M) {
  const { esc, fmt } = ctx; const m = b.rivals?.meta || {};
  const rows = [];
  if (r.rev) rows.push({ k: `Revenue, FY${r.revFy}`, v: fmt.money(r.rev), how: 'Reported in the company’s annual report (SEC filing).', conf: 'high' });
  if (r.margin != null) rows.push({ k: 'Operating margin', v: pctTxt(fmt, r.margin), how: `${esc(r.marginNote || 'Reported')}, from the filings.`, conf: r.type === 'Public strategic' ? 'high' : 'medium' });
  for (const e of r.estRows || []) rows.push({ k: Copy.text(e.metric).replace(new RegExp(`^${(r.est || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '').replace(/^./, c => c.toUpperCase()) || e.metric, v: `${esc(e.estimate)}${Copy.EST}`, how: esc(Copy.text(e.basis)), conf: e.confidence });
  if (r.maxPar) rows.push({ k: 'Largest visible loan', v: fmt.money(r.maxPar), how: `From lender filings (fund schedules of investments)${r.minMark != null ? `; lenders value it at ${fmt.num(r.minMark, 1)}% of face value` : ''}${r.spread ? `; priced at ${esc(Copy.credit(String(r.spread)))}` : ''}${r.maturity ? `; due ${esc(dayWords(r.maturity))}` : ''}. One lender’s share, so total debt is at least this.`, conf: 'high' });
  if (M?.vals) rows.push({ k: 'Model inputs', v: `${money$M(fmt, M.vals.rev)} revenue · ${fmt.num(M.vals.mg, 1)}% margin${Copy.EST}`, how: `Revenue ${esc(M.why.rev || M.revSrc || 'from the estimate above')}; margin from ${esc(M.why.mg)}; price at ${mult1(M.vals.em)} from ${esc(M.why.em)}; debt at ${mult1(M.vals.lev)} from ${esc(M.why.lev)}. At these inputs the price is ${money$M(fmt, M.S.price)} and the equity check ${money$M(fmt, M.S.equity)}.`, conf: 'low' });
  if (!rows.length) return '';
  return `<details class="ma-how"><summary>How we estimated this</summary>
    <ol class="ma-how-steps">${rows.map(x => `<li><div class="ma-how-h"><span class="ma-how-k">${esc(x.k)}</span><span class="ma-how-v">${x.v}</span>${confChip(esc, x.conf)}</div><div class="ma-how-t">${x.how}</div></li>`).join('')}</ol>
    <div class="ma-how-foot">Latest filing ${esc(dayWords(r.latest))}; rival research as of ${esc(dayWords(m.generated))}. Methods: lender schedules of investments and fund holdings, loan records, annual reports and company headcount × revenue per employee. ${esc(CONF_RULE)} <a href="#/fin/rivals">Rival filings</a> · <a href="#/fin/methods">Methods and data gaps →</a></div>
  </details>`;
}
function openRival(ctx, b, r, peName) {
  const { ui, fmt, esc, inspector, app } = ctx;
  const pe = r.pe ? (b.pe?.items || []).find(f => f.id === r.pe) : null;
  const M = rivalScenario(b, r);
  const kfHtml = (kf, prefix) => Object.entries(kf || {}).filter(([k]) => !prefix || k.startsWith(prefix + '_')).slice(0, 12).map(([k, v]) => `${esc(Copy.field(prefix ? k.slice(prefix.length + 1) : k))}: ${esc(typeof v === 'number' ? v.toLocaleString('en-US') : Array.isArray(v) ? v.join(', ') : Copy.text(v))}`).join(' · ');
  inspector.open({
    title: esc(r.name), color: 'var(--sys-bad)', sub: `${esc(r.owner)} · ${esc(r.type)} · ${esc(r.signal)}`,
    sections: [
      { label: 'At a glance', html: ui.kv({ 'Competes with': r.overlapList.map(o => OVERLAP[o]?.label || o), Revenue: r.rev ? `${fmt.money(r.rev)} (FY${r.revFy}, reported)` : r.estRev ? `${esc(r.estRev.estimate)} est. <span class="dim small">${esc(r.estRev.basis)}</span>` : null, 'Operating margin': r.margin != null ? `${pctTxt(fmt, r.margin)} <span class="dim small">${esc(r.marginNote)}</span>` : null, 'EBITDA (est.)': r.estEbitda ? `${esc(r.estEbitda.estimate)} <span class="dim small">${esc(r.estEbitda.basis)}</span>` : null, 'Largest visible loan': r.maxPar ? fmt.money(r.maxPar) : null, 'Long-term debt': r.ltd ? fmt.money(r.ltd) : null, 'Lender marks': r.minMark != null ? `${fmt.num(r.minMark, 1)}${r.maxMark !== r.minMark ? `–${fmt.num(r.maxMark, 1)}` : ''} (% of par)` : null, Pricing: r.spread ? esc(r.spread) + (r.pik ? ' · PIK' : '') : null, 'Earliest maturity': r.maturity ? esc(r.maturity) : null, Valuation: r.ev ? `${fmt.money(r.ev)} EV` : r.price ? `${fmt.money(r.price)} deal est.` : null }) },
      { label: 'Deal math', html: `<div class="m-ma-insp ma-dealsec">${M?.vals ? ui.kv({ 'Revenue': `${money$M(fmt, M.vals.rev)}${Copy.EST} <span class="dim small">${esc(M.why.rev || M.revSrc || '')}</span>`, 'EBITDA': `${money$M(fmt, M.S.ebitda)}${Copy.EST} <span class="dim small">${fmt.num(M.vals.mg, 1)}% margin</span>`, 'Price': `${money$M(fmt, M.S.price)}${Copy.EST} <span class="dim small">at ${mult1(M.vals.em)}</span>`, 'Debt and equity': `${money$M(fmt, M.S.debt)} debt${Copy.EST} <span class="dim small">${mult1(M.vals.lev)} EBITDA</span> · ${money$M(fmt, M.S.equity)} equity${Copy.EST}` }) : `<div class="small text-2">${esc(M?.none || 'The acquisition model’s assumptions are not loaded.')}</div>`}${rivalHowHtml(ctx, b, r, M)}${M?.hash ? `<div class="ma-deal-ft"><a class="sys-btn sys-btn--primary sys-btn--sm" href="${esc(M.hash)}">Model this deal →</a></div>` : ''}</div>` },
      pe ? { label: `Sponsor · ${pe.firm}`, html: `<div class="small text-2">${esc(clip(pe.threat_rationale || pe.strategy || '', 300))}</div><div class="mt-8">${fmt.chip(`threat ${pe.threat_level}`, pe.threat_level === 'high' ? 'var(--sys-bad)' : 'var(--sys-warn)')} ${fmt.chip(`competes for ${pe.competes_for}`)}</div>` } : null,
      { label: `Filings (${r.items.length})`, html: `<div class="m-ma-insp">${r.items.map(({ it, multi }) => `<div class="it"><div class="t">${esc(Copy.text(it.title))}</div><div class="d">${esc(it.filed_or_dated)} · ${esc(Copy.text(it.filer_or_source_agency || ''))} · ${esc(Copy.category(it.category))} · conf. ${esc(it.confidence)}</div><div class="w">${esc(Copy.text(it.what_it_tells_us || ''))}</div><div class="kf">${kfHtml(it.key_figures, multi ? r.prefix : null)}</div>${it.source_url ? `<div class="kf"><a href="${esc(it.source_url)}" target="_blank" rel="noopener">${esc(fmt.host(it.source_url) || 'source')} ↗</a></div>` : ''}</div>`).join('')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${esc(r.signal === 'Stressed' ? 'Likely seller rather than bidder: map its branches in BSP portfolio company counties and approach its lenders or sponsor about carve-outs of non-core regions.' : r.signal === 'Refi due' ? 'Refinancing due soon: watch for a sale process or asset disposals; prepare a carve-out bid for overlapping branches.' : r.type === 'Public strategic' ? 'Use as a margin/scale benchmark and a potential exit buyer; track its M&A for price discovery.' : r.alsoTarget ? 'Also on a BSP target list: treat as a possible acquisition, not only a competitor.' : 'Well-financed bidder: avoid auctions it will contest; win proprietary deals on speed and operating credibility.')}</div>` },
    ].filter(Boolean),
    actions: [M?.hash ? { id: 'model', label: 'Model this deal', onClick: () => { location.hash = M.hash; } } : null, { id: 'pe', label: 'Private equity', onClick: () => app.go('pe') }].filter(Boolean),
  });
}

/* ═══ View 5: Valuation benchmarks ════════════════════════════════════════ */
const SECTOR_LABEL = { residential_home_services: 'Residential home services', commercial_electrical_energy: 'Commercial electrical & energy', legal_bpo_managed_services: 'Legal / BPO / managed services', lab_distribution: 'Lab supply distribution', communications_agencies: 'Communications agencies', apparel_dtc: 'Apparel / DTC' };
async function valuation(ctx) {
  const { el, ui, fmt, esc, charts } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  const c = b.comps; const sb = c?.meta?.sector_benchmarks || {};
  const secRows = Object.entries(sb).map(([k, s]) => ({ id: k, sector: SECTOR_LABEL[k] || titleCase(k), bsp: s.bsp_company, n: s.n, comps: (s.comps || []).join(', '), growth: s.median_revenue_growth_latest_pct, cagr: s.median_revenue_cagr_2023_latest_pct, om: s.median_operating_margin_latest_pct, omAvg: s.median_operating_margin_multiyear_avg_pct, em: s.median_ebitda_margin_latest_pct, rpe: s.median_revenue_per_employee_usd, implies: s.what_this_implies_for_bsp }));
  const hiM = secRows.slice().sort((x, y) => (y.em ?? -99) - (x.em ?? -99))[0], hiG = secRows.slice().sort((x, y) => (y.cagr ?? -99) - (x.cagr ?? -99))[0];
  const evs = b.rivalRows.filter(r => r.ev).sort((x, y) => y.ev - x.ev);
  const flRaw = b.flts?.meta?.frontline?.platform_context?.stated_criteria;
  const flCrit = flRaw ? (/Naidoo/.test(flRaw) ? String(flRaw).replace(/^[^:]*Naidoo[^:]*:\s*/, '') : flRaw) : null;
  /* Default add-on EBITDA per benchmark sector = median screened target revenue (ZoomInfo est.) for the BSP platform in that sector
     × an assumed LMM EBITDA margin of 10% (capped at the sector's public median). ≈ $0.7M Punctual Pros, $1.5M CET. */
  const LMM_MARGIN = 10;
  const defEbitda = id => { const p = PKEYS.find(k => PLAT[k].bench === id); const s = secRows.find(r => r.id === id); const rev = p ? median(b.targets.filter(t => t._p === p).map(t => t.revenue_est_usd)) : null; const mg = Math.min(LMM_MARGIN, s?.em > 0 ? s.em : LMM_MARGIN); return rev ? { v: Math.max(0.1, Math.round((rev * mg / 100) / 1e5) / 10), p, rev, mg } : { v: 1, p: null, rev: null, mg }; };
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: 'Valuation benchmarks',
    sub: c ? `<b>BSP’s edge is multiple arbitrage:</b> buy small add-ons at lower-middle-market prices and sell the combined company nearer scaled-sponsor prices. Use the calculator to size a deal.` : 'Public comparables dataset is not yet available.',
    chips: `${fmt.chip('SEC XBRL, FY2023–FY2025', 'var(--sys-info)')}${fmt.chip('EBITDA not adjusted', 'var(--sys-warn)')}${fmt.chip('LMM 5–9x assumed', 'var(--c-ma)')}`,
  }) + (c ? '' : ui.note('Research dataset Public comparables is not yet available; the calculator still works.', 'warn') + '<div class="mt-12"></div>') +
  ui.kpis([
    { label: 'Public comps', value: fmt.num(c?.items?.length), sub: `${secRows.length} sectors · 10-K / 20-F`, color: 'var(--sys-info)' },
    { label: 'Richest margins', value: pctTxt(fmt, hiM?.em), sub: `${esc(hiM?.sector || '—')} · median EBITDA margin`, color: 'var(--sys-good)' },
    { label: 'Fastest growth', value: pctTxt(fmt, hiG?.cagr), sub: `${esc(hiG?.sector || '—')} · 3-yr CAGR`, color: 'var(--co-cet)' },
    { label: 'LMM entry band', value: '5–9x', sub: 'EBITDA, private add-ons (assumed)', color: 'var(--c-ma)' },
    { label: 'Largest rival valuation', value: evs[0] ? fmt.money(evs[0].ev) : '—', sub: evs[0] ? `${esc(evs[0].name)} EV (disclosed)` : 'none disclosed', color: 'var(--sys-bad)' },
  ]) +
  `<div class="grid grid-main mt-12">
    <div class="col gap-12">${ui.panel({ title: 'Sector medians by BSP portfolio company', sub: 'Click a row for what it implies for the BSP company', body: `<div id="ma-sec"></div>`, flush: false, foot: ui.source('SEC EDGAR XBRL company facts (public comparables, sector benchmarks)', 'https://www.sec.gov/edgar/search/', c?.meta?.generated) })}
    ${ui.panel({ title: 'Margin vs growth regime by sector', sub: 'Median EBITDA margin (latest FY) and median revenue CAGR FY2023 → latest', body: `<div class="th-two"><div><div class="sys-card-label th-h">EBITDA margin</div>${charts.hbar(secRows.map(s => ({ label: s.sector, value: s.em, color: s.em < 0 ? 'var(--sys-bad)' : 'var(--sys-good)' })).sort((x, y) => y.value - x.value), { labelW: 150, fmt: v => pctTxt(fmt, v) })}</div><div><div class="sys-card-label th-h">Revenue CAGR</div>${charts.hbar(secRows.map(s => ({ label: s.sector, value: Math.max(0, s.cagr ?? 0), color: 'var(--co-cet)' })).sort((x, y) => y.value - x.value), { labelW: 150, fmt: v => pctTxt(fmt, v) })}</div></div><div class="soft mt-8">Trades (CET, PP) are the growth engine with thin-to-mid margins; lab distribution and agencies are low-growth. ${secRows.some(s => (s.cagr ?? 0) < 0) ? `Negative CAGRs shown as zero: ${esc(secRows.filter(s => (s.cagr ?? 0) < 0).map(s => `${s.sector} ${pctTxt(fmt, s.cagr)}`).join(', '))}.` : ''}</div>`, foot: ui.source('Public comparables', null, c?.meta?.generated) })}</div>
    ${ui.panel({ title: 'Implied value calculator', sub: 'Size an add-on and the value created by rolling it into a company', accent: true, actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn" href="#/deal/rollup?p=typical">Full model →</a>`, body: `<div class="calc">
        <label>Add-on EBITDA ($M)<input type="number" id="c-ebitda" value="1" min="0.1" max="500" step="0.1"><span class="soft" id="c-ebitda-note"></span></label>
        <label>Benchmark sector<select id="c-sector">${secRows.map(s => `<option value="${esc(s.id)}">${esc(s.sector)}</option>`).join('')}</select></label>
        <label>Entry multiple <span class="v" id="c-mult-v">7.0x</span><input type="range" id="c-mult" min="5" max="12" step="0.5" value="7"></label>
        <label>Company exit multiple <span class="v" id="c-exit-v">10.0x</span><input type="range" id="c-exit" min="8" max="14" step="0.5" value="10"></label>
      </div><div class="sys-kpis calc-out" id="c-out"></div><div class="mt-12" id="c-chart"></div>
      ${ui.note('<b>Analyst assumption:</b> private lower-middle-market add-ons typically trade at about 5–9x EBITDA, below public comps and scaled sponsor companies. The exit multiple is illustrative, not a forecast. Implied revenue assumes a 10% LMM EBITDA margin, capped at the sector’s public median (LMM targets rarely reach public margins). The default EBITDA is the BSP portfolio company’s median screened target in that sector.', 'warn')}`, foot: `<span class="src">Illustrative · not investment advice${flCrit ? ` · Frontline tuck-in criteria (Mergermarket; stated under former CEO Naidoo, re-confirm with CEO Tim Britt): ${esc(clip(flCrit, 150))}` : ''}</span>` })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'All public comparables', sub: 'Sortable · click for fiscal-year detail and the 10-K', body: `<div id="ma-comps"></div>`, foot: ui.source('SEC EDGAR XBRL company facts and 10-K / 20-F filings (public comparables)', 'https://www.sec.gov/edgar/search/', c?.meta?.generated) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Implications for BSP', sub: 'Research synthesis of the public comparables', body: `<div class="fp"><p>${esc(c?.meta?.financial_picture || '—')}</p></div>`, scroll: true, foot: ui.source('Public comparables synthesis (research team)', null, c?.meta?.generated) })}
    ${ui.panel({ title: 'Benchmark estimate table', sub: 'Metric · estimate · basis · confidence', body: `<div id="ma-est"></div>`, foot: ui.source('Public comparables estimate table · estimates, not reported figures', null, c?.meta?.generated) })}
  </div></div>`;
  ui.table(el.querySelector('#ma-sec'), { rows: secRows, pageSize: 10, sortKey: 'em', exportName: 'ma_sector_benchmarks', onRow: s => ctx.inspector.open({ title: esc(s.sector), sub: `Benchmarks ${esc(s.bsp || '')} · ${s.n} peers`, color: 'var(--c-ma)', sections: [{ label: 'Medians', html: ui.kv({ 'Revenue growth (latest)': pctTxt(fmt, s.growth), 'Revenue CAGR 2023→latest': pctTxt(fmt, s.cagr), 'Operating margin (latest)': pctTxt(fmt, s.om), 'Operating margin (multi-yr avg)': pctTxt(fmt, s.omAvg), 'EBITDA margin (latest)': pctTxt(fmt, s.em), 'Revenue / employee': fmt.money(s.rpe), Comps: esc(s.comps) }) }, { label: 'What this implies for BSP', html: `<div class="small text-2">${esc(s.implies || '')}</div>` }, { label: 'Next action', html: `<div class="small text-2">Use these medians as the “mature state” in the add-on model; price targets on their own EBITDA at an LMM multiple, not at public multiples.</div>` }] }),
    columns: [
      { key: 'sector', label: 'Sector', fmt: (v, r) => `<b>${esc(v)}</b><div class="dim small">${esc(clip(r.bsp || '', 40))}</div>` },
      { key: 'n', label: 'n', num: true }, { key: 'growth', label: 'Growth', num: true, fmt: v => pctTxt(fmt, v) }, { key: 'cagr', label: 'CAGR', num: true, fmt: v => pctTxt(fmt, v) },
      { key: 'om', label: 'Op. margin', num: true, fmt: v => pctTxt(fmt, v) }, { key: 'em', label: 'EBITDA mgn', num: true, fmt: v => pctTxt(fmt, v) }, { key: 'rpe', label: 'Rev / emp.', num: true, fmt: v => fmt.money(v) },
    ] });
  ui.table(el.querySelector('#ma-comps'), { rows: (c?.items || []).map(x => ({ ...x, _sector: SECTOR_LABEL[x.sector_tag] || x.sector_tag, _rev: (x.fiscal_years || []).slice(-1)[0]?.revenue_usd })), pageSize: 12, sortKey: 'ebitda_margin_latest_pct', exportName: 'ma_public_comps',
    columns: [
      { key: 'ticker', label: 'Ticker', fmt: (v, r) => `<b class="num">${esc(v)}</b><div class="dim small">${esc(clip(r.company, 30))}</div>` }, { key: '_sector', label: 'Sector' }, { key: 'latest_fy', label: 'FY', num: true },
      { key: '_rev', label: 'Revenue', num: true, fmt: v => fmt.money(v) }, { key: 'revenue_growth_latest_pct', label: 'Growth', num: true, fmt: v => pctTxt(fmt, v) }, { key: 'revenue_cagr_2023_latest_pct', label: 'CAGR', num: true, fmt: v => pctTxt(fmt, v) },
      { key: 'operating_margin_latest_pct', label: 'Op. margin', num: true, fmt: v => pctTxt(fmt, v) }, { key: 'ebitda_margin_latest_pct', label: 'EBITDA mgn', num: true, fmt: v => pctTxt(fmt, v) }, { key: 'revenue_per_employee_usd', label: 'Rev / emp.', num: true, fmt: v => fmt.money(v) },
      { key: 'status_note', label: 'Note', wrap: true, fmt: v => `<span class="small dim">${esc(clip(v || '', 90))}</span>` },
    ],
    onRow: x => ctx.inspector.open({ title: `${esc(x.ticker)} · ${esc(x.company)}`, sub: `${esc(SECTOR_LABEL[x.sector_tag] || x.sector_tag)} · benchmarks ${esc(clip(x.benchmarks_bsp || '', 60))}`, color: 'var(--sys-info)',
      sections: [{ label: 'Fiscal years', html: `<div class="sys-table-wrap"><table class="sys-table mini"><thead><tr><th>FY</th><th class="sys-n">Revenue</th><th class="sys-n">Op. mgn</th><th class="sys-n">EBITDA mgn</th><th class="sys-n">Staff</th></tr></thead><tbody>${(x.fiscal_years || []).map(f => `<tr><td>${esc(f.fy)}</td><td class="sys-n">${fmt.money(f.revenue_usd)}</td><td class="sys-n">${pctTxt(fmt, f.operating_margin_pct)}</td><td class="sys-n">${pctTxt(fmt, f.ebitda_margin_pct)}</td><td class="sys-n">${fmt.num(f.employees)}</td></tr>`).join('')}</tbody></table></div>` },
        { label: 'What it tells us', html: `<div class="small text-2">${esc(x.what_it_tells_us || x.status_note || '—')}</div>` },
        { label: 'Sources', html: `<div class="col gap-4 small">${x.tenk_url ? `<a href="${esc(x.tenk_url)}" target="_blank" rel="noopener">${esc(x.tenk_form || '10-K')} filed ${esc(x.tenk_filed || '')} ↗</a>` : ''}${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">XBRL companyfacts ↗</a>` : ''}</div>` },
        { label: 'Next action', html: `<div class="small text-2">Use as a margin and productivity benchmark for ${esc(clip(x.benchmarks_bsp || 'the BSP portfolio company', 60))}.</div>` }],
      actions: x.tenk_url ? [{ label: '10-K ↗', href: x.tenk_url }] : [] }) });
  const est = c?.meta?.estimate_table || [];
  const estEl = el.querySelector('#ma-est');
  if (est.length) ui.table(estEl, { rows: est.map((e, i) => ({ ...e, id: i })), pageSize: 8, exportName: 'ma_benchmark_estimates', columns: [{ key: 'metric', label: 'Metric', wrap: true, fmt: v => `<span class="small">${esc(v)}</span>` }, { key: 'estimate', label: 'Estimate', wrap: true, fmt: v => `<b class="small">${esc(v)}</b>` }, { key: 'confidence', label: 'Conf.', fmt: v => fmt.chip(v, v === 'high' ? 'var(--sys-good)' : v === 'medium' ? 'var(--sys-warn)' : 'var(--sys-mute-2)') }], onRow: e => ctx.inspector.open({ title: esc(e.metric), sub: `Estimate ${esc(e.estimate)}`, color: 'var(--c-ma)', sections: [{ label: 'Basis', html: `<div class="small text-2">${esc(e.basis)}</div>` }, { label: 'Confidence', html: fmt.chip(e.confidence) }] }) });
  else estEl.innerHTML = ui.empty('No estimate table');
  // Calculator
  const $e = el.querySelector('#c-ebitda'), $m = el.querySelector('#c-mult'), $x = el.querySelector('#c-exit'), $s = el.querySelector('#c-sector');
  const secPref = secRows.find(s => s.id === 'residential_home_services') || secRows[0]; if (secPref) $s.value = secPref.id;
  let edited = false;
  const setDefault = () => { const d = defEbitda($s.value); $e.value = String(d.v); el.querySelector('#c-ebitda-note').textContent = d.p ? `default = ${PLAT[d.p].label} median target ${fmt.money(d.rev)} rev. est. × ${fmt.num(d.mg, 1)}% LMM margin` : 'no BSP target screen in this sector; illustrative $1M'; };
  $e.addEventListener('input', () => { edited = true; }); $s.addEventListener('change', () => { if (!edited) { setDefault(); calc(); } });
  if (secPref) setDefault();
  const calc = () => {
    const e = Math.max(0, Number($e.value) || 0) * 1e6, m = Number($m.value), x = Number($x.value); const s = secRows.find(r => r.id === $s.value);
    el.querySelector('#c-mult-v').textContent = `${m.toFixed(1)}x`; el.querySelector('#c-exit-v').textContent = `${x.toFixed(1)}x`;
    const mg = Math.min(LMM_MARGIN, s?.em > 0 ? s.em : LMM_MARGIN); const ev = e * m, rev = mg > 0 ? e / (mg / 100) : null, arb = e * (x - m);
    el.querySelector('#c-out').innerHTML = [
      ui.kpi({ label: 'Enterprise value', value: fmt.money(ev), sub: `${fmt.money(e)} EBITDA × ${m.toFixed(1)}x`, color: 'var(--c-ma)' }),
      ui.kpi({ label: 'LMM band (5–9x)', value: `${fmt.money(e * 5)}–${fmt.money(e * 9)}`, sub: 'analyst assumption', color: 'var(--sys-warn)' }),
      ui.kpi({ label: 'Implied revenue (est.)', value: rev ? fmt.money(rev) : '—', sub: s ? `at ${pctTxt(fmt, mg)} LMM margin (sector public median ${pctTxt(fmt, s.em)})` : '—', color: 'var(--sys-info)' }),
      ui.kpi({ label: 'Multiple-arbitrage uplift', value: fmt.money(arb), sub: `(${x.toFixed(1)}x − ${m.toFixed(1)}x) × EBITDA · illustrative`, color: arb >= 0 ? 'var(--sys-good)' : 'var(--sys-bad)' }),
    ].join('');
    el.querySelector('#c-chart').innerHTML = `<div class="sys-card-label th-h">Enterprise value by entry multiple</div>${charts.bar([5, 6, 7, 8, 9, 10, 11, 12].map(k => ({ label: `${k}x`, value: e * k, k })), { h: 130, color: 'var(--sys-line-2)', fmt: v => `$${fmt.num(v / 1e6, e * 12 < 2e7 ? 1 : 0)}M`, highlight: d => d.k === Math.round(m) })}`;
  };
  [$e, $m, $x, $s].forEach(n => n.addEventListener('input', calc)); calc();
}

/* ═══ View 6: White space ═════════════════════════════════════════════════ */
function buildWhitespace(b) {
  const firms = b.pe?.items || []; const bspSectors = b.firm?.firm?.sectors || [];
  const heldSectors = { 'Infrastructure Services': 'CET', 'Residential Services': 'Punctual Pros', 'IT & Tech Services': 'Frontline', 'Distribution & Logistics Services': 'Thomas Scientific', 'Media Services': 'BPI' };
  const sb = b.comps?.meta?.sector_benchmarks || {};
  return WS.map(w => {
    const ev = []; const seen = new Set();
    for (const f of firms) {
      for (const p of f.platforms_relevant || []) { const s = [p.name, p.sector, p.notes].join(' '); if (w.re.test(s) && !(w.exclude && w.exclude.test(s)) && !seen.has(f.id + '|' + p.name)) { seen.add(f.id + '|' + p.name); ev.push({ kind: 'Company', name: p.name, sector: p.sector, firm: f.firm, fid: f.id, threat: f.threat_level, url: (f.sources || [])[0] || f.website, note: p.notes }); } }
      for (const d of f.deals_2025_2026 || []) { const s = [d.company, d.sector, d.note].join(' '); if (w.re.test(s) && !(w.exclude && w.exclude.test(s)) && !seen.has(f.id + '|' + d.company)) { seen.add(f.id + '|' + d.company); ev.push({ kind: `Deal ${String(d.date || '').slice(0, 7)}`, name: d.company, sector: d.sector, firm: f.firm, fid: f.id, threat: f.threat_level, url: d.source_url || (f.sources || [])[0], note: d.note }); } }
    }
    const sponsors = [...new Set(ev.map(e => e.fid))]; const high = [...new Set(ev.filter(e => e.threat === 'high').map(e => e.fid))];
    const stated = bspSectors.includes(w.bspSector); const held = heldSectors[w.bspSector];
    const sThesis = stated ? (held ? 20 : 30) : 10;
    const sDemand = Math.min(25, sponsors.length * 5);
    const sRoom = Math.max(0, 20 - high.length * 5);
    const score = sThesis + sDemand + sRoom + w.adjScore;
    return { ...w, ev, sponsors, high, stated, held, score, parts: [['Thesis', sThesis, 30], ['Exit demand', sDemand, 25], ['Room', sRoom, 20], ['Adjacency', w.adjScore, 25]], benchRow: w.bench ? sb[w.bench] : null, deals: ev.filter(e => e.kind.startsWith('Deal')).length };
  }).sort((x, y) => y.score - x.score);
}
async function whitespace(ctx) {
  const { el, ui, fmt, esc, app } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  if (!b.pe) { el.innerHTML = `<div class="m-ma">${ui.pageHead({ title: 'White space', sub: 'Hypotheses for the next BSP portfolio company' })}${ui.note('Research dataset Private-equity landscape is not yet available; white-space hypotheses need its sponsor and deal map.', 'warn')}</div>`; return; }
  const W = buildWhitespace(b); const topW = W[0];
  const bspSectors = b.firm?.firm?.sectors || [];
  const openSectors = [...new Set(W.filter(w => w.stated && !w.held).map(w => w.bspSector))];
  const allSponsors = new Set(W.flatMap(w => w.sponsors)); const deals = W.reduce((s, w) => s + w.deals, 0);
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: 'White space',
    sub: `<b>Top hypothesis: ${esc(topW.name)} (${topW.score}/100).</b> ${topW.sponsors.length} sponsors are building there, so exit buyers exist. ${openSectors.length} of BSP’s ${bspSectors.length} stated sectors have no company yet.`,
    chips: `${fmt.chip('Analyst hypotheses', 'var(--c-ma)')}${fmt.chip('Sponsor deals, 2025–26')}${fmt.chip('BSP stated sectors')}`,
    actions: `<button class="sys-btn sys-btn--secondary btn" id="ma-ws-csv">⇩ CSV</button>`,
  }) +
  ui.kpis([
    { label: 'Candidate sectors', value: fmt.num(W.length), sub: 'from the sponsor deal map', color: 'var(--c-ma)' },
    { label: 'Open BSP sectors', value: `${openSectors.length}<small>of ${bspSectors.length}</small>`, sub: 'stated target sectors without a company', color: 'var(--sys-brand)' },
    { label: 'Sponsors active', value: fmt.num(allSponsors.size), sub: `in candidate sectors · of ${b.pe.items?.length} profiled`, color: 'var(--c-pe)' },
    { label: 'Evidence points', value: fmt.num(W.reduce((s, w) => s + w.ev.length, 0)), sub: `${deals} deals in 2025–26`, color: 'var(--sys-info)' },
    { label: 'Top score', value: `${topW.score}<small>/100</small>`, sub: esc(clip(topW.name, 40)), color: 'var(--sys-good)' },
  ]) +
  `<div class="sys-grid ws-grid mt-12" id="ma-ws"></div>
  <div class="sys-src src-line mt-8">Evidence: Private-equity landscape (sponsor companies and 2025–26 deals), BSP firm profile (stated sectors), Public comparables sector benchmarks · generated ${esc(b.pe?.meta?.generated || '—')} · click a card for evidence links and next action</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'How the fit score works', sub: 'Transparent, adjustable. Judgement is labelled.', body: `<ul class="bul"><li><b>Thesis (0–30):</b> 30 if the sector is one of BSP’s stated target sectors with no current company, 20 if it is stated and BSP already has a company there, 10 if it is not stated.</li><li><b>Exit demand (0–25):</b> 5 points per distinct sponsor with a company or 2025–26 deal in the sector (Private-equity landscape).</li><li><b>Room (0–20):</b> 20 minus 5 per “high-threat” sponsor active in the sector (crowding penalty).</li><li><b>Adjacency (0–25):</b> <span class="sys-est sys-est--illus analyst">analyst view</span> how much of the PRG growth plan and customer base of an existing BSP portfolio company carries over.</li></ul>`, foot: ui.source('Private-equity landscape, BSP firm profile (sectors), Public comparables', null, b.pe?.meta?.generated) })}
    ${ui.panel({ title: 'Next steps', sub: 'Turn hypotheses into a Fund II sourcing plan', body: `<ol class="acts">${W.slice(0, 3).map(w => `<li><span><b>${esc(w.name)}:</b> ${esc(w.next)}</span></li>`).join('')}<li><span><b>Validate with PRG operators:</b> 30-minute interviews with 2 operators per sector on fragmentation, labour model and pricing power.</span></li><li><span><b>Re-score quarterly</b> as the PE landscape is refreshed. A sponsor entering a sector raises exit demand but reduces room.</span></li></ol>` })}
  </div></div>`;
  const host = el.querySelector('#ma-ws');
  host.innerHTML = W.map((w, i) => { const P = w.adj ? PLAT[w.adj] : null; const sc = w.score >= 75 ? 'var(--sys-good)' : w.score >= 60 ? 'var(--sys-info)' : 'var(--sys-warn)';
    return `<div class="sys-card sys-card--link ws" tabindex="0" role="button" data-co="" data-id="${esc(w.id)}" style="--co:${P ? P.color : 'var(--sys-brand)'};--sc:${sc}"><div class="hd"><span class="sys-card-label rk">#${i + 1}</span><h3 class="sys-card-title">${esc(w.name)}</h3><div class="sys-kpi-value scbig">${w.score}<small>fit / 100</small></div></div>
      <div class="sys-chips">${w.stated ? fmt.chip(w.held ? `BSP sector · ${w.held} held` : 'BSP sector · no portfolio company', w.held ? 'var(--sys-info)' : 'var(--sys-good)') : fmt.chip('Outside stated sectors', 'var(--sys-mute-2)')}${P ? fmt.chip(`adjacent: ${P.label}`, P.color) : fmt.chip('adjacent: S+H template', 'var(--sys-brand)')}${fmt.chip(`${w.sponsors.length} sponsors`, 'var(--c-pe)')}${w.high.length ? fmt.chip(`${w.high.length} high-threat`, 'var(--sys-bad)') : ''}</div>
      <div class="sys-card-body rat">${esc(w.why)}</div>
      <div class="ev"><b>Evidence:</b> ${w.ev.slice(0, 4).map(e => `${esc(e.name)} <span class="dim">(${esc(e.firm.replace(/ - .*$/, ''))})</span>`).join(' · ') || 'no sponsor activity found'}${w.ev.length > 4 ? ` · +${w.ev.length - 4} more` : ''}</div>
      ${w.benchRow ? `<div class="ev"><b>Nearest public benchmark:</b> ${esc(SECTOR_LABEL[w.bench])}: ${pctTxt(fmt, w.benchRow.median_ebitda_margin_latest_pct)} EBITDA margin, ${pctTxt(fmt, w.benchRow.median_revenue_cagr_2023_latest_pct)} CAGR</div>` : `<div class="ev"><b>Public benchmark:</b> <span class="dim">no listed comparable yet (next pull)</span></div>`}
      <div class="bd">${w.parts.map(([l, v, m]) => `<div>${esc(l)} <span>${v}/${m}</span><i><b style="width:${(v / m) * 100}%"></b></i></div>`).join('')}</div></div>`; }).join('');
  host.querySelectorAll('.ws').forEach(n => n.onclick = () => { const w = W.find(x => x.id === n.dataset.id); host.querySelectorAll('.ws').forEach(x => x.style.outline = x === n ? '1px solid var(--c-ma)' : ''); openWS(ctx, w); });
  el.querySelector('#ma-ws-csv').onclick = () => ui.exportCSV(W.map((w, i) => ({ rank: i + 1, sector: w.name, score: w.score, thesis: w.parts[0][1], exit_demand: w.parts[1][1], room: w.parts[2][1], adjacency: w.parts[3][1], bsp_sector: w.bspSector, held_by: w.held || '', adjacent_platform: w.adj ? PLAT[w.adj].label : 'S+H template', sponsors: w.sponsors.length, high_threat_sponsors: w.high.length, evidence: w.ev.map(e => `${e.name} (${e.firm})`), next_step: w.next })), null, 'ma_whitespace_hypotheses');
  app.index(W.map(w => ({ label: w.name, sub: `White-space hypothesis · fit ${w.score}`, href: '#/ma/whitespace', kind: 'Hypothesis', color: 'var(--c-ma)' })));
}
function openWS(ctx, w) {
  const { ui, fmt, esc, inspector } = ctx;
  inspector.open({ title: esc(w.name), sub: `White-space hypothesis · fit ${w.score}/100 · ${esc(w.bspSector)}`, color: 'var(--c-ma)',
    sections: [
      { label: 'Hypothesis (analyst view)', html: `<div class="small text-2">${esc(w.why)}</div>` },
      { label: 'Score', html: ctx.charts.hbar(w.parts.map(([l, v, m]) => ({ label: `${l} (${v}/${m})`, value: Math.round((v / m) * 100) })), { max: 100, labelW: 150, fmt: v => `${v}%`, color: 'var(--c-ma)' }) },
      { label: `Evidence (${w.ev.length})`, html: `<div class="m-ma-insp">${w.ev.map(e => `<div class="it"><div class="t">${esc(e.name)}</div><div class="d">${esc(e.kind)} · ${esc(e.firm)} · threat ${esc(e.threat)}</div><div class="w">${esc(e.sector || '')}${e.note ? ` · ${esc(clip(e.note, 160))}` : ''}</div>${e.url ? `<div class="kf"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(fmt.host(e.url) || 'source')} ↗</a></div>` : ''}</div>`).join('') || '<span class="dim small">None</span>'}</div>` },
      w.benchRow ? { label: 'Nearest public benchmark', html: `<div class="small text-2">${esc(w.benchRow.what_this_implies_for_bsp || '')}</div>` } : null,
      { label: 'Next action', html: `<div class="small text-2">${esc(w.next)}</div>` },
    ].filter(Boolean) });
}

/* ── Module ──────────────────────────────────────────────────────────────── */
export default {
  id: 'ma', name: 'Acquisition engine', tag: 'M&A', color: 'var(--c-ma)', group: 'Intelligence',
  tagline: 'Cross-portfolio buy-and-build engine: screened add-ons, company theses, rival companies, valuation benchmarks and white space',
  hq: { lat: 40.7536, lon: -73.9832, label: 'BSP, New York, NY' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'pipeline', name: 'Pipeline', icon: '▤', render: pipeline },
    { id: 'theses', name: 'Company theses', icon: '◇', render: theses },
    { id: 'rivals', name: 'Rival companies', icon: '⚔', render: rivalsView },
    { id: 'valuation', name: 'Valuation', icon: '$', render: valuation },
    { id: 'whitespace', name: 'White space', icon: '✦', render: whitespace },
  ],
  tour: [
    { order: 800, hash: '#/ma/overview', caption: '<b>Acquisition engine.</b> Every screened add-on across four companies, ranked, with this quarter’s top ten.', narration: 'The acquisition engine ranks every screened add-on across four companies, with this quarter\'s top ten.', duration: 6500 },
    { order: 810, hash: '#/ma/theses', caption: '<b>Company theses.</b> Each thesis is written from its target pool; county home sales flag density gaps.', narration: 'Each thesis comes from its own target pool. Home sales show where turnover and targets line up.', duration: 8500 },
    { order: 820, hash: '#/ma/rivals', caption: '<b>Rival companies.</b> Lender filings flag stressed consolidators: likely sellers, not bidders.', narration: 'Lender filings flag rival consolidators paying interest in kind: likely sellers, not bidders.', duration: 5500 },
  ],
};
