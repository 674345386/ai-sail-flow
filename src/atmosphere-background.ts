export type AtmosphereComposition = 'halo' | 'wash' | 'beam';

export type AtmosphereBackgroundConfig = {
  version: 1;
  preset: string | null;
  composition: AtmosphereComposition;
  base: string;
  primary: string;
  secondary: string;
  accent: string;
  focusX: number;
  focusY: number;
  spread: number;
  angle: number;
  softness: number;
  intensity: number;
  grain: number;
  dots: number;
  speed: number;
  drift: number;
  paused: boolean;
  hero: 'gradient' | 'video';
};

export const ATMOSPHERE_COMPOSITIONS = [
  { value: 'halo', zh: '聚光穹顶', en: 'Halo' },
  { value: 'wash', zh: '漫染渐层', en: 'Colour wash' },
  { value: 'beam', zh: '斜向光束', en: 'Light beam' },
] as const;

type AtmospherePreset = {
  name: string;
  en: string;
  config: Partial<AtmosphereBackgroundConfig> & Pick<AtmosphereBackgroundConfig, 'composition' | 'base' | 'primary' | 'secondary' | 'accent'>;
};

export const ATMOSPHERE_PRESETS = {
  corona: {
    name: '蓝紫日冕', en: 'Corona',
    config: { composition: 'halo', base: '#090810', primary: '#10075c', secondary: '#5932e6', accent: '#ba5029', focusY: 24, dots: .06 },
  },
  apricot: {
    name: '杏桃晨光', en: 'Apricot',
    config: { composition: 'wash', base: '#fff9f4', primary: '#ffae18', secondary: '#fa86bb', accent: '#f5b293', focusY: 10, spread: 1.15, grain: .045 },
  },
  midnight: {
    name: '午夜光束', en: 'Midnight',
    config: { composition: 'beam', base: '#080512', primary: '#1b0a3e', secondary: '#7134dc', accent: '#55349b', focusX: 61, angle: -12, spread: .85, intensity: .85 },
  },
  lagoon: {
    name: '翡翠余晖', en: 'Lagoon',
    config: { composition: 'halo', base: '#04100f', primary: '#053d43', secondary: '#167d78', accent: '#b98c40', focusX: 43, focusY: 18, spread: 1.15 },
  },
  glacier: {
    name: '冰川天光', en: 'Glacier',
    config: { composition: 'wash', base: '#f7fbfa', primary: '#a5c7ee', secondary: '#aacde2', accent: '#b6e1d3', focusX: 44, focusY: 8, spread: 1.3, grain: .035 },
  },
  rose: {
    name: '玫瑰星云', en: 'Rose',
    config: { composition: 'halo', base: '#140911', primary: '#39113f', secondary: '#9c2e6c', accent: '#b86c4f', focusX: 58, focusY: 16, angle: 15, spread: 1.1 },
  },
} satisfies Record<string, AtmospherePreset>;

export const DEFAULT_ATMOSPHERE_BACKGROUND: AtmosphereBackgroundConfig = {
  version: 1,
  preset: 'corona',
  composition: 'halo',
  base: '#090810',
  primary: '#10075c',
  secondary: '#5932e6',
  accent: '#ba5029',
  focusX: 50,
  focusY: 24,
  spread: 1,
  angle: 0,
  softness: 20,
  intensity: 1,
  grain: .055,
  dots: .06,
  speed: .5,
  drift: .35,
  paused: false,
  hero: 'gradient',
};

type AtmosphereNumberKey = 'focusX' | 'focusY' | 'spread' | 'angle' | 'softness' | 'intensity' | 'grain' | 'dots' | 'speed' | 'drift';
export const ATMOSPHERE_SLIDERS: {
  group: 'composition' | 'finish' | 'motion';
  key: AtmosphereNumberKey;
  zh: string;
  en: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}[] = [
  { group: 'composition', key: 'focusX', zh: '光源横向位置', en: 'Horizontal focus', min: 10, max: 90, step: 1, format: value => `${value}%` },
  { group: 'composition', key: 'focusY', zh: '光源纵向位置', en: 'Vertical focus', min: -20, max: 80, step: 1, format: value => `${value}%` },
  { group: 'composition', key: 'spread', zh: '铺展范围', en: 'Spread', min: .6, max: 1.6, step: .01, format: value => `${Math.round(value * 100)}%` },
  { group: 'composition', key: 'angle', zh: '倾斜角度', en: 'Angle', min: -45, max: 45, step: 1, format: value => `${value}°` },
  { group: 'finish', key: 'intensity', zh: '光色浓度', en: 'Intensity', min: .2, max: 1, step: .01, format: value => `${Math.round(value * 100)}%` },
  { group: 'finish', key: 'softness', zh: '边缘柔化', en: 'Softness', min: 0, max: 80, step: 1, format: value => `${value}px` },
  { group: 'finish', key: 'grain', zh: '细颗粒', en: 'Film grain', min: 0, max: .18, step: .005, format: value => `${Math.round(value * 100)}%` },
  { group: 'finish', key: 'dots', zh: '微光点阵', en: 'Fine dots', min: 0, max: .16, step: .005, format: value => `${Math.round(value * 100)}%` },
  { group: 'motion', key: 'speed', zh: '流动速度', en: 'Flow speed', min: .1, max: 2, step: .05, format: value => `${value.toFixed(2)}×` },
  { group: 'motion', key: 'drift', zh: '流动幅度', en: 'Flow distance', min: 0, max: 1.5, step: .05, format: value => `${Math.round(value * 100)}%` },
];

export function atmospherePreset(key: keyof typeof ATMOSPHERE_PRESETS): AtmosphereBackgroundConfig {
  return { ...DEFAULT_ATMOSPHERE_BACKGROUND, dots: 0, ...ATMOSPHERE_PRESETS[key].config, preset: key };
}

export function normalizeAtmosphereBackground(saved: unknown): AtmosphereBackgroundConfig {
  const config = { ...DEFAULT_ATMOSPHERE_BACKGROUND };
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return config;
  const raw = saved as Record<string, unknown>;
  config.preset = typeof raw.preset === 'string' && Object.hasOwn(ATMOSPHERE_PRESETS, raw.preset) ? raw.preset : null;
  if (config.preset) Object.assign(config, atmospherePreset(config.preset as keyof typeof ATMOSPHERE_PRESETS));
  for (const key of ['base', 'primary', 'secondary', 'accent'] as const) {
    if (typeof raw[key] === 'string' && /^#[\da-f]{6}$/i.test(raw[key])) config[key] = raw[key];
  }
  for (const slider of ATMOSPHERE_SLIDERS) {
    const value = raw[slider.key];
    if (typeof value === 'number' && Number.isFinite(value)) config[slider.key] = Math.max(slider.min, Math.min(slider.max, value));
  }
  if (raw.composition === 'halo' || raw.composition === 'wash' || raw.composition === 'beam') config.composition = raw.composition;
  if (raw.hero === 'gradient' || raw.hero === 'video') config.hero = raw.hero;
  if (typeof raw.paused === 'boolean') config.paused = raw.paused;
  return config;
}

export function randomAtmosphereBackground(): AtmosphereBackgroundConfig {
  const keys = Object.keys(ATMOSPHERE_PRESETS) as (keyof typeof ATMOSPHERE_PRESETS)[];
  const config = atmospherePreset(keys[Math.floor(Math.random() * keys.length)]);
  return {
    ...config,
    preset: null,
    focusX: 35 + Math.round(Math.random() * 30),
    focusY: 5 + Math.round(Math.random() * 30),
    spread: .85 + Math.round(Math.random() * 40) / 100,
    angle: Math.round(Math.random() * 30) - 15,
    softness: 12 + Math.round(Math.random() * 24),
    speed: .3 + Math.round(Math.random() * 60) / 100,
  };
}
