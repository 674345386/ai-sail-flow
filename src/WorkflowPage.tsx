import { useEffect, useRef } from 'react';
import { Clapperboard, Grid2X2, LayoutGrid, LoaderCircle, Sparkles, Upload } from 'lucide-react';
import type { Project } from '../shared/domain';
import { StoryboardGridCardBody, gridVideoState } from './StoryboardGridWorkbench';

export type WorkflowSection = 'source' | 'product' | 'analysis-method' | 'analysis-result' | 'production-grid' | 'production-video';
export const workflowSections: WorkflowSection[][] = [['source', 'product'], ['analysis-method', 'analysis-result'], ['production-grid', 'production-video']];

export default function WorkflowPage({ project, disabled, available, target, onVisible, onCanvas, onUploadVideo, onOpenMaterials, onOpenAnalysis, onOpenRemixDetail, onAnalyze, onBreakdownType, onGridSize, onPrompt, onGenerate, onRecover, onIncluded }: {
  project: Project; disabled: boolean; available: boolean[]; target: { id: WorkflowSection; version: number } | null;
  onVisible: (id: WorkflowSection, stage: number) => void; onCanvas: () => void; onUploadVideo: () => void;
  onOpenMaterials: () => void; onOpenAnalysis: () => void; onOpenRemixDetail: () => void; onAnalyze: () => void;
  onBreakdownType: (type: 'shot' | 'storyboard-grid') => void; onGridSize: (size: 3 | 4) => void;
  onPrompt: (id: string, prompt: string) => void; onGenerate: (ids: string | string[]) => void;
  onRecover: (id: string) => void; onIncluded: (id: string, value: boolean) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const video = project.assets.find(asset => asset.kind === 'video');
  const grids = project.storyboardGrids || [];
  const isGrid = project.breakdownType === 'storyboard-grid';
  const included = grids.filter(grid => grid.included !== false);
  const running = project.job?.status === 'running' && project.job.kind.startsWith('analysis');
  const eligible = included.filter(grid => grid.prompt.trim() && !gridVideoState(project, grid).running && !gridVideoState(project, grid).completed.length);
  useEffect(() => {
    if (!target) return;
    const section = scroll.current?.querySelector<HTMLElement>(`[data-workflow-section="${target.id}"]`);
    if (section && scroll.current) scroll.current.scrollTo({ top: section.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top + scroll.current.scrollTop - 24, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [target]);
  const updateVisible = () => {
    const container = scroll.current; if (!container) return;
    const sections = [...container.querySelectorAll<HTMLElement>('[data-workflow-section]')];
    const point = container.getBoundingClientRect().top + Math.min(180, container.clientHeight * .3);
    let selected = sections[0];
    for (const section of sections) if (section.getBoundingClientRect().top <= point) selected = section;
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 4) selected = sections.at(-1) || selected;
    const id = selected?.dataset.workflowSection as WorkflowSection | undefined;
    if (id) onVisible(id, workflowSections.findIndex(group => group.includes(id)));
  };
  return <section className="workflow-page" aria-label="创作流程">
    <header className="workflow-page-header"><div><strong>人物与视频二创</strong><span>向下滚动，逐步完成创作</span></div><button className="workflow-page-button ghost" type="button" onClick={onCanvas}><LayoutGrid size={15} />自由画布</button></header>
    <div className="workflow-page-scroll" ref={scroll} onScroll={updateVisible}>
      <div className="workflow-page-content">
        <section className="workflow-section" data-workflow-section="source"><div className="workflow-section-number">01 / 素材准备</div><h1>从一段视频开始</h1><p className="workflow-lead">选择参考视频，让创作从真实素材出发。</p>
          <div className="workflow-source">{video ? <><video src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" /><div><h3>{video.name}</h3><p>{(video.duration || 0).toFixed(1)} 秒 · {video.width} × {video.height}</p><button className="workflow-page-button" disabled={disabled} onClick={onUploadVideo}>更换视频</button></div></> : <button type="button" className="workflow-upload" disabled={disabled} onClick={onUploadVideo}><Upload size={24} /><strong>选择参考视频</strong><span>MP4 / MOV / WebM · 最长 10 分钟</span></button>}</div>
        </section>
        <section className="workflow-subsection" data-workflow-section="product"><div className="workflow-eyebrow">素材准备 / 产品信息</div><h2>补充产品信息</h2><p>可选，用于后续创作时替换产品卖点。</p><button className="workflow-page-button ghost" disabled={disabled} onClick={onOpenMaterials}>{project.product.name.trim() || '添加产品信息'}</button></section>
        <section className="workflow-section" data-workflow-section="analysis-method"><div className="workflow-section-number">02 / 视频拆解</div><h1>理解每一个画面</h1><p className="workflow-lead">选择适合的拆解方式，整理镜头结构与创作线索。</p>
          <div className="workflow-options"><button type="button" className={!isGrid ? 'is-selected' : ''} disabled={disabled || !available[1]} onClick={() => onBreakdownType('shot')}><Clapperboard size={21} /><strong>逐镜头</strong><span>识别镜头、动作和关键帧</span></button><button type="button" className={isGrid ? 'is-selected' : ''} disabled={disabled || !available[1]} onClick={() => onBreakdownType('storyboard-grid')}><Grid2X2 size={21} /><strong>分镜网格</strong><span>按最长 10 秒一段整理网格与 Prompt</span></button></div>
          {isGrid && <div className="workflow-density"><span>网格密度</span>{([3, 4] as const).map(size => <button key={size} className={(project.storyboardGridSize || 3) === size ? 'is-selected' : ''} disabled={disabled || !available[1]} onClick={() => onGridSize(size)}>{size}×{size}</button>)}</div>}
          <button className="workflow-page-button" disabled={disabled || !available[1]} onClick={onAnalyze}>{running ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{running ? '拆解中' : project.analysis ? '重新拆解' : '开始拆解'}</button>
          {project.job?.kind.startsWith('analysis') && (project.job.status === 'running' || project.job.status === 'failed') && <p role="status" className="workflow-job">{project.job.message}</p>}
        </section>
        <section className="workflow-subsection" data-workflow-section="analysis-result"><div className="workflow-eyebrow">视频拆解 / 拆解结果</div><h2>拆解结果</h2><p>{project.analysis ? isGrid ? `已整理 ${grids.length} 张分镜网格。` : `已整理 ${project.analysis.shots.length} 个镜头。` : '完成拆解后，结果会显示在这里。'}</p>
          {isGrid && grids.length > 0 && <div className="workflow-analysis-grid">{grids.map((grid, index) => <button type="button" key={grid.id} onClick={onOpenAnalysis} disabled={!available[1]}><img src={grid.url} alt={`分镜网格 ${index + 1}`} /><strong>网格 {String(index + 1).padStart(2, '0')}</strong><span>{grid.start.toFixed(1)}–{grid.end.toFixed(1)} 秒</span></button>)}</div>}
          {project.analysis && <button className="workflow-page-button ghost" onClick={onOpenAnalysis} disabled={!available[1]}>查看与编辑拆解结果</button>}
        </section>
        <section className="workflow-section" data-workflow-section="production-grid"><div className="workflow-section-number">03 / {isGrid ? '网格出片' : '二创出片'}</div><h1>让画面开始生成</h1><p className="workflow-lead">{isGrid ? '检查每段分镜与视频 Prompt，然后生成对应视频。' : '为镜头准备人物、关键帧并生成视频。'}</p>
          {isGrid ? <>{included.length ? <div className="workflow-grid-cards">{included.map(grid => <StoryboardGridCardBody key={grid.id} grid={grid} index={grids.indexOf(grid)} project={project} disabled={disabled || !available[2]} onPrompt={onPrompt} onGenerate={onGenerate} onRecover={onRecover} onIncluded={onIncluded} externalVideoResult />)}</div> : <p className="workflow-empty">完成拆解后，已纳入的网格会显示在这里。</p>}
            <button className="workflow-page-button" disabled={disabled || !available[2] || !eligible.length} onClick={() => onGenerate(eligible.map(grid => grid.id))}><Clapperboard size={15} />生成未出片的网格{eligible.length ? `（${eligible.length}）` : ''}</button></> : <button className="workflow-page-button" disabled={!available[2]} onClick={onOpenRemixDetail}>打开关键帧工作台</button>}
        </section>
        <section className="workflow-subsection workflow-output-section" data-workflow-section="production-video"><div className="workflow-eyebrow">{isGrid ? '网格出片' : '二创出片'} / 视频结果</div><h2>生成的视频</h2><p>生成完成后，可在这里预览每一段视频。</p>
          {isGrid && <div className="workflow-video-grid">{included.map((grid, index) => { const state = gridVideoState(project, grid); const result = state.completed.at(-1); return <article key={grid.id}><div className="workflow-video-frame">{state.running ? <span><LoaderCircle className="spin" size={22} />正在生成 {state.progress || 0}%</span> : result ? <video controls playsInline preload="metadata" src={result.url} poster={result.thumbnail} /> : <span>{state.failed ? state.error : '待生成'}</span>}</div><strong>网格 {String(grids.indexOf(grid) + 1 || index + 1).padStart(2, '0')}</strong><small>{result ? `${result.duration.toFixed(1)} 秒 · ${result.model === 'local-test' ? '本地测试视频' : '视频已生成'}` : `${grid.start.toFixed(1)}–${grid.end.toFixed(1)} 秒`}</small></article>; })}</div>}
        </section>
      </div>
    </div>
  </section>;
}
