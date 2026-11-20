# 参数细节、音轨处理与验收命令

## 参数对照

| 参数 | 取值 | 说明 |
|---|---|---|
| duration | 4 | 模型下限，不能填 2–3；目标时长写在 description |
| aspectRatio | 跟随目标画幅 | 与关键帧一致 |
| resolution | 720p | 与关键帧一致，避免放大糊 |
| generateAudio | false | 音轨统一后期贴，避免每段各带一条 |
| firstFrameId | 关键帧 ID | 一镜一张，按场景顺序 |

## step 分组

一条 route 最多 8 个 step：

- N ≤ 7：镜 1..N-1 各自一 step，加一个拼接 step；
- N ≥ 8：按「前半 / 后半 / 拼接」三段，同一 stepId 连续调用多次生成。

## 音轨处理

```bash
# 只取内容段（避开平台片尾卡）
ffmpeg -y -i source.mp4 -t 16.8 -vn -ac 1 -ar 22050 -c:a pcm_s16le bgm.wav

# 整条音轨
ffmpeg -y -i source.mp4 -vn -ac 1 -ar 22050 -c:a pcm_s16le bgm.wav
```

源视频常把平台片尾卡的声音混在尾段（表现为一个特别大的瞬态，强度常是普通重音的 2 倍以上）。若成片不需要越过片尾起点，用 `--end` 把结束点设在片尾之前。

## 验收命令

```bash
# 时长
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 final.mp4

# 切点（与 timeline.json 边界比对，允许 ±2 帧）
ffmpeg -hide_banner -i final.mp4 -filter:v "select='gt(scene,0.12)',showinfo" -an -f null - 2>&1 \
  | grep pts_time | sed -E 's/.*pts_time:([0-9.]+).*/\1/'

# 音轨连续性：导出 16k 单声道后按 0.5s 求 RMS，检查拼点两侧不掉到 -25dB 以下
ffmpeg -y -v error -i final.mp4 -vn -ac 1 -ar 16000 /tmp/check.wav
```

## 提案措辞

- 「每镜 4 秒生成、裁到 2–3 秒：模型单次最短 4 秒，2–3 秒由裁切实现。」
- 「总时长受音轨约束：N 镜 × 最短单镜 ≤ 音轨长度，超出部分不能凭空补。」
- 「成本 = N 次单镜生成 + 1 次本地渲染。」
