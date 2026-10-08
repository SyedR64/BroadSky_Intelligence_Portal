/* Frontline growth plan — renders every section from the portal's research datasets.
   Datasets: fl_playbook, fl_lawfirms, fl_midsize_firms, ma_targets_fl_ts (platform frontline), frontline_filings,
   public_comps, pe_landscape, bsp_firm, serviceos_evidence. All figures labelled est. are analyst assumptions. */

const ROOT = new URL('../../', import.meta.url).href;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let escRaw = s => String(s ?? '');
let Fmt = null;
/* Scrub internal dataset IDs and stale facts from research prose before it reaches the page. */
const HZ = t => (window.BSPFrame ? window.BSPFrame.humanizeText(t) : t);
const clean = s => HZ(String(s ?? '')
  .replace(/\s*\((?:target|growth_lever|serviceos|kpi_roadmap|frontline_filings|pe_landscape|fl_lawfirms|public_comps)[^)]*\)/g, '')
  .replace(/\bfl_lawfirms scores\b/g, "The portal's AM Law screen scores")
  .replace(/(?:data\/)?fl_lawfirms(?:\.json)? marks current[_ ]frontline[_ ]client = false for all (\d+) firms, and revenue(?:_m)? is null for (\d+) rows/i, "The AM Law prospect list flags none of its $1 firms as a current Frontline client, and $2 rows have no revenue figure")
  .replace(/frontline_filings fl-\d+ and its financial_picture describe/, 'Frontline public filings describe')
  .replace(/\(frontline_filings estimate_table[^)]*\)/g, '(Frontline public-filings estimates)')
  .replace(/frontline_filings estimate_table/g, 'the Frontline public-filings estimate table')
  .replace(/\bdeploy finance AI agents\b/g, 'launch finance AI agents').replace(/\bdeployed\b/g, 'rolled out')
  .replace(/weeks_to_deploy, cost_model and all kpi_targets\/talent metric targets/, 'Go-live timelines, cost models and all KPI and talent targets')
  .replace(/kpi_roadmap accounts/g, 'KPI roadmap client counts').replace(/\bkpi_roadmap\b/g, 'the KPI roadmap')
  .replace(/\(pe_landscape: '([^']*)'\)/g, '(private-equity landscape: $1)')
  .replace(/\bthis file's KPI roadmap\b/g, "this plan's KPI roadmap").replace(/\bBSP-FL Co-Invest\b/g, 'Frontline co-invest vehicle').replace(/\bBSP-FL LP\b/g, "BSP's Frontline fund").replace(/\bBSP-FL\b/g, "BSP's Frontline").replace(/\bBSP\b(?!-)/g, 'BSP').replace(/\brevolver\/DDTL\b/g, 'revolver or delayed-draw loan').replace(/\bDDTL\b/g, 'delayed-draw term loan')
  .replace(/\b(20\d\d)-(\d\d)-(\d\d)\b/g, (m, y, mo, d) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+mo - 1] || mo} ${+d}, ${y}`).replace(/\bS\+H\b/g, 'Smith + Howard')
  .replace(/\bAm ?Law\b/g, 'AM Law').replace(/\bAmLaw\b/g, 'AM Law')
  .replace(/Frontline CEO Seelin Naidoo's/g, "former Frontline CEO Seelin Naidoo's")
  .replace(/(\w)\.\.(?=\s|$)/g, '$1.'));
let esc = s => escRaw(clean(s));
/* Sentence split that does not break on "vs." or "Inc." */
const sents = (t, n) => String(t || '').split(/(?<=[a-z0-9%)]{3}\.)\s+(?=[A-Z(])/).slice(0, n).join(' ');

/* ── small helpers ─────────────────────────────────────────────────────── */
const M = v => v == null ? '—' : '$' + (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'K' : Math.round(v));
const N = (v, d = 0) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };
const src = (u, label) => u ? `<a class="pb-src" href="${escRaw(u)}" target="_blank" rel="noopener">${esc(label || host(u))} ↗</a>` : '';
/* Design-system colours, read once the stylesheet has loaded (Leaflet's canvas needs real colour strings). */
const tok = (n, d) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; } catch { return d; } };
let INK = '#0c1320';
const KT_LABEL = { amlaw200_share_pct: 'AM Law 200 share (%)', cyber_posture_attach_pct_of_managed_it_clients: 'Security subscription attach, % of managed-IT clients', tier0_autonomous_resolution_pct: 'Tier-0 autonomous resolution (%)', net_first_level_resolution_pct: 'Net first-level resolution (%)', midsize_logos_won: 'Mid-size firms won', legal_msp_addons_closed: 'Legal-MSP add-ons closed', acquired_revenue_usd: 'Acquired revenue', client_ebilling_rejection_rate_pct: 'Client e-billing rejection rate (%)', client_days_to_pay: 'Client days to pay', rcm_share_of_revenue_pct: 'Revenue-cycle share of revenue (%)', rcm_addons_closed: 'Revenue-cycle add-ons closed', international_revenue_share_pct: 'International revenue share (%)', intl_addons_closed: 'International add-ons closed' };
const OFFER_NAME = { bundle: 'the full bundle', managed_it: 'managed IT', ebilling: 'eBilling', service_desk: 'service desk', cyber: 'cybersecurity' };
const monthOf = k => { const m = String(k).match(/m(\d+)/); return m ? `month ${m[1]}` : HZ(String(k).replace(/^target_?/, '')); };
const human = k => String(k).replace(/_m(\d+)$/, ' (m$1)').replace(/_pct/g, ' %').replace(/_usd/g, ' ($)').replace(/_/g, ' ').replace(/\bamlaw\b/gi, 'AM Law').replace(/\bpct\b/g, '%').replace(/^\w/, c => c.toUpperCase());
const sqrt = Math.sqrt;

async function J(path) {
  try {
    const r = await fetch(ROOT + 'data/' + path, { cache: 'force-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.format === 'columnar') {
      const { cols, enums, rows } = j;
      const out = rows.map(r => { const o = {}; cols.forEach((c, i) => { let v = r[i]; if (v != null && enums && enums[c]) v = enums[c][v]; o[c] = v; }); return o; });
      return j.meta ? { meta: j.meta, items: out } : out;
    }
    return j;
  } catch { return null; }
}
const items = d => Array.isArray(d) ? d : (d && d.items) || [];

/* HQ-city coordinates for AM Law prospects (fl_lawfirms has city/state only). */
const CITY = {
  'New York|NY': [40.7128, -74.006], 'Chicago|IL': [41.8781, -87.6298], 'Los Angeles|CA': [34.0522, -118.2437], 'Philadelphia|PA': [39.9526, -75.1652],
  'Boston|MA': [42.3601, -71.0589], 'Kansas City|MO': [39.0997, -94.5786], 'Washington|DC': [38.9072, -77.0369], 'Minneapolis|MN': [44.9778, -93.265],
  'Cleveland|OH': [41.4993, -81.6944], 'San Francisco|CA': [37.7749, -122.4194], 'Atlanta|GA': [33.749, -84.388], 'Houston|TX': [29.7604, -95.3698],
  'Pittsburgh|PA': [40.4406, -79.9959], 'Cincinnati|OH': [39.1031, -84.512], 'Detroit|MI': [42.3314, -83.0458], 'Seattle|WA': [47.6062, -122.3321],
  'Miami|FL': [25.7617, -80.1918], 'Milwaukee|WI': [43.0389, -87.9065], 'Indianapolis|IN': [39.7684, -86.1581], 'Phoenix|AZ': [33.4484, -112.074],
  'Newark|NJ': [40.7357, -74.1724], 'Fort Lauderdale|FL': [26.1224, -80.1373], 'Louisville|KY': [38.2527, -85.7585], 'Birmingham|AL': [33.5186, -86.8104],
  'St. Louis|MO': [38.627, -90.1994], 'Columbus|OH': [39.9612, -82.9988], 'Tampa|FL': [27.9506, -82.4572], 'Palo Alto|CA': [37.4419, -122.143],
  'Richmond|VA': [37.5407, -77.436], 'Silicon Valley|CA': [37.3875, -122.0575], 'Winston-Salem|NC': [36.0999, -80.2442], 'Roseland|NJ': [40.8207, -74.2937],
  'Portland|OR': [45.5152, -122.6784], 'Greenville|SC': [34.8526, -82.394], 'White Plains|NY': [41.034, -73.7629], 'Birmingham|MI': [42.5467, -83.2113],
  'Dallas|TX': [32.7767, -96.797], 'Hartford|CT': [41.7658, -72.6734], 'Grand Rapids|MI': [42.9634, -85.6681], 'Baltimore|MD': [39.2904, -76.6122],
  'Buffalo|NY': [42.8864, -78.8784], 'Columbia|SC': [34.0007, -81.0348], 'Akron|OH': [41.0814, -81.519], 'Orlando|FL': [28.5383, -81.3792],
  'Ridgeland|MS': [32.4285, -90.1323], 'Omaha|NE': [41.2565, -95.9345], 'West Palm Beach|FL': [26.7153, -80.0534], 'Toledo|OH': [41.6528, -83.5379],
  'Nashville|TN': [36.1627, -86.7816], 'Rochester|NY': [43.1566, -77.6088], 'Portland|ME': [43.6591, -70.2568], 'Harrisburg|PA': [40.2732, -76.8867],
  'Irvine|CA': [33.6846, -117.8265], 'Leesburg|VA': [39.1157, -77.5636], 'Raleigh|NC': [35.7796, -78.6382], 'Southfield|MI': [42.4734, -83.2219],
};

/* Frontline's own footprint (bsp_firm description; frontline_filings). */
const OFFICES = [
  { name: 'St. Louis', role: 'Headquarters', type: 'hq', lat: 38.627, lon: -90.1994, note: 'HQ · managed IT + RCM leadership' },
  { name: 'Toledo', role: 'US delivery', type: 'on', lat: 41.6528, lon: -83.5379, note: 'Service desk; planned to ~200 jobs (2020)' },
  { name: 'New York', role: 'US delivery', type: 'on', lat: 40.7128, lon: -74.006, note: 'AM Law on-site support (Glasser Tech legacy)' },
  { name: 'Honolulu', role: 'US delivery', type: 'on', lat: 21.3069, lon: -157.8583, note: 'Pacific time-zone coverage' },
  { name: 'Toronto', role: 'International', type: 'intl', lat: 43.6532, lon: -79.3832, note: 'Opened 2010; revenue not disclosed' },
  { name: 'London', role: 'International', type: 'intl', lat: 51.5074, lon: -0.1278, note: 'UK sub turnover ~GBP 0.58M (2024)' },
  { name: 'Hyderabad', role: 'Offshore hub', type: 'off', lat: 17.385, lon: 78.4867, note: '24/7 desk, eBilling, AR' },
  { name: 'Goa', role: 'Offshore hub', type: 'off', lat: 15.4909, lon: 73.8278, note: 'Delivery and back office' },
  { name: 'Cape Town', role: 'Offshore hub', type: 'off', lat: -33.9249, lon: 18.4241, note: 'Opened Jul 2023; UK/US East hours' },
];

const LANES = {
  msp: { name: 'Legal MSP', color: '#0e9f6e', cat: 2, phase: 'Phase 2', desc: 'Density and senior consultants in priority metros' },
  rcm: { name: 'Revenue cycle and billing', color: '#d97706', cat: 3, phase: 'Phase 3', desc: 'eBilling, AR and Elite 3E application services' },
  intl: { name: 'International', color: '#db2777', cat: 4, phase: 'Phase 4', desc: 'UK and Canada through local providers' },
  cap: { name: 'Security and enablement', color: '#9d7bff', cat: 1, phase: 'Phase 1', desc: 'SOC/MDR, training and AI adoption capability' },
};
const LANE_OF = { 'fl-03': 'rcm', 'fl-14': 'rcm', 'fl-16': 'rcm', 'fl-06': 'rcm', 'fl-09': 'intl', 'fl-17': 'intl', 'fl-22': 'intl', 'fl-08': 'cap', 'fl-23': 'cap', 'fl-20': 'cap' };
const laneOf = t => LANE_OF[t.id] || (t.country && t.country !== 'United States' ? 'intl' : 'msp');

let PHASE_COLORS = ['#9d7bff', '#0e9f6e', '#d97706', '#db2777'];
const isIns = m => /insur/i.test((m.practice_focus || []).join(' ') + ' ' + (m.client_base || ''));

/* Returns model shared by the hero decision card and the value bridge (all est.).
   Net debt = $90M term loan + ~$25M incremental (midpoint of $15-35M).
   Equity = $136.95M BSP-FL LP + $30M co-invest + ~$32.5M top-up (midpoint of $20-45M). Hold Dec 2024 -> Oct 2029. */
const RET = { netDebt: 90e6 + 25e6, eqIn: 136.95e6 + 30e6 + 32.5e6, holdYrs: 4.85, hurdleX: 2.5, hurdleIrr: 20, addonBuyX: 6 };
const irrOf = moic => (Math.pow(Math.max(.01, moic), 1 / RET.holdYrs) - 1) * 100;
const returnsAt = (exitX, e1) => { const ev = exitX * e1, eq = ev - RET.netDebt, moic = eq / RET.eqIn; return { ev, eq, moic, irr: irrOf(moic) }; };
/* EBITDA needed for a target MOIC at a given exit multiple. */
const ebitdaFor = (moic, exitX) => (moic * RET.eqIn + RET.netDebt) / exitX;
/* Lever targets carry an explicit month and the matching phase waypoint (fl_playbook phase kpi_targets). */
const LEVER_DATES = {
  'fp-lev-01': { m: 36, way: ['fp-phase-1', 'amlaw200_share_pct'] },
  'fp-lev-03': { m: 30, way: null }, 'fp-lev-04': { m: 30, way: null },
  'fp-lev-05': { m: 36, way: ['fp-phase-1', 'net_first_level_resolution_pct'] },
  'fp-lev-06': { m: 36, way: ['fp-phase-1', 'tier0_autonomous_resolution_pct'] },
  'fp-lev-07': { m: 36, way: ['fp-phase-1', 'cyber_posture_attach_pct_of_managed_it_clients'] },
  'fp-lev-09': { m: 36, way: null }, 'fp-lev-10': { m: 36, way: null },
};
const US_BOUNDS = [[24.5, -124.5], [49.2, -67]];
const WORLD_BOUNDS = [[-36, -98], [57, 82]];

/* ── boot ──────────────────────────────────────────────────────────────── */
export async function boot(ctx) {
  if (ctx.esc) escRaw = ctx.esc; Fmt = ctx.Fmt;
  PHASE_COLORS = [1, 2, 3, 4].map((k, i) => tok(`--pb-cat-${k}`, PHASE_COLORS[i]));
  for (const l of Object.values(LANES)) l.color = PHASE_COLORS[l.cat - 1];
  INK = tok('--sys-ink', INK);
  const [pb, lf, mid, mat, fil, comps, pe, bsp, sev] = await Promise.all([
    J('research/fl_playbook.json'), J('fl_lawfirms.json'), J('research/fl_midsize_firms.json'), J('research/ma_targets_fl_ts.json'),
    J('research/frontline_filings.json'), J('research/public_comps.json'), J('research/pe_landscape.json'), J('research/bsp_firm.json'), J('research/serviceos_evidence.json'),
  ]);
  if (!pb) { $('#kpis').innerHTML = '<p class="fine">The plan did not load. Reload the page to try again.</p>'; return; }
  const D = {
    pb, meta: pb.meta, it: items(pb),
    law: items(lf), mid: items(mid), midMeta: mid?.meta || {},
    tg: items(mat).filter(t => t.platform === 'frontline').sort((a, b) => b.fit_score - a.fit_score), tgMeta: mat?.meta?.frontline || {},
    fil, comps, pe: items(pe), bsp: items(bsp).find(x => x.id === 'bsp-fl'), sev: items(sev),
  };
  D.kind = k => D.it.filter(x => x.kind === k);
  D.ra = D.sev.find(x => x.id === 'ra-fl');
  D.rivals = D.pe.filter(p => (p.overlap_with_bsp || []).includes('frontline'));
  const run = (name, fn) => { try { fn(D); } catch (e) { console.warn('render failed:', name, e); } };
  run('kpis', renderKpis); run('strip', renderStrip); run('decision', renderDecision); run('template', renderTemplate); run('map', renderMap);
  run('levers', renderLevers); run('agents', renderAgents); run('talent', renderTalent); run('addons', renderAddons);
  run('finance', renderFinance); run('risks', renderRisks); run('sources', renderSources);
  run('chat', d => mountChat(ctx.Chat, d, ctx.frame));
  reveal();
}

/* ── hero ──────────────────────────────────────────────────────────────── */
function spark(vals, color) {
  const w = 120, h = 26, mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const pts = vals.map((v, i) => [i * (w / (vals.length - 1)), h - 3 - ((v - mn) / sp) * (h - 6)]);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${pts.map((p, i) => i === pts.length - 1 ? `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${color}"/>` : '').join('')}</svg>`;
}
function renderKpis(D) {
  const r = D.meta.kpi_roadmap || []; if (!r.length) return;
  const a = r[0], z = r[r.length - 1];
  const k = [
    { l: 'Revenue', f: M(a.revenue_usd), t: M(z.revenue_usd), d: `+${Math.round((z.revenue_usd / a.revenue_usd - 1) * 100)}% · ~$55M acquired`, s: r.map(x => x.revenue_usd), c: PHASE_COLORS[0] },
    { l: 'Adj. EBITDA', f: M(a.ebitda_usd), t: M(z.ebitda_usd), d: `${(a.ebitda_usd / a.revenue_usd * 100).toFixed(1)}% → ${(z.ebitda_usd / z.revenue_usd * 100).toFixed(1)}% margin`, s: r.map(x => x.ebitda_usd), c: PHASE_COLORS[1] },
    { l: 'People', f: N(a.headcount), t: N(z.headcount), d: `revenue per head ${M(a.revenue_usd / a.headcount)} → ${M(z.revenue_usd / z.headcount)}`, s: r.map(x => x.headcount), c: INK },
    { l: 'Law-firm clients', f: N(a.locations_or_accounts), t: N(z.locations_or_accounts), d: `+${N(z.locations_or_accounts - a.locations_or_accounts)} firms, mid-market + intl`, s: r.map(x => x.locations_or_accounts), c: PHASE_COLORS[3] },
  ];
  $('#kpis').innerHTML = k.map(x => `<div class="sys-kpi" data-co="fl"><span class="sys-kpi-label">${esc(x.l)}</span><span class="sys-kpi-value"><span class="from">${esc(x.f)}</span><span class="arr">→</span>${esc(x.t)}</span><span class="sys-kpi-sub">${esc(x.d)}</span>${spark(x.s, x.c)}</div>`).join('');
}
function renderStrip(D) {
  const an = D.meta.anchors || {};
  const rr = D.meta.kpi_roadmap || [], r0 = rr[0] || { ebitda_usd: 20e6 }, r1 = rr[rr.length - 1] || { ebitda_usd: 41e6 };
  const fitHi = D.mid.filter(m => m.frontline_fit_score >= 65).length;
  const att = D.mid.reduce((s, m) => s + (m.attorney_count || 0), 0);
  const cells = [
    [`${an.amlaw200_share_pct ?? 50}%`, 'of the AM Law 200 served'],
    [N(D.law.length), 'AM Law prospects scored for upsell'],
    [N(D.mid.length), `mid-size firms screened · ${fitHi} fit 65+`],
    [N(D.tg.length), 'add-on targets in four lanes'],
    [`~${(r1.ebitda_usd / r0.ebitda_usd).toFixed(1)}x`, `EBITDA in 36 months (${M(r0.ebitda_usd)} → ${M(r1.ebitda_usd)})`, true],
  ];
  $('#hero-strip').innerHTML = cells.map(c => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-value">${esc(c[0])}${c[2] ? '<span class="sys-est">est.</span>' : ''}</span><span class="sys-kpi-sub">${esc(c[1])}</span></div>`).join('');
}

/* ── decision card + verdict ───────────────────────────────────────────── */
/* How the month-36 result compares with the hurdle, and what closes the gap. */
function verdict(exitX, e1, rev1) {
  const R = returnsAt(exitX, e1), T = RET.hurdleX;
  const clears = R.moic >= T - 1e-9 && R.irr >= RET.hurdleIrr - .05;
  const needEq = T * RET.eqIn - R.eq;
  const viaMargin = needEq / exitX, marginTo = (e1 + viaMargin) / rev1 * 100;
  const arb = exitX - RET.addonBuyX, viaAddon = arb > 0 ? needEq / arb : Infinity;
  const m20 = Math.max(0, .20 * rev1 - e1), rest = Math.max(0, needEq - m20 * exitX), mixAddon = arb > 0 ? rest / arb : Infinity;
  const need3 = ebitdaFor(3, exitX), x3 = (3 * RET.eqIn + RET.netDebt) / e1;
  return { R, clears, needEq, viaMargin, marginTo, viaAddon, m20, mixAddon, need3, x3, irr3: irrOf(3) };
}
function verdictHtml(v, exitX, e1, rev1, short) {
  const head = v.clears
    ? `<b>Clears the ${RET.hurdleX}x / ${RET.hurdleIrr}% hurdle</b> at ${v.R.moic.toFixed(1)}x and ~${Math.round(v.R.irr)}% IRR.`
    : `<b>Below a ${RET.hurdleX}x / ${RET.hurdleIrr}% hurdle:</b> ${v.R.moic.toFixed(1)}x and ~${Math.round(v.R.irr)}% IRR is a weak base case for lower-middle-market PE. Closing the gap takes ~${M(v.viaMargin)} more month-36 EBITDA (${M(e1 + v.viaMargin)} at ${exitX.toFixed(1)}x).`;
  if (short) return `<div><p class="verdict-line">${head}</p>${v.clears ? '' : `<p class="three-x">Levers that close it: add-on EBITDA bought at 5–7x and sold at 12x+, and margin to 20%+. A 3x needs ${M(v.need3)} of EBITDA at ${exitX.toFixed(1)}x.</p>`}</div>`;
  const levers = v.clears ? '' : `<ul class="gap-levers">
      <li><b>Add-on arbitrage:</b> EBITDA bought at 5-7x and sold at ${exitX.toFixed(1)}x. About ${M(v.viaAddon)} of debt-funded add-on EBITDA at ~${RET.addonBuyX}x closes the gap alone.</li>
      <li><b>Margin to 20%+:</b> each point on ${M(rev1)} of revenue is ${M(rev1 / 100)} of EBITDA. Margin alone would need ~${v.marginTo.toFixed(1)}%.</li>
      <li><b>Mix (realistic):</b> margin to 20% (+${M(v.m20)}) plus ~${M(v.mixAddon)} of add-on EBITDA bought at ~${RET.addonBuyX}x.</li></ul>`;
  return `<div><p class="verdict-line">${head}</p>${levers}<p class="three-x"><b>What has to be true for 3x</b> (~${Math.round(v.irr3)}% IRR): ${M(v.need3)} of month-36 EBITDA at ${exitX.toFixed(1)}x, or a ${v.x3.toFixed(1)}x exit on ${M(e1)}. Smith + Howard's MOIC is not public; it grew revenue ~4x over its hold, while this plan grows EBITDA ~2x, so add-on arbitrage has to do more of the work.</p></div>`;
}
function renderDecision(D) {
  const r = D.meta.kpi_roadmap || [], z = r[r.length - 1] || { ebitda_usd: 41e6, revenue_usd: 215e6 };
  const ra = D.ra, inv = ra ? `${M(ra.investment_usd[0])}-${M(ra.investment_usd[1])}` : '$1.5-3M';
  const asks = [
    ['Approve the add-on budget and pre-clear a co-invest top-up', 'Now', `~$50-80M of add-on spend over 36 months; $20-45M of equity on standby so Phase 2 deals are not lost on timing.`],
    ['Fund FirmOS, starting with a 90-day HELIX Tier-0 pilot', 'Months 0-3', `${inv} est. build cost. Pilot on 3-5 AM Law clients with a control group: 20% autonomous resolution by month 12, 30% by month 36.`],
    ['Run a 30-day diligence-gap sprint', 'Month 0-1', 'No new capital. Client count, churn, recurring mix and revolver terms; rebase this model on management accounts.'],
  ];
  $('#dec-asks').innerHTML = asks.map((a, i) => `<li class="sys-card"><span class="dn">${i + 1}</span><div><b>${esc(a[0])}</b><span class="when">${esc(a[1])}</span><p>${esc(a[2])}</p></div></li>`).join('');
  const exitX = 13, v = verdict(exitX, z.ebitda_usd, z.revenue_usd);
  $('#dec-ret').innerHTML = `<div class="dec-nums"><div><b>${v.R.moic.toFixed(1)}x</b><span>gross MOIC</span></div><div><b>~${Math.round(v.R.irr)}%</b><span>gross IRR</span></div><div><b>${M(v.R.ev)}</b><span>month-36 EV</span></div></div>
    <p class="dec-basis">Base case<span class="sys-est">est.</span>: 12x exit + 1 turn FirmOS premium on ${M(z.ebitda_usd)} month-36 EBITDA, ~${M(RET.netDebt)} net debt, ~${M(RET.eqIn)} equity, ~${RET.holdYrs} year hold.</p>
    <div class="sys-note ${v.clears ? 'sys-note--good' : 'sys-note--warn'} dec-verdict">${verdictHtml(v, exitX, z.ebitda_usd, z.revenue_usd, true)}</div>
    <a class="sys-btn sys-btn--secondary sys-btn--sm" href="#returns">Stress the returns →</a>`;
}

/* ── template ──────────────────────────────────────────────────────────── */
function renderTemplate(D) {
  const tpl = D.kind('template');
  const isAnalog = t => /analog/.test(t.move_type);
  const insN = D.mid.filter(isIns).length;
  /* Reconcile dataset prose with the page's own figures. */
  const fix = t => ({ ...t,
    metric: String(t.metric || '').replace(/\(\+200%\)/, '(~3.1x)').replace(/;?\s*3\.5 years$/, '; 3.5 years per BSP (~3.7 by these dates)'),
    lesson_for_frontline: String(t.lesson_for_frontline || '').replace(/\b\d+ of the 143 mid-size targets are insurance-related/, `${insN} of the 143 mid-size targets are insurance-related`) });
  const KEY = ['fp-tpl-02', 'fp-tpl-07', 'fp-tpl-09'];
  let filt = 'sh', open = false;
  const more = $('#tl-more');
  const draw = f => {
    filt = f;
    const all = tpl.filter(t => f === 'all' || !isAnalog(t)).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(fix);
    const shN = all.filter(t => !isAnalog(t)).length;
    const list = all.map((t, i) => [t, i]).filter(([t]) => open || f === 'all' || KEY.includes(t.id));
    if (more) { more.hidden = f === 'all'; more.setAttribute('aria-expanded', String(open)); more.textContent = open ? 'Show the 3 key moves' : `Show all ${shN} moves`; }
    $('#timeline').innerHTML = list.map(([t, i]) => {
      const exit = /exit/.test(t.move_type), an = isAnalog(t);
      const d = /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? Fmt.date(t.date) : esc(t.date);
      const mt = String(t.move_type || '').replace(/_/g, ' ').replace(/\baddon\b/g, 'add-on').replace(/\btech\b/g, 'technology').replace(/^\w/, c => c.toUpperCase());
      return `<li class="tl ${an ? 'analog' : ''} ${exit ? 'exit' : ''}"><span class="node" aria-hidden="true">${an ? '≈' : i + 1}</span><div class="sys-card box">
        <div class="meta"><span class="sys-card-label">${d}</span><span class="sys-chip ${an ? '' : 'sys-chip--soft'}">${esc(mt)}</span><span class="sys-muted" style="font-size:13px">${esc(t.location)}</span></div>
        <h3 class="sys-card-title">${esc(t.company)}</h3><p class="metric">${esc(t.metric)}</p>
        <div class="sys-note sys-note--co lesson"><span><b>For Frontline:</b> ${esc(t.lesson_for_frontline)}</span></div>${src(t.source_url)}</div></li>`;
    }).join('');
  };
  draw('sh');
  if (more) more.onclick = () => { open = !open; draw(filt); if (!open) $('#template').scrollIntoView({ block: 'start' }); };
  $$('#tpl-seg button').forEach(b => b.onclick = () => { $$('#tpl-seg button').forEach(x => x.setAttribute('aria-selected', x === b)); draw(b.dataset.f); });
  $('#tpl-caveat').textContent = 'Smith + Howard figures are BSP\'s own claims; Frontline figures are analyst estimates.';
  const r = D.meta.kpi_roadmap || [], a = r[0] || {}, z = r[r.length - 1] || {}, y2 = r.find(x => x.month === 24);
  const rows = [
    ['Starting point', '1 Atlanta office, ~100 professionals', `National: 9 offices, ~${N(D.meta.anchors?.employees_jan_2026 || 1100)} staff, ${esc(D.meta.anchors?.law_firm_clients || '900+')} clients`],
    ['Hold or horizon', '~3.7 years (Nov 2022 → Aug 2026; BSP says 3.5)', '36-month plan from Oct 2026; exit modelled Oct 2029'],
    ['Add-ons', '9 strategic acquisitions', '6+ (≈2-3 a year) for ~$55M acquired revenue'],
    ['Revenue, full hold', '~4x over the hold (BSP exit release)', `~${(z.revenue_usd / a.revenue_usd).toFixed(2)}x (${M(a.revenue_usd)} → ${M(z.revenue_usd)}) in 36 months<span class="sys-est">est.</span>`],
    ['Revenue, 2 years', '$40M → $125M in ~2 yrs, ~3.1x (Sep 2025 release)', `${y2 ? `~${(y2.revenue_usd / a.revenue_usd).toFixed(2)}x (${M(a.revenue_usd)} → ${M(y2.revenue_usd)}) by month 24<span class="sys-est">est.</span>` : '—'}`],
    ['People', '~100 → ~800 (8x)', `${N(a.headcount)} → ${N(z.headcount)}<span class="sys-est">est.</span>`],
    ['Offshore', 'India team 50+ given a director', 'Hyderabad, Goa, Cape Town: name a leader'],
    ['Pre-exit capability', 'Geels Norton (SOC 2 / ISO) ~4 mo. before signing', 'Cyber-attestation product by month 18'],
    ['Buyer story', 'Multi-line, 7-state company (TPG Growth)', 'Legal IT + RCM + cyber + AI, US + UK/Canada'],
  ];
  $('#compare').innerHTML = `<h3 class="sys-card-title">Smith + Howard vs the Frontline plan</h3><p class="sys-card-body">What transfers is the order of moves, not the 4x multiple.</p>
    <div class="sys-table-wrap"><table class="sys-table cmp"><thead><tr><th>Measure</th><th>Smith + Howard (actual)</th><th>Frontline (plan)</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td class="f">${r[2]}</td></tr>`).join('')}</tbody><caption>Source: BSP and Smith + Howard releases; Frontline growth plan KPI roadmap.</caption></table></div>
    <div class="sys-note sys-note--co"><span>The single move most worth copying is <b>Geels Norton</b>: Smith + Howard bought SOC 2 and ISO cyber-assurance capability months before TPG signed. Frontline should own the same capability before any sale process.</span></div>`;
}

/* ── map ───────────────────────────────────────────────────────────────── */
function renderMap(D) {
  const phases = D.kind('expansion_phase').sort((a, b) => a.month_start - b.month_start);
  const bar = $('#phase-bar');
  bar.innerHTML = `<button type="button" class="ph" role="tab" aria-selected="true" data-p="all" style="--pc:${INK}"><b>All phases</b><span>months 0–42</span></button>` +
    phases.map((p, i) => `<button type="button" class="ph" role="tab" aria-selected="false" data-p="${i}" style="--pc:${PHASE_COLORS[i]}"><b>Phase ${i + 1}</b><span>months ${esc(String(p.months).replace('-', '–'))}</span></button>`).join('');
  const play = document.createElement('button'); play.type = 'button'; play.className = 'ph play'; play.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2l9 5-9 5z" fill="currentColor"/></svg><b>Play</b>'; play.setAttribute('aria-label', 'Play through the four phases');
  if (window.matchMedia('(max-width: 980px)').matches) bar.appendChild(play); else bar.appendChild(play);

  /* aggregates */
  const byCity = {};
  for (const f of D.law) {
    const key = `${f.hq_city}|${f.hq_state}`; const c = CITY[key]; if (!c) continue;
    const g = byCity[key] || (byCity[key] = { city: f.hq_city, st: f.hq_state, lat: c[0], lon: c[1], n: 0, t1: 0, att: 0, intl: 0, ai: 0, cyber: 0 });
    g.n++; g.att += f.attorney_count || 0; if (/1/.test(f.priority_tier)) g.t1++; if (f.international_offices) g.intl++; if (/planning|partial/.test(f.ai_opportunity_signal)) g.ai++; if ((f.cyber_urgency_score || 0) >= 4) g.cyber++;
  }
  const cities = Object.values(byCity);
  const tg = D.tg.filter(t => t.lat != null);

  let map = null; const LG = {};
  const panel = $('#phase-panel'); const legend = $('#map-legend');
  if (window.L) {
    map = L.map('leaf', { scrollWheelZoom: false, zoomSnap: 0.25, worldCopyJump: true, attributionControl: true, preferCanvas: true });
    const T = { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OSM contributors' };
    L.tileLayer(T.url, { attribution: T.attr, maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
    L.tileLayer(T.ref, { maxZoom: 16, maxNativeZoom: 16, pane: 'shadowPane', opacity: .9 }).addTo(map);
    map.fitBounds(US_BOUNDS);
    setTimeout(() => map.invalidateSize(), 80); setTimeout(() => map.invalidateSize(), 400);
  } else { $('#leaf').innerHTML = '<p class="fine" style="padding:20px">Map library did not load; phase data is listed on the right.</p>'; }

  const lawLayer = (opts = {}) => L.layerGroup(cities.filter(c => !opts.intl || c.intl).map(c => {
    const n = opts.intl ? c.intl : c.n;
    return L.circleMarker([c.lat, c.lon], { radius: 4 + sqrt(n) * (opts.small ? 2 : 3.4), color: '#fff', weight: 1.2, fillColor: opts.color || PHASE_COLORS[0], fillOpacity: opts.faded ? .28 : opts.small ? .5 : .78 })
      .bindPopup(`<b>${esc(c.city)}, ${esc(c.st)}</b><br>${opts.intl ? `${n} AM Law prospect${n > 1 ? 's' : ''} with international offices<br>` : ''}<span class="pm">${c.n} AM Law prospect${c.n > 1 ? 's' : ''} HQ'd here · ${c.t1} Tier 1 · ${N(c.att)} attorneys<br>${c.cyber} with cyber urgency 4+ · ${c.ai} with AI programs planned or partial</span>`);
  }));
  const midLayer = (mode) => L.layerGroup(D.mid.filter(m => m.lat != null).map(m => {
    const hi = mode === 'ins' ? isIns(m) : m.frontline_fit_score >= 65;
    const col = mode === 'ins' ? PHASE_COLORS[2] : PHASE_COLORS[1];
    return L.circleMarker([m.lat + ((m.fit_rank || 0) % 5 - 2) * .03, m.lon + ((m.fit_rank || 0) % 7 - 3) * .03], { radius: hi ? 5 : 3.5, color: hi ? '#fff' : col, weight: hi ? 1 : 1.2, fillColor: col, fillOpacity: hi ? .9 : .15 })
      .bindPopup(`<b>Mid-size firm prospect</b> · ${esc(m.metro)}<br><span class="pm">${N(m.attorney_count)} attorneys · fit ${m.frontline_fit_score}/100 · first offer: ${esc(OFFER_NAME[m.recommended_offer] || 'the full bundle')}${isIns(m) ? ' · insurance-related practice' : ''}</span>`);
  }));
  const tgLayer = lanes => L.layerGroup(tg.filter(t => lanes.includes(laneOf(t))).map(t => {
    const ln = LANES[laneOf(t)];
    return L.marker([t.lat, t.lon], { icon: L.divIcon({ className: '', html: `<div class="tgt-pin" style="background:${ln.color}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }), keyboard: true, title: t.company, riseOnHover: true })
      .bindPopup(`<b>${esc(t.company)}</b><br><span class="pm">${esc(ln.name)} target · ${esc(t.hq_city || 'HQ not public')}, ${esc(t.state || t.country)} · fit ${t.fit_score}/100<br>${t.employees ? `~${N(t.employees)} staff · ` : ''}${t.revenue_est_usd ? `ZoomInfo rev. est. ${M(t.revenue_est_usd)}` : 'revenue n/a'}</span><br>${esc(String(t.strategic_rationale || '').slice(0, 170))}…`);
  }));
  const offLayer = types => L.layerGroup(OFFICES.filter(o => types.includes(o.type)).map(o => L.marker([o.lat, o.lon], { icon: L.divIcon({ className: '', html: `<div class="off-pin ${o.type === 'hq' ? 'hq' : ''}"></div>`, iconSize: o.type === 'hq' ? [20, 20] : [16, 16], iconAnchor: o.type === 'hq' ? [10, 10] : [8, 8] }), title: `Frontline ${o.name}`, zIndexOffset: 500 })
    .bindPopup(`<b>Frontline · ${esc(o.name)}</b><br><span class="pm">${esc(o.role)} · ${esc(o.note)}</span>`)));
  const sponLayer = () => L.layerGroup(D.rivals.filter(p => p.hq_lat != null).map((p, i) => L.marker([p.hq_lat + (i % 3) * .18, p.hq_lon + (i % 4) * .22], { icon: L.divIcon({ className: '', html: '<div class="spon-pin"></div>', iconSize: [11, 11], iconAnchor: [6, 6] }), title: p.firm })
    .bindPopup(`<b>${esc(p.firm)}</b> · competing sponsor<br><span class="pm">${esc(p.hq)} · threat ${esc(p.threat_level)}</span><br>${esc(String(p.threat_rationale || '').slice(0, 160))}…`)));

  const totals = lane => D.tg.filter(t => laneOf(t) === lane);
  const sumRev = a => a.reduce((s, t) => s + (t.revenue_est_usd || 0), 0);
  const ins = D.mid.filter(isIns);
  const views = {
    all: {
      bounds: US_BOUNDS, layers: () => [lawLayer({ small: true }), midLayer('fit'), tgLayer(['msp', 'rcm', 'intl', 'cap']), offLayer(['hq', 'on', 'intl', 'off'])],
      legend: [['c', PHASE_COLORS[0], 'AM Law prospects (by HQ city)'], ['c', PHASE_COLORS[1], 'Mid-size firms (solid = fit 65+)'], ['d', PHASE_COLORS[1], 'Add-on targets (colour = lane)'], ['o', INK, 'Frontline offices (Phase 4 shows London, Toronto and the offshore hubs)']],
    },
    0: {
      bounds: US_BOUNDS, layers: () => [lawLayer({}), offLayer(['hq', 'on'])],
      legend: [['c', PHASE_COLORS[0], 'AM Law prospects, sized by count per HQ city'], ['o', INK, 'Frontline US offices']],
      stats: () => [[N(D.law.length), 'AM Law firms scored'], [N(D.law.filter(f => /1/.test(f.priority_tier)).length), 'Tier 1 priority'], [N(D.law.filter(f => (f.cyber_urgency_score || 0) >= 4).length), 'cyber urgency 4+'], [N(D.law.filter(f => /planning|partial/.test(f.ai_opportunity_signal)).length), 'AI programs planned or partial']],
    },
    1: {
      bounds: US_BOUNDS, layers: () => [lawLayer({ faded: true, small: true }), midLayer('fit'), tgLayer(['msp']), offLayer(['hq', 'on'])],
      legend: [['c', PHASE_COLORS[1], 'Mid-size firms (solid = fit 65+)'], ['d', LANES.msp.color, 'Legal-MSP add-on targets'], ['c', PHASE_COLORS[0], 'AM Law (faded)'], ['o', INK, 'Frontline offices']],
      stats: () => [[N(D.mid.length), 'mid-size firms (40-350 attorneys)'], [N(D.mid.reduce((s, m) => s + (m.attorney_count || 0), 0)), 'attorneys in the screen'], [N(D.mid.filter(m => m.frontline_fit_score >= 65).length), 'score fit 65+'], [`${totals('msp').length} · ${M(sumRev(totals('msp')))}`, 'legal-MSP targets · ZoomInfo rev. (directional)']],
    },
    2: {
      bounds: US_BOUNDS, layers: () => [midLayer('ins'), tgLayer(['rcm']), offLayer(['hq', 'on'])],
      legend: [['c', PHASE_COLORS[2], 'Insurance-related mid-size firms (solid)'], ['d', LANES.rcm.color, 'RCM & billing targets'], ['o', INK, 'Frontline offices']],
      stats: () => [[N(ins.length), 'insurance-related mid-size firms'], [N(D.mid.filter(m => /bundle|ebilling/.test(m.recommended_offer)).length), 'firms where eBilling or the bundle leads'], ['11% → 18%', 'e-billing rejection rate, 2024 → 2025 (Elite)'], [`${totals('rcm').length} · ${M(sumRev(totals('rcm')))}`, 'RCM targets · ZoomInfo rev. (overstated)']],
    },
    3: {
      bounds: WORLD_BOUNDS, layers: () => [lawLayer({ intl: true, color: PHASE_COLORS[3] }), tgLayer(['intl']), offLayer(['hq', 'intl', 'off'])],
      legend: [['c', PHASE_COLORS[3], 'AM Law prospects with international offices'], ['d', LANES.intl.color, 'UK / Canada targets'], ['o', INK, 'Frontline HQ, international and offshore offices']],
      stats: () => [[N(D.law.filter(f => f.international_offices).length), 'AM Law prospects with offices abroad'], ['£47.1bn', 'UK legal services revenue (2023)'], [N(117467), 'active lawyers in Canada (2025)'], ['£0.58M', 'Frontline UK subsidiary turnover (2024)']],
    },
  };
  let current = null, first = true;
  const draw = key => {
    current = key;
    $$('.ph[data-p]', bar).forEach(b => b.setAttribute('aria-selected', b.dataset.p === String(key)));
    const v = views[key];
    if (map) {
      Object.values(LG).forEach(l => map.removeLayer(l)); Object.keys(LG).forEach(k => delete LG[k]);
      v.layers().forEach((l, i) => { l.addTo(map); LG[i] = l; });
      if ($('#spon-tg')?.checked) { LG.s = sponLayer().addTo(map); }
      if (first) { map.fitBounds(v.bounds, { animate: false, padding: [10, 10] }); first = false; }
      else map.flyToBounds(v.bounds, { duration: .8, padding: [10, 10] });
    }
    legend.innerHTML = v.legend.map(([t, c, l]) => `<span><i class="${t === 'd' ? 'sq' : t === 'o' ? 'o' : ''}" style="background:${c}"></i>${esc(l)}</span>`).join('') +
      `<label><input type="checkbox" id="spon-tg" ${LG.s ? 'checked' : ''}> Competing sponsors (${D.rivals.length})</label>`;
    $('#spon-tg').onchange = e => { if (!map) return; if (e.target.checked) LG.s = sponLayer().addTo(map); else if (LG.s) { map.removeLayer(LG.s); delete LG.s; } };
    panel.style.setProperty('--pc', key === 'all' ? INK : PHASE_COLORS[key]);
    if (key === 'all') {
      const max = 42;
      panel.innerHTML = `<span class="pp-tag">All phases · 42 months</span><h3 class="sys-card-title">Defend the core, land the mid-market, roll up the revenue cycle, then go abroad.</h3>
        <p class="thesis">The phases overlap on purpose. Each one funds and staffs the next, and acquisitions start in month 6.</p>
        <div class="gantt" role="img" aria-label="Phase timeline, months 0 to 42, with the exit marked at month 36">${phases.map((p, i) => `<div class="ph-row" style="--pc:${PHASE_COLORS[i]}"><b>Phase ${i + 1}</b><div class="ph-track"><i style="left:${p.month_start / max * 100}%;width:${(p.month_end - p.month_start) / max * 100}%"></i></div></div>`).join('')}
        <div class="ph-axis"><span></span><span>${[0, 12, 24, 36, 42].map(m => `<span style="left:${m / max * 100}%;transform:translateX(${m === 0 ? '0' : m === 42 ? '-100%' : '-50%'})">${m}</span>`).join('')}</span></div>
        <div class="gantt-exit" style="left:calc(80px + (100% - 80px) * ${36 / max})" aria-hidden="true"><span>Exit</span></div></div>
        <p class="fine" style="margin:0">The exit is modelled at month 36 (Oct 2029). Phase 4 runs on to month 42 and is sold as the buyer's growth story; only the first UK or Canada add-on is in month-36 EBITDA.</p>
        <div class="kt"><h4>What each phase delivers</h4><ul>${phases.map((p, i) => `<li><b style="color:var(--sys-ink)">Phase ${i + 1}:</b> ${esc(p.phase.replace(/^Phase \d+ - /, ''))}</li>`).join('')}</ul></div>
        <p class="fine">Pick a phase or press Play. Points are prospects and targets from the portal's data; AM Law prospects are grouped by headquarters city.</p>`;
    } else {
      const p = phases[key];
      const kt = Object.entries(p.kpi_targets || {}).filter(([k]) => k !== 'label').map(([k, v]) => { const tk = Object.keys(v).find(x => /^target/.test(x)); return `<li>${esc(KT_LABEL[k] || HZ(human(k)))}: <b class="sys-num">${v.baseline == null ? '—' : esc(fmtVal(v.baseline))} → ${esc(fmtVal(v[tk]))}</b> <span class="muted">by ${esc(monthOf(tk))}</span></li>`; }).join('');
      const thesis = sents(p.thesis, 3);
      panel.innerHTML = `<span class="pp-tag">Phase ${+key + 1} · months ${esc(String(p.months).replace('-', '–'))}</span><h3 class="sys-card-title">${esc(p.phase.replace(/^Phase \d+ - /, ''))}</h3><p class="thesis">${esc(thesis)}</p>
        <div class="stats">${v.stats().map(s => `<div class="stat"><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div>`).join('')}</div>
        <div class="kt"><h4>KPI targets <span class="sys-est">est.</span></h4><ul>${kt}</ul></div>
        ${+key === phases.length - 1 ? `<div class="sys-note sys-note--warn"><span>Exit is modelled at month 36 (Oct 2029). Targets dated month 42 sit after it: Phase 4 is sold as the buyer's growth story, and only the first UK or Canada add-on is in month-36 EBITDA.</span></div>` : ''}
        <div class="kt"><h4>Geography</h4><p class="fine" style="margin:0">${esc((p.geography || []).join(' · '))}</p></div>
        <p class="fine">${(p.source_urls || [p.source_url]).slice(0, 3).map(u => src(u)).join(' · ')}</p>`;
    }
  };
  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; play.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2l9 5-9 5z" fill="currentColor"/></svg><b>Play</b>'; };
  $$('.ph[data-p]', bar).forEach(b => b.onclick = () => { stop(); draw(b.dataset.p === 'all' ? 'all' : +b.dataset.p); });
  play.onclick = () => {
    if (timer) return stop();
    let i = 0; draw(0); play.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="2" width="3" height="10" fill="currentColor"/><rect x="8" y="2" width="3" height="10" fill="currentColor"/></svg><b>Pause</b>';
    timer = setInterval(() => { i++; if (i >= phases.length) { stop(); draw('all'); return; } draw(i); }, 3200);
  };
  draw('all');
}
function fmtVal(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return v >= 1e6 ? M(v) : N(v, v % 1 ? 1 : 0);
  return String(v);
}

/* ── levers ────────────────────────────────────────────────────────────── */
function renderLevers(D) {
  const pick = ['fp-lev-01', 'fp-lev-03', 'fp-lev-04', 'fp-lev-05', 'fp-lev-06', 'fp-lev-07', 'fp-lev-09', 'fp-lev-10'];
  const r0 = (D.meta.kpi_roadmap || [])[0];
  const lv = pick.map(id => D.it.find(x => x.id === id)).filter(Boolean).map(l => {
    if (!r0) return l;
    if (l.id === 'fp-lev-09') return { ...l, baseline: +(r0.ebitda_usd / r0.revenue_usd * 100).toFixed(1), evidence: `Baseline = the Oct 2026 run-rate used throughout this page (${M(r0.ebitda_usd)} on ${M(r0.revenue_usd)}, est.), inside the 13-18% analyst range. ` + String(l.evidence || '').split(/(?<=[a-z)]{3}\.)\s+(?=[A-Z])/).slice(1).join(' ') };
    if (l.id === 'fp-lev-10') return { ...l, baseline: Math.round(r0.revenue_usd / r0.headcount / 1e3) * 1e3, evidence: `Baseline = the Oct 2026 run-rate used throughout this page (${M(r0.revenue_usd)} / ${N(r0.headcount)} people, both est.). ` + String(l.evidence || '').split(/(?<=[a-z)]{3}\.)\s+(?=[A-Z])/).slice(1).join(' ') };
    return l;
  });
  const fmt = (v, u) => v == null ? '—' : /USD/.test(u) ? M(v) : /days/.test(u) ? `${v} days` : `${v}%`;
  const phase = id => D.it.find(x => x.id === id);
  $('#lever-grid').innerHTML = lv.map((l, i) => {
    const dt = LEVER_DATES[l.id] || { m: 36 };
    const wp = dt.way && phase(dt.way[0])?.kpi_targets?.[dt.way[1]];
    const wk = wp && Object.keys(wp).find(k => /^target_m\d+/.test(k));
    const way = wk ? `<p class="waypoint">${l.baseline == null ? 'Baseline not public' : esc(fmt(l.baseline, l.unit))} → <b>${esc(fmt(wp[wk], l.unit))}</b> (${esc(monthOf(wk))}) → <b>${esc(fmt(l.target, l.unit))}</b> (month ${dt.m})</p>` : '';
    const lower = /rejected|days/.test(l.unit);
    const scale = Math.max(l.baseline || 0, l.target || 0) * (lower ? 1.1 : 1.08) || 1;
    const bw = l.baseline == null ? 0 : l.baseline / scale * 100, tw = l.target / scale * 100;
    const pct = /%/.test(l.unit), dd = Math.abs(l.target - l.baseline);
    const gap = l.baseline == null ? 'Baseline not public: a diligence item'
      : pct ? `${lower ? '−' : '+'}${+dd.toFixed(1)} pts${lower ? ' · lower is better' : ' vs baseline'}`
      : /days/.test(l.unit) ? `−${dd} days · lower is better`
      : `+${Math.round((l.target / l.baseline - 1) * 100)}% vs baseline`;
    const ev = sents(l.evidence, 2);
    const unit = String(l.unit || '').replace(/^USD /, '').replace(/^%/, 'Percent').replace(/^\w/, c => c.toUpperCase());
    return `<article class="sys-card lever rv"><div class="lh"><span class="num">${i + 1}</span><div><h3 class="sys-card-title">${esc(l.lever)}</h3><p class="unit">${esc(unit)}</p></div></div>
      <div class="bars"><div class="bar-row"><span class="bl">Baseline</span><div class="track ${l.baseline == null ? 'na' : ''}"><i style="width:${bw}%"></i></div><span class="bv">${esc(fmt(l.baseline, l.unit))}</span></div>
      <div class="bar-row"><span class="bl">Target <small>month ${dt.m}</small></span><div class="track trk-t"><i style="width:${tw}%"></i></div><span class="bv">${esc(fmt(l.target, l.unit))}</span></div></div>${way}
      <span class="tag ${l.baseline == null ? '' : 'ok'}">${esc(gap)}</span>
      <p class="ev">${esc(ev)}</p>${src(l.source_url)}</article>`;
  }).join('');
}

/* ── agents ────────────────────────────────────────────────────────────── */
const WHO = [
  { k: 'all', l: 'Everyone' },
  { k: 'att', l: 'Attorneys & firm staff', rx: /attorney|end users|timekeeper|firm staff|innovation/i },
  { k: 'fin', l: 'Law-firm finance & billing', rx: /cfo|billing|finance/i },
  { k: 'sec', l: 'Security leads', rx: /security|soc|ciso/i },
  { k: 'del', l: 'Frontline delivery teams', rx: /frontline/i },
];
const AIC = {
  desk: '<path d="M4 6h16v10H8l-4 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  key: '<circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12h8M17 12v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  doc: '<path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12h7M9 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  clock: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  flow: '<circle cx="6" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 6H14a4 4 0 014 4v5.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const aicOf = a => /tier-0|service desk/i.test(a.agent) ? 'desk' : /password|identity/i.test(a.agent) ? 'key' : /phish|soc/i.test(a.agent) ? 'shield' : /ar |collections/i.test(a.agent) ? 'money' : /ebilling|ocg/i.test(a.agent) ? 'doc' : /time/i.test(a.agent) ? 'clock' : /lifecycle|reconcil/i.test(a.agent) ? 'flow' : 'spark';
function renderAgents(D) {
  const ag = D.kind('ai_agent');
  const tags = a => WHO.filter(w => w.rx && w.rx.test(a.who_it_helps)).map(w => w.k);
  $('#ag-seg').innerHTML = WHO.map((w, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-k="${w.k}">${esc(w.l)}<span class="n">${w.k === 'all' ? ag.length : ag.filter(a => tags(a).includes(w.k)).length}</span></button>`).join('');
  const fm = (v, u) => /USD/.test(u) ? `$${v}` : /^x /.test(u) ? `${v}x` : /%/.test(u) ? `${v}%` : /days/.test(u) ? `${v} days` : /hours/.test(u) ? `${N(v)} hours` : N(v);
  const unitOf = u => String(u || '').replace(/^(?:USD|x|days|hours|%)\s+/, '');
  $('#agent-grid').innerHTML = ag.map(a => `<article class="sys-card agent" data-tags="${tags(a).join(' ')}"><div class="ah"><span class="aic"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${AIC[aicOf(a)]}</svg></span><div><h3 class="sys-card-title">${esc(a.agent)}</h3></div></div>
    <p class="sys-card-body">${esc(a.job_to_be_done)}</p>
    <div class="metric"><b>${esc(fm(a.metric_value, a.metric_unit))}</b><span>${esc(unitOf(a.metric_unit))}</span></div>
    <p class="sys-card-body">${esc(a.metric_claim)}</p>
    <p class="sys-card-body who"><b>Helps:</b> ${esc(a.who_it_helps)}</p>
    <div class="sys-chips">${(a.vendor_examples || []).slice(0, 4).map(v => `<span class="sys-chip">${esc(v)}</span>`).join('')}</div>
    <div class="sys-card-foot"><span>Pilot in about ${a.weeks_to_deploy} weeks<span class="sys-est">est.</span></span>${src(a.source_url)}</div></article>`).join('');
  const sorted = [...ag].sort((a, b) => a.weeks_to_deploy - b.weeks_to_deploy); const mx = Math.max(...ag.map(a => a.weeks_to_deploy));
  $('#runway').innerHTML = `<h3 class="sys-card-title">Pilot runway</h3><p class="sys-card-body">Weeks to a pilot on Frontline tooling (analyst assumption). Fastest payback goes first.</p>` +
    sorted.map(a => `<div class="rw" data-tags="${tags(a).join(' ')}"><div class="rn">${esc(a.agent.replace(/ agent$/i, ''))}<span>${a.weeks_to_deploy} wk</span></div><div class="rb"><i style="width:${a.weeks_to_deploy / mx * 100}%"></i></div></div>`).join('') +
    `<div class="rw-axis"><span>0</span><span>${Math.round(mx / 2)} wk</span><span>${mx} wk</span></div><p class="sys-src">Source: Frontline growth plan AI agents (vendor case studies; timelines are analyst estimates).</p>`;
  $$('#ag-seg button').forEach(b => b.onclick = () => {
    $$('#ag-seg button').forEach(x => x.setAttribute('aria-selected', x === b)); const k = b.dataset.k;
    $$('#agent-grid .agent, #runway .rw').forEach(el => el.classList.toggle('off', k !== 'all' && !el.dataset.tags.split(' ').includes(k)));
  });
}

/* ── talent ────────────────────────────────────────────────────────────── */
function renderTalent(D) {
  const tl = { hq: 'HQ', on: 'US', intl: 'International', off: 'Offshore hub' };
  $('#footprint').innerHTML = OFFICES.map(o => `<div class="fp ${o.type}"><b>${esc(o.name)}</b><span>${esc(o.note)}</span><br><span class="fpt">${esc(tl[o.type])}</span></div>`).join('');
  const ic = ['<path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>', '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" fill="none" stroke="currentColor" stroke-width="1.6"/>', '<path d="M5 19l4-4 3 3 7-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 10h4v4" fill="none" stroke="currentColor" stroke-width="2"/>', '<path d="M12 4l9 4-9 4-9-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7 10v5c3 2 7 2 10 0v-5" fill="none" stroke="currentColor" stroke-width="2"/>', '<path d="M12 3v5M12 16v5M3 12h5M16 12h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>', '<circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M15 20c0-2.5 1-4.5 3-4.5s3 1.5 3 4" fill="none" stroke="currentColor" stroke-width="2"/>'];
  $('#programs').innerHTML = D.kind('talent_program').map((p, i) => `<article class="sys-card prog rv"><span class="pi"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${ic[i % ic.length]}</svg></span>
    <h3 class="sys-card-title">${esc(p.program)}</h3><p class="sys-src" style="margin:0">For ${esc(p.who_it_helps)}</p><p class="sys-card-body">${esc(p.evidence)}</p>
    <div class="sys-note sys-note--co"><span><b>Target:</b> ${esc(String(p.metric || '').replace(/^Target:?\s*/i, ''))}</span></div>${src(p.source_url)}</article>`).join('');
}

/* ── add-ons ───────────────────────────────────────────────────────────── */
function renderAddons(D) {
  const seg = $('#lane-seg');
  const keys = ['all', ...Object.keys(LANES)];
  seg.innerHTML = keys.map((k, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-k="${k}">${k === 'all' ? 'Top 10 overall' : esc(LANES[k].name)}<span class="n">${k === 'all' ? D.tg.length : D.tg.filter(t => laneOf(t) === k).length}</span></button>`).join('');
  const card = (t, r) => {
    const ln = LANES[laneOf(t)]; const comp = /subsidiary of|owned by/i.test(String(t.ownership) + (t.risk_flags || []).join(' ')) && /new charter|BNC|ccs/i.test(String(t.ownership) + (t.risk_flags || []).join(' '));
    return `<article class="sys-card tgt" style="--lc:${ln.color}"><span class="rank">#${r}</span><span class="lane">${esc(ln.name)} · ${esc(ln.phase)}</span>
      <h3 class="sys-card-title">${esc(t.company)}</h3><p class="sys-src" style="margin:0">${esc([t.hq_city, t.state, t.country !== 'United States' ? t.country : ''].filter(Boolean).join(', ') || 'HQ not public')} · ${esc(t.ownership || '')}</p>
      <div class="fit"><b>${t.fit_score}</b><div class="track"><i style="width:${t.fit_score}%"></i></div></div>
      <div class="facts">${t.employees ? `<div>${N(t.employees)} <span>staff</span></div>` : ''}${t.revenue_est_usd ? `<div>${M(t.revenue_est_usd)}<span class="sys-est">est.</span> <span>ZoomInfo revenue</span></div>` : ''}${t.founded_year ? `<div>${t.founded_year} <span>founded</span></div>` : ''}</div>
      <p class="sys-card-body">${esc(sents(t.strategic_rationale, 2))}</p>
      ${(t.risk_flags || []).length ? `<div class="sys-note sys-note--warn"><span>${comp ? '<b>Carve-out or competitor:</b> ' : '<b>Watch:</b> '}${esc(t.risk_flags.slice(0, 2).join('; '))}</span></div>` : ''}
      ${src(t.website, 'Website')}</article>`;
  };
  const draw = k => {
    const list = k === 'all' ? D.tg.slice(0, 10) : D.tg.filter(t => laneOf(t) === k);
    $('#targets').innerHTML = list.map(t => card(t, D.tg.indexOf(t) + 1)).join('');
  };
  draw('all');
  $$('button', seg).forEach(b => b.onclick = () => { $$('button', seg).forEach(x => x.setAttribute('aria-selected', x === b)); draw(b.dataset.k); });

  const sum = a => a.reduce((s, t) => s + (t.revenue_est_usd || 0), 0);
  $('#lanes').innerHTML = `<div class="card-h"><h3 class="sys-card-title">Four lanes, one budget</h3><span class="sys-est">est.</span></div>` +
    Object.entries(LANES).map(([k, l]) => { const a = D.tg.filter(t => laneOf(t) === k); return `<div class="lane-row" style="--lc:${l.color}"><span class="ln"><i></i>${esc(l.name)} <span class="muted" style="font-weight:500">· ${esc(l.phase)}</span></span><span class="lv">${a.length} · ${M(sum(a))}</span><span class="ld">${esc(l.desc)}. Best fit: ${esc(a.slice(0, 2).map(t => t.company.replace(/ \(.*\)$/, '').replace(/,? Inc\.?$/, '')).join(', '))}.</span></div>`; }).join('') +
    `<p class="fine">Plan: ~$55M acquired revenue by month 36 at an estimated $50–80M cost (blended 5–10x EBITDA). Already done under BV Investment Partners: ${esc((D.tgMeta.platform_context?.prior_acquisitions || ['InvoicePrep', 'Glasser Tech', 'Logicforce', 'LANsultants']).map(x => x.replace(/ \(.*/, '')).join(', '))}. KL Software (Aug 2026) is a partnership, not an acquisition.</p>`;

  const steps = [
    ['Day 0–30: keep the brand, lock the people', 'Retain the founder and local brand for 12 months, as Smith + Howard did with Market Street Partners. Sign retention for the top 10 consultants.'],
    ['Day 30–60: move tickets to HELIX', 'Route the desk into HELIX and ServiceNow with Tier-0 deflection. Hand overnight Level 1 work to Hyderabad or Goa.'],
    ['Day 60–90: cross-sell the bundle', 'Offer cyber posture, eBilling and A/R and AI enablement to every acquired client. Track attach rate by cohort.'],
    ['Day 90–100: report the synergy', 'Report revenue per head, net first-level resolution and churn against the deal model to the PRG, then reuse the integration plan on the next deal.'],
  ];
  $('#hundred').innerHTML = `<h3 class="sys-card-title">The first 100 days of every deal</h3><ol class="steps">${steps.map(s => `<li><b>${esc(s[0])}</b><span>${esc(s[1])}</span></li>`).join('')}</ol>`;

  const ord = { high: 0, medium: 1, low: 2 };
  const rel = p => FL_RX(String(p.threat_rationale || '')) ? 0 : 1;
  const rv = [...D.rivals].sort((a, b) => rel(a) - rel(b) || (ord[a.threat_level] ?? 3) - (ord[b.threat_level] ?? 3)).slice(0, 6);
  $('#rivals').innerHTML = `<h3 class="sys-card-title">Who bids against us</h3>${rv.map(p => `<div class="riv"><b>${esc(p.firm)}</b><span class="lvl ${esc(p.threat_level)}">${esc(String(p.threat_level || '—').replace(/^\w/, c => c.toUpperCase()))}</span><p>${esc(flLine(p))}</p></div>`).join('')}<p class="sys-src">Source: private-equity landscape (${D.rivals.length} sponsors overlap with Frontline).</p>`;
}

const FL_RX = s => /frontline|legal|law firm|managed services|managed IT|IT services|IT managed/i.test(s) || /\bIT\b|\bMSPs?\b/.test(s);
const flLine = p => { const ss = String(p.threat_rationale || '').split(/(?<=[a-z0-9%)]{3}\.)\s+(?=[A-Z(])/); return ss.find(FL_RX) || ss[0] || ''; };

/* ── finance & returns ─────────────────────────────────────────────────── */
function renderFinance(D) {
  const fin = D.kind('financing');
  const label = ['Equity at close', 'Senior debt', 'Add-on debt', 'Debt pricing', 'Equity top-up', 'Exit frame'];
  $('#fin-grid').innerHTML = fin.map((f, i) => `<article class="sys-card fin rv"><span class="sys-card-label">${esc(label[i] || 'Financing')}</span><h3 class="sys-card-title">${esc(f.source_of_funds)}</h3><p class="amt">${esc(f.amount_or_range)}</p><p class="sys-card-body">${esc(sents(f.evidence, 2))}</p>${src(f.source_url)}</article>`).join('');

  /* roadmap chart */
  const r = D.meta.kpi_roadmap || [];
  const drawRoad = () => {
  const W = Math.round(Math.max(300, Math.min(640, $('#road-chart').clientWidth || 640))), narrow = W < 480;
  const H = narrow ? 250 : 270, pl = narrow ? 40 : 46, pr = narrow ? 30 : 46, pt = 20, pb = 34, cw = W - pl - pr, ch = H - pt - pb;
  const maxR = 240e6, maxM = 25;
  const gx = i => pl + (i + .5) * (cw / r.length), bw = cw / r.length * .26;
  const y = v => pt + ch - v / maxR * ch, ym = v => pt + ch - v / maxM * ch;
  const grid = [0, 60e6, 120e6, 180e6, 240e6].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--sys-line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" style="fill:var(--sys-mute-2)">${M(v)}</text>`).join('');
  const mg = [0, 10, 20].map(v => `<text x="${W - pr + 6}" y="${ym(v) + 4}" font-size="10" style="fill:var(--sys-good)">${v}%</text>`).join('');
  const bars = r.map((x, i) => `<rect x="${gx(i) - bw - 2}" y="${y(x.revenue_usd)}" width="${bw}" height="${pt + ch - y(x.revenue_usd)}" rx="4" style="fill:var(--co)"><title>Revenue ${M(x.revenue_usd)}</title></rect><text x="${gx(i) - bw / 2 - 2}" y="${y(x.revenue_usd) - 5}" text-anchor="middle" font-size="10.5" font-weight="600" style="fill:var(--sys-ink);stroke:var(--sys-surface)" stroke-width="3" paint-order="stroke">${M(x.revenue_usd)}</text>
    <rect x="${gx(i) + 2}" y="${y(x.ebitda_usd)}" width="${bw}" height="${pt + ch - y(x.ebitda_usd)}" rx="4" style="fill:color-mix(in srgb,var(--sys-good) 40%,var(--sys-surface))"><title>Adj. EBITDA ${M(x.ebitda_usd)}</title></rect><text x="${gx(i) + bw / 2 + 2}" y="${y(x.ebitda_usd) - 5}" text-anchor="middle" font-size="10.5" font-weight="600" style="fill:var(--sys-good)">${M(x.ebitda_usd)}</text>
    <text x="${gx(i)}" y="${H - 12}" text-anchor="middle" font-size="11" style="fill:var(--sys-mute)">${x.month === 0 ? 'Today' : (narrow ? 'M' : 'Month ') + x.month}</text>`).join('');
  const line = r.map((x, i) => `${gx(i)},${ym(x.ebitda_usd / x.revenue_usd * 100)}`).join(' ');
  const dots = r.map((x, i) => `<circle cx="${gx(i)}" cy="${ym(x.ebitda_usd / x.revenue_usd * 100)}" r="3.5" style="fill:var(--sys-surface);stroke:var(--sys-good)" stroke-width="2"/>`).join('');
  $('#road-chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue and adjusted EBITDA by month with EBITDA margin line">${grid}${mg}<polyline points="${line}" style="fill:none;stroke:var(--sys-good)" stroke-width="2" stroke-dasharray="4 3"/>${dots}${bars}</svg>
    <div class="chart-legend"><span><i style="background:var(--co)"></i>Revenue</span><span><i style="background:color-mix(in srgb,var(--sys-good) 40%,var(--sys-surface))"></i>Adj. EBITDA</span><span><i style="background:var(--sys-good);border-radius:50%"></i>EBITDA margin (right axis)</span></div>`;
  };
  drawRoad();
  $('#road-table').innerHTML = `<div class="sys-table-wrap rt-wrap"><table class="sys-table rt"><thead><tr><th>Month</th><th class="sys-n">Revenue</th><th class="sys-n">Adj. EBITDA</th><th class="sys-n">Margin</th><th class="sys-n">People</th><th class="sys-n">Revenue per head</th><th class="sys-n">Clients</th></tr></thead><tbody>${r.map((x, i) => `<tr class="${i === r.length - 1 ? 'hl' : ''}"><td>${x.month === 0 ? 'Today (Oct 2026)' : 'Month ' + x.month}</td><td class="sys-n">${M(x.revenue_usd)}</td><td class="sys-n">${M(x.ebitda_usd)}</td><td class="sys-n">${(x.ebitda_usd / x.revenue_usd * 100).toFixed(1)}%</td><td class="sys-n">${N(x.headcount)}</td><td class="sys-n">${M(x.revenue_usd / x.headcount)}</td><td class="sys-n">${N(x.locations_or_accounts)}</td></tr>`).join('')}</tbody><caption>Source: Frontline growth plan KPI roadmap. Every figure is an analyst estimate.</caption></table></div>
    <p class="fine">${esc(String(r[r.length - 1]?.note || '').replace(/^ASSUMPTION\.\s*/, 'Assumption: '))}</p>`;

  /* value bridge */
  const an = D.meta.anchors || {}; const entryMid = (an.entry_ev_ebitda_est_x || [12, 15]).reduce((a, b) => a + b, 0) / 2;
  const e0 = r[0]?.ebitda_usd || 20e6, e1 = r[r.length - 1]?.ebitda_usd || 41e6, rev1 = r[r.length - 1]?.revenue_usd || 215e6;
  const { netDebt, eqIn } = RET;
  const mx = $('#mx'), os = $('#os'), en = $('#en');
  if (en) en.value = entryMid;
  const drawBridge = () => {
    const bx = +mx.value, ot = +os.value, entryX = en ? +en.value : entryMid;
    $('#mx-out').textContent = bx.toFixed(1) + 'x'; $('#os-out').textContent = ot.toFixed(2).replace(/0$/, '') + ' turns';
    if (en) $('#en-out').textContent = entryX.toFixed(1) + 'x';
    const R = returnsAt(bx + ot, e1), vd = verdict(bx + ot, e1, rev1);
    const today = e0 * entryX, growth = (e1 - e0) * entryX, mult = (bx - entryX) * e1, prem = ot * e1, exit = today + growth + mult + prem;
    const steps = [['Today', today, 'base'], ['EBITDA|growth', growth, 'up'], ['Multiple|vs entry', mult, mult >= 0 ? 'up' : 'down'], ['FirmOS|premium', prem, 'up'], ['Month 36', exit, 'base']];
    const W2 = Math.round(Math.max(290, Math.min(560, $('#bridge').clientWidth || 520))), H2 = 262, p2 = W2 < 420 ? 8 : 24, top = 22, bot = 58, hh = H2 - top - bot; const vmax = Math.max(560e6, exit, today + Math.max(0, growth)) * 1.1;
    const yy = v => top + hh - v / vmax * hh; const bw2 = (W2 - p2 * 2) / steps.length * .62; const xx = i => p2 + (i + .5) * ((W2 - p2 * 2) / steps.length);
    let run = 0; const col = { base: 'var(--sys-ink)', up: 'var(--co)', down: 'var(--sys-bad)' };
    const rects = steps.map(([l, v, t], i) => {
      let y0, y1; if (t === 'base') { y0 = 0; y1 = v; run = v; } else { y0 = run; y1 = run + v; run = y1; }
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      return `<rect x="${xx(i) - bw2 / 2}" y="${yy(hi)}" width="${bw2}" height="${Math.max(1.5, yy(lo) - yy(hi))}" rx="4" style="fill:${t === 'up' && /FirmOS/.test(l) ? 'var(--sys-good)' : col[t]}"/><text x="${xx(i)}" y="${yy(hi) - 6}" text-anchor="middle" font-size="11" font-weight="600" style="fill:var(--sys-ink)">${t === 'base' ? '' : v >= 0 ? '+' : '−'}${M(Math.abs(v))}</text>
        <text x="${xx(i)}" y="${H2 - 38}" text-anchor="middle" font-size="10.5" style="fill:var(--sys-mute)">${String(l).split('|').map((t, j) => `<tspan x="${xx(i)}" dy="${j ? 12 : 0}">${esc(t)}</tspan>`).join('')}</text>${i < steps.length - 1 ? `<line x1="${xx(i) + bw2 / 2}" x2="${xx(i + 1) - bw2 / 2}" y1="${yy(run)}" y2="${yy(run)}" style="stroke:var(--sys-mute-2)" stroke-dasharray="3 3"/>` : ''}`;
    }).join('');
    $('#bridge').innerHTML = `<svg viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Enterprise value bridge from today to month 36"><line x1="${p2}" x2="${W2 - p2}" y1="${yy(0)}" y2="${yy(0)}" style="stroke:var(--sys-line-2)"/>${rects}<text x="${p2}" y="${H2 - 4}" font-size="10" style="fill:var(--sys-mute-2)">Today's EV = ${entryX.toFixed(1)}x entry (est.) × ${M(e0)} EBITDA</text></svg>
      <div class="bridge-sum"><div><b>${M(exit)}</b><span>Month-36 EV at ${(bx + ot).toFixed(2).replace(/0$/, '')}x × ${M(e1)}</span></div><div><b>${M(R.eq)}</b><span>Equity value after ~${M(netDebt)} net debt</span></div><div><b>${R.moic.toFixed(1)}x</b><span>Gross MOIC on ~${M(eqIn)} equity · ~${Math.round(R.irr)}% IRR</span></div></div>
      <div class="sys-note ${vd.clears ? 'sys-note--good' : 'sys-note--warn'} bridge-verdict" style="margin-top:12px">${verdictHtml(vd, bx + ot, e1, rev1)}</div>`;
    $('#bridge-note').textContent = `Illustrative estimate. The entry multiple defaults to ${entryMid.toFixed(1)}x, the midpoint of the 12-15x range implied by public filings; set it to the actual figure. It changes how the bridge splits value, not the month-36 EV or MOIC, which depend on the exit multiple and EBITDA. MSP deal comps run 9.9-11.2x by size (Aventis), and premium middle-market deals price ~3 turns above typical (Capstone/IMAP). Net debt = $90M term loan + ~$25M incremental (midpoint of $15-35M). Equity = $137M from BSP's Frontline fund + $30M co-invest + ~$32.5M top-up (midpoint of $20-45M). Exit at month 36 (Oct 2029); hold ~4.85 years from Dec 2024. Phase 4 runs to month 42 and is sold as the buyer's growth story; only the first UK/Canada add-on is in month-36 EBITDA. Excludes fees, cash build and rollover.`;
    drawOs(bx, ot);
  };
  const drawOs = (bx, ot) => {
    const ra = D.ra; if (!ra) { $('#os-case').style.display = 'none'; return; }
    const [i0, i1] = ra.investment_usd, [u0, u1] = ra.ebitda_impact_usd, [t0, t1] = ra.multiple_expansion_turns;
    /* Like-for-like midpoint: FirmOS EBITDA is already inside the month-36 roadmap EBITDA, and its turns are the bridge's FirmOS slider. */
    const um = (u0 + u1) / 2, im = (i0 + i1) / 2, vEb = um * bx, vPrem = ot * e1, vm = vEb + vPrem;
    $('#os-case').innerHTML = `<div><span class="sys-card-label">FirmOS thesis <span class="sys-est">est.</span></span><h3 class="sys-card-title" style="margin-top:8px">The multiple-expansion case for ${esc(ra.os_name)}</h3><p>${esc(sents(String(ra.rationale || '').replace(/already entered at an estimated 12-15x, so FirmOS defends the premium rather than creating one/, 'is estimated from public filings to have entered at 12-15x. If so, FirmOS defends that multiple rather than creating a new one'), 3))}</p><p><a class="sys-link" href="firmos.html">See FirmOS →</a></p></div>
      <div class="os-flow"><div><b>${M(i0)}–${M(i1)}</b><span>investment</span></div><div><b>+${M(u0)}–${M(u1)}</b><span>EBITDA (${ra.ebitda_impact_pct_revenue.join('–')}% of revenue), already inside the ${M(e1)} month-36 EBITDA</span></div><div><b>+${t0}–${t1}x</b><span>turns: the same turns as the bridge's FirmOS slider (now ${ot.toFixed(2).replace(/0$/, '')}), not extra value</span></div><div><b>~${M(vm)}</b><span>of the month-36 EV attributable to FirmOS at midpoint (${M(um)} × ${bx.toFixed(1)}x + ${ot.toFixed(2).replace(/0$/, '')} turns × ${M(e1)}), ~${Math.round(vm / im)}x the ${M(im)} midpoint spend</span></div></div>
      <p class="fine os-note">This is a slice of the bridge above, not value on top of it. Drop the FirmOS slider to 0 to see the plan without the premium.</p>`;
  };
  mx.oninput = drawBridge; os.oninput = drawBridge; if (en) en.oninput = drawBridge; drawBridge();
  let rw = window.innerWidth, rt;
  window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - rw) < 24) return; rw = window.innerWidth; clearTimeout(rt); rt = setTimeout(() => { drawRoad(); drawBridge(); }, 150); });
}

/* ── risks & asks ──────────────────────────────────────────────────────── */
function renderRisks() {
  const risks = [
    ['The numbers are estimates, not disclosures', 'Revenue ($100-140M), EBITDA ($16-20M) and margin come from leverage and headcount assumptions.', 'Rebase the KPI roadmap on monthly management accounts within 30 days.'],
    ['The entry multiple may not hold at exit', 'If entry was in the ~12-15x range implied by public filings, it sits above MSP deal comps (9.9-11.2x by size), so the exit multiple may compress.', 'Defend it with recurring mix above 50%, churn below 10% and cyber attach. Let EBITDA growth carry the return.'],
    ['The add-on plan outruns the debt', 'About $50-80M of add-on spend against ~$15-35M of incremental debt capacity at sector-norm leverage.', 'Plan a co-invest top-up of $20–45M now, starting with the $7.5M of unsold capacity in the Frontline co-invest vehicle.'],
    ['Client count and churn are unreconciled', 'Press releases say 800-900+ firms while the homepage says 300. Churn and recurring mix are not public.', 'Reconcile both, and disclose the revolver or delayed-draw facility, before any lender or sale process.'],
    ['Consolidators bid up legal MSPs', 'Alpine (Evergreen), New Charter, CIVC and EagleTree all buy in IT or legal services.', 'Move first on founder-owned targets (Tabush, Garver, Legal Billing Group) and keep local brands, as S+H did.'],
    ['AI results are vendor claims', 'Moveworks (25-35%), HighRadius and Laurel figures are vendor-published, and HELIX has no published deflection metric yet.', 'Run every pilot against a control group and publish deflection and DSO monthly.'],
    ['International is a foothold, not a business', 'The UK subsidiary booked ~GBP 0.58M in 2024. SRA-regulated clients raise the bar.', 'Buy, don\'t build: acquire Quiss or ALB and staff UK hours from Cape Town.'],
  ];
  $('#risk-list').innerHTML = risks.map(r => `<li><b>${esc(r[0])}</b>${esc(r[1])}<br><span class="mit"><b>Mitigation:</b> ${esc(r[2])}</span></li>`).join('');
  const asks = [
    ['Approve the add-on budget and co-invest top-up', 'Now', 'About $50-80M over 36 months; pre-clear $20-45M of equity so Phase 2 deals are not lost on timing.'],
    ['Fund a 90-day HELIX Tier-0 pilot', 'Month 0-3', 'Pilot on 3-5 AM Law clients with a control group; target 20% autonomous resolution by month 12 and 30% by month 36.'],
    ['Run a 30-day diligence-gap sprint', 'Month 0-1', 'Client count, churn, recurring mix and revolver or delayed-draw terms; correct the KL Software record (a partnership).'],
    ['Name an offshore delivery leader', 'Quarter 1', 'Hyderabad, Goa and Cape Town under one leader with a go-to-market and integration mandate, as S+H did for India.'],
    ['Open founder doors through the BSP network', 'Months 3-12', 'Introductions to Kraft Kennedy, Tabush, Innovative Computing Systems, Garver Group and Helm360.'],
    ['Own a cyber-attestation capability before the sale process', 'By month 18', 'Buy or build SOC 2 / ISO / OCG security attestations (the Geels Norton move); PSM Partners, STS and Lumifi are on the screen.'],
  ];
  $('#ask-list').innerHTML = asks.map(a => `<li><b>${esc(a[0])}</b><span class="when">${esc(a[1])}</span><br><span class="muted">${esc(a[2])}</span></li>`).join('');
}

/* ── sources ───────────────────────────────────────────────────────────── */
function renderSources(D) {
  const groups = [['Template', 'template'], ['Phases', 'expansion_phase'], ['Levers', 'growth_lever'], ['AI agents', 'ai_agent'], ['Talent', 'talent_program'], ['Financing', 'financing']];
  const seen = new Set();
  const g = groups.map(([l, k]) => { const urls = D.kind(k).flatMap(x => x.source_urls || [x.source_url]).filter(u => u && !seen.has(u) && seen.add(u)); return `<h4>${esc(l)}</h4><ul>${urls.map(u => `<li><a href="${escRaw(u)}" target="_blank" rel="noopener">${esc(host(u))} ↗</a></li>`).join('')}</ul>`; }).join('');
  const method = String(D.meta.method || '').split(/(?<=\.)\s+(?=Items marked)/)[0].replace(/ was fetched on (\d{4})-(\d{2})-\d{2}/, ' was read in October $1');
  const gen = /^\d{4}-\d{2}-\d{2}$/.test(D.meta.generated || '') ? Fmt.date(D.meta.generated) : 'Oct 2026';
  $('#src-body').innerHTML = `<p>${esc(method)} Phase figures were computed from the portal's own data, listed below. Targets are explicit analyst assumptions.</p><h4>Caveats</h4><ul>${(D.meta.caveats || []).map(c => `<li>${esc(clean(c))}</li>`).join('')}</ul>
    <h4>Portal data used</h4><ul><li>Frontline growth plan (${D.it.length} items, ${esc(gen)})</li><li>AM Law prospect list (${D.law.length} firms, grouped by headquarters city)</li><li>Mid-size law firms research (${D.mid.length} firms)</li><li>Frontline and Thomas Scientific add-on targets (${D.tg.length} Frontline targets)</li><li>Private-equity landscape (${D.rivals.length} overlapping sponsors)</li><li>BSP firm profile, Frontline public filings, public comparables and ServiceOS evidence (valuation and KPI benchmarks)</li></ul>${g}`;
}

/* ── chat ──────────────────────────────────────────────────────────────── */
function mountChat(Chat, D, frame) {
  if (!Chat) return;
  const r = D.meta.kpi_roadmap || [], a = r[0] || {}, z = r[r.length - 1] || {};
  const top = D.tg.slice(0, 5);
  const ag = [...D.kind('ai_agent')].sort((x, y) => x.weeks_to_deploy - y.weeks_to_deploy).slice(0, 4);
  const faq = [
    { q: 'What is the Frontline growth plan?', href: '#map', a: `<p><b>Earn more from each firm, move into the mid-market, roll up revenue-cycle services, then enter the UK and Canada.</b> Frontline already serves ~50% of the AM Law 200, so the 36-month plan (est.) takes revenue from <b>${M(a.revenue_usd)}</b> to <b>${M(z.revenue_usd)}</b> and adj. EBITDA from <b>${M(a.ebitda_usd)}</b> to <b>${M(z.ebitda_usd)}</b>.</p><ul><li><b>Phase 1 (m0-12):</b> HELIX Tier-0 agent, cyber-posture subscription, legal-AI enablement</li><li><b>Phase 2 (m6-18):</b> 143 mid-size firms + legal-MSP tuck-ins</li><li><b>Phase 3 (m12-30):</b> eBilling/AR roll-up with finance agents</li><li><b>Phase 4 (m24-42):</b> UK and Canada via acquired providers. The exit is modelled at m36, so only the first UK/Canada add-on is in exit EBITDA; the rest is the buyer's growth story.</li></ul>` },
    { q: 'Which add-on targets should Frontline buy first?', href: '#addons', a: `<p>Top of the screen by fit score (out of 100):</p><ul>${top.map(t => `<li><b>${esc(t.company)}</b>: ${esc(LANES[laneOf(t)].name)}, ${esc(t.hq_city)}, fit ${t.fit_score}</li>`).join('')}</ul><p>The plan targets ~$55M of acquired revenue by month 36 at 2-3 deals a year. ZoomInfo revenue figures are modelled and directional.</p>` },
    { q: 'How is the plan financed and what is it worth at exit?', href: '#returns', a: `<p>BSP put in ~$137M through its Frontline fund + $30M co-invest alongside a <b>$90M NXT/Audax term loan</b>. Add-ons cost an estimated <b>$50-80M</b>, and incremental debt covers only ~$15-35M, so plan a <b>$20-45M co-invest top-up</b>.</p><p>At a 12x base exit multiple + 1 turn FirmOS premium on ${M(z.ebitda_usd)} EBITDA, month-36 EV is ~${M(z.ebitda_usd * 13)} (est.), about ${returnsAt(13, z.ebitda_usd).moic.toFixed(1)}x gross MOIC and ~${Math.round(returnsAt(13, z.ebitda_usd).irr)}% IRR. That is below a 2.5x / 20% hurdle; add-on EBITDA bought at 5-7x and margin to 20%+ close the gap.</p>` },
    { q: 'Which AI agents go live first?', href: '#agents', a: `<p>Fastest pilots on Frontline tooling (analyst estimates):</p><ul>${ag.map(x => `<li><b>${esc(x.agent)}</b>: ~${x.weeks_to_deploy} weeks; ${esc(x.metric_claim.split(/(?<=\.)\s+/)[0])}</li>`).join('')}</ul><p>Vendor results are directional upper bounds; HELIX has no published deflection metric yet.</p>` },
    { q: 'How does Frontline compare with Smith + Howard?', href: '#template', a: `<p><b>Smith + Howard</b> went from ~100 professionals and one Atlanta office to ~800 people, 11 locations and 9 acquisitions in about 3.5-3.7 years (~4x revenue over the hold, per BSP), then sold to TPG Growth in Aug 2026.</p><p><b>Frontline</b> starts far bigger (est. ${M(a.revenue_usd)} revenue, ~${N(a.headcount)} people, offshore hubs already in place), so the plan is ~1.65x revenue and ~2x EBITDA in 36 months (est.). What transfers is the order of moves: leadership and tech first, 2-3 add-ons a year, a named offshore leader, and a cyber-attestation capability before the sale (the Geels Norton move).</p>` },
    { q: 'What are the biggest risks?', href: '#risks', a: `<ul><li><b>Estimates, not disclosures:</b> revenue and EBITDA are analyst assumptions; rebase on management accounts in 30 days.</li><li><b>The exit multiple may compress:</b> if entry was ~12-15x (public-filing estimate), it sits above MSP comps (9.9-11.2x), so EBITDA growth must carry the return.</li><li><b>Add-ons outrun the debt:</b> ~$50-80M of spend vs ~$15-35M of incremental debt; pre-clear a $20-45M co-invest top-up.</li><li><b>Consolidators bid up legal MSPs:</b> Alpine, CIVC, EagleTree and others buy in the space.</li><li><b>AI results are vendor claims:</b> run every pilot against a control group.</li></ul>` },
    { q: 'What does the plan need from the PRG?', href: '#risks', a: `<ol><li>Approve the add-on budget and co-invest top-up (now)</li><li>Fund a 90-day HELIX Tier-0 pilot (months 0-3)</li><li>Run a 30-day diligence-gap sprint on client count, churn and revolver terms</li><li>Name one offshore delivery leader for Hyderabad, Goa and Cape Town (Q1)</li><li>Open founder doors to Kraft Kennedy, Tabush, Innovative Computing Systems, Garver and Helm360</li><li>Own a cyber-attestation capability by month 18</li></ol>` },
    { q: 'How does Frontline enter the UK and Canada?', href: '#map', a: `<p>Phase 4 (months 24-42, est.) buys rather than builds. Only the first add-on lands before the month-36 exit. Frontline's UK subsidiary booked only ~GBP 0.58M in 2024, so the plan acquires a local legal MSP (Quiss Technology, Tamworth, fit 86, is the top international target) and staffs UK hours from Cape Town. Toronto has been open since 2010 and is the base for a Canadian tuck-in.</p>` },
    { q: 'What is the offshore talent plan?', href: '#talent', a: `<p>Hyderabad, Goa and Cape Town get one named leader with a go-to-market and integration mandate, as Smith + Howard did for India in Sep 2025. Targets (analyst assumptions): ~55-60% of delivery headcount offshore by month 36, a certification ladder with pay steps, a US apprenticeship in Toledo and St. Louis, and 40 certified legal-AI enablement consultants by month 18.</p>` },
    { q: 'Which operating levers move EBITDA?', href: '#levers', a: `<ul><li>AM Law 200 share of wallet: 50% → 54% (m12) → 60% (m36)</li><li>E-billing rejection rate: 18% → 11% (m30)</li><li>Days from invoice to payment: 62 → 50 (m30)</li><li>Service desk first-level resolution: 74% → 82% (m12) → 90% (m36)</li><li>Tier-0 autonomous resolution: 20% (m12) → 30% (m36)</li><li>Adj. EBITDA margin: ${(a.ebitda_usd / a.revenue_usd * 100).toFixed(1)}% → ${(z.ebitda_usd / z.revenue_usd * 100).toFixed(1)}% (m36)</li></ul><p>Baselines are benchmarks where Frontline's own figure is not public (est.).</p>` },
  ];
  const inst = Chat.mount(null, {
    persona: 'fl', short_name: 'Frontline', mode: 'floating', theme: 'light', name: 'Frontline growth plan', color: PHASE_COLORS[0], greeting: 'Ask about the Frontline growth plan: phases, add-on targets, AI agents, financing or the Smith + Howard template.',
    placeholder: 'Ask the plan…', faq,
    suggestions: faq.map(f => f.q).concat(['How does Frontline compare with Smith + Howard?', 'What are the biggest risks?']),
  });
  if (inst && frame && frame.setChat) frame.setChat(inst);
}

/* ── reveal on scroll ──────────────────────────────────────────────────── */
function reveal() {
  const els = $$('.rv');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });
  els.forEach(e => io.observe(e));
  setTimeout(() => els.forEach(e => e.classList.add('in')), 2500);
}
