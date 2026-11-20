---
id: ingredients-r2v
title: 多图要素驱动与九宫格分镜（Ingredients / Grid R2V）
summary: 用人物+商品+场景多张独立素材图直接驱动视频，或先出 3×3 九宫格分镜锁死光影后一键生视频。
tags: [r2v, ingredients, grid, storyboard-grid, ecommerce, product, multi-ref]
tools: [generate_image, build_video_storyboard, generate_grid_video, generate_video, compose_video]
---

# 多图要素驱动与九宫格分镜（Ingredients / Grid R2V）

## 1. 适用与不适用边界
- **适用**：电商产品换主体/换场景演示、固定角色手持固定商品互动、以及希望一次性锁定整段 10 秒内多个连续镜头的九宫格分镜制作。
- **不适用**：需要单镜极精细构图精修的长篇叙事（优先用 `asset-keyframe-i2v`），或超出模型参考图上限的复杂多人大场面。

## 2. 前置资产与输入检查
- 检查 `get_creative.imageReferences` 中的真实人物图、商品图、场景图 ID。
- 九宫格路线需先准备 1–9 张有序关键帧图片 ID，且每张网格对应时长不超过 10 秒。

## 3. 标准画布拓扑与底层工具映射
- **分支 A（多图要素直驱 R2V）**：`asset`（人物/商品/场景图）→ `step`（多图参考生视频，`tool: "generate_video"`，传入有序 `referenceIds`）→ `artifact`（视频片段）。
- **分支 B（3×3 九宫格分镜）**：`step`（关键帧准备，`tool: "generate_image"`）→ `step`（拼合 3×3 故事板，`tool: "build_video_storyboard"`）→ `step`（网格生视频，`tool: "generate_grid_video"`）→ `step`（合成，`tool: "compose_video"`）。

## 4. Prompt 编译规范
- **显式绑定槽位关系**：在 Prompt 中清晰说明每张参考图的角色与交互（例如“图 1 中的人物手持图 2 的产品，在图 3 的环境中完成展示动作”）。
- 九宫格 Prompt 需包含调整后的全片母版风格 + 按时间顺序展开的格间节奏与负面约束。

## 5. 质检与降级策略
- 若多图直接融合时商品文字/Logo 变形，优先先用 `generate_image` 合成一张准确的单帧构图，再转入 `asset-keyframe-i2v`。
