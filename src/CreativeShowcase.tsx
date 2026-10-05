import { useRef } from 'react';
import { Clapperboard, ScanLine, WandSparkles } from 'lucide-react';
import heroVideo from './assets/landing/commerce-hero-reference.mp4';
import heroPoster from './assets/landing/commerce-hero-reference-poster.jpg';

const shots = [
  { title: '色卡开场', time: 0.5, timestamp: '00:00', image: 'opening' },
  { title: '穿搭展示', time: 2.5, timestamp: '00:02', image: 'outfit' },
  { title: '换装转场', time: 4.8, timestamp: '00:04', image: 'transition' },
  { title: '色彩变化', time: 9.2, timestamp: '00:09', image: 'color' },
];
const workflow = [
  { icon: ScanLine, title: '读懂参考', description: '拆解镜头、节奏与产品表达' },
  { icon: WandSparkles, title: '生成创意', description: '结合您的产品与目标市场改写' },
  { icon: Clapperboard, title: '制作视频', description: '从分镜方案到创意成片' },
];

export default function CreativeShowcase() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekTo = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    void video.play().catch(() => {});
  };

  return <section className="creative-showcase" id="made" aria-labelledby="creative-showcase-title">
    <div className="creative-showcase-inner">
      <header className="creative-showcase-heading">
        <h2 id="creative-showcase-title">成就您的<br />出海创意之作</h2>
        <p>从一条真实参考视频出发，把有效镜头、产品表达和购买动机，变成可执行的全球内容方案。</p>
      </header>
      <div className="creative-showcase-content">
        <div className="creative-showcase-panel">
          <div className="creative-showcase-panel-heading"><h3>参考视频</h3><span>穿搭与色彩创意</span></div>
          <div className="creative-showcase-film">
            <video ref={videoRef} src={heroVideo} poster={heroPoster} controls playsInline preload="none" aria-label="穿搭与色彩创意参考视频" />
          </div>
        </div>
        <div className="creative-showcase-panel">
          <div className="creative-showcase-panel-heading"><h3>镜头速览</h3><span>点击查看对应片段</span></div>
          <div className="creative-showcase-shots">
            {shots.map(shot => <button className="creative-showcase-shot" key={shot.image} onClick={() => seekTo(shot.time)} aria-label={`播放${shot.title}，从 ${shot.time} 秒开始`}>
              <span className="creative-showcase-shot-image"><img src={`/assets/landing/showcase-${shot.image}.jpg`} alt={shot.title} loading="lazy" decoding="async" /></span>
              <span className="creative-showcase-shot-caption"><strong>{shot.title}</strong><time>{shot.timestamp}</time></span>
            </button>)}
          </div>
        </div>
      </div>
      <div className="creative-showcase-workflow">
        {workflow.map(({ icon: Icon, title, description }) => <div key={title}><Icon size={20} strokeWidth={1.5} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></div>)}
      </div>
    </div>
  </section>;
}
