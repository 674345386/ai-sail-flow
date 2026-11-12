import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import JSZip from 'jszip';
import type { Project } from '../shared/domain';
import { activeExperimentMethod, emptyExperiment, normalizeExperimentGraph, ExperimentError, type ExperimentGraph, type ExperimentNode } from '../shared/experiment';
import { evaluationProtocol, reproducibilityInterval, snapshotHasOutput, type EvaluationInput, type SkillAsset, type SkillAssetDetail, type SkillAssetSummary, type SkillReference, type SkillRelease, type SkillSelection, type SkillSnapshot, type VerificationJob } from '../shared/skill-assets';
import { dataDir, uploadDir } from './store';
import { experimentSources, githubJSON, readGitHubSkill } from './experiment-workbench';
import { collectSkillSourceFiles, restoreSkillFiles, sha256 } from './skill-environment';

const directory = path.join(dataDir, 'skill-assets');
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const assets = new Map<string, SkillAsset>();
const now = () => new Date().toISOString();
function writeJSON(filename: string, value: unknown) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temporary, filename);
}
export function saveSkillAsset(asset: SkillAsset) {
  asset = { ...asset, updatedAt: now() };
  writeJSON(path.join(directory, `${asset.id}.json`), asset); assets.set(asset.id, asset); return asset;
}
for (const filename of fs.readdirSync(directory).filter(name => /^[\w-]+\.json$/.test(name) && !name.startsWith('personal-'))) {
  try {
    const asset = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8')) as SkillAsset;
    if (!asset.id || !asset.releases) continue;
    asset.jobs = asset.jobs.map(job => job.status === 'running' ? { ...job, status: 'blocked', error: '服务已重启，保留实验记录；可重新发起验证。' } : job);
    assets.set(asset.id, asset);
  } catch { console.warn(`Skill asset could not be loaded: ${filename}`); }
}
function personalFile(owner: string) { return path.join(directory, `personal-${sha256(owner)}.json`); }
function savedSkills(owner: string): SkillSelection[] {
  try { return JSON.parse(fs.readFileSync(personalFile(owner), 'utf8')); } catch { return []; }
}
export function getSkillAsset(id: string, owner: string) {
  const asset = assets.get(id);
  if (!asset || asset.visibility !== 'public' && asset.ownerId !== owner) throw new ExperimentError('找不到这个资产，或它尚未公开。');
  return asset;
}
export function skillRelease(asset: SkillAsset, releaseId = asset.currentReleaseId) {
  const release = asset.releases.find(release => release.id === releaseId);
  if (!release) throw new ExperimentError('这个资产版本不存在，请重新选择。');
  return release;
}
export function skillAssetSummary(asset: SkillAsset, owner: string, releaseId?: string): SkillAssetSummary {
  const release = skillRelease(asset, releaseId), report = asset.reports.filter(report => report.releaseId === release.id).at(-1);
  const job = asset.jobs.filter(job => job.releaseId === release.id).at(-1);
  const state = job?.status === 'running' ? 'running' : asset.upstream?.changed && release.id === asset.currentReleaseId ? 'stale' : job?.status === 'blocked' && (!report || job.startedAt > report.createdAt) ? 'blocked' : report?.state || 'pending';
  return { id: asset.id, kind: 'skill', name: asset.name, summary: asset.summary, topics: asset.topics, author: asset.author, visibility: asset.visibility,
    releaseId: release.id, version: release.source.commit?.slice(0, 9) || release.id.slice(0, 8), state, fitScore: report?.fitScore ?? null,
    trials: report?.models.reduce((sum, model) => sum + model.trials, 0) || 0,
    demoCount: snapshotHasOutput(report?.snapshot || release.snapshot) ? 1 : 0, saved: savedSkills(owner).some(item => item.assetId === asset.id && item.releaseId === release.id), owned: asset.ownerId === owner, updatedAt: asset.updatedAt };
}
export function listSkillAssets(owner: string, scope = 'public') {
  const saved = savedSkills(owner);
  return [...assets.values()].filter(asset => scope === 'personal' ? asset.ownerId === owner || saved.some(item => item.assetId === asset.id) : asset.visibility === 'public')
    .filter(asset => asset.visibility === 'public' || asset.ownerId === owner)
    .map(asset => skillAssetSummary(asset, owner, scope === 'personal' ? saved.find(item => item.assetId === asset.id)?.releaseId : undefined))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function skillAssetDetail(id: string, owner: string, releaseId?: string): SkillAssetDetail {
  const asset = getSkillAsset(id, owner), release = skillRelease(asset, releaseId);
  const job = asset.jobs.filter(job => job.releaseId === release.id).at(-1);
  return { ...skillAssetSummary(asset, owner, release.id), claims: asset.claims, release, reports: asset.reports.filter(report => report.releaseId === release.id), job, canStop: job?.status === 'running' && job.requestedBy === owner, upstream: asset.upstream, protocol: evaluationProtocol };
}
export function favoriteSkill(id: string, owner: string, releaseId: string, saved: boolean) {
  skillRelease(getSkillAsset(id, owner), releaseId);
  const selections = savedSkills(owner).filter(item => item.assetId !== id);
  if (saved) selections.push({ assetId: id, releaseId });
  writeJSON(personalFile(owner), selections);
}

export const collectSkillInput = z.object({
  url: z.string().url().max(2000), path: z.string().max(500).optional(), name: z.string().trim().max(120).optional(),
  summary: z.string().trim().max(2000).default(''), claims: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  topics: z.array(z.string().trim().min(1).max(40)).max(8).default([]), visibility: z.enum(['public', 'private']).default('public'),
});
async function readRepository(urlString: string, skillPath?: string) {
  try {
    const result = await readGitHubSkill({ url: urlString, ...(skillPath ? { path: skillPath } : {}) });
    if (result.choices) return { choices: result.choices };
    const skill = result.skill!;
    return { source: { kind: 'github' as const, url: skill.url, repository: skill.repository, path: skill.path, commit: skill.commit }, content: skill.content, name: skill.name };
  } catch (error) {
    if (!(error instanceof ExperimentError) || !error.message.includes('没有找到 SKILL.md')) throw error;
    const url = new URL(urlString), [owner, rawRepository] = url.pathname.split('/').filter(Boolean);
    const repository = rawRepository.replace(/\.git$/, ''), base = `/repos/${owner}/${repository}`;
    const commit = await githubJSON(`${base}/commits/HEAD`);
    const file = await githubJSON(`${base}/readme?ref=${commit.sha}`);
    if (!/^[a-f0-9]{40}$/.test(commit.sha) || file.encoding !== 'base64' || file.size > 90000) throw new ExperimentError('仓库说明无法读取或过大。');
    return { source: { kind: 'github' as const, url: `https://github.com/${owner}/${repository}/blob/${commit.sha}/${file.path}`, repository: `${owner}/${repository}`, path: file.path as string, commit: commit.sha as string }, content: Buffer.from(file.content, 'base64').toString('utf8'), name: repository };
  }
}
function makeRelease(input: Omit<SkillRelease, 'id' | 'createdAt' | 'digest'>): SkillRelease {
  return { ...input, id: randomUUID(), createdAt: now(), digest: sha256(JSON.stringify(input)) };
}
function addAsset(owner: string, input: { name: string; summary: string; topics: string[]; claims: string[]; visibility: 'public' | 'private' }, release: SkillRelease) {
  const asset = saveSkillAsset({ ...input, id: randomUUID(), kind: 'skill', ownerId: owner, author: owner === 'platform' ? '平台收录' : '社区创作者', createdAt: now(), updatedAt: now(), currentReleaseId: release.id, releases: [release], reports: [], jobs: [] });
  favoriteSkill(asset.id, owner, release.id, true); return asset;
}
export async function collectGitHubSkill(owner: string, input: z.infer<typeof collectSkillInput>) {
  const result = await readRepository(input.url, input.path);
  if (result.choices) return result;
  const existing = [...assets.values()].find(asset => (asset.visibility === 'public' || asset.ownerId === owner) && asset.releases.some(release => release.source.commit === result.source!.commit && release.source.repository === result.source!.repository && release.source.path === result.source!.path));
  if (existing) {
    const matched = existing.releases.find(release => release.source.commit === result.source!.commit && release.source.repository === result.source!.repository && release.source.path === result.source!.path)!;
    favoriteSkill(existing.id, owner, matched.id, true); return { asset: skillAssetDetail(existing.id, owner, matched.id) };
  }
  const release = makeRelease({ source: result.source!, content: result.content!, files: [] });
  const asset = addAsset(owner, { name: input.name || result.name!, summary: input.summary || '从公开仓库收录，等待官方实验验证。', topics: input.topics.length ? input.topics : ['待分类'], claims: input.claims, visibility: input.visibility }, release);
  return { asset: skillAssetDetail(asset.id, owner) };
}

export function snapshotSkillExperiment(project: Project, graph: ExperimentGraph, options: { planId?: string; skillNodeId?: string; title: string }): SkillSnapshot {
  graph = normalizeExperimentGraph(graph);
  const ids = new Set(graph.nodes.filter(node => !options.planId || node.planId === options.planId).map(node => node.id));
  if (options.skillNodeId) ids.add(options.skillNodeId);
  const include = (id: string) => { const node = graph.nodes.find(item => item.id === id); for (const input of [...(node?.inputs || []), ...(node?.methods?.flatMap(method => method.inputs) || [])]) if (!ids.has(input)) { ids.add(input); include(input); } };
  [...ids].forEach(include);
  const nodes = structuredClone(graph.nodes.filter(node => ids.has(node.id)));
  const sourceIds = new Set(nodes.flatMap(node => [...(node.sourceId ? [node.sourceId] : []), ...(node.methods?.flatMap(method => method.referenceIds) || [])]));
  const sources = experimentSources(project, graph.files);
  const originals = [...(graph.files || []), ...project.assets, ...(project.agentImages || []), ...(project.storyboardGrids || []), ...project.generatedVideos, ...(project.composedVideos || [])];
  let bytes = 0;
  const files = [...sourceIds].flatMap(id => {
    const source = sources.find(source => source.id === id), original = originals.find(file => file.id === id);
    if (!source || source.status !== 'completed') return [];
    if (!original?.filename || path.basename(original.filename) !== original.filename) throw new ExperimentError(`实验素材「${source.title}」缺少可交付文件。`);
    const absolute = path.join(uploadDir, original.filename);
    if (!fs.existsSync(absolute)) throw new ExperimentError(`实验素材「${source.title}」已不存在，请先恢复。`);
    const size = fs.statSync(absolute).size; bytes += size;
    if (bytes > 250 * 1024 * 1024) throw new ExperimentError('参考现场的素材合计超过 250 MB，请选择更小的实验。');
    const extension = path.extname(original.filename).replace(/[^.\w]/g, '') || '.txt', filename = `skill-${randomUUID()}${extension}`;
    fs.copyFileSync(absolute, path.join(uploadDir, filename));
    return [{ id, title: source.title, mediaType: source.mediaType, status: 'completed' as const, filename, url: `/media/${filename}`, size, storage: 'local' as const }];
  });
  for (const node of nodes) if (node.sourceId) { const file = files.find(file => file.id === node.sourceId); node.url = file?.url; }
  const snapshotGraph: ExperimentGraph = { ...emptyExperiment(), title: options.title, nodes, plans: structuredClone(graph.plans?.filter(plan => nodes.some(node => node.planId === plan.id))), runs: structuredClone(graph.runs?.filter(run => ids.has(run.stepId))), files, ...(graph.environment ? { environment: structuredClone(graph.environment) } : {}) };
  const workingDirectory = graph.environment?.workingDirectory;
  return { id: randomUUID(), title: options.title, createdAt: now(), graph: snapshotGraph, sourceFiles: collectSkillSourceFiles(project.id, workingDirectory === '.' ? '' : workingDirectory) };
}

export const publishSkillInput = z.object({
  name: z.string().trim().min(1).max(120), summary: z.string().trim().min(1).max(2000),
  claims: z.array(z.string().trim().min(1).max(1000)).min(1).max(30), topics: z.array(z.string().trim().min(1).max(40)).max(8),
  planId: z.string().max(100).optional(), skillNodeId: z.string().max(100).optional(), visibility: z.enum(['public', 'private']).default('private'),
});
export function publishCreativeSkill(owner: string, project: Project, graph: ExperimentGraph, input: z.infer<typeof publishSkillInput>) {
  graph = normalizeExperimentGraph(graph);
  const planId = input.planId || (graph.plans?.length === 1 ? graph.plans[0].id : undefined);
  if (!planId || !graph.plans?.some(plan => plan.id === planId)) throw new ExperimentError('请选择要沉淀的一个制作方案。');
  const skill = input.skillNodeId ? graph.nodes.find(node => node.id === input.skillNodeId && node.kind === 'skill') : undefined;
  if (input.skillNodeId && !skill) throw new ExperimentError('所选 Skill 不存在。');
  const steps = graph.nodes.filter(node => node.planId === planId && node.kind === 'step');
  if (!steps.length) throw new ExperimentError('这个方案尚无步骤，请先保存实际使用的方法。');
  const content = skill?.skill?.content || skill?.content || `# ${input.name}\n\n${input.summary}\n\n${steps.map(step => { const method = activeExperimentMethod(step); return `## ${step.title}\n${step.description}\n\n${method?.prompt || step.prompt}\n\n模型 / 工具：${method?.model || '执行时选择'}\n参数：${JSON.stringify(method?.parameters || {})}`; }).join('\n\n')}`;
  const snapshot = snapshotSkillExperiment(project, graph, { planId, skillNodeId: skill?.id, title: input.name });
  const release = makeRelease({ content, source: skill?.skill ? { kind: 'github', repository: skill.skill.repository, commit: skill.skill.commit, path: skill.skill.path, url: skill.skill.url } : { kind: 'community', basedOn: graph.assetReferences?.[0]?.assetId }, files: snapshot.sourceFiles, environment: graph.environment, snapshot });
  return skillAssetDetail(addAsset(owner, { ...input, topics: input.topics.length ? input.topics : ['待分类'] }, release).id, owner);
}
export function shareSkill(id: string, owner: string) {
  const asset = getSkillAsset(id, owner);
  if (asset.ownerId !== owner) throw new ExperimentError('只能发布自己沉淀的 Skill。');
  saveSkillAsset({ ...asset, visibility: 'public' }); return skillAssetDetail(id, owner);
}

/** Reference evidence stays immutable; editable steps start as fresh executions. */
export function adoptSkillSelection(graph: ExperimentGraph, asset: SkillAsset, releaseId: string, projectId: string, mode: 'skill' | 'template' = 'template') {
  const release = skillRelease(asset, releaseId);
  graph = normalizeExperimentGraph(structuredClone(graph));
  if (graph.assetReferences?.some(reference => reference.assetId === asset.id && reference.releaseId === release.id)) return graph;
  if ((graph.assetReferences?.length || 0) >= 8) throw new ExperimentError('一次创作最多采用 8 个 Skill。');
  const report = asset.reports.filter(report => report.releaseId === release.id).at(-1);
  const snapshot = report?.snapshot || release.snapshot;
  const workspace = restoreSkillFiles(projectId, asset.id, release.id, snapshot?.sourceFiles || release.files);
  const referenceId = randomUUID(), skillId = randomUUID();
  const skill: ExperimentNode = { id: skillId, kind: 'skill', title: asset.name, description: asset.summary, content: release.content.slice(0, 30000), prompt: '', method: `资产版本 ${release.id.slice(0, 8)}`, status: 'completed', inputs: [], revision: 1, inputRevisions: {}, position: { x: 0, y: graph.nodes.length * 80 }, assetReferenceId: referenceId,
    ...(release.source.repository && release.source.commit ? { skill: { name: asset.name, repository: release.source.repository, path: release.source.path || 'SKILL.md', commit: release.source.commit, url: release.source.url || '', content: release.content } } : {}) };
  const added: ExperimentNode[] = [skill];
  if (snapshot && mode === 'template') {
    const source = normalizeExperimentGraph(snapshot.graph), map = new Map(source.nodes.map(node => [node.id, node.kind === 'skill' ? skillId : randomUUID()]));
    const planMap = new Map((source.plans || []).map(plan => [plan.id, randomUUID()]));
    graph.plans!.push(...(source.plans || []).map(plan => ({ id: planMap.get(plan.id)!, title: `${plan.title} · 我的创作`.slice(0, 120), goal: plan.goal, goalId: planMap.get(plan.id)!, basedOn: plan.id })));
    for (const original of source.nodes.filter(node => node.kind !== 'skill')) {
      const fresh = original.kind === 'step' || original.kind === 'artifact' || original.kind === 'compare';
      const inputs = [...new Set(original.inputs.map(id => map.get(id)!).filter(Boolean))];
      if (original.kind === 'step' && !inputs.includes(skillId)) inputs.push(skillId);
      const node: ExperimentNode = { ...structuredClone(original), id: map.get(original.id)!, planId: original.planId ? planMap.get(original.planId) : undefined, assetReferenceId: referenceId, inputs, position: { x: original.position.x, y: original.position.y + graph.nodes.length * 80 + 250 }, revision: 1, inputRevisions: {}, runId: undefined, selectedInput: undefined, error: undefined,
        ...(fresh ? { status: 'planned', sourceId: undefined, url: undefined, content: original.kind === 'artifact' ? '' : original.content } : {}) };
      if (node.methods) {
        const methodMap = new Map(node.methods.map(method => [method.id, randomUUID()]));
        node.methods = node.methods.map(method => ({ ...method, id: methodMap.get(method.id)!, inputs: [...new Set([...method.inputs.map(id => map.get(id)!).filter(Boolean), skillId])] }));
        node.activeMethodId = methodMap.get(original.activeMethodId || '') || node.methods[0].id;
        node.inputs = activeExperimentMethod(node)!.inputs;
      }
      added.push(node);
    }
    graph.files = [...(graph.files || []), ...(source.files || []).filter(file => !graph.files?.some(existing => existing.id === file.id))];
  }
  if (graph.nodes.length + added.length > 160) throw new ExperimentError('采用后节点将超过 160 个，请在新的创意中使用。');
  graph.nodes.push(...added);
  const requiredEnvironment = report?.environment || release.environment;
  graph.assetReferences = [...(graph.assetReferences || []), { id: referenceId, assetId: asset.id, releaseId: release.id, name: asset.name, adoptedAt: now(), workspace, environment: requiredEnvironment && { ...requiredEnvironment, files: [] }, snapshotId: snapshot?.id, reportId: report?.snapshot ? report.id : undefined }];
  return { ...normalizeExperimentGraph(graph), revision: graph.revision + 1, updatedAt: now() };
}

export function resolveSkillReference(reference: SkillReference): SkillReference {
  const asset = assets.get(reference.assetId);
  if (!asset) throw new ExperimentError('参考资产已不存在。');
  const release = skillRelease(asset, reference.releaseId);
  const report = reference.reportId ? asset.reports.find(report => report.id === reference.reportId && report.releaseId === release.id) : undefined;
  const snapshot = report?.snapshot || release.snapshot;
  if (reference.snapshotId && snapshot?.id !== reference.snapshotId) throw new ExperimentError('参考实验版本不匹配。');
  return { ...reference, snapshot, environment: report?.environment || release.environment, skillContent: release.content, source: release.source };
}

export function officialJobFor(projectId: string): { asset: SkillAsset; job: VerificationJob } | undefined {
  for (const asset of assets.values()) { const job = asset.jobs.find(job => job.projectId === projectId); if (job) return { asset, job }; }
}
export async function checkSkillUpstream(id: string, owner: string) {
  const asset = getSkillAsset(id, owner), release = skillRelease(asset);
  if (!release.source.repository) throw new ExperimentError('这个资产没有 GitHub 上游来源。');
  const latest = await githubJSON(`/repos/${release.source.repository}/commits/HEAD`);
  asset.upstream = { checkedAt: now(), latestCommit: latest.sha, changed: latest.sha !== release.source.commit }; saveSkillAsset(asset);
  return skillAssetDetail(id, owner);
}
export async function hydrateSkillAsset(asset: SkillAsset) {
  const release = skillRelease(asset);
  if (release.source.commit || !release.source.url) return release;
  const result = await readRepository(release.source.url);
  if (result.choices) throw new ExperimentError('仓库包含多个 Skill，请选择具体文件重新收录。');
  const existing = skillRelease(asset);
  if (existing.source.commit === result.source!.commit && existing.source.path === result.source!.path) return existing;
  const next = makeRelease({ content: result.content!, source: result.source!, files: [] });
  asset.releases.push(next); asset.currentReleaseId = next.id; saveSkillAsset(asset); return next;
}
export function completeSkillEvaluation(project: Project, graph: ExperimentGraph, input: EvaluationInput, evaluator: string) {
  const official = officialJobFor(project.id);
  if (!official || official.job.status !== 'running') throw new ExperimentError('当前创意不是正在执行的官方验证现场。');
  const { asset, job } = official, release = skillRelease(asset, job.releaseId);
  const observedRuns = new Map<string, { model: string; passed: boolean }>();
  const models = new Map<string, { successes: number; trials: number }>();
  for (const item of input.cases) {
    const run = graph.runs?.find(run => run.id === item.runId);
    if (!run || Date.parse(run.startedAt) < Date.parse(job.startedAt) || run.status === 'running' || !run.method.prompt.trim() || !run.method.model.trim() || !run.environment) throw new ExperimentError('评测用例必须引用本次官方现场中已结束的真实执行，并包含 Prompt、模型 / 工具和环境快照。');
    if (item.claimIndex >= asset.claims.length) throw new ExperimentError('评测用例引用了不存在的声明。');
    const freshOutput = run.artifactIds.some(id => {
      const node = graph.nodes.find(node => node.id === id && node.status === 'completed');
      if (!node?.sourceId) return false;
      const file = graph.files?.find(file => file.id === node.sourceId);
      const image = project.agentImages?.find(image => image.id === node.sourceId);
      const video = project.generatedVideos.find(video => video.id === node.sourceId);
      return Date.parse(file?.createdAt || image?.createdAt || video?.startedAt || '') >= Date.parse(job.startedAt);
    });
    if (item.passed && (run.status !== 'completed' || !freshOutput)) throw new ExperimentError('通过的用例必须有本次官方执行新产生的真实文件或媒体，不能复用参考现场的旧结果。');
    const previous = observedRuns.get(run.id);
    observedRuns.set(run.id, { model: run.method.model, passed: item.passed && previous?.passed !== false });
  }
  for (const run of observedRuns.values()) { const count = models.get(run.model) || { successes: 0, trials: 0 }; count.trials++; if (run.passed) count.successes++; models.set(run.model, count); }
  if (!input.cases.length && !input.blockedReason) throw new ExperimentError('没有真实执行时必须说明阻塞条件，不能给出验证分数。');
  // All cases for a claim must pass; repeating one easy case cannot hide a failed one.
  const passedClaims = asset.claims.filter((_, index) => { const cases = input.cases.filter(item => item.claimIndex === index); return cases.length && cases.every(item => item.passed); }).length;
  const environmentComplete = !!graph.environment && !graph.environment.unresolved.length && input.cases.every(item => !graph.runs!.find(run => run.id === item.runId)!.environment!.unresolved.length);
  const state = !input.cases.length ? 'blocked' : input.blockedReason || !environmentComplete ? 'partial' : passedClaims === asset.claims.length ? 'verified' : passedClaims ? 'partial' : 'failed';
  const snapshot = input.cases.length ? snapshotSkillExperiment(project, graph, { title: `${asset.name} · 官方实验` }) : undefined;
  const report = { ...input, id: randomUUID(), releaseId: release.id, releaseDigest: release.digest, protocol: evaluationProtocol.version, createdAt: now(), evaluator, state,
    fitScore: input.cases.length && asset.claims.length ? Math.round(passedClaims / asset.claims.length * 100) : null,
    models: [...models].map(([model, counts]) => ({ model, ...counts, interval: reproducibilityInterval(counts.successes, counts.trials) })), environment: graph.environment, snapshot } as SkillAsset['reports'][number];
  asset.reports.push(report); asset.topics = input.topics; job.status = 'completed'; saveSkillAsset(asset); return report;
}

export async function skillDeliveryZip(asset: SkillAsset, releaseId: string) {
  const release = skillRelease(asset, releaseId), report = asset.reports.filter(report => report.releaseId === release.id).at(-1);
  const snapshot = report?.snapshot || release.snapshot, zip = new JSZip();
  zip.file('SKILL.md', release.content);
  zip.file('manifest.json', JSON.stringify({ format: 'sail-skill-delivery-v1', assetId: asset.id, release, report: report && { ...report, snapshot: undefined }, protocol: evaluationProtocol }, null, 2));
  zip.file('README.md', `# ${asset.name}\n\n${asset.summary}\n\n此包包含 Skill、固定版本的源文件、实验上下文和输入输出。环境安装说明见 environment.json；凭据需自行绑定。\n\n${(report?.environment || release.environment)?.setup || '运行环境尚未验证，请查看官方报告中的条件与限制。'}`);
  zip.file('environment.json', JSON.stringify(report?.environment || release.environment || { unresolved: ['尚未记录运行环境'] }, null, 2));
  for (const file of snapshot?.sourceFiles || release.files) zip.file(`source/${file.path}`, file.content);
  if (snapshot) {
    zip.file('experiment.json', JSON.stringify(snapshot, null, 2));
    for (const file of snapshot.graph.files || []) {
      if (path.basename(file.filename) !== file.filename) throw new ExperimentError('实验素材路径无效。');
      const absolute = path.join(uploadDir, file.filename);
      if (!fs.existsSync(absolute)) throw new ExperimentError(`实验素材「${file.title}」已丢失，交付包未生成。`);
      zip.file(`media/${file.filename}`, fs.readFileSync(absolute));
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 3 } });
}

if (!assets.has('liveportrait')) {
  const release = makeRelease({ source: { kind: 'github', url: 'https://github.com/674345386/LivePortrait', repository: '674345386/LivePortrait' }, content: '# LivePortrait\n\n待从上游固定版本并由官方 Agent 实际验证。', files: [] });
  saveSkillAsset({ id: 'liveportrait', kind: 'skill', name: 'LivePortrait', summary: '人物图片与驱动视频的人像动画方法。已登记来源，实际能力与运行条件等待官方实验。', topics: ['人物动画'], claims: ['使用人物图片与驱动视频制作动态人像'], ownerId: 'platform', author: '平台收录', visibility: 'public', createdAt: now(), updatedAt: now(), currentReleaseId: release.id, releases: [release], reports: [], jobs: [] });
}
