import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import multer from 'multer';
import JSZip from 'jszip';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { MODEL, defaultWorkspace, projectPatchSchema, validateContinuousTimeline, validateMarket, validateTimeline, type Project, type Asset, type ProductionMode } from '../shared/domain';
import { buildExportFiles, buildVeoUnitPrompt } from '../shared/export';
import { buildVeoPlan } from '../shared/veo-plan';
import { workflowBusy } from '../shared/workflow';
import { keyframeCurrent } from '../shared/storyboard';
import type { GenerationInput } from './veo';
import { compressUploadedVideo } from './video-compression';
import { createSessionVerifier } from './session-verifier';
import { setShotMediaCacheHeaders } from './media-cache';
import { characterBasis, defaultRemixSettings, remixPlanCurrent, remixSettingsSchema } from '../shared/remix';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
// NODE_USE_ENV_PROXY is read at process startup, before .env is loaded. Reapply
// proxy configuration now so services started outside a proxy-enabled shell use it too.
if (process.env.NODE_USE_ENV_PROXY === '1') {
  const setProxy = (http as typeof http & { setGlobalProxyFromEnv?: (env: NodeJS.ProcessEnv) => () => void }).setGlobalProxyFromEnv;
  setProxy?.(process.env);
}
// Load storage after .env so an optional data-directory override takes effect.
const { createProject, getProject, listProjects, saveProject, uploadDir, defaultProjectId, createWorkspaceProject, getWorkspaceProject, listWorkspaceProjects, saveWorkspaceProject } = await import('./store');
const { configured, configureConnection, keyframeModel, checkModelConnection } = await import('./gemini');
const { VEO_MODELS, VEO_DURATION, configureGenerationKey, generationConfigured } = await import('./veo');
const { listTtsVoices } = await import('./compose');
const { launchTask, TaskError } = await import('./tasks');
const { launchRemix, RemixError } = await import('./remix');
const { startWorkflow, setWorkflowMode } = await import('./workflow');
const { inspectMedia, prepareShotMedia } = await import('./media');
const { collectUploadedAsset, listLibraryMedia, getLibraryMedia, libraryMime, initializeMediaLibrary } = await import('./media-library');
await initializeMediaLibrary();
const { configureKeyframeStorage, keyframeStorageStatus } = await import('./keyframe-storage');
const port = Number(process.env.SOP_PORT || 4317);
const app = express();
app.disable('x-powered-by');
const publicAuthEnabled = process.env.SOP_REQUIRE_AUTH === 'true';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const allowedHosts = new Set((process.env.SOP_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean));
if (publicAuthEnabled && (!supabaseUrl || !supabasePublishableKey || !allowedHosts.size)) {
  throw new Error('公网模式需配置 Supabase URL、Publishable Key 和 SOP_ALLOWED_HOSTS。');
}
const authClient = publicAuthEnabled ? createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const verifiedSessions = createSessionVerifier(async token => {
  if (!authClient) return false;
  const { data, error } = await authClient.auth.getUser(token);
  return !error && Boolean(data.user?.id);
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
async function isAllowedToken(token: string) {
  if (!authClient || !token) return false;
  return verifiedSessions.isAllowed(token);
}
function sessionCookieHeader(token: string, maxAgeSeconds: number) {
  return `${mediaCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, maxAgeSeconds)}`;
}
app.use((req, res, next) => {
  const hostname = req.hostname.toLowerCase();
  if (!publicAuthEnabled && !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) return res.status(403).json({ error: '此工作台仅接受本机访问。' });
  if (publicAuthEnabled && !allowedHosts.has(hostname)) return res.status(400).json({ error: '访问域名未加入服务白名单。' });
  const protectedResource = req.path.startsWith('/api') || req.path.startsWith('/media');
  const origin = req.headers.origin;
  if (origin && (!publicAuthEnabled || protectedResource)) {
    let allowedOrigin = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
    if (publicAuthEnabled) {
      try { allowedOrigin = new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase() && allowedHosts.has(new URL(origin).hostname.toLowerCase()); } catch { allowedOrigin = false; }
    }
    if (!allowedOrigin) return res.status(403).json({ error: '请求来源不被允许。' });
  }
  if (req.headers['sec-fetch-site'] === 'cross-site' && (!publicAuthEnabled || protectedResource)) return res.status(403).json({ error: '不接受跨站请求。' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '3mb' }));
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function record(req: Request): Project {
  const project = getProject(String(req.params.id));
  if (!project) throw new HttpError(404, '找不到这个创意。');
  return project;
}
const uploadsInProgress = new Set<string>();
function editable(project: Project) {
  if (project.job?.status === 'running' || workflowBusy(project) || uploadsInProgress.has(project.id)) throw new HttpError(409, '当前任务正在处理，请等待完成或接管制作。');
}
app.get('/api/status', (_req, res) => res.json({ model: MODEL, keyframeModel: keyframeModel(), configured: configured(), local: !publicAuthEnabled, maxVideoMB: 250, maxImageMB: 10, keyframeStorage: keyframeStorageStatus(), videoGeneration: { provider: 'veo-3.1', models: VEO_MODELS, configured: generationConfigured(), duration: VEO_DURATION } }));
app.post('/api/auth/session', async (req, res) => {
  if (!publicAuthEnabled) return res.sendStatus(204);
  const token = bearerToken(req);
  try {
    if (!(await isAllowedToken(token))) return res.status(401).json({ error: '登录状态无效，请重新登录。' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
    const maxAge = Number.isFinite(payload.exp) ? Math.min(3600, payload.exp - Math.floor(Date.now() / 1000)) : 0;
    if (maxAge <= 0) return res.status(401).json({ error: '登录已过期，请重新登录。' });
    res.setHeader('Set-Cookie', sessionCookieHeader(token, maxAge));
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
    const allowed = await isAllowedToken(bearerToken(req));
    res.setHeader('Server-Timing', `auth;dur=${(performance.now() - started).toFixed(1)}`);
    if (!allowed) return res.status(401).json({ error: '请先登录，或重新登录后继续。' });
    return next();
  } catch { return res.status(503).json({ error: '登录服务暂时不可用，请稍后重试。' }); }
});
app.use('/media', async (req, res, next) => {
  if (!publicAuthEnabled) return next();
  try {
    const started = performance.now();
    const allowed = await isAllowedToken(cookieToken(req));
    res.setHeader('Server-Timing', `auth;dur=${(performance.now() - started).toFixed(1)}`);
    if (!allowed) return res.status(401).json({ error: '请先登录后查看此素材。' });
    return next();
  } catch { return res.status(503).json({ error: '登录服务暂时不可用，请稍后重试。' }); }
});
app.get('/api/tts/voices', async (req, res, next) => {
  try { res.json(await listTtsVoices()); } catch { next(new HttpError(503, '本机系统配音不可用，请确认 macOS 的 say 命令可运行。')); }
});
app.post('/api/settings', (req, res) => {
  const { apiKey, baseUrl } = z.object({ apiKey: z.string().trim().min(16).max(300), baseUrl: z.string().trim().max(300).default('') }).parse(req.body);
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw new HttpError(400, '兼容接口地址必须以 http:// 或 https:// 开头。');
  configureConnection(apiKey, baseUrl);
  res.json({ configured: true, verified: false, provider: baseUrl ? 'openai-compatible' : 'google' });
});
app.post('/api/settings/check', async (_req, res) => {
  try { res.json(await checkModelConnection()); } catch (error) { res.status(502).json({ error: error instanceof Error ? error.message : '模型连接检查失败。' }); }
});
app.post('/api/settings/veo', (req, res) => {
  const { apiKey } = z.object({ apiKey: z.string().trim().min(16).max(300) }).parse(req.body);
  configureGenerationKey(apiKey);
  res.json({ configured: generationConfigured(), verified: false, provider: 'veo-3.1', models: VEO_MODELS });
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
app.get('/api/projects', (_req, res) => res.json(listProjects()));
app.post('/api/projects', (req, res) => {
  const { demo, parentProjectId, title } = z.object({ demo: z.boolean().default(false), parentProjectId: z.uuid().default(defaultProjectId), title: z.string().trim().min(1).max(120).optional() }).parse(req.body || {});
  if (!getWorkspaceProject(parentProjectId)) throw new HttpError(404, '所属项目不存在。');
  res.status(201).json(createProject(demo, parentProjectId, title));
});
app.get('/api/projects/:id', (req, res) => res.json(record(req)));
app.put('/api/projects/:id/remix', (req, res) => {
  const project = record(req); editable(project);
  const body = z.object({ revision: z.number().int().nonnegative(), settings: remixSettingsSchema, prompt: z.string().trim().min(1).max(100000).optional() }).parse(req.body);
  if (body.revision !== project.revision) throw new HttpError(409, '创意已更新，请刷新后再保存二创要求。');
  const next: Project = { ...project, remix: { ...(project.remix || { settings: defaultRemixSettings, videos: [] }), settings: body.settings } };
  if (body.prompt !== undefined) {
    if (!remixPlanCurrent(next)) throw new HttpError(409, '拆解或二创要求已变更，请先重新编写提示词。');
    next.remix!.plan = { ...next.remix!.plan!, prompt: body.prompt };
  }
  res.json(saveProject(next));
});
app.post('/api/projects/:id/remix/:action', (req, res) => {
  const project = record(req); editable(project);
  const action = z.enum(['character', 'plan', 'video', 'recover']).parse(req.params.action);
  const { videoId } = z.object({ videoId: z.string().max(80).optional() }).parse(req.body || {});
  void launchRemix(project.id, action, videoId).catch(() => {});
  res.status(202).json(getProject(project.id));
});
app.post('/api/projects/:id/shot-media', async (req, res, next) => {
  try {
    const project = record(req);
    const input = z.object({ assetId: z.string().max(80), start: z.number().min(0).max(2700), end: z.number().min(0).max(2700),
      evidenceFrames: z.array(z.object({ at: z.number().min(0).max(2700), reason: z.string().max(1000) })).max(3).optional(),
      framesOnly: z.boolean().default(false), inlineFrames: z.boolean().default(false) }).parse(req.body);
    const video = project.assets.find(asset => asset.id === input.assetId && asset.kind === 'video');
    if (!video) throw new HttpError(404, '原片不存在，请先上传参考视频。');
    if (input.end <= input.start || input.end > (video.duration || 0) + .001) throw new HttpError(400, '镜头时间范围超出了原片，请先修正时间。');
    try {
      const started = performance.now();
      const media = await prepareShotMedia(video, input, !input.framesOnly, input.inlineFrames);
      res.append('Server-Timing', `prepare;dur=${(performance.now() - started).toFixed(1)}`);
      res.json(media);
    }
    catch (error) { throw new HttpError(422, error instanceof Error ? error.message : '镜头媒体提取失败。'); }
  } catch (error) { next(error); }
});
app.post('/api/projects/:id/archive', (req, res) => {
  const project = record(req); editable(project);
  const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
  if (Boolean(project.archivedAt) === archived) return res.json(project);
  res.json(saveProject({ ...project, archivedAt: archived ? new Date().toISOString() : undefined }));
});
app.put('/api/projects/:id', (req, res) => {
  const project = record(req); editable(project);
  const patch = projectPatchSchema.parse(req.body);
  if (patch.parentProjectId && !getWorkspaceProject(patch.parentProjectId)) throw new HttpError(404, '所属项目不存在。');
  if (patch.revision !== project.revision) throw new HttpError(409, '创意已更新，请重新打开创意后再编辑。');
  const marketError = validateMarket(patch.market);
  if (marketError) throw new HttpError(400, marketError);
  const promptFlowChanged = (patch.promptFlow || 'localized') !== (project.promptFlow || 'localized');
  const inputsChanged = JSON.stringify(patch.product) !== JSON.stringify(project.product) || JSON.stringify(patch.market) !== JSON.stringify(project.market) || JSON.stringify(patch.replication || project.replication) !== JSON.stringify(project.replication) || JSON.stringify(patch.analysis) !== JSON.stringify(project.analysis) || promptFlowChanged;
  if (patch.analysis) {
    const err = validateTimeline(patch.analysis.shots, project.assets.find(a => a.kind === 'video')?.duration || patch.analysis.duration);
    if (err) throw new HttpError(400, err);
  }
  if (patch.rewrite && !inputsChanged && !project.rewriteStale) { const targetDuration = patch.market.duration === 'original' ? patch.analysis?.duration : Number(patch.market.duration); const err = patch.promptFlow === 'direct-analysis' ? validateTimeline(patch.rewrite.shots, targetDuration) : targetDuration ? validateContinuousTimeline(patch.rewrite.shots, targetDuration) : validateTimeline(patch.rewrite.shots); if (err) throw new HttpError(400, err); }
  const rewriteChanged = JSON.stringify(patch.rewrite) !== JSON.stringify(project.rewrite);
  const settingsChanged = patch.productionMode !== project.productionMode || patch.ttsVoice !== (project.ttsVoice || '');
  const generationSettingsChanged = JSON.stringify(patch.automaticSettings) !== JSON.stringify(project.automaticSettings);
  const next = { ...project, ...patch };
  const oldUnits = project.rewrite ? buildVeoPlan(project.rewrite.shots) : [];
  const newUnits = next.rewrite ? buildVeoPlan(next.rewrite.shots) : [];
  const changedUnit = (unitId: string | undefined, mode: ProductionMode) => {
    const oldUnit = oldUnits.find(unit => unit.id === unitId), newUnit = newUnits.find(unit => unit.id === unitId);
    return !oldUnit || !newUnit || buildVeoUnitPrompt(project, oldUnit, mode) !== buildVeoUnitPrompt(next, newUnit, mode);
  };
  const draftsChanged = JSON.stringify(patch.veoPromptDrafts) !== JSON.stringify(project.veoPromptDrafts || {});
  const generatedVideos = project.generatedVideos.map(video => {
    const mode = video.productionMode || 'veo-native';
    const key = `${mode}:${video.unitId}`;
    const draft = patch.veoPromptDrafts[key];
    const draftChanged = JSON.stringify(draft) !== JSON.stringify(project.veoPromptDrafts?.[key]);
    return inputsChanged || generationSettingsChanged || rewriteChanged && changedUnit(video.unitId, mode) || draftChanged && draft?.prompt !== video.prompt ? { ...video, stale: true } : video;
  });
  const staleIds = new Set(generatedVideos.filter(video => video.stale).map(video => video.id));
  const changedLocalUnit = (unitId?: string) => {
    const oldUnit = oldUnits.find(unit => unit.id === unitId), newUnit = newUnits.find(unit => unit.id === unitId);
    return !oldUnit || !newUnit || JSON.stringify(project.rewrite?.shots.filter(shot => oldUnit.sourceShotIds.includes(shot.id))) !== JSON.stringify(next.rewrite?.shots.filter(shot => newUnit.sourceShotIds.includes(shot.id))) || oldUnit.start !== newUnit.start || oldUnit.end !== newUnit.end;
  };
  const composedVideos = project.composedVideos?.map(video => inputsChanged || rewriteChanged && (video.mode === 'tts-subtitles' || !video.unitId || changedLocalUnit(video.unitId)) || settingsChanged || generationSettingsChanged || video.sourceVideoIds.some(id => staleIds.has(id)) ? { ...video, stale: true } : video);
  const workflow = project.workflow && (inputsChanged || rewriteChanged || settingsChanged || generationSettingsChanged || draftsChanged) ? { ...project.workflow, status: 'paused' as const, message: '制作内容已更新。继续自动制作时会复用仍有效的结果。', finishedAt: undefined } : project.workflow;
  const ttsTimingNotice = inputsChanged || rewriteChanged || settingsChanged ? undefined : project.ttsTimingNotice;
  res.json(saveProject({ ...project, ...patch, generatedVideos, composedVideos, workflow, ttsTimingNotice, analysisMeta: patch.analysis ? project.analysisMeta : null, rewriteStale: project.rewriteStale || (!!patch.rewrite && inputsChanged) }));
});
const uploader = multer({ dest: uploadDir, limits: { fileSize: 250 * 1024 * 1024, files: 1, fields: 0 } });
const characterUploader = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
app.post('/api/projects/:id/remix-character', (req, res, next) => {
  try {
    const project = record(req); editable(project);
    const revision = z.coerce.number().int().nonnegative().parse(req.query.revision);
    if (revision !== project.revision) throw new HttpError(409, '创意已更新，请刷新后再上传人物参考图。');
    uploadsInProgress.add(project.id);
    characterUploader.single('file')(req, res, async error => {
      let renamed: string | undefined;
      try {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') throw new HttpError(400, '单张人物参考图不能超过 10 MB。');
        if (error) throw error;
        if (!req.file) throw new HttpError(400, '请选择一张人物参考图。');
        const metadata = await inspectMedia(req.file.filename, 'product');
        const mime = z.enum(['image/png', 'image/jpeg', 'image/webp']).parse(metadata.mime);
        const current = getProject(project.id)!;
        if (current.revision !== revision) throw new HttpError(409, '创意已更新，请刷新后再上传人物参考图。');
        const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
        const filename = `remix-character-${randomUUID()}.${extension}`;
        renamed = path.join(uploadDir, filename);
        await fs.promises.rename(req.file.path, renamed);
        const remix = current.remix || { settings: { ...defaultRemixSettings }, videos: [] };
        res.status(201).json(saveProject({ ...current, job: null, remix: { ...remix, character: {
          source: 'uploaded', name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
          filename, url: `/media/${filename}`, mime, basis: characterBasis(current),
          prompt: '', model: 'user-upload', generatedAt: new Date().toISOString(),
        } } }));
      } catch (err) {
        if (renamed) fs.unlink(renamed, () => {});
        if (req.file) fs.unlink(req.file.path, () => {});
        next(err);
      } finally { uploadsInProgress.delete(project.id); }
    });
  } catch (err) { next(err); }
});
async function uploadedAsset(file: Express.Multer.File, kind: 'video' | 'product', compress = true): Promise<Asset> {
  if (kind === 'product' && file.size > 10 * 1024 * 1024) throw new HttpError(400, '单张产品图不能超过 10 MB。');
  let metadata = await inspectMedia(file.filename, kind);
  const size = kind === 'video' && compress ? await compressUploadedVideo(file.path, file.size) : file.size;
  if (size !== file.size) metadata = await inspectMedia(file.filename, kind);
  return { id: randomUUID(), kind, name: Buffer.from(file.originalname, 'latin1').toString('utf8'), filename: file.filename, url: `/media/${file.filename}`, size, ...metadata };
}
function attachAsset(current: Project, asset: Asset) {
  const video = asset.kind === 'video';
  if (!video && current.assets.filter(item => item.kind === 'product').length >= 3) throw new HttpError(400, '最多上传 3 张产品参考图。');
  return saveProject({ ...current, assets: video ? [...current.assets.filter(item => item.kind !== 'video'), asset] : [...current.assets, asset],
    ttsTimingNotice: undefined, isDemo: video ? false : current.isDemo, analysis: video ? null : current.analysis,
    analysisReview: video ? { pendingIds: [], suggestions: {} } : current.analysisReview, analysisMeta: video ? null : current.analysisMeta,
    rewrite: video ? null : current.rewrite, rewriteStale: !video && !!current.rewrite,
    generatedVideos: (current.generatedVideos || []).map(item => ({ ...item, stale: true })),
    composedVideos: (current.composedVideos || []).map(item => ({ ...item, stale: true })), job: null });
}
app.post('/api/media-library/uploads/:kind', (req, res, next) => {
  if (!['image', 'video'].includes(String(req.params.kind))) return next(new HttpError(400, '不支持的素材类型。'));
  uploader.single('file')(req, res, async error => {
    try {
      if (error) throw error;
      if (!req.file) throw new HttpError(400, '请选择一个文件。');
      const asset = await uploadedAsset(req.file, req.params.kind === 'video' ? 'video' : 'product');
      res.status(201).json(await collectUploadedAsset(asset));
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
    if (!['video', 'product'].includes(String(req.params.kind))) throw new HttpError(400, '不支持的素材类型。');
    if (req.params.kind === 'product' && p.assets.filter(a => a.kind === 'product').length >= 3) throw new HttpError(400, '最多上传 3 张产品参考图。');
    uploadsInProgress.add(p.id);
    uploader.single('file')(req, res, async error => {
      try {
        if (error) throw error;
        if (!req.file) throw new HttpError(400, '请选择一个文件。');
        const kind = String(req.params.kind) as 'video' | 'product';
        if (kind === 'product' && req.file.size > 10 * 1024 * 1024) throw new HttpError(400, '单张产品图不能超过 10 MB。');
        const asset = await uploadedAsset(req.file, kind, req.query.source !== 'library');
        await collectUploadedAsset(asset);
        const current = getProject(p.id)!;
        res.status(201).json(attachAsset(current, asset));
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
  // Remove the association; retain local source files so replacement is recoverable.
  res.json(saveProject({ ...p, assets: p.assets.filter(a => a.id !== asset.id), ttsTimingNotice: undefined, analysis: asset.kind === 'video' ? null : p.analysis, analysisReview: asset.kind === 'video' ? { pendingIds: [], suggestions: {} } : p.analysisReview, analysisMeta: asset.kind === 'video' ? null : p.analysisMeta, rewrite: asset.kind === 'video' ? null : p.rewrite, rewriteStale: asset.kind === 'product' && !!p.rewrite, generatedVideos: (p.generatedVideos || []).map(video => ({ ...video, stale: true })), composedVideos: (p.composedVideos || []).map(video => ({ ...video, stale: true })), job: null }));
});
function acceptedTask(req: Request, res: Response, spec: Parameters<typeof launchTask>[1]) {
  const p = record(req); editable(p);
  void launchTask(p.id, spec).catch(() => {});
  res.status(202).json(getProject(p.id));
}
app.post('/api/projects/:id/generations', (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const input: GenerationInput = {
    unitId: typeof body.unitId === 'string' ? body.unitId : '',
    prompt: typeof body.prompt === 'string' ? body.prompt : '',
    mode: body.mode === 'i2v' || body.mode === 'r2v' ? body.mode : 't2v',
    resolution: body.resolution === '1080p' || body.resolution === 'lite' ? body.resolution : '720p',
    aspectRatio: body.aspectRatio === '16:9' ? '16:9' : '9:16',
    images: Array.isArray(body.images) ? body.images.filter((value): value is string => typeof value === 'string') : [],
  };
  acceptedTask(req, res, { kind: 'generation', input });
});
app.post('/api/projects/:id/generations/:videoId/recover', (req, res) => acceptedTask(req, res, { kind: 'recover', videoId: String(req.params.videoId) }));
app.post('/api/projects/:id/generations/:videoId/compose', (req, res) => acceptedTask(req, res, { kind: 'compose', videoId: String(req.params.videoId), voice: typeof req.body?.voice === 'string' ? req.body.voice : undefined }));
app.post('/api/projects/:id/compose', (req, res) => acceptedTask(req, res, { kind: 'compose', voice: typeof req.body?.voice === 'string' ? req.body.voice : undefined, timingApproval: typeof req.body?.timingApproval === 'string' ? req.body.timingApproval : undefined }));
app.post('/api/projects/:id/jobs/:kind', (req, res) => {
  const kind = String(req.params.kind);
  if (kind !== 'analysis' && kind !== 'analysis-refine' && kind !== 'rewrite') throw new HttpError(400, '任务类型不正确。');
  acceptedTask(req, res, { kind });
});
app.post('/api/projects/:id/keyframes/:shotId', (req, res) => acceptedTask(req, res, { kind: 'keyframe', shotId: String(req.params.shotId) }));
app.post('/api/projects/:id/workflow/mode', (req, res) => {
  const p = record(req);
  if (uploadsInProgress.has(p.id)) throw new HttpError(409, '请等待素材上传完成。');
  const { mode } = z.object({ mode: z.enum(['automatic', 'manual']) }).parse(req.body);
  res.json(setWorkflowMode(p.id, mode));
});
app.post('/api/projects/:id/workflow/start', (req, res) => {
  const p = record(req); editable(p);
  const { maxNewClips, target } = z.object({ maxNewClips: z.number().int().min(0).max(1000).default(0), target: z.enum(['keyframes', 'video']).default('keyframes') }).parse(req.body);
  res.status(202).json(startWorkflow(p.id, maxNewClips, target));
});
app.get('/api/projects/:id/export', async (req, res) => {
  const project = record(req);
  if (!project.rewrite || project.rewriteStale) throw new HttpError(409, '请先生成与当前资料一致的改写方案。');
  const zip = new JSZip();
  for (const [filename, text] of Object.entries(buildExportFiles(project))) zip.file(filename, text);
  for (const [i, asset] of project.assets.filter(a => a.kind === 'product').entries()) {
    const ext = asset.mime === 'image/png' ? 'png' : asset.mime === 'image/webp' ? 'webp' : 'jpg';
    zip.file(`product-references/reference-${i + 1}.${ext}`, fs.readFileSync(path.join(uploadDir, asset.filename)));
  }
  const manifest = project.rewrite.shots.map((shot, index) => {
    const keyframe = shot.keyframe;
    const file = keyframeCurrent(project, shot) && keyframe?.filename && /^recreation-[a-f\d-]+\.(png|jpg|webp)$/.test(keyframe.filename) && fs.existsSync(path.join(uploadDir, keyframe.filename)) ? keyframe.filename : undefined;
    const output = file ? `recreation-keyframes/shot-${String(index + 1).padStart(2, '0')}.${file.split('.').at(-1)}` : undefined;
    if (file && output && fs.existsSync(path.join(uploadDir, file))) zip.file(output, fs.readFileSync(path.join(uploadDir, file)));
    return { shotId: shot.id, sourceShotId: shot.sourceShotId || shot.id, sourceAt: keyframe?.sourceAt,
      sourceFrameUrl: keyframe?.sourceFrameUrl, keyframeFile: output, status: keyframe?.status === 'completed' && !file ? 'stale' : keyframe?.status || 'pending',
      keyframePrompt: shot.keyframePrompt, visual: shot.visual, generationPrompt: shot.generationPrompt };
  });
  zip.file('recreation-keyframes/manifest.json', JSON.stringify(manifest, null, 2));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  res.setHeader('Content-Disposition', `attachment; filename="sop-studio-${project.id.slice(0, 8)}.zip"; filename*=UTF-8''${encodeURIComponent(project.title + '.zip')}`);
  res.type('application/zip').send(buffer);
});
app.use('/media', express.static(uploadDir, { dotfiles: 'deny', fallthrough: false, setHeaders(res, filepath) {
  setShotMediaCacheHeaders(res, filepath);
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
} }));
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError || error instanceof TaskError || error instanceof RemixError) return res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ error: '输入格式不正确，请检查表单或分镜内容。', fields: error.issues.map(i => i.path.join('.')) });
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
app.listen(port, host, () => console.log(`AI-Sail Flow ready at http://${host}:${port} · ${MODEL} · Gemini ${configured() ? 'configured' : 'not configured'}`));
