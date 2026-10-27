# Creatify Image Ads — downloaded source map

Sources in this folder:
- `image-ads.html` — full page HTML (~199KB)
- `entry-client.css` — marketing CSS (~265KB) with mk tokens
- `general-sans.css` + `fonts/` — General Sans variable
- `inline-style.css` — page inline styles
- `structure-outline.txt` — heading/CTA text outline
- `assets/` — hero bg, OG, toolkit carousel, site-images

## Design tokens (from entry-client.css)
- bg page: `#FCFCFC` (bg-mk-background)
- ink / black-abs: `#131415`
- mk purple: `rgb(87,60,255)` = `#573CFF`
- mk agent / brand: `#6161FF`
- peach-orange: `#FFBC98`
- blaze-orange: `rgb(253,91,4)`
- card radius: 20px (rounded-mk-card)
- control/CTA radius: 8px (rounded-mk-control)
- tag radius: 4px
- shadow-mk-lift: `0 81px 48px rgba(0,0,0,.06)`
- shadow-mk-card: `0 42px 42px rgba(0,0,0,.09), 0 11px 23px rgba(0,0,0,.1)`
- shadow-mk-brand: `0 20px 48px rgba(87,61,255,.3)`
- H1 desktop: 60px / leading 0.96–1.1 / tracking -0.02em
- body: General Sans, 16–20px

## Page block order (use this for Sail Studio landing)
1. Sticky nav — logo left; links; ghost Log in + black CTA BOOK DEMO (purple pixel tag on left of black pill)
2. Hero — huge H1 + sub + tall black MkCta GET STARTED; warm orange→pink glow behind; bleeding ad mock carousel under hero
3. Supporting brands strip — “Supporting today's top brands” + logo chips
4. Full creative control — centered H2 + sub; **6 alternating feature rows** (image 730px-ish card with lift shadow + text), imageLeft alternates
5. (Creatify has AI ethics band — Sail can skip or replace with soft trust band)
6. How Creatify helps real teams — metric / case cards
7. The complete toolkit — navy/purple/orange gradient band + module cards
8. Ready to generate — peach final CTA band
9. FAQ accordion
10. Footer

## Sail branding rules
- UI copy: 爆款工作室 / AI-Sail only — never “Creatify” in user-visible strings
- Keep ModuleKey props: onOpen / onLeave / onBackWorkspace
- Modules: creatives, radar, tvc, remake

## Visible outline (trimmed)
Create, Customize, and Launch Image Ads in Seconds
<p class="whitespace-pre-line font-normal text-[16px] leading-[1.3] tracking-normal min-[992px]:text-[20px] min-[992px]:leading-[1"> Start with text, an image, or even a product link. Creatify designs polished image ads automatically, ready for Meta, TikTok, Amazon, or Shopify — and gives you full control to ref
<a class="group motion-snappy relative inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-mk-control bg-b"> GET STARTED
<p class="shrink-0 text-center text-[18px] leading-[1.2] min-[992px]:w-[156px] min-[992px]:text-left"> Supporting today's top brands
<h2 class="text-center text-[40px] leading-none tracking-[-0.02em] min-[992px]:text-[60px] min-[992px]:leading-[1.1] min-[992px]:tr"> Full creative control
<p class="text-center font-normal text-[16px] leading-[1.3] tracking-normal min-[992px]:text-[20px] min-[992px]:leading-[1.4] mt-1"> All the tools to create professional image ads, no experience required
<h3 class="text-[24px] leading-none tracking-[-0.01em] min-[992px]:text-mk-heading-4"> Auto Link-to-Ad Builder
<p class="mt-3 font-normal text-[16px] text-mk-ink leading-[1.3] tracking-normal min-[992px]:mt-[var(--text-gap)] min-[992px]:text"> Paste your Amazon, Shopify, or website URL, and Creatify automatically pulls your product details to generate matching image ads instantly.
<h3 class="text-[24px] leading-none tracking-[-0.01em] min-[992px]:text-mk-heading-4"> Your Brand, Your Rules
<p class="mt-3 font-normal text-[16px] text-mk-ink leading-[1.3] tracking-normal min-[992px]:mt-[var(--text-gap)] min-[992px]:text"> Keep your campaigns consistent by locking in your colors, logo, and top selling points. Creatify builds ads that always look and sound like you.
<h3 class="text-[24px] leading-none tracking-[-0.01em] min-[992px]:text-mk-heading-4"> Smart Bulk Creation
<p class="mt-3 font-normal text-[16px] text-mk-ink leading-[1.3] tracking-normal min-[992px]:mt-[var(--text-gap)] min-[992px]:text"> Create up to 20 ad visuals at once, ideal for A/B testing or multi-product campaigns. No manual design needed.
<h3 class="text-[24px] leading-none tracking-[-0.01em] min-[992px]:text-mk-heading-4"> Campaign-Ready Photoshoots
<p class="mt-3 font-normal text-[16px] text-mk-ink leading-[1.3] tracking-normal min-[992px]:mt-[var(--text-gap)] min-[992px]:text"> Create an entire visual campaign from a single product shot. Place your item on models, in styled environments, or lifestyle settings. No studio, no photographer needed.
<h3 class="text-[24px] leading-none tracking-[-0.01em] min-[992px]:text-mk-heading-4"> Built-in Editor
<p class="mt-3 font-normal text-[16px] text-mk-ink leading-[1.3] tracking-normal min-[992px]:mt-[var(--text-gap)] min-[992px]:text"> Tweak your ads in seconds — update headlines, subtext, backgrounds, and layouts without restarting the generation process.
<h3 class="text-[24px] leading-none tracking-[-0.01em] min-[992px]:text-mk-heading-4"> Platform-ready
<p class="mt-3 font-normal text-[16px] text-mk-ink leading-[1.3] tracking-normal min-[992px]:mt-[var(--text-gap)] min-[992px]:text"> Export for TikTok, Instagram, or Facebook.
<h2 class="text-center text-[40px] leading-none tracking-[-0.02em] min-[992px]:text-[60px] min-[992px]:leading-[1.1] min-[992px]:tr"> AI ethics & safety standards
<p class="text-center font-normal text-[16px] leading-[1.3] tracking-normal min-[992px]:text-[20px] min-[992px]:leading-[1.4] mt-1"> At Creatify AI, we are committed to the ethical development, deployment, and use of artificial intelligence technologies. As we continue to push the boundaries of generative AI, we
<a class="group motion-snappy relative inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-mk-control bg-b"> LEARN MORE
<h2 class="w-[350px] text-[40px] leading-none tracking-[-0.02em] min-[992px]:w-[1024px] min-[992px]:text-[60px] min-[992px]:leading"> How Creatify helps real teams
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<a class="inline-flex items-center gap-3 font-mono text-[15px] text-mk leading-[1.2] tracking-[0.04em]"> READ MORE
<h2 class="text-center text-[40px] leading-none tracking-[-0.02em] min-[992px]:text-[60px] min-[992px]:leading-[1.1] min-[992px]:tr"> The complete toolkit for modern advertisers
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> URL to Video Turn any link into a ready-to-post video.
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> URL to Video
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Turn any link into a ready-to-post video.
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Creative Agent Chat with an AI copilot that plans, builds, and ships your ads
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Creative Agent
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Chat with an AI copilot that plans, builds, and ships your ads
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Avatar Video The most realistic avatars yet
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Avatar Video
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> The most realistic avatars yet
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Ad Flow Node-based editor for ready-to-ship ads
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Ad Flow
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Node-based editor for ready-to-ship ads
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Performance Agent Chat with your ad data to see what works
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Performance Agent
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Chat with your ad data to see what works
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Model Playground All the AI models in one place
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Model Playground
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> All the AI models in one place
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Image Ads Turn any product into static ads
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Image Ads
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Turn any product into static ads
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Product Ads Clean, studio-quality product shots and animations
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Product Ads
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Clean, studio-quality product shots and animations
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Ad Cloner Recreate winning ads instantly
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Ad Cloner
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Recreate winning ads instantly
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> URL to Video Turn any link into a ready-to-post video.
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> URL to Video
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Turn any link into a ready-to-post video.
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Creative Agent Chat with an AI copilot that plans, builds, and ships your ads
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Creative Agent
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Chat with an AI copilot that plans, builds, and ships your ads
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Avatar Video The most realistic avatars yet
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Avatar Video
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> The most realistic avatars yet
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Ad Flow Node-based editor for ready-to-ship ads
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Ad Flow
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Node-based editor for ready-to-ship ads
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Performance Agent Chat with your ad data to see what works
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Performance Agent
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Chat with your ad data to see what works
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Model Playground All the AI models in one place
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Model Playground
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> All the AI models in one place
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Image Ads Turn any product into static ads
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Image Ads
<p class="motion-glide font-normal text-[12px] leading-[1.2] tracking-normal transition-opacity min-[992px]:text-[15px] min-[992px"> Turn any product into static ads
<a class="relative z-[2] flex w-full flex-col gap-[6.46px] px-2.5 min-[992px]:gap-2.5 min-[992px]:px-6"> Product Ads Clean, studio-quality product shots and animations
<h3 class="text-[21px] leading-[1.2] min-[992px]:text-[32px]"> Product Ads
<p class="motion-glide font-normal text-[12px] leading-