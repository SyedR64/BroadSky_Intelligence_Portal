import * as Copy from './copy.js?v=20261009175029';
/* 3D map — cinematic GPU map scenes over the portal's datasets (engine: assets/theater.js) */
const V = new URL(import.meta.url).search; // reuse the registry's ?v= stamp for cache-busting the engine

async function play(ctx) {
  const { el, params, data, live, maps, fmt, esc, app } = ctx;
  if (!document.getElementById('css-theater')) { const l = document.createElement('link'); l.id = 'css-theater'; l.rel = 'stylesheet'; l.href = `modules/theater.css?v=20261009175029${V}`; document.head.appendChild(l); }
  // the view's page heading follows the portal pattern (set by retitle in app.html); it is visually hidden so the
  // engine's per-scene caption stays the visible title (the engine renders it as h2 when the page already has an h1)
  // the stage is a dark band (system.css §2): data-sys-theme="dark" resolves the system tokens to the dark set inside it,
  // so the film reads the same on the light and the dark portal while the rail, bar and inspector follow the page theme
  el.innerHTML = `<div class="page-head sys-sr"><h1 class="sys-h1">3D map · cinematic map scenes</h1></div><div class="m-theater" data-sys-theme="dark" style="position:relative;height:100%;min-height:480px;background:var(--sys-bg)"></div>`;
  const host = el.querySelector('.m-theater');
  let Theater;
  try { ({ Theater } = await import(`../assets/theater.js?v=20261009175029${V}`)); }
  catch (e) { host.innerHTML = `<div style="padding:var(--sys-sp-6) var(--sys-gut)">${ctx.ui.note('The 3D map engine could not load. Check the connection and reload; the same scenes play on the standalone theater page.', 'warn')}</div>`; console.warn('[theater]', e); return; }
  if (!el.isConnected) return;
  const scene = params.scene || 'S1';
  const autoplay = params.autoplay != null ? params.autoplay !== '0' : true;
  Theater.mount(host, {
    autoplay, scene,
    core: { Data: data, Live: live, Maps: maps, Fmt: fmt, esc },
    onScene: id => {
      // keep the deep link current without re-routing (replaceState does not fire hashchange)
      if (!host.isConnected) return;
      const h = `#/theater/play?scene=${id}${autoplay ? '' : '&autoplay=0'}`;
      if (location.hash !== h) history.replaceState(null, '', h);
    },
  });
  // captions are rewritten by the engine on every scene tick; keep them in plain English
  let raf = 0;
  const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; Copy.humanize(host); }); });
  mo.observe(host, { childList: true, subtree: true, characterData: true });
  app.index([
    { label: '3D map · Portfolio scene', sub: 'Portfolio companies, Punctual Pros core ZIP codes, CET county fit', href: '#/theater/play?scene=S1', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · Where the homes trade', sub: 'Every home sale in the Punctual Pros territory, extruded by count', href: '#/theater/play?scene=S2', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · Nationwide', sub: 'Punctual Pros expansion arcs by phase', href: '#/theater/play?scene=S3', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · New England grid', sub: 'CET opportunities and wastewater plants', href: '#/theater/play?scene=S4', kind: 'Scene', color: 'var(--co-fh)' },
    { label: '3D map · Storm', sub: 'Live National Weather Service alerts over the Punctual Pros territory', href: '#/theater/play?scene=S5', kind: 'Scene', color: 'var(--co-fh)' },
  ]);
  return () => { mo.disconnect(); try { Theater.destroy(); } catch { } };
}

export default {
  id: 'theater',
  name: '3D map',
  tag: '3D',
  color: 'var(--co-fh)',
  group: 'Command',
  tagline: 'Cinematic, GPU-rendered map scenes over the portfolio datasets: home sales, expansion arcs, CET infrastructure and live weather',
  views: [
    { id: 'play', name: 'Theater', icon: '▶', flush: true, render: play },
  ],
  tour: [
    { order: 150, hash: '#/theater/play?scene=S2&autoplay=0', caption: '<b>3D map.</b> Every home sale in the Punctual Pros territory; the newest 90 days pulse.', narration: 'Every home sale in the Punctual Pros territory, in 3D. The last ninety days pulse.', duration: 10000 },
    { order: 151, hash: '#/theater/play?scene=S4&autoplay=0', caption: '<b>New England grid.</b> CET opportunities rise by value; discs mark wastewater plants Horton opens up. ← → changes scenes.', narration: 'For CET, opportunities rise by estimated value, and the floating discs mark the wastewater plants Horton opens up.', duration: 10000 },
  ],
};
