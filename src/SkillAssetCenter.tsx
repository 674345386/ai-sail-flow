import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, Download, ExternalLink, FlaskConical, GitFork, LoaderCircle, Package, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import type { Project } from '../shared/domain';
import type { ExperimentGraph, ExperimentNode } from '../shared/experiment';
import { snapshotHasOutput, verificationStates, type SkillAssetDetail, type SkillAssetSummary, type SkillEnvironment, type SkillReference, type SkillSelection, type SkillSnapshot } from '../shared/skill-assets';
import { api, apiBlob, downloadBlob } from './api';
import './skill-asset-center.css';

function AssetStatus({ asset }: { asset: Pick<SkillAssetSummary, 'state'> }) {
  return <span className="skill-state" data-state={asset.state}>{asset.state === 'running' && <LoaderCircle size={12} className="spin" />}{verificationStates[asset.state]}</span>;
}

export function SkillAssetPicker({ value, onChange, disabled }: { value: SkillSelection[]; onChange: (value: SkillSelection[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [scope, setScope] = useState('public');
  const [assets, setAssets] = useState<SkillAssetSummary[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setError('');
    void api<{ assets: SkillAssetSummary[] }>(`/api/skill-assets?scope=${scope}`, { signal: controller.signal }).then(result => setAssets(result.assets)).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, scope]);
  return <details className="skill-picker" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><Package size={15} />选择 Skill <span>{value.length ? `已选 ${value.length} 个` : '可选，连同参考现场一起采用'}</span></summary>
    <div className="skill-picker-scopes" role="group" aria-label="Skill 来源"><button type="button" aria-pressed={scope === 'public'} onClick={() => setScope('public')}>公共市场</button><button type="button" aria-pressed={scope === 'personal'} onClick={() => setScope('personal')}>我的资产</button></div>
    {loading ? <p role="status">正在加载 Skill…</p> : error ? <p role="alert">{error}</p> : !assets.length ? <p>还没有资产。可先在工作台的资产中心收录或沉淀 Skill。</p> : <div className="skill-picker-list">{assets.map(asset => {
      const checked = value.some(selection => selection.assetId === asset.id && selection.releaseId === asset.releaseId);
      return <label key={`${asset.id}:${asset.releaseId}`}><input type="checkbox" checked={checked} disabled={disabled || !checked && value.length >= 8} onChange={() => onChange(checked ? value.filter(selection => selection.assetId !== asset.id) : [...value.filter(selection => selection.assetId !== asset.id), { assetId: asset.id, releaseId: asset.releaseId }])} /><span><strong>{asset.name}</strong><small>{asset.summary}</small></span><AssetStatus asset={asset} /></label>;
    })}</div>}
    {!!value.length && <small>固定所选版本。创建后可在实验台替换输入，参考原实验继续创作。</small>}
  </details>;
}

export function SkillEnvironmentView({ environment }: { environment?: SkillEnvironment }) {
  const [showAll, setShowAll] = useState(false);
  if (!environment) return <p className="skill-empty">尚未记录运行环境。官方实验会保存实际依赖、工具版本和恢复方式。</p>;
  return <div className="skill-environment">
    <p>{environment.platform} · {environment.architecture} · 工作目录 {environment.workingDirectory || '.'} · 记录于 {new Date(environment.capturedAt).toLocaleString('zh-CN')}</p>
    {!!environment.unresolved.length && <div className="skill-condition"><strong>待补齐的条件</strong><ul>{environment.unresolved.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
    <div className="skill-table-scroll"><table><caption>运行时、依赖与工具版本</caption><thead><tr><th>名称</th><th>版本</th><th>固定方式</th></tr></thead><tbody>{environment.entries.slice(0, showAll ? undefined : 80).map((entry, index) => <tr key={`${entry.name}:${index}`}><td>{entry.name}</td><td><code>{entry.version || '未记录'}</code></td><td>{entry.pin === 'exact' ? '固定版本' : '远程 / 动态版本'}</td></tr>)}</tbody></table></div>
    {environment.entries.length > 80 && <button type="button" onClick={() => setShowAll(value => !value)}>{showAll ? '收起依赖' : `展开全部 ${environment.entries.length} 项依赖`}</button>}
    {!!environment.requirements.length && <><h3>运行条件</h3><ul>{environment.requirements.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    {!!environment.files.length && <details><summary>依赖锁文件与校验值 · {environment.files.length} 个</summary>{environment.files.map(file => <details key={file.path}><summary>{file.path}</summary><small>SHA-256：{file.sha256}</small><pre>{file.content}</pre></details>)}</details>}
    {environment.setup && <details><summary>安装与恢复说明</summary><pre>{environment.setup}</pre></details>}
  </div>;
}

function ExampleArtifact({ node }: { node: ExperimentNode }) {
  return <figure className="skill-example-artifact">
    {node.url && node.mediaType === 'image' ? <img src={node.url} alt={node.title} loading="lazy" /> : node.url && node.mediaType === 'video' ? <video src={node.url} controls preload="metadata" /> : node.content ? <pre>{node.content}</pre> : node.url ? <a href={node.url} target="_blank" rel="noreferrer">打开文件 <ExternalLink size={12} /></a> : <p>{node.error || '尚无实际输出'}</p>}
    <figcaption>{node.title}</figcaption>
  </figure>;
}

function ExampleView({ snapshot, official }: { snapshot?: SkillSnapshot; official: boolean }) {
  if (!snapshot) return <div className="skill-empty"><FlaskConical size={28} /><p>等待一次真实实验</p><span>执行后会在这里保留输入、Prompt、模型、过程和输出，供你继续创作。</span></div>;
  const graph = snapshot.graph, inputs = graph.nodes.filter(node => node.kind === 'asset'), outputs = graph.nodes.filter(node => node.kind === 'artifact' && (node.sourceId || node.content));
  return <div className="skill-example"><p className="skill-example-origin">{official ? '平台官方实验现场' : snapshotHasOutput(snapshot) ? '作者提供的参考现场 · 等待官方验证' : '作者保存的流程草稿 · 尚无成功执行结果'} · {new Date(snapshot.createdAt).toLocaleDateString('zh-CN')}</p>
    {!!graph.plans?.length && <div>{graph.plans.map(plan => <p key={plan.id}><strong>{plan.title}</strong><br />{plan.goal}</p>)}</div>}
    <h3>输入</h3>{inputs.length ? <div className="skill-example-media">{inputs.map(node => <ExampleArtifact key={node.id} node={node} />)}</div> : <p>输入与参考素材见下方执行记录。</p>}
    <h3>执行上下文</h3>{graph.runs?.length ? graph.runs.map(run => <details key={run.id} className="skill-run"><summary>{run.method.title} · {run.method.model || '未记录模型'} · {run.status === 'completed' ? '完成' : run.status === 'failed' ? '失败' : '执行中'}</summary><p>{graph.nodes.find(node => node.id === run.stepId)?.title}</p><h4>Prompt</h4><pre>{run.method.prompt || '未记录'}</pre>{!!run.method.referenceIds.length && <><h4>参考输入</h4><div className="skill-example-media">{run.method.referenceIds.map(id => { const file = graph.files?.find(file => file.id === id); return file ? <ExampleArtifact key={id} node={{ id, title: file.title, url: file.url, mediaType: file.mediaType } as ExperimentNode} /> : <span key={id}>{id}</span>; })}</div></>}<h4>参数</h4><pre>{JSON.stringify(run.method.parameters, null, 2)}</pre>{run.error && <p role="note">{run.error}</p>}<details><summary>本次执行的环境版本</summary><SkillEnvironmentView environment={run.environment} /></details></details>) : <p>尚未保存真实执行记录。</p>}
    <h3>输出</h3>{outputs.length ? <div className="skill-example-media">{outputs.map(node => <ExampleArtifact key={node.id} node={node} />)}</div> : <p>尚无实际输出，不能据此判断效果。</p>}
    {!!snapshot.sourceFiles.length && <details><summary>可继续编辑的源文件 · {snapshot.sourceFiles.length} 个</summary>{snapshot.sourceFiles.map(file => <details key={file.path}><summary>{file.path}</summary><pre>{file.content}</pre></details>)}</details>}
  </div>;
}

function ReferenceDetails({ projectId, reference }: { projectId: string; reference: SkillReference }) {
  const [loaded, setLoaded] = useState<SkillReference>(), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  return <details onToggle={event => {
    if (event.target !== event.currentTarget || !event.currentTarget.open || loaded || loading) return;
    setLoading(true); setError('');
    void api<SkillReference>(`/api/projects/${projectId}/agent/experiment/references/${reference.id}`).then(setLoaded).catch(failure => setError(failure.message)).finally(() => setLoading(false));
  }}><summary>查看参考现场与完整依赖</summary>{loading ? <p role="status">正在读取固定版本的参考现场…</p> : error ? <p role="alert">{error}</p> : loaded && <div className="skill-center skill-reference-preview"><ExampleView snapshot={loaded.snapshot} official={!!loaded.reportId} /><details><summary>参考环境与恢复说明</summary><SkillEnvironmentView environment={loaded.environment} /></details></div>}</details>;
}

export function SkillReferenceBar({ projectId, graph, onGraph, onDraft, disabled }: { projectId: string; graph: ExperimentGraph; onGraph: (graph: ExperimentGraph) => void; onDraft: (text: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <details className="skill-reference-bar"><summary>{graph.assetReferences?.length ? `已采用 ${graph.assetReferences.length} 个 Skill · 参考现场与运行环境` : '当前运行环境与依赖版本'}</summary>
    {graph.assetReferences?.map(reference => <div key={reference.id}><p><strong>{reference.name}</strong> · 固定版本 {reference.releaseId.slice(0, 8)}<br />源文件：<code>{reference.workspace}</code></p><button type="button" disabled={disabled} onClick={() => onDraft(`请读取参考现场 ${reference.id}（read_skill_reference），基于其输入输出和方法继续本次创作。先检查 ${reference.workspace} 的源文件、依赖锁和工具版本，恢复所需环境后调用 capture_skill_environment（workspace 使用上述源文件目录）。说明需要我提供的输入，并沿用已复制的步骤，保留原实验。`)}>参考此实验继续</button><ReferenceDetails projectId={projectId} reference={reference} /></div>)}
    <p>{graph.environment ? `已记录本次创作实际环境 · ${new Date(graph.environment.capturedAt).toLocaleString('zh-CN')}` : '参考环境随资产交付；安装恢复后再记录本次实际版本。'}</p><button type="button" disabled={disabled || busy} onClick={async () => { setBusy(true); setError(''); try { await api(`/api/projects/${projectId}/agent/experiment/environment`, { method: 'POST', body: JSON.stringify({ workspace: graph.assetReferences?.length === 1 ? graph.assetReferences[0].workspace : graph.environment?.workingDirectory }) }); const result = await api<{ graph: ExperimentGraph }>(`/api/projects/${projectId}/agent/experiment`); onGraph(result.graph); } catch (failure) { setError(failure instanceof Error ? failure.message : '记录环境失败。'); } finally { setBusy(false); } }}>{busy ? '正在记录…' : '记录当前实际环境'}</button>{graph.environment && <details><summary>当前实际环境清单</summary><SkillEnvironmentView environment={graph.environment} /></details>}{error && <p role="alert">{error}</p>}
  </details>;
}

export default function SkillAssetCenter({ project, graph, onGraph, onDraft, onContinue, disabled, active = true }: {
  project: Project; graph?: ExperimentGraph; onGraph: (graph: ExperimentGraph) => void; onDraft: (text: string) => void; onContinue: () => void; disabled?: boolean; active?: boolean;
}) {
  const [scope, setScope] = useState('public'), [query, setQuery] = useState(''), [topic, setTopic] = useState('全部');
  const [assets, setAssets] = useState<SkillAssetSummary[]>([]), [selection, setSelection] = useState<SkillSelection>();
  const [detail, setDetail] = useState<SkillAssetDetail>(), [detailLoading, setDetailLoading] = useState(false), [listLoading, setListLoading] = useState(true);
  const [section, setSection] = useState<'example' | 'report' | 'environment' | 'source'>('example');
  const [form, setForm] = useState<'collect' | 'publish' | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const working = useRef(false);
  const [url, setURL] = useState(''), [name, setName] = useState(''), [summary, setSummary] = useState(''), [claims, setClaims] = useState(''), [topicsText, setTopicsText] = useState('');
  const [paths, setPaths] = useState<string[]>([]), [skillPath, setSkillPath] = useState(''), [planId, setPlanId] = useState(''), [skillNodeId, setSkillNodeId] = useState(''), [share, setShare] = useState(false);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload(value => value + 1);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController(); setListLoading(true);
    void api<{ assets: SkillAssetSummary[] }>(`/api/skill-assets?scope=${scope}`, { signal: controller.signal }).then(result => setAssets(result.assets)).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [scope, active, reload]);
  useEffect(() => {
    if (!selection || !active) return;
    const controller = new AbortController(); setDetailLoading(true); setDetail(undefined);
    void api<SkillAssetDetail>(`/api/skill-assets/${selection.assetId}?release=${selection.releaseId}`, { signal: controller.signal }).then(setDetail).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selection?.assetId, selection?.releaseId, active]);
  useEffect(() => {
    if (!active || detail?.state !== 'running') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<SkillAssetDetail>(`/api/skill-assets/${detail.id}`, { signal: controller.signal }).then(updated => { setDetail(updated); if (updated.state !== 'running') refresh(); }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    }, 3000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, detail]);
  const perform = async (work: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : '操作未完成，请重试。'); }
    finally { working.current = false; setBusy(false); }
  };
  const openAsset = (asset: SkillAssetSummary) => { setSelection({ assetId: asset.id, releaseId: asset.releaseId }); setSection('example'); setForm(null); setError(''); };
  const topics = useMemo(() => ['全部', ...new Set(assets.flatMap(asset => asset.topics))], [assets]);
  const filtered = assets.filter(asset => (topic === '全部' || asset.topics.includes(topic)) && `${asset.name} ${asset.summary} ${asset.topics.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const openForm = (kind: 'collect' | 'publish') => {
    setForm(kind); setName(kind === 'publish' ? project.title : ''); setSummary(''); setClaims(''); setTopicsText(''); setURL(''); setPaths([]); setSkillPath(''); setPlanId(graph?.plans?.[0]?.id || ''); setSkillNodeId(''); setShare(false); setError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const body = { name, summary, claims: claims.split('\n').map(line => line.trim()).filter(Boolean), topics: topicsText.split(/[,，、]/).map(item => item.trim()).filter(Boolean), visibility: share || form === 'collect' ? 'public' : 'private' };
      let asset: SkillAssetDetail;
      if (form === 'collect') {
        const result = await api<{ asset?: SkillAssetDetail; choices?: string[] }>('/api/skill-assets/collect', { method: 'POST', body: JSON.stringify({ ...body, url, ...(skillPath ? { path: skillPath } : {}) }) });
        if (result.choices) { setPaths(result.choices); setNotice('选择仓库中的一个 Skill 文件后继续。'); return; }
        asset = result.asset!;
      } else asset = await api<SkillAssetDetail>(`/api/projects/${project.id}/skill-assets`, { method: 'POST', body: JSON.stringify({ ...body, planId, ...(skillNodeId ? { skillNodeId } : {}) }) });
      setScope(asset.visibility === 'private' ? 'personal' : 'public'); setSelection({ assetId: asset.id, releaseId: asset.releaseId }); setDetail(asset); setForm(null); refresh(); setNotice(asset.visibility === 'public' ? '资产已收录，官方验证状态已同步；完成后可查看报告和实验现场。' : '已保存到我的资产，公开发布后会自动进入官方验证。');
    });
  };
  const useAsset = (mode: 'skill' | 'template') => {
    if (!detail) return;
    void perform(async () => {
      const updated = await api<ExperimentGraph>(`/api/skill-assets/${detail.id}/use`, { method: 'POST', body: JSON.stringify({ projectId: project.id, releaseId: detail.releaseId, mode, expectedRevision: graph?.revision || 0 }) });
      onGraph(updated);
      const reference = updated.assetReferences?.find(reference => reference.assetId === detail.id && reference.releaseId === detail.releaseId) || updated.assetReferences?.find(reference => reference.assetId === detail.id);
      if (reference) setSelection({ assetId: reference.assetId, releaseId: reference.releaseId });
      refresh();
      onDraft(`请使用已采用的 Skill「${detail.name}」（资产版本 ${reference?.releaseId || detail.releaseId}）。先读取 get_creative，再用 read_skill_reference 读取参考现场 ${reference?.id || ''}，参考其中的任务、Prompt、模型 / 工具、输入输出和依赖版本。源文件目录：${reference?.workspace || '当前创意工作区'}。检查并恢复运行环境，安装后用 capture_skill_environment 保存实际版本，workspace 使用上述源文件目录。请基于${mode === 'template' ? '已复制的实验步骤' : '这个 Skill'}继续我的创作；先确认本次目标和需要替换的输入，保留原始示例与历史结果。`);
      onContinue();
    });
  };
  const report = detail?.reports.at(-1), snapshot = report?.snapshot || detail?.release.snapshot;
  const locked = busy || disabled;
  return <section className={`skill-center${selection ? ' has-detail' : ''}`} aria-label="公共资产中心">
    <header className="skill-center-header"><div><h2>资产中心</h2><p>看过效果，带着现场开始创作。</p></div><div className="skill-actions"><button type="button" disabled={locked} onClick={() => openForm('publish')}><Upload size={14} />沉淀 Skill</button><button type="button" disabled={locked} onClick={() => openForm('collect')}><Plus size={15} />收录 GitHub</button></div></header>
    {error && <div className="skill-message is-error" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误" onClick={() => setError('')}><X size={14} /></button></div>}
    {notice && <div className="skill-message" role="status">{notice}</div>}
    {form ? <div className="skill-form-container"><button type="button" className="skill-back" onClick={() => setForm(null)} disabled={busy}><ArrowLeft size={14} />返回资产中心</button><form className="skill-form" onSubmit={submit}><h3>{form === 'collect' ? '收录一个公开项目' : '把这次方法保存为 Skill'}</h3><p>{form === 'collect' ? '支持 SKILL.md 和 GitHub 项目，收录后自动交给官方 Agent 实验验证。' : '保存所选方案的方法、Prompt、输入输出、工程源文件及已记录的环境。公开后所有平台用户都能查看这些交付内容。'}</p>
      {form === 'collect' && <label>GitHub 链接<input type="url" required value={url} placeholder="https://github.com/674345386/LivePortrait" onChange={event => { setURL(event.target.value); setPaths([]); setSkillPath(''); }} /></label>}
      {!!paths.length && <label>Skill 文件<select value={skillPath} required onChange={event => setSkillPath(event.target.value)}><option value="">选择要收录的文件</option>{paths.map(path => <option key={path}>{path}</option>)}</select></label>}
      <label>名称{form === 'collect' && <small>可选，默认使用仓库名称</small>}<input value={name} maxLength={120} required={form === 'publish'} onChange={event => setName(event.target.value)} /></label>
      {form === 'publish' && <><label>制作方案<select value={planId} required onChange={event => setPlanId(event.target.value)}><option value="">选择一个方案</option>{graph?.plans?.map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label><label>方法来源<select value={skillNodeId} onChange={event => setSkillNodeId(event.target.value)}><option value="">从方案中沉淀新 Skill</option>{graph?.nodes.filter(node => node.kind === 'skill').map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label></>}
      <label>用途简介<textarea value={summary} maxLength={2000} required={form === 'publish'} placeholder="它适合解决什么问题？" onChange={event => setSummary(event.target.value)} /></label>
      <label>需要验证的能力<textarea required value={claims} maxLength={12000} placeholder="每行一项，例如：用人物图片和驱动视频生成人像动画" onChange={event => setClaims(event.target.value)} /></label>
      <label>主题<input value={topicsText} maxLength={300} placeholder="例如：人物动画、视频创作；官方验证后会进一步分类" onChange={event => setTopicsText(event.target.value)} /></label>
      {form === 'publish' && <label className="skill-checkbox"><input type="checkbox" checked={share} onChange={event => setShare(event.target.checked)} />同时发布到公共资产中心并自动验证</label>}
      <button className="skill-primary" type="submit" disabled={locked || form === 'publish' && !planId}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{form === 'collect' ? '收录到公共中心' : share ? '保存并发布' : '保存到我的资产'}</button>
    </form></div> : <div className="skill-center-body"><div className="skill-browser"><div className="skill-browser-toolbar"><div className="skill-scopes" role="group" aria-label="资产空间"><button type="button" aria-pressed={scope === 'public'} onClick={() => { setScope('public'); setTopic('全部'); }}>公共市场</button><button type="button" aria-pressed={scope === 'personal'} onClick={() => { setScope('personal'); setTopic('全部'); }}>我的资产</button></div><button type="button" className="skill-icon" disabled={listLoading} aria-label="刷新资产" onClick={refresh}><RefreshCw size={14} /></button></div>
      <label className="skill-search"><Search size={15} /><input aria-label="搜索 Skill" placeholder="搜索名称、用途或主题" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select className="skill-topic-filter" aria-label="主题分类" value={topic} onChange={event => setTopic(event.target.value)}>{topics.map(topic => <option key={topic}>{topic}</option>)}</select>
      <div className="skill-asset-list" aria-busy={listLoading}>{listLoading ? <p className="skill-empty" role="status">正在读取资产…</p> : filtered.length ? filtered.map(asset => <button type="button" key={`${asset.id}:${asset.releaseId}`} disabled={busy} className={`skill-asset-row${selection?.assetId === asset.id && selection.releaseId === asset.releaseId ? ' is-selected' : ''}`} onClick={() => openAsset(asset)}><div><strong>{asset.name}</strong><AssetStatus asset={asset} /></div><p>{asset.summary}</p><footer><span>{asset.topics.join(' · ')}</span><span>{asset.demoCount ? '有参考现场' : '等待实验'}{asset.saved ? ' · 已收藏' : ''}</span></footer></button>) : <div className="skill-empty"><Package size={26} /><p>{scope === 'personal' ? '收藏或沉淀你的第一个 Skill' : '没有匹配的资产'}</p><span>{scope === 'personal' ? '在公共市场收藏，或把当前创作方法保存进来。' : '调整搜索条件，或收录一个 GitHub 项目。'}</span></div>}</div>
    </div><div className="skill-detail" aria-busy={detailLoading}>{detailLoading ? <p className="skill-empty" role="status">正在打开资产…</p> : detail ? <>
      <button className="skill-back skill-mobile-back" type="button" onClick={() => { setSelection(undefined); setDetail(undefined); }}><ArrowLeft size={14} />返回资产列表</button>
      <header className="skill-detail-header"><div><h2>{detail.name}</h2><AssetStatus asset={detail} /></div><p>{detail.summary}</p><small>{detail.author} · Skill · 版本 <code>{detail.version}</code></small>
        <div className="skill-actions"><button type="button" className="skill-primary" disabled={locked} onClick={() => useAsset(snapshot ? 'template' : 'skill')}>{snapshot ? <GitFork size={15} /> : <Plus size={15} />}{snapshot ? detail.demoCount ? '基于此实验创作' : '基于此流程创作' : '采用 Skill'}<ArrowRight size={14} /></button><button type="button" disabled={busy} aria-pressed={detail.saved} onClick={() => void perform(async () => { await api(`/api/skill-assets/${detail.id}/favorite`, { method: 'POST', body: JSON.stringify({ releaseId: detail.releaseId, saved: !detail.saved }) }); setDetail({ ...detail, saved: !detail.saved }); refresh(); })}><Bookmark size={14} fill={detail.saved ? 'currentColor' : 'none'} />{detail.saved ? '已收藏' : '收藏'}</button></div>
      </header>
      <nav className="skill-detail-tabs" aria-label="资产详情">{([['example', '实验现场'], ['report', '官方报告'], ['environment', '运行环境'], ['source', 'Skill 原文']] as const).map(([id, title]) => <button type="button" key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{title}</button>)}</nav>
      <div className="skill-detail-content">{section === 'example' ? <ExampleView snapshot={snapshot} official={!!report?.snapshot} /> : section === 'environment' ? <SkillEnvironmentView environment={report?.environment || detail.release.environment} /> : section === 'source' ? <><p>{detail.release.source.repository || '社区创作沉淀'}{detail.release.source.commit && <> · <code>{detail.release.source.commit}</code></>}</p>{detail.release.source.url && <a href={detail.release.source.url} target="_blank" rel="noreferrer">查看原始来源 <ExternalLink size={12} /></a>}<pre>{detail.release.content}</pre></> : <div className="skill-report"><h3>能力声明</h3><ul>{detail.claims.map((claim, index) => <li key={index}>{claim}</li>)}</ul>{report ? <><h3>{report.summary}</h3><p>{report.fitScore === null ? '尚无可评分的执行证据' : `声明符合度 ${report.fitScore} / 100`}</p><small>协议 {report.protocol} · 评测 Agent：{report.evaluator} · {new Date(report.createdAt).toLocaleString('zh-CN')}</small>{report.blockedReason && <p className="skill-condition">{report.blockedReason}</p>}{report.models.map(model => <div className="skill-model-result" key={model.model}><strong>{model.model}</strong><p>通过 {model.successes} / {model.trials} 次 · 95% 置信区间 {(model.interval[0] * 100).toFixed(0)}%–{(model.interval[1] * 100).toFixed(0)}%</p><small>仅覆盖已测输入和运行条件；少量样本不能证明普遍成功率。</small></div>)}{report.cases.map((item, index) => <details key={index}><summary>{item.passed ? '通过' : '未通过'} · {item.title}</summary><p>{item.observation}</p><small>声明：{detail.claims[item.claimIndex]} · 执行 {item.runId}</small></details>)}{!!report.limitations.length && <><h3>限制与失败边界</h3><ul>{report.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></>}</> : <p>尚无官方报告。验证 Agent 会实际执行、保留失败与成功记录，再根据证据形成结论。</p>}{detail.job?.error && <p className="skill-condition">{detail.job.error}</p>}<details><summary>统一评价标准</summary><ul>{detail.protocol.criteria.map(item => <li key={item}>{item}</li>)}</ul><p>评分依据已测声明；同一执行不会重复计入复现样本。</p></details></div>}</div>
      <footer className="skill-detail-footer"><button type="button" disabled={locked || detail.state === 'running'} onClick={() => void perform(async () => { const updated = await api<SkillAssetDetail>(`/api/skill-assets/${detail.id}/verify`, { method: 'POST', body: JSON.stringify({ releaseId: detail.releaseId }) }); setDetail(updated); setSelection({ assetId: updated.id, releaseId: updated.releaseId }); setSection('report'); refresh(); })}><FlaskConical size={14} />{detail.state === 'running' ? '官方验证中…' : report ? '重新验证' : '发起官方验证'}</button><button type="button" disabled={busy} onClick={() => void perform(async () => { downloadBlob(await apiBlob(`/api/skill-assets/${detail.id}/delivery?release=${detail.releaseId}`), `sail-skill-${detail.id}.zip`); })}><Download size={14} />交付包</button>{detail.canStop && <button type="button" disabled={busy} onClick={() => void perform(async () => { setDetail(await api<SkillAssetDetail>(`/api/skill-assets/${detail.id}/stop`, { method: 'POST' })); refresh(); })}>停止验证</button>}{detail.release.source.repository && <button type="button" disabled={busy} onClick={() => void perform(async () => { const updated = await api<SkillAssetDetail>(`/api/skill-assets/${detail.id}/upstream`, { method: 'POST' }); setDetail(updated); refresh(); setNotice(updated.upstream?.changed ? '上游有新版本。当前实验仍固定原版本，新版需要重新收录和验证。' : '上游版本未变化。'); })}><RefreshCw size={13} />检查更新</button>}{detail.owned && detail.visibility === 'private' && <button type="button" disabled={busy} onClick={() => void perform(async () => { setDetail(await api<SkillAssetDetail>(`/api/skill-assets/${detail.id}/share`, { method: 'POST' })); refresh(); setNotice('已发布到公共资产中心，官方验证状态已同步。'); })}><Upload size={13} />发布到公共中心</button>}</footer>
    </> : <div className="skill-empty skill-detail-empty"><FlaskConical size={32} strokeWidth={1.3} /><h3>先看一次真实运行，再开始自己的创作。</h3><p>选择一个 Skill，查看实验效果、官方报告和版本依赖，或把你的方法沉淀进来。</p></div>}</div></div>}
  </section>;
}
