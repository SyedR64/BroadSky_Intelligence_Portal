/* ═══════════════════════════════════════════════════════════════════════════
   Acquisition engine (M&A) — cross-portfolio buy-and-build intelligence.
   Datasets: research/ma_targets_cet, ma_targets_pp, ma_targets_fl_ts, rival_filings,
             public_comps, pe_landscape, bsp_firm; sales/* (property transfers, lazy, theses view).
   ═══════════════════════════════════════════════════════════════════════════ */
import { renderTargets, fitTierOf } from '../assets/components.js?v=20260924203049';

/* ── Constants ───────────────────────────────────────────────────────────── */
const PLAT = {
  cet: { key: 'cet', label: 'CET', long: 'Commonwealth Electrical (CET)', color: 'var(--c-cet)', hex: '#4c8dff', rgb: '76,141,255', module: 'cet', bench: 'commercial_electrical_energy', firmId: 'bsp-cet', heat: 'cet' },
  pp: { key: 'pp', label: 'Punctual Pros', long: 'Punctual Pros', color: 'var(--c-pp)', hex: '#f08a3c', rgb: '240,138,60', module: 'pp', bench: 'residential_home_services', firmId: 'bsp-pp', heat: 'punctual_pros' },
  fl: { key: 'fl', label: 'Frontline', long: 'Frontline Managed Services', color: 'var(--c-fl)', hex: '#9d7bff', rgb: '157,123,255', module: 'fl', bench: 'legal_bpo_managed_services', firmId: 'bsp-fl', heat: 'frontline' },
  ts: { key: 'ts', label: 'Thomas Scientific', long: 'Thomas Scientific', color: 'var(--c-ts)', hex: '#2ecc8f', rgb: '46,204,143', module: 'ts', bench: 'lab_distribution', firmId: 'bsp-ts', heat: 'thomas_scientific' },
};
const PKEYS = ['cet', 'pp', 'fl', 'ts'];
const OVERLAP = {
  punctual_pros: { label: 'Punctual Pros', color: 'var(--c-pp)', p: 'pp' }, cet: { label: 'CET', color: 'var(--c-cet)', p: 'cet' },
  frontline: { label: 'Frontline', color: 'var(--c-fl)', p: 'fl' }, thomas_scientific: { label: 'Thomas Sci.', color: 'var(--c-ts)', p: 'ts' },
  bpi: { label: 'BPI', color: 'var(--c-bpi)' }, fair_harbor: { label: 'Fair Harbor', color: 'var(--c-fh)' },
};
/* fit_breakdown dimension maxima per platform rubric (from each dataset's scoring_rubric / scoring_weights) */
const DIM_MAX = {
  cet: { capability: 30, geography: 30, scale: 20, ownership_readiness: 20 },
  pp: { density_adjacency: 20, trade_mix: 20, scale: 20, ownership_readiness: 20, brand_alignment: 20 },
  fl: { capability: 5, customer_overlap: 5, scale: 5, ownership_readiness: 5, geography: 5 },
  ts: { capability: 5, customer_overlap: 5, scale: 5, ownership_readiness: 5, geography: 5 },
};
const COMPANY_HEX = [[/CET|Commonwealth/i, '#4c8dff'], [/Punctual/i, '#f08a3c'], [/Frontline/i, '#9d7bff'], [/Thomas/i, '#2ecc8f'], [/Bully|BPI/i, '#e05c8a'], [/Fair Harbor/i, '#3fd0e0'], [/Smith/i, '#d9622b']];
const hexFor = s => (COMPANY_HEX.find(([re]) => re.test(String(s || ''))) || [0, '#f5b73d'])[1];

/* Canonical rival platforms (rival_filings entities vary in naming; one item can cover several rivals). */
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
    why: 'BSP names Commercial & Facility Services as a target sector but holds no platform; route-density and technician-productivity playbooks from PP and CET transfer directly.', next: 'Map Northeast facility-services operators with >60% contracted/recurring revenue; test founder succession signals.' },
  { id: 'grounds', name: 'Commercial landscaping & vegetation management', re: /landscap|grounds management|vegetation/i, bspSector: 'Commercial & Facility Services', adj: 'pp', adjScore: 10, bench: null,
    why: 'Highly fragmented, contract-based and route-dense; three sponsors built platforms recently, which shows exit demand, but cross-sell with BSP platforms is limited.', next: 'Screen Mid-Atlantic commercial landscapers ($10–60M revenue); check snow/ice mix and labour (H-2B) exposure.' },
  { id: 'utility', name: 'Utility & infrastructure field services', re: /utility|infrastructure (?:services|contract|engineering)|locating|power systems|fleet services/i, bspSector: 'Infrastructure Services', adj: 'cet', adjScore: 20, bench: 'commercial_electrical_energy',
    why: 'Grid, water and wastewater capex is the fastest-growing public comp set; Horton brings W/WW and utility work into CET. Could be run as a CET adjacency or a second infrastructure platform.', next: 'Size NE utility locating, vegetation and substation-service firms; decide adjacency (CET add-on) versus standalone platform.' },
  { id: 'prof', name: 'Accounting, tax & advisory (post–Smith + Howard)', re: /accounting|\btax\b|\bCPA\b|valuation|financial advisory/i, bspSector: 'Professional Services', adj: null, adjScore: 18, bench: 'legal_bpo_managed_services',
    why: 'The Smith + Howard exit (about 100 to 800 professionals, 9 add-ons, sold to TPG Growth) leaves BSP with a proven alternative-practice-structure playbook and no professional-services platform.', next: 'Re-open the S+H sourcing list: CPA firms with $20–80M revenue outside S+H’s Southeast footprint (Mid-Atlantic, New England).' },
  { id: 'compliance', name: 'Regulatory compliance & information services', re: /compliance|regulatory|records|information management|information services/i, bspSector: 'Professional Services', adj: 'fl', adjScore: 14, bench: 'legal_bpo_managed_services',
    why: 'Recurring, regulation-driven demand from the same GC and law-firm buyers that Frontline and BPI serve; MidOcean (Zachem lineage) is building here.', next: 'List corporate-compliance, registered-agent and records-management providers with 70%+ recurring revenue.' },
  { id: 'resi', name: 'Residential specialty services (garage, windows, pools, foundations)', re: /garage|window|pool|foundation|waterproof|franchisor/i, bspSector: 'Residential Services', adj: 'pp', adjScore: 17, bench: 'residential_home_services',
    why: 'Uses PP’s homeowner base, call-centre and membership engine, but it is a separate trade stack; sponsors (Alpine, Trivest, Riverside) are forming platforms now.', next: 'Test cross-sell: share of PP members who bought garage/window/foundation work in 24 months; screen PA/NJ operators.' },
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
const OWNER_COLOR = { 'Founder / family': 'var(--green)', 'Private independent': 'var(--accent)', Franchisee: 'var(--cyan)', ESOP: 'var(--amber)', Unverified: 'var(--dim)', 'Sponsor / corporate': 'var(--red)' };
const injectCss = () => { if (!document.getElementById('css-ma')) { const l = document.createElement('link'); l.id = 'css-ma'; l.rel = 'stylesheet'; l.href = 'modules/ma.css?v=20260924203049'; document.head.appendChild(l); } };
const shortList = a => { const v = (Array.isArray(a) ? a : [a]).filter(Boolean).map(x => { const y = String(x).replace(/\s*\(.*?\)\s*/g, ' ').replace(/_/g, ' ').trim(); return y.length > 26 ? y.slice(0, 25).trim() + '…' : y; }); return v.length > 2 ? [...v.slice(0, 2), `+${v.length - 2}`] : v; };
const andList = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const pctTxt = (fmt, v, d = 1) => v == null || isNaN(v) ? '—' : `${fmt.num(v, d)}%`;
const multTxt = (fmt, v) => v == null || isNaN(v) ? '—' : `${fmt.num(v, 1)}x`;

function normT(t, p) {
  const fit = num(t.fit_score);
  return { ...t, _p: p, platform: PLAT[p].label, fit_score: fit, employees: num(t.employees), revenue_est_usd: num(t.revenue_est_usd), _tier: fitTierOf(fit || 0), _state: t.state || t.hq_state || '', _owner: ownerClass(t.ownership) };
}

/* One shared load for every view (research() caches per file; this caches the derived bundle). */
let _bundle = null;
function loadBundle(data) {
  if (_bundle) return _bundle;
  _bundle = (async () => {
    const names = ['ma_targets_cet', 'ma_targets_pp', 'ma_targets_fl_ts', 'rival_filings', 'public_comps', 'pe_landscape', 'bsp_firm'];
    const res = await Promise.all(names.map(n => data.research(n)));
    const [cet, pp, flts, rivals, comps, pe, firm] = res;
    const missing = names.filter((n, i) => !res[i]);
    const targets = [];
    (cet?.items || []).forEach(t => targets.push(normT(t, 'cet')));
    (pp?.items || []).forEach(t => targets.push(normT(t, 'pp')));
    (flts?.items || []).forEach(t => targets.push(normT(t, t.platform === 'frontline' ? 'fl' : 'ts')));
    const b = { cet, pp, flts, rivals, comps, pe, firm, missing, targets };
    b.byId = new Map(targets.map(t => [t.id, t]));
    b.rivalRows = rivals ? buildRivals(rivals) : [];
    return b;
  })();
  _bundle.then(b => { if (b.missing.length) _bundle = null; }).catch(() => { _bundle = null; });
  return _bundle;
}
const rankedFor = (b, p) => (p === 'cet' ? b.cet?.meta?.ranked_top_10 : p === 'pp' ? b.pp?.meta?.ranked_top_10 : p === 'fl' ? b.flts?.meta?.frontline?.ranked_top_8 : b.flts?.meta?.thomas_scientific?.ranked_top_8) || [];
const metaFor = (b, p) => (p === 'cet' ? b.cet?.meta : p === 'pp' ? b.pp?.meta : b.flts?.meta) || null;
function competitorsFor(b, p) {
  const src = p === 'cet' ? b.cet?.meta?.pe_backed_competitors : p === 'pp' ? b.pp?.meta?.pe_backed_competitors : p === 'fl' ? b.flts?.meta?.frontline?.pe_backed_competitors : b.flts?.meta?.thomas_scientific?.pe_backed_competitors;
  return (src || []).map(c => ({ name: c.company || c.platform, owner: c.owner || c.sponsor || 'sponsor n/d', note: c.note || c.notes || c.threat || c.footprint || '', src: (c.sources || [])[0] }));
}
const missingNote = (ui, esc, b) => b.missing.length ? ui.note(`Research dataset${b.missing.length > 1 ? 's' : ''} not yet available: ${b.missing.map(esc).join(', ')}. Views that depend on ${b.missing.length > 1 ? 'them' : 'it'} show partial results.`, 'warn') + '<div class="mt-12"></div>' : '';
const sourceFoot = (ui, meta, label) => meta ? ui.source(label || meta.dataset || 'Research screen', null, meta.generated) : '';
const nextActionFor = p => ({
  cet: 'Warm introduction through CET leadership (or the NuWave/Horton networks) → confirm ownership and succession intent → request 3-yr P&L, backlog, bonding capacity, union status and licences → indicative bid inside the LMM multiple band (see Valuation).',
  pp: 'PRG-led owner outreach (for Authority Brands franchisees, open the territory-transfer path with the franchisor) → request 3-yr P&L, membership count, technician roster and call-centre metrics → indicative bid inside the LMM multiple band.',
  fl: 'Approach on Frontline’s stated tuck-in criteria (~$5M revenue / $1–2M EBITDA) → review law-firm client list overlap, contract terms and SOC 2 posture → indicative bid; plan service-desk (HELIX) migration.',
  ts: 'Line-card overlap analysis versus the Thomas catalogue → supplier change-of-control consents → request customer concentration and gross margin by line → indicative bid ahead of Calibre Scientific.',
})[p];

/* Target inspector (used everywhere except the renderTargets table, which has its own). */
function openTarget(ctx, t) {
  const { ui, fmt, inspector, esc, charts, app } = ctx; const P = PLAT[t._p]; const mx = DIM_MAX[t._p] || {};
  const fb = Object.entries(t.fit_breakdown || {}).map(([k, v]) => { const m = mx[k] || (t._p === 'fl' || t._p === 'ts' ? 5 : 20); return { label: `${titleCase(k)} (${num(v) ?? '—'}/${m})`, value: Math.round(((num(v) || 0) / m) * 100) }; });
  inspector.open({
    title: esc(t.company), color: P.color,
    sub: `${esc(t.hq_city || '')}${t.hq_city ? ', ' : ''}${esc(t._state)} · ${esc(P.long)} add-on candidate · ${esc(t._tier)}`,
    sections: [
      { label: 'Fit', html: `<div class="kpi" style="--kc:${P.color}"><div class="label">Fit score (${esc(P.label)} rubric)</div><div class="value">${fmt.num(t.fit_score)}</div><div class="sub">${esc(t._tier)} · rubrics differ by platform</div></div>${fb.length ? `<div class="mt-8">${charts.hbar(fb, { max: 100, fmt: v => `${v}%`, labelW: 170, color: P.color })}</div>` : ''}` },
      { label: 'Profile', html: '<div class="m-ma-insp">' + ui.kv({ Founded: t.founded_year, Employees: t.employees != null ? fmt.num(t.employees) : null, 'Revenue (est.)': t.revenue_est_usd ? `${fmt.money(t.revenue_est_usd)} <span class="dim small">ZoomInfo modeled</span>` : null, Ownership: t.ownership ? `${esc(t.ownership)}${t.ownership_notes ? `<div class="dim small">${esc(clip(t.ownership_notes, 200))}</div>` : ''}` : null, Brands: t.brands_or_franchise ? esc(t.brands_or_franchise) : null, 'Specialties / trades': t.specialties || t.trades || t.offerings, 'End markets': t.end_markets || t.customer_segments, 'Nearest CET node': t.nearest_cet_node ? `${esc(t.nearest_cet_node)} · ${fmt.num(t.nearest_cet_node_miles)} mi` : null, 'Distance (Lancaster / Toms River)': t.distance_mi_from_lancaster != null ? `${fmt.num(t.distance_mi_from_lancaster)} / ${fmt.num(t.distance_mi_from_toms_river)} mi` : null, Reviews: t.review_count ? `${fmt.num(t.review_count)}${t.review_rating ? ` · ${esc(t.review_rating)}★` : ''}` : null, Website: t.website ? fmt.link(t.website) : null }) + '</div>' },
      { label: 'Strategic rationale', html: `<div class="small text-2">${esc(t.strategic_rationale || '—')}</div>` },
      t.risk_flags?.length ? { label: 'Risk flags', html: `<div class="m-ma-insp row wrap gap-4">${t.risk_flags.map(r => fmt.chip(r, 'var(--amber)')).join(' ')}</div>` } : null,
      { label: 'Sources', html: `<div class="col gap-4 small">${(t.sources || []).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(fmt.host(s) || s)}</a>`).join('') || '—'}</div><div class="dim small mt-8">Retrieved ${esc(t.retrieved || '—')} · ${esc(t.revenue_source || 'revenue source n/a')}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${esc(nextActionFor(t._p))}</div>` },
    ].filter(Boolean),
    actions: [t.website ? { label: 'Website ↗', href: t.website } : null, { id: 'pipe', label: 'Open in pipeline', onClick: () => app.go('ma', 'pipeline', { platform: t._p, q: t.company }) }, { id: 'mod', label: `${esc(P.label)} module`, onClick: () => app.go(P.module) }].filter(Boolean),
  });
}

/* Interleave each platform's ranked list: every #1, then every #2, … (rubrics are not comparable across platforms). */
function topTen(b) {
  const lists = PKEYS.map(p => { const ranked = rankedFor(b, p).map(r => b.byId.get(r.id)).filter(Boolean); const rest = b.targets.filter(t => t._p === p && !ranked.includes(t)).sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0)); return [...ranked, ...rest]; });
  const out = [];
  for (let r = 0; out.length < 10 && r < 20; r++) {
    const tier = lists.map((l, i) => ({ t: l[r], p: PKEYS[i] })).filter(x => x.t).sort((x, y) => (y.t.fit_score || 0) - (x.t.fit_score || 0));
    for (const x of tier) if (out.length < 10) out.push({ ...x, rank: r + 1 });
  }
  return out;
}
const whyFor = (b, t) => { const r = rankedFor(b, t._p).find(x => x.id === t.id); return r?.why || clip(t.strategic_rationale, 190); };

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
const SIGNAL_COLOR = { Stressed: 'var(--red)', 'Refi due': 'var(--amber)', Performing: 'var(--green)', 'Public — reported': 'var(--accent)', 'No lender data': 'var(--dim)' };
const INTENSITY_COLOR = s => /very high/i.test(s) ? 'var(--red)' : /^high/i.test(s) ? 'var(--brand-2)' : /medium/i.test(s) && !/low/i.test(s) ? 'var(--amber)' : /low-medium/i.test(s) ? 'var(--accent)' : 'var(--dim)';

/* ═══ View 1: Overview ════════════════════════════════════════════════════ */
async function overview(ctx) {
  const { el, ui, fmt, maps, charts, esc, app } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  const T = b.targets;
  if (!T.length) { el.innerHTML = ui.pageHead({ title: 'Acquisition engine', sub: 'Cross-portfolio buy-and-build engine' }) + ui.note('M&A target screens (ma_targets_cet, ma_targets_pp, ma_targets_fl_ts) are not yet available.', 'warn'); return; }
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
    sub: `<b>${fmt.num(T.length)} add-on targets screened across ${PKEYS.length} platforms; ${fmt.num(t1.length)} are Tier-1 (fit ≥80) and ${fmt.num(t1.length + t2.length)} Tier-1/2.</b> The actionable pool is concentrated in ${esc(PLAT[topP[0]].label)} (${t12By[topP[0]]}) and ${esc(PLAT[topP[1]].label)} (${t12By[topP[1]]}). The median target is a ${fmt.money(medRev)}, ${fmt.num(medEmp)}-person business (ZoomInfo estimate), i.e. tuck-in size. ${pctOf(ownerReady, T.length)}% are confirmed founder- or family-owned. BSP has closed ${stats.add_ons} add-ons${named != null ? ` (${named} identified by name)` : ''}.`,
    chips: `${fmt.chip('Screens generated ' + (b.cet?.meta?.generated || b.pp?.meta?.generated || '—'), 'var(--c-ma)')}${fmt.chip('Fit rubrics differ by platform')}${fmt.chip('Revenue = ZoomInfo modeled est.')}`,
    actions: `<a class="btn" href="#/ma/pipeline">Full pipeline →</a><a class="btn" href="#/ma/theses">Platform theses</a>`,
  }) + missingNote(ui, esc, b) +
  ui.kpis([
    { label: 'Targets screened', value: fmt.num(T.length), sub: PKEYS.map(p => `${PLAT[p].key.toUpperCase()} ${byP[p].length}`).join(' · '), color: 'var(--c-ma)' },
    { label: 'Tier-1 targets', value: fmt.num(t1.length), sub: `fit ≥80 · ${fmt.num(t2.length)} more at Tier 2`, color: 'var(--green)' },
    { label: 'Platforms screened', value: `${PKEYS.length}<small>of ${firmItems.filter(i => i.status === 'held').length || 6} held</small>`, sub: 'BPI and Fair Harbor not yet screened', color: 'var(--c-bsp)' },
    { label: 'Median target size', value: fmt.money(medRev), sub: `revenue est. (n=${nRev}) · ${fmt.num(medEmp)} staff median`, color: 'var(--accent)' },
    { label: 'Rival platforms tracked', value: fmt.num(rivals.length), sub: `${peBacked} PE-backed · ${stressed.length} with credit stress or refi due`, color: 'var(--red)' },
    { label: 'BSP add-ons completed', value: fmt.num(stats.add_ons), sub: named != null ? `${named} identified by name · ${stats.platforms || 7} platforms` : 'stated by BSP · firm dataset pending', color: 'var(--c-bsp)' },
  ]) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Where the targets are', cls: 'ma-fill', sub: 'Every screened add-on by platform (size = fit tier); rings are BSP platform HQs. Click a point to inspect.', body: `<div class="map" id="ma-map"></div>`, flush: true, foot: ui.source('ZoomInfo search + company websites (ma_targets_*); BSP firm profile', null, b.cet?.meta?.generated) })}
    ${ui.panel({ title: 'This quarter’s top 10', sub: 'Each platform’s #1 pick, then its #2, and so on (rubrics are not comparable across platforms)', body: `<div class="ma-top" id="ma-top10"></div>`, scroll: true, foot: `<span class="src">Ranking: platform shortlists (ranked_top_10 / ranked_top_8) · reasons from screen authors</span>` })}
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Screening funnel · platform × fit tier', sub: 'Targets per fit tier (T1 ≥80, T2 65–79, T3 50–64, T4 <50). Listed = on the screen authors’ ranked shortlist; Owner = confirmed founder/family owner.', body: `<div id="ma-heat"></div><div class="th-h mt-12">Conversion across all platforms</div><div id="ma-funnel"></div><div class="th-h mt-12">Read-out <span class="analyst">Analyst view</span></div><ul class="bul" id="ma-readout"></ul>`, foot: ui.source('ma_targets_cet · ma_targets_pp · ma_targets_fl_ts', null, b.pp?.meta?.generated) })}
    ${ui.panel({ title: 'BSP add-on track record', sub: `${stats.add_ons} add-ons stated by BSP${named != null ? ` · ${named} identified by name` : ''}`, body: `<div id="ma-cadence"></div><div id="ma-byplat" class="mt-8"></div><div class="th-h mt-12">Timeline</div><div id="ma-tl" style="max-height:230px;overflow:auto"></div>`, foot: ui.source('Broad Sky & portfolio press releases (bsp_firm)', 'https://broadskypartners.com/news/', b.firm?.meta?.generated) })}
    ${ui.panel({ title: 'Buy-and-build playbook', sub: 'How a target moves from screen to integrated add-on', body: `<div class="steps" id="ma-steps"></div><div class="th-h mt-16">Actions this week <span class="analyst">Analyst view</span></div><ol class="acts" id="ma-acts"></ol>`, foot: ui.source('PRG description from broadskypartners.com; PE landscape implications', null, b.pe?.meta?.generated) })}
  </div></div>`;

  // Top 10
  const top = topTen(b);
  el.querySelector('#ma-top10').innerHTML = top.map((x, i) => { const t = x.t, P = PLAT[x.p]; return `<div class="it" data-id="${esc(t.id)}" style="--cc:${P.color}"><div class="rk">${i + 1}</div><div class="grow"><div class="nm">${esc(t.company)}</div><div class="why">${esc(whyFor(b, t))}</div><div class="meta">${fmt.chip(P.label, P.color)}${fmt.chip(`#${x.rank} in ${P.label} list`)}${t.revenue_est_usd ? fmt.chip(`${fmt.money(t.revenue_est_usd)} est.`) : ''}${t.employees ? fmt.chip(`${fmt.num(t.employees)} staff`) : ''}${fmt.chip(t._owner, OWNER_COLOR[t._owner])}${fmt.chip(`${t.hq_city || ''}${t.hq_city ? ', ' : ''}${t._state}`)}</div></div><div class="sc">${fmt.score(t.fit_score)}</div></div>`; }).join('');
  el.querySelectorAll('#ma-top10 .it').forEach(n => n.onclick = () => openTarget(ctx, b.byId.get(n.dataset.id)));

  // Heat grid + funnel
  const cols = ['T1', 'T2', 'T3', 'T4', 'Listed', 'Owner'];
  const vals = PKEYS.map(p => [...['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4'].map(tt => byP[p].filter(t => t._tier === tt).length), byP[p].filter(t => shortlistIds.has(t.id)).length, byP[p].filter(t => t._owner === 'Founder / family').length]);
  el.querySelector('#ma-heat').innerHTML = charts.heatgrid(PKEYS.map(p => `${PLAT[p].key.toUpperCase()} · ${byP[p].length}`), cols, vals, { color: '245,183,61', fmt: v => v });
  const sl = T.filter(t => shortlistIds.has(t.id));
  el.querySelector('#ma-funnel').innerHTML = charts.hbar([
    { label: 'Screened', value: T.length }, { label: 'Tier 1–2 (fit ≥65)', value: T.filter(t => (t.fit_score || 0) >= 65).length }, { label: 'Tier 1 (fit ≥80)', value: t1.length },
    { label: 'Shortlisted (ranked)', value: sl.length }, { label: 'Shortlisted + owner-ready', value: sl.filter(t => t._owner === 'Founder / family').length },
  ], { labelW: 160, color: 'var(--c-ma)', fmt: v => fmt.num(v) });

  const shareT12 = p => pctOf(t12By[p], byP[p].length), shareOwn = p => pctOf(byP[p].filter(t => t._owner === 'Founder / family').length, byP[p].length);
  const hiQ = PKEYS.slice().sort((x, y) => shareT12(y) - shareT12(x)), loOwn = PKEYS.slice().sort((x, y) => shareOwn(x) - shareOwn(y));
  const unv = PKEYS.map(p => [p, byP[p].filter(t => t._owner === 'Unverified').length]).sort((x, y) => y[1] - x[1])[0];
  el.querySelector('#ma-readout').innerHTML = [
    `${esc(PLAT[hiQ[0]].label)} has the highest-quality pool (${shareT12(hiQ[0])}% Tier 1–2); ${esc(PLAT[hiQ[3]].label)} the thinnest (${shareT12(hiQ[3])}%), so widen that screen before adding outreach capacity.`,
    `Owner readiness is lowest at ${esc(PLAT[loOwn[0]].label)} (${shareOwn(loOwn[0])}% confirmed founder/family); ${unv[1]} ${esc(PLAT[unv[0]].label)} targets still have unverified ownership, so verify before the first call.`,
    `${fmt.num(sl.length - sl.filter(t => t._owner === 'Founder / family').length)} shortlisted targets lack a confirmed founder/family owner and need ownership checks.`,
  ].map(x => `<li>${x}</li>`).join('');

  // Add-on cadence + by platform + timeline
  const addEvents = (b.firm?.timeline || []).filter(e => e.type === 'add_on');
  const byYear = countBy(addEvents, e => String(e.date || '').slice(0, 4));
  const years = Object.keys(byYear).sort();
  el.querySelector('#ma-cadence').innerHTML = years.length ? `<div class="th-h">Add-on announcements per year</div>${charts.bar(years.map(y => ({ label: y, value: byYear[y] })), { h: 120, color: 'var(--c-ma)', fmt: v => fmt.num(v) })}` : ui.empty('No add-on timeline available');
  const byCo = !b.firm ? [] : [...firmItems.map(i => ({ label: i.company.replace(/\s*\(.*\)$/, ''), value: (i.add_ons || []).filter(a => !/unidentified/i.test(a.name || '')).length, color: hexFor(i.company) })), { label: 'Smith + Howard (exited)', value: shEvents.length, color: hexFor('Smith') }].sort((x, y) => y.value - x.value);
  el.querySelector('#ma-byplat').innerHTML = !byCo.length ? '' : `<div class="th-h">Named add-ons by platform</div>${charts.hbar(byCo, { labelW: 170, fmt: v => fmt.num(v) })}<div class="soft mt-8">${esc(stats.add_on_reconciliation || '')}</div>`;
  el.querySelector('#ma-tl').innerHTML = ui.timeline(addEvents.slice().sort((x, y) => String(y.date).localeCompare(String(x.date))).map(e => ({ date: e.date, color: hexFor(e.company), html: `${esc(e.event)}${e.source_url ? ` <a class="dim" href="${esc(e.source_url)}" target="_blank" rel="noopener">↗</a>` : ''}` })));

  // Playbook
  const prg = b.firm?.firm?.prg; const prgLead = (prg?.members || [])[0];
  el.querySelector('#ma-steps').innerHTML = [
    { n: '01', t: 'Sourcing', d: 'ZoomInfo pulls, franchise directories and web verification; fit rubric per platform', k: `${fmt.num(T.length)} screened` },
    { n: '02', t: 'PRG outreach', d: `Portfolio Resource Group${prgLead ? ` (${prgLead.name})` : ''} plus platform CEO warm intros; founder/family owners first`, k: `${fmt.num(sl.filter(t => t._owner === 'Founder / family').length)} owner-ready` },
    { n: '03', t: 'Diligence', d: '3-yr P&L, QoE, customer concentration, licensing/labour; price inside the LMM band', k: `${fmt.num(t1.length)} Tier-1` },
    { n: '04', t: 'Integration', d: '100-day plan: brand and dispatch (PP), crews and licences (CET), service desk (FL), line cards and ERP (TS)', k: `${fmt.num(stats.add_ons)} done` },
  ].map(s => `<div class="step"><div class="n">${s.n}</div><div class="t">${esc(s.t)}</div><div class="d">${esc(s.d)}</div><div class="k">${esc(s.k)}</div></div>`).join('');
  const best = p => rankedFor(b, p).slice(0, 2).map(r => r.company.replace(/\s*\(.*\)$/, '').split(' / ')[0]);
  const acts = [];
  if (byP.pp.length) acts.push(`<b>Punctual Pros:</b> open owner conversations with ${best('pp').map(esc).join(' and ')} before an auction; the PE landscape rates residential services “${esc(heat.punctual_pros?.intensity || 'very high')}” intensity, with Sila and Legacy buying in PP’s counties.`);
  if (byP.cet.length) acts.push(`<b>CET:</b> prioritise ${best('cet').map(esc).join(' and ')} (Eastern MA density) and CT capability near Horton while Kohlberg and Huron electrical platforms are still outside New England.`);
  if (byP.fl.length) acts.push(`<b>Frontline:</b> approach ${best('fl').map(esc).join(' and ')}. They match the CEO’s stated geographies and ~$5M-revenue tuck-in profile.`);
  if (byP.ts.length) acts.push(`<b>Thomas Scientific:</b> bid for ${best('ts').map(esc).join(' and ')} ahead of Calibre Scientific, the most active lab-distribution consolidator.`);
  if (stressed.length) acts.push(`<b>Watch-list:</b> ${stressed.slice(0, 4).map(r => esc(r.name)).join(', ')} show PIK interest, sub-95 lender marks or near-term maturities. They are more likely to sell assets than to bid.`);
  el.querySelector('#ma-acts').innerHTML = acts.map(a => `<li><span>${a}</span></li>`).join('');

  // Map
  const map = maps.create(el.querySelector('#ma-map'), { center: [39.6, -86], zoom: 4 });
  for (const p of PKEYS) maps.points(map, byP[p], { color: PLAT[p].hex, radius: t => t._tier === 'Tier 1' ? 7.5 : t._tier === 'Tier 2' ? 5.5 : 4, cluster: false, opacity: .85, popup: t => `<b>${esc(t.company)}</b><br>${esc(PLAT[p].label)} · fit ${fmt.num(t.fit_score)} (${esc(t._tier)})<br><span class="muted">${esc(t.hq_city || '')}, ${esc(t._state)}${t.revenue_est_usd ? ' · ' + fmt.money(t.revenue_est_usd) + ' est.' : ''}</span>`, onClick: t => openTarget(ctx, t) });
  for (const i of firmItems) { const p = PKEYS.find(k => PLAT[k].firmId === i.id); if (p && i.lat != null) maps.marker(map, i.lat, i.lon, { color: PLAT[p].hex, label: PLAT[p].key.toUpperCase(), size: 13, popup: `<b>${esc(i.company)}</b><br>${esc(i.hq_city || '')}, ${esc(i.state || '')}<br><a href="#/${PLAT[p].module}">Open module →</a>` }); }
  maps.legend(map, [...PKEYS.map(p => ({ color: PLAT[p].hex, label: `${PLAT[p].label} targets (${byP[p].length})` })), { color: '#ffffff', label: 'Platform HQ', ring: true }], 'Add-on targets');

  app.index([...T.slice(0, 260).map(t => ({ label: t.company, sub: `${PLAT[t._p].label} add-on target · ${t.hq_city || ''} ${t._state} · fit ${t.fit_score ?? '—'}`, href: `#/ma/pipeline?platform=${t._p}&q=${encodeURIComponent(t.company)}`, kind: 'Target', color: PLAT[t._p].hex })), ...rivals.map(r => ({ label: r.name, sub: `Rival platform · ${r.owner}`, href: `#/ma/rivals?r=${r.id}`, kind: 'Rival', color: '#ff5c5c' }))]);
  return () => map.remove();
}

/* ═══ View 2: Pipeline ════════════════════════════════════════════════════ */
async function pipeline(ctx) {
  const { el, ui, fmt, esc, app, params } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  const sel = PKEYS.includes(params.platform) ? params.platform : 'all';
  const q = String(params.q || '').trim();
  let rows = b.targets.filter(t => sel === 'all' || t._p === sel);
  if (q) rows = rows.filter(t => String(t.company).toLowerCase().includes(q.toLowerCase()));
  const t1 = rows.filter(t => t._tier === 'Tier 1').length, t2 = rows.filter(t => t._tier === 'Tier 2').length;
  const ff = rows.filter(t => t._owner === 'Founder / family').length;
  const states = new Set(rows.map(t => t._state).filter(Boolean));
  const P = sel === 'all' ? null : PLAT[sel];
  const meta = sel === 'all' ? null : metaFor(b, sel);
  const topState = topN(countBy(rows, t => t._state), 3).map(([s, n]) => `${s} ${n}`).join(', ');
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: `Add-on pipeline${P ? ` · ${esc(P.label)}` : ''}`,
    sub: rows.length ? `<b>${fmt.num(rows.length)} target${rows.length === 1 ? '' : 's'}${q ? ` matching “${esc(q)}”` : P ? '' : ' across all four platforms'}; ${fmt.num(t1)} Tier-1 and ${fmt.num(t2)} Tier-2.</b> ${rows.length > 1 ? `Most are in ${esc(topState)}, and` : `HQ state: ${esc(topState)};`} ${pctOf(ff, rows.length)}% have a confirmed founder or family owner. Sort or filter the table, then click a row for the fit breakdown, sources and next action.` : 'No targets match the current filter.',
    chips: `${fmt.chip('Fit rubric differs by platform; bars shown as % of each dimension’s maximum')}${fmt.chip('Revenue = ZoomInfo modeled est.', 'var(--amber)')}`,
    actions: `<a class="btn" href="#/ma/theses">Platform theses →</a>`,
  }) + missingNote(ui, esc, b) +
  ui.kpis([
    { label: 'Targets in view', value: fmt.num(rows.length), sub: sel === 'all' ? `of ${fmt.num(b.targets.length)} screened` : `${esc(P.long)} screen`, color: P?.color || 'var(--c-ma)' },
    { label: 'Tier 1 / Tier 2', value: `${fmt.num(t1)}<small>/ ${fmt.num(t2)}</small>`, sub: 'fit ≥80 / 65–79', color: 'var(--green)' },
    { label: 'Median fit', value: fmt.num(median(rows.map(t => t.fit_score))), sub: 'platform rubric, 0–100', color: 'var(--accent)' },
    { label: 'Median revenue (est.)', value: fmt.money(median(rows.map(t => t.revenue_est_usd))), sub: `median staff ${fmt.num(median(rows.map(t => t.employees)))}`, color: 'var(--c-ma)' },
    { label: 'Owner-ready', value: `${pctOf(ff, rows.length)}%`, sub: `${fmt.num(ff)} founder/family-owned`, color: 'var(--green)' },
    { label: 'States / countries', value: fmt.num(states.size), sub: esc(topState || '—'), color: 'var(--c-bsp)' },
  ]) +
  `<div class="ma-seg-row mt-12"><span class="lbl">Platform</span><div id="ma-seg"></div>${q ? `<span class="chip" style="--cc:var(--c-ma)">Search: ${esc(q)}</span><a class="btn xs" href="#/ma/pipeline${sel !== 'all' ? `?platform=${sel}` : ''}">Clear ✕</a>` : ''}</div>
  <div id="ma-tg"></div>
  <div class="src-line mt-8">${sel === 'all' ? 'Sources: ma_targets_cet, ma_targets_pp, ma_targets_fl_ts (ZoomInfo search_companies, franchise directories, company websites)' : esc(clip(meta?.method || '', 320))} · generated ${esc(meta?.generated || b.pp?.meta?.generated || '—')}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'How to work this list', sub: 'Recommended sequence for deal teams', body: `<ol class="acts"><li><span><b>Filter to Tier 1–2 and owner-ready</b> (Ownership = founder/family) for PRG outreach this quarter.</span></li><li><span><b>Export the shortlist</b> (⇩ CSV) into the deal pipeline tracker with owner, platform and next step.</span></li><li><span><b>Check risk flags</b> in the inspector. ZoomInfo revenue is modeled, so confirm size in the first call.</span></li><li><span><b>Price it</b> using the Valuation benchmarks tab: LMM entry multiple versus platform multiple.</span></li></ol>` })}
    ${ui.panel({ title: 'Data caveats', sub: 'From the screen authors — read before outreach', body: `<ul class="bul">${(sel === 'all' ? [b.cet?.meta, b.pp?.meta, b.flts?.meta] : [meta]).filter(Boolean).flatMap(m => (m.caveats || []).slice(0, sel === 'all' ? 2 : 5)).map(c => `<li>${esc(clip(c, 260))}</li>`).join('') || '<li>—</li>'}</ul>` })}
  </div></div>`;
  ui.seg(el.querySelector('#ma-seg'), [{ value: 'all', label: `All (${b.targets.length})` }, ...PKEYS.map(p => ({ value: p, label: `${PLAT[p].label} (${b.targets.filter(t => t._p === p).length})` }))], sel, v => app.go('ma', 'pipeline', v === 'all' ? undefined : { platform: v }));
  const host = el.querySelector('#ma-tg');
  if (!b.targets.length) { host.innerHTML = ui.note('Target screens are not yet available.', 'warn'); return; }
  // Normalise fit_breakdown to % of each dimension's maximum so the shared inspector bars are comparable across rubrics.
  // Ownership is normalised to 6 classes (raw text restored in the inspector); long FL/TS offering strings are shortened for the table.
  const items = rows.map(t => { const mx = DIM_MAX[t._p] || {}; const fb = {}; for (const [k, v] of Object.entries(t.fit_breakdown || {})) { const m = mx[k] || 20; fb[`${k} (${v}/${m})`] = Math.round(((num(v) || 0) / m) * 100); } return { ...t, fit_breakdown: fb, ownership: t._owner, _ownRaw: t.ownership, specialties: shortList(t.specialties || t.trades || t.offerings || []), strategic_rationale: clip(t.strategic_rationale, 95), _why: t.strategic_rationale }; });
  const byName = new Map(rows.map(t => [esc(t.company), t]));
  // Wrap the inspector so the shared renderTargets panel gains raw ownership detail and a platform-specific next action.
  const insp = { ...ctx.inspector, open: cfg => { const t = byName.get(cfg.title); if (t) { cfg = { ...cfg, sections: cfg.sections.map(sec => sec.label === 'Strategic rationale' ? { label: sec.label, html: `<div class="small text-2">${esc(t.strategic_rationale || '—')}</div>` } : sec.label === 'Next action' ? { label: 'Next action', html: `<div class="small text-2">${esc(nextActionFor(t._p))}</div>` } : sec) }; const i = cfg.sections.findIndex(sec => sec.label === 'Profile'); cfg.sections.splice(i + 1, 0, { label: 'Ownership detail', html: `<div class="small text-2">${esc(t.ownership || '—')}${t.ownership_notes ? ` · ${esc(t.ownership_notes)}` : ''}</div>` }); } ctx.inspector.open(cfg); } };
  renderTargets({ ...ctx, inspector: insp }, host, { items, color: P?.color || 'var(--c-ma)', platformLabel: P ? P.label : 'Cross-portfolio', exportName: `ma_pipeline_${sel}`, pageSize: 40,
    extraColumns: [{ key: 'platform', label: 'Platform', fmt: (v, r) => fmt.chip(v, PLAT[r._p]?.color) }] });
  if (q && rows.length === 1) openTarget(ctx, rows[0]);
}

/* ═══ View 3: Platform theses ═════════════════════════════════════════════ */
function thesisStats(b, p) {
  const T = b.targets.filter(t => t._p === p);
  const n = T.length; const own = countBy(T, t => t._owner);
  const dims = {}; const mx = DIM_MAX[p];
  T.forEach(t => Object.entries(t.fit_breakdown || {}).forEach(([k, v]) => { (dims[k] = dims[k] || []).push((num(v) || 0) / (mx[k] || 20)); }));
  const dimAvg = Object.entries(dims).map(([k, a]) => [k, a.reduce((s, x) => s + x, 0) / a.length]).sort((x, y) => y[1] - x[1]);
  return {
    T, n, t1: T.filter(t => t._tier === 'Tier 1').length, t2: T.filter(t => t._tier === 'Tier 2').length, medEmp: median(T.map(t => t.employees)), medRev: median(T.map(t => t.revenue_est_usd)),
    ff: own['Founder / family'] || 0, unv: own.Unverified || 0, own, states: topN(countBy(T, t => t._state), 6), dimAvg,
    risks: topN(countBy(T.flatMap(t => t.risk_flags || []), x => x), 4), top5: T.slice().sort((x, y) => (y.fit_score || 0) - (x.fit_score || 0)).slice(0, 5),
  };
}
function thesisText(b, p, s, fmt) {
  const T = s.T, heat = b.pe?.meta?.sector_heatmap || {};
  const stateMix = s.states.map(([k, v]) => `${k} ${v}`).join(', ');
  if (p === 'cet') {
    const near = T.filter(t => (t.nearest_cet_node_miles ?? 999) <= 30).length; const ct = T.filter(t => t._state === 'CT').length;
    return `CET’s pool is ${s.n} New England electrical, solar, controls and generator contractors (${stateMix}). ${near} of ${s.n} are within 30 miles of a CET node (Worcester, Taunton, Norwell), and ${ct} are in Connecticut, where Horton (120+ staff, Sept 2026) now gives CET a base. The median target has ${fmt.num(s.medEmp)} staff and ${fmt.money(s.medRev)} of modeled revenue, so these are tuck-ins, not mergers of equals. Ownership is the main risk: ${s.unv} of ${s.n} have unverified ownership and only ${s.ff} are confirmed founder or family-owned. Analyst view: CET should buy capability (W/WW I&C, generators, solar O&M, controls) and Eastern-MA density now. The PE landscape rates the sector “${heat.cet?.intensity || 'medium, rising'}”, and the Kohlberg and Huron electrical platforms have not yet entered New England.`;
  }
  if (p === 'pp') {
    const near = T.filter(t => Math.min(t.distance_mi_from_lancaster ?? 999, t.distance_mi_from_toms_river ?? 999) <= 30).length;
    const tri = T.filter(t => ['hvac', 'plumbing', 'electrical'].every(x => (t.trades || []).includes(x))).length;
    const auth = T.filter(t => /One Hour|Benjamin Franklin|Mister Sparky/i.test(`${t.brands_or_franchise || ''} ${t.company}`)).length;
    const rev1k = T.filter(t => (t.review_count || 0) >= 1000).length;
    return `Punctual Pros has ${s.n} residential HVAC, plumbing and electrical operators screened across PA, NJ, MD and DE (${stateMix}). ${near} of ${s.n} are within 30 miles of Lancaster or Toms River, where they would add route density. ${tri} already run all three trades, ${auth} operate Authority Brands territories that could transfer, and ${rev1k} have 1,000+ reviews. Most are small (median ${fmt.num(s.medEmp)} staff, ${fmt.money(s.medRev)} est. revenue), and ${pctOf(s.ff, s.n)}% are family- or founder-owned, so the likely sellers are owners planning succession. Analyst view: PP has to win proprietary deals before they go to auction. The PE landscape rates the sector “${heat.punctual_pros?.intensity || 'very high'}”, and Sila (Goldman Sachs), Legacy (Gridiron) and Ally (Watchtower) are all buying in its counties.`;
  }
  if (p === 'fl') {
    const catx = T.filter(t => ['CA', 'TX'].includes(t._state)).length; const intl = T.filter(t => t.country && t.country !== 'United States').length;
    const bill = T.filter(t => /billing|rcm|revenue|invoice|accounting/i.test((t.offerings || []).join(' '))).length;
    const small = T.filter(t => t.revenue_est_usd != null && t.revenue_est_usd <= 15e6).length;
    return `Frontline has ${s.n} legal-IT managed-service and law-firm billing/RCM targets (${stateMix}; ${intl} outside the US). ${catx} are in California or Texas, two of the CEO’s stated priority geographies, and ${bill} offer billing, eBilling or RCM services that extend Frontline’s second product line. ${small} of ${s.n} have modeled revenue at or below $15M, which fits the stated tuck-in profile of ~$5M revenue and $1–2M EBITDA. Analyst view: the PE landscape rates the sector “${heat.frontline?.intensity || 'low-medium'}” and finds no sponsor-backed copy of the legal IT + RCM model. The window to lock in law-firm MSP and billing add-ons is open, but it will close once a generalist MSP roll-up (Alpine’s Evergreen) builds a legal vertical.`;
  }
  const cr = T.filter(t => /cleanroom|controlled/i.test((t.offerings || []).join(' ') + ' ' + (t.strategic_rationale || ''))).length;
  const nonNE = T.filter(t => !['NJ', 'NY', 'PA', 'MA', 'CT'].includes(t._state)).length;
  return `Thomas Scientific has ${s.n} lab-supply, life-science and cleanroom distributors (${stateMix}). ${nonNE} are outside Thomas’s Northeast core and would extend its distribution network, and ${cr} bring cleanroom or controlled-environment lines. The screen found no public Thomas acquisition since late 2023, so the platform’s earlier add-on pace (regional distributors: NCI, Quintana, Day, Arrowhead) has stalled. The median target has ${fmt.num(s.medEmp)} staff and ${fmt.money(s.medRev)} of modeled revenue. Analyst view: restart the programme with exclusive line-card and regional-coverage deals. Calibre Scientific (StoneCalibre) is the main bidder, but its focus is mostly Europe, which leaves room in the US.`;
}
const IDEAL = {
  cet: ['25–400 employees and $8–120M revenue (rubric scale band)', '≤30 mi from Worcester, Taunton or Norwell, or in CT near Horton', 'Capabilities that extend CET lines: solar O&M, EV, energy efficiency, W/WW I&C, generators, controls', 'Founder or family owner with a succession need; labour model compatible with CET’s', 'Licensed in several New England states; recurring service/maintenance mix'],
  pp: ['Tri-trade HVAC + plumbing + electrical (rubric trade_mix = 20)', '30–150 employees (rubric scale 17–20)', '≤30 mi from a PP node (Lancaster, Harrisburg, Toms River)', 'Founder or multi-generation family owner with long tenure', 'Authority Brands franchisee, or 1,000+ reviews and ready to rebrand'],
  fl: ['Law-firm-focused MSP or billing/eBilling/RCM provider', 'Tuck-in ~$5M revenue / $1–2M EBITDA; larger targets at $20M+ revenue', 'Priority geographies: California, Texas, Atlanta, South Florida, UK', 'Point solutions, proprietary software or GenAI capability', 'Founder- or partner-owned, with clean SOC 2 / security posture'],
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
    title: 'Platform theses',
    sub: `<b>Four buy-and-build theses, all written from the target pools (${fmt.num(tot)} targets).</b> ${esc(PLAT[best].label)} has the richest actionable pool (${pctOf(S[best].t1 + S[best].t2, S[best].n)}% Tier 1–2). Punctual Pros faces the hardest competition (“${esc(hardest)}” sponsor intensity), and CET has the most open field in New England. Paragraphs marked <span class="analyst">Analyst view</span> are judgement, not reported fact.`,
    chips: PKEYS.map(p => fmt.chip(`${PLAT[p].label}: ${S[p].n} targets · ${S[p].t1} T1`, PLAT[p].color)).join(''),
    actions: `<a class="btn" href="#/ma/pipeline">Pipeline →</a>`,
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
    actions: `<a class="btn xs" href="#/ma/pipeline?platform=${p}">Pipeline →</a>`,
    body: `<div style="--cc:${P.color}">
      <div class="stat-row">${fmt.chip(`median ${fmt.num(s.medEmp)} staff`)}${fmt.chip(`median ${fmt.money(s.medRev)} rev. est.`)}${fmt.chip(`${pctOf(s.ff, s.n)}% founder/family`, 'var(--green)')}${s.unv ? fmt.chip(`${s.unv} ownership unverified`, 'var(--amber)') : ''}${strongest ? fmt.chip(`strongest: ${titleCase(strongest[0])} ${Math.round(strongest[1] * 100)}%`, P.color) : ''}${weakest ? fmt.chip(`weakest: ${titleCase(weakest[0])} ${Math.round(weakest[1] * 100)}%`, 'var(--amber)') : ''}</div>
      <div class="th-h">Thesis <span class="analyst">Analyst view</span></div>
      <div class="h-note">${esc(thesisText(b, p, s, fmt))}</div>
      <div class="th-two"><div><div class="th-h">Ideal target profile</div><ul class="bul">${IDEAL[p].map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><div class="th-h">Integration risks</div><ul class="bul">${riskList.slice(0, 6).map(x => `<li>${x}</li>`).join('')}</ul></div></div>
      <div class="th-h">Top 5 by fit</div>
      <table class="mini"><thead><tr><th>Company</th><th>HQ</th><th class="num">Staff</th><th class="num">Rev. est.</th><th>Owner</th><th class="num">Fit</th></tr></thead><tbody>${s.top5.map(t => `<tr data-tid="${esc(t.id)}"><td class="nm">${esc(t.company)}</td><td>${esc(t.hq_city || '')}${t.hq_city ? ', ' : ''}${esc(t._state)}</td><td class="num">${fmt.num(t.employees)}</td><td class="num">${fmt.money(t.revenue_est_usd)}</td><td>${fmt.chip(t._owner, OWNER_COLOR[t._owner])}</td><td class="num">${fmt.score(t.fit_score)}</td></tr>`).join('')}</tbody></table>
      <div class="th-h">Screen authors’ ranked shortlist (${ranked.length})</div>
      ${ranked.length ? `<ol class="shortlist">${ranked.map(r => `<li data-tid="${esc(r.id)}" style="cursor:pointer" title="${esc(r.why || '')}"><span class="r">${esc(r.rank)}</span><span class="ellipsis">${esc(r.company)}</span><span class="s">${esc(r.fit_score ?? '')}</span></li>`).join('')}</ol>` : ui.empty('No ranked list in dataset')}
      <div class="th-h">Competing sponsor-backed buyers (${comps.length})</div>
      <div class="row wrap gap-4">${comps.slice(0, 12).map(c => { const lbl = clip(String(c.name || '').replace(/\s*\(.*?\)/g, ''), 34); const tip = `${c.name} · owner: ${c.owner}${c.note ? ' · ' + clip(c.note, 140) : ''}`; return c.src ? `<a href="${esc(c.src)}" target="_blank" rel="noopener" title="${esc(tip)}">${fmt.chip(lbl, 'var(--red)')}</a>` : `<span title="${esc(tip)}">${fmt.chip(lbl, 'var(--red)')}</span>`; }).join('')}${comps.length > 12 ? `<span class="soft">+${comps.length - 12} more</span>` : ''}${comps.length ? '' : '<span class="soft">None listed</span>'}</div><div class="soft mt-8">Hover a chip for owner and note; click for source.</div>
    </div>`,
    foot: sourceFoot(ui, meta, `${P.label} add-on screen (ZoomInfo + websites)`),
  });
}

/* Property-transfer demand signal: home and commercial sales gathered in the counties every portfolio company serves (lazy).
   PP and CET counties are joined to their add-on targets; BPI (DC) and Fair Harbor (Manhattan) are HQ-market context;
   Frontline (St. Louis, MO: non-disclosure state) has no records yet and is listed as a next pull; Thomas Scientific (Gloucester NJ) is covered. */
const cname = r => /n\/a/.test(r.county) ? `${r.state} (county n/a)` : `${r.county} ${r.state}`;
const HP = { ...Object.fromEntries(PKEYS.map(p => [p, { label: PLAT[p].label, color: PLAT[p].color }])), bpi: { label: 'BPI', color: 'var(--c-bpi)' }, fh: { label: 'Fair Harbor', color: 'var(--c-fh)' } };
const SALES = [{ n: 'sales/pp_sales_pa_a', p: 'pp' }, { n: 'sales/pp_sales_pa_b', p: 'pp' }, { n: 'sales/pp_sales_nj', p: 'pp' }, { n: 'sales/cet_transfers_ma', p: 'cet' }, { n: 'sales/cet_transfers_ct_ri', p: 'cet' }, { n: 'sales/cet_home_sales_ma', p: 'cet' }, { n: 'sales/cet_home_sales_ct_ri', p: 'cet' }, { n: 'sales/ts_sales_gloucester_nj', p: 'ts' }, { n: 'sales/bpi_sales_dc', p: 'bpi' }, { n: 'sales/fh_sales_nyc', p: 'fh' }];
/* Counties where each portfolio company is headquartered or has an operating base (bsp_firm: HQ and add-on locations). */
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
  // Portfolio-company HQ / operating counties with no gathered records → explicit next pulls.
  const missingHq = PORTCO_COUNTIES.filter(h => !rows.some(r => r.state === h.state && r.county === h.county));
  missingHq.forEach(h => rows.push({ id: `${h.state}|${h.county}|hq`, _list: [], platform: HP[h.p].label, _p: h.p, county: h.county, state: h.state, hq: `${HP[h.p].label}: ${h.why}`, res: null, resPerMo: null, medPrice: null, nonres: null, nonresPerMo: null, window: 'no records gathered', _scr: false, targets: 0, good: 0, top: '', topId: null, signal: 'Pull records' }));
  const totRes = counties.reduce((s, c) => s + c.res, 0), totNon = counties.reduce((s, c) => s + c.nonres, 0);
  const ppT = b.targets.filter(t => t._p === 'pp'); const ppCovered = counties.filter(c => c.p === 'pp').reduce((s, c) => s + c.targets.length, 0);
  const gaps = rows.filter(r => r.signal === 'Sourcing gap').sort((x, y) => (y.resPerMo || y.nonresPerMo || 0) - (x.resPerMo || x.nonresPerMo || 0));
  const dens = rows.filter(r => r.signal === 'Density play').sort((x, y) => y.good - x.good);
  const pulls = rows.filter(r => r.signal === 'Pull records').sort((x, y) => (y.hq ? 1 : 0) - (x.hq ? 1 : 0) || y.targets - x.targets);
  const hqRows = rows.filter(r => r.hq && r.res);
  const coveredCos = [...new Set(hqRows.map(r => r._p))], missingCos = [...new Set(Object.keys(HP).filter(p => !coveredCos.includes(p)))];
  const SIG = { 'Density play': 'var(--green)', 'Sourcing gap': 'var(--amber)', 'Targets, lower turnover': 'var(--accent)', Monitor: 'var(--dim)', 'Pull records': 'var(--red)', 'HQ market': 'var(--cyan)' };
  const srcs = [...new Map(cov.filter(c => c.source_url).map(c => [c.source_url, c])).values()].slice(0, 7);
  const hqTxt = hqRows.filter(r => r.medPrice).sort((x, y) => (y.medPrice || 0) - (x.medPrice || 0)).map(r => `${esc(cname(r))} (${esc(r.platform)}) ${fmt.money(r.medPrice)}, ${fmt.num(r.resPerMo, 0)}/mo`).join('; ');
  host.innerHTML = ui.panel({
    title: TITLE, accent: true,
    sub: `${fmt.num(totRes)} home sales and ${fmt.num(totNon)} commercial/industrial transfers across ${counties.length} counties served by ${Object.keys(HP).filter(p => counties.some(c => c.p === p)).length} portfolio companies (${loaded}/${SALES.length} sales files loaded)`,
    body: `<div class="h-note"><b>So what:</b> ${ppT.length ? `${fmt.num(ppCovered)} of ${fmt.num(ppT.length)} Punctual Pros targets are headquartered in a county with gathered home-sales records. ` : ''}Home turnover (sales per month) is a leading indicator of replacement, repair and new-mover demand. ${dens.length ? `Density plays, meaning high turnover plus Tier 1–2 targets, are strongest in ${dens.slice(0, 3).map(r => esc(cname(r))).join(', ')}.` : ''} ${gaps.length ? `Sourcing gaps, meaning high turnover with no screened target, are ${gaps.slice(0, 3).map(r => esc(cname(r))).join(', ')}: extend the screen there.` : ''} ${hqTxt ? `Portfolio home markets (median home price, sales per month): ${hqTxt}.` : ''} ${missingCos.length ? `No home-sales records yet for ${andList(missingCos.map(p => esc(HP[p].label)))}${missingCos.includes('cet') ? ' (CET pulls hold commercial/industrial transfers only)' : ''}.` : ''} ${pulls.length ? `${pulls.length} counties have no records yet (${pulls.slice(0, 4).map(r => esc(cname(r))).join(', ')}${pulls.length > 4 ? ', …' : ''}), so pull them next.` : ''} <span class="analyst">Analyst view</span></div><div id="ma-house-tbl"></div>`,
    foot: `${srcs.map(c => ui.source(`${c.county} ${c.state}: ${clip(c.source || '', 60)}`, c.source_url, c.date_to)).join('')}<span class="src">CET counties are matched to the nearest county centroid within 45 km (approximate). Records hold each parcel’s last sale. BPI and Fair Harbor rows are HQ-market context (no add-on screen yet).</span>`,
  });
  ctx.ui.table(host.querySelector('#ma-house-tbl'), {
    rows, pageSize: 15, sortKey: 'targets', exportName: 'ma_county_home_sales_vs_targets',
    columns: [
      { key: 'platform', label: 'Portfolio co.', fmt: (v, r) => fmt.chip(v, HP[r._p].color) },
      { key: 'county', label: 'County', fmt: (v, r) => `<b>${esc(v)}</b>, ${esc(r.state)}${r.hq ? ` <span class="chip" style="--cc:${HP[r._p].color}" title="${esc(r.hq)}">HQ/ops</span>` : ''}` },
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
        { label: 'Sources', html: `<div class="col gap-4 small">${cov.filter(c => c.county === r.county && c.state === r.state).map(c => `${c.source_url ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener">${esc(clip(c.source || c.source_url, 80))}</a>` : esc(c.source || '')} <span class="dim">${esc(c.date_from || '')} → ${esc(c.date_to || '')}</span>`).join('') || '<span class="dim">No county records gathered yet</span>'}</div>` },
        { label: 'Next action', html: `<div class="small text-2">${esc(r.signal === 'Pull records' ? `Gather county deed/assessor sales for ${cname(r)} (same method as the PA/NJ/MA/DC/NYC pulls) so ${r.platform} can be read against local housing turnover.` : r.signal === 'HQ market' ? `Use as ${r.platform}’s home-market context (cost-of-living and customer affluence); refresh with each quarterly pull.` : r.signal === 'Sourcing gap' ? 'High turnover and no screened target: run a ZoomInfo radius pass plus franchise-directory check for this county.' : r.signal === 'Density play' ? 'Prioritise outreach to the Tier 1–2 targets here; overlay PP new-mover marketing once acquired.' : 'Keep on watch; re-rank when the next sales pull lands.')}</div>` },
      ].filter(Boolean) }),
  });
}

/* ═══ View 4: Rival platforms ═════════════════════════════════════════════ */
async function rivalsView(ctx) {
  const { el, ui, fmt, esc, params, app } = ctx; injectCss();
  const b = await loadBundle(ctx.data);
  if (!b.rivals) { el.innerHTML = `<div class="m-ma">${ui.pageHead({ title: 'Rival platforms', sub: 'PE-backed and strategic competitors for the same add-ons' })}${ui.note('Research dataset rival_filings is not yet available.', 'warn')}</div>`; return; }
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
    title: 'Rival platforms',
    sub: `<b>${all.length} rival platforms tracked through lender filings, 10-Ks and PPP records. ${stressed.length} show credit stress (PIK interest or lender marks below 95) and ${refi.length} have debt maturing by 2027.</b> Stressed rivals are more likely to sell assets than to bid. ${ppR} of the ${all.length} compete with Punctual Pros, the most contested platform, while the healthy, well-financed consolidators (Wrench, Apex, Redwood, Legacy) set add-on pricing.`,
    chips: `${fmt.chip('Lender marks = one lender’s slice, not the full facility', 'var(--amber)')}${fmt.chip('Estimates labelled est.')}`,
    actions: `<a class="btn" href="#/pe">PE landscape →</a>`,
  }) +
  ui.kpis([
    { label: 'Rival platforms', value: fmt.num(all.length), sub: `${fmt.num(b.rivals.items?.length)} filings parsed`, color: 'var(--red)' },
    { label: 'PE-backed', value: fmt.num(peN), sub: `${pubN} public strategics · ${all.length - peN - pubN} private/other`, color: 'var(--c-pe)' },
    { label: 'Credit stress', value: fmt.num(stressed.length), sub: esc(stressed.slice(0, 3).map(r => r.name).join(', ') || '—'), color: 'var(--red)' },
    { label: 'Refi due ≤2027', value: fmt.num(refi.length), sub: esc(refi.map(r => `${r.name} (${r.maturity})`).slice(0, 2).join(', ') || '—'), color: 'var(--amber)' },
    { label: 'Competing with PP', value: fmt.num(ppR), sub: 'most contested BSP platform', color: 'var(--c-pp)' },
    { label: 'Also on a BSP target list', value: fmt.num(all.filter(r => r.alsoTarget).length), sub: esc(all.filter(r => r.alsoTarget).map(r => r.name).join(', ') || '—'), color: 'var(--green)' },
  ]) +
  `<div class="ma-seg-row mt-12"><span class="lbl">Competes with</span><div id="ma-rseg"></div></div>
  <div id="ma-rtbl"></div>
  <div class="src-line mt-8">Sources: SEC EDGAR BDC schedules of investments (10-Q/10-K, N-PORT), issuer 10-Ks, Form D and SBA PPP FOIA (rival_filings, ${esc(fmt.num(b.rivals.items?.length))} filings) · estimates labelled est. · generated ${esc(m.generated || '—')}</div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Competitive intensity by sector', sub: 'PE landscape heat map: most active sponsors per BSP platform sector. Click a row for detail.', body: `<div class="intens" id="ma-heatrows"></div>`, foot: ui.source('pe_landscape.meta.sector_heatmap', null, b.pe?.meta?.generated) })}
    ${ui.panel({ title: 'What the filings say', sub: 'Synthesis by the research team (rival_filings.meta.financial_picture)', body: `<div class="fp">${(Array.isArray(m.financial_picture) ? m.financial_picture : [m.financial_picture]).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}</div><div class="th-h">Next pulls</div><ul class="bul">${(m.next_pulls || []).slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`, scroll: true, foot: ui.source('SEC EDGAR (BDC 10-Q/10-K, N-PORT, 10-K, Form D), SBA PPP FOIA', 'https://efts.sec.gov/LATEST/search-index', m.generated) })}
  </div></div>`;
  ui.seg(el.querySelector('#ma-rseg'), [{ value: 'all', label: `All (${all.length})` }, ...Object.entries(OVERLAP).map(([k, o]) => ({ value: k, label: `${o.label} (${all.filter(r => r.overlapList.includes(k)).length})` }))], sel, v => app.go('ma', 'rivals', v === 'all' ? undefined : { o: v }));
  const columns = [
    { key: 'name', label: 'Rival', fmt: (v, r) => `<b>${esc(v)}</b>${r.alsoTarget ? ` ${fmt.chip('also a target', 'var(--green)')}` : ''}<div class="small"><span style="color:${r.type === 'PE-backed' ? 'var(--c-pe)' : r.type === 'Public strategic' ? 'var(--accent)' : 'var(--muted)'}">${esc(r.type)}</span> <span class="dim">· ${esc(clip(r.owner, 38))}</span></div>` },
    { key: 'overlapList', label: 'Overlap', sort: (a, c) => a.overlapList.length - c.overlapList.length, fmt: v => v.map(o => fmt.chip(OVERLAP[o]?.label || o, OVERLAP[o]?.color)).join(' ') },
    { key: 'signal', label: 'Credit signal', fmt: v => fmt.chip(v, SIGNAL_COLOR[v]) },
    { key: '_scale', label: 'Revenue', num: true, fmt: (v, r) => r.rev ? `${fmt.money(r.rev)} <span class="dim small">FY${r.revFy}</span>` : r.estRev ? `<span title="${esc(r.estRev.basis)}">${esc(r.estRev.estimate)} <span class="dim small">est.</span></span>` : r.scaleTxt ? `<span class="dim small">${esc(r.scaleTxt)} staff</span>` : '—' },
    { key: 'margin', label: 'Op. margin', num: true, fmt: (v, r) => v != null ? `<span title="${esc(r.marginNote)}">${pctTxt(fmt, v)}</span>` : r.estEbitda ? `<span class="small" title="${esc(r.estEbitda.basis)}">EBITDA ${esc(r.estEbitda.estimate)} est.</span>` : '—' },
    { key: 'maxPar', label: 'Largest visible loan', num: true, fmt: (v, r) => v ? fmt.money(v) : r.ltd ? `${fmt.money(r.ltd)} <span class="dim small">LTD</span>` : '—' },
    { key: 'minMark', label: 'Lender mark', num: true, fmt: (v, r) => v == null ? '—' : `<span style="color:${v < 95 ? 'var(--red)' : v < 98 ? 'var(--amber)' : 'var(--green)'}">${fmt.num(v, 1)}</span>${r.maxMark != null && r.maxMark !== v ? `<span class="dim small">–${fmt.num(r.maxMark, 1)}</span>` : ''}` },
    { key: 'maturity', label: 'Pricing · maturity', fmt: (v, r) => r.spread || v ? `<span class="small num" title="${esc(r.spread || '')}">${r.spread ? esc(shortSpread(r.spread)) + (v ? ' · ' : '') : ''}${v ? esc(String(v).slice(0, 7)) : ''}</span>${r.pik ? ` ${fmt.chip('PIK', 'var(--red)')}` : ''}` : '—' },
    { key: 'ev', label: 'Valuation', num: true, fmt: (v, r) => v ? `${fmt.money(v)} <span class="dim small">EV</span>` : r.price ? `${fmt.money(r.price)} <span class="dim small">deal est.</span>` : '—' },
    { key: 'n', label: 'Filings', num: true, fmt: (v, r) => `${fmt.num(v)} <span class="dim small">${esc(String(r.latest || '').slice(0, 7))}</span>` },
  ];
  const tbl = ui.table(el.querySelector('#ma-rtbl'), { columns, rows, pageSize: 30, sortKey: 'n', exportName: 'ma_rival_platforms', onRow: r => openRival(ctx, b, r, peName) });
  // Intensity rows
  const heatRows = Object.entries(heat).map(([k, h]) => ({ k, h, o: OVERLAP[k] }));
  el.querySelector('#ma-heatrows').innerHTML = heatRows.map(({ k, h, o }) => `<div class="r" data-k="${esc(k)}"><div><div class="co" style="color:${o?.color || 'var(--text)'}">${esc(o?.label || titleCase(k))}</div><div class="soft">${all.filter(r => r.overlapList.includes(k)).length} rivals in filings</div></div><div>${fmt.chip(h.intensity, INTENSITY_COLOR(h.intensity))}</div><div><div class="nt">${esc(h.note || '')}</div><div class="sp">Most active: ${esc((h.most_active || []).map(peName).slice(0, 6).join(', '))}</div></div></div>`).join('') || ui.empty('Sector heat map not available');
  el.querySelectorAll('#ma-heatrows .r').forEach(n => n.onclick = () => { const h = heat[n.dataset.k]; const firms = (h.most_active || []).map(id => (b.pe?.items || []).find(f => f.id === id)).filter(Boolean);
    ctx.inspector.open({ title: esc(OVERLAP[n.dataset.k]?.label || titleCase(n.dataset.k)), sub: `${esc(h.sector)} · intensity ${esc(h.intensity)}`, color: OVERLAP[n.dataset.k]?.color,
      sections: [{ label: 'Read-out', html: `<div class="small text-2">${esc(h.note || '')}</div>` }, { label: `Most active sponsors (${firms.length})`, html: `<div class="m-ma-insp">${firms.map(f => `<div class="it"><div class="t">${esc(f.firm)} ${fmt.chip(`threat ${f.threat_level}`, f.threat_level === 'high' ? 'var(--red)' : f.threat_level === 'medium' ? 'var(--amber)' : 'var(--dim)')}</div><div class="w">${esc(clip(f.threat_rationale || f.strategy || '', 220))}</div>${f.website ? `<div class="kf"><a href="${esc(f.website)}" target="_blank" rel="noopener">${esc(fmt.host(f.website))}</a></div>` : ''}</div>`).join('')}</div>` },
        { label: 'Next action', html: `<div class="small text-2">Review sponsor deal flow in the PE landscape module; flag any target in this sector that a listed sponsor has approached.</div>` }],
      actions: [{ id: 'pe', label: 'Open PE landscape', onClick: () => app.go('pe') }] }); });
  app.index(all.map(r => ({ label: r.name, sub: `Rival platform · ${r.owner}`, href: `#/ma/rivals?r=${r.id}`, kind: 'Rival', color: '#ff5c5c' })));
  if (params.r) { const r = all.find(x => x.id === params.r); if (r) { tbl.select(r.id); openRival(ctx, b, r, peName); } }
}
function openRival(ctx, b, r, peName) {
  const { ui, fmt, esc, inspector, app } = ctx;
  const pe = r.pe ? (b.pe?.items || []).find(f => f.id === r.pe) : null;
  const kfHtml = (kf, prefix) => Object.entries(kf || {}).filter(([k]) => !prefix || k.startsWith(prefix + '_')).slice(0, 12).map(([k, v]) => `${esc(k)}: ${esc(typeof v === 'number' ? v.toLocaleString('en-US') : Array.isArray(v) ? v.join(', ') : v)}`).join(' · ');
  inspector.open({
    title: esc(r.name), color: 'var(--red)', sub: `${esc(r.owner)} · ${esc(r.type)} · ${esc(r.signal)}`,
    sections: [
      { label: 'Snapshot', html: ui.kv({ 'Competes with': r.overlapList.map(o => OVERLAP[o]?.label || o), Revenue: r.rev ? `${fmt.money(r.rev)} (FY${r.revFy}, reported)` : r.estRev ? `${esc(r.estRev.estimate)} est. <span class="dim small">${esc(r.estRev.basis)}</span>` : null, 'Operating margin': r.margin != null ? `${pctTxt(fmt, r.margin)} <span class="dim small">${esc(r.marginNote)}</span>` : null, 'EBITDA (est.)': r.estEbitda ? `${esc(r.estEbitda.estimate)} <span class="dim small">${esc(r.estEbitda.basis)}</span>` : null, 'Largest visible loan': r.maxPar ? fmt.money(r.maxPar) : null, 'Long-term debt': r.ltd ? fmt.money(r.ltd) : null, 'Lender marks': r.minMark != null ? `${fmt.num(r.minMark, 1)}${r.maxMark !== r.minMark ? `–${fmt.num(r.maxMark, 1)}` : ''} (% of par)` : null, Pricing: r.spread ? esc(r.spread) + (r.pik ? ' · PIK' : '') : null, 'Earliest maturity': r.maturity ? esc(r.maturity) : null, Valuation: r.ev ? `${fmt.money(r.ev)} EV` : r.price ? `${fmt.money(r.price)} deal est.` : null }) },
      pe ? { label: `Sponsor · ${pe.firm}`, html: `<div class="small text-2">${esc(clip(pe.threat_rationale || pe.strategy || '', 300))}</div><div class="mt-8">${fmt.chip(`threat ${pe.threat_level}`, pe.threat_level === 'high' ? 'var(--red)' : 'var(--amber)')} ${fmt.chip(`competes for ${pe.competes_for}`)}</div>` } : null,
      { label: `Filings (${r.items.length})`, html: `<div class="m-ma-insp">${r.items.map(({ it, multi }) => `<div class="it"><div class="t">${esc(it.title)}</div><div class="d">${esc(it.filed_or_dated)} · ${esc(it.filer_or_source_agency || '')} · ${esc(String(it.category || '').replace(/_/g, ' '))} · conf. ${esc(it.confidence)}</div><div class="w">${esc(it.what_it_tells_us || '')}</div><div class="kf">${kfHtml(it.key_figures, multi ? r.prefix : null)}</div>${it.source_url ? `<div class="kf"><a href="${esc(it.source_url)}" target="_blank" rel="noopener">${esc(fmt.host(it.source_url) || 'source')} ↗</a></div>` : ''}</div>`).join('')}</div>` },
      r.estRows?.length ? { label: 'Analyst estimates', html: `<ul class="bul m-ma-insp">${r.estRows.map(e => `<li><b>${esc(e.metric)}</b>: ${esc(e.estimate)} <span class="dim">(${esc(e.confidence)})</span></li>`).join('')}</ul>` } : null,
      { label: 'Next action', html: `<div class="small text-2">${esc(r.signal === 'Stressed' ? 'Likely seller rather than bidder: map its branches in BSP platform counties and approach its lenders or sponsor about carve-outs of non-core regions.' : r.signal === 'Refi due' ? 'Refinancing due soon: watch for a sale process or asset disposals; prepare a carve-out bid for overlapping branches.' : r.type === 'Public strategic' ? 'Use as a margin/scale benchmark and a potential exit buyer; track its M&A for price discovery.' : r.alsoTarget ? 'Also on a BSP target list: treat as a possible acquisition, not only a competitor.' : 'Well-financed bidder: avoid auctions it will contest; win proprietary deals on speed and operating credibility.')}</div>` },
    ].filter(Boolean),
    actions: [{ id: 'pe', label: 'PE landscape', onClick: () => app.go('pe') }],
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
  const flCrit = b.flts?.meta?.frontline?.platform_context?.stated_criteria;
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: 'Valuation benchmarks',
    sub: c ? `<b>Across ${fmt.num(c.items?.length)} listed peers, ${esc(hiG?.sector || '—')} is the growth engine (${pctTxt(fmt, hiG?.cagr)} median 3-yr revenue CAGR), and ${esc(hiM?.sector || '—')} earns the richest margins (${pctTxt(fmt, hiM?.em)} median EBITDA margin).</b> BSP’s edge is multiple arbitrage: buy $1–10M-EBITDA add-ons at lower-middle-market prices and exit an integrated platform that trades nearer to scaled-sponsor or strategic prices. Use the calculator to size a deal.` : 'Public comparables dataset is not yet available.',
    chips: `${fmt.chip('SEC XBRL, FY2023–FY2025', 'var(--accent)')}${fmt.chip('EBITDA = op. income + D&A (not adjusted)', 'var(--amber)')}${fmt.chip('LMM 5–9x = analyst assumption', 'var(--c-ma)')}`,
  }) + (c ? '' : ui.note('Research dataset public_comps is not yet available; the calculator still works.', 'warn') + '<div class="mt-12"></div>') +
  ui.kpis([
    { label: 'Public comps', value: fmt.num(c?.items?.length), sub: `${secRows.length} sectors · 10-K / 20-F`, color: 'var(--accent)' },
    { label: 'Richest margins', value: pctTxt(fmt, hiM?.em), sub: `${esc(hiM?.sector || '—')} · median EBITDA margin`, color: 'var(--green)' },
    { label: 'Fastest growth', value: pctTxt(fmt, hiG?.cagr), sub: `${esc(hiG?.sector || '—')} · 3-yr CAGR`, color: 'var(--c-cet)' },
    { label: 'LMM entry band', value: '5–9x', sub: 'EBITDA, private add-ons (analyst assumption)', color: 'var(--c-ma)' },
    { label: 'Largest rival valuation', value: evs[0] ? fmt.money(evs[0].ev) : '—', sub: evs[0] ? `${esc(evs[0].name)} EV (disclosed)` : 'none disclosed', color: 'var(--red)' },
  ]) +
  `<div class="grid grid-main mt-12">
    <div class="col gap-12">${ui.panel({ title: 'Sector medians by BSP platform', sub: 'Click a row for what it implies for the BSP company', body: `<div id="ma-sec"></div>`, flush: false, foot: ui.source('SEC EDGAR XBRL companyfacts (public_comps.meta.sector_benchmarks)', 'https://www.sec.gov/edgar/search/', c?.meta?.generated) })}
    ${ui.panel({ title: 'Margin vs growth regime by sector', sub: 'Median EBITDA margin (latest FY) and median revenue CAGR FY2023 → latest', body: `<div class="th-two"><div><div class="th-h">EBITDA margin</div>${charts.hbar(secRows.map(s => ({ label: s.sector, value: s.em, color: s.em < 0 ? 'var(--red)' : 'var(--green)' })).sort((x, y) => y.value - x.value), { labelW: 150, fmt: v => pctTxt(fmt, v) })}</div><div><div class="th-h">Revenue CAGR</div>${charts.hbar(secRows.map(s => ({ label: s.sector, value: Math.max(0, s.cagr ?? 0), color: 'var(--c-cet)' })).sort((x, y) => y.value - x.value), { labelW: 150, fmt: v => pctTxt(fmt, v) })}</div></div><div class="soft mt-8">Trades (CET, PP) are the growth engine with thin-to-mid margins; lab distribution and agencies are low-growth. ${secRows.some(s => (s.cagr ?? 0) < 0) ? `Negative CAGRs shown as zero: ${esc(secRows.filter(s => (s.cagr ?? 0) < 0).map(s => `${s.sector} ${pctTxt(fmt, s.cagr)}`).join(', '))}.` : ''}</div>`, foot: ui.source('public_comps', null, c?.meta?.generated) })}</div>
    ${ui.panel({ title: 'Implied value calculator', sub: 'Size an add-on and the value created by rolling it into a platform', accent: true, body: `<div class="calc">
        <label>Add-on EBITDA ($M)<input type="number" id="c-ebitda" value="10" min="0.5" max="500" step="0.5"></label>
        <label>Benchmark sector<select id="c-sector">${secRows.map(s => `<option value="${esc(s.id)}">${esc(s.sector)}</option>`).join('')}</select></label>
        <label>Entry multiple <span class="v" id="c-mult-v">7.0x</span><input type="range" id="c-mult" min="5" max="12" step="0.5" value="7"></label>
        <label>Platform exit multiple <span class="v" id="c-exit-v">10.0x</span><input type="range" id="c-exit" min="8" max="14" step="0.5" value="10"></label>
      </div><div class="calc-out" id="c-out"></div><div class="mt-12" id="c-chart"></div>
      ${ui.note('<b>Analyst assumption:</b> private lower-middle-market add-ons typically trade at about 5–9x EBITDA, below public comps and scaled sponsor platforms. The exit multiple is illustrative, not a forecast. Implied revenue uses the sector’s public median EBITDA margin, which LMM targets rarely reach.', 'warn')}`, foot: `<span class="src">Illustrative · not investment advice${flCrit ? ` · Frontline stated tuck-in criteria: ${esc(clip(flCrit, 120))}` : ''}</span>` })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'All public comparables', sub: 'Sortable · click for fiscal-year detail and the 10-K', body: `<div id="ma-comps"></div>`, foot: ui.source('SEC EDGAR XBRL companyfacts + 10-K / 20-F filings (public_comps)', 'https://www.sec.gov/edgar/search/', c?.meta?.generated) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Implications for BSP', sub: 'public_comps.meta.financial_picture', body: `<div class="fp"><p>${esc(c?.meta?.financial_picture || '—')}</p></div>`, scroll: true, foot: ui.source('public_comps synthesis (research team)', null, c?.meta?.generated) })}
    ${ui.panel({ title: 'Benchmark estimate table', sub: 'Metric · estimate · basis · confidence', body: `<div id="ma-est"></div>`, foot: ui.source('public_comps.meta.estimate_table · estimates, not reported figures', null, c?.meta?.generated) })}
  </div></div>`;
  ui.table(el.querySelector('#ma-sec'), { rows: secRows, pageSize: 10, sortKey: 'em', exportName: 'ma_sector_benchmarks', onRow: s => ctx.inspector.open({ title: esc(s.sector), sub: `Benchmarks ${esc(s.bsp || '')} · n=${s.n}`, color: 'var(--c-ma)', sections: [{ label: 'Medians', html: ui.kv({ 'Revenue growth (latest)': pctTxt(fmt, s.growth), 'Revenue CAGR 2023→latest': pctTxt(fmt, s.cagr), 'Operating margin (latest)': pctTxt(fmt, s.om), 'Operating margin (multi-yr avg)': pctTxt(fmt, s.omAvg), 'EBITDA margin (latest)': pctTxt(fmt, s.em), 'Revenue / employee': fmt.money(s.rpe), Comps: esc(s.comps) }) }, { label: 'What this implies for BSP', html: `<div class="small text-2">${esc(s.implies || '')}</div>` }, { label: 'Next action', html: `<div class="small text-2">Use these medians as the “mature state” in the add-on model; price targets on their own EBITDA at an LMM multiple, not at public multiples.</div>` }] }),
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
    onRow: x => ctx.inspector.open({ title: `${esc(x.ticker)} · ${esc(x.company)}`, sub: `${esc(SECTOR_LABEL[x.sector_tag] || x.sector_tag)} · benchmarks ${esc(clip(x.benchmarks_bsp || '', 60))}`, color: 'var(--accent)',
      sections: [{ label: 'Fiscal years', html: `<table class="mini" style="width:100%;font-size:11.5px"><thead><tr><th>FY</th><th class="num">Revenue</th><th class="num">Op. mgn</th><th class="num">EBITDA mgn</th><th class="num">Staff</th></tr></thead><tbody>${(x.fiscal_years || []).map(f => `<tr><td>${esc(f.fy)}</td><td class="num">${fmt.money(f.revenue_usd)}</td><td class="num">${pctTxt(fmt, f.operating_margin_pct)}</td><td class="num">${pctTxt(fmt, f.ebitda_margin_pct)}</td><td class="num">${fmt.num(f.employees)}</td></tr>`).join('')}</tbody></table>` },
        { label: 'What it tells us', html: `<div class="small text-2">${esc(x.what_it_tells_us || x.status_note || '—')}</div>` },
        { label: 'Sources', html: `<div class="col gap-4 small">${x.tenk_url ? `<a href="${esc(x.tenk_url)}" target="_blank" rel="noopener">${esc(x.tenk_form || '10-K')} filed ${esc(x.tenk_filed || '')} ↗</a>` : ''}${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">XBRL companyfacts ↗</a>` : ''}</div>` },
        { label: 'Next action', html: `<div class="small text-2">Use as a margin and productivity benchmark for ${esc(clip(x.benchmarks_bsp || 'the BSP platform', 60))}.</div>` }],
      actions: x.tenk_url ? [{ label: '10-K ↗', href: x.tenk_url }] : [] }) });
  const est = c?.meta?.estimate_table || [];
  const estEl = el.querySelector('#ma-est');
  if (est.length) ui.table(estEl, { rows: est.map((e, i) => ({ ...e, id: i })), pageSize: 8, exportName: 'ma_benchmark_estimates', columns: [{ key: 'metric', label: 'Metric', wrap: true, fmt: v => `<span class="small">${esc(v)}</span>` }, { key: 'estimate', label: 'Estimate', wrap: true, fmt: v => `<b class="small">${esc(v)}</b>` }, { key: 'confidence', label: 'Conf.', fmt: v => fmt.chip(v, v === 'high' ? 'var(--green)' : v === 'medium' ? 'var(--amber)' : 'var(--dim)') }], onRow: e => ctx.inspector.open({ title: esc(e.metric), sub: `Estimate ${esc(e.estimate)}`, color: 'var(--c-ma)', sections: [{ label: 'Basis', html: `<div class="small text-2">${esc(e.basis)}</div>` }, { label: 'Confidence', html: fmt.chip(e.confidence) }] }) });
  else estEl.innerHTML = ui.empty('No estimate table');
  // Calculator
  const $e = el.querySelector('#c-ebitda'), $m = el.querySelector('#c-mult'), $x = el.querySelector('#c-exit'), $s = el.querySelector('#c-sector');
  const secPref = secRows.find(s => s.id === 'residential_home_services') || secRows[0]; if (secPref) $s.value = secPref.id;
  const calc = () => {
    const e = Math.max(0, Number($e.value) || 0) * 1e6, m = Number($m.value), x = Number($x.value); const s = secRows.find(r => r.id === $s.value);
    el.querySelector('#c-mult-v').textContent = `${m.toFixed(1)}x`; el.querySelector('#c-exit-v').textContent = `${x.toFixed(1)}x`;
    const ev = e * m, rev = s?.em > 0 ? e / (s.em / 100) : null, arb = e * (x - m);
    el.querySelector('#c-out').innerHTML = [
      ui.kpi({ label: 'Enterprise value', value: fmt.money(ev), sub: `${fmt.money(e)} EBITDA × ${m.toFixed(1)}x`, color: 'var(--c-ma)' }),
      ui.kpi({ label: 'LMM band (5–9x)', value: `${fmt.money(e * 5)}–${fmt.money(e * 9)}`, sub: 'analyst assumption', color: 'var(--amber)' }),
      ui.kpi({ label: 'Implied revenue', value: rev ? fmt.money(rev) : '—', sub: s ? `at ${pctTxt(fmt, s.em)} ${esc(s.sector)} median margin` : '—', color: 'var(--accent)' }),
      ui.kpi({ label: 'Multiple-arbitrage uplift', value: fmt.money(arb), sub: `(${x.toFixed(1)}x − ${m.toFixed(1)}x) × EBITDA · illustrative`, color: arb >= 0 ? 'var(--green)' : 'var(--red)' }),
    ].join('');
    el.querySelector('#c-chart').innerHTML = `<div class="th-h">Enterprise value by entry multiple</div>${charts.bar([5, 6, 7, 8, 9, 10, 11, 12].map(k => ({ label: `${k}x`, value: e * k, k })), { h: 130, color: 'var(--border-2)', fmt: v => `$${fmt.num(v / 1e6, 0)}M`, highlight: d => d.k === Math.round(m) })}`;
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
      for (const p of f.platforms_relevant || []) { const s = [p.name, p.sector, p.notes].join(' '); if (w.re.test(s) && !(w.exclude && w.exclude.test(s)) && !seen.has(f.id + '|' + p.name)) { seen.add(f.id + '|' + p.name); ev.push({ kind: 'Platform', name: p.name, sector: p.sector, firm: f.firm, fid: f.id, threat: f.threat_level, url: (f.sources || [])[0] || f.website, note: p.notes }); } }
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
  if (!b.pe) { el.innerHTML = `<div class="m-ma">${ui.pageHead({ title: 'White space', sub: 'Hypotheses for the next BSP platform' })}${ui.note('Research dataset pe_landscape is not yet available; white-space hypotheses need its sponsor and deal map.', 'warn')}</div>`; return; }
  const W = buildWhitespace(b); const topW = W[0];
  const bspSectors = b.firm?.firm?.sectors || [];
  const openSectors = [...new Set(W.filter(w => w.stated && !w.held).map(w => w.bspSector))];
  const allSponsors = new Set(W.flatMap(w => w.sponsors)); const deals = W.reduce((s, w) => s + w.deals, 0);
  el.innerHTML = `<div class="m-ma">` + ui.pageHead({
    title: 'White space · next-platform hypotheses',
    sub: `<b>Top hypothesis: ${esc(topW.name)} (score ${topW.score}/100).</b> ${topW.stated && !topW.held ? `BSP lists “${esc(topW.bspSector)}” as a target sector but holds no platform in it.` : ''} ${topW.sponsors.length} sponsors are building platforms there, which shows there will be exit buyers. ${openSectors.length} of BSP’s ${bspSectors.length} stated sectors have no current platform (${esc(openSectors.join(', '))}). These are <b>hypotheses to test</b>, not recommendations.`,
    chips: `${fmt.chip('Analyst hypotheses', 'var(--c-ma)')}${fmt.chip('Evidence: pe_landscape platforms & 2025–26 deals')}${fmt.chip('BSP stated sectors: broadskypartners.com')}`,
    actions: `<button class="btn" id="ma-ws-csv">⇩ CSV</button>`,
  }) +
  ui.kpis([
    { label: 'Candidate sectors', value: fmt.num(W.length), sub: 'derived from sponsor platform & deal map', color: 'var(--c-ma)' },
    { label: 'Open BSP sectors', value: `${openSectors.length}<small>of ${bspSectors.length}</small>`, sub: 'stated target sectors without a platform', color: 'var(--c-bsp)' },
    { label: 'Sponsors active', value: fmt.num(allSponsors.size), sub: `in candidate sectors · of ${b.pe.items?.length} profiled`, color: 'var(--c-pe)' },
    { label: 'Evidence points', value: fmt.num(W.reduce((s, w) => s + w.ev.length, 0)), sub: `${deals} deals in 2025–26`, color: 'var(--accent)' },
    { label: 'Top score', value: `${topW.score}<small>/100</small>`, sub: esc(clip(topW.name, 40)), color: 'var(--green)' },
  ]) +
  `<div class="ws-grid mt-12" id="ma-ws"></div>
  <div class="src-line mt-8">Evidence: pe_landscape (sponsor platforms_relevant and deals_2025_2026), bsp_firm (firm.sectors), public_comps sector benchmarks · generated ${esc(b.pe?.meta?.generated || '—')} · click a card for evidence links and next action</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'How the fit score works', sub: 'Transparent, adjustable. Judgement is labelled.', body: `<ul class="bul"><li><b>Thesis (0–30):</b> 30 if the sector is one of BSP’s stated target sectors with no current platform, 20 if it is stated and BSP already has a platform there, 10 if it is not stated.</li><li><b>Exit demand (0–25):</b> 5 points per distinct sponsor with a platform or 2025–26 deal in the sector (pe_landscape).</li><li><b>Room (0–20):</b> 20 minus 5 per “high-threat” sponsor active in the sector (crowding penalty).</li><li><b>Adjacency (0–25):</b> <span class="analyst">Analyst view</span> how much of the PRG playbook and customer base of an existing BSP platform carries over.</li></ul>`, foot: ui.source('pe_landscape, bsp_firm (firm.sectors), public_comps', null, b.pe?.meta?.generated) })}
    ${ui.panel({ title: 'Next steps', sub: 'Turn hypotheses into a Fund II sourcing plan', body: `<ol class="acts">${W.slice(0, 3).map(w => `<li><span><b>${esc(w.name)}:</b> ${esc(w.next)}</span></li>`).join('')}<li><span><b>Validate with PRG operators:</b> 30-minute interviews with 2 operators per sector on fragmentation, labour model and pricing power.</span></li><li><span><b>Re-score quarterly</b> as the PE landscape is refreshed. A sponsor entering a sector raises exit demand but reduces room.</span></li></ol>` })}
  </div></div>`;
  const host = el.querySelector('#ma-ws');
  host.innerHTML = W.map((w, i) => { const P = w.adj ? PLAT[w.adj] : null; const sc = w.score >= 75 ? 'var(--green)' : w.score >= 60 ? 'var(--accent)' : 'var(--amber)';
    return `<div class="ws" data-id="${esc(w.id)}" style="--cc:${P ? P.color : 'var(--c-bsp)'};--sc:${sc}"><div class="hd"><span class="rk">#${i + 1}</span><h3>${esc(w.name)}</h3><div class="scbig">${w.score}<small>fit / 100</small></div></div>
      <div class="row wrap gap-4">${w.stated ? fmt.chip(w.held ? `BSP sector · ${w.held} held` : 'BSP sector · no platform', w.held ? 'var(--accent)' : 'var(--green)') : fmt.chip('Outside stated sectors', 'var(--dim)')}${P ? fmt.chip(`adjacent: ${P.label}`, P.color) : fmt.chip('adjacent: S+H playbook', 'var(--c-bsp)')}${fmt.chip(`${w.sponsors.length} sponsors`, 'var(--c-pe)')}${w.high.length ? fmt.chip(`${w.high.length} high-threat`, 'var(--red)') : ''}</div>
      <div class="rat">${esc(w.why)}</div>
      <div class="ev"><b>Evidence:</b> ${w.ev.slice(0, 4).map(e => `${esc(e.name)} <span class="dim">(${esc(e.firm.replace(/ - .*$/, ''))})</span>`).join(' · ') || 'no sponsor activity found in dataset'}${w.ev.length > 4 ? ` · +${w.ev.length - 4} more` : ''}</div>
      ${w.benchRow ? `<div class="ev"><b>Nearest public benchmark:</b> ${esc(SECTOR_LABEL[w.bench])}: ${pctTxt(fmt, w.benchRow.median_ebitda_margin_latest_pct)} EBITDA margin, ${pctTxt(fmt, w.benchRow.median_revenue_cagr_2023_latest_pct)} CAGR</div>` : `<div class="ev"><b>Public benchmark:</b> <span class="dim">no listed comp in dataset (next pull)</span></div>`}
      <div class="bd">${w.parts.map(([l, v, m]) => `<div>${esc(l)} <span>${v}/${m}</span><i><b style="width:${(v / m) * 100}%"></b></i></div>`).join('')}</div></div>`; }).join('');
  host.querySelectorAll('.ws').forEach(n => n.onclick = () => { const w = W.find(x => x.id === n.dataset.id); host.querySelectorAll('.ws').forEach(x => x.style.outline = x === n ? '1px solid var(--c-ma)' : ''); openWS(ctx, w); });
  el.querySelector('#ma-ws-csv').onclick = () => ui.exportCSV(W.map((w, i) => ({ rank: i + 1, sector: w.name, score: w.score, thesis: w.parts[0][1], exit_demand: w.parts[1][1], room: w.parts[2][1], adjacency: w.parts[3][1], bsp_sector: w.bspSector, held_by: w.held || '', adjacent_platform: w.adj ? PLAT[w.adj].label : 'S+H playbook', sponsors: w.sponsors.length, high_threat_sponsors: w.high.length, evidence: w.ev.map(e => `${e.name} (${e.firm})`), next_step: w.next })), null, 'ma_whitespace_hypotheses');
  app.index(W.map(w => ({ label: w.name, sub: `White-space hypothesis · fit ${w.score}`, href: '#/ma/whitespace', kind: 'Hypothesis', color: '#f5b73d' })));
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
  tagline: 'Cross-portfolio buy-and-build engine: screened add-ons, platform theses, rival platforms, valuation benchmarks and white space',
  hq: { lat: 40.7536, lon: -73.9832, label: 'Broad Sky Partners, New York, NY' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'pipeline', name: 'Pipeline', icon: '▤', render: pipeline },
    { id: 'theses', name: 'Platform theses', icon: '◇', render: theses },
    { id: 'rivals', name: 'Rival platforms', icon: '⚔', render: rivalsView },
    { id: 'valuation', name: 'Valuation', icon: '$', render: valuation },
    { id: 'whitespace', name: 'White space', icon: '✦', render: whitespace },
  ],
  tour: [
    { order: 800, hash: '#/ma/overview', caption: '<b>Acquisition engine.</b> Every screened add-on across CET, Punctual Pros, Frontline and Thomas Scientific, ranked, with this quarter’s top ten.', narration: 'The acquisition engine ranks every screened add-on across four platforms, with this quarter\'s top ten.', duration: 6500 },
    { order: 810, hash: '#/ma/theses', caption: '<b>Platform theses.</b> Each buy-and-build thesis is written from its target pool, and home-sales turnover in every portfolio company’s counties flags density plays and sourcing gaps.', narration: 'Each thesis comes from its own target pool; county home sales show where housing turnover and target density line up.', duration: 8500 },
    { order: 820, hash: '#/ma/rivals', caption: '<b>Rival platforms.</b> Lender filings show which consolidators are stressed (PIK, sub-95 marks) and are likely sellers rather than bidders.', narration: 'Lender filings flag rival consolidators paying interest in kind: likely sellers, not bidders.', duration: 5500 },
  ],
};
