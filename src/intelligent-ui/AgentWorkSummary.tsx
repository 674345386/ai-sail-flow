import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AgentWork } from '../../shared/agent-message';
import { formatAgentWorkDuration } from '../../shared/agent-work';
import { useLang } from '../i18n';

export function AgentWorkSummary({ work }: { work: AgentWork }) {
  const { lang } = useLang();
  const english = lang === 'en';
  const [now, setNow] = useState(Date.now);
  const running = work.status === 'running';
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, work.startedAt]);
  const elapsed = running ? now - Date.parse(work.startedAt) : work.finishedAt ? Date.parse(work.finishedAt) - Date.parse(work.startedAt) : NaN;
  const duration = formatAgentWorkDuration(elapsed, english);
  const label = running ? english ? 'Working' : '正在处理'
    : work.status === 'failed' ? english ? 'Failed' : '处理失败'
    : work.status === 'interrupted' ? english ? 'Stopped' : '已停止'
    : duration ? english ? 'Worked for' : work.estimated ? '约用时' : '已处理' : english ? 'Awaiting response' : '等待回答';
  const displayDuration = duration && work.estimated && english ? `~${duration}` : duration;
  return <details className="iua-work-summary">
    <summary><span>{label}{displayDuration ? ` ${displayDuration}` : ''}</span><ChevronRight size={15} aria-hidden="true" /></summary>
    <div className="iua-work-details">{work.estimated && duration && <p>{english ? 'Duration estimated from the question and last saved reply.' : '耗时根据提问与最后一条回答的时间估算。'}</p>}{work.steps.length ? <ol>{work.steps.map((step, index) => <li key={`${step.at}:${index}`}>{step.label}</li>)}</ol> : <p>{english ? 'No activity details were saved for this conversation.' : '这轮历史对话没有保存处理详情。'}</p>}</div>
  </details>;
}
