import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ExternalLink, GitBranch, LoaderCircle, Play, Search, SlidersHorizontal } from 'lucide-react';
import type { ExperimentGraph, ExperimentOperation } from '../shared/experiment';
import { activeExperimentProposal, defaultExperimentPolicy, experimentLevel, experimentLevels, experimentRoutePrompt, normalizeExperimentPolicy, routeReadinessLabels, type ExperimentPolicy, type ExperimentProposal, type ExperimentRoute } from '../shared/experiment-planning';

type Mutate = (operation: ExperimentOperation) => Promise<ExperimentGraph | undefined>;
export function ExperimentPolicyControl({ graph, busy, mutate }: { graph: ExperimentGraph; busy: boolean; mutate: Mutate }) {
  const policy = normalizeExperimentPolicy(graph.policy);
  const [level, setLevel] = useState(policy.level);
  const saving = useRef(false);
  const labelId = useId(), hintId = useId();
  useEffect(() => setLevel(policy.level), [policy.level]);
  const save = async (next: ExperimentPolicy) => {
    if (busy || saving.current) return;
    saving.current = true;
    const updated = await mutate({ op: 'policy', policy: next });
    if (!updated) setLevel(policy.level);
    saving.current = false;
  };
  const commitLevel = () => { if (level !== policy.level) void save(defaultExperimentPolicy(level)); };
  const preset = experimentLevel(level);
  const sliderIndex = experimentLevels.findIndex(item => item.level === preset.level);
  return <section className="lab-experiment-policy" aria-labelledby={labelId}>
    <div className="lab-policy-heading"><SlidersHorizontal size={15} /><strong id={labelId}>实验深度</strong><span>{preset.title}</span></div>
    <div className="lab-policy-slider">
      <input type="range" min={0} max={experimentLevels.length - 1} step={1} value={sliderIndex} disabled={busy} aria-labelledby={labelId} aria-describedby={hintId} aria-valuetext={`${preset.name}，${preset.title}`} onChange={event => setLevel(experimentLevels[Number(event.target.value)].level)} onPointerUp={commitLevel} onBlur={commitLevel} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitLevel(); }} />
      <div className="lab-policy-stops">{experimentLevels.map(item => <button type="button" key={item.level} aria-pressed={level === item.level} disabled={busy} onClick={() => { setLevel(item.level); if (item.level !== policy.level) void save(defaultExperimentPolicy(item.level)); }}>{item.name}</button>)}</div>
    </div>
    <p id={hintId}>{preset.description}</p>
    <details className="lab-policy-options"><summary>执行方式<ChevronDown size={12} /></summary><div>
      <label>路线决策<select value={policy.decision} disabled={busy} onChange={event => void save({ ...policy, decision: event.target.value as ExperimentPolicy['decision'] })}><option value="auto">Agent 自动选一条</option><option value="choose">由我选择，可多选</option></select></label>
      <label>每次最多选择<select value={policy.maxRoutes} disabled={busy} onChange={event => void save({ ...policy, maxRoutes: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(count => <option key={count} value={count}>{count} 条路线</option>)}</select></label>
      <small>保存在当前空间，对下一次路线提案生效。已提出的方案保留当时设置。</small>
    </div></details>
  </section>;
}

function RouteCard({ route, proposal, selected, busy, limitReached, onToggle, onDraft, graph }: {
  route: ExperimentRoute; proposal: ExperimentProposal; selected: boolean; busy: boolean; limitReached: boolean;
  onToggle: () => void; onDraft: (text: string) => void; graph: ExperimentGraph;
}) {
  const labelId = useId();
  const plan = graph.plans?.find(item => item.proposalId === proposal.id && item.routeId === route.id);
  const runs = graph.runs?.filter(run => run.planId === plan?.id) || [];
  const failure = [...runs].reverse().find(run => run.status === 'failed');
  const running = runs.some(run => run.status === 'running');
  const completed = runs.filter(run => run.status === 'completed').length;
  const prepare = () => onDraft(`请先准备路线「${route.title}」（proposalId：${proposal.id}，routeId：${route.id}）。\n目标：${proposal.brief.goal}\n待解决条件：${route.readinessReason}\n${route.requirements.join('\n')}\n先读取 get_creative，核实素材、依赖和执行能力，说明准备工作；不要提交付费生成。条件补齐后，使用 propose-routes 发布更新后的路线提案，保留其他仍适用的候选，让我重新选择。`);
  return <article className={`lab-route-card${selected ? ' is-selected' : ''}`} data-readiness={route.readiness}>
    <div className="lab-route-card-top"><label className="lab-route-choice"><input type="checkbox" checked={selected} disabled={busy || route.readiness !== 'ready' || (!selected && limitReached)} onChange={onToggle} aria-labelledby={labelId} /><span id={labelId}>{route.title}</span></label>{route.recommended && <span className="lab-route-recommended">推荐</span>}</div>
    <p className="lab-route-outcome">{route.expectedOutcome}</p>
    <p className="lab-route-description">{route.description}</p>
    <div className="lab-route-readiness" role="status">{running ? <LoaderCircle size={12} className="lab-spin" /> : selected && proposal.selectedRouteIds.includes(route.id) ? <Check size={12} /> : <span className="lab-route-state-dot" />}<strong>{running ? '执行中' : routeReadinessLabels[route.readiness]}</strong><span>{route.readinessReason}</span></div>
    {route.tradeoff && <p className="lab-route-tradeoff">取舍：{route.tradeoff}</p>}
    <details className="lab-route-details"><summary>查看步骤与方法来源<ChevronDown size={13} /></summary>
      <ol>{route.steps.map((step, index) => <li key={index}><strong>{step.title}</strong>{step.model && <span>{step.model}</span>}{step.description && <p>{step.description}</p>}{step.prompt && <details><summary>提示词与制作要求</summary><pre>{step.prompt}</pre></details>}{!!step.referenceIds.length && <small>{step.referenceIds.length} 张参考图</small>}</li>)}</ol>
      {!!route.requirements.length && <div className="lab-route-requirements"><strong>需要的条件</strong><ul>{route.requirements.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul></div>}
      {!!route.sources.length && <div className="lab-route-sources"><strong>方法来源</strong>{route.sources.map((source, index) => source.url ? <a key={index} href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={11} /></a> : <span key={index}>{source.title}</span>)}</div>}
    </details>
    <footer><span>{route.costNote}</span>{route.readiness !== 'ready' && <button type="button" disabled={busy} onClick={prepare}><Search size={12} />补齐条件</button>}{completed > 0 && <span>{completed} 个步骤已完成</span>}</footer>
    {failure && <div className="lab-route-failure"><strong>上次执行未完成</strong><p>{failure.error || '请查看执行记录，核对服务或环境后重试。'}</p></div>}
  </article>;
}

export function ExperimentRoutes({ graph, busy, mutate, onDraft, onExecute, onExecution }: {
  graph: ExperimentGraph; busy: boolean; mutate: Mutate; onDraft: (text: string) => void;
  onExecute?: (text: string) => void; onExecution: () => void;
}) {
  const proposal = activeExperimentProposal(graph);
  const [selected, setSelected] = useState<string[]>(proposal?.selectedRouteIds || []);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selectionKey = proposal?.selectedRouteIds.join(',');
  useEffect(() => setSelected(proposal?.selectedRouteIds || []), [proposal?.id, selectionKey]);
  if (!proposal) return <div className="lab-routes-empty"><GitBranch size={30} strokeWidth={1.4} /><h2>让灵感，先做一次实验。</h2><p>在左侧描述想做的事，并添加参考素材。Agent 会按实验深度，提出适合这个目标的制作路线。</p><span>先看预期效果与所需条件，再决定从哪条路线开始。</span></div>;
  const locked = busy || submitting;
  const changed = [...selected].sort().join(',') !== [...proposal.selectedRouteIds].sort().join(',');
  const start = async () => {
    if (!selected.length || locked || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true);
    try {
      const updated = await mutate({ op: 'select-routes', proposalId: proposal.id, routeIds: selected });
      const next = updated && activeExperimentProposal(updated);
      if (!updated || !next) return;
      const prompt = experimentRoutePrompt(next, updated.plans || []);
      onExecution();
      if (onExecute) onExecute(prompt); else onDraft(prompt);
    } finally { submittingRef.current = false; setSubmitting(false); }
  };
  const explore = () => onDraft(`请基于这次目标继续探索路线（proposalId：${proposal.id}）。\n原始要求：${proposal.brief.originalPrompt}\n读取当前空间的实验设置，从目标与约束出发，补充与现有方案有实质差异的方法。优先复用当前空间 Skill 与成功案例，存在缺口再检索相关 GitHub Skill 或开源项目，记录真实来源、素材和环境条件。使用 propose-routes 保存完整的新提案，等待我选择，不提交生成。`);
  return <div className="lab-routes-board">
    <header className="lab-routes-brief"><div><h2>{proposal.brief.goal}</h2><p>原始灵感：{proposal.brief.originalPrompt}</p></div><button type="button" disabled={locked} onClick={explore}><GitBranch size={13} />继续探索</button>
      {(proposal.brief.assumptions.length > 0 || proposal.brief.constraints.length > 0) && <details><summary>当前理解与创作约束<ChevronDown size={12} /></summary>{proposal.brief.assumptions.length > 0 && <div><strong>当前理解</strong><ul>{proposal.brief.assumptions.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}{proposal.brief.constraints.length > 0 && <div><strong>创作约束</strong><ul>{proposal.brief.constraints.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}<button type="button" disabled={locked} onClick={() => onDraft(`我想调整这次路线提案的目标或约束（proposalId：${proposal.id}）。\n原始要求：${proposal.brief.originalPrompt}\n调整为：`)}>调整理解</button></details>}
    </header>
    <div className="lab-route-families">{proposal.families.map(family => {
      const routes = proposal.routes.filter(route => route.familyId === family.id);
      if (!routes.length) return null;
      return <section className="lab-route-family" key={family.id}><header><GitBranch size={16} /><div><h3>{family.title}</h3>{family.description && <p>{family.description}</p>}</div><span>{routes.length} 条路线</span></header><div className="lab-route-options">{routes.map(route => <RouteCard key={route.id} route={route} proposal={proposal} graph={graph} selected={selected.includes(route.id)} busy={locked} limitReached={selected.length >= proposal.policy.maxRoutes} onToggle={() => setSelected(current => current.includes(route.id) ? current.filter(value => value !== route.id) : current.length < proposal.policy.maxRoutes ? [...current, route.id] : current)} onDraft={onDraft} />)}</div></section>;
    })}</div>
    <div className="lab-route-selection"><div><strong>{selected.length ? `已选 ${selected.length} 条路线` : '选择你想尝试的路线'}</strong><span>本次最多 {proposal.policy.maxRoutes} 条 · 各自保留独立结果{changed && proposal.selectedRouteIds.length > 0 ? ' · 选择尚未保存' : ''}</span></div><div>{proposal.selectedRouteIds.length > 0 && <button type="button" onClick={onExecution}>查看执行画布<ArrowRight size={13} /></button>}<button type="button" className="lab-primary" disabled={locked || !selected.length} onClick={() => void start()}>{submitting ? <LoaderCircle size={14} className="lab-spin" /> : <Play size={14} />}{onExecute ? '执行所选路线' : '将所选路线填入对话'}</button></div></div>
  </div>;
}
