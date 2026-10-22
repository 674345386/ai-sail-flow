import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowUp, Clapperboard, ImagePlus, LoaderCircle, Plus, RefreshCw, RotateCcw, ScanSearch, Sparkles, Trash2, Undo2, Upload, Users, X } from 'lucide-react';
import { defaultReplication, type Project, type Replication, type TierSubject } from '../shared/domain';
import { replicationLevels, type ReplicationLevel } from '../shared/replication-levels';
import { tierPlan, usesSource, type FramePosition, type TierImage } from '../shared/tier-prompt';
import { ReplicationLevelPicker } from './ReplicationLevelPicker';
import './tier-workbench.css';

const lowRes = (source: { width?: number; height?: number }) => !!source.width && Math.max(source.width, source.height || 0) < 512;
const kindLabel: Record<TierSubject['kind'], string> = { person: '人物', product: '产品', object: '实体' };

export default function TierWorkbench({ project, disabled, busy, onChange, onCorrect, onCorrectAll, onDetectSubjects, onUploadSubjectImage, onGenerateSubjectImage, frameBusy, frameFailed, ratioLabel, onFrame, onFrameUndo, onFrameUpload, onGenerateShots, onVideo, onFrameRefs, onFrameInput }: {
  project: Project; disabled: boolean; busy: string;
  onChange: (next: Replication) => void; onCorrect: (shotId: string) => void; onCorrectAll: () => void;
  onDetectSubjects: () => void; onUploadSubjectImage: (subjectId: string, file: File) => void;
  onGenerateSubjectImage: (subjectId: string, instruction: string) => Promise<boolean>;
  frameBusy: string[]; frameFailed: Record<string, string>; ratioLabel: string;
  onFrame: (shotId: string, position: FramePosition) => void;
  onFrameUndo: (shotId: string, position: FramePosition) => void;
  onFrameUpload: (shotId: string, position: FramePosition, file: File) => void;
  onGenerateShots: (shotIds: string[]) => void; onVideo: (shotId: string) => void;
  onFrameRefs: (shotId: string, position: FramePosition, files: File[]) => void;
  onFrameInput: (shotId: string, position: FramePosition, patch: { text?: string; images?: TierImage[] } | null) => void;
}) {
  const rules = project.replication || defaultReplication;
  const shots = project.analysis?.shots || [];
  const [selected, setSelected] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadFor = useRef('');
  const [generating, setGenerating] = useState<{ id: string; text: string } | null>(null);
  const [position, setPosition] = useState<FramePosition>('first');
  const frameInput = useRef<HTMLInputElement>(null), frameUploadFor = useRef('');
  const refInput = useRef<HTMLInputElement>(null);
  /** One picker for 「+ 参考图」 and typing @: subjects' primary images, then uploaded product images, then 上传图片. */
  const [picker, setPicker] = useState<{ at: number } | null>(null), [pick, setPick] = useState(0);
  const plans = useMemo(() => shots.map(shot => tierPlan(project, shot)), [project, shots]);
  if (!project.analysis) return null;
  const index = Math.min(selected, shots.length - 1);
  const shot = shots[index], plan = plans[index];
  const entry = rules.shots?.[shot.id] || {};
  const setShot = (patch: Partial<NonNullable<Replication['shots']>[string]>) => {
    const next = { ...entry, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined) delete next[key];
    onChange({ ...rules, shots: { ...(rules.shots || {}), [shot.id]: next } });
  };
  const setSubjects = (subjects: TierSubject[]) => onChange({ ...rules, subjects });
  const subjects = rules.subjects || [];
  const needsCard = plans.some(item => item.level === 'swap' || item.level === 'adapt') || subjects.length > 0;
  const correctedCount = plans.filter(item => item.corrected).length;
  const working = !!busy;
  type RefImage = NonNullable<typeof entry.refImages>[number];
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
  const active = plan.frames.find(frame => frame.position === position)!;
  const activeKey = `${shot.id}:${position}`, activeRunning = frameBusy.includes(activeKey);
  const activeWaiting = !active.result && active.dependsOnFirst && !plan.frames[0].result;
  const choose = (index: number) => {
    const at = picker?.at ?? -1; setPicker(null);
    if (index >= candidates.length) { refInput.current?.click(); return; }
    const item = candidates[index];
    const images = active.images.some(image => image.url === item.url) ? undefined : [...active.images, { role: '参考', label: item.name, url: item.url }].slice(0, 16);
    if (at < 0) { if (images) onFrameInput(shot.id, position, { images }); return; }
    onFrameInput(shot.id, position, { text: active.text.slice(0, at) + `@${item.name} ` + active.text.slice(at + 1), ...(images ? { images } : {}) });
  };
  return <section className="panel tier-workbench" aria-label="复刻程度">
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

      <div className="tier-shots">
        <ol className="tier-shot-list">{plans.map((item, i) => <li key={item.shotId}><button type="button" className={i === index ? 'selected' : ''} onClick={() => setSelected(i)}>
          <span className="tier-shot-no">{String(i + 1).padStart(2, '0')}</span>
          <span className="tier-shot-time">{shots[i].start.toFixed(1)}–{shots[i].end.toFixed(1)}s</span>
          <span className={`tier-badge ${item.overridden ? 'is-override' : ''}`}>L{replicationLevels.find(level => level.id === item.level)!.step}</span>
          {item.corrected && <span className="tier-dot" title="已用关键帧修正" />}
          {item.stale && <AlertTriangle size={12} className="tier-stale-icon" />}
        </button></li>)}</ol>

        <div className="tier-shot-detail">
          <div className="tier-shot-head">
            <strong>镜头 {String(index + 1).padStart(2, '0')} · {(shot.end - shot.start).toFixed(1)} 秒 · {replicationLevels.find(level => level.id === plan.level)!.label}</strong>
            <span>
              <button type="button" className="btn small primary" disabled={disabled || working} onClick={() => onCorrect(shot.id)}>{busy.startsWith('正在修正') ? <LoaderCircle size={14} className="spin" /> : <ScanSearch size={14} />}{plan.corrected ? '重新修正' : '用关键帧修正'}</button>
              <button type="button" className="btn small" disabled={disabled || working} onClick={onCorrectAll}>全部镜头修正</button>
            </span>
          </div>
          {!plan.corrected && <p className="tier-empty">还没修正，下面先用拆解里的描述拼装。</p>}

          <details className="tier-override" open={plan.overridden}>
            <summary>这个镜头单独设置档位</summary>
            <select className="input" value={entry.level || ''} disabled={disabled} onChange={event => setShot({ level: (event.target.value || undefined) as ReplicationLevel | undefined })}>
              <option value="">跟随全局</option>
              {replicationLevels.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
            </select>
          </details>

          {plan.missingRefs.length > 0 && <p className="tier-missing">待上传参考图：{plan.missingRefs.join('、')}</p>}
          <div className="tier-frame-cols">{plan.frames.map(frame => {
            const key = `${shot.id}:${frame.position}`, running = frameBusy.includes(key), failure = running ? '' : frameFailed[key] || '', failed = !!failure, result = frame.result;
            const waiting = !result && frame.dependsOnFirst && !plan.frames[0].result;
            const generate = failed ? <span className="tier-frame-fail"><span>{failure}</span><button type="button" disabled={disabled || waiting} onClick={() => onFrame(shot.id, frame.position)}>重试</button></span>
              : <button type="button" className="btn small" disabled={disabled || waiting} onClick={() => onFrame(shot.id, frame.position)}>生成</button>;
            return <div className={`tier-frame-col${position === frame.position ? ' is-selected' : ''}`} key={frame.position} onClick={() => setPosition(frame.position)}>
            <strong className="tier-frame-col-head">{frame.label}</strong>
            <div className="tier-frame-pair">
              <figure className="tier-frame-box">{frame.source && <img src={frame.source.url} alt={`原片${frame.label}`} />}<span className="tier-frame-tag">原片</span></figure>
              <ArrowRight size={14} />
              <figure className={`tier-frame-box tier-new-frame${result ? '' : ' is-empty'}${running ? ' is-loading' : ''}${frame.outdated ? ' is-outdated' : ''}`}>
                {running ? null
                  : result ? <button type="button" className="tier-new-frame-img" onClick={() => setPosition(frame.position)}><img src={result.url} alt={`新${frame.label}`} /></button>
                  : generate}
                {result && !running && <span className="tier-new-frame-tools">
                  <button type="button" title="重新生成" aria-label="重新生成" disabled={disabled || waiting} onClick={() => onFrame(shot.id, frame.position)}><RefreshCw size={13} /></button>
                  <button type="button" title="上传替换" aria-label="上传替换" disabled={disabled} onClick={() => { frameUploadFor.current = key; frameInput.current?.click(); }}><Upload size={13} /></button>
                  {result.previous && <button type="button" title="撤回一次" aria-label="撤回一次" disabled={disabled} onClick={() => onFrameUndo(shot.id, frame.position)}><Undo2 size={13} /></button>}
                </span>}
                {result && !running && (frame.outdated || failed) && <span className="tier-frame-flag">{failed ? generate : <em className="tier-outdated">已过期</em>}</span>}
              </figure>
            </div>
          </div>; })}</div>
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
          <div className="tier-frame-bar">
            <button type="button" className="btn small primary" disabled={disabled || plan.frames.some(frame => frameBusy.includes(`${shot.id}:${frame.position}`))} onClick={() => onGenerateShots([shot.id])}><Sparkles size={14} />生成本镜关键帧</button>
            <button type="button" className="btn small" disabled={disabled || frameBusy.length > 0} onClick={() => onGenerateShots(shots.map(item => item.id))}>生成全部关键帧</button>
            <button type="button" className="btn small tier-frame-bar-end" disabled onClick={() => onVideo(shot.id)}><Clapperboard size={13} />生成视频片段</button>
          </div>
          <input ref={refInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ''; if (files.length) onFrameRefs(shot.id, position, files); }} />
          <input ref={frameInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; const [shotId, position] = frameUploadFor.current.split(':'); if (file && shotId) onFrameUpload(shotId, position as FramePosition, file); }} />
        </div>
      </div>
    </div>
  </section>;
}
