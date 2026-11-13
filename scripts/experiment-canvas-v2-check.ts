import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlow } from '@xyflow/react';
import { activeExperimentMethod, applyExperimentOperation, emptyExperiment, experimentNodeInput, experimentOperation, layoutExperiment, type ExperimentGraph, type ExperimentNode } from '../shared/experiment';
import { assertExperimentRouteExecution } from '../shared/experiment-planning';
import type { Project } from '../shared/domain';
import { addCanvasReference, canvasModels, canvasNodeRatio, canvasOutputKind, canvasReference, composerStep, selectedCanvasRelations, validateCanvasMethod } from '../src/experiment-canvas-model';
import { ExperimentCanvasNode, type ExperimentCanvasFlowNode } from '../src/ExperimentCanvasNode';
import ExperimentCanvasComposer from '../src/ExperimentCanvasComposer';
import { experimentNodePresentation } from '../src/experiment-status';

let sequence = 0; const uid = () => `canvas-${++sequence}`;
const source: ExperimentNode = { ...experimentNodeInput.parse({ id: 'source', kind: 'asset', title: '原始图片', sourceId: 'picture', status: 'completed' }),
  revision: 4, inputRevisions: {}, position: { x: 20, y: 40 }, mediaType: 'image', url: '/media/source.png' };
const initial: ExperimentGraph = { ...emptyExperiment(), policy: { level: 1, decision: 'choose', maxRoutes: 4 }, nodes: [source] };
const create = experimentOperation.parse({ op: 'canvas-next', sourceId: source.id, kind: 'video', model: 'h3-video', aspectRatio: '9:16' });
const created = applyExperimentOperation(initial, create, uid);
const step = created.nodes.find(node => node.kind === 'step')!, output = created.nodes.find(node => node.kind === 'artifact')!;
assert.deepEqual(step.inputs, [source.id]);
assert.deepEqual(activeExperimentMethod(step)!.referenceIds, ['picture']);
assert.equal(activeExperimentMethod(step)!.model, 'h3-video');
assert.equal(output.mediaType, 'video');
assert.equal(output.status, 'planned'); assert.equal(output.url, undefined);
assert.equal(created.runs!.length, 0, 'Adding a canvas step never executes generation');
assert.equal(initial.nodes.length, 1, 'Creation preserves the source graph');
assert.equal(composerStep(created, output)!.id, step.id);
assert.equal(composerStep(created, { ...output, runId: 'historical' }), undefined, 'Historical outputs remain immutable');
assert.equal(canvasOutputKind(created, step), 'video');
assert.throws(() => assertExperimentRouteExecution(created, step.id), /选择/);

const originalRevision = source.revision;
const resized = applyExperimentOperation(created, experimentOperation.parse({ op: 'resize', id: source.id, width: 410, aspectRatio: 9 / 16, position: { x: 35, y: 60 } }), uid);
const resizedSource = resized.nodes.find(node => node.id === source.id)!;
assert.equal(resizedSource.revision, originalRevision, 'Resizing is display metadata, not a source change');
assert.equal(resizedSource.status, 'completed');
assert.equal(resizedSource.display!.width, 410);
assert.deepEqual(resizedSource.position, { x: 35, y: 60 });
assert.equal(resized.nodes.find(node => node.id === step.id)!.status, 'planned');
assert.equal(experimentOperation.safeParse({ op: 'resize', id: 'source', width: 0 }).success, false);

const project = { assets: [{ id: 'picture', width: 900, height: 1600 }], agentImages: [], generatedVideos: [] } as unknown as Project;
assert.equal(canvasNodeRatio(source, created, project), 9 / 16);
assert.equal(canvasNodeRatio(output, created, project), 9 / 16, 'Empty results use the requested generation ratio');
assert.equal(canvasNodeRatio(output, created, project, 16 / 9), 16 / 9, 'Real media dimensions take precedence');
const modelList = canvasModels({ imageGeneration: { configured: true, model: 'gpt-image-2.6-flare' }, minimaxVideoGeneration: { configured: true, models: ['h3-video', 'h3-video-flex', 'h3-video-frames'] }, videoGeneration: { configured: true } });
assert.equal(canvasModels({}).length, 0);
assert.equal(modelList.some(model => model.id === 'h3-video'), true);
assert.equal(modelList.some(model => model.id === 'h3-video-frames'), false, 'First/last-frame models require their own input flow');
assert.equal(new Set(modelList.map(model => model.id)).size, modelList.length);

const sources = [{ id: 'picture', title: '原始图片', mediaType: 'image' as const, url: '/media/source.png', referenceAvailable: true }];
const reference = canvasReference(created, 'source', sources)!;
assert(reference);
assert.equal(canvasReference(created, 'missing', sources), undefined);
assert.equal(canvasReference({ ...created, nodes: [{ ...source, status: 'running' }] }, 'source', sources), undefined);
const method = activeExperimentMethod(step)!;
assert.deepEqual(addCanvasReference(method, reference).referenceIds, ['picture'], 'Duplicate drops are idempotent');
assert.deepEqual(addCanvasReference({ ...method, inputs: [] }, reference).inputs, ['source'], 'A known reference can still create its missing dependency');
assert.throws(() => addCanvasReference(method, { source: { id: 'video', title: 'video', mediaType: 'video' } }), /图片/);
const updatedMethod = { ...method, prompt: '保持人物外观，镜头缓缓向前推进。', parameters: { aspectRatio: '9:16', duration: 6, resolution: '768p' } };
const saved = applyExperimentOperation(created, { op: 'method', stepId: step.id, method: updatedMethod }, uid);
validateCanvasMethod(updatedMethod, modelList);
assert.throws(() => validateCanvasMethod({ ...updatedMethod, parameters: { aspectRatio: '21:9', duration: 15, resolution: '1080p' }, model: 'h3-video-flex' }, modelList), /最长 10/);
assert.throws(() => validateCanvasMethod({ ...updatedMethod, model: 'omni_flash_10s', parameters: { aspectRatio: '1:1', duration: 10 } }, modelList), /16:9/);
assert.throws(() => validateCanvasMethod({ ...updatedMethod, model: 'gpt-image-2.6-flare', parameters: {}, referenceIds: ['a', 'b', 'c', 'd', 'e'] }, modelList), /4 张/);
const reloaded = JSON.parse(JSON.stringify(resized)) as ExperimentGraph;
assert.deepEqual(reloaded.nodes.find(node => node.id === source.id)!.display, resizedSource.display, 'Saved display metadata survives JSON persistence');
assert.deepEqual(activeExperimentMethod(saved.nodes.find(node => node.id === step.id)!)!.parameters, updatedMethod.parameters);
assert.equal(activeExperimentMethod(saved.nodes.find(node => node.id === step.id)!)!.prompt, updatedMethod.prompt);
const alternative = applyExperimentOperation(saved, { op: 'branch-method', stepId: step.id }, uid);
const alternatives = alternative.nodes.find(node => node.id === step.id)!.methods!;
assert.equal(alternatives.length, 2); assert.equal(alternatives[0].prompt, updatedMethod.prompt);
assert.equal(alternative.runs!.length, 0);
assert.deepEqual([...selectedCanvasRelations(created, step.id)].sort(), ['source', step.id, output.id].sort());

const sibling = { ...source, id: 'sibling', position: { x: 0, y: 0 } };
const arranged = layoutExperiment([source, sibling, step], [{ id: 'source', width: 640, height: 800 }, { id: 'sibling', width: 220, height: 392 }, { id: step.id, width: 266, height: 218 }]);
assert.equal(arranged[1].position.y, 874, 'Tall media cannot overlap the next row after arrange');
assert.equal(arranged[2].position.x, 764, 'Column spacing follows resized media widths');

const node: ExperimentCanvasFlowNode = { id: source.id, type: 'experiment', position: source.position, width: 220, height: 392,
  data: { item: source, ratio: 9 / 16, presentation: experimentNodePresentation(source, created), onOpenCompleted() {}, onNextMenu() {}, onPreview() {}, onMediaSize() {}, onResize() {} } };
const markup = renderToStaticMarkup(createElement(ReactFlow<ExperimentCanvasFlowNode>, { nodes: [node], nodeTypes: { experiment: ExperimentCanvasNode }, width: 1000, height: 800 }));
assert.match(markup, /原始图片/); assert.match(markup, /data-canvas-node="source"/);
assert.match(markup, /--lab-node-ratio:0\.5625/);
assert.match(markup, /放大查看素材/); assert.match(markup, /添加下一步或拖动连接/);
const savedStep = saved.nodes.find(node => node.id === step.id)!;
const composerMarkup = renderToStaticMarkup(createElement(ExperimentCanvasComposer, { projectId: 'fixture', selected: savedStep, step: savedStep, graph: saved, sources, models: modelList, busy: false,
  mutate: async () => undefined, onExecute() {}, onDetails() {}, onClose() {}, onNext() {}, onDirty() {},
}));
assert.match(composerMarkup, /当前步骤的创作要求/); assert.match(composerMarkup, /保持人物外观/);
assert.match(composerMarkup, /MiniMax H3/); assert.match(composerMarkup, /@/); assert.match(composerMarkup, /生成比例/);
console.log('PASS · 下一步原子创建、图片引用继承、无自动生成、历史保护、缩放持久化、比例推导、真实模型列表、引用去重、参数保存、模型参数校验、备选保留、关系高亮、动态整理间距、节点与浮动面板渲染');
