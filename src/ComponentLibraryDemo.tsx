import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Renderer, type ActionEvent } from '@openuidev/react-lang';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Box, Check, ChevronRight, Code2, Copy, Film, Image as ImageIcon, Layers3, MessageSquare, MousePointer2, Play, RotateCcw, Search, SlidersHorizontal, Terminal, Text, Workflow, X } from 'lucide-react';
import AgentCanvasUI from './AgentCanvasUI';
import { baseComponents, baseComponentGroups, library as intelligentLibrary } from './intelligent-ui/library';
import { functions as intelligentFunctions } from './intelligent-ui/functions';
import { runLibraryAction } from './intelligent-ui/actions';
import { demoTools } from './intelligent-ui/demo-data';
import { programs } from './intelligent-ui/gallery/programs';
import { toolPrograms } from './intelligent-ui/gallery/tool-programs';
import { compositionPrograms } from './intelligent-ui/gallery/composition-programs';
import type { CanvasComponent, CanvasComponentInput } from '../shared/agent-canvas-ui';
import type { StoryboardGrid } from '../shared/domain';
import { componentNotes, createDemoScenarios, exampleForComponent, groupLabels, type DemoScenario } from './component-library-demo-data';
import 'katex/dist/katex.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './intelligent-ui/components/theme.css';
import './intelligent-ui/components/components.css';
import './intelligent-ui/components/map/map.css';
import './component-library-demo.css';

const scenarios = createDemoScenarios(location.origin);
const allPrograms = [...programs, ...toolPrograms, ...compositionPrograms];
const domains = [{ id: 'video', label: '视频与画布', icon: Film }, { id: 'image', label: '图片生成', icon: ImageIcon }, { id: 'text', label: '文字与交互', icon: MessageSquare }] as const;
const galleryTitles: Record<string, string> = { answer: '组合式回答', text: '文字与排版', lists: '清单与时间安排', buttons: '按钮与动作', layout: '布局与容器', gdp: '滑块与响应式状态', segmented: '分段选择', checklist: '勾选清单', pressable: '可选择的卡片', inputs: '输入与表单', svg: '可交互 SVG 原理图', chart: '图表', table: '数据表格', images: '图片', map: '地图与路线', html: 'HTML 沙箱小游戏', timer: '倒计时', heatmap: '颜色与热力', icons: '图标', flashcards: '知识卡片与测验', primitives: '更多原生组件' };
const demoGrids: StoryboardGrid[] = [0, 1, 2].map(index => ({ id: `demo-grid-${index + 1}`, start: index * 10, end: (index + 1) * 10, gridSize: 3, frameTimes: [], filename: '', url: '', prompt: '示例分镜', generatedAt: '2026-11-04T00:00:00Z' }));

function canvasFor(scenario: DemoScenario): CanvasComponent[] {
  return scenario.canvas ? [{ ...scenario.canvas, id: `demo-${scenario.canvas.kind}`, createdAt: '2026-11-04T00:00:00Z', updatedAt: new Date().toISOString() }] : [];
}

class PreviewBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="lab-preview-error"><strong>这个示例未能渲染</strong><p>{this.state.error}</p><p>可以切换其他示例，或刷新后重试。</p></div> : this.props.children; }
}

function ComponentLibraryDemo() {
  const [mode, setMode] = useState<'scenarios' | 'catalog' | 'gallery'>('scenarios');
  const [scenarioId, setScenarioId] = useState('camera');
  const scenario = scenarios.find(item => item.id === scenarioId)!;
  const [stage, setStage] = useState(3);
  const [run, setRun] = useState(0);
  const [canvas, setCanvas] = useState<CanvasComponent[]>(canvasFor(scenarios[0]));
  const [previewTab, setPreviewTab] = useState<'preview' | 'source'>('preview');
  const [draft, setDraft] = useState('');
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [component, setComponent] = useState('');
  const [galleryId, setGalleryId] = useState('layout');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const currentProgram = allPrograms.find(item => item.id === galleryId) || allPrograms[0];
  const gallerySource = currentProgram.code;
  const galleryName = galleryTitles[currentProgram.id] || currentProgram.title;
  const isGallery = mode === 'gallery';
  const shownSource = isGallery ? gallerySource : scenario.source || JSON.stringify(scenario.tools, null, 2);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { clearTimers(); clearTimeout(toastTimer.current); }, []);
  const flash = (text: string) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3200); };
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const field = document.createElement('textarea'); field.value = value; field.style.cssText = 'position:fixed;opacity:0'; document.body.append(field); field.select(); const ok = document.execCommand('copy'); field.remove();
      if (!ok) { flash('复制未成功，请在代码区域手动选择内容。'); return; }
    }
    flash('已复制');
  };
  const chooseScenario = (item: DemoScenario) => {
    clearTimers(); setScenarioId(item.id); setCanvas(canvasFor(item)); setStage(3); setRun(value => value + 1); setDraft(''); setActionLog([]); setMode('scenarios'); setPreviewTab('preview');
  };
  const replay = () => {
    clearTimers(); setStage(0); setCanvas([]); setDraft(''); setActionLog([]); setPreviewTab('preview'); setRun(value => value + 1);
    timers.current = [setTimeout(() => setStage(1), 350), setTimeout(() => setStage(2), 850), setTimeout(() => { setCanvas(canvasFor(scenario)); setStage(3); }, 1450)];
  };
  const onAction = (event: ActionEvent) => {
    const local = runLibraryAction(event);
    if (local) { void local.then(ok => flash(ok ? '已复制到剪贴板' : '复制未成功')); return; }
    const message = event.humanFriendlyMessage || event.type;
    const fields = Object.keys(event.formState || {}).length ? ` · ${JSON.stringify(event.formState)}` : '';
    setActionLog(current => [`@ToAssistant → ${message}${fields}`, ...current].slice(0, 5));
    setDraft(`${message}${fields}`); flash('已捕获交给 Agent 的动作，见下方动作记录。');
  };
  const updateCanvas = (id: string, input: Partial<CanvasComponentInput>) => {
    setCanvas(current => current.map(item => item.id === id ? { ...item, ...input, updatedAt: new Date().toISOString() } as CanvasComponent : item));
    setActionLog(current => [`参数保存（演示） ${JSON.stringify(input)}`, ...current].slice(0, 5));
  };
  const openComponentExample = (name: string) => {
    const expression = new RegExp(`\\b${name}\\s*\\(`);
    const preferred = allPrograms.find(item => item.id === exampleForComponent(name));
    const example = preferred && expression.test(preferred.code) ? preferred : allPrograms.find(item => expression.test(item.code)) || preferred;
    setComponent(name); setGalleryId(example?.id || 'primitives'); setMode('gallery'); setPreviewTab('preview'); setRun(value => value + 1);
  };
  const filteredGroups = useMemo(() => baseComponentGroups.map(group => ({ ...group, components: group.components.filter(name => `${name} ${componentNotes[name] || ''}`.toLowerCase().includes(search.toLowerCase())) })).filter(group => group.components.length), [search]);
  const chosenComponent = baseComponents.find(item => item.name === component);
  const trace = [
    { title: '用户提出意图', detail: '自然语言描述目标、参数与约束。' },
    { title: 'Agent 选择工具和呈现方式', detail: scenario.kind === 'plain' ? '本例直接组织文字回答。' : `选择 ${scenario.tools.map(tool => tool.name).join(' → ')}。` },
    { title: scenario.kind === 'canvas' ? '发布画布状态' : scenario.kind === 'plain' ? '返回文字内容' : '发布界面或媒体结果', detail: scenario.kind === 'canvas' ? '保存组件参数，通过 SSE 推送给视频画布。' : scenario.kind === 'plain' ? '显示在左侧聊天区。' : '校验 OpenUI Lang，将界面状态通过 SSE 推到右侧。' },
    { title: scenario.kind === 'plain' ? '用户继续对话' : '挂载组件，用户开始交互', detail: scenario.kind === 'canvas' ? '现有视频控制器接收初始值，可修改、关闭。' : scenario.kind === 'plain' ? '文字留在聊天区，右侧只显示生成的交互界面。' : 'Renderer 按注册的组件和响应式绑定渲染。' },
  ];

  return <div className="lab-app">
    <header className="lab-header">
      <a className="lab-brand" href="/" aria-label="返回 AI Creative Lab"><span><Layers3 size={20} /></span><strong>AI Creative Lab</strong><i>/</i><span>INTERFACE LAB</span></a>
      <a className="lab-back" href="/"><ArrowLeft size={14} />返回工作区</a>
    </header>
    <div className="lab-intro">
      <div><p className="lab-eyebrow">COMPONENTS · INTENT · ACTION</p><h1>组件，如何被触发。</h1><p>从一句话到一个界面。查看真实组件、试用交互，再看 Agent 是怎样把它们带到右侧的。</p></div>
      <div className="lab-counts"><div><strong>{baseComponents.length}</strong><span>原生组件</span></div><div><strong>3</strong><span>画布扩展</span></div><div><strong>{intelligentFunctions.length}</strong><span>响应式函数</span></div></div>
    </div>
    <div className="lab-toolbar">
      <nav className="lab-mode-tabs" aria-label="示范页视图">
        <button type="button" aria-selected={mode === 'scenarios'} className={mode === 'scenarios' ? 'active' : ''} onClick={() => setMode('scenarios')}><Workflow size={16} />场景与触发</button>
        <button type="button" aria-selected={mode === 'catalog'} className={mode === 'catalog' ? 'active' : ''} onClick={() => setMode('catalog')}><Box size={16} />全部组件</button>
        <button type="button" aria-selected={mode === 'gallery'} className={mode === 'gallery' ? 'active' : ''} onClick={() => setMode('gallery')}><BookOpen size={16} />上游原生示例</button>
      </nav>
      <span className="lab-demo-note"><span />真实组件 · 预设流程 · 不调用生成服务</span>
    </div>

    {mode === 'catalog' ? <main className="lab-catalog">
      <div className="lab-section-heading"><div><p className="lab-eyebrow">REGISTERED COMPONENTS</p><h2>当前支持的组件</h2><p>目录来自项目实际注册的库。点击名称，打开它所在的真实交互示例。</p></div><label className="lab-search"><Search size={16} /><input aria-label="搜索组件" placeholder="搜索组件或用途…" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      <section className="lab-custom-catalog"><div><span className="lab-badge custom">AI Creative Lab 扩展</span><h3>视频业务中的专业控制器</h3><p>通过 show_canvas_component 发布，参数进入当前创意。</p></div><div>{scenarios.filter(item => item.kind === 'canvas').map(item => <button type="button" key={item.id} onClick={() => chooseScenario(item)}><SlidersHorizontal size={17} /><span><strong>{item.components[0]}</strong><small>{item.title} · kind={item.canvas?.kind}</small></span><ArrowRight size={16} /></button>)}</div></section>
      <div className="lab-catalog-grid">{filteredGroups.map(group => <section className="lab-catalog-group" key={group.name}><header><h3>{groupLabels[group.name]}</h3><span>{group.components.length}</span></header>{group.components.map(name => <button type="button" key={name} onClick={() => openComponentExample(name)}><span><code>{name}</code><small>{componentNotes[name]}</small></span><ChevronRight size={14} /></button>)}</section>)}</div>
      {!filteredGroups.length && <p className="lab-no-results">没有匹配的组件，试试“图片”“表单”或“Slider”。</p>}
      <details className="lab-functions"><summary><span><Code2 size={17} />{intelligentFunctions.length} 个响应式函数</span><span>展开目录</span></summary><p>函数由页面中的表达式调用。配合 $variables 与 @Set，用户的操作可在本地更新结果；@ToAssistant 才会把请求交回 Agent。</p><div>{intelligentFunctions.map(fn => <code key={fn.name}>@{fn.name}</code>)}</div><button type="button" className="lab-text-button" onClick={() => chooseScenario(scenarios.find(item => item.id === 'budget')!)}>试用预算计算器<ArrowRight size={14} /></button></details>
    </main> : <main className="lab-workbench">
      <aside className="lab-scenario-nav" aria-label={isGallery ? '原生交互示例' : '业务场景'}>
        {isGallery ? <><p className="lab-nav-label">Open Intelligent UI · {allPrograms.length} 个上游示例</p><div className="lab-gallery-nav">{allPrograms.map(item => <button type="button" key={item.id} className={galleryId === item.id ? 'active' : ''} onClick={() => { setGalleryId(item.id); setPreviewTab('preview'); }}><span>{galleryTitles[item.id] || item.title}</span><ChevronRight size={13} /></button>)}</div></> : <>{domains.map(domain => <div className="lab-nav-group" key={domain.id}><h2><domain.icon size={14} />{domain.label}</h2>{scenarios.filter(item => item.domain === domain.id).map(item => <button type="button" className={scenarioId === item.id ? 'active' : ''} aria-pressed={scenarioId === item.id} key={item.id} onClick={() => chooseScenario(item)}><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><ChevronRight size={14} /></button>)}</div>)}<div className="lab-nav-help"><MousePointer2 size={16} /><p>选择场景看效果，<br />点击“重放触发”看链路。</p></div></>}
      </aside>

      <div className="lab-detail">
        {isGallery ? <section className="lab-gallery-heading"><span className="lab-badge native">真实 Renderer</span><h2>{galleryName}</h2>{chosenComponent && <p><code>{chosenComponent.name}</code> · {componentNotes[chosenComponent.name]}</p>}<p>{currentProgram.note}</p><div className="lab-gallery-context"><Code2 size={15} /><p>真实应用中，Agent 直接流式输出界面程序，右侧随生成逐步渲染；长任务也可提前发布中间面板。此处直接加载上游示例，输入与交互使用真实组件。</p></div><p className="lab-small">地图、公开照片与 YouTube 需要联网；仪表盘 Query 使用随库提供的演示数据。</p></section> : <section className="lab-request-panel">
          <div className="lab-request-heading"><span className="lab-eyebrow">01 / PROMPT</span><button type="button" className="lab-text-button" onClick={() => void copy(scenario.prompt)}><Copy size={13} />复制示例 Prompt</button></div>
          <div className="lab-user-message"><span className="lab-avatar">你</span><p>{scenario.prompt}</p></div>
          <button type="button" className="lab-run-button" disabled={stage < 3} onClick={replay}>{stage < 3 ? <span className="lab-spinner" /> : <Play size={15} fill="currentColor" />}{stage < 3 ? '正在重放…' : '重放触发'}<span>预设演示</span></button>
          <div className="lab-agent-reply"><span className="lab-agent-mark"><Layers3 size={15} /></span><div><strong>创作 Agent</strong>{stage < 3 ? <p className="lab-muted">{stage < 2 ? '理解请求，选择呈现方式…' : '发布组件与初始参数…'}</p> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{scenario.answer}</ReactMarkdown>}</div></div>
          <div className="lab-trigger-explanation"><h3><MousePointer2 size={14} />什么时候出现？</h3><p>{scenario.trigger}</p><p>{scenario.interaction}</p><div>{scenario.dependency}</div></div>
        </section>}

        <section className="lab-preview-panel">
          <header className="lab-preview-header"><div><span className="lab-eyebrow">{isGallery ? 'COMPONENT PREVIEW' : '02 / RESULT'}</span><h2>{isGallery ? galleryName : scenario.kind === 'canvas' ? '视频画布 · 动态控制器' : scenario.kind === 'plain' ? '文字回答' : 'Agent UI · 结果预览'}</h2></div><div className="lab-preview-tabs"><button type="button" aria-pressed={previewTab === 'preview'} className={previewTab === 'preview' ? 'active' : ''} onClick={() => setPreviewTab('preview')}>效果</button><button type="button" aria-pressed={previewTab === 'source'} className={previewTab === 'source' ? 'active' : ''} onClick={() => setPreviewTab('source')}><Code2 size={13} />{!isGallery && scenario.kind === 'canvas' ? '参数' : '代码'}</button></div></header>
          {previewTab === 'source' ? <div className="lab-source"><button type="button" onClick={() => void copy(shownSource)}><Copy size={14} />复制</button><pre><code>{shownSource || '本例直接返回普通文字，不调用界面工具。'}</code></pre></div> : <><PreviewBoundary key={`${mode}:${scenarioId}:${galleryId}:${run}`}>
            {isGallery ? <div className="lab-native-preview intelligent-ui-surface" data-theme="light"><Renderer response={gallerySource} library={intelligentLibrary} toolProvider={demoTools} onAction={onAction} /></div> : stage < 3 ? <div className="lab-preview-wait"><div className="lab-preview-skeleton" /><p>Agent {stage < 2 ? '正在整理参数' : '正在发布界面'}…</p></div> : scenario.kind === 'canvas' ? <div className="lab-canvas-preview"><div className="lab-canvas-base"><span className="lab-canvas-label"><Film size={13} />示例视频画布</span><div className="lab-frame"><img src="/studio/gen/scene-coffee.jpg" alt="作为视频画布背景的咖啡馆示例画面" /><span>当前片段 <i>00:00 / 00:10</i></span></div><div className="lab-flow-nodes"><span>参考素材</span><ArrowDown size={18} /><span>分镜与 Prompt</span><ArrowDown size={18} /><span>生成视频</span></div><small>演示画布 · 参数仅保存在本页</small></div><AgentCanvasUI panelsOnly components={canvas} grids={demoGrids} onUpdate={updateCanvas} onClose={id => { setCanvas(current => current.filter(item => item.id !== id)); setActionLog(current => ['关闭组件（演示） DELETE /canvas-components/:id', ...current].slice(0, 5)); }} onDraft={text => { setDraft(text); flash('参数已填入下方演示聊天草稿。'); }} />{!canvas.length && <button type="button" className="lab-reopen" onClick={() => setCanvas(canvasFor(scenario))}><RotateCcw size={14} />重新打开控制器</button>}</div> : scenario.kind === 'plain' ? <div className="lab-plain-preview"><Text size={32} strokeWidth={1.2} /><h3>这类回答可以直接用文字。</h3><p>左侧已经给出完整解释，无需额外的专业组件。右侧只显示生成的交互界面。</p><span className="lab-badge neutral">没有调用 show_intelligent_ui</span></div> : <div className="lab-native-preview intelligent-ui-surface" data-theme="light"><Renderer response={scenario.source || ''} library={intelligentLibrary} toolProvider={demoTools} onAction={onAction} /></div>}
          </PreviewBoundary></>}
          <footer className="lab-preview-footer"><span className={`lab-badge ${!isGallery && scenario.kind === 'canvas' ? 'custom' : 'native'}`}>{isGallery ? 'Open Intelligent UI' : scenario.kind === 'canvas' ? 'AI Creative Lab 自定义扩展' : scenario.kind === 'plain' ? '普通聊天' : 'Open Intelligent UI'}</span><span>{isGallery ? '可操作的上游示例' : scenario.components.join(' · ') || 'Markdown 文字'}</span></footer>
        </section>

        {!isGallery && <section className="lab-trace-panel"><header><span className="lab-eyebrow">03 / TRIGGER TRACE</span><span className="lab-small">预设过程回放</span></header><ol>{trace.map((item, index) => <li key={index} className={stage >= index ? 'done' : ''}><span className="lab-trace-number">{stage > index || stage === 3 ? <Check size={12} /> : index + 1}</span><div><h3>{item.title}</h3><p>{item.detail}</p></div></li>)}</ol><details><summary><Terminal size={14} />查看工具调用参数 <ChevronRight size={14} /></summary><pre>{scenario.tools.length ? JSON.stringify(scenario.tools, null, 2) : '没有工具调用。Agent 直接输出文字。'}</pre></details></section>}

        {(draft || actionLog.length > 0) && <section className="lab-actions-panel"><div className="lab-section-heading"><h3><Terminal size={15} />交互动作记录</h3><button type="button" aria-label="清空动作记录" className="lab-icon-button" onClick={() => { setDraft(''); setActionLog([]); }}><X size={15} /></button></div>{draft && <div className="lab-draft"><span>交给 Agent 的消息草稿</span><p>{draft}</p><button type="button" onClick={() => { setActionLog(current => [`模拟发送用户消息：${draft}`, ...current].slice(0, 5)); setDraft(''); flash('已模拟发送。本页不调用模型。'); }}>模拟发送<ArrowRight size={13} /></button></div>}{actionLog.map((line, index) => <code key={`${line}:${index}`}>{line}</code>)}</section>}

        <section className="lab-principle"><div><span className="lab-eyebrow">HOW IT WORKS</span><h3>触发来自 Agent 的决定。</h3><p>示例 Prompt 描述意图。真实应用里，模型结合上下文决定是否调用工具，以及组合哪些组件；词语本身没有固定的弹窗映射。</p></div><div><span className="lab-badge custom">show_canvas_component</span><p>发布已注册的业务控制器<br /><code>camera / color / storyboard</code></p></div><div><span className="lab-badge native">show_intelligent_ui</span><p>发布完整界面程序<br /><code>title + source</code></p></div></section>
      </div>
    </main>}
    <footer className="lab-page-footer"><span>AI Creative Lab · 创作 Agent 组件实验室</span><span>本页使用项目内真实组件。预设流程仅作说明，不保存项目、不提交生成任务。</span><a href="https://github.com/thesysdev/open-intelligent-ui" target="_blank" rel="noreferrer">Open Intelligent UI<ArrowRight size={12} /></a></footer>
    {toast && <div className="lab-toast" role="status"><Check size={15} />{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<ComponentLibraryDemo />);
