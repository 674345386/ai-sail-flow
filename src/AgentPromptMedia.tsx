import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Film, LoaderCircle, Play, X } from 'lucide-react';
import type { Asset, Project } from '../shared/domain';
import { agentAttachmentLabel, agentMessageAttachments, sentAgentAttachmentIds, type AgentMessage } from '../shared/agent-message';
import { api } from './api';
import { mediaChanged } from './mediaLibrary';
import { promptMediaKind, validatePromptMedia } from '../shared/prompt-media';
export { promptMediaAccept } from '../shared/prompt-media';

type PendingMedia = { id: string; name: string; kind: Asset['kind']; url: string; thumbnail?: string };

function fileKind(file: File): Asset['kind'] | null {
  const kind = promptMediaKind(file);
  return kind === 'image' ? 'product' : kind;
}

export function useAgentPromptMedia({ project, messages, disabled, onProjectUpdate, onError }: {
  project: Project; messages: AgentMessage[]; disabled: boolean;
  onProjectUpdate: (project: Project) => void; onError: (message: string) => void;
}) {
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const historySentIds = sentAgentAttachmentIds(messages);
  const attachments = project.assets.filter(asset => !sentIds.has(asset.id) && !historySentIds.has(asset.id));
  const markSent = (ids: string[]) => setSentIds(previous => new Set([...previous, ...ids]));
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const previewUrls = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      previewUrls.current.forEach(url => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    };
  }, []);

  const change = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (disabled || busy.current) return;
    busy.current = true; setWorking(true); onError('');
    const controller = new AbortController(); request.current = controller;
    try {
      if (!controller.signal.aborted) await operation(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) onError(failure instanceof Error ? failure.message : '素材处理失败，请重试。');
    } finally {
      busy.current = false;
      if (mounted.current) { setWorking(false); setPending([]); }
      previewUrls.current.forEach(url => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    }
  };
  const upload = (files: File[]) => {
    if (!files.length || disabled || busy.current) return;
    const entries = files.map(file => ({ file, kind: fileKind(file) }));
    const invalid = validatePromptMedia(files, attachments.map(item => item.kind === 'product' ? 'image' : item.kind));
    if (invalid) {
      onError({ formats: '请选择 JPG、PNG、WebP 图片，MP4、MOV、WebM 视频，或 MP3、M4A、WAV、AAC、FLAC、OGG、Opus 音频。', tooLarge: '图片最多 10 MB，视频最多 250 MB，音频最多 50 MB。', tooMany: '每条消息最多附加 3 张图片、1 条视频和 1 个音频文件。' }[invalid]);
      return;
    }
    if (attachments.filter(asset => asset.kind === 'product').length + entries.filter(item => item.kind === 'product').length > 3) {
      onError('最多附加 3 张参考图片，请先移除多余图片。'); return;
    }
    if (attachments.filter(asset => asset.kind === 'video').length + entries.filter(item => item.kind === 'video').length > 1) {
      onError('每条消息最多附加 1 条参考视频，请先移除多余视频。'); return;
    }
    const previews = entries.map(({ file, kind }) => {
      const url = URL.createObjectURL(file); previewUrls.current.add(url);
      return { id: crypto.randomUUID(), name: file.name, kind: kind!, url };
    });
    setPending(previews);
    void change(async signal => {
      for (const [index, { file, kind }] of entries.entries()) {
        if (signal.aborted) return;
        const body = new FormData(); body.append('file', file);
        const updated = await api<Project>(`/api/projects/${project.id}/assets/${kind}`, { method: 'POST', body, signal });
        if (signal.aborted) return;
        onProjectUpdate(updated); mediaChanged();
        setPending(current => current.filter(item => item.id !== previews[index].id));
      }
    });
  };
  const remove = (id: string) => void change(async signal => {
    const updated = await api<Project>(`/api/projects/${project.id}/assets/${id}`, { method: 'DELETE', signal });
    if (!signal.aborted) onProjectUpdate(updated);
  });
  return { working, busy, pending, attachments, markSent, upload, remove };
}

export function AgentPromptMedia({ assets, pending, disabled, onRemove }: {
  assets: Asset[]; pending: PendingMedia[]; disabled: boolean; onRemove: (id: string) => void;
}) {
  const [preview, setPreview] = useState<{ id: string; position: CSSProperties; imageStyle: CSSProperties } | null>(null);
  const items = [...assets, ...pending];
  const activePreview = preview && items.some(item => item.id === preview.id) ? preview : null;

  useEffect(() => {
    if (!activePreview) return;
    const close = () => setPreview(null);
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [activePreview]);

  const showPreview = (id: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const above = rect.top - margin - gap;
    const below = window.innerHeight - rect.bottom - margin - gap;
    const openAbove = above >= 260 || above >= below;
    const maxWidth = Math.min(320, document.documentElement.clientWidth - margin * 2);
    const maxHeight = Math.min(260, openAbove ? above : below);
    if (maxHeight <= 0 || maxWidth <= 0) return;
    const theme = getComputedStyle(anchor);
    setPreview({
      id,
      position: {
        left: Math.max(margin, Math.min(rect.left, document.documentElement.clientWidth - maxWidth - margin)),
        ...(openAbove ? { bottom: window.innerHeight - rect.top, paddingBottom: gap } : { top: rect.bottom, paddingTop: gap }),
      },
      imageStyle: {
        maxWidth, maxHeight,
        backgroundColor: theme.getPropertyValue('--iua-bg'),
        borderRadius: theme.getPropertyValue('--iui-radius-md'),
        boxShadow: theme.getPropertyValue('--iui-shadow'),
      },
    });
  };
  const hidePreview = (id: string) => setPreview(current => current?.id === id ? null : current);

  if (!items.length) return null;
  return <ul className="iua-prompt-media" aria-label="消息附件">
    {items.map((item, index) => {
      const uploading = pending.some(entry => entry.id === item.id);
      const kind = item.kind === 'product' ? 'image' : item.kind;
      const label = agentAttachmentLabel(index, kind);
      const isImage = kind === 'image';
      return <li className="iua-prompt-media-item" key={item.id} title={isImage ? undefined : `${label}：${item.name}`} aria-label={`${label}：${item.name}`}
        onPointerEnter={isImage ? event => { if (event.pointerType !== 'touch') showPreview(item.id, event.currentTarget); } : undefined}
        onPointerLeave={isImage ? () => hidePreview(item.id) : undefined}>
        {isImage ? <img src={item.url} alt={item.name} tabIndex={0}
          onFocus={event => { if (event.currentTarget.matches(':focus-visible')) showPreview(item.id, event.currentTarget); }}
          onBlur={() => hidePreview(item.id)} /> : item.kind === 'audio' ? <AudioLines className="iua-prompt-video-fallback" size={24} aria-hidden="true" />
          : <><Film className="iua-prompt-video-fallback" size={22} aria-hidden="true" />{item.thumbnail
            ? <img src={item.thumbnail} alt={item.name} />
            : <video src={item.url} preload="metadata" muted playsInline aria-label={item.name} />}
            <span className="iua-prompt-video-badge" aria-label="视频"><Play size={11} fill="currentColor" /></span></>}
        <span className="iua-prompt-media-number" aria-hidden="true">{index + 1} · {kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '图片'}</span>
        {uploading ? <span className="iua-prompt-media-loading" role="status" aria-label={`正在上传 ${item.name}`}><LoaderCircle size={18} className="spin" /></span>
          : <button type="button" className="iua-prompt-media-remove" disabled={disabled} title={`移除 ${item.name}`} aria-label={`移除附件 ${item.name}`} onClick={() => onRemove(item.id)}><X size={13} /></button>}
        {activePreview?.id === item.id && createPortal(<div className="iua-prompt-image-preview" style={activePreview.position} aria-hidden="true">
          <img src={item.url} alt="" draggable={false} style={activePreview.imageStyle} onError={() => hidePreview(item.id)} />
        </div>, document.body)}
      </li>;
    })}
  </ul>;
}

export function AgentMessageAttachments({ message }: { message: AgentMessage }) {
  return agentMessageAttachments(message).map((attachment, index) => <figure className={`iua-message-attachment is-${attachment.kind}`} key={attachment.id}>
    {attachment.kind === 'image' ? <img className="iua-reference" src={attachment.url} alt={attachment.name} />
      : attachment.kind === 'audio' ? <audio src={attachment.url} controls preload="metadata" aria-label={attachment.name} style={{ maxWidth: '100%' }} />
      : <video className="iua-reference iua-reference-video" src={attachment.url} poster={attachment.thumbnail} controls playsInline preload="metadata" aria-label={attachment.name} />}
    <figcaption>{agentAttachmentLabel(index, attachment.kind)}</figcaption>
  </figure>);
}
