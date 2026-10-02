import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FocusPoint } from '../shared/domain';
import { focusCategoryLabels } from '../shared/focus';
import './focus-points.css';

export default function FocusPointsEditor({ points = [], onChange, disabled = false, max = 12, onSeek }: {
  points?: FocusPoint[]; onChange: (points: FocusPoint[]) => void; disabled?: boolean; max?: number; onSeek?: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const patch = (id: string, changes: Partial<FocusPoint>) => onChange(points.map(point => point.id === id ? { ...point, ...changes, userEdited: true } : point));
  const add = () => {
    const text = draft.trim();
    if (!text || points.length >= max) return;
    onChange([...points, { id: crypto.randomUUID(), category: 'other', text, selected: true, source: 'user', userEdited: true }]);
    setDraft('');
  };
  return <div className="focus-points-editor">
    {points.length ? <div className="focus-point-list">{points.map(point => <div className={`focus-point ${point.selected ? 'is-selected' : ''}`} key={point.id}>
      <label className="focus-point-check"><input type="checkbox" checked={point.selected} disabled={disabled} onChange={event => patch(point.id, { selected: event.target.checked })} aria-label={`关注 ${point.text}`} /></label>
      <select value={point.category} disabled={disabled} aria-label="关注点类别" onChange={event => patch(point.id, { category: event.target.value as FocusPoint['category'] })}>{Object.entries(focusCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input className="focus-point-text" key={`${point.id}:${point.text}`} defaultValue={point.text} maxLength={400} disabled={disabled} aria-label="关注点内容" onBlur={event => { const value = event.target.value.trim(); if (value && value !== point.text) patch(point.id, { text: value }); else event.target.value = point.text; }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      {point.evidenceAt !== undefined && <button className="focus-point-time" type="button" disabled={!onSeek} onClick={() => onSeek?.(point.evidenceAt!)} title="定位到原片证据">{point.evidenceAt.toFixed(2)}s</button>}
      <span className="focus-point-source">{point.source === 'user' ? '手动' : point.userEdited ? '已订正' : 'AI'}</span>
      {point.source === 'user' && <button className="focus-point-remove" type="button" disabled={disabled} onClick={() => onChange(points.filter(item => item.id !== point.id))} aria-label={`删除关注点 ${point.text}`}><Trash2 size={14} /></button>}
    </div>)}</div> : <p className="focus-empty">暂无关注点。可以手动添加；下次分析也会给出 AI 建议。</p>}
    <div className="focus-point-add"><input value={draft} maxLength={400} disabled={disabled || points.length >= max} placeholder="补充你要重点复刻的细节" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') add(); }} /><button type="button" className="btn small" disabled={disabled || !draft.trim() || points.length >= max} onClick={add}><Plus size={14} />添加</button></div>
    <p className="focus-help">勾选的重点会进入改写和导出 Prompt；未勾选的观察记录仍保留。</p>
  </div>;
}
