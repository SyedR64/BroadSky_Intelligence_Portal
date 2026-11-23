import * as Copy from './copy.js?v=20261117223642';
/* ═══════════════════════════════════════════════════════════════════════════
   Filings & financials — portfolio-wide financial and regulatory intelligence.
   BSP's own SEC filings (Form D / ADV), each company's value, debt, marks and public
   financial picture, and public comparables. Exports the value-and-exit row builder
   (loadScoreboard, templateExit) that the Command Center's short table also draws from.
   ═══════════════════════════════════════════════════════════════════════════ */

const COS = [
  { id: 'cet', ds: 'cet_filings', name: 'Commonwealth Electrical (CET)', short: 'CET', color: 'var(--co-cet)', ledger: /Commonwealth|\bCET\b/i, sector: 'commercial_electrical_energy' },
  { id: 'pp', ds: 'pp_filings', name: 'Punctual Pros', short: 'PP', color: 'var(--co-pp)', ledger: /Punctual/i, sector: 'residential_home_services' },
  { id: 'fl', ds: 'frontline_filings', name: 'Frontline Managed Services', short: 'FL', color: 'var(--co-fl)', ledger: /Frontline/i, sector: 'legal_bpo_managed_services' },
  { id: 'ts', ds: 'thomas_filings', name: 'Thomas Scientific', short: 'TS', color: 'var(--co-ts)', ledger: /Thomas/i, sector: 'lab_distribution' },
  { id: 'bpi', ds: 'bpi_filings', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--co-bpi)', ledger: /Bully|\bBPI\b/i, sector: 'communications_agencies' },
  { id: 'fh', ds: 'fairharbor_filings', name: 'Fair Harbor', short: 'FH', color: 'var(--co-fh)', ledger: /Fair Harbor/i, sector: 'apparel_dtc' },
];
const RIVAL = { id: 'rival', name: 'Rival companies', short: 'Rival', color: 'var(--c-pe)' };
const SECTORS = {
  residential_home_services: { label: 'Residential home services', co: 'pp' },
  commercial_electrical_energy: { label: 'Commercial electrical & energy', co: 'cet' },
  legal_bpo_managed_services: { label: 'Legal / BPO managed services', co: 'fl' },
  lab_distribution: { label: 'Lab distribution', co: 'ts' },
  communications_agencies: { label: 'Communications agencies', co: 'bpi' },
  apparel_dtc: { label: 'Apparel DTC', co: 'fh' },
};
const OVERLAP = {
  punctual_pros: { co: 'pp', label: 'vs Punctual Pros', sector: 'Residential services' },
  cet: { co: 'cet', label: 'vs CET', sector: 'Commercial electrical' },
  frontline: { co: 'fl', label: 'vs Frontline', sector: 'Legal managed services' },
  thomas_scientific: { co: 'ts', label: 'vs Thomas Scientific', sector: 'Lab distribution' },
  bpi: { co: 'bpi', label: 'vs BPI', sector: 'Comms / public affairs' },
  fair_harbor: { co: 'fh', label: 'vs Fair Harbor', sector: 'Apparel DTC' },
};
const coById = id => COS.find(c => c.id === id) || (id === 'rival' ? RIVAL : null);

const NEXT_ACTION = {
  sec_form_d: 'Pull the full Form D / D-A history on EDGAR and reconcile amount sold against Form ADV gross asset value for the same vehicle.',
  form_adv: 'Diff against the next ADV annual amendment (due Mar 31): changes in gross asset value, beneficial owners and new fund vehicles (Fund II).',
  bdc_loan_schedule: 'Track the next BDC 10-Q/10-K (quarterly): mark vs par, PIK toggles, non-accrual footnotes and maturity extensions.',
  lender_press: 'Match the lender announcement to BDC schedules and UCC filings to size the full facility.',
  sba_ppp: 'Use PPP-implied payroll (loan ÷ 2.5 × 12) as a pre-deal scale anchor; confirm against payroll registers in diligence.',
  fdd_item19: 'Refresh from the next FDD (state franchise registries, spring cycle) and compare Item 19 unit revenue year on year.',
  fdd_franchisee_list: 'Refresh the franchisee list from the next FDD to confirm territories operated and new/closed units.',
  state_business_filing: 'Run a Secretary of State search for officers, mergers and name changes; request certified copies if material.',
  ucc_lien: 'Run a UCC-1 search to identify the secured party / agent bank and filing date; size the facility.',
  tax_or_assessment: 'Pull the assessor record for owned real estate; check assessed value vs. book.',
  county_deed_or_mortgage: 'Pull the county recorder index for deeds and mortgages; identify lien holders.',
  litigation: 'Pull the docket (PACER / state court) and assess exposure and insurance coverage.',
  osha_dol: 'Review OSHA inspection detail as a safety-program diligence item.',
  press_financial: 'Cross-check against PitchBook / Capital IQ deal records and the latest 10-K/10-Q.',
  industry_benchmark: 'Apply as a benchmark in Public comparables.',
  ranking_listing: 'Use as a growth proxy only; verify with company-reported figures.',
  other: 'Validate with a primary source and log it in the diligence request list.',
};

/* ── formatting helpers ─────────────────────────────────────────────────── */
const pctF = (fmt, v, d = 1) => v == null || isNaN(v) ? '—' : `${fmt.num(v, d)}%`;
const sPct = (fmt, v, d = 1) => v == null || isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${fmt.num(v, d)}%`;
const confColor = c => c === 'high' ? 'var(--sys-good)' : c === 'medium' ? 'var(--sys-warn)' : 'var(--sys-mute-2)';
const confDot = c => `<i class="cdot" style="--cc:${confColor(c)}" title="${String(c || 'n/a').replace(/[^a-z/ -]/gi, '')} confidence"></i>`;
const catLabel = c => Copy.category(c || 'other');
const CAT_SHORT = { bdc_loan_schedule: 'BDC loans', sec_form_d: 'Form D', form_adv: 'ADV', sba_ppp: 'PPP', press_financial: 'Press', industry_benchmark: 'Benchmark', state_business_filing: 'State filing', ucc_lien: 'UCC', lender_press: 'Lender', fdd_item19: 'FDD 19', fdd_franchisee_list: 'FDD list', tax_or_assessment: 'Assessor', county_deed_or_mortgage: 'Deed', litigation: 'Litigation', osha_dol: 'OSHA', ranking_listing: 'Ranking', other: 'Other' };
const catShort = c => CAT_SHORT[c] || catLabel(c);
const dateKey = s => { const m = String(s || '').match(/(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); return m ? `${m[1]}-${m[2] || '01'}-${m[3] || '01'}` : ''; };
const toArr = v => Array.isArray(v) ? v : v == null || v === '' ? [] : [v];
const srcList = m => { const v = m?.sources_summary; if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : (x?.source || x?.name || '')).filter(Boolean); if (typeof v === 'string') return v.split(/;\s+|\.\s+(?=[A-Z])/).map(x => x.trim()).filter(Boolean); if (v && typeof v === 'object') return Object.entries(v).filter(([k]) => k !== 'note').map(([k, n]) => `${k.replace(/_/g, ' ')} (${n})`); return []; };
const median = a => { const v = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const asText = v => Array.isArray(v) ? v.join(' ') : String(v ?? '');
const sentences = (s, n = 2) => {
  const t = asText(s).replace(/\s+/g, ' ').replace(/^\(?\d\)\s*/, '').trim();
  const parts = t.split(/(?<=[.!?])\s+(?=\(?[A-Z0-9$])/);
  return parts.slice(0, n).join(' ').replace(/\s\(?\d\)\s*$/, '');
};
function flatKF(kf, pre = '') {
  const out = [];
  if (!kf || typeof kf !== 'object') return out;
  for (const [k, v] of Object.entries(kf)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatKF(v, `${pre}${k}.`));
    else out.push([pre + k, v]);
  }
  return out;
}
function kfVal(fmt, k, v) {
  if (Array.isArray(v)) return v.map(x => kfVal(fmt, k, x)).join(' / ');
  const kl = k.toLowerCase();
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 1800 && v <= 2100 && /founded|year|(^|_)fy|date|since|vintage|period/.test(kl)) return String(v);
    if (/pct|percent|margin/.test(kl)) return `${fmt.num(v, v % 1 ? 1 : 0)}%`;
    if (/usd_k$|usd_thousands$|usd_000s?$/.test(kl)) return fmt.money(v * 1000);
    if (/usd_m$/.test(kl)) return `$${fmt.num(v, 1)}M`;
    if (/usd|amount|sold|offering|par|value|revenue|cost|loan|debt|payroll|gav|aum|price|sales|income|proceeds|consideration|fees?/.test(kl) && Math.abs(v) >= 1000) return fmt.money(v);
    return fmt.num(v, v % 1 ? 2 : 0);
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v ?? '—');
}
const KEY_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const humanKey = k => String(k).replace(/_usd(_k|_m|_thousands|_000s?)?$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b((?:19|20)\d\d) (0[1-9]|1[0-2]) (0[1-9]|[12]\d|3[01])\b/g, (m, y, mo, d) => `${KEY_MON[+mo - 1]} ${+d}, ${y}`).replace(/\s*\bpct\b/g, '').replace(/\b(aum|gav|bsp|ebitda|sec|ppp|sba|ev|llc|lp)\b/gi, m => m.toUpperCase()).trim().replace(/^[a-z]/, c => c.toUpperCase());
const kfSummary = (fmt, kf, n = 4) => flatKF(kf).filter(([k]) => !/note|mapping_basis|legal_entity|signer|related_person/i.test(k)).slice(0, n).map(([k, v]) => `${humanKey(k)}: ${kfVal(fmt, k, v)}`).join(' · ');
const kfTable = (fmt, esc, kf) => { const rows = flatKF(kf); return rows.length ? `<div class="sys-table-wrap"><table class="sys-table"><tbody>${rows.map(([k, v]) => `<tr><td class="text-2">${esc(humanKey(k))}</td><td class="sys-n n">${esc(kfVal(fmt, k, v))}</td></tr>`).join('')}</tbody></table></div>` : '<span class="dim">—</span>'; };
const numKF = (kf, re, exclude) => flatKF(kf).filter(([k, v]) => re.test(k) && !(exclude && exclude.test(k))).flatMap(([k, v]) => Array.isArray(v) ? v : [v]).filter(v => typeof v === 'number' && !isNaN(v));
/* scrub collection-tooling jargon out of analyst text, and clip on a word boundary */
const clean = t => Copy.text(String(t ?? '')).replace(/Raise\s+CLAUDE_CODE_\w+,?\s*then\s+(\w)/gi, (m, c) => c.toUpperCase()).replace(/CLAUDE_CODE_\w+/g, 'research limits').replace(/\bweb[\s-]?search budget\b/gi, 'research budget').replace(/\s+for this session\b/gi, ' this cycle').replace(/\bthis session\b/gi, 'this cycle');
const clip = (t, n) => { const x = clean(t); if (x.length <= n) return x; const c = x.slice(0, n); const i = c.lastIndexOf(' '); return `${(i > n * 0.6 ? c.slice(0, i) : c).replace(/[\s,;:(–—-]+$/, '')}…`; };
const shortEst = s => String(s || '').replace(/\s*\([^)]*\)/g, '').split(/;\s/)[0].trim();

function injectCss() {
  if (!document.getElementById('css-fin')) { const l = document.createElement('link'); l.id = 'css-fin'; l.rel = 'stylesheet'; l.href = 'modules/fin.css?v=20261117223642'; document.head.appendChild(l); }
}

/* ── data layer ─────────────────────────────────────────────────────────── */
async function loadAll(ctx) {
  const { data } = ctx;
  const [cos, rival, comps, firm] = await Promise.all([
    Promise.all(COS.map(c => data.research(c.ds).then(d => ({ co: c, d })))),
    data.research('rival_filings'), data.research('public_comps'), data.research('bsp_firm'),
  ]);
  const rows = [];
  for (const { co, d } of cos) for (const i of (d?.items || [])) rows.push(normRow(ctx, i, co));
  for (const i of (rival?.items || [])) rows.push(normRow(ctx, i, RIVAL));
  return { cos, rival, comps, firm, rows };
}
function normRow(ctx, i, co) {
  return { ...i, title: Copy.text(i.title), what_it_tells_us: Copy.text(i.what_it_tells_us), _co: co.id, _coName: co.short, _color: co.color, _date: dateKey(i.filed_or_dated), _kf: kfSummary(ctx.fmt, i.key_figures, 4), _cat: i.category || 'other', _key: `${co.id}:${i.id}` };
}
const isBsp = r => /BSP|Broad Sky/i.test(`${r.entity} ${r.title}`);

function openItem(ctx, r) {
  const { esc, fmt, ui, inspector, app } = ctx;
  const co = coById(r._co);
  inspector.open({
    title: esc(r.title), color: r._color || 'var(--c-fin)',
    sub: `${esc(co?.name || '')} · ${esc(r.entity || '')} · ${esc(r.filed_or_dated || '')}`,
    sections: [
      { label: 'Record', html: ui.kv({ Category: fmt.chip(catLabel(r.category), r._color), Filer: esc(r.filer_or_source_agency || ''), Dated: esc(r.filed_or_dated || ''), Confidence: fmt.chip(r.confidence || 'n/a', confColor(r.confidence)), 'BSP overlap': (r.bsp_overlap || []).map(o => OVERLAP[o]?.label || o), Retrieved: esc(r.retrieved || '') }) },
      { label: 'Key figures', html: `<div class="fin-insp">${kfTable(fmt, esc, r.key_figures)}</div>` },
      { label: 'What it tells us', html: `<div class="small text-2">${esc(r.what_it_tells_us || '—')}</div>` },
      r.note ? { label: 'Note', html: `<div class="small text-2">${esc(r.note)}</div>` } : null,
      { label: 'Source', html: `<div class="col gap-4 small">${r.source_url ? fmt.link(r.source_url, Copy.srcLabel(r.source_url)) : '—'}${r.secondary_url ? fmt.link(r.secondary_url, Copy.srcLabel(r.secondary_url)) : ''}${r.xbrl_source ? fmt.link(r.xbrl_source, 'XBRL companyfacts') : ''}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${esc(NEXT_ACTION[r.category] || NEXT_ACTION.other)}</div>` },
    ].filter(Boolean),
    actions: [r.source_url ? { label: 'Open source ↗', href: r.source_url } : null, r._co !== 'rival' ? { id: 'co', label: `All ${esc(co?.short || '')} filings`, onClick: () => app.go('fin', 'explorer', { company: r._co }) } : { id: 'rv', label: 'Rival companies', onClick: () => app.go('ma', 'rivals') }].filter(Boolean),
  });
}

function actionList(ctx, acts) {
  const { esc, fmt } = ctx;
  return acts.length ? acts.map((a, i) => `<div class="act"><span class="n">${String(i + 1).padStart(2, '0')}</span>${a.chip ? fmt.chip(a.chip, a.color) : ''}<div class="x">${a.html || esc(a.text)}</div></div>`).join('') : ctx.ui.empty('No actions');
}

/* estimate_table row pickers for the portfolio snapshot */
function pickEst(est, kind) {
  const score = { revenue: e => { const m = e.metric; if (!/revenue/i.test(m) || /per (territory|employee)|federal|UK (?:platform|company|portfolio company)|payroll|billings/i.test(m)) return null; let s = 0; if (/pro forma/i.test(m)) s += 5; else if (/current|2025|run-rate|2026/i.test(m)) s += 3; if (/2019|2020|2023|FY2024|at entry|pre-/i.test(m)) s -= 3; if (/NuWave|Horton/i.test(m) && !/pro forma/i.test(m)) s -= 4; return s; },
    ebitda: e => { const m = e.metric; if (!/EBITDA/i.test(m) || /margin|EV\s*\/|multiple|benchmark|PPHC|Entry EV/i.test(m)) return null; let s = 0; if (/pro forma/i.test(m)) s += 5; else if (/current|2025|run-rate/i.test(m)) s += 3; if (/at entry|at close/i.test(m)) s -= 1; if (/2023|BV era/i.test(m)) s -= 3; return s; },
    ev: e => /enterprise value/i.test(e.metric) ? (/entry|transaction/i.test(e.metric) ? 2 : 1) : null,
    debt: e => { const m = e.metric; if (!/debt|first-lien facility|term loan/i.test(m) || /interest|pricing|cost|exposure/i.test(m)) return null; return /total|outstanding|facility|pro forma/i.test(m) ? 2 : 1; },
    equity: e => !/equity/i.test(e.metric) || /value change|equity value|peer|share/i.test(e.metric) ? null : /fund \+ co-invest|cumulative/i.test(`${e.metric} ${e.estimate}`) ? 3 : /broad sky|bsp|sponsor/i.test(e.metric) ? 2 : 1 };
  let best = null, bs = -Infinity;
  for (const e of est || []) { const s = score[kind](e); if (s != null && s > bs) { bs = s; best = e; } }
  return best;
}

/* SENS_* only pick out operating datapoints (scale, people, footprint) for the signals panel, the company cards' mini tables
   and the public-record pulls on Portfolio picture. Value, debt and marks are in the value and exit table on the same screen. */
const SENS_METRIC = /\bmark\b|value change|equity value|leverage|all-in|interest|pricing|enterprise value|\bEV\b|EV\s*\/|debt|facility|term loan|unitranche|exposure|\bPIK\b|valuation/i;
const SENS_TEXT = /\blevered\b|\bmark(s|ed)?\b|of par|\bPIK\b|unitranche|leverage|coverage|fair value|unrealized|write-?down|non-accrual|lender|term loan|credit (and guaranty )?agreement|\bdebt\b|enterprise value|\bEV\b|interest|refinanc/i;
const isSens = e => SENS_METRIC.test(e?.metric || '');
/* split an analyst narrative into its numbered paragraphs: "(1) …", "1) …" */
const segments = t => asText(t).replace(/\s+/g, ' ').trim().split(/\s+(?=\(?\d{1,2}\)\s)/).map(s => s.trim()).filter(Boolean);
const opSegments = t => segments(t).filter(s => !SENS_TEXT.test(s));
const DAY = 864e5;
const yearsSince = d => { const t = Date.parse(String(d || '').length === 7 ? `${d}-01` : d); return isNaN(t) ? null : (Date.now() - t) / (365.25 * DAY); };
const monthsTo = d => { const t = Date.parse(String(d || '').length === 7 ? `${d}-01` : d); return isNaN(t) ? null : (t - Date.now()) / (30.44 * DAY); };
const monLabel = d => { const t = Date.parse(String(d || '').length === 7 ? `${d}-01` : d); return isNaN(t) ? String(d || '—') : new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const monLong = d => { const t = Date.parse(String(d || '').length === 7 ? `${d}-01` : d); return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
/* midpoint of the first "$a–bM" style range in an estimate string, in USD (sorting only) */
function midUsd(s) {
  const m = String(s || '').match(/\$\s*([\d.,]+)\s*(?:[–-]\s*\$?\s*([\d.,]+))?\s*([KMB])/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(/,/g, '')), b = m[2] ? parseFloat(m[2].replace(/,/g, '')) : a;
  return (a + b) / 2 * ({ K: 1e3, M: 1e6, B: 1e9 }[m[3].toUpperCase()]);
}
/* the part of a compound estimate ("$65–100M revenue; $6–11M EBITDA") that answers this metric */
function estPart(e, kind) {
  if (!e) return '';
  const parts = String(e.estimate || '').split(/;\s+/);
  const re = kind === 'ebitda' ? /EBITDA/i : kind === 'revenue' ? /revenue|sales/i : null;
  const hit = (re && parts.length > 1 && parts.find(p => re.test(p))) || parts[0];
  const short = hit.replace(/\s*\([^)]*\)/g, '').trim();
  return parts.length > 1 ? short.replace(/\s+(revenue|EBITDA)$/i, '') : shortEst(short);
}
const eqText = e => { const parts = String(e?.estimate || '').replace(/\s*\([^)]*\)/g, '').split(/;\s+/); const p = parts.find(x => /cumulative/i.test(x)) || parts[0] || ''; return p.replace(/\s*cumulative.*$/i, ' cum.').replace(/\s+primary$/i, '').trim(); };
const byNum = k => (a, b) => (a[k] ?? -Infinity) - (b[k] ?? -Infinity);
const isPF = e => /pro forma|incl\.? NJ|CET\+/i.test(e?.metric || '');
const estCellK = (esc, fmt, e, kind) => e ? `<div class="est-cell">${confDot(e.confidence)}${esc(estPart(e, kind).slice(0, 40))}${isPF(e) ? ` ${fmt.chip('PF', 'var(--c-fin)')}` : ''}</div>` : '<span class="dim">—</span>';

function firmEntry(firm, co) {
  const it = (firm?.items || []).find(i => i.id === `bsp-${co.id}`);
  return it ? { date: it.entry_date, held: yearsSince(it.entry_date), addOns: toArr(it.add_ons).length, addOnNames: toArr(it.add_ons).map(a => a?.name).filter(Boolean), src: toArr(it.sources)[0] || null } : null;
}
/* Form D vehicles for a company: deal SPVs plus issuer-level raises (Fair Harbor) */
function spvsFor(capital, co) { return (capital?.deal_vehicles || []).filter(v => co.ledger.test(v.company)); }
function spvLine(fmt, spvs) {
  if (!spvs.length) return '';
  const issuer = spvs.filter(v => /issuer Form D/i.test(v.vehicle)), deal = spvs.filter(v => !/issuer Form D/i.test(v.vehicle));
  const parts = [];
  if (deal.length === 1) parts.push(`${deal[0].vehicle.replace(/,?\s*(LLC|LP)$/i, '')} ${fmt.money(deal[0].sold_usd)}`);
  else if (deal.length > 1) parts.push(`${deal.length} SPVs ${fmt.money(deal.reduce((a, v) => a + (v.sold_usd || 0), 0))} (may overlap)`);
  issuer.forEach(v => parts.push(`issuer round ${fmt.money(v.sold_usd)}`));
  return `Form D: ${parts.join(' · ')}`;
}
function equityRow(fmt, est, capital, co) {
  const e = pickEst(est, 'equity');
  const spvs = spvsFor(capital, co);
  const spvSum = spvs.filter(v => !/issuer Form D/i.test(v.vehicle)).reduce((a, v) => a + (v.sold_usd || 0), 0);
  const primary = e ? eqText(e) : spvSum ? fmt.money(spvSum) : '';
  const sub = spvLine(fmt, spvs) || (co.id === 'pp' ? 'No SPV on EDGAR: Fund I only' : '');
  return { e, primary, sub, sort: e ? midUsd(primary) : spvSum || null, label: e ? e.metric : 'Form D amount sold' };
}

/* ═══ Value and exit: one row per company, built once ═══════════════════════════
   fin/portfolio draws the full table and home/overview the short one from these rows,
   so hold, exit window and the next action cannot differ between the two screens. */

/* Label lookups in each company's filings estimate table (data/research/<ds>.json, meta.estimate_table[].metric).
   Moved verbatim from home.js. signals.js REV uses the same revenue patterns. Never reword a pattern or a dataset label;
   if a label stops matching, the scored pickEst() above is the fallback, so a cell does not blank. */
const EST = {
  cet: { ds: 'cet_filings', ev: /^Entry enterprise value/i, rev: [/^Pro forma (?:platform|portfolio company|company)/i, 0], ebitda: [/^Pro forma (?:platform|portfolio company|company)/i, 1], debt: /^Pro forma senior debt/i, mark: /co-invest mark/i },
  pp: { ds: 'pp_filings', ev: /^Entry enterprise value/i, rev: /pro forma total revenue/i, ebitda: /^Adjusted EBITDA/i, debt: /^Total senior debt/i },
  fl: { ds: 'frontline_filings', ev: /^Transaction enterprise value/i, rev: /^Revenue \(2025/i, ebitda: /^Adjusted EBITDA at close/i, debt: /^Senior debt at close/i, mark: /^Equity value change/i },
  ts: { ds: 'thomas_filings', ev: /^Entry enterprise value/i, rev: /^Current revenue/i, ebitda: /^Current EBITDA/i, debt: /^Total first-lien facility/i, lev: /^Current total leverage/i, mark: /^Sponsor common equity value/i },
  bpi: { ds: 'bpi_filings', ev: /^Entry enterprise value/i, rev: /^Net \(fee\) revenue FY2025/i, ebitda: /^Adj\. EBITDA FY2025/i, debt: /^Senior secured debt/i },
  fh: { ds: 'fairharbor_filings', ev: /^Entry enterprise value/i, rev: /^2025 net revenue/i, ebitda: /^2025 EBITDA/i, debt: /^Funded debt/i },
};
const estRow = (est, spec, kind) => { const re = Array.isArray(spec) ? spec[0] : spec; const hit = re ? est.find(e => re.test(e.metric || '')) : null;
  if (!hit && re && est.length) console.debug(`[fin] estimate label not matched (${kind}); using the scored pick`); return hit || pickEst(est, kind); };

const markLabel = m => /co-invest mark/i.test(m) ? 'co-invest, ADV' : /value change/i.test(m) ? 'equity vs cost' : /common equity value/i.test(m) ? 'sponsor common' : clip(m, 24);
function lenderMark(co, d) {
  const hits = [];
  for (const i of d?.items || []) {
    if (!/bdc_loan_schedule|lender_press|press_financial/.test(i.category || '') || !co.ledger.test(i.entity || '')) continue;
    for (const [k, v] of flatKF(i.key_figures)) {
      if (!/fv_pct_par|mark_pct|pct_of_par/i.test(k)) continue;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (!isNaN(n) && n > 30 && n <= 110) hits.push({ v: n, date: dateKey((k.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || i.filed_or_dated), item: i });
    }
  }
  return hits.sort((a, b) => b.date.localeCompare(a.date) || a.v - b.v)[0] || null;
}
function maturityOf(co, d) {
  const out = [];
  for (const i of d?.items || []) {
    if (!co.ledger.test(i.entity || '')) continue;
    for (const [k, v] of flatKF(i.key_figures)) if (/(^|[._])maturity$/i.test(k) && typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) out.push({ v, item: i, date: dateKey(i.filed_or_dated) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

/* Smith + Howard, the exited company every hold is measured against. From the firm timeline (was home.js shExit); the constants are the fallback. */
export function templateExit(firm) {
  const tl = (firm?.timeline || []).filter(t => /Smith/i.test(t.company || ''));
  const entry = tl.find(t => t.type === 'platform')?.date || '2022-11-15';
  const exits = tl.filter(t => t.type === 'exit').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const exit = exits[0]?.date || '2026-08-06';
  const named = tl.filter(t => t.type === 'add_on').sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const m = /S\+H (\d+) of (\d+)/.exec(firm?.firm?.stats?.add_on_reconciliation || '');
  const hold = (Date.parse(exit) - Date.parse(entry)) / (365.25 * DAY);
  return { id: 'sh', company: 'Smith + Howard', short: 'S+H', status: 'exited', sector: 'Accounting & advisory · Atlanta', entry, exit, hold: isNaN(hold) ? 3.7 : hold, addons: m ? Number(m[2]) : named.length || 9, named,
    src: exits[0]?.source_url || 'https://broadskypartners.com/broad-sky-partners-completes-sale-of-smith-howard-to-tpg/', note: '~100 → ~800 professionals, 11 offices, 9 add-ons, ~4x revenue; sold to TPG (TPG Growth), Aug 2026' };
}

function exitFlag(held, mo, tplHeld) {            // k = urgency, 0 first; st = status chip (home), c = colour (fin)
  if (mo != null && mo < 24) return { t: `Refinancing due in ${Math.max(0, Math.round(mo))} mo`, st: 'warn', c: 'var(--sys-warn)', k: 0 };
  if (held != null && held >= 4) return { t: 'In exit window (4+ yr hold)', st: 'warn', c: 'var(--sys-warn)', k: 1 };
  if (held != null && held >= 3) return { t: `Exit prep (S+H sold at ${tplHeld} yrs)`, st: 'info', c: 'var(--sys-brand)', k: 2 };
  return { t: 'Build: add-ons and integration', st: 'good', c: 'var(--sys-good)', k: 3 };
}

/* The next action per company: `action` is the one sentence both tables print; `detail` is the supporting line the full table adds. */
const NEXT = {
  ts:  r => ({ action: `Extend or refinance the loan due in ${r.matLong || 'December 2027'}, and rebuild normalized EBITDA before any sale.`,
               detail: `The unitranche matures ${r.matLabel || 'Dec 2027'}: fix a refinance-vs-sale decision date (Q1 2027). The refinancing case rests on target-account revenue, so make share-of-wallet growth the board's first KPI.` }),
  fh:  r => ({ action: `${r.held != null ? `At ${r.heldYears} with no add-ons` : 'With no add-ons'}, decide the exit path: wholesale-door and category growth to a sponsor, or a strategic sale.`,
               detail: 'No term loan identified: test strategic-buyer appetite now (Chubbies → Solo Brands is the reference trade) and decide hold vs. sell for the 2027 season.' }),
  bpi: r => ({ action: `Integrate the ${r.addOns ?? 'six'} add-ons into one reporting line and benchmark against listed peers (PPHC ~8.4x EBITDA) ahead of a 2027–28 process.`,
               detail: `${r.addOns ?? 'Six'} add-ons in ${r.heldTxt}: package the integrated US/UK/EU company story for a 2027 process; PPHC (~8.4x EV / 2025 Adj. EBITDA) is the public anchor.` }),
  pp:  r => ({ action: 'Use the PGIM delayed-draw term loan (~$1.4M unfunded) for the next adjacent-county franchise tuck-in.',
               detail: `The facility runs to ${r.matLabel || 'Mar 2029'}: there is runway, so close the next add-on (density in Lancaster or Ocean/Monmouth) before exit prep in 2027–28.` }),
  fl:  r => ({ action: 'Close the first BSP-era add-on (legal MSP or eBilling) and grow mid-size-firm accounts to build the earnings story.',
               detail: `No add-ons since entry (${r.entryLabel}): the first legal-IT / RCM tuck-in is the main value lever; the co-investor already marks equity up ~10%.` }),
  cet: r => ({ action: 'Run Horton + NuWave under one reporting line and report pro forma EBITDA quarterly; line up the next New England tuck-in (wastewater / solar O&M).',
               detail: 'Integrate Horton (Sept 2026) and NuWave; the next add-on should extend New England wastewater and pump-station work.' }),
};

async function loadCore(ctx) {                    // six filings files + the firm profile; Data caches each
  const [cos, firm] = await Promise.all([Promise.all(COS.map(c => ctx.data.research(c.ds).then(d => ({ co: c, d })))), ctx.data.research('bsp_firm')]);
  return { cos, firm };
}
function scoreboard(fmt, { cos, firm }) {         // also called by portfolioView with the result of loadAll()
  const capital = firm?.firm?.capital_raised_sec_form_d; const tpl = templateExit(firm); const tplHeld = fmt.num(tpl.hold, 1);
  const rows = COS.map(co => {
    const d = cos.find(x => x.co.id === co.id)?.d; const est = toArr(d?.meta?.estimate_table); const spec = EST[co.id] || {};
    const en = firmEntry(firm, co) || {};
    const eq = equityRow(fmt, est, capital, co);
    const ev = estRow(est, spec.ev, 'ev'), rev = estRow(est, spec.rev, 'revenue'), ebitda = estRow(est, spec.ebitda, 'ebitda'), debt = estRow(est, spec.debt, 'debt');
    const lev = (spec.lev && est.find(e => spec.lev.test(e.metric || ''))) || est.find(e => /leverage/i.test(e.metric || ''));
    const mat = maturityOf(co, d); const mo = mat ? monthsTo(mat.v) : null;
    /* Thomas Scientific's lender and sponsor marks are shown in one place, with their filings (#/ts/filings?deal=1): not in the
       Latest mark cell, and its mark row is left out of the estimate list both row panels show */
    const lm = co.id === 'ts' ? null : lenderMark(co, d);
    const sm = co.id === 'ts' ? [] : est.filter(e => /\bmark\b|value change|equity value/i.test(e.metric));
    const estShown = co.id === 'ts' && spec.mark ? est.filter(e => !spec.mark.test(e.metric || '')) : est;
    const flag = exitFlag(en.held, mo, tplHeld);
    const held = en.held ?? null;
    const r = { id: co.id, co, d, en, eq, ev, rev, ebitda, debt, lev, mat, mo, lm, sm, flag, estShown, name: co.name, short: co.short, missing: !d, held, entry: en.date || '', addOns: en.addOns ?? null, _k: flag.k,
      equity: eq.sort, ev_sort: ev ? midUsd(estPart(ev)) : null, rev_sort: rev ? midUsd(estPart(rev, 'revenue')) : null, ebitda_sort: ebitda ? midUsd(estPart(ebitda, 'ebitda')) : null, debt_sort: debt ? midUsd(estPart(debt)) : null, mat_sort: mat?.v || '', mark_sort: lm ? lm.v : null, flag_sort: flag.k,
      matLabel: mat ? monLabel(mat.v) : '', matLong: mat ? monLong(mat.v) : '', heldTxt: held != null ? `${fmt.num(held, 1)} yrs` : '—', heldYears: held != null ? `${fmt.num(held, 1)} years` : '', entryLabel: monLabel(en.date) };
    Object.assign(r, (NEXT[co.id] || (() => ({ action: '', detail: '' })))(r));
    // flat CSV fields
    Object.assign(r, { company: co.name, entry_date: r.entry, held_years: held != null ? +held.toFixed(1) : null, add_ons: r.addOns, bsp_equity_est: eq.primary, bsp_equity_basis: eq.label, form_d: eq.sub,
      revenue_est: rev ? `${estPart(rev, 'revenue')}${isPF(rev) ? ' (pro forma)' : ''}` : '', revenue_metric: rev?.metric || '', ebitda_est: ebitda ? estPart(ebitda, 'ebitda') : '', ebitda_metric: ebitda?.metric || '',
      entry_ev_est: ev ? estPart(ev) : '', senior_debt_est: debt ? estPart(debt) : '', leverage_est: lev ? lev.estimate : '', maturity: mat?.v || '', lender_mark_pct_par: lm ? lm.v : '',
      sponsor_marks: [lm ? `Lender mark ${lm.v}% of par` : null, ...sm.map(e => `${e.metric}: ${e.estimate}`)].filter(Boolean).join(' | '), exit_flag: flag.t, next_action: `${r.action} ${r.detail}`.trim() });
    return r;
  });
  tpl.action = `Template exit: sold to TPG Growth after ${tpl.addons} add-ons and ~4x revenue growth. Use as the benchmark for hold length and add-on cadence.`;
  return { rows, tpl, capital };
}
export async function loadScoreboard(ctx) { return scoreboard(ctx.fmt, await loadCore(ctx)); }

/* ═══ View 1: Portfolio financial picture: value and exit first, then the filings behind each figure ══════ */
async function portfolioView(ctx) {
  const { el, ui, fmt, esc, app, charts } = ctx;
  injectCss();
  el.innerHTML = ui.loading('Loading filings across the portfolio…');
  const D = await loadAll(ctx);
  const { cos, firm, comps, rows } = D;
  const present = cos.filter(x => x.d);
  if (!present.length && !D.rival) { el.innerHTML = ui.note('Research filings datasets are not yet available.', 'warn'); return; }

  const capital = firm?.firm?.capital_raised_sec_form_d;
  const vehicles = (capital?.deal_vehicles || []).filter(v => !/issuer Form D/i.test(v.vehicle));
  const vehEquity = vehicles.reduce((a, v) => a + (v.sold_usd || 0), 0);
  const fundSold = capital?.broad_sky_partners_lp_total_sold_usd;
  const flSpv = vehicles.find(v => /BSP-FL LP/i.test(v.vehicle));
  const companyRows = rows.filter(r => r._co !== 'rival');
  const nComps = comps?.items?.length || 0, nSectors = Object.keys(comps?.meta?.sector_benchmarks || {}).length;

  // one row per company, shared with the Command Center (scoreboard above): revenue/EBITDA prefer current or pro forma
  const { rows: board, tpl } = scoreboard(fmt, D);
  const tplHeld = fmt.num(tpl.hold, 1);
  const pfRev = board.filter(r => r.rev_sort).reduce((a, r) => a + r.rev_sort, 0);
  const pfEbitda = board.filter(r => r.ebitda_sort).reduce((a, r) => a + r.ebitda_sort, 0);
  const biggest = board.filter(r => r.rev_sort).sort((a, b) => b.rev_sort - a.rev_sort)[0];
  const gavRow = rows.find(r => r.category === 'form_adv' && flatKF(r.key_figures).some(([k]) => /Broad_Sky_Partners_LP_GAV/i.test(k)));
  const fundGav = gavRow ? numKF(gavRow.key_figures, /Broad_Sky_Partners_LP_GAV/i)[0] : null;
  const holds = board.filter(r => r.held != null);
  const avgHold = holds.length ? holds.reduce((a, r) => a + r.held, 0) / holds.length : null;
  const inWindow = board.filter(r => r.held != null && r.held >= 4);
  const nextMat = board.filter(r => r.mo != null && r.mo > 0).sort((a, b) => a.mo - b.mo)[0];
  const urgent = board.filter(r => r.flag.k <= 1).sort((a, b) => a.flag.k - b.flag.k);
  const addOnsAll = board.reduce((a, r) => a + (r.addOns || 0), 0);

  el.innerHTML = `<div class="m-fin">${ui.pageHead({
    title: 'Portfolio financial picture',
    sub: `Six companies add up to roughly ${fmt.money(pfRev)} of revenue and ${fmt.money(pfEbitda)} of EBITDA (est.)${biggest ? `; ${esc(biggest.co.name)} is the largest` : ''}. Every figure comes from public records. ${urgent.length ? `${esc(urgent.map(r => r.co.short).join(' and '))} need${urgent.length === 1 ? 's' : ''} an exit or refinancing decision within 12–18 months` : 'No portfolio company is yet in its exit window'}${nextMat ? `; ${esc(nextMat.co.short)}'s debt matures ${esc(nextMat.matLabel)}` : ''}.`,
    chips: `${fmt.chip(`Filings for ${present.length} of ${COS.length} companies`, present.length < COS.length ? 'var(--sys-warn)' : 'var(--sys-good)')}${fmt.chip('Estimates, not audited', 'var(--sys-warn)')}${fmt.chip('As of Sept 2026', 'var(--c-fin)')}`,
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/fin/comps">Public comparables</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/fin/explorer">Filings explorer</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/fin/methods">Methods & gaps</a>`,
  })}
  ${ui.kpis([
    { label: 'Portfolio revenue (est.)', value: pfRev ? fmt.money(pfRev) : '—', sub: `sum of midpoints · ${board.filter(r => r.rev && isPF(r.rev)).length} pro forma`, color: 'var(--c-fin)' },
    { label: 'Portfolio EBITDA (est.)', value: pfEbitda ? fmt.money(pfEbitda) : '—', sub: pfRev && pfEbitda ? `~${fmt.num(pfEbitda / pfRev * 100, 0)}% blended margin` : '', color: 'var(--sys-good)' },
    { label: 'Average hold', value: avgHold != null ? `${fmt.num(avgHold, 1)} yrs` : '—', sub: `${fmt.num(addOnsAll)} add-ons to date · Smith + Howard exited at ${tplHeld} yrs with ${fmt.num(tpl.addons)}`, color: 'var(--sys-brand)' },
    { label: 'In exit window', value: fmt.num(inWindow.length), sub: inWindow.length ? esc(inWindow.map(r => `${r.co.short} ${fmt.num(r.held, 1)}y`).join(' · ')) : 'none held 4+ yrs', color: 'var(--sys-warn)' },
    { label: 'Nearest maturity', value: nextMat ? esc(nextMat.matLabel) : '—', sub: nextMat ? `${esc(nextMat.co.short)} · ${fmt.num(nextMat.mo, 0)} months` : 'no maturities disclosed', color: 'var(--sys-warn)' },
    { label: 'Fund I gross mark', value: fundGav && fundSold ? `${fmt.num(fundGav / fundSold, 2)}x` : '—', sub: fundGav ? `${fmt.money(fundGav)} GAV (ADV) vs ${fmt.money(fundSold)} sold · ${fmt.num(capital?.investors)} investors` : 'Form ADV not loaded', color: 'var(--sys-good)' },
  ])}
  ${flSpv && fundSold ? `<div class="mt-8">${ui.note(`<b>Fund I is ${fmt.money(fundSold)}</b> (Form D amendment ${esc(capital?.as_of || '')}). The ~${fmt.money(flSpv.sold_usd)} figure sometimes quoted as "Fund I" is <b>${esc(flSpv.vehicle)}</b>, the Frontline deal vehicle (Form D ${esc(flSpv.filed || flSpv.first_sale || '')}).`, '')}</div>` : ''}
  <div class="mt-12">${ui.panel({ title: 'Value and exit (est.)', sub: 'One row per company, most urgent first · equity = fund + co-invest estimate, Form D vehicles beneath · PF = pro forma for closed add-ons · dot = confidence (green high · amber medium · grey low) · click a row for the full estimate table', body: '<div id="fin-board"></div>', foot: `${ui.source('Company public filings (estimate tables, BDC schedules) · BSP firm profile entry dates · SEC Form D / ADV', 'https://www.sec.gov/cgi-bin/browse-edgar?company=BSP-&type=D', 'Sept 2026')} · <span class="sys-muted">Exit window rule: debt due within 24 months, refinance or sell; held 4 years or more, exit window; 3 years or more, exit prep.</span>` })}</div>
  <div class="grid grid-main mt-12">
    <div class="col gap-12">
    ${ui.panel({ title: 'Hold period vs the template exit', sub: `Years held to date · Smith + Howard = entry ${esc(monLabel(tpl.entry))} → TPG ${esc(monLabel(tpl.exit))}`, body: '<div id="dl-hold"></div>', foot: ui.source('BSP firm profile: entry dates and timeline', null, firm?.meta?.generated) })}
    ${ui.panel({ title: 'Lender & sponsor marks', sub: 'Every public mark on a BSP position: BDC loan marks (% of par) and co-investor / ADV equity marks', body: '<div id="dl-marks"></div>', foot: ui.source('BDC 10-Q schedules · Form ADV Schedule D · co-investor N-PORT', null, 'Sept 2026') })}
    ${ui.panel({ title: 'Equity raised by vehicle', sub: `Latest Form D amount sold. ${fmt.num(vehicles.length)} deal vehicles total ${fmt.money(vehEquity)}; they pool Fund I money with LP co-invest, so bars are not additive to Fund I.`, body: `<div id="fin-ledger"></div>`, foot: capital?.source_url ? ui.source('SEC Form D (BSP firm profile ledger)', capital.source_url, capital.as_of) : '' })}
    </div>
    ${ui.panel({ title: 'Signals from the filings', sub: 'High-confidence operating datapoints (scale, people, footprint) per company', body: '<div id="fin-signals"></div>', foot: `${ui.source('Estimate-table rows rated high confidence (operating metrics only)')}${nComps ? ` · <a href="#/fin/comps">${fmt.num(nComps)} listed peers in ${fmt.num(nSectors)} sectors: Public comparables →</a>` : ''}` })}
  </div>
  <div class="grid grid-3 mt-12" id="fin-cos"></div>
  <div class="mt-12">${ui.panel({ title: 'BSP fund vehicles: every Form D / Form ADV record', sub: `All SEC Form D and SEC Form ADV items across the ${fmt.num(rows.length)} filings indexed (${fmt.num(companyRows.length)} portfolio · ${D.rival ? `${fmt.num(rows.length - companyRows.length)} rival` : 'competitor filings pending'}); BSP vehicles flagged. Headline $ = largest amount-sold (or GAV) figure in the record.`, body: '<div id="fin-veh"></div>', foot: ui.source('SEC EDGAR Form D / IAPD Form ADV', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001917706&type=D', 'Sept 2026') })}</div>
  <div class="mt-12">${ui.panel({ title: 'Next public-record pulls', sub: 'Highest-value public-record pull per company, sequenced for the PRG finance workstream', body: '<div id="fin-acts"></div>', foot: `<a href="#/fin/methods">All data gaps and next pulls →</a>` })}</div>
  </div>`;

  // the full table: exit window and the next action sit right after the company, so they never scroll out of view
  ui.table(el.querySelector('#fin-board'), {
    rows: board, pageSize: 10, sortKey: 'exit_flag', sortDir: 1, exportName: 'bsp_value_exit_scoreboard', rowKey: r => r.id, onRow: r => openCompany(ctx, r),
    columns: [
      { key: 'company', label: 'Company', width: '70px', fmt: (v, r) => `<span class="row" style="gap:6px"><i class="sys-dot fin-dot" aria-hidden="true" style="--co:${r.co.color}"></i><b>${esc(r.co.short)}</b></span>${r.missing ? '<div class="small" style="color:var(--sys-warn-ink)">dataset pending</div>' : ''}` },
      { key: 'held_years', label: 'Held', num: true, width: '96px', fmt: (v, r) => v == null ? '—' : `${fmt.num(v, 1)} yrs<div class="small dim">${esc(r.entryLabel)} · ${fmt.num(r.addOns)} add-on${r.addOns === 1 ? '' : 's'}</div>` },
      { key: 'exit_flag', label: 'Exit window', wrap: true, sort: byNum('flag_sort'), fmt: (v, r) => fmt.chip(r.flag.t, r.flag.c) },
      { key: 'next_action', label: 'Next action', wrap: true, fmt: (v, r) => `<div class="small text-2" style="min-width:220px;max-width:38ch;white-space:normal">${esc(r.action)}<div class="small dim mt-8">${esc(r.detail)}</div></div>` },
      { key: 'bsp_equity_est', label: 'BSP equity (est.)', num: true, wrap: true, sort: byNum('equity'), fmt: (v, r) => `${r.eq.primary ? `<div class="est-cell" title="${esc(r.eq.label)}">${confDot(r.eq.e ? r.eq.e.confidence : 'high')}${esc(r.eq.primary)}</div>` : '<span class="dim">—</span>'}${r.eq.sub ? `<div class="small dim fin-sub">${esc(r.eq.sub)}</div>` : ''}` },
      { key: 'revenue_est', label: 'Revenue (current / PF)', num: true, wrap: true, sort: byNum('rev_sort'), fmt: (v, r) => `${estCellK(esc, fmt, r.rev, 'revenue')}${r.rev ? `<div class="small dim fin-sub">${esc(clip(r.rev.metric, 44))}</div>` : ''}` },
      { key: 'ebitda_est', label: 'EBITDA', num: true, wrap: true, sort: byNum('ebitda_sort'), fmt: (v, r) => `${estCellK(esc, fmt, r.ebitda, 'ebitda')}${r.ebitda ? `<div class="small dim fin-sub">${esc(clip(r.ebitda.metric, 44))}</div>` : ''}` },
      { key: 'entry_ev_est', label: 'Entry EV', num: true, wrap: true, sort: byNum('ev_sort'), fmt: (v, r) => estCellK(esc, fmt, r.ev) },
      { key: 'senior_debt_est', label: 'Senior debt', num: true, wrap: true, sort: byNum('debt_sort'), fmt: (v, r) => `${estCellK(esc, fmt, r.debt)}${r.lev ? `<div class="small dim fin-sub">lev. ${esc(shortEst(r.lev.estimate))}</div>` : ''}` },
      { key: 'maturity', label: 'Maturity', width: '84px', fmt: (v, r) => r.mat ? `<span style="color:${r.mo != null && r.mo < 24 ? 'var(--sys-warn-ink)' : 'var(--sys-ink-2)'}">${esc(r.matLabel)}</span><div class="small dim">${r.mo != null ? `${fmt.num(r.mo, 0)} mo` : ''}</div>` : '<span class="dim">n/d</span>' },
      { key: 'sponsor_marks', label: 'Latest mark', wrap: true, sort: byNum('mark_sort'), fmt: (v, r) => `${r.lm ? `<div style="color:${r.lm.v < 90 ? 'var(--sys-bad-ink)' : r.lm.v < 97 ? 'var(--sys-warn-ink)' : 'var(--sys-good-ink)'}">${fmt.num(r.lm.v, 1)}% of par</div>` : ''}${r.sm.map(e => `<div class="small text-2" title="${esc(`${e.metric}: ${e.estimate}`)}">${esc(shortEst(e.estimate))} <span class="dim">${esc(markLabel(e.metric))}</span></div>`).join('')}${r.co.id === 'ts' ? '<a class="small" href="#/ts/filings?deal=1">Lender filings →</a>' : !r.lm && !r.sm.length ? '<span class="dim">none public</span>' : ''}` },
    ],
  });

  // hold bars, with the exited company as the template
  const hb = [...holds.map(r => ({ label: `${r.co.short} · ${monLabel(r.entry)}`, value: +r.held.toFixed(2), color: r.co.color })), { label: `${tpl.company} (exited)`, value: +tpl.hold.toFixed(2), color: 'var(--sys-brand)' }].sort((a, b) => b.value - a.value);
  el.querySelector('#dl-hold').innerHTML = `${charts.hbar(hb, { fmt: v => `${fmt.num(v, 1)} yrs`, labelW: 170 })}<div class="small dim mt-8">${esc(tpl.company)}: ${esc(tpl.note)}. Add-ons to date: ${fmt.num(addOnsAll)} (${board.map(r => `${esc(r.co.short)} ${fmt.num(r.addOns)}`).join(' · ')}).</div>`;

  // marks list
  const mk = [];
  for (const r of board) {
    if (r.lm) mk.push({ r, t: `Lender mark ${fmt.num(r.lm.v, 1)}% of par`, s: `${r.lm.item.filer_or_source_agency || r.lm.item.title || ''} · ${r.lm.item.filed_or_dated || ''}`, url: r.lm.item.source_url, c: r.lm.v < 90 ? 'var(--sys-bad-ink)' : 'var(--sys-warn-ink)' });
    r.sm.forEach(e => mk.push({ r, t: `${e.metric}: ${e.estimate}`, s: e.basis || '', c: /~0|≤1%|write/i.test(e.estimate) ? 'var(--sys-bad-ink)' : 'var(--sys-good-ink)' }));
  }
  const tsMarks = `<div class="sig">${fmt.chip('TS', COS.find(c => c.id === 'ts')?.color || 'var(--co-ts)')}<div class="grow"><div class="t">Lender filings, with the filing and date on each number</div><div class="small dim"><a href="#/ts/filings?deal=1">Open what lenders' public filings show →</a></div></div></div>`;
  el.querySelector('#dl-marks').innerHTML = tsMarks + (mk.length ? mk.map(x => `<div class="sig">${fmt.chip(x.r.co.short, x.r.co.color)}<div class="grow"><div class="t" style="color:${x.c}">${esc(x.t)}</div><div class="small dim">${esc(clip(x.s, 200))}${x.url ? ` · ${fmt.link(x.url, 'Source ↗')}` : ''}</div></div></div>`).join('') : '');

  // signals: operating metrics only (value, debt and marks are in the table above)
  const sig = [];
  for (const { co, d } of cos) {
    const pool = toArr(d?.meta?.estimate_table).filter(e => !isSens(e));
    const hi = pool.filter(e => e.confidence === 'high');
    const pick = (hi.length >= 2 ? hi : pool.filter(e => e.confidence !== 'low')).map(e => ({ e, s: (/territor|billings|headcount|employees|run-rate|fees|revenue|equity invested|equity in/i.test(e.metric) ? 2 : 0) + (e.confidence === 'high' ? 1 : 0) })).sort((a, b) => b.s - a.s).slice(0, 2);
    pick.forEach(({ e }) => sig.push({ co, e }));
  }
  el.querySelector('#fin-signals').innerHTML = sig.length ? sig.map(({ co, e }) => `<div class="sig" title="${esc(Copy.text(e.basis || ''))}">${fmt.chip(co.short, co.color)}<div class="grow"><div class="t">${confDot(e.confidence)}${esc(e.metric)}</div><div class="v">${esc(e.estimate)}</div></div></div>`).join('') : ui.empty('No high-confidence estimates yet');

  // company panels
  el.querySelector('#fin-cos').innerHTML = cos.map(({ co, d }) => {
    if (!d) return ui.panel({ title: `<span class="fin-co-head"><i class="sys-dot fin-dot" aria-hidden="true" style="--co:${co.color}"></i>${esc(co.name)}</span>`, sub: 'Filings dataset pending', body: `${ui.note(`<b>${esc(Copy.dataset(co.ds))}</b> is still being verified. Comps for ${esc(SECTORS[co.sector]?.label || '')} are live in <a href="#/fin/comps?sector=${co.sector}">Public comparables</a>.`, 'warn')}`, actions: `<a class="fin-link" href="#/${co.id}">Open →</a>` });
    const m = d.meta || {}; const est = toArr(m.estimate_table); const opEst = est.filter(e => !isSens(e));
    const cats = {}; (d.items || []).forEach(i => { cats[i.category] = (cats[i.category] || 0) + 1; });
    const pri = opEst.map((e, i) => ({ e, i, s: (/revenue|EBITDA|equity|headcount|employees|territor/i.test(e.metric) ? 2 : 0) + (e.confidence === 'high' ? 1 : 0) - (/payroll|per /i.test(e.metric) ? 1 : 0) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 5).sort((a, b) => a.i - b.i).map(x => x.e);
    const lead = opSegments(m.financial_picture)[0] || segments(m.financial_picture)[0];
    return ui.panel({
      title: `<span class="fin-co-head"><i class="sys-dot fin-dot" aria-hidden="true" style="--co:${co.color}"></i>${esc(co.name)}</span>`,
      sub: `${fmt.num((d.items || []).length)} records · ${fmt.num(opEst.length)} operating estimates · generated ${esc(m.generated || '')}`,
      actions: `<a class="fin-link" href="#/fin/explorer?company=${co.id}">Filings →</a>`,
      body: `<div class="fin-excerpt">${lead ? esc(sentences(lead, 2)) : '<span class="dim">—</span>'}</div>
        <div class="sys-table-wrap"><table class="sys-table fin-mini"><tbody>${pri.map(e => `<tr title="${esc(Copy.text(e.basis || ''))}"><td class="m">${esc(e.metric)}</td><td class="v">${esc(shortEst(e.estimate).slice(0, 34))}</td><td class="c">${confDot(e.confidence)}</td></tr>`).join('') || '<tr><td>No estimates</td></tr>'}</tbody></table></div>
        <div class="sys-chips fin-chips">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<a href="#/fin/explorer?company=${co.id}&category=${encodeURIComponent(c)}" style="text-decoration:none">${fmt.chip(`${catLabel(c)} ${n}`, co.color)}</a>`).join('')}</div>
        <div class="row mt-8"><button class="sys-btn sys-btn--secondary sys-btn--sm btn xs" data-open="${co.id}">Estimates & gaps</button><a class="sys-btn sys-btn--secondary sys-btn--sm btn xs" href="#/${co.id}">Open ${esc(co.short)}</a></div>`,
      foot: ui.source(srcList(m).slice(0, 2).join(' · ').slice(0, 140) || 'SEC EDGAR, SBA PPP, state registries', null, m.generated),
    });
  }).join('');
  el.querySelectorAll('#fin-cos [data-open]').forEach(b => b.onclick = () => { const r = board.find(x => x.id === b.dataset.open); if (r) openCompany(ctx, r); });

  // ledger chart (Form D amounts sold are public and already on EDGAR)
  const led = [...(fundSold ? [{ label: 'Fund I', value: fundSold, color: 'var(--sys-brand)' }] : []), ...vehicles.map(v => ({ label: `${v.vehicle}`, value: v.sold_usd, color: (COS.find(c => c.ledger.test(v.company)) || {}).color }))].sort((a, b) => b.value - a.value);
  const fhRaise = (capital?.deal_vehicles || []).find(v => /issuer Form D/i.test(v.vehicle));
  el.querySelector('#fin-ledger').innerHTML = led.length ? `${charts.hbar(led, { fmt: v => fmt.money(v), labelW: 170 })}<div class="sys-chips legend mt-12">${COS.filter(c => vehicles.some(v => c.ledger.test(v.company))).map(c => `<span><i style="background:${c.color}"></i>${esc(c.short)}</span>`).join('')}<span><i style="background:var(--sys-brand)"></i>Fund I</span></div>${fhRaise ? `<div class="small dim mt-8">Fair Harbor: issuer-level Form D ${fmt.money(fhRaise.sold_usd)} sold (${esc(fhRaise.first_sale || '')}) alongside the BSP round — not a BSP vehicle.</div>` : ''}<div class="small dim mt-8">No Punctual Pros SPV exists on EDGAR: PP was funded from Fund I alone.</div>` : ui.note('BSP firm profile ledger not available yet.', 'warn');

  vehiclesTable(ctx, el.querySelector('#fin-veh'), rows);

  // pulls: the first queued public-record pull per company that is not about marks or debt, then the BSP-level one
  const acts = [];
  for (const { co, d } of cos) {
    const np = toArr(d?.meta?.next_pulls).map(clean).find(t => !SENS_TEXT.test(t));
    if (np) acts.push({ chip: co.short, color: co.color, text: clip(np, 260) });
    else if (!d) acts.push({ chip: co.short, color: co.color, text: `Complete ${Copy.dataset(co.ds)}: issuer Form D, state filings and benchmarks against the ${SECTORS[co.sector]?.label || ''} comp set.` });
  }
  if (fundGav) acts.push({ chip: 'BSP', color: 'var(--sys-brand)', text: `Watch the Mar 31 Form ADV amendment: Fund I gross assets (${fmt.money(fundGav)}) and any new Fund II vehicle are the cleanest public read on marks and fundraising.` });
  el.querySelector('#fin-acts').innerHTML = actionList(ctx, acts);

  app.index(companyRows.slice(0, 200).map(r => ({ label: r.title, sub: `${r._coName} · ${catLabel(r.category)} · ${r.filed_or_dated || ''}`, href: `#/fin/explorer?company=${r._co}&q=${encodeURIComponent(String(r.entity || '').slice(0, 30))}`, kind: 'Filing', color: 'var(--c-fin)' })));
}

/* Row panel for a company: the financial picture, the estimate list both tables share (r.estShown), gaps and the next pull.
   Thomas Scientific's lender and sponsor marks are shown in one place, with their filings (#/ts/filings?deal=1), so the paragraphs,
   gaps and pull that state a mark are left out of its panel, as its mark row is left out of the estimate list. */
const MARK_TEXT = /\bmark(s|ed|ing)?\b|of par|fair value|impair/i;
function openCompany(ctx, r) {
  const { esc, fmt, inspector, app, ui } = ctx;
  const co = r.co, d = r.d;
  if (!d) { inspector.open({ title: esc(co.name), sub: 'Filings dataset pending', color: co.color, sections: [{ label: 'Status', html: ui.note(`Public filings for ${esc(co.name || co.short || 'this company')} are not available yet.`, 'warn') }] }); return; }
  const m = d.meta || {};
  const est = r.estShown || [], ts = co.id === 'ts';
  const segs = segments(m.financial_picture).filter(s => !ts || !MARK_TEXT.test(s));
  const pull = toArr(m.next_pulls).map(clean).find(t => !ts || !SENS_TEXT.test(t));
  inspector.open({
    title: esc(co.name), color: co.color, sub: `${fmt.num((d.items || []).length)} records · generated ${esc(m.generated || '')}`,
    sections: [
      { label: 'Financial picture', html: `<div class="small text-2" style="line-height:1.55">${segs.map(s => `<p class="mb-8">${esc(clean(s))}</p>`).join('') || '—'}</div>` },
      { label: 'Estimate table', html: `<div class="fin-insp sys-table-wrap"><table class="sys-table"><thead><tr><th>Metric</th><th class="sys-n n">Estimate</th></tr></thead><tbody>${est.map(e => `<tr title="${esc(Copy.text(e.basis || ''))}"><td>${confDot(e.confidence)}${esc(e.metric)}<div class="dim small">${esc(e.basis || '')}</div></td><td class="sys-n n">${esc(e.estimate)}</td></tr>`).join('')}</tbody></table></div>${ts ? `<div class="small dim mt-8">Lender and sponsor marks are shown with their filings: <a href="#/ts/filings?deal=1">Thomas Scientific · lender filings →</a></div>` : ''}` },
      { label: 'Data gaps', html: `<ul class="prose small">${toArr(m.data_gaps).map(clean).filter(g => !ts || !MARK_TEXT.test(g)).map(g => `<li>${esc(g)}</li>`).join('') || '<li>—</li>'}</ul>` },
      { label: 'Next public-record pull', html: `<div class="small text-2">${esc(pull || 'Commission a PitchBook / Capital IQ pull for the deal record.')}</div>` },
      { label: 'Sources', html: `<div class="small dim">${esc(srcList(m).join(' · ') || asText(m.method).slice(0, 400))}</div>` },
    ],
    actions: [{ id: 'fx', label: 'Open filings', onClick: () => app.go('fin', 'explorer', { company: co.id }) }, { id: 'md', label: `Open ${esc(co.short)}`, onClick: () => app.go(co.id) }],
  });
}

function vehiclesTable(ctx, host, rows) {
  const { esc, fmt, ui } = ctx;
  if (!host) return;
  const vrows = rows.filter(r => r.category === 'sec_form_d' || r.category === 'form_adv').map(r => {
    const kf = r.key_figures;
    const mx = a => a.length ? Math.max(...a) : -Infinity;
    let sold = mx(numKF(kf, /sold/i, /offering|remaining|min|fee|investors|owners|change|increase/i).filter(v => v >= 1e5));
    const gav = mx(numKF(kf, /gav|aum/i).filter(v => v >= 1e5));
    if (!isFinite(sold) && r.category === 'sec_form_d') sold = mx(numKF(kf, /_usd$/i, /min|fee|offering|remaining|investors|owners|change|increase|par/i).filter(v => v >= 1e5));
    const offKV = flatKF(kf).find(([k, v]) => /total_offering|offering_amount|offering_usd/i.test(k) && (typeof v === 'number' || typeof v === 'string'));
    const offering = offKV ? offKV[1] : null;
    const inv = mx(numKF(kf, /investor|owners/i));
    return { ...r, _bsp: isBsp(r), _headline: r.category === 'form_adv' && isFinite(gav) ? gav : isFinite(sold) ? sold : isFinite(gav) ? gav : null, _hlKind: r.category === 'form_adv' && isFinite(gav) ? 'GAV/AUM' : isFinite(sold) ? 'sold' : isFinite(gav) ? 'GAV' : '', _offering: offering ?? null, _inv: isFinite(inv) ? inv : null };
  });
  if (!vrows.length) { host.innerHTML = ui.empty('No Form D / ADV records loaded'); return; }
  ui.table(host, {
    rows: vrows, pageSize: 12, exportName: 'bsp_form_d_adv_records', sortKey: '_date', rowKey: r => r._key, onRow: r => openItem(ctx, r),
    columns: [
      { key: 'entity', label: 'Entity', wrap: true, width: '300px', fmt: (v, r) => `<b>${esc(String(v).slice(0, 80))}</b><div class="small dim">${esc(String(r.title || '').slice(0, 90))}</div>` },
      { key: '_bsp', label: 'Owner', fmt: (v, r) => v ? fmt.chip('BSP', 'var(--sys-brand)') : fmt.chip('3rd party', 'var(--sys-mute)') },
      { key: 'category', label: 'Form', fmt: v => v === 'form_adv' ? 'ADV' : 'D' },
      { key: '_offering', label: 'Offering', num: true, fmt: v => typeof v === 'number' ? fmt.money(v) : esc(v ?? '—') },
      { key: '_headline', label: 'Sold / GAV', num: true, fmt: (v, r) => v == null ? '—' : `${fmt.money(v)}<span class="dim small"> ${r._hlKind}</span>` },
      { key: '_inv', label: 'Investors', num: true, fmt: v => fmt.num(v) },
      { key: '_date', label: 'Dated', num: true, fmt: (v, r) => `<span title="${esc(r.filed_or_dated || '')}">${v ? fmt.date(v) : '—'}</span>` },
      { key: '_coName', label: 'Source', fmt: (v, r) => fmt.chip(v, r._color) },
      { key: 'source_url', label: 'Link', fmt: v => v ? fmt.link(v, 'EDGAR ↗') : '—' },
    ],
  });
}

/* ═══ View 2: Filings explorer ══════════════════════════════════════════════ */
async function explorerView(ctx) {
  const { el, ui, fmt, esc, charts, params, app } = ctx;
  injectCss();
  el.innerHTML = ui.loading('Indexing filings…');
  const D = await loadAll(ctx);
  const rows = D.rows;
  if (!rows.length) { el.innerHTML = ui.note('No filings datasets are available yet.', 'warn'); return; }
  const cats = [...new Set(rows.map(r => r._cat))].sort((a, b) => rows.filter(r => r._cat === b).length - rows.filter(r => r._cat === a).length);
  const hi = rows.filter(r => r.confidence === 'high').length;
  const missing = D.cos.filter(x => !x.d).map(x => x.co.short);
  const recent = rows.filter(r => r._date && !/^(other|industry_benchmark|ranking_listing)$/.test(r._cat)).sort((a, b) => b._date.localeCompare(a._date)).slice(0, 7);
  const groups = [...COS.filter(c => D.cos.find(x => x.co.id === c.id)?.d), ...(D.rival ? [RIVAL] : [])];
  const topCats = cats.slice(0, 9);

  el.innerHTML = `<div class="m-fin">${ui.pageHead({
    title: 'Filings explorer',
    sub: `${fmt.num(rows.length)} primary records, ${fmt.num(Math.round(hi / rows.length * 100))}% high confidence. Lender schedules and Form D filings carry the hard numbers.`,
    chips: missing.length ? fmt.chip(`Pending: ${missing.join(', ')}`, 'var(--sys-warn)') : '',
  })}
  ${ui.kpis([
    { label: 'Records', value: fmt.num(rows.length), sub: `${groups.length} sources`, color: 'var(--c-fin)' },
    { label: 'High confidence', value: `${fmt.num(Math.round(hi / rows.length * 100))}%`, sub: `${fmt.num(hi)} records`, color: 'var(--sys-good)' },
    { label: 'Categories', value: fmt.num(cats.length), sub: `top: ${esc(catLabel(cats[0]))}`, color: 'var(--c-pe)' },
    { label: 'BDC / lender lines', value: fmt.num(rows.filter(r => /bdc_loan_schedule|lender_press/.test(r._cat)).length), sub: 'debt marks & pricing', color: 'var(--co-ts)' },
    { label: 'Latest record', value: recent[0] ? fmt.dateShort(recent[0]._date) : '—', sub: recent[0] ? esc(`${recent[0]._coName} · ${catLabel(recent[0]._cat)}`) : '', color: 'var(--sys-brand)' },
  ])}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Coverage matrix', sub: 'Records by source × category — where the evidence is thick and where it is thin', body: charts.heatgrid(groups.map(g => g.short), topCats.map(catShort), groups.map(g => topCats.map(c => rows.filter(r => r._co === g.id && r._cat === c).length || null)), { fmt: v => v ?? '', color: '139,211,255' }), foot: ui.source('Company public filings and competitor filings', null, 'Sept 2026') })}
    ${ui.panel({ title: 'Most recent filings', sub: 'Newest dated primary filings (archived web pages excluded) — read these first', foot: ui.source('Company public filings (filing dates)', null, 'Sept 2026'), body: `<div id="fx-recent">${recent.map(r => `<div class="sig" data-k="${esc(r._key)}" style="cursor:pointer">${fmt.chip(r._coName, r._color)}<div class="grow"><div class="t">${esc(r.title.slice(0, 110))}</div><div class="v small">${fmt.date(r._date)} · ${esc(catLabel(r._cat))}</div></div></div>`).join('')}</div>` })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'All filings', sub: 'Click a row for key figures, interpretation, source and next action', body: '<div id="fx-f"></div><div id="fx-t"></div>', foot: ui.source('SEC EDGAR · SBA PPP FOIA · state registries · FDDs · BDC 10-Q/10-K', 'https://efts.sec.gov/LATEST/search-index?q=%22Broad%20Sky%22', 'Sept 2026') })}</div>
  <div class="mt-12">${ui.panel({ title: 'Next actions', sub: 'Turn the index into diligence requests', body: `<div id="fx-acts"></div>`, foot: ui.source('Counts from the filings index above', null, 'Sept 2026') })}</div>
  </div>`;

  el.querySelectorAll('#fx-recent [data-k]').forEach(n => n.onclick = () => { const r = rows.find(x => x._key === n.dataset.k); if (r) openItem(ctx, r); });
  const columns = [
    { key: '_coName', label: 'Source', fmt: (v, r) => fmt.chip(v, r._color), width: '70px' },
    { key: '_cat', label: 'Category', fmt: v => `<span class="small text-2">${esc(catLabel(v))}</span>` },
    { key: 'entity', label: 'Entity', wrap: true, fmt: v => `<span class="small">${esc(String(v || '').slice(0, 70))}</span>`, width: '190px' },
    { key: 'title', label: 'Filing / record', wrap: true, fmt: (v, r) => `<b>${esc(String(v).slice(0, 120))}</b><div class="dim small">${esc(String(r.filer_or_source_agency || '').slice(0, 80))}</div>` },
    { key: '_date', label: 'Dated', num: true, fmt: v => v ? fmt.date(v) : '—', width: '96px' },
    { key: '_kf', label: 'Key figures', wrap: true, fmt: v => `<span class="num small text-2">${esc(v.slice(0, 170))}</span>` },
    { key: 'confidence', label: 'Conf.', fmt: v => fmt.chip(v || 'n/a', confColor(v)) },
    { key: 'source_url', label: 'Src', fmt: v => v ? fmt.link(v, '↗') : '—' },
  ];
  let tbl;
  const f = ui.filters(el.querySelector('#fx-f'), [
    { key: 'q', label: 'Search entity, figure, text…', type: 'search', value: params.q || '' },
    { key: 'company', label: 'Source', options: groups.map(g => ({ value: g.id, label: g.id === 'rival' ? 'Rival companies' : g.name })), value: params.company || '' },
    { key: 'category', label: 'Category', options: cats.map(c => ({ value: c, label: catLabel(c) })), value: params.category || '' },
    { key: 'confidence', label: 'Confidence', options: ['high', 'medium', 'low'], value: params.confidence || '' },
    { key: 'bsp', label: 'BSP vehicles only', type: 'toggle', value: false },
  ], st => apply(st));
  function apply(st) {
    const q = (st.q || '').toLowerCase();
    const out = rows.filter(r => (!st.company || r._co === st.company) && (!st.category || r._cat === st.category) && (!st.confidence || r.confidence === st.confidence) && (!st.bsp || isBsp(r)) && (!q || JSON.stringify(r).toLowerCase().includes(q)));
    f.setCount(`${out.length} / ${rows.length}`);
    tbl ? tbl.update(out) : (tbl = ui.table(el.querySelector('#fx-t'), { columns, rows: out, pageSize: 25, sortKey: '_date', exportName: 'bsp_filings_explorer', rowKey: r => r._key, onRow: r => openItem(ctx, r) }));
  }
  apply(f.state);

  const acts = [
    { chip: 'BDC', color: 'var(--co-ts)', text: `Diary the next BDC 10-Q cycle (early Nov 2026) for the ${rows.filter(r => r._cat === 'bdc_loan_schedule' && r._co !== 'rival').length} portfolio and ${rows.filter(r => r._cat === 'bdc_loan_schedule' && r._co === 'rival').length} rival loan lines: marks, PIK toggles, non-accruals.` },
    { chip: 'Form D', color: 'var(--sys-brand)', text: 'Set an EDGAR alert on "BSP-" and "Broad Sky" Form D filings: a new SPV is the earliest public tell of a new company or add-on equity raise.' },
    { chip: 'UCC', color: 'var(--sys-warn)', text: `Run UCC-1 searches in MA, CT, PA, NJ, DE and MO to identify agent banks where no BDC line exists (${rows.filter(r => r._cat === 'ucc_lien').length} lien records found so far).` },
    { chip: 'PPP', color: 'var(--co-pp)', text: `Use the ${rows.filter(r => r._cat === 'sba_ppp').length} PPP records as pre-deal payroll anchors and compare them with current headcount to size organic growth since 2020.` },
  ];
  el.querySelector('#fx-acts').innerHTML = actionList(ctx, acts);
  app.index(rows.slice(0, 300).map(r => ({ label: `${r.entity}`.slice(0, 80), sub: `${r._coName} · ${catLabel(r._cat)} · ${r.filed_or_dated || ''}`, href: `#/fin/explorer?q=${encodeURIComponent(String(r.entity || '').slice(0, 30))}`, kind: 'Filing', color: 'var(--c-fin)' })));
}

/* ═══ View 3: Public comparables ════════════════════════════════════════════ */
function scatter(ctx, comps, meds, onPick) {
  const { esc, fmt } = ctx;
  const W = 760, H = 400, pl = 40, pr = 12, pt = 12, pb = 28;
  const xmin = -25, xmax = 55, ymin = -10, ymax = 32;
  const X = v => pl + (Math.max(xmin, Math.min(xmax, v)) - xmin) / (xmax - xmin) * (W - pl - pr);
  const Y = v => pt + (1 - (Math.max(ymin, Math.min(ymax, v)) - ymin) / (ymax - ymin)) * (H - pt - pb);
  const gx = [-20, -10, 0, 10, 20, 30, 40, 50].map(v => `<g class="g"><line x1="${X(v)}" x2="${X(v)}" y1="${pt}" y2="${H - pb}"/><text x="${X(v)}" y="${H - 10}" text-anchor="middle">${v}%</text></g>`).join('');
  const gy = [-10, 0, 10, 20, 30].map(v => `<g class="g"><line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${pl - 5}" y="${Y(v) + 3}" text-anchor="end">${v}%</text></g>`).join('');
  const md = meds.g != null && meds.m != null ? `<g class="md"><line x1="${X(meds.g)}" x2="${X(meds.g)}" y1="${pt}" y2="${H - pb}"/><line x1="${pl}" x2="${W - pr}" y1="${Y(meds.m)}" y2="${Y(meds.m)}"/></g>` : '';
  const pts = comps.filter(c => c.revenue_growth_latest_pct != null && c.ebitda_margin_latest_pct != null).map(c => {
    const col = coById(SECTORS[c.sector_tag]?.co)?.color || 'var(--sys-info)';
    const out = c.ebitda_margin_latest_pct < ymin || c.revenue_growth_latest_pct < xmin || c.revenue_growth_latest_pct > xmax || c.ebitda_margin_latest_pct > ymax;
    return `<g data-t="${esc(c.ticker)}"><circle cx="${X(c.revenue_growth_latest_pct)}" cy="${Y(c.ebitda_margin_latest_pct)}" r="5" style="fill:${col}"><title>${esc(c.ticker)} · ${esc(c.company)}: growth ${sPct(fmt, c.revenue_growth_latest_pct)}, EBITDA margin ${pctF(fmt, c.ebitda_margin_latest_pct)}${out ? ' (off-scale, clamped)' : ''}</title></circle><text class="lbl" x="${X(c.revenue_growth_latest_pct) + 7}" y="${Y(c.ebitda_margin_latest_pct) + 3}">${esc(c.ticker)}${out ? '*' : ''}</text></g>`;
  }).join('');
  return `<svg class="sc chart" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${gx}${gy}${md}<text x="${W - pr}" y="${pt + 10}" text-anchor="end">↑ EBITDA margin (latest FY)</text><text x="${W - pr}" y="${H - pb - 6}" text-anchor="end">revenue growth →</text>${pts}</svg>`;
}

/* Public-affairs transactions: BPI's primary valuation benchmark (PPHC as the public floor, FGS / KKR as the ceiling, Penta and Teneo
   as sponsor-exit analogs). Moved here from the BPI benchmarks screen. PPHC is record bpi-022 of BPI's filings, FGS is rival-046 of the
   rival filings, the three analogs are in BPI's growth plan. */
const recById = (ds, id) => (ds?.items || []).find(i => i.id === id) || null;
const dateWords = s => { const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +(m[3] || 15)).toLocaleDateString('en-US', m[3] ? { month: 'long', day: 'numeric', year: 'numeric' } : { month: 'long', year: 'numeric' }) : s; };
function publicAffairsDeals(bpiF, rivalF, plan) {
  const pi = recById(bpiF, 'bpi-022'), pk = pi?.key_figures || {}, fgs = recById(rivalF, 'rival-046'), fgsT = recById(plan, 'tpl-fgs-03'), penta = recById(plan, 'tpl-penta-03'), teneo = recById(plan, 'tpl-teneo-01');
  const fgsEst = (rivalF?.meta?.estimate_table || []).find(e => /FGS.*EBITDA/i.test(e.metric));
  return [
    pi && { id: 'pphc', deal: 'PPHC: Nasdaq IPO', date: '2026-01', buyer: 'Public market', ev: pk.implied_EV_usd_m ? pk.implied_EV_usd_m * 1e6 : null, evTxt: pk.implied_EV_usd_m ? `$${pk.implied_EV_usd_m}M` : '—', mult: `${pk.implied_EV_to_2025_adj_EBITDA || '—'} 2025 adj. EBITDA`, scale: `$${pk.revenue_2025_usd_m}M revenue · ${pk.adj_EBITDA_margin_2025} adj. EBITDA margin · ${pk.organic_growth_2025} organic growth`, role: 'Floor (public multiple)', confidence: pi.confidence || 'high', lesson: pi.what_it_tells_us, src: [pi.source_url], retrieved: pi.retrieved },
    fgs && { id: 'fgs', deal: 'FGS Global: WPP sells ~50% to KKR', date: fgsT?.date || fgs.filed_or_dated || '2024-08', buyer: 'KKR', ev: fgs.key_figures?.enterprise_value_usd, evTxt: '$1.7B', mult: fgsEst ? `~12-16x 2023 EBITDA (est.; EBITDA ${fgsEst.estimate})` : 'not disclosed', scale: `${fgs.key_figures?.experts || '—'} experts · ${fgs.key_figures?.clients || '—'} clients`, role: 'Ceiling (scaled strategic comms)', confidence: `EV high · multiple ${fgsEst?.confidence || 'n/a'}`, lesson: fgsT?.lesson_for_bpi || fgs.what_it_tells_us, src: [fgs.source_url, fgsT?.source_url], retrieved: fgs.retrieved },
    penta && { id: 'penta', deal: 'Penta Group: Falfurrias sells to Shamrock Capital', date: penta.date, buyer: 'Shamrock Capital', ev: null, evTxt: 'undisclosed', mult: 'terms undisclosed', scale: penta.metric, role: 'Closest analog (~$100M rev., data-led)', confidence: penta.confidence, lesson: penta.lesson_for_bpi, src: [penta.source_url], retrieved: penta.retrieved },
    teneo && { id: 'teneo', deal: 'Teneo: CVC Fund VII replaces BC Partners', date: teneo.date, buyer: 'CVC', ev: 7e8, evTxt: '~$700M (reported)', mult: 'not disclosed', scale: teneo.metric, role: 'Sponsor-to-sponsor analog', confidence: teneo.confidence, lesson: teneo.lesson_for_bpi, src: [teneo.source_url], retrieved: teneo.retrieved },
  ].filter(Boolean);
}
/* names as a reader says them, for headings ("What this implies for Punctual Pros") */
const CO_SAY = { cet: 'CET', pp: 'Punctual Pros', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor' };
/* drafting notes in the dataset's company label never reach the page */
/* Smith + Howard was sold (August 2026): the comps dataset still lists it beside Frontline, so drop it at draw time ("Frontline (and Smith + Howard via CBIZ)" → "Frontline") */
const noSH = t => String(t ?? '').replace(/\s*\(and Smith \+ Howard via CBIZ\)/g, '').replace(/,\s*Smith \+ Howard(?=[,)])/g, '');
const benchName = (b, co) => noSH(String(b.bsp_company || co?.name || '').replace(/\s*\(per brief\)/i, ''));
/* the Private equity landscape's Overlap filter key for a sector (same keys as OVERLAP above) */
const overlapKey = s => Object.keys(OVERLAP).find(k => OVERLAP[k].co === SECTORS[s]?.co);

/* The one comparables screen. With no parameter it shows everything: six sector cards, BPI's public-affairs transactions, all listed
   peers, the written synthesis and the benchmark estimates. ?sector=<key> puts that sector's read-out first (for communications
   agencies, the transactions lead) and narrows the charts and the table; an unknown key is treated as no sector. */
async function compsView(ctx) {
  const { el, ui, fmt, esc, params, inspector, app } = ctx;
  injectCss();
  el.innerHTML = ui.loading('Loading public comparables…');
  const [pc, bpiF, rivalF, bpiPlan] = await Promise.all(['public_comps', 'bpi_filings', 'rival_filings', 'bpi_playbook'].map(n => ctx.data.research(n).catch(() => null)));
  if (!el.isConnected) return;
  if (!pc || !pc.items?.length) { el.innerHTML = `<div class="m-fin">${ui.pageHead({ title: 'Public comparables' })}${ui.note('Research dataset <b>Public comparables</b> not yet available.', 'warn')}</div>`; return; }
  const items = pc.items.map(c => { const fy = (c.fiscal_years || []).slice().sort((a, b) => b.fy - a.fy)[0] || {}; return { ...c, _rev: fy.revenue_usd ?? null, _emp: fy.employees ?? null, _ebitda: fy.ebitda_approx_usd ?? null, _sector: SECTORS[c.sector_tag]?.label || catLabel(c.sector_tag), _co: SECTORS[c.sector_tag]?.co }; });
  const bm = pc.meta?.sector_benchmarks || {};
  const allG = median(items.map(c => c.revenue_growth_latest_pct)), allM = median(items.map(c => c.ebitda_margin_latest_pct)), allO = median(items.map(c => c.operating_margin_latest_pct));
  const sectorOpts = Object.keys(SECTORS).filter(s => items.some(c => c.sector_tag === s)).map(s => ({ value: s, label: `${SECTORS[s].label} (${coById(SECTORS[s].co)?.short})` }));
  const sector0 = bm[params.sector] && sectorOpts.some(o => o.value === params.sector) ? params.sector : '';   // an unknown ?sector= shows every sector
  const best = items.slice().sort((a, b) => (b.revenue_growth_latest_pct ?? -99) - (a.revenue_growth_latest_pct ?? -99))[0];
  const fastSector = Object.entries(bm).sort((a, b) => (b[1].median_revenue_growth_latest_pct ?? -99) - (a[1].median_revenue_growth_latest_pct ?? -99))[0];
  const rollup = '#/deal/rollup?p=typical';

  /* BPI's transactions block (two full-width panels, so the table fits), built once; draw() places it under the cards (every sector)
     or at the top of the focus block (communications agencies) */
  const deals = bpiF && rivalF && bpiPlan ? publicAffairsDeals(bpiF, rivalF, bpiPlan) : [];
  const pk = recById(bpiF, 'bpi-022')?.key_figures || {};
  const fig = (l, v, s, tip) => `<div class="sys-kpi st"><div class="sys-kpi-label l" title="${esc(tip || l)}">${esc(l)}</div><div class="sys-kpi-value v">${v}</div>${s ? `<div class="sys-kpi-sub">${s}</div>` : ''}</div>`;
  let dealsHtml = '';
  if (deals.length) {
    const bpiEst = toArr(bpiF?.meta?.estimate_table);
    // value bridge: BPI's estimated adj. EBITDA range times the PPHC floor multiple
    const eb = String(bpiEst.find(e => /adj\. ebitda/i.test(e.metric))?.estimate || '').match(/\$(\d+)\s*[-–]\s*(\d+)M/);
    const lo = eb ? +eb[1] : null, hi = eb ? +eb[2] : null, floor = parseFloat(String(pk.implied_EV_to_2025_adj_EBITDA || '').replace(/[^\d.]/g, '')) || null;
    const bridge = lo && floor ? `On $${lo}-${hi}M EBITDA (est.), the floor implies ~$${Math.round(lo * floor)}-${Math.round(hi * floor)}M EV.` : '';
    const cmp = bpiEst.filter(e => /revenue|ebitda|headcount|margin|value/i.test(e.metric)).slice(0, 6);
    const hasFgs = deals.some(x => x.id === 'fgs');
    const grew = pk.revenue_2024_usd_m ? sPct(fmt, (pk.revenue_2025_usd_m / pk.revenue_2024_usd_m - 1) * 100) : '';
    dealsHtml = `<div class="mt-12">${ui.panel({ cls: 'bench bench-wide', title: `<span class="fin-co-head"><i class="sys-dot fin-dot" aria-hidden="true" style="--co:var(--co-bpi)"></i>Public-affairs transactions (BPI's primary benchmark)</span>`, sub: 'Valuation floor, ceiling and sponsor-exit analogs. The listed agency holding companies are secondary reference only (ad/marketing holding cos., not public-affairs peers). Click a row for terms, lesson and sources.',
        body: `<div class="sys-kpis stats">${fig('PPHC EV / adj. EBITDA', esc(pk.implied_EV_to_2025_adj_EBITDA || '—'), `public floor · EV $${esc(pk.implied_EV_usd_m ?? '—')}M`)}${fig('FGS Global EV (KKR, 2024)', hasFgs ? '$1.7B' : '—', hasFgs ? '~12-16x 2023 EBITDA (est.) · ceiling' : 'not available')}${fig('PPHC adj. EBITDA margin', esc(pk.adj_EBITDA_margin_2025 || '—'), `2024 ${esc(pk.adj_EBITDA_margin_2024 || '—')} · BPI est. 18-24%`)}${fig('PPHC organic growth', esc(pk.organic_growth_2025 || '—'), grew ? `2025 · reported ${grew} incl. M&A` : '2025')}</div><div id="cp-deal-tbl"></div>`,
        foot: ui.source('BPI public filings: PPHC annual report (10-K), competitor filings (WPP 6-K), BPI growth plan templates', recById(bpiF, 'bpi-022')?.source_url, 'October 6, 2026') })}</div>
      <div class="mt-12">${ui.panel({ title: 'What this implies for BPI', accent: true, body: `<div class="grid grid-2"><ol class="prose small"><li><b>Underwrite to the PPHC floor.</b> ${esc(bridge || 'PPHC trades at ~8.4x 2025 adj. EBITDA.')}</li><li><b>Earn the sponsor premium.</b> FGS, Penta and Teneo cleared above the public multiple on scale, transatlantic reach and proprietary data. BPI needs off-year resilience and recurring retainers to get there.</li><li><b>Match PPHC's disclosure.</b> PPHC reports organic growth and a corporate-affairs segment; BPI's board pack should too.</li></ol><div>${cmp.length ? `<h4 class="sys-card-label">BPI estimates (filings) for comparison</h4><div class="fin-insp sys-table-wrap mt-8"><table class="sys-table"><tbody>${cmp.map(e => `<tr title="${esc(Copy.text(e.basis || ''))}"><td>${confDot(e.confidence)}${esc(e.metric)}</td><td class="sys-n n">${esc(e.estimate)}</td><td>${fmt.chip(e.confidence || 'n/a', confColor(e.confidence))}</td></tr>`).join('')}</tbody></table></div>` : ''}<div class="small text-2 mt-12">The same sponsors bid against BPI for add-ons and are its likely exit buyers. <a href="#/pe/landscape?overlap=bpi">Sponsors that overlap BPI: Private equity →</a></div></div></div>`,
        foot: ui.source('Bully Pulpit International public filings estimate table; BPI growth plan, phase 4', null, 'October 6, 2026') })}</div>`;
  }
  const openDeal = x => inspector.open({ title: esc(x.deal), sub: `${esc(dateWords(x.date))} · ${esc(x.role)}`, color: 'var(--co-bpi)', sections: [
    { label: 'Terms', html: ui.kv({ Buyer: esc(x.buyer), 'Enterprise value': esc(x.evTxt), Multiple: esc(x.mult), Scale: esc(x.scale), Confidence: esc(x.confidence) }) },
    { label: 'Lesson for BPI', html: `<div class="small text-2">${esc(clean(x.lesson || '—'))}</div>` },
    { label: 'Sources', html: `<div class="col gap-4 small">${(x.src || []).filter(Boolean).map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(fmt.host(u) || u)} ↗</a>`).join('') || '<span class="dim">No source link</span>'}</div><div class="dim small mt-8">Retrieved ${esc(x.retrieved || '')}</div>` },
    { label: 'Next action', html: `<div class="small text-2">Add ${esc(x.deal.split(':')[0])} to the exit comp set in the BPI board pack and refresh it when new terms are disclosed.</div>` },
  ], actions: x.src?.[0] ? [{ label: 'Open source ↗', href: x.src[0] }] : [] });
  const wireDeals = () => { const host = el.querySelector('#cp-deal-tbl'); if (host && deals.length) ui.table(host, { rows: deals, pageSize: 10, sortKey: 'date', exportName: 'bpi_public_affairs_deals', onRow: openDeal, columns: [
    { key: 'deal', label: 'Transaction', wrap: true, fmt: (v, r) => `<div style="min-width:150px"><b>${esc(v)}</b><div class="dim small">${esc(r.role)}</div></div>` },
    { key: 'date', label: 'Date', fmt: v => esc(dateWords(v)) },
    { key: 'ev', label: 'EV', num: true, fmt: (v, r) => esc(r.evTxt) },
    { key: 'mult', label: 'Multiple', wrap: true, fmt: v => `<span class="small">${esc(v)}</span>` },
    { key: 'scale', label: 'Scale', wrap: true, fmt: v => `<span class="small text-2">${esc(v)}</span>` },
    { key: 'src', label: 'Source', fmt: v => fmt.link(v?.[0]) },
  ] }); };

  el.innerHTML = `<div class="m-fin">${ui.pageHead({
    title: 'Public comparables',
    sub: fastSector ? `Across ${fmt.num(items.length)} public peers, ${esc(SECTORS[fastSector[0]]?.label || fastSector[0])} grows fastest (${sPct(fmt, fastSector[1].median_revenue_growth_latest_pct)} median). Median EBITDA margin is ${pctF(fmt, allM)}.` : `${esc(sentences(pc.meta?.financial_picture, 1))}`,
    chips: `${fmt.chip(`${items.length} listed peers`, 'var(--c-fin)')}${fmt.chip('SEC XBRL', 'var(--sys-mute)')}${fmt.chip('EBITDA not adjusted', 'var(--sys-warn)')}`,
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="${rollup}">Size an add-on in the roll-up model →</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/fin/portfolio">Portfolio picture</a>`,
  })}
  ${ui.kpis([
    { label: 'Comps tracked', value: fmt.num(items.length), sub: `${Object.keys(bm).length} sectors · FY2023–latest`, color: 'var(--c-fin)' },
    { label: 'Median revenue growth', value: sPct(fmt, allG), sub: 'latest FY, all comps', color: 'var(--sys-good)' },
    { label: 'Median EBITDA margin', value: pctF(fmt, allM), sub: `op. margin ${pctF(fmt, allO)}`, color: 'var(--co-ts)' },
    { label: 'Fastest sector', value: fastSector ? sPct(fmt, fastSector[1].median_revenue_growth_latest_pct) : '—', sub: fastSector ? esc(SECTORS[fastSector[0]]?.label || fastSector[0]) : '', color: 'var(--co-cet)' },
    { label: 'Fastest grower', value: best ? esc(best.ticker) : '—', sub: best ? `${sPct(fmt, best.revenue_growth_latest_pct)} · ${esc(best._sector)}` : '', color: 'var(--c-pe)' },
  ])}
  <div class="mt-12" id="cp-f"></div>
  <div id="cp-focus"></div>
  <div class="grid grid-main">
    ${ui.panel({ title: 'Growth vs EBITDA margin', sub: 'Latest FY · colour = BSP company benchmarked · dashed = median of selection · * = off-scale, clamped · click a dot', body: '<div id="cp-sc"></div><div class="sys-chips legend mt-8" id="cp-leg"></div>', foot: ui.source('SEC XBRL companyfacts', 'https://data.sec.gov/api/xbrl/companyfacts/', pc.meta?.generated) })}
    ${ui.panel({ title: 'Revenue growth by comp', sub: 'Latest FY y/y · dashed = selection median', body: '<div id="cp-g"></div>', scroll: true, foot: ui.source('SEC XBRL companyfacts', 'https://data.sec.gov/api/xbrl/companyfacts/', pc.meta?.generated) })}
  </div>
  <div class="grid grid-3 mt-12" id="cp-bm"></div>
  <div id="cp-deals"></div>
  <div class="mt-12">${ui.panel({ title: 'All comparables', sub: 'Click a row for fiscal-year detail and the 10-K', body: '<div id="cp-t"></div>', foot: ui.source('10-K / 20-F via EDGAR', 'https://www.sec.gov/edgar/search/', pc.meta?.generated) })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Margin structure', sub: 'Operating margin (grey) → EBITDA margin (colour) · D&A intensity is the gap', body: '<div id="cp-db"></div>', scroll: true, foot: ui.source('SEC XBRL companyfacts (operating income, D&A)', 'https://data.sec.gov/api/xbrl/companyfacts/', pc.meta?.generated) })}
    ${ui.panel({ title: 'Benchmarks to apply', sub: 'What each portfolio company should be measured against', body: '<div id="cp-acts"></div>', foot: `${ui.source('Public comparables: sector benchmarks', null, pc.meta?.generated)} · <a href="#/fin/portfolio">Compare with portfolio estimates →</a>` })}
  </div>
  <div class="mt-12">${ui.note(`<b>BSP’s edge is multiple arbitrage:</b> buy small add-ons at lower-middle-market prices and sell the combined company nearer scaled-sponsor prices. Analyst assumption: private lower-middle-market add-ons typically trade at about 5–9x EBITDA, below public comps and scaled sponsor companies. Trades (CET, PP) are the growth engine with thin-to-mid margins; lab distribution and agencies are low-growth. <a href="${rollup}">Size one add-on in the roll-up model →</a>`, 'warn')}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Implications for BSP', sub: 'Research synthesis of the public comparables', body: `<div class="small text-2" style="line-height:1.55">${segments(pc.meta?.financial_picture).map(s => `<p class="mb-8">${esc(noSH(clean(s)))}</p>`).join('') || '—'}</div>`, foot: ui.source('Public comparables synthesis (research team)', null, pc.meta?.generated) })}
    ${ui.panel({ title: 'Benchmark estimate table', sub: 'Metric · estimate · confidence. Click a row for the basis.', body: '<div id="cp-est"></div>', foot: ui.source('Public comparables estimate table · estimates, not reported figures', null, pc.meta?.generated) })}
  </div>
  </div>`;

  const legend = el.querySelector('#cp-leg');
  legend.innerHTML = Object.keys(SECTORS).map(s => { const c = coById(SECTORS[s].co); return `<span><i style="background:${c.color}"></i>${esc(SECTORS[s].label)} (${esc(c.short)})</span>`; }).join('');

  const columns = [
    { key: 'ticker', label: 'Ticker', fmt: (v, r) => `<b class="num">${esc(v)}</b>`, width: '64px' },
    { key: 'company', label: 'Company', fmt: v => esc(String(v).slice(0, 34)) },
    { key: '_sector', label: 'Sector', fmt: (v, r) => fmt.chip(coById(r._co)?.short || '', coById(r._co)?.color) + ` <span class="small dim">${esc(v)}</span>` },
    { key: 'latest_fy', label: 'FY', num: true, fmt: v => esc(v) },
    { key: '_rev', label: 'Revenue', num: true, fmt: v => fmt.money(v) },
    { key: 'revenue_growth_latest_pct', label: 'Growth', num: true, fmt: v => `<span style="color:${v == null ? 'var(--sys-mute-2)' : v >= 0 ? 'var(--sys-good-ink)' : 'var(--sys-bad-ink)'}">${sPct(fmt, v)}</span>` },
    { key: 'revenue_cagr_2023_latest_pct', label: 'CAGR', num: true, fmt: v => sPct(fmt, v) },
    { key: 'operating_margin_latest_pct', label: 'Op. margin', num: true, fmt: v => pctF(fmt, v) },
    { key: 'ebitda_margin_latest_pct', label: 'EBITDA mgn', num: true, fmt: v => pctF(fmt, v) },
    { key: '_emp', label: 'Employees', num: true, fmt: v => fmt.num(v) },
    { key: 'revenue_per_employee_usd', label: 'Rev / emp', num: true, fmt: v => fmt.money(v) },
    { key: 'tenk_url', label: '10-K', fmt: (v, r) => v ? fmt.link(v, `${r.tenk_form || '10-K'} ↗`) : fmt.link(r.source_url, 'XBRL ↗') },
    { key: 'status_note', label: 'Note', wrap: true, fmt: v => v ? `<span class="small dim" style="display:block;min-width:300px">${esc(clip(v, 90))}</span>` : '' },
  ];
  let tbl;
  const openComp = c => {
    const co = coById(c._co);
    inspector.open({
      title: `${esc(c.ticker)} · ${esc(c.company)}`, color: co?.color, sub: `${esc(c._sector)} · benchmarks ${esc(String(c.benchmarks_bsp || '').split('(')[0])}`,
      sections: [
        { label: 'Latest FY', html: ui.kv({ 'Fiscal year': esc(c.latest_fy), Revenue: fmt.money(c._rev), 'Revenue growth': sPct(fmt, c.revenue_growth_latest_pct), '3-yr CAGR': sPct(fmt, c.revenue_cagr_2023_latest_pct), 'Operating margin': `${pctF(fmt, c.operating_margin_latest_pct)} <span class="dim">(avg ${pctF(fmt, c.operating_margin_avg_pct)})</span>`, 'EBITDA margin': pctF(fmt, c.ebitda_margin_latest_pct), Employees: fmt.num(c._emp), 'Revenue / employee': fmt.money(c.revenue_per_employee_usd), Confidence: fmt.chip(c.confidence || 'n/a', confColor(c.confidence)) }) },
        { label: 'Fiscal years', html: `<div class="fin-insp sys-table-wrap"><table class="sys-table"><thead><tr><th>FY</th><th class="sys-n n">Revenue</th><th class="sys-n n">Op. inc.</th><th class="sys-n n">EBITDA</th><th class="sys-n n">Op. mgn</th><th class="sys-n n">Staff</th></tr></thead><tbody>${(c.fiscal_years || []).map(y => `<tr><td class="sys-n n">${esc(y.fy)}</td><td class="sys-n n">${fmt.money(y.revenue_usd)}</td><td class="sys-n n">${fmt.money(y.operating_income_usd)}</td><td class="sys-n n">${fmt.money(y.ebitda_approx_usd)}</td><td class="sys-n n">${pctF(fmt, y.operating_margin_pct)}</td><td class="sys-n n">${fmt.num(y.employees)}</td></tr>`).join('')}</tbody></table></div>` },
        { label: 'What it tells us', html: `<div class="small text-2">${esc(noSH(c.what_it_tells_us))}</div>${c.status_note ? `<div class="small dim mt-8">${esc(c.status_note)}</div>` : ''}${c.employee_note ? `<div class="small dim mt-8">${esc(c.employee_note)}</div>` : ''}` },
        { label: 'Sources', html: `<div class="col gap-4 small">${c.tenk_url ? fmt.link(c.tenk_url, `${c.tenk_form || '10-K'} filed ${c.tenk_filed || ''}`) : ''}${fmt.link(c.source_url, 'XBRL company facts')}</div><div class="dim small mt-8">Retrieved ${esc(c.retrieved || '')}</div>` },
        { label: 'Next action', html: `<div class="small text-2">Use ${esc(c.ticker)} as a ${esc(c._sector.toLowerCase())} reference point for ${esc(co?.name || 'the portfolio company')}: compare its ${fmt.money(c.revenue_per_employee_usd)} revenue per employee and ${pctF(fmt, c.ebitda_margin_latest_pct)} EBITDA margin with the company's management accounts.</div>` },
      ],
      actions: [c.tenk_url ? { label: `${esc(c.tenk_form || '10-K')} ↗`, href: c.tenk_url } : null, { label: 'XBRL ↗', href: c.source_url }].filter(Boolean),
    });
  };
  /* One sector's card: six medians, then the read-out under its own heading. wide = the one card of a ?sector= screen. */
  const sectorCard = (s, b, wide) => {
    const co = coById(SECTORS[s]?.co), ov = overlapKey(s);
    return ui.panel({ cls: `bench${wide ? ' bench-wide' : ''}`, title: `<span class="fin-co-head"><i class="sys-dot fin-dot" aria-hidden="true" style="--co:${co?.color}"></i>${esc(SECTORS[s]?.label || s)}</span>`, sub: `Benchmarks ${esc(benchName(b, co))}, ${esc(b.n)} peers · ${esc((b.comps || []).join(', '))}`,
      body: `<div class="sys-kpis stats">${fig('Growth', sPct(fmt, b.median_revenue_growth_latest_pct))}${fig('3-yr CAGR', sPct(fmt, b.median_revenue_cagr_2023_latest_pct), '', 'Revenue growth a year, FY2023 to latest')}${fig('Op. margin', pctF(fmt, b.median_operating_margin_latest_pct))}${fig('Multi-yr avg', pctF(fmt, b.median_operating_margin_multiyear_avg_pct), '', 'Operating margin, multi-year average')}${fig('EBITDA margin', pctF(fmt, b.median_ebitda_margin_latest_pct))}${fig('Rev / employee', fmt.money(b.median_revenue_per_employee_usd))}</div><h4 class="sys-card-label mb-8">${s === 'communications_agencies' ? 'Holding-company read-across' : `What this implies for ${esc(CO_SAY[co?.id] || co?.name || 'BSP')}`}</h4><div class="sys-card-body imp">${esc(b.what_this_implies_for_bsp || '')}</div>${ov ? `<div class="small text-2 mt-12">Sponsors in this sector bid against BSP for add-ons and are the likely exit buyers: <a href="#/pe/landscape?overlap=${ov}">Private equity →</a></div>` : ''}`,
      actions: wide ? `<a class="fin-link" href="#/fin/comps" data-all>All sectors →</a>` : `<a class="fin-link" href="#/fin/comps?sector=${s}">Filter →</a>`,
      foot: ui.source('Median of sector comps, latest FY', null, pc.meta?.generated) });
  };
  const draw = st => {
    const q = (st.q || '').toLowerCase();
    const sel = items.filter(c => (!st.sector || c.sector_tag === st.sector) && (!q || `${c.ticker} ${c.company}`.toLowerCase().includes(q)));
    f.setCount(`${sel.length} / ${items.length}`);
    const mg = median(sel.map(c => c.revenue_growth_latest_pct)), mm = median(sel.map(c => c.ebitda_margin_latest_pct));
    el.querySelector('#cp-sc').innerHTML = scatter(ctx, sel, { g: mg, m: mm });
    el.querySelectorAll('#cp-sc [data-t]').forEach(g => g.onclick = () => { const c = items.find(x => x.ticker === g.dataset.t); if (c) openComp(c); });
    // diverging growth bars
    const lim = 40; const gs = sel.filter(c => c.revenue_growth_latest_pct != null).sort((a, b) => b.revenue_growth_latest_pct - a.revenue_growth_latest_pct);
    const pos = v => (Math.max(-lim, Math.min(lim, v)) + lim) / (2 * lim) * 100;
    el.querySelector('#cp-g').innerHTML = gs.length ? `<div class="dv">${gs.map(c => { const v = c.revenue_growth_latest_pct, col = coById(c._co)?.color; const a = pos(Math.min(0, v)), b = pos(Math.max(0, v)); return `<div class="r" data-t="${esc(c.ticker)}" title="${esc(c.company)}: ${sPct(fmt, v)}${Math.abs(v) > lim ? ' (bar clamped)' : ''}"><span class="lb">${esc(c.ticker)}</span><span class="tr"><i style="left:${a}%;width:${b - a}%;background:${col}"></i><span class="z" style="left:50%"></span>${mg != null ? `<span class="md" style="left:${pos(mg)}%"></span>` : ''}</span><span class="vv" style="color:${v >= 0 ? 'var(--sys-good-ink)' : 'var(--sys-bad-ink)'}">${sPct(fmt, v)}</span></div>`; }).join('')}</div><div class="axis-l" style="margin:4px 64px 0 60px"><span>−${lim}%</span><span>0</span><span>+${lim}%</span></div>` : ui.empty('No comps');
    el.querySelectorAll('#cp-g [data-t]').forEach(g => g.onclick = () => { const c = items.find(x => x.ticker === g.dataset.t); if (c) openComp(c); });
    // dumbbell margins
    const lo = -10, hi = 30; const P = v => (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * 100;
    const ms = sel.filter(c => c.ebitda_margin_latest_pct != null).sort((a, b) => b.ebitda_margin_latest_pct - a.ebitda_margin_latest_pct);
    el.querySelector('#cp-db').innerHTML = ms.length ? `<div class="dv db">${ms.map(c => { const o = c.operating_margin_latest_pct, e = c.ebitda_margin_latest_pct, col = coById(c._co)?.color; return `<div class="r" data-t="${esc(c.ticker)}" title="${esc(c.company)}: op. ${pctF(fmt, o)} → EBITDA ${pctF(fmt, e)}${(o < lo || e < lo) ? ' (clamped)' : ''}"><span class="lb">${esc(c.ticker)}</span><span class="tr"><span class="z" style="left:${P(0)}%"></span><span class="seg" style="left:${Math.min(P(o), P(e))}%;width:${Math.abs(P(e) - P(o))}%"></span><span class="p op" style="left:${P(o)}%"></span><span class="p" style="left:${P(e)}%;background:${col}"></span></span><span class="vv">${pctF(fmt, e)}</span></div>`; }).join('')}</div><div class="axis-l"><span>${lo}%</span><span>${(lo + hi) / 2}%</span><span>${hi}%</span></div>` : ui.empty('No comps');
    el.querySelectorAll('#cp-db [data-t]').forEach(g => g.onclick = () => { const c = items.find(x => x.ticker === g.dataset.t); if (c) openComp(c); });
    // sector cards and BPI's transactions: every sector in the grid, or the one picked at the top (the focus block)
    const one = st.sector && bm[st.sector] ? st.sector : '';
    const cards = Object.entries(bm).filter(([s]) => !one || s === one).map(([s, b]) => sectorCard(s, b, !!one)).join('');
    const focus = el.querySelector('#cp-focus'), grid = el.querySelector('#cp-bm'), dealsEl = el.querySelector('#cp-deals');
    focus.innerHTML = !one ? '' : `${one === 'communications_agencies' ? dealsHtml : ''}<div class="mt-12">${cards}</div><div class="mt-12"></div>`;
    // "All sectors →" also clears the picker: when the sector came from the picker the address does not change, so the link alone would do nothing
    const allLink = focus.querySelector('[data-all]'); if (allLink) allLink.onclick = () => { const s = el.querySelector('#cp-f select[data-k="sector"]'); if (s) { s.value = ''; s.dispatchEvent(new Event('change')); } };
    grid.innerHTML = one ? '' : cards; grid.style.display = one ? 'none' : '';   // not the hidden attribute: .grid{display:grid} in app.css would override it
    dealsEl.innerHTML = one ? '' : dealsHtml;
    wireDeals();   // the transactions table, wherever the block was placed
    tbl ? tbl.update(sel) : (tbl = ui.table(el.querySelector('#cp-t'), { columns, rows: sel, pageSize: 40, sortKey: 'revenue_growth_latest_pct', exportName: 'bsp_public_comps', rowKey: r => r.id, onRow: openComp }));
  };
  const f = ui.filters(el.querySelector('#cp-f'), [
    { key: 'sector', label: 'Sector', options: sectorOpts, value: sector0 },
    { key: 'q', label: 'Ticker or company…', type: 'search', value: params.q || '' },
  ], draw);
  draw(f.state);
  if (params.ticker) { const c = items.find(x => x.ticker === params.ticker); if (c) openComp(c); }

  const acts = Object.entries(bm).map(([s, b]) => { const co = coById(SECTORS[s]?.co); return { chip: co?.short, color: co?.color, html: `<b>${esc(benchName(b, co))}</b>: hold to ${fmt.money(b.median_revenue_per_employee_usd)} revenue per employee and a ${pctF(fmt, b.median_ebitda_margin_latest_pct)} EBITDA margin (sector medians across ${esc(b.n)} peers); peer growth is ${sPct(fmt, b.median_revenue_growth_latest_pct)}. Ask management for the same three KPIs on a trailing-12-month basis.` }; });
  el.querySelector('#cp-acts').innerHTML = actionList(ctx, acts);

  // benchmark estimates (from the comparables research): the basis opens on click
  const bEst = toArr(pc.meta?.estimate_table), estEl = el.querySelector('#cp-est');
  if (bEst.length) ui.table(estEl, { rows: bEst.map((e, i) => ({ ...e, metric: noSH(e.metric), id: i })), pageSize: 10, exportName: 'bsp_benchmark_estimates', columns: [
    { key: 'metric', label: 'Metric', wrap: true, fmt: v => `<span class="small">${esc(v)}</span>` },
    { key: 'estimate', label: 'Estimate', wrap: true, fmt: v => `<b class="small">${esc(v)}</b>` },
    { key: 'confidence', label: 'Conf.', fmt: v => fmt.chip(v || 'n/a', confColor(v)) },
  ], onRow: e => inspector.open({ title: esc(e.metric), sub: `Estimate ${esc(e.estimate)}`, color: 'var(--c-fin)', sections: [{ label: 'Basis', html: `<div class="small text-2">${esc(clean(e.basis || '—'))}</div>` }, { label: 'Confidence', html: fmt.chip(e.confidence || 'n/a', confColor(e.confidence)) }] }) });
  else estEl.innerHTML = ui.empty('No estimate table');

  app.index(items.map(c => ({ label: `${c.ticker} · ${c.company}`, sub: `Public comp · ${c._sector}`, href: `#/fin/comps?ticker=${encodeURIComponent(c.ticker)}`, kind: 'Comp', color: 'var(--c-fin)' })));
}

/* ═══ View 4: Methods & gaps ════════════════════════════════════════════════ */
const METHODS = [
  { id: 'formd', title: 'SEC Form D', cats: ['sec_form_d'], formula: 'Equity raised = "Total amount sold" on the vehicle\'s latest Form D / D-A', text: 'Every BSP fund and deal SPV files a Form D under Rule 506(b). Amendments show top-ups; investor counts reveal LP co-invest breadth.', caveat: 'SPVs pool Fund I capital with co-invest, so vehicle amounts are not additive to Fund I and are not enterprise value.' },
  { id: 'adv', title: 'Form ADV (Schedule D)', cats: ['form_adv'], formula: 'Gross mark ≈ fund gross asset value ÷ Form D amount sold', text: 'The adviser\'s annual ADV amendment lists regulatory AUM, headcount and gross asset value by private fund: the only public read on marks.', caveat: 'GAV is gross of fees and leverage and gives no mark for individual positions.' },
  { id: 'bdc', title: 'BDC schedules of investments', cats: ['bdc_loan_schedule', 'lender_press'], formula: 'Mark = fair value ÷ par · Facility ≈ visible par ÷ typical hold (15–25%)', text: 'BDC 10-Q/10-K and N-PORT holdings disclose par, cost, fair value, spread, PIK and maturity for each borrower, quarter by quarter.', caveat: 'Shows one lender\'s slice only; total facility, leverage and EBITDA are inferred.' },
  { id: 'ppp', title: 'SBA PPP loans', cats: ['sba_ppp'], formula: 'Annual payroll = loan ÷ 2.5 × 12 · Revenue ≈ payroll ÷ 30–40% labor share', text: 'The PPP FOIA file gives loan amount, jobs reported and lender for 2020–21: a clean pre-deal scale anchor for private companies.', caveat: 'Payroll capped at $100k per employee; describes the predecessor company, pre roll-up.' },
  { id: 'fdd', title: 'FDD Item 19 / franchisee lists', cats: ['fdd_item19', 'fdd_franchisee_list'], formula: 'Revenue ≈ territories operated × Item 19 average unit revenue', text: 'Franchise Disclosure Documents filed with state registries disclose system unit economics (Item 19) and franchisee rosters (Item 20).', caveat: 'System averages; a multi-unit franchisee may run above or below the mean.' },
  { id: 'state', title: 'State, county & court records', cats: ['state_business_filing', 'ucc_lien', 'tax_or_assessment', 'county_deed_or_mortgage', 'litigation', 'osha_dol'], formula: 'UCC-1 secured party → agent bank · SOS → entities & officers', text: 'Secretary of State entity filings, UCC liens, county deeds and assessments, court dockets and OSHA inspections fill in lenders, entities and operating risk.', caveat: 'Coverage varies by state; some registries need manual (browser) lookups.' },
  { id: 'rating', title: 'Credit ratings', cats: [], re: /credit rating|moody|s&p|kbra|fitch|\bcfr\b/i, formula: 'Rating + leverage commentary → sponsor leverage and headroom', text: 'Moody\'s / S&P / KBRA reports give leverage and liquidity for broadly syndicated borrowers (Wrench, Apex, Consilio, Epiq…).', caveat: 'Not retrieved this cycle (research budget and paywalls); listed in next pulls.' },
  { id: 'comps', title: 'Public comps (XBRL)', cats: ['industry_benchmark'], extra: 'comps', formula: 'EBITDA ≈ operating income + D&A · Rev/employee = revenue ÷ year-end headcount', text: 'SEC companyfacts XBRL for listed peers, FY2023 to latest, as benchmarks for margin, growth and productivity.', caveat: 'GAAP as reported, not adjusted; one-offs depress some latest-year margins.' },
  { id: 'press', title: 'Press, rankings & other', cats: ['press_financial', 'ranking_listing', 'other'], formula: 'Disclosed deal terms, headcount, growth claims', text: 'Company and sponsor releases, trade press, Inc./MSP rankings and UK Companies House accounts supply dated facts.', caveat: 'Self-reported; used for triangulation, not as a primary figure.' },
];

async function methodsView(ctx) {
  const { el, ui, fmt, esc, data, inspector } = ctx;
  injectCss();
  el.innerHTML = ui.loading('Compiling methods, caveats and gaps…');
  const D = await loadAll(ctx);
  const dsList = [...D.cos.map(x => ({ id: x.co.id, name: x.co.name, short: x.co.short, color: x.co.color, file: x.co.ds, d: x.d })), { id: 'rival', name: 'Rival companies', short: 'Rival', color: RIVAL.color, file: 'rival_filings', d: D.rival }, { id: 'comps', name: 'Public comparables', short: 'Comps', color: 'var(--c-fin)', file: 'public_comps', d: D.comps }, { id: 'firm', name: 'BSP firm', short: 'BSP', color: 'var(--sys-brand)', file: 'bsp_firm', d: D.firm }];
  const present = dsList.filter(x => x.d);
  const gaps = [], pulls = [], cav = [];
  for (const x of present) {
    const m = x.d.meta || {};
    toArr(m.data_gaps).forEach(t => gaps.push({ ds: x.short, color: x.color, text: clean(t), kind: 'Data gap' }));
    toArr(m.next_pulls).forEach(t => pulls.push({ ds: x.short, color: x.color, text: clean(t), kind: 'Next pull' }));
    toArr(m.caveats).forEach(t => cav.push({ ds: x.short, color: x.color, text: clean(t) }));
  }
  const allItems = [...D.rows, ...(D.comps?.items || [])];
  const hi = D.rows.filter(r => r.confidence === 'high').length;

  // county home-sales / property-transfer coverage for every platform — HEAD only (files are 1–6 MB each)
  const SALES = [
    { f: 'pp_sales_pa_a', co: 'pp', label: 'Lancaster, York, Cumberland, Dauphin PA' }, { f: 'pp_sales_pa_b', co: 'pp', label: 'Montgomery, Chester, Berks + 4 PA counties' }, { f: 'pp_sales_nj', co: 'pp', label: 'Ocean, Monmouth, Atlantic, Burlington NJ' },
    { f: 'cet_transfers_ma', co: 'cet', label: '9 MA counties (Worcester, Middlesex, Bristol…)' }, { f: 'cet_transfers_ct_ri', co: 'cet', label: '8 CT counties + Providence RI (Horton)' },
    { f: 'cet_home_sales_ma', co: 'cet', label: 'Home sales · same 9 MA counties' }, { f: 'cet_home_sales_ct_ri', co: 'cet', label: 'Home sales · 8 CT counties + Cranston RI' },
    { f: 'bpi_sales_dc', co: 'bpi', label: 'District of Columbia (HQ talent market)' }, { f: 'fh_sales_nyc', co: 'fh', label: 'New York County / Manhattan (flagship store)' }, { f: 'ts_sales_gloucester_nj', co: 'ts', label: 'Gloucester County, NJ (Swedesboro HQ)' },
  ];

  el.innerHTML = `<div class="m-fin">${ui.pageHead({
    title: 'Methods & gaps',
    sub: `Every figure comes from a public filing and a stated formula; private-company revenue, EBITDA and leverage stay estimates. ${fmt.num(gaps.length)} data gaps map to ${fmt.num(pulls.length)} next pulls.`,
    chips: `${fmt.chip(`${present.length} of ${dsList.length} sources`, present.length < dsList.length ? 'var(--sys-warn)' : 'var(--sys-good)')}${fmt.chip('Public records only', 'var(--c-fin)')}`,
    actions: `<a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/ma/overview">Acquisition engine →</a><a class="sys-btn sys-btn--secondary sys-btn--sm btn sm" href="#/deal/returns?p=typical">Acquisition model</a>`,
  })}
  ${ui.kpis([
    { label: 'Sources', value: `${present.length}/${dsList.length}`, sub: dsList.filter(x => !x.d).map(x => x.short).join(', ') ? `pending: ${esc(dsList.filter(x => !x.d).map(x => x.short).join(', '))}` : 'all loaded', color: present.length < dsList.length ? 'var(--sys-warn)' : 'var(--sys-good)' },
    { label: 'Records', value: fmt.num(allItems.length), sub: `${fmt.num(D.rows.length)} filings · ${fmt.num(D.comps?.items?.length || 0)} comps`, color: 'var(--c-fin)' },
    { label: 'High confidence', value: `${fmt.num(Math.round(hi / Math.max(1, D.rows.length) * 100))}%`, sub: 'of filing records', color: 'var(--sys-good)' },
    { label: 'Open data gaps', value: fmt.num(gaps.length), sub: 'across sources', color: 'var(--sys-warn)' },
    { label: 'Open requests', value: fmt.num(pulls.length), sub: 'queued requests', color: 'var(--sys-brand)' },
  ])}
  <div class="grid grid-3 mt-12">${METHODS.map(mt => {
    const n = mt.cats.length ? D.rows.filter(r => mt.cats.includes(r._cat)).length : D.rows.filter(r => mt.re && mt.re.test(JSON.stringify(r.key_figures || {}) + r.title)).length;
    const nComps = mt.extra === 'comps' ? (D.comps?.items?.length || 0) : 0;
    const by = COS.concat([RIVAL]).map(c => ({ c, n: D.rows.filter(r => r._co === c.id && mt.cats.includes(r._cat)).length })).filter(x => x.n);
    return ui.panel({ title: esc(mt.title), sub: `${fmt.num(n + nComps)} records${nComps ? ` (incl. ${nComps} comps)` : ''}`, body: `<div class="mth"><div class="f">${esc(Copy.text(mt.formula))}</div><div class="d">${esc(Copy.text(mt.text))}</div><div class="cv">⚠ ${esc(Copy.text(mt.caveat))}</div><div class="ct">${by.map(x => fmt.chip(`${x.c.short} ${x.n}`, x.c.color)).join('') || (n + nComps ? '' : fmt.chip('no records yet', 'var(--sys-warn)'))}</div></div>` });
  }).join('')}</div>
  <div class="mt-12">${ui.panel({ title: 'Data gaps & next pulls — merged register', sub: 'Every open gap and queued request across sources · filter, export and assign', body: '<div id="mt-f"></div><div id="mt-t"></div>', foot: ui.source('Data gaps and next pulls listed in each research source', null, 'Sept 2026') })}</div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Caveats', sub: 'Stated limitations by source — read before quoting a number', body: '<div id="mt-cv"></div>', scroll: true })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Data sources', sub: 'Status, date and size of each source', body: `<div class="fin-insp sys-table-wrap"><table class="sys-table"><thead><tr><th>Company</th><th>Source</th><th class="sys-n n">Items</th><th>Generated</th></tr></thead><tbody>${dsList.map(x => `<tr><td>${fmt.chip(x.short, x.color)}</td><td class="small ${x.d ? '' : 'miss'}">${esc(Copy.dataset(x.file))}${x.d ? '' : ' — pending'}</td><td class="sys-n n">${x.d ? fmt.num(x.d.items?.length || 0) : '—'}</td><td class="small dim">${esc(x.d?.meta?.generated || '')}</td></tr>`).join('')}</tbody></table></div>` })}
      ${ui.panel({ title: 'County home-sales & property-transfer records', sub: 'Deed / assessor sales for the counties each portfolio company serves or recruits from — coverage check across all six companies', body: `<div class="fin-insp" id="mt-sales">${ui.loading('Checking files…')}</div>`, foot: ui.source('County deed and assessor records (state and county sources)', null, 'Sept 2026') })}
    </div>
  </div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Extending with PitchBook / Capital IQ', sub: 'Where a paid source closes the gap fastest', accent: true, body: `<div class="mth"><div class="d"><b>1. Deal records.</b> Entry EV, EV/EBITDA, debt package and lender list for each BSP anchor and add-on replace the triangulated EV and debt ranges in Portfolio picture.</div><div class="d"><b>2. Private-company financials.</b> CapIQ private-company tearsheets (revenue, employees, credit ratings) for rivals such as Wrench, Apex, Consilio and Epiq replace the headcount × revenue-per-employee estimates.</div><div class="d"><b>3. Loan data.</b> LCD / CapIQ leveraged-loan data give total facility size, pricing and covenant flex, completing the one-lender slice visible in BDC schedules.</div><div class="d"><b>4. Loading it.</b> Records saved in the same columns as the public filings (category, entity, key figures, confidence, source link) flow into the Filings explorer, Portfolio picture and Rival companies automatically.</div></div>` })}
    ${ui.panel({ title: 'Next actions', sub: 'Sequenced for the next two weeks', body: `<div id="mt-acts"></div>`, foot: ui.source('Derived from the gap register above', null, 'Sept 2026') })}
  </div>
  </div>`;

  // register table
  const reg = [...gaps, ...pulls].map((r, i) => ({ ...r, id: i }));
  let tbl;
  const cols = [
    { key: 'kind', label: 'Type', fmt: v => fmt.chip(v, v === 'Data gap' ? 'var(--sys-warn)' : 'var(--c-fin)'), width: '90px' },
    { key: 'ds', label: 'Source', fmt: (v, r) => fmt.chip(Copy.dataset(v), r.color), width: '70px' },
    { key: 'text', label: 'Item', wrap: true, fmt: v => `<span class="small text-2">${esc(v)}</span>` },
  ];
  const openReg = r => inspector.open({ title: esc(r.kind), color: r.color, sub: esc(Copy.dataset(r.ds)), sections: [{ label: 'Detail', html: `<div class="small text-2">${esc(r.text)}</div>` }, { label: 'Next action', html: `<div class="small text-2">${r.kind === 'Data gap' ? 'Assign an owner and match this gap to a pull (paid source, registry search or management request).' : 'Assign to the PRG finance analyst; log the result back into the dataset with source_url and confidence.'}</div>` }] });
  const applyReg = st => { const q = (st.q || '').toLowerCase(); const out = reg.filter(r => (!st.ds || r.ds === st.ds) && (!st.kind || r.kind === st.kind) && (!q || r.text.toLowerCase().includes(q))); f.setCount(`${out.length} / ${reg.length}`); tbl ? tbl.update(out) : (tbl = ui.table(el.querySelector('#mt-t'), { columns: cols, rows: out, pageSize: 12, exportName: 'bsp_fin_gaps_next_pulls', onRow: openReg })); };
  const f = ui.filters(el.querySelector('#mt-f'), [
    { key: 'q', label: 'Search gaps and pulls…', type: 'search' },
    { key: 'ds', label: 'Source', options: [...new Set(reg.map(r => r.ds))].map(v => ({ value: v, label: Copy.dataset(v) })) },
    { key: 'kind', label: 'Type', options: ['Data gap', 'Next pull'] },
  ], applyReg);
  applyReg(f.state);

  el.querySelector('#mt-cv').innerHTML = cav.length ? `<div>${cav.slice(0, 60).map(c => `<div class="sig">${fmt.chip(Copy.dataset(c.ds), c.color)}<div class="t" style="color:var(--sys-ink-2)">${esc(Copy.text(c.text))}</div></div>`).join('')}</div>` : ui.empty('No caveats recorded');

  el.querySelector('#mt-acts').innerHTML = actionList(ctx, [
    { chip: 'Paid', color: 'var(--sys-brand)', text: 'License a PitchBook / Capital IQ seat for the PRG finance workstream: deal records for the seven companies BSP has owned and their 23 add-ons close the largest share of gaps.' },
    { chip: 'UCC', color: 'var(--sys-warn)', text: 'Run manual SOS / UCC searches (MA, CT, PA, NJ, DE, MO) to name agent banks for CET, Punctual Pros and Frontline.' },
    { chip: 'BDC', color: 'var(--co-ts)', text: 'Refresh BDC schedules after the Sept 30 quarter-end 10-Qs (early Nov 2026): Thomas Scientific and rival marks first.' },
    { chip: 'FH', color: 'var(--co-fh)', text: D.cos.find(x => x.co.id === 'fh')?.d ? 'Review the Fair Harbor filings track against the apparel DTC comps.' : 'Complete the Fair Harbor filings track (Fair Harbor public filings) so all six companies are covered.' },
    { chip: 'Ratings', color: 'var(--c-pe)', text: 'Pull Moody\'s / S&P reports for Wrench, Apex, TurnPoint, Consilio and Epiq to replace inferred leverage.' },
    { chip: 'Sales', color: 'var(--co-fl)', text: 'Close the last county home-sales gap: St. Louis City & County, MO (Frontline HQ). Missouri does not disclose sale prices and the county parcel layer carries no usable deed date, so this needs a licensed MLS / ATTOM feed. Gloucester County, NJ (Thomas Scientific) is now covered from the NJ SR1A file.' },
  ]);

  // HEAD check for sales files (no body download)
  const res = await Promise.all(SALES.map(async s => { if (s.planned) return { ...s, ok: false }; try { const r = await fetch(`data/sales/${s.f}.json`, { method: 'HEAD' }); return { ...s, ok: r.ok, bytes: Number(r.headers.get('content-length')) || null }; } catch { return { ...s, ok: false }; } }));
  const box = el.querySelector('#mt-sales');
  const nOk = res.filter(s => s.ok).length, coOk = new Set(res.filter(s => s.ok).map(s => s.co));
  const missCos = COS.filter(c => !coOk.has(c.id));
  if (box) box.innerHTML = `<div class="sys-table-wrap"><table class="sys-table"><thead><tr><th>Coverage</th><th>Source</th><th class="sys-n n">Size</th></tr></thead><tbody>${res.map(s => `<tr><td>${fmt.chip(coById(s.co).short, coById(s.co).color)} <span class="small">${esc(s.label)}</span></td><td class="small ${s.ok ? 'ok' : 'miss'}">${s.ok ? '✓' : s.planned ? '✗ not collected' : '✗ pending'} ${esc(Copy.dataset(s.f))}</td><td class="sys-n n" style="white-space:nowrap">${s.ok && s.bytes ? `${fmt.num(s.bytes / 1048576, 1)} MB` : '—'}</td></tr>`).join('')}</tbody></table><div class="small dim mt-8">${fmt.num(nOk)} of ${fmt.num(res.length)} county files present · ${fmt.num(coOk.size)} of ${COS.length} companies covered${missCos.length ? ` · <span style="color:var(--sys-warn-ink)">next pull: ${esc(missCos.map(c => c.short).join(', '))} (county assessor / recorder sales for their HQ counties)</span>` : ''}. Residential (home) sales sit alongside commercial transfers; explore them under ${COS.filter(c => coOk.has(c.id)).map(c => `<a href="#/${c.id}">${esc(c.short)}</a>`).join(', ')}.</div>`;
}

export default {
  id: 'fin', name: 'Filings', tag: 'SEC', color: 'var(--c-fin)', group: 'Intelligence',
  tagline: 'BSP\'s own SEC filings, each portfolio company\'s public financial picture, rival companies\' filings and public comparables',
  hq: { lat: 40.7585, lon: -73.9745, label: 'BSP, 34 E 51st St, New York' },
  views: [
    { id: 'portfolio', name: 'Portfolio picture', icon: '◉', render: portfolioView },
    { id: 'explorer', name: 'Filings explorer', icon: '▤', render: explorerView },
    { id: 'comps', name: 'Public comparables', icon: '◧', render: compsView },
    { id: 'methods', name: 'Methods & gaps', icon: '⚙', render: methodsView },
  ],
  tour: [
    { order: 1000, hash: '#/fin/portfolio', caption: '<b>Portfolio financials.</b> SEC fund filings show the capital; company financials are estimated from public records.', narration: 'SEC fund filings show the capital. Company financials are estimated from public records.', duration: 8000 },
    { order: 1010, hash: '#/fin/comps', caption: '<b>Public comparables.</b> 31 listed peers set the margin, growth and revenue-per-employee bar for each portfolio company.', narration: 'Thirty-one listed peers benchmark growth, margin and revenue per employee for every portfolio company.', duration: 6000 },
    { order: 1020, hash: '#/fin/methods', caption: '<b>Methods and gaps.</b> Every number has a formula and a source; each open gap names where to look next.', narration: 'Every number has a formula and a source, and each open gap names where to look next.', duration: 7000 },
  ],
};
