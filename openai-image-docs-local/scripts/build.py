"""Build a self-contained local edition of the requested reference page."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import re
import subprocess
import sys
from navigation import render_header, render_subnav

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
ORIGIN = 'https://developers.openai.com'
PAGE = '/api/docs/guides/image-generation'
source = (ROOT / 'reference/page.html').read_text()

# Keep the published UI and its components, without hosted telemetry/router or chat.
source = re.sub(r'<script\b([^>]*)>(.*?)</script>', lambda m: '' if any(x in m.group(0) for x in ['ClientRouter.astro', 'Header.astro_astro_type_script', 'window.__headerNavigationInitialized', 'Analytics.astro', 'DocsAgentLauncher.astro', 'WebMcp.astro', 'chatkit.js', 'window.siq', 'window.__docsAgentChatKitMoveGuardInstalled', 'function initializeDocsAgentLauncher']) else m.group(0), source, flags=re.S)
source = re.sub(r'<astro-island\b[^>]*AlgoliaSearch[^>]*>', lambda m: re.sub(r'\sclient="[^"]*"', '', m.group(0)), source)

assets = set()
external = {}

def register(value, base=ORIGIN + PAGE):
    if value.startswith('/assets/cdn/'):
        value = 'https://cdn.openai.com/' + value[len('/assets/cdn/'):]
    url = urljoin(base, value)
    p = urlsplit(url)
    if p.netloc not in ['developers.openai.com', 'cdn.openai.com']:
        return value
    if not re.search(r'\.(css|js|mjs|png|jpe?g|webp|svg|gif|woff2?|ttf|ico)(?:$)', p.path, re.I):
        return value
    url = p._replace(query='', fragment='').geturl()
    assets.add(url)
    if p.netloc == 'cdn.openai.com':
        local = '/assets/cdn' + p.path
        external[url] = local
        return local
    return p.path

class Inventory(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value and key in ['src', 'href', 'component-url', 'renderer-url', 'poster']:
                if tag != 'a':
                    register(value)

Inventory().feed(source)
seen = set()
failures = []

def download(url):
    p = urlsplit(url)
    rel = external.get(url, p.path)
    target = DIST / unquote(rel).lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        result = subprocess.run(['curl', '--http1.1', '-fsSL', '--max-time', '120', '--retry', '1', '--retry-all-errors', url, '-o', str(target)], capture_output=True)
        if result.returncode:
            target.unlink(missing_ok=True)
            return url, None, result.stderr.decode()[-160:]
    if p.path.endswith(('.css', '.js', '.mjs')):
        return url, target.read_text(), None
    return url, None, None

while pending := sorted(assets - seen):
    seen.update(pending)
    print(f'Localizing {len(pending)} assets ({len(seen)} total)', flush=True)
    with ThreadPoolExecutor(max_workers=12) as pool:
        for url, content, error in pool.map(download, pending):
            if error:
                failures.append((url, error))
                continue
            if content is None:
                continue
            # Follow bundled module imports, dynamic chunks, styles and font URLs.
            refs = re.findall(r'["\'`]((?:\./|\.\./|/_astro/|/images/|https://cdn\.openai\.com/)[^"\'`\s<>]+?\.(?:js|mjs|css|woff2?|ttf|svg|png|webp|jpe?g)(?:\?[^"\'`\s]*)?)["\'`]', content)
            refs += re.findall(r'url\(["\']?([^\s)"\']+)["\']?\)', content)
            for ref in refs:
                local = register(ref, url)
                if local != ref:
                    content = content.replace(ref, local)
            target = DIST / unquote(external.get(url, urlsplit(url).path)).lstrip('/')
            target.write_text(content)

if failures:
    for url, error in failures:
        print(f'FAILED {url}: {error}')
    raise SystemExit('Asset localization failed; run the build again to retry.')

for url, local in external.items():
    source = source.replace(url, local)

# Unmirrored documentation remains an explicit link to the official website.
def link(match):
    path = match.group(1)
    if path == '/':
        return 'href="/"'
    if path.split('#')[0].rstrip('/') == PAGE:
        return 'href="' + (path[len(PAGE):] or PAGE) + '"'
    return 'href="' + ORIGIN + path + '"'
source = re.sub(r'href="(/(?!_astro/|assets/|images/|favicon)[^"]*)"', link, source)
source = re.sub(r'<header\b[^>]*id="header"[^>]*>.*?</header>', lambda _: render_header('developers'), source, count=1, flags=re.S)
source = re.sub(r'<div\b[^>]*data-context-subnav[^>]*>.*?</nav>\s*</div>', lambda _: render_subnav('developers', PAGE), source, count=1, flags=re.S)
source = source.replace('<body ', '<body data-ip-document ', 1)
source = source.replace('</head>', '<link rel="stylesheet" href="/local.css"><link rel="stylesheet" href="/header.css"></head>')
source = source.replace('</body>', '<script src="/local.js" defer></script><script src="/header.js" defer></script></body>')
(DIST / 'index.html').write_text(source)
deep = DIST / PAGE.lstrip('/')
deep.mkdir(parents=True, exist_ok=True)
(deep / 'index.html').write_text(source)
for name in ['local.css', 'local.js']:
    (DIST / name).write_text((ROOT / name).read_text())
print(f'Built page with {len(seen)} local assets.', flush=True)
subprocess.run([sys.executable, str(ROOT / 'scripts/build-home.py')], check=True)
