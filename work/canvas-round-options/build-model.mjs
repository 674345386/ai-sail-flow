import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { exampleTasks, validateTask } from './universal-model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../..');
const source = path.resolve(project, process.argv[2] || 'data/agent-sessions/3e13bae3-f32e-4b38-ae4c-fee25e66da7d.json');
const destination = '/Users/cppeng/.codex/visualizations/2026/11/07/01a1b62d-41b0-7050-8b37-a10394452b45/canvas-round-options.html';
const raw = fs.readFileSync(source, 'utf8');
const session = JSON.parse(raw), graph = session.experiment;
assert(graph?.nodes?.length, 'No experiment graph in the supplied session');
const nodes = graph.nodes, byId = new Map(nodes.map(node => [node.id, node]));
assert.equal(byId.size, nodes.length, 'Duplicate node IDs');
const adjacent = new Map(nodes.map(node => [node.id, new Set()]));
for (const node of nodes) for (const input of node.inputs) {
  assert(byId.has(input), `Missing input: ${input}`);
  adjacent.get(node.id).add(input); adjacent.get(input).add(node.id);
}
const seen = new Set(), components = [];
for (const node of nodes) {
  if (seen.has(node.id)) continue;
  const stack = [node.id], ids = [];
  while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id); ids.push(id); stack.push(...adjacent.get(id)); }
  components.push(ids);
}
const generator = node => node.kind === 'step' && /generate|minimax/i.test(`${node.id} ${node.method}`);
const outcome = node => node.kind === 'artifact' && node.inputs.some(id => generator(byId.get(id)));
const stage = node => outcome(node) ? 2 : node.kind === 'asset' || (node.kind === 'artifact' && !node.inputs.length) ? 0 : 1;
const current = components.find(ids => ids.some(id => /480/.test(byId.get(id).title)) && ids.every(id => byId.get(id).status === 'completed')) || components.at(-1);
const runs = components.map((ids, index) => {
  const members = ids.map(id => byId.get(id));
  const historicalError = members.some(node => /HTTP\s*400|返回HTTP 400|HTTP 400/.test(`${node.description} ${node.content} ${node.error}`));
  const isCurrent = ids === current;
  return { id: `group-${index}`, ids, current: isCurrent, status: isCurrent ? '已完成' : historicalError && ids.length === 1 ? '历史报错' : '需要更新', historicalError,
    label: isCurrent ? '480p 参考图制作' : ids.length === 1 ? '早期视频拆解' : '文生视频制作',
    sub: isCurrent ? '当前结果 · 13 秒 · 5 张参考图' : ids.length === 1 ? '接口错误记录 · 尚无成片' : '旧流程 · 保留输入、步骤和结果' };
}).sort((a, b) => Number(b.current) - Number(a.current) || b.ids.length - a.ids.length);

fs.mkdirSync(path.join(here, 'thumbs'), { recursive: true });
const images = new Map();
function preview(url) {
  if (!url?.startsWith('/media/')) return null;
  const name = path.basename(url.split('?')[0]);
  let input = path.join(project, 'data/uploads', name);
  if (/\.(mp4|webm|mov)$/i.test(input)) input += '.jpg';
  if (!/\.(jpe?g|png|webp)$/i.test(input) || !fs.existsSync(input)) return null;
  if (images.has(input)) return images.get(input);
  const thumb = path.join(here, 'thumbs', `${crypto.createHash('sha1').update(input).digest('hex').slice(0, 12)}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-Z', '320', input, '--out', thumb], { stdio: 'ignore' });
  const result = `data:image/jpeg;base64,${fs.readFileSync(thumb).toString('base64')}`;
  images.set(input, result);
  return result;
}
const safeText = text => String(text || '').replace(/https?:\/\/\S+/g, '[资源地址]').slice(0, 180);
const model = { id: 'video-remix', type: 'video.remix', title: '视频复刻任务', inputLabel: '参考帧与提示词', origin: 'real', revision: graph.revision, grouping: 'inferred-from-dependencies', runs,
  nodes: nodes.map(node => ({ id: node.id, title: node.title, kind: node.kind, status: node.status, inputs: node.inputs,
    stage: stage(node), source: node.sourceId || null, media: node.mediaType || 'text', image: preview(node.url),
    detail: safeText(node.description || node.content || node.prompt), method: node.method || '', error: /HTTP\s*400|返回HTTP 400/.test(`${node.description} ${node.content}`) ? 'HTTP 400 · 历史接口错误' : null,
    historicalError: /HTTP\s*400|返回HTTP 400/.test(`${node.description} ${node.content}`) })) };
const sourceGroups = new Map();
for (const node of nodes) if (node.sourceId) sourceGroups.set(node.sourceId, [...(sourceGroups.get(node.sourceId) || []), node.id]);
const membership = new Map(runs.flatMap(run => run.ids.map(id => [id, run.id])));
const crossGroupEdges = nodes.flatMap(node => node.inputs.filter(id => membership.get(id) !== membership.get(node.id)));
assert.equal(crossGroupEdges.length, 0, 'Dependency groups must remain isolated');
assert.deepEqual(new Set(runs.flatMap(run => run.ids)), new Set(nodes.map(node => node.id)), 'All nodes must remain available');
const stageEdges = ids => [...new Set(ids.flatMap(id => byId.get(id).inputs.filter(input => ids.includes(input) && stage(byId.get(input)) !== stage(byId.get(id))).map(input => `${stage(byId.get(input))}-${stage(byId.get(id))}`)))];
for (const run of runs) assert(stageEdges(run.ids).every(edge => ['0-1', '1-2'].includes(edge)), 'An aggregate connector would misrepresent a dependency');
const ancestors = id => { const result = new Set(); const visit = value => { if (result.has(value)) return; result.add(value); byId.get(value).inputs.forEach(visit); }; visit(id); return [...result]; };
const lineageCoverage = new Set(nodes.filter(node => node.kind === 'artifact' || adjacent.get(node.id).size === 0).flatMap(node => ancestors(node.id)));
assert.equal(lineageCoverage.size, nodes.length, 'Result tracing must also expose intermediate outputs and failed records');
const report = { graphRevision: graph.revision, sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'), nodeCount: nodes.length,
  edgeCount: nodes.reduce((sum, node) => sum + node.inputs.length, 0), states: nodes.reduce((result, node) => (result[node.status] = (result[node.status] || 0) + 1, result), {}),
  dependencyGroupSizes: runs.map(run => run.ids.length), nodesWithRoundOwnership: nodes.filter(node => ['attemptId', 'runId', 'turnId', 'originTurnId'].some(key => node[key])).length,
  sharedAssetGroups: [...sourceGroups.values()].filter(ids => ids.length > 1).length,
  checks: { allNodesCovered: true, invalidInputIds: 0, crossGroupEdges: 0, latestDefaultNodes: current.length, unrelatedHistoricalNodesInDefault: 0,
    latestAggregatedNodes: new Set(current.map(id => stage(byId.get(id)))).size, latestAggregatedEdges: stageEdges(current).length, resultTracingCoverage: lineageCoverage.size },
  caveat: 'The current schema has no per-node round ownership. Prototype histories are dependency groups, not reconstructed immutable execution snapshots.' };
const examples = exampleTasks();
const referenceImage = model.nodes.find(node => node.id === 'remix480-ref-1')?.image;
for (const node of examples[0].nodes) if (node.source === 'resource:product-reference') { node.image = referenceImage; node.media = 'image'; }
const scenarioNames = ['图片设计', '代码修改', '文档编写', '研究分析', '自定义任务'];
const catalog = { scenarios: [{ id: 'video-remix', label: '视频复刻 · 真实数据', model }, ...examples.map((model, index) => ({ id: model.id, label: `${scenarioNames[index]} · 示例`, model }))] };
report.universalScenarios = examples.map(validateTask);
fs.writeFileSync(path.join(here, 'model.json'), JSON.stringify(catalog));
fs.writeFileSync(path.join(here, 'analysis.json'), JSON.stringify(report, null, 2));
const template = fs.readFileSync(path.join(here, 'prototype.html'), 'utf8');
assert(template.includes('__CANVAS_DATA__'), 'Missing data slot');
const html = template.replace('__CANVAS_DATA__', JSON.stringify(catalog).replaceAll('<', '\\u003c'));
assert(Buffer.byteLength(html) < 1024 * 1024, 'Inline prototype exceeds 1 MiB');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, html);
console.log(JSON.stringify({ ...report, prototype: destination, bytes: Buffer.byteLength(html) }, null, 2));
