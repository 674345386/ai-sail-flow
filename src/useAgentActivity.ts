import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agentCompletionUnread, type AgentActivities, type AgentActivity } from '../shared/agent-activity';

type SeenActivity = { key: string; since: string; completed: Record<string, string> };

function readSeenActivity(key: string): SeenActivity {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Number.isFinite(Date.parse(saved.since)) && saved.completed && typeof saved.completed === 'object') {
      const completed = Object.fromEntries(Object.entries(saved.completed).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1]))));
      return { key, since: saved.since, completed };
    }
  } catch { /* Keep unread tracking in memory if storage is unavailable. */ }
  return { key, since: new Date().toISOString(), completed: {} };
}

export function useAgentActivity(activeId: string | undefined, userId?: string) {
  const key = `sop-agent-seen:${userId || 'local'}`;
  const initialSeen = useMemo(() => readSeenActivity(key), [key]);
  const [seen, setSeen] = useState(initialSeen);
  const currentSeen = seen.key === key ? seen : initialSeen;
  const [activityState, setActivities] = useState<{ key: string; entries: AgentActivities }>({ key, entries: {} });
  const activities = activityState.key === key ? activityState.entries : {};
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const displayed = useRef<{ key: string; id: string; activity: AgentActivity } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(currentSeen)); } catch { /* storage unavailable */ }
  }, [key, currentSeen]);

  const markSeen = useCallback((id: string, completedAt?: string) => {
    if (!completedAt) return;
    setSeen(previous => {
      const current = previous.key === initialSeen.key ? previous : initialSeen;
      if (Date.parse(completedAt) <= Date.parse(current.completed[id] || current.since)) return current;
      return { ...current, completed: { ...current.completed, [id]: completedAt } };
    });
  }, [initialSeen]);

  // A result counts as viewed only after the conversation has rendered it.
  const receiveActivity = useCallback((id: string, activity: AgentActivity) => {
    displayed.current = { key, id, activity };
    setActivities(current => ({ key, entries: { ...(current.key === key ? current.entries : {}), [id]: activity } }));
    if (id === activeIdRef.current && document.visibilityState === 'visible' && document.hasFocus()) markSeen(id, activity.completedAt);
  }, [key, markSeen]);

  useEffect(() => {
    const acknowledge = () => {
      const latest = displayed.current;
      if (document.visibilityState === 'visible' && document.hasFocus() && latest && latest.key === key && latest.id === activeIdRef.current) markSeen(latest.id, latest.activity.completedAt);
    };
    window.addEventListener('focus', acknowledge);
    document.addEventListener('visibilitychange', acknowledge);
    return () => { window.removeEventListener('focus', acknowledge); document.removeEventListener('visibilitychange', acknowledge); };
  }, [key, markSeen]);

  const receiveActivities = (entries: AgentActivities) => setActivities({ key, entries });
  const receiveActivityUpdate = (id: string, activity: AgentActivity) => {
    setActivities(current => ({ key, entries: { ...(current.key === key ? current.entries : {}), [id]: activity } }));
  };

  const unreadIds = new Set(Object.entries(activities)
    .filter(([id, activity]) => agentCompletionUnread(activity, currentSeen.completed[id] || currentSeen.since))
    .map(([id]) => id));
  return { activities, unreadIds, receiveActivity, receiveActivities, receiveActivityUpdate };
}
