/* Questions about public legal records, answered in the browser with no model call (assets/chat.js, assets/agent.js).

   The records are data/live/legal_signals.json, written by scripts/refresh_legal.py: federal court dockets, liens,
   licences, business-registry filings and contract awards that name a watched competitor, add-on target or rival.
   Companies only: the file holds no private person, so nothing here can show one.

     legalIntent(text, roleCo)  -> { kind: 'legal', co, type, days } when the sentence asks for these records, else null
     legalAnswer(g, data)       -> { text, rows, hash, count } built from the file's rows
     legalQuestion(role)        -> the one prepared question a role gets as a chip, or '' for a role with none

   Pure functions: no network, no storage. The caller loads the file and draws the answer. */

const CO_NAME = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor' };
const CO_RX = {
  pp: /\b(?:punctual(?: pros)?|pp)\b/, cet: /\b(?:cet|commonwealth electrical)\b/, fl: /\bfrontline\b/,
  ts: /\bthomas(?: scientific)?\b/, bpi: /\b(?:bpi|bully pulpit)\b/, fh: /\bfair harbor\b/,
};
export const TYPE_NAME = { filing: 'Court docket', lien: 'Lien', licence: 'Licence', entity: 'Registry filing', award: 'Contract award' };
const TYPE_PLURAL = { filing: 'court dockets', lien: 'liens', licence: 'licences', entity: 'registry filings', award: 'contract awards' };
const norm = s => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9&' -]+/g, ' ').replace(/\s+/g, ' ').trim();

/* who the question is about, and which record it names */
const WHO = '(?:competit\\w+|rivals?|(?:add-?on |acquisition )?targets?|the competition)';
const REC = '(?:court|dockets?|lawsuits?|litigation|sued|suing|liens?|ucc|licen[cs]\\w*|registry|legal|public records?|contract awards?|awards?)';
const DID = '(?:do|did|done|doing|file|filed|filing|up to|win|won)';
const WHEN = '(?:this week|lately|recently|this month|last week|new)';
const RX = [
  new RegExp(`\\b${WHO}\\b.*\\b${REC}\\b|\\b${REC}\\b.*\\b${WHO}\\b`),                    // "liens on our add-on targets", "court filings by competitors"
  new RegExp(`\\b${WHO}\\b.*\\b${DID}\\b.*\\b${WHEN}\\b|\\b${WHEN}\\b.*\\b${WHO}\\b.*\\b${DID}\\b`),   // "what did the competition do this week"
  /\b(?:legal|court) (?:records?|signals?|filings?|dockets?)\b/, /\bpublic legal\b/, /\bwho (?:is|got|was) (?:being )?sued\b/,
];
/* other answers own these: a company's own filings screen, deal documents, a bid list */
const NOT = /\b(?:form d|10-?k|10-?q|8-?k|sec filings?|bids? due|rfps?|covenant|draft|nda|loi|contract we|our contract)\b/;
const TYPE_RX = [['award', /\b(?:awards?|won|win|contracts?)\b/], ['lien', /\b(?:liens?|ucc)\b/], ['licence', /\blicen[cs]\w*\b/], ['entity', /\b(?:registry|registr\w+|entity|entities|dissol\w+|merg\w+)\b/], ['filing', /\b(?:court|dockets?|lawsuits?|litigation|sued|suing)\b/]];

/** { kind:'legal', co, type, days } when the sentence asks about public legal records, else null. `roleCo` is the company of
    the role in view (null for the firm); a company named in the sentence wins over it. */
export function legalIntent(text, roleCo = null) {
  const t = norm(text);
  if (!t || t.length > 200 || NOT.test(t) || !RX.some(rx => rx.test(t))) return null;
  const named = Object.keys(CO_RX).find(k => CO_RX[k].test(t)) || null;
  const types = TYPE_RX.filter(([, rx]) => rx.test(t)).map(([k]) => k);
  const days = /\b(?:this|last) week\b/.test(t) ? 7 : /\bthis month\b/.test(t) ? 31 : /\b(?:lately|recently|new)\b/.test(t) ? 31 : 0;
  const role = /\btargets?\b/.test(t) && !/\bcompetit|\brival/.test(t) ? 'target' : null;
  return { kind: 'legal', co: named || roleCo || null, type: types.length === 1 ? types[0] : null, types, days, role };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWords = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };
const isoDaysAgo = (n, from) => { const d = from ? new Date(from + 'T00:00:00') : new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const SOURCE_NAME = { courtlistener: 'CourtListener', ct_ucc: 'Connecticut lien filings', ct_registry: 'Connecticut Business Registry', ny_registry: 'New York Department of State',
  ct_licences: 'Connecticut licences', de_licences: 'Delaware business licences', usaspending: 'USAspending' };
export const sourceName = id => SOURCE_NAME[id] || 'Public record';
/** One line for a record: what it is, in plain words. */
export function recordLine(r) {
  if (r.type === 'filing') return `${r.caption || 'Federal case'}, ${r.court || 'federal court'}`;
  if (r.type === 'award') return `${money(r.amount)} from ${r.agency || 'a federal agency'}`;
  return r.line || TYPE_NAME[r.type] || 'Record';
}
export function money(n) { if (n == null || !isFinite(n)) return '—'; const a = Math.abs(n); return `$${a >= 1e9 ? (a / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'K' : Math.round(a)}`; }

/** The answer for an intent, from the file's rows. `data` is the parsed legal_signals file (or null when it did not load). */
export function legalAnswer(g, data) {
  const hash = '#/signals/legal' + (g.co ? `?co=${g.co}` : '') + (g.type ? `${g.co ? '&' : '?'}type=${g.type}` : '');
  const all = Array.isArray(data?.items) ? data.items : null;
  if (!all) return { text: 'The legal records did not load. Open the screen and try again.', rows: [], hash, count: 0 };
  const whose = g.co ? `${CO_NAME[g.co] || 'the company'}'s` : 'the six companies\'';
  const who = g.role === 'target' ? 'add-on targets' : 'competitors and targets';
  let rows = all.filter(r => (!g.co || r.co === g.co) && (!g.types?.length || g.types.includes(r.type)) && (!g.role || r.role === g.role));
  rows = rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!rows.length) return { text: `No public record names one of ${whose} watched ${who} yet.`, rows: [], hash, count: 0 };
  const since = g.days ? isoDaysAgo(g.days, data.as_of) : '';
  /* a docket is "new" when an entry landed in the window, whatever the docket's own age */
  const fresh = since ? rows.filter(r => String(r.date) >= since) : rows;
  const span = g.days === 7 ? 'in the last 7 days' : g.days ? `in the last ${g.days} days` : 'on file';
  const mix = list => Object.entries(list.reduce((m, r) => (m[r.type] = (m[r.type] || 0) + 1, m), {})).map(([k, n]) => n === 1 ? `1 ${TYPE_NAME[k].toLowerCase()}` : `${n} ${TYPE_PLURAL[k]}`).join(', ');
  const top = (fresh.length ? fresh : rows).slice(0, 5);
  const lead = fresh.length
    ? `${count(fresh.length, 'public record', 'public records')} ${span} on ${whose} ${who}: ${mix(fresh)}.`
    : `Nothing new ${span} on ${whose} ${who}. The newest of ${rows.length} on file is from ${dayWords(rows[0].date)}.`;
  return { text: lead, rows: top, hash, count: fresh.length, total: rows.length };
}

/* The prepared question a role gets as a chip. First slice: the two Broad Sky partners. Any role may still type the question. */
const FIRM_Q = { 'bsp-managing-partner': 'What did the competition do this week?', 'bsp-partner': 'What did the competition do this week?' };
export function legalQuestion(role) { return FIRM_Q[String(role?.id || '')] || ''; }
