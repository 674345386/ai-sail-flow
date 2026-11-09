import { normalizeAtmosphereBackground, type AtmosphereBackgroundConfig } from './atmosphere-background';

export const LANDING_BACKGROUND_KEY = 'sail-landing-bg-v1';
export type BackgroundType = 'ambient' | 'light' | 'atmosphere';

export type LightBackgroundConfig = {
  version: 2;
  preset: string | null;
  base: string;
  colors: string[];
  count: number;
  size: number;
  blur: number;
  opacity: number;
  sat: number;
  blend: 'normal' | 'multiply';
  speed: number;
  drift: number;
  breathe: number;
  paused: boolean;
};

export const LIGHT_PRESETS = {
  pearl: { name: '柔白流光', en: 'Pearl', base: '#ffffff', colors: ['#bdd2f3', '#e6cee9', '#c7e6e1', '#f2dfcb', '#d5d9ef', '#dce9d0', '#cbdff3', '#efdae3'] },
  cream: { name: '奶油暖光', en: 'Cream', base: '#fffcf6', colors: ['#edcda9', '#f0d8c3', '#e9cbd0', '#e4dac2', '#f2e0b8', '#d9d8c0', '#efd6c8', '#e6d5bd'] },
  mist: { name: '雾蓝流光', en: 'Sky', base: '#f7faff', colors: ['#a9ccee', '#c6d9f1', '#b5ddd9', '#d2d1ed', '#b8d8ed', '#c5e3e9', '#c8d4ed', '#bcd8e0'] },
  sage: { name: '浅绿柔光', en: 'Sage', base: '#f8fbf7', colors: ['#c3d8b7', '#b9dcd1', '#d9dfb6', '#cee4d5', '#d8dfc7', '#bbd5c5', '#dae6ca', '#c4dedc'] },
  lavender: { name: '淡紫流光', en: 'Lavender', base: '#fcfaff', colors: ['#cebeeb', '#e7c9e3', '#c1d4ed', '#dfd3ef', '#dbc5e5', '#ced2ef', '#ead6e7', '#d1c4e8'] },
} satisfies Record<string, { name: string; en: string; base: string; colors: string[] }>;

export const DEFAULT_LIGHT_BACKGROUND: LightBackgroundConfig = {
  version: 2, preset: 'pearl', base: LIGHT_PRESETS.pearl.base, colors: [...LIGHT_PRESETS.pearl.colors],
  count: 5, size: 48, blur: 80, opacity: .8, sat: 1, blend: 'multiply', speed: 1, drift: 1, breathe: .12, paused: false,
};

export type LightNumberKey = 'count' | 'size' | 'blur' | 'opacity' | 'sat' | 'speed' | 'drift' | 'breathe';
export const LIGHT_SLIDERS: { group: string; key: LightNumberKey; zh: string; en: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { group: '形态 · Shape', key: 'count', zh: '光块数量', en: 'Light pools', min: 0, max: 8, step: 1, fmt: v => String(v) },
  { group: '形态 · Shape', key: 'size', zh: '光块大小', en: 'Pool size', min: 20, max: 85, step: 1, fmt: v => `${v}%` },
  { group: '形态 · Shape', key: 'blur', zh: '模糊半径', en: 'Blur radius', min: 20, max: 180, step: 1, fmt: v => `${v}px` },
  { group: '动态 · Motion', key: 'speed', zh: '流动速度', en: 'Flow speed', min: .1, max: 3, step: .05, fmt: v => `${v.toFixed(2)}×` },
  { group: '动态 · Motion', key: 'drift', zh: '流动幅度', en: 'Flow distance', min: 0, max: 3, step: .05, fmt: v => `${v.toFixed(2)}×` },
  { group: '动态 · Motion', key: 'breathe', zh: '呼吸强度', en: 'Breathing', min: 0, max: .4, step: .01, fmt: v => `${Math.round(v * 100)}%` },
  { group: '色调 · Look', key: 'opacity', zh: '光块浓度', en: 'Colour intensity', min: 0, max: 1, step: .01, fmt: v => `${Math.round(v * 100)}%` },
  { group: '色调 · Look', key: 'sat', zh: '饱和度', en: 'Saturation', min: 0, max: 2, step: .01, fmt: v => v.toFixed(2) },
];

// Keep the original ambient payload at its existing key. New settings have their own keys.
export function backgroundStorageKeys(storageKey: string) {
  return { type: `${storageKey}-type`, light: `${storageKey}-light`, atmosphere: `${storageKey}-atmosphere` };
}

function readSaved(storageKey: string, kind: 'type' | 'light' | 'atmosphere'): unknown {
  try {
    const raw = localStorage.getItem(backgroundStorageKeys(storageKey)[kind]);
    const fallback = storageKey !== LANDING_BACKGROUND_KEY ? localStorage.getItem(backgroundStorageKeys(LANDING_BACKGROUND_KEY)[kind]) : null;
    return JSON.parse(raw ?? fallback ?? 'null');
  } catch { return null; }
}

export function loadBackgroundType(storageKey: string): BackgroundType {
  const type = readSaved(storageKey, 'type');
  return type === 'light' || type === 'atmosphere' ? type : 'ambient';
}

export function loadAtmosphereBackground(storageKey: string): AtmosphereBackgroundConfig {
  return normalizeAtmosphereBackground(readSaved(storageKey, 'atmosphere'));
}

export function loadLightBackground(storageKey: string): LightBackgroundConfig {
  const saved = readSaved(storageKey, 'light');
  const config = { ...DEFAULT_LIGHT_BACKGROUND, colors: [...DEFAULT_LIGHT_BACKGROUND.colors] };
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return config;
  const raw = saved as Record<string, unknown>;
  const presetKey = raw.preset === 'lime' ? 'pearl' : raw.preset;
  config.preset = typeof presetKey === 'string' && Object.hasOwn(LIGHT_PRESETS, presetKey) ? presetKey : null;
  if (config.preset) {
    const preset = LIGHT_PRESETS[config.preset as keyof typeof LIGHT_PRESETS];
    config.base = preset.base;
    config.colors = [...preset.colors];
  }
  if (typeof raw.base === 'string' && /^#[\da-f]{6}$/i.test(raw.base)) config.base = raw.base;
  if (raw.version === 2 && Array.isArray(raw.colors)) {
    raw.colors.slice(0, 8).forEach((color, i) => {
      if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) config.colors[i] = color;
    });
  }
  for (const slider of LIGHT_SLIDERS) {
    // The previous line-art controls used unrelated units for size and count.
    if (raw.version !== 2 && slider.key !== 'speed' && slider.key !== 'drift') continue;
    const value = raw[slider.key];
    if (typeof value === 'number' && Number.isFinite(value)) config[slider.key] = Math.max(slider.min, Math.min(slider.max, value));
  }
  config.count = Math.round(config.count);
  if (raw.blend === 'normal' || raw.blend === 'multiply') config.blend = raw.blend;
  if (typeof raw.paused === 'boolean') config.paused = raw.paused;
  return config;
}

export function loadActiveBackgroundBase(storageKey: string): string {
  const type = loadBackgroundType(storageKey);
  if (type === 'light') return loadLightBackground(storageKey).base;
  if (type === 'atmosphere') return loadAtmosphereBackground(storageKey).base;
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(LANDING_BACKGROUND_KEY) || '{}');
    return typeof raw.base === 'string' && /^#[\da-f]{6}$/i.test(raw.base) ? raw.base : '#070708';
  } catch { return '#070708'; }
}
