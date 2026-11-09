import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { exampleTasks, validateTask } from './universal-model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync('/Users/cppeng/.codex/visualizations/2026/11/07/01a1b62d-41b0-7050-8b37-a10394452b45/canvas-round-options.html', 'utf8');
const source = html.match(/<script id="canvas-round-source" type="application\/json">([\s\S]*?)<\/script>/)[1];
const javascript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
postcss.parse(html.match(/<style>([\s\S]*?)<\/style>/)[1]);
assert.equal((html.match(/data-variant="/g) || []).length, 3);
assert(!/<(?:html|head|body|!doctype)\b/i.test(html), 'The inline source must remain a fragment');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(javascript), 'Preview must stay offline');
const names = ['snapshots', 'lanes', 'results'], contents = {}, listeners = {}, hostListeners = {};
let savedState, saveCount = 0;
const elements = Object.fromEntries(names.map(name => [name, { dataset: { design: name }, style: { setProperty() {} }, querySelector() { return contents[name] ||= { innerHTML: '' }; } }]));
const root = { querySelector(selector) { return selector === '#canvas-round-source' ? { textContent: source } : elements[selector.match(/data-design="(.*?)"/)[1]]; }, querySelectorAll() { return []; }, addEventListener(name, listener) { listeners[name] = listener; } };
const context = { document: { getElementById: () => root }, window: { addEventListener(name, listener) { hostListeners[name] = listener; }, openai: { setWidgetState(value) { savedState = JSON.parse(JSON.stringify(value)); saveCount++; return Promise.resolve(); } } }, requestAnimationFrame: callback => callback(), ResizeObserver: class { observe() {} disconnect() {} }, console };
vm.runInNewContext(javascript, context, { timeout: 3000 });
const model = context.CanvasRoundDesign, data = model.data;
assert(names.every(name => contents[name].innerHTML.includes('任务画布')), 'All designs must render');
assert.equal(saveCount, 0, 'Loading must not overwrite saved host state');
function click(name, action, id, stage, run) {
  const trigger = { dataset: { action, id, stage: String(stage) }, closest(selector) { return selector === '[data-design]' ? elements[name] : selector === '[data-flow]' && run ? { dataset: { run } } : null; } };
  listeners.click({ target: { closest: () => trigger } });
}
const current = data.runs.find(run => run.current), error = data.runs.find(run => run.ids.length === 1), history = data.runs.find(run => !run.current && run.ids.length > 1);
click('snapshots', 'run', error.id);
assert(contents.snapshots.innerHTML.includes('HTTP 400'), 'Failed historical record must remain inspectable');
click('snapshots', 'current');
click('snapshots', 'stage', undefined, 0, current.id);
assert(contents.snapshots.innerHTML.includes('6 个原始节点'), 'The input bundle must expose its five frames and prompt');
click('lanes', 'lane', history.id);
assert.equal((contents.lanes.innerHTML.match(/data-flow data-run/g) || []).length, 2, 'History expands into its own lane');
click('lanes', 'fold');
assert.equal((contents.lanes.innerHTML.match(/data-flow data-run/g) || []).length, 1, 'Historical lanes collapse without removing data');
const oldResult = data.nodes.find(node => history.ids.includes(node.id) && node.stage === 2);
click('results', 'result', oldResult.id);
assert(model.ancestors(oldResult.id).every(id => !current.ids.includes(id)), 'Result tracing must not pull in the newer production');
click('results', 'attempt-record', error.ids[0]);
assert(contents.results.innerHTML.includes('HTTP 400'), 'Records without a result must not vanish from result mode');
const allReachable = new Set(data.nodes.filter(node => node.kind === 'artifact').flatMap(node => model.ancestors(node.id)));
error.ids.forEach(id => allReachable.add(id));
assert.equal(allReachable.size, data.nodes.length, 'All 24 source nodes remain inspectable');
const stageEdges = model.aggregateEdges(current.ids);
function strictlyCross(a, b, c, d) {
  if (a[0] === b[0] && c[1] === d[1]) return Math.min(c[0], d[0]) < a[0] && a[0] < Math.max(c[0], d[0]) && Math.min(a[1], b[1]) < c[1] && c[1] < Math.max(a[1], b[1]);
  if (a[1] === b[1] && c[0] === d[0]) return strictlyCross(c, d, a, b);
  return false;
}
const scenarios = [], geometry = [];
const boundStates = { ...model.states };
for (const scenario of model.catalog) {
  listeners.change({ target: { value: scenario.id, matches: selector => selector === '[data-task-select]' } });
  const task = model.data, active = task.runs.find(run => run.current), failed = task.runs.find(run => run.historicalError);
  assert.equal(task.id, scenario.id, 'Task picker switches all views');
  assert(names.every(name => contents[name].innerHTML.includes(task.title)), 'Every view must show the selected task');
  assert(names.every(name => model.states[name] === boundStates[name]), 'Task switching must retain objects bound to design controls');
  assert.equal(model.states.snapshots.run, active.id);
  assert(active.ids.includes(model.states.results.result), 'A prior task selection must not leak into the next task');
  for (const attempt of task.runs) {
    click('snapshots', 'run', attempt.id);
    for (const id of attempt.ids) {
      const node = task.nodes.find(item => item.id === id);
      click('snapshots', 'stage', undefined, node.stage, attempt.id);
      click('snapshots', 'node', id);
      assert(contents.snapshots.innerHTML.includes(`<strong>${node.title}</strong>`), 'Every raw node must remain inspectable');
      if (node.renderer === 'generic') assert(contents.snapshots.innerHTML.includes('自定义类型使用通用卡片'));
    }
  }
  const failedNode = task.nodes.find(node => failed.ids.includes(node.id) && node.historicalError);
  click('results', 'attempt-record', failedNode.id);
  assert.equal(model.states.results.fullAttempt, true);
  assert(contents.results.innerHTML.includes(failedNode.error || 'HTTP 400'), 'Failed attempts retain their original error');
  if (failedNode.executionStatus) {
    assert.equal(failedNode.executionStatus, 'failed');
    assert.equal(failedNode.validity, 'superseded');
    assert(contents.results.innerHTML.includes('执行结果：执行失败'));
  }
  for (const output of task.nodes.filter(node => node.kind === 'artifact')) {
    click('results', 'result', output.id);
    assert.equal(model.states.results.fullAttempt, false);
    const attempt = task.runs.find(run => run.ids.includes(output.id));
    assert(model.ancestors(output.id).every(id => attempt.ids.includes(id)), 'Lineage cannot draw another attempt into this result');
    click('results', 'whole-attempt');
    assert(contents.results.innerHTML.includes(`${attempt.ids.length} 个相关节点`), 'Full attempt view retains sibling outputs and unfinished branches');
  }
  click('lanes', 'fold');
  click('lanes', 'lane', failed.id);
  assert.equal((contents.lanes.innerHTML.match(/data-flow data-run/g) || []).length, 2);
  const edges = model.aggregateEdges(active.ids);
  for (const width of [320, 736, 1024]) {
  const wide = width > 620, card = wide ? (width - 60) / 3 : width - 24;
  const boxes = [0, 1, 2].map(index => ({ left: wide ? index * (card + 30) : 0, right: wide ? index * (card + 30) + card : card, cy: wide ? 100 : 80 + index * 180 }));
  const paths = edges.map(([a, b]) => model.route(boxes[a], boxes[b], width));
  let crossings = 0;
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) for (let a = 1; a < paths[i].length; a++) for (let b = 1; b < paths[j].length; b++) if (strictlyCross(paths[i][a - 1], paths[i][a], paths[j][b - 1], paths[j][b])) crossings++;
  assert.equal(crossings, 0, 'Default primary routes must have no strict crossings');
  assert(paths.flat().every(([x, y]) => x >= 0 && x <= width && y >= 0), 'Route points must stay inside the diagram');
    geometry.push({ task: task.type, width, crossings });
  }
  scenarios.push({ type: task.type, nodesInspectable: task.nodes.length, attemptsIsolated: task.runs.length, failedRecordRetained: true, finalOutputs: task.nodes.filter(node => node.stage === 2).length });
}
const saved = JSON.parse(JSON.stringify(savedState));
model.selectTask('video-remix');
const beforeRestore = saveCount;
hostListeners['openai:set_globals']({ detail: { globals: { widgetState: saved } } });
assert.equal(model.data.id, saved.privateContent.taskId, 'Restore remembers the selected task');
assert.equal(saveCount, beforeRestore, 'Restoring state must not save it again');
assert.equal(model.states.results.fullAttempt, saved.privateContent.views.results.fullAttempt);
const contractChecks = exampleTasks().map(validateTask);
assert(contractChecks.every(task => task.unrelatedNodesInSelectedAttempt === 0 && task.failedExecutionPreserved));
const mixed = exampleTasks()[1];
mixed.nodes.find(node => node.attemptId === mixed.runs[1].id).inputs.push(mixed.runs[0].ids[0]);
assert.throws(() => validateTask(mixed), /cross-attempt execution edge/);
const unversioned = exampleTasks()[0];
unversioned.nodes[0].resourceRefs[0].version = '';
assert.throws(() => validateTask(unversioned), /identity and version/);
const empty = { id: 'empty-task', type: 'generic.pending', title: '等待开始的任务', origin: 'illustrative', runs: [{ id: 'empty-attempt', taskId: 'empty-task', ids: [], current: true, status: '待执行', label: '首次执行', sub: '等待输入' }], nodes: [] };
validateTask(empty);
model.catalog.push({ id: empty.id, label: empty.title, model: empty });
model.selectTask(empty.id);
assert(names.every(name => contents[name].innerHTML.includes('尚无执行节点')), 'Empty tasks must render a useful waiting state in all views');
model.catalog.pop();
const report = { sourceNodes: data.nodes.length, designs: 3, scenarios, sceneRenderingAndInteractions: 'passed in a lightweight DOM stub', historyIsolation: 'passed', failedRecordRetention: 'passed', inputBundleExpansion: 'passed', realSourceResultCoverage: allReachable.size, defaultConnectorCount: stageEdges.length, syntheticRouteGeometry: geometry, contractChecks, statePersistence: 'passed', emptyTaskState: 'passed', rejectedCrossAttemptEdges: true, rejectedUnversionedResourceReuse: true, cssAndJavaScript: 'passed', browserInspected: false };
fs.writeFileSync(path.join(here, 'verification.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
