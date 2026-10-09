/* ═══════════════════════════════════════════════════════════════════════════
   BSP Desk — landing page + concept gallery behaviour.
   No framework, no dependency on the portal runtime: the page paints with the
   static counts in index.html, then refreshes them from the dataset index
   (data/research/index.json) and data/manifest.json.
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ROOT = new URL('../', import.meta.url).href;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fmtN = n => Number(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── data: one small index ──────────────────────────────────────────────────
   data/research/index.json (written by scripts/describe_research.py) carries the
   item count, size and date of every research and deed file, so the landing page
   reads two small files (that index and data/manifest.json) instead of opening
   all 46 datasets. If the index is missing, the static numbers in index.html stay. */
let _stats = null;
function loadStats() {
  if (_stats) return _stats;
  const get = url => fetch(ROOT + url, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
  _stats = (async () => {
    const [manifest, index] = await Promise.all([get('data/manifest.json'), get('data/research/index.json')]);
    const files = Array.isArray(index?.files) ? index.files : null;
    if (!files || !files.length) throw new Error('dataset index unavailable');
    const F = Object.fromEntries(files.map(f => [`${f.folder}/${f.name}`, f]));
    const sales = files.filter(f => f.folder === 'sales' && f.item_count != null);
    const core = manifest?.datasets || [];
    const rows = n => core.find(d => d.file === `${n}.json`)?.rows;
    const cnt = n => F[`research/${n}`]?.item_count || 0;
    const firm = F['research/bsp_firm']?.lists || {};
    const opps = { radar: cnt('cet_opportunities'), rfps: rows('cet_ne_rfps') || 0, bpi: firm.bpi_opportunities || 0, fh: firm.fh_opportunities || 0 };
    const gens = [manifest?.generated, ...files.map(f => f.generated)].filter(Boolean).map(s => String(s).slice(0, 10)).sort();
    return {
      filings: ['pp_filings', 'cet_filings', 'frontline_filings', 'thomas_filings', 'bpi_filings', 'fairharbor_filings', 'rival_filings'].reduce((s, n) => s + cnt(n), 0),
      filingsSub: 'SEC, lender and state records',
      sales: sales.reduce((s, x) => s + x.item_count, 0),
      salesSub: 'from county recorder deed records',
      opps: opps.radar + opps.rfps + opps.bpi + opps.fh,
      oppsSub: `CET ${fmtN(opps.radar)} sourced + ${fmtN(opps.rfps)} older public bids · BPI ${opps.bpi} · Fair Harbor ${opps.fh}`,
      targets: cnt('ma_targets_cet') + cnt('ma_targets_pp') + cnt('ma_targets_fl_ts'),
      targetsSub: 'across four companies',
      sponsors: cnt('pe_landscape'),
      sites: rows('ts_sites') || 0,
      genFrom: gens[0], genTo: gens[gens.length - 1],
    };
  })();
  return _stats;
}
const fmtDate = s => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };
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
    for (const k of ['filings', 'sales', 'opps', 'targets', 'sponsors', 'sites']) {
      if (!data[k]) continue;
      $$(`[data-stat="${k}"]`).forEach(el => el.closest('#numbers') ? countUp(el, data[k]) : (el.textContent = fmtN(data[k])));
      const sub = $(`[data-sub="${k}"]`); if (sub && data[k + 'Sub']) sub.textContent = data[k + 'Sub'];
    }
    const src = $('#numbers-src');
    if (src) src.innerHTML = `<b>Source:</b> public filings, bid boards, county deed records and press <span class="sys-est sys-est--live">live</span> · data from ${esc(fmtDate(data.genFrom))} to ${esc(fmtDate(data.genTo))}.`;
  };
  const go = () => loadStats().then(d => { data = d; paint(); })
    .catch(() => { const src = $('#numbers-src'); if (src) src.innerHTML = '<b>Source:</b> public filings, bid boards, county deed records and press, as of October 6, 2026.'; });
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

/* ── acquisition engine: the two worked examples ───────────────────────────────
   The cards paint with the figures written in index.html, then recompute them from the same files and the same deal-lib
   functions the portal uses (targetVals, priceBand, dealSummary), so the landing page and the acquisition engine agree. */
const money = n => { if (n == null || !isFinite(n)) return '—'; const a = Math.abs(n); return '$' + (a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K' : String(Math.round(n))); };
const M$ = v => money(v * 1e6);
const x1 = v => `${Number(v).toFixed(1)}x`;
const EST_B = '<span class="sys-est">est.</span>';
const DEAL_PEER = { cet: ['commercial_electrical_energy', 'listed electrical contractors'], pp: ['residential_home_services', 'listed residential-services companies'], fl: ['legal_bpo_managed_services', 'listed legal and managed-services firms'], ts: ['lab_distribution', 'listed lab distributors'] };
const DEAL_CO = { cet: 'CET', pp: 'Punctual Pros', fl: 'Frontline', ts: 'Thomas Scientific' };
function initDeals() {
  const cards = $$('[data-deal]'); if (!cards.length) return;
  let done = false;
  const run = async () => {
    if (done) return; done = true;
    const get = url => fetch(ROOT + url, { cache: 'force-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
    const [dm, cet, pp, flts, comps, L] = await Promise.all(['deal_model', 'ma_targets_cet', 'ma_targets_pp', 'ma_targets_fl_ts', 'public_comps'].map(n => get(`data/research/${n}.json`)).concat(import(ROOT + 'modules/deal-lib.js?v=20261009173940').catch(() => null)));
    if (!dm?.meta || !L?.targetVals) return;
    const all = [...(cet?.items || []).map(t => ({ ...t, _p: 'cet' })), ...(pp?.items || []).map(t => ({ ...t, _p: 'pp' })), ...(flts?.items || []).map(t => ({ ...t, _p: t.platform === 'frontline' ? 'fl' : 'ts' }))];
    for (const card of cards) {
      try {
        const t = all.find(x => x.id === card.dataset.deal); if (!t || !(t.revenue_est_usd > 0)) continue;
        const sec = dm.items.find(i => i.kind === 'sector' && i.co === t._p), par = dm.items.find(i => i.kind === 'preset' && i.co === t._p); if (!sec || !par) continue;
        const td = dm.meta.target_defaults, revM = t.revenue_est_usd / 1e6;
        const v = L.targetVals(dm.meta.base, td, sec, par.inputs, revM), S = L.dealSummary(v);
        const band = L.priceBand(S.ebitda, v.em, dm.items.filter(i => i.kind === 'benchmark'));
        const peer = comps?.meta?.sector_benchmarks?.[DEAL_PEER[t._p][0]], rpe = peer?.median_revenue_per_employee_usd, emp = t.employees;
        const ceil = emp && rpe ? emp * rpe / 1e6 : null, ratio = ceil ? revM / ceil : null;
        const revConf = ratio != null && ratio >= 0.25 && ratio <= 1 ? 'Medium' : 'Low';
        const irr = S.irr == null ? 'n/m' : `${(S.irr * 100).toFixed(1)}%`;
        const price = band ? `${M$(band.lo)}–${M$(band.hi)}` : M$(S.price);
        const set = (f, html) => { const el = $(`[data-f="${f}"]`, card); if (el) el.innerHTML = html; };
        set('fit', esc(t.fit_score)); if (emp) set('staff', esc(fmtN(emp)));
        set('math', [['Revenue', M$(revM)], ['EBITDA', M$(S.ebitda)], ['Likely price', price], ['Debt', M$(S.debt)], ['Equity check', M$(S.equity)], ['Return a year', irr]].map(([k, x]) => `<div><dt>${k}</dt><dd>${esc(x)}${EST_B}</dd></div>`).join(''));
        set('how', [
          emp ? `<b>Staff: ${esc(fmtN(emp))}.</b> From a company database search (ZoomInfo). <i>Medium confidence.</i>` : '',
          `<b>Revenue: ${esc(M$(revM))} ${EST_B}</b> Modelled by ZoomInfo, not reported.${ceil ? ` Check: ${esc(fmtN(emp))} staff × ${esc(money(rpe))} revenue per employee at ${esc(DEAL_PEER[t._p][1])} = ${esc(M$(ceil))} ceiling; the estimate is ${Math.round(ratio * 100)}% of that rate.` : ''} <i>${revConf} confidence.</i>`,
          `<b>EBITDA: ${esc(M$(S.ebitda))} ${EST_B}</b> Revenue × ${esc(sec.margin_pct)}%. ${esc(sec.basis)} <i>Low confidence.</i>`,
          band ? `<b>Likely price: ${esc(price)} ${EST_B}</b> EBITDA × ${x1(band.mLo)} to ${x1(band.mHi)}, the ${esc(band.label)} (GF Data). The model starts at ${x1(v.em)}: ${esc(M$(S.price))}. <i>Low confidence.</i>` : '',
          `<b>Financing: ${esc(M$(S.debt))} debt, ${esc(M$(S.equity))} equity ${EST_B}</b> Debt of ${x1(td.lev)} EBITDA at ${esc(td.ir)}%, the current market averages (GF Data), plus ${esc(v.fee)}% deal fees. <i>Market average.</i>`,
          `<b>Return: ${esc(irr)} a year ${EST_B}</b> Sold at the same ${x1(v.xm)} after ${S.years} years, before any gain from merging into ${esc(DEAL_CO[t._p])}. <i>Low confidence.</i>`,
        ].filter(Boolean).map(h => `<li>${h}</li>`).join(''));
      } catch { /* keep the figures written in the page */ }
    }
  };
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '700px 0px' });
  cards.forEach(c => io.observe(c));
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
  { hash: '#/pp/weather', name: 'Punctual Pros / Weather and demand', q: "What do this week's storms mean for Punctual Pros?", a: 'Plumbing pressure peaks at <b>120</b> in Harrisburg on Monday. Plan <b>+2 technicians</b> and convert maintenance slots to repair capacity.' },
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
/* half-up to one decimal, so $0.85M reads $0.9M everywhere (cards, chart and memo agree) */
const m$ = v => `$${(Math.round(v / 1e5) / 10).toFixed(1)}M`;
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
  const s = $('#bridge-src'); if (s) s.innerHTML = `<b>Source:</b> OS program estimates: vendor case studies, PKF, Capstone/IMAP, October 2026. Analyst assumptions, not guidance. Revenue bases from public filings are low confidence.`;
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
    if (n && gen) src.innerHTML = `<b>Source:</b> design references, ${n} reference homepages reviewed and captured on ${esc(gen)}.`;
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

/* ── public API ────────────────────────────────────────────────────────────── */
const REVEAL = '.sys-section .sys-grid > *, .sys-section .sys-kpis, .lp-stage, .lp-video, .lp-bridge, .lp-pr, .sys-cta-in';
export const Landing = {
  init() {
    initAsk(); initSteps(); initNumbers(); initDeals(); initTour(); initBriefing();
    initReveal(REVEAL);
  },
  attachChat(inst) {
    chat = inst;
    const ta = document.querySelector('#hero-chat textarea');
    const mq = window.matchMedia('(max-width:640px)');
    if (ta) { const full = ta.placeholder; const set = () => { ta.placeholder = mq.matches ? 'Ask anything…' : full; }; set(); mq.addEventListener?.('change', set); }
    // a question asked in the hero counts as step 1 of "Start here"
    const form = document.querySelector('#hero-chat');
    form?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && /nationwide/i.test(e.target.value || '')) markStep('ask'); });
    while (pending.length) { const q = pending.shift(); setTimeout(() => chat.ask(q), 200); }
  },
  ask,
};
export const Gallery = {
  init() {
    initAsk(); initPreviews(); initPrinciples(); initBridge();
    initReveal(REVEAL);
  },
};
