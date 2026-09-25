#!/usr/bin/env python3
"""Render the narrated briefing video (MP4) from the tour script.
Pipeline: tour steps (exported from the running site) -> headless Chrome screenshots -> macOS `say` narration -> ffmpeg (imageio-ffmpeg) concat.
Usage: python3 scripts/make_briefing.py [base_url] ; requires a local server (python3 -m http.server 8765) and Google Chrome.
"""
import json, os, subprocess, sys, shutil, tempfile, time, wave, contextlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
OUT = os.path.join(ROOT, 'briefing'); os.makedirs(OUT, exist_ok=True)
WORK = tempfile.mkdtemp(prefix='briefing_')
import imageio_ffmpeg; FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 1920, 1080

steps = json.load(open(os.path.join(OUT, 'tour_steps.json')))  # exported by scripts/export_tour.py (headless Chrome + scripts/export_tour.html)
print(f"{len(steps)} steps")
segments = []
for i, s in enumerate(steps):
    png = os.path.join(WORK, f'shot_{i:02d}.png'); aiff = os.path.join(WORK, f'nar_{i:02d}.aiff'); wav = os.path.join(WORK, f'nar_{i:02d}.wav')
    url = BASE + (s.get('hash') or '#/home/overview')
    # screenshot: give the page time to load data + tiles
    subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', f'--window-size={W},{H}', '--force-device-scale-factor=1', f'--screenshot={png}', '--virtual-time-budget=12000', '--run-all-compositor-stages-before-draw', '--disable-gpu', url], check=True, capture_output=True, timeout=120)
    text = s.get('narration') or s.get('caption', '')
    import re; text = re.sub(r'<[^>]+>', '', text)
    subprocess.run(['say', '-v', 'Samantha', '-r', '178', '-o', aiff, text], check=True)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', aiff, '-ar', '44100', '-ac', '2', wav], check=True)
    with contextlib.closing(wave.open(wav)) as wf: dur = wf.getnframes() / wf.getframerate()
    dur = max(dur + 0.9, s.get('duration', 0) / 1000.0 * 0.6)
    seg = os.path.join(WORK, f'seg_{i:02d}.mp4')
    # caption overlay (bottom bar): wrapped to ≤3 lines, read from a text file so punctuation needs no escaping
    import textwrap
    cap_txt = re.sub(r'<[^>]+>', '', s.get('caption', ''))
    lines = textwrap.wrap(cap_txt, width=92)[:3]
    capf = os.path.join(WORK, f'cap_{i:02d}.txt'); open(capf, 'w').write('\n'.join(lines))
    bar = 46 + 38 * max(1, len(lines))
    vf = (f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=#0a0e14,"
          f"drawbox=x=0:y=ih-{bar}:w=iw:h={bar}:color=#0a0e14@0.86:t=fill,"
          f"drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:textfile='{capf}':expansion=none:fontcolor=white:fontsize=30:x=(w-text_w)/2:y=h-{bar}+18:line_spacing=8,"
          f"drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='Broad Sky Operating Intelligence  ·  {i+1}/{len(steps)}':fontcolor=#8b98a8:fontsize=20:x=w-text_w-28:y=h-26,"
          f"fade=t=in:st=0:d=0.35,fps=30,format=yuv420p")
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-i', wav, '-t', f'{dur:.2f}', '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-shortest', seg], check=True)
    segments.append(seg); print(f"  step {i+1}: {dur:.1f}s  {url}")

lst = os.path.join(WORK, 'list.txt'); open(lst, 'w').write(''.join(f"file '{s}'\n" for s in segments))
video = os.path.join(OUT, 'broad_sky_briefing.mp4')
subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', video], check=True)
poster = os.path.join(OUT, 'poster.jpg'); subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-ss', '2', '-i', video, '-frames:v', '1', '-q:v', '3', poster], check=True)
total = sum(float(subprocess.run([FFMPEG.replace('ffmpeg', 'ffprobe') if os.path.exists(FFMPEG.replace('ffmpeg', 'ffprobe')) else FFMPEG, '-i', s], capture_output=True, text=True).stderr.split('Duration: ')[1].split(',')[0].split(':')[2]) for s in []) or 0
json.dump({'video': 'broad_sky_briefing.mp4', 'poster': 'poster.jpg', 'steps': len(steps), 'rendered': time.strftime('%Y-%m-%d %H:%M'), 'duration_label': f'{len(steps)} chapters · {int(sum(1 for _ in segments))} segments'}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print('wrote', video, os.path.getsize(video) // 1024, 'KB')
shutil.rmtree(WORK, ignore_errors=True)
