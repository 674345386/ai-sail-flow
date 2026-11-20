import { useEffect, useReducer, useRef } from 'react';
import { readAuthCallback, supabase } from './auth';
export type AppRoute =
  | { kind: 'landing'; mode?: 'agent' }
  | { kind: 'library' }
  | { kind: 'jobs' }
  | { kind: 'creative'; id: string };

export const appTitle = 'AI Creative Lab';

const creativeViews = new Set(['canvas', 'upload', 'materials', 'analysis', 'breakdown', 'remix', 'rewrite']);

export function parseRoute(pathname: string): AppRoute | null {
  const parts = pathname.split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return part; } });
  if (!parts.length) return { kind: 'landing' };
  if (parts[0] === 'agent' && parts.length === 1) return { kind: 'landing', mode: 'agent' };
  if (parts[0] === 'library' && parts.length === 1) return { kind: 'library' };
  if (parts[0] === 'jobs' && parts.length === 1) return { kind: 'jobs' };
  if (parts[0] === 'creative' && parts[1] && parts.length <= 3) {
    const view = parts[2]?.toLowerCase();
    if (!view || creativeViews.has(view)) return { kind: 'creative', id: parts[1] };
  }
  return null;
}

export function routePath(route: AppRoute): string {
  if (route.kind === 'landing') return route.mode === 'agent' ? '/agent' : '/';
  if (route.kind === 'library') return '/library';
  if (route.kind === 'jobs') return '/jobs';
  return `/creative/${encodeURIComponent(route.id)}/canvas`;
}

// The next URL write uses replaceState instead of pushState (system-driven changes: boot, job completion, auth).
let replaceNext = false;
export function replaceNextUrl() { replaceNext = true; }

// While an auth callback (/auth/callback, ?code=, #access_token) is still in the URL, leave it to auth.ts.
const authCallbackPending = () => !!supabase && readAuthCallback().active;

export function useUrlSync({ path, title, ready, paused, onRoute }: {
  path: string; // desired pathname for the current state; '' = unknown yet
  title: string;
  ready: boolean; // initial URL has been applied to state
  paused: boolean; // a transition is in progress (e.g. busy); wait for it to settle
  onRoute: (route: AppRoute) => Promise<void> | void; // apply a URL (back/forward) to state
}) {
  const onRouteRef = useRef(onRoute);
  const readyRef = useRef(ready);
  const applying = useRef(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { onRouteRef.current = onRoute; readyRef.current = ready; });

  // State -> URL. Runs after every render; only writes when the pathname differs.
  useEffect(() => {
    if (!ready || paused || applying.current || !path || authCallbackPending()) return;
    const replace = replaceNext;
    replaceNext = false;
    if (path === window.location.pathname) return;
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
  });

  useEffect(() => { if (title && document.title !== title) document.title = title; }, [title]);

  // URL -> state on back/forward.
  useEffect(() => {
    const onPopState = () => {
      if (!readyRef.current || authCallbackPending()) return;
      const route = parseRoute(window.location.pathname);
      applying.current = true;
      void Promise.resolve()
        .then(() => route ? onRouteRef.current(route) : undefined)
        .catch(() => {})
        .finally(() => { applying.current = false; replaceNext = true; rerender(); });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
