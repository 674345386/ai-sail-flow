import { useState, type CSSProperties } from 'react';
import { ChevronRight, X } from 'lucide-react';
import './landing-announcement.css';
import { useDict, useLang } from './i18n';
import { LANDING } from './landing-i18n';
import { announcementInk, useAnnouncementConfig, type AnnouncementBarConfig } from './landing-announcement-config';

const barStyle = (config: AnnouncementBarConfig) => ({
  '--announcement-background': config.background,
  '--announcement-ink': announcementInk(config.background),
  '--announcement-height': `${config.height}px`,
} as CSSProperties);

export default function LandingAnnouncement({ onEnter }: { onEnter: () => void }) {
  const [visible, setVisible] = useState(true);
  const [omniVisible, setOmniVisible] = useState(true);
  const { announcement: t, omniAnnouncement: omni } = useDict(LANDING);
  const { lang } = useLang();
  const config = useAnnouncementConfig();
  const promoCopy = config.promo.copy[lang];
  const omniCopy = config.omni.copy[lang];

  return <>{visible && <aside className="landing-announcement" aria-label={t.aria} style={barStyle(config.promo)}>
    <div className="landing-announcement-inner">
      <div className="landing-announcement-marquee">
        <div className="landing-announcement-track">
          <p className="landing-announcement-message">{promoCopy.message}</p>
          <p className="landing-announcement-message" aria-hidden="true">{promoCopy.message}</p>
        </div>
      </div>
      <div className="landing-announcement-actions">
        {promoCopy.details && <a className="landing-announcement-link" href="#tools">{promoCopy.details}</a>}
        <button className="landing-announcement-button" type="button" onClick={onEnter}>
          {promoCopy.action}<ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
    <button className="landing-announcement-close" type="button" aria-label={t.close} title={t.close} onClick={() => setVisible(false)}>
      <X size={18} aria-hidden="true" />
    </button>
  </aside>}
    {omniVisible && <aside className="landing-announcement landing-announcement--omni" aria-label={omni.aria} style={barStyle(config.omni)}>
      <div className="landing-announcement-inner">
        <div className="landing-announcement-marquee">
          <div className="landing-announcement-track">
            <p className="landing-announcement-message"><strong>{omniCopy.title}</strong><span>{omniCopy.message}</span></p>
            <p className="landing-announcement-message" aria-hidden="true"><strong>{omniCopy.title}</strong><span>{omniCopy.message}</span></p>
          </div>
        </div>
        <button className="landing-announcement-button" type="button" onClick={onEnter}>
          {omniCopy.action}<ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <button className="landing-announcement-close" type="button" aria-label={omni.close} title={omni.close} onClick={() => setOmniVisible(false)}>
        <X size={18} aria-hidden="true" />
      </button>
    </aside>}
  </>;
}
