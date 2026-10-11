import { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import './landing-announcement.css';

const announcement = {
  message: '限时优惠：订阅享 8 折，活动截至 11 月 30 日',
  detailsLabel: '了解功能',
  detailsHref: '#tools',
  actionLabel: '立即体验',
};

export default function LandingAnnouncement({ onEnter }: { onEnter: () => void }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return <aside className="landing-announcement" aria-label="产品公告">
    <div className="landing-announcement-inner">
      <p className="landing-announcement-message">{announcement.message}</p>
      <div className="landing-announcement-actions">
        <a className="landing-announcement-link" href={announcement.detailsHref}>{announcement.detailsLabel}</a>
        <button className="landing-announcement-button" type="button" onClick={onEnter}>
          {announcement.actionLabel}<ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
    <button className="landing-announcement-close" type="button" aria-label="关闭促销公告" title="关闭促销公告" onClick={() => setVisible(false)}>
      <X size={18} aria-hidden="true" />
    </button>
  </aside>;
}
