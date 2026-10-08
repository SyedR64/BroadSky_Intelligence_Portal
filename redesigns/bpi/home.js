/* BPI concept homepage behaviour. */
import { Data } from '../../assets/core.js?v=20261008192515';
import { chrome, mountChat, faqHTML, OFFICES, timeIn, isOpen } from './site.js?v=20261008192515';
import { mountMonitor, mountPulse } from './monitor.js?v=20261008192515';

const monthYear = d => { const t = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); if (isNaN(t)) return String(d); const m = t.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }); return `${m === 'Sep' ? 'Sept' : m} ${t.getUTCFullYear()}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
chrome();

// hero pulse + monitor
const pulse = document.getElementById('pulse'); if (pulse) mountPulse(pulse);
const mon = document.getElementById('monitor-app'); if (mon) mountMonitor(mon, { initial: 'ai-jobs' });

// clocks ticker
const clocks = document.getElementById('clocks');
const drawClocks = () => { if (!clocks) return; const items = OFFICES.map(o => `<span><i></i>${esc(o.c)} <b>${timeIn(o.tz)}</b></span>`).join(''); clocks.innerHTML = items + items; };

// offices list + arc map
const olist = document.getElementById('olist');
const drawOffices = () => {
  if (!olist) return; let g = '';
  olist.innerHTML = OFFICES.map(o => { const head = o.g !== g ? `<div class="grp">${esc(o.g)}</div>` : ''; g = o.g; const open = isOpen(o.tz); return `${head}<div class="office"><b>${esc(o.c)}${o.hq ? ' <span class="bpi-tag bpi-tag--co">HQ</span>' : ''}</b><span class="tm${open ? ' open' : ''}" title="${open ? 'Office hours' : 'Outside office hours'}">${timeIn(o.tz)}</span><small>${esc(o.note)}</small></div>`; }).join('');
};
function drawMap() {
  const svg = document.getElementById('arcmap'); if (!svg) return;
  const W = 1000, H = 560, lon0 = -127, lon1 = 25, lat0 = 62, lat1 = 31;
  const P = (lat, lon) => [((lon - lon0) / (lon1 - lon0)) * W, ((lat0 - lat) / (lat0 - lat1)) * H];
  let g = '';
  for (let lon = -120; lon <= 20; lon += 20) { const [x] = P(0, lon); g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" class="grid-l"/>`; }
  for (let lat = 35; lat <= 60; lat += 5) { const [, y] = P(lat, 0); g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" class="grid-l"/>`; }
  // dotted field to suggest land masses (abstract, not geographic data)
  const hq = OFFICES[0], [hx, hy] = P(hq.lat, hq.lon);
  let arcs = '', dots = '', labs = '';
  OFFICES.filter(o => !o.alliance).forEach((o, i) => {
    const [x, y] = P(o.lat, o.lon);
    if (!o.hq) { const mx = (hx + x) / 2, my = Math.max(14, Math.min(hy, y) - Math.abs(x - hx) * 0.2 - 16); arcs += `<path d="M${hx.toFixed(1)} ${hy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="url(#ag)" stroke-width="1.6" stroke-dasharray="4 5"><animate attributeName="stroke-dashoffset" from="90" to="0" dur="${3 + i * 0.3}s" repeatCount="indefinite"/></path>`; }
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${o.hq ? 8 : 5}" class="${o.hq ? 'hq' : 'pt'}"/>${o.hq ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" class="ring" stroke-opacity=".5"><animate attributeName="r" from="8" to="26" dur="2.4s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" from=".7" to="0" dur="2.4s" repeatCount="indefinite"/></circle>` : ''}`;
    const eu = o.g === 'Europe'; const off = { 'Washington, DC': [10, 22], 'New York': [10, -6], Boston: [10, -14], Chicago: [-10, -12, 'end'], 'San Francisco': [12, -10], 'Los Angeles': [12, 18], London: [-12, 4, 'end'], Brussels: [-10, 22, 'end'], Berlin: [10, 4], Oslo: [10, -6], 'Zurich / Geneva': [-6, 26, 'end'] }[o.c] || [10, 4];
    labs += `<text class="lab${eu ? ' eu' : ''}" x="${(x + off[0]).toFixed(1)}" y="${(y + off[1]).toFixed(1)}" text-anchor="${off[2] || 'start'}">${esc(o.c.replace(' / Geneva', ''))}</text>`;
  });
  const [ax, ay] = P(42, -40);
  svg.innerHTML = `<defs><linearGradient id="ag" x1="0" x2="1"><stop offset="0" class="arc-a"/><stop offset="1" class="arc-b"/></linearGradient></defs>${g}<text x="${ax}" y="${ay}" class="ocean" font-size="54" font-weight="800" font-family="Inter,sans-serif" letter-spacing="-2" text-anchor="middle">ATLANTIC</text>${arcs}${dots}${labs}<text x="${W - 8}" y="${H - 10}" class="foot-t" font-size="11" font-family="JetBrains Mono,monospace" text-anchor="end">+ Sydney (alliance) →</text>`;
}
drawClocks(); drawOffices(); drawMap();
setInterval(() => { drawClocks(); drawOffices(); }, 30000);

// jobs (illustrative)
const JOBS = [
  ['Senior Associate, Public Affairs', 'Washington, DC', 'Public affairs'],
  ['Director, Research & Insights', 'London', 'Research · Message House'],
  ['Data Engineer, SignalOS', 'New York', 'Intelligence'],
  ['Account Director, Corporate Affairs', 'Berlin', 'Reputation'],
  ['Paid Media Strategist', 'Chicago', 'Digital & paid media'],
];
const jobs = document.getElementById('jobs');
if (jobs) jobs.innerHTML = JOBS.map(([t, c, p]) => `<a class="job" href="#contact"><b>${esc(t)}</b><span>${esc(p)}</span><span>${esc(c)} · Hybrid</span><span class="go" aria-hidden="true">→</span></a>`).join('') + '<p class="sys-src">Illustrative openings for the concept<span class="sys-est sys-est--illus">illustrative</span>; the live site would sync from the applicant-tracking system.</p>';

// faq
const fl = document.getElementById('faq-list'); if (fl) fl.innerHTML = faqHTML();

// stats from the portfolio research (graceful fallback to the static values in the HTML)
Data.load('research/bsp_firm').then(d => {
  const b = d?.items?.find(i => i.id === 'bsp-bpi'); if (!b) return;
  const founded = b.key_metrics?.founded; if (founded) document.querySelector('[data-stat="years"]').textContent = new Date().getFullYear() - founded;
  if (Array.isArray(b.add_ons)) document.querySelector('[data-stat="addons"]').textContent = b.add_ons.length;
  const src = document.getElementById('band-src'); if (src && b.retrieved) src.innerHTML = `<b>Source:</b> BPI press releases and SEC and state filings, compiled in the BSP firm profile (${b.add_ons?.length || 6} add-ons from BOLDT to 365 Sherpas) and BPI public filings, ${esc(monthYear(b.retrieved))}.`;
}).catch(() => { });

// contact (concept: no network)
const form = document.getElementById('cform');
form?.addEventListener('submit', e => { e.preventDefault(); const em = form.email; form.name.removeAttribute('aria-invalid'); em.removeAttribute('aria-invalid'); if (!form.name.value.trim() || !em.value.includes('@')) { const bad = form.name.value.trim() ? em : form.name; bad.setAttribute('aria-invalid', 'true'); bad.focus(); return; } form.classList.add('sent'); form.querySelector('button[type=submit]').disabled = true; });

mountChat();
