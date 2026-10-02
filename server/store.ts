import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODEL, defaultMarket, defaultReplication, defaultWorkspace, emptyProduct, stageOf, type Project, type WorkspaceProject } from '../shared/domain';
import { demoProject } from '../shared/demo';

export const dataDir = path.resolve(process.env.SOP_DATA_DIR || path.join(process.cwd(), 'data'));
export const uploadDir = path.join(dataDir, 'uploads');
const recordsDir = path.join(dataDir, 'projects');
const workspaceProjectsDir = path.join(dataDir, 'workspace-projects');
export const defaultProjectId = '00000000-0000-4000-8000-000000000001';
fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(recordsDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(workspaceProjectsDir, { recursive: true, mode: 0o700 });
const workspaceProjects = new Map<string, WorkspaceProject>();
for (const filename of fs.readdirSync(workspaceProjectsDir)) {
  if (!/^[a-f\d-]{36}\.json$/.test(filename)) continue;
  const record: WorkspaceProject = JSON.parse(fs.readFileSync(path.join(workspaceProjectsDir, filename), 'utf8'));
  if (record.id && record.workspaceId === defaultWorkspace.id) workspaceProjects.set(record.id, record);
}
export function saveWorkspaceProject(project: WorkspaceProject) {
  const updated = { ...project, revision: project.revision + 1, updatedAt: new Date().toISOString() };
  const dest = path.join(workspaceProjectsDir, `${updated.id}.json`);
  const temporary = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(updated), { mode: 0o600 });
  fs.renameSync(temporary, dest);
  workspaceProjects.set(updated.id, updated);
  return updated;
}
export function getWorkspaceProject(id: string) { return workspaceProjects.get(id); }
export function listWorkspaceProjects() { return [...workspaceProjects.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
export function createWorkspaceProject(title: string) {
  const now = new Date().toISOString();
  return saveWorkspaceProject({ id: randomUUID(), workspaceId: defaultWorkspace.id, title, createdAt: now, updatedAt: now, revision: 0 });
}
if (!workspaceProjects.has(defaultProjectId)) {
  const now = new Date().toISOString();
  saveWorkspaceProject({ id: defaultProjectId, workspaceId: defaultWorkspace.id, title: '默认项目', createdAt: now, updatedAt: now, revision: 0 });
}
const projects = new Map<string, Project>();
for (const filename of fs.readdirSync(recordsDir)) {
  if (!/^[a-f\d-]{36}\.json$/.test(filename)) continue;
  try {
    let project: Project = JSON.parse(fs.readFileSync(path.join(recordsDir, filename), 'utf8'));
    if (!project.id || !Array.isArray(project.assets)) continue;
    if (!project.parentProjectId || !workspaceProjects.has(project.parentProjectId)) {
      project = saveProject({ ...project, parentProjectId: defaultProjectId });
    }
    // Records created before video rendering was introduced remain readable.
    project.generatedVideos ||= [];
    project.composedVideos ||= [];
    project.replication ||= { ...defaultReplication };
    project.productionMode ||= 'veo-native';
    project.promptFlow ||= 'localized';
    project.workflowMode ||= 'manual';
    project.jobHistory ||= [];
    if (project.workflow?.status === 'running' || project.workflow?.status === 'pausing') {
      project.workflow = { ...project.workflow, status: 'paused', message: '服务已重启，已保留进度。请点击继续自动制作。' };
      project = saveProject(project);
    }
    if (project.job?.status === 'running') {
      const finishedAt = new Date().toISOString();
      const interruptedGeneration = project.job.kind === 'generation';
      project.job = {
        ...project.job,
        status: 'failed',
        message: interruptedGeneration ? '服务已重启，上游任务可继续查询；请点击“恢复已生成任务”。' : '服务已重启，上次任务已中断。可以重新发起。',
        finishedAt,
      };
      project.jobHistory = [...(project.jobHistory || []), project.job].slice(-200);
      if (interruptedGeneration) {
        project.generatedVideos = project.generatedVideos.map(video => video.status === 'running'
          ? { ...video, status: 'failed' as const, error: '服务重启后已停止本地轮询；可恢复查询已提交的上游任务，不会新建或计费。', finishedAt }
          : video);
      }
      saveProject(project);
    } else projects.set(project.id, project);
  } catch { console.warn(`A project record could not be loaded: ${filename}`); }
}
export function saveProject(project: Project) {
  const updated = { ...project, revision: project.revision + 1, updatedAt: new Date().toISOString() };
  const dest = path.join(recordsDir, `${updated.id}.json`);
  const temporary = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(updated), { mode: 0o600 });
  fs.renameSync(temporary, dest);
  projects.set(updated.id, updated);
  return updated;
}
export function getProject(id: string) {
  return projects.get(id);
}
export function listProjects() {
  return [...projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(p => ({ id: p.id, parentProjectId: p.parentProjectId, title: p.title, updatedAt: p.updatedAt, isDemo: p.isDemo, archivedAt: p.archivedAt, stage: stageOf(p) }));
}
export function createProject(demo = false, parentProjectId = defaultProjectId, title?: string) {
  if (!workspaceProjects.has(parentProjectId)) throw new Error('所属项目不存在。');
  const id = randomUUID();
  const now = new Date().toISOString();
  return saveProject(demo ? { ...demoProject(id), parentProjectId, ...(title ? { title } : {}), replication: { ...defaultReplication }, workflowMode: 'manual' as const } : {
    id, parentProjectId, title: title || '未命名创意', createdAt: now, updatedAt: now, revision: 0, isDemo: false,
    product: { ...emptyProduct }, market: { ...defaultMarket }, replication: { ...defaultReplication }, assets: [], analysis: null, rewrite: null,
    rewriteStale: false, generatedVideos: [], composedVideos: [], productionMode: 'veo-native', promptFlow: 'localized', ttsVoice: '', job: null, model: MODEL, usage: { input: 0, output: 0 },
  });
}
