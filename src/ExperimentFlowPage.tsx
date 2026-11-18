import { useId, useState, type ReactNode } from 'react';
import { BookOpen, Save } from 'lucide-react';
import { activeExperimentMethod, experimentKindLabels, type ExperimentGraph, type ExperimentNode, type ExperimentOperation } from '../shared/experiment';

function orderedSteps(nodes: ExperimentNode[], planId?: string) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visited = new Set<string>();
  const steps: ExperimentNode[] = [];
  const visit = (node: ExperimentNode) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    for (const id of activeExperimentMethod(node)?.inputs ?? node.inputs) {
      const input = byId.get(id);
      if (input) visit(input);
    }
    if (node.kind === 'step' && (!planId || node.planId === planId)) steps.push(node);
  };
  nodes.filter(node => node.kind === 'step' && (!planId || node.planId === planId)).forEach(visit);
  return steps;
}

export default function ExperimentFlowPage({ graph, busy, videoRemixWorkflow, controls, mutate }: {
  graph: ExperimentGraph;
  busy: boolean;
  videoRemixWorkflow?: ReactNode;
  controls?: ReactNode;
  mutate: (operation: ExperimentOperation) => Promise<ExperimentGraph | undefined>;
}) {
  const selectorId = useId();
  const plans = graph.plans || [];
  const [selection, setSelection] = useState('');
  const plan = plans.find(item => selection === `plan:${item.id}`);
  const recipe = graph.templates.find(item => selection === `recipe:${item.id}`);
  const current = plan || recipe || selection === 'current' ? selection : videoRemixWorkflow ? 'video-remix' : 'current';
  const nodes = recipe?.nodes || graph.nodes;
  const steps = orderedSteps(nodes, plan?.id);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const title = recipe?.title || plan?.title || graph.title || '当前创意';
  const freeze = async () => {
    const updated = await mutate({ op: 'freeze', title: title.slice(0, 120), planId: plan?.id });
    const saved = updated?.templates.at(-1);
    if (saved) setSelection(`recipe:${saved.id}`);
  };

  return <section className="lab-flow-page" aria-label="流程页面">
    <header className="lab-flow-header">
      <div className="lab-flow-selector">
        <label htmlFor={selectorId}>流程</label>
        <select id={selectorId} value={current} onChange={event => setSelection(event.target.value)}>
          {!!videoRemixWorkflow && <option value="video-remix">人物与视频二创</option>}
          <option value="current">当前创意</option>
          {!!plans.length && <optgroup label="制作方案">{plans.map(item => <option key={item.id} value={`plan:${item.id}`}>{item.title}</option>)}</optgroup>}
          {!!graph.templates.length && <optgroup label="已保存配方">{graph.templates.map(item => <option key={item.id} value={`recipe:${item.id}`}>{item.title}</option>)}</optgroup>}
        </select>
      </div>
      {current !== 'video-remix' && (recipe
        ? <button type="button" disabled={busy} onClick={async () => {
          const updated = await mutate({ op: 'instantiate', templateId: recipe.id });
          if (!updated) return;
          const added = updated.plans?.find(item => !plans.some(plan => plan.id === item.id));
          setSelection(added ? `plan:${added.id}` : 'current');
        }}><BookOpen size={14} />从配方创建方案</button>
        : <button type="button" disabled={busy || !steps.length} onClick={() => void freeze()}><Save size={14} />保存为配方</button>)}
    </header>
    {controls}
    {current === 'video-remix' ? videoRemixWorkflow : <div className="lab-flow-scroll">
      <h2>{title}</h2>
      {plan?.goal && <p>{plan.goal}</p>}
      {recipe && <p>{recipe.verified ? '已跑通' : '流程草稿'} · 已保存配方</p>}
      {steps.length ? <ol className="lab-flow-steps">{steps.map(step => {
        const method = activeExperimentMethod(step);
        const inputs = (method?.inputs ?? step.inputs).map(id => byId.get(id)).filter((node): node is ExperimentNode => !!node);
        const details = method?.description || step.description;
        return <li key={step.id}>
          <h3>{step.title}</h3>
          {method && <p className="lab-flow-method">{method.title}{method.model && ` · ${method.model}`}</p>}
          {details && <p>{details}</p>}
          {inputs.length > 0 && <ul className="lab-flow-inputs">{inputs.map(input => <li key={input.id}>
            <span>{experimentKindLabels[input.kind]}</span>
            {input.skill ? <a href={input.skill.url} target="_blank" rel="noreferrer" title={input.skill.commit}>{input.title} · {input.skill.commit.slice(0, 8)}</a> : input.title}
          </li>)}</ul>}
          {method?.prompt && <details><summary>查看提示词</summary><pre>{method.prompt}</pre></details>}
        </li>;
      })}</ol> : <p>在执行画布中添加制作步骤后，可以在这里查看流程并保存为配方。</p>}
    </div>}
  </section>;
}
