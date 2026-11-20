import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { defaultMarket, defaultReplication, defaultWorkspace, emptyProduct, inProgressCount, stageOf, type Project, type WorkspaceProject } from '../shared/domain';
import { dataDir, workspaceDirectory, workspaceResource } from './workspace-storage';

export { dataDir } from './workspace-storage';
export const uploadDir = path.join(dataDir, 'uploads');
export const defaultProjectId = '00000000-0000-4000-8000-000000000001';
const workspaceGroups = workspaceResource(() => {
  const directory = workspaceDirectory('workspace-projects');
  const records = new Map<string, WorkspaceProject>();
  for (const filename of fs.readdirSync(directory)) {
    if (!/^[a-f\d-]{36}\.json$/.test(filename)) continue;
    const record: WorkspaceProject = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    if (record.id && record.workspaceId === defaultWorkspace.id) records.set(record.id, record);
  }
  if (!records.has(defaultProjectId)) {
    const now = new Date().toISOString();
    writeRecord(directory, records, { id: defaultProjectId, workspaceId: defaultWorkspace.id, title: '默认项目', createdAt: now, updatedAt: now, revision: 0 });
  }
  return { directory, records };
});

export function saveWorkspaceProject(project: WorkspaceProject) {
  const { directory, records } = workspaceGroups();
  return writeRecord(directory, records, project);
}
export function getWorkspaceProject(id: string) { return workspaceGroups().records.get(id); }
export function listWorkspaceProjects() { return [...workspaceGroups().records.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export function createWorkspaceProject(title: string) {
  const now = new Date().toISOString();
  return saveWorkspaceProject({ id: randomUUID(), workspaceId: defaultWorkspace.id, title, createdAt: now, updatedAt: now, revision: 0 });
}

const workspaceCreatives = workspaceResource(() => {
  const directory = workspaceDirectory('projects');
  const records = new Map<string, Project>();
  for (const filename of fs.readdirSync(directory)) {
    if (!/^[a-f\d-]{36}\.json$/.test(filename)) continue;
    try {
      const project: Project = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
      if (!project.id || !Array.isArray(project.assets)) continue;
      if (recoverProject(project)) writeRecord(directory, records, project);
      else records.set(project.id, project);
    } catch { console.warn(`A project record could not be loaded: ${filename}`); }
  }
  const events = new EventEmitter().setMaxListeners(0);
  return { directory, records, events };
});

function recoverProject(project: Project) {
  let changed = false;
  if (!project.parentProjectId || !getWorkspaceProject(project.parentProjectId)) {
    project.parentProjectId = defaultProjectId;
    changed = true;
  }
  // Records created before video rendering was introduced remain readable.
  project.generatedVideos ||= [];
  if (project.remix) project.remix.videos ||= [];
  project.composedVideos ||= [];
  project.replication ||= { ...defaultReplication };
  project.productionMode ||= 'veo-native';
  project.promptFlow ||= 'localized';
  project.breakdownType ||= 'shot';
  project.storyboardGridSize ||= 3;
  project.storyboardGrids ||= [];
  project.jobHistory ||= [];
  if (project.agentImages?.some(image => image.status === 'running')) {
    project.agentImages = project.agentImages.map(image => image.status === 'running'
      ? { ...image, status: 'failed' as const, error: '服务重启；图片请求结果待核对，请勿直接重发。' }
      : image);
    changed = true;
  }
  if (project.workflow?.status === 'running' || project.workflow?.status === 'pausing') {
    project.workflow = { ...project.workflow, status: 'paused', message: '旧版自动制作已停止，保留已完成产物。' };
    changed = true;
  }
  if (project.job?.status === 'running') {
    const finishedAt = new Date().toISOString();
    const interruptedGeneration = project.job.kind === 'generation';
    project.job = {
      ...project.job,
      status: 'failed',
      message: interruptedGeneration ? '服务已重启，上游任务可继续查询；请点击“恢复已生成任务”。' : '服务已重启，上次任务已中断。',
      finishedAt,
    };
    project.jobHistory = [...(project.jobHistory || []), project.job].slice(-200);
    if (project.remix) project.remix = { ...project.remix, videos: project.remix.videos.map(video => video.status === 'running'
      ? { ...video, status: 'failed' as const, error: '旧版制作已停止。已保留上游任务 ID。' } : video) };
    if (project.rewrite) project.rewrite = { ...project.rewrite, shots: project.rewrite.shots.map(shot => shot.keyframe?.status === 'running'
      ? { ...shot, keyframe: { ...shot.keyframe, status: 'failed' as const, error: '服务已重启，关键帧请求结果可能未知；请先核对，避免重复生成。' } } : shot) };
    if (interruptedGeneration) {
      project.generatedVideos = project.generatedVideos.map(video => video.status === 'running'
        ? { ...video, status: 'failed' as const, error: video.provider === 'minimax-h3' && video.requestId ? '本地服务已重启，将自动继续查询原视频任务。' : video.provider === 'omni-flash' ? '服务已重启，可查询原有 Omni 任务。' : '服务已重启，已保留原任务记录。', finishedAt,
          ...(video.provider === 'minimax-h3' && video.minimax ? { minimax: { ...video.minimax, recoveryPending: !!video.requestId, nextRecoveryAt: undefined } } : {}) }
        : video);
    }
    changed = true;
  }
  return changed;
}
function writeRecord<T extends { id: string; revision: number }>(directory: string, records: Map<string, T>, project: T): T {
  const updated = { ...project, revision: project.revision + 1, updatedAt: new Date().toISOString() };
  const dest = path.join(directory, `${updated.id}.json`);
  const temporary = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(updated), { mode: 0o600 });
  fs.renameSync(temporary, dest);
  records.set(updated.id, updated);
  return updated;
}
export function saveProject(project: Project) {
  const { directory, records, events } = workspaceCreatives();
  const saved = writeRecord(directory, records, project);
  events.emit(saved.id, saved);
  return saved;
}
export function subscribeProject(id: string, listener: (project: Project) => void) {
  const { events } = workspaceCreatives();
  events.on(id, listener);
  return () => events.off(id, listener);
}
export function getProject(id: string) {
  return workspaceCreatives().records.get(id);
}
export function listProjectIds() {
  return workspaceCreatives().records.keys();
}
export function listProjects() {
  return [...workspaceCreatives().records.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(p => ({ id: p.id, parentProjectId: p.parentProjectId, title: p.title, createdAt: p.createdAt, updatedAt: p.updatedAt, isDemo: p.isDemo, archivedAt: p.archivedAt, stage: stageOf(p), inProgressCount: inProgressCount(p) }));
}
export function createProject(parentProjectId = defaultProjectId, title?: string) {
  if (!getWorkspaceProject(parentProjectId)) throw new Error('所属项目不存在。');
  const id = randomUUID();
  const now = new Date().toISOString();
  return saveProject({
    id, parentProjectId, title: title || '未命名创意', createdAt: now, updatedAt: now, revision: 0, isDemo: false,
    product: { ...emptyProduct }, market: { ...defaultMarket }, replication: { ...defaultReplication }, assets: [], analysis: null, rewrite: null,
    rewriteStale: false, generatedVideos: [], composedVideos: [], productionMode: 'veo-native', promptFlow: 'localized', ttsVoice: '', job: null, usage: { input: 0, output: 0 },
    breakdownType: 'shot', storyboardGridSize: 3, storyboardGrids: [],
  });
}
