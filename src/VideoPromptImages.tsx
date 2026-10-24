import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, FolderOpen, Plus, Upload, X } from 'lucide-react';

export type VideoPromptImage = { url: string; label: string };

export default function VideoPromptImages({ images, limit, disabled, onChange, onUpload, onLibrary }: {
  images: VideoPromptImage[]; limit: number; disabled: boolean;
  onChange: (images: VideoPromptImage[]) => void;
  onUpload: (files: File[], replaceAt: number | null) => Promise<void>;
  onLibrary: (replaceAt: number | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const replaceAt = useRef<number | null>(null);
  useEffect(() => {
    if (disabled) return;
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const files = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (!files.length) return;
      event.preventDefault(); void onUpload(files, null);
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [disabled, onUpload]);
  const chooseFile = (index: number | null) => { replaceAt.current = index; if (input.current) { input.current.multiple = index === null; input.current.click(); } };
  const move = (index: number, direction: number) => {
    const next = [...images]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; onChange(next);
  };
  return <div className="video-prompt-images" onDragOver={event => { if (!disabled && event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => {
    event.preventDefault(); if (!disabled) void onUpload(Array.from(event.dataTransfer.files), null);
  }}>
    <div className="tier-composer-head"><strong>参考图</strong><span>{images.length} / {limit}</span></div>
    <div className="video-prompt-image-list">{images.map((image, index) => <figure key={`${image.url}:${index}`}>
      <span className="tier-chip"><span className="tier-chip-thumb"><img src={image.url} alt={image.label} /><em>{index + 1}</em><button type="button" aria-label="移除这张图" disabled={disabled} onClick={() => onChange(images.filter((_, at) => at !== index))}><X size={14} /></button></span><span className="tier-chip-preview" aria-hidden="true"><img src={image.url} alt="" /></span></span>
      <input className="input" aria-label={`参考图 ${index + 1} 的用途`} disabled={disabled} maxLength={200} value={image.label} onChange={event => onChange(images.map((item, at) => at === index ? { ...item, label: event.target.value } : item))} />
      <div className="video-prompt-image-actions"><button type="button" className="icon-btn" title="上传替换" aria-label="上传替换" disabled={disabled} onClick={() => chooseFile(index)}><Upload size={13} /></button><button type="button" className="icon-btn" title="从素材库替换" aria-label="从素材库替换" disabled={disabled} onClick={() => onLibrary(index)}><FolderOpen size={13} /></button><button type="button" className="icon-btn" title="前移" aria-label="前移" disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowLeft size={13} /></button><button type="button" className="icon-btn" title="后移" aria-label="后移" disabled={disabled || index === images.length - 1} onClick={() => move(index, 1)}><ArrowRight size={13} /></button></div>
    </figure>)}{images.length < limit && <button type="button" className="tier-chip-add" aria-label="上传图片" disabled={disabled} onClick={() => chooseFile(null)}><Plus size={20} /></button>}</div>
    <div className="video-prompt-image-foot"><button type="button" className="tier-composer-mention" disabled={disabled || images.length >= limit} onClick={() => onLibrary(null)}> @ 主体 / 素材</button><small>支持上传、拖放或粘贴图片；可编辑图片用途和顺序。</small></div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple={replaceAt.current === null} hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void onUpload(files, replaceAt.current); }} />
  </div>;
}
