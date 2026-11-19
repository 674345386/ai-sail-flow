import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import type { Asset } from '../shared/domain';
import type { LibraryMedia, LibraryMediaAssociation, LibraryPage, LibraryQuery, MediaBackup } from '../shared/media-library';
import { getProject, listProjects, listProjectIds, getWorkspaceProject, defaultProjectId } from './store';
import { workspaceDirectory, workspacePath, workspaceResource, workspaceUploadDir, workspaceUploadPath } from './workspace-storage';

type StoredLibraryMedia = LibraryMedia & { deletedAt?: string; aliases?: string[]; purgePending?: boolean };
const catalog = workspaceResource(() => {
  const filename = path.join(workspaceDirectory(), 'media-library.json');
  const entries = new Map<string, StoredLibraryMedia>();
  if (fs.existsSync(filename)) {
    const records: StoredLibraryMedia[] = JSON.parse(fs.readFileSync(filename, 'utf8'));
    for (const record of records) if (/^[a-f0-9]{64}$/.test(record.id) && isUserUploadFilename(record.filename)) entries.set(record.id, { ...record, origin: 'user-upload' });
    // Repair old automatic Agent-image entries without deleting the task files.
    if (records.length !== entries.size || records.some(record => record.origin !== 'user-upload')) writeCatalog(filename, entries);
  }
  return { filename, entries };
});
// Multer assigns this format only to explicit user uploads. Task images and
// rendered outputs have separate prefixes and must never enter this catalog.
export function isUserUploadFilename(filename: string | undefined): boolean {
  return typeof filename === 'string' && /^[a-f0-9]{32}$/.test(filename);
}
function writeCatalog(catalogFile: string, media: Map<string, StoredLibraryMedia>) {
  const temporary = `${catalogFile}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify([...media.values()]), { mode: 0o600 });
  fs.renameSync(temporary, catalogFile);
}
function persist() { const { filename, entries } = catalog(); writeCatalog(filename, entries); }
async function fileHash(filename: string) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(workspaceUploadPath(filename))) hash.update(chunk);
  return hash.digest('hex');
}
export async function collectUploadedAsset(asset: Asset, createdAt = new Date().toISOString(), restoreDeleted = true) {
  if (!isUserUploadFilename(asset.filename)) throw new Error('任务素材仅保存在本机，不能自动收录到素材库。');
  const id = await fileHash(asset.filename);
  const { entries: media } = catalog();
  const existing = media.get(id);
  if (existing?.deletedAt && !restoreDeleted) return existing;
  if (existing && !existing.deletedAt && fs.existsSync(workspaceUploadPath(existing.filename!))) {
    if (asset.filename !== existing.filename && !existing.aliases?.includes(asset.filename)) {
      existing.aliases = [...(existing.aliases || []), asset.filename]; persist();
    }
    return existing;
  }
  const item: LibraryMedia = { ...asset, id, kind: asset.kind === 'video' ? 'video' : 'image', createdAt, origin: 'user-upload' };
  media.set(id, item); persist();
  return item;
}
export function availableLocalMedia() {
  const { entries: media } = catalog();
  const directory = workspaceUploadDir();
  return [...media.values()].filter(item => !item.deletedAt && item.origin === 'user-upload' && isUserUploadFilename(item.filename) && fs.existsSync(path.join(directory, item.filename!)));
}
function associate(records: StoredLibraryMedia[]): LibraryMedia[] {
  const byFilename = new Map(records.flatMap(item => [item.filename!, ...(item.aliases || [])].map(filename => [filename, item.id] as const)));
  const associations = new Map<string, LibraryMediaAssociation[]>();
  for (const id of byFilename.size ? listProjectIds() : []) {
    const creative = getProject(id)!;
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
  return records.map(({ aliases, deletedAt, purgePending, ...item }) => ({ ...item, associations: associations.get(item.id) || [] }));
}
export function listLibraryMedia() { return associate(availableLocalMedia()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function localLibraryItem(id: string) {
  const item = catalog().entries.get(id);
  if (item && !item.deletedAt && item.filename && fs.existsSync(workspaceUploadPath(item.filename))) return item;
}
export function getLibraryMedia(id: string) {
  const item = localLibraryItem(id);
  if (!item) return;
  const [details] = associate([item]);
  return item.kind === 'video' && !details.thumbnail ? { ...details, thumbnail: thumbnailUrl(id) } : details;
}
export function mediaWasDeleted(id: string) { return Boolean(catalog().entries.get(id)?.deletedAt); }
export function libraryMime(filename: string) { return [...catalog().entries.values()].find(item => item.filename === filename)?.mime; }

export type CloudLibraryMedia = LibraryMedia & { cloudPath: string; coverPath?: string };
type CloudCatalog = { initialized: boolean; items: CloudLibraryMedia[]; failedIds: string[]; queuedIds?: string[] };
const cloudCatalog = workspaceResource(() => {
  const filename = path.join(workspaceDirectory(), 'media-library-cloud.json');
  const data: CloudCatalog = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : { initialized: false, items: [], failedIds: [] };
  return { filename, initialized: data.initialized, items: new Map(data.items.map(item => [item.id, item])),
    failed: new Set(data.failedIds), queued: new Set(data.queuedIds) };
});
export function cloudLibraryInitialized() { return cloudCatalog().initialized; }
export function cloudLibraryItem(id: string) { return mediaWasDeleted(id) ? undefined : cloudCatalog().items.get(id); }
export function mediaBackupFailed(id: string) { return cloudCatalog().failed.has(id); }
export function queuedMediaBackups() { return cloudCatalog().queued; }
export function updateCloudLibrary(change: { replace?: CloudLibraryMedia[]; uploaded?: CloudLibraryMedia; queued?: string; settled?: string; failed?: string; deleted?: readonly string[] }) {
  const index = cloudCatalog();
  const initialized = index.initialized || Boolean(change.replace);
  const items = change.replace ? new Map(change.replace.map(item => [item.id, item])) : new Map(index.items);
  const failed = new Set(index.failed);
  const queued = new Set(index.queued);
  if (change.uploaded) items.set(change.uploaded.id, change.uploaded);
  if (change.queued) queued.add(change.queued);
  if (change.settled) queued.delete(change.settled);
  if (change.failed) { failed.add(change.failed); queued.delete(change.failed); }
  for (const id of items.keys()) {
    failed.delete(id);
    if (items.get(id)?.coverPath) queued.delete(id);
  }
  for (const id of change.deleted || []) { items.delete(id); failed.delete(id); queued.delete(id); }
  if (change.uploaded) queued.delete(change.uploaded.id);
  const temporary = `${index.filename}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ initialized, items: [...items.values()], failedIds: [...failed], queuedIds: [...queued] }), { mode: 0o600 });
  fs.renameSync(temporary, index.filename);
  Object.assign(index, { initialized, items, failed, queued });
}

type MediaOrderKey = Pick<LibraryMedia, 'id' | 'name' | 'createdAt'>;
const thumbnailUrl = (id: string) => `/media/library/${encodeURIComponent(id)}/thumbnail`;
const originalUrl = (id: string) => `/media/library/${encodeURIComponent(id)}/original`;
function queryLibrary(options: LibraryQuery) {
  const local = new Map(availableLocalMedia().map(item => [item.id, item]));
  const cloud = cloudCatalog().items;
  const combined = new Map<string, LibraryMedia>(cloud);
  for (const [id, item] of local) combined.set(id, item);
  const counts = { all: 0, image: 0, video: 0 };
  const matches: LibraryMedia[] = [];
  const query = options.query?.trim().toLocaleLowerCase() || '';
  for (const item of combined.values()) {
    if (mediaWasDeleted(item.id)) continue;
    counts.all++;
    counts[item.kind]++;
    if ((!options.kind || item.kind === options.kind) && item.name.toLocaleLowerCase().includes(query)) matches.push(item);
  }
  return { counts, matches, local, cloud };
}
export function librarySelection(options: LibraryQuery) {
  const { matches } = queryLibrary(options);
  return { items: matches.slice(0, 1000).map(({ id, name }) => ({ id, name })), total: matches.length };
}
export function libraryPage(options: LibraryQuery, backup: (id: string) => MediaBackup | undefined, indexing: boolean, warning?: string): LibraryPage {
  const { counts, matches, local, cloud } = queryLibrary(options);
  const compare = (a: MediaOrderKey, b: MediaOrderKey) =>
    (options.sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : (options.sort === 'oldest' ? 1 : -1) * a.createdAt.localeCompare(b.createdAt))
    || a.id.localeCompare(b.id);
  let cursor: MediaOrderKey | undefined;
  if (options.cursor) {
    try {
      const value = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8'));
      if (typeof value?.id === 'string' && typeof value.name === 'string' && typeof value.createdAt === 'string') cursor = value;
    } catch { /* An obsolete cursor starts a fresh page. */ }
  }
  const limit = options.limit || 40;
  const page = matches.filter(item => !cursor || compare(item, cursor) > 0).sort(compare).slice(0, limit + 1);
  const last = page.length > limit ? page[limit - 1] : undefined;
  const nextCursor = last
    ? Buffer.from(JSON.stringify({ id: last.id, name: last.name, createdAt: last.createdAt })).toString('base64url')
    : undefined;
  if (last) page.pop();
  const localDetails = new Map(associate(page.flatMap(item => local.get(item.id) || [])).map(item => [item.id, item]));
  const items = page.map(item => {
    const details = localDetails.get(item.id);
    const remote = cloud.get(item.id);
    if (details) return { ...details, thumbnail: thumbnailUrl(item.id), cloudPath: remote?.cloudPath, backup: backup(item.id) };
    const { coverPath, ...fields } = remote!;
    return { ...fields, url: originalUrl(item.id), thumbnail: coverPath || item.kind === 'image' ? thumbnailUrl(item.id) : undefined, backup: 'synced' as const };
  });
  return { items, counts, matchingTotal: matches.length, nextCursor, indexing, warning };
}

export function removeLibraryMedia(ids: string[]) {
  const { entries: media } = catalog();
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
        fs.rmSync(workspaceUploadPath(filename!), { force: true });
        fs.rmSync(workspaceUploadPath(`${filename}.jpg`), { force: true });
      }
    }
    const cache = workspacePath('media-library-cache');
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
  const { entries: media } = catalog();
  // Only resume permanent deletions explicitly requested through this flow.
  // Legacy tombstones did not authorize removing the physical files.
  removeLibraryMedia([...media.values()].filter(item => item.purgePending).map(item => item.id));
  const known = new Set([...media.values()].flatMap(item => [item.filename, ...(item.aliases || [])]));
  for (const summary of listProjects()) {
    const project = getProject(summary.id)!;
    if (project.isDemo) continue;
    for (const asset of project.assets) {
      if (asset.kind === 'audio') continue;
      if (!isUserUploadFilename(asset.filename) || known.has(asset.filename) || !fs.existsSync(workspaceUploadPath(asset.filename))) continue;
      await collectUploadedAsset(asset, fs.statSync(workspaceUploadPath(asset.filename)).birthtime.toISOString(), false); known.add(asset.filename);
    }
  }
  for (const filename of fs.readdirSync(workspaceUploadDir())) {
    if (known.has(filename) || !isUserUploadFilename(filename)) continue;
    const absolute = workspaceUploadPath(filename);
    const type = await fileTypeFromFile(absolute).catch(() => undefined);
    if (!type || !['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'].includes(type.mime)) continue;
    const info = fs.statSync(absolute), video = type.mime.startsWith('video/');
    await collectUploadedAsset({ id: randomUUID(), kind: video ? 'video' : 'product', filename,
      name: `历史上传-${filename.slice(0, 8)}.${type.ext}`, mime: type.mime, size: info.size, url: `/media/${filename}`,
      ...(video && fs.existsSync(`${absolute}.jpg`) ? { thumbnail: `/media/${filename}.jpg` } : {}) }, info.birthtime.toISOString(), false);
  }
}
