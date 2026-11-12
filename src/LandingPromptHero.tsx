import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowRight, AudioLines, Film, Image, LoaderCircle, Plus, X } from 'lucide-react';
import { useDict } from './i18n';
import { clipboardMediaFiles, promptMediaAccept, promptMediaKind, validatePromptMedia, type PromptMediaKind } from '../shared/prompt-media';
import { landingPromptModels } from './landing-prompt-models';
import LandingVideoShowcase from './LandingVideoShowcase';
import './landing-prompt-hero.css';

const messages = {
  'zh-CN': {
    title: '创作灵感，成为灵感',
    subtitle: '探索发现，让灵感先做一次实验',
    placeholder: '描述你想创作的内容，例如：为我的香水制作一支有电影感的夏日广告…',
    prompt: '描述你的创作想法', models: 'AI 创作模型',
    video: '视频', image: '图片', audio: '音频', kind: '支持上传的附件类型', attach: '添加视频、图片或音频，也可直接粘贴或拖入', remove: '移除',
    start: '开始创作', preparing: '正在准备', overview: '认识 AI Creative Lab',
    empty: '先写下你的想法或添加参考素材，再开始创作。', formats: '支持 JPG、PNG、WebP 图片，MP4、MOV、WebM 视频，以及 MP3、M4A、WAV、AAC、FLAC、OGG、Opus 音频。',
    tooLarge: '图片最多 10 MB，视频最多 250 MB，音频最多 50 MB。', tooMany: '最多添加 3 张参考图片、1 条参考视频和 1 个音频文件。',
    attachmentPrompt: '请查看附件中的参考素材，帮我继续创作。',
  },
  en: {
    title: 'Create inspiration. Become inspiration.',
    subtitle: 'Explore. Discover. Put inspiration to the test.',
    placeholder: 'Describe what you want to create, e.g. a cinematic summer campaign for my perfume…',
    prompt: 'Describe your creative idea', models: 'AI creative models',
    video: 'Video', image: 'Image', audio: 'Audio', kind: 'Supported attachment types', attach: 'Add video, images or audio; paste or drop files here', remove: 'Remove',
    start: 'Start creating', preparing: 'Preparing', overview: 'Meet AI Creative Lab',
    empty: 'Write down your idea or add a reference to start creating.', formats: 'Add JPG, PNG or WebP images; MP4, MOV or WebM video; or MP3, M4A, WAV, AAC, FLAC, OGG or Opus audio.',
    tooLarge: 'Images can be up to 10 MB; videos up to 250 MB; audio up to 50 MB.', tooMany: 'Add up to 3 images, 1 video and 1 audio file.',
    attachmentPrompt: 'Please review the attached references and help me continue creating.',
  },
};

type Reference = { id: string; file: File; kind: PromptMediaKind; url: string };

export default function LandingPromptHero({ onStart, busy, error }: {
  onStart: (prompt: string, files: File[]) => void; busy: boolean; error?: string;
}) {
  const t = useDict(messages);
  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<Reference[]>([]);
  const [inputError, setInputError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const section = useRef<HTMLElement>(null);
  const previewUrls = useRef(new Set<string>());

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
    if (busy || !files.length) return;
    const invalid = validatePromptMedia(files, references.map(item => item.kind));
    if (invalid) { setInputError(t[invalid]); return; }
    const entries = files.map(file => ({ file, kind: promptMediaKind(file)! }));
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
    if (!prompt.trim() && !references.length) { setInputError(t.empty); textarea.current?.focus(); return; }
    setInputError('');
    onStart(prompt.trim() || t.attachmentPrompt, references.map(item => item.file));
  };

  return <section className="lp-hero lp-with-examples" id="create" ref={section} aria-labelledby="lp-title">
    <div className="lp-body">
      <div className="lp-marquee" role="region" aria-label={t.models} tabIndex={0}>
        <div className="lp-model-track">{[false, true].map(duplicate => <div key={String(duplicate)} className="lp-model-group" role={duplicate ? undefined : 'list'} aria-hidden={duplicate || undefined}>
          {landingPromptModels.map(item => <span className="lp-model" role={duplicate ? undefined : 'listitem'} key={item.id}><img className={item.icon === 'openai' ? 'lp-mono-logo' : undefined} src={`/assets/landing/prompt-models/${item.icon}.svg`} width={23} height={23} alt="" /><span>{item.label}</span></span>)}
        </div>)}</div>
      </div>
      <div className="lp-heading"><h1 id="lp-title">{t.title}</h1><p className="lp-subtitle">{t.subtitle}</p></div>
      <form className="lp-composer" onSubmit={submit} aria-busy={busy}
        onPaste={event => {
          const files = clipboardMediaFiles(event.clipboardData);
          if (!files.length) return;
          if (!event.clipboardData.getData('text/plain')) event.preventDefault();
          addReferences(files);
        }}
        onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy'; } }}
        onDrop={event => { if (event.dataTransfer.files.length) { event.preventDefault(); addReferences(Array.from(event.dataTransfer.files)); } }}>
        {references.length > 0 && <ul className="lp-references" aria-label={t.attach}>{references.map(item => <li key={item.id}>
          {item.kind === 'image' ? <img src={item.url} width={26} height={26} alt="" /> : item.kind === 'audio' ? <AudioLines size={18} aria-hidden="true" /> : <Film size={18} aria-hidden="true" />}
          <span>{item.file.name}</span><button type="button" onClick={() => removeReference(item.id)} disabled={busy} aria-label={`${t.remove} ${item.file.name}`}><X size={13} /></button>
        </li>)}</ul>}
        <textarea ref={textarea} value={prompt} onChange={event => { setPrompt(event.target.value); setInputError(''); }} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} placeholder={t.placeholder} aria-label={t.prompt} aria-invalid={!!inputError || undefined} aria-describedby={inputError || error ? 'lp-error' : undefined} maxLength={6000} rows={3} disabled={busy} />
        <div className="lp-toolbar">
          <div className="lp-tools">
            <button type="button" className="lp-attach" title={t.attach} aria-label={t.attach} disabled={busy} onClick={() => fileInput.current?.click()}><Plus size={22} /></button>
            <input ref={fileInput} type="file" accept={promptMediaAccept} multiple hidden disabled={busy} onChange={event => { addReferences(Array.from(event.target.files || [])); event.target.value = ''; }} />
            <div className="lp-media-types" role="list" aria-label={t.kind}><span role="listitem"><Film size={15} aria-hidden="true" />{t.video}</span><span role="listitem"><Image size={15} aria-hidden="true" />{t.image}</span><span role="listitem"><AudioLines size={15} aria-hidden="true" />{t.audio}</span></div>
          </div>
          <button type="submit" className="lp-submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}<span>{busy ? t.preparing : t.start}</span>{!busy && <ArrowRight size={20} />}</button>
        </div>
      </form>
      {(inputError || error) && <p id="lp-error" className="lp-error" role="alert">{inputError || error}</p>}
    </div>
    <LandingVideoShowcase />
    <a className="lp-scroll-cue" href="#overview"><span>{t.overview}</span><ArrowDown size={15} /></a>
  </section>;
}
