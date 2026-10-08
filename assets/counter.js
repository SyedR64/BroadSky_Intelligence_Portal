/* "Revenue left on the table" clock — a debt-clock style live counter driven by the portal's sourced rates.
   Usage: import { Counter } from './assets/counter.js?v=20261008134553';
     Counter.mount(el, { theme:'light'|'dark', caption?: string, compact?: boolean,
                         baseline?: 'load'|'today', minDisplay?: number })
   baseline 'load' (default) counts up from $0 when the page opens; 'today' counts from local midnight
   (the per-day figure prorated to the moment of mount). Below minDisplay (default 0, or 100 with
   baseline 'today') the value shows "—" so a first frame never reads "$1".
   The rate is the sum of annualized, sourced opportunity values (each labelled est.) divided by seconds per year.
   Colours come from system.css tokens, so the clock follows the page's light or dark theme. */
import { Data, Fmt, esc } from './core.js?v=20261008134553';
const ROOT = new URL('../', import.meta.url).href;
const YEAR = 365.25 * 24 * 3600;
/* Readable source names for the breakdown. `src` on each component stays the raw dataset key
   (data, never shown) so callers that map sources keep working; `source` is what is displayed. */
const SOURCE = {
  voice: 'Voice AI research · Punctual Pros revenue model',
  placeholder: 'Placeholder estimate until the Voice AI research is published',
  ads: 'Punctual Pros ad plan · Phase 1 media plan',
  cet: 'CET opportunity radar · open bids',
};
const plural = (n, one, many = one + 's') => `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : many}`;
async function components() {
  const [voice, ads, cet] = await Promise.all([Data.research('voice_ai'), Data.research('pp_ads'), Data.research('cet_opportunities')]);
  const c = [];
  const vm = voice?.meta?.pp_revenue_model;
  if (vm?.total_est_usd) c.push({ label: 'Calls missed without 24/7 voice coverage (Punctual Pros)', annual: vm.total_est_usd, src: 'voice_ai · pp_revenue_model', source: SOURCE.voice, href: ROOT + 'redesigns/voice-ai.html' });
  else c.push({ label: 'Calls missed without 24/7 voice coverage (Punctual Pros)', annual: 1_200_000, src: 'placeholder until voice_ai lands', source: SOURCE.placeholder, href: ROOT + 'redesigns/voice-ai.html', est: true });
  const mp = (ads?.items || []).find(i => i.kind === 'media_plan');
  if (mp?.expected_revenue_usd) c.push({ label: 'New-mover and storm-triggered demand not yet captured (Phase 1 plan)', annual: mp.expected_revenue_usd * 12, src: 'pp_ads · Phase 1 media plan', source: SOURCE.ads, href: ROOT + 'redesigns/punctual-pros/ads.html' });
  const open = (cet?.items || []).filter(o => o.stage === 'open' && o.est_value_usd);
  if (open.length) { const v = open.reduce((a, o) => a + o.est_value_usd, 0); c.push({ label: `CET: ${plural(open.length, 'open bid')} on the radar (at a 10% win rate)`, annual: v * 0.10, src: 'cet_opportunities · open stage', source: SOURCE.cet, href: ROOT + 'app.html#/cet/opportunities' }); }
  return c;
}
const CSS = `.rc{font-family:var(--sys-font,Inter,system-ui,sans-serif);color:var(--sys-ink);position:relative}
.rc-cap{font-size:var(--sys-fs-xs,12px);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--sys-mute)}
.rc-cap .sys-est,.rc-badge{text-transform:none;letter-spacing:.03em}
.rc-val{font-family:var(--sys-mono,"JetBrains Mono",ui-monospace,Menlo,monospace);font-weight:700;font-size:clamp(34px,6vw,64px);letter-spacing:-.03em;line-height:1.05;margin:6px 0 4px;font-variant-numeric:tabular-nums;color:var(--sys-brand)}
.rc-sub{font-size:12.5px;color:var(--sys-mute)}
.rc-why{border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
.rc-why:focus-visible{outline:none;box-shadow:var(--sys-ring);border-radius:4px}
.rc-pop{margin-top:10px;padding:12px 14px;border-radius:var(--sys-r-sm,10px);background:var(--sys-bg-2);border:1px solid var(--sys-line);font-size:12.5px;max-width:640px}
.rc-pop-t{font-weight:700;margin-bottom:6px;color:var(--sys-ink)}
.rc-row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:6px 0;border-top:1px solid var(--sys-line)}
.rc-row b{font-variant-numeric:tabular-nums;color:var(--sys-ink)}
.rc-row a{grid-column:1/-1;color:var(--sys-mute);font-size:11px}
.rc-note{margin-top:8px;color:var(--sys-mute);font-size:11.5px}
.rc-compact .rc-val{font-size:22px;margin:2px 0}.rc-compact .rc-cap{font-size:10px}.rc-compact .rc-sub{display:none}`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const Counter = {
  async mount(el, opts = {}) {
    const comps = await components(); const annual = comps.reduce((a, x) => a + x.annual, 0); const perSec = annual / YEAR;
    const theme = opts.theme || 'light';
    const today = opts.baseline === 'today';
    const minDisplay = opts.minDisplay ?? (today ? 100 : 0);
    const caption = opts.caption || (today ? 'Revenue left on the table today' : 'Revenue left on the table since you opened this page');
    el.innerHTML = `<div class="rc ${theme === 'dark' ? 'rc-dark' : ''} ${opts.compact ? 'rc-compact' : ''}"><div class="rc-cap">${esc(caption)}<span class="sys-est rc-badge">est.</span></div><div class="rc-val" aria-live="off">${minDisplay > 0 ? '—' : '$0'}</div><div class="rc-sub">≈ ${esc(Fmt.money(annual))} a year at today's sourced rates · <button type="button" class="rc-why" aria-expanded="false">how is this computed?</button></div><div class="rc-pop" hidden><div class="rc-pop-t">Components (annualized estimates)</div>${comps.map(x => `<div class="rc-row"><span>${esc(x.label)}</span><b>${esc(Fmt.money(x.annual))}</b><a href="${esc(x.href)}">${esc(x.source)}</a></div>`).join('')}<div class="rc-note">The annual total divided by seconds in a year. Each component is an analyst estimate from sourced benchmarks, not a forecast.</div></div></div>`;
    if (!document.getElementById('rc-css')) { const st = document.createElement('style'); st.id = 'rc-css'; st.textContent = CSS; document.head.appendChild(st); }
    const val = el.querySelector('.rc-val'); const pop = el.querySelector('.rc-pop'); const why = el.querySelector('.rc-why');
    why.onclick = () => { pop.hidden = !pop.hidden; why.setAttribute('aria-expanded', String(!pop.hidden)); };
    let base = 0;
    if (today) { const midnight = new Date(); midnight.setHours(0, 0, 0, 0); base = (Date.now() - midnight.getTime()) / 1000; }
    const t0 = performance.now();
    const paint = () => { const v = Math.floor((base + (performance.now() - t0) / 1000) * perSec); val.textContent = v >= minDisplay ? '$' + v.toLocaleString('en-US') : '—'; };
    let raf = 0, iv = 0, last = 0, dead = false;
    paint();
    if (reduced()) iv = setInterval(paint, 1000);
    else { const loop = now => { if (dead) return; if (now - last > 90) { paint(); last = now; } raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
    return { perSec, annual, comps, baseline: today ? 'today' : 'load', destroy() { dead = true; cancelAnimationFrame(raf); clearInterval(iv); } };
  },
};
window.BSPCounter = Counter;
