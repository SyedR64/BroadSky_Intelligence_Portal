/* Acquisition model: the maths and the Excel export (no DOM). modules/deal.js draws the views.
   One engine, three readers: the live views, the share link and the workbook. The workbook formulas
   are generated from the same steps as lbo() below, so Excel recalculates to the same numbers.     */

export const H = 7;          // model horizon in years (exit year is 2 to 7)
export const DCF_YEARS = 5;  // explicit DCF forecast

/* Inputs held as percentages on screen (12 = 12%) and as fractions in Excel (0.12). */
export const PCT = new Set(['mg', 'ir', 'gr', 'dm', 'ad', 'cc', 'fee', 'tax', 'da', 'cx', 'nwc', 'wacc', 'tg', 'syn']);
export const INT = new Set(['yrs', 'n']);
/* Excel defined names for each input (Inputs sheet). */
export const XL_NAME = {
  rev: 'Revenue', mg: 'Margin', em: 'EntryMultiple', lev: 'Leverage', ir: 'InterestRate', gr: 'Growth', dm: 'MarginChange', yrs: 'ExitYear', xm: 'ExitMultiple',
  ae: 'AddOnEBITDA', am: 'AddOnMultiple', ad: 'AddOnDebtShare', cc: 'CashConversion', fee: 'Fees', tax: 'TaxRate', da: 'Depreciation', cx: 'Capex', nwc: 'WorkingCapital',
  wacc: 'WACC', tg: 'LongRunGrowth', tm: 'SaleMultipleY5', nd: 'NetDebt', ce: 'CompanyEBITDA', cm: 'CompanyMultiple', n: 'AddOnCount', ra: 'EBITDAPerAddOn',
  rm: 'RollupAddOnMultiple', rx: 'RollupExitMultiple', ic: 'IntegrationCost', syn: 'Synergies',
};

const num = v => (v == null || v === '' || !isFinite(+v)) ? null : +v;
const clampYrs = v => Math.max(2, Math.min(H, Math.round(v || 5)));
const fin = v => typeof v === 'number' && isFinite(v);

/* ── IRR: Newton with a bisection fallback (Excel's IRR gives the same root for these flows) ── */
export function irr(cfs) {
  if (!cfs.some(c => c > 0) || !cfs.some(c => c < 0)) return null;
  const npv = r => cfs.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
  const d = r => cfs.reduce((s, c, t) => s - t * c / Math.pow(1 + r, t + 1), 0);
  let r = 0.15;
  for (let i = 0; i < 60; i++) { const f = npv(r), g = d(r); if (!fin(f) || !fin(g) || g === 0) break; const nr = r - f / g; if (!fin(nr) || nr <= -0.9999) break; if (Math.abs(nr - r) < 1e-10) return nr; r = nr; }
  let lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (!fin(flo) || !fin(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2, fm = npv(m); if (Math.abs(fm) < 1e-9) return m; if (flo * fm < 0) { hi = m; fhi = fm; } else { lo = m; flo = fm; } }
  return (lo + hi) / 2;
}

/* ── Returns: a leveraged buyout of one company, with add-ons bought each year until the exit ── */
export function lbo(p) {
  const N = clampYrs(p.yrs), g = p.gr / 100, m0 = p.mg / 100, dm = p.dm / 100, r = p.ir / 100, conv = p.cc / 100, adp = p.ad / 100, fee = p.fee / 100;
  const z = () => new Array(H + 1).fill(0);
  const o = { N, yr: [...Array(H + 1).keys()], rev: z(), mgn: z(), org: z(), add: z(), ebitda: z(), buy: z(), adebt: z(), aeq: z(), int: z(), cash: z(), nd: z(), cf: z() };
  for (let y = 0; y <= H; y++) {
    o.rev[y] = y ? o.rev[y - 1] * (1 + g) : p.rev;
    o.mgn[y] = m0 + dm * y;
    o.org[y] = o.rev[y] * o.mgn[y];
    o.add[y] = y ? o.add[y - 1] * (1 + g) + (y >= 2 && y <= N ? p.ae : 0) : 0;
    o.ebitda[y] = o.org[y] + o.add[y];
    o.buy[y] = y && y <= N - 1 ? p.ae * p.am : 0;
    o.adebt[y] = o.buy[y] * adp;
    o.aeq[y] = o.buy[y] - o.adebt[y];
    o.int[y] = y ? Math.max(0, o.nd[y - 1]) * r : 0;
    o.cash[y] = y ? o.ebitda[y] * conv - o.int[y] : 0;
    o.nd[y] = y ? o.nd[y - 1] - o.cash[y] + o.adebt[y] : o.ebitda[0] * p.lev;
    o.cf[y] = y === 0 ? -(o.ebitda[0] * p.em * (1 + fee) - o.nd[0]) : y < N ? -o.aeq[y] : y === N ? o.ebitda[y] * p.xm - o.nd[y] - o.aeq[y] : 0;
  }
  o.ev0 = o.ebitda[0] * p.em; o.fees = o.ev0 * fee; o.debt0 = o.nd[0]; o.eq0 = o.ev0 + o.fees - o.debt0;
  o.addEq = o.aeq.reduce((s, v) => s + v, 0); o.totalEq = o.eq0 + o.addEq; o.addSpend = o.buy.reduce((s, v) => s + v, 0);
  o.exitE = o.ebitda[N]; o.exitEV = o.exitE * p.xm; o.exitND = o.nd[N]; o.exitEq = o.exitEV - o.exitND;
  o.moic = o.totalEq > 0 ? o.exitEq / o.totalEq : null;
  o.irr = o.eq0 > 0 ? irr(o.cf) : null;
  // where the equity gain comes from (adds up to exit equity minus total equity)
  const cashIn = o.cash.slice(1, N + 1).reduce((s, v) => s + v, 0);
  o.bridge = [
    { k: 'growth', label: 'Earnings growth', v: (o.exitE - o.ebitda[0]) * p.em, note: 'EBITDA added, valued at the entry multiple' },
    { k: 'multiple', label: 'Exit multiple versus entry', v: (p.xm - p.em) * o.exitE, note: 'Selling at a higher or lower multiple' },
    { k: 'cash', label: 'Cash that repaid debt', v: cashIn, note: 'Operating cash after interest' },
    { k: 'addons', label: 'Paid for add-ons', v: -o.addSpend, note: 'Price of the companies bought' },
    { k: 'fees', label: 'Deal fees', v: -o.fees, note: 'Paid at entry' },
  ];
  o.gain = o.exitEq - o.totalEq;
  return o;
}

/* ── DCF: unlevered free cash flow for five years, two ways to value the years after ── */
export function dcf(p) {
  const g = p.gr / 100, m0 = p.mg / 100, dm = p.dm / 100, t = p.tax / 100, w = p.wacc / 100, tg = p.tg / 100;
  const Y = DCF_YEARS, z = () => new Array(Y + 1).fill(0);
  const o = { yr: [...Array(Y + 1).keys()], rev: z(), mgn: z(), ebitda: z(), da: z(), ebit: z(), tax: z(), capex: z(), dnwc: z(), fcf: z(), df: z(), pv: z() };
  for (let y = 0; y <= Y; y++) {
    o.rev[y] = y ? o.rev[y - 1] * (1 + g) : p.rev;
    o.mgn[y] = m0 + dm * y;
    o.ebitda[y] = o.rev[y] * o.mgn[y];
    o.da[y] = o.rev[y] * p.da / 100;
    o.ebit[y] = o.ebitda[y] - o.da[y];
    o.tax[y] = o.ebit[y] * t;
    o.capex[y] = o.rev[y] * p.cx / 100;
    o.dnwc[y] = y ? (o.rev[y] - o.rev[y - 1]) * p.nwc / 100 : 0;
    o.fcf[y] = y ? o.ebit[y] - o.tax[y] + o.da[y] - o.capex[y] - o.dnwc[y] : 0;
    o.df[y] = 1 / Math.pow(1 + w, y);
    o.pv[y] = y ? o.fcf[y] * o.df[y] : 0;
  }
  o.sumPV = o.pv.reduce((s, v) => s + v, 0);
  o.okG = w > tg;
  o.tvG = o.okG ? o.fcf[Y] * (1 + tg) / (w - tg) : null;
  o.pvTvG = o.okG ? o.tvG * o.df[Y] : null;
  o.evG = o.okG ? o.sumPV + o.pvTvG : null;
  o.tvM = o.ebitda[Y] * p.tm; o.pvTvM = o.tvM * o.df[Y]; o.evM = o.sumPV + o.pvTvM;
  o.eqG = o.evG == null ? null : o.evG - p.nd; o.eqM = o.evM - p.nd;
  o.impliedMult = o.okG && o.ebitda[Y] ? o.tvG / o.ebitda[Y] : null;
  o.impliedG = (o.tvM + o.fcf[Y]) ? (o.tvM * w - o.fcf[Y]) / (o.tvM + o.fcf[Y]) : null;
  o.evMultG = o.evG != null && o.ebitda[0] ? o.evG / o.ebitda[0] : null;
  o.evMultM = o.ebitda[0] ? o.evM / o.ebitda[0] : null;
  o.tvShare = o.evG ? o.pvTvG / o.evG : null;
  return o;
}

/* ── Roll-up: one company plus N add-ons bought at a lower multiple than the exit multiple ── */
export function rollup(p) {
  const n = Math.max(0, Math.round(p.n)), g = p.gr / 100, N = clampYrs(p.yrs);
  const o = { n };
  o.coEV = p.ce * p.cm; o.addE = n * p.ra; o.addPrice = o.addE * p.rm; o.integ = n * p.ic;
  o.cost = o.coEV + o.addPrice + o.integ;
  o.pfE = p.ce + o.addE;
  o.blended = o.pfE ? (o.coEV + o.addPrice) / o.pfE : null;
  o.grownE = o.pfE * Math.pow(1 + g, N);
  o.synE = o.addE * p.syn / 100;
  o.exitE = o.grownE + o.synE; o.exitEV = o.exitE * p.rx;
  o.created = o.exitEV - o.cost;
  o.parts = [
    { k: 'arb', label: 'Multiple arbitrage', v: o.blended == null ? 0 : (p.rx - o.blended) * o.pfE, note: 'Bought at the blended multiple, sold at the exit multiple' },
    { k: 'ops', label: 'Operating growth', v: (o.grownE - o.pfE) * p.rx, note: `EBITDA growth over ${N} years, valued at exit` },
    { k: 'syn', label: 'Synergies', v: o.synE * p.rx, note: 'Extra EBITDA from combining, valued at exit' },
    { k: 'int', label: 'Integration cost', v: -o.integ, note: 'One-off cost to merge each add-on' },
  ];
  o.alone = p.ce * Math.pow(1 + g, N) * p.rx - o.coEV;
  o.onCost = o.cost ? o.exitEV / o.cost : null;
  o.steps = [];
  for (let k = 0; k <= Math.min(n, 12); k++) { const e = p.ce + k * p.ra, c = o.coEV + k * p.ra * p.rm; o.steps.push({ k, ebitda: e, paid: c, blended: e ? c / e : null }); }
  return o;
}

/* ── Sensitivity: two-way tables re-running lbo() with two inputs moved ── */
export const SENS = {
  irr: { rowKey: 'em', colKey: 'xm', rowStep: 1, colStep: 1, rowLabel: 'Entry multiple', colLabel: 'Exit multiple', out: 'irr' },
  moic: { rowKey: 'gr', colKey: 'dm', rowStep: 2, colStep: 0.5, rowLabel: 'Revenue growth', colLabel: 'Margin gain a year', out: 'moic' },
};
const OFFS = [-2, -1, 0, 1, 2];
export const sensAxis = (base, step, key) => OFFS.map(o => key === 'em' || key === 'xm' ? Math.max(1, base + o * step) : base + o * step);
export function sensTable(p, spec) {
  const rows = sensAxis(p[spec.rowKey], spec.rowStep, spec.rowKey), cols = sensAxis(p[spec.colKey], spec.colStep, spec.colKey);
  return { rows, cols, cells: rows.map(rv => cols.map(cv => { const r = lbo({ ...p, [spec.rowKey]: rv, [spec.colKey]: cv }); return { v: r[spec.out], r }; })) };
}

/* Entry multiple a buyer can pay and still earn a target IRR (bisection; IRR falls as the price rises). */
export function solveEntry(p, target) {
  const f = em => { const r = lbo({ ...p, em }); return r.irr == null ? -1 : r.irr; };
  let lo = Math.max(1, p.lev / (1 + p.fee / 100) + 0.05), hi = 40;
  if (f(lo) < target) return null;
  if (f(hi) >= target) return hi;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) >= target) lo = m; else hi = m; }
  return lo;
}

/* Football field: enterprise-value ranges from each method ($M). */
export function football(p, srcs) {
  const e0 = p.rev * p.mg / 100, out = [];
  const evs = []; for (const dw of [-1, 1]) for (const dg of [-0.5, 0.5]) { const d = dcf({ ...p, wacc: p.wacc + dw, tg: p.tg + dg }); if (d.evG != null) evs.push(d.evG); }
  const base = dcf(p);
  if (evs.length) out.push({ k: 'dcfg', label: 'DCF, long-run growth', sub: `Discount rate ±1 point, growth ±0.5 point`, lo: Math.min(...evs), hi: Math.max(...evs), mid: base.evG });
  const evm = []; for (const dw of [-1, 1]) for (const dt of [-1, 1]) evm.push(dcf({ ...p, wacc: p.wacc + dw, tm: Math.max(1, p.tm + dt) }).evM);
  out.push({ k: 'dcfm', label: 'DCF, year-5 sale multiple', sub: 'Discount rate ±1 point, multiple ±1x', lo: Math.min(...evm), hi: Math.max(...evm), mid: base.evM });
  if (e0 > 0) {
    out.push({ k: 'gf', label: 'Lower-middle-market deals', sub: 'GF Data: 6.3x (under $25M) to 10.0x ($100M to $250M)', lo: 6.3 * e0, hi: 10.0 * e0, src: srcs?.gf });
    out.push({ k: 'cap', label: 'Typical to premium deals', sub: 'Capstone: 6.8x typical, 9.8x premium (2026)', lo: 6.8 * e0, hi: 9.8 * e0, src: srcs?.cap });
    const a = solveEntry(p, 0.25), b = solveEntry(p, 0.20);
    if (a != null && b != null) out.push({ k: 'lbo', label: 'What a buyer can pay', sub: 'Price that still earns a 20% to 25% annual return', lo: a * e0, hi: b * e0, mult: [a, b] });
  }
  return { rows: out, price: e0 * p.em, e0 };
}

/* ── Screened add-on targets: one rule for the model's add-on presets, the acquisition engine and the landing page,
   so a target's price, debt and return read the same everywhere. Additive helpers; lbo() and the input keys are unchanged.
   base = deal_model meta.base, td = meta.target_defaults, sec = a deal_model sector item, parent = the portfolio
   company preset's inputs, revM = the target's revenue in $M. ── */
export function targetVals(base, td, sec, parent, revM) {
  const rev = Math.round(revM * 10) / 10, e = rev * sec.margin_pct / 100;
  return { ...base, rev, mg: sec.margin_pct, gr: sec.growth_pct, em: td.em, lev: td.lev, ir: td.ir, dm: td.dm, ae: td.ae, xm: td.xm, am: td.em, n: td.n,
    nd: Math.round(e * td.lev * 10) / 10, tm: td.xm, ce: parent.ce, cm: parent.em, ra: Math.round(e * 100) / 100, rm: td.em, rx: parent.xm, wacc: parent.wacc };
}
/* The multiple range that deals of this size fetch, read from the deal_model benchmark items (bench). The band is
   picked by the price at the model's entry multiple: under $25M, $25M to $100M, or larger. e = EBITDA in $M. */
export function priceBand(e, em, bench) {
  const B = id => (bench || []).find(b => b.id === id) || null;
  const ev = e * em, small = B('b-small'), mid = B('b-typ-prem'), avg = B('b-entry-avg'), big = B('b-large');
  let lo, hi, ids, label;
  if (ev < 25 && small) { lo = small.low; hi = small.high; ids = [small]; label = 'average for deals under $25M of value'; }
  else if (ev < 100 && mid) { lo = mid.low; hi = mid.high; ids = [mid]; label = 'typical to premium middle-market deals'; }
  else if (avg && big) { lo = avg.value; hi = big.value; ids = [avg, big]; label = 'average buyout to deals of $100M to $250M'; }
  else return null;
  return { mLo: lo, mHi: hi, lo: e * lo, hi: e * hi, label, source_ids: [...new Set(ids.flatMap(b => b.source_ids || []))], inBand: em >= lo - 1e-9 && em <= hi + 1e-9 };
}
/* Headline deal math for one set of inputs ($M): price, fees, debt, equity check and the return if sold at the exit
   multiple after the hold. Every figure comes from lbo(), so it matches the returns view to the cent. */
export function dealSummary(p) {
  const R = lbo(p);
  return { ebitda: R.ebitda[0], price: R.ev0, fees: R.fees, debt: R.debt0, equity: R.eq0, cost: R.ev0 + R.fees, eqShare: R.ev0 + R.fees > 0 ? R.eq0 / (R.ev0 + R.fees) : null,
    cover: R.int[1] > 0 ? R.ebitda[1] / R.int[1] : null, irr: R.irr, moic: R.moic, years: R.N, exitEV: R.exitEV };
}

/* ── Share link: preset id plus only the inputs that differ from it ── */
const r4 = v => Math.round(v * 10000) / 10000;
export function encode(state, presetVals) {
  const q = new URLSearchParams(); q.set('p', state.preset);
  for (const [k, v] of Object.entries(state.vals)) if (presetVals == null || presetVals[k] == null || r4(presetVals[k]) !== r4(v)) q.set(k, String(r4(v)));
  return q.toString();
}
export function decode(params, keys) {
  const out = {}; for (const k of keys) { const v = num(params[k]); if (v != null) out[k] = v; } return out;
}

/* ── Excel workbook with live formulas (SheetJS) ───────────────────────────────────────────── */
const COL = i => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const FMT = { m: '#,##0.0', x: '0.0"x"', x2: '0.00"x"', p: '0.0%', p2: '0.00%', n: '0', d: '0.000' };
const zOf = key => key === 'dm' ? FMT.p2 : PCT.has(key) ? FMT.p : INT.has(key) ? FMT.n : /^(em|lev|xm|am|tm|cm|rm|rx)$/.test(key) ? FMT.x : FMT.m;

function sheet() { const ws = {}; ws._max = { r: 0, c: 0 }; return ws; }
function put(ws, c, r, cell) { ws[`${COL(c)}${r + 1}`] = cell; ws._max.r = Math.max(ws._max.r, r); ws._max.c = Math.max(ws._max.c, c); }
const S_ = v => ({ t: 's', v: String(v) });
const N_ = (v, z) => ({ t: 'n', v: fin(v) ? v : 0, ...(z ? { z } : {}) });
const F_ = (f, v, z) => (typeof v === 'string' ? { t: 's', v, f } : { t: 'n', v: fin(v) ? v : 0, f, ...(z ? { z } : {}) });
function finish(ws, cols) { ws['!ref'] = `A1:${COL(ws._max.c)}${ws._max.r + 1}`; if (cols) ws['!cols'] = cols.map(w => ({ wch: w })); delete ws._max; return ws; }

/* Formula text for each step of lbo(), for any layout: A(q, y) gives a cell address, N(key) an input
   reference (a defined name or an override cell), Y(y) the year (a cell or a literal). */
const LBO_Q = ['rev', 'mgn', 'org', 'add', 'ebitda', 'buy', 'adebt', 'aeq', 'int', 'cash', 'nd', 'cf'];
function lboFormula(q, y, A, N, Y) {
  const p = y - 1;
  switch (q) {
    case 'rev': return y ? `${A('rev', p)}*(1+${N('gr')})` : `${N('rev')}`;
    case 'mgn': return `${N('mg')}+${N('dm')}*${Y(y)}`;
    case 'org': return `${A('rev', y)}*${A('mgn', y)}`;
    case 'add': return y ? `${A('add', p)}*(1+${N('gr')})+IF(AND(${Y(y)}>=2,${Y(y)}<=${N('yrs')}),${N('ae')},0)` : null;
    case 'ebitda': return `${A('org', y)}+${A('add', y)}`;
    case 'buy': return y ? `IF(${Y(y)}<=${N('yrs')}-1,${N('ae')}*${N('am')},0)` : null;
    case 'adebt': return `${A('buy', y)}*${N('ad')}`;
    case 'aeq': return `${A('buy', y)}-${A('adebt', y)}`;
    case 'int': return y ? `MAX(0,${A('nd', p)})*${N('ir')}` : null;
    case 'cash': return y ? `${A('ebitda', y)}*${N('cc')}-${A('int', y)}` : null;
    case 'nd': return y ? `${A('nd', p)}-${A('cash', y)}+${A('adebt', y)}` : `${A('ebitda', 0)}*${N('lev')}`;
    case 'cf': return y ? `IF(${Y(y)}<${N('yrs')},-${A('aeq', y)},IF(${Y(y)}=${N('yrs')},${A('ebitda', y)}*${N('xm')}-${A('nd', y)}-${A('aeq', y)},0))` : `-(${A('ebitda', 0)}*${N('em')}*(1+${N('fee')})-${A('nd', 0)})`;
  }
}
const LBO_Z = { rev: FMT.m, mgn: FMT.p, org: FMT.m, add: FMT.m, ebitda: FMT.m, buy: FMT.m, adebt: FMT.m, aeq: FMT.m, int: FMT.m, cash: FMT.m, nd: FMT.m, cf: FMT.m };

/**
 * Build the workbook. XLSX is the SheetJS global; st = {label, vals, est:Set, inputs:[meta], basis:{}};
 * returns a SheetJS workbook object (write it with XLSX.write).
 */
export function workbook(XLSX, st, info = {}) {
  const p = st.vals, inputs = st.inputs, NAME = k => XL_NAME[k];
  const wb = XLSX.utils.book_new();
  const names = [];
  const R = lbo(p), D = dcf(p), U = rollup(p);

  /* Inputs */
  const wi = sheet();
  put(wi, 0, 0, S_('BSP Desk · Acquisition model'));
  put(wi, 0, 1, S_(`Scenario: ${st.label}`));
  put(wi, 0, 2, S_(`Prepared by Syed Rahman · ${info.date || ''}. Change the values in column C; every other sheet recalculates.`));
  put(wi, 0, 3, S_('Rows marked est. are estimates from public filings or analyst assumptions, not BSP figures.'));
  ['Section', 'Input', 'Value', 'Unit', 'What it means', 'Estimate', 'Basis'].forEach((h, c) => put(wi, c, 5, S_(h)));
  const SEC = { deal: 'Deal', plan: 'Plan', dcf: 'DCF', rollup: 'Roll-up' };
  let r = 6;
  const inRow = {};
  for (const m of inputs) {
    const v = PCT.has(m.key) ? p[m.key] / 100 : p[m.key];
    put(wi, 0, r, S_(SEC[m.group] || '')); put(wi, 1, r, S_(m.label)); put(wi, 2, r, N_(v, zOf(m.key)));
    put(wi, 3, r, S_(PCT.has(m.key) ? m.unit.replace(/^%\s*/, '').replace(/^pts\s*/, 'points ') || 'percent' : m.unit)); put(wi, 4, r, S_(m.gloss || ''));
    put(wi, 5, r, S_(st.est.has(m.key) ? 'est.' : '')); put(wi, 6, r, S_(st.basis?.[m.key] || ''));
    names.push({ Name: NAME(m.key), Ref: `Inputs!$C$${r + 1}` }); inRow[m.key] = r; r++;
  }
  XLSX.utils.book_append_sheet(wb, finish(wi, [10, 26, 10, 18, 60, 9, 70]), 'Inputs');

  /* Model (returns): line items down, years across (B = year 0 … I = year 7) */
  const wm = sheet();
  const ROW = { yr: 3, status: 4, rev: 5, mgn: 6, org: 7, add: 8, ebitda: 9, buy: 10, adebt: 11, aeq: 12, int: 13, cash: 14, nd: 15, lev: 16, cf: 17 };
  const LAB = { yr: 'Year', status: 'Status', rev: 'Revenue, before add-ons', mgn: 'EBITDA margin', org: 'EBITDA, before add-ons', add: 'EBITDA from add-ons', ebitda: 'EBITDA, total', buy: 'Add-on spend',
    adebt: '  of which borrowed', aeq: '  of which new equity', int: 'Interest', cash: 'Cash to repay debt', nd: 'Net debt, end of year', lev: 'Net debt / EBITDA', cf: 'Equity cash flow (negative = money in)' };
  const A = (q, y) => `${COL(1 + y)}${ROW[q] + 1}`, Nm = k => NAME(k), Yc = y => `${COL(1 + y)}$${ROW.yr + 1}`;
  put(wm, 0, 0, S_('Buyout returns')); put(wm, 0, 1, S_('Year 0 is the purchase; the company is sold at the end of the exit year on the Inputs sheet. Figures in $M.'));
  for (const q of Object.keys(LAB)) put(wm, 0, ROW[q], S_(LAB[q]));
  for (let y = 0; y <= H; y++) {
    put(wm, 1 + y, ROW.yr, N_(y, FMT.n));
    const stv = y === 0 ? 'Buy' : y < R.N ? 'Own' : y === R.N ? 'Sell' : 'After sale';
    put(wm, 1 + y, ROW.status, F_(`IF(${Yc(y)}=0,"Buy",IF(${Yc(y)}<ExitYear,"Own",IF(${Yc(y)}=ExitYear,"Sell","After sale")))`, stv));
    for (const q of LBO_Q) { const f = lboFormula(q, y, A, Nm, Yc); put(wm, 1 + y, ROW[q], f ? F_(f, R[q][y], LBO_Z[q]) : N_(0, LBO_Z[q])); }
    put(wm, 1 + y, ROW.lev, F_(`IF(${A('ebitda', y)}>0,${A('nd', y)}/${A('ebitda', y)},"n/m")`, R.ebitda[y] > 0 ? R.nd[y] / R.ebitda[y] : 'n/m', FMT.x));
  }
  const rng = q => `${A(q, 0)}:${A(q, H)}`;
  const OUT = [
    ['Purchase price (enterprise value)', `${A('ebitda', 0)}*EntryMultiple`, R.ev0, FMT.m],
    ['Deal fees', 'B20*Fees', R.fees, FMT.m],
    ['Debt at entry', `${A('nd', 0)}`, R.debt0, FMT.m],
    ['Equity check at entry', 'B20+B21-B22', R.eq0, FMT.m],
    ['Add-on equity over the hold', `SUM(${rng('aeq')})`, R.addEq, FMT.m],
    ['Total equity invested', 'B23+B24', R.totalEq, FMT.m],
    ['EBITDA in the exit year', `INDEX(${rng('ebitda')},ExitYear+1)`, R.exitE, FMT.m],
    ['Exit value (enterprise value)', 'B26*ExitMultiple', R.exitEV, FMT.m],
    ['Net debt at exit', `INDEX(${rng('nd')},ExitYear+1)`, R.exitND, FMT.m],
    ['Equity value at exit', 'B27-B28', R.exitEq, FMT.m],
    ['MOIC (money multiple)', 'IF(B25>0,B29/B25,"n/m")', R.moic == null ? 'n/m' : R.moic, FMT.x2],
    ['IRR (annual return)', `IF(B23>0,IFERROR(IRR(${rng('cf')}),"n/m"),"n/m")`, R.irr == null ? 'n/m' : R.irr, FMT.p],
  ];
  OUT.forEach(([l, f, v, z], i) => { put(wm, 0, 19 + i, S_(l)); put(wm, 1, 19 + i, F_(f, v, z)); });
  put(wm, 0, 32, S_('Sources and uses at entry'));
  [['Uses: purchase price', 'B20', R.ev0], ['Uses: deal fees', 'B21', R.fees], ['Total uses', 'B34+B35', R.ev0 + R.fees], ['Sources: debt', 'B22', R.debt0], ['Sources: equity', 'B23', R.eq0], ['Total sources', 'B37+B38', R.debt0 + R.eq0]]
    .forEach(([l, f, v], i) => { put(wm, 0, 33 + i, S_(l)); put(wm, 1, 33 + i, F_(f, v, FMT.m)); });
  put(wm, 0, 40, S_('Where the equity gain comes from'));
  const yrs = `${A('yr', 1)}:${A('yr', H)}`, sl = q => `${A(q, 1)}:${A(q, H)}`;
  const BR = [
    ['Earnings growth (at the entry multiple)', `(B26-${A('ebitda', 0)})*EntryMultiple`, R.bridge[0].v],
    ['Exit multiple versus entry', '(ExitMultiple-EntryMultiple)*B26', R.bridge[1].v],
    ['Cash that repaid debt', `SUMPRODUCT((${yrs}<=ExitYear)*${sl('cash')})`, R.bridge[2].v],
    ['Paid for add-ons', `-SUMPRODUCT((${yrs}<=ExitYear)*${sl('buy')})`, R.bridge[3].v],
    ['Deal fees', '-B21', R.bridge[4].v],
    ['Equity gain', 'SUM(B42:B46)', R.gain],
    ['Check: equity value at exit minus total equity', 'B29-B25', R.gain],
  ];
  BR.forEach(([l, f, v], i) => { put(wm, 0, 41 + i, S_(l)); put(wm, 1, 41 + i, F_(f, v, FMT.m)); });
  XLSX.utils.book_append_sheet(wb, finish(wm, [44, 11, 11, 11, 11, 11, 11, 11, 11]), 'Model');

  /* DCF */
  const wd = sheet();
  const DR = { yr: 3, rev: 4, mgn: 5, ebitda: 6, da: 7, ebit: 8, tax: 9, capex: 10, dnwc: 11, fcf: 12, df: 13, pv: 14 };
  const DL = { yr: 'Year', rev: 'Revenue', mgn: 'EBITDA margin', ebitda: 'EBITDA', da: 'Depreciation', ebit: 'Operating profit (EBIT)', tax: 'Tax on operating profit', capex: 'Capital spending', dnwc: 'Increase in working capital', fcf: 'Free cash flow (unlevered)', df: 'Discount factor', pv: 'Present value of free cash flow' };
  const B = (q, y) => `${COL(1 + y)}${DR[q] + 1}`, Yd = y => `${COL(1 + y)}$${DR.yr + 1}`;
  put(wd, 0, 0, S_('Discounted cash flow')); put(wd, 0, 1, S_('Five years of free cash flow, then a value for every year after, discounted at the WACC. Figures in $M.'));
  for (const q of Object.keys(DL)) put(wd, 0, DR[q], S_(DL[q]));
  for (let y = 0; y <= DCF_YEARS; y++) {
    const f = {
      yr: null, rev: y ? `${B('rev', y - 1)}*(1+Growth)` : 'Revenue', mgn: `Margin+MarginChange*${Yd(y)}`, ebitda: `${B('rev', y)}*${B('mgn', y)}`, da: `${B('rev', y)}*Depreciation`,
      ebit: `${B('ebitda', y)}-${B('da', y)}`, tax: `${B('ebit', y)}*TaxRate`, capex: `${B('rev', y)}*Capex`, dnwc: y ? `(${B('rev', y)}-${B('rev', y - 1)})*WorkingCapital` : null,
      fcf: y ? `${B('ebit', y)}-${B('tax', y)}+${B('da', y)}-${B('capex', y)}-${B('dnwc', y)}` : null, df: `1/(1+WACC)^${Yd(y)}`, pv: y ? `${B('fcf', y)}*${B('df', y)}` : null,
    };
    put(wd, 1 + y, DR.yr, N_(y, FMT.n));
    for (const q of Object.keys(DR)) { if (q === 'yr') continue; const z = q === 'mgn' ? FMT.p : q === 'df' ? FMT.d : FMT.m; put(wd, 1 + y, DR[q], f[q] ? F_(f[q], D[q][y], z) : N_(0, z)); }
  }
  const L5 = q => B(q, DCF_YEARS);
  const DO = [
    ['Present value of years 1 to 5', `SUM(${B('pv', 1)}:${L5('pv')})`, D.sumPV, FMT.m],
    ['Value of later years: long-run growth method', `IF(WACC>LongRunGrowth,${L5('fcf')}*(1+LongRunGrowth)/(WACC-LongRunGrowth),"n/m")`, D.tvG ?? 'n/m', FMT.m],
    ['  discounted to today', `IFERROR(B18*${L5('df')},"n/m")`, D.pvTvG ?? 'n/m', FMT.m],
    ['Enterprise value: long-run growth method', 'IFERROR(B17+B19,"n/m")', D.evG ?? 'n/m', FMT.m],
    ['Value of later years: year-5 sale multiple', `${L5('ebitda')}*SaleMultipleY5`, D.tvM, FMT.m],
    ['  discounted to today', `B21*${L5('df')}`, D.pvTvM, FMT.m],
    ['Enterprise value: sale-multiple method', 'B17+B22', D.evM, FMT.m],
    ['Net debt', 'NetDebt', p.nd, FMT.m],
    ['Equity value: long-run growth method', 'IFERROR(B20-B24,"n/m")', D.eqG ?? 'n/m', FMT.m],
    ['Equity value: sale-multiple method', 'B23-B24', D.eqM, FMT.m],
    ['Sale multiple implied by the growth method', `IFERROR(B18/${L5('ebitda')},"n/m")`, D.impliedMult ?? 'n/m', FMT.x],
    ['Long-run growth implied by the sale multiple', `IFERROR((B21*WACC-${L5('fcf')})/(B21+${L5('fcf')}),"n/m")`, D.impliedG ?? 'n/m', FMT.p],
    ['Enterprise value / EBITDA today (growth method)', `IFERROR(B20/${B('ebitda', 0)},"n/m")`, D.evMultG ?? 'n/m', FMT.x],
  ];
  DO.forEach(([l, f, v, z], i) => { put(wd, 0, 16 + i, S_(l)); put(wd, 1, 16 + i, F_(f, v, z)); });
  XLSX.utils.book_append_sheet(wb, finish(wd, [46, 11, 11, 11, 11, 11, 11]), 'DCF');

  /* Roll-up */
  const wr = sheet();
  put(wr, 0, 0, S_('Buy-and-build roll-up')); put(wr, 0, 1, S_('One company plus add-ons bought at a lower multiple. Figures in $M.'));
  const RU = [
    ['Company EBITDA', 'CompanyEBITDA', p.ce, FMT.m], ['Company price', 'B4*CompanyMultiple', U.coEV, FMT.m], ['Add-on EBITDA bought', 'AddOnCount*EBITDAPerAddOn', U.addE, FMT.m],
    ['Add-on price', 'B6*RollupAddOnMultiple', U.addPrice, FMT.m], ['Integration cost', 'AddOnCount*IntegrationCost', U.integ, FMT.m], ['Total cost', 'B5+B7+B8', U.cost, FMT.m],
    ['Combined EBITDA at purchase', 'B4+B6', U.pfE, FMT.m], ['Blended multiple paid', 'IFERROR((B5+B7)/B10,"n/m")', U.blended ?? 'n/m', FMT.x], ['EBITDA grown to the exit year', 'B10*(1+Growth)^ExitYear', U.grownE, FMT.m],
    ['Synergies (EBITDA)', 'B6*Synergies', U.synE, FMT.m], ['EBITDA at exit', 'B12+B13', U.exitE, FMT.m], ['Exit value', 'B14*RollupExitMultiple', U.exitEV, FMT.m], ['Value created', 'B15-B9', U.created, FMT.m],
  ];
  RU.forEach(([l, f, v, z], i) => { put(wr, 0, 3 + i, S_(l)); put(wr, 1, 3 + i, F_(f, v, z)); });
  put(wr, 0, 17, S_('Where the value comes from'));
  const RP = [['Multiple arbitrage', 'IFERROR((RollupExitMultiple-B11)*B10,0)', U.parts[0].v], ['Operating growth', '(B12-B10)*RollupExitMultiple', U.parts[1].v], ['Synergies', 'B13*RollupExitMultiple', U.parts[2].v], ['Integration cost', '-B8', U.parts[3].v], ['Total (equals value created)', 'SUM(B19:B22)', U.created]];
  RP.forEach(([l, f, v], i) => { put(wr, 0, 18 + i, S_(l)); put(wr, 1, 18 + i, F_(f, v, FMT.m)); });
  put(wr, 0, 24, S_('Company alone: value created without add-ons')); put(wr, 1, 24, F_('B4*(1+Growth)^ExitYear*RollupExitMultiple-B5', U.alone, FMT.m));
  put(wr, 0, 25, S_('Exit value / total cost')); put(wr, 1, 25, F_('IFERROR(B15/B9,"n/m")', U.onCost ?? 'n/m', FMT.x2));
  put(wr, 0, 27, S_('Add-ons bought')); put(wr, 1, 27, S_('Combined EBITDA')); put(wr, 2, 27, S_('Total paid')); put(wr, 3, 27, S_('Blended multiple'));
  for (let k = 0; k <= 12; k++) {
    const rr = 28 + k, st = U.steps[k];
    put(wr, 0, rr, N_(k, FMT.n));
    put(wr, 1, rr, F_(`IF(A${rr + 1}<=AddOnCount,$B$4+A${rr + 1}*EBITDAPerAddOn,"")`, st ? st.ebitda : '', FMT.m));
    put(wr, 2, rr, F_(`IF(A${rr + 1}<=AddOnCount,$B$5+A${rr + 1}*EBITDAPerAddOn*RollupAddOnMultiple,"")`, st ? st.paid : '', FMT.m));
    put(wr, 3, rr, F_(`IF(A${rr + 1}<=AddOnCount,IFERROR(C${rr + 1}/B${rr + 1},""),"")`, st ? (st.blended ?? '') : '', FMT.x));
  }
  XLSX.utils.book_append_sheet(wb, finish(wr, [46, 16, 14, 16]), 'Roll-up');

  /* Sensitivity + the scenario engine behind it (one full buyout model per cell, laid out in a row) */
  const ws = sheet(), we = sheet();
  put(ws, 0, 0, S_('Sensitivity')); put(ws, 0, 1, S_('Each cell re-runs the buyout model with two inputs moved; the rows that do the work are on the Scenario engine sheet.'));
  const T = [{ spec: SENS.irr, top: 3, title: 'IRR (annual return): entry multiple down, exit multiple across', z: FMT.p, fmtAxis: FMT.x },
    { spec: SENS.moic, top: 11, title: 'MOIC (money multiple): revenue growth down, margin gain a year across', z: FMT.x2, fmtAxis: FMT.p }];
  const RES = ['exitE', 'exitND', 'exitEq', 'totalEq', 'moic', 'irr'], RESL = ['EBITDA at exit', 'Net debt at exit', 'Equity at exit', 'Total equity', 'MOIC', 'IRR'];
  const BLK = 1 + RES.length; // first block column
  put(we, 0, 0, S_('Scenario engine')); put(we, 0, 1, S_('One complete buyout model per row: the two moved inputs come from the Sensitivity sheet, everything else from Inputs.'));
  put(we, 0, 3, S_('Scenario')); RESL.forEach((l, i) => put(we, 1 + i, 3, S_(l)));
  LBO_Q.forEach((q, qi) => { for (let y = 0; y <= H; y++) put(we, BLK + qi * (H + 1) + y, 3, S_(`${LAB[q] || q} · year ${y}`)); });
  let er = 4;
  for (const t of T) {
    const { spec } = t; const tab = sensTable(p, spec);
    put(ws, 0, t.top, S_(t.title));
    put(ws, 1, t.top + 1, S_(`${spec.rowLabel} \\ ${spec.colLabel}`));
    const pctAxis = PCT.has(spec.rowKey);
    const baseRef = k => NAME(k);
    const step = (k, s) => PCT.has(k) ? s / 100 : s;
    const axisF = (k, o, s) => (k === 'em' || k === 'xm') ? `MAX(1,${baseRef(k)}${o >= 0 ? '+' : ''}${o * s})` : `${baseRef(k)}${o >= 0 ? '+' : ''}${o * step(k, s)}`;
    OFFS.forEach((o, j) => put(ws, 2 + j, t.top + 1, F_(axisF(spec.colKey, o, spec.colStep), PCT.has(spec.colKey) ? tab.cols[j] / 100 : tab.cols[j], zOf(spec.colKey))));
    OFFS.forEach((o, i) => put(ws, 1, t.top + 2 + i, F_(axisF(spec.rowKey, o, spec.rowStep), pctAxis ? tab.rows[i] / 100 : tab.rows[i], zOf(spec.rowKey))));
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const rowRef = `Sensitivity!$B$${t.top + 3 + i}`, colRef = `Sensitivity!$${COL(2 + j)}$${t.top + 2}`;
      const Nn = k => k === spec.rowKey ? rowRef : k === spec.colKey ? colRef : NAME(k);
      const Ae = (q, y) => `${COL(BLK + LBO_Q.indexOf(q) * (H + 1) + y)}${er + 1}`;
      const sc = tab.cells[i][j].r;
      put(we, 0, er, S_(`${t === T[0] ? 'IRR' : 'MOIC'} table, row ${i + 1}, column ${j + 1}`));
      for (const q of LBO_Q) for (let y = 0; y <= H; y++) { const f = lboFormula(q, y, Ae, Nn, yy => String(yy)); put(we, BLK + LBO_Q.indexOf(q) * (H + 1) + y, er, f ? F_(f, sc[q][y], FMT.m) : N_(0, FMT.m)); }
      const rg = q => `${Ae(q, 0)}:${Ae(q, H)}`, c = k => `${COL(1 + RES.indexOf(k))}${er + 1}`;
      put(we, 1, er, F_(`INDEX(${rg('ebitda')},ExitYear+1)`, sc.exitE, FMT.m));
      put(we, 2, er, F_(`INDEX(${rg('nd')},ExitYear+1)`, sc.exitND, FMT.m));
      put(we, 3, er, F_(`${c('exitE')}*${Nn('xm')}-${c('exitND')}`, sc.exitEq, FMT.m));
      put(we, 4, er, F_(`-${Ae('cf', 0)}+SUM(${rg('aeq')})`, sc.totalEq, FMT.m));
      put(we, 5, er, F_(`IF(${c('totalEq')}>0,${c('exitEq')}/${c('totalEq')},"n/m")`, sc.moic ?? 'n/m', FMT.x2));
      put(we, 6, er, F_(`IF(${Ae('cf', 0)}<0,IFERROR(IRR(${rg('cf')}),"n/m"),"n/m")`, sc.irr ?? 'n/m', FMT.p));
      const outCol = spec.out === 'irr' ? 6 : 5;
      put(ws, 2 + j, t.top + 2 + i, F_(`'Scenario engine'!${COL(outCol)}${er + 1}`, tab.cells[i][j].v ?? 'n/m', t.z));
      er++;
    }
    er++;
  }
  put(ws, 0, 19, S_(`Green in the site means above a 20% IRR or a 2.5x money multiple. The base case is the middle cell.`));
  XLSX.utils.book_append_sheet(wb, finish(ws, [10, 30, 11, 11, 11, 11, 11]), 'Sensitivity');
  XLSX.utils.book_append_sheet(wb, finish(we, [26, ...new Array(RES.length).fill(12), ...new Array(LBO_Q.length * (H + 1)).fill(10)]), 'Scenario engine');

  /* Sources */
  const wsrc = sheet();
  put(wsrc, 0, 0, S_('Sources')); ['Source', 'What it gives', 'Link', 'Retrieved'].forEach((h, c) => put(wsrc, c, 2, S_(h)));
  (info.sources || []).forEach((s, i) => { put(wsrc, 0, 3 + i, S_(s.label)); put(wsrc, 1, 3 + i, S_(s.facts || '')); put(wsrc, 2, 3 + i, S_(s.url || '')); put(wsrc, 3, 3 + i, S_(s.retrieved || '')); });
  XLSX.utils.book_append_sheet(wb, finish(wsrc, [56, 80, 60, 12]), 'Sources');

  wb.Workbook = { Names: names };
  wb.Props = { Title: `BSP Desk acquisition model: ${st.label}`, Author: 'Syed Rahman' };
  return wb;
}

/* CSV fallback: inputs, the year-by-year model and the headline results. */
export function csv(st) {
  const p = st.vals, R = lbo(p), D = dcf(p), U = rollup(p);
  const rows = [['BSP Desk acquisition model', st.label], [], ['Input', 'Value', 'Unit', 'Estimate']];
  for (const m of st.inputs) rows.push([m.label, p[m.key], m.unit, st.est.has(m.key) ? 'est.' : '']);
  rows.push([], ['Year', ...R.yr.slice(0, R.N + 1)]);
  const L = [['Revenue before add-ons ($M)', 'rev'], ['EBITDA total ($M)', 'ebitda'], ['Add-on spend ($M)', 'buy'], ['Interest ($M)', 'int'], ['Cash to repay debt ($M)', 'cash'], ['Net debt ($M)', 'nd'], ['Equity cash flow ($M)', 'cf']];
  for (const [l, q] of L) rows.push([l, ...R[q].slice(0, R.N + 1).map(v => +v.toFixed(3))]);
  rows.push([], ['Result', 'Value']);
  rows.push(['Purchase price ($M)', +R.ev0.toFixed(3)], ['Equity check ($M)', +R.eq0.toFixed(3)], ['Exit value ($M)', +R.exitEV.toFixed(3)], ['Equity value at exit ($M)', +R.exitEq.toFixed(3)],
    ['MOIC (money multiple)', R.moic == null ? 'n/m' : +R.moic.toFixed(3)], ['IRR (annual return)', R.irr == null ? 'n/m' : +(R.irr * 100).toFixed(2) + '%'],
    ['DCF enterprise value, growth method ($M)', D.evG == null ? 'n/m' : +D.evG.toFixed(3)], ['DCF enterprise value, sale-multiple method ($M)', +D.evM.toFixed(3)],
    ['Roll-up blended multiple', U.blended == null ? 'n/m' : +U.blended.toFixed(3)], ['Roll-up value created ($M)', +U.created.toFixed(3)]);
  const cell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map(r => r.map(cell).join(',')).join('\n');
}
