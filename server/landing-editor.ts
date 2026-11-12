import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import { emptyLandingDocument, landingDocumentSchema, landingSaveSchema } from '../shared/landing-editor';

export function createLandingPageStore(dataDirectory: string) {
  const directory = path.join(dataDirectory, 'landing-editor');
  const assets = path.join(directory, 'assets');
  const incoming = path.join(directory, 'incoming');
  const documentPath = path.join(directory, 'page.json');
  fs.mkdirSync(assets, { recursive: true, mode: 0o700 });
  fs.mkdirSync(incoming, { recursive: true, mode: 0o700 });
  function read() {
    try { return landingDocumentSchema.parse(JSON.parse(fs.readFileSync(documentPath, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyLandingDocument(); throw error; }
  }
  function save(input: unknown) {
    const next = landingSaveSchema.parse(input);
    const current = read();
    if (next.revision !== current.revision) return null;
    const document = { version: 1 as const, revision: current.revision + 1, updatedAt: new Date().toISOString(), elements: next.elements };
    const temporary = `${documentPath}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, JSON.stringify(document, null, 2), { mode: 0o600 }); fs.renameSync(temporary, documentPath); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return document;
  }
  return { assets, incoming, read, save };
}
type LandingPageStore = ReturnType<typeof createLandingPageStore>;
type CanEdit = (req: Request, res: Response) => boolean;

export function registerLandingPageReadRoutes(app: Express, store: LandingPageStore) {
  app.get('/api/landing-page', (_req, res) => res.json(store.read()));
  app.get('/landing-assets/:filename', (req, res) => {
    const filename = String(req.params.filename);
    if (!/^[a-f\d-]{36}\.(?:png|jpg|webp|gif|avif|mp4|webm)$/.test(filename)) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path.join(store.assets, filename), error => { if (error && !res.headersSent) res.sendStatus(404); });
  });
}

export function registerLandingPageWriteRoutes(app: Express, store: LandingPageStore, canEdit: CanEdit) {
  app.get('/api/landing-page/access', (req, res) => res.json({ canEdit: canEdit(req, res) }));
  app.use('/api/landing-page', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !canEdit(req, res)) return res.status(403).json({ error: '当前账号没有落地页编辑权限。' });
    next();
  });
  app.put('/api/landing-page', (req, res) => {
    const input = landingSaveSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: '编辑数据无效，请检查尺寸、颜色或素材地址。', issues: input.error.issues });
    const saved = store.save(input.data);
    if (!saved) return res.status(409).json({ error: '页面已在其他窗口保存。当前草稿仍保留，请先导出草稿，再刷新并合并修改。' });
    res.json(saved);
  });
  const upload = multer({ dest: store.incoming, limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 0 } });
  app.post('/api/landing-page/assets', (req, res) => {
    upload.single('file')(req, res, async error => {
      if (error) return res.status(400).json({ error: '素材上传失败：图片最多 10 MB，视频最多 100 MB。' });
      if (!req.file) return res.status(400).json({ error: '请选择图片或视频文件。' });
      try {
        const type = await fileTypeFromFile(req.file.path);
        const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
        const extension = type && extensions[type.mime];
        if (!extension) return res.status(400).json({ error: '请选择 PNG、JPG、WebP、GIF、AVIF 图片，或 MP4、WebM 视频。' });
        const kind = type!.mime.startsWith('image/') ? 'image' : 'video';
        if (kind === 'image' && req.file.size > 10 * 1024 * 1024) return res.status(400).json({ error: '图片不能超过 10 MB。' });
        const filename = `${randomUUID()}.${extension}`;
        fs.renameSync(req.file.path, path.join(store.assets, filename));
        res.status(201).json({ url: `/landing-assets/${filename}`, kind, name: req.file.originalname });
      } catch { res.status(500).json({ error: '素材保存失败，请重试。' }); }
      finally { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); }
    });
  });
}
