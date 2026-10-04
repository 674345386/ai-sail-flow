# 首页电商出海背景

首页使用的 12 秒静音循环影片，1440 × 684，30 fps。商品打包、海外创作者和产品展示三段画面通过缓慢推镜、交叉淡化与移动航线串联。标题和按钮在网页中独立呈现，影片不包含文字。

素材取自仓库已有的 `public/assets/landing/` 图片，压缩副本位于本项目的 `public/commerce/`，复用已有 Remotion 依赖。

在 `color-card-remotion` 目录执行：

```bash
npx remotion studio src/CommerceHero.tsx --no-open
npx remotion render src/CommerceHero.tsx CommerceHero ../public/assets/landing/commerce-hero.mp4 --codec=h264 --crf=23 --concurrency=2
ffmpeg -y -ss 1.5 -i ../public/assets/landing/commerce-hero.mp4 -frames:v 1 -q:v 3 ../public/assets/landing/commerce-hero-poster.jpg
```

所有动效由当前帧驱动；末尾衔接开头。网页支持自动静音播放、暂停、离屏暂停，以及减少动态效果时展示静态封面。
