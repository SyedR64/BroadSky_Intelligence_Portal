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
const RESEARCH = ['ai_agents_portfolio', 'bpi_filings', 'bpi_playbook', 'bsp_firm', 'bsp_methodology', 'bsp_network', 'cases_cross_sector', 'cases_home_services', 'cet_filings', 'cet_opportunities', 'cet_playbook', 'cet_wwtp_targets', 'county_cbsa', 'design_refs', 'fairharbor_filings', 'fh_playbook', 'fl_midsize_firms', 'fl_playbook', 'frontline_filings', 'ma_targets_cet', 'ma_targets_fl_ts', 'ma_targets_pp', 'pe_landscape', 'pp_ads', 'pp_demand_model', 'pp_filings', 'pp_market', 'pp_nationwide', 'pp_storm_events', 'public_comps', 'rival_filings', 'serviceos_evidence', 'thomas_filings', 'ts_playbook', 'value_creation_cases', 'voice_ai'];
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
    const resOk = research.filter(Boolean).length, salesOk = sales.filter(x => x && x.n != null);
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
      oppsSub: `CET radar ${opps.radar} · public bids ${opps.rfps} · BPI ${opps.bpi} · Fair Harbor ${opps.fh}`,
      targets: cnt('ma_targets_cet') + cnt('ma_targets_pp') + cnt('ma_targets_fl_ts'),
      targetsSub: `CET ${cnt('ma_targets_cet')} · Punctual Pros ${cnt('ma_targets_pp')} · Frontline and Thomas Scientific ${cnt('ma_targets_fl_ts')}`,
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
    if (src) src.innerHTML = `<b>Source:</b> read live from the portal's dataset index and the header of every research and deed file <span class="sys-est sys-est--live">live</span> · data generated ${esc(fmtDate(data.genFrom))} to ${esc(fmtDate(data.genTo))}.`;
  };
  const go = () => loadStats().then(d => { data = d; paint(); $$('.sys-hero [data-stat="datasets"]').forEach(el => { el.textContent = fmtN(d.datasets); }); })
    .catch(() => { const src = $('#numbers-src'); if (src) src.innerHTML = '<b>Source:</b> portal snapshot of Oct 6, 2026; live counts are unavailable right now.'; });
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
  const host = $('#hero-chat'); if (!host) return false;
  const y = host.getBoundingClientRect().top + window.scrollY - 110;
  window.scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
  if (focus) setTimeout(() => $('#hero-chat textarea')?.focus({ preventScroll: true }), reduced() ? 0 : 450);
  return true;
}
function ask(q) {
  if (!$('#hero-chat')) { window.BSPFrame?.openChat?.(); return; }   // gallery: floating assistant
  scrollToChat(false);
  if (chat) setTimeout(() => chat.ask(q), reduced() ? 0 : 380); else pending.push(q);
}
function initAsk() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ask]'); if (b) { e.preventDefault(); ask(b.dataset.ask); return; }
    const f = e.target.closest('[data-focus-chat]'); if (f) { e.preventDefault(); if (!scrollToChat(true)) window.BSPFrame?.openChat?.(); return; }
    const o = e.target.closest('[data-open-chat]'); if (o) { e.preventDefault(); window.BSPFrame?.openChat?.(); }
  });
}

/* ── start here: three guided steps, progress remembered per viewer ───────── */
const STEP_KEY = 'bsp-start-steps';
const STEP_ORDER = ['ask', 'playbook', 'film'];
const readSteps = () => { try { return JSON.parse(localStorage.getItem(STEP_KEY) || '{}') || {}; } catch { return {}; } };
function markStep(id) {
  const st = readSteps(); if (st[id]) return;
  st[id] = true;
  try { localStorage.setItem(STEP_KEY, JSON.stringify(st)); } catch { /* storage blocked: progress just is not remembered */ }
  paintSteps();
}
function paintSteps() {
  const box = $('#steps'); if (!box) return;
  const st = readSteps();
  const next = STEP_ORDER.find(k => !st[k]);
  STEP_ORDER.forEach(k => {
    const li = $(`[data-step="${k}"]`, box); if (!li) return;
    const done = !!st[k], isNext = k === next;
    li.classList.toggle('is-done', done); li.classList.toggle('is-next', isNext);
    const state = $('[data-step-state]', li); if (state) state.textContent = done ? 'Done ✓' : isNext ? 'Next up' : 'Not started';
    const btn = $('[data-step-go]', li);
    if (btn) { btn.classList.toggle('sys-btn--primary', isNext); btn.classList.toggle('sys-btn--secondary', !isNext); }
  });
}
function initSteps() {
  if (!$('#steps')) return;
  paintSteps();
  document.addEventListener('click', e => { const g = e.target.closest('[data-step-go]'); if (g) markStep(g.dataset.stepGo); });
}

/* ── product tour ──────────────────────────────────────────────────────────── */
const TOUR = [
  { hash: '#/home/overview', name: 'Command Center', q: 'What does the portfolio look like this week?', a: '<b>6 companies</b>, 23 add-ons and one realized exit. 86 CET opportunities, 157 add-on targets and live weather alerts for PA, NJ, MA and CT on one map.' },
  { hash: '#/pp/weather', name: 'Punctual Pros / Weather and demand', q: 'What is the storm impact on Punctual Pros this week?', a: 'Plumbing pressure peaks at <b>120</b> in Harrisburg on Monday. Plan <b>+2 technicians</b> and convert maintenance slots to repair capacity.' },
  { hash: '#/cet/wastewater', name: 'CET / Wastewater accounts', q: 'Which wastewater plants should Horton call first?', a: '<b>New Haven East Shore</b> (fit 98) and <b>Hartford WPCF</b> (96) lead 183 plants. 25 have funded projects in a <b>$2.4B</b><span class="sys-est">est.</span> pipeline.' },
  { hash: '#/ma/overview', name: 'Acquisition engine', q: 'Where are the best add-on targets?', a: '<b>157 targets</b> screened across four companies, 20 at Tier 1. Top pick: Midland Scientific for Thomas Scientific, fit <b>92</b>.' },
];
function initTour() {
  const sec = $('#tour'); if (!sec) return;
  const tabs = $$('[role="tab"]', sec), shots = $$('.lp-shot', sec), stage = $('#tour-stage');
  let cur = 0, timer = null, visible = false, hover = false; const DUR = 7000;
  sec.style.setProperty('--dur', DUR + 'ms');
  const loadAll = () => shots.forEach(s => { if (s.dataset.src) { s.src = s.dataset.src; s.removeAttribute('data-src'); } });
  const show = (i, user = false) => {
    cur = (i + TOUR.length) % TOUR.length;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === cur)); t.tabIndex = k === cur ? 0 : -1; });
    shots.forEach((s, k) => s.classList.toggle('on', k === cur));
    stage.setAttribute('aria-labelledby', tabs[cur].id);
    const st = TOUR[cur];
    $('#tour-url').textContent = st.name; $('#tour-open').href = 'app.html' + st.hash;
    $('#tour-q').textContent = st.q; $('#tour-a').innerHTML = st.a;
    const card = $('.lp-tour-chat', sec); card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
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

/* ── briefing video + the film ─────────────────────────────────────────────── */
function initBriefing() {
  const v = $('#brief-video'); if (!v) return;
  const chips = $$('#briefing [data-video]'), cap = $('#brief-cap');
  new IntersectionObserver((es, io) => es.forEach(e => { if (e.isIntersecting) { v.poster = v.dataset.poster; io.disconnect(); } }), { rootMargin: '800px 0px' }).observe(v);
  const select = b => {
    if (b.getAttribute('aria-pressed') === 'true') return false;
    chips.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    v.pause(); v.poster = b.dataset.poster; v.querySelector('source').src = b.dataset.video; v.load();
    if (cap && b.dataset.cap) cap.textContent = b.dataset.cap;
    return true;
  };
  chips.forEach(b => b.addEventListener('click', () => { const playing = !v.paused; if (select(b) && playing) v.play().catch(() => {}); }));
  const playFrom = (which, e) => {
    e.preventDefault();
    const b = chips.find(x => x.dataset.video.includes(which === 'film' ? 'intro' : 'briefing')); if (b) select(b);
    v.poster = v.poster || v.dataset.poster;
    $('#briefing').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => v.play().catch(() => {}), reduced() ? 0 : 600);
  };
  document.addEventListener('click', e => { const a = e.target.closest('[data-play]'); if (a) playFrom(a.dataset.play, e); });
  v.addEventListener('play', () => { if (v.currentSrc.includes('intro')) markStep('film'); });
}

/* ═══ Gallery (redesigns/index.html) ════════════════════════════════════════ */
const OS_FALLBACK = [
  { company: 'pp', os_name: 'ServiceOS', ebitda_impact_usd: [320000, 1120000], multiple_expansion_turns: [1.0, 2.5], investment_usd: [400000, 900000] },
  { company: 'cet', os_name: 'GridOS', ebitda_impact_usd: [620000, 2620000], multiple_expansion_turns: [0.5, 1.5], investment_usd: [800000, 1800000] },
  { company: 'fl', os_name: 'FirmOS', ebitda_impact_usd: [1500000, 4200000], multiple_expansion_turns: [0.5, 1.5], investment_usd: [1500000, 3000000] },
  { company: 'ts', os_name: 'LabOS', ebitda_impact_usd: [1250000, 4800000], multiple_expansion_turns: [0.5, 1.0], investment_usd: [2000000, 4000000] },
  { company: 'bpi', os_name: 'SignalOS', ebitda_impact_usd: [850000, 3750000], multiple_expansion_turns: [0.5, 2.0], investment_usd: [1000000, 2000000] },
  { company: 'fh', os_name: 'HarborOS', ebitda_impact_usd: [400000, 1750000], multiple_expansion_turns: [0.2, 0.5], investment_usd: [300000, 700000] },
];
const CO_NAME = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor' };
const m$ = v => `$${(v / 1e6).toFixed(1)}M`;
const EST = '<span class="sys-est">est.</span>';

function renderBridge(items, live) {
  const host = $('#bridge-bars'); if (!host) return;
  const max = Math.ceil(Math.max(...items.map(i => i.ebitda_impact_usd[1])) / 1e6);
  const pct = v => (v / 1e6 / max) * 100;
  host.innerHTML = items.map(i => `<div class="rbar" data-co="${esc(i.company)}" role="listitem" aria-label="${esc(i.os_name)} for ${esc(CO_NAME[i.company])}: estimated EBITDA impact ${m$(i.ebitda_impact_usd[0])} to ${m$(i.ebitda_impact_usd[1])}"><div class="rbar-l">${esc(i.os_name)}<small>${esc(CO_NAME[i.company])}</small></div><div class="rbar-t"><i style="left:${pct(i.ebitda_impact_usd[0])}%;width:${Math.max(1.5, pct(i.ebitda_impact_usd[1]) - pct(i.ebitda_impact_usd[0]))}%"></i></div><div class="rbar-v">${m$(i.ebitda_impact_usd[0])}–${m$(i.ebitda_impact_usd[1])}${EST}</div></div>`).join('')
    + `<div class="rbar-axis" aria-hidden="true"><span></span><div>${Array.from({ length: max + 1 }, (_, k) => `<span>$${k}M</span>`).join('')}</div><span></span></div>`;
  const lo = items.reduce((s, i) => s + i.ebitda_impact_usd[0], 0), hi = items.reduce((s, i) => s + i.ebitda_impact_usd[1], 0);
  const ilo = items.reduce((s, i) => s + i.investment_usd[0], 0), ihi = items.reduce((s, i) => s + i.investment_usd[1], 0);
  const t = $('#bridge-total'); if (t) t.innerHTML = `Portfolio total: <b>${m$(lo)}–${m$(hi)}</b>${EST} run-rate EBITDA for <b>${m$(ilo)}–${m$(ihi)}</b>${EST} invested`;
  const s = $('#bridge-src'); if (s) s.innerHTML = `<b>Source:</b> ServiceOS evidence, roadmap assumptions${live ? ' <span class="sys-est sys-est--live">live</span>' : ' (Oct 2026 snapshot)'}. Analyst assumptions, not forecasts or company guidance; revenue bases come from each company's public filings and are low confidence.`;
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
/** The principles are written in the page (plain English, no third-party names); only the provenance line is refreshed. */
async function initPrinciples() {
  const src = $('#principles-src'); if (!src) return;
  try {
    const r = await fetch(ROOT + 'data/research/design_refs.json', { cache: 'force-cache' }); if (!r.ok) return;
    const d = await r.json(); const n = d.items?.length; const gen = fmtDate(d.meta?.generated);
    if (n && gen) src.innerHTML = `<b>Source:</b> design references, ${n} reference homepages reviewed and rendered on ${esc(gen)}.`;
  } catch { /* static line stays */ }
}
function initPreviews() {
  const loaders = [];
  $$('.lp-cview').forEach(view => {
    const src = view.dataset.src; const btn = $('.lp-cprev', view); const label = $('.lp-cprev-t', btn); let iframe = null, hoverT = null;
    const fit = () => { if (iframe) iframe.style.transform = `scale(${view.clientWidth / 1440})`; };
    const load = async () => {
      if (iframe) { // toggle back to the static preview
        view.classList.toggle('live'); label.textContent = view.classList.contains('live') ? 'Static preview' : 'Live preview'; return;
      }
      view.classList.add('loading'); $('.lp-cstatus', view).textContent = 'Loading the live site…';
      try { const r = await fetch(src, { method: 'HEAD', cache: 'no-store' }); if (!r.ok) throw 0; }
      catch { view.classList.remove('loading'); view.classList.add('missing'); $('.lp-cstatus', view).textContent = 'Live site unavailable · showing the styled preview'; return; }
      iframe = document.createElement('iframe');
      iframe.src = src; iframe.title = `Live preview of ${view.dataset.name}`; iframe.loading = 'lazy'; iframe.tabIndex = -1;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.addEventListener('load', () => { iframe.classList.add('ready'); view.classList.remove('loading'); });
      view.appendChild(iframe); fit(); view.classList.add('live'); label.textContent = 'Static preview';
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

/* ── revenue counter: start from today's running total, not from $0 ─────────
   counter.js counts up from page load, so the first frame reads "$1". Here the
   clock is re-based to local midnight (the per-day figure prorated to the time of
   page load), and anything under $100 shows "—" so a thumbnail never shows a
   broken-looking number. Source names in the breakdown are written out. */
const COUNTER_SRC = [
  [/^voice_ai\b/, 'Voice AI research · Punctual Pros revenue model'],
  [/^placeholder/, 'Placeholder estimate until the Voice AI research is published'],
  [/^pp_ads\b/, 'Punctual Pros ad plan · Phase 1 media plan'],
  [/^cet_opportunities\b/, 'CET opportunity radar · open bids'],
];
function attachCounter(el, inst, clean = s => s) {
  if (!el || !inst || !(inst.perSec > 0)) return;
  inst.destroy?.();
  const val = el.querySelector('.rc-val'); if (!val) return;
  el.querySelectorAll('.rc-row a').forEach((a, i) => {
    const raw = inst.comps?.[i]?.src || a.textContent;
    const hit = COUNTER_SRC.find(([rx]) => rx.test(raw));
    a.textContent = hit ? hit[1] : clean(raw);
  });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const t0 = performance.now(), base = (Date.now() - midnight.getTime()) / 1000;
  const paint = () => {
    const v = Math.floor((base + (performance.now() - t0) / 1000) * inst.perSec);
    val.textContent = v >= 100 ? '$' + fmtN(v) : '—';
  };
  paint();
  if (reduced()) { setInterval(paint, 1000); return; }
  let last = 0;
  const loop = now => { if (now - last > 90) { paint(); last = now; } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/* ── public API ────────────────────────────────────────────────────────────── */
const REVEAL = '.sys-section .sys-grid > *, .sys-section .sys-kpis, .lp-stage, .lp-video, .lp-bridge, .lp-pr, .sys-cta-in';
export const Landing = {
  init() {
    initAsk(); initSteps(); initNumbers(); initTour(); initBriefing();
    initReveal(REVEAL);
  },
  attachChat(inst) {
    chat = inst;
    const ta = document.querySelector('#hero-chat textarea');
    const mq = window.matchMedia('(max-width:640px)');
    if (ta) { const full = ta.placeholder; const set = () => { ta.placeholder = mq.matches ? 'Ask the portfolio anything…' : full; }; set(); mq.addEventListener?.('change', set); }
    // a question asked in the hero counts as step 1 of "Start here"
    const form = document.querySelector('#hero-chat');
    form?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && /nationwide/i.test(e.target.value || '')) markStep('ask'); });
    while (pending.length) { const q = pending.shift(); setTimeout(() => chat.ask(q), 200); }
  },
  attachCounter,
  ask,
};
export const Gallery = {
  init() {
    initAsk(); initPreviews(); initPrinciples(); initBridge();
    initReveal(REVEAL);
  },
};
