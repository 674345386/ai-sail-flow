import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rename, rm, writeFile, chmod, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GeneratedVideo, Project, Shot } from '../shared/domain';
import { buildVeoPlan } from '../shared/veo-plan';
import { uploadDir } from './store';

const exec = promisify(execFile);
const captionRenderer = fileURLToPath(new URL('./render-captions.swift', import.meta.url));
type Voice = { name: string; language: string };
type Progress = (percent: number, message: string) => void;

export async function listTtsVoices(): Promise<Voice[]> {
  const { stdout } = await exec('say', ['-v', '?'], { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
  return stdout.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/);
    return match ? [{ name: match[1].trim(), language: match[2].replace('_', '-') }] : [];
  });
}

function timecode(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function narrationSrt(shots: Shot[]) {
  return shots.filter(shot => shot.narration.trim()).map((shot, index) =>
    `${index + 1}\n${timecode(shot.start)} --> ${timecode(shot.end)}\n${shot.narration.trim()}\n`,
  ).join('\n');
}

async function mediaDuration(file: string) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { timeout: 20_000 });
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('系统音色未产生可用配音，请更换音色并确认本机语音服务可用。');
  return seconds;
}

function localVideoFile(video: GeneratedVideo) {
  if (!video.filename || !/^veo-[a-f\d-]{36}\.mp4$/.test(video.filename)) throw new Error('生成片段缺少可用的本地视频文件。');
  return path.join(uploadDir, video.filename);
}

async function render(project: Project, videos: GeneratedVideo[], requestedVoice: string, progress: Progress, unitId?: string) {
  if (!project.rewrite) throw new Error('请先生成分镜。');
  const voices = await listTtsVoices();
  const locale = project.market.language;
  const candidates = voices.filter(voice => voice.language.toLowerCase() === locale.toLowerCase());
  if (requestedVoice && !candidates.some(voice => voice.name === requestedVoice)) throw new Error(`所选音色不属于 ${locale}，请重新选择。`);
  const chosen = candidates.find(voice => voice.name === requestedVoice) || candidates.find(voice =>
    ['Samantha', 'Daniel', 'Karen', 'Anna', 'Thomas', 'Luciana', 'Kyoko'].includes(voice.name)) || candidates[0];
  if (!chosen) throw new Error(`本机没有 ${locale} 系统音色，无法生成该语言的配音。`);

  const plan = buildVeoPlan(project.rewrite.shots);
  const units = unitId ? plan.filter(unit => unit.id === unitId) : plan;
  if (!units.length || videos.length !== units.length || videos.some((video, index) => video.unitId !== units[index].id || video.status !== 'completed' || video.stale)) throw new Error('请先完成当前模式所需的 Veo 生产单元。');
  const aspect = videos[0]?.aspectRatio;
  if (videos.some(video => video.aspectRatio !== aspect)) throw new Error('各生产单元的画幅不一致，请使用相同画幅重新生成。');
  const width = aspect === '16:9' ? 1280 : 720;
  const height = aspect === '16:9' ? 720 : 1280;
  const rangeStart = units[0].start;
  const rangeEnd = units.at(-1)!.end;
  const duration = rangeEnd - rangeStart;
  const shots = project.rewrite.shots;
  const overlapping = shots.filter(shot => shot.end > rangeStart && shot.start < rangeEnd);
  const spoken = overlapping.filter(shot => shot.narration.trim());
  const visible = overlapping.filter(shot => shot.narration.trim() || shot.onScreenText.trim());
  const temp = await mkdtemp(path.join(os.tmpdir(), 'sop-compose-'));
  const id = randomUUID();
  const prefix = unitId ? 'unit' : 'final';
  const provisional = path.join(uploadDir, `${prefix}-${id}.part.mp4`);
  const filename = `${prefix}-${id}.mp4`;
  const subtitleFilename = `${prefix}-${id}.srt`;
  try {
    progress(10, '正在按分镜生成配音…');
    const tracks: { file: string; start: number; offset: number; length: number; speed: number }[] = [];
    for (const [index, shot] of spoken.entries()) {
      const file = path.join(temp, `voice-${index}.aiff`);
      const script = path.join(temp, `voice-${index}.txt`);
      await writeFile(script, shot.narration.trim());
      await exec('say', ['-v', chosen.name, '-o', file, '-f', script], { timeout: 90_000 });
      const actual = await mediaDuration(file);
      const window = shot.end - shot.start;
      const speed = Math.max(1, actual / Math.max(0.1, window - 0.08));
      if (speed > 1.6) throw new Error(`第 ${shots.indexOf(shot) + 1} 镜口播长 ${actual.toFixed(1)} 秒，画面只有 ${window.toFixed(1)} 秒；请缩短台词或延长该镜头。`);
      const overlapStart = Math.max(shot.start, rangeStart);
      const overlapEnd = Math.min(shot.end, rangeEnd);
      tracks.push({ file, start: overlapStart - rangeStart, offset: overlapStart - shot.start, length: overlapEnd - overlapStart, speed });
      progress(10 + Math.round((index + 1) / Math.max(1, spoken.length) * 40), `已生成 ${index + 1}/${spoken.length} 段配音`);
    }
    progress(55, '正在制作文字与字幕图层…');
    const manifest = path.join(temp, 'captions.json');
    await writeFile(manifest, JSON.stringify({ width, height, cues: visible.map(shot => ({ headline: shot.onScreenText.trim() === shot.narration.trim() ? '' : shot.onScreenText.trim(), caption: shot.narration.trim() })) }));
    if (visible.length) await exec('swift', [captionRenderer, manifest, temp], {
      timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, SWIFT_MODULE_CACHE_PATH: path.join(temp, 'swift-cache') },
    });

    const args: string[] = ['-y', '-v', 'error'];
    for (const video of videos) args.push('-i', localVideoFile(video));
    for (const track of tracks) args.push('-i', track.file);
    for (let index = 0; index < visible.length; index++) args.push('-loop', '1', '-framerate', '30', '-i', path.join(temp, `caption-${index}.png`));
    const filters: string[] = [];
    units.forEach((unit, index) => filters.push(`[${index}:v]trim=duration=${unit.targetDuration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p[v${index}]`));
    filters.push(`${units.map((_, index) => `[v${index}]`).join('')}concat=n=${units.length}:v=1:a=0[visual]`);
    let visual = 'visual';
    visible.forEach((shot, index) => {
      const next = `overlay${index}`;
      filters.push(`[${visual}][${videos.length + tracks.length + index}:v]overlay=0:0:enable='gte(t,${Math.max(0, shot.start - rangeStart)})*lt(t,${Math.min(duration, shot.end - rangeStart)})'[${next}]`);
      visual = next;
    });
    filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration}[silence]`);
    tracks.forEach((track, index) => filters.push(`[${videos.length + index}:a]aresample=48000,aformat=channel_layouts=stereo,atempo=${track.speed.toFixed(4)},atrim=start=${track.offset.toFixed(3)}:duration=${track.length.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(track.start * 1000)}:all=1[a${index}]`));
    if (tracks.length) filters.push(`[silence]${tracks.map((_, index) => `[a${index}]`).join('')}amix=inputs=${tracks.length + 1}:duration=longest:normalize=0,atrim=duration=${duration},alimiter=limit=0.95[audio]`);
    else filters.push('[silence]anull[audio]');
    args.push('-filter_complex', filters.join(';'), '-map', `[${visual}]`, '-map', '[audio]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', String(duration), provisional);
    progress(70, '正在合成画面、配音与字幕…');
    await exec('ffmpeg', args, { timeout: 600_000, maxBuffer: 3 * 1024 * 1024 });
    await rename(provisional, path.join(uploadDir, filename));
    await chmod(path.join(uploadDir, filename), 0o600);
    await writeFile(path.join(uploadDir, subtitleFilename), narrationSrt(overlapping.map(shot => ({ ...shot, start: Math.max(0, shot.start - rangeStart), end: Math.min(duration, shot.end - rangeStart) }))), { mode: 0o600 });
    const size = (await stat(path.join(uploadDir, filename))).size;
    progress(95, '成片已写入本机…');
    return { id, mode: 'tts-subtitles' as const, unitId, sourceVideoIds: videos.map(video => video.id), voice: chosen.name,
      filename, url: `/media/${filename}`, subtitleFilename, subtitleUrl: `/media/${subtitleFilename}`,
      duration, size, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
  } catch (error) {
    await rm(provisional, { force: true }).catch(() => {});
    throw error;
  } finally { await rm(temp, { recursive: true, force: true }).catch(() => {}); }
}

export const composeVideo = (project: Project, videos: GeneratedVideo[], voice: string, progress: Progress) => render(project, videos, voice, progress);
export const composeUnitVideo = (project: Project, video: GeneratedVideo, voice: string, progress: Progress) => render(project, [video], voice, progress, video.unitId);
