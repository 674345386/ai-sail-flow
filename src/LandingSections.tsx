import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import './landing-sections.css';

const V2 = '/assets/landing/v2';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Muted, inline loop that only plays while on screen; reduced-motion users get the poster. */
function LoopVideo({ name, label, className = '' }: { name: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const video = ref.current;
    if (!video || reduced) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { video.preload = 'auto'; void video.play().catch(() => {}); } else video.pause();
    }, { rootMargin: '120px 0px', threshold: 0.15 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);
  return <video ref={ref} className={className} src={`${V2}/${name}.mp4`} poster={`${V2}/${name}.webp`} muted loop playsInline preload="none" aria-label={label || undefined} aria-hidden={label ? undefined : true} />;
}

/** Adds .is-visible to children marked [data-reveal] once they scroll into view. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = root.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(item => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Eyebrow({ children }: { children: ReactNode }) { return <p className="ls-eyebrow">{children}</p>; }
const delay = (index: number) => ({ '--ls-delay': `${index * 80}ms` }) as CSSProperties;

/* ---------- 1 · Statement + result reel ---------- */
const reels = [
  { name: 'reel-1', market: '美国', category: '护肤精华', note: '参考片 8 个镜头 → 换成自家精华瓶' },
  { name: 'reel-2', market: '欧洲', category: '亚麻衬衫 · 服饰', note: '保留晨光机位，口播改成本地说法' },
  { name: 'reel-3', market: '中东', category: '冷萃杯 · 户外', note: '倒饮特写逐帧对齐原片构图' },
  { name: 'reel-4', market: '日本', category: '桌面充电灯 · 3C', note: '夜景运镜照搬，替换产品外观' },
  { name: 'reel-5', market: '北欧', category: '家居 · 软装', note: '同一条参考，换品类再出一版' },
];

function StatementSection({ onEnter }: { onEnter: () => void }) {
  const ref = useReveal<HTMLElement>();
  return <section ref={ref} className="ls-section ls-statement" id="made" aria-labelledby="ls-statement-title">
    <div className="ls-wrap">
      <div className="ls-statement-head">
        <Eyebrow>为出海短视频团队打造</Eyebrow>
        <h2 id="ls-statement-title" data-reveal>别人跑出来的爆款，<br />是你下一条视频的分镜。</h2>
        <div className="ls-statement-aside" data-reveal style={delay(1)}>
          <p>上传一条参考视频，AI-Sail Flow 逐镜头拆开它的结构，再按你的产品重新写、重新出首帧、重新生成。方法照搬，表达是你自己的。</p>
          <dl className="ls-stats">
            <div><dt>1 条</dt><dd>参考视频起步</dd></div>
            <div><dt>逐镜头</dt><dd>拆解与重写</dd></div>
            <div><dt>单镜</dt><dd>不满意只重做这一镜</dd></div>
          </dl>
          <button className="ls-link" onClick={onEnter}>上传一条参考视频 <ArrowUpRight size={16} /></button>
        </div>
      </div>
      <div className="ls-reel" role="list">
        {reels.map((reel, index) => <figure className="ls-reel-item" role="listitem" key={reel.name} data-reveal style={delay(index)}>
          <div className="ls-media ls-media-vertical"><LoopVideo name={reel.name} label={`${reel.market}市场 ${reel.category} 示意短片`} /></div>
          <figcaption><span>{reel.market} · {reel.category}</span><small>{reel.note}</small></figcaption>
        </figure>)}
      </div>
      <div className="ls-reel-foot">
        <p className="ls-footnote">画面为示意素材，展示同一套流程在不同品类与市场中的用法。</p>
        <p className="ls-swipe-hint" aria-hidden="true">左右滑动查看 5 个案例 →</p>
        <p className="ls-platforms">适用于 TikTok · Instagram Reels · YouTube Shorts 等竖屏短视频</p>
      </div>
    </div>
  </section>;
}

/* ---------- 2 · Step story with sticky media ---------- */
const steps = [
  { key: 'source', index: '01', title: '放进一条你想复刻的爆款', body: '直接上传 TikTok、Reels 或 Shorts 的成片。不需要脚本、不需要标注，视频和音轨会一起被读取。', meta: '支持竖屏短视频 · 自动抽取音轨' },
  { key: 'breakdown', index: '02', title: '逐镜头读懂爆款', body: '每个镜头一张关键帧、一段描述：在拍什么、怎么运镜、商品在第几秒出场、哪一句口播推动了下单。整条视频的节奏一目了然。', meta: '关键帧 · 运镜 · 口播 · 商品时刻' },
  { key: 'rewrite', index: '03', title: '按你的产品重写每一镜', body: '产品长什么样，以你上传的产品图为准；构图、场景、动作和运镜，沿用原镜头。卖点只写你确认过的事实，不替你编。', meta: '产品图约束外观 · 原镜头约束构图' },
  { key: 'keyframes', index: '04', title: '生成新的首帧，并排对照原片', body: '每一镜先出一张重制首帧，和原镜头左右并排看。哪一镜不对，改提示词、单独重试，其余镜头不受影响。', meta: '图生视频首帧 · 单镜重试' },
  { key: 'export', index: '05', title: '导出，或直接生成视频', body: '把分镜、首帧和提示词打包交给剪辑或外部工具，也可以直接调用 Veo 3.1 逐镜生成，再配音、加字幕、拼成完整成片。', meta: '提示词包 · Veo 3.1 · 配音字幕' },
];

function StepStorySection({ onEnter }: { onEnter: () => void }) {
  const ref = useReveal<HTMLElement>();
  const [active, setActive] = useState(0);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
    }), { rootMargin: '-45% 0px -45% 0px' });
    root.querySelectorAll('[data-step]').forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [ref]);
  return <section ref={ref} className="ls-section ls-steps" id="models" aria-labelledby="ls-steps-title">
    <div className="ls-wrap">
      <header className="ls-section-head" data-reveal>
        <Eyebrow>拆解引擎</Eyebrow>
        <h2 id="ls-steps-title">看懂一条爆款，只要一次</h2>
        <p>从一条参考视频到一组能直接开拍、能直接生成的新素材，中间每一步都摆在你面前，随时可以停下来改。</p>
      </header>
      <div className="ls-steps-grid">
        <div className="ls-steps-media" aria-hidden="true">
          <div className="ls-media ls-steps-frame">
            {steps.map((step, index) => <img key={step.key} src={`${V2}/step-${step.key}.webp`} alt="" loading="lazy" decoding="async" className={index === active ? 'is-active' : ''} />)}
            <div className="ls-steps-hud"><span>{steps[active].index} / 05</span><span>{steps[active].meta}</span></div>
          </div>
        </div>
        <ol className="ls-steps-list">
          {steps.map((step, index) => <li key={step.key} data-step={index} className={index === active ? 'is-active' : ''}>
            <span className="ls-step-index">{step.index}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <img className="ls-step-inline" src={`${V2}/step-${step.key}.webp`} alt="" loading="lazy" decoding="async" />
            </div>
          </li>)}
        </ol>
      </div>
      <div className="ls-actions" data-reveal>
        <button className="ls-btn ls-btn-solid" onClick={onEnter}>拆解我的第一条视频 <ArrowRight size={16} /></button>
        <button className="ls-btn ls-btn-ghost" onClick={() => document.getElementById('made')?.scrollIntoView({ behavior: 'smooth' })}>看看做出来的视频</button>
      </div>
    </div>
  </section>;
}

/* ---------- 3 · Source vs recreation wipe ---------- */
function CompareSection() {
  const ref = useReveal<HTMLElement>();
  const reduced = usePrefersReducedMotion();
  const [split, setSplit] = useState(50);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || reduced) return;
    let frame = 0; const start = performance.now();
    const tick = (now: number) => { setSplit(50 + Math.sin((now - start) / 1600) * 18); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [touched, reduced]);
  return <section ref={ref} className="ls-section ls-dark ls-compare" id="compare" aria-labelledby="ls-compare-title">
    <div className="ls-wrap">
      <header className="ls-compare-head" data-reveal>
        <Eyebrow>拆解视图 / 原画面</Eyebrow>
        <h2 id="ls-compare-title">每一帧，都被读成<br />可以复用的结构。</h2>
        <p>拖动看看：左边是 AI-Sail Flow 从一个镜头里读到的东西——景别、人物位置、商品出场的时间点、运镜方式。重写时，这些骨架原样保留，主角换成你的产品。</p>
      </header>
      <div className="ls-compare-stage ls-media" data-reveal style={{ '--split': `${split}%` } as CSSProperties}>
        <img src={`${V2}/cmp-remake.webp`} alt="参考镜头原画面示意" loading="lazy" decoding="async" />
        <div className="ls-compare-top"><img src={`${V2}/cmp-source.webp`} alt="同一镜头的拆解视图：标注景别、人物与商品出场时间" loading="lazy" decoding="async" /></div>
        <span className="ls-compare-tag left">拆解视图</span><span className="ls-compare-tag right">原画面</span>
        <span className="ls-compare-handle" aria-hidden="true" />
        <input type="range" min={0} max={100} value={Math.round(split)} aria-label="拖动对比拆解视图与原画面" onChange={event => { setTouched(true); setSplit(Number(event.target.value)); }} />
      </div>
      <div className="ls-compare-specs">
        <div data-reveal><h3>沿用原片</h3><ul><li>镜头顺序与时长</li><li>构图、景别与运镜</li><li>开场钩子与节奏点</li></ul></div>
        <div data-reveal style={delay(1)}><h3>换成你的</h3><ul><li>产品外观，以产品图为准</li><li>卖点与口播，只用确认过的事实</li><li>场景和人物，贴合目标市场</li></ul></div>
        <div data-reveal style={delay(2)}><h3>由你把关</h3><ul><li>逐镜并排审阅</li><li>改提示词，单镜重试</li><li>满意的镜头锁定不动</li></ul></div>
      </div>
    </div>
  </section>;
}

/* ---------- 4 · Tools: two centred headlines, each over a 3-column grid ---------- */
type ToolAction = 'enter' | 'made' | 'models' | 'creator' | 'pricing';
type ToolColumn = { label: string; image: string; video?: boolean; position?: string; alt: string; title: string; body: string; actions: { text: string; to: ToolAction }[]; note?: string };
const toolBlocks: { id: string; title: [string, string]; columns: ToolColumn[] }[] = [
  {
    id: 'ls-tools-a',
    title: ['从发现热点到完成创作，', '让好想法成为好作品'],
    columns: [
      { label: 'Creative｜创意', image: 'tool-create', video: true, alt: '两位顾客提着购物袋走在街头的示意画面', title: '把灵感变成画面，让创意有更多可能。', body: '在同一个工作空间中，完成视频拆解、图片生成与内容改写。围绕你的产品和受众，将参考素材转化为新的创意方案，让每一个想法都有清晰的创作起点。', actions: [{ text: '开始创作', to: 'enter' }, { text: '了解更多', to: 'models' }], note: '画面为示意素材。' },
      { label: 'Easy Dev｜轻松创作', image: 'tool-export', video: true, alt: '创作者在工作室用平板查看一组分镜的示意画面', title: '从一个想法出发，轻松推进每一步创作。', body: '上传参考视频，补充产品信息，跟随引导完成镜头拆解、人物生成与视频二创。将复杂的制作过程拆成清晰步骤，减少重复操作，让你把精力放在内容本身。', actions: [{ text: '立即体验', to: 'enter' }, { text: '查看创作指南', to: 'models' }] },
      { label: 'Trend Radar｜挖掘热点', image: 'tool-trend', video: true, alt: '两位创作者在工作室里一起审看热门视频的示意画面', title: '看懂热门内容，找到适合你的创作机会。', body: '从热门视频中拆解吸引注意的开场、推动观看的节奏，以及打动受众的产品表达。提炼值得借鉴的创意结构，结合你的产品与目标市场，为下一条视频找到方向。', actions: [{ text: '开始拆解', to: 'enter' }, { text: '探索创意案例', to: 'made' }] },
    ],
  },
];

/* Model provider marks: Simple Icons (CC0) for OpenAI / Claude / Gemini, Lobe Icons (MIT) for Grok. */
const MODEL_MARKS = [
  { name: 'OpenAI', path: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z', fill: '#0f0f10' },
  { name: 'Claude', path: 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z', fill: '#D97757' },
  { name: 'Gemini', path: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81', fill: 'url(#ls-gemini-gradient)' },
  { name: 'Grok', path: 'M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815', fill: '#0f0f10', evenOdd: true },
];

function ModelMarks() {
  return <ul className="ls-models" aria-label="支持的模型">
    {MODEL_MARKS.map((mark, index) => <li key={mark.name} style={{ '--i': index } as CSSProperties}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {mark.name === 'Gemini' && <defs><linearGradient id="ls-gemini-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#4285F4" /><stop offset=".55" stopColor="#9B72CB" /><stop offset="1" stopColor="#D96570" /></linearGradient></defs>}
        <path d={mark.path} fill={mark.fill} fillRule={mark.evenOdd ? 'evenodd' : undefined} />
      </svg>
      <span>{mark.name}</span>
    </li>)}
  </ul>;
}

function FeatureSection({ onEnter }: { onEnter: () => void }) {
  const ref = useReveal<HTMLElement>();
  const run = (to: ToolAction) => to === 'enter' ? onEnter() : document.getElementById(to)?.scrollIntoView({ behavior: 'smooth' });
  return <section ref={ref} className="ls-section ls-tools" id="tools" aria-label="工具">
    <div className="ls-wrap">
      {toolBlocks.map(block => <div className="ls-tools-block" key={block.id}>
        <header className="ls-compare-head ls-tools-head" data-reveal>
          <h2 id={block.id}>{block.title[0]}<br />{block.title[1]}</h2>
          <div className="ls-tools-aside">
            <p>实时跟进业界最强的生成模型，用最先进的制作流程，把每一个热点变成你的作品。</p>
            <ModelMarks />
          </div>
        </header>
        <div className="ls-tools-grid">
          {block.columns.map((col, index) => <article className="ls-tool-col" key={col.label} aria-labelledby={`${block.id}-${index}`} data-reveal style={delay(index)}>
            <p className="ls-tool-label">{col.label}</p>
            <div className="ls-media ls-tool-media">{col.video ? <LoopVideo name={col.image} label={col.alt} /> : <img src={`${V2}/${col.image}.webp`} alt={col.alt} loading="lazy" decoding="async" style={col.position ? { objectPosition: col.position } : undefined} />}</div>
            <h3 id={`${block.id}-${index}`}>{col.title}</h3>
            <p className="ls-tool-body">{col.body}</p>
            <div className="ls-tool-actions">{col.actions.map((action, i) => <button key={action.text} className={i === 0 ? 'is-primary' : ''} onClick={() => run(action.to)}>{action.text}</button>)}</div>
            {col.note && <p className="ls-tool-note">{col.note}</p>}
          </article>)}
        </div>
      </div>)}
    </div>
  </section>;
}

/* ---------- 5 · Flow 创作营 (teams + markets) ---------- */
const teams = [
  { name: 'TikTok Shop 卖家', image: 'use-beauty', line: '一周要上二十条新视频？', body: '把同类目里跑量的视频拆开，按自家 SKU 批量重写，挑出最像的镜头先测。' },
  { name: '独立站增长团队', image: 'use-toys', line: '投放素材总是不够换。', body: '同一条爆款结构，换场景、换人物、换开场钩子，几个版本一次出齐。' },
  { name: '海外社媒代理商', image: 'use-fashion', line: '客户多，市场也多。', body: '每个客户一个创意，产品事实和目标市场分开管理，交付物统一成提示词包。' },
  { name: 'DTC 品牌内容组', image: 'use-home', line: '要快，也要守住品牌。', body: '外观以产品图为准，卖点只用确认过的说法，审阅时逐镜对照原片。' },
];
const markets = [
  { name: '北美', lang: '英语 · 西语', platform: 'TikTok Shop · Reels', tone: '真实测评、开箱、前后对比' },
  { name: '中东', lang: '阿拉伯语 · 英语', platform: 'TikTok · Snapchat', tone: '质感场景、家庭与礼赠' },
  { name: '东南亚', lang: '印尼语 · 泰语 · 越南语', platform: 'TikTok Shop · Shopee Video', tone: '高频直给、价格与促销' },
  { name: '日韩', lang: '日语 · 韩语', platform: 'Reels · Shorts', tone: '细节特写、克制的口播' },
];

function CreatorSection({ onEnter }: { onEnter: () => void }) {
  const ref = useReveal<HTMLElement>();
  const [active, setActive] = useState(0);
  const team = teams[active];
  return <section ref={ref} className="ls-section ls-creator" id="creator" aria-labelledby="ls-creator-title">
    <div className="ls-wrap">
      <header className="ls-section-head ls-head-split" data-reveal>
        <div><Eyebrow>Flow 创作营</Eyebrow><h2 id="ls-creator-title">给每天都在<br />找下一条爆款的人</h2></div>
        <p>不同团队卡在不同地方。选一个最像你的，看看这套流程会怎么接进你的日常。</p>
      </header>
      <div className="ls-teams" data-reveal>
        <div className="ls-team-tabs" role="tablist" aria-label="选择团队类型">
          {teams.map((item, index) => <button key={item.name} role="tab" id={`ls-team-tab-${index}`} aria-selected={index === active} aria-controls="ls-team-panel" className={index === active ? 'is-active' : ''} onClick={() => setActive(index)}>
            <span>{String(index + 1).padStart(2, '0')}</span>{item.name}
          </button>)}
        </div>
        <div className="ls-team-panel" role="tabpanel" id="ls-team-panel" aria-labelledby={`ls-team-tab-${active}`}>
          <div className="ls-media"><img key={team.image} src={`${V2}/${team.image}.webp`} alt={`${team.name}的工作场景示意`} loading="lazy" decoding="async" /></div>
          <div className="ls-team-copy"><h3>{team.line}</h3><p>{team.body}</p><button className="ls-link" onClick={onEnter}>进入工作台 <ArrowUpRight size={16} /></button></div>
        </div>
      </div>
      <div className="ls-markets">
        <p className="ls-markets-title" data-reveal>同一条参考，按市场改写语言、场景和说法</p>
        {markets.map((market, index) => <article key={market.name} className="ls-market" data-reveal style={delay(index)}>
          <h3>{market.name}</h3>
          <dl><div><dt>语言</dt><dd>{market.lang}</dd></div><div><dt>常见平台</dt><dd>{market.platform}</dd></div><div><dt>常见打法</dt><dd>{market.tone}</dd></div></dl>
        </article>)}
      </div>
    </div>
  </section>;
}

/* ---------- 6 · CTA band ---------- */
function CtaBand({ onEnter }: { onEnter: () => void }) {
  const ref = useReveal<HTMLElement>();
  return <section ref={ref} className="ls-cta" id="start" aria-labelledby="ls-cta-title">
    <LoopVideo name="cta-ambient" label="" className="ls-cta-video" />
    <div className="ls-cta-scrim" />
    <div className="ls-wrap ls-cta-inner" data-reveal>
      <h2 id="ls-cta-title">挑一条你最想复刻的视频，<br className="ls-br-desktop" />现在就开始拆。</h2>
      <div className="ls-actions">
        <button className="ls-btn ls-btn-light" onClick={onEnter}>拆解我的第一条视频 <ArrowRight size={16} /></button>
        <a className="ls-btn ls-btn-outline-light" href="#pricing">查看价格</a>
      </div>
    </div>
  </section>;
}

export default function LandingSections({ onEnter }: { onEnter: () => void }) {
  return <>
    <StatementSection onEnter={onEnter} />
    <StepStorySection onEnter={onEnter} />
    <CompareSection />
    <FeatureSection onEnter={onEnter} />
    <CreatorSection onEnter={onEnter} />
    <CtaBand onEnter={onEnter} />
  </>;
}
