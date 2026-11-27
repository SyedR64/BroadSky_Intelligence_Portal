/* Marketing engine: a company's marketing team drafts ads and lines them up for the ad platforms, connected TV first.
   Four screens:
     board  "All six"   every company's campaigns, planned spend and drafts on one board (firm levels only)
     build  "Campaign"  the brief (brand, market, goal, budget, channel mix with each channel's formats) and the ad
                        concepts for it: storyboard frames, script, headlines and copy variants
     cost   "Cost"      what the set of spots costs to make this way against a conventional shoot, and what the monthly
                        budget buys by channel
     queue  "Queue"     every ad and its target platform as a draft with Approve and Discard, and the named ad
                        platforms as connections that are not linked
   Data: data/research/marketing_engine.json. Rates there are public figures with their sources; campaigns, budgets and
   concepts are example records that stand in for a company's own marketing records. Every computed figure carries the
   est. badge. NOTHING IS SENT: there is no ad account, no sign-in and no call to any ad platform in this file. Approve
   and Discard only change the draft's state, kept for the browser tab (sessionStorage 'bsp-mk') with the working brief,
   because a tab link does not carry address parameters from one screen to the next. */
import * as Copy from './copy.js?v=20261125120619';
import { Session } from '../assets/session.js?v=20261125120619';

const V = '20261125120619';
const css = (id, file) => { if (document.getElementById(id)) return; const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = `modules/${file}?v=${V}`; document.head.appendChild(l); };
const ASSET = f => new URL(`../assets/img/brands/${f}`, import.meta.url).href;
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const EST = Copy.EST;
const ORDER = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];   // the order every portfolio screen uses (UNIFIED.md §6)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };
const usd = n => n == null || !isFinite(n) ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
const num = n => n == null || !isFinite(n) ? '—' : Math.round(n).toLocaleString('en-US');
const pct = x => `${Math.round(x * 100)}%`;
const tc = s => `0:${String(s).padStart(2, '0')}`;
const words = n => ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'][n] || String(n);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ── the working state, shared by the four screens for this browser tab ───── */
const KEY = 'bsp-mk';
const S = (() => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } })();
for (const k of ['cur', 'briefs', 'dec', 'sel']) if (!S[k] || typeof S[k] !== 'object') S[k] = {};
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch { } };

/* ── the model: campaigns, shares, drafts, cost and reach (all plain functions of the data and S) ───────────── */
const keyOf = (co, brand, market) => `${co}|${brand}|${market}`;
const marketOf = (D, c) => D.companies[c.co].markets.find(m => m.id === c.market);
const goalOf = (D, c) => D.companies[c.co].goals.find(g => g.id === c.goal) || D.companies[c.co].goals[0];
const fill = (s, mk) => String(s ?? '').replaceAll('{m}', mk.short);

/** One campaign: the listed example record if there is one, with the changes made in this tab on top. */
function campaign(D, co, brand, market) {
  const C = D.companies[co], rec = D.items.find(i => i.co === co && i.brand === brand && i.market === market);
  const o = S.briefs[keyOf(co, brand, market)] || {};
  const mix = (o.mix || Object.keys(C.weights).filter(k => C.weights[k] > 0)).filter(id => D.channels.some(ch => ch.id === id));
  return { co, brand, market, key: keyOf(co, brand, market), listed: !!rec, goal: o.goal || rec?.goal || C.goals[0].id, mix, budget: o.budget || rec?.budget || C.budget };
}
/** The brief the builder is on: the last one chosen for this company, else its first listed campaign. */
function current(D, co) {
  const C = D.companies[co], cur = S.cur[co], first = D.items.find(i => i.co === co);
  const ok = cur && C.brands.includes(cur.brand) && C.markets.some(m => m.id === cur.market);
  return ok ? campaign(D, co, cur.brand, cur.market) : campaign(D, co, first.brand, first.market);
}
/** A company's campaigns: the listed ones, then the builder's brief when it is a new one. */
function campaigns(D, co) {
  const out = D.items.filter(i => i.co === co).map(i => campaign(D, co, i.brand, i.market));
  const cur = current(D, co);
  return out.some(c => c.key === cur.key) ? out : [...out, cur];
}
/** Budget share by channel: the company's weights over the channels switched on (a channel it does not weight gets 5). */
function shares(D, c) {
  const w = D.companies[c.co].weights, on = D.channels.map(ch => ch.id).filter(id => c.mix.includes(id));
  const wt = id => w[id] || 5, tot = on.reduce((a, id) => a + wt(id), 0) || 1;
  return Object.fromEntries(on.map(id => [id, wt(id) / tot]));
}
const formatOf = (ch, len) => ch === 'ctv' ? `${Math.max(15, len)} s spot` : ch === 'yt' ? (len <= 6 ? '6 s bumper' : len <= 15 ? '15 s non-skippable' : '30 s skippable')
  : ch === 'social' ? '15 s vertical video' : ch === 'search' ? 'Responsive search ad' : 'Sponsored post';
/** The placements of a campaign: each concept on each channel it runs on that the mix has, to that company's platform. */
function drafts(D, c) {
  const C = D.companies[c.co], sh = shares(D, c), list = D.concepts[c.brand], per = {};
  for (const k of list) for (const ch of k.runs) if (sh[ch] != null) per[ch] = (per[ch] || 0) + 1;
  const out = [];
  for (const k of list) for (const ch of k.runs) if (sh[ch] != null) {
    out.push({ id: `${c.key}|${k.id}|${ch}`, c, k, ch, pf: D.platforms.find(p => p.id === C.targets[ch]), format: formatOf(ch, k.len), spend: c.budget * sh[ch] / per[ch] });
  }
  return out;
}
/** What the brand's set of spots costs to make. Each concept ships with one cut-down. Generated seconds allow for
    takes and retakes (data: make.takes, make.retry); the price per second is the model's list price. */
function makeCost(D, brand, tierId) {
  const M = D.make, tier = M.tiers.find(t => t.id === tierId) || M.tiers[1], list = D.concepts[brand];
  const finished = list.reduce((a, k) => a + k.len + (k.len >= 30 ? 15 : 6), 0);
  const generated = finished * M.takes * M.retry, gen = generated * tier.usd_per_s;
  return { tier, spots: list.length, finished, generated, gen, ai: gen + M.finishing_usd, conv: M.conventional.basic.map(x => x * list.length), high: M.conventional.high * list.length };
}
/** What the monthly budget buys on each channel of the mix: impressions at a cost per thousand, or leads at a cost per lead. */
function reach(D, c) {
  const C = D.companies[c.co], sh = shares(D, c);
  return D.channels.filter(ch => sh[ch.id] != null).map(ch => {
    const spend = c.budget * sh[ch.id];
    // the search rate is per sector; the social rate is Meta's, so it is not used where the company's social platform is another one
    const r = ch.id === 'search' ? D.rates.search.by_sector[C.sector] : ch.id === 'social' && C.targets.social !== 'meta' ? null : D.rates[ch.id];
    return { ch, share: sh[ch.id], spend, r: r || null, unit: ch.unit, buys: !r ? null : ch.unit === 'cpl' ? spend / r.value : spend / r.value * 1000 };
  });
}

/** How widely the budget covers the market: impressions a month across the mix, and per home where the market's homes
    are known. Views per home is an average (impressions over homes), not a count of homes reached. */
function cover(D, c) {
  const rows = reach(D, c).filter(r => r.unit === 'cpm' && r.buys != null), mk = marketOf(D, c);
  const imps = rows.reduce((a, r) => a + r.buys, 0), ctv = rows.find(r => r.ch.id === 'ctv')?.buys || 0;
  return { imps, ctv, homes: mk.homes || null, per: mk.homes ? imps / mk.homes : null, perCtv: mk.homes ? ctv / mk.homes : null };
}

/* ── shared pieces of every screen ─────────────────────────────────────────── */
const live = ctx => ctx.app.current === ctx.module && ctx.app.view === ctx.view;
async function boot(ctx) {
  css('css-marketing', 'marketing.css'); css('css-connect', 'connect.css');   // the platform rows are the Connections rows
  ctx.el.innerHTML = ctx.ui.loading('Loading the marketing engine');
  const [D] = await Promise.all([ctx.data.load('marketing_engine'), Session.ready()]);
  if (!live(ctx)) return null;
  const own = Session.co(), want = own || ctx.params.co || S.co, co = D.companies[want] ? want : ORDER[0];
  if (!own) S.co = co;
  // a link from the board names the campaign to open
  const C = D.companies[co], p = ctx.params;
  if (p.brand && C.brands.includes(p.brand) && C.markets.some(m => m.id === p.market)) S.cur[co] = { brand: p.brand, market: p.market };
  save();
  return { D, co, firm: !own, src: Object.fromEntries(D.sources.map(s => [s.id, s])) };
}
const cosChips = (B, view) => !B.firm ? '' : `<nav class="sys-chips mk-cos" aria-label="Company">${ORDER.map(id => `<a class="sys-chip" data-co="${id}" href="#/marketing/${view}?co=${id}"${id === B.co ? ' aria-current="true"' : ''}>${h(B.D.companies[id].name)}</a>`).join('')}</nav>`;
const brandChips = (B, c) => { const C = B.D.companies[c.co]; return C.brands.length < 2 ? '' : `<span class="sys-chips" role="group" aria-label="Brand">${C.brands.map(b => `<button type="button" class="sys-chip" data-brand="${b}" aria-pressed="${b === c.brand}">${h(B.D.brands[b].short)}</button>`).join('')}</span>`; };
const budgetSelect = c => { const opts = [...new Set([2000, 5000, 8000, 10000, 12000, 15000, 20000, 30000, 50000, c.budget])].sort((a, b) => a - b); return `<select class="sys-input" data-set="budget">${opts.map(v => `<option value="${v}"${v === c.budget ? ' selected' : ''}>${usd(v)}</option>`).join('')}</select>`; };
const srcLink = (B, id) => { const s = B.src[id]; return s ? `<a href="${h(s.url)}" target="_blank" rel="noopener" title="${h(s.title)}">${h(s.publisher)}</a>` : ''; };
const METHOD = [
  'Campaigns, budgets and ad concepts are example records. Taglines are quoted from each brand\'s own site.',
  'Writing concepts live and posting to an ad platform are not connected. Approve marks a draft; nothing is sent.',
  '<b>est.</b> marks a figure worked out here from the public rates in Sources.',
  'Cost to make: finished seconds, times three takes, times 1.3 for retakes, at the model\'s list price a second, plus $150 for voice, music and stills. Staff time is left out on both sides.',
  'Draft, Standard and Premium are the list prices of three video models: Gemini Omni Flash 1.2, Kling 4 and Seedance 2.5.',
  'Conventional production: $1,000 to $5,000 for a basic spot and $10,000 or more for a high-quality one.',
  'Impressions: spend divided by the cost per thousand. Leads: spend divided by the cost per lead.',
  'The YouTube rate is 2024 campaign data. The social rate is the 2025 average for online retailers on Facebook and Instagram.',
  'Homes: Census housing units in the market\'s counties.',
  'Ad views per home: impressions divided by homes. It is an average, not the number of homes reached.',
];
/** The as-of date, the method list and the sources this screen cites; the shell moves them behind its header controls. */
const foot = (B, used) => `<span data-asof>${h(day(B.D.as_of))}</span>
  <section class="mk-method" data-method><h2 class="sys-card-title">How the numbers are made</h2><ul class="sys-card-list">${METHOD.map(m => `<li>${m}</li>`).join('')}</ul></section>
  <section class="mk-sources" data-src><ul class="sys-card-list">${B.D.sources.filter(s => used.has(s.id)).map(s => `<li><a href="${h(s.url)}" target="_blank" rel="noopener">${h(s.title)}</a> · ${h(s.publisher)}</li>`).join('')}</ul></section>`;
const RATE_SRC = ['adwave_ctv', 'vibe_pricing', 'universal_ads', 'disney_cm', 'storegrowers_yt', 'madgicx_social', 'searchlight_lsa', 'vibe_local_tv', 'runway_api', 'census_acs'];
const keepFocus = (el, sel) => { const n = sel && el.querySelector(sel); if (n) n.focus({ preventScroll: true }); };
/** The selector of the control a click or change came from, so focus can go back to it after the screen is drawn again. */
const selOf = t => { const d = t?.closest?.('[data-set],[data-ch],[data-brand],[data-con],[data-tier],[data-qf],[data-freq]'); if (!d) return ''; const a = ['set', 'ch', 'brand', 'con', 'tier', 'qf', 'freq'].find(k => d.dataset[k] != null); return `[data-${a}="${CSS.escape(d.dataset[a])}"]`; };

/* ── storyboard frames ─────────────────────────────────────────────────────── */
const ICON = {
  phone: '<rect x="15" y="6" width="18" height="36" rx="4"/><path d="M21 12h6M20 22h8M20 28h5"/>',
  clock: '<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 5"/>',
  thermo: '<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="7"/><path d="M24 9v4M39 24h-4M9 24h4M24 24l4-5"/>',
  snow: '<path d="M24 6v36M8.4 15l31.2 18M39.6 15 8.4 33M24 12l-4-4M24 12l4-4M24 36l-4 4M24 36l4 4"/>',
  home: '<path d="M7 23 24 8l17 15"/><path d="M12 20v20h24V20"/><path d="M20 40V29h8v11"/>',
  boxes: '<rect x="7" y="24" width="16" height="16" rx="1.5"/><rect x="25" y="24" width="16" height="16" rx="1.5"/><rect x="16" y="8" width="16" height="16" rx="1.5"/><path d="M15 24v5M33 24v5M24 8v5"/>',
  door: '<rect x="14" y="6" width="20" height="36" rx="1.5"/><circle cx="29" cy="25" r="1.4"/><path d="M8 42h32"/>',
  drop: '<path d="M24 6c7 9 11 15 11 21a11 11 0 0 1-22 0c0-6 4-12 11-21Z"/><path d="M19 28a5 5 0 0 0 5 5"/>',
  wrench: '<path d="M30 7a9 9 0 0 0-8 12.500L8 33.500a3.500 3.500 0 0 0 5 5L27 24.500A9 9 0 0 0 39.500 16l-5.500 5-5-1-1-5 5.500-5.500A9 9 0 0 0 30 7Z"/>',
  van: '<path d="M5 14h23v18H5z"/><path d="M28 19h8l7 7v6H28"/><circle cx="14" cy="34" r="3.500"/><circle cx="35" cy="34" r="3.500"/>',
  bulb: '<path d="M17 28a11 11 0 1 1 14 0c-1.500 1.400-2 3-2 5H19c0-2-.500-3.600-2-5Z"/><path d="M20 38h8M21 42h6"/>',
  panel: '<rect x="11" y="6" width="26" height="36" rx="2"/><path d="M17 14h6M17 21h6M17 28h6M27 14h4M27 21h4M27 28h4M17 35h14"/>',
  bolt: '<path d="M27 5 11 27h11l-3 16 18-24H26l1-14Z"/>',
  plug: '<path d="M18 6v10M30 6v10M13 16h22v6a11 11 0 0 1-22 0v-6ZM24 33v9"/>',
  car: '<path d="M8 30v-6l4-9h24l4 9v6"/><path d="M6 30h36v5H6z"/><circle cx="14" cy="38" r="3"/><circle cx="34" cy="38" r="3"/><path d="M12 24h24"/>',
  building: '<path d="M9 42V12l15-6v36M24 18l15 5v19M5 42h38"/><path d="M14 18h5M14 25h5M14 32h5M29 28h5M29 35h5"/>',
  people: '<circle cx="17" cy="16" r="5"/><circle cx="33" cy="18" r="4"/><path d="M7 38c0-7 4-11 10-11s10 4 10 11M29 28c6 0 12 3 12 10"/>',
  hardhat: '<path d="M8 32a16 16 0 0 1 32 0"/><path d="M5 32h38v5H5zM20 16v9M28 16v9"/>',
  laptop: '<rect x="10" y="10" width="28" height="19" rx="2"/><path d="M5 36h38l-3-7H8l-3 7Z"/>',
  headset: '<path d="M10 28v-4a14 14 0 0 1 28 0v4"/><rect x="7" y="26" width="7" height="11" rx="2.500"/><rect x="34" y="26" width="7" height="11" rx="2.500"/><path d="M38 37c0 4-4 6-10 6"/>',
  check: '<circle cx="24" cy="24" r="16"/><path d="m16 24 6 6 11-12"/>',
  doc: '<path d="M13 5h15l8 8v30H13z"/><path d="M28 5v8h8M18 22h12M18 28h12M18 34h7"/>',
  shield: '<path d="M24 5 9 11v11c0 10 6 17 15 21 9-4 15-11 15-21V11L24 5Z"/><path d="m17.500 24 4.500 4.500 8.500-9.500"/>',
  flask: '<path d="M19 6h10M21 6v12L10 38a3 3 0 0 0 2.700 4.500h22.600A3 3 0 0 0 38 38L27 18V6"/><path d="M15 30h18"/>',
  box: '<path d="M24 5 7 13v22l17 8 17-8V13L24 5Z"/><path d="M7 13l17 8 17-8M24 21v22"/>',
  mic: '<rect x="18" y="5" width="12" height="22" rx="6"/><path d="M11 22a13 13 0 0 0 26 0M24 35v8M17 43h14"/>',
  chart: '<path d="M7 41h34M12 41V27M21 41V15M30 41V22M39 41V9"/>',
  bottle: '<path d="M20 5h8v6l4 7v22a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V18l4-7V5Z"/><path d="M16 25h16M16 33h16"/>',
  wave: '<path d="M4 20c5-6 9-6 14 0s9 6 14 0 7-5 12-1M4 32c5-6 9-6 14 0s9 6 14 0 7-5 12-1"/>',
  sun: '<circle cx="24" cy="24" r="8"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.600 10.600l4.200 4.200M33.200 33.200l4.200 4.200M10.600 37.400l4.200-4.200M33.200 14.800l4.200-4.200"/>',
  shorts: '<path d="M9 9h30l3 30H27l-3-14-3 14H6L9 9Z"/><path d="M9 15h30"/>',
};
const icon = k => `<svg class="mk-ico" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${ICON[k] || ICON.clock}</svg>`;
/** One 16:9 frame of a concept. The last frame is the end card: the brand's own logo, its tagline and the goal's line. */
function frame(B, c, k, i, cls = '') {
  const D = B.D, b = k.beats[i], br = D.brands[c.brand], mk = marketOf(D, c), to = k.beats[i + 1]?.t ?? k.len;
  const time = `<span class="mk-tc sys-num">${tc(b.t)}–${tc(to)}</span>`;
  if (b.icon === 'end') {
    const tag = br.tagline || fill(b.text, mk), cta = goalOf(D, c).cta;
    return `<div class="mk-frame mk-frame--end ${cls}" data-sys-theme="${br.plate === 'dark' ? 'dark' : 'light'}">${time}<span class="mk-end"><img src="${ASSET(br.logo)}" alt="${h(br.name)}">${tag ? `<span class="mk-tag">${h(tag)}</span>` : ''}${cta ? `<span class="mk-cta">${h(cta)}</span>` : ''}</span></div>`;
  }
  return `<div class="mk-frame ${cls}" data-sys-theme="dark">${time}<span class="mk-shot">${h(b.shot)}</span>${icon(b.icon)}${b.text ? `<span class="mk-super">${h(fill(b.text, mk))}</span>` : ''}</div>`;
}
const endCard = (B, c, k, cls) => frame(B, c, k, k.beats.length - 1, cls);

/* ── Campaign: the brief and its concepts ──────────────────────────────────── */
async function build(ctx) {
  const B = await boot(ctx); if (!B) return;
  const { el } = ctx, { D, co } = B, C = D.companies[co];
  let beat = 0, timer = null;
  const stop = () => { clearInterval(timer); timer = null; };
  el.innerHTML = `<div class="m-mk" data-co="${co}" data-no-gloss><h1 class="sys-h1">Campaign</h1><div class="mk-body"></div>${foot(B, new Set([...RATE_SRC, 'google_video_formats', 'google_rsa', ...C.brands.map(b => D.brands[b].src)]))}</div>`;
  const body = el.querySelector('.mk-body');

  const view = () => {
    const c = current(D, co), list = D.concepts[c.brand];
    return { c, list, k: list.find(x => x.id === S.sel[c.brand]) || list[0], mk: marketOf(D, c), br: D.brands[c.brand], sh: shares(D, c) };
  };
  /** The big frame, the strip and the script follow the frame in view; nothing else is drawn again. */
  const stage = () => {
    const { c, k } = view();
    body.querySelector('.mk-screen-frame').innerHTML = frame(B, c, k, beat, 'mk-frame--big');
    body.querySelectorAll('[data-beat]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.beat === beat)));
    const p = body.querySelector('[data-play]'); if (p) { p.textContent = timer ? 'Pause' : 'Play'; p.setAttribute('aria-pressed', String(!!timer)); }
  };
  const draw = () => {
    const { c, list, k, mk, br, sh } = view(), dr = drafts(D, c), waiting = dr.filter(d => !S.dec[d.id]).length, ki = list.indexOf(k), cv = cover(D, c);
    const top = cv.per == null ? 0 : Math.max(4, Math.ceil(cv.per)), at = v => `${Math.min(100, v / top * 100).toFixed(1)}%`;
    if (beat >= k.beats.length) beat = 0;
    const chName = id => D.channels.find(ch => ch.id === id).short;
    body.innerHTML = `
      <header class="page-head"><div class="page-head-copy"><p class="sys-lead sub">${cv.per != null ? `${h(mk.name)}: ${num(cv.homes)} homes. ${usd(c.budget)} a month is ${cv.per.toFixed(1)} ad views per home ${EST}`
        : `${h(mk.name)}: ${usd(c.budget)} a month is ${num(cv.imps)} ad views ${EST}`}</p></div></header>
      ${cosChips(B, 'build')}
      <section class="sys-card mk-brief" aria-label="Brief">
        <div class="sys-filters mk-fields">
          <div class="sys-field"><span class="sys-field-label">Brand</span>${brandChips(B, c) || `<span class="mk-static">${h(br.name)}</span>`}</div>
          <label class="sys-field"><span class="sys-field-label">Market</span><select class="sys-input" data-set="market">${C.markets.map(m => `<option value="${m.id}"${m.id === c.market ? ' selected' : ''}>${h(m.name)}</option>`).join('')}</select></label>
          <label class="sys-field"><span class="sys-field-label">Goal</span><select class="sys-input" data-set="goal">${C.goals.map(g => `<option value="${g.id}"${g.id === c.goal ? ' selected' : ''}>${h(g.name)}</option>`).join('')}</select></label>
          <label class="sys-field"><span class="sys-field-label">Per month</span>${budgetSelect(c)}</label>
        </div>
        <div class="mk-chs" role="group" aria-label="Channel mix">${D.channels.map((ch, i) => {
          const on = sh[ch.id] != null, fmts = ch.formats.filter(f => !f.only || f.only === C.sector);
          return `<button type="button" class="mk-ch" data-ch="${ch.id}" aria-pressed="${on}"${ch.id === 'ctv' ? ' title="Connected TV: ads on streaming services, shown on a television"' : ''}>
            <span class="mk-ch-top"><span class="mk-ch-name">${h(ch.name)}${i === 0 ? ' <span class="sys-kbd">Lead</span>' : ''}</span><span class="mk-ch-share sys-num">${on ? pct(sh[ch.id]) : 'Off'}</span></span>
            <span class="mk-ch-fmts">${fmts.map(f => `<span><b>${h(f.name)}</b> ${h(f.len)}</span>`).join('')}</span>
            <span class="mk-ch-pf">${ch.platforms.map(id => h(D.platforms.find(p => p.id === id).name)).join(' · ')}</span></button>`;
        }).join('')}</div>
        <div class="mk-cover">
          <div class="mk-cover-fig"><span class="sys-card-label">Market coverage</span>
            <span class="mk-cover-num"><b class="sys-num">${cv.per != null ? cv.per.toFixed(1) : num(cv.imps)}</b> ${cv.per != null ? 'ad views per home a month' : 'ad views a month'} ${EST}</span></div>
          ${cv.per != null ? `<div class="mk-meter" role="img" aria-label="${cv.per.toFixed(1)} ad views per home a month, ${cv.perCtv.toFixed(1)} of them on CTV">
            <span class="mk-meter-track"><i data-ch="ctv" style="width:${at(cv.perCtv)}"></i><i style="left:${at(cv.perCtv)};width:${at(cv.per - cv.perCtv)}"></i>${[1, 2, 4].filter(t => t < top).map(t => `<u style="left:${at(t)}"></u>`).join('')}</span>
            <span class="mk-meter-scale sys-num">${[1, 2, 4].filter(t => t <= top).map(t => `<span style="left:${at(t)}">${t}</span>`).join('')}</span></div>
          <div class="mk-key"><span><i data-ch="ctv"></i>CTV</span><span><i></i>Other channels</span><span>${num(cv.homes)} homes</span></div>` : ''}
        </div>
      </section>
      <div class="sys-sec-head mk-sec"><h2>Concepts</h2><p><span class="sys-chip">Example drafts</span></p></div>
      <div class="mk-work">
        <div class="mk-list" role="group" aria-label="Concepts">${list.map((x, i) => `<button type="button" class="mk-con" data-con="${x.id}" aria-pressed="${x === k}">${endCard(B, c, x, 'mk-frame--mini')}
          <span class="mk-con-copy"><span class="sys-card-label">Concept ${i + 1} · ${x.len} s</span><span class="mk-con-title">${h(x.title)}</span><span class="mk-con-runs">${x.runs.map(chName).join(' · ')}</span></span></button>`).join('')}</div>
        <section class="sys-card mk-detail" aria-label="${h(k.title)}">
          <div class="mk-detail-head"><div><div class="sys-card-label">Concept ${ki + 1} · ${h(br.short)} · ${k.len} seconds</div><h3 class="sys-card-title">${h(k.title)}</h3></div>
            <button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-play aria-pressed="false">Play</button></div>
          <div class="mk-stage">
            <div class="mk-screen"><div class="mk-screen-frame"></div>
              <div class="mk-strip" role="group" aria-label="Storyboard">${k.beats.map((b, i) => `<button type="button" class="mk-thumb" data-beat="${i}" aria-pressed="false" aria-label="Frame ${i + 1}, ${tc(b.t)}">${frame(B, c, k, i, 'mk-frame--mini')}<span class="sys-num">${tc(b.t)}</span></button>`).join('')}</div>
              <div class="mk-var"><h3 class="sys-card-label">Headlines</h3><ul class="mk-heads">${k.headlines.map(t => { const s = fill(t, mk); return `<li><span>${h(s)}</span><span class="sys-num">${s.length}/30</span></li>`; }).join('')}</ul></div>
              <div class="mk-var"><h3 class="sys-card-label">Copy variants</h3><ol class="mk-copy">${k.copy.map(t => `<li>${h(fill(t, mk))}</li>`).join('')}</ol></div></div>
            <ol class="mk-script" aria-label="Script">${k.beats.map((b, i) => `<li><button type="button" class="mk-beat" data-beat="${i}" aria-pressed="false">
              <span class="mk-beat-t sys-num">${tc(b.t)}</span><span class="mk-beat-main"><span class="mk-beat-shot">${h(b.shot)}</span><span class="mk-beat-pic">${h(fill(b.pic, mk))}</span><span class="mk-beat-vo">${h(fill(b.vo, mk))}</span></span></button></li>`).join('')}</ol>
          </div>
          <div class="sys-card-foot mk-detail-foot"><span class="sys-chips">${dr.filter(d => d.k === k).map(d => `<span class="sys-chip">${h(d.pf.name)} · ${h(d.format)}</span>`).join('') || '<span class="sys-chip">No channel in the mix runs this one</span>'}</span>
            <a class="sys-btn sys-btn--primary sys-btn--sm" href="#/marketing/queue">Review ${plural(waiting, 'draft')}</a></div>
        </section>
      </div>`;
    stage();
  };

  const act = (target, fn) => { const sel = selOf(target); stop(); fn(view().c); save(); draw(); keepFocus(el, sel); };
  el.onclick = e => {
    const t = e.target.closest('[data-brand],[data-ch],[data-con],[data-beat],[data-play]'); if (!t || !el.contains(t)) return;
    if (t.dataset.beat != null) { stop(); beat = +t.dataset.beat; stage(); return; }
    if (t.hasAttribute('data-play')) {
      if (timer) { stop(); stage(); return; }
      const n = view().k.beats.length; if (beat >= n - 1) beat = 0;
      timer = setInterval(() => { if (beat >= n - 1) { stop(); } else beat++; stage(); }, 1700);
      stage(); return;
    }
    if (t.dataset.brand) return act(t, c => { S.cur[co] = { brand: t.dataset.brand, market: c.market }; beat = 0; });
    if (t.dataset.con) return act(t, c => { S.sel[c.brand] = t.dataset.con; beat = 0; });
    if (t.dataset.ch) return act(t, c => { const id = t.dataset.ch, mix = c.mix.includes(id) ? c.mix.filter(x => x !== id) : [...c.mix, id]; if (mix.length) S.briefs[c.key] = { ...S.briefs[c.key], mix }; });
  };
  el.onchange = e => {
    const t = e.target.closest('[data-set]'); if (!t) return;
    act(t, c => {
      if (t.dataset.set === 'market') S.cur[co] = { brand: c.brand, market: t.value };
      else S.briefs[c.key] = { ...S.briefs[c.key], [t.dataset.set]: t.dataset.set === 'budget' ? +t.value : t.value };
    });
  };
  draw();
  ctx.app.index?.(campaigns(D, co).map(c => ({ label: `${D.brands[c.brand].short} · ${marketOf(D, c).name}`, sub: 'Marketing campaign', href: `#/marketing/build?co=${co}&brand=${c.brand}&market=${c.market}`, kind: 'Campaign', color: 'var(--sys-brand)' })));
  return () => { stop(); el.onclick = el.onchange = null; };
}

/* ── Cost: made this way against a conventional shoot, and what the budget buys ─────────────────────────────── */
async function cost(ctx) {
  const B = await boot(ctx); if (!B) return;
  const { el } = ctx, { D, co } = B;
  el.innerHTML = `<div class="m-mk" data-co="${co}" data-no-gloss><h1 class="sys-h1">Cost</h1><div class="mk-body"></div>${foot(B, new Set(RATE_SRC))}</div>`;
  const body = el.querySelector('.mk-body');
  const draw = () => {
    const c = current(D, co), mk = marketOf(D, c), br = D.brands[c.brand], m = makeCost(D, c.brand, S.tier), rows = reach(D, c);
    const ctv = rows.find(r => r.ch.id === 'ctv'), cv = cover(D, c), imps = cv.imps, cpm = D.rates.ctv.value, freq = [1, 2, 4].includes(S.freq) ? S.freq : 2;
    const top = Math.max(m.high, m.conv[1]), w = v => `${Math.max(.8, v / top * 100).toFixed(1)}%`;
    const maxBuy = Math.max(1, ...rows.filter(r => r.unit === 'cpm' && r.buys != null).map(r => r.buys));
    const n = m.spots, N = words(n).toLowerCase();
    body.innerHTML = `
      <header class="page-head"><div class="page-head-copy"><p class="sys-lead sub">${words(n)} AI-made spots: about ${usd(m.ai)} ${EST} A conventional shoot: ${usd(m.conv[0])} to ${usd(m.conv[1])}.</p></div></header>
      ${cosChips(B, 'cost')}
      <div class="sys-filters mk-ctx">${brandChips(B, c)}<span class="sys-chip sys-chip--soft">${h(br.short)} · ${h(mk.name)}</span>
        <label class="sys-field"><span class="sys-field-label">Per month</span>${budgetSelect(c)}</label></div>
      <div class="sys-kpis">
        <div class="sys-kpi"><div class="sys-kpi-label">AI-made</div><div class="sys-kpi-value">${usd(m.ai)} ${EST}</div><div class="sys-kpi-sub">${N} spots with cut-downs</div></div>
        <div class="sys-kpi"><div class="sys-kpi-label">Conventional shoot</div><div class="sys-kpi-value">${usd(m.conv[0])}–${usd(m.conv[1])}</div><div class="sys-kpi-sub">${N} basic spots</div></div>
        <div class="sys-kpi"><div class="sys-kpi-label">${ctv ? 'CTV impressions a month' : 'Impressions a month'}</div><div class="sys-kpi-value">${num(ctv ? ctv.buys : imps)} ${EST}</div><div class="sys-kpi-sub">${ctv ? `${usd(ctv.spend)} at $${ctv.r.value} a thousand` : 'across the mix'}</div></div>
        ${cv.per != null ? `<div class="sys-kpi"><div class="sys-kpi-label">Ad views per home a month</div><div class="sys-kpi-value">${cv.per.toFixed(1)} ${EST}</div><div class="sys-kpi-sub">${num(cv.homes)} homes, all channels</div></div>`
          : `<div class="sys-kpi"><div class="sys-kpi-label">All channels a month</div><div class="sys-kpi-value">${num(imps)} ${EST}</div><div class="sys-kpi-sub">impressions</div></div>`}
      </div>
      <div class="mk-cols">
        <section class="sys-card" aria-labelledby="mk-make-h">
          <div class="mk-card-head"><h2 class="sys-card-title" id="mk-make-h">Cost to make ${N} spots</h2>
            <span class="sys-chips" role="group" aria-label="Video quality">${D.make.tiers.map(t => `<button type="button" class="sys-chip" data-tier="${t.id}" aria-pressed="${t.id === m.tier.id}" title="${h(t.model)}">${h(t.name)} · $${t.usd_per_s}/s</button>`).join('')}</span></div>
          <div class="mk-bars">
            <div class="mk-bar mk-bar--ai"><span>AI-made</span><span class="mk-bar-track"><i class="mk-bar-fill" style="width:${w(m.ai)}"></i></span><span class="sys-num">${usd(m.ai)} ${EST}</span></div>
            <div class="mk-bar mk-bar--range"><span>Basic shoot</span><span class="mk-bar-track"><i class="mk-bar-fill" style="left:${w(m.conv[0])};width:${((m.conv[1] - m.conv[0]) / top * 100).toFixed(1)}%"></i></span><span class="sys-num">${usd(m.conv[0])}–${usd(m.conv[1])}</span></div>
            <div class="mk-bar"><span>High-quality shoot</span><span class="mk-bar-track"><i class="mk-bar-fill" style="width:${w(m.high)}"></i></span><span class="sys-num">${usd(m.high)}+</span></div>
          </div>
          <table class="sys-table mk-mini"><tbody>
            <tr><td>Finished video</td><td class="sys-n">${num(m.finished)} s</td></tr>
            <tr><td>Generated, with retakes</td><td class="sys-n">${num(m.generated)} s ${EST}</td></tr>
            <tr><td>Generation at $${m.tier.usd_per_s} a second</td><td class="sys-n">${usd(m.gen)} ${EST}</td></tr>
            <tr><td>Voice, music and stills</td><td class="sys-n">${usd(D.make.finishing_usd)} ${EST}</td></tr>
          </tbody></table>
          <p class="mk-note sys-src">A basic shoot costs ${Math.round(m.conv[0] / m.ai)} to ${Math.round(m.conv[1] / m.ai)} times as much ${EST}</p>
          <p class="mk-note sys-src">The saving buys ${num((m.conv[0] - m.ai) / cpm * 1000)} to ${num((m.conv[1] - m.ai) / cpm * 1000)} more CTV ad views ${EST}</p>
        </section>
        <section class="sys-card" aria-labelledby="mk-buy-h">
          <div class="mk-card-head"><h2 class="sys-card-title" id="mk-buy-h">What ${usd(c.budget)} a month buys</h2></div>
          <div class="sys-table-wrap mk-flat"><table class="sys-table mk-reach"><thead><tr><th>Channel</th><th>Rate</th><th>Buys</th></tr></thead><tbody>${rows.map(r => {
            const rate = !r.r ? '—' : `$${r.r.value}${r.unit === 'cpm' ? ' a thousand' : ' a lead'}${r.r.est ? ` ${EST}` : ''}`;
            const by = r.r?.src ? `<span class="mk-by">${srcLink(B, r.r.src)}</span>` : '';
            const buys = r.buys == null ? '<span class="mk-none">No public rate</span>'
              : `<span class="mk-buy"><span class="mk-buy-bar"><i style="width:${r.unit === 'cpm' ? Math.max(2, r.buys / maxBuy * 100).toFixed(1) : 0}%"></i></span><span class="sys-num">${num(r.buys)} ${r.unit === 'cpm' ? 'impressions' : 'leads'} ${EST}</span></span>`;
            return `<tr><td>${h(r.ch.name)}<span class="mk-by sys-num">${usd(r.spend)} · ${pct(r.share)}</span></td><td>${rate}${by}</td><td>${buys}</td></tr>`;
          }).join('')}</tbody></table></div>
          ${cv.homes ? `<div class="mk-mins"><span class="sys-card-label">CTV to every home</span><span class="sys-chips" role="group" aria-label="Ad views per home a month">${[1, 2, 4].map(f => `<button type="button" class="sys-chip" data-freq="${f}" aria-pressed="${f === freq}">${f} a month</button>`).join('')}</span>
            <span class="mk-blanket"><b class="sys-num">${usd(cv.homes * freq * cpm / 1000)}</b> a month ${EST}</span></div>` : ''}
          <div class="mk-mins"><span class="sys-card-label">CTV starts at</span><span class="sys-chips">${D.minimums.map(x => `<span class="sys-chip">${usd(x.usd)} · ${h(x.platform)}</span>`).join('')}</span></div>
        </section>
      </div>`;
  };
  el.onclick = e => {
    const t = e.target.closest('[data-tier],[data-brand],[data-freq]'); if (!t || !el.contains(t)) return;
    const sel = selOf(t);
    if (t.dataset.tier) S.tier = t.dataset.tier; else if (t.dataset.freq) S.freq = +t.dataset.freq; else S.cur[co] = { brand: t.dataset.brand, market: current(D, co).market };
    save(); draw(); keepFocus(el, sel);
  };
  el.onchange = e => { const t = e.target.closest('[data-set="budget"]'); if (!t) return; const c = current(D, co); S.briefs[c.key] = { ...S.briefs[c.key], budget: +t.value }; save(); draw(); keepFocus(el, '[data-set="budget"]'); };
  draw();
  return () => { el.onclick = el.onchange = null; };
}

/* ── Queue: every placement is a draft; the platforms are not linked ──────── */
const CHIP = { available: 'sys-chip', planned: 'sys-chip cx-planned' }, STATE = { available: 'Connector available', planned: 'Planned' };
function platformRows(B) {
  const D = B.D;
  return D.platforms.map(p => {
    const doc = p.doc && B.src[p.doc], ch = D.channels.find(c => c.id === p.channel);
    const chip = doc ? `<a class="${CHIP[p.state]}" href="${h(doc.url)}" target="_blank" rel="noopener" title="${h(doc.title)}">${STATE[p.state]}</a>` : `<span class="${CHIP[p.state]}">${STATE[p.state]}</span>`;
    return `<li class="cx-row" data-state="${p.state}"><span class="cx-name">${h(p.name)}</span><span class="cx-cat">${h(ch.name)}</span><span class="cx-reads">${h(p.takes)}</span><span class="cx-st">${chip}</span><span class="cx-mark">Not linked</span><span class="cx-act"></span></li>`;
  }).join('');
}
async function queue(ctx) {
  const B = await boot(ctx); if (!B) return;
  const { el } = ctx, { D, co } = B;
  el.innerHTML = `<div class="m-mk" data-co="${co}" data-no-gloss><h1 class="sys-h1">Queue</h1><div class="mk-body"></div>
    <section class="cx-group mk-platforms" aria-labelledby="mk-pf-h"><h2 class="sys-card-label cx-group-head" id="mk-pf-h"><span class="sys-dot" aria-hidden="true"></span>Ad platforms <span class="sys-num">none linked</span></h2>
      <ul class="sys-table-wrap cx-list">${platformRows(B)}</ul></section>
    <p class="sys-sr" role="status" aria-live="polite"></p>${foot(B, new Set([...D.platforms.flatMap(p => [p.doc, p.src]).filter(Boolean)]))}</div>`;
  const body = el.querySelector('.mk-body'), say = el.querySelector('[role="status"]');
  const draw = () => {
    const all = campaigns(D, co), cur = current(D, co), f = all.some(c => c.key === S.qf) ? S.qf : S.qf === 'all' ? 'all' : cur.key;
    const shown = all.filter(c => f === 'all' || c.key === f).flatMap(c => drafts(D, c));
    const every = all.flatMap(c => drafts(D, c)), waiting = every.filter(d => !S.dec[d.id]).length, decided = shown.some(d => S.dec[d.id]);
    const label = c => `${D.brands[c.brand].short} · ${marketOf(D, c).short}`;
    body.innerHTML = `
      <header class="page-head"><div class="page-head-copy"><p class="sys-lead sub">${plural(waiting, 'draft')} wait${waiting === 1 ? 's' : ''} for approval. Nothing is sent.</p></div></header>
      ${cosChips(B, 'queue')}
      <div class="mk-qbar"><div class="sys-chips" role="group" aria-label="Campaign">
        ${all.map(c => `<button type="button" class="sys-chip" data-qf="${h(c.key)}" aria-pressed="${f === c.key}">${h(label(c))} <span class="sys-num">${drafts(D, c).filter(d => !S.dec[d.id]).length}</span></button>`).join('')}
        ${all.length > 1 ? `<button type="button" class="sys-chip" data-qf="all" aria-pressed="${f === 'all'}">All <span class="sys-num">${waiting}</span></button>` : ''}</div>
        ${decided ? '<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-reset>Reset drafts</button>' : ''}</div>
      <div class="mk-queue">${shown.map(d => {
        const st = S.dec[d.id] || 'draft';
        const end = st === 'approved' ? '<span class="sys-chip sys-chip--good mk-dr-status" tabindex="-1">Approved</span><p class="sys-src mk-dr-note">Nothing was sent.</p>'
          : st === 'discarded' ? '<span class="sys-chip mk-dr-status" tabindex="-1">Discarded</span>'
            : '<button type="button" class="sys-btn sys-btn--primary sys-btn--sm" data-dec="approved">Approve</button><button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-dec="discarded">Discard</button>';
        return `<article class="sys-card mk-draft" data-id="${h(d.id)}" data-st="${st}">
          <div class="sys-card-label">Draft · Not sent <span class="sys-chip sys-chip--soft">${h(d.pf.name)}</span></div>
          <div class="mk-draft-top">${endCard(B, d.c, d.k, 'mk-frame--mini')}<div><h3 class="sys-card-title">${h(d.k.title)}</h3><p class="mk-draft-fmt">${h(d.format)}</p></div></div>
          <dl class="mk-dl"><div><dt>${h(marketOf(D, d.c).name)}</dt><dd class="sys-num">${usd(d.spend)} a month ${EST}</dd></div></dl>
          <div class="sys-card-foot mk-dr-foot">${end}</div></article>`;
      }).join('') || '<div class="empty">No drafts for this mix.</div>'}</div>`;
  };
  el.onclick = e => {
    const q = e.target.closest('[data-qf]'); if (q && el.contains(q)) { S.qf = q.dataset.qf; save(); draw(); keepFocus(el, selOf(q)); return; }
    if (e.target.closest('[data-reset]')) { const ids = new Set([...el.querySelectorAll('.mk-draft')].map(a => a.dataset.id)); for (const id of ids) delete S.dec[id]; save(); draw(); say.textContent = 'Drafts reset.'; return; }
    const b = e.target.closest('[data-dec]'); if (!b || !el.contains(b)) return;
    const id = b.closest('.mk-draft').dataset.id; S.dec[id] = b.dataset.dec; save(); draw();
    el.querySelector(`.mk-draft[data-id="${CSS.escape(id)}"] .mk-dr-status`)?.focus({ preventScroll: true });
    say.textContent = b.dataset.dec === 'approved' ? 'Draft approved. Nothing was sent.' : 'Draft discarded.';
  };
  draw();
  return () => { el.onclick = null; };
}

/* ── All six: the firm's board ─────────────────────────────────────────────── */
async function board(ctx) {
  const B = await boot(ctx); if (!B) return;
  const { el } = ctx, { D } = B;
  const all = ORDER.flatMap(co => campaigns(D, co)), spend = all.reduce((a, c) => a + c.budget, 0);
  const dr = all.flatMap(c => drafts(D, c)), waiting = dr.filter(d => !S.dec[d.id]).length, approved = dr.filter(d => S.dec[d.id] === 'approved').length;
  const sets = [...new Set(all.map(c => c.brand))].map(b => makeCost(D, b, S.tier));
  const ai = sets.reduce((a, m) => a + m.ai, 0), conv = [0, 1].map(i => sets.reduce((a, m) => a + m.conv[i], 0)), spots = sets.reduce((a, m) => a + m.spots, 0);
  const ctvAll = all.reduce((a, c) => a + c.budget * (shares(D, c).ctv || 0), 0);
  // homes are counted once per market, however many campaigns run there
  const cvs = new Map(all.map(c => [c, cover(D, c)])), local = all.filter(c => cvs.get(c).homes);
  const homes = [...new Map(local.map(c => [marketOf(D, c).name, cvs.get(c).homes])).values()].reduce((a, b) => a + b, 0);
  const views = local.reduce((a, c) => a + cvs.get(c).imps, 0);
  el.innerHTML = `<div class="m-mk" data-no-gloss><h1 class="sys-h1">All six</h1>
    <header class="page-head"><div class="page-head-copy"><p class="sys-lead sub">${all.length} campaigns in markets of ${num(homes)} homes. ${usd(spend)} a month planned.</p><div class="sys-chips chips"><span class="sys-chip">Example records</span></div></div></header>
    <div class="sys-kpis">
      <div class="sys-kpi"><div class="sys-kpi-label">Planned spend a month</div><div class="sys-kpi-value">${usd(spend)}</div><div class="sys-kpi-sub">${pct(ctvAll / spend)} on CTV</div></div>
      <div class="sys-kpi"><div class="sys-kpi-label">Ad views per home a month</div><div class="sys-kpi-value">${(views / homes).toFixed(1)} ${EST}</div><div class="sys-kpi-sub">${num(homes)} homes in ${new Set(local.map(c => marketOf(D, c).name)).size} local markets</div></div>
      <div class="sys-kpi"><div class="sys-kpi-label">Drafts waiting</div><div class="sys-kpi-value">${waiting}</div><div class="sys-kpi-sub">${approved} approved, none sent</div></div>
      <div class="sys-kpi"><div class="sys-kpi-label">AI-made, all ${spots} spots</div><div class="sys-kpi-value">${usd(ai)} ${EST}</div><div class="sys-kpi-sub">${usd(conv[0])}–${usd(conv[1])} by conventional shoot</div></div>
    </div>
    <div class="sys-table-wrap"><table class="sys-table mk-board"><thead><tr><th>Campaign</th><th>Market and goal</th><th class="sys-n">Spend a month</th><th>Channel mix</th><th class="sys-n">Per home ${EST}</th><th class="sys-n">Drafts</th><th><span class="sys-sr">Open</span></th></tr></thead><tbody>${all.map(c => {
      const wait = drafts(D, c).filter(x => !S.dec[x.id]).length, sh = shares(D, c), on = D.channels.filter(ch => sh[ch.id] != null);
      return `<tr><td><span class="sys-chip sys-chip--soft" data-co="${c.co}">${h(D.companies[c.co].name)}</span>${D.companies[c.co].brands.length > 1 ? ` <span class="mk-brandname">${h(D.brands[c.brand].short)}</span>` : ''}</td><td>${h(marketOf(D, c).name)}<span class="mk-by">${h(goalOf(D, c).name)}</span></td>
        <td class="sys-n">${usd(c.budget)}</td>
        <td><span class="mk-stack" role="img" aria-label="${h(on.map(ch => `${ch.short} ${pct(sh[ch.id])}`).join(', '))}">${on.map(ch => `<i data-ch="${ch.id}" style="width:${(sh[ch.id] * 100).toFixed(1)}%"></i>`).join('')}</span></td>
        <td class="sys-n">${cvs.get(c).per != null ? cvs.get(c).per.toFixed(1) : '—'}</td><td class="sys-n">${wait}</td>
        <td class="mk-open"><a href="#/marketing/build?co=${c.co}&amp;brand=${c.brand}&amp;market=${c.market}" aria-label="Open ${h(D.brands[c.brand].short)}, ${h(marketOf(D, c).name)}">Open →</a></td></tr>`;
    }).join('')}</tbody></table></div>
    <div class="mk-key" aria-hidden="true">${D.channels.map(ch => `<span><i data-ch="${ch.id}"></i>${h(ch.name)}</span>`).join('')}</div>
${foot(B, new Set(RATE_SRC))}</div>`;
  ctx.app.index?.(all.map(c => ({ label: `${D.brands[c.brand].short} · ${marketOf(D, c).name}`, sub: `${D.companies[c.co].name} · Marketing campaign`, href: `#/marketing/build?co=${c.co}&brand=${c.brand}&market=${c.market}`, kind: 'Campaign', color: 'var(--sys-brand)' })));
}

export default {
  id: 'marketing', name: 'Marketing engine', color: 'var(--sys-brand)',
  views: [
    { id: 'board', name: 'All six', render: board },
    { id: 'build', name: 'Campaign', render: build },
    { id: 'cost', name: 'Cost', render: cost },
    { id: 'queue', name: 'Queue', render: queue },
  ],
};
