import type { User } from '@supabase/supabase-js';
import type { LibraryMedia, LibraryPage, LibraryQuery, MediaBackup } from '../shared/media-library';
import { api } from './api';
import { publicAuthRequired, supabase } from './auth';

export type MediaLibraryChange = { deletedIds: string[]; uploaded: LibraryMedia[]; refresh: boolean };
let libraryRevision = 0;
export function mediaChanged(deletedIds: string[] = [], uploaded: LibraryMedia[] = [], refresh = true) {
  if (refresh) libraryRevision++;
  window.dispatchEvent(new CustomEvent<MediaLibraryChange>('media-library-changed', { detail: { deletedIds, uploaded, refresh } }));
}

function libraryParams(options: LibraryQuery) {
  const params = new URLSearchParams();
  if (options.kind) params.set('kind', options.kind);
  if (options.query) params.set('query', options.query);
  if (options.sort) params.set('sort', options.sort);
  if (options.cursor) params.set('cursor', options.cursor);
  return params;
}

const pageRequests = new Map<string, Promise<LibraryPage>>();
export function loadMediaLibrary(userId: string | undefined, options: LibraryQuery) {
  const params = libraryParams(options);
  const key = JSON.stringify([userId, libraryRevision, params.toString()]);
  const pending = pageRequests.get(key);
  if (pending) return pending;
  const request = api<LibraryPage>(`/api/media-library/items?${params}`, { signal: AbortSignal.timeout(12000) })
    .finally(() => { if (pageRequests.get(key) === request) pageRequests.delete(key); });
  pageRequests.set(key, request);
  return request;
}
export type LibrarySelectionItem = Pick<LibraryMedia, 'id' | 'name'>;
export function loadMediaSelection(options: LibraryQuery) {
  return api<{ items: LibrarySelectionItem[]; total: number }>(`/api/media-library/selection?${libraryParams(options)}`,
    { signal: AbortSignal.timeout(12000) });
}

export function loadMediaStatus(ids: string[], signal: AbortSignal) {
  return api<{ indexing: boolean; status: Record<string, MediaBackup | null> }>(
    `/api/media-library/status?ids=${ids.join(',')}`, { signal });
}

const syncJobs = new Map<string, Promise<void>>();
export function syncMediaLibrary(user: User | null): Promise<void> {
  if (!publicAuthRequired || !supabase || !user) return Promise.resolve();
  const previous = syncJobs.get(user.id);
  if (previous) return previous;
  const job = (async () => {
    type SyncStatus = { jobId: string; status: 'running' | 'done' | 'error'; error?: string };
    let result = await api<SyncStatus>('/api/media-library/sync', { method: 'POST', signal: AbortSignal.timeout(12000) });
    while (result.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { data: session } = await supabase!.auth.getSession();
      if (session.session?.user.id !== user.id) return;
      result = await api<SyncStatus>(`/api/media-library/sync/${result.jobId}`, { signal: AbortSignal.timeout(12000) });
    }
    if (result.status === 'error') throw new Error(result.error || '云端同步未完成，请稍后重试。');
  })();
  syncJobs.set(user.id, job);
  void job.finally(() => { if (syncJobs.get(user.id) === job) syncJobs.delete(user.id); }).catch(() => {});
  return job;
}

export async function uploadLibraryFiles(files: File[]) {
  const uploaded: LibraryMedia[] = [];
  try {
    for (const file of files) {
      const kind = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name) ? 'video' : 'image';
      const form = new FormData(); form.append('file', file);
      const item = await api<LibraryMedia>(`/api/media-library/uploads/${kind}`, { method: 'POST', body: form });
      uploaded.push(item);
      mediaChanged([], [item], false);
    }
    return uploaded;
  } finally {
    if (uploaded.length) mediaChanged();
  }
}

export async function deleteLibraryMedia(items: LibrarySelectionItem[]) {
  const ids = [...new Set(items.map(item => item.id))];
  if (!ids.length) return;
  const result = await api<{ deletedIds: string[] }>('/api/media-library', { method: 'DELETE', body: JSON.stringify({ ids }) });
  mediaChanged(result.deletedIds);
}

export async function libraryFile(item: LibraryMedia) {
  const response = await fetch(item.url);
  if (!response.ok) throw new Error('素材读取失败，请刷新后重试。');
  return new File([await response.blob()], item.name, { type: item.mime });
}
