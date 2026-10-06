import * as Copy from './copy.js?v=20261006122625';
/* Thomas Scientific — target-account intelligence, add-on screen and financial picture.
   Data: Thomas Scientific lab sites (27.5K scored sites, columnar) is the single source for every site and account number:
   parent accounts are rolled up from it, so the overview and the account list always agree.
   Thomas Scientific parent accounts (legacy top-500 account plan) only flags plan membership. Frontline and Thomas Scientific add-on targets,
   Thomas Scientific public filings, Public comparables. Lender marks and sponsor equity marks sit behind the
   BSP-only deal-team toggle on the Financials view (#/ts/filings?deal=1), never on company-facing views. */
import { renderTargets, renderFilings, fitTierOf } from '../assets/components.js?v=20261006122625';

const C = 'var(--c-ts)', HEX = '#2ecc8f';
const HQ = { lat: 39.7476, lon: -75.3105, label: 'Swedesboro, NJ' };
/* Coverage priority = v3c commercial label, adjusted: non-lab buyers excluded; national-contract parents moved to Enterprise / GPO. */
const LABELS = ['Pursue', 'Enterprise', 'Nurture', 'Watch', 'Excluded'];
const LBL_HEX = { Pursue: '#2ecc8f', Enterprise: '#9d7bff', Nurture: '#4c8dff', Watch: '#6f7f93', Excluded: '#e05c8a' };
const LBL_VAR = { Pursue: 'var(--green)', Enterprise: 'var(--purple)', Nurture: 'var(--accent)', Watch: 'var(--dim)', Excluded: 'var(--pink)' };
const LBL_DESC = { Pursue: 'named-account target', Enterprise: 'national contract / GPO / IDN', Nurture: 'marketing nurture', Watch: 'e-commerce only', Excluded: 'non-lab buyer (IDTF, imaging, cardiac monitoring)' };
const LORD = { Pursue: 0, Enterprise: 1, Nurture: 2, Watch: 3, Excluded: 4 };
const VERT_HEX = { 'Diagnostics Lab': '#2ecc8f', 'Academic Medical': '#4c8dff', Pathology: '#9d7bff', Hospital: '#f5b73d', 'Oncology Clinic': '#e05c8a', 'Diagnostic Center': '#3fd0e0' };
const LAYER = { nppes_only: 'NPPES registry only', clia_only: 'CLIA certificate only', direct_lab_cms: 'Direct lab CMS billing', hospital_cms: 'Hospital CMS (Compare)' };
const STATES50 = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const SRC = { sites: ['NPPES · CMS Provider Utilization 2023 · CLIA · Hospital Compare · PECOS', 'https://npiregistry.cms.hhs.gov/', 'legacy TS tool, Sept 2026'] };
const srcSites = ui => ui.source(...SRC.sites);
const CMS_URL = 'https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners';
const PROXY = 'test-volume proxy, not supply spend';

/* National-contract parents: subsidiaries of national lab networks and national specialty labs buy through corporate
   procurement or GPO contracts, so they are an Enterprise play, not branch-by-branch Pursue. Ownership per company
   releases (e.g. Unilab, LabOne and AmeriPath are Quest; Dianon, Esoterix and Invitae assets are Labcorp). Manual list. */
const ENT = [
  [/^(Labcorp|LABORATORY CORPORATION OF AMERICA|DIANON SYSTEMS|ESOTERIX|INTEGRATED GENETICS|MONOGRAM BIOSCIENCES|SEQUENOM|INVITAE|ENZO CLINICAL LABS)/i, 'Labcorp'],
  [/^(Quest Diagnostics|UNILAB (CORPORATION|INC)|UNILAB OF DADE|LABONE\b|AMERIPATH)/i, 'Quest Diagnostics'],
  [/^SONORA QUEST LABORATORIES/i, 'Sonora Quest (Quest / Banner Health JV)'],
  [/^(SUNRISE MEDICAL LABORATORIES|CLINICAL PATHOLOGY LABORATORIES, INC|AURORA DIAGNOSTICS$)/i, 'Sonic Healthcare USA'],
  [/^(MYRIAD GENETIC|ASSUREX HEALTH)/i, 'Myriad Genetics'],
  [/^(EXACT SCIENCES|GENOMIC HEALTH)/i, 'Exact Sciences'],
  [/^(TEMPUS AI|AMBRY GENETICS)/i, 'Tempus AI'],
  [/^BIOTHERANOSTICS/i, 'Hologic'],
  [/^FOUNDATION MEDICINE/i, 'Roche'],
  [/^(VERACYTE|CASTLE BIOSCIENCES|GUARDANT HEALTH|NATERA|CAREDX|CARIS (MPI|SCIENCE)|NEOGENOMICS|MDXHEALTH|ADAPTIVE BIOTECHNOLOGIES|AGENDIA|INTERPACE DIAGNOSTICS|BIOREFERENCE|MAYO CLINIC|MAYO COLLABORATIVE)/i, null],
];
const NON_LAB = /IMAGING|\bMRI\b|X-RAY|\bPET\b/i;
const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
function coverage(r) {
  if (r.subtype === 'Physiological Laboratory') return { label: 'Excluded', why: 'NPPES taxonomy “Physiological Laboratory” (IDTF: cardiac monitoring, sleep, imaging): not a lab-consumables buyer' };
  if (NON_LAB.test(r.name || '')) return { label: 'Excluded', why: 'Imaging centre: not a lab-consumables buyer' };
  for (const [rx, ult] of ENT) if (rx.test(r.parent || '')) return { label: 'Enterprise', ult: ult || titleCase(r.parent), why: ult ? `Part of ${ult}: buys on a corporate contract` : 'National specialty lab: buys through corporate procurement' };
  if (r.commercial_archetype_v3c === 'National or mega-system laboratory network') return { label: 'Enterprise', ult: titleCase(r.parent), why: 'National network or IDN: buys on a corporate or GPO contract' };
  return { label: r.commercial_priority_label_v3c || 'Watch', why: '' };
}

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

function injectCss() { if (!document.getElementById('css-ts')) { const l = document.createElement('link'); l.id = 'css-ts'; l.rel = 'stylesheet'; l.href = 'modules/ts.css?v=20261006122625'; document.head.appendChild(l); } }

/* ── Aggregation (computed once per session, reused by every view) ───────────── */
let AGG = null;
async function getSites(data) {
  const rows = await data.load('ts_sites');
  if (AGG && AGG.rows === rows) return AGG;
  const cnt = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
  const byParent = new Map(), byState = new Map(), byVert = new Map(), byLabel = new Map(), cmsByLabel = new Map(), byLayer = new Map(), cmsByArch = new Map(), sitesByArch = new Map(), vxl = new Map();
  let totalCms = 0, pursueCms = 0; const pursue = [], states = new Set();
  const bridge = { v3c: 0, v3cCms: 0, v3cParents: new Set(), excl: 0, exclCms: 0, ent: 0, entCms: 0 };
  for (const r of rows) {
    r._v3c = r.commercial_priority_label_v3c || 'Watch'; r._arch = r.commercial_archetype_v3c || 'Unclassified'; r._cms = Number(r.cms_allowed_2023_numeric) || 0;
    const cv = coverage(r); r._label = cv.label; r._why = cv.why || ''; r._ult = cv.ult || '';
    r.coverage_priority = r._label; r.ultimate_parent = r._ult; r.coverage_note = r._why; // CSV fields
    r._q = `${r.name || ''} ${r.city || ''} ${r.parent || ''} ${r.zip || ''} ${r.npi || ''} ${r.hosp_name || ''} ${r._ult}`.toLowerCase();
    let p = byParent.get(r.parent); if (!p) byParent.set(r.parent, p = []); p.push(r);
    cnt(byState, r.state); cnt(byVert, r.vertical); cnt(byLabel, r._label); cnt(cmsByLabel, r._label, r._cms); cnt(byLayer, r.coverage_layer || 'unknown'); cnt(cmsByArch, r._arch, r._cms); cnt(sitesByArch, r._arch); cnt(vxl, `${r.vertical}|${r._label}`);
    states.add(r.state); totalCms += r._cms;
    if (r._v3c === 'Pursue') { bridge.v3c++; bridge.v3cCms += r._cms; bridge.v3cParents.add(r.parent); if (r._label === 'Excluded') { bridge.excl++; bridge.exclCms += r._cms; } else if (r._label === 'Enterprise') { bridge.ent++; bridge.entCms += r._cms; } }
    if (r._label === 'Pursue') { pursue.push(r); pursueCms += r._cms; }
  }
  const pursueParents = new Set(pursue.map(r => r.parent)).size;
  const entRows = rows.filter(r => r._label === 'Enterprise');
  const ent = { sites: entRows.length, cms: entRows.reduce((s, r) => s + r._cms, 0), parents: new Set(entRows.map(r => r.parent)).size, ults: new Set(entRows.map(r => r._ult)).size };
  const pursueByArch = new Map(), pursueCmsByArch = new Map(), pursueParByArch = new Map(); pursue.forEach(r => { cnt(pursueByArch, r._arch); cnt(pursueCmsByArch, r._arch, r._cms); if (!pursueParByArch.has(r._arch)) pursueParByArch.set(r._arch, new Set()); pursueParByArch.get(r._arch).add(r.parent); });
  AGG = { rows, byParent, byState, byVert, byLabel, cmsByLabel, byLayer, cmsByArch, sitesByArch, vxl, totalCms, pursue, pursueCms, pursueParents, pursueByArch, pursueCmsByArch, pursueParByArch, ent, bridge, states, accounts: null,
    n50: [...states].filter(s => STATES50.has(s)).length, other: [...states].filter(s => !STATES50.has(s)) };
  return AGG;
}
/* Parent accounts = every parent with ≥1 Pursue or Enterprise site, rolled up from the site file (one definition everywhere). */
function rollup(A, plan) {
  if (A.accounts) return A.accounts;
  const planMap = new Map((plan || []).map(p => [p.parent, p])); const out = [];
  for (const [parent, ss] of A.byParent) {
    const ent = ss.find(s => s._label === 'Enterprise'); const np = ss.filter(s => s._label === 'Pursue').length;
    if (!ent && !np) continue;
    const st = [...new Set(ss.map(s => s.state).filter(Boolean))].sort(); const pl = planMap.get(parent);
    const sc = ss.map(s => s.commercial_score_v3c).filter(v => v != null), ct = ss.map(s => s.commercial_tier_v3c).filter(v => v != null);
    const vm = new Map(); ss.forEach(s => vm.set(s.vertical, (vm.get(s.vertical) || 0) + 1));
    let cms = 0, mx = 0, cmsN = 0, pcms = 0; for (const s of ss) { cms += s._cms; if (s._cms > mx) mx = s._cms; if (s._cms > 0) cmsN++; if (s._label === 'Pursue') pcms += s._cms; }
    out.push({ parent, coverage_priority: ent ? 'Enterprise' : 'Pursue', ultimate_parent: ent ? ent._ult : '', coverage_note: ent ? ent._why : '', sites: ss.length, pursue_sites: np, states: st, _nstates: st.length,
      vert: sortedEntries(vm)[0][0], _arch: dominantArch(ss), commercial_score_v3c: sc.length ? Math.max(...sc) : null, commercial_tier_v3c: ct.length ? Math.min(...ct) : null,
      cms_sites: cmsN, clia_sites: ss.filter(s => s.coverage_layer === 'clia_only').length, hosp_sites: ss.filter(s => s.hosp_name).length,
      medicare_2023_allowed: cms, medicare_2023_pursue_sites: pcms, max_cms_allowed: mx, in_top500_plan: pl ? 'yes' : '', legacy_fit_deprecated: pl?.score ?? null,
      ts_customer_status: 'CRM match pending', ts_revenue_band: '' });
  }
  return (A.accounts = out);
}
const dominantArch = sites => { if (!sites?.length) return 'Unclassified'; const m = new Map(); sites.forEach(s => m.set(s._arch, (m.get(s._arch) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; };
const sortedEntries = m => [...m.entries()].sort((a, b) => b[1] - a[1]);
const median = a => { const v = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); if (!v.length) return null; const h = Math.floor(v.length / 2); return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };
const pctTxt = (fmt, v, d = 1) => v == null || isNaN(v) ? '—' : `${fmt.num(v, d)}%`;

let _indexed = false;
function indexEntities(app, accts) {
  if (_indexed) return; _indexed = true;
  app.index(accts.slice().sort((a, b) => b.medicare_2023_allowed - a.medicare_2023_allowed).slice(0, 300).map(p => ({ label: p.parent, sub: `Thomas Scientific ${p.coverage_priority} account · ${p.sites} sites · ${p.states.slice(0, 6).join(' ')}`, href: `#/ts/accounts?q=${encodeURIComponent(p.parent)}`, kind: 'Account', color: HEX })));
}

async function loadCore(ctx) {
  try { const [A, plan] = await Promise.all([getSites(ctx.data), ctx.data.load('ts_parents').catch(() => [])]); const accounts = rollup(A, plan); indexEntities(ctx.app, accounts); return { A, accounts, plan }; }
  catch (e) { ctx.el.innerHTML = `<div class="m-ts">${ctx.ui.pageHead({ title: 'Thomas Scientific', sub: 'Site and account tables could not be loaded.' })}${ctx.ui.note(`Thomas Scientific site tables are unavailable (${ctx.esc(e.message)}). Check Thomas Scientific lab sites.`, 'warn')}</div>`; return null; }
}

/* ── Shared renderers ─────────────────────────────────────────────────────── */
/* Full-field CSV next to the table footer (the shared table exports only visible columns). Re-attached after each re-render. */
function fullCsv(ui, host, getRows, cols, name) {
  const add = () => { const tf = host.querySelector('.tbl-foot'); if (!tf || tf.querySelector('[data-fcsv]')) return; const b = document.createElement('button'); b.className = 'btn xs'; b.dataset.fcsv = '1'; b.textContent = '⇩ CSV'; b.title = 'Export the filtered set with all fields'; b.onclick = () => ui.exportCSV(getRows(), cols, name); tf.insertBefore(b, tf.children[1] || null); };
  add(); new MutationObserver(add).observe(host, { childList: true });
}
const nm = (ctx, s) => ctx.esc(ctx.fmt.title(s || ''));
const labelChip = (fmt, l) => fmt.chip(l || 'Watch', LBL_VAR[l] || 'var(--dim)');
const actList = (esc, items) => `<div class="acts">${items.map((a, i) => `<div class="act"><span class="n">${i + 1}</span><div><div class="h">${a.h}</div><div class="d">${a.d}</div></div>${a.href ? `<a class="go" href="${esc(a.href)}">${esc(a.go || 'Open')} →</a>` : '<span></span>'}</div>`).join('')}</div>`;
const sitePopup = (ctx, r) => `<b>${nm(ctx, r.name)}</b><br>${ctx.esc(r.city || '')}, ${ctx.esc(r.state || '')} · ${ctx.esc(r.vertical || '')}<br>Score ${ctx.esc(r.score)} · ${ctx.esc(r._label)}${r._cms ? ` · ${ctx.fmt.money(r._cms)} Medicare 2023` : ''}<br><span class="muted">${ctx.esc(r._arch)}</span>`;

const nextAction = (r) => ({
  Pursue: 'Assign a named owner this week; check Thomas ERP for an existing ship-to (customer or new logo), confirm current distributor and open quotes, then book a lab-manager call',
  Enterprise: `Route to strategic accounts: sell through ${r._ult || 'the corporate'} procurement as a qualified secondary source (backorders, specialty and cleanroom items); no branch-level field calls`,
  Nurture: 'Add to a nurture sequence (samples + private-label price sheet); re-score when CMS 2024 utilization is released',
  Watch: 'Watch list: serve through e-commerce; no field time until a trigger (new CLIA test menu, expansion, distributor change)',
  Excluded: 'No coverage: this NPI bills for diagnostic testing that does not consume lab supplies (IDTF / imaging / remote monitoring)',
}[r._label] || 'Qualify before assigning coverage');

function openSite(ctx, r) {
  const { fmt, ui, esc, inspector, app } = ctx; const pl = playFor(r._arch);
  const npiUrl = r.npi ? `https://npiregistry.cms.hhs.gov/provider-view/${encodeURIComponent(r.npi)}` : null;
  inspector.open({ title: nm(ctx, r.name), sub: `${esc(r.city || '')}, ${esc(r.state || '')} ${esc(r.zip || '')} · ${esc(r.vertical || '')} · rank #${esc(r.rank)}`, color: C,
    sections: [
      { label: 'Coverage', html: `<div class="m-ts"><div class="ikpis">${ui.kpi({ label: 'Commercial v3c', value: esc(r.commercial_score_v3c ?? '—'), sub: `tier ${esc(r.commercial_tier_v3c ?? '—')} · ${esc(r._v3c)}`, color: LBL_VAR[r._label] })}${ui.kpi({ label: 'Medicare 2023', value: r._cms ? fmt.money(r._cms) : '—', sub: 'CMS allowed · test-volume proxy', color: 'var(--c-fin)' })}${ui.kpi({ label: 'Legacy fit', value: esc(r.score ?? '—'), sub: 'deprecated score', color: 'var(--dim)' })}</div><div class="mt-8">${labelChip(fmt, r._label)} ${fmt.chip(r._arch, C)}</div>${r._why ? `<div class="dim small mt-8">${esc(r._why)}${r._v3c !== r._label ? ` (v3c label was ${esc(r._v3c)}).` : '.'}</div>` : ''}</div>` },
      { label: 'Site profile', html: ui.kv({ Parent: `${nm(ctx, r.parent)} <span class="dim small">(${fmt.num(r.sites)} sites)</span>`, 'Ultimate parent': r._ult ? esc(r._ult) : null, Subtype: esc(r.subtype), 'Buyer angle': esc(r.angle), Phone: r.phone ? `<a href="tel:${esc(String(r.phone).replace(/[^\d+]/g, ''))}">${esc(r.phone)}</a>` : null, NPI: r.npi ? fmt.link(npiUrl, r.npi) : null, 'Evidence layer': esc(LAYER[r.coverage_layer] || r.coverage_layer), 'CMS band': esc(r.cms_band), 'Thomas customer?': '<span class="dim">CRM match pending</span>' }) },
      r.hosp_name ? { label: 'Hospital (CMS Hospital Compare)', html: ui.kv({ Hospital: nm(ctx, r.hosp_name), Type: esc(r.hosp_type), 'Star rating': r.hosp_rating != null ? `${esc(r.hosp_rating)} / 5` : null, 'Inpatient discharges': r.ip_discharges ? fmt.num(r.ip_discharges) : null, 'Hospital band': esc(r.hosp_band) }) } : null,
      r._label === 'Excluded' ? null : { label: `Recommended play · ${r._label === 'Enterprise' ? 'Corporate contract' : pl.motion}`, html: `<div class="small text-2">${esc(r._label === 'Enterprise' ? PLAYS['National or mega-system laboratory network'].play : pl.play)}</div><div class="dim small mt-8">Owner: ${esc(r._label === 'Enterprise' ? 'Strategic accounts' : pl.owner)}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${esc(nextAction(r))}${r.phone && r._label === 'Pursue' ? ` · call ${esc(r.phone)}` : ''}.</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small">${npiUrl ? `<a href="${esc(npiUrl)}" target="_blank" rel="noopener">NPPES NPI registry record</a>` : ''}<a href="${CMS_URL}" target="_blank" rel="noopener">CMS Medicare utilization 2023</a><a href="https://qcor.cms.gov/" target="_blank" rel="noopener">CMS CLIA (QCOR)</a>${r.hosp_name ? '<a href="https://data.cms.gov/provider-data/topics/hospitals" target="_blank" rel="noopener">CMS Hospital Compare</a>' : ''}</div><div class="dim small mt-8">Location = Census ZCTA centroid for ${esc(r.zip || '—')} (not street address). Medicare allowed is billed test volume, a proxy for consumables demand, not supply spend.</div>` },
    ].filter(Boolean),
    actions: [npiUrl ? { label: 'NPI record ↗', href: npiUrl } : null, { id: 'ts-parent', label: 'Parent account', onClick: () => app.go('ts', 'accounts', { q: r.parent }) }, { id: 'ts-psites', label: 'All parent sites', onClick: () => app.go('ts', 'sites', { parent: r.parent }) }].filter(Boolean) });
}

function openParent(ctx, p, A) {
  const { fmt, ui, esc, inspector, app } = ctx;
  const sites = (A.byParent.get(p.parent) || []).slice().sort((a, b) => (LORD[a._label] - LORD[b._label]) || ((b.commercial_score_v3c || 0) - (a.commercial_score_v3c || 0)) || (b._cms - a._cms));
  const top = sites.slice(0, 50); const arch = p._arch || dominantArch(sites); const isEnt = p.coverage_priority === 'Enterprise';
  const pl = isEnt ? { ...PLAYS['National or mega-system laboratory network'], motion: 'Corporate contract · secondary source' } : playFor(arch);
  const lead = sites.find(s => s._label === 'Pursue') || top[0];
  inspector.open({ title: nm(ctx, p.parent), sub: `${esc(p.vert || '')} · ${esc(p.states.slice(0, 12).join(', '))}${p.states.length > 12 ? '…' : ''} · ${esc(p.coverage_priority)}`, color: C,
    sections: [
      { label: 'Account', html: `<div class="m-ts"><div class="ikpis">${ui.kpi({ label: 'Sites', value: fmt.num(p.sites), sub: `${fmt.num(p.pursue_sites)} Pursue`, color: C })}${ui.kpi({ label: 'Commercial v3c', value: esc(p.commercial_score_v3c ?? '—'), sub: `best site · tier ${esc(p.commercial_tier_v3c ?? '—')}`, color: LBL_VAR[p.coverage_priority] })}${ui.kpi({ label: 'Medicare 2023', value: fmt.money(p.medicare_2023_allowed), sub: 'all sites · test-volume proxy', color: 'var(--c-fin)' })}</div><div class="mt-8">${labelChip(fmt, p.coverage_priority)}${p.in_top500_plan ? ` ${fmt.chip('Top-500 plan subset', 'var(--accent)')}` : ''}</div>${p.coverage_note ? `<div class="dim small mt-8">${esc(p.coverage_note)}.</div>` : ''}</div>` },
      { label: 'Profile', html: ui.kv({ 'Ultimate parent': p.ultimate_parent ? esc(p.ultimate_parent) : '<span class="dim">Independent (not mapped to a national network)</span>', 'Dominant archetype': esc(arch), Vertical: esc(p.vert), States: p.states.map(s => esc(s)).join(', '), 'Billing CMS / CLIA-only / hospital sites': `${fmt.num(p.cms_sites)} / ${fmt.num(p.clia_sites)} / ${fmt.num(p.hosp_sites)}`, 'Largest-site Medicare 2023': fmt.moneyFull(p.max_cms_allowed), 'Thomas customer?': '<span class="dim">CRM match pending: pull ERP bill-to / ship-to history</span>', 'Legacy fit (deprecated)': p.legacy_fit_deprecated != null ? esc(p.legacy_fit_deprecated) : null }) },
      { label: `Sites (top ${top.length} of ${sites.length} by priority, score)`, html: top.length ? `<div class="m-ts"><div class="slist">${top.map((r, i) => `<div class="si" data-site="${i}"><div class="t">${nm(ctx, r.name)}</div><div class="v">${esc(r._label)}</div><div class="s">${esc(r.city || '')}, ${esc(r.state || '')} · ${esc(r.subtype || r.vertical || '')}</div><div class="v">${r._cms ? fmt.money(r._cms) : '—'}</div></div>`).join('')}</div></div>` : ui.empty('No matching rows in the site file') },
      { label: `Recommended play · ${pl.motion}`, html: `<div class="small text-2">${esc(pl.play)}</div><div class="dim small mt-8">Owner: ${esc(isEnt ? 'Strategic accounts' : pl.owner)}</div>` },
      { label: 'Next action', html: `<div class="small text-2">${isEnt ? `Route to strategic accounts; open through ${esc(p.ultimate_parent || 'corporate')} procurement or the GPO contract rather than site by site.` : `Assign a named owner; pull Thomas ERP purchase history for this parent (customer or new logo, and at what share of wallet?); open with the highest-scoring Pursue site${lead ? ` (${nm(ctx, lead.name)}, ${esc(lead.city || '')}${lead.phone ? ` · ${esc(lead.phone)}` : ''})` : ''}.`}</div>` },
      { label: 'Sources', html: `<div class="col gap-4 small"><a href="https://npiregistry.cms.hhs.gov/" target="_blank" rel="noopener">NPPES NPI registry</a><a href="${CMS_URL}" target="_blank" rel="noopener">CMS Medicare utilization 2023</a><a href="https://qcor.cms.gov/" target="_blank" rel="noopener">CMS CLIA (QCOR)</a></div><div class="dim small mt-8">Account rolled up from the site file; v3c scores from the legacy Thomas Scientific target-account tool; national-network ownership mapped manually from company releases.</div>` },
    ],
    actions: [{ id: 'ts-map', label: 'Sites on map', onClick: () => app.go('ts', 'sites', { parent: p.parent }) }, { id: 'ts-csv', label: '⇩ Sites CSV', onClick: () => ui.exportCSV(sites, SITE_EXPORT, `ts_${String(p.parent).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}_sites`) }] });
  document.querySelectorAll('#inspector [data-site]').forEach(d => d.onclick = () => openSite(ctx, top[Number(d.dataset.site)]));
}
const SITE_EXPORT = ['rank', 'name', 'parent', 'ultimate_parent', 'city', 'state', 'zip', 'phone', 'npi', 'vertical', 'subtype', 'coverage_priority', 'coverage_note', 'commercial_priority_label_v3c', 'commercial_score_v3c', 'commercial_tier_v3c', 'commercial_archetype_v3c', 'coverage_layer', 'cms_band', 'cms_allowed_2023_numeric', 'hosp_name', 'hosp_type', 'hosp_rating', 'ip_discharges', 'score', 'lat', 'lon'].map(key => ({ key }));

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
const monthYear = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, 15).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null; };
async function overview(ctx) {
  const { el, ui, fmt, data, maps, charts, esc } = ctx; injectCss();
  const core = await loadCore(ctx); if (!core) return; const { A, accounts } = core;
  const [ma, fil] = await Promise.all([data.research('ma_targets_fl_ts'), data.research('thomas_filings')]);
  const targets = (ma?.items || []).filter(t => t.platform === 'thomas_scientific');
  const ranked = ma?.meta?.thomas_scientific?.ranked_top_8 || [];
  const mat = fil ? monthYear(creditSeries(fil).maturity) : null;
  const B = A.bridge; const pShareCms = A.pursueCms / (A.totalCms || 1);
  const stTop = sortedEntries(A.byState); const top3 = stTop.slice(0, 3); const top3Share = top3.reduce((s, x) => s + x[1], 0) / A.rows.length;
  const plan = accounts.filter(p => p.in_top500_plan && p.coverage_priority === 'Pursue').length;
  const sub = `<b>So what:</b> ${fmt.num(A.pursueParents)} Pursue accounts (${fmt.num(A.pursue.length)} sites) bill ${fmt.money(A.pursueCms)}, ${fmt.num(pShareCms * 100, 0)}% of the universe's 2023 Medicare-allowed lab spend (a ${PROXY}). That list is small enough for named-account coverage. ${fmt.num(A.ent.parents)} national-contract parents (Quest, Labcorp and Sonic subsidiaries, national specialty labs, IDNs) move to an Enterprise / GPO play, and non-lab IDTF and imaging sites are excluded.${mat ? ` With the credit facility maturing ${esc(mat)}, revenue from these target accounts is what matters.` : ''}`;
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Thomas Scientific', sub, chips: `${fmt.chip('Lab supply distribution · est. 1900', C)}${fmt.chip('BSP since Jan 2022 (from Carlyle)')}${fmt.chip('HQ Swedesboro, NJ')}`, actions: `<a class="btn" href="#/ts/accounts">Accounts</a><a class="btn" href="#/ts/sites?label=Pursue">Pursue sites</a><a class="btn" href="#/ts/filings">Financials</a>` })}
  ${ui.kpis([
    { label: 'Pursue accounts', value: fmt.num(A.pursueParents), sub: `${fmt.num(A.pursue.length)} Pursue sites · named-account list`, color: 'var(--green)' },
    { label: 'Pursue Medicare 2023', value: fmt.money(A.pursueCms), sub: `${fmt.num(pShareCms * 100, 0)}% of universe · ${PROXY}`, color: 'var(--c-fin)' },
    { label: 'Enterprise / GPO accounts', value: fmt.num(A.ent.parents), sub: `${fmt.num(A.ent.sites)} sites · ${fmt.money(A.ent.cms)} · corporate contract`, color: 'var(--purple)' },
    { label: 'Sites scored', value: fmt.num(A.rows.length), sub: `${fmt.num(A.byLabel.get('Nurture') || 0)} Nurture · ${fmt.num(A.byLabel.get('Excluded') || 0)} non-lab excluded`, color: C },
    { label: 'States covered', value: fmt.num(A.states.size), sub: `${A.n50} states + ${A.other.map(esc).join(', ')}`, color: 'var(--cyan)' },
    { label: 'Add-on targets', value: ma ? fmt.num(targets.length) : '—', sub: ma ? `${ranked.length} ranked · top fit ${esc(ranked[0]?.fit_score ?? '—')} (${esc(String(ranked[0]?.company || '').split(/[,(]/)[0])})` : 'research pending', color: 'var(--c-ma)' },
  ])}
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Where the scored sites are', sub: 'All 27.5K sites clustered (slate) · Pursue sites (green) · add-on targets (amber) · TS HQ', body: `<div class="map tall" id="ts-ov-map"></div>`, flush: true, foot: `${srcSites(ui)} · ZCTA centroids (${fmt.num(A.rows.filter(r => r.lat == null).length)} sites unmapped)` })}
    <div class="col gap-12">
      ${ui.panel({ title: 'Coverage priority', sub: 'v3c label after two corrections: one definition used on every Thomas page', body: `<div class="m-ts">${charts.hbar(LABELS.map(l => ({ label: l, value: A.byLabel.get(l) || 0, color: LBL_VAR[l] })), { fmt: v => fmt.num(v), labelW: 80 })}
        <div class="subh">Bridge: v3c Pursue → named-account Pursue</div>
        <table class="bridge"><thead><tr><th></th><th>Sites</th><th>Medicare 2023</th></tr></thead><tbody>
          <tr><td>v3c Pursue label <span class="dim">(${fmt.num(B.v3cParents.size)} parents)</span></td><td>${fmt.num(B.v3c)}</td><td>${fmt.money(B.v3cCms)}</td></tr>
          <tr><td>− Non-lab buyers (IDTF, imaging, cardiac monitoring)</td><td>−${fmt.num(B.excl)}</td><td>−${fmt.money(B.exclCms)}</td></tr>
          <tr><td>− National-contract parents → Enterprise / GPO</td><td>−${fmt.num(B.ent)}</td><td>−${fmt.money(B.entCms)}</td></tr>
          <tr class="tot"><td>Named-account Pursue <span class="dim">(${fmt.num(A.pursueParents)} parents)</span></td><td>${fmt.num(A.pursue.length)}</td><td>${fmt.money(A.pursueCms)}</td></tr>
        </tbody></table>
        <div class="dim small mt-8">The legacy fit tier is retired: it put ${fmt.num(A.rows.filter(r => r.tier === 1).length)} of ${fmt.num(A.rows.length)} sites in Tier 1, so it did not prioritize. ${fmt.num(plan)} of the ${fmt.num(A.pursueParents)} Pursue accounts are in the legacy top-500 account plan (shown as a subset on Accounts).</div></div>`, foot: srcSites(ui) })}
      ${ui.panel({ title: 'Sites by vertical', sub: 'Share of scored sites', body: charts.donut(sortedEntries(A.byVert).map(([k, v]) => ({ label: k, value: v, color: VERT_HEX[k] })), { size: 118, thick: 16, fmt: v => fmt.compact(v) }), foot: srcSites(ui) })}
    </div>
  </div>
  <div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Top 15 states by scored sites', sub: `${top3.map(x => esc(x[0])).join(', ')} hold ${fmt.num(top3Share * 100, 0)}% of sites`, body: charts.hbar(stTop.slice(0, 15).map(([s, n]) => ({ label: s, value: n, color: s === 'NJ' || s === 'PA' ? HEX : undefined })), { fmt: v => fmt.num(v), labelW: 34, color: 'var(--accent)' }), foot: srcSites(ui) })}
    ${ui.panel({ title: '2023 Medicare-allowed spend by archetype', sub: `Where lab test volume sits (sum of CMS allowed, all sites; ${PROXY})`, body: charts.hbar(sortedEntries(A.cmsByArch).filter(x => x[1] > 0).map(([k, v]) => ({ label: k, value: v, color: HEX })), { fmt: v => fmt.money(v), labelW: 190 }) + `<div class="dim small mt-8">Top-10 parents (Labcorp, Quest, Exact Sciences…) = ${fmt.num(topShare(A) * 100, 0)}% of the total. National networks are an Enterprise / GPO secondary-source play, not a branch-by-branch share play.</div>`, foot: ui.source('CMS Medicare utilization 2023 (allowed amounts)', CMS_URL, '2023') })}
    ${ui.panel({ title: 'Priority × vertical', sub: 'Sites by coverage priority: Pursue is almost entirely diagnostics labs', body: charts.heatgrid([...A.byVert.keys()].sort((a, b) => A.byVert.get(b) - A.byVert.get(a)), ['Pursue', 'Ent.', 'Nurture', 'Watch', 'Excl.'], [...A.byVert.keys()].sort((a, b) => A.byVert.get(b) - A.byVert.get(a)).map(v => LABELS.map(l => A.vxl.get(`${v}|${l}`) || null)), { fmt: v => fmt.num(v), color: '46,204,143', max: 3000 }) + `<div class="dim small mt-8">Ent. = Enterprise / GPO · Excl. = non-lab buyer, excluded</div><div class="subh" style="margin-top:12px">Evidence behind each site</div>${charts.hbar(sortedEntries(A.byLayer).map(([k, v]) => ({ label: LAYER[k] || k, value: v, color: k === 'nppes_only' ? 'var(--dim)' : HEX })), { fmt: v => fmt.num(v), labelW: 150 })}`, foot: srcSites(ui) })}
  </div>
  <div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Levers — target-account selling motion', sub: 'What the commercial team should do with this map, in order', accent: true, body: actList(esc, levers(ctx, A, targets, ranked)) })}
    ${ui.panel({ title: 'Share-of-wallet plan', sub: 'From target list to measured revenue: Pursue accounts by archetype', body: walletPlan(ctx, A, mat), foot: `${srcSites(ui)} · plays: BSP commercial framework` })}
  </div></div>`;

  const map = maps.create(el.querySelector('#ts-ov-map'), { center: [38.6, -95.5], zoom: 4 });
  maps.points(map, A.rows, { color: '#6f8fb3', radius: 3, cluster: true, clusterZoom: 7, gridDeg: 0.9, opacity: .55, weight: 0, popup: r => sitePopup(ctx, r), onClick: r => openSite(ctx, r) });
  maps.points(map, A.pursue, { color: HEX, radius: 3.5, cluster: false, opacity: .95, weight: .5, popup: r => sitePopup(ctx, r), onClick: r => openSite(ctx, r) });
  maps.points(map, targets.filter(t => t.lat != null), { color: '#f5b73d', radius: 6, cluster: false, weight: 1.5, stroke: '#0a0e14', popup: t => `<b>${esc(t.company)}</b><br>${esc(t.hq_city || '')}, ${esc(t.state || '')} · fit ${esc(t.fit_score)}<br><a href="#/ts/targets?q=${encodeURIComponent(t.company)}">Open in add-on screen →</a>` });
  maps.marker(map, HQ.lat, HQ.lon, { color: HEX, label: 'TS HQ' });
  maps.legend(map, [{ color: '#6f8fb3', label: 'Scored sites (clustered)' }, { color: HEX, label: `Pursue sites (${fmt.num(A.pursue.length)})` }, { color: '#f5b73d', label: 'Add-on targets' }], 'Layers');
  return () => map.remove();
}
function walletPlan(ctx, A, mat) {
  const { fmt, esc } = ctx; const rows = sortedEntries(A.pursueCmsByArch);
  const tbl = `<table class="bridge wallet"><thead><tr><th>Archetype · motion</th><th>Parents</th><th>Sites</th><th>Medicare 2023</th></tr></thead><tbody>${rows.map(([a, v]) => `<tr><td><a href="#/ts/accounts?arch=${encodeURIComponent(a)}&label=Pursue">${esc(a)}</a><div class="dim small">${esc(playFor(a).motion)}</div></td><td>${fmt.num(A.pursueParByArch.get(a)?.size || 0)}</td><td>${fmt.num(A.pursueByArch.get(a) || 0)}</td><td>${fmt.money(v)}</td></tr>`).join('')}<tr class="tot"><td>Pursue total</td><td>${fmt.num(A.pursueParents)}</td><td>${fmt.num(A.pursue.length)}</td><td>${fmt.money(A.pursueCms)}</td></tr></tbody></table>`;
  return `${tbl}<div class="mt-8">${actList(esc, [
    { h: 'Tag every Pursue account: customer, lapsed or new logo', d: `Match the ${fmt.num(A.pursueParents)} parents to Thomas ERP bill-to and ship-to records and record a trailing-12-month revenue band. The account CSV carries blank customer-status and revenue-band columns for this.`, href: '#/ts/accounts', go: 'Accounts' },
    { h: 'Set a share-of-wallet baseline per archetype', d: 'Customers: wallet from test volume (Medicare is the proxy) and a target share. New logos: a first-order target and a standing-order conversion goal.' },
    { h: 'Run it in the monthly operating review', d: 'Track Pursue-account revenue, new logos won, private-label mix and fill rate, by owner.' },
  ])}</div>${mat ? `<div class="small text-2 mt-8">Facility maturity ${esc(mat)}: revenue from target accounts is what matters.</div>` : ''}`;
}
function topShare(A) { const m = new Map(); A.rows.forEach(r => m.set(r.parent, (m.get(r.parent) || 0) + r._cms)); return sortedEntries(m).slice(0, 10).reduce((s, x) => s + x[1], 0) / (A.totalCms || 1); }
function levers(ctx, A, targets, ranked) {
  const { fmt, esc } = ctx; const pa = a => A.pursueByArch.get(a) || 0; const sa = a => A.sitesByArch.get(a) || 0;
  const top = ranked[0] ? targets.find(t => t.id === ranked[0].id) : null;
  return [
    { h: `Named-account coverage on ${fmt.num(A.pursueParents)} Pursue accounts (${fmt.num(A.pursue.length)} sites)`, d: `They bill ${fmt.money(A.pursueCms)} of 2023 Medicare (${PROXY}). Assign an owner per account, tag each as customer or new logo from Thomas ERP, start with the top 50 by Medicare and track share-of-wallet monthly.`, href: '#/ts/accounts?label=Pursue', go: 'Accounts' },
    { h: `Independent clinical labs: ${fmt.num(sa('Independent clinical laboratory'))} sites, ${fmt.num(pa('Independent clinical laboratory'))} Pursue`, d: 'The long tail is where the margin is. Use inside sales and e-commerce standing orders, and lead with private label on consumables.', href: `#/ts/sites?arch=${encodeURIComponent('Independent clinical laboratory')}&label=Pursue`, go: 'Sites' },
    { h: `Regional multi-site labs: ${fmt.num(sa('Regional multi-site laboratory'))} sites, ${fmt.num(pa('Regional multi-site laboratory'))} Pursue`, d: 'Sign a network supply agreement and put VMI or consignment at the hub lab. One contract covers many ship-to sites.', href: `#/ts/sites?arch=${encodeURIComponent('Regional multi-site laboratory')}&label=Pursue`, go: 'Sites' },
    { h: `Nurture ${fmt.num(A.byLabel.get('Nurture') || 0)} sites without field time`, d: 'Run a marketing-automation nurture (samples and price sheets), then re-score on the CMS 2024 utilization release and move risers to Pursue.', href: '#/ts/sites?label=Nurture', go: 'Sites' },
    { h: `Enterprise / GPO: ${fmt.num(A.ent.parents)} national-contract accounts (${fmt.num(A.ent.sites)} sites)`, d: 'Quest, Labcorp and Sonic subsidiaries, national specialty labs (Myriad, Veracyte, Exact…) and IDNs buy on corporate contracts. Strategic accounts sells Thomas as the qualified secondary source for backorders and specialty/cleanroom items, not branch by branch.', href: '#/ts/accounts?label=Enterprise', go: 'Accounts' },
    { h: 'Close geographic white space by add-on', d: top ? `${esc(top.company)} (fit ${esc(top.fit_score)}, ${esc(top.hq_city || '')} ${esc(top.state || '')}) is the top-ranked candidate. ${esc(String(top.strategic_rationale || '').slice(0, 200))}${String(top.strategic_rationale || '').length > 200 ? '…' : ''}` : 'Match target HQs to site density to find the regions where an add-on gives the most local coverage.', href: '#/ts/targets', go: 'Targets' },
  ];
}

/* ── View 2: Accounts (rolled up from the site file) ──────────────────────── */
async function accounts(ctx) {
  const { el, ui, fmt, charts, esc, params } = ctx; injectCss();
  const core = await loadCore(ctx); if (!core) return; const { A, accounts: P } = core;
  const pursueP = P.filter(p => p.coverage_priority === 'Pursue'); const byCms = pursueP.slice().sort((a, b) => b.medicare_2023_pursue_sites - a.medicare_2023_pursue_sites);
  const top50 = byCms.slice(0, 50).reduce((s, p) => s + p.medicare_2023_pursue_sites, 0) / (A.pursueCms || 1);
  const verts = [...new Set(P.map(p => p.vert).filter(Boolean))].sort(); const sts = [...new Set(P.flatMap(p => p.states))].sort();
  const archs = [...new Set(P.map(p => p._arch))].sort(); const ults = [...new Set(P.map(p => p.ultimate_parent).filter(Boolean))].sort();
  const plan = pursueP.filter(p => p.in_top500_plan).length;
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Accounts', sub: `<b>So what:</b> ${fmt.num(pursueP.length)} Pursue accounts (${fmt.num(A.pursue.length)} Pursue sites, ${fmt.money(A.pursueCms)} of 2023 Medicare-allowed billing, the same figures as the overview) are the named-account list; the top 50 hold ${fmt.num(top50 * 100, 0)}% of that value. ${fmt.num(P.length - pursueP.length)} national-contract accounts sit in a separate Enterprise / GPO play. Work Pursue top-down by commercial score within each archetype, and tag each account as customer or new logo from Thomas ERP before assigning reps.`, chips: `${fmt.chip(`${fmt.num(pursueP.length)} Pursue`, 'var(--green)')}${fmt.chip(`${fmt.num(P.length - pursueP.length)} Enterprise / GPO`, 'var(--purple)')}${fmt.chip(`${fmt.num(plan)} in legacy top-500 plan`, 'var(--accent)')}${fmt.chip('v3c commercial model')}` })}
    <div id="ac-f"></div><div id="ac-k" class="mt-8"></div>
    <div class="grid grid-3 mt-12">
      ${ui.panel({ title: 'Accounts by dominant archetype', sub: 'Filtered set · drives the recommended play', body: '<div id="ac-arch"></div>', foot: srcSites(ui) })}
      ${ui.panel({ title: 'Footprint: sites per account', sub: 'Filtered set · multi-site accounts justify a network agreement', body: '<div id="ac-size"></div>', foot: srcSites(ui) })}
      ${ui.panel({ title: 'Top 10 by 2023 Medicare allowed', sub: `Filtered set · all of the account’s sites · ${PROXY}`, body: '<div id="ac-top"></div>', foot: ui.source('CMS Medicare utilization 2023', CMS_URL, '2023') })}
    </div>
    <div class="mt-12">${ui.panel({ title: 'Account list', sub: 'Click an account for sites, evidence and the recommended play · sortable · CSV includes blank customer-status and revenue-band columns to fill from Thomas ERP', body: '<div id="ac-t"></div>', flush: true, foot: `${srcSites(ui)} · accounts rolled up from the site file · national-network ownership mapped manually` })}</div>
    <div class="mt-12">${ui.panel({ title: 'Account plays by archetype', sub: 'Selling motion per buying centre — apply to the filtered list', accent: true, body: '<div id="ac-plays"></div>' })}</div></div>`;
  const columns = [
    { key: 'parent', label: 'Account', fmt: (v, r) => `<b>${nm(ctx, v)}</b><div class="dim small">${r.ultimate_parent && r.ultimate_parent.toLowerCase() !== String(v).toLowerCase() ? `${esc(r.ultimate_parent)} · ` : ''}${esc(r._arch)}${r.in_top500_plan ? ' · top-500 plan' : ''}</div>` },
    { key: 'coverage_priority', label: 'Coverage', fmt: v => labelChip(fmt, v), sort: (a, b) => LORD[b.coverage_priority] - LORD[a.coverage_priority] },
    { key: 'vert', label: 'Vertical', fmt: v => esc(v || '—') },
    { key: 'sites', label: 'Sites', num: true, fmt: (v, r) => `${fmt.num(v)}${r.coverage_priority === 'Pursue' && r.pursue_sites !== v ? ` <span class="dim">(${fmt.num(r.pursue_sites)} P)</span>` : ''}` },
    { key: '_nstates', label: 'States', num: true, fmt: (v, r) => `<span title="${esc(r.states.join(', '))}">${fmt.list(r.states, 3)}</span>` },
    { key: 'commercial_score_v3c', label: 'Comm. v3c', num: true, fmt: v => fmt.score(v, 'var(--green)'), width: '84px' },
    { key: 'commercial_tier_v3c', label: 'C-tier', num: true, fmt: v => fmt.chip(`T${v ?? '—'}`, v === 1 ? 'var(--green)' : 'var(--accent)') },
    { key: 'cms_sites', label: 'Billing', num: true, fmt: v => fmt.num(v) },
    { key: 'hosp_sites', label: 'Hosp.', num: true, fmt: v => fmt.num(v) },
    { key: 'medicare_2023_allowed', label: 'Medicare 2023', num: true, fmt: v => fmt.money(v) },
    { key: 'ts_customer_status', label: 'Thomas customer?', fmt: () => '<span class="dim small">CRM match pending</span>' },
  ];
  const exportCols = ['parent', 'ultimate_parent', 'coverage_priority', 'coverage_note', 'vert', '_arch', 'sites', 'pursue_sites', 'states', 'commercial_score_v3c', 'commercial_tier_v3c', 'cms_sites', 'clia_sites', 'hosp_sites', 'medicare_2023_allowed', 'medicare_2023_pursue_sites', 'max_cms_allowed', 'in_top500_plan', 'legacy_fit_deprecated', 'ts_customer_status', 'ts_revenue_band'].map(key => ({ key }));
  let tbl;
  const f = ui.filters(el.querySelector('#ac-f'), [
    { key: 'q', label: 'Search account, owner, state, archetype…', type: 'search', value: params.q || '' },
    { key: 'label', label: 'Coverage', options: ['Pursue', 'Enterprise'], value: params.label || '' },
    { key: 'vert', label: 'Vertical', options: verts, value: params.vert || '' },
    { key: 'tier', label: 'Comm. tier', options: [1, 2, 3].filter(t => P.some(p => p.commercial_tier_v3c === t)).map(t => ({ value: String(t), label: `Tier ${t}` })), value: params.tier || '' },
    { key: 'arch', label: 'Archetype', options: archs, value: params.arch || '' },
    { key: 'ult', label: 'Ultimate parent', options: ults, value: params.ult || '' },
    { key: 'state', label: 'State', options: sts, value: params.state || '' },
    { key: 'plan', label: 'Top-500 plan only', type: 'toggle', value: params.plan === '1' },
  ], apply);
  function apply(st) {
    const q = (st.q || '').toLowerCase().trim();
    const rows = P.filter(p => (!st.label || p.coverage_priority === st.label) && (!st.vert || p.vert === st.vert) && (!st.tier || String(p.commercial_tier_v3c) === st.tier) && (!st.arch || p._arch === st.arch) && (!st.ult || p.ultimate_parent === st.ult) && (!st.state || p.states.includes(st.state)) && (!st.plan || p.in_top500_plan) && (!q || `${p.parent} ${p.ultimate_parent} ${p.states.join(' ')} ${p._arch} ${p.vert}`.toLowerCase().includes(q)));
    f.setCount(`${fmt.num(rows.length)} / ${fmt.num(P.length)}`);
    const sites = rows.reduce((s, p) => s + p.sites, 0), cms = rows.reduce((s, p) => s + p.medicare_2023_allowed, 0), pcms = rows.reduce((s, p) => s + p.medicare_2023_pursue_sites, 0);
    const nP = rows.filter(p => p.coverage_priority === 'Pursue').length;
    el.querySelector('#ac-k').innerHTML = ui.kpis([
      { label: 'Accounts', value: fmt.num(rows.length), sub: `${fmt.num(nP)} Pursue · ${fmt.num(rows.length - nP)} Enterprise`, color: C },
      { label: 'Sites', value: fmt.num(sites), sub: `${fmt.num(rows.reduce((s, p) => s + p.pursue_sites, 0))} Pursue sites`, color: 'var(--accent)' },
      { label: 'Multi-state', value: fmt.num(rows.filter(p => p._nstates > 1).length), sub: 'network-agreement candidates', color: 'var(--cyan)' },
      { label: 'Medicare 2023 allowed', value: fmt.money(cms), sub: `all sites · Pursue sites ${fmt.money(pcms)} · ${PROXY}`, color: 'var(--c-fin)' },
      { label: 'Avg commercial score', value: rows.length ? fmt.num(rows.reduce((s, p) => s + (p.commercial_score_v3c || 0), 0) / rows.length, 1) : '—', sub: 'v3c best site, 0–100', color: 'var(--green)' },
      { label: 'Thomas customers', value: '—', sub: 'CRM match pending · not in dataset', color: 'var(--dim)' },
    ]);
    const am = new Map(); rows.forEach(p => am.set(p._arch, (am.get(p._arch) || 0) + 1));
    el.querySelector('#ac-arch').innerHTML = rows.length ? charts.hbar(sortedEntries(am).map(([k, v]) => ({ label: k, value: v, color: HEX })), { fmt: v => fmt.num(v), labelW: 190 }) : ui.empty('No accounts match');
    const buckets = [['1 site', p => p.sites <= 1], ['2–4', p => p.sites >= 2 && p.sites <= 4], ['5–9', p => p.sites >= 5 && p.sites <= 9], ['10–19', p => p.sites >= 10 && p.sites <= 19], ['20+', p => p.sites >= 20]];
    el.querySelector('#ac-size').innerHTML = rows.length ? charts.hbar(buckets.map(([l, fn]) => ({ label: l === '1 site' ? '1 site' : `${l} sites`, value: rows.filter(fn).length })), { color: 'var(--accent)', fmt: v => fmt.num(v), labelW: 70 }) + `<div class="dim small mt-8">${fmt.num(rows.filter(p => p.sites > 1).length)} multi-site accounts hold ${fmt.num(rows.filter(p => p.sites > 1).reduce((s, p) => s + p.sites, 0))} of ${fmt.num(sites)} sites.</div>` : ui.empty('No accounts match');
    el.querySelector('#ac-top').innerHTML = rows.length ? charts.hbar(rows.slice().sort((a, b) => b.medicare_2023_allowed - a.medicare_2023_allowed).slice(0, 10).map(p => ({ label: fmt.title(p.parent), value: p.medicare_2023_allowed, color: LBL_VAR[p.coverage_priority] })), { fmt: v => fmt.money(v), labelW: 170 }) : ui.empty('No accounts match');
    const pm = new Map(); rows.filter(p => p.coverage_priority === 'Pursue').forEach(p => pm.set(p._arch, (pm.get(p._arch) || 0) + 1));
    el.querySelector('#ac-plays').innerHTML = actList(esc, sortedEntries(pm).map(([a, n]) => { const pl = playFor(a); return { h: `${esc(a)} — ${fmt.num(n)} Pursue accounts · ${esc(pl.motion)}`, d: `${esc(pl.play)} <span class="dim">Owner: ${esc(pl.owner)}.</span>`, href: `#/ts/accounts?arch=${encodeURIComponent(a)}&label=Pursue`, go: 'Filter' }; }).concat(rows.some(p => p.coverage_priority === 'Enterprise') ? [{ h: `Enterprise / GPO — ${fmt.num(rows.filter(p => p.coverage_priority === 'Enterprise').length)} national-contract accounts · corporate contract`, d: `${esc(PLAYS['National or mega-system laboratory network'].play)} <span class="dim">Owner: Strategic accounts.</span>`, href: '#/ts/accounts?label=Enterprise', go: 'Filter' }] : []));
    if (tbl) tbl.update(rows); else { tbl = ui.table(el.querySelector('#ac-t'), { columns, rows, pageSize: 25, sortKey: 'commercial_score_v3c', rowKey: r => r.parent, onRow: r => openParent(ctx, r, A) }); }
    return rows;
  }
  const first = apply(f.state);
  // CSV: export the filtered set with every account field (incl. blank ERP columns), not just the visible columns
  fullCsv(ui, el.querySelector('#ac-t'), () => tbl.rows, exportCols, 'ts_accounts');
  if (params.q) { const hit = P.find(p => p.parent.toLowerCase() === String(params.q).toLowerCase()) || (first.length === 1 ? first[0] : null); if (hit) openParent(ctx, hit, A); }
}

/* ── View 3: Site explorer ────────────────────────────────────────────────── */
async function sites(ctx) {
  const { el, ui, fmt, charts, maps, esc, params, app } = ctx; injectCss();
  const core = await loadCore(ctx); if (!core) return; const { A } = core;
  const parent = params.parent || '';
  const sts = sortedEntries(A.byState).map(x => x[0]).sort(); const verts = sortedEntries(A.byVert).map(x => x[0]); const archs = sortedEntries(A.sitesByArch).map(x => x[0]);
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Site explorer', sub: `<b>So what:</b> filter ${fmt.num(A.rows.length)} scored lab and hospital sites down to a call list. Start with the ${fmt.num(A.pursue.length)} Pursue sites; Enterprise sites belong to national-contract accounts and are sold through corporate procurement, and non-lab IDTF / imaging sites are excluded. Green clusters contain at least one Pursue site.`, chips: parent ? `<span class="chip clear" style="--cc:${C}" id="st-clear" title="Clear parent filter">Parent: ${nm(ctx, parent)} ✕</span>` : '' })}
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
  maps.legend(map, LABELS.map(l => ({ color: LBL_HEX[l], label: l })), 'Coverage priority');
  let layer = null, tbl = null;
  const columns = [
    { key: 'rank', label: '#', num: true, width: '54px' },
    { key: 'name', label: 'Site', fmt: (v, r) => { const sub = [String(r.parent || '').toLowerCase() !== String(v || '').toLowerCase() ? nm(ctx, r.parent) : '', r.sites > 1 ? `${fmt.num(r.sites)} sites` : '', r.hosp_name ? `Hosp.: ${nm(ctx, r.hosp_name)}` : ''].filter(Boolean).join(' · '); return `<b>${nm(ctx, v)}</b>${sub ? `<div class="dim small">${sub}</div>` : ''}`; } },
    { key: 'state', label: 'Location', fmt: (v, r) => `${esc(r.city || '')}, ${esc(v || '')} <span class="dim">${esc(r.zip || '')}</span>` },
    { key: '_arch', label: 'Vertical · archetype', fmt: (v, r) => `${esc(r.vertical || '')}<div class="dim small">${esc(v)}</div>` },
    { key: 'commercial_score_v3c', label: 'Comm. v3c', num: true, fmt: v => fmt.score(v, 'var(--green)'), width: '84px' },
    { key: '_label', label: 'Coverage', fmt: v => labelChip(fmt, v), sort: (a, b) => LORD[b._label] - LORD[a._label] },
    { key: '_cms', label: 'Medicare 2023', num: true, fmt: v => v ? fmt.money(v) : '—' },
    { key: 'phone', label: 'Phone', fmt: v => `<span class="num small">${esc(v || '—')}</span>` },
  ];
  const f = ui.filters(el.querySelector('#st-f'), [
    { key: 'q', label: 'Search name, city, parent, ZIP, NPI…', type: 'search', value: params.q || '' },
    { key: 'state', label: 'State', options: sts, value: params.state || '' },
    { key: 'vertical', label: 'Vertical', options: verts, value: params.vertical || '' },
    { key: 'arch', label: 'Archetype', options: archs, value: params.arch || '' },
    { key: 'label', label: 'Coverage', options: LABELS, value: params.label || '' },
    { key: 'cms', label: 'Bills Medicare', type: 'toggle', value: params.cms === '1' },
  ], apply);
  function apply(st) {
    const q = (st.q || '').toLowerCase().trim();
    const rows = A.rows.filter(r => (!parent || r.parent === parent) && (!st.state || r.state === st.state) && (!st.vertical || r.vertical === st.vertical) && (!st.arch || r._arch === st.arch) && (!st.label || r._label === st.label) && (!st.cms || r._cms > 0) && (!q || r._q.includes(q)));
    f.setCount(`${fmt.num(rows.length)} / ${fmt.num(A.rows.length)}`);
    const cms = rows.reduce((s, r) => s + r._cms, 0), par = new Set(rows.map(r => r.parent)).size, pur = rows.filter(r => r._label === 'Pursue').length;
    el.querySelector('#st-k').innerHTML = ui.kpis([
      { label: 'Sites', value: fmt.num(rows.length), sub: `${fmt.num(rows.filter(r => r._label === 'Enterprise').length)} Enterprise · ${fmt.num(rows.filter(r => r._label === 'Excluded').length)} excluded`, color: C },
      { label: 'Parents', value: fmt.num(par), sub: 'distinct organizations', color: 'var(--accent)' },
      { label: 'Pursue sites', value: fmt.num(pur), sub: `${fmt.num(rows.filter(r => r._label === 'Nurture').length)} Nurture`, color: 'var(--green)' },
      { label: 'Medicare 2023 allowed', value: fmt.money(cms), sub: `${fmt.num(rows.filter(r => r._cms > 0).length)} sites billing · ${PROXY}`, color: 'var(--c-fin)' },
      { label: 'Hospital-linked', value: fmt.num(rows.filter(r => r.hosp_name).length), sub: 'CMS Hospital Compare match', color: 'var(--amber)' },
      { label: 'Median commercial score', value: rows.length ? fmt.num(median(rows.map(r => r.commercial_score_v3c))) : '—', sub: 'v3c, 0–100', color: 'var(--cyan)' },
    ]);
    const sm = new Map(), am = new Map(); rows.forEach(r => { sm.set(r.state, (sm.get(r.state) || 0) + 1); am.set(r._arch, (am.get(r._arch) || 0) + 1); });
    el.querySelector('#st-mix').innerHTML = rows.length ? `<div class="m-ts"><div class="subh">Top states</div>${charts.hbar(sortedEntries(sm).slice(0, 8).map(([k, v]) => ({ label: k, value: v })), { fmt: v => fmt.num(v), labelW: 34, color: 'var(--accent)' })}<div class="subh">Archetype</div>${charts.hbar(sortedEntries(am).slice(0, 6).map(([k, v]) => ({ label: k, value: v, color: HEX })), { fmt: v => fmt.num(v), labelW: 170 })}<div class="subh">Coverage priority</div>${charts.hbar(LABELS.map(l => ({ label: l, value: rows.filter(r => r._label === l).length, color: LBL_VAR[l] })), { fmt: v => fmt.num(v), labelW: 80 })}</div>` : ui.empty('No sites match these filters');
    layer?.remove();
    const pts = rows.slice().sort((a, b) => LORD[a._label] - LORD[b._label]);
    layer = maps.points(map, pts, { color: r => LBL_HEX[r._label], radius: r => r._label === 'Pursue' ? 5 : 3.5, cluster: true, clusterZoom: 8, gridDeg: pts.length > 5000 ? 0.9 : undefined, opacity: .85, weight: .5, popup: r => sitePopup(ctx, r), onClick: r => openSite(ctx, r) });
    if (rows.length && rows.length < A.rows.length) layer.fit(); else map.setView([38.6, -95.5], 4);
    tbl ? tbl.update(rows) : (tbl = ui.table(el.querySelector('#st-t'), { columns, rows, pageSize: 50, sortKey: 'commercial_score_v3c', rowKey: r => r.rank, onRow: r => openSite(ctx, r) }));
    const pl = rows.length ? playFor(sortedEntries(am)[0][0]) : null; const withPhone = rows.filter(r => r.phone).length;
    el.querySelector('#st-act').innerHTML = rows.length ? actList(esc, [
      { h: `Export the call list (${fmt.num(rows.length)} sites, ${fmt.num(withPhone)} with phone)`, d: 'Use the CSV button below the table. Load it into the CRM as a campaign, dedupe against current customers from Thomas ERP ship-to data, and assign by territory.' },
      { h: `Work Pursue first (${fmt.num(pur)}), then Nurture; route Enterprise to strategic accounts`, d: `Dominant archetype in this set: ${esc(sortedEntries(am)[0][0])}. Recommended motion: ${esc(pl.motion)}. ${esc(pl.play)}` },
      { h: 'Verify before outreach', d: 'Locations are ZIP centroids and NPPES addresses can be stale. Confirm the lab-manager contact and CLIA certificate status (QCOR) before a field visit.' },
    ]) : ui.empty('No sites match');
  }
  apply(f.state);
  fullCsv(ui, el.querySelector('#st-t'), () => tbl.rows, SITE_EXPORT, 'ts_sites_filtered');
  return () => map.remove();
}

/* ── View 4: Add-on targets ───────────────────────────────────────────────── */
async function targetsView(ctx) {
  const { el, ui, fmt, maps, esc, data, params } = ctx; injectCss();
  const ma = await data.research('ma_targets_fl_ts');
  if (!ma) { el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: 'Add-on targets', sub: 'Lab and cleanroom distributor screen for Thomas Scientific' })}${ui.note('Research dataset not yet available (Frontline and Thomas Scientific add-on targets).', 'warn')}</div>`; return; }
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
    ${ui.panel({ title: 'Ranked shortlist (top 8)', sub: 'Click to open the dossier', body: `<div id="tg-rank">${top8.map((t, i) => `<div class="rk" data-q="${esc(t.company)}"><span class="i">${esc(ranked[i]?.rank ?? i + 1)}</span><div style="min-width:0"><div class="t">${esc(t.company)}</div><div class="s">${esc(t.hq_city || '')}, ${esc(t.state || '')} · ${fmt.num(t.employees)} staff · ${fmt.money(t.revenue_est_usd)} est.</div></div>${fmt.score(t.fit_score)}</div>`).join('') || ui.empty('No ranked shortlist in dataset')}</div>`, foot: ui.source('Broad Sky add-on screen (Frontline and Thomas Scientific add-on targets)', null, ma.meta?.generated) })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'Full screen', sub: 'Filters · sortable · CSV · click a row for fit breakdown, sources and next action', body: '<div id="tg-screen"></div>', foot: `<span class="dim">${esc((ma.meta?.caveats || [])[0] || '')}</span>` })}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'PE-backed competitors for the same targets', sub: 'Who bids against Thomas for lab distributors', body: pe.length ? pe.map(p => `<div class="pcard"><div class="t">${esc(p.company)}</div><div class="s">${esc(p.hq || '')} · ${esc(p.sponsor || 'Sponsor not verified')}${p.scale ? ` · ${esc(p.scale)}` : ''}</div><div class="d">${esc(p.notes || '')}</div><div class="small mt-8">${(p.sources || []).map(s => fmt.link(s)).join(' · ')}</div></div>`).join('') : ui.empty('No competitor list in dataset'), foot: ui.source('Broad Sky add-on screen (Frontline and Thomas Scientific add-on targets) · company sites · ZoomInfo', null, ma.meta?.generated) })}
    ${ui.panel({ title: 'Company add-on history', sub: 'Pattern: regional life-science and cleanroom distributors', body: `${ui.timeline((pc.prior_acquisitions || []).slice().reverse().map(a => ({ date: (String(a).match(/\(([^)]*)\)\s*$/) || [])[1] || '', text: String(a).replace(/\s*\([^)]*\)\s*$/, '') })))}${actList(esc, [
      { h: 'Re-open the add-on engine', d: 'There has been no deal since Oct 2023. Run owner outreach on the top 8 through PRG; start with founder- and family-owned targets (lowest process risk).' },
      { h: 'Buy margin, not just revenue', d: 'Prioritize targets that add gross margin and stocking reach: private label, cleanroom, equipment service. Structure with seller notes or earn-outs where founders stay on.' },
    ])}`, foot: `<span class="src">Sources: ${(pc.sources || []).slice(0, 4).map(s => fmt.link(s)).join(' · ')}</span>` })}
  </div></div>`;
  const ctl = renderTargets(ctx, el.querySelector('#tg-screen'), { items: Copy.targets(items), color: C, platformLabel: 'Thomas Scientific', exportName: 'ts_addon_targets', pageSize: 30 });
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

/* ── View 5: Financials (company view) · deal-team view behind ?deal=1 (BSP only) ─────── */
const DEAL_ITEM = it => ['bdc_loan_schedule', 'sec_form_d', 'lender_press'].includes(it.category) || /N-PORT/i.test(it.title || '');
async function filings(ctx) {
  const { el, ui, fmt, charts, esc, data, params } = ctx; injectCss();
  const deal = params.deal === '1';
  const [fil, comps] = await Promise.all([data.research('thomas_filings'), data.research('public_comps')]);
  const cr = fil ? creditSeries(fil) : null; const e = cr ? cr.est : () => null;
  const rev = e(/Current revenue/i), ebitda = e(/Current EBITDA/i), lev = e(/Current total leverage/i), fed = e(/Federal revenue/i), eqv = e(/Sponsor common equity/i), emp = e(/^Employees/i);
  const mat = cr ? monthYear(cr.maturity) : null;
  const labB = comps?.meta?.sector_benchmarks?.lab_distribution;
  const kfs = (fil?.items || []).map(i => i.key_figures || {});
  const dcs = Math.max(0, ...kfs.map(k => Number(k.ts_distribution_centers) || 0)) || null;
  const avtr = kfs.find(k => k.revenue_change_2022_2025 && k.revenue_usd_m);
  const bspAddons = (fil?.items || []).filter(i => /BSP-era add-on/i.test(i.title || ''));
  const nAdd = Math.max(0, ...bspAddons.map(i => { const m = String(i.title || '').match(/#(\d+)(?:[–-](\d+))?/); return m ? Number(m[2] || m[1]) : 0; })) || null;
  const matDays = cr?.maturity && DATE.test(cr.maturity) ? (() => { const [y, m, d] = cr.maturity.split('-').map(Number); const n = new Date(); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5); })() : null; // calendar days, no UTC/DST drift
  const toggle = deal ? '<a class="btn" href="#/ts/filings">← Company view</a>' : '<a class="btn" href="#/ts/filings?deal=1" title="Lender marks, sponsor equity and implied leverage: BSP deal team only">Deal team view (BSP only)</a>';
  const fedNow = String(fed?.estimate || '').replace(/\s*\(.*$/, '');
  const sub = deal
    ? (cr?.last ? `<b>So what:</b> Broad Sky put ${fmt.money(cr.formD?.v)} of equity into Thomas. Apollo's BDCs now mark the unitranche at ${fmt.num(cr.last[1].pct, 1)}% of par and the sponsor common at ${esc(eqv?.estimate || '≈0')}. That implies EBITDA of ${esc(ebitda?.estimate || 'n/a')} (est.) against ${esc(lev?.estimate || 'n/a')} leverage, with maturity ${esc(fmt.date(dfix(cr.maturity)))}. The operating plan has to grow gross profit in target accounts, not just revenue.` : 'Credit and equity marks for Thomas Scientific from public filings.')
    : `<b>So what:</b> Thomas is an estimated ${esc(rev?.estimate || 'n/a')} lab-supply distributor (est., ZoomInfo-modeled) whose COVID federal revenue ($84–91M a year in FY2020–21) has normalized to ${esc(fedNow || 'n/a')}. Listed lab-distribution peers grew a median ${pctTxt(fmt, labB?.median_revenue_growth_latest_pct)} last year, so growth has to come from share-of-wallet in target accounts and private-label mix, not the market.${mat ? ` Maturity ${esc(mat)}: target-account revenue matters.` : ''}`;
  el.innerHTML = `<div class="m-ts">${ui.pageHead({ title: deal ? 'Credit and equity marks' : 'Filings and financials', sub, actions: fil ? toggle : '', chips: deal ? `${fmt.chip('BSP internal · do not forward', 'var(--red)')}${fmt.chip('SEC EDGAR · BDC schedules', C)}${fmt.chip('Form D')}${fmt.chip('Estimates are labelled est.', 'var(--amber)')}` : `${fmt.chip('USASpending', C)}${fmt.chip('SEC XBRL peers')}${fmt.chip('Company releases')}${fmt.chip('Estimates are labelled est.', 'var(--amber)')}` })}
  ${deal ? ui.note('<b>BSP deal team only.</b> This view shows lender marks, sponsor equity marks and implied EV / leverage from public BDC and N-PORT filings. Do not forward to Thomas Scientific management; use the company view for operating discussions.', 'warn') : ''}
  ${!cr ? ui.note('Thomas Scientific filings dataset not yet available (Thomas Scientific public filings).', 'warn') : deal ? ui.kpis([
    { label: 'Sponsor equity raised', value: fmt.money(cr.formD?.v), sub: `Form D · BSP-TS, LP`, color: 'var(--c-bsp)' },
    { label: 'Loan mark (MFIC)', value: `${fmt.num(cr.last?.[1].pct, 1)}%`, sub: `of par · ${esc(cr.last?.[0] || '')}`, color: (cr.last?.[1].pct || 100) < 95 ? 'var(--red)' : 'var(--green)' },
    { label: 'Maturity', value: esc(fmt.date(dfix(cr.maturity))), sub: matDays != null ? `${fmt.num(matDays)} days · refinancing window` : '', color: matDays != null && matDays < 540 ? 'var(--amber)' : 'var(--accent)' },
    { label: 'Revenue (est.)', value: esc(rev?.estimate || '—'), sub: `${esc(rev?.confidence || '')} confidence · CY2025/26`, color: C },
    { label: 'EBITDA (est.)', value: esc(ebitda?.estimate || '—'), sub: `${esc(ebitda?.confidence || '')} confidence · ${esc(lev?.estimate || '')} leverage`, color: 'var(--amber)' },
    { label: 'Federal run-rate', value: esc(fedNow || '—'), sub: 'vs $84–91M/yr in FY20–21 (COVID)', color: 'var(--c-fin)' },
  ]) : ui.kpis([
    { label: 'Revenue (est.)', value: esc(rev?.estimate || '—'), sub: `${esc(rev?.confidence || '')} confidence · ZoomInfo-modeled · CY2025/26`, color: C },
    { label: 'Employees (est.)', value: esc(String(emp?.estimate || '—').replace(/\s*\(.*$/, '')), sub: 'ZoomInfo + add-on releases', color: 'var(--accent)' },
    { label: 'Federal run-rate', value: esc(fedNow || '—'), sub: 'vs $84–91M/yr in FY20–21 (COVID)', color: 'var(--c-fin)' },
    { label: 'Add-ons under BSP', value: fmt.num(nAdd), sub: 'NCI 2022 · Quintana, Day, Arrowhead 2023', color: 'var(--c-ma)' },
    { label: 'Distribution centres', value: fmt.num(dcs), sub: 'per latest add-on release', color: 'var(--cyan)' },
    { label: 'Peer median growth', value: pctTxt(fmt, labB?.median_revenue_growth_latest_pct), sub: `listed lab distributors · op. margin ${pctTxt(fmt, labB?.median_operating_margin_latest_pct)}`, color: 'var(--green)' },
  ])}
  ${cr && deal ? `<div class="grid grid-3 mt-12">
    ${ui.panel({ title: 'Term-loan discount to par', sub: '100 − fair value as % of par, from Apollo BDC schedules · higher = worse', body: loanChart(ctx, cr), foot: ui.source('MFIC & MAIPL 10-Q/10-K via SEC EDGAR', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001278752', fil.meta?.generated) })}
    ${ui.panel({ title: 'Sponsor equity mark', sub: 'N-PORT fair value of a ~$5M LP stake in BSP-TS Co-Invest I', body: cr.equity.length ? charts.line([{ name: 'Fair value', color: '#ff5c5c', points: cr.equity.map(p => [qtr(p.date), p.v]) }], { h: 170, fmt: v => fmt.money(v), area: true }) + `<div class="small text-2 mt-8">From ${fmt.money(cr.equity[0].v)} (${esc(cr.equity[0].date)}) to ${fmt.money(cr.equity[cr.equity.length - 1].v)} (${esc(cr.equity[cr.equity.length - 1].date)}): equity is marked at roughly zero.</div>` : ui.empty('No equity marks in dataset'), foot: ui.source('Barings / Cascade N-PORT via SEC EDGAR', 'https://www.sec.gov/edgar/search/', fil.meta?.generated) })}
    ${fedPanel(ctx, cr, fil)}
  </div>` : cr ? `<div class="grid grid-2 mt-12">
    ${fedPanel(ctx, cr, fil)}
    ${ui.panel({ title: 'Closest listed peer: Avantor (VWR) revenue', sub: avtr ? `Revenue ${esc(avtr.revenue_change_2022_2025)} from 2022 to 2025 · the market is not carrying growth` : 'SEC XBRL', body: avtr ? charts.bar(Object.entries(avtr.revenue_usd_m).map(([y, v]) => ({ label: y, value: Number(v) * 1e6 })), { h: 170, color: 'var(--accent)', fmt: v => `$${fmt.num(v / 1e9, 1)}B` }) : ui.empty('No peer series'), foot: ui.source('SEC XBRL company facts (Avantor 10-K)', 'https://www.sec.gov/edgar/search/', fil.meta?.generated) })}
  </div>` : ''}
  <div class="mt-12">
    ${ui.panel({ title: 'Public comps — lab & healthcare distribution', sub: 'Latest FY · growth, operating margin, revenue per employee · click a row for the multi-year series', body: '<div id="fc-t"></div>', flush: true, foot: comps ? ui.source('SEC XBRL company facts (10-K)', 'https://www.sec.gov/edgar/sec-api-documentation', comps.meta?.generated) : '' })}
  </div>
  <div class="mt-12">${ui.panel({ title: 'What the comps imply for Thomas', sub: 'Sector medians vs. Thomas estimates', accent: true, body: '<div id="fc-imp"></div>' })}</div>
  <div class="mt-12" id="fc-fil"></div></div>`;

  // comps
  const labs = (comps?.items || []).filter(i => i.sector_tag === 'lab_distribution' || (i.secondary_sector_tags || []).includes('lab_distribution'));
  if (!comps || !labs.length) { el.querySelector('#fc-t').innerHTML = `<div style="padding:12px">${ui.note('Public comps dataset not yet available (Public comparables).', 'warn')}</div>`; el.querySelector('#fc-imp').innerHTML = ui.empty('No comps'); }
  else {
    const rr = rangeM(rev?.estimate), er = deal ? rangeM(ebitda?.estimate) : null; // company view: no EBITDA estimate (it is derived from lender marks)
    // revenue/employee: a ZoomInfo record if present, else est. revenue midpoint ÷ estimate-table headcount
    let zi = kfs.find(k => typeof k.revenue_per_employee_usd === 'number');
    const empN = Number((String(emp?.estimate || '').match(/(\d[\d,]*)/) || [])[1]?.replace(/,/g, ''));
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
    const acts = deal
      ? [{ h: 'Grow gross margin, not volume', d: 'Peer end-markets are growing only ~2% a year. Private-label mix and account penetration (see Accounts) are the levers that move EBITDA.', href: '#/ts/accounts', go: 'Accounts' }, { h: 'Get the real P&L', d: 'Every Thomas figure here is inferred from lender marks. Request monthly gross profit by customer archetype from management to replace the estimates.' }, { h: 'Watch the next marks', d: 'The MFIC 10-Q for 2026-09-30 (due early Nov 2026) will show whether the loan mark falls below 88% of par or goes on non-accrual. Set a PRG review for that week.' }]
      : [{ h: 'Grow gross margin, not volume', d: 'Peer end-markets are growing only ~2% a year. Private-label mix and account penetration (see Accounts) are the levers that move EBITDA.', href: '#/ts/accounts', go: 'Accounts' }, { h: 'Replace estimates with management figures', d: 'Revenue and headcount here are outside-in estimates. Monthly gross profit by customer archetype and by Pursue account would make this page decision-grade.' }, { h: 'Benchmark revenue per employee', d: 'Peers run at the median shown here. Track Thomas revenue per employee quarterly as the add-ons integrate.' }];
    el.querySelector('#fc-imp').innerHTML = labB ? `<div class="grid grid-2"><div><div class="mgrid">${ui.kpi({ label: 'Median growth', value: pctTxt(fmt, labB.median_revenue_growth_latest_pct), sub: `3-yr CAGR ${pctTxt(fmt, labB.median_revenue_cagr_2023_latest_pct)}`, color: 'var(--accent)' })}${ui.kpi({ label: 'Median op. margin', value: pctTxt(fmt, labB.median_operating_margin_latest_pct), sub: `multi-yr avg ${pctTxt(fmt, labB.median_operating_margin_multiyear_avg_pct)}`, color: 'var(--accent)' })}${ui.kpi({ label: 'Median EBITDA margin', value: pctTxt(fmt, labB.median_ebitda_margin_latest_pct), sub: tsMargin ? `TS est. ${fmt.num(tsMargin[0], 0)}–${fmt.num(tsMargin[1], 0)}%` : 'listed peers, latest FY', color: C })}${ui.kpi({ label: 'Median rev / employee', value: fmt.money(labB.median_revenue_per_employee_usd), sub: zi ? `TS est. ${fmt.money(zi.revenue_per_employee_usd)} (${zi._derived ? 'mid-revenue ÷ ~headcount' : 'ZoomInfo, modeled'})` : '', color: C })}</div>${deal ? `<div class="prose small mt-12">${esc(labB.what_this_implies_for_bsp || '')}</div>` : ''}</div><div>${actList(esc, acts)}</div></div>` : ui.note('Sector benchmark not in dataset.', 'warn');
  }
  // filings table + financial picture (shared component)
  // renderFilings expects meta.sources_summary as an array; thomas_filings ships a string → normalize a shallow copy.
  // Several items nest key_figures by period ({'2023-03-31': {...}}), which the shared table would print as [object Object] → flatten to readable strings.
  const flat = v => v == null ? '' : Array.isArray(v) ? v.map(flat).join(', ') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k.replace(/_/g, ' ')} ${typeof x === 'object' && x ? `(${flat(x)})` : typeof x === 'number' ? x.toLocaleString() : x}`).join('; ') : v;
  const flatKf = kf => Object.fromEntries(Object.entries(kf || {}).map(([k, v]) => [k, v && typeof v === 'object' ? flat(v) : v]));
  let filN = null;
  if (fil) {
    const m = fil.meta || {}; const srcs = Array.isArray(m.sources_summary) ? m.sources_summary : String(m.sources_summary || '').split(/\.\s+/).filter(Boolean);
    const items = (fil.items || []).filter(it => deal || !DEAL_ITEM(it)).map(it => ({ ...it, key_figures: flatKf(it.key_figures) }));
    const companyPicture = `Thomas Scientific (founded 1900, Swedesboro NJ) distributes lab supplies, equipment and cleanroom products${dcs ? ` from ${dcs} distribution centres` : ''}. Under Broad Sky (since Jan 2022) it has made four tuck-ins: North Central Instruments (Aug 2022: cleanroom, microscopy, histology), Quintana Supply and Day Associates (Aug 2023) and Arrowhead Forensics (Oct 2023). Federal prime obligations peaked at $84–91M a year in FY2020–21 on COVID swab and transport-media awards and have normalized to ${fedNow || 'a much lower level'}. ${avtr ? `The closest listed peer, Avantor (VWR), saw revenue move ${avtr.revenue_change_2022_2025} from 2022 to 2025. ` : ''}Revenue is estimated at ${rev?.estimate || 'n/a'} (ZoomInfo-modeled, low confidence). Management figures should replace every estimate on this page; the growth levers are share-of-wallet in target accounts and private-label mix.`;
    filN = { ...fil, items, meta: deal ? { ...m, sources_summary: srcs } : { ...m, financial_picture: companyPicture, sources_summary: srcs.filter(s => !/^SEC:/i.test(s)).concat(['SEC XBRL company facts (listed peers)']),
      estimate_table: (m.estimate_table || []).filter(x => /revenue|employees/i.test(x.metric || '')),
      data_gaps: (m.data_gaps || []).filter(g => !/facility|lender|rating|debt|UCC|Capital Constellation|BDC|Form D/i.test(g)),
      next_pulls: (m.next_pulls || []).filter(g => !/MFIC|MAIPL|N-PORT|UCC|Form D|recapitali/i.test(g)) } };
  }
  renderFilings(ctx, el.querySelector('#fc-fil'), { data: Copy.filings(filN), color: C, title: 'Thomas Scientific' });
}
function fedPanel(ctx, cr, fil) {
  const { ui, charts, fmt } = ctx;
  return ui.panel({ title: 'Federal prime obligations by fiscal year', sub: 'COVID swab & transport-media contracts in FY2020–21, then back to the core run-rate', body: cr.federal.length ? charts.bar(cr.federal, { h: 170, color: 'var(--c-fin)', fmt: v => `$${fmt.num(v / 1e6, 0)}M`, highlight: d => /2020|2021/.test(d.label) }) : ui.empty('No federal series'), foot: ui.source('USASpending.gov (UEI CN1DHDM1HDZ5)', 'https://www.usaspending.gov/', fil.meta?.generated) });
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
  id: 'ts', name: 'Thomas Scientific', tag: 'Labs', color: C, group: 'Portfolio',
  tagline: 'Lab supplies & equipment distribution — research, biopharma, clinical diagnostics, cleanroom',
  hq: HQ,
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'accounts', name: 'Accounts', icon: '▦', render: accounts },
    { id: 'sites', name: 'Site explorer', icon: '⌖', render: sites },
    { id: 'targets', name: 'Add-on targets', icon: '◎', render: targetsView },
    { id: 'filings', name: 'Filings and financials', icon: '§', render: filings },
  ],
  tour: [
    { order: 500, hash: '#/ts/overview', caption: '<b>Thomas Scientific.</b> 27.5K scored lab & hospital sites; 643 Pursue accounts (650 sites) bill ~$3.1B of 2023 Medicare, a test-volume proxy. National-contract labs move to an Enterprise play.', narration: 'Thomas Scientific: six hundred and forty Pursue accounts bill about three billion dollars of Medicare lab volume. That is the named-account list; national networks are a separate enterprise play.', duration: 9000 },
    { order: 505, hash: '#/ts/accounts?label=Pursue', caption: '<b>Accounts:</b> the same Pursue list rolled up to parents, with the play per archetype and a CSV ready for the customer / share-of-wallet match.', narration: 'The account list rolls the same Pursue sites up to parents, with a selling play for each archetype and an export for the customer match.', duration: 8500 },
    { order: 510, hash: '#/ts/sites?label=Pursue', caption: '<b>Site explorer:</b> filter to a call list by state, archetype and coverage priority, then export it to the CRM.', narration: 'The site explorer turns the map into a call list, filtered by state, archetype and priority, and exported to the CRM.', duration: 9000 },
    { order: 520, hash: '#/ts/filings', caption: '<b>Financials:</b> federal COVID revenue has normalized and listed peers grow ~2%, so share-of-wallet in target accounts is the growth lever.', narration: 'Federal COVID revenue has normalized and peers are barely growing, so share of wallet in target accounts is the lever.', duration: 8500 },
  ],
};
