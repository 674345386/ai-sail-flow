import { useEffect, useRef, useState } from 'react';
import { Film, LoaderCircle, Play, X } from 'lucide-react';
import type { Asset, Project } from '../shared/domain';
import { agentAttachmentLabel, agentMessageAttachments, sentAgentAttachmentIds, type AgentMessage } from '../shared/agent-message';
import { api } from './api';
import { mediaChanged } from './mediaLibrary';

const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
export const promptMediaAccept = [...imageTypes, ...videoTypes, '.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm'].join(',');
type PendingMedia = { id: string; name: string; kind: Asset['kind']; url: string; thumbnail?: string };

function fileKind(file: File): Asset['kind'] | null {
  if (imageTypes.includes(file.type)) return 'product';
  if (videoTypes.includes(file.type)) return 'video';
  if (file.type && file.type !== 'application/octet-stream') return null;
  return /\.(jpe?g|png|webp)$/i.test(file.name) ? 'product' : /\.(mp4|mov|webm)$/i.test(file.name) ? 'video' : null;
}

export function useAgentPromptMedia({ project, messages, disabled, onBeforeChange, onProjectUpdate, onError }: {
  project: Project; messages: AgentMessage[]; disabled: boolean; onBeforeChange: () => Promise<unknown>;
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
      await onBeforeChange();
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
    const invalid = entries.find(item => !item.kind || item.file.size > (item.kind === 'video' ? 250 : 10) * 1024 * 1024);
    if (invalid) {
      onError(!invalid.kind ? '请选择 JPG、PNG、WebP 图片或 MP4、MOV、WebM 视频。' : `${invalid.file.name} 过大，${invalid.kind === 'video' ? '视频最多 250 MB' : '图片最多 10 MB'}。`);
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
  if (!assets.length && !pending.length) return null;
  return <ul className="iua-prompt-media" aria-label="消息附件">
    {[...assets, ...pending].map((item, index) => {
      const uploading = pending.some(entry => entry.id === item.id);
      const kind = item.kind === 'video' ? 'video' : 'image';
      const label = agentAttachmentLabel(index, kind);
      return <li className="iua-prompt-media-item" key={item.id} title={`${label}：${item.name}`} aria-label={`${label}：${item.name}`}>
        {item.kind === 'product' ? <img src={item.url} alt={item.name} />
          : <><Film className="iua-prompt-video-fallback" size={22} aria-hidden="true" />{item.thumbnail
            ? <img src={item.thumbnail} alt={item.name} />
            : <video src={item.url} preload="metadata" muted playsInline aria-label={item.name} />}
            <span className="iua-prompt-video-badge" aria-label="视频"><Play size={11} fill="currentColor" /></span></>}
        <span className="iua-prompt-media-number" aria-hidden="true">{index + 1} · {kind === 'video' ? '视频' : '图片'}</span>
        {uploading ? <span className="iua-prompt-media-loading" role="status" aria-label={`正在上传 ${item.name}`}><LoaderCircle size={18} className="spin" /></span>
          : <button type="button" className="iua-prompt-media-remove" disabled={disabled} title={`移除 ${item.name}`} aria-label={`移除附件 ${item.name}`} onClick={() => onRemove(item.id)}><X size={13} /></button>}
      </li>;
    })}
  </ul>;
}

export function AgentMessageAttachments({ message }: { message: AgentMessage }) {
  return agentMessageAttachments(message).map((attachment, index) => <figure className={`iua-message-attachment is-${attachment.kind}`} key={attachment.id}>
    {attachment.kind === 'image' ? <img className="iua-reference" src={attachment.url} alt={attachment.name} />
      : <video className="iua-reference iua-reference-video" src={attachment.url} poster={attachment.thumbnail} controls playsInline preload="metadata" aria-label={attachment.name} />}
    <figcaption>{agentAttachmentLabel(index, attachment.kind)}</figcaption>
  </figure>);
}
