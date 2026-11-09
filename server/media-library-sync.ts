import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { LibraryMedia } from '../shared/media-library';
import { dataDir, uploadDir } from './store';
import { isUserUploadFilename, listLibraryMedia, removeLibraryMedia } from './media-library';
import { compressUploadedVideo } from './video-compression';

const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
type SyncStatus = { jobId: string; status: 'running' | 'done' | 'error'; error?: string };
type SyncJob = SyncStatus & { rerun: boolean };
const jobs = new Map<string, SyncJob>();
const users = new Map<string, SyncJob>();
// One worker bounds CPU and upload memory, including simultaneous users.
let worker: Promise<void> = Promise.resolve();

async function storageSession(token: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key || !token) throw new Error('请先登录后同步云端素材。');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error('登录已过期，请重新登录后同步素材。');
  // Resolve the destination from a verified user, never from request body data.
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const storageClient = secret ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }) : client;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.VITE_SUPABASE_STORAGE_BUCKET || 'ai-sail-flow-files';
  return { userId: data.user.id, storage: storageClient.storage.from(bucket) };
}

async function cloudFile(item: LibraryMedia) {
  const original = { filename: path.join(uploadDir, item.filename!), mime: item.mime };
  if (item.kind !== 'video' || item.size < 8 * 1024 * 1024) return original;
  const directory = path.join(dataDir, 'media-library-cache');
  await fs.promises.mkdir(directory, { recursive: true });
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

async function synchronize(session: Awaited<ReturnType<typeof storageSession>>) {
  const uploaded = new Set<string>();
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await session.storage.list(session.userId, { limit: 100, offset });
    if (error) throw error;
    for (const entry of data) {
      const id = entry.name.match(/^([a-f0-9]{64})--/)?.[1];
      if (id) uploaded.add(id);
    }
    if (data.length < 100) break;
  }
  for (const item of listLibraryMedia()) {
    if (item.origin !== 'user-upload' || !isUserUploadFilename(item.filename)) continue;
    if (uploaded.has(item.id)) continue;
    const file = await cloudFile(item);
    const name = Buffer.from(item.name).toString('base64url');
    // The cloud object keeps the original source ID, even for a compressed copy.
    const filename = `${item.id}--${name}.${extensions[file.mime] || (item.kind === 'video' ? 'mp4' : 'jpg')}`;
    const stream = fs.createReadStream(file.filename);
    try {
      const { error } = await session.storage.upload(`${session.userId}/${filename}`, stream, {
        contentType: file.mime, upsert: false, duplex: 'half',
        metadata: { originalName: item.name, mediaKind: item.kind, sourceCreatedAt: item.createdAt, sourceId: item.id, origin: 'user-upload', associations: item.associations || [] },
      });
      if (error && String(error.statusCode) !== '409') throw error;
    } finally { stream.destroy(); }
  }
}

export function mediaSyncStatus(jobId: string): SyncStatus | undefined {
  const job = jobs.get(jobId);
  return job && { jobId: job.jobId, status: job.status, ...(job.error ? { error: job.error } : {}) };
}

export async function startMediaSync(token: string): Promise<SyncStatus> {
  const session = await storageSession(token);
  const existing = users.get(session.userId);
  if (existing?.status === 'running') {
    existing.rerun = true; // Include files collected while the previous pass ran.
    return mediaSyncStatus(existing.jobId)!;
  }
  const job: SyncJob = { jobId: randomUUID(), status: 'running', rerun: false };
  jobs.set(job.jobId, job); users.set(session.userId, job);
  worker = worker.catch(() => {}).then(async () => {
    try {
      do { job.rerun = false; await synchronize(session); } while (job.rerun);
      job.status = 'done';
    } catch {
      job.status = 'error';
      job.error = '素材已收录，但服务端云端同步未完成，请稍后重试。';
    } finally {
      if (users.get(session.userId) === job) users.delete(session.userId);
      // Keep completed status briefly for clients polling after a long upload.
      const timer = setTimeout(() => jobs.delete(job.jobId), 60 * 60_000);
      timer.unref();
    }
  });
  return mediaSyncStatus(job.jobId)!;
}

async function selectedCloudPaths(session: Awaited<ReturnType<typeof storageSession>>, ids: Set<string>) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await session.storage.list(session.userId, { limit: 100, offset });
    if (error) throw new Error('云端素材暂时无法读取，删除未完成，请重试。');
    for (const entry of data) {
      const id = entry.name.match(/^([a-f0-9]{64})--/)?.[1] || `cloud:${entry.name}`;
      if (ids.has(id)) paths.push(`${session.userId}/${entry.name}`);
    }
    if (data.length < 100) return paths;
  }
}

export async function deleteMediaLibraryItems(ids: string[], token: string) {
  const cloudConfigured = Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  if (!token && (cloudConfigured || ids.some(id => id.startsWith('cloud:')))) {
    throw new Error('请先登录后删除素材，以便同时清理 Supabase 中的对应文件。');
  }
  const session = token ? await storageSession(token) : null;
  // Serialize with uploads so an in-flight sync cannot recreate a deleted object.
  const deletion = worker.catch(() => {}).then(async () => {
    if (session) {
      const selected = new Set(ids);
      const paths = await selectedCloudPaths(session, selected);
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
    return { deletedIds: ids };
  });
  worker = deletion.then(() => {}, () => {});
  return deletion;
}

export function queueMediaSync(token: string) {
  if (token) void startMediaSync(token).catch(() => console.warn('Media cloud sync could not start; retry from the media library.'));
}
