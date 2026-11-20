---
name: "per-shot-beatcut"
description: "单镜生片 + BGM 卡点拼接。每个场景只用一张关键帧生成一段 4 秒单镜视频，再按音轨实测重音把 N 段裁到 2–3 秒并拼接成片。作为视频生成的「逐镜可控」提案路线，与「分镜板分段」路线并列可选。Use when cuts must land on the music beat, when each shot needs its own camera move and duration, when a storyboard run merged or dropped shots, or when segment audio seams must be removed. Do not use when one continuous take is required, when there is no reference audio to cut against, or when the shot count times the model minimum exceeds the audio length."
metadata:
  version: "1"
  parent: short-video-replica
  role: route-proposal
---

# 单镜生片 + BGM 卡点拼接（Per-Shot Beat-Cut）

把「一条 N 镜的卡点片」拆成 **N 次单镜生成 + 1 次按重音网格拼接**。

核心判断：**分镜板路线控制不住切点，单镜路线控制得住。**
分镜板一次生成多镜，模型会自己合并或丢弃镜头，镜头边界还会漂移几百毫秒；单镜生成时每镜时长由你裁、切点由音轨决定，因此能真正做到卡在拍子上。

---

## 1. 何时选这条路

选它：

- 切点必须落在音乐重音上（卡点片、踩点混剪）；
- 每镜运镜要单独指定（推/拉/摇/移/旋），不能被模型摊平；
- 上游用分镜板生成时出现镜头合并、镜头缺失、音频拼缝；
- 需要每镜 2–3 秒这种非整数拍的节奏。

不选它：

- 需要一镜到底或连续长镜头；
- 没有参考音轨（无重音可对）；
- 场景数 × 最短片段长度 > 音轨长度（见第 3 节）。

## 2. 输入清单

| 输入 | 要求 |
|---|---|
| 场景表 | N 个场景的顺序、各自运镜意图、目标时长区间 |
| 关键帧 | 每场景 1 张，已生成且无水印，画幅与目标一致 |
| 参考音轨 | 从源视频抽出的纯音频，确认总时长 |
| 生成通道 | 支持 image-to-video + `firstFrameId` 的模型（H3 / h3-video-frames） |
| 渲染环境 | 本地 `ffmpeg` / `ffprobe` |

## 3. 硬约束（先说清，别事后解释）

1. **单镜最短 4 秒**：H3 系列 `duration` 最小 4。要 2–3 秒成片只能"生成 4 秒再裁"。
2. **单次上限 15 秒**：任何模型都无法一次生成超过 15 秒；分镜板 ≤10 秒。所以 16 秒以上的"一条完整视频"必然要拼接。
3. **总时长预算**：`N × 最短单镜 ≤ 音轨可用长度`。不满足时必须二选一：减镜数，或允许个别镜头短于目标并在交付时说明。
4. **生成数 = 镜数**：N 镜就是 N 次计费生成，提案里必须写明。

## 4. 五步流程

### 步骤 A · 每场景锁定 1 张关键帧

按场景顺序从已生成关键帧里挑，一张一处，不用同一张表达两个不同场景。挑选标准：构图最能代表该镜、无水印、与相邻镜色温一致。

### 步骤 B · 逐镜生成 4 秒单镜

一次只描述一个运动，`firstFrameId` = 该镜关键帧，`generateAudio: false`。

prompt 骨架：

```
Single continuous shot, no cuts. Camera <运动> ...
<前景/主体运动>，<光线与色调>，photorealistic, 16:9,
no text, no watermark, no logo, no people.
```

必须包含 `Single continuous shot, no cuts.`，否则模型会在 4 秒里自己切镜。

### 步骤 C · 从音轨提取重音

```bash
python3 scripts/beat_grid.py --audio bgm.wav --shots 9 \
  --min 2.0 --max 3.0 --out timeline.json
```

脚本做三件事：能量包络 → 起始强度（onset）→ 局部峰值 → 动态规划挑出一组"每段落在 [min,max]、边界都在重音上"的时间轴。`min=2.0` 不可行时会自动退到 1.9/1.8/1.7 并说明。

**不要用固定 BPM 网格硬切**：真实素材的重音会漂移，实测重音比理论拍点可靠。

### 步骤 D · 按时间轴裁切并拼接

```bash
python3 scripts/build_edit.py --timeline timeline.json \
  --clips c1.mp4 c2.mp4 c3.mp4 c4.mp4 c5.mp4 c6.mp4 c7.mp4 c8.mp4 c9.mp4 \
  --audio bgm.wav --out final.mp4
```

每段从 `--head 0.25` 秒起裁（跳过首帧可能的轻微跳变），统一 fps 与画幅，concat 后贴单条音轨并末尾淡出。

### 步骤 E · 验收（三条都要过）

1. **时长**：`ffprobe` 的 duration 等于音轨可用长度（±0.05s）。
2. **切点**：`select='gt(scene,0.12)'` 抽出的切点与 `timeline.json` 边界偏差 ≤ 2 帧。
3. **音轨**：全片只有一条音频流；0.5 秒粒度 RMS 在拼点两侧不出现断层（典型断层是某个 0.5s 掉到 -25dB 以下）。

## 5. 失败模式与处置

| 现象 | 原因 | 处置 |
|---|---|---|
| 某镜里出现切点 | prompt 未声明单镜 | 加 `Single continuous shot, no cuts.`，只重跑该镜 |
| 镜头数少于场景数 | 用分镜板一次生成多镜 | 改本路线，一镜一次 |
| 某镜素材不够长 | 上游裁切留太短 | 用上游完整片段，或允许该镜降速不超过 1.2× |
| 拼点处声音重起 | 每段各带一条音轨 | `generateAudio:false`，最终只保留一条混音 |
| 生成超时未落库 | 接口 150s 超时 | 视为未完成，重跑并标注该镜状态 |

禁止用整体慢放掩盖时长缺口：1.7× 以上慢放会被看出来，宁可缩短该镜。

## 6. 作为提案路线（propose-routes）

```json
{
  "id": "route-per-shot-n",
  "familyId": "per-shot-i2v",
  "title": "单镜生片 + BGM 拼接（N 镜）",
  "description": "N 镜各取一张已生成关键帧作首帧，逐个生成 4 秒片段并裁到目标时长，按 BGM 重音依次拼接，音频用源音轨单条。",
  "expectedOutcome": "N 镜顺序正确、单镜时长可控、切点对齐 BGM，每镜运镜独立。",
  "tradeoff": "成本随镜数线性上升；总时长受音轨长度限制。",
  "readiness": "ready",
  "readinessReason": "关键帧已存在、image-to-video 已配置、音轨已提取。",
  "requirements": ["image-to-video 生成", "已生成关键帧", "本地 ffmpeg"],
  "costNote": "N 次单镜视频生成 + 1 次本地渲染。",
  "sources": [{"kind": "agent", "title": "源视频与其音轨"}],
  "steps": [
    {"title": "生成镜1–5 单镜片段", "tool": "generate_video", "model": "h3-video",
     "prompt": "...", "parameters": {"duration": 4, "aspectRatio": "16:9", "resolution": "720p", "generateAudio": false}},
    {"title": "生成镜6–N 单镜片段", "tool": "generate_video", "model": "h3-video",
     "prompt": "...", "parameters": {"duration": 4, "aspectRatio": "16:9", "resolution": "720p", "generateAudio": false}},
    {"title": "按 BGM 拼接成片", "tool": "programmatic",
     "prompt": "按镜序裁切拼接，切点对齐实测重音，贴源音轨单条。",
     "parameters": {"method": "ffmpeg"}}
  ]
}
```

提案要点：

- 一条 route 最多 8 个 step。镜数多时用「一个 step 承接多镜」（同一 stepId 连续调用多次），不要一镜一 step。
- `parameters` 里写 `duration: 4`（模型下限），目标时长写在 description，避免参数校验失败。
- 必须写明"每镜最短 4 秒"和"N 次计费生成"。

## 7. 配套文件

- `scripts/beat_grid.py` — 重音提取 + 边界动态规划（纯标准库，无需 numpy）
- `scripts/build_edit.py` — 按时间轴裁切、拼接、贴音轨（ffmpeg）
- `references/route-proposal.md` — 参数细节、音轨处理与验收命令
