import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agentCompletionUnread, type AgentActivities, type AgentActivity } from '../shared/agent-activity';
import { api } from './api';

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

export function useAgentActivity(enabled: boolean, activeId: string | undefined, userId?: string) {
  const key = `sop-agent-seen:${userId || 'local'}`;
  const initialSeen = useMemo(() => readSeenActivity(key), [key]);
  const [seen, setSeen] = useState(initialSeen);
  const currentSeen = seen.key === key ? seen : initialSeen;
  const [activityState, setActivities] = useState<{ key: string; entries: AgentActivities }>({ key, entries: {} });
  const activities = activityState.key === key ? activityState.entries : {};
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const displayed = useRef<{ key: string; id: string; activity: AgentActivity } | null>(null);
  const liveRevision = useRef(0);

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
    liveRevision.current++;
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

  useEffect(() => {
    if (!enabled) return;
    let inFlight = false;
    let retryDelay = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const refresh = async () => {
      if (controller.signal.aborted || inFlight || document.hidden) return;
      inFlight = true;
      const revision = liveRevision.current;
      let delay = 15_000;
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
        const next = await api<AgentActivities>('/api/agent/activity', { signal });
        signal.throwIfAborted();
        retryDelay = 0;
        if (Object.entries(next).some(([id, activity]) => id !== activeIdRef.current && activity.status === 'running')) delay = 5_000;
        // A concurrent live conversation update is newer than this snapshot.
        const live = displayed.current;
        const entries = revision !== liveRevision.current && live?.key === key ? { ...next, [live.id]: live.activity } : next;
        setActivities({ key, entries });
      } catch {
        retryDelay = Math.min(retryDelay ? retryDelay * 2 : 15_000, 60_000);
        delay = retryDelay;
      } finally {
        inFlight = false;
        if (!controller.signal.aborted && !document.hidden) timer = setTimeout(() => void refresh(), delay);
      }
    };
    const onVisibility = () => { clearTimeout(timer); if (!document.hidden) void refresh(); };
    void refresh();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [enabled, key]);

  const unreadIds = new Set(Object.entries(activities)
    .filter(([id, activity]) => agentCompletionUnread(activity, currentSeen.completed[id] || currentSeen.since))
    .map(([id]) => id));
  return { activities, unreadIds, receiveActivity };
}
