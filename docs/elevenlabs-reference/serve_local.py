from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
LOCAL_ONLY_CSP = (
    "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; connect-src 'none'; "
    "object-src 'none'; frame-src 'none'; form-action 'self'; base-uri 'self'; "
    "img-src 'self' data: blob:; font-src 'self' data:; "
    "style-src 'self' 'unsafe-inline'; media-src 'self' data: blob:; navigate-to 'self'"
)

class SnapshotHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_local_html(self, body):
        payload = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Security-Policy", LOCAL_ONLY_CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path.startswith("/app/"):
            html = (ROOT / "local-clone" / "index.html").read_text(encoding="utf-8", errors="replace")
            self.send_local_html(html)
            return
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/app/agents/templates?trigger=wizard")
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        if self.path.startswith("/app_assets/") or self.path.startswith("/public_app_assets/"):
            self.send_header("Content-Security-Policy", LOCAL_ONLY_CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

ThreadingHTTPServer(("127.0.0.1", 4178), SnapshotHandler).serve_forever()
