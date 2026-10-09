/* ═══════════════════════════════════════════════════════════════════════════
   BSP Desk assistant backend client (ES module, no dependencies).
   Talks to the hosted assistant (server/, on Vercel; see SETUP.md). Its URL is
   read from assets/runtime.json. When no backend is live every method degrades
   quietly, so the grounded engine in chat.js keeps working on its own.

   Usage (from chat.js):
     const { Backend } = await import('./backend.js?v=20261009165425');
     if (await Backend.discover()) for await (const t of Backend.chat({ persona, messages, context, question })) out += t;
     const pre = await Backend.precomputed(question);   // works without a backend

   Local testing: ?backend=http://127.0.0.1:8787 (or localStorage 'bsp-backend-endpoint')
   points the page at `wrangler dev`; ?backend=off disables the backend.
   ═══════════════════════════════════════════════════════════════════════════ */

const RUNTIME_URL = new URL('./runtime.json', import.meta.url).href;
const ANSWERS_URL = new URL('../data/answers/index.json', import.meta.url).href;
const OVERRIDE_LS = 'bsp-backend-endpoint';
const HEALTH_TIMEOUT_MS = 6000, JSON_TIMEOUT_MS = 8000, FIRST_BYTE_TIMEOUT_MS = 30000;   // a cold start of the backend takes a few seconds
const MAX_CONTEXT_CHARS = 12000, MAX_QUESTION_CHARS = 2000, MAX_HISTORY = 12;

/** Error with a sentence that can be shown to a visitor as-is (`message`). */
export class BackendError extends Error {
  constructor(message, { code = 'error', status = 0, retryAfter = 0, scope = '' } = {}) {
    super(message); this.name = 'BackendError'; this.code = code; this.status = status; this.retryAfter = retryAfter; this.scope = scope;
  }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const trimSlash = s => String(s || '').trim().replace(/\/+$/, '');
const validEndpoint = s => /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(trimSlash(s));
const minutes = s => { const m = Math.ceil((Number(s) || 0) / 60); return m <= 1 ? 'a minute' : m >= 90 ? `${Math.round(m / 60)} hours` : `${m} minutes`; };
const stripTags = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function override() {
  try {
    const q = new URLSearchParams(location.search).get('backend');
    if (q === 'off') return 'off';
    if (q && validEndpoint(q)) { try { localStorage.setItem(OVERRIDE_LS, trimSlash(q)); } catch { /* private mode */ } return trimSlash(q); }
    if (q === 'auto') { try { localStorage.removeItem(OVERRIDE_LS); } catch { /* private mode */ } return null; }
  } catch { /* no location (worker / test) */ }
  try { const v = localStorage.getItem(OVERRIDE_LS); return v && validEndpoint(v) ? trimSlash(v) : null; } catch { return null; }
}

async function fetchWithTimeout(url, opts = {}, ms = JSON_TIMEOUT_MS, outer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), ms);
  const relay = () => ctrl.abort(outer.reason);
  if (outer) { if (outer.aborted) ctrl.abort(outer.reason); else outer.addEventListener('abort', relay, { once: true }); }
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(timer); if (outer) outer.removeEventListener('abort', relay); }
}

/** Turns an HTTP status + Worker error body into a visitor-facing sentence. */
function humanize(status, body = {}, retryHeader = 0) {
  const retryAfter = Number(body.retryAfter || retryHeader) || 0;
  const code = body.error || 'http_' + status;
  const opt = { code, status, retryAfter, scope: body.scope || '' };
  if (status === 429 && code === 'daily_cap') return new BackendError('Claude has reached today\'s limit for this site, so answers come from the portfolio data until tomorrow.', opt);
  if (status === 429 && body.scope === 'upstream') return new BackendError('Claude is busy right now. Try again in a minute.', opt);
  if (status === 429) return new BackendError(`You've asked a lot of questions in a short time. Claude will be available again in ${minutes(retryAfter || 60)}; answers from the portfolio data still work.`, opt);
  if (status === 413) return new BackendError(body.message || 'That question is too long. Try a shorter one.', opt);
  if (status === 400) return new BackendError(body.message || 'The assistant could not read that question.', opt);
  if (status === 403) return new BackendError('Claude is not available on this page.', opt);
  if (status === 404) return new BackendError(body.message || 'Not found.', opt);
  if (status === 502 && code === 'backend_auth') return new BackendError('Claude is not available right now; answers come from the portfolio data.', opt);
  if (status === 503 && (code === 'no_model_key' || code === 'no_database')) return new BackendError('That feature is not available right now.', opt);
  if (status >= 500) return new BackendError('Claude is temporarily unavailable. Try again shortly.', opt);
  return new BackendError(body.message || 'Claude could not answer that just now.', opt);
}
function networkError(e) {
  if (e && (e.name === 'TimeoutError' || e.message === 'timeout')) return new BackendError('Claude took too long to respond. Try again in a moment.', { code: 'timeout' });
  return new BackendError('Could not reach Claude. Check your connection; answers from the portfolio data still work.', { code: 'network' });
}
async function errorFrom(res) {
  let body = {}; try { body = await res.json(); } catch { /* not JSON */ }
  return humanize(res.status, body, res.headers.get('Retry-After'));
}

/* ── Precomputed deep-dives ───────────────────────────────────────────────── */
const STOP = new Set('a an and are as at be by can do does for from how i in is it its me my of on or our show tell that the this to was we what when where which who why will with you your'.split(' '));
const normalize = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = s => new Set(normalize(s).split(' ').filter(w => w && !STOP.has(w)).map(w => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) ? w.slice(0, -1) : w));
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0; for (const t of a) if (b.has(t)) hit++;
  return hit / Math.max(a.size, b.size);
}
/** Strips scripts, inline handlers and javascript: URLs from deep-dive HTML. */
function sanitize(html) {
  const s = String(html || '');
  if (typeof DOMParser === 'undefined') return s.replace(/<(script|iframe|object|embed|style)[\s\S]*?<\/\1>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  const doc = new DOMParser().parseFromString(`<div>${s}</div>`, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,style,link,meta,form').forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if (/^(href|src|xlink:href|action|formaction)$/i.test(a.name) && /^\s*(javascript|data|vbscript):/i.test(a.value)) el.removeAttribute(a.name);
    }
    if (el.tagName === 'A' && /^https?:/i.test(el.getAttribute('href') || '')) { el.setAttribute('rel', 'noopener'); el.setAttribute('target', '_blank'); }
  });
  return doc.body.firstElementChild ? doc.body.firstElementChild.innerHTML : '';
}

/* ── The client ───────────────────────────────────────────────────────────── */
export const Backend = {
  /** Worker base URL once discovered, else null. */
  endpoint: null,
  /** True when the Worker reports a model key (Claude answers available). */
  llm: false,
  model: null,
  version: null,
  db: false,
  health: null,
  /** Model that served the last chat answer, stop reason and token usage. */
  last: null,
  _discovery: null,
  _ctrl: null,
  _answers: null,

  /** Finds the Worker: runtime.json → GET /health (2.5 s). Resolves to the endpoint or null. Cached; pass {force:true} to re-check. */
  async discover({ force = false } = {}) {
    if (this._discovery && !force) return this._discovery;
    this._discovery = (async () => {
      this.endpoint = null; this.llm = false; this.db = false; this.health = null;
      let base = override();
      if (base === 'off') return null;
      if (!base) {
        try {
          const res = await fetchWithTimeout(RUNTIME_URL, { cache: 'no-store' }, HEALTH_TIMEOUT_MS);
          if (!res.ok) return null;
          const rt = await res.json();
          base = rt && validEndpoint(rt.chatEndpoint) ? trimSlash(rt.chatEndpoint) : null;
        } catch { return null; }
      }
      if (!base) return null;
      try {
        const res = await fetchWithTimeout(base + '/health', { cache: 'no-store' }, HEALTH_TIMEOUT_MS);
        if (!res.ok) return null;
        const h = await res.json();
        if (!h || h.ok !== true) return null;
        Object.assign(this, { endpoint: base, health: h, llm: h.llm !== false, model: h.model || null, version: h.version || null, db: !!h.db });
        return base;
      } catch { return null; }
    })();
    const r = await this._discovery;
    if (!r) this._discovery = null;   // let a later call retry (e.g. after a cold start)
    return r;
  },

  /** True when a backend with Claude is live (runs discovery if needed). */
  async available() { return !!(await this.discover()) && this.llm; },

  /** Cancels the in-flight chat stream, if any. */
  abort() { if (this._ctrl) { try { this._ctrl.abort(); } catch { /* already done */ } this._ctrl = null; } },

  /**
   * Streams answer text from POST /chat.
   *   for await (const chunk of Backend.chat({ persona, messages, context, question })) …
   * messages: [{role:'user'|'assistant', content}] (prior turns); context: [{title, text, href}].
   * onEvent(ev) receives {type:'meta'|'status'|'sources'|'done', …}: 'status' is a progress line, 'sources' the
   * numbered sources the answer cites as [n] (sent again whenever the list grows). A second 'meta' with fallback:true names the
   * fallback model that took over (text already received stays valid). A 'reset' event, if a
   * future Worker sends one, means discard the text received so far. Throws BackendError with a
   * visitor-facing message; ends quietly when Backend.abort() is called.
   */
  async *chat({ persona = 'portal', messages = [], context = [], question = '', retrieve = true, onEvent = null, signal = null } = {}) {
    const q = String(question || '').trim();
    if (!q) throw new BackendError('Ask a question first.', { code: 'missing_question' });
    if (q.length > MAX_QUESTION_CHARS) throw new BackendError(`Questions are limited to ${MAX_QUESTION_CHARS.toLocaleString('en-US')} characters. Try a shorter one.`, { code: 'question_too_long' });
    if (!(await this.discover())) throw new BackendError('Claude is not available right now, so answers come from the portfolio data.', { code: 'offline' });
    if (!this.llm) throw new BackendError('Claude is not available right now; answers come from the portfolio data.', { code: 'no_model_key' });

    // Fit retrieved context into the Worker's 12k-character budget, best sources first.
    const ctxOut = []; let used = 0;
    for (const c of Array.isArray(context) ? context : []) {
      if (!c) continue;
      const title = stripTags(c.title || '').slice(0, 200), href = c.href ? String(c.href).slice(0, 500) : '';
      let text = stripTags(c.text || '');
      const room = MAX_CONTEXT_CHARS - used - title.length;
      if (room < 200) break;
      if (text.length > room) text = text.slice(0, room - 2) + ' …';
      ctxOut.push({ title, text, href }); used += title.length + text.length;
      if (ctxOut.length >= 16) break;
    }
    const hist = (Array.isArray(messages) ? messages : []).filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      .slice(-MAX_HISTORY).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : stripTags(m.text || m.html || '') }));

    this.abort();
    const ctrl = new AbortController(); this._ctrl = ctrl;
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', () => ctrl.abort(), { once: true }); }
    this.last = null;

    // The fetch uses ctrl.signal directly so Backend.abort() also cancels the body stream;
    // the first-byte timer only runs until the response headers arrive.
    let res, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, FIRST_BYTE_TIMEOUT_MS);
    try {
      res = await fetch(this.endpoint + '/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ persona, messages: hist, context: ctxOut, question: q, ...(retrieve ? {} : { retrieve: false }) }), signal: ctrl.signal,
      });
    } catch (e) {
      if (this._ctrl === ctrl) this._ctrl = null;
      if (timedOut) throw networkError({ name: 'TimeoutError' });
      if (ctrl.signal.aborted) return;
      throw networkError(e);
    } finally { clearTimeout(timer); }
    if (!res.ok) { if (this._ctrl === ctrl) this._ctrl = null; throw await errorFrom(res); }
    if (!res.body) { if (this._ctrl === ctrl) this._ctrl = null; throw new BackendError('This browser cannot stream answers.', { code: 'no_stream' }); }

    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', finished = false;
    const emit = ev => { try { onEvent && onEvent(ev); } catch { /* caller's problem */ } };
    try {
      for (;;) {
        if (ctrl.signal.aborted) return;
        let chunk;
        try { chunk = await reader.read(); }
        catch (e) { if (ctrl.signal.aborted) return; throw new BackendError('The answer stream was interrupted. Try again.', { code: 'stream_interrupted' }); }
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          if (ctrl.signal.aborted) return;   // Backend.abort() while buffered events remain
          const raw = buf.slice(0, i); buf = buf.slice(i + 2);
          let data = ''; for (const line of raw.split('\n')) if (line.startsWith('data:')) data += line.slice(5).trimStart();
          if (!data) continue;
          let ev; try { ev = JSON.parse(data); } catch { continue; }
          if (ev.type === 'text' && ev.text) yield ev.text;
          else if (ev.type === 'meta') { if (ev.model) this.model = ev.model; emit(ev); }
          else if (ev.type === 'reset' || ev.type === 'sources' || ev.type === 'status') { emit(ev); }
          else if (ev.type === 'done') { this.last = { model: ev.model || this.model, stop_reason: ev.stop_reason || null, usage: ev.usage || null }; finished = true; emit(ev); }
          else if (ev.type === 'error') {
            finished = true;
            const msg = ev.code === 'refusal' ? 'Claude declined to answer this one, so the grounded answer is shown instead.' : (ev.message || 'The answer stream was interrupted. Try again.');
            throw new BackendError(msg, { code: ev.code || 'stream_error', status: 200 });
          }
        }
      }
      if (!finished && !ctrl.signal.aborted) throw new BackendError('The answer ended early. Try again.', { code: 'stream_incomplete' });
    } finally {
      try { await reader.cancel(); } catch { /* done */ }
      if (this._ctrl === ctrl) this._ctrl = null;
    }
  },

  async _json(method, path, payload) {
    if (!(await this.discover())) return null;
    let res;
    try {
      res = await fetchWithTimeout(this.endpoint + path, method === 'GET' ? { cache: 'no-store' } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) }, JSON_TIMEOUT_MS);
    } catch (e) { throw networkError(e); }
    if (!res.ok) throw await errorFrom(res);
    return res.json();
  },

  /** Records a rating. {thread_id, message_id, rating: 1 | -1, question, answer_excerpt}. Resolves {ok, id} or {ok:false, offline:true}. */
  async feedback(payload = {}) {
    const r = await this._json('POST', '/feedback', { ...payload, answer_excerpt: stripTags(payload.answer_excerpt || '').slice(0, 1000) });
    return r || { ok: false, offline: true };
  },

  /** Upserts a thread. {thread_id, persona, title, messages_json: array | JSON string}. Resolves {ok, thread_id} or {ok:false, offline:true}. */
  async saveThread(payload = {}) {
    const body = { ...payload, messages_json: typeof payload.messages_json === 'string' ? payload.messages_json : JSON.stringify(payload.messages_json || payload.messages || []) };
    const r = await this._json('POST', '/thread', body);
    return r || { ok: false, offline: true };
  },

  /** Loads a saved thread: {thread_id, persona, title, messages, created_at, updated_at}, or null if offline / not found. */
  async loadThread(id) {
    if (!id) return null;
    try { return await this._json('GET', '/thread/' + encodeURIComponent(id)); }
    catch (e) { if (e.status === 404) return null; throw e; }
  },

  /** Backend counts for the data-coverage panel: {threads, messages, feedback, today:{requests,…}, daily_cap}, or null. */
  async stats() {
    try { return await this._json('GET', '/stats'); } catch { return null; }
  },

  /** Loads data/answers/index.json once (no backend needed). */
  async _loadAnswers() {
    if (this._answers) return this._answers;
    this._answers = (async () => {
      try {
        const res = await fetch(ANSWERS_URL, { cache: 'no-cache' });
        if (!res.ok) return { items: [] };
        const idx = await res.json();
        const list = Array.isArray(idx) ? idx : (idx.answers || idx.items || []);
        const defaults = Array.isArray(idx) ? {} : { model: idx.model || null, generated_at: idx.generated_at || null };
        const items = list.filter(a => a && (a.question || a.q)).map(a => {
          const qs = [a.question || a.q, ...(Array.isArray(a.aliases) ? a.aliases : [])].filter(Boolean);
          return { a, defaults, keys: qs.map(normalize), toks: qs.map(tokens) };
        });
        return { items };
      } catch { return { items: [] }; }
    })();
    return this._answers;
  },

  /**
   * Best precomputed Claude deep-dive for a question: normalized exact match first, then
   * token overlap ≥ 0.6. Resolves {html, model, generated_at, sources: [{name, dataset?, path?, as_of?}], question, score} or null.
   */
  async precomputed(question) {
    const nq = normalize(question); if (!nq) return null;
    const { items } = await this._loadAnswers(); if (!items.length) return null;
    const qt = tokens(question);
    let best = null, bestScore = 0;
    for (const it of items) {
      if (it.keys.includes(nq)) { best = it; bestScore = 1; break; }
      for (const t of it.toks) { const s = overlap(qt, t); if (s > bestScore) { bestScore = s; best = it; } }
    }
    if (!best || bestScore < 0.6) return null;
    const a = best.a;
    let html = a.html || '';
    // index.json rows carry a slug; the full answer (html + source objects) lives in data/answers/<slug>.json.
    const file = a.file || a.path || a.href || (/^[a-z0-9-]+$/i.test(a.slug || '') ? a.slug + '.json' : '');
    let rec = null;
    if (!html && file) {
      try {
        const res = await fetch(new URL(file, ANSWERS_URL).href, { cache: 'no-cache' });
        if (res.ok) { const t = await res.text(); if (/\.json$/i.test(file)) { rec = JSON.parse(t); html = rec.html || ''; } else html = t; }
      } catch { /* missing file */ }
    }
    if (!html) return null;
    const srcs = rec && Array.isArray(rec.sources) ? rec.sources : (Array.isArray(a.sources) ? a.sources : []);
    const sources = srcs.map(s => typeof s === 'string' ? { name: s } : s).filter(s => s && s.name);
    return { html: sanitize(html), model: (rec && rec.model) || a.model || best.defaults.model || null, generated_at: (rec && rec.generated_at) || a.generated_at || best.defaults.generated_at || null, sources, question: a.question || a.q, score: Math.round(bestScore * 100) / 100 };
  },
};

export default Backend;
