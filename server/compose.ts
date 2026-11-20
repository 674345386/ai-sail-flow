import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { workspaceUploadPath } from './workspace-storage';

const exec = promisify(execFile);
type Progress = (n: number, message: string) => void;

export type ProductionClip = { id: string; filename: string; start: number; end: number; hasAudio?: boolean };

export async function composeProductionVideo(clips: ProductionClip[], width: number, height: number, progress: Progress) {
  const id = randomUUID(), filename = `final-${id}.mp4`;
  const provisional = workspaceUploadPath(`final-${id}.part.mp4`);
  const args = ['-nostdin', '-y', '-v', 'error'];
  const filters: string[] = [];
  for (const [index, clip] of clips.entries()) {
    const file = workspaceUploadPath(clip.filename);
    args.push('-protocol_whitelist', 'file,pipe', '-threads', '1', '-i', file);
    let hasAudio = clip.hasAudio;
    if (hasAudio === undefined) {
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { timeout: 20_000 });
      hasAudio = !!stdout.trim();
    }
    const start = clip.start.toFixed(6), end = clip.end.toFixed(6), duration = (clip.end - clip.start).toFixed(6);
    filters.push(`[${index}:V:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=0.034,trim=duration=${duration}[v${index}]`);
    filters.push(hasAudio
      ? `[${index}:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${duration}[a${index}]`
      : `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration}[a${index}]`);
  }
  const duration = clips.reduce((sum, clip) => sum + clip.end - clip.start, 0);
  filters.push(`${clips.map((_, index) => `[v${index}][a${index}]`).join('')}concat=n=${clips.length}:v=1:a=1[video][audio]`);
  const startedAt = new Date().toISOString();
  try {
    progress(20, '正在按选定片段顺序拼接成片…');
    await exec('ffmpeg', [...args, '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[video]', '-map', '[audio]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-threads', '2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', duration.toFixed(6), provisional],
    { timeout: 600_000, maxBuffer: 3 * 1024 * 1024 });
    await chmod(provisional, 0o600);
    await rename(provisional, workspaceUploadPath(filename));
    return { id, mode: 'veo-native' as const, sourceVideoIds: clips.map(clip => clip.id), voice: 'original', filename, url: `/media/${filename}`, duration, startedAt, finishedAt: new Date().toISOString() };
  } finally { await rm(provisional, { force: true }).catch(() => {}); }
}
