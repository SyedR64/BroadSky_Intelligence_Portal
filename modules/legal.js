/* Legal records: one screen of Local signals (#/signals/legal). A feed of public records that name a watched competitor,
   add-on target or sector rival: federal court dockets, liens and federal contract awards, newest first, with filters for
   the company, the kind of record and the state, and a link from every row to the record at its public source.

   Data: data/live/legal_signals.json, written by scripts/refresh_legal.py (briefing/legal_records_sources.md has the survey
   of sources). Companies only: the file holds no private person; a private party in a case caption reads "Individual".
   A source that did not answer shows its earlier rows or nothing, never a made-up row. A company role sees its own company
   (the shell opens the screen with ?co=<company>, modules/registry.js LEVELS). */
import { TYPE_NAME, dayWords, money, sourceName, recordLine } from '../assets/legal-intents.js?v=20261127070155';

const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const COS = [['pp', 'Punctual Pros'], ['cet', 'CET'], ['fl', 'Frontline'], ['ts', 'Thomas Scientific'], ['bpi', 'BPI'], ['fh', 'Fair Harbor']];
const CO_NAME = Object.fromEntries(COS);
const ROLE = { competitor: 'Competitor', target: 'Add-on target', rival: 'Sector rival' };
const STATE = { CT: 'Connecticut', MA: 'Massachusetts', PA: 'Pennsylvania', NJ: 'New Jersey', DE: 'Delaware', MD: 'Maryland', NY: 'New York', RI: 'Rhode Island', NH: 'New Hampshire',
  TX: 'Texas', CA: 'California', IL: 'Illinois', DC: 'Washington, DC', FL: 'Florida', MO: 'Missouri', VA: 'Virginia', GA: 'Georgia', OH: 'Ohio', MI: 'Michigan', NC: 'North Carolina' };
const TYPE_CHIP = { filing: 'warn', lien: 'info', award: 'good' };
const isoDaysAgo = (n, from) => { const d = new Date((from || new Date().toISOString().slice(0, 10)) + 'T00:00:00'); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/* the place a record belongs to: the court's state for a docket, the party's for a lien, where the work is done for an award */
const stateOf = r => r.type === 'filing' ? (Object.keys(STATE).find(k => new RegExp(`\\b${STATE[k].replace(/[,.]/g, '.?')}\\b`).test(String(r.record?.court || ''))) || r.state || '') : (r.state || '');

export async function legalView(ctx) {
  const { el, ui, live, params, inspector } = ctx;
  let D = null;
  try { D = await live.snapshot('legal_signals'); } catch (e) { console.warn('[legal] records did not load', e?.message || e); }
  if (!el.isConnected) return;
  const all = (Array.isArray(D?.items) ? D.items : []).map(r => ({ ...r, area: stateOf(r) }));
  const head = sub => ui.pageHead({ title: 'Legal records', sub });
  if (!all.length) { el.innerHTML = `<div class="m-signals">${head('No public record is on file yet.')}${ui.empty('Legal records are not available right now')}</div>`; return; }

  const co0 = COS.some(([k]) => k === params.co) ? params.co : '';
  const mine = co0 ? all.filter(r => r.co === co0) : all;
  const weekAgo = isoDaysAgo(7, D.as_of), week = mine.filter(r => String(r.date) >= weekAgo);
  const n = t => mine.filter(r => r.type === t).length;
  const awards = mine.filter(r => r.type === 'award'), awardSum = awards.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const parties = new Set(mine.map(r => r.party)).size;
  const kpi = (label, value, sub) => ({ label, value, sub });
  el.innerHTML = `<div class="m-signals m-legal">${head(`${week.length} new in 7 days. ${mine.length} records on ${parties} watched companies.`)}
    ${ui.kpis([kpi('New in 7 days', String(week.length), week.length ? h(TYPE_NAME[week[0].type]) + ' newest' : 'none this week'), kpi('Court dockets', String(n('filing')), 'federal, past year'),
      kpi('Liens', String(n('lien')), 'active, Connecticut'), kpi('Contract awards', String(awards.length), awards.length ? `${h(money(awardSum))} federal` : 'federal, past year')])}
    <div class="mt-12">${ui.panel({ title: 'Records', body: '<div id="lg-fil"></div><div id="lg-tbl"></div>', flush: true })}</div>
    ${marks(ui, D)}</div>`;

  const states = [...new Set(mine.map(r => r.area).filter(Boolean))].sort((a, b) => (STATE[a] || a).localeCompare(STATE[b] || b));
  const types = Object.keys(TYPE_NAME).filter(t => mine.some(r => r.type === t));
  const cols = [
    { key: 'date', label: 'Date', width: '112px', fmt: v => `<span class="sys-num">${h(dayWords(v) || '—')}</span>` },
    { key: 'party', label: 'Company', fmt: (v, r) => `<b>${h(v)}</b><div class="small text-2">${h(ROLE[r.role] || '')}</div>` },
    ...(co0 ? [] : [{ key: 'co', label: 'Watched for', width: '150px', fmt: v => `<span class="sys-chip sys-chip--soft" data-co="${h(v)}">${h(CO_NAME[v] || '—')}</span>`, sort: (a, b) => COS.findIndex(c => c[0] === a.co) - COS.findIndex(c => c[0] === b.co) }]),
    { key: 'type', label: 'Record', fmt: (v, r) => `<span class="sys-chip sys-chip--${TYPE_CHIP[v] || 'info'}">${h(TYPE_NAME[v] || 'Record')}</span> <span class="lg-line">${h(recordLine(r))}</span>`, wrap: true },
    { key: 'area', label: 'State', width: '130px', fmt: v => h(STATE[v] || v || '—') },
    { key: 'url', label: 'Source', width: '170px', fmt: (v, r) => v ? `<a href="${h(v)}" target="_blank" rel="noopener" data-stop>${h(sourceName(r.source))} →</a>` : '—', sort: (a, b) => sourceName(a.source).localeCompare(sourceName(b.source)) },
  ];
  const open = r => inspector.open({
    title: h(r.party), sub: `${h(TYPE_NAME[r.type] || 'Record')} · ${h(dayWords(r.date))}`, color: `var(--co-${r.co})`,
    sections: [{ label: 'Record', html: ui.kv(detail(r)) }, { label: 'Next action', html: `<div class="small">${h(action(r))}</div>` }],
    actions: [{ href: r.url, label: `Open at ${h(sourceName(r.source))}` }],
  });
  const tbl = ui.table(el.querySelector('#lg-tbl'), { columns: cols, rows: mine, pageSize: 25, sortKey: 'date', sortDir: -1, exportName: 'legal_records', onRow: open });
  el.querySelector('#lg-tbl').addEventListener('click', e => { if (e.target.closest('[data-stop]')) e.stopPropagation(); }, true);   // the source link opens the source, not the side panel
  const f = ui.filters(el.querySelector('#lg-fil'), [
    ...(co0 ? [] : [{ key: 'co', label: 'Company', options: COS.filter(([k]) => all.some(r => r.co === k)).map(([value, label]) => ({ value, label })) }]),
    { key: 'type', label: 'Record', options: types.map(t => ({ value: t, label: TYPE_NAME[t] })), value: types.includes(params.type) ? params.type : '' },
    { key: 'state', label: 'State', options: states.map(s => ({ value: s, label: STATE[s] || s })), value: states.includes(params.state) ? params.state : '' },
    { key: 'week', label: 'New in 7 days', type: 'toggle', value: params.new === '1' },
    { key: 'q', label: 'Search a company', type: 'search' },
  ], st => apply(st));
  function apply(st) {
    const q = String(st.q || '').toLowerCase();
    const rows = mine.filter(r => (!st.co || r.co === st.co) && (!st.type || r.type === st.type) && (!st.state || r.area === st.state) && (!st.week || String(r.date) >= weekAgo)
      && (!q || `${r.party} ${r.caption || ''} ${r.line || ''} ${r.secured || ''} ${r.agency || ''}`.toLowerCase().includes(q)));
    f.setCount(`${rows.length} of ${mine.length}`); tbl.update(rows);
  }
  apply(f.state);
}

/* the side panel's figures for one record: plain words, no identifiers */
function detail(r) {
  if (r.type === 'filing') return { Case: h(r.caption || '—'), Court: h(r.court || '—'), 'Newest entry': h(dayWords(r.date)), 'Entries listed': h(String(r.entries ?? '—')), 'In the last 7 days': h(String(r.entries_week ?? 0)), 'First seen': h(dayWords(r.first_seen) || '—') };
  if (r.type === 'lien') return { 'Secured party': h(r.secured || '—'), Filing: h(String(r.line || '').split(':')[0] || 'Lien filing'), Filed: h(dayWords(r.date)), Lapses: h(dayWords(r.lapses) || '—'), Status: h(r.status || '—'), Debtor: h(r.place || '—') };
  if (r.type === 'award') return { Amount: h(money(r.amount)), Agency: h(r.agency || '—'), Awarded: h(dayWords(r.date)), 'Place of work': h(STATE[r.state] || r.state || '—'), Recipient: h(r.recipient || '—'), For: h(r.what || '—') };
  return { Record: h(r.line || '—'), Dated: h(dayWords(r.date)), Status: h(r.status || '—') };
}
function action(r) {
  if (r.type === 'filing') return r.role === 'target' ? 'Read the docket before the next call with the owner.' : 'Read the docket and note what the case is about.';
  if (r.type === 'lien') return r.role === 'target' ? 'Ask who holds the debt before pricing an offer.' : 'Note the lender and the lapse date.';
  if (r.type === 'award') return 'Check the agency and scope against our own pipeline.';
  return 'Open the record at its source.';
}

/* sources, method and the as-of date: marked for the shell's drawers and header chip, never printed on the screen */
function marks(ui, D) {
  const day = dayWords(String(D.fetched_at || D.as_of || '').slice(0, 10));
  const link = (text, url) => `<span class="src" data-src><a href="${h(url)}" target="_blank" rel="noopener">${h(text)}</a>${day ? ` · as of ${h(day)}` : ''}</span>`;
  const has = k => (D.sources || []).some(s => s.key === k && s.rows > 0);
  return `${day ? `<i data-asof="${h(day)}"></i>` : ''}`
    + (has('courts') ? link('Federal court dockets: CourtListener and the RECAP archive, Free Law Project', 'https://www.courtlistener.com/recap/') : '')
    + (has('liens') ? link('Connecticut Secretary of the State, lien filings (Connecticut Open Data)', 'https://data.ct.gov/d/xfev-8smz') : '')
    + (has('awards') ? link('USAspending, federal contract awards', 'https://www.usaspending.gov/search') : '')
    + `<p class="small" data-method>Records are matched by company name and place. A docket counts when its court sits in a state where the company works; a lien counts when the debtor's state matches. National rivals are matched by name alone.</p>`
    + `<p class="small" data-method>Only companies are listed. A private party in a case caption reads "Individual". Dockets show the past year, awards the past year, liens those still active.</p>`
    + `<p class="small" data-method>${h(String((D.watching || []).length || D.watched || ''))} companies are read each night, drawn from the competitor, add-on target and rival lists already in Broad Sky OS.</p>`;
}
