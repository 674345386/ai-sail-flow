import { useState } from 'react';
import { FileText, Table2 } from 'lucide-react';
import { referenceSceneTableTitle, type ReferenceSceneFrame, type ReferenceSceneTable } from '../../shared/agent-video-analysis';
import type { VideoCreativeDirection, VideoMasterPrompt, VideoProductionPlan } from '../../shared/video-production';
import { levelInfo } from '../../shared/replication-levels';

const seconds = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });

function SceneScreenshot({ frame, title }: { frame: ReferenceSceneFrame; title: string }) {
  const [failed, setFailed] = useState(false);
  const label = `${title} · ${seconds.format(frame.at)} 秒`;
  return <a className="iua-scene-frame" href={frame.url} target="_blank" rel="noreferrer" aria-label={`打开截图：${label}`} title={label}>
    {failed ? <span>截图加载失败</span> : <img src={frame.url} alt={label} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
  </a>;
}

function PromptText({ label, text }: { label: string; text: string }) {
  const [status, setStatus] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setStatus('已复制'); }
    catch { setStatus('可选中文字后手动复制'); }
  };
  return <div className="iua-production-prompt">
    <div><strong>{label}</strong><button type="button" className="iua-answer-link" aria-label={`复制${label}`} onClick={() => void copy()}>复制</button><span role="status">{status}</span></div>
    <p>{text}</p>
  </div>;
}

function MasterPrompt({ master, label }: { master: VideoMasterPrompt; label: string }) {
  return <details className="iua-production-section">
    <summary>{label}</summary>
    <PromptText label="英文母版 Prompt" text={master.english} />
    <PromptText label="中文母版 Prompt" text={master.chinese} />
    <PromptText label="通用负面词" text={master.negativePrompt} />
    <PromptText label="参数建议" text={master.parameterNotes} />
  </details>;
}

export function ReferenceSceneTablePreview({ table, sourceTitle }: { table: ReferenceSceneTable; sourceTitle?: string }) {
  const shotCount = table.rows.reduce((count, scene) => count + scene.shotCount, 0);
  return <article className="iua-artifact-preview" aria-label={referenceSceneTableTitle}>
    <header><div><Table2 size={18} aria-hidden="true" /><h2>{referenceSceneTableTitle}</h2></div></header>
    <p className="iua-artifact-meta">{table.rows.length} 个场景 · {shotCount} 个镜头 · {seconds.format(table.duration)} 秒{sourceTitle ? ` · ${sourceTitle}` : ''}</p>
    {table.masterPrompt && <MasterPrompt master={table.masterPrompt} label="原片 · 全片母版 Prompt" />}
    <div className="iua-scene-table-scroll" role="region" aria-label="场景与原片截图" tabIndex={0}>
      <table className="iua-scene-table" aria-label="参考视频场景表">
        <thead><tr>
          <th scope="col">#</th>
          <th scope="col">时间（秒）</th>
          <th scope="col">场景</th>
          <th scope="col">画面特征</th>
          <th scope="col">镜头数</th>
          <th scope="col">关键截图</th>
        </tr></thead>
        <tbody>{table.rows.map((scene, index) => <tr key={scene.start}>
          <td>{index + 1}</td>
          <td>{seconds.format(scene.start)}–{seconds.format(scene.end)}</td>
          <th scope="row">{scene.title}</th>
          <td>{scene.visual}
            {(scene.camera || scene.entities || scene.prompt) && <details className="iua-scene-details">
              <summary>场景镜卡</summary>
              {scene.camera && <p><strong>镜头语言</strong> {scene.camera}</p>}
              {scene.entities && <p><strong>实体</strong> {scene.entities}</p>}
              {scene.prompt && <PromptText label="单镜 Prompt" text={scene.prompt} />}
            </details>}
          </td>
          <td>{scene.shotCount}</td>
          <td><div className="iua-scene-frames">{(scene.keyframes || [{ at: scene.frameAt, url: scene.frameUrl }]).map(frame => <SceneScreenshot key={frame.url} frame={frame} title={scene.title} />)}</div></td>
        </tr>)}</tbody>
      </table>
    </div>
  </article>;
}

const methodLabels = { 'scene-clips': '逐场景图生视频', storyboard: '3×3 故事板', edit: '局部视频编辑' };
export const productionPlanTitle = '视频制作 · 调整方案';

export function VideoCreativeDirectionPreview({ direction }: { direction: VideoCreativeDirection }) {
  return <div className="video-creative-direction">
    <p>{direction.summary}</p>
    <dl>
      <div><dt>创意骨架 · 建议保留</dt><dd>{direction.preserve.length
        ? <ul>{direction.preserve.map((item, index) => <li key={index}>{item}</li>)}</ul>
        : '按本次方向重新设计。'}</dd></div>
      <div><dt>可调整元素 · 建议做法</dt><dd>{direction.changes.length
        ? <ul>{direction.changes.map((item, index) => <li key={index}>{item}</li>)}</ul>
        : '按当前方向沿用原片元素。'}</dd></div>
    </dl>
  </div>;
}

export function VideoProductionPlanPreview({ plan }: { plan: VideoProductionPlan }) {
  return <article className="iua-artifact-preview" aria-label={productionPlanTitle}>
    <header><div><FileText size={18} aria-hidden="true" /><h2>{productionPlanTitle}</h2></div></header>
    <p className="iua-artifact-meta">{methodLabels[plan.method]} · {plan.scenes.length} 个场景{plan.level ? ` · ${levelInfo(plan.level).label}` : ''}</p>
    {plan.creativeDirection ? <VideoCreativeDirectionPreview direction={plan.creativeDirection} /> : <>
      {plan.preserve && <p className="iua-artifact-meta">保留 {plan.preserve}</p>}
      {plan.change && <p className="iua-artifact-meta">调整 {plan.change}</p>}
    </>}
    {plan.originalMasterPrompt && <MasterPrompt master={plan.originalMasterPrompt} label="所选原片 · 母版 Prompt" />}
    <MasterPrompt master={plan.masterPrompt} label="调整后 · 全片母版 Prompt" />
    {plan.scenes.map((scene, index) => <details className="iua-production-section" key={scene.start}>
      <summary>{index + 1}. {scene.title} · {seconds.format(scene.start)}–{seconds.format(scene.end)} 秒</summary>
      {!!scene.originalFrames?.length && <div className="iua-production-frames">{scene.originalFrames.map(frame => <SceneScreenshot key={frame.id} frame={frame} title={scene.title} />)}</div>}
      {scene.visual && <p>{scene.visual}</p>}
      {scene.camera && <p><strong>镜头语言</strong> {scene.camera}</p>}
      {scene.entities && <p><strong>实体</strong> {scene.entities}</p>}
      {scene.originalPrompt && <PromptText label="原片单镜 Prompt" text={scene.originalPrompt} />}
      <PromptText label="场景视频 Prompt" text={scene.prompt} />
      {scene.keyframePrompt && <PromptText label="场景关键帧 Prompt" text={scene.keyframePrompt} />}
    </details>)}
  </article>;
}
