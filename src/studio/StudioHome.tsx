import { ArrowUpRight, Clapperboard, ImagePlus, Radar, Sparkles } from 'lucide-react';
import type { StudioSection } from '../useUrlSync';

const modules: Array<{
  section: Exclude<StudioSection, 'home' | 'welcome' | 'project'>;
  icon: typeof ImagePlus;
  title: string;
  en: string;
  body: string;
  cta: string;
}> = [
  {
    section: 'creatives',
    icon: ImagePlus,
    title: '商品套图',
    en: 'PRODUCT SETS',
    body: '一键生成主图、卖点图、场景图与 KV 视觉。适合上新、投放素材与店铺装修。',
    cta: '开始生成套图',
  },
  {
    section: 'radar',
    icon: Radar,
    title: '爆款雷达',
    en: 'HOT VIDEO RADAR',
    body: '按品类与关键词扫描平台热片，沉淀可复用的结构、钩子与卖点表达。',
    cta: '打开雷达搜索',
  },
  {
    section: 'tvc',
    icon: Clapperboard,
    title: 'TVC 成片',
    en: 'TVC FROM CREATIVES',
    body: '把已生成的产品创意串联成 15–30 秒品牌短片脚本与分镜草案。',
    cta: '进入 TVC 工作台',
  },
  {
    section: 'remake',
    icon: Sparkles,
    title: '热片复刻',
    en: 'REMAKE FROM RADAR',
    body: '从雷达选中的爆款出发，替换产品与人物，生成可继续精修的二创方案。',
    cta: '从热片开始复刻',
  },
];

/** In-app module overview (light Creatify-like cards). Landing lives in StudioLanding. */
export default function StudioHome({ onOpen }: { onOpen: (section: Exclude<StudioSection, 'home' | 'welcome' | 'project'>) => void }) {
  return (
    <div className="studio-stack">
      <div className="studio-hero">
        <div>
          <div className="eyebrow">AI-SAIL STUDIO <span>/</span> 爆款工作室</div>
          <h1>选择一个模块开始</h1>
          <p>商品套图、爆款雷达、TVC 与热片复刻互不打扰现有「素材 → 拆解 → 二创」流程。</p>
        </div>
      </div>
      <div className="studio-module-grid">
        {modules.map(module => {
          const Icon = module.icon;
          return (
            <button key={module.section} type="button" className="studio-module-card" onClick={() => onOpen(module.section)}>
              <span className="card-icon"><Icon size={18} /></span>
              <div>
                <div className="eyebrow">{module.en}</div>
                <h2>{module.title}</h2>
              </div>
              <p>{module.body}</p>
              <span className="card-cta">{module.cta} <ArrowUpRight size={14} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
