import type { AgentMessage, AgentWork } from './agent-message';

export function createAgentWork(at = new Date().toISOString()): AgentWork {
  return { startedAt: at, status: 'running', steps: [{ at, label: '已接收请求' }] };
}

function activeWork(messages: AgentMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].work?.status === 'running' ? messages[i].work : undefined;
  }
}

export function recordAgentWork(messages: AgentMessage[], label: string, at = new Date().toISOString()) {
  const work = activeWork(messages);
  if (!work || work.steps.at(-1)?.label === label) return;
  work.steps.push({ at, label });
  if (work.steps.length > 100) work.steps.splice(1, work.steps.length - 100);
}

export function finishAgentWork(messages: AgentMessage[], status: Exclude<AgentWork['status'], 'running'>, at = new Date().toISOString()) {
  // Steers share the active turn; finish the original request and its additions.
  for (const message of messages) {
    const work = message.work;
    if (work?.status === 'running') { work.status = status; work.finishedAt = at; }
  }
}

export function agentWorkHistory(messages: AgentMessage[], running: boolean): Map<string, AgentWork> {
  const result = new Map<string, AgentWork>();
  let request: AgentMessage | undefined;
  for (const message of messages) {
    if (message.role === 'user') {
      request = message;
      // Legacy timing is a visible estimate from saved message timestamps,
      // distinct from the measured start/end times on newer requests.
      result.set(message.id, message.work || { startedAt: message.createdAt, status: 'completed', estimated: true, steps: [] });
    } else if (request && !request.work && message.role === 'assistant') {
      const work = result.get(request.id)!;
      const start = Date.parse(work.startedAt), reply = Date.parse(message.createdAt);
      if (Number.isFinite(start) && Number.isFinite(reply) && reply >= start && (!work.finishedAt || reply >= Date.parse(work.finishedAt))) work.finishedAt = message.createdAt;
      if (message.phase === 'commentary') work.steps.push({ at: message.createdAt, label: message.text });
    }
  }
  if (request && !request.work && running) {
    const work = result.get(request.id)!;
    work.status = 'running'; work.finishedAt = undefined; work.estimated = false;
  }
  return result;
}

export function formatAgentWorkDuration(milliseconds: number, english = false) {
  if (!Number.isFinite(milliseconds)) return '';
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 1) return english ? '<1s' : '不到 1 秒';
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return (english
    ? [hours && `${hours}h`, minutes && `${minutes}m`, (rest || !hours && !minutes) && `${rest}s`]
    : [hours && `${hours} 小时`, minutes && `${minutes} 分`, (rest || !hours && !minutes) && `${rest} 秒`]
  ).filter(Boolean).join(' ');
}
