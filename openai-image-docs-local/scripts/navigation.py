"""One header and context-navigation renderer for Home, sections and docs."""
from html import escape
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SECTIONS = json.loads((ROOT / 'navigation.json').read_text())

def render_header(section='home'):
    source = (ROOT / 'reference/page.html').read_text()
    def icons(marker):
        button = re.search(r'<button\b[^>]*' + marker + r'[^>]*>.*?</button>', source, re.S).group(0)
        return re.findall(r'<svg\b.*?</svg>', button, re.S)
    theme = icons('id="header-theme-button"')
    external = re.search(r'<svg\b.*?</svg>', source[source.index('API Dashboard'):], re.S).group(0)
    chevron = re.search(r'<svg\b[^>]*class="[^"]*lucide-chevron-down[^>]*>.*?</svg>', (ROOT / 'reference/runway-home.html').read_text(), re.S).group(0)
    values = {'chevron': chevron, 'search': icons('data-header-search-button')[0], 'sun': theme[0], 'moon': theme[1], 'external': external, 'menu': icons('id="header-drawer-button"')[0]}
    header = (ROOT / 'header.html').read_text()
    for name, svg in values.items():
        svg = re.sub(r'(<svg\b[^>]*?)\sclass="[^"]*"', r'\1', svg)
        header = header.replace('{{' + name + '}}', svg)
    def select(match):
        tag = match.group(0)
        if 'class="' in tag:
            tag = re.sub(r'class="([^"]*)"', lambda m: 'class="' + m.group(1) + ' ip-head-selected"', tag)
        else:
            tag = tag[:-1] + ' class="ip-head-selected">'
        return tag[:-1] + ' aria-current="page">'
    return re.sub(r'<a\b[^>]*data-ip-section="' + section + r'"[^>]*>', select, header)

def render_subnav(section, current):
    data = SECTIONS[section]
    items = []
    for item in data['items']:
        active = ' aria-current="page"' if item['href'] == current else ''
        items.append(f'<a class="ip-section-link" href="{escape(item["href"], quote=True)}"{active}>{escape(item["label"])}</a>')
    return f'<nav class="ip-section-nav" aria-label="{data["label"]} sections"><div>{"".join(items)}</div></nav>'
