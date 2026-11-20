---
id: programmatic-code-video
title: 代码驱动程序化视频（Remotion / Manim / HTML+FFmpeg）
summary: 用代码逐帧渲染动态图形、数据图表、产品 UI 演示与品牌片头字幕，100% 确定性且文字零乱码，也可与 AI 实拍片段混合合成。
tags: [programmatic, code, remotion, manim, motion-graphics, charts, ffmpeg, hybrid]
tools: [programmatic, compose_video]
---

# 代码驱动程序化视频（Programmatic Video）

## 1. 适用与不适用边界
- **适用**：数据可视化动态图表、软件/产品功能演示、MG 动效、品牌片头/片尾、价格贴片/花字包装、数学与技术原理动画，以及给 AI 实拍视频做确定性后期包装。
- **不适用**：需要真实自然人物表演或写实光影镜头的主体画面（此类片段应先由 AI 视频生成，再用本 Skill 做片头/字幕/包装混剪）。

## 2. 前置资产与输入检查
- 必须先读取 `get_creative.programmatic` 确认 `enabled === true` 且检查可用工作目录与依赖。
- 若 `programmatic.enabled === false`，路线 `readiness` 必须标为 `unavailable` 并说明原因。

## 3. 标准画布拓扑与底层工具映射
1. `asset`（结构化文案 / 数据 / 品牌配色 / 可选 AI 视频素材）
2. `step`（编写动画代码与逐帧渲染，`tool: "programmatic"`，先 `start-run`，在创意独立工作目录渲染 MP4 并用 `publish_experiment_file` 发布成片与源码）→ `artifact`（渲染视频与源码）
3. `step`（可选：与 AI 生成的 Hero Footage 混剪拼接，`tool: "compose_video"`）→ `artifact`（最终混合成片）

## 4. Prompt / 规范编译要点
- 定义清晰的确定性参数：分辨率（如 `1920x1080` / `1080x1920`）、帧率（`30/60fps`）、总时长、色彩 Token、字体层级、缓动曲线与每段进出场时间点。
- 所有文本、数字和图表数据直接由代码渲染，保证 100% 清晰无乱码。

## 5. 质检与降级策略
- 渲染完成后抽关键时间点截图并用 `publish_experiment_file`（`purpose: "context"`）核对排版是否溢出、遮挡或字体缺失。
- 若缺少 Remotion/Manim 依赖，优先降级为轻量 HTML/Canvas + FFmpeg 或直接 FFmpeg 滤镜管线，并在执行记录中写明实际环境。
