/* Company agent page (agent.html): role picker, connected apps, home summary, the inline agent and the access grid.
   Everything role-dependent comes from data/agent/catalog.json; the agent itself is the shared chat widget (assets/chat.js),
   which sends { role, connected, job } with each question. The browser only says which role and which apps; access is
   decided where the answers are made. Spec: SPEC section 1 and 5.2. Copy rules: UNIFIED.md §0 and §7, OS spec section 7.
   The role and the connections live in the Broad Sky OS session (assets/session.js): the role is the one "Viewing as"
   names everywhere, and a tool connected for a company is connected for every role at that company.
   ?embed=1 (inside the shell, #/home/agent): no role list or role card; today's list, the question box and the answers. */
import { Frame } from './frame.js?v=20261123143257';
import { Chat, PERSONAS } from './chat.js?v=20261123143257';
import { Session, CONN_STATES } from './session.js?v=20261123143257';

const APPROVALS_KEY = 'bsp-os-approvals';   // drafts waiting for the person's OK; the home screen lists them (modules/home.js)
const ON = CONN_STATES[1];                  // the demonstration state: connected with example records
const OFF = CONN_STATES[2];                 // disconnected by the visitor: the vendor's connector, not switched on
const EMBED = (() => { try { return new URLSearchParams(location.search).get('embed') === '1'; } catch { return false; } })();
const CO_ORDER = ['pp', 'cet', 'fl', 'ts', 'bpi', 'fh'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const COMPANY_APPS = { servicetitan: 'pp', procore: 'cet', servicedesk: 'fl', shopify: 'fh' };
const PHONE_ROWS = 4;

const state = { catalog: null, defaults: {}, role: null, syncing: new Set(), job: null, filter: 'all', inst: null, cards: null, quiet: false };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* ── storage (every read and write may fail: private windows, blocked storage) ── */
function readStore(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* the page works without storage */ } }

/* ── catalogue ── */
async function loadCatalog() {
  const url = new URL('../data/agent/catalog.json', import.meta.url);
  url.search = new URL(import.meta.url).search;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`catalogue ${r.status}`);
  const c = await r.json();
  if (!c || !Array.isArray(c.roles) || !c.roles.length) throw new Error('catalogue has no roles');
  return c;
}
/** What each tool is by default for each organisation ({ firm|co: { appId: state } }), from the Connections data. A missing
 *  file leaves {}: the session then counts every role app as a connected sandbox tool. */
async function loadDefaults() {
  try {
    const url = new URL('../data/research/connections.json', import.meta.url);
    url.search = new URL(import.meta.url).search;
    const r = await fetch(url); if (!r.ok) return {};
    const d = await r.json(), out = {};
    for (const g of d.groups || []) { const m = (out[g.co || 'firm'] ||= {}); for (const t of g.tools || []) if (t.id && t.state) m[t.id] = t.state; }
    return out;
  } catch { return {}; }
}
const orgOf = id => state.catalog.orgs.find(o => o.id === id) || { id, name: id, co: null, sells: '', lines: [], depts: [], portal: 'app.html' };
const roleById = id => state.catalog.roles.find(r => r.id === id) || null;
const appName = (appId, org = state.role.org) => state.catalog.app_names?.[org]?.[appId]?.name || appId;
const appMono = (appId, org = state.role.org) => state.catalog.app_names?.[org]?.[appId]?.mono || appName(appId, org).slice(0, 2).toUpperCase();
const appInfo = appId => state.catalog.apps?.[appId] || {};
const roleApps = (r = state.role) => (r.apps || []).map(a => a.id);
const styleLabel = id => state.catalog.styles?.[id] || '';
const isField = (r = state.role) => r.style === 'field';

/** {month:-1} and {month:0} become the previous and current month's short name from this browser's clock. */
function fillTokens(text) {
  const now = new Date();
  return String(text ?? '').replace(/\{month:(-?\d+)\}/g, (_, n) => MONTHS[((now.getMonth() + Number(n)) % 12 + 12) % 12]);
}
function joinAnd(list) { return list.length < 2 ? (list[0] || '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`; }
function announce(text) {
  const live = $('#ca-live'); if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 60);
}

/* ── connections: kept by company in the session (Session.connectedApps), the same answer the Connections screen gives.
   A sandbox tool counts as connected until the visitor disconnects it; a disconnect stores 'available'. ── */
const coKey = (r = state.role) => (r.org === 'bsp' ? null : r.org);
const defaultsOf = (r = state.role) => state.defaults[coKey(r) || 'firm'] || {};
const isConnected = (appId, r = state.role) => Session.connectedApps(coKey(r), [appId], defaultsOf(r)).length > 0;
const connectedApps = () => Session.connectedApps(coKey(), roleApps(), defaultsOf());
function setConnected(appIds, on) {
  state.quiet = true;   // one redraw after the change, not one per app
  try { for (const a of appIds) Session.setConn(coKey(), a, on ? ON : OFF); } finally { state.quiet = false; }
}

/* ── drafts waiting for approval: { id, role, co, title, app, status, at }[], newest last ── */
function trackDraft(ev, status) {
  if (!ev || ev.kind !== 'action_draft' || !ev.id || !state.role) return;
  const xs = (a => (Array.isArray(a) ? a : []))(readStore(APPROVALS_KEY, []));
  const i = xs.findIndex(x => x && x.id === String(ev.id));
  if (i >= 0) xs[i] = { ...xs[i], status };
  else xs.push({ id: String(ev.id), role: state.role.id, co: coKey() || 'firm', title: String(ev.title || 'Draft'), app: String(ev.app_name || ''), status, at: new Date().toISOString() });
  writeStore(APPROVALS_KEY, xs.slice(-50));
}

/** What the agent request carries: which role, the apps connected for its company (Session.connectedApps), and the job. */
function workspacePayload() {
  if (!state.role) return null;
  const out = { role: state.role.id, connected: connectedApps() };
  if (state.job && state.job.address) out.job = { address: String(state.job.address), issue: String(state.job.issue || '') };
  return out;
}

/* ── role choice: the session's role (the address, then the last choice, then the default) ── */
function initialRole() {
  const id = Session.role().id;
  return roleById(id) ? id : state.catalog.roles[0].id;
}
function accentOf(org) {
  const co = orgOf(org).co;
  try { return getComputedStyle(document.documentElement).getPropertyValue(co ? `--co-${co}` : '--sys-brand').trim() || undefined; } catch { return undefined; }
}
function registerPersona(role) {
  PERSONAS['ag-' + role.id] = {
    name: 'Company agent', short: 'the agent', initials: 'AG', color: accentOf(role.org),
    greeting: '', placeholder: role.placeholder || 'Ask the agent', suggestions: [...(role.chips || [])], intents: [], faq: [],
  };
}
function applyRoleAccent() {
  const co = orgOf(state.role.org).co;
  for (const el of [$('.ca-main'), $('#apps')]) { if (!el) continue; if (co) el.dataset.co = co; else delete el.dataset.co; }
  $('main.ca').dataset.style = state.role.style || 'desk';
  const portal = $('#ca-portal'); if (portal) portal.href = orgOf(state.role.org).portal || 'app.html';
}
function setURL(mut) {
  try { const u = new URL(location.href); mut(u.searchParams); history.replaceState(history.state, '', u); } catch { /* keep the URL */ }
}

/** Switch to a role: fresh conversation (keyboard stays closed), every panel redrawn, focus back on the control that was used. */
function setRole(id, { focus = null } = {}) {
  const role = roleById(id); if (!role) return false;
  state.role = role; state.job = null;
  if (Session.role().id !== id) Session.setRole(id);   // keeps the choice and puts ?role= in the address
  applyRoleAccent();
  registerPersona(role);
  state.inst?.setPersona('ag-' + id, { focus: false });
  renderAll();
  state.filter = role.org; renderAccess(state.filter);
  if (typeof focus === 'function') focus(); else if (focus) focus.focus?.();
  const org = orgOf(role.org).name;
  announce(`Now answering as ${role.label_a}${String(role.label_a).includes(org) ? '' : `, ${org}`}.`);
  return true;
}
function renderAll() {
  renderRoleTree($('.ca-roles'), { sheet: false });
  renderRoleHead(); renderHome(); renderApps(); mountActions(); renderHint();
}

/* ── role tree (desktop card and phone sheet share the markup) ── */
function startChipsHTML(label = true) {
  const c = state.catalog;
  return `${label ? '<p class="sys-card-label">Start with</p>' : ''}<div class="sys-chips ca-start">${(c.start_roles || []).filter(roleById).map(id =>
    `<button type="button" class="sys-chip" data-ca="role" data-role="${esc(id)}">${esc(c.start_labels?.[id] || roleById(id).label)}</button>`).join('')}</div>`;
}
function treeHTML(sheet, openOrgs) {
  const c = state.catalog, cur = state.role;
  const org = o => {
    const roles = c.roles.filter(r => r.org === o.id);
    const depts = [...(o.depts || []), ...roles.map(r => r.dept).filter(d => !(o.depts || []).includes(d))];
    const open = !o.co || o.id === cur.org || openOrgs.has(o.id);   // BSP, the root, is always open (SPEC 1.4)
    const groups = depts.map(d => {
      const rs = roles.filter(r => r.dept === d); if (!rs.length) return '';
      return `<div class="ca-dept"><p class="sys-card-label">${esc(d)}</p><ul class="ca-role-list">${rs.map(r => `<li><button type="button" class="ca-role" data-ca="role" data-role="${esc(r.id)}" aria-pressed="${r.id === cur.id}">${esc(r.label)}</button>${sheet && r.id === cur.id ? `<p class="sys-card-body ca-role-desc">${esc(r.desc)}</p>` : ''}</li>`).join('')}</ul></div>`;
    }).join('');
    return `<details class="ca-org" data-org="${esc(o.id)}"${o.co ? ` data-co="${esc(o.co)}"` : ''}${open ? ' open' : ''}>
      <summary><span class="sys-dot" aria-hidden="true"></span><span class="ca-org-n">${esc(o.name)}</span> <span class="sys-muted">${roles.length} roles</span></summary>
      <div class="ca-org-body"><p class="sys-card-body">${esc(o.sells)}</p>
      <div class="sys-chips ca-lines">${(o.lines || []).map(l => `<span class="sys-chip sys-chip--soft"${o.co ? ` data-co="${esc(o.co)}"` : ''}>${esc(l)}</span>`).join('')}</div>${groups}</div></details>`;
  };
  const bsp = c.orgs.filter(o => !o.co), cos = c.orgs.filter(o => o.co).sort((a, b) => CO_ORDER.indexOf(a.co) - CO_ORDER.indexOf(b.co));
  return `${bsp.map(org).join('')}<p class="sys-card-label ca-pc-label">Portfolio companies</p><div class="ca-tree-co">${cos.map(org).join('')}</div>`;
}
function renderRoleTree(host, { sheet = false } = {}) {
  if (!host) return;
  const openOrgs = new Set($$('details.ca-org[open]', host).map(d => d.dataset.org));
  host.innerHTML = sheet
    ? `${startChipsHTML()}<div class="ca-tree">${treeHTML(true, openOrgs)}</div>`
    : `<p class="sys-card-label" id="ca-roles-h">Choose a role</p>${startChipsHTML(false)}<div class="ca-tree">${treeHTML(false, openOrgs)}</div>`;
}

/* ── role head ── */
function renderRoleHead() {
  const el = $('.ca-role-head'); if (!el) return;
  const r = state.role, o = orgOf(r.org), apps = roleApps(), k = connectedApps().length;
  if (o.co) el.dataset.co = o.co; else delete el.dataset.co;
  const key = r.key_app && apps.includes(r.key_app) ? r.key_app : apps[0];
  // The home card already offers the same Connect button when its app is the key app: one button, not two.
  const connect = !k && key && r.home?.needs !== key ? `<button type="button" class="sys-btn sys-btn--primary sys-btn--sm ca-connect" data-ca="connect" data-app="${esc(key)}">Connect ${esc(appName(key))}</button>` : '';
  el.innerHTML = `<p class="sys-card-label">${esc(o.co ? o.name : 'BSP')} · ${esc(r.dept)}</p>
    <div class="ca-role-top"><h2 class="sys-card-title" id="ca-role-t">${esc(r.label)}</h2><button type="button" class="sys-btn sys-btn--secondary sys-btn--sm ca-change" data-ca="sheet" ${state.switchBtn ? 'aria-controls="sys-viewas-pop"' : 'aria-haspopup="dialog"'}>Change role</button></div>
    <p class="sys-card-body ca-sells">${esc(o.sells)}</p>
    <p class="sys-card-body ca-desc">${esc(r.desc)}</p>
    <div class="sys-chips"><span class="sys-chip"><span class="sys-sr">Answer style: </span>${esc(styleLabel(r.style))}</span><a class="sys-chip" href="#apps">${k ? `${k} of ${apps.length} apps` : 'No apps yet'}</a></div>
    ${connect ? `<div class="sys-card-foot">${connect}</div>` : ''}`;
}

/* ── home summary ── */
function kpiHTML(t) {
  const off = t.needs && roleApps().includes(t.needs) && !isConnected(t.needs);
  const value = off ? '—' : `${esc(fillTokens(t.value))}${t.modeled ? '<span class="sys-est sys-est--illus">illustrative</span>' : ''}`;
  const sub = off ? `Connect ${esc(appName(t.needs))}` : esc(fillTokens(t.sub));
  return `<div class="sys-kpi"><div class="sys-kpi-label">${esc(fillTokens(t.label))}</div><div class="sys-kpi-value">${value}</div><div class="sys-kpi-sub">${sub}</div></div>`;
}
function chipClass(text) { return /urgent|late|past due/i.test(text) ? 'sys-chip--warn' : /due today/i.test(text) ? 'sys-chip--info' : 'sys-chip--soft'; }
function rowHTML(row, i) {
  return `<li${i >= PHONE_ROWS ? ' class="ca-row-more"' : ''}><button type="button" class="ca-row" data-ca="row" data-i="${i}">
    <span class="ca-row-time sys-num">${esc(fillTokens(row.time))}</span>
    <span class="ca-row-main"><b>${esc(fillTokens(row.title))}</b><span>${esc(fillTokens(row.where))}</span></span>
    ${row.chip ? `<span class="sys-chip ${chipClass(row.chip)}">${esc(row.chip)}</span>` : ''}</button></li>`;
}
function renderHome() {
  const el = $('.ca-home'); if (!el) return;
  const h = state.role.home || {}, apps = roleApps();
  const needs = h.needs && apps.includes(h.needs) ? h.needs : null;
  const ready = !needs || isConnected(needs);
  const lead = ready ? `<p class="sys-card-body ca-lead">${esc(fillTokens(h.lead))}</p>`
    : `<p class="ca-lead"><button type="button" class="sys-btn sys-btn--primary sys-btn--sm" data-ca="connect" data-app="${esc(needs)}">Connect ${esc(appName(needs))} to see ${esc(h.needs_text || 'this')}</button></p>`;
  const list = ready && Array.isArray(h.list) && h.list.length ? `<div class="ca-list${h.list.length > PHONE_ROWS ? ' has-more' : ''}">
      <p class="sys-card-label">${esc(fillTokens(h.list_title || 'Today'))}</p>
      <ul class="ca-rows">${h.list.map(rowHTML).join('')}</ul>
      ${h.list.length > PHONE_ROWS ? `<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm ca-show-all" data-ca="show-all">Show all ${h.list.length}</button>` : ''}</div>` : '';
  const kpis = ready && Array.isArray(h.kpis) && h.kpis.length ? `<div class="sys-kpis ca-kpis">${h.kpis.map(kpiHTML).join('')}</div>` : '';
  el.innerHTML = `<h2 class="sys-h3" id="ca-home-h" tabindex="-1">${esc(h.title || 'Today')}</h2>${lead}${h.list_first ? list + kpis : kpis + list}`;
}

/* ── connected apps panel ── */
function setCounts(app) { return (app.sets || []).slice(0, 2).map(s => `${s.label} ${Number(s.count) || 0}`).join(' · '); }
function tileHTML(app) {
  const id = app.id, info = appInfo(id), name = appName(id), co = COMPANY_APPS[id];
  const on = isConnected(id), syncing = state.syncing.has(id);
  const chip = syncing ? '<span class="sys-chip sys-chip--info ca-syncing"><span class="sys-dot sys-dot--live" aria-hidden="true"></span>Syncing</span>'
    : on ? '<span class="sys-chip sys-chip--good">Connected</span>' : '<span class="sys-chip">Not connected</span>';
  const btn = on ? `<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-ca="disconnect" data-app="${esc(id)}" aria-label="Disconnect ${esc(name)}">Disconnect</button>`
    : `<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-ca="connect" data-app="${esc(id)}" aria-label="Connect ${esc(name)}"${syncing ? ' disabled' : ''}>Connect</button>`;
  return `<article class="ca-app sys-card sys-card--flat" data-app="${esc(id)}"${co ? ` data-co="${co}"` : ''}>
    <div class="ca-app-top"><span class="ca-mono" aria-hidden="true">${esc(appMono(id))}</span><div class="ca-app-name"><p class="sys-card-label">${esc(info.category || '')}</p><h3 class="sys-card-title"${info.term && info.term.startsWith(name + ':') ? ` title="${esc(info.term)}"` : ''}>${esc(name)}</h3></div></div>
    <p class="sys-card-body">${esc(info.what || '')}</p>
    <div class="ca-app-status">${chip}</div>
    <div class="sys-card-foot">${btn}${on ? `<span class="sys-src">${esc(setCounts(app))}</span>` : ''}</div></article>`;
}
function renderApps() {
  const el = $('#apps'); if (!el) return;
  const r = state.role, apps = r.apps || [], all = apps.length && apps.every(a => isConnected(a.id));
  const head = !apps.length ? '' : all
    ? '<button type="button" class="sys-btn sys-btn--ghost sys-btn--sm" data-ca="disconnect-all">Disconnect all</button>'
    : `<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-ca="connect-all"${state.syncing.size ? ' disabled' : ''}>Connect all</button>`;
  const unavailable = (r.unavailable || []).filter(Boolean);
  el.innerHTML = `<div class="ca-apps-head"><div><p class="sys-card-label">Connected apps</p><h2 class="sys-h3" id="ca-apps-h">${esc(orgOf(r.org).name)} apps</h2></div>${head}</div>
    <div class="ca-app-list">${apps.map(tileHTML).join('')}</div>
    ${unavailable.length ? `<p class="sys-src">Not for this role: ${esc(unavailable.join(', '))}</p>` : ''}`;
}
function renderHint() {
  const el = $('.ca-hint'); if (!el) return;
  const names = connectedApps().map(a => appName(a));
  el.textContent = state.offline ? 'Agent offline' : names.length ? `Reads ${names.length > 2 ? `${names.slice(0, 2).join(', ')} and more` : joinAnd(names)}` : 'No apps connected';
  syncHint();
}
function syncHint() {
  const el = $('.ca-hint'), open = !!state.inst?.root?.querySelector('.ch-thread.open');
  if (el) el.hidden = open;
}

/* ── consent and sync (one dialog, two steps; no inputs of any kind) ── */
const dlg = { el: null, opener: null, fromMain: false, apps: [], phase: 'idle', raf: 0, finish: null };
function dialogHead(title, apps) {
  const mono = apps.length === 1 ? `<span class="ca-mono" aria-hidden="true">${esc(appMono(apps[0]))}</span>` : '';
  return `<p class="sys-card-label">Broad Sky OS sandbox</p>
    <div class="ca-dlg-title">${mono}<h2 class="sys-h3" id="ca-consent-h" tabindex="-1" autofocus>${esc(title)}</h2></div>`;
}
function openConsent(appIds) {
  const el = $('#ca-consent'); if (!el || !appIds.length) return;
  const r = state.role, apps = appIds.map(id => (r.apps || []).find(a => a.id === id)).filter(Boolean);
  if (!apps.length) return;
  dlg.el = el; dlg.opener = document.activeElement; dlg.fromMain = !!dlg.opener?.closest?.('.ca-main'); dlg.apps = apps.map(a => a.id); dlg.phase = 'consent';
  const co = orgOf(r.org).co; if (co) el.dataset.co = co; else delete el.dataset.co;
  const one = apps.length === 1, name = one ? appName(apps[0].id) : '';
  const reads = one ? `<ul class="sys-card-list">${(apps[0].read || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
    : apps.map(a => `<p class="sys-card-body ca-dlg-app"><b>${esc(appName(a.id))}</b></p><ul class="sys-card-list">${(a.read || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`).join('');
  const wont = ['Send, change or delete anything', ...new Set(apps.flatMap(a => a.wont || []))];
  el.innerHTML = `${dialogHead(one ? `Connect ${name}` : `Connect ${apps.length} apps`, dlg.apps)}
    <p class="sys-card-body">The agent reads these records for ${esc(r.label_a)}. It can't change anything in ${one ? esc(name) : 'these apps'}.</p>
    <p class="sys-card-label">It will read</p>${reads}
    <p class="sys-card-label">It won't</p><ul class="sys-card-list">${wont.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <div class="sys-actions"><button type="button" class="sys-btn sys-btn--primary" data-ca="allow">Allow read-only access</button><button type="button" class="sys-btn sys-btn--ghost" data-ca="cancel">Cancel</button></div>`;
  if (!el.open) { try { el.showModal(); } catch { el.setAttribute('open', ''); } }
  $('#ca-consent-h', el)?.focus();
}
/** Records "sync": counts run from 0 to the catalogue counts over 1.2 s; the dialog stays open until Done. */
function runSync(appIds) {
  const el = dlg.el, r = state.role; if (!el) return;
  const apps = appIds.map(id => (r.apps || []).find(a => a.id === id)).filter(Boolean);
  const one = apps.length === 1, title = one ? `Syncing ${appName(apps[0].id)}` : `Syncing ${apps.length} apps`;
  const rows = apps.flatMap(a => (a.sets || []).map(s => ({ label: one ? s.label : `${appName(a.id)} · ${s.label}`, n: Math.max(0, Number(s.count) || 0) })));
  dlg.phase = 'sync';
  apps.forEach(a => state.syncing.add(a.id));
  renderApps();
  el.innerHTML = `${dialogHead(title, appIds)}
    <ul class="ca-sync">${rows.map(x => `<li><span class="ca-sync-l">${esc(x.label)}</span><span class="sys-num ca-sync-n" data-n="${x.n}">0</span><span class="ca-sync-ok" aria-hidden="true"></span></li>`).join('')}</ul>
    <p class="sys-card-body ca-sync-done" hidden>Connected. The agent can read these records now.</p>
    <div class="sys-actions" hidden><button type="button" class="sys-btn sys-btn--primary" data-ca="done">Done</button></div>`;
  $('#ca-consent-h', el)?.focus();
  const nums = $$('.ca-sync-n', el), t0 = performance.now(), D = 1200;
  const finish = () => {
    if (dlg.phase !== 'sync') return;
    cancelAnimationFrame(dlg.raf); dlg.phase = 'done'; dlg.finish = null;
    nums.forEach(n => { n.textContent = Number(n.dataset.n).toLocaleString('en-US'); n.closest('li')?.classList.add('is-done'); });
    apps.forEach(a => state.syncing.delete(a.id));
    setConnected(apps.map(a => a.id), true);
    renderRoleHead(); renderHome(); renderApps(); renderHint();
    $('.ca-sync-done', el).hidden = false; $('.sys-actions', el).hidden = false;
    if (el.open) $('[data-ca="done"]', el)?.focus();
    announce(one ? `${appName(apps[0].id)} connected.` : `${apps.length} apps connected.`);
  };
  dlg.finish = finish;
  if (reduced()) { finish(); return; }
  const step = t => {
    const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
    nums.forEach(n => { n.textContent = Math.round(Number(n.dataset.n) * e).toLocaleString('en-US'); });
    if (p < 1) dlg.raf = requestAnimationFrame(step); else finish();
  };
  dlg.raf = requestAnimationFrame(step);
}
function onConsentClose() {
  if (dlg.phase === 'sync' && dlg.finish) dlg.finish();   // closed mid-sync (Escape): the connection still completes
  dlg.phase = 'idle';
  const o = dlg.opener; dlg.opener = null;
  if (o && o.isConnected && !o.disabled) { o.focus(); return; }
  // The button that opened the dialog was redrawn: go to the same app's tile, or to the home summary.
  const id = dlg.apps[0];
  const same = o?.dataset?.app && $(`.ca-main [data-ca="connect"][data-app="${CSS.escape(o.dataset.app)}"]`);
  if (same) { same.focus(); return; }
  if (dlg.fromMain) { $('#ca-home-h')?.focus(); return; }
  ($(`#apps .ca-app[data-app="${CSS.escape(id || '')}"] button`) || $('#ca-apps-h'))?.focus();
}
function disconnect(appId) {
  setConnected([appId], false);
  renderRoleHead(); renderHome(); renderApps(); renderHint();
  ($(`#apps .ca-app[data-app="${CSS.escape(appId)}"] [data-ca="connect"]`))?.focus();
  announce(`${appName(appId)} disconnected.`);
}

/* ── role sheet (phones and tablets) ── */
function openSheet() {
  const el = $('#ca-role-sheet'); if (!el) return;
  const co = orgOf(state.role.org).co; if (co) el.dataset.co = co; else delete el.dataset.co;
  el.innerHTML = `<h2 class="sys-h3" id="ca-sheet-h" tabindex="-1" autofocus>Choose a role</h2><div class="ca-sheet-body"></div>
    <div class="sys-actions"><button type="button" class="sys-btn sys-btn--ghost" data-ca="close-sheet">Close</button></div>`;
  renderRoleTree($('.ca-sheet-body', el), { sheet: true });
  if (!el.open) { try { el.showModal(); } catch { el.setAttribute('open', ''); } }
  $('#ca-sheet-h', el)?.focus();
  $('.ca-role[aria-pressed="true"]', el)?.scrollIntoView({ block: 'center' });
}
/** Change role with the top bar present: open its "Viewing as" switch (a keyboard-style open puts focus on the current role). */
function openSwitch() {
  const b = state.switchBtn; if (!b || !b.isConnected) { openSheet(); return; }
  if (b.getAttribute('aria-expanded') !== 'true') { b.focus({ preventScroll: true }); b.click(); }
}
/** Inside the shell (?embed=1) a link to another page opens in the top window, never inside the frame. */
function toTop(e) {
  const a = e.target.closest?.('a[href]'); if (!a || a.target === '_blank') return;
  let u; try { u = new URL(a.getAttribute('href'), location.href); } catch { return; }
  if (u.origin === location.origin && u.pathname === location.pathname && u.search === location.search) return;   // a place on this page
  a.target = '_top';
}
function closeSheet() { const el = $('#ca-role-sheet'); if (el?.open) el.close(); }

/* ── access grid: roles down the side, the apps they read across, one tick per app (and one for company numbers) ── */
const APP_ORDER = ['email', 'calendar', 'chat', 'drive', 'financials', 'adp', 'dealcloud', 'salesforce', 'marketing', 'servicetitan', 'procore', 'servicedesk', 'shopify'];
const hasNumbers = r => !!r.numbers_text && !/^\s*(–|-|none)?\s*$/i.test(r.numbers_text);
function renderAccess(filter = state.filter) {
  const host = $('.ca-access'); if (!host || !state.catalog) return;
  state.filter = filter;
  const c = state.catalog, orgs = [c.orgs.find(o => !o.co), ...c.orgs.filter(o => o.co).sort((a, b) => CO_ORDER.indexOf(a.co) - CO_ORDER.indexOf(b.co))].filter(Boolean);
  const roles = c.roles.filter(r => filter === 'all' || r.org === filter);
  const cur = state.role?.id, one = filter !== 'all';
  const ids = [...new Set(roles.flatMap(r => roleApps(r)))].sort((a, b) => (APP_ORDER.indexOf(a) + 1 || 99) - (APP_ORDER.indexOf(b) + 1 || 99));
  // one company: its own app names; every company: the kind of app (the brands differ by company)
  const head = id => one ? appName(id, filter) : (appInfo(id).category || appName(id, 'bsp'));
  const tick = (on, label) => on ? `<span class="ca-tick" aria-hidden="true">✓</span><span class="sys-sr">${esc(label)}</span>` : '<span class="sys-sr">No</span>';
  const chips = `<div class="sys-chips ca-filter" role="group" aria-label="Filter by company">${[{ id: 'all', name: 'All' }, ...orgs].map(o =>
    `<button type="button" class="sys-chip" data-ca="filter" data-org="${esc(o.id)}" aria-pressed="${o.id === filter}">${esc(o.name)}</button>`).join('')}</div>`;
  const rows = roles.map(r => {
    const here = r.id === cur, mine = roleApps(r);
    return `<tr${here ? ' aria-current="true" class="ca-row-current"' : ''}><th scope="row">${esc(r.label)}${one ? '' : `<span class="ca-grid-org"> · ${esc(orgOf(r.org).name)}</span>`}</th>${ids.map(id => `<td>${tick(mine.includes(id), 'Yes')}</td>`).join('')}<td title="${esc(hasNumbers(r) ? r.numbers_text : '')}">${tick(hasNumbers(r), 'Yes')}</td></tr>`;
  }).join('');
  host.innerHTML = `${chips}
    <div class="sys-table-wrap ca-access-table"><table class="sys-table ca-grid">
      <thead><tr><th scope="col">Role</th>${ids.map(id => `<th scope="col" title="${esc(appInfo(id).what || '')}">${esc(head(id))}</th>`).join('')}<th scope="col">Numbers</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <p class="ca-try"><button type="button" class="sys-chip" data-ca="try">Ask a technician for EBITDA</button></p>`;
}

/* ── chat ── */
function mountActions() {
  const root = state.inst?.root; if (!root) return;
  let box = $('.ca-actions', root);
  if (!box) {
    box = document.createElement('div'); box.className = 'ca-actions sys-chips';
    box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Actions');
    const thread = $('.ch-thread', root); if (thread) thread.before(box); else root.appendChild(box);
  }
  const list = isField() ? (state.role.action_chips || []) : [];
  box.innerHTML = list.map((a, i) => `<button type="button" class="sys-chip" data-ca="action" data-i="${i}">${esc(a.label)}</button>`).join('');
  box.hidden = !list.length;
}
function scrollTurnIntoView(turnEl) {
  if (!turnEl?.getBoundingClientRect) return;
  const css = getComputedStyle(document.documentElement);
  const topH = EMBED ? 0 : parseFloat(css.getPropertyValue('--sys-top-h')) || 56;
  const subH = $('.sys-subnav')?.getBoundingClientRect().height || 0;
  window.scrollTo({ top: turnEl.getBoundingClientRect().top + scrollY - topH - subH - 8, behavior: reduced() ? 'auto' : 'smooth' });
  syncHint();
}
function onSketch(ev) {
  state.job = { address: String(ev?.address || ''), issue: String(ev?.issue || '') };
  const items = [...(ev?.floors || []).flatMap(f => f.items || []), ...(ev?.outside || [])];
  const likely = items.filter(i => i.basis === 'likely').length;
  announce(`Floor sketch ready: ${items.length} items, ${likely} likely.`);
}
function onDecision(ev, status) { trackDraft(ev, status); announce(status === 'approved' ? 'Draft approved. Nothing was sent.' : 'Draft discarded.'); }
function renderCard(ev, ctx) {
  const f = state.cards?.renderCard;
  const out = typeof f === 'function' ? f(ev, { ...ctx, onDecision, onSketch }) : null;
  if (out && ev?.kind === 'action_draft') trackDraft(ev, ev.status === 'approved' || ev.status === 'discarded' ? ev.status : 'draft');
  return out;
}
function ask(q) { if (state.inst && q) state.inst.ask(q); }

/* ── events ── */
function onClick(e) {
  const t = e.target.closest('[data-ca]'); if (!t) return;
  const a = t.dataset.ca;
  if (a === 'role') {
    const inSheet = !!t.closest('#ca-role-sheet'), id = t.dataset.role;
    if (inSheet) { closeSheet(); setRole(id, { focus: () => $('.ca-change')?.focus() }); }
    else setRole(id, { focus: () => $(`.ca-roles [data-ca="role"][data-role="${CSS.escape(id)}"]`)?.focus() });
  } else if (a === 'sheet') { if (state.switchBtn) openSwitch(); else openSheet(); }
  else if (a === 'close-sheet') closeSheet();
  else if (a === 'connect') openConsent([t.dataset.app]);
  else if (a === 'connect-all') openConsent(roleApps().filter(x => !isConnected(x)));
  else if (a === 'disconnect') disconnect(t.dataset.app);
  else if (a === 'disconnect-all') { setConnected(roleApps(), false); renderRoleHead(); renderHome(); renderApps(); renderHint(); $('#apps [data-ca="connect-all"]')?.focus(); announce('All apps disconnected.'); }
  else if (a === 'allow') runSync(dlg.apps);
  else if (a === 'cancel' || a === 'done') dlg.el?.close();
  else if (a === 'row') {
    const row = state.role.home?.list?.[Number(t.dataset.i)]; if (!row) return;
    if (row.job) state.job = { ...row.job };
    ask(fillTokens(row.prompt));
  } else if (a === 'show-all') { t.closest('.ca-list')?.classList.add('is-all'); t.hidden = true; $('.ca-row-more .ca-row')?.focus(); }
  else if (a === 'action') { const c = state.role.action_chips?.[Number(t.dataset.i)]; if (c) ask(c.prompt); }
  else if (a === 'filter') { renderAccess(t.dataset.org); $(`.ca-filter [data-org="${CSS.escape(t.dataset.org)}"]`)?.focus(); }
  else if (a === 'try') {
    setRole('pp-hvac-technician');
    const ta = state.inst?.root?.querySelector('textarea');
    ta?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    ta?.focus({ preventScroll: true });
    ask("What's our EBITDA this year?");
  }
}

/** Desktop role list: when the picked role is out of view, scroll it into the upper third of the list (the page itself does not
 *  move). A role already in view leaves the list where it is, so the "Choose a role" label and the Start chips stay showing. */
function showCurrentRole() {
  const list = $('.ca-roles'), b = list && $('.ca-role[aria-pressed="true"]', list);
  if (!b || list.scrollHeight <= list.clientHeight) return;
  const lr = list.getBoundingClientRect(), br = b.getBoundingClientRect(), top = lr.top + list.clientTop;
  if (br.top >= top && br.bottom <= top + list.clientHeight) return;
  list.scrollTop = Math.max(0, list.scrollTop + br.top - top - list.clientHeight / 3);
}
/** Say up front when the agent is offline (no backend, or one without the company agent), not only after a question. */
async function checkBackend() {
  try {
    const m = await import('./backend.js?v=20261123143257');
    const B = m.Backend || m.default;
    const ok = B && await B.discover() && B.health?.workspace;
    if (ok) return;
  } catch { /* treat as offline */ }
  state.offline = true;
  renderHint();
}

function failNote(msg) {
  const host = $('#agent .sys-wrap'); if (!host) return;
  host.innerHTML = `<div class="sys-note sys-note--bad"><p>${esc(msg)}</p></div>`;
}

/* ── boot ── */
export async function boot() {
  const params = new URLSearchParams(location.search);
  try { [state.catalog, state.defaults] = await Promise.all([loadCatalog(), loadDefaults()]); }
  catch (e) {
    console.warn('company agent: catalogue did not load', e);
    failNote('The role list did not load. Reload the page.');
    $('.ca-access') && ($('.ca-access').innerHTML = '');
    Frame.mount({ active: 'agent', crumb: [{ label: 'Home', href: './' }, { label: 'Company agent' }] });
    return;
  }
  if (EMBED) document.documentElement.dataset.embed = '1';
  await Session.ready();
  state.role = roleById(initialRole());   // read only: a role is stored when the visitor picks one, never by default
  if (params.get('apps') === 'all') setConnected(roleApps(), true);
  applyRoleAccent();
  registerPersona(state.role);
  state.cards = await import('./agent-cards.js?v=20261123143257').catch(e => { console.warn('company agent: card renderers did not load', e); return null; });

  state.inst = Chat.mount(document.getElementById('ca-chat'), {
    persona: 'ag-' + state.role.id, mode: 'inline', hostedOnly: true, expand: false, commands: false, engine: false,
    workspace: () => workspacePayload(),
    renderCard: (ev, ctx) => renderCard(ev, ctx),
    onTurn: turnEl => scrollTurnIntoView(turnEl),
    privacy: 'Drafts wait for your approval. Nothing is sent.',
    offlineHTML: '<p>The agent is offline right now. Your apps and the access table still work.</p>',
  });
  Frame.mount({ active: 'agent', crumb: [{ label: 'Home', href: './' }, { label: 'Company agent' }], persona: state.inst.id, chat: state.inst });
  // The top bar's "Viewing as" switch picks the role: the page drops its own role list, and Change role opens the switch
  const sw = !EMBED && document.querySelector('[data-sys-viewas] .sys-viewas-btn');
  if (sw) { state.switchBtn = sw; $('.ca-roles')?.remove(); $('.ca-layout')?.classList.add('ca-layout--switch'); }
  if (EMBED) document.addEventListener('click', toTop, true);

  renderAll();
  state.filter = state.role.org; renderAccess(state.filter);
  showCurrentRole();
  // nothing goes to the backend until the visitor turns to the agent: the offline check waits for the question box
  const probe = () => { if (state.probed) return; state.probed = true; checkBackend(); };
  for (const ev of ['focusin', 'pointerdown']) $('#ca-chat')?.addEventListener(ev, probe, { once: true });
  // "Viewing as" changed in the shell or another tab, or a tool was connected elsewhere: follow it
  Session.onChange((r, what) => {
    if (what === 'role' && r.id !== state.role?.id && roleById(r.id)) setRole(r.id);
    else if (what === 'conn' && !state.quiet && !state.syncing.size) { renderRoleHead(); renderHome(); renderApps(); renderHint(); }
  });

  document.addEventListener('click', onClick);
  $('#ca-consent')?.addEventListener('close', onConsentClose);
  $('#ca-role-sheet')?.addEventListener('close', () => { const b = $('.ca-change'); if (b && !$('#ca-role-sheet').contains(document.activeElement)) b.focus(); });
  const thread = state.inst.root?.querySelector('.ch-thread');
  if (thread) new MutationObserver(syncHint).observe(thread, { attributes: true, attributeFilter: ['class'] });

  const q = params.get('q');
  if (q) {
    setURL(p => p.delete('q'));
    setTimeout(() => ask(q), 400);
  }
  window.__agent = { state, setRole, catalog: state.catalog, workspace: workspacePayload };
}
