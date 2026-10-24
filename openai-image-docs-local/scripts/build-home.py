"""Localize Runway's published homepage, then connect it to the personal IP site."""
from concurrent.futures import ThreadPoolExecutor
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, parse_qs
import hashlib
import json
import re
import subprocess
import sys
from navigation import render_header

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
DOCS = '/api/docs/guides/image-generation'
ORIGIN = 'https://runway.com'
assets = {}

def asset(value):
    if value.startswith(('data:', '#')):
        return value
    url = urljoin(ORIGIN, value)
    path = urlsplit(url).path
    suffix = Path(path).suffix
    if path == '/_next/image':
        original = parse_qs(urlsplit(url).query).get('url', ['image.webp'])[0]
        suffix = Path(urlsplit(original).path).suffix
    if suffix not in ['.woff2', '.woff', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.mp4']:
        suffix = '.webp'
    local = '/home-assets/' + hashlib.sha256(url.encode()).hexdigest()[:18] + suffix
    assets[url] = local
    return local

def anchor(value):
    if value.startswith(('#', 'mailto:', 'tel:')):
        return value
    if value in ['/', '/home', '/home/']:
        return '/'
    if value.startswith(('https://dev.runwayml.com', 'https://docs.dev.runwayml.com', 'https://app.runwayml.com')):
        return DOCS
    return urljoin(ORIGIN, value)

source = (ROOT / 'reference/runway-home.html').read_text()
source = re.sub(r'<script\b[^>]*>.*?</script>', '', source, flags=re.S)
source = re.sub(r'<title>.*?</title>', '<title>个人IP网 | Home</title>', source)
# Keep the Runway content, with the document site's single-row navigation above it.
source = re.sub(r'<header\b.*?</header>', '<!--personal-ip-header-->', source, count=1, flags=re.S)

class Localize(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.output = []
        self.in_style = False
        self.image_index = 0
        self.media = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'link' and d.get('rel') in ['preload', 'preconnect', 'alternate', 'canonical'] and d.get('as') != 'font':
            return
        if tag == 'img':
            candidates = []
            for item in d.get('srcset', '').split(','):
                parts = item.strip().split()
                if parts:
                    descriptor = parts[-1]
                    width = int(descriptor[:-1]) if descriptor.endswith('w') and descriptor[:-1].isdigit() else 1280
                    candidates.append((width, parts[0]))
            valid = [pair for pair in candidates if pair[0] <= 1280]
            value = max(valid or candidates, default=(0, d.get('src', '')))[1]
            if value:
                d['src'] = asset(value)
                self.media.append({'src': d['src'], 'alt': d.get('alt', '')})
            for name in ['srcset', 'sizes', 'data-nimg']:
                d.pop(name, None)
            if 'image.mux.com/JFHOwdZ8' in value:
                d['id'] = 'ip-hero-poster'
            self.image_index += 1
        if tag == 'a' and 'href' in d:
            d['href'] = anchor(d['href'])
            if d['href'] == DOCS:
                d.pop('target', None)
                d.pop('aria-haspopup', None)
                d.pop('aria-expanded', None)
        if tag == 'link' and d.get('href') and (d.get('as') == 'font' or d.get('rel') == 'icon'):
            d['href'] = asset(d['href'])
        if tag == 'style':
            self.in_style = True
        self.output.append('<' + tag + ''.join(' ' + k + ('="' + escape(v, quote=True) + '"' if v is not None else '') for k, v in d.items()) + '>')

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == 'style':
            self.in_style = False
        self.output.append('</' + tag + '>')

    def handle_data(self, data):
        if self.in_style:
            data = re.sub(r'url\(["\']?([^\s)"\']+)["\']?\)', lambda m: 'url(' + asset(m.group(1)) + ')' if not m.group(1).startswith('data:') else m.group(0), data)
        self.output.append(data)

    def handle_entityref(self, name): self.output.append('&' + name + ';')
    def handle_charref(self, name): self.output.append('&#' + name + ';')
    def handle_comment(self, value): self.output.append('<!--' + value + '-->')
    def handle_decl(self, value): self.output.append('<!' + value + '>')

page = Localize()
page.feed(source)
showcase = json.loads((ROOT / 'reference/showcase.json').read_text())
for item in showcase['creative']:
    item['poster'] = asset(item['poster'])
for key, value in showcase['devVideos'].items():
    showcase['devVideos'][key] = asset(value)
for item in showcase['recipes']:
    item['poster'] = asset(item['poster'])
source = ''.join(page.output)
source = source.replace('<!--personal-ip-header-->', render_header('home'))
source = source.replace('</head>', '<link rel="stylesheet" href="/home.css"><link rel="stylesheet" href="/header.css"><script src="/js/theme.js"></script></head>')
source = source.replace('</body>', '<script src="/header.js" defer></script><script src="/home.js" defer></script></body>')

def download(item):
    url, local = item
    target = DIST / local.lstrip('/')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix(target.suffix + '.part')
        result = subprocess.run(['curl', '--http1.1', '-fsSL', '--max-time', '75', '--retry', '1', '--retry-all-errors', url, '-o', str(temporary)], capture_output=True)
        if result.returncode:
            temporary.unlink(missing_ok=True)
            return url + ': ' + result.stderr.decode()[-180:]
        temporary.replace(target)
    return None

print(f'Localizing {len(assets)} homepage assets', flush=True)
with ThreadPoolExecutor(max_workers=8) as pool:
    failures = [failure for failure in pool.map(download, assets.items()) if failure]
if failures:
    raise SystemExit('\n'.join(failures))
subprocess.run([sys.executable, str(ROOT / 'scripts/cache-hero.py')], check=True)

(DIST / 'home-assets/media.json').write_text(json.dumps(page.media))
(DIST / 'home-assets/showcase.json').write_text(json.dumps(showcase))
for name in ['home.css', 'home.js', 'header.css', 'header.js']:
    (DIST / name).write_text((ROOT / name).read_text())
(DIST / 'index.html').write_text(source)
(DIST / 'home').mkdir(exist_ok=True)
(DIST / 'home/index.html').write_text(source)
print('Built personal IP Home at / and /home/', flush=True)
subprocess.run([sys.executable, str(ROOT / 'scripts/build-sections.py')], check=True)
