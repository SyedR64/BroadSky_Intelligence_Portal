/* Home: the first screen for every level (firm, company, role) and the agent inside the shell */
import { dataset, srcLabel } from './copy.js?v=20261124183445';
import { loadScoreboard, templateExit } from './fin.js?v=20261124183445';
import { Session } from '../assets/session.js?v=20261124183445';
import { embedView } from './embed.js?v=20261124183445';
import { Counter } from '../assets/counter.js?v=20261124183445';
import { BSPSite } from '../assets/site-lookup.js?v=20261124183445';
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
   the role home for office and field. It redraws when the role changes. Each draws into the home column; the role's agent
   is docked at the right (mountDock below) and an address answer opens under the head (#hm-out). Sources and method text
   carry data-src and data-method: the shell moves them into its Sources and Method drawers. ── */
const injectCss = () => { if (!document.getElementById('css-home')) { const l = document.createElement('link'); l.id = 'css-home'; l.rel = 'stylesheet'; l.href = 'modules/home.css?v=20261124183445'; document.head.appendChild(l); } };
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
const askHTML = () => `<a class="sys-btn sys-btn--primary hm-ask" href="${AGENT}" data-hm="ask">Ask the agent</a>`;
const kpi = (esc, t) => ({ label: fill(t.label), value: `${esc(fill(t.value))}${t.modeled ? '<span class="sys-est">est.</span>' : ''}`, sub: esc(fill(t.sub)) });
const headHTML = (esc, title, lead, org, id) => `<header class="hm-head">${org ? `<p class="sys-card-label hm-org">${esc(org)}</p>` : ''}<h1 class="sys-h1"${id ? ` id="${id}"` : ''}>${esc(title)}</h1>${lead ? `<p class="sys-lead">${esc(lead)}</p>` : ''}</header>`;
function wire(el, role) {
  el.querySelectorAll('[data-hm="all"]').forEach(b => { b.onclick = () => { b.previousElementSibling?.classList.add('is-all'); b.hidden = true; }; });
  // "Ask the agent" opens the docked agent; a modified click still opens the agent screen
  el.querySelectorAll('[data-hm="ask"]').forEach(a => { a.onclick = e => { if (!dockCtl || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); dockCtl.open(); }; });
  if (firstAddr) runAddress(el, role, firstAddr);
}

/* ── The answer area (direction C): no first row any more. The signature question and the chips live in the agent docked at the
   right (agent.html?embed=1&dock=1); an address lookup (assets/site-lookup.js: buildings, sources, 3D, globe) needs the width,
   so it lands here, under the head, and takes no space until used. Two ways in: #/home/overview?address=<text> (the Ask panel
   hands a typed address over this way) and an address typed in the dock, for every role, which the dock posts as 'bsp:address'
   (the home then writes it into the address too, so a reload or Back keeps the answer). The region is not live: one short
   status line (#hm-say) reads out the answer's first sentence or the reason there is none. ── */
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
      <td class="sys-n hm-cell" data-label="Held">${r.held != null ? `${r.held.toFixed(1)} yrs` : '—'}<span class="hm-sub">${addTxt(r.addOns, reportedOf(firm, r.id)).split(', ').map(p => `<span class="hm-nw">${esc(p)}</span>`).join(', ')}</span></td>
      <td class="sys-n hm-cell" data-label="Revenue, est.">${rev ? esc(rev) : '—'}</td>
      <td class="sys-n hm-cell hm-ev" data-label="Entry value, est.">${ev ? esc(ev) : '—'}</td>
      <td class="hm-cell hm-wrap">${esc((MOVES[r.id] || (() => ''))(r))}</td>
      <td class="hm-st">${stChip(status(r), r.flag.st)}</td></tr>`;
  };
  el.innerHTML = `<div class="hm hm-firm">${headHTML(esc, 'Six companies', lead, '', 'hm-cos-h')}${askHTML()}${outHTML()}
    <section class="hm-sec hm-cos" aria-labelledby="hm-cos-h">${rows.length ? `<div class="sys-table-wrap"><table class="sys-table">
      <thead><tr><th scope="col">Company</th><th scope="col" class="sys-n">Held</th><th scope="col" class="sys-n">Revenue <span class="sys-est">est.</span></th><th scope="col" class="sys-n hm-ev">Entry value <span class="sys-est">est.</span></th><th scope="col" class="hm-wrap">What moves it</th><th scope="col">Status</th></tr></thead>
      <tbody>${rows.map(coRow).join('')}</tbody></table></div>` : ui.note('The company table did not load.', 'warn')}
      ${firm?.meta?.generated ? `<span data-asof>${esc(fmt.date(firm.meta.generated))}</span>` : ''}
      <p class="sys-src hm-src" data-src>Company filings estimate tables (SEC Form D and ADV, BDC schedules, PPP loans, franchise disclosures) and the BSP firm profile, as of ${esc(firm?.meta?.generated || 'Sept 2026')}. <a href="#/fin/portfolio">Value and exit table</a></p>
      <p class="sys-src hm-src" data-method>Revenue is the current or pro forma estimate; entry value is the enterprise value at BSP's entry. Status: debt due within 24 months, refinance or sell; held 4 years or more, exit window; 3 or more, exit prep. Smith + Howard sold at ${esc(tpl.hold.toFixed(1))} years. Reported add-ons were named in the trade press, not announced by the company.</p>
    </section>
    <div class="hm-pair">${todayHTML(role, esc)}${waitingHTML(role, esc)}</div>
    <section class="hm-sec hm-figs" aria-labelledby="hm-figs-h"><h2 class="sys-card-title" id="hm-figs-h">Figures</h2>
      ${ui.kpis([{ label: 'Strategy and operations', value: '<span class="hm-run sys-num" aria-live="off">—</span>', sub: 'Open value today, est.' }])}</section></div>`;
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
  el.innerHTML = `<div class="hm hm-co-home"${co ? ` data-co="${esc(co)}"` : ''}>${headHTML(esc, co ? (org?.name || LONG[co] || co) : 'Fund', fill(role.home?.lead), `${role.title}${co ? '' : ' · BSP'}`)}${askHTML()}${outHTML()}
    ${tiles.length ? ui.kpis(tiles) : ''}
    <div class="hm-pair">${todayHTML(role, esc)}${waitingHTML(role, esc)}</div>
    <p class="sys-src hm-src" data-method>Figures marked est. are sandbox examples modeled from the public estimates; hold and add-ons are from public filings. Reported add-ons were named in the trade press, not announced by the company.</p>
  </div>`;
  wire(el, role);
}

/* Office and field: today's items first, then the button that opens the docked agent (a link to the agent screen without the
   dock), then the role's figures. */
async function roleHome(ctx, role) {
  const { el, ui, esc } = ctx;
  const org = (Session.orgs() || []).find(o => o.id === role.org);
  const field = role.level === 'co_field';
  const tiles = (role.home?.kpis || []).map(t => kpi(esc, t));
  el.innerHTML = `<div class="hm hm-role${field ? ' hm-field' : ''}"${role.co ? ` data-co="${esc(role.co)}"` : ''}>${headHTML(esc, role.title, fill(role.home?.lead), org ? `${org.name} · ${role.dept}` : role.dept)}${outHTML()}
    ${todayHTML(role, esc, field ? 4 : 6)}
    ${askHTML()}
    ${tiles.length ? ui.kpis(tiles) : ''}
    <p class="sys-src hm-src" data-method>Sandbox records: fictional people and modeled numbers.</p>
  </div>`;
  wire(el, role);
}

/* ── The agent docked at the right of the home (direction C). The chrome is the shell's: "Agent", one quiet line naming the role
   in view (it opens the "Viewing as" switch), Clear while the thread has a message, Close. The body is the role agent page
   itself in its dock form (agent.html?embed=1&dock=1), following the role in view like the agent screen. At 1200px and wider it
   is a column, open unless the visitor closed it there (localStorage 'bsp-os-dock'); narrower it starts closed and opens over
   the home from the right (a full-width sheet on phones). While the home is on screen the top bar's Ask and its hotkey toggle
   it (Frame.mount().setAsk, reached as App.frame) and the floating launcher steps aside (html[data-home-dock], app.css). ── */
const DOCK_KEY = 'bsp-os-dock';
const X_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>';
const dockHTML = () => `<aside class="hm-dock" id="hm-dock" aria-labelledby="hm-dock-h" hidden>
  <div class="hm-dock-head"><div class="hm-dock-title"><h2 class="sys-card-title" id="hm-dock-h">Agent</h2><button type="button" class="hm-dock-who" data-hm="who" aria-haspopup="dialog"></button></div>
    <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-hm="clear" hidden>Clear</button>
    <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-hm="close" aria-label="Close">${X_ICON}</button></div>
  <div class="hm-dock-body"></div></aside>`;
let dockCtl = null;      // the dock of the home on screen (the role home's "Ask the agent" opens it)

/** onAddress(text) runs a typed address in the home and resolves the lookup's { status }; onClear() empties the answer area. */
function mountDock(ctx, split, onAddress, onClear) {
  const wide = matchMedia('(min-width:1200px)');
  const dock = split.querySelector('.hm-dock'), body = dock.querySelector('.hm-dock-body');
  const who = dock.querySelector('[data-hm="who"]'), clear = dock.querySelector('[data-hm="clear"]');
  const frame = ctx.app?.frame, askBtn = () => document.querySelector('[data-sys-ask]');
  const saved = () => { try { return localStorage.getItem(DOCK_KEY); } catch { return null; } };
  let open = false, unembed = null, iframe = null, thread = false, answer = false;
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
  const onWide = () => set(wide.matches && saved() !== 'closed');
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
    setAnswer(on) { answer = !!on; syncClear(); },
    destroy() { removeEventListener('message', onMsg); document.removeEventListener('pointerdown', onDown, true); wide.removeEventListener('change', onWide); frame?.setAskState?.(false); frame?.setAsk?.(null); unembed?.(); },
  };
}

async function overview(ctx) {
  injectCss();
  await Session.ready();
  let alive = true, gen = 0, undo = null;
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
    return run;
  }, () => clearAddress(main, ctx.app));
  const draw = async () => {
    const my = ++gen, live = () => alive && my === gen && main.isConnected;
    if (undo) { try { undo(); } catch { /* already gone */ } undo = null; }
    ctx.inspector.close();
    const role = Session.role(), kind = homeKind(role);
    host.dataset.home = kind;
    dock.update(role);
    dock.setAnswer(!!firstAddr);
    if (!firstAddr) setAddressHash('', ctx.app);   // a new role's home opens without the last role's answer
    main.scrollTop = 0;
    const un = await (kind === 'firm' ? firmHome : kind === 'company' ? companyHome : roleHome)(mctx, role, live);
    if (live()) undo = typeof un === 'function' ? un : null; else if (typeof un === 'function') un();
  };
  const stop = Session.onChange((r, what) => { if (alive && what === 'role') draw(); });
  // a draft approved or made on the agent screen (same browser) changes the "Waiting for approval" list
  const onStore = e => { if (alive && e.key === APPROVALS_KEY) { const w = main.querySelector('#hm-wait'); if (w) w.outerHTML = waitingHTML(Session.role(), ctx.esc); } };
  addEventListener('storage', onStore);
  await draw();
  return () => {
    alive = false; stop(); removeEventListener('storage', onStore); firstAddr = '';
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
    { order: 105, hash: '#/home/overview', caption: '<b>Six companies.</b> Hold, revenue, entry value, what moves it and status, one row each.', narration: 'One row per company: hold, revenue, entry value, what moves it and its status.', duration: 9000 },
    { order: 110, hash: '#/home/overview', caption: '<b>Today.</b> The day\'s items and the drafts waiting for approval.', narration: 'Today\'s items, and the drafts waiting for approval.', duration: 9000 },
    { order: 120, hash: '#/home/firm', caption: '<b>BSP.</b> A $335M Fund I, six companies today, 23 add-ons, one exit: Smith + Howard, sold August 2026.', narration: 'The firm: a three hundred thirty-five million dollar fund, six companies today, twenty-three add-ons, one exit.', duration: 7000 },
  ],
};
