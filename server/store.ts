import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MODEL, defaultMarket, emptyProduct, stageOf, type Project } from '../shared/domain';
import { demoProject } from '../shared/demo';

export const dataDir = path.resolve(process.env.SOP_DATA_DIR || path.join(process.cwd(), 'data'));
export const uploadDir = path.join(dataDir, 'uploads');
const recordsDir = path.join(dataDir, 'projects');
fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(recordsDir, { recursive: true, mode: 0o700 });
const projects = new Map<string, Project>();
for (const filename of fs.readdirSync(recordsDir)) {
  if (!/^[a-f\d-]{36}\.json$/.test(filename)) continue;
  try {
    const project: Project = JSON.parse(fs.readFileSync(path.join(recordsDir, filename), 'utf8'));
    if (!project.id || !Array.isArray(project.assets)) continue;
    // Records created before video rendering was introduced remain readable.
    project.generatedVideos ||= [];
    if (project.job?.status === 'running') {
      project.job = { ...project.job, status: 'failed', message: '服务已重启，上次任务已中断。可以重新发起。', finishedAt: new Date().toISOString() };
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
  return [...projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(p => ({ id: p.id, title: p.title, updatedAt: p.updatedAt, isDemo: p.isDemo, stage: stageOf(p) }));
}
export function createProject(demo = false) {
  const id = randomUUID();
  const now = new Date().toISOString();
  return saveProject(demo ? demoProject(id) : {
    id, title: '未命名创意', createdAt: now, updatedAt: now, revision: 0, isDemo: false,
    product: { ...emptyProduct }, market: { ...defaultMarket }, assets: [], analysis: null, rewrite: null,
    rewriteStale: false, generatedVideos: [], job: null, model: MODEL, usage: { input: 0, output: 0 },
  });
}
