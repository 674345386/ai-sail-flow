import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import multer from 'multer';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { defaultWorkspace, validateTimeline, type Project, type Asset } from '../shared/domain';
import { sentAgentAttachmentIds } from '../shared/agent-message';
import { completeReferenceSceneTable, referenceFramesInput, referenceFramesPath, referenceFrameWindowSeconds, referenceSceneRanges, referenceSceneTableTitle, saveReferenceAnalysisInput } from '../shared/agent-video-analysis';
import { H3_MAX_SECONDS, H3_MIN_SECONDS, OMNI_FLASH_12, OMNI_FLASH_12_SECONDS, productionCompositionInput, productionStoryboardInput, productionVideoInput, videoProductionInput } from '../shared/video-production';
import { ffmpegSkillInput } from '../shared/ffmpeg-skill';
import { aiFocusPoints } from '../shared/focus';
import { createSessionVerifier } from './session-verifier';
import { setShotMediaCacheHeaders } from './media-cache';
import { GET as getIntelligentWiki } from './intelligent-ui/wiki';
import { GET as getIntelligentImages } from './intelligent-ui/image-search';
import { GET as getIntelligentStreetRoute } from './intelligent-ui/street-route';
import { IMAGE_RATIO_PATTERN, IMAGE_SIZE_PATTERN, IMAGE_RATIO_SIZES, IMAGE_SIZE_LIMITS, IMAGE_QUALITIES, imageRequestSize } from '../shared/image-generation-options';
import { isAgentAdaptation } from '../shared/agent-adaptation';
import { isAgentPresentation } from '../shared/agent-presentation';
import { minimaxVideoRecoverable } from '../shared/minimax-video';
import { applyExperimentOperation, emptyExperiment, experimentAgentContext, experimentOperation, ExperimentError } from '../shared/experiment';
import { assertExperimentRouteExecution, ExperimentPlanningError } from '../shared/experiment-planning';
import { prepareExperimentProposal } from './experiment-planner';
import { importExperimentSkillInput, bindExperimentInput, readGitHubSkill, attachExperimentSkill, bindExperimentSource, experimentSources, syncExperimentSources } from './experiment-workbench';
import { skillSelectionSchema } from '../shared/skill-assets';
import { createLandingPageStore, registerLandingPageReadRoutes, registerLandingPageWriteRoutes, registerLandingPlaygroundRoutes } from './landing-editor';
import { registerLocalDefaultsRoutes } from './local-defaults';
import { agentThemeDefaultsSchema } from '../shared/agent-theme';
import { currentWeatherInput, getCurrentWeather } from './current-weather';
import { summarizeAgentActivity, type AgentActivities } from '../shared/agent-activity';
import type { WorkspaceUpdate } from '../shared/workspace-updates';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
// NODE_USE_ENV_PROXY is read at process startup, before .env is loaded. Reapply
// proxy configuration now so services started outside a proxy-enabled shell use it too.
if (process.env.NODE_USE_ENV_PROXY === '1') {
  const setProxy = (http as typeof http & { setGlobalProxyFromEnv?: (env: NodeJS.ProcessEnv) => () => void }).setGlobalProxyFromEnv;
  setProxy?.(process.env);
}
// Load storage after .env so an optional data-directory override takes effect.
const { createProject, getProject, listProjects, listProjectIds, saveProject, subscribeProject, defaultProjectId, createWorkspaceProject, getWorkspaceProject, listWorkspaceProjects, saveWorkspaceProject } = await import('./store');
const { workspaceUploadDir, workspaceUploadPath, workspaceAccountId, withWorkspaceAccount, isWorkspaceAccountId, workspaceAccounts, accountWorkspacesEnabled } = await import('./workspace-storage');
const { workspaceUploader } = await import('./workspace-upload');
const { generateLlm, llmStatus } = await import('./llm');
const { GptError } = await import('./gpt');
const { imageGenerationStatus, configureImageGeneration, generateImage, IMAGE_MODELS } = await import('./image-generation');
const { generationTasks, generationTaskList } = await import('./generation-tasks');
const { configureOmniKey, omniConfigured } = await import('./omni');
const { minimaxVideoStatus, startMinimaxVideo, recoverMinimaxVideo, getMinimaxVideoDetails, startMinimaxReconciler } = await import('./minimax-video');
const { MinimaxError } = await import('./minimax-h3');
const { launchTask, TaskError } = await import('./tasks');
const { ffmpegSkillAvailable, ffmpegSkillSource, renderFFmpegSkill } = await import('./ffmpeg-skill');
const { composeSelectedVideo, productionImages, productionSceneImage, productionScopeImages, saveVideoProductionPlan, startProductionVideo } = await import('./video-production');
const { buildProductionStoryboard } = await import('./storyboard-grid');
const { agentProvider, creativeAgentEnabled: agentEnabled } = await import('./agent-provider');
const { agentCapabilities, activeReferenceVideoWorkflow, getAgentState, getAgentActivity, getAgentImageReferences, subscribeAgent, subscribeAgentActivity, startAgentTurn, steerAgentTurn, queueAgentMessage, removeQueuedAgentMessage, editQueuedAgentMessage, steerQueuedAgentMessage, resumeAgentQueue, AgentTurnConflictError, interruptAgentTurn, setAgentModel, setAgentAdaptation, setAgentPresentation, listAgentModels, noteAgentVideoChanged, showAgentCanvasComponent, showAgentIntelligentUI, updateAgentCanvasComponent, closeAgentCanvasComponent, setAgentExperiment, mutateAgentExperiment } = await import('./creative-agent');
const { programmaticEnabled, experimentWorkspace, publishExperimentFile, publishExperimentFileInput } = await import('./experiment-runtime');
const { registerSkillInternalRoutes, registerSkillExperimentRoutes, registerSkillAssetRoutes, applyInitialSkills, prepareSkillSelections, verifySkillAsset } = await import('./skill-asset-routes');
const { officialJobFor, getSkillAsset, visibleSkillMedia } = await import('./skill-assets');
const { discoverExperimentMethods, readExperimentMethod, methodSearchInput, methodReadInput } = await import('./experiment-methods');
const { renderAnimaticPreview, animaticInputSchema } = await import('./animatic');
const { extractArtifactQualityFrames, inspectQualityInputSchema } = await import('./video-qc');
const { getCapabilityRegistry } = await import('./capability-registry');
const { canvasComponentInput } = await import('../shared/agent-canvas-ui');
const { inspectMedia, ensureMediaThumbnail, extractReferenceSheets, extractReferenceDetails, referenceSheetColumns, maxReferenceFrames, measureReferenceAudio } = await import('./media');
const { collectUploadedAsset, listLibraryMedia, libraryPage, librarySelection, localLibraryItem, getLibraryMedia, libraryMime, initializeMediaLibrary } = await import('./media-library');
const { startMediaSync, queueMediaSync, resumeMediaBackups, mediaSyncStatus, mediaBackupState, cloudCatalogStatus, ensureCloudCatalog, cloudMediaUrl, deleteMediaLibraryItems } = await import('./media-library-sync');
if (accountWorkspacesEnabled) {
  for (const id of workspaceAccounts()) await withWorkspaceAccount(id, initializeMediaLibrary);
  if (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    for (const id of workspaceAccounts()) setImmediate(() => withWorkspaceAccount(id, () => resumeMediaBackups('')));
  }
} else await initializeMediaLibrary();
const { configureKeyframeStorage, keyframeStorageStatus } = await import('./keyframe-storage');
const port = Number(process.env.SOP_PORT || 4317);
const app = express();
const skillAgentAccess = { getAgentState, setAgentExperiment, startAgentTurn, interruptAgentTurn, subscribeAgent };
app.disable('x-powered-by');
const publicAuthEnabled = accountWorkspacesEnabled;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const allowedHosts = new Set((process.env.SOP_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
if (publicAuthEnabled && (!supabaseUrl || !supabasePublishableKey || !allowedHosts.size)) {
  throw new Error('公网模式需配置 Supabase URL、Publishable Key 和 SOP_ALLOWED_HOSTS。');
}
const authClient = publicAuthEnabled ? createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const verifiedSessions = createSessionVerifier(async (token): Promise<string | false> => {
  if (!authClient) return false;
  const { data, error } = await authClient.auth.getUser(token);
  return !error && isWorkspaceAccountId(data.user?.id) ? data.user.id : false;
});
const mediaCookie = 'sop_media_session';
function bearerToken(req: Request) {
  const header = req.headers.authorization || '';
  return /^Bearer\s+(.+)$/i.exec(header)?.[1] || '';
}
function cookieToken(req: Request) {
  const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${mediaCookie}=`))?.slice(mediaCookie.length + 1);
  if (!value) return '';
  try { return decodeURIComponent(value); } catch { return ''; }
}
function sessionCookieHeader(token: string, maxAgeSeconds: number) {
  return `${mediaCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, maxAgeSeconds)}`;
}
function loopbackAddress(value: string | undefined) {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}
app.use((req, res, next) => {
  const hostname = req.hostname.toLowerCase();
  if (!publicAuthEnabled && !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) return res.status(403).json({ error: '此工作台仅接受本机访问。' });
  const internalTool = hostname === '127.0.0.1' && loopbackAddress(req.socket.remoteAddress)
    && req.path.startsWith('/api/agent-internal/');
  if (publicAuthEnabled && !allowedHosts.has(hostname) && !internalTool) return res.status(400).json({ error: '访问域名未加入服务白名单。' });
  const protectedResource = req.path.startsWith('/api') || req.path.startsWith('/media');
  // OAuth returns from the provider as a cross-site document navigation.
  // Only serve the callback page here; the browser SDK still verifies PKCE.
  const authCallbackNavigation = req.method === 'GET' && req.path === '/auth/callback'
    && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
  const origin = req.headers.origin;
  if (origin && (!publicAuthEnabled || protectedResource) && !authCallbackNavigation) {
    let allowedOrigin = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
    if (publicAuthEnabled) {
      try { allowedOrigin = new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase() && allowedHosts.has(new URL(origin).hostname.toLowerCase()); } catch { allowedOrigin = false; }
    }
    if (!allowedOrigin) return res.status(403).json({ error: '请求来源不被允许。' });
  }
  if (req.headers['sec-fetch-site'] === 'cross-site' && (!publicAuthEnabled || protectedResource) && !authCallbackNavigation) return res.status(403).json({ error: '不接受跨站请求。' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.path.startsWith('/api') || req.path === '/auth/callback') res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '3mb' }));
const landingPageStore = createLandingPageStore(path.resolve(process.env.SOP_DATA_DIR || path.join(root, 'data')));
registerLandingPageReadRoutes(app, landingPageStore);
const canSaveLocalDefaults = (req: Request) => !publicAuthEnabled && loopbackAddress(req.socket.remoteAddress);
registerLandingPlaygroundRoutes(app, path.join(root, 'shared/landing-playground-defaults.json'), canSaveLocalDefaults);
registerLocalDefaultsRoutes(app, '/api/agent-theme/defaults', path.join(root, 'shared/agent-theme-defaults.json'), agentThemeDefaultsSchema, canSaveLocalDefaults);
function intelligentDataRoute(handler: (request: globalThis.Request) => Promise<globalThis.Response>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handler(new globalThis.Request(new URL(req.originalUrl, `http://127.0.0.1:${port}`)));
      res.status(result.status);
      for (const header of ['Content-Type', 'Cache-Control']) { const value = result.headers.get(header); if (value) res.setHeader(header, value); }
      res.send(await result.text());
    } catch (error) { next(error); }
  };
}
app.get('/api/wiki', intelligentDataRoute(getIntelligentWiki));
app.get('/api/image-search', intelligentDataRoute(getIntelligentImages));
app.get('/api/street-route', intelligentDataRoute(getIntelligentStreetRoute));
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function record(req: Request): Project {
  const project = getProject(String(req.params.id));
  if (!project) throw new HttpError(404, '找不到这个创意。');
  return project;
}
const uploadsInProgress = new Set<string>();
function editable(project: Project) {
  if (project.job?.status === 'running' || uploadsInProgress.has(project.id)) throw new HttpError(409, '当前任务正在处理，请等待完成。');
}
// The MCP child can only reach its own creative through this loopback-only capability.
app.use('/api/agent-internal/:id', (req, res, next) => {
  const capability = agentCapabilities.verify(String(req.params.id), req.get('X-SOP-Agent-Token'));
  if (!loopbackAddress(req.socket.remoteAddress) || !capability || (publicAuthEnabled && !capability.accountId)) return res.sendStatus(403);
  return capability.accountId ? withWorkspaceAccount(capability.accountId, next) : next();
});
registerSkillInternalRoutes(app, skillAgentAccess);
app.post('/api/agent-internal/:id/weather', async (req, res) => {
  record(req);
  const input = currentWeatherInput.parse(req.body);
  try { res.json(await getCurrentWeather(input)); }
  catch { throw new HttpError(502, '暂时无法取得该地点的气象数据。'); }
});
function referenceVideoInfo(video: Asset) {
  const { id, name, duration, width, height, hasAudio, size, averageFrameRate, frameCount, videoCodec } = video;
  return { id, name, duration, width, height, hasAudio, size, averageFrameRate, frameCount, videoCodec };
}
app.get('/api/agent-internal/:id', (req, res) => {
  const p = record(req);
  const video = p.assets.find(asset => asset.kind === 'video');
  const referenceVideoWorkflow = activeReferenceVideoWorkflow(p.id);
  const canRunProgrammatically = !referenceVideoWorkflow && programmaticEnabled();
  res.json({ id: p.id, title: p.title, revision: p.revision, video: video ? referenceVideoInfo(video) : null,
    imageGenerationConfigured: imageGenerationStatus().configured,
    imageGeneration: { model: imageGenerationStatus().model, ratioSizeConversions: IMAGE_RATIO_SIZES, sizeLimits: IMAGE_SIZE_LIMITS, defaultSize: 'auto', defaultQuality: 'auto', sizeSupport: 'OpenAI supports custom dimensions within sizeLimits. Third-party gateway errors are returned without substitution.' },
    videoGeneration: { configured: omniConfigured(), referenceStorageConfigured: keyframeStorageStatus().configured, models: [OMNI_FLASH_12, 'omni_flash_8s', 'omni_flash_10s'], supportedAspectRatios: ['16:9', '9:16'], defaultAspectRatio: p.market.aspectRatio === '16:9' ? '16:9' : '9:16', supportedDurations: OMNI_FLASH_12_SECONDS, defaultResolution: '720p' },
    productionVideoRouting: { default: 'h3', editingModel: OMNI_FLASH_12, minimumEditSeconds: H3_MIN_SECONDS, h3Durations: [H3_MIN_SECONDS, H3_MAX_SECONDS], h3Resolutions: ['480p', '720p'], maxSceneOrStoryboardSeconds: 10 },
    minimaxVideoGeneration: { ...minimaxVideoStatus(), defaultAspectRatio: ['16:9', '9:16', '1:1'].includes(p.market.aspectRatio) ? p.market.aspectRatio : '9:16' },
    canvasComponents: getAgentState(p.id).canvasComponents || [],
    experiment: experimentAgentContext(getAgentState(p.id).experiment || emptyExperiment()),
    referenceVideoWorkflow,
    programmatic: { enabled: canRunProgrammatically, workspace: canRunProgrammatically ? experimentWorkspace(p.id) : undefined, publishTool: 'publish_experiment_file' },
    ffmpegSkill: { available: ffmpegSkillAvailable(), operations: ffmpegSkillInput.options.map(option => option.shape.operation.value) },
    intelligentPanel: getAgentState(p.id).intelligentPanel && { id: getAgentState(p.id).intelligentPanel!.id, title: getAgentState(p.id).intelligentPanel!.title },
    audioReferences: p.assets.filter(asset => asset.kind === 'audio').map(asset => ({ id: asset.id, name: asset.name, url: asset.url, mime: asset.mime, duration: asset.duration,
      localPath: getAgentState(p.id).messages.flatMap(message => message.audios || []).find(audio => audio.id === asset.id)?.localPath })),
    imageReferences: [
      ...p.assets.filter(asset => asset.kind === 'product' && /^image\/(png|jpeg|webp)$/.test(asset.mime)).map(asset => ({ id: asset.id, name: asset.name })),
      ...getAgentImageReferences(p.id).filter(image => !p.assets.some(asset => asset.id === image.id)).map(image => ({ id: image.id, name: image.name })),
      ...(p.agentImages || []).filter(image => image.status === 'completed').map(image => ({ id: image.id, name: image.prompt.slice(0, 60) })),
      ...(p.storyboardGrids || []).map(grid => ({ id: grid.id, name: `${grid.start}–${grid.end} 秒连续分镜` })),
      ...(p.productionStoryboards || []).map(grid => ({ id: grid.id, name: `${grid.start}–${grid.end} 秒制作故事板` })),
      ...productionScopeImages(p).map(({ id, name }) => ({ id, name })),
    ],
    images: (p.agentImages || []).map(image => ({ id: image.id, prompt: image.prompt, aspectRatio: image.aspectRatio, size: image.size, quality: image.quality, width: image.width, height: image.height, warning: image.warning, referenceIds: image.referenceIds, productionSceneIndex: image.productionSceneIndex, status: image.status, url: image.url, model: image.model, error: image.error })),
    breakdownType: p.breakdownType, analysis: p.analysis && { summary: p.analysis.summary, duration: p.analysis.duration, shots: p.analysis.shots.map(({ id, start, end, visual, action, camera, transition }) => ({ id, start, end, visual, action, camera, transition })) },
    referenceSceneTable: p.referenceSceneTable && { title: referenceSceneTableTitle, ...p.referenceSceneTable },
    replicationLevel: p.replication?.level,
    videoProductionPlan: p.videoProductionPlan,
    referenceVideoAnalysis: { transport: 'agent-frames', model: getAgentState(p.id).model || agentProvider.model },
    grids: [...p.storyboardGrids || [], ...p.productionStoryboards || []].map(grid => ({ id: grid.id, start: grid.start, end: grid.end, gridSize: grid.gridSize, prompt: grid.prompt, included: grid.included !== false, production: p.productionStoryboards?.some(item => item.id === grid.id) ?? false })),
    composedVideos: p.composedVideos || [],
    job: p.job && { id: p.job.id, kind: p.job.kind, status: p.job.status, progress: p.job.progress, message: p.job.message },
    videos: p.generatedVideos.map(video => ({ id: video.id, provider: video.provider, gridId: video.storyboardGridId, prompt: video.prompt, model: video.model, resolution: video.resolution, aspectRatio: video.aspectRatio, duration: video.duration, targetDuration: video.targetDuration, editSource: video.editSource, referenceIds: video.referenceIds, firstLastFrame: video.model === 'h3-video-frames' || video.providerRequest?.first_last_frame || false, requestId: video.requestId, upstreamStatus: video.minimax?.upstreamStatus, recoverable: video.provider === 'minimax-h3' ? minimaxVideoRecoverable(video) : video.status === 'failed' && Boolean(video.requestId), recoveryPending: video.minimax?.recoveryPending, status: video.status, url: video.url, error: video.error })),
  });
});
function registerExperimentRoutes(prefix: string) {
  registerSkillExperimentRoutes(app, prefix, skillAgentAccess);
  const writable = (req: Request) => { const p = record(req); if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。'); return p; };
  app.post(`${prefix}/experiment/methods/search`, async (req, res, next) => {
    try { const p = record(req); res.json(await discoverExperimentMethods(getAgentState(p.id).experiment || emptyExperiment(), methodSearchInput.parse(req.body))); } catch (error) { next(error); }
  });
  app.post(`${prefix}/experiment/methods/read`, async (req, res, next) => {
    try { record(req); res.json(await readExperimentMethod(methodReadInput.parse(req.body))); } catch (error) { next(error); }
  });
  app.get(`${prefix}/experiment`, (req, res) => { const p = record(req), graph = getAgentState(p.id).experiment || emptyExperiment(); res.json({ graph, sources: experimentSources(p, graph.files) }); });
  app.get(`${prefix}/experiment/nodes/:nodeId`, (req, res) => {
    const p = record(req), graph = getAgentState(p.id).experiment, node = graph?.nodes.find(n => n.id === req.params.nodeId);
    if (!node) throw new HttpError(404, '找不到这个实验台节点。');
    res.json({ ...node, plan: graph?.plans?.find(plan => plan.id === node.planId), run: graph?.runs?.find(run => run.id === node.runId), ...(node.kind === 'step' ? { executions: graph?.runs?.filter(run => run.stepId === node.id).slice(-10).map(({ method, ...run }) => ({ ...run, methodId: method.id, methodTitle: method.title })) } : {}) });
  });
  app.post(`${prefix}/experiment`, (req, res) => {
    const p = writable(req), { expectedRevision, ...input } = req.body || {};
    const graph = getAgentState(p.id).experiment || emptyExperiment();
    if (expectedRevision !== undefined && expectedRevision !== graph.revision) throw new HttpError(409, '实验台已被 Agent 或其他窗口更新，请重新查看后再保存。');
    let operation = experimentOperation.parse(input);
    const internal = prefix.startsWith('/api/agent-internal/');
    if (internal && operation.op === 'policy') throw new HttpError(403, '实验设置由用户在空间中调整。');
    if (internal && operation.op === 'select-routes') {
      const { proposalId } = operation;
      if (graph.proposals?.find(proposal => proposal.id === proposalId)?.policy.decision !== 'auto') throw new HttpError(403, '请等待用户在实验台选择路线。');
    }
    if (!internal && ['policy', 'select-routes'].includes(operation.op) && getAgentState(p.id).status === 'running') throw new HttpError(409, 'Agent 正在执行，请结束后再调整实验设置或路线。');
    if (operation.op === 'propose-routes' || operation.op === 'select-routes') {
      const references = new Set([
        ...p.assets.filter(asset => asset.kind === 'product' && /^image\//.test(asset.mime)).map(asset => asset.id),
        ...getAgentImageReferences(p.id).map(image => image.id),
        ...(p.agentImages || []).filter(image => image.status === 'completed').map(image => image.id),
        ...(p.storyboardGrids || []).map(grid => grid.id),
        ...(p.productionStoryboards || []).map(grid => grid.id),
        ...productionScopeImages(p).map(image => image.id),
        ...p.assets.filter(asset => asset.kind === 'video').map(asset => asset.id),
      ]);
      const capabilities = { programmatic: programmaticEnabled(), ffmpegSkill: ffmpegSkillAvailable(), image: imageGenerationStatus().configured, omni: omniConfigured(), minimax: minimaxVideoStatus().configured, referenceStorage: keyframeStorageStatus().configured,
        videoDurations: Object.fromEntries(p.assets.filter(asset => asset.kind === 'video' && asset.duration).map(asset => [asset.id, asset.duration!])) };
      if (operation.op === 'propose-routes') operation = prepareExperimentProposal(operation, graph, capabilities, references);
      else {
        const { proposalId, routeIds } = operation;
        const proposal = graph.proposals?.find(item => item.id === proposalId);
        if (!proposal) throw new HttpError(404, '找不到这份路线提案，请刷新后重试。');
        const checked = prepareExperimentProposal({ op: 'propose-routes', brief: proposal.brief, families: proposal.families, routes: proposal.routes.filter(route => routeIds.includes(route.id)) }, graph, capabilities, references);
        const blocked = checked.routes.find(route => route.readiness !== 'ready');
        if (blocked) throw new HttpError(409, `「${blocked.title}」的条件已变化：${blocked.readinessReason}`);
      }
    }
    if (operation.op === 'propose-routes' || operation.op === 'select-routes') {
      let updated = applyExperimentOperation(graph, operation, randomUUID);
      const sources = [...experimentSources(p, updated.files), ...getAgentImageReferences(p.id).map(image => ({ id: image.id, title: image.name, url: image.url, mediaType: 'image' as const, status: 'completed' as const }))];
      updated = { ...updated, nodes: updated.nodes.map(node => {
        if (!node.sourceId || graph.nodes.some(old => old.id === node.id)) return node;
        const source = sources.find(item => item.id === node.sourceId);
        return source ? { ...node, title: source.title.slice(0, 120), url: source.url, mediaType: source.mediaType, status: source.status } : node;
      }) };
      return res.json(setAgentExperiment(p.id, syncExperimentSources(updated, p)!));
    }
    res.json(mutateAgentExperiment(p.id, operation));
  });
  app.post(`${prefix}/experiment/skill`, async (req, res, next) => {
    try {
      const p = writable(req), input = importExperimentSkillInput.parse(req.body);
      const result = await readGitHubSkill(input);
      if (result.choices) return res.json(result);
      // Re-read after network I/O so an Agent update is never overwritten.
      res.json({ graph: setAgentExperiment(p.id, attachExperimentSkill(getAgentState(p.id).experiment, result.skill!, input)) });
    } catch (error) { next(error); }
  });
  app.post(`${prefix}/experiment/bind`, (req, res) => {
    const p = writable(req);
    res.json(setAgentExperiment(p.id, bindExperimentSource(getAgentState(p.id).experiment, p, bindExperimentInput.parse(req.body))));
  });
  app.post(`${prefix}/experiment/file`, async (req, res, next) => {
    try {
      const p = writable(req), graph = getAgentState(p.id).experiment;
      if (prefix.startsWith('/api/agent-internal/') && activeReferenceVideoWorkflow(p.id)) throw new HttpError(409, '本轮参考视频分析与方案使用原生创作工具。');
      const result = await publishExperimentFile(graph, p, publishExperimentFileInput.parse(req.body));
      // Publication must not overwrite a graph edited during media inspection.
      if (getAgentState(p.id).experiment !== graph) {
        const latest = getAgentState(p.id).experiment || emptyExperiment();
        const updated = bindExperimentSource({ ...latest, files: [...(latest.files || []), result.file] }, p, { stepId: req.body.stepId, sourceId: result.file.id, runId: req.body.runId, title: req.body.title });
        setAgentExperiment(p.id, updated);
      } else setAgentExperiment(p.id, result.graph);
      res.json({ file: result.file, graph: getAgentState(p.id).experiment });
    } catch (error) { next(error); }
  });
  app.post(`${prefix}/experiment/animatic`, async (req, res, next) => {
    try {
      const p = writable(req);
      const result = await renderAnimaticPreview(getAgentState(p.id).experiment, p, animaticInputSchema.parse(req.body));
      setAgentExperiment(p.id, result.graph);
      res.status(201).json({ file: result.file, duration: result.duration, frameCount: result.frameCount, graph: getAgentState(p.id).experiment });
    } catch (error) { next(error); }
  });
  app.post(`${prefix}/experiment/qc-frames`, async (req, res, next) => {
    try {
      const p = record(req);
      res.json(await extractArtifactQualityFrames(getAgentState(p.id).experiment, p, inspectQualityInputSchema.parse(req.body)));
    } catch (error) { next(error); }
  });
}
registerExperimentRoutes('/api/agent-internal/:id');
app.post('/api/agent-internal/:id/canvas-components', (req, res) => {
  const p = record(req);
  const input = canvasComponentInput.parse(req.body);
  if (input.kind === 'storyboard' && input.selectedGridIds.some(id => ![...p.storyboardGrids || [], ...p.productionStoryboards || []].some(grid => grid.id === id))) throw new HttpError(400, '分镜 ID 不属于当前创意。');
  res.json(showAgentCanvasComponent(p.id, input));
});
app.post('/api/agent-internal/:id/intelligent-ui', (req, res) => {
  const p = record(req);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const { title, source } = z.object({ title: z.string().trim().min(1).max(100), source: z.string().min(1).max(120000) }).parse(req.body);
  res.json(showAgentIntelligentUI(p.id, title, source));
});
function checkGenerationExperiment(req: Request, p: Project, tool: string) {
  const internal = req.path.startsWith('/api/agent-internal/');
  if (internal && activeReferenceVideoWorkflow(p.id)) throw new HttpError(409, '本轮正在准备参考视频分析与方案。收到明确的生成请求后再执行制作。');
  const requireProposal = internal && !officialJobFor(p.id);
  assertExperimentRouteExecution(getAgentState(p.id).experiment || emptyExperiment(), req.body?.stepId, tool, requireProposal);
  if (!req.body?.stepId) return;
  const graph = getAgentState(p.id).experiment, step = graph?.nodes.find(node => node.id === req.body.stepId);
  if (!step || step.kind !== 'step') throw new HttpError(400, '制作步骤不存在，尚未提交生成任务。');
  if (step.inputs.some(id => graph!.nodes.find(node => node.id === id)?.status !== 'completed')) throw new HttpError(400, '请先完成当前方法的上游输入。');
  const activeRun = graph?.runs?.find(run => run.stepId === step.id && run.status === 'running');
  if (req.get('X-SOP-Experiment-Run') && activeRun?.id !== req.get('X-SOP-Experiment-Run')) throw new HttpError(409, '执行记录已改变，尚未提交生成任务。');
  if (activeRun && (activeRun.id !== req.get('X-SOP-Experiment-Run') || activeRun.artifactIds.length)) throw new HttpError(409, '此步骤已有任务在运行，请查询或恢复原任务。');
}
function trackGenerationExperiment(req: Request, p: Project, sourceId: string) {
  if (!req.body?.stepId || !sourceId) return;
  const current = getProject(p.id)!;
  setAgentExperiment(p.id, bindExperimentSource(getAgentState(p.id).experiment, current, { stepId: req.body.stepId, sourceId, runId: req.get('X-SOP-Experiment-Run') }));
}
function startAgentImage(req: Request, res: Response) {
  const p = record(req);
  if (!req.path.includes('/production/') || req.body?.stepId) checkGenerationExperiment(req, p, 'generate_image');
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  if (!imageGenerationStatus().configured) throw new HttpError(503, '请先连接图片生成服务。');
  if (p.agentImages?.some(image => image.status === 'running')) throw new HttpError(409, '已有图片正在生成，请等待完成。');
  if ((p.agentImages?.length || 0) >= 50) throw new HttpError(409, '当前创意已达到 50 张图片上限。');
  const sceneIndex = z.number().int().min(1).max(120).optional().parse(req.body?.sceneIndex);
  const { prompt, aspectRatio, size: requestedSize, quality, referenceIds } = z.object({
    prompt: z.string().min(1).max(12000).refine(value => !!value.trim(), '请填写生成提示词。'),
    aspectRatio: z.string().regex(IMAGE_RATIO_PATTERN).optional(),
    size: z.string().regex(IMAGE_SIZE_PATTERN).optional(),
    quality: z.enum(IMAGE_QUALITIES).default('auto'),
    referenceIds: z.array(z.string()).max(4).default([]),
  }).parse(sceneIndex === undefined ? req.body : { ...req.body, ...productionSceneImage(p, sceneIndex) });
  let size: string | undefined;
  try { size = imageRequestSize(aspectRatio, requestedSize); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '图片尺寸参数无效。'); }
  if (new Set(referenceIds).size !== referenceIds.length) throw new HttpError(400, '参考图不能重复。');
  const sources = productionImages(p, getAgentImageReferences(p.id));
  const references = referenceIds.map(id => {
    const asset = sources.find(item => item.id === id);
    const filename = asset?.filename;
    const mime = asset?.mime || (/\.jpe?g$/i.test(filename || '') ? 'image/jpeg' : /\.webp$/i.test(filename || '') ? 'image/webp' : 'image/png');
    if (!filename || !['image/png', 'image/jpeg', 'image/webp'].includes(mime) || !fs.existsSync(workspaceUploadPath(filename))) throw new HttpError(400, `参考图 ${id} 不在当前创意中。`);
    return { data: fs.readFileSync(workspaceUploadPath(filename)), mime: mime as 'image/png' | 'image/jpeg' | 'image/webp', filename };
  });
  const image = { id: randomUUID(), prompt, model: imageGenerationStatus().model, aspectRatio, size, quality, referenceIds, status: 'running' as const, createdAt: new Date().toISOString(),
    ...(sceneIndex ? { productionSceneIndex: sceneIndex, productionPlanUpdatedAt: p.videoProductionPlan?.updatedAt } : {}) };
  const updated = saveProject({ ...p, agentImages: [...(p.agentImages || []), image] });
  trackGenerationExperiment(req, p, image.id);
  void (async () => {
    try {
      const result = await generateImage({ idempotencyKey: image.id, prompt, model: image.model, aspectRatio, size, quality, prefix: 'agent-image', references, projectId: p.id, label: 'Agent 图片' });
      const current = getProject(p.id);
      if (current) saveProject({ ...current, agentImages: (current.agentImages || []).map(item => item.id === image.id ? { ...item, status: 'completed', filename: result.filename, url: result.url, model: result.model, width: result.width, height: result.height, warning: result.warning } : item) });
      // Agent outputs remain task-local; only explicit user uploads enter the library.
    } catch (error) {
      const current = getProject(p.id);
      if (current) saveProject({ ...current, agentImages: (current.agentImages || []).map(item => item.id === image.id ? { ...item, status: 'failed', error: error instanceof Error ? error.message : '图片生成失败' } : item) });
    }
  })();
  res.status(202).json({ imageId: image.id, status: image.status, project: updated });
}
app.post('/api/agent-internal/:id/images', startAgentImage);

function generationScope(project: Project) {
  return getAgentState(project.id).messages.filter(message => message.role === 'user').at(-1)?.id || project.id;
}
function startAgentVideo(firstLastFrame: boolean) {
  return async (req: Request, res: Response) => {
    const p = record(req);
    if (uploadsInProgress.has(p.id)) throw new HttpError(409, '请等待素材上传完成。');
    if (req.path.startsWith('/api/agent-internal/') || req.body?.stepId) checkGenerationExperiment(req, p, firstLastFrame ? 'generate_first_last_frame_video' : 'generate_video');
    const input = productionVideoInput.parse(req.body);
    if (firstLastFrame && !input.firstFrameId && !input.lastFrameId) throw new HttpError(400, '请提供首帧或尾帧素材。');
    const result = await startProductionVideo(p, input, productionImages(p, getAgentImageReferences(p.id)), generationScope(p));
    if (result.videoId) trackGenerationExperiment(req, p, result.videoId);
    res.status(202).json(result);
  };
}
app.post('/api/agent-internal/:id/videos', startAgentVideo(false));
app.post('/api/agent-internal/:id/videos/first-last-frame', startAgentVideo(true));
app.post('/api/agent-internal/:id/videos/minimax', (req, res) => {
  const p = record(req);
  checkGenerationExperiment(req, p, 'generate_minimax_video');
  if (uploadsInProgress.has(p.id)) throw new HttpError(409, '请等待素材上传完成。');
  const userMessageId = getAgentState(p.id).messages.filter(message => message.role === 'user').at(-1)?.id;
  const result = startMinimaxVideo(p, req.body, productionImages(p, getAgentImageReferences(p.id)), userMessageId || p.id);
  trackGenerationExperiment(req, p, result.videoId);
  res.status(202).json(result);
});
app.post('/api/agent-internal/:id/videos/:videoId/recover', (req, res) => {
  const p = record(req); editable(p);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const videoId = String(req.params.videoId);
  if (p.generatedVideos.some(video => video.id === videoId && video.provider === 'minimax-h3')) return res.status(202).json(recoverMinimaxVideo(p, videoId));
  void launchTask(p.id, { kind: 'recover', videoId }).catch(error => console.warn(`Creative Omni recovery: ${error instanceof Error ? error.message : String(error)}`));
  res.status(202).json({ videoId, jobId: getProject(p.id)!.job!.id, status: 'running' });
});

app.post(`/api/agent-internal/:id${referenceFramesPath}`, async (req, res) => {
  const p = record(req);
  const video = p.assets.find(asset => asset.kind === 'video');
  const duration = video?.duration;
  if (!video || !duration) throw new HttpError(400, '请先上传含有效时长的参考视频。');
  const { start = 0, end = duration, sampling, measureAudio, detailTimes } = referenceFramesInput.parse(req.body || {});
  const until = Math.min(end, duration);
  if (until <= start) throw new HttpError(400, '读取范围必须位于原片时长内，结束时间应晚于开始时间。');
  const detailed = sampling === 'frame-by-frame';
  if (detailed && until - start > referenceFrameWindowSeconds + 1e-6) throw new HttpError(400, `逐帧核对请指定不超过 ${referenceFrameWindowSeconds} 秒的原片区间。`);
  if (measureAudio && (!detailed || detailTimes)) throw new HttpError(400, '请在逐帧核对模式下测量短窗口音轨。');
  if (detailTimes && (new Set(detailTimes).size !== detailTimes.length || detailTimes.some(at => at < start || at >= until))) {
    throw new HttpError(400, '高清帧时间须位于所选原片区间内且不能重复。');
  }
  const metadata = video.averageFrameRate ? video : { ...video, ...await inspectMedia(video.filename, 'video', false) };
  const sheets = detailTimes ? await extractReferenceDetails(video.filename, detailTimes, until) : await extractReferenceSheets(video.filename, start, until, sampling);
  const frameCount = sheets.reduce((count, sheet) => count + sheet.times.length, 0);
  const audio = measureAudio ? await measureReferenceAudio(video, start, until) : undefined;
  res.json({ video: referenceVideoInfo(metadata), revision: p.revision,
    start, end: until, sampling: detailTimes ? 'detail' : sampling, frameCount, frameLimitReached: !detailTimes && detailed && frameCount >= maxReferenceFrames,
    audio, columns: detailTimes ? 1 : referenceSheetColumns, sheets });
});
function currentAnalysisVideo(p: Project, input: { videoId: string; revision: number }) {
  const video = p.assets.find(asset => asset.kind === 'video');
  if (video?.id !== input.videoId || p.revision !== input.revision) throw new HttpError(409, '分析期间参考视频或创意资料已更新，请核对当前内容再保存。');
  return video;
}

app.post('/api/agent-internal/:id/analyze/save', async (req, res) => {
  const p = record(req); editable(p);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const input = saveReferenceAnalysisInput.parse(req.body);
  const video = currentAnalysisVideo(p, input);
  const duration = video.duration;
  if (!duration || duration < 0.1) throw new HttpError(400, '参考视频的时长不足以保存分镜。');
  const { shots: observed, scenes: observedScenes, focusPoints, uncertainties, masterPrompt, ...analysis } = input.analysis;
  const needsDraft = activeReferenceVideoWorkflow(p.id) === 'plan';
  if (needsDraft && !masterPrompt) throw new HttpError(400, '复刻原片分析须包含中英文母版 Prompt、负面词和参数建议。');
  if (masterPrompt && observedScenes.some(scene => !scene.prompt || !scene.camera || !scene.entities)) {
    throw new HttpError(400, '保存制作母版时，每张场景镜卡需提供镜头语言、实体和单镜 Prompt。');
  }
  const shots = observed.map(({ focusPoints: points, ...shot }, index) => {
    const end = observed[index + 1]?.start ?? duration;
    return { ...shot, id: `shot-${index + 1}`, end, narration: '', sound: '', focusPoints: aiFocusPoints(points || [], shot.start, end) };
  });
  const error = validateTimeline(shots, duration);
  if (shots[0].start !== 0 || error) throw new HttpError(400, '第一个镜头必须从 0 秒开始。各镜头的起点应依次递增并位于原片时长内。');
  for (const shot of shots) {
    if (shot.evidenceFrames?.some(({ at }) => at < shot.start || at >= shot.end) ||
        shot.motionBeats?.some(beat => beat.start < shot.start || beat.end > shot.end || beat.end <= beat.start)) {
      throw new HttpError(400, `${shot.id} 的关键画面和动态时间线必须使用此镜头区间内的原片时间。`);
    }
  }
  const scenes = (() => {
    try { return referenceSceneRanges(observedScenes, shots); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '场景分组无效。'); }
  })();
  const limitations = video.hasAudio ? ['原片口播、音乐节拍和具体音效待听辨核对。', ...uncertainties].slice(0, 30) : uncertainties;
  const agentAnalysis = {
    result: { ...analysis, duration, shots, uncertainties: limitations, focusPoints: aiFocusPoints(focusPoints || [], 0, duration) },
    scenes,
    masterPrompt,
    meta: { mode: 'sampled-frames' as const, transport: 'agent-frames' as const, audioSubmitted: false, requestedModel: getAgentState(p.id).model || agentProvider.model, analyzedAt: new Date().toISOString() },
  };
  await launchTask(p.id, { kind: 'analysis', agentAnalysis });
  const saved = record(req);
  res.json({ saved: true, duration, revision: saved.revision, shotCount: shots.length, sceneTable: { title: referenceSceneTableTitle, sceneCount: scenes.length },
    grids: saved.storyboardGrids?.map(({ id, start, end }) => ({ id, start, end })) || [],
    nextRequiredTool: needsDraft ? 'save_video_production' : undefined });
});

async function saveProductionPlanRoute(req: Request, res: Response) {
  const p = record(req); editable(p);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const input = videoProductionInput.parse(req.body);
  if (req.path.startsWith('/api/agent-internal/') && activeReferenceVideoWorkflow(p.id) === 'plan') {
    if (!input.sourceVideoId || input.sourceVideoId !== p.assets.find(asset => asset.kind === 'video')?.id) {
      throw new HttpError(400, '请将复刻制作方案关联到当前参考视频。');
    }
    if (!completeReferenceSceneTable(p.referenceSceneTable, input.sourceVideoId) && !input.originalMasterPrompt) {
      throw new HttpError(400, '请先保存完整的原片分析，或在局部方案中保存对应区间的原片母版与镜卡。');
    }
    if (input.method !== 'edit' && input.scenes.some(scene => !scene.keyframePrompt)) {
      throw new HttpError(400, '请为每个待制作场景保存关键帧 Prompt。');
    }
    if (!input.creativeDirection) throw new HttpError(400, '请根据原片和用户选择的自由度保存创意主线、保留项与调整建议。');
  }
  res.json(await saveVideoProductionPlan(p, input, productionImages(p, getAgentImageReferences(p.id))));
}
async function buildProductionStoryboardRoute(req: Request, res: Response) {
  const p = record(req); editable(p);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  if (req.body?.stepId) checkGenerationExperiment(req, p, 'build_video_storyboard');
  const input = productionStoryboardInput.parse(req.body);
  if (input.end <= input.start || input.end - input.start > 10 + 1e-6) throw new HttpError(400, '制作故事板每段须大于 0 秒且不超过 10 秒。');
  const sources = productionImages(p, getAgentImageReferences(p.id));
  const filenames = input.frameIds.map(id => {
    const source = sources.find(item => item.id === id && ![...p.storyboardGrids || [], ...p.productionStoryboards || []].some(grid => grid.id === id));
    if (!source?.filename || !fs.existsSync(workspaceUploadPath(source.filename))) throw new HttpError(400, `关键帧 ${id} 不在当前创意中。请提供单张关键帧。`);
    return source.filename;
  });
  const grid = await buildProductionStoryboard(filenames, input.start, input.end, input.prompt, input.aspectRatio || (p.market.aspectRatio === '16:9' ? '16:9' : '9:16'));
  try {
    const current = record(req); editable(current);
    if (current.revision !== p.revision) throw new HttpError(409, '创建故事板时创意已更新，请重试。');
    saveProject({ ...current, productionStoryboards: [...current.productionStoryboards || [], grid] });
  } catch (error) {
    fs.rmSync(workspaceUploadPath(grid.filename), { force: true });
    throw error;
  }
  trackGenerationExperiment(req, p, grid.id);
  res.status(201).json(grid);
}
async function composeProductionRoute(req: Request, res: Response) {
  const p = record(req); editable(p);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  if (req.path.startsWith('/api/agent-internal/') || req.body?.stepId) checkGenerationExperiment(req, p, 'compose_video');
  const video = await composeSelectedVideo(p, productionCompositionInput.parse(req.body));
  trackGenerationExperiment(req, p, video.id);
  res.status(201).json({ composedVideo: video });
}
app.post('/api/agent-internal/:id/production', saveProductionPlanRoute);
app.post('/api/agent-internal/:id/production/storyboards', buildProductionStoryboardRoute);
app.post('/api/agent-internal/:id/production/compose', composeProductionRoute);
app.post('/api/agent-internal/:id/production/ffmpeg', async (req, res) => {
  const project = record(req);
  editable(project);
  if (project.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const input = ffmpegSkillInput.parse(req.body);
  checkGenerationExperiment(req, project, 'ffmpeg_skill');

  const files = getAgentState(project.id).experiment?.files || [];
  const video = ffmpegSkillSource(project, files, input.videoId, 'video');
  const audio = 'audioId' in input ? ffmpegSkillSource(project, files, input.audioId, 'audio') : undefined;
  const result = await renderFFmpegSkill(input, video, audio);
  let saved = false;
  try {
    const current = record(req);
    if (current.archivedAt) throw new HttpError(409, '创意已归档，成片未保存。');
    checkGenerationExperiment(req, current, 'ffmpeg_skill');
    const graph = getAgentState(current.id).experiment;
    ffmpegSkillSource(current, graph?.files || [], input.videoId, 'video');
    if ('audioId' in input) ffmpegSkillSource(current, graph?.files || [], input.audioId, 'audio');
    const updated = { ...current, composedVideos: [...current.composedVideos || [], result] };
    const next = bindExperimentSource(graph, updated, { stepId: input.stepId, sourceId: result.id, runId: req.get('X-SOP-Experiment-Run') });
    saveProject(updated);
    saved = true;
    setAgentExperiment(current.id, next);
    res.status(201).json({ composedVideo: result });
  } finally {
    if (!saved) await fs.promises.unlink(workspaceUploadPath(result.filename)).catch(() => {});
  }
});

app.post('/api/agent-internal/:id/grids/:gridId/prompt', (req, res) => {
  const p = record(req); editable(p);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const { prompt } = z.object({ prompt: z.string().trim().min(1).max(100000) }).parse(req.body);
  const gridId = String(req.params.gridId);
  const key = p.productionStoryboards?.some(grid => grid.id === gridId) ? 'productionStoryboards' : 'storyboardGrids';
  if (!p[key]?.some(grid => grid.id === gridId)) throw new HttpError(404, '分镜网格不存在。');
  const updated = saveProject({ ...p, [key]: p[key].map(grid => grid.id === gridId ? { ...grid, prompt } : grid) });
  res.json({ gridId, revision: updated.revision, prompt });
});
async function generateGridRoute(req: Request, res: Response) {
  const p = record(req);
  if (req.path.startsWith('/api/agent-internal/') || req.body?.stepId) checkGenerationExperiment(req, p, 'generate_grid_video');
  if (uploadsInProgress.has(p.id)) throw new HttpError(409, '请等待素材上传完成。');
  const grid = [...p.productionStoryboards || [], ...p.storyboardGrids || []].find(item => item.id === String(req.params.gridId));
  if (!grid || grid.included === false || !grid.prompt.trim()) throw new HttpError(409, '故事板未就绪。');
  if (grid.gridSize !== 3 || grid.end <= grid.start || grid.end - grid.start > 10 + 1e-6) throw new HttpError(400, '视频生产需要 3×3 故事板，每段最长 10 秒。');
  const { gridId: _gridId, prompt: draftPrompt, ...body } = req.body || {};
  const prompt = draftPrompt === undefined ? grid.prompt : z.string().trim().min(1).max(12000).parse(draftPrompt);
  const input = productionVideoInput.pick({ referenceIds: true, referenceVideoIds: true, stepId: true, requestKey: true, aspectRatio: true, resolution: true, generateAudio: true }).parse(body);
  const result = await startProductionVideo(p, { ...input, prompt, duration: Math.min(10, grid.end - grid.start), referenceIds: [grid.id, ...input.referenceIds] },
    productionImages(p, getAgentImageReferences(p.id)), generationScope(p), grid.id);
  if (result.videoId) trackGenerationExperiment(req, p, result.videoId);
  res.status(202).json(result);
}
app.post('/api/agent-internal/:id/grids/:gridId/generate', generateGridRoute);
app.get('/api/capabilities', (_req, res) => res.json(getCapabilityRegistry()));
app.get('/api/status', (_req, res) => res.json({ model: agentProvider.model, configured: agentEnabled, llm: llmStatus(), imageGeneration: imageGenerationStatus(), local: !publicAuthEnabled, maxVideoMB: 250, maxImageMB: 10, videoAnalysis: { provider: agentProvider.id, defaultModel: agentProvider.model, transport: 'agent-frames', enabled: agentEnabled }, minimaxVideoGeneration: minimaxVideoStatus(), keyframeStorage: keyframeStorageStatus(), videoGeneration: { provider: OMNI_FLASH_12, configured: omniConfigured(), resolution: '720p', durations: OMNI_FLASH_12_SECONDS } }));
app.post('/api/auth/session', async (req, res) => {
  if (!publicAuthEnabled) return res.sendStatus(204);
  const token = bearerToken(req);
  try {
    const accountId = await verifiedSessions.isAllowed(token);
    if (!accountId) return res.status(401).json({ error: '登录状态无效，请重新登录。' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
    const maxAge = Number.isFinite(payload.exp) ? Math.min(3600, payload.exp - Math.floor(Date.now() / 1000)) : 0;
    if (maxAge <= 0) return res.status(401).json({ error: '登录已过期，请重新登录。' });
    res.setHeader('Set-Cookie', sessionCookieHeader(token, maxAge));
    setImmediate(() => withWorkspaceAccount(accountId, () => resumeMediaBackups(token)));
    return res.sendStatus(204);
  } catch { return res.status(503).json({ error: '登录服务暂时不可用，请稍后重试。' }); }
});
app.delete('/api/auth/session', (req, res) => {
  if (publicAuthEnabled) {
    verifiedSessions.invalidate(cookieToken(req));
    res.setHeader('Set-Cookie', sessionCookieHeader('', 0));
  }
  res.sendStatus(204);
});
app.use('/api', async (req, res, next) => {
  if (!publicAuthEnabled) return next();
  try {
    const started = performance.now();
    const accountId = await verifiedSessions.isAllowed(bearerToken(req));
    res.setHeader('Server-Timing', `auth;dur=${(performance.now() - started).toFixed(1)}`);
    if (!accountId) return res.status(401).json({ error: '请先登录，或重新登录后继续。' });
    res.locals.skillOwnerId = accountId;
    return withWorkspaceAccount(accountId, next);
  } catch { return res.status(503).json({ error: '登录服务暂时不可用，请稍后重试。' }); }
});
const landingEditorUsers = new Set((process.env.SOP_LANDING_EDITOR_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
registerLandingPageWriteRoutes(app, landingPageStore, (_req, res) => !publicAuthEnabled || landingEditorUsers.has(String(res.locals.skillOwnerId || '')));
app.post('/api/llm/responses', async (req, res) => { res.json(await generateLlm(req.body)); });
app.use('/media', async (req, res, next) => {
  if (!publicAuthEnabled) return next();
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const started = performance.now();
    const accountId = await verifiedSessions.isAllowed(cookieToken(req));
    res.setHeader('Server-Timing', `auth;dur=${(performance.now() - started).toFixed(1)}`);
    if (!accountId) return res.status(401).json({ error: '请先登录后查看此素材。' });
    return withWorkspaceAccount(accountId, next);
  } catch { return res.status(503).json({ error: '登录服务暂时不可用，请稍后重试。' }); }
});
app.use('/api/projects/:id', (req, res, next) => {
  if (!getProject(String(req.params.id))) return res.status(404).json({ error: '找不到这个创意。' });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && officialJobFor(String(req.params.id))) return res.status(403).json({ error: '官方实验记录只读。请采用资产，在自己的创意中继续创作。' });
  next();
});
registerSkillAssetRoutes(app, skillAgentAccess, agentEnabled);
app.use('/api/projects/:id/agent', (req, res, next) => {
  if (!agentEnabled) return res.status(503).json({ error: '创作 Agent 当前仅开放内部体验。' });
  next();
});
app.post('/api/projects/:id/agent/images', startAgentImage);
app.get('/api/projects/:id/agent', (req, res) => res.json(getAgentState(String(req.params.id))));
app.get('/api/projects/:id/agent/videos/:videoId/details', async (req, res, next) => {
  try { res.json(await getMinimaxVideoDetails(record(req), String(req.params.videoId))); }
  catch (failure) { next(failure); }
});
registerExperimentRoutes('/api/projects/:id/agent');
app.get('/api/projects/:id/agent/models', async (req, res, next) => {
  try { res.json(await listAgentModels(String(req.params.id))); }
  catch (error) { next(error); }
});
app.post('/api/projects/:id/agent/intelligent-tool', async (req, res, next) => {
  try {
    const p = record(req);
    const { name, args } = z.object({ name: z.string().min(1).max(120), args: z.record(z.string(), z.unknown()).default({}) }).parse(req.body);
    const tool = name.replace(/^sail_creation\//, '');
    if (tool === 'analyze_reference') {
      editable(p);
      if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
      if (!p.assets.some(asset => asset.kind === 'video')) throw new HttpError(400, '请先上传参考视频。');
      if (getAgentState(p.id).status === 'running') throw new HttpError(409, '创作 Agent 正在执行，请等待当前任务完成。');
      const state = await startAgentTurn(p.id, '请拆解当前创意的参考视频，重新分析镜头并保存分镜。只做分析。', [], [], [], []);
      return res.status(202).json({ started: true, turnId: state.turnId });
    }
    const routes: Record<string, string> = {
      discover_experiment_methods: '/experiment/methods/search', read_experiment_method: '/experiment/methods/read',
      get_creative: '', show_intelligent_ui: '/intelligent-ui', show_canvas_component: '/canvas-components',
      generate_image: '/images', generate_video: '/videos', generate_first_last_frame_video: '/videos/first-last-frame', generate_minimax_video: '/videos/minimax',
      save_video_production: '/production', build_video_storyboard: '/production/storyboards', compose_video: '/production/compose', ffmpeg_skill: '/production/ffmpeg',
      recover_video: `/videos/${encodeURIComponent(String(args.videoId || ''))}/recover`,
      edit_grid_prompt: `/grids/${encodeURIComponent(String(args.gridId || ''))}/prompt`,
      generate_grid_video: `/grids/${encodeURIComponent(String(args.gridId || ''))}/generate`,
      update_experiment: '/experiment', import_experiment_skill: '/experiment/skill', bind_experiment_source: '/experiment/bind', publish_experiment_file: '/experiment/file',
      build_animatic_preview: '/experiment/animatic', inspect_artifact_quality: '/experiment/qc-frames',
      read_experiment_node: `/experiment/nodes/${encodeURIComponent(String(args.nodeId || ''))}`,
    };
    if (!Object.hasOwn(routes, tool)) throw new HttpError(400, '当前创意没有这个工具。');
    if (p.archivedAt && tool !== 'get_creative') throw new HttpError(409, '请先恢复已归档创意。');
    const method = tool === 'get_creative' || tool === 'read_experiment_node' ? 'GET' : 'POST';
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-internal/${p.id}${routes[tool]}`, {
      method, headers: { 'X-SOP-Agent-Token': agentCapabilities.issue(p.id), 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(args) } : {}),
    });
    const body = await response.json();
    res.status(response.status).json(body);
  } catch (error) { next(error); }
});
app.patch('/api/projects/:id/agent/canvas-components/:componentId', (req, res) => {
  const p = record(req);
  if (p.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const component = updateAgentCanvasComponent(p.id, String(req.params.componentId), req.body);
  if (!component) throw new HttpError(404, '组件已关闭。');
  res.json(component);
});
app.delete('/api/projects/:id/agent/canvas-components/:componentId', (req, res) => {
  if (!closeAgentCanvasComponent(String(req.params.id), String(req.params.componentId))) throw new HttpError(404, '组件已关闭。');
  res.sendStatus(204);
});
function openEventStream(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.flushHeaders();
  const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 20_000);
  res.on('close', () => clearInterval(heartbeat));
  return (value: unknown) => { if (!res.destroyed) res.write(`data: ${JSON.stringify(value)}\n\n`); };
}
function streamAgent(id: string, send: (state: ReturnType<typeof getAgentState>) => void) {
  send(getAgentState(id));
  let timer: NodeJS.Timeout | undefined;
  const stop = subscribeAgent(id, state => {
    if (state.status !== 'running') { clearTimeout(timer); timer = undefined; send(state); }
    else if (!timer) timer = setTimeout(() => { timer = undefined; send(getAgentState(id)); }, 40);
  });
  return () => { stop(); clearTimeout(timer); };
}
app.get('/api/projects/:id/agent/events', (req, res) => {
  const id = String(req.params.id);
  res.on('close', streamAgent(id, openEventStream(res)));
});
app.get('/api/workspace/events/:id', async (req, res) => {
  const project = record(req);
  const send: (update: WorkspaceUpdate) => void = openEventStream(res);
  send({ type: 'project', project });
  res.on('close', subscribeProject(project.id, current => send({ type: 'project', project: current })));
  const mode = req.query.agent;
  if (mode === 'conversation' || mode === 'workspace') {
    if (agentEnabled) res.on('close', streamAgent(project.id, state => send({ type: 'agent', state })));
    else send({ type: 'agent-unavailable' });
  }
  if (!agentEnabled || (mode !== 'workspace' && mode !== 'sidebar')) return;
  let initializing = true;
  const activities: AgentActivities = {};
  const stop = subscribeAgentActivity((id, state) => {
    if (officialJobFor(id)) return;
    const activity = summarizeAgentActivity(state);
    const previous = activities[id];
    if (previous && previous.status === activity.status && previous.completedAt === activity.completedAt && previous.updatedAt === activity.updatedAt) return;
    activities[id] = activity;
    if (!initializing) send({ type: 'activity', id, activity });
  });
  res.on('close', stop);
  const ids = [...listProjectIds()].filter(id => !officialJobFor(id));
  const entries = await Promise.all(ids.map(async id => [id, await getAgentActivity(id)] as const));
  send({ type: 'activities', entries: { ...Object.fromEntries(entries), ...activities } });
  for (const [id, activity] of entries) activities[id] ??= activity;
  initializing = false;
});
app.post('/api/projects/:id/agent/turns', async (req, res, next) => {
  try {
    const project = record(req);
    if (project.archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
    const { prompt, imageIds, videoIds, audioIds, attachmentOrder, referencePlanVideoId } = z.object({
      prompt: z.string().min(1).max(6000).refine(value => !!value.trim(), '请输入消息。'),
      imageIds: z.array(z.string().min(1)).max(3).optional(), videoIds: z.array(z.string().min(1)).max(1).optional(),
      audioIds: z.array(z.string().min(1)).max(1).optional(), attachmentOrder: z.array(z.string().min(1)).max(5).optional(),
      referencePlanVideoId: z.string().min(1).max(100).optional(),
    }).parse(req.body);
    if (referencePlanVideoId && !project.assets.some(asset => asset.kind === 'video' && asset.id === referencePlanVideoId && asset.duration)) {
      throw new HttpError(409, '参考视频已变更或缺少时长，请核对后重试。');
    }
    await startAgentTurn(project.id, prompt, imageIds, videoIds, attachmentOrder, audioIds, state => res.status(202).json(state), !!referencePlanVideoId);
  } catch (error) {
    if (!res.headersSent) next(error instanceof HttpError || error instanceof z.ZodError ? error : error instanceof Error ? new HttpError(error.message.includes('正在执行') ? 409 : 503, error.message) : error);
  }
});
app.post('/api/projects/:id/agent/steer', async (req, res, next) => {
  try {
    if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
    const { prompt, expectedTurnId } = z.object({ prompt: z.string().min(1).max(6000).refine(value => !!value.trim(), '请输入消息。'), expectedTurnId: z.string().min(1).max(200) }).parse(req.body);
    res.status(202).json(await steerAgentTurn(String(req.params.id), prompt, expectedTurnId));
  } catch (error) { next(error instanceof HttpError || error instanceof z.ZodError ? error : error instanceof Error ? new HttpError(error instanceof AgentTurnConflictError ? 409 : 503, error.message) : error); }
});
app.post('/api/projects/:id/agent/queue', (req, res) => {
  if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const { prompt } = z.object({ prompt: z.string().min(1).max(6000).refine(value => !!value.trim(), '请输入消息。') }).parse(req.body);
  res.status(202).json(queueAgentMessage(String(req.params.id), prompt));
});
app.delete('/api/projects/:id/agent/queue/:messageId', (req, res) => {
  if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  try { res.json(removeQueuedAgentMessage(String(req.params.id), String(req.params.messageId))); }
  catch (error) { if (error instanceof AgentTurnConflictError) throw new HttpError(409, error.message); throw error; }
});
app.post('/api/projects/:id/agent/queue/resume', (req, res) => {
  if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  res.json(resumeAgentQueue(String(req.params.id)));
});
app.patch('/api/projects/:id/agent/queue/:messageId', (req, res) => {
  if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
  const { prompt } = z.object({ prompt: z.string().min(1).max(6000).refine(value => !!value.trim(), '请输入消息。') }).parse(req.body);
  try { res.json(editQueuedAgentMessage(String(req.params.id), String(req.params.messageId), prompt)); }
  catch (error) { if (error instanceof AgentTurnConflictError) throw new HttpError(409, error.message); throw error; }
});
app.post('/api/projects/:id/agent/queue/:messageId/steer', async (req, res, next) => {
  try {
    if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
    const { expectedTurnId } = z.object({ expectedTurnId: z.string().min(1).max(200) }).parse(req.body);
    res.status(202).json(await steerQueuedAgentMessage(String(req.params.id), String(req.params.messageId), expectedTurnId));
  } catch (error) { next(error instanceof HttpError || error instanceof z.ZodError ? error : error instanceof Error ? new HttpError(error instanceof AgentTurnConflictError ? 409 : 503, error.message) : error); }
});
app.post('/api/projects/:id/agent/interrupt', async (req, res, next) => {
  try { res.json(await interruptAgentTurn(String(req.params.id))); }
  catch (error) { next(error); }
});
app.post('/api/projects/:id/agent/model', async (req, res, next) => {
  try {
    const { model } = z.object({ model: z.string().trim().min(1) }).parse(req.body);
    res.json(await setAgentModel(String(req.params.id), model));
  } catch (error) { next(error instanceof z.ZodError ? error : error instanceof Error ? new HttpError(400, error.message) : error); }
});
app.post('/api/projects/:id/agent/adaptation', (req, res, next) => {
  try {
    if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
    const { adaptation } = z.object({ adaptation: z.custom<import('../shared/agent-adaptation').AgentAdaptation>(isAgentAdaptation, '请选择有效的创作适配档位。') }).parse(req.body);
    res.json(setAgentAdaptation(String(req.params.id), adaptation));
  } catch (error) { next(error instanceof HttpError || error instanceof z.ZodError ? error : error instanceof Error ? new HttpError(error.message.includes('正在执行') ? 409 : 400, error.message) : error); }
});
app.post('/api/projects/:id/agent/presentation', (req, res, next) => {
  try {
    if (record(req).archivedAt) throw new HttpError(409, '请先恢复已归档创意。');
    const { presentation } = z.object({ presentation: z.custom<import('../shared/agent-presentation').AgentPresentation>(isAgentPresentation, '请选择有效的结果呈现模式。') }).parse(req.body);
    res.json(setAgentPresentation(String(req.params.id), presentation));
  } catch (error) { next(error instanceof HttpError || error instanceof z.ZodError ? error : error instanceof Error ? new HttpError(error.message.includes('正在执行') ? 409 : 400, error.message) : error); }
});
app.use('/api/settings', (req, res, next) => {
  if (publicAuthEnabled) return res.status(403).json({ error: '线上服务的模型与存储连接由服务端配置。' });
  next();
});
app.post('/api/settings/image-generation', (req, res) => {
  const { apiKey, baseUrl, model } = z.object({ apiKey: z.string().trim().min(16).max(300).optional(), baseUrl: z.url().max(300).optional(), model: z.enum(IMAGE_MODELS) }).parse(req.body);
  configureImageGeneration({ apiKey, baseUrl, model });
  res.json(imageGenerationStatus());
});
app.post('/api/settings/omni', (req, res) => {
  const { apiKey } = z.object({ apiKey: z.string().trim().min(16).max(300) }).parse(req.body);
  configureOmniKey(apiKey);
  res.json({ configured: omniConfigured(), verified: false, provider: OMNI_FLASH_12 });
});
app.post('/api/settings/keyframe-storage', (req, res) => {
  const { url, apiKey, bucket } = z.object({ url: z.url().max(500), apiKey: z.string().trim().min(16).max(2000),
    bucket: z.string().trim().regex(/^[a-zA-Z\d][a-zA-Z\d_-]{0,62}$/).default('sop-keyframes') }).parse(req.body);
  const address = new URL(url);
  if (address.protocol !== 'https:' || address.username || address.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.hostname) || address.hostname.includes(':')) throw new HttpError(400, '请输入有效的 Supabase HTTPS 项目地址。');
  configureKeyframeStorage(url.replace(/\/+$/, ''), apiKey, bucket);
  res.json({ ...keyframeStorageStatus(), verified: false });
});
app.get('/api/workspace', (_req, res) => res.json(defaultWorkspace));
app.get('/api/media-library', (_req, res) => res.json(listLibraryMedia()));
const libraryFilter = z.object({ kind: z.enum(['image', 'video']).optional(), query: z.string().max(240).optional() });
const libraryPageQuery = libraryFilter.extend({ sort: z.enum(['recent', 'oldest', 'name']).optional(), cursor: z.string().max(3200).optional() });
app.get('/api/media-library/items', (req, res) => {
  const { kind, query, sort, cursor } = libraryPageQuery.parse(req.query);
  const { indexing, warning } = publicAuthEnabled ? ensureCloudCatalog(bearerToken(req)) : { indexing: false, warning: undefined };
  res.set('Cache-Control', 'private, no-store').json(libraryPage({ kind, query, sort, cursor }, mediaBackupState, indexing, warning));
});
app.get('/api/media-library/selection', (req, res) => {
  res.set('Cache-Control', 'private, no-store').json(librarySelection(libraryFilter.parse(req.query)));
});
app.get('/api/media-library/status', (req, res) => {
  const { ids } = z.object({ ids: z.string().max(3300).optional() }).parse(req.query);
  const requested = (ids || '').split(',').filter(id => /^[a-f0-9]{64}$/.test(id)).slice(0, 50);
  const status = Object.fromEntries(requested.map(id => [id, mediaBackupState(id) || null]));
  res.set('Cache-Control', 'private, no-store').json({ ...cloudCatalogStatus(), status });
});
app.delete('/api/media-library', async (req, res, next) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().max(1024).regex(/^(?:[a-f0-9]{64}|cloud:[^/\\]+)$/)).min(1).max(1000) }).parse(req.body);
    res.json(await deleteMediaLibraryItems([...new Set(ids)], bearerToken(req)));
  } catch (error) {
    next(error instanceof z.ZodError ? error : new HttpError(503, error instanceof Error ? error.message : '素材删除未完成，请重试。'));
  }
});
app.post('/api/media-library/sync', async (req, res, next) => {
  try { res.status(202).json(startMediaSync(bearerToken(req))); }
  catch (error) { next(new HttpError(503, error instanceof Error ? error.message : '云端同步暂不可用。')); }
});
app.get('/api/media-library/sync/:jobId', (req, res) => {
  const status = mediaSyncStatus(String(req.params.jobId));
  if (!status) return res.status(404).json({ error: '同步任务已结束或服务已重启，请重新同步素材。' });
  res.json(status);
});
app.get('/api/workspace/projects', (_req, res) => res.json(listWorkspaceProjects()));
app.post('/api/workspace/projects', (req, res) => {
  const { title } = z.object({ title: z.string().trim().min(1).max(120) }).parse(req.body);
  res.status(201).json(createWorkspaceProject(title));
});
app.put('/api/workspace/projects/:id', (req, res) => {
  const project = getWorkspaceProject(String(req.params.id));
  if (!project) throw new HttpError(404, '找不到这个项目。');
  const { title, revision } = z.object({ title: z.string().trim().min(1).max(120), revision: z.number().int().nonnegative() }).parse(req.body);
  if (revision !== project.revision) throw new HttpError(409, '项目名称已更新，请刷新后再编辑。');
  res.json(saveWorkspaceProject({ ...project, title }));
});
app.get('/api/workspace/projects/:id/creatives', (req, res) => {
  const id = String(req.params.id);
  if (!getWorkspaceProject(id)) throw new HttpError(404, '找不到这个项目。');
  res.json(listProjects().filter(creative => creative.parentProjectId === id));
});
// Existing production endpoints continue to address individual creatives.
app.get('/api/projects', (_req, res) => res.json(listProjects().filter(project => !officialJobFor(project.id))));
app.get('/api/generation-tasks', (req, res) => res.json(generationTaskList(typeof req.query.q === 'string' ? req.query.q.slice(0, 500) : '')));
app.get('/api/generation-tasks/:taskId', (req, res) => {
  const task = generationTasks().find(item => item.id === String(req.params.taskId));
  if (!task) throw new HttpError(404, '找不到这个生成任务，请刷新任务列表。');
  res.json(task);
});
app.post('/api/generation-tasks/:taskId/recover', (req, res) => {
  const task = generationTasks().find(item => item.id === String(req.params.taskId));
  if (!task?.creativeId || !task.id.startsWith('video:')) throw new HttpError(404, '找不到可恢复查询的视频任务。');
  if (officialJobFor(task.creativeId)) throw new HttpError(403, '官方实验记录只读，请在自己的创意中继续。');
  const project = getProject(task.creativeId);
  if (!project) throw new HttpError(404, '找不到所属创意。');
  recoverMinimaxVideo(project, task.id.slice('video:'.length));
  res.status(202).json(generationTasks().find(item => item.id === task.id));
});
app.post('/api/projects', async (req, res) => {
  const { parentProjectId, title, skills } = z.object({ parentProjectId: z.uuid().default(defaultProjectId), title: z.string().trim().min(1).max(120).optional(), skills: z.array(skillSelectionSchema).max(8).default([]) }).parse(req.body || {});
  if (!getWorkspaceProject(parentProjectId)) throw new HttpError(404, '所属项目不存在。');
  const preparedSkills = await prepareSkillSelections(skills, String(res.locals.skillOwnerId || 'local'));
  const created = createProject(parentProjectId, title);
  applyInitialSkills(created.id, preparedSkills, String(res.locals.skillOwnerId || 'local'), skillAgentAccess);
  for (const selection of preparedSkills) {
    const owner = String(res.locals.skillOwnerId || 'local'), asset = getSkillAsset(selection.assetId, owner);
    if (asset.visibility === 'public') void verifySkillAsset(asset.id, owner, selection.releaseId, skillAgentAccess, agentEnabled, true).catch(error => console.warn(`Skill verification could not start: ${error instanceof Error ? error.message : 'unknown error'}`));
  }
  res.status(201).json(created);
});
app.get('/api/projects/:id', (req, res) => res.json(record(req)));
app.post('/api/projects/:id/archive', (req, res) => {
  const project = record(req); editable(project);
  const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
  if (Boolean(project.archivedAt) === archived) return res.json(project);
  res.json(saveProject({ ...project, archivedAt: archived ? new Date().toISOString() : undefined }));
});
app.put('/api/projects/:id', (req, res) => {
  const project = record(req); editable(project);
  const { revision, parentProjectId, title } = z.object({
    revision: z.number().int().nonnegative(),
    parentProjectId: z.uuid().optional(),
    title: z.string().trim().min(1).max(120),
  }).parse(req.body);
  if (parentProjectId && !getWorkspaceProject(parentProjectId)) throw new HttpError(404, '所属项目不存在。');
  if (revision !== project.revision) throw new HttpError(409, '创意已更新，请重新打开创意后再编辑。');
  res.json(saveProject({ ...project, title, parentProjectId: parentProjectId || project.parentProjectId }));
});

const uploader = workspaceUploader({ fileSize: 250 * 1024 * 1024, files: 1, fields: 0 });
async function uploadedAsset(file: Express.Multer.File, kind: Asset['kind'], includeThumbnail = true): Promise<Asset> {
  if (kind === 'product' && file.size > 10 * 1024 * 1024) throw new HttpError(400, '单张产品图不能超过 10 MB。');
  if (kind === 'audio' && file.size > 50 * 1024 * 1024) throw new HttpError(400, '单个音频文件不能超过 50 MB。');
  const metadata = await inspectMedia(file.filename, kind, includeThumbnail);
  return { id: randomUUID(), kind, name: Buffer.from(file.originalname, 'latin1').toString('utf8'), filename: file.filename, url: `/media/${file.filename}`, size: file.size, ...metadata };
}
function attachAsset(current: Project, asset: Asset) {
  if (asset.kind === 'audio') {
    const sent = sentAgentAttachmentIds(getAgentState(current.id).messages);
    if (current.assets.some(item => item.kind === 'audio' && !sent.has(item.id))) throw new HttpError(400, '每条消息最多附加 1 个音频文件。');
    return saveProject({ ...current, assets: [...current.assets, asset] });
  }
  const video = asset.kind === 'video';
  if (!video && current.assets.filter(item => item.kind === 'product').length >= 3) throw new HttpError(400, '最多上传 3 张产品参考图。');
  const updated = saveProject({ ...current, assets: video ? [...current.assets.filter(item => item.kind !== 'video'), asset] : [...current.assets, asset],
    ttsTimingNotice: undefined, isDemo: video ? false : current.isDemo, analysis: video ? null : current.analysis,
    analysisReview: video ? { pendingIds: [], suggestions: {} } : current.analysisReview, analysisMeta: video ? null : current.analysisMeta,
    referenceSceneTable: video ? undefined : current.referenceSceneTable,
    videoProductionPlan: video && current.videoProductionPlan?.sourceVideoId ? undefined : current.videoProductionPlan,
    storyboardGrids: video ? [] : current.storyboardGrids,
    rewrite: video ? null : current.rewrite, rewriteStale: !video && !!current.rewrite,
    generatedVideos: (current.generatedVideos || []).map(item => ({ ...item, stale: true })),
    composedVideos: (current.composedVideos || []).map(item => ({ ...item, stale: true })), job: null });
  if (video) noteAgentVideoChanged(updated.id);
  return updated;
}
app.post('/api/media-library/uploads/:kind', (req, res, next) => {
  if (!['image', 'video'].includes(String(req.params.kind))) return next(new HttpError(400, '不支持的素材类型。'));
  uploader.single('file')(req, res, async error => {
    try {
      if (error) throw error;
      if (!req.file) throw new HttpError(400, '请选择一个文件。');
      // Library IDs are hashes of the stored bytes. Keep the original immutable so
      // preview, project references and background cloud sync all see the same file.
      // In particular, do not hold the upload response open for video transcoding.
      const asset = await uploadedAsset(req.file, req.params.kind === 'video' ? 'video' : 'product', false);
      const item = await collectUploadedAsset(asset);
      queueMediaSync(bearerToken(req), item.id);
      void ensureMediaThumbnail(item.filename!, item.duration);
      res.status(201).json({ ...item, thumbnail: `/media/library/${item.id}/thumbnail`, backup: mediaBackupState(item.id) });
    } catch (err) {
      if (req.file) { fs.unlink(req.file.path, () => {}); fs.unlink(`${req.file.path}.jpg`, () => {}); }
      next(err);
    }
  });
});
app.post('/api/projects/:id/library-assets', async (req, res, next) => {
  try {
    const project = record(req); editable(project);
    const { mediaId } = z.object({ mediaId: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    const item = getLibraryMedia(mediaId);
    if (!item?.filename) throw new HttpError(404, '素材不存在，请刷新素材库。');
    const kind = item.kind === 'video' ? 'video' : 'product';
    const metadata = kind === 'video' && !item.duration ? await inspectMedia(item.filename, kind) : {};
    const current = record(req); editable(current);
    const asset: Asset = { ...item, ...metadata, id: randomUUID(), kind, filename: item.filename };
    res.json(attachAsset(current, asset));
  } catch (err) { next(err); }
});
app.post('/api/projects/:id/assets/:kind', (req, res, next) => {
  try {
    const p = record(req); editable(p);
    if (!['video', 'product', 'audio'].includes(String(req.params.kind))) throw new HttpError(400, '不支持的素材类型。');
    if (req.params.kind === 'product' && p.assets.filter(a => a.kind === 'product').length >= 3) throw new HttpError(400, '最多上传 3 张产品参考图。');
    uploadsInProgress.add(p.id);
    uploader.single('file')(req, res, async error => {
      try {
        if (error) throw error;
        if (!req.file) throw new HttpError(400, '请选择一个文件。');
        const kind = String(req.params.kind) as Asset['kind'];
        if (kind === 'product' && req.file.size > 10 * 1024 * 1024) throw new HttpError(400, '单张产品图不能超过 10 MB。');
        const asset = await uploadedAsset(req.file, kind);
        const item = kind !== 'audio' ? await collectUploadedAsset(asset) : undefined;
        const current = getProject(p.id)!;
        res.status(201).json(attachAsset(current, asset));
        if (item) {
          queueMediaSync(bearerToken(req), item.id);
          void ensureMediaThumbnail(item.filename!, item.duration);
        }
      } catch (err) {
        if (req.file) {
          fs.unlink(req.file.path, () => {});
          fs.unlink(`${req.file.path}.jpg`, () => {});
        }
        next(err);
      } finally { uploadsInProgress.delete(p.id); }
    });
  } catch (err) { next(err); }
});
app.delete('/api/projects/:id/assets/:assetId', (req, res) => {
  const p = record(req); editable(p);
  const asset = p.assets.find(a => a.id === req.params.assetId);
  if (!asset) throw new HttpError(404, '素材不存在。');
  if (asset.kind === 'audio') { res.json(saveProject({ ...p, assets: p.assets.filter(item => item.id !== asset.id) })); return; }
  // Remove the association; retain local source files so replacement is recoverable.
  const updated = saveProject({ ...p, assets: p.assets.filter(a => a.id !== asset.id), ttsTimingNotice: undefined, analysis: asset.kind === 'video' ? null : p.analysis, analysisReview: asset.kind === 'video' ? { pendingIds: [], suggestions: {} } : p.analysisReview, analysisMeta: asset.kind === 'video' ? null : p.analysisMeta, referenceSceneTable: asset.kind === 'video' ? undefined : p.referenceSceneTable, videoProductionPlan: asset.id === p.videoProductionPlan?.sourceVideoId ? undefined : p.videoProductionPlan, storyboardGrids: asset.kind === 'video' ? [] : p.storyboardGrids, rewrite: asset.kind === 'video' ? null : p.rewrite, rewriteStale: asset.kind === 'product' && !!p.rewrite, generatedVideos: (p.generatedVideos || []).map(video => ({ ...video, stale: true })), composedVideos: (p.composedVideos || []).map(video => ({ ...video, stale: true })), job: null });
  if (asset.kind === 'video') noteAgentVideoChanged(updated.id);
  res.json(updated);
});
app.post('/api/projects/:id/production', saveProductionPlanRoute);
app.post('/api/projects/:id/production/keyframes', startAgentImage);
app.post('/api/projects/:id/production/storyboards', buildProductionStoryboardRoute);
app.post('/api/projects/:id/production/storyboards/:gridId/videos', generateGridRoute);
app.post('/api/projects/:id/production/videos', startAgentVideo(false));
app.post('/api/projects/:id/production/compose', composeProductionRoute);
app.get('/media/library/:id/:variant', async (req, res, next) => {
  const { id, variant } = req.params;
  if (!/^(?:[a-f0-9]{64}|cloud:[^/\\]+)$/.test(id) || variant !== 'thumbnail' && variant !== 'original') return res.sendStatus(404);
  const local = localLibraryItem(id);
  try {
    if (local && variant === 'thumbnail') {
      const thumbnail = await ensureMediaThumbnail(local.filename!, local.duration);
      if (thumbnail) return res.type('jpg').sendFile(thumbnail, { cacheControl: false });
    }
    if (local && variant === 'original') return res.redirect(local.url);
    const url = publicAuthEnabled ? await cloudMediaUrl(id, variant === 'thumbnail', cookieToken(req)) : undefined;
    if (url) return res.redirect(url);
    res.sendStatus(404);
  } catch (error) { next(error); }
});
app.get('/media/:filename', (req, res, next) => {
  if (!publicAuthEnabled) return next();
  const file = visibleSkillMedia(req.params.filename, workspaceAccountId()!);
  if (!file) return next();
  res.sendFile(file, { cacheControl: false });
});
app.use('/media', (req, res, next) => express.static(workspaceUploadDir(), { dotfiles: 'deny', cacheControl: !publicAuthEnabled, setHeaders(res, filepath) {
  if (!publicAuthEnabled) setShotMediaCacheHeaders(res, filepath);
  const imageExtension = /\.(png|jpe?g|webp)$/i.exec(filepath)?.[1].toLowerCase();
  if (imageExtension) { res.setHeader('Content-Type', imageExtension === 'png' ? 'image/png' : imageExtension === 'webp' ? 'image/webp' : 'image/jpeg'); return; }
  if (filepath.endsWith('.txt')) { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return; }
  if (filepath.endsWith('.srt')) { res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8'); return; }
  if (filepath.endsWith('.mp4')) { res.setHeader('Content-Type', 'video/mp4'); return; }
  if (/(?:recreation|remix-character)-[a-f\d-]+\.(png|jpg|webp)$/.test(filepath)) return;
  if (!filepath.endsWith('.jpg')) {
    // Uploaded files use random extensionless names; set the registered, sniffed MIME type.
    const filename = path.basename(filepath);
    const archivedMime = libraryMime(filename);
    if (archivedMime) { res.setHeader('Content-Type', archivedMime); return; }
    for (const p of listProjects()) {
      const project = getProject(p.id)!;
      const asset = project.assets.find(a => a.filename === filename) || project.generatedVideos?.find(a => a.filename === filename) || project.composedVideos?.find(a => a.filename === filename);
      if (asset) { res.setHeader('Content-Type', 'mime' in asset ? asset.mime || 'video/mp4' : 'video/mp4'); return; }
    }
    res.setHeader('Content-Type', 'application/octet-stream');
  }
} })(req, res, next));
app.use('/media', (_req, res) => res.sendStatus(404));
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError || error instanceof TaskError || error instanceof ExperimentError || error instanceof ExperimentPlanningError || error instanceof MinimaxError || error instanceof GptError) return res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError) {
    const issues = error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }));
    const agentRequest = req.path.startsWith('/api/agent-internal/');
    return res.status(400).json({
      error: agentRequest ? '创作工具参数校验失败，请根据 issues 修正参数后再提交；请求尚未提交到生成服务。' : '输入格式不正确，请检查表单或分镜内容。',
      fields: issues.map(issue => issue.field),
      ...(agentRequest ? { issues } : {}),
    });
  }
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '视频不能超过 250 MB。' : '上传失败，请每次选择一个文件。' });
  const message = error instanceof Error ? error.message : '';
  const safe = /^(请上传|单张|最多|第一版支持|未读取到|视频读取失败|视频压缩失败|产品参考图)/.test(message);
  res.status(safe ? 400 : 500).json({ error: safe ? message : '操作未完成，请稍后重试。' });
});
if (process.argv.includes('--production')) {
  const distRoot = path.join(root, 'dist');
  const distAssetsRoot = path.join(distRoot, 'assets');
  if (!fs.existsSync(path.join(distRoot, 'index.html'))) throw new Error('请先运行 npm run build。');
  app.use(express.static(distRoot, { setHeaders(res, filepath) {
    const isGeneratedAsset = path.dirname(filepath) === distAssetsRoot;
    const hasViteContentHash = /-[A-Za-z0-9_-]{8}\.[^.]+$/.test(path.basename(filepath));
    if (isGeneratedAsset && hasViteContentHash) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:woff2|webp)$/.test(filepath) || filepath.includes(`${path.sep}assets${path.sep}brand${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  } }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(distRoot, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const host = process.env.SOP_HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`AI Creative Lab ready at http://${host}:${port} · ${agentProvider.model} · Agent ${agentEnabled ? 'enabled' : 'disabled'}`);
  startMinimaxReconciler(projectId => { getAgentState(projectId); });
});
