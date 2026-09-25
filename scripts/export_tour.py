#!/usr/bin/env python3
"""Export the ordered briefing tour to briefing/tour_steps.json (input for scripts/make_briefing.py).
Loads scripts/export_tour.html in headless Chrome (--dump-dom); that page imports the module registry, registers every
module's tour through Tour.register (sorted by `order`) and prints the steps as JSON.
Usage: python3 scripts/export_tour.py [base_url]   (needs the local server: python3 -m http.server 8765)"""
import html, json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--virtual-time-budget=10000', '--dump-dom', BASE + 'scripts/export_tour.html'], capture_output=True, text=True, timeout=120).stdout
m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
txt = html.unescape(m.group(1)) if m else ''
if not txt.startswith('{'): sys.exit(f'export failed: {txt[:200] or "no output"}')
d = json.loads(txt)
steps = d['steps']
out = os.path.join(ROOT, 'briefing', 'tour_steps.json'); os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(steps, open(out, 'w'), indent=1, ensure_ascii=False)
words = sum(len(s['narration'].split()) for s in steps); secs = sum(s['duration'] for s in steps) / 1000
per = {mm['id']: mm['tour_steps'] for mm in d['modules']}
print(f'wrote {os.path.relpath(out, ROOT)}: {len(steps)} steps · {words} narration words · {secs:.0f}s · per module {per}')
bad = [k for k, v in per.items() if not 3 <= v <= 5]
if bad: print('WARNING: modules outside 3-5 steps:', bad)
