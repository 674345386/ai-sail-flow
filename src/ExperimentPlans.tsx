import { useEffect, useState } from 'react';
import { ArrowRight, Check, GitBranch, Image, Link2, Plus, Save, Trash2 } from 'lucide-react';
import { activeExperimentMethod, experimentStatusLabels, type ExperimentGraph, type ExperimentMethod, type ExperimentNode, type ExperimentOperation, type ExperimentPlan, type ExperimentRun } from '../shared/experiment';

export type WorkbenchSource = { id: string; title: string; url?: string; mediaType?: 'image' | 'video' | 'text'; referenceAvailable?: boolean };
type Mutate = (operation: ExperimentOperation) => Promise<ExperimentGraph | undefined>;

export function ExperimentMedia({ node }: { node: ExperimentNode }) {
  return node.url && node.mediaType === 'image' ? <img src={node.url} alt={node.title} loading="lazy" />
    : node.url && node.mediaType === 'video' ? <video src={node.url} controls preload="metadata" />
    : <p className="lab-result-text">{node.content || experimentStatusLabels[node.status]}</p>;
}

export function ExperimentReferences({ ids, sources }: { ids: string[]; sources: WorkbenchSource[] }) {
  return <div className="lab-reference-list">{ids.map((id, index) => {
    const source = sources.find(item => item.id === id);
    return <div key={id}>{source?.url && source.mediaType === 'image' ? <a href={source.url} target="_blank" rel="noreferrer" aria-label={`查看参考图 ${index + 1}`}><img src={source.url} alt={source.title} loading="lazy" /></a> : <Image size={18} />}<span title={source?.title || id}>参考 {index + 1} · {source?.title || id}</span></div>;
  })}</div>;
}

export function ExperimentMethodEditor({ node, graph, sources, busy, mutate, onDirty }: {
  node: ExperimentNode; graph: ExperimentGraph; sources: WorkbenchSource[]; busy: boolean; mutate: Mutate; onDirty: (dirty: boolean) => void;
}) {
  const current = activeExperimentMethod(node)!;
  const [draft, setDraft] = useState<ExperimentMethod>(structuredClone(current));
  const [baseline, setBaseline] = useState(JSON.stringify(current));
  const [parameters, setParameters] = useState(JSON.stringify(current.parameters, null, 2));
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== baseline || parameters !== JSON.stringify(draft.parameters, null, 2);
  const conflict = baseline !== JSON.stringify(current);
  const running = (graph.runs || []).some(run => run.stepId === node.id && run.status === 'running');
  const locked = busy || running;
  const reload = () => { setDraft(structuredClone(current)); setBaseline(JSON.stringify(current)); setParameters(JSON.stringify(current.parameters, null, 2)); setError(''); };
  useEffect(reload, [node.id, current.id]);
  useEffect(() => { onDirty(dirty || conflict); }, [dirty, conflict, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const save = async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(parameters); } catch { setError('参数需要是有效的 JSON 对象，例如 {"quality":"high"}。'); return; }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some(value => value !== null && !['string', 'number', 'boolean'].includes(typeof value))) { setError('参数值只支持文字、数字、布尔值或 null。'); return; }
    const updated = await mutate({ op: 'method', stepId: node.id, method: { ...draft, parameters: parsed as ExperimentMethod['parameters'] } });
    const saved = updated?.nodes.find(item => item.id === node.id);
    if (saved) { const method = activeExperimentMethod(saved)!; setDraft(structuredClone(method)); setBaseline(JSON.stringify(method)); setParameters(JSON.stringify(method.parameters, null, 2)); setError(''); }
  };
  return <section className="lab-method-editor">
    <div className="lab-section-title"><h3>方法与做法 <span>{node.methods!.length}</span></h3><button type="button" disabled={locked || dirty || conflict || node.methods!.length >= 16} onClick={() => void mutate({ op: 'branch-method', stepId: node.id })}><Plus size={13} />备选方法</button></div>
    <div className="lab-method-tabs" role="group" aria-label="切换制作方法">{node.methods!.map(method => <button type="button" key={method.id} aria-pressed={method.id === current.id} disabled={locked || dirty || conflict} onClick={() => void mutate({ op: 'select-method', stepId: node.id, methodId: method.id })}>{method.id === current.id && <Check size={12} />}{method.title}</button>)}</div>
    {running && <p className="lab-help">当前方法正在执行，返回结果后可以继续编辑或切换。</p>}
    <fieldset disabled={locked}>
      <label>方法名称<input value={draft.title} maxLength={120} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>做法说明<textarea rows={2} maxLength={2000} value={draft.description} placeholder="这个方法如何完成当前步骤。" onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>提示词<textarea rows={7} maxLength={16000} value={draft.prompt} placeholder="保存完整提示词。执行时与下面的参考图一起使用。" onChange={event => setDraft({ ...draft, prompt: event.target.value })} /></label>
      <div className="lab-field-label">输入参考图片 <span>{draft.referenceIds.length} 张</span></div>
      <div className="lab-reference-picker">{sources.filter(source => (source.mediaType === 'image' && source.referenceAvailable !== false) || draft.referenceIds.includes(source.id)).map(source => <label key={source.id} title={source.title}><input type="checkbox" checked={draft.referenceIds.includes(source.id)} onChange={event => setDraft({ ...draft, referenceIds: event.target.checked ? [...draft.referenceIds, source.id] : draft.referenceIds.filter(id => id !== source.id) })} />{source.url && source.mediaType === 'image' ? <img src={source.url} alt="" loading="lazy" /> : <Image size={18} />}<span>{source.title}</span></label>)}</div>
      {!sources.some(source => source.mediaType === 'image') && <p className="lab-help">上传或提取的参考图会出现在这里。</p>}
      {draft.referenceIds.some(id => !sources.some(source => source.id === id)) && <ExperimentReferences ids={draft.referenceIds.filter(id => !sources.some(source => source.id === id))} sources={sources} />}
      <details className="lab-method-options"><summary>上游节点、模型与参数</summary>
        <div className="lab-field-label">上游素材、Skill 与产物</div><div className="lab-input-picker">{graph.nodes.filter(input => input.id !== node.id && input.kind !== 'compare' && !input.inputs.includes(node.id)).map(input => <label key={input.id}><input type="checkbox" checked={draft.inputs.includes(input.id)} onChange={event => setDraft({ ...draft, inputs: event.target.checked ? [...draft.inputs, input.id] : draft.inputs.filter(id => id !== input.id) })} /><span>{input.title}</span></label>)}</div>
        <label>模型 / 工具<input maxLength={120} value={draft.model} placeholder="由执行工具记录，也可以指定支持的模型" onChange={event => setDraft({ ...draft, model: event.target.value })} /></label>
        <label>生成参数<textarea rows={3} value={parameters} onChange={event => setParameters(event.target.value)} spellCheck={false} /></label>
      </details>
    </fieldset>
    {conflict && <div className="lab-conflict">方法已在其他操作中更新，请重新读取后编辑。<button type="button" onClick={reload}>重新读取</button></div>}
    {error && <p className="lab-stale-note" role="alert">{error}</p>}
    <div className="lab-method-save"><button type="button" disabled={locked || !dirty || conflict || !draft.title.trim()} className="lab-primary" onClick={() => void save()}><Save size={13} />保存方法</button>{node.methods!.length > 1 && <button type="button" disabled={locked || dirty || conflict} aria-label="删除当前方法，保留历史产物" onClick={() => void mutate({ op: 'remove-method', stepId: node.id, methodId: current.id })}><Trash2 size={13} /></button>}</div>
  </section>;
}

export function ExperimentRunDetails({ run, graph, sources, onSelect }: { run: ExperimentRun; graph: ExperimentGraph; sources: WorkbenchSource[]; onSelect: (id: string) => void }) {
  return <section className="lab-run-details"><div className="lab-section-title"><h3>产物来源 · {run.method.title}</h3><span className={`lab-status lab-status-${run.status}`}>{experimentStatusLabels[run.status]}</span></div>
    <button type="button" className="lab-link-button" onClick={() => onSelect(run.stepId)}><Link2 size={13} />{graph.nodes.find(node => node.id === run.stepId)?.title || '来源步骤'}<ArrowRight size={13} /></button>
    <p className="lab-help">{new Date(run.startedAt).toLocaleString('zh-CN')} · {run.method.model || '未指定模型'}</p>
    {run.method.description && <p>{run.method.description}</p>}
    <details><summary>本次实际使用的提示词</summary><pre>{run.method.prompt || '此次执行没有文本提示词。'}</pre></details>
    {!!run.method.referenceIds.length && <><h3>本次输入参考图</h3><ExperimentReferences ids={run.method.referenceIds} sources={sources} /></>}
    {!!Object.keys(run.method.parameters).length && <details><summary>本次生成参数</summary><pre>{JSON.stringify(run.method.parameters, null, 2)}</pre></details>}
    {run.error && <p className="lab-stale-note">{run.error}</p>}
  </section>;
}

export function ExperimentPlanEditor({ plan, graph, busy, mutate, onSelect, onAddStep, onBranch, onCompare }: {
  plan: ExperimentPlan; graph: ExperimentGraph; busy: boolean; mutate: Mutate; onSelect: (id: string) => void; onAddStep: () => void; onBranch: () => void; onCompare: () => void;
}) {
  const [title, setTitle] = useState(plan.title), [goal, setGoal] = useState(plan.goal);
  const [baseline, setBaseline] = useState(JSON.stringify([plan.title, plan.goal]));
  useEffect(() => { setTitle(plan.title); setGoal(plan.goal); setBaseline(JSON.stringify([plan.title, plan.goal])); }, [plan.id]);
  const conflict = baseline !== JSON.stringify([plan.title, plan.goal]);
  const steps = graph.nodes.filter(node => node.planId === plan.id && node.kind === 'step');
  const outputs = graph.nodes.filter(node => node.planId === plan.id && node.kind === 'artifact');
  return <div className="lab-plan-editor">
    <label>方案名称<input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></label>
    <label>方案目标<textarea rows={3} value={goal} maxLength={2000} onChange={event => setGoal(event.target.value)} placeholder="这套方案最终要得到什么。" /></label>
    {conflict && <div className="lab-conflict">方案已更新。<button type="button" onClick={() => { setTitle(plan.title); setGoal(plan.goal); setBaseline(JSON.stringify([plan.title, plan.goal])); }}>重新读取</button></div>}
    <button type="button" className="lab-primary" disabled={busy || conflict || !title.trim() || (title === plan.title && goal === plan.goal)} onClick={async () => { const updated = await mutate({ op: 'plan', id: plan.id, title, goal }); const saved = updated?.plans?.find(item => item.id === plan.id); if (saved) setBaseline(JSON.stringify([saved.title, saved.goal])); }}><Save size={13} />保存方案</button>
    <section className="lab-plan-steps"><div className="lab-section-title"><h3>方案中的步骤 <span>{steps.length}</span></h3><button type="button" disabled={busy} onClick={onAddStep}><Plus size={13} />添加步骤</button></div>
      {steps.map((step, index) => <div key={step.id} className="lab-plan-step"><button type="button" onClick={() => onSelect(step.id)}><span>{index + 1}</span><strong>{step.title}</strong><ArrowRight size={13} /></button><p>{step.methods?.length || 1} 种方法 · 当前：{activeExperimentMethod(step)?.title} · {experimentStatusLabels[step.status]}</p>{outputs.filter(output => output.inputs.includes(step.id)).map(output => <button type="button" className="lab-plan-output" key={output.id} onClick={() => onSelect(output.id)}>{plan.adopted && plan.selectedArtifactId === output.id ? <Check size={13} /> : <Image size={13} />}<span>{output.title}</span><small>{experimentStatusLabels[output.status]}</small></button>)}</div>)}
      {!steps.length && <p className="lab-help">添加步骤，或在已有节点详情中选择所属方案。节点可以保留在画布的任意位置。</p>}
    </section>
    <div className="lab-plan-actions"><button type="button" disabled={busy} onClick={onBranch}><GitBranch size={14} />创建备选方案</button><button type="button" onClick={onCompare}>比较方案与产物<ArrowRight size={14} /></button></div>
  </div>;
}

export function ExperimentComparisons({ graph, plan, step, busy, mutate, onSelect }: { graph: ExperimentGraph; plan?: ExperimentPlan; step?: ExperimentNode; busy: boolean; mutate: Mutate; onSelect: (id: string) => void }) {
  const plans = (graph.plans || []).filter(item => !plan || item.goalId === plan.goalId);
  const methods = step ? [...step.methods!, ...(graph.runs || []).filter(run => run.stepId === step.id && !step.methods!.some(method => method.id === run.method.id)).map(run => run.method)].filter((method, index, all) => all.findIndex(item => item.id === method.id) === index) : [];
  const groups = step ? methods.map(method => ({ id: method.id, title: method.title, plan: graph.plans!.find(item => item.id === step.planId)!, outputs: graph.nodes.filter(node => node.kind === 'artifact' && graph.runs?.some(run => run.stepId === step.id && run.method.id === method.id && run.artifactIds.includes(node.id))), runs: (graph.runs || []).filter(run => run.stepId === step.id && run.method.id === method.id) }))
    : plans.map(item => ({ id: item.id, title: item.title, plan: item, outputs: graph.nodes.filter(node => node.kind === 'artifact' && node.planId === item.id), runs: (graph.runs || []).filter(run => run.planId === item.id) }));
  return <div className="lab-comparison-grid">{groups.map(group => <section key={group.id}>
    <div className="lab-section-title"><h3>{group.title}</h3>{group.plan.adopted && <span className="lab-adopted"><Check size={12} />已采用</span>}</div>
    {!step && <p>{group.plan.goal}</p>}
    <p className="lab-help">{group.runs.length} 次执行 · {group.outputs.filter(output => output.status === 'completed').length} 份已完成产物</p>
    {group.outputs.map(output => { const run = graph.runs?.find(item => item.id === output.runId); const adopted = group.plan.adopted && group.plan.selectedArtifactId === output.id; return <div className="lab-compare-output" key={output.id}>
      <button type="button" className="lab-link-button" onClick={() => onSelect(output.id)}>{output.title}<ArrowRight size={13} /></button>
      <ExperimentMedia node={output} /><p className="lab-help">{run?.method.title || '等待执行'} · {experimentStatusLabels[output.status]}{run ? ` · ${new Date(run.startedAt).toLocaleString('zh-CN')}` : ''}</p>
      <button type="button" disabled={busy || adopted || output.status !== 'completed' || (!output.sourceId && !output.content.trim())} onClick={() => void mutate({ op: 'adopt-artifact', planId: group.plan.id, artifactId: output.id })}><Check size={13} />{adopted ? '已采用此产物' : '采用此产物'}</button>
    </div>; })}
    {!group.outputs.length && <p className="lab-help">执行后，独立产物会出现在这里，原有结果会保留。</p>}
    {group.runs.filter(run => !run.artifactIds.length).map(run => <p key={run.id} className={`lab-status lab-status-${run.status}`}>{run.method.title} · {experimentStatusLabels[run.status]}{run.error ? ` · ${run.error}` : ''}</p>)}
  </section>)}</div>;
}
