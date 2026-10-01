import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import { uploadDir } from './store';
import type { Asset, Shot } from '../shared/domain';
import { shotEvidenceFrames, type ShotMedia } from '../shared/shot-evidence';
const exec = promisify(execFile);
export async function inspectMedia(filename: string, kind: 'video' | 'product') {
  const absolute = path.join(uploadDir, filename);
  const detected = await fileTypeFromFile(absolute);
  const allowed = kind === 'video' ? ['video/mp4', 'video/quicktime', 'video/webm'] : ['image/jpeg', 'image/png', 'image/webp'];
  if (!detected || !allowed.includes(detected.mime)) throw new Error(kind === 'video' ? '请上传真实的 MP4、MOV 或 WebM 视频。' : '产品参考图支持 JPG、PNG、WebP。');
  if (kind === 'product') return { mime: detected.mime };
  let raw: string;
  try {
    raw = (await exec('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', absolute], { timeout: 20000, maxBuffer: 1024 * 1024 })).stdout;
  } catch { throw new Error('视频读取失败。请确认已安装 FFmpeg，或转换为常见 MP4 后重试。'); }
  const metadata = JSON.parse(raw);
  const video = metadata.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  const duration = Number(metadata.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new Error('未读取到有效视频轨道。');
  if (duration > 600) throw new Error('第一版支持最长 10 分钟的参考视频，请先截取相关片段。');
  const thumbnail = `${filename}.jpg`;
  await exec('ffmpeg', ['-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', String(Math.min(1, duration / 2)), '-i', absolute, '-frames:v', '1', '-vf', 'scale=480:-2', path.join(uploadDir, thumbnail)], { timeout: 20000 }).catch(() => {});
  return { mime: detected.mime, duration, width: video.width as number, height: video.height as number, hasAudio: metadata.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'), thumbnail: `/media/${thumbnail}` };
}

// Some OpenAI-compatible relays forward images but silently drop the video part. Sampling stills
// locally keeps those channels usable, at known timestamps and without inventing an audio track.
export async function extractKeyframes(filename: string, duration: number, max = 16) {
  const absolute = path.join(uploadDir, filename);
  const count = Math.max(2, Math.min(max, Math.round(duration / 1.2)));
  const step = duration / count;
  const frames: { at: number; file: string }[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.min(duration - 0.05, i * step + step / 2);
    const out = `${filename}.kf${i}.jpg`;
    await exec('ffmpeg', ['-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', at.toFixed(3), '-i', absolute, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '4', path.join(uploadDir, out)], { timeout: 30000 });
    frames.push({ at: Number(at.toFixed(2)), file: out });
  }
  if (!frames.length) throw new Error('无法从视频中抽取画面，请确认已安装 FFmpeg。');
  return frames;
}

const shotMediaPending = new Map<string, Promise<void>>();
let shotMediaActive = 0;
const shotMediaQueue: (() => void)[] = [];
async function mediaSlot() {
  if (shotMediaActive < 2) { shotMediaActive++; return; }
  await new Promise<void>(resolve => shotMediaQueue.push(resolve));
}
function releaseMediaSlot() { const next = shotMediaQueue.shift(); if (next) next(); else shotMediaActive--; }
async function exists(file: string) { try { return (await fs.stat(file)).size > 0; } catch { return false; } }

// Derivatives are local source evidence. No additional model request is made.
export async function prepareShotMedia(video: Asset, shot: Pick<Shot, 'start' | 'end' | 'evidenceFrames'>): Promise<ShotMedia> {
  if (!Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.start < 0 || shot.end <= shot.start || shot.end > (video.duration || 0) + .001) throw new Error('镜头时间范围超出了原片，请先修正时间。');
  const frames = shotEvidenceFrames(shot);
  const key = createHash('sha256').update(JSON.stringify(['shot-media-v1', video.filename, shot.start, shot.end, frames.map(frame => frame.at)])).digest('hex').slice(0, 24);
  const prefix = `shot-${key}`;
  const clip = path.join(uploadDir, `${prefix}.mp4`);
  let pending = shotMediaPending.get(key);
  if (!pending) {
    pending = (async () => {
      const files = [clip, ...frames.map((_, index) => path.join(uploadDir, `${prefix}-${index}.jpg`))];
      if ((await Promise.all(files.map(exists))).every(Boolean)) return;
      await mediaSlot();
      try {
        const absolute = path.join(uploadDir, video.filename);
        if (!await exists(absolute)) throw new Error('原片文件不存在。');
        for (const [index, frame] of frames.entries()) {
          const image = files[index + 1];
          if (await exists(image)) continue;
          const temp = `${image}.part.jpg`;
          try {
            await exec('ffmpeg', ['-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', frame.at.toFixed(6), '-i', absolute,
              '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2', '-q:v', '3', '-threads', '2', temp], { timeout: 30000, maxBuffer: 1024 * 1024 });
            if (!await exists(temp)) throw new Error('未读取到关键帧。');
            await fs.rename(temp, image);
          } finally { await fs.unlink(temp).catch(() => {}); }
        }
        if (!await exists(clip)) {
          const temp = `${clip}.part.mp4`;
          try {
            await exec('ffmpeg', ['-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', shot.start.toFixed(6), '-i', absolute,
              '-t', (shot.end - shot.start).toFixed(6), '-map', '0:v:0', '-map', '0:a:0?',
              '-vf', 'scale=720:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1',
              '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', temp], { timeout: 120000, maxBuffer: 1024 * 1024 });
            if (!await exists(temp)) throw new Error('未读取到镜头片段。');
            await fs.rename(temp, clip);
          } finally { await fs.unlink(temp).catch(() => {}); }
        }
      } catch { throw new Error('镜头片段或关键帧提取失败，请检查原片和 FFmpeg，或适当调整镜头边界。'); }
      finally { releaseMediaSlot(); }
    })();
    shotMediaPending.set(key, pending);
  }
  try { await pending; } finally { if (shotMediaPending.get(key) === pending) shotMediaPending.delete(key); }
  return { key, sourceAssetId: video.id, start: shot.start, end: shot.end, duration: shot.end - shot.start,
    clipUrl: `/media/${prefix}.mp4`, frames: frames.map((frame, index) => ({ ...frame, url: `/media/${prefix}-${index}.jpg` })) };
}
