import EN from './app-i18n-en.json';

/* Post-login UI translation.
   The workspace source is written in Chinese (zh-CN). Rather than rewriting ~1600 literals (some of which feed
   comparisons or model prompts), English is applied at the DOM layer: rendered text nodes and a few
   attributes are swapped for their dictionary entry while the language is EN, and restored for zh-CN.
   Nothing here touches state, requests or prompts — only what the user sees.
   Entries with "{}" are patterns for interpolated strings (e.g. "镜头 {}" → "Shot {}"). */

type Lang = string;
const HAN = /[\u4e00-\u9fff]/;
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP = 'textarea, input, select[data-no-i18n], [contenteditable=""], [contenteditable="true"], [data-no-i18n], script, style, .landing-page';
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

const exact = new Map<string, string>();
const patterns: { re: RegExp; out: string[]; literal: number }[] = [];
for (const [zh, en] of Object.entries(EN as Record<string, string>)) {
  const key = norm(zh);
  if (!key.includes('{}')) { exact.set(key, en); continue; }
  const parts = key.split('{}');
  if (parts.join('').replace(/[\s·:：,，()（）\-–/]/g, '').length === 0) continue; // pattern made only of placeholders
  const re = new RegExp('^' + parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.*?)') + '$', 's');
  patterns.push({ re, out: en.split('{}'), literal: parts.join('').length });
}
// Longer literal text first, so specific patterns beat generic ones.
patterns.sort((a, b) => b.literal - a.literal);

const cache = new Map<string, string | null>();
/** Translate one UI string to English; returns null when there is no entry. */
export function translateUi(text: string, depth = 0): string | null {
  if (!HAN.test(text)) return null;
  const key = norm(text);
  if (cache.has(key)) return cache.get(key)!;
  let result: string | null = exact.get(key) ?? null;
  if (result === null) for (const { re, out } of patterns) {
    const m = key.match(re); if (!m) continue;
    result = out.map((part, i) => i === 0 ? part : ((depth < 2 && m[i] ? translateUi(m[i], depth + 1) : null) ?? m[i] ?? '') + part).join('');
    break;
  }
  if (result === null && key.includes(' · ')) { // "A · B" composed from known pieces
    const pieces = key.split(' · ').map(p => HAN.test(p) ? (exact.get(p) ?? null) : p);
    if (pieces.every(p => p !== null)) result = pieces.join(' · ');
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}
const keepSpace = (orig: string, next: string) => (orig.match(/^\s*/)?.[0] ?? '') + next + (orig.match(/\s*$/)?.[0] ?? '');

let lang: Lang = 'en';
let observer: MutationObserver | null = null;
const textState = new Map<Text, { orig: string; applied: string }>();
const attrState = new Map<Element, Map<string, { orig: string; applied: string }>>();
const skipped = (el: Element | null) => !!el?.closest(SKIP);

function doText(node: Text) {
  const value = node.nodeValue ?? '';
  const prev = textState.get(node);
  if (prev && value === prev.applied) return;
  if (!HAN.test(value) || skipped(node.parentElement)) { if (prev) textState.delete(node); return; }
  const en = translateUi(value);
  if (en === null) { if (prev) textState.delete(node); return; }
  const applied = keepSpace(value, en);
  textState.set(node, { orig: value, applied });
  node.nodeValue = applied;
}
function doAttrs(el: Element) {
  if (skipped(el) && !(el.matches('input, textarea') && !el.closest('[data-no-i18n], .landing-page'))) return;
  for (const name of ATTRS) {
    const value = el.getAttribute(name); if (!value) continue;
    const states = attrState.get(el); const prev = states?.get(name);
    if (prev && value === prev.applied) continue;
    const en = HAN.test(value) ? translateUi(value) : null;
    if (en === null) { states?.delete(name); continue; }
    (states ?? attrState.set(el, new Map()).get(el)!).set(name, { orig: value, applied: en });
    el.setAttribute(name, en);
  }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) { if ((root as Element).closest('.landing-page, script, style')) return; doAttrs(root as Element); }
  const tree = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tree.nextNode(); n; n = tree.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text); else doAttrs(n as Element);
  }
}
let titleState: { orig: string; applied: string } | null = null;
function translateTitle() { const t = document.title; if (titleState && t === titleState.applied) return; const en = translateUi(t); if (en) { titleState = { orig: t, applied: en }; document.title = en; } }

function start() {
  if (observer || typeof document === 'undefined') return;
  walk(document.documentElement); translateTitle();
  observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'characterData') doText(r.target as Text);
      else if (r.type === 'attributes') doAttrs(r.target as Element);
      else r.addedNodes.forEach(walk);
      if (r.target.nodeName === 'TITLE' || r.target.parentNode?.nodeName === 'TITLE') translateTitle();
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
}
function stop() {
  observer?.disconnect(); observer = null;
  for (const [node, s] of textState) if (node.isConnected && node.nodeValue === s.applied) node.nodeValue = s.orig;
  for (const [el, map] of attrState) if (el.isConnected) for (const [name, s] of map) if (el.getAttribute(name) === s.applied) el.setAttribute(name, s.orig);
  textState.clear(); attrState.clear();
  if (titleState && document.title === titleState.applied) document.title = titleState.orig;
  titleState = null;
}

// Native dialogs (confirm/alert/prompt) don't go through the DOM.
let dialogsPatched = false;
function patchDialogs() {
  if (dialogsPatched || typeof window === 'undefined') return; dialogsPatched = true;
  const wrap = <K extends 'alert' | 'confirm' | 'prompt'>(name: K) => {
    const original = window[name].bind(window) as (...args: unknown[]) => unknown;
    (window as unknown as Record<string, unknown>)[name] = (message?: unknown, ...rest: unknown[]) =>
      original(lang === 'en' && typeof message === 'string' ? (translateUi(message) ?? message) : message, ...rest);
  };
  wrap('alert'); wrap('confirm'); wrap('prompt');
}

/** Apply the UI language to the post-login app. Safe to call repeatedly. */
export function applyAppLang(next: Lang) {
  lang = next; patchDialogs();
  if (next === 'en') start(); else stop();
}
