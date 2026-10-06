/* ═══════════════════════════════════════════════════════════════════════════
   Broad Sky Operating Intelligence — landing page + concept gallery behaviour.
   No framework, no dependency on the portal runtime: the page paints without
   data, then reads counts lazily from the data files (streaming only the
   first few KB of each file to find meta.item_count).
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ROOT = new URL('../', import.meta.url).href;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fmtN = n => Number(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── data: lazy counts ─────────────────────────────────────────────────────── */
const RESEARCH = ['ai_agents_portfolio', 'bpi_filings', 'bpi_playbook', 'bsp_firm', 'cet_filings', 'cet_opportunities', 'cet_playbook', 'cet_wwtp_targets', 'design_refs', 'fairharbor_filings', 'fh_playbook', 'fl_midsize_firms', 'fl_playbook', 'frontline_filings', 'ma_targets_cet', 'ma_targets_fl_ts', 'ma_targets_pp', 'pe_landscape', 'pp_ads', 'pp_demand_model', 'pp_filings', 'pp_market', 'pp_nationwide', 'pp_storm_events', 'public_comps', 'rival_filings', 'serviceos_evidence', 'thomas_filings', 'ts_playbook', 'voice_ai'];
const SALES = ['bpi_sales_dc', 'cet_home_sales_ct_ri', 'cet_home_sales_ma', 'cet_transfers_ct_ri', 'cet_transfers_ma', 'fh_sales_nyc', 'pp_sales_nj', 'pp_sales_pa_a', 'pp_sales_pa_b', 'ts_sales_gloucester_nj'];

/** Stream a JSON file until meta.item_count (and meta.generated) appear, then cancel the download. */
async function peekMeta(url, limit = 160000) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const rxN = /"item_count"\s*:\s*(\d+)/, rxG = /"generated"\s*:\s*"(\d{4}-\d{2}-\d{2})/;
  if (!r.body || !r.body.getReader) { const t = await r.text(); return { n: +(t.match(rxN) || [])[1] || null, gen: (t.match(rxG) || [])[1] || null }; }
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const m = buf.match(rxN);
      if (m) return { n: +m[1], gen: (buf.match(rxG) || [])[1] || null };
      if (buf.length > limit) break;
    }
  } finally { reader.cancel().catch(() => {}); }
  return { n: null, gen: (buf.match(rxG) || [])[1] || null };
}
async function pool(items, fn, k = 6) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const j = i++; try { out[j] = await fn(items[j]); } catch { out[j] = null; } } }));
  return out;
}
let _stats = null;
function loadStats() {
  if (_stats) return _stats;
  _stats = (async () => {
    const [manifest, research, sales, firm] = await Promise.all([
      fetch(ROOT + 'data/manifest.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
      pool(RESEARCH, n => peekMeta(ROOT + `data/research/${n}.json`)),
      pool(SALES, n => peekMeta(ROOT + `data/sales/${n}.json`)),
      fetch(ROOT + 'data/research/bsp_firm.json', { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const R = Object.fromEntries(RESEARCH.map((n, i) => [n, research[i]]));
    const core = manifest?.datasets || [];
    const rows = n => core.find(d => d.file === `${n}.json`)?.rows;
    const resOk = research.filter(x => x && x.n != null).length, salesOk = sales.filter(x => x && x.n != null);
    if (!core.length && !resOk && !salesOk.length) throw new Error('no data reachable');
    const cnt = n => R[n]?.n || 0;
    const opps = { radar: cnt('cet_opportunities'), rfps: rows('cet_ne_rfps') || 0, bpi: firm?.bpi_opportunities?.length || 0, fh: firm?.fh_opportunities?.length || 0 };
    const gens = [manifest?.generated, ...research.map(x => x?.gen), ...sales.map(x => x?.gen)].filter(Boolean).sort();
    return {
      datasets: core.length + resOk + salesOk.length,
      datasetsSub: `${core.length} core tables · ${resOk} research files · ${salesOk.length} deed files`,
      sales: salesOk.reduce((s, x) => s + x.n, 0),
      salesSub: `home sales and commercial deeds in ${salesOk.length} county files`,
      opps: opps.radar + opps.rfps + opps.bpi + opps.fh,
      oppsSub: `CET radar ${opps.radar} · RFP log ${opps.rfps} · BPI ${opps.bpi} · FH ${opps.fh}`,
      targets: cnt('ma_targets_cet') + cnt('ma_targets_pp') + cnt('ma_targets_fl_ts'),
      targetsSub: `CET ${cnt('ma_targets_cet')} · PP ${cnt('ma_targets_pp')} · FL + TS ${cnt('ma_targets_fl_ts')}`,
      sponsors: cnt('pe_landscape'),
      sites: rows('ts_sites') || 0,
      genFrom: gens[0], genTo: gens[gens.length - 1],
    };
  })();
  return _stats;
}
const fmtDate = s => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
function countUp(el, to) {
  if (!to && to !== 0) return;
  if (reduced()) { el.textContent = fmtN(to); return; }
  const t0 = performance.now(), dur = 1100, from = 0;
  const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmtN(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function initNumbers() {
  const sec = $('#numbers'); if (!sec) return;
  let shown = false, data = null;
  const paint = () => {
    if (!shown || !data) return;
    for (const k of ['datasets', 'sales', 'opps', 'targets', 'sponsors', 'sites']) {
      if (!data[k]) continue;
      $$(`[data-stat="${k}"]`).forEach(el => el.closest('#numbers') ? countUp(el, data[k]) : (el.textContent = fmtN(data[k])));
      const sub = $(`[data-sub="${k}"]`); if (sub && data[k + 'Sub']) sub.textContent = data[k + 'Sub'];
    }
    const src = $('#numbers-src');
    if (src) { src.textContent = `Read live from data/manifest.json and the meta block of every research and deed file · data generated ${fmtDate(data.genFrom)} to ${fmtDate(data.genTo)}`; src.classList.add('ok'); }
  };
  const go = () => loadStats().then(d => { data = d; paint(); $$('.hero [data-stat="datasets"]').forEach(el => { el.textContent = fmtN(d.datasets); }); })
    .catch(() => { const src = $('#numbers-src'); if (src) src.textContent = 'Showing the Oct 6, 2026 snapshot · live counts are unavailable right now.'; });
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && e.intersectionRatio > 0) {
      if (e.target === sec && e.intersectionRatio >= .25) { shown = true; paint(); io.disconnect(); }
      go();
    }
  }), { rootMargin: '600px 0px', threshold: [0, .25] });
  io.observe(sec);
  // also start shortly after first paint so the hero eyebrow becomes live
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1800));
  idle(() => go(), { timeout: 3000 });
  // guarantee the count-up runs when the strip is actually visible
  const io2 = new IntersectionObserver(es => es.forEach(e => { if (e.intersectionRatio >= .25) { shown = true; paint(); io2.disconnect(); } }), { threshold: [.25] });
  io2.observe(sec);
}

/* ── nav ───────────────────────────────────────────────────────────────────── */
function initNav() {
  const nav = $('.nav'); if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  const btn = $('.nav-toggle'), sheet = $('#nav-sheet');
  if (btn && sheet) {
    btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') !== 'true'; btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); sheet.hidden = !open; });
    sheet.addEventListener('click', e => { if (e.target.closest('a')) { btn.setAttribute('aria-expanded', 'false'); sheet.hidden = true; } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { sheet.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
  }
}

/* ── reveal on scroll ──────────────────────────────────────────────────────── */
function initReveal(sel) {
  if (reduced() || !('IntersectionObserver' in window)) return;
  const els = $$(sel).filter(el => el.getBoundingClientRect().top > window.innerHeight * .9);
  els.forEach((el, i) => { el.classList.add('rv'); el.style.transitionDelay = `${(i % 3) * 70}ms`; });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach(el => io.observe(el));
}

/* ── chat bridge ───────────────────────────────────────────────────────────── */
let chat = null; const pending = [];
function scrollToChat(focus = true) {
  const host = $('#hero-chat'); if (!host) return;
  const y = host.getBoundingClientRect().top + window.scrollY - 110;
  window.scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
  if (focus) setTimeout(() => $('#hero-chat textarea')?.focus({ preventScroll: true }), reduced() ? 0 : 450);
}
function ask(q) {
  scrollToChat(false);
  if (chat) setTimeout(() => chat.ask(q), reduced() ? 0 : 380); else pending.push(q);
}
function initAsk() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ask]'); if (b) { e.preventDefault(); ask(b.dataset.ask); return; }
    const f = e.target.closest('[data-focus-chat]'); if (f) { e.preventDefault(); scrollToChat(true); }
  });
}

/* ── product tour ──────────────────────────────────────────────────────────── */
const TOUR = [
  { hash: '#/home/overview', q: 'What does the portfolio look like this week?', a: '<b>6 platforms</b>, 23 add-ons and one realized exit. 86 CET opportunities, 157 add-on targets and live NWS alerts for PA, NJ, MA and CT on one map.' },
  { hash: '#/pp/weather', q: 'What is the storm impact on Punctual Pros this week?', a: 'Plumbing pressure peaks at <b>120</b> in Harrisburg on Monday. Plan <b>+2 techs</b> and convert maintenance slots to repair capacity.' },
  { hash: '#/cet/wastewater', q: 'Which wastewater plants should Horton call first?', a: '<b>New Haven East Shore</b> (fit 98) and <b>Hartford WPCF</b> (96) lead 183 plants. 25 have funded projects in a <b>$2.4B</b> pipeline (est.).' },
  { hash: '#/ma/overview', q: 'Where are the best add-on targets?', a: '<b>157 targets</b> screened across four platforms, 20 at Tier 1. Top pick: Midland Scientific for Thomas Scientific, fit <b>92</b>.' },
];
function initTour() {
  const sec = $('#tour'); if (!sec) return;
  const tabs = $$('[role="tab"]', sec), shots = $$('.shot', sec), stage = $('#tour-stage');
  let cur = 0, timer = null, visible = false, hover = false; const DUR = 7000;
  sec.style.setProperty('--dur', DUR + 'ms');
  const loadAll = () => shots.forEach(s => { if (s.dataset.src) { s.src = s.dataset.src; s.removeAttribute('data-src'); } });
  const show = (i, user = false) => {
    cur = (i + TOUR.length) % TOUR.length;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === cur)); t.tabIndex = k === cur ? 0 : -1; });
    shots.forEach((s, k) => s.classList.toggle('on', k === cur));
    stage.setAttribute('aria-labelledby', tabs[cur].id);
    const st = TOUR[cur];
    $('#tour-url').textContent = st.hash; $('#tour-open').href = 'app.html' + st.hash;
    $('#tour-q').textContent = st.q; $('#tour-a').innerHTML = st.a;
    const card = $('.tour-chat', sec); card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
    if (window.matchMedia('(max-width:1080px)').matches && user) tabs[cur].scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    restart();
  };
  const restart = () => {
    clearTimeout(timer); sec.classList.remove('playing'); void sec.offsetWidth;
    if (!visible || hover || reduced()) return;
    sec.classList.add('playing'); timer = setTimeout(() => show(cur + 1), DUR);
  };
  tabs.forEach((t, k) => {
    t.addEventListener('click', () => show(k, true));
    t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); show(cur + 1, true); tabs[cur].focus(); } if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); show(cur - 1, true); tabs[cur].focus(); } });
  });
  sec.addEventListener('pointerenter', () => { hover = true; restart(); });
  sec.addEventListener('pointerleave', () => { hover = false; restart(); });
  sec.addEventListener('focusin', () => { hover = true; restart(); });
  sec.addEventListener('focusout', () => { hover = false; restart(); });
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) loadAll(); }), { rootMargin: '700px 0px' }).observe(sec);
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; restart(); }), { threshold: .35 }).observe(stage);
}

/* ── briefing video ────────────────────────────────────────────────────────── */
function initBriefing() {
  const v = $('#brief-video'); if (!v) return;
  new IntersectionObserver((es, io) => es.forEach(e => { if (e.isIntersecting) { v.poster = v.dataset.poster; io.disconnect(); } }), { rootMargin: '800px 0px' }).observe(v);
  $$('.brief-switch button').forEach(b => b.addEventListener('click', () => {
    $$('.brief-switch button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    const playing = !v.paused; v.pause();
    v.poster = b.dataset.poster; v.querySelector('source').src = b.dataset.video; v.load();
    if (playing) v.play().catch(() => {});
  }));
  $$('[data-play="briefing"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); v.poster = v.poster || v.dataset.poster;
    $('#briefing').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => v.play().catch(() => {}), reduced() ? 0 : 600);
  }));
}

/* ═══ Gallery (redesigns/index.html) ════════════════════════════════════════ */
const OS_FALLBACK = [
  { company: 'pp', os_name: 'ServiceOS', ebitda_impact_usd: [320000, 1120000], multiple_expansion_turns: [1.0, 2.5], investment_usd: [400000, 900000] },
  { company: 'cet', os_name: 'GridOS', ebitda_impact_usd: [620000, 2620000], multiple_expansion_turns: [0.5, 1.5], investment_usd: [800000, 1800000] },
  { company: 'fl', os_name: 'FirmOS', ebitda_impact_usd: [1500000, 4200000], multiple_expansion_turns: [0.5, 1.5], investment_usd: [1500000, 3000000] },
  { company: 'ts', os_name: 'LabOS', ebitda_impact_usd: [1250000, 4800000], multiple_expansion_turns: [0.5, 1.0], investment_usd: [2000000, 4000000] },
  { company: 'bpi', os_name: 'SignalOS', ebitda_impact_usd: [850000, 3750000], multiple_expansion_turns: [0.5, 2.0], investment_usd: [1000000, 2000000] },
  { company: 'fh', os_name: 'HarborOS', ebitda_impact_usd: [400000, 1750000], multiple_expansion_turns: [0.2, 0.5], investment_usd: [300000, 700000], multiple_basis: 'x EV/revenue' },
];
const CO_HEX = { pp: '#f08a3c', cet: '#4c8dff', fl: '#9d7bff', ts: '#2ecc8f', bpi: '#e05c8a', fh: '#3fd0e0' };
const CO_NAME = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor' };
const m$ = v => `$${(v / 1e6).toFixed(1)}M`;

function renderBridge(items, live) {
  const host = $('#bridge-bars'); if (!host) return;
  const max = Math.ceil(Math.max(...items.map(i => i.ebitda_impact_usd[1])) / 1e6);
  const pct = v => (v / 1e6 / max) * 100;
  host.innerHTML = items.map(i => `<div class="rbar" style="--c:${CO_HEX[i.company]}" role="listitem" aria-label="${esc(i.os_name)} for ${esc(CO_NAME[i.company])}: estimated EBITDA impact ${m$(i.ebitda_impact_usd[0])} to ${m$(i.ebitda_impact_usd[1])}"><div class="rbar-l">${esc(i.os_name)}<small>${esc(CO_NAME[i.company])}</small></div><div class="rbar-t"><i style="left:${pct(i.ebitda_impact_usd[0])}%;width:${Math.max(1.5, pct(i.ebitda_impact_usd[1]) - pct(i.ebitda_impact_usd[0]))}%"></i></div><div class="rbar-v">${m$(i.ebitda_impact_usd[0])}–${m$(i.ebitda_impact_usd[1])}</div></div>`).join('')
    + `<div class="rbar-axis" aria-hidden="true"><span></span><div>${Array.from({ length: max + 1 }, (_, k) => `<span>$${k}M</span>`).join('')}</div><span></span></div>`;
  const lo = items.reduce((s, i) => s + i.ebitda_impact_usd[0], 0), hi = items.reduce((s, i) => s + i.ebitda_impact_usd[1], 0);
  const ilo = items.reduce((s, i) => s + i.investment_usd[0], 0), ihi = items.reduce((s, i) => s + i.investment_usd[1], 0);
  const t = $('#bridge-total'); if (t) t.innerHTML = `Portfolio total: <b>${m$(lo)}–${m$(hi)}</b> run-rate EBITDA for <b>${m$(ilo)}–${m$(ihi)}</b> invested (est.)`;
  const s = $('#bridge-src'); if (s) s.textContent = `Source: serviceos_evidence.json roadmap assumptions${live ? ' (read live)' : ' (snapshot)'} · analyst assumptions, not forecasts or company guidance. Revenue bases come from each platform's filings file and are low confidence.`;
}
async function initBridge() {
  if (!$('#bridge-bars')) return;
  renderBridge(OS_FALLBACK, false);
  try {
    const r = await fetch(ROOT + 'data/research/serviceos_evidence.json', { cache: 'force-cache' }); if (!r.ok) return;
    const d = await r.json(); const ra = (d.items || []).filter(i => i.kind === 'roadmap_assumption' && Array.isArray(i.ebitda_impact_usd));
    const order = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];
    if (ra.length >= 6) renderBridge(order.map(c => ra.find(i => i.company === c)).filter(Boolean), true);
  } catch { /* keep snapshot */ }
}
async function initPrinciples() {
  const host = $('#principles'); if (!host) return;
  try {
    const r = await fetch(ROOT + 'data/research/design_refs.json', { cache: 'force-cache' }); if (!r.ok) return;
    const d = await r.json(); const names = Object.fromEntries((d.items || []).map(i => [i.id, i.name]));
    const pr = d.meta?.principles || []; if (!pr.length) return;
    host.innerHTML = pr.map((p, k) => `<article class="pr"><span class="pr-n">${String(k + 1).padStart(2, '0')}</span><h3>${esc(p.principle)}</h3><p>${esc(p.how_to_apply)}</p>${(p.exhibited_by || []).length ? `<div class="pr-refs" aria-label="Seen at">${p.exhibited_by.map(id => `<span>${esc(names[id] || id)}</span>`).join('')}</div>` : ''}<p class="pr-kpi"><b>KPI</b> · ${esc(p.kpi)}</p></article>`).join('');
    const src = $('#principles-src'); if (src) src.textContent = `Source: design_refs.json · ${pr.length} principles distilled from ${d.items?.length || 26} live reference homepages fetched and rendered on ${fmtDate(d.meta?.generated)}.`;
  } catch { /* static fallback stays */ }
}
function initPreviews() {
  const loaders = [];
  $$('.cview').forEach(view => {
    const src = view.dataset.src; const btn = $('.cprev', view); let iframe = null, hoverT = null;
    const fit = () => { if (iframe) iframe.style.transform = `scale(${view.clientWidth / 1440})`; };
    const load = async () => {
      if (iframe) { // toggle back to the static preview
        view.classList.toggle('live'); btn.lastChild.textContent = view.classList.contains('live') ? ' Static preview' : ' Live preview'; return;
      }
      view.classList.add('loading'); $('.cstatus', view).textContent = 'Loading live site…';
      try { const r = await fetch(src, { method: 'HEAD', cache: 'no-store' }); if (!r.ok) throw 0; }
      catch { view.classList.remove('loading'); view.classList.add('missing'); $('.cstatus', view).textContent = 'Concept still in build · showing the styled preview'; return; }
      iframe = document.createElement('iframe');
      iframe.src = src; iframe.title = `Live preview of ${view.dataset.name}`; iframe.loading = 'lazy'; iframe.tabIndex = -1;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.addEventListener('load', () => { iframe.classList.add('ready'); view.classList.remove('loading'); });
      view.appendChild(iframe); fit(); view.classList.add('live'); btn.lastChild.textContent = ' Static preview';
    };
    btn.addEventListener('click', load);
    loaders.push(() => { if (!iframe) load(); });
    if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
      view.addEventListener('pointerenter', () => { if (!iframe) hoverT = setTimeout(load, 650); });
      view.addEventListener('pointerleave', () => clearTimeout(hoverT));
    }
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(view);
  });
  const all = $('#live-all');
  const loadAll = () => { loaders.forEach(f => f()); if (all) { all.disabled = true; all.textContent = 'Live previews loaded'; } };
  all?.addEventListener('click', loadAll);
  if (new URLSearchParams(location.search).get('live') === '1') loadAll();
}

/* ── public API ────────────────────────────────────────────────────────────── */
export const Landing = {
  init() {
    initNav(); initAsk(); initNumbers(); initTour(); initBriefing();
    initReveal('.ask-card, .plat, .osc, .stat, .os-sum, .video-frame, .brief-copy, .closer-in');
  },
  attachChat(inst) {
    chat = inst;
    const ta = document.querySelector('#hero-chat textarea');
    const mq = window.matchMedia('(max-width:640px)');
    if (ta) { const full = ta.placeholder; const set = () => { ta.placeholder = mq.matches ? 'Ask the portfolio anything…' : full; }; set(); mq.addEventListener?.('change', set); }
    while (pending.length) { const q = pending.shift(); setTimeout(() => chat.ask(q), 200); } },
  ask,
};
export const Gallery = {
  init() {
    initNav(); initPreviews(); initPrinciples(); initBridge();
    initReveal('.concept, .osc, .lever, .pr, .bridge');
  },
};
