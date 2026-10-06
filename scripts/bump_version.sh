#!/bin/sh
# Stamp a cache-busting version on every local script/stylesheet reference (run before each deploy).
# Usage: scripts/bump_version.sh [VERSION]   (ROOT=<dir> to run against another tree)
V=${1:-$(date +%Y%m%d%H%M%S)}
ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
V="$V" ROOT="$ROOT" python3 - <<'PY'
import os, re, sys
V = os.environ['V']; ROOT = os.environ['ROOT']
SKIP = ('.git', 'node_modules', 'data', 'worker', '.github', 'briefing/ads')
EXTS = ('.html', '.js', '.css')
n_files = 0; n_stamps = 0; n_added = 0
# 1) existing stamps → V ;  2) unstamped local .js/.css references in src/href/import → add ?v=V
re_stamp = re.compile(r'\?v=[0-9A-Za-z_.-]+')
re_html = re.compile(r'''((?:src|href)=["'])(?!https?:|//|data:|mailto:)([^"'?#]+\.(?:js|css))(["'])''')
re_js = re.compile(r'''((?:from\s+|import\s*\(\s*)["'])(\.{1,2}/[^"'?#]+\.(?:js|css))(["'])''')
for d, dirs, fs in os.walk(ROOT):
    rel = os.path.relpath(d, ROOT)
    dirs[:] = [x for x in dirs if not any((rel + '/' + x).lstrip('./').startswith(s) for s in SKIP)]
    for f in fs:
        if not f.endswith(EXTS): continue
        p = os.path.join(d, f)
        try: s = open(p, encoding='utf-8').read()
        except Exception: continue
        o = s
        s, k = re_stamp.subn('?v=' + V, s); n_stamps += k
        if f.endswith('.html'):
            s, k = re_html.subn(lambda m: m.group(1) + m.group(2) + '?v=' + V + m.group(3), s); n_added += k
        if f.endswith(('.js', '.html')):
            s, k = re_js.subn(lambda m: m.group(1) + m.group(2) + '?v=' + V + m.group(3), s); n_added += k
        if s != o:
            open(p, 'w', encoding='utf-8').write(s); n_files += 1
print(f'version {V}: {n_stamps} stamps refreshed, {n_added} added, {n_files} files written')
PY
