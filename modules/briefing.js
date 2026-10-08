import * as Copy from './copy.js?v=20261008185332';
/* Briefing — narrated tour + rendered video + script */
async function render(ctx) {
  const { el, ui, esc, fmt } = ctx;
  const Tour = window.BSP.Tour;
  let manifest = null; try { const r = await fetch('briefing/manifest.json', { cache: 'no-store' }); if (r.ok) manifest = await r.json(); } catch { }
  const strip = h => String(h || '').replace(/<[^>]+>/g, '');
  const clip = (t, n = 110) => t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n)).replace(/[\s·,;:.]+$/, '') + '…';
  const dur = manifest?.duration_seconds ? `${Math.floor(manifest.duration_seconds / 60)} min ${Math.round(manifest.duration_seconds % 60)} s` : '5 min 4 s';
  el.innerHTML = ui.pageHead({ title: 'Narrated tour', sub: 'The narrated tour (6 min 42 s) runs over the live views. The video briefing is a shorter recorded cut.', actions: `<button type="button" class="${ui.btnCls('primary', '', 'primary')}" id="b-play">▶ Play the narrated tour</button>${manifest?.video ? `<a class="${ui.btnCls('secondary', '')}" href="briefing/${esc(manifest.video)}" download>Download MP4</a>` : ''}` }) +
  `<div class="grid grid-main">
    ${ui.panel({ title: 'Video briefing', sub: manifest ? `${dur} · ${esc(String(manifest.steps || Tour.steps.length))} chapters${manifest.rendered ? ` · recorded ${esc(fmt.date(String(manifest.rendered).slice(0, 10)))}` : ''}` : 'Video coming soon', body: manifest?.video ? `<video controls playsinline preload="metadata" style="display:block;width:100%;aspect-ratio:16/9;border-radius:var(--sys-r-sm);background:var(--sys-bg-3)" poster="briefing/${esc(manifest.poster || '')}"><source src="briefing/${esc(manifest.video)}" type="video/mp4"></video>` : ui.note('The video is not available yet. Play the briefing instead: it runs the same chapters over live data.', 'warn'), foot: ui.source('Narrated tour of this portal, recorded from the live views', null, manifest?.rendered ? fmt.date(String(manifest.rendered).slice(0, 10)) : null) })}
    ${ui.panel({ title: 'Chapters', sub: `${Tour.steps.length} steps · choose one to start there`, body: `<ol class="brief-ch" style="list-style:none;display:flex;flex-direction:column;gap:2px">${Tour.steps.map((s, i) => `<li><button type="button" class="${ui.btnCls('ghost', 'sm', 'ghost')}" style="width:100%;justify-content:flex-start;gap:var(--sys-sp-3);height:auto;min-height:36px;padding-block:var(--sys-sp-2);text-align:left;white-space:normal;font-weight:500;line-height:1.4" data-i="${i}"><span class="sys-num sys-muted" style="min-width:24px">${String(i + 1).padStart(2, '0')}</span><span>${esc(clip(strip(s.caption)))}</span></button></li>`).join('')}</ol>`, scroll: true })}
  </div>
  ${ui.panel({ title: 'Narration', cls: 'mt-12', body: `<div class="sys-prose">${Tour.steps.map((s, i) => `<p><b class="sys-num">${String(i + 1).padStart(2, '0')}</b> ${esc(s.narration || strip(s.caption))}</p>`).join('')}</div>`, foot: ui.source('The narrated tour, one chapter per view', null, null) })}`;
  el.querySelector('#b-play').onclick = () => Tour.start(0);
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => Tour.start(Number(b.dataset.i)));
}
export default { id: 'briefing', name: 'Briefing & video', tag: '6:42', color: 'var(--c-bsp)', group: 'Briefing', views: [{ id: 'play', name: 'Briefing', icon: '▶', render }],
  tour: [
    { order: 1100, hash: '#/briefing/play', caption: '<b>Monday priorities.</b> CET: win near-term bids, cross-sell Horton · Punctual Pros: capture new movers, staff to weather.', narration: 'To recap: CET wins near-term bids and cross-sells Horton; Punctual Pros captures movers and staffs to weather.', duration: 8500 },
    { order: 1110, hash: '#/briefing/play', caption: '<b>Across the portfolio.</b> Frontline and Thomas sell into ranked accounts; BPI and Fair Harbor chase sourced growth.', narration: 'Frontline and Thomas sell into ranked account lists; BPI and Fair Harbor pursue growth plays.', duration: 6500 },
    { order: 1120, hash: '#/briefing/play', caption: '<b>Public and licensed data · verify before use.</b> Replay from ▶ in the top bar.', narration: 'Everything here is public or licensed research. Verify before use.', duration: 7000 },
  ],
};
