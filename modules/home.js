/* Home: the first screen for every level (firm, company, role) and the agent inside the shell */
import { dataset, srcLabel } from './copy.js?v=20261124170325';
import { loadScoreboard, templateExit } from './fin.js?v=20261124170325';
import { Session } from '../assets/session.js?v=20261124170325';
import { embedView } from './embed.js?v=20261124170325';
import { Counter } from '../assets/counter.js?v=20261124170325';
import { Backend } from '../assets/backend.js?v=20261124170325';
import { BSPSite } from '../assets/site-lookup.js?v=20261124170325';
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
const addTxt = (n, rep) => { n = n || 0; const k = n - rep; return rep ? `${k} add-on${k === 1 ? '' : 's'}, ${rep} reported` : `${n} add-on${n === 1 ? '' : 's'}`; };
/** One add-on in a side-panel timeline: name, headquarters, a "reported" chip where it applies, the source link. */
const addOnHTML = (a, esc) => `${esc(a.name)}${a.hq ? ` <span class="dim">· ${esc(String(a.hq).replace(/\s*\(reported\)/i, ''))}</span>` : ''}${a.rep ? ` ${stChip('reported', 'info')}` : ''}${a.src ? ` <a class="dim" href="${esc(a.src)}" target="_blank" rel="noopener" aria-label="Source">↗</a>` : ''}`;


/* ── Home by level (OS spec 5). One screen, three homes, chosen by the role in view ("Viewing as", assets/session.js):
   the firm home for the firm levels, the company home for company leadership (and the fund home for investor relations),
   the role home for office and field. It redraws when the role changes. Sources and method text carry data-src and
   data-method: the shell moves them into its Sources and Method drawers. ── */
const injectCss = () => { if (!document.getElementById('css-home')) { const l = document.createElement('link'); l.id = 'css-home'; l.rel = 'stylesheet'; l.href = 'modules/home.css?v=20261124170325'; document.head.appendChild(l); } };
const APPROVALS_KEY = 'bsp-os-approvals';   // drafts the agent made that wait for the person's OK (assets/agent.js writes it)
const AGENT = '#/home/agent';                // never with a question in the address (OS spec 9.4)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
/** {month:-1} in the catalogue becomes last month's short name (the agent page fills it the same way). */
const fill = t => String(t ?? '').replace(/\{month:(-?\d+)\}/g, (_, n) => MONTHS[((new Date().getMonth() + Number(n)) % 12 + 12) % 12]);
const FUND_ONLY = new Set(['bsp-investor-relations']);   // firm team, but the fund and documents only (OS spec 3)
const homeKind = r => FUND_ONLY.has(r.id) ? 'company' : r.level === 'firm_leadership' || r.level === 'firm_team' ? 'firm' : r.level === 'co_leadership' ? 'company' : 'role';

/** Drafts waiting for this role's OK, newest first. */
function waiting(role) {
  try { const v = JSON.parse(localStorage.getItem(APPROVALS_KEY) || '[]'); return (Array.isArray(v) ? v : []).filter(x => x && x.role === role.id && (!x.status || x.status === 'draft')).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))); } catch { return []; }
}
const itemChip = (t, esc) => `<span class="sys-chip ${/urgent|late|past due/i.test(t) ? 'sys-chip--warn' : 'sys-chip--info'}">${esc(t)}</span>`;
function todayHTML(role, esc, max = 6) {
  const h = role.home || {}, list = Array.isArray(h.list) ? h.list : [];
  const rows = list.map((x, i) => `<li${i >= max ? ' class="hm-hide"' : ''}><a class="hm-item" href="${AGENT}"><span class="hm-time sys-num">${esc(fill(x.time))}</span><span class="hm-main"><b>${esc(fill(x.title))}</b><span>${esc(fill(x.where))}</span></span>${x.chip ? itemChip(x.chip, esc) : ''}</a></li>`).join('');
  return `<section class="sys-card hm-card" aria-labelledby="hm-today-h"><h2 class="sys-card-title" id="hm-today-h">${esc(fill(h.list_title || 'Today'))}</h2>${list.length
    ? `<ul class="hm-list" id="hm-today">${rows}</ul>${list.length > max ? `<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm hm-show" data-hm="all">All ${list.length}</button>` : ''}`
    : '<p class="hm-empty">Nothing today.</p>'}</section>`;
}
function waitingHTML(role, esc) {
  const xs = waiting(role);
  return `<section class="sys-card hm-card" aria-labelledby="hm-wait-h" id="hm-wait"><h2 class="sys-card-title" id="hm-wait-h">Waiting for approval${xs.length ? ` <span class="sys-chip sys-chip--warn">${xs.length}</span>` : ''}</h2>${xs.length
    ? `<ul class="hm-list">${xs.slice(0, 5).map(x => `<li><a class="hm-item" href="${AGENT}"><span class="hm-time">${esc(x.app || 'Draft')}</span><span class="hm-main"><b>${esc(x.title || 'Draft')}</b></span><span class="sys-chip">Not sent</span></a></li>`).join('')}</ul>`
    : '<p class="hm-empty">Nothing waiting.</p>'}</section>`;
}
const askHTML = () => `<a class="sys-btn sys-btn--primary hm-ask" href="${AGENT}">Ask the agent</a>`;
const kpi = (esc, t) => ({ label: fill(t.label), value: `${esc(fill(t.value))}${t.modeled ? '<span class="sys-est">est.</span>' : ''}`, sub: esc(fill(t.sub)) });
const headHTML = (esc, title, lead, org, id) => `<header class="hm-head">${org ? `<p class="sys-card-label hm-org">${esc(org)}</p>` : ''}<h1 class="sys-h1"${id ? ` id="${id}"` : ''}>${esc(title)}</h1>${lead ? `<p class="sys-lead">${esc(lead)}</p>` : ''}</header>`;
function wire(el) {
  el.querySelectorAll('[data-hm="all"]').forEach(b => { b.onclick = () => { b.previousElementSibling?.classList.add('is-all'); b.hidden = true; }; });
}

/* ── First on every home (wave 3 rulings 1 and 8): the role's signature question as one button, answered in place from the
   prepared answer (no model call; the static copy when the backend is off), and on the homes of the firm levels and of the
   Punctual Pros office and field roles one "Address" box (assets/site-lookup.js). #/home/overview?address=<text> (the Ask
   panel hands a typed address over this way) runs the lookup at once. ── */
const BOX_LEVELS = new Set(['firm_leadership', 'firm_team']);
const hasBox = r => BOX_LEVELS.has(r.level) || (r.co === 'pp' && (r.level === 'co_field' || r.level === 'co_office'));
const sigOf = r => (r.signature && r.signature.question ? r.signature : null);
/** A globe tour the signature names (data/research/globe_tours.json#best3), as a map command. */
const tourOf = s => { for (const d of (s && Array.isArray(s.data) ? s.data : [])) { const m = /globe_tours\.json#([a-z0-9-]{1,40})$/.exec(String(d)); if (m) return { tour: m[1] }; } return null; };
let firstAddr = '';      // the address handed over in the hash, run once
let firstUndo = null;    // removes the address box of the home on screen
const firstHTML = (role, esc) => {
  const s = sigOf(role), box = hasBox(role) || !!firstAddr;
  if (!s && !box) return '';
  return `<div class="hm-first${box ? ' hm-first--box' : ''}">${s ? `<button type="button" class="sys-btn sys-btn--primary hm-sig" data-hm="sig" aria-expanded="false" aria-controls="hm-out">${esc(s.question)}</button>` : ''}${box ? '<div class="hm-site" data-hm-site></div>' : ''}</div><div class="hm-out" id="hm-out"></div>`;
};
async function showPrepared(btn, out, role, esc) {
  if (btn.getAttribute('aria-expanded') === 'true') { out.replaceChildren(); delete out.dataset.shows; btn.setAttribute('aria-expanded', 'false'); return; }
  btn.setAttribute('aria-expanded', 'true'); out.dataset.shows = 'sig';
  const my = (out._sig = (out._sig || 0) + 1);
  out.innerHTML = '<p class="sl-line sl-progress" role="status">Opening the answer…</p>';
  const ans = await Backend.prepared(role.id).catch(() => null);
  if (out._sig !== my || out.dataset.shows !== 'sig' || !out.isConnected) return;
  if (!ans) { out.innerHTML = '<p class="sl-line" role="status">The prepared answer did not load.</p>'; return; }
  const a = document.createElement('div'); a.className = 'sl-ans hm-sig-ans';
  if (ans.text) a.innerHTML = `<p class="sl-text">${esc(ans.text)}</p>`;
  const cards = document.createElement('div'); cards.className = 'sl-cards'; a.appendChild(cards);
  const cmd = BSPSite.renderCards(cards, ans.cards, { said: ans.text }) || tourOf(sigOf(role));
  if (cmd) { const b = document.createElement('button'); b.type = 'button'; b.className = 'sys-btn sys-btn--ghost sys-btn--sm sl-map'; b.dataset.sl = 'map'; b.textContent = 'Show on the globe'; b.onclick = () => BSPSite.openMap(cmd); a.appendChild(b); }
  out.replaceChildren(a);
}
function wireFirst(ctx, role) {
  const { el, esc } = ctx, out = el.querySelector('#hm-out');
  if (!out) return;
  const btn = el.querySelector('[data-hm="sig"]'), slot = el.querySelector('[data-hm-site]');
  const box = slot ? BSPSite.mount(slot, { out, role: role.id }) : null;
  if (btn) btn.onclick = () => showPrepared(btn, out, role, esc);
  // a lookup takes the answer area: the signature button closes
  box?.el.addEventListener('submit', () => { out._sig = (out._sig || 0) + 1; out.dataset.shows = 'site'; btn?.setAttribute('aria-expanded', 'false'); });
  firstUndo = () => box?.destroy();
  if (box && firstAddr) { const t = firstAddr; firstAddr = ''; out.dataset.shows = 'site'; box.lookup(t); }
}

/* What moves each company's value, in ten words or fewer. The full sentence is the next action fin.js prints for both
   value tables; it opens in the side panel. */
const MOVES = {
  cet: r => `Integrate the ${r.addOns ?? 6} add-ons`,
  pp: r => 'Tuck-in on the undrawn loan',
  fl: r => 'Close a first add-on',
  ts: r => `Refinance or sell by ${r.matLabel || 'Dec 2027'}`,
  bpi: r => 'One reporting line',
  fh: r => 'Choose sponsor or strategic sale',
};
/** The status chip: the exit-window flag fin.js sets, cut to its first words ("Build", "In exit window", "Refinance in 13 mo"). */
const status = r => String(r.flag?.t || '').replace(/\s*\(.*\)$/, '').replace(/:.*$/, '').replace(/^Refinancing due in/, 'Refinance in');
/** The dollar figure an estimate gives for `kind` ('revenue' picks the revenue half of "$65–100M revenue; $6–11M EBITDA"). */
function dollars(e, kind) {
  if (!e) return '';
  const parts = String(e.estimate || '').split(/;\s+/), part = (kind && parts.find(p => new RegExp(kind, 'i').test(p))) || parts[0];
  const m = part.match(/~?\$\s*[\d.,]+(?:\s*[–-]\s*\$?\s*[\d.,]+)?\s*[KMB]/i);
  return m ? m[0].replace(/\s+/g, '').replace(/-/g, '–') : '';
}

async function firmHome(ctx, role, live) {
  const { el, ui, fmt, data, esc, app, inspector } = ctx;
  const [firm, sb] = await Promise.all([data.research('bsp_firm'), loadScoreboard(ctx).catch(e => { console.error(e); return null; })]);
  if (!live()) return;
  const rows = (sb?.rows || []).slice().sort((a, b) => a._k - b._k);
  const tpl = sb?.tpl || templateExit(firm);
  // the lead names the same thing the status chips say: refinancing due first, then the exit window
  const refi = rows.filter(r => r.flag?.k === 0), win = rows.filter(r => r.flag?.k === 1);
  const lead = [refi.length ? `${refi.map(r => r.short).join(' and ')} refinance due` : '', win.length ? `${win.map(r => r.short).join(' and ')} in exit window` : ''].filter(Boolean).join(' · ') || 'No company in the exit window';

  const coRow = r => {
    const rev = dollars(r.rev, 'revenue'), ev = dollars(r.ev);
    return `<tr tabindex="0" data-id="${esc(r.id)}" aria-label="${esc(r.name)}: open the details">
      <td><span class="hm-co" ${coAttr(r.id)}><span class="sys-dot" aria-hidden="true"></span><b>${esc(LONG[r.id] || r.name)}</b></span></td>
      <td class="sys-n hm-cell" data-label="Held">${r.held != null ? `${r.held.toFixed(1)} yrs` : '—'}<span class="hm-sub">${esc(addTxt(r.addOns, reportedOf(firm, r.id)))}</span></td>
      <td class="sys-n hm-cell" data-label="Revenue, est.">${rev ? esc(rev) : '—'}</td>
      <td class="sys-n hm-cell hm-ev" data-label="Entry value, est.">${ev ? esc(ev) : '—'}</td>
      <td class="hm-cell hm-wrap">${esc((MOVES[r.id] || (() => ''))(r))}</td>
      <td class="hm-st">${stChip(status(r), r.flag.st)}</td></tr>`;
  };
  el.innerHTML = `<div class="hm hm-firm">${headHTML(esc, 'Six companies', lead, '', 'hm-cos-h')}${firstHTML(role, esc)}
    <section class="hm-sec hm-cos" aria-labelledby="hm-cos-h">${rows.length ? `<div class="sys-table-wrap"><table class="sys-table">
      <thead><tr><th scope="col">Company</th><th scope="col" class="sys-n">Held</th><th scope="col" class="sys-n">Revenue <span class="sys-est">est.</span></th><th scope="col" class="sys-n hm-ev">Entry value <span class="sys-est">est.</span></th><th scope="col">What moves it</th><th scope="col">Status</th></tr></thead>
      <tbody>${rows.map(coRow).join('')}</tbody></table></div>` : ui.note('The company table did not load.', 'warn')}
      ${firm?.meta?.generated ? `<span data-asof>${esc(fmt.date(firm.meta.generated))}</span>` : ''}
      <p class="sys-src hm-src" data-src>Company filings estimate tables (SEC Form D and ADV, BDC schedules, PPP loans, franchise disclosures) and the BSP firm profile, as of ${esc(firm?.meta?.generated || 'Sept 2026')}. <a href="#/fin/portfolio">Value and exit table</a></p>
      <p class="sys-src hm-src" data-method>Revenue is the current or pro forma estimate; entry value is the enterprise value at BSP's entry. Status: debt due within 24 months, refinance or sell; held 4 years or more, exit window; 3 or more, exit prep. Smith + Howard sold at ${esc(tpl.hold.toFixed(1))} years. Reported add-ons were named in the trade press, not announced by the company.</p>
    </section>
    <div class="hm-pair">${todayHTML(role, esc)}${waitingHTML(role, esc)}</div>
    <section class="hm-sec hm-figs" aria-labelledby="hm-figs-h"><h2 class="sys-card-title" id="hm-figs-h">Figures</h2>
      ${ui.kpis([{ label: 'Strategy and operations', value: '<span class="hm-run sys-num" aria-live="off">—</span>', sub: 'Open value today, est.' }])}</section></div>`;
  wire(el); wireFirst(ctx, role);

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
  el.querySelectorAll('.hm-cos tbody tr').forEach(tr => {
    const r = rows.find(x => x.id === tr.dataset.id);
    tr.onclick = () => r && openRow(r);
    tr.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === tr) { e.preventDefault(); openRow(r); } };
  });
  // search: the six companies and their add-ons
  app.index([...COS.map(c => ({ label: c.name, sub: c.sector, href: `#/${c.id}`, kind: 'Company', color: c.hex })), ...COS.flatMap(c => addOnsOf(firm, c.id).filter(a => !a.unid).map(a => ({ label: a.name, sub: `${c.short} add-on${a.year ? ` · ${a.year}` : ''}`, href: `#/${c.id}`, kind: 'Add-on', color: c.hex })))]);
  // the running estimate (assets/counter.js, from the portal's sourced rates); its levers and notes go to the Method drawer
  const run = el.querySelector('.hm-run');
  const clock = await Counter.live(run, { baseline: 'today' }).catch(e => { console.error(e); return null; });
  if (!clock) { if (run.isConnected) run.textContent = '—'; return; }
  if (!live() || !run.isConnected) { clock.destroy(); return; }
  if (clock.method) { const m = document.createElement('div'); m.className = 'hm-src'; m.dataset.method = ''; m.innerHTML = `<p class="sys-card-label">Strategy and operations</p>${clock.method}`; el.querySelector('.hm-figs').appendChild(m); }
  return clock.destroy;
}

/* Company leadership (and investor relations, for the fund): four figures, today, waiting for approval. The menu already
   lists the company's screens, so the home does not repeat them (ruling R5). */
async function companyHome(ctx, role, live) {
  const { el, ui, fmt, esc, data } = ctx;
  const co = role.co, org = (Session.orgs() || []).find(o => o.id === role.org);
  const [sb, firm] = co ? await Promise.all([loadScoreboard(ctx).catch(() => null), data.research('bsp_firm').catch(() => null)]) : [null, null];
  if (!live()) return;
  const row = sb?.rows?.find(r => r.id === co);
  const tiles = (role.home?.kpis || []).slice(0, 3).map(t => kpi(esc, t));
  if (row) { const rep = reportedOf(firm, co); tiles.push({ label: 'Held by BSP', value: row.held != null ? `${row.held.toFixed(1)} yrs` : '—', sub: esc(rep ? addTxt(row.addOns, rep) : `${addTxt(row.addOns, 0)} · ${status(row)}`) }); }
  el.innerHTML = `<div class="hm hm-co-home"${co ? ` data-co="${esc(co)}"` : ''}>${headHTML(esc, co ? (org?.name || LONG[co] || co) : 'Fund', fill(role.home?.lead), `${role.title}${co ? '' : ' · BSP'}`)}${firstHTML(role, esc)}
    ${tiles.length ? ui.kpis(tiles) : ''}
    <div class="hm-pair">${todayHTML(role, esc)}${waitingHTML(role, esc)}</div>
    <p class="sys-src hm-src" data-method>Figures marked est. are sandbox examples modeled from the public estimates; hold and add-ons are from public filings. Reported add-ons were named in the trade press, not announced by the company.</p>
  </div>`;
  wire(el); wireFirst(ctx, role);
}

/* Office and field: today's items first, then the agent's question box (a link into the agent screen), then the role's figures. */
async function roleHome(ctx, role) {
  const { el, ui, esc } = ctx;
  const org = (Session.orgs() || []).find(o => o.id === role.org);
  const field = role.level === 'co_field';
  const tiles = (role.home?.kpis || []).map(t => kpi(esc, t));
  el.innerHTML = `<div class="hm hm-role${field ? ' hm-field' : ''}"${role.co ? ` data-co="${esc(role.co)}"` : ''}>${headHTML(esc, role.title, fill(role.home?.lead), org ? `${org.name} · ${role.dept}` : role.dept)}${firstHTML(role, esc)}
    ${todayHTML(role, esc, field ? 4 : 6)}
    ${askHTML()}
    ${tiles.length ? ui.kpis(tiles) : ''}
    <p class="sys-src hm-src" data-method>Sandbox records: fictional people and modeled numbers.</p>
  </div>`;
  wire(el); wireFirst(ctx, role);
}

async function overview(ctx) {
  injectCss();
  await Session.ready();
  let alive = true, gen = 0, undo = null;
  firstAddr = String(ctx.params?.address || '').trim().slice(0, 300);
  const dropFirst = () => { if (firstUndo) { try { firstUndo(); } catch { /* gone */ } firstUndo = null; } };
  const draw = async () => {
    const my = ++gen, live = () => alive && my === gen && ctx.el.isConnected;
    if (undo) { try { undo(); } catch { /* already gone */ } undo = null; }
    dropFirst();
    ctx.inspector.close();
    const role = Session.role(), kind = homeKind(role);
    ctx.el.dataset.home = kind;
    const un = await (kind === 'firm' ? firmHome : kind === 'company' ? companyHome : roleHome)(ctx, role, live);
    if (live()) undo = typeof un === 'function' ? un : null; else if (typeof un === 'function') un();
  };
  const stop = Session.onChange((r, what) => { if (alive && what === 'role') draw(); });
  // a draft approved or made on the agent screen (same browser) changes the "Waiting for approval" list
  const onStore = e => { if (alive && e.key === APPROVALS_KEY) { const w = ctx.el.querySelector('#hm-wait'); if (w) w.outerHTML = waitingHTML(Session.role(), ctx.esc); } };
  addEventListener('storage', onStore);
  await draw();
  return () => { alive = false; stop(); removeEventListener('storage', onStore); delete ctx.el.dataset.home; dropFirst(); firstAddr = ''; if (undo) { try { undo(); } catch { /* gone */ } } };
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
    { order: 105, hash: '#/home/overview', caption: '<b>Six companies.</b> Hold, revenue, entry value, what moves it and status, one row each.', narration: 'One row per company: hold, revenue, entry value, what moves it and its status.', duration: 9000 },
    { order: 110, hash: '#/home/overview', caption: '<b>Today.</b> The day\'s items and the drafts waiting for approval.', narration: 'Today\'s items, and the drafts waiting for approval.', duration: 9000 },
    { order: 120, hash: '#/home/firm', caption: '<b>BSP.</b> A $335M Fund I, six companies today, 23 add-ons, one exit: Smith + Howard, sold August 2026.', narration: 'The firm: a three hundred thirty-five million dollar fund, six companies today, twenty-three add-ons, one exit.', duration: 7000 },
  ],
};
