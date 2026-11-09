import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleAlert, Download, ExternalLink, FileText, Film, Image as ImageIcon, LayoutDashboard, LoaderCircle, X } from 'lucide-react';
import type { AgentImage, GeneratedVideo, Project } from '../../shared/domain';
import type { AgentMessage } from '../../shared/agent-message';
import type { IntelligentPanel } from '../../shared/intelligent-ui';
import type { ExperimentGraph } from '../../shared/experiment';
import { agentPanelId, htmlPageTitle, parseAgentAnswer, type AgentAnswerPanel } from '../../shared/agent-answer';
import { intelligentUIConversationText } from './conversation';
import { VideoArtifactDetails } from './VideoArtifactDetails';
import { ImageArtifactDetails } from './GenerationArtifactDetails';
import type { VideoDetailsLoader, VideoReferenceMedia } from './video-artifact';

export type AgentArtifact = {
  id: string; kind: 'image' | 'video' | 'text' | 'ui'; title: string; createdAt: string;
  origin: 'input' | 'process' | 'output' | 'interface'; sourceId?: string; stepTitle?: string;
  sourceTitle?: string; sourceTime?: number; usedBy?: { id: string; title: string }[];
  url?: string; filename?: string; thumbnail?: string; source?: string;
  format?: AgentAnswerPanel['format']; complete?: boolean;
  status: 'running' | 'completed' | 'failed'; error?: string; warning?: string;
  width?: number; height?: number;
  generation?: GeneratedVideo; imageGeneration?: AgentImage; references?: VideoReferenceMedia[];
};

export function collectAgentArtifacts(project: Project, messages: AgentMessage[], published?: IntelligentPanel, experiment?: ExperimentGraph): AgentArtifact[] {
  const inputs = new Map<string, AgentArtifact>();
  for (const message of messages) {
    for (const image of message.images || []) inputs.set(image.id, { ...image, id: `input:${image.id}`, sourceId: image.id, kind: 'image', origin: 'input', title: image.name, createdAt: message.createdAt, status: 'completed' });
    for (const video of message.videos || []) inputs.set(video.id, { ...video, id: `input:${video.id}`, sourceId: video.id, kind: 'video', origin: 'input', title: video.name, createdAt: message.createdAt, status: 'completed' });
  }
  for (const asset of project.assets) {
    if (!inputs.has(asset.id)) inputs.set(asset.id, { ...asset, id: `input:${asset.id}`, sourceId: asset.id, kind: asset.kind === 'product' ? 'image' : 'video', origin: 'input', title: asset.name, createdAt: project.createdAt, status: 'completed' });
  }
  const artifacts: AgentArtifact[] = [
    ...inputs.values(),
    ...(experiment?.files || []).map(file => {
      const node = experiment?.nodes.find(node => node.sourceId === file.id && node.kind === 'artifact');
      const step = experiment?.nodes.find(step => step.kind === 'step' && node?.inputs.includes(step.id));
      const sourceTitle = file.sourceId ? project.assets.find(asset => asset.id === file.sourceId)?.name || experiment?.files?.find(source => source.id === file.sourceId)?.title || inputs.get(file.sourceId)?.title : undefined;
      return { ...file, id: `file:${file.id}`, sourceId: file.id, kind: file.mediaType, origin: file.purpose === 'output' ? 'output' as const : 'process' as const, createdAt: file.createdAt || messages.find(message => message.text.includes(file.url))?.createdAt || project.createdAt, stepTitle: step?.title, sourceTitle };
    }),
    ...(project.agentImages || []).map(image => ({ ...image, imageGeneration: image, id: `image:${image.id}`, sourceId: image.id, origin: 'output' as const, kind: 'image' as const, title: image.prompt || image.filename || '生成图片' })),
    ...project.generatedVideos.map(video => ({ ...video, generation: video, id: `video:${video.id}`, sourceId: video.id, origin: 'output' as const, kind: 'video' as const, title: video.prompt || video.filename || '生成视频', createdAt: video.startedAt })),
    ...(project.composedVideos || []).map(video => ({ ...video, id: `composed:${video.id}`, sourceId: video.id, origin: 'output' as const, kind: 'video' as const, title: video.filename || '合成视频', createdAt: video.startedAt, status: 'completed' as const })),
  ];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    parseAgentAnswer(message.text).panels.forEach((panel, index) => {
      const title = panel.format === 'html' ? htmlPageTitle(panel.source)
        : intelligentUIConversationText(panel.source).split('\n').find(line => line.trim())?.replace(/^\*\*|\*\*$/g, '') || '交互界面';
      artifacts.push({ id: agentPanelId(message.id, index), kind: 'ui', origin: 'interface', title, ...panel, createdAt: message.createdAt, status: panel.complete ? 'completed' : 'running' });
    });
  }
  if (published && !artifacts.some(artifact => artifact.source === published.source)) {
    artifacts.push({ id: `ui:${published.id}`, kind: 'ui', origin: 'interface', title: published.title, source: published.source, createdAt: published.createdAt, status: 'completed' });
  }
  for (const video of project.generatedVideos) for (const reference of video.referenceMedia || []) {
    if (!artifacts.some(artifact => artifact.sourceId === reference.id && artifact.kind === 'image')) artifacts.push({
      id: `reference:${reference.id}`, sourceId: reference.id, kind: 'image', origin: 'process', title: reference.name,
      filename: reference.filename, url: reference.url, createdAt: video.startedAt, status: 'completed',
    });
  }
  for (const artifact of artifacts) artifact.usedBy = [
    ...project.generatedVideos.filter(video => artifact.sourceId && video.referenceIds?.includes(artifact.sourceId) && (video.requestId || video.status === 'completed'))
      .map(video => ({ id: `video:${video.id}`, title: video.prompt.slice(0, 80) || '生成视频' })),
    ...(project.agentImages || []).filter(image => artifact.sourceId && image.referenceIds?.includes(artifact.sourceId) && image.status === 'completed')
      .map(image => ({ id: `image:${image.id}`, title: image.prompt.slice(0, 80) || '生成图片' })),
  ];
  for (const artifact of artifacts) if (artifact.generation || artifact.imageGeneration) {
    const video = artifact.generation;
    const ids = artifact.imageGeneration?.referenceIds || video?.referenceIds || (video?.storyboardGridId ? [video.storyboardGridId] : []);
    artifact.references = ids.map((id, index) => {
      const source = artifacts.find(item => item.sourceId === id && item.kind === 'image');
      const grid = project.storyboardGrids?.find(grid => grid.id === id);
      const snapshot = video?.referenceMedia?.find(reference => reference.id === id);
      return { id, artifactId: source?.id, title: snapshot?.name || source?.title || (grid ? '分镜网格' : id), filename: snapshot?.filename || source?.filename || grid?.filename, url: snapshot?.url || source?.url || grid?.url,
        role: snapshot?.role || video?.minimax?.request?.inputs[index]?.role || (video?.providerRequest?.first_last_frame ? index === 0 ? 'first_frame' : 'last_frame' : 'reference_image') };
    });
  }
  return artifacts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const originLabels = { input: '原始素材', process: '过程素材', output: '生成结果', interface: '界面' };
const kindLabels = { image: '图片', video: '视频', text: '其它', ui: '界面' };

function ArtifactThumbnail({ artifact }: { artifact: AgentArtifact }) {
  const [failed, setFailed] = useState(false);
  const src = artifact.kind === 'image' ? artifact.url : artifact.thumbnail;
  return src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <AgentArtifactIcon kind={artifact.kind} />;
}

export function AgentTaskAssets({ artifacts, active = true, onOpen, onClose }: { artifacts: AgentArtifact[]; active?: boolean; onOpen: (artifact: AgentArtifact) => void; onClose?: () => void }) {
  const [filter, setFilter] = useState('all');
  const [kind, setKind] = useState('all');
  const [lastOpenedId, setLastOpenedId] = useState<string>();
  const list = useRef<HTMLElement>(null);
  const scrollPosition = useRef(0);
  useLayoutEffect(() => {
    if (active && list.current) list.current.scrollTop = scrollPosition.current;
  }, [active]);
  const media = artifacts.filter(artifact => artifact.kind !== 'ui');
  const kinds = [{ id: 'all', label: '全部', icon: LayoutDashboard }, { id: 'video', label: '视频', icon: Film }, { id: 'image', label: '图片', icon: ImageIcon }, { id: 'other', label: '其它', icon: FileText }];
  const filters = [{ id: 'all', label: '不限' }, { id: 'process', label: '过程素材' }, { id: 'used', label: '已用于生成' }, { id: 'input', label: '原始素材' }, { id: 'output', label: '生成结果' }];
  const matchesKind = (artifact: AgentArtifact, value: string) => value === 'all' || (value === 'other' ? artifact.kind !== 'image' && artifact.kind !== 'video' : artifact.kind === value);
  const matches = (artifact: AgentArtifact, value: string) => value === 'all' || (value === 'used' ? !!artifact.usedBy?.length : artifact.origin === value);
  const kindMedia = media.filter(artifact => matchesKind(artifact, kind));
  const visible = kindMedia.filter(artifact => matches(artifact, filter));
  return <section className="iua-task-assets" aria-label="任务素材" ref={list} onScroll={event => { if (active) scrollPosition.current = event.currentTarget.scrollTop; }}>
    <header><div><h2>任务素材 <span>{media.length}</span></h2><p>过程素材仅保存在本机，不会自动加入素材库或同步云端。</p></div>{onClose && <button type="button" className="iua-icon-button" aria-label="关闭任务素材" title="关闭任务素材" onClick={onClose}><X size={18} /></button>}</header>
    <div className="iua-asset-filters iua-asset-kind-filters" role="group" aria-label="素材类型">{kinds.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setFilter('all'); }}><Icon size={15} aria-hidden="true" />{label}<span>{media.filter(artifact => matchesKind(artifact, id)).length}</span></button>)}</div>
    <div className="iua-asset-source-filters"><span>来源与用途</span><div className="iua-asset-filters" role="group" aria-label="筛选任务素材">{filters.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{kindMedia.filter(artifact => matches(artifact, item.id)).length}</span></button>)}</div></div>
    {visible.length ? <ul className="iua-asset-grid">{visible.map(artifact => <li key={artifact.id}><button type="button" aria-current={lastOpenedId === artifact.id ? 'true' : undefined} onClick={() => { setLastOpenedId(artifact.id); onOpen(artifact); }} title={artifact.title}>
      <span className="iua-asset-cover"><ArtifactThumbnail artifact={artifact} /><span className="iua-asset-kind"><AgentArtifactIcon kind={artifact.kind} />{kindLabels[artifact.kind]}</span>{artifact.status === 'running' && <LoaderCircle className="spin" size={20} />}{artifact.status === 'failed' && <CircleAlert size={20} />}</span>
      <strong>{artifact.title}</strong><span className="iua-asset-description">{originLabels[artifact.origin]}{artifact.sourceTime !== undefined ? ` · ${artifact.sourceTime} 秒` : ''}{artifact.usedBy?.length ? ' · 已用于生成' : ''}</span>
      {artifact.stepTitle && <span className="iua-asset-description">{artifact.stepTitle}</span>}
    </button></li>)}</ul> : <div className="iua-artifacts-empty"><ImageIcon size={28} /><p>{media.length ? '这里暂时没有素材' : '还没有任务素材'}</p><span>{media.length ? '可以切换上方筛选查看其他素材。' : '上传素材或开始任务后，Agent 保存的抽帧、截图和产物会显示在这里。'}</span></div>}
  </section>;
}

export function AgentArtifactIcon({ kind }: { kind: AgentArtifact['kind'] }) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : FileText;
  return <Icon size={18} aria-hidden="true" />;
}

export function AgentArtifacts({ artifacts, activeId, onOpen, onCanvas, onClose }: {
  artifacts: AgentArtifact[]; activeId: string; onOpen: (artifact: AgentArtifact) => void; onCanvas: () => void; onClose: () => void;
}) {
  return <aside className="iua-artifacts" id="iua-artifact-summary" aria-label="素材与产物">
    <header><h2>素材与产物 <span>{artifacts.length}</span></h2><button type="button" className="iua-icon-button" aria-label="收起产物" onClick={onClose}><X size={16} /></button></header>
    <button type="button" className="iua-artifact-canvas" onClick={onCanvas}><LayoutDashboard size={17} aria-hidden="true" /><span>视频画布</span></button>
    {artifacts.length ? <ul className="iua-artifact-list">{artifacts.map(artifact => <li key={artifact.id}>
      <button type="button" className="iua-artifact-item" aria-current={activeId === artifact.id ? 'true' : undefined} onClick={() => onOpen(artifact)} title={artifact.title}>
        <span className="iua-artifact-thumbnail"><ArtifactThumbnail artifact={artifact} /></span>
        <span className="iua-artifact-description"><strong>{artifact.title}</strong><span>{originLabels[artifact.origin]}{artifact.status === 'running' ? ' · 生成中' : artifact.status === 'failed' ? ' · 生成失败' : ''}</span></span>
        {artifact.status === 'running' ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : artifact.status === 'failed' ? <CircleAlert size={14} aria-hidden="true" /> : null}
      </button>
    </li>)}</ul> : <div className="iua-artifacts-empty"><ImageIcon size={25} aria-hidden="true" /><p>还没有素材与产物</p><span>上传的素材、过程图片和生成结果会收纳在这里。</span></div>}
  </aside>;
}

function ArtifactText({ url }: { url: string }) {
  const [result, setResult] = useState<{ url: string; text?: string; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal, credentials: 'same-origin' }).then(async response => {
      if (!response.ok) throw new Error('文件暂时无法读取，请尝试下载原文件。');
      const text = await response.text();
      if (!controller.signal.aborted) setResult({ url, text });
    }).catch(failure => { if (!controller.signal.aborted) setResult({ url, error: failure.message }); });
    return () => controller.abort();
  }, [url]);
  return result?.url === url ? result.error ? <p role="alert">{result.error}</p> : <pre className="iua-artifact-text">{result.text}</pre> : <p role="status">正在读取文件…</p>;
}

export function AgentArtifactPreview({ artifact, onOpen, onLoadVideo, onRecreate, disabled }: { artifact: AgentArtifact; onOpen?: (artifactId: string) => void; onLoadVideo?: VideoDetailsLoader; onRecreate?: (video: GeneratedVideo) => void; disabled?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (artifact.generation) return <VideoArtifactDetails artifact={{ ...artifact, generation: artifact.generation }} onOpen={onOpen} onLoad={onLoadVideo} onRecreate={onRecreate} disabled={disabled} />;
  if (artifact.imageGeneration) return <ImageArtifactDetails artifact={{ ...artifact, imageGeneration: artifact.imageGeneration }} onOpen={onOpen} />;
  return <article className="iua-artifact-preview" aria-label={artifact.title}>
    <header><div><AgentArtifactIcon kind={artifact.kind} /><h2>{artifact.title}</h2></div>{artifact.url && <a href={artifact.url} download={artifact.filename || 'artifact'}><Download size={15} aria-hidden="true" />下载</a>}</header>
    <p className="iua-artifact-meta">{originLabels[artifact.origin]}{artifact.stepTitle ? ` · ${artifact.stepTitle}` : ''}{artifact.sourceTitle ? ` · 来源：${artifact.sourceTitle}` : ''}{artifact.sourceTime !== undefined ? ` · ${artifact.sourceTime} 秒` : ''}</p>
    <div className="iua-artifact-stage">{artifact.url ? failed ? <div className="iua-artifacts-empty" role="alert"><ImageIcon size={28} /><p>素材暂时无法加载</p><button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试</button><a href={artifact.url} target="_blank" rel="noreferrer"><ExternalLink size={14} />打开原文件</a></div>
      : artifact.kind === 'image' ? <img key={attempt} src={artifact.url} alt={artifact.title} onError={() => setFailed(true)} />
      : artifact.kind === 'text' ? <ArtifactText url={artifact.url} />
      : <video src={artifact.url} poster={artifact.thumbnail} controls playsInline preload="metadata" aria-label={artifact.title} onError={() => setFailed(true)} />
      : <p role="status">{artifact.error || (artifact.status === 'running' ? '正在生成，完成后会显示在这里。' : '这份产物暂时无法预览。')}</p>}</div>
    {!!artifact.usedBy?.length && <div className="iua-artifact-usage"><span>已用于生成</span>{artifact.usedBy.map(video => <button key={video.id} type="button" onClick={() => onOpen?.(video.id)}>{video.title}</button>)}</div>}
    {artifact.width && artifact.height && <p className="iua-artifact-meta">{artifact.width} × {artifact.height}</p>}
    {artifact.warning && <p className="iua-artifact-meta" role="status">{artifact.warning}</p>}
  </article>;
}
