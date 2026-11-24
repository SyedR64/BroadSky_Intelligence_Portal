/* Globe: a full-bleed 3D globe that any part of the product steers through the map command bus (assets/mapcmd.js):
   a 'bsp:map' event, MapCmd.run(cmd), a { type: 'bsp:map', cmd } message from an embedded page, or the address
   (#/globe/view?tour=<id>, #/globe/view?lat=…&lon=…&label=…[&kind=site&precision=typed]).
   Two renderers sit behind the one command. assets/runtime.json "maps.google3dTilesKey" set: the CesiumJS
   photorealistic renderer (assets/godseye-cesium.js); empty or absent (the default): the MapLibre globe
   (assets/godseye.js). Neither the file nor any tile is fetched before the visitor opens this screen.
   Prepared tours come from data/research/globe_tours.json (built from the add-on screens and the firm records).
   The firm levels see the portfolio tours; a company role sees its own company's. The field level is shown the
   globe only for an address: a typed address ('site' steps) or a job's example address; no tours, no other places. */
import { Session } from '../assets/session.js?v=20261124160552';
import { MapCmd } from '../assets/mapcmd.js?v=20261124160552';

const V = new URL(import.meta.url).search;   // the registry's ?v= stamp, reused for the engine and the stylesheet

/** The Google key in assets/runtime.json (maps.google3dTilesKey), or ''. Read when the screen opens, never before. */
export async function mapsKey() {
  try {
    const r = await fetch(`assets/runtime.json${V || ''}`, { cache: 'no-cache' });
    if (!r.ok) return '';
    const k = (await r.json())?.maps?.google3dTilesKey;
    return typeof k === 'string' && /^[\w-]{20,60}$/.test(k.trim()) ? k.trim() : '';
  } catch { return ''; }
}

/** The CesiumJS renderer behind the same small interface as assets/godseye.js mount(). */
async function mountCesium(host, key, opts) {
  const CX = await import(`../assets/godseye-cesium.js${V || '?v=20261124160552'}`);
  const api = CX.createGlobe(host, { maps: { google3dTilesKey: key }, controls: false, onStop: opts.onStop, onEnd: opts.onEnd });
  const r = await api.ready;
  return {
    renderer: 'cesium', api,
    get mode() { return r.ok ? 'cesium' : 'fallback'; },
    run: cmd => api.run(cmd), goTo: i => api.goTo(i), next: () => api.next(), prev: () => api.prev(),
    pause: () => api.pause(), resume: () => api.resume(), home: () => api.home(),
    state: () => { const st = api.state(); return { ...st, look: st.mode, renderer: 'cesium', mode: r.ok ? 'cesium' : 'fallback' }; },
    destroy: () => api.destroy(),
  };
}

/** The tours a role may run: firm levels get the firm's; a company role gets its own company's. */
function toursFor(all, role) {
  if (role.level === 'co_field') return [];
  const co = role.co;
  const out = [];
  for (const t of all) {
    const f = t.for || {};
    if (!co && f.firm) out.push(t);
    else if (co && f.co === co) out.push(t);
    else if (co && f.own_stop) {
      const own = (t.steps || []).filter(s => s.co === co);
      if (own.length) out.push({ ...t, id: `${t.id}-${co}`, title: 'Headquarters', steps: own });
    }
  }
  return out;
}

async function view(ctx) {
  const { el, params, data, esc, app } = ctx;
  if (!document.getElementById('css-globe')) { const l = document.createElement('link'); l.id = 'css-globe'; l.rel = 'stylesheet'; l.href = `modules/globe.css${V || '?v=20261124160552'}`; document.head.appendChild(l); }
  const role = Session.role();
  const field = role.level === 'co_field';
  el.innerHTML = `<div class="gx-screen">
    <div class="gx-host"></div>
    <aside class="sys-card gx-panel" aria-label="Tours">
      <div class="gx-head"><h1 class="sys-card-title gx-h1">Globe</h1>
        <div class="gx-ctl" hidden>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="prev" aria-label="Previous stop"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="pause" aria-label="Pause" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path class="i-pause" d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="next" aria-label="Next stop"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          <button type="button" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" data-act="home" aria-label="Whole globe"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M2.5 8h11M8 2.5c-2 2.2-2 8.8 0 11M8 2.5c2 2.2 2 8.8 0 11" stroke="currentColor" stroke-width="1.2" fill="none"/></svg></button>
        </div></div>
      <div class="sys-chips gx-tours" role="group" aria-label="Tours"></div>
      <div class="gx-now" hidden><div class="sys-card-label gx-title"></div><ol class="gx-stops"></ol></div>
    </aside></div>`;
  const host = el.querySelector('.gx-host'), $tours = el.querySelector('.gx-tours'), $now = el.querySelector('.gx-now'), $title = el.querySelector('.gx-title'), $stops = el.querySelector('.gx-stops'), $ctl = el.querySelector('.gx-ctl');
  let src = null;   // the tour's source line: marked data-src, so the shell moves it to the Sources drawer

  const allTours = (await data.research('globe_tours'))?.tours || [];
  const tours = toursFor(allTours, role);
  $tours.innerHTML = tours.map(t => `<button type="button" class="sys-chip" data-tour="${esc(t.id)}" aria-pressed="false">${esc(t.title)}</button>`).join('');
  if (!tours.length) $tours.hidden = true;

  const key = params.fallback === '1' ? '' : await mapsKey();
  if (!host.isConnected) return;   // the visitor left while the key was read
  const screen = el.querySelector('.gx-screen');
  screen.dataset.renderer = key ? 'cesium' : 'open';
  const engineOpts = {
    preserveDrawingBuffer: params.capture === '1',
    forceFallback: params.fallback === '1',
    onStop: i => { [...$stops.children].forEach((li, k) => li.classList.toggle('on', k === i)); },
    onEnd: () => {},
  };
  let g;
  try { g = key ? await mountCesium(host, key, engineOpts) : await (await import(`../assets/godseye.js${V || '?v=20261124160552'}`)).mount(host, engineOpts); }
  catch (e) { console.warn('[globe]', e); host.innerHTML = `<div class="gx-msg">${ctx.ui.note('The globe could not load.', 'warn')}</div>`; return; }
  if (!host.isConnected) { g.destroy(); return; }
  if (!g.renderer) g.renderer = 'open';
  window.BSPGlobe = g;
  // phones: the renderer's own controls sit below the panel band
  const $panel = el.querySelector('.gx-panel');
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => screen.style.setProperty('--gx-panel-h', `${Math.ceil($panel.getBoundingClientRect().bottom - screen.getBoundingClientRect().top)}px`)) : null;
  ro?.observe($panel);

  let current = null;
  const setSrc = text => {
    src?.remove(); src = null;
    if (!text) return;
    src = document.createElement('p'); src.className = 'sys-src'; src.dataset.src = ''; src.textContent = text;
    el.querySelector('.gx-panel').appendChild(src);
  };
  const show = cmd => {
    current = cmd;
    $now.hidden = !cmd.steps.length; $ctl.hidden = cmd.steps.length < 2 || g.mode === 'fallback';
    $title.textContent = cmd.title;
    $stops.innerHTML = cmd.steps.map((s, i) => `<li><button type="button" class="gx-stop" data-i="${i}"><span class="gx-k sys-num">${i + 1}</span><span class="gx-l">${esc(s.label)}</span></button></li>`).join('');
    $tours.querySelectorAll('[data-tour]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tour === cmd._tour)));
    setSrc(cmd.source);
    setPaused(false);
    g.run(cmd);
  };
  /** Resolve and run a cleaned command (a tour id or steps). The field level keeps address steps only. */
  const run = cmd => {
    if (!cmd) return false;
    if (cmd.tour) {
      const t = tours.find(x => x.id === cmd.tour) || (!role.co && !field ? allTours.find(x => x.id === cmd.tour) : null);
      if (!t) return false;
      const v = MapCmd.validate({ title: t.title, steps: t.steps, source: t.source });
      if (!v.ok) return false;
      show({ ...v.cmd, _tour: t.id });
      const h = `#/globe/view?tour=${encodeURIComponent(t.id)}`; if (location.hash !== h) history.replaceState(history.state, '', h);
      return true;
    }
    let c = cmd;
    if (field) { const steps = (c.steps || []).filter(s => s.kind === 'address' || s.kind === 'site'); if (!steps.length) return false; c = { ...c, steps, marks: [] }; }
    show(c);
    return true;
  };

  $tours.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (b) run({ tour: b.dataset.tour }); });
  $stops.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { setPaused(false); g.goTo(+b.dataset.i); } });
  const $pause = $ctl.querySelector('[data-act=pause]');
  function setPaused(p) { $pause.setAttribute('aria-pressed', String(p)); $pause.setAttribute('aria-label', p ? 'Play' : 'Pause'); $pause.querySelector('svg').innerHTML = p ? '<path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/>' : '<path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'; }
  $ctl.addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
    if (a === 'prev') { setPaused(false); g.prev(); } else if (a === 'next') { setPaused(false); g.next(); }
    else if (a === 'pause') { const p = $pause.getAttribute('aria-pressed') !== 'true'; setPaused(p); p ? g.pause() : g.resume(); }
    else if (a === 'home') { g.home(); current = null; $now.hidden = true; $ctl.hidden = true; setSrc(null); $tours.querySelectorAll('[data-tour]').forEach(b => b.setAttribute('aria-pressed', 'false')); history.replaceState(history.state, '', '#/globe/view'); }
  });

  // commands from anywhere in the product while the screen is open
  const onCmd = e => {
    const v = e.detail?._clean ? { ok: true, cmd: e.detail } : MapCmd.validate(e.detail);
    if (!v.ok) { console.warn('[globe] command refused:', (v.errors || []).join('; ')); return; }
    if (run(v.cmd) && !v.cmd.tour && location.hash !== '#/globe/view') history.replaceState(history.state, '', '#/globe/view');
  };
  window.addEventListener(MapCmd.EVENT, onCmd);
  window.__bspGlobeOpen = true;

  // first command: one sent before the screen opened, else the address; else the globe waits with the companies marked
  const first = MapCmd.takePending() || MapCmd.fromAddress(params);
  if (!run(first) && !field) {
    const hq = allTours.find(t => t.id === 'companies');
    const marks = (hq?.steps || []).filter(s => !role.co || s.co === role.co).map(s => ({ lat: s.lat, lon: s.lon, label: s.label }));
    if (marks.length) g.run({ title: '', steps: [], marks, fit: false });
  }

  app.index(tours.map(t => ({ label: `Globe · ${t.title}`, sub: t.steps.map(s => s.label).slice(0, 3).join(', '), href: `#/globe/view?tour=${t.id}`, kind: 'Tour', color: 'var(--sys-brand)' })));

  return () => {
    window.__bspGlobeOpen = false;
    window.removeEventListener(MapCmd.EVENT, onCmd);
    ro?.disconnect();
    src?.remove();
    if (window.BSPGlobe === g) window.BSPGlobe = null;
    try { g.destroy(); } catch { }
  };
}

export default {
  id: 'globe',
  name: 'Globe',
  tag: 'GL',
  color: 'var(--sys-brand)',
  group: 'Command',
  tagline: 'A 3D globe of the portfolio, steered by tours and by the agent',
  views: [
    { id: 'view', name: 'Globe', icon: '◍', flush: true, render: view },
  ],
};
