import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Project } from '../shared/domain';
import { activeExperimentMethod, applyExperimentOperation, emptyExperiment, invalidateExperimentNodes, normalizeExperimentGraph, methodMatchesRun, ExperimentError, type ExperimentGraph, type ExperimentNode, type ExperimentSkill, type ExperimentFile, type ExperimentRun, type ExperimentMethod } from '../shared/experiment';

export const importExperimentSkillInput = z.object({ url: z.string().url().max(2000), path: z.string().max(500).optional(), nodeId: z.string().regex(/^[\w-]{1,100}$/).optional(), targetStepId: z.string().regex(/^[\w-]{1,100}$/).optional() });
export const bindExperimentInput = z.object({ stepId: z.string().regex(/^[\w-]{1,100}$/), sourceId: z.string().min(1).max(150), runId: z.string().regex(/^[\w-]{1,100}$/).optional(), title: z.string().trim().min(1).max(120).optional() });

type ExperimentSource = { id: string; title: string; url?: string; mediaType: 'image' | 'video' | 'text'; status: ExperimentNode['status']; error?: string; prompt?: string; referenceIds?: string[]; model?: string; parameters?: ExperimentMethod['parameters'] };

export function experimentSources(project: Project, files: ExperimentFile[] = []): ExperimentSource[] {
  return [
    ...files.map(file => ({ ...file, error: undefined as string | undefined })),
    // Audio is available through chat's audio player; it is not a text preview.
    ...project.assets.filter(a => a.kind !== 'audio').map(a => ({ id: a.id, title: a.name, url: a.url, mediaType: a.mime.startsWith('video/') ? 'video' as const : a.mime.startsWith('image/') ? 'image' as const : 'text' as const, status: 'completed' as const, error: undefined as string | undefined })),
    ...(project.storyboardGrids || []).map(a => ({ id: a.id, title: `${a.start}–${a.end} 秒连续分镜`, url: a.url, mediaType: 'image' as const, status: 'completed' as const })),
    ...(project.agentImages || []).map(a => ({ id: a.id, title: a.prompt.slice(0, 80), url: a.url, mediaType: 'image' as const, status: a.status, error: a.error, prompt: a.prompt, referenceIds: a.referenceIds, model: a.model, parameters: { ...(a.size ? { size: a.size } : {}), ...(a.quality ? { quality: a.quality } : {}), ...(a.aspectRatio ? { aspectRatio: a.aspectRatio } : {}) } })),
    ...project.generatedVideos.map(a => ({ id: a.id, title: a.prompt.slice(0, 80), url: a.url, mediaType: 'video' as const, status: a.stale ? 'stale' as const : a.status, error: a.error, prompt: a.prompt, referenceIds: a.referenceIds, model: a.model, parameters: { ...(a.resolution ? { resolution: a.resolution } : {}), ...(a.aspectRatio ? { aspectRatio: a.aspectRatio } : {}), ...(a.duration ? { duration: a.duration } : {}) } })),
    ...(project.composedVideos || []).map(a => ({ id: a.id, title: '剪辑合成成片', url: a.url, mediaType: 'video' as const, status: a.stale ? 'stale' as const : 'completed' as const, error: undefined as string | undefined })),
  ];
}
export function syncExperimentSources(graph: ExperimentGraph | undefined, project: Project): ExperimentGraph | undefined {
  if (!graph) return graph;
  const sources = experimentSources(project, graph.files);
  const original = graph;
  const migrating = graph.organizationVersion !== 1;
  if (migrating) {
    graph = { ...graph, nodes: graph.nodes.map(node => {
      if (node.kind !== 'step') return node;
      const output = graph!.nodes.find(item => item.kind === 'artifact' && item.inputs.includes(node.id) && item.sourceId);
      const source = sources.find(item => item.id === output?.sourceId);
      if (!source?.prompt) return node;
      return { ...node, prompt: node.prompt || source.prompt, methods: [{ id: `method-${node.id}`.slice(0, 100), title: node.method || '方法 A', description: '', prompt: node.prompt || source.prompt, inputs: [...node.inputs], referenceIds: source.referenceIds || [], model: source.model || '', parameters: source.parameters || {} }] };
    }) };
  }
  graph = normalizeExperimentGraph(graph);
  if (migrating) graph = { ...graph, runs: graph.runs!.map(run => {
    const output = graph!.nodes.find(node => run.artifactIds.includes(node.id) && node.sourceId);
    const source = sources.find(item => item.id === output?.sourceId);
    if (!source?.prompt) return run;
    const image = project.agentImages?.find(item => item.id === source.id), video = project.generatedVideos.find(item => item.id === source.id);
    return { ...run, startedAt: image?.createdAt || video?.startedAt || run.startedAt, method: { ...run.method, prompt: source.prompt, referenceIds: source.referenceIds || run.method.referenceIds, model: source.model || run.method.model, parameters: { ...run.method.parameters, ...source.parameters } } };
  }) };
  let changed = graph !== original;
  const invalid = new Set<string>();
  let nodes = graph.nodes.map(n => {
    if (!n.sourceId || (n.status === 'stale' && !n.runId)) return n;
    const source = sources.find(s => s.id === n.sourceId);
    if (!source || source.status === 'stale') { if (n.status !== 'stale') { changed = true; invalid.add(n.id); } return n.status === 'stale' ? n : { ...n, status: 'stale' as const }; }
    if (n.url === source.url && n.status === source.status && n.error === source.error) return n;
    changed = true;
    return { ...n, url: source.url, mediaType: source.mediaType, status: source.status, error: source.error };
  });
  if (invalid.size) nodes = invalidateExperimentNodes(nodes, invalid);
  const runs = (graph.runs || []).map(run => {
    const results = run.artifactIds.map(id => nodes.find(node => node.id === id));
    if (!results.length) return run;
    const status: ExperimentRun['status'] = results.some(node => node?.status === 'running' || node?.status === 'planned') ? 'running' : results.every(node => node?.status === 'completed') ? 'completed' : 'failed';
    if (status === run.status) return run;
    changed = true;
    return { ...run, status, finishedAt: status === 'running' ? undefined : new Date().toISOString(), error: results.find(node => node?.error)?.error };
  });
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]; if (node.kind !== 'step' || node.status === 'stale') continue;
    const latest = [...runs].reverse().find(run => run.stepId === node.id && methodMatchesRun(node, run, nodes));
    if (!latest || node.status === latest.status) continue;
    nodes[i] = { ...node, status: latest.status, error: latest.error, inputRevisions: latest.inputRevisions }; changed = true;
  }
  return changed ? { ...graph, nodes, runs, revision: original.revision + 1, updatedAt: new Date().toISOString() } : original;
}
export function bindExperimentSource(graph: ExperimentGraph | undefined, project: Project, input: z.infer<typeof bindExperimentInput>) {
  let current = syncExperimentSources(graph || emptyExperiment(), project)!;
  const step = current.nodes.find(n => n.id === input.stepId);
  if (!step || !['step', 'asset', 'artifact'].includes(step.kind)) throw new ExperimentError('请选择素材、制作步骤或产物节点。');
  const source = experimentSources(project, current.files).find(s => s.id === input.sourceId);
  if (!source) throw new ExperimentError('只能连接属于当前创意的真实素材或生成任务。');
  if (step.kind !== 'step') {
    if (step.runId && step.sourceId !== source.id) throw new ExperimentError('已有产物保留原始来源。请在制作步骤中连接新结果，生成独立产物。');
    const nodes = current.nodes.map(n => n.id === step.id ? { ...n, sourceId: source.id, url: source.url, mediaType: source.mediaType, status: source.status, revision: n.revision + 1 } : n);
    // Use the shared mutation to invalidate dependants of a changed input.
    const updated = applyExperimentOperation(current, { op: 'patch', id: step.id, changes: { sourceId: source.id, status: source.status } }, randomUUID);
    return { ...updated, nodes: updated.nodes.map(n => n.id === step.id ? nodes.find(item => item.id === n.id)! : n) };
  }
  if (step.inputs.some(id => current.nodes.find(n => n.id === id)?.status !== 'completed')) throw new ExperimentError('上游素材或步骤尚未完成，请先补齐输入。');
  const alreadyBound = current.nodes.find(n => n.kind === 'artifact' && n.sourceId === source.id && n.inputs.includes(step.id));
  if (alreadyBound) {
    // A provider may return its original task after a retry. Never create a second result for that task.
    if (input.runId && input.runId !== alreadyBound.runId && current.runs?.some(run => run.id === input.runId && run.status === 'running' && !run.artifactIds.length)) current = { ...current, runs: current.runs?.map(run => run.id === input.runId ? { ...run, status: 'failed' as const, error: '服务复用了已有任务，产物保留在原执行记录中。', finishedAt: new Date().toISOString() } : run), revision: current.revision + 1 };
    return syncExperimentSources(current, project)!;
  }
  let run = input.runId ? current.runs!.find(item => item.id === input.runId && item.stepId === step.id) : [...current.runs!].reverse().find(item => item.stepId === step.id && item.status === 'running');
  if (input.runId && !run) throw new ExperimentError('执行记录与制作步骤不匹配。');
  if (!run) {
    current = applyExperimentOperation(current, { op: 'start-run', stepId: step.id, ...(source.prompt ? { prompt: source.prompt } : {}), ...(source.referenceIds ? { referenceIds: source.referenceIds } : {}), ...(source.model ? { model: source.model } : {}), ...(source.parameters ? { parameters: source.parameters } : {}) }, randomUUID);
    run = current.runs!.at(-1)!;
  }
  const savedStep = current.nodes.find(node => node.id === step.id)!;
  const method = { ...run.method, ...(source.prompt ? { prompt: source.prompt } : {}), ...(source.referenceIds ? { referenceIds: source.referenceIds } : {}), ...(source.model ? { model: source.model } : {}), parameters: { ...run.method.parameters, ...source.parameters } };
  const existing = current.nodes.find(n => n.kind === 'artifact' && n.inputs.length === 1 && n.inputs[0] === step.id && !n.sourceId && !n.runId && n.status === 'planned');
  const id = existing?.id || randomUUID();
  const count = current.nodes.filter(node => node.kind === 'artifact' && node.inputs.includes(step.id) && node.sourceId).length + 1;
  const artifact: ExperimentNode = { ...existing, id, kind: 'artifact', planId: savedStep.planId, runId: run.id, title: input.title || existing?.title || (source.prompt ? `${savedStep.title} · 产物 ${count}`.slice(0, 120) : source.title.slice(0, 120)), description: '保留本次执行的真实产物；提示词、参考图与参数记录在来源方法中。', method: '', prompt: '', content: '', inputs: [step.id], status: source.status, sourceId: source.id, url: source.url, mediaType: source.mediaType, revision: existing?.revision || 1, inputRevisions: { [step.id]: savedStep.revision }, position: existing?.position || { x: step.position.x + 326, y: step.position.y + (count - 1) * 258 } };
  const next = { ...current, revision: current.revision + 1, updatedAt: new Date().toISOString(), runs: current.runs!.map(item => item.id === run!.id ? { ...item, method, artifactIds: [...item.artifactIds, id] } : item), nodes: [...current.nodes.map(n => n.id === step.id && n.activeMethodId === method.id ? { ...n, status: 'running' as const, prompt: method.prompt, methods: n.methods!.map(item => item.id === method.id ? structuredClone(method) : item) } : n).filter(n => n.id !== id), artifact] };
  if (next.nodes.length > 160) throw new ExperimentError('当前实验台最多容纳 160 个节点。');
  return syncExperimentSources(next, project)!;
}

export async function githubJSON(endpoint: string) {
  const response = await fetch(`https://api.github.com${endpoint}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AI-Creative-Lab' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new ExperimentError(response.status === 404 ? '找不到这个公开 GitHub 仓库、版本或 Skill 文件。' : response.status === 403 || response.status === 429 ? 'GitHub 读取额度暂时用尽，请稍后重试。' : `GitHub 读取失败（${response.status}），请稍后重试。`);
  const reader = response.body!.getReader(); let total = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > 3_000_000) { await reader.cancel(); throw new ExperimentError('仓库目录过大，请使用具体 SKILL.md 的 GitHub 链接。'); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function readGitHubSkill(input: z.infer<typeof importExperimentSkillInput>): Promise<{ skill?: ExperimentSkill; choices?: string[] }> {
  const url = new URL(input.url);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port) throw new ExperimentError('请使用 https://github.com/owner/repo 或具体 SKILL.md 链接。');
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [owner, rawRepo, route, reference, ...rest] = segments;
  const repo = rawRepo?.replace(/\.git$/, '');
  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) || (route && !['tree', 'blob'].includes(route))) throw new ExperimentError('GitHub 链接格式不正确。');
  const root = `/repos/${owner}/${repo}`;
  const commit = await githubJSON(`${root}/commits/${encodeURIComponent(reference || 'HEAD')}`);
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new ExperimentError('无法固定 GitHub Skill 版本。');
  let skillPath = input.path || rest.join('/');
  if (skillPath && !skillPath.endsWith('SKILL.md')) skillPath += '/SKILL.md';
  if (!skillPath) {
    const tree = await githubJSON(`${root}/git/trees/${commit.sha}?recursive=1`);
    const choices: string[] = (tree.tree || []).filter((item: { type: string; path: string }) => item.type === 'blob' && /(^|\/)SKILL\.md$/.test(item.path)).map((item: { path: string }) => item.path).slice(0, 40);
    if (!choices.length) throw new ExperimentError('这个仓库里没有找到 SKILL.md。请提供 Skill 文件的具体链接。');
    if (choices.length > 1) return { choices };
    skillPath = choices[0];
  }
  if (skillPath.split('/').some(part => part === '..' || part === '.') || skillPath.length > 500) throw new ExperimentError('Skill 文件路径无效。');
  const file = await githubJSON(`${root}/contents/${skillPath.split('/').map(encodeURIComponent).join('/')}?ref=${commit.sha}`);
  if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 90000) throw new ExperimentError('Skill 文件过大或无法读取，请选择小于 90 KB 的 SKILL.md。');
  const content = Buffer.from(file.content, 'base64').toString('utf8');
  const name = /^name:\s*["']?(.+?)["']?\s*$/m.exec(content)?.[1] || repo;
  return { skill: { repository: `${owner}/${repo}`, path: skillPath, commit: commit.sha, url: `https://github.com/${owner}/${repo}/blob/${commit.sha}/${skillPath.split('/').map(encodeURIComponent).join('/')}`, content, name: name.slice(0, 120) } };
}
export function attachExperimentSkill(graph: ExperimentGraph | undefined, skill: ExperimentSkill, input: z.infer<typeof importExperimentSkillInput>): ExperimentGraph {
  const current = graph || emptyExperiment(), id = input.nodeId || randomUUID();
  const old = current.nodes.find(n => n.id === id);
  if (old && old.kind !== 'skill') throw new ExperimentError('只能替换 Skill 类型的节点。');
  const target = input.targetStepId && current.nodes.find(n => n.id === input.targetStepId);
  if (input.targetStepId && (!target || target.kind !== 'step')) throw new ExperimentError('请选择要使用 Skill 的制作步骤。');
  const next = applyExperimentOperation(current, { op: 'upsert', nodes: [{ id, kind: 'skill', title: skill.name, description: `${skill.repository} · ${skill.path}`, method: `GitHub Skill · ${skill.commit.slice(0, 9)}`, prompt: '', content: skill.content.slice(0, 30000), inputs: [], status: 'completed', position: old?.position || { x: target ? target.position.x : 0, y: target ? target.position.y - 258 : current.nodes.length ? Math.max(...current.nodes.map(n => n.position.y)) + 258 : 0 } }] }, randomUUID);
  next.nodes = next.nodes.map(n => n.id === id ? { ...n, skill } : n);
  return target ? applyExperimentOperation(next, { op: 'patch', id: target.id, changes: { inputs: [...new Set([...target.inputs, id])] } }, randomUUID) : next;
}
