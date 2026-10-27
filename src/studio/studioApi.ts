import { api } from '../api';

/** Feature gate: always on for this PR (override with FEATURE_STUDIO=0 / false). */
export const FEATURE_STUDIO = (() => {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
    const raw = env?.FEATURE_STUDIO ?? env?.VITE_FEATURE_STUDIO;
    if (raw === '0' || raw === 'false') return false;
  } catch { /* ignore */ }
  return true;
})();

export type TrendMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
};

export type TrendItem = {
  id: string;
  platform: string;
  url: string;
  thumbnail: string;
  title: string;
  author: string;
  metrics?: TrendMetrics;
  tags: string[];
  capturedAt: string;
  analysis?: {
    hook?: string;
    pacing?: string;
    sellingPoints?: string[];
    summary?: string;
  };
};

export type StudioCreativeKind = 'hero' | 'selling' | 'scene' | 'kv';

export type StudioCreativeAsset = {
  id: string;
  kind: StudioCreativeKind;
  status: 'queued' | 'running' | 'completed' | 'failed';
  prompt: string;
  url?: string;
  filename?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type StudioProject = {
  id: string;
  title: string;
  module: 'creatives' | 'radar' | 'tvc' | 'remake';
  status: 'draft' | 'running' | 'ready' | 'failed';
  brief?: string;
  sourceTrendId?: string;
  creatives?: StudioCreativeAsset[];
  productRefs?: { filename: string; url: string; mime: string }[];
  tvcStatus?: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  remakeStatus?: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type RadarSearchResult = {
  query: string;
  items: TrendItem[];
  searchedAt: string;
};

export type CreativeGenerateResult = {
  projectId: string;
  jobId: string;
  assets: StudioCreativeAsset[];
  configured?: boolean;
  usedEdits?: boolean;
};

export type JobStatus = {
  jobId: string;
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  assets?: StudioCreativeAsset[];
  configured?: boolean;
};

export const creativeKindLabels: Record<StudioCreativeKind, string> = {
  hero: '主图',
  selling: '卖点图',
  scene: '场景图',
  kv: 'KV 视觉',
};

export function listStudioProjects() {
  return api<StudioProject[]>('/api/studio/projects');
}

export function getStudioProject(id: string) {
  return api<StudioProject>(`/api/studio/projects/${encodeURIComponent(id)}`);
}

export function createStudioProject(body: { title: string; module: StudioProject['module']; brief?: string; sourceTrendId?: string }) {
  return api<StudioProject>('/api/studio/projects', { method: 'POST', body: JSON.stringify(body) });
}

export function searchRadar(query: string, platform?: string) {
  return api<RadarSearchResult>('/api/studio/radar/search', {
    method: 'POST',
    body: JSON.stringify({ query, platform }),
  });
}

export function generateCreatives(body: {
  projectId?: string;
  title?: string;
  brief: string;
  kinds?: StudioCreativeKind[];
  images?: File[];
}) {
  const form = new FormData();
  form.append('brief', body.brief);
  if (body.title) form.append('title', body.title);
  if (body.projectId) form.append('projectId', body.projectId);
  if (body.kinds?.length) form.append('kinds', JSON.stringify(body.kinds));
  for (const file of body.images || []) form.append('images', file);
  return api<CreativeGenerateResult>('/api/studio/creatives/generate', {
    method: 'POST',
    body: form,
  });
}

export function getCreativeJobStatus(jobId: string) {
  return api<JobStatus>(`/api/studio/creatives/status/${encodeURIComponent(jobId)}`);
}

export function queueTvc(body: { projectId: string; brief?: string }) {
  return api<{ projectId: string; status: string; message: string }>('/api/studio/tvc/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function startRemake(body: { trendId: string; title?: string; brief?: string }) {
  return api<StudioProject>('/api/studio/remake', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
