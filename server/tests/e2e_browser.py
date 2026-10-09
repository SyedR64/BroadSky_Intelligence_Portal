"""
Browser check: the unchanged site client (assets/backend.js + chat.js) against this backend.

Starts the mock Claude API (8799), the backend on 8787 (FAKE_ANTHROPIC_URL), a capped backend (8788,
DAILY_CAP=0), a backend with no Claude key (8789), the static site on 8765 and a second origin on 8766,
drives scripts/chat_test.html and assistant.html in headless Chromium (Playwright), prints one line per
check, and stops everything it started.

  cd server && python3 tests/e2e_browser.py
"""

import json
import os
import sqlite3
import sys
import tempfile
import time
import urllib.parse

from playwright.sync_api import sync_playwright

import procs

REPO = os.path.dirname(procs.SERVER_DIR)
OPEN_Q = 'What questions should an operating partner ask a new CFO?'
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)


def page_url(backend, q, page='scripts/chat_test.html', port=8765):
    return f'http://127.0.0.1:{port}/{page}?backend={urllib.parse.quote(backend, safe=":/")}&q={urllib.parse.quote(q)}'


def wait_answer(page, timeout=30000):
    page.wait_for_function("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); return t && t._rec && !document.querySelector('.ch.ch-busy'); }", timeout=timeout)


def main():
    tmp = tempfile.mkdtemp(prefix='bsp-e2e-')
    db = os.path.join(tmp, 'main.db')
    started = []
    try:
        started.append(procs.start_mock(8799, os.path.join(tmp, 'mock.log')))
        main_srv = procs.start_server(8787, os.path.join(tmp, 'server.log'), db, 8799)
        started.append(main_srv)
        started.append(procs.start_server(8788, os.path.join(tmp, 'capped.log'), os.path.join(tmp, 'capped.db'), 8799, DAILY_CAP=0))
        started.append(procs.start_server(8789, os.path.join(tmp, 'nokey.log'), os.path.join(tmp, 'nokey.db'), 8799, key=None))
        for port in (8765, 8766):
            started.append(procs.Proc([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', REPO], os.path.join(tmp, f'static{port}.log'), ready_url=f'http://127.0.0.1:{port}/scripts/chat_test.html'))

        with sync_playwright() as pw:
            browser = pw.chromium.launch()

            # 1. Discovery, streaming and the "hosted" label.
            ctx = browser.new_context()
            page = ctx.new_page()
            chat_res = []
            page.on('response', lambda r: chat_res.append(r) if r.url.endswith('/chat') else None)
            page.goto(page_url('http://127.0.0.1:8787', OPEN_Q))
            wait_answer(page)
            labels = page.eval_on_selector_all('.ch-eng, .ch-engine-t', 'els => els.map(e => e.textContent.trim())')
            answer = page.inner_text('.ch-turn.bot .ch-answer')
            check('health discovery shows the Claude engine', any(l.strip() == 'Claude' for l in labels), '; '.join(labels))
            check('streamed text renders in the answer', 'Short answer' in answer and 'covenant headroom' in answer and 'SECRET-THINKING' not in answer, answer[:90].replace('\n', ' '))
            check('/chat answered 200 text/event-stream', chat_res and chat_res[0].status == 200 and chat_res[0].headers.get('content-type', '').startswith('text/event-stream'))

            # 2. Feedback from the answer's thumbs-up lands in SQLite.
            with page.expect_response(lambda r: r.url.endswith('/feedback')) as fr:
                page.click('.ch-turn.bot [data-act="good"]')
            fb = fr.value
            fbody = fb.json()
            with sqlite3.connect(db) as con:
                row = con.execute('SELECT rating, question FROM feedback WHERE id = ?', (fbody.get('id'),)).fetchone()
            check('feedback POST returns ok and lands in SQLite', fb.status == 201 and fbody.get('ok') is True and row == (1, OPEN_Q), f'{fb.status} {fbody} row={row}')

            # 3. Stop aborts the stream; the server logs the cancel.
            before = main_srv.text().count('visitor disconnected')
            p2 = ctx.new_page()
            p2.goto(page_url('http://127.0.0.1:8787', OPEN_Q + ' [mock:slow]'))
            p2.wait_for_function("() => /Short/.test(document.querySelector('.ch-turn.bot .ch-answer')?.textContent || '')", timeout=20000)
            p2.click('button[aria-label="Stop generating"]')
            wait_answer(p2)
            stopped_text = p2.inner_text('.ch-turn.bot .ch-answer')
            t0 = time.time()
            while time.time() - t0 < 5 and main_srv.text().count('visitor disconnected') == before:
                time.sleep(0.1)
            log_line = [l for l in main_srv.text().splitlines() if 'visitor disconnected' in l][-1:] or ['']
            check('Stop aborts the stream (UI shows Stopped)', 'Stopped' in stopped_text and 'Next actions' not in stopped_text, stopped_text[-60:].replace('\n', ' '))
            check('server logs the cancel', main_srv.text().count('visitor disconnected') == before + 1, log_line[0].split('bsp: ')[-1])
            p2.close()

            # 4. Thread save (full assistant) and load round-trip.
            p3 = ctx.new_page()
            with p3.expect_response(lambda r: r.url.endswith('/thread') and r.request.method == 'POST', timeout=30000) as tr:
                p3.goto(page_url('http://127.0.0.1:8787', OPEN_Q, page='assistant.html'))
            saved = tr.value.json()
            loaded = p3.evaluate("async id => { const { Backend } = await import('/assets/backend.js'); return await Backend.loadThread(id); }", saved.get('thread_id'))
            with sqlite3.connect(db) as con:
                drow = con.execute('SELECT messages_json FROM threads WHERE id = ?', (saved.get('thread_id'),)).fetchone()
            ok = saved.get('ok') and loaded and loaded['thread_id'] == saved['thread_id'] and loaded['messages'][0] == {'role': 'user', 'content': OPEN_Q} and drow and json.loads(drow[0]) == loaded['messages']
            check('thread save and load round-trip', ok, f"{saved.get('thread_id')}: {len(loaded['messages']) if loaded else 0} messages, title={loaded and loaded['title'][:40]!r}")

            # 5. /stats counts through the client.
            stats = p3.evaluate("async () => { const { Backend } = await import('/assets/backend.js'); return await Backend.stats(); }")
            check('/stats returns counts', stats and stats['threads'] >= 1 and stats['feedback'] >= 1 and stats['today']['requests'] >= 3, json.dumps({k: stats[k] for k in ('threads', 'messages', 'feedback', 'feedback_up', 'today')}))
            p3.close()

            # 6. CORS: allowed from the site's origin, refused from another origin.
            pre_ok = page.evaluate("""async () => { const r = await fetch('http://127.0.0.1:8787/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: -1, question: 'cors check' }) }); return r.status; }""")
            check('CORS preflight passes for an allowed origin (127.0.0.1:8765)', pre_ok == 201, f'status {pre_ok}')
            other = ctx.new_page()
            other.goto('http://127.0.0.1:8766/scripts/chat_test.html?backend=off')
            bad = other.evaluate("""async () => { try { const r = await fetch('http://127.0.0.1:8787/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) }); return 'status ' + r.status; } catch (e) { return 'blocked: ' + e.message; } }""")
            check('CORS preflight fails for another origin (127.0.0.1:8766)', bad.startswith('blocked'), bad)
            other.close()
            import httpx
            r = httpx.options('http://127.0.0.1:8787/chat', headers={'Origin': 'https://syedr64.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
            r2 = httpx.options('http://127.0.0.1:8787/chat', headers={'Origin': 'https://example.com', 'Access-Control-Request-Method': 'POST'})
            check('preflight: GitHub Pages origin 204, other origin 403', r.status_code == 204 and r.headers.get('access-control-allow-origin') == 'https://syedr64.github.io' and r2.status_code == 403, f'{r.status_code} / {r2.status_code}')

            # 7. Daily cap: the Worker's 429 daily_cap error, shown to the visitor in plain words.
            p4 = ctx.new_page()
            capped = []
            p4.on('response', lambda r: capped.append(r) if r.url.endswith('/chat') else None)
            p4.goto(page_url('http://127.0.0.1:8788', OPEN_Q))
            wait_answer(p4)
            cbody = capped[0].json() if capped else {}
            warn = p4.inner_text('.ch-turn.bot .ch-answer')
            check('daily cap returns the Worker error', capped and capped[0].status == 429 and cbody.get('error') == 'daily_cap' and cbody.get('scope') == 'global', json.dumps(cbody)[:160])
            check('daily cap message shown to the visitor', "reached today's limit for this site" in warn, warn.split('\n')[0][:120])
            p4.close()

            # 8. Missing ANTHROPIC_API_KEY: llm:false on /health, a clear error on /chat.
            p5 = ctx.new_page()
            p5.goto(page_url('http://127.0.0.1:8789', OPEN_Q))
            wait_answer(p5)
            h = p5.evaluate("async () => (await fetch('http://127.0.0.1:8789/health')).json()")
            raw = p5.evaluate("""async () => { const r = await fetch('http://127.0.0.1:8789/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) }); return { status: r.status, body: await r.json() }; }""")
            client_err = p5.evaluate("""async () => { const { Backend } = await import('/assets/backend.js'); try { for await (const t of Backend.chat({ question: 'x' })) {} return 'no error'; } catch (e) { return e.code + ': ' + e.message; } }""")
            labels5 = p5.eval_on_selector_all('.ch-eng, .ch-engine-t', 'els => els.map(e => e.textContent.trim())')
            check('missing key: /health llm false', h.get('ok') is True and h.get('llm') is False, json.dumps(h))
            check('missing key: /chat clear error', raw['status'] == 503 and raw['body'].get('error') == 'no_model_key', f"{raw['status']} {raw['body'].get('message')} | client: {client_err}")
            check('missing key: page falls back to grounded answers', not any(l.strip() == 'Claude' for l in labels5), '; '.join(labels5))
            p5.close()
            browser.close()
    finally:
        for p in reversed(started):
            p.stop()
    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} browser checks passed' + (f'; failed: {failed}' if failed else ''))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
