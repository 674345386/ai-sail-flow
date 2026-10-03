import { useRef, useState } from 'react';
import { ArrowRight, Check, Clapperboard, Download, Eye, FileJson, Film, Globe2, ImagePlus, LoaderCircle, Pause, Play, Settings2, Sparkles, Subtitles, Upload } from 'lucide-react';
import { countries, defaultReplication, languages, platforms, type Market, type Product, type Project, type TtsTimingNotice, type WorkflowMode } from '../shared/domain';
import { workflowBusy, workflowRequirements, keyframeWorkflowStages } from '../shared/workflow';
import './workflow.css';
import { useImagePaste } from './useImagePaste';
import ShaderBackdrop from './ShaderBackdrop';
import { keyframeCurrent, keyframesReady } from '../shared/storyboard';

type Voices = { name: string; language: string }[];
type Patch = Partial<Pick<Project, 'title' | 'product' | 'market' | 'replication' | 'productionMode' | 'promptFlow' | 'ttsVoice' | 'automaticSettings'>>;

export function SpeechTimingConfirmation({ notice, disabled, onConfirm, onManual }: {
  notice: TtsTimingNotice; disabled: boolean; onConfirm: () => void; onManual: () => void;
}) {
  return <section className="speech-timing-confirmation" role="status" aria-live="polite"><div><Subtitles size={22} /><div><h2>台词已完整保留，需要更长一点的视频</h2><p>当前视频 {notice.targetDuration.toFixed(1)} 秒，完整口播需要约 {notice.requiredDuration.toFixed(1)} 秒。允许延长后，末尾画面会停留到配音结束；字幕与声音同步。</p><small>复用现有视频，不改台词、不重新提交 Veo。</small></div></div><div className="speech-timing-actions"><button className="btn primary" disabled={disabled} onClick={onConfirm}><Clapperboard size={16} />允许延长并完成视频</button><button className="text-button" disabled={disabled} onClick={onManual}>保持原时长，手动调整</button></div></section>;
}

export function WorkflowEntry({ onSelect, disabled }: { onSelect: (mode: WorkflowMode) => void; disabled: boolean }) {
  return <>
    <section className="flow-home-hero sail-shader-surface" aria-labelledby="flow-home-title">
      <ShaderBackdrop variant="hero" />
      <div className="flow-hero-copy">
        <span className="flow-kicker">AI CREATIVE WORKSPACE</span>
        <h2 id="flow-home-title"><span className="flow-hero-title-line">把一条视频素材，</span><span className="flow-hero-title-line"><em>变成一套</em>海外增长方案</span></h2>
        <p>从真实视频出发，拆解有效镜头，改写成适合目标市场的可执行内容。</p>
        <div className="flow-hero-actions"><a className="flow-cta" href="#workflow-choice"><span>选择制作方式</span><ArrowRight size={17} /></a></div>
      </div>
    </section>
    <section className="workflow-entry" id="workflow-choice"><span className="tiny-label">CHOOSE YOUR WORKFLOW</span><h1>你想怎样制作这条视频？</h1><p>从同一条参考视频出发。随时查看过程、接管编辑，或让系统完成剩余步骤。</p><div className="workflow-entry-options">
    <button className="sail-shader-surface" disabled={disabled} onClick={() => onSelect('automatic')}><ShaderBackdrop variant="automatic" /><span className="workflow-entry-icon"><Sparkles size={25} /></span><span className="badge">连续制作</span><h2>自动工作流</h2><p>提供素材和制作要求，系统自动拆解、改写、生成并交付成片。</p><span className="workflow-entry-link">开始自动制作 <ArrowRight size={17} /></span></button>
    <button className="sail-shader-surface" disabled={disabled} onClick={() => onSelect('manual')}><ShaderBackdrop variant="manual" /><span className="workflow-entry-icon"><Settings2 size={25} /></span><h2>手动工作流</h2><p>逐步检查分镜、调整台词和 Prompt，自主决定每一步怎样制作。</p><span className="workflow-entry-link">进入手动工作台 <ArrowRight size={17} /></span></button>
  </div></section></>;
}

export default function AutomaticWorkspace({ project, busy, voices, connected, onPatch, onUpload, onStart, onTakeOver, onInspect, onCanvas, onSettings }: {
  project: Project; busy: boolean; voices: Voices; connected: boolean; onPatch: (patch: Patch) => void;
  onUpload: (files: File[], kind: 'video' | 'product') => void; onStart: (maxNewClips: number) => void;
  onTakeOver: () => void; onInspect: () => void; onCanvas: () => void; onSettings: () => void;
}) {
  const referenceInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageUploadBoxes = useRef<HTMLDivElement>(null);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const images = project.assets.filter(asset => asset.kind === 'product');
  const active = workflowBusy(project);
  const locked = busy || active || project.job?.status === 'running';
  useImagePaste(imageUploadBoxes, !locked, files => onUpload(files, 'product'));
  const output = keyframesReady(project);
  const requirements = workflowRequirements(project);
  const [showSettings, setShowSettings] = useState(!active && !output);
  const product = (patch: Partial<Product>) => onPatch({ product: { ...project.product, ...patch } });
  const market = (patch: Partial<Market>) => onPatch({ market: { ...project.market, ...patch } });
  const run = project.workflow;
  const title = active ? run?.status === 'pausing' ? '正在交接' : '正在生成逐镜头复刻关键帧' : output ? '复刻关键帧已准备好' : run?.status === 'needs-input' ? '补齐资料后继续生成' : run?.status === 'failed' ? '生成已暂停，可以继续' : run?.status === 'paused' ? '接着当前进度生成关键帧' : '先把每个镜头的关键帧做好';
  const frameCount = project.rewrite?.shots.filter(shot => keyframeCurrent(project, shot)).length || 0;
  const done = (id: string) => id === 'analysis' ? !!project.analysis : id === 'rewrite' ? !!project.rewrite && !project.rewriteStale : output;

  return <div className="automatic-workspace">
    <header className="automatic-heading sail-shader-surface"><ShaderBackdrop variant="heading" /><div><span className="tiny-label">AUTOMATIC WORKFLOW</span><h1>{title}</h1><p>参考镜头与关键帧 → 产品与创意改写 → 复刻关键帧与描述 → 检查和导出</p></div><div className="automatic-heading-actions"><button className="btn small" disabled={busy} onClick={onInspect}><Eye size={16} />查看制作步骤</button><button className="btn small" disabled={busy} onClick={onCanvas}><FileJson size={16} />查看输入与输出</button></div></header>
    {(run || project.job?.status === 'running') && <section className="panel automatic-progress" aria-live="polite"><div className="automatic-status"><div>{active || project.job?.status === 'running' ? <LoaderCircle size={19} className="spin" /> : output ? <Check size={19} /> : <Pause size={19} />}<span>{active && run?.status !== 'pausing' && project.job?.status === 'running' ? project.job.message : run?.message || project.job?.message}</span></div>{active && <button className="text-button" disabled={busy || run?.status === 'pausing'} onClick={onTakeOver}>{run?.status === 'pausing' ? '等待当前任务结束' : '接管并编辑'}</button>}</div>
      <ol className="automatic-stage-list">{keyframeWorkflowStages.map((stage, index) => <li key={stage.id} className={done(stage.id) ? 'done' : active && run?.stage === stage.id ? 'running' : ''}><span>{done(stage.id) ? <Check size={15} /> : active && run?.stage === stage.id ? <LoaderCircle size={15} className="spin" /> : index + 1}</span><div><strong>{stage.id === 'rewrite' && project.promptFlow === 'direct-analysis' ? '整理可编辑 Prompt' : stage.label}</strong><small>{stage.id === 'rewrite' && project.promptFlow === 'direct-analysis' ? '沿用原片分析，不调用第二次 Gemini' : stage.id === 'keyframe' ? `${frameCount}/${project.analysis?.shots.length || 0} 张关键帧已生成` : stage.description}</small></div></li>)}</ol>
      {active && project.job?.status === 'running' && <div className="job-track"><span style={{ width: `${project.job.progress}%` }} /></div>}
      <p className="automatic-background-note">任务在本机后台执行，可以离开当前页面。服务重启后会保留进度，等待你继续。</p>
    </section>}
    {output && <section className="panel automatic-result"><div className="panel-heading"><div><ImagePlus size={19} /><h2>图生视频所需的复刻关键帧</h2></div><span>{frameCount} 张 · 与原片镜头一一对应</span></div><div className="panel-body"><p>先检查产品外观、构图和起始动作。需要调整时进入手动工作台，编辑描述后重新生成对应图片。</p><div className="automatic-keyframes">{project.rewrite!.shots.map((shot, index) => <figure key={shot.id}><a href={shot.keyframe!.url} target="_blank" rel="noreferrer"><img src={shot.keyframe!.url} alt={`镜头 ${index + 1} 的复刻关键帧：${shot.visual}`} loading="lazy" /></a><figcaption><strong>镜头 {index + 1}</strong><span>{shot.visual}</span><a href={shot.keyframe!.url} download>下载图片</a></figcaption></figure>)}</div><button className="btn" disabled={busy} onClick={onTakeOver}>逐镜头检查与调整 <ArrowRight size={15} /></button></div></section>}
    <section className="panel automatic-setup"><button type="button" className="automatic-setup-toggle" onClick={() => setShowSettings(!showSettings)}><span><Settings2 size={18} />制作资料与设置</span><span>{showSettings ? '收起' : '展开'}</span></button>{showSettings && <div className="automatic-setup-body">
      <div className="automatic-production"><span className="field-label">分镜生成路径</span><div className="production-mode-picker"><button disabled={locked} className={project.promptFlow === 'direct-analysis' ? 'active' : ''} onClick={() => onPatch({ promptFlow: 'direct-analysis', market: { ...project.market, duration: 'original' } })}><strong>仅整理原片分析（不生成图片）</strong><span>Gemini 分析后，直接整理为可编辑 Veo Prompt，不做第二次改写</span></button><button disabled={locked} className={(project.promptFlow || 'localized') === 'localized' ? 'active' : ''} onClick={() => onPatch({ promptFlow: 'localized' })}><strong>产品与创意改写</strong><span>结合原片镜头与产品图，生成对应的起始关键帧和描述</span></button></div></div>
      <div className="automatic-materials"><div><span className="tiny-label">01 · 参考视频</span><input ref={referenceInput} type="file" className="sr-only" accept="video/mp4,video/quicktime,video/webm,.mov" onChange={event => { if (event.target.files?.length) onUpload(Array.from(event.target.files), 'video'); event.target.value = ''; }} /><button className="automatic-upload" disabled={locked} onClick={() => referenceInput.current?.click()}>{reference ? <><Film size={23} /><strong>{reference.name}</strong><small>{reference.duration?.toFixed(1)} 秒 · 点击更换</small></> : <><Upload size={24} /><strong>上传参考视频</strong><small>保留原片的表达结构和剪辑节奏</small></>}</button></div>
        <div><span className="tiny-label">02 · 产品/主体参考图{project.promptFlow === 'direct-analysis' ? '（可选）' : '（必填）'}</span><input ref={imageInput} type="file" className="sr-only" multiple accept="image/jpeg,image/png,image/webp" onChange={event => { if (event.target.files?.length) onUpload(Array.from(event.target.files), 'product'); event.target.value = ''; }} /><div className="automatic-images" ref={imageUploadBoxes}>{images.map(image => <img src={image.url} key={image.id} alt={image.name} />)}{images.length < 3 && <button data-image-upload disabled={locked} onClick={() => imageInput.current?.click()} aria-label="添加产品/主体参考图"><ImagePlus size={24} /><small>点击或粘贴图片</small></button>}</div><small className="muted">产品图用于生成符合需求的复刻关键帧；每张关键帧与描述一起用于对应镜头的图生视频。</small></div></div>
      <div className="automatic-form-grid"><label className="field"><span className="field-label">创意名称</span><input className="input" value={project.title} disabled={locked} onChange={event => onPatch({ title: event.target.value })} /></label><label className="field"><span className="field-label">产品名称 · 必填</span><input className="input" value={project.product.name} disabled={locked} placeholder="例如：便携冷萃咖啡杯" onChange={event => product({ name: event.target.value })} /></label><label className="field automatic-wide"><span className="field-label">已确认的产品卖点与规格 · 必填</span><textarea className="input textarea" rows={4} disabled={locked} value={project.product.facts} placeholder="写具体产品事实，例如容量、材质、结构和使用方法。" onChange={event => product({ facts: event.target.value })} /></label>
        <label className="field"><span className="field-label">目标市场</span><select className="input" value={project.market.country} disabled={locked} onChange={event => { const country = countries.find(country => country.code === event.target.value)!; onPatch({ market: { ...project.market, country: country.code, language: country.language }, ttsVoice: '' }); }}>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
        <label className="field"><span className="field-label">目标语言</span><select className="input" value={project.market.language} disabled={locked} onChange={event => onPatch({ market: { ...project.market, language: event.target.value as Market['language'] }, ttsVoice: '' })}>{languages.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
        <label className="field"><span className="field-label">发布平台</span><select className="input" disabled={locked} value={project.market.platform} onChange={event => market({ platform: event.target.value as Market['platform'], destination: 'website' })}>{platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>
        <label className="field"><span className="field-label">目标时长</span><select className="input" disabled={locked} value={project.market.duration} onChange={event => market({ duration: event.target.value as Market['duration'] })}><option value="original">保持参考视频时长</option>{['15', '30', '45', '60'].map(value => <option value={value} key={value}>{value} 秒</option>)}</select></label>
        <label className="field"><span className="field-label">行动引导（可选）</span><input className="input" disabled={locked} value={project.market.cta} placeholder="例如：前往主页了解更多" onChange={event => market({ cta: event.target.value })} /></label>
        <label className="field"><span className="field-label">视频画幅</span><select className="input" disabled={locked} value={project.market.aspectRatio} onChange={event => market({ aspectRatio: event.target.value as Market['aspectRatio'] })}><option value="" disabled>选择支持的画幅</option><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="4:5">4:5 竖图</option><option value="1:1">1:1 方图</option></select></label>
      </div>
      <div className="automatic-form-grid"><label className="field automatic-wide"><span className="field-label">参考视频里哪些保持原样</span><textarea className="input textarea" rows={2} disabled={locked} value={(project.replication || defaultReplication).preserve} onChange={event => onPatch({ replication: { ...(project.replication || defaultReplication), preserve: event.target.value } })} /></label><label className="field automatic-wide"><span className="field-label">哪些可以替换或调整</span><textarea className="input textarea" rows={2} disabled={locked} value={(project.replication || defaultReplication).change} onChange={event => onPatch({ replication: { ...(project.replication || defaultReplication), change: event.target.value } })} /></label></div>


    </div>}</section>
    {!active && !output && <section className="automatic-start"><div><strong>预计 {project.analysis?.shots.length || '按拆解结果'} 张对应关键帧</strong><p>逐镜头生成后自动停下供你检查。已有有效图片会复用；可在手动工作台重试单张图片。</p>{requirements.length > 0 && <p className="error-text">开始前请：{requirements.join('；')}。</p>}</div><div className="automatic-start-actions">{!connected && <button className="btn" onClick={onSettings}><Globe2 size={16} />连接 Gemini</button>}<button className="btn primary" disabled={locked || requirements.length > 0} onClick={() => { setShowSettings(false); onStart(0); }}><ImagePlus size={17} />{run ? '继续生成关键帧' : '生成逐镜头方案与关键帧'}</button><button className="text-button" disabled={busy} onClick={onTakeOver}>进入手动工作台</button></div></section>}
    {!!project.jobHistory?.length && <details className="automatic-history"><summary>执行记录 · {project.jobHistory.length} 个任务</summary>{[...project.jobHistory].reverse().map(job => <div key={job.id}><span className={job.status === 'failed' ? 'error-text' : ''}>{job.status === 'completed' ? '已完成' : job.status === 'needs-input' ? '等待确认' : '已暂停'}</span><strong>{job.message}</strong><time>{new Date(job.startedAt).toLocaleString()}</time></div>)}</details>}
  </div>;
}
