import { useMemo, useState } from 'react';
import { Renderer } from '@openuidev/react-lang';
import { library } from './intelligent-ui/library';
import { programs } from './intelligent-ui/gallery/programs';
import { compositionPrograms } from './intelligent-ui/gallery/composition-programs';
import { toolPrograms } from './intelligent-ui/gallery/tool-programs';
import { demoTools } from './intelligent-ui/demo-data';
import { runLibraryAction } from './intelligent-ui/actions';
import './intelligent-ui/components/theme.css';
import './intelligent-ui/components/components.css';
import './intelligent-ui/components/map/map.css';

const examples = [...programs, ...compositionPrograms, ...toolPrograms];
export default function IntelligentUIGallery() {
  const [example, setExample] = useState(0);
  const [search, setSearch] = useState('');
  const components = useMemo(() => Object.values(library.components).filter(item => `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase())), [search]);
  return <div className="acu-builtin-gallery">
    <p>Open Intelligent UI · {Object.keys(library.components).length} 个组件 · {Object.keys(library.functions).length} 个交互函数</p>
    <label className="acu-builtin-search">交互示例<select value={example} onChange={event => setExample(Number(event.target.value))}>{examples.map((item, index) => <option key={`${item.id}:${index}`} value={index}>{item.title}</option>)}</select></label>
    <div className="acu-builtin-example intelligent-ui-surface" data-theme="light"><Renderer key={examples[example].id} response={examples[example].code} library={library} toolProvider={demoTools} onAction={event => { void runLibraryAction(event); }} /></div>
    <label className="acu-builtin-search">组件目录<input aria-label="搜索组件" placeholder="搜索组件名称或描述…" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <div className="acu-builtin-list">{components.map(item => <span key={item.name} title={item.description}>{item.name}</span>)}</div>
  </div>;
}
