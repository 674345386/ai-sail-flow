import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CirclePlay, Clapperboard, Copy, Download, Eye, FileJson, FileText, Film, FolderOpen, Globe2, Grid2X2, ImagePlus, Info, LayoutList, LoaderCircle, LogOut, Mail, Package, Plus, Save, ScanLine, Scissors, Settings, Settings2, ShieldCheck, Sparkles, Subtitles, Upload, Video, WandSparkles, Workflow, X } from 'lucide-react';
import { countries, defaultReplication, defaultWorkspace, languages, platforms, roles, timeLabel, validateContinuousTimeline, validateTimeline, type FocusPoint, type Project, type ProjectSummary, type WorkspaceProject, type Shot, type Product, type Market, type Replication, type ProductionMode, type WorkflowMode } from '../shared/domain';
import { mergeFocusPoints } from '../shared/focus';
import { keyframeCurrent } from '../shared/storyboard';
import { buildBrief, buildPrompt, buildExportFiles, buildVeoPromptPreview, buildVeoUnitPrompt, subtitles } from '../shared/export';
import { buildVeoPlan, type VeoPlanUnit } from '../shared/veo-plan';
import { api, downloadBlob } from './api';
import { useImagePaste } from './useImagePaste';
import { authDisplayName, authEmail, authErrorMessage, initialAuthState, publicAuthRequired, syncPublicServerSession, supabase, loadAuthAvailability, unknownAuthAvailability, validEmail, validEmailCode, startWechatSignIn, readAuthCallback, clearAuthCallback, type AuthAvailability, type SailAuthState } from './auth';
import AuthDialog from './AuthDialog';
import AssetLibrary, { MediaLibraryPage } from './AssetLibrary';
import type { LibraryMedia } from '../shared/media-library';
import { libraryFile, mediaChanged, syncMediaLibrary } from './mediaLibrary';
import PipelineCanvas from './PipelineCanvas';
import ShotBreakdown from './ShotBreakdown';
import ShotRewriteBoard, { RewriteProductInputs } from './ShotRewriteBoard';
import FocusPointsEditor from './FocusPointsEditor';
import ShotTimelineEditor from './ShotTimelineEditor';
import ProjectNavigation from './ProjectNavigation';
import AnimatedBrandMark from './AnimatedBrandMark';
import ShaderBackdrop from './ShaderBackdrop';
import { shotReconstructionPrompt } from '../shared/shot-evidence';
import AutomaticWorkspace, { SpeechTimingConfirmation, WorkflowEntry } from './WorkflowWorkspace';
const CreativeWorkspace = lazy(() => import('./CreativeWorkspace'));
import { editableUnitPrompt, finalVideo, nextWorkflowAction, productionSources, videoCurrent, workflowBusy } from '../shared/workflow';

const steps = [
  { name: '上传素材', en: 'MATERIALS', icon: Upload, title: '准备你的创意素材', description: '用一条参考视频，定义下一条内容的起点。' },
  { name: '视频拆解', en: 'BREAKDOWN', icon: ScanLine, title: '看懂每一个有效镜头', description: '对照原片，检查动作、口播与商品展示。' },
  { name: '产品与创意改写', en: 'SHOT RECREATION', icon: WandSparkles, title: '让每个参考镜头，换上你的产品', description: '承接原片关键帧与分析，逐镜头生成复刻画面和描述。' },
  { name: '关键帧与提示词导出', en: 'DELIVERY', icon: Package, title: '检查并带走你的复刻方案', description: '逐镜头复刻关键帧、动作与运镜描述，作为后续图生视频的输入。' },
];
type Status = {
  model: string; configured: boolean;
  keyframeModel?: string;
  keyframeStorage?: { configured: boolean; url: string; bucket: string };
  videoGeneration: { provider: string; models: { t2v: string; i2v: string; r2v: string }; configured: boolean; duration: number };
};
type VeoMode = 't2v' | 'i2v' | 'r2v';
type VeoConfig = { mode: VeoMode; resolution: '720p' | '1080p' | 'lite'; aspectRatio: '16:9' | '9:16'; prompt: string; images?: string[] };
type TtsVoice = { name: string; language: string };
function Field({ label, hint, error, errorId, children, className = '' }: { label: string; hint?: string; error?: string; errorId?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${error ? 'invalid' : ''} ${className}`}><span className="field-label">{label}</span>{children}{error && <span className="field-error" id={errorId}>{error}</span>}{hint && <span className="field-hint">{hint}</span>}</label>;
}
function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`input ${props.className || ''}`} />; }
function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`input textarea ${props.className || ''}`} />; }
function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="toggle-row"><div><span>{label}</span><small>{hint}</small></div><button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button></div>;
}
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-btn" aria-label="关闭" onClick={onClose}><X size={18} /></button></div>{children}</dialog>;
}
function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function SidebarToggleIcon({ expanded }: { expanded: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    {expanded ? <rect x="5.5" y="5.5" width="4" height="13" rx="1" fill="currentColor" stroke="none" /> : <path d="M9 3.5v17" />}
  </svg>;
}
type OrganizationDialog = { kind: 'project-new' | 'project-edit' | 'creative-new' | 'creative-edit'; parentId: string; title: string; demo?: boolean };
function OrganizationForm({ dialog, groups, busy, error, onSubmit, onClose }: { dialog: OrganizationDialog; groups: WorkspaceProject[]; busy: boolean; error: string; onSubmit: (title: string, parentId: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(dialog.title);
  const [parentId, setParentId] = useState(dialog.parentId);
  const creative = dialog.kind.startsWith('creative');
  const heading = { 'project-new': '新建项目', 'project-edit': '重命名项目', 'creative-new': '新建创意', 'creative-edit': '编辑创意' }[dialog.kind];
  return <Modal title={heading} onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSubmit(title.trim(), parentId); }}>
    <p className="modal-description">{creative ? '每个创意独立保存参考素材、镜头拆解、Prompt 与生成结果。' : '项目用于归类相关创意，例如“夏装”。一个项目可以包含多个创意。'}</p>
    {creative && <Field label="所属项目"><select className="input" value={parentId} disabled={busy} onChange={event => setParentId(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}</select></Field>}
    <Field label={creative ? '创意名称' : '项目名称'}><Input autoFocus required maxLength={120} value={title} disabled={busy} placeholder={creative ? '例如：色卡夏装换装上、青少年夏装' : '例如：夏装'} onChange={event => setTitle(event.target.value)} /></Field>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="organization-form-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>取消</button><button className="btn primary" type="submit" disabled={busy || !title.trim() || (creative && !parentId)}>{busy ? '保存中' : dialog.kind === 'project-new' ? '创建项目' : dialog.kind === 'creative-new' ? '创建创意' : '保存'}</button></div>
  </form></Modal>;
}
function VeoUnitCard({ unit, index, project, disabled, connected, voice, onGenerate, onRecover, onPrompt, onComposeUnit, storageConnected }: { unit: VeoPlanUnit; storageConnected: boolean; index: number; project: Project; disabled: boolean; connected: boolean; voice: string; onGenerate: (unitId: string, config: VeoConfig) => void; onRecover: (videoId: string) => void; onPrompt: (unitId: string, mode: ProductionMode, prompt: string, basis: string) => void; onComposeUnit: (videoId: string, voice: string) => void }) {
  const [manualMode, setMode] = useState<VeoMode>('t2v');
  const linkedFrame = project.promptFlow !== 'direct-analysis';
  const mode = linkedFrame ? 'i2v' : manualMode;
  const shot = project.rewrite!.shots.find(shot => shot.id === unit.sourceShotIds[0])!;
  const frameReady = keyframeCurrent(project, shot);
  const [resolution, setResolution] = useState<VeoConfig['resolution']>('720p');
  const [manualAspectRatio, setAspectRatio] = useState<VeoConfig['aspectRatio']>(project.market.aspectRatio === '16:9' ? '16:9' : '9:16');
  const aspectRatio = linkedFrame ? project.market.aspectRatio === '16:9' ? '16:9' : '9:16' : manualAspectRatio;
  const [firstFrame, setFirstFrame] = useState('');
  const [lastFrame, setLastFrame] = useState('');
  const [referenceUrls, setReferenceUrls] = useState('');
  const storyboardPrompt = buildVeoUnitPrompt(project, unit);
  const prompt = editableUnitPrompt(project, unit);
  const productionMode = project.productionMode || 'veo-native';
  const generated = [...project.generatedVideos].reverse().find(item => item.unitId === unit.id && (item.productionMode || 'veo-native') === productionMode);
  const processed = productionMode === 'tts-subtitles' && generated ? [...(project.composedVideos || [])].reverse().find(item => item.unitId === unit.id && item.sourceVideoIds[0] === generated.id && item.voice === voice && !item.stale) : undefined;
  const images = mode === 'i2v' ? [firstFrame.trim(), lastFrame.trim()].filter(Boolean) : mode === 'r2v' ? referenceUrls.split(/\s+/).map(url => url.trim()).filter(Boolean) : [];
  const ready = linkedFrame ? frameReady && ['9:16', '16:9'].includes(project.market.aspectRatio) : mode === 't2v' || images.length > 0 && images.every(image => /^https:\/\//.test(image));
  const sourceNumbers = unit.sourceShotIds.map(id => project.rewrite!.shots.findIndex(shot => shot.id === id) + 1).filter(Boolean).map(value => String(value).padStart(2, '0')).join('、');
  const trim = 8 - unit.targetDuration;
  const submittedParameters = generated ? JSON.stringify({
    model: generated.model,
    resolution: generated.resolution,
    aspect_ratio: generated.aspectRatio,
    ...(generated.mode === 't2v' ? {} : { images: generated.imageUrls }),
  }, null, 2) : '';
  return <article className="generated-video-item"><div className="generated-video-copy"><span>镜头片段 {String(index + 1).padStart(2, '0')} · 成片 {unit.start.toFixed(2)}–{unit.end.toFixed(2)}s · 分镜 {sourceNumbers || '—'}</span><strong>最终使用 {unit.targetDuration.toFixed(2)}s；本次生成固定 8s</strong><p>{trim > 0.01 ? '按镜头目标时长裁切，保留前 ' + unit.targetDuration.toFixed(2) + ' 秒。' : trim < -.01 ? '此镜头超过 8 秒，拼接时放慢片段至目标时长。' : '完整使用这一个镜头片段。'}</p>{linkedFrame && <div className="veo-linked-keyframe">{shot.keyframe?.url ? <img src={shot.keyframe.url} alt={'镜头 ' + (index + 1) + ' 的复刻首帧'} /> : <ImagePlus size={25} />}<div><strong>使用此镜头的复刻关键帧</strong><p>{shot.visual}</p><small>{frameReady ? '关键帧已就绪 · 自动用作图生视频首帧' : '请先到产品与创意改写更新此镜头关键帧。'}</small>{!storageConnected && <small>首次生成前请连接 Supabase 私有图片存储。</small>}</div></div>}
    <div className="veo-controls">{!linkedFrame && <Field label="生成场景"><select className="input" value={mode} onChange={e => setMode(e.target.value as VeoMode)} disabled={disabled}><option value="t2v">文生视频 · t2v</option><option value="i2v">首尾帧图生视频 · i2v</option><option value="r2v">参考图生视频 · r2v</option></select></Field>}
      <div className="veo-options"><Field label="画幅"><select className="input" value={aspectRatio} onChange={e => setAspectRatio(e.target.value as VeoConfig['aspectRatio'])} disabled={disabled || linkedFrame}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option></select></Field><Field label="分辨率"><select className="input" value={resolution} onChange={e => setResolution(e.target.value as VeoConfig['resolution'])} disabled={disabled}><option value="720p">720p</option><option value="1080p">1080p</option><option value="lite">lite</option></select></Field></div>
      {!linkedFrame && mode === 'i2v' && <><Field label="首帧图片 · 必填"><Input type="url" placeholder="https://cdn.example.com/first.jpg" value={firstFrame} onChange={e => setFirstFrame(e.target.value)} disabled={disabled} /></Field><Field label="尾帧图片 · 可选"><Input type="url" placeholder="https://cdn.example.com/last.jpg" value={lastFrame} onChange={e => setLastFrame(e.target.value)} disabled={disabled} /></Field></>}
      {!linkedFrame && mode === 'r2v' && <Field label="参考图直链 · 每行一张"><Textarea rows={3} placeholder={'https://cdn.example.com/ref-1.jpg\nhttps://cdn.example.com/ref-2.jpg'} value={referenceUrls} onChange={e => setReferenceUrls(e.target.value)} disabled={disabled} /></Field>}
      {!linkedFrame && mode !== 't2v' && <small>仅支持公网 HTTPS 图片直链；本机上传的产品图不会自动公开或发送。</small>}
      {!linkedFrame && mode === 't2v' && project.market.keepStructure && <small>文生视频只发送文字分镜；原片和本机产品图不会作为画面输入送给 Veo，因此无法保证人物、服装与镜头逐帧复刻。</small>}</div>
    <details className="veo-prompt-editor"><summary>查看 / 编辑本次发送给 Veo 的 Prompt</summary><p>默认原样使用“交付内容预览 → 结构化分镜 JSON”。提交后服务端不会增补、裁切或改写。</p><Textarea rows={14} value={prompt} onChange={e => onPrompt(unit.id, productionMode, e.target.value, storyboardPrompt)} disabled={disabled} /></details>
    {generated && !videoCurrent(project, generated) && <small>当前成片对应旧版方案；方案更新后应重新生成。</small>}{generated?.status === 'failed' && <small className="error-text">{generated.error || '上一次生成失败。'}</small>}{generated && <details className="veo-request-input"><summary>查看最近一次发送给 Veo 的输入</summary><p>Prompt 原文（不含 API Key）：</p><pre>{generated.prompt}</pre><p>其他请求参数：</p><pre>{submittedParameters}</pre></details>}
  </div><div className="generated-video-actions">{generated?.status === 'completed' && generated.url && <>{(productionMode === 'veo-native' || processed) ? <video src={processed?.url || generated.url} poster={generated.thumbnail} controls playsInline preload="metadata" aria-label={'镜头片段 ' + (index + 1) + (processed ? ' 已配音字幕片段' : ' 原生片段')} /> : <p>画面已生成，但还没有本地配音与字幕。请点击下方按钮处理这段源片。</p>}{processed && <a className="btn small" href={processed.url} download><Download size={14} />下载已配音字幕片段</a>}{productionMode === 'tts-subtitles' && <button className="btn small" disabled={disabled || !voice || !videoCurrent(project, generated)} onClick={() => onComposeUnit(generated.id, voice)}><Subtitles size={14} />{processed ? '重新配音并烧录字幕' : '给此段配音并烧录字幕'}</button>}<a className="btn small" href={generated.url} download><Download size={14} />下载 Veo 画面源片</a></>}
    {generated?.status === 'failed' && generated.requestId && videoCurrent(project, generated) && <button className="btn primary small" disabled={disabled} onClick={() => onRecover(generated.id)}><Clapperboard size={14} />{connected ? '恢复已生成任务' : '配置并恢复'}</button>}
    <button className={'btn ' + (generated?.status === 'failed' && generated.requestId ? '' : 'primary') + ' small'} disabled={disabled || project.rewriteStale || !ready} onClick={() => onGenerate(unit.id, { mode, resolution, aspectRatio, prompt, ...(linkedFrame || mode === 't2v' ? {} : { images }) })}><Clapperboard size={14} />{connected ? generated?.status === 'completed' || generated?.status === 'failed' ? '新建生成任务' : productionMode === 'tts-subtitles' ? '生成画面并自动配音' : '生成此镜头视频' : '配置并生成'}</button></div></article>;
}
function VeoPanel({ project, status, disabled, voices, onGenerate, onRecover, onPrompt, onComposeUnit, onModeChange, onVoiceChange, onCompose }: { project: Project; status: Status; disabled: boolean; voices: TtsVoice[]; onGenerate: (unitId: string, config: VeoConfig) => void; onRecover: (videoId: string) => void; onPrompt: (unitId: string, mode: ProductionMode, prompt: string, basis: string) => void; onComposeUnit: (videoId: string, voice: string) => void; onModeChange: (mode: ProductionMode) => void; onVoiceChange: (voice: string) => void; onCompose: (voice: string) => void }) {
  const units = buildVeoPlan(project.rewrite!.shots);
  const targetDuration = units.reduce((total, unit) => total + unit.targetDuration, 0);
  const productionMode = project.productionMode || 'veo-native';
  const sourceVideos = units.map(unit => [...project.generatedVideos].reverse().find(video => video.unitId === unit.id && (video.productionMode || 'veo-native') === productionMode && video.status === 'completed' && videoCurrent(project, video)));
  const finished = sourceVideos.filter(Boolean).length;
  const selectedVoices = voices.filter(voice => voice.language.toLowerCase() === project.market.language.toLowerCase());
  const voice = selectedVoices.find(item => item.name === project.ttsVoice)?.name || selectedVoices.find(item => ['Samantha', 'Daniel', 'Karen', 'Anna', 'Thomas', 'Luciana', 'Kyoko'].includes(item.name))?.name || selectedVoices[0]?.name || '';
  const completed = finalVideo(project);
  return <section className="panel generated-video-panel"><div className="panel-heading"><div><Clapperboard size={18} /><h2>逐镜头图生视频</h2></div><Badge>{status.videoGeneration.configured ? '已配置' : '待配置'}</Badge></div>
    <div className="production-mode-picker" role="group" aria-label="成片模式"><button type="button" className={productionMode === 'veo-native' ? 'active' : ''} disabled={disabled} onClick={() => onModeChange('veo-native')}><strong>Veo 原生</strong><span>画面、口播、文字由 Veo 一次生成</span></button><button type="button" className={productionMode === 'tts-subtitles' ? 'active' : ''} disabled={disabled} onClick={() => onModeChange('tts-subtitles')}><strong>本地配音与字幕</strong><span>Veo 负责画面，系统连续配音、同步字幕并合成</span></button></div>
    <div className="generated-video-note"><Info size={15} /><span>共 {units.length} 个镜头，每个镜头独立生成一个片段；按原顺序拼接为 {targetDuration.toFixed(2)} 秒。{project.promptFlow !== 'direct-analysis' && '每张复刻关键帧自动作为对应片段的首帧。'}{productionMode === 'tts-subtitles' ? '本地合成会移除 Veo 原声，按分镜台词生成配音并叠加文字。' : '台词和文字随 Prompt 发给 Veo。'}</span></div>
    {productionMode === 'tts-subtitles' && <div className="production-audio-controls"><Field label="配音音色" hint={selectedVoices.length ? `本机 ${project.market.language} 系统音色；可切换音色后重新合成。` : `正在读取 ${project.market.language} 音色；若持续为空，请检查本机语音安装。`}><select className="input" value={voice} disabled={disabled || !selectedVoices.length} onChange={e => onVoiceChange(e.target.value)}>{selectedVoices.length ? selectedVoices.map(item => <option key={item.name} value={item.name}>{item.name}</option>) : <option value="">无可用音色</option>}</select></Field><p>台词保持原文，配音可跨镜头连续播放，口播字幕跟随声音；画面文字仍跟随镜头。整条视频放不下时，只需确认是否延长成片。单元预览可能从一句话中间开始，请以最终成片为准。</p></div>}
    <div className="generated-video-list">{units.map((unit, index) => <VeoUnitCard storageConnected={!!status.keyframeStorage?.configured} key={unit.id} unit={unit} index={index} project={project} disabled={disabled} connected={status.videoGeneration.configured && (project.promptFlow === 'direct-analysis' || !!status.keyframeStorage?.configured)} voice={voice} onGenerate={onGenerate} onRecover={onRecover} onPrompt={onPrompt} onComposeUnit={onComposeUnit} />)}</div>
    {productionMode === 'tts-subtitles' && <div className="production-compose"><div><strong>最终成片</strong><p>已备齐 {finished}/{units.length} 个画面片段。配音、字幕和合成在本机完成。</p></div><button className="btn primary small" disabled={disabled || !voice || finished !== units.length || project.rewriteStale} onClick={() => onCompose(voice)}><Clapperboard size={15} />合成最终视频</button>{completed && <div className="production-final"><video src={completed.url} controls playsInline preload="metadata" aria-label="已合成的最终视频" /><a className="btn small" href={completed.url} download><Download size={14} />下载最终 MP4</a>{completed.subtitleUrl && <a className="btn small" href={completed.subtitleUrl} download><Subtitles size={14} />下载 SRT 字幕</a>}</div>}</div>}
    {productionMode === 'veo-native' && <div className="production-compose"><div><strong>最终成片</strong><p>已完成 {finished}/{units.length} 个片段。按分镜时间拼接，保留 Veo 原声。</p></div><button className="btn primary small" disabled={disabled || finished !== units.length || project.rewriteStale} onClick={() => onCompose('')}><Clapperboard size={15} />拼接最终视频</button>{completed && <div className="production-final"><video src={completed.url} controls playsInline preload="metadata" aria-label="Veo 原生成片" /><a className="btn small" href={completed.url} download><Download size={14} />下载最终 MP4</a></div>}</div>}
  </section>;
}
type StudioMockupVariant = 'gallery' | 'plan' | 'create' | 'polish';
function StudioMockup({ variant, images }: { variant: StudioMockupVariant; images: string[] }) {
  const labels = variant === 'plan' ? ['创意方向', '受众洞察', '镜头结构', '行动引导'] : variant === 'create' ? ['脚本', '画面', '口播', '字幕'] : ['上传素材', '视频拆解', '创意改写', '提示词包'];
  return <div className={`gf-studio gf-studio-${variant}`} aria-label={`${variant} 工作台示意`}>
    <div className="gf-studio-toolbar"><strong>AI-Sail Flow</strong><span className="gf-studio-address" /><span className="gf-studio-avatar" /></div>
    <div className="gf-studio-body">
      <aside className="gf-studio-sidebar"><span className="active" />{labels.map(label => <span key={label}>{label}</span>)}</aside>
      <div className="gf-studio-canvas">
        {(variant === 'gallery' || variant === 'plan') && <div className="gf-studio-gallery">{Array.from({ length: variant === 'gallery' ? 12 : 8 }, (_, index) => <figure key={index}><img src={images[index % images.length]} alt="" /><figcaption>{['首屏钩子', '产品演示', '细节证明', '场景代入'][index % 4]}</figcaption></figure>)}</div>}
        {variant === 'create' && <div className="gf-create-stage"><img src={images[3]} alt="户外创作者内容预览" /><div className="gf-create-glass"><span>生成中的本地化脚本</span><strong>Show the product in a real-life moment.</strong></div></div>}
        {variant === 'polish' && <><div className="gf-polish-stage"><img src={images[2]} alt="产品视频打磨预览" /><div className="gf-polish-focus" /></div><div className="gf-timeline">{Array.from({ length: 7 }, (_, index) => <span key={index} className={index === 3 ? 'active' : ''} />)}</div></>}
      </div>
      <aside className="gf-studio-inspector"><small>{variant === 'gallery' ? '项目素材' : variant === 'plan' ? '方案建议' : variant === 'create' ? '生成设置' : '镜头调整'}</small>{labels.map((label, index) => <div key={label}><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong><i /></div>)}</aside>
    </div>
    <div className="gf-studio-prompt"><Sparkles size={13} /><span>{variant === 'gallery' ? '分析参考视频中的有效创意结构' : variant === 'plan' ? '为美国 TikTok 生成 3 个创意方向' : variant === 'create' ? '生成 15 秒产品演示脚本' : '让第 4 个镜头更有购买推动力'}</span><ArrowRight size={13} /></div>
  </div>;
}
function SectionBackdrop({ src, className = '' }: { src: string; className?: string }) {
  return <div className={`gf-section-backdrop ${className}`} aria-hidden="true"><img src={src} alt="" /></div>;
}

const landingTools = ['文字叠加', '视频画面调整工具', '图片编辑器', '分镜脚本工作室', '音色翻译', '口播重写', '节奏诊断', '字幕本地化', '产品事实校验', '提示词包导出'];
const landingPlans = [
  { name: '免费', price: '¥0', note: '本地体验', features: ['1 个本地工作区', '视频与音轨理解', '基础提示词包'] },
  { name: 'Creator', price: '即将推出', note: '个人创作者', features: ['完整视频拆解', '多市场改写', '可编辑分镜'] },
  { name: 'Pro', price: '即将推出', note: '增长团队', features: ['批量创意方向', '团队交付格式', '品牌语气模板'] },
  { name: 'Studio', price: '即将推出', note: '内容工作室', features: ['多项目管理', '制作资料包', '团队工作流'] },
  { name: 'Enterprise', price: '联系我们', note: '企业方案', features: ['私有化部署', '自定义模型通道', '专属支持'] },
];
const sizeLabel = (bytes: number) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;


export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectGroups, setProjectGroups] = useState<WorkspaceProject[]>([]);
  const [organizationDialog, setOrganizationDialog] = useState<OrganizationDialog | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<Status>({ model: 'gemini-3.8-flash', configured: false, videoGeneration: { provider: 'veo-3.1', models: { t2v: 'veo_3_1', i2v: 'veo_3_1-fl', r2v: 'veo_3_1-components' }, configured: false, duration: 8 } });
  const [step, setStep] = useState(0);
  const [workspaceView, setWorkspaceView] = useState<'steps' | 'canvas'>(() => { try { return localStorage.getItem('sop-workspace-view') === 'canvas' ? 'canvas' : 'steps'; } catch { return 'steps'; } });
  useEffect(() => { try { localStorage.setItem('sop-workspace-view', workspaceView); } catch {} }, [workspaceView]);
  const [showLanding, setShowLanding] = useState(true);
  const [selectedShot, setSelectedShot] = useState(0);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [selectedRewrite, setSelectedRewrite] = useState(0);
  const [exportTab, setExportTab] = useState('prompt');
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>([]);
  const [modal, setModal] = useState<'config' | 'settings' | 'guide' | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [veoApiKey, setVeoApiKey] = useState('');
  const [storageUrl, setStorageUrl] = useState('');
  const [storageKey, setStorageKey] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showRequiredErrors, setShowRequiredErrors] = useState(false);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem('sop-sidebar-collapsed') === 'true'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('sop-sidebar-collapsed', String(sidebarCollapsed)); } catch {} }, [sidebarCollapsed]);
  const [showPipeline, setShowPipeline] = useState(false);
  const [observing, setObserving] = useState(false);
  const [bootError, setBootError] = useState('');
  const [auth, setAuth] = useState<SailAuthState>(initialAuthState);
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmailValue, setAuthEmailValue] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authStage, setAuthStage] = useState<'email' | 'code'>('email');
  const [authAvailability, setAuthAvailability] = useState<AuthAvailability>(unknownAuthAvailability);
  const [authResendAt, setAuthResendAt] = useState(0);
  const [authResendSeconds, setAuthResendSeconds] = useState(0);
  const authRequest = useRef(false);
  const [assetLibraryTarget, setAssetLibraryTarget] = useState<'all' | 'image' | 'video' | null>(null);
  const [initialMedia, setInitialMedia] = useState<LibraryMedia | null>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const current = useRef<Project | null>(null);
  const unsaved = useRef(false);
  const editSequence = useRef(0);
  const savePromise = useRef<Promise<Project | null> | null>(null);
  const imageUploadBoxes = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState(false);

  const adopt = useCallback((p: Project) => { current.current = p; setProject(p); }, []);
  const refreshList = useCallback(async () => {
    const [creatives, groups] = await Promise.all([api<ProjectSummary[]>('/api/projects'), api<WorkspaceProject[]>('/api/workspace/projects')]);
    setProjects(creatives); setProjectGroups(groups);
  }, []);
  const change = useCallback((fn: (p: Project) => Project) => {
    const p = current.current;
    if (!p || p.job?.status === 'running' || workflowBusy(p) || observing) return;
    const next = fn(p);
    const changedInputs = JSON.stringify(next.product) !== JSON.stringify(p.product) || JSON.stringify(next.market) !== JSON.stringify(p.market) || JSON.stringify(next.replication || defaultReplication) !== JSON.stringify(p.replication || defaultReplication) || JSON.stringify(next.analysis) !== JSON.stringify(p.analysis) || (next.promptFlow || 'localized') !== (p.promptFlow || 'localized');
    next.rewriteStale = p.rewriteStale || (!!next.rewrite && changedInputs);
    editSequence.current++; unsaved.current = true; setDirty(true); adopt(next);
  }, [adopt, observing]);
  const updateProduct = (patch: Partial<Product>) => change(p => ({ ...p, product: { ...p.product, ...patch } }));
  const updateMarket = (patch: Partial<Market>) => change(p => ({ ...p, market: { ...p.market, ...patch } }));
  const updateReplication = (patch: Partial<Replication>) => change(p => ({ ...p, replication: { ...defaultReplication, ...p.replication, ...patch } }));
  const save = useCallback(async (): Promise<Project | null> => {
    if (savePromise.current) await savePromise.current;
    if (!unsaved.current || !current.current) return current.current;
    const snapshot = current.current;
    if (snapshot.analysis) { const e = validateTimeline(snapshot.analysis.shots, snapshot.analysis.duration); if (e) throw new Error(e); }
    if (snapshot.rewrite && !snapshot.rewriteStale) { const targetDuration = snapshot.market.duration === 'original' ? snapshot.analysis?.duration : Number(snapshot.market.duration); const e = snapshot.promptFlow === 'direct-analysis' ? validateTimeline(snapshot.rewrite.shots, targetDuration) : targetDuration ? validateContinuousTimeline(snapshot.rewrite.shots, targetDuration) : validateTimeline(snapshot.rewrite.shots); if (e) throw new Error(e); }
    const seq = editSequence.current;
    setSaving(true);
    const promise = (async () => {
      const saved = await api<Project>(`/api/projects/${snapshot.id}`, { method: 'PUT', body: JSON.stringify({ revision: snapshot.revision, parentProjectId: snapshot.parentProjectId, title: snapshot.title.trim() || '未命名创意', product: snapshot.product, market: snapshot.market, replication: snapshot.replication || defaultReplication, analysis: snapshot.analysis, analysisReview: snapshot.analysisReview, rewrite: snapshot.rewrite, productionMode: snapshot.productionMode || 'veo-native', promptFlow: snapshot.promptFlow || 'localized', ttsVoice: snapshot.ttsVoice || '', automaticSettings: snapshot.automaticSettings, veoPromptDrafts: snapshot.veoPromptDrafts || {} }) });
      if (current.current?.id === saved.id) {
        if (editSequence.current === seq) { unsaved.current = false; setDirty(false); adopt(saved); }
        else adopt({ ...current.current, revision: saved.revision, updatedAt: saved.updatedAt, rewriteStale: current.current.rewriteStale || saved.rewriteStale });
      }
      await refreshList();
      return current.current;
    })();
    savePromise.current = promise;
    try { return await promise; } finally { savePromise.current = null; setSaving(false); }
  }, [adopt, refreshList]);
  const flush = useCallback(async () => { await save(); if (unsaved.current) await save(); return current.current; }, [save]);
  const perform = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成'); } finally { setBusy(''); }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (publicAuthRequired && (!auth.initialized || !auth.session)) return;
        if (publicAuthRequired && auth.session) await syncPublicServerSession(auth.session.access_token);
        const [list, modelStatus] = await Promise.all([api<ProjectSummary[]>('/api/projects'), api<Status>('/api/status')]);
        let preferred = '';
        try { preferred = localStorage.getItem('sop-current-project') || ''; } catch {}
        const activeProjects = list.filter(p => !p.archivedAt);
        const id = activeProjects.find(p => p.id === preferred)?.id || activeProjects[0]?.id || list.find(p => p.id === preferred)?.id || list[0]?.id;
        const p = id ? await api<Project>(`/api/projects/${id}`) : await api<Project>('/api/projects', { method: 'POST', body: '{}' });
        if (!cancelled) { setStatus(modelStatus); adopt(p); setShowArchived(Boolean(p.archivedAt)); setStep(p.rewrite ? 2 : p.analysis ? 1 : 0); await refreshList(); }
      } catch (e) { if (!cancelled) setBootError(e instanceof Error ? e.message : '无法连接工作台'); }
    })();
    return () => { cancelled = true; };
  }, [adopt, refreshList, auth.initialized, auth.session?.access_token]);
  useEffect(() => { if (project?.id) { try { localStorage.setItem('sop-current-project', project.id); } catch {} } }, [project?.id]);
  useEffect(() => {
    if (!supabase) { setAuth({ ...initialAuthState, initialized: true }); return; }
    let cancelled = false;
    const callback = readAuthCallback();
    const applySession = (session: SailAuthState['session'], status = '', error = '') => {
      if (!cancelled) setAuth(current => ({ ...current, initialized: true, session, user: session?.user || null, status, error }));
    };
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      const failure = callback.error || error;
      applySession(data.session, callback.active && data.session ? '登录成功' : '', failure ? authErrorMessage(failure) : '');
      if (callback.active) {
        clearAuthCallback();
        if (data.session) { setShowLanding(false); setAuthOpen(false); }
        else { setAuthOpen(true); if (!failure) setAuth(current => ({ ...current, error: '登录授权未完成，请重新开始登录。' })); }
      }
    }).catch(error => { if (!cancelled) { applySession(null, '', authErrorMessage(error)); if (callback.active) { clearAuthCallback(); setAuthOpen(true); } } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setAuth(current => ({ ...current, initialized: true, session, user: session?.user || null,
        ...(event === 'SIGNED_OUT' ? { status: '已退出登录', error: '' } : {}) }));
      if (publicAuthRequired && !session) setShowLanding(true);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!publicAuthRequired || !auth.initialized) return;
    if (!auth.session) { void syncPublicServerSession(null).catch(() => {}); return; }
    void syncPublicServerSession(auth.session.access_token).catch(error => {
      setAuth(current => ({ ...current, error: error instanceof Error ? error.message : '登录状态同步失败，请重新登录。' }));
    });
  }, [auth.initialized, auth.session?.access_token]);
  useEffect(() => {
    if (!authOpen) return;
    let alive = true;
    void loadAuthAvailability().then(value => { if (alive) setAuthAvailability(value); }).catch(() => { if (alive) setAuthAvailability(unknownAuthAvailability); });
    return () => { alive = false; };
  }, [authOpen]);
  useEffect(() => {
    const tick = () => setAuthResendSeconds(Math.max(0, Math.ceil((authResendAt - Date.now()) / 1000)));
    tick(); if (authResendAt <= Date.now()) return;
    const timer = window.setInterval(() => { tick(); if (authResendAt <= Date.now()) window.clearInterval(timer); }, 1000);
    return () => window.clearInterval(timer);
  }, [authResendAt]);
  useEffect(() => {
    if (!dirty || busy || project?.job?.status === 'running') return;
    const timer = setTimeout(() => { void save().catch(e => setError(e.message)); }, 1000);
    return () => clearTimeout(timer);
  }, [project, dirty, busy, save]);
  const sendAuthCode = async () => {
    if (!supabase || authRequest.current || authResendAt > Date.now()) return;
    const email = authEmailValue.trim();
    if (!validEmail(email)) { setAuth(current => ({ ...current, error: '请填写有效的邮箱地址。', status: '' })); return; }
    authRequest.current = true;
    setAuth(current => ({ ...current, busy: true, error: '', status: '正在发送验证码…' }));
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
      setAuthEmailValue(email); setAuthCode(''); setAuthStage('code'); setAuthResendAt(Date.now() + 60000);
      setAuth(current => ({ ...current, status: '验证码已发送，请检查邮箱。', error: '' }));
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setAuth(current => ({ ...current, busy: false })); }
  };
  const signInWithWechat = async () => {
    if (!supabase || authRequest.current) return;
    authRequest.current = true;
    setAuth(current => ({ ...current, busy: true, error: '', status: '正在打开微信扫码登录…' }));
    try {
      const availability = await loadAuthAvailability(); setAuthAvailability(availability);
      if (!availability.wechat) { setAuth(current => ({ ...current, status: '', error: '微信登录暂未开通，请使用邮箱验证码登录。' })); return; }
      await flush();
      const url = await startWechatSignIn();
      window.location.assign(url);
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setAuth(current => ({ ...current, busy: false })); }
  };
  const verifyAuthCode = async () => {
    if (!supabase || authRequest.current || !validEmailCode(authCode)) return;
    authRequest.current = true;
    setAuth(current => ({ ...current, busy: true, error: '', status: '正在验证…' }));
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: authEmailValue.trim(), token: authCode, type: 'email' });
      if (error) throw error;
      if (!data.session || !data.user) throw new Error('登录未完成');
      setAuth(current => ({ ...current, session: data.session, user: data.user, status: '登录成功', error: '' }));
      setAuthCode(''); setAuthStage('email'); setAuthOpen(false); setShowLanding(false);
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setAuth(current => ({ ...current, busy: false })); }
  };
  const signOut = async () => {
    if (!supabase || authRequest.current) return;
    authRequest.current = true;
    setAuth(current => ({ ...current, busy: true, status: '正在退出…', error: '' }));
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setAuth(current => ({ ...current, session: null, user: null, status: '已退出登录', error: '' }));
      setAuthCode(''); setAuthEmailValue(''); setAuthStage('email'); setAuthOpen(false);
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setAuth(current => ({ ...current, busy: false })); }
  };
  const openAuth = () => { setAuthOpen(true); setAuthStage(auth.user ? 'email' : authStage); setAuthEmailValue(authEmail(auth.user) || authEmailValue); };
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (unsaved.current) { e.preventDefault(); } };
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void save().catch(err => setError(err.message)); } };
    window.addEventListener('beforeunload', unload); window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('keydown', shortcut); };
  }, [save]);
  const taskRunning = project?.job?.status === 'running';
  const running = taskRunning || !!project && workflowBusy(project);
  useEffect(() => {
    if ((project?.productionMode || 'veo-native') !== 'tts-subtitles') return;
    let cancelled = false;
    void api<TtsVoice[]>('/api/tts/voices').then(voices => { if (!cancelled) setTtsVoices(voices); }).catch(error => {
      if (!cancelled) setError(error instanceof Error ? error.message : '本机音色读取失败。');
    });
    return () => { cancelled = true; };
  }, [project?.productionMode]);
  useEffect(() => {
    if (!running || !project) return;
    const id = project.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const p = await api<Project>(`/api/projects/${id}`);
        if (cancelled || current.current?.id !== id) return;
        failures = 0; adopt(p);
        if (p.job?.status === 'running' || workflowBusy(p)) timer = setTimeout(poll, 1800);
        else { await refreshList(); if (p.job?.status === 'completed') { setStep(p.job.kind === 'analysis' || p.job.kind === 'analysis-refine' ? 1 : p.job.kind === 'rewrite' || p.job.kind === 'keyframe' ? 2 : 3); setNotice(p.job.message); } }
      } catch (e) { if (!cancelled) { failures++; setError(failures > 2 ? '暂时无法获取任务进度，正在重新连接…' : '连接暂时中断，任务仍可能在后台运行。'); timer = setTimeout(poll, 4000); } }
    };
    timer = setTimeout(poll, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [running, project?.id, adopt, refreshList]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 3600); return () => clearTimeout(t); } }, [notice]);
  useEffect(() => {
    if (step !== 0 || !focusTarget || busy || running) return;
    const field = document.getElementById(focusTarget);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'center' });
    setFocusTarget(null);
  }, [step, focusTarget, busy, running]);
  const switchProject = (id: string) => perform('正在打开创意', async () => { setShowMediaLibrary(false);
    await flush(); const p = await api<Project>(`/api/projects/${id}`); adopt(p); setDirty(false); unsaved.current = false;
    setStep(p.rewrite ? 2 : p.analysis ? 1 : 0); setSelectedShot(0); setSelectedRewrite(0); setSidebarOpen(false); setShowRequiredErrors(false); setFocusTarget(null); setObserving(false);
  });
  const newProject = (demo = false, parentId = current.current?.parentProjectId || projectGroups[0]?.id || '') => {
    setError(''); setOrganizationDialog({ kind: 'creative-new', parentId, title: demo ? '随行冷萃杯 · 美国市场' : '', demo });
  };
  const submitOrganization = (title: string, parentId: string) => perform('正在保存', async () => {
    if (!organizationDialog) return;
    await flush();
    if (organizationDialog.kind === 'project-new') {
      const group = await api<WorkspaceProject>('/api/workspace/projects', { method: 'POST', body: JSON.stringify({ title }) });
      await refreshList(); setOrganizationDialog({ kind: 'creative-new', parentId: group.id, title: '' });
      return;
    }
    if (organizationDialog.kind === 'project-edit') {
      const group = projectGroups.find(item => item.id === parentId);
      if (!group) throw new Error('找不到这个项目，请刷新后再试。');
      await api<WorkspaceProject>(`/api/workspace/projects/${parentId}`, { method: 'PUT', body: JSON.stringify({ title, revision: group.revision }) });
      await refreshList();
    } else if (organizationDialog.kind === 'creative-edit') {
      change(creative => ({ ...creative, title, parentProjectId: parentId })); await flush();
    } else {
      const demo = Boolean(organizationDialog.demo);
      const p = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ demo, parentProjectId: parentId, title }) });
      adopt(p); setShowMediaLibrary(false); setDirty(false); unsaved.current = false; setStep(demo ? 1 : 0); setSelectedShot(0); setSelectedRewrite(0); setShowRequiredErrors(false); setFocusTarget(null); setObserving(false); setShowArchived(false); await refreshList(); setSidebarOpen(false);
    }
    setOrganizationDialog(null);
  });
  const setProjectArchived = (id: string, archived: boolean) => perform(archived ? '正在归档创意' : '正在恢复创意', async () => {
    await flush();
    const updated = await api<Project>(`/api/projects/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived }) });
    if (current.current?.id === id) adopt(updated);
    await refreshList();
    setNotice(archived ? '创意已归档，可在已归档创意中恢复' : '创意已恢复到所属项目');
  });
  const selectWorkflowMode = (mode: WorkflowMode) => perform('正在切换制作方式', async () => {
    let p = await flush(); if (!p) return;
    if (mode === 'automatic' && !p.workflowMode && !p.rewrite) { change(current => ({ ...current, productionMode: 'tts-subtitles' })); p = await flush(); if (!p) return; }
    adopt(await api<Project>(`/api/projects/${p.id}/workflow/mode`, { method: 'POST', body: JSON.stringify({ mode }) }));
    setObserving(false); setStep(p.rewrite ? 2 : p.analysis ? 1 : 0);
  });
  const startAutomatic = (maxNewClips: number) => perform('正在开始自动制作', async () => {
    const p = await flush(); if (!p) return;
    const next = nextWorkflowAction(p, 'keyframes');
    if (!status.configured && next.kind !== 'completed') { setModal('settings'); return; }
    adopt(await api<Project>(`/api/projects/${p.id}/workflow/start`, { method: 'POST', body: JSON.stringify({ maxNewClips: 0, target: 'keyframes' }) }));
    setObserving(false);
  });
  const inspectWorkflow = () => { setObserving(true); setStep(project?.rewrite ? 2 : project?.analysis ? 1 : 0); };
  const enterWorkspace = (create = false, mode?: WorkflowMode) => {
    if (publicAuthRequired && !auth.session) { setAuthOpen(true); return; }
    setShowLanding(false); setSidebarOpen(false); if (create) void newProject(); else if (mode) void selectWorkflowMode(mode);
  };
  const uploadFiles = (files: FileList | File[], kind: 'video' | 'product') => {
    const list = Array.from(files);
    return perform(kind === 'video' && list.some(file => file.size >= 8 * 1024 * 1024) ? '正在上传并压缩视频' : '正在上传素材', async () => {
      const p = await flush(); if (!p) return;
      if (kind === 'video' && list.length !== 1) throw new Error('每个创意使用一条参考视频。');
      if (kind === 'product' && p.assets.filter(a => a.kind === 'product').length + list.length > 3) throw new Error('最多上传 3 张产品/主体参考图。');
      for (const file of list) {
        const max = kind === 'video' ? 250 : 10;
        if (file.size > max * 1024 * 1024) throw new Error(`文件过大：${kind === 'video' ? '视频' : '图片'}最多 ${max} MB。`);
        const form = new FormData(); form.append('file', file);
        adopt(await api<Project>(`/api/projects/${p.id}/assets/${kind}`, { method: 'POST', body: form }));
      }
      await refreshList(); mediaChanged(); setNotice('素材已收录到所有媒体');
      void syncMediaLibrary(auth.user).catch(error => setNotice(error instanceof Error ? error.message : '素材已收录，云端同步暂未完成。'));
    });
  };
  const openAssetLibrary = (target: 'all' | 'image' | 'video', item: LibraryMedia | null = null) => {
    setInitialMedia(item); setAssetLibraryTarget(target);
  };
  const referenceMedia = async (item: LibraryMedia) => {
    if (busy || running || observing) throw new Error('当前创意正在处理，请等待完成或接管制作后引用素材。');
    const kind = item.kind === 'video' ? 'video' : 'product';
    if (assetLibraryTarget !== 'all' && assetLibraryTarget !== item.kind) throw new Error('请选择与当前入口匹配的素材。');
    setBusy('正在引用素材'); setError('');
    try {
      const p = await flush(); if (!p) throw new Error('请先打开一个创意。');
      if (p.archivedAt) throw new Error('请先恢复当前创意，再引用素材。');
      if (kind === 'product' && p.assets.filter(asset => asset.kind === 'product').length >= 3) throw new Error('最多使用 3 张产品/主体参考图，请先移除一张。');
      let updated: Project;
      if (item.filename) updated = await api<Project>(`/api/projects/${p.id}/library-assets`, { method: 'POST', body: JSON.stringify({ mediaId: item.id }) });
      else {
        const file = await libraryFile(item);
        const form = new FormData(); form.append('file', file);
        updated = await api<Project>(`/api/projects/${p.id}/assets/${kind}?source=library`, { method: 'POST', body: form });
      }
      adopt(updated); setShowMediaLibrary(false); setStep(0); mediaChanged();
      await refreshList(); setNotice('素材已添加到当前创意');
      void syncMediaLibrary(auth.user).catch(error => setNotice(error instanceof Error ? error.message : '素材已引用，云端同步暂未完成。'));
    } finally { setBusy(''); }
  };
  useImagePaste(imageUploadBoxes, workspaceView === 'steps' && step === 0 && !busy && !running && !observing && !modal && !showPipeline && !authOpen && !showLanding && !assetLibraryTarget && !showMediaLibrary, files => { void uploadFiles(files, 'product'); });
  const removeAsset = (id: string) => perform('正在移除素材', async () => { const p = await flush(); if (p) adopt(await api<Project>(`/api/projects/${p.id}/assets/${id}`, { method: 'DELETE' })); });
  const startJob = (kind: 'analysis' | 'analysis-refine' | 'rewrite') => perform('正在准备任务', async () => {
    const p = await flush(); if (!p) return;
    if (!status.configured && (kind === 'analysis' || kind === 'analysis-refine' || p.promptFlow !== 'direct-analysis')) { setModal('settings'); return; }
    adopt(await api<Project>(`/api/projects/${p.id}/jobs/${kind}`, { method: 'POST', body: '{}' }));
    setStep(kind === 'analysis' || kind === 'analysis-refine' ? 1 : 2);
  });
  const startKeyframe = (shotId: string) => perform('正在准备复刻关键帧', async () => {
    const p = await flush(); if (!p) return;
    if (!status.configured) { setModal('settings'); return; }
    adopt(await api<Project>(`/api/projects/${p.id}/keyframes/${shotId}`, { method: 'POST', body: '{}' }));
    setStep(2);
  });
  const retryJob = () => {
    if (!project?.job) return;
    if (project.job.kind === 'generation') retryGeneration();
    else if (project.job.kind === 'composition') retryComposition();
    else if (project.job.kind === 'keyframe' && project.job.shotId) void startKeyframe(project.job.shotId);
    else if (project.job.kind !== 'keyframe') void startJob(project.job.kind);
  };
  const startGeneration = (unitId: string, config: VeoConfig) => perform('正在提交 Veo 3.1', async () => {
    const p = await flush(); if (!p) return;
    if (!status.videoGeneration.configured || p.promptFlow !== 'direct-analysis' && !status.keyframeStorage?.configured) { setModal('settings'); return; }
    adopt(await api<Project>(`/api/projects/${p.id}/generations`, { method: 'POST', body: JSON.stringify({ unitId, ...config }) }));
    setStep(3);
  });
  const startShotVideo = (shotId: string) => {
    const p = current.current; if (!p?.rewrite) return;
    const unit = buildVeoPlan(p.rewrite.shots).find(unit => unit.sourceShotIds[0] === shotId);
    if (!unit) return;
    void startGeneration(unit.id, { mode: 'i2v', prompt: editableUnitPrompt(p, unit),
      resolution: p.automaticSettings?.resolution || '720p', aspectRatio: p.market.aspectRatio === '16:9' ? '16:9' : '9:16' });
  };
  const recoverGeneration = (videoId: string) => perform('正在恢复 Veo 3.1 成片', async () => {
    const p = await flush(); if (!p) return;
    if (!status.videoGeneration.configured) { setModal('settings'); return; }
    adopt(await api<Project>(`/api/projects/${p.id}/generations/${videoId}/recover`, { method: 'POST', body: '{}' }));
    setStep(3);
  });
  const composeFinal = (voice: string, timingApproval?: string) => perform('正在准备本机合成', async () => {
    const p = await flush(); if (!p) return;
    adopt(await api<Project>(`/api/projects/${p.id}/compose`, { method: 'POST', body: JSON.stringify({ voice, timingApproval }) }));
    setStep(3);
  });
  const composeUnit = (videoId: string, voice: string) => perform('正在给已生成画面配音并烧录字幕', async () => {
    const p = await flush(); if (!p) return;
    adopt(await api<Project>(`/api/projects/${p.id}/generations/${videoId}/compose`, { method: 'POST', body: JSON.stringify({ voice }) }));
    setStep(3);
  });
  const retryComposition = () => {
    const voice = project?.ttsVoice || '';
    const sources = project ? productionSources(project) : [];
    if (sources.length && sources.every(Boolean)) { void composeFinal(voice); return; }
    const source = [...(project?.generatedVideos || [])].reverse().find(video => video.productionMode === 'tts-subtitles' && video.status === 'completed' && !!project && videoCurrent(project, video) && !(project?.composedVideos || []).some(rendered => rendered.unitId === video.unitId && rendered.sourceVideoIds[0] === video.id && (!voice || rendered.voice === voice) && !rendered.stale));
    if (source) void composeUnit(source.id, voice);
    else void composeFinal(voice);
  };
  const retryGeneration = () => {
    if (project?.generatedVideos.some(video => video.id === project.job?.videoId && video.productionMode === 'tts-subtitles' && video.status === 'completed' && videoCurrent(project, video))) { retryComposition(); return; }
    const failed = [...(project?.generatedVideos || [])].reverse().find(video => video.provider === 'veo-3.1' && video.status === 'failed' && !!project && videoCurrent(project, video));
    if (failed?.requestId) void recoverGeneration(failed.id);
    else if (failed?.unitId) void startGeneration(failed.unitId, { mode: failed.mode || 't2v', resolution: failed.resolution || '720p', aspectRatio: failed.aspectRatio === '16:9' ? '16:9' : '9:16', prompt: failed.prompt, ...(failed.mode && failed.mode !== 't2v' ? { images: failed.imageUrls || [] } : {}) });
  };
  const go = (n: number) => perform('正在保存', async () => { setShowMediaLibrary(false); const p = await flush(); if (p?.workflowMode === 'automatic') setObserving(true); setStep(n); setSidebarOpen(false); });
  const fillProductField = (id: string) => perform('正在打开产品资料', async () => {
    await flush(); setShowRequiredErrors(true); setStep(0); setFocusTarget(id); setSidebarOpen(false);
  });
  const exportZip = () => perform('正在打包', async () => {
    const p = await flush(); if (!p) return;
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    const response = await fetch(`/api/projects/${p.id}/export`, { credentials: 'same-origin', headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
    if (!response.ok) throw new Error((await response.json()).error);
    downloadBlob(await response.blob(), `${p.title}.zip`); setNotice('提示词包已导出');
  });
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setNotice('已复制'); } catch { setError('浏览器未允许复制，请使用下载按钮。'); } };

  const landingImages = [
    '/assets/landing/workflow-merchant-daylight.png',
    '/assets/landing/workflow-creator-rooftop.png',
    '/assets/landing/workflow-localization.png',
    '/assets/landing/workflow-creator-team.png',
    '/assets/landing/hero-creator-v2.png',
    '/assets/landing/market-creator-v2.png',
    '/assets/landing/social-commerce-toys.png',
    '/assets/landing/social-commerce-travel.png',
    '/assets/landing/models-ambient-v2.png',
    '/assets/landing/product-earbuds-black-creator.png',
    '/assets/landing/product-aroma-south-asian.png',
    '/assets/landing/product-projector-east-asian.png',
    '/assets/landing/product-tote-middle-eastern.png',
    '/assets/landing/global-shipping.png',
    '/assets/landing/smart-home.png',
    '/assets/landing/beauty-demo.png',
    '/assets/landing/outdoor-creator.png',
    '/assets/landing/market-filming.png',
  ];
  if (showLanding || (!project && publicAuthRequired && !auth.session)) return <div className="landing-page">
    <header className="landing-nav">
      <button className="landing-brand" onClick={() => setShowLanding(true)} aria-label="回到首页"><span>AI-Sail Flow</span></button>
      <nav className="landing-links" aria-label="首页导航"><a href="#overview">概览</a><a href="#models">模型</a><a href="#features">功能</a><a href="#tools">工具</a><a href="#creator">Flow 创作营</a><a href="#pricing">价格</a></nav>
      <div className="landing-social"><span aria-label="X">𝕏</span><span aria-label="Instagram">◎</span><span aria-label="Discord">◉</span><button aria-label="更多选项">⋮</button><button className="landing-account" onClick={openAuth}>{auth.user ? authDisplayName(auth.user) : '登录'}</button></div>
    </header>
    <main className="landing-hero" id="overview">
      <div className="landing-mosaic" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => <div className={`landing-tile landing-tile-${i + 1}`} key={i}><img src={landingImages[i % landingImages.length]} alt="" /></div>)}
      </div>
      <div className="landing-shade" />
      <section className="landing-copy">
        <h1>AI-Sail Flow</h1>
        <p>您的专属 AI 出海内容工作室，基于<br />真实视频理解与市场洞察打造而成。</p>
        <div className="landing-workflow-actions"><button className="landing-cta" onClick={() => enterWorkspace(false, 'automatic')}><span>自动制作视频</span><ArrowRight size={18} /></button><button className="landing-cta" onClick={() => enterWorkspace(false, 'manual')}><span>进入 AI-Sail Flow 制作</span><span className="landing-cta-arrow"><ArrowRight size={17} /></span></button></div>
        <small className="landing-disclaimer"><ShieldCheck size={13} /> {publicAuthRequired ? '邮箱验证后即可访问 · 登录用户共用工作区' : '本地部署 · 素材保存在你的设备'}</small>
      </section>
      <a className="landing-scroll" href="#made" aria-label="继续探索"><span>向下探索</span><ArrowDownToLine size={17} /></a>
    </main>
    <section className="gf-intro" id="made">
      <SectionBackdrop src="/assets/landing/market-creator-v2.png" className="gf-intro-backdrop" />
      <div className="gf-intro-copy"><h2>成就您的<br />出海创意之作</h2><p>从一条真实参考视频出发，把有效镜头、产品表达和购买动机变成可执行的全球内容方案。</p></div>
      <div className="gf-intro-frame"><StudioMockup variant="gallery" images={landingImages} /></div>
    </section>

    <section className="gf-models" id="models">
      <SectionBackdrop src="/assets/landing/models-ambient-v2.png" className="gf-models-backdrop" />
      <div className="gf-centered-heading"><span>模型</span><h2>我们的模型</h2><p>画面、动作、商品、口播与音轨在同一次分析中被理解，<br />再转换成可以复用的创意结构。</p></div>
      <article className="gf-omni-panel">
        <SectionBackdrop src="/assets/landing/models-ambient-v2.png" className="gf-omni-backdrop" />
        <div className="gf-omni-copy"><small>NATIVE MULTIMODAL VIDEO</small><h3>Gemini 3.8 Flash</h3><p>完整视频和音轨一起输入，理解镜头节奏、口播、商品展示与购买引导，把参考创意拆成可执行的内容资产。</p><div><button onClick={() => enterWorkspace()}>使用 AI-Sail Flow</button><button className="ghost">了解模型</button></div></div>
        <span className="gf-omni-badge">VIDEO · AUDIO · PRODUCT CONTEXT</span>
      </article>
    </section>

    <section className="gf-features" id="features">
      <SectionBackdrop src="/assets/landing/product-projector-east-asian.png" className="gf-features-backdrop" />
      <div className="gf-section-label">功能</div>
      <div className="gf-feature-tabs"><span>方案</span><span>创作</span><span>打磨</span><button onClick={() => enterWorkspace(true)}>使用 AI-Sail Flow 开始创作</button></div>
    </section>

    <section className="gf-tools" id="tools">
      <SectionBackdrop src="/assets/landing/product-earbuds-black-creator.png" className="gf-tools-backdrop" />
      <div className="gf-centered-heading"><span>工具</span><h2>用自然语言构建内容工具</h2><p>无需切换十几个应用。描述你想完成的任务，<br />让工作流围绕素材和目标市场组织起来。</p></div>
      <div className="gf-tools-layout">
        <article className="gf-tool-preview"><img src="/assets/landing/product-earbuds-black-creator.png" alt="自然语言内容工具预览" /><div className="gf-tool-preview-shade" /><div className="gf-tool-preview-copy"><small>AI-SAIL TOOL</small><h3>Add your product here</h3><p>把产品放进真实使用情境，再补充当地语言的利益点和行动引导。</p><span>Gemini 3.8 Flash</span></div></article>
        <div className="gf-tool-list">{landingTools.map((tool, index) => <div key={tool}><span>{tool}</span><small>{String(index + 1).padStart(2, '0')}</small><button onClick={() => enterWorkspace(index === 9)}>探索</button></div>)}</div>
      </div>
      <button className="gf-outline-cta" onClick={() => enterWorkspace(true)}>使用 AI-Sail Flow 构建内容 <ArrowRight size={17} /></button>
    </section>

    <section className="gf-creator" id="creator">
      <div className="gf-creator-backdrop" aria-hidden="true">{[landingImages[4], landingImages[6], landingImages[1], landingImages[3], landingImages[0]].map((src, index) => <img src={src} alt="" key={src} className={`creator-image-${index + 1}`} />)}</div>
      <div className="gf-creator-scrim" />
      <div className="gf-creator-grid">
        <div className="gf-creator-list"><h2>Flow<br />创作营</h2><button>DTC 品牌团队</button><button>TikTok Shop 卖家</button><button className="active">独立站增长团队</button><button>海外社媒代理商</button></div>
        <div className="gf-creator-about"><p>面向真实出海任务的创意工作流。参考内容提供方法，产品事实和目标市场决定最终表达。</p><button onClick={() => enterWorkspace()}>进入工作台</button></div>
        <article className="gf-creator-story"><img src="/assets/landing/workflow-creator-team.png" alt="商家与达人共同制作出海视频" /><div><span>创作者案例</span><h3>把一条参考片，变成团队今天就能执行的方案。</h3><p>从镜头理解到本地化改写，再到制作资料包，全部保留在同一个创意中。</p><div><button aria-label="上一个案例">←</button><button aria-label="下一个案例">→</button></div></div></article>
      </div>
    </section>

    <section className="gf-pricing" id="pricing">
      <div className="gf-centered-heading"><h2>价格</h2><p>本地版当前开放体验；云端与团队方案将在验证后公布。</p><button className="gf-small-outline" onClick={() => enterWorkspace()}>使用 AI-Sail Flow</button></div>
      <div className="gf-plan-grid">{landingPlans.map((plan, index) => <article key={plan.name} className={index === 0 ? 'active' : ''}><span>{plan.name}</span><small>{plan.note}</small><div className="gf-plan-price">{plan.price}</div><button onClick={() => enterWorkspace()}>{index === 0 ? '立即开始' : '登记意向'}</button><ul>{plan.features.map(feature => <li key={feature}><Check size={13} />{feature}</li>)}</ul></article>)}</div>
      <p className="gf-pricing-note">* 后续方案、额度和价格以正式发布信息为准。</p>
    </section>

    <section className="gf-faq">
      <h2>有疑问?</h2>
      <div>{[
        ['AI-Sail Flow 会保存我的视频吗？', publicAuthRequired ? '公网部署版本会把项目和上传素材保存在授权工作区；只有获准登录的账号可以访问。' : '本地部署版本把上传素材、项目和导出结果保存在你的设备中。'],
        ['Gemini 3.8 Flash 如何理解完整视频？', '视频与音轨通过原生多模态格式一起输入，用于识别镜头、口播、产品展示和节奏。'],
        ['生成的方案可以直接交给制作团队吗？', '可以。导出包包含分镜、字幕草稿、制作简报和视频生成提示词。'],
      ].map(([question, answer]) => <details key={question}><summary><span>{question}</span><Plus size={18} /></summary><p>{answer}</p></details>)}</div>
    </section>
    <footer className="gf-footer"><strong>AI-Sail Flow</strong><span>本地部署 · Gemini 3.8 Flash · V1</span><nav><a href="#overview">回到顶部</a><button onClick={() => enterWorkspace()}>进入工作台</button></nav></footer>
    <AuthDialog availability={authAvailability} resendSeconds={authResendSeconds} open={authOpen} onClose={() => setAuthOpen(false)} auth={auth} email={authEmailValue} code={authCode} stage={authStage} onEmailChange={setAuthEmailValue} onCodeChange={setAuthCode} onSendCode={() => { void sendAuthCode(); }} onVerifyCode={() => { void verifyAuthCode(); }} onWechatSignIn={() => { void signInWithWechat(); }} onBack={() => { setAuthStage('email'); setAuthCode(''); setAuth(current => ({ ...current, error: '', status: '' })); }} onSignOut={() => { void signOut(); }} />
  </div>;
  if (!project) return <div className="boot-screen"><div className="brand-icon"><img src="/assets/brand/ai-sail-flow-mark.png" alt="" /></div><h1>AI-Sail Flow</h1>{bootError ? <><p className="error-text">{bootError}</p><button className="btn" onClick={() => location.reload()}>重新连接</button></> : <><LoaderCircle className="spin" /><p>正在打开工作台…</p></>}</div>;
  const video = project.assets.find(a => a.kind === 'video');
  const productImages = project.assets.filter(a => a.kind === 'product');
  const disabled = !!busy || running || observing;
  const autoView = project.workflowMode === 'automatic' && !observing;
  const manualView = project.workflowMode === 'manual' || observing;
  const canvasView = workspaceView === 'canvas' && !!project.workflowMode;
  const missingProductFields = [
    ...(!project.product.name.trim() ? [{ id: 'product-name', label: '产品名称' }] : []),
    ...(!project.product.facts.trim() ? [{ id: 'product-facts', label: '已确认的卖点与规格' }] : []),
    ...(!productImages.length ? [{ id: 'product-references', label: '产品参考图' }] : []),
  ];
  const rewriteBlocked = !project.analysis || ((project.promptFlow || 'localized') === 'localized' && missingProductFields.length > 0);
  const available = [true, !!video || !!project.analysis, !!project.analysis, !!project.rewrite];
  const market = countries.find(c => c.code === project.market.country)!;
  const platform = platforms.find(p => p.id === project.market.platform)!;
  const shot = project.analysis?.shots[Math.min(selectedShot, project.analysis.shots.length - 1)];

  const updateShot = (index: number, patch: Partial<Shot>, localized = false) => change(p => {
    if (localized && p.rewrite) return { ...p, rewrite: { ...p.rewrite, shots: p.rewrite.shots.map((s, i) => i === index ? { ...s, ...patch } : s) } };
    if (p.analysis) {
      const shotId = p.analysis.shots[index]?.id;
      const timingChanged = shotId && (patch.start !== undefined || patch.end !== undefined);
      const suggestions = { ...p.analysisReview?.suggestions };
      if (timingChanged) delete suggestions[shotId];
      return { ...p, analysis: { ...p.analysis, shots: p.analysis.shots.map((s, i) => i === index ? { ...s, ...patch } : s) }, ...(timingChanged ? { analysisReview: { pendingIds: [...new Set([...(p.analysisReview?.pendingIds || []), shotId])], suggestions } } : {}) };
    }
    return p;
  });
  const seek = (seconds: number) => { if (player.current) { const details = player.current.closest('details'); if (details) details.open = true; player.current.currentTime = seconds; player.current.focus(); } };
  const previewVideo = (compact = false) => <div key={video?.id} className={`video-stage ${compact ? 'compact' : ''} ${video ? 'adaptive' : ''}`} style={video ? { '--video-ratio': video.width && video.height ? video.width / video.height : 16 / 9 } as CSSProperties : undefined}>
    {video ? <video key={video.id} ref={player} src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" onLoadedMetadata={event => {
      const media = event.currentTarget;
      if (media.videoWidth > 0 && media.videoHeight > 0) media.style.setProperty('--video-ratio', String(media.videoWidth / media.videoHeight));
    }} aria-label="参考视频播放器" /> : <div className="demo-frame"><Clapperboard size={38} strokeWidth={1.2} /><span>{project.isDemo ? '示例分镜' : '暂无参考视频'}</span><small>{project.isDemo ? '以下为手写示例，非 AI 分析结果' : '上传后可在这里播放原片'}</small></div>}
  </div>;
  const sceneEditor = (s: Shot, index: number, localized = false) => <div className="scene-editor" key={`${localized}-${s.id}`}>
    <div className="scene-heading"><span className="scene-index">{String(index + 1).padStart(2, '0')}</span><h3>{roles[s.role]}</h3><Badge>{localized ? project.market.language : '原片记录'}</Badge></div>
    <div className="form-grid three"><Field label="开始 / 秒"><Input type="number" min="0" step="0.1" value={s.start} disabled={disabled} onChange={e => updateShot(index, { start: Number(e.target.value) }, localized)} /></Field><Field label="结束 / 秒"><Input type="number" min="0" step="0.1" value={s.end} disabled={disabled} onChange={e => updateShot(index, { end: Number(e.target.value) }, localized)} /></Field><Field label="镜头作用"><select className="input" value={s.role} disabled={disabled} onChange={e => updateShot(index, { role: e.target.value as Shot['role'] }, localized)}>{Object.entries(roles).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field></div>
    <Field label="画面与场景"><Textarea rows={2} value={s.visual} disabled={disabled} onChange={e => updateShot(index, { visual: e.target.value }, localized)} /></Field>
    <Field label="人物 / 产品动作"><Textarea rows={2} value={s.action} disabled={disabled} onChange={e => updateShot(index, { action: e.target.value }, localized)} /></Field>
    <div className="form-grid"><Field label="口播"><Textarea rows={3} value={s.narration} placeholder="无口播" disabled={disabled} onChange={e => updateShot(index, { narration: e.target.value }, localized)} /></Field><Field label={localized ? '字幕文案' : '画面文字'}><Textarea rows={3} value={s.onScreenText} placeholder="无画面文字" disabled={disabled || (localized && !project.market.subtitles)} onChange={e => updateShot(index, { onScreenText: e.target.value }, localized)} /></Field></div>
    <div className="form-grid"><Field label="主体与外观"><Textarea rows={2} value={s.subject || ''} disabled={disabled} onChange={e => updateShot(index, { subject: e.target.value }, localized)} /></Field><Field label="动效 / 合成"><Textarea rows={2} value={s.effects || ''} disabled={disabled} onChange={e => updateShot(index, { effects: e.target.value }, localized)} /></Field></div>
    <Field label="转场 / 分段依据"><Textarea rows={2} value={s.transition || ''} disabled={disabled} onChange={e => updateShot(index, { transition: e.target.value }, localized)} /></Field>
    {localized && <Field label="复刻关键帧指令 · English" hint="描述适合图生视频的起始画面；修改后需重新生成对应关键帧。"><Textarea rows={3} value={(s as NonNullable<Project['rewrite']>['shots'][number]).keyframePrompt || ''} disabled={disabled} onChange={event => change(p => ({ ...p, rewrite: { ...p.rewrite!, shots: p.rewrite!.shots.map((shot, i) => i === index ? { ...shot, keyframePrompt: event.target.value } : shot) } }))} /></Field>}
    {!localized && <Field label="镜头重建 Prompt" hint="用于重建当前镜头；旧分析会根据现有描述整理，可直接编辑。"><Textarea rows={5} value={shotReconstructionPrompt(s)} disabled={disabled} onChange={e => updateShot(index, { reconstructionPrompt: e.target.value })} /></Field>}
    <details className="advanced"><summary>镜头、声音与产品细节 <ChevronDown size={14} /></summary><div className="details-body"><Field label="镜头语言"><Textarea rows={2} value={s.camera} disabled={disabled} onChange={e => updateShot(index, { camera: e.target.value }, localized)} /></Field><Field label="声音"><Input value={s.sound} disabled={disabled} onChange={e => updateShot(index, { sound: e.target.value }, localized)} /></Field><Field label="产品呈现"><Textarea rows={2} value={s.productPresence} disabled={disabled} onChange={e => updateShot(index, { productPresence: e.target.value }, localized)} /></Field><Field label="待确认内容"><Input value={s.uncertainty} disabled={disabled} onChange={e => updateShot(index, { uncertainty: e.target.value }, localized)} /></Field>{localized && <Field label="视频生成指令 · English"><Textarea rows={4} value={(s as Shot & { generationPrompt: string }).generationPrompt} disabled={disabled} onChange={e => change(p => ({ ...p, rewrite: { ...p.rewrite!, shots: p.rewrite!.shots.map((a, i) => i === index ? { ...a, generationPrompt: e.target.value } : a) } }))} /></Field>}</div></details>
  </div>;

  const splitAnalysisShot = (index: number) => change(p => {
    const source = p.analysis?.shots[index];
    if (!source || source.end - source.start < .4 || p.analysis!.shots.length >= 120) return p;
    const middle = Math.round((source.start + source.end) * 50) / 100;
    const shots = [...p.analysis!.shots];
    const newId = crypto.randomUUID();
    shots.splice(index, 1, { ...source, end: middle, reconstructionPrompt: undefined, evidenceFrames: source.evidenceFrames?.filter(frame => frame.at < middle) },
      { ...source, id: newId, start: middle, reconstructionPrompt: undefined, evidenceFrames: source.evidenceFrames?.filter(frame => frame.at >= middle) });
    const suggestions = { ...p.analysisReview?.suggestions };
    delete suggestions[source.id];
    return { ...p, analysis: { ...p.analysis!, shots }, analysisReview: { pendingIds: [...new Set([...(p.analysisReview?.pendingIds || []), source.id, newId])], suggestions } };
  });
  const applyShotTimings = (updatedShots: Shot[], selectedIndex: number) => {
    change(p => {
      if (!p.analysis) return p;
      const previous = new Map(p.analysis.shots.map(shot => [shot.id, shot]));
      const ids = new Set(updatedShots.map(shot => shot.id));
      const changedIds = new Set(updatedShots.filter(shot => {
        const old = previous.get(shot.id);
        return !old || old.start !== shot.start || old.end !== shot.end;
      }).map(shot => shot.id));
      const pendingIds = [...new Set([...(p.analysisReview?.pendingIds || []).filter(id => ids.has(id)), ...changedIds])];
      const suggestions = { ...p.analysisReview?.suggestions };
      for (const id of Object.keys(suggestions)) if (!ids.has(id) || changedIds.has(id)) delete suggestions[id];
      return { ...p, analysis: { ...p.analysis, shots: updatedShots }, analysisReview: { pendingIds, suggestions } };
    });
    setSelectedShot(selectedIndex);
    setTimelineOpen(false);
    setNotice('镜头时间线已更新，正在保存');
  };
  const acceptShotSuggestion = (shotId: string) => change(p => {
    const suggestion = p.analysisReview?.suggestions[shotId];
    if (!p.analysis || !suggestion) return p;
    const { analyzedAt: _analyzedAt, source: _source, ...fields } = suggestion;
    const suggestions = { ...p.analysisReview!.suggestions };
    delete suggestions[shotId];
    return { ...p, analysis: { ...p.analysis, shots: p.analysis.shots.map(shot => shot.id === shotId ? { ...shot, ...fields, focusPoints: mergeFocusPoints(shot.focusPoints, fields.focusPoints) } : shot) }, analysisReview: { ...p.analysisReview!, suggestions } };
  });
  const dismissShotSuggestion = (shotId: string) => change(p => {
    if (!p.analysisReview?.suggestions[shotId]) return p;
    const suggestions = { ...p.analysisReview.suggestions };
    delete suggestions[shotId];
    return { ...p, analysisReview: { ...p.analysisReview, suggestions } };
  });
  const updateGlobalFocus = (points: FocusPoint[]) => change(p => p.analysis ? { ...p, analysis: { ...p.analysis, focusPoints: points } } : p);
  const updateShotFocus = (shotId: string, points: FocusPoint[]) => change(p => p.analysis ? { ...p, analysis: { ...p.analysis, shots: p.analysis.shots.map(shot => shot.id === shotId ? { ...shot, focusPoints: points } : shot) } } : p);
  const acceptGlobalFocusSuggestion = () => change(p => {
    if (!p.analysis || !p.analysisReview?.globalFocusSuggestion) return p;
    return { ...p, analysis: { ...p.analysis, focusPoints: mergeFocusPoints(p.analysis.focusPoints, p.analysisReview.globalFocusSuggestion) }, analysisReview: { ...p.analysisReview, globalFocusSuggestion: undefined } };
  });
  const dismissGlobalFocusSuggestion = () => change(p => p.analysisReview ? { ...p, analysisReview: { ...p.analysisReview, globalFocusSuggestion: undefined } } : p);
  const productionPanel = null;

  const parentProject = projectGroups.find(group => group.id === project.parentProjectId);
  const sidebarIsCollapsed = sidebarCollapsed && !sidebarOpen;
  const editParentProject = (group: WorkspaceProject) => { setError(''); setOrganizationDialog({ kind: 'project-edit', parentId: group.id, title: group.title }); };
  const editCreative = () => { setError(''); setOrganizationDialog({ kind: 'creative-edit', parentId: project.parentProjectId || '', title: project.title }); };
  return <div className={`app-shell ${sidebarIsCollapsed ? 'sidebar-collapsed' : ''}`}>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside id="workspace-sidebar" aria-label="工作区导航" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand" title="AI-Sail Flow"><span className="brand-compact" aria-hidden="true">SF</span><div className="brand-icon"><img src="/assets/brand/ai-sail-flow-mark.png" alt="" /></div><div><strong>AI-Sail Flow</strong><span>跨境内容工作台</span></div><Badge>V1</Badge></div>
      <div className="workspace-picker" title={defaultWorkspace.title}><span className="workspace-avatar workspace-brand-avatar"><AnimatedBrandMark /></span><span>{defaultWorkspace.title}<small>项目与创意</small></span></div>
      <button type="button" className={`nav-item sidebar-media-button ${showMediaLibrary ? 'active' : ''}`} aria-label="所有媒体" title="所有媒体" aria-pressed={showMediaLibrary} disabled={!!busy} onClick={() => { setShowMediaLibrary(true); setSidebarOpen(false); }}><Grid2X2 size={18} /><span>所有媒体</span></button>
      <ProjectNavigation collapsed={sidebarIsCollapsed} onExpand={() => { setSidebarCollapsed(false); }} groups={projectGroups} creatives={projects} currentId={project.id} currentParentId={project.parentProjectId} busy={!!busy} running={running} showArchived={showArchived} onShowArchived={setShowArchived}
        onNewProject={() => { setError(''); setOrganizationDialog({ kind: 'project-new', parentId: '', title: '' }); }} onRenameProject={editParentProject} onNewCreative={parentId => newProject(false, parentId)} onSelect={switchProject} onArchive={setProjectArchived} />
      <section className="sidebar-current-project" aria-labelledby="sidebar-current-project-title">
        <span className="sidebar-project-caption">当前创意</span>
        <div className="sidebar-project-heading"><Clapperboard size={16} /><strong id="sidebar-current-project-title" title={project.title}>{project.title}</strong>{project.archivedAt && <Badge>已归档</Badge>}</div>
        <nav className="workflow-nav" aria-label="制作流程">{steps.map((s, i) => { const Icon = s.icon; return <button key={s.en} className={`nav-item ${!showMediaLibrary && step === i ? 'active' : ''}`} aria-label={s.name} title={s.name} disabled={!!busy || (!canvasView && !available[i])} onClick={() => { setShowMediaLibrary(false); if (canvasView) setStep(i); else void go(i); }}><Icon size={18} /><span>{s.name}</span><span className="nav-number">0{i + 1}</span></button>; })}</nav>
      </section>
      <button className="sidebar-config" title="配置" aria-label="配置" onClick={() => setModal('config')}><Settings size={16} /><span>配置</span></button>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-btn sidebar-toggle desktop-sidebar-toggle" aria-label={sidebarIsCollapsed ? '展开侧边栏' : '收起侧边栏'} title={sidebarIsCollapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!sidebarIsCollapsed} aria-controls="workspace-sidebar" onClick={() => { setSidebarOpen(false); setSidebarCollapsed(!sidebarIsCollapsed); }}><SidebarToggleIcon expanded={!sidebarIsCollapsed} /></button><button className="icon-btn sidebar-toggle mobile-menu" aria-label={sidebarOpen ? '关闭导航' : '打开导航'} title={sidebarOpen ? '关闭导航' : '打开导航'} aria-expanded={sidebarOpen} aria-controls="workspace-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><SidebarToggleIcon expanded={sidebarOpen} /></button><FolderOpen size={16} /><span>{defaultWorkspace.title}</span><ChevronRight size={14} /><button className="breadcrumb-project" onClick={() => parentProject && editParentProject(parentProject)} disabled={!!busy} title="重命名项目">{parentProject?.title || '默认项目'}</button><ChevronRight size={14} /><button className="breadcrumb-current breadcrumb-creative" onClick={editCreative} disabled={disabled} title="编辑创意名称与所属项目">{project.title}</button></div><div className="topbar-actions"><span className="save-status">{saving ? <LoaderCircle size={14} className="spin" /> : dirty ? <span className="unsaved-dot" /> : <CheckCheck size={14} />}{saving ? '保存中' : dirty ? '待保存' : '已保存'}</span><button className="icon-btn" title="保存创意 ⌘S" aria-label="保存创意" disabled={disabled || !dirty} onClick={() => perform('正在保存', async () => { await flush(); setNotice('已保存'); })}><Save size={17} /></button><span className="topbar-divider" /><button className="btn small" onClick={() => newProject()} disabled={!!busy}><Plus size={15} />新建创意</button><button className="account-chip" onClick={openAuth}><span>{auth.user ? authDisplayName(auth.user).slice(0, 1).toUpperCase() : <Mail size={14} />}</span>{auth.user ? authDisplayName(auth.user) : '登录'}</button></div></header>
      <main className={showMediaLibrary ? 'media-workspace-main' : canvasView ? 'canvas-workspace-main' : undefined}>
        {showMediaLibrary ? <MediaLibraryPage user={auth.user} onSelect={item => openAssetLibrary('all', item)} onUpload={() => openAssetLibrary('all')} onSignIn={openAuth} /> : <>
        {project.archivedAt && <div className="banner sample"><Archive size={16} /><span>此创意已归档，素材和制作结果仍保存在本机。</span><button disabled={!!busy || running} onClick={() => setProjectArchived(project.id, false)}>恢复到所属项目 <ArchiveRestore size={14} /></button></div>}
        <div className="workspace-controls">{project.workflowMode && <div className="workflow-control-bar"><span>制作方式</span><button className={`btn small ${project.workflowMode === 'automatic' ? 'selected' : ''}`} disabled={!!busy} onClick={() => observing && project.workflowMode === 'automatic' ? setObserving(false) : void selectWorkflowMode('automatic')}><Sparkles size={15} />自动工作流</button><button className={`btn small ${project.workflowMode === 'manual' ? 'selected' : ''}`} disabled={!!busy || project.workflow?.status === 'pausing'} onClick={() => void selectWorkflowMode('manual')}><Settings2 size={15} />{workflowBusy(project) ? '接管并进入手动' : '手动工作流'}</button></div>}<div className="workspace-view-switch" role="group" aria-label="工作台视图"><button type="button" aria-pressed={workspaceView === 'steps'} className={workspaceView === 'steps' ? 'active' : ''} onClick={() => { setWorkspaceView('steps'); if (!available[step]) setStep(project.rewrite ? 3 : project.analysis ? 1 : 0); }}><LayoutList size={15} />步骤视图</button><button type="button" aria-pressed={workspaceView === 'canvas'} className={workspaceView === 'canvas' ? 'active' : ''} onClick={() => setWorkspaceView('canvas')}><Workflow size={15} />画布视图</button></div></div>
        {(canvasView || autoView || !project.workflowMode) && error && <div className="banner error" role="alert"><Info size={16} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
        {project.ttsTimingNotice && <SpeechTimingConfirmation notice={project.ttsTimingNotice} disabled={disabled} onConfirm={() => void composeFinal(project.ttsTimingNotice!.voice, project.ttsTimingNotice!.basis)} onManual={() => void selectWorkflowMode('manual')} />}
        {!project.workflowMode && <WorkflowEntry disabled={!!busy} onSelect={mode => void selectWorkflowMode(mode)} />}
        {autoView && !canvasView && <AutomaticWorkspace key={project.id} project={project} busy={!!busy || !!assetLibraryTarget} voices={ttsVoices} connected={status.configured} onPatch={patch => change(p => ({ ...p, ...patch }))} onUpload={(files, kind) => void uploadFiles(files, kind)} onChooseMedia={kind => openAssetLibrary(kind === 'product' ? 'image' : 'video')} onStart={max => void startAutomatic(max)} onTakeOver={() => void selectWorkflowMode('manual')} onInspect={inspectWorkflow} onCanvas={() => setShowPipeline(true)} onSettings={() => setModal('settings')} />}
        {canvasView && <Suspense fallback={<div className="canvas-loading" role="status"><LoaderCircle className="spin" size={20} />正在打开全局画布…</div>}><CreativeWorkspace key={project.id} project={project} step={step} onStep={setStep} disabled={disabled || !!assetLibraryTarget} busyLabel={busy} automatic={autoView} voices={ttsVoices}
          onPatch={patch => change(p => ({ ...p, ...patch }))} onUpload={(files, kind) => void uploadFiles(files, kind)} onChooseMedia={kind => openAssetLibrary(kind === 'product' ? 'image' : 'video')} onRemove={id => void removeAsset(id)}
          onGenerateKeyframe={shotId => void startKeyframe(shotId)} onRun={kind => void startJob(kind)} onRetry={retryJob}
          onExport={exportZip} onCopy={value => void copy(value)} onSettings={() => setModal('settings')} onPipeline={() => setShowPipeline(true)}
          onAutoStart={max => void startAutomatic(max)} onTakeOver={() => void selectWorkflowMode('manual')} renderShotEditor={sceneEditor} production={productionPanel}
          onSplitShot={splitAnalysisShot} onAcceptSuggestion={acceptShotSuggestion} onDismissSuggestion={dismissShotSuggestion} onAcceptGlobalSuggestion={acceptGlobalFocusSuggestion} onDismissGlobalSuggestion={dismissGlobalFocusSuggestion} onRefine={() => void startJob('analysis-refine')} selectedShot={selectedShot} selectedRewrite={selectedRewrite} onSelectShot={setSelectedShot} onSelectRewrite={setSelectedRewrite} /></Suspense>}
        {manualView && !canvasView && <>
        {project.workflow?.status === 'pausing' && <div className="banner sample" role="status"><LoaderCircle size={16} className="spin" /><span>正在等待当前任务结束。完成后会停止自动推进，并开放编辑。</span></div>}
        {observing && <div className="workflow-observing"><Eye size={18} /><p>正在只读查看制作过程。自动任务继续执行；接管后可以编辑已有结果。</p><button className="btn small" onClick={() => setObserving(false)}>返回自动制作</button><button className="btn small" disabled={!!busy || project.workflow?.status === 'pausing'} onClick={() => void selectWorkflowMode('manual')}>接管并编辑</button><button className="btn small" onClick={() => setShowPipeline(true)}>查看输入与输出</button></div>}
        <div className="page-heading sail-shader-surface"><ShaderBackdrop variant="heading" /><div><div className="eyebrow">CREATIVE WORKSPACE <span>/</span> 0{step + 1}</div><h1>{steps[step].title}</h1><p>{steps[step].description}</p></div><button className="model-badge" onClick={() => setModal('settings')}><Sparkles size={15} /><span>{step >= 2 ? 'Gemini · 改写与关键帧' : 'Gemini 3.8 Flash'}</span><span className={`connection-dot ${status.configured ? 'configured' : ''}`} /></button></div>
        <div className="stepper" aria-label="工作流步骤">{steps.map((s, i) => <button key={s.en} className={`step-item ${step === i ? 'current' : ''} ${i < step ? 'passed' : ''}`} disabled={!available[i] || !!busy} onClick={() => go(i)}><span className="step-circle">{i < step ? <Check size={14} /> : i + 1}</span><span>{s.name}</span>{i < 3 && <ChevronRight className="step-chevron" size={16} />}</button>)}</div>
        {project.isDemo && <div className="banner sample"><Info size={16} /><span>当前是手写示例创意，用于体验编辑与导出；不是 Gemini 对真实视频的分析。</span><button onClick={() => newProject()}>新建自己的创意 <ArrowRight size={14} /></button></div>}
        {error && <div className="banner error" role="alert"><Info size={16} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
        {project.job?.status === 'failed' && <div className="banner error" role="alert"><Info size={16} /><span>{project.job.message}</span><button disabled={disabled} onClick={retryJob}>重试</button></div>}
        {taskRunning && <div className="job-banner" role="status"><div className="job-text"><LoaderCircle size={18} className="spin" /><div><strong>{project.job!.kind === 'analysis' ? '正在理解参考视频' : project.job!.kind === 'analysis-refine' ? '正在分析变动镜头' : project.job!.kind === 'rewrite' ? '正在逐镜头改写并生成关键帧' : project.job!.kind === 'keyframe' ? '正在生成复刻关键帧' : project.job!.kind === 'composition' ? '正在本机合成配音与字幕' : 'Veo 3.1 正在生成分镜'}</strong><span>{project.job!.message}</span></div><span className="job-percent">{project.job!.progress}%</span></div><div className="job-track"><span style={{ width: `${project.job!.progress}%` }} /></div></div>}
        {step !== 1 && <div className="project-title-row"><span className="tiny-label">创意名称</span><input aria-label="创意名称" value={project.title} maxLength={120} disabled={disabled} onChange={e => change(p => ({ ...p, title: e.target.value }))} /><span className="project-id">{project.id.slice(0, 8).toUpperCase()}</span></div>}

        {step === 0 && <div className="workspace-grid materials-grid">
          <section className="panel materials-reference"><div className="panel-heading"><div><Video size={18} /><h2>参考视频</h2></div><div className="asset-library-inline-actions"><span className="secondary-label">镜头与节奏</span><button type="button" className="text-button" disabled={disabled} onClick={() => openAssetLibrary('video')}><FolderOpen size={14} />素材库</button></div></div>
              {video ? <><div className="video-file-bar"><Film size={15} /><span>{video.name}</span><button className="text-button" disabled={disabled} onClick={() => openAssetLibrary('video')}>更换视频</button></div>{previewVideo()}<div className="video-metadata"><span>{timeLabel(video.duration || 0)} 时长</span><span>{video.width} × {video.height}</span><span>{sizeLabel(video.size)}</span><span>{video.hasAudio ? '含音轨' : '无音轨'}</span></div></> : <button className={`upload-drop ${dragging ? 'dragging' : ''}`} disabled={disabled} onClick={() => openAssetLibrary('video')} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled && e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files, 'video'); }}><div className="upload-visual"><span className="upload-outline back" /><span className="upload-outline front"><Film size={27} strokeWidth={1.4} /></span><span className="upload-plus"><Plus size={13} /></span></div><strong>拖入一条值得拆解的视频</strong><span>或点击从素材库选择</span><small>MP4、MOV、WebM · 最长 10 分钟 · 最大 250 MB</small></button>}
              <div className="panel-footnote"><ScanLine size={15} /><span>分析画面与原始音轨，提取镜头、动作、口播和商品展示。</span></div>
          </section>
          <section className="panel brief-panel"><div className="panel-heading"><div><Package size={18} /><h2>你的产品</h2></div><span className="secondary-label">信息与外观</span></div><div className="panel-body">
            <div className="materials-basic-fields"><Field label="产品名称 · 必填" error={showRequiredErrors && !project.product.name.trim() ? '请填写要推广的产品名称' : undefined} errorId="product-name-error"><Input id="product-name" required aria-invalid={showRequiredErrors && !project.product.name.trim()} aria-describedby={showRequiredErrors && !project.product.name.trim() ? 'product-name-error' : undefined} placeholder="例如：便携冷萃咖啡杯" value={project.product.name} disabled={disabled} onChange={e => updateProduct({ name: e.target.value })} /></Field>
            <Field label="产品类别"><select className="input" value={project.product.category} disabled={disabled} onChange={e => updateProduct({ category: e.target.value })}>{['家居生活', '美妆个护', '服饰配件', '数码配件', '户外运动', '宠物用品', '其他'].map(c => <option key={c}>{c}</option>)}</select></Field></div>
            <Field label="已确认的卖点与规格 · 必填" hint="写具体事实。参考片里的功效、价格不会自动变成你的产品卖点。" error={showRequiredErrors && !project.product.facts.trim() ? '请填写已确认的产品卖点或规格' : undefined} errorId="product-facts-error"><Textarea id="product-facts" required aria-invalid={showRequiredErrors && !project.product.facts.trim()} aria-describedby={showRequiredErrors && !project.product.facts.trim() ? 'product-facts-error' : undefined} rows={3} placeholder={'例如：\n500 ml 容量\n滤网可拆卸清洗\n杯盖采用旋拧结构'} value={project.product.facts} disabled={disabled} onChange={e => updateProduct({ facts: e.target.value })} /></Field>
            <Field label="目标购买人群" hint="他们在什么情境下，会需要这个产品？"><Textarea rows={2} placeholder="例如：想在家准备咖啡的通勤人群" value={project.product.audience} disabled={disabled} onChange={e => updateProduct({ audience: e.target.value })} /></Field>
          </div>
            <div className="materials-product-images" id="product-references" tabIndex={-1}><div className="panel-heading"><div><ImagePlus size={18} /><h3>产品/主体参考图</h3><Badge>{project.promptFlow === 'direct-analysis' ? '选填' : '改写必填'}</Badge></div><div className="asset-library-inline-actions"><span className="secondary-label">{productImages.length} / 3</span><button type="button" className="text-button" disabled={disabled || productImages.length >= 3} onClick={() => openAssetLibrary('image')}><FolderOpen size={14} />素材库</button></div></div>
              <div className="product-images" ref={imageUploadBoxes}>{[0, 1, 2].map(i => <div className="product-image-slot" key={i}>{productImages[i] ? <><img src={productImages[i].url} alt={productImages[i].name} /><button className="remove-image" aria-label={`移除 ${productImages[i].name}`} disabled={disabled} onClick={() => removeAsset(productImages[i].id)}><X size={14} /></button><span>{productImages[i].name}</span></> : <button data-image-upload disabled={disabled} aria-label="上传或粘贴产品/主体参考图" onClick={() => openAssetLibrary('image')}><Plus size={23} strokeWidth={1.2} /><span>产品/主体参考图</span><small>选择素材或粘贴图片</small></button>}</div>)}</div>
              <div className="panel-footnote"><Info size={14} /><span>鼠标停在上传框后，按 ⌘V / Ctrl+V 粘贴图片。参考图用于约束产品或主体外观，每张最大 10 MB。</span></div>
            </div>
          </section>
          <div className="materials-help"><div className="insight-card"><span className="tiny-label">创意起点</span><h3>先看见用途，再讲清价值。</h3><p>好的参考片能展示产品如何解决一个具体问题。上传时，优先选择动作完整、声音清晰的片段。</p><button className="text-button" onClick={() => setModal('guide')}>查看创意指南 <ArrowUpRight size={13} /></button></div>
            <button className="demo-invite" onClick={() => newProject(true)} disabled={!!busy}><span className="demo-icon"><CirclePlay size={20} /></span><span><strong>先看看，一条创意如何完成</strong><small>用示例创意体验分镜编辑、本地化和导出</small></span><ArrowUpRight size={19} /></button>
          </div>
        </div>}

        {step === 1 && <div className="breakdown-workspace">
          <details className="panel breakdown-source">
            <summary>
              {project.analysis && <span className="breakdown-source-description">{project.analysis.summary}</span>}
              <span className="breakdown-source-toggle"><Film size={17} />查看完整原片与整体分析<ChevronDown size={15} /></span>
            </summary>
            <div className="breakdown-source-body"><div>{previewVideo(true)}{project.analysis && <div className="video-timeline">{project.analysis.shots.map((s, i) => <button key={s.id} className={selectedShot === i ? 'selected' : ''} style={{ flex: s.end - s.start }} onClick={() => { setSelectedShot(i); seek(s.start); }} title={`${roles[s.role]} ${s.start.toFixed(3)}–${s.end.toFixed(3)} 秒`}>{i + 1}</button>)}</div>}</div><div className="breakdown-source-analysis">{project.analysis ? <><p className="breakdown-source-meta">{project.analysis.duration.toFixed(3)} 秒 · {project.isDemo ? '手写示例' : project.analysisMeta?.mode === 'sampled-frames' ? '抽帧分析' : 'Gemini 视频分析'}</p><h3>原片表达与产品观察</h3>{project.analysis.sellingPoints.map((text, i) => <p key={i}>{text}</p>)}<p>{project.analysis.productAppearance}</p>{!!project.analysis.uncertainties.length && <details><summary>需要核对 · {project.analysis.uncertainties.length} 项</summary>{project.analysis.uncertainties.map((text, i) => <p key={i}>{text}</p>)}</details>}</> : <p>上传参考视频后，Gemini 会按实际剪辑和动作段落整理镜头。每行片段和关键帧都从本机原片截取。</p>}</div></div></details>
          {project.analysis && <section className="panel global-focus-panel"><div className="global-focus-heading"><h2>全片关注重点</h2><small>{(project.analysis.focusPoints || []).filter(point => point.selected).length}/{project.analysis.focusPoints?.length || 0} 项已勾选</small></div><p>AI 给出复刻候选，你可以勾选、订正或补充。已勾选的内容会成为改写与导出的优先要求。</p>{!!project.analysisReview?.globalFocusSuggestion?.length && <div className="global-focus-suggestion"><strong>局部重新分析后，AI 建议更新全片重点</strong><ul>{project.analysisReview.globalFocusSuggestion.map(point => <li key={point.id}>{point.selected ? '☑' : '□'} {point.text}</li>)}</ul><div className="global-focus-actions"><button className="btn small" disabled={disabled} onClick={dismissGlobalFocusSuggestion}>保留当前</button><button className="btn small primary" disabled={disabled} onClick={acceptGlobalFocusSuggestion}>采用 AI 建议</button></div></div>}<FocusPointsEditor points={project.analysis.focusPoints} onChange={updateGlobalFocus} disabled={disabled} onSeek={seek} /></section>}
          <section className="panel scene-panel"><div className="panel-heading"><div><Clapperboard size={18} /><h2>镜头片段与证据</h2><Badge>{project.analysis?.shots.length || 0} 个镜头</Badge></div>{project.analysis && <div className="breakdown-heading-actions"><button className="btn small" disabled={disabled} onClick={() => { player.current?.pause(); setTimelineOpen(true); }}><Scissors size={14} />编辑镜头时间线</button>{!!project.analysisReview?.pendingIds.length && <button className="btn small" disabled={disabled || !video} onClick={() => void startJob('analysis-refine')}><Sparkles size={14} />重新分析变动镜头（{project.analysisReview.pendingIds.length}）</button>}<button className="text-button" disabled={disabled || !video} onClick={() => startJob('analysis')}>重新拆解</button></div>}</div>
            {project.analysis ? <ShotBreakdown project={project} selectedIndex={selectedShot} onSelect={setSelectedShot} onSeek={seek} onCopy={text => void copy(text)} onSplit={splitAnalysisShot} onAcceptSuggestion={acceptShotSuggestion} onDismissSuggestion={dismissShotSuggestion} onFocusChange={updateShotFocus} disabled={disabled} renderEditor={(s, i) => sceneEditor(s, i)} /> : <div className="empty-state"><ScanLine size={38} strokeWidth={1.2} /><h3>{running ? '正在逐段理解视频' : '开始拆解你的参考片'}</h3><p>逐镜头整理片段、证据关键帧与可编辑的观察和 Prompt。</p><button className="btn primary" disabled={disabled || !video} onClick={() => startJob('analysis')}><Sparkles size={16} />{status.configured ? '开始视频拆解' : '连接 Gemini 并开始'}</button></div>}
          </section>
        </div>}

        {step === 2 && <div className="workspace-grid localization-grid"><aside className="detail-column"><RewriteProductInputs project={project} disabled={disabled} onProduct={updateProduct} onChooseMedia={() => openAssetLibrary('image')} /><section className="panel"><div className="panel-heading"><div><Globe2 size={18} /><h2>市场与语言 · 补充设置</h2></div><span className="secondary-label">TARGET</span></div><div className="panel-body">
          <div className="form-grid"><Field label="国家 / 地区"><select className="input" disabled={disabled} value={project.market.country} onChange={e => { const c = countries.find(c => c.code === e.target.value)!; updateMarket({ country: c.code, language: c.language }); }}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field><Field label="目标语言"><select className="input" disabled={disabled} value={project.market.language} onChange={e => updateMarket({ language: e.target.value as Market['language'] })}>{languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field></div>
          <Field label="发布平台"><div className="platform-picker">{platforms.map(p => <button key={p.id} disabled={disabled} className={project.market.platform === p.id ? 'selected' : ''} onClick={() => updateMarket({ platform: p.id, ...(p.id !== 'tiktok' ? { destination: 'website' } : {}) })}>{p.name}</button>)}</div></Field>
          <Field label="购买路径"><select className="input" disabled={disabled} value={project.market.destination} onChange={e => updateMarket({ destination: e.target.value as Market['destination'] })}><option value="website">独立站 / 外部网站</option><option value="shop" disabled={project.market.platform !== 'tiktok'}>TikTok Shop 商品卡</option></select></Field>
          <Field label="实际行动引导" hint="例如：点击广告按钮；或前往主页链接。按实际发布方式填写。"><Textarea rows={2} disabled={disabled} value={project.market.cta} placeholder="你希望观众看完后做什么？" onChange={e => updateMarket({ cta: e.target.value })} /></Field>
        </div></section><section className="panel"><div className="panel-heading"><div><Settings2 size={18} /><h2>分镜生成路径</h2></div></div><div className="panel-body"><div className="production-mode-picker"><button disabled={disabled} className={project.promptFlow === 'direct-analysis' ? 'active' : ''} onClick={() => change(p => ({ ...p, promptFlow: 'direct-analysis', market: { ...p.market, duration: 'original' } }))}><strong>仅整理原片分析</strong><span>只跑 Gemini 视频分析，再整理成可编辑 Prompt；保留原片镜头、台词语言与节奏</span></button><button disabled={disabled} className={(project.promptFlow || 'localized') === 'localized' ? 'active' : ''} onClick={() => change(p => ({ ...p, promptFlow: 'localized' }))}><strong>逐镜头产品与创意改写</strong><span>保留原片镜头数量与顺序，替换产品并生成对应关键帧和描述</span></button></div><div className="form-grid"><Field label="目标时长"><select className="input" disabled={disabled || project.promptFlow === 'direct-analysis'} value={project.market.duration} onChange={e => updateMarket({ duration: e.target.value as Market['duration'] })}><option value="original">保持原时长</option>{['15', '30', '45', '60'].map(t => <option key={t} value={t}>{t} 秒</option>)}</select></Field><Field label="画面比例"><select className="input" disabled={disabled} value={project.market.aspectRatio} onChange={e => updateMarket({ aspectRatio: e.target.value as Market['aspectRatio'] })}>{['9:16', '16:9', '4:5', '1:1'].map(v => <option key={v}>{v}</option>)}</select></Field></div><Field label="人物呈现"><select className="input" disabled={disabled} value={project.market.people} onChange={e => updateMarket({ people: e.target.value as Market['people'] })}><option value="preserve">保留人物角色与构图</option><option value="localize">适配目标市场的角色</option><option value="hands">仅手部 / 产品演示</option></select></Field><Field label="表达语气"><select className="input" disabled={disabled} value={project.market.tone} onChange={e => updateMarket({ tone: e.target.value as Market['tone'] })}><option value="natural">自然分享</option><option value="expert">专业讲解</option><option value="energetic">轻快有活力</option></select></Field><p className="field-hint">镜头数量和顺序始终与原片一一对应；调整时长会按比例缩放各镜头。</p><Toggle label="输出字幕草稿" hint="随提示词包导出 SRT 时间码" checked={project.market.subtitles} disabled={disabled} onChange={subtitles => updateMarket({ subtitles })} /></div></section></aside>
          <div className="main-column"><section className="market-summary"><div className="market-code">{market.code}</div><div><span className="tiny-label">当前创意方向</span><h2>{project.product.name || '你的产品'} <span>→</span> {market.name}</h2><p>{platform.name} · {project.market.language} · {project.market.destination === 'shop' ? '站内商品卡' : '独立站引流'}</p></div><Badge>{project.rewriteStale ? '待更新' : project.rewrite ? '方案已生成' : '待生成'}</Badge></section>{project.promptFlow === 'direct-analysis' && <div className="banner sample"><Info size={16} /><span>当前仅整理原片，不替换产品或生成复刻关键帧。选择“逐镜头产品与创意改写”后，将结合你的产品生成对应画面。</span><button disabled={disabled} onClick={() => change(p => ({ ...p, promptFlow: 'localized' }))}>改写我的产品</button></div>}
            <section className="panel"><div className="panel-heading"><div><Film size={18} /><h2>参考视频复刻要求</h2></div></div><div className="panel-body"><Field label="哪些保持原样" hint="例如场景、主体动作、构图、运镜、剪辑节奏与声音形式。"><Textarea rows={3} disabled={disabled} value={(project.replication || defaultReplication).preserve} onChange={e => updateReplication({ preserve: e.target.value })} /></Field><Field label="哪些允许改变" hint="例如替换衣服或商品、调整模特面孔和少量配色。"><Textarea rows={3} disabled={disabled} value={(project.replication || defaultReplication).change} onChange={e => updateReplication({ change: e.target.value })} /></Field></div></section>
            {project.rewriteStale && <div className="banner sample"><Info size={16} /><span>资料或原片分镜已修改，请重新生成改写方案后导出。</span></div>}
            <ShotRewriteBoard project={project} disabled={disabled} selectedIndex={selectedRewrite} onSelect={setSelectedRewrite} onGenerate={shotId => void startKeyframe(shotId)} renderEditor={sceneEditor} />
            {project.rewrite && <details className="panel rewrite-plan-details"><summary>创意方向、开头备选与全片约束</summary><div className="panel-body"><h3>{project.rewrite.angle}</h3><p className="muted body-copy">{project.rewrite.audienceInsight}</p>{project.rewrite.localizationNotes.map((note, index) => <p key={index}>{note}</p>)}{project.rewrite.productionNotes.map((note, index) => <p className="muted" key={index}>{note}</p>)}<Field label="整体视觉指令 · English"><Textarea rows={4} value={project.rewrite.globalPrompt} disabled={disabled} onChange={event => change(p => ({ ...p, rewrite: { ...p.rewrite!, globalPrompt: event.target.value } }))} /></Field><Field label="避免出现的内容"><Textarea rows={3} value={project.rewrite.negativePrompt} disabled={disabled} onChange={event => change(p => ({ ...p, rewrite: { ...p.rewrite!, negativePrompt: event.target.value } }))} /></Field><div className="hook-options"><span className="tiny-label">开头备选 · 仅在需要口播时应用</span>{project.rewrite.hookVariants.map((hook, index) => <button key={index} disabled={disabled} onClick={() => { updateShot(0, { narration: hook.text, onScreenText: project.market.subtitles ? hook.text : '' }, true); setSelectedRewrite(0); setNotice('已应用到第一个镜头，请检查口播时长'); }}><span className="hook-letter">{String.fromCharCode(65 + index)}</span><span><small>{hook.label}</small><strong>{hook.text}</strong></span></button>)}</div></div></details>}

          </div></div>}

        {step === 3 && project.rewrite && <div className="pipeline-launch"><div><strong>制作过程画布</strong><p>逐节点检查原片分析、分镜改写、Prompt 转换、Veo 请求以及本机配音字幕的输入与输出。</p></div><button className="btn small" type="button" onClick={() => setShowPipeline(true)}><FileJson size={15} />打开流程画布</button></div>}
        {step === 3 && project.rewrite && <div className="workspace-grid export-grid"><section className="panel export-panel"><div className="panel-heading"><div><FileText size={18} /><h2>交付内容预览</h2></div><button className="btn small" onClick={() => copy(exportTab === 'prompt' ? buildPrompt(project) : exportTab === 'brief' ? buildBrief(project) : exportTab === 'json' ? buildVeoPromptPreview(project) : subtitles(project.rewrite!.shots, project.productionMode))}><Copy size={14} />复制</button></div><div className="export-tabs">{[['prompt', '生成提示词'], ['brief', '创意简报'], ['json', '分镜 JSON'], ...((project.market.subtitles || project.productionMode === 'tts-subtitles') ? [['srt', '字幕草稿']] : [])].map(([id, label]) => <button key={id} className={exportTab === id ? 'active' : ''} onClick={() => setExportTab(id)}>{label}</button>)}</div><pre className="code-preview" tabIndex={0}>{exportTab === 'prompt' ? buildPrompt(project) : exportTab === 'brief' ? buildBrief(project) : exportTab === 'json' ? buildVeoPromptPreview(project) : subtitles(project.rewrite.shots, project.productionMode)}</pre><div className="panel-footnote"><Info size={14} /><span>复刻关键帧与描述按原片镜头一一对应；图片可在产品与创意改写阶段检查和重新生成。</span></div></section>{productionPanel}<aside className="detail-column"><section className="panel delivery-card"><div className="delivery-icon"><Package size={28} strokeWidth={1.4} /></div><h2>你的创意制作包</h2><p>从策略到镜头，完整交接。</p><div className="delivery-specs"><div><span>目标市场</span><strong>{market.name} / {project.market.language}</strong></div><div><span>发布平台</span><strong>{platform.name}</strong></div><div><span>画面</span><strong>{project.market.aspectRatio} · {project.rewrite.shots.at(-1)?.end}s</strong></div><div><span>分镜</span><strong>{project.rewrite.shots.length} 个</strong></div></div><div className="file-list">{[[FileText, '创意简报', 'MD'], [FileText, 'Seedance 提示词', 'TXT'], [FileJson, '结构化分镜', 'JSON'], [ScanLine, '原片分析', 'JSON'], ...((project.market.subtitles || project.productionMode === 'tts-subtitles') ? [[Subtitles, '字幕草稿', 'SRT']] : []), [FileJson, '项目清单', 'JSON']].map(([Icon, label, ext], i) => { const FileIcon = Icon as typeof FileText; return <div key={i}><FileIcon size={16} /><span>{label as string}</span><small>{ext as string}</small></div>; })}{productImages.length > 0 && <div><ImagePlus size={16} /><span>产品/主体参考图</span><small>{productImages.length} 张</small></div>}{project.rewrite.shots.some(shot => shot.sourceShotId) && <div><ImagePlus size={16} /><span>复刻关键帧与镜头清单</span><small>{project.rewrite.shots.filter(shot => keyframeCurrent(project, shot)).length} 张</small></div>}</div><button className="btn primary full" disabled={disabled || project.rewriteStale} onClick={exportZip}><Download size={17} />下载完整 ZIP</button>{project.rewriteStale && <p className="error-text">资料已变更，请回到改写页更新方案。</p>}<button className="text-button full centered" disabled={disabled || project.rewriteStale} onClick={() => perform('正在导出', async () => { const p = await flush(); if (!p) return; const files = buildExportFiles(p); downloadBlob(new Blob([files['02-seedance-prompt.txt']], { type: 'text/plain;charset=utf-8' }), `${p.title}-prompt.txt`); })}>仅下载生成提示词 <ArrowDownToLine size={14} /></button></section><div className="insight-card"><span className="tiny-label">制作交接</span><p>按所用视频生成渠道的时长限制分段制作。包装文字与精准字幕可在后期叠加。</p></div></aside></div>}

        <footer className="action-bar"><div className="action-context">{step === 0 ? <><ShieldCheck size={16} /><span>点击拆解后，参考素材将发送给 Gemini 处理</span></> : <><CheckCheck size={16} /><span>{project.isDemo ? '示例可编辑，可导出' : '所有编辑自动保存到本机'}</span></>}</div><div className="action-controls">{step === 2 && (disabled || rewriteBlocked) && <div className="rewrite-requirements" id="rewrite-requirements" role="status" aria-live="polite"><Info size={14} /><span>{disabled ? (running ? '当前任务正在处理，完成后可生成方案。' : busy) : <>生成前请补齐（点击定位）：{!project.analysis && <button type="button" onClick={() => go(video ? 1 : 0)}>视频拆解</button>}{missingProductFields.map((field, i) => <span key={field.id}>{(!project.analysis || i > 0) && '、'}<button type="button" title="前往上传素材页补填" onClick={() => fillProductField(field.id)}>{field.label}</button></span>)}</>}</span></div>}<div className="action-buttons">{step > 0 && <button className="btn" disabled={!!busy} onClick={() => go(step - 1)}>上一步</button>}{step === 0 && <button className="btn primary" disabled={disabled || !video} onClick={() => startJob('analysis')}>{disabled ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}拆解参考视频<ArrowRight size={16} /></button>}{step === 1 && <button className="btn primary" disabled={disabled || !project.analysis} onClick={() => go(2)}>{project.promptFlow === 'direct-analysis' ? '继续设置 Prompt' : '产品与创意改写'}<ArrowRight size={16} /></button>}{step === 2 && <><button className={`btn ${!project.rewrite || project.rewriteStale ? 'primary' : ''}`} disabled={disabled || rewriteBlocked} aria-describedby={disabled || rewriteBlocked ? 'rewrite-requirements' : undefined} onClick={() => startJob('rewrite')}><WandSparkles size={16} />{project.promptFlow === 'direct-analysis' ? project.rewrite && !project.rewriteStale ? '重新整理 Prompt' : '整理原片并生成 Prompt' : project.rewrite ? '重新生成逐镜头方案' : '生成逐镜头方案与关键帧'}</button>{project.rewrite && <button className="btn primary" disabled={disabled || project.rewriteStale} onClick={() => go(3)}>预览交付包<ArrowRight size={16} /></button>}</>}{step === 3 && <button className="btn primary" disabled={disabled || project.rewriteStale} onClick={exportZip}><Download size={16} />导出提示词包</button>}</div></div></footer>
        </>}
        </>}
      </main>
    </div>
    {showPipeline && <PipelineCanvas project={project} onClose={() => setShowPipeline(false)} />}
    {timelineOpen && project.analysis && <ShotTimelineEditor key={project.id} shots={project.analysis.shots} duration={project.analysis.duration} video={video} initialIndex={selectedShot} disabled={disabled} onApply={applyShotTimings} onClose={() => setTimelineOpen(false)} />}
    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
    {busy && <div className="busy-indicator" role="status"><LoaderCircle className="spin" size={14} />{busy}</div>}
    {organizationDialog && <OrganizationForm key={`${organizationDialog.kind}:${organizationDialog.parentId}`} dialog={organizationDialog} groups={projectGroups} busy={!!busy} error={error} onSubmit={submitOrganization} onClose={() => { if (!busy) setOrganizationDialog(null); }} />}
    {modal === 'config' && <Modal title="配置" onClose={() => setModal(null)}>
      <div className="configuration-options">
        <button className="configuration-option" onClick={() => setModal('settings')}><Sparkles size={18} /><span><strong>Gemini 分析与图像生成</strong><small>{status.configured ? '模型已配置' : '配置 Gemini 模型'}</small></span><ChevronRight size={16} /></button>
        <button className="configuration-option" onClick={() => setModal('guide')}><CircleHelp size={18} /><span><strong>创意方法与使用指南</strong><small>查看工作流与创意说明</small></span><ChevronRight size={16} /></button>
      </div>
      <p className="configuration-local-note"><ShieldCheck size={14} />项目与创意资料保存在本机</p>
    </Modal>}
    {modal === 'settings' && <Modal title="模型连接" onClose={() => { setModal(null); setApiKey(''); setVeoApiKey(''); setBaseUrl(''); setStorageKey(''); }}>
      <div className="settings-model"><span className="model-symbol"><Sparkles size={22} /></span><div><h3>Gemini 3.8 Flash</h3><code>{status.model} · 视频理解与改写</code></div><Badge>{status.configured ? '已配置' : '待连接'}</Badge></div>
      <div className="settings-model"><span className="model-symbol"><ImagePlus size={22} /></span><div><h3>复刻关键帧图像模型</h3><code>{status.keyframeModel || 'gemini-3.1-flash-image'}</code></div><Badge>{status.configured ? '沿用 Gemini 连接' : '待连接'}</Badge></div>
      <p className="modal-description">当前先生成逐镜头复刻关键帧。分析、改写和图片生成沿用同一 Gemini 连接；渠道需支持图像模型输出。页面填写的密钥只保存在服务端内存中。</p>
      <Field label="Gemini API Key · 可选"><Input type="password" autoComplete="off" spellCheck={false} placeholder="输入 Gemini API Key 或兼容渠道 Key" value={apiKey} onChange={e => setApiKey(e.target.value)} /></Field>
      <Field label="Gemini 兼容接口地址 · 可选" hint="Agentic 沿用 gemini-3.8-flash:generateContent；中转需要透传 media_processing: AGENTIC"><Input type="url" autoComplete="off" spellCheck={false} placeholder="https://maiai.ai/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></Field>
      <details className="creative-details"><summary>后续视频生成连接（当前无需配置）</summary>
      <div className="settings-model"><span className="model-symbol"><Clapperboard size={22} /></span><div><h3>Veo 3.1 视频生成</h3><code>gaorui.cc/v1/videos · t2v / i2v / r2v</code></div><Badge>{status.videoGeneration.configured ? '已配置' : '待连接'}</Badge></div>
      <Field label="Veo 3.1 API Key · 可选"><Input type="password" autoComplete="off" spellCheck={false} placeholder="输入 gaorui.cc 的 API Key" value={veoApiKey} onChange={e => setVeoApiKey(e.target.value)} /></Field>
      <div className="settings-model"><span className="model-symbol"><ImagePlus size={22} /></span><div><h3>Supabase 私有关键帧存储</h3><code>复刻关键帧 → 临时链接 → 图生视频</code></div><Badge>{status.keyframeStorage?.configured ? '已配置' : '待连接'}</Badge></div>
      <Field label="Supabase 项目地址" hint="默认沿用当前项目的 Supabase 地址。"><Input type="url" autoComplete="off" value={storageUrl || status.keyframeStorage?.url || ''} placeholder="https://your-project.supabase.co" onChange={event => setStorageUrl(event.target.value)} /></Field>
      <Field label="Supabase 服务端存储密钥" hint="填写 secret key 或 service_role key；只保存到服务端内存，重启后需重新填写。"><Input type="password" autoComplete="off" spellCheck={false} value={storageKey} placeholder={status.keyframeStorage?.configured ? '已配置，更新时再填写' : '输入服务端密钥'} onChange={event => setStorageKey(event.target.value)} /></Field>
      <Field label="私有桶名称"><Input autoComplete="off" value={storageBucket || status.keyframeStorage?.bucket || 'sop-keyframes'} onChange={event => setStorageBucket(event.target.value)} /></Field>
      <div className="settings-note"><ShieldCheck size={16} /><p>Veo 使用异步任务接口：提交任务、轮询状态、下载成片到本机。复刻关键帧会自动上传到 Supabase 私有存储，使用临时链接送入对应镜头的图生视频。</p></div>
      </details>
      <div className="modal-actions"><a href="https://gaoruitech.apifox.cn/doc-8981138" target="_blank" rel="noreferrer">Veo 接口文档 <ArrowUpRight size={14} /></a><button className="btn primary" disabled={!!busy || (apiKey.trim().length < 16 && veoApiKey.trim().length < 16 && storageKey.trim().length < 16)} onClick={() => perform('正在配置', async () => { if (apiKey.trim()) await api('/api/settings', { method: 'POST', body: JSON.stringify({ apiKey, baseUrl }) }); if (veoApiKey.trim()) await api('/api/settings/veo', { method: 'POST', body: JSON.stringify({ apiKey: veoApiKey }) }); if (storageKey.trim()) await api('/api/settings/keyframe-storage', { method: 'POST', body: JSON.stringify({ url: storageUrl || status.keyframeStorage?.url, apiKey: storageKey, bucket: storageBucket || status.keyframeStorage?.bucket || 'sop-keyframes' }) }); setStatus(await api<Status>('/api/status')); setApiKey(''); setVeoApiKey(''); setBaseUrl(''); setStorageKey(''); setModal(null); setNotice('模型连接已配置'); })}>保存连接</button></div>
    </Modal>}
    {modal === 'guide' && <Modal title="跨境视频创意指南" wide onClose={() => setModal(null)}><p className="modal-description">把平台的创作原则落实到每个镜头。以下是创意建议，不是流量或转化承诺。</p><div className="guide-grid"><article><span className="guide-number">01</span><h3>用情境吸引注意</h3><p>先让观众识别自己的问题，再用具体动作展示产品价值。采用清晰的开头、主体和行动引导。</p><a href="https://ads.tiktok.com/resources/help/article/creative-best-practices?lang=en" target="_blank" rel="noreferrer">TikTok 创意建议 <ArrowUpRight size={13} /></a></article><article><span className="guide-number">02</span><h3>为竖屏观看设计</h3><p>Reels 优先竖屏、有声音的内容。字幕、商品和关键信息避开界面遮挡，生成后按实际版位检查。</p><a href="https://www.facebook.com/business/ads/facebook-instagram-reels-ads" target="_blank" rel="noreferrer">Meta Reels 创意指南 <ArrowUpRight size={13} /></a></article><article><span className="guide-number">03</span><h3>卖点与产品页一致</h3><p>用目标顾客的语言解释用途与收益，填写真实规格、售价和优惠，让视频承诺与落地页保持一致。</p><a href="https://help.shopify.com/en/manual/products/details/product-descriptions/write" target="_blank" rel="noreferrer">Shopify 产品描述指南 <ArrowUpRight size={13} /></a></article><article><span className="guide-number">04</span><h3>让内容可交接</h3><p>原片拆解与新方案分开保存。修改前提会将旧方案标记为待更新，导出时使用最新的镜头与口播。</p><span className="secondary-label">AI-SAIL FLOW 工作方式</span></article></div><div className="guide-footer"><Info size={15} /><span>当前流程生成逐镜头复刻关键帧与描述，作为后续图生视频的输入。可检查、调整单张图片并导出制作包。</span></div></Modal>}
    <AssetLibrary open={!!assetLibraryTarget} user={auth.user} target={assetLibraryTarget || 'all'} initialSelection={initialMedia} onClose={() => setAssetLibraryTarget(null)} onReference={referenceMedia} onSignIn={() => { setAssetLibraryTarget(null); openAuth(); }} />
    <AuthDialog availability={authAvailability} resendSeconds={authResendSeconds} open={authOpen} onClose={() => setAuthOpen(false)} auth={auth} email={authEmailValue} code={authCode} stage={authStage} onEmailChange={setAuthEmailValue} onCodeChange={setAuthCode} onSendCode={() => { void sendAuthCode(); }} onVerifyCode={() => { void verifyAuthCode(); }} onWechatSignIn={() => { void signInWithWechat(); }} onBack={() => { setAuthStage('email'); setAuthCode(''); setAuth(current => ({ ...current, error: '', status: '' })); }} onSignOut={() => { void signOut(); }} />
  </div>;
}
