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
import type { Asset } from '../shared/domain';
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
    raw = (await exec('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames:stream_disposition=attached_pic', '-of', 'json', absolute], { timeout: 20000, maxBuffer: 1024 * 1024 })).stdout;
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
  const frames = Number(video.nb_frames);
  return { mime: detected.mime, duration, width: video.width as number, height: video.height as number, hasAudio: metadata.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'), thumbnail: thumbnail ? `/media/${filename}.jpg` : undefined,
    averageFrameRate: /^[1-9]\d*\/[1-9]\d*$/.test(video.avg_frame_rate) ? video.avg_frame_rate as string : undefined,
    frameCount: Number.isSafeInteger(frames) && frames > 0 ? frames : undefined, videoCodec: typeof video.codec_name === 'string' ? video.codec_name : undefined };
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

export async function prepareVideoEditSource(filename: string, start: number, end: number, target: string) {
  await exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe',
    '-ss', start.toFixed(6), '-i', workspaceUploadPath(filename), '-t', (end - start).toFixed(6), '-map', '0:V:0', '-map', '0:a:0?',
    '-vf', "scale='if(gte(iw,ih),min(1280,iw),min(720,iw))':'if(gte(iw,ih),min(720,ih),min(1280,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-movflags', '+faststart', workspaceUploadPath(target)],
  { timeout: 180_000, maxBuffer: 1024 * 1024 });
}

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

function writeReferenceFrame(source: string, at: number, end: number, maxSize: number, output: string) {
  return exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe',
    '-ss', at.toFixed(6), '-i', source, '-t', (end - at).toFixed(6),
    '-map', '0:V:0', '-frames:v', '1', '-vf', `scale=${maxSize}:${maxSize}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`,
    '-q:v', '3', '-threads', '2', output], { timeout: 30000, maxBuffer: 1024 * 1024 });
}

export async function extractReferenceDetails(filename: string, times: number[], end: number) {
  const source = workspaceUploadPath(filename);
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'sail-reference-detail-'));
  await mediaSlot();
  try {
    const images: { times: number[]; data: string }[] = [];
    for (const [index, at] of times.entries()) {
      const output = path.join(directory, `frame-${index}.jpg`);
      await writeReferenceFrame(source, at, end, 1280, output);
      const frame = await fs.readFile(output);
      if (!frame.length) throw new Error('未提取到画面');
      images.push({ times: [at], data: frame.toString('base64') });
    }
    return images;
  } catch {
    throw new Error('视频读取失败。请选取原片中可用的画面时间。');
  } finally {
    releaseMediaSlot();
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
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
          await writeReferenceFrame(source, at, scene.end, 640, temporary);
          if (!await exists(temporary)) continue;
          await fs.rename(temporary, output);
        } finally { await fs.unlink(temporary).catch(() => {}); }
      }
      return { frameAt: at, frameUrl: `/media/${filename}` };
    }
    throw new Error('场景区间内未找到可用画面。');
  } finally { releaseMediaSlot(); }
}
