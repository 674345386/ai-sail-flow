from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import json
import mimetypes
import re

ROOT = Path(__file__).resolve().parent
REFERENCE = ROOT.parent
manifest = json.loads((ROOT / 'assets' / 'manifest.json').read_text())
assets = {}
for item in manifest['assets']:
    url = urlsplit(item['url'])
    if url.netloc != 'elevenlabs.io':
        continue
    key = url.path + ('?' + url.query if url.query else '')
    assets[key] = ROOT / 'assets' / Path(item['path']).name
assets.update({
    '/app_assets/_next/static/chunks/2cb_thnfxm2i1.css': ROOT / 'assets' / 'extra-signin.css',
    '/app_assets/image_assets/_next/image?url=%2Fapp_assets%2F_next%2Fstatic%2Fmedia%2Forb-2.13wqpvpk5upa5.png&w=96&q=75': ROOT / 'assets' / 'extra-orb2.png',
    '/app_assets/image_assets/_next/image?url=%2Fapp_assets%2F_next%2Fstatic%2Fmedia%2Forb-5.3jorciv0f5fuy.png&w=96&q=75': ROOT / 'assets' / 'extra-orb5.png',
})

html = (REFERENCE / 'authenticated-rendered.html').read_text(encoding='utf-8')
html = re.sub(r'<script\b[^>]*>.*?</script\s*>', '', html, flags=re.I | re.S)
html = re.sub(r'<base\b[^>]*>', '', html, flags=re.I)
html = re.sub(r'(<a\b[^>]*?\shref\s*=\s*)(["\']).*?\2', r'\1"#"', html, flags=re.I | re.S)
html = html.replace('https://elevenlabs.io/app_assets/', '/app_assets/')
html = html.replace('https://elevenlabs.io/public_app_assets/', '/public_app_assets/')
payload = html.encode('utf-8')


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/', '/index.html'):
            data, content_type = payload, 'text/html; charset=utf-8'
        else:
            path = assets.get(self.path)
            if path is None or not path.is_file():
                self.send_error(404)
                return
            data = path.read_bytes()
            content_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-same-origin")
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    print('Local snapshot: http://127.0.0.1:4181/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4181), Handler).serve_forever()
