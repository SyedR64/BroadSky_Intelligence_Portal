/* Typed commands that need no model: the recognisers behind the Ask panel and the agent (assets/chat.js).

   Two sentences are understood here, in plain functions that touch nothing outside their arguments:
     1. "point out the best 3 acquisition targets" and close wordings -> a globe tour, 'best3' or 'best3-<co>'
        (the tours are in data/research/globe_tours.json; the command bus is assets/mapcmd.js, event 'bsp:map').
     2. A typed street address with a job ("going to 418 Wexcombe Ln, Lititz for a sink repair, give me the floor plans,
        view") -> { number, street, town, state, zip, job }, handed to window.BSPSite.lookup(text) when a lane has
        provided it, else routed to #/home/overview?address=<the typed text, encoded>.

   Nothing here calls the network, a backend or a model. The text a visitor types is never stored by these functions. */

export const TOUR_CO = ['cet', 'pp', 'fl', 'ts'];                       // the companies that have their own best-3 tour
const CO_NAME = { pp: 'Punctual Pros', cet: 'CET', fl: 'Frontline', ts: 'Thomas Scientific', bpi: 'BPI', fh: 'Fair Harbor' };
const CO_RX = {
  pp: /\b(?:punctual(?: pros)?|pp)\b/, cet: /\b(?:cet|commonwealth|horton|nuwave)\b/, fl: /\b(?:frontline|fl)\b/,
  ts: /\b(?:thomas(?: scientific)?|ts)\b/, bpi: /\b(?:bpi|bully pulpit)\b/, fh: /\bfair harbor\b/,
};
const norm = s => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9&' -]+/g, ' ').replace(/\s+/g, ' ').trim();
/** The company a sentence names (a key of CO_NAME), or null. */
export const companyIn = text => { const t = norm(text); return Object.keys(CO_RX).find(k => CO_RX[k].test(t)) || null; };

/* ── 1. The best three targets ─────────────────────────────────────────────── */
const NOUN = '(?:targets?|candidates?|acquisitions?|add-?ons?|tuck-?ins?)';
const KIND = '(?:(?:acquisition|add-?on|tuck-?in|m&a)\\s+)?';
const BEST_RX = new RegExp(`\\b(?:best|top|strongest|highest[- ]ranked|most attractive)\\s+(?:(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+)?${KIND}${NOUN}\\b`);
const BEST3_RX = new RegExp(`\\b(?:3|three)\\s+(?:best|top|strongest)\\s+${KIND}${NOUN}\\b`);
/* a place qualifier, a question about the method, or a look back at deals already done: other answers own those */
const NOT_BEST_RX = /\b(?:in|across|within|near|around)\s+(?:new england|northeast|mid-?atlantic|midwest|west coast|east coast|the south|the west|massachusetts|connecticut|rhode island|new hampshire|vermont|maine|new york|new jersey|pennsylvania|ohio|texas|california|florida|illinois|ma|ct|ri|nh|vt|ny|nj|pa)\b|\b(?:how|why)\b.*\b(?:pick|choose|score|rank|rate|select|find|source)|\b(?:rubric|criteria|methodology|method)\b|\b(?:has|have|had|did|made|closed|completed|done|so far|to date|history|track record)\b/;

/** { tour, co, named } when the sentence asks for the best three targets, else null.
    `roleCo` is the company of the role in view (or null for the firm); a company named in the sentence wins over it.
    A company with no screened list (BPI, Fair Harbor) falls back to the firm tour with `missing` set. */
export function bestTargets(text, roleCo = null) {
  const t = norm(text);
  if (!t || t.length > 200) return null;
  const m = BEST_RX.exec(t);
  if (!m && !BEST3_RX.test(t)) return null;
  if (m && m[1] && !/^(?:3|three)$/.test(m[1])) return null;            // "top 10 targets" is a different question
  if (NOT_BEST_RX.test(t)) return null;
  const named = companyIn(t);
  if (named && !(m && m[1]) && !BEST3_RX.test(t)) return null;           // "top add-on targets for CET" without a number is the add-on list answer
  const co = named || (roleCo && CO_NAME[roleCo] ? roleCo : null);
  if (co && TOUR_CO.includes(co)) return { tour: 'best3-' + co, co, named: !!named };
  return { tour: 'best3', co: null, named: !!named, ...(co ? { missing: co } : {}) };
}

const SUFFIX_WORDS = /,?\s+(?:inc|llc|corp|corporation|co|ltd|company)\.?$/i;
const shortName = s => String(s || '').split(',')[0].replace(SUFFIX_WORDS, '').trim();
export const countWords = s => String(s || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/** The answer line for a best-3 command, at most 30 words. `tours` is the tours array of globe_tours.json (optional). */
export function bestReply(cmd, tours) {
  const tour = (tours || []).find(t => t.id === cmd.tour);
  const names = (tour?.steps || []).slice(0, 3).map(s => shortName(s.label)).filter(Boolean);
  const who = cmd.co ? `${CO_NAME[cmd.co]}'s` : 'the firm\'s';
  const lead = cmd.missing ? `${CO_NAME[cmd.missing]} has no screened targets. Showing the firm's three best add-on targets` : `Flying the globe to ${who} three best add-on targets`;
  let s = names.length ? `${lead}: ${list(names)}.` : `${lead}.`;
  if (countWords(s) > 30) s = `${lead}.`;
  return s;
}

/* ── 2. A street address with a job ────────────────────────────────────────── */
const SUFFIX = 'st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ter|terrace|pike|hwy|highway|cir|circle|trl|trail|pkwy|parkway|square|court|loop|alley';
const SUFFIX_AMBIG = 'ct|way|pl|place|run|row|sq';                       // also common words or state codes: they must end the address
const ADDR_RX = new RegExp(`\\b(\\d{1,6}[a-z]?)\\s+((?:[A-Za-z0-9.'’-]+\\s+){0,4}?)(${SUFFIX}|${SUFFIX_AMBIG})\\b\\.?`, 'ig');
const NAME_STOP = new Set(['on', 'in', 'at', 'for', 'to', 'and', 'of', 'with', 'is', 'are', 'the', 'a', 'an', 'my', 'our', 'your', 'from', 'by', 'near', 'around', 'than', 'about']);
const NOT_HOUSE_NO = /\b(?:top|best|which|within|first|next|last|under|than|least|most|these|those|nearly|another|about)\s*$/i;
const COUNTED = /^\d+[a-z]? (?:[\w-]+ )?(?:miles?|mi|km|minutes?|hours?|days?|weeks?|months?|years?|percent|targets|homes|houses|customers|accounts|calls|leads|jobs|techs|technicians|counties|companies|brands|firms|sites|stores|locations|markets|states|deals|people|households|plumbers|electricians) /i;
const AFTER_AMBIG = /^\s*(?:$|[,.;?!#]|(?:for|to|in|and|give|show|please|with|so|then|view|pa|nj)\b)/i;
const TOWN_STOP = new Set(['for', 'to', 'and', 'give', 'show', 'please', 'with', 'so', 'then', 'can', 'could', 'i', 'we', 'need', 'get', 'pull', 'see', 'view', 'floor', 'plans', 'plan', 'my', 'me', 'the', 'a', 'an', 'it', 'its', 'as', 'on', 'at', 'in', 'tell', 'where', 'what', 'also', 'job', 'now', 'today', 'tomorrow', 'asap', 'thanks', 'thx', 'looking', 'going', 'heading', 'headed']);
const JOB_WORD = /^(?:repair|repairs|install|installation|replace|replacement|leak|leaks|clog|clogged|drain|sink|faucet|toilet|heater|drywall|outlet|panel|wiring|rewire|fix|service|inspection|estimate|quote|maintenance|tune-?up|patch|water)$/i;
const STATES = { AL: 1, AK: 1, AZ: 1, AR: 1, CA: 1, CO: 1, CT: 1, DE: 1, DC: 1, FL: 1, GA: 1, HI: 1, ID: 1, IL: 1, IN: 1, IA: 1, KS: 1, KY: 1, LA: 1, ME: 1, MD: 1, MA: 1, MI: 1, MN: 1, MS: 1, MO: 1, MT: 1, NE: 1, NV: 1, NH: 1, NJ: 1, NM: 1, NY: 1, NC: 1, ND: 1, OH: 1, OK: 1, OR: 1, PA: 1, RI: 1, SC: 1, SD: 1, TN: 1, TX: 1, UT: 1, VT: 1, VA: 1, WA: 1, WV: 1, WI: 1, WY: 1 };
const STATE_NAME = { pennsylvania: 'PA', 'new jersey': 'NJ', massachusetts: 'MA', connecticut: 'CT', 'rhode island': 'RI', 'new hampshire': 'NH', vermont: 'VT', maine: 'ME', 'new york': 'NY', maryland: 'MD', delaware: 'DE', ohio: 'OH', virginia: 'VA' };
const title = s => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const cap = w => /^[A-Z]/.test(w);

/** The job words around an address: "for a sink repair", "to fix a leaking pipe", "a drywall job at …". */
function jobAround(before, after) {
  const clean = j => { j = j.replace(/\s+/g, ' ').replace(/\b(?:job|call|please)\b/ig, '').replace(/^(?:a|an|the|some|my)\s+/i, '').trim().toLowerCase(); return j && j.length <= 40 ? j : ''; };
  const end = '(?=\\s*(?:[,.;:!?]|$)|\\s+(?:give|show|get|pull|and|please|then|so|can|could|i|tell|with|view|need|what|where|send|also|thanks)\\b)';
  let m = new RegExp(`\\bfor\\s+((?:a|an|the|some|my)\\s+)?([a-z][a-z/&' -]{1,40}?)${end}`, 'i').exec(after);
  if (m) { const j = clean((m[1] || '') + m[2]); if (j) return j; }
  m = new RegExp(`\\bto\\s+((?:fix|repair|replace|install|unclog|inspect|rewire|patch|service|clear|check|replumb|hang|finish)\\b[a-z/&' -]{0,36}?)${end}`, 'i').exec(after);
  if (m) { const j = clean(m[1]); if (j) return j; }
  m = /\b(?:a|an|the)\s+([a-z][a-z' -]{2,30}?)\s+(?:job|call|visit|ticket|appointment)\s+(?:at|on|to|in)\s*$/i.exec(before) || /([a-z][a-z'-]+(?: [a-z][a-z'-]+)?)\s+(?:job|call|visit|ticket|appointment)\s+(?:at|on|to|in)\s*$/i.exec(before);
  if (m) { const j = clean(m[1]); if (j) return j; }
  m = /\b(?:do|doing|fix|fixing|repair|repairing|install|installing|replace|replacing)\s+(?:(?:a|an|the)\s+)?([a-z][a-z' -]{2,30}?)\s+(?:at|on)\s*$/i.exec(before);
  if (m) { const j = clean(m[1]); if (j) return j; }
  return '';
}

/** The street address in a typed sentence, or null: { number, street, town, state, zip, job, text }.
    street is "418 Wexcombe Ln" as typed; town, state and zip are read when they follow the street ("…Ln, Lititz, PA 17543");
    job is the work named around it. */
export function parseAddress(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 400) return null;
  ADDR_RX.lastIndex = 0;
  for (const m of s.matchAll(ADDR_RX)) {
    const nameWords = m[2].trim() ? m[2].trim().split(/\s+/) : [];
    if (nameWords.some(w => NAME_STOP.has(w.toLowerCase().replace(/[.,]/g, '')))) continue;
    if (!nameWords.length && !/^(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|pl|place)$/i.test(m[3])) continue;
    if (!nameWords.length) continue;                                         // "418 Ln" has no street name
    if (NOT_HOUSE_NO.test(s.slice(0, m.index)) || COUNTED.test(m[0] + ' x')) continue;
    const end = m.index + m[0].length, tail = s.slice(end);
    if (new RegExp(`^(?:${SUFFIX_AMBIG})$`, 'i').test(m[3]) && !AFTER_AMBIG.test(tail)) continue;
    let rest = tail.replace(/^[\s.]+/, '');
    const comma = /^,/.test(rest); rest = rest.replace(/^,\s*/, '');
    rest = rest.replace(/^(?:apt|unit|suite|ste|#)\.?\s*[\w-]+\s*,?\s*/i, '');
    // town: up to three words, cut at a stop word; with no comma only the first word is sure, the rest must be capitalised
    let town = '', used = 0;
    const toks = rest.match(/^[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){0,2}/);
    if (toks) {
      const ws = toks[0].split(/\s+/), keep = [];
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i], lw = w.toLowerCase();
        if (TOWN_STOP.has(lw) || (i === 0 && !comma && JOB_WORD.test(lw) && !cap(w))) break;
        if (i > 0 && !comma && !cap(w)) break;
        keep.push(w);
      }
      town = keep.join(' '); used = town ? town.length : 0;
    }
    let state = '', zip = '', after = rest.slice(used).replace(/^[\s,]+/, '');
    const tw = town.split(/\s+/);
    if (tw.length > 1 && STATES[tw[tw.length - 1]] && tw[tw.length - 1] === tw[tw.length - 1].toUpperCase()) { state = tw.pop(); town = tw.join(' '); }
    if (town && STATES[town.toUpperCase()] && town === town.toUpperCase() && !/\s/.test(town)) { state = town.toUpperCase(); town = ''; }
    else if (town && !state) {
      const sm = /^([A-Za-z]{2})\b(?!\w)/.exec(after);
      if (sm && STATES[sm[1].toUpperCase()] && sm[1] === sm[1].toUpperCase()) { state = sm[1]; after = after.slice(2).replace(/^[\s,]+/, ''); }
      else { const lw = Object.keys(STATE_NAME).find(n => after.toLowerCase().startsWith(n) && !/\w/.test(after[n.length] || ' ')); if (lw) { state = STATE_NAME[lw]; after = after.slice(lw.length).replace(/^[\s,]+/, ''); } }
    }
    const zm = /^(\d{5})(?:-\d{4})?\b/.exec(after);
    if (zm) { zip = zm[1]; after = after.slice(zm[0].length); }
    if (town && JOB_WORD.test(town.toLowerCase()) && !comma) { town = ''; }
    const job = jobAround(s.slice(0, m.index), after || rest.slice(used));
    return {
      number: m[1], street: `${m[1]} ${m[2]}${m[3]}`.replace(/\s+/g, ' ').trim(),
      town: town ? title(town) : '', state, zip, job, text: s,
    };
  }
  return null;
}

/* The address belongs to a site visit when a job or a visit cue comes with it; a bare address in a question about calls or leads
   stays with the property-brief answer. */
const SITE_CUE = /\b(?:going to|headed to|heading to|on my way to|driving to|dispatched to|arriving at|floor ?plans?|blueprints?|layouts?|renderings?|3-?d|satellite|aerial|pipes?|plumbing|wires?|wiring|shut-?off|breaker)\b/i;
/** The address parse when the sentence is a site request (an address plus a job or a visit cue), else null. */
export function siteAddress(text) {
  const p = parseAddress(text);
  return p && (p.job || SITE_CUE.test(String(text))) ? p : null;
}

/** The answer line for an address, at most 30 words. */
export function addressReply(p, found = false) {
  const where = [p.street, p.town].filter(Boolean).join(', ');
  const s = `${found ? 'Looking up' : 'Opening the address lookup for'} ${where}${p.job ? `: ${p.job}` : ''}.`;
  return countWords(s) > 30 ? `${found ? 'Looking up' : 'Opening the address lookup for'} ${p.street}.` : s;
}
/** Where the address lookup lives until window.BSPSite.lookup exists. The typed text travels encoded in the address. */
export const addressHash = text => '#/home/overview?address=' + encodeURIComponent(String(text ?? '').trim());

/** One decision for a typed sentence: { kind: 'best3', tour, co, … } | { kind: 'address', addr } | null. */
export function classify(text, { co = null } = {}) {
  const b = bestTargets(text, co);
  if (b) return { kind: 'best3', ...b };
  const a = siteAddress(text);
  return a ? { kind: 'address', addr: a } : null;
}

export const GlobeIntents = { bestTargets, bestReply, parseAddress, siteAddress, addressReply, addressHash, classify, companyIn, countWords, TOUR_CO };
export default GlobeIntents;
