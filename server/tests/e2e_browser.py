"""
Browser check: the unchanged site client (assets/backend.js + chat.js) against this backend.

Starts the mock Claude API (8799), the backend on 8787 (FAKE_ANTHROPIC_URL), a capped backend (8788,
DAILY_CAP=0), a backend with no Claude key (8789), the static site on 8765 and a second origin on 8766,
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
OPEN_Q = 'What questions should an operating partner ask a new CFO?'
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)


def page_url(backend, q, page='scripts/chat_test.html', port=8765):
    return f'http://127.0.0.1:{port}/{page}?backend={urllib.parse.quote(backend, safe=":/")}&q={urllib.parse.quote(q)}'


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
        started.append(procs.start_mock(8799, os.path.join(tmp, 'mock.log')))
        main_srv = procs.start_server(8787, os.path.join(tmp, 'server.log'), db, 8799, BLOB_READ_WRITE_TOKEN='vercel_blob_rw_e2estore_notarealsecret', VERCEL_BLOB_API_URL='http://127.0.0.1:8799/blob')
        started.append(main_srv)
        started.append(procs.start_server(8788, os.path.join(tmp, 'capped.log'), os.path.join(tmp, 'capped.db'), 8799, DAILY_CAP=0))
        started.append(procs.start_server(8789, os.path.join(tmp, 'nokey.log'), os.path.join(tmp, 'nokey.db'), 8799, key=None))
        for port in (8765, 8766):
            started.append(procs.start_static(port, os.path.join(tmp, f'static{port}.log'), REPO, '/scripts/chat_test.html'))

        with sync_playwright() as pw:
            browser = pw.chromium.launch()

            # 1. Discovery, streaming and the "hosted" label.
            ctx = browser.new_context()
            page = ctx.new_page()
            chat_res = []
            page.on('response', lambda r: chat_res.append(r) if r.url.endswith('/chat') else None)
            goto(page, page_url('http://127.0.0.1:8787', OPEN_Q))
            wait_answer(page)
            labels = page.eval_on_selector_all('.ch-eng, .ch-engine-t', 'els => els.map(e => e.textContent.trim())')
            answer = page.inner_text('.ch-turn.bot .ch-answer')
            check('health discovery shows the deep-research engine', any(l.strip() == 'Deep research' for l in labels), '; '.join(labels))
            check('streamed text renders in the answer', 'Short answer' in answer and 'covenant headroom' in answer and 'SECRET-THINKING' not in answer, answer[:90].replace('\n', ' '))
            check('/chat answered 200 text/event-stream', chat_res and chat_res[0].status == 200 and chat_res[0].headers.get('content-type', '').startswith('text/event-stream'))

            # 1b. The chat log: the research agent's answer is saved on the server, with the page it was asked on.
            import httpx
            stored = [json.loads(v['body']) for k, v in httpx.get('http://127.0.0.1:8799/_blobs').json().items() if k.startswith('chats/')]
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
            goto(p2, page_url('http://127.0.0.1:8787', OPEN_Q + ' [mock:slow]'))
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
                goto(p3, page_url('http://127.0.0.1:8787', OPEN_Q, page='assistant.html'))
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
                goto(p6, page_url('http://127.0.0.1:8787', grounded_q))
            t0 = time.time()
            local = []
            while time.time() - t0 < 5 and not local:
                local = [json.loads(v['body']) for k, v in httpx.get('http://127.0.0.1:8799/_blobs').json().items() if k.startswith('chats/') and json.loads(v['body']).get('question') == grounded_q]
                time.sleep(0.1)
            rec = local[0] if local else {}
            check('chat log keeps answers built in the browser', lr.value.status == 202 and rec.get('source') == 'browser' and rec.get('kind') == 'grounded' and rec.get('intent') == 'sizes' and len(rec.get('answer', '')) > 40 and '\n' in rec.get('answer', ''),
                  json.dumps({k: rec.get(k) for k in ('kind', 'intent', 'engine', 'seconds')}) + ' ' + rec.get('answer', '')[:60].replace('\n', ' / '))
            p6.close()
            check('/stats returns counts', stats and stats['threads'] >= 1 and stats['feedback'] >= 1 and stats['today']['requests'] >= 3, json.dumps({k: stats[k] for k in ('threads', 'messages', 'feedback', 'feedback_up', 'today')}))
            p3.close()

            # 6. CORS: allowed from the site's origin, refused from another origin.
            pre_ok = page.evaluate("""async () => { const r = await fetch('http://127.0.0.1:8787/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: -1, question: 'cors check' }) }); return r.status; }""")
            check('CORS preflight passes for an allowed origin (127.0.0.1:8765)', pre_ok == 201, f'status {pre_ok}')
            other = ctx.new_page()
            goto(other, 'http://127.0.0.1:8766/scripts/chat_test.html?backend=off')
            bad = other.evaluate("""async () => { try { const r = await fetch('http://127.0.0.1:8787/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) }); return 'status ' + r.status; } catch (e) { return 'blocked: ' + e.message; } }""")
            check('CORS preflight fails for another origin (127.0.0.1:8766)', bad.startswith('blocked'), bad)
            other.close()
            r = httpx.options('http://127.0.0.1:8787/chat', headers={'Origin': 'https://syedr64.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
            r2 = httpx.options('http://127.0.0.1:8787/chat', headers={'Origin': 'https://example.com', 'Access-Control-Request-Method': 'POST'})
            check('preflight: GitHub Pages origin 204, other origin 403', r.status_code == 204 and r.headers.get('access-control-allow-origin') == 'https://syedr64.github.io' and r2.status_code == 403, f'{r.status_code} / {r2.status_code}')

            # 7. Daily cap: the Worker's 429 daily_cap error, shown to the visitor in plain words.
            p4 = ctx.new_page()
            capped = []
            p4.on('response', lambda r: capped.append(r) if r.url.endswith('/chat') else None)
            goto(p4, page_url('http://127.0.0.1:8788', OPEN_Q))
            wait_answer(p4)
            cbody = capped[0].json() if capped else {}
            warn = p4.inner_text('.ch-turn.bot .ch-answer')
            check('daily cap returns the Worker error', capped and capped[0].status == 429 and cbody.get('error') == 'daily_cap' and cbody.get('scope') == 'global', json.dumps(cbody)[:160])
            check('daily cap message shown to the visitor', "reached today's limit for this site" in warn, warn.split('\n')[0][:120])
            p4.close()

            # 8. Missing ANTHROPIC_API_KEY: llm:false on /health, a clear error on /chat.
            p5 = ctx.new_page()
            goto(p5, page_url('http://127.0.0.1:8789', OPEN_Q))
            wait_answer(p5)
            h = p5.evaluate("async () => (await fetch('http://127.0.0.1:8789/health')).json()")
            raw = p5.evaluate("""async () => { const r = await fetch('http://127.0.0.1:8789/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'x' }) }); return { status: r.status, body: await r.json() }; }""")
            client_err = p5.evaluate("""async () => { const { Backend } = await import('/assets/backend.js'); try { for await (const t of Backend.chat({ question: 'x' })) {} return 'no error'; } catch (e) { return e.code + ': ' + e.message; } }""")
            labels5 = p5.eval_on_selector_all('.ch-eng, .ch-engine-t', 'els => els.map(e => e.textContent.trim())')
            check('missing key: /health llm false', h.get('ok') is True and h.get('llm') is False, json.dumps(h))
            check('missing key: /chat clear error', raw['status'] == 503 and raw['body'].get('error') == 'no_model_key', f"{raw['status']} {raw['body'].get('message')} | client: {client_err}")
            check('missing key: page falls back to grounded answers', not any(l.strip() == 'Deep research' for l in labels5), '; '.join(labels5))
            p5.close()

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

            collect('http://127.0.0.1:8765/index.html?backend=off', 'index').close()
            collect('http://127.0.0.1:8765/assistant.html?backend=off', 'assistant').close()
            pr = collect('http://127.0.0.1:8765/app.html?backend=off#/home/overview', 'portal panel', launch=True)
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
                goto(pg, f'http://127.0.0.1:8765/app.html?backend={urllib.parse.quote(backend, safe=":/")}#/theater/play?scene=S5&autoplay=0')
                pg.wait_for_function("() => { const d = window.BSPView && window.BSPView.describe && window.BSPView.describe(); return d && d.headline && /alerts/i.test(d.lines.join(' ')) && !/still loading/.test(d.lines.join(' ')); }", timeout=60000)
                pg.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
                return pg, sent

            httpx.delete('http://127.0.0.1:8799/_requests')
            pm, sent = open_storm('http://127.0.0.1:8787')
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
            upstream = [r['body'] for r in httpx.get('http://127.0.0.1:8799/_requests').json() if VIEW_Q in json.dumps(r.get('body', {}))]
            first_msg = json.dumps(upstream[0]['messages'][-1]) if upstream else ''
            check('the model sees the view as source [1], with the rule to answer from it', upstream and '[1] This view: 3D map' in first_msg and '(from the page the visitor is on)' in first_msg and 'answer from that source first' in upstream[0]['system'][0]['text'], first_msg[:150])
            t0 = time.time()
            logged = []
            while time.time() - t0 < 5 and not logged:
                logged = [json.loads(v['body']) for k, v in httpx.get('http://127.0.0.1:8799/_blobs').json().items() if k.startswith('chats/') and json.loads(v['body']).get('question') == VIEW_Q and json.loads(v['body']).get('source') == 'server']
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
            goto(pf, 'http://127.0.0.1:8765/app.html?backend=off#/home/firm')
            pf.wait_for_function("() => /since launch/.test(document.querySelector('#content .sys-lead')?.textContent || '')", timeout=30000)
            firm = pf.evaluate("async () => { const { Chat } = await import('/assets/chat.js'); return { head: document.querySelector('#content .page-head').innerText, ctx: Chat.viewContext()?.text || '' }; }")
            check('firm profile: six companies today, seven since launch', '6 companies today, 7 since launch' in firm['head'] and '6 held · 7 since launch · 23 add-ons' in firm['head'] and '7 companies' not in firm['head'] and '7 companies' not in firm['ctx'] and '6 companies today' in firm['ctx'], firm['head'].replace('\n', ' / ')[-170:])
            pf.close()
            # 9d-3. A page in a folder names itself from the site root, and the link opens that page from anywhere.
            pd = ctx.new_page()
            goto(pd, 'http://127.0.0.1:8765/redesigns/methodology.html?backend=off')
            pd.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
            nested = pd.evaluate("async () => { const { Chat } = await import('/assets/chat.js'); return Chat.viewContext()?.href; }")
            check('view link is relative to the site root', nested == './redesigns/methodology.html', repr(nested))
            pd.close()
            pd = ctx.new_page()
            sent_n = []
            pd.on('request', lambda r: sent_n.append(json.loads(r.post_data or '{}')) if r.url.endswith('/chat') and r.method == 'POST' else None)
            goto(pd, 'http://127.0.0.1:8765/redesigns/methodology.html?backend=' + urllib.parse.quote('http://127.0.0.1:8787', safe=':/'))
            pd.wait_for_selector('.ch-floating .ch-launch', timeout=30000)
            ask_docked(pd, 'What am I looking at?')
            src = pd.evaluate("() => { const t = [...document.querySelectorAll('.ch-turn.bot')].at(-1); return (t._rec.sources || []).map(s => [s.label, s.href]); }")
            view_src = [h for l, h in src if str(l).startswith('This view')]
            check('nested page: the server keeps the link and the answer opens the right page', sent_n and sent_n[-1]['context'][0]['href'] == './redesigns/methodology.html' and view_src == ['http://127.0.0.1:8765/redesigns/methodology.html'], f"sent {sent_n[-1]['context'][0]['href'] if sent_n else None!r}; source link {view_src}")
            pd.close()
            # 9e. Research assistant refuses (daily cap): the error, then the same honest fallback.
            pc, _ = open_storm('http://127.0.0.1:8788')
            a = ask_docked(pc, VIEW_Q)
            check('research assistant fails: error shown, then the weather fallback', a['kind'] == 'grounded' and a['intent'] == 'weather_all' and "reached today's limit" in a['text'] and "can't read this view" in a['text'] and 'Weather across the portfolio' in a['text'], a['text'][:200].replace('\n', ' / '))
            pc.close()

            # 9f. Regressions: these questions go where they went before.
            def ask_inline(q, backend='http://127.0.0.1:8787'):
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
            browser.close()
    finally:
        for p in reversed(started):
            p.stop()
    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} browser checks passed' + (f'; failed: {failed}' if failed else ''))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
