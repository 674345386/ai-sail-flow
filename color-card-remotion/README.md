# 色卡扇 Remotion 动效

1080 × 1920、80 fps 的竖屏 Remotion composition。底部 32 张锯齿色卡组成完整转盘，转动后，三张完整布样卡依次飞出并落位。

## 预览

```bash
npm run dev
```

## 渲染

```bash
npx remotion render src/index.ts ColorCardMotion out/color-card-motion.mp4
```

动画全部由 Remotion 时间轴帧驱动，可在 Studio 中拖动时间轴逐帧检查。
