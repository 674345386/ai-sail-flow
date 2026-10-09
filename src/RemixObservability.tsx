import { useMemo, useState } from 'react';
import { Copy, FileText, GitCompareArrows } from 'lucide-react';
import type { Project, Shot } from '../shared/domain';
import { buildRemixCorrectionPrompt, remixCorrectionCurrent, remixSourceFields, type RemixCorrection } from '../shared/remix';
import PromptDiffDialog, { type PromptDiffEntry, type PromptDiffSelection } from './PromptDiffDialog';

const frameLabels = { first: '首帧', middle: '中间关键帧', last: '尾帧' };
export function analysisModeLabel(project: Project) {
  if (project.isDemo) return '手写示例 · 未分析视频';
  const mode = project.analysisMeta?.mode;
  return mode === 'agentic-video' ? '模型 Agentic 模式分析视频' : mode === 'native-video' ? '模型原生视频分析' : mode === 'sampled-frames' ? '模型抽帧分析' : '视频分析 · 模式未记录';
}
function sourceFields(shot: Shot) {
  return [
    ...Object.entries(remixSourceFields).map(([id, label]) => ({ id, label, original: shot[id as keyof typeof remixSourceFields] || '' })),
    { id: 'narration', label: '原片口播', original: shot.narration },
    { id: 'sound', label: '原片声音', original: shot.sound },
    { id: 'uncertainty', label: '待确认', original: shot.uncertainty },
  ];
}
function sourcePrompt(shot: Shot) {
  return sourceFields(shot).filter(field => field.original).map(field => `${field.label}：${field.original}`).join('\n');
}
function correctionEntries(correction: RemixCorrection): PromptDiffEntry[] {
  const shots = correction.shots.map((shot, index) => {
    const original = correction.sourceShots.find(item => item.id === shot.sourceShotId);
    const evidence = correction.evidence.find(item => item.shotId === shot.sourceShotId);
    return {
      id: shot.sourceShotId, label: `镜头 ${String(index + 1).padStart(2, '0')}`,
      original: original ? sourcePrompt(original) : '', corrected: shot.description,
      fields: original && sourceFields(original).map(field => ({ ...field, corrected: !shot.correctedSource ? undefined : field.id === 'uncertainty' ? shot.uncertainties.join('；') : shot.correctedSource[field.id] ?? field.original })),
      notes: <>{!original && <p>此历史记录缺少原镜头快照，无法还原左侧原文。</p>}{!shot.correctedSource && <p>旧版记录仅保留整段校正提示词，未保存完整校正字段；请选择“完整提示词”查看 Diff。</p>}<details><summary>{shot.changes.length} 条关键帧核对记录 · {shot.uncertainties.length} 条待确认信息</summary>{shot.changes.map((change, i) => <div className="prompt-diff-note" key={i}><strong>{change.sourceField ? remixSourceFields[change.sourceField] : change.field} · {change.kind}{change.kind === '确认' && ' · 保留原文'}</strong><p>{change.corrected}</p>{change.evidencePositions.map(position => { const frame = evidence?.frames.find(item => item.position === position); return frame ? <a key={position} href={frame.url} target="_blank" rel="noreferrer">{frameLabels[position]} · {frame.at.toFixed(3)}s</a> : null; })}</div>)}{shot.uncertainties.map((text, i) => <p key={i}>待确认：{text}</p>)}</details></>,
    };
  });
  return [{ id: 'all', label: '全部镜头', original: shots.map((shot, index) => {
    const source = correction.sourceShots.find(item => item.id === shot.id);
    return `镜头 ${index + 1}（${shot.id}${source ? ` · 原片 ${source.start.toFixed(2)}–${source.end.toFixed(2)}s` : ''}）\n${shot.original}`;
  }).join('\n\n'), corrected: buildRemixCorrectionPrompt(correction) }, ...shots];
}
export function RemixAnalysisResult({ project, onCopy }: { project: Project; onCopy: (text: string) => void }) {
  const [viewer, setViewer] = useState<PromptDiffSelection>();
  const entries = useMemo(() => {
    const shots = project.analysis?.shots.map((shot, index) => ({ id: shot.id, label: `镜头 ${String(index + 1).padStart(2, '0')}`, original: sourcePrompt(shot), fields: sourceFields(shot) })) || [];
    return [{ id: 'all', label: '全部镜头', original: shots.map(shot => `${shot.label}\n${shot.original}`).join('\n\n') }, ...shots];
  }, [project.analysis]);
  if (!project.analysis) return <div className="remix-observation-empty"><FileText size={24} /><p>完成视频拆解后，这里会保存并展示模型提取的镜头信息。</p></div>;
  const meta = project.analysisMeta;
  return <div className="remix-observation-result">
    <div className="remix-observation-meta"><strong>{analysisModeLabel(project)}</strong><span>{project.analysis.shots.length} 个镜头 · {meta?.providerModel || meta?.requestedModel || project.model}</span>{meta && <span>分析时间：{new Date(meta.analyzedAt).toLocaleString()}</span>}</div>
    {meta?.mode === 'agentic-video' && <p className="remix-hint">{meta.agenticTrace ? '接口返回了 Agentic 工具调用标记。' : '本次请求使用 Agentic 模式；接口未返回可核验的工具调用标记。'}</p>}
    <p className="remix-observation-intro">以下内容读取当前视频拆解记录，后续与关键帧校正信息合并。</p>
    <div className="remix-prompt-view-actions"><button className="remix-button" onClick={() => setViewer({ entryId: 'all', mode: 'original' })}><FileText size={13} />查看完整镜头信息</button></div>
    <div className="remix-observation-scroll">{project.analysis.shots.map((shot, index) => <div className="remix-prompt-shot-row" key={shot.id}><strong>镜头 {String(index + 1).padStart(2, '0')}<small>{shot.start.toFixed(2)}–{shot.end.toFixed(2)}s</small></strong><button className="remix-button" onClick={() => setViewer({ entryId: shot.id, mode: 'original' })}><FileText size={13} />查看镜头信息</button></div>)}</div>
    <button className="remix-button" onClick={() => onCopy(JSON.stringify({ analysis: project.analysis, metadata: meta }, null, 2))}><Copy size={13} />复制镜头分析结果</button>
    {viewer && <PromptDiffDialog title="视频镜头分析结果" entries={entries} initial={viewer} onClose={() => setViewer(undefined)} onCopy={onCopy} />}
  </div>;
}
export function RemixCorrectionResult({ project, onCopy, showProcess = true }: { project: Project; onCopy: (text: string) => void; showProcess?: boolean }) {
  const [viewer, setViewer] = useState<PromptDiffSelection>();
  const correction = project.remix?.correction;
  const entries = useMemo(() => correction ? correctionEntries(correction) : [], [correction]);
  const job = project.job?.kind === 'remix-plan' ? project.job : undefined;
  const upstreamFailed = job?.status === 'failed' && job.remixPhase !== 'prompt';
  return <div className="remix-observation-result">
    {showProcess && job?.status === 'running' && <p className="remix-observation-intro" role="status">{job.remixPhase === 'prompt' ? '校正结果已保存，正在编写下游提示词。' : job.message}</p>}
    {showProcess && upstreamFailed && <p className="remix-warning" role="alert">{job.message}</p>}
    {!correction ? <div className="remix-observation-empty"><FileText size={24} /><p>尚无独立校正记录。运行“校正并编写提示词”后，会先保存校正结果，再生成提示词。</p>{project.remix?.plan && <small>历史提示词没有留存此阶段的记录。</small>}</div> : <>
      <div className="remix-observation-meta"><strong>{remixCorrectionCurrent(project) ? '已保存的关键帧校正结果' : '历史校正结果 · 输入已更新'}</strong><span>{correction.shots.length} 个镜头 · {correction.model}</span><span>完成时间：{new Date(correction.completedAt).toLocaleString()}</span><small>记录 ID：{correction.id}</small></div>
      <p className="remix-observation-intro">以原片镜头信息为基础，保留未修改的细节；只应用关键帧支持的补充与原文校正。此处沿用原片时长，10 秒二创编排在下游完成。</p>
      {correction.shots.some(shot => !shot.correctedSource) && <p className="remix-warning">这是旧版整段改写的记录，请重新运行校正，生成保留原分析细节的新版本。</p>}
      {job?.status === 'running' && job.remixPhase !== 'prompt' && <p className="remix-hint">本次校正处理中，下方暂时保留上次已完成的记录。</p>}
      {upstreamFailed && <p className="remix-hint">下方保留的是上次已完成的校正记录。</p>}
      <div className="remix-prompt-view-actions"><button className="remix-button" onClick={() => setViewer({ entryId: 'all', mode: 'corrected' })}><FileText size={13} />查看提示词</button><button className="remix-button" onClick={() => setViewer({ entryId: 'all', mode: 'diff' })}><GitCompareArrows size={13} />提示词修改（校正 Diff）</button></div>
      <div className="remix-observation-scroll">{correction.shots.map((shot, index) => {
        return <details key={shot.sourceShotId} open={index === 0}><summary>镜头 {String(index + 1).padStart(2, '0')} · {shot.changes.length} 条核对记录</summary>
          <div className="remix-prompt-view-actions"><button className="remix-button" onClick={() => setViewer({ entryId: shot.sourceShotId, mode: 'corrected' })}><FileText size={13} />查看提示词</button><button className="remix-button" onClick={() => setViewer({ entryId: shot.sourceShotId, mode: 'diff' })}><GitCompareArrows size={13} />查看校正 Diff</button></div>
          <div className="remix-prompt-change-links">{shot.changes.map((change, changeIndex) => <button key={changeIndex} onClick={() => setViewer({ entryId: shot.sourceShotId, fieldId: shot.correctedSource ? change.sourceField : undefined, mode: 'diff' })}><span>{change.sourceField ? remixSourceFields[change.sourceField] : change.field}</span><small>{change.kind === '确认' ? '确认 · 保留原文' : change.kind}<GitCompareArrows size={12} /></small></button>)}</div>
          {shot.uncertainties.map((text, i) => <p className="remix-warning" key={i}>待核对：{text}</p>)}
        </details>;
      })}</div>
      <div className="remix-result-copy-actions"><button className="remix-button" onClick={() => onCopy(buildRemixCorrectionPrompt(correction))}><Copy size={13} />复制校正后提示词</button><button className="remix-button" onClick={() => onCopy(JSON.stringify(correction, null, 2))}><Copy size={13} />复制校正记录</button></div>
      {viewer && <PromptDiffDialog title="提示词查看与校正对比" entries={entries} initial={viewer} onClose={() => setViewer(undefined)} onCopy={onCopy} />}
    </>}
  </div>;
}
export function RemixObservableResults({ project, onCopy }: { project: Project; onCopy: (text: string) => void }) {
  return <div className="remix-observation-panels"><section><h2>1. 视频镜头分析结果</h2><RemixAnalysisResult project={project} onCopy={onCopy} /></section><section><h2>2. 校正后提示词 · 原片镜头细节</h2><RemixCorrectionResult project={project} onCopy={onCopy} /></section></div>;
}
