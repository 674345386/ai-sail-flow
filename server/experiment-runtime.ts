import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import { z } from 'zod';
import { dataDir, uploadDir } from './store';
import { inspectMedia } from './media';
import { bindExperimentSource, experimentSources } from './experiment-workbench';
import { emptyExperiment, ExperimentError, type ExperimentGraph, type ExperimentFile } from '../shared/experiment';
import type { Project } from '../shared/domain';

// Directory separation keeps creative files organised; it is not an OS sandbox.
// Hosted code execution needs a separate isolated worker and is deliberately off.
export const programmaticEnabled = () => process.env.SOP_REQUIRE_AUTH !== 'true' && process.env.SOP_AGENT_PROGRAMMATIC_ENABLED !== 'false';
export const experimentWorkspace = (id: string) => path.join(dataDir, 'agent-workspace', id);
export const publishExperimentFileInput = z.object({ stepId: z.string().regex(/^[\w-]{1,100}$/), path: z.string().min(1).max(2000), title: z.string().trim().min(1).max(120).optional(),
  runId: z.string().regex(/^[\w-]{1,100}$/).optional(),
  purpose: z.enum(['context', 'output']).optional(), sourceId: z.string().min(1).max(150).optional(), sourceTime: z.number().finite().nonnegative().optional(),
});

export async function publishExperimentFile(graph: ExperimentGraph | undefined, project: Project, input: z.infer<typeof publishExperimentFileInput>) {
  if (!programmaticEnabled()) throw new ExperimentError('程序化代码执行与本地产物发布当前只在本机模式开放。');
  const current = graph || emptyExperiment();
  const source = input.sourceId ? experimentSources(project, current.files).find(file => file.id === input.sourceId) : undefined;
  if (input.sourceId && !source) throw new ExperimentError('来源素材不在当前创意中。');
  if (input.sourceTime !== undefined && source?.mediaType !== 'video') throw new ExperimentError('抽帧时间需要关联当前创意中的来源视频。');
  const step = current.nodes.find(n => n.id === input.stepId);
  if (!step || step.kind !== 'step' || step.inputs.some(id => current.nodes.find(n => n.id === id)?.status !== 'completed')) throw new ExperimentError('请先建立制作步骤并完成上游输入，再发布产物。');
  if ((current.files?.length || 0) >= 120) throw new ExperimentError('当前创意最多发布 120 份程序化产物。');
  const workspace = await fs.realpath(experimentWorkspace(project.id));
  let absolute: string;
  try { absolute = await fs.realpath(path.resolve(workspace, input.path)); }
  catch { throw new ExperimentError('找不到这份本地产物，请先完成文件生成。'); }
  const relative = path.relative(workspace, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new ExperimentError('只能发布当前创意独立工作目录内的文件。');
  const stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size === 0 || stat.size > 250 * 1024 * 1024) throw new ExperimentError('产物必须是小于 250 MB 的非空文件。');
  const detected = await fileTypeFromFile(absolute);
  const mediaType = detected && ['video/mp4', 'video/quicktime', 'video/webm'].includes(detected.mime) ? 'video' : detected && ['image/png', 'image/jpeg', 'image/webp'].includes(detected.mime) ? 'image' : 'text';
  const ext = mediaType === 'text' ? 'txt' : detected!.ext;
  if (mediaType === 'text' && (!/\.(?:tsx?|jsx?|mjs|cjs|css|html|json|md|txt|srt|vtt|py)$/i.test(absolute) || stat.size > 1024 * 1024)) throw new ExperimentError('非媒体产物支持小于 1 MB 的代码、文本、脚本或字幕文件。');
  const filename = `experiment-${randomUUID()}.${ext}`, destination = path.join(uploadDir, filename);
  try {
    await fs.copyFile(absolute, destination);
    if (mediaType === 'video') await inspectMedia(filename, 'video');
    const file: ExperimentFile = { id: `local-${randomUUID()}`, title: input.title || path.basename(absolute), url: `/media/${filename}`, mediaType, status: 'completed', filename, size: stat.size,
      createdAt: new Date().toISOString(), storage: 'local', purpose: input.purpose || (mediaType === 'video' ? 'output' : 'context'), sourceId: input.sourceId, sourceTime: input.sourceTime };
    const next = bindExperimentSource({ ...current, files: [...(current.files || []), file] }, project, { stepId: step.id, sourceId: file.id, runId: input.runId, title: input.title });
    return { graph: next, file };
  } catch (error) { await fs.unlink(destination).catch(() => {}); throw error; }
}
