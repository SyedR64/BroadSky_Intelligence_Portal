"""
Browser check: the unchanged site client (assets/backend.js + chat.js) against this backend.

Starts the mock Claude API, the backend (FAKE_ANTHROPIC_URL), a capped backend (DAILY_CAP=0), a backend with no Claude key, a backend
whose key check fails, the static site and a second origin, each on a free port of its own (so two runs on one machine never share a server),
drives scripts/chat_test.html and assistant.html in headless Chromium (Playwright), prints one line per
check, and stops everything it started.

  cd server && python3 tests/e2e_browser.py
  (needs the server requirements and Playwright in the same Python, e.g.
   uv run --no-project --python 3.12 --with-requirements requirements-dev.txt --with playwright python tests/e2e_browser.py)

Section 9 covers routing: every suggested prompt keeps its route (tests/prompt_routes.json), questions about the view on screen go to the
research assistant with the view's text (3D map storm scene), and the fallbacks when it is off or refuses.
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
# Every server gets a free port: fixed ports let a second run (or a stale server) answer in place of this run's own.
PORTS = {k: procs.free_port() for k in ('mock', 'main', 'capped', 'nokey', 'badkey', 'site', 'other')}
MOCK, MAIN, CAPPED, NOKEY, BADKEY, SITE, OTHER = (f'http://127.0.0.1:{PORTS[k]}' for k in ('mock', 'main', 'capped', 'nokey', 'badkey', 'site', 'other'))
OPEN_Q = 'What questions should an operating partner ask a new CFO?'
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)


def page_url(backend, q, page='scripts/chat_test.html'):
    return f'{SITE}/{page}?backend={urllib.parse.quote(backend, safe=":/")}&q={urllib.parse.quote(q)}'


def goto(page, url, tries=3):
    """page.goto with a retry: the one-process static server now and then resets a connection under a burst of module requests."""
    for k in range(tries):
        try:
            return page.goto(url)
        except Exception as e:   # noqa: BLE001
            if k == tries - 1:
                raise
            print(f'      (retrying {url[:80]}: {str(e).splitlines()[0][:80]})', flush=True)
            time.sleep(0.5)


def poll(fn, timeout=8.0, every=0.1):
    """Call fn until it returns something truthy or the time runs out; returns the last value."""
    t0 = time.time()
    v = fn()
    while not v and time.time() - t0 < timeout:
        time.sleep(every)
        v = fn()
    return v


def chip_prompts():
    """Every follow-up chip written as a plain string in assets/chat.js (followups: ['...', "..."]); chips built from data are skipped."""
    import re
    src = open(os.path.join(REPO, 'assets', 'chat.js'), encoding='utf-8').read()
    out = []
    for m in re.finditer(r'followups: \[', src):
        i, depth, quote, start = m.end(), 1, '', -1
        while i < len(src) and depth:
            c = src[i]
            if quote:
                if c == '\\':
                    i += 1
                elif c == quote:
                    if quote != '`':
                        out.append(src[start:i].replace("\\'", "'"))
                    quote = ''
            elif c in '\'"`':
                quote, start = c, i + 1
            elif c == '[':
                depth += 1
            elif c == ']':
                depth -= 1
            i += 1
    return sorted({q for q in out if ' ' in q})


def wait_answer(page, timeout=30000):
    page.wait_for_function("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); return t && t._rec && !document.querySelector('.ch.ch-busy'); }", timeout=timeout)


def main():
    tmp = tempfile.mkdtemp(prefix='bsp-e2e-')
    db = os.path.join(tmp, 'main.db')
    started = []
    try:
        started.append(procs.start_mock(PORTS['mock'], os.path.join(tmp, 'mock.log')))
        own = {'ALLOWED_ORIGINS': SITE}   # the backends allow this run's site address (and the site's public addresses), not the second origin
        main_srv = procs.start_server(PORTS['main'], os.path.join(tmp, 'server.log'), db, PORTS['mock'], BLOB_READ_WRITE_TOKEN='vercel_blob_rw_e2estore_notarealsecret', VERCEL_BLOB_API_URL=MOCK + '/blob', **own)
        started.append(main_srv)
        started.append(procs.start_server(PORTS['capped'], os.path.join(tmp, 'capped.log'), os.path.join(tmp, 'capped.db'), PORTS['mock'], DAILY_CAP=0, **own))
        started.append(procs.start_server(PORTS['nokey'], os.path.join(tmp, 'nokey.log'), os.path.join(tmp, 'nokey.db'), PORTS['mock'], key=None, **own))
        # its key check is made to fail, then to pass again (section 8b); a new check is allowed every second
        started.append(procs.start_server(PORTS['badkey'], os.path.join(tmp, 'badkey.log'), os.path.join(tmp, 'badkey.db'), PORTS['mock'], HEALTH_PROBE_SECONDS=1, **own))
        for k in ('site', 'other'):
            started.append(procs.start_static(PORTS[k], os.path.join(tmp, f'static-{k}.log'), REPO, '/scripts/chat_test.html'))

        with sync_playwright() as pw:
            browser = pw.chromium.launch()

            # 1. Discovery, streaming and the "hosted" label.
            ctx = browser.new_context()
            page = ctx.new_page()
            chat_res = []
            page.on('response', lambda r: chat_res.append(r) if r.url.endswith('/chat') else None)
            goto(page, page_url(MAIN, OPEN_Q))
            wait_answer(page)
            labels = page.eval_on_selector_all('.ch-eng, .ch-engine-t', 'els => els.map(e => e.textContent.trim())')
            answer = page.inner_text('.ch-turn.bot .ch-answer')
            check('health discovery shows the deep-research engine', any(l.strip() == 'Deep research' for l in labels), '; '.join(labels))
            check('streamed text renders in the answer', 'Short answer' in answer and 'covenant headroom' in answer and 'SECRET-THINKING' not in answer, answer[:90].replace('\n', ' '))
            check('/chat answered 200 text/event-stream', chat_res and chat_res[0].status == 200 and chat_res[0].headers.get('content-type', '').startswith('text/event-stream'))

            # 1b. The chat log: the research agent's answer is saved on the server, with the page it was asked on.
            import httpx
            stored = [json.loads(v['body']) for k, v in httpx.get(MOCK + '/_blobs').json().items() if k.startswith('chats/')]
            srv = [r for r in stored if r.get('question') == OPEN_Q and r.get('source') == 'server']
            check('chat log keeps the hosted answer', srv and 'covenant headroom' in srv[0]['answer'] and srv[0]['thinking'] and 'chat_test.html' in srv[0]['page'] and srv[0]['outcome'] == 'answered',
                  json.dumps({k: srv[0][k] for k in ('page', 'outcome', 'model', 'tokens')}) if srv else f'{len(stored)} records')

            # 2. Feedback from the answer's thumbs-up lands in SQLite.
            with page.expect_response(lambda r: r.url.endswith('/feedback')) as fr:
                page.click('.ch-turn.bot [data-act="good"]')
            fb = fr.value
            fbody = fb.json()
            def fb_row():
                with sqlite3.connect(db) as con:
                    return con.execute('SELECT rating, question FROM feedback WHERE id = ?', (fbody.get('id'),)).fetchone()
            row = poll(fb_row)
            check('feedback POST returns ok and lands in SQLite', fb.status == 201 and fbody.get('ok') is True and row == (1, OPEN_Q), f'{fb.status} {fbody} row={row}')

            # 3. Stop aborts the stream; the server logs the cancel.
            before = main_srv.text().count('visitor disconnected')
            p2 = ctx.new_page()
            goto(p2, page_url(MAIN, OPEN_Q + ' [mock:slow]'))
            p2.wait_for_function("() => /Short/.test(document.querySelector('.ch-turn.bot .ch-answer')?.textContent || '')", timeout=20000)
            p2.click('button[aria-label="Stop generating"]')
            wait_answer(p2)
            stopped_text = p2.inner_text('.ch-turn.bot .ch-answer')
            poll(lambda: main_srv.text().count('visitor disconnected') > before, 15)
            log_line = [l for l in main_srv.text().splitlines() if 'visitor disconnected' in l][-1:] or ['']
            check('Stop aborts the stream (UI shows Stopped)', 'Stopped' in stopped_text and 'Next actions' not in stopped_text, stopped_text[-60:].replace('\n', ' '))
            check('server logs the cancel', main_srv.text().count('visitor disconnected') == before + 1, log_line[0].split('bsp: ')[-1])
            p2.close()

            # 4. Thread save (full assistant) and load round-trip.
            p3 = ctx.new_page()
            with p3.expect_response(lambda r: r.url.endswith('/thread') and r.request.method == 'POST', timeout=30000) as tr:
                goto(p3, page_url(MAIN, OPEN_Q, page='assistant.html'))
            saved = tr.value.json()
            loaded = poll(lambda: p3.evaluate("async id => { const { Backend } = await import('/assets/backend.js'); try { return await Backend.loadThread(id); } catch { return null; } }", saved.get('thread_id')))

            def thread_row():
                with sqlite3.connect(db) as con:
                    return con.execute('SELECT messages_json FROM threads WHERE id = ?', (saved.get('thread_id'),)).fetchone()
            drow = poll(thread_row)
            ok = saved.get('ok') and loaded and loaded['thread_id'] == saved['thread_id'] and loaded['messages'][0] == {'role': 'user', 'content': OPEN_Q} and drow and json.loads(drow[0]) == loaded['messages']
            check('thread save and load round-trip', ok, f"{saved.get('thread_id')}: {len(loaded['messages']) if loaded else 0} messages, title={loaded and loaded['title'][:40]!r}")

            # 5. /stats counts through the client.
            stats = p3.evaluate("async () => { const { Backend } = await import('/assets/backend.js'); return await Backend.stats(); }")
            # 5b. An answer built in the browser (portfolio data) reaches the chat log through POST /log.
            p6 = ctx.new_page()
            grounded_q = 'Which is the largest portfolio company by revenue?'
            with p6.expect_response(lambda r: r.url.endswith('/log'), timeout=30000) as lr:
                goto(p6, page_url(MAIN, grounded_q))
            t0 = time.time()
            local = []
            while time.time() - t0 < 5 and not local:
                local = [json.loads(v['body']) for k, v in httpx.get(MOCK + '/_blobs').json().items() if k.startswith('chats/') and json.loads(v['body']).get('question') == grounded_q]
                time.sleep(0.1)
            rec = local[0] if local else {}
            check('chat log keeps answers built in the browser', lr.value.status == 202 and rec.get('source') == 'browser' and rec.get('kind') == 'grounded' and rec.get('intent') == 'sizes' and len(rec.get('answer', '')) > 40 and '\n' in rec.get('answer', ''),
                  json.dumps({k: rec.get(k) for k in ('kind', 'intent', 'engine', 'seconds')}) + ' ' + rec.get('answer', '')[:60].replace('\n', ' / '))
            p6.close()
            check('/stats returns counts', stats and stats['threads'] >= 1 and stats['feedback'] >= 1 and stats['today']['requests'] >= 3, json.dumps({k: stats[k] for k in ('threads', 'messages', 'feedback', 'feedback_up', 'today')}))
            p3.close()

            # 6. CORS: allowed from the site's origin, refused from another origin.
            pre_ok = page.evaluate("""async () => { const r = await fetch('__MAIN__/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: -1, question: 'cors check' }) }); return r.status; }""".replace('__MAIN__', MAIN))
            check('CORS preflight passes for an allowed origin (the site under test)', pre_ok == 201, f'status {pre_ok}')
            other = ctx.new_page()
            goto(other, OTHER + '/scripts/chat_test.html?backend=off')
            bad = other.evaluate("""async () => { try { const r = await fetch('__MAIN__/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) }); return 'status ' + r.status; } catch (e) { return 'blocked: ' + e.message; } }""".replace('__MAIN__', MAIN))
            check('CORS preflight fails for another origin (a second local address)', bad.startswith('blocked'), bad)
            other.close()
            r = httpx.options(MAIN + '/chat', headers={'Origin': 'https://syedr64.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
            r2 = httpx.options(MAIN + '/chat', headers={'Origin': 'https://example.com', 'Access-Control-Request-Method': 'POST'})
            check('preflight: GitHub Pages origin 204, other origin 403', r.status_code == 204 and r.headers.get('access-control-allow-origin') == 'https://syedr64.github.io' and r2.status_code == 403, f'{r.status_code} / {r2.status_code}')

            # 7. Daily cap: the Worker's 429 daily_cap error, shown to the visitor in plain words.
            p4 = ctx.new_page()
            capped = []
            p4.on('response', lambda r: capped.append(r) if r.url.endswith('/chat') else None)
            goto(p4, page_url(CAPPED, OPEN_Q))
            wait_answer(p4)
            cbody = capped[0].json() if capped else {}
            warn = p4.inner_text('.ch-turn.bot .ch-answer')
            check('daily cap returns the Worker error', capped and capped[0].status == 429 and cbody.get('error') == 'daily_cap' and cbody.get('scope') == 'global', json.dumps(cbody)[:160])
            check('daily cap message shown to the visitor', "reached today's limit for this site" in warn, warn.split('\n')[0][:120])
            p4.close()

            # 8. Missing ANTHROPIC_API_KEY: llm:false on /health, a clear error on /chat.
            p5 = ctx.new_page()
            goto(p5, page_url(NOKEY, OPEN_Q))
            wait_answer(p5)
            h = p5.evaluate("async () => (await fetch('__NOKEY__/health')).json()".replace('__NOKEY__', NOKEY))
            raw = p5.evaluate("""async () => { const r = await fetch('__NOKEY__/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) }); return { status: r.status, body: await r.json() }; }""".replace('__NOKEY__', NOKEY))
            client_err = p5.evaluate("""async () => { const { Backend } = await import('/assets/backend.js'); try { for await (const t of Backend.chat({ question: 'x' })) {} return 'no error'; } catch (e) { return e.code + ': ' + e.message; } }""")
            labels5 = p5.eval_on_selector_all('.ch-eng, .ch-engine-t', 'els => els.map(e => e.textContent.trim())')
            check('missing key: /health llm false', h.get('ok') is True and h.get('llm') is False, json.dumps(h))
            check('missing key: /chat clear error', raw['status'] == 503 and raw['body'].get('error') == 'no_model_key', f"{raw['status']} {raw['body'].get('message')} | client: {client_err}")
            check('missing key: page falls back to grounded answers', not any(l.strip() == 'Deep research' for l in labels5), '; '.join(labels5))
            p5.close()

            # 8b. The assistant header. "Online" when live answers work; "Limited" when the backend has no key, or has a key the provider
            #     rejects. /health alone cannot know that on a fresh instance ("unverified"), so the page asks for the key check once.
            import httpx as _hx
            hctx = browser.new_context()   # its own storage, so the backend picked here does not leak into later sections

            def header(backend, limited):
                pg = hctx.new_page()
                deep = []
                pg.on('response', lambda r: deep.append(r.url) if '/health?deep=1' in r.url else None)
                goto(pg, f'{SITE}/app.html?backend={urllib.parse.quote(backend, safe=":/")}#/home/overview')
                pg.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
                pg.click('.ch-floating .ch-launch')
                pg.wait_for_selector('.ch-head .ch-state', state='attached', timeout=15000)
                poll(lambda: pg.evaluate("() => !!document.querySelector('.ch.ch-limited')") if limited else pg.evaluate("() => [...document.querySelectorAll('.ch-engine-t')].some(e => e.textContent.trim() === 'Deep research')"), timeout=15)
                out = pg.evaluate("() => ({ text: [...document.querySelectorAll('.ch-state')].map(e => e.textContent.trim()), tip: document.querySelector('.ch-state')?.title || '', cls: !!document.querySelector('.ch.ch-limited'), labels: [...document.querySelectorAll('.ch-engine-t')].map(e => e.textContent.trim()) })")
                pg.close()
                return out, deep

            st_ok, _ = header(MAIN, False)
            check('working backend: the header says Online', st_ok['text'] and all(t == 'Online' for t in st_ok['text']) and not st_ok['cls'] and 'Deep research' in st_ok['labels'], json.dumps(st_ok))
            st_nk, _ = header(NOKEY, True)
            check('missing key: the header says Limited, with the reason on hover', st_nk['cls'] and st_nk['text'] and all(t == 'Limited' for t in st_nk['text']) and 'Live answers are unavailable' in st_nk['tip'], json.dumps(st_nk))
            _hx.post(MOCK + '/_probe', json={'mode': 'auth'})
            try:
                first = _hx.get(BADKEY + '/health').json()
                st_bad, deep = header(BADKEY, True)
                h6 = _hx.get(BADKEY + '/health').json()
                check('rejected key: the page asks for one key check', len(deep) == 1 and first.get('llm_state') == 'unverified', f'{len(deep)} deep checks; /health first said {first.get("llm_state")}')
                check('rejected key: /health reports it and llm is false', h6.get('llm') is False and h6.get('llm_state') == 'auth' and h6['model_state']['source'] == 'probe', json.dumps(h6.get('model_state'))[:200])
                check('rejected key: the header says Limited and the engine is the portfolio data', st_bad['cls'] and st_bad['text'] and all(t == 'Limited' for t in st_bad['text']) and 'Deep research' not in st_bad['labels'], json.dumps(st_bad))
            finally:
                _hx.post(MOCK + '/_probe', json={'mode': 'ok'})
            # The key is fixed (no redeploy, no successful question): the instance still reports the failure, and the page asks it to check again.
            time.sleep(1.2)
            before = _hx.get(BADKEY + '/health').json()
            st_fix, deep2 = header(BADKEY, False)
            after = _hx.get(BADKEY + '/health').json()
            check('fixed key: the page asks for the key check again and the header goes back to Online', before.get('llm') is False and before.get('llm_state') == 'auth' and len(deep2) == 1 and after.get('llm') is True and after.get('llm_state') == 'ok'
                  and st_fix['text'] and all(t == 'Online' for t in st_fix['text']) and not st_fix['cls'] and 'Deep research' in st_fix['labels'], json.dumps({'before': before.get('llm_state'), 'deep checks': len(deep2), 'after': after.get('llm_state'), 'header': st_fix['text']}))
            hctx.close()

            # 9. Routing. Every suggested prompt on index.html, assistant.html and the portal panel keeps its route (tests/prompt_routes.json).
            snapshot = json.load(open(os.path.join(procs.TESTS_DIR, 'prompt_routes.json'), encoding='utf-8'))
            expected = snapshot['routes']
            prompts = {}

            def collect(url, where, launch=False):
                pg = ctx.new_page()
                goto(pg, url)
                pg.wait_for_selector('.ch-floating .ch-launch' if launch else '.ch [data-prompt]', timeout=30000)
                if launch:
                    pg.click('.ch-floating .ch-launch')
                    pg.wait_for_selector('.ch-floating [data-prompt]', timeout=15000)
                for q in pg.evaluate("() => [...document.querySelectorAll('[data-ask]')].map(e => e.dataset.ask).concat([...document.querySelectorAll('.ch [data-prompt]')].map(e => e.dataset.prompt)).filter(Boolean)"):
                    prompts.setdefault(q, set()).add(where)
                return pg

            collect(SITE + '/index.html?backend=off', 'index').close()
            collect(SITE + '/assistant.html?backend=off', 'assistant').close()
            pr = collect(SITE + '/app.html?backend=off#/home/overview', 'portal panel', launch=True)
            for q in pr.evaluate("async () => (await import('/assets/chat.js')).PERSONAS.portal.suggestions"):
                prompts.setdefault(q, set()).add('portal list')
            route_js = """async qs => { const { Chat } = await import('/assets/chat.js'); return qs.map(q => { const on = Chat.route(q, { hosted: true }), off = Chat.route(q, { hosted: false }); return [q, `${on.to}:${on.intent || '-'}`, `${off.to}:${off.intent || '-'}`, on.why]; }); }"""
            got = {q: on for q, on, _, _ in pr.evaluate(route_js, sorted(prompts))}
            moved = [f'{q!r}: {expected.get(q)} -> {r}' for q, r in got.items() if expected.get(q) != r]
            check(f'all {len(got)} suggested prompts keep their route', len(got) >= 25 and not moved and all(any(w in v for w in ('index', 'assistant', 'portal panel')) or 'portal list' in v for v in prompts.values()),
                  '; '.join(moved) or ', '.join(f'{w} {sum(w in v for v in prompts.values())}' for w in ('index', 'assistant', 'portal panel', 'portal list')))

            # 9a. Follow-up chips (the buttons under an answer) keep their route too.
            chips = chip_prompts()
            got = {q: on for q, on, _, _ in pr.evaluate(route_js, chips)}
            moved = [f'{q!r}: {snapshot["followups"].get(q)} -> {r}' for q, r in got.items() if snapshot['followups'].get(q) != r]
            check(f'all {len(got)} follow-up chips keep their route', len(got) >= 50 and not moved and got.get('Show the storm history for Ocean County') == 'grounded:nav', '; '.join(moved) or f"storm history chip -> {got.get('Show the storm history for Ocean County')}")

            # 9b. The router: a question about the view goes to the research assistant; "portfolio" alone no longer means the overview.
            VIEW_Q = "what does this mean that I'm seeing about severe weather for the portfolio?"
            table = {r[0]: r[1:] for r in pr.evaluate(route_js, [
                VIEW_Q, 'Which companies are in the portfolio?', "What's in the portfolio?", 'Show me the portfolio', 'Which companies does BSP own?',
                'How is the portfolio doing on hiring?', "What do this week's storms mean for Punctual Pros?", 'Is there severe weather anywhere in the portfolio?',
                'What am I looking at?', 'Explain this map', 'Why is Lancaster highlighted?', 'What is the bar for an add-on?', "Who is BSP's CEO?"])}
            check('view question: research assistant first, portfolio-wide weather as the fallback', table[VIEW_Q] == ['hosted:weather_all', 'grounded:weather_all', 'view'], str(table[VIEW_Q]))
            want = {'Which companies are in the portfolio?': 'grounded:portfolio', "What's in the portfolio?": 'grounded:portfolio', 'Show me the portfolio': 'grounded:portfolio',
                    'Which companies does BSP own?': 'grounded:portfolio', 'How is the portfolio doing on hiring?': 'open:-', "What do this week's storms mean for Punctual Pros?": 'grounded:weather',
                    'Is there severe weather anywhere in the portfolio?': 'grounded:weather_all', 'What am I looking at?': 'hosted:-', 'Explain this map': 'hosted:-',
                    'Why is Lancaster highlighted?': 'hosted:-', 'What is the bar for an add-on?': 'grounded:addons', "Who is BSP's CEO?": 'open:-'}
            bad = [f'{q!r}: {table[q][0]} (want {w})' for q, w in want.items() if table[q][0] != w]
            check('portfolio overview only for portfolio questions; view and weather questions routed', not bad, '; '.join(bad) or f'{len(want)} questions')

            # 9b-2. What the three new routes must leave alone. Each row: question -> route with the research assistant live and a view behind
            # the assistant (the widest case). A weather word, the word "this" or the word "portfolio" is not enough to take a question.
            keep = {
                # weather words used as a verb or an idiom: not weather questions
                'Can Thomas Scientific weather tariffs?': 'open:-', 'Can the portfolio weather higher interest rates?': 'open:-', 'How did CET weather the 2020 downturn?': 'open:-',
                'Can Frontline weather the loss of a big client?': 'open:-', 'How will Fair Harbor weather tariffs on imports?': 'open:-', 'Did Thomas Scientific weather COVID well?': 'open:-',
                'Is this a perfect storm for HVAC rollups?': 'open:-', 'Is PE money flooding into home services?': 'open:-', 'Will rivals take the market by storm?': 'grounded:pe',
                # a storm mentioned in a question another intent answers
                'Which add-on targets are in hurricane zones?': 'grounded:addons', 'Which add-on targets are most exposed to storms?': 'grounded:addons', 'Which CET bids involve storm hardening?': 'grounded:cet_due',
                'Which CET opportunities are storm-hardening or resilience projects?': 'grounded:cet_due', 'Are there FEMA flooding grants CET can bid on?': 'grounded:cet_due',
                'Which CET bids are due in the next 30 days after the snow?': 'grounded:cet_due', 'pump station storm damage bids': 'grounded:wastewater', 'Which treatment plants are at risk of flooding?': 'grounded:wastewater',
                'Estimate revenue lift from a hurricane for home services': 'grounded:fin', 'new-mover leads in Ocean County after the hurricane': 'grounded:movers', 'Home sales after the hurricane in Ocean County': 'grounded:movers',
                # navigation
                'Show the storm history for Ocean County': 'grounded:nav', 'Show me the weather view': 'grounded:nav', 'Open the weather page': 'grounded:nav', 'Open the storm scene on the 3D map': 'grounded:nav', 'take me to the storm map': 'grounded:nav',
                # Punctual Pros by content, not by name: its own weather answer
                'Storm impact this week across PA and NJ': 'grounded:weather', "What do this week's storms mean for demand across the territory?": 'grounded:weather',
                'How will the heat wave change service calls across our territory?': 'grounded:weather', "What does the storm mean for the company's service calls?": 'grounded:weather',
                'Does BSP track storm impact on service calls?': 'grounded:weather',
                # a company the portal tracks no alerts for
                'How does weather affect Fair Harbor swim sales?': 'open:-',
                # real portfolio-wide or CET weather questions
                'Are any storms hitting CET this week?': 'grounded:weather_all', 'Is there any severe weather right now?': 'grounded:weather_all', 'Show me the weather across the portfolio': 'grounded:weather_all',
                # every plain way of asking what BSP owns is the grounded overview
                'what are the portfolio companies': 'grounded:portfolio', 'who are the portfolio companies': 'grounded:portfolio', "What are BSP's portfolio companies?": 'grounded:portfolio',
                'What are the six portfolio companies?': 'grounded:portfolio', 'Which companies make up the portfolio?': 'grounded:portfolio', 'Which companies has BSP invested in?': 'grounded:portfolio',
                'what is the portfolio': 'grounded:portfolio', "what's the portfolio": 'grounded:portfolio', 'What is the BSP portfolio?': 'grounded:portfolio', "What's the current portfolio?": 'grounded:portfolio',
                'How many portfolio companies are there?': 'grounded:portfolio', 'Is it six or seven portfolio companies?': 'grounded:portfolio', 'describe the BSP portfolio': 'grounded:portfolio',
                'What platforms are in the portfolio?': 'grounded:portfolio', 'What platforms does BSP own?': 'grounded:portfolio', 'What does the portfolio look like this week?': 'grounded:portfolio',
                'Portfolio overview': 'grounded:portfolio', 'Name the portfolio companies': 'grounded:portfolio', "who's in the portfolio": 'grounded:portfolio',
                'How many portfolio companies have add-ons?': 'grounded:addons', 'How many companies are there in Lancaster County doing HVAC?': 'open:-',
                # "this", "that" and colour words in questions that are not about the screen
                'What does this mean for add-on targets in NJ?': 'grounded:addons', 'What does that tell us about the valuation multiple?': 'grounded:valuation', 'What does this say about PE rivals?': 'grounded:pe',
                'What does it mean for CET bids due this month?': 'grounded:cet_due', 'What does this show about revenue?': 'grounded:fin', 'Why are HVAC multiples raised by membership revenue?': 'grounded:valuation',
                'Why is debt raised at the holding company?': 'grounded:fin', 'Why are add-on targets in red states cheaper?': 'grounded:addons', 'Why are Blue Owl and Apollo flagged as rivals?': 'grounded:pe',
                'Why is Punctual Pros revenue flagged as an estimate?': 'grounded:fin', "What's this add-on target's revenue?": 'grounded:addons', "What's that in EBITDA terms?": 'grounded:fin',
                "what's that multiple based on": 'grounded:valuation', 'What does it mean to be an anchor company?': 'open:-', 'why is the yellow pages still a lead source for hvac': 'open:-', 'Why is Punctual Pros blue-chip?': 'open:-',
            }
            rows = pr.evaluate("""async qs => { const { Chat } = await import('/assets/chat.js'); return qs.map(q => { const r = Chat.route(q, { hosted: true }); return [q, `${r.to}:${r.intent || '-'}`, r.why]; }); }""", list(keep))
            bad = [f'{q!r}: {r} (want {keep[q]})' for q, r, _ in rows if r != keep[q]] + [f'{q!r}: treated as a view question' for q, _, why in rows if why == 'view']
            check(f'{len(keep)} questions the new routes must leave alone', not bad, '; '.join(bad) or 'weather verbs and idioms, storm mentions, navigation, Punctual Pros cues, portfolio phrasings, non-screen "this/that"')
            # Follow-ups still resolve against the last answer, and a page with no view behind the assistant has no view questions.
            extra = pr.evaluate("""async () => { const { Chat } = await import('/assets/chat.js'); const f = (q, o) => { const r = Chat.route(q, o); return `${r.to}:${r.intent || '-'}:${r.why}`; };
                return { fu_weather: f('what about storms in NJ', { hosted: true, ctx: { q: "What do this week's storms mean for Punctual Pros?", intent: 'weather', co: 'pp' } }),
                         fu_addons: f('So what does that mean for CET?', { hosted: true, ctx: { q: 'Top add-on targets for Punctual Pros', intent: 'addons', co: 'pp' } }),
                         no_view: f("what does this mean that I'm seeing about severe weather for the portfolio?", { hosted: true, view: false }),
                         no_view_open: f('What am I looking at?', { hosted: true, view: false }) }; }""")
            check('follow-ups resolve as before; no view questions without a view', extra == {'fu_weather': 'grounded:weather:intent', 'fu_addons': 'grounded:addons:intent', 'no_view': 'grounded:weather_all:intent', 'no_view_open': 'open:-:none'}, json.dumps(extra))
            pr.close()

            # 9c. The reported bug, on the 3D map's storm scene with the assistant docked: the question goes to the research assistant with the view's text.
            def ask_docked(pg, q):
                if not pg.query_selector('.ch-floating textarea'):
                    pg.click('.ch-floating .ch-launch')
                pg.wait_for_selector('.ch-floating textarea', timeout=15000)
                pg.fill('.ch-floating textarea', q)
                pg.press('.ch-floating textarea', 'Enter')
                pg.wait_for_selector('.ch-turn.bot', timeout=15000)
                wait_answer(pg, 60000)
                return pg.evaluate("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); return { kind: t._rec.kind, via: t._rec.via || '', intent: t._rec.intent || '', engine: t._rec.engine || '', text: t.querySelector('.ch-answer').innerText }; }")

            def open_storm(backend):
                pg = ctx.new_page()
                sent = []
                pg.on('request', lambda r: sent.append(json.loads(r.post_data or '{}')) if r.url.endswith('/chat') and r.method == 'POST' else None)
                goto(pg, f'{SITE}/app.html?backend={urllib.parse.quote(backend, safe=":/")}#/theater/play?scene=S5&autoplay=0')
                pg.wait_for_function("() => { const d = window.BSPView && window.BSPView.describe && window.BSPView.describe(); return d && d.headline && /alerts/i.test(d.lines.join(' ')) && !/still loading/.test(d.lines.join(' ')); }", timeout=60000)
                pg.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
                return pg, sent

            httpx.delete(MOCK + '/_requests')
            pm, sent = open_storm(MAIN)
            on_screen = pm.evaluate("() => ({ title: document.querySelector('.bsp-theater .bt-title').textContent.trim(), line: document.querySelector('.bsp-theater .bt-line').textContent.trim() })")
            a = ask_docked(pm, VIEW_Q)
            body = sent[-1] if sent else {}
            vc = (body.get('context') or [{}])[0]
            check('3D map view question is answered by the research assistant', a['kind'] == 'claude' and a['via'] == 'hosted' and a['engine'] == 'Deep research' and 'BSP: the portfolio today' not in a['text'], f"{a['kind']}/{a['via']} {a['engine']}: {a['text'][:60]!r}")
            check('the question carries the view on screen', len(body.get('context') or []) == 1 and vc.get('title', '').startswith('This view: 3D map') and on_screen['title'] in vc.get('text', '') and on_screen['line'][:60] in vc.get('text', '')
                  and 'Scene 5 of 6 on the 3D map: Storm' in vc['text'] and 'National Weather Service' in vc['text'] and 'Punctual Pros territory counties: ' in vc['text'],
                  f"title={vc.get('title')!r} · {len(vc.get('text', ''))} chars · on screen: {on_screen['title']!r}")
            check('view context is compact (under 1,500 tokens) and plain text', 200 < len(vc.get('text', '')) <= 3600 and '<' not in vc.get('text', '') and '@' not in vc.get('text', '') and vc.get('href', '') == 'app.html#/theater/play', f"{len(vc.get('text', ''))} chars ≈ {len(vc.get('text', '')) // 4} tokens, href={vc.get('href')!r}")
            print('      view context sent:\n' + '\n'.join('        ' + l[:200] for l in vc.get('text', '').splitlines()), flush=True)
            upstream = [r['body'] for r in httpx.get(MOCK + '/_requests').json() if VIEW_Q in json.dumps(r.get('body', {}))]
            first_msg = json.dumps(upstream[0]['messages'][-1]) if upstream else ''
            check('the model sees the view as source [1], with the rule to answer from it', upstream and '[1] This view: 3D map' in first_msg and '(from the page the visitor is on)' in first_msg and 'answer from that source first' in upstream[0]['system'][0]['text'], first_msg[:150])
            t0 = time.time()
            logged = []
            while time.time() - t0 < 5 and not logged:
                logged = [json.loads(v['body']) for k, v in httpx.get(MOCK + '/_blobs').json().items() if k.startswith('chats/') and json.loads(v['body']).get('question') == VIEW_Q and json.loads(v['body']).get('source') == 'server']
                time.sleep(0.1)
            check('chat log records a non-empty page context', logged and logged[0].get('page_context') and logged[0]['page_context'][0].startswith('This view: 3D map'), json.dumps(logged[0].get('page_context')) if logged else 'no record')
            # an ordinary hosted question from the docked panel carries the view too
            a2 = ask_docked(pm, OPEN_Q)
            check('every hosted question from a docked panel carries the view', a2['kind'] == 'claude' and len(sent) >= 2 and (sent[-1].get('context') or [{}])[0].get('title', '').startswith('This view: 3D map'), f"{a2['kind']}: {(sent[-1].get('context') or [{}])[0].get('title')!r}")
            pm.close()

            # 9d. Backend off: a relevant weather answer that says it could not read the view, never the portfolio overview.
            po, sent_off = open_storm('off')
            a = ask_docked(po, VIEW_Q)
            check('backend off: portfolio-wide weather answer, labelled as a fallback', a['kind'] == 'grounded' and a['intent'] == 'weather_all' and 'Weather across the portfolio' in a['text'] and "can't read this view" in a['text']
                  and 'BSP: the portfolio today' not in a['text'] and 'Punctual Pros' in a['text'] and 'CET' in a['text'] and not sent_off, a['text'][:230].replace('\n', ' / '))
            a = ask_docked(po, 'What am I looking at?')
            check('backend off, no grounded match: the view in its own words', a['kind'] == 'grounded' and a['intent'] == 'view' and 'On this view' in a['text'] and "can't read this view" in a['text'], a['text'][:200].replace('\n', ' / '))
            a = ask_docked(po, 'Is there severe weather anywhere in the portfolio?')
            check('portfolio weather answer: alerts for two companies, Fair Harbor seasonal, no "tracks no weather" line', a['intent'] == 'weather_all' and 'tracks live weather alerts for two companies' in a['text'] and "Fair Harbor's swim sales also move with spring weather" in a['text']
                  and 'tracks no weather' not in a['text'] and "can't read this view" not in a['text'], a['text'][:150].replace('\n', ' / '))
            a = ask_docked(po, 'Show the storm history for Ocean County')
            check('storm-history chip opens Weather & demand', a['intent'] == 'nav' and 'Opening' in a['text'] and 'Weather' in a['text'], a['text'][:80].replace('\n', ' / '))
            po.close()
            # 9d-2. The firm profile says six today, seven since launch, and the docked assistant sends that wording.
            pf = ctx.new_page()
            goto(pf, SITE + '/app.html?backend=off#/home/firm')
            pf.wait_for_function("() => /since launch/.test(document.querySelector('#content .sys-lead')?.textContent || '')", timeout=30000)
            firm = pf.evaluate("async () => { const { Chat } = await import('/assets/chat.js'); return { head: document.querySelector('#content .page-head').innerText, ctx: Chat.viewContext()?.text || '' }; }")
            check('firm profile: six companies today, seven since launch', '6 companies today, 7 since launch' in firm['head'] and '6 held · 7 since launch · 23 add-ons' in firm['head'] and '7 companies' not in firm['head'] and '7 companies' not in firm['ctx'] and '6 companies today' in firm['ctx'], firm['head'].replace('\n', ' / ')[-170:])
            pf.close()
            # 9d-3. A page in a folder names itself from the site root, and the link opens that page from anywhere.
            pd = ctx.new_page()
            goto(pd, SITE + '/redesigns/methodology.html?backend=off')
            pd.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
            nested = pd.evaluate("async () => { const { Chat } = await import('/assets/chat.js'); return Chat.viewContext()?.href; }")
            check('view link is relative to the site root', nested == './redesigns/methodology.html', repr(nested))
            pd.close()
            pd = ctx.new_page()
            sent_n = []
            pd.on('request', lambda r: sent_n.append(json.loads(r.post_data or '{}')) if r.url.endswith('/chat') and r.method == 'POST' else None)
            goto(pd, SITE + '/redesigns/methodology.html?backend=' + urllib.parse.quote(MAIN, safe=':/'))
            pd.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
            ask_docked(pd, 'What am I looking at?')
            src = pd.evaluate("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); return (t._rec.sources || []).map(s => [s.label, s.href]); }")
            view_src = [h for l, h in src if str(l).startswith('This view')]
            check('nested page: the server keeps the link and the answer opens the right page', sent_n and sent_n[-1]['context'][0]['href'] == './redesigns/methodology.html' and view_src == [SITE + '/redesigns/methodology.html'], f"sent {sent_n[-1]['context'][0]['href'] if sent_n else None!r}; source link {view_src}")
            pd.close()
            # 9e. Research assistant refuses (daily cap): the error, then the same honest fallback.
            pc, _ = open_storm(CAPPED)
            a = ask_docked(pc, VIEW_Q)
            check('research assistant fails: error shown, then the weather fallback', a['kind'] == 'grounded' and a['intent'] == 'weather_all' and "reached today's limit" in a['text'] and "can't read this view" in a['text'] and 'Weather across the portfolio' in a['text'], a['text'][:200].replace('\n', ' / '))
            pc.close()

            # 9f. Regressions: these questions go where they went before.
            def ask_inline(q, backend=MAIN):
                pg = ctx.new_page()
                sent = []
                pg.on('request', lambda r: sent.append(json.loads(r.post_data or '{}')) if r.url.endswith('/chat') and r.method == 'POST' else None)
                goto(pg, page_url(backend, q))
                pg.wait_for_selector('.ch-turn.bot', timeout=20000)
                wait_answer(pg, 60000)
                r = pg.evaluate("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); return { kind: t._rec.kind, via: t._rec.via || '', intent: t._rec.intent || '', text: t.querySelector('.ch-answer').innerText }; }")
                pg.close()
                return r, sent

            r, sent = ask_inline('Which companies are in the portfolio?')
            check('"Which companies are in the portfolio?" is the grounded overview', r['kind'] == 'grounded' and r['intent'] == 'portfolio' and 'BSP: the portfolio today' in r['text'] and 'six companies today, seven since the late-2021 launch' in r['text'] and '7 companies, 23 add-ons' not in r['text'] and not sent, r['text'][:200].replace('\n', ' / '))
            r, sent = ask_inline("What do this week's storms mean for Punctual Pros?")
            check('Punctual Pros storm question is the grounded Punctual Pros weather answer', r['kind'] == 'grounded' and r['intent'] == 'weather' and 'service-call pressure' in r['text'] and 'Next 7 days by hub' in r['text'] and not sent, r['text'][:120].replace('\n', ' / '))
            r, sent = ask_inline('Is there severe weather anywhere in the portfolio?')
            check('portfolio weather question is the grounded portfolio-wide answer', r['kind'] == 'grounded' and r['intent'] == 'weather_all' and 'Weather across the portfolio' in r['text'] and "can't read this view" not in r['text'] and not sent, r['text'][:160].replace('\n', ' / '))
            for q, label in (('Who leads BSP, and what did they do before?', 'who leads BSP'), ('What could BSP pay for CET and still earn 25% a year?', 'deal model'),
                             ("Who should get this month's new-homeowner mailer in Ocean County?", 'new-homeowner list'),
                             ('I got a call from 1800 Lambs Gap Road in Hampden Township, tell me what you know about the structure and what we can offer', 'property brief')):
                r, sent = ask_inline(q)
                check(f'{label}: research assistant, no view context from an inline assistant', r['kind'] == 'claude' and r['via'] == 'hosted' and len(sent) == 1 and sent[0].get('question') == q and sent[0].get('context') == [], f"{r['kind']}/{r['via']} context={len(sent[0].get('context') or []) if sent else 'not sent'}")
            # 9g. No view behind the assistant (inline and full-page): the usual route, and no note about reading a view.
            r, sent = ask_inline('What does this mean for add-on targets in NJ?', 'off')
            check('inline assistant, backend off: grounded answer without a view note', r['kind'] == 'grounded' and r['intent'] == 'addons' and 'this view' not in r['text'] and 'offline' not in r['text'], r['text'][:90].replace('\n', ' / '))
            pa = ctx.new_page()
            goto(pa, page_url('off', VIEW_Q, page='assistant.html'))
            pa.wait_for_selector('.ch-turn.bot', timeout=20000)
            wait_answer(pa, 60000)
            fa = pa.evaluate("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); return { intent: t._rec.intent || '', text: t.querySelector('.ch-answer').innerText }; }")
            check('assistant.html, backend off: the weather answer without a view note', fa['intent'] == 'weather_all' and 'Weather across the portfolio' in fa['text'] and 'this view' not in fa['text'] and 'BSP: the portfolio today' not in fa['text'], fa['text'][:90].replace('\n', ' / '))
            pa.close()
            for q in ('What are the portfolio companies?', 'How many portfolio companies are there?', 'What platforms does BSP own?'):
                r, sent = ask_inline(q, 'off')
                check(f'"{q}" is the grounded overview with the backend off', r['kind'] == 'grounded' and r['intent'] == 'portfolio' and 'BSP: the portfolio today' in r['text'] and not sent, r['text'][:60].replace('\n', ' / '))
            for q in ('Can Thomas Scientific weather tariffs?', 'How does weather affect Fair Harbor swim sales?'):
                r, sent = ask_inline(q, 'off')
                check(f'"{q}" is not answered with the weather table', r['intent'] != 'weather_all' and 'Weather across the portfolio' not in r['text'], f"{r['kind']}: {r['text'][:60]!r}".replace('\n', ' / '))

            # 10. Voice. Headless Chromium has no microphone and no speech engine, so the page gets a stand-in for both: the test "says" a
            #     question through the fake recogniser and reads back what the page would have spoken. Real recognition and real audio
            #     are not covered here.
            VOICE_STUB = """
            (() => {
              window.__spoken = []; window.__cancels = 0; window.__recs = []; window.__holdSpeech = false;
              class FakeRec {
                constructor() { window.__recs.push(this); this.active = false; this.starts = 0; }
                start() { this.active = true; this.starts++; }
                stop() { if (!this.active) return; this.active = false; setTimeout(() => this.onend && this.onend(), 0); }
                abort() { if (!this.active) return; this.active = false; this.aborted = true; setTimeout(() => this.onend && this.onend(), 0); }
                hear(text) { this.onresult && this.onresult({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
              }
              if (!window.__noRec) { window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec; }
              else { for (const k of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, k, { value: undefined, configurable: true, writable: true }); }
              window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.volume = 1; this.lang = ''; this.voice = null; } };
              const synth = { speaking: false, pending: false, q: [], addEventListener() {}, resume() {},
                getVoices() { return [{ name: 'Bells', lang: 'en-US' }, { name: 'Thomas', lang: 'fr-FR', default: true }, { name: 'Samantha', lang: 'en-US' }]; },
                speak(u) { window.__spoken.push({ text: u.text, voice: u.voice ? u.voice.name : null, lang: u.lang, volume: u.volume }); this.q.push(u); this.speaking = true;
                  if (!window.__holdSpeech || !u.text) setTimeout(() => { if (!this.q.includes(u)) return; this.q = this.q.filter(x => x !== u); this.speaking = this.q.length > 0; u.onend && u.onend({}); }, 5); },
                cancel() { window.__cancels++; const q = this.q; this.q = []; this.speaking = false; q.forEach(u => u.onerror && u.onerror({ error: 'canceled' })); } };
              Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
            })();
            """
            MD_JUNK = ('**', '__', '`', '](', 'http://', 'https://', 'www.', '#', '|')
            import re as _re

            def voice_page(url, no_rec=False, **ctx_opts):
                c = browser.new_context(**ctx_opts)
                if no_rec:
                    c.add_init_script('window.__noRec = true;')
                c.add_init_script(VOICE_STUB)
                pg = c.new_page()
                pg._errors = []
                pg._sent = []
                pg.on('pageerror', lambda e: pg._errors.append(str(e)))
                pg.on('request', lambda r: pg._sent.append(json.loads(r.post_data or '{}')) if r.url.endswith('/chat') and r.method == 'POST' else None)
                goto(pg, url)
                return c, pg

            def vstate(pg):
                return pg.evaluate("""() => { const m = document.querySelector('.ch-btn.mic'), b = document.querySelector('.ch-voice'), ta = document.querySelector('.ch textarea');
                    return { mic: !!m, pressed: m?.getAttribute('aria-pressed'), label: m?.getAttribute('aria-label'), disabled: m?.getAttribute('aria-disabled'), bar: b ? !b.hidden : false, text: b?.querySelector('.ch-voice-t')?.textContent || '',
                      live: b?.querySelector('.ch-voice-t')?.getAttribute('aria-live'), stop: b ? !b.querySelector('[data-a=voice-stop]').hidden : false, mute: b?.querySelector('[data-a=voice-mute]')?.getAttribute('aria-pressed') ?? null,
                      muteShown: b?.querySelector('[data-a=voice-mute]') ? !b.querySelector('[data-a=voice-mute]').hidden : false, ta: ta?.value || '', ph: ta?.placeholder || '',
                      open: window.__recs.filter(r => r.active).length, starts: window.__recs.reduce((a, r) => a + r.starts, 0), focus: document.activeElement?.className || document.activeElement?.tagName || '' }; }""")

            def spoken(pg):
                return [x for x in pg.evaluate('() => window.__spoken') if x['text'].strip()]

            def last_rec(pg):
                return pg.evaluate("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); const r = t._rec; return { kind: r.kind, via: r.via || '', voice: r.voice || '', intent: r.intent || '', text: t.querySelector('.ch-answer').innerText, cites: t.querySelectorAll('.ch-cites .ch-cite').length, sources: (r.sources || []).length }; }")

            def say(pg, text, stop=True):
                """Click the microphone, 'say' text, and (stop=True) click again to send."""
                n = pg.evaluate("() => document.querySelectorAll('.ch-turn.bot').length")
                pg.click('.ch-btn.mic')
                pg.evaluate('t => window.__recs.at(-1).hear(t)', text)
                if stop:
                    pg.click('.ch-btn.mic')
                    pg.wait_for_function('n => document.querySelectorAll(".ch-turn.bot").length > n', arg=n, timeout=15000)   # the new answer's turn is on the page

            norm = lambda t: _re.sub(r'\s+', ' ', t).strip()
            VQ = 'What should an operating partner ask a new CFO? [mock:md]'

            # 10a. The full assistant, research assistant live: listen only after a press, live transcript, one request with mode "voice".
            vc, vp = voice_page(SITE + '/assistant.html?backend=' + urllib.parse.quote(MAIN, safe=':/'))
            vp.wait_for_selector('.ch-btn.mic', timeout=30000)
            poll(lambda: vp.evaluate("() => [...document.querySelectorAll('.ch-engine-t')].some(e => e.textContent.trim() === 'Deep research')"), timeout=15)
            s0 = vstate(vp)
            check('voice: a labelled microphone button, and nothing listens before a press', s0['mic'] and s0['label'] == 'Ask by voice' and s0['pressed'] == 'false' and s0['starts'] == 0 and not s0['bar'] and s0['live'] == 'polite', json.dumps(s0))
            vp.focus('.ch-btn.mic')
            vp.keyboard.press('Enter')   # keyboard: Enter on the button starts listening
            s1 = vstate(vp)
            vp.evaluate("t => window.__recs.at(-1).hear(t)", VQ)
            s2 = vstate(vp)
            check('voice: pressing the microphone shows a listening state', s1['pressed'] == 'true' and s1['open'] == 1 and s1['bar'] and s1['text'].startswith('Listening') and s1['ph'] == 'Listening…' and s1['label'] == 'Stop listening and send', json.dumps(s1))
            check('voice: the live transcript shows in the composer', s2['ta'] == VQ, repr(s2['ta']))
            vp.keyboard.press('Enter')   # and Enter again sends
            vp.wait_for_selector('.ch-turn.bot', timeout=15000)
            wait_answer(vp, 60000)
            poll(lambda: not vstate(vp)['bar'], timeout=5)
            r1, sp1, s3 = last_rec(vp), spoken(vp), vstate(vp)
            body = vp._sent[-1] if vp._sent else {}
            check('voice: the request carries mode "voice" and the spoken question', len(vp._sent) == 1 and body.get('mode') == 'voice' and body.get('question') == VQ, json.dumps({k: body.get(k) for k in ('mode', 'question', 'persona')}))
            said = norm(' '.join(x['text'] for x in sp1))
            check('voice: the answer is spoken in sentence chunks, with a natural voice for the page language', len(sp1) >= 2 and all(x['voice'] == 'Samantha' and x['lang'] == 'en-US' and x['volume'] == 1 for x in sp1), json.dumps([[x['voice'], len(x['text'])] for x in sp1]))
            check('voice: spoken text has no markdown or citation markers', said and not _re.search(r'\[\d+\]', said) and not any(j in said for j in MD_JUNK) and '*' not in said, said[:160])
            check('voice: the screen shows the same text that was spoken, plus source chips', r1['kind'] == 'claude' and r1['via'] == 'hosted' and r1['voice'] == 'hosted' and norm(r1['text']) == said and r1['cites'] >= 1 and r1['cites'] <= r1['sources'], f"{r1['cites']} chips; screen={norm(r1['text'])[:70]!r} spoken={said[:70]!r}")
            check('voice: the microphone is closed after the answer and focus stays on the button', s3['open'] == 0 and s3['pressed'] == 'false' and 'mic' in s3['focus'] and s3['ta'] == '' and s3['ph'] != 'Listening…', json.dumps({k: s3[k] for k in ('open', 'pressed', 'focus', 'ph')}))
            up = [r['body'] for r in httpx.get(MOCK + '/_requests').json() if VQ in json.dumps(r.get('body', {}))]
            check('voice: the backend made one model call for it', len(up) == 1, f'{len(up)} upstream calls')

            # 10b. An ordinary typed question on the same page: no mode, nothing spoken.
            n_sp = len(vp.evaluate('() => window.__spoken'))
            vp.fill('.ch textarea', OPEN_Q)
            vp.press('.ch textarea', 'Enter')
            vp.wait_for_function("() => document.querySelectorAll('.ch-turn.bot').length >= 2", timeout=15000)
            wait_answer(vp, 60000)
            r2 = last_rec(vp)
            fmt2 = vp.evaluate("() => [...document.querySelectorAll('.ch-turn.bot')].at(-1).querySelectorAll('.ch-answer strong, .ch-answer b, .ch-answer h3, .ch-answer h4, .ch-answer li, .ch-answer a, .ch-answer .ch-ref').length")   # the thread holds the mock's markdown marker, so this answer is markdown: rendered, not stripped
            check('typed question unchanged: no voice mode, nothing spoken, markdown answer as before', len(vp._sent) == 2 and 'mode' not in vp._sent[-1] and vp._sent[-1].get('question') == OPEN_Q and len(vp.evaluate('() => window.__spoken')) == n_sp and r2['kind'] == 'claude' and not r2['voice'] and fmt2 >= 2,
                  json.dumps({'keys': sorted(vp._sent[-1].keys()), 'voice': r2['voice'], 'formatted elements': fmt2, 'spoken since': len(vp.evaluate('() => window.__spoken')) - n_sp}))

            # 10c. Stop: with speech still going, Stop cancels it; so does a new question, and so does leaving the view.
            vp.evaluate('() => { window.__holdSpeech = true; }')
            say(vp, VQ)
            poll(lambda: vstate(vp)['stop'], timeout=30)
            s4, c0 = vstate(vp), vp.evaluate('() => window.__cancels')
            vp.focus('.ch-voice [data-a="voice-stop"]')
            vp.keyboard.press('Enter')   # Stop from the keyboard
            s5, c1 = vstate(vp), vp.evaluate('() => window.__cancels')
            time.sleep(0.15)   # the browser moves focus off a hidden control a moment later: look after that
            f5 = vp.evaluate("() => ({ cls: document.activeElement?.className || document.activeElement?.tagName || '', visible: !!document.activeElement?.offsetParent })")
            wait_answer(vp, 60000)
            n_after = len(spoken(vp))
            time.sleep(0.4)
            check('voice: Stop cancels speech', s4['text'] == 'Speaking.' and s4['stop'] and c1 == c0 + 1 and not s5['stop'] and vp.evaluate('() => window.speechSynthesis.q.length') == 0 and len(spoken(vp)) == n_after, f"before={s4['text']!r} cancels {c0}->{c1}")
            check('voice: after Stop from the keyboard, focus is on the microphone button, not lost to the page', 'mic' in f5['cls'] and f5['visible'], json.dumps(f5))
            say(vp, VQ)
            poll(lambda: vstate(vp)['stop'], timeout=30)
            wait_answer(vp, 60000)
            c2 = vp.evaluate('() => window.__cancels')
            vp.fill('.ch textarea', 'Which companies are in the portfolio?')
            vp.press('.ch textarea', 'Enter')
            c3 = vp.evaluate('() => window.__cancels')
            wait_answer(vp, 60000)
            check('voice: a new question cancels speech', c3 == c2 + 1 and not vstate(vp)['stop'], f'cancels {c2}->{c3}')
            say(vp, VQ)
            poll(lambda: vstate(vp)['stop'], timeout=30)
            wait_answer(vp, 60000)
            c4 = vp.evaluate('() => window.__cancels')
            vp.evaluate("() => { location.hash = '#elsewhere'; }")
            poll(lambda: vp.evaluate('() => window.__cancels') > c4, timeout=3)
            check('voice: leaving the view cancels speech', vp.evaluate('() => window.__cancels') == c4 + 1 and not vstate(vp)['stop'], f"cancels {c4}->{vp.evaluate('() => window.__cancels')}")
            # Escape while listening closes the microphone without asking anything.
            n_sent = len(vp._sent)
            vp.click('.ch-btn.mic')
            vp.evaluate("t => window.__recs.at(-1).hear(t)", 'never mind')
            vp.keyboard.press('Escape')
            time.sleep(0.3)
            s6 = vstate(vp)
            check('voice: Escape closes the microphone and sends nothing', s6['open'] == 0 and s6['pressed'] == 'false' and len(vp._sent) == n_sent and s6['ta'] == '', json.dumps({k: s6[k] for k in ('open', 'pressed', 'ta')}))

            # 10d. Mute: remembered across a reload; a muted answer is shown but not spoken.
            vp.evaluate('() => { window.__holdSpeech = false; }')
            # The page never speaks while its microphone is open: Read aloud on an earlier answer closes it first, and sends nothing.
            n_sent, n_sp = len(vp._sent), len(spoken(vp))
            vp.click('.ch-btn.mic')
            vp.evaluate("t => window.__recs.at(-1).hear(t)", 'half a question')
            vp.evaluate('() => { window.__holdSpeech = true; }')
            vp.evaluate("() => document.querySelector('.ch-turn.bot [data-act=\"speak\"]').click()")
            ra = vstate(vp)
            ra_q = vp.evaluate('() => window.speechSynthesis.q.length')
            time.sleep(0.3)
            check('voice: Read aloud with the microphone open closes the microphone first and sends nothing', ra['open'] == 0 and ra['pressed'] == 'false' and ra_q == 1 and len(spoken(vp)) == n_sp + 1 and len(vp._sent) == n_sent and vstate(vp)['ta'] == '',
                  json.dumps({'mic open': ra['open'], 'synth queue': ra_q, 'new utterances': len(spoken(vp)) - n_sp, 'sent': len(vp._sent) - n_sent}))
            vp.evaluate("() => document.querySelector('.ch-turn.bot [data-act=\"speak\"][aria-pressed=\"true\"]')?.click()")
            vp.evaluate('() => { window.__holdSpeech = false; }')
            # Opening another chat from the sidebar closes the microphone: what it hears is not sent into that chat.
            vp.evaluate("() => document.querySelector('.ch [data-a=\"new\"]').click()")
            vp.click('.ch-btn.mic')
            vp.evaluate("t => window.__recs.at(-1).hear(t)", 'half a question')
            ot0 = vstate(vp)
            vp.evaluate("() => document.querySelector('[data-thread]').click()")
            time.sleep(0.3)
            ot = vstate(vp)
            check('voice: opening another chat closes the microphone and sends nothing', ot0['open'] == 1 and ot['open'] == 0 and ot['pressed'] == 'false' and ot['ta'] == '' and not ot['text'].startswith('Listening') and len(vp._sent) == n_sent
                  and vp.evaluate("() => document.querySelectorAll('.ch-turn.bot').length") >= 1, json.dumps({k: ot[k] for k in ('open', 'pressed', 'ta', 'text')}))
            vp.click('.ch-btn.mic')
            m0 = vstate(vp)
            vp.click('.ch-voice [data-a="voice-mute"]')
            m1, ls1 = vstate(vp), vp.evaluate("() => localStorage.getItem('bsp-voice-muted')")
            n_sp = len(spoken(vp))
            n_turns = vp.evaluate("() => document.querySelectorAll('.ch-turn.bot').length")
            vp.evaluate("t => window.__recs.at(-1).hear(t)", VQ)
            vp.click('.ch-btn.mic')
            vp.wait_for_function('n => document.querySelectorAll(".ch-turn.bot").length > n', arg=n_turns, timeout=15000)
            wait_answer(vp, 60000)
            time.sleep(0.3)
            r3 = last_rec(vp)
            check('voice: Mute is a pressed-state toggle shown while voice is in use', m0['muteShown'] and m0['mute'] == 'false' and m1['mute'] == 'true' and ls1 == 'true', json.dumps({'before': m0['mute'], 'after': m1['mute'], 'stored': ls1}))
            check('voice: a muted answer is shown, not spoken', r3['voice'] == 'hosted' and len(r3['text']) > 20 and len(spoken(vp)) == n_sp, f"{len(spoken(vp)) - n_sp} utterances while muted")
            vp.reload()
            vp.wait_for_selector('.ch-btn.mic', timeout=30000)
            vp.click('.ch-btn.mic')
            m2 = vstate(vp)
            vp.click('.ch-voice [data-a="voice-mute"]')
            m3, ls2 = vstate(vp), vp.evaluate("() => localStorage.getItem('bsp-voice-muted')")
            vp.keyboard.press('Escape')
            check('voice: mute persists across a reload, and can be switched back on', m2['mute'] == 'true' and m3['mute'] == 'false' and ls2 == 'false', json.dumps({'after reload': m2['mute'], 'after toggle': m3['mute'], 'stored': ls2}))
            check('voice: no page errors on the full assistant', not vp._errors, '; '.join(vp._errors)[:200])
            vc.close()

            # 10e. A browser with no speech recognition: the control is marked unavailable and says why; typing still works.
            uc, upg = voice_page(SITE + '/assistant.html?backend=off', no_rec=True)
            upg.wait_for_selector('.ch-btn.mic', timeout=30000)
            u0 = vstate(upg)
            upg.click('.ch-btn.mic', force=True)   # Playwright will not click an aria-disabled control unless told to; a visitor can
            u1 = vstate(upg)
            upg.fill('.ch textarea', 'Which companies are in the portfolio?')
            upg.press('.ch textarea', 'Enter')
            upg.wait_for_selector('.ch-turn.bot', timeout=15000)
            wait_answer(upg, 60000)
            check('unsupported browser: the microphone is marked unavailable and explains itself in one line', u0['disabled'] == 'true' and 'not available in this browser' in u0['label'] and u1['bar'] and u1['text'] == 'Voice questions need Chrome, Edge or Safari. Typed questions work in every browser.' and u1['pressed'] is None,
                  json.dumps({'label': u0['label'], 'note': u1['text']}))
            check('unsupported browser: typed questions still work, no page errors', last_rec(upg)['intent'] == 'portfolio' and not upg._errors, '; '.join(upg._errors)[:200])
            uc.close()

            # 10f. Backend off: the grounded answer on screen, a short version read aloud, no request.
            oc, op = voice_page(SITE + '/assistant.html?backend=off')
            op.wait_for_selector('.ch-btn.mic', timeout=30000)
            say(op, 'Which companies are in the portfolio?')
            op.wait_for_selector('.ch-turn.bot', timeout=15000)
            wait_answer(op, 60000)
            poll(lambda: spoken(op), timeout=5)
            ro, so = last_rec(op), norm(' '.join(x['text'] for x in spoken(op)))
            check('backend off: the grounded answer is shown and a short version is read aloud', ro['kind'] == 'grounded' and ro['intent'] == 'portfolio' and ro['voice'] == 'short' and not op._sent and 'BSP: the portfolio today' in ro['text'] and 20 < len(so) <= 420 and len(so) < len(norm(ro['text'])),
                  f'{len(so)} of {len(norm(ro["text"]))} chars spoken: {so[:150]!r}')
            check('backend off: the short spoken version answers the question (it names the companies)', so.startswith('The portfolio today is ') and all(n in so for n in ('Punctual Pros', 'Frontline', 'Thomas Scientific', 'Fair Harbor')) and all(n in norm(ro['text']) for n in ('Punctual Pros', 'Fair Harbor')), so[:200])
            say(op, 'Show the top add-on targets for CET in Connecticut')
            wait_answer(op, 60000)
            poll(lambda: len(spoken(op)) >= 2, timeout=5)
            so2, ro2 = norm(spoken(op)[-1]['text']), last_rec(op)
            top2 = op.evaluate("() => [...document.querySelectorAll('.ch-turn.bot')].at(-1).querySelector('table tbody tr b')?.textContent || ''")
            check('backend off: a table answer is spoken as its heading and its first row', ro2['voice'] == 'short' and top2 and f'First on the list: {norm(top2)}' in so2 and so2.endswith('The rest is on screen.'), so2[:200])
            check('backend off: the short spoken version has no markdown, citation markers or table text', not _re.search(r'\[\d+\]', so) and not any(j in so for j in MD_JUNK) and '→' not in so and so.endswith('The rest is on screen.'), so[-80:])
            check('backend off: no page errors', not op._errors, '; '.join(op._errors)[:200])
            oc.close()

            # 10g. Backend failing (daily cap): the voice request is made, the reason is shown, and the fallback is still spoken.
            fc, fp = voice_page(SITE + '/assistant.html?backend=' + urllib.parse.quote(CAPPED, safe=':/'))
            fp.wait_for_selector('.ch-btn.mic', timeout=30000)
            poll(lambda: fp.evaluate("() => [...document.querySelectorAll('.ch-engine-t')].some(e => e.textContent.trim() === 'Deep research')"), timeout=15)
            say(fp, 'Which companies are in the portfolio?')
            fp.wait_for_selector('.ch-turn.bot', timeout=15000)
            wait_answer(fp, 60000)
            poll(lambda: spoken(fp), timeout=5)
            rf, sf = last_rec(fp), norm(' '.join(x['text'] for x in spoken(fp)))
            check('backend failing: one voice request, then the grounded answer with the reason, read aloud in short', len(fp._sent) == 1 and fp._sent[0].get('mode') == 'voice' and rf['kind'] == 'grounded' and rf['voice'] == 'short' and "reached today's limit" in rf['text'] and 'BSP: the portfolio today' in rf['text']
                  and sf and "today's limit" not in sf and not fp._errors, f"{len(fp._sent)} requests; spoken {sf[:90]!r}")
            fc.close()

            # 10h. Phone: the docked portal panel at 390px, hold to talk with a touch, no sideways scroll, in both themes.
            for theme in ('light', 'dark'):
                pc2, pp2 = voice_page(f'{SITE}/app.html?backend={urllib.parse.quote(MAIN, safe=":/")}#/home/overview', viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, color_scheme=theme)
                pp2.evaluate("t => { try { localStorage.setItem('bsp-theme', t); } catch {} document.documentElement.dataset.sysTheme = t; }", theme)
                pp2.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
                pp2.click('.ch-floating .ch-launch')
                pp2.wait_for_selector('.ch-floating .ch-btn.mic', timeout=15000)
                poll(lambda: pp2.evaluate("() => [...document.querySelectorAll('.ch-engine-t')].some(e => e.textContent.trim() === 'Deep research')"), timeout=15)
                # The panel opens with a short animation (it slides up and scales in). Measure the button only once that has finished and its
                # place has stopped changing, or the "before" reading is taken mid-flight.
                settled = pp2.evaluate("""async () => { const p = document.querySelector('.ch-floating .ch-panel'), m = document.querySelector('.ch-btn.mic'); const t0 = performance.now(); let last = '', same = 0;
                    while (performance.now() - t0 < 5000) { await new Promise(r => requestAnimationFrame(r)); const r = m.getBoundingClientRect(), k = [r.left, r.top, r.width, r.height].map(Math.round).join();
                      same = k === last ? same + 1 : 0; last = k; if (same >= 8 && !(p?.getAnimations?.() || []).some(a => a.playState === 'running')) return true; }
                    return false; }""")
                box0 = pp2.evaluate("() => { const r = document.querySelector('.ch-btn.mic').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }")
                pp2.evaluate("() => document.querySelector('.ch-btn.mic').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7, bubbles: true }))")
                h1 = vstate(pp2)
                pp2.evaluate("t => window.__recs.at(-1).hear(t)", VQ)
                geo = pp2.evaluate("""() => { const b = document.querySelector('.ch-voice').getBoundingClientRect(), m = document.querySelector('.ch-btn.mic').getBoundingClientRect(), p = document.querySelector('.ch-panel').getBoundingClientRect();
                    return { bar: [Math.round(b.left), Math.round(b.right)], mic: [Math.round(m.left), Math.round(m.top), Math.round(m.width), Math.round(m.height)], panel: [Math.round(p.left), Math.round(p.right)], vw: innerWidth, sw: document.documentElement.scrollWidth,
                      dark: document.querySelector('.ch-floating').classList.contains('ch-dark'), bg: getComputedStyle(document.querySelector('.ch-voice')).backgroundColor, fg: getComputedStyle(document.querySelector('.ch-voice')).color }; }""")
                pp2.screenshot(path=os.path.join(tmp, f'voice-phone-{theme}.png'))
                time.sleep(0.45)   # longer than a tap: this is a hold
                pp2.evaluate("() => document.querySelector('.ch-btn.mic').dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 7, bubbles: true }))")
                pp2.wait_for_selector('.ch-turn.bot', timeout=15000)
                wait_answer(pp2, 60000)
                poll(lambda: not vstate(pp2)['bar'], timeout=5)
                rp, h2 = last_rec(pp2), vstate(pp2)
                bodyp = pp2._sent[-1] if pp2._sent else {}
                check(f'phone ({theme}): hold to talk listens while held and sends on release', h1['pressed'] == 'true' and h1['text'] == 'Listening. Release to send.' and len(pp2._sent) == 1 and bodyp.get('mode') == 'voice' and bodyp.get('question') == VQ and rp['voice'] == 'hosted' and h2['open'] == 0 and spoken(pp2),
                      json.dumps({'state': h1['text'], 'mode': bodyp.get('mode'), 'open': h2['open']}))
                check(f'phone ({theme}): the docked panel sends the view with a voice question', (bodyp.get('context') or [{}])[0].get('title', '').startswith('This view'), repr((bodyp.get('context') or [{}])[0].get('title')))
                check(f'phone ({theme}): no sideways scroll, the voice bar fits, the button does not move under the finger', geo['sw'] <= geo['vw'] and geo['bar'][0] >= geo['panel'][0] and geo['bar'][1] <= geo['panel'][1] and settled and geo['mic'] == box0 and geo['mic'][2] >= 40 and geo['mic'][3] >= 40 and geo['dark'] == (theme == 'dark'),
                      json.dumps({**geo, 'before': box0, 'settled': settled}))
                check(f'phone ({theme}): no page errors', not pp2._errors, '; '.join(pp2._errors)[:200])
                # a quick tap also works: it keeps listening until a pause, or until the next tap
                pp2.evaluate("() => { const m = document.querySelector('.ch-btn.mic'); m.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 8, bubbles: true })); m.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 8, bubbles: true })); }")
                t1 = vstate(pp2)
                pp2.evaluate("() => { const m = document.querySelector('.ch-btn.mic'); m.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 9, bubbles: true })); m.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 9, bubbles: true })); }")
                time.sleep(0.3)
                t2 = vstate(pp2)
                check(f'phone ({theme}): a quick tap keeps listening, a second tap closes; nothing heard sends nothing', t1['pressed'] == 'true' and t1['text'].startswith('Listening. Pause') and t2['open'] == 0 and t2['pressed'] == 'false' and len(pp2._sent) == 1 and 'Nothing was heard' in t2['text'], json.dumps({'tap': t1['text'], 'after': t2['text']}))
                # closing the panel while listening closes the microphone
                pp2.evaluate("() => document.querySelector('.ch-btn.mic').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 10, bubbles: true }))")
                opened = vstate(pp2)['open']
                pp2.evaluate("() => document.querySelector('.ch-floating [data-a=close]').click()")
                check(f'phone ({theme}): closing the panel closes the microphone', opened == 1 and pp2.evaluate('() => window.__recs.filter(r => r.active).length') == 0)
                pc2.close()

            # 10i. Every surface has the control: the landing page (inline), a company concept page (docked) and its persona.
            ic, ip = voice_page(SITE + '/index.html?backend=off', viewport={'width': 390, 'height': 844})
            ip.wait_for_selector('.ch-inline .ch-btn.mic', timeout=30000)
            ip.click('.ch-inline .ch-btn.mic')
            i1 = vstate(ip)
            ip.evaluate("t => window.__recs.at(-1).hear(t)", 'Which companies are in the portfolio?')
            ip.click('.ch-inline .ch-btn.mic')
            ip.wait_for_selector('.ch-turn.bot', timeout=15000)
            wait_answer(ip, 60000)
            poll(lambda: spoken(ip), timeout=5)
            check('landing page: voice works in the inline assistant at phone width, no sideways scroll', i1['pressed'] == 'true' and i1['bar'] and last_rec(ip)['voice'] == 'short' and spoken(ip) and ip.evaluate('() => document.documentElement.scrollWidth <= innerWidth') and not ip._errors, '; '.join(ip._errors)[:160] or i1['text'])
            ic.close()
            cc, cp = voice_page(SITE + '/redesigns/cet/index.html?backend=' + urllib.parse.quote(MAIN, safe=':/'))
            cp.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
            cp.click('.ch-floating .ch-launch')
            cp.wait_for_selector('.ch-floating .ch-btn.mic', timeout=15000)
            poll(lambda: cp.evaluate("() => [...document.querySelectorAll('.ch-engine-t')].some(e => e.textContent.trim() === 'Deep research')"), timeout=15)
            say(cp, VQ)
            cp.wait_for_selector('.ch-turn.bot', timeout=15000)
            wait_answer(cp, 60000)
            check('company concept page: a voice question goes out as that company\'s assistant', cp._sent and cp._sent[-1].get('mode') == 'voice' and cp._sent[-1].get('persona') == 'cet' and last_rec(cp)['voice'] == 'hosted' and not cp._errors, json.dumps({k: cp._sent[-1].get(k) for k in ('mode', 'persona')}) if cp._sent else '; '.join(cp._errors)[:160])
            # Symbols that do not read aloud: "#26" is "number 26", "~40" is "about 40", and "est." is "estimated" and does not end a sentence.
            n_sp = len(spoken(cp))
            say(cp, 'How is Fair Harbor placed? [mock:sym]')
            wait_answer(cp, 60000)
            poll(lambda: len(spoken(cp)) > n_sp and not vstate(cp)['bar'], timeout=8)
            sym = [norm(x['text']) for x in spoken(cp)[n_sp:]]
            check('voice: symbols are spoken as words and an abbreviation does not split a sentence', sym == ['Fair Harbor ranked number 26 on the list, with about 40 stores, estimated at $5M a year.'], json.dumps(sym))
            cc.close()
            print(f'      phone screenshots: {tmp}/voice-phone-light.png, {tmp}/voice-phone-dark.png', flush=True)
            browser.close()
    finally:
        for p in reversed(started):
            p.stop()
    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} browser checks passed' + (f'; failed: {failed}' if failed else ''))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
