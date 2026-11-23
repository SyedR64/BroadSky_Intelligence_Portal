/* Connections: every tool the firm and its companies run on, by name, with an honest state.
   Data: data/research/connections.json. States and wording: the OS build spec, section 6; layout: ruling R6 (one compact
   row per tool, grouped by organisation). A company role sees its own company only; the firm levels see the firm, then
   the six companies.
   A tool in the demonstration ("sandbox" in the data, which is exactly the agent's app ids for that organisation) is
   connected until the visitor disconnects it (ruling R1). The state is read with Session.conn(co, app, 'sandbox') and
   written with Session.setConn: a disconnect stores 'available', a connect 'sandbox'; Session.connectedApps, which the
   company agent reads, counts the same thing. Every other tool keeps the state the data gives it and has no control. */
import { Session } from '../assets/session.js?v=20261123172325';

const injectCss = () => { if (!document.getElementById('css-connect')) { const l = document.createElement('link'); l.id = 'css-connect'; l.rel = 'stylesheet'; l.href = 'modules/connect.css?v=20261123172325'; document.head.appendChild(l); } };

const STATES = ['live', 'sandbox', 'available', 'planned'];
const CHIP = { live: 'sys-chip sys-chip--good', sandbox: 'sys-chip sys-chip--info', available: 'sys-chip', planned: 'sys-chip cx-planned' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };
const DEFAULT_MARK = 'industry_standard';   // unmarked rows; defined once in Method
const MARK_NOTE = {
  in_use: 'a public page shows the company uses it.',
  franchisor: 'Authority Brands named it the system for its franchise locations.',
  supports_clients: 'Frontline names it among the law-firm software it supports.',
  industry_standard: 'standard in the industry; no claim of use.',
};

/** Only the demonstration's own apps switch; their default is the data's state ('sandbox'). */
const switchable = t => t.state === 'sandbox';
/** The state shown now. A disconnected demonstration app shows "Connector available" where the vendor's
    documentation is cited, otherwise "Planned" (spec 6: no connector claim without a documentation link). */
function stateOf(g, t) {
  if (!switchable(t)) return t.state;
  const s = Session.conn(g.co, t.id, t.state);
  return s === 'sandbox' || s === 'live' ? 'sandbox' : (t.doc ? 'available' : 'planned');
}

function row(g, t, src, D, esc, seen) {
  const st = stateOf(g, t), doc = t.doc && src[t.doc], ev = t.evidence && src[t.evidence];
  const label = D.states[st];
  const chip = (st === 'available' || st === 'live') && doc
    ? `<a class="${CHIP[st]}" href="${esc(doc.url)}" target="_blank" rel="noopener" title="${esc(doc.title)}">${esc(label)}</a>`
    : `<span class="${CHIP[st]}">${esc(label)}</span>`;
  const mark = t.mark === DEFAULT_MARK ? '' : ev
    ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener" title="${esc(ev.title)}">${esc(D.marks[t.mark])}</a>`
    : esc(D.marks[t.mark]);
  // a sentence appears once per screen (copy rule 9): a "reads" line already shown above is left out
  const reads = seen.has(t.reads) ? '' : (seen.add(t.reads), esc(t.reads));
  const on = st === 'sandbox';
  const btn = switchable(t)
    ? `<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-switch="${esc(t.id)}" data-g="${esc(g.id)}" aria-label="${on ? 'Disconnect' : 'Connect'} ${esc(t.name)}">${on ? 'Disconnect' : 'Connect'}</button>`
    : '';
  return `<li class="cx-row" data-state="${st}">
    <span class="cx-name">${esc(t.name)}</span><span class="cx-cat">${esc(t.category)}</span><span class="cx-reads">${reads}</span>
    <span class="cx-st">${chip}</span><span class="cx-mark">${mark}</span><span class="cx-act">${btn}</span></li>`;
}

async function overview(ctx) {
  injectCss();
  const { el, esc } = ctx;
  el.innerHTML = ctx.ui.loading('Loading connections');
  const [D] = await Promise.all([ctx.data.load('connections'), Session.ready()]);
  if (!el.isConnected) return;
  const src = Object.fromEntries(D.sources.map(s => [s.id, s]));
  let filter = STATES.includes(ctx.params.state) ? ctx.params.state : '';
  const co = Session.co();
  const gs = co ? D.groups.filter(g => g.co === co) : D.groups;
  const total = gs.reduce((n, g) => n + g.tools.length, 0);
  const where = gs.length === 1 ? (gs[0].co ? `at ${gs[0].name}` : 'at the firm') : 'across the firm and six companies';
  const cited = new Set(gs.flatMap(g => g.tools.flatMap(t => [t.doc, t.evidence]).filter(Boolean)));
  const marks = new Set(gs.flatMap(g => g.tools.map(t => t.mark)));

  // Drawn once: the head (the menu item names the screen, so the h1 is for screen readers only: copy rule 9), the
  // Method and Sources marks (moved to the header drawers; Method lists only the marks this view shows) and the as-of chip.
  el.innerHTML = `
    <h1 class="sys-h1 sys-sr">Connections</h1>
    <header class="page-head"><div class="page-head-copy"><p class="sys-lead sub">${total} tools ${where}</p></div></header>
    <span data-asof>${esc(day(D.as_of))}</span>
    <div class="sys-chips cx-filter" role="group" aria-label="Filter by state"></div>
    <div class="cx-groups"></div>
    <section class="cx-method" data-method>
      <h2 class="sys-card-title">States and marks</h2>
      <ul class="sys-card-list">
        <li><b>Live</b>: a public feed or record the OS draws on.</li>
        <li><b>Sandbox</b>: connected in the demonstration, with example data.</li>
        <li><b>Connector available</b>: the vendor publishes an API or connector.</li>
        <li><b>Planned</b>: on the software roadmap.</li>
        ${Object.keys(MARK_NOTE).filter(k => marks.has(k)).map(k => `<li><b>${esc(k === DEFAULT_MARK ? 'No mark' : D.marks[k])}</b>: ${MARK_NOTE[k]}</li>`).join('')}
      </ul>
    </section>
    <section class="cx-sources" data-src>
      <ul class="sys-card-list">${D.sources.filter(s => cited.has(s.id)).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> · ${esc(s.publisher || '')}</li>`).join('')}</ul>
    </section>`;
  const fbox = el.querySelector('.cx-filter'), gbox = el.querySelector('.cx-groups');

  const draw = () => {
    const all = gs.flatMap(g => g.tools.map(t => stateOf(g, t)));
    const count = s => all.filter(x => x === s).length;
    fbox.innerHTML = [['', 'All', all.length], ...STATES.map(s => [s, D.states[s], count(s)])]
      .map(([v, l, n]) => `<button type="button" class="sys-chip" data-filter="${v}" aria-pressed="${filter === v}">${esc(l)} <span class="sys-num">${n}</span></button>`).join('');
    const seen = new Set();
    gbox.innerHTML = gs.map(g => {
      const tools = g.tools.filter(t => !filter || stateOf(g, t) === filter);
      if (!tools.length) return '';
      return `<section class="cx-group" aria-labelledby="cx-h-${g.id}"${g.co ? ` data-co="${g.co}"` : ''}>
        <h2 class="sys-card-label cx-group-head" id="cx-h-${g.id}"><span class="sys-dot" aria-hidden="true"></span>${esc(g.name)} <span class="sys-num">${tools.length}</span></h2>
        <ul class="sys-table-wrap cx-list">${tools.map(t => row(g, t, src, D, esc, seen)).join('')}</ul>
      </section>`;
    }).join('');
  };

  el.onclick = e => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      draw();
      fbox.querySelector(`[data-filter="${CSS.escape(filter)}"]`)?.focus({ preventScroll: true });
      return;
    }
    const b = e.target.closest('[data-switch]');
    if (b) {
      const g = gs.find(x => x.id === b.dataset.g), t = g && g.tools.find(x => x.id === b.dataset.switch);
      if (!t || !switchable(t)) return;
      Session.setConn(g.co, t.id, stateOf(g, t) === 'sandbox' ? 'available' : 'sandbox');   // redraws through onChange
      gbox.querySelector(`[data-switch="${CSS.escape(t.id)}"][data-g="${CSS.escape(g.id)}"]`)?.focus({ preventScroll: true });
    }
  };

  draw();
  ctx.app.index?.(gs.flatMap(g => g.tools.map(t => ({ label: t.name, sub: `${g.name} · ${t.category}`, href: '#/connect/overview', kind: 'Connection', color: 'var(--sys-brand)' }))));
  const stop = Session.onChange((r, what) => { if (what === 'conn' && el.isConnected) draw(); });
  return () => { stop(); el.onclick = null; };
}

export default {
  id: 'connect', name: 'Connections', color: 'var(--sys-brand)',
  views: [
    { id: 'overview', name: 'All tools', render: overview },
  ],
};
