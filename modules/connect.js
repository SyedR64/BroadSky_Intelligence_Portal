/* Connections: every tool the firm and its companies run on, by name, with an honest state.
   Data: data/research/connections.json. States and wording: the OS build spec, section 6.
   A company role sees its own company only; the firm levels see the firm, then the six companies.
   A tool in the demonstration ("sandbox") or with a published connector ("available") can be switched between the two;
   the choice is kept per organisation in the session store (assets/session.js), which the company agent reads. */
import { Session } from '../assets/session.js?v=20261123143257';

const injectCss = () => { if (!document.getElementById('css-connect')) { const l = document.createElement('link'); l.id = 'css-connect'; l.rel = 'stylesheet'; l.href = 'modules/connect.css?v=20261123143257'; document.head.appendChild(l); } };

const STATES = ['live', 'sandbox', 'available', 'planned'];
const CHIP = { live: 'sys-chip sys-chip--good', sandbox: 'sys-chip sys-chip--info', available: 'sys-chip', planned: 'sys-chip cx-planned' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };

/** The state shown now: the data's state, or the demonstration choice for a tool that can switch. */
const switchable = t => (t.state === 'sandbox' || t.state === 'available') && !!t.doc;
const stateOf = (g, t) => switchable(t) ? Session.conn(g.co, t.id, t.state) : t.state;

function tile(g, t, src, D, esc) {
  const st = stateOf(g, t), doc = t.doc && src[t.doc], ev = t.evidence && src[t.evidence];
  const label = D.states[st];
  const chip = (st === 'available' || st === 'live') && doc
    ? `<a class="${CHIP[st]}" href="${esc(doc.url)}" target="_blank" rel="noopener" aria-label="${esc(label)}: ${esc(doc.title)}">${esc(label)}</a>`
    : `<span class="${CHIP[st]}">${esc(label)}</span>`;
  const mark = st === 'live' ? '' : ev
    ? `<a href="${esc(ev.url)}" target="_blank" rel="noopener" title="${esc(ev.title)}">${esc(D.marks[t.mark])}</a>`
    : `<span class="sys-muted">${esc(D.marks[t.mark])}</span>`;
  const btn = switchable(t)
    ? `<button type="button" class="sys-btn sys-btn--secondary sys-btn--sm" data-switch="${esc(t.id)}" data-g="${esc(g.id)}" aria-label="${st === 'sandbox' ? 'Disconnect' : 'Connect'} ${esc(t.name)}">${st === 'sandbox' ? 'Disconnect' : 'Connect'}</button>`
    : '';
  return `<article class="sys-card cx-tile" data-state="${st}"${g.co ? ` data-co="${g.co}"` : ''}>
    <div class="sys-card-label">${esc(t.category)}</div>
    <h3 class="sys-card-title">${esc(t.name)}</h3>
    <p class="sys-card-body">${esc(t.reads)}</p>
    <div class="sys-chips">${chip}</div>
    <div class="sys-card-foot">${mark}${btn}</div>
  </article>`;
}

async function overview(ctx) {
  injectCss();
  const { el, esc } = ctx;
  el.innerHTML = ctx.ui.loading('Loading connections');
  const [D] = await Promise.all([ctx.data.load('connections'), Session.ready()]);
  if (!el.isConnected) return;
  const src = Object.fromEntries(D.sources.map(s => [s.id, s]));
  let filter = STATES.includes(ctx.params.state) ? ctx.params.state : '';

  const groups = () => {
    const co = Session.co();
    return co ? D.groups.filter(g => g.co === co) : D.groups;
  };

  const draw = () => {
    const gs = groups();
    const all = gs.flatMap(g => g.tools.map(t => stateOf(g, t)));
    const count = s => all.filter(x => x === s).length;
    const where = gs.length === 1 ? (gs[0].co ? `at ${gs[0].name}` : 'at the firm') : 'across the firm and six companies';
    const chips = [['', 'All', all.length], ...STATES.map(s => [s, D.states[s], count(s)])]
      .map(([v, l, n]) => `<button type="button" class="sys-chip" data-filter="${v}" aria-pressed="${filter === v}">${esc(l)} <span class="sys-num">${n}</span></button>`).join('');
    const body = gs.map(g => {
      const tools = g.tools.filter(t => !filter || stateOf(g, t) === filter);
      if (!tools.length) return '';
      return `<section class="cx-group" aria-labelledby="cx-h-${g.id}"${g.co ? ` data-co="${g.co}"` : ''}>
        <h2 class="sys-h3 cx-group-head" id="cx-h-${g.id}"><span class="sys-dot" aria-hidden="true"></span>${esc(g.name)} <span class="sys-num sys-muted">${tools.length}</span></h2>
        <div class="sys-grid sys-grid--4 cx-tiles">${tools.map(t => tile(g, t, src, D, esc)).join('')}</div>
      </section>`;
    }).join('');
    const cited = new Set(gs.flatMap(g => g.tools.flatMap(t => [t.doc, t.evidence]).filter(Boolean)));
    el.innerHTML = `
      ${ctx.ui.pageHead({ title: 'Connections', sub: `${all.length} tools ${where}`, chips: `<span class="sys-chip">As of ${esc(day(D.as_of))}</span>` })}
      <div class="sys-chips cx-filter" role="group" aria-label="Filter by state">${chips}</div>
      <div class="cx-groups">${body}</div>
      <section class="sys-card cx-method" data-method>
        <h2 class="sys-card-title">States and marks</h2>
        <ul class="sys-card-list">
          <li><b>Live</b>: the OS reads this public feed now.</li>
          <li><b>Sandbox</b>: connected in the demonstration, with example data.</li>
          <li><b>Connector available</b>: the vendor publishes an API or connector.</li>
          <li><b>Planned</b>: on the software roadmap.</li>
          <li><b>In use (public source)</b>: a public page shows the company uses it.</li>
          <li><b>Franchisor's system</b>: Authority Brands named it the system for its franchise locations.</li>
          <li><b>Supports for clients</b>: Frontline names it among the law-firm software it supports.</li>
          <li><b>Standard in the industry</b>: common in the sector; no claim of use.</li>
        </ul>
      </section>
      <section class="sys-card cx-sources" data-src>
        <h2 class="sys-card-title">Sources</h2>
        <ul class="sys-card-list">${D.sources.filter(s => cited.has(s.id)).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> · ${esc(s.publisher || '')}</li>`).join('')}</ul>
      </section>`;
  };

  el.onclick = e => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      draw();
      el.querySelector(`[data-filter="${CSS.escape(filter)}"]`)?.focus({ preventScroll: true });
      return;
    }
    const b = e.target.closest('[data-switch]');
    if (b) {
      const g = D.groups.find(x => x.id === b.dataset.g), t = g && g.tools.find(x => x.id === b.dataset.switch);
      if (!t) return;
      const next = stateOf(g, t) === 'sandbox' ? 'available' : 'sandbox';
      Session.setConn(g.co, t.id, next);   // kept explicitly, so the company agent sees what is connected (Session.connectedApps)
      el.querySelector(`[data-switch="${CSS.escape(t.id)}"][data-g="${CSS.escape(g.id)}"]`)?.focus({ preventScroll: true });
    }
  };

  draw();
  ctx.app.index?.(D.groups.flatMap(g => g.tools.map(t => ({ label: t.name, sub: `${g.name} · ${t.category}`, href: '#/connect/overview', kind: 'Connection', color: 'var(--sys-brand)' }))));
  const stop = Session.onChange(() => { if (el.isConnected) draw(); });
  return () => { stop(); el.onclick = null; };
}

export default {
  id: 'connect', name: 'Connections', color: 'var(--sys-brand)',
  views: [
    { id: 'overview', name: 'All tools', render: overview },
  ],
};
