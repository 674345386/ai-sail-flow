# 人物 360 度旋转

参考图人物的 AI 转身素材与 Remotion 竖屏工程。保留蓝色外套、绿色高领、棕色百褶裙和长靴，黑色背景，无字幕、无声音。

侧面和背面由 Veo 3.1 根据正面参考图推测生成；这不是可编辑的 3D 人物模型。Remotion 负责视频排布、静音、循环和导出。

## 文件

- `public/reference.png`：用户原始参考图。
- `public/reference.jpg`：适配 1080 × 1920 的首尾帧。
- `public/turntable-source.mp4`：AI 生成的连续转身素材。
- `prompt.txt`：完整生成提示词。
- `out/person-360.mp4`：Remotion 成片，1080 × 1920，30fps，8 秒。
- `src/PersonTurntable.tsx`：可编辑视频层。

## 使用

```sh
npm install
npm run dev
npm run render
npm run render:loop
```

`PersonTurntable` 为 8 秒单圈；`PersonTurntableLoop` 为 16 秒重复两次。

当前机器复用相邻 Remotion 工程的依赖，避免重复安装。

## 模特＋服饰色卡展示

`FashionColorShowcase` 为 9 秒、1080 × 1920、30fps 的展示组合，导出文件为 `out/model-fashion-colors.mp4`。

```sh
npm run render:fashion
```

复用 `color-card-remotion/out/color-card-motion-preview.mp4` 对应的动画源代码，保留扇形卡片旋转和三张色卡飞入的结构，将三张展示色卡换成外套蓝、针织绿、裙靴棕，并调整到人物身后。原色卡视频和工程保持独立。

`src/fashionTiming.ts` 为共享时钟：以原色卡的 80fps 时钟换算，在 6.5 秒内转约 2.4 圈，然后停止。背景卡片和人物读取同一旋转进度。人物素材的角度通过抽帧近似校准，以补偿 AI 转身的不均匀速度；由于人物为已生成的二维视频，实际姿势、转向和循环衔接仍可能有细微偏差。

`public/model-matte/` 为已准备好的透明人物帧，不需要重新调用模型。`prepare-matte.py` 用 FFmpeg、numpy 和 OpenCV 去除外部黑色背景，保留轮廓内部的深色头发与衣物；该基础抠像在细小发丝边缘可能留有轻微黑边。

生成记录保存于 `generation.json`。从仓库根目录运行以下命令可继续查询已提交任务，无需重新生成：

```sh
NODE_USE_ENV_PROXY=1 node --import tsx person-turntable-remotion/generate-source.ts --resume
```

新生成需要 `.env` 中的 `SOP_VEO_API_KEY` 和代码指定的现有本机图片隧道。生成期间仅临时托管参考图，任务结束后清理临时副本。复用已生成素材和渲染不需要外部接口。
