import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowRight, ChevronDown, Film, Image, LoaderCircle, Plus, X } from 'lucide-react';
import { IMAGE_MODELS } from '../shared/image-generation-options';
import { useDict } from './i18n';
import { promptMediaAccept } from './AgentPromptMedia';
import { landingPromptModels } from './landing-prompt-models';
import './landing-prompt-hero.css';

const messages = {
  'zh-CN': {
    title: '好创意，从一句话开始。', subtitle: '描述你的想法，让 AI-Sail Flow 帮你完成下一支作品。',
    placeholder: '描述你想创作的内容，例如：为我的香水制作一支有电影感的夏日广告…',
    prompt: '描述你的创作想法', models: 'AI 创作模型', model: '选择创作模型', automatic: '自动选择',
    video: '视频', image: '图片', kind: '创作类型', attach: '添加参考图片或视频', remove: '移除',
    start: '开始创作', preparing: '正在准备', overview: '认识 AI-Sail Flow',
    empty: '先写下你的想法，再开始创作。', formats: '请选择 JPG、PNG、WebP 图片或 MP4、MOV、WebM 视频。',
    tooLarge: '图片最多 10 MB，视频最多 250 MB。', tooMany: '最多添加 3 张参考图片和 1 条参考视频。',
    intent: '创作类型：', preferredModel: '希望使用的模型：',
  },
  en: {
    title: 'Every great idea starts with a prompt.', subtitle: 'Describe your idea. Let AI-Sail Flow help you bring your next creation to life.',
    placeholder: 'Describe what you want to create, e.g. a cinematic summer campaign for my perfume…',
    prompt: 'Describe your creative idea', models: 'AI creative models', model: 'Choose a creation model', automatic: 'Auto',
    video: 'Video', image: 'Image', kind: 'Creation type', attach: 'Add reference images or a video', remove: 'Remove',
    start: 'Start creating', preparing: 'Preparing', overview: 'Meet AI-Sail Flow',
    empty: 'Write down your idea to start creating.', formats: 'Choose JPG, PNG, or WebP images, or an MP4, MOV, or WebM video.',
    tooLarge: 'Images can be up to 10 MB; videos can be up to 250 MB.', tooMany: 'Add up to 3 reference images and 1 reference video.',
    intent: 'Creation type: ', preferredModel: 'Preferred model: ',
  },
};

type Reference = { id: string; file: File; kind: 'video' | 'image'; url: string };
const referenceKind = (file: File): Reference['kind'] | null => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'image';
  if (['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) return 'video';
  if (file.type && file.type !== 'application/octet-stream') return null;
  return /\.(jpe?g|png|webp)$/i.test(file.name) ? 'image' : /\.(mp4|mov|webm)$/i.test(file.name) ? 'video' : null;
};

export default function LandingPromptHero({ onStart, busy, error }: {
  onStart: (prompt: string, files: File[]) => void; busy: boolean; error?: string;
}) {
  const t = useDict(messages);
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<'video' | 'image'>('video');
  const [model, setModel] = useState('auto');
  const [references, setReferences] = useState<Reference[]>([]);
  const [inputError, setInputError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  const previewUrls = useRef(new Set<string>());
  const choices = kind === 'video'
    ? [{ id: 'veo-3.1', label: 'Veo 3.1' }]
    : IMAGE_MODELS.map(id => ({ id, label: id === 'gpt-image-2.6-flare' ? 'GPT Image 2.6 Flare' : 'GPT Image 2.6 Sunburst' }));

  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  useEffect(() => {
    const hero = section.current;
    const page = hero?.parentElement;
    if (!hero || !page) return;
    const chrome = Array.from(page.children).filter(element => element.matches('.landing-nav, .landing-announcement'));
    const update = () => {
      const height = chrome.reduce((sum, element) => sum + element.getBoundingClientRect().height, 0);
      hero.style.setProperty('--lp-chrome-height', `${height}px`);
    };
    const observer = new ResizeObserver(update);
    chrome.forEach(element => observer.observe(element));
    update();
    return () => observer.disconnect();
  }, []);

  const addReferences = (files: File[]) => {
    const entries = files.map(file => ({ file, kind: referenceKind(file) }));
    if (entries.some(item => !item.kind)) { setInputError(t.formats); return; }
    if (entries.some(item => item.file.size > (item.kind === 'video' ? 250 : 10) * 1024 * 1024)) { setInputError(t.tooLarge); return; }
    if (references.filter(item => item.kind === 'image').length + entries.filter(item => item.kind === 'image').length > 3
      || references.filter(item => item.kind === 'video').length + entries.filter(item => item.kind === 'video').length > 1) { setInputError(t.tooMany); return; }
    setReferences(current => [...current, ...entries.map(({ file, kind }) => {
      const url = URL.createObjectURL(file); previewUrls.current.add(url);
      return { id: crypto.randomUUID(), file, kind: kind!, url };
    })]);
    setInputError('');
  };
  const removeReference = (id: string) => {
    const item = references.find(reference => reference.id === id);
    if (item) { URL.revokeObjectURL(item.url); previewUrls.current.delete(item.url); }
    setReferences(current => current.filter(reference => reference.id !== id));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!prompt.trim()) { setInputError(t.empty); textarea.current?.focus(); return; }
    setInputError('');
    const selectedModel = choices.find(choice => choice.id === model);
    const brief = [prompt.trim(), `${t.intent}${kind === 'video' ? t.video : t.image}`, selectedModel ? `${t.preferredModel}${selectedModel.label}` : ''].filter(Boolean).join('\n\n');
    onStart(brief, references.map(item => item.file));
  };

  return <section className="lp-hero" id="create" ref={section} aria-labelledby="lp-title">
    <div className="lp-color-field" aria-hidden="true" />
    <div className="lp-body">
      <div className="lp-marquee" role="region" aria-label={t.models} tabIndex={0}>
        <div className="lp-model-track">{[false, true].map(duplicate => <div key={String(duplicate)} className="lp-model-group" role={duplicate ? undefined : 'list'} aria-hidden={duplicate || undefined}>
          {landingPromptModels.map(item => <span className="lp-model" role={duplicate ? undefined : 'listitem'} key={item.id}><img className={item.icon === 'openai' || item.icon === 'grok' ? 'lp-mono-logo' : undefined} src={`/assets/landing/prompt-models/${item.icon}.svg`} width={23} height={23} alt="" /><span>{item.label}</span></span>)}
        </div>)}</div>
      </div>
      <div className="lp-heading"><h1 id="lp-title">{t.title}</h1><p>{t.subtitle}</p></div>
      <form className="lp-composer" onSubmit={submit} aria-busy={busy}>
        {references.length > 0 && <ul className="lp-references" aria-label={t.attach}>{references.map(item => <li key={item.id}>
          {item.kind === 'image' ? <img src={item.url} width={26} height={26} alt="" /> : <Film size={18} aria-hidden="true" />}
          <span>{item.file.name}</span><button type="button" onClick={() => removeReference(item.id)} disabled={busy} aria-label={`${t.remove} ${item.file.name}`}><X size={13} /></button>
        </li>)}</ul>}
        <textarea ref={textarea} value={prompt} onChange={event => { setPrompt(event.target.value); setInputError(''); }} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} placeholder={t.placeholder} aria-label={t.prompt} aria-invalid={!!inputError || undefined} aria-describedby={inputError || error ? 'lp-error' : undefined} maxLength={6000} rows={3} disabled={busy} />
        <div className="lp-toolbar">
          <div className="lp-tools">
            <button type="button" className="lp-attach" title={t.attach} aria-label={t.attach} disabled={busy} onClick={() => fileInput.current?.click()}><Plus size={22} /></button>
            <input ref={fileInput} type="file" accept={promptMediaAccept} multiple hidden onChange={event => { addReferences(Array.from(event.target.files || [])); event.target.value = ''; }} />
            <div className="lp-modes" role="group" aria-label={t.kind}>{(['video', 'image'] as const).map(mode => <button type="button" key={mode} aria-pressed={kind === mode} disabled={busy} onClick={() => { setKind(mode); setModel('auto'); }}>{mode === 'video' ? <Film size={16} /> : <Image size={16} />}<span>{t[mode]}</span></button>)}</div>
            <span className="lp-divider" aria-hidden="true" />
            <label className="lp-model-select"><img className={kind === 'image' ? 'lp-mono-logo' : undefined} src={`/assets/landing/prompt-models/${kind === 'image' ? 'openai' : 'gemini'}.svg`} width={18} height={18} alt="" /><select value={model} aria-label={t.model} disabled={busy} onChange={event => setModel(event.target.value)}><option value="auto">{t.automatic}</option>{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label>
          </div>
          <button type="submit" className="lp-submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}<span>{busy ? t.preparing : t.start}</span>{!busy && <ArrowRight size={20} />}</button>
        </div>
      </form>
      {(inputError || error) && <p id="lp-error" className="lp-error" role="alert">{inputError || error}</p>}
    </div>
    <a className="lp-scroll-cue" href="#overview"><span>{t.overview}</span><ArrowDown size={15} /></a>
  </section>;
}
