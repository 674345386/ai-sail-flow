import { useMemo, useState } from 'react';
import { Renderer } from '@openuidev/react-lang';
import { openuiExamples, openuiLibrary, ThemeProvider } from '@openuidev/react-ui';
import { library as intelligentLibrary } from './intelligent-ui/library';
import { runLibraryAction } from './intelligent-ui/actions';
import { demoTools } from './intelligent-ui/demo-data';
import { programs } from './intelligent-ui/gallery/programs';
import { toolPrograms } from './intelligent-ui/gallery/tool-programs';
import { compositionPrograms } from './intelligent-ui/gallery/composition-programs';
import '@openuidev/react-ui/components.css';
import 'katex/dist/katex.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './intelligent-ui/components/theme.css';
import './intelligent-ui/components/components.css';
import './intelligent-ui/components/map/map.css';

const intelligentExamples = [...programs, ...toolPrograms, ...compositionPrograms];

export default function OpenUIBuiltinGallery() {
  const [mode, setMode] = useState<'openui' | 'intelligent'>('intelligent');
  const [example, setExample] = useState(0);
  const [search, setSearch] = useState('');
  const activeLibrary = mode === 'intelligent' ? intelligentLibrary : openuiLibrary;
  const components = useMemo(() => Object.values(activeLibrary.components).filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.description?.toLowerCase().includes(search.toLowerCase())), [activeLibrary, search]);
  return <div className="acu-builtin-gallery">
    <div className="acu-builtin-tabs"><button type="button" className={mode === 'intelligent' ? 'active' : ''} onClick={() => { setMode('intelligent'); setExample(0); }}>Open Intelligent UI</button><button type="button" className={mode === 'openui' ? 'active' : ''} onClick={() => { setMode('openui'); setExample(0); }}>原生 OpenUI</button></div>
    <p>当前库提供 {Object.keys(activeLibrary.components).length} 个组件{mode === 'intelligent' ? `、${Object.keys(intelligentLibrary.functions).length} 个交互函数` : ''}。</p>
    {mode === 'intelligent' ? <label className="acu-builtin-search">交互示例<select value={example} onChange={event => setExample(Number(event.target.value))}>{intelligentExamples.map((item, index) => <option key={`${item.id}:${index}`} value={index}>{item.title}</option>)}</select></label>
      : <div className="acu-builtin-tabs">{openuiExamples.map((item, index) => <button type="button" key={index} className={example === index ? 'active' : ''} onClick={() => setExample(index)}>{item.split('\n')[0].replace(/^Example \d+ — /, '').replace(/:$/, '')}</button>)}</div>}
    <div className="acu-builtin-example"><ThemeProvider mode="light">{mode === 'intelligent'
      ? <div className="native-openui-intelligent" data-theme="light"><Renderer key={intelligentExamples[example]?.id} response={intelligentExamples[example]?.code || ''} library={intelligentLibrary} toolProvider={demoTools} onAction={event => { void runLibraryAction(event); }} /></div>
      : <Renderer response={openuiExamples[example].split('\n\n').slice(1).join('\n\n')} library={openuiLibrary} />}</ThemeProvider></div>
    <label className="acu-builtin-search">组件目录<input aria-label="搜索组件" placeholder="搜索组件名称或描述…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="acu-builtin-list">{components.map(item => <span key={item.name} title={item.description}>{item.name}</span>)}</div>
  </div>;
}
