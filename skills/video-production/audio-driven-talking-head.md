---
id: audio-driven-talking-head
title: 音频与口播驱动数字人（Talking-Head + B-Roll）
summary: 以口播脚本和配音时长为主轴，结合稳定人物出镜与穿插 B-roll 画面及动态字幕，适合带货口播与科普讲解。
tags: [talking-head, avatar, lip-sync, voiceover, tts, b-roll, narration]
tools: [generate_image, generate_video, compose_video, programmatic]
---

# 音频与口播驱动数字人（Talking-Head + B-Roll）

## 1. 适用与不适用边界
- **适用**：产品口播测评、知识科普、个人 IP 观点输出、跨境多语种口播带货与教程讲解。
- **不适用**：无口播的纯视觉大片或强动作戏（用 `asset-keyframe-i2v` 或 `first-last-frame-continuity`）。

## 2. 前置资产与输入检查
- 检查是否已有口播人设参考图/底片、产品卖点事实清单、目标语种与时长要求。
- 若当前环境未配置专用数字人/口型驱动能力，必须在路线 `readiness` 中如实标注 `needs-setup` 或改用“配音 + 关键帧 B-roll + 字幕合成”路线，绝不伪造口型同步。

## 3. 标准画布拓扑与底层工具映射
1. `asset`（产品事实 / 口播主题 / 人物参考图）
2. `step`（口播脚本与分镜切点规划，`tool: "agent"`）→ `artifact`（带时间码的口播与 B-roll 脚本）
3. `step`（人物中近景底图与核心卖点 B-roll 关键帧，`tool: "generate_image"`）→ `artifact`（画面素材）
4. `step`（主轨口播/演示镜头与 B-roll 视频生成，`tool: "generate_video"`）→ `artifact`（分轨片段）
5. `step`（音画对齐、B-roll 穿插与字幕烧录，`tool: "compose_video"` 或 `"programmatic"`）→ `artifact`（口播成片）

## 4. Prompt 编译规范
- **口播与情绪节拍**：按每 2–4 秒一个信息点切分，标出停顿、重音和切入 B-roll 的时间点。
- **人物镜头指令**：保持机位克制（固定中近景、柔和主光、自然眼神交流与轻微手势），把视觉冲击力交给穿插的 B-roll 特写。

## 5. 质检与降级策略
- 严格校验产品事实与口播文案一致，禁止编造未确认的参数或功效。
- 若人物口型精度不足，增加 B-roll 画面占比并采用清晰字幕条强化信息传达。
