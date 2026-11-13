import type { Project } from '../shared/domain';
import { activeExperimentMethod, type ExperimentGraph, type ExperimentMethod, type ExperimentNode, type ExperimentRun } from '../shared/experiment';
import type { WorkbenchSource } from './ExperimentPlans';
import { canvasNodeRatio, canvasOutputKind } from './experiment-canvas-model';

export type TurnPosition = { x: number; y: number; width?: number; ratio?: number };
export type TurnCanvasItem = {
  id: string; turnId: string; stepId: string; canonicalId?: string;
  role: 'input' | 'output' | 'heading'; item: ExperimentNode;
  position: { x: number; y: number }; width: number; ratio: number;
};
export type CanvasTurn = { id: string; title: string; index: number; stepId: string; runId?: string; nodeIds: string[]; method: ExperimentMethod };

/** View instances only. Nothing here is written back as a project node or media file. */
export function executionTurnCanvas(graph: ExperimentGraph, project: Project, sources: WorkbenchSource[], natural: Record<string, number> = {}, saved: Record<string, TurnPosition> = {}) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const items: TurnCanvasItem[] = [], turns: CanvasTurn[] = [], edges: { id: string; source: string; target: string; animated: boolean }[] = [];
  const counts = new Map<string, number>();
  let y = 120;
  const sameMethod = (a: ExperimentMethod, b: ExperimentMethod) => a.id === b.id && JSON.stringify([a.prompt, a.inputs, a.referenceIds, a.model, a.parameters]) === JSON.stringify([b.prompt, b.inputs, b.referenceIds, b.model, b.parameters]);
  const attempts: { step: ExperimentNode; method: ExperimentMethod; run?: ExperimentRun; outputs: ExperimentNode[] }[] = (graph.runs || []).flatMap(run => {
    const step = byId.get(run.stepId);
    return step ? [{ step, method: run.method, run, outputs: run.artifactIds.map(id => byId.get(id)).filter((node): node is ExperimentNode => !!node) }] : [];
  });
  for (const step of graph.nodes.filter(node => node.kind === 'step')) {
    const method = activeExperimentMethod(step);
    if (method && !attempts.some(attempt => attempt.step.id === step.id && sameMethod(attempt.method, method))) attempts.push({ step, method, run: undefined, outputs: graph.nodes.filter(node => node.kind === 'artifact' && !node.runId && node.inputs.includes(step.id)) });
  }
  for (const attempt of attempts) {
    const { step, method, run } = attempt;
    const ordinal = (counts.get(step.id) || 0) + 1; counts.set(step.id, ordinal);
    // The ordinal remains stable when a draft becomes a real run.
    const turnId = `turn:${step.id}:${ordinal}`;
    const turn: CanvasTurn = { id: turnId, title: step.title, index: turns.length + 1, stepId: step.id, runId: run?.id, nodeIds: [], method };
    turns.push(turn);
    const inputs: { item: ExperimentNode; canonicalId?: string }[] = [];
    const used = new Set<string>();
    const addInput = (item: ExperimentNode, canonicalId?: string) => {
      const key = item.sourceId || canonicalId || item.id;
      if (!used.has(key)) { used.add(key); inputs.push({ item, canonicalId }); }
    };
    for (const sourceId of method.referenceIds) {
      const existing = graph.nodes.find(node => node.sourceId === sourceId);
      const source = sources.find(source => source.id === sourceId);
      if (existing) addInput(existing, existing.id);
      else addInput({ id: sourceId, sourceId, kind: 'asset', title: source?.title || '参考素材不可用', url: source?.url, mediaType: source?.mediaType, status: source ? 'completed' : 'stale', content: '', prompt: '', method: '', description: '', inputs: [], position: { x: 0, y: 0 }, revision: 1, inputRevisions: {} });
    }
    for (const id of method.inputs) { const input = byId.get(id); if (input) addInput(input, id); }
    const add = (item: ExperimentNode, role: TurnCanvasItem['role'], id: string, x: number, top: number, canonicalId?: string) => {
      const override = saved[id];
      const ratio = override?.ratio || canvasNodeRatio(item, graph, project, natural[id] || natural[item.sourceId || item.id]);
      const media = item.mediaType === 'image' || item.mediaType === 'video';
      const width = override?.width || (media ? ratio > 1.3 ? 280 : 200 : 250);
      const entry: TurnCanvasItem = { id, turnId, stepId: step.id, canonicalId, role, item, position: override ? { x: override.x, y: override.y } : { x, y: top }, width, ratio };
      items.push(entry); turn.nodeIds.push(id);
      return { entry, height: media ? width / ratio + 78 : 296 };
    };
    const heading: ExperimentNode = { ...step, title: `Turn ${turn.index} · ${step.title}`, description: `${inputs.length} 个输入 → ${attempt.outputs.length || 1} 个输出 · ${run ? run.status === 'running' ? '执行中' : '已执行' : '待执行'}`, content: method.model || method.title, inputs: [], position: { x: 0, y }, status: run?.status || step.status };
    const header = add(heading, 'heading', `${turnId}:heading`, 0, y - 108, step.id);
    header.entry.width = 1200;
    let inputBottom = y, outputBottom = y;
    const inputColumns = inputs.length > 2 ? 2 : 1, inputBottoms = [y, y];
    const inputIds: string[] = [];
    inputs.forEach((input, index) => {
      const column = index % inputColumns;
      const added = add(input.item, 'input', `${turnId}:input:${input.item.sourceId || input.item.id}`, column * 300, inputBottoms[column], input.canonicalId);
      inputIds.push(added.entry.id); inputBottoms[column] += added.height + 30; inputBottom = Math.max(...inputBottoms);
    });
    const outputs = attempt.outputs.length ? attempt.outputs : [{ ...step, kind: 'artifact' as const, title: `输出 · ${step.title}`, content: '', prompt: '', method: '', mediaType: canvasOutputKind(graph, step), inputs: [step.id], sourceId: undefined, url: undefined, runId: undefined }];
    // Outputs use a compact grid; source nodes never have to connect across turns.
    const columnBottoms = [y, y, y];
    outputs.forEach((output, index) => {
      const column = index % 3;
      const added = add(output, 'output', `${turnId}:output:${index}`, (inputColumns === 2 ? 720 : 420) + column * 330, columnBottoms[column], byId.has(output.id) ? output.id : undefined);
      columnBottoms[column] += added.height + 30;
      outputBottom = Math.max(outputBottom, columnBottoms[column]);
      for (const inputId of inputIds) edges.push({ id: `${inputId}->${added.entry.id}`, source: inputId, target: added.entry.id, animated: run?.status === 'running' || output.status === 'running' });
    });
    y = Math.max(inputBottom, outputBottom, y + 360) + 130;
  }
  return { items, turns, edges };
}
