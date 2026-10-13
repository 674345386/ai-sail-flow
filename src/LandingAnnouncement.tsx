import { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import './landing-announcement.css';
import { useDict } from './i18n';
import { LANDING } from './landing-i18n';

export default function LandingAnnouncement({ onEnter }: { onEnter: () => void }) {
  const [visible, setVisible] = useState(true);
  const t = useDict(LANDING).announcement;
  if (!visible) return null;

  return <aside className="landing-announcement" aria-label={t.aria}>
    <div className="landing-announcement-inner">
      <p className="landing-announcement-message">{t.message}</p>
      <div className="landing-announcement-actions">
        <a className="landing-announcement-link" href="#tools">{t.details}</a>
        <button className="landing-announcement-button" type="button" onClick={onEnter}>
          {t.action}<ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
    <button className="landing-announcement-close" type="button" aria-label={t.close} title={t.close} onClick={() => setVisible(false)}>
      <X size={18} aria-hidden="true" />
    </button>
  </aside>;
}
