import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { ProductionMode, Project } from '../shared/domain';
import { buildVeoPlan } from '../shared/veo-plan';
import { buildPipeline, resolvePipelineInput, type PipelineNode } from './pipeline';
import './pipeline.css';

type Selection = { nodeId: string; kind: 'input' | 'output'; key: string };

function display(value: unknown) {
  const text = value === null || value === undefined ? '尚无记录 / 尚未执行' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [REDACTED_API_KEY]');
}

function preview(value: unknown) {
  if (value === null || value === undefined) return '尚无记录';
  if (typeof value === 'string') return display(value).replace(/\s+/g, ' ').slice(0, 95);
  if (Array.isArray(value)) return `${value.length} 项`;
  return `${Object.keys(value).length} 个字段`;
}

const statusText = (node: PipelineNode) => node.status === 'done' ? '已完成' : node.status === 'running' ? '处理中' : node.status === 'failed' ? '失败' : '未执行';
const evidenceText = (node: PipelineNode) => node.evidence === 'recorded' ? '执行记录' : node.evidence === 'reconstructed' ? '当前数据推导' : '历史未留存';

export default function PipelineCanvas({ project, onClose }: { project: Project; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const units = useMemo(() => project.rewrite ? buildVeoPlan(project.rewrite.shots) : [], [project.rewrite]);
  const [mode, setMode] = useState<ProductionMode>(project.productionMode || 'veo-native');
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [videoId, setVideoId] = useState('');
  const [selection, setSelection] = useState<Selection>({ nodeId: 'provider-body', kind: 'output', key: 'body' });
  const [copied, setCopied] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => { dialog.current?.close(); }; }, []);
  const attempts = project.generatedVideos.filter(video => video.unitId === unitId && (video.productionMode || 'veo-native') === mode);
  const nodes = useMemo(() => buildPipeline(project, mode, unitId, videoId), [project, mode, unitId, videoId]);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const selectedNode = byId.get(selection.nodeId) || nodes[0];
  const selectedInput = selection.kind === 'input' ? selectedNode.inputs.find(item => item.key === selection.key) : undefined;
  const selectedOutput = selection.kind === 'output' ? selectedNode.outputs.find(item => item.key === selection.key) : undefined;
  const selectedPort = selectedInput ? resolvePipelineInput(nodes, selectedInput) : selectedOutput;
  const selectedLabel = selectedInput?.label || selectedOutput?.label || selectedNode.title;
  const sourceName = (nodeId: string) => byId.get(nodeId)?.title || nodeId;
  const consumers = (nodeId: string, portKey: string) => nodes.flatMap(node => node.inputs.filter(item => item.from.nodeId === nodeId && item.from.portKey === portKey).map(item => ({ node, item })));
  const choose = (nodeId: string, kind: 'input' | 'output', key: string) => { setSelection({ nodeId, kind, key }); setCopied(false); };
  const switchMode = (next: ProductionMode) => { setMode(next); setVideoId(''); };
  const copy = async () => { await navigator.clipboard.writeText(display(selectedPort?.value)); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };

  return <dialog ref={dialog} className="pipeline-dialog" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="pipeline-shell">
      <header className="pipeline-header"><div><span className="pipeline-kicker">DATA FLOW / {project.id.slice(0, 8).toUpperCase()}</span><h2>制作过程 · 输入 → 输出</h2><p>每条「来自」都读取上游节点的同一个输出值；点击端口查看完整内容。执行记录和当前数据推导会明确区分。</p></div><button className="pipeline-close" type="button" onClick={onClose} aria-label="关闭流程画布"><X size={19} /></button></header>
      <div className="pipeline-toolbar"><div className="pipeline-mode" role="group" aria-label="选择成片模式"><button type="button" className={mode === 'veo-native' ? 'active' : ''} onClick={() => switchMode('veo-native')}>Veo 原生</button><button type="button" className={mode === 'tts-subtitles' ? 'active' : ''} onClick={() => switchMode('tts-subtitles')}>本地配音字幕</button></div><label className="pipeline-select">生产单元<select value={unitId} onChange={event => { setUnitId(event.target.value); setVideoId(''); }}>{units.map(unit => <option value={unit.id} key={unit.id}>{unit.id} · {unit.start}–{unit.end}s</option>)}</select></label><label className="pipeline-select">生成记录<select value={videoId || attempts.at(-1)?.id || ''} onChange={event => setVideoId(event.target.value)}><option value="" disabled>{attempts.length ? '选择记录' : '尚未生成'}</option>{attempts.map(video => <option value={video.id} key={video.id}>{new Date(video.startedAt).toLocaleString()} · {video.status}</option>)}</select></label><span className="pipeline-count">{nodes.length} 个节点 · 聚焦 1 个单元</span></div>
      <div className="pipeline-body"><div className="pipeline-viewport" aria-label="制作过程数据流画布"><div className="pipeline-flow">
        {nodes.map(node => <div className="pipeline-step" key={node.id}>
          <article className={`pipeline-node ${selection.nodeId === node.id ? 'selected' : ''} ${node.status}`}><div className="pipeline-node-head"><div><span className="pipeline-node-eyebrow">{node.eyebrow}</span><h3>{node.title}</h3></div><div className="pipeline-node-badges"><span className={`pipeline-state ${node.status}`}>{statusText(node)}</span><span className="pipeline-evidence">{evidenceText(node)}</span></div></div>
            <div className="pipeline-node-ports"><div className="pipeline-port-column"><strong>输入 <span>INPUT</span></strong>{node.inputs.length ? node.inputs.map(item => { const upstream = byId.get(item.from.nodeId); const upstreamPort = resolvePipelineInput(nodes, item); return <button type="button" key={item.key} className={`pipeline-port ${selection.nodeId === node.id && selection.kind === 'input' && selection.key === item.key ? 'active' : ''}`} onClick={() => choose(node.id, 'input', item.key)}><b>{item.label}</b><small>← {upstream?.title || item.from.nodeId} · {upstreamPort?.label || item.from.portKey}</small><em>{preview(upstreamPort?.value)}</em></button>; }) : <div className="pipeline-origin">用户上传 / 页面选择</div>}</div>
              <div className="pipeline-transform"><span>处理</span><p>{node.transform}</p></div>
              <div className="pipeline-port-column"><strong>输出 <span>OUTPUT</span></strong>{node.outputs.map(item => { const targets = consumers(node.id, item.key); return <button type="button" key={item.key} className={`pipeline-port ${selection.nodeId === node.id && selection.kind === 'output' && selection.key === item.key ? 'active' : ''}`} onClick={() => choose(node.id, 'output', item.key)}><b>{item.label}</b><small>{targets.length ? targets.map(({ node: target, item: targetInput }) => `→ ${target.title} · ${targetInput.label}`).join(' / ') : '→ 当前分支到此结束'}</small><em>{preview(item.value)}</em></button>; })}</div></div>
          </article>
        </div>)}
      </div></div><aside className="pipeline-inspector"><div className="pipeline-inspector-heading"><span>{selectedNode.eyebrow} · {evidenceText(selectedNode)}</span><h3>{selectedNode.title}</h3><p>{selectedNode.transform}</p></div><div className="pipeline-inspector-port"><span>{selection.kind === 'input' ? '输入端口' : '输出端口'}</span><h4>{selectedLabel}</h4>{selectedInput && <p>← 完全取自 <button type="button" onClick={() => choose(selectedInput.from.nodeId, 'output', selectedInput.from.portKey)}>{sourceName(selectedInput.from.nodeId)}.输出.{resolvePipelineInput(nodes, selectedInput)?.label || selectedInput.from.portKey}</button></p>}{selectedOutput && <p>{consumers(selectedNode.id, selectedOutput.key).length ? consumers(selectedNode.id, selectedOutput.key).map(({ node, item }) => <button type="button" key={`${node.id}-${item.key}`} onClick={() => choose(node.id, 'input', item.key)}>→ {node.title}.输入.{item.label}</button>) : '当前分支没有下游输入'}</p>}</div><div className="pipeline-payload-heading"><strong>端口内容</strong><button type="button" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? '已复制' : '复制'}</button></div><pre className="pipeline-payload" tabIndex={0}>{display(selectedPort?.value)}</pre>{!!selectedNode.links?.length && <div className="pipeline-links">{selectedNode.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}</div>}<p className="pipeline-caveat">请求快照不是网络抓包；历史缺失值不会补造。API Key 与媒体二进制不会展示。</p></aside></div>
    </div>
  </dialog>;
}
