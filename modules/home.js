/* Home: the first screen for every level (firm, company, role) and the agent inside the shell */
import { dataset, srcLabel } from './copy.js?v=20261124223132';
import { loadScoreboard, templateExit } from './fin.js?v=20261124223132';
import { Session } from '../assets/session.js?v=20261124223132';
import { embedView } from './embed.js?v=20261124223132';
import { BSPSite } from '../assets/site-lookup.js?v=20261124223132';
const COS = [
  { id: 'cet', name: 'Commonwealth Electrical Technologies (CET)', short: 'CET', color: 'var(--co-cet)', hex: '#4c8dff', sector: 'Commercial electrical · solar · energy', entry: '2025-02' },
  { id: 'pp', name: 'Punctual Pros', short: 'PP', color: 'var(--co-pp)', hex: '#f08a3c', sector: 'Residential HVAC · plumbing · electrical', entry: '2024-04' },
  { id: 'fl', name: 'Frontline Managed Services', short: 'FL', color: 'var(--co-fl)', hex: '#9d7bff', sector: 'Legal managed IT · revenue cycle', entry: '2024-12' },
  { id: 'ts', name: 'Thomas Scientific', short: 'TS', color: 'var(--co-ts)', hex: '#2ecc8f', sector: 'Lab supply distribution', entry: '2022-01' },
  { id: 'bpi', name: 'Bully Pulpit International', short: 'BPI', color: 'var(--co-bpi)', hex: '#e05c8a', sector: 'Communications · public affairs', entry: '2023-04' },
  { id: 'fh', name: 'Fair Harbor', short: 'FH', color: 'var(--co-fh)', hex: '#3fd0e0', sector: 'Consumer · sustainable apparel', entry: '2022-03' },
];

const CO_HEX = { cet: '#4c8dff', pp: '#f08a3c', fl: '#9d7bff', ts: '#2ecc8f', bpi: '#e05c8a', fh: '#3fd0e0', ma: '#f5b73d', pe: '#c9a0ff', fin: '#8bd3ff', bsp: '#d9622b', sh: '#8a94a6' };
/* system accent per dataset owner: the six companies read their own --co-* token (data-co), everything portfolio-wide reads
   the brand, Smith + Howard (exited, not a current company) reads the neutral mute */
const CO_IDS = new Set(['cet', 'pp', 'fl', 'ts', 'bpi', 'fh']);
const CO_VAR = id => CO_IDS.has(id) ? `var(--co-${id})` : id === 'sh' ? 'var(--sys-mute-2)' : 'var(--sys-brand)';
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** data-co attribute for a company id (system.css derives --co, --co-ink, --co-soft); others pass their token inline. */
const coAttr = id => CO_IDS.has(id) ? `data-co="${id}"` : `data-co="" style="--co:${CO_VAR(id)}"`;
/** Company chip: .sys-chip--soft in the company accent (the short name or a label). */
const coChip = (id, t, title) => `<span class="sys-chip sys-chip--soft" ${coAttr(id)}${title ? ` title="${h(title)}"` : ''}>${h(t)}</span>`;
/** Status chip: .sys-chip--good | --warn | --bad | --info, or neutral. */
const stChip = (t, st) => `<span class="sys-chip${st ? ` sys-chip--${st}` : ''}">${h(t)}</span>`;
/* names spelled out in leads and KPI subs; the short codes stay on table chips only */
const LONG = { cet: 'CET', pp: 'Punctual Pros', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor', sh: 'Smith + Howard' };
/** "1 add-on under BSP + 1 reported, unnamed" — named add-ons counted apart from ones BSP reports without a name */
const addCount = adds => { const named = adds.filter(a => !a.unid).length, unid = adds.length - named; return `${named} ${unid ? 'named ' : ''}add-on${named === 1 ? '' : 's'} under BSP${unid ? ` + ${unid} reported, unnamed` : ''}`; };
/* bsp_firm.timeline company names → company colour */
const tlColor = c => { const s = String(c || ''); return CO_VAR(/Commonwealth|CET|NuWave|Horton/i.test(s) ? 'cet' : /Punctual|Horvath/i.test(s) ? 'pp' : /Frontline/i.test(s) ? 'fl' : /Thomas/i.test(s) ? 'ts' : /Bully|BPI/i.test(s) ? 'bpi' : /Fair Harbor/i.test(s) ? 'fh' : /Smith/i.test(s) ? 'sh' : 'bsp'); };
const mdy = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : (s || null); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = s => { if (!s) return null; const v = mdy(String(s)); const d = new Date(/^\d{4}$/.test(v) ? `${v}-07-01` : /^\d{4}-\d{2}$/.test(v) ? `${v}-15` : v); return isNaN(d) ? null : d; };
const monYr = s => { const d = toDate(s); return d ? `${MON[d.getMonth()]} ${d.getFullYear()}` : '—'; };
const yrsBetween = (a, b = new Date()) => { const x = toDate(a), y = b instanceof Date ? b : toDate(b); return x && y ? (y - x) / (365.25 * 864e5) : null; };
const dot = c => `<span class="sys-dot" role="img" aria-label="${c || 'unrated'} confidence" title="${c || 'unrated'} confidence" style="--co:${c === 'high' ? 'var(--sys-good)' : c === 'medium' ? 'var(--sys-warn)' : 'var(--sys-mute-2)'};margin-left:6px;vertical-align:1px"></span>`;
/* Research-note phrasing that must never reach a reader (bsp_firm timeline/history). */
const cleanEvent = s => String(s || '').replace(/\s+-\s+likely source of .*$/i, '');

/* ── Add-ons under BSP, from bsp_firm.items[].add_ons (pre-BSP acquisitions excluded) ── */
const firmItem = (firm, id) => (firm?.items || []).find(i => i.id === `bsp-${id}`);
const addOnsOf = (firm, id) => (firmItem(firm, id)?.add_ons || []).map(a => { const unid = /^Unidentified/i.test(a.name || ''); return { name: unid ? '1 reported, unnamed (per BSP’s site)' : a.name, year: a.date ? String(a.date).slice(0, 4) : null, date: a.date, hq: a.hq, note: a.note, src: a.source_url, unid, rep: a.status === 'reported' }; });
/** Add-ons reported in the trade press but not announced (OS spec 8: CET's four October 2026 deals carry "reported"). */
const reportedOf = (firm, id) => (firmItem(firm, id)?.add_ons || []).filter(a => a.status === 'reported').length;
/** "2 add-ons, 4 reported" when some are reported only, else "6 add-ons". */
const addTxt = (n, rep) => { n = n || 0; const k = n - rep; return rep ? `${k} add-on${k === 1 ? '' : 's'}, ${rep} reported` : n ? `${n} add-on${n === 1 ? '' : 's'}` : 'No add-ons'; };
/** One add-on in a side-panel timeline: name, headquarters, a "reported" chip where it applies, the source link. */
const addOnHTML = (a, esc) => `${esc(a.name)}${a.hq ? ` <span class="dim">· ${esc(String(a.hq).replace(/\s*\(reported\)/i, ''))}</span>` : ''}${a.rep ? ` ${stChip('reported', 'info')}` : ''}${a.src ? ` <a class="dim" href="${esc(a.src)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}`;


/* ── Home by level (OS spec 5). One screen, three homes, chosen by the role in view ("Viewing as", assets/session.js):
   the firm home for the firm levels, the company home for company leadership (and the fund home for investor relations),
   the role home for office and field. It redraws when the role changes. Every home opens with the command band
   (assets/system.css §6q): a kicker, one headline read from data the home already has, the ask box with the role's own
   question and prompts, up to three figures and one ranked list. The agent is docked at the right (mountDock below),
   closed until the first question; an address answer opens under the band (#hm-out). Sources and method text carry
   data-src and data-method: the shell moves them into its Sources and Method drawers. ── */
const injectCss = () => { if (!document.getElementById('css-home')) { const l = document.createElement('link'); l.id = 'css-home'; l.rel = 'stylesheet'; l.href = 'modules/home.css?v=20261124223132'; document.head.appendChild(l); } };
const APPROVALS_KEY = 'bsp-os-approvals';   // drafts the agent made that wait for the person's OK (assets/agent.js writes it)
const AGENT = '#/home/agent';                // never with a question in the address (OS spec 9.4)
const COS_KEY = 'bsp-home-cos';              // this visitor's choice of tiles or table for the six companies
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/** {month:-1} in the catalogue becomes last month's short name (the agent page fills it the same way). */
const fill = t => String(t ?? '').replace(/\{month:(-?\d+)\}/g, (_, n) => MONTHS[((new Date().getMonth() + Number(n)) % 12 + 12) % 12]);
const FUND_ONLY = new Set(['bsp-investor-relations']);   // firm team, but the fund and documents only (OS spec 3)
const homeKind = r => FUND_ONLY.has(r.id) ? 'company' : r.level === 'firm_leadership' || r.level === 'firm_team' ? 'firm' : r.level === 'co_leadership' ? 'company' : 'role';
/* the six companies always in the system order (UNIFIED.md), so each sits in the same place every day */
const TILE_ORDER = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];
const HOLD_SCALE = 6;   // the hold bar's scale in years; the exit window starts at 4 (fin.js exitFlag)

/** Drafts waiting for this role's OK, newest first. */
function waiting(role) {
  try { const v = JSON.parse(localStorage.getItem(APPROVALS_KEY) || '[]'); return (Array.isArray(v) ? v : []).filter(x => x && x.role === role.id && (!x.status || x.status === 'draft')).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))); } catch { return []; }
}
const itemChip = (t, esc) => `<span class="sys-chip ${/urgent|late|past due|at risk/i.test(t) ? 'sys-chip--warn' : 'sys-chip--info'}">${esc(t)}</span>`;
const EST = '<span class="sys-est">est.</span>';
const SAMPLE = '<span class="sys-est sys-est--illus">sample</span>';
const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
const firstSentence = t => { const s = String(t ?? '').trim(); const m = /^.*?[.!?](?=\s|$)/.exec(s); return m ? m[0] : s; };
const afterFirst = t => { const s = String(t ?? '').trim(); return s.slice(firstSentence(s).length).trim(); };
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const numWord = n => WORDS[n] || String(n);
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
/** Roles whose ask box takes a site address too (the dock's test, assets/agent.js addressRole). */
const addressRole = r => r.level === 'firm_leadership' || r.level === 'firm_team' || (r.co === 'pp' && (r.level === 'co_office' || r.level === 'co_field'));
const PHONE = '(max-width:560px)';
const phone = () => { try { return matchMedia(PHONE).matches; } catch { return false; } };
/** The ask box's placeholder: the role's own, naming the address for the roles that take one (as the dock words it). On a
 *  phone, its first clause only, so it is never cut mid-word ("Ask about the portfolio", "Where are you headed?"). */
function placeholderOf(r, short = phone()) {
  let p = r.placeholder || 'Ask the agent';
  if (short) { const i = p.indexOf(', '); return i > 0 ? `${p.slice(0, i)}${/\?$/.test(p) ? '?' : ''}` : p; }
  if (!addressRole(r)) return p;
  if (/[?.]$/.test(p)) return `${p} Or type an address.`;
  const i = p.lastIndexOf(' or ');
  if (i > -1) p = `${p.slice(0, i)}, ${p.slice(i + 4)}`;
  return `${p} or an address`;
}
const SEND = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>';
const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
/* the constellation: one star per company in its accent (CSS only, decoration) */
const MARK = `<svg class="sys-command-mark" viewBox="0 0 120 84" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width=".8" stroke-linecap="round"><path d="M14 58 34 20l26 18 22-24 24 30-30 30-28-6z"/></g>
  <g><circle cx="34" cy="20" r="3.4" fill="var(--co-pp)"/><circle cx="60" cy="38" r="2.6" fill="var(--co-cet)"/><circle cx="82" cy="14" r="2.8" fill="var(--co-fl)"/><circle cx="106" cy="44" r="3.8" fill="var(--co-ts)"/><circle cx="76" cy="74" r="3" fill="var(--co-bpi)"/><circle cx="48" cy="68" r="2.4" fill="var(--co-fh)"/></g>
  <g fill="currentColor" fill-opacity=".55"><circle cx="14" cy="58" r="1.2"/><circle cx="98" cy="70" r=".9"/><circle cx="20" cy="30" r=".8"/><circle cx="112" cy="20" r=".8"/></g></svg>`;

/** Numerals in an escaped headline set in the sans (.sys-display-num); entities such as &#39; are left alone. */
const displayNums = t => String(t).replace(/(&#?\w+;)|(\d(?:[\d.,:]*\d)?)/g, (m, ent) => ent ? m : `<span class="sys-display-num">${m}</span>`);
/** The band: kicker, headline, one quiet line, then its body (ask box, figures, list, or the next job). */
const bandHTML = ({ kicker, title, lead, body }) => `<section class="sys-command" data-sys-theme="dark" aria-labelledby="hm-cmd-h">${MARK}
  <div class="sys-command-head"><p class="sys-command-kicker"><span class="sys-dot" aria-hidden="true"></span>${kicker}</p>
  <h1 class="sys-display" id="hm-cmd-h">${displayNums(title)}</h1>${lead ? `<p class="sys-command-lead">${lead}</p>` : ''}</div>${body}</section>`;
/** The ask box: the role's placeholder, a round send button, then the role's own question and its prompts. */
function askBoxHTML(role, esc) {
  const sig = role.signature?.question, chips = (role.chips || []).slice(0, 2);   // the dock holds the rest
  return `<div class="sys-command-ask"><form class="sys-askbox" data-hm="askbox" aria-label="Ask the agent">
      <label class="sys-sr" for="hm-q">Ask the agent</label><input id="hm-q" name="q" type="text" autocomplete="off" spellcheck="false" enterkeyhint="send" maxlength="500" placeholder="${esc(placeholderOf(role))}" data-ph="${esc(placeholderOf(role, false))}" data-ph-short="${esc(placeholderOf(role, true))}">
      <button type="submit" class="sys-send" data-hm="ask" aria-label="Ask the agent">${SEND}</button></form>
    ${sig || chips.length ? `<div class="sys-prompts" role="group" aria-label="Questions to ask">${sig ? `<button type="button" class="sys-chip sys-chip--sig" data-hm="sig">${esc(fill(sig))}${ARROW}</button>` : ''}${chips.map(c => `<button type="button" class="sys-chip" data-ask="${esc(fill(c))}">${esc(fill(c))}</button>`).join('')}</div>` : ''}</div>`;
}
/** The sticky pill at the bottom of the home column: it shows only while no other ask box is in view (overview watches it). */
const pillHTML = (role, esc) => `<button type="button" class="sys-askbox sys-askbar" data-hm="ask"><span><span class="sys-sr">Ask the agent: </span><span data-ph="${esc(placeholderOf(role, false))}" data-ph-short="${esc(placeholderOf(role, true))}">${esc(placeholderOf(role))}</span></span><span class="sys-send" aria-hidden="true">${SEND}</span></button>`;
/** The band's figures and its list in one block: stacked, or side by side on a wide band (system.css §6q). */
const gridHTML = (...parts) => `<div class="sys-command-grid">${parts.join('')}</div>`;
const figsHTML = (figs, label, card) => figs.length ? `<div class="sys-figs${card ? ' sys-figs--card' : ''}" role="list" aria-label="${label}">${figs.map(f => `<div class="sys-fig" role="listitem"><span class="sys-fig-label">${f.label}</span><span class="sys-fig-value">${f.value}</span>${f.sub ? `<span class="sys-fig-sub">${f.sub}</span>` : ''}</div>`).join('')}</div>` : '';
const kpiFig = (esc, t) => ({ label: esc(fill(t.label)), value: `${esc(fill(t.value))}${t.modeled ? EST : ''}`, sub: esc(fill(t.sub)) });
/** One attention row: when | what (the button that opens it covers the row) and its actions | status. */
const attnRow = (x, i, max) => `<li class="sys-attn-row${i >= max ? ' is-more' : ''}"${x.id ? ` data-id="${x.id}"` : ''}><span class="sys-attn-when${x.whenText ? ' sys-attn-when--text' : ''}"${x.st ? ` data-st="${x.st}"` : ''}>${x.when}</span>
  <div class="sys-attn-main">${x.open}${x.sub || x.acts || x.ask ? `<span class="sys-attn-meta">${x.sub ? `<span class="sys-attn-sub">${x.sub}</span>` : ''}${x.acts ? `<span class="sys-attn-acts">${x.acts}</span>` : ''}${x.ask ? '<span class="sys-attn-ask" aria-hidden="true">Ask →</span>' : ''}</span>` : ''}</div>${x.chip || ''}</li>`;
function attnHTML(title, items, quiet, max = 6) {
  return `<div class="sys-attn">${title ? `<h2 class="sys-attn-title" id="hm-attn-h">${title}</h2>` : ''}${items.length ? `<ol class="sys-attn-list"${title ? ' aria-labelledby="hm-attn-h"' : ''}>${items.map((x, i) => attnRow(x, i, max)).join('')}</ol>${items.length > max ? `<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-hm="all">All ${items.length}</button>` : ''}` : ''}
    ${quiet.filter(Boolean).length ? `<p class="sys-attn-quiet">${quiet.filter(Boolean).map(q => `<span>${q}</span>`).join('')}</p>` : ''}</div>`;
}
/** Drafts waiting for the role's OK as attention rows (they open the agent screen, where they are approved). */
const draftRows = (role, esc) => waiting(role).slice(0, 5).map(x => ({ when: 'Draft', whenText: true, st: 'warn', open: `<a class="sys-attn-open" href="${AGENT}">${esc(x.title || 'Draft')}</a>`, sub: esc(x.app || ''), chip: '<span class="sys-chip">Not sent</span>' }));
/** "Nothing waiting for your approval." or a link to the drafts, for the quiet line. */
const approvalLine = (role, n) => n ? '' : 'Nothing waiting for your approval.';
/** A time from the catalogue as the "when" block: "8:30 am" → 8:30 with "am" under it; anything else as short text. */
function whenOf(t, esc) {
  const m = /^(\d{1,2}:\d{2})\s*(am|pm)$/i.exec(String(t || '').trim());
  return m ? { when: `${esc(m[1])}<small>${esc(m[2])}</small>` } : { when: esc(t || '—'), whenText: true };
}
/** Today's items as the day strip: each asks the agent its own question. */
function dayHTML(role, esc, { list = role.home?.list || [], title = fill(role.home?.list_title || 'Today'), asList = false, id = 'hm-day-h' } = {}) {
  if (!list.length) return '';
  const noun = role.home?.list_needs === 'calendar' ? 'meeting' : /servicetitan|procore/.test(role.home?.list_needs || '') ? 'job' : 'item';
  return `<section class="hm-sec" aria-labelledby="${id}"><div class="sys-sec-head"><h2 id="${id}">${esc(title)}</h2><p>${list.length} ${plural(list.length, noun)}</p></div>
    <ul class="sys-day${asList ? ' sys-day--list' : ''}">${list.map(x => `<li><button type="button" class="sys-day-item" data-ask="${esc(fill(x.prompt || x.title))}" aria-label="Ask about ${esc(fill(x.title))}, ${esc(fill(x.time))}"><time>${esc(fill(x.time))}</time><b>${esc(fill(x.title))}</b><span>${esc(fill(x.where))}</span>${x.chip ? itemChip(fill(x.chip), esc) : ''}<span class="sys-day-ask" aria-hidden="true">Ask →</span></button></li>`).join('')}</ul></section>`;
}
function wire(el, role) {
  el.querySelectorAll('[data-hm="all"]').forEach(b => { b.onclick = () => { b.previousElementSibling?.classList.add('is-all'); b.hidden = true; b.previousElementSibling?.querySelector('.is-more .sys-attn-open')?.focus(); }; });
  // the ask box: a question opens the dock and is asked there (an address in it comes back to the home); empty, it opens the dock
  el.querySelectorAll('form[data-hm="askbox"]').forEach(f => { f.onsubmit = e => { e.preventDefault(); const q = f.q.value.trim(); f.q.value = ''; if (dockCtl) dockCtl.ask(q ? { text: q } : null); else location.hash = AGENT; }; });
  el.querySelectorAll('[data-hm="sig"]').forEach(b => { b.onclick = () => dockCtl ? dockCtl.ask({ sig: true }) : (location.hash = AGENT); });
  el.querySelectorAll('[data-ask]').forEach(b => { b.onclick = () => dockCtl ? dockCtl.ask({ text: b.dataset.ask }) : (location.hash = AGENT); });
  // the sticky pill opens the dock with the keyboard in its composer
  el.querySelectorAll('button[data-hm="ask"]:not([type="submit"])').forEach(b => { b.onclick = () => dockCtl ? dockCtl.open() : (location.hash = AGENT); });
  if (firstAddr) runAddress(el, role, firstAddr);
}

/* ── The answer area (direction C): no first row any more. The signature question and the chips live in the agent docked at the
   right (agent.html?embed=1&dock=1); an address lookup (assets/site-lookup.js: buildings, sources, 3D, globe) needs the width,
   so it lands here, under the band, and takes no space until used. Two ways in: #/home/overview?address=<text> (the Ask panel
   hands a typed address over this way) and an address typed in the ask box or the dock, for every role, which the dock posts
   as 'bsp:address' (the home then writes it into the address too, so a reload or Back keeps the answer). The region is not
   live: one short status line (#hm-say) reads out the answer's first sentence or the reason there is none. ── */
let firstAddr = '';      // an address waiting for the answer area (the hash, or the dock before the home has drawn), run once
const outHTML = () => '<div class="hm-out" id="hm-out" tabindex="-1" role="region" aria-label="Address answer"></div><p class="sys-sr" id="hm-say" role="status"></p>';
/** Runs the address lookup into the answer area of the home on screen, or keeps it until the home has drawn. Resolves the
 *  lookup's { status, text } (null when it waits for the home). */
function runAddress(el, role, text) {
  const out = el.querySelector('#hm-out');
  if (!out) { firstAddr = text; return null; }
  firstAddr = '';
  dockCtl?.setAnswer(true);
  return BSPSite.lookup(text, { host: out, role: role.id }).then(res => {
    const say = el.querySelector('#hm-say');
    if (say && out.isConnected && res && res.status !== 'stopped') say.textContent = out.querySelector('.sl-text, .sl-fail')?.textContent || res.text || '';
    return res;
  });
}
/** Empties the answer area: the lookup stops, its lines leave the Sources drawer, and the address leaves the hash. */
function clearAddress(el, app) {
  const out = el.querySelector('#hm-out');
  if (!out) return;
  out._slCtrl?.abort();
  for (const s of out._slSrc || []) (s.closest('.drawer-item') || s).remove();
  const fresh = document.createElement('div');
  fresh.className = 'hm-out'; fresh.id = 'hm-out'; fresh.tabIndex = -1; fresh.setAttribute('role', 'region'); fresh.setAttribute('aria-label', 'Address answer');
  out.replaceWith(fresh);   // a lookup still on its way draws into the old, detached element
  const say = el.querySelector('#hm-say'); if (say) say.textContent = '';
  setAddressHash('', app);
}
/** #/home/overview?address=<text>, or the bare home, written in place (no new history entry, no redraw). */
function setAddressHash(text, app) {
  const want = text ? `#/home/overview?address=${encodeURIComponent(text)}` : '#/home/overview';
  if (!/^#\/home\/overview(\?|$)/.test(location.hash) || location.hash === want) return;
  try { history.replaceState(history.state, '', want); if (app) { app._at = location.hash; app.params = text ? { address: text } : {}; } } catch { /* the hash stays as it was */ }
}

/* One reading per company for the table's "Of note" column, from the same record (fin.js): what the filings show, never
   what to do. A loan due within two years first, then the add-on count over the years held. */
const yrs = r => (r.held != null ? `${r.held.toFixed(1)} yrs` : '');
const NOTE = {
  pp: () => '$1.4M undrawn in one lender\u2019s slice',   // pp_filings: the delayed-draw loan in a BDC schedule
};
const noteOf = r => r.flag?.k === 0 ? `Loan matures ${r.matLabel || 'within two years'}`
  : NOTE[r.id] ? NOTE[r.id](r)
  : r.addOns ? `${r.addOns} add-on${r.addOns === 1 ? '' : 's'} in ${yrs(r)}` : `No add-ons in ${yrs(r)}`;
/** The status chip: the exit-window flag fin.js sets, cut to its first words ("Build", "In exit window", "Loan due in 13 mo"). */
const status = r => String(r.flag?.t || '').replace(/\s*\(.*\)$/, '').replace(/:.*$/, '').replace(/^Refinancing due in/, 'Loan due in').replace(/^Exit prep$/, 'Near exit window');
/** The dollar figure an estimate gives for `kind` ('revenue' picks the revenue half of "$65–100M revenue; $6–11M EBITDA"). */
function dollars(e, kind) {
  if (!e) return '';
  const parts = String(e.estimate || '').split(/;\s+/), part = (kind && parts.find(p => new RegExp(kind, 'i').test(p))) || parts[0];
  const m = part.match(/~?\$\s*[\d.,]+(?:\s*[–-]\s*\$?\s*[\d.,]+)?\s*[KMB]/i);
  return m ? m[0].replace(/\s+/g, '').replace(/-/g, '–') : '';
}
const isPF = e => /pro forma|incl\.? NJ|CET\+/i.test(e?.metric || '');   // as fin.js marks a pro forma revenue
/** Fund I's gross asset value from Form ADV, where the value and exit screen reads it (a Punctual Pros filing record). */
function fundGav(rows) {
  const find = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 4) return null; for (const [k, v] of Object.entries(o)) { if (/Broad_Sky_Partners_LP_GAV/i.test(k) && typeof v === 'number') return v; const x = typeof v === 'object' ? find(v, d + 1) : null; if (x) return x; } return null; };
  for (const r of rows) for (const i of r.d?.items || []) if (i.category === 'form_adv') { const v = find(i.key_figures); if (v) return v; }
  return null;
}
/** The months to a company's exit window (4 years held) and the month it opens. */
function windowOpens(r) {
  const d = toDate(r.entry); if (!d || r.held == null) return null;
  const at = new Date(d.getFullYear() + 4, d.getMonth(), d.getDate());
  return { mo: Math.max(0, Math.round((4 - r.held) * 12)), label: `${MON[at.getMonth()]} ${at.getFullYear()}` };
}
/** The firm's attention items, in the scoreboard's order (debt due first, then the exit window), with a company whose exit
 *  window opens within 12 months after them. Each is a fact from the value and exit table. */
function flaggedItems(rows, firm, esc) {
  const out = [];
  for (const r of rows) {
    const name = LONG[r.id] || r.short, held = r.held != null ? `${r.held.toFixed(1)} yrs held` : '', adds = addTxt(r.addOns, reportedOf(firm, r.id));
    const base = { id: r.id, r, sub: esc([held, adds].filter(Boolean).join(' · ')), chip: stChip(status(r), r.flag.st) };
    let fact = '', kind = '', when = '', st = r.flag.st;
    if (r.flag.k === 0) { kind = 'loan'; fact = `${name} loan matures ${r.matLabel || 'within two years'}`; when = r.mo != null ? `${Math.max(0, Math.round(r.mo))}<small>mo</small>` : 'Due'; }
    else if (r.flag.k === 1) { kind = 'window'; fact = `${name} is in the typical exit window`; when = 'Now'; }
    else if (r.flag.k === 2) { const w = windowOpens(r); if (!w || w.mo > 12) continue; kind = 'soon'; fact = `${name} reaches the typical exit window in ${w.label}`; when = `${w.mo}<small>mo</small>`; }
    else continue;
    out.push({ ...base, kind, st, when, fact,
      open: `<button type="button" class="sys-attn-open" data-hm="row" data-id="${esc(r.id)}"><span class="sys-dot" ${coAttr(r.id)} aria-hidden="true"></span>${esc(fact)}</button>`,
      acts: `<a href="#/${esc(r.id)}">Open ${esc(name)}</a><button type="button" data-ask="${esc(`Brief me on this: ${fact}.`)}">Ask about it</button>` });
  }
  return out;
}
/** The headline: a count of what the list holds, read as facts ("One loan due. Two exit windows."). */
function headline(items, drafts) {
  const n = k => items.filter(x => k.includes(x.kind)).length, loans = n(['loan']), wins = n(['window', 'soon']);
  const parts = [loans && `${numWord(loans)} ${plural(loans, 'loan')} due`, wins && `${numWord(wins)} exit ${plural(wins, 'window')}`, drafts && `${numWord(drafts)} ${plural(drafts, 'draft')} waiting`].filter(Boolean);
  return parts.length ? `${parts.join('. ')}.` : 'No loan due and no exit window this year.';
}
/** The six companies as status tiles, in the fixed order. */
function tilesHTML(rows, firm, esc, tpl) {
  const m = Math.min(tpl.hold / HOLD_SCALE, 1) * 100;
  const key = `<p class="sys-hold-key" aria-hidden="true"><span><i></i>Years held, 0 to ${HOLD_SCALE}</span><span><i class="is-zone"></i>Typical exit window, 4 and up</span><span><i class="is-mark"></i>Smith + Howard sold at ${esc(tpl.hold.toFixed(1))}</span></p>`;
  return `<div class="sys-tiles-box"><div class="sys-tiles">${TILE_ORDER.map(id => rows.find(r => r.id === id)).filter(Boolean).map(r => {
    const name = LONG[r.id] || r.short, rev = dollars(r.rev, 'revenue'), pf = isPF(r.rev), st = status(r);
    const v = r.held != null ? Math.min(r.held / HOLD_SCALE, 1) * 100 : 0, adds = addTxt(r.addOns, reportedOf(firm, r.id));
    return `<a class="sys-tile" ${coAttr(r.id)} href="#/${esc(r.id)}" aria-label="${esc(`${name}: revenue${pf ? ', pro forma,' : ''} ${rev || 'not known'}, estimated. Held ${r.held != null ? r.held.toFixed(1) : '—'} of ${HOLD_SCALE} years, ${adds}. ${st}. Open ${name}`)}">
      <span class="sys-tile-name"><span class="sys-dot" aria-hidden="true"></span><span>${esc(name)}</span></span>
      <span class="sys-tile-fig"><span class="sys-fig-label">Revenue${pf ? ', pro forma' : ''} ${EST}</span><span class="sys-fig-value">${esc(rev || '—')}</span></span>
      <span class="sys-hold"><span class="sys-hold-bar"><i style="--v:${v.toFixed(1)}%"></i><b style="--m:${m.toFixed(2)}%"></b></span><span class="sys-hold-meta"><span><b>${r.held != null ? r.held.toFixed(1) : '—'} yrs</b> held</span><span>${esc(adds)}</span></span></span>
      ${stChip(st, r.flag.st)}</a>`;
  }).join('')}</div>${key}</div>`;
}
/* the table's sortable columns: the company order, years held, revenue, entry value and status (most urgent first) */
const SORTS = { company: r => TILE_ORDER.indexOf(r.id), held: r => r.held ?? -1, rev: r => r.rev_sort ?? -1, ev: r => r.ev_sort ?? -1, status: r => r._k };
function tableHTML(rows, firm, esc, sort) {
  const by = SORTS[sort.key] || SORTS.status, dir = sort.dir;
  const list = rows.slice().sort((a, b) => (by(a) - by(b)) * dir || a._k - b._k);
  const th = (key, label, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''} aria-sort="${sort.key === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sys-sort" data-sort="${key}">${label}</button></th>`;
  const coRow = r => {
    const rev = dollars(r.rev, 'revenue'), ev = dollars(r.ev);
    return `<tr tabindex="0" data-id="${esc(r.id)}" aria-label="${esc(r.name)}: open the details">
      <td><span class="hm-co" ${coAttr(r.id)}><span class="sys-dot" aria-hidden="true"></span><b>${esc(LONG[r.id] || r.name)}</b></span></td>
      <td class="sys-n hm-cell" data-label="Held">${r.held != null ? `${r.held.toFixed(1)} yrs` : '—'}<span class="hm-sub">${addTxt(r.addOns, reportedOf(firm, r.id)).split(', ').map(p => `<span class="hm-nw">${esc(p)}</span>`).join(', ')}</span></td>
      <td class="sys-n hm-cell" data-label="Revenue, est.">${rev ? esc(rev) : '—'}</td>
      <td class="sys-n hm-cell hm-ev" data-label="Entry value, est.">${ev ? esc(ev) : '—'}</td>
      <td class="hm-cell hm-wrap">${esc(noteOf(r))}</td>
      <td class="hm-st">${stChip(status(r), r.flag.st)}</td></tr>`;
  };
  return `<div class="sys-table-wrap"><table class="sys-table"><caption class="sys-sr">Six companies. Press a column head to sort.</caption>
    <thead><tr>${th('company', 'Company')}${th('held', 'Held', 'sys-n')}${th('rev', `Revenue ${EST}`, 'sys-n')}${th('ev', `Entry value ${EST}`, 'sys-n hm-ev')}<th scope="col" class="hm-wrap">Of note</th>${th('status', 'Status')}</tr></thead>
    <tbody>${list.map(coRow).join('')}</tbody></table></div>`;
}

async function firmHome(ctx, role, live) {
  const { el, ui, fmt, data, esc, app, inspector } = ctx;
  const [firm, sb] = await Promise.all([data.research('bsp_firm'), loadScoreboard(ctx).catch(e => { console.error(e); return null; })]);
  if (!live()) return;
  const rows = (sb?.rows || []).slice().sort((a, b) => a._k - b._k);
  const tpl = sb?.tpl || templateExit(firm);
  const items = flaggedItems(rows, firm, esc), drafts = draftRows(role, esc);
  const asOf = firm?.meta?.generated ? fmt.date(firm.meta.generated) : '';
  // the three figures, from the same sums and records as the value and exit screen (fin.js portfolioView)
  const rev = rows.reduce((a, r) => a + (r.rev_sort || 0), 0), ebitda = rows.reduce((a, r) => a + (r.ebitda_sort || 0), 0);
  const gav = fundGav(rows), sold = sb?.capital?.broad_sky_partners_lp_total_sold_usd;
  const figs = [
    gav && sold ? { label: 'Fund I mark', value: `${fmt.num(gav / sold, 2)}x${EST}`, sub: `Gross, ${esc(fmt.money(gav))} on ${esc(fmt.money(sold))} raised` } : null,
    rev ? { label: 'Revenue', value: `${esc(fmt.money(rev))}${EST}`, sub: `Six companies, ${rows.filter(r => r.rev && isPF(r.rev)).length} pro forma` } : null,
    ebitda ? { label: 'EBITDA', value: `${esc(fmt.money(ebitda))}${EST}`, sub: rev ? `About ${Math.round(ebitda / rev * 100)}% margin` : '' } : null,
  ].filter(Boolean);
  const reported = firstSentence(fill(role.home?.lead));
  const band = bandHTML({
    kicker: `${esc(greeting())} · ${esc(role.title)}`,
    title: esc(headline(items, drafts.length)),
    lead: asOf ? `From public filings, as of ${esc(asOf)}.` : '',
    body: askBoxHTML(role, esc) + gridHTML(figsHTML(figs, 'Fund and portfolio, estimated'),
      attnHTML(`Flagged · ${items.length + drafts.length}`, [...items, ...drafts], [approvalLine(role, drafts.length), reported ? `${esc(reported.replace(/\.$/, ''))} ${SAMPLE}` : ''])),
  });
  let view = 'tiles'; try { if (localStorage.getItem(COS_KEY) === 'table') view = 'table'; } catch { /* tiles */ }
  const sort = { key: 'status', dir: 1 };
  el.innerHTML = `<div class="hm hm-firm">${band}${outHTML()}
    <section class="hm-sec hm-cos" aria-labelledby="hm-cos-h"><div class="sys-sec-head"><h2 id="hm-cos-h">Six companies</h2>
      <div class="sys-chips" role="group" aria-label="Show the six companies as"><button type="button" class="sys-chip" data-cos="tiles">Tiles</button><button type="button" class="sys-chip" data-cos="table">Table</button></div></div>
      <div class="hm-cos-body"></div>
      ${firm?.meta?.generated ? `<span data-asof>${esc(fmt.date(firm.meta.generated))}</span>` : ''}
      <p class="sys-src hm-src" data-src>Company filings estimate tables (SEC Form D and ADV, BDC schedules, PPP loans, franchise disclosures) and the BSP firm profile, as of ${esc(firm?.meta?.generated || 'Sept 2026')}. <a href="#/fin/portfolio">Value and exit table</a></p>
      <p class="sys-src hm-src" data-method>Revenue and EBITDA are the current or pro forma estimates, summed from midpoints as on the value and exit table; Fund I's mark is its gross asset value on Form ADV over the amount sold on Form D. Entry value is the enterprise value at BSP's entry. Status: a loan due within 24 months; held 4 years or more, the typical exit window; 3 or more, near it. Smith + Howard sold at ${esc(tpl.hold.toFixed(1))} years. Reported add-ons were named in the trade press, not announced by the company. The reporting line is sample data.</p>
    </section>
    ${dayHTML(role, esc)}
    ${pillHTML(role, esc)}</div>`;
  wire(el, role);

  // a row opens the side panel: the full next action, the add-ons under BSP and the estimates behind the figures
  const openRow = r => {
    const adds = addOnsOf(firm, r.id), est = r.estShown || [];
    inspector.open({ title: esc(COS.find(c => c.id === r.id)?.name || r.name), sub: `Held since ${esc(monYr(r.entry))} · ${r.held != null ? r.held.toFixed(1) : '—'} yrs · ${esc(r.flag.t)}`, color: CO_VAR(r.id), sections: [
      { label: 'Next action', html: `<div class="small">${esc(r.action)}</div>${r.detail ? `<div class="small dim mt-8">${esc(r.detail)}</div>` : ''}` },
      { label: 'Add-ons under BSP', html: adds.length ? ui.timeline(adds.map(a => ({ date: a.year || 'n/d', color: CO_VAR(r.id), html: addOnHTML(a, esc) }))) : '<div class="small dim">None announced under BSP</div>' },
      est.length ? { label: `Estimates · ${est.length}`, html: `<div class="col gap-8">${est.map(e => `<div><div class="small"><b>${esc(e.metric)}</b>${dot(e.confidence)}</div><div class="small">${esc(e.estimate)}</div>${e.basis ? `<div class="small dim">${esc(e.basis)}</div>` : ''}</div>`).join('')}</div>` } : null,
      !r.d ? { label: 'Estimates', html: ui.note(`<b>${esc(dataset(r.co.ds))}</b> is not available yet`, 'warn') } : null,
    ].filter(Boolean), actions: [{ label: 'Value and exit table', href: '#/fin/portfolio' }, { label: `Open ${esc(r.short)}`, href: `#/${r.id}` }] });
  };
  el.querySelectorAll('[data-hm="row"]').forEach(b => { const r = rows.find(x => x.id === b.dataset.id); b.onclick = () => r && openRow(r); });
  // the six companies: tiles (the default) or the sortable table, this visitor's choice kept
  const body = el.querySelector('.hm-cos-body');
  const paint = (focusSort) => {
    el.querySelectorAll('[data-cos]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cos === view)));
    if (!rows.length) { body.innerHTML = ui.note('The company figures did not load.', 'warn'); return; }
    body.innerHTML = view === 'table' ? tableHTML(rows, firm, esc, sort) : tilesHTML(rows, firm, esc, tpl);
    body.querySelectorAll('tbody tr').forEach(tr => {
      const r = rows.find(x => x.id === tr.dataset.id);
      tr.onclick = () => r && openRow(r);
      tr.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); openRow(r); } };
    });
    body.querySelectorAll('[data-sort]').forEach(b => { b.onclick = () => { const k = b.dataset.sort; sort.dir = sort.key === k ? -sort.dir : (k === 'company' || k === 'status' ? 1 : -1); sort.key = k; paint(k); }; });
    if (focusSort) body.querySelector(`[data-sort="${focusSort}"]`)?.focus();
  };
  el.querySelectorAll('[data-cos]').forEach(b => { b.onclick = () => { view = b.dataset.cos; try { localStorage.setItem(COS_KEY, view); } catch { /* this visit only */ } paint(); }; });
  paint();
  // search: the six companies and their add-ons
  app.index([...COS.map(c => ({ label: c.name, sub: c.sector, href: `#/${c.id}`, kind: 'Company', color: c.hex })), ...COS.flatMap(c => addOnsOf(firm, c.id).filter(a => !a.unid).map(a => ({ label: a.name, sub: `${c.short} add-on${a.year ? ` · ${a.year}` : ''}`, href: `#/${c.id}`, kind: 'Add-on', color: c.hex })))]);
}

/* Company leadership (and investor relations, for the fund): the band reads the company. Its headline is the role's own
   first line, its figures the role's three figures, its list that company's own items from the firm's list and the drafts
   waiting for this role. Today follows. The menu already lists the company's screens, so the home does not repeat them. */
async function companyHome(ctx, role, live) {
  const { el, esc, data } = ctx;
  const co = role.co, org = (Session.orgs() || []).find(o => o.id === role.org);
  const [sb, firm] = co ? await Promise.all([loadScoreboard(ctx).catch(() => null), data.research('bsp_firm').catch(() => null)]) : [null, null];
  if (!live()) return;
  const row = sb?.rows?.find(r => r.id === co);
  const name = co ? (LONG[co] || org?.name || co) : 'Broad Sky';
  const items = row ? flaggedItems([row], firm, esc) : [], drafts = draftRows(role, esc);
  const lead = fill(role.home?.lead), n = items.length + drafts.length;
  const held = row && row.held != null ? `Held ${row.held.toFixed(1)} yrs · ${esc(addTxt(row.addOns, reportedOf(firm, co)))}` : '';
  const band = bandHTML({
    kicker: `${esc(name)} · ${esc(role.title)} ${SAMPLE}`,
    title: esc(firstSentence(lead) || name),
    lead: esc(afterFirst(lead)),
    body: askBoxHTML(role, esc) + gridHTML(figsHTML((role.home?.kpis || []).slice(0, 3).map(t => kpiFig(esc, t)), `${esc(name)} figures`),
      attnHTML(n ? `Flagged · ${n}` : '', [...items, ...drafts], [n ? '' : `Nothing flagged for ${esc(name)}.`, approvalLine(role, drafts.length), held])),
  });
  el.innerHTML = `<div class="hm hm-co-home"${co ? ` data-co="${esc(co)}"` : ''}>${band}${outHTML()}
    ${dayHTML(role, esc)}
    <p class="sys-src hm-src" data-method>Figures marked est. are sandbox examples modeled from the public estimates, and the band's first line is sample data; hold and add-ons are from public filings. Reported add-ons were named in the trade press, not announced by the company.</p>
    ${pillHTML(role, esc)}</div>`;
  wire(el, role);
  el.querySelectorAll('[data-hm="row"]').forEach(b => { b.onclick = () => { location.hash = `#/${b.dataset.id}`; }; });
}

/* Office and field. Office: the band holds the role's figures and the day's list as its attention rows. Field: the band
   holds the next job and its actions; the rest of the day, the role's figures and the sticky ask pill follow. */
async function roleHome(ctx, role) {
  const { el, esc } = ctx;
  const org = (Session.orgs() || []).find(o => o.id === role.org);
  const list = Array.isArray(role.home?.list) ? role.home.list : [];
  const field = role.level === 'co_field' && /servicetitan|procore/.test(role.home?.list_needs || '') && list.length;
  const lead = fill(role.home?.lead);
  const kicker = `${esc(org?.name || role.dept || '')} · ${esc(role.title)} ${SAMPLE}`;
  const drafts = draftRows(role, esc);
  let html;
  if (field) {
    const [next, ...later] = list, acts = (role.action_chips || []).filter(a => /10 minutes|log what/i.test(a.label)).sort((a, b) => /10 minutes/i.test(b.label) - /10 minutes/i.test(a.label)).slice(0, 2);
    const nextHTML = `<div class="sys-next" role="group" aria-labelledby="hm-next-h"><p class="sys-next-when">Next · ${esc(fill(next.time))}</p><h2 id="hm-next-h">${esc(fill(next.title))}</h2><p>${esc(fill(next.where))}</p>${next.chip ? itemChip(fill(next.chip), esc) : ''}
      <div class="sys-next-acts"><button type="button" class="sys-btn sys-btn--primary" data-ask="${esc(fill(next.prompt || next.title))}">Ask about this job</button>${acts.map(a => `<button type="button" class="sys-btn sys-btn--secondary" data-ask="${esc(a.prompt)}">${esc(a.label)}</button>`).join('')}</div></div>`;
    html = `${bandHTML({ kicker, title: esc(firstSentence(lead) || role.title), lead: esc(afterFirst(lead)), body: nextHTML + (drafts.length ? attnHTML(`Waiting for approval · ${drafts.length}`, drafts, []) : '') })}${outHTML()}
      ${dayHTML(role, esc, { list: later, title: 'Later today', asList: true })}
      ${(role.home?.kpis || []).length ? `<section class="hm-sec" aria-label="Today in numbers">${figsHTML(role.home.kpis.map(t => kpiFig(esc, t)), 'Today in numbers', true)}</section>` : ''}`;
  } else {
    const rows = list.map(x => ({ ...whenOf(fill(x.time), esc), st: x.chip && /urgent|late|risk/i.test(x.chip) ? 'warn' : '', open: `<button type="button" class="sys-attn-open" data-ask="${esc(fill(x.prompt || x.title))}">${esc(fill(x.title))}</button>`, sub: esc(fill(x.where)), ask: true, chip: x.chip ? itemChip(fill(x.chip), esc) : '' }));
    html = bandHTML({ kicker, title: esc(firstSentence(lead) || role.title), lead: esc(afterFirst(lead)),
      body: askBoxHTML(role, esc) + gridHTML(figsHTML((role.home?.kpis || []).slice(0, 3).map(t => kpiFig(esc, t)), 'Today in numbers'),
        attnHTML(`${esc(fill(role.home?.list_title || 'Today'))} · ${list.length + drafts.length}`, [...drafts, ...rows], [approvalLine(role, drafts.length)], 5)) }) + outHTML();
  }
  el.innerHTML = `<div class="hm hm-role${field ? ' hm-field' : ''}"${role.co ? ` data-co="${esc(role.co)}"` : ''}>${html}
    <p class="sys-src hm-src" data-method>Sandbox records: fictional people and modeled numbers.</p>
    ${pillHTML(role, esc)}</div>`;
  wire(el, role);
}

/* ── The agent docked at the right of the home (direction C). The chrome is the shell's: "Agent", one quiet line naming the role
   in view (it opens the "Viewing as" switch), Clear while the thread has a message, Close. The body is the role agent page
   itself in its dock form (agent.html?embed=1&dock=1), following the role in view like the agent screen. It starts closed:
   the band's ask box is the first way in, and a question asked there, a prompt or a row's "Ask about it" opens the dock and
   is asked in it ('bsp:dock-ask'). At 1200px and wider it opens as a column (kept open across visits once the visitor opens
   it with Ask, localStorage 'bsp-os-dock'); narrower it opens over the home from the right (a full-width sheet on phones).
   While the home is on screen the top bar's Ask and its hotkey toggle it (Frame.mount().setAsk, reached as App.frame) and
   the floating launcher steps aside (html[data-home-dock], app.css). ── */
const DOCK_KEY = 'bsp-os-dock';
const X_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
const dockHTML = () => `<aside class="hm-dock" id="hm-dock" aria-labelledby="hm-dock-h" hidden>
  <div class="hm-dock-head"><div class="hm-dock-title"><h2 class="sys-card-title" id="hm-dock-h">Agent</h2><button type="button" class="hm-dock-who" data-hm="who" aria-haspopup="dialog"></button></div>
    <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-hm="clear" hidden>Clear</button>
    <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-hm="close" aria-label="Close">${X_ICON}</button></div>
  <div class="hm-dock-body"></div></aside>`;
let dockCtl = null;      // the dock of the home on screen (the ask box, the prompts and the pill open it)

/** onAddress(text) runs a typed address in the home and resolves the lookup's { status }; onClear() empties the answer area. */
function mountDock(ctx, split, onAddress, onClear) {
  const wide = matchMedia('(min-width:1200px)');
  const dock = split.querySelector('.hm-dock'), body = dock.querySelector('.hm-dock-body');
  const who = dock.querySelector('[data-hm="who"]'), clear = dock.querySelector('[data-hm="clear"]');
  const frame = ctx.app?.frame, askBtn = () => document.querySelector('[data-sys-ask]');
  const saved = () => { try { return localStorage.getItem(DOCK_KEY); } catch { return null; } };
  let open = false, unembed = null, iframe = null, thread = false, answer = false, sendGen = 0;
  // Clear shows while the thread has a message or the home shows an address answer, and empties both
  const syncClear = () => { clear.hidden = !(thread || answer); };
  // the agent page loads the first time the dock opens, then follows the role in view (modules/embed.js)
  const ensure = () => {
    if (unembed) return;
    unembed = embedView({ el: body }, 'agent.html', { title: 'Agent', params: { dock: '1' } });
    iframe = body.querySelector('iframe');
    iframe.addEventListener('load', () => {
      // Escape inside the frame closes the overlay form, as it does on the dock's own buttons. Caught on the way down: the
      // composer keeps its own Escape to itself; an open suggestion list still closes first
      try {
        const w = iframe.contentWindow;
        w.addEventListener('keydown', e => { if (e.key === 'Escape' && open && !wide.matches && !w.document.querySelector('.ch-ac:not([hidden])')) { e.preventDefault(); e.stopPropagation(); set(false, { focus: true }); } }, true);
      } catch { /* not same origin */ }
    });
  };
  const composer = () => { try { return iframe?.contentDocument?.querySelector('#ca-chat textarea') || null; } catch { return null; } };
  const focusIn = (n = 0) => { if (!open) return; const ta = composer(); if (ta) ta.focus({ preventScroll: true }); else if (n < 50) setTimeout(() => focusIn(n + 1), 100); };
  /** A question for the agent page once it is ready ({ text } or { sig: true }); a newer one replaces one still waiting. */
  const send = msg => {
    const my = ++sendGen;
    const go = (n = 0) => {
      if (my !== sendGen || !open) return;
      let ready = false;
      try { ready = !!(iframe?.contentWindow?.__agent && composer()); } catch { /* not yet */ }
      if (ready) { try { iframe.contentWindow.postMessage({ type: 'bsp:dock-ask', ...msg }, location.origin); } catch { /* gone */ } }
      else if (n < 150) setTimeout(() => go(n + 1), 100);
    };
    go();
  };
  /** opts.focus: into the composer on open, back to Ask on close; opts.keep: remember the choice (wide screens only);
   *  opts.quiet: close without moving focus (an address went to the answer area, which takes it). */
  function set(on, { focus = false, keep = false, quiet = false } = {}) {
    const had = dock.contains(document.activeElement) || (!!iframe && document.activeElement === iframe);
    open = on;
    if (on) ensure();
    dock.hidden = !on;
    split.classList.toggle('is-docked', on);
    frame?.setAskState?.(on);
    if (keep && wide.matches) { try { localStorage.setItem(DOCK_KEY, on ? 'open' : 'closed'); } catch { /* this visit only */ } }
    if (on && focus) focusIn();
    else if (!on && !quiet && (focus || had)) askBtn()?.focus();
  }
  const toggle = () => set(!open, { focus: true, keep: true });
  frame?.setAsk?.(toggle);
  who.onclick = () => document.querySelector('[data-sys-viewas] .sys-viewas-btn')?.click();
  clear.onclick = () => {
    try { iframe?.contentWindow?.postMessage({ type: 'bsp:dock-clear' }, location.origin); } catch { /* gone */ }
    if (answer) { answer = false; onClear(); }
    syncClear();
    if (!clear.hidden) return;
    if (iframe) focusIn(); else dock.querySelector('[data-hm="close"]').focus();   // Clear has gone: the keyboard stays in the dock
  };
  dock.querySelector('[data-hm="close"]').onclick = () => set(false, { focus: true, keep: true });
  dock.addEventListener('keydown', e => { if (e.key === 'Escape' && open && !wide.matches) { e.preventDefault(); set(false, { focus: true }); } });
  // the overlay closes on a press anywhere else on the page (not on Ask, which toggles it, nor on the "Viewing as" switch)
  const onDown = e => { const t = e.target; if (open && !wide.matches && t instanceof Element && !dock.contains(t) && !askBtn()?.contains(t) && !t.closest('[data-sys-viewas]')) set(false); };
  document.addEventListener('pointerdown', onDown, true);
  // closed until the first question; at 1200px and wider it stays open across visits once the visitor opened it with Ask
  const onWide = () => set(wide.matches && saved() === 'open');
  wide.addEventListener('change', onWide);
  // the agent page in the frame: whether its thread has a message (Clear), the Ask hotkey pressed inside it, and a site address
  // typed into it, whose outcome goes back to the frame so its reply line says where the answer is (or why there is none)
  const onMsg = e => {
    if (e.origin !== location.origin || !iframe || e.source !== iframe.contentWindow || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'bsp:dock') { thread = !!e.data.thread; syncClear(); }
    else if (e.data.type === 'bsp:dock-toggle') toggle();
    else if (e.data.type === 'bsp:address' && typeof e.data.text === 'string' && e.data.text.trim()) {
      const win = iframe.contentWindow, id = e.data.id;
      if (!wide.matches) set(false, { quiet: true });
      Promise.resolve(onAddress(e.data.text.trim().slice(0, 300))).catch(() => ({ status: 'error', text: '' })).then(res => {
        const side = open && wide.matches ? 'left' : 'home';
        try { win.postMessage({ type: 'bsp:address-done', id, status: res?.status || 'waiting', text: String(res?.text || ''), side }, location.origin); } catch { /* the frame has gone */ }
      });
    }
  };
  addEventListener('message', onMsg);
  // the firm reads "Broad Sky", as in the top bar's path; a company reads its catalogue name
  const update = role => { const org = role.org === 'bsp' || !role.org ? { name: 'Broad Sky' } : (Session.orgs() || []).find(o => o.id === role.org); const t = `${role.title}${org ? ` · ${org.name}` : ''}`; who.textContent = t; who.setAttribute('aria-label', `Viewing as ${t}. Change`); };
  onWide();
  return {
    update, open: () => set(true, { focus: true, keep: true }),
    /** Opens the dock with the keyboard in its composer and asks `msg` there ({ text } or { sig: true }); null only opens it. */
    ask(msg) { set(true, { focus: true }); if (msg) send(msg); },
    isOpen: () => open,
    setAnswer(on) { answer = !!on; syncClear(); },
    destroy() { sendGen++; removeEventListener('message', onMsg); document.removeEventListener('pointerdown', onDown, true); wide.removeEventListener('change', onWide); frame?.setAskState?.(false); frame?.setAsk?.(null); unembed?.(); },
  };
}

async function overview(ctx) {
  injectCss();
  await Session.ready();
  let alive = true, gen = 0, undo = null, io = null;
  firstAddr = String(ctx.params?.address || '').trim().slice(0, 300);
  // two columns: the home (scrolls on its own) and the dock; the content area itself no longer scrolls or pads
  const host = ctx.el;
  host.classList.add('hm-docked');
  host.innerHTML = `<div class="hm-split"><div class="hm-mainc"></div>${dockHTML()}</div>`;
  const split = host.firstElementChild, main = split.querySelector('.hm-mainc'), mctx = { ...ctx, el: main };
  document.documentElement.dataset.homeDock = '';
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const dock = dockCtl = mountDock(ctx, split, text => {
    setAddressHash(text, ctx.app);
    const run = runAddress(main, Session.role(), text);
    const out = main.querySelector('#hm-out');
    if (out) { out.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); out.focus({ preventScroll: true }); }
    // the answer keeps the focus when it arrives, unless the visitor has started typing in the dock again (a dock that has just
    // loaded can still put the keyboard back in its composer while the lookup runs)
    return Promise.resolve(run).then(res => {
      const o = main.querySelector('#hm-out'), a = document.activeElement;
      if (o && a && a.tagName === 'IFRAME' && split.contains(a)) { try { if (!a.contentDocument?.querySelector('#ca-chat textarea')?.value) o.focus({ preventScroll: true }); } catch { /* not ours */ } }
      return res;
    });
  }, () => clearAddress(main, ctx.app));
  // the sticky pill shows only while the band's ask box is out of view (always, on a home without one)
  const watchPill = () => {
    io?.disconnect(); io = null;
    const pill = main.querySelector('.sys-askbar'); if (!pill) return;
    const box = main.querySelector('form[data-hm="askbox"]');
    if (!box || typeof IntersectionObserver === 'undefined') { pill.toggleAttribute('data-show', true); return; }
    io = new IntersectionObserver(es => { for (const e of es) pill.toggleAttribute('data-show', !e.isIntersecting); }, { root: main, threshold: 0 });
    io.observe(box);
  };
  const draw = async ({ keepScroll = false } = {}) => {
    const my = ++gen, live = () => alive && my === gen && main.isConnected;
    if (undo) { try { undo(); } catch { /* already gone */ } undo = null; }
    const top = main.scrollTop;
    if (!keepScroll) ctx.inspector.close();
    const role = Session.role(), kind = homeKind(role);
    host.dataset.home = kind;
    dock.update(role);
    dock.setAnswer(!!firstAddr);
    if (!firstAddr && !keepScroll) setAddressHash('', ctx.app);   // a new role's home opens without the last role's answer
    if (!keepScroll) main.scrollTop = 0;
    const un = await (kind === 'firm' ? firmHome : kind === 'company' ? companyHome : roleHome)(mctx, role, live);
    if (live()) { undo = typeof un === 'function' ? un : null; watchPill(); if (keepScroll) main.scrollTop = top; } else if (typeof un === 'function') un();
  };
  const stop = Session.onChange((r, what) => { if (alive && what === 'role') draw(); });
  // the ask box and the pill: the short placeholder on a phone, the full one wider (no redraw)
  const narrow = matchMedia(PHONE), onNarrow = () => { for (const e of main.querySelectorAll('[data-ph-short]')) { const t = narrow.matches ? e.dataset.phShort : e.dataset.ph; if (e.tagName === 'INPUT') e.placeholder = t; else e.textContent = t; } };
  narrow.addEventListener('change', onNarrow);
  // a draft approved or made on the agent screen (same browser) changes the attention list: the home draws again in place
  const onStore = e => { if (alive && e.key === APPROVALS_KEY && !main.querySelector('#hm-out')?.childElementCount) draw({ keepScroll: true }); };
  addEventListener('storage', onStore);
  await draw();
  return () => {
    alive = false; stop(); removeEventListener('storage', onStore); narrow.removeEventListener('change', onNarrow); firstAddr = ''; io?.disconnect();
    main.querySelector('#hm-out')?._slCtrl?.abort();
    dock.destroy(); if (dockCtl === dock) dockCtl = null;
    delete host.dataset.home; host.classList.remove('hm-docked'); delete document.documentElement.dataset.homeDock;
    if (undo) { try { undo(); } catch { /* gone */ } }
  };
}

/* The agent inside the shell: agent.html in its embedded form, following the role in view. */
async function agentView(ctx) {
  injectCss();
  await Session.ready();   // the role list must be in before the address is built, or the page opens as the default role
  return embedView(ctx, 'agent.html', { title: 'Agent' });
}

/* Firm profile copy (OS spec 7): research notes in bsp_firm become short dated facts. An event keeps its first clause
   (bracketed detail, the part after a semicolon and analyst asides go); a biography keeps its first role. */
const firstClause = t => String(t || '').replace(/\s*\([^()]*\)/g, '').split(/;\s+|(?<=[a-z]{3})\.\s+(?=[A-Z])/)[0].replace(/\s+-\s+.*$/, '').replace(/[\s,:.]+$/, '').trim();
const shortEvent = t => {
  const s = cleanEvent(t)
    .replace(/^The Deal:.*Electrical.*$/i, 'The Deal reports BSP’s electrical services consolidation')       // a headline, not a statement of CET's reach
    .replace(/^First sale date of (BSP-[\w ]+?, LP) \(([^)]*?) deal vehicle\).*$/i, '$2 deal vehicle $1: first sale')
    .replace(/^(BSP-[\w-]+(?: [\w-]+)*?) first sale \((\$[\d.]+M) sold.*$/i, '$1 first sale: $2')
    .replace(/^(Broad Sky Partners, LP files first Form D: \$[\d.]+M sold).*$/i, '$1');
  return firstClause(s);
};
const shortBio = t => firstClause(t);

async function firmView(ctx) {
  const { el, ui, fmt, data, esc, inspector, app } = ctx;
  injectCss();
  // the next action per company is the sentence the value and exit tables print (fin.js); the profile still draws if that load fails
  const [firm, sb] = await Promise.all([data.research('bsp_firm'), loadScoreboard(ctx).catch(() => null)]);
  if (!el.isConnected) return;
  if (!firm) { el.innerHTML = ui.pageHead({ title: 'Firm profile' }) + ui.note('Research dataset not yet available: <b>BSP firm profile</b>', 'warn'); return; }
  const f = firm.firm || {};
  const stats = f.stats || { platforms: 7, add_ons: 23, exits: 1, current_holdings: 6 };
  const cap = f.capital_raised_sec_form_d || null;
  const fund = cap?.broad_sky_partners_lp_total_sold_usd || null;
  const spvs = (cap?.deal_vehicles || []).filter(v => /^BSP-/.test(v.vehicle || ''));
  const spvSum = spvs.reduce((s, v) => s + (v.sold_usd || 0), 0);
  const flSpv = spvs.find(v => v.vehicle === 'BSP-FL LP');
  const sh = templateExit(firm);
  const prg = f.prg && typeof f.prg === 'object' ? f.prg : (typeof f.prg === 'string' ? { description: f.prg, members: [] } : null);
  // add-ons counted from the table itself: the current holdings plus Smith + Howard (BSP's own "23" predates CET's October deals)
  const held = (firm.items || []).map(p => String(p.id || '').replace(/^bsp-/, ''));
  const heldAdds = held.reduce((n, id) => n + (firmItem(firm, id)?.add_ons || []).length, 0);
  const repAdds = held.reduce((n, id) => n + reportedOf(firm, id), 0);
  const allAdds = heldAdds + (sh?.addons || 0);
  // History: the unverified '$137M Fund I' research note is the Frontline deal vehicle
  const hist = (Array.isArray(f.history) ? f.history : []).map(h => /^Task brief/i.test(h.event || '')
    ? { ...h, verified: true, event: `Frontline deal vehicle BSP-FL LP files Form D: ${flSpv ? fmt.money(flSpv.sold_usd) : '$137M'} sold` }
    : { ...h, event: shortEvent(h.event) });
  const src = (text, url, asof) => `<p class="sys-src" data-src>${ui.source(text, url, asof)}</p>`;
  const tlRow = t => ({ date: t.date, color: tlColor(t.company), html: `${esc(shortEvent(t.event))}${t.source_url ? ` <a class="dim" href="${esc(t.source_url)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}` });
  const person = m => `<div class="row"><span class="strong">${esc(m.name)}</span><span class="muted small">${esc(m.title || '')}</span>${m.source_url ? `<a class="dim small" href="${esc(m.source_url)}" target="_blank" rel="noopener" aria-label="Bio">↗</a>` : ''}</div>${m.prior ? `<div class="small dim">${esc(shortBio(m.prior))}</div>` : ''}`;

  el.innerHTML = ui.pageHead({
    title: 'Firm profile',
    sub: `Fund I: ${fund ? fmt.money(fund) : '—'} from ${cap?.investors ?? '—'} investors. ${fmt.num(stats.current_holdings ?? 6)} companies, ${fmt.num(allAdds - repAdds)} add-ons${repAdds ? ` and ${fmt.num(repAdds)} reported` : ''}, ${fmt.num(stats.exits)} exit.`,
  }) +
  `${firm.meta?.generated ? `<span data-asof>${esc(fmt.date(firm.meta.generated))}</span>` : ''}` +
  ui.kpis([
    { label: 'Fund I sold (Form D)', value: fund ? fmt.money(fund) : '—', sub: `${cap?.investors ?? '—'} investors · ${cap?.as_of ? esc(monYr(cap.as_of)) : ''}` },
    { label: 'Deal-vehicle capital', value: spvSum ? fmt.money(spvSum) : '—', sub: `${spvs.length} single-deal vehicles` },
    { label: 'Companies', value: fmt.num(stats.platforms), sub: `${fmt.num(stats.current_holdings ?? 6)} held · ${fmt.num(stats.exits)} exited` },
    { label: 'Add-ons', value: fmt.num(allAdds - repAdds), sub: [repAdds ? `${fmt.num(repAdds)} more reported` : '', sh ? `${fmt.num(sh.addons)} at S+H` : ''].filter(Boolean).join(' · ') },
    { label: 'Investment team', value: fmt.num((f.team || []).length), sub: `${fmt.num(prg?.members?.length || 0)} in Resource Group` },
  ]) +
  `<p class="sys-src" data-method>Add-ons are counted from the table: ${fmt.num(heldAdds)} under the current holdings (${fmt.num(repAdds)} of them reported in the trade press, not announced) and ${fmt.num(sh?.addons || 0)} at Smith + Howard. BSP stated ${fmt.num(stats.add_ons)} on 6 Aug 2026, before CET's October deals. Deal-vehicle capital is co-investment beside Fund I, not part of it.</p>
  <div class="mt-12">${ui.panel({ title: 'Companies', body: '<div id="pf-tbl"></div>', flush: true })}${src('BSP firm profile: current holdings and timeline (Smith + Howard)', 'https://broadskypartners.com/', firm.meta?.generated)}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'History', scroll: true, body: hist.length ? ui.timeline(hist.map(h => ({ date: h.date, color: h.verified === false ? 'var(--sys-warn)' : 'var(--sys-brand)', html: `${esc(h.event)}${h.verified === false ? ` ${stChip('unverified', 'warn')}` : ''}${h.source_url ? ` <a class="dim" href="${esc(h.source_url)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}` }))) : ui.note('Firm history pending in BSP firm profile', 'warn') })}
    ${ui.panel({ title: 'Team & Portfolio Resource Group', scroll: true, body: `${(f.team || []).length ? `<div class="col gap-8 hm-people">${f.team.map(t => `<div>${person(t)}</div>`).join('')}</div>` : ui.note('Team list pending', 'warn')}
      ${prg ? `<h4 class="sys-card-label mt-16">Portfolio Resource Group</h4><div class="small text-2">Operating executives who work with company management on growth plans.</div><div class="col gap-8 mt-8 hm-people">${(prg.members || []).map(m => `<div>${person(m)}</div>`).join('')}</div>` : ''}
      ${(f.executive_board || []).length ? `<h4 class="sys-card-label mt-16">Executive Board · ${f.executive_board.length}</h4><div class="sys-chips mt-8">${f.executive_board.map(b => `<span class="sys-chip" title="${esc(shortBio(b.prior || ''))}">${esc(b.name)}</span>`).join('')}</div>` : ''}` })}
  </div>
  ${src('BSP team pages, press releases, SEC EDGAR', 'https://broadskypartners.com/team/', f.retrieved)}${src('broadskypartners.com/team and /strategy', prg?.source_url || 'https://broadskypartners.com/team/', f.retrieved)}
  <div class="mt-12">${ui.panel({ title: 'BSP timeline', body: '<div id="tl" class="hm-tl"></div>' })}${src('Press releases & BSP site', 'https://broadskypartners.com/news/', firm.meta?.generated)}</div>
  <div class="grid grid-2 mt-12">
    ${ui.panel({ title: 'Capital raised (SEC Form D)', body: '<div id="cap-tbl"></div>', flush: true })}
    ${ui.panel({ title: 'Strategy', body: `<div class="small text-2">Sector-focused private equity in essential business and consumer services; buy-and-build.</div>${(f.sectors || []).length ? `<div class="sys-chips mt-8">${f.sectors.map(x => fmt.chip(x)).join('')}</div>` : ''}` })}
  </div>
  ${src('SEC EDGAR Form D', cap?.source_url || 'https://www.sec.gov/', cap?.as_of)}
  ${(f.sources || []).length ? `<div class="sys-src" data-src>${f.sources.map(s => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(srcLabel(s))}</a>`).join(' · ')}</div>` : ''}`;

  // timeline: bsp_firm.timeline, newest first, coloured by company; the ten newest show, the rest open under "Older events"
  const tl = (firm.timeline || []).filter(t => t.date).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const SHOW = 10;
  el.querySelector('#tl').innerHTML = tl.length ? `${ui.timeline(tl.slice(0, SHOW).map(tlRow))}${tl.length > SHOW ? `<details class="sys-fold mt-12"><summary>Older events · ${tl.length - SHOW}</summary>${ui.timeline(tl.slice(SHOW).map(tlRow))}</details>` : ''}` : ui.note('The BSP timeline is not available yet.', 'warn');

  // companies table: current holdings from items[], Smith + Howard from the timeline; add-on names open in the side panel
  const rows = (firm.items || []).map(p => { const id = String(p.id || '').replace(/^bsp-/, ''); const co = COS.find(c => c.id === id); return { id, p, company: co?.name || p.company, entry: p.entry_date, hold: Math.round((yrsBetween(p.entry_date) || 0) * 10) / 10, status: p.status || 'held', addons: (p.add_ons || []).length, rep: reportedOf(firm, id), hex: CO_VAR(id) }; });
  if (sh) rows.push({ id: 'sh', company: sh.company, entry: sh.entry, exit: sh.exit, hold: Math.round(sh.hold * 10) / 10, status: 'exited', addons: sh.addons, rep: 0, hex: CO_VAR('sh'), sh });
  ui.table(el.querySelector('#pf-tbl'), { rows, pageSize: 10, sortKey: 'entry', sortDir: 1, exportName: 'bsp_companies', onRow: r => openPlatform(r), columns: [
    { key: 'company', label: 'Company', fmt: (v, r) => `<div class="row strong"><span class="sys-dot" ${coAttr(r.id)} aria-hidden="true"></span>${esc(v)}</div>` },
    { key: 'entry', label: 'Entry', num: true, fmt: (v, r) => `${esc(monYr(v))}${r.exit ? `<div class="small dim">exit ${esc(monYr(r.exit))}</div>` : ''}` },
    { key: 'hold', label: 'Hold (yrs)', num: true, fmt: v => v == null ? '—' : v.toFixed(1) },
    { key: 'status', label: 'Status', fmt: v => v === 'exited' ? stChip('Exited', '') : stChip('Held', 'good') },
    { key: 'addons', label: 'Add-ons', num: true, fmt: (v, r) => r.rep ? `<b>${fmt.num(v - r.rep)}</b> + ${fmt.num(r.rep)} reported` : `<b>${fmt.num(v)}</b>` },
  ] });
  const nextAction = id => sb?.rows.find(x => x.id === id)?.action || '';
  const openPlatform = r => {
    if (r.sh) return inspector.open({ title: 'Smith + Howard', sub: 'Exited Aug 2026 · TPG Growth', color: CO_VAR('sh'), sections: [
      { label: 'Outcome', html: ui.kv({ Entry: esc(monYr(r.entry)), Exit: esc(monYr(r.exit)), Hold: `${r.hold.toFixed(1)} yrs`, 'Add-ons': `${r.addons}`, Result: esc(r.sh.note) }) },
      { label: 'Timeline', html: ui.timeline(r.sh.named.map(t => ({ date: t.date, color: CO_VAR('sh'), html: `${esc(shortEvent(t.event))} <a class="dim" href="${esc(t.source_url)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` }))) },
    ], actions: [{ label: 'BSP sale release ↗', href: r.sh.src }] });
    const p = r.p;
    inspector.open({ title: esc(r.company), sub: `${esc(firstClause(p.sector || ''))}`, color: r.hex, sections: [
      { label: 'At a glance', html: ui.kv({ HQ: esc([p.hq_city, p.state].filter(Boolean).join(', ')), Entry: esc(monYr(p.entry_date)), Hold: `${r.hold.toFixed(1)} yrs`, Seller: esc(firstClause(p.entry_source || '')), CEO: esc(p.ceo || ''), Employees: esc(firstClause(p.employees_est || '')) }) },
      p.thesis ? { label: 'Thesis', html: `<div class="small text-2">${esc(firstClause(p.thesis))}</div>` } : null,
      { label: `Add-ons under BSP · ${r.addons}`, html: r.addons ? ui.timeline(addOnsOf(firm, r.id).map(a => ({ date: a.year || 'n/d', color: r.hex, html: addOnHTML(a, esc) }))) : '<div class="small dim">None announced under BSP</div>' },
      (p.sources || []).length ? { label: 'Sources', html: `<div class="col gap-4 small">${p.sources.slice(0, 6).map(s => `<a href="${esc(s)}" target="_blank" rel="noopener" class="ellipsis">${esc(srcLabel(s))}</a>`).join('')}</div>` } : null,
      nextAction(r.id) ? { label: 'Next action', html: `<div class="small">${esc(nextAction(r.id))}</div>` } : null,
    ].filter(Boolean), actions: [{ label: 'Open company', href: `#/${r.id}` }] });
  };
  // capital table
  const capRows = [...(fund ? [{ id: 'fund', vehicle: 'Broad Sky Partners, LP (Fund I)', company: 'Commingled fund', sold: fund, date: cap.as_of, url: cap.source_url, note: `${cap.investors} investors` }] : []),
    ...(cap?.deal_vehicles || []).map((v, i) => ({ id: `v${i}`, vehicle: v.vehicle, company: v.company, sold: v.sold_usd, date: v.first_sale || v.filed, url: v.source_url, note: v.note ? firstClause(v.note) : (v.offering_usd ? `of ${fmt.money(v.offering_usd)} offered` : '') }))];
  ui.table(el.querySelector('#cap-tbl'), { rows: capRows, pageSize: 10, sortKey: 'sold', exportName: 'bsp_form_d_vehicles', onRow: r => r.url && window.open(r.url, '_blank', 'noopener'), columns: [
    { key: 'vehicle', label: 'Vehicle', fmt: (v, r) => `<span class="small strong">${esc(v)}</span><div class="small dim">${esc(r.company)}</div>` },
    { key: 'sold', label: 'Sold', num: true, fmt: v => fmt.money(v) },
    { key: 'date', label: 'First sale / filed', num: true, fmt: v => `<span class="small">${fmt.date(v)}</span>` },
    { key: 'note', label: 'Note', fmt: v => `<span class="small text-2">${esc(v || '')}</span>` },
  ] });
  app.index((f.team || []).map(t => ({ label: t.name, sub: `BSP · ${t.title || ''}`, href: '#/home/firm', kind: 'Person', color: CO_HEX.bsp })));
}

export default {
  id: 'home', name: 'Home', tag: 'BSP', color: 'var(--sys-brand)', group: 'Command',
  tagline: 'Today, by role',
  views: [
    { id: 'overview', name: 'Overview', icon: '◉', render: overview },
    { id: 'firm', name: 'BSP profile', icon: '◈', render: firmView },
    { id: 'agent', name: 'Agent', icon: '◍', flush: true, render: agentView },
  ],
  tour: [
    { order: 100, hash: '#/home/overview', caption: '<b>Broad Sky OS.</b> Six companies. Every number is tied to a decision.', narration: 'This is Broad Sky OS. Six companies, and every number is tied to a decision.', duration: 7000 },
    { order: 105, hash: '#/home/overview', caption: '<b>Six companies.</b> Revenue, years held and status, one tile each.', narration: 'One tile per company: revenue, years held and its status.', duration: 9000 },
    { order: 110, hash: '#/home/overview', caption: '<b>Flagged.</b> Loans due, exit windows and drafts waiting for approval, in one list.', narration: 'Loans due, exit windows and drafts waiting for approval, in one list.', duration: 9000 },
    { order: 120, hash: '#/home/firm', caption: '<b>BSP.</b> A $335M Fund I, six companies today, 23 add-ons, one exit: Smith + Howard, sold August 2026.', narration: 'The firm: a three hundred thirty-five million dollar fund, six companies today, twenty-three add-ons, one exit.', duration: 7000 },
  ],
};
