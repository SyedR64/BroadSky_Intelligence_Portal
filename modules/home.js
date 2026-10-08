/* Command Center — portfolio-wide situational awareness */
import { dataset, srcLabel } from './copy.js?v=20261008145402';
const GROUP_TXT = { research: 'Research', sales: 'Deed records', legacy: 'Core table' };
const BASIS_TXT = { live: 'Checked today', snapshot: 'Last update', 'live (manifest)': 'Last update', missing: 'Unavailable' };
const COS = [
  { id: 'cet', name: 'Commonwealth Electrical (CET)', short: 'CET', color: 'var(--co-cet)', hex: '#4c8dff', sector: 'Commercial electrical · solar · energy', hq: 'Worcester, MA', lat: 42.2626, lon: -71.8023, entry: '2025-02', footprint: 'Licensed in all 6 New England states', lever: 'Cross-sell Horton wastewater accounts into solar, storage & efficiency; win municipal/utility programs' },
  { id: 'pp', name: 'Punctual Pros', short: 'PP', color: 'var(--co-pp)', hex: '#f08a3c', sector: 'Residential HVAC · plumbing · electrical', hq: 'East Hempfield, PA', lat: 40.0629, lon: -76.3700, entry: '2024-04', footprint: '248 Central PA zips + Ocean/Monmouth NJ', lever: 'New-mover marketing, weather-driven capacity planning, tuck-in franchisees in adjacent counties' },
  { id: 'fl', name: 'Frontline Managed Services', short: 'FL', color: 'var(--co-fl)', hex: '#9d7bff', sector: 'Legal managed IT · revenue cycle', hq: 'St. Louis, MO', lat: 38.6270, lon: -90.1994, entry: '2024-12', footprint: '800+ law firms · >50% of AM Law 200', lever: 'Expand into mid-size firms; bundle cyber + eBilling; add-on legal MSPs' },
  { id: 'ts', name: 'Thomas Scientific', short: 'TS', color: 'var(--co-ts)', hex: '#2ecc8f', sector: 'Lab supply distribution', hq: 'Swedesboro, NJ', lat: 39.7476, lon: -75.3105, entry: '2022-01', footprint: 'National · 27k scored lab/hospital sites', lever: 'Target-account selling into diagnostics labs & hospital systems; regional distributor roll-ups' },
  { id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--co-bpi)', hex: '#e05c8a', sector: 'Communications · public affairs', hq: 'Washington, DC', lat: 38.9072, lon: -77.0369, entry: '2023-04', footprint: 'DC · NYC · SF · Chicago · Europe', lever: 'Corporate reputation & AI-era comms demand; public-sector RFPs' },
  { id: 'fh', name: 'Fair Harbor', short: 'FH', color: 'var(--co-fh)', hex: '#3fd0e0', sector: 'Consumer · sustainable apparel', hq: 'New York, NY', lat: 40.7128, lon: -74.0060, entry: '2022-03', footprint: 'DTC + wholesale', lever: 'Wholesale door expansion; category extension; retention' },
];

/* Dataset inventory snapshot (ls of data/research + data/sales, 2026-09-24). Row counts are refreshed at render time from
   data/manifest.json (legacy tables) and from any dataset this page already loaded; "Refresh live counts" re-reads every file. */
const DATA_FILES = [{"g":"research","n":"bpi_filings","co":"bpi","rows":21,"gen":"2026-09-24"},{"g":"research","n":"bsp_firm","co":"bsp","rows":6,"gen":"2026-09-24"},{"g":"research","n":"cet_filings","co":"cet","rows":25,"gen":"2026-09-24"},{"g":"research","n":"cet_opportunities","co":"cet","rows":86,"gen":"2026-09-24"},{"g":"research","n":"cet_wwtp_targets","co":"cet","rows":183,"gen":"2026-09-24"},{"g":"research","n":"fairharbor_filings","co":"fh","rows":25,"gen":"2026-09-24"},{"g":"research","n":"fl_midsize_firms","co":"fl","rows":143,"gen":"2026-09-24"},{"g":"research","n":"frontline_filings","co":"fl","rows":21,"gen":"2026-09-24"},{"g":"research","n":"ma_targets_cet","co":"ma","rows":48,"gen":"2026-09-24"},{"g":"research","n":"ma_targets_fl_ts","co":"ma","rows":48,"gen":"2026-09-24"},{"g":"research","n":"ma_targets_pp","co":"ma","rows":61,"gen":"2026-09-24"},{"g":"research","n":"pe_landscape","co":"pe","rows":35,"gen":"2026-09-24"},{"g":"research","n":"pp_demand_model","co":"pp","rows":54,"gen":"2026-09-24"},{"g":"research","n":"pp_filings","co":"pp","rows":29,"gen":"2026-09-24"},{"g":"research","n":"pp_market","co":"pp","rows":177,"gen":"2026-09-24"},{"g":"research","n":"pp_storm_events","co":"pp","rows":1575,"gen":"2026-09-24"},{"g":"research","n":"public_comps","co":"fin","rows":31,"gen":"2026-09-24"},{"g":"research","n":"rival_filings","co":"fin","rows":51,"gen":"2026-09-24"},{"g":"research","n":"thomas_filings","co":"ts","rows":31,"gen":"2026-09-24"},{"g":"sales","n":"bpi_sales_dc","co":"bpi","rows":8003,"res":7169,"gen":"2026-09-24","counties":["District of Columbia DC"]},{"g":"sales","n":"cet_home_sales_ct_ri","co":"cet","rows":31591,"res":31591,"gen":"2026-09-24","counties":["Fairfield CT","Hartford CT","Litchfield CT","Middlesex CT","New Haven CT","New London CT","Providence RI","Tolland CT","Windham CT"]},{"g":"sales","n":"cet_home_sales_ma","co":"cet","rows":14273,"res":14273,"gen":"2026-09-24","counties":["Bristol MA","Essex MA","Hampden MA","Hampshire MA","Middlesex MA","Norfolk MA","Plymouth MA","Suffolk MA","Worcester MA"]},{"g":"sales","n":"cet_transfers_ct_ri","co":"cet","rows":5816,"res":0,"gen":"2026-09-24","counties":["Fairfield CT","Hartford CT","Litchfield CT","Middlesex CT","New Haven CT","New London CT","Providence RI","Tolland CT","Windham CT"]},{"g":"sales","n":"cet_transfers_ma","co":"cet","rows":4317,"res":0,"gen":"2026-09-24","counties":["Bristol MA","Essex MA","Hampden MA","Hampshire MA","Middlesex MA","Norfolk MA","Plymouth MA","Suffolk MA","Worcester MA"]},{"g":"sales","n":"fh_sales_nyc","co":"fh","rows":19553,"res":17018,"gen":"2026-09-24","counties":["New York NY"]},{"g":"sales","n":"pp_sales_nj","co":"pp","rows":25486,"res":21478,"gen":"2026-09-24","counties":["Atlantic NJ","Burlington NJ","Monmouth NJ","Ocean NJ"]},{"g":"sales","n":"pp_sales_pa_a","co":"pp","rows":19822,"res":17099,"gen":"2026-09-24","counties":["Cumberland PA","Dauphin PA","Lancaster PA","York PA"]},{"g":"sales","n":"pp_sales_pa_b","co":"pp","rows":31941,"res":27214,"gen":"2026-09-24","counties":["Adams PA","Berks PA","Chester PA","Franklin PA","Lebanon PA","Montgomery PA","Perry PA"]},{"g":"sales","n":"ts_sales_gloucester_nj","co":"ts","rows":2936,"res":2936,"gen":"2026-09-24","counties":["Gloucester NJ"]}];
const CO_HEX = { cet: '#4c8dff', pp: '#f08a3c', fl: '#9d7bff', ts: '#2ecc8f', bpi: '#e05c8a', fh: '#3fd0e0', ma: '#f5b73d', pe: '#c9a0ff', fin: '#8bd3ff', bsp: '#d9622b', sh: '#8a94a6' };
/* system accent per dataset owner: the six companies read their own --co-* token (data-co), everything portfolio-wide reads
   the brand, Smith + Howard (exited, not a current company) reads the neutral mute */
const CO_IDS = new Set(['cet', 'pp', 'fl', 'ts', 'bpi', 'fh']);
const CO_VAR = id => CO_IDS.has(id) ? `var(--co-${id})` : id === 'sh' ? 'var(--sys-mute-2)' : 'var(--sys-brand)';
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** data-co attribute for a company id (system.css derives --co, --co-ink, --co-soft); others pass their token inline. */
const coAttr = id => CO_IDS.has(id) ? `data-co="${id}"` : `data-co="" style="--co:${CO_VAR(id)}"`;
/** Company chip: .sys-chip--soft in the company accent (the short name or a label). */
const coChip = (id, t, title) => `<span class="sys-chip sys-chip--soft" ${coAttr(id)}${title ? ` title="${h(title)}"` : ''}>${h(t)}</span>`;
/** Status chip: .sys-chip--good | --warn | --bad | --info, or neutral. */
const stChip = (t, st) => `<span class="sys-chip${st ? ` sys-chip--${st}` : ''}">${h(t)}</span>`;
const CO_SHORT = { cet: 'CET', pp: 'PP', fl: 'FL', ts: 'TS', bpi: 'BPI', fh: 'FH', ma: 'M&A', pe: 'PE', fin: 'FIN', bsp: 'BSP', sh: 'S+H' };
const LEGACY_CO = { cet_ne_counties: 'cet', cet_ne_development: 'cet', cet_ne_rfps: 'cet', cet_nyc_archive_summary: 'cet', pp_zips: 'pp', pp_sales_90d: 'pp', pp_meta: 'pp', fl_lawfirms: 'fl', ts_sites: 'ts', ts_parents: 'ts' };
/* bsp_firm.timeline company names → company colour */
const tlColor = c => { const s = String(c || ''); return CO_VAR(/Commonwealth|CET|NuWave|Horton/i.test(s) ? 'cet' : /Punctual|Horvath/i.test(s) ? 'pp' : /Frontline/i.test(s) ? 'fl' : /Thomas/i.test(s) ? 'ts' : /Bully|BPI/i.test(s) ? 'bpi' : /Fair Harbor/i.test(s) ? 'fh' : /Smith/i.test(s) ? 'sh' : 'bsp'); };
const mdy = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : (s || null); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = s => { if (!s) return null; const v = mdy(String(s)); const d = new Date(/^\d{4}$/.test(v) ? `${v}-07-01` : /^\d{4}-\d{2}$/.test(v) ? `${v}-15` : v); return isNaN(d) ? null : d; };
const monYr = s => { const d = toDate(s); return d ? `${MON[d.getMonth()]} ${d.getFullYear()}` : '—'; };
const yrsBetween = (a, b = new Date()) => { const x = toDate(a), y = b instanceof Date ? b : toDate(b); return x && y ? (y - x) / (365.25 * 864e5) : null; };
const dot = c => `<span class="sys-dot" role="img" aria-label="${c || 'unrated'} confidence" title="${c || 'unrated'} confidence" style="--co:${c === 'high' ? 'var(--sys-good)' : c === 'medium' ? 'var(--sys-warn)' : 'var(--sys-mute-2)'};margin-left:6px;vertical-align:1px"></span>`;
/* Research-note phrasing that must never reach a reader (bsp_firm timeline/history). */
const cleanEvent = s => String(s || '').replace(/\s+-\s+likely source of .*$/i, '');

/* ── Add-ons under BSP, from bsp_firm.items[].add_ons (pre-BSP acquisitions excluded) ── */
const firmItem = (firm, id) => (firm?.items || []).find(i => i.id === `bsp-${id}`);
const addOnsOf = (firm, id) => (firmItem(firm, id)?.add_ons || []).map(a => { const unid = /^Unidentified/i.test(a.name || ''); return { name: unid ? 'Unidentified 2nd add-on' : a.name, year: a.date ? String(a.date).slice(0, 4) : null, date: a.date, hq: a.hq, note: a.note, src: a.source_url, unid }; });

/* ── Smith + Howard (exited) reconstructed from bsp_firm.timeline + firm.stats (items[] holds only current holdings) ── */
function shExit(firm) {
  const tl = (firm?.timeline || []).filter(t => /Smith/i.test(t.company || ''));
  if (!tl.length) return null;
  const entry = tl.find(t => t.type === 'platform')?.date || '2022-11-15';
  const exits = tl.filter(t => t.type === 'exit').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const exit = exits[0]?.date || '2026-08-06';
  const named = tl.filter(t => t.type === 'add_on').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const m = /S\+H (\d+) of (\d+)/.exec(firm?.firm?.stats?.add_on_reconciliation || '');
  return { id: 'sh', company: 'Smith + Howard', short: 'S+H', status: 'exited', sector: 'Accounting & advisory · Atlanta', entry, exit, hold: yrsBetween(entry, exit), addons: m ? Number(m[2]) : named.length, named, src: exits[0]?.source_url || 'https://broadskypartners.com/broad-sky-partners-completes-sale-of-smith-howard-to-tpg/', note: '~100 → ~800 professionals, 11 offices, 9 add-ons, ~4x revenue; sold to TPG (TPG Growth), Aug 2026' };
}

/* ── NWS alert relevance. Only alerts touching portfolio operating counties count (statewide feeds are noise).
   PP: the 15 territory counties from Punctual Pros demand model nws_zone rows (UGC + SAME FIPS, same matcher as #/pp/weather).
   CET: node + Tier-1/2 counties — Worcester, Bristol (Taunton), Plymouth (NuWave, Norwell), Middlesex, Norfolk, Essex MA; Hartford County / Capitol region CT (Horton, Canton). ── */
const PP_TERR_FALLBACK = [['Lancaster', 'PA', '42071'], ['York', 'PA', '42133'], ['Dauphin', 'PA', '42043'], ['Cumberland', 'PA', '42041'], ['Berks', 'PA', '42011'], ['Lebanon', 'PA', '42075'], ['Franklin', 'PA', '42055'], ['Adams', 'PA', '42001'], ['Perry', 'PA', '42099'], ['Chester', 'PA', '42029'], ['Montgomery', 'PA', '42091'], ['Ocean', 'NJ', '34029'], ['Monmouth', 'NJ', '34025'], ['Atlantic', 'NJ', '34001'], ['Burlington', 'NJ', '34005']];
const CET_TERR = [['Worcester', 'MA', '25027'], ['Bristol', 'MA', '25005'], ['Plymouth', 'MA', '25023'], ['Middlesex', 'MA', '25017'], ['Norfolk', 'MA', '25021'], ['Essex', 'MA', '25009'], ['Hartford', 'CT', '09003'], ['Capitol', 'CT', '09110']];
function alertMatcher(ppModel) {
  const zones = (ppModel?.items || []).filter(i => i.component === 'nws_zone');
  const terr = [...(zones.length ? zones.map(z => ({ co: 'pp', county: z.county, state: z.state, fips: z.county_fips, ugcs: z.all_ugcs || [] })) : PP_TERR_FALLBACK.map(([county, state, fips]) => ({ co: 'pp', county, state, fips, ugcs: [] }))),
    ...CET_TERR.map(([county, state, fips]) => ({ co: 'cet', county, state, fips, ugcs: [] }))];
  const byUgc = new Map(), byFips = new Map();
  for (const t of terr) { for (const u of t.ugcs) byUgc.set(u, t); byFips.set('0' + t.fips, t); }
  return a => {
    const hit = new Map();
    for (const u of a.zones || []) if (byUgc.has(u)) { const t = byUgc.get(u); hit.set(`${t.co}|${t.county}`, t); }
    for (const f of a.fips || []) if (byFips.has(f)) { const t = byFips.get(f); hit.set(`${t.co}|${t.county}`, t); }
    if (!hit.size && !(a.fips || []).length) { const ad = String(a.areaDesc || '').toLowerCase(); for (const t of terr) if (t.state === a.state && new RegExp(`\\b${t.county.toLowerCase()}\\b`).test(ad)) hit.set(`${t.co}|${t.county}`, t); }
    return [...hit.values()];
  };
}

/* ── Value & exit readiness: picks from each company's filings meta.estimate_table (all est., confidence-rated) ── */
const EST = {
  cet: { ds: 'cet_filings', ev: /^Entry enterprise value/i, rev: [/^Pro forma (?:platform|portfolio company|company)/i, 0], ebitda: [/^Pro forma (?:platform|portfolio company|company)/i, 1], debt: /^Pro forma senior debt/i, mark: /co-invest mark/i },
  pp: { ds: 'pp_filings', ev: /^Entry enterprise value/i, rev: /pro forma total revenue/i, ebitda: /^Adjusted EBITDA/i, debt: /^Total senior debt/i },
  fl: { ds: 'frontline_filings', ev: /^Transaction enterprise value/i, rev: /^Revenue \(2025/i, ebitda: /^Adjusted EBITDA at close/i, debt: /^Senior debt at close/i, mark: /^Equity value change/i },
  ts: { ds: 'thomas_filings', ev: /^Entry enterprise value/i, rev: /^Current revenue/i, ebitda: /^Current EBITDA/i, debt: /^Total first-lien facility/i, lev: /^Current total leverage/i, mark: /^Sponsor common equity value/i },
  bpi: { ds: 'bpi_filings', ev: /^Entry enterprise value/i, rev: /^Net \(fee\) revenue FY2025/i, ebitda: /^Adj\. EBITDA FY2025/i, debt: /^Senior secured debt/i },
  fh: { ds: 'fairharbor_filings', ev: /^Entry enterprise value/i, rev: /^2025 net revenue/i, ebitda: /^2025 EBITDA/i, debt: /^Funded debt/i },
};
const ACTION = {
  cet: 'Run Horton + NuWave under one reporting line and report pro forma EBITDA quarterly; line up the next New England tuck-in (wastewater / solar O&M).',
  pp: 'Name and close the second add-on; use the PGIM delayed-draw term loan (~$1.4M unfunded) for adjacent-county franchise tuck-ins.',
  fl: 'Close the first BSP-era add-on (legal MSP or eBilling) and grow mid-size-firm accounts to build the earnings story.',
  ts: 'Extend or refinance the loan due in December 2027, and rebuild normalized EBITDA before any sale.',
  bpi: 'Integrate the six add-ons into one reporting line and benchmark against listed peers (PPHC ~8.4x EBITDA) ahead of a 2027–28 process.',
  fh: 'At 4.5 years with no add-ons, decide the exit route: wholesale-door and category growth to a sponsor, or a strategic sale.',
};
const pickEst = (tbl, spec) => {
  if (!spec || !tbl) return null; const [re, part] = Array.isArray(spec) ? spec : [spec, null];
  const e = tbl.find(x => re.test(x.metric || '')); if (!e) return null;
  let v = String(e.estimate ?? ''); if (part != null) v = (v.split(';')[part] || '').replace(/\b(revenue|EBITDA)\b/gi, '').trim();
  return { v, conf: e.confidence, metric: e.metric, basis: e.basis };
};
const maturityOf = d => { const txt = `${d?.meta?.financial_picture || ''} ${(d?.meta?.estimate_table || []).map(e => `${e.estimate} ${e.basis || ''}`).join(' ')}`; const m = /(?:matur\w*|due)\s+(?:on\s+|in\s+)?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i.exec(txt); return m ? mdy(m[1]) : null; };
const shortEst = s => { const raw = String(s || '').split(';')[0].trim(); const t = raw.replace(/\s*\([^)]*\)/g, '').trim(); s = t.length >= 4 ? t : raw; return s.length > 34 ? s.slice(0, 32).trim() + '…' : s; };
function exitFlag(hold, matMonths, status) {
  if (status === 'exited') return { t: `Exited · ${hold != null ? hold.toFixed(1) + ' yrs' : ''}`, st: '', k: 0 };
  if (hold >= 4 && matMonths != null && matMonths <= 24) return { t: 'In window · debt due ≤24 mo', st: 'bad', k: 4 };
  if (hold >= 4) return { t: 'In exit window (≥4 yrs)', st: 'warn', k: 3 };
  if (hold >= 3) return { t: 'Prepare (yr 3–4)', st: 'info', k: 2 };
  return { t: 'Build (<3 yrs)', st: 'good', k: 1 };
}
const EST_KEY = 'bsp_home_show_estimates';
const getShowEst = () => { try { return localStorage.getItem(EST_KEY) !== '0'; } catch { return true; } };
const setShowEst = v => { try { localStorage.setItem(EST_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ } };

function buildScoreboard(firm, fins) {
  const rows = COS.map(c => {
    const it = firmItem(firm, c.id); const fd = fins[c.id]; const tbl = fd?.meta?.estimate_table || null; const spec = EST[c.id];
    const entry = it?.entry_date || c.entry; const hold = yrsBetween(entry); const adds = addOnsOf(firm, c.id);
    const mat = maturityOf(fd); const matMonths = mat ? Math.round((toDate(mat) - new Date()) / (30.44 * 864e5)) : null;
    const e = { ev: pickEst(tbl, spec?.ev), rev: pickEst(tbl, spec?.rev), ebitda: pickEst(tbl, spec?.ebitda), debt: pickEst(tbl, spec?.debt), lev: pickEst(tbl, spec?.lev), mark: pickEst(tbl, spec?.mark) };
    const flag = exitFlag(hold, matMonths, 'held');
    return { id: c.id, co: c, company: c.name, short: c.short, status: 'held', entry, hold: hold != null ? Math.round(hold * 10) / 10 : null, addons: adds.length, addList: adds, mat, matMonths, e, fd, flag, window: flag.t, _wk: flag.k, action: ACTION[c.id],
      ev_est: e.ev?.v || '', rev_est: e.rev?.v || '', ebitda_est: e.ebitda?.v || '', debt_est: [e.debt?.v, mat ? `matures ${mat}` : '', e.lev?.v ? `leverage ${e.lev.v}` : ''].filter(Boolean).join(' · '), mark_est: e.mark?.v || '' };
  });
  const sh = shExit(firm);
  if (sh) rows.push({ id: 'sh', co: { id: 'sh', name: 'Smith + Howard', short: 'S+H', hex: CO_HEX.sh, color: CO_VAR('sh') }, company: 'Smith + Howard', short: 'S+H', status: 'exited', entry: sh.entry, exit: sh.exit, hold: Math.round(sh.hold * 10) / 10, addons: sh.addons, addList: sh.named.map(t => ({ name: t.event, year: String(t.date).slice(0, 4), src: t.source_url })), e: {}, flag: exitFlag(sh.hold, null, 'exited'), window: `Exited ${monYr(sh.exit)}`, _wk: 0, action: 'Template exit: sold to TPG Growth after 9 add-ons and ~4x revenue growth. Use as the benchmark for hold length and add-on cadence.', ev_est: '', rev_est: '', ebitda_est: '', debt_est: '', mark_est: '', sh });
  return rows;
}

async function overview(ctx) {
  const { el, ui, fmt, data, maps, live, esc, app, inspector } = ctx;
  const [firm, rfps, zips, maCet, maPp, maFlTs, pe, cetOpp, manifest, ppModel, alertsPA, alertsNJ, alertsMA, alertsCT, ...finList] = await Promise.all([
    data.research('bsp_firm'), data.load('cet_ne_rfps').catch(() => []), data.load('pp_zips').catch(() => []),
    data.research('ma_targets_cet'), data.research('ma_targets_pp'), data.research('ma_targets_fl_ts'), data.research('pe_landscape'), data.research('cet_opportunities'),
    fetch('data/manifest.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    data.research('pp_demand_model'),
    live.nwsAlerts('PA').catch(() => []), live.nwsAlerts('NJ').catch(() => []), live.nwsAlerts('MA').catch(() => []), live.nwsAlerts('CT').catch(() => []),
    ...COS.map(c => data.research(EST[c.id].ds)),
  ]);
  if (!el.isConnected) return;
  const fins = Object.fromEntries(COS.map((c, i) => [c.id, finList[i]]));
  // KPI definitions mirror the module views: CET overview (opportunities, bids due ≤60 d), M&A overview (targets screened), PE landscape (sponsors profiled)
  const opps = cetOpp?.items || [];
  const due = [...opps.filter(o => o.stage !== 'awarded').map(o => ({ ...o, _src: 'opp' })), ...rfps.map(r => ({ title: String(r.title || '').replace(/\s+/g, ' '), owner_or_agency: r.agency, state: r.state, due_date: mdy(r.due_date), _src: 'legacy' }))]
    .map(o => ({ ...o, _d: fmt.days(o.due_date) })).filter(o => o._d != null && o._d >= 0 && o._d <= 60).sort((a, b) => a._d - b._d);
  const targets = (maCet?.items?.length || 0) + (maPp?.items?.length || 0) + (maFlTs?.items?.length || 0);
  // NWS: de-duplicate across state feeds, then keep only alerts touching PP territory or CET operating counties
  const seen = new Set(), allAlerts = [];
  for (const a of [...alertsPA, ...alertsNJ, ...alertsMA, ...alertsCT]) { if (!seen.has(a.id)) { seen.add(a.id); allAlerts.push(a); } }
  const match = alertMatcher(ppModel);
  const alerts = allAlerts.map(a => ({ ...a, hits: match(a) })).filter(a => a.hits.length);
  const sevAlerts = alerts.filter(a => /Extreme|Severe/.test(a.severity));
  const stats = firm?.firm?.stats || { platforms: 7, add_ons: 23, exits: 1 };
  const homeFiles = DATA_FILES.filter(d => d.g === 'sales' && d.res);
  const homeCounties = new Set(homeFiles.flatMap(d => d.counties)).size;
  const board = buildScoreboard(firm, fins);
  const held = board.filter(r => r.status === 'held' && r.hold != null);
  const avgHold = held.length ? held.reduce((s, r) => s + r.hold, 0) / held.length : null;
  const inWindow = held.filter(r => r.hold >= 4).sort((a, b) => b.hold - a.hold);
  const sh = board.find(r => r.id === 'sh');
  const heldAddons = held.reduce((s, r) => s + r.addons, 0);

  el.innerHTML = ui.pageHead({
    title: 'Command Center',
    sub: `${COS.length} companies, ${fmt.num(stats.add_ons)} add-ons and one exit, Smith + Howard after ${sh ? sh.hold.toFixed(1) : '3.7'} years. ${inWindow.length ? `${inWindow.map(r => `${esc(r.short)} (${r.hold.toFixed(1)} yrs)`).join(' and ')} ${inWindow.length > 1 ? 'are' : 'is'} past that hold, so exit readiness comes first.` : `${fmt.num(due.length)} CET bids fall due within 60 days.`}`,
    actions: `<button type="button" class="${ui.btnCls('accent', '')}" id="play-brief">▶ Play the briefing (6 min 42 s)</button><a class="${ui.btnCls('secondary', '')}" href="#/ma">Acquisition engine</a><a class="${ui.btnCls('secondary', '')}" href="#/fin/portfolio">Financial picture</a>`,
  }) +
  ui.kpis([
    { label: 'Active companies', value: COS.length, sub: `${fmt.num(stats.add_ons)} add-ons · ${fmt.num(stats.exits)} exit (S+H)` },
    { label: 'Add-ons, current holdings', value: firm ? fmt.num(heldAddons) : '—', sub: firm ? held.filter(r => r.addons).map(r => `${r.short} ${r.addons}`).join(' · ') : 'not available' },
    { label: 'Avg hold, current holdings', value: avgHold != null ? `${avgHold.toFixed(1)} yrs` : '—', sub: inWindow.length ? `${inWindow.map(r => `${r.short} ${r.hold.toFixed(1)}`).join(' · ')} · S+H exited at ${sh ? sh.hold.toFixed(1) : '3.7'}` : '', color: inWindow.length ? 'var(--sys-warn)' : 'var(--sys-good)' },
    { label: 'CET opportunities tracked', value: cetOpp ? fmt.num(opps.length) : '—', sub: cetOpp ? `${fmt.num(due.length)} bids due ≤60 days${due[0] ? ` · next ${fmt.dateShort(due[0].due_date)}` : ''}` : 'not available', color: 'var(--co-cet)' },
    { label: 'M&A targets screened', value: targets ? fmt.num(targets) : '—', sub: `CET ${maCet?.items?.length || 0} · PP ${maPp?.items?.length || 0} · FL+TS ${maFlTs?.items?.length || 0}` },
    { label: 'PE sponsors profiled', value: pe ? fmt.num(pe.items.length) : '—', sub: pe ? `${fmt.num(pe.items.filter(f => f.threat_level === 'high').length)} high-threat` : 'not available' },
  ]) +
  `<div class="mt-12">${ui.panel({ title: 'Value & exit readiness', sub: 'Hold, add-ons, exit window and next action per company, then value, debt and marks. Click a row for the basis.', body: `<div class="sys-chips" style="padding:0 var(--pad) var(--sys-sp-4)"><button type="button" class="sys-chip" id="est-toggle" aria-pressed="true"></button></div><div id="vx-tbl"></div>`, flush: true, foot: `${ui.source('BSP firm profile (entry, add-ons) · company filings estimate tables (SEC Form D and ADV, BDC schedules, PPP loans, franchise disclosures)', '#/fin/portfolio', firm?.meta?.generated || 'Sept 2026')} · <span class="sys-muted">est. = triangulated from public filings, not company-reported · dot = confidence (green high · amber medium · grey low)</span>` })}</div>` +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Portfolio footprint', sub: `Headquarters, operating footprints and live NWS alerts touching operating counties (${fmt.num(alerts.length)} of ${fmt.num(allAlerts.length)} statewide alerts in PA · NJ · MA · CT)`, body: `<div class="map tall" id="home-map"></div>`, flush: true, foot: ui.source('Company filings & press; NWS alerts API', 'https://api.weather.gov', 'live') })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Companies', sub: 'Add-ons under BSP with year · click a company to open its module', body: `<div class="sys-grid cards" id="co-cards">${COS.map(c => { const adds = addOnsOf(firm, c.id); const it = firmItem(firm, c.id); return `<div class="sys-card sys-card--link card" data-co="${c.id}" data-id="${c.id}" role="link" tabindex="0" aria-label="Open ${esc(c.name)} module"><div class="sys-card-title t">${esc(c.name)}<span class="sys-num rk">since ${esc(monYr(it?.entry_date || c.entry))}</span></div><div class="sys-card-body s">${esc(c.sector)} · ${esc(c.hq)}</div><div class="sys-chips m">${coChip(c.id, firm ? `${adds.length} add-on${adds.length === 1 ? '' : 's'} under BSP` : 'add-ons pending')}${fmt.chip(c.footprint)}${adds.map(a => a.unid ? stChip(a.name, '') : coChip(c.id, `${a.name}${a.year ? ` · ${a.year}` : ''}`, a.note)).join('')}</div></div>`; }).join('')}</div>`, foot: firm ? ui.source('BSP firm profile: add-ons (press releases; BSP portfolio page)', 'https://broadskypartners.com/', firm.meta?.generated) : '' })}
    </div>
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Signals this week', sub: 'Bids due, weather alerts in operating counties, top-ranked add-ons and the latest sponsor deals', body: `<div id="signals">${ui.loading()}</div>`, foot: ui.source('CET opportunity radar · National Weather Service alerts (operating counties) · add-on target lists · Private-equity landscape', null, cetOpp?.meta?.generated || 'Sept 2026') })}
    ${ui.panel({ title: 'Value-creation levers by company', sub: 'Where this portal points each management team', body: `<div class="col gap-12">${COS.map(c => `<div class="row" style="align-items:flex-start">${coChip(c.id, c.short)}<div class="sys-card-body">${esc(c.lever)}</div></div>`).join('')}</div>` })}
    ${ui.panel({ title: 'BSP timeline', sub: 'Anchor acquisitions, add-ons and exits · newest first', body: `<div id="tl">${ui.loading()}</div>`, scroll: true, foot: firm ? ui.source('Press releases & BSP site', 'https://broadskypartners.com/news/', firm.meta?.generated) : '' })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Data sources', sub: `The main datasets behind this portal, including home sales in ${fmt.num(homeCounties)} portfolio counties. Click a row for details.`, body: `<div class="sys-actions" style="margin:0;padding:0 var(--pad) var(--sys-sp-4)"><button type="button" class="${ui.btnCls('secondary', 'sm')}" id="dc-refresh">↻ Recount records</button></div><div id="dc-tbl"></div>`, flush: true, foot: ui.source('Research files, county deed records and core tables', null, manifest?.generated || '2026-09-24') })}</div>`;

  // value & exit readiness scoreboard (estimates can be hidden before sharing outside BSP)
  const estCell = (r, k) => { const x = r.e?.[k]; if (r.status === 'exited') return '<span class="dim small">—</span>'; return x ? `<span class="small" title="${esc(`${x.metric}: ${x.v}`)}">${esc(shortEst(x.v))}</span>${dot(x.conf)}` : '<span class="dim small">n/a</span>'; };
  const baseCols = [
    { key: 'company', label: 'Company', width: '170px', wrap: true, fmt: (v, r) => `<div class="row">${coChip(r.id, r.short)}<span class="strong">${esc(v)}</span></div><div class="small dim mt-8">since ${esc(monYr(r.entry))}${r.exit ? ` · exit ${esc(monYr(r.exit))}` : ''}</div>` },
    { key: 'hold', label: 'Hold (yrs)', num: true, fmt: (v, r) => v == null ? '—' : r.status === 'held' && v >= 4 ? `<b>${v.toFixed(1)}</b>` : v.toFixed(1) },
    { key: 'addons', label: 'Add-ons', num: true, fmt: v => fmt.num(v) },
  ];
  const estCols = [
    { key: 'ev_est', label: 'Entry EV (est.)', fmt: (v, r) => estCell(r, 'ev') },
    { key: 'rev_est', label: 'Revenue · EBITDA (est.)', fmt: (v, r) => r.status === 'exited' ? '<span class="small">revenue ~4x over hold</span>' : `<div>${estCell(r, 'rev')}</div><div class="text-2">${estCell(r, 'ebitda')} <span class="dim small">EBITDA</span></div>` },
    { key: 'debt_est', label: 'Debt · maturity (est.)', wrap: true, width: '150px', fmt: (v, r) => r.status === 'exited' ? '<span class="dim small">—</span>' : `${estCell(r, 'debt')}${r.mat ? `<div class="mt-8">${r.matMonths != null && r.matMonths <= 24 ? stChip(`matures ${monYr(r.mat)} (${r.matMonths} mo)`, 'bad') : `<span class="small text-2">matures ${esc(monYr(r.mat))}${r.matMonths != null ? ` (${r.matMonths} mo)` : ''}</span>`}</div>` : ''}${r.e?.lev ? `<div class="small text-2">leverage ${esc(r.e.lev.v)}${dot(r.e.lev.conf)}</div>` : ''}` },
    { key: 'mark_est', label: 'Public mark signal', wrap: true, fmt: (v, r) => r.e?.mark ? `${estCell(r, 'mark')}<div class="small dim">${esc(r.e.mark.metric.replace(/\s*\(.*$/, '').slice(0, 34))}</div>` : '<span class="dim small">—</span>' },
  ];
  // exit window and the next action sit right after the company columns, so the action is never the column a narrow
  // console (inspector open, laptop width) scrolls out of view; the estimate columns follow and scroll instead
  const tailCols = [
    { key: '_wk', label: 'Exit window', wrap: true, width: '150px', fmt: (v, r) => stChip(r.window, r.flag.st) },
    { key: 'action', label: 'Next action', wrap: true, fmt: v => `<div class="small text-2" style="min-width:200px;max-width:34ch;white-space:normal">${esc(v)}</div>` },
  ];
  const vxEl = el.querySelector('#vx-tbl'), tgl = el.querySelector('#est-toggle');
  let showEst = getShowEst(), vx = null;
  const drawVx = () => {
    tgl.textContent = showEst ? 'Hide estimates' : 'Show estimates'; tgl.setAttribute('aria-pressed', String(showEst));
    vx = ui.table(vxEl, { columns: [...baseCols, ...tailCols, ...(showEst ? estCols : [])], rows: board, pageSize: 10, sortKey: '_wk', exportName: showEst ? 'bsp_value_exit_readiness_EST_bsp_only' : 'bsp_value_exit_readiness', onRow: openVx });
  };
  const openVx = r => {
    if (r.status === 'exited') return inspector.open({ title: 'Smith + Howard', sub: 'Exited · template for the current portfolio', color: CO_VAR('sh'), sections: [
      { label: 'Outcome', html: ui.kv({ Entry: esc(monYr(r.entry)), Exit: esc(monYr(r.exit)), Hold: `${r.hold.toFixed(1)} yrs`, 'Add-ons': `${r.addons} (${r.addList.length} identified by name)`, Buyer: 'TPG (TPG Growth)', Result: esc(r.sh.note) }) },
      { label: 'Add-ons identified', html: ui.timeline(r.addList.map(a => ({ date: a.year, color: CO_VAR('sh'), html: `${esc(a.name)}${a.src ? ` <a class="dim" href="${esc(a.src)}" target="_blank" rel="noopener">↗</a>` : ''}` }))) },
      { label: 'Use as benchmark', html: `<div class="small text-2">${esc(r.action)}</div>` },
    ], actions: [{ label: 'BSP sale release ↗', href: r.sh.src }, { label: 'Firm profile', href: '#/home/firm' }] });
    const tbl = r.fd?.meta?.estimate_table || [];
    inspector.open({ title: esc(r.company), sub: `Held since ${esc(monYr(r.entry))} · ${r.hold?.toFixed(1)} yrs · ${esc(r.window)}`, color: CO_VAR(r.id), sections: [
      { label: 'Recommended next action', html: `<div class="small">${esc(r.action)}</div>` },
      { label: 'Add-ons under BSP', html: r.addList.length ? ui.timeline(r.addList.map(a => ({ date: a.year || 'n/d', color: CO_VAR(r.id), html: `${esc(a.name)}${a.hq ? ` <span class="dim">· ${esc(a.hq)}</span>` : ''}${a.src ? ` <a class="dim" href="${esc(a.src)}" target="_blank" rel="noopener">↗</a>` : ''}` }))) : '<div class="small dim">None announced under BSP</div>' },
      showEst && tbl.length ? { label: `Estimates · ${tbl.length}`, html: `<div class="col gap-8">${tbl.map(e => `<div><div class="small"><b>${esc(e.metric)}</b>${dot(e.confidence)}</div><div class="small">${esc(e.estimate)}</div>${e.basis ? `<div class="small dim">${esc(e.basis)}</div>` : ''}</div>`).join('')}</div>` } : null,
      !showEst ? { label: 'Estimates', html: '<div class="small dim">Hidden. Choose Show estimates above the table to see them.</div>' } : null,
      !r.fd ? { label: 'Estimates', html: ui.note(`<b>${esc(dataset(EST[r.id].ds))}</b> is not available yet`, 'warn') } : null,
    ].filter(Boolean), actions: [{ label: 'Financial picture', href: `#/fin/portfolio` }, { label: `Open ${r.short} module`, href: `#/${r.id}` }] });
  };
  tgl.onclick = () => { showEst = !showEst; setShowEst(showEst); drawVx(); };
  drawVx();

  // map
  const map = maps.create(el.querySelector('#home-map'), { center: [40.3, -76.0], zoom: 6 });
  // Leaflet paints SVG attributes, which cannot read var(): resolve the system tokens once for this theme
  const css = getComputedStyle(document.documentElement);
  const tok = (n, fb) => css.getPropertyValue(n).trim() || fb;
  const mix = (a, b, t) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a; const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v * (1 - t) + B[i] * t).toString(16).padStart(2, '0')).join(''); };
  const MC = { cet: tok('--co-cet', CO_HEX.cet), pp: tok('--co-pp', CO_HEX.pp), bad: tok('--sys-bad', '#c62828'), warn: tok('--sys-warn', '#b45309'), mute: tok('--sys-mute-2', '#646b77'), surface: tok('--sys-surface', '#ffffff') };
  MC.cet2 = mix(MC.cet, MC.surface, .45);
  for (const c of COS) maps.marker(map, c.lat, c.lon, { color: tok(`--co-${c.id}`, c.hex), label: c.short, popup: `<b>${esc(c.name)}</b><br>${esc(c.hq)}<br><span class="muted">${esc(c.footprint)}</span><br><a href="#/${c.id}">Open module →</a>` });
  el.querySelectorAll('#co-cards .card').forEach(c => { c.onclick = () => app.go(c.dataset.id); c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.go(c.dataset.id); } }; });
  el.querySelector('#play-brief').onclick = () => window.BSP.Tour.start(0);

  // signals — all from real fields: cet_opportunities.due_date, territory-filtered NWS alerts, ma_targets meta.ranked_top_10 / ranked_top_8, pe_landscape items[].deals_2025_2026
  const sig = [];
  due.slice(0, 3).forEach(o => sig.push({ co: 'cet', t: `CET bid due ${fmt.dateShort(o.due_date)} (${o._d}d)`, s: `${o.owner_or_agency || ''}${o.state ? ` (${o.state})` : ''} — ${o.title || ''}`, h: '#/cet/opportunities' }));
  const sigAlerts = (sevAlerts.length ? sevAlerts : alerts).slice(0, 2);
  if (sigAlerts.length) sigAlerts.forEach(a => { const cos = [...new Set(a.hits.map(h => h.co))]; sig.push({ st: /Extreme|Severe/.test(a.severity) ? 'bad' : 'warn', t: `${a.event} · ${cos.map(c => CO_SHORT[c]).join('+')}`, s: `${a.hits.map(h => `${h.county} ${h.state}`).join(', ')} — ${a.headline || a.areaDesc || ''}`, h: cos.includes('pp') ? '#/pp/weather' : '#/cet/overview' }); });
  else sig.push({ st: 'good', t: 'Weather · clear', s: `No active NWS alerts touch PP's 15 territory counties or CET's operating counties (${fmt.num(allAlerts.length)} statewide alerts in PA/NJ/MA/CT filtered out)`, h: '#/pp/weather' });
  const ranked = [['PP', 'pp', maPp?.meta?.ranked_top_10], ['CET', 'cet', maCet?.meta?.ranked_top_10], ['FL', 'fl', maFlTs?.meta?.frontline?.ranked_top_8], ['TS', 'ts', maFlTs?.meta?.thomas_scientific?.ranked_top_8]];
  ranked.forEach(([lab, p, list]) => { const t = (list || [])[0]; if (t && t.company) sig.push({ co: p, t: `${lab} add-on #${t.rank ?? 1} · fit ${t.fit_score ?? '—'}`, s: `${t.company}${t.why ? ` — ${t.why}` : ''}`, h: `#/ma/pipeline?platform=${p}&q=${encodeURIComponent(String(t.company).split(/[,(/]/)[0].trim())}` }); });
  const deals = (pe?.items || []).flatMap(f => (f.deals_2025_2026 || []).map(d => ({ ...d, firm: f.firm }))).filter(d => d.date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  deals.slice(0, 2).forEach(d => sig.push({ st: '', t: `PE deal · ${fmt.dateShort(d.date)}`, s: `${d.firm} → ${d.company}${d.type ? ` (${({ platform: 'anchor', add_on: 'add-on', exit: 'exit' })[d.type] || String(d.type).replace(/_/g, '-')})` : ''}${d.sector ? ` · ${d.sector}` : ''}`, h: '#/pe/deals' }));
  el.querySelector('#signals').innerHTML = sig.length ? `<div class="col gap-8">${sig.slice(0, 11).map(s => `<div class="row"><a class="sys-chip${s.co ? ' sys-chip--soft' : s.st ? ` sys-chip--${s.st}` : ''}" ${s.co ? coAttr(s.co) : ''} style="flex-shrink:0" href="${esc(s.h)}">${esc(s.t)}</a><span class="small text-2 ellipsis" title="${esc(s.s)}">${esc(s.s)}</span></div>`).join('')}</div>` : ui.empty('No signals');

  // timeline — bsp_firm.timeline, newest first, coloured by company
  const tl = (firm?.timeline || []).filter(t => t.date).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  el.querySelector('#tl').innerHTML = tl.length ? ui.timeline(tl.slice(0, 40).map(t => ({ date: t.date, color: tlColor(t.company), html: `${t.company ? `<b>${esc(t.company)}</b> · ` : ''}${esc(cleanEvent(t.event))}${t.source_url ? ` <a class="dim" href="${esc(t.source_url)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}` }))) : ui.note('The BSP timeline is not available yet.', 'warn');


  // the company chip already names the company, so the label drops a leading "CET " / "BPI " (sentence case kept)
  const DS_CO = /^(CET|PP|BPI|FL|TS|FH|Punctual Pros|Thomas Scientific|Frontline|Fair Harbor|Bully Pulpit International)\s+(?=\S)/;
  const dsLabel = (v, co) => { const l = String(dataset(v)); if (!CO_SHORT[co] || co === 'bsp' || !DS_CO.test(l)) return l; const t = l.replace(DS_CO, ''); return /^[A-Z]{2}/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1); };
  // data coverage — legacy rows from manifest.json, research/sales from the embedded inventory, live where this page already holds the data
  const loaded = { bsp_firm: firm, ma_targets_cet: maCet, ma_targets_pp: maPp, ma_targets_fl_ts: maFlTs, pe_landscape: pe, cet_opportunities: cetOpp, pp_demand_model: ppModel, ...Object.fromEntries(COS.map(c => [EST[c.id].ds, fins[c.id]])) };
  const rows = [
    ...(manifest?.datasets || []).map(d => { const n = String(d.file).replace(/\.json$/, ''); return { id: `legacy/${n}`, g: 'legacy', n, co: LEGACY_CO[n] || 'bsp', rows: d.rows, res: n === 'pp_sales_90d' ? d.rows : 0, counties: 0, gen: manifest.generated, basis: 'live (manifest)', src: d.source || '' }; }),
    ...DATA_FILES.map(d => { const L = loaded[d.n]; return { id: `${d.g}/${d.n}`, g: d.g, n: d.n, co: d.co, rows: L ? (L.items || []).length : d.rows, res: d.g === 'sales' ? d.res : 0, counties: d.counties ? d.counties.length : 0, countyList: d.counties || [], gen: L?.meta?.generated ? String(L.meta.generated).slice(0, 10) : d.gen, basis: L ? 'live' : 'snapshot', src: '' }; }),
  ];
  const cols = [
    { key: 'n', label: 'Dataset', fmt: (v, r) => `<div class="row">${coChip(r.co, CO_SHORT[r.co] || 'BSP')}<span>${esc(dsLabel(v, r.co))}</span></div>` },
    { key: 'g', label: 'Type', fmt: v => `<span class="dim small">${esc(GROUP_TXT[v] || v)}</span>` },
    { key: 'rows', label: 'Records', num: true, fmt: v => v == null ? '—' : fmt.num(v) },
    { key: 'res', label: 'Home sales', num: true, fmt: v => v ? fmt.num(v) : '<span class="dim">—</span>' },
    { key: 'counties', label: 'Counties', num: true, title: r => (r.countyList || []).join(', '), fmt: v => v ? fmt.num(v) : '<span class="dim">—</span>' },
    { key: 'gen', label: 'Updated', num: true, fmt: v => `<span class="small">${fmt.date(v)}</span>` },
  ];
  const openDs = r => ctx.inspector.open({ title: esc(dataset(r.n)), sub: `${esc(r.g === 'sales' ? 'Property sales' : r.g === 'research' ? 'Research' : 'Core')} data · ${esc(CO_SHORT[r.co] || 'BSP')}`, color: CO_VAR(r.co), sections: [
    { label: 'What it holds', html: ui.kv({ Dataset: esc(dataset(r.n)), Records: r.rows == null ? '—' : fmt.num(r.rows), 'Home sales': r.res ? fmt.num(r.res) : null, Updated: fmt.date(r.gen) }) },
    r.countyList?.length ? { label: 'Counties covered', html: `<div class="small text-2">${r.countyList.map(esc).join(' · ')}</div>` } : null,
    r.src ? { label: 'Source', html: `<div class="small text-2">${esc(r.src)}</div>` } : null,
    { label: 'How it stays current', html: `<div class="small text-2">${r.g === 'sales' ? 'Updated each quarter from the county recorder. The newest sales lag the recording office by a few weeks.' : 'Updated when the research is refreshed. The date shows the latest refresh.'}</div>` },
  ].filter(Boolean) });
  const dt = ui.table(el.querySelector('#dc-tbl'), { columns: cols, rows, pageSize: 12, sortKey: 'res', exportName: 'bsp_data_coverage', onRow: openDs });
  el.querySelector('#dc-refresh').onclick = async ev => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Counting…';
    const out = await Promise.all(rows.map(async r => {
      if (r.g === 'legacy') return r;
      try { const d = await data.load(`${r.g}/${r.n}`); const items = Array.isArray(d) ? d : (d.items || []); const res = r.g === 'sales' ? items.filter(x => x.use_type === 'residential').length : 0; const cs = r.g === 'sales' ? [...new Set(items.filter(x => x.county && (res ? x.use_type === 'residential' : true)).map(x => `${x.county} ${x.state}`))].sort() : null; return { ...r, rows: items.length, res, counties: cs ? cs.length : 0, countyList: cs || [], gen: d.meta?.generated ? String(d.meta.generated).slice(0, 10) : r.gen, basis: 'live' }; }
      catch { return { ...r, basis: 'missing' }; }
    }));
    if (!el.isConnected) return;
    dt.update(out); b.textContent = '✓ Recounted'; ui.toast(`Recounted ${out.filter(r => r.basis === 'live').length} datasets`);
  };

  // territory layers + alert polygons (after the synchronous UI is wired)
  const cnt = await data.load('cet_ne_counties').catch(() => []);
  if (!el.isConnected) { map.remove(); return; }
  maps.points(map, cnt.filter(c => c.centroid_lat), { latKey: 'centroid_lat', lonKey: 'centroid_lng', color: r => r.cet_fit_tier === 'Tier 1' ? MC.cet : r.cet_fit_tier === 'Tier 2' ? MC.cet2 : MC.mute, radius: r => r.cet_fit_tier === 'Tier 1' ? 7 : 5, cluster: false, opacity: .55, popup: r => `<b>${esc(r.county_name)}, ${esc(r.state)}</b><br>CET fit ${esc(r.cet_fit_score)} · ${esc(r.cet_fit_tier)}<br><span class="muted">${esc(r.notes || '')}</span>` });
  maps.points(map, zips.filter(z => z.service_territory_flag === 1), { color: MC.pp, radius: 2.5, cluster: false, opacity: .5, weight: 0 });
  for (const a of alerts) if (a.geometry) L.geoJSON(a.geometry, { style: { color: /Extreme|Severe/.test(a.severity) ? MC.bad : MC.warn, weight: 1, fillOpacity: .12 } }).bindPopup(`<b>${esc(a.event)}</b><br>${esc(a.hits.map(h => `${h.county} ${h.state}`).join(', '))}<br><span class="muted">${esc(a.headline || '')}</span>`).addTo(map);
  maps.legend(map, [{ color: MC.pp, label: 'Punctual Pros core zips' }, { color: MC.cet, label: 'CET Tier-1 counties' }, { color: MC.cet2, label: 'CET Tier-2 counties' }, { color: MC.warn, label: 'NWS alert in operating county (moderate)' }, { color: MC.bad, label: 'NWS alert in operating county (severe)' }], 'Layers');
  app.index([...COS.map(c => ({ label: c.name, sub: c.sector, href: `#/${c.id}`, kind: 'Company', color: c.hex })), ...COS.flatMap(c => addOnsOf(firm, c.id).filter(a => !a.unid).map(a => ({ label: a.name, sub: `${c.short} add-on${a.year ? ` · ${a.year}` : ''}`, href: `#/${c.id}`, kind: 'Add-on', color: c.hex })))]);
  return () => map.remove();
}

async function firmView(ctx) {
  const { el, ui, fmt, data, esc, inspector, app } = ctx;
  const firm = await data.research('bsp_firm');
  if (!el.isConnected) return;
  if (!firm) { el.innerHTML = ui.pageHead({ title: 'Firm profile' }) + ui.note('Research dataset not yet available: <b>BSP firm profile</b>', 'warn'); return; }
  const f = firm.firm || {};
  const stats = f.stats || { platforms: 7, add_ons: 23, exits: 1, current_holdings: 6 };
  const cap = f.capital_raised_sec_form_d || null;
  const fund = cap?.broad_sky_partners_lp_total_sold_usd || null;
  const spvs = (cap?.deal_vehicles || []).filter(v => /^BSP-/.test(v.vehicle || ''));
  const spvSum = spvs.reduce((s, v) => s + (v.sold_usd || 0), 0);
  const flSpv = spvs.find(v => v.vehicle === 'BSP-FL LP'), flCo = spvs.find(v => v.vehicle === 'BSP-FL Co-Invest, LLC');
  const sh = shExit(firm);
  const prg = f.prg && typeof f.prg === 'object' ? f.prg : (typeof f.prg === 'string' ? { description: f.prg, members: [] } : null);
  // History: research notes are rewritten as reader-facing facts (the unverified '$137M Fund I' entry is the Frontline deal vehicle)
  const hist = (Array.isArray(f.history) ? f.history : []).map(h => /^Task brief/i.test(h.event || '')
    ? { ...h, verified: true, event: `Frontline deal vehicle BSP-FL LP files Form D: ${flSpv ? fmt.money(flSpv.sold_usd) : '$137M'} sold${flCo ? `, plus ${fmt.money(flCo.sold_usd)} through BSP-FL Co-Invest` : ''}. This is deal-level capital, not a fund close; the main fund (Fund I) reports ${fund ? fmt.money(fund) : '$335M'} sold.` }
    : { ...h, event: cleanEvent(h.event) });
  const yr = s => String(s || '').slice(0, 4);

  el.innerHTML = ui.pageHead({
    title: 'Firm profile',
    sub: `Fund I is ${fund ? fmt.money(fund) : '—'} from ${cap?.investors ?? '—'} investors. ${spvs.length} single-deal vehicles add ${fmt.money(spvSum)} of co-investment, so investors back larger checks. ${fmt.num(stats.platforms)} companies, ${fmt.num(stats.add_ons)} add-ons, one exit.`,
    chips: `${fmt.chip(`Relaunched ${f.relaunched ? monYr(f.relaunched) : 'Jun 2021'}`, 'var(--sys-brand)')}${fund ? fmt.chip(`Fund I ${fmt.money(fund)}`) : ''}${spvSum ? fmt.chip(`Deal vehicles ${fmt.money(spvSum)}`) : ''}${fmt.chip(`${stats.platforms} companies · ${stats.add_ons} add-ons`)}${fmt.chip(`Exit: S+H, Aug 2026`)}`,
    actions: `<a class="${ui.btnCls('secondary', '')}" href="#/fin/portfolio">Portfolio financial picture</a><a class="${ui.btnCls('secondary', '')}" href="#/home/overview">Exit readiness</a>`,
  }) +
  ui.kpis([
    { label: 'Fund I sold (Form D)', value: fund ? fmt.money(fund) : '—', sub: `${cap?.investors ?? '—'} investors · ${cap?.as_of ? esc(monYr(cap.as_of)) : ''}` },
    { label: 'Deal-vehicle capital', value: spvSum ? fmt.money(spvSum) : '—', sub: `${spvs.length} vehicles · not additive to Fund I` },
    { label: 'Companies', value: fmt.num(stats.platforms), sub: `${fmt.num(stats.current_holdings ?? 6)} held · ${fmt.num(stats.exits)} exited` },
    { label: 'Add-ons', value: fmt.num(stats.add_ons), sub: sh ? `${sh.addons} at S+H · ${stats.add_ons - sh.addons} in current holdings` : '' },
    { label: 'Investment team', value: fmt.num((f.team || []).length), sub: `${fmt.num(prg?.members?.length || 0)} in the Portfolio Resource Group` },
  ]) +
  `<div class="mt-12">${ui.panel({ title: 'Companies', sub: 'Every BSP portfolio company including the exit · click a row for thesis, add-ons and sources', body: '<div id="pf-tbl"></div>', flush: true, foot: ui.source('BSP firm profile: current holdings and timeline (Smith + Howard)', 'https://broadskypartners.com/', firm.meta?.generated) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'History', sub: 'Founding, Carlyle years, relaunch, fund formation and first exit', scroll: true, body: hist.length ? ui.timeline(hist.map(h => ({ date: h.date, color: h.verified === false ? 'var(--sys-warn)' : 'var(--sys-brand)', html: `${esc(h.event)}${h.verified === false ? ` ${stChip('unverified', 'warn')}` : ''}${h.source_url ? ` <a class="dim" href="${esc(h.source_url)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}` }))) : ui.note('Firm history pending in BSP firm profile', 'warn'), foot: ui.source('BSP team pages, press releases, SEC EDGAR', 'https://broadskypartners.com/team/', f.retrieved) })}
    ${ui.panel({ title: 'Team & Portfolio Resource Group', scroll: true, body: `${(f.team || []).length ? `<div class="col gap-8">${f.team.map(t => `<div><div class="row"><span class="strong">${esc(t.name)}</span><span class="muted small">${esc(t.title || '')}</span>${t.source_url ? `<a class="dim small" href="${esc(t.source_url)}" target="_blank" rel="noopener" aria-label="Bio">↗</a>` : ''}</div>${t.prior ? `<div class="small dim">${esc(t.prior)}</div>` : ''}</div>`).join('')}</div>` : ui.note('Team list pending', 'warn')}
      ${prg ? `<h4 class="sys-card-label mt-16">Portfolio Resource Group</h4><div class="small text-2">${esc(prg.description || '')}</div><div class="col gap-8 mt-8">${(prg.members || []).map(m => `<div><div class="row"><span class="strong">${esc(m.name)}</span><span class="muted small">${esc(m.title || '')}</span>${m.source_url ? `<a class="dim small" href="${esc(m.source_url)}" target="_blank" rel="noopener" aria-label="Bio">↗</a>` : ''}</div>${m.prior ? `<div class="small dim">${esc(m.prior)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${(f.executive_board || []).length ? `<h4 class="sys-card-label mt-16">Executive Board · ${f.executive_board.length}</h4><div class="sys-chips mt-8">${f.executive_board.map(b => `<span class="sys-chip" title="${esc(b.prior || '')}">${esc(b.name)}</span>`).join('')}</div>` : ''}`, foot: ui.source('broadskypartners.com/team and /strategy', prg?.source_url || 'https://broadskypartners.com/team/', f.retrieved) })}
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Capital raised (SEC Form D)', sub: 'Main fund plus deal-by-deal vehicles · amounts sold per latest filing', body: '<div id="cap-tbl"></div>', flush: true, foot: ui.source('SEC EDGAR Form D', cap?.source_url || 'https://www.sec.gov/', cap?.as_of) })}
    ${ui.panel({ title: 'Strategy & sources', body: `${f.strategy ? `<div class="small text-2">${esc(f.strategy)}</div>${(f.sectors || []).length ? `<div class="sys-chips mt-8">${f.sectors.map(x => fmt.chip(x)).join('')}</div>` : ''}<h4 class="sys-card-label mt-16">Sources</h4>` : ''}<div class="col gap-4 small">${(f.sources || []).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(srcLabel(s))}</a>`).join('') || '—'}</div>` })}
  </div>`;

  // platforms table — current holdings from items[], Smith + Howard from the timeline
  const rows = (firm.items || []).map(p => { const id = String(p.id || '').replace(/^bsp-/, ''); const co = COS.find(c => c.id === id); return { id, p, company: p.company, sector: p.sector, entry: p.entry_date, hold: Math.round((yrsBetween(p.entry_date) || 0) * 10) / 10, status: p.status || 'held', addons: (p.add_ons || []).length, names: addOnsOf(firm, id).map(a => `${a.name}${a.year ? ` (${a.year})` : ''}`).join('; '), hex: CO_VAR(id) }; });
  if (sh) rows.push({ id: 'sh', company: sh.company, sector: 'Professional services - Accounting, tax & advisory (Atlanta)', entry: sh.entry, exit: sh.exit, hold: Math.round(sh.hold * 10) / 10, status: 'exited', addons: sh.addons, names: `${sh.named.map(t => cleanEvent(t.event).replace(/^Smith \+ Howard\s+(acquires|merges with|signs agreement to acquire)\s+/i, '').replace(/^(.*?) joins Smith \+ Howard.*$/i, '$1')).join('; ')} (+${Math.max(0, sh.addons - sh.named.length)} unidentified)`, hex: CO_VAR('sh'), sh });
  ui.table(el.querySelector('#pf-tbl'), { rows, pageSize: 10, sortKey: 'entry', sortDir: 1, exportName: 'bsp_companies', onRow: r => openPlatform(r), columns: [
    { key: 'company', label: 'Company', wrap: true, fmt: (v, r) => `<div class="row strong"><span class="sys-dot" ${coAttr(r.id)} aria-hidden="true"></span>${esc(v)}</div><div class="small dim">${esc(r.sector || '')}</div>` },
    { key: 'entry', label: 'Entry', num: true, fmt: (v, r) => `${esc(monYr(v))}${r.exit ? `<div class="small dim">exit ${esc(monYr(r.exit))}</div>` : ''}` },
    { key: 'hold', label: 'Hold (yrs)', num: true, fmt: v => v == null ? '—' : v.toFixed(1) },
    { key: 'status', label: 'Status', fmt: v => v === 'exited' ? stChip('Exited', '') : stChip('Held', 'good') },
    { key: 'addons', label: 'Add-ons', num: true, fmt: v => `<b>${fmt.num(v)}</b>` },
    { key: 'names', label: 'Add-ons named', wrap: true, fmt: v => `<span class="small text-2">${esc(v || '—')}</span>` },
  ] });
  const openPlatform = r => {
    if (r.sh) return inspector.open({ title: 'Smith + Howard', sub: 'Exited Aug 2026 · TPG Growth', color: CO_VAR('sh'), sections: [
      { label: 'Outcome', html: ui.kv({ Entry: esc(monYr(r.entry)), Exit: esc(monYr(r.exit)), Hold: `${r.hold.toFixed(1)} yrs`, 'Add-ons': `${r.addons}`, Result: esc(r.sh.note) }) },
      { label: 'Timeline', html: ui.timeline(r.sh.named.map(t => ({ date: t.date, color: CO_VAR('sh'), html: `${esc(cleanEvent(t.event))} <a class="dim" href="${esc(t.source_url)}" target="_blank" rel="noopener">↗</a>` }))) },
    ], actions: [{ label: 'BSP sale release ↗', href: r.sh.src }] });
    const p = r.p;
    inspector.open({ title: esc(p.company), sub: `${esc(p.sector || '')}`, color: r.hex, sections: [
      { label: 'At a glance', html: ui.kv({ HQ: esc([p.hq_city, p.state].filter(Boolean).join(', ')), Entry: esc(monYr(p.entry_date)), Hold: `${r.hold.toFixed(1)} yrs`, Seller: esc(p.entry_source || ''), CEO: esc(p.ceo || ''), Employees: esc(p.employees_est || '') }) },
      p.thesis ? { label: 'Thesis', html: `<div class="small text-2">${esc(p.thesis)}</div>` } : null,
      { label: `Add-ons under BSP · ${r.addons}`, html: r.addons ? ui.timeline(addOnsOf(firm, r.id).map(a => ({ date: a.year || 'n/d', color: r.hex, html: `${esc(a.name)}${a.hq ? ` <span class="dim">· ${esc(a.hq)}</span>` : ''}${a.src ? ` <a class="dim" href="${esc(a.src)}" target="_blank" rel="noopener">↗</a>` : ''}` }))) : '<div class="small dim">None announced under BSP</div>' },
      (p.sources || []).length ? { label: 'Sources', html: `<div class="col gap-4 small">${p.sources.slice(0, 6).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener" class="ellipsis">${esc(srcLabel(s))}</a>`).join('')}</div>` } : null,
      ACTION[r.id] ? { label: 'Next action', html: `<div class="small">${esc(ACTION[r.id])}</div>` } : null,
    ].filter(Boolean), actions: [{ label: 'Open module', href: `#/${r.id}` }] });
  };
  // capital table
  const capRows = [...(fund ? [{ id: 'fund', vehicle: 'Broad Sky Partners, LP (Fund I)', company: 'Commingled fund', sold: fund, date: cap.as_of, url: cap.source_url, note: `${cap.investors} investors` }] : []),
    ...(cap?.deal_vehicles || []).map((v, i) => ({ id: `v${i}`, vehicle: v.vehicle, company: v.company, sold: v.sold_usd, date: v.first_sale || v.filed, url: v.source_url, note: v.note || (v.offering_usd ? `of ${fmt.money(v.offering_usd)} offered` : '') }))];
  ui.table(el.querySelector('#cap-tbl'), { rows: capRows, pageSize: 10, sortKey: 'sold', exportName: 'bsp_form_d_vehicles', onRow: r => r.url && window.open(r.url, '_blank', 'noopener'), columns: [
    { key: 'vehicle', label: 'Vehicle', wrap: true, fmt: (v, r) => `<span class="small strong">${esc(v)}</span><div class="small dim">${esc(r.company)}</div>` },
    { key: 'sold', label: 'Sold', num: true, fmt: v => fmt.money(v) },
    { key: 'date', label: 'First sale / filed', num: true, fmt: v => `<span class="small">${fmt.date(v)}</span>` },
    { key: 'note', label: 'Note', wrap: true, fmt: v => `<span class="small text-2">${esc(String(v || '').slice(0, 90))}</span>` },
  ] });
  app.index((f.team || []).map(t => ({ label: t.name, sub: `BSP · ${t.title || ''}`, href: '#/home/firm', kind: 'Person', color: CO_HEX.bsp })));
}

export default {
  id: 'home', name: 'Command Center', tag: 'BSP', color: 'var(--sys-brand)', group: 'Command',
  tagline: 'Portfolio-wide situational awareness',
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'firm', name: 'BSP profile', icon: '◈', render: firmView },
  ],
  tour: [
    { order: 100, hash: '#/home/overview', caption: '<b>BSP Desk.</b> Six companies. Every number is tied to a decision.', narration: 'This is BSP Desk. Six companies, and every number is tied to a decision.', duration: 7000 },
    { order: 105, hash: '#/home/overview', caption: '<b>Exit readiness.</b> Hold, add-ons, value, debt and exit window per company, against the Smith + Howard exit.', narration: 'The scoreboard shows hold, add-ons, value, debt and exit window, against the Smith and Howard exit.', duration: 9000 },
    { order: 110, hash: '#/home/overview', caption: '<b>This week.</b> Bid deadlines, weather alerts, top add-ons and rival deals. <b>Data sources</b> lists every dataset.', narration: 'Signals show bid deadlines, weather alerts, top add-ons and rival deals. Data sources lists every dataset.', duration: 9000 },
    { order: 120, hash: '#/home/firm', caption: '<b>BSP.</b> A $335M Fund I, 7 companies, 23 add-ons and one exit: Smith + Howard, sold August 2026.', narration: 'The firm: a three hundred thirty-five million dollar fund, seven companies, twenty-three add-ons, one exit.', duration: 7000 },
  ],
};
