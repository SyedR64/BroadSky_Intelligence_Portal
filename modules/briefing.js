/* Briefing — narrated tour + rendered video + script */
async function render(ctx) {
  const { el, ui, esc } = ctx;
  const Tour = window.BSP.Tour;
  let manifest = null; try { const r = await fetch('briefing/manifest.json', { cache: 'no-store' }); if (r.ok) manifest = await r.json(); } catch { }
  el.innerHTML = ui.pageHead({ title: 'Executive briefing', sub: 'A four-minute narrated walkthrough of the portal: what each platform should do next and why. Play it in-app (live data, spoken narration) or watch the rendered video.', actions: `<button class="btn brand" id="b-play">▶ Play in-app briefing</button>${manifest?.video ? `<a class="btn" href="briefing/${esc(manifest.video)}" download>⇩ Download MP4</a>` : ''}` }) +
  `<div class="grid grid-main">
    ${ui.panel({ title: 'Rendered video', sub: manifest ? `${esc(manifest.duration_label || '')} · rendered ${esc(manifest.rendered || '')}` : 'Video not rendered yet', body: manifest?.video ? `<video controls playsinline style="width:100%;border-radius:8px;background:#000" poster="briefing/${esc(manifest.poster || '')}"><source src="briefing/${esc(manifest.video)}" type="video/mp4"></video>` : ui.note('Run <code>python3 scripts/make_briefing.py</code> to render the MP4 from the tour script.', 'warn'), flush: false })}
    ${ui.panel({ title: 'Chapters', sub: `${Tour.steps.length} steps · click to jump`, body: `<div class="col gap-4">${Tour.steps.map((s, i) => `<button class="btn ghost" style="justify-content:flex-start;text-align:left;white-space:normal" data-i="${i}"><span class="num dim" style="min-width:26px">${String(i + 1).padStart(2, '0')}</span><span>${s.caption.replace(/<[^>]+>/g, '').slice(0, 110)}</span></button>`).join('')}</div>`, scroll: true })}
  </div>
  ${ui.panel({ title: 'Narration script', cls: 'mt-12', body: `<div class="prose">${Tour.steps.map((s, i) => `<p><b class="num">${String(i + 1).padStart(2, '0')}</b> ${esc(s.narration || s.caption.replace(/<[^>]+>/g, ''))}</p>`).join('')}</div>` })}`;
  el.querySelector('#b-play').onclick = () => Tour.start(0);
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => Tour.start(Number(b.dataset.i)));
}
export default { id: 'briefing', name: 'Briefing & video', tag: '4 min', color: 'var(--c-bsp)', group: 'Briefing', views: [{ id: 'play', name: 'Briefing', icon: '▶', render }],
  tour: [
    { order: 1100, hash: '#/briefing/play', caption: '<b>Monday priorities.</b> CET: win bids due ≤60 days and cross-sell Horton accounts · Punctual Pros: new-mover capture and weather staffing.', narration: 'To recap: CET wins near-term bids and cross-sells Horton accounts; Punctual Pros captures new movers and staffs to the weather.', duration: 8500 },
    { order: 1110, hash: '#/briefing/play', caption: '<b>Across the portfolio.</b> Frontline and Thomas sell into ranked account lists · BPI and Fair Harbor pursue sourced growth plays and margin repair · M&A works the top-ten lists.', narration: 'Frontline and Thomas sell into ranked account lists; BPI and Fair Harbor pursue growth plays.', duration: 6500 },
    { order: 1120, hash: '#/briefing/play', caption: '<b>Public + licensed data · verify before use.</b> Replay this briefing any time from ▶ in the top bar.', narration: 'Everything here is public or licensed research. Verify before use, and replay this briefing any time.', duration: 7000 },
  ],
};
