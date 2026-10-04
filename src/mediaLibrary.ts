import type { User } from '@supabase/supabase-js';
import type { LibraryMedia, MediaKind } from '../shared/media-library';
import { api } from './api';
import { supabase } from './auth';

const bucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET?.trim() || 'ai-sail-flow-files';
const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
type CloudObject = { name: string; id: string | null; created_at: string | null; metadata: Record<string, unknown> | null };
export function mediaChanged() { window.dispatchEvent(new Event('media-library-changed')); }
function encodedName(name: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(name))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cloudTitle(name: string) {
  const encoded = name.match(/^[a-f0-9]{64}--(.+)\.[^.]+$/)?.[1];
  if (encoded) {
    try { return new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))); } catch { /* Keep legacy filenames readable. */ }
  }
  return name.replace(/^[a-f0-9-]{36}-/i, '');
}
function cloudKind(item: CloudObject): MediaKind | null {
  const mime = String(item.metadata?.mimetype || '');
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(item.name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(item.name)) return 'video';
  return null;
}
async function cloudObjects(user: User) {
  if (!supabase) return [];
  const objects: CloudObject[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from(bucket).list(user.id, { limit: 100, offset, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) throw error;
    objects.push(...data as CloudObject[]);
    if (data.length < 100) return objects.filter(item => item.id && cloudKind(item));
  }
}
function cloudId(object: CloudObject) { return object.name.match(/^[a-f0-9]{64}(?=--)/)?.[0] || `cloud:${object.name}`; }

export async function loadMediaLibrary(user: User | null, onLocal?: (items: LibraryMedia[]) => void) {
  const localRequest = api<LibraryMedia[]>('/api/media-library').then(items => { onLocal?.(items); return items; });
  const [local, remote] = await Promise.allSettled([localRequest, user ? cloudObjects(user) : Promise.resolve([])]);
  if (local.status === 'rejected' && remote.status === 'rejected') throw new Error('素材库暂时无法读取，请稍后重试。');
  const items = new Map<string, LibraryMedia>((local.status === 'fulfilled' ? local.value : []).map(item => [item.id, item]));
  let warning = local.status === 'rejected' ? '当前设备的素材暂时无法读取。' : remote.status === 'rejected' ? '云端暂时无法连接，当前设备素材仍可使用。' : '';
  if (remote.status === 'fulfilled' && user && supabase) {
    for (let offset = 0; offset < remote.value.length; offset += 100) {
      const entries = remote.value.slice(offset, offset + 100);
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(entries.map(item => `${user.id}/${item.name}`), 3600);
      if (error) { warning = '部分云端素材暂时无法预览。'; continue; }
      entries.forEach((entry, index) => {
        const id = cloudId(entry), existing = items.get(id), cloudPath = `${user.id}/${entry.name}`;
        if (existing) { items.set(id, { ...existing, cloudPath }); return; }
        const url = data?.[index]?.signedUrl;
        if (!url) return;
        const kind = cloudKind(entry)!;
        items.set(id, { id, kind, name: cloudTitle(entry.name), mime: String(entry.metadata?.mimetype || (kind === 'image' ? 'image/jpeg' : 'video/mp4')),
          size: Number(entry.metadata?.size || 0), createdAt: entry.created_at || '', url, cloudPath });
      });
    }
  }
  return { items: [...items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), warning };
}

const syncJobs = new Map<string, Promise<void>>();
export function syncMediaLibrary(user: User | null): Promise<void> {
  if (!supabase || !user) return Promise.resolve();
  const previous = syncJobs.get(user.id) || Promise.resolve();
  const job = previous.catch(() => {}).then(async () => {
    const [local, cloud] = await Promise.all([api<LibraryMedia[]>('/api/media-library'), cloudObjects(user)]);
    const uploaded = new Set(cloud.map(cloudId));
    for (const item of local) {
      if (uploaded.has(item.id)) continue;
      const { data: session } = await supabase!.auth.getSession();
      if (session.session?.user.id !== user.id) return;
      const response = await fetch(item.url);
      if (!response.ok) throw new Error('读取已上传素材失败。');
      const file = await response.blob();
      const filename = `${item.id}--${encodedName(item.name)}.${mimeExtensions[item.mime] || (item.kind === 'image' ? 'jpg' : 'mp4')}`;
      const { error } = await supabase!.storage.from(bucket).upload(`${user.id}/${filename}`, file, { contentType: item.mime, upsert: false,
        metadata: { originalName: item.name, mediaKind: item.kind, sourceCreatedAt: item.createdAt } });
      if (error && String(error.statusCode) !== '409') throw new Error('素材已收录到当前设备，但云端同步未完成，请稍后重试。');
    }
    mediaChanged();
  });
  syncJobs.set(user.id, job);
  void job.finally(() => { if (syncJobs.get(user.id) === job) syncJobs.delete(user.id); }).catch(() => {});
  return job;
}

export async function uploadLibraryFiles(files: File[]) {
  const uploaded: LibraryMedia[] = [];
  for (const file of files) {
    const kind = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name) ? 'video' : 'image';
    const form = new FormData(); form.append('file', file);
    uploaded.push(await api<LibraryMedia>(`/api/media-library/uploads/${kind}`, { method: 'POST', body: form }));
    mediaChanged();
  }
  mediaChanged();
  return uploaded;
}

export async function libraryFile(item: LibraryMedia) {
  const response = await fetch(item.url);
  if (!response.ok) throw new Error('素材读取失败，请刷新后重试。');
  return new File([await response.blob()], item.name, { type: item.mime });
}
