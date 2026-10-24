import { Copy, Download, Grid2X2, Info } from 'lucide-react';
import type { StoryboardGrid } from '../shared/domain';

export default function StoryboardGridPanel({ grids, disabled, onCopy, onPrompt }: {
  grids: StoryboardGrid[];
  disabled: boolean;
  onCopy: (value: string) => void;
  onPrompt: (id: string, prompt: string) => void;
}) {
  return <div className="storyboard-grid-results">
    <div className="storyboard-grid-intro"><Info size={15} /><p>每张网格对应一段不超过 8 秒的原片。Prompt 已按从左到右、从上到下的格子顺序组织镜头和动作。</p></div>
    {grids.map((grid, index) => <article className="storyboard-grid-card" key={grid.id}>
      <header><div><span><Grid2X2 size={15} />分镜网格 {String(index + 1).padStart(2, '0')}</span><strong>{grid.gridSize}×{grid.gridSize} · {grid.start.toFixed(2)}–{grid.end.toFixed(2)} 秒</strong></div><div className="storyboard-grid-actions"><a className="btn small" href={grid.url} download={grid.filename}><Download size={14} />下载网格</a><button className="btn small" type="button" onClick={() => onCopy(grid.prompt)}><Copy size={14} />复制 Prompt</button></div></header>
      <div className="storyboard-grid-body">
        <a className="storyboard-grid-image" href={grid.url} target="_blank" rel="noreferrer"><img src={grid.url} alt={`分镜网格 ${index + 1}`} /></a>
        <label><span>视频生成 Prompt</span><textarea className="input" rows={18} value={grid.prompt} disabled={disabled} onChange={event => onPrompt(grid.id, event.target.value)} /></label>
      </div>
    </article>)}
  </div>;
}
