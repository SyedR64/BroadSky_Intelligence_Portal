/* Broad Sky OS session: who the visitor is viewing as, and which tools are connected.
   One store for the frame (every page), the portal shell and the agent page, so a change in one shows in the others,
   including a page embedded in the shell (same origin: the browser's storage event carries it across).
   This is navigation, not security: nobody signs in. The words on screen are always "Viewing as".
   The role catalogue is data/agent/catalog.json (44 roles). Access to records is decided where answers are made
   (server/workspace.py); this file only says which role the visitor chose. */

const ROLE_KEY = 'bsp-agent-role';          // kept from the agent page, so an earlier choice still holds
const CACHE_KEY = 'bsp-os-role';            // the chosen role object, so role() answers before the catalogue loads
const CONN_KEY = 'bsp-os-connections';      // { "<firm|co>": { "<app id>": "<state>" } }
const OLD_CONN_KEY = 'bsp-agent-connected'; // { "<role id>": { "<app id>": "<time>" } }, read once
const CATALOG_URL = new URL('../data/agent/catalog.json', import.meta.url);

export const DEFAULT_ROLE = 'bsp-managing-partner';
export const LEVELS = [
  { id: 'firm_leadership', name: 'Firm leadership' },
  { id: 'firm_team', name: 'Firm team' },
  { id: 'co_leadership', name: 'Company leadership' },
  { id: 'co_office', name: 'Company office' },
  { id: 'co_field', name: 'Company field' },
];
export const CONN_STATES = ['live', 'sandbox', 'available', 'planned'];
const FALLBACK = { id: DEFAULT_ROLE, label: 'Managing partner', org: 'bsp', dept: 'Partners', style: 'brief', level: 'firm_leadership' };

const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: the choice lasts for this page */ } };

/** The level of a role. Stored on the role when the catalogue carries it; otherwise derived by the same rule. */
export function levelOf(r) {
  if (!r) return 'firm_leadership';
  if (r.level) return r.level;
  if (r.org === 'bsp') return r.dept === 'Partners' ? 'firm_leadership' : 'firm_team';
  if (r.dept === 'Leadership') return 'co_leadership';
  return r.style === 'field' ? 'co_field' : 'co_office';
}
const shape = r => ({ ...r, title: r.label || r.title || r.id, co: r.org === 'bsp' ? null : r.org, level: levelOf(r) });

const state = { catalog: null, role: null, conn: null, subs: new Set(), loading: null };

function fromAddress() { try { return new URLSearchParams(location.search).get('role'); } catch { return null; } }
function byId(id) { return state.catalog ? state.catalog.roles.find(r => r.id === id) : null; }
function paint() {
  const r = Session.role(), h = document.documentElement;
  h.dataset.level = r.level; h.dataset.role = r.id;
  if (r.co) h.dataset.co = r.co; else delete h.dataset.co;
}
function emit(what) { paint(); for (const fn of [...state.subs]) { try { fn(Session.role(), what); } catch (e) { console.error(e); } } }

function loadConn() {
  if (state.conn) return state.conn;
  let c = read(CONN_KEY, null);
  if (!c || typeof c !== 'object') {
    c = {};
    const old = read(OLD_CONN_KEY, null);          // earlier visits kept connections per role: fold them in by company
    if (old && typeof old === 'object') for (const [roleId, apps] of Object.entries(old)) {
      const org = String(roleId).split('-')[0], key = org === 'bsp' ? 'firm' : org;
      for (const app of Object.keys(apps || {})) (c[key] ||= {})[app] = 'sandbox';
    }
  }
  return (state.conn = c);
}

export const Session = {
  LEVELS, DEFAULT_ROLE,
  /** Resolves when the role catalogue is loaded. role() is usable before that (last choice, or the managing partner). */
  ready() {
    if (state.catalog) return Promise.resolve(Session);
    return (state.loading ||= fetch(CATALOG_URL, { cache: 'no-cache' }).then(r => r.json()).then(c => {
      state.catalog = c;
      const want = [fromAddress(), read(ROLE_KEY, null), DEFAULT_ROLE].find(id => typeof id === 'string' && byId(id));
      const before = state.role && state.role.id;
      state.role = shape(byId(want) || c.roles[0]);
      write(CACHE_KEY, state.role);
      if (before !== state.role.id) emit('role'); else paint();
      return Session;
    }).catch(e => { console.warn('Session: the role list did not load', e); state.loading = null; return Session; }));
  },
  /** The role in view: { id, title, label, org, co, dept, level, style, … }. Never null. */
  role() {
    if (state.role) return state.role;
    const cached = read(CACHE_KEY, null), q = fromAddress();
    state.role = shape(cached && cached.id && (!q || q === cached.id) ? cached : FALLBACK);
    return state.role;
  },
  level() { return Session.role().level; },
  /** Company id ('pp', 'cet', …) or null for the firm. */
  co() { return Session.role().co; },
  isFirm() { return Session.role().co == null; },
  roles() { return state.catalog ? state.catalog.roles.map(shape) : [Session.role()]; },
  orgs() { return state.catalog ? state.catalog.orgs : []; },
  catalog() { return state.catalog; },
  levels() { return LEVELS; },
  /** Change the role in view. Keeps the choice, puts ?role= in the address (the hash is untouched) and tells every listener. */
  setRole(id) {
    const r = byId(id); if (!r) return false;
    state.role = shape(r);
    write(ROLE_KEY, r.id); write(CACHE_KEY, state.role);
    try { const u = new URL(location.href); u.searchParams.set('role', r.id); history.replaceState(history.state, '', u); } catch { /* keep the address */ }
    emit('role');
    return true;
  },
  /** fn(role, what) runs after a change; what is 'role' or 'conn'. Returns a function that stops listening. */
  onChange(fn) { state.subs.add(fn); return () => state.subs.delete(fn); },
  /** Connection state of one tool for one organisation ('firm' or a company id). fallback is what the data says by default. */
  conn(co, app, fallback = 'available') { const c = loadConn()[co || 'firm']; return (c && c[app]) || fallback; },
  setConn(co, app, st) {
    const c = loadConn(), key = co || 'firm';
    if (st == null) { if (c[key]) delete c[key][app]; } else if (CONN_STATES.includes(st)) (c[key] ||= {})[app] = st;
    write(CONN_KEY, c); emit('conn');
  },
  /** App ids connected in the demonstration for an organisation (what the agent request carries). */
  connectedApps(co) { const c = loadConn()[co || 'firm'] || {}; return Object.keys(c).filter(a => c[a] === 'sandbox' || c[a] === 'live'); },
};

// Another page of the site (or the shell around an embedded page) changed the choice: follow it.
try {
  addEventListener('storage', e => {
    if (e.key === ROLE_KEY) { const id = read(ROLE_KEY, null), r = byId(id); if (r && r.id !== Session.role().id) { state.role = shape(r); emit('role'); } }
    if (e.key === CONN_KEY) { state.conn = null; emit('conn'); }
  });
} catch { /* no window: nothing to follow */ }

paint();
if (typeof window !== 'undefined') window.BSPSession = Session;
