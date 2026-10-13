#!/usr/bin/env python3
"""Re-record the two films' pictures from the current site and keep their original soundtracks.

The narration was made with the macOS `say` voice (scripts/make_briefing.py, scripts/make_cinematic.py), which other
machines cannot reproduce. When only the site changed, this script brings the films up to date anywhere Playwright
and ffmpeg run:

  1. find each chapter or shot in the existing film (every one starts with a fade from black);
  2. check the count against the script (briefing/tour_steps.json; briefing/cinematic_shots_master.json plus its title cards);
  3. re-record each one from the running site at exactly its old length in frames;
  4. put the original audio track back on, so voice and music stay in sync.

  python3 -m http.server 8765 &              # from the repository root
  python3 scripts/rerender_films.py          # both films; or: briefing | intro
  python3 scripts/rerender_films.py intro http://127.0.0.1:8765/

Needs ffmpeg on PATH and Playwright with Chromium. Narration text changes still need the original scripts on a Mac.
Requests that would write to the live assistant backend (questions, the chat log) are blocked while recording.
"""
import json, os, re, shutil, subprocess, sys, tempfile, textwrap, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'briefing')
WHICH = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ('briefing', 'intro', 'both') else 'both'
BASE = next((a for a in sys.argv[1:] if a.startswith('http')), 'http://127.0.0.1:8765/')
FF = shutil.which('ffmpeg') or sys.exit('ffmpeg not found')
W, H, FPS = 1920, 1080, 30
FONT = next((f for f in ('/usr/share/fonts/opentype/inter/Inter-Regular.otf', '/System/Library/Fonts/Supplemental/Arial.ttf',
                         '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') if os.path.exists(f)), None)
WORK = tempfile.mkdtemp(prefix='films_')
GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--ignore-gpu-blocklist']


def run(args):
    subprocess.run([FF, '-y', '-loglevel', 'error', *args], check=True)


def segment_starts(video):
    """Frame numbers where a chapter or shot begins: the darkest frame of each stretch of near-black frames."""
    log = os.path.join(WORK, 'yavg.txt')
    run(['-i', video, '-vf', f'scale=192:108,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file={log}', '-an', '-f', 'null', '-'])
    y = [float(m.group(1)) for m in (re.search(r'YAVG=([\d.]+)', line) for line in open(log)) if m]
    starts, i = [], 0
    while i < len(y):
        if y[i] < 22:
            j = i
            while j + 1 < len(y) and y[j + 1] < 22:
                j += 1
            starts.append(min(range(i, j + 1), key=lambda t: y[t]))
            i = j + 1
        else:
            i += 1
    return starts, len(y)


def lengths(video, expected):
    starts, total = segment_starts(video)
    if len(starts) != expected:
        sys.exit(f'{os.path.basename(video)}: found {len(starts)} segments, the script has {expected}; not re-rendering')
    return [b - a for a, b in zip(starts, starts[1:] + [total])]


def new_context(browser, **kw):
    ctx = browser.new_context(viewport={'width': W, 'height': H}, color_scheme='light', **kw)
    # keep the film runs out of the live assistant: no questions, no chat-log records
    ctx.route(re.compile(r'https://bsp-desk\.vercel\.app/(chat|log|feedback|thread)'), lambda r: r.abort())
    return ctx


def wait_theater(pg, max_ms=95000, extra_ms=2500):
    deadline = time.time() + max_ms / 1000
    while time.time() < deadline:
        st = pg.evaluate("() => ({ready: !!(window.BSPTheater && window.BSPTheater.ready), loading: /Loading/i.test(document.body.innerText || '')})")
        if st['ready'] or not st['loading']:
            break
        pg.wait_for_timeout(1500)
    pg.wait_for_timeout(extra_ms)


def mux(video_only, original, final):
    tmp = final + '.tmp.mp4'
    run(['-i', video_only, '-i', original, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', tmp])
    os.replace(tmp, final)


def concat(parts, path):
    lst = os.path.join(WORK, os.path.basename(path) + '.txt')
    open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    run(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', path])


# ── the narrated briefing: one still and caption per chapter ─────────────────
def briefing(browser):
    steps = json.load(open(os.path.join(OUT, 'tour_steps.json')))
    original = os.path.join(OUT, 'broad_sky_briefing.mp4')
    frames = lengths(original, len(steps))
    parts = []
    for i, (s, n) in enumerate(zip(steps, frames)):
        png = os.path.join(WORK, f'b{i:02d}.png')
        ctx = new_context(browser)
        pg = ctx.new_page()
        pg.goto(BASE + 'app.html' + (s.get('hash') or '#/home/overview'), wait_until='networkidle', timeout=90000)
        if '/theater/' in (s.get('hash') or ''):
            wait_theater(pg)
        pg.wait_for_timeout(3500)
        pg.screenshot(path=png)
        ctx.close()
        lines = textwrap.wrap(re.sub(r'<[^>]+>', '', s.get('caption', '')), width=92)[:3]
        capf = os.path.join(WORK, f'cap{i:02d}.txt')
        open(capf, 'w').write('\n'.join(lines))
        bar = 46 + 38 * max(1, len(lines))
        vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=#0a0e14,"
              f"drawbox=x=0:y=ih-{bar}:w=iw:h={bar}:color=#0a0e14@0.86:t=fill,"
              f"drawtext=fontfile='{FONT}':textfile='{capf}':expansion=none:fontcolor=white:fontsize=29:x=(w-text_w)/2:y=h-{bar}+18:line_spacing=8,"
              f"drawtext=fontfile='{FONT}':text='BSP Desk  ·  {i + 1}/{len(steps)}':fontcolor=#8b98a8:fontsize=20:x=w-text_w-28:y=h-26,"
              f"fade=t=in:st=0:d=0.35,format=yuv420p")
        seg = os.path.join(WORK, f'b{i:02d}.mp4')
        run(['-loop', '1', '-framerate', str(FPS), '-i', png, '-vf', vf, '-frames:v', str(n), '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-r', str(FPS), seg])
        parts.append(seg)
        print(f'  chapter {i + 1}/{len(steps)}: {n / FPS:.2f}s  {s.get("hash")}', flush=True)
    video = os.path.join(WORK, 'briefing_video.mp4')
    concat(parts, video)
    mux(video, original, original)
    run(['-ss', '2', '-i', original, '-frames:v', '1', '-q:v', '3', os.path.join(OUT, 'poster.jpg')])
    man = os.path.join(OUT, 'manifest.json')
    m = json.load(open(man))
    m['rendered'] = time.strftime('%Y-%m-%d %H:%M')
    json.dump(m, open(man, 'w'), indent=1)


# ── the cinematic intro: title cards and recorded shots ──────────────────────
TITLE_HTML = """<!doctype html><html><head><meta charset=utf-8>
<style>html,body{margin:0;height:100%;background:#07090d;font-family:Inter,system-ui,sans-serif;color:#fff;overflow:hidden}
.bg{position:absolute;inset:0;background:radial-gradient(1200px 700px at 20% 30%,rgba(217,98,43,.35),transparent 60%),radial-gradient(900px 600px at 80% 70%,rgba(76,141,255,.30),transparent 60%),#07090d}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 75%)}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 160px}
.k{font-size:22px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#f08a3c;margin-bottom:26px}
h1{font-size:{{SIZE}}px;font-weight:800;letter-spacing:-.03em;line-height:1.02;margin:0;max-width:1500px}
.f{position:absolute;left:160px;bottom:90px;font-size:20px;color:rgba(255,255,255,.55);letter-spacing:.04em}
.logo{position:absolute;right:160px;bottom:80px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:20px;color:rgba(255,255,255,.85)}.logo img{width:44px;height:44px;border-radius:50%}</style></head>
<body><div class=bg></div><div class=grid></div><div class=wrap><div class=k>{{KICKER}}</div><h1>{{HEADLINE}}</h1></div><div class=f>{{FOOT}}</div><div class=logo><img src="{{LOGO}}">BSP Desk</div></body></html>"""
SCROLL_JS = """(args) => new Promise(res => { const to = args.to, ms = args.ms; const from = window.scrollY; const t0 = performance.now(); const ease = x => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2; function f(t){ const k = Math.min(1, (t - t0) / ms); window.scrollTo(0, from + (to - from) * ease(k)); if (k < 1) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); })"""


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def title_card(browser, i, tc, n):
    html = (TITLE_HTML.replace('{{KICKER}}', esc(tc.get('kicker', ''))).replace('{{HEADLINE}}', esc(tc.get('headline', '')))
            .replace('{{SIZE}}', str(tc.get('size', 96))).replace('{{FOOT}}', esc(tc.get('foot', 'Syed Rahman · for the Portfolio Resource Group')))
            .replace('{{LOGO}}', BASE + 'BSP_Logo.png'))
    hp, png, out = (os.path.join(WORK, f'tc{i:02d}{x}') for x in ('.html', '.png', '.mp4'))
    open(hp, 'w').write(html)
    ctx = browser.new_context(viewport={'width': W, 'height': H})
    pg = ctx.new_page()
    pg.goto('file://' + hp)
    pg.wait_for_timeout(900)
    pg.screenshot(path=png)
    ctx.close()
    d = n / FPS
    run(['-loop', '1', '-i', png, '-vf', f"scale={W}:{H},zoompan=z='min(zoom+0.0008,1.05)':d={n}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},"
         f"fade=t=in:st=0:d=0.5,fade=t=out:st={d - 0.5:.2f}:d=0.5,format=yuv420p", '-frames:v', str(n), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', str(FPS), out])
    return out


def shot(browser, i, s, n):
    d = n / FPS
    ctx = new_context(browser, record_video_dir=WORK, record_video_size={'width': W, 'height': H})
    pg = ctx.new_page()
    pg.goto(BASE + s['url'], wait_until='networkidle', timeout=90000)
    pg.wait_for_timeout(int(s.get('settle_ms', 1800)))
    a, args, t0 = s.get('action', 'static'), s.get('action_args', {}) or {}, time.time()
    try:
        if a == 'scroll':
            pg.evaluate(SCROLL_JS, {'to': int(args.get('to', 1600)), 'ms': int(args.get('ms', (d - 1.5) * 1000))})
        elif a == 'type_chat':
            sel = args.get('selector', '.ch textarea')
            pg.wait_for_selector(sel, timeout=15000)
            pg.click(sel)
            pg.type(sel, args.get('text', ''), delay=int(args.get('delay', 42)))
            pg.wait_for_timeout(500)
            pg.keyboard.press('Enter')
            try:
                pg.wait_for_selector('.ch-turn.bot .ch-answer:not(:empty)', timeout=20000)
            except Exception:
                pass
            pg.wait_for_timeout(1200 + int(args.get('read_ms', 1800)))
            pg.evaluate("""(ms) => { const m = document.querySelector('.ch-msgs'); if (m) { const t0 = performance.now(); const from = m.scrollTop, to = m.scrollHeight - m.clientHeight; (function f(t){ const k = Math.min(1, (t - t0) / ms); m.scrollTop = from + (to - from) * (k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2); if (k < 1) requestAnimationFrame(f); })(t0); } }""", int(args.get('scroll_ms', 6000)))
        elif a == 'theater':
            wait_theater(pg, int(args.get('max_wait_ms', 95000)), int(args.get('extra_ms', 2500)))
            t0 = time.time()
            if args.get('scene'):
                pg.evaluate("(id) => window.BSPTheater && window.BSPTheater.goTo && window.BSPTheater.goTo(id)", args['scene'])
            if args.get('play', True):
                pg.evaluate("() => window.BSPTheater && window.BSPTheater.play && window.BSPTheater.play()")
        elif a == 'static' and args.get('to'):
            pg.wait_for_timeout(800)
            pg.evaluate(SCROLL_JS, {'to': int(args['to']), 'ms': int(args.get('ms', 2500))})
    except Exception as e:
        print('   action error', i, e)
    remain = d - (time.time() - t0)
    if remain > 0:
        pg.wait_for_timeout(int(remain * 1000))
    raw = pg.video.path()
    ctx.close()
    vlen = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw], capture_output=True, text=True).stdout or 0)
    start = max(0.0, vlen - d - 0.15) if vlen > d + 1.0 else 0.0   # keep the last d seconds: the action and the hold, not the page load
    out = os.path.join(WORK, f'shot{i:02d}.mp4')
    run(['-ss', f'{start:.2f}', '-i', raw, '-vf', f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},tpad=stop_mode=clone:stop_duration=3,"
         f"fade=t=in:st=0:d=0.35,fade=t=out:st={max(0, d - .45):.2f}:d=0.45,format=yuv420p", '-frames:v', str(n), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-r', str(FPS), out])
    return out


def intro(browser):
    shots = json.load(open(os.path.join(OUT, 'cinematic_shots_master.json')))
    plan = [(i, kind) for i, s in enumerate(shots) for kind in (('card', 'shot') if s.get('title_card') else ('shot',))]
    original = os.path.join(OUT, 'broad_sky_intro.mp4')
    frames = lengths(original, len(plan))
    parts = []
    for (i, kind), n in zip(plan, frames):
        s = shots[i]
        parts.append(title_card(browser, i, s['title_card'], n) if kind == 'card' else shot(browser, i, s, n))
        print(f'  {kind} {i}: {n / FPS:.2f}s  {s.get("url") if kind == "shot" else s["title_card"].get("headline")}', flush=True)
    video = os.path.join(WORK, 'intro_video.mp4')
    concat(parts, video)
    mux(video, original, original)
    run(['-ss', '1.5', '-i', original, '-frames:v', '1', '-update', '1', '-q:v', '3', os.path.join(OUT, 'intro_poster.jpg')])
    man = os.path.join(OUT, 'intro_manifest.json')
    m = json.load(open(man))
    m['rendered'] = time.strftime('%Y-%m-%d %H:%M')
    json.dump(m, open(man, 'w'), indent=1)


if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    print('work', WORK, '· base', BASE)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=GL_ARGS)
        if WHICH in ('briefing', 'both'):
            briefing(browser)
        if WHICH in ('intro', 'both'):
            intro(browser)
        browser.close()
    print('done')
