import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { z } from 'zod';
import { MODEL, projectPatchSchema, validateMarket, validateTimeline, type Project, type Asset, type Job } from '../shared/domain';
import { buildExportFiles } from '../shared/export';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; }
// Load storage after .env so an optional data-directory override takes effect.
const { createProject, getProject, listProjects, saveProject, uploadDir } = await import('./store');
const { analyze, rewrite, configured, configureConnection } = await import('./gemini');
const { inspectMedia } = await import('./media');
const port = Number(process.env.SOP_PORT || 4317);
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const hostname = req.hostname;
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) return res.status(403).json({ error: '此工作台仅接受本机访问。' });
  const origin = req.headers.origin;
  if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) return res.status(403).json({ error: '请求来源不被允许。' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: '不接受跨站请求。' });
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
  if (!project) throw new HttpError(404, '找不到这个项目。');
  return project;
}
const uploadsInProgress = new Set<string>();
function editable(project: Project) {
  if (project.job?.status === 'running' || uploadsInProgress.has(project.id)) throw new HttpError(409, '当前任务正在处理，请等待完成。');
}
app.get('/api/status', (_req, res) => res.json({ model: MODEL, configured: configured(), local: true, maxVideoMB: 250, maxImageMB: 10 }));
app.post('/api/settings', (req, res) => {
  const { apiKey, baseUrl } = z.object({ apiKey: z.string().trim().min(16).max(300), baseUrl: z.string().trim().max(300).default('') }).parse(req.body);
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw new HttpError(400, '兼容接口地址必须以 http:// 或 https:// 开头。');
  configureConnection(apiKey, baseUrl);
  res.json({ configured: true, verified: false, provider: baseUrl ? 'openai-compatible' : 'google' });
});
app.get('/api/projects', (_req, res) => res.json(listProjects()));
app.post('/api/projects', (req, res) => {
  const { demo } = z.object({ demo: z.boolean().default(false) }).parse(req.body || {});
  res.status(201).json(createProject(demo));
});
app.get('/api/projects/:id', (req, res) => res.json(record(req)));
app.put('/api/projects/:id', (req, res) => {
  const project = record(req); editable(project);
  const patch = projectPatchSchema.parse(req.body);
  if (patch.revision !== project.revision) throw new HttpError(409, '项目已更新，请重新打开项目后再编辑。');
  const marketError = validateMarket(patch.market);
  if (marketError) throw new HttpError(400, marketError);
  if (patch.analysis) {
    const err = validateTimeline(patch.analysis.shots, project.assets.find(a => a.kind === 'video')?.duration || patch.analysis.duration);
    if (err) throw new HttpError(400, err);
  }
  if (patch.rewrite) { const err = validateTimeline(patch.rewrite.shots); if (err) throw new HttpError(400, err); }
  const inputsChanged = JSON.stringify(patch.product) !== JSON.stringify(project.product) || JSON.stringify(patch.market) !== JSON.stringify(project.market) || JSON.stringify(patch.analysis) !== JSON.stringify(project.analysis);
  res.json(saveProject({ ...project, ...patch, analysisMeta: patch.analysis ? project.analysisMeta : null, rewriteStale: project.rewriteStale || (!!patch.rewrite && inputsChanged) }));
});
const uploader = multer({ dest: uploadDir, limits: { fileSize: 250 * 1024 * 1024, files: 1, fields: 0 } });
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
        const metadata = await inspectMedia(req.file.filename, kind);
        const asset: Asset = { id: randomUUID(), kind, name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), filename: req.file.filename, url: `/media/${req.file.filename}`, size: req.file.size, ...metadata };
        const current = getProject(p.id)!;
        const assets = kind === 'video' ? [...current.assets.filter(a => a.kind !== 'video'), asset] : [...current.assets, asset];
        const nextProject = { ...current, assets, isDemo: kind === 'video' ? false : current.isDemo, analysis: kind === 'video' ? null : current.analysis, analysisMeta: kind === 'video' ? null : current.analysisMeta, rewrite: kind === 'video' ? null : current.rewrite, rewriteStale: kind === 'product' && !!current.rewrite, job: null };
        res.status(201).json(saveProject(nextProject));
      } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
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
  res.json(saveProject({ ...p, assets: p.assets.filter(a => a.id !== asset.id), analysis: asset.kind === 'video' ? null : p.analysis, analysisMeta: asset.kind === 'video' ? null : p.analysisMeta, rewrite: asset.kind === 'video' ? null : p.rewrite, rewriteStale: asset.kind === 'product' && !!p.rewrite, job: null }));
});
let activeJobs = 0;
app.post('/api/projects/:id/jobs/:kind', (req, res) => {
  const p = record(req); editable(p);
  const kind = String(req.params.kind);
  if (kind !== 'analysis' && kind !== 'rewrite') throw new HttpError(400, '任务类型不正确。');
  if (!configured()) throw new HttpError(503, '请先在模型设置连接 Gemini，再开始真实分析。');
  if (activeJobs >= 2) throw new HttpError(429, '已有两个任务在处理，请稍后再试。');
  if (kind === 'analysis' && !p.assets.some(a => a.kind === 'video')) throw new HttpError(400, '请先上传参考视频。');
  if (kind === 'rewrite' && (!p.analysis || !p.product.name.trim() || !p.product.facts.trim())) throw new HttpError(400, '请先完成视频拆解，并填写产品名称与已确认卖点。');
  const marketError = validateMarket(p.market);
  if (marketError) throw new HttpError(400, marketError);
  const job: Job = { id: randomUUID(), kind, status: 'running', progress: 4, message: '正在准备素材…', startedAt: new Date().toISOString() };
  const saved = saveProject({ ...p, job });
  activeJobs++;
  res.status(202).json(saved);
  const progress = (n: number, message: string) => {
    const current = getProject(p.id)!;
    saveProject({ ...current, job: { ...current.job!, progress: n, message } });
  };
  void (async () => {
    try {
      if (kind === 'analysis') {
        const result = await analyze(saved, progress);
        const current = getProject(p.id)!;
        saveProject({ ...current, isDemo: false, analysis: result.result, analysisMeta: result.meta, rewriteStale: !!current.rewrite, usage: { input: current.usage.input + result.usage.input, output: current.usage.output + result.usage.output }, job: { ...current.job!, status: 'completed', progress: 100, message: result.meta.mode === 'native-video' ? '原生视频拆解完成' : '关键帧分析完成', finishedAt: new Date().toISOString() } });
      } else {
        const result = await rewrite(saved, progress);
        const current = getProject(p.id)!;
        saveProject({ ...current, rewrite: result.result, rewriteStale: false, usage: { input: current.usage.input + result.usage.input, output: current.usage.output + result.usage.output }, job: { ...current.job!, status: 'completed', progress: 100, message: '本地化改写完成', finishedAt: new Date().toISOString() } });
      }
    } catch (error) {
      const current = getProject(p.id)!;
      saveProject({ ...current, job: { ...current.job!, status: 'failed', message: error instanceof Error ? error.message : '任务未完成，请重试。', finishedAt: new Date().toISOString() } });
    } finally { activeJobs--; }
  })();
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
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  res.setHeader('Content-Disposition', `attachment; filename="sop-studio-${project.id.slice(0, 8)}.zip"; filename*=UTF-8''${encodeURIComponent(project.title + '.zip')}`);
  res.type('application/zip').send(buffer);
});
app.use('/media', express.static(uploadDir, { dotfiles: 'deny', fallthrough: false, setHeaders(res, filepath) {
  if (!filepath.endsWith('.jpg')) {
    // Uploaded files use random extensionless names; set the registered, sniffed MIME type.
    const filename = path.basename(filepath);
    for (const p of listProjects()) {
      const asset = getProject(p.id)!.assets.find(a => a.filename === filename);
      if (asset) { res.setHeader('Content-Type', asset.mime); return; }
    }
    res.setHeader('Content-Type', 'application/octet-stream');
  }
} }));
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof z.ZodError) return res.status(400).json({ error: '输入格式不正确，请检查表单或分镜内容。', fields: error.issues.map(i => i.path.join('.')) });
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '视频不能超过 250 MB。' : '上传失败，请每次选择一个文件。' });
  const message = error instanceof Error ? error.message : '';
  const safe = /^(请上传|单张|最多|第一版支持|未读取到|视频读取失败|产品参考图)/.test(message);
  res.status(safe ? 400 : 500).json({ error: safe ? message : '操作未完成，请稍后重试。' });
});
if (process.argv.includes('--production')) {
  if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('请先运行 npm run build。');
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(port, '127.0.0.1', () => console.log(`AI-Sail Flow ready at http://127.0.0.1:${port} · ${MODEL} · Gemini ${configured() ? 'configured' : 'not configured'}`));
