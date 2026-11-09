import assert from 'node:assert/strict';

// Proposed shared projection contract. Business type and renderer identifiers
// remain open strings; the same ownership rules apply to every task domain.
export function overviewStage(node) { return node.role === 'input' ? 0 : node.isFinal ? 2 : 1; }
export function rendererFor(node) { return ['input', 'process', 'artifact', 'decision', 'loop', 'control'].includes(node.rendererHint || node.role) ? node.rendererHint || node.role : 'generic'; }

export function validateTask(task) {
  assert(task.id && typeof task.type === 'string', 'A task needs an identity and an open business type');
  const nodes = new Map(task.nodes.map(node => [node.id, node]));
  const attempts = new Map(task.runs.map(attempt => [attempt.id, attempt]));
  assert.equal(nodes.size, task.nodes.length, 'Node identities must be unique');
  assert.equal(attempts.size, task.runs.length, 'Attempt identities must be unique');
  assert.equal(task.runs.filter(attempt => attempt.current).length, 1, 'A task has one selected attempt');
  const represented = new Set();
  for (const attempt of task.runs) {
    assert.equal(attempt.taskId, task.id, 'An attempt cannot migrate into another task');
    for (const id of attempt.ids) {
      const node = nodes.get(id);
      assert(node && node.taskId === task.id && node.attemptId === attempt.id, 'Node ownership must match the task and attempt');
      assert(!represented.has(id), 'A node belongs to one attempt; resources are referenced separately');
      represented.add(id);
    }
  }
  assert.equal(represented.size, task.nodes.length, 'Every node remains reachable through an attempt');
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    assert(!visiting.has(id), 'Causal execution edges are acyclic; logical loops use an iteration group');
    visiting.add(id);
    const node = nodes.get(id);
    for (const inputId of node.inputs) {
      const input = nodes.get(inputId);
      assert(input, 'An input must exist');
      assert.equal(input.attemptId, node.attemptId, 'Reuse an immutable resource reference instead of drawing a cross-attempt execution edge');
      visit(inputId);
    }
    for (const reference of node.resourceRefs || []) assert(reference.id && reference.version, 'A reused resource must pin its identity and version');
    visiting.delete(id); visited.add(id);
  }
  task.nodes.forEach(node => visit(node.id));
  const current = task.runs.find(attempt => attempt.current);
  return { type: task.type, attempts: task.runs.length, nodes: task.nodes.length, selectedAttemptNodes: current.ids.length,
    unrelatedNodesInSelectedAttempt: current.ids.filter(id => nodes.get(id).attemptId !== current.id).length,
    genericFallbackNodes: task.nodes.filter(node => rendererFor(node) === 'generic').length,
    failedExecutionPreserved: task.nodes.filter(node => node.executionStatus === 'failed').every(node => node.status === 'failed'),
    parallelJoins: task.nodes.filter(node => node.inputs.length > 1).length,
    finalOutputs: task.nodes.filter(node => node.isFinal).length,
    loopGroups: task.nodes.filter(node => node.role === 'loop').length };
}

function makeTask({ id, type, title, inputLabel, old, current }) {
  const task = { id, type, title, inputLabel, origin: 'illustrative', revision: 1, grouping: 'explicit-ownership', runs: [], nodes: [] };
  for (const [index, spec] of [old, current].entries()) {
    const attemptId = `${id}-attempt-${index + 1}`;
    const ids = spec.nodes.map(node => `${attemptId}-${node.key}`);
    const attempt = { id: attemptId, taskId: id, originTurnId: `${id}-turn-${index + 1}`, label: spec.label, ids, current: index === 1,
      status: spec.failed ? '执行失败' : '已完成', outcome: spec.failed ? 'failed' : 'completed', historicalError: !!spec.failed,
      sub: spec.failed ? '保留已完成步骤与中间产物，可从失败处继续' : '当前尝试 · 所有输入版本已记录' };
    task.runs.push(attempt);
    for (const node of spec.nodes) {
      const role = node.role || 'process';
      const item = { id: `${attemptId}-${node.key}`, taskId: id, attemptId, originTurnId: attempt.originTurnId, role, kind: role === 'input' ? 'asset' : role === 'artifact' ? 'artifact' : 'step',
        title: node.title, inputs: (node.inputs || []).map(key => `${attemptId}-${key}`), isFinal: !!node.final,
        executionStatus: node.failed ? 'failed' : 'completed', validity: index ? 'current' : 'superseded', status: node.failed ? 'failed' : 'completed',
        availability: role === 'input' || role === 'artifact' ? 'available' : 'not-applicable',
        media: node.media || 'text', image: null, source: node.resource || null, resourceRefs: node.resource ? [{ id: node.resource, version: node.version || 'v1' }] : [],
        detail: node.detail || node.error || '任务上下文、输入版本与执行记录归属于当前尝试。', method: node.method || '', error: node.error || null,
        historicalError: !!node.failed, rendererHint: node.rendererHint || role, artifactType: node.artifactType || 'text/plain' };
      item.stage = overviewStage(item); item.renderer = rendererFor(item); task.nodes.push(item);
    }
  }
  validateTask(task);
  return task;
}

export function exampleTasks() {
  const input = (key, title, resource) => ({ key, title, role: 'input', resource });
  const operation = (key, title, inputs, extra = {}) => ({ key, title, inputs, ...extra });
  const artifact = (key, title, inputs, final = true, extra = {}) => ({ key, title, role: 'artifact', inputs, final, ...extra });
  const failure = (key, title, inputs, error) => operation(key, title, inputs, { failed: true, error });
  return [
    makeTask({ id: 'image-design', type: 'image.edit', title: '图片设计任务', inputLabel: '参考图与修改要求',
      old: { label: '初次改图', failed: true, nodes: [input('ref', '产品参考图', 'resource:product-reference'), input('brief', '保留轮廓，修改背景', 'resource:image-brief'), failure('edit', '图片编辑', ['ref', 'brief'], '参考图格式未通过校验；未产出成图。')] },
      current: { label: '规范化图片后重试', nodes: [input('ref', '复用产品参考图', 'resource:product-reference'), input('brief', '修改要求 · v2', 'resource:image-brief-v2'), operation('normalize', '转换格式并检查尺寸', ['ref']), operation('edit', '执行图片编辑', ['normalize', 'brief']), artifact('result', '背景修改结果.png', ['edit'], true, { artifactType: 'image/png' })] } }),
    makeTask({ id: 'code-change', type: 'code.change', title: '代码修改任务', inputLabel: '仓库版本与修改要求',
      old: { label: '首次补丁与失败记录', failed: true, nodes: [input('repo', '代码仓库 · commit A', 'resource:repository-A'), operation('patch', '生成初次补丁', ['repo']), artifact('partial', '保留的初次修改.diff', ['patch'], false, { artifactType: 'text/x-diff' }), failure('test', '集成检查失败', ['partial'], '模块导出不匹配；保留补丁，不标记整个任务成功。')] },
      current: { label: '前后端并行修正', nodes: [input('repo', '代码仓库 · commit A', 'resource:repository-A'), input('brief', '修复需求与验收标准', 'resource:issue-brief'), operation('ui', '调整前端组件', ['repo', 'brief']), operation('api', '调整接口模块', ['repo', 'brief']), operation('verify', '合并修改并运行检查', ['ui', 'api']), artifact('patch', '已验证的修改.diff', ['verify'], true, { artifactType: 'text/x-diff' }), artifact('report', '检查结果.json', ['verify'], true, { artifactType: 'application/json' })] } }),
    makeTask({ id: 'document', type: 'document.author', title: '文档编写任务', inputLabel: '写作要求与引用材料',
      old: { label: '初稿与导出失败', failed: true, nodes: [input('brief', '写作要求', 'resource:document-brief'), operation('draft', '完成文档初稿', ['brief']), artifact('partial', '保留的初稿.md', ['draft'], false), failure('export', '文档导出失败', ['partial'], '缺少引用资源；初稿仍可使用。')] },
      current: { label: '补齐引用并导出', nodes: [input('brief', '复用写作要求', 'resource:document-brief'), input('sources', '引用材料与图片', 'resource:document-sources'), operation('draft', '修订正文与引用', ['brief', 'sources']), operation('render', '排版与导出', ['draft']), artifact('docx', '交付文档.docx', ['render'], true, { artifactType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), artifact('pdf', '阅读版本.pdf', ['render'], true, { artifactType: 'application/pdf' })] } }),
    makeTask({ id: 'research', type: 'research.analysis', title: '研究分析任务', inputLabel: '研究问题与数据版本',
      old: { label: '首轮证据不足', failed: true, nodes: [input('question', '研究问题', 'resource:research-question'), operation('collect', '收集初步材料', ['question']), failure('check', '证据交叉核验', ['collect'], '关键结论缺少一手来源，保留检索记录。')] },
      current: { label: '补齐证据并迭代审阅', nodes: [input('question', '复用研究问题', 'resource:research-question'), operation('primary', '收集一手资料', ['question']), operation('data', '整理原始数据', ['question']), operation('review', '迭代审阅 · 2 次', ['primary', 'data'], { role: 'loop', detail: '逻辑循环折叠成迭代组，每次实际执行有独立记录；不把回边拉到整张画布。' }), artifact('report', '研究报告.md', ['review']), artifact('evidence', '证据清单.csv', ['review'], true, { artifactType: 'text/csv' })] } }),
    makeTask({ id: 'extension-task', type: 'vendor.unregistered-task', title: '自定义扩展任务', inputLabel: '配置与外部资源引用',
      old: { label: '首次扩展执行失败', failed: true, nodes: [input('config', '扩展配置 · v1', 'resource:extension-config'), failure('run', '扩展工具执行', ['config'], '扩展工具返回错误；原始输入与错误原文均保留。')] },
      current: { label: '未知类型使用通用展示', nodes: [input('config', '扩展配置 · v2', 'resource:extension-config-v2'), operation('run', '扩展工具步骤', ['config'], { rendererHint: 'vendor:custom-control', method: '第三方工具适配器' }), artifact('bundle', '任务产物.bundle', ['run'], true, { artifactType: 'application/x-vendor-bundle', rendererHint: 'vendor:custom-artifact' })] } }),
  ];
}
