#!/usr/bin/env python3
"""Local-only design preview with explicit, persisted user selection."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import datetime
import json
import subprocess

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent
DATA = PROJECT_ROOT / '.site-atlas'
PROJECT_ID = '9d346190-48b6-43ff-ac47-ed68a8b3f4a1'
NODE_ID = 'page-8a5edab282632443'
ATLAS = Path('/Users/cppeng/.codex/skills/site-atlas/scripts/atlas.mjs')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def json_response(self, status, data):
        content = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        if urlsplit(self.path).path == '/api/selection':
            selected_file = ROOT / 'selection.json'
            try:
                choice = json.loads(selected_file.read_text()) if selected_file.exists() else {'key': None}
            except (OSError, ValueError):
                choice = {'key': None}
            return self.json_response(200, choice)
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != '/api/selection':
            return self.json_response(404, {'error': 'not-found'})
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.json_response(403, {'error': 'origin'})
        if self.headers.get_content_type() != 'application/json':
            return self.json_response(415, {'error': 'content-type'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 512:
                raise ValueError('length')
            key = json.loads(self.rfile.read(length)).get('key')
            if key not in ('a', 'b', 'c'):
                raise ValueError('key')
        except (ValueError, TypeError, AttributeError):
            return self.json_response(400, {'error': 'invalid-selection'})
        result = subprocess.run([
            'node', str(ATLAS), 'select', '--project', PROJECT_ID, '--node', NODE_ID,
            '--key', key, '--note', 'User explicitly selected in the local landing-page comparison.',
            '--data', str(DATA),
        ], capture_output=True, timeout=10)
        if result.returncode:
            return self.json_response(500, {'error': 'selection-not-saved'})
        choice = {'key': key, 'name': {'a': '居中光场', 'b': '灵感光场', 'c': '专注画布'}[key],
                  'selectedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'projectId': PROJECT_ID, 'nodeId': NODE_ID}
        (ROOT / 'selection.json').write_text(json.dumps(choice, ensure_ascii=False, indent=2))
        self.json_response(200, choice)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4319)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Landing comparison: http://127.0.0.1:{args.port}/', flush=True)
    server.serve_forever()
