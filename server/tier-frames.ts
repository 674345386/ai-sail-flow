/* Step 1 of tiered replication: regenerate a shot's three keyframes with the images API. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import type { Project, TierNewFrame } from '../shared/domain';
import { tierPlan, type FramePosition } from '../shared/tier-prompt';
import { generateImage, type ImageReference } from './image-generation';
import { uploadDir } from './store';

export const MAX_REFERENCE_IMAGES = 16;
const mediaFile = (url: string) => path.join(uploadDir, path.basename(url));

/** Project frame ratio (width / height): source video first, then the market setting. */
export function projectRatio(project: Project) {
  const video = project.assets.find(asset => asset.kind === 'video');
  if (video?.width && video?.height) return { ratio: video.width / video.height, aspectRatio: `${video.width}:${video.height}`, label: `${video.width}×${video.height}` };
  const [w, h] = (project.market.aspectRatio || '9:16').split(':').map(Number);
  return { ratio: w / h, aspectRatio: project.market.aspectRatio || '9:16', label: project.market.aspectRatio || '9:16' };
}

/** Send exactly what the frame's input box shows: its text and its images, in order. */
export async function generateTierFrame(project: Project, shotId: string, position: FramePosition, jobId: string, prompt: string, imageUrls: string[]) {
  const shot = project.analysis?.shots.find(item => item.id === shotId);
  if (!shot) throw new Error('镜头不存在。');
  const entry = project.replication?.shots?.[shotId];
  const frame = tierPlan(project, shot).frames.find(item => item.position === position)!;
  if (!prompt.trim()) throw new Error('输入框是空的，先写点内容。');
  if (imageUrls.length > MAX_REFERENCE_IMAGES) throw new Error(`这张帧要传 ${imageUrls.length} 张图，超过接口上限 ${MAX_REFERENCE_IMAGES} 张。`);
  const references: ImageReference[] = [];
  for (const url of imageUrls) {
    const file = mediaFile(url);
    if (!(await fs.stat(file).then(stat => stat.isFile(), () => false))) throw new Error('有一张要传的图找不到了，删掉它再试。');
    const data = await fs.readFile(file);
    const mime = (await fileTypeFromBuffer(data))?.mime;
    if (!mime || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new Error('参考图必须为 PNG、JPEG 或 WebP。');
    references.push({ data, mime: mime as ImageReference['mime'], filename: path.basename(file) });
  }
  const { aspectRatio } = projectRatio(project);
  const raw = await generateImage({ idempotencyKey: jobId, prompt, aspectRatio, prefix: 'tier-frame', references, projectId: project.id, label: `镜头 ${shotId} · ${position === 'first' ? '首帧' : position === 'last' ? '尾帧' : '中间帧'}` });
  const filename = raw.filename;
  const firstFrom = frame.dependsOnFirst ? entry?.newFrames?.first?.filename : undefined;
  const kind: TierNewFrame['kind'] = 'generated';
  return { filename, url: `/media/${filename}`, kind, createdAt: new Date().toISOString(), basis: frame.basis, ...(firstFrom ? { firstFrom } : {}) };
}

/** Put a new version in place, keeping exactly one previous version for 撤回一次. */
export function withNewFrame(project: Project, shotId: string, position: FramePosition, next: Omit<TierNewFrame, 'previous'>): Project {
  const rules = project.replication!;
  const entry = rules.shots?.[shotId] || {};
  const old = entry.newFrames?.[position];
  const previous = old ? (({ previous: _drop, ...rest }) => rest)(old) : undefined;
  const newFrames = { ...(entry.newFrames || {}), [position]: { ...next, ...(previous ? { previous } : {}) } };
  return { ...project, replication: { ...rules, shots: { ...(rules.shots || {}), [shotId]: { ...entry, newFrames } } } };
}
export function undoNewFrame(project: Project, shotId: string, position: FramePosition): Project {
  const rules = project.replication!;
  const entry = rules.shots?.[shotId];
  const old = entry?.newFrames?.[position];
  if (!old?.previous) throw new Error('没有可以撤回的上一版。');
  const newFrames = { ...entry!.newFrames, [position]: old.previous };
  return { ...project, replication: { ...rules, shots: { ...rules.shots, [shotId]: { ...entry!, newFrames } } } };
}
