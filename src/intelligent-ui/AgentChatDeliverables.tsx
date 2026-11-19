import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, Film, Image as ImageIcon, LayoutDashboard, Maximize2, Play, Sparkles, X } from 'lucide-react';
import type { AgentDeliverable, MessageDeliverableGroup } from '../agentMediaTimeline';
import type { AgentAnswerPanel } from '../../shared/agent-answer';

function DeliverableStatus({ item }: { item: AgentDeliverable }) {
  return <div className="iua-deliv-status" role="status">
    {item.status === 'running' ? '媒体正在生成，正在查询原任务…'
      : item.recoverable ? '本地查询已中断，上游状态待核对；可在右侧详情继续查询原任务。'
        : '媒体生成失败，请核对任务状态。'}
  </div>;
}

function DeliverableMedia({ item, onExpand }: { item: AgentDeliverable; onExpand?: () => void }) {
  if (!item.url) return <DeliverableStatus item={item} />;
  if (item.kind === 'image') {
    return <button type="button" className="iua-deliv-image-trigger" onClick={onExpand} title="点击放大查看">
      <img src={item.url} alt={item.title} loading="lazy" />
    </button>;
  }
  if (item.kind === 'video') {
    return <video key={item.id} src={item.url} poster={item.thumbnail} controls playsInline preload="metadata" aria-label={item.title} />;
  }
  return <div className="iua-deliv-text-card">
    <FileText size={20} aria-hidden="true" />
    <span>{item.title}</span>
  </div>;
}

function StripThumb({ item, index, active, onSelect, onOpenRight }: {
  item: AgentDeliverable; index: number; active: boolean; onSelect: () => void; onOpenRight: () => void;
}) {
  const isPrimary = item.role === 'primary';
  const label = isPrimary ? item.badge : `${String(index).padStart(2, '0')} · ${item.title}`;
  return <div className={`iua-deliv-thumb${active ? ' is-active' : ''}${isPrimary ? ' is-primary' : ''}`}>
    <button type="button" className="iua-deliv-thumb-select" aria-pressed={active} onClick={onSelect} title={item.title}>
      <span className="iua-deliv-thumb-cover">
        {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" />
          : item.kind === 'video' ? <Film size={16} aria-hidden="true" />
            : item.kind === 'image' ? <ImageIcon size={16} aria-hidden="true" />
              : <FileText size={16} aria-hidden="true" />}
        {item.kind === 'video' && <span className="iua-deliv-play-dot" aria-hidden="true"><Play size={10} fill="currentColor" /></span>}
        <span className="iua-deliv-thumb-role">{isPrimary ? '主' : String(index).padStart(2, '0')}</span>
      </span>
      <span className="iua-deliv-thumb-meta">
        <strong>{label}</strong>
        {item.meta && <small>{item.meta}</small>}
      </span>
    </button>
    <button type="button" className="iua-deliv-thumb-jump" aria-label={`在右侧查看 ${item.title}`} title="在右侧查看详情" onClick={onOpenRight}>
      <ExternalLink size={12} aria-hidden="true" />
    </button>
  </div>;
}

export function AgentChatDeliverables({
  group,
  panels = [],
  onOpenArtifact,
  onOpenUI,
}: {
  group: MessageDeliverableGroup;
  panels?: AgentAnswerPanel[];
  onOpenArtifact: (artifactId: string) => void;
  onOpenUI?: (index: number) => void;
}) {
  const stagePool = [...group.primary, ...group.milestones];
  const fallbackItem = stagePool[0] || group.supporting[0];
  const [activeId, setActiveId] = useState<string>(fallbackItem?.id || '');
  const [lightboxItem, setLightboxItem] = useState<AgentDeliverable | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!stagePool.some(item => item.id === activeId) && fallbackItem) {
      setActiveId(fallbackItem.id);
    }
  }, [activeId, fallbackItem?.id, stagePool.length]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!lightboxItem || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.querySelector('video')?.pause();
      if (dialog.open) dialog.close();
    };
  }, [lightboxItem]);

  if (!group.items.length) return null;
  const active = stagePool.find(item => item.id === activeId) || fallbackItem;
  const showParallel = group.layout === 'parallel' && group.primary.length > 1;
  const showStrip = !showParallel && stagePool.length > 1;

  return <section className={`iua-deliverables iua-deliverables-${group.layout}`} aria-label="本轮创作产物">
    {!showParallel && active && <header className="iua-deliv-header">
      <div className="iua-deliv-title">
        <span className={`iua-deliv-badge is-${active.role}`}>
          {active.role === 'primary' && <Sparkles size={11} aria-hidden="true" />}
          {active.badge}
        </span>
        <strong title={active.title}>{active.title}</strong>
        {active.meta && <small>{active.meta}</small>}
      </div>
      <div className="iua-deliv-actions">
        {active.url && active.kind !== 'text' && (
          <button type="button" onClick={() => setLightboxItem(active)} title="全屏大播放 / 放大查看">
            <Maximize2 size={13} aria-hidden="true" />
            <span>大播放</span>
          </button>
        )}
        <button type="button" onClick={() => onOpenArtifact(active.artifactId)} title="在右侧打开详情">
          <ExternalLink size={13} aria-hidden="true" />
          <span>右侧详情</span>
        </button>
        {panels.length > 0 && onOpenUI && (
          <button type="button" className="is-accent" onClick={() => onOpenUI(0)} title="在右侧打开完整汇总界面">
            <LayoutDashboard size={13} aria-hidden="true" />
            <span>{panels[0].format === 'html' ? '汇总页' : '完整视图'}</span>
          </button>
        )}
      </div>
    </header>}

    {showParallel ? (
      <>
        <header className="iua-deliv-header">
          <div className="iua-deliv-title">
            <span className="iua-deliv-badge is-primary"><Sparkles size={11} aria-hidden="true" />平行方案对比</span>
            <strong>共 {group.primary.length} 条独立产物</strong>
          </div>
          {panels.length > 0 && onOpenUI && (
            <div className="iua-deliv-actions">
              <button type="button" className="is-accent" onClick={() => onOpenUI(0)}>
                <LayoutDashboard size={13} aria-hidden="true" />
                <span>完整视图</span>
              </button>
            </div>
          )}
        </header>
        <div className="iua-deliv-parallel">
          {group.primary.map(item => (
            <figure className="iua-deliv-parallel-card" key={item.id}>
              <div className="iua-deliv-stage">
                <DeliverableMedia item={item} onExpand={item.url ? () => setLightboxItem(item) : undefined} />
              </div>
              <figcaption>
                <div>
                  <span className="iua-deliv-badge is-primary">{item.badge}</span>
                  <strong title={item.title}>{item.title}</strong>
                  {item.meta && <small>{item.meta}</small>}
                </div>
                <div className="iua-deliv-actions">
                  {item.url && item.kind !== 'text' && <button type="button" aria-label="全屏大播放" onClick={() => setLightboxItem(item)}><Maximize2 size={12} /></button>}
                  <button type="button" onClick={() => onOpenArtifact(item.artifactId)}>详情</button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </>
    ) : active && (
      <div className="iua-deliv-stage">
        <DeliverableMedia item={active} onExpand={active.url ? () => setLightboxItem(active) : undefined} />
      </div>
    )}

    {showStrip && (
      <div className="iua-deliv-strip-wrap">
        <div className="iua-deliv-strip-label">
          <span>{group.primary.length ? `主产物 + ${group.milestones.length} 个阶段产物` : `${stagePool.length} 个产物`}</span>
          <small>点击就地切播 · 右角跳右侧详情</small>
        </div>
        <div className="iua-deliv-strip" role="group" aria-label="产物切换轨">
          {stagePool.map((item, idx) => (
            <StripThumb
              key={item.id}
              item={item}
              index={idx}
              active={item.id === active?.id}
              onSelect={() => setActiveId(item.id)}
              onOpenRight={() => onOpenArtifact(item.artifactId)}
            />
          ))}
        </div>
      </div>
    )}

    {group.supporting.length > 0 && (
      <div className="iua-deliv-supporting" aria-label="副产物与过程素材">
        <span className="iua-deliv-supporting-label">过程素材 ({group.supporting.length})</span>
        <div className="iua-deliv-chips">
          {group.supporting.map(item => (
            <button
              type="button"
              key={item.id}
              className="iua-deliv-chip"
              title={item.title}
              onClick={() => item.url && item.kind !== 'text' ? setLightboxItem(item) : onOpenArtifact(item.artifactId)}
            >
              {item.kind === 'image' ? <ImageIcon size={12} aria-hidden="true" /> : item.kind === 'video' ? <Film size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />}
              <span>{item.title}</span>
              {item.meta && <small>{item.meta}</small>}
            </button>
          ))}
        </div>
      </div>
    )}

    {lightboxItem?.url && (
      <dialog
        ref={dialogRef}
        className="iua-deliv-lightbox"
        onCancel={event => { event.preventDefault(); setLightboxItem(null); }}
        onClick={event => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setLightboxItem(null);
          }
        }}
      >
        <header>
          <div>
            <span className={`iua-deliv-badge is-${lightboxItem.role}`}>{lightboxItem.badge}</span>
            <strong>{lightboxItem.title}</strong>
            {lightboxItem.meta && <small>{lightboxItem.meta}</small>}
          </div>
          <div className="iua-deliv-actions">
            <button type="button" onClick={() => { const id = lightboxItem.artifactId; setLightboxItem(null); onOpenArtifact(id); }}>
              <ExternalLink size={14} aria-hidden="true" />
              <span>右侧查看详情</span>
            </button>
            <button type="button" aria-label="关闭大屏预览" onClick={() => setLightboxItem(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="iua-deliv-lightbox-body">
          {lightboxItem.kind === 'video'
            ? <video key={lightboxItem.id} src={lightboxItem.url} poster={lightboxItem.thumbnail} controls autoPlay playsInline />
            : <img src={lightboxItem.url} alt={lightboxItem.title} />}
        </div>
      </dialog>
    )}
  </section>;
}
