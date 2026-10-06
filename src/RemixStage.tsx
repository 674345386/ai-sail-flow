import { useEffect, useState } from 'react';
import { ArrowRight, Copy, Download, ImagePlus, LoaderCircle, Play, Save, Settings2, Sparkles } from 'lucide-react';
import type { Project } from '../shared/domain';
import { defaultRemixSettings, REMIX_MODEL, remixCharacterCurrent, remixPlanCurrent, remixVideoBasis, type RemixAction, type RemixSettings } from '../shared/remix';
import './remix-stage.css';

export default function RemixStage({ project, disabled, onAction, onSave, onCopy, onSettings }: {
  project: Project; disabled: boolean;
  onAction: (action: RemixAction, settings: RemixSettings, prompt?: string, videoId?: string) => void;
  onSave: (settings: RemixSettings, prompt?: string) => void;
  onCopy: (text: string) => void; onSettings: () => void;
}) {
  const [settings, setSettings] = useState(project.remix?.settings || defaultRemixSettings);
  const [prompt, setPrompt] = useState(project.remix?.plan?.prompt || '');
  useEffect(() => {
    setSettings(project.remix?.settings || defaultRemixSettings);
    setPrompt(project.remix?.plan?.prompt || '');
  }, [project.id, project.remix?.settings, project.remix?.plan]);
  const patch = (change: Partial<RemixSettings>) => setSettings(previous => ({ ...previous, ...change }));
  const changed = JSON.stringify(settings) !== JSON.stringify(project.remix?.settings || defaultRemixSettings);
  const proposed = { ...project, remix: { ...(project.remix || { settings, videos: [] }), settings } };
  const characterReady = remixCharacterCurrent(proposed);
  const planReady = remixPlanCurrent(proposed);
  const editablePrompt = planReady ? prompt : undefined;
  const videos = [...(project.remix?.videos || [])].reverse();
  const job = project.job?.kind.startsWith('remix-') ? project.job : undefined;
  const valid = !!project.analysis && !!settings.character.trim();
  return <div className="remix-stage">
    <section className="panel remix-brief">
      <div className="panel-heading"><div><Sparkles size={18} /><h2>二创要求</h2></div><button className="btn small" onClick={onSettings}><Settings2 size={14} />模型连接</button></div>
      <p className="remix-description">根据原片的镜头分析与证据帧，生成新人物并编排一条10秒视频。每一步的产物都可查看。</p>
      <label className="creative-field"><span>新人物描述</span><textarea className="input textarea" rows={3} maxLength={3000} disabled={disabled} value={settings.character} onChange={event => patch({ character: event.target.value })} /></label>
      <div className="remix-fields">
        <label className="creative-field"><span>希望保留的内容</span><textarea className="input textarea" rows={3} maxLength={4000} disabled={disabled} value={settings.preserve} onChange={event => patch({ preserve: event.target.value })} /></label>
        <label className="creative-field"><span>希望修改的内容</span><textarea className="input textarea" rows={3} maxLength={4000} disabled={disabled} value={settings.changes} onChange={event => patch({ changes: event.target.value })} /></label>
      </div>
      <div className="remix-settings"><label className="creative-field"><span>画幅</span><select className="input" disabled={disabled} value={settings.aspectRatio} onChange={event => patch({ aspectRatio: event.target.value as RemixSettings['aspectRatio'] })}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option></select></label><label className="creative-field"><span>分辨率</span><select className="input" disabled={disabled} value={settings.resolution} onChange={event => patch({ resolution: event.target.value as RemixSettings['resolution'] })}><option value="720p">720p</option><option value="1080p">1080p</option></select></label><span>{REMIX_MODEL} · 10秒 · 参考图模式</span><button className="btn small" disabled={disabled || !valid} onClick={() => onSave(settings, editablePrompt)}><Save size={14} />保存要求</button></div>
      {!project.analysis && <p className="error-text">请先完成第2阶段的视频拆解。</p>}
      {changed && <p className="remix-description">二创要求已修改；执行下一步时会先保存，并检查已有产物是否仍适用。</p>}
    </section>

    <section className="panel remix-character">
      <div className="panel-heading"><div><span className="remix-number">01</span><h2>生成新人物参考图</h2></div><button className="btn small primary" disabled={disabled || !valid} onClick={() => onAction('character', settings)}><ImagePlus size={15} />{project.remix?.character ? '重新生成人物' : '生成新人物'}</button></div>
      {project.remix?.character ? <div className="remix-character-result"><a href={project.remix.character.url} target="_blank" rel="noreferrer"><img src={project.remix.character.url} alt="新生成的虚构人物参考图" /></a><div><p>这张图会作为 Omni 的人物参考，约束全片中的人物身份。</p>{!characterReady && <p className="error-text">人物描述或画幅已修改，请更新人物参考图。</p>}<a className="btn small" href={project.remix.character.url} download><Download size={14} />下载人物图</a><details><summary>人物图生成提示词</summary><pre>{project.remix.character.prompt}</pre></details></div></div> : <p className="remix-description">使用人物描述生成一位全新的虚构成年人物。</p>}
    </section>

    <section className="panel remix-prompt">
      <div className="panel-heading"><div><span className="remix-number">02</span><h2>编写二创视频提示词</h2></div><button className="btn small primary" disabled={disabled || !valid || !characterReady} onClick={() => onAction('plan', settings)}><Sparkles size={15} />{project.remix?.plan ? '重新编写提示词' : '编写提示词'}</button></div>
      <p className="remix-description">读取 {project.analysis?.shots.length || 0} 个原片镜头及其首、中、尾证据帧，结合二创要求编排为10秒。下面的时间是二创安排。</p>
      {project.remix?.plan && <><textarea aria-label="二创视频生成提示词" className="input textarea remix-prompt-editor" rows={15} value={prompt} disabled={disabled || !planReady} onChange={event => setPrompt(event.target.value)} /><div className="remix-prompt-actions"><button className="btn small" disabled={disabled || !planReady || !prompt.trim()} onClick={() => onSave(settings, prompt)}><Save size={14} />保存提示词</button><button className="btn small" disabled={!prompt} onClick={() => onCopy(prompt)}><Copy size={14} />复制</button></div>{!planReady && <p className="error-text">拆解、人物或二创要求已更新，请重新编写提示词。</p>}<details><summary>提示词依据与镜头时间安排</summary><p className="remix-description">由 {project.remix.plan.model} 根据原片分析、证据帧和你的修改要求编写；提交给 Omni 的图片为新人物参考图。</p><div className="remix-table-wrap"><table><thead><tr><th>原片镜头</th><th>原片时间</th><th>二创时间</th><th>证据帧</th></tr></thead><tbody>{project.remix.plan.shots.map(shot => {
        const evidence = project.remix!.plan!.evidence.find(item => item.shotId === shot.sourceShotId);
        return <tr key={shot.sourceShotId}><td>{shot.sourceShotId}</td><td>{evidence?.sourceStart.toFixed(2)}–{evidence?.sourceEnd.toFixed(2)}秒</td><td>{shot.start.toFixed(2)}–{shot.end.toFixed(2)}秒</td><td>{evidence?.frames.map(frame => <a key={frame.at} href={frame.url} target="_blank" rel="noreferrer">{frame.at.toFixed(2)}s </a>)}</td></tr>;
      })}</tbody></table></div></details></>}
    </section>

    <section className="panel remix-video">
      <div className="panel-heading"><div><span className="remix-number">03</span><h2>生成 Omni 二创视频</h2></div><button className="btn primary" disabled={disabled || !planReady || !prompt.trim()} onClick={() => onAction('video', settings, prompt)}><Play size={15} />生成10秒视频<ArrowRight size={14} /></button></div>
      <p className="remix-description">使用已生成的新人物参考图和当前提示词。每次点击生成会提交一个新任务。</p>
      {job?.status === 'running' && <div className="remix-progress" role="status"><LoaderCircle size={17} className="spin" /><span>{job.message}</span><b>{job.progress}%</b></div>}
      {job?.status === 'failed' && <p className="error-text" role="alert">{job.message}</p>}
      {videos.map(video => <article key={video.id} className="remix-video-result">
        <div className="remix-video-heading"><strong>{video.model} · {video.resolution} · {video.aspectRatio}</strong><span>{video.status === 'completed' ? '已完成' : video.status === 'running' ? '生成中' : '未完成'}{video.basis !== remixVideoBasis(project) && ' · 历史版本'}</span></div>
        {video.status === 'completed' && video.url && <><video src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" /><a className="btn small" href={video.url} download><Download size={14} />下载视频</a></>}
        {video.requestId && <p className="remix-description">任务 ID：{video.requestId}</p>}
        {video.error && <p className="error-text">{video.error}</p>}
        {video.status === 'failed' && video.requestId && <button className="btn small" disabled={disabled} onClick={() => onAction('recover', settings, undefined, video.id)}>恢复查询 / 下载已提交任务</button>}
        <details><summary>本次视频提交的提示词</summary><pre>{video.prompt}</pre></details>
      </article>)}
    </section>
  </div>;
}
