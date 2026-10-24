"""Cache the reference's silent hero video, without re-encoding it."""
from pathlib import Path
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / 'dist/home-assets/hero.mp4'
if target.is_file() and target.stat().st_size > 0:
    raise SystemExit(0)
ffmpeg = os.environ.get('FFMPEG_BIN') or shutil.which('ffmpeg')
if not ffmpeg:
    candidate = ROOT.parent / 'node_modules/ffmpeg-static/ffmpeg'
    if candidate.is_file(): ffmpeg = str(candidate)
if not ffmpeg:
    raise SystemExit('ffmpeg is needed once to cache the Home video. Set FFMPEG_BIN to its path.')
result = subprocess.run(['curl', '--http1.1', '-fsSL', '--max-time', '30', 'https://stream.mux.com/JFHOwdZ8ujlrDDSLujoSv9su9PQb5001CiRiNdMgIjnk.m3u8'], capture_output=True, check=True)
lines = result.stdout.decode().splitlines()
url = next(lines[i + 1] for i, line in enumerate(lines) if 'RESOLUTION=1280x' in line)
target.parent.mkdir(parents=True, exist_ok=True)
temporary = target.with_name('hero.partial.mp4')
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-rw_timeout', '20000000', '-i', url, '-map', '0:v:0', '-c', 'copy', '-an', '-movflags', '+faststart', str(temporary)], check=True)
temporary.replace(target)
