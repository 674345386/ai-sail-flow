---
name: AI-Sail Flow
description: 跨境内容创作工作台的现有界面风格
colors:
  shell-bg: "#101114"
  sidebar-bg: "#0c0d10"
  dark-panel: "#15161b"
  dark-raised: "#1a1b21"
  dark-text: "#eeeff2"
  dark-muted: "#92949f"
  violet-accent: "#717ee4"
  agent-green: "#bce6c8"
  remix-canvas: "#fafbfc"
  remix-ink: "#262b32"
  remix-line: "#e6e9ed"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, sans-serif"
    fontSize: "16px"
    lineHeight: 1.6
  agent-response:
    fontFamily: "Sail Agent Serif, Georgia, PingFang SC, serif"
    fontSize: "16px"
    lineHeight: 1.8
rounded:
  control: "7px"
  node: "12px"
  canvas: "13px"
components:
  dark-button-primary:
    backgroundColor: "{colors.violet-accent}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.control}"
  remix-node:
    backgroundColor: "#fff"
    textColor: "{colors.remix-ink}"
    rounded: "{rounded.node}"
---

# Design System: AI-Sail Flow

## Overview

**Creative North Star: 创作工作台。** 保留现有界面的信息密度和清晰分区，让用户能在素材、对话、镜头节点和制作结果之间快速定位。深色外壳承载导航与 Agent 对话；浅色画布承载可编辑的二创节点。此文档记录当前实现，不定义新的品牌方向。

## Colors

工作台全局底色为 `#101114`，侧栏为更深的 `#0c0d10`；浅色二创画布使用 `#fafbfc` 和白色节点。全局交互强调色为紫色 `#717ee4`，Agent 对话区单独使用柔和绿色 `#bce6c8`。二创画布中的节点边界与连接线偏冷灰蓝，避免用强调色覆盖所有信息。

## Typography

全局使用系统无衬线字族，并保留中文系统回退字体。正文基准为 16px、1.6 行高；工作台标签和节点说明更紧凑，通常约 10–14px。Agent 回答使用项目内的 Source Serif 字体文件注册为 `Sail Agent Serif`，配合中文回退字体。

## Layout

桌面端采用固定侧栏、顶部工具栏和主体工作区；创意画布将左侧对话与右侧流程画布并排。二创画布以可拖动节点组织参考素材、镜头和生成步骤；节点宽度依据内容类型变化。窄屏时相关区域堆叠，控件应保持可操作。

## Elevation & Depth

主要通过深浅分层和细边框区分区域。浅色节点使用轻微的软阴影（例如 `0 3px 14px #27374805`）；展开的画布和浮层使用更明显的阴影。

## Shapes

常规按钮约 7px 圆角，节点约 12px，画布边框约 13px。小型控件和素材缩略图保持较紧凑的圆角；边框线细且低对比。

## Components

按钮用背景、边框和文字颜色区分主次操作，并提供悬浮、禁用和键盘焦点状态。Agent 输入框是深绿色表面，发送按钮为浅绿色；二创画布节点为白色卡片，顶部有可拖动标题区域。节点内的媒体、字段和操作按制作顺序排列。

## Do's and Don'ts

- 沿用当前区域的主题：深色导航与 Agent 对话、浅色二创画布。
- 让素材、镜头证据和当前状态优先于装饰。
- 保留现有的紫色全局强调与绿色 Agent 强调的作用范围。
