import { useEffect, useId, useRef, useState } from 'react';
import { AGENT_ADAPTATIONS, type AgentAdaptation } from '../../shared/agent-adaptation';

export function AgentAdaptationControl({ value, disabled, saving, onChange }: {
  value: AgentAdaptation;
  disabled: boolean;
  saving: boolean;
  onChange: (value: AgentAdaptation) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const committing = useRef(false);
  useEffect(() => { setDraft(value); }, [value]);
  const selected = AGENT_ADAPTATIONS[draft];
  const commit = async (next = draft) => {
    if (disabled || saving || committing.current || next === value) return;
    committing.current = true;
    try { if (!await onChange(next)) setDraft(value); }
    finally { committing.current = false; }
  };
  return <fieldset className="iua-adaptation" disabled={disabled || saving} aria-busy={saving} aria-describedby={`${id}-description`}>
    <legend>创作适配</legend>
    <div className="iua-adaptation-row">
      <span className="iua-adaptation-label" aria-hidden="true">创作适配</span>
      <div className="iua-adaptation-stops">{AGENT_ADAPTATIONS.map(option => <label className="iua-adaptation-choice" key={option.value} title={option.description}>
        <input type="radio" name={id} value={option.value} checked={draft === option.value}
          onChange={() => { setDraft(option.value); void commit(option.value); }} />
        <span>{option.label}</span>
      </label>)}</div>
    </div>
    <p id={`${id}-description`} role="status">{saving ? '正在保存…' : selected.description}</p>
  </fieldset>;
}
