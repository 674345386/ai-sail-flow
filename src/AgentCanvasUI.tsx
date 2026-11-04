import { createContext, lazy, Suspense, useContext, useState } from 'react';
import { defineComponent, Renderer } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { SlidersHorizontal, X } from 'lucide-react';
import type { CanvasComponent, CanvasComponentInput } from '../shared/agent-canvas-ui';
import { canvasComponentLabels } from '../shared/agent-canvas-ui';
import { creativeOpenUILibrary } from '../shared/openui-creative-library';
import type { StoryboardGrid } from '../shared/domain';
import './agent-canvas-ui.css';

const OpenUIBuiltinGallery = lazy(() => import('./OpenUIBuiltinGallery'));

type CanvasActions = { update: (input: Partial<CanvasComponentInput>) => void; grids: StoryboardGrid[]; preview: boolean };
const Actions = createContext<CanvasActions>({ update: () => {}, grids: [], preview: true });

const CameraMotionController = defineComponent({
  name: 'CameraMotionController', description: 'Interactive camera motion settings for the current video clip.',
  props: z.object({ duration: z.number(), strength: z.number(), direction: z.string(), target: z.string() }),
  component: ({ props }) => {
    const { update, preview } = useContext(Actions);
    return <div className="acu-fields">
      <p className="acu-target">作用于 {props.target}</p>
      <label>运镜方向<select value={props.direction} onChange={event => update({ direction: event.target.value as 'push' })}><option value="push">推镜头</option><option value="pull">拉镜头</option><option value="pan-left">向左摇镜</option><option value="pan-right">向右摇镜</option></select></label>
      <label>时长 <strong>{props.duration.toFixed(1)} 秒</strong><input aria-label="运镜时长" type="range" min="0.1" max="30" step="0.1" value={props.duration} onChange={event => update({ duration: Number(event.target.value) })} /></label>
      <label>运镜幅度 <strong>{props.strength.toFixed(1)} / 10</strong><input aria-label="运镜幅度" type="range" min="0" max="10" step="0.1" value={props.strength} onChange={event => update({ strength: Number(event.target.value) })} /></label>
      {!preview && <p className="acu-footnote">参数会实时保存，Agent 下次读取创意时可见。</p>}
    </div>;
  },
});
const ColorPresetCard = defineComponent({
  name: 'ColorPresetCard', description: 'Interactive color temperature and grading preset for a video clip.',
  props: z.object({ temperature: z.number(), preset: z.string(), intensity: z.number(), target: z.string() }),
  component: ({ props }) => {
    const { update, preview } = useContext(Actions);
    return <div className="acu-fields">
      <p className="acu-target">作用于 {props.target}</p>
      <div className="acu-presets" role="group" aria-label="调色预设">{(['warm', 'natural', 'cool'] as const).map(preset => <button type="button" key={preset} className={props.preset === preset ? 'active' : ''} onClick={() => update({ preset })}>{ { warm: '暖调', natural: '自然', cool: '冷调' }[preset]}</button>)}</div>
      <label>色温 <strong>{props.temperature} K</strong><input aria-label="色温" type="range" min="2000" max="10000" step="100" value={props.temperature} onChange={event => update({ temperature: Number(event.target.value) })} /></label>
      <label>强度 <strong>{props.intensity}%</strong><input aria-label="调色强度" type="range" min="0" max="100" step="1" value={props.intensity} onChange={event => update({ intensity: Number(event.target.value) })} /></label>
      {!preview && <p className="acu-footnote">参数会实时保存，Agent 下次读取创意时可见。</p>}
    </div>;
  },
});
const StoryboardSelector = defineComponent({
  name: 'StoryboardSelector', description: 'Choose existing storyboard grids for the current creative.',
  props: z.object({ selectedGridIds: z.array(z.string()), target: z.string() }),
  component: ({ props }) => {
    const { update, grids } = useContext(Actions);
    return <div className="acu-fields"><p className="acu-target">{props.target}</p>{grids.length ? grids.map((grid, index) => <label className="acu-grid-choice" key={grid.id}><input type="checkbox" checked={props.selectedGridIds.includes(grid.id)} onChange={event => update({ selectedGridIds: event.target.checked ? [...props.selectedGridIds, grid.id] : props.selectedGridIds.filter(id => id !== grid.id) })} /><span>分镜网格 {String(index + 1).padStart(2, '0')}<small>{grid.start.toFixed(1)}–{grid.end.toFixed(1)} 秒</small></span></label>) : <p className="acu-footnote">当前创意还没有分镜网格。</p>}</div>;
  },
});

// Add a defineComponent entry here to make a new canvas controller available to OpenUI.
export const canvasLibrary = creativeOpenUILibrary.extend!({ components: { add: [CameraMotionController, ColorPresetCard, StoryboardSelector] } });
const examples: CanvasComponentInput[] = [
  { kind: 'camera', duration: 3, strength: 6, direction: 'push', target: '当前片段' },
  { kind: 'color', temperature: 3200, preset: 'warm', intensity: 60, target: '当前片段' },
  { kind: 'storyboard', selectedGridIds: [], target: '当前分镜' },
];
const customNames = { camera: 'CameraMotionController', color: 'ColorPresetCard', storyboard: 'StoryboardSelector' } as const;
function program(component: CanvasComponentInput) {
  switch (component.kind) {
    case 'camera': return `root = Stack([CameraMotionController(${component.duration}, ${component.strength}, ${JSON.stringify(component.direction)}, ${JSON.stringify(component.target)})])`;
    case 'color': return `root = Stack([ColorPresetCard(${component.temperature}, ${JSON.stringify(component.preset)}, ${component.intensity}, ${JSON.stringify(component.target)})])`;
    case 'storyboard': return `root = Stack([StoryboardSelector(${JSON.stringify(component.selectedGridIds)}, ${JSON.stringify(component.target)})])`;
  }
}
function Controller({ component, grids, onUpdate, preview = false }: { component: CanvasComponentInput; grids: StoryboardGrid[]; onUpdate: (input: Partial<CanvasComponentInput>) => void; preview?: boolean }) {
  return <Actions.Provider value={{ update: onUpdate, grids, preview }}><Renderer response={program(component)} library={canvasLibrary} /></Actions.Provider>;
}
function describe(component: CanvasComponent) {
  switch (component.kind) {
    case 'camera': return `请按画布参数处理${component.target}：${{ push: '推镜头', pull: '拉镜头', 'pan-left': '向左摇镜', 'pan-right': '向右摇镜' }[component.direction]}，时长 ${component.duration} 秒，运镜幅度 ${component.strength}/10。先说明可执行方式；只有我明确要求出片时才生成视频。`;
    case 'color': return `请按画布参数处理${component.target}：${{ warm: '暖调', natural: '自然', cool: '冷调' }[component.preset]}预设，色温 ${component.temperature}K，强度 ${component.intensity}%。先说明可执行方式；只有我明确要求出片时才生成视频。`;
    case 'storyboard': return `请查看画布中选择的分镜网格：${component.selectedGridIds.length ? component.selectedGridIds.join('、') : '尚未选择'}，并说明下一步；不要直接生成视频。`;
  }
}
export default function AgentCanvasUI({ components, grids, onUpdate, onClose, onDraft, triggerOnly = false, panelsOnly = false }: { components: CanvasComponent[]; grids: StoryboardGrid[]; onUpdate: (id: string, input: Partial<CanvasComponentInput>) => void; onClose: (id: string) => void; onDraft: (text: string) => void; triggerOnly?: boolean; panelsOnly?: boolean }) {
  const [showGallery, setShowGallery] = useState(false);
  const [selected, setSelected] = useState('custom-camera');
  const [preview, setPreview] = useState<CanvasComponentInput>(examples[0]);
  return <>
    {!panelsOnly && <button type="button" className="acu-gallery-trigger" onClick={() => setShowGallery(true)} title="预览 OpenUI 与创作组件"><SlidersHorizontal size={14} />组件库</button>}
    {!triggerOnly && !!components.length && <div className="acu-stack" aria-label="Agent 动态画布组件">{components.map(component => <section key={component.id} className="acu-panel" aria-label={canvasComponentLabels[component.kind]}>
      <header><div><small>AGENT · {customNames[component.kind]}</small><h3>{canvasComponentLabels[component.kind]}</h3></div><button type="button" aria-label={`关闭${canvasComponentLabels[component.kind]}`} onClick={() => onClose(component.id)}><X size={17} /></button></header>
      <Controller component={component} grids={grids} onUpdate={input => onUpdate(component.id, input)} />
      <footer><button type="button" onClick={() => onDraft(describe(component))}>把参数填入聊天框</button></footer>
    </section>)}</div>}
    {showGallery && <div className="acu-gallery-backdrop" onClick={event => { if (event.target === event.currentTarget) setShowGallery(false); }}><aside className="acu-gallery" aria-label="组件预览库">
      <header><div><small>OPENUI + SAIL</small><h2>组件预览库</h2><p>3 个创作组件 · OpenUI 内置组件与示例</p></div><button type="button" aria-label="关闭组件预览库" onClick={() => setShowGallery(false)}><X size={19} /></button></header>
      <div className="acu-gallery-body"><nav aria-label="组件列表"><strong>创作组件</strong>{examples.map(item => <button type="button" key={item.kind} className={selected === `custom-${item.kind}` ? 'active' : ''} onClick={() => { setSelected(`custom-${item.kind}`); setPreview(item); }}>{canvasComponentLabels[item.kind]}<small>{customNames[item.kind]}</small></button>)}<strong>OpenUI</strong><button type="button" className={selected === 'builtin' ? 'active' : ''} onClick={() => setSelected('builtin')}>内置组件与示例</button></nav>
      <div className="acu-gallery-preview"><span className="acu-preview-label">实时预览</span>{selected === 'builtin' ? <Suspense fallback={<p>正在加载 OpenUI 内置组件…</p>}><OpenUIBuiltinGallery /></Suspense> : <Controller component={preview} grids={grids} preview onUpdate={input => setPreview(current => ({ ...current, ...input } as CanvasComponentInput))} />}</div></div>
    </aside></div>}
  </>;
}
