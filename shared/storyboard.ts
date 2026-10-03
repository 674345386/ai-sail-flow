import type { Project, Rewrite } from './domain';

export type RewriteShot = Rewrite['shots'][number];

export function sourceShotFor(project: Project, shot: RewriteShot) {
  return project.analysis?.shots.find(source => source.id === (shot.sourceShotId || shot.id));
}

// Validate the model's mapping, then use the source order and proportional cut times.
export function bindRewriteToSource(project: Project, rewrite: Rewrite): Rewrite {
  const sources = project.analysis!.shots;
  const mapped = new Map(rewrite.shots.map(shot => [shot.sourceShotId, shot]));
  if (rewrite.shots.length !== sources.length || mapped.size !== sources.length || sources.some(source => !mapped.has(source.id))) {
    throw new Error('改写镜头与原片没有一一对应，请重新生成方案。');
  }
  const duration = project.market.duration === 'original' ? project.analysis!.duration : Number(project.market.duration);
  const ratio = duration / project.analysis!.duration;
  return { ...rewrite, shots: sources.map(source => {
    const shot = mapped.get(source.id)!;
    return { ...shot, id: source.id, sourceShotId: source.id,
      start: Number((source.start * ratio).toFixed(6)), end: Number((source.end * ratio).toFixed(6)), evidenceFrames: undefined };
  }) };
}

export function keyframeBasis(project: Project, shot: RewriteShot) {
  const value = JSON.stringify({ source: sourceShotFor(project, shot), product: project.product,
    references: project.assets.filter(asset => asset.kind === 'product').map(asset => asset.id),
    reference: project.assets.find(asset => asset.kind === 'video')?.id,
    replication: project.replication, aspectRatio: project.market.aspectRatio, people: project.market.people,
    globalPrompt: project.rewrite?.globalPrompt, negativePrompt: project.rewrite?.negativePrompt,
    visual: shot.visual, subject: shot.subject, action: shot.action, camera: shot.camera,
    effects: shot.effects, productPresence: shot.productPresence, keyframePrompt: shot.keyframePrompt });
  // Small deterministic fingerprint keeps project saves compact in both browser and server.
  let first = 2166136261, second = 5381;
  for (let index = 0; index < value.length; index++) {
    first = Math.imul(first ^ value.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ value.charCodeAt(index);
  }
  return `keyframe-v1:${value.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function keyframeCurrent(project: Project, shot: RewriteShot) {
  return !project.rewriteStale && shot.keyframe?.status === 'completed' && !!shot.keyframe.url && shot.keyframe.basis === keyframeBasis(project, shot);
}

export function keyframesReady(project: Project) {
  if (!project.analysis || !project.rewrite || project.rewriteStale || project.promptFlow === 'direct-analysis') return false;
  const mapping = project.rewrite.shots.map(shot => shot.sourceShotId);
  return mapping.length === project.analysis.shots.length && new Set(mapping).size === mapping.length &&
    mapping.every(id => !!id && project.analysis!.shots.some(shot => shot.id === id)) &&
    project.rewrite.shots.every(shot => keyframeCurrent(project, shot));
}
