import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { uploadDir } from './store';
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
