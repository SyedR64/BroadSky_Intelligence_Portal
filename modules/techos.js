import * as Copy from './copy.js?v=20261009182014';
/* ═══════════════════════════════════════════════════════════════════════════
   Tech enablement — the "OS" program across six BSP companies.
   ServiceOS (Punctual Pros) · GridOS (CET) · FirmOS (Frontline) · LabOS (Thomas Scientific)
   SignalOS (BPI) · HarborOS (Fair Harbor). Smith + Howard (exited Aug 2026) is excluded.
   Datasets: OS program evidence (valuation_evidence, vendor_stack, kpi_benchmark,
             roadmap_assumption), Public comparables (sector medians),
             research/*_filings (estimate tables → calculator defaults).
   Every value-creation number here is an analyst estimate (labelled est.).
   ═══════════════════════════════════════════════════════════════════════════ */
const injectCss = () => { if (!document.getElementById('css-techos')) { const l = document.createElement('link'); l.id = 'css-techos'; l.rel = 'stylesheet'; l.href = 'modules/techos.css?v=20261009182014'; document.head.appendChild(l); } };

const OUT_LINKS = `<a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="index.html" title="BSP Desk landing page">Landing</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="redesigns/index.html" title="Portfolio site concepts + OS program gallery">Site concepts</a>`;
/* ── Platform / OS definitions (copy + calculator wiring) ────────────────── */
const ORDER = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];
const ICON = {
  pp: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  cet: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  fl: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  ts: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
  bpi: '<path d="M2 12h3l3-7 4 14 3-9 2 2h5"/>',
  fh: '<path d="M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/><path d="M12 3v6M9 6l3-3 3 3"/>',
};
const icon = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ''}</svg>`;

const OS = {
  pp: {
    os: 'ServiceOS', co: 'Punctual Pros', color: 'var(--co-pp)', hex: 'var(--co-pp)', rgb: '240,138,60', module: 'pp', page: 'redesigns/punctual-pros/serviceos.html', filings: 'pp_filings', bench: 'residential_home_services', basis: 'ebitda',
    sub: 'Residential HVAC, plumbing & electrical · Central PA + Jersey Shore',
    promise: 'Answer every call, price every job the same way, and turn each visit into a membership.',
    pick: { rev: [/pro forma total revenue/i, 0], ebitda: [/^Adjusted EBITDA/i, 0], debt: [/^Total senior debt/i, 0] },
    mult: { v: 8.0, basis: 'Est. entry EV ~$18–30M on ~$2.6M adj. EBITDA (Punctual Pros public filings), haircut toward the Capstone typical 6.8x and the PKF 5–6x project-heavy band.' },
    owner: 'PRG Operating Partner · Residential services', lead: 'PP COO',
    next: 'Confirm the field-service system of record and pull 12 months of call, ticket and membership data; baseline booking rate and members per technician; put AI call answering on the Lancaster queue before the winter heating peak.',
    fb: { inv: [400000, 900000], ttv: [6, 12], pts: [2, 4], turns: [1, 2.5], rev: [16e6, 28e6], ebitda: 2.6e6, debt: 14e6 },
  },
  cet: {
    os: 'GridOS', co: 'CET', color: 'var(--co-cet)', hex: 'var(--co-cet)', rgb: '76,141,255', module: 'cet', page: 'redesigns/cet/gridos.html', filings: 'cet_filings', bench: 'commercial_electrical_energy', basis: 'ebitda',
    sub: 'CET + NuWave + Horton · electrical, solar, W/WW · New England only',
    promise: 'Bid only what CET can win, run every job on one record, and sell monitoring, not just installs.',
    pick: { rev: [/^Pro forma (?:platform|portfolio company|company)/i, 0], ebitda: [/^Pro forma (?:platform|portfolio company|company)/i, 1], debt: [/^Pro forma senior debt/i, 0] },
    mult: { v: 10.0, basis: 'Est. entry 9–12x EBITDA (CET public filings estimate table); PKF grid rewards service mix and retention.' },
    owner: 'PRG Operating Partner · Infrastructure', lead: 'CET VP Operations',
    next: 'Run the next 30 days of sourced bids through go/no-go scoring; standardise estimating at Worcester and Horton; quote monitoring on NuWave’s installed solar base as a recurring O&M contract.',
    fb: { inv: [800000, 1800000], ttv: [9, 15], pts: [1, 2.5], turns: [0.5, 1.5], rev: [62e6, 105e6], ebitda: 8.5e6, debt: 40e6 },
  },
  fl: {
    os: 'FirmOS', co: 'Frontline', color: 'var(--co-fl)', hex: 'var(--co-fl)', rgb: '157,123,255', module: 'fl', page: 'redesigns/frontline/firmos.html', filings: 'frontline_filings', bench: 'legal_bpo_managed_services', basis: 'ebitda',
    sub: 'Managed IT, cyber & revenue cycle for 800+ law firms',
    promise: 'Resolve tickets at Level 1, get law firms paid faster, and sell security as a measured service.',
    pick: { rev: [/^Revenue \(2025/i, 0], ebitda: [/^Adjusted EBITDA at close/i, 0], debt: [/^Senior debt at close/i, 0] },
    mult: { v: 13.5, basis: 'Midpoint of the 12–15x entry estimate (OS program evidence; Frontline public filings).' },
    owner: 'PRG Operating Partner · Business services', lead: 'Frontline CTO',
    next: 'Choose the PSA of record (ConnectWise vs Kaseya 365); baseline Level-1 resolution and e-billing rejection rates on the top 50 law-firm clients; price a compliance tier backed by automated evidence collection.',
    fb: { inv: [1500000, 3000000], ttv: [6, 12], pts: [1.5, 3], turns: [0.5, 1.5], rev: [100e6, 140e6], ebitda: 18e6, debt: 90e6 },
  },
  ts: {
    os: 'LabOS', co: 'Thomas Scientific', color: 'var(--co-ts)', hex: 'var(--co-ts)', rgb: '46,204,143', module: 'ts', page: 'redesigns/thomas-scientific/labos.html', filings: 'thomas_filings', bench: 'lab_distribution', basis: 'ebitda',
    sub: 'Lab supply distribution since 1900 · Swedesboro NJ',
    promise: 'Move the long tail to self-serve ordering and cut cost-to-serve before the 2027 refinancing.',
    pick: { rev: [/^Current revenue/i, 0], ebitda: [/^Current EBITDA/i, 0], debt: [/first-lien facility/i, 0] },
    mult: { v: 9.0, basis: 'Est. entry EV $430–525M on $40–55M LTM EBITDA ≈ 9.5x (Thomas Scientific public filings), trimmed for flat lab-distribution growth (sector median +1.5%).' },
    owner: 'PRG Operating Partner · Distribution', lead: 'Thomas eCommerce lead',
    next: 'Fund product-data clean-up first, since no storefront fixes bad SKU data. Connect punchout for the top 25 accounts and tie the LabOS KPI pack to lender updates ahead of the December 2027 maturity.',
    fb: { inv: [2000000, 4000000], ttv: [9, 18], pts: [0.5, 1.5], turns: [0.5, 1.0], rev: [250e6, 320e6], ebitda: 30e6, debt: 240e6 },
  },
  bpi: {
    os: 'SignalOS', co: 'BPI', color: 'var(--co-bpi)', hex: 'var(--co-bpi)', rgb: '224,92,138', module: 'bpi', page: 'redesigns/bpi/signalos.html', filings: 'bpi_filings', bench: 'communications_agencies', basis: 'ebitda',
    sub: 'Bully Pulpit International · strategic comms & public affairs',
    promise: 'Turn campaign-cycle monitoring into an always-on subscription with its own revenue line.',
    pick: { rev: [/^Net \(fee\) revenue FY2025/i, 0], ebitda: [/^Adj\. EBITDA FY2025/i, 0], debt: [/^Senior secured debt/i, 0] },
    mult: { v: 10.0, basis: 'PPHC trades ~8.4x; a scaled sponsor exit is est. 10–13x (OS program evidence); entry est. ~10–13x (BPI public filings).' },
    owner: 'PRG Operating Partner · Business services', lead: 'BPI COO',
    next: 'Convert two post-midterm campaign clients to an always-on monitoring retainer by Q1 2027 and report subscription revenue as its own line.',
    fb: { inv: [1000000, 2000000], ttv: [6, 12], pts: [1, 3], turns: [0.5, 2], rev: [85e6, 125e6], ebitda: 22.5e6, debt: 85e6 },
  },
  fh: {
    os: 'HarborOS', co: 'Fair Harbor', color: 'var(--co-fh)', hex: 'var(--co-fh)', rgb: '63,208,224', module: 'fh', page: 'redesigns/fair-harbor/harboros.html', filings: 'fairharbor_filings', bench: 'apparel_dtc', basis: 'revenue',
    sub: 'Sustainable beachwear · DTC + wholesale · NYC',
    promise: 'Fewer returns, more repeat buyers and a tighter seasonal buy: margin first, then the multiple.',
    pick: { rev: [/^2025 net revenue/i, 0], ebitda: [/^2025 EBITDA/i, 0], debt: [/^Funded debt/i, 0] },
    mult: { v: 1.0, basis: 'Entry est. 1.3–2.5x 2021 revenue (Fair Harbor public filings); DTC apparel has de-rated since (sector median growth −1.5%), so 1.0x revenue is used as today’s mark (est.).' },
    owner: 'PRG Operating Partner · Consumer', lead: 'Fair Harbor eCommerce lead',
    next: 'Ship replenishment flows and the fit finder before the summer 2027 drop, set the SS27 buy with demand planning, and report returns and repeat rate monthly.',
    fb: { inv: [300000, 700000], ttv: [4, 9], pts: [2, 5], turns: [0.2, 0.5], rev: [20e6, 35e6], ebitda: 2e6, debt: 5e6 },
  },
};
const PRG = { os: 'Shared PRG layer', co: 'Portfolio Resource Group', color: 'var(--sys-brand)', hex: 'var(--sys-brand)' };
const DEFAULTS = { prob: 70, years: 3 };

/* ── Roadmap: 24 months from Oct 2026 (M0) ───────────────────────────────── */
const START = new Date(2026, 9, 1);
const SPAN = 24;
const monthLabel = (i, long) => { const d = new Date(START.getFullYear(), START.getMonth() + i, 1); return d.toLocaleDateString('en-US', { month: 'short' }) + (long || d.getMonth() === 0 || i === 0 ? ` ’${String(d.getFullYear()).slice(2)}` : ''); };
const WS = [
  { id: 'prg-1', k: 'prg', name: 'Portfolio KPI layer: one dictionary, connectors, monthly pack', s: 0, e: 4, owner: 'PRG Data & Technology lead', deps: [], kpi: 'One KPI definition set across six companies', tool: 'Portal data layer', ms: [{ m: 4, t: 'KPI pack v1' }] },
  { id: 'prg-2', k: 'prg', name: 'Vendor master agreements and security review', s: 1, e: 5, owner: 'PRG Procurement + Frontline security', deps: [], kpi: 'Portfolio pricing on shared vendors', tool: 'MSAs' },
  { id: 'prg-3', k: 'prg', name: 'Quarterly OS value audit in the board pack', s: 3, e: 24, owner: 'PRG Operating Partners', deps: ['prg-1'], kpi: 'Each OS KPI vs baseline, signed off quarterly', tool: 'Board pack', ms: [6, 9, 12, 15, 18, 21].map(m => ({ m, t: 'Q audit' })) },
  { id: 'prg-4', k: 'prg', name: 'Exit data room: 24 months of OS KPI history', s: 18, e: 24, owner: 'PRG + BSP deal team', deps: ['prg-3'], kpi: 'Buyer-verifiable KPI trend lines', tool: 'Data room' },

  { id: 'pp-1', k: 'pp', name: 'FSM audit: pricebook, membership and call data clean-up', s: 0, e: 2, owner: 'PP COO · PRG Residential', deps: ['prg-1'], kpi: 'Baselines for every ServiceOS KPI', tool: 'ServiceTitan' },
  { id: 'pp-2', k: 'pp', name: 'AI call answering + call scoring on the Lancaster queue', s: 1, e: 4, owner: 'PP call-centre manager', deps: ['pp-1'], kpi: 'Booking rate 38% → 59% (kb-pp-1)', tool: 'Avoca', ms: [{ m: 3, t: 'Live for winter peak' }] },
  { id: 'pp-3', k: 'pp', name: 'Good-better-best flat-rate pricebook', s: 3, e: 7, owner: 'PP service manager', deps: ['pp-1'], kpi: 'Avg ticket growth 8% → 14% (kb-pp-2)', tool: 'Profit Rhino' },
  { id: 'pp-4', k: 'pp', name: 'Membership engine: attach at every call, auto-renewals', s: 4, e: 9, owner: 'PP COO', deps: ['pp-2', 'pp-3'], kpi: 'Members per technician → 83 (kb-pp-3)', tool: 'Podium + memberships' },
  { id: 'pp-5', k: 'pp', name: 'Ride-along coaching for comfort advisors', s: 5, e: 9, owner: 'PP sales manager', deps: ['pp-3'], kpi: 'Replacement close rate +9% (kb-pp-4)', tool: 'Rilla' },
  { id: 'pp-6', k: 'pp', name: 'Storm-readiness staffing from the demand model + NWS', s: 6, e: 10, owner: 'PP dispatch lead', deps: ['prg-1'], kpi: 'Missed calls and overtime on storm days', tool: 'Weatherbit + portal' },
  { id: 'pp-7', k: 'pp', name: 'Roll ServiceOS to Horvath (Ocean + Monmouth NJ)', s: 9, e: 13, owner: 'PP COO · Horvath GM', deps: ['pp-2', 'pp-4'], kpi: 'NJ booking rate and members at PA levels', tool: 'Rollout plan' },

  { id: 'cet-1', k: 'cet', name: 'Bid board with go/no-go scoring on sourced opportunities', s: 0, e: 3, owner: 'CET estimating lead · PRG Infrastructure', deps: ['prg-1'], kpi: 'Hard-bid win rate 15% → 30% (kb-cet-1)', tool: 'Portal bid radar' },
  { id: 'cet-2', k: 'cet', name: 'One estimating standard across Worcester, Taunton and Horton', s: 2, e: 7, owner: 'CET estimating lead', deps: ['cet-1'], kpi: 'Bid cycle time and hit rate', tool: 'Accubid Anywhere' },
  { id: 'cet-3', k: 'cet', name: 'Project-management rollout: Worcester → Taunton → Horton (CT)', s: 3, e: 12, owner: 'CET VP Operations', deps: [], kpi: 'Non-optimal field time 35% (kb-cet-2)', tool: 'Procore', ms: [{ m: 12, t: 'Horton on Procore' }] },
  { id: 'cet-4', k: 'cet', name: 'NuWave solar O&M monitoring contracts', s: 4, e: 9, owner: 'NuWave GM', deps: ['prg-2'], kpi: 'Fleet availability 94.7% → 99.1% (kb-cet-3)', tool: 'AlsoEnergy PowerTrack' },
  { id: 'cet-5', k: 'cet', name: 'Horton pump-station SCADA service agreements', s: 6, e: 15, owner: 'Horton GM', deps: ['cet-3'], kpi: 'Recurring W/WW service revenue', tool: 'Ignition SCADA' },
  { id: 'cet-6', k: 'cet', name: 'EV-charging network management offer', s: 10, e: 15, owner: 'NuWave GM', deps: ['cet-4'], kpi: 'Software attach on EVSE installs', tool: 'ChargeLab' },

  { id: 'fl-1', k: 'fl', name: 'PSA/RMM of record: decision and migration', s: 0, e: 5, owner: 'Frontline CTO · PRG Business services', deps: ['prg-2'], kpi: 'One ticket and asset record', tool: 'ConnectWise or Kaseya 365' },
  { id: 'fl-2', k: 'fl', name: 'Level-1 automation and knowledge base', s: 2, e: 8, owner: 'Frontline service-desk director', deps: ['fl-1'], kpi: 'First-level resolution 74% → 90% (kb-fl-3)', tool: 'Rewst' },
  { id: 'fl-3', k: 'fl', name: 'E-billing rules engine for law-firm clients', s: 3, e: 8, owner: 'Frontline revenue-cycle lead', deps: [], kpi: 'Rejections 18% → 11%; days-to-pay 62 → 50', tool: 'BillBlast / eBillingHub' },
  { id: 'fl-4', k: 'fl', name: 'Security posture score + compliance tier', s: 4, e: 10, owner: 'Frontline CISO', deps: ['fl-1'], kpi: 'Security attach and price per seat', tool: 'Vanta / Drata' },
  { id: 'fl-5', k: 'fl', name: 'QBR evidence packs and churn early warning', s: 6, e: 12, owner: 'Frontline client success', deps: ['fl-2', 'fl-4'], kpi: 'Gross dollar churn ≤10% (kb-fl-4)', tool: 'FirmOS dashboards' },
  { id: 'fl-6', k: 'fl', name: 'Shift Level-1 delivery to Hyderabad and Goa', s: 8, e: 14, owner: 'Frontline COO', deps: ['fl-2'], kpi: 'Cost per ticket', tool: 'Runbooks' },

  { id: 'ts-1', k: 'ts', name: 'Product data (PIM) clean-up: SKUs, attributes, pricing', s: 0, e: 4, owner: 'Thomas eCommerce lead · PRG Distribution', deps: ['prg-1'], kpi: 'Accurate, searchable catalogue', tool: 'PIM' },
  { id: 'ts-2', k: 'ts', name: 'Punchout coverage for the top 25 accounts', s: 2, e: 9, owner: 'Thomas key-account lead', deps: ['ts-1'], kpi: 'eProcurement share → 40% (kb-ts-2)', tool: 'Coupa / Jaggaer' },
  { id: 'ts-3', k: 'ts', name: 'B2B storefront with quick reorder', s: 3, e: 10, owner: 'Thomas eCommerce lead', deps: ['ts-1'], kpi: 'Digital share of transactions → 80% (kb-ts-1)', tool: 'Shopify Plus / commercetools' },
  { id: 'ts-4', k: 'ts', name: 'Search and discovery', s: 5, e: 9, owner: 'Thomas eCommerce lead', deps: ['ts-3'], kpi: 'Digital growth 2.1% → 15.6% (kb-ts-3)', tool: 'Algolia' },
  { id: 'ts-5', k: 'ts', name: 'Inventory planning and working-capital release', s: 4, e: 10, owner: 'Thomas supply-chain lead', deps: ['ts-1'], kpi: 'Fill rate and inventory turns', tool: 'Netstock' },
  { id: 'ts-6', k: 'ts', name: 'Lender-ready KPI evidence for the refinancing', s: 10, e: 14, owner: 'Thomas CFO · PRG + deal team', deps: ['ts-3', 'ts-5', 'prg-3'], kpi: 'Cost-to-serve, digital mix, EBITDA bridge', tool: 'Board/lender pack', ms: [{ m: 14, t: 'Loan maturity' }] },
  { id: 'ts-7', k: 'ts', name: 'Long-tail digital assortment expansion', s: 12, e: 18, owner: 'Thomas category management', deps: ['ts-4'], kpi: 'Long-tail revenue share', tool: 'Drop-ship catalogue' },

  { id: 'bpi-1', k: 'bpi', name: 'Monitoring stack consolidation', s: 0, e: 3, owner: 'BPI COO · PRG Business services', deps: ['prg-2'], kpi: 'Tool spend per client', tool: 'Brandwatch + Zignal + Meltwater' },
  { id: 'bpi-2', k: 'bpi', name: 'After the Nov 3 midterms: convert campaign clients to always-on monitoring', s: 1, e: 5, owner: 'BPI managing directors', deps: ['bpi-1'], kpi: 'Retainer share of revenue (kb-bpi-2)', tool: 'SignalOS retainers' },
  { id: 'bpi-3', k: 'bpi', name: 'SignalOS client dashboards (narrative monitor)', s: 2, e: 7, owner: 'BPI digital lead', deps: ['bpi-1'], kpi: 'Seats and renewal rate', tool: 'SignalOS' },
  { id: 'bpi-4', k: 'bpi', name: 'Brand-voice AI drafting workflows', s: 3, e: 6, owner: 'BPI content lead', deps: [], kpi: 'Hours per deliverable (kb-bpi-3)', tool: 'Jasper' },
  { id: 'bpi-5', k: 'bpi', name: 'Subscription pricing and its own P&L revenue line', s: 5, e: 9, owner: 'BPI CFO', deps: ['bpi-3'], kpi: 'Adj. EBITDA 21% → 24.3% (kb-bpi-1)', tool: 'Finance' },
  { id: 'bpi-6', k: 'bpi', name: 'Extend SignalOS to London and Brussels clients', s: 8, e: 12, owner: 'BPI Europe lead', deps: ['bpi-3'], kpi: 'EU subscription revenue', tool: 'SignalOS' },

  { id: 'fh-1', k: 'fh', name: 'Post-purchase and replenishment flows', s: 0, e: 3, owner: 'Fair Harbor eCommerce lead · PRG Consumer', deps: [], kpi: 'Repeat rate 20% → 30% (kb-fh-1)', tool: 'Klaviyo' },
  { id: 'fh-2', k: 'fh', name: 'Fit finder on top styles before summer', s: 1, e: 5, owner: 'Fair Harbor eCommerce lead', deps: [], kpi: 'Online returns 19.3% → 17.4% (kb-fh-2)', tool: 'True Fit / Bold Metrics' },
  { id: 'fh-3', k: 'fh', name: 'SS27 seasonal buy planning', s: 2, e: 6, owner: 'Fair Harbor merchandising', deps: ['prg-1'], kpi: 'Markdown rate and weeks of cover', tool: 'Inventory Planner' },
  { id: 'fh-4', k: 'fh', name: 'Wholesale self-serve ordering for specialty doors', s: 4, e: 8, owner: 'Fair Harbor wholesale lead', deps: ['fh-3'], kpi: 'Reorder rate per door', tool: 'NuORDER' },
  { id: 'fh-5', k: 'fh', name: 'Margin bridge reporting: returns, repeat, markdown', s: 6, e: 9, owner: 'Fair Harbor CFO', deps: ['fh-1', 'fh-2', 'fh-3'], kpi: 'EBITDA margin +2–5 pts (est.)', tool: 'Finance', ms: [{ m: 8, t: 'Summer peak' }] },
];
const MARKERS = [
  { m: 0, t: 'Today', cls: 'now' },
  { m: 12, t: 'Year-1 value audit', cls: '' },
  { m: 14.5, t: 'TS loan maturity · Dec 2027', cls: 'risk' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const num = v => v == null || v === '' || isNaN(v) ? null : Number(v);
const midOf = a => Array.isArray(a) ? (Number(a[0]) + Number(a[1])) / 2 : num(a);
const sum = a => a.reduce((s, x) => s + (Number(x) || 0), 0);
const trim = (x, d) => String(parseFloat(Number(x).toFixed(d)));
const fM = v => { const x = v / 1e6, a = Math.abs(x); return trim(x, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 1 : 2); };
const $M = v => v == null || isNaN(v) ? '—' : `${v < 0 ? '−' : ''}$${fM(Math.abs(v))}M`;
const rangeM = a => a ? `$${fM(a[0])}–${fM(a[1])}M` : '—';
const turnsTxt = (a, basis) => a ? `+${trim(a[0], 2)}–${trim(a[1], 2)}x${basis === 'revenue' ? ' rev.' : ''}` : '—';
const mult = (v, basis) => v == null ? '—' : `${trim(v, 2)}x${basis === 'revenue' ? ' rev.' : ''}`;
const pts = v => v == null ? '—' : `${trim(v, 2)} pts`;
const clip = (s, n = 180) => { s = String(s ?? ''); if (s.length <= n) return s; const c = s.slice(0, n); const i = c.lastIndexOf('. '); return i > n * 0.5 ? c.slice(0, i + 1) : c.replace(/\s+\S*$/, '') + '…'; };
const confColor = c => c === 'high' ? 'var(--sys-good)' : c === 'medium' ? 'var(--sys-warn)' : 'var(--sys-mute-2)';
const unitShort = u => { u = String(u || ''); return /^%/.test(u) ? '%' : /days/.test(u) ? ' d' : /members/.test(u) ? '/tech' : ''; };
const kpiVal = (v, u) => v == null ? 'n/d' : `${trim(v, 1)}${unitShort(u)}`;
const host = u => { try { return new URL(u).hostname.replace('www.', ''); } catch { return ''; } };
const extLink = (u, t) => u ? `<a href="${escAttr(u)}" target="_blank" rel="noopener">${escTxt(t || host(u) || 'source')} ↗</a>` : '';
const escTxt = s => Copy.text(String(s ?? '')).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escAttr = escTxt;
const platColor = k => (OS[k] || PRG).color;
const platChip = (fmt, k) => OS[k] ? fmt.chip(OS[k].co, OS[k].color) : fmt.chip(String(k || ''), 'var(--sys-mute)');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Parse "$16-28M", "~$22M (range $16-28M)", "$65–100M revenue; $6–11M EBITDA", "under $10M" into {lo, hi, point} in USD. */
function parseMoney(str, idx = 0) {
  const s = String(str || ''); const re = /\$\s?(\d+(?:\.\d+)?)\s*(?:[-–]\s*\$?(\d+(?:\.\d+)?))?\s*([MBK])\b/g; const ms = []; let m;
  while ((m = re.exec(s))) { const u = m[3] === 'B' ? 1e9 : m[3] === 'K' ? 1e3 : 1e6; const lo = Number(m[1]) * u, hi = m[2] != null ? Number(m[2]) * u : lo; ms.push({ lo, hi, single: m[2] == null, at: m.index }); }
  if (!ms.length) return null;
  if (/range/i.test(s) && ms.length >= 2 && ms[0].single) return { lo: ms[1].lo, hi: ms[1].hi, point: ms[0].lo };
  if (/point/i.test(s) && ms.length >= 2) { const p = ms.find((x, i) => i > 0 && x.single); return { lo: ms[0].lo, hi: ms[0].hi, point: p ? p.lo : (ms[0].lo + ms[0].hi) / 2 }; }
  const x = ms[Math.min(idx, ms.length - 1)];
  if (/under\s*\$/i.test(s) && x.single) return { lo: 0, hi: x.hi, point: x.hi / 2 };
  return { lo: x.lo, hi: x.hi, point: (x.lo + x.hi) / 2 };
}

/** Value-creation math (all est.). Inputs in USD / % / x / turns / months / years. */
function compute(basis, s) {
  const e0 = s.rev * s.margin / 100, dE = s.rev * s.pts / 100, e1 = e0 + dE;
  let ev0, ev1, effE, effM;
  if (basis === 'revenue') { ev0 = s.rev * s.mult; ev1 = s.rev * (s.mult + s.turns); effE = 0; effM = ev1 - ev0; }
  else { ev0 = e0 * s.mult; ev1 = e1 * (s.mult + s.turns); effE = dE * s.mult; effM = e1 * s.turns; }
  const dEV = ev1 - ev0; const cashYrs = Math.max(0, s.years - s.ttv / 12); const cash = dE * cashYrs;
  const gross = dEV + cash; const net = gross - s.inv; const risk = gross * s.prob / 100 - s.inv;
  const eq0 = ev0 - s.debt; const eq1 = eq0 + net;
  return { e0, dE, e1, ev0, ev1, effE, effM, dEV, cash, cashYrs, gross, net, risk, roi: s.inv > 0 ? gross / s.inv : null, eq0, eq1, eqUp: eq0 > 0 ? net / eq0 : null, payback: dE > 0 ? s.ttv + s.inv / (dE / 12) : null };
}
const scenarioInputs = (p, which) => {
  const lo = which === 'low', hi = which === 'high';
  return { ...p.def, pts: lo ? p.pts[0] : hi ? p.pts[1] : midOf(p.pts), turns: lo ? p.turns[0] : hi ? p.turns[1] : midOf(p.turns), inv: lo ? p.inv[1] : hi ? p.inv[0] : midOf(p.inv), ttv: lo ? p.ttv[1] : hi ? p.ttv[0] : midOf(p.ttv), prob: DEFAULTS.prob, years: DEFAULTS.years };
};

/* ── Shared data bundle ──────────────────────────────────────────────────── */
let _bundle = null;
function load(data) {
  if (_bundle) return _bundle;
  _bundle = (async () => {
    const [ev, comps, ...fil] = await Promise.all([data.research('serviceos_evidence'), data.research('public_comps'), ...ORDER.map(k => data.research(OS[k].filings))]);
    const items = ev?.items || [];
    const byId = new Map(items.map(i => [i.id, i]));
    const kinds = { val: items.filter(i => i.kind === 'valuation_evidence'), vend: items.filter(i => i.kind === 'vendor_stack'), kpi: items.filter(i => i.kind === 'kpi_benchmark'), ra: items.filter(i => i.kind === 'roadmap_assumption') };
    const plats = ORDER.map((k, i) => buildPlat(k, kinds, fil[i], comps, byId, ev));
    const missing = [!ev && 'serviceos_evidence', !comps && 'public_comps', ...ORDER.map((k, i) => !fil[i] && OS[k].filings)].filter(Boolean);
    const usedBy = new Map(); plats.forEach(p => (p.ra?.evidence_ids || []).forEach(id => { if (!usedBy.has(id)) usedBy.set(id, []); usedBy.get(id).push(p.k); }));
    return { ev, comps, items, byId, kinds, plats, P: Object.fromEntries(plats.map(p => [p.k, p])), missing, usedBy };
  })();
  _bundle.then(b => { if (b.missing.length) _bundle = null; }).catch(() => { _bundle = null; });
  return _bundle;
}
function buildPlat(k, kinds, fil, comps, byId, ev) {
  const o = OS[k], fb = o.fb; const ra = kinds.ra.find(r => r.company === k) || null;
  const est = fil?.meta?.estimate_table || [];
  const pick = spec => { const row = est.find(e => spec[0].test(String(e.metric || ''))); if (!row) return null; const r = parseMoney(row.estimate, spec[1]); return r ? { ...r, row } : null; };
  const rev = pick(o.pick.rev), ebitda = pick(o.pick.ebitda), debt = pick(o.pick.debt);
  const inv = ra?.investment_usd || fb.inv, ttv = ra?.time_to_value_months || fb.ttv, ptsR = ra?.ebitda_impact_pct_revenue || fb.pts, turns = ra?.multiple_expansion_turns || fb.turns;
  const revBasis = ra?.revenue_basis_usd || fb.rev;
  const impactUsd = ra?.ebitda_impact_usd || [revBasis[0] * ptsR[0] / 100, revBasis[1] * ptsR[1] / 100];
  const def = { rev: rev?.point ?? midOf(revBasis), ebitda: ebitda?.point ?? fb.ebitda, debt: debt?.point ?? fb.debt, mult: o.mult.v, pts: midOf(ptsR), turns: midOf(turns), inv: midOf(inv), ttv: midOf(ttv), prob: DEFAULTS.prob, years: DEFAULTS.years };
  def.margin = def.rev ? Math.round((def.ebitda / def.rev) * 1000) / 10 : 10;
  const kpis = kinds.kpi.filter(x => x.company === k), vendors = kinds.vend.filter(x => x.company === k);
  const evidence = (ra?.evidence_ids || []).map(id => byId.get(id)).filter(Boolean);
  const bench = comps?.meta?.sector_benchmarks?.[o.bench] || null;
  const premium = ev?.meta?.multiple_premium_summary?.by_platform?.[k] || null;
  const p = { k, ...o, ra, inv, ttv, pts: ptsR, turns, revBasis, impactUsd, def, src: { rev, ebitda, debt }, kpis, vendors, evidence, bench, premium, fromFallback: !ra };
  p.mid = compute(o.basis, scenarioInputs(p, 'mid')); p.low = compute(o.basis, scenarioInputs(p, 'low')); p.high = compute(o.basis, scenarioInputs(p, 'high'));
  return p;
}
const missingNote = (ui, b) => b.missing.length ? ui.note(`Research dataset${b.missing.length > 1 ? 's' : ''} not yet available: <b>${b.missing.map(escTxt).join(', ')}</b>. ${b.missing.includes('serviceos_evidence') ? 'Showing the October 2026 baseline of the OS assumptions; evidence links, vendor stacks and KPI benchmarks are hidden until the file is restored.' : 'Calculator defaults fall back to the roadmap assumption ranges.'}`, 'warn') + '<div class="mt-12"></div>' : '';
const srcFoot = (ui, b, extra) => ui.source(`OS program evidence${extra ? ' + ' + Copy.text(extra) : ''} · analyst assumptions (est.)`, null, b.ev?.meta?.generated || 'Oct 2026');

/* ── Inspectors ──────────────────────────────────────────────────────────── */
function openOS(ctx, b, p) {
  const { ui, fmt, inspector, app } = ctx;
  const kpiRows = p.kpis.map(x => `<tr><td>${escTxt(x.kpi)}<div class="dim">${escTxt(clip(x.target_basis || '', 120))}</div></td><td class="sys-n">${kpiVal(x.baseline, x.unit)}</td><td class="sys-n">${kpiVal(x.target, x.unit)}</td></tr>`).join('');
  inspector.open({
    title: `${escTxt(p.os)} <span class="dim" style="font-weight:500">· ${escTxt(p.co)}</span>`, sub: escTxt(p.sub), color: p.color,
    sections: [
      { label: 'Promise', html: `<div class="m-techos-i"><div class="lede">${escTxt(p.promise)}</div></div>` },
      { label: 'Value case (est.)', html: ui.kv({ 'OS investment': rangeM(p.inv), 'EBITDA uplift': `${pts(p.pts[0])}–${pts(p.pts[1])} of revenue · ${rangeM(p.impactUsd)}`, 'Multiple expansion': `${turnsTxt(p.turns, p.basis)} <span class="dim small">${escTxt(p.ra?.multiple_basis || '')}</span>`, 'Time to value': `${p.ttv[0]}–${p.ttv[1]} months`, 'Revenue basis': `${rangeM(p.revBasis)} <div class="dim small">${escTxt(p.ra?.revenue_source || 'October 2026 baseline')}</div>`, 'EBITDA today (est.)': escTxt(p.ra?.current_ebitda_estimate || $M(p.def.ebitda)), 'Mid-case EV created': `<b>${$M(p.mid.dEV)}</b> <span class="dim small">gross, before execution haircut</span>` }) },
      p.ra?.rationale ? { label: 'Why this range', html: `<div class="small text-2">${escTxt(p.ra.rationale)}</div>` } : null,
      p.kpis.length ? { label: 'KPIs it moves · industry baseline → best-in-class', html: `<div class="m-techos-i"><div class="sys-table-wrap"><table class="sys-table mini"><thead><tr><th>KPI</th><th class="sys-n">Base</th><th class="sys-n">Target</th></tr></thead><tbody>${kpiRows}</tbody></table></div></div>` } : null,
      p.vendors.length ? { label: `Build vs buy · ${p.vendors.length} named vendors`, html: `<div class="m-techos-i">${p.vendors.map(v => `<div class="it"><div class="t">${escTxt(v.vendor)} <span class="dim">· ${escTxt(v.category)}</span></div><div class="d">${escTxt(clip(v.what_it_does, 150))}</div>${v.pricing_note ? `<div class="d dim">${escTxt(clip(v.pricing_note, 140))}</div>` : ''}<div class="d">${extLink(v.source_url)}</div></div>`).join('')}</div>` } : null,
      p.evidence.length ? { label: `Evidence · ${p.evidence.length} linked items`, html: `<div class="m-techos-i">${p.evidence.filter(e => e.kind === 'valuation_evidence').map(e => `<div class="it"><div class="t">${escTxt(e.title)}</div><div class="d">${fmt.chip(e.confidence || 'n/d', confColor(e.confidence))} <span class="dim">${escTxt(e.source_name || '')} · ${escTxt(e.date || '')}</span></div><div class="d">${extLink(e.source_url)}</div></div>`).join('')}</div>` } : null,
      p.bench ? { label: 'Public comps tie-in', html: ui.kv({ Sector: escTxt(p.bench.bsp_company ? `${titleSector(p.k)} · ${p.bench.n} comps` : titleSector(p.k)), Comps: escTxt((p.bench.comps || []).join(', ')), 'Median EBITDA margin': `${trim(p.bench.median_ebitda_margin_latest_pct, 1)}%`, 'Median revenue growth': `${trim(p.bench.median_revenue_growth_latest_pct, 1)}%`, [`${p.co} today (est.)`]: `${trim(p.def.margin, 1)}% EBITDA margin → ${trim(p.def.margin + midOf(p.pts), 1)}% with ${escTxt(p.os)} (mid)` }) } : null,
      { label: 'Next action', html: `<div class="small text-2">${escTxt(p.next)}</div><div class="dim small mt-8">PRG owner: ${escTxt(p.owner)} · company lead: ${escTxt(p.lead)}</div>` },
    ].filter(Boolean),
    actions: [
      { label: `${escTxt(p.os)} page ↗`, href: p.page },
      { id: 'tx-calc', label: 'Model it', onClick: () => app.go('techos', 'calculator', { co: p.k }) },
      { id: 'tx-road', label: 'Roadmap', onClick: () => app.go('techos', 'roadmap', { co: p.k }) },
      { id: 'tx-mod', label: `${escTxt(p.co)} module`, onClick: () => app.go(p.module, 'overview') },
    ],
  });
}
const SECTOR_LABEL = { residential_home_services: 'Residential home services', commercial_electrical_energy: 'Commercial electrical & energy', legal_bpo_managed_services: 'Legal / BPO managed services', lab_distribution: 'Lab distribution', communications_agencies: 'Communications agencies', apparel_dtc: 'Apparel DTC' };
const titleSector = k => SECTOR_LABEL[OS[k]?.bench] || '';

function openEvidence(ctx, b, e) {
  const { ui, fmt, inspector } = ctx;
  const used = (b.usedBy.get(e.id) || []).map(k => OS[k]);
  const isVal = e.kind === 'valuation_evidence', isKpi = e.kind === 'kpi_benchmark', isVend = e.kind === 'vendor_stack';
  const links = [e.source_url, ...(e.related_urls || [])].filter(Boolean);
  inspector.open({
    title: escTxt(e.title || e.kpi || e.vendor || e.id), sub: `${escTxt(isVal ? 'Valuation evidence' : isKpi ? 'KPI benchmark' : isVend ? 'Vendor stack' : e.kind)} · ${escTxt(e.id)}${e.date ? ' · ' + escTxt(e.date) : ''}`, color: 'var(--sys-brand)',
    sections: [
      isVal ? { label: 'Claim', html: `<div class="small text-2">${escTxt(e.claim)}</div>` } : null,
      isVal ? { label: 'Metric', html: ui.kv({ Value: e.metric_value != null ? `<b class="num">${escTxt(fmtMetric(e))}</b>` : 'qualitative', Unit: escTxt(e.metric_unit), Range: e.metric_range ? escTxt(e.metric_range.join(' – ')) : null, Confidence: fmt.chip(e.confidence || 'n/d', confColor(e.confidence)), Source: escTxt(e.source_name), Dated: escTxt(e.date) }) } : null,
      isVal && e.extra_metrics ? { label: 'Supporting figures', html: ui.kv(Object.fromEntries(Object.entries(e.extra_metrics).map(([k, v]) => [k.replace(/_/g, ' '), `<span class="num">${escTxt(v)}</span>`]))) } : null,
      isKpi ? { label: 'Benchmark', html: ui.kv({ KPI: escTxt(e.kpi), Baseline: `<b class="num">${kpiVal(e.baseline, e.unit)}</b>${e.baseline_range ? ` <span class="dim small">(${escTxt(e.baseline_range.join('–'))})</span>` : ''}`, Target: `<b class="num">${kpiVal(e.target, e.unit)}</b>${e.target_range ? ` <span class="dim small">(${escTxt(e.target_range.join('–'))})</span>` : ''}`, Unit: escTxt(e.unit), Lever: escTxt(e.lever) }) } : null,
      isKpi ? { label: 'Basis', html: `<div class="small text-2"><b>Baseline.</b> ${escTxt(e.baseline_basis || '—')}</div><div class="small text-2 mt-8"><b>Target.</b> ${escTxt(e.target_basis || '—')}</div>` } : null,
      isVend ? { label: 'What it does', html: `<div class="small text-2">${escTxt(e.what_it_does)}</div>` } : null,
      isVend ? { label: 'Pricing', html: `<div class="small text-2">${escTxt(e.pricing_note || 'Not published')}</div>` } : null,
      e.note ? { label: 'Analyst note', html: `<div class="small text-2">${escTxt(e.note)}</div>` } : null,
      (e.applies_to || e.company) ? { label: 'Applies to', html: `<div class="row wrap gap-4">${[].concat(e.applies_to || e.company).map(k => platChip(fmt, k)).join('')}</div>` } : null,
      used.length ? { label: 'Cited by', html: `<div class="small text-2">${used.map(o => `<b>${escTxt(o.os)}</b> value case`).join(' · ')}</div>` } : null,
      { label: 'Sources', html: `<div class="col gap-4 small">${links.map(u => extLink(u, host(u))).join('') || '—'}</div>` },
    ].filter(Boolean),
    actions: links[0] ? [{ label: 'Open source ↗', href: links[0] }] : [],
  });
}
const fmtMetric = e => { const v = num(e.metric_value); if (v == null) return '—'; if (/USD billions/.test(e.metric_unit || '')) return `$${trim(v, 1)}B`; if (/USD/.test(e.metric_unit || '') && v >= 1e6) return `$${v >= 1e9 ? trim(v / 1e9, 1) + 'B' : trim(v / 1e6, 0) + 'M'}`; if (/^x/.test(e.metric_unit || '')) return `${trim(v, 1)}x`; if (/^%/.test(e.metric_unit || '')) return `${trim(v, 1)}%`; return trim(v, 1); };

/* ══ View: Overview ═════════════════════════════════════════════════════════ */
async function overview(ctx) {
  const { el, ui, fmt, app, params } = ctx; injectCss();
  const b = await load(ctx.data); const P = b.plats; const ev = b.ev; const prem = ev?.meta?.multiple_premium_summary;
  const inv = [sum(P.map(p => p.inv[0])), sum(P.map(p => p.inv[1]))];
  const imp = [sum(P.map(p => p.impactUsd[0])), sum(P.map(p => p.impactUsd[1]))];
  const dEV = sum(P.map(p => p.mid.dEV)), riskNet = sum(P.map(p => p.mid.risk));
  const ttvLo = Math.min(...P.map(p => p.ttv[0])), ttvHi = Math.max(...P.map(p => p.ttv[1]));
  const ebP = P.filter(p => p.basis === 'ebitda');
  const tLo = Math.min(...ebP.map(p => p.turns[0])), tHi = Math.max(...ebP.map(p => p.turns[1]));
  const lead = [...P].sort((a, b2) => b2.mid.dEV - a.mid.dEV)[0];
  const ve = id => b.byId.get(id);

  el.innerHTML = `<div class="m-techos">${ui.pageHead({
    title: 'Tech enablement',
    sub: `Six operating systems, one per company, cost an est. <b>${rangeM(inv)}</b> for <b>${rangeM(imp)}</b> of run-rate EBITDA. The mid case adds ≈<b>${$M(dEV)}</b> of value; ${escTxt(lead.os)} at ${escTxt(lead.co)} is the largest.`,
    chips: `${fmt.chip('OS program', 'var(--sys-brand)')}${fmt.chip('est. · analyst assumptions', 'var(--sys-warn)')}${b.items.length ? fmt.chip(`${b.items.length} evidence items`, 'var(--sys-brand)') : fmt.chip('October 2026 baseline', 'var(--sys-warn)')}${fmt.chip('Excludes Smith + Howard', 'var(--sys-mute-2)')}`,
    actions: `${OUT_LINKS}<button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" data-go="evidence">Evidence</button><button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" data-go="roadmap">Roadmap</button><button class="sys-btn sys-btn--primary sys-btn--sm btn sm primary" data-go="calculator">Open calculator →</button>`,
  })}
  ${missingNote(ui, b)}
  ${ui.kpis([
    { label: 'OS programs', value: '6', sub: 'One per active company', color: 'var(--sys-brand)' },
    { label: 'Investment (est.)', value: rangeM(inv), sub: 'Software, implementation, change mgmt', color: 'var(--sys-brand)' },
    { label: 'Run-rate EBITDA uplift', value: rangeM(imp), sub: 'Revenue est. × margin pts', color: 'var(--sys-good)' },
    { label: 'Multiple re-rating', value: `+${trim(tLo, 1)}–${trim(tHi, 1)}x`, sub: 'EV/EBITDA turns credited to tech · HarborOS on revenue', color: 'var(--co-fl)' },
    { label: 'Mid-case EV created', value: $M(dEV), sub: `Gross · ${$M(riskNet)} net at ${DEFAULTS.prob}% delivery`, color: 'var(--sys-good)' },
    { label: 'Time to first value', value: `${ttvLo}–${ttvHi} mo`, sub: 'HarborOS first, LabOS last', color: 'var(--sys-warn)' },
  ])}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'The thesis', sub: 'Why tech enablement is a multiple story, not an IT budget', accent: true, body: thesisHtml(b, ve), foot: srcFoot(ui, b, 'PKF, Capstone/IMAP, ServiceTitan') })}
    ${ui.panel({ title: 'Where the value sits', sub: 'EV created per $1 of OS spend vs months to first value · bubble = mid-case EV created (est.)', body: `<div id="tx-matrix"></div>`, foot: srcFoot(ui, b) })}
  </div>
  <div class="tx-sec"><h2 class="sys-card-title">Six operating systems</h2><span class="sys-muted small">Click a card for the full value case, vendor stack and evidence trail.</span></div>
  <div class="sys-grid tx-cards" id="tx-cards">${P.map(p => osCard(ctx, p)).join('')}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Value bridge by company', sub: 'Mid case · EV from the EBITDA uplift vs EV from multiple re-rating (est.)', body: bridgeHtml(P), actions: `<button class="sys-btn sys-btn--secondary sys-btn--sm btn xs" id="tx-ov-csv">⇩ CSV</button>`, foot: srcFoot(ui, b, 'company public filings') })}
    ${ui.panel({ title: 'What the evidence does and does not support', sub: 'Read before quoting any number on this page', body: limitsHtml(b, prem), foot: srcFoot(ui, b) })}
  </div></div>`;

  el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => app.go('techos', x.dataset.go));
  const unMatrix = drawMatrix(el.querySelector('#tx-matrix'), P, k => openOS(ctx, b, b.P[k]));
  const cards = el.querySelectorAll('.os-card');
  const sel = k => { cards.forEach(c => c.classList.toggle('sel', c.dataset.k === k)); openOS(ctx, b, b.P[k]); };
  cards.forEach(c => { c.onclick = e => { if (e.target.closest('a,button')) return; sel(c.dataset.k); }; c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(c.dataset.k); } }; });
  el.querySelectorAll('[data-calc]').forEach(x => x.onclick = e => { e.stopPropagation(); app.go('techos', 'calculator', { co: x.dataset.calc }); });
  el.querySelectorAll('[data-road]').forEach(x => x.onclick = e => { e.stopPropagation(); app.go('techos', 'roadmap', { co: x.dataset.road }); });
  el.querySelectorAll('.tx-bridge .br[data-k]').forEach(r => r.onclick = () => openOS(ctx, b, b.P[r.dataset.k]));
  el.querySelector('#tx-ov-csv').onclick = () => ui.exportCSV(P.map(p => ({ os: p.os, company: p.co, investment_low_usd: p.inv[0], investment_high_usd: p.inv[1], ebitda_uplift_pts_low: p.pts[0], ebitda_uplift_pts_high: p.pts[1], ebitda_uplift_low_usd: Math.round(p.impactUsd[0]), ebitda_uplift_high_usd: Math.round(p.impactUsd[1]), multiple_turns_low: p.turns[0], multiple_turns_high: p.turns[1], multiple_basis: p.basis === 'revenue' ? 'EV/revenue' : 'EV/EBITDA', time_to_value_months: `${p.ttv[0]}-${p.ttv[1]}`, mid_ev_created_usd: Math.round(p.mid.dEV), mid_ebitda_effect_usd: Math.round(p.mid.effE), mid_multiple_effect_usd: Math.round(p.mid.effM), label: 'est. analyst assumption' })), null, 'techos_os_program');
  if (params.os && b.P[params.os]) sel(params.os);
  ctx.app.index(P.map(p => ({ label: `${p.os} · ${p.co}`, sub: `OS program · ${rangeM(p.inv)} · ${turnsTxt(p.turns, p.basis)}`, href: `#/techos/overview?os=${p.k}`, kind: 'OS', color: 'var(--sys-brand)' })));
  return unMatrix;
}

function thesisHtml(b, ve) {
  const pkf = ve('ve-05'), cap = ve('ve-06'), ch = ve('ve-01'), sila = ve('ve-02'), st = ve('ve-08');
  const prem = b.ev?.meta?.multiple_premium_summary;
  const nV = b.kinds.vend.length;
  const beats = [
    { k: pkf ? `${trim(pkf.metric_range?.[0] ?? 5, 1)}–6x → ${trim(pkf.metric_value, 0)}x+` : '5–6x → 10x+', h: 'Buyers pay for predictability', d: pkf ? 'PKF’s 2026 HVAC grid puts project-heavy, low-retention firms at 5–6x EBITDA and repeatable-service firms with in-house capabilities at 10x+. Capstone/IMAP see a 3.0-turn spread between typical (6.8x) and premium (9.8x) middle-market deals.' : 'Banker grids price repeatable, visible earnings well above project-heavy work.', src: pkf },
    { k: nV ? `${nV} vendors` : 'Proven vendors', h: 'Assemble, don’t build', d: 'Each OS is a named, buyer-legible stack of proven vendors (ServiceTitan, Procore, ConnectWise/Kaseya, Shopify Plus, Brandwatch, Klaviyo) plus a thin BSP data layer from this portal. No custom software risk.', src: null },
    { k: st ? `${st.extra_metrics?.top_quartile_gtv_growth_pct ?? 20}% vs ${st.extra_metrics?.bottom_quartile_gtv_growth_pct ?? 8}%` : '20% vs 8%', h: 'Adoption shows up in growth', d: 'ServiceTitan’s S-1 shows heavy ServiceTitan users growing GTV 20% versus 8% for light users; pricebook adopters grew ticket 14% versus 8%. The KPIs are measurable within two quarters.', src: st },
    { k: `+${trim(0.5, 1)}–2.5x`, h: 'Credit only a fraction', d: `Champions (${ch ? trim(ch.metric_value, 1) : '18.5'}x) and Sila (${sila ? trim(sila.metric_value, 0) : '17'}x) are scale prints. This program credits tech with 0.5–2.5 turns, inside the ${cap ? trim(cap.metric_value, 1) : '3.0'}-turn quality spread.`, src: ch },
  ];
  return `<div class="tx-thesis"><p class="hl">${escTxt(prem?.headline || 'Services businesses with recurring, visible, tech-enabled earnings trade at a premium; tech can credibly claim part of it.')}</p>
    <div class="sys-grid beats">${beats.map((x, i) => `<div class="sys-card sys-card--flat beat"><div class="sys-card-label n">0${i + 1}</div><div class="sys-kpi-value k">${escTxt(x.k)}</div><div class="sys-card-title h">${escTxt(x.h)}</div><div class="sys-card-body d">${escTxt(x.d)}</div>${x.src?.source_url ? `<div class="s">${extLink(x.src.source_url, x.src.source_name ? clip(x.src.source_name, 48) : host(x.src.source_url))}</div>` : ''}</div>`).join('')}</div></div>`;
}

function osCard(ctx, p) {
  const { fmt } = ctx;
  const hiConf = p.evidence.filter(e => e.confidence === 'high').length;
  const kp = p.kpis.slice(0, 3);
  return `<article class="sys-card sys-card--link os-card" data-co="" data-k="${p.k}" tabindex="0" role="button" aria-label="${escAttr(`${p.os} for ${p.co}: open value case`)}" style="--co:${p.hex};--cc:${p.hex}">
    <div class="os-top"><span class="os-glyph">${icon(p.k, 20)}</span><div class="grow"><div class="sys-card-title os-name">${escTxt(p.os)}</div><div class="os-co">${escTxt(p.co)} · ${escTxt(p.sub.split(' · ').slice(-1)[0])}</div></div><span class="os-turns num" title="Multiple expansion credited (est.)">${turnsTxt(p.turns, p.basis)}</span></div>
    <p class="sys-card-body os-promise">${escTxt(p.promise)}</p>
    <div class="os-stats">
      <div><span>Investment</span><b class="num">${rangeM(p.inv)}</b></div>
      <div><span>EBITDA uplift</span><b class="num">${rangeM(p.impactUsd)}</b></div>
      <div><span>First value</span><b class="num">${p.ttv[0]}–${p.ttv[1]} mo</b></div>
      <div><span>EV created</span><b class="num">${$M(p.mid.dEV)}</b></div>
    </div>
    ${kp.length ? `<div class="os-kpis"><div class="sys-card-label lbl">KPIs it moves <span>industry baseline → best-in-class</span></div>${kp.map(x => { const bl = num(x.baseline), tg = num(x.target); const w = bl != null && tg ? clamp((Math.min(bl, tg) / Math.max(bl, tg)) * 100, 4, 100) : 0; const down = bl != null && tg != null && tg < bl; return `<div class="kr"><span class="kn">${escTxt(clip(x.kpi, 46))}</span><span class="kval num">${kpiVal(x.baseline, x.unit)} <i>→</i> <b>${kpiVal(x.target, x.unit)}</b></span><span class="kb ${down ? 'down' : ''}"><i style="width:${w}%"></i></span></div>`; }).join('')}</div>` : ''}
    ${p.vendors.length ? `<div class="sys-chips os-stack">${p.vendors.slice(0, 5).map(v => `<span class="sys-chip">${escTxt(v.vendor.replace(/\s*\(.*\)\s*/, ''))}</span>`).join('')}</div>` : ''}
    <div class="sys-card-foot os-foot"><span class="dim">${p.evidence.length ? `${p.evidence.length} evidence · ${hiConf} high-conf.` : 'October 2026 baseline'}</span><span class="grow"></span><a href="${escAttr(p.page)}" target="_blank" rel="noopener">OS page ↗</a><button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-road="${p.k}">Roadmap</button><button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-calc="${p.k}">Model it →</button></div>
  </article>`;
}

function drawMatrix(host, P, onPick) {
  if (!host) return () => {};
  const D = P.map(p => ({ p, x: midOf(p.ttv), x1: p.ttv[0], x2: p.ttv[1], y: p.mid.dEV / Math.max(1, midOf(p.inv)), r: Math.sqrt(Math.max(0, p.mid.dEV)) }));
  const step = Math.max(...D.map(d => d.y)) > 30 ? 10 : 5; const yMax = Math.ceil((Math.max(...D.map(d => d.y), 10) * 1.25) / step) * step; const xMax = 20, rMax = Math.max(...D.map(d => d.r), 1);
  const yt = []; for (let v = 0; v <= yMax; v += step) yt.push(v);
  const draw = () => {
    const W = Math.max(200, host.clientWidth - 52), H = host.clientWidth < 520 ? 260 : 330;
    const X = v => (v / xMax) * W, Y = v => H - (v / yMax) * H; const compact = W < 420;
    const size = d => 14 + (d.r / rMax) * 30;
    // greedy label placement: try right, left, above, below; avoid bubbles and placed labels
    const boxes = D.map(d => { const s = size(d); return { x: X(d.x) - s / 2, y: Y(d.y) - s / 2, w: s, h: s }; });
    const hit = (a, b2) => a.x < b2.x + b2.w && a.x + a.w > b2.x && a.y < b2.y + b2.h && a.y + a.h > b2.y;
    const placed = [];
    const labels = [...D].sort((a, b2) => b2.y - a.y).map(d => {
      const s = size(d), cx = X(d.x), cy = Y(d.y), w = compact ? d.p.os.length * 7 + 8 : Math.max(d.p.os.length * 7.4, 64) + 8, h = compact ? 18 : 30;
      const cands = [[cx + s / 2 + 5, cy - h / 2], [cx - s / 2 - 5 - w, cy - h / 2], [cx - w / 2, cy - s / 2 - h - 2], [cx - w / 2, cy + s / 2 + 2], [cx + s / 2 + 5, cy - h - 2], [cx + s / 2 + 5, cy + 2], [cx - s / 2 - 5 - w, cy - h - 2], [cx - s / 2 - 5 - w, cy + 2], [cx - w / 2, cy + s / 2 + h + 4], [cx - w - 2, cy + s / 2 + 2], [cx + 2, cy + s / 2 + 2], [cx - w / 2, cy - s / 2 - 2 * h - 4]];
      const ov = (a, o) => Math.max(0, Math.min(a.x + a.w, o.x + o.w) - Math.max(a.x, o.x)) * Math.max(0, Math.min(a.y + a.h, o.y + o.h) - Math.max(a.y, o.y));
      let best = null, bestCost = Infinity;
      for (const [lx, ly] of cands) { const bx = { x: lx, y: ly, w, h }; if (lx < -30 || lx + w > W + 14 || ly < -4 || ly + h > H + 4) continue; const cost = [...boxes, ...placed].reduce((a, o) => a + ov(bx, o), 0); if (cost < bestCost) { best = bx; bestCost = cost; } if (cost === 0) break; }
      if (!best) best = { x: Math.min(W - w, cx + s / 2 + 5), y: cy - h / 2, w, h };
      placed.push(best); return { d, ...best };
    });
    host.innerHTML = `<div class="tx-matrix" role="img" aria-label="EV created per dollar of OS spend versus months to first value for six OS programs">
      <div class="plot" style="height:${H}px">
        <div class="q">Fast + high return: fund first</div>
        ${yt.map(v => `<div class="gy" style="top:${Y(v)}px"><span>${v}x</span></div>`).join('')}
        ${[6, 12, 18].map(v => `<div class="gx" style="left:${X(v)}px"><span>${v} mo</span></div>`).join('')}
        ${D.map(d => `<div class="wh" style="left:${X(d.x1)}px;width:${X(d.x2) - X(d.x1)}px;top:${Y(d.y)}px;--cc:${d.p.hex}"></div>`).join('')}
        ${D.map(d => { const s = size(d); return `<button class="bub" data-k="${d.p.k}" style="left:${X(d.x)}px;top:${Y(d.y)}px;width:${s}px;height:${s}px;--cc:${d.p.hex}" aria-label="${escAttr(`${d.p.os}: ${trim(d.y, 0)}x EV per dollar of spend, first value in ${d.x1} to ${d.x2} months, ${$M(d.p.mid.dEV)} EV created`)}"></button>`; }).join('')}
        ${labels.map(l => `<div class="bl" style="left:${l.x}px;top:${l.y}px;height:${l.h}px;--cc:${l.d.p.hex}"><b>${escTxt(l.d.p.os)}</b>${compact ? '' : `<span class="num">${trim(l.d.y, 0)}x · ${$M(l.d.p.mid.dEV)}</span>`}</div>`).join('')}
      </div>
      <div class="ax"><span>Months to first value → (dot = midpoint, line = window)</span><span>↑ EV created per $1 of OS spend (mid, est.)</span></div>
    </div>`;
    host.querySelectorAll('.bub').forEach(x => x.onclick = () => onPick(x.dataset.k));
  };
  draw();
  let t; const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 120); }); ro.observe(host);
  return () => { ro.disconnect(); clearTimeout(t); };
}

function bridgeHtml(P) {
  const rows = [...P].sort((a, b) => b.mid.dEV - a.mid.dEV); const max = Math.max(...rows.map(p => p.mid.dEV), 1);
  const tot = { e: sum(P.map(p => p.mid.effE)), m: sum(P.map(p => p.mid.effM)) };
  return `<div class="tx-bridge">${rows.map(p => `<div class="br" data-k="${p.k}" style="--cc:${p.hex}" tabindex="0"><div class="lb"><b>${escTxt(p.os)}</b><span>${escTxt(p.co)}</span></div><div class="bar"><i class="e" style="width:${(p.mid.effE / max) * 100}%"></i><i class="m" style="width:${(p.mid.effM / max) * 100}%"></i></div><div class="v num">${$M(p.mid.dEV)}</div></div>`).join('')}
    <div class="tot"><span>Portfolio, mid case</span><span class="num">${$M(tot.e)} EBITDA effect + ${$M(tot.m)} multiple effect = <b>${$M(tot.e + tot.m)}</b></span></div>
    <div class="lg"><span><i class="e"></i>EBITDA uplift × today’s multiple</span><span><i class="m"></i>New EBITDA × turns of re-rating</span><span class="dim">HarborOS is valued on revenue, so all of its value is re-rating.</span></div></div>`;
}

function limitsHtml(b, prem) {
  const cav = b.ev?.meta?.caveats || [];
  return `<div class="tx-limits">${prem?.what_it_does_not_support ? `<div class="q">${escTxt(prem.what_it_does_not_support)}</div>` : ''}
    <ul>${cav.slice(0, 6).map(c => `<li>${escTxt(c)}</li>`).join('') || '<li>Evidence caveats load with OS program evidence.</li>'}</ul></div>`;
}

/* ══ View: Evidence ═════════════════════════════════════════════════════════ */
const LADDER = [
  { id: 've-05', label: 'HVAC: project-heavy, low retention', lo: 5, hi: 6, src: 'PKF grid' },
  { id: 've-06', label: 'Middle market: typical deal', v: 6.8, src: 'Capstone/IMAP' },
  { id: 've-22', label: 'Public affairs: PPHC (listed)', v: 8.4, src: 'PPHC' },
  { id: 've-14', label: 'MSP deals: median (size curve)', v: 8.9, lo: 5.2, hi: 11.2, src: 'Aventis' },
  { id: 've-06', label: 'Middle market: premium deal', v: 9.8, src: 'Capstone/IMAP', key: 'prem' },
  { id: 've-05', label: 'HVAC: repeatable service, in-house tech', lo: 10, hi: 12, open: true, src: 'PKF grid', key: 'pkfhi' },
  { id: 've-22', label: 'Public affairs: scaled sponsor exit (est.)', lo: 10, hi: 13, src: 'Analyst est.', key: 'bpiexit' },
  { id: 've-15', label: 'Frontline entry (est.)', v: 13.5, lo: 12, hi: 15, src: 'Analyst est.' },
  { id: 've-02', label: 'Sila Services → Goldman (scale)', v: 17, src: 'Press' },
  { id: 've-01', label: 'Champions → Blackstone (scale)', v: 18.5, src: 'Press' },
];
async function evidence(ctx) {
  const { el, ui, fmt, app, params } = ctx; injectCss();
  const b = await load(ctx.data);
  if (!b.ev) { el.innerHTML = `<div class="m-techos">${ui.pageHead({ title: 'Valuation evidence', sub: 'The evidence file behind the OS program.' })}${missingNote(ui, b)}${ui.empty('Evidence dataset not available')}</div>`; return; }
  const K = b.kinds; const prem = b.ev.meta?.multiple_premium_summary;
  const hi = K.val.filter(e => e.confidence === 'high').length;
  const dates = K.val.map(e => String(e.date || '')).filter(Boolean).sort();
  const sources = new Set(b.items.map(i => host(i.source_url)).filter(Boolean));
  const tab = ['val', 'kpi', 'vend'].includes(params.tab) ? params.tab : 'val';
  el.innerHTML = `<div class="m-techos">${ui.pageHead({
    title: 'Valuation evidence',
    sub: `Buyers pay up to ~3 turns more for recurring, visible earnings. The 17–18.5x prints reflect scale, so the program credits tech with only <b>0.5–2.5 turns</b>.`,
    chips: `${fmt.chip(`${K.val.length} valuation datapoints`, 'var(--sys-brand)')}${fmt.chip(`${K.kpi.length} KPI benchmarks`, 'var(--sys-brand)')}${fmt.chip(`${K.vend.length} vendors`, 'var(--sys-brand)')}${fmt.chip(`${sources.size} source domains`, 'var(--sys-mute-2)')}`,
    actions: `${OUT_LINKS}<button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" data-go="overview">Overview</button><button class="sys-btn sys-btn--primary sys-btn--sm btn sm primary" data-go="calculator">Calculator →</button>`,
  })}
  ${missingNote(ui, b)}
  ${ui.kpis([
    { label: 'Quality spread', value: '3.0 turns', sub: 'Capstone/IMAP typical 6.8x vs premium 9.8x', color: 'var(--sys-brand)' },
    { label: 'HVAC banker grid', value: '5–6x → 10x+', sub: 'PKF, Summer 2026', color: 'var(--co-pp)' },
    { label: 'Credited to tech', value: '0.5–2.5x', sub: 'EV/EBITDA turns, by company', color: 'var(--co-fl)' },
    { label: 'High-confidence', value: `${hi} / ${K.val.length}`, sub: 'Valuation datapoints', color: 'var(--sys-good)' },
    { label: 'Evidence window', value: `${escTxt(dates[0]?.slice(0, 4) || '—')}–${escTxt(dates[dates.length - 1]?.slice(0, 4) || '—')}`, sub: `${dates.filter(d => d >= '2026').length} of ${K.val.length} dated 2026`, color: 'var(--sys-warn)' },
  ])}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'The multiple ladder', sub: 'EV/EBITDA prints and banker bands that frame the OS premium · click a row for the source', body: ladderHtml(b), foot: srcFoot(ui, b) })}
    ${ui.panel({ title: 'Premium credited to tech, by company', sub: 'Analyst assumption (est.) · turns of EV/EBITDA, HarborOS in EV/revenue', body: premiumHtml(b, prem), foot: srcFoot(ui, b) })}
  </div>
  ${ui.panel({ title: 'Evidence library', sub: 'Every item has a source URL, date and confidence · click a row to inspect', body: `<div class="row wrap gap-12 mb-8"><div id="tx-tabs"></div></div><div id="tx-ef"></div><div id="tx-et"></div>`, cls: 'mt-12', foot: srcFoot(ui, b) })}
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Public comps tie-in', sub: 'Sector medians from 10-K/20-F data · where each OS moves the margin', body: `<div id="tx-comps"></div>`, foot: ui.source('Public comparables (SEC EDGAR XBRL)', null, b.comps?.meta?.generated || '') })}
    ${ui.panel({ title: 'Method and caveats', sub: 'How the file was built and what it cannot prove', body: `<div class="tx-limits"><p class="small text-2">${escTxt(clip(b.ev.meta?.method || '', 520))}</p><ul>${(b.ev.meta?.caveats || []).map(c => `<li>${escTxt(c)}</li>`).join('')}</ul></div>`, foot: srcFoot(ui, b) })}
  </div></div>`;
  el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => app.go('techos', x.dataset.go));
  el.querySelectorAll('.tx-ladder .lr[data-id]').forEach(r => { const go = () => { const e = b.byId.get(r.dataset.id); if (e) openEvidence(ctx, b, e); }; r.onclick = go; r.onkeydown = ev => { if (ev.key === 'Enter') go(); }; });
  el.querySelectorAll('.tx-prem .pr[data-k]').forEach(r => r.onclick = () => openOS(ctx, b, b.P[r.dataset.k]));

  // Library table with tabs
  const TABS = {
    val: { label: `Valuation evidence (${K.val.length})`, rows: K.val.map(e => ({ ...e, _plat: (e.applies_to || []).map(k => OS[k]?.co || k).join('; '), _metric: fmtMetric(e), _src: e.source_name })),
      cols: [
        { key: 'confidence', label: 'Conf.', width: '80px', fmt: v => fmt.chip(v || 'n/d', confColor(v)), sort: (a, b2) => ({ high: 3, medium: 2, low: 1 }[a.confidence] || 0) - ({ high: 3, medium: 2, low: 1 }[b2.confidence] || 0) },
        { key: 'title', label: 'Evidence', wrap: true, fmt: (v, r) => `<b>${escTxt(v)}</b><div class="dim small">${escTxt(r.source_name || '')}</div>` },
        { key: '_metric', label: 'Metric', num: true, width: '90px', fmt: (v, r) => `<b>${escTxt(v)}</b>`, sort: (a, b2) => (num(a.metric_value) || 0) - (num(b2.metric_value) || 0) },
        { key: 'metric_unit', label: 'Unit', wrap: true, fmt: v => `<span class="small text-2">${escTxt(clip(v || '', 60))}</span>` },
        { key: '_plat', label: 'Applies to', fmt: (v, r) => (r.applies_to || []).length >= 6 ? fmt.chip('All six', 'var(--sys-brand)') : `<div class="row wrap gap-4">${(r.applies_to || []).map(k => platChip(fmt, k)).join('')}</div>` },
        { key: 'date', label: 'Date', num: true, width: '84px' },
        { key: 'source_url', label: 'Source', fmt: v => v ? fmt.link(v) : '—' },
      ], conf: true },
    kpi: { label: `KPI benchmarks (${K.kpi.length})`, rows: K.kpi.map(e => ({ ...e, _plat: OS[e.company]?.co || e.company, _os: OS[e.company]?.os || '' })),
      cols: [
        { key: '_plat', label: 'Company', fmt: (v, r) => platChip(fmt, r.company) },
        { key: 'kpi', label: 'KPI', wrap: true, fmt: (v, r) => `<b>${escTxt(v)}</b><div class="dim small">${escTxt(r._os)}</div>` },
        { key: 'baseline', label: 'Baseline', num: true, fmt: (v, r) => kpiVal(v, r.unit) },
        { key: 'target', label: 'Target', num: true, fmt: (v, r) => `<b>${kpiVal(v, r.unit)}</b>` },
        { key: 'unit', label: 'Unit', wrap: true, fmt: v => `<span class="small text-2">${escTxt(v)}</span>` },
        { key: 'lever', label: 'OS lever', wrap: true, fmt: v => `<span class="small text-2">${escTxt(v)}</span>` },
        { key: 'source_url', label: 'Source', fmt: v => v ? fmt.link(v) : '—' },
      ] },
    vend: { label: `Vendor stack (${K.vend.length})`, rows: K.vend.map(e => ({ ...e, _plat: OS[e.company]?.co || e.company, _os: OS[e.company]?.os || '' })),
      cols: [
        { key: '_plat', label: 'Company', fmt: (v, r) => platChip(fmt, r.company) },
        { key: 'vendor', label: 'Vendor', fmt: (v, r) => `<b>${escTxt(v)}</b><div class="dim small">${escTxt(r._os)}</div>` },
        { key: 'category', label: 'Category', wrap: true },
        { key: 'what_it_does', label: 'What it does', wrap: true, fmt: v => `<span class="small text-2">${escTxt(clip(v, 150))}</span>` },
        { key: 'pricing_note', label: 'Pricing (verify)', wrap: true, fmt: v => `<span class="small text-2">${escTxt(clip(v || 'Not published', 110))}</span>` },
        { key: 'source_url', label: 'Source', fmt: v => v ? fmt.link(v) : '—' },
      ] },
  };
  let cur = tab, tbl = null;
  const draw = () => {
    const T = TABS[cur]; tbl = null;
    const fl = ui.filters(el.querySelector('#tx-ef'), [
      { key: 'q', label: 'Search evidence, vendor, KPI…', type: 'search', value: params.q || '' },
      { key: 'plat', label: 'Company', options: ORDER.map(k => ({ value: k, label: `${OS[k].co} · ${OS[k].os}` })), value: params.co || '' },
      ...(T.conf ? [{ key: 'conf', label: 'Confidence', options: ['high', 'medium', 'low'] }] : []),
    ], st => {
      const q = (st.q || '').toLowerCase();
      const rows = T.rows.filter(r => (!st.plat || [].concat(r.applies_to || r.company).includes(st.plat)) && (!st.conf || r.confidence === st.conf) && (!q || JSON.stringify(r).toLowerCase().includes(q)));
      fl.setCount(`${rows.length} / ${T.rows.length}`);
      tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#tx-et'), { columns: T.cols, rows, pageSize: 12, exportName: `techos_${cur === 'val' ? 'valuation_evidence' : cur === 'kpi' ? 'kpi_benchmarks' : 'vendor_stack'}`, sortKey: cur === 'val' ? 'confidence' : undefined, onRow: r => openEvidence(ctx, b, b.byId.get(r.id) || r) }));
    });
    const st0 = fl.state; const q = (st0.q || '').toLowerCase();
    const rows = T.rows.filter(r => (!st0.plat || [].concat(r.applies_to || r.company).includes(st0.plat)) && (!q || JSON.stringify(r).toLowerCase().includes(q)));
    fl.setCount(`${rows.length} / ${T.rows.length}`);
    tbl = ui.table(el.querySelector('#tx-et'), { columns: T.cols, rows, pageSize: 12, exportName: `techos_${cur === 'val' ? 'valuation_evidence' : cur === 'kpi' ? 'kpi_benchmarks' : 'vendor_stack'}`, sortKey: cur === 'val' ? 'confidence' : undefined, onRow: r => openEvidence(ctx, b, b.byId.get(r.id) || r) });
  };
  ui.seg(el.querySelector('#tx-tabs'), Object.entries(TABS).map(([value, t]) => ({ value, label: t.label })), cur, v => { cur = v; draw(); });
  draw();

  // Comps tie-in
  const sb = b.comps?.meta?.sector_benchmarks || {};
  const compRows = ORDER.map(k => { const p = b.P[k]; const s = sb[OS[k].bench]; return s ? { k, os: p.os, co: p.co, sector: SECTOR_LABEL[OS[k].bench], comps: (s.comps || []).join(', '), n: s.n, growth: num(s.median_revenue_growth_latest_pct), margin: num(s.median_ebitda_margin_latest_pct), today: p.def.margin, withOS: p.def.margin + midOf(p.pts), rpe: num(s.median_revenue_per_employee_usd), gap: s.median_ebitda_margin_latest_pct != null ? s.median_ebitda_margin_latest_pct - (p.def.margin + midOf(p.pts)) : null, implies: s.what_this_implies_for_bsp } : null; }).filter(Boolean);
  const ch = el.querySelector('#tx-comps');
  if (!compRows.length) ch.innerHTML = ui.note('Public comparables dataset not available.', 'warn');
  else ui.table(ch, { columns: [
    { key: 'os', label: 'OS', fmt: (v, r) => `<span class="sys-dot" style="--co:${OS[r.k].hex}" aria-hidden="true"></span> <b>${escTxt(v)}</b><div class="dim small">${escTxt(r.sector)}</div>` },
    { key: 'margin', label: 'Sector EBITDA', num: true, fmt: v => v == null ? '—' : `${trim(v, 1)}%` },
    { key: 'today', label: 'Today (est.)', num: true, fmt: v => `${trim(v, 1)}%` },
    { key: 'withOS', label: 'With OS (mid)', num: true, fmt: (v, r) => `<b>${trim(v, 1)}%</b>` },
    { key: 'growth', label: 'Sector growth', num: true, fmt: v => v == null ? '—' : `${trim(v, 1)}%` },
    { key: 'gap', label: 'vs sector, with OS', num: true, fmt: v => v == null ? '—' : `${v > 0 ? '' : '+'}${trim(-v, 1)} pts` },
  ], rows: compRows, pageSize: 6, exportName: 'techos_comps_tie_in', onRow: r => ctx.inspector.open({ title: `${escTxt(r.sector)} · ${escTxt(r.os)}`, sub: `${r.n} public comps · ${escTxt(r.comps)}`, color: OS[r.k].color, sections: [
    { label: 'Sector medians', html: ui.kv({ 'EBITDA margin (latest)': r.margin != null ? `${trim(r.margin, 1)}%` : '—', 'Revenue growth (latest)': r.growth != null ? `${trim(r.growth, 1)}%` : '—', 'Revenue / employee': r.rpe ? fmt.moneyFull(r.rpe) : '—' }) },
    { label: `${r.co} (est.)`, html: ui.kv({ 'EBITDA margin today': `${trim(r.today, 1)}% <span class="dim small">filings estimate</span>`, [`With ${r.os} (mid)`]: `${trim(r.withOS, 1)}%`, 'Gap to sector median': r.margin != null ? `${trim(r.margin - r.withOS, 1)} pts after ${r.os}` : '—' }) },
    { label: 'What this implies', html: `<div class="small text-2">${escTxt(r.implies || '')}</div>` },
  ], actions: [{ id: 'tx-c', label: 'Model it', onClick: () => app.go('techos', 'calculator', { co: r.k }) }] }) });

  if (params.id && b.byId.get(params.id)) openEvidence(ctx, b, b.byId.get(params.id));
  ctx.app.index([
    ...K.val.map(e => ({ label: e.title, sub: `OS evidence · ${e.confidence} · ${e.date || ''}`, href: `#/techos/evidence?id=${encodeURIComponent(e.id)}`, kind: 'Evidence', color: 'var(--sys-brand)' })),
    ...K.vend.map(e => ({ label: `${e.vendor}`, sub: `${OS[e.company]?.os || ''} vendor · ${e.category}`, href: `#/techos/evidence?tab=vend&id=${encodeURIComponent(e.id)}`, kind: 'Vendor', color: 'var(--sys-brand)' })),
  ]);
}

function ladderHtml(b) {
  const xMin = 4, xMax = 20; const X = v => ((clamp(v, xMin, xMax) - xMin) / (xMax - xMin)) * 100;
  const band = `<i class="band" style="left:${X(6.8)}%;width:${X(9.8) - X(6.8)}%"></i>`;
  const colorFor = id => { const e = b.byId.get(id); const a = e?.applies_to || []; return a.length === 1 ? OS[a[0]]?.hex : 'var(--sys-brand)'; };
  return `<div class="tx-ladder">
    <div class="lr ax"><div class="ll"></div><div class="lt">${[4, 6, 8, 10, 12, 14, 16, 18, 20].map(v => `<span style="left:${X(v)}%">${v}x</span>`).join('')}</div></div>
    ${LADDER.map(r => { const c = colorFor(r.id); const has = b.byId.has(r.id); const lo = r.lo ?? r.v, hi = r.hi ?? r.v;
      return `<div class="lr" ${has ? `data-id="${r.id}" tabindex="0" role="button"` : ''} style="--cc:${c}"><div class="ll"><b>${escTxt(r.label)}</b><span>${escTxt(r.src)}</span></div><div class="lt">${band}${lo !== hi ? `<i class="rg ${r.open ? 'open' : ''}" style="left:${X(lo)}%;width:${X(hi) - X(lo)}%"></i>` : ''}${r.v != null ? `<i class="dot" style="left:${X(r.v)}%"></i>` : ''}<span class="vl num" style="left:${X(hi)}%">${r.v != null ? `${trim(r.v, 1)}x` : `${trim(lo, 1)}–${trim(hi, 1)}x${r.open ? '+' : ''}`}</span></div></div>`; }).join('')}
    <div class="lg"><span><i class="band"></i>Capstone typical → premium (6.8x–9.8x): the room tech can claim part of</span></div><div class="rd"><b>How to read it.</b> Quality, not software, moves an asset from the left of the band to the right: recurring revenue, retention and earnings visibility. Scale moves it off the chart (Sila, Champions). Each OS is designed to produce the quality evidence a buyer diligences: booking rates, renewal rates, Level-1 resolution, digital mix.</div>
  </div>`;
}
function premiumHtml(b, prem) {
  const by = prem?.by_platform || {}; const max = 3;
  return `<div class="tx-prem">${ORDER.map(k => { const p = b.P[k]; const r = by[k]?.range_turns || p.turns; const rev = (by[k]?.unit || '').includes('revenue') || p.basis === 'revenue';
    return `<div class="pr" data-k="${k}" style="--cc:${p.hex}" tabindex="0" role="button"><div class="ph"><b>${escTxt(p.os)}</b><span class="dim">${escTxt(p.co)}</span><span class="grow"></span><span class="num">+${trim(r[0], 2)}–${trim(r[1], 2)}x${rev ? ' rev.' : ''}</span></div>
      <div class="pt"><i style="left:${(r[0] / max) * 100}%;width:${((r[1] - r[0]) / max) * 100}%"></i></div>
      <div class="ps">${by[k]?.strength ? `<span class="st">${escTxt(by[k].strength)}</span>` : ''}${escTxt(clip(by[k]?.support || '', 150))}</div></div>`; }).join('')}
    <div class="pax num"><span>0</span><span>1x</span><span>2x</span><span>3x</span></div>
    ${prem?.headline ? `<div class="sys-note sys-note--info note mt-12">${escTxt(prem.headline)}</div>` : ''}</div>`;
}

/* ══ View: Roadmap ══════════════════════════════════════════════════════════ */
async function roadmap(ctx) {
  const { el, ui, fmt, app, params, charts } = ctx; injectCss();
  const b = await load(ctx.data);
  const groups = ['prg', ...ORDER];
  const meta = k => k === 'prg' ? { ...PRG, k, ttv: null } : { ...b.P[k], k };
  let filt = groups.includes(params.co) ? params.co : '';
  const owners = new Set(WS.map(w => w.owner.split(' · ')[0]));
  const firstVal = Math.min(...b.plats.map(p => p.ttv[0])), lastVal = Math.max(...b.plats.map(p => p.ttv[1]));
  const deps = WS.reduce((s, w) => s + w.deps.length, 0); const sharedDeps = WS.filter(w => w.k !== 'prg' && w.deps.some(d => d.startsWith('prg-'))).length;
  el.innerHTML = `<div class="m-techos">${ui.pageHead({
    title: 'OS roadmap',
    sub: `Every OS shows first value within ${lastVal} months. The hard date is <b>December 2027</b>, when Thomas Scientific’s loan matures and LabOS must have landed.`,
    chips: `${fmt.chip('Oct 2026 → Sep 2028', 'var(--sys-brand)')}${fmt.chip('Owners are roles', 'var(--sys-mute-2)')}${fmt.chip('est. · planning assumption', 'var(--sys-warn)')}`,
    actions: `${OUT_LINKS}<button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" data-go="overview">Overview</button><button class="sys-btn sys-btn--primary sys-btn--sm btn sm primary" data-go="calculator">Calculator →</button>`,
  })}
  ${missingNote(ui, b)}
  ${ui.kpis([
    { label: 'Workstreams', value: String(WS.length), sub: `${groups.length - 1} companies + shared PRG layer`, color: 'var(--sys-brand)' },
    { label: 'First value', value: `Month ${firstVal}`, sub: `${monthLabel(firstVal, true)} · HarborOS`, color: 'var(--sys-good)' },
    { label: 'All six live', value: `Month ${lastVal}`, sub: `${monthLabel(lastVal, true)} · LabOS full value`, color: 'var(--sys-warn)' },
    { label: 'Gated by shared layer', value: String(sharedDeps), sub: `waiting on PRG work · ${deps} hand-offs`, color: 'var(--co-fl)' },
    { label: 'Hard date', value: 'Dec 2027', sub: 'Thomas Scientific loan maturity', color: 'var(--sys-bad)' },
  ])}
  ${ui.panel({ title: 'Program plan', sub: 'Bars = workstreams (label = vendor/tool) · shaded band = time-to-value window from the evidence file · ◆ = milestone · click any bar', cls: 'mt-12', actions: `<div id="tx-rf"></div>`, body: `<div id="tx-gantt"></div>`, flush: true, foot: srcFoot(ui, b, 'analyst roadmap') })}
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Critical paths', sub: 'Longest dependency chain per company', body: `<div id="tx-cp"></div>`, foot: srcFoot(ui, b, 'analyst roadmap') })}
    ${ui.panel({ title: 'PRG load', sub: 'Concurrent workstreams per month: where operating-partner time is scarce', body: `<div id="tx-load"></div>`, foot: ui.source('Computed from the plan above', null, 'Oct 2026') })}
  </div>
  ${ui.panel({ title: 'Workstream register', sub: 'Owner (role), dates, dependency and the KPI each workstream must move', cls: 'mt-12', body: `<div id="tx-reg"></div>`, foot: srcFoot(ui, b, 'analyst roadmap') })}
  </div>`;
  el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => app.go('techos', x.dataset.go));
  const byId = new Map(WS.map(w => [w.id, w]));
  const openWS = w => {
    const m = meta(w.k); const downstream = WS.filter(x => x.deps.includes(w.id));
    ctx.inspector.open({ title: escTxt(w.name), sub: `${escTxt(m.os)} · ${escTxt(m.co)} · ${monthLabel(w.s, true)} → ${monthLabel(Math.max(w.s, w.e - 1), true)}`, color: m.color, sections: [
      { label: 'Plan', html: ui.kv({ Owner: escTxt(w.owner), 'PRG sponsor': escTxt(m.owner || 'PRG Data & Technology lead'), Months: `M${w.s} → M${w.e} (${w.e - w.s} months)`, 'Tool / vendor': escTxt(w.tool), 'KPI it must move': escTxt(w.kpi) }) },
      { label: 'Depends on', html: w.deps.length ? `<div class="col gap-4 small">${w.deps.map(d => byId.get(d)).filter(Boolean).map(d => `<span>${escTxt(meta(d.k).os)} · ${escTxt(d.name)} <span class="dim">(ends M${d.e})</span></span>`).join('')}</div>` : '<span class="dim small">No upstream dependency</span>' },
      { label: 'Unblocks', html: downstream.length ? `<div class="col gap-4 small">${downstream.map(d => `<span>${escTxt(meta(d.k).os)} · ${escTxt(d.name)}</span>`).join('')}</div>` : '<span class="dim small">Nothing downstream</span>' },
      (w.ms || []).length ? { label: 'Milestones', html: `<div class="small text-2">${w.ms.map(x => `${escTxt(x.t)} · ${monthLabel(Math.floor(x.m), true)}`).join('<br>')}</div>` } : null,
      w.k !== 'prg' && b.P[w.k] ? { label: 'OS value window', html: `<div class="small text-2">${escTxt(b.P[w.k].os)} first value in ${b.P[w.k].ttv[0]}–${b.P[w.k].ttv[1]} months · ${rangeM(b.P[w.k].impactUsd)} run-rate EBITDA (est.)</div>` } : null,
    ].filter(Boolean), actions: w.k !== 'prg' ? [{ id: 'tx-os', label: `${escTxt(meta(w.k).os)} value case`, onClick: () => openOS(ctx, b, b.P[w.k]) }, { id: 'tx-cal', label: 'Model it', onClick: () => app.go('techos', 'calculator', { co: w.k }) }] : [] });
  };
  const drawGantt = () => {
    const gs = filt ? (filt === 'prg' ? ['prg'] : ['prg', filt]) : groups;
    const X = m => (m / SPAN) * 100;
    el.querySelector('#tx-gantt').innerHTML = `<div class="tx-gscroll"><div class="tx-gantt">
      <div class="g-row g-head"><div class="g-lab"><span class="dim small">Workstream</span></div><div class="g-track">${Array.from({ length: SPAN }, (_, i) => `<span class="mo ${i % 3 === 0 ? 'q' : ''}" style="left:${X(i)}%;width:${X(1)}%">${monthLabel(i)}</span>`).join('')}</div></div>
      ${gs.map(k => { const m = meta(k); const ws = WS.filter(w => w.k === k);
        return `<div class="g-row g-grp" style="--cc:${m.hex}"><div class="g-lab"><span class="gi">${k === 'prg' ? '◎' : icon(k, 14)}</span><b>${escTxt(m.os)}</b><span class="dim small">${escTxt(m.co)}</span></div><div class="g-track">${m.ttv ? `<i class="ttv" style="left:${X(m.ttv[0])}%;width:${X(m.ttv[1] - m.ttv[0])}%"><span>first value ${m.ttv[0]}–${m.ttv[1]} mo</span></i>` : ''}</div></div>
        ${ws.map(w => `<div class="g-row" style="--cc:${m.hex}"><div class="g-lab"><span class="wn">${escTxt(w.name)}</span></div><div class="g-track"><button class="g-bar" data-id="${w.id}" style="left:${X(w.s)}%;width:${X(w.e - w.s)}%" aria-label="${escAttr(`${w.name}: month ${w.s} to ${w.e}, owner ${w.owner}`)}"><span>${escTxt(w.tool)}</span></button>${(w.ms || []).map(x => `<i class="ms" style="left:${X(x.m)}%" title="${escAttr(x.t)}"></i>`).join('')}</div></div>`).join('')}`; }).join('')}
      <div class="g-marks">${MARKERS.map(x => `<i class="mk ${x.cls}" style="left:${X(x.m)}%"><span>${escTxt(x.t)}</span></i>`).join('')}</div>
    </div></div>`;
    el.querySelectorAll('.g-bar').forEach(x => x.onclick = () => { el.querySelectorAll('.g-bar').forEach(y => y.classList.toggle('sel', y === x)); openWS(byId.get(x.dataset.id)); });
  };
  ui.filters(el.querySelector('#tx-rf'), [{ key: 'co', label: 'Company', options: groups.map(k => ({ value: k, label: k === 'prg' ? 'Shared PRG layer' : `${OS[k].os} · ${OS[k].co}` })), value: filt }], st => { filt = st.co; drawGantt(); drawReg(); });
  drawGantt();

  // critical paths
  const chain = w => { const out = [w]; let cur = w; while (cur.deps.length) { const nxt = cur.deps.map(d => byId.get(d)).filter(Boolean).sort((a, c) => c.e - a.e)[0]; if (!nxt) break; out.unshift(nxt); cur = nxt; } return out; };
  el.querySelector('#tx-cp').innerHTML = `<div class="tx-cp">${ORDER.map(k => { const ws = WS.filter(w => w.k === k); const last = ws.sort((a, c) => c.e - a.e)[0]; const c = chain(last); const p = b.P[k];
    return `<div class="cp" style="--cc:${p.hex}"><div class="ch"><b>${escTxt(p.os)}</b><span class="num dim">ends M${last.e} · ${monthLabel(Math.max(0, last.e - 1), true)}</span></div><div class="cs">${c.map(w => `<button class="lnk" data-id="${w.id}">${escTxt(clip(w.name, 44))}</button>`).join('<i>→</i>')}</div></div>`; }).join('')}</div>`;
  el.querySelectorAll('#tx-cp [data-id]').forEach(x => x.onclick = () => openWS(byId.get(x.dataset.id)));

  // load
  const load2 = Array.from({ length: SPAN }, (_, i) => WS.filter(w => w.s <= i && w.e > i && w.id !== 'prg-3').length);
  const peak = Math.max(...load2), peakM = load2.indexOf(peak);
  el.querySelector('#tx-load').innerHTML = charts.bar(load2.map((v, i) => ({ label: monthLabel(i), value: v, color: i === peakM ? 'var(--sys-warn)' : 'var(--sys-brand)' })), { h: 170, fmt: v => Math.round(v), labelEvery: 3 }) + `<div class="small text-2 mt-8">Peak of <b>${peak}</b> concurrent workstreams in <b>${monthLabel(peakM, true)}</b> (excluding the standing quarterly audit). Stagger CET’s estimating standard and Frontline’s compliance tier if operating-partner time is the constraint; the evidence file does not depend on their exact start month.</div>`;

  // register
  let reg;
  const regRows = () => WS.filter(w => !filt || w.k === filt || (filt !== 'prg' && w.k === 'prg' && false)).map(w => ({ ...w, _os: meta(w.k).os, _co: meta(w.k).co, _start: monthLabel(w.s, true), _end: monthLabel(Math.max(w.s, w.e - 1), true), _dur: w.e - w.s, _deps: w.deps.map(d => byId.get(d)?.name || d).join('; ') }));
  const regCols = [
    { key: '_os', label: 'OS', fmt: (v, r) => `<span class="sys-dot" style="--co:${meta(r.k).hex}" aria-hidden="true"></span> <b>${escTxt(v)}</b>` },
    { key: 'name', label: 'Workstream', wrap: true, fmt: v => `<span class="strong">${escTxt(v)}</span>` },
    { key: 'owner', label: 'Owner (role)', wrap: true, fmt: v => `<span class="small text-2">${escTxt(v)}</span>` },
    { key: 's', label: 'Start', num: true, fmt: (v, r) => escTxt(r._start) },
    { key: '_dur', label: 'Months', num: true },
    { key: 'kpi', label: 'KPI it must move', wrap: true, fmt: v => `<span class="small text-2">${escTxt(v)}</span>` },
    { key: '_deps', label: 'Depends on', wrap: true, fmt: v => `<span class="small dim">${escTxt(v || '—')}</span>` },
    { key: 'tool', label: 'Tool / vendor', wrap: true },
  ];
  const drawReg = () => { const rows = regRows(); reg ? reg.update(rows) : (reg = ui.table(el.querySelector('#tx-reg'), { columns: regCols, rows, pageSize: 15, sortKey: 's', sortDir: 1, exportName: 'techos_roadmap', onRow: openWS })); };
  drawReg();
  ctx.app.index(WS.map(w => ({ label: w.name, sub: `${meta(w.k).os} roadmap · M${w.s}–M${w.e}`, href: `#/techos/roadmap?co=${w.k}`, kind: 'Workstream', color: 'var(--sys-brand)' })));
}

/* ══ View: Calculator ═══════════════════════════════════════════════════════ */
async function calculator(ctx) {
  const { el, ui, fmt, app, params, charts } = ctx; injectCss();
  const b = await load(ctx.data);
  let co = b.P[params.co] ? params.co : 'pp';
  let p = b.P[co]; let s = { ...p.def };
  const sliderDefs = () => {
    const rv = p.src.rev, rb = p.revBasis; const rlo = Math.min(rv?.lo ?? rb[0], rb[0]), rhi = Math.max(rv?.hi ?? rb[1], rb[1]);
    const rStep = rhi > 200e6 ? 5e6 : rhi > 60e6 ? 1e6 : 0.5e6; const R = v => Math.round(v / rStep) * rStep;
    const dhi = Math.max(p.src.debt?.hi ?? s.debt, s.debt, 1e6);
    const rev = p.basis === 'revenue';
    return [
      { g: 'Company today (est.)' },
      { k: 'rev', label: 'Revenue', min: R(rlo * 0.6), max: R(rhi * 1.3), step: rStep, f: v => $M(v), ev: `Filings est. ${rv ? rangeM([rv.lo, rv.hi]) : rangeM(rb)}` },
      { k: 'margin', label: 'EBITDA margin today', min: 0, max: 35, step: 0.5, f: v => `${trim(v, 1)}%`, ev: `= ${$M(s.rev * s.margin / 100)} EBITDA · sector median ${p.bench ? trim(p.bench.median_ebitda_margin_latest_pct, 1) + '%' : 'n/a'}` },
      { k: 'mult', label: rev ? 'Today’s EV / revenue' : 'Today’s EV / EBITDA', min: rev ? 0.3 : 4, max: rev ? 3 : 20, step: rev ? 0.05 : 0.25, f: v => mult(v, p.basis), ev: clip(p.mult.basis, 120) },
      { k: 'debt', label: 'Net debt', min: 0, max: Math.ceil((dhi * 1.5) / 1e6) * 1e6, step: dhi > 100e6 ? 5e6 : 1e6, f: v => $M(v), ev: p.src.debt ? `Filings est. ${rangeM([p.src.debt.lo, p.src.debt.hi])}` : 'Built-in est.' },
      { g: `${p.os} program (evidence range)` },
      { k: 'pts', label: 'EBITDA margin uplift', min: 0, max: Math.max(2, Math.ceil(p.pts[1] * 2)), step: 0.1, f: v => `+${trim(v, 1)} pts`, ev: `Evidence: ${trim(p.pts[0], 1)}–${trim(p.pts[1], 1)} pts`, band: p.pts },
      { k: 'turns', label: rev ? 'Re-rating (EV / revenue)' : 'Multiple expansion', min: 0, max: rev ? 1 : 3, step: rev ? 0.05 : 0.1, f: v => `+${trim(v, 2)}x`, ev: `Evidence: ${turnsTxt(p.turns, p.basis)} · ${rev ? 'DTC trades on revenue' : 'Capstone ceiling 3.0x'}`, band: p.turns },
      { k: 'inv', label: 'OS investment', min: 0, max: Math.ceil(p.inv[1] * 2 / 1e5) * 1e5, step: 50000, f: v => $M(v), ev: `Evidence: ${rangeM(p.inv)}`, band: p.inv },
      { k: 'ttv', label: 'Months to full run-rate', min: 1, max: 24, step: 1, f: v => `${v} mo`, ev: `Evidence: ${p.ttv[0]}–${p.ttv[1]} months`, band: p.ttv },
      { g: 'Delivery & exit' },
      { k: 'prob', label: 'Probability of full delivery', min: 0, max: 100, step: 5, f: v => `${v}%`, ev: 'Analyst haircut (assumption)' },
      { k: 'years', label: 'Years to exit', min: 1, max: 5, step: 0.5, f: v => `${trim(v, 1)} yrs`, ev: 'Uplift cash counted after run-rate' },
    ];
  };
  el.innerHTML = `<div class="m-techos">${ui.pageHead({
    title: 'Value-creation calculator',
    sub: `EBITDA uplift at today’s multiple, plus the re-rating, minus what the OS costs. Every input is an <b>est.</b> you can move.`,
    chips: `${fmt.chip('est. · illustrative', 'var(--sys-warn)')}${fmt.chip('Defaults from filings', 'var(--sys-brand)')}`,
    actions: `${OUT_LINKS}<button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" data-go="overview">Overview</button><button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" data-go="evidence">Evidence</button>`,
  })}
  ${missingNote(ui, b)}
  <div class="sys-chips tx-plats" id="tx-plats" role="tablist" aria-label="Company">${ORDER.map(k => `<button type="button" role="tab" data-k="${k}" data-co="" style="--co:${OS[k].hex};--cc:${OS[k].hex}" aria-selected="${k === co}" class="sys-chip ${k === co ? 'on' : ''}"><b>${escTxt(OS[k].os)}</b><span class="sys-muted">${escTxt(OS[k].co)}</span></button>`).join('')}</div>
  <div class="tx-calc">
    <section class="sys-card panel tx-in"><div class="panel-head"><div class="panel-title"><h3 class="sys-card-title">Inputs</h3><div class="sys-card-body sub" id="tx-in-sub"></div></div><div class="actions"><div class="sys-chips seg" id="tx-scn" role="group" aria-label="Scenario"><button type="button" class="sys-chip" data-v="low" aria-pressed="false">Low</button><button type="button" class="sys-chip active" data-v="mid" aria-pressed="true">Mid</button><button type="button" class="sys-chip" data-v="high" aria-pressed="false">High</button></div></div></div><div class="panel-body" id="tx-inputs"></div><div class="sys-src panel-foot">${srcFoot(ui, b, 'company public filings')}</div></section>
    <div class="tx-outcol" id="tx-out"></div>
  </div>
  ${ui.panel({ title: 'Portfolio roll-up', sub: 'All six OS programs at evidence defaults · choose a scenario · click a row to model it', cls: 'mt-12', actions: `<div id="tx-rscn"></div>`, body: `<div id="tx-roll"></div>`, foot: srcFoot(ui, b, 'company public filings') })}
  ${ui.panel({ title: 'Labelled assumptions', sub: 'Where each default comes from', cls: 'mt-12', body: `<div id="tx-assume"></div>`, foot: srcFoot(ui, b, 'company public filings') })}
  </div>`;
  el.querySelectorAll('[data-go]').forEach(x => x.onclick = () => app.go('techos', x.dataset.go));
  const inEl = el.querySelector('#tx-inputs'), outEl = el.querySelector('#tx-out');

  const drawInputs = () => {
    const defs = sliderDefs();
    el.querySelector('#tx-in-sub').innerHTML = `${escTxt(p.os)} · ${escTxt(p.co)}${p.fromFallback ? ' · October 2026 baseline' : ''}`;
    inEl.innerHTML = `<div class="tx-sliders">${defs.map(d => d.g ? `<div class="gh">${escTxt(d.g)}</div>` : (() => { const v = clamp(s[d.k], d.min, d.max); const bandHtml = d.band ? `<i class="eb" style="left:${((d.band[0] - d.min) / (d.max - d.min)) * 100}%;width:${((d.band[1] - d.band[0]) / (d.max - d.min)) * 100}%"></i>` : '';
      return `<label class="sl"><span class="lt"><span>${escTxt(d.label)}</span><b class="num" data-v="${d.k}">${d.f(s[d.k])}</b></span><span class="rw">${bandHtml}<input type="range" data-k="${d.k}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" aria-label="${escAttr(d.label)}"></span><span class="ev" data-ev="${d.k}">${escTxt(d.ev)}</span></label>`; })()).join('')}</div>
      <div class="row gap-8 mt-8"><button class="sys-btn sys-btn--secondary sys-btn--sm btn sm" id="tx-reset">Reset to evidence defaults</button><span class="dim small">Shaded track = evidence range</span></div>`;
    inEl.querySelectorAll('input[type=range]').forEach(i => i.oninput = () => { s[i.dataset.k] = Number(i.value); const d = defs.find(x => x.k === i.dataset.k); inEl.querySelector(`[data-v="${d.k}"]`).textContent = d.f(s[d.k]); if (d.k === 'rev' || d.k === 'margin') { const m = inEl.querySelector('[data-ev="margin"]'); if (m) m.textContent = `= ${$M(s.rev * s.margin / 100)} EBITDA · sector median ${p.bench ? trim(p.bench.median_ebitda_margin_latest_pct, 1) + '%' : 'n/a'}`; } setScn(null); drawOut(); });
    inEl.querySelector('#tx-reset').onclick = () => { s = { ...p.def }; setScn('mid'); drawInputs(); drawOut(); };
  };
  const setScn = v => el.querySelectorAll('#tx-scn button').forEach(x => { const on = x.dataset.v === v; x.classList.toggle('active', on); x.setAttribute('aria-pressed', String(on)); });
  el.querySelectorAll('#tx-scn button').forEach(x => x.onclick = () => { const sc = scenarioInputs(p, x.dataset.v); s = { ...s, pts: sc.pts, turns: sc.turns, inv: sc.inv, ttv: sc.ttv }; setScn(x.dataset.v); drawInputs(); drawOut(); });

  const drawOut = () => {
    const r = compute(p.basis, s); const rev = p.basis === 'revenue';
    const sens = sensitivity(p, s);
    outEl.innerHTML = `${ui.kpis([
      { label: 'Run-rate EBITDA uplift', value: `+${$M(r.dE)}`, sub: `${$M(r.e0)} → ${$M(r.e1)} · +${trim(s.pts, 1)} pts`, color: 'var(--sys-good)' },
      { label: 'EV created (gross)', value: $M(r.dEV), sub: rev ? 'All re-rating (valued on revenue)' : `${$M(r.effE)} EBITDA + ${$M(r.effM)} multiple`, color: 'var(--sys-brand)' },
      { label: 'Net of OS spend', value: $M(r.net), sub: `incl. ${$M(r.cash)} uplift cash over ${trim(r.cashYrs, 1)} yrs`, color: r.net >= 0 ? 'var(--sys-good)' : 'var(--sys-bad)' },
      { label: `Risk-adjusted @ ${s.prob}%`, value: $M(r.risk), sub: `${s.prob}% × (EV created + cash) − spend`, color: r.risk >= 0 ? 'var(--co-fl)' : 'var(--sys-bad)' },
      { label: 'Return on OS spend', value: r.roi != null ? `${trim(r.roi, 1)}x` : '—', sub: `(EV + cash) ÷ spend${r.payback != null ? ` · cash payback ≈ month ${Math.round(r.payback)}` : ''}`, color: 'var(--sys-warn)' },
      { label: 'Equity value uplift', value: r.eqUp != null ? `+${trim(r.eqUp * 100, 0)}%` : 'n/m', sub: r.eq0 > 0 ? `${$M(r.eq0)} → ${$M(r.eq1)} after ${$M(s.debt)} net debt` : 'Equity ≤ 0 at today’s multiple', color: 'var(--sys-good)' },
    ])}
    <div class="grid grid-2 mt-12 tx-out2">
      ${ui.panel({ title: 'Enterprise value bridge', sub: `${escTxt(p.os)} · est. · axis starts at ${$M(wfFloor(r))}`, body: waterfall(r, p, s.inv) })}
      ${ui.panel({ title: 'Sensitivity: net value created', sub: `Margin uplift (rows) × ${rev ? 'EV/revenue re-rating' : 'turns of expansion'} (columns) · $M, net of spend, gross of haircut`, body: charts.heatgrid(sens.rows.map(v => `+${trim(v, 2)} pts`), sens.cols.map(v => `+${trim(v, 2)}x`), sens.vals, { fmt: v => v == null ? '' : trim(v, v >= 100 ? 0 : 1), color: p.rgb, max: Math.max(...sens.vals.flat()) }) + `<div class="small dim mt-8">Leverage matters: with ${$M(s.debt)} of net debt, each $1 of EV created is ${r.eq0 > 0 ? `${trim(r.ev0 / r.eq0, 1)}x` : 'many times'} larger as a share of equity than of EV.</div>` })}
    </div>
    ${ui.panel({ title: 'Formulas', sub: 'What the calculator does, line by line, with the current inputs', cls: 'mt-12', body: `<div class="tx-formula">${formulaHtml(p, s, r)}</div>` })}`;
  };
  const drawAssume = () => {
    const row = (k, v, src, conf) => `<tr><td>${escTxt(k)}</td><td class="sys-n">${v}</td><td class="small text-2">${escTxt(src)}${conf ? ` ${fmt.chip(conf, confColor(conf))}` : ''}</td></tr>`;
    el.querySelector('#tx-assume').innerHTML = `<div class="sys-table-wrap tx-at"><table class="sys-table mini"><thead><tr><th>Input</th><th class="sys-n">Default</th><th>Source / basis</th></tr></thead><tbody>
      ${row('Revenue', $M(p.def.rev), p.src.rev ? `${p.src.rev.row.metric}: ${p.src.rev.row.estimate}` : (p.ra?.revenue_source || 'October 2026 baseline'), p.src.rev?.row?.confidence)}
      ${row('EBITDA today', $M(p.def.ebitda), p.src.ebitda ? `${p.src.ebitda.row.metric}: ${p.src.ebitda.row.estimate}` : (p.ra?.current_ebitda_estimate || 'October 2026 baseline'), p.src.ebitda?.row?.confidence)}
      ${row(p.basis === 'revenue' ? 'EV / revenue today' : 'EV / EBITDA today', mult(p.def.mult, p.basis), p.mult.basis, 'low')}
      ${row('Net debt', $M(p.def.debt), p.src.debt ? `${p.src.debt.row.metric}: ${p.src.debt.row.estimate}` : 'October 2026 baseline est.', p.src.debt?.row?.confidence)}
      ${row('Margin uplift', `${trim(p.pts[0], 1)}–${trim(p.pts[1], 1)} pts`, 'Roadmap assumption (est.)', null)}
      ${row('Multiple expansion', turnsTxt(p.turns, p.basis), p.premium?.support || 'roadmap assumption', null)}
      ${row('Investment', rangeM(p.inv), 'Software run-rate + implementation (est.)', null)}
      ${row('Probability of delivery', `${DEFAULTS.prob}%`, 'Analyst haircut, not from the evidence file', null)}
    </tbody></table></div>${p.ra?.label ? `<div class="dim small mt-8">${escTxt(p.ra.label)}</div>` : ''}`;
  };
  const switchTo = k => { co = k; p = b.P[k]; s = { ...p.def }; el.querySelectorAll('#tx-plats button').forEach(x => { const on = x.dataset.k === k; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }); setScn('mid'); drawInputs(); drawOut(); drawAssume(); history.replaceState(null, '', `#/techos/calculator?co=${k}`); };
  el.querySelectorAll('#tx-plats button').forEach(x => x.onclick = () => switchTo(x.dataset.k));

  // roll-up
  let scn = 'mid', rt;
  const rollRows = () => b.plats.map(q => { const inp = scenarioInputs(q, scn); const r = compute(q.basis, inp); return { k: q.k, os: q.os, co: q.co, rev: inp.rev, pts: inp.pts, dE: r.dE, mult: inp.mult, basis: q.basis, turns: inp.turns, inv: inp.inv, dEV: r.dEV, net: r.net, risk: r.risk, roi: r.roi, eqUp: r.eqUp }; });
  const rollCols = [
    { key: 'os', label: 'OS', fmt: (v, r) => `<span class="sys-dot" style="--co:${OS[r.k].hex}" aria-hidden="true"></span> <b>${escTxt(v)}</b><div class="dim small">${escTxt(r.co)}</div>` },
    { key: 'rev', label: 'Revenue (est.)', num: true, fmt: v => $M(v) },
    { key: 'pts', label: 'Uplift', num: true, fmt: v => `+${trim(v, 2)} pts` },
    { key: 'dE', label: 'Δ EBITDA', num: true, fmt: v => $M(v) },
    { key: 'mult', label: 'Multiple', num: true, fmt: (v, r) => mult(v, r.basis) },
    { key: 'turns', label: 'Re-rating', num: true, fmt: (v, r) => `+${trim(v, 2)}x` },
    { key: 'inv', label: 'OS spend', num: true, fmt: v => $M(v) },
    { key: 'dEV', label: 'EV created', num: true, fmt: v => `<b>${$M(v)}</b>` },
    { key: 'risk', label: `Risk-adj. net @${DEFAULTS.prob}%`, num: true, fmt: v => $M(v) },
    { key: 'roi', label: 'Return on spend', num: true, fmt: v => v == null ? '—' : `${trim(v, 1)}x` },
    { key: 'eqUp', label: 'Equity uplift', num: true, fmt: v => v == null ? 'n/m' : `+${trim(v * 100, 0)}%` },
  ];
  const drawRoll = () => { const rows = rollRows(); const tot = { k: 'pp', os: 'Portfolio', co: `${scn} case · six OS programs`, rev: sum(rows.map(r => r.rev)), pts: null, dE: sum(rows.map(r => r.dE)), mult: null, turns: null, inv: sum(rows.map(r => r.inv)), dEV: sum(rows.map(r => r.dEV)), net: sum(rows.map(r => r.net)), risk: sum(rows.map(r => r.risk)), roi: sum(rows.map(r => r.dEV)) / Math.max(1, sum(rows.map(r => r.inv))), eqUp: null }; rt ? rt.update(rows) : (rt = ui.table(el.querySelector('#tx-roll'), { columns: rollCols, rows, pageSize: 10, sortKey: 'dEV', exportName: 'techos_value_rollup', onRow: r => { switchTo(r.k); el.querySelector('#tx-plats')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } })); const ft = el.querySelector('#tx-roll .tbl-foot .num'); if (ft) ft.innerHTML = `6 programs · ${escTxt(scn)} case total: <b>${$M(tot.dEV)}</b> EV created on ${$M(tot.inv)} of spend · ${$M(tot.risk)} risk-adjusted net`; };
  ui.seg(el.querySelector('#tx-rscn'), [{ value: 'low', label: 'Low' }, { value: 'mid', label: 'Mid' }, { value: 'high', label: 'High' }], scn, v => { scn = v; drawRoll(); });
  drawInputs(); drawOut(); drawAssume(); drawRoll();
}
const wfFloor = r => { const top = Math.max(r.ev0, r.ev1 + r.cash); const span = top - r.ev0 + Math.max(0, r.ev0 * 0.0); const f = r.ev0 - Math.max(span * 2.2, r.ev0 * 0.25); return Math.max(0, Math.floor(f / 1e6) * 1e6); };
function waterfall(r, p, inv) {
  const floor = wfFloor(r); const steps = [
    { l: 'EV today', v: r.ev0, base: 0, tot: true },
    { l: p.basis === 'revenue' ? 'EBITDA effect (n/a)' : 'EBITDA effect', v: r.effE, base: r.ev0 },
    { l: 'Re-rating', v: r.effM, base: r.ev0 + r.effE },
    { l: 'Uplift cash', v: r.cash, base: r.ev1 },
    { l: 'OS spend', v: -inv, base: r.ev1 + r.cash },
    { l: 'EV + cash, net', v: r.ev1 + r.cash - inv, base: 0, tot: true, end: true },
  ];
  const top = Math.max(...steps.map(x => x.tot ? x.v : x.base + Math.max(0, x.v)), floor + 1) * 1.04; const H = v => ((Math.max(floor, v) - floor) / (top - floor)) * 100;
  return `<div class="tx-wf" role="img" aria-label="${escAttr(`EV bridge: ${$M(r.ev0)} today to ${$M(r.ev1 + r.cash - inv)} net`)}">${steps.map(x => { const lo = x.tot ? 0 : Math.min(x.base, x.base + x.v), hi = x.tot ? x.v : Math.max(x.base, x.base + x.v); const b0 = x.tot ? 0 : H(lo), h = Math.max(0.8, H(hi) - b0);
    return `<div class="c ${x.tot ? 'tot' : x.v < 0 ? 'neg' : 'pos'} ${x.end ? 'end' : ''}" style="--cc:${p.hex}"><div class="area"><i style="bottom:${b0}%;height:${h}%"></i><span class="v num" style="bottom:calc(${b0 + h}% + 3px)">${x.tot ? '' : x.v >= 0 ? '+' : ''}${$M(x.v)}</span></div><div class="l">${escTxt(x.l)}</div></div>`; }).join('')}</div>`;
}
function sensitivity(p, s) {
  const r2 = v => Math.round(v * 100) / 100;
  const rows = [...new Set([0, p.pts[0], midOf(p.pts), p.pts[1], p.pts[1] * 1.5].map(r2))];
  const cmax = p.basis === 'revenue' ? 1 : 3;
  const cols = [...new Set([0, p.turns[0], midOf(p.turns), p.turns[1], cmax].map(r2))];
  const vals = rows.map(rp => cols.map(ct => Math.round(compute(p.basis, { ...s, pts: rp, turns: ct }).net / 1e5) / 10));
  return { rows, cols, vals };
}
function formulaHtml(p, s, r) {
  const rev = p.basis === 'revenue';
  const L = (a, b2) => `<div class="fl"><span>${a}</span><b class="num">${b2}</b></div>`;
  return `${L('EBITDA today = revenue × margin', `${$M(s.rev)} × ${trim(s.margin, 1)}% = ${$M(r.e0)}`)}
    ${L('Δ EBITDA = revenue × uplift pts', `${$M(s.rev)} × ${trim(s.pts, 1)}% = ${$M(r.dE)}`)}
    ${rev ? L('EV today = revenue × EV/revenue', `${$M(s.rev)} × ${trim(s.mult, 2)}x = ${$M(r.ev0)}`) + L('EV with OS = revenue × (multiple + re-rating)', `× ${trim(s.mult + s.turns, 2)}x = ${$M(r.ev1)}`)
      : L('EV today = EBITDA × multiple', `${$M(r.e0)} × ${trim(s.mult, 2)}x = ${$M(r.ev0)}`) + L('EBITDA effect = Δ EBITDA × today’s multiple', `${$M(r.dE)} × ${trim(s.mult, 2)}x = ${$M(r.effE)}`) + L('Multiple effect = new EBITDA × turns', `${$M(r.e1)} × ${trim(s.turns, 2)}x = ${$M(r.effM)}`)}
    ${L('Uplift cash = Δ EBITDA × (years to exit − ramp)', `${$M(r.dE)} × ${trim(r.cashYrs, 2)} yrs = ${$M(r.cash)}`)}
    ${L('Net value = EV created + uplift cash − OS spend', `${$M(r.dEV)} + ${$M(r.cash)} − ${$M(s.inv)} = ${$M(r.net)}`)}
    ${L('Risk-adjusted = p × (EV created + cash) − spend', `${s.prob}% → ${$M(r.risk)}`)}
    <div class="dim small mt-8">Debt is held constant; spend is treated as certain and equity-funded. Uplift cash counts only after the run-rate month. Not a forecast or company guidance.</div>`;
}

/* ── Module ──────────────────────────────────────────────────────────────── */
export default {
  id: 'techos', name: 'Tech enablement', tag: 'OS', color: 'var(--sys-brand)', group: 'Intelligence',
  tagline: 'Six buyer-legible operating systems (ServiceOS, GridOS, FirmOS, LabOS, SignalOS, HarborOS) with sourced valuation evidence, a 24-month roadmap and value-creation math',
  hq: { lat: 40.7536, lon: -73.9832, label: 'BSP, New York, NY' },
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'evidence', name: 'Evidence', icon: '§', render: evidence },
    { id: 'roadmap', name: 'Roadmap', icon: '▤', render: roadmap },
    { id: 'calculator', name: 'Calculator', icon: '$', render: calculator },
  ],
  tour: [
    { order: 950, hash: '#/techos/overview', caption: '<b>Tech enablement.</b> One operating system per company, built from proven vendors and tied to buyer KPIs.', narration: 'One operating system per company, built from proven vendors and tied to the KPIs buyers pay for.', duration: 8000 },
    { order: 953, hash: '#/techos/evidence', caption: '<b>Why buyers pay.</b> Repeatable earnings trade at 10x+, project work at 5–6x; tech earns 0.5–2.5 turns.', narration: 'Repeatable earnings trade at ten times or more, project work at five to six. Tech earns part.', duration: 8500 },
    { order: 956, hash: '#/techos/roadmap', caption: '<b>24-month roadmap.</b> First value inside 18 months; LabOS must land before the December 2027 maturity.', narration: 'Every program shows value within eighteen months. LabOS must land before the December 2027 maturity.', duration: 7500 },
    { order: 959, hash: '#/techos/calculator?co=pp', caption: '<b>Value math.</b> Uplift times multiple, plus re-rating, minus spend: ServiceOS alone adds an est. ~$11M of EV.', narration: 'The calculator turns margin uplift and re-rating into value, net of spend. Every input is an estimate.', duration: 8000 },
  ],
};
