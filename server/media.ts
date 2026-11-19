import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';
import fs from 'node:fs/promises';
import { existsSync, renameSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import { workspaceUploadPath } from './workspace-storage';
import type { ReferenceFrameSampling } from '../shared/agent-video-analysis';
import type { Asset, Shot } from '../shared/domain';
import { shotEvidenceFrames, type ShotMedia } from '../shared/shot-evidence';
const exec = promisify(execFile);
export async function inspectMedia(filename: string, kind: Asset['kind'], includeThumbnail = true) {
  const absolute = workspaceUploadPath(filename);
  const detected = await fileTypeFromFile(absolute);
  const allowed = kind === 'video' ? ['video/mp4', 'video/quicktime', 'video/webm'] : kind === 'audio'
    ? ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/vnd.wave', 'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/opus', 'audio/webm', 'video/mp4', 'video/webm']
    : ['image/jpeg', 'image/png', 'image/webp'];
  if (!detected || !allowed.includes(detected.mime)) throw new Error(kind === 'video' ? '请上传真实的 MP4、MOV 或 WebM 视频。' : kind === 'audio' ? '请上传真实的 MP3、M4A、WAV、AAC、FLAC、OGG 或 Opus 音频。' : '产品参考图支持 JPG、PNG、WebP。');
  if (kind === 'product') return { mime: detected.mime };
  let raw: string;
  try {
    raw = (await exec('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,width,height:stream_disposition=attached_pic', '-of', 'json', absolute], { timeout: 20000, maxBuffer: 1024 * 1024 })).stdout;
  } catch { throw new Error(kind === 'audio' ? '音频读取失败，请检查文件或转换为 MP3、M4A、WAV 后重试。' : '视频读取失败。请确认已安装 FFmpeg，或转换为常见 MP4 后重试。'); }
  const metadata = JSON.parse(raw);
  const video = metadata.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  const duration = Number(metadata.format?.duration);
  if (kind === 'audio') {
    if (!metadata.streams?.some((stream: { codec_type: string }) => stream.codec_type === 'audio') || !Number.isFinite(duration) || duration <= 0
      || metadata.streams.some((stream: { codec_type: string; disposition?: { attached_pic?: number } }) => stream.codec_type === 'video' && !stream.disposition?.attached_pic)) throw new Error('未读取到有效的独立音频轨道，请选择音频文件。');
    return { mime: detected.mime === 'video/mp4' ? 'audio/mp4' : detected.mime === 'video/webm' ? 'audio/webm' : detected.mime, duration, hasAudio: true };
  }
  if (!video || !Number.isFinite(duration) || duration <= 0) throw new Error('未读取到有效视频轨道。');
  if (duration > 600) throw new Error('第一版支持最长 10 分钟的参考视频，请先截取相关片段。');
  const thumbnail = includeThumbnail && await ensureMediaThumbnail(filename, duration);
  return { mime: detected.mime, duration, width: video.width as number, height: video.height as number, hasAudio: metadata.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'), thumbnail: thumbnail ? `/media/${filename}.jpg` : undefined };
}

const thumbnailJobs = new Map<string, Promise<string | undefined>>();
export async function ensureMediaThumbnail(filename: string, duration?: number) {
  const source = workspaceUploadPath(filename);
  const target = workspaceUploadPath(`${filename}.jpg`);
  if (await exists(target)) return target;
  const existing = thumbnailJobs.get(target);
  if (existing) return existing;
  const job = (async () => {
    await mediaSlot();
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      if (!await exists(source)) return;
      const seek = duration ? ['-ss', String(Math.min(1, duration / 2))] : [];
      await exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-threads', '1', '-protocol_whitelist', 'file,pipe',
        ...seek, '-i', source, '-map', '0:V:0', '-frames:v', '1', '-filter_threads', '1',
        '-vf', 'scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2', '-q:v', '4',
        '-threads', '1', '-f', 'mjpeg', temp], { timeout: 20000 });
      if (!await exists(temp) || !existsSync(source)) return;
      renameSync(temp, target);
      return target;
    } catch { /* A missing poster cannot stop uploads or playback. */ }
    finally {
      await fs.unlink(temp).catch(() => {});
      releaseMediaSlot();
    }
  })();
  thumbnailJobs.set(target, job);
  return job.finally(() => thumbnailJobs.delete(target));
}

/** Slice a generated sequence into one local clip per planned shot boundary. */
export async function sliceGeneratedVideo(filename: string, segments: { start: number; duration: number }[]) {
  const source = workspaceUploadPath(filename);
  const outputs: { filename: string; url: string; duration: number; size: number; width: number; height: number; hasAudio: boolean; thumbnail?: string; mime: string }[] = [];
  for (const [index, segment] of segments.entries()) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.duration) || segment.start < 0 || segment.duration <= 0) throw new Error('多镜头切分时间无效。');
    const target = `tier-group-${randomUUID()}.mp4`, absolute = workspaceUploadPath(target);
    try {
      await exec('ffmpeg', ['-y', '-v', 'error', '-ss', segment.start.toFixed(3), '-i', source, '-t', segment.duration.toFixed(3), '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', absolute], { timeout: 120000, maxBuffer: 1024 * 1024 });
      const metadata = await inspectMedia(target, 'video');
      outputs.push({ filename: target, url: `/media/${target}`, duration: metadata.duration!, size: (await fs.stat(absolute)).size, width: metadata.width!, height: metadata.height!, hasAudio: !!metadata.hasAudio, thumbnail: metadata.thumbnail, mime: 'video/mp4' });
    } catch (error) {
      await fs.unlink(absolute).catch(() => {});
      await Promise.all(outputs.map(output => fs.unlink(workspaceUploadPath(output.filename)).catch(() => {})));
      throw new Error(`第 ${index + 1} 个镜头切分失败：${error instanceof Error ? error.message : '视频处理失败'}`);
    }
  }
  return outputs;
}

export async function prepareVideoEditSource(filename: string, start: number, end: number, target: string) {
  await exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe',
    '-ss', start.toFixed(6), '-i', workspaceUploadPath(filename), '-t', (end - start).toFixed(6), '-map', '0:V:0', '-map', '0:a:0?',
    '-vf', "scale='if(gte(iw,ih),min(1280,iw),min(720,iw))':'if(gte(iw,ih),min(720,ih),min(1280,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', workspaceUploadPath(target)],
  { timeout: 180_000, maxBuffer: 1024 * 1024 });
}

// Some OpenAI-compatible relays forward images but silently drop the video part. Sampling stills
// locally keeps those channels usable, at known timestamps and without inventing an audio track.
export async function extractKeyframes(filename: string, duration: number, max = 16) {
  const absolute = workspaceUploadPath(filename);
  const count = Math.max(2, Math.min(max, Math.round(duration / 1.2)));
  const step = duration / count;
  const frames: { at: number; file: string }[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.min(duration - 0.05, i * step + step / 2);
    const out = `${filename}.kf${i}.jpg`;
    await exec('ffmpeg', ['-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-ss', at.toFixed(3), '-i', absolute, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '4', workspaceUploadPath(out)], { timeout: 30000 });
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

export const referenceSheetColumns = 4;
const referenceSheetFrames = referenceSheetColumns ** 2;
const maxReferenceSheets = 5;
export const maxReferenceFrames = referenceSheetFrames * maxReferenceSheets;

/** Decode once and label the sampled frames with their original video times. */
export async function extractReferenceSheets(filename: string, start: number, end: number, sampling: ReferenceFrameSampling = 'standard') {
  const span = end - start;
  const detailed = sampling === 'frame-by-frame';
  const sheetLimit = sampling === 'overview' ? 1 : maxReferenceSheets;
  const step = Math.max(sampling === 'overview' ? 0.35 : 1 / 6, span / (referenceSheetFrames * sheetLimit));
  const source = workspaceUploadPath(filename);
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'sail-reference-'));
  await mediaSlot();
  try {
    const filter = [
      detailed ? `trim=end_frame=${maxReferenceFrames}` : `select='isnan(prev_selected_t)+gte(t-prev_selected_t,${step})'`,
      'scale=256:256:force_original_aspect_ratio=decrease:force_divisible_by=2', 'setsar=1',
      ...(detailed ? ['scdet', 'metadata=print:key=lavfi.scd.score:file=-'] : []),
      'showinfo=checksum=0', `tile=${referenceSheetColumns}x${referenceSheetColumns}:padding=4:margin=4`,
    ].join(',');
    const { stdout, stderr } = await exec('ffmpeg', ['-nostdin', '-hide_banner', '-v', 'info', '-protocol_whitelist', 'file,pipe',
      '-ss', start.toFixed(6), '-t', span.toFixed(6), '-threads', '2', '-i', source,
      '-map', '0:V:0', '-filter_threads', '1', '-vf', filter, '-fps_mode', 'passthrough',
      '-frames:v', String(sheetLimit), '-q:v', '3', '-threads', '1', path.join(directory, 'sheet-%02d.jpg'),
    ], { timeout: 60_000, maxBuffer: 1024 * 1024 });
    const times = Array.from(stderr.matchAll(/\bpts_time:([\d.eE+-]+)/g), match => Number((start + Number(match[1])).toFixed(detailed ? 6 : 3)));
    const scores = Array.from(stdout.matchAll(/^lavfi\.scd\.score=([\d.]+)$/gm), match => Number(match[1]));
    const files = (await fs.readdir(directory)).filter(file => file.endsWith('.jpg')).sort();
    if (!times.length || !files.length) throw new Error('未提取到画面');
    return await Promise.all(files.map(async (file, index) => {
      const from = index * referenceSheetFrames;
      const to = from + referenceSheetFrames;
      return {
        times: times.slice(from, to),
        ...(detailed ? { changeScores: scores.slice(from, to) } : {}),
        data: (await fs.readFile(path.join(directory, file))).toString('base64'),
      };
    }));
  } catch {
    throw new Error('视频读取失败。请核对参考视频和时间范围，或尝试读取更短的片段。');
  } finally {
    releaseMediaSlot();
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function measureReferenceAudio(video: Asset, start: number, end: number) {
  if (video.hasAudio === false) return { status: 'absent' as const };
  const step = 0.02;
  await mediaSlot();
  try {
    const { stdout } = await exec('ffmpeg', ['-nostdin', '-hide_banner', '-v', 'error', '-protocol_whitelist', 'file,pipe',
      '-ss', start.toFixed(6), '-t', (end - start).toFixed(6), '-i', workspaceUploadPath(video.filename),
      '-map', '0:a:0', '-af', 'aresample=16000,asetnsamples=n=320:p=0,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
      '-f', 'null', '-'], { timeout: 15_000, maxBuffer: 64 * 1024 });
    const bins = Array.from(stdout.matchAll(/\bpts_time:([\d.eE+-]+)\s*\n^lavfi\.astats\.Overall\.RMS_level=([^\n]+)$/gm), ([, time, level]): [number, number | null] =>
      [Number((start + Number(time)).toFixed(6)), Number.isFinite(Number(level)) ? Number(Number(level).toFixed(1)) : null]);
    const rms = bins.filter(([at]) => at + step <= end + 1e-6);
    if (rms.length) return { status: 'measured' as const, binSeconds: step, columns: ['at', 'rmsDbFS'], rms };
  } catch { /* Frame evidence remains usable if the audio track is unreadable. */ }
  finally { releaseMediaSlot(); }
  return { status: 'unavailable' as const };
}

// Derivatives are local source evidence. No additional model request is made.
export async function prepareReferenceSceneFrame(video: Asset, scene: { start: number; end: number; frameAt: number }) {
  const source = workspaceUploadPath(video.filename);
  await mediaSlot();
  try {
    for (const at of new Set([scene.frameAt, scene.start])) {
      const key = createHash('sha256').update(JSON.stringify([video.filename, at, scene.end])).digest('hex').slice(0, 24);
      const filename = `reference-scene-${key}.jpg`;
      const output = workspaceUploadPath(filename);
      if (!await exists(output)) {
        const temporary = `${output}.${randomUUID()}.part.jpg`;
        try {
          await exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe',
            '-ss', at.toFixed(6), '-i', source, '-t', (scene.end - at).toFixed(6),
            '-map', '0:V:0', '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1',
            '-q:v', '3', '-threads', '2', temporary], { timeout: 30000, maxBuffer: 1024 * 1024 });
          if (!await exists(temporary)) continue;
          await fs.rename(temporary, output);
        } finally { await fs.unlink(temporary).catch(() => {}); }
      }
      return { frameAt: at, frameUrl: `/media/${filename}` };
    }
    throw new Error('场景区间内未找到可用画面。');
  } finally { releaseMediaSlot(); }
}

export async function prepareShotMedia(video: Asset, shot: Pick<Shot, 'start' | 'end' | 'evidenceFrames'>, includeClip = true, inlineFrames = false): Promise<ShotMedia> {
  if (!Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.start < 0 || shot.end <= shot.start || shot.end > (video.duration || 0) + .001) throw new Error('镜头时间范围超出了原片，请先修正时间。');
  const frames = shotEvidenceFrames(shot);
  const key = createHash('sha256').update(JSON.stringify(['shot-media-v2', video.filename, shot.start, shot.end, frames.map(frame => frame.at)])).digest('hex').slice(0, 24);
  const prefix = `shot-${key}`;
  const clip = workspaceUploadPath(`${prefix}.mp4`);
  const requestKey = `${key}:${includeClip}`;
  let pending = shotMediaPending.get(requestKey);
  if (!pending) {
    pending = (async () => {
      const files = [clip, ...frames.map((_, index) => workspaceUploadPath(`${prefix}-${index}.jpg`))];
      if ((await Promise.all((includeClip ? files : files.slice(1)).map(exists))).every(Boolean)) return;
      await mediaSlot();
      try {
        const absolute = workspaceUploadPath(video.filename);
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
      ...(inlineFrames ? { previewUrl: `data:image/jpeg;base64,${(await fs.readFile(workspaceUploadPath(`${prefix}-${index}.jpg`))).toString('base64')}` } : {}),
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
  const input = source ? ['-ss', source.at.toFixed(3), '-protocol_whitelist', 'file,pipe', '-i', workspaceUploadPath(source.video), '-frames:v', '1'] : ['-i', frameFile];
  await exec('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-vf', crop, '-q:v', '2', outFile], { timeout: 30_000 });
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', outFile]);
  const [width, height] = stdout.trim().split(',').map(Number);
  return { width, height };
}

/** Full-resolution still from the source video, used as the edit base for regenerated keyframes. */
export async function extractFrame(video: string, at: number, outFile: string) {
  await exec('ffmpeg', ['-y', '-loglevel', 'error', '-ss', Math.max(0, at).toFixed(3), '-protocol_whitelist', 'file,pipe', '-i', workspaceUploadPath(path.basename(video)), '-frames:v', '1', '-q:v', '2', outFile], { timeout: 30_000 });
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

