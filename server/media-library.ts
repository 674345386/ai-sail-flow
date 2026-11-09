import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import type { Asset } from '../shared/domain';
import type { LibraryMedia, LibraryMediaAssociation } from '../shared/media-library';
import { dataDir, uploadDir, getProject, listProjects, getWorkspaceProject, defaultProjectId } from './store';

const catalogFile = path.join(dataDir, 'media-library.json');
type StoredLibraryMedia = LibraryMedia & { deletedAt?: string; aliases?: string[]; purgePending?: boolean };
const media = new Map<string, StoredLibraryMedia>();
// Multer assigns this format only to explicit user uploads. Task images and
// rendered outputs have separate prefixes and must never enter this catalog.
export function isUserUploadFilename(filename: string | undefined): boolean {
  return typeof filename === 'string' && /^[a-f0-9]{32}$/.test(filename);
}
if (fs.existsSync(catalogFile)) {
  const records: StoredLibraryMedia[] = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  for (const record of records) if (/^[a-f0-9]{64}$/.test(record.id) && isUserUploadFilename(record.filename)) media.set(record.id, { ...record, origin: 'user-upload' });
  // Repair old automatic Agent-image entries without deleting the task files.
  if (records.length !== media.size || records.some(record => record.origin !== 'user-upload')) persist();
}
function persist() {
  const temporary = `${catalogFile}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify([...media.values()]), { mode: 0o600 });
  fs.renameSync(temporary, catalogFile);
}
async function fileHash(filename: string) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join(uploadDir, filename))) hash.update(chunk);
  return hash.digest('hex');
}
export async function collectUploadedAsset(asset: Asset, createdAt = new Date().toISOString(), restoreDeleted = true) {
  if (!isUserUploadFilename(asset.filename)) throw new Error('任务素材仅保存在本机，不能自动收录到素材库。');
  const id = await fileHash(asset.filename);
  const existing = media.get(id);
  if (existing?.deletedAt && !restoreDeleted) return existing;
  if (existing && !existing.deletedAt && fs.existsSync(path.join(uploadDir, existing.filename!))) {
    if (asset.filename !== existing.filename && !existing.aliases?.includes(asset.filename)) {
      existing.aliases = [...(existing.aliases || []), asset.filename]; persist();
    }
    return existing;
  }
  const item: LibraryMedia = { ...asset, id, kind: asset.kind === 'video' ? 'video' : 'image', createdAt, origin: 'user-upload' };
  media.set(id, item); persist();
  return item;
}
export function listLibraryMedia(): LibraryMedia[] {
  const records = [...media.values()].filter(item => !item.deletedAt && item.origin === 'user-upload' && isUserUploadFilename(item.filename) && fs.existsSync(path.join(uploadDir, item.filename!)));
  const byFilename = new Map(records.flatMap(item => [item.filename!, ...(item.aliases || [])].map(filename => [filename, item.id] as const)));
  const associations = new Map<string, LibraryMediaAssociation[]>();
  for (const summary of listProjects()) {
    const creative = getProject(summary.id)!;
    if (creative.isDemo) continue;
    const projectId = creative.parentProjectId || defaultProjectId;
    const projectTitle = getWorkspaceProject(projectId)?.title || '未命名项目';
    for (const id of new Set(creative.assets.map(asset => byFilename.get(asset.filename)))) {
      if (!id) continue;
      const entries = associations.get(id) || [];
      entries.push({ projectId, projectTitle, creativeId: creative.id, creativeTitle: creative.title || '未命名创意' });
      associations.set(id, entries);
    }
  }
  return records.map(({ aliases, deletedAt, purgePending, ...item }) => ({ ...item, associations: associations.get(item.id) || [] })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getLibraryMedia(id: string) { return listLibraryMedia().find(item => item.id === id); }
export function libraryMime(filename: string) { return [...media.values()].find(item => item.filename === filename)?.mime; }

export function removeLibraryMedia(ids: string[]) {
  const deletedAt = new Date().toISOString();
  const previous = new Map<string, StoredLibraryMedia>();
  for (const id of new Set(ids)) {
    const item = media.get(id);
    if (item) { previous.set(id, item); media.set(id, { ...item, deletedAt: item.deletedAt || deletedAt, purgePending: true }); }
  }
  if (!previous.size) return;
  // Persist deletion intent before unlinking. A failed cleanup can be retried,
  // including after restart, without startup recovery collecting the files again.
  try { persist(); }
  catch (error) { for (const [id, item] of previous) media.set(id, item); throw error; }
  try {
    for (const item of previous.values()) {
      for (const filename of new Set([item.filename, ...(item.aliases || [])])) {
        if (!isUserUploadFilename(filename)) continue;
        fs.rmSync(path.join(uploadDir, filename!), { force: true });
        fs.rmSync(path.join(uploadDir, `${filename}.jpg`), { force: true });
      }
    }
    const cache = path.join(dataDir, 'media-library-cache');
    if (fs.existsSync(cache)) for (const filename of fs.readdirSync(cache)) {
      const id = /^([a-f0-9]{64})\.(?:mp4|[a-f0-9-]{36}\.tmp)$/.exec(filename)?.[1];
      if (id && previous.has(id)) fs.rmSync(path.join(cache, filename), { force: true });
    }
    for (const id of previous.keys()) media.set(id, { ...media.get(id)!, purgePending: false });
    persist();
  } catch { throw new Error('服务器素材文件清理未完成，请重试删除。'); }
}

// Recover existing uploads, including files retained after removal from a creative.
export async function initializeMediaLibrary() {
  // Only resume permanent deletions explicitly requested through this flow.
  // Legacy tombstones did not authorize removing the physical files.
  removeLibraryMedia([...media.values()].filter(item => item.purgePending).map(item => item.id));
  const known = new Set([...media.values()].flatMap(item => [item.filename, ...(item.aliases || [])]));
  for (const summary of listProjects()) {
    const project = getProject(summary.id)!;
    if (project.isDemo) continue;
    for (const asset of project.assets) {
      if (!isUserUploadFilename(asset.filename) || known.has(asset.filename) || !fs.existsSync(path.join(uploadDir, asset.filename))) continue;
      await collectUploadedAsset(asset, fs.statSync(path.join(uploadDir, asset.filename)).birthtime.toISOString(), false); known.add(asset.filename);
    }
  }
  for (const filename of fs.readdirSync(uploadDir)) {
    if (known.has(filename) || !isUserUploadFilename(filename)) continue;
    const absolute = path.join(uploadDir, filename);
    const type = await fileTypeFromFile(absolute).catch(() => undefined);
    if (!type || !['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'].includes(type.mime)) continue;
    const info = fs.statSync(absolute), video = type.mime.startsWith('video/');
    await collectUploadedAsset({ id: randomUUID(), kind: video ? 'video' : 'product', filename,
      name: `历史上传-${filename.slice(0, 8)}.${type.ext}`, mime: type.mime, size: info.size, url: `/media/${filename}`,
      ...(video && fs.existsSync(`${absolute}.jpg`) ? { thumbnail: `/media/${filename}.jpg` } : {}) }, info.birthtime.toISOString(), false);
  }
}
