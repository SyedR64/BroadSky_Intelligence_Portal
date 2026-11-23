import * as Copy from './copy.js?v=20261123143257';
/* Narrated tour: play it over the live screens, start from any chapter, read the script.
   The recorded films live on the home page (index.html#briefing); this screen links there. */
async function render(ctx) {
  const { el, ui, esc } = ctx;
  const Tour = window.BSP.Tour;
  const strip = h => String(h || '').replace(/<[^>]+>/g, '');
  const clip = (t, n = 110) => t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n)).replace(/[\s·,;:.]+$/, '') + '…';
  // length = the time the tour itself waits on each step (assets/core.js Tour._show), so it follows the steps
  const ms = Tour.steps.reduce((a, s) => a + (s.duration || Math.max(6000, (s.narration || s.caption).split(' ').length * 420)), 0);
  const mins = Math.max(1, Math.round(ms / 60000));
  el.innerHTML = ui.pageHead({ title: 'Narrated tour', sub: `${Tour.steps.length} steps over the live screens, about ${mins} minutes. It moves on by itself and reads each step aloud where the browser can.`, actions: `<button type="button" class="${ui.btnCls('primary', '', 'primary')}" id="b-play">▶ Play the narrated tour</button>` }) +
  `<div class="grid grid-main">
    ${ui.panel({ title: 'Chapters', sub: `${Tour.steps.length} steps · choose one to start there`, body: `<ol class="brief-ch" style="list-style:none;display:flex;flex-direction:column;gap:2px">${Tour.steps.map((s, i) => `<li><button type="button" class="${ui.btnCls('ghost', 'sm', 'ghost')}" style="width:100%;justify-content:flex-start;gap:var(--sys-sp-3);height:auto;min-height:36px;padding-block:var(--sys-sp-2);text-align:left;white-space:normal;font-weight:500;line-height:1.4" data-i="${i}"><span class="sys-num sys-muted" style="min-width:24px">${String(i + 1).padStart(2, '0')}</span><span>${esc(clip(strip(s.caption)))}</span></button></li>`).join('')}</ol>`, scroll: true })}
    <div>${ui.panel({ title: 'Recorded briefing', sub: 'The same story as a film and a video', body: `<p class="sys-card-body">Two recordings are on the home page, in the Briefing section. They show the portal as it was when they were made.</p><p class="mt-12"><a class="${ui.btnCls('secondary', 'sm')}" href="./#briefing">Open the Briefing section</a></p>` })}</div>
  </div>
  ${ui.panel({ title: 'Narration', cls: 'mt-12', body: `<div class="sys-prose">${Tour.steps.map((s, i) => `<p><b class="sys-num">${String(i + 1).padStart(2, '0')}</b> ${esc(s.narration || strip(s.caption))}</p>`).join('')}</div>`, foot: ui.source('The narrated tour, one chapter per screen', null, null) })}`;
  el.querySelector('#b-play').onclick = () => Tour.start(0);
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => Tour.start(Number(b.dataset.i)));
}
export default { id: 'briefing', name: 'Briefing & video', color: 'var(--c-bsp)', group: 'Briefing', views: [{ id: 'play', name: 'Narrated tour', icon: '▶', render }],
  tour: [
    { order: 1100, hash: '#/briefing/play', caption: '<b>Monday priorities.</b> CET: win near-term bids, cross-sell Horton · Punctual Pros: capture new movers, staff to weather.', narration: 'To recap: CET wins near-term bids and cross-sells Horton; Punctual Pros captures movers and staffs to weather.', duration: 8500 },
    { order: 1110, hash: '#/briefing/play', caption: '<b>Across the portfolio.</b> Frontline and Thomas sell into ranked accounts; BPI and Fair Harbor chase sourced growth.', narration: 'Frontline and Thomas sell into ranked account lists; BPI and Fair Harbor pursue growth plays.', duration: 6500 },
    { order: 1120, hash: '#/briefing/play', caption: '<b>Public and licensed data · verify before use.</b> Replay any chapter from this screen.', narration: 'Everything here is public or licensed research. Verify before use.', duration: 7000 },
  ],
};
