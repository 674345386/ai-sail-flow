"""Extract the black-background turntable into RGBA frames for Remotion.

Needs numpy and opencv-python-headless. The largest filled silhouette keeps
dark hair and fabric opaque while discarding the outer black background.
"""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.python-deps'))
import cv2
import numpy as np

WIDTH, HEIGHT, FPS = 810, 1440, 24
output = ROOT / 'public' / 'model-matte'
output.mkdir(parents=True, exist_ok=True)
decoder = subprocess.Popen([
    'ffmpeg', '-v', 'error', '-i', str(ROOT / 'public/turntable-source.mp4'),
    '-vf', f'scale={WIDTH}:{HEIGHT},fps={FPS}', '-f', 'rawvideo',
    '-pix_fmt', 'bgr24', 'pipe:1',
], stdout=subprocess.PIPE)
frame_bytes = WIDTH * HEIGHT * 3
index = 0
while True:
    raw = decoder.stdout.read(frame_bytes)
    if not raw:
        break
    if len(raw) != frame_bytes:
        raise RuntimeError('Incomplete decoded video frame')
    bgr = np.frombuffer(raw, dtype=np.uint8).reshape(HEIGHT, WIDTH, 3)
    signal = np.max(bgr, axis=2)
    binary = ((signal > 16) * 255).astype(np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise RuntimeError(f'No foreground in frame {index}')
    silhouette = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    cv2.drawContours(silhouette, [max(contours, key=cv2.contourArea)], -1, 255, cv2.FILLED)
    alpha = cv2.GaussianBlur(silhouette, (3, 3), 0.55)
    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    if not cv2.imwrite(str(output / f'{index:03d}.png'), rgba, [cv2.IMWRITE_PNG_COMPRESSION, 3]):
        raise RuntimeError('Could not write matte frame')
    index += 1
    if index % 48 == 0:
        print(f'Matted {index} frames', flush=True)
decoder.stdout.close()
if decoder.wait() != 0:
    raise RuntimeError('FFmpeg failed')
(output / 'metadata.json').write_text(json.dumps({
    'width': WIDTH, 'height': HEIGHT, 'fps': FPS, 'frames': index,
    'method': 'largest filled silhouette from black background, feathered edge',
}, indent=2))
print(f'Saved {index} transparent frames to {output}', flush=True)
