import * as Copy from './copy.js?v=20261123194657';
/* 3D map — cinematic GPU map scenes over the portal's datasets (engine: assets/theater.js) */
const V = new URL(import.meta.url).search; // reuse the registry's ?v= stamp for cache-busting the engine

/* About panel: what each scene answers, the keys and the sources. Moved in from the standalone page (theater.html),
   which now forwards here. Hidden until the reader presses "i" in the scene list. */
const ABOUT = `<aside class="sys-card th-about" id="th-about" hidden aria-labelledby="th-about-h">
  <div class="th-about-head"><h2 class="sys-card-title" id="th-about-h">About the 3D map</h2><button id="th-about-x" class="sys-btn sys-btn--ghost sys-btn--sm sys-btn--icon" type="button" aria-label="Close"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg></button></div>
  <div class="sys-card-body">
  <ol>
    <li><b>Portfolio</b>: where the portfolio companies sit and how big each footprint is.</li>
    <li><b>Where the homes trade</b>: every recorded home sale in the Punctual Pros territory; the newest 90 days pulse.</li>
    <li><b>Nationwide</b>: the phased path from East Hempfield to the Sun Belt, plus screened add-on targets.</li>
    <li><b>New England grid</b>: CET opportunities and the wastewater plants Horton opens up.</li>
    <li><b>Storm</b>: live National Weather Service alerts and the hubs that staff to them.</li>
    <li><b>Close</b>: every layer at once.</li>
  </ol>
  </div>
  <p class="sys-src" data-method>Estimates are marked <span class="sys-est">est.</span>; verify public and licensed data before use.</p>
  <p class="sys-src" data-src><b>Source:</b> Punctual Pros deed records (PA and NJ), CET opportunity radar, CET wastewater-plant targets, National Weather Service alerts (live). Maps: MapLibre GL, deck.gl, OpenFreeMap and OpenMapTiles, AWS Terrain Tiles.</p>
</aside>`;

async function play(ctx) {
  const { el, params, data, live, maps, fmt, esc, app } = ctx;
  if (!document.getElementById('css-theater')) { const l = document.createElement('link'); l.id = 'css-theater'; l.rel = 'stylesheet'; l.href = `modules/theater.css?v=20261123194657${V}`; document.head.appendChild(l); }
  // the view's page heading follows the portal pattern (set by retitle in app.html); it is visually hidden so the
  // engine's per-scene caption stays the visible title (the engine renders it as h2 when the page already has an h1)
  // the stage is a dark band (system.css §2): data-sys-theme="dark" resolves the system tokens to the dark set inside it,
  // so the film reads the same on the light and the dark portal while the rail, bar and inspector follow the page theme
  el.innerHTML = `<div class="page-head sys-sr"><h1 class="sys-h1">3D map</h1></div><div class="m-theater" data-sys-theme="dark" style="position:relative;height:100%;background:var(--sys-bg)">${ABOUT}</div>`;
  const host = el.querySelector('.m-theater');
  let Theater;
  try { ({ Theater } = await import(`../assets/theater.js?v=20261123194657${V}`)); }
  catch (e) { host.innerHTML = `<div style="padding:var(--sys-sp-6) var(--sys-gut)">${ctx.ui.note('The 3D map could not load. Check the connection and reload.', 'warn')}</div>`; console.warn('[theater]', e); return; }
  if (!host.isConnected) return;   // the visitor left while the engine loaded: do not mount into a screen that is gone
  const scene = params.scene || 'S1';
  const autoplay = params.autoplay != null ? params.autoplay !== '0' : true;
  Theater.mount(host, {
    autoplay, scene,
    forceFallback: params.fallback === '1',   // ?fallback=1 asks for the flat 2D map, as it did on the standalone page
    core: { Data: data, Live: live, Maps: maps, Fmt: fmt, esc },
    onScene: id => {
      // keep the deep link current without re-routing (replaceState does not fire hashchange)
      if (!host.isConnected) return;
      host.querySelector('.bt-cap')?.classList.remove('is-open');   // a caption opened on a phone closes when the scene changes
      const h = `#/theater/play?scene=${id}${autoplay ? '' : '&autoplay=0'}${params.fallback === '1' ? '&fallback=1' : ''}`;
      if (location.hash !== h) history.replaceState(null, '', h);
    },
  });
  // About panel: the toggle sits in the engine's scene list, as it did on the standalone page
  const about = host.querySelector('#th-about'); let aboutBtn = null;
  const setAbout = open => { about.hidden = !open; aboutBtn?.setAttribute('aria-expanded', String(open)); if (open) host.querySelector('#th-about-x').focus(); };
  host.querySelector('#th-about-x').onclick = () => { setAbout(false); aboutBtn?.focus(); };
  const onEsc = e => { if (e.key === 'Escape' && !about.hidden) { setAbout(false); aboutBtn?.focus(); } };
  document.addEventListener('keydown', onEsc);
  const addAbout = () => {
    const rail = host.querySelector('.bt-rail'); if (!rail || rail.querySelector('.th-about-btn')) return;
    aboutBtn = document.createElement('button'); aboutBtn.type = 'button'; aboutBtn.className = 'th-about-btn';
    aboutBtn.setAttribute('aria-controls', 'th-about'); aboutBtn.setAttribute('aria-expanded', 'false'); aboutBtn.setAttribute('aria-label', 'About this map');
    aboutBtn.innerHTML = '<span class="n">i</span><span class="t">About this map</span>'; aboutBtn.title = 'About this map';
    aboutBtn.onclick = () => setAbout(about.hidden); rail.appendChild(aboutBtn);
  };
  addAbout();
  // phones: the caption is two lines until tapped (CSS gives it pointer events only at phone width)
  host.addEventListener('click', e => { const c = e.target.closest('.bt-cap'); if (c) c.classList.toggle('is-open'); });
  // captions are rewritten by the engine on every scene tick; keep them in plain English
  let raf = 0;
  const mo = new MutationObserver(() => { addAbout(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; Copy.humanize(host); }); });
  mo.observe(host, { childList: true, subtree: true, characterData: true });
  app.index([
    { label: '3D map · Portfolio scene', sub: 'Portfolio companies, Punctual Pros core ZIP codes, CET county fit', href: '#/theater/play?scene=S1', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · Where the homes trade', sub: 'Every home sale in the Punctual Pros territory, extruded by count', href: '#/theater/play?scene=S2', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · Nationwide', sub: 'Punctual Pros expansion arcs by phase', href: '#/theater/play?scene=S3', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · New England grid', sub: 'CET opportunities and wastewater plants', href: '#/theater/play?scene=S4', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · Storm', sub: 'Live National Weather Service alerts over the Punctual Pros territory', href: '#/theater/play?scene=S5', kind: 'Scene', color: 'var(--co-fh)' },
  ]);
  // removing the map aborts its pending style and tile requests; the style is detached from the map first, so its
  // abort errors reach no listener and the map library prints them to the console. Listen on the style to keep it quiet.
  return () => { mo.disconnect(); document.removeEventListener('keydown', onEsc); try { Theater.map?.style?.on?.('error', () => { }); } catch { } try { Theater.destroy(); } catch { } };
}

export default {
  id: 'theater',
  name: '3D map',
  tag: '3D',
  color: 'var(--co-fh)',
  group: 'Command',
  tagline: 'Cinematic, GPU-rendered map scenes over the portfolio datasets: home sales, expansion arcs, CET infrastructure and live weather',
  views: [
    { id: 'play', name: '3D map', icon: '▶', flush: true, render: play },
  ],
  tour: [
    { order: 150, hash: '#/theater/play?scene=S2&autoplay=0', caption: '<b>3D map.</b> Every home sale in the Punctual Pros territory; the newest 90 days pulse.', narration: 'Every home sale in the Punctual Pros territory, in 3D. The last ninety days pulse.', duration: 10000 },
    { order: 151, hash: '#/theater/play?scene=S4&autoplay=0', caption: '<b>New England grid.</b> CET opportunities rise by value; discs mark wastewater plants Horton opens up.', narration: 'For CET, opportunities rise by estimated value, and the floating discs mark the wastewater plants Horton opens up.', duration: 10000 },
  ],
};
