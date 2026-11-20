import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ComposedVideo, Project } from '../shared/domain';
import type { ExperimentFile } from '../shared/experiment';
import type { FFmpegSkillInput } from '../shared/ffmpeg-skill';
import { inspectMedia } from './media';
import { TaskError } from './tasks';
import { workspaceDirectory, workspaceUploadPath } from './workspace-storage';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const scriptDirectory = path.join(path.dirname(require.resolve('ffmpeg-skill/package.json')), 'scripts');
const timeoutSeconds = 180;
let available: boolean | undefined;
type MediaSource = { filename: string; kind: 'video' | 'audio' };

function versionAtLeast(command: string, args: string[], pattern: RegExp, major: number, minor: number) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 2500 });
  const version = pattern.exec(result.stdout || '');
  return result.status === 0 && !!version && (Number(version[1]) > major || Number(version[1]) === major && Number(version[2]) >= minor);
}

export function ffmpegSkillAvailable() {
  return available ??= versionAtLeast('python3', ['--version'], /Python (\d+)\.(\d+)/, 3, 10)
    && ['ffmpeg', 'ffprobe'].every(command => versionAtLeast(command, ['-version'], /version n?(\d+)\.(\d+)/, 6, 1));
}

export function ffmpegSkillSource(project: Project, files: ExperimentFile[], id: string, kind: 'video' | 'audio'): MediaSource {
  const uploaded = project.assets.find(asset => asset.id === id && (asset.kind === 'video' || kind === 'audio' && asset.kind === 'audio'));
  const generated = project.generatedVideos.find(video => video.id === id && video.status === 'completed');
  const composed = project.composedVideos?.find(video => video.id === id);
  const published = files.find(file => file.id === id && file.mediaType === 'video' && file.status === 'completed');
  const filename = uploaded?.filename || generated?.filename || composed?.filename || published?.filename;
  if (!filename) throw new TaskError(404, '找不到当前创意中的音视频素材，请核对素材 ID。');
  return { filename, kind: uploaded?.kind === 'audio' ? 'audio' : 'video' };
}

async function runSkill(script: 'cut' | 'audio' | 'export', args: string[], cwd: string) {
  try {
    await exec('python3', [path.join(scriptDirectory, `${script}.py`), ...args, '--json', '--timeout', String(timeoutSeconds)], {
      cwd, timeout: (timeoutSeconds + 15) * 1000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TMPDIR: cwd, PYTHONDONTWRITEBYTECODE: '1' },
    });
  } catch (error) {
    const failure = error as { stdout?: string; killed?: boolean };
    // Return the upstream error category without including any host media paths.
    let kind: unknown;
    try { kind = JSON.parse(failure.stdout || '{}').error?.kind; } catch { /* No JSON from the tool. */ }
    if (failure.killed) throw new TaskError(504, 'FFmpeg Skill 处理超时，请缩短输入素材后重试。');
    const detail = typeof kind === 'string' && /^[a-z_]{1,60}$/.test(kind) ? `（${kind}）` : '';
    throw new TaskError(422, `FFmpeg Skill ${script} 处理失败${detail}，请检查素材、时间区间和导出设置。`);
  }
}

export async function renderFFmpegSkill(input: FFmpegSkillInput, video: MediaSource, audio?: MediaSource): Promise<ComposedVideo> {
  if (!ffmpegSkillAvailable()) throw new TaskError(503, 'FFmpeg Skill 需要 Python 3.10+ 和 FFmpeg / ffprobe 6.1+。');
  const startedAt = new Date().toISOString();
  const id = randomUUID();
  const filename = `final-${id}.mp4`;
  const directory = await fs.mkdtemp(path.join(workspaceDirectory('ffmpeg-jobs'), 'job-'));
  const output = path.join(directory, 'output.mp4');
  const destination = workspaceUploadPath(filename);
  let published = false;
  try {
    const videoPath = workspaceUploadPath(video.filename);
    const videoInfo = await inspectMedia(video.filename, 'video', false);
    if (input.operation === 'trim') {
      if (input.end <= input.start || input.end > videoInfo.duration! + 0.001) throw new TaskError(400, '裁剪区间必须在视频时长内，结束时间应大于开始时间。');
      await runSkill('cut', [videoPath, '--start', String(input.start), '--end', String(input.end), '--accurate', '-o', output], directory);
    } else if (input.operation === 'export') {
      await runSkill('export', [videoPath, '--preset', input.preset, ...(input.fit ? ['--fit', input.fit] : []), ...(input.normalize ? ['--normalize'] : []), '-o', output], directory);
    } else {
      if (!audio) throw new TaskError(400, '请提供音轨来源。');
      const audioInfo = await inspectMedia(audio.filename, audio.kind, false);
      if (!audioInfo.hasAudio) throw new TaskError(400, '选定的素材没有可用音轨。');
      let audioPath = workspaceUploadPath(audio.filename);
      if (input.audioStart !== undefined || input.audioEnd !== undefined) {
        const start = input.audioStart ?? 0;
        const end = input.audioEnd ?? audioInfo.duration!;
        if (end <= start || end > audioInfo.duration! + 0.001) throw new TaskError(400, '音轨截取区间必须在素材时长内，结束时间应大于开始时间。');
        const clip = path.join(directory, 'audio.wav');
        await runSkill('cut', [audioPath, '--start', String(start), '--end', String(end), '--accurate', '-o', clip], directory);
        audioPath = clip;
      }
      const mixOptions = input.operation === 'mix-audio' ? [
        ...(input.musicFadeOut !== undefined ? ['--music-fade-out', String(input.musicFadeOut)] : []),
        ...(input.volumeDb !== undefined ? ['--music-volume', String(input.volumeDb)] : []),
        ...(input.duck ? ['--duck'] : []),
      ] : input.fadeOut !== undefined ? ['--fade-out', String(input.fadeOut)] : [];
      await runSkill('audio', [videoPath, input.operation === 'mix-audio' ? '--music' : '--replace', audioPath, ...mixOptions, '-o', output], directory);
    }

    if ((await fs.stat(output)).size > 250 * 1024 * 1024) throw new TaskError(413, '成片超过 250 MB，请缩短素材或选择更小的导出规格。');
    await fs.chmod(output, 0o600);
    await fs.rename(output, destination);
    published = true;
    const metadata = await inspectMedia(filename, 'video', false);
    return { id, mode: 'ffmpeg-skill', sourceVideoIds: [input.videoId], voice: input.operation === 'replace-audio' ? 'replaced' : input.operation === 'mix-audio' ? 'mixed' : 'original',
      filename, url: `/media/${filename}`, duration: metadata.duration!, startedAt, finishedAt: new Date().toISOString() };
  } catch (error) {
    if (published) await fs.unlink(destination).catch(() => {});
    if (error instanceof TaskError) throw error;
    throw new TaskError(422, '无法读取输入素材或验证 FFmpeg Skill 输出。');
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
