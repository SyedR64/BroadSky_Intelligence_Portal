#!/usr/bin/env python3
"""Render sample 15-second CTV spots from the 'spot_render' specs in data/research/pp_ads.json.
Scenes are brand-styled HTML cards rendered with Playwright, animated with ffmpeg (zoom + fades), voiced with macOS `say`, with a synthesized music bed.
Usage: python3 scripts/make_ads.py [specs.json]   → briefing/ads/<id>.mp4 (+ .jpg poster)"""
import json, os, re, subprocess, sys, tempfile, wave, contextlib, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'data', 'research', 'pp_ads.json')
OUT = os.path.join(ROOT, 'briefing', 'ads'); os.makedirs(OUT, exist_ok=True)
import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
from playwright.sync_api import sync_playwright
W, H, FPS = 1920, 1080, 30
VOICE = os.environ.get('BSP_VOICE', 'Samantha')
j = json.load(open(SPEC)); specs = [i for i in j.get('items', j if isinstance(j, list) else [])] if isinstance(j, dict) else j
specs = [s for s in specs if s.get('kind') == 'spot_render' or s.get('scenes')]
print(len(specs), 'spots')
STYLES = {
  'storm': 'background:radial-gradient(900px 600px at 70% 20%,rgba(76,141,255,.45),transparent 60%),linear-gradient(180deg,#0b1a2e,#05080f);',
  'night': 'background:radial-gradient(900px 600px at 30% 80%,rgba(240,138,60,.35),transparent 60%),linear-gradient(180deg,#0a0e14,#141a24);',
  'sun': 'background:radial-gradient(1000px 700px at 80% 15%,rgba(255,196,80,.75),transparent 60%),linear-gradient(180deg,#ffe8c2,#f6b36b);color:#1a1208;',
  'home': 'background:radial-gradient(900px 600px at 20% 30%,rgba(240,138,60,.45),transparent 60%),linear-gradient(180deg,#1b2a44,#0e1829);',
  'brand': 'background:linear-gradient(135deg,#0f2a56,#f08a3c 140%);',
}
SCENE = """<!doctype html><html><head><meta charset=utf-8><link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;900&display=swap" rel=stylesheet>
<style>html,body{margin:0;height:100%;font-family:Inter,system-ui,sans-serif;color:#fff;overflow:hidden}
.s{position:absolute;inset:0;{{STYLE}}}
.rain{position:absolute;inset:0;background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.07) 0 2px,transparent 2px 22px);opacity:{{RAIN}}}
.wrap{position:absolute;left:140px;right:140px;bottom:170px}
.k{font-size:26px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;opacity:.75;margin-bottom:18px}
h1{font-size:{{SIZE}}px;font-weight:900;letter-spacing:-.035em;line-height:.98;margin:0;max-width:1400px}
.sub{font-size:40px;font-weight:500;margin-top:26px;opacity:.9;max-width:1300px}
.cta{display:inline-block;margin-top:38px;padding:22px 40px;border-radius:999px;background:#f08a3c;color:#fff;font-size:34px;font-weight:800;box-shadow:0 20px 60px rgba(240,138,60,.45)}
.brand{position:absolute;right:140px;top:110px;display:flex;gap:14px;align-items:center;font-weight:800;font-size:30px;letter-spacing:-.01em}
.brand i{width:46px;height:46px;border-radius:14px;background:#f08a3c;display:inline-block}
.legal{position:absolute;left:140px;bottom:70px;font-size:20px;opacity:.55}</style></head>
<body><div class=s></div><div class=rain></div><div class=brand><i></i>Punctual Pros</div><div class=wrap><div class=k>{{KICKER}}</div><h1>{{HEAD}}</h1><div class=sub>{{SUB}}</div>{{CTA}}</div><div class=legal>{{LEGAL}}</div></body></html>"""
def esc(s): return str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def dur_wav(p):
    with contextlib.closing(wave.open(p)) as w: return w.getnframes() / w.getframerate()

with sync_playwright() as p:
    br = p.chromium.launch()
    for sp in specs:
        sid = re.sub(r'[^a-z0-9]+', '-', str(sp.get('id', sp.get('title', 'spot'))).lower()).strip('-'); WORK = tempfile.mkdtemp(prefix='ad_')
        scenes = sp['scenes']; total = sum(float(sc.get('duration_s', 3)) for sc in scenes)
        segs = []
        for i, sc in enumerate(scenes):
            html = SCENE.replace('{{STYLE}}', STYLES.get(sc.get('style', 'brand'), STYLES['brand'])).replace('{{RAIN}}', '0.9' if sc.get('style') == 'storm' else '0').replace('{{KICKER}}', esc(sc.get('kicker', 'One Hour · Benjamin Franklin · Mister Sparky'))).replace('{{HEAD}}', esc(sc.get('headline', ''))).replace('{{SUB}}', esc(sc.get('sub', ''))).replace('{{CTA}}', f"<div class=cta>{esc(sc.get('cta_text', 'Book in 60 seconds · punctualpros.com'))}</div>" if sc.get('cta') else '').replace('{{SIZE}}', str(sc.get('size', 112))).replace('{{LEGAL}}', esc(sp.get('legal', 'Concept creative prepared for Broad Sky Partners · not an actual advertisement')))
            hp = os.path.join(WORK, f'sc{i}.html'); open(hp, 'w').write(html)
            ctx = br.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page(); pg.goto('file://' + hp); pg.wait_for_timeout(700); png = os.path.join(WORK, f'sc{i}.png'); pg.screenshot(path=png); ctx.close()
            d = float(sc.get('duration_s', 3)); mp4 = os.path.join(WORK, f'sc{i}.mp4')
            zoom = f"zoompan=z='min(zoom+0.0012,1.08)':d={int(d*FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}" if i % 2 == 0 else f"zoompan=z='if(eq(on,1),1.08,max(zoom-0.0012,1.0))':d={int(d*FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}"
            subprocess.run([FF, '-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-t', f'{d}', '-vf', f"scale={W}:{H},{zoom},fade=t=in:st=0:d=0.3,fade=t=out:st={max(0,d-0.3):.2f}:d=0.3,format=yuv420p", '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-r', str(FPS), mp4], check=True); segs.append(mp4)
        lst = os.path.join(WORK, 'l.txt'); open(lst, 'w').write(''.join(f"file '{s}'\n" for s in segs))
        vid = os.path.join(WORK, 'v.mp4'); subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', vid], check=True)
        aiff = os.path.join(WORK, 'vo.aiff'); vo = os.path.join(WORK, 'vo.wav')
        subprocess.run(['say', '-v', VOICE, '-r', '168', '-o', aiff, sp.get('voice_text', '')], check=True); subprocess.run([FF, '-y', '-loglevel', 'error', '-i', aiff, '-ar', '48000', '-ac', '2', '-af', 'adelay=600|600', vo], check=True)
        mood = sp.get('music_mood', 'warm')
        expr = ("0.10*sin(2*PI*130.81*t)*(0.6+0.4*sin(2*PI*0.12*t))+0.07*sin(2*PI*196*t+0.6)*(0.5+0.5*sin(2*PI*0.09*t+1))+0.05*sin(2*PI*261.63*t)*(0.5+0.5*sin(2*PI*0.07*t))+0.06*sin(2*PI*65.4*t)*pow(max(0,sin(2*PI*(104/60)*t)),9)" if mood != 'storm' else
                "0.11*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.1*t))+0.07*sin(2*PI*146.83*t+0.6)*(0.5+0.5*sin(2*PI*0.08*t+1))+0.05*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*0.06*t))+0.07*sin(2*PI*55*t)*pow(max(0,sin(2*PI*(92/60)*t)),10)")
        music = os.path.join(WORK, 'm.wav'); subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', f"aevalsrc='{expr}':s=48000:c=stereo", '-t', f'{total:.2f}', '-af', f'lowpass=f=2200,highpass=f=45,afade=t=in:st=0:d=0.8,afade=t=out:st={max(0,total-1.5):.2f}:d=1.5', music], check=True)
        final = os.path.join(OUT, f'{sid}.mp4')
        subprocess.run([FF, '-y', '-loglevel', 'error', '-i', vid, '-i', vo, '-i', music, '-filter_complex', '[1:a]apad,atrim=duration=' + f'{total:.2f}' + ',volume=1.0[n];[2:a]volume=0.3[m];[n][m]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', final], check=True)
        subprocess.run([FF, '-y', '-loglevel', 'error', '-ss', '1', '-i', final, '-frames:v', '1', '-update', '1', '-q:v', '3', final[:-4] + '.jpg'], check=True)
        print('wrote', final, os.path.getsize(final) // 1024, 'KB', f'{total:.0f}s'); shutil.rmtree(WORK, ignore_errors=True)
