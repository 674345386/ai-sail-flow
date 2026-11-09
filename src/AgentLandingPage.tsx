import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Film, FolderOpen, Image as ImageIcon, Layers3, LoaderCircle, MessageCircle, MousePointer2, Sparkles, WandSparkles, Workflow, X } from 'lucide-react';
import { LanguageSwitch, useLang } from './i18n';
import { agentLandingCopy, agentLandingFeatures, agentLandingIdeas } from './agent-landing-content';
import { IMAGE_MODELS } from '../shared/image-generation-options';
import './agent-landing.css';

const models = [
  { title: IMAGE_MODELS[0].replace('gpt-image-', 'GPT Image ').replace('-flare', ' Flare'), icon: ImageIcon },
  { title: IMAGE_MODELS[1].replace('gpt-image-', 'GPT Image ').replace('-sunburst', ' Sunburst'), icon: ImageIcon },
  { title: 'MiniMax H3', icon: Film },
  { title: 'Gemini 3.8 Flash', icon: Sparkles },
  { title: 'GPT-6.1 Terra', icon: MessageCircle },
];
const featureIcons = [MessageCircle, Film, Workflow, FolderOpen];

export default function AgentLandingPage({ onStart, onStudio, onAccount, accountName, busy = false, error = '' }: {
  onStart: (prompt: string) => void; onStudio: () => void; onAccount: () => void;
  accountName?: string; busy?: boolean; error?: string;
}) {
  const { lang } = useLang();
  const t = agentLandingCopy[lang];
  const [announcement, setAnnouncement] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const feature = agentLandingFeatures[activeFeature];
  const FeatureIcon = featureIcons[activeFeature];
  const focusInput = (value?: string) => {
    if (value !== undefined) setPrompt(value);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    input.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    input.current?.focus({ preventScroll: true });
  };
  const chooseFeature = (index: number) => {
    setActiveFeature(index);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('agent-workflow')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return <div className="agent-landing" data-no-i18n id="agent-top">
    {announcement && <aside className="al-announcement"><a href="#agent-workflow"><span>{t.announcement}</span><ArrowRight size={14} aria-hidden="true" /></a><button type="button" onClick={() => setAnnouncement(false)} aria-label={t.dismiss}><X size={15} /></button></aside>}
    <header className="al-header">
      <a className="al-brand" href="/agent" aria-label="AI-Sail Flow"><img src="/assets/brand/sail-mark-dark-bold.svg" width={30} height={30} alt="" /><span>AI-Sail Flow</span></a>
      <nav className="al-navigation" aria-label={t.navigation}><a href="/agent" aria-current="page">{t.home}</a><button type="button" disabled={busy} onClick={onStudio}>{t.studio}</button><a href="#agent-inspiration">{t.inspiration}</a><a href="#agent-workflow">{t.workflow}</a><a href="/research">Research</a></nav>
      <div className="al-header-actions"><button type="button" className="al-header-start" disabled={busy} onClick={() => onStart('')}>{t.start}<ArrowUpRight size={14} /></button><LanguageSwitch /><button type="button" className="al-account" onClick={onAccount} title={accountName || t.account}>{accountName || t.account}</button></div>
    </header>

    <main>
      <section className="al-hero" aria-labelledby="agent-landing-title">
        <div className="al-hero-sticker al-sticker-left" aria-hidden="true"><div><ImageIcon size={34} strokeWidth={1.2} /><i /><i /><i /><i /></div><MousePointer2 size={23} fill="currentColor" /></div>
        <div className="al-hero-sticker al-sticker-right" aria-hidden="true"><Sparkles size={53} strokeWidth={1.2} /></div>
        <div className="al-models" role="group" aria-label={t.supported}><div className="al-model-track">{[0, 1].map(copy => <div className="al-model-set" key={copy} aria-hidden={copy === 1 ? true : undefined}>{models.map(({ title, icon: Icon }) => <span key={title}><Icon size={20} strokeWidth={1.5} aria-hidden="true" />{title}</span>)}</div>)}</div></div>
        <h1 id="agent-landing-title">{t.title}</h1>
        <p className="al-hero-description">{t.subtitle}</p>
        <form className="al-composer" onSubmit={event => { event.preventDefault(); if (!busy) onStart(prompt); }} aria-busy={busy}>
          <textarea ref={input} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={t.placeholder} aria-label={t.inputLabel} maxLength={6000} rows={3} disabled={busy} />
          <div className="al-composer-actions"><button type="button" className="al-try-idea" disabled={busy} onClick={() => { focusInput(agentLandingIdeas[ideaIndex].prompt[lang]); setIdeaIndex((ideaIndex + 1) % agentLandingIdeas.length); }}><WandSparkles size={15} /><span>{t.tryPrompt}</span></button><button type="submit" className="al-create" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : null}<span>{busy ? t.preparing : t.start}</span>{!busy && <ArrowRight size={18} />}</button></div>
        </form>
        {error && <p className="al-entry-error" role="alert">{error}</p>}
        <nav className="al-capabilities" aria-label={t.capabilityNav}>{agentLandingFeatures.map((item, index) => { const Icon = featureIcons[index]; return <button type="button" key={item.icon} onClick={() => chooseFeature(index)}><Icon size={16} strokeWidth={1.6} />{item.title[lang]}</button>; })}</nav>
      </section>

      <section className="al-inspiration" id="agent-inspiration" aria-labelledby="al-inspiration-title">
        <div className="al-gallery">{agentLandingIdeas.map((idea, index) => <button type="button" className="al-idea" key={idea.image} disabled={busy} onClick={() => focusInput(idea.prompt[lang])} aria-label={`${t.useIdea}: ${idea.label[lang]}`}><img src={idea.image} alt={idea.label[lang]} loading={index < 4 ? 'eager' : 'lazy'} decoding="async" /><span className="al-idea-open"><ArrowUpRight size={17} /></span><span className="al-idea-caption"><small>{idea.category[lang]}</small><strong>{idea.label[lang]}</strong></span></button>)}</div>
        <header><div><h2 id="al-inspiration-title">{t.galleryTitle}</h2><p>{t.galleryHint}</p></div><a href="#agent-landing-title">{t.start}<ArrowUpRight size={16} /></a></header>
      </section>

      <section className="al-workflow" id="agent-workflow" aria-labelledby="al-workflow-title">
        <div className="al-workflow-copy"><h2 id="al-workflow-title">{t.workflowTitle}</h2><p>{t.workflowDescription}</p><div className="al-feature-list" role="group" aria-label={t.workflow}>{agentLandingFeatures.map((item, index) => { const Icon = featureIcons[index]; return <button type="button" key={item.icon} aria-pressed={activeFeature === index} aria-controls="al-workflow-preview" onClick={() => setActiveFeature(index)}><Icon size={19} strokeWidth={1.5} /><span><strong>{item.title[lang]}</strong>{activeFeature === index && <span>{item.detail[lang]}</span>}</span>{activeFeature === index ? <Check size={16} /> : <ArrowUpRight size={15} />}</button>; })}</div></div>
        <div className="al-workflow-preview" id="al-workflow-preview" role="region" aria-label={t.previewLabel}>
          <div className="al-preview-toolbar"><img src="/assets/brand/sail-mark-dark-bold.svg" alt="" width={18} height={18} /><span>{t.previewTitle}</span><span className="al-preview-mode">Agent mode</span></div>
          <div className="al-preview-content"><div className="al-preview-conversation"><span className="al-preview-question">{feature.prompt[lang]}</span><div className="al-preview-answer"><span className="al-agent-avatar"><Sparkles size={14} /></span><p>{feature.reply[lang]}</p></div><div className="al-preview-task"><FeatureIcon size={15} /><span>{feature.title[lang]}</span><Check size={13} /></div></div><div className="al-preview-artifacts"><figure><img key={feature.image} src={feature.image} alt={feature.title[lang]} loading="lazy" /><figcaption><Layers3 size={12} />{t.inputAsset}</figcaption></figure><figure><img key={feature.secondImage} src={feature.secondImage} alt={feature.detail[lang]} loading="lazy" /><figcaption><FeatureIcon size={12} />{t.outputAsset}</figcaption></figure></div></div>
          <p className="al-preview-note">{t.previewNote}</p>
        </div>
      </section>

      <section className="al-faq" aria-labelledby="al-faq-title"><h2 id="al-faq-title">{t.faqTitle}</h2><div>{t.faqs.map(([question, answer]) => <details key={question}><summary><span>{question}</span><ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>
      <section className="al-final"><Sparkles size={28} strokeWidth={1.3} aria-hidden="true" /><h2>{t.finalTitle}</h2><button type="button" className="al-create" onClick={() => focusInput()}>{t.finalAction}<ArrowRight size={17} /></button></section>
    </main>

    <footer className="al-footer"><div><a className="al-brand" href="/agent"><img src="/assets/brand/sail-mark-dark-bold.svg" width={25} height={25} alt="" /><span>AI-Sail Flow</span></a><p>{t.footer}</p></div><nav aria-label={t.navigation}><button type="button" disabled={busy} onClick={onStudio}>{t.studio}</button><a href="/research">Research</a><a href="#agent-top">{t.top}<ArrowUpRight size={13} /></a></nav></footer>
  </div>;
}
