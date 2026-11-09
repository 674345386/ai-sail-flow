import { useId } from 'react';
import { AGENT_PRESENTATIONS, type AgentPresentation } from '../../shared/agent-presentation';

export function AgentPresentationControl({ value, disabled, saving, onChange }: {
  value: AgentPresentation;
  disabled: boolean;
  saving: boolean;
  onChange: (value: AgentPresentation) => void;
}) {
  const id = useId();
  const selected = AGENT_PRESENTATIONS.find(option => option.value === value)!;
  return <div className="iua-presentation">
    <label htmlFor={id}>结果呈现</label>
    <select id={id} value={value} disabled={disabled || saving} aria-busy={saving} aria-describedby={`${id}-description`}
      onChange={event => onChange(event.target.value as AgentPresentation)}>
      {AGENT_PRESENTATIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <p id={`${id}-description`} role="status">{saving ? '正在保存…' : selected.description}</p>
  </div>;
}
