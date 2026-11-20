import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { Project } from '../shared/domain';
import { emptyExperiment, ExperimentError, type ExperimentGraph } from '../shared/experiment';
import { experimentSources } from './experiment-workbench';
import { workspaceUploadPath } from './workspace-storage';

const exec = promisify(execFile);

export const inspectQualityInputSchema = z.object({
  nodeId: z.string().regex(/^[\w-]{1,100}$/).optional(),
  sourceId: z.string().min(1).max(150).optional(),
  frameCount: z.number().int().min(1).max(5).default(3),
});

export type InspectQualityInput = z.infer<typeof inspectQualityInputSchema>;

function mediaFilenameFromUrl(url: string): string | null {
  if (!url.startsWith('/media/')) return null;
  const base = path.basename(url.slice('/media/'.length).split('?')[0] || '');
  return base && !base.includes('..') ? base : null;
}

export async function extractArtifactQualityFrames(graph: ExperimentGraph | undefined, project: Project, input: InspectQualityInput) {
  const current = graph || emptyExperiment();
  const node = input.nodeId ? current.nodes.find(item => item.id === input.nodeId) : undefined;
  const sourceId = input.sourceId || node?.sourceId;
  const sources = experimentSources(project, current.files);
  const source = sourceId ? sources.find(item => item.id === sourceId) : undefined;

  const url = node?.url || source?.url;
  const mediaType = node?.mediaType || source?.mediaType;
  if (!url || !mediaType || (mediaType !== 'video' && mediaType !== 'image')) {
    throw new ExperimentError('未找到可质检的图片或视频产物，请传入有效的 nodeId 或 sourceId。');
  }
  const filename = mediaFilenameFromUrl(url);
  if (!filename) throw new ExperimentError('该产物缺少本地媒体文件，无法抽帧质检。');
  const fullPath = workspaceUploadPath(filename);

  if (mediaType === 'image') {
    const buffer = await readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return {
      nodeId: node?.id,
      sourceId,
      title: node?.title || source?.title || '图片产物',
      mediaType: 'image' as const,
      frames: [{ time: 0, url, mimeType, data: buffer.toString('base64') }],
    };
  }

  const { stdout } = await exec(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fullPath],
    { timeout: 15_000 },
  );
  const duration = Math.max(0.2, Number.parseFloat(stdout.trim()) || 4);
  const count = input.frameCount;
  const ratios = count === 1 ? [0.5] : Array.from({ length: count }, (_, idx) => 0.1 + (0.8 * idx) / (count - 1));
  const frames: { time: number; url: string; mimeType: string; data: string }[] = [];

  for (let i = 0; i < ratios.length; i++) {
    const time = Math.min(Math.max(0, duration * ratios[i]!), Math.max(0, duration - 0.08));
    const frameFilename = `qc-${randomUUID().slice(0, 12)}-${i + 1}.jpg`;
    const framePath = workspaceUploadPath(frameFilename);
    await exec(
      'ffmpeg',
      ['-nostdin', '-y', '-v', 'error', '-ss', time.toFixed(3), '-i', fullPath, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=768:-2', framePath],
      { timeout: 25_000 },
    );
    const buffer = await readFile(framePath);
    frames.push({
      time: Number(time.toFixed(2)),
      url: `/media/${frameFilename}`,
      mimeType: 'image/jpeg',
      data: buffer.toString('base64'),
    });
  }

  return {
    nodeId: node?.id,
    sourceId,
    title: node?.title || source?.title || '视频产物',
    mediaType: 'video' as const,
    duration: Number(duration.toFixed(2)),
    frames,
  };
}
