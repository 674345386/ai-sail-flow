---
id: reference-video-remix
title: 参考视频驱动与局部重绘（V2V / Remix）
summary: 拆解爆款参考片的镜头、节奏与运镜，保留原片骨架并按自由度（exact/swap/adapt/remix）替换人物、商品或局部区间。
tags: [v2v, remix, recreation, reference-video, breakdown, swap, replace]
tools: [analyze_reference, save_reference_analysis, save_video_production, generate_image, generate_video, compose_video]
---

# 参考视频驱动与局部重绘（V2V / Remix）

## 1. 适用与不适用边界
- **适用**：已上传参考视频的爆款复刻、二创改写、局部时间区间重做、人物/商品替换，或复用原片剪辑节奏与运镜结构。
- **不适用**：创意中尚未上传参考视频的纯原创任务（此时应提示上传或改用 `asset-keyframe-i2v` / `direct-t2v`）。

## 2. 前置资产与输入检查
- 先读 `get_creative` 确认参考视频已存在，复用已有原片拆解（`analyze_reference` / `save_reference_analysis`），避免重复分析。
- 明确用户指定的自由度（`exact` / `swap` / `adapt` / `remix`）及保留项/替换项，通过 `save_video_production` 持久化双语母版与场景卡。

## 3. 标准画布拓扑与底层工具映射
1. `asset`（原片参考视频 + 替换主体/商品图）
2. `step`（原片拆解与方案保存，`tool: "agent"`）→ `artifact`（场景表与制作方案）
3. `step`（目标场景新关键帧，`tool: "generate_image"`，按需传入 `sceneIndex`）→ `artifact`（新关键帧）
4. `step`（区间编辑或分镜重绘，`tool: "generate_video"`；≥4 秒原片编辑传 `sourceVideoId` + `start/end` 走 Omni Flash 1.2，<4 秒或重构走 H3）→ `artifact`（重绘片段）
5. `step`（局部替换或全片拼接，`tool: "compose_video"`，局部替换传 `replace` 参数）→ `artifact`（复刻成片）

## 4. Prompt 编译规范（Delta 差异化改写）
- 用 **保留清单 + 替换清单** 写 Prompt：明确指出保持原片运镜、动作节奏与构图不变，只替换指定主体、服装、道具或场景光影。
- 同步更新母版 Prompt 和每个受影响场景的 Prompt，确保跨镜风格统一。

## 5. 质检与降级策略
- 拆解与方案保存不等于授权付费生成；先产出完整提案与场景表，待路线选定或用户明确指令后再执行生图/生视频。
- 若 V2V 区间编辑保留了不需要的原片残留元素，改用“重画关键帧 + I2V 重构”替代直接 V2V。
