import type { AgentState } from './intelligent-ui';

export type AgentActivity = {
  status: 'idle' | 'running' | 'failed' | 'interrupted';
  updatedAt?: string;
  completedAt?: string;
};
export type AgentActivities = Record<string, AgentActivity>;

/** Only a successfully finished request can produce an unread completion. */
export function summarizeAgentActivity(state: AgentState): AgentActivity {
  let request;
  for (let index = state.messages.length - 1; index >= 0; index--) {
    if (state.messages[index].role === 'user') { request = state.messages[index]; break; }
  }
  const work = request?.work;
  const status = state.status === 'idle' && work?.status === 'interrupted' ? 'interrupted' : state.status;
  return {
    status,
    updatedAt: work?.finishedAt || state.messages.at(-1)?.createdAt,
    ...(status === 'idle' && work?.status === 'completed' && work.finishedAt ? { completedAt: work.finishedAt } : {}),
  };
}

export function agentCompletionUnread(activity: AgentActivity | undefined, seenAt: string): boolean {
  return activity?.status === 'idle' && !!activity.completedAt && Date.parse(activity.completedAt) > Date.parse(seenAt);
}

export function agentActivityTime(updatedAt: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(updatedAt));
  if (!Number.isFinite(elapsed)) return '';
  if (elapsed < 60_000) return 'now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}min`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}
