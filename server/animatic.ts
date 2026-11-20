import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { Project } from '../shared/domain';
import { emptyExperiment, ExperimentError, type ExperimentFile, type ExperimentGraph } from '../shared/experiment';
import { bindExperimentSource, experimentSources } from './experiment-workbench';
import { workspaceUploadPath } from './workspace-storage';

const exec = promisify(execFile);

export const animaticMotionSchema = z.enum(['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'static']);
export const animaticInputSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  stepId: z.string().regex(/^[\w-]{1,100}$/).optional(),
  frameIds: z.array(z.string().min(1).max(150)).min(1).max(24),
  durations: z.array(z.number().finite().min(0.5).max(12)).max(24).optional(),
  motions: z.array(animaticMotionSchema).max(24).optional(),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
  audioId: z.string().min(1).max(150).optional(),
});

export type AnimaticInput = z.infer<typeof animaticInputSchema>;

function mediaFilenameFromUrl(url: string): string | null {
  if (!url.startsWith('/media/')) return null;
  const base = path.basename(url.slice('/media/'.length).split('?')[0] || '');
  return base && !base.includes('..') ? base : null;
}

function zoompanExpr(motion: z.infer<typeof animaticMotionSchema>, frames: number, width: number, height: number) {
  const denom = Math.max(1, frames - 1);
  if (motion === 'zoom-in') {
    return `zoompan=z='1+0.12*on/${denom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=25`;
  }
  if (motion === 'zoom-out') {
    return `zoompan=z='1.12-0.12*on/${denom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=25`;
  }
  if (motion === 'pan-left') {
    return `zoompan=z='1.1':x='(iw-iw/zoom)*(1-on/${denom})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=25`;
  }
  if (motion === 'pan-right') {
    return `zoompan=z='1.1':x='(iw-iw/zoom)*(on/${denom})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=25`;
  }
  return `zoompan=z='1':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=25`;
}

export async function renderAnimaticPreview(graph: ExperimentGraph | undefined, project: Project, input: AnimaticInput) {
  const current = graph || emptyExperiment();
  const sources = experimentSources(project, current.files);
  const resolvedFrames: { id: string; file: string; duration: number; motion: z.infer<typeof animaticMotionSchema> }[] = [];

  for (let i = 0; i < input.frameIds.length; i++) {
    const id = input.frameIds[i]!;
    const source = sources.find(item => item.id === id);
    if (!source || source.mediaType !== 'image' || !source.url) {
      throw new ExperimentError(`关键帧素材 ${id} 不存在或不是可用图片。`);
    }
    const filename = mediaFilenameFromUrl(source.url);
    if (!filename) throw new ExperimentError(`关键帧素材 ${id} 缺少本地文件路径。`);
    const file = workspaceUploadPath(filename);
    const duration = input.durations?.[i] ?? 2.5;
    const defaultMotions: z.infer<typeof animaticMotionSchema>[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];
    const motion = input.motions?.[i] ?? defaultMotions[i % defaultMotions.length]!;
    resolvedFrames.push({ id, file, duration, motion });
  }

  let audioFile: string | undefined;
  if (input.audioId) {
    const audioAsset = project.assets.find(item => item.id === input.audioId && item.mime.startsWith('audio/'));
    const filename = audioAsset ? mediaFilenameFromUrl(audioAsset.url) : null;
    if (!filename) throw new ExperimentError(`音频素材 ${input.audioId} 不存在或不是音频文件。`);
    audioFile = workspaceUploadPath(filename);
  }

  const [width, height] = input.aspectRatio === '9:16' ? [720, 1280] : input.aspectRatio === '1:1' ? [960, 960] : [1280, 720];
  const id = randomUUID();
  const filename = `animatic-${id}.mp4`;
  const provisional = workspaceUploadPath(`animatic-${id}.part.mp4`);
  const totalDuration = resolvedFrames.reduce((sum, item) => sum + item.duration, 0);

  const args: string[] = ['-nostdin', '-y', '-v', 'error'];
  const filters: string[] = [];
  for (const [idx, frame] of resolvedFrames.entries()) {
    args.push('-loop', '1', '-t', frame.duration.toFixed(3), '-i', frame.file);
    const frames = Math.max(12, Math.round(frame.duration * 25));
    const zp = zoompanExpr(frame.motion, frames, width, height);
    filters.push(`[${idx}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},${zp},format=yuv420p,setsar=1[v${idx}]`);
  }
  filters.push(`${resolvedFrames.map((_, idx) => `[v${idx}]`).join('')}concat=n=${resolvedFrames.length}:v=1:a=0[video]`);

  if (audioFile) {
    args.push('-i', audioFile);
    const audioIdx = resolvedFrames.length;
    filters.push(`[${audioIdx}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${totalDuration.toFixed(3)}[audio]`);
  } else {
    filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${totalDuration.toFixed(3)}[audio]`);
  }

  try {
    await exec(
      'ffmpeg',
      [
        ...args,
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[video]',
        '-map',
        '[audio]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-t',
        totalDuration.toFixed(3),
        provisional,
      ],
      { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
    );
    await chmod(provisional, 0o600);
    const destination = workspaceUploadPath(filename);
    await rename(provisional, destination);
    const fileStat = await stat(destination);

    // Also generate a poster thumbnail from frame 0 for crisp video cards.
    await exec('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', destination, '-frames:v', '1', '-q:v', '4', `${destination}.jpg`], { timeout: 20_000 }).catch(() => {});

    const title = input.title || `Animatic 动态分镜预演（${resolvedFrames.length} 镜 · ${totalDuration.toFixed(1)}s）`;
    const file: ExperimentFile = {
      id: `animatic-${id}`,
      title,
      url: `/media/${filename}`,
      mediaType: 'video',
      status: 'completed',
      filename,
      size: fileStat.size,
      createdAt: new Date().toISOString(),
      storage: 'local',
      purpose: 'output',
    };

    let nextGraph: ExperimentGraph = { ...current, files: [...(current.files || []), file] };
    let targetStepId = input.stepId;
    if (!targetStepId || !nextGraph.nodes.some(n => n.id === targetStepId && n.kind === 'step')) {
      const stepId = `animatic-step-${id.slice(0, 8)}`;
      const inputNodeIds = resolvedFrames
        .map(f => nextGraph.nodes.find(n => n.sourceId === f.id)?.id)
        .filter((v): v is string => !!v);
      const maxX = nextGraph.nodes.length ? Math.max(...nextGraph.nodes.map(n => n.position.x)) : 0;
      const minY = nextGraph.nodes.length ? Math.min(...nextGraph.nodes.map(n => n.position.y)) : 0;
      nextGraph = {
        ...nextGraph,
        nodes: [
          ...nextGraph.nodes,
          {
            id: stepId,
            kind: 'step',
            title: 'Animatic 动态分镜预演',
            description: `由 ${resolvedFrames.length} 张关键帧免费本地渲染预演（${totalDuration.toFixed(1)}s），确认节奏后再跑视频模型。`,
            prompt: '',
            content: '',
            method: 'FFmpeg Animatic',
            status: 'completed',
            inputs: [...new Set(inputNodeIds)],
            position: { x: maxX + 340, y: minY },
            revision: 1,
            inputRevisions: {},
          },
        ],
      };
      targetStepId = stepId;
    }

    const bound = bindExperimentSource(nextGraph, project, {
      stepId: targetStepId,
      sourceId: file.id,
      title,
    });
    return { graph: bound, file, duration: totalDuration, frameCount: resolvedFrames.length };
  } finally {
    await rm(provisional, { force: true }).catch(() => {});
  }
}
