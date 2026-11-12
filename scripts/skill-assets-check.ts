import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import JSZip from 'jszip';
import type { AgentState } from '../shared/intelligent-ui';
import type { ExperimentGraph } from '../shared/experiment';
import type { SkillAsset } from '../shared/skill-assets';

// Isolated local execution only: no browser, network provider, model call or production data.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-skill-check-'));
process.env.SOP_DATA_DIR = temporary;
const execute = promisify(execFile);
let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
try {
  const { createProject, uploadDir } = await import('../server/store');
  const { experimentWorkspace, publishExperimentFile } = await import('../server/experiment-runtime');
  const { emptyExperiment, applyExperimentOperation, experimentOperation } = await import('../shared/experiment');
  const { captureSkillEnvironment, collectSkillSourceFiles, restoreSkillFiles, sha256 } = await import('../server/skill-environment');
  const catalog = await import('../server/skill-assets');
  const { registerSkillAssetRoutes, applyInitialSkills, verifySkillAsset } = await import('../server/skill-asset-routes');
  const { reproducibilityInterval } = await import('../shared/skill-assets');
  const mutate = (graph: ExperimentGraph, operation: unknown) => applyExperimentOperation(graph, experimentOperation.parse(operation), randomUUID);
  const original = createProject(false, undefined, 'Skill verification fixture');
  const workspace = experimentWorkspace(original.id);
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'convert.cjs'), 'process.stdout.write(process.argv[2].toUpperCase());');
  fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ name: 'skill-fixture', version: '1.0.0', private: true }));
  fs.writeFileSync(path.join(workspace, 'package-lock.json'), JSON.stringify({ name: 'skill-fixture', lockfileVersion: 3, packages: { '': { name: 'skill-fixture', version: '1.0.0' } } }));
  fs.writeFileSync(path.join(workspace, '.env'), 'FIXTURE_SECRET=never-deliver');
  let graph = mutate(emptyExperiment(), { op: 'plan', title: '大小写转换', goal: '把输入英文转换为大写' });
  const planId = graph.plans![0].id;
  graph = mutate(graph, { op: 'upsert', nodes: [
    { id: 'input', kind: 'asset', title: '英文输入', content: 'hello', status: 'completed' },
    { id: 'convert', planId, kind: 'step', title: '转换英文', prompt: '将 hello 转换为大写', inputs: ['input'] },
  ] });
  const environment = await captureSkillEnvironment(original.id);
  assert.ok(environment.entries.some(entry => entry.name === 'Node.js' && entry.version === process.version));
  assert.ok(environment.files.some(file => file.path === 'package-lock.json'));
  assert.ok(!collectSkillSourceFiles(original.id).some(file => file.path === '.env'));
  graph = mutate(graph, { op: 'environment', environment });
  graph = mutate(graph, { op: 'start-run', stepId: 'convert', model: `Node.js ${process.version}` });
  const firstRunId = graph.runs!.at(-1)!.id;
  const firstOutput = await execute(process.execPath, [path.join(workspace, 'convert.cjs'), 'hello']);
  fs.writeFileSync(path.join(workspace, 'output.txt'), firstOutput.stdout);
  graph = (await publishExperimentFile(graph, original, { stepId: 'convert', runId: firstRunId, path: 'output.txt', title: '真实大写结果', purpose: 'output' })).graph;
  assert.equal(graph.runs!.at(-1)!.status, 'completed');

  const detail = catalog.publishCreativeSkill('owner', original, graph, { name: '英文转换', summary: '将英文输入转为大写', claims: ['把输入转换为大写'], topics: ['文本处理'], planId, visibility: 'private' });
  const asset = catalog.getSkillAsset(detail.id, 'owner');
  assert.equal(detail.state, 'pending'); assert.equal(detail.fitScore, null);
  assert.throws(() => catalog.getSkillAsset(detail.id, 'other'));
  assert.throws(() => catalog.shareSkill(detail.id, 'other'));
  const delivery = await JSZip.loadAsync(await catalog.skillDeliveryZip(asset, detail.releaseId));
  assert.ok(delivery.file('SKILL.md')); assert.ok(delivery.file('source/package-lock.json')); assert.ok(delivery.file('experiment.json'));
  assert.ok(!Object.keys(delivery.files).some(name => /(?:^|\/)\.env$/.test(name)));
  const frozen = JSON.stringify(detail.release.snapshot);
  const destination = createProject(false);
  let adopted = catalog.adoptSkillSelection(emptyExperiment(), asset, detail.releaseId, destination.id);
  assert.ok(adopted.assetReferences?.[0].snapshotId);
  assert.equal(adopted.assetReferences?.[0].snapshot, undefined, 'Large reference snapshots must not enter every Agent stream');
  assert.equal(adopted.runs!.length, 0);
  assert.ok(adopted.nodes.filter(node => node.kind === 'step' || node.kind === 'artifact').every(node => node.status === 'planned' && !node.sourceId));
  const reference = catalog.resolveSkillReference(adopted.assetReferences![0]);
  assert.equal(reference.snapshot!.id, detail.release.snapshot!.id);
  assert.equal(fs.readFileSync(path.join(experimentWorkspace(destination.id), reference.workspace!, 'convert.cjs'), 'utf8'), 'process.stdout.write(process.argv[2].toUpperCase());');
  const step = adopted.nodes.find(node => node.kind === 'step')!;
  assert.throws(() => mutate(adopted, { op: 'start-run', stepId: step.id }), /记录当前实际环境/);
  adopted = mutate(adopted, { op: 'patch', id: step.id, changes: { prompt: '将 world 转换为大写' } });
  assert.equal(JSON.stringify(catalog.skillRelease(asset).snapshot), frozen, 'Personal edits must preserve reference evidence');
  assert.throws(() => restoreSkillFiles(destination.id, asset.id, detail.releaseId, [{ path: '../escape.js', content: 'bad', sha256: sha256('bad') }]), /路径或校验/);
  console.log('PASS: actual runtime capture, private ownership, immutable reference, editable fork and complete delivery');

  const states = new Map<string, AgentState>();
  const getState = (id: string) => { if (!states.has(id)) states.set(id, { status: 'idle', messages: [] }); return states.get(id)!; };
  const agent = {
    getAgentState: getState,
    setAgentExperiment: (id: string, value: ExperimentGraph) => { getState(id).experiment = value; return value; },
    startAgentTurn: async (id: string) => { getState(id).status = 'running'; return getState(id); },
    interruptAgentTurn: async (id: string) => { getState(id).status = 'idle'; },
    subscribeAgent: () => () => {},
  };
  agent.setAgentExperiment(original.id, graph);
  applyInitialSkills(destination.id, [{ assetId: asset.id, releaseId: detail.releaseId }], 'owner', agent);
  assert.equal(getState(destination.id).experiment!.assetReferences![0].releaseId, detail.releaseId);
  catalog.favoriteSkill(asset.id, 'owner', detail.releaseId, true);
  assert.equal(catalog.listSkillAssets('owner', 'personal').find(item => item.id === asset.id)!.releaseId, detail.releaseId);

  async function officialRun(target: SkillAsset) {
    const project = createProject(false, undefined, 'Official fixture');
    const job = { id: randomUUID(), projectId: project.id, releaseId: target.currentReleaseId, model: 'local-fixture', status: 'running' as const, startedAt: new Date().toISOString() };
    target.jobs.push(job); catalog.saveSkillAsset(target);
    let execution = catalog.adoptSkillSelection(emptyExperiment(), target, target.currentReleaseId, project.id);
    const context = execution.assetReferences![0];
    execution = mutate(execution, { op: 'environment', environment: await captureSkillEnvironment(project.id, undefined, context.workspace) });
    const task = execution.nodes.find(node => node.kind === 'step')!;
    execution = mutate(execution, { op: 'start-run', stepId: task.id, prompt: '将 hello 转换为大写', model: `Node.js ${process.version}` });
    const runId = execution.runs!.at(-1)!.id;
    const output = await execute(process.execPath, [path.join(experimentWorkspace(project.id), context.workspace!, 'convert.cjs'), 'hello']);
    const outputPath = path.join(experimentWorkspace(project.id), 'official-output.txt');
    fs.writeFileSync(outputPath, output.stdout);
    execution = (await publishExperimentFile(execution, project, { stepId: task.id, runId, path: outputPath, title: '官方执行的新结果', purpose: 'output' })).graph;
    return { project, execution, runId };
  }
  let actual = await officialRun(asset);
  const input = { summary: '本地执行观察到 HELLO', topics: ['文本处理'], limitations: ['仅有一个真实样本'], cases: [{ claimIndex: 0, runId: actual.runId, title: '英文转大写', passed: true, observation: '运行交付的源代码，输出文件为 HELLO。' }] };
  const forged = structuredClone(actual.execution);
  const resultNode = forged.nodes.find(node => node.runId === actual.runId)!;
  resultNode.sourceId = detail.release.snapshot!.graph.files![0].id;
  assert.throws(() => catalog.completeSkillEvaluation(actual.project, forged, input, 'local-fixture'), /不能复用参考现场/);
  const report = catalog.completeSkillEvaluation(actual.project, actual.execution, input, 'local-fixture');
  assert.equal(report.state, 'verified'); assert.equal(report.fitScore, 100); assert.equal(report.models[0].trials, 1);
  assert.ok(report.models[0].interval[0] < 0.3, 'One success must not imply high statistical confidence');
  const priorVersion = actual.execution.runs![0].environment!.entries[0].version;
  const changedEnvironment = structuredClone(actual.execution.environment!); changedEnvironment.entries[0].version = 'different-version';
  const changed = mutate(actual.execution, { op: 'environment', environment: changedEnvironment });
  assert.equal(changed.runs![0].environment!.entries[0].version, priorVersion);
  assert.equal(changed.nodes.find(node => node.kind === 'step')!.status, 'stale');
  actual = await officialRun(catalog.getSkillAsset(asset.id, 'owner'));
  const mixed = catalog.completeSkillEvaluation(actual.project, actual.execution, { ...input, cases: [{ ...input.cases[0], runId: actual.runId }, { ...input.cases[0], runId: actual.runId, passed: false, observation: '同一执行的另一项检查未通过。' }] }, 'local-fixture');
  assert.equal(mixed.models[0].trials, 1); assert.equal(mixed.models[0].successes, 0); assert.equal(mixed.fitScore, 0);
  assert.ok(reproducibilityInterval(1, 1)[0] < 0.3);
  console.log('PASS: independent official evidence, inherited-output rejection, claim scoring, deduplicated trials and per-run environment history');

  const app = express(); app.use(express.json());
  app.use((req, res, next) => { res.locals.skillOwnerId = String(req.get('X-Fixture-Owner') || 'owner'); next(); });
  registerSkillAssetRoutes(app, agent, true);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (route: string, body?: unknown, owner = 'owner') => fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Fixture-Owner': owner }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request(`/api/skill-assets/${asset.id}`, undefined, 'other')).status, 400);
  assert.equal((await request(`/api/skill-assets/${asset.id}/share`, {}, 'owner')).status, 200);
  const publicAssets = await (await request('/api/skill-assets')).json();
  assert.ok(publicAssets.assets.some((item: { id: string }) => item.id === asset.id));
  const useResponse = await request(`/api/skill-assets/${asset.id}/use`, { projectId: destination.id, releaseId: detail.releaseId, expectedRevision: 999 });
  assert.equal(useResponse.status, 400); assert.match((await useResponse.json()).error, /实验台已更新/);
  const exported = await request(`/api/skill-assets/${asset.id}/delivery?release=${detail.releaseId}`);
  assert.equal(exported.status, 200); assert.equal(exported.headers.get('content-type'), 'application/zip');
  const zip = await JSZip.loadAsync(await exported.arrayBuffer()); assert.ok(zip.file('environment.json'));
  const toShare = catalog.publishCreativeSkill('owner', original, graph, { name: '自动验证入口', summary: '验证公开发布会启动统一评测', claims: ['把输入转换为大写'], topics: ['文本处理'], planId, visibility: 'private' });
  const shared = await (await request(`/api/skill-assets/${toShare.id}/share`, {})).json();
  assert.equal(shared.state, 'running'); assert.equal(shared.fitScore, null);
  await request(`/api/skill-assets/${toShare.id}/share`, {});
  assert.equal(catalog.getSkillAsset(toShare.id, 'owner').jobs.length, 1, 'Repeated publication must not start duplicate official workers');
  const stopped = await (await request(`/api/skill-assets/${toShare.id}/stop`, {})).json();
  assert.equal(stopped.state, 'blocked'); assert.equal(stopped.fitScore, null);
  const published = await (await request(`/api/projects/${original.id}/skill-assets`, { name: '公开创作沉淀', summary: '验证公开保存直接启动官方工作流', claims: ['把输入转换为大写'], topics: ['文本处理'], planId, visibility: 'public' })).json();
  assert.equal(published.state, 'running');
  const disabled = catalog.publishCreativeSkill('owner', original, graph, { name: '未启用的执行器', summary: '缺少执行能力时不产生评分', claims: ['把输入转换为大写'], topics: ['文本处理'], planId, visibility: 'private' });
  const blocked = await verifySkillAsset(disabled.id, 'owner', disabled.releaseId, agent, false, true);
  assert.equal(blocked.state, 'blocked'); assert.equal(blocked.fitScore, null);
  assert.ok(fs.readdirSync(uploadDir).some(filename => filename.startsWith('skill-')));
  console.log('PASS: public/personal API, automatic official dispatch, duplicate suppression, blocked execution, version pinning and delivery');
} finally {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  fs.rmSync(temporary, { recursive: true, force: true });
}
