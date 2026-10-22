import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
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
export async function prepareShotMedia(video: Asset, shot: Pick<Shot, 'start' | 'end' | 'evidenceFrames'>, includeClip = true, inlineFrames = false): Promise<ShotMedia> {
  if (!Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.start < 0 || shot.end <= shot.start || shot.end > (video.duration || 0) + .001) throw new Error('镜头时间范围超出了原片，请先修正时间。');
  const frames = shotEvidenceFrames(shot);
  const key = createHash('sha256').update(JSON.stringify(['shot-media-v2', video.filename, shot.start, shot.end, frames.map(frame => frame.at)])).digest('hex').slice(0, 24);
  const prefix = `shot-${key}`;
  const clip = path.join(uploadDir, `${prefix}.mp4`);
  const requestKey = `${key}:${includeClip}`;
  let pending = shotMediaPending.get(requestKey);
  if (!pending) {
    pending = (async () => {
      const files = [clip, ...frames.map((_, index) => path.join(uploadDir, `${prefix}-${index}.jpg`))];
      if ((await Promise.all((includeClip ? files : files.slice(1)).map(exists))).every(Boolean)) return;
      await mediaSlot();
      try {
        const absolute = path.join(uploadDir, video.filename);
        if (!await exists(absolute)) throw new Error('原片文件不存在。');
        for (const [index, frame] of frames.entries()) {
          const image = files[index + 1];
          if (await exists(image)) continue;
          const temp = `${image}.${randomUUID()}.part.jpg`;
          try {
            // Seeking at end can land on the next shot (or EOF). Decode a bounded
            // tail window and select its last frame strictly before the cut.
            const seekAt = frame.position === 'last' ? Math.max(shot.start, shot.end - .5) : frame.at;
            const filter = [frame.position === 'last' && `trim=end=${(shot.end - seekAt).toFixed(6)},reverse`,
              'scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2'].filter(Boolean).join(',');
            const inputDuration = frame.position === 'last' ? ['-t', (shot.end - seekAt).toFixed(6)] : [];
            await exec('ffmpeg', ['-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', seekAt.toFixed(6), ...inputDuration, '-i', absolute,
              '-map', '0:v:0', '-frames:v', '1', '-vf', filter, '-q:v', '3', '-threads', '2', temp], { timeout: 30000, maxBuffer: 1024 * 1024 });
            if (!await exists(temp)) throw new Error('未读取到关键帧。');
            await fs.rename(temp, image);
          } finally { await fs.unlink(temp).catch(() => {}); }
        }
        if (includeClip && !await exists(clip)) {
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
    shotMediaPending.set(requestKey, pending);
  }
  try { await pending; } finally { if (shotMediaPending.get(requestKey) === pending) shotMediaPending.delete(requestKey); }
  return { key, sourceAssetId: video.id, start: shot.start, end: shot.end, duration: shot.end - shot.start,
    clipUrl: `/media/${prefix}.mp4`, frames: await Promise.all(frames.map(async (frame, index) => ({ ...frame, url: `/media/${prefix}-${index}.jpg`,
      ...(inlineFrames ? { previewUrl: `data:image/jpeg;base64,${(await fs.readFile(path.join(uploadDir, `${prefix}-${index}.jpg`))).toString('base64')}` } : {}),
    }))) };
}

/** Crop a normalized box (0–1000, [ymin, xmin, ymax, xmax]) out of a saved frame, with a little padding. */
export async function cropFrame(frameFile: string, box: [number, number, number, number], outFile: string, source?: { video: string; at: number }) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value / 1000));
  let [y0, x0, y1, x1] = box.map(clamp);
  if (y1 <= y0 || x1 <= x0) throw new Error('主体框无效。');
  const padY = (y1 - y0) * .1, padX = (x1 - x0) * .1;
  y0 = Math.max(0, y0 - padY); x0 = Math.max(0, x0 - padX); y1 = Math.min(1, y1 + padY); x1 = Math.min(1, x1 + padX);
  const crop = `crop=trunc(iw*${(x1 - x0).toFixed(4)}/2)*2:trunc(ih*${(y1 - y0).toFixed(4)}/2)*2:iw*${x0.toFixed(4)}:ih*${y0.toFixed(4)}`;
  // Crop from the original video at full resolution when we know the time; keyframe thumbnails are downscaled.
  const input = source ? ['-ss', source.at.toFixed(3), '-protocol_whitelist', 'file,pipe', '-i', path.join(uploadDir, source.video), '-frames:v', '1'] : ['-i', frameFile];
  await exec('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-vf', crop, '-q:v', '2', outFile], { timeout: 30_000 });
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', outFile]);
  const [width, height] = stdout.trim().split(',').map(Number);
  return { width, height };
}

/** Full-resolution still from the source video, used as the edit base for regenerated keyframes. */
export async function extractFrame(video: string, at: number, outFile: string) {
  await exec('ffmpeg', ['-y', '-loglevel', 'error', '-ss', Math.max(0, at).toFixed(3), '-protocol_whitelist', 'file,pipe', '-i', path.join(uploadDir, path.basename(video)), '-frames:v', '1', '-q:v', '2', outFile], { timeout: 30_000 });
}
/** Re-encode a reference as JPEG with the long side capped at 1536, so edit uploads stay small. */
export async function shrinkImage(inFile: string, outFile: string) {
  await exec('ffmpeg', ['-y', '-loglevel', 'error', '-i', inFile, '-vf', "scale='if(gte(iw,ih),min(1536,iw),-2)':'if(gte(iw,ih),-2,min(1536,ih))'", '-q:v', '3', outFile], { timeout: 30_000 });
}
/** Center-crop an image to width/height = ratio (image models return 2:3, Veo needs the project ratio). */
export async function cropToRatio(inFile: string, ratio: number, outFile: string) {
  const crop = `crop='trunc(min(iw,ih*${ratio.toFixed(6)})/2)*2':'trunc(min(ih,iw/${ratio.toFixed(6)})/2)*2'`;
  await exec('ffmpeg', ['-y', '-loglevel', 'error', '-i', inFile, '-vf', crop, outFile], { timeout: 30_000 });
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', outFile]);
  const [width, height] = stdout.trim().split(',').map(Number);
  return { width, height };
}
