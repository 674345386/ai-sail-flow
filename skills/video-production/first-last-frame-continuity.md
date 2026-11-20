---
id: first-last-frame-continuity
title: 首尾帧 / 尾帧接力连续镜头（First-Last Frame）
summary: 锁定起点图与终点图（或抽取上一镜尾帧驱动下一镜），让模型只生成中间过渡路径，实现丝滑转场与长镜头接力。
tags: [first-last-frame, continuity, transition, tail-frame, interpolation, long-shot]
tools: [generate_image, generate_video, programmatic, generate_first_last_frame_video, compose_video]
---

# 首尾帧 / 尾帧接力连续镜头

## 1. 适用与不适用边界
- **适用**：一镜到底长镜头接力、精准转场（日转夜、产品 180° 旋转露标、穿越虫洞/穿门）、以及前后镜头必须无缝衔接的连续画面。
- **不适用**：两张起止图画幅比例不同、构图跳变过大且没有合理物理过渡路径的场景（容易导致画面诡异融化形变）。

## 2. 前置资产与输入检查
- 必须确保首帧与尾帧均为当前创意中的有效图片 ID（`get_creative.imageReferences`），且两帧画幅比例一致。
- 若使用上一镜视频的真实尾帧，必须先在画布中显式规划抽帧步骤并发布图片拿到 `file.id`。

## 3. 标准画布拓扑与底层工具映射
1. `step`（镜头 1 生成，`tool: "generate_video"` 或 `"generate_first_last_frame_video"`）→ `artifact`（镜头 1 视频）
2. `step`（抽取镜头 1 尾帧，`tool: "programmatic"`，使用 ffmpeg 抽帧并调用 `publish_experiment_file` 且 `purpose: "context"`）→ `artifact`（镜头 1 尾帧图）
3. `step`（镜头 2 续拍，`tool: "generate_first_last_frame_video"`，传入 `firstFrameId` 与可选 `lastFrameId`）→ `artifact`（镜头 2 视频）
4. `step`（顺序拼接并裁去重复边界帧，`tool: "compose_video"`）→ `artifact`（连续成片）

## 4. Prompt 编译规范
- **只写“从首帧到尾帧的变化路径”**：动作方向、转场动力、运镜速度与光线变化；**不要重复描述两张静态图各自的细节**。
- 注意：`generate_first_last_frame_video` 不能同时混传普通 `referenceIds`，角色与风格信息必须已固化在首尾帧图片和 Prompt 中。
- 复杂变形/转场控制在 4–6 秒，缓慢揭示镜头可用 8 秒。

## 5. 质检与降级策略
- 绝不跳过抽帧步骤或用“文字描述延续上一镜”冒充 `firstFrameId`。
- 若首尾帧差异过大出现融化畸变，先补一张中间过渡帧把 1 段拆成 2 段，或降级为硬切分镜（`asset-keyframe-i2v`）。
