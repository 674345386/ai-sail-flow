import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

const STORAGE_KEY = 'sail-intelligent-agent-chat-width-v1';
const HANDLE_WIDTH = 8;

export function agentSplitBounds(available: number, requested: number | null) {
  const width = Number.isFinite(available) && available > 0 ? available : 1000;
  const maximum = Math.max(280, width - 320 - HANDLE_WIDTH);
  const desired = requested !== null && Number.isFinite(requested) ? requested : width * .36;
  return { minimum: 280, maximum, width: Math.round(Math.max(280, Math.min(desired, maximum))) };
}

export function useAgentWorkspaceSplit() {
  const workspace = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const preferredWidth = useRef<number | null>(null);
  const [requestedWidth, setRequestedWidth] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(saved) && saved >= 280 ? saved : null;
    } catch { return null; }
  });
  const [available, setAvailable] = useState(0);
  const [resizing, setResizing] = useState(false);
  preferredWidth.current = requestedWidth;
  const bounds = agentSplitBounds(available, requestedWidth);

  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const saveWidth = (value: number | null) => {
    try {
      if (value === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(value));
    } catch { /* The split still works if browser storage is unavailable. */ }
  };
  const resize = (width: number) => {
    const next = agentSplitBounds(workspace.current?.clientWidth || available, width).width;
    preferredWidth.current = next;
    setRequestedWidth(next);
    return next;
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setResizing(false);
    saveWidth(preferredWidth.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const reset = () => { preferredWidth.current = null; setRequestedWidth(null); saveWidth(null); };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const next = event.key === 'ArrowLeft' ? bounds.width - step
      : event.key === 'ArrowRight' ? bounds.width + step
      : event.key === 'Home' ? bounds.minimum : event.key === 'End' ? bounds.maximum : null;
    if (next === null) return;
    event.preventDefault();
    saveWidth(resize(next));
  };

  return {
    workspace, conversation, resizing, bounds,
    style: available ? { '--iua-chat-width': `${bounds.width}px` } as CSSProperties : undefined,
    separator: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        drag.current = { pointerId: event.pointerId, x: event.clientX, width: conversation.current?.getBoundingClientRect().width || bounds.width };
        event.currentTarget.setPointerCapture(event.pointerId);
        setResizing(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current;
        if (current?.pointerId === event.pointerId) resize(current.width + event.clientX - current.x);
      },
      onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish,
      onDoubleClick: reset, onKeyDown,
    },
  };
}
