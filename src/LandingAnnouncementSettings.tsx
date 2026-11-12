import { useId } from 'react';
import { RotateCcw, Shuffle } from 'lucide-react';
import { useLang } from './i18n';
import { ANNOUNCEMENT_HEIGHT, DEFAULT_ANNOUNCEMENTS, updateAnnouncement, useAnnouncementConfig } from './landing-announcement-config';

export default function LandingAnnouncementSettings() {
  const { lang } = useLang();
  const plain = (zh: string, en: string) => lang === 'en' ? en : zh;
  const selected = 'omni';
  const config = useAnnouncementConfig();
  const bar = config[selected];
  const copy = bar.copy[lang];
  const id = useId();
  const updateCopy = (field: keyof typeof copy, value: string) => updateAnnouncement(selected, {
    copy: { ...bar.copy, [lang]: { ...copy, [field]: value } },
  });
  const randomize = () => updateAnnouncement(selected, {
    background: `#${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, '0')}`,
    height: ANNOUNCEMENT_HEIGHT.min + Math.floor(Math.random() * (ANNOUNCEMENT_HEIGHT.max - ANNOUNCEMENT_HEIGHT.min + 1)),
  });

  return <>
    <p className="lbg-type-description">{plain('调整后即时生效，并自动保存在当前浏览器。', 'Changes apply instantly and are saved in this browser.')}</p>
    <div className="lbg-row lbg-inline">
      <label htmlFor={`${id}-color`}>{plain('活动栏底色', 'Background colour')}</label>
      <div className="lbg-announcement-color"><output htmlFor={`${id}-color`}>{bar.background.toUpperCase()}</output>
        <input id={`${id}-color`} type="color" value={bar.background} onChange={event => updateAnnouncement(selected, { background: event.target.value })} />
      </div>
    </div>
    <div className="lbg-row">
      <label htmlFor={`${id}-height`}><span>{plain('高度（厚度）', 'Height')}</span><output htmlFor={`${id}-height`}>{bar.height}px</output></label>
      <input id={`${id}-height`} type="range" min={ANNOUNCEMENT_HEIGHT.min} max={ANNOUNCEMENT_HEIGHT.max} step={1} value={bar.height} onChange={event => updateAnnouncement(selected, { height: Number(event.target.value) })} />
    </div>
    <p className="lbg-type-description">{plain('文字颜色自动适配底色；窄屏时高度随内容撑开。', 'Text colour adapts to the background. On narrow screens, the bar grows to fit its content.')}</p>
    <div className="lbg-sec">{plain('文案 · 简体中文', 'Copy · English')}</div>
    <div className="lbg-row">
      <label htmlFor={`${id}-title`}>{plain('公告标题', 'Announcement title')}</label>
      <input id={`${id}-title`} type="text" maxLength={120} value={copy.title} onChange={event => updateCopy('title', event.target.value)} />
    </div>
    <div className="lbg-row">
      <label htmlFor={`${id}-message`}>{plain('活动文案', 'Message')}</label>
      <textarea id={`${id}-message`} rows={3} maxLength={500} value={copy.message} onChange={event => updateCopy('message', event.target.value)} />
    </div>
    <div className="lbg-row">
      <label htmlFor={`${id}-action`}>{plain('按钮文案', 'Button label')}</label>
      <input id={`${id}-action`} type="text" maxLength={60} value={copy.action} onChange={event => updateCopy('action', event.target.value)} />
    </div>
    <p className="lbg-type-description">{plain('切换页面语言可分别编辑英文文案。', 'Switch the page language to edit the Chinese copy separately.')}</p>
    <div className="lbg-btns"><button type="button" onClick={randomize} title={plain('随机底色和高度', 'Randomize colour and height')}>
      <Shuffle size={13} aria-hidden="true" /> {plain('随机', 'Randomize')}
    </button><button type="button" onClick={() => updateAnnouncement(selected, structuredClone(DEFAULT_ANNOUNCEMENTS[selected]))}>
      <RotateCcw size={13} aria-hidden="true" /> {plain('重置当前活动栏', 'Reset this bar')}
    </button></div>
  </>;
}
