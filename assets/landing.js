/* ═══════════════════════════════════════════════════════════════════════════
   Broad Sky OS · Concepts gallery behaviour (redesigns/index.html).
   The front page (index.html) now forwards into the shell, so this file keeps only what the gallery uses:
   live previews of the six concept sites, the OS value bars, the design-principles source line, reveal on
   scroll and the "Ask the portfolio" button. No framework, no dependency on the portal runtime.
   ═══════════════════════════════════════════════════════════════════════════ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ROOT = new URL('../', import.meta.url).href;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = s => { if (!s) return ''; const d = new Date(s + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); };

/* ── reveal on scroll ──────────────────────────────────────────────────────── */
function initReveal(sel) {
  if (reduced() || !('IntersectionObserver' in window)) return;
  const els = $$(sel).filter(el => el.getBoundingClientRect().top > window.innerHeight * .9);
  els.forEach((el, i) => { el.classList.add('rv'); el.style.transitionDelay = `${(i % 3) * 70}ms`; });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach(el => io.observe(el));
}

/* ── the assistant: a button marked data-open-chat opens the floating assistant ── */
function initAsk() {
  document.addEventListener('click', e => { const o = e.target.closest('[data-open-chat]'); if (o) { e.preventDefault(); window.BSPFrame?.openChat?.(); } });
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
    const r = await fetch(ROOT + 'data/research/serviceos_evidence.json', { cache: 'no-cache' }); if (!r.ok) return;
    const d = await r.json(); const ra = (d.items || []).filter(i => i.kind === 'roadmap_assumption' && Array.isArray(i.ebitda_impact_usd));
    const order = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];
    if (ra.length >= 6) renderBridge(order.map(c => ra.find(i => i.company === c)).filter(Boolean), true);
  } catch { /* keep snapshot */ }
}
/** The principles are written in the page (plain English, no third-party names); only the provenance line is refreshed. */
async function initPrinciples() {
  const src = $('#principles-src'); if (!src) return;
  try {
    const r = await fetch(ROOT + 'data/research/design_refs.json', { cache: 'no-cache' }); if (!r.ok) return;
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
const REVEAL = '.sys-section .sys-grid > *, .sys-section .sys-kpis, .lp-bridge, .lp-pr, .sys-cta-in';
export const Gallery = {
  init() {
    initAsk(); initPreviews(); initPrinciples(); initBridge();
    initReveal(REVEAL);
  },
};
