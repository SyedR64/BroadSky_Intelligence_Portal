/* LabOS product page — demo + value math. Account health uses aggregated portal data (no names). */
import { esc, num, PRODUCTS, STOCK, catById, search, aggregateSites, SITES_FALLBACK, toast, reveal, mountChat, badgeEst } from './shared.js?v=20261009192122';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const M = v => v == null || isNaN(v) ? '—' : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1)}M` : Math.abs(v) >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`;
const EST = '<span class="sys-est">est.</span>';
const ILL = '<span class="sys-est sys-est--illus">illustrative</span>';
let Data, EV = null, COMPS = null;
const ev = id => (EV?.items || []).find(x => x.id === id);
const srcLink = (u, t) => u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t);

/* fallbacks mirror the LabOS assumption in the OS program evidence file so the page never renders empty */
const RA_FALLBACK = { investment_usd: [2e6, 4e6], time_to_value_months: [9, 18], ebitda_impact_pct_revenue: [.5, 1.5], ebitda_impact_usd: [1.25e6, 4.8e6], multiple_expansion_turns: [.5, 1], revenue_basis_usd: [250e6, 320e6], current_ebitda_estimate: '$25-35M (low confidence)', revenue_source: 'Thomas Scientific public filings, estimate table', label: 'Analyst assumption, not a forecast or company guidance' };
const ra = () => ev('ra-ts') || RA_FALLBACK;

/* ── Hero KPIs ─────────────────────────────────────────────────────────── */
function heroKpis() {
  const k1 = ev('kb-ts-1'), k2 = ev('kb-ts-2'), r = ra();
  const items = [
    { k: 'Digital share of transactions', v: `${k1?.target ?? 80}%`, s: 'Avantor FY2025 bar; Thomas baseline not disclosed', src: srcLink(k1?.source_url, 'Avantor 10-K'), bar: k1?.target ?? 80 },
    { k: 'eProcurement share of connected orders', v: `${k2?.target ?? 40}%`, s: 'Grainger, Q4 2025', src: srcLink(k2?.source_url, 'Digital Commerce 360'), bar: k2?.target ?? 40 },
    { k: 'EBITDA impact', v: `+${r.ebitda_impact_pct_revenue[0]}–${r.ebitda_impact_pct_revenue[1]} pts${EST}`, s: `${M(r.ebitda_impact_usd[0])}–${M(r.ebitda_impact_usd[1])} on ${M(r.revenue_basis_usd[0])}–${M(r.revenue_basis_usd[1])} revenue`, src: 'OS program evidence, LabOS assumption', bar: null },
  ];
  $('[data-os-kpis]').innerHTML = items.map(i => `<div class="sys-kpi" role="listitem"><span class="sys-kpi-label">${esc(i.k)}</span><span class="sys-kpi-value">${i.v}</span>${i.bar != null ? `<i class="ts-osk-bar" style="--w:${i.bar}%"></i>` : '<i class="ts-osk-bar dash"></i>'}<span class="sys-kpi-sub">${esc(i.s)}</span><span class="sys-kpi-sub">Source: ${i.src}</span></div>`).join('');
}

/* ── Modules ───────────────────────────────────────────────────────────── */
const MI = {
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4M9 9h4M9 12h3"/>',
  punch: '<path d="M4 5h9v14H4z"/><path d="M13 12h7m-3-3 3 3-3 3"/>',
  vmi: '<path d="M4 7h16v12H4z"/><path d="M4 11h16M9 7V4h6v3"/>',
  spend: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  health: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  copilot: '<path d="M12 3a6 6 0 0 1 6 6c0 4-6 12-6 12S6 13 6 9a6 6 0 0 1 6-6z"/><circle cx="12" cy="9" r="2"/>',
};
const MODULES = [
  { i: 'search', t: 'AI product search', d: 'Understands specs, units, CAS numbers and competitor part numbers. Returns the in-stock match plus approved substitutes.', k: 'Search-to-cart conversion' },
  { i: 'punch', t: 'Punchout & B2B commerce', d: 'Contract catalogs inside Coupa, Ariba and Jaggaer; quick reorder, account hierarchies and PO/invoice flow.', k: 'Digital share of orders' },
  { i: 'vmi', t: 'VMI & replenishment', d: 'Min/max by stockroom, scan-based counts, service-level-driven reorder points and auto-drafted POs.', k: 'Stock-outs · cost-to-serve' },
  { i: 'spend', t: 'Supplier consolidation', d: 'Shows a lab its spend across suppliers and models the savings of consolidating the tail onto one contract.', k: 'Share of wallet' },
  { i: 'health', t: 'Account-health scoring', d: 'Scores every account and lab site on fit, footprint, volume and data coverage; routes plays to reps.', k: 'Net revenue retention' },
  { i: 'copilot', t: 'Rep & quote copilot', d: 'Drafts quotes from a pasted BOM, flags cross-sell gaps and books the next QBR from the health score.', k: 'Quote turnaround' },
];
function modules() { $('[data-modules]').innerHTML = MODULES.map((m, i) => `<article class="sys-card" data-reveal><div class="ts-mod-h"><svg viewBox="0 0 24 24" aria-hidden="true">${MI[m.i]}</svg><span class="sys-num">0${i + 1}</span></div><h3 class="sys-card-title">${esc(m.t)}</h3><p class="sys-card-body">${esc(m.d)}</p><span class="sys-card-foot ts-mod-k"><span>Moves: <b>${esc(m.k)}</b></span></span></article>`).join(''); }

/* ── Demo: tabs ────────────────────────────────────────────────────────── */
const drawn = {};
function tabs() {
  const app = $('[data-app]');
  const show = id => {
    $$('[role=tab]', app).forEach(t => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    $$('[data-panel]', app).forEach(p => p.hidden = p.dataset.panel !== id);
    if (!drawn[id]) { drawn[id] = true; ({ health: demoHealth, search: demoSearch, vmi: demoVmi, spend: demoSpend })[id](); }
  };
  $('.ts-app-tabs', app).addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) show(t.dataset.tab); });
  $('.ts-app-tabs', app).addEventListener('keydown', e => { if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return; const ts = $$('[role=tab]', app); const i = ts.findIndex(t => t.getAttribute('aria-selected') === 'true'); const n = ts[(i + (e.key === 'ArrowRight' ? 1 : -1) + ts.length) % ts.length]; n.focus(); show(n.dataset.tab); });
  show('health');
}

/* ── Demo 1: account health (parent accounts + lab sites, aggregated) ───── */
async function demoHealth() {
  const el = $('[data-panel="health"]');
  el.innerHTML = `<div class="ts-loading"><i></i>Loading 500 parent accounts…</div>`;
  let P;
  try { P = await Data.load('ts_parents'); } catch (e) { el.innerHTML = `<p class="ts-sm">Account data is not available right now.</p>`; return; }
  P = P.map((p, i) => ({ id: `Account ${String(i + 1).padStart(3, '0')}`, vert: p.vert, sites: p.sites || 1, states: (p.states || []).length || 1, cov: String(p.coverage || '').split('|').filter(Boolean).length, band: p.cms_band, score: p.score, vol: p.max_cms_allowed || 0 }));
  const lv = P.map(p => Math.log10(Math.max(1, p.vol))), lmin = Math.min(...lv), lmax = Math.max(...lv);
  const smin = Math.min(...P.map(p => p.score)), smax = Math.max(...P.map(p => p.score));
  const maxSites = Math.max(...P.map(p => p.sites)), maxStates = Math.max(...P.map(p => p.states));
  P.forEach((p, i) => { p.f = { fit: (p.score - smin) / (smax - smin || 1), foot: .6 * Math.log(p.sites) / Math.log(maxSites) + .4 * (p.states - 1) / (maxStates - 1 || 1), vol: (lv[i] - lmin) / (lmax - lmin || 1), cov: (p.cov - 1) / 3 }; });
  const W = { fit: 30, foot: 25, vol: 35, cov: 10 };
  const LAB = { fit: 'Fit (lab-type score)', foot: 'Footprint (sites · states)', vol: 'Volume proxy (CMS allowed $)', cov: 'Data coverage (registries)' };
  el.innerHTML = `<div class="ts-hl-grid">
    <div class="ts-hl-side">
      <h3>Scoring weights</h3><p class="ts-sm">Drag to re-weight; 500 parent organizations re-score instantly (scaled 0–100 across the book).</p>
      ${Object.keys(W).map(k => `<label class="ts-rng"><span>${LAB[k]}<b class="sys-num" data-wv="${k}">${W[k]}</b></span><input type="range" min="0" max="60" step="5" value="${W[k]}" data-w="${k}" aria-label="${LAB[k]} weight"></label>`).join('')}
      <div class="ts-hl-sites" data-hl-sites><div class="ts-loading"><i></i>Loading 27.5k lab sites…</div></div>
    </div>
    <div>
      <div class="ts-hl-kpis" data-hl-kpis></div>
      <div class="ts-hl-chart"><div class="ts-hl-ch-h"><h4>Health-score distribution · 500 parent accounts</h4><span class="ts-lg"><i class="b-ex"></i>Expand<i class="b-gr"></i>Grow<i class="b-pr"></i>Protect</span></div><div data-hist></div></div>
      <div class="ts-hl-tbl"><h4>Top accounts by health score · anonymized, no names</h4><div class="sys-table-wrap"><table class="sys-table ts-tbl-sm"><thead><tr><th>Account</th><th>Segment</th><th class="sys-n">Sites</th><th class="sys-n">States</th><th>Volume</th><th class="sys-n">Health</th><th>Play</th></tr></thead><tbody data-rows></tbody><caption>Source: Thomas Scientific parent accounts, Oct 2026. Demo weighting.</caption></table></div></div>
      <div class="ts-hl-detail" data-detail></div>
    </div></div>
    <p class="sys-src"><b>Source:</b> Thomas Scientific parent accounts (500 parent organizations, the top tier of the LabOS target map) and Thomas Scientific lab sites (CMS, CLIA and NPPES registries), aggregated, Oct 2026. Scores are a demo weighting, not a sales forecast.</p>`;
  const band = s => s >= 60 ? 'ex' : s >= 40 ? 'gr' : 'pr';
  const PLAY = { ex: 'Expand: punchout + VMI pilot', gr: 'Grow: standing orders + category gaps', pr: 'Protect: QBR + service review' };
  let sel = null;
  const run = () => {
    const tw = Object.values(W).reduce((a, b) => a + b, 0) || 1;
    P.forEach(p => { p.raw = Object.keys(W).reduce((a, k) => a + W[k] * p.f[k], 0) / tw; });
    const rmin = Math.min(...P.map(p => p.raw)), rmax = Math.max(...P.map(p => p.raw));
    P.forEach(p => { p.h = Math.round(100 * (p.raw - rmin) / (rmax - rmin || 1)); p.b = band(p.h); });
    const S = P.slice().sort((a, b) => b.h - a.h);
    const cnt = { ex: 0, gr: 0, pr: 0 }; P.forEach(p => cnt[p.b]++);
    const exSites = P.filter(p => p.b === 'ex').reduce((a, p) => a + p.sites, 0);
    $('[data-hl-kpis]', el).innerHTML = [['Expand', cnt.ex, `${num(exSites)} sites`, 'ex'], ['Grow', cnt.gr, 'standing-order plays', 'gr'], ['Protect', cnt.pr, 'QBR cadence', 'pr'], ['Median health', S[Math.floor(S.length / 2)].h, 'of 100', '']].map(([l, v, s, c]) => `<div class="ts-hk ${c}"><small>${l}</small><b class="sys-num">${v}</b><span>${s}</span></div>`).join('');
    const bins = Array.from({ length: 20 }, () => ({ ex: 0, gr: 0, pr: 0 })); P.forEach(p => bins[Math.min(19, Math.floor(p.h / 5))][p.b]++);
    const mx = Math.max(...bins.map(b => b.ex + b.gr + b.pr)) || 1; const H = 150, bw = 100 / 20;
    $('[data-hist]', el).innerHTML = `<svg viewBox="0 0 100 ${H / 3 + 8}" preserveAspectRatio="none" class="ts-hist" role="img" aria-label="Histogram of account health scores">${bins.map((b, i) => { let y = H / 3; return ['pr', 'gr', 'ex'].map(k => { const h = b[k] / mx * (H / 3 - 2); y -= h; return h ? `<rect x="${i * bw + .4}" y="${y}" width="${bw - .8}" height="${h}" class="b-${k}"/>` : ''; }).join(''); }).join('')}<line x1="40" x2="40" y1="0" y2="${H / 3}" class="th"/><line x1="60" x2="60" y1="0" y2="${H / 3}" class="th"/></svg><div class="ts-hist-x sys-num"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>`;
    $('[data-rows]', el).innerHTML = S.slice(0, 8).map(p => `<tr data-id="${p.id}" class="${sel === p.id ? 'on' : ''}" tabindex="0"><td class="sys-num">${p.id}</td><td>${esc(p.vert || '—')}</td><td class="sys-n">${p.sites}</td><td class="sys-n">${p.states}</td><td>${esc(p.band || '—')}</td><td class="sys-n"><span class="ts-hs b-${p.b}">${p.h}</span></td><td class="ts-play">${PLAY[p.b].split(':')[0]}</td></tr>`).join('');
    detail(sel ? P.find(p => p.id === sel) : S[0]);
  };
  const detail = p => {
    $('[data-detail]', el).innerHTML = `<div class="ts-dt-h"><div><small class="sys-num">${p.id}</small><h4>${esc(p.vert || '—')} · ${p.sites} site${p.sites > 1 ? 's' : ''} in ${p.states} state${p.states > 1 ? 's' : ''}</h4></div><span class="ts-hs big b-${p.b}">${p.h}</span></div>
      <div class="ts-dt-f">${Object.keys(W).map(k => `<div class="ts-fb"><span>${LAB[k]}</span><i style="--w:${Math.round(p.f[k] * 100)}%"></i><b class="sys-num">${Math.round(p.f[k] * 100)}</b></div>`).join('')}</div>
      <p class="ts-dt-play"><b>Recommended play:</b> ${PLAY[p.b]}. ${p.b === 'ex' ? 'Multi-site footprint justifies a punchout connection and a VMI pilot in the highest-volume site.' : p.b === 'gr' ? 'Convert the repeat consumables list to standing orders and close category gaps (cold chain, PPE).' : 'Keep service levels visible with a quarterly business review; low cost-to-serve via quick order.'}</p>`;
  };
  el.addEventListener('input', e => { const r = e.target.closest('[data-w]'); if (!r) return; W[r.dataset.w] = +r.value; $(`[data-wv="${r.dataset.w}"]`, el).textContent = r.value; run(); });
  el.addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; sel = tr.dataset.id; run(); });
  el.addEventListener('keydown', e => { const tr = e.target.closest('tr[data-id]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sel = tr.dataset.id; run(); } });
  run();
  // site-level aggregates (large file, loaded after the panel is interactive)
  try {
    const rows = await Data.load('ts_sites'); const A = aggregateSites(Array.isArray(rows) ? rows : rows.items || []);
    $$('[data-stat="sites"]').forEach(e => e.textContent = num(A.total));
    const ar = Object.entries(A.archetype).sort((a, b) => b[1] - a[1]).slice(0, 6); const amx = ar[0][1];
    const lb = A.label;
    $('[data-hl-sites]', el).innerHTML = `<h3>Site-level coverage</h3><p class="ts-sm">${num(A.total)} lab sites under ${num(A.parents)} organizations in ${A.states} states and territories.</p>
      <div class="ts-pri">${[['Pursue', lb.Pursue, 'ex'], ['Nurture', lb.Nurture, 'gr'], ['Watch', lb.Watch, 'pr']].map(([k, v, c]) => `<div class="${c}"><b class="sys-num">${num(v)}</b><span>${k}</span></div>`).join('')}</div>
      <h4>Lab archetypes</h4>${ar.map(([k, v]) => `<div class="ts-fb sm"><span title="${esc(k)}">${esc(k.replace(' laboratory', '').replace(' network', ''))}</span><i style="--w:${Math.round(v / amx * 100)}%"></i><b class="sys-num">${num(v)}</b></div>`).join('')}`;
  } catch (e) { $('[data-hl-sites]', el).innerHTML = `<p class="ts-sm">Site map unavailable; showing ${num(SITES_FALLBACK.total)} sites from the last build.</p>`; }
}

/* ── Demo 2: AI product search (mock parser over the illustrative catalog) ─ */
const EXAMPLES = ['sterile 10 mL serological pipettes, individually wrapped', 'HPLC grade methanol 4 L for cannabis potency testing', 'ISO 5 wipes for the gowning room', 'replacement -80 °C freezer, 23 cu ft', '200 µL filter tips for qPCR', 'CAS 75-05-8'];
function parseQuery(q) {
  const t = []; const s = q.toLowerCase();
  const vol = q.match(/(\d+(?:\.\d+)?)\s?(mL|ml|µL|uL|ul|L)\b/); if (vol) t.push(['Volume', `${vol[1]} ${vol[2].replace(/^u/i, 'µ').replace(/^ml$/, 'mL')}`]);
  const cas = q.match(/\b(\d{2,7}-\d{2}-\d)\b/); if (cas) t.push(['CAS', cas[1]]);
  const tmp = q.match(/(-?\d+)\s?°?\s?C\b/); if (tmp) t.push(['Temperature', `${tmp[1]} °C`]);
  const iso = s.match(/iso\s?(class\s?)?(\d)/); if (iso) t.push(['Cleanroom', `ISO Class ${iso[2]}`]);
  const gr = s.match(/\b(hplc|acs|usp|lc-ms|molecular biology)\b/); if (gr) t.push(['Grade', gr[1].toUpperCase()]);
  if (/steril/.test(s)) t.push(['Sterility', 'Sterile']);
  if (/individual/.test(s)) t.push(['Packaging', 'Individually wrapped']);
  const use = s.match(/\b(cannabis|potency|gowning|qpcr|pcr|cell culture|biobank)\b/); if (use) t.push(['Application', use[1]]);
  const sz = s.match(/(\d+)\s?cu\s?ft/); if (sz) t.push(['Capacity', `${sz[1]} cu ft`]);
  return t;
}
function demoSearch() {
  const el = $('[data-panel="search"]');
  el.innerHTML = `<div>
    <form class="ts-as-box" data-as><label class="sys-sr" for="as-q">Describe what you need</label><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/></svg><input id="as-q" value="${esc(EXAMPLES[0])}" autocomplete="off"><button class="sys-btn sys-btn--primary sys-btn--sm">Search</button></form>
    <div class="sys-chips ts-as-ex">${EXAMPLES.map(x => `<button type="button" class="sys-chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div data-as-out aria-live="polite"></div>
    <p class="sys-src"><b>Source:</b> sample screen over the illustrative concept catalog; contract prices are illustrative. In production the ranking layer is a hosted search service (Algolia in the OS program evidence) over the product catalog, with CAS and cross-reference synonyms.</p></div>`;
  const run = () => {
    const q = $('#as-q').value.trim(); const t0 = performance.now();
    const tags = parseQuery(q);
    const terms = q.replace(/[,]/g, ' ').replace(/\b(for|the|a|an|of|with|replacement|testing|room)\b/gi, ' ').replace(/\b(cas)\b/gi, ' ');
    let res = search(terms, 6); if (!res.length) res = search(q.split(/\s+/).slice(0, 2).join(' '), 6);
    const ms = Math.max(8, Math.round(performance.now() - t0 + 18));
    const price = p => { let h = 0; for (const c of p.id) h = (h * 31 + c.charCodeAt(0)) % 9973; const base = { consumables: 40, equipment: 2400, chemicals: 120, safety: 60, cleanroom: 180, coldchain: 900 }[p.cat]; return base * (0.6 + (h % 100) / 100); };
    const why = p => tags.filter(([k, v]) => `${p.name} ${p.spec} ${p.tags}`.toLowerCase().includes(String(v).toLowerCase().split(' ')[0])).map(([k]) => k);
    $('[data-as-out]', el).innerHTML = `<div class="ts-as-int"><span class="ts-sm">Interpreted as</span>${tags.length ? tags.map(([k, v]) => `<span class="sys-chip"><small>${esc(k)}</small>${esc(v)}</span>`).join('') : '<span class="sys-chip">keywords only</span>'}<span class="sys-num ts-as-ms">${res.length} results · ${ms} ms</span></div>
      ${res.length ? `<ol class="ts-as-res">${res.map((p, i) => { const c = catById(p.cat); const w = why(p); return `<li class="${i === 0 ? 'top' : ''}"><span class="ts-res-sym" style="--h:${c.hue}">${c.sym}</span><div><b>${esc(p.name)}</b><span class="ts-sm">${esc(p.spec)} · ${esc(p.pack)}</span><span class="ts-as-why">${i === 0 ? '<em class="best">Best match</em>' : ''}${w.map(x => `<em>✓ ${esc(x)}</em>`).join('')}<span class="ts-stock ${STOCK[p.stock].cls}">${STOCK[p.stock].label}</span></span></div><div class="ts-as-p"><b class="sys-num">${M(price(p))}</b><small>contract ${ILL}</small><button type="button" class="ts-add" data-add="${esc(p.id)}">${p.stock === 'quote' ? 'Quote' : 'Add'}</button></div></li>`; }).join('')}</ol>` : `<p class="ts-sm">No match in the demo catalog. In production LabOS would return a sourcing request to the specialist team.</p>`}`;
  };
  $('[data-as]', el).addEventListener('submit', e => { e.preventDefault(); run(); });
  el.addEventListener('click', e => { const b = e.target.closest('[data-ex]'); if (b) { $('#as-q').value = b.dataset.ex; run(); } const a = e.target.closest('[data-add]'); if (a) toast(`<b>Added</b> to cart: ${esc(PRODUCTS.find(p => p.id === a.dataset.add).name)} (demo)`); });
  run();
}

/* ── Demo 3: VMI dashboard (illustrative stockroom) ─────────────────────── */
const VMI_SKUS = [
  ['TS-1105-10', 'Serological pipette, 10 mL', 'case', 1.4, .5, 4, 22, 96], ['TS-2210-200', 'Filter tips, 200 µL', 'pack', 6.2, 2.1, 3, 21, 84],
  ['TS-5100-PD', 'Petri dish, 100 mm', 'case', .9, .35, 5, 9, 210], ['TS-S001-NG', 'Nitrile gloves, M', 'case', 2.3, .8, 3, 5, 72],
  ['TS-R030-IPA', 'Sterile 70% IPA spray', 'case', .7, .25, 6, 9, 118], ['TS-C100-PBS', 'PBS 10×, 1 L', '6-pack', .5, .2, 4, 6, 64],
  ['TS-3050-50', 'Conical tubes, 50 mL', 'case', .8, .3, 4, 7, 145], ['TS-R005-WP', 'ISO 5 wipes', 'case', 1.1, .4, 5, 14, 260],
];
const Z = { 90: 1.28, 95: 1.65, 98: 2.05, 99: 2.33 };
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function demoVmi() {
  const el = $('[data-panel="vmi"]'); let sl = 95, review = 7, cur = 1;
  el.innerHTML = `<div class="ts-vm-top"><div><h3>QC Microbiology · Stockroom B ${ILL}</h3><p class="ts-sm">8 VMI lines · counted by scan on Mon/Thu · supplier lead time per line</p></div>
    <div class="ts-vm-ctl"><label>Service level<select data-sl>${Object.keys(Z).map(k => `<option ${+k === sl ? 'selected' : ''} value="${k}">${k}%</option>`).join('')}</select></label><label>Review cycle<select data-rv><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option></select></label></div></div>
    <div class="ts-vm-kpis" data-vm-kpis></div>
    <div class="ts-vm-grid"><div class="sys-table-wrap"><table class="sys-table ts-tbl-sm ts-vm-t"><thead><tr><th>Line</th><th class="sys-n">On hand</th><th class="sys-n">Reorder pt</th><th>Days of cover</th><th>Status</th></tr></thead><tbody data-vm-rows></tbody><caption>Source: illustrative stockroom; usage and stock levels are illustrative.</caption></table></div>
    <div class="sys-card"><div data-vm-chart></div><button type="button" class="sys-btn sys-btn--primary sys-btn--sm sys-btn--block" data-po>Draft replenishment PO</button><div data-po-out></div></div></div>
    <p class="sys-src"><b>Method:</b> reorder point = daily usage × lead time + z × σ × √lead time (z from service level); order-up-to = reorder point + usage × review cycle. Usage and stock levels are illustrative.</p>`;
  const calc = () => VMI_SKUS.map(([id, name, uom, mu, sd, L, oh, cost]) => { const ss = Z[sl] * sd * Math.sqrt(L); const rop = mu * L + ss; const max = rop + mu * review; const st = oh <= ss ? 'crit' : oh <= rop ? 'warn' : 'ok'; return { id, name, uom, mu, sd, L, oh, cost, ss, rop, max, st, doc: oh / mu, q: Math.max(0, Math.ceil(max - oh)) }; });
  const draw = () => {
    const R = calc(); const below = R.filter(r => r.st !== 'ok'); const val = R.reduce((a, r) => a + r.oh * r.cost, 0); const avgDoc = R.reduce((a, r) => a + r.doc, 0) / R.length;
    $('[data-vm-kpis]', el).innerHTML = [['Days of cover (avg)', avgDoc.toFixed(1), ''], ['Lines below reorder point', below.length, below.length ? 'ts-warn' : ''], ['Inventory on hand', M(val), ''], ['Target service level', `${sl}%`, '']].map(([l, v, c]) => `<div><small>${l}</small><b class="sys-num ${c}">${v}</b></div>`).join('');
    const mxd = Math.max(...R.map(r => r.doc));
    $('[data-vm-rows]', el).innerHTML = R.map((r, i) => `<tr data-i="${i}" class="${i === cur ? 'on' : ''}" tabindex="0"><td><b>${esc(r.name)}</b><span class="sys-num ts-sm">${r.id}</span></td><td class="sys-n">${r.oh}</td><td class="sys-n">${r.rop.toFixed(1)}</td><td><span class="ts-doc"><i class="${r.st}" style="--w:${Math.round(r.doc / mxd * 100)}%"></i><b class="sys-num">${r.doc.toFixed(1)}d</b></span></td><td><span class="ts-pill-s ${r.st}">${{ ok: 'Healthy', warn: 'Reorder', crit: 'Critical' }[r.st]}</span></td></tr>`).join('');
    chart(R[cur]);
  };
  const chart = r => {
    const g = rng(r.id.length * 7919 + r.oh), days = 30, pts = []; let s = r.oh + r.mu * 18;
    for (let d = 0; d <= days; d++) { pts.push(s); if (d === 12) s += r.q * .8 + r.mu * 6; s = Math.max(0, s - Math.max(0, r.mu + (g() - .5) * 2 * r.sd)); }
    pts[days] = r.oh; const mx = Math.max(...pts, r.max) * 1.08; const X = d => 8 + d / days * 284, Y = v => 112 - v / mx * 100;
    $('[data-vm-chart]', el).innerHTML = `<h4>${esc(r.name)} · last 30 days</h4><svg viewBox="0 0 300 124" class="ts-vm-svg" role="img" aria-label="On-hand inventory with reorder point and safety stock">
      <rect x="8" y="${Y(r.ss)}" width="284" height="${112 - Y(r.ss)}" class="ss"/>
      <line x1="8" x2="292" y1="${Y(r.rop)}" y2="${Y(r.rop)}" class="rop"/><text x="10" y="${Y(r.rop) - 3}" class="lbl">reorder point ${r.rop.toFixed(1)}</text>
      <line x1="8" x2="292" y1="${Y(r.max)}" y2="${Y(r.max)}" class="mx"/><text x="10" y="${Y(r.max) - 3}" class="lbl">order-up-to ${r.max.toFixed(1)}</text>
      <path d="M${pts.map((v, d) => `${X(d).toFixed(1)} ${Y(v).toFixed(1)}`).join('L')}" class="oh"/><circle cx="${X(days)}" cy="${Y(r.oh)}" r="3.5" class="dot ${r.st}"/>
      <text x="8" y="122" class="lbl">30 days ago</text><text x="292" y="122" class="lbl" text-anchor="end">today · ${r.oh} ${r.uom}s</text></svg>
      <p class="ts-sm">Usage ${r.mu}/day ± ${r.sd} · lead time ${r.L} days · safety stock ${r.ss.toFixed(1)} (shaded)</p>`;
  };
  el.addEventListener('change', e => { if (e.target.matches('[data-sl]')) sl = +e.target.value; if (e.target.matches('[data-rv]')) review = +e.target.value; $('[data-po-out]', el).innerHTML = ''; draw(); });
  el.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-i]'); if (tr) { cur = +tr.dataset.i; draw(); }
    if (e.target.closest('[data-po]')) { const L = calc().filter(r => r.st !== 'ok'); $('[data-po-out]', el).innerHTML = L.length ? `<div class="ts-po"><b>PO draft · ${L.length} lines · ${M(L.reduce((a, r) => a + r.q * r.cost, 0))} ${ILL}</b><ul>${L.map(r => `<li><span class="sys-num">${r.id}</span> ${esc(r.name)}<em class="sys-num">× ${r.q}</em></li>`).join('')}</ul><small>Routed to the customer's Coupa for approval; no rep call needed.</small></div>` : `<div class="ts-po"><b>All lines above reorder point.</b><small>Nothing to replenish at this service level.</small></div>`; }
  });
  el.addEventListener('keydown', e => { const tr = e.target.closest('tr[data-i]'); if (tr && e.key === 'Enter') { cur = +tr.dataset.i; draw(); } });
  draw();
}

/* ── Demo 4: supplier consolidation (illustrative customer) ─────────────── */
const SUPPLIERS = [['Thomas Scientific', 410e3, 260, true], ['Broadline distributor A', 520e3, 340], ['Broadline distributor B', 230e3, 180], ['Cleanroom specialist', 140e3, 120], ['Chemical supplier', 160e3, 95], ['Equipment OEM direct', 210e3, 22, false, true], ['Regional PPE vendor', 70e3, 85], ['Marketplace / p-card', 95e3, 410], ['Cold-chain shipper vendor', 45e3, 60]];
function demoSpend() {
  const el = $('[data-panel="spend"]'); const st = { move: 60, save: 3, po: 75 };
  el.innerHTML = `<div class="ts-sp-grid"><div class="ts-sp-in">
    <h3>Mid-size biopharma · 3 sites ${ILL}</h3><p class="ts-sm">${M(SUPPLIERS.reduce((a, s) => a + s[1], 0))} annual lab spend across ${SUPPLIERS.length} suppliers. OEM-direct equipment stays put.</p>
    <label class="ts-rng"><span>Share of movable spend consolidated<b class="sys-num" data-v="move">${st.move}%</b></span><input type="range" min="0" max="100" step="5" value="${st.move}" data-k="move" aria-label="Share of movable spend consolidated"></label>
    <label class="ts-rng"><span>Price harmonization on moved spend<b class="sys-num" data-v="save">${st.save}%</b></span><input type="range" min="0" max="8" step=".5" value="${st.save}" data-k="save" aria-label="Price harmonization percentage"></label>
    <label class="ts-rng"><span>Customer cost per PO processed<b class="sys-num" data-v="po">$${st.po}</b></span><input type="range" min="25" max="200" step="5" value="${st.po}" data-k="po" aria-label="Cost per purchase order"></label>
    <p class="ts-xs">Harmonization and per-PO cost are assumptions for the demo, not sourced benchmarks; set them to the customer's own numbers in a live review.</p>
    </div><div data-sp-out></div></div>`;
  const draw = () => {
    const tot = SUPPLIERS.reduce((a, s) => a + s[1], 0); const movable = SUPPLIERS.filter(s => !s[3] && !s[4]); const mv = movable.reduce((a, s) => a + s[1], 0) * st.move / 100; const mvPo = movable.reduce((a, s) => a + s[2], 0) * st.move / 100;
    const tsBefore = SUPPLIERS[0][1], tsAfter = tsBefore + mv * (1 - st.save / 100);
    const poSaved = mvPo * .7, savings = mv * st.save / 100 + poSaved * st.po;
    const supAfter = SUPPLIERS.length - movable.filter((s, i) => (i + 1) / movable.length <= st.move / 100).length;
    const stack = (rows, label) => `<div class="ts-sp-bar"><span>${label}</span><div>${rows.map(([n, v, c]) => `<i class="${c}" style="--w:${(v / tot * 100).toFixed(2)}%" title="${esc(n)}: ${M(v)}"></i>`).join('')}</div></div>`;
    const before = SUPPLIERS.map((s, i) => [s[0], s[1], s[3] ? 'ts' : s[4] ? 'oem' : `o${i % 3}`]);
    const after = [['Thomas Scientific', tsAfter, 'ts'], ...SUPPLIERS.slice(1).filter(s => s[4]).map(s => [s[0], s[1], 'oem']), ...movable.map((s, i) => [s[0], s[1] * (1 - st.move / 100), `o${(i + 1) % 3}`]), ['Customer savings', mv * st.save / 100, 'sav']];
    $('[data-sp-out]', el).innerHTML = `<div class="ts-sp-k"><div><small>Thomas share of wallet</small><b class="sys-num">${Math.round(tsBefore / tot * 100)}% → ${Math.round(tsAfter / tot * 100)}%</b></div><div><small>Customer savings / yr</small><b class="sys-num">${M(savings)}</b></div><div><small>Purchase orders / yr</small><b class="sys-num">−${num(poSaved)}</b></div><div><small>Active suppliers</small><b class="sys-num">${SUPPLIERS.length} → ${supAfter}</b></div></div>
      ${stack(before, 'Today')}${stack(after, 'Consolidated')}
      <div class="ts-sp-lg"><span><i class="ts"></i>Thomas Scientific</span><span><i class="o0"></i>Other suppliers</span><span><i class="oem"></i>OEM direct</span><span><i class="sav"></i>Savings</span></div>
      <p class="ts-sp-note">Thomas revenue gained: <b class="sys-num">${M(tsAfter - tsBefore)}</b>/yr from one account ${ILL}. The review itself is the sales motion: the customer sees the savings, the rep sees the share-of-wallet gap.</p>
      <p class="sys-src"><b>Source:</b> illustrative customer; every supplier and spend figure is illustrative.</p>`;
  };
  el.addEventListener('input', e => { const r = e.target.closest('[data-k]'); if (!r) return; st[r.dataset.k] = +r.value; $(`[data-v="${r.dataset.k}"]`, el).textContent = r.dataset.k === 'po' ? `$${r.value}` : `${r.value}%`; draw(); });
  draw();
}

/* ── Thesis ────────────────────────────────────────────────────────────── */
function thesis() {
  const v18 = ev('ve-18'), v19 = ev('ve-19'), k2 = ev('kb-ts-2'), lab = COMPS?.meta?.sector_benchmarks?.lab_distribution;
  const g = lab?.median_revenue_growth_latest_pct ?? 1.5, om = lab?.median_operating_margin_latest_pct ?? 5.0;
  const bar = (rows, max) => rows.map(([l, v, c, t]) => `<div class="ts-tb"><span>${l}</span><div><i class="${c}" style="--w:${v == null ? 100 : v / max * 100}%"></i></div><b class="sys-num${t ? ' tx' : ''}">${t ?? (v == null ? '?' : v + '%')}</b></div>`).join('');
  const cards = [
    { h: 'Digital is the bar, not the edge', b: bar([['Avantor (VWR)', v18?.metric_value ?? 80, 'g'], ['Thomas Scientific', null, 'na', 'not disclosed']], 100), p: `Avantor reports ~${v18?.metric_value ?? 80}% of transactions through digital channels across 300,000+ customer locations. TS does not disclose its share, which is the first number LabOS instruments.`, s: srcLink(v18?.source_url, v18?.source_name || 'Avantor 10-K FY2025') },
    { h: 'Digital channels outgrow reps', b: bar([['Grainger digital (Endless Assortment)', v19?.metric_value ?? 15.6, 'g'], ['Grainger rep-led (High-Touch)', v19?.extra_metrics?.high_touch_growth_pct ?? 2.1, 'm']], 18), p: 'Same company, same year, same macro: the digital model grew about seven times faster than the branch and rep model.', s: srcLink(v19?.source_url, 'Grainger FY2025 results') },
    { h: 'Procurement integration is the moat', b: bar([['Grainger ePro share of connected orders', k2?.target ?? 40, 'g']], 100), p: 'Punchout and EDI put the distributor inside the customer\'s purchasing system. Switching suppliers then means re-integrating, which is what makes share sticky.', s: srcLink(k2?.source_url, 'Digital Commerce 360, Feb 2026') },
    { h: 'Volume will not carry the story', b: bar([['Lab distribution median growth', g, 'm'], ['Median operating margin', om, 'm']], 18), p: `Public lab and healthcare distributors grew a median ${g}% in their latest year at a ${om}% operating margin. Margin has to come from cost-to-serve and share of wallet.`, s: 'Public comparables, SEC XBRL filings (AVTR, TMO, HSIC, PDCO, TECH)' },
  ];
  $('[data-thesis]').innerHTML = cards.map(c => `<article class="sys-card" data-reveal><h3 class="sys-card-title">${esc(c.h)}</h3><div class="ts-tbars">${c.b}</div><p class="sys-card-body">${esc(c.p)}</p><p class="sys-src"><b>Source:</b> ${c.s}</p></article>`).join('');
}

/* ── Value math ────────────────────────────────────────────────────────── */
function value() {
  const r = ra(); const v06 = ev('ve-06');
  const typ = v06?.metric_range?.[0] ?? 6.8;
  const ebLo = 25e6, ebHi = 35e6;
  const I = { rev: (r.revenue_basis_usd[0] + r.revenue_basis_usd[1]) / 2 / 1e6, pts: (r.ebitda_impact_pct_revenue[0] + r.ebitda_impact_pct_revenue[1]) / 2, eb: 30, mult: typ, turns: r.multiple_expansion_turns[0], inv: (r.investment_usd[0] + r.investment_usd[1]) / 2 / 1e6 };
  const F = [
    ['rev', 'Revenue base', 200, 350, 5, v => `$${v}M`, `range $${r.revenue_basis_usd[0] / 1e6}–${r.revenue_basis_usd[1] / 1e6}M · Thomas Scientific public filings`],
    ['pts', 'EBITDA margin uplift', 0, 2.5, .25, v => `${(+v).toFixed(2).replace(/0$/, '')} pts`, `range ${r.ebitda_impact_pct_revenue[0]}–${r.ebitda_impact_pct_revenue[1]} pts · LabOS assumption`],
    ['eb', 'Current EBITDA', 20, 40, 1, v => `$${v}M`, `$${ebLo / 1e6}–${ebHi / 1e6}M · public filings, low confidence`],
    ['mult', 'Exit multiple (base)', 5, 11, .1, v => `${v.toFixed(1)}x`, `typical lower middle market ${typ}x · Capstone/IMAP survey`],
    ['turns', 'Re-rating from LabOS', 0, 1.5, .1, v => `+${v.toFixed(1)}x`, `range ${r.multiple_expansion_turns[0]}–${r.multiple_expansion_turns[1]}x · weak evidence for TS`],
    ['inv', 'Investment', 1, 6, .25, v => `$${v}M`, `range $${r.investment_usd[0] / 1e6}–${r.investment_usd[1] / 1e6}M · LabOS assumption`],
  ];
  $('[data-calc]').innerHTML = F.map(([k, l, mn, mx, st, f, s]) => `<label class="ts-rng"><span><span>${l}<span class="sys-est">est.</span></span><b class="sys-num" data-cv="${k}">${f(I[k])}</b></span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${I[k]}" data-c="${k}" aria-label="${l}"><small>${s}</small></label>`).join('') + `<button type="button" class="ts-link" data-reset>Reset to evidence defaults</button>`;
  const draw = () => {
    const up = I.rev * 1e6 * I.pts / 100, base = I.eb * 1e6;
    const evUp = up * I.mult, evRe = I.turns * (base + up), tot = evUp + evRe, inv = I.inv * 1e6;
    const pay = up > 0 ? inv / (up / 12) : null;
    const mx = Math.max(tot, inv) || 1;
    $('[data-calc-out]').innerHTML = `<div class="ts-vo-big"><small>Enterprise value created at exit ${EST}</small><b>${M(tot)}</b><span>${(tot / inv).toFixed(1)}× the LabOS investment · payback ${pay ? Math.round(pay) + ' months' : '—'} at full run-rate</span></div>
      <div class="ts-vo-bars">
        <div class="ts-vb"><span>EBITDA uplift × exit multiple</span><i style="--w:${evUp / mx * 100}%" class="a"></i><b class="sys-num">${M(evUp)}</b></div>
        <div class="ts-vb"><span>Re-rating × total EBITDA</span><i style="--w:${evRe / mx * 100}%" class="b"></i><b class="sys-num">${M(evRe)}</b></div>
        <div class="ts-vb"><span>Investment</span><i style="--w:${inv / mx * 100}%" class="c"></i><b class="sys-num">${M(inv)}</b></div>
      </div>
      <dl class="ts-vo-kv"><div><dt>Run-rate EBITDA uplift</dt><dd class="sys-num">${M(up)}</dd></div><div><dt>Pro forma EBITDA</dt><dd class="sys-num">${M(base + up)}</dd></div><div><dt>Share of value from EBITDA</dt><dd class="sys-num">${tot ? Math.round(evUp / tot * 100) : 0}%</dd></div></dl>
      <p class="ts-vo-note">Formula: (revenue × margin pts) × (exit multiple + re-rating) + re-rating × current EBITDA. The OS program evidence rates the multiple case <b>weak</b> and the EBITDA case <b>medium</b> for Thomas Scientific: capital structure and refinancing timing dominate exit value, so LabOS is underwritten on EBITDA and cash, and the re-rating slider is upside, not the plan.</p>`;
  };
  $('[data-calc]').oninput = (e => { const s = e.target.closest('[data-c]'); if (!s) return; const k = s.dataset.c; I[k] = +s.value; $(`[data-cv="${k}"]`).textContent = F.find(f => f[0] === k)[5](I[k]); draw(); });
  $('[data-reset]').onclick = () => value();
  draw();
  const rows = [['Investment', `${M(r.investment_usd[0])}–${M(r.investment_usd[1])}`], ['Time to value', `${r.time_to_value_months[0]}–${r.time_to_value_months[1]} months`], ['EBITDA impact', `+${r.ebitda_impact_pct_revenue[0]}–${r.ebitda_impact_pct_revenue[1]} pts · ${M(r.ebitda_impact_usd[0])}–${M(r.ebitda_impact_usd[1])}`], ['Multiple expansion', `${r.multiple_expansion_turns[0]}–${r.multiple_expansion_turns[1]}x EV/EBITDA`], ['Current EBITDA', r.current_ebitda_estimate], ['Premium ceiling', `${v06?.metric_range?.[0] ?? 6.8}x typical vs ${v06?.metric_range?.[1] ?? 9.8}x premium (${v06?.metric_value ?? 3}-turn spread)`]];
  $('[data-range]').innerHTML = `<h3 class="sys-card-title">LabOS assumption in the OS program evidence ${EST}</h3><div class="ts-rg-t">${rows.map(([k, v]) => `<div><small>${k}</small><b class="sys-num">${esc(v)}</b></div>`).join('')}</div><p class="sys-src"><b>Source:</b> OS program evidence, LabOS assumption (an analyst assumption, not a forecast or company guidance). Revenue basis: Thomas Scientific public filings, estimate table. Premium spread: ${v06 ? srcLink(v06.source_url, v06.source_name) : 'Capstone/IMAP survey'}.</p>`;
}

/* ── Stack ─────────────────────────────────────────────────────────────── */
function stack() {
  const vs = (EV?.items || []).filter(i => i.kind === 'vendor_stack' && i.company === 'ts');
  const list = vs.length ? vs : [{ vendor: 'Shopify Plus (or commercetools)', category: 'B2B commerce platform', what_it_does: 'Customer-specific catalogs, contract pricing, quick reorder.', pricing_note: 'From $2,300/month.' }, { vendor: 'Coupa (punchout / supplier network)', category: 'eProcurement connectivity', what_it_does: 'Punchout catalogs and PO/invoice flow.', pricing_note: 'Not published.' }, { vendor: 'Netstock', category: 'Inventory planning', what_it_does: 'Forecasting and replenishment.', pricing_note: '~$400-900/month.' }, { vendor: 'Algolia', category: 'Product search', what_it_does: 'Typo-tolerant, synonym-aware catalog search.', pricing_note: '$0.50 per 1,000 requests.' }];
  const MAP = { 'B2B commerce platform': 'Punchout & B2B commerce', 'eProcurement connectivity': 'Punchout & B2B commerce', 'Inventory planning': 'VMI & replenishment', 'Product search and discovery': 'AI product search' };
  $('[data-stack]').innerHTML = list.map(v => `<article class="sys-card ts-sk" data-reveal><span class="ts-sk-tag">Buy</span><span class="sys-card-label">${esc(v.category)}</span><h3 class="sys-card-title">${esc(v.vendor)}</h3><p class="sys-card-body">${esc(String(v.what_it_does || '').replace(/\bheadless\/composable builds\b/g, 'custom storefronts'))}</p><div class="ts-sk-m"><span>Powers</span><b>${esc(MAP[v.category] || 'LabOS')}</b></div><p class="sys-card-body"><b>Pricing:</b> ${esc(v.pricing_note)}</p>${v.note ? `<p class="sys-src">${esc(v.note)}</p>` : ''}${v.source_url ? `<span class="sys-card-foot"><a href="${esc(v.source_url)}" target="_blank" rel="noopener">Pricing source →</a></span>` : ''}</article>`).join('') +
    `<article class="sys-card ts-sk build" data-co="ts" data-reveal><span class="ts-sk-tag build">Build</span><span class="sys-card-label">BSP data layer</span><h3 class="sys-card-title">Account and site intelligence</h3><p class="sys-card-body">Health scores over ${num(SITES_FALLBACK.total)} lab sites and 500 scored parent organizations, rep routing, supplier-consolidation reviews and the KPI layer (digital share, ePro share, cost-to-serve). Already prototyped in the portal.</p><div class="ts-sk-m"><span>Powers</span><b>Account health · consolidation · copilot</b></div><p class="sys-card-body"><b>Cost:</b> part of the $2–4M program${EST}; no license fee.</p></article>`;
}

/* ── Roadmap ───────────────────────────────────────────────────────────── */
const LANES = [
  ['Catalog data & AI search', 1, 4, 'PIM cleanup, CAS + cross-reference synonyms, Algolia ranking', 's'],
  ['B2B commerce & quick order', 2, 7, 'Contract catalogs, account hierarchies, quick order', 'c'],
  ['Punchout: top accounts', 4, 10, 'Coupa · Jaggaer · Ariba for the top 50 accounts', 'c'],
  ['Account-health scoring in CRM', 2, 6, 'Scores from the parent-account and lab-site files, rep plays, QBR triggers', 'h'],
  ['VMI pilot → scale', 5, 12, 'Netstock + scan counts: 5 pilot stockrooms, then rollout', 'v'],
  ['Supplier-consolidation reviews', 7, 12, 'Spend reviews as the sales motion in expand accounts', 'h'],
  ['Rep comp & change management', 1, 12, 'Digital orders credit the rep; adoption dashboards', 'o'],
];
const MILES = [[4, 'Search live'], [7, 'First punchout accounts'], [9, 'Digital-share baseline +10 pts'], [12, 'Run-rate EBITDA measured']];
function roadmap() {
  $('[data-gantt]').innerHTML = `<div class="ts-gt"><div class="ts-gt-head"><span></span>${Array.from({ length: 12 }, (_, i) => `<span class="sys-num">M${i + 1}</span>`).join('')}</div>
    ${LANES.map(([n, a, b, d, c]) => `<div class="ts-gt-row"><div class="ts-gt-l"><b>${esc(n)}</b><small>${esc(d)}</small></div><div class="ts-gt-track"><i class="ts-gt-bar ${c}" style="grid-column:${a}/${b + 1}"><span class="sys-num">M${a}–${b}</span></i></div></div>`).join('')}
    <div class="ts-gt-row ts-gt-m"><div class="ts-gt-l"><b>Milestones</b></div><div class="ts-gt-track">${MILES.map(([m, t], i) => `<i class="ts-ms${i % 2 ? ' lo' : ''}" style="grid-column:${m}"><span>${esc(t)}</span></i>`).join('')}</div></div></div>
    <ol class="ts-gt-ml">${MILES.map(([m, t]) => `<li><b class="sys-num">M${m}</b>${esc(t)}</li>`).join('')}</ol>
    <p class="sys-src">Owners: the Thomas e-commerce lead and VP Sales with the PRG; spend gated on payback at each phase${EST}</p>`;
}

/* ── Risks + exit ──────────────────────────────────────────────────────── */
function risks() {
  const R = [
    ['Product data quality', 'AI search is only as good as the item master. Inconsistent units, packs and CAS fields break matching.', 'Start with the top 5,000 SKUs by revenue; supplier data feeds; measure search exit rate weekly.', 'high'],
    ['Channel conflict with reps', 'Reps resist digital orders that bypass them.', 'Digital orders credit the account owner; reps are paid on share of wallet and health, not order entry.', 'high'],
    ['Customer-side punchout lead times', 'Procurement teams control their own integration queue.', 'Prioritize accounts already on Coupa/Jaggaer; offer a hosted catalog while the integration is pending.', 'med'],
    ['Capital constraints', 'Leverage limits discretionary spend; a big-bang replatform is not affordable.', 'Vendor-first, phased spend ($2–4M est.); each phase must show payback before the next.', 'med'],
    ['ERP and pricing complexity', 'Contract price files across thousands of accounts and acquired businesses.', 'Single price service fed from the ERP; migrate acquired businesses in waves.', 'med'],
  ];
  $('[data-risks]').innerHTML = R.map(([t, d, m, s]) => `<article class="sys-card ts-rk-i"><div class="ts-rk-h"><h3 class="sys-card-title">${esc(t)}</h3><span class="ts-sev ${s}">${s === 'high' ? 'High' : 'Medium'}</span></div><p class="sys-card-body">${esc(d)}</p><p class="sys-card-body"><b>Mitigation:</b> ${esc(m)}</p></article>`).join('');
  const v06 = ev('ve-06');
  $('[data-exit]').innerHTML = [
    ['Switching costs a buyer can see', 'Punchout and VMI embed Thomas inside customers\' procurement and stockrooms. Retention stops depending on individual reps.'],
    ['Diligence-ready KPIs', 'Digital share, ePro share, account health and cost-to-serve, measured monthly from day one, replace anecdotes in the CIM.'],
    ['Margin that survives flat volume', `Lower cost-to-serve and higher share of wallet lift EBITDA even with end-market growth near ${COMPS?.meta?.sector_benchmarks?.lab_distribution?.median_revenue_growth_latest_pct ?? 1.5}%.`],
    ['A company for the next add-on', 'Acquired distributors plug into one catalog, one price service and one account model in months, not years.'],
  ].map(([h, p]) => `<li><b>${h}</b><p>${p}</p></li>`).join('') + `<li class="cap"><p>Ceiling: advisors see a ${v06?.metric_value ?? 3}-turn spread between typical (${v06?.metric_range?.[0] ?? 6.8}x) and premium (${v06?.metric_range?.[1] ?? 9.8}x) lower-middle-market deals ${v06 ? `(${srcLink(v06.source_url, 'Capstone/IMAP')})` : ''}; LabOS claims only 0.5–1.0x of it${EST}</p></li>`;
}

export async function init({ Data: D, Chat, frame }) {
  Data = D;
  [EV, COMPS] = await Promise.all([Data.research('research/serviceos_evidence'), Data.research('research/public_comps')]);
  heroKpis(); modules(); thesis(); value(); stack(); roadmap(); risks(); tabs();
  badgeEst($('main'));
  reveal(); mountChat(Chat, frame);
}
