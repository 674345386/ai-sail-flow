---
id: asset-keyframe-i2v
title: 资产母版 + 分镜关键帧图生视频（I2V）
summary: 业界最稳的多镜头叙事方案：先锁定角色/商品/风格母版，再拆镜生成静态关键帧，最后逐镜图生视频并合成。
tags: [i2v, keyframe, storyboard, multi-shot, narrative, mv, consistency]
tools: [generate_image, generate_video, compose_video]
---

# 资产母版 + 分镜关键帧图生视频（I2V）

## 1. 适用与不适用边界
- **适用**：多镜头剧情短片、动漫 MV、品牌广告片、产品故事片，以及任何需要跨镜头保持角色、场景和美术风格一致性的原创视频。
- **不适用**：只需要单镜头快速测试（用 `direct-t2v`），或需要严密复刻实拍原片运镜节奏（用 `reference-video-remix`）。

## 2. 前置资产与输入检查
- 先检查 `get_creative.imageReferences` 是否已有角色参考图、商品图或风格参考图。
- 若无现成视觉锚点且涉及多个镜头，优先在第一步规划「资产母版 / 主角定调图」步骤，后续所有关键帧步骤通过 `referenceIds` 显式引用该锚点。

## 3. 标准画布拓扑与底层工具映射
1. `asset`（创作意图 / 已有参考素材）
2. `step`（可选：母版角色/场景锚点生图，`tool: "generate_image"`）→ `artifact`（资产锚点图）
3. `step`（各镜头关键帧生图，`tool: "generate_image"`，挂载母版 `referenceIds`）→ `artifact`（镜头关键帧）
4. `step`（各镜头图生视频，`tool: "generate_video"`，挂载对应关键帧 `referenceIds`）→ `artifact`（镜头视频片段）
5. `step`（按顺序裁切拼接与合成，`tool: "compose_video"`）→ `artifact`（最终成片）

## 4. Prompt 编译规范（核心：静动分离）
- **静态关键帧 Prompt（给 `generate_image`）**：只描述定格画面——景别、构图、主体造型与站位、服装材质、光影色温、背景纵深；不写时间演变过程。
- **动态视频 Prompt（给 `generate_video`）**：**不要重复抄写关键帧里已经画出的静态外貌**，只聚焦“变化量”——主体动作轨迹、镜头运动（推/拉/摇/移/环绕）、环境物理反馈（风、粒子、光晕）与情绪递进。
- 单段视频控制在 4–10 秒，长镜头按节拍拆分。

## 5. 质检与降级策略
- 关键帧阶段先确认画面构图和主角一致性，不满意就在关键帧步骤用 `branch-method` 重画，确认后再进入视频步骤，避免浪费视频生成成本。
- 若相邻两镜硬切不自然，升级为 `first-last-frame-continuity`（抽取上一镜尾帧作为下一镜首帧）。
