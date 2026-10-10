import { useEffect, useReducer, useRef } from 'react';
import { readAuthCallback, supabase } from './auth';

// Lightweight client routing: keeps location.pathname and the App view state in sync.
//   /                              landing
//   /library                       所有媒体
//   /creative/<id>                 creative, default step (normalized to a step URL)
//   /creative/<id>/upload          step 0 · 上传素材
//   /creative/<id>/analysis        step 1 · 视频拆解
//   /creative/<id>/remix           step 2 · 人物与视频二创
//   /creative/<id>/canvas          canvas view
export type AppRoute =
  | { kind: 'landing' }
  | { kind: 'library' }
  | { kind: 'creative'; id: string; step?: number; canvas?: boolean };

export const stepSlugs = ['upload', 'analysis', 'remix'] as const;
const stepAliases: Record<string, number> = { upload: 0, materials: 0, analysis: 1, breakdown: 1, remix: 2, rewrite: 2 };
export const stepTitles = ['素材', '拆解', '二创'];
export const appTitle = 'AI-Sail Flow';

export function parseRoute(pathname: string): AppRoute | null {
  const parts = pathname.split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return part; } });
  if (!parts.length) return { kind: 'landing' };
  if (parts[0] === 'library' && parts.length === 1) return { kind: 'library' };
  if (parts[0] === 'creative' && parts[1] && parts.length <= 3) {
    const view = parts[2]?.toLowerCase();
    if (!view) return { kind: 'creative', id: parts[1] };
    if (view === 'canvas') return { kind: 'creative', id: parts[1], canvas: true };
    if (view in stepAliases) return { kind: 'creative', id: parts[1], step: stepAliases[view] };
  }
  return null;
}

export function routePath(route: AppRoute): string {
  if (route.kind === 'landing') return '/';
  if (route.kind === 'library') return '/library';
  const base = `/creative/${encodeURIComponent(route.id)}`;
  if (route.canvas) return `${base}/canvas`;
  return route.step === undefined ? base : `${base}/${stepSlugs[Math.max(0, Math.min(2, route.step))]}`;
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
