import { useEffect, useRef, useState } from 'react';
import type { AgentState } from '../shared/intelligent-ui';
import type { WorkspaceUpdate } from '../shared/workspace-updates';
import { publicAuthRequired, supabase } from './auth';

type Connection = { key: string; connected: boolean; agent?: AgentState; historyError?: string };

export function useWorkspaceUpdates(id: string | undefined, account: string | undefined, agent: 'conversation' | 'workspace' | 'sidebar' | '', onUpdate: (update: WorkspaceUpdate) => void) {
  const key = `${account}:${id}:${agent}`;
  const [connection, setConnection] = useState<Connection>();
  const keyRef = useRef(key);
  keyRef.current = key;
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const { signal } = controller;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 2000;
    let sessionAccount = account;
    const path = `/api/workspace/events/${encodeURIComponent(id)}${agent ? `?agent=${agent}` : ''}`;
    const updateConnection = (patch: Partial<Connection>) => setConnection(previous => ({
      ...(previous?.key === key ? previous : { key, connected: false }),
      ...patch,
    }));

    const connect = async () => {
      try {
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        signal.throwIfAborted();
        if (publicAuthRequired) {
          if (!session || (sessionAccount !== undefined && session.user.id !== sessionAccount)) throw new Error('登录账号已变化。');
          sessionAccount = session.user.id;
        }
        const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
        const response = await fetch(path, { signal, headers });
        if (!response.ok || !response.body) throw new Error('无法连接工作台。');
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          signal.throwIfAborted();
          if (keyRef.current !== key) return;
          buffer += value;
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (!frame.startsWith('data: ')) continue;
            const update = JSON.parse(frame.slice(6)) as WorkspaceUpdate;
            retryDelay = 2000;
            if (update.type === 'agent') updateConnection({ connected: true, agent: update.state, historyError: undefined });
            else if (update.type === 'agent-unavailable') updateConnection({ connected: false, historyError: '创作 Agent 当前仅开放内部体验。' });
            else updateRef.current(update);
          }
        }
      } catch { /* Reconnecting reads a fresh snapshot. */ }
      if (signal.aborted) return;
      updateConnection({ connected: false, historyError: '对话暂时无法连接，正在重试…' });
      retry = setTimeout(() => void connect(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };
    void connect();
    return () => { controller.abort(); clearTimeout(retry); };
  }, [id, account, agent, key]);

  return connection?.key === key && id ? connection : undefined;
}
