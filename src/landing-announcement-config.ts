import { useSyncExternalStore } from 'react';
import type { Lang } from './i18n';
import { LANDING } from './landing-i18n';

export type AnnouncementId = 'promo' | 'omni';
type AnnouncementCopy = { title: string; message: string; action: string; details: string };
export type AnnouncementBarConfig = {
  background: string;
  height: number;
  copy: Record<Lang, AnnouncementCopy>;
};
type AnnouncementConfig = Record<AnnouncementId, AnnouncementBarConfig>;

const STORAGE_KEY = 'sail-landing-announcements-v1';
const CHANGE_EVENT = 'sail-landing-announcements-change';
export const ANNOUNCEMENT_HEIGHT = { min: 36, max: 120 };
const defaultCopy = (id: AnnouncementId, lang: Lang): AnnouncementCopy => id === 'promo'
  ? { title: '', ...LANDING[lang].announcement }
  : { details: '', ...LANDING[lang].omniAnnouncement };

export const DEFAULT_ANNOUNCEMENTS: AnnouncementConfig = {
  promo: { background: '#800020', height: 46, copy: { en: defaultCopy('promo', 'en'), 'zh-CN': defaultCopy('promo', 'zh-CN') } },
  omni: { background: '#d8fa69', height: 48, copy: { en: defaultCopy('omni', 'en'), 'zh-CN': defaultCopy('omni', 'zh-CN') } },
};

function loadConfig(): AnnouncementConfig {
  const result = structuredClone(DEFAULT_ANNOUNCEMENTS);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    for (const id of ['promo', 'omni'] as const) {
      const bar = saved?.[id];
      if (!bar || typeof bar !== 'object') continue;
      if (typeof bar.background === 'string' && /^#[\da-f]{6}$/i.test(bar.background)) result[id].background = bar.background;
      if (typeof bar.height === 'number' && Number.isFinite(bar.height)) result[id].height = Math.round(Math.max(ANNOUNCEMENT_HEIGHT.min, Math.min(ANNOUNCEMENT_HEIGHT.max, bar.height)));
      for (const lang of ['en', 'zh-CN'] as const) {
        for (const field of ['title', 'message', 'action', 'details'] as const) {
          if (typeof bar.copy?.[lang]?.[field] === 'string') result[id].copy[lang][field] = bar.copy[lang][field];
        }
      }
    }
  } catch { /* Use defaults when storage is unavailable or invalid. */ }
  return result;
}

let snapshot: AnnouncementConfig | undefined;
const getSnapshot = () => snapshot ??= loadConfig();
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    snapshot = undefined;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useAnnouncementConfig() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_ANNOUNCEMENTS);
}

export function updateAnnouncement(id: AnnouncementId, patch: Partial<AnnouncementBarConfig>) {
  const current = getSnapshot();
  snapshot = { ...current, [id]: { ...current[id], ...patch } };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Keep live editing available without storage. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function announcementInk(background: string) {
  const channels = [1, 3, 5].map(offset => parseInt(background.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#000000' : '#ffffff';
}
