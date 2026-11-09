import { useState } from 'react';
import { Copy, Download, Image as ImageIcon, LoaderCircle } from 'lucide-react';
import type { AgentImage } from '../../shared/domain';
import type { AgentArtifact } from './AgentArtifacts';
import type { VideoReferenceMedia } from './video-artifact';

export function GenerationArtifactDetails({ fields, prompt, references, optimizedPrompt, onOpen }: {
  fields: { label: string; value: string | number }[]; prompt: string; references: VideoReferenceMedia[];
  optimizedPrompt?: string; onOpen?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setNotice(''); }
    catch { setNotice('复制未成功，可以直接选中下方提示词复制。'); }
  };
  return <>
    <dl className="iua-video-fields">{fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
    <section className="iua-video-prompt"><header><h3>完整提示词</h3><button type="button" onClick={() => void copyPrompt()}><Copy size={14} />{copied ? '已复制' : '复制'}</button></header><p>{prompt}</p>{notice && <p className="iua-video-detail-note" role="status">{notice}</p>}</section>
    {optimizedPrompt && <section className="iua-video-prompt"><h3>优化后提示词</h3><p>{optimizedPrompt}</p></section>}
    <section className="iua-video-references"><h3>参考素材 <span>({references.length})</span></h3>{references.length ? <ol>{references.map((reference, index) => <li key={`${reference.id}:${index}`}><button type="button" disabled={!reference.artifactId || !onOpen} onClick={() => { if (reference.artifactId) onOpen?.(reference.artifactId); }}>
      {reference.url ? <img src={reference.url} alt={reference.title} loading="lazy" /> : <ImageIcon size={24} />}
      <span><strong>{reference.role === 'first_frame' ? '首帧' : reference.role === 'last_frame' ? '尾帧' : '参考图'} · {index + 1}</strong><span>{reference.title}</span><small>{reference.filename || reference.id}</small>{!reference.url && <small>本地参考文件暂不可用</small>}</span>
    </button></li>)}</ol> : <p>本次没有记录参考素材。</p>}</section>
  </>;
}

export function GenerationPending({ message }: { message: string }) {
  return <div className="iua-generation-pending" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true" /><p>{message}</p></div>;
}

export function ImageArtifactDetails({ artifact, onOpen }: { artifact: AgentArtifact & { imageGeneration: AgentImage }; onOpen?: (id: string) => void }) {
  const image = artifact.imageGeneration;
  const [failed, setFailed] = useState(false);
  const created = Number.isFinite(Date.parse(image.createdAt)) ? new Date(image.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '未记录';
  const fields = [
    { label: '模型', value: image.model || '未记录' },
    { label: '创建时间', value: created },
    { label: '输出数量', value: '1' },
    { label: '图片尺寸', value: image.size === 'auto' ? '自动' : image.size || '未记录' },
    { label: '画幅比例', value: image.aspectRatio || (image.size === 'auto' ? '自动' : '未记录') },
    { label: '生成质量', value: image.quality === 'auto' ? '自动' : image.quality || '未记录' },
  ];
  return <article className="iua-artifact-preview iua-video-details" aria-label="图片制作详情">
    <header><div><ImageIcon size={18} aria-hidden="true" /><h2>图片制作详情</h2><span className={`iua-video-status is-${image.status}`}>{image.status === 'completed' ? '已完成' : image.status === 'running' ? '生成中' : '生成失败'}</span></div>{image.model && <span className="iua-video-provider">{image.model}</span>}</header>
    <div className="iua-video-detail-content">
      {image.url ? failed ? <div className="iua-artifacts-empty" role="alert"><p>素材暂时无法加载</p><button type="button" onClick={() => setFailed(false)}>重试</button></div> : <img className="iua-generated-image" src={image.url} alt={image.prompt} onError={() => setFailed(true)} />
        : image.status === 'running' ? <GenerationPending message="图片正在生成，完成后会显示在这里。" /> : <p className="iua-video-detail-note" role="status">{image.error || '尚无可预览图片。'}</p>}
      <GenerationArtifactDetails fields={fields} prompt={image.prompt} references={artifact.references || []} onOpen={onOpen} />
      {(image.width && image.height || image.filename) && <dl className="iua-video-file-info">{image.width && image.height && <div><dt>实际尺寸</dt><dd>{image.width} × {image.height}</dd></div>}{image.filename && <div><dt>图片文件</dt><dd>{image.filename}</dd></div>}</dl>}
      {image.url && <footer className="iua-video-detail-actions"><a href={image.url} download={image.filename || 'image.png'}><Download size={15} />下载图片</a></footer>}
      {image.warning && <p className="iua-video-detail-note" role="status">{image.warning}</p>}
    </div>
  </article>;
}
