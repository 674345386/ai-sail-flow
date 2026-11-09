import { lazy, Suspense, useEffect, useState } from 'react';
import App from './App';

const ResearchPage = lazy(() => import('./research/ResearchPage'));
const ExperimentLabPage = lazy(() => import('./ExperimentLabPage'));
const isResearch = (path: string) => /^\/research(?:\/|$)/.test(path);

/** Research is readable without booting a creative or creating a new project. */
export default function WorkspaceRoutes() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);

  if (/^\/lab(?:\/|$)/.test(pathname)) return <Suspense fallback={<div style={{ minHeight: '100dvh', padding: 40, background: '#101114', color: '#eee' }}>正在打开实验台…</div>}><ExperimentLabPage /></Suspense>;
  if (!isResearch(pathname)) return <App />;
  const navigate = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  return <Suspense fallback={<div style={{ minHeight: '100dvh', padding: '48px', background: '#fff', color: '#292827', fontFamily: 'var(--sail-font-ui)' }}>正在打开 Research…</div>}>
    <ResearchPage pathname={pathname} onNavigate={navigate} />
  </Suspense>;
}
