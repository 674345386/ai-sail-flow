import { useEffect, useRef, useState } from 'react';
import { Download, Expand, Film, LoaderCircle, Play, RotateCcw } from 'lucide-react';
import type { GeneratedVideo } from '../../shared/domain';
import type { AgentArtifact } from './AgentArtifacts';
import { videoGenerationFields, videoModelLabel, type VideoDetailsLoader } from './video-artifact';
import { GenerationArtifactDetails, GenerationPending } from './GenerationArtifactDetails';

export function VideoArtifactDetails({ artifact, onOpen, onLoad, onRecreate, disabled }: {
  artifact: AgentArtifact & { generation: GeneratedVideo }; onOpen?: (id: string) => void;
  onLoad?: VideoDetailsLoader; onRecreate?: (video: GeneratedVideo) => void; disabled?: boolean;
}) {
  const [loaded, setLoaded] = useState<GeneratedVideo | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [reload, setReload] = useState(0);
  const [playbackError, setPlaybackError] = useState('');
  const [paused, setPaused] = useState(true);
  const [notice, setNotice] = useState('');
  const player = useRef<HTMLVideoElement>(null);
  const original = artifact.generation;
  useEffect(() => {
    setLoaded(null); setLoading(false);
    if (!onLoad || original.provider !== 'minimax-h3' || !original.requestId || original.status === 'running' || original.minimax?.details) return;
    const controller = new AbortController();
    setLoading(true); setDetailError('');
    void onLoad(original.id, controller.signal).then(video => { if (!controller.signal.aborted) setLoaded(video); })
      .catch(failure => { if (!controller.signal.aborted) setDetailError(failure instanceof Error ? failure.message : '部分服务端详情暂时无法读取。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [original.id, original.status, original.requestId, onLoad, reload]);
  const video = loaded || original;
  const prompt = video.minimax?.request?.prompt || video.providerRequest?.prompt || video.prompt;
  return <article className="iua-artifact-preview iua-video-details" aria-label="视频制作详情">
    <header><div><Film size={18} aria-hidden="true" /><h2>视频制作详情</h2><span className={`iua-video-status is-${video.status}`}>{video.status === 'completed' ? '已完成' : video.status === 'running' ? '生成中' : '生成失败'}</span></div><span className="iua-video-provider">{videoModelLabel(video.model)}</span></header>
    <div className="iua-video-detail-content">
      <div className={`iua-video-player${video.status === 'running' && !video.url ? ' is-pending' : ''}`}>{video.url && !playbackError ? <>
        <video ref={player} src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" aria-label="创作产物视频" onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onEnded={() => setPaused(true)} onError={() => setPlaybackError('视频暂时无法加载，请重试或下载原文件。')} />
        {paused && <button type="button" className="iua-video-play" aria-label="播放视频" onClick={() => { void player.current?.play().catch(() => setPlaybackError('播放未成功，请重试。')); }}><Play size={26} fill="currentColor" /></button>}
        <button type="button" className="iua-video-expand" aria-label="全屏查看视频" onClick={() => { if (player.current?.requestFullscreen) void player.current.requestFullscreen().catch(() => setNotice('请尝试播放器自带的全屏按钮。')); }}><Expand size={17} /></button>
      </> : video.status === 'running' && !video.url ? <GenerationPending message="视频正在制作，完成后会在这里显示。" /> : <div className="iua-artifacts-empty"><Film size={30} /><p role="status">{playbackError || video.error || '尚无可播放视频。'}</p>{playbackError && <button type="button" onClick={() => { setPlaybackError(''); setPaused(true); }}>重试</button>}</div>}</div>
      {loading && <p className="iua-video-detail-note" role="status"><LoaderCircle size={14} className="spin" />正在补全服务端任务详情…</p>}
      {detailError && <p className="iua-video-detail-note" role="status">{detailError}<button type="button" onClick={() => setReload(value => value + 1)}>重试读取</button></p>}
      {notice && <p className="iua-video-detail-note" role="status">{notice}</p>}
      <GenerationArtifactDetails fields={videoGenerationFields(video)} prompt={prompt} references={artifact.references || []} optimizedPrompt={video.minimax?.optimizedPrompt} onOpen={onOpen} />
      <dl className="iua-video-file-info">{video.requestId && <div><dt>任务 ID</dt><dd>{video.requestId}</dd></div>}{video.width && video.height && <div><dt>实际尺寸</dt><dd>{video.width} × {video.height}</dd></div>}{video.filename && <div><dt>视频文件</dt><dd>{video.filename}</dd></div>}</dl>
      <footer className="iua-video-detail-actions"><button type="button" className="iua-video-create-again" disabled={disabled || !onRecreate} title="将原提示词和参数填入输入框，发送后才会创建新任务" onClick={() => onRecreate?.(video)}><RotateCcw size={15} />再次创作</button>{video.url && <a href={video.url} download={video.filename || 'video.mp4'}><Download size={15} />下载视频</a>}</footer>
      <p className="iua-video-detail-note">再次创作会先填入原提示词与参数，发送消息后才会新建生成任务。</p>
    </div>
  </article>;
}
