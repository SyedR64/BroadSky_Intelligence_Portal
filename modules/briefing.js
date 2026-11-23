import * as Copy from './copy.js?v=20261123143257';
/* Narrated tour: the two recorded films and the memo first, then the tour over the live screens (start from any
   chapter) and its script. The films, the memo and briefing/tour_steps.json are read as they are, never changed. */
const RECORDINGS = [
  { id: 'film', label: 'Cinematic film · 2:13', src: 'briefing/broad_sky_intro.mp4', poster: 'briefing/intro_poster.jpg' },
  { id: 'video', label: 'Video briefing · 5:03', src: 'briefing/broad_sky_briefing.mp4', poster: 'briefing/poster.jpg' },
];
const MEMO = 'briefing/BSP_Desk_Memo.pdf';
async function render(ctx) {
  const { el, ui, esc } = ctx;
  const Tour = window.BSP.Tour;
  const strip = h => String(h || '').replace(/<[^>]+>/g, '');
  const clip = (t, n = 110) => t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n)).replace(/[\s·,;:.]+$/, '') + '…';
  // length = the time the tour itself waits on each step (assets/core.js Tour._show), so it follows the steps
  const ms = Tour.steps.reduce((a, s) => a + (s.duration || Math.max(6000, (s.narration || s.caption).split(' ').length * 420)), 0);
  const mins = Math.max(1, Math.round(ms / 60000));
  const first = RECORDINGS[0];
  const picker = RECORDINGS.map((r, i) => `<button type="button" class="sys-chip" data-rec="${esc(r.id)}" aria-pressed="${i === 0}">${esc(r.label)}</button>`).join('');
  el.innerHTML = ui.pageHead({ title: 'Narrated tour', sub: `${Tour.steps.length} steps · about ${mins} minutes · two recordings`, actions: `<button type="button" class="${ui.btnCls('primary', '', 'primary')}" id="b-play">▶ Play the narrated tour</button>` }) +
  ui.panel({ title: 'Recordings', sub: 'Recorded Oct 6, 2026', id: 'b-recordings',
    actions: `<a class="${ui.btnCls('secondary', 'sm')}" href="${MEMO}">Executive memo (PDF)</a>`,
    body: `<div class="sys-chips" role="group" aria-label="Choose a recording">${picker}</div>
      <video id="b-video" class="mt-12" controls playsinline preload="none" poster="${esc(first.poster)}" aria-label="${esc(first.label)}" style="display:block;width:min(100%,calc(52vh * 16 / 9));height:auto;aspect-ratio:16/9;background:var(--sys-stage);border-radius:var(--sys-r-sm)">
        <source src="${esc(first.src)}" type="video/mp4">
        <a href="${esc(first.src)}">${esc(first.label)}</a>
      </video>` }) +
  `<div class="grid grid-main mt-12">
    ${ui.panel({ title: 'Chapters', body: `<ol class="brief-ch" style="list-style:none;display:flex;flex-direction:column;gap:2px">${Tour.steps.map((s, i) => `<li><button type="button" class="${ui.btnCls('ghost', 'sm', 'ghost')}" style="width:100%;justify-content:flex-start;gap:var(--sys-sp-3);height:auto;min-height:36px;padding-block:var(--sys-sp-2);text-align:left;white-space:normal;font-weight:500;line-height:1.4" data-i="${i}"><span class="sys-num sys-muted" style="min-width:24px">${String(i + 1).padStart(2, '0')}</span><span>${esc(clip(strip(s.caption)))}</span></button></li>`).join('')}</ol>`, scroll: true })}
    ${ui.panel({ title: 'Narration', body: `<div class="sys-prose">${Tour.steps.map((s, i) => `<p><b class="sys-num">${String(i + 1).padStart(2, '0')}</b> ${esc(s.narration || strip(s.caption))}</p>`).join('')}</div>`, scroll: true })}
  </div>`;
  el.querySelector('#b-play').onclick = () => { el.querySelector('#b-video')?.pause(); Tour.start(0); };
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { el.querySelector('#b-video')?.pause(); Tour.start(Number(b.dataset.i)); });
  // one player, two recordings: a chip swaps the source and keeps playing if it was playing
  const v = el.querySelector('#b-video'), chips = [...el.querySelectorAll('[data-rec]')];
  chips.forEach(b => b.addEventListener('click', () => {
    if (b.getAttribute('aria-pressed') === 'true') return;
    const r = RECORDINGS.find(x => x.id === b.dataset.rec), playing = !v.paused;
    chips.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    v.pause(); v.poster = r.poster; v.setAttribute('aria-label', r.label);
    v.querySelector('source').src = r.src; v.load();
    if (playing) v.play().catch(() => {});
  }));
  return () => { try { v.pause(); } catch { /* the player is gone */ } };
}
export default { id: 'briefing', name: 'Briefing & video', color: 'var(--c-bsp)', group: 'Briefing', views: [{ id: 'play', name: 'Narrated tour', icon: '▶', render }],
  tour: [
    { order: 1100, hash: '#/briefing/play', caption: '<b>Monday priorities.</b> CET: win near-term bids, cross-sell Horton · Punctual Pros: capture new movers, staff to weather.', narration: 'To recap: CET wins near-term bids and cross-sells Horton; Punctual Pros captures movers and staffs to weather.', duration: 8500 },
    { order: 1110, hash: '#/briefing/play', caption: '<b>Across the portfolio.</b> Frontline and Thomas sell into ranked accounts; BPI and Fair Harbor chase sourced growth.', narration: 'Frontline and Thomas sell into ranked account lists; BPI and Fair Harbor pursue growth plays.', duration: 6500 },
    { order: 1120, hash: '#/briefing/play', caption: '<b>Public and licensed data · verify before use.</b> Replay any chapter from this screen.', narration: 'Everything here is public or licensed research. Verify before use.', duration: 7000 },
  ],
};
