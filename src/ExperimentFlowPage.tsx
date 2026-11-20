import { useId, useState, type ReactNode } from 'react';
import { BookOpen, Save, Sparkles } from 'lucide-react';
import type { Asset, Project } from '../shared/domain';
import { activeExperimentMethod, experimentKindLabels, type ExperimentGraph, type ExperimentNode, type ExperimentOperation } from '../shared/experiment';
import { levelInfo, replicationLevels, type ReplicationLevel } from '../shared/replication-levels';
import type { VideoProductionPlan } from '../shared/video-production';
import { VideoCreativeDirectionPreview } from './intelligent-ui/ReferenceSceneTable';

function ReferenceDirection({ source, plan, busy, onPlan }: {
  source: Asset;
  plan?: VideoProductionPlan;
  busy: boolean;
  onPlan: (videoId: string, prompt: string) => void;
}) {
  const [level, setLevel] = useState<ReplicationLevel | ''>('');
  const [brief, setBrief] = useState('');
  const submit = () => {
    const freedom = level ? `${levelInfo(level).label}（${level}）。${levelInfo(level).description}` : '请根据原片和本次目标建议合适的自由度。';
    const notes = brief.trim();
    onPlan(source.id, `复刻参考视频。请根据原片和本次要求给出复刻方向，保存制作草案和路线提案。不要生成图片或视频。\n复刻自由度：${freedom}${notes ? `\n本次创作要求：${notes}` : ''}`);
  };

  return <section className="lab-reference-direction">
    <div className="lab-reference-source">
      <video src={source.url} poster={source.thumbnail} controls playsInline preload="metadata" aria-label="参考视频" />
      <strong>{source.name}</strong>
    </div>
    <h3>复刻方向</h3>
    <form className="lab-direction-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <label>复刻自由度
        <select value={level} onChange={event => setLevel(event.target.value as ReplicationLevel | '')} disabled={busy}>
          <option value="">让 Agent 建议</option>
          {replicationLevels.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      {level && <p>{levelInfo(level).description}</p>}
      <label>创作要求（可选）
        <textarea value={brief} rows={3} maxLength={3000} onChange={event => setBrief(event.target.value)} disabled={busy}
          placeholder="写下想保留的效果、想改的内容，或这次创作的目标。" />
      </label>
      <button type="submit" disabled={busy || !source.duration}><Sparkles size={14} />{plan?.creativeDirection ? '更新复刻建议' : '获取复刻建议'}</button>
      {!source.duration && <p>参考视频缺少时长，请重新添加可播放的视频。</p>}
    </form>
    {plan?.creativeDirection && <div className="lab-direction-result">
      <h3>{plan.level ? `已保存建议 · ${levelInfo(plan.level).label}` : '已保存建议'}</h3>
      <VideoCreativeDirectionPreview direction={plan.creativeDirection} />
    </div>}
  </section>;
}

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

export default function ExperimentFlowPage({ project, graph, busy, controls, mutate, onPlanReference }: {
  project: Project;
  graph: ExperimentGraph;
  busy: boolean;
  controls?: ReactNode;
  mutate: (operation: ExperimentOperation) => Promise<ExperimentGraph | undefined>;
  onPlanReference: (videoId: string, prompt: string) => void;
}) {
  const selectorId = useId();
  const plans = graph.plans || [];
  const [selection, setSelection] = useState('');
  const plan = plans.find(item => selection === `plan:${item.id}`);
  const recipe = graph.templates.find(item => selection === `recipe:${item.id}`);
  const current = plan || recipe ? selection : 'current';
  const nodes = recipe?.nodes || graph.nodes;
  const steps = orderedSteps(nodes, plan?.id);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const title = recipe?.title || plan?.title || graph.title || '当前创意';
  const source = current === 'current' ? project.assets.find(asset => asset.kind === 'video') : undefined;
  const production = project.videoProductionPlan;
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
          <option value="current">当前创意</option>
          {!!plans.length && <optgroup label="制作方案">{plans.map(item => <option key={item.id} value={`plan:${item.id}`}>{item.title}</option>)}</optgroup>}
          {!!graph.templates.length && <optgroup label="已保存配方">{graph.templates.map(item => <option key={item.id} value={`recipe:${item.id}`}>{item.title}</option>)}</optgroup>}
        </select>
      </div>
      {recipe
        ? <button type="button" disabled={busy} onClick={async () => {
          const updated = await mutate({ op: 'instantiate', templateId: recipe.id });
          if (!updated) return;
          const added = updated.plans?.find(item => !plans.some(plan => plan.id === item.id));
          setSelection(added ? `plan:${added.id}` : 'current');
        }}><BookOpen size={14} />从配方创建方案</button>
        : <button type="button" disabled={busy || !steps.length} onClick={() => void freeze()}><Save size={14} />保存为配方</button>}
    </header>
    {controls}
    <div className="lab-flow-scroll">
      <h2>{title}</h2>
      {plan?.goal && <p>{plan.goal}</p>}
      {recipe && <p>{recipe.verified ? '已跑通' : '流程草稿'} · 已保存配方</p>}
      {source && <ReferenceDirection key={source.id} source={source} plan={production?.sourceVideoId === source.id ? production : undefined}
        busy={busy} onPlan={onPlanReference} />}
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
    </div>
  </section>;
}
