/* "Revenue left on the table" clock — a debt-clock style live counter driven by the portal's sourced rates.
   Usage: import { Counter } from './assets/counter.js?v=20261009181341';
     Counter.mount(el, { theme:'light'|'dark', caption?: string, compact?: boolean,
                         baseline?: 'load'|'today', minDisplay?: number })
   baseline 'load' (default) counts up from $0 when the page opens; 'today' counts from local midnight
   (the per-day figure prorated to the moment of mount). Below minDisplay (default 0, or 100 with
   baseline 'today') the value shows "—" so a first frame never reads "$1".
   The rate is the sum of the levers' extra sales a year (revenue, each labelled est.) divided by seconds per year.
   Levers (one unit: extra sales a year; nothing counted twice):
     voice_ai use cases (est_annual_value_usd) · pp_ads Phase 1 media plan channels (est_revenue_usd x 12) ·
     cet_opportunities open bids with a value (x 10% win rate) · ai_agents_portfolio revenue agents
     (est_annual_value_usd / the margin in its formula = the sales behind it, counted at 50% like the AI agents page).
   Each lever is read at runtime; a lever whose data is missing is skipped. "How" lines quote formula inputs and
   are shown only while the formula still contains them (otherwise a generic line is shown).
   Colours come from system.css tokens, so the clock follows the page's light or dark theme. */
import { Data, Fmt, esc } from './core.js?v=20261009181341';
const ROOT = new URL('../', import.meta.url).href;
const YEAR = 365.25 * 24 * 3600;
const AGENT_SHARE = 0.5;      // revenue-lift and new-product agents count at 50%, the same haircut as redesigns/ai-agents.js
const BID_WIN = 0.10;         // open bids count at a 10% win rate
/* Pages that back each lever (display names only; `src` keeps the raw dataset key, never shown). */
const PAGE = {
  voice: ['redesigns/voice-ai.html', 'Voice AI research'],
  ads: ['redesigns/punctual-pros/ads.html', 'Punctual Pros ad plan'],
  radar: ['app.html#/cet/opportunities', 'CET opportunity radar'],
  agents: ['redesigns/ai-agents.html', 'AI agents'],
};
const CO = {
  pp: ['Punctual Pros', 'var(--co-pp)'], cet: ['CET', 'var(--co-cet)'], fl: ['Frontline', 'var(--co-fl)'],
  ts: ['Thomas Scientific', 'var(--co-ts)'], bpi: ['BPI', 'var(--co-bpi)'], fh: ['Fair Harbor', 'var(--co-fh)'],
};
/* Voice AI use cases (sales a year). `has`: formula inputs the "how" line quotes. */
const VOICE = [
  { id: 'uc-pp-overflow', co: 'pp', name: 'Pick up the calls that ring out on busy days', how: 'About 12% of daytime calls go unanswered when the office is busy, often on storm days. Assumes 45% of those callers book a job.', has: ['0.12 missed', '0.45'] },
  { id: 'uc-pp-renewal', co: 'pp', name: 'Call members before their plan runs out', how: 'About 1 in 5 members does not renew. Assumes about 6,000 members and renewals rising from 80% to 88%.', has: ['6,000 members', '0.88 - 0.8'] },
  { id: 'uc-pp-afterhours', co: 'pp', name: 'Answer every night and weekend call with voice AI', how: 'About a third of after-hours calls are lost today. Assumes 45% of answered callers book a job.', has: ['0.35 lost', '0.45 booked'] },
  { id: 'uc-pp-unsold', co: 'pp', name: 'Follow up on every unsold replacement quote', how: 'About $4.0M of replacement quotes go unsold each year. Assumes 8% more of them close after a follow-up.', has: ['$4.0M', '8% incremental'] },
  { id: 'uc-pp-confirm', co: 'pp', name: 'Confirm every visit by call or text', how: 'About 5% of booked visits fall through at the door. Reminders cut that by a quarter.', has: ['5% not-home', '25% reduction'] },
  { id: 'uc-pp-spanish', co: 'pp', name: 'Add a Spanish-language booking line', how: 'About 6% of Lancaster County homes speak Spanish. Assumes 15% of those callers do not book today because of language.', has: ['6.36%', '15% of those'] },
  { id: 'uc-cet-emergency', co: 'cet', name: 'Answer emergency service calls day and night', how: 'About 600 emergency calls a year come in after hours. Assumes 10% more become paid jobs at about $3,500 each.', has: ['600 after-hours', '10% more', '$3,500'] },
  { id: 'uc-cet-storm-pm', co: 'cet', name: 'Book generator check-ups before storm season', how: 'About 150 sites are on service plans. Assumes 20% more check-ups at about $2,500 each.', has: ['150 service-agreement', '20% more', '$2,500'] },
  { id: 'uc-fl-p1-intake', co: 'fl', name: 'Page the on-call engineer the moment an outage starts', how: 'Slow night-time response leads to refunds on service fees. Assumes 30 fewer refunds a year at about $3,000 each.', has: ['30 avoided', '$3,000'] },
  { id: 'uc-bpi-pressline', co: 'bpi', name: 'Answer the press line after hours', how: 'A missed late-night press call can cost a client. Assumes one client kept every two years, worth about $300K a year.', has: ['0.5 avoided', '$300,000'] },
];
/* Revenue agents: sales = est. annual value / the margin named in its formula (`cut` must appear in the formula). */
const AGENTS = [
  { id: 'ag-ts-03', co: 'ts', cut: '22% gross margin', name: 'Give inside sales a daily reorder call list', how: 'Labs run low and reorder somewhere else. Assumes $50K more sales for each of 60 reps.', has: ['60 inside sales reps', '$50,000'] },
  { id: 'ag-ts-02', co: 'ts', cut: '22% gross margin', name: 'Answer lab quote requests in minutes, not days', how: 'Slow quotes lose orders. Assumes 2 more wins per 100 of 30,000 quotes a year, at about $3,000 each.', has: ['30,000 quotes', '2-pt win-rate', '$3,000'] },
  { id: 'ag-ts-04', co: 'ts', cut: '22% gross margin', name: 'Reach new labs the week their grants land', how: 'A new research grant means a new lab to equip. Assumes 3% of 1,500 new grants become accounts spending $40K.', has: ['1,500 relevant new awards', '3% conversion', '$40,000'] },
  { id: 'ag-fl-02', co: 'fl', cut: '70% contribution margin', name: 'Sell a bill-check add-on to law-firm clients', how: 'Law-firm bills get rejected when they break client billing rules. Assumes 40 firms pay $30K a year.', has: ['40 law-firm clients', '$30,000'] },
  { id: 'ag-fl-07', co: 'fl', cut: '40% contribution margin', name: 'Spot unhappy clients 90 days before renewal', how: 'Clients can leave with little warning. Assumes 2 clients a year are kept, at $250K each.', has: ['2 at-risk clients', '$250,000'] },
  { id: 'ag-bpi-01', co: 'bpi', cut: '50% margin', name: 'Sell always-on news monitoring to clients', how: 'Clients often hear about bad stories late. Assumes 8 new monitoring clients a year at $120K each.', has: ['8 new always-on monitoring retainers', '$120,000'] },
  { id: 'ag-bpi-06', co: 'bpi', cut: '60% margin', name: 'Sell a bill and rule tracker to clients', how: 'Clients need to know when laws and rules on their issues change. Assumes 6 clients pay $60K a year.', has: ['6 clients subscribing', '$60,000'] },
  { id: 'ag-fh-02', co: 'fh', cut: '40% of returned value', name: 'Help online shoppers pick the right size', how: 'About 19% of online orders come back. A size finder cuts returns by about a tenth, so more sales stick.', has: ['19.3% return rate', '9.8% fewer returns'] },
  { id: 'ag-fh-03', co: 'fh', cut: '55% gross margin', name: 'Email past buyers when beach weather arrives', how: 'Most buyers order only once. Assumes 2 in 100 of 80,000 past buyers order again, at about $110.', has: ['80,000 customers', '2-pt repeat-rate', '$110'] },
  { id: 'ag-cet-06', co: 'cet', cut: '60% margin', name: 'Sell upkeep plans for the EV chargers CET installs', how: 'Chargers break and sit idle when no one is watching. Assumes 300 chargers at $25 a month each.', has: ['300 managed ports', '$25 per port per month'] },
];
/* Punctual Pros Phase 1 ad plan, grouped by what the money buys. */
const ADS = [
  { ch: ['google_lsa', 'paid_search_pmax'], name: 'Buy more Google local and search leads, more when storms hit', lead: 'People search for “no heat” and “frozen pipe” when the weather turns.' },
  { ch: ['ctv_zip_targeted', 'meta_social'], name: 'Run TV and social ads in the best zip codes', lead: 'Homeowners call the name they already know when something breaks.' },
  { ch: ['new_mover_mail'], name: 'Mail every new homeowner in their first week', lead: 'Every home sale brings a new owner who needs a repair company.' },
];
const num = v => (typeof v === 'number' && isFinite(v) ? v : NaN);
const ok = v => isFinite(v) && v > 0;
const usd = n => { const k = Math.round(n / 1e3); return n >= 1e6 || k >= 1000 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${k}K` : `$${Math.round(n)}`; };
const spend = n => `$${n % 1000 === 0 ? n / 1000 : (n / 1000).toFixed(1)}K`;
const about = n => (n >= 100 ? Math.round(n / 10) * 10 : Math.round(n)).toLocaleString('en-US');
const link = (p, q = '') => ({ href: ROOT + p[0] + q, source: p[1] });
const hasAll = (s, parts) => typeof s === 'string' && parts.every(x => s.includes(x));

async function components() {
  const [voice, ads, cet, agents] = await Promise.all(['voice_ai', 'pp_ads', 'cet_opportunities', 'ai_agents_portfolio'].map(n => Data.research(n)));
  const c = [];
  const push = (co, name, annual, how, src, ln) => { if (ok(annual) && CO[co]) c.push({ company: co, label: name, annual, how, src, ...ln }); };

  /* Voice AI: one row per use case; if the use cases are missing, fall back to the revenue model's two totals. */
  const uc = new Map((voice?.items || []).filter(i => i?.kind === 'use_case').map(i => [i.id, i]));
  for (const v of VOICE) {
    const it = uc.get(v.id); if (!it) continue;
    push(v.co, v.name, num(it.est_annual_value_usd), hasAll(it.value_formula, v.has) ? v.how : 'Inputs and sources are on the Voice AI research page.', `voice_ai · ${v.id}`, link(PAGE.voice));
  }
  const vm = voice?.meta?.pp_revenue_model;
  if (vm && !c.some(x => x.company === 'pp')) {
    push('pp', 'Answer every missed call with voice AI', num(vm.recovered_revenue_annual_usd), 'About 15% of calls are missed today, after hours and on busy days. Voice AI answers all of them.', 'voice_ai · pp_revenue_model', link(PAGE.voice));
    push('pp', 'Call members before their plan runs out', num(vm.outbound_renewal_uplift_usd), 'Calls lift member renewals; inputs are on the Voice AI research page.', 'voice_ai · pp_revenue_model', link(PAGE.voice));
  }

  /* Ad plan: Phase 1 channels, monthly sales x 12. */
  const mp = (ads?.items || []).find(i => i?.kind === 'media_plan' && /phase1/i.test(i.id || '')) || (ads?.items || []).find(i => i?.kind === 'media_plan');
  const mix = Array.isArray(mp?.channel_mix) ? mp.channel_mix : [];
  for (const a of ADS) {
    const rows = mix.filter(r => a.ch.includes(r?.channel)); if (!rows.length) continue;
    const sum = k => rows.reduce((s, r) => s + (num(r[k]) || 0), 0);
    const rev = sum('est_revenue_usd'), cost = sum('monthly_usd'), jobs = sum('est_booked_jobs');
    const how = ok(cost) && ok(jobs) ? `${a.lead} ${spend(cost)} a month in ads books about ${about(jobs)} jobs at about $${about(rev / jobs)} each.` : a.lead;
    push('pp', a.name, rev * 12, how, `pp_ads · ${mp.id || 'media_plan'}`, link(PAGE.ads));
  }

  /* CET: open bids that list a value, at a 10% win rate. */
  const open = (cet?.items || []).filter(o => o?.stage === 'open');
  const valued = open.filter(o => ok(num(o.est_value_usd)));
  if (valued.length) {
    const v = valued.reduce((s, o) => s + o.est_value_usd, 0);
    const rest = open.length > valued.length ? '; the rest count as zero' : '';
    const worth = valued.length === 1 ? `(${usd(v)})` : `(${usd(v)} in all)`;
    const lead = open.length > valued.length ? `${open.length} bids are open; ${valued.length} ${valued.length === 1 ? 'lists a value' : 'list values'} ${worth}.` : `${valued.length} open ${valued.length === 1 ? 'bid lists a value' : 'bids list values'} ${worth}.`;
    push('cet', 'Bid the open jobs on the radar', v * BID_WIN, `${lead} Counted at a ${Math.round(BID_WIN * 100)}% win rate${rest}.`, 'cet_opportunities · open stage', link(PAGE.radar));
  }

  /* AI agents that add sales: the sales behind the estimate, counted at half. */
  const ag = new Map((agents?.items || []).filter(i => i?.kind === 'agent').map(i => [i.id, i]));
  for (const a of AGENTS) {
    const it = ag.get(a.id); const f = it?.est_annual_value_formula;
    if (!it || typeof f !== 'string' || !f.includes(a.cut)) continue;
    const margin = parseFloat(a.cut) / 100; if (!ok(margin)) continue;
    const sales = num(it.est_annual_value_usd) / margin * AGENT_SHARE;
    push(a.co, a.name, sales, `${hasAll(f, a.has) ? a.how : 'Inputs are on the AI agents page.'} Counted at half.`, `ai_agents_portfolio · ${a.id}`, link(PAGE.agents, `?agent=${encodeURIComponent(a.id)}`));
  }
  return c;
}

/* Group by company (largest first), levers largest first within each company. */
function groups(comps) {
  const by = new Map();
  for (const x of comps) { if (!by.has(x.company)) by.set(x.company, []); by.get(x.company).push(x); }
  return [...by].map(([co, rows]) => ({ co, rows: rows.sort((a, b) => b.annual - a.annual), total: rows.reduce((s, r) => s + r.annual, 0) })).sort((a, b) => b.total - a.total);
}
const NOTE = [
  'All figures are extra sales a year, not profit. Each is an analyst estimate from public benchmarks, not a forecast. The clock spreads the total over every second of the year.',
  'Nothing is counted twice. Punctual Pros’ AI agents for missed calls, renewals, storm days and new-homeowner mail, the quick callback on ad leads, and CET’s bid-scoring and storm-crew agents are left out, because the rows above already cover that work.',
  'AI agent rows count half of their sales, the same cut the AI agents page uses. Cost savings, add-on deals and growth-plan targets are left out.',
];
function panel(comps, annual) {
  const est = '<small class="rc-est">est.</small>';
  let wide = true; try { wide = matchMedia('(min-width: 640px)').matches; } catch { /* no matchMedia: open every group */ }
  const lv = x => `<div class="rc-row rc-lv"><span class="rc-lv-n">${esc(x.label)}</span><b>${esc(usd(x.annual))} ${est}</b><span class="rc-lv-h">${esc(x.how)} <a href="${esc(x.href)}">${esc(x.source)}&nbsp;<span aria-hidden="true">→</span></a></span></div>`;
  const grp = (g, i) => `<details class="rc-grp" style="--co:${CO[g.co][1]}"${wide || i === 0 ? ' open' : ''}><summary class="rc-grp-h"><span class="sys-dot" aria-hidden="true"></span><span class="rc-grp-n">${esc(CO[g.co][0])}<small>${g.rows.length} ${g.rows.length === 1 ? 'lever' : 'levers'}</small></span><b>${esc(usd(g.total))} ${est}</b></summary>${g.rows.map(lv).join('')}</details>`;
  return `<div class="rc-pop-t">The levers behind the number</div><p class="rc-pop-s">Each line says what is missed today, the fix, and the extra sales it adds a year (est.). Tap or click a company to show or hide its levers.</p>${groups(comps).map(grp).join('')}<div class="rc-tot"><span>Total extra sales a year</span><b>${esc(usd(annual))} ${est}</b></div><div class="rc-note">${NOTE.map(p => `<p>${esc(p)}</p>`).join('')}</div>`;
}
const CSS = `.rc{font-family:var(--sys-font,Inter,system-ui,sans-serif);color:var(--sys-ink);position:relative}
.rc-cap{font-size:var(--sys-fs-xs,12px);font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--sys-mute)}
.rc-cap .sys-est,.rc-badge{text-transform:none;letter-spacing:.03em}
.rc-val{font-family:var(--sys-mono,"JetBrains Mono",ui-monospace,Menlo,monospace);font-weight:700;font-size:clamp(34px,6vw,64px);letter-spacing:-.03em;line-height:1.05;margin:6px 0 4px;font-variant-numeric:tabular-nums;color:var(--sys-brand)}
.rc-sub{font-size:12.5px;color:var(--sys-mute)}
.rc-why{border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
.rc-why:focus-visible{outline:none;box-shadow:var(--sys-ring);border-radius:4px}
.rc-pop{margin-top:10px;padding:12px 14px;border-radius:var(--sys-r-sm,10px);background:var(--sys-bg-2);border:1px solid var(--sys-line);font-size:12.5px;max-width:640px;overflow-wrap:anywhere}
.rc-pop-t{font-weight:700;margin-bottom:2px;color:var(--sys-ink);font-size:1.08em}
.rc-pop-s{margin:0 0 4px;color:var(--sys-mute);line-height:1.45}
.rc-grp{margin-top:12px}
.rc-grp-h{display:flex;align-items:center;gap:8px;padding:4px 0 6px;border-bottom:2px solid color-mix(in srgb,var(--co,var(--sys-line)) 55%,var(--sys-line));cursor:pointer;list-style:none;border-radius:2px}
.rc-grp-h::-webkit-details-marker{display:none}
.rc-grp-h::after{content:"";flex:none;width:6px;height:6px;margin:0 3px 3px 2px;border-right:1.5px solid var(--sys-mute);border-bottom:1.5px solid var(--sys-mute);transform:rotate(45deg);transition:transform var(--sys-t,.2s)}
.rc-grp[open]>.rc-grp-h::after{transform:rotate(-135deg);margin-bottom:-3px}
.rc-grp-h:focus-visible{outline:none;box-shadow:var(--sys-ring)}
.rc-grp-h .sys-dot{background:var(--co)}
.rc-grp-n{flex:1;min-width:0;font-weight:700;color:var(--sys-ink)}
.rc-grp-n small{margin-left:8px;font-weight:500;font-size:11px;color:var(--sys-mute)}
.rc-grp-h b,.rc-tot b{font-family:var(--sys-mono,ui-monospace,monospace);font-weight:600;font-variant-numeric:tabular-nums;color:var(--sys-ink);white-space:nowrap}
.rc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:6px 0;border-top:1px solid var(--sys-line)}
.rc-row b{font-variant-numeric:tabular-nums;color:var(--sys-ink)}
.rc-row a{grid-column:1/-1;color:var(--sys-mute);font-size:11px}
.rc-lv{padding:8px 0 7px;align-items:baseline}
.rc-grp-h+.rc-lv{border-top:0}
.rc-lv-n{font-weight:600;color:var(--sys-ink);line-height:1.35}
.rc-lv b{font-family:var(--sys-mono,ui-monospace,monospace);font-weight:600;white-space:nowrap;text-align:right}
.rc-lv-h{grid-column:1/-1;color:var(--sys-mute);font-size:.94em;line-height:1.45}
.rc-lv-h a{font-size:inherit;color:var(--sys-ink-2);text-underline-offset:2px;white-space:nowrap}
.rc-est{font-family:var(--sys-font,Inter,system-ui,sans-serif);font-size:10.5px;font-weight:500;color:var(--sys-mute);letter-spacing:.02em}
.rc-tot{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-top:14px;padding-top:9px;border-top:2px solid var(--sys-line-2,var(--sys-line));font-weight:700;color:var(--sys-ink)}
.rc-note{margin-top:8px;color:var(--sys-mute);font-size:11.5px;line-height:1.5}
.rc-note p{margin:0 0 4px}
.rc-compact .rc-val{font-size:22px;margin:2px 0}.rc-compact .rc-cap{font-size:10px}.rc-compact .rc-sub{display:none}`;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const Counter = {
  async mount(el, opts = {}) {
    const comps = await components(); const annual = comps.reduce((a, x) => a + x.annual, 0); const perSec = annual / YEAR;
    if (!ok(annual)) { el.innerHTML = ''; return { perSec: 0, annual: 0, comps, baseline: opts.baseline === 'today' ? 'today' : 'load', destroy() {} }; }
    const theme = opts.theme || 'light';
    const today = opts.baseline === 'today';
    const minDisplay = opts.minDisplay ?? (today ? 100 : 0);
    const caption = opts.caption || (today ? 'Revenue left on the table today' : 'Revenue left on the table since you opened this page');
    el.innerHTML = `<div class="rc ${theme === 'dark' ? 'rc-dark' : ''} ${opts.compact ? 'rc-compact' : ''}"><div class="rc-cap">${esc(caption)}<span class="sys-est rc-badge">est.</span></div><div class="rc-val" aria-live="off">${minDisplay > 0 ? '—' : '$0'}</div><div class="rc-sub">≈ ${esc(Fmt.money(annual))} a year in extra sales (est.) · <button type="button" class="rc-why" aria-expanded="false">how is this computed?</button></div><div class="rc-pop" hidden>${panel(comps, annual)}</div></div>`;
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
