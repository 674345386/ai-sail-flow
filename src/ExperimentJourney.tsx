import { useRef } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, Download, FileText, Maximize2, Workflow } from 'lucide-react';
import { activeExperimentMethod, type ExperimentGraph, type ExperimentNode } from '../shared/experiment';
import type { ExperimentReview } from '../shared/experiment-review';
import './experiment-journey.css';

const outcomes = { prepared: '准备完成', iterate: '继续探索', rejected: '需要调整', final: '最终交付' };

function JourneyMedia({ node, onPreview }: { node: ExperimentNode; onPreview: (id: string) => void }) {
  const media = !!node.url && (node.mediaType === 'image' || node.mediaType === 'video');
  if (!media) return null;
  return <figure className={`lab-journey-media is-${node.mediaType}`}>
    {node.mediaType === 'video'
      ? <video controls playsInline preload="none" src={node.url} poster={`${node.url}.jpg`} aria-label={node.title} />
      : <button type="button" onClick={() => onPreview(node.id)} aria-label={`放大查看${node.title}`}><img src={node.url} alt={node.title} loading="lazy" /><Maximize2 size={14} /></button>}
    <figcaption><span>{node.title}</span><a href={node.url} download aria-label={`下载${node.title}`}><Download size={14} /></a></figcaption>
  </figure>;
}

export default function ExperimentJourney({ graph, review, onOpenNode, onPreview }: {
  graph: ExperimentGraph; review: ExperimentReview; onOpenNode: (id: string) => void; onPreview: (id: string) => void;
}) {
  const sections = useRef(new Map<string, HTMLElement>());
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const final = byId.get(review.finalArtifactId);
  const jump = (id: string) => sections.current.get(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
  const last = review.stages.at(-1)!;
  return <div className="lab-journey" aria-label="复刻视频的探索过程">
    <div className="lab-journey-intro">
      <div><h2>{review.title}</h2><p>{review.goal}</p><span>{review.dateLabel}</span></div>
      <button type="button" className="lab-journey-final-link" onClick={() => jump(last.planId)}><Check size={15} />查看最终成片<ArrowDown size={15} /></button>
    </div>
    <nav className="lab-journey-outline" aria-label="探索阶段导航">{review.stages.map((stage, index) => <button type="button" key={stage.planId} onClick={() => jump(stage.planId)}><span>{String(index + 1).padStart(2, '0')}</span>{stage.shortTitle}{index < review.stages.length - 1 && <ArrowRight size={13} />}</button>)}</nav>
    <div className="lab-journey-stages">{review.stages.map((stage, index) => {
      const steps = stage.stepIds.map(id => byId.get(id)).filter((node): node is ExperimentNode => !!node);
      const previews = stage.previewNodeIds.map(id => byId.get(id)).filter((node): node is ExperimentNode => !!node);
      const evidence = graph.nodes.filter(node => node.planId === stage.planId && node.kind !== 'step' && node.kind !== 'compare');
      return <section className={`lab-journey-stage is-${stage.outcome}`} key={stage.planId} ref={element => { if (element) sections.current.set(stage.planId, element); else sections.current.delete(stage.planId); }} aria-labelledby={`journey-heading-${stage.planId}`}>
        <header className="lab-journey-stage-heading"><span className="lab-journey-number">{String(index + 1).padStart(2, '0')}</span><div><h3 id={`journey-heading-${stage.planId}`}>{stage.title}</h3><span>{stage.time}</span></div><span className="lab-journey-outcome">{stage.outcome === 'final' && <Check size={13} />}{outcomes[stage.outcome]}</span></header>
        <div className="lab-journey-stage-body">
          <div className="lab-journey-explanation">
            <p className="lab-journey-approach">{stage.approach}</p>
            <ol className="lab-journey-actions">{stage.actions.map((action, actionIndex) => <li key={actionIndex}>{action}</li>)}</ol>
            <div className="lab-journey-result"><strong>得到什么</strong><p>{stage.result}</p></div>
            {stage.finding && <div className="lab-journey-finding"><strong>{stage.outcome === 'final' ? '保留的边界' : '发现了什么'}</strong><p>{stage.finding}</p>{stage.quote && <blockquote>你当时说：“{stage.quote}”</blockquote>}</div>}
            {stage.decision && <p className="lab-journey-decision"><ArrowDown size={16} /><span><strong>{index === review.stages.length - 1 ? '交付结果' : '所以下一步'}</strong>{stage.decision}</span></p>}
          </div>
          <div className={`lab-journey-previews${previews.length > 1 ? ' has-pair' : ''}`}>{previews.map(node => <JourneyMedia key={node.id} node={node} onPreview={onPreview} />)}</div>
        </div>
        <details className="lab-journey-details"><summary><ChevronDown size={15} />查看本轮完整方法、输入与产物<span>{steps.length} 个步骤 · {evidence.length} 份记录</span></summary>
          <div className="lab-journey-details-body">{steps.map(node => {
            const method = activeExperimentMethod(node);
            const run = graph.runs?.find(item => item.stepId === node.id && item.method.id === method?.id);
            const references = (method?.referenceIds || []).map(id => graph.files?.find(file => file.id === id));
            return <section className="lab-journey-method" key={node.id}><header><h4>{node.title}</h4><button type="button" onClick={() => onOpenNode(node.id)}><Workflow size={13} />在节点画布中查看<ArrowRight size={13} /></button></header>
              {method?.model && <p className="lab-journey-model">模型 / 工具：{method.model}{run && <span> · 历史执行记录</span>}</p>}
              {!!references.length && <div className="lab-journey-inputs"><strong>实际参考图</strong>{references.map((file, i) => file && <a href={file.url} target="_blank" rel="noreferrer" key={`${file.id}-${i}`}>{i + 1}. {file.title}</a>)}</div>}
              {method?.prompt && <details><summary>完整提示词</summary><pre>{method.prompt}</pre></details>}
              {!!method && Object.keys(method.parameters).length > 0 && <details><summary>本轮参数</summary><pre>{JSON.stringify(method.parameters, null, 2)}</pre></details>}
            </section>;
          })}<div className="lab-journey-evidence"><h4>素材、结果与源码</h4>{evidence.map(node => <button type="button" key={node.id} onClick={() => node.url && node.mediaType !== 'text' ? onPreview(node.id) : onOpenNode(node.id)}><FileText size={14} /><span>{node.title}</span><ArrowRight size={13} /></button>)}</div></div>
        </details>
      </section>;
    })}</div>
    {final?.url && <div className="lab-journey-delivery"><Check size={19} /><div><strong>最终交付：{final.title}</strong><p>以上保留每轮尝试、反馈，以及调整制作方法的原因。</p></div><a href={final.url} download><Download size={15} />下载最终视频</a></div>}
  </div>;
}
