import { Lock, Sparkles, Upload } from 'lucide-react';
import { defaultReplication, type Replication } from '../shared/domain';
import { dimensionStates, levelInfo, replicationDimensions, replicationLevels, type DimensionState, type ReplicationLevel } from '../shared/replication-levels';
import './replication-level.css';

const placeholders: Record<ReplicationLevel, string> = {
  exact: '可选，例如：去掉原片字幕',
  swap: '例如：男主换成参考图里的女生，现金堆换成我的产品',
  adapt: '例如：场景改到户外露营，一家三口在做早餐',
  remix: '例如：讲一个通勤早晨的故事',
};
const stateMeta: Record<DimensionState, { label: string; Icon: typeof Lock }> = {
  keep: { label: '沿用', Icon: Lock }, yours: { label: '换成你的', Icon: Upload }, new: { label: '重新生成', Icon: Sparkles },
};

export function ReplicationLevelPicker({ value, hasRefs, disabled, onChange }: { value?: Replication; hasRefs: boolean; disabled?: boolean; onChange: (next: Replication) => void }) {
  const rules = value || defaultReplication;
  const current = rules.level || 'exact';
  const states = dimensionStates(rules, hasRefs);
  const pick = (level: ReplicationLevel) => {
    // The old default free text describes near-exact replication; clear it so it does not fight a wider tier.
    const isDefault = rules.preserve === defaultReplication.preserve && rules.change === defaultReplication.change;
    onChange({ ...rules, ...(isDefault && level !== 'exact' ? { preserve: '', change: '' } : {}), level });
  };
  return <div className="replication-picker">
    <div className="replication-levels" role="radiogroup" aria-label="复刻等级">
      {replicationLevels.map(level => <button type="button" role="radio" aria-checked={current === level.id} key={level.id} disabled={disabled}
        className={`replication-level ${current === level.id ? 'selected' : ''}`} onClick={() => pick(level.id)}>
        <strong>{level.label}</strong><small>{level.short}</small>
      </button>)}
    </div>
    <p className="replication-desc">{levelInfo(current).description}</p>
    <div className="replication-dims">
      {replicationDimensions.map(item => { const { label, Icon } = stateMeta[states[item.id]];
        return <span key={item.id} className={`replication-dim is-${states[item.id]}`} title={label}><Icon size={11} aria-hidden="true" />{item.label}</span>; })}
    </div>
    {current === 'remix' && <label className="replication-check"><input type="checkbox" disabled={disabled} checked={rules.keepStyle !== false}
      onChange={event => onChange({ ...rules, keepStyle: event.target.checked })} />沿用原片风格</label>}
    <label className="field"><span className="field-label">{current === 'remix' ? '新主题 · 必填' : '你的改动需求'}</span>
      <textarea className="input textarea" rows={2} disabled={disabled} value={rules.change} placeholder={placeholders[current]}
        onChange={event => onChange({ ...rules, change: event.target.value })} /></label>
  </div>;
}
