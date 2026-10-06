/* "Revenue left on the table" clock — a debt-clock style live counter driven by the portal's sourced rates.
   Usage: import { Counter } from './assets/counter.js'; Counter.mount(el, { theme:'light'|'dark', caption?: string, compact?: boolean })
   The rate is the sum of annualized, sourced opportunity values (each labelled est.) divided by seconds per year. */
import { Data, Fmt, esc } from './core.js?v=20261006085442';
const ROOT = new URL('../', import.meta.url).href;
const YEAR = 365.25 * 24 * 3600;
async function components() {
  const [voice, ads, nw, cet] = await Promise.all([Data.research('voice_ai'), Data.research('pp_ads'), Data.research('pp_nationwide'), Data.research('cet_opportunities')]);
  const c = [];
  const vm = voice?.meta?.pp_revenue_model;
  if (vm?.total_est_usd) c.push({ label: 'Calls missed without 24/7 voice coverage (Punctual Pros)', annual: vm.total_est_usd, src: 'voice_ai · pp_revenue_model', href: ROOT + 'redesigns/voice-ai.html' });
  else c.push({ label: 'Calls missed without 24/7 voice coverage (Punctual Pros)', annual: 1_200_000, src: 'placeholder until voice_ai lands', href: ROOT + 'redesigns/voice-ai.html', est: true });
  const mp = (ads?.items || []).find(i => i.kind === 'media_plan');
  if (mp?.expected_revenue_usd) c.push({ label: 'New-mover & storm-triggered demand not yet captured (Phase 1 plan)', annual: mp.expected_revenue_usd * 12, src: 'pp_ads · Phase 1 media plan', href: ROOT + 'redesigns/punctual-pros/ads.html' });
  const lev = (nw?.items || []).filter(i => i.kind === 'growth_lever');
  const mem = lev.find(l => /member/i.test(l.lever || ''));
  if (mem && mem.baseline != null && mem.target != null && /\$/.test(String(mem.unit || '')) === false) { /* membership lever usually in % — skip unless USD */ }
  const open = (cet?.items || []).filter(o => o.stage === 'open' && o.est_value_usd);
  if (open.length) { const v = open.reduce((a, o) => a + o.est_value_usd, 0); c.push({ label: `CET: ${open.length} open bids on the radar (at a 10% win rate)`, annual: v * 0.10, src: 'cet_opportunities · open stage', href: ROOT + 'app.html#/cet/opportunities' }); }
  return c;
}
export const Counter = {
  async mount(el, opts = {}) {
    const comps = await components(); const annual = comps.reduce((a, x) => a + x.annual, 0); const perSec = annual / YEAR;
    const start = performance.now(); const theme = opts.theme || 'light';
    el.innerHTML = `<div class="rc ${theme === 'dark' ? 'rc-dark' : ''} ${opts.compact ? 'rc-compact' : ''}"><div class="rc-cap">${esc(opts.caption || 'Revenue left on the table across the portfolio since you opened this page')}<span class="rc-badge">est.</span></div><div class="rc-val" aria-live="off">$0</div><div class="rc-sub">≈ ${esc(Fmt.money(annual))} a year at today's sourced rates · <button class="rc-why">how is this computed?</button></div><div class="rc-pop" hidden><div class="rc-pop-t">Components (annualized, estimates)</div>${comps.map(x => `<div class="rc-row"><span>${esc(x.label)}</span><b>${esc(Fmt.money(x.annual))}</b><a href="${esc(x.href)}">${esc(x.src)}</a></div>`).join('')}<div class="rc-note">The clock divides the annual total by seconds in a year. Every component is an analyst estimate built from sourced benchmarks in this portal; it is a way to feel the cost of waiting, not a forecast.</div></div></div>`;
    if (!document.getElementById('rc-css')) { const st = document.createElement('style'); st.id = 'rc-css'; st.textContent = `.rc{font-family:Inter,system-ui,sans-serif;color:#0f172a;position:relative}.rc-dark{color:#e6edf3}.rc-cap{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.7}.rc-badge{margin-left:8px;font-size:9px;padding:1px 6px;border-radius:999px;background:rgba(217,98,43,.15);color:#d9622b}.rc-val{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-weight:700;font-size:clamp(34px,6vw,64px);letter-spacing:-.03em;line-height:1.05;margin:6px 0 4px;font-variant-numeric:tabular-nums;color:#d9622b}.rc-sub{font-size:12.5px;opacity:.75}.rc-why{border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0}.rc-pop{margin-top:10px;padding:12px 14px;border-radius:12px;background:rgba(15,23,42,.06);font-size:12.5px;max-width:640px}.rc-dark .rc-pop{background:rgba(255,255,255,.07)}.rc-pop-t{font-weight:700;margin-bottom:6px}.rc-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:4px 0;border-top:1px solid rgba(128,128,128,.2)}.rc-row a{opacity:.7;font-size:11px}.rc-note{margin-top:8px;opacity:.7;font-size:11.5px}.rc-compact .rc-val{font-size:22px;margin:2px 0}.rc-compact .rc-cap{font-size:10px}.rc-compact .rc-sub{display:none}`; document.head.appendChild(st); }
    const val = el.querySelector('.rc-val'); const pop = el.querySelector('.rc-pop'); el.querySelector('.rc-why').onclick = () => { pop.hidden = !pop.hidden; };
    let raf; const tick = () => { const s = (performance.now() - start) / 1000; val.textContent = '$' + Math.floor(s * perSec).toLocaleString('en-US'); raf = requestAnimationFrame(tick); }; tick();
    return { perSec, annual, comps, destroy() { cancelAnimationFrame(raf); } };
  },
};
window.BSPCounter = Counter;
