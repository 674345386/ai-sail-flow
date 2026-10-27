import { useState } from 'react';
import type { StudioSection } from '../useUrlSync';

type ModuleKey = Exclude<StudioSection, 'home' | 'welcome' | 'project'>;

/** Creatify-sourced pixel-chevron (viewBox 0 0 3 5) — Sail branding only in UI. */
const PIXEL_CHEVRON =
  'M0 0h1v1H0V0zm1 1h1v1H1V1zm1 1h1v1H2V2zm-1 1h1v1H1V3zM0 4h1v1H0V4z';

function MkCta({
  children,
  size = 'md',
  onClick,
  className = '',
}: {
  children: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button type="button" className={`sl-mk-cta sl-mk-cta-${size} ${className}`.trim()} onClick={onClick}>
      <span className="sl-mk-tag" aria-hidden="true">
        <svg viewBox="0 0 3 5" width="12" height="20" focusable="false" shapeRendering="crispEdges">
          <path fill="currentColor" d={PIXEL_CHEVRON} />
        </svg>
      </span>
      <span className="sl-mk-label">{children}</span>
    </button>
  );
}

const supportChips = [
  '店铺上新',
  'Meta·TikTok 投放',
  '详情 KV',
  '短视频封面',
  '品牌 TVC',
  '竞品复盘',
];

/** Fresh Sail-generated product creatives: 主图 / 卖点 / 场景 / KV */
const heroAds = [
  { src: '/studio/gen/kv-gift.jpg', title: '节日礼遇', sub: '促销 KV' },
  { src: '/studio/gen/main-bottle.jpg', title: '夏日上新', sub: '商品主图' },
  { src: '/studio/gen/sell-skincare.jpg', title: '卖点爆炸', sub: '卖点海报' },
  { src: '/studio/gen/scene-makeup.jpg', title: '场景生活', sub: '产品场景图' },
  { src: '/studio/gen/kv-campaign.jpg', title: '品牌大片', sub: '品牌 KV' },
  { src: '/studio/gen/kv-tech.jpg', title: '封面钩子', sub: '投放竖版' },
  { src: '/studio/gen/main-sneakers.jpg', title: '投放测款', sub: '商品主图' },
  { src: '/studio/gen/sell-shoe.jpg', title: '功能拆解', sub: '卖点海报' },
  { src: '/studio/gen/scene-drink.jpg', title: '夏日场景', sub: '产品场景图' },
  { src: '/studio/gen/main-serum.jpg', title: '护肤上新', sub: '商品主图' },
];

const features: Array<{
  title: string;
  body: string;
  image: string;
  imageLeft: boolean;
}> = [
  {
    title: '链接/图片一键套图',
    body: '粘贴商品链接或上传产品图，自动抽取卖点与视觉元素，几秒生成可投放的主图、卖点图与场景套系。',
    image: '/studio/gen/main-earbuds.jpg',
    imageLeft: true,
  },
  {
    title: '品牌风格可锁定',
    body: '固定品牌色、Logo 与主卖点语气，让每一批素材都像同一品牌发出，减少反复返工与风格漂移。',
    image: '/studio/gen/kv-campaign.jpg',
    imageLeft: false,
  },
  {
    title: '智能批量生成',
    body: '一次产出多组视觉方向，方便 A/B 测试与多 SKU 上新。无需设计师逐张手搓，投放节奏更快。',
    image: '/studio/gen/main-sneakers.jpg',
    imageLeft: true,
  },
  {
    title: '场景化套图拍摄感',
    body: '从单张产品图延展出模特、场景与生活方式画面，做出有「拍摄感」的套图，不必真的进棚。',
    image: '/studio/gen/scene-coffee.jpg',
    imageLeft: false,
  },
  {
    title: '内置精修',
    body: '生成后继续微调标题、背景与版式，不必推倒重来。改一句卖点、换一块色板即可再导出。',
    image: '/studio/gen/sell-skincare.jpg',
    imageLeft: true,
  },
  {
    title: '多平台尺寸导出',
    body: '一键适配店铺主图、详情 KV、Meta / TikTok 信息流与短视频封面尺寸，导出即投放。',
    image: '/studio/gen/kv-tech.jpg',
    imageLeft: false,
  },
];

const metrics = [
  { brand: '跨境店铺 A', value: 'CTR ↑ 38%', detail: '同品类素材平均点击率提升', link: '了解更多' },
  { brand: '投放团队 B', value: '出图 ↓ 12 分钟', detail: '从半天手搓压缩到一批可测', link: '了解更多' },
  { brand: '品牌方 C', value: '20+ 方向 / 次', detail: '单次批量产出可测视觉方向', link: '了解更多' },
  { brand: '内容团队 D', value: '热片结构复用', detail: '雷达热片一键套到自有 SKU', link: '了解更多' },
];

const toolkit: Array<{ section: ModuleKey; title: string; body: string; image: string }> = [
  { section: 'creatives', title: '商品套图', body: '主图 / 卖点 / 场景 / KV', image: '/studio/gen/sell-skincare.jpg' },
  { section: 'radar', title: '爆款雷达', body: '扫热片 · 拆结构 · 找切口', image: '/studio/gen/kv-campaign.jpg' },
  { section: 'tvc', title: 'TVC 成片', body: '静帧创意转短视频脚本', image: '/studio/gen/scene-drink.jpg' },
  { section: 'remake', title: '热片复刻', body: '保留节奏，替换产品与人物', image: '/studio/gen/kv-tech.jpg' },
];

const faqs = [
  {
    q: '工作室有免费额度吗？',
    a: '有。新账号可领取试用额度，用于商品套图与雷达试跑。额度用完后可在内容工作台升级套餐继续生成。',
  },
  {
    q: '爆款工作室包含哪些模块？',
    a: '目前包含商品套图、爆款雷达、TVC 成片与热片复刻。四个模块共用同一品牌风格与项目资产，可互相跳转。',
  },
  {
    q: '使用工作室会影响内容工作台吗？',
    a: '不会。工作室是 AI-Sail 内的独立入口，生成结果可写回项目；内容工作台的工作流、二创与导出逻辑保持不变。',
  },
  {
    q: '图片和素材从哪里来？',
    a: '你可以上传自有产品图，或粘贴商品链接由系统抓取公开详情图；生成结果归你所有，可自由用于店铺与投放。',
  },
  {
    q: '能否导出多平台尺寸？',
    a: '可以。套图支持店铺主图、详情 KV、信息流竖版/横版与短视频封面等常用尺寸，下载后即可投放。',
  },
  {
    q: '品牌风格如何锁定？',
    a: '在套图模块中设置品牌色、Logo 与主卖点语气后会写入项目偏好，后续批量生成会默认沿用，也可随时覆盖。',
  },
];

export default function StudioLanding({
  onOpen,
  onLeave,
  onBackWorkspace,
}: {
  onOpen: (section: ModuleKey) => void;
  onLeave: () => void;
  onBackWorkspace: () => void;
}) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="studio-landing">
      {/* Full-bleed warm sky behind sticky transparent nav + hero (Creatify-style) */}
      <div className="sl-sky" aria-hidden="true">
        <div className="sl-sky-wash" />
        <picture>
          <source srcSet="/studio/warm-glow.avif" type="image/avif" />
          <img src="/studio/warm-glow.png" alt="" className="sl-sky-img" />
        </picture>
      </div>

      <header className="sl-nav">
        <button type="button" className="sl-brand" onClick={onLeave} aria-label="返回 AI-Sail 门户">
          <strong className="sl-brand-word">爆款工作室</strong>
        </button>
        <nav className="sl-nav-links" aria-label="工作室落地页导航">
          <a href="#sl-features">能力</a>
          <a href="#sl-social">案例</a>
          <a href="#sl-toolkit">工具箱</a>
          <a href="#sl-faq">FAQ</a>
        </nav>
        <div className="sl-nav-actions">
          <button type="button" className="sl-btn-ghost" onClick={onBackWorkspace}>内容工作台</button>
          <MkCta size="sm" onClick={() => onOpen('creatives')}>立即开始</MkCta>
        </div>
      </header>

      <main>
        <section className="sl-hero">
          <h1>几秒创建、定制并投放<br />商品套图</h1>
          <p className="sl-lead">
            从文字、产品图或商品链接出发，爆款工作室自动生成可投放的主图与套系素材，适配店铺上新、Meta / TikTok 与详情 KV——并保留完整精修控制。
          </p>
          <div className="sl-hero-cta">
            <MkCta size="lg" onClick={() => onOpen('creatives')}>立即开始</MkCta>
          </div>
        </section>

        <section className="sl-bleed" aria-label="套图示例">
          <div className="sl-bleed-track">
            {[...heroAds, ...heroAds].map((ad, i) => (
              <figure key={`${ad.title}-${i}`} className="sl-bleed-card">
                <div className="sl-bleed-art">
                  <img src={ad.src} alt="" loading="lazy" />
                </div>
                <figcaption>
                  <strong>{ad.title}</strong>
                  <span>{ad.sub}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="sl-logos" aria-label="适用场景">
          <p className="sl-logos-label">
            适用于今日<span>主流场景</span>
          </p>
          <div className="sl-logo-chips">
            {supportChips.map(chip => (
              <span key={chip} className="sl-logo-chip">{chip}</span>
            ))}
          </div>
        </section>

        <section id="sl-features" className="sl-section sl-features">
          <div className="sl-section-head">
            <h2>完整创作控制</h2>
            <p>专业素材工具，零设计门槛</p>
          </div>
          <div className="sl-feature-rows">
            {features.map(item => (
              <article
                key={item.title}
                className={`sl-feature-row ${item.imageLeft ? 'img-left' : 'img-right'}`}
              >
                <div className="sl-feature-media">
                  <img src={item.image} alt="" loading="lazy" className="sl-feature-img" />
                </div>
                <div className="sl-feature-copy">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="sl-social" className="sl-section sl-social">
          <div className="sl-section-head row">
            <h2>团队怎么用爆款工作室</h2>
            <div className="sl-social-nav" aria-hidden="true">
              <button type="button" className="sl-social-arrow" tabIndex={-1}>‹</button>
              <button type="button" className="sl-social-arrow" tabIndex={-1}>›</button>
            </div>
          </div>
          <div className="sl-metric-grid">
            {metrics.map(m => (
              <article key={m.brand} className="sl-metric-card">
                <strong>{m.value}</strong>
                <p>{m.detail}</p>
                <div className="sl-metric-brand">{m.brand}</div>
                <button type="button" className="sl-metric-link" onClick={() => onOpen('creatives')}>
                  {m.link}
                  <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="sl-toolkit" className="sl-toolkit-band">
          <img
            src="/studio/gen/kv-campaign.jpg"
            alt=""
            className="sl-toolkit-glow"
            aria-hidden="true"
          />
          <div className="sl-toolkit-inner">
            <h2>现代投放团队的完整工具箱</h2>
            <div className="sl-toolkit-grid">
              {toolkit.map(item => (
                <button
                  key={item.section}
                  type="button"
                  className="sl-toolkit-card"
                  onClick={() => onOpen(item.section)}
                >
                  <div className="sl-toolkit-art" aria-hidden="true">
                    <img src={item.image} alt="" loading="lazy" />
                  </div>
                  <div className="sl-toolkit-meta">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="sl-final-cta">
          <div className="sl-final-inner">
            <div className="sl-final-copy">
              <h2>准备好生成第一批素材了吗？</h2>
              <p>加入正在用爆款工作室提速上新与投放测款的团队，免费额度即可开始出图。</p>
              <MkCta size="md" onClick={() => onOpen('creatives')}>立即生成素材</MkCta>
            </div>
            <div className="sl-final-art" aria-hidden="true">
              <img src="/studio/gen/main-serum.jpg" alt="" className="sl-final-art-img" />
            </div>
          </div>
        </section>

        <section id="sl-faq" className="sl-section sl-faq">
          <div className="sl-section-head">
            <h2>FAQ</h2>
          </div>
          <div className="sl-faq-list">
            {faqs.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className={`sl-faq-item ${open ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="sl-faq-q"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="sl-faq-icon" aria-hidden="true">{open ? '−' : '+'}</span>
                  </button>
                  {open && <p className="sl-faq-a">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="sl-foot">
        <span>© AI-Sail · 爆款工作室</span>
        <button type="button" className="sl-foot-link" onClick={onBackWorkspace}>内容工作台</button>
      </footer>
    </div>
  );
}
