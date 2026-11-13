"""
Estimate what each question sends to the model, piece by piece, without calling the real API.

Starts the mock Claude API and one backend, asks three scripted questions (a leadership question, the CET
deal-model question and a new-homeowner list), reads back the request bodies the mock received and splits
each one into: system prompt, tool definitions, earlier turns, page context, retrieved excerpts, the question,
and what the agent's own steps added (tool calls and tool results).

Token counts are ESTIMATES: they come from the knowledge base's own tokenizer (the `tokenizers` package), not
from Claude's. Claude's tokenizer usually counts more, so read the table for proportions and before/after
ratios, not for billing. The real numbers are the usage blocks in the chat log (tokens.in, cache_read, cache_write).

  cd server && uv run --no-project --python 3.12 --with-requirements requirements-dev.txt python tests/measure_tokens.py [--voice] [--json out.json]
"""

import argparse
import base64
import json
import os
import re
import sqlite3
import sys
import tempfile
import uuid

import httpx

import procs

GH = 'https://syedr64.github.io'
PAGE = ('Command Center. Six companies today. Storm watch: a coastal low brings 2 to 3 inches of rain to Ocean and Monmouth counties from Thursday night; '
        'sump-pump, water-heater and generator calls usually rise for three days after. Bids due: four CET public bids close within 30 days in '
        'Massachusetts and Connecticut. Add-on pipeline: nine targets scored above 70 for CET, six for Punctual Pros. Rival sponsors active this '
        'quarter in home services and electrical contracting. Revenue estimates from public filings carry an est. badge. ') * 2
EARLIER = [{'role': 'user', 'content': 'How does BSP scale CET across the Northeast?'},
           {'role': 'assistant', 'content': ('CET grows from its Worcester, Taunton and Norwell base by adding trades and states. The plan has three parts: win more public and '
                                             'institutional electrical work in Massachusetts and Connecticut, sell solar, storage and EV charging to the same owners, and use '
                                             'Horton and NuWave to bring wastewater and energy-efficiency programs to every account [1][2]. ') * 3}]


def plan(*calls):
    return '[mock:plan:' + base64.urlsafe_b64encode(json.dumps(list(calls)).encode()).decode().rstrip('=') + ']'


CASES = [
    ('Leadership', {'question': 'Who leads BSP, and what did they do before? ' + plan(['search_knowledge', {'query': 'Tyler Zachem chief executive background', 'company': 'bsp'}],
                                                                                         ['read_source', {'source': 2}]),
                    'context': [{'title': 'Command Center', 'text': PAGE, 'href': 'app.html#/briefing'}]}),
    ('CET deal model', {'question': 'What could BSP pay for CET and still earn 25% a year? ' + plan(['search_knowledge', {'query': 'CET revenue EBITDA estimate', 'company': 'cet'}],
                                                                                                    ['search_knowledge', {'query': 'electrical contractor acquisition multiples comparable deals'}],
                                                                                                    ['deal_model', {'preset': 'cet', 'overrides': {'em': 9.5}}]),
                        'messages': EARLIER}),
    ('New-homeowner list', {'question': "Who should get this month's new-homeowner mailer in Ocean County? " + plan(['new_homeowners', {'county': 'Ocean', 'period': 'latest', 'limit': 25}])}),
]
# mode "voice" allows no search loop: the scripted model answers at once, or makes the one tool call the question was routed to
VOICE_PLANS = {'Leadership': plan(), 'CET deal model': plan(['deal_model', {'preset': 'cet', 'overrides': {'em': 9.5}}]),
               'New-homeowner list': plan(['new_homeowners', {'county': 'Ocean', 'period': 'latest', 'limit': 25}])}
MARK = re.compile(r'\s*\[mock:plan:[^\]]*\]')


def tokenizer():
    from tokenizers import Tokenizer
    con = sqlite3.connect('file:' + os.path.join(procs.SERVER_DIR, 'knowledge', 'kb.sqlite') + '?mode=ro', uri=True)
    blob = con.execute("SELECT data FROM blobs WHERE name = 'tokenizer'").fetchone()[0]
    return Tokenizer.from_str(blob.decode('utf-8'))


def counter():
    tok = tokenizer()
    return lambda s: len(tok.encode(s, add_special_tokens=False).ids) if s else 0


def text_of(content):
    if isinstance(content, str):
        return content
    out = []
    for b in content or []:
        if b.get('type') == 'text':
            out.append(b.get('text') or '')
        elif b.get('type') == 'tool_result':
            out.append(b['content'] if isinstance(b.get('content'), str) else json.dumps(b.get('content')))
        elif b.get('type') == 'tool_use':
            out.append(json.dumps({'name': b.get('name'), 'input': b.get('input')}))
    return '\n'.join(out)


def breakdown(body, n):
    """One request body -> estimated tokens per part."""
    msgs = body.get('messages') or []
    qi = next(i for i, m in enumerate(msgs) if isinstance(m.get('content'), list) and any(b.get('type') == 'text' and (b.get('text') or '').startswith('<sources>') for b in m['content']))
    src = next(b['text'] for b in msgs[qi]['content'] if (b.get('text') or '').startswith('<sources>'))
    inner = src[len('<sources>\n'):-len('\n</sources>')]
    entries = re.split(r'\n\n(?=\[\d+\] )', inner) if inner else []
    page = [e for e in entries if '(from the page the visitor is on)' in e.split('\n', 1)[0]]
    kb = [e for e in entries if e not in page]
    question = '\n'.join(b['text'] for b in msgs[qi]['content'] if b.get('type') == 'text' and not b['text'].startswith('<sources>'))
    later = msgs[qi + 1:]
    return {
        'system': n('\n'.join(b.get('text') or '' for b in body.get('system') or [])),
        'tools': n(json.dumps(body.get('tools') or [])) if body.get('tools') else 0,
        'history': sum(n(text_of(m['content'])) for m in msgs[:qi]),
        'page': n('\n\n'.join(page)),
        'excerpts': n('\n\n'.join(kb)),
        'question': n(MARK.sub('', question)),
        'tool_calls': sum(n(text_of(m['content'])) for m in later if m['role'] == 'assistant'),
        'tool_results': sum(n(text_of(m['content'])) for m in later if m['role'] == 'user'),
    }


PARTS = ['system', 'tools', 'history', 'page', 'excerpts', 'question', 'tool_calls', 'tool_results']


def run(base, mock, mode, n):
    out = []
    for name, payload in CASES:
        httpx.delete(mock + '/_requests')
        body = {**payload, **({'mode': 'voice', 'question': MARK.sub('', payload['question']) + ' ' + VOICE_PLANS[name]} if mode == 'voice' else {})}
        with httpx.stream('POST', base + '/chat', headers={'Origin': GH, 'Content-Type': 'application/json', 'X-Real-IP': '203.0.113.9-' + uuid.uuid4().hex[:6]}, json=body, timeout=60) as r:
            r.read()
            assert r.status_code == 200, (r.status_code, r.text[:300])
        reqs = [x['body'] for x in httpx.get(mock + '/_requests').json() if x['body'].get('stream')]
        steps = [breakdown(b, n) for b in reqs]
        for s, b in zip(steps, reqs):
            s['total'] = sum(s[p] for p in PARTS)
            s['max_tokens'] = b.get('max_tokens')
            s['cache_marks'] = json.dumps(b).count('"cache_control"')
        out.append({'case': name, 'mode': mode, 'steps': steps, 'answer_total': sum(s['total'] for s in steps)})
    return out


def table(rows):
    lines = ['| Question | Mode | Step | ' + ' | '.join(PARTS) + ' | Step total |', '|---|---|---|' + '---:|' * (len(PARTS) + 1)]
    for r in rows:
        for i, s in enumerate(r['steps']):
            lines.append(f"| {r['case']} | {r['mode']} | {i + 1} | " + ' | '.join(f'{s[p]:,}' for p in PARTS) + f" | {s['total']:,} |")
        lines.append(f"| {r['case']} | {r['mode']} | **answer** | " + ' | ' * (len(PARTS) - 1) + f" | **{r['answer_total']:,}** |")
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', action='store_true', help='also measure mode "voice"')
    ap.add_argument('--json', help='write the numbers to this file')
    a = ap.parse_args()
    n = counter()
    tmp = tempfile.mkdtemp(prefix='bsp-measure-')
    mport, sport = procs.free_port(), procs.free_port()
    started = [procs.start_mock(mport, os.path.join(tmp, 'mock.log'))]
    try:
        started.append(procs.start_server(sport, os.path.join(tmp, 'server.log'), os.path.join(tmp, 'm.db'), mport, RL_PER_10MIN=100))
        base, mock = f'http://127.0.0.1:{sport}', f'http://127.0.0.1:{mport}'
        rows = run(base, mock, 'chat', n) + (run(base, mock, 'voice', n) if a.voice else [])
    finally:
        for p in reversed(started):
            p.stop()
    print('Estimated input tokens per request (knowledge-base tokenizer, not Claude\'s: an estimate).\n')
    print(table(rows))
    print('\nPer answer, if every step after the first reads the earlier steps from the cache (write 1.25x, read 0.05x on the default model).')
    print('A one-step voice answer marks nothing for the cache (nothing would read it back), so it is billed as sent. A two-step voice')
    print('answer marks the fixed part (system + tools): the first step pays to write it and the second reads it.\n')
    print('| Question | Mode | Steps | Sent | Billed as, with cache hits |\n|---|---|---:|---:|---:|')
    for r in rows:
        t = [s['total'] for s in r['steps']]
        if r['mode'] == 'voice' and not r['steps'][0]['cache_marks']:
            billed = sum(t)
        elif r['mode'] == 'voice':
            fixed = r['steps'][0]['system'] + r['steps'][0]['tools']
            billed = 1.25 * fixed + (t[0] - fixed) + sum(0.05 * fixed + (x - fixed) for x in t[1:])
        else:
            billed = 1.25 * t[0] + sum(0.05 * a + 1.25 * (b - a) for a, b in zip(t, t[1:]))
        print(f"| {r['case']} | {r['mode']} | {len(t)} | {sum(t):,} | {round(billed):,} |")
    if a.json:
        with open(a.json, 'w') as f:
            json.dump(rows, f, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
