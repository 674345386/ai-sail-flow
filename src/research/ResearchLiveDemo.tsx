import { useEffect, useRef, useState } from 'react';
import { Renderer } from '@openuidev/react-lang';
import { Play, RefreshCw } from 'lucide-react';
import { researchDemoLibrary } from './demo-library';
import { researchDemoPrograms } from './demo-programs';
import '../intelligent-ui/components/theme.css';
import '../intelligent-ui/components/components.css';

export default function ResearchLiveDemo() {
  const [version, setVersion] = useState(0);
  const [source, setSource] = useState(researchDemoPrograms[0]);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stop = () => { clearInterval(timer.current); setPlaying(false); };
  useEffect(() => () => clearInterval(timer.current), []);

  const stream = (next: number) => {
    clearInterval(timer.current); setVersion(next); setError('');
    const program = researchDemoPrograms[next];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { stop(); setSource(program); return; }
    setPlaying(true); setSource('');
    let length = 0;
    const step = Math.ceil(program.length / 14);
    timer.current = setInterval(() => {
      length = Math.min(program.length, length + step);
      setSource(program.slice(0, length));
      if (length === program.length) stop();
    }, 90);
  };

  return <figure className="research-live">
    <figcaption><div><strong>从程序到界面</strong><span>项目中的真实组件与渲染器 · 本地交互示例</span></div><div className="research-live-actions"><button className="research-button" type="button" disabled={playing} onClick={() => stream(version)}><Play size={13} />重放生成</button><button className="research-button" type="button" disabled={playing} onClick={() => stream(version === 0 ? 1 : 0)}><RefreshCw size={13} />更新结果</button></div></figcaption>
    <div className="research-live-columns">
      <div className="research-live-source"><span className="research-live-label">UI 程序</span><pre aria-label="示例 UI 程序"><code>{source || 'root ='}</code></pre></div>
      <div className="research-live-output"><div className="research-live-label">渲染结果<span role="status">{playing ? '生成中…' : `第 ${version + 1} 版`}</span></div><div className="research-live-preview intelligent-ui-surface" data-theme="light"><Renderer response={source} library={researchDemoLibrary} isStreaming={playing} onError={failures => { if (!playing) setError(failures.map(item => item.message).join('；')); }} />{error && <p role="alert" className="research-demo-error">示例未能完成渲染：{error}</p>}</div></div>
    </div>
    <p className="research-live-note">切换“精简 / 展开”可直接改变组件内容；“更新结果”会流式呈现另一版程序。本示例不调用模型或提交生成任务。</p>
  </figure>;
}
