/* 3D theater — cinematic GPU map scenes over the portal's datasets (engine: assets/theater.js) */
const V = new URL(import.meta.url).search; // reuse the registry's ?v= stamp for cache-busting the engine

async function play(ctx) {
  const { el, params, data, live, maps, fmt, esc, app } = ctx;
  if (!document.getElementById('css-theater')) { const l = document.createElement('link'); l.id = 'css-theater'; l.rel = 'stylesheet'; l.href = `modules/theater.css?v=20261006085442${V}`; document.head.appendChild(l); }
  el.innerHTML = `<div class="m-theater" style="position:relative;height:100%;min-height:480px;background:#05070b"></div>`;
  const host = el.firstElementChild;
  let Theater;
  try { ({ Theater } = await import(`../assets/theater.js?v=20261006085442${V}`)); }
  catch (e) { host.innerHTML = ctx.ui.note(`The 3D theater engine failed to load: <span class="mono">${esc(e.message)}</span>`, 'warn'); return; }
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
  app.index([
    { label: '3D theater · Portfolio scene', sub: 'Platforms, PP core zips, CET county fit', href: '#/theater/play?scene=S1', kind: 'Scene', color: 'var(--cyan)' },
    { label: '3D theater · Where the homes trade', sub: 'Every PP-territory home sale, extruded by count', href: '#/theater/play?scene=S2', kind: 'Scene', color: 'var(--cyan)' },
    { label: '3D theater · Nationwide', sub: 'Punctual Pros expansion arcs by phase', href: '#/theater/play?scene=S3', kind: 'Scene', color: 'var(--cyan)' },
    { label: '3D theater · New England grid', sub: 'CET opportunities and wastewater plants', href: '#/theater/play?scene=S4', kind: 'Scene', color: 'var(--cyan)' },
    { label: '3D theater · Storm', sub: 'Live NWS alerts over the PP territory', href: '#/theater/play?scene=S5', kind: 'Scene', color: 'var(--cyan)' },
  ]);
  return () => { try { Theater.destroy(); } catch { } };
}

export default {
  id: 'theater',
  name: '3D theater',
  tag: 'WebGL',
  color: 'var(--cyan)',
  group: 'Command',
  tagline: 'Cinematic, GPU-rendered map scenes over the portfolio datasets: home sales, expansion arcs, CET infrastructure and live weather',
  views: [
    { id: 'play', name: 'Theater', icon: '▶', flush: true, render: play },
  ],
  tour: [
    { order: 150, hash: '#/theater/play?scene=S2&autoplay=0', caption: '<b>3D theater.</b> Every home sale in the Punctual Pros territory, extruded by count and coloured by median price. The newest 90 days pulse: new owners who will need service.', narration: 'The 3D theater renders the data on the GPU. Here, every home sale in the Punctual Pros territory, with the last ninety days pulsing.', duration: 10000 },
    { order: 151, hash: '#/theater/play?scene=S4&autoplay=0', caption: '<b>New England grid.</b> CET opportunities rise by estimated value; floating discs mark the wastewater plants Horton makes prime-able. Use ← → to change scenes.', narration: 'For CET, opportunities rise by estimated value, and the floating discs mark the wastewater plants Horton opens up.', duration: 10000 },
  ],
};
