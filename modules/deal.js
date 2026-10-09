import * as Copy from './copy.js?v=20261009070649';
import * as L from './deal-lib.js?v=20261009070649';
/* ═══════════════════════════════════════════════════════════════════════════
   Acquisition model: a live buyout, DCF, roll-up and sensitivity model with
   spreadsheet-style input cells, presets from the portfolio's own estimates and
   the add-on screens, a share link and an Excel download with live formulas.
   Datasets: deal_model (assumptions, benchmarks, presets, sources), add-on
   target lists (CET, Punctual Pros, Frontline and Thomas Scientific).
   ═══════════════════════════════════════════════════════════════════════════ */

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const COLOR = 'color-mix(in srgb,var(--sys-good) 72%,var(--sys-ink))';
const CO_COLOR = { pp: 'var(--co-pp)', cet: 'var(--co-cet)', fl: 'var(--co-fl)', ts: 'var(--co-ts)', bpi: 'var(--co-bpi)', fh: 'var(--co-fh)' };
const CO_ROUTE = { pp: 'pp', cet: 'cet', fl: 'fl', ts: 'ts' };
const injectCss = () => { if (!document.getElementById('css-deal')) { const l = document.createElement('link'); l.id = 'css-deal'; l.rel = 'stylesheet'; l.href = 'modules/deal.css?v=20261009070649'; document.head.appendChild(l); } };

/* ── formatting ──────────────────────────────────────────────────────────── */
const MINUS = '−';
const nf = (v, d = 1) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fin = v => typeof v === 'number' && isFinite(v);
const $m = (v, d) => { if (!fin(v)) return 'n/m'; const a = Math.abs(v); const dd = d ?? (a >= 1000 ? 0 : a < 10 ? 2 : 1); const s = a >= 1000 ? `$${nf(a / 1000, 2)}B` : `$${nf(a, dd)}M`; return v < 0 ? MINUS + s : s; };
const xm = (v, d = 1) => fin(v) ? `${nf(v, d)}x` : 'n/m';
const pc = (v, d = 1) => fin(v) ? `${v < 0 ? MINUS : ''}${nf(Math.abs(v * 100), d)}%` : 'n/m';
const cellNum = v => fin(v) ? (v < 0 ? MINUS : '') + nf(Math.abs(v), Math.abs(v) >= 1000 ? 0 : 1) : '—';
const trim = v => { if (!fin(v)) return ''; const r = Math.round(v * 100) / 100; return String(r); };
const r4 = v => Math.round(v * 10000) / 10000;
const clip = (s, n) => { s = String(s || ''); return s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,;:]+\S*$/, '') + '…'; };

/* ── data: presets, inputs, sources ─────────────────────────────────────── */
let DM = null, PRESETS = null, BYID = null, INP = null, SRC = null, TARGETS = {}, S = null;
const affil = t => /punctual\s*pros/i.test(String(t?.company || '')) || (t?.risk_flags || []).some(r => /name collision|already affiliated/i.test(r));
const shortName = s => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/,?\s+(Inc|LLC|Corp|Corporation|Co)\.?$/i, '').replace(/\s{2,}/g, ' ').trim();

async function boot(data) {
  if (PRESETS) return true;
  const [dm, pp, cet, flts] = await Promise.all(['deal_model', 'ma_targets_pp', 'ma_targets_cet', 'ma_targets_fl_ts'].map(n => data.research(n)));
  if (!dm) return false;
  DM = dm; INP = Object.fromEntries(dm.meta.inputs.map(i => [i.key, i])); SRC = Object.fromEntries(dm.meta.sources.map(s => [s.id, s]));
  const list = [];
  for (const it of dm.items.filter(i => i.kind === 'preset')) list.push({ id: it.id, label: it.label, group: it.co && it.group !== 'generic' ? 'BSP portfolio companies' : 'Market', generic: it.group === 'generic', co: it.co, summary: it.summary, vals: { ...it.inputs }, est: new Set(it.est || []), basis: it.basis || {}, sources: it.source_ids || [] });
  const parent = Object.fromEntries(list.filter(p => p.co).map(p => [p.co, p]));
  const TD = dm.meta.target_defaults;
  const files = { ma_targets_pp: pp, ma_targets_cet: cet, ma_targets_fl_ts: flts };
  for (const sec of dm.items.filter(i => i.kind === 'sector')) {
    const f = files[sec.target_file]; const par = parent[sec.co]; if (!f || !par) continue;
    const pool = (f.items || []).filter(t => sec.co === 'fl' ? t.platform === 'frontline' : sec.co === 'ts' ? t.platform === 'thomas_scientific' : true).filter(t => !affil(t));
    TARGETS[sec.co] = pool.filter(t => +t.revenue_est_usd > 0).sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)).map(t => ({ id: t.id, name: shortName(t.company), rev: t.revenue_est_usd / 1e6, ebitda: t.revenue_est_usd / 1e6 * sec.margin_pct / 100, fit: t.fit_score, state: t.state || '', margin: sec.margin_pct }));
    /* Every screened target gets a preset, so any profile in the acquisition engine opens here prefilled; the picker lists the
       top three by fit (as before) plus whichever target is open. A target with no revenue on record is sized at the median. */
    const listed = TARGETS[sec.co].slice(0, 3), listedIds = new Set(listed.map(t => t.id));
    const revs = TARGETS[sec.co].map(t => t.rev).sort((a, b) => a - b), medRev = revs.length ? (revs.length % 2 ? revs[(revs.length - 1) / 2] : (revs[revs.length / 2 - 1] + revs[revs.length / 2]) / 2) : null;
    const rest = pool.filter(t => !listedIds.has(t.id)).sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0)).map(t => ({ id: t.id, name: shortName(t.company), rev: +t.revenue_est_usd > 0 ? t.revenue_est_usd / 1e6 : null, fit: t.fit_score }));
    for (const t of [...listed, ...rest]) {
      const sized = !(t.rev > 0); if (sized && medRev == null) continue;
      const vals = L.targetVals(dm.meta.base, TD, sec, par.vals, sized ? medRev : t.rev);
      list.push({ id: t.id, label: t.name, group: `Screened add-on targets`, co: sec.co, parent: par.id, hidden: !listedIds.has(t.id), summary: `${sec.label} for ${par.label}; fit score ${t.fit} of 100.${sized ? ' No revenue on record, so it is sized at the median screened target.' : ''}`, vals,
        est: new Set(['rev', 'mg', 'gr', 'nd', 'ra', 'ce']),
        basis: { ...TD.basis, rev: sized ? `No revenue on record for this company; sized at the median screened ${par.label} target ($${nf(medRev, 1)}M).` : `Modelled revenue from the ${par.label} add-on screen (fit score ${t.fit} of 100).`, mg: sec.basis, gr: `Assumed for a ${sec.label.toLowerCase()}.`, ce: `${par.label}: EBITDA used in its own preset.`, cm: `${par.label}: entry multiple used in its own preset.`, rx: `${par.label}: exit multiple used in its own preset.`, ra: 'This target at the sector margin.' },
        sources: [...new Set([...TD.source_ids, ...sec.source_ids, 'targets'])] });
    }
  }
  PRESETS = list; BYID = new Map(list.map(p => [p.id, p]));
  return true;
}

const keys = () => DM.meta.inputs.map(i => i.key);
const preset = () => BYID.get(S.preset) || PRESETS[0];
/* A scenario opened from the acquisition engine (a rival company, built with L.encode from its estimates) carries a
   display name in `for`; the inputs it set count as est. until someone types over them. */
const isEst = k => { const p = preset(); if (S.forVals && S.forVals[k] != null && r4(S.vals[k]) === r4(S.forVals[k])) return true; return p.est.has(k) && r4(S.vals[k]) === r4(p.vals[k]); };
function setPreset(id) { const p = BYID.get(id) || PRESETS[0]; S = { preset: p.id, vals: { ...p.vals } }; }
function fromParams(params) {
  const known = keys().some(k => params[k] != null) || params.p;
  if (known) {
    setPreset(params.p && BYID.has(params.p) ? params.p : (S?.preset || 'typical'));
    const d = sanitize(L.decode(params, keys())); Object.assign(S.vals, d);
    const f = String(params.for || '').replace(/[<>]/g, '').trim().slice(0, 80);
    if (f) { S.for = f; S.forVals = d; }
  }
  else if (!S) setPreset('typical');
}
function clampKey(k, v) { const m = INP[k]; if (!m || !fin(v)) return null; let x = Math.min(m.max, Math.max(m.min, v)); if (L.INT.has(k)) x = Math.round(x); return x; }
function sanitize(o) { const out = {}; for (const [k, v] of Object.entries(o)) { const c = clampKey(k, v); if (c != null) out[k] = c; } return out; }
function syncHash(ctx) {
  const q = L.encode(S, preset().vals) + (S.for ? `&for=${encodeURIComponent(S.for)}` : ''); const h = `#/deal/${ctx.view.id}?${q}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

/* ── shared chrome: head, toolbar, how-to note, source line ─────────────── */
const LEADS = {
  returns: 'Buy one company with debt, grow it, add smaller companies, sell it. Change any white cell and every number recalculates.',
  dcf: 'Value the company from the cash it should produce, discounted to today, then compare with what similar deals fetch.',
  rollup: 'Buy smaller companies for less per dollar of EBITDA than the combined company sells for. See how much value that gap creates.',
  sensitivity: 'How the annual return and the money multiple move when the price, the sale multiple, growth or margins change.',
};
const HOWTO = {
  returns: '<b>How to read this.</b> MOIC (money multiple) is what each dollar invested comes back as: 2.5x turns $10M into $25M. IRR (annual return) spreads that over the years held; buyout funds usually aim for 20% or more.',
  dcf: '<b>How to read this.</b> Free cash flow is the cash left after tax, equipment and working capital. Most of a DCF value usually sits in the years after year 5, so the two methods are shown side by side.',
  rollup: '<b>How to read this.</b> Multiple arbitrage is the gain from paying, say, 6.5x for small companies and selling the combined company at 9x. Operating growth is the gain from earning more.',
  sensitivity: '<b>How to read this.</b> The middle cell is the current model. Green beats a 20% annual return or a 2.5x money multiple; red falls short. Each cell is a full re-run of the model.',
};

function toolbar(ctx) {
  const { esc, ui } = ctx;
  const groups = [...new Set(PRESETS.map(p => p.group))];
  const opts = groups.map(g => `<optgroup label="${esc(g)}">${PRESETS.filter(p => p.group === g && (!p.hidden || p.id === S.preset)).map(p => `<option value="${esc(p.id)}"${p.id === S.preset ? ' selected' : ''}>${esc(p.label)}${p.group.startsWith('Screened') ? ` (for ${esc(BYID.get(p.parent)?.label || '')})` : ''}</option>`).join('')}</optgroup>`).join('');
  return `<div class="dm-bar">
    <label class="sys-field dm-pick"><span class="sys-field-label">Start from</span><select class="sys-input" id="dm-preset" aria-label="Start from a preset">${opts}</select></label>
    <div class="dm-btns">
      <button type="button" class="${ui.btnCls('primary', 'sm', 'primary')}" id="dm-xlsx">Download Excel</button>
      <button type="button" class="${ui.btnCls('secondary', 'sm')}" id="dm-csv">CSV</button>
      <button type="button" class="${ui.btnCls('secondary', 'sm')}" id="dm-link">Copy link</button>
      <button type="button" class="${ui.btnCls('ghost', 'sm', 'ghost')}" id="dm-reset">Reset</button>
    </div>
  </div>
  <p class="dm-preset-sum sys-src" id="dm-sum"></p>`;
}
/* Summary line under the picker (HTML, escaped): a screened target links back to its profile, where each estimate
   shows how it was built; a scenario opened for a rival names it. */
const presetSummary = esc => {
  const p = preset();
  if (S.for) return `Scenario for <b>${esc(S.for)}</b>, built from the acquisition engine's estimates on top of a typical lower-middle-market deal. Cells tagged est. are estimates, not reported figures. <a href="#/ma/rivals">Rival profiles →</a>`;
  const back = p.parent && CO_ROUTE[p.co] ? ` <a href="#/ma/pipeline?platform=${encodeURIComponent(p.co)}&amp;id=${encodeURIComponent(p.id)}">How these figures were estimated →</a>` : '';
  return `${esc(p.summary)}${p.est.size ? ' Cells tagged est. are estimates, not BSP figures.' : ''}${back}`;
};

function sourceLine(ctx, ids) {
  const { esc } = ctx;
  const seen = new Set(), parts = [];
  for (const id of ids) { const s = SRC[id]; if (!s || seen.has(id)) continue; seen.add(id); parts.push(s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)); }
  return `<p class="sys-src dm-src">Sources: ${parts.join(' · ')}. Presets are estimates from public filings and screens, not BSP's terms. Model by Syed Rahman.</p>`;
}

/* ── market benchmark per input ──────────────────────────────────────────
   Each price and financing default sits next to the market figure it was set from (deal_model benchmark items, values
   read from the data); inputs with no market source say so, so nobody mistakes an assumption for a benchmark. */
const MKT = { em: ['b-entry-avg', 'b-small'], am: ['b-small'], rm: ['b-small'], cm: ['b-entry-avg'], lev: ['b-lev-2026', 'b-lev-2025'], ir: ['b-rate'], xm: ['b-typ-prem', 'b-large'], rx: ['b-typ-prem', 'b-large'], tm: ['b-typ-prem'], yrs: ['b-hold'] };
const MKT_WORDS = { 'b-entry-avg': 'average buyout, Q2 2026', 'b-small': 'deals under $25M, first half 2025', 'b-lev-2026': 'total debt, Q2 2026', 'b-lev-2025': 'total debt, first half 2025', 'b-rate': 'senior debt, Q2 2026', 'b-typ-prem': 'typical to premium deals, 2026', 'b-large': 'deals of $100M to $250M, first half 2025', 'b-hold': 'median hold' };
const bench = id => DM.items.find(i => i.kind === 'benchmark' && i.id === id) || null;
const bval = b => b.value != null ? (b.unit === '%' ? `${nf(b.value, 1)}%` : b.unit === 'years' ? `${nf(b.value, 1)} years` : `${nf(b.value, 1)}x`) : `${nf(b.low, 1)}–${nf(b.high, 1)}x`;
const srcShort = id => { const s = SRC[id]; return s ? s.label.split(/[,:]/)[0].trim() : ''; };
function mkt(k) {
  const bs = (MKT[k] || []).map(bench).filter(Boolean);
  if (bs.length) return { text: bs.map(b => `${bval(b)} ${MKT_WORDS[b.id] || b.metric.toLowerCase()} (${srcShort(b.source_ids[0])})`).join('; '), bs };
  const a = DM.items.find(i => i.kind === 'assumptions')?.items?.[k];
  return a ? { text: '', assumed: a } : null;
}
/* under each input: the first benchmark only (the formula bar and the financing table give them all) */
const mktLine = (esc, k) => { const m = mkt(k); if (!m) return ''; if (m.assumed) return '<span class="dm-mkt dm-mkt--a">No market source: analyst assumption</span>'; const b = m.bs[0]; return `<span class="dm-mkt">Market: ${esc(`${bval(b)} ${MKT_WORDS[b.id] || b.metric.toLowerCase()} (${srcShort(b.source_ids[0])})`)}</span>`; };

/* ── the spreadsheet grid ───────────────────────────────────────────────── */
function gridHtml(ctx, sections) {
  const { esc } = ctx;
  let i = 0;
  const rows = sections.map(([title, ks]) => `<tbody><tr class="dm-sec"><th colspan="4" scope="colgroup">${esc(title)}</th></tr>${ks.map(k => { const m = INP[k]; const idx = i++;
    return `<tr data-k="${k}"><th scope="row"><label for="dm-in-${k}"><span class="dm-name">${esc(m.label)}</span><span class="dm-gloss">${esc(m.gloss)}</span>${mktLine(esc, k)}</label></th>
      <td class="dm-v"><input id="dm-in-${k}" class="dm-cell" data-k="${k}" data-i="${idx}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(trim(S.vals[k]))}" aria-describedby="dm-fx"></td>
      <td class="dm-u">${esc(m.unit)}</td><td class="dm-f">${isEst(k) ? '<span class="sys-est">est.</span>' : ''}</td></tr>`; }).join('')}</tbody>`).join('');
  return `<div class="dm-fx" id="dm-fx" aria-live="polite"><span class="dm-fx-k">Cell</span><span class="dm-fx-t">Choose a cell to see what it means and where the number comes from.</span></div>
  <div class="sys-table-wrap dm-gridwrap"><table class="sys-table dm-grid"><caption class="sys-sr">Model inputs. Arrow keys move between cells; Enter saves and moves down; Escape undoes.</caption>${rows}</table></div>
  <p class="sys-src dm-keys">Tab, arrow keys and Enter move between cells, as in a spreadsheet. Escape undoes a change.</p>`;
}

function bindGrid(ctx, host, onChange) {
  const cells = () => [...host.querySelectorAll('.dm-cell')];
  const fx = host.querySelector('#dm-fx');
  let committed = {};
  const showFx = inp => {
    const k = inp.dataset.k, m = INP[k], p = preset();
    const basis = forBasis(k) || p.basis?.[k] || DM.items.find(i => i.kind === 'assumptions')?.items?.[k] || '';
    const mk = mkt(k);
    fx.innerHTML = `<span class="dm-fx-k">${ctx.esc(m.label)}</span><span class="dm-fx-t">${ctx.esc(basis || m.gloss)}${isEst(k) ? ' <span class="sys-est">est.</span>' : ''}${mk && !mk.assumed ? ` <span class="dm-mkt">Market: ${ctx.esc(mk.text)}.</span>` : ''}</span>`;
  };
  const parse = s => { const t = String(s).replace(/[−–]/g, '-').replace(/[^0-9.\-]/g, ''); if (!t || t === '-' || t === '.') return null; const v = parseFloat(t); return isFinite(v) ? v : null; };
  const flag = k => { const td = host.querySelector(`tr[data-k="${k}"] .dm-f`); if (td) td.innerHTML = isEst(k) ? '<span class="sys-est">est.</span>' : ''; };
  const commit = (inp, live) => {
    const k = inp.dataset.k, v = parse(inp.value);
    if (v == null) { inp.classList.add('dm-bad'); if (!live) { inp.value = trim(S.vals[k]); inp.classList.remove('dm-bad'); } return; }
    const c = clampKey(k, v); inp.classList.remove('dm-bad');
    if (c !== S.vals[k]) { S.vals[k] = c; flag(k); onChange(k); }
    if (!live) { inp.value = trim(c); committed[k] = c; }
  };
  const move = (inp, d) => { const list = cells(); const i = list.indexOf(inp) + d; if (i >= 0 && i < list.length) { commit(inp); list[i].focus(); list[i].select(); } };
  for (const inp of cells()) {
    inp.dataset.mode = 'enter';
    inp.addEventListener('focus', () => { committed[inp.dataset.k] = S.vals[inp.dataset.k]; showFx(inp); if (inp.dataset.mode === 'enter') inp.select(); requestAnimationFrame(() => { if (document.activeElement === inp && inp.dataset.mode === 'enter') inp.select(); }); });
    inp.addEventListener('mousedown', () => { inp.dataset.mode = 'edit'; });
    inp.addEventListener('blur', () => { commit(inp); inp.dataset.mode = 'enter'; });
    inp.addEventListener('input', () => commit(inp, true));
    inp.addEventListener('keydown', e => {
      const edit = inp.dataset.mode === 'edit';
      if (e.key === 'Enter') { e.preventDefault(); commit(inp); move(inp, e.shiftKey ? -1 : 1); if (!cells()[cells().indexOf(inp) + (e.shiftKey ? -1 : 1)]) inp.select(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(inp, e.key === 'ArrowDown' ? 1 : -1); }
      else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !edit) { e.preventDefault(); move(inp, e.key === 'ArrowRight' ? 1 : -1); }
      else if (e.key === 'F2') { e.preventDefault(); inp.dataset.mode = 'edit'; const n = inp.value.length; inp.setSelectionRange(n, n); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const k = inp.dataset.k; inp.value = trim(committed[k]); if (S.vals[k] !== committed[k]) { S.vals[k] = committed[k]; flag(k); onChange(k); } inp.select(); }
    });
  }
}

/* ── view scaffolding ───────────────────────────────────────────────────── */
/* Price and financing sit together so every term of the purchase (multiple, debt, rate, fees, how add-ons are paid) is one block. */
const DEAL_GRID = [['The company', ['rev', 'mg', 'gr', 'dm']], ['Price and financing', ['em', 'lev', 'ir', 'fee', 'ad']], ['The plan', ['yrs', 'xm', 'ae', 'am', 'cc']]];
const GRIDS = {
  returns: DEAL_GRID,
  dcf: [['The company', ['rev', 'mg', 'gr', 'dm']], ['The valuation', ['tax', 'da', 'cx', 'nwc', 'wacc', 'tg', 'tm', 'nd']]],
  rollup: [['The roll-up', ['ce', 'cm', 'n', 'ra', 'rm', 'rx', 'ic', 'syn']], ['Shared with returns', ['gr', 'yrs']]],
  sensitivity: DEAL_GRID,
};
const TITLES = { returns: 'Buyout returns', dcf: 'Discounted cash flow', rollup: 'Buy-and-build roll-up', sensitivity: 'Sensitivity tables' };

async function frame(ctx, vid, draw, srcIds) {
  const { el, ui, data, app } = ctx;
  injectCss();
  const ok = await boot(data);
  if (!el.isConnected) return;
  if (!ok) { el.innerHTML = ui.pageHead({ title: TITLES[vid] }) + ui.note('The model assumptions could not load. Reload the page to try again.', 'warn'); return; }
  fromParams(ctx.params || {});
  el.innerHTML = `<div class="m-deal" data-no-gloss>${ui.pageHead({ title: TITLES[vid], sub: LEADS[vid] })}
    ${toolbar(ctx)}
    ${ui.note(HOWTO[vid], 'info')}
    <div class="grid grid-side mt-12 dm-main">
      <div class="dm-left">${ui.panel({ title: 'Assumptions', sub: 'White cells are inputs. Type over any of them.', body: gridHtml(ctx, GRIDS[vid]), cls: 'dm-inputs' })}<div id="dm-bench"></div></div>
      <div class="dm-right" id="dm-out" aria-live="polite"></div>
    </div>
    <div id="dm-srcline"></div></div>`;
  const out = el.querySelector('#dm-out');
  const sum = el.querySelector('#dm-sum');
  const paint = () => { sum.innerHTML = presetSummary(ctx.esc); draw(out); el.querySelector('#dm-srcline').innerHTML = sourceLine(ctx, [...srcIds(), ...preset().sources]); syncHash(ctx); };
  let raf = 0; const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (el.isConnected) paint(); }); };
  bindGrid(ctx, el.querySelector('.dm-inputs'), schedule);
  paint();
  // toolbar
  el.querySelector('#dm-preset').onchange = e => { setPreset(e.target.value); refreshGrid(ctx, el, vid, schedule); paint(); };
  el.querySelector('#dm-reset').onclick = () => { setPreset(S.preset); refreshGrid(ctx, el, vid, schedule); paint(); ui.toast('Back to the preset values'); };
  el.querySelector('#dm-link').onclick = () => copyLink(ctx);
  el.querySelector('#dm-csv').onclick = () => downloadCsv(ctx);
  el.querySelector('#dm-xlsx').onclick = e => downloadXlsx(ctx, e.currentTarget);
  // benchmarks under the grid (returns and sensitivity)
  if (vid === 'returns') el.querySelector('#dm-bench').innerHTML = benchPanel(ctx);
  app.index([
    { label: 'Acquisition model · buyout returns', sub: 'Live leveraged-buyout model with Excel download', href: '#/deal/returns', kind: 'View', color: COLOR },
    { label: 'Acquisition model · discounted cash flow', sub: 'DCF with a football-field valuation range', href: '#/deal/dcf', kind: 'View', color: COLOR },
    { label: 'Acquisition model · roll-up', sub: 'Multiple arbitrage versus operating growth', href: '#/deal/rollup', kind: 'View', color: COLOR },
    { label: 'Acquisition model · sensitivity', sub: 'Two-way tables of annual return and money multiple', href: '#/deal/sensitivity', kind: 'View', color: COLOR },
    ...PRESETS.filter(p => p.co && !p.generic && !p.parent).map(p => ({ label: `Model a buyout of ${p.label}`, sub: p.summary, href: `#/deal/returns?p=${encodeURIComponent(p.id)}`, kind: 'Model', color: CO_COLOR[p.co] || COLOR })),
  ]);
}
function refreshGrid(ctx, el, vid, schedule) {
  const panel = el.querySelector('.dm-inputs .panel-body');
  panel.innerHTML = gridHtml(ctx, GRIDS[vid]);
  bindGrid(ctx, el.querySelector('.dm-inputs'), schedule);
}

function benchPanel(ctx) {
  const { esc, ui } = ctx;
  const B = DM.items.filter(i => i.kind === 'benchmark');
  const pick = ['b-entry-avg', 'b-small', 'b-large', 'b-typ-prem', 'b-hvac', 'b-scaled', 'b-lev-2026', 'b-lev-2025', 'b-rate', 'b-hold'].map(id => B.find(b => b.id === id)).filter(Boolean);
  const val = b => b.value != null ? (b.unit === '%' ? `${nf(b.value, 1)}%` : b.unit === 'years' ? `${nf(b.value, 1)} yrs` : `${nf(b.value, 1)}x`) : `${nf(b.low, 1)}–${nf(b.high, 1)}x`;
  const rows = pick.map(b => { const s = SRC[b.source_ids[0]]; return `<tr><th scope="row">${esc(b.metric)}<span class="dm-gloss">${esc(b.note)}${s ? ` ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label.split(',')[0])}</a>` : esc(s.label.split(':')[0])}` : ''}</span></th><td class="sys-n">${val(b)}</td></tr>`; }).join('');
  return ui.panel({ title: 'Market benchmarks', sub: 'What lower-middle-market deals look like today', cls: 'mt-12 dm-bench', body: `<div class="sys-table-wrap"><table class="sys-table dm-bt"><caption class="sys-sr">Market benchmarks with sources</caption><tbody>${rows}</tbody></table></div>` });
}

/* ── exports ────────────────────────────────────────────────────────────── */
let _xlsx = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsx) return _xlsx;
  _xlsx = new Promise((res, rej) => { const s = document.createElement('script'); s.src = XLSX_URL; s.async = true; s.crossOrigin = 'anonymous'; s.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('Excel library missing')); s.onerror = () => rej(new Error('Excel library did not load')); document.head.appendChild(s); });
  _xlsx.catch(() => { _xlsx = null; });
  return _xlsx;
}
const stamp = () => new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
const fileBase = () => `BSP Desk acquisition model - ${(S.for || preset().label).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}`;
/* Workbook basis column: the preset's own note first, else the market benchmark, else the analyst assumption, so every
   price and financing input in the Excel file says where its number comes from. */
const forBasis = k => S?.for && S.forVals?.[k] != null ? `Set from the acquisition engine's estimates for ${S.for}; see its profile for how each was built.` : '';
const basisAll = () => { const out = {}; for (const k of keys()) { const m = mkt(k); if (m?.assumed) out[k] = `Analyst assumption: ${m.assumed}`; else if (m) out[k] = `Market: ${m.text}.`; } const all = { ...out, ...preset().basis }; for (const k of keys()) { const f = forBasis(k); if (f) all[k] = f; } return all; };
const exportState = () => ({ label: S.for ? `${S.for} (scenario)` : preset().label, vals: { ...S.vals }, est: new Set(keys().filter(isEst)), basis: basisAll(), inputs: DM.meta.inputs });
function saveBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
async function downloadXlsx(ctx, btn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
  try {
    const X = await loadXlsx();
    const ids = new Set(['gf-q2-2026', 'gf-h1-2025', 'gf-gulfstar-2025', 'gf-q4-2025', 'capstone-2026', 'pkf-hvac-2026', 'precedents', ...preset().sources]);
    const wb = L.workbook(X, exportState(), { date: stamp(), sources: [...ids].map(i => SRC[i]).filter(Boolean) });
    const buf = X.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    saveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase()}.xlsx`);
    ctx.ui.toast('Excel workbook downloaded: change the Inputs sheet and it recalculates');
  } catch (e) {
    console.warn('[deal] Excel export fell back to CSV:', e.message);
    downloadCsv(ctx); ctx.ui.toast('Excel was not available, so the model downloaded as CSV');
  } finally { btn.disabled = false; btn.textContent = label; }
}
function downloadCsv(ctx) { saveBlob(new Blob([L.csv(exportState())], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`); }
async function copyLink(ctx) {
  syncHash(ctx); const url = location.href;
  try { await navigator.clipboard.writeText(url); ctx.ui.toast('Link copied: it opens this exact scenario'); }
  catch { const t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { } t.remove(); ctx.ui.toast(ok ? 'Link copied: it opens this exact scenario' : 'Copy the address bar to share this scenario'); }
}

/* ── small visual helpers ───────────────────────────────────────────────── */
function bars(ctx, items, { total, totalLabel } = {}) {
  const { esc } = ctx;
  const max = Math.max(1e-9, ...items.map(i => Math.abs(i.v)), total != null ? Math.abs(total) : 0);
  const row = (l, v, note, cls = '') => `<div class="dm-bar-row ${cls}"><div class="dm-bar-l"><span>${esc(l)}</span>${note ? `<span class="dm-gloss">${esc(note)}</span>` : ''}</div><div class="dm-bar-t"><i class="${v < 0 ? 'neg' : 'pos'}" style="width:${Math.max(1, Math.abs(v) / max * 100).toFixed(1)}%"></i></div><div class="dm-bar-v sys-num">${$m(v)}</div></div>`;
  return `<div class="dm-bars">${items.map(i => row(i.label, i.v, i.note)).join('')}${total != null ? row(totalLabel, total, '', 'tot') : ''}</div>`;
}
const yearHead = (n, lab) => `<tr><th scope="col">${lab || '$M'}</th>${[...Array(n + 1).keys()].map(y => `<th scope="col" class="sys-n">Year ${y}</th>`).join('')}</tr>`;

/* ── Returns ────────────────────────────────────────────────────────────── */
function drawReturns(ctx, out) {
  const { ui, esc } = ctx; const p = S.vals; const R = L.lbo(p); const N = R.N; const hurdle = DM.meta.hurdle.irr_pct / 100;
  const status = y => y === 0 ? 'Buy' : y === N ? 'Sell' : '';
  const kp = ui.kpis([
    { label: 'Purchase price', value: $m(R.ev0), sub: `${xm(p.em)} EBITDA of ${$m(R.ebitda[0])}`, color: COLOR },
    { label: 'Equity check', value: $m(R.eq0), sub: R.ev0 > 0 ? `${pc(R.eq0 / (R.ev0 + R.fees), 0)} of the cost; the rest is debt` : '', color: 'var(--sys-info)' },
    { label: 'Exit value', value: $m(R.exitEV), sub: `Year ${N} at ${xm(p.xm)}`, color: 'var(--sys-brand)' },
    { label: 'Equity at exit', value: $m(R.exitEq), sub: `after ${$m(R.exitND)} of net debt`, color: 'var(--sys-violet)' },
    { label: 'MOIC (money multiple)', value: R.moic == null ? 'n/m' : xm(R.moic, 2), sub: `on ${$m(R.totalEq)} of equity`, color: COLOR },
    { label: 'IRR (annual return)', value: R.irr == null ? 'n/m' : pc(R.irr), sub: R.irr == null ? 'equity is negative' : R.irr >= hurdle ? 'above a 20% fund target' : 'below a 20% fund target', color: R.irr != null && R.irr >= hurdle ? 'var(--sys-good)' : 'var(--sys-bad)' },
  ]);
  const ROWS = [['Revenue, before add-ons', 'rev'], ['EBITDA, including add-ons', 'ebitda'], ['EBITDA margin, before add-ons', 'mgn', 'p'], ['Add-on spend', 'buy'], ['Interest', 'int'], ['Cash to repay debt', 'cash'], ['Net debt, end of year', 'nd'], ['Net debt / EBITDA', 'lev', 'x'], ['Equity cash flow', 'cf']];
  const val = (q, y, f) => q === 'lev' ? (R.ebitda[y] > 0 ? xm(R.nd[y] / R.ebitda[y]) : 'n/m') : f === 'p' ? pc(R.mgn[y]) : cellNum(R[q][y]);
  const table = `<div class="sys-table-wrap"><table class="sys-table dm-yt"><caption class="sys-sr">Year by year, $M</caption><thead>${yearHead(N)}<tr class="dm-st"><th scope="row"></th>${[...Array(N + 1).keys()].map(y => `<td class="sys-n">${status(y)}</td>`).join('')}</tr></thead><tbody>${ROWS.map(([l, q, f]) => `<tr${q === 'cf' || q === 'ebitda' ? ' class="dm-strong"' : ''}><th scope="row">${esc(l)}</th>${[...Array(N + 1).keys()].map(y => `<td class="sys-n">${val(q, y, f)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const su = `<div class="sys-table-wrap"><table class="sys-table dm-su"><caption class="sys-sr">Sources and uses at entry, $M</caption><tbody>
    <tr class="dm-sec2"><th scope="rowgroup" colspan="2">Uses: what the money pays for</th></tr>
    <tr><th scope="row">Purchase price</th><td class="sys-n">${cellNum(R.ev0)}</td></tr>
    <tr><th scope="row">Deal fees</th><td class="sys-n">${cellNum(R.fees)}</td></tr>
    <tr class="dm-strong"><th scope="row">Total uses</th><td class="sys-n">${cellNum(R.ev0 + R.fees)}</td></tr>
    <tr class="dm-sec2"><th scope="rowgroup" colspan="2">Sources: where the money comes from</th></tr>
    <tr><th scope="row">Debt (${xm(p.lev)} EBITDA)</th><td class="sys-n">${cellNum(R.debt0)}</td></tr>
    <tr><th scope="row">Equity from the fund</th><td class="sys-n">${cellNum(R.eq0)}</td></tr>
    <tr class="dm-strong"><th scope="row">Total sources</th><td class="sys-n">${cellNum(R.debt0 + R.eq0)}</td></tr></tbody></table></div>
    <p class="sys-src">Add-ons later in the hold cost ${$m(R.addSpend)}: ${pc(p.ad / 100, 0)} borrowed, the rest (${$m(R.addEq)}) new equity.</p>`;
  const bridge = bars(ctx, R.bridge, { total: R.gain, totalLabel: 'Equity gain' });
  // multiple expansion is an explicit, optional line: the headline sells at the input exit multiple
  const gap = r4(p.xm - p.em);
  const alt = gap === 0 ? L.lbo({ ...p, xm: p.em + 2 }) : L.lbo({ ...p, xm: p.em });
  const altTxt = (R2, x) => `IRR ${R2.irr == null ? 'n/m' : pc(R2.irr)} and MOIC ${R2.moic == null ? 'n/m' : xm(R2.moic, 2)} at a ${xm(x)} sale`;
  const expNote = `<p class="sys-src dm-exp">${gap === 0 ? `<b>No multiple expansion assumed:</b> the company sells at the ${xm(p.em)} it was bought for. With +2.0x expansion: ${altTxt(alt, p.em + 2)}.` : `<b>Includes ${gap > 0 ? '+' : MINUS}${xm(Math.abs(gap))} of multiple ${gap > 0 ? 'expansion' : 'contraction'}.</b> Selling at the ${xm(p.em)} entry multiple instead: ${altTxt(alt, p.em)}.`}</p>`;
  out.innerHTML = kp + expNote + ui.panel({ title: 'Year by year', sub: `${$m(p.rev)} of revenue growing ${nf(p.gr, 1)}% a year, ${p.ae > 0 ? `${$m(p.ae)} of add-on EBITDA bought each year to year ${N - 1}` : 'no add-ons'}. Figures in $M.`, body: table, cls: 'mt-12' }) +
    ui.panel({ title: 'Financing terms', sub: 'Each term of the purchase, next to the market figure it was set from', body: financingHtml(ctx, p, R), cls: 'mt-12' }) +
    `<div class="grid grid-2 mt-12">${ui.panel({ title: 'Sources and uses', sub: 'How the purchase is paid for', body: su })}${ui.panel({ title: 'Where the return comes from', sub: 'The equity gain, split into its drivers', body: bridge })}</div>`;
}
/* Financing terms: every input behind the purchase, what it comes to in dollars, and its market benchmark with a link.
   Rows with no market source are labelled as analyst assumptions; the last rows are credit checks derived from the model. */
function financingHtml(ctx, p, R) {
  const { esc } = ctx; const N = R.N;
  const link = id => { const s = SRC[id]; return s ? (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(srcShort(id))}</a>` : esc(srcShort(id))) : ''; };
  const srcOnce = ids => { const seen = new Set(); return ids.filter(id => { const k = srcShort(id); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const market = k => { const m = mkt(k); if (!m) return ['—', '']; if (m.assumed) return [`<b>No market source.</b> <span class="dm-gloss dm-inl">Analyst assumption: ${esc(m.assumed)}</span>`, '']; return [m.bs.map(b => `${bval(b)} <span class="dm-gloss dm-inl">${esc(MKT_WORDS[b.id] || b.metric)}</span>`).join('<br>'), srcOnce(m.bs.map(b => b.source_ids[0])).map(link).join(', ')]; };
  const eqShare = R.ev0 + R.fees > 0 ? R.eq0 / (R.ev0 + R.fees) : null;
  const gulf = bench('b-lev-2025'), eqMkt = String(gulf?.note || '').match(/equity\s+([\d.]+)%/i);
  const row = (term, deal, [mk, src], cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${esc(term)}</th><td class="sys-n dm-fdeal">${deal}</td><td class="dm-fmkt">${mk}</td><td class="dm-fsrc">${src ? `<span class="dm-fsrc-l">Source: </span>${src}` : ''}</td></tr>`;
  const cover = R.int[1] > 0 ? R.ebitda[1] / R.int[1] : null;
  const exitLev = R.ebitda[N] > 0 ? R.nd[N] / R.ebitda[N] : null;
  return `<div class="sys-table-wrap"><table class="sys-table dm-fin"><caption class="sys-sr">Financing terms with market benchmarks</caption><colgroup><col class="dm-c1"><col class="dm-c2"><col class="dm-c3"><col class="dm-c4"></colgroup><thead><tr><th scope="col">Term</th><th scope="col" class="sys-n">This deal</th><th scope="col">Market</th><th scope="col">Source</th></tr></thead><tbody>
    ${row('Purchase price', `${xm(p.em)} EBITDA<br><b>${$m(R.ev0)}</b>`, market('em'))}
    ${row('Debt at entry', `${xm(p.lev)} EBITDA<br><b>${$m(R.debt0)}</b>`, market('lev'))}
    ${row('Interest rate', `${nf(p.ir, 2)}% a year<br><b>${$m(R.int[1])}</b> in year 1`, market('ir'))}
    ${row('Equity check', `${eqShare == null ? 'n/m' : pc(eqShare, 0)} of the cost<br><b>${$m(R.eq0)}</b>`, eqMkt ? [`${nf(+eqMkt[1], 1)}% <span class="dm-gloss dm-inl">equity share of capital, first half 2025</span>`, link(gulf.source_ids[0])] : ['—', ''])}
    ${row('Deal fees', `${nf(p.fee, 1)}% of price<br><b>${$m(R.fees)}</b>`, market('fee'))}
    ${row('Add-ons paid with debt', `${nf(p.ad, 0)}% of each price`, market('ad'))}
    ${row('Debt repayment', `${nf(p.cc, 0)}% of EBITDA, less interest`, market('cc'))}
    ${row('Interest cover, year 1', cover == null ? 'n/m' : xm(cover), ['EBITDA divided by interest', 'From the model'], 'dm-derived')}
    ${row(`Net debt / EBITDA, year ${N}`, exitLev == null ? 'n/m' : xm(exitLev), ['Leverage left at the sale', 'From the model'], 'dm-derived')}
  </tbody></table></div>
  <p class="sys-src">One debt layer, repaid from cash each year. Seller notes and earn-outs are not modelled: the full price is paid at closing with the debt and equity above.</p>`;
}

/* ── DCF ────────────────────────────────────────────────────────────────── */
function drawDcf(ctx, out) {
  const { ui, esc } = ctx; const p = S.vals; const D = L.dcf(p); const F = L.football(p, { gf: SRC['gf-h1-2025'], cap: SRC['capstone-2026'] });
  const kp = ui.kpis([
    { label: 'Value: long-run growth', value: D.evG == null ? 'n/m' : $m(D.evG), sub: D.evMultG == null ? 'discount rate must beat growth' : `${xm(D.evMultG)} today's EBITDA`, color: COLOR },
    { label: 'Value: year-5 sale', value: $m(D.evM), sub: `${xm(D.evMultM)} today's EBITDA`, color: 'var(--sys-info)' },
    { label: 'Share value, growth method', value: D.eqG == null ? 'n/m' : $m(D.eqG), sub: `after ${$m(p.nd)} of net debt`, color: 'var(--sys-violet)' },
    { label: 'Value after year 5', value: D.tvShare == null ? 'n/m' : pc(D.tvShare, 0), sub: 'of the growth-method value', color: 'var(--sys-brand)' },
  ]);
  const Y = L.DCF_YEARS;
  const ROWS = [['Revenue', 'rev'], ['EBITDA', 'ebitda'], ['Depreciation', 'da'], ['Operating profit', 'ebit'], ['Tax', 'tax', -1], ['Capital spending', 'capex', -1], ['More working capital', 'dnwc', -1], ['Free cash flow', 'fcf'], ['Discount factor', 'df', 0, 'd'], ['Value today', 'pv']];
  const cell = (q, y, sg, f) => f === 'd' ? nf(D.df[y], 3) : (y === 0 && /fcf|pv|dnwc/.test(q)) ? '' : cellNum((sg ? -1 : 1) * D[q][y]);
  const table = `<div class="sys-table-wrap"><table class="sys-table dm-yt"><caption class="sys-sr">Free cash flow forecast, $M</caption><thead>${yearHead(Y)}</thead><tbody>${ROWS.map(([l, q, sg, f]) => `<tr${q === 'fcf' || q === 'pv' ? ' class="dm-strong"' : ''}><th scope="row">${esc(l)}</th>${[...Array(Y + 1).keys()].map(y => `<td class="sys-n">${cell(q, y, sg, f)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const br = `<div class="sys-table-wrap"><table class="sys-table dm-su"><caption class="sys-sr">From enterprise value to share value, $M</caption><thead><tr><th scope="col">$M</th><th scope="col" class="sys-n">Long-run growth</th><th scope="col" class="sys-n">Year-5 sale</th></tr></thead><tbody>
    <tr><th scope="row">Years 1 to 5, today's value</th><td class="sys-n">${cellNum(D.sumPV)}</td><td class="sys-n">${cellNum(D.sumPV)}</td></tr>
    <tr><th scope="row">Later years, today's value</th><td class="sys-n">${D.pvTvG == null ? 'n/m' : cellNum(D.pvTvG)}</td><td class="sys-n">${cellNum(D.pvTvM)}</td></tr>
    <tr class="dm-strong"><th scope="row">Enterprise value</th><td class="sys-n">${D.evG == null ? 'n/m' : cellNum(D.evG)}</td><td class="sys-n">${cellNum(D.evM)}</td></tr>
    <tr><th scope="row">Less net debt</th><td class="sys-n">${cellNum(-p.nd)}</td><td class="sys-n">${cellNum(-p.nd)}</td></tr>
    <tr class="dm-strong"><th scope="row">Value of the shares</th><td class="sys-n">${D.eqG == null ? 'n/m' : cellNum(D.eqG)}</td><td class="sys-n">${cellNum(D.eqM)}</td></tr></tbody></table></div>
    <p class="sys-src">Cross-check: the growth method implies a ${D.impliedMult == null ? 'n/m' : xm(D.impliedMult)} year-5 sale multiple; the ${xm(p.tm)} sale multiple implies ${D.impliedG == null ? 'n/m' : pc(D.impliedG)} growth forever.</p>`;
  out.innerHTML = kp + ui.panel({ title: 'Valuation range', sub: 'Enterprise value by method, $M. The line marks the price in the returns model.', body: footballHtml(ctx, F), cls: 'mt-12' }) +
    ui.panel({ title: 'Free cash flow', sub: 'Figures in $M; costs shown as negatives', body: table, cls: 'mt-12' }) + ui.panel({ title: 'From company value to share value', sub: 'Both methods, side by side', body: br, cls: 'mt-12' });
}
function footballHtml(ctx, F) {
  const { esc } = ctx; const rows = F.rows; if (!rows.length) return ctx.ui.note('EBITDA must be positive to compare valuation methods.', 'warn');
  const lo = Math.min(F.price, ...rows.map(r => r.lo)), hi = Math.max(F.price, ...rows.map(r => r.hi));
  const pad = (hi - lo) * 0.06 || 1, a = Math.max(0, lo - pad), b = hi + pad, pos = v => ((v - a) / (b - a) * 100).toFixed(2);
  const ticks = (() => { const span = b - a, raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || raw; const t = []; for (let v = Math.ceil(a / step) * step; v <= b; v += step) t.push(v); return t; })();
  return `<div class="dm-ff" role="img" aria-label="Valuation range by method; purchase price ${esc($m(F.price))}">
    ${rows.map(r => `<div class="dm-ff-row"><div class="dm-ff-l"><span>${esc(r.label)}</span><span class="dm-gloss">${esc(r.sub)}${r.src?.url ? ` <a href="${esc(r.src.url)}" target="_blank" rel="noopener">source</a>` : ''}</span></div>
      <div class="dm-ff-t"><i style="left:${pos(r.lo)}%;width:${Math.max(0.6, pos(r.hi) - pos(r.lo))}%"></i>${r.mid != null ? `<b style="left:${pos(r.mid)}%" aria-hidden="true"></b>` : ''}<span class="dm-ff-p" style="left:${pos(F.price)}%"></span></div>
      <div class="dm-ff-v sys-num">${$m(r.lo, 0)}–${$m(r.hi, 0)}${r.mult ? `<span class="dm-gloss">${xm(r.mult[0])} to ${xm(r.mult[1])}</span>` : ''}</div></div>`).join('')}
    <div class="dm-ff-row dm-ff-axis"><div></div><div class="dm-ff-t">${ticks.map(t => `<span style="left:${pos(t)}%">${$m(t, 0)}</span>`).join('')}</div><div></div></div>
    <p class="sys-src dm-ff-key"><span class="dm-ff-sw"></span>Range <span class="dm-ff-sw dm-ff-sw--mid"></span>Base case <span class="dm-ff-sw dm-ff-sw--p"></span>Price in the returns model: ${esc($m(F.price))} (${xm(S.vals.em)})</p></div>`;
}

/* ── Roll-up ────────────────────────────────────────────────────────────── */
function drawRollup(ctx, out) {
  const { ui, esc, el } = ctx; const p = S.vals; const U = L.rollup(p);
  const kp = ui.kpis([
    { label: 'Blended multiple paid', value: xm(U.blended), sub: `versus ${xm(p.rx)} at exit`, color: COLOR },
    { label: 'Total cost', value: $m(U.cost), sub: `company plus ${U.n} add-on${U.n === 1 ? '' : 's'}`, color: 'var(--sys-info)' },
    { label: 'Exit value', value: $m(U.exitEV), sub: `${$m(U.exitE)} EBITDA in year ${Math.round(p.yrs)}`, color: 'var(--sys-brand)' },
    { label: 'Value created', value: $m(U.created), sub: U.onCost == null ? '' : `${xm(U.onCost, 2)} the total cost`, color: U.created >= 0 ? 'var(--sys-good)' : 'var(--sys-bad)' },
  ]);
  const steps = `<div class="sys-table-wrap"><table class="sys-table dm-yt"><caption class="sys-sr">Blended multiple after each add-on</caption><thead><tr><th scope="col">Add-ons bought</th><th scope="col" class="sys-n">EBITDA ($M)</th><th scope="col" class="sys-n">Total paid ($M)</th><th scope="col" class="sys-n">Blended multiple</th></tr></thead><tbody>${U.steps.map(s => `<tr><th scope="row">${s.k === 0 ? 'Company alone' : s.k}</th><td class="sys-n">${cellNum(s.ebitda)}</td><td class="sys-n">${cellNum(s.paid)}</td><td class="sys-n">${xm(s.blended, 2)}</td></tr>`).join('')}</tbody></table></div>`;
  const co = preset().co, P = preset(), parentP = P.parent ? BYID.get(P.parent) : (co ? P : null), tco = parentP?.co;
  const pool = tco ? (TARGETS[tco] || []) : [];
  let targ = '';
  if (pool.length) {
    const top = pool.slice(0, 5), med = (a => { const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; })(top.map(t => t.ebitda));
    targ = ui.panel({ title: `Screened add-ons for ${esc(parentP.label)}`, sub: `Top five by fit score. EBITDA assumes a ${top[0].margin}% margin.`, cls: 'mt-12',
      actions: `<button type="button" class="${ui.btnCls('secondary', 'sm')}" id="dm-use-targets" data-v="${med.toFixed(2)}">Use their median size</button>`,
      body: `<div class="sys-table-wrap"><table class="sys-table dm-yt"><caption class="sys-sr">Top screened add-on targets</caption><thead><tr><th scope="col">Company</th><th scope="col" class="sys-n">Fit</th><th scope="col" class="sys-n">Revenue</th><th scope="col" class="sys-n">EBITDA</th></tr></thead><tbody>${top.map(t => `<tr><th scope="row">${esc(clip(t.name, 44))}${t.state ? ` <span class="dm-gloss dm-inl">${esc(t.state)}</span>` : ''}</th><td class="sys-n">${t.fit ?? '—'}</td><td class="sys-n">${$m(t.rev, 1)} <span class="sys-est">est.</span></td><td class="sys-n">${$m(t.ebitda, 1)} <span class="sys-est">est.</span></td></tr>`).join('')}</tbody></table></div>
      <p class="sys-src">Median EBITDA ${$m(med)}. ${CO_ROUTE[tco] ? `<a href="#/${CO_ROUTE[tco]}/targets">See all ${pool.length} screened targets</a>` : ''}</p>` });
  }
  out.innerHTML = kp + ui.panel({ title: 'Where the value comes from', sub: `Value created, split into its sources. The company alone would create ${$m(U.alone)}.`, body: bars(ctx, U.parts, { total: U.created, totalLabel: 'Value created' }), cls: 'mt-12' }) + ui.panel({ title: 'Add-on by add-on', sub: 'Each cheaper add-on pulls the blended multiple down', body: steps, cls: 'mt-12' }) + targ;
  const b = out.querySelector('#dm-use-targets');
  if (b) b.onclick = () => { S.vals.ra = Math.round(+b.dataset.v * 100) / 100; const inp = el.querySelector('#dm-in-ra'); if (inp) inp.value = trim(S.vals.ra); const f = el.querySelector('tr[data-k="ra"] .dm-f'); if (f) f.innerHTML = ''; drawRollup(ctx, out); syncHash(ctx); ctx.ui.toast(`EBITDA per add-on set to ${$m(S.vals.ra)}`); };
}

/* ── Sensitivity ────────────────────────────────────────────────────────── */
function heat(ctx, spec, tab, fmtCell, hurdle, span, axisFmt, colFmt = axisFmt) {
  const { esc } = ctx;
  const tint = v => { if (!fin(v)) return ''; const t = Math.max(-1, Math.min(1, (v - hurdle) / span)); const pct = Math.round(10 + Math.abs(t) * 34); return `--dm-h:color-mix(in srgb,var(${t >= 0 ? '--sys-good' : '--sys-bad'}) ${pct}%,var(--sys-surface))`; };
  return `<div class="sys-table-wrap"><table class="sys-table dm-heat"><caption class="sys-sr">${esc(spec.rowLabel)} down, ${esc(spec.colLabel)} across</caption>
    <thead><tr><th scope="col" class="dm-corner"><span>${esc(spec.rowLabel)} ↓</span><span>${esc(spec.colLabel)} →</span></th>${tab.cols.map((c, j) => `<th scope="col" class="sys-n${j === 2 ? ' dm-base-h' : ''}">${colFmt(c)}</th>`).join('')}</tr></thead>
    <tbody>${tab.rows.map((r, i) => `<tr><th scope="row" class="sys-n${i === 2 ? ' dm-base-h' : ''}">${axisFmt(r)}</th>${tab.cells[i].map((c, j) => `<td class="sys-n${i === 2 && j === 2 ? ' dm-base' : ''}" style="${tint(c.v)}">${fmtCell(c.v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function drawSens(ctx, out) {
  const { ui } = ctx; const p = S.vals; const h = DM.meta.hurdle;
  const t1 = L.sensTable(p, L.SENS.irr), t2 = L.sensTable(p, L.SENS.moic);
  const base = L.lbo(p);
  const kp = ui.kpis([
    { label: 'IRR (annual return), base', value: base.irr == null ? 'n/m' : pc(base.irr), sub: `${xm(p.em)} in, ${xm(p.xm)} out`, color: COLOR },
    { label: 'MOIC (money multiple), base', value: base.moic == null ? 'n/m' : xm(base.moic, 2), sub: `${nf(p.gr, 1)}% growth, ${Math.abs(p.dm) < 1e-9 ? 'flat margin' : `${p.dm > 0 ? '+' : MINUS}${nf(Math.abs(p.dm), 1)} pts margin a year`}`, color: 'var(--sys-info)' },
    { label: 'Most you can pay for 20%', value: (() => { const e = L.solveEntry(p, h.irr_pct / 100); return e == null ? 'n/m' : xm(e); })(), sub: 'entry multiple, all else equal', color: 'var(--sys-brand)' },
  ]);
  out.innerHTML = kp + ui.panel({ title: 'Annual return by price paid and sale multiple', sub: 'IRR (annual return). Rows: entry multiple. Columns: exit multiple.', cls: 'mt-12', body: heat(ctx, L.SENS.irr, t1, v => v == null ? 'n/m' : pc(v, 0), h.irr_pct / 100, 0.15, v => xm(v)) }) +
    ui.panel({ title: 'Money multiple by growth and margin gain', sub: 'MOIC (money multiple). Rows: revenue growth a year. Columns: EBITDA margin gain a year.', cls: 'mt-12', body: heat(ctx, L.SENS.moic, t2, v => v == null ? 'n/m' : xm(v, 1), h.moic_x, 1.5, v => `${nf(v, 1)}%`, v => Math.abs(v) < 1e-9 ? '0.0 pts' : `${v > 0 ? '+' : MINUS}${nf(Math.abs(v), 1)} pts`) }) + `
  <p class="sys-src dm-legend"><span class="dm-sw dm-sw--bad"></span>Below a 20% return or 2.5x <span class="dm-sw dm-sw--good"></span>Above it <span class="dm-sw dm-sw--base"></span>Current model. Multiples move 1x per step, growth 2 points, margin gain half a point.</p>`;
}

/* ── module ─────────────────────────────────────────────────────────────── */
const SRC_BASE = ['gf-q2-2026', 'gf-h1-2025', 'gf-gulfstar-2025', 'capstone-2026', 'precedents'];
const returns = ctx => frame(ctx, 'returns', out => drawReturns(ctx, out), () => SRC_BASE);
const dcfView = ctx => frame(ctx, 'dcf', out => drawDcf(ctx, out), () => ['gf-h1-2025', 'capstone-2026']);
const rollupView = ctx => frame(ctx, 'rollup', out => drawRollup(ctx, out), () => ['gf-h1-2025', 'pkf-hvac-2026', 'sila-2024', 'champions-2026', 'targets']);
const sensView = ctx => frame(ctx, 'sensitivity', out => drawSens(ctx, out), () => SRC_BASE);

export default {
  id: 'deal', name: 'Acquisition model', tag: 'Model', color: COLOR, group: 'Intelligence',
  tagline: 'A live buyout, DCF, roll-up and sensitivity model with presets from the portfolio and an Excel download',
  views: [
    { id: 'returns', name: 'Returns', icon: '%', render: returns },
    { id: 'dcf', name: 'DCF', icon: '$', render: dcfView },
    { id: 'rollup', name: 'Roll-up', icon: '+', render: rollupView },
    { id: 'sensitivity', name: 'Sensitivity', icon: '▦', render: sensView },
  ],
};
export const _test = { get state() { return S; }, get presets() { return PRESETS; }, lib: L };
