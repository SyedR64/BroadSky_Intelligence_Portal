/* BPI concept: shared behaviour for index.html and signalos.html (reveal, office clocks, chat).
   The frame (top bar, concept banner, breadcrumb, footer) comes from assets/frame.js. */
import { Chat } from '../../assets/chat.js?v=20261009181341';
import { Frame } from '../../assets/frame.js?v=20261009181341';

/** Plain-English copy from dataset strings: dataset file paths become their human names,
    internal record ids (bpi-022, ra-bpi, lever-03 …) are dropped. */
export const PLAIN_RX = /\b(?:bpi|rival|kb|ra|ve|vs|lever|tpl|gl|agent|fin|fh|pp|cet|ts|fl|ref|ph|tp|bsp)-(?:[a-z]+-)*(?:[a-z0-9]*\d[a-z0-9]*\b|\*)(?:,?\.\.\d+)?|\bra-(?:bpi|fh|pp|cet|fl|ts)\b|\s?\bmeta\.[a-z_]+/g;
export function plain(str) {
  let t = String(str ?? '');
  t = t.replace(/(?:data\/(?:research\/|sales\/)?)?([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\.(?:json|csv|geojson)/g, (m, id) => id === 'serviceos_evidence' ? 'OS program evidence' : Frame.label(id));
  t = t.replace(PLAIN_RX, '');
  t = t.replace(/\(\s*[;,·]\s*/g, '(').replace(/\s*[;,·]\s*\)/g, ')').replace(/\(\s*[,;·\s]*\)/g, '').replace(/\s+([,.;)])/g, '$1').replace(/ {2,}/g, ' ');
  return Frame.humanizeText(t).replace(/ServiceOS evidence/g, 'OS program evidence').replace(/\s*\(\s*[,;·\s]*\)/g, '').trim();
}

export const OFFICES = [
  { c: 'Washington, DC', tz: 'America/New_York', g: 'Americas', note: 'Headquarters · 1445 New York Ave NW', lat: 38.9, lon: -77.03, hq: 1 },
  { c: 'New York', tz: 'America/New_York', g: 'Americas', note: 'Corporate affairs, campaigns, paid media', lat: 40.71, lon: -74.0 },
  { c: 'Chicago', tz: 'America/Chicago', g: 'Americas', note: 'Campaigns and digital', lat: 41.88, lon: -87.63 },
  { c: 'San Francisco', tz: 'America/Los_Angeles', g: 'Americas', note: 'Technology and AI policy clients', lat: 37.77, lon: -122.42 },
  { c: 'Los Angeles', tz: 'America/Los_Angeles', g: 'Americas', note: 'Culture-first impact and entertainment', lat: 34.05, lon: -118.24 },
  { c: 'Boston', tz: 'America/New_York', g: 'Americas', note: 'Northeast corporate affairs, life sciences (Aug 2026)', lat: 42.36, lon: -71.06 },
  { c: 'London', tz: 'Europe/London', g: 'Europe', note: 'Second-largest hub · Seven Hills, Message House', lat: 51.51, lon: -0.13 },
  { c: 'Brussels', tz: 'Europe/Brussels', g: 'Europe', note: 'EU public affairs', lat: 50.85, lon: 4.35 },
  { c: 'Berlin', tz: 'Europe/Berlin', g: 'Europe', note: 'Third-largest market · 365 Sherpas BPI', lat: 52.52, lon: 13.4 },
  { c: 'Oslo', tz: 'Europe/Oslo', g: 'Europe', note: 'Nordic public affairs (via BOLDT)', lat: 59.91, lon: 10.75 },
  { c: 'Zurich / Geneva', tz: 'Europe/Zurich', g: 'Europe', note: 'Swiss and international organizations', lat: 47.37, lon: 8.54 },
  { c: 'Sydney', tz: 'Australia/Sydney', g: 'Alliance', note: 'Mandala Partners strategic alliance (Nov 2025)', lat: -33.87, lon: 151.21, alliance: 1 },
];
export const timeIn = tz => { try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date()); } catch { return '--:--'; } };
export const isOpen = tz => { try { const p = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, weekday: 'short', timeZone: tz }).formatToParts(new Date()); const h = +p.find(x => x.type === 'hour').value, d = p.find(x => x.type === 'weekday').value; return !['Sat', 'Sun'].includes(d) && h >= 8 && h < 19; } catch { return false; } };

export const FAQ = [
  { q: 'What does BPI do?', a: '<p>A strategic communications and public affairs firm. Six practices work as one team: <b>public affairs, corporate reputation, campaigns, research, digital and paid media, and AI communications</b>.</p>', href: 'index.html#services' },
  { q: 'Which offices do you have?', a: '<p>Washington, DC (headquarters), New York, Chicago, San Francisco, Los Angeles and Boston in the US; London, Brussels, Berlin, Oslo and Zurich/Geneva in Europe; and Asia-Pacific coverage through the Mandala Partners alliance in Australia.</p>', href: 'index.html#offices' },
  { q: 'What is SignalOS?', a: '<p><b>SignalOS</b> is the proposed intelligence layer under every BPI retainer: always-on narrative monitoring, synthetic-audience message testing validated with live panels, a compliance-gated content studio and outcome dashboards. It turns monitoring and measurement into a subscription rather than a line item.</p>', href: 'signalos.html' },
  { q: 'How do retainers and pricing work?', a: '<p>Most work runs on monthly retainers; campaigns and research are scoped as projects. The concept adds three tiers (Monitor, Advise, Command) with illustrative prices.</p>', href: 'signalos.html#tiers' },
  { q: 'How fast can you respond in a crisis?', a: '<p>Under the proposed SignalOS retainers, alerts arrive with a draft holding statement. The response target is 2 hours on Monitor and 30 minutes on Advise and Command.</p>', href: 'signalos.html#demo' },
  { q: 'Can you test our message before we launch it?', a: '<p>Yes. Message House, the elite-audience research group BPI acquired in Nov 2024, tests messages with policymakers, investors and other hard-to-reach audiences across EMEA. SignalOS adds synthetic pre-tests that narrow options in hours before live fieldwork confirms the finalists.</p>', href: 'signalos.html#demo' },
  { q: 'Do you work in Brussels and Berlin?', a: '<p>Yes. BOLDT (December 2023) and 365 Sherpas (May 2026) made Germany BPI’s third-largest market. One retainer can cover Washington, Brussels and Berlin.</p>', href: 'index.html#offices' },
  { q: 'What is AI communications?', a: '<p>AI policy positioning, deepfake and misinformation response, and AI-assisted content with review checkpoints. In BPI’s 2026 survey, <b>81%</b> of adults said AI spreads false rumours too easily.</p>', href: 'index.html#monitor' },
  { q: 'Do you work with sports organizations?', a: '<p>Yes. BPI formalized a sports offering in Oct 2024 and scaled it with the May 2025 acquisition of Agado Communications, whose founder Mark Jones leads BPI’s sports strategy and growth.</p>', href: 'index.html#services' },
  { q: 'Do you handle litigation and regulatory risk?', a: '<p>Yes. In Mar 2026 BPI launched a litigation communications, oversight and regulatory-risk offering led by partner Elizabeth E. Alexander, covering congressional oversight, investigations and enforcement actions.</p>', href: 'index.html#services' },
  { q: 'Who leads BPI?', a: '<p>Andrew Bleeker is CEO and Ben LaBolt has been President since Apr 2025. BSP made a majority investment in Apr 2023; Svoboda Capital Partners remains an investor.</p>', href: 'index.html#people' },
  { q: 'Are you hiring?', a: '<p>The concept careers section lists illustrative openings across public affairs, research, SignalOS data engineering and corporate affairs in Washington, New York, London, Berlin and Chicago.</p>', href: 'index.html#careers' },
  { q: 'How do I start a conversation?', a: '<p>Use the contact form: pick a topic (public affairs, reputation, campaign, research, crisis or a SignalOS briefing) and the right partner follows up. In this concept the form does not send data.</p>', href: 'index.html#contact' },
];
export const SUGGESTIONS = ['What is SignalOS?', 'How do retainers and pricing work?', 'Do you work in Brussels and Berlin?', 'Can you test our message before we launch it?', 'How fast can you respond in a crisis?', 'Are you hiring?'];

export function chrome() {
  document.documentElement.classList.remove('no-js');
  const rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }); rv.forEach(el => io.observe(el)); }
  else rv.forEach(el => el.classList.add('in'));
  if (innerWidth < 700) document.querySelectorAll('details.rat[open]').forEach(d => d.removeAttribute('open'));
}

export function mountChat(extraSuggestions) {
  try {
    const chat = Chat.mount(null, { persona: 'bpi', short_name: 'BPI', mode: 'floating', theme: 'light', faq: FAQ, suggestions: extraSuggestions || SUGGESTIONS,
      greeting: 'Hi, I’m the BPI desk. Ask about our services, offices, how retainers work, crisis response, or SignalOS, our intelligence layer.' });
    Frame.mount({}).setChat(chat);
    return chat;
  } catch (e) { console.warn('chat unavailable', e); return null; }
}

export function faqHTML(list = FAQ) {
  return list.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${f.q}</summary><div class="ans">${f.a}</div></details>`).join('');
}
