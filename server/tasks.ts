import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { GeneratedVideo, Job, Project, Rewrite } from '../shared/domain';
import { validateMarket } from '../shared/domain';
import { buildVeoUnitPrompt } from '../shared/export';
import { buildVeoPlan } from '../shared/veo-plan';
import { finalVideo, productionSources, videoCurrent } from '../shared/workflow';
import { rewrite, configured, keyframeRequest, generateKeyframe } from './gemini';
import { VEO_MODELS, VEO_DURATION, generateVideo, resumeVideo, generationConfigured, saveGeneratedVideo, requestBody, type GenerationInput } from './veo';
import { composeVideo, composeUnitVideo, composeNativeVideo, composeProductionVideo, TimingConfirmationRequired, type ProductionClip } from './compose';
import { getProject, saveProject } from './store';
import { workspacePath, workspaceUploadPath } from './workspace-storage';
import { shotReconstructionPrompt } from '../shared/shot-evidence';
import { mergeFocusPoints, selectedFocus, selectedShotFocus } from '../shared/focus';
import { keyframeBasis, keyframeCurrent } from '../shared/storyboard';
import { keyframeStorageStatus, publishKeyframe, publishReferenceImage, publishReferenceVideo } from './keyframe-storage';
import { tierPlan, tierVideoPrompt } from '../shared/tier-prompt';
import { tierGroupPrompt } from '../shared/tier-video-group';
import { inspectMedia, prepareReferenceSceneFrame, prepareVideoEditSource, sliceGeneratedVideo } from './media';
import type { ReferenceSceneTable } from '../shared/agent-video-analysis';
import { imageAttemptStatus, imageGenerationStatus } from './image-generation';
import { generateStoryboardGrids } from './storyboard-grid';
import { MAX_STORYBOARD_GRID_DURATION } from '../shared/storyboard-grid';
import { REMIX_SECONDS } from '../shared/remix';
import { generateOmniVideo, omniRequestBody, waitOmni } from './omni';
import { creativeAgentEnabled } from './agent-provider';
import { getAgentState } from './creative-agent';
import { runReferenceAnalysis, type FullReferenceAnalysis } from './agent-video-analysis';

export class TaskError extends Error { constructor(public status: number, message: string) { super(message); } }
export type TaskSpec = { kind: 'analysis'; agentAnalysis?: FullReferenceAnalysis } | { kind: 'analysis-refine' } | { kind: 'rewrite' } | { kind: 'keyframe'; shotId: string } | { kind: 'generation'; input: GenerationInput } |
  { kind: 'recover'; videoId: string } | { kind: 'compose'; voice?: string; videoId?: string; timingApproval?: string; production?: { clips: ProductionClip[]; width: number; height: number } };
const activeProjects = new Set<string>();
let occupied = 0;
const queue: (() => void)[] = [];
async function acquire() { if (occupied < 2) { occupied++; return; } await new Promise<void>(resolve => queue.push(resolve)); }
function release() { const next = queue.shift(); if (next) next(); else occupied--; }

function update(id: string, change: (project: Project) => Project) { return saveProject(change(getProject(id)!)); }
function sources(project: Project) { const videos = productionSources(project); if (!videos.length || videos.some(video => !video)) throw new TaskError(409, '请先完成当前模式的全部视频片段。'); return videos as GeneratedVideo[]; }

function directAnalysisStoryboard(project: Project): Rewrite {
  const analysis = project.analysis!;
  return {
    angle: '直接沿用参考视频的分析。',
    audienceInsight: '',
    hookVariants: [{ label: '原片开头', text: analysis.shots[0]?.narration || analysis.shots[0]?.visual || '沿用原片开场' }],
    localizationNotes: [],
    productionNotes: ['分镜内容来自原片分析，可在生成前编辑视频 Prompt。', '保留已记录的原片时间线、语言、动作、运镜、口播、屏幕文字和声音。'],
    globalPrompt: `Recreate the analyzed reference video faithfully. Preserve its original style, shot order, pacing, camera work, actions, language, narration, on-screen text, and sound. Apply only the user's explicitly allowed changes. Source summary: ${analysis.summary}. Selected global recreation priorities: ${selectedFocus(analysis.focusPoints).join('; ') || 'none specified'}.`,
    negativePrompt: '',
    shots: analysis.shots.map(shot => ({ ...shot, sourceShotId: shot.id, generationPrompt: `${shotReconstructionPrompt(shot)}${selectedShotFocus(shot).length ? ` Selected shot priorities: ${selectedShotFocus(shot).join('; ')}.` : ''}` })),
  };
}

async function renderKeyframe(id: string, shotId: string) {
  const project = getProject(id)!;
  const shot = project.rewrite!.shots.find(shot => shot.id === shotId)!;
  const previous = shot.keyframe?.basis === keyframeBasis(project, shot) ? shot.keyframe : undefined;
  const attemptStatus = previous?.attemptId ? imageAttemptStatus(previous.attemptId) : undefined;
  if (attemptStatus === 'submitting' || attemptStatus === 'unknown') {
    throw new TaskError(409, '该关键帧请求结果待核对；为避免重复生成和扣费，不会再次提交。');
  }
  const request = previous?.attemptId && attemptStatus === 'completed' ? { ...previous, status: 'running' as const, error: undefined } : await keyframeRequest(project, shot);
  const saveFrame = (keyframe: NonNullable<Rewrite['shots'][number]['keyframe']>) => update(id, current => ({ ...current,
    rewrite: { ...current.rewrite!, shots: current.rewrite!.shots.map(shot => shot.id === shotId ? { ...shot, keyframe } : shot) },
    generatedVideos: current.generatedVideos.map(video => video.sourceShotIds?.includes(shotId) ? { ...video, stale: true } : video),
    composedVideos: current.composedVideos?.map(video => ({ ...video, stale: true })),
  }));
  saveFrame(request);
  try {
    const result = await generateKeyframe(project, request);
    saveFrame(result.keyframe);
    update(id, current => ({ ...current, usage: { input: current.usage.input + result.usage.input, output: current.usage.output + result.usage.output } }));
  } catch (error) {
    saveFrame({ ...request, status: 'failed', error: error instanceof Error ? error.message : '关键帧生成失败。' });
    throw error;
  }
}

async function saveSource(id: string, videoId: string, local: Partial<GeneratedVideo>, progress: (n: number, message: string) => void) {
  let project = update(id, p => ({ ...p, generatedVideos: p.generatedVideos.map(video => video.id === videoId ? { ...video, status: 'completed', finishedAt: new Date().toISOString(), stale: false, ...local } : video) }));
  const source = project.generatedVideos.find(video => video.id === videoId)!;
  if (project.productionMode !== 'tts-subtitles' || source.storyboardGridId || source.gridId || source.unitId?.startsWith('canvas-test-') || source.unitId?.startsWith('agent-video-')) return;
  const rendered = await composeUnitVideo(project, source, project.ttsVoice || '', progress);
  project = update(id, p => ({ ...p, composedVideos: [...(p.composedVideos || []), rendered] }));
  if (productionSources(project).every(video => video?.filename) && !finalVideo(project)) {
    const final = await composeVideo(project, sources(project), project.ttsVoice || '', progress);
    update(id, p => ({ ...p, composedVideos: [...(p.composedVideos || []), final] }));
  }
}

async function saveReferenceAnalysis(
  project: Project, analysis: FullReferenceAnalysis, breakdownType: Project['breakdownType'],
  progress: (n: number, message: string) => void,
) {
  const video = project.assets.find(asset => asset.kind === 'video')!;
  const { result, meta, scenes, masterPrompt } = analysis;
  const rows: ReferenceSceneTable['rows'] = [];
  for (const [index, scene] of scenes.entries()) {
    if (index % 5 === 0) progress(68 + Math.floor(index / scenes.length * 10), `正在提取场景截图 ${index + 1}/${scenes.length}…`);
    try {
      const primary = await prepareReferenceSceneFrame(video, scene);
      const keyframes = [{ at: primary.frameAt, url: primary.frameUrl }];
      for (const frameAt of scene.additionalFrameTimes || []) {
        const frame = await prepareReferenceSceneFrame(video, { ...scene, frameAt });
        if (!keyframes.some(item => item.url === frame.frameUrl)) keyframes.push({ at: frame.frameAt, url: frame.frameUrl });
      }
      rows.push({ ...scene, ...primary, keyframes: keyframes.sort((a, b) => a.at - b.at) });
    } catch (error) {
      throw new Error(`第 ${index + 1} 个场景的原片截图提取失败。`, { cause: error });
    }
  }
  const referenceSceneTable = { videoId: video.id, duration: result.duration, createdAt: meta.analyzedAt, masterPrompt, rows };
  const storyboardGrids = breakdownType === 'storyboard-grid'
    ? await generateStoryboardGrids(video, result, project.storyboardGridSize || 3, project.market.aspectRatio,
      (done, total) => progress(78 + Math.round(done / total * 18), `正在生成分镜网格 ${done}/${total}…`))
    : [];
  update(project.id, current => {
    const previous = current.analysis;
    const oldShots = new Map(previous?.shots.map(shot => [shot.id, shot]));
    const shots = result.shots.map(shot => {
      const old = oldShots.get(shot.id);
      const overlap = old ? Math.max(0, Math.min(old.end, shot.end) - Math.max(old.start, shot.start)) : 0;
      const sameSegment = old && overlap / Math.max(old.end - old.start, shot.end - shot.start) > 0.5;
      return { ...shot, focusPoints: mergeFocusPoints(sameSegment ? old.focusPoints : [], shot.focusPoints) };
    });
    return { ...current, isDemo: false, ttsTimingNotice: undefined,
      analysis: previous ? { ...result, focusPoints: mergeFocusPoints(previous.focusPoints, result.focusPoints), shots } : result,
      analysisReview: { pendingIds: [], suggestions: {} }, analysisMeta: meta, analysisRequest: null,
      breakdownType, storyboardGrids, referenceSceneTable, rewriteStale: !!current.rewrite,
      generatedVideos: current.generatedVideos.map(video => ({ ...video, stale: true })), composedVideos: current.composedVideos?.map(video => ({ ...video, stale: true })),
    };
  });
}

// Manual controls and the automatic runner both use this executor. Every launch
// persists its input before provider submission, and its result before returning.
export function launchTask(id: string, spec: TaskSpec): Promise<void> {
  const p = getProject(id);
  if (!p) throw new TaskError(404, '找不到这个项目。');
  if (activeProjects.has(id) || p.job?.status === 'running') throw new TaskError(409, '当前任务正在处理，请等待完成。');
  if (spec.kind === 'generation' && spec.input.canvasTestVideo && (spec.input.storyboardGridId || spec.input.tierShotId || spec.input.tierShotIds?.length)) throw new TaskError(400, '独立测试视频不能同时绑定分镜。');
  const marketError = validateMarket(p.market); if (marketError) throw new TaskError(400, marketError);
  const needsAgent = spec.kind === 'analysis' && !spec.agentAnalysis || spec.kind === 'analysis-refine';
  if (needsAgent && !creativeAgentEnabled) throw new TaskError(503, '创作 Agent 未启用，暂时无法分析视频。');
  if (needsAgent && getAgentState(id).status === 'running') throw new TaskError(409, '创作 Agent 正在执行，请等待当前任务完成。');
  if (spec.kind === 'rewrite' && p.promptFlow !== 'direct-analysis' && !configured()) throw new TaskError(503, '请先连接 Gemini 本地化改写服务。');
  if ((spec.kind === 'keyframe' || spec.kind === 'rewrite' && (p.promptFlow || 'localized') === 'localized') && !imageGenerationStatus().configured) throw new TaskError(503, '请先连接图片生成服务。');
  if (spec.kind === 'analysis' && !p.assets.some(asset => asset.kind === 'video')) throw new TaskError(400, '请先上传参考视频。');
  if (spec.kind === 'analysis-refine' && (!p.analysis || !p.assets.some(asset => asset.kind === 'video') || !p.analysisReview?.pendingIds.length)) throw new TaskError(400, '没有待重新分析的镜头。');
  if (spec.kind === 'rewrite' && (!p.analysis || (p.promptFlow !== 'direct-analysis' && (!p.product.name.trim() || !p.product.facts.trim())))) throw new TaskError(400, '请先完成视频拆解，并填写产品名称与已确认卖点。');
  if (spec.kind === 'rewrite' && p.promptFlow !== 'direct-analysis' && !p.assets.some(asset => asset.kind === 'product')) throw new TaskError(400, '请上传产品参考图，作为复刻关键帧的外观依据。');
  if (spec.kind === 'keyframe' && (!p.rewrite || p.rewriteStale || p.promptFlow === 'direct-analysis' || !p.rewrite.shots.some(shot => shot.id === spec.shotId))) throw new TaskError(409, '请先生成与当前资料一致的逐镜头改写方案。');
  if (['generation', 'recover'].includes(spec.kind) && !(spec.kind === 'generation' && ((spec.input.storyboardGridId || spec.input.canvasTestVideo) && !spec.input.omni)) && !generationConfigured()) throw new TaskError(503, '请先连接视频生成服务。');
  const tierShotId = spec.kind === 'generation' ? spec.input.tierShotId : undefined;
  const storyboardGridId = spec.kind === 'generation' ? spec.input.storyboardGridId : undefined;
  if (['generation', 'compose'].includes(spec.kind) && !(spec.kind === 'compose' && spec.production) && !tierShotId && !(spec.kind === 'generation' && (spec.input.tierShotIds?.length || spec.input.canvasTestVideo || spec.input.omni)) && !storyboardGridId && (!p.rewrite || p.rewriteStale)) throw new TaskError(409, '请先生成与当前资料一致的分镜。');
  const generationInput = spec.kind === 'generation' ? { ...spec.input } : undefined;
  if (generationInput?.previewRevision !== undefined && generationInput.previewRevision !== p.revision) throw new TaskError(409, '镜头资料已更新，请重新打开生成预览。');
  const maxReferenceImages = generationInput?.omni ? (generationInput.omni.firstLastFrame ? 2 : 7) : generationInput?.tierShotIds?.length ? 3 : generationInput?.storyboardGridId ? 1 : 2;
  if (generationInput?.referenceImages && (generationInput.referenceImages.length < 1 || generationInput.referenceImages.length > maxReferenceImages)) throw new TaskError(400, '参考图数量超过当前模型限制，请移除多余图片。');
  let video: GeneratedVideo | undefined;
  let groupVideos: GeneratedVideo[] = [];
  const now = new Date().toISOString();
  if (spec.kind === 'generation' && generationInput?.omni && !storyboardGridId) {
    const input = generationInput;
    const omni = input.omni!;
    if (input.canvasTestVideo || input.tierShotId || input.tierShotIds?.length || !input.prompt.trim() || input.prompt.length > 12000 || !['720p', '1080p'].includes(input.resolution)) throw new TaskError(400, 'Omni 视频参数无效。');
    const references = input.referenceImages || [];
    if (omni.firstLastFrame && (references.length < (omni.model ? 1 : 2) || references.length > 2)) throw new TaskError(400, '请按顺序提供有效的首帧或首尾帧。');
    if ((references.length || omni.source) && !keyframeStorageStatus().configured) throw new TaskError(409, '请先连接 Supabase 私有素材存储。');
    const videoId = randomUUID();
    const model = omni.model || (omni.duration === 8 ? 'omni_flash_8s' : 'omni_flash_10s');
    const editSource = omni.source && { videoId: omni.source.videoId, start: omni.source.start, end: omni.source.end };
    Object.assign(input, { unitId: `agent-video-${videoId}`, mode: references.length || editSource ? 'r2v' : 't2v', images: [] });
    video = { id: videoId, provider: 'omni-flash', model,
      mode: input.mode, productionMode: 'veo-native', imageUrls: [], referenceIds: omni.referenceIds, editSource, requestKey: omni.requestKey, requestFingerprint: omni.requestFingerprint,
      resolution: input.resolution, shotId: videoId, unitId: input.unitId, sourceShotIds: [], status: 'running', prompt: input.prompt,
      providerRequest: { model, prompt: input.prompt, resolution: input.resolution, ...(!editSource ? { aspect_ratio: input.aspectRatio, first_last_frame: omni.firstLastFrame, ...(omni.model ? { seconds: omni.duration } : {}) } : {}) },
      duration: editSource ? editSource.end - editSource.start : omni.duration ?? 10, ...(editSource ? { targetDuration: editSource.end - editSource.start } : {}),
      aspectRatio: input.aspectRatio, startedAt: now };
  } else if (spec.kind === 'generation' && tierShotId) {
    const input = generationInput!;
    const shot = p.analysis?.shots.find(item => item.id === tierShotId);
    if (!shot) throw new TaskError(404, '镜头不存在。');
    const plan = tierPlan(p, shot), frames = p.replication?.shots?.[shot.id]?.newFrames;
    if (!plan.canVideo || !frames?.first || !frames.last) throw new TaskError(409, '先生成这个镜头的新首帧和新尾帧。');
    if (!keyframeStorageStatus().configured) throw new TaskError(409, '请先在模型连接设置中连接 Supabase 私有图片存储。');
    Object.assign(input, { mode: 'i2v', images: [], unitId: `tier-${shot.id}`, prompt: input.prompt.trim() ? input.prompt : tierVideoPrompt(shot) });
    video = { id: randomUUID(), provider: 'veo-3.1', model: VEO_MODELS.i2v, mode: 'i2v', productionMode: p.productionMode || 'veo-native', imageUrls: [],
      resolution: input.resolution, shotId: shot.id, unitId: input.unitId, sourceShotIds: [shot.id], targetStart: shot.start, targetEnd: shot.end,
      targetDuration: shot.end - shot.start, status: 'running', prompt: input.prompt, defaultPrompt: tierVideoPrompt(shot), providerRequest: requestBody(input, input.prompt),
      keyframeUrl: frames.middle?.url || frames.first.url, tierShotId: shot.id, tierFirst: frames.first.filename, tierLast: frames.last.filename,
      duration: VEO_DURATION, aspectRatio: input.aspectRatio, startedAt: now };
  } else if (spec.kind === 'generation' && generationInput?.tierShotIds?.length) {
    const input = generationInput, ids = [...new Set(input.tierShotIds)];
    if (ids.length < 2 || ids.length > 3) throw new TaskError(400, '多镜头生成需选择 2–3 个镜头。');
    const ordered = p.analysis?.shots.filter(shot => ids.includes(shot.id)) || [];
    if (ordered.length !== ids.length) throw new TaskError(404, '部分镜头已不存在，请刷新后重试。');
    const duration = ordered.reduce((sum, shot) => sum + shot.end - shot.start, 0);
    if (duration > VEO_DURATION) throw new TaskError(400, `所选镜头总时长为 ${duration.toFixed(1)} 秒，超过 Veo 单次 8 秒限制。`);
    if (!keyframeStorageStatus().configured) throw new TaskError(409, '请先在模型连接设置中连接 Supabase 私有图片存储。');
    const frameRows = ordered.map(shot => {
      const frames = p.replication?.shots?.[shot.id]?.newFrames;
      const plan = tierPlan(p, shot);
      if (!plan.canVideo || !frames?.first || !frames.last) throw new TaskError(409, `镜头 ${shot.id} 缺少新首帧或新尾帧。`);
      return { shot, frames };
    });
    const groupId = randomUUID();
    const defaultPrompt = tierGroupPrompt(p, ids);
    if (input.previewRevision !== p.revision) throw new TaskError(409, '镜头资料已更新，请重新打开生成预览。');
    if (!input.prompt.trim() || input.prompt.length > 100000) throw new TaskError(400, '请先预览并确认完整 Prompt。');
    const prompt = input.prompt;
    Object.assign(input, { mode: 'r2v', tierShotId: undefined, unitId: `tier-group-${groupId}`, prompt, images: [] });
    groupVideos = frameRows.map(({ shot, frames }) => ({ id: randomUUID(), provider: 'veo-3.1', model: VEO_MODELS.r2v, mode: 'r2v', productionMode: p.productionMode || 'veo-native', imageUrls: [],
      resolution: input.resolution, shotId: shot.id, unitId: `tier-group-${groupId}`, sourceShotIds: [shot.id], tierGroupId: groupId, tierGroupShotIds: ids,
      targetStart: shot.start, targetEnd: shot.end, targetDuration: shot.end - shot.start, status: 'running', prompt, defaultPrompt,
      providerRequest: requestBody(input, prompt), keyframeUrl: frames.middle?.url || frames.first!.url, tierShotId: shot.id,
      tierFirst: frames.first!.filename, tierLast: frames.last!.filename, duration: VEO_DURATION * (shot.end - shot.start) / duration,
      aspectRatio: input.aspectRatio, startedAt: now }));
    video = groupVideos[0];
  } else if (spec.kind === 'generation' && generationInput?.canvasTestVideo && !storyboardGridId) {
    const input = generationInput;
    if (input.tierShotId || input.tierShotIds?.length || !input.prompt.trim() || input.prompt.length > 100000) throw new TaskError(400, '请填写有效的视频生成描述。');
    const videoId = randomUUID();
    Object.assign(input, { unitId: `canvas-test-${videoId}`, mode: 't2v', images: [] });
    video = { id: videoId, provider: 'local-test', model: 'local-test', mode: 't2v', productionMode: p.productionMode || 'veo-native',
      resolution: input.resolution, shotId: videoId, unitId: input.unitId, sourceShotIds: [], status: 'running', prompt: input.prompt,
      duration: REMIX_SECONDS, aspectRatio: input.aspectRatio, startedAt: now };
  } else if (spec.kind === 'generation' && storyboardGridId) {
    const input = generationInput!;
    if (p.breakdownType !== 'storyboard-grid') throw new TaskError(409, '当前创意不是分镜网格模式。');
    const grid = (p.storyboardGrids || []).find(item => item.id === storyboardGridId);
    if (!grid) throw new TaskError(404, '分镜网格不存在，请先完成网格拆解。');
    if (grid.included === false) throw new TaskError(409, '该分镜网格未勾选，无法生成视频。');
    const span = Math.max(0, grid.end - grid.start);
    if (span <= 0) throw new TaskError(400, '分镜网格时长无效。');
    if (span > MAX_STORYBOARD_GRID_DURATION + 0.05) throw new TaskError(400, `分镜网格原片时长为 ${span.toFixed(1)} 秒，超过每段 ${MAX_STORYBOARD_GRID_DURATION} 秒限制。`);
    const gridIndex = (p.storyboardGrids || []).findIndex(item => item.id === grid.id);
    if (!input.omni && gridIndex >= 3) throw new TaskError(400, '本地测试仅提供前三个网格的视频。');
    const prompt = input.prompt.trim() || grid.prompt;
    if (!prompt.trim()) throw new TaskError(400, '视频生成描述不能为空。');
    const refUrl = input.referenceImages?.[0] || grid.url;
    if (refUrl !== grid.url && path.basename(refUrl) !== grid.filename) throw new TaskError(400, '参考图必须是该分镜网格原图。');
    Object.assign(input, {
      mode: 'r2v', images: [], unitId: `storyboard-grid-${grid.id}`, prompt,
      referenceImages: [grid.url], storyboardGridId: grid.id,
    });
    video = {
      id: randomUUID(), provider: input.omni ? 'omni-flash' : 'local-test', model: input.omni ? (input.omni.duration === 8 ? 'omni_flash_8s' : 'omni_flash_10s') : 'local-test', mode: 'r2v',
      productionMode: p.productionMode || 'veo-native', imageUrls: [], referenceIds: input.omni?.referenceIds,
      resolution: input.resolution, shotId: grid.id, unitId: input.unitId, sourceShotIds: [grid.id],
      targetStart: grid.start, targetEnd: grid.end, targetDuration: span,
      status: 'running', prompt, defaultPrompt: grid.prompt,
      keyframeUrl: grid.url, storyboardGridId: grid.id, gridId: grid.id,
      duration: REMIX_SECONDS, aspectRatio: input.aspectRatio, startedAt: now,
    };
  } else if (spec.kind === 'generation') {
    const input = generationInput!;
    const unit = buildVeoPlan(p.rewrite!.shots).find(unit => unit.id === input.unitId);
    if (!unit) throw new TaskError(404, '找不到该视频生产单元。');
    if (p.promptFlow !== 'direct-analysis') {
      const shot = p.rewrite!.shots.find(shot => shot.id === unit.sourceShotIds[0])!;
      if (!keyframeCurrent(p, shot) || !shot.sourceShotId) throw new TaskError(409, '请先更新该镜头的复刻关键帧，再进行图生视频。');
      if (!keyframeStorageStatus().configured) throw new TaskError(409, '请先在模型连接设置中连接 Supabase 私有图片存储。');
      if (input.aspectRatio !== p.market.aspectRatio) throw new TaskError(400, '视频画幅应与复刻关键帧一致，请先修改项目画幅并更新关键帧。');
      Object.assign(input, { mode: 'i2v', images: [], keyframeShotId: shot.id });
    }
    const shot = p.rewrite!.shots.find(shot => shot.id === input.keyframeShotId);
    video = { id: randomUUID(), provider: 'veo-3.1', model: VEO_MODELS[input.mode], mode: input.mode,
      productionMode: p.productionMode || 'veo-native', imageUrls: input.mode === 't2v' ? [] : input.images,
      resolution: input.resolution, shotId: unit.sourceShotIds[0] || unit.id, unitId: unit.id, sourceShotIds: unit.sourceShotIds,
      targetStart: unit.start, targetEnd: unit.end, targetDuration: unit.targetDuration, status: 'running', prompt: input.prompt,
      defaultPrompt: buildVeoUnitPrompt(p, unit), providerRequest: requestBody(input, input.prompt),
      keyframeShotId: shot?.id, keyframeFilename: shot?.keyframe?.filename, keyframeBasis: shot?.keyframe?.basis, keyframeUrl: shot?.keyframe?.url,
      duration: VEO_DURATION, aspectRatio: input.aspectRatio, startedAt: now };
  } else if (spec.kind === 'recover' || (spec.kind === 'compose' && spec.videoId)) {
    video = p.generatedVideos.find(video => video.id === spec.videoId);
    if (!video || !videoCurrent(p, video)) throw new TaskError(409, '找不到当前方案的可用源片，请使用当前复刻关键帧重新生成。');
    if (spec.kind === 'recover' && (!video.requestId || video.status !== 'failed')) throw new TaskError(409, '没有可恢复的上游视频任务。');
    if (spec.kind === 'compose' && (p.productionMode !== 'tts-subtitles' || video.productionMode !== 'tts-subtitles' || video.status !== 'completed' || !video.filename)) throw new TaskError(409, '没有可本地配音的已完成画面源片。');
  } else if (spec.kind === 'compose' && !spec.production) sources(p);
  const job: Job = { id: randomUUID(), kind: spec.kind === 'recover' ? 'generation' : spec.kind === 'compose' ? 'composition' : spec.kind,
    status: 'running', progress: 2, message: occupied >= 2 ? '排队中，正在等待空闲处理资源…' : needsAgent ? '正在通过创作 Agent 分析参考视频…' : '正在准备任务…', startedAt: now, videoId: video?.id, unitId: video?.unitId, shotId: spec.kind === 'keyframe' ? spec.shotId : undefined };
  const saved = saveProject({ ...p, job, generatedVideos: spec.kind === 'generation' ? [...p.generatedVideos, ...(groupVideos.length ? groupVideos : [video!])] : spec.kind === 'recover' ? p.generatedVideos.map(item => item.id === video!.id ? { ...item, status: 'running', error: undefined } : item) : p.generatedVideos });
  activeProjects.add(id);
  const progress = (n: number, message: string) => update(id, current => ({ ...current, job: { ...current.job!, progress: n, message } }));
  return (async () => {
    await acquire();
    let message = '制作完成';
    try {
      if (spec.kind === 'keyframe') {
        progress(20, '正在结合原片关键帧与产品图生成此镜头…');
        await renderKeyframe(id, spec.shotId);
        message = '该镜头的复刻关键帧已更新';
      } else if (spec.kind === 'analysis-refine') {
        const pendingIds = saved.analysisReview!.pendingIds;
        await runReferenceAnalysis(saved, {
          kind: 'analysis-refine',
          save: async result => {
            update(id, current => ({ ...current,
              analysisReview: {
                pendingIds: (current.analysisReview?.pendingIds || []).filter(shotId => !pendingIds.includes(shotId)),
                suggestions: { ...current.analysisReview?.suggestions, ...result.suggestions },
                globalFocusSuggestion: result.globalFocusSuggestion || current.analysisReview?.globalFocusSuggestion,
              },
            }));
          },
        });
        message = `已分析 ${pendingIds.length} 个变动镜头，请核对 AI 建议`;
      } else if (spec.kind === 'analysis') {
        const breakdownType = spec.agentAnalysis ? 'storyboard-grid' : saved.breakdownType;
        const saveResult = (result: FullReferenceAnalysis) => saveReferenceAnalysis(saved, result, breakdownType, progress);
        if (spec.agentAnalysis) await saveResult(spec.agentAnalysis);
        else await runReferenceAnalysis(saved, { kind: 'analysis', save: saveResult });
        message = breakdownType === 'storyboard-grid' ? '场景表与分镜网格已完成' : '参考视频拆解与场景表已完成';
      } else if (spec.kind === 'rewrite') {
        const direct = saved.promptFlow === 'direct-analysis';
        const result = direct ? { result: directAnalysisStoryboard(saved), usage: { input: 0, output: 0 } }
          : await rewrite(saved, progress, request => update(id, current => ({ ...current, rewriteRequest: request })));
        update(id, current => ({ ...current, isDemo: false, ttsTimingNotice: undefined, rewrite: result.result, rewriteStale: false,
          generatedVideos: current.generatedVideos.map(video => ({ ...video, stale: true })), composedVideos: current.composedVideos?.map(video => ({ ...video, stale: true })),
          usage: { input: current.usage.input + result.usage.input, output: current.usage.output + result.usage.output } }));
        message = direct ? '原片分析已整理为可编辑的视频 Prompt' : '逐镜头描述与复刻关键帧已完成';
        if (!direct) {
          update(id, current => ({ ...current, workflow: current.workflow && current.workflow.status === 'running' ? { ...current.workflow, stage: 'keyframe' } : current.workflow }));
          const shots = getProject(id)!.rewrite!.shots;
          for (const [index, shot] of shots.entries()) {
            progress(50 + Math.round(index / shots.length * 45), `正在生成复刻关键帧 ${index + 1}/${shots.length}…`);
            try { await renderKeyframe(id, shot.id); }
            catch { message = '逐镜头描述已保存，关键帧生成中断；可在镜头卡中继续生成。'; break; }
          }
        }
      } else if (spec.kind === 'generation' && (generationInput?.storyboardGridId || generationInput?.canvasTestVideo) && !generationInput.omni) {
        const index = generationInput.storyboardGridId
          ? (saved.storyboardGrids || []).findIndex(grid => grid.id === generationInput.storyboardGridId)
          : Math.max(0, saved.generatedVideos.filter(item => item.unitId?.startsWith('canvas-test-')).findIndex(item => item.id === video!.id)) % 3;
        const source = workspacePath('test-videos', `test_video_${index + 1}.mp4`);
        const filename = `local-test-${video!.id}.mp4`;
        progress(20, `正在准备本地测试视频 ${index + 1}…`);
        try { await fs.copyFile(source, workspaceUploadPath(filename)); }
        catch { throw new Error(`找不到本地测试视频 ${source}，请确认文件存在。`); }
        const metadata = await inspectMedia(filename, 'video');
        await saveSource(id, video!.id, { ...metadata, filename, url: `/media/${filename}`, size: (await fs.stat(workspaceUploadPath(filename))).size }, progress);
        message = `本地测试视频 ${index + 1} 已就绪`;
      } else if (spec.kind === 'generation' || spec.kind === 'recover') {
        if (spec.kind === 'generation' && generationInput?.referenceImages && (generationInput.tierShotId || generationInput.tierShotIds?.length || generationInput.storyboardGridId || generationInput.omni)) {
          progress(8, generationInput.storyboardGridId ? '正在发布分镜网格参考图…' : '正在发布已确认的参考图…');
          const imageUrls: string[] = [];
          for (const [index, url] of generationInput.referenceImages.entries()) {
            const filename = path.basename(url);
            const mime = generationInput.omni?.referenceMimes?.[index] || (/\.jpe?g$/.test(filename) ? 'image/jpeg' : filename.endsWith('.webp') ? 'image/webp' : 'image/png');
            imageUrls.push(await publishReferenceImage(saved.id, filename, mime, true));
          }
          generationInput.images = imageUrls;
          update(id, current => ({ ...current, generatedVideos: current.generatedVideos.map(item => item.id === video!.id || (!!video!.tierGroupId && item.tierGroupId === video!.tierGroupId)
            ? { ...item, imageUrls, providerRequest: generationInput!.omni?.source ? item.providerRequest : (generationInput!.storyboardGridId || generationInput!.omni)
              ? omniRequestBody(generationInput!.prompt, { resolution: generationInput!.resolution === '1080p' ? '1080p' : '720p', aspectRatio: generationInput!.aspectRatio, ...generationInput!.omni }, imageUrls)
              : requestBody(generationInput!, generationInput!.prompt) } : item) }));
        } else if (spec.kind === 'generation' && generationInput?.tierShotIds?.length) {
          progress(8, '正在发布多镜头关键帧并准备分镜…');
          const imageUrls: string[] = [];
          for (const shot of saved.analysis!.shots.filter(item => generationInput!.tierShotIds!.includes(item.id))) {
            const frames = saved.replication?.shots?.[shot.id]?.newFrames!;
            const filename = frames.first!.filename;
            const mime = /\.jpe?g$/i.test(filename) ? 'image/jpeg' : /\.webp$/i.test(filename) ? 'image/webp' : 'image/png';
            imageUrls.push(await publishReferenceImage(saved.id, filename, mime, true));
          }
          generationInput.images = imageUrls;
          update(id, current => ({ ...current, generatedVideos: current.generatedVideos.map(item => item.tierGroupId === video!.tierGroupId
            ? { ...item, imageUrls, providerRequest: requestBody(generationInput!, generationInput!.prompt) } : item) }));
        } else if (spec.kind === 'generation' && generationInput?.tierShotId) {
          progress(8, '正在上传新首帧和新尾帧并生成临时链接…');
          const imageUrls: string[] = [];
          for (const filename of [video!.tierFirst!, video!.tierLast!]) {
            const mime = /\.jpe?g$/i.test(filename) ? 'image/jpeg' : /\.webp$/i.test(filename) ? 'image/webp' : 'image/png';
            imageUrls.push(await publishReferenceImage(saved.id, filename, mime, true));
          }
          generationInput.images = imageUrls;
          update(id, current => ({ ...current, generatedVideos: current.generatedVideos.map(item => item.id === video!.id
            ? { ...item, imageUrls, providerRequest: requestBody(generationInput!, generationInput!.prompt) } : item) }));
        } else if (spec.kind === 'generation' && generationInput?.keyframeShotId) {
          progress(8, '正在上传此镜头关键帧并生成临时链接…');
          const shot = saved.rewrite!.shots.find(shot => shot.id === generationInput!.keyframeShotId)!;
          const imageUrl = await publishKeyframe(saved, shot);
          generationInput.images = [imageUrl];
          update(id, current => ({ ...current, generatedVideos: current.generatedVideos.map(item => item.id === video!.id
            ? { ...item, imageUrls: [imageUrl], providerRequest: requestBody(generationInput!, generationInput!.prompt) } : item) }));
        }
        if (spec.kind === 'generation') update(id, current => ({ ...current, workflow: current.workflow && ['running', 'pausing'].includes(current.workflow.status) ? { ...current.workflow, newClipCount: current.workflow.newClipCount + 1 } : current.workflow }));
        const rememberRequest = (requestId: string) => {
          update(id, current => ({ ...current, generatedVideos: current.generatedVideos.map(item => item.id === video!.id || (!!video!.tierGroupId && item.tierGroupId === video!.tierGroupId) ? { ...item, requestId } : item) }));
        };
        const editSource = generationInput?.omni?.source;
        let sourceVideoUrl: string | undefined;
        if (editSource) {
          const filename = `video-edit-source-${video!.id}.mp4`;
          progress(10, '正在裁取并发布选定的待编辑视频区间…');
          try {
            await prepareVideoEditSource(editSource.filename, editSource.start, editSource.end, filename);
            sourceVideoUrl = await publishReferenceVideo(saved.id, filename);
          } finally { await fs.rm(workspaceUploadPath(filename), { force: true }).catch(() => {}); }
        }
        const remote = spec.kind === 'recover'
          ? video!.provider === 'omni-flash' ? { id: video!.requestId!, url: await waitOmni(video!.requestId!, progress) } : await resumeVideo(video!.requestId!, progress)
          : generationInput!.omni || generationInput!.storyboardGridId
            ? await generateOmniVideo(generationInput!.prompt, { resolution: generationInput!.resolution === '1080p' ? '1080p' : '720p', aspectRatio: generationInput!.aspectRatio, ...generationInput!.omni, sourceVideoUrl }, generationInput!.images, progress, rememberRequest)
            : await generateVideo(generationInput!, generationInput!.prompt, progress, rememberRequest);
        const local = await saveGeneratedVideo(remote.url, video!.id, progress, { prefix: video!.provider === 'omni-flash' ? 'omni' : generationInput?.tierShotIds?.length ? 'tier-group-source' : 'veo', requestId: remote.id });
        if (spec.kind === 'generation' && generationInput?.tierShotIds?.length) {
          progress(84, '正在按镜头顺序切分生成结果…');
          const rows = saved.analysis!.shots.filter(shot => generationInput!.tierShotIds!.includes(shot.id));
          const total = rows.reduce((sum, shot) => sum + shot.end - shot.start, 0);
          const clips = await sliceGeneratedVideo(local.filename!, rows.map((shot, index) => ({
            start: VEO_DURATION * rows.slice(0, index).reduce((sum, row) => sum + row.end - row.start, 0) / total,
            duration: VEO_DURATION * (shot.end - shot.start) / total,
          })));
          update(id, current => ({ ...current, generatedVideos: current.generatedVideos.map(item => {
            const index = groupVideos.findIndex(group => group.id === item.id);
            return index >= 0 ? { ...item, ...clips[index], requestId: remote.id, status: 'completed', finishedAt: new Date().toISOString(), stale: false } : item;
          }) }));
        } else await saveSource(id, video!.id, local, progress);
        message = saved.productionMode === 'tts-subtitles' && !video!.storyboardGridId && !video!.gridId && !video!.unitId?.startsWith('agent-video-') ? '画面、配音与字幕已完成' : `${video!.provider === 'omni-flash' ? 'Omni Flash' : 'Veo'} 视频片段已保存到本机`;
      } else if (spec.kind === 'compose' && spec.production) {
        const { clips, width, height } = spec.production;
        const rendered = await composeProductionVideo(clips, width, height, progress);
        update(id, current => ({ ...current, composedVideos: [...(current.composedVideos || []), rendered] }));
        message = '选定片段已拼接成片';
      } else {
        let current = getProject(id)!;
        if (!spec.videoId && current.productionMode === 'tts-subtitles') {
          for (const source of sources(current)) {
            const requestedVoice = spec.voice ?? current.ttsVoice;
            if (current.composedVideos?.some(rendered => !rendered.stale && rendered.renderTrace?.timingVersion === 'continuous-v1' && rendered.unitId === source.unitId && rendered.sourceVideoIds[0] === source.id && (!requestedVoice || rendered.voice === requestedVoice))) continue;
            const unit = await composeUnitVideo(current, source, spec.voice ?? current.ttsVoice ?? '', progress);
            current = update(id, project => ({ ...project, composedVideos: [...(project.composedVideos || []), unit] }));
          }
        }
        const rendered = spec.videoId ? await composeUnitVideo(current, video!, spec.voice ?? current.ttsVoice ?? '', progress) :
          current.productionMode === 'tts-subtitles' ? await composeVideo(current, sources(current), spec.voice ?? current.ttsVoice ?? '', progress, spec.timingApproval) : await composeNativeVideo(current, sources(current), progress);
        update(id, p => ({ ...p, composedVideos: [...(p.composedVideos || []), rendered] }));
        message = spec.videoId ? '本地配音与字幕片段已完成' : '最终视频已完成';
      }
      update(id, current => {
        const completed: Job = { ...current.job!, status: 'completed', progress: 100, message, finishedAt: new Date().toISOString() };
        const finished = !!finalVideo(current);
        return { ...current, job: completed, ttsTimingNotice: finished ? undefined : current.ttsTimingNotice,
          workflow: finished && spec.kind === 'compose' && !spec.videoId && current.workflowMode === 'automatic' && current.workflow && !['running', 'pausing'].includes(current.workflow.status) ?
            { ...current.workflow, status: 'completed', stage: 'completed', message: '视频制作完成，可以预览和下载。', finishedAt: completed.finishedAt } : current.workflow,
          jobHistory: [...(current.jobHistory || []), completed].slice(-200) };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务未完成，请重试。';
      update(id, current => {
        const failed: Job = { ...current.job!, kind: error instanceof TimingConfirmationRequired ? 'composition' : current.job!.kind,
          status: error instanceof TimingConfirmationRequired ? 'needs-input' : 'failed', message, finishedAt: new Date().toISOString() };
        return { ...current, job: failed, ttsTimingNotice: error instanceof TimingConfirmationRequired ? error.notice : current.ttsTimingNotice,
          jobHistory: [...(current.jobHistory || []), failed].slice(-200),
          generatedVideos: current.generatedVideos.map(item => (item.id === video?.id || (!!video?.tierGroupId && item.tierGroupId === video.tierGroupId)) && item.status !== 'completed' ? { ...item, status: 'failed', error: message, finishedAt: failed.finishedAt } : item) };
      });
      throw error;
    } finally { activeProjects.delete(id); release(); }
  })();
}
