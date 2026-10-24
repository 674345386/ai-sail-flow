"""Build the local landing pages behind the site's new navigation groups."""
from html import escape
from pathlib import Path
from navigation import ROOT, SECTIONS, render_header, render_subnav

DIST = ROOT / 'dist'
DOCS = '/api/docs/guides/image-generation'

def card(title, description, href):
    return f'<a class="ip-section-card" href="{escape(href, quote=True)}"><h2>{escape(title)}</h2><p>{escape(description)}</p><span>Explore ↗</span></a>'

count = 0
for section, data in SECTIONS.items():
    for index, item in enumerate(data['items']):
        path = item['href']
        if not path.startswith('/' + section + '/'):
            continue
        title = data['label'] if index == 0 else item['label']
        description = data['description'] if index == 0 else item['description']
        content = ''
        if section == 'developers':
            content = '<div class="ip-section-cards">' + card('Image generation', '了解如何生成、编辑图像，以及调整输出参数。', DOCS) + card('API reference', '浏览 OpenAI API 的接口参考。', 'https://platform.openai.com/docs/api-reference') + '</div>'
        elif section == 'product' and index in [0, 1]:
            content = '<div class="ip-section-cards">' + card('个人IP网', '浏览创作展示与产品入口。', '/') + card('Image generation', '图像生成使用文档与代码示例。', DOCS) + '</div>'
        else:
            text = '还没有发布文章。' if section == 'blog' else '还没有发布作品。' if item['label'] == 'Showcase' else '还没有发布更新。'
            content = f'<div class="ip-section-empty"><p>{text}</p></div>'
        page = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)} · 个人IP网</title><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/header.css"><link rel="stylesheet" href="/sections.css"><script src="/js/theme.js"></script></head><body class="ip-section-page">{render_header(section)}{render_subnav(section, path)}<main class="ip-section-content"><a class="ip-section-breadcrumb" href="/{section}/">{data['label']}</a><h1>{escape(title)}</h1><p class="ip-section-intro">{escape(description)}</p>{content}</main><script src="/header.js" defer></script></body></html>'''
        folder = DIST / path.lstrip('/')
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'index.html').write_text(page)
        count += 1
(DIST / 'sections.css').write_text((ROOT / 'sections.css').read_text())
(DIST / 'navigation.json').write_text((ROOT / 'navigation.json').read_text())
print(f'Built {count} section pages with context navigation.')
