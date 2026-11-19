import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cloudMediaFolder, type LibraryMedia, type LibraryMediaAssociation, type MediaBackup } from '../shared/media-library';
import { withWorkspaceAccount, workspaceAccountId, workspaceDirectory, workspaceUploadPath } from './workspace-storage';
import { availableLocalMedia, cloudLibraryInitialized, cloudLibraryItem, getLibraryMedia, mediaBackupFailed, mediaWasDeleted, queuedMediaBackups, removeLibraryMedia, updateCloudLibrary, type CloudLibraryMedia } from './media-library';
import { ensureMediaThumbnail } from './media';
import { compressUploadedVideo } from './video-compression';

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
type SyncStatus = { jobId: string; status: 'running' | 'done' | 'error'; error?: string };
type SyncJob = SyncStatus & { userId: string; pending: Set<string>; activeId?: string; scan?: 'index' | 'repair'; indexing: boolean };
const indexFailures = new Set<string>();
const jobs = new Map<string, SyncJob>();
const users = new Map<string, SyncJob>();
// One worker bounds CPU and upload memory, including simultaneous users.
let worker: Promise<void> = Promise.resolve();

function storageSession(token: string, useServerKey = true) {
  const userId = workspaceAccountId();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const secret = useServerKey && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId || !url || !(secret || key && token)) throw new Error('请先登录后同步云端素材。');
  // The protected API and media routes establish the verified workspace before calling here.
  const client = createClient(url, secret || key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      ...(secret ? {} : { headers: { Authorization: `Bearer ${token}` } }),
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(useServerKey ? 300000 : 10000) }),
    },
  });
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.VITE_SUPABASE_STORAGE_BUCKET || 'ai-sail-flow-files';
  return { userId, storage: client.storage.from(bucket) };
}
type StorageSession = ReturnType<typeof storageSession>;

async function cloudFile(item: LibraryMedia) {
  const original = { filename: workspaceUploadPath(item.filename!), mime: item.mime };
  if (item.kind !== 'video' || item.size < 8 * 1024 * 1024) return original;
  const directory = workspaceDirectory('media-library-cache');
  const filename = path.join(directory, `${item.id}.mp4`);
  if (fs.existsSync(filename)) return { filename, mime: 'video/mp4' };
  const temporary = path.join(directory, `${item.id}.${randomUUID()}.tmp`);
  try {
    // compressUploadedVideo replaces its input; give it an independent copy.
    await fs.promises.copyFile(original.filename, temporary);
    const size = await compressUploadedVideo(temporary, item.size);
    if (size >= item.size) return original;
    await fs.promises.rename(temporary, filename);
    return { filename, mime: 'video/mp4' };
  } catch {
    // A failed optional transcode must not prevent backing up a valid original.
    console.warn(`Media cloud compression failed for ${item.id}; syncing original.`);
    return original;
  } finally { await fs.promises.unlink(temporary).catch(() => {}); }
}

const assetId = (name: string) => /^([a-f0-9]{64})--/.exec(name)?.[1] || `cloud:${name}`;
const safeObjectName = (name: string) => name && name !== '.' && name !== '..' && !/[/\\]/.test(name);
const coverFolder = (userId: string) => `${cloudMediaFolder(userId)}/previews`;
const coverObject = (userId: string, id: string) => `${coverFolder(userId)}/${id}.jpg`;

async function* objects(storage: StorageSession['storage'], folder: string) {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }, { signal: AbortSignal.timeout(10000) });
    if (error) throw error;
    yield* data;
    if (data.length < 100) return;
  }
}

async function reconcileCloudCatalog({ storage, userId }: StorageSession) {
  const folder = cloudMediaFolder(userId);
  const covers = new Set<string>();
  for await (const item of objects(storage, coverFolder(userId))) {
    if (item.id) covers.add(item.name);
  }
  const items: CloudLibraryMedia[] = [];
  for await (const entry of objects(storage, folder)) {
    if (!entry.id || !safeObjectName(entry.name)) continue;
    const mime = String(entry.metadata?.mimetype || '');
    const kind = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(entry.name) ? 'image'
      : mime.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(entry.name) ? 'video' : undefined;
    if (!kind) continue;
    const id = assetId(entry.name);
    if (mediaWasDeleted(id)) continue;
    const cloudPath = `${folder}/${entry.name}`;
    const metadata = (entry as typeof entry & { user_metadata?: Record<string, unknown> }).user_metadata || entry.metadata;
    const encodedName = /^[a-f0-9]{64}--(.+)\.[^.]+$/.exec(entry.name)?.[1];
    const name = typeof metadata?.originalName === 'string' && metadata.originalName
      ? metadata.originalName : encodedName ? Buffer.from(encodedName, 'base64url').toString('utf8') : entry.name.replace(/^[a-f0-9-]{36}-/i, '');
    const sourceDate = typeof metadata?.sourceCreatedAt === 'string' ? Date.parse(metadata.sourceCreatedAt) : NaN;
    const created = Number.isFinite(sourceDate) ? sourceDate : Date.parse(entry.created_at || '');
    const createdAt = Number.isFinite(created) ? new Date(created).toISOString() : '';
    const associations = Array.isArray(metadata?.associations) ? metadata.associations.filter((value): value is LibraryMediaAssociation =>
      value && typeof value === 'object' && ['projectId', 'projectTitle', 'creativeId', 'creativeTitle'].every(key => typeof value[key] === 'string')) : undefined;
    items.push({ id, kind, name, mime: mime || (kind === 'image' ? 'image/jpeg' : 'video/mp4'),
      size: Number(entry.metadata?.size || 0), createdAt, url: '', cloudPath, associations,
      coverPath: covers.has(`${id}.jpg`) ? coverObject(userId, id) : undefined });
  }
  updateCloudLibrary({ replace: items });
}

async function backupItem({ storage, userId }: StorageSession, item: LibraryMedia) {
  const existing = cloudLibraryItem(item.id);
  let archived = existing;
  if (!archived) {
    const file = await cloudFile(item);
    const name = Buffer.from(item.name).toString('base64url');
    const cloudPath = `${cloudMediaFolder(userId)}/${item.id}--${name}.${extensions[file.mime] || (item.kind === 'video' ? 'mp4' : 'jpg')}`;
    const stream = fs.createReadStream(file.filename);
    try {
      const { error } = await storage.upload(cloudPath, stream, {
        contentType: file.mime, upsert: false, duplex: 'half',
        metadata: { originalName: item.name, mediaKind: item.kind, sourceCreatedAt: item.createdAt, sourceId: item.id, origin: 'user-upload', associations: item.associations || [] },
      });
      if (error && String(error.statusCode) !== '409') throw error;
    } finally { stream.destroy(); }
    archived = { id: item.id, kind: item.kind, name: item.name, mime: file.mime, size: (await fs.promises.stat(file.filename)).size,
      createdAt: item.createdAt, url: '', cloudPath, associations: item.associations };
    updateCloudLibrary({ uploaded: archived });
  }
  if (archived.coverPath) return;
  try {
    const thumbnail = await ensureMediaThumbnail(item.filename!, item.duration);
    if (!thumbnail) return;
    const coverPath = coverObject(userId, item.id);
    const { error } = await storage.upload(coverPath, await fs.promises.readFile(thumbnail), { contentType: 'image/jpeg', upsert: false });
    if (!error || String(error.statusCode) === '409') updateCloudLibrary({ uploaded: { ...archived, coverPath } });
  } catch { /* An unavailable rendition does not invalidate the original backup. */ }
}

export function mediaSyncStatus(jobId: string): SyncStatus | undefined {
  const job = jobs.get(jobId);
  if (!job || job.userId !== workspaceAccountId()) return;
  return { jobId: job.jobId, status: job.status, ...(job.error ? { error: job.error } : {}) };
}

export function mediaBackupState(id: string): MediaBackup | undefined {
  if (cloudLibraryItem(id)) return 'synced';
  const job = users.get(workspaceAccountId() || '');
  if (job?.status === 'running' && (job.activeId === id || job.pending.has(id))) return 'pending';
  if (mediaBackupFailed(id)) return 'failed';
}

function schedule(session: StorageSession, scan?: SyncJob['scan'], ids: Iterable<string> = []) {
  const { userId } = session;
  const existing = users.get(userId);
  if (existing?.status === 'running') {
    if (scan === 'repair' || scan === 'index' && !existing.scan && !existing.indexing) existing.scan = scan;
    for (const id of ids) if (id !== existing.activeId) existing.pending.add(id);
    return existing;
  }
  const job: SyncJob = { jobId: randomUUID(), userId, status: 'running', pending: new Set(ids), scan, indexing: false };
  jobs.set(job.jobId, job); users.set(userId, job);
  worker = worker.catch(() => {}).then(() => withWorkspaceAccount(userId, async () => {
    let failed = false;
    try {
      while (job.scan || job.pending.size) {
        const scanMode = job.scan;
        job.scan = undefined;
        if (scanMode) {
          job.indexing = true;
          try {
            await reconcileCloudCatalog(session);
            indexFailures.delete(userId);
            if (scanMode === 'repair') {
              for (const item of availableLocalMedia()) if (!cloudLibraryItem(item.id)?.coverPath) job.pending.add(item.id);
            }
          } catch {
            indexFailures.add(userId);
            failed = true;
          } finally { job.indexing = false; }
        }
        const next = job.pending.values().next().value;
        if (!next) continue;
        job.pending.delete(next);
        job.activeId = next;
        const item = getLibraryMedia(next);
        if (item) {
          try { await backupItem(session, item); }
          catch {
            updateCloudLibrary({ failed: next });
            failed = true;
          }
        }
        if (queuedMediaBackups().has(next)) updateCloudLibrary({ settled: next });
        job.activeId = undefined;
      }
    } catch { failed = true; }
    finally {
      job.status = failed ? 'error' : 'done';
      if (failed) job.error = '部分素材的云端同步未完成，请稍后重试。';
      if (users.get(userId) === job) users.delete(userId);
      const timer = setTimeout(() => jobs.delete(job.jobId), 60 * 60_000);
      timer.unref();
    }
  }));
  return job;
}

export function startMediaSync(token: string): SyncStatus {
  return mediaSyncStatus(schedule(storageSession(token), 'repair').jobId)!;
}

export function cloudCatalogStatus() {
  const userId = workspaceAccountId();
  const job = users.get(userId || '');
  return { indexing: Boolean(!cloudLibraryInitialized() && (job?.indexing || job?.scan)), warning: userId && indexFailures.has(userId) ? '部分云端素材暂时无法读取，请同步素材后重试。' : undefined };
}

// Import historical cloud-only records in the background on the first visit.
export function ensureCloudCatalog(token: string) {
  const userId = workspaceAccountId();
  if (userId && !cloudLibraryInitialized() && !indexFailures.has(userId)) schedule(storageSession(token), 'index');
  return cloudCatalogStatus();
}

export async function cloudMediaUrl(id: string, thumbnail: boolean, token: string) {
  const item = cloudLibraryItem(id);
  if (!item) return;
  const cloudPath = thumbnail ? item.coverPath || (item.kind === 'image' ? item.cloudPath : undefined) : item.cloudPath;
  if (!cloudPath) return;
  const { data, error } = await storageSession(token, false).storage.createSignedUrl(cloudPath, 300);
  if (error) throw error;
  return data.signedUrl;
}

async function selectedCloudPaths(session: StorageSession, ids: Set<string>) {
  const folder = cloudMediaFolder(session.userId);
  const paths: string[] = [];
  for await (const entry of objects(session.storage, folder)) {
    if (entry.id && safeObjectName(entry.name) && ids.has(assetId(entry.name))) paths.push(`${folder}/${entry.name}`);
  }
  for await (const entry of objects(session.storage, coverFolder(session.userId))) {
    if (entry.id && entry.name.endsWith('.jpg') && ids.has(entry.name.slice(0, -4))) paths.push(`${coverFolder(session.userId)}/${entry.name}`);
  }
  return paths;
}

export async function deleteMediaLibraryItems(ids: string[], token: string) {
  const cloudConfigured = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  if (!token && (cloudConfigured || ids.some(id => id.startsWith('cloud:')))) {
    throw new Error('请先登录后删除素材，以便同时清理 Supabase 中的对应文件。');
  }
  const session = token ? storageSession(token) : null;
  // Serialize with uploads so an in-flight sync cannot recreate a deleted object.
  const deletion = worker.catch(() => {}).then(async () => {
    if (session) {
      const selected = new Set(ids);
      const paths = await selectedCloudPaths(session, selected).catch(() => { throw new Error('云端素材暂时无法读取，删除未完成，请重试。'); });
      for (let offset = 0; offset < paths.length; offset += 100) {
        const { error } = await session.storage.remove(paths.slice(offset, offset + 100));
        if (error) throw new Error('云端素材删除未完成，请重试。');
      }
      // Storage RLS can silently skip objects even when remove returns no error.
      if (paths.length && (await selectedCloudPaths(session, selected)).length) {
        throw new Error('Supabase 中的对应文件仍存在，请检查存储删除权限后重试。');
      }
    }
    removeLibraryMedia(ids);
    if (session) updateCloudLibrary({ deleted: ids });
    return { deletedIds: ids };
  });
  worker = deletion.then(() => {}, () => {});
  return deletion;
}

export function queueMediaSync(token: string, id: string) {
  if (!token || !workspaceAccountId()) return;
  try {
    if (cloudLibraryItem(id)?.coverPath) return;
    updateCloudLibrary({ queued: id });
    const scan = !cloudLibraryInitialized() && !indexFailures.has(workspaceAccountId()!) ? 'index' : undefined;
    schedule(storageSession(token), scan, queuedMediaBackups());
  }
  catch { console.warn('Media cloud sync could not start; retry from the media library.'); }
}

export function resumeMediaBackups(token: string) {
  try {
    const pending = queuedMediaBackups();
    if (pending.size) schedule(storageSession(token), cloudLibraryInitialized() ? undefined : 'index', pending);
  }
  catch { console.warn('Media cloud sync could not resume; retry from the media library.'); }
}
