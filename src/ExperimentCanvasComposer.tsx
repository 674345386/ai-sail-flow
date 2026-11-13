import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, Check, ChevronDown, ChevronUp, Film, GripHorizontal, Image, ImagePlus, LoaderCircle, MoreHorizontal, Save, Search, Sparkles, X } from 'lucide-react';
import { activeExperimentMethod, experimentMethodInput, type ExperimentGraph, type ExperimentMethod, type ExperimentNode, type ExperimentOperation } from '../shared/experiment';
import { imageRequestSize } from '../shared/image-generation-options';
import { addCanvasReference, canvasOutputKind, canvasReference, validateCanvasMethod, CANVAS_REFERENCE_MIME, type CanvasModel } from './experiment-canvas-model';
import type { WorkbenchSource } from './ExperimentPlans';

type DraftRecord = { baseline: string; method: ExperimentMethod };
type Mutate = (operation: ExperimentOperation) => Promise<ExperimentGraph | undefined>;
export default function ExperimentCanvasComposer({ projectId, selected, step, graph, sources, models, busy, dropped, mutate, onExecute, onDetails, onClose, onNext, onUpload, onDirty }: {
  projectId: string; selected: ExperimentNode; step?: ExperimentNode; graph: ExperimentGraph; sources: WorkbenchSource[]; models: CanvasModel[]; busy: boolean;
  dropped?: { nodeId: string; at: number }; mutate: Mutate; onExecute: (id: string, graph: ExperimentGraph) => void; onDetails: () => void; onClose: () => void;
  onNext: (id: string, kind: 'image' | 'video' | 'step') => void; onUpload?: (file: File) => Promise<WorkbenchSource | undefined>; onDirty: (dirty: boolean) => void;
}) {
  const storageKey = `sail-canvas-method-drafts:${projectId}`;
  const cache = useRef<Record<string, DraftRecord>>({});
  const loaded = useRef(false);
  if (!loaded.current) {
    loaded.current = true;
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      for (const [key, value] of Object.entries(saved).slice(-160)) {
        const record = value as DraftRecord; const parsed = experimentMethodInput.safeParse(record?.method);
        if (parsed.success && typeof record.baseline === 'string') cache.current[key] = { baseline: record.baseline, method: parsed.data };
      }
    } catch { /* Invalid drafts cannot replace saved methods. */ }
  }
  const current = step && activeExperimentMethod(step);
  const key = current && step ? `${step.id}:${current.id}` : '';
  const [draft, setDraft] = useState<ExperimentMethod | null>(() => current ? structuredClone(cache.current[key]?.method || current) : null);
  const [baseline, setBaseline] = useState(() => current ? cache.current[key]?.baseline || JSON.stringify(current) : '');
  const [collapsed, setCollapsed] = useState(false), [picker, setPicker] = useState(false), [query, setQuery] = useState('');
  const [error, setError] = useState(''), [savedHint, setSavedHint] = useState('');
  const [localSources, setLocalSources] = useState<WorkbenchSource[]>([]);
  const [offset, setOffset] = useState<{ left: number; top: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null), file = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const execution = useRef(false);
  const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(cache.current)); } catch { /* In-memory recovery remains available. */ } };

  useEffect(() => {
    setError(''); setSavedHint(''); setPicker(false); setQuery('');
    if (!current || !key) { setDraft(null); setBaseline(''); return; }
    const saved = cache.current[key];
    setDraft(structuredClone(saved?.method || current)); setBaseline(saved?.baseline || JSON.stringify(current));
  }, [key, selected.id]);
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const conflict = !!current && !!baseline && JSON.stringify(current) !== baseline;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { const timer = setTimeout(persist, 250); return () => { clearTimeout(timer); persist(); }; }, [draft, storageKey]);
  useEffect(() => {
    const element = panel.current, parent = element?.parentElement; if (!element || !parent) return;
    const observer = new ResizeObserver(() => setOffset(previous => {
      if (!previous) return previous;
      const next = { left: Math.max(8, Math.min(parent.clientWidth - element.offsetWidth - 8, previous.left)), top: Math.max(8, Math.min(parent.clientHeight - element.offsetHeight - 8, previous.top)) };
      return next.left === previous.left && next.top === previous.top ? previous : next;
    }));
    observer.observe(element); observer.observe(parent); return () => observer.disconnect();
  }, []);

  const update = (next: ExperimentMethod) => {
    if (!key) return;
    cache.current[key] = { baseline, method: next }; setDraft(next); setSavedHint(''); setError('');
  };
  const availableSources = useMemo(() => [...localSources, ...sources].filter((item, index, all) => all.findIndex(source => source.id === item.id) === index), [sources, localSources]);
  const pictures = availableSources.filter(source => source.mediaType === 'image' && source.referenceAvailable !== false && source.url);
  const addReference = (source: WorkbenchSource, node?: ExperimentNode) => {
    if (!draft) return;
    try { update(addCanvasReference(draft, { source, node })); setPicker(false); setQuery(''); requestAnimationFrame(() => input.current?.focus()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '引用失败。'); }
  };
  useEffect(() => {
    if (!dropped || !draft) return;
    const reference = canvasReference(graph, dropped.nodeId, availableSources);
    if (reference) addReference(reference.source, reference.node); else setError('请选择已经完成的图片；视频需要先提取画面。');
  }, [dropped?.at]);

  const kind = step ? canvasOutputKind(graph, step) : undefined;
  const model = models.find(item => item.id === draft?.model);
  const choices = models.filter(item => !kind || item.kind === kind);
  const actualKind = model?.kind || kind;
  const parameters = draft?.parameters || {};
  const isOmni = model?.tool === 'generate_video' || draft?.model.startsWith('omni_');
  const ratios = actualKind === 'video' ? isOmni ? ['16:9', '9:16'] : ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] : ['1:1', '16:9', '9:16', '4:5', '3:2', '2:3', '4:3', '3:4'];
  const setParameter = (field: string, value: string | number | undefined) => {
    if (!draft) return;
    const next = { ...draft.parameters };
    if (value === undefined || value === '') delete next[field]; else next[field] = value;
    if (field === 'aspectRatio' && actualKind === 'image') { if (value) next.size = imageRequestSize(String(value)); else delete next.size; }
    update({ ...draft, parameters: next });
  };
  const save = async (execute = false) => {
    if (!draft || !step || busy || execution.current) return;
    if (conflict) { setError('当前方法已在别处更新，请先读取最新版本。'); return; }
    if (execute && !draft.prompt.trim()) { setError('请先写下这次想生成的内容。'); input.current?.focus(); return; }
    if (execute) { try { validateCanvasMethod(draft, models); } catch (failure) { setError(failure instanceof Error ? failure.message : '模型参数无效。'); return; } }
    const parsed = experimentMethodInput.safeParse(draft);
    if (!parsed.success) { setError('方法内容超出限制，请检查提示词或引用数量。'); return; }
    const missing = draft.referenceIds.find(id => !pictures.some(source => source.id === id));
    if (missing) { setError('有参考图片尚未完成或已不可用，请移除后再保存。'); return; }
    execution.current = true; setError('');
    try {
      const updated = dirty ? await mutate({ op: 'method', stepId: step.id, method: parsed.data }) : graph;
      if (!updated) { setError('方法未能保存，草稿已保留。'); return; }
      const node = updated.nodes.find(item => item.id === step.id), method = node && activeExperimentMethod(node);
      if (!method) return;
      delete cache.current[key]; persist(); setBaseline(JSON.stringify(method)); setDraft(structuredClone(method)); setSavedHint('已保存');
      if (execute) onExecute(step.id, updated);
    } finally { execution.current = false; }
  };
  const reset = () => {
    if (!current || !key) return; delete cache.current[key]; persist(); setDraft(structuredClone(current)); setBaseline(JSON.stringify(current)); setError(''); setSavedHint('已读取最新方法');
  };
  const upload = async (selectedFile: File) => {
    if (!onUpload || busy || !draft) return;
    if (!/^(image\/(png|jpeg|webp))$/.test(selectedFile.type) || selectedFile.size > 10 * 1024 * 1024) { setError('请选择 10 MB 以内的 JPG、PNG 或 WebP 图片。'); return; }
    const source = await onUpload(selectedFile);
    if (source) { setLocalSources(previous => [source, ...previous]); addReference(source); }
  };
  const moveStart = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    const bounds = panel.current?.getBoundingClientRect(), parent = panel.current?.parentElement?.getBoundingClientRect();
    if (!bounds || !parent) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left - parent.left, top: bounds.top - parent.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePanel = (event: ReactPointerEvent<HTMLElement>) => {
    const start = drag.current, bounds = panel.current?.getBoundingClientRect(), parent = panel.current?.parentElement?.getBoundingClientRect();
    if (!start || start.id !== event.pointerId || !bounds || !parent) return;
    setOffset({ left: Math.max(8, Math.min(parent.width - bounds.width - 8, start.left + event.clientX - start.x)), top: Math.max(8, Math.min(parent.height - bounds.height - 8, start.top + event.clientY - start.y)) });
  };
  const finishMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.id === event.pointerId) { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }
  };

  return <div className={`lab-floating-composer${collapsed ? ' is-collapsed' : ''}`} ref={panel} data-composer-step={step?.id} role="region" aria-label="画布创作面板"
    style={offset ? { left: offset.left, top: offset.top, right: 'auto', bottom: 'auto' } : undefined}
    onDragOver={event => { if (step && (event.dataTransfer.types.includes(CANVAS_REFERENCE_MIME) || event.dataTransfer.types.includes('Files'))) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
    onDrop={event => { event.preventDefault(); event.stopPropagation(); const nodeId = event.dataTransfer.getData(CANVAS_REFERENCE_MIME); if (nodeId) { const reference = canvasReference(graph, nodeId, availableSources); if (reference) addReference(reference.source, reference.node); else setError('只能引用已完成的图片。'); } else if (event.dataTransfer.files[0]) void upload(event.dataTransfer.files[0]); }}>
    <header onPointerDown={moveStart} onPointerMove={movePanel} onPointerUp={finishMove} onPointerCancel={finishMove} onLostPointerCapture={() => { drag.current = null; }}>
      <GripHorizontal size={15} /><strong>{step ? step.title : selected.title}</strong><span className="lab-composer-save-state">{dirty ? '草稿' : savedHint || '已保存'}</span>
      <button type="button" title="节点详情与执行记录" aria-label="节点详情与执行记录" onClick={onDetails}><MoreHorizontal size={17} /></button>
      <button type="button" title={collapsed ? '展开创作面板' : '收起创作面板'} aria-label={collapsed ? '展开创作面板' : '收起创作面板'} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
      <button type="button" title="关闭创作面板" aria-label="关闭创作面板" onClick={onClose}><X size={15} /></button>
    </header>
    {!collapsed && (step && draft ? <>
      <div className="lab-composer-reference-toolbar"><button type="button" disabled={busy} onClick={() => { setPicker(value => !value); setQuery(''); }}><ImagePlus size={13} />引用素材<span>@</span></button>{onUpload && <button type="button" disabled={busy} onClick={() => file.current?.click()}><ImagePlus size={13} />上传</button>}<small>从画布拖入图片，或输入 @ 选择</small></div>
      {!!draft.referenceIds.length && <div className="lab-composer-references">{draft.referenceIds.map(id => { const source = availableSources.find(item => item.id === id); return <div key={id} title={source?.title || '参考素材不可用'}>{source?.url ? <img src={source.url} alt={source.title} /> : <Image size={19} />}<span>{source?.title || '素材不可用'}</span><button type="button" disabled={busy} aria-label={`移除 ${source?.title || id}`} onClick={() => update({ ...draft, referenceIds: draft.referenceIds.filter(value => value !== id) })}><X size={10} /></button></div>; })}</div>}
      {picker && <div className="lab-composer-reference-picker"><label><Search size={13} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索当前创意里的参考图片" /></label><div>{pictures.filter(source => source.title.toLowerCase().includes(query.toLowerCase())).map(source => <button type="button" key={source.id} disabled={busy || draft.referenceIds.includes(source.id)} onClick={() => addReference(source, graph.nodes.find(node => node.sourceId === source.id && node.mediaType === 'image' && node.status === 'completed'))}><img src={source.url} alt="" loading="lazy" /><span>{source.title}</span>{draft.referenceIds.includes(source.id) && <Check size={12} />}</button>)}{!pictures.length && <p>上传图片，或等待当前图片生成完成后再引用。</p>}</div><button type="button" className="lab-composer-picker-close" onClick={() => setPicker(false)}>关闭素材列表</button></div>}
      <textarea ref={input} className="lab-composer-prompt" aria-label="当前步骤的创作要求" rows={4} maxLength={16000} disabled={busy} value={draft.prompt} placeholder="描述你想生成的画面内容，输入 @ 引用素材…" onChange={event => update({ ...draft, prompt: event.target.value })} onKeyDown={event => {
        if (event.key === '@' && !event.nativeEvent.isComposing) { event.preventDefault(); setPicker(true); setQuery(''); }
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void save(true); }
      }} />
      {conflict && <p className="lab-composer-conflict">方法已在其他位置更新，当前草稿仍保留。<button type="button" onClick={reset}>读取最新版本</button></p>}
      {error && <p className="lab-composer-error" role="alert">{error}</p>}
      <div className="lab-composer-options"><label><span>模型</span><select disabled={busy} aria-label="创作模型" value={draft.model} onChange={event => {
        if (!event.target.value) { update({ ...draft, model: '' }); return; }
        const nextModel = models.find(item => item.id === event.target.value); if (!nextModel) return;
        const next = { ...draft.parameters };
        if (nextModel.kind === 'video') { delete next.size; delete next.quality; next.duration = nextModel.tool === 'generate_video' ? 10 : 6; next.resolution = nextModel.tool === 'generate_video' ? '720p' : '768p'; }
        update({ ...draft, model: nextModel.id, parameters: next });
      }}><option value="">按路线选择</option>{draft.model && !choices.some(item => item.id === draft.model) && <option value={draft.model}>{draft.model}</option>}{choices.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>比例</span><select aria-label="生成比例" disabled={busy} value={String(parameters.aspectRatio || '')} onChange={event => setParameter('aspectRatio', event.target.value || undefined)}><option value="">自动</option>{parameters.aspectRatio && !ratios.includes(String(parameters.aspectRatio)) && <option value={String(parameters.aspectRatio)}>{String(parameters.aspectRatio)}</option>}{ratios.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}</select></label>
        {actualKind === 'image' && <label><span>质量</span><select aria-label="图片质量" disabled={busy} value={String(parameters.quality || 'auto')} onChange={event => setParameter('quality', event.target.value)}>{['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map(value => <option value={value} key={value}>{{ auto: '自动', low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高' }[value]}</option>)}</select></label>}
        {actualKind === 'video' && <><label><span>时长</span><select aria-label="视频时长" disabled={busy} value={Number(parameters.duration || (isOmni ? 10 : 6))} onChange={event => setParameter('duration', Number(event.target.value))}>{[...new Set([...(isOmni ? [8, 10] : [5, 6, 8, 10, 15]), Number(parameters.duration || (isOmni ? 10 : 6))])].sort((a, b) => a - b).map(value => <option value={value} key={value}>{value} 秒</option>)}</select></label><label><span>清晰度</span><select aria-label="视频清晰度" disabled={busy} value={String(parameters.resolution || (isOmni ? '720p' : '768p'))} onChange={event => setParameter('resolution', event.target.value)}>{[...new Set([...(isOmni ? ['720p', '1080p'] : ['768p', '960p', '1080p']), String(parameters.resolution || (isOmni ? '720p' : '768p'))])].map(value => <option value={value} key={value}>{value}</option>)}</select></label></>}
      </div>
      <footer><span>{draft.prompt.length} 字 · {draft.referenceIds.length} 张参考图</span><button type="button" disabled={busy || !dirty || conflict} onClick={() => void save()}><Save size={13} />保存草稿</button><button type="button" className="lab-composer-generate" disabled={busy || conflict || !draft.prompt.trim()} onClick={() => void save(true)}>{busy ? <LoaderCircle size={14} className="lab-spin" /> : <Sparkles size={14} />}{busy ? '处理中' : '生成'}<ArrowUpRight size={14} /></button></footer>
      <input type="file" ref={file} hidden accept="image/jpeg,image/png,image/webp" onChange={event => { const selectedFile = event.target.files?.[0]; event.target.value = ''; if (selectedFile) void upload(selectedFile); }} />
    </> : <div className="lab-composer-source"><div>{selected.url && selected.mediaType === 'image' ? <img src={selected.url} alt={selected.title} /> : selected.mediaType === 'video' ? <Film size={28} /> : <Image size={28} />}<p>{selected.runId ? '这份结果和执行记录已经保留。可以用它继续创作，或查看来源方法。' : '选择下一步，把当前素材作为创作起点。'}</p></div><nav><button type="button" disabled={busy || !models.some(item => item.kind === 'image') || selected.mediaType === 'video'} onClick={() => onNext(selected.id, 'image')}><Image size={15} />继续创作图片</button><button type="button" disabled={busy || !models.some(item => item.kind === 'video')} onClick={() => onNext(selected.id, 'video')}><Film size={15} />制作视频</button><button type="button" onClick={onDetails}><MoreHorizontal size={15} />查看详情与历史</button></nav></div>)}
  </div>;
}
