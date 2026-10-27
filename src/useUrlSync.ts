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
//   /studio                        爆款工作室 · 落地页（Creatify 风格）
//   /studio/welcome                同上落地页别名
//   /studio/home                   落地页别名
//   /studio/creatives              商品套图
//   /studio/radar                  爆款雷达
//   /studio/tvc                    TVC 成片
//   /studio/remake                 热片复刻
//   /studio/remake/:id             指定雷达条目复刻
//   /studio/projects/:id           工作室项目详情
export type StudioSection = 'home' | 'welcome' | 'creatives' | 'radar' | 'tvc' | 'remake' | 'project';

export type AppRoute =
  | { kind: 'landing' }
  | { kind: 'library' }
  | { kind: 'creative'; id: string; step?: number; canvas?: boolean }
  | { kind: 'studio'; section: StudioSection; id?: string };

export const stepSlugs = ['upload', 'analysis', 'remix'] as const;
const stepAliases: Record<string, number> = { upload: 0, materials: 0, analysis: 1, breakdown: 1, remix: 2, rewrite: 2 };
export const stepTitles = ['素材', '拆解', '二创'];
export const appTitle = 'AI-Sail Flow';

const studioSections = new Set<string>(['welcome', 'home', 'creatives', 'radar', 'tvc', 'remake', 'projects']);

export function parseRoute(pathname: string): AppRoute | null {
  const parts = pathname.split('/').filter(Boolean).map(part => { try { return decodeURIComponent(part); } catch { return part; } });
  if (!parts.length) return { kind: 'landing' };
  if (parts[0] === 'library' && parts.length === 1) return { kind: 'library' };
  if (parts[0] === 'studio') {
    if (parts.length === 1) return { kind: 'studio', section: 'welcome' };
    const section = parts[1]?.toLowerCase();
    if (!studioSections.has(section)) return null;
    if (section === 'projects') {
      if (parts.length === 3 && parts[2]) return { kind: 'studio', section: 'project', id: parts[2] };
      return null;
    }
    if (section === 'remake') {
      if (parts.length === 2) return { kind: 'studio', section: 'remake' };
      if (parts.length === 3 && parts[2]) return { kind: 'studio', section: 'remake', id: parts[2] };
      return null;
    }
    if (section === 'home' || section === 'welcome') {
      if (parts.length === 2) return { kind: 'studio', section: section as StudioSection };
      return null;
    }
    if (parts.length === 2) return { kind: 'studio', section: section as StudioSection };
    return null;
  }
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
  if (route.kind === 'studio') {
    if (route.section === 'welcome') return '/studio';
    if (route.section === 'home') return '/studio/home';
    if (route.section === 'project') return `/studio/projects/${encodeURIComponent(route.id || '')}`;
    if (route.section === 'remake' && route.id) return `/studio/remake/${encodeURIComponent(route.id)}`;
    return `/studio/${route.section}`;
  }
  const base = `/creative/${encodeURIComponent(route.id)}`;
  if (route.canvas) return `${base}/canvas`;
  return route.step === undefined ? base : `${base}/${stepSlugs[Math.max(0, Math.min(2, route.step))]}`;
}

export function studioTitle(route: Extract<AppRoute, { kind: 'studio' }>): string {
  const labels: Record<StudioSection, string> = {
    home: '爆款工作室',
    welcome: '爆款工作室',
    creatives: '商品套图',
    radar: '爆款雷达',
    tvc: 'TVC 成片',
    remake: '热片复刻',
    project: '工作室项目',
  };
  const base = labels[route.section] || '爆款工作室';
  return route.id ? `${base} · ${route.id.slice(0, 8)} · ${appTitle}` : `${base} · ${appTitle}`;
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
