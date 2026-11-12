import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createLandingPageStore, registerLandingPageReadRoutes, registerLandingPageWriteRoutes } from '../server/landing-editor';
import { emptyLandingDocument, landingDocumentSchema, landingElementSchema, landingStyleSchema, landingStyleToCss, safeLandingUrl, type LandingDocument } from '../shared/landing-editor';

assert.equal(safeLandingUrl('javascript:alert(1)', true), false);
assert.equal(safeLandingUrl('//untrusted.example/image.png'), false);
assert.equal(safeLandingUrl('data:text/html,<script>alert(1)</script>'), false);
assert.equal(safeLandingUrl('/assets/image.png'), true);
assert.equal(safeLandingUrl('#create', true), true);
assert.equal(landingStyleSchema.safeParse({ width: -1 }).success, false);
assert.equal(landingStyleSchema.safeParse({ color: '#12345' }).success, false);
assert.equal(landingStyleSchema.safeParse({ backgroundImage: 'url(javascript:alert(1))' }).success, false);
assert.equal(landingElementSchema.safeParse({ text: { 'zh-CN': ['只修改中文'] } }).success, true);
assert.match(landingStyleToCss({ x: 32, width: 400, fontSize: 28 }), /translate:32px 0px!important/);
assert.equal(Object.hasOwn(landingDocumentSchema.parse({ ...emptyLandingDocument(), elements: JSON.parse('{"__proto__":{"hidden":true}}') }).elements, '__proto__'), false);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sop-landing-editor-'));
const store = createLandingPageStore(directory);
const app = express(); app.use(express.json());
registerLandingPageReadRoutes(app, store);
registerLandingPageWriteRoutes(app, store, req => req.get('X-Editor') === 'allowed');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address(); assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const put = (body: unknown, allowed = true) => fetch(`${base}/api/landing-page`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(allowed ? { 'X-Editor': 'allowed' } : {}) }, body: JSON.stringify(body) });
try {
  assert.deepEqual(await (await fetch(`${base}/api/landing-page`)).json(), emptyLandingDocument());
  assert.equal((await put({ revision: 0, elements: {} }, false)).status, 403);
  assert.equal((await put({ revision: 0, elements: { 'lpe-test-node': { desktop: { width: -200 } } } })).status, 400);
  const elements = { 'lpe-test-node': { desktop: { x: 24, width: 600, fontSize: 48 }, mobile: { width: 320, fontSize: 28 }, text: { 'zh-CN': ['新的标题'], en: ['New heading'] }, attributes: { src: '/assets/example.png' } } };
  const response = await put({ revision: 0, elements }); assert.equal(response.status, 200);
  const saved = landingDocumentSchema.parse(await response.json());
  assert.equal(saved.revision, 1); assert.deepEqual(saved.elements, elements);
  assert.deepEqual(createLandingPageStore(directory).read(), saved, 'A new store must reload the saved page from disk');
  assert.equal((await put({ revision: 0, elements: {} })).status, 409, 'Stale tabs cannot overwrite newer edits');
  assert.deepEqual(await (await fetch(`${base}/api/landing-page`)).json(), saved);
  const fake = new FormData(); fake.append('file', new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/png' }), 'fake.png');
  assert.equal((await fetch(`${base}/api/landing-page/assets`, { method: 'POST', headers: { 'X-Editor': 'allowed' }, body: fake })).status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZioAAAAASUVORK5CYII=', 'base64');
  const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'example.png');
  const uploaded = await fetch(`${base}/api/landing-page/assets`, { method: 'POST', headers: { 'X-Editor': 'allowed' }, body: form });
  assert.equal(uploaded.status, 201); const asset = await uploaded.json() as { url: string; kind: string };
  assert.equal(asset.kind, 'image');
  const publicImage = await fetch(base + asset.url); assert.equal(publicImage.status, 200); assert.match(publicImage.headers.get('Content-Type') || '', /image\/png/);
  assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), png);
  assert.equal(fs.readdirSync(store.incoming).length, 0, 'Uploads leave no temporary files');
  assert.equal((await put({ revision: saved.revision, elements: {} })).status, 200);
  assert.deepEqual(store.read().elements, {}, 'Restore original removes all saved overrides');
  console.log('PASS · validation, per-language edits, responsive CSS, access control, atomic save/reload, stale-version conflict, verified media upload, restore original');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  fs.rmSync(directory, { recursive: true, force: true });
}

// Optional lightweight DOM engine: no real browser or computer automation.
const domModulePath = process.argv.find(argument => argument.startsWith('--dom='))?.slice(6);
if (domModulePath) {
  const { parseHTML } = await import(pathToFileURL(path.resolve(domModulePath)).href);
  const { window } = parseHTML('<html><head></head><body><div class="landing-page"><section id="create"><h1 id="title">Original heading</h1><button class="create"><span>Start</span><svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg></button><h2 id="multi">First line<br>Second line</h2><img src="/assets/original.png"><div class="model-group"><span>Model</span></div><div class="model-group" aria-hidden="true"><span>Model</span></div><div data-scene="commerce"><p>Commerce copy</p></div></section></div></body></html>');
  const properties = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement, SVGSVGElement: window.SVGElement,
    MutationObserver: window.MutationObserver, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 1), cancelAnimationFrame: (id: number) => clearTimeout(id),
    getComputedStyle: () => ({ color: 'rgb(0, 0, 0)', fontSize: '32px', lineHeight: '40px' }),
  })) { properties.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  let dom: import('../src/landing-editor/dom').LandingEditorDom | undefined;
  try {
    const { createLandingEditorDom } = await import('../src/landing-editor/dom');
    const root = window.document.querySelector('.landing-page');
    dom = createLandingEditorDom(root, () => {});
    const title = dom.list().find(node => node.element.id === 'title')!;
    const button = dom.list().find(node => node.tag === 'button')!;
    const image = dom.list().find(node => node.tag === 'img')!;
    const multi = dom.list().find(node => node.element.id === 'multi')!;
    const groups = root.querySelectorAll('.model-group');
    assert.equal(groups[0].dataset.lpeNode, groups[1].dataset.lpeNode, 'Marquee duplicates share a stable edit identity');
    const model = dom.list().find(node => node.element.textContent === 'Model' && node.tag === 'span')!;
    const copy = dom.list().find(node => node.tag === 'p')!;
    const document: LandingDocument = { ...emptyLandingDocument(), elements: {
      [title.id]: { text: { en: ['<b>Literal text</b>'], 'zh-CN': ['中文标题'] }, desktop: { x: 40, width: 500 }, mobile: { width: 280 } },
      [button.id]: { desktop: { width: 240 } }, [multi.id]: { text: { en: ['One', 'Two'] } },
      [image.id]: { attributes: { src: '/assets/replaced.png' } }, [model.id]: { text: { en: ['Changed model'] } },
      [copy.id]: { text: { en: ['Edited commerce'] } },
    } };
    dom.apply(document, 'en');
    assert.equal(root.querySelector('#title').textContent, '<b>Literal text</b>'); assert.equal(root.querySelector('#title b'), null, 'Text edits never become HTML');
    assert.equal(root.querySelectorAll('button svg path').length, 1, 'Editing never replaces React-owned child elements');
    assert.equal(root.querySelector('#multi').innerHTML, 'One<br>Two', 'Text slots preserve line-break elements');
    assert.equal(root.querySelector('img').getAttribute('src'), '/assets/replaced.png');
    assert.equal(groups[0].textContent, 'Changed model'); assert.equal(groups[1].textContent, 'Changed model');
    assert.match(window.document.head.textContent, /@media\(max-width:820px\)/);
    dom.apply(document, 'zh-CN'); assert.equal(root.querySelector('#title').textContent, '中文标题');
    dom.apply(document, 'en');
    const scene = root.querySelector('[data-scene]'); scene.dataset.scene = 'ads'; scene.querySelector('p').firstChild.data = 'Ads copy';
    await new Promise(resolve => setTimeout(resolve, 20));
    const ad = dom.list().find(node => node.tag === 'p')!;
    assert.notEqual(ad.id, copy.id, 'Interactive scenes have separate stable identities'); assert.equal(ad.element.textContent, 'Ads copy');
    dom.apply(emptyLandingDocument(), 'en');
    assert.equal(root.querySelector('#title').textContent, 'Original heading'); assert.equal(root.querySelector('img').getAttribute('src'), '/assets/original.png');
    const originalId = title.id; dom.dispose(); dom = createLandingEditorDom(root, () => {});
    assert.equal(dom.list().find(node => node.element.id === 'title')!.id, originalId, 'Remounts preserve element identity');
    console.log('PASS · DOM selection coverage, stable identities, mirrored content, safe text, preserved React children, responsive rules, language switch, scene isolation, undo/reset, remount');
  } finally {
    dom?.dispose();
    for (const [key, descriptor] of properties) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
}
