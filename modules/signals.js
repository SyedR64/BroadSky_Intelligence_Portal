/* Local signals: the market, cost, labor, funding, policy and calendar forces that move each portfolio company's sales
   and margins. Weather is one force among many. Three views:
     overview  "What moves sales"  lead + KPIs, force × company matrix, per-company factor table, action list
     levers    "Sales levers"      every sized lever (est., assumptions shown), ranked by today's effect
     readings  "Live readings"     the public series behind each reading, with source and as-of date
   Readings come from the nightly snapshots in data/live/ written by scripts/refresh_live.py (fred_signals,
   housing_counties, nih_awards, federal_buying, policy_activity, census_permits, echo_npdes_majors; NWS alerts are
   read live with the snapshot as fallback) and from the repo's own tables (national_counties, company filings
   estimate tables, fl_lawfirms, ma_targets_pp, cet_opportunities). Every estimate is labelled est. and shows its
   assumption; a missing snapshot leaves its factors as "not available" instead of failing the view. */
import * as Copy from './copy.js?v=20261009181341';

const injectCss = () => { if (document.getElementById('css-signals')) return; const l = document.createElement('link'); l.id = 'css-signals'; l.rel = 'stylesheet'; l.href = new URL('./signals.css', import.meta.url).href; document.head.appendChild(l); };
const COUNTIES_URL = new URL('../data/national_counties.json', import.meta.url).href;
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const EST = Copy.EST;

/* ── companies, force categories, source links ───────────────────────────── */
const COS = [
  { id: 'pp', name: 'Punctual Pros' }, { id: 'cet', name: 'CET' }, { id: 'fl', name: 'Frontline' },
  { id: 'ts', name: 'Thomas Scientific' }, { id: 'bpi', name: 'BPI' }, { id: 'fh', name: 'Fair Harbor' },
];
const CO_NAME = Object.fromEntries(COS.map(c => [c.id, c.name]));
const CATS = [
  ['housing', 'Housing and building'], ['people', 'People and income'], ['labor', 'Labor and pay'], ['costs', 'Input costs'],
  ['money', 'Rates and credit'], ['public', 'Public money'], ['policy', 'Policy and rules'], ['rivals', 'Competition'],
  ['demand', 'Customer demand'], ['calendar', 'Calendar'], ['weather', 'Weather'],
];
const CAT_NAME = Object.fromEntries(CATS);
const W_TXT = { 3: 'High', 2: 'Medium', 1: 'Low' };
const URL_ = {
  realtor: 'https://www.realtor.com/research/data/', acs: 'https://www.census.gov/programs-surveys/acs', pep: 'https://www.census.gov/programs-surveys/popest.html',
  cbp: 'https://www.census.gov/programs-surveys/cbp.html', redfin: 'https://www.redfin.com/news/data-center/', nws: 'https://www.weather.gov/alerts',
  epaTT: 'https://www.federalregister.gov/documents/2026/05/26/2026-10387/phasedown-of-hydrofluorocarbons-reconsideration-of-certain-regulatory-requirements-promulgated-under', irs25c: 'https://www.irs.gov/credits-deductions/energy-efficient-home-improvement-credit',
  obbba: 'https://www.congress.gov/bill/119th-congress/house-bill/1', masssave: 'https://www.masssave.com/', echo: 'https://echo.epa.gov/',
  usa: 'https://www.usaspending.gov/search', nih: 'https://reporter.nih.gov/', fr: 'https://www.federalregister.gov/', fec: 'https://www.fec.gov/',
  amlaw: 'https://www.law.com/americanlawyer/rankings/', fred: 'https://fred.stlouisfed.org/',
};
/* who publishes each FRED series (FRED republishes them); default is the Bureau of Labor Statistics */
const PUB = { MORTGAGE30US: 'Freddie Mac', BAMLH0A0HYM2: 'ICE BofA', DPRIME: 'Federal Reserve', EXHOSLUSM495S: 'National Association of Realtors', HOUST: 'Census Bureau', TLNRESCONS: 'Census Bureau', PASTHPI: 'FHFA', NJSTHPI: 'FHFA', MASTHPI: 'FHFA', CTSTHPI: 'FHFA', PCOPPUSDM: 'IMF', GASREGW: 'Energy Information Administration', GASDESW: 'Energy Information Administration', CUSTOMS: 'US Treasury', UMCSENT: 'University of Michigan', RSCCAS: 'Census Bureau', CP: 'Bureau of Economic Analysis' };
const pub = id => id === 'CUSTOMS' ? 'US Treasury' : `${PUB[id] || 'Bureau of Labor Statistics'} via FRED`;
/* footprint counties (FIPS); CT uses the planning regions the Census now publishes */
const PP_FIPS = ['42071', '42133', '42043', '42041', '42011', '42075', '42055', '42001', '42099', '42029', '42091', '34029', '34025', '34001', '34005'];
const CET_FIPS = ['25027', '25005', '25023', '25017', '25021', '25009', '25025', '25013', '25015', '09110', '09120', '09140', '09170', '09190', '09180', '44007'];
const CET_NWS = [...CET_FIPS.filter(f => !f.startsWith('09')), '09001', '09003', '09005', '09007', '09009', '09011', '09013', '09015'];   // NWS still codes CT by its old counties

/* ── formatting ──────────────────────────────────────────────────────────── */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };
const monthWords = ym => { const m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? `${MON[+m[2] - 1]} ${m[1]}` : ''; };
const quarterWords = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); if (!m) return ''; const q = Math.floor((+m[2] - 1) / 3); return `${MON[q * 3]} to ${MON[q * 3 + 2]} ${m[1]}`; };
const asOf = s => !s ? '' : s.freq === 'quarterly' ? quarterWords(s.date) : s.freq === 'monthly' ? monthWords(s.date) : dayWords(s.date);
const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const big = n => { const a = Math.abs(n); return a >= 1e12 ? `${(n / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(n / 1e9).toFixed(a >= 1e11 ? 0 : 1)}B` : a >= 1e6 ? `${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K` : String(Math.round(n)); };
const num = n => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US');
const money = n => n == null || !isFinite(n) ? '—' : `${n < 0 ? '−' : ''}$${big(Math.abs(n))}`;
const smoney = n => n == null || !isFinite(n) ? '—' : `${n < 0 ? '−' : '+'}$${big(Math.abs(n))}`;
const cents = x => x == null || !isFinite(x) ? '—' : `${x >= 0 ? '+' : '−'}$${Math.abs(x).toFixed(2)}`;
const pctS = (x, d = 1) => x == null || !isFinite(x) ? '—' : `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;
const pct0 = x => x == null || !isFinite(x) ? '—' : `${Math.round(x * 100)}%`;
const VAL = {
  '%': (v, id) => `${v.toFixed(/UR$/.test(id) ? 1 : 2)}%`,
  '$ per gallon': v => `$${v.toFixed(2)} a gallon`,
  '$ per kWh': v => `${(v * 100).toFixed(1)}¢ a kWh`,
  '$ per metric ton': v => `$${num(v)} a ton`,
  '$': v => `$${v.toFixed(2)} an hour`,
  thousand: (v, id) => `${big(v * 1e3)} ${id === 'JTS2300JOL' ? 'openings' : 'jobs'}`,
  'thousand homes': v => `${big(v * 1e3)} a year`,
  homes: v => `${big(v)} a year`,
  '$M': (v, id) => `$${big(v * 1e6)} a ${id === 'RSCCAS' ? 'month' : 'year'}`,
  '$M per month': v => `$${big(v * 1e6)} a month`,
  '$B': v => `$${big(v * 1e9)} a year`,
  index: v => `${v.toFixed(1)} (index)`,
};
const val = s => s ? (VAL[s.unit] || (v => String(v)))(s.last, s.id) : '—';
const chg = s => s?.chg == null ? '' : s.chg_kind === 'pts' ? `${s.chg >= 0 ? '+' : '−'}${Math.abs(s.chg).toFixed(/UR$/.test(s.id) ? 1 : 2)} pts` : pctS(s.chg);
const sgn = (x, tol) => x == null || !isFinite(x) || Math.abs(x) < tol ? 0 : Math.sign(x);
/** helps (+1) / hurts (−1) / steady (0) from a series' change in a year and how the series relates to the company */
const dirOf = (s, rel, tol) => !s || s.chg == null ? 0 : sgn(s.chg, tol ?? (s.chg_kind === 'pts' ? 0.15 : 0.02)) * rel;
const DIR = { 1: { t: 'Helps', st: 'good' }, '-1': { t: 'Hurts', st: 'bad' }, 0: { t: 'Steady', st: '' } };
const dirChip = d => `<span class="sys-chip${DIR[d].st ? ` sys-chip--${DIR[d].st}` : ''}">${DIR[d].t}</span>`;
const coChip = id => `<span class="sys-chip sys-chip--soft" data-co="${id}">${h(CO_NAME[id] || id)}</span>`;

/* revenue and debt points from each company's filings estimate table (all est.); fallbacks are the same tables' midpoints */
const parseUsd = str => {
  const s = String(str || ''); const u = x => (/B/i.test(x) ? 1e9 : 1e6);
  let m = /(?:point|mid)\s*~?\s*\$\s*([\d.]+)\s*([MB])/i.exec(s) || /~\s*\$\s*([\d.]+)\s*([MB])/i.exec(s);
  if (m) return +m[1] * u(m[2]);
  m = /\$\s*([\d.]+)\s*[–-]\s*\$?\s*([\d.]+)\s*([MB])/i.exec(s); if (m) return (+m[1] + +m[2]) / 2 * u(m[3]);
  m = /\$\s*([\d.]+)\s*([MB])/i.exec(s); return m ? +m[1] * u(m[2]) : null;
};
const REV = { pp: ['pp_filings', /pro forma total revenue/i, 22e6], cet: ['cet_filings', /^Pro forma (?:platform|portfolio company|company)/i, 82.5e6], fl: ['frontline_filings', /^Revenue \(2025/i, 120e6], ts: ['thomas_filings', /^Current revenue/i, 285e6], bpi: ['bpi_filings', /^Net \(fee\) revenue FY2025/i, 105e6], fh: ['fairharbor_filings', /^2025 net revenue/i, 27e6] };
const pick = (fd, re) => (fd?.meta?.estimate_table || []).find(e => re.test(e.metric || ''));

/* ── data ─────────────────────────────────────────────────────────────────── */
let _bundle = null;
async function loadAll(ctx) {
  if (_bundle) return _bundle;
  const { data, live } = ctx;
  const snap = n => Promise.resolve(live.snapshot(n)).catch(() => null);
  const alerts = st => live.nwsAlerts(st).catch(() => []);
  const p = (async () => {
    const [fred, housing, nih, fedbuy, policy, permits, echo, counties, lawfirms, maPp, cetOpp, aPA, aNJ, aMA, aCT, aRI, ...fins] = await Promise.all([
      snap('fred_signals'), snap('housing_counties'), snap('nih_awards'), snap('federal_buying'), snap('policy_activity'), snap('census_permits'), snap('echo_npdes_majors'),
      fetch(COUNTIES_URL, { cache: 'force-cache' }).then(r => (r.ok ? r.json() : null)).then(j => (j ? data.decode(j) : null)).catch(() => null),
      data.load('fl_lawfirms').catch(() => []), data.research('ma_targets_pp'), data.research('cet_opportunities'),
      alerts('PA'), alerts('NJ'), alerts('MA'), alerts('CT'), alerts('RI'),
      ...COS.map(c => data.research(REV[c.id][0])),
    ]);
    const D = { fred: new Map((fred?.items || []).map(s => [s.id, s])), fredSnap: fred, housing, nih, fedbuy, policy, permits, echo, lawfirms: Array.isArray(lawfirms) ? lawfirms : [], maPp, cetOpp, today: new Date() };
    D.rev = {}; D.revTxt = {};
    COS.forEach((c, i) => { const [, re, fb] = REV[c.id]; const e = pick(fins[i], re); const raw = e ? String(e.estimate).split(';')[0] : ''; const v = parseUsd(raw); D.rev[c.id] = v || fb; D.revTxt[c.id] = `${money(D.rev[c.id])} est.${e ? '' : ' (fallback)'}`; });
    const tsFed = pick(fins[3], /^Federal revenue run-rate/i), tsDebt = pick(fins[3], /^Total first-lien facility/i);
    D.tsFed = parseUsd(tsFed?.estimate) || 7.75e6; D.tsDebt = parseUsd(tsDebt?.estimate) || 240e6;
    D.finDate = fins.find(Boolean)?.meta?.generated || '2026-09-24';
    // county table aggregates for the two home-and-building footprints
    const rows = Array.isArray(counties?.items) ? counties.items : Array.isArray(counties) ? counties : [];
    const byF = new Map(rows.map(r => [String(r.fips).padStart(5, '0'), r]));
    D.cty = { pp: agg(PP_FIPS.map(f => byF.get(f)).filter(Boolean)), cet: agg(CET_FIPS.map(f => byF.get(f)).filter(Boolean)) };
    D.ctyMeta = counties?.meta || null;
    // Realtor.com county inventory by company
    D.hz = Object.fromEntries(COS.map(c => [c.id, hagg((housing?.items || []).filter(r => (r.cos || []).includes(c.id)))]));
    // NWS alerts touching the footprints (SAME codes are 0 + county FIPS)
    const all = []; const seen = new Set();
    for (const a of [...aPA, ...aNJ, ...aMA, ...aCT, ...aRI]) if (a && !seen.has(a.id)) { seen.add(a.id); all.push(a); }
    const hit = list => all.filter(a => (a.fips || []).some(f => list.includes(String(f).slice(-5))));
    D.alerts = { pp: hit(PP_FIPS), cet: hit(CET_NWS), snapshot: [aPA, aNJ, aMA, aCT].some(x => x?._snapshot) };
    return D;
  })();
  _bundle = p; p.catch(() => { _bundle = null; });
  return p;
}
/** housing-unit and population weighted aggregates over a county list */
function agg(list) {
  if (!list.length) return null;
  const s = (k, w) => list.reduce((a, r) => a + (r[k] != null && (w ? r[w] != null : true) ? (w ? r[k] * r[w] : r[k]) : 0), 0);
  const wsum = (k, w) => list.reduce((a, r) => a + (r[k] != null && r[w] != null ? r[w] : 0), 0);
  const wavg = (k, w = 'housing_units') => { const d = wsum(k, w); return d ? s(k, w) / d : null; };
  const pop = list.reduce((a, r) => a + (r.pop_est_2024 || 0), 0), pop20 = list.reduce((a, r) => a + (r.pop_est_2024 && r.pop_growth_2020_2024 != null ? r.pop_est_2024 / (1 + r.pop_growth_2020_2024) : 0), 0);
  const salesRows = list.filter(r => r.home_sales_12m != null);
  return { n: list.length, hu: s('housing_units'), sales12: salesRows.reduce((a, r) => a + r.home_sales_12m, 0), salesN: salesRows.length, pre1980: wavg('pre1980_share'), yearBuilt: wavg('median_year_built'),
    owner: wavg('owner_occupied_share'), income: wavg('median_household_income'), growth: pop20 ? pop / pop20 - 1 : null, oil: wavg('heating_fuel_oil_propane_share'),
    estab: s('hvac_plumbing_electrical_establishments'), estabElec: s('estab_238210_electrical'), ab: s('authority_brands_presence'), permits25: s('permits_units_2025ytd') };
}
/** Realtor.com: change vs a year ago across counties, skipping series breaks (a county whose count moved more than 150% in a year) */
function hagg(rows) {
  if (!rows.length) return null;
  const roll = (k, yk) => { let cur = 0, prev = 0, used = 0, breaks = 0; for (const r of rows) { const v = r[k], y = r[yk]; if (v == null) continue; if (y == null || Math.abs(y) > 1.5) { if (y != null) breaks++; continue; } cur += v; prev += v / (1 + y); used++; } return { cur: rows.reduce((a, r) => a + (r[k] || 0), 0), chg: prev ? cur / prev - 1 : null, used, breaks }; };
  return { n: rows.length, newL: roll('new', 'new_yy'), pend: roll('pending', 'pending_yy'), active: roll('active', 'active_yy'), month: rows.find(r => r.month)?.month };
}

/* ── the factor framework ─────────────────────────────────────────────────── */
/* Each factor: { id, co, cat, w (3 high · 2 medium · 1 low), name, why (one plain sentence), read: { v, d, date, src, url, dir },
   lever (the action), link, sens: { unit, unitUsd, now, nowUsd, kind: 'sales'|'margin', assume } } */
function buildFactors(D) {
  const F = [], S = id => D.fred.get(id) || null, R = D.rev;
  const add = f => { if (!f.read) f.read = { v: 'Not available', d: 'The nightly reading did not load', date: '', src: '', dir: 0, missing: true }; F.push(f); };
  const fr = (id, rel, tol, extra = {}) => { const s = S(id); return s ? { v: val(s), d: s.chg != null ? `${chg(s)} vs a year ago${extra.d ? ` · ${extra.d}` : ''}` : extra.d || '', date: asOf(s), src: pub(id), url: s.url, dir: dirOf(s, rel, tol), series: [s] } : null; };
  const sens = (unit, unitUsd, now, nowUsd, kind, assume) => ({ unit, unitUsd, now, nowUsd, kind, assume });
  const hz = D.housing ? monthWords(D.housing.month) : '';
  const today = dayWords(isoDay(D.today));
  const pp = D.cty.pp, cet = D.cty.cet;

  /* Punctual Pros: residential HVAC, plumbing and electrical, Central PA and the Jersey Shore */
  const ppH = D.hz.pp;
  add({ id: 'pp-homes', co: 'pp', cat: 'housing', w: 3, name: 'Home sales in the footprint', why: 'New owners fix, replace and sign up for service plans in their first year.',
    read: ppH ? { v: `${num(ppH.pend.cur)} homes under contract`, d: `${pctS(ppH.pend.chg)} vs a year ago · new listings ${pctS(ppH.newL.chg)}`, date: hz, src: 'Realtor.com county data', url: URL_.realtor, dir: sgn(ppH.pend.chg, 0.03) } : null,
    lever: 'Mail every buyer within 60 days of closing. The new-mover list is ready.', link: ['#/pp/movers', 'New movers'],
    sens: pp?.sales12 ? sens(`Each 10% more home sales ≈ ${num(pp.sales12 * 0.1 * 0.03)} more jobs, ${smoney(pp.sales12 * 0.1 * 0.03 * 400)} sales a year`, pp.sales12 * 0.1 * 0.03 * 400,
      ppH?.pend.chg != null ? `Today's ${pctS(ppH.pend.chg)} ≈ ${smoney(pp.sales12 * ppH.pend.chg * 0.03 * 400)} sales a year` : null, ppH?.pend.chg != null ? pp.sales12 * ppH.pend.chg * 0.03 * 400 : null, 'sales',
      `${num(pp.sales12)} home sales a year in the ${pp.n} counties (Redfin, Jun 2025 to May 2026); 3% of buyers book a first job (mail response runs 2 to 4%); $400 average repair ticket. Service plans sold to new owners would add more.`) : null });
  add({ id: 'pp-rates', co: 'pp', cat: 'money', w: 3, name: 'Mortgage rates', why: 'High mortgage rates keep owners in place, so fewer homes change hands.',
    read: fr('MORTGAGE30US', -1), lever: 'Lean on repair-first offers and monthly financing. Owners who stay put fix what they have.', link: ['#/pp/movers', 'New movers'] });
  add({ id: 'pp-age', co: 'pp', cat: 'housing', w: 3, name: 'Age of homes', why: 'Older homes break down more and need whole-system replacements.',
    read: pp ? { v: `${pct0(pp.pre1980)} of homes built before 1980`, d: `typical home built around ${Math.round(pp.yearBuilt)} · ${pct0(pp.owner)} owner-occupied`, date: 'ACS 2019 to 2023', src: 'Census American Community Survey', url: URL_.acs, dir: 1 } : null,
    lever: 'Aim replacement offers and service plans at the zips with the oldest homes.', link: ['#/pp/territory', 'Territory'],
    sens: pp ? sens(`Each 1 in 10,000 older homes that replaces a system with Punctual Pros ≈ ${smoney(pp.hu * pp.pre1980 * 0.0001 * 10000)} sales a year`, pp.hu * pp.pre1980 * 0.0001 * 10000, null, null, 'sales',
      `${big(pp.hu * pp.pre1980)} homes built before 1980 in the ${pp.n} counties (ACS); $10,000 average installed system (assumption).`) : null });
  const cw = S('CES2000000003');
  add({ id: 'pp-labor', co: 'pp', cat: 'labor', w: 3, name: 'Technician supply and pay', why: 'Calls without a free technician are lost sales, and pay is the largest cost.',
    read: cw ? { v: `${val(cw)} construction pay`, d: `${chg(cw)} vs a year ago · unemployment PA ${val(S('PAUR'))}, NJ ${val(S('NJUR'))}`, date: asOf(cw), src: pub('CES2000000003'), url: cw.url, dir: cw.chg > 0.035 ? -1 : cw.chg < 0.025 ? 1 : 0, series: [cw, S('PAUR'), S('NJUR')].filter(Boolean) } : null,
    lever: 'Run an apprentice program, set pay bands by market and let the voice agent book calls so technicians stay on paid work.',
    sens: sens(`Each 1% rise in technician pay ≈ ${smoney(-R.pp * 0.35 * 0.01)} margin a year`, -R.pp * 0.35 * 0.01, cw?.chg != null ? `Today's ${chg(cw)} ≈ ${smoney(-R.pp * 0.35 * cw.chg)} margin a year` : null, cw?.chg != null ? -R.pp * 0.35 * cw.chg : null, 'margin',
      `Revenue ${D.revTxt.pp} (public filings); field labor about 35% of revenue (assumption).`) });
  const eq = S('PCU333415333415');
  add({ id: 'pp-equip', co: 'pp', cat: 'costs', w: 2, name: 'Equipment prices', why: 'Equipment prices set the replacement ticket; when they jump, some owners repair instead.',
    read: fr('PCU333415333415', -1), lever: 'Update the price book every quarter and buy ahead of announced price rises.',
    sens: sens(`Each 5% rise in equipment cost ≈ ${smoney(-R.pp * 0.4 * 0.45 * 0.05)} margin a year if not passed on`, -R.pp * 0.4 * 0.45 * 0.05, eq?.chg != null ? `Today's ${chg(eq)} ≈ ${smoney(-R.pp * 0.4 * 0.45 * eq.chg)} margin a year if not passed on` : null, eq?.chg != null ? -R.pp * 0.4 * 0.45 * eq.chg : null, 'margin',
      `Revenue ${D.revTxt.pp}; replacements about 40% of revenue; equipment about 45% of a replacement ticket (assumptions).`) });
  add({ id: 'pp-refrig', co: 'pp', cat: 'policy', w: 2, name: 'Refrigerant rules', why: 'New systems must use newer refrigerants, which raises prices and pushes old units out.',
    read: { v: 'New systems use the newer refrigerants', d: 'Units built before 2025 with the old refrigerant can still be installed (rule eased May 26, 2026) · old refrigerant supply cut 40% now, 70% from 2029', date: 'Oct 2026', src: 'EPA rule, Federal Register', url: URL_.epaTT, dir: 1 },
    lever: 'Quote replacements to owners of old R-22 and R-410A systems before repair refrigerant costs more.' });
  add({ id: 'pp-credit', co: 'pp', cat: 'policy', w: 2, name: 'Heat-pump incentives', why: 'Rebates make heat pumps cheaper for owners, and the federal credit has ended.',
    read: { v: 'Federal heat-pump tax credit ended', d: 'Not available for systems installed after Dec 31, 2025 · utility rebates in PA and NJ continue', date: 'Oct 2026', src: 'IRS energy credit page', url: URL_.irs25c, dir: -1 },
    lever: 'Lead every heat-pump quote with the utility rebate and a monthly payment.' });
  const gas = S('GASREGW'), vans = R.pp / 250000, gal = 20000 / 15;
  add({ id: 'pp-fuel', co: 'pp', cat: 'costs', w: 2, name: 'Fuel for the vans', why: 'Gas prices hit every van on every route.',
    read: fr('GASREGW', -1), lever: 'Tighten routes with dispatch software and add a trip charge when fuel spikes.',
    sens: gas ? sens(`Each 25¢ a gallon ≈ ${smoney(-vans * gal * 0.25)} margin a year`, -vans * gal * 0.25, gas.year_ago != null ? `Today's ${cents(gas.last - gas.year_ago)} a gallon ≈ ${smoney(-vans * gal * (gas.last - gas.year_ago))} margin a year` : null, gas.year_ago != null ? -vans * gal * (gas.last - gas.year_ago) : null, 'margin',
      `About ${num(vans)} vans (one per technician at about $250,000 revenue each), 20,000 miles a year at 15 miles a gallon (assumptions).`) : null });
  const oil = S('APU000072511');
  add({ id: 'pp-oil', co: 'pp', cat: 'demand', w: 2, name: 'Heating-oil prices', why: 'Costly heating oil pushes owners to switch to heat pumps.',
    read: oil ? { ...fr('APU000072511', 1, 0.05), d: `${chg(oil)} vs a year ago · ${pct0(pp?.oil)} of footprint homes heat with oil or propane` } : null,
    lever: 'Market heat-pump conversions to oil and propane homes before the first cold snap.',
    sens: pp ? sens(`Each 1 in 10,000 oil or propane homes that converts ≈ ${smoney(pp.hu * pp.oil * 0.0001 * 12000)} sales a year`, pp.hu * pp.oil * 0.0001 * 12000, null, null, 'sales',
      `${big(pp.hu * pp.oil)} oil or propane homes in the ${pp.n} counties (ACS); $12,000 average conversion (assumption).`) : null });
  add({ id: 'pp-weather', co: 'pp', cat: 'weather', w: 2, name: 'Weather', why: 'Heat waves, freezes and storms lift calls for a few days at a time.',
    read: { v: D.alerts.pp.length ? `${D.alerts.pp.length} weather alert${D.alerts.pp.length > 1 ? 's' : ''} in the footprint` : 'No weather alerts in the footprint', d: 'Checked when this page opened', date: today, src: 'National Weather Service', url: URL_.nws, dir: D.alerts.pp.length ? 1 : 0 },
    lever: 'Plan surge technicians from the weather view on alert days.', link: ['#/pp/weather', 'Weather and demand'] });
  const peList = D.maPp?.meta?.pe_backed_competitors || [];
  add({ id: 'pp-rivals', co: 'pp', cat: 'rivals', w: 2, name: 'Sponsor-backed rivals', why: 'Rivals backed by other sponsors buy local shops and hire away technicians.',
    read: pp ? { v: `${num(peList.length)} sponsor-backed rivals on the watch list`, d: `${num(pp.estab)} heating, plumbing and electrical shops in the ${pp.n} counties`, date: 'Sep 2026', src: 'Add-on target research · Census business counts (2022)', url: URL_.cbp, dir: peList.length >= 3 ? -1 : 0 } : null,
    lever: 'Close the top tuck-ins first and put key technicians on retention plans.', link: ['#/pp/market', 'Market'] });
  add({ id: 'pp-people', co: 'pp', cat: 'people', w: 1, name: 'Population and income', why: 'Growing, higher-income counties add customers and bigger tickets.',
    read: pp ? { v: `${pctS(pp.growth)} population since 2020`, d: `typical household income $${big(pp.income)}`, date: '2020 to 2024', src: 'Census population estimates and ACS', url: URL_.pep, dir: sgn(pp.growth, 0.01) } : null,
    lever: 'Extend routes toward the fastest-growing counties first.', link: ['#/pp/territory', 'Territory'] });
  const permitsPP = (D.permits?.items || []).filter(r => PP_FIPS.includes(r.fips));
  add({ id: 'pp-build', co: 'pp', cat: 'housing', w: 1, name: 'New home building', why: 'New homes need installers now and service within a few years.',
    read: D.permits ? { v: `${num(permitsPP.reduce((a, r) => a + r.units_total, 0))} homes permitted in ${monthWords(D.permits.period)}`, d: pp ? `${num(pp.permits25)} in all of 2025` : '', date: monthWords(D.permits.period), src: 'Census building permits', url: (D.permits.source_urls || [])[0], dir: 0 } : null,
    lever: 'Offer builders a first-year service agreement in the counties issuing the most permits.' });

  /* CET: commercial electrical, solar, EV charging, wastewater and efficiency across New England */
  const nr = S('TLNRESCONS');
  add({ id: 'cet-build', co: 'cet', cat: 'housing', w: 3, name: 'Commercial and public building', why: 'New buildings and upgrades set how much electrical work there is to bid.',
    read: fr('TLNRESCONS', 1), lever: 'Keep the bid calendar full in the sectors still building: water, schools and health care.', link: ['#/cet/opportunities', 'Opportunity radar'],
    sens: sens(`Each 5% change in building spending ≈ ${smoney(R.cet * 0.6 * 0.05)} sales a year`, R.cet * 0.6 * 0.05, nr?.chg != null ? `Today's ${chg(nr)} ≈ ${smoney(R.cet * 0.6 * nr.chg)} sales a year` : null, nr?.chg != null ? R.cet * 0.6 * nr.chg : null, 'sales',
      `Revenue ${D.revTxt.cet} (CET with NuWave and Horton, public filings); about 60% of work follows building starts (assumption).`) });
  const trades = (D.fedbuy?.items || []).find(i => i.id === 'trades_northeast');
  const openBids = (D.cetOpp?.items || []).filter(o => o.stage !== 'awarded' && o.due_date && o.due_date >= isoDay(D.today)).length;
  add({ id: 'cet-public', co: 'cet', cat: 'public', w: 3, name: 'Public project money', why: 'State and federal money pays for wastewater, school and energy upgrades.',
    read: trades ? { v: `${money(trades.fy_totals?.[String(trades.last_full_fy)])} federal electrical and HVAC contracts`, d: `fiscal ${trades.last_full_fy}, ${pctS(trades.chg)} vs the year before · ${num(openBids)} open bids on the radar`, date: `Oct ${trades.last_full_fy - 1} to Sep ${trades.last_full_fy}`, src: 'USASpending', url: URL_.usa, dir: sgn(trades.chg, 0.05) } : null,
    lever: 'Work every funded project on the bid radar; state water and school money now matters more than federal awards.', link: ['#/cet/opportunities', 'Opportunity radar'] });
  const viol = (D.echo?.items || []).filter(i => i.violation_status && !/^Resolved/i.test(i.violation_status));
  add({ id: 'cet-water', co: 'cet', cat: 'policy', w: 3, name: 'Wastewater compliance', why: 'Treatment plants with open violations must fix pumps, power and controls.',
    read: D.echo ? { v: `${num(viol.length)} large treatment plants with open violations`, d: `of ${num(D.echo.items.length)} large plants in CT, MA and RI`, date: dayWords(String(D.echo.fetched_at).slice(0, 10)), src: 'EPA ECHO', url: URL_.echo, dir: viol.length ? 1 : 0 } : null,
    lever: 'Pitch Horton pump-station, power and controls work to the plants with open violations.', link: ['#/cet/wastewater', 'Wastewater accounts'] });
  const cu = S('PCOPPUSDM');
  add({ id: 'cet-copper', co: 'cet', cat: 'costs', w: 3, name: 'Copper and electrical gear', why: 'Copper, transformers and switchgear are a large share of each job’s material cost.',
    read: cu ? { ...fr('PCOPPUSDM', -1), d: `${chg(cu)} vs a year ago · transformers ${chg(S('PCU335311335311'))}, switchgear ${chg(S('PCU3353133531'))}`, series: [cu, S('PCU335311335311'), S('PCU3353133531')].filter(Boolean) } : null,
    lever: 'Add price-escalation clauses to bids and order long-lead gear at award.',
    sens: sens(`Each 10% rise in copper ≈ ${smoney(-R.cet * 0.5 * 0.08 * 0.1)} margin a year on fixed-price work`, -R.cet * 0.5 * 0.08 * 0.1, cu?.chg != null ? `Today's ${chg(cu)} ≈ ${smoney(-R.cet * 0.5 * 0.08 * cu.chg)} margin a year` : null, cu?.chg != null ? -R.cet * 0.5 * 0.08 * cu.chg : null, 'margin',
      `Revenue ${D.revTxt.cet}; half of work at fixed prices; copper wire and parts about 8% of contract value (assumptions).`) });
  const jo = S('JTS2300JOL');
  add({ id: 'cet-labor', co: 'cet', cat: 'labor', w: 3, name: 'Electrician supply and pay', why: 'Licensed electricians are scarce, and crews cap how much work CET can take.',
    read: jo ? { v: `${val(jo)} in construction`, d: `${chg(jo)} vs a year ago · unemployment MA ${val(S('MAUR'))}, CT ${val(S('CTUR'))} · pay ${chg(cw)}`, date: asOf(jo), src: pub('JTS2300JOL'), url: jo.url, dir: jo.chg > 0.05 ? -1 : jo.chg < -0.05 ? 1 : 0, series: [jo, S('MAUR'), S('CTUR'), cw].filter(Boolean) } : null,
    lever: 'Grow the apprentice pipeline and share crews across Horton and CET.',
    sens: sens(`Each 1% rise in electrician pay ≈ ${smoney(-R.cet * 0.4 * 0.01)} margin a year`, -R.cet * 0.4 * 0.01, cw?.chg != null ? `Today's ${chg(cw)} ≈ ${smoney(-R.cet * 0.4 * cw.chg)} margin a year` : null, cw?.chg != null ? -R.cet * 0.4 * cw.chg : null, 'margin',
      `Revenue ${D.revTxt.cet}; field labor about 40% of revenue (assumption); pay change is US construction pay.`) });
  add({ id: 'cet-solar', co: 'cet', cat: 'policy', w: 2, name: 'Solar and charger credits', why: 'Federal solar and EV-charger credits are ending, which pulls work forward and then leaves a gap.',
    read: { v: 'Charger credit has ended; solar credit closes after 2027', d: 'Solar projects not started by Jul 4, 2026 must be running by Dec 31, 2027 · charger credit ended Jun 30, 2026', date: 'Oct 2026', src: 'Federal tax law of July 2025', url: URL_.obbba, dir: -1 },
    lever: 'Finish projects that still qualify; steer new sales to storage, efficiency and wastewater work.' });
  add({ id: 'cet-utility', co: 'cet', cat: 'public', w: 2, name: 'Utility efficiency programs', why: 'Utility programs pay for the lighting, controls and heat-pump work NuWave sells.',
    read: { v: 'Mass Save and Energize CT plans run through 2027', d: 'Rebates for lighting, controls and heat pumps', date: 'Oct 2026', src: 'Mass Save', url: URL_.masssave, dir: 1 },
    lever: 'Keep NuWave a top program vendor and fold rebates into every quote.' });
  add({ id: 'cet-power', co: 'cet', cat: 'demand', w: 2, name: 'Power prices', why: 'Higher power prices shorten the payback on solar, lighting and controls.',
    read: fr('APU000072610', 1), lever: 'Open each proposal with the payback at today’s power price.' });
  const prime = S('DPRIME'), hy = S('BAMLH0A0HYM2');
  add({ id: 'cet-rates', co: 'cet', cat: 'money', w: 2, name: 'Borrowing costs', why: 'Owners borrow for big projects, so higher rates delay starts.',
    read: prime ? { ...fr('DPRIME', -1), d: `${chg(prime)} vs a year ago · junk-bond spread ${val(hy)}` } : null,
    lever: 'Bring lease and pay-from-savings partners into large proposals.' });
  const cetH = D.hz.cet;
  add({ id: 'cet-owners', co: 'cet', cat: 'housing', w: 1, name: 'Property changing hands', why: 'New owners of buildings and homes often upgrade in their first year.',
    read: cetH ? { v: `${num(cetH.newL.cur)} new home listings`, d: `${pctS(cetH.newL.chg)} vs a year ago${cetH.pend.breaks ? ' · Massachusetts under-contract counts changed method, so they are left out' : ''}`, date: hz, src: 'Realtor.com county data', url: URL_.realtor, dir: sgn(cetH.newL.chg, 0.03) } : null,
    lever: 'Reach new owners through the property transfers view.', link: ['#/cet/transfers', 'Property transfers'] });
  add({ id: 'cet-weather', co: 'cet', cat: 'weather', w: 1, name: 'Weather', why: 'Storms drive emergency work on pump stations and generators.',
    read: { v: D.alerts.cet.length ? `${D.alerts.cet.length} weather alert${D.alerts.cet.length > 1 ? 's' : ''} in operating counties` : 'No weather alerts in operating counties', d: 'Checked when this page opened', date: today, src: 'National Weather Service', url: URL_.nws, dir: D.alerts.cet.length ? 1 : 0 },
    lever: 'Keep an on-call crew for pump-station and generator outages.' });

  /* Frontline: managed IT and billing services for law firms, national */
  const lj = S('CES6054110001');
  add({ id: 'fl-heads', co: 'fl', cat: 'demand', w: 3, name: 'Law-firm headcount', why: 'Frontline bills by user, so law-firm hiring adds seats.',
    read: fr('CES6054110001', 1, 0.01), lever: 'Price new seats into each renewal and flag clients that are hiring.',
    sens: sens(`Each 1% rise in law-firm headcount ≈ ${smoney(R.fl * 0.7 * 0.01)} sales a year`, R.fl * 0.7 * 0.01, lj?.chg != null ? `Today's ${chg(lj)} ≈ ${smoney(R.fl * 0.7 * lj.chg)} sales a year` : null, lj?.chg != null ? R.fl * 0.7 * lj.chg : null, 'sales',
      `Revenue ${D.revTxt.fl} (public filings); about 70% billed per user or seat (assumption).`) });
  add({ id: 'fl-rates', co: 'fl', cat: 'demand', w: 3, name: 'Law-firm billing rates', why: 'When firms raise rates, they have room for IT and billing upgrades.',
    read: fr('PCU541110541110', 1, 0.03), lever: 'Time renewals and upsells to the January rate rises.' });
  const lf = D.lawfirms, lfRev = lf.reduce((a, x) => a + (x.revenue_m || 0), 0), rpl = lf.map(x => x.revenue_per_lawyer_k).filter(Number.isFinite).sort((a, b) => a - b);
  add({ id: 'fl-amlaw', co: 'fl', cat: 'demand', w: 2, name: 'Large-firm economics', why: 'Firms with high revenue per lawyer buy the most security and billing help.',
    read: lf.length ? { v: `$${big(lfRev * 1e6)} revenue across ${num(lf.length)} large firms`, d: rpl.length ? `median ${money(rpl[Math.floor(rpl.length / 2)] * 1e3)} per lawyer` : '', date: '2025 rankings', src: 'AM Law 200 public rankings', url: URL_.amlaw, dir: 1 } : null,
    lever: 'Work the account map from the firms with the highest revenue per lawyer.', link: ['#/fl/amlaw', 'AM Law account map'] });
  const cyb = lf.filter(x => (x.cyber_urgency_score || 0) >= 4).length;
  add({ id: 'fl-cyber', co: 'fl', cat: 'policy', w: 2, name: 'Cyber and insurer demands', why: 'Insurers and clients now require security controls that firms buy from IT providers.',
    read: lf.length ? { v: `${num(cyb)} of ${num(lf.length)} large firms score high on cyber urgency`, d: 'Analyst score of 4 or 5 out of 5', date: 'Sep 2026', src: 'Analyst scoring of AM Law firms', url: URL_.amlaw, dir: 1 } : null,
    lever: 'Bundle security monitoring into every renewal.' });
  const ai1 = lf.filter(x => x.ai_opportunity_signal === 'partial').length, ai2 = lf.filter(x => x.ai_opportunity_signal === 'planning').length;
  add({ id: 'fl-ai', co: 'fl', cat: 'demand', w: 2, name: 'AI rollouts at firms', why: 'Firms rolling out AI tools need data clean-up, security and training.',
    read: lf.length ? { v: `${num(ai1)} large firms rolling out AI, ${num(ai2)} planning`, d: 'From firm announcements and analyst review', date: 'Sep 2026', src: 'Analyst review of AM Law firms', url: URL_.amlaw, dir: 1 } : null,
    lever: 'Offer an AI readiness package to the top 50 accounts.' });
  const pay = S('CES6000000003');
  add({ id: 'fl-talent', co: 'fl', cat: 'labor', w: 2, name: 'Engineer pay', why: 'Engineer pay drives the cost of every help-desk ticket.',
    read: pay ? { v: `${val(pay)} professional services pay`, d: `${chg(pay)} vs a year ago · computer services jobs ${chg(S('CES6054150001'))} · Missouri unemployment ${val(S('MOUR'))}`, date: asOf(pay), src: pub('CES6000000003'), url: pay.url, dir: pay.chg > 0.035 ? -1 : pay.chg < 0.025 ? 1 : 0, series: [pay, S('CES6054150001'), S('MOUR')].filter(Boolean) } : null,
    lever: 'Move routine tickets to automation and hire in lower-cost markets.',
    sens: sens(`Each 1% rise in staff pay ≈ ${smoney(-R.fl * 0.45 * 0.01)} margin a year`, -R.fl * 0.45 * 0.01, pay?.chg != null ? `Today's ${chg(pay)} ≈ ${smoney(-R.fl * 0.45 * pay.chg)} margin a year` : null, pay?.chg != null ? -R.fl * 0.45 * pay.chg : null, 'margin',
      `Revenue ${D.revTxt.fl}; staff about 45% of revenue (assumption).`) });
  add({ id: 'fl-credit', co: 'fl', cat: 'money', w: 2, name: 'Cost of add-on debt', why: 'Add-on deals run on borrowed money, so credit spreads set what BSP can pay.',
    read: fr('BAMLH0A0HYM2', -1, 0.25), lever: 'Line up the first add-on while spreads are tight.', link: ['#/ma/pipeline', 'Add-on pipeline'] });

  /* Thomas Scientific: lab supply distribution, national */
  const nihCur = (D.nih?.items || []).reduce((a, s) => a + (s.current_amount || 0), 0), nihPrv = (D.nih?.items || []).reduce((a, s) => a + (s.prior_amount || 0), 0), nihChg = nihPrv ? nihCur / nihPrv - 1 : null;
  add({ id: 'ts-nih', co: 'ts', cat: 'public', w: 3, name: 'NIH research funding', why: 'University and institute labs buy supplies with grant money.',
    read: D.nih ? { v: `${money(nihCur)} in NIH awards so far this year`, d: `${pctS(nihChg)} vs the same days last year · ${D.nih.states.length} research states`, date: `Jan 1 to ${dayWords(D.nih.windows.current[1])}`, src: 'NIH RePORTER', url: URL_.nih, dir: sgn(nihChg, 0.02) } : null,
    lever: 'Move reps toward institutions whose awards are growing; check in with the ones that shrank.', link: ['#/signals/readings', 'Live readings'],
    sens: sens(`Each 5% change in grant dollars ≈ ${smoney(R.ts * 0.3 * 0.05)} sales a year`, R.ts * 0.3 * 0.05, nihChg != null ? `Today's ${pctS(nihChg)} ≈ ${smoney(R.ts * 0.3 * nihChg)} sales a year` : null, nihChg != null ? R.ts * 0.3 * nihChg : null, 'sales',
      `Revenue ${D.revTxt.ts} (public filings); about 30% of sales to research labs (assumption).`) });
  const hosp = S('CES6562200001');
  add({ id: 'ts-hosp', co: 'ts', cat: 'demand', w: 3, name: 'Hospital and clinical labs', why: 'Hospital and clinical labs are most of the 27,000 scored sites.',
    read: fr('CES6562200001', 1, 0.01), lever: 'Sell standing orders to the top parent accounts.', link: ['#/ts/accounts', 'Accounts'],
    sens: sens(`Each 1% rise in hospital activity ≈ ${smoney(R.ts * 0.5 * 0.01)} sales a year`, R.ts * 0.5 * 0.01, hosp?.chg != null ? `Today's ${chg(hosp)} ≈ ${smoney(R.ts * 0.5 * hosp.chg)} sales a year` : null, hosp?.chg != null ? R.ts * 0.5 * hosp.chg : null, 'sales',
      `Revenue ${D.revTxt.ts}; about half of sales to hospital and clinical labs; hospital jobs stand in for lab volume (assumptions).`) });
  const lab = (D.fedbuy?.items || []).find(i => i.id === 'lab_supplies');
  add({ id: 'ts-federal', co: 'ts', cat: 'public', w: 2, name: 'Federal lab buying', why: 'Federal labs buy supplies through contracts Thomas Scientific can win.',
    read: lab ? { v: `${money(lab.fy_totals?.[String(lab.last_full_fy)])} federal lab supply contracts`, d: `fiscal ${lab.last_full_fy}, ${pctS(lab.chg)} vs the year before`, date: `Oct ${lab.last_full_fy - 1} to Sep ${lab.last_full_fy}`, src: 'USASpending', url: URL_.usa, dir: sgn(lab.chg, 0.05) } : null,
    lever: 'Protect the federal run-rate and bid where agencies still buy.',
    sens: sens(`Each 10% change in federal lab buying ≈ ${smoney(D.tsFed * 0.1)} sales a year`, D.tsFed * 0.1, lab?.chg != null ? `Today's ${pctS(lab.chg)} ≈ ${smoney(D.tsFed * lab.chg)} sales a year` : null, lab?.chg != null ? D.tsFed * lab.chg : null, 'sales',
      `Federal sales ${money(D.tsFed)} a year est. (public filings); they move with federal lab buying (assumption).`) });
  const duty = S('CUSTOMS'), d12 = roll12(duty);
  const dutyRead = extra => duty ? { v: d12 ? `${money(d12.cur * 1e6)} in tariffs over 12 months` : val(duty), d: `${d12 ? `${pctS(d12.chg)} vs the 12 months before · ` : ''}${monthWords(duty.date)} ${chg(duty)} vs a year ago${extra}`, date: asOf(duty), src: pub('CUSTOMS'), url: duty.url, dir: d12 ? -sgn(d12.chg, 0.05) : dirOf(duty, -1), series: [duty] } : null;
  add({ id: 'ts-tariff', co: 'ts', cat: 'costs', w: 3, name: 'Tariffs and product costs', why: 'Many lab products are imported, so tariffs raise costs before list prices catch up.',
    read: dutyRead(` · lab instrument prices ${chg(S('PCU334516334516'))}`),
    lever: 'Add tariff clauses to contracts and qualify second sources.',
    sens: sens(`Each 1 point of added duty ≈ ${smoney(-R.ts * 0.7 * 0.4 * 0.01)} margin a year until prices catch up`, -R.ts * 0.7 * 0.4 * 0.01, null, null, 'margin',
      `Revenue ${D.revTxt.ts}; cost of goods about 70% of sales; 40% of it imported (assumptions).`) });
  const dsl = S('GASDESW');
  add({ id: 'ts-freight', co: 'ts', cat: 'costs', w: 2, name: 'Diesel and freight', why: 'Diesel drives the freight cost on every delivery.',
    read: fr('GASDESW', -1), lever: 'Add fuel surcharges and consolidate shipments from Swedesboro.',
    sens: sens(`Each 10% rise in diesel ≈ ${smoney(-R.ts * 0.03 * 0.3 * 0.1)} margin a year`, -R.ts * 0.03 * 0.3 * 0.1, dsl?.chg != null ? `Today's ${chg(dsl)} ≈ ${smoney(-R.ts * 0.03 * 0.3 * dsl.chg)} margin a year` : null, dsl?.chg != null ? -R.ts * 0.03 * 0.3 * dsl.chg : null, 'margin',
      `Revenue ${D.revTxt.ts}; freight about 3% of sales; fuel about 30% of freight (assumptions).`) });
  add({ id: 'ts-debt', co: 'ts', cat: 'money', w: 3, name: 'Refinancing cost', why: 'The main loan comes due in December 2027, so credit spreads set the refinancing cost.',
    read: fr('BAMLH0A0HYM2', -1, 0.25), lever: 'Refinance early while spreads are tight.', link: ['#/ts/filings', 'Public filings'],
    sens: sens(`Each 1 point on the loan rate ≈ ${smoney(-D.tsDebt * 0.01)} a year of interest`, -D.tsDebt * 0.01, null, null, 'margin',
      `First-lien loans ${money(D.tsDebt)} est. (midpoint of the public filings range).`) });
  const hhs = (D.policy?.items || []).find(i => i.id === 'hhs'), rp = x => x ? (x.RULE || 0) + (x.PRORULE || 0) : 0;
  add({ id: 'ts-rules', co: 'ts', cat: 'policy', w: 1, name: 'Health agency rules', why: 'Health agency rules and budgets shift what labs buy.',
    read: hhs ? { v: `${num(rp(hhs.current))} health agency rules and proposals this year`, d: `${pctS(rp(hhs.prior) ? rp(hhs.current) / rp(hhs.prior) - 1 : null)} vs the same days last year`, date: `Jan 1 to ${dayWords(D.policy.windows.current[1])}`, src: 'Federal Register', url: URL_.fr, dir: 0 } : null,
    lever: 'Review new lab and research rules each quarter with the top accounts.' });

  /* BPI: public affairs and communications, DC, NYC, SF, Chicago, Europe */
  const ed = nextElection(D.today), edDays = Math.ceil((ed.d - startOfDay(D.today)) / 864e5);
  add({ id: 'bpi-vote', co: 'bpi', cat: 'calendar', w: 3, name: 'Election calendar', why: 'Election years lift issue campaigns, and a new Congress brings new policy fights.',
    read: { v: `${num(edDays)} days to Election Day`, d: `${ed.label} · the new Congress sits in January`, date: today, src: 'Federal election calendar', url: URL_.fec, dir: 1 },
    lever: 'Staff issue campaigns through Election Day, then sell new-Congress briefings for January.' });
  const allR = (D.policy?.items || []).find(i => i.id === 'all'), rChg = allR && rp(allR.prior) ? rp(allR.current) / rp(allR.prior) - 1 : null;
  add({ id: 'bpi-rules', co: 'bpi', cat: 'policy', w: 3, name: 'Federal rule-making', why: 'More federal rules mean more clients who need to be heard in Washington.',
    read: allR ? { v: `${num(rp(allR.current))} federal rules and proposals this year`, d: `${pctS(rChg)} vs the same days last year · presidential documents ${pctS(allR.prior.PRESDOCU ? allR.current.PRESDOCU / allR.prior.PRESDOCU - 1 : null)}`, date: `Jan 1 to ${dayWords(D.policy.windows.current[1])}`, src: 'Federal Register', url: URL_.fr, dir: sgn(rChg, 0.05) } : null,
    lever: 'Pitch rule-response campaigns to the industries facing the most new rules.' });
  const cp = S('CP');
  add({ id: 'bpi-profits', co: 'bpi', cat: 'demand', w: 2, name: 'Corporate profits', why: 'Company communication budgets follow profits.',
    read: fr('CP', 1, 0.03), lever: 'Push corporate reputation work while profits are high.',
    sens: sens(`Each 5% change in profits ≈ ${smoney(R.bpi * 0.6 * 0.3 * 0.05)} fees a year`, R.bpi * 0.6 * 0.3 * 0.05, cp?.chg != null ? `Today's ${chg(cp)} ≈ ${smoney(R.bpi * 0.6 * 0.3 * cp.chg)} fees a year` : null, cp?.chg != null ? R.bpi * 0.6 * 0.3 * cp.chg : null, 'sales',
      `Fee revenue ${D.revTxt.bpi} (public filings); about 60% from companies; budgets move about a third as much as profits (assumptions).`) });
  const comms = (D.fedbuy?.items || []).find(i => i.id === 'communications');
  add({ id: 'bpi-federal', co: 'bpi', cat: 'public', w: 2, name: 'Federal campaign contracts', why: 'Agencies hire PR and ad firms for public campaigns.',
    read: comms ? { v: `${money(comms.fy_totals?.[String(comms.last_full_fy)])} federal PR and ad contracts`, d: `fiscal ${comms.last_full_fy}, ${pctS(comms.chg)} vs the year before`, date: `Oct ${comms.last_full_fy - 1} to Sep ${comms.last_full_fy}`, src: 'USASpending', url: URL_.usa, dir: sgn(comms.chg, 0.05) } : null,
    lever: 'Bid agency campaigns where federal spending holds up.' });
  add({ id: 'bpi-price', co: 'bpi', cat: 'demand', w: 2, name: 'Agency pricing', why: 'Agency prices show whether clients accept higher fees.',
    read: fr('PCU541810541810', 1, 0.02), lever: 'Raise retainer rates where agency prices are rising.' });
  add({ id: 'bpi-talent', co: 'bpi', cat: 'labor', w: 2, name: 'Senior staff pay', why: 'Senior staff in Washington and New York are the main cost.',
    read: pay ? { v: `${val(pay)} professional services pay`, d: `${chg(pay)} vs a year ago · DC unemployment ${val(S('DCUR'))}`, date: asOf(pay), src: pub('CES6000000003'), url: pay.url, dir: pay.chg > 0.035 ? -1 : pay.chg < 0.025 ? 1 : 0, series: [pay, S('DCUR')].filter(Boolean) } : null,
    lever: 'Keep senior time on billable work and staff campaigns from lower-cost offices.',
    sens: sens(`Each 1% rise in staff pay ≈ ${smoney(-R.bpi * 0.55 * 0.01)} margin a year`, -R.bpi * 0.55 * 0.01, pay?.chg != null ? `Today's ${chg(pay)} ≈ ${smoney(-R.bpi * 0.55 * pay.chg)} margin a year` : null, pay?.chg != null ? -R.bpi * 0.55 * pay.chg : null, 'margin',
      `Fee revenue ${D.revTxt.bpi}; staff about 55% of fee revenue (assumption).`) });
  add({ id: 'bpi-credit', co: 'bpi', cat: 'money', w: 1, name: 'Credit for a sale', why: 'Buyers pay more when they can borrow cheaply.',
    read: fr('BAMLH0A0HYM2', -1, 0.25), lever: 'Prepare the 2027 to 2028 sale while spreads are tight.' });

  /* Fair Harbor: sustainable swim and beachwear, online and wholesale */
  const sz = season(D.today);
  add({ id: 'fh-season', co: 'fh', cat: 'calendar', w: 3, name: 'Beach season', why: 'Most swim and beachwear sales land between Memorial Day and Labor Day.',
    read: { v: sz.v, d: sz.d, date: today, src: 'Retail calendar', url: null, dir: 0 },
    lever: 'Lock wholesale orders for next summer now; push holiday gifting in the off season.' });
  const cl = S('RSCCAS');
  add({ id: 'fh-apparel', co: 'fh', cat: 'demand', w: 3, name: 'Apparel spending', why: 'Clothing store sales show how much people spend on apparel.',
    read: fr('RSCCAS', 1, 0.02), lever: 'Lean into full-price sell-through while apparel spending grows.',
    sens: sens(`Each 1% change in apparel spending ≈ ${smoney(R.fh * 0.01)} sales a year`, R.fh * 0.01, cl?.chg != null ? `Today's ${chg(cl)} ≈ ${smoney(R.fh * cl.chg)} sales a year` : null, cl?.chg != null ? R.fh * cl.chg : null, 'sales',
      `Revenue ${D.revTxt.fh} (public filings); sales move one for one with apparel spending (assumption).`) });
  add({ id: 'fh-mood', co: 'fh', cat: 'demand', w: 2, name: 'Shopper confidence', why: 'Confident shoppers buy treats like new swimwear.',
    read: fr('UMCSENT', 1, 0.05), lever: 'Lead with bundles and free returns while shoppers are cautious.' });
  add({ id: 'fh-tariff', co: 'fh', cat: 'costs', w: 3, name: 'Tariffs on imports', why: 'Most swimwear is made abroad, so duties raise the landed cost.',
    read: dutyRead(' · all US imports'),
    lever: 'Re-quote with suppliers, shift sourcing and set prices for next summer before orders lock.',
    sens: sens(`Each 10 points of added duty ≈ ${smoney(-R.fh * 0.35 * 0.9 * 0.1)} margin a year`, -R.fh * 0.35 * 0.9 * 0.1, null, null, 'margin',
      `Revenue ${D.revTxt.fh}; product cost about 35% of sales; 90% made abroad (assumptions).`) });
  add({ id: 'fh-freight', co: 'fh', cat: 'costs', w: 1, name: 'Shipping costs', why: 'Diesel and parcel surcharges raise the cost of every order shipped.',
    read: fr('GASDESW', -1), lever: 'Raise the free-shipping threshold when fuel surcharges climb.',
    sens: sens(`Each 10% rise in diesel ≈ ${smoney(-R.fh * 0.08 * 0.3 * 0.1)} margin a year`, -R.fh * 0.08 * 0.3 * 0.1, dsl?.chg != null ? `Today's ${chg(dsl)} ≈ ${smoney(-R.fh * 0.08 * 0.3 * dsl.chg)} margin a year` : null, dsl?.chg != null ? -R.fh * 0.08 * 0.3 * dsl.chg : null, 'margin',
      `Revenue ${D.revTxt.fh}; shipping about 8% of sales; fuel about 30% of shipping (assumptions).`) });
  add({ id: 'fh-weather', co: 'fh', cat: 'weather', w: 2, name: 'Spring weather', why: 'A warm spring pulls swim sales forward; a cold one pushes them back.',
    read: { v: sz.inSeason ? 'In season' : 'Off season', d: 'Watch April to June forecasts in the top coastal markets', date: today, src: 'Retail calendar', url: null, dir: 0 },
    lever: 'Move spring email and ad spend to the warmest markets week by week.' });
  const nyc = D.hz.fh;
  add({ id: 'fh-nyc', co: 'fh', cat: 'housing', w: 1, name: 'Manhattan market', why: 'Manhattan foot traffic and home buying feed the SoHo store.',
    read: nyc ? { v: `${num(nyc.pend.cur)} Manhattan homes under contract`, d: `${pctS(nyc.pend.chg)} vs a year ago · listings ${pctS(nyc.active.chg)}`, date: hz, src: 'Realtor.com county data', url: URL_.realtor, dir: sgn(nyc.pend.chg, 0.03) } : null,
    lever: 'Use the SoHo store for local events that bring neighbours in.', link: ['#/fh/market', 'Manhattan home sales'] });
  return F;
}
/** last 12 months vs the 12 before, from a monthly series' points */
function roll12(s) { const v = (s?.points || []).map(p => p[1]); if (v.length < 24) return null; const cur = v.slice(-12).reduce((a, x) => a + x, 0), prev = v.slice(-24, -12).reduce((a, x) => a + x, 0); return prev ? { cur, prev, chg: cur / prev - 1 } : null; }
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function nextElection(t) {
  const list = [['2026-11-03', 'Nov 3, 2026 midterms'], ['2028-11-07', 'Nov 7, 2028 general election'], ['2030-11-05', 'Nov 5, 2030 midterms']];
  const today = startOfDay(t); const hit = list.map(([s, label]) => ({ d: new Date(`${s}T00:00:00`), label })).find(x => x.d >= today);
  return hit || { d: today, label: 'Election Day' };
}
/** Memorial Day (last Monday in May) to Labor Day (first Monday in September) */
function season(t) {
  const md = y => { const d = new Date(y, 4, 31); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d; };
  const ld = y => { const d = new Date(y, 8, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return d; };
  const today = startOfDay(t), y = today.getFullYear(), words = d => `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (today >= md(y) && today <= ld(y)) { const n = Math.ceil((ld(y) - today) / 864e5); return { inSeason: true, v: `In season: ${n} days to Labor Day`, d: `Peak weeks for swim and beachwear until ${words(ld(y))}` }; }
  const next = today < md(y) ? md(y) : md(y + 1), n = Math.ceil((next - today) / 864e5);
  return { inSeason: false, v: `Off season: ${num(n)} days to Memorial Day`, d: `Season opens ${words(next)}; wholesale orders for it are placed this fall and winter` };
}

/* ── shared view pieces ───────────────────────────────────────────────────── */
const rank = f => Math.abs(f.sens?.nowUsd ?? f.sens?.unitUsd ?? 0);
const effectHtml = (s, short) => !s ? '<span class="dim small">Not sized</span>' : `${s.now ? `<div class="small"><b>${h(s.now)}</b> ${EST}</div>` : ''}${!short || !s.now ? `<div class="small text-2">${h(s.unit)}${s.now ? '' : ` ${EST}`}</div>` : ''}`;
const readHtml = r => `<div class="small strong">${h(r.v)}</div>${r.d ? `<div class="small text-2">${h(r.d)}</div>` : ''}${r.src ? `<div class="sg-src">${r.url ? `<a href="${h(r.url)}" target="_blank" rel="noopener">${h(r.src)}</a>` : h(r.src)}${r.date ? ` · ${h(r.date)}` : ''}</div>` : ''}`;
function openFactor(ctx, f) {
  const { ui, inspector } = ctx;
  inspector.open({ title: h(f.name), sub: `${h(CO_NAME[f.co])} · ${h(CAT_NAME[f.cat])} · ${W_TXT[f.w]} importance`, color: `var(--co-${f.co})`, sections: [
    { label: 'Why it matters', html: `<div class="small">${h(f.why)}</div>` },
    { label: 'Reading now', html: `${readHtml(f.read)}<div class="mt-8">${dirChip(f.read.dir)}</div>` },
    ...(f.read.series || []).length > 1 ? [{ label: 'Series behind it', html: `<div class="col gap-8">${f.read.series.map(s => `<div class="small"><b>${h(s.label)}</b>: ${h(val(s))} <span class="text-2">${h(chg(s))} vs a year ago · ${h(asOf(s))}</span> <a class="dim" href="${h(s.url)}" target="_blank" rel="noopener" aria-label="Source">↗</a></div>`).join('')}</div>` }] : [],
    { label: 'What to do', html: `<div class="small">${h(f.lever)}</div>` },
    f.sens ? { label: 'Size of the effect', html: `${effectHtml(f.sens)}<div class="small dim mt-8">${h(f.sens.assume)}</div>` } : null,
  ].filter(Boolean), actions: [...(f.link ? [{ label: f.link[1], href: f.link[0] }] : []), ...(f.read.url ? [{ label: 'Source ↗', href: f.read.url }] : [])] });
}
const sourcesFoot = (ui, D) => `${ui.source('FRED (Freddie Mac, BLS, Census, FHFA, EIA and others) · US Treasury · Realtor.com · NIH RePORTER · USASpending · Federal Register · EPA ECHO · National Weather Service · Census ACS · company filings estimates', '#/signals/readings', D.fredSnap ? dayWords(String(D.fredSnap.fetched_at).slice(0, 10)) : null)}<div class="sys-muted">est. = built from public data and the stated assumptions, not company-reported</div>`;

/* ── view 1: what moves sales ─────────────────────────────────────────────── */
async function overview(ctx) {
  const { el, ui, app } = ctx; injectCss();
  const D = await loadAll(ctx); if (!el.isConnected) return;
  const F = buildFactors(D);
  const big3 = F.filter(f => f.w >= 2);
  const hurts = big3.filter(f => f.read.dir < 0), helps = big3.filter(f => f.read.dir > 0);
  // the lead names what moved most today: forces sized at today's reading first, then importance
  const nowAbs = f => Math.abs(f.sens?.nowUsd ?? 0);
  const byRank = a => a.slice().sort((x, y) => nowAbs(y) - nowAbs(x) || y.w - x.w || rank(y) - rank(x));
  const topHurt = byRank(hurts)[0], topHelp = byRank(helps)[0];
  const sized = F.filter(f => f.sens && (f.sens.nowUsd != null));
  const worst = sized.filter(f => f.sens.nowUsd < 0).sort((a, b) => a.sens.nowUsd - b.sens.nowUsd)[0];
  const best = sized.filter(f => f.sens.nowUsd > 0).sort((a, b) => b.sens.nowUsd - a.sens.nowUsd)[0];
  const mort = D.fred.get('MORTGAGE30US');
  const co0 = COS.some(c => c.id === ctx.params.co) ? ctx.params.co : 'pp';
  const ed = F.find(f => f.id === 'bpi-vote');
  el.innerHTML = `<div class="m-signals">${ui.pageHead({
    title: 'What moves sales',
    sub: `Weather is one force among many. Right now the biggest drag is ${h(topHurt ? Copy.sentence(topHurt.name) : 'none')}${topHurt ? ` at ${h(CO_NAME[topHurt.co])}` : ''}; the biggest lift is ${h(topHelp ? Copy.sentence(topHelp.name) : 'none')}${topHelp ? ` at ${h(CO_NAME[topHelp.co])}` : ''}.`,
    actions: `<a class="${ui.btnCls('secondary', '')}" href="#/signals/levers">Sales levers</a><a class="${ui.btnCls('secondary', '')}" href="#/signals/readings">Live readings</a>`,
  })}
  ${ui.kpis([
    { label: 'Forces hurting now', value: `${hurts.length} <small class="sg-kpi-of">of ${big3.length}</small>`, sub: `${helps.length} helping · the rest steady`, color: 'var(--sys-bad)' },
    { label: 'Largest margin hit (est.)', value: worst ? `${smoney(worst.sens.nowUsd)}` : '—', sub: worst ? `${h(CO_NAME[worst.co])} · ${h(Copy.sentence(worst.name))}, a year` : 'not sized' },
    { label: 'Largest sales lift (est.)', value: best ? `${smoney(best.sens.nowUsd)}` : '—', sub: best ? `${h(CO_NAME[best.co])} · ${h(Copy.sentence(best.name))}, a year` : 'not sized' },
    { label: 'Mortgage rate', value: mort ? val(mort) : '—', sub: mort ? `${h(chg(mort))} in a year · fewer home sales` : 'not available', spark: mort ? ctx.charts.sparkline(mort.points.map(p => p[1]), { color: 'var(--sys-bad)' }) : '' },
    { label: 'Days to Election Day', value: ed ? h(ed.read.v.split(' ')[0]) : '—', sub: 'BPI busy season', color: 'var(--co-bpi)' },
  ])}
  <div class="mt-12">${ui.panel({ title: 'What moves each company', sub: 'Rows are forces, columns are companies. Click a cell for the readings behind it.', body: `<div id="sg-matrix"></div>`, flush: true, foot: sourcesFoot(ui, D) })}</div>
  <div class="mt-12">${ui.panel({ title: 'Forces by company', sub: 'Why each force matters, today’s reading, the move and its size. Click a row for detail.', actions: '<div id="sg-co"></div>', body: '<p class="sg-co-lead" id="sg-co-lead"></p><div id="sg-tbl"></div>', flush: true, foot: sourcesFoot(ui, D) })}</div>
  <div class="mt-12">${ui.panel({ title: 'What to do now', sub: 'The moves that matter most this month, largest effect first', body: `<ol class="sg-actions" id="sg-actions"></ol>`, foot: `<span class="sys-muted">Effects are estimates ${EST}. Sales levers shows every assumption.</span>` })}</div>
  </div>`;
  const root = el.querySelector('.m-signals');

  // matrix: force categories × companies; a cell's colour is the importance-weighted net of its factors
  const cell = (co, cat) => {
    const fs = F.filter(f => f.co === co && f.cat === cat); if (!fs.length) return '<td class="sg-none" aria-label="Not a main force">·</td>';
    const net = fs.reduce((a, f) => a + f.read.dir * f.w, 0), mixed = fs.some(f => f.read.dir > 0) && fs.some(f => f.read.dir < 0);
    const st = mixed && Math.abs(net) < 2 ? ['Mixed', 'warn'] : net > 0 ? ['Helps', 'good'] : net < 0 ? ['Hurts', 'bad'] : ['Steady', ''];
    const w = Math.max(...fs.map(f => f.w));
    return `<td><button type="button" class="sys-chip${st[1] ? ` sys-chip--${st[1]}` : ''} sg-cell${w === 3 ? ' hi' : ''}" data-co="${co}" data-cat="${cat}" title="${h(fs.map(f => `${f.name}: ${f.read.v}`).join(' · '))}" aria-label="${h(`${CO_NAME[co]}, ${CAT_NAME[cat]}: ${st[0]}, ${W_TXT[w].toLowerCase()} importance`)}">${st[0]}${w === 3 ? ' <span class="w" aria-hidden="true">●</span>' : ''}</button></td>`;
  };
  root.querySelector('#sg-matrix').innerHTML = `<div class="sys-table-wrap sg-mwrap"><table class="sys-table sg-matrix"><thead><tr><th>Force</th>${COS.map(c => `<th><span class="sys-dot" data-co="${c.id}" style="--co:var(--co-${c.id})" aria-hidden="true"></span> ${h(c.name)}</th>`).join('')}</tr></thead><tbody>${CATS.filter(([cat]) => F.some(f => f.cat === cat)).map(([cat, name]) => `<tr><td>${h(name)}</td>${COS.map(c => cell(c.id, cat)).join('')}</tr>`).join('')}</tbody></table></div><p class="sg-legend small text-2"><span class="w">●</span> high importance · grey dot = not a main force for that company</p>`;
  root.querySelectorAll('.sg-cell').forEach(b => { b.onclick = () => { const fs = F.filter(f => f.co === b.dataset.co && f.cat === b.dataset.cat); if (fs.length === 1) return openFactor(ctx, fs[0]); ctx.inspector.open({ title: `${h(CO_NAME[b.dataset.co])} · ${h(CAT_NAME[b.dataset.cat])}`, sub: `${fs.length} forces`, color: `var(--co-${b.dataset.co})`, sections: fs.map(f => ({ label: f.name, html: `${readHtml(f.read)}<div class="mt-8">${dirChip(f.read.dir)}</div><div class="small mt-8"><b>Do:</b> ${h(f.lever)}</div>${f.sens ? `<div class="mt-8">${effectHtml(f.sens, true)}</div>` : ''}` })) }); }; });

  // action list: high and medium forces that hurt or help now, largest estimated effect first
  const acts = byRank([...hurts, ...helps]).slice(0, 8);
  root.querySelector('#sg-actions').innerHTML = acts.map((f, i) => `<li><span class="n">${i + 1}</span><div><div class="row wrap">${coChip(f.co)}${dirChip(f.read.dir)}</div><div class="small strong mt-8">${h(f.lever)}</div><div class="small text-2">${h(f.name)}: ${h(f.read.v)}${f.read.d ? ` (${h(f.read.d.split(' · ')[0])})` : ''}</div>${f.sens?.now ? `<div class="small">${h(f.sens.now)} ${EST}</div>` : ''}<button type="button" class="sys-link sg-more" data-id="${f.id}">Details</button></div></li>`).join('') || `<li>${ui.empty('No strong signals today')}</li>`;
  root.querySelectorAll('.sg-more').forEach(b => { b.onclick = () => openFactor(ctx, F.find(f => f.id === b.dataset.id)); });

  // company table
  const cols = [
    { key: 'name', label: 'Force', wrap: true, width: '240px', fmt: (v, r) => `<div class="strong">${h(v)}</div><div class="sg-why">${h(r.why)}</div>` },
    { key: 'reading', label: 'Reading now', wrap: true, width: '260px', fmt: (v, r) => readHtml(r.read) },
    { key: 'effect_now', label: 'Today', fmt: (v, r) => `${dirChip(r.read.dir)}<div class="small dim mt-8">${W_TXT[r.w]} importance</div>` },
    { key: 'lever', label: 'What to do', wrap: true, width: '240px', fmt: (v, r) => `<div class="small">${h(v)}</div>${r.link ? `<a class="small" href="${h(r.link[0])}">${h(r.link[1])} →</a>` : ''}` },
    { key: 'size', label: 'Size (est.)', wrap: true, width: '220px', fmt: (v, r) => effectHtml(r.sens, true) },
  ];
  let tbl = null;
  const draw = co => {
    const rows = F.filter(f => f.co === co).map(f => ({ ...f, reading: `${f.read.v}${f.read.d ? ` (${f.read.d})` : ''}${f.read.src ? ` · ${f.read.src}${f.read.date ? `, ${f.read.date}` : ''}` : ''}`, effect_now: DIR[f.read.dir].t, size: f.sens ? `${f.sens.now || ''}${f.sens.now ? '. ' : ''}${f.sens.unit} (est.; ${f.sens.assume})` : '', _w: f.w * 10 + (f.read.dir < 0 ? 2 : f.read.dir > 0 ? 1 : 0) }));
    const hu = rows.filter(r => r.read.dir < 0).length, he = rows.filter(r => r.read.dir > 0).length;
    root.querySelector('#sg-co-lead').innerHTML = `<b>${h(CO_NAME[co])}</b>: ${rows.length} forces tracked, ${hu} hurting and ${he} helping now. Revenue ${h(D.revTxt[co])} from public filings.`;
    const host = root.querySelector('#sg-tbl');
    if (window.matchMedia('(max-width: 600px)').matches) {   // phone: one card per force instead of a five-column table
      tbl = null;
      host.innerHTML = `<ul class="sg-cards">${rows.sort((a, b) => b._w - a._w).map(r => `<li><div class="sg-card" role="button" tabindex="0" data-id="${r.id}"><span class="row wrap"><span class="strong">${h(r.name)}</span>${dirChip(r.read.dir)}<span class="small dim">${W_TXT[r.w]}</span></span><span class="sg-why">${h(r.why)}</span><span class="sg-card-read">${readHtml(r.read)}</span><span class="small"><b>Do:</b> ${h(r.lever)}</span>${r.sens ? `<span class="sg-card-size">${effectHtml(r.sens, true)}</span>` : ''}</div></li>`).join('')}</ul>`;
      host.querySelectorAll('.sg-card').forEach(b => { b.onclick = e => { if (!e.target.closest('a')) openFactor(ctx, F.find(f => f.id === b.dataset.id)); }; b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); b.onclick(e); } }; });
      return;
    }
    const cfg = { columns: cols, rows, pageSize: 20, sortKey: '_w', exportName: `local_signals_${co}`, onRow: r => openFactor(ctx, F.find(f => f.id === r.id)) };
    if (tbl) tbl.update(rows); else tbl = ui.table(host, cfg);
  };
  ui.seg(root.querySelector('#sg-co'), COS.map(c => ({ value: c.id, label: c.name })), co0, v => draw(v));
  draw(co0);
  app.index(F.map(f => ({ label: f.name, sub: `${CO_NAME[f.co]} · local signal`, href: `#/signals/overview?co=${f.co}`, kind: 'Signal', color: `var(--co-${f.co})` })));
}

/* ── view 2: sales levers ─────────────────────────────────────────────────── */
async function levers(ctx) {
  const { el, ui, charts } = ctx; injectCss();
  const D = await loadAll(ctx); if (!el.isConnected) return;
  const F = buildFactors(D).filter(f => f.sens);
  const now = F.filter(f => f.sens.nowUsd != null).sort((a, b) => Math.abs(b.sens.nowUsd) - Math.abs(a.sens.nowUsd));
  const top = now[0];
  const salesL = F.filter(f => f.sens.kind === 'sales'), marginL = F.filter(f => f.sens.kind === 'margin');
  const sum = (a, k) => a.reduce((s, f) => s + (f.sens[k] || 0), 0);
  el.innerHTML = `<div class="m-signals">${ui.pageHead({
    title: 'Sales levers',
    sub: `Each lever is sized from public data and a stated assumption. The largest today is ${top ? `${h(Copy.sentence(top.name))} at ${h(CO_NAME[top.co])}, about ${smoney(top.sens.nowUsd)} a year` : 'not available'} ${EST}.`,
    actions: `<a class="${ui.btnCls('secondary', '')}" href="#/signals/overview">What moves sales</a>`,
  })}
  ${ui.kpis([
    { label: 'Sales levers sized', value: String(salesL.length), sub: `today’s net ${smoney(sum(salesL, 'nowUsd'))} a year (est.)`, color: 'var(--sys-good)' },
    { label: 'Margin risks sized', value: String(marginL.length), sub: `today’s net ${smoney(sum(marginL, 'nowUsd'))} a year (est.)`, color: 'var(--sys-bad)' },
    { label: 'Largest today (est.)', value: top ? smoney(top.sens.nowUsd) : '—', sub: top ? `${h(CO_NAME[top.co])} · ${h(Copy.sentence(top.name))}` : '' },
    { label: 'Biggest step lever (est.)', value: (() => { const b = F.slice().sort((a, c) => Math.abs(c.sens.unitUsd || 0) - Math.abs(a.sens.unitUsd || 0))[0]; return b ? smoney(b.sens.unitUsd) : '—'; })(), sub: (() => { const b = F.slice().sort((a, c) => Math.abs(c.sens.unitUsd || 0) - Math.abs(a.sens.unitUsd || 0))[0]; return b ? `${h(CO_NAME[b.co])} · ${h(b.sens.unit.split(' ≈ ')[0].replace(/^Each/, 'each'))}` : ''; })() },
  ])}
  <div class="mt-12">${ui.panel({ title: 'Effect of today’s readings', sub: 'A year of sales or margin at today’s change vs a year ago (est.)', body: `<div id="lv-chart"></div>`, foot: `<span class="sys-muted">Green adds sales, red costs margin. Assumptions are in the table below.</span>` })}</div>
  <div class="mt-12">${ui.panel({ title: 'Every sized lever', sub: 'Click a row for the reading, the assumption and the move', body: '<div id="lv-tbl"></div>', flush: true, foot: sourcesFoot(ui, D) })}</div>
  <div class="mt-12">${ui.note(`Every figure here is an estimate ${EST} from public readings and the assumptions shown. Revenue points come from each company’s public filings estimates (updated ${h(dayWords(D.finDate))}). Swap in company numbers to firm them up.`, 'warn')}</div>
  </div>`;
  const root = el.querySelector('.m-signals');
  const bars = now.slice(0, 14).map(f => ({ label: `${CO_NAME[f.co]} · ${f.name}`, value: Math.abs(f.sens.nowUsd), color: f.sens.nowUsd >= 0 ? 'var(--sys-good)' : 'var(--sys-bad)' }));
  root.querySelector('#lv-chart').innerHTML = bars.length ? charts.hbar(bars, { fmt: v => money(v), labelW: window.innerWidth < 600 ? 150 : 300 }) : ui.empty('No live changes to size today');
  const rows = F.map(f => ({ ...f, co_name: CO_NAME[f.co], today: f.sens.nowUsd, step: f.sens.unitUsd, kind_txt: f.sens.kind === 'sales' ? 'Sales' : 'Margin', step_txt: f.sens.unit, today_txt: f.sens.now || '', assume: f.sens.assume, _abs: Math.abs(f.sens.nowUsd ?? 0) }));
  ui.table(root.querySelector('#lv-tbl'), { rows, pageSize: 25, sortKey: '_abs', exportName: 'local_signals_levers', onRow: r => openFactor(ctx, F.find(f => f.id === r.id)), columns: [
    { key: 'co_name', label: 'Company', fmt: (v, r) => coChip(r.co) },
    { key: 'name', label: 'Lever', wrap: true, width: '200px', fmt: (v, r) => `<div class="strong small">${h(v)}</div><div class="small text-2">${h(r.lever)}</div>` },
    { key: 'today', label: 'Today (est.)', num: true, fmt: v => v == null ? '<span class="dim small">no live change</span>' : `<span class="${v >= 0 ? 'sg-pos' : 'sg-neg'}">${smoney(v)}</span>` },
    { key: 'step', label: 'Per step (est.)', wrap: true, width: '220px', fmt: (v, r) => `<div class="small">${h(r.sens.unit)}</div>` },
    { key: 'kind_txt', label: 'Type', fmt: v => `<span class="small">${h(v)}</span>` },
    { key: 'assume', label: 'Assumptions', wrap: true, width: '260px', fmt: v => `<div class="small text-2">${h(v)}</div>` },
  ] });
}

/* ── view 3: live readings ────────────────────────────────────────────────── */
const GROUPS = [['financing', 'Rates and credit'], ['housing', 'Housing and building'], ['costs', 'Input costs'], ['labor', 'Labor and pay'], ['demand', 'Customer demand']];
const id2pub = id => id === 'CUSTOMS' ? 'US Treasury' : PUB[id] || 'Bureau of Labor Statistics';
const USES = { MORTGAGE30US: 'pp cet', BAMLH0A0HYM2: 'fl ts bpi', DPRIME: 'pp cet', EXHOSLUSM495S: 'pp cet', HOUST: 'pp', TLNRESCONS: 'cet', PASTHPI: 'pp', NJSTHPI: 'pp', MASTHPI: 'cet', CTSTHPI: 'cet', PCU333415333415: 'pp', PCOPPUSDM: 'cet', PCU335311335311: 'cet', PCU3353133531: 'cet', PCU334516334516: 'ts', GASREGW: 'pp', GASDESW: 'ts fh', APU000072610: 'cet', APU000072511: 'pp', CUSTOMS: 'ts fh', CES2023800001: 'pp cet', JTS2300JOL: 'cet', CES2000000003: 'pp cet', CES6000000003: 'fl bpi', CES6054150001: 'fl', PAUR: 'pp', NJUR: 'pp', MAUR: 'cet', CTUR: 'cet', DCUR: 'bpi', MOUR: 'fl', UMCSENT: 'fh', RSCCAS: 'fh', CES6054110001: 'fl', PCU541110541110: 'fl', CES6562200001: 'ts', PCU541810541810: 'bpi', CP: 'bpi' };
async function readings(ctx) {
  const { el, ui, charts } = ctx; injectCss();
  const D = await loadAll(ctx); if (!el.isConnected) return;
  const S = [...D.fred.values()];
  const fredDay = D.fredSnap ? dayWords(String(D.fredSnap.fetched_at).slice(0, 10)) : null;
  const moves = S.filter(s => s.chg_kind === 'pct' && s.chg != null).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 3);
  const k = (id, label, color) => { const s = D.fred.get(id); return { label, value: s ? val(s).replace(/ a (gallon|ton|month|year)$/, '').replace(/ an hour$/, '/hr').replace(/ \(index\)$/, '') : '—', sub: s ? `${h(chg(s))} in a year · ${h(asOf(s))}` : 'not available', spark: s ? charts.sparkline(s.points.map(p => p[1]), { color }) : '', color }; };
  el.innerHTML = `<div class="m-signals">${ui.pageHead({
    title: 'Live readings',
    sub: S.length ? `Every reading here is public and refreshed each night. The biggest moves in a year: ${moves.map(s => `${h(Copy.sentence(s.label.split(',')[0]))} ${h(pctS(s.chg, 0))}`).join(', ')}.` : 'The nightly readings are not available right now.',
    actions: `<a class="${ui.btnCls('secondary', '')}" href="#/signals/overview">What moves sales</a>`,
  })}
  ${!S.length ? ui.note('The nightly economic readings did not load. Other panels still show what is available.', 'warn') : ''}
  ${ui.kpis([k('MORTGAGE30US', 'Mortgage rate', 'var(--co-pp)'), k('PCOPPUSDM', 'Copper, per ton', 'var(--co-cet)'), k('GASDESW', 'Diesel, per gallon', 'var(--co-ts)'), k('CES2000000003', 'Construction pay', 'var(--co-pp)'), k('CUSTOMS', 'Tariffs collected, a month', 'var(--co-fh)')])}
  <div class="mt-12">${ui.panel({ title: 'Economy and costs', sub: 'Latest reading, change in a year and the last two years. Pick a group.', actions: '<div id="rd-grp"></div>', body: '<div id="rd-tbl"></div>', flush: true, foot: `${ui.source('FRED, Federal Reserve Bank of St. Louis (publisher named on each row); US Treasury for tariffs', URL_.fred, fredDay)}` })}</div>
  <div class="mt-12">${ui.panel({ title: 'Housing market by county', sub: `New listings, homes under contract and days on market in each portfolio company’s counties, ${h(D.housing ? monthWords(D.housing.month) : '')}`, body: '<div id="rd-hz"></div>', flush: true, foot: `${ui.source('Realtor.com county inventory data', URL_.realtor, D.housing ? monthWords(D.housing.month) : null)} · <span class="sys-muted">a change of more than 150% in a year is shown as a method change</span>` })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'NIH research awards', sub: D.nih ? `Dollars awarded Jan 1 to ${h(dayWords(D.nih.windows.current[1]))}, vs the same days last year` : '', body: '<div id="rd-nih"></div>', foot: ui.source('NIH RePORTER (sub-awards excluded)', URL_.nih, D.nih ? dayWords(String(D.nih.fetched_at).slice(0, 10)) : null) })}
    ${ui.panel({ title: 'Largest NIH-funded institutions', sub: 'In those states, this year to date · Thomas Scientific research accounts', body: '<div id="rd-org"></div>', flush: true, foot: ui.source('NIH RePORTER', URL_.nih, D.nih ? dayWords(String(D.nih.fetched_at).slice(0, 10)) : null) })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Federal buying by month', sub: 'Contract dollars obligated each month for three portfolio buying lines', body: '<div id="rd-fed"></div>', foot: ui.source('USASpending', URL_.usa, D.fedbuy ? dayWords(String(D.fedbuy.fetched_at).slice(0, 10)) : null) })}</div>
  <div class="mt-12">${ui.panel({ title: 'Federal rule-making', sub: 'Rules and proposed rules so far this year vs the same days last year', body: '<div id="rd-fr"></div>', flush: true, foot: ui.source('Federal Register', URL_.fr, D.policy ? dayWords(D.policy.windows.current[1]) : null) })}</div>
  </div>`;
  const root = el.querySelector('.m-signals');
  // economy and costs: one table, filtered by group
  const coOf = id => String(USES[id] || '').split(' ').filter(Boolean);
  const rrows = S.map(s => ({ ...s, latest: val(s), change: chg(s), as_of: asOf(s), publisher: id2pub(s.id), companies: coOf(s.id).map(c => CO_NAME[c]).join(', '), group_name: (GROUPS.find(g => g[0] === s.group) || [, ''])[1], _abs: s.chg == null ? null : Math.abs(s.chg_kind === 'pts' ? s.chg / 2 : s.chg) }));
  let rt = null;
  const drawR = g => { const rows = g === 'all' ? rrows : rrows.filter(r => r.group === g); if (rt) return rt.update(rows); rt = ui.table(root.querySelector('#rd-tbl'), { rows, pageSize: 40, sortKey: '_abs', exportName: 'local_signals_readings', onRow: r => r.url && window.open(r.url, '_blank', 'noopener'), columns: [
    { key: 'label', label: 'Reading', wrap: true, fmt: (v, r) => `<div class="strong small">${h(v)}</div><div class="sg-src">${h(r.publisher)} · ${h(r.as_of)}${r.stale ? ' · kept from the last good night' : ''} · ${coOf(r.id).map(c => h(CO_NAME[c])).join(', ')}</div>` },
    { key: 'latest', label: 'Latest', num: true, fmt: v => h(v) },
    { key: 'change', label: 'vs a year ago', num: true, fmt: (v, r) => `<span class="${r.chg == null ? '' : (r.chg >= 0 ? 'sg-up' : 'sg-down')}">${h(v || '—')}</span>` },
    { key: 'points', label: 'Last two years', fmt: (v, r) => `<span class="sg-spark">${charts.sparkline((v || []).map(p => p[1]), { w: 96, h: 26, color: `var(--co-${coOf(r.id)[0] || 'pp'})` })}</span>` },
    { key: 'as_of', label: 'As of', num: true, fmt: v => `<span class="small">${h(v)}</span>` },
  ] }); };
  ui.seg(root.querySelector('#rd-grp'), [{ value: 'all', label: 'All' }, ...GROUPS.map(([v, l]) => ({ value: v, label: l }))], 'all', drawR);
  drawR('all');
  // Federal Register
  const P = D.policy?.items || [], rp = x => x ? (x.RULE || 0) + (x.PRORULE || 0) : 0;
  root.querySelector('#rd-fr').innerHTML = P.length ? `<div class="sys-table-wrap"><table class="sys-table"><thead><tr><th>Agency</th><th class="sys-n">This year</th><th class="sys-n">Last year</th><th class="sys-n">Change</th></tr></thead><tbody>${P.map(r => `<tr><td>${h(r.label)}<div class="sg-src">${(r.cos || []).map(c => h(CO_NAME[c])).join(', ')}</div></td><td class="sys-n">${num(rp(r.current))}</td><td class="sys-n">${num(rp(r.prior))}</td><td class="sys-n">${pctS(rp(r.prior) ? rp(r.current) / rp(r.prior) - 1 : null)}</td></tr>`).join('')}<tr><td>Presidential documents<div class="sg-src">BPI</div></td><td class="sys-n">${num(P[0]?.current?.PRESDOCU)}</td><td class="sys-n">${num(P[0]?.prior?.PRESDOCU)}</td><td class="sys-n">${pctS(P[0]?.prior?.PRESDOCU ? P[0].current.PRESDOCU / P[0].prior.PRESDOCU - 1 : null)}</td></tr></tbody></table></div>` : ui.empty('Not available');
  // housing by county
  const brk = y => y != null && Math.abs(y) > 1.5;
  const yy = y => y == null ? '<span class="dim">—</span>' : brk(y) ? '<span class="dim small">method change</span>' : `<span class="${y >= 0 ? 'sg-pos' : 'sg-neg'}">${pctS(y)}</span>`;
  const hz = (D.housing?.items || []).map(r => ({ ...r, co_list: (r.cos || []).map(c => CO_NAME[c]).join(', '), place: `${r.county}, ${r.state}`, _pend_yy: brk(r.pending_yy) ? null : r.pending_yy }));
  if (hz.length) ui.table(root.querySelector('#rd-hz'), { rows: hz, pageSize: 15, sortKey: 'new', exportName: 'local_signals_county_housing', columns: [
    { key: 'place', label: 'County', fmt: (v, r) => `<div class="strong small">${h(v)}</div>${r.quality_flag ? '<div class="sg-src">flagged as less reliable this month</div>' : ''}` },
    { key: 'co_list', label: 'Company', fmt: (v, r) => `<div class="row wrap">${(r.cos || []).map(coChip).join('')}</div>` },
    { key: 'new', label: 'New listings', num: true, fmt: (v, r) => `${num(v)}<div class="small">${yy(r.new_yy)}</div>` },
    { key: 'pending', label: 'Under contract', num: true, fmt: (v, r) => `${num(v)}<div class="small">${yy(r.pending_yy)}</div>` },
    { key: 'dom', label: 'Days on market', num: true, fmt: v => num(v) },
    { key: 'price', label: 'Median list price', num: true, fmt: (v, r) => `${money(v)}<div class="small text-2">${pctS(r.price_yy)}</div>` },
  ] }); else root.querySelector('#rd-hz').innerHTML = ui.empty('County housing data not available');
  // NIH
  const N = D.nih?.items || [];
  root.querySelector('#rd-nih').innerHTML = N.length ? charts.hbar(N.slice().sort((a, b) => b.current_amount - a.current_amount).map(s => ({ label: `${s.state} · ${pctS(s.prior_amount ? s.current_amount / s.prior_amount - 1 : null)} vs last year`, value: s.current_amount, color: 'var(--co-ts)' })), { fmt: v => money(v), labelW: 170 }) : ui.empty('NIH awards not available');
  const O = D.nih?.top_orgs || [];
  root.querySelector('#rd-org').innerHTML = O.length ? `<div class="sys-table-wrap"><table class="sys-table"><thead><tr><th>Institution</th><th class="sys-n">This year</th><th class="sys-n">Change</th></tr></thead><tbody>${O.slice(0, 12).map(o => `<tr><td class="small">${h(titleCase(o.org))}<div class="sg-src">${h(o.city)}, ${h(o.state)} · ${num(o.current_n)} awards</div></td><td class="sys-n">${money(o.current)}</td><td class="sys-n"><span class="${o.current >= o.prior ? 'sg-pos' : 'sg-neg'}">${pctS(o.prior ? o.current / o.prior - 1 : null)}</span></td></tr>`).join('')}</tbody></table></div>` : ui.empty('Not available');
  // federal buying
  const B = D.fedbuy?.items || [];
  const SEGC = { lab_supplies: 'var(--co-ts)', communications: 'var(--co-bpi)', trades_northeast: 'var(--co-cet)' };
  const last24 = B.length ? [...new Set(B.flatMap(b => b.months.map(m => m[0])))].sort().slice(-25, -1) : [];
  root.querySelector('#rd-fed').innerHTML = B.length ? `${charts.line(B.map(b => ({ name: b.label, color: SEGC[b.id], points: last24.map(m => [monthWords(m), Math.max(0, (b.months.find(x => x[0] === m) || [0, null])[1])]) })), { h: 220, fmt: v => money(v), xLabels: last24.map(m => /-(01|04|07|10)$/.test(m) ? monthWords(m).replace(/ 20(\d\d)$/, " ’$1") : '') })}
    <div class="sys-chips mt-8">${B.map(b => `<span class="sys-chip sys-chip--soft" data-co="" style="--co:${SEGC[b.id]}">${h(b.label)}</span>`).join('')}</div>
    <div class="sys-table-wrap mt-12"><table class="sys-table"><thead><tr><th>Buying line</th><th class="sys-n">Fiscal ${B[0].last_full_fy - 1}</th><th class="sys-n">Fiscal ${B[0].last_full_fy}</th><th class="sys-n">Change</th></tr></thead><tbody>${B.map(b => `<tr><td>${h(b.label)}<div class="sg-src">${(b.cos || []).map(c => h(CO_NAME[c])).join(', ')} · ${h(b.basis)}</div></td><td class="sys-n">${money(b.fy_totals[String(b.last_full_fy - 1)])}</td><td class="sys-n">${money(b.fy_totals[String(b.last_full_fy)])}</td><td class="sys-n"><span class="${(b.chg || 0) >= 0 ? 'sg-pos' : 'sg-neg'}">${pctS(b.chg)}</span></td></tr>`).join('')}</tbody></table></div><p class="small text-2 mt-8">Fiscal years run October to September. Months below zero (when earlier awards are cut) are drawn at zero.</p>` : ui.empty('Federal buying not available');
}
const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Of|At|And|The)\b/g, m => m.toLowerCase()).replace(/^./, c => c.toUpperCase()).replace(/\bUniv\b/g, 'University');

export default {
  id: 'signals', name: 'Local signals', tag: 'Live', color: 'var(--sys-brand)', group: 'Command',
  tagline: 'The local and market forces that move each company’s sales and margins, weather included',
  views: [
    { id: 'overview', name: 'What moves sales', icon: '◎', render: overview },
    { id: 'levers', name: 'Sales levers', icon: '◆', render: levers },
    { id: 'readings', name: 'Live readings', icon: '∿', render: readings },
  ],
  tour: [
    { order: 125, hash: '#/signals/overview', caption: '<b>What moves sales.</b> Weather is one force. Home sales, pay, prices, rates, grants and elections move sales too.', narration: 'Weather is one force. Home sales, pay, prices, rates, grants and elections move sales too.', duration: 8000 },
    { order: 126, hash: '#/signals/levers', caption: '<b>Sales levers.</b> Each force sized in dollars, with its assumption shown.', narration: 'Each lever is sized in dollars from public data, with the assumption shown.', duration: 7000 },
    { order: 127, hash: '#/signals/readings', caption: '<b>Live readings.</b> Rates, costs, labor, housing, grants and federal buying, refreshed every night.', narration: 'Every reading is public and refreshed nightly: rates, costs, labor, housing, grants and federal buying.', duration: 7500 },
  ],
};
