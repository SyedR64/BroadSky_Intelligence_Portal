#!/usr/bin/env python3
"""Cinematic product-intro film: Playwright screen recording of scripted interactions + title cards + narration + music.
Usage: python3 scripts/make_cinematic.py [shots.json] [base_url]
Requires: pip --user playwright (+ `python3 -m playwright install chromium`), imageio-ffmpeg, macOS `say`.
Shot schema (briefing/cinematic_shots.json): [{id, url, action: static|scroll|type_chat|hover_cards|click_tab, action_args, duration_s, title_card:{kicker,headline}|null, narration}]"""
import json, os, re, subprocess, sys, tempfile, time, wave, contextlib, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'briefing', 'cinematic_shots.json')
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8765/'
OUT = os.path.join(ROOT, 'briefing'); os.makedirs(OUT, exist_ok=True)
import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
from playwright.sync_api import sync_playwright
W, H, FPS = 1920, 1080, 30
VOICE = os.environ.get('BSP_VOICE', 'Samantha'); RATE = os.environ.get('BSP_RATE', '185')
WORK = tempfile.mkdtemp(prefix='cine_'); print('work', WORK)
shots = json.load(open(SHOTS)); print(len(shots), 'shots')

TITLE_HTML = """<!doctype html><html><head><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel=stylesheet>
<style>html,body{margin:0;height:100%;background:#07090d;font-family:Inter,system-ui,sans-serif;color:#fff;overflow:hidden}
.bg{position:absolute;inset:0;background:radial-gradient(1200px 700px at 20% 30%,rgba(217,98,43,.35),transparent 60%),radial-gradient(900px 600px at 80% 70%,rgba(76,141,255,.30),transparent 60%),#07090d}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 75%)}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 160px}
.k{font-size:22px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#f08a3c;margin-bottom:26px}
h1{font-size:{{SIZE}}px;font-weight:800;letter-spacing:-.03em;line-height:1.02;margin:0;max-width:1500px}
.f{position:absolute;left:160px;bottom:90px;font-size:20px;color:rgba(255,255,255,.55);letter-spacing:.04em}
.logo{position:absolute;right:160px;bottom:80px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:20px;color:rgba(255,255,255,.85)}.logo img{width:44px;height:44px;border-radius:50%}</style></head>
<body><div class=bg></div><div class=grid></div><div class=wrap><div class=k>{{KICKER}}</div><h1>{{HEADLINE}}</h1></div><div class=f>{{FOOT}}</div><div class=logo><img src="{{LOGO}}">Broad Sky Operating Intelligence</div></body></html>"""

def esc(s): return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def dur_wav(p):
    with contextlib.closing(wave.open(p)) as w: return w.getnframes() / w.getframerate()
def vid_dur(p):
    r = subprocess.run([FF, '-i', p], capture_output=True, text=True).stderr; m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r); return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0

SCROLL_JS = """(args) => new Promise(res => { const to = args.to, ms = args.ms; const from = window.scrollY; const t0 = performance.now(); const ease = x => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2; function f(t){ const k = Math.min(1, (t - t0) / ms); window.scrollTo(0, from + (to - from) * ease(k)); if (k < 1) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); })"""

segments = []  # (video_path, duration, narration_wav|None)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'])
    for i, s in enumerate(shots):
        sid = s.get('id', f's{i}'); dur = float(s.get('duration_s', 6)); nar = s.get('narration') or ''
        narw = None
        if nar:
            aiff = os.path.join(WORK, f'n{i:02d}.aiff'); narw = os.path.join(WORK, f'n{i:02d}.wav')
            subprocess.run(['say', '-v', VOICE, '-r', RATE, '-o', aiff, nar], check=True)
            subprocess.run([FF, '-y', '-loglevel', 'error', '-i', aiff, '-ar', '48000', '-ac', '2', narw], check=True)
            dur = max(dur, dur_wav(narw) + 0.9)
        # optional title card before the shot
        if s.get('title_card'):
            tc = s['title_card']; html = TITLE_HTML.replace('{{KICKER}}', esc(tc.get('kicker', ''))).replace('{{HEADLINE}}', esc(tc.get('headline', ''))).replace('{{SIZE}}', str(tc.get('size', 96))).replace('{{FOOT}}', esc(tc.get('foot', 'Prepared for Tyler Zachem and the Portfolio Resource Group'))).replace('{{LOGO}}', BASE + 'BSP_Logo.png')
            hp = os.path.join(WORK, f'tc{i:02d}.html'); open(hp, 'w').write(html)
            ctx = browser.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); pg.goto('file://' + hp); pg.wait_for_timeout(900); png = os.path.join(WORK, f'tc{i:02d}.png'); pg.screenshot(path=png); ctx.close()
            tdur = float(tc.get('duration_s', 3.2)); tcv = os.path.join(WORK, f'tc{i:02d}.mp4')
            subprocess.run([FF, '-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-t', f'{tdur}', '-vf', f"scale={W}:{H},zoompan=z='min(zoom+0.0008,1.05)':d={int(tdur*FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},fade=t=in:st=0:d=0.5,fade=t=out:st={tdur-0.5:.2f}:d=0.5,format=yuv420p", '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', str(FPS), tcv], check=True)
            segments.append((tcv, tdur, None)); print(f'  title card {i}: {tdur:.1f}s')
        # record the shot
        ctx = browser.new_context(viewport={'width': W, 'height': H}, record_video_dir=WORK, record_video_size={'width': W, 'height': H}, color_scheme='light')
        pg = ctx.new_page(); pg.goto(BASE + s['url'], wait_until='networkidle'); pg.wait_for_timeout(int(s.get('settle_ms', 1800)))
        a = s.get('action', 'static'); args = s.get('action_args', {}) or {}; t0 = time.time()
        try:
            if a == 'scroll':
                pg.evaluate(SCROLL_JS, {'to': int(args.get('to', 1600)), 'ms': int(args.get('ms', (dur - 1.5) * 1000))})
            elif a == 'type_chat':
                sel = args.get('selector', '.ch textarea'); pg.wait_for_selector(sel, timeout=15000); pg.click(sel)
                pg.type(sel, args.get('text', ''), delay=int(args.get('delay', 42))); pg.wait_for_timeout(500); pg.keyboard.press('Enter')
                try: pg.wait_for_selector('.ch-msg.bot:nth-of-type(2), .ch-thread.open .ch-msg.bot', timeout=20000)
                except Exception: pass
                pg.wait_for_timeout(1200)
                if args.get('scroll_thread', True):
                    pg.wait_for_timeout(int(args.get('read_ms', 1800)))
                    pg.evaluate("""(ms) => { const m = document.querySelector('.ch-msgs'); if (m) { const t0 = performance.now(); const from = m.scrollTop, to = m.scrollHeight - m.clientHeight; (function f(t){ const k = Math.min(1, (t - t0) / ms); m.scrollTop = from + (to - from) * (k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2); if (k < 1) requestAnimationFrame(f); })(t0); } }""", int(args.get('scroll_ms', 6000)))
            elif a == 'hover_cards':
                els = pg.query_selector_all(args.get('selector', '.card'))[:int(args.get('count', 5))]
                for e in els:
                    try: e.scroll_into_view_if_needed(); e.hover(); pg.wait_for_timeout(int(args.get('each_ms', 700)))
                    except Exception: pass
            elif a == 'click_tab':
                for sel in (args.get('selectors') or [args.get('selector')]):
                    if not sel: continue
                    try: pg.click(sel, timeout=5000); pg.wait_for_timeout(int(args.get('each_ms', 2200)))
                    except Exception as e: print('   click failed', sel, e)
                if args.get('then_scroll'): pg.evaluate(SCROLL_JS, {'to': int(args['then_scroll']), 'ms': 2200})
            elif a == 'theater':
                try:
                    # wait until the engine stops reporting a loading state (or the ready flag), up to max_wait_ms
                    deadline = time.time() + int(args.get('max_wait_ms', 95000)) / 1000
                    while time.time() < deadline:
                        st = pg.evaluate("() => ({ready: !!(window.BSPTheater && window.BSPTheater.ready), loading: /Loading/i.test(document.body.innerText || '')})")
                        if st['ready'] or not st['loading']: break
                        pg.wait_for_timeout(1500)
                    pg.wait_for_timeout(int(args.get('extra_ms', 2500)))
                    if args.get('scene'):
                        try: pg.evaluate("(id) => window.BSPTheater && window.BSPTheater.goTo && window.BSPTheater.goTo(id)", args['scene'])
                        except Exception: pass
                    if args.get('play', True):
                        try: pg.evaluate("() => window.BSPTheater && window.BSPTheater.play && window.BSPTheater.play()")
                        except Exception: pass
                except Exception as e: print('   theater wait', e)
            elif a == 'static' and args.get('to'):
                pg.wait_for_timeout(800); pg.evaluate(SCROLL_JS, {'to': int(args['to']), 'ms': int(args.get('ms', 2500))})
        except Exception as e: print('   action error', sid, e)
        remain = dur - (time.time() - t0)
        if remain > 0: pg.wait_for_timeout(int(remain * 1000))
        vpath = pg.video.path(); ctx.close()
        segments.append((vpath, dur, narw)); print(f'  shot {i} {sid}: {dur:.1f}s {a}')
    browser.close()

# ── assemble video: trim/pad each segment, fade edges, concat ────────────────
parts = []
for i, (v, d, _) in enumerate(segments):
    outp = os.path.join(WORK, f'seg{i:02d}.mp4')
    vf = f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,fps={FPS},tpad=stop_mode=clone:stop_duration=2,trim=duration={d:.2f},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.35,fade=t=out:st={max(0,d-.45):.2f}:d=0.45,format=yuv420p"
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', v, '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-r', str(FPS), outp], check=True); parts.append(outp)
lst = os.path.join(WORK, 'list.txt'); open(lst, 'w').write(''.join(f"file '{x}'\n" for x in parts))
vid_only = os.path.join(WORK, 'video.mp4'); subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', vid_only], check=True)
total = sum(d for _, d, _ in segments)
# ── narration track: each segment's narration padded to its duration ─────────
nparts = []
for i, (_, d, nw) in enumerate(segments):
    outp = os.path.join(WORK, f'nar{i:02d}.wav')
    if nw: subprocess.run([FF, '-y', '-loglevel', 'error', '-i', nw, '-af', f'adelay=350|350,apad,atrim=duration={d:.2f}', '-ar', '48000', '-ac', '2', outp], check=True)
    else: subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', f'{d:.2f}', outp], check=True)
    nparts.append(outp)
nlst = os.path.join(WORK, 'nlist.txt'); open(nlst, 'w').write(''.join(f"file '{x}'\n" for x in nparts))
narration = os.path.join(WORK, 'narration.wav'); subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', nlst, '-c', 'copy', narration], check=True)
# ── music bed: synthesized ambient pad + soft pulse (no external assets) ───────
music = os.path.join(WORK, 'music.wav')
expr = ("0.11*sin(2*PI*110*t)*(0.55+0.45*sin(2*PI*0.08*t))"
        "+0.07*sin(2*PI*164.81*t+0.7)*(0.5+0.5*sin(2*PI*0.061*t+1.1))"
        "+0.06*sin(2*PI*220*t+1.9)*(0.5+0.5*sin(2*PI*0.047*t+2.3))"
        "+0.045*sin(2*PI*329.63*t)*(0.5+0.5*sin(2*PI*0.09*t+0.4))"
        "+0.05*sin(2*PI*55*t)*pow(max(0,sin(2*PI*(96/60)*t)),10)"
        "+0.02*sin(2*PI*440*t)*pow(max(0,sin(2*PI*(96/120)*t+0.5)),14)")
subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f"aevalsrc='{expr}':s=48000:c=stereo", '-t', f'{total:.2f}', '-af', f'lowpass=f=1800,highpass=f=40,tremolo=f=0.25:d=0.12,afade=t=in:st=0:d=3,afade=t=out:st={max(0,total-5):.2f}:d=5,volume=0.9', music], check=True)
final = os.path.join(OUT, 'broad_sky_intro.mp4')
subprocess.run([FF, '-y', '-loglevel', 'error', '-i', vid_only, '-i', narration, '-i', music, '-filter_complex', '[1:a]volume=1.0[n];[2:a]volume=0.26[m];[n][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', final], check=True)
poster = os.path.join(OUT, 'intro_poster.jpg'); subprocess.run([FF, '-y', '-loglevel', 'error', '-ss', '1.5', '-i', final, '-frames:v', '1', '-update', '1', '-q:v', '3', poster], check=True)
json.dump({'video': 'broad_sky_intro.mp4', 'poster': 'intro_poster.jpg', 'shots': len(shots), 'duration_seconds': round(total), 'rendered': time.strftime('%Y-%m-%d %H:%M'), 'voice': VOICE}, open(os.path.join(OUT, 'intro_manifest.json'), 'w'), indent=1)
print('wrote', final, os.path.getsize(final) // 1024, 'KB', f'{total:.0f}s'); shutil.rmtree(WORK, ignore_errors=True)
