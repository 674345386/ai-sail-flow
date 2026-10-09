import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Copy, FileText, GitCompareArrows, X } from 'lucide-react';
import { inlinePromptDiff, promptDiffRows } from './prompt-diff';
import './prompt-diff.css';

export type PromptDiffField = { id: string; label: string; original: string; corrected?: string };
export type PromptDiffEntry = PromptDiffField & { fields?: PromptDiffField[]; notes?: ReactNode };
export type PromptDiffSelection = { entryId: string; fieldId?: string; mode: 'original' | 'corrected' | 'diff' };

export default function PromptDiffDialog({ title, entries, initial, onClose, onCopy }: {
  title: string; entries: PromptDiffEntry[]; initial: PromptDiffSelection;
  onClose: () => void; onCopy: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const headingId = useId();
  const [selection, setSelection] = useState(initial);
  const [changedOnly, setChangedOnly] = useState(false);
  const [activeChange, setActiveChange] = useState(0);
  const entry = entries.find(item => item.id === selection.entryId) || entries[0];
  const field = entry.fields?.find(item => item.id === selection.fieldId);
  const content = field || entry;
  const hasCorrection = entries.some(item => item.corrected !== undefined);
  const canCompare = content.corrected !== undefined;
  const mode = canCompare ? selection.mode : 'original';
  const rows = useMemo(() => promptDiffRows(content.original, content.corrected ?? content.original), [content.original, content.corrected]);
  const changes = useMemo(() => rows.flatMap((row, index) => row.kind !== 'equal' && (index === 0 || rows[index - 1].kind === 'equal') ? [index] : []), [rows]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { setActiveChange(0); scroll.current?.scrollTo(0, 0); }, [selection.entryId, selection.fieldId, selection.mode]);
  function jump(direction: number) {
    if (!changes.length) return;
    const next = (activeChange + direction + changes.length) % changes.length;
    setActiveChange(next);
    rowRefs.current.get(changes[next])?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return createPortal(<dialog ref={dialog} className="prompt-diff-dialog nodrag nopan nowheel" aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
    onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <div className="prompt-diff-shell">
      <header className="prompt-diff-heading"><div><GitCompareArrows size={20} /><div><h2 id={headingId}>{title}</h2><p>{hasCorrection ? '原片镜头信息 → 关键帧补充与校正' : '提取原片镜头信息 · 只读查看'}</p></div></div><button aria-label="关闭提示词浮窗" onClick={onClose}><X size={19} /></button></header>
      <div className="prompt-diff-layout">
        <aside className="prompt-diff-sidebar" aria-label="镜头列表"><div className="prompt-diff-sidebar-title"><FileText size={14} />镜头 / 提示词</div>{entries.map(item => <button key={item.id} aria-pressed={entry.id === item.id} onClick={() => setSelection({ ...selection, entryId: item.id, fieldId: undefined })}><span>{item.label}</span><small>{item.corrected === undefined ? '原始记录' : item.original === item.corrected ? '无差异' : '有差异'}</small></button>)}<p>{hasCorrection ? '左侧基准来自本次校正使用的原镜头快照。确认项保留原文。' : '直接读取当前视频拆解结果中的镜头信息。'}</p></aside>
        <main className="prompt-diff-main">
          <div className="prompt-diff-toolbar"><div className="prompt-diff-tabs" role="group" aria-label="查看方式">{([['original', '查看原文'], ['corrected', '查看提示词'], ['diff', '校正 Diff']] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} disabled={value !== 'original' && !canCompare} onClick={() => setSelection({ ...selection, mode: value })}>{label}</button>)}</div><div className="prompt-diff-tools">{mode === 'diff' ? <><label><input type="checkbox" checked={changedOnly} onChange={event => setChangedOnly(event.target.checked)} />仅差异</label><button title="上一处差异" aria-label="上一处差异" disabled={!changes.length} onClick={() => jump(-1)}><ArrowUp size={15} /></button><button title="下一处差异" aria-label="下一处差异" disabled={!changes.length} onClick={() => jump(1)}><ArrowDown size={15} /></button><span aria-live="polite">{changes.length ? `${activeChange + 1} / ${changes.length}` : '无差异'}</span></> : <button onClick={() => onCopy(mode === 'original' ? content.original : content.corrected!)}><Copy size={14} />复制</button>}</div></div>
          {entry.fields && <div className="prompt-diff-fields" role="group" aria-label="镜头字段"><button aria-pressed={!field} onClick={() => setSelection({ ...selection, fieldId: undefined })}>完整提示词</button>{entry.fields.map(item => <button key={item.id} aria-pressed={field?.id === item.id} onClick={() => setSelection({ ...selection, fieldId: item.id })}><i className={item.corrected !== undefined && item.original !== item.corrected ? 'changed' : ''} />{item.label}</button>)}</div>}
          <div className={`prompt-diff-pane-heading ${mode !== 'diff' ? 'single' : ''}`}><div><span>{mode === 'corrected' ? '校正后提示词' : '原视频分析结果'}</span><button title="复制原文" aria-label={mode === 'corrected' ? '复制校正后提示词' : '复制原文'} onClick={() => onCopy(mode === 'corrected' ? content.corrected! : content.original)}><Copy size={13} /></button></div>{mode === 'diff' && <><span className="prompt-diff-divider">→</span><div><span>校正后提示词</span><button title="复制校正后提示词" aria-label="复制校正后提示词" onClick={() => onCopy(content.corrected!)}><Copy size={13} /></button></div></>}</div>
          <div ref={scroll} className="prompt-diff-editor" tabIndex={0} aria-label={mode === 'diff' ? '原文与校正后提示词对比' : '提示词内容'}>
            {mode === 'diff' ? <>{rows.map((row, index) => {
              if (changedOnly && row.kind === 'equal') return null;
              const parts = row.kind === 'modified' ? inlinePromptDiff(row.left!, row.right!) : undefined;
              const activeStart = changes[activeChange];
              const activeEnd = rows.findIndex((item, i) => i > activeStart && item.kind === 'equal');
              const active = row.kind !== 'equal' && index >= activeStart && (activeEnd === -1 || index < activeEnd);
              return <div key={index} ref={element => { if (element) rowRefs.current.set(index, element); else rowRefs.current.delete(index); }} className={`prompt-diff-row ${row.kind} ${active ? 'active-change' : ''}`}>
                <div className={`prompt-diff-cell left ${row.left === undefined ? 'empty' : ''}`}><span className="prompt-diff-line-number">{row.leftLine}</span><pre>{parts ? parts.left.map((part, i) => part.changed ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>) : row.left ?? ' '}</pre></div>
                <span className="prompt-diff-divider">{row.kind === 'equal' ? '' : row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : '↔'}</span>
                <div className={`prompt-diff-cell right ${row.right === undefined ? 'empty' : ''}`}><span className="prompt-diff-line-number">{row.rightLine}</span><pre>{parts ? parts.right.map((part, i) => part.changed ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>) : row.right ?? ' '}</pre></div>
              </div>;
            })}{!changes.length && <div className="prompt-diff-unchanged">原文与校正后内容一致，确认记录没有改写原文。</div>}</> : (mode === 'original' ? content.original : content.corrected || '').split('\n').map((line, index) => <div key={index} className="prompt-diff-cell"><span className="prompt-diff-line-number">{index + 1}</span><pre>{line || ' '}</pre></div>)}
          </div>
          {entry.notes && <div className="prompt-diff-notes">{entry.notes}</div>}
          <footer className="prompt-diff-status"><span>{entry.label}{field && ` / ${field.label}`}</span>{mode === 'diff' && <div><span><i className="added" />新增</span><span><i className="removed" />删除</span><span><i className="modified" />修改</span></div>}<span>只读 · Esc 关闭</span></footer>
        </main>
      </div>
    </div>
  </dialog>, document.body);
}
