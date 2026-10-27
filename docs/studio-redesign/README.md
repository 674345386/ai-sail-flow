# Sail Studio redesign (v3) — Creatify image-ads structure

Landing UI mirrors Creatify’s **image-ads** page block order (from downloaded `creatify-source/STRUCTURE.md`) with **Sail Chinese branding only** — no Creatify name/logo/slogans in UI copy.

## Block order checklist
1. Sticky nav — logo · links · ghost「内容工作台」+ black MkCta「立即开始」(left purple pixel-chevron tag)
2. Hero — H1 ~60px / tracking -0.02em / leading 0.96 + sub + tall MkCta + warm orange→pink glow
3. Bleeding ad carousel — local `/studio/site-images/*` cards
4. Supporting chips — 「适用于今日主流场景」
5. 「完整创作控制」+ 6 alternating feature rows (white card, shadow-mk-lift, image↔text)
6. Social / metrics — 「团队怎么用爆款工作室」+ metric cards + mono links
7. Toolkit band — gradient glow image + 4 module cards → `onOpen(section)`
8. Peach final CTA — 「准备好生成第一批素材了吗？」
9. FAQ accordion
10. Footer

## Tokens (from downloaded CSS)
- bg `#FCFCFC`, ink `#131415`, mk `#573CFF`, agent `#6161FF`, peach `#FFBC98`
- card 20px · CTA 8px · tag 4px · shadow-mk-lift `0 81px 48px rgba(0,0,0,.06)`
- Font: General Sans (`public/studio/fonts/`)

## Open
- App: `/studio` or `/studio/welcome`
- Modules: `/studio/creatives` · `/radar` · `/tvc` · `/remake`
- Static preview: `docs/studio-redesign/landing-preview.html`
- Screenshots: `landing-v3.png` (hero viewport), `landing-v3-full.png` (full page)
- Source of truth: `docs/studio-redesign/creatify-source/`

## Notes
- Studio CSS scoped under `.studio-shell` / `.studio-landing` — remix/workflow stay dark.
- Assets are Sail-owned local copies under `public/studio/` (no Creatify CDN hotlinks).
