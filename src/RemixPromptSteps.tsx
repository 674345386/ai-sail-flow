import { remixPromptSteps } from '../shared/remix';
import './remix-prompt-steps.css';

export default function RemixPromptSteps({ compact = false }: { compact?: boolean }) {
  return <section className={`remix-prompt-steps${compact ? ' is-compact' : ''}`} aria-label="提示词编写的两个核心步骤">
    <header><h2>提示词编写的两个核心步骤</h2>{!compact && <p>先提取镜头信息，再对照关键帧补充、校正，形成每个镜头的具体画面描述。</p>}</header>
    <ol>{remixPromptSteps.map((step, index) => <li key={step.title}><span className="remix-prompt-step-number" aria-hidden="true">{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol>
    <p className="remix-prompt-steps-output">校正后提示词保留原片镜头的完整细节，应用有证据的补充与校正；下游再结合人物参考与二创要求，编排为 10 秒二创视频提示词。Omni Flash 接收人物参考图和文字提示词；原片关键帧用于编写提示词。</p>
  </section>;
}
