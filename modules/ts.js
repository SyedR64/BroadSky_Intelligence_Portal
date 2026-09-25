/* Thomas Scientific — target-account intelligence, add-on screen and credit/financial picture.
   Data: data/ts_sites (27.5K scored sites, columnar), data/ts_parents (500 parent accounts),
   research/ma_targets_fl_ts (platform === 'thomas_scientific'), research/thomas_filings, research/public_comps. */
import { renderTargets, renderFilings, fitTierOf } from '../assets/components.js?v=20260924203049';

const C = 'var(--c-ts)', HEX = '#2ecc8f';
const HQ = { lat: 39.7476, lon: -75.3105, label: 'Swedesboro, NJ' };
const LBL_HEX = { Pursue: '#2ecc8f', Nurture: '#4c8dff', Watch: '#6f7f93' };
const LBL_VAR = { Pursue: 'var(--green)', Nurture: 'var(--accent)', Watch: 'var(--dim)' };
const LORD = { Pursue: 0, Nurture: 1, Watch: 2 };
const VERT_HEX = { 'Diagnostics Lab': '#2ecc8f', 'Academic Medical': '#4c8dff', Pathology: '#9d7bff', Hospital: '#f5b73d', 'Oncology Clinic': '#e05c8a', 'Diagnostic Center': '#3fd0e0' };
const LAYER = { nppes_only: 'NPPES registry only', clia_only: 'CLIA certificate only', direct_lab_cms: 'Direct lab CMS billing', hospital_cms: 'Hospital CMS (Compare)' };
const STATES50 = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const SRC = { sites: ['NPPES · CMS Provider Utilization 2023 · CLIA · Hospital Compare · PECOS', 'https://npiregistry.cms.hhs.gov/', 'legacy TS tool, Sept 2026'] };
const srcSites = ui => ui.source(...SRC.sites);

/* Recommended commercial play per v3c archetype (selling motion, owner, first step). */
const PLAYS = {
  'Independent clinical laboratory': { motion: 'Inside sales + e-commerce standing orders', play: 'Win the consumables basket (tubes, tips, gloves, controls) with auto-replenishment and punch-out ordering; price-match the top ~50 SKUs against Fisher/VWR and upsell private label for margin.', owner: 'Inside sales / e-commerce' },
  'Regional multi-site laboratory': { motion: 'Named-account rep · network agreement', play: 'Network-wide supply agreement with site-level standing orders; VMI or consignment at the hub lab; quarterly business review on fill rate and backorders.', owner: 'Named-account executive' },
  'National or mega-system laboratory network': { motion: 'Corporate contract · secondary source', play: 'Position as the qualified secondary source for backorder resilience and specialty/controlled-environment items via corporate procurement; do not chase commodity price.', owner: 'Strategic accounts' },
  'Academic medical center laboratory': { motion: 'e-procurement punch-out · research cores', play: 'Get on the university e-procurement catalog; bundle clinical-lab consumables with research-core and cleanroom lines; track grant-funded equipment cycles.', owner: 'Academic / research team' },
  'Pathology and specialty testing': { motion: 'Technical rep · histology bundle', play: 'Histology/cytology bundle (stains, cassettes, slides, microscopy via the NCI heritage); pathologist and lab-manager led buying needs a technical rep.', owner: 'Clinical specialist' },
  'Oncology or advanced testing focus': { motion: 'Specialist rep · molecular consumables', play: 'Molecular/NGS consumables, cold-chain reagents and controlled-environment supplies; sell on assurance of supply and lot consistency.', owner: 'Clinical specialist' },
  'Hospital-embedded laboratory': { motion: 'IDN / GPO contract', play: 'Enter through the health system GPO/IDN contract; standardize lab consumables across system sites with the lab director as sponsor.', owner: 'IDN / GPO team' },
  'Tissue and histology-forward pathology': { motion: 'Histology bundle · equipment service', play: 'Microtome/stainer consumables plus equipment service; microscopy via the NCI (Leica dealer) heritage.', owner: 'Clinical specialist' },
};
const playFor = a => PLAYS[a] || { motion: 'Qualify', play: 'Qualify buying centre and current distributor before assigning a motion.', owner: 'Inside sales' };

function injectCss() { if (!document.getElementById('css-ts')) { const l = document.createElement('link'); l.id = 'css-ts'; l.rel = 'stylesheet'; l.href = 'modules/ts.css?v=20260924203049'; document.head.appendChild(l); } }

/* ── Aggregation (computed once per session, reused by every view) ───────────── */
let AGG = null;
async function getSites(data) {
  const rows = await data.load('ts_sites');
  if (AGG && AGG.rows === rows) return AGG;
  const cnt = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
  const byParent = new Map(), byState = new Map(), byVert = new Map(), byLabel = new Map(), byLayer = new Map(), cmsByArch = new Map(), sitesByArch = new Map(), vxl = new Map();
  let totalCms = 0, t1Cms = 0, t1Billing = 0, t1 = 0, pursueCms = 0; const pursue = [], states = new Set(), ctier = new Map();
  for (const r of rows) {
    r._label = r.commercial_priority_label_v3c || 'Watch'; r._arch = r.commercial_archetype_v3c || 'Unclassified'; r._cms = Number(r.cms_allowed_2023_numeric) || 0; r._tier = `Tier ${r.tier ?? '—'}`;
    r._q = `${r.name || ''} ${r.city || ''} ${r.parent || ''} ${r.zip || ''} ${r.npi || ''} ${r.hosp_name || ''}`.toLowerCase();
    let p = byParent.get(r.parent); if (!p) byParent.set(r.parent, p = []); p.push(r);
    cnt(byState, r.state); cnt(byVert, r.vertical); cnt(byLabel, r._label); cnt(byLayer, r.coverage_layer || 'unknown'); cnt(cmsByArch, r._arch, r._cms); cnt(sitesByArch, r._arch); cnt(vxl, `${r.vertical}|${r._label}`); cnt(ctier, r.commercial_tier_v3c);
    states.add(r.state); totalCms += r._cms;
    if (r.tier === 1) { t1++; t1Cms += r._cms; if (r._cms > 0) t1Billing++; }
    if (r._label === 'Pursue') { pursue.push(r); pursueCms += r._cms; }
  }
  const pursueParents = new Set(pursue.map(r => r.parent)).size;
  const pursueByArch = new Map(); pursue.forEach(r => cnt(pursueByArch, r._arch));
  const bigNetworks = rows.filter(r => r._arch === 'National or mega-system laboratory network').length;
  AGG = { rows, byParent, byState, byVert, byLabel, byLayer, cmsByArch, sitesByArch, vxl, ctier, totalCms, t1, t1Cms, t1Billing, pursue, pursueCms, pursueParents, pursueByArch, bigNetworks, states,
    n50: [...states].filter(s => STATES50.has(s)).length, other: [...states].filter(s => !STATES50.has(s)) };
  return AGG;
}
const dominantArch = sites => { if (!sites?.length) return 'Unclassified'; const m = new Map(); sites.forEach(s => m.set(s._arch, (m.get(s._arch) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; };
const sortedEntries = m => [...m.entries()].sort((a, b) => b[1] - a[1]);
const median = a => { const v = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); if (!v.length) return null; const h = Math.floor(v.length / 2); return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };
const pctTxt = (fmt, v, d = 1) => v == null || isNaN(v) ? '—' : `${fmt.num(v, d)}%`;

let _indexed = false;
function indexEntities(app, parents) {
  if (_indexed) return; _indexed = true;
  app.index(parents.slice().sort((a, b) => (b.max_cms_allowed || 0) - (a.max_cms_allowed || 0)).slice(0, 300).map(p => ({ label: p.parent, sub: `Thomas Scientific parent account · ${p.sites} sites · ${(p.states || []).join(' ')}`, href: `#/ts/accounts?q=${encodeURIComponent(p.parent)}`, kind: 'Account', color: HEX })));
}

async function loadCore(ctx) {
  try { const [A, parents] = await Promise.all([getSites(ctx.data), ctx.data.load('ts_parents')]); indexEntities(ctx.app, parents); return { A, parents }; }
  catch (e) { ctx.el.innerHTML = `<div class="m-ts">${ctx.ui.pageHead({ title: 'Thomas Scientific', sub: 'Site and account tables could not be loaded.' })}${ctx.ui.note(`Thomas Scientific site tables are unavailable (${ctx.esc(e.message)}). Check data/ts_sites.json and data/ts_parents.json.`, 'warn')}</div>`; return null; }
}

/* ── Shared renderers ─────────────────────────────────────────────────────── */
const nm = (ctx, s) => ctx.esc(ctx.fmt.title(s || ''));
const labelChip = (fmt, l) => fmt.chip(l || 'Watch', LBL_VAR[l] || 'var(--dim)');
const actList = (esc, items) => `<div class="acts">${items.map((a, i) => `<div class="act"><span class="n">${i + 1}</span><div><div class="h">${a.h}</div><div class="d">${a.d}</div></div>${a.href ? `<a class="go" href="${esc(a.href)}">${esc(a.go || 'Open')} →</a>` : '<span></span>'}</div>`).join('')}</div>`;
const sitePopup = (ctx, r) => `<b>${nm(ctx, r.name)}</b><br>${ctx.esc(r.city || '')}, ${ctx.esc(r.state || '')} · ${ctx.esc(r.vertical || '')}<br>Score ${ctx.esc(r.score)} · ${ctx.esc(r._label)}${r._cms ? ` · ${ctx.fmt.money(r._cms)} Medicare 2023` : ''}<br><span class="muted">${ctx.esc(r._arch)}</span>`;

function openSite(ctx, r) {
  const { fmt, ui, esc, inspector, app } = ctx; const pl = playFor(r._arch);
  const npiUrl = r.npi ? `https://npiregistry.cms.hhs.gov/provider-view/${encodeURIComponent(r.npi)}` : null;
  inspector.open({ title: nm(ctx, r.name), sub: `${esc(r.city || '')}, ${esc(r.state || '')} ${esc(r.zip || '')} · ${esc(r.vertical || '')} · rank #${esc(r.rank)}`, color: C,
    sections: [
      { label: 'Scores', html: `<div class="m-ts"><div class="ikpis">${ui.kpi({ label: 'Fit score', value: esc(r.score ?? '—'), sub: esc(r._tier), color: C })}${ui.kpi({ label: 'Commercial v3c', value: esc(r.commercial_score_v3c ?? '—'), sub: `tier ${esc(r.commercial_tier_v3c ?? '—')}`, color: LBL_VAR[r._label] })}${ui.kpi({ label: 'Medicare 2023', value: r._cms ? fmt.money(r._cms) : '—', sub: 'CMS allowed', color: 'var(--c-fin)' })}</div><div class="mt-8">${labelChip(fmt, r._label)} ${fmt.chip(r._arch, C)}</div></div>` },
      { label: 'Site profile', html: ui.kv({ Parent: `${nm(ctx, r.parent)} <span class="dim small">(${fmt.num(r.sites)} sites)</span>`, Subtype: esc(r.subtype), 'Buyer angle': esc(r.angle), Phone: r.phone ? `<a href="tel:${esc(String(r.phone).replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a>` : null, NPI: r.npi ? fmt.link(npiUrl, r.npi) : null, 'Evidence layer': esc(LAYER[r.coverage_layer] || r.coverage_layer), 'CMS band': esc(r.cms_band) }) },
      r.hosp_name ? { label: 'Hospital (CMS Hospital Compare)', html: ui.kv({ Hospital: nm(ctx, r.hosp_name), Type: esc(r.hosp_type), 'Star rating': r.hosp_rating != null ? `${esc(r.hosp_rating)} / 5` : null, 'Inpatient discharges': r.ip_discharges ? fmt.num(r.ip_discharges) : null, 'Hospital band': esc(r.hosp_band) }) } : null,
      { label: `Recommended play · ${pl.motion}`, html: `<div class="small text-2">${esc(pl.play)}</div><div class="dim small mt-8">Owner: ${esc(pl.owner)}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${r._label === 'Pursue' ? 'Assign a named owner this week; confirm current distributor and open quotes, then book a lab-manager call' : r._label === 'Nurture' ? 'Add to a nurture sequence (samples + private-label price sheet); re-score when CMS 2024 utilization is released' : 'Watch list: serve through e-commerce; no field time until a trigger (new CLIA test menu, expansion, distributor change)'}${r.phone ? ` · call ${esc(r.phone)}` : ''}.</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small">${npiUrl ? `<a href="${esc(npiUrl)}" target="_blank" rel="noopener">NPPES NPI registry record</a>` : ''}<a href="https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners" target="_blank" rel="noopener">CMS Medicare utilization 2023</a><a href="https://qcor.cms.gov/" target="_blank" rel="noopener">CMS CLIA (QCOR)</a>${r.hosp_name ? '<a href="https://data.cms.gov/provider-data/topics/hospitals" target="_blank" rel="noopener">CMS Hospital Compare</a>' : ''}</div><div class="dim small mt-8">Location = Census ZCTA centroid for ${esc(r.zip || '—')} (not street address).</div>` },
    ].filter(Boolean),
    actions: [npiUrl ? { label: 'NPI record ↗', href: npiUrl } : null, { id: 'ts-parent', label: 'Parent account', onClick: () => app.go('ts', 'accounts', { q: r.parent }) }, { id: 'ts-psites', label: 'All parent sites', onClick: () => app.go('ts', 'sites', { parent: r.parent }) }].filter(Boolean) });
}

function openParent(ctx, p, A) {
  const { fmt, ui, esc, inspector, app } = ctx;
  const sites = (A.byParent.get(p.parent) || []).slice().sort((a, b) => (b.score - a.score) || (b._cms - a._cms));
  const top = sites.slice(0, 50); const arch = p._arch || dominantArch(sites); const pl = playFor(arch);
  const cmsSum = sites.reduce((s, r) => s + r._cms, 0);
  inspector.open({ title: nm(ctx, p.parent), sub: `${esc(p.vert || '')} · ${esc((p.states || []).join(', '))} · ${esc(p.commercial_priority_label_v3c || '')}`, color: C,
    sections: [
      { label: 'Account', html: `<div class="m-ts"><div class="ikpis">${ui.kpi({ label: 'Sites', value: fmt.num(p.sites), sub: `${fmt.num(sites.length)} in site file`, color: C })}${ui.kpi({ label: 'Commercial v3c', value: esc(p.commercial_score_v3c ?? '—'), sub: `tier ${esc(p.commercial_tier_v3c ?? '—')} · fit ${esc(p.score ?? '—')}`, color: 'var(--green)' })}${ui.kpi({ label: 'Medicare 2023', value: fmt.money(cmsSum || p.max_cms_allowed), sub: 'CMS allowed, all sites', color: 'var(--c-fin)' })}</div></div>` },
      { label: 'Profile', html: ui.kv({ 'Dominant archetype': esc(arch), Vertical: esc(p.vert), States: (p.states || []).map(s => esc(s)).join(', '), 'CMS / CLIA / hospital sites': `${fmt.num(p.cms_sites)} / ${fmt.num(p.clia_sites)} / ${fmt.num(p.hosp_sites)}`, 'Largest-site Medicare 2023': fmt.moneyFull(p.max_cms_allowed), 'Max inpatient discharges': p.max_ip_discharges ? fmt.num(p.max_ip_discharges) : null, 'Evidence layers': esc(String(p.coverage || '').split('|').map(x => LAYER[x] || x).join(' · ')) }) },
      { label: `Sites (top ${top.length} of ${sites.length} by score)`, html: top.length ? `<div class="m-ts"><div class="slist">${top.map((r, i) => `<div class="si" data-site="${i}"><div class="t">${nm(ctx, r.name)}</div><div class="v">${esc(r.score)}</div><div class="s">${esc(r.city || '')}, ${esc(r.state || '')} · ${esc(r.subtype || r.vertical || '')}</div><div class="v">${r._cms ? fmt.money(r._cms) : '—'}</div></div>`).join('')}</div></div>` : ui.empty('No matching rows in the site file') },
      { label: `Recommended play · ${pl.motion}`, html: `<div class="small text-2">${esc(pl.play)}</div><div class="dim small mt-8">Owner: ${esc(pl.owner)}</div>` },
      { label: 'Next action', html: `<div class="small text-2">Assign a named owner; pull Thomas ERP purchase history for this parent (is it a customer, and at what share of wallet?); open with the highest-scoring site${top[0] ? ` (${nm(ctx, top[0].name)}, ${esc(top[0].city || '')}${top[0].phone ? ` · ${esc(top[0].phone)}` : ''})` : ''}.</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small"><a href="https://npiregistry.cms.hhs.gov/" target="_blank" rel="noopener">NPPES NPI registry</a><a href="https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners" target="_blank" rel="noopener">CMS Medicare utilization 2023</a><a href="https://qcor.cms.gov/" target="_blank" rel="noopener">CMS CLIA (QCOR)</a></div><div class="dim small mt-8">Parent roll-up and v3c scores from the legacy Thomas Scientific target-account tool.</div>` },
    ],
    actions: [{ id: 'ts-map', label: 'Sites on map', onClick: () => app.go('ts', 'sites', { parent: p.parent }) }, { id: 'ts-csv', label: '⇩ Sites CSV', onClick: () => ui.exportCSV(sites, SITE_EXPORT, `ts_${String(p.parent).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}_sites`) }] });
  document.querySelectorAll('#inspector [data-site]').forEach(d => d.onclick = () => openSite(ctx, top[Number(d.dataset.site)]));
}
const SITE_EXPORT = ['rank', 'name', 'parent', 'city', 'state', 'zip', 'phone', 'npi', 'vertical', 'subtype', 'tier', 'score', 'commercial_score_v3c', 'commercial_tier_v3c', 'commercial_priority_label_v3c', 'commercial_archetype_v3c', 'coverage_layer', 'cms_band', 'cms_allowed_2023_numeric', 'hosp_name', 'hosp_type', 'hosp_rating', 'ip_discharges', 'lat', 'lon'].map(key => ({ key }));

/* ── Credit / filings parsing (schema-tolerant) ─────────────────────────────── */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function explode(kf, fallbackDate) {
  const out = new Map(); const add = (d, k, v) => { if (!out.has(d)) out.set(d, {}); out.get(d)[k] = v; };
  for (const [k, v] of Object.entries(kf || {})) {
    if (DATE.test(k) && v && typeof v === 'object') { for (const [k2, v2] of Object.entries(v)) add(k, k2, v2); continue; }
    const m = k.match(/^(.*?)_(\d{4}-\d{2}-\d{2})(_usd_k|_usd)?$/); if (m) { add(m[2], m[1] + (m[3] || ''), v); continue; }
    if (fallbackDate) add(fallbackDate, k, v);
  }
  return [...out.entries()].map(([date, o]) => ({ date, o }));
}
const pick = (o, keys) => { for (const k of keys) if (typeof o[k] === 'number') return o[k]; return null; };
function loanPoint(o) {
  let par = pick(o, ['tl_par_usd_k', 'term_loan_par_usd_k', 'par_usd_k']); let fv = pick(o, ['tl_fv_usd_k', 'term_loan_fv_usd_k', 'term_loan_fair_value_usd_k', 'fv_usd_k']);
  if (par == null && typeof o.term_loan_cost_usd_k === 'number') par = o.term_loan_cost_usd_k; // commitment par includes unfunded DDTL → mark vs funded cost
  if (typeof o.ddtl_par_usd_k === 'number' && typeof o.ddtl_fv_usd_k === 'number' && par != null && fv != null) { par += o.ddtl_par_usd_k; fv += o.ddtl_fv_usd_k; }
  return par && fv != null ? { par, fv, pct: (fv / par) * 100 } : null;
}
function creditSeries(fil) {
  const items = fil?.items || []; const mfic = new Map(), maipl = new Map(); let maturity = null, equity = [], federal = [], formD = null;
  for (const it of items) {
    const kf = it.key_figures || {};
    if (it.category === 'bdc_loan_schedule') {
      const per = (String(it.filed_or_dated || '').match(/periods?\s+(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
      const isMaipl = /MAIPL|Institutional Private Lending/i.test(`${it.title} ${it.filer_or_source_agency}`);
      for (const { date, o } of explode(kf, per)) { const p = loanPoint(o); if (p) (isMaipl ? maipl : mfic).set(date, p); if (!maturity && typeof o.maturity === 'string') maturity = o.maturity; }
    }
    const fyKeys = Object.keys(kf).filter(k => /^FY\d{4}/.test(k)); if (fyKeys.length > 3 && !federal.length) federal = fyKeys.sort().map(k => ({ label: k.replace(/^FY/, '').replace('_ytd', ' YTD'), value: Number(kf[k]) || 0 }));
    const eqPts = explode(kf, null).filter(({ date, o }) => typeof o.fv_usd === 'number'); if (eqPts.length > 3 && !equity.length) equity = eqPts.map(({ date, o }) => ({ date, v: o.fv_usd })).sort((a, b) => a.date.localeCompare(b.date));
    if (it.category === 'sec_form_d' && typeof kf.total_amount_sold_usd === 'number' && /BSP-TS/.test(it.title || '') && (!formD || kf.total_amount_sold_usd > formD.v)) formD = { v: kf.total_amount_sold_usd, date: it.filed_or_dated, url: it.source_url };
  }
  const srt = m => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const mf = srt(mfic), mp = srt(maipl); const last = mf[mf.length - 1];
  const est = re => (fil?.meta?.estimate_table || []).find(e => re.test(e.metric || ''));
  return { mfic: mf, maipl: mp, last, maturity, equity, federal, formD, est };
}
const rangeM = s => { const m = String(s || '').match(/\$?(\d+(?:\.\d+)?)\s*[–-]\s*\$?(\d+(?:\.\d+)?)\s*M/); return m ? [Number(m[1]), Number(m[2])] : null; };
const dfix = s => (typeof s === 'string' && DATE.test(s) ? `${s}T12:00:00` : s); // avoid UTC→local day shift in fmt.date
const qtr = d => { const [y, m] = d.split('-'); return `${y.slice(2)}Q${Math.ceil(Number(m) / 3)}`; };

/* ── View 1: Overview ─────────────────────────────────────────────────────── */
async function overview(ctx) {
  const { el, ui, fmt, data, maps, charts, esc } = ctx; injectCss();
  const core = await loadCore(ctx); if (!core) return; const { A, parents } = core;
  const [ma, fil] = await Promise.all([data.research('ma_targets_fl_ts'), data.research('thomas_filings')]);
  const targets = (ma?.items || []).filter(t => t.platform === 'thomas_scientific');
  const ranked = ma?.meta?.thomas_scientific?.ranked_top_8 || [];
  const cr = fil ? creditSeries(fil) : null;
  const pursueParentsFile = parents.filter(p => p.commercial_priority_label_v3c === 'Pursue').length;
  const pShareSites = A.pursue.length / A.rows.length, pShareCms = A.pursueCms / (A.totalCms || 1);
  const stTop = sortedEntries(A.byState); const top3 = stTop.slice(0, 3); const top3Share = top3.reduce((s, x) => s + x[1], 0) / A.rows.length;
  const credit = cr?.last ? ` With the Apollo/MidCap unitranche marked at ${fmt.num(cr.last[1].pct, 1)}% of par (${esc(cr.last[0])}) and maturing ${esc(fmt.date(dfix(cr.maturity)))}, converting this list into share-of-wallet is the equity-value lever.` : '';
  const sub = `<b>So what:</b> ${fmt.num(A.pursue.length)} Pursue-labelled sites — ${fmt.num(pShareSites * 100, 1)}% of the ${fmt.num(A.rows.length)} scored — carry ${fmt.money(A.pursueCms)} (${fmt.num(pShareCms * 100, 0)}%) of the universe's 2023 Medicare-allowed lab spend: a list small enough for named-account coverage.${credit}`;
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Thomas Scientific — target-account intelligence', sub, chips: `${fmt.chip('Lab supply distribution · est. 1900', C)}${fmt.chip('BSP since Jan 2022 (from Carlyle)')}${fmt.chip('HQ Swedesboro, NJ')}`, actions: `<a class="btn" href="#/ts/accounts">Parent accounts</a><a class="btn" href="#/ts/sites?label=Pursue">Pursue sites</a><a class="btn" href="#/ts/filings">Credit file</a>` })}
  ${ui.kpis([
    { label: 'Sites scored', value: fmt.num(A.rows.length), sub: `${fmt.num(A.t1)} Tier 1 · ${fmt.num(A.rows.length - A.t1)} Tier 2`, color: C },
    { label: 'Parent accounts', value: fmt.num(parents.length), sub: `${fmt.num(parents.reduce((s, p) => s + (p.sites || 0), 0))} sites · ${fmt.num(parents.filter(p => (p.states || []).length > 1).length)} multi-state`, color: 'var(--accent)' },
    { label: 'Pursue-labelled parents', value: fmt.num(pursueParentsFile), sub: `${fmt.num(A.pursue.length)} Pursue sites · ${fmt.num(A.pursueParents)} parents in site file`, color: 'var(--green)' },
    { label: 'States covered', value: fmt.num(A.states.size), sub: `${A.n50} states + ${A.other.map(esc).join(', ')}`, color: 'var(--cyan)' },
    { label: 'Tier-1 Medicare allowed', value: fmt.money(A.t1Cms), sub: `2023 CMS allowed · ${fmt.num(A.t1Billing)} tier-1 sites billing`, color: 'var(--c-fin)' },
    { label: 'Add-on targets', value: ma ? fmt.num(targets.length) : '—', sub: ma ? `${ranked.length} ranked · top fit ${esc(ranked[0]?.fit_score ?? '—')} (${esc(String(ranked[0]?.company || '').split(/[,(]/)[0])})` : 'research pending', color: 'var(--c-ma)' },
  ])}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Where the scored sites are', sub: 'All 27.5K sites clustered (slate) · Pursue sites (green) · add-on targets (amber) · TS HQ', body: `<div class="map tall" id="ts-ov-map"></div>`, flush: true, foot: `${srcSites(ui)} · ZCTA centroids (${fmt.num(A.rows.filter(r => r.lat == null).length)} sites unmapped)` })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Sites by vertical', sub: 'Share of scored sites', body: charts.donut(sortedEntries(A.byVert).map(([k, v]) => ({ label: k, value: v, color: VERT_HEX[k] })), { size: 118, thick: 16, fmt: v => fmt.compact(v) }), foot: srcSites(ui) })}
      ${ui.panel({ title: 'Tier distribution', sub: 'Legacy fit tier vs. v3c commercial priority — the priority label is what drives coverage', body: `<div class="m-ts"><div class="subh">Fit tier (legacy score)</div>${charts.hbar([{ label: 'Tier 1', value: A.t1, color: 'var(--green)' }, { label: 'Tier 2', value: A.rows.length - A.t1, color: 'var(--accent)' }], { fmt: v => fmt.num(v), labelW: 90 })}<div class="subh">Commercial priority (v3c)</div>${charts.hbar(['Pursue', 'Nurture', 'Watch'].map(l => ({ label: l, value: A.byLabel.get(l) || 0, color: LBL_VAR[l] })), { fmt: v => fmt.num(v), labelW: 90 })}<div class="subh">Commercial tier (v3c)</div>${charts.hbar([1, 2, 3].map(t => ({ label: `Comm. tier ${t}`, value: A.ctier.get(t) || 0, color: t === 1 ? 'var(--green)' : t === 2 ? 'var(--accent)' : 'var(--dim)' })), { fmt: v => fmt.num(v), labelW: 90 })}</div>`, foot: srcSites(ui) })}
    </div>
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Top 15 states by scored sites', sub: `${top3.map(x => esc(x[0])).join(', ')} hold ${fmt.num(top3Share * 100, 0)}% of sites`, body: charts.hbar(stTop.slice(0, 15).map(([s, n]) => ({ label: s, value: n, color: s === 'NJ' || s === 'PA' ? HEX : undefined })), { fmt: v => fmt.num(v), labelW: 34, color: 'var(--accent)' }), foot: srcSites(ui) })}
    ${ui.panel({ title: '2023 Medicare-allowed spend by archetype', sub: 'Where the lab wallet sits (sum of CMS allowed, all sites)', body: charts.hbar(sortedEntries(A.cmsByArch).filter(x => x[1] > 0).map(([k, v]) => ({ label: k, value: v, color: HEX })), { fmt: v => fmt.money(v), labelW: 190 }) + `<div class="dim small mt-8">Top-10 parents (Labcorp, Quest, Exact Sciences…) = ${fmt.num(topShare(A) * 100, 0)}% of the total — national networks are a secondary-source play, not a share play.</div>`, foot: ui.source('CMS Medicare utilization 2023 (allowed amounts)', 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners', '2023') })}
    ${ui.panel({ title: 'Priority × vertical', sub: 'Sites by v3c label — Pursue is almost entirely diagnostics labs', body: charts.heatgrid([...A.byVert.keys()].sort((a, b) => A.byVert.get(b) - A.byVert.get(a)), ['Pursue', 'Nurture', 'Watch'], [...A.byVert.keys()].sort((a, b) => A.byVert.get(b) - A.byVert.get(a)).map(v => ['Pursue', 'Nurture', 'Watch'].map(l => A.vxl.get(`${v}|${l}`) || null)), { fmt: v => fmt.num(v), color: '46,204,143', max: 3000 }) + `<div class="subh" style="margin-top:12px">Evidence behind each site</div>${charts.hbar(sortedEntries(A.byLayer).map(([k, v]) => ({ label: LAYER[k] || k, value: v, color: k === 'nppes_only' ? 'var(--dim)' : HEX })), { fmt: v => fmt.num(v), labelW: 150 })}`, foot: srcSites(ui) })}
  </div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Levers — target-account selling motion', sub: 'What the commercial team should do with this map, in order', accent: true, body: actList(esc, levers(ctx, A, targets, ranked)) })}
    ${ui.panel({ title: 'Why it matters now', sub: 'Credit file and add-on cadence', body: cr?.last ? `<div class="col gap-8"><div class="row"><span class="bignum" style="color:var(--amber)">${fmt.num(cr.last[1].pct, 1)}%</span><span class="small text-2">MFIC mark on the term loan (% of par), ${esc(cr.last[0])}</span></div><div class="dim small">Discount to par, percentage points (higher = lenders expect less recovery)</div>${charts.line([{ name: 'MFIC discount to par', color: '#f5b73d', points: cr.mfic.map(([d, p]) => [qtr(d), 100 - p.pct]) }], { h: 120, fmt: v => `${fmt.num(v, 0)}pp`, area: true })}<div class="small text-2">Sponsor equity is marked near zero and the loan went PIK in Q4-2024 before reverting to cash pay. Maturity ${esc(fmt.date(dfix(cr.maturity)))}. Revenue growth from target accounts is what refinances this capital structure.</div><a class="small" href="#/ts/filings">Open filings &amp; financials →</a></div>` : ui.note('Thomas Scientific filings dataset not yet available — credit context will appear here.', 'warn'), foot: fil ? ui.source('SEC EDGAR (MFIC / MAIPL schedules of investments)', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001278752', fil.meta?.generated) : '' })}
  </div></div>`;

  const map = maps.create(el.querySelector('#ts-ov-map'), { center: [38.6, -95.5], zoom: 4 });
  maps.points(map, A.rows, { color: '#6f8fb3', radius: 3, cluster: true, clusterZoom: 7, gridDeg: 0.9, opacity: .55, weight: 0, popup: r => sitePopup(ctx, r), onClick: r => openSite(ctx, r) });
  maps.points(map, A.pursue, { color: HEX, radius: 3.5, cluster: false, opacity: .95, weight: .5, popup: r => sitePopup(ctx, r), onClick: r => openSite(ctx, r) });
  maps.points(map, targets.filter(t => t.lat != null), { color: '#f5b73d', radius: 6, cluster: false, weight: 1.5, stroke: '#0a0e14', popup: t => `<b>${esc(t.company)}</b><br>${esc(t.hq_city || '')}, ${esc(t.state || '')} · fit ${esc(t.fit_score)}<br><a href="#/ts/targets?q=${encodeURIComponent(t.company)}">Open in add-on screen →</a>` });
  maps.marker(map, HQ.lat, HQ.lon, { color: HEX, label: 'TS HQ' });
  maps.legend(map, [{ color: '#6f8fb3', label: 'Scored sites (clustered)' }, { color: HEX, label: `Pursue sites (${fmt.num(A.pursue.length)})` }, { color: '#f5b73d', label: 'Add-on targets' }], 'Layers');
  return () => map.remove();
}
function topShare(A) { const m = new Map(); A.rows.forEach(r => m.set(r.parent, (m.get(r.parent) || 0) + r._cms)); return sortedEntries(m).slice(0, 10).reduce((s, x) => s + x[1], 0) / (A.totalCms || 1); }
function levers(ctx, A, targets, ranked) {
  const { fmt, esc } = ctx; const pa = a => A.pursueByArch.get(a) || 0; const sa = a => A.sitesByArch.get(a) || 0;
  const top = ranked[0] ? targets.find(t => t.id === ranked[0].id) : null;
  return [
    { h: `Named-account coverage on ${fmt.num(A.pursue.length)} Pursue sites / ${fmt.num(A.pursueParents)} parents`, d: `They hold ${fmt.money(A.pursueCms)} of 2023 Medicare-allowed spend. Assign an owner per parent, start with the 500 scored parent accounts, and track share-of-wallet monthly.`, href: '#/ts/accounts', go: 'Accounts' },
    { h: `Independent clinical labs: ${fmt.num(sa('Independent clinical laboratory'))} sites, ${fmt.num(pa('Independent clinical laboratory'))} Pursue`, d: 'The long tail is where the margin is. Use inside sales and e-commerce standing orders, and lead with private label on consumables.', href: `#/ts/sites?arch=${encodeURIComponent('Independent clinical laboratory')}&label=Pursue`, go: 'Sites' },
    { h: `Regional multi-site labs: ${fmt.num(sa('Regional multi-site laboratory'))} sites, ${fmt.num(pa('Regional multi-site laboratory'))} Pursue`, d: 'Sign a network supply agreement and put VMI or consignment at the hub lab. One contract covers many ship-to sites.', href: `#/ts/sites?arch=${encodeURIComponent('Regional multi-site laboratory')}`, go: 'Sites' },
    { h: `Nurture ${fmt.num(A.byLabel.get('Nurture') || 0)} sites without field time`, d: 'Run a marketing-automation nurture (samples and price sheets), then re-score on the CMS 2024 utilization release and move risers to Pursue.', href: '#/ts/sites?label=Nurture', go: 'Sites' },
    { h: `Protect, don't chase, national networks (${fmt.num(A.bigNetworks)} sites)`, d: 'Labcorp and Quest dominate Medicare spend. Position as the qualified secondary source for backorders and specialty/cleanroom items, not on price.', href: `#/ts/sites?arch=${encodeURIComponent('National or mega-system laboratory network')}`, go: 'Sites' },
    { h: 'Close geographic white space by add-on', d: top ? `${esc(top.company)} (fit ${esc(top.fit_score)}, ${esc(top.hq_city || '')} ${esc(top.state || '')}) is the top-ranked candidate. ${esc(String(top.strategic_rationale || '').slice(0, 200))}${String(top.strategic_rationale || '').length > 200 ? '…' : ''}` : 'Match target HQs to site density to find the regions where an add-on gives the most local coverage.', href: '#/ts/targets', go: 'Targets' },
  ];
}

/* ── View 2: Parent accounts ──────────────────────────────────────────────── */
async function accounts(ctx) {
  const { el, ui, fmt, charts, esc, params } = ctx; injectCss();
  const core = await loadCore(ctx); if (!core) return; const { A, parents } = core;
  const P = parents.map(p => ({ ...p, _arch: dominantArch(A.byParent.get(p.parent)), _nstates: (p.states || []).length, _cms: Number(p.max_cms_allowed) || 0, _cmsAll: (A.byParent.get(p.parent) || []).reduce((s, r) => s + r._cms, 0) }));
  const totCms = P.reduce((s, p) => s + p._cmsAll, 0); const byCms = P.slice().sort((a, b) => b._cmsAll - a._cmsAll); const top50 = byCms.slice(0, 50).reduce((s, p) => s + p._cmsAll, 0) / (totCms || 1);
  const verts = [...new Set(P.map(p => p.vert).filter(Boolean))].sort(); const sts = [...new Set(P.flatMap(p => p.states || []))].sort(); const labels = [...new Set(P.map(p => p.commercial_priority_label_v3c).filter(Boolean))];
  const archs = [...new Set(P.map(p => p._arch))].sort();
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Parent accounts', sub: `<b>So what:</b> ${(() => { const np = P.filter(p => p.commercial_priority_label_v3c === 'Pursue').length; return np === P.length ? `all ${fmt.num(P.length)} scored parents carry` : `${fmt.num(np)} of ${fmt.num(P.length)} scored parents carry`; })()} the Pursue label, but value is concentrated — the top 50 by 2023 Medicare-allowed spend hold ${fmt.num(top50 * 100, 0)}% of the group's ${fmt.money(totCms)}. Work the list top-down by commercial score within each archetype play.`, chips: `${fmt.chip(`${fmt.num(P.length)} parents`, C)}${fmt.chip(`${fmt.num(P.reduce((s, p) => s + (p.sites || 0), 0))} sites`)}${fmt.chip('v3c commercial model')}` })}
    <div id="ac-f"></div><div id="ac-k" class="mt-8"></div>
    <div class="grid grid-3 mt-12">
      ${ui.panel({ title: 'Parents by dominant archetype', sub: 'Filtered set · drives the recommended play', body: '<div id="ac-arch"></div>', foot: srcSites(ui) })}
      ${ui.panel({ title: 'Footprint: sites per parent', sub: 'Filtered set · multi-site parents justify a network agreement', body: '<div id="ac-size"></div>', foot: srcSites(ui) })}
      ${ui.panel({ title: 'Top 10 by 2023 Medicare allowed', sub: 'Filtered set · sum across the parent’s sites', body: '<div id="ac-top"></div>', foot: ui.source('CMS Medicare utilization 2023', 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners', '2023') })}
    </div>
    <div class="mt-12">${ui.panel({ title: 'Account list', sub: 'Click a parent for sites, evidence and the recommended play · sortable · CSV', body: '<div id="ac-t"></div>', flush: true, foot: `${srcSites(ui)} · parent roll-up by legacy TS tool` })}</div>
    <div class="mt-12">${ui.panel({ title: 'Account plays by archetype', sub: 'Selling motion per buying centre — apply to the filtered list', accent: true, body: '<div id="ac-plays"></div>' })}</div></div>`;
  const columns = [
    { key: 'parent', label: 'Parent account', fmt: (v, r) => `<b>${nm(ctx, v)}</b><div class="dim small">${esc(r._arch)}</div>` },
    { key: 'vert', label: 'Vertical', fmt: v => esc(v || '—') },
    { key: 'sites', label: 'Sites', num: true, fmt: v => fmt.num(v) },
    { key: '_nstates', label: 'States', num: true, fmt: (v, r) => `<span title="${esc((r.states || []).join(', '))}">${fmt.list(r.states || [], 3)}</span>` },
    { key: 'score', label: 'Fit', num: true, fmt: v => fmt.score(v), width: '84px' },
    { key: 'commercial_score_v3c', label: 'Comm. v3c', num: true, fmt: v => fmt.score(v, 'var(--green)'), width: '84px' },
    { key: 'commercial_tier_v3c', label: 'C-tier', num: true, fmt: v => fmt.chip(`T${v ?? '—'}`, v === 1 ? 'var(--green)' : 'var(--accent)') },
    { key: 'cms_sites', label: 'CMS', num: true, fmt: v => fmt.num(v) },
    { key: 'clia_sites', label: 'CLIA', num: true, fmt: v => fmt.num(v) },
    { key: 'hosp_sites', label: 'Hosp.', num: true, fmt: v => fmt.num(v) },
    { key: '_cmsAll', label: 'Medicare 2023', num: true, fmt: v => fmt.money(v) },
    { key: 'commercial_priority_label_v3c', label: 'Priority', fmt: v => labelChip(fmt, v) },
  ];
  let tbl;
  const f = ui.filters(el.querySelector('#ac-f'), [
    { key: 'q', label: 'Search parent, state, archetype…', type: 'search', value: params.q || '' },
    { key: 'vert', label: 'Vertical', options: verts, value: params.vert || '' },
    { key: 'tier', label: 'Comm. tier', options: [1, 2, 3].filter(t => P.some(p => p.commercial_tier_v3c === t)).map(t => ({ value: String(t), label: `Tier ${t}` })), value: params.tier || '' },
    { key: 'label', label: 'Priority', options: labels, value: params.label || '' },
    { key: 'arch', label: 'Archetype', options: archs, value: params.arch || '' },
    { key: 'state', label: 'State', options: sts, value: params.state || '' },
  ], apply);
  function apply(st) {
    const q = (st.q || '').toLowerCase().trim();
    const rows = P.filter(p => (!st.vert || p.vert === st.vert) && (!st.tier || String(p.commercial_tier_v3c) === st.tier) && (!st.label || p.commercial_priority_label_v3c === st.label) && (!st.arch || p._arch === st.arch) && (!st.state || (p.states || []).includes(st.state)) && (!q || `${p.parent} ${(p.states || []).join(' ')} ${p._arch} ${p.vert}`.toLowerCase().includes(q)));
    f.setCount(`${fmt.num(rows.length)} / ${fmt.num(P.length)}`);
    const sites = rows.reduce((s, p) => s + (p.sites || 0), 0), cms = rows.reduce((s, p) => s + p._cmsAll, 0);
    el.querySelector('#ac-k').innerHTML = ui.kpis([
      { label: 'Parents', value: fmt.num(rows.length), sub: `of ${fmt.num(P.length)} scored`, color: C },
      { label: 'Sites', value: fmt.num(sites), sub: `${fmt.num(rows.filter(p => (p.sites || 0) > 1).length)} multi-site parents`, color: 'var(--accent)' },
      { label: 'Multi-state', value: fmt.num(rows.filter(p => p._nstates > 1).length), sub: 'network-agreement candidates', color: 'var(--cyan)' },
      { label: 'Medicare 2023 allowed', value: fmt.money(cms), sub: 'sum across parents’ sites', color: 'var(--c-fin)' },
      { label: 'Avg commercial score', value: rows.length ? fmt.num(rows.reduce((s, p) => s + (p.commercial_score_v3c || 0), 0) / rows.length, 1) : '—', sub: 'v3c, 0–100', color: 'var(--green)' },
      { label: 'Hospital-linked', value: fmt.num(rows.filter(p => (p.hosp_sites || 0) > 0).length), sub: 'IDN / GPO route', color: 'var(--amber)' },
    ]);
    const am = new Map(); rows.forEach(p => am.set(p._arch, (am.get(p._arch) || 0) + 1));
    el.querySelector('#ac-arch').innerHTML = rows.length ? charts.hbar(sortedEntries(am).map(([k, v]) => ({ label: k, value: v, color: HEX })), { fmt: v => fmt.num(v), labelW: 190 }) : ui.empty('No parents match');
    const buckets = [['1 site', p => p.sites <= 1], ['2–4', p => p.sites >= 2 && p.sites <= 4], ['5–9', p => p.sites >= 5 && p.sites <= 9], ['10–19', p => p.sites >= 10 && p.sites <= 19], ['20+', p => p.sites >= 20]];
    el.querySelector('#ac-size').innerHTML = rows.length ? charts.hbar(buckets.map(([l, fn]) => ({ label: l === '1 site' ? '1 site' : `${l} sites`, value: rows.filter(fn).length })), { color: 'var(--accent)', fmt: v => fmt.num(v), labelW: 70 }) + `<div class="dim small mt-8">${fmt.num(rows.filter(p => p.sites > 1).length)} multi-site parents hold ${fmt.num(rows.filter(p => p.sites > 1).reduce((s, p) => s + p.sites, 0))} of ${fmt.num(rows.reduce((s, p) => s + (p.sites || 0), 0))} sites.</div>` : ui.empty('No parents match');
    el.querySelector('#ac-top').innerHTML = rows.length ? charts.hbar(rows.slice().sort((a, b) => b._cmsAll - a._cmsAll).slice(0, 10).map(p => ({ label: fmt.title(p.parent), value: p._cmsAll, color: 'var(--c-fin)' })), { fmt: v => fmt.money(v), labelW: 170 }) : ui.empty('No parents match');
    el.querySelector('#ac-plays').innerHTML = actList(esc, sortedEntries(am).map(([a, n]) => { const pl = playFor(a); return { h: `${esc(a)} — ${fmt.num(n)} parents · ${esc(pl.motion)}`, d: `${esc(pl.play)} <span class="dim">Owner: ${esc(pl.owner)}.</span>`, href: `#/ts/accounts?arch=${encodeURIComponent(a)}`, go: 'Filter' }; }));
    tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#ac-t'), { columns, rows, pageSize: 25, sortKey: 'commercial_score_v3c', exportName: 'ts_parent_accounts', rowKey: r => r.parent, onRow: r => openParent(ctx, r, A) }));
    return rows;
  }
  const first = apply(f.state);
  if (params.q) { const hit = P.find(p => p.parent.toLowerCase() === String(params.q).toLowerCase()) || (first.length === 1 ? first[0] : null); if (hit) openParent(ctx, hit, A); }
}

/* ── View 3: Site explorer ────────────────────────────────────────────────── */
async function sites(ctx) {
  const { el, ui, fmt, charts, maps, esc, params, app } = ctx; injectCss();
  const core = await loadCore(ctx); if (!core) return; const { A } = core;
  const parent = params.parent || '';
  const sts = sortedEntries(A.byState).map(x => x[0]).sort(); const verts = sortedEntries(A.byVert).map(x => x[0]); const archs = sortedEntries(A.sitesByArch).map(x => x[0]);
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Site explorer', sub: `<b>So what:</b> filter ${fmt.num(A.rows.length)} scored lab and hospital sites down to a call list. Filters run before anything renders; the map clusters at national zoom, and green clusters contain at least one Pursue site.`, chips: parent ? `<span class="chip clear" style="--cc:${C}" id="st-clear" title="Clear parent filter">Parent: ${nm(ctx, parent)} ✕</span>` : '' })}
    <div id="st-f"></div><div id="st-k" class="mt-8"></div>
    <div class="grid grid-main mt-12">
      ${ui.panel({ title: 'Map', sub: 'ZCTA centroids · click a point for the site dossier', body: '<div class="map tall" id="st-map"></div>', flush: true, foot: srcSites(ui) })}
      <div class="col gap-12">
        ${ui.panel({ title: 'Filtered mix', sub: 'Top states · archetypes · priority', body: '<div id="st-mix"></div>', foot: srcSites(ui) })}
      </div>
    </div>
    <div class="mt-12">${ui.panel({ title: 'Sites', sub: '50 per page · sortable · CSV exports the full filtered set', body: '<div id="st-t"></div>', flush: true, foot: srcSites(ui) })}</div>
    <div class="mt-12">${ui.panel({ title: 'Next actions for this list', accent: true, body: '<div id="st-act"></div>' })}</div></div>`;
  el.querySelector('#st-clear')?.addEventListener('click', () => app.go('ts', 'sites', {}));
  const map = maps.create(el.querySelector('#st-map'), { center: [38.6, -95.5], zoom: 4 }); maps.marker(map, HQ.lat, HQ.lon, { color: HEX, label: 'TS HQ' });
  maps.legend(map, [{ color: LBL_HEX.Pursue, label: 'Pursue' }, { color: LBL_HEX.Nurture, label: 'Nurture' }, { color: LBL_HEX.Watch, label: 'Watch' }], 'v3c priority');
  let layer = null, tbl = null;
  const columns = [
    { key: 'rank', label: '#', num: true, width: '54px' },
    { key: 'name', label: 'Site', fmt: (v, r) => { const sub = [String(r.parent || '').toLowerCase() !== String(v || '').toLowerCase() ? nm(ctx, r.parent) : '', r.sites > 1 ? `${fmt.num(r.sites)} sites` : '', r.hosp_name ? `Hosp.: ${nm(ctx, r.hosp_name)}` : ''].filter(Boolean).join(' · '); return `<b>${nm(ctx, v)}</b>${sub ? `<div class="dim small">${sub}</div>` : ''}`; } },
    { key: 'state', label: 'Location', fmt: (v, r) => `${esc(r.city || '')}, ${esc(v || '')} <span class="dim">${esc(r.zip || '')}</span>` },
    { key: '_arch', label: 'Vertical · archetype', fmt: (v, r) => `${esc(r.vertical || '')}<div class="dim small">${esc(v)}</div>` },
    { key: 'score', label: 'Fit', num: true, fmt: v => fmt.score(v), width: '80px' },
    { key: 'commercial_score_v3c', label: 'Comm.', num: true, fmt: v => fmt.score(v, 'var(--green)'), width: '80px' },
    { key: '_label', label: 'Priority', fmt: v => labelChip(fmt, v), sort: (a, b) => LORD[b._label] - LORD[a._label] },
    { key: '_cms', label: 'Medicare 2023', num: true, fmt: v => v ? fmt.money(v) : '—' },
    { key: 'phone', label: 'Phone', fmt: v => `<span class="num small">${esc(v || '—')}</span>` },
  ];
  const f = ui.filters(el.querySelector('#st-f'), [
    { key: 'q', label: 'Search name, city, parent, ZIP, NPI…', type: 'search', value: params.q || '' },
    { key: 'state', label: 'State', options: sts, value: params.state || '' },
    { key: 'vertical', label: 'Vertical', options: verts, value: params.vertical || '' },
    { key: 'tier', label: 'Fit tier', options: [{ value: '1', label: 'Tier 1' }, { value: '2', label: 'Tier 2' }], value: params.tier || '' },
    { key: 'arch', label: 'Archetype', options: archs, value: params.arch || '' },
    { key: 'label', label: 'Priority', options: ['Pursue', 'Nurture', 'Watch'], value: params.label || '' },
    { key: 'cms', label: 'Bills Medicare', type: 'toggle', value: params.cms === '1' },
  ], apply);
  function apply(st) {
    const q = (st.q || '').toLowerCase().trim();
    const rows = A.rows.filter(r => (!parent || r.parent === parent) && (!st.state || r.state === st.state) && (!st.vertical || r.vertical === st.vertical) && (!st.tier || String(r.tier) === st.tier) && (!st.arch || r._arch === st.arch) && (!st.label || r._label === st.label) && (!st.cms || r._cms > 0) && (!q || r._q.includes(q)));
    f.setCount(`${fmt.num(rows.length)} / ${fmt.num(A.rows.length)}`);
    const cms = rows.reduce((s, r) => s + r._cms, 0), par = new Set(rows.map(r => r.parent)).size, pur = rows.filter(r => r._label === 'Pursue').length;
    el.querySelector('#st-k').innerHTML = ui.kpis([
      { label: 'Sites', value: fmt.num(rows.length), sub: `${fmt.num(rows.filter(r => r.tier === 1).length)} Tier 1`, color: C },
      { label: 'Parents', value: fmt.num(par), sub: 'distinct organizations', color: 'var(--accent)' },
      { label: 'Pursue sites', value: fmt.num(pur), sub: `${fmt.num(rows.filter(r => r._label === 'Nurture').length)} Nurture`, color: 'var(--green)' },
      { label: 'Medicare 2023 allowed', value: fmt.money(cms), sub: `${fmt.num(rows.filter(r => r._cms > 0).length)} sites billing`, color: 'var(--c-fin)' },
      { label: 'Hospital-linked', value: fmt.num(rows.filter(r => r.hosp_name).length), sub: 'CMS Hospital Compare match', color: 'var(--amber)' },
      { label: 'Median fit score', value: rows.length ? fmt.num(median(rows.map(r => r.score))) : '—', sub: 'legacy 0–100', color: 'var(--cyan)' },
    ]);
    const sm = new Map(), am = new Map(); rows.forEach(r => { sm.set(r.state, (sm.get(r.state) || 0) + 1); am.set(r._arch, (am.get(r._arch) || 0) + 1); });
    el.querySelector('#st-mix').innerHTML = rows.length ? `<div class="m-ts"><div class="subh">Top states</div>${charts.hbar(sortedEntries(sm).slice(0, 8).map(([k, v]) => ({ label: k, value: v })), { fmt: v => fmt.num(v), labelW: 34, color: 'var(--accent)' })}<div class="subh">Archetype</div>${charts.hbar(sortedEntries(am).slice(0, 6).map(([k, v]) => ({ label: k, value: v, color: HEX })), { fmt: v => fmt.num(v), labelW: 170 })}<div class="subh">Priority</div>${charts.hbar(['Pursue', 'Nurture', 'Watch'].map(l => ({ label: l, value: rows.filter(r => r._label === l).length, color: LBL_VAR[l] })), { fmt: v => fmt.num(v), labelW: 70 })}</div>` : ui.empty('No sites match these filters');
    layer?.remove();
    const pts = rows.slice().sort((a, b) => LORD[a._label] - LORD[b._label]);
    layer = maps.points(map, pts, { color: r => LBL_HEX[r._label], radius: r => r._label === 'Pursue' ? 5 : 3.5, cluster: true, clusterZoom: 8, gridDeg: pts.length > 5000 ? 0.9 : undefined, opacity: .85, weight: .5, popup: r => sitePopup(ctx, r), onClick: r => openSite(ctx, r) });
    if (rows.length && rows.length < A.rows.length) layer.fit(); else map.setView([38.6, -95.5], 4);
    tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#st-t'), { columns, rows, pageSize: 50, sortKey: 'commercial_score_v3c', exportName: 'ts_sites_filtered', rowKey: r => r.rank, onRow: r => openSite(ctx, r) }));
    const pl = rows.length ? playFor(sortedEntries(am)[0][0]) : null; const withPhone = rows.filter(r => r.phone).length;
    el.querySelector('#st-act').innerHTML = rows.length ? actList(esc, [
      { h: `Export the call list (${fmt.num(rows.length)} sites, ${fmt.num(withPhone)} with phone)`, d: 'Use the CSV button below the table. Load it into the CRM as a campaign, dedupe against current customers from Thomas ERP ship-to data, and assign by territory.' },
      { h: `Work Pursue first (${fmt.num(pur)}), then Nurture`, d: `Dominant archetype in this set: ${esc(sortedEntries(am)[0][0])}. Recommended motion: ${esc(pl.motion)}. ${esc(pl.play)}` },
      { h: 'Verify before outreach', d: 'Locations are ZIP centroids and NPPES addresses can be stale. Confirm the lab-manager contact and CLIA certificate status (QCOR) before a field visit.' },
    ]) : ui.empty('No sites match');
  }
  apply(f.state);
  return () => map.remove();
}

/* ── View 4: Add-on targets ───────────────────────────────────────────────── */
async function targetsView(ctx) {
  const { el, ui, fmt, maps, esc, data, params } = ctx; injectCss();
  const ma = await data.research('ma_targets_fl_ts');
  if (!ma) { el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Add-on targets', sub: 'Lab and cleanroom distributor screen for Thomas Scientific' })}${ui.note('Research dataset not yet available (research/ma_targets_fl_ts).', 'warn')}</div>`; return; }
  const items = (ma.items || []).filter(t => t.platform === 'thomas_scientific');
  const meta = ma.meta?.thomas_scientific || {}; const ranked = meta.ranked_top_8 || []; const pe = meta.pe_backed_competitors || []; const pc = meta.platform_context || {};
  const A = await getSites(data).catch(() => null);
  const fit80 = items.filter(t => (t.fit_score || 0) >= 80).length; const top8 = ranked.map(r => items.find(t => t.id === r.id)).filter(Boolean);
  const top = top8[0]; const w = ma.meta?.scoring_weights || {};
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Add-on targets', sub: `<b>So what:</b> ${fmt.num(items.length)} regional lab, clinical and cleanroom distributors screened; ${fmt.num(fit80)} score ≥80. ${top ? `${esc(top.company)} (fit ${esc(top.fit_score)}) leads. ` : ''}${esc(pc.observation || '')}`, chips: Object.entries(w).map(([k, v]) => fmt.chip(`${k.replace(/_/g, ' ')} ${fmt.num(v * 100)}%`, 'var(--c-ma)')).join('') })}
  ${ui.kpis([
    { label: 'Candidates screened', value: fmt.num(items.length), sub: `${fmt.num(new Set(items.map(t => t.state)).size)} states / provinces`, color: 'var(--c-ma)' },
    { label: 'Fit ≥ 80', value: fmt.num(fit80), sub: `${ranked.length} ranked shortlist`, color: 'var(--green)' },
    { label: 'Median staff', value: fmt.num(median(items.map(t => t.employees))), sub: 'ZoomInfo', color: 'var(--accent)' },
    { label: 'Top-8 revenue (est.)', value: fmt.money(top8.reduce((s, t) => s + (t.revenue_est_usd || 0), 0)), sub: 'ZoomInfo modeled · directional', color: 'var(--c-fin)' },
    { label: 'Prior TS add-ons', value: fmt.num((pc.prior_acquisitions || []).length), sub: 'since Dec 2017 · none since Oct 2023', color: C },
    { label: 'PE-backed rivals', value: fmt.num(pe.length), sub: 'competing for the same targets', color: 'var(--c-pe)' },
  ])}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Targets against the demand map', sub: 'Candidate HQs (amber, sized by fit) over Thomas scored-site clusters (slate)', body: '<div class="map" id="tg-map" style="min-height:420px"></div>', flush: true, foot: ui.source('Company websites · ZoomInfo · TS site file', 'https://www.zoominfo.com', ma.meta?.generated) })}
    ${ui.panel({ title: 'Ranked shortlist (top 8)', sub: 'Click to open the dossier', body: `<div id="tg-rank">${top8.map((t, i) => `<div class="rk" data-q="${esc(t.company)}"><span class="i">${esc(ranked[i]?.rank ?? i + 1)}</span><div style="min-width:0"><div class="t">${esc(t.company)}</div><div class="s">${esc(t.hq_city || '')}, ${esc(t.state || '')} · ${fmt.num(t.employees)} staff · ${fmt.money(t.revenue_est_usd)} est.</div></div>${fmt.score(t.fit_score)}</div>`).join('') || ui.empty('No ranked shortlist in dataset')}</div>`, foot: ui.source('BSP add-on screen (ma_targets_fl_ts)', null, ma.meta?.generated) })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Full screen', sub: 'Filters · sortable · CSV · click a row for fit breakdown, sources and next action', body: '<div id="tg-screen"></div>', foot: `<span class="dim">${esc((ma.meta?.caveats || [])[0] || '')}</span>` })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'PE-backed competitors for the same targets', sub: 'Who bids against Thomas for lab distributors', body: pe.length ? pe.map(p => `<div class="pcard"><div class="t">${esc(p.company)}</div><div class="s">${esc(p.hq || '')} · ${esc(p.sponsor || 'Sponsor not verified')}${p.scale ? ` · ${esc(p.scale)}` : ''}</div><div class="d">${esc(p.notes || '')}</div><div class="small mt-8">${(p.sources || []).map(s => fmt.link(s)).join(' · ')}</div></div>`).join('') : ui.empty('No competitor list in dataset'), foot: ui.source('BSP add-on screen (ma_targets_fl_ts) · company sites · ZoomInfo', null, ma.meta?.generated) })}
    ${ui.panel({ title: 'Platform add-on history', sub: 'Pattern: regional life-science and cleanroom distributors', body: `${ui.timeline((pc.prior_acquisitions || []).slice().reverse().map(a => ({ date: (String(a).match(/\(([^)]*)\)\s*$/) || [])[1] || '', text: String(a).replace(/\s*\([^)]*\)\s*$/, '') })))}${actList(esc, [
      { h: 'Re-open the add-on engine', d: 'There has been no deal since Oct 2023. Run owner outreach on the top 8 through PRG; start with founder- and family-owned targets (lowest process risk).' },
      { h: 'Underwrite on the credit file', d: 'The loan is marked below par (see Filings). Add-ons probably need seller notes or an equity top-up, so prioritize targets that add margin: private label, cleanroom, service.' },
    ])}`, foot: `<span class="src">Sources: ${(pc.sources || []).slice(0, 4).map(s => fmt.link(s)).join(' · ')}</span>` })}
  </div></div>`;
  const ctl = renderTargets(ctx, el.querySelector('#tg-screen'), { items, color: C, platformLabel: 'Thomas Scientific', exportName: 'ts_addon_targets', pageSize: 30 });
  const focus = q => { const inp = el.querySelector('#tg-screen input[type=search]'); if (!inp) return; inp.value = q; inp.dispatchEvent(new Event('input')); setTimeout(() => el.querySelector('#tg-screen tbody tr[data-i]')?.click(), 260); };
  el.querySelectorAll('#tg-rank .rk').forEach(d => d.onclick = () => focus(d.dataset.q));
  const map = maps.create(el.querySelector('#tg-map'), { center: [40, -92], zoom: 4 });
  if (A) maps.points(map, A.rows, { color: '#6f8fb3', radius: 3, cluster: true, clusterZoom: 7, gridDeg: 0.9, opacity: .5, weight: 0 });
  maps.points(map, items.filter(t => t.lat != null), { color: '#f5b73d', radius: t => 4 + Math.max(0, (t.fit_score || 50) - 50) / 6, cluster: false, weight: 1.5, popup: t => `<b>${esc(t.company)}</b><br>${esc(t.hq_city || '')}, ${esc(t.state || '')} · fit ${esc(t.fit_score)} (${esc(fitTierOf(t.fit_score || 0))})<br>${fmt.num(t.employees)} staff · ${fmt.money(t.revenue_est_usd)} est.`, onClick: t => focus(t.company) });
  maps.marker(map, HQ.lat, HQ.lon, { color: HEX, label: 'TS HQ' });
  maps.legend(map, [{ color: '#f5b73d', label: 'Add-on candidate (size = fit)' }, { color: '#6f8fb3', label: 'TS scored sites' }, { color: HEX, label: 'Thomas HQ' }], 'Layers');
  if (params.q) focus(params.q);
  return () => map.remove();
}

/* ── View 5: Filings & financials ─────────────────────────────────────────── */
async function filings(ctx) {
  const { el, ui, fmt, charts, esc, data, inspector } = ctx; injectCss();
  const [fil, comps] = await Promise.all([data.research('thomas_filings'), data.research('public_comps')]);
  const cr = fil ? creditSeries(fil) : null; const e = cr ? cr.est : () => null;
  const rev = e(/Current revenue/i), ebitda = e(/Current EBITDA/i), lev = e(/Current total leverage/i), fed = e(/Federal revenue/i), eqv = e(/Sponsor common equity/i);
  const matDays = cr?.maturity && DATE.test(cr.maturity) ? (() => { const [y, m, d] = cr.maturity.split('-').map(Number); const n = new Date(); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5); })() : null; // calendar days, no UTC/DST drift
  const sub = cr?.last ? `<b>So what:</b> Broad Sky put ${fmt.money(cr.formD?.v)} of equity into Thomas. Apollo's BDCs now mark the unitranche at ${fmt.num(cr.last[1].pct, 1)}% of par and the sponsor common at ${esc(eqv?.estimate || '≈0')}. That implies EBITDA of ${esc(ebitda?.estimate || 'n/a')} (est.) against ${esc(lev?.estimate || 'n/a')} leverage, with maturity ${esc(fmt.date(dfix(cr.maturity)))}. The operating plan has to grow gross profit in target accounts, not just revenue.` : 'Financial picture for Thomas Scientific from public filings.';
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Filings & financials', sub, chips: `${fmt.chip('SEC EDGAR · BDC schedules', C)}${fmt.chip('Form D')}${fmt.chip('USASpending')}${fmt.chip('Estimates are labelled est.', 'var(--amber)')}` })}
  ${cr ? ui.kpis([
    { label: 'Sponsor equity raised', value: fmt.money(cr.formD?.v), sub: `Form D · BSP-TS, LP`, color: 'var(--c-bsp)' },
    { label: 'Loan mark (MFIC)', value: `${fmt.num(cr.last?.[1].pct, 1)}%`, sub: `of par · ${esc(cr.last?.[0] || '')}`, color: (cr.last?.[1].pct || 100) < 95 ? 'var(--red)' : 'var(--green)' },
    { label: 'Maturity', value: esc(fmt.date(dfix(cr.maturity))), sub: matDays != null ? `${fmt.num(matDays)} days · refinancing window` : '', color: matDays != null && matDays < 540 ? 'var(--amber)' : 'var(--accent)' },
    { label: 'Revenue (est.)', value: esc(rev?.estimate || '—'), sub: `${esc(rev?.confidence || '')} confidence · CY2025/26`, color: C },
    { label: 'EBITDA (est.)', value: esc(ebitda?.estimate || '—'), sub: `${esc(ebitda?.confidence || '')} confidence · ${esc(lev?.estimate || '')} leverage`, color: 'var(--amber)' },
    { label: 'Federal run-rate', value: esc(String(fed?.estimate || '—').replace(/\s*\(.*$/, '')), sub: 'vs $84–91M/yr in FY20–21 (COVID)', color: 'var(--c-fin)' },
  ]) : ui.note('Thomas Scientific filings dataset not yet available (research/thomas_filings).', 'warn')}
  ${cr ? `<div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Term-loan discount to par', sub: '100 − fair value as % of par, from Apollo BDC schedules · higher = worse', body: loanChart(ctx, cr), foot: ui.source('MFIC & MAIPL 10-Q/10-K via SEC EDGAR', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001278752', fil.meta?.generated) })}
    ${ui.panel({ title: 'Sponsor equity mark', sub: 'N-PORT fair value of a ~$5M LP stake in BSP-TS Co-Invest I', body: cr.equity.length ? charts.line([{ name: 'Fair value', color: '#ff5c5c', points: cr.equity.map(p => [qtr(p.date), p.v]) }], { h: 170, fmt: v => fmt.money(v), area: true }) + `<div class="small text-2 mt-8">From ${fmt.money(cr.equity[0].v)} (${esc(cr.equity[0].date)}) to ${fmt.money(cr.equity[cr.equity.length - 1].v)} (${esc(cr.equity[cr.equity.length - 1].date)}) — equity is marked at roughly zero.</div>` : ui.empty('No equity marks in dataset'), foot: ui.source('Barings / Cascade N-PORT via SEC EDGAR', 'https://www.sec.gov/edgar/search/', fil.meta?.generated) })}
    ${ui.panel({ title: 'Federal prime obligations by fiscal year', sub: 'The COVID swab & transport-media contracts flattered entry EBITDA', body: cr.federal.length ? charts.bar(cr.federal, { h: 170, color: 'var(--c-fin)', fmt: v => `$${fmt.num(v / 1e6, 0)}M`, highlight: d => /2020|2021/.test(d.label) }) : ui.empty('No federal series'), foot: ui.source('USASpending.gov (UEI CN1DHDM1HDZ5)', 'https://www.usaspending.gov/', fil.meta?.generated) })}
  </div>` : ''}
  <div class="mt-12">
    ${ui.panel({ title: 'Public comps — lab & healthcare distribution', sub: 'Latest FY · growth, operating margin, revenue per employee · click a row for the multi-year series', body: '<div id="fc-t"></div>', flush: true, foot: comps ? ui.source('SEC XBRL company facts (10-K)', 'https://www.sec.gov/edgar/sec-api-documentation', comps.meta?.generated) : '' })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'What the comps imply for Thomas', sub: 'Sector medians vs. Thomas estimates', accent: true, body: '<div id="fc-imp"></div>' })}</div>
  <div class="mt-12" id="fc-fil"></div></div>`;

  // comps
  const labB = comps?.meta?.sector_benchmarks?.lab_distribution; const labs = (comps?.items || []).filter(i => i.sector_tag === 'lab_distribution' || (i.secondary_sector_tags || []).includes('lab_distribution'));
  if (!comps || !labs.length) { el.querySelector('#fc-t').innerHTML = `<div style="padding:12px">${ui.note('Public comps dataset not yet available (research/public_comps).', 'warn')}</div>`; el.querySelector('#fc-imp').innerHTML = ui.empty('No comps'); }
  else {
    const rr = rangeM(rev?.estimate), er = rangeM(ebitda?.estimate);
    // revenue/employee: a ZoomInfo record if present, else est. revenue midpoint ÷ estimate-table headcount
    let zi = (fil?.items || []).map(i => i.key_figures || {}).find(k => typeof k.revenue_per_employee_usd === 'number');
    const empN = Number((String(e(/^Employees/i)?.estimate || '').match(/(\d[\d,]*)/) || [])[1]?.replace(/,/g, ''));
    if (!zi && rr && empN) zi = { revenue_per_employee_usd: Math.round(((rr[0] + rr[1]) / 2) * 1e6 / empN), _derived: true }; const tsMargin = rr && er ? [er[0] / rr[1] * 100, er[1] / rr[0] * 100] : null;
    const rows = labs.map(i => { const fy = (i.fiscal_years || []).slice(-1)[0] || {}; return { ...i, _rev: fy.revenue_usd, _emp: fy.employees }; });
    if (fil) rows.push({ id: 'ts-est', ticker: 'TS', company: 'Thomas Scientific (est.)', latest_fy: 'est.', _rev: rr ? (rr[0] + rr[1]) / 2 * 1e6 : null, revenue_growth_latest_pct: null, revenue_cagr_2023_latest_pct: null, operating_margin_latest_pct: null, operating_margin_avg_pct: null, ebitda_margin_latest_pct: tsMargin ? (tsMargin[0] + tsMargin[1]) / 2 : null, revenue_per_employee_usd: zi?.revenue_per_employee_usd ?? null, _est: true });
    const mx = Math.max(10, ...rows.flatMap(r => [r.revenue_growth_latest_pct, r.operating_margin_latest_pct, r.ebitda_margin_latest_pct].map(v => Math.abs(v || 0))));
    const dv = (v, good = 0) => v == null ? '<span class="dim">—</span>' : `<span class="dv"><i style="${v >= 0 ? `left:50%;width:${(v / mx) * 50}%` : `left:${50 - (Math.abs(v) / mx) * 50}%;width:${(Math.abs(v) / mx) * 50}%`};background:${v >= good ? 'var(--green)' : 'var(--red)'}"></i></span>${pctTxt(fmt, v)}`;
    const cols = [
      { key: 'ticker', label: 'Company', fmt: (v, r) => `${fmt.chip(v, r._est ? C : 'var(--c-fin)')} <b>${esc(fmt.title(r.company))}</b>${r.status_note ? `<div class="dim small" title="${esc(r.status_note)}">${esc(String(r.status_note).slice(0, 64))}…</div>` : ''}` },
      { key: 'latest_fy', label: 'FY', num: true },
      { key: '_rev', label: 'Revenue', num: true, fmt: (v, r) => `${fmt.money(v)}${r._est ? ' <span class="dim">est.</span>' : ''}` },
      { key: 'revenue_growth_latest_pct', label: 'Growth', num: true, fmt: v => dv(v) },
      { key: 'revenue_cagr_2023_latest_pct', label: 'CAGR 23→', num: true, fmt: v => pctTxt(fmt, v) },
      { key: 'operating_margin_latest_pct', label: 'Op. margin', num: true, fmt: v => dv(v) },
      { key: 'ebitda_margin_latest_pct', label: 'EBITDA mgn', num: true, fmt: (v, r) => r._est && tsMargin ? `<span title="range ${fmt.num(tsMargin[0], 1)}–${fmt.num(tsMargin[1], 1)}%">${dv(v)} <span class="dim">est.</span></span>` : dv(v) },
      { key: 'revenue_per_employee_usd', label: 'Rev / employee', num: true, fmt: (v, r) => `${fmt.money(v)}${r._est && v ? ' <span class="dim">est.</span>' : ''}` },
    ];
    ui.table(el.querySelector('#fc-t'), { columns: cols, rows, pageSize: 10, sortKey: 'revenue_per_employee_usd', exportName: 'ts_lab_distribution_comps', rowKey: r => r.ticker, onRow: r => r._est ? null : openComp(ctx, r) });
    el.querySelector('#fc-imp').innerHTML = labB ? `<div class="grid grid-2"><div><div class="mgrid">${ui.kpi({ label: 'Median growth', value: pctTxt(fmt, labB.median_revenue_growth_latest_pct), sub: `3-yr CAGR ${pctTxt(fmt, labB.median_revenue_cagr_2023_latest_pct)}`, color: 'var(--accent)' })}${ui.kpi({ label: 'Median op. margin', value: pctTxt(fmt, labB.median_operating_margin_latest_pct), sub: `multi-yr avg ${pctTxt(fmt, labB.median_operating_margin_multiyear_avg_pct)}`, color: 'var(--accent)' })}${ui.kpi({ label: 'Median EBITDA margin', value: pctTxt(fmt, labB.median_ebitda_margin_latest_pct), sub: tsMargin ? `TS est. ${fmt.num(tsMargin[0], 0)}–${fmt.num(tsMargin[1], 0)}%` : '', color: C })}${ui.kpi({ label: 'Median rev / employee', value: fmt.money(labB.median_revenue_per_employee_usd), sub: zi ? `TS est. ${fmt.money(zi.revenue_per_employee_usd)} (${zi._derived ? 'mid-revenue ÷ ~headcount' : 'ZoomInfo, modeled'})` : '', color: C })}</div><div class="prose small mt-12">${esc(labB.what_this_implies_for_bsp || '')}</div></div><div>${actList(esc, [{ h: 'Grow gross margin, not volume', d: 'Peer end-markets are growing only ~2% a year. Private-label mix and account penetration (see Parent accounts) are the levers that move EBITDA.', href: '#/ts/accounts', go: 'Accounts' }, { h: 'Get the real P&L', d: 'Every Thomas figure here is inferred from lender marks. Request monthly gross profit by customer archetype from management to replace the estimates.' }, { h: 'Watch the next marks', d: 'The MFIC 10-Q for 2026-09-30 (due early Nov 2026) will show whether the loan mark falls below 88% of par or goes on non-accrual. Set a PRG review for that week.' }])}</div></div>` : ui.note('Sector benchmark not in dataset.', 'warn');
  }
  // filings table + financial picture (shared component)
  // renderFilings expects meta.sources_summary as an array; thomas_filings ships a string → normalize a shallow copy.
  // Several items nest key_figures by period ({'2023-03-31': {...}}), which the shared table would print as [object Object] → flatten to readable strings.
  const flat = v => v == null ? '' : Array.isArray(v) ? v.map(flat).join(', ') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k.replace(/_/g, ' ')} ${typeof x === 'object' && x ? `(${flat(x)})` : typeof x === 'number' ? x.toLocaleString() : x}`).join('; ') : v;
  const flatKf = kf => Object.fromEntries(Object.entries(kf || {}).map(([k, v]) => [k, v && typeof v === 'object' ? flat(v) : v]));
  const filN = fil ? { ...fil, items: (fil.items || []).map(it => ({ ...it, key_figures: flatKf(it.key_figures) })), meta: { ...(fil.meta || {}), sources_summary: Array.isArray(fil.meta?.sources_summary) ? fil.meta.sources_summary : String(fil.meta?.sources_summary || '').split(/\.\s+/).filter(Boolean) } } : null;
  renderFilings(ctx, el.querySelector('#fc-fil'), { data: filN, color: C, title: 'Thomas Scientific' });
}
function loanChart(ctx, cr) {
  const { charts, fmt, esc } = ctx; const dates = [...new Set([...cr.mfic.map(x => x[0]), ...cr.maipl.map(x => x[0])])].sort();
  const mm = new Map(cr.mfic), mp = new Map(cr.maipl);
  const disc = p => p ? 100 - p.pct : null;
  const series = [{ name: 'MFIC (discount to par, pp)', color: '#f5b73d', points: dates.map(d => [qtr(d), disc(mm.get(d))]) }];
  if (cr.maipl.length) series.push({ name: 'MAIPL (discount to par, pp)', color: '#8bd3ff', points: dates.map(d => [qtr(d), disc(mp.get(d))]) });
  if (!cr.last) return ctx.ui.empty('No loan marks parsed from dataset');
  return charts.line(series, { h: 170, fmt: v => `${fmt.num(v, 0)}pp` }) + `<div class="legend mt-8">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div><div class="small text-2 mt-8">Held near par through 2025 (with PIK from Q4-2024), then marked to ${fmt.num(cr.last[1].pct, 1)}% at ${esc(cr.last[0])}.</div>`;
}
function openComp(ctx, r) {
  const { fmt, esc, inspector } = ctx; const fys = r.fiscal_years || [];
  inspector.open({ title: esc(fmt.title(r.company)), sub: `${esc(r.ticker)} · CIK ${esc(r.cik || '')} · benchmark for Thomas Scientific`, color: C,
    sections: [
      { label: 'Fiscal years', html: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>FY</th><th class="num">Revenue</th><th class="num">Op. mgn</th><th class="num">EBITDA mgn</th><th class="num">Staff</th></tr></thead><tbody>${fys.map(f => `<tr><td class="num">${esc(f.fy)}</td><td class="num">${fmt.money(f.revenue_usd)}</td><td class="num">${pctTxt(fmt, f.operating_margin_pct)}</td><td class="num">${pctTxt(fmt, f.ebitda_margin_pct)}</td><td class="num">${fmt.num(f.employees)}</td></tr>`).join('')}</tbody></table></div>` },
      { label: 'Notes', html: `<div class="small text-2">${esc([r.status_note, r.employee_note].filter(Boolean).join(' ') || 'GAAP as reported; EBITDA = operating income + D&A.')}</div>` },
      { label: 'Read-across', html: `<div class="small text-2">${/HSIC|PDCO|AVTR/.test(r.ticker) ? 'A pure distributor: this is Thomas’s margin ceiling unless private-label mix rises.' : 'A manufacturer-distributor: its margins show the value of proprietary product, which is the private-label argument for Thomas.'}</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small">${fmt.link(r.tenk_url, `${r.tenk_form || '10-K'} filed ${r.tenk_filed || ''}`)}${fmt.link(r.source_url, 'XBRL company facts')}</div>` },
    ], actions: [r.tenk_url ? { label: 'Open 10-K ↗', href: r.tenk_url } : null].filter(Boolean) });
}

export default {
  id: 'ts', name: 'Thomas Scientific', tag: 'Lab supply', color: C, group: 'Portfolio',
  tagline: 'Lab supplies & equipment distribution — research, biopharma, clinical diagnostics, cleanroom',
  hq: HQ,
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'accounts', name: 'Parent accounts', icon: '▦', render: accounts },
    { id: 'sites', name: 'Site explorer', icon: '⌖', render: sites },
    { id: 'targets', name: 'Add-on targets', icon: '◎', render: targetsView },
    { id: 'filings', name: 'Filings & financials', icon: '§', render: filings },
  ],
  tour: [
    { order: 500, hash: '#/ts/overview', caption: '<b>Thomas Scientific.</b> 27.5K scored lab & hospital sites; 713 Pursue sites hold ~$4B of 2023 Medicare-allowed lab spend.', narration: 'Thomas Scientific: seven hundred Pursue sites hold about four billion dollars of Medicare-allowed lab spend. That is the target-account list.', duration: 8500 },
    { order: 510, hash: '#/ts/sites?label=Pursue', caption: '<b>Site explorer:</b> filter to a call list by state, archetype and priority, then export it to the CRM.', narration: 'The site explorer turns the map into a call list, filtered by state, archetype and priority, and exported to the CRM.', duration: 9000 },
    { order: 520, hash: '#/ts/filings', caption: '<b>Credit file:</b> lenders mark the loan at 88% of par and equity near zero. Growth in target accounts is the path out.', narration: 'The credit file is sobering: the loan is marked at eighty-eight percent of par. Target-account growth is the way out.', duration: 8500 },
  ],
};
