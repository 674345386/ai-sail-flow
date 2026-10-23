import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, ArrowUp, Clapperboard, ImagePlus, LoaderCircle, Plus, RefreshCw, ScanSearch, Sparkles, Trash2, Undo2, Upload, Users, X } from 'lucide-react';
import { defaultReplication, type Project, type Replication, type Shot, type TierSubject } from '../shared/domain';
import { replicationLevels, type ReplicationLevel } from '../shared/replication-levels';
import { framePositions, tierPlan, usesSource, type FramePosition, type TierFramePlan, type TierImage, type TierPlan } from '../shared/tier-prompt';
import { ReplicationLevelPicker } from './ReplicationLevelPicker';
import './tier-workbench.css';

const lowRes = (source: { width?: number; height?: number }) => !!source.width && Math.max(source.width, source.height || 0) < 512;
const kindLabel: Record<TierSubject['kind'], string> = { person: '人物', product: '产品', object: '实体' };
const levelLabel = (level: ReplicationLevel) => replicationLevels.find(item => item.id === level)!.label;
const shotNo = (index: number) => String(index + 1).padStart(2, '0');
export const aspectOf = (ratioLabel: string) => { const [w, h] = ratioLabel.split(':').map(Number); return w > 0 && h > 0 ? `${w} / ${h}` : '9 / 16'; };

type FrameInputPatch = { text?: string; images?: TierImage[] } | null;
export type OpenFrame = { shotId: string; position: FramePosition };
/** Everything one frame needs from App: the same handlers the stage always used, so the overview, the drawer and a later canvas share them. */
export type FrameHandlers = {
  project: Project; disabled: boolean; busy: string; ratioLabel: string;
  frameBusy: string[]; frameFailed: Record<string, string>;
  onFrame: (shotId: string, position: FramePosition) => void;
  onFrameUndo: (shotId: string, position: FramePosition) => void;
  onFrameUpload: (shotId: string, position: FramePosition, file: File) => void;
  onFrameRefs: (shotId: string, position: FramePosition, files: File[]) => void;
  onFrameInput: (shotId: string, position: FramePosition, patch: FrameInputPatch) => void;
};

/** One frame's state, derived the same way the old frame cells did. */
function frameState(plan: TierPlan, frame: TierFramePlan, frameBusy: string[], frameFailed: Record<string, string>) {
  const key = `${plan.shotId}:${frame.position}`, running = frameBusy.includes(key);
  return { key, running, failure: running ? '' : frameFailed[key] || '', waiting: !frame.result && frame.dependsOnFirst && !plan.frames[0].result };
}

/** New frame (or the source frame marked 未生成) with its state drawn on top. Used by the overview thumbnails and the drawer. */
export function FrameVisual({ plan, frame, frameBusy, frameFailed, disabled, showSource, onFrame }: {
  plan: TierPlan; frame: TierFramePlan; frameBusy: string[]; frameFailed: Record<string, string>; disabled: boolean; showSource: boolean;
  onFrame: (shotId: string, position: FramePosition) => void;
}) {
  const { running, failure, waiting } = frameState(plan, frame, frameBusy, frameFailed), result = frame.result;
  const image = result?.url || frame.source?.url;
  return <>
    {image ? <img className={result ? '' : 'is-source'} src={image} alt={`${result ? '新' : '原片'}${frame.label}`} draggable={false} /> : <span className="tier-tile-blank" />}
    {showSource && result && frame.source && <img className="tier-tile-pip" src={frame.source.url} alt={`原片${frame.label}`} draggable={false} />}
    {running ? <span className="tier-tile-running"><LoaderCircle size={18} className="spin" /><span>生成中</span></span>
      : failure ? <span className="tier-frame-fail tier-tile-fail"><span>{failure}</span>
        <button type="button" disabled={disabled || waiting} onClick={event => { event.stopPropagation(); onFrame(plan.shotId, frame.position); }}>重试</button></span>
      : !result ? <em className="tier-tile-tag">未生成</em>
      : frame.outdated ? <em className="tier-tile-tag is-outdated">已过期</em> : null}
  </>;
}

/** The frame input box: what you see is what is sent. Unchanged from the single-shot panel, now owned by the drawer. */
function FrameComposer({ project, shot, plan, active, disabled, busy, frameBusy, onFrame, onFrameRefs, onFrameInput }: Pick<FrameHandlers, 'project' | 'disabled' | 'busy' | 'frameBusy' | 'onFrame' | 'onFrameRefs' | 'onFrameInput'> & { shot: Shot; plan: TierPlan; active: TierFramePlan }) {
  const rules = project.replication || defaultReplication, subjects = rules.subjects || [];
  const position = active.position;
  const refInput = useRef<HTMLInputElement>(null);
  /** One picker for 「+ 参考图」 and typing @: subjects' primary images, then uploaded product images, then 上传图片. */
  const [picker, setPicker] = useState<{ at: number } | null>(null), [pick, setPick] = useState(0);
  type RefImage = NonNullable<NonNullable<NonNullable<Replication['shots']>[string]>['refImages']>[number];
  const isMime = (mime: string): mime is RefImage['mime'] => ['image/png', 'image/jpeg', 'image/webp'].includes(mime);
  const fileOf = (url: string) => url.split('/').pop() || '';
  const candidates: (RefImage & { group: '主体' | '素材' })[] = [
    ...subjects.flatMap(subject => {
      const image = subject.images[0], crop = subject.sources?.[0];
      return image ? [{ group: '主体' as const, filename: image.filename, url: image.url, mime: image.mime, name: subject.name }]
        : crop ? [{ group: '主体' as const, filename: fileOf(crop.url), url: crop.url, mime: 'image/jpeg' as const, name: subject.name }] : [];
    }),
    ...project.assets.flatMap(asset => asset.kind === 'product' && isMime(asset.mime) ? [{ group: '素材' as const, filename: asset.filename, url: asset.url, mime: asset.mime, name: asset.name }] : []),
  ];
  const activeRunning = frameBusy.includes(`${shot.id}:${position}`);
  const activeWaiting = !active.result && active.dependsOnFirst && !plan.frames[0].result;
  const choose = (index: number) => {
    const at = picker?.at ?? -1; setPicker(null);
    if (index >= candidates.length) { refInput.current?.click(); return; }
    const item = candidates[index];
    const images = active.images.some(image => image.url === item.url) ? undefined : [...active.images, { role: '参考', label: item.name, url: item.url }].slice(0, 16);
    if (at < 0) { if (images) onFrameInput(shot.id, position, { images }); return; }
    onFrameInput(shot.id, position, { text: active.text.slice(0, at) + `@${item.name} ` + active.text.slice(at + 1), ...(images ? { images } : {}) });
  };
  return <>
          <div className="tier-composer">
            <div className="tier-composer-head"><strong>{active.label}</strong>
              {active.edited && <button type="button" className="tier-composer-reset" disabled={disabled} onClick={() => onFrameInput(shot.id, position, null)}>恢复默认</button>}</div>
            <div className="tier-composer-chips">{active.images.map((image, i) => <span className="tier-chip" key={`${image.url}-${i}`}>
                <span className="tier-chip-thumb"><img src={image.url} alt={image.label} />{image.role === '底图' && <em>底图</em>}
                  <button type="button" aria-label="移除这张图" disabled={disabled} onClick={() => onFrameInput(shot.id, position, { images: active.images.filter((_, j) => j !== i) })}><X size={14} /></button></span>
                <span className="tier-chip-preview" aria-hidden="true"><img src={image.url} alt="" /></span>
              </span>)}
              {active.images.length < 16 && <label className={`tier-chip-add${disabled ? ' is-disabled' : ''}`} aria-label="上传图片">{busy === '正在上传参考图' ? <LoaderCircle size={18} className="spin" /> : <Plus size={18} />}
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={disabled} onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) onFrameRefs(shot.id, position, files); }} /></label>}</div>
            <textarea className="tier-composer-text" rows={9} disabled={disabled} value={active.text} aria-label={`${active.label} prompt`}
              onKeyDown={event => {
                if (!picker) return;
                const total = candidates.length + 1;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setPick(value => (value + (event.key === 'ArrowDown' ? 1 : total - 1)) % total); }
                else if (event.key === 'Enter') { event.preventDefault(); choose(pick); }
                else if (event.key === 'Escape') setPicker(null);
              }}
              onChange={event => {
                const caret = event.target.selectionStart, value = event.target.value;
                setPicker(value.length === active.text.length + 1 && value[caret - 1] === '@' ? { at: caret - 1 } : null); setPick(0);
                onFrameInput(shot.id, position, { text: value });
              }} />
            <div className="tier-composer-foot">
              <button type="button" className="tier-composer-mention" disabled={disabled || active.images.length >= 16} onClick={() => { setPicker(picker ? null : { at: -1 }); setPick(0); }}>@ 主体 / 素材</button>
              <span className="tier-composer-spacer" />
              <span className="tier-composer-level">{replicationLevels.find(level => level.id === plan.level)!.label}</span>
              <button type="button" className="tier-composer-send" aria-label={`生成${active.label}`} disabled={disabled || activeRunning || activeWaiting || !active.text.trim()} onClick={() => onFrame(shot.id, position)}>
                {activeRunning ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={16} />}</button>
              {picker && <div className="tier-ref-picker" role="listbox">
                {(['主体', '素材'] as const).map(group => candidates.some(item => item.group === group) && <div key={group}><small>{group}</small>
                  {candidates.map((item, index) => item.group === group && <button type="button" role="option" aria-selected={pick === index} key={item.url} className={pick === index ? 'is-active' : ''}
                    onMouseDown={event => { event.preventDefault(); choose(index); }}><img src={item.url} alt="" /><span>{item.name}</span></button>)}
                </div>)}
                <button type="button" role="option" aria-selected={pick === candidates.length} className={`tier-ref-upload${pick === candidates.length ? ' is-active' : ''}`}
                  onMouseDown={event => { event.preventDefault(); choose(candidates.length); }}><Upload size={14} /><span>上传图片</span></button>
              </div>}
            </div>
          </div>
    <input ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) onFrameRefs(shot.id, position, files); }} />
  </>;
}

/** Right-side drawer for one frame: source vs new side by side, that frame's actions, and its input box. Takes only (shotId, position) plus the shared handlers, so the canvas can open it too. */
export function FrameDrawer({ shotId, position, onClose, ...props }: FrameHandlers & { shotId: string; position: FramePosition; onClose: () => void }) {
  const { project, disabled, ratioLabel, frameBusy, frameFailed, onFrame, onFrameUndo, onFrameUpload } = props;
  const shots = project.analysis?.shots || [];
  const index = shots.findIndex(item => item.id === shotId), shot = shots[index];
  const plan = useMemo(() => shot && tierPlan(project, shot), [project, shot]);
  const frameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Capture phase: an open @ picker sees Escape first and only closes itself.
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.tier-drawer .tier-ref-picker')) onClose(); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  if (!shot || !plan) return null;
  const frame = plan.frames.find(item => item.position === position)!;
  const { running, waiting } = frameState(plan, frame, frameBusy, frameFailed), result = frame.result;
  const aspectRatio = aspectOf(ratioLabel);
  return <aside className="tier-drawer" role="dialog" aria-label={`镜头 ${shotNo(index)} · ${frame.label}`}>
    <header className="tier-drawer-head">
      <div><strong>镜头 {shotNo(index)} · {frame.label}</strong><small>{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s · {levelLabel(plan.level)}</small></div>
      <button type="button" className="icon-btn" aria-label="关闭" title="关闭" onClick={onClose}><X size={16} /></button>
    </header>
    <div className="tier-drawer-body">
      <div className="tier-drawer-compare">
        <figure><span className="tier-drawer-frame" style={{ aspectRatio }}>{frame.source ? <img src={frame.source.url} alt={`原片${frame.label}`} /> : <span className="tier-tile-blank" />}</span><figcaption>原片{frame.source ? ` · ${frame.source.at.toFixed(2)}s` : ''}</figcaption></figure>
        <figure><span className={`tier-drawer-frame tier-tile${result ? '' : ' is-empty'}${running ? ' is-loading' : ''}${frame.outdated ? ' is-outdated' : ''}`} style={{ aspectRatio }}>
          <FrameVisual plan={plan} frame={frame} frameBusy={frameBusy} frameFailed={frameFailed} disabled={disabled} showSource={false} onFrame={onFrame} /></span>
          <figcaption>新帧</figcaption></figure>
      </div>
      <div className="tier-drawer-actions">
        <button type="button" className="btn small" disabled={disabled || waiting || running} onClick={() => onFrame(shot.id, position)}>{result ? <><RefreshCw size={13} />重新生成</> : <><Sparkles size={13} />生成</>}</button>
        {result && <button type="button" className="btn small" disabled={disabled || running} onClick={() => frameInput.current?.click()}><Upload size={13} />上传替换</button>}
        {result?.previous && <button type="button" className="btn small" disabled={disabled || running} onClick={() => onFrameUndo(shot.id, position)}><Undo2 size={13} />撤回一次</button>}
      </div>
      {plan.missingRefs.length > 0 && <p className="tier-missing">待上传参考图：{plan.missingRefs.join('、')}</p>}
      <FrameComposer key={`${shot.id}:${position}`} {...props} shot={shot} plan={plan} active={frame} />
    </div>
    <input ref={frameInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFrameUpload(shot.id, position, file); }} />
  </aside>;
}

export default function TierWorkbench({ project, disabled, busy, onChange, onCorrect, onCorrectAll, onDetectSubjects, onUploadSubjectImage, onGenerateSubjectImage, frameBusy, frameFailed, ratioLabel, onFrame, onGenerateShots, onVideo, openFrame, onOpenFrame }: {
  project: Project; disabled: boolean; busy: string;
  /** The frame whose drawer is open; App owns it so the canvas opens the same drawer. */
  openFrame: OpenFrame | null; onOpenFrame: (frame: OpenFrame) => void;
  onChange: (next: Replication) => void; onCorrect: (shotId: string) => void; onCorrectAll: () => void;
  onDetectSubjects: () => void; onUploadSubjectImage: (subjectId: string, file: File) => void;
  onGenerateSubjectImage: (subjectId: string, instruction: string) => Promise<boolean>;
  frameBusy: string[]; frameFailed: Record<string, string>; ratioLabel: string;
  onFrame: (shotId: string, position: FramePosition) => void;
  onGenerateShots: (shotIds: string[]) => void; onVideo: (shotId: string) => void;
}) {
  const rules = project.replication || defaultReplication;
  const shots = project.analysis?.shots || [];
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadFor = useRef('');
  const [generating, setGenerating] = useState<{ id: string; text: string } | null>(null);
  const open = openFrame;
  const [showSource, setShowSource] = useState(true);
  const [correcting, setCorrecting] = useState('');
  const plans = useMemo(() => shots.map(shot => tierPlan(project, shot)), [project, shots]);
  if (!project.analysis) return null;
  const setShotLevel = (shotId: string, level: ReplicationLevel | undefined) => {
    const next = { ...(rules.shots?.[shotId] || {}), level };
    if (level === undefined) delete next.level;
    onChange({ ...rules, shots: { ...(rules.shots || {}), [shotId]: next } });
  };
  const setSubjects = (subjects: TierSubject[]) => onChange({ ...rules, subjects });
  const subjects = rules.subjects || [];
  const needsCard = plans.some(item => item.level === 'swap' || item.level === 'adapt') || subjects.length > 0;
  const correctedCount = plans.filter(item => item.corrected).length;
  const working = !!busy;
  const done = plans.reduce((sum, plan) => sum + plan.frames.filter(frame => frame.result).length, 0), total = plans.length * framePositions.length;
  const aspectRatio = aspectOf(ratioLabel);
  const correctingRow = (shotId: string, index: number) => busy === '正在修正镜头' ? correcting === shotId : busy.startsWith(`正在修正镜头 ${index + 1}/`);
  return <section className={`panel tier-workbench${open ? ' has-drawer' : ''}`} aria-label="复刻程度">
    <div className="panel-heading"><div><h2>复刻程度</h2></div><span className="secondary-label">{correctedCount}/{shots.length} 个镜头已用关键帧修正</span></div>
    <div className="panel-body tier-body">
      <ReplicationLevelPicker value={rules} hasRefs={project.assets.some(asset => asset.kind === 'product') || subjects.some(item => item.images.length > 0)} disabled={disabled} onChange={onChange} />

      {needsCard && <div className="tier-subjects">
        <div className="tier-subjects-head"><strong><Users size={15} />主体设定卡</strong>
          <span><button type="button" className="btn small" disabled={disabled || working} onClick={onDetectSubjects}><ScanSearch size={14} />从拆解识别主体</button>
          <button type="button" className="btn small" disabled={disabled || subjects.length >= 12} onClick={() => setSubjects([...subjects, { id: crypto.randomUUID(), name: '新主体', kind: 'person', note: '', shotIds: [], images: [] }])}><Plus size={14} />添加主体</button></span></div>
        {!subjects.length && <p className="tier-empty">还没有主体。点「从拆解识别主体」，或手动添加。</p>}
        {subjects.map(subject => <div className="tier-subject" key={subject.id}>
          <div className="tier-subject-main">
            {subject.sources?.length ? <span className="tier-source-col"><span className={`tier-source ${usesSource(subject, rules.level || 'exact') ? '' : 'is-off'}`} tabIndex={0}>
              <img src={subject.sources[0].url} alt={`${subject.name} 原片参考`} />
              {subject.sources.length > 1 && <em>{subject.sources.length}</em>}
              {lowRes(subject.sources[0]) && <i className="tier-source-low" title="分辨率低，建议上传自己的参考图">分辨率低</i>}
              <span className="tier-source-pop" role="group" aria-label="原片参考">
                {subject.sources.map((source, i) => <figure key={source.filename} className={i === 0 ? 'is-primary' : ''}>
                  <button type="button" className="tier-source-pick" disabled={disabled || i === 0} title={i === 0 ? '当前使用' : '用这张'} onClick={() => setSubjects(subjects.map(item => item.id === subject.id ? { ...item, sources: [source, ...item.sources!.filter(other => other !== source)] } : item))}><img src={source.url} alt="" /></button>
                  <figcaption>镜头 {String(shots.findIndex(item => item.id === source.shotId) + 1).padStart(2, '0')} · {source.at.toFixed(1)}s{source.width ? ` · ${source.width}×${source.height}` : ''}{i === 0 ? ' · 当前' : ''}{lowRes(source) ? ' · 分辨率低，建议上传自己的参考图' : ''}</figcaption>
                  <button type="button" className="tier-source-del" aria-label="删除这张原片参考" disabled={disabled} onClick={() => setSubjects(subjects.map(item => item.id === subject.id ? { ...item, sources: item.sources!.filter(other => other !== source) } : item))}><X size={11} /></button>
                </figure>)}
              </span>
            </span>
              <label className="tier-source-use"><input type="checkbox" disabled={disabled} checked={usesSource(subject, rules.level || 'exact')} onChange={event => setSubjects(subjects.map(item => item.id === subject.id ? { ...item, useSource: event.target.checked } : item))} />用原片参考</label>
            </span> : <span className="tier-source is-empty" aria-hidden />}
            <input className="input" value={subject.name} maxLength={80} disabled={disabled} aria-label="主体名称" onChange={event => setSubjects(subjects.map(item => item.id === subject.id ? { ...item, name: event.target.value } : item))} />
            <select className="input" value={subject.kind} disabled={disabled} aria-label="主体类型" onChange={event => setSubjects(subjects.map(item => item.id === subject.id ? { ...item, kind: event.target.value as TierSubject['kind'] } : item))}>
              {Object.entries(kindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input className="input tier-subject-note" value={subject.note} maxLength={1000} disabled={disabled} placeholder="外观说明（可选）" aria-label="外观说明" onChange={event => setSubjects(subjects.map(item => item.id === subject.id ? { ...item, note: event.target.value } : item))} />
            <small>{subject.shotIds.length ? `出现在 ${subject.shotIds.length} 个镜头` : '全部镜头'}</small>
          </div>
          <div className="tier-subject-images">
            {subject.images.map(image => <span className="tier-thumb" key={image.filename}><img src={image.url} alt={image.name} />
              <button type="button" aria-label="移除参考图" disabled={disabled} onClick={() => setSubjects(subjects.map(item => item.id === subject.id ? { ...item, images: item.images.filter(other => other.filename !== image.filename) } : item))}><X size={11} /></button></span>)}
            {subject.images.length < 3 && <button type="button" className={`tier-upload ${subject.images.length ? '' : 'is-missing'}`} disabled={disabled || working} onClick={() => { uploadFor.current = subject.id; fileInput.current?.click(); }}><ImagePlus size={15} />{subject.images.length ? '再加一张' : '上传参考图'}</button>}
            {!!subject.sources?.length && subject.images.length < 3 && <button type="button" className="tier-upload" disabled={disabled || working} onClick={() => setGenerating(generating?.id === subject.id ? null : { id: subject.id, text: '' })}><Sparkles size={14} />生成新参考图</button>}
            <button type="button" className="icon-btn" aria-label="删除主体" disabled={disabled} onClick={() => setSubjects(subjects.filter(item => item.id !== subject.id))}><Trash2 size={14} /></button>
          </div>
          {generating?.id === subject.id && subject.sources?.[0] && <form className="tier-generate" onSubmit={async event => {
            event.preventDefault();
            if (await onGenerateSubjectImage(subject.id, generating.text)) setGenerating(null);
          }}>
            {usesSource(subject, rules.level || 'exact') ? <img src={subject.sources[0].url} alt="底图" /> : <span className="tier-generate-t2i">文生图</span>}
            <input className="input" autoFocus maxLength={500} value={generating.text} disabled={working} placeholder="想改成什么，比如：换成我的品牌包装（可留空）" onChange={event => setGenerating({ id: subject.id, text: event.target.value })} />
            <button type="submit" className="btn small primary" disabled={disabled || working}>{busy.startsWith('正在生成参考图') ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}生成</button>
            <button type="button" className="text-button" disabled={working} onClick={() => setGenerating(null)}>取消</button>
          </form>}
        </div>)}
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file && uploadFor.current) onUploadSubjectImage(uploadFor.current, file); }} />
      </div>}

      <div className="tier-board" style={{ '--tier-aspect': aspectRatio } as CSSProperties}>
        <div className="tier-board-bar">
          <span className="tier-board-level">档位 <b>{levelLabel(rules.level || 'exact')}</b></span>
          <span className="tier-board-progress" aria-label="已生成关键帧"><span className="tier-board-meter"><i style={{ width: `${total ? done / total * 100 : 0}%` }} /></span><b>{done} / {total}</b></span>
          <span className="tier-composer-spacer" />
          <label className="tier-board-toggle"><input type="checkbox" checked={showSource} onChange={event => setShowSource(event.target.checked)} /><span aria-hidden="true" />显示原帧</label>
          <button type="button" className="btn small" disabled={disabled || working} onClick={onCorrectAll}>{busy.startsWith('正在修正镜头 ') ? <LoaderCircle size={14} className="spin" /> : <ScanSearch size={14} />}全部镜头修正</button>
          <button type="button" className="btn small primary" disabled={disabled || frameBusy.length > 0} onClick={() => onGenerateShots(shots.map(item => item.id))}>{frameBusy.length ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}生成全部关键帧</button>
        </div>
        <div className="tier-board-head" aria-hidden="true"><span>镜头</span>{framePositions.map(position => <span key={position}>{plans[0]?.frames.find(frame => frame.position === position)?.label}</span>)}<span /></div>
        <ol className="tier-board-rows">{plans.map((plan, i) => { const shot = shots[i], entry = rules.shots?.[shot.id] || {};
          const shotRunning = plan.frames.some(frame => frameBusy.includes(`${shot.id}:${frame.position}`));
          return <li key={plan.shotId} className={`tier-row${open?.shotId === shot.id ? ' is-open' : ''}`}>
            <div className="tier-row-meta">
              <strong>{shotNo(i)}</strong>
              <span>{(shot.end - shot.start).toFixed(1)} 秒</span>
              <small>{shot.start.toFixed(1)}–{shot.end.toFixed(1)}s</small>
              <span className="tier-row-flags">
                <span className={`tier-badge ${plan.overridden ? 'is-override' : ''}`}>L{replicationLevels.find(level => level.id === plan.level)!.step}</span>
                {plan.corrected && <span className="tier-dot" title="已用关键帧修正" />}
                {plan.stale && <AlertTriangle size={12} className="tier-stale-icon" />}
              </span>
            </div>
            {plan.frames.map(frame => { const { running } = frameState(plan, frame, frameBusy, frameFailed);
              const selected = open?.shotId === shot.id && open.position === frame.position, openIt = () => onOpenFrame({ shotId: shot.id, position: frame.position });
              return <div key={frame.position} role="button" tabIndex={0} aria-label={`镜头 ${shotNo(i)} ${frame.label}`} aria-pressed={selected}
                className={`tier-tile${frame.result ? '' : ' is-empty'}${running ? ' is-loading' : ''}${frame.outdated ? ' is-outdated' : ''}${selected ? ' is-selected' : ''}`}
                onClick={openIt} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openIt(); } }}>
                <FrameVisual plan={plan} frame={frame} frameBusy={frameBusy} frameFailed={frameFailed} disabled={disabled} showSource={showSource} onFrame={onFrame} />
              </div>; })}
            <div className="tier-row-side">
              <select className="input" value={entry.level || ''} disabled={disabled} aria-label="这个镜头单独设置档位" title="这个镜头单独设置档位" onChange={event => setShotLevel(shot.id, (event.target.value || undefined) as ReplicationLevel | undefined)}>
                <option value="">跟随全局</option>
                {replicationLevels.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
              </select>
              <button type="button" className="btn small" disabled={disabled || working} onClick={() => { setCorrecting(shot.id); onCorrect(shot.id); }}>{correctingRow(shot.id, i) ? <LoaderCircle size={14} className="spin" /> : <ScanSearch size={14} />}{plan.corrected ? '重新修正' : '用关键帧修正'}</button>
              <button type="button" className="btn small" disabled={disabled || shotRunning} onClick={() => onGenerateShots([shot.id])}><Sparkles size={14} />生成本镜关键帧</button>
              <button type="button" className="btn small" disabled onClick={() => onVideo(shot.id)}><Clapperboard size={13} />生成视频片段</button>
              {plan.missingRefs.length > 0 && <p className="tier-missing">待上传参考图：{plan.missingRefs.join('、')}</p>}
            </div>
          </li>; })}</ol>
      </div>
    </div>
  </section>;
}
