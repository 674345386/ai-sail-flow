import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Clapperboard,
  FolderOpen,
  Home,
  ImagePlus,
  LoaderCircle,
  ListChecks,
  Radar,
  Radio,
  ScanSearch,
  Sparkles,
} from 'lucide-react';
import type { AppRoute, StudioSection } from '../useUrlSync';
import { getStudioProject, type StudioProject, type TrendItem } from './studioApi';
import StudioLanding from './StudioLanding';
import './studio.css';

const StudioCreatives = lazy(() => import('./StudioCreatives'));
const StudioRadar = lazy(() => import('./StudioRadar'));
const RadarSpaceWorkspace = lazy(() => import('./RadarSpaceWorkspace'));
const StudioTvc = lazy(() => import('./StudioTvc'));
const StudioRemake = lazy(() => import('./StudioRemake'));

const navItems: Array<{ section: Exclude<StudioSection, 'project' | 'welcome' | 'home'>; label: string; icon: typeof Home }> = [
  { section: 'creatives', label: '商品套图', icon: ImagePlus },
  { section: 'tvc', label: 'TVC 成片', icon: Clapperboard },
  { section: 'remake', label: '热片复刻', icon: Sparkles },
];

const sectionLabels: Record<StudioSection, string> = {
  welcome: '发现与研究',
  home: '工作室介绍',
  creatives: '商品套图',
  radar: '爆款探索',
  tvc: 'TVC 成片',
  remake: '热片复刻',
  project: '项目详情',
};

function ProjectDetail({ id, onRemake, onCreatives }: { id: string; onRemake: () => void; onCreatives: () => void }) {
  const [project, setProject] = useState<StudioProject | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void getStudioProject(id).then(item => { if (!cancelled) setProject(item); }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : '项目不存在');
    });
    return () => { cancelled = true; };
  }, [id]);
  if (error) return <div className="studio-empty">{error}</div>;
  if (!project) return <div className="studio-empty"><LoaderCircle className="spin" size={18} /> 正在打开项目…</div>;
  return (
    <div className="studio-stack">
      <div className="studio-hero">
        <div>
          <div className="eyebrow">STUDIO PROJECT</div>
          <h1>{project.title}</h1>
          <p>模块 {project.module} · 状态 {project.status} · 更新于 {new Date(project.updatedAt).toLocaleString('zh-CN')}</p>
        </div>
      </div>
      <section className="studio-panel">
        <div className="studio-panel-heading"><h2><FolderOpen size={16} />项目摘要</h2></div>
        <div className="studio-note"><span>简述：{project.brief || '（无）'}</span></div>
        {project.sourceTrendId && <div className="studio-note" style={{ marginTop: 10 }}><span>来源热片：{project.sourceTrendId}</span></div>}
        {project.creatives && project.creatives.length > 0 && (
          <div className="studio-asset-grid" style={{ marginTop: 14 }}>
            {project.creatives.map(asset => (
              <article key={asset.id} className="studio-asset-card">
                <div className="studio-asset-thumb">{asset.url ? <img src={asset.url} alt="" /> : <ImagePlus size={20} />}</div>
                <div className="studio-asset-meta"><strong>{asset.kind}</strong><small>{asset.status}</small></div>
              </article>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {project.module === 'remake' && <button type="button" className="btn small" onClick={onRemake}>继续二创</button>}
          {(project.module === 'creatives' || project.module === 'tvc') && <button type="button" className="btn small" onClick={onCreatives}>回到创意</button>}
        </div>
      </section>
    </div>
  );
}

export default function StudioShell({
  route,
  onNavigate,
  onLeave,
  onBackWorkspace,
  onOpenTasks,
}: {
  route: Extract<AppRoute, { kind: 'studio' }>;
  onNavigate: (section: StudioSection, id?: string) => void;
  onLeave: () => void;
  onBackWorkspace: () => void;
  onOpenTasks: () => void;
}) {
  const fallback = <div className="studio-empty"><LoaderCircle className="spin" size={18} /> 正在打开模块…</div>;
  const openRemakeFromTrend = (item: TrendItem) => onNavigate('remake', item.id);

  // Keep the marketing overview at /studio/home; /studio opens the research desk.
  if (route.section === 'home') {
    return (
      <StudioLanding
        onOpen={section => onNavigate(section)}
        onLeave={onLeave}
        onBackWorkspace={onBackWorkspace}
      />
    );
  }

  if (['welcome', 'radar'].includes(route.section)) {
    return <Suspense fallback={fallback}><RadarSpaceWorkspace
      onBackWorkspace={onBackWorkspace}
      onHome={() => onNavigate('home')}
      onOpenTasks={onOpenTasks}
      initialWorkflow={route.section === 'radar' ? 'product' : 'top'}
    /></Suspense>;
  }

  return (
    <div className={`studio-shell ${route.section === 'welcome' || route.section === 'radar' ? 'studio-research-shell' : ''}`}>
      <aside className="studio-nav" aria-label="爆款工作室导航">
        <button type="button" className="studio-brand" onClick={() => onNavigate('welcome')}>
          <span className="studio-brand-mark"><Radar size={20} strokeWidth={1.5} /></span>
          <span><strong>爆款工作室</strong><small>AI Creative Lab · SIGNAL LAB</small></span>
        </button>
        <div className="studio-nav-section">发现与研究</div>
        <button type="button" className={`studio-nav-item ${route.section === 'welcome' ? 'active' : ''}`} aria-current={route.section === 'welcome' ? 'page' : undefined} onClick={() => onNavigate('welcome')}><Radar size={16} /><span>爆款雷达</span></button>
        <button type="button" className={`studio-nav-item ${route.section === 'radar' ? 'active' : ''}`} aria-current={route.section === 'radar' ? 'page' : undefined} onClick={() => onNavigate('radar')}><ScanSearch size={16} /><span>爆款探索</span></button>
        <div className="studio-nav-section">内容创作</div>
        {navItems.map(item => {
          const Icon = item.icon;
          const active = route.section === item.section;
          return (
            <button
              key={item.section}
              type="button"
              className={`studio-nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.section)}
            >
              <Icon size={16} /><span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" className="studio-nav-item" onClick={onOpenTasks}>
          <ListChecks size={16} /><span>任务进度</span>
        </button>
        <button type="button" className="studio-nav-item" onClick={() => onNavigate('home')}>
          <Home size={16} /><span>工作室介绍</span>
        </button>
        <div className="studio-nav-spacer" />
        {(route.section === 'welcome' || route.section === 'radar') && <div className="studio-nav-research"><span><Radio size={13} />发现 · 研究 · 创作</span><p>让每一次内容决策，<br />都有信号与证据可循。</p></div>}
        <div className="studio-nav-foot">
          <button type="button" className="studio-nav-item" onClick={onBackWorkspace}>
            <ArrowLeft size={16} /><span>返回内容工作台</span>
          </button>
          <button type="button" className="studio-nav-item" onClick={onLeave}>
            <Home size={16} /><span>门户首页</span>
          </button>
        </div>
      </aside>
      <div className="studio-main">
        <header className="studio-topbar">
          <div className="studio-crumbs">
            <span>爆款工作室</span>
            <span>/</span>
            <strong>{sectionLabels[route.section]}{route.id ? ` · ${route.id.slice(0, 8)}` : ''}</strong>
          </div>
          <span className="studio-badge">{route.section === 'welcome' || route.section === 'radar' ? '热点研究工作台' : 'AI Creative Lab Studio'}</span>
        </header>
        <div className="studio-content">
          <Suspense fallback={fallback}>
            {route.section === 'creatives' && <StudioCreatives onOpenProject={id => onNavigate('project', id)} />}
            {(route.section === 'radar' || route.section === 'welcome') && <StudioRadar onRemake={openRemakeFromTrend} initialWorkflow={route.section === 'radar' ? 'product' : 'top'} />}
            {route.section === 'tvc' && <StudioTvc onOpenProject={id => onNavigate('project', id)} />}
            {route.section === 'remake' && (
              <StudioRemake
                trendId={route.id}
                onOpenProject={id => onNavigate('project', id)}
                onOpenRadar={() => onNavigate('radar')}
              />
            )}
            {route.section === 'project' && route.id && (
              <ProjectDetail
                id={route.id}
                onRemake={() => onNavigate('remake')}
                onCreatives={() => onNavigate('creatives')}
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
