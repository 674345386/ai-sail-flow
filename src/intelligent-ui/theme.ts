import type { CSSProperties } from 'react';
import { AGENT_THEME_MODES, agentThemeDefaultsSchema, type AgentRegionPreferences, type AgentSurfacePreferences, type AgentThemeFont, type AgentThemePreferences, type ThemeMode } from '../../shared/agent-theme';
import defaultsFile from '../../shared/agent-theme-defaults.json';

export type { AgentRegionPreferences, AgentSurfacePreferences, AgentThemeFont, AgentThemePreferences, ThemeMode } from '../../shared/agent-theme';

export const AGENT_THEME_REGIONS = {
  sidebar: '左侧栏边框',
  composer: 'Prompt 输入框',
  chat: '聊天框',
  results: '右侧结果区',
} as const;
export type AgentThemeRegion = keyof typeof AGENT_THEME_REGIONS;
export const AGENT_THEME_REGION_IDS = Object.keys(AGENT_THEME_REGIONS) as AgentThemeRegion[];
export const AGENT_SURFACE_DEFAULTS: Record<AgentThemeRegion, AgentSurfacePreferences> = {
  sidebar: { enabled: false, gray: 18, opacity: 88, blur: 16 },
  composer: { enabled: false, gray: 16, opacity: 94, blur: 12 },
  chat: { enabled: false, gray: 16, opacity: 94, blur: 12 },
  results: { enabled: false, gray: 16, opacity: 94, blur: 12 },
};
export const AGENT_THEME_FONTS = {
  default: '主题默认',
  sans: '无衬线',
  serif: '衬线',
  mono: '等宽',
} as const satisfies Record<AgentThemeFont, string>;

const modeLabels: Record<ThemeMode, string> = {
  light: '官方浅色',
  'studio-white': 'Studio 白色',
  dark: '中性深色',
  warm: '暖白阅读',
  compact: '紧凑工作台',
  system: '跟随系统',
};

export const AGENT_THEME_CONFIG = {
  storageKey: 'sail-agent-theme-v1',
  surfaceStorageKey: 'sail-agent-surfaces-v1',
  modes: AGENT_THEME_MODES.map(value => ({ value, label: modeLabels[value] })),
} as const;

export type ResolvedTheme = Exclude<ThemeMode, 'system'>;
export const AGENT_THEME_DEFAULTS = agentThemeDefaultsSchema.parse(defaultsFile);
export const AGENT_THEME_TEXT_COLORS: Record<ResolvedTheme, string> = { light: '#0d0d0d', 'studio-white': '#181818', dark: '#fafafa', warm: '#332c25', compact: '#202020' };
export const AGENT_THEME_CANVAS_COLORS: Record<ResolvedTheme, string> = { light: '#ffffff', 'studio-white': '#ffffff', dark: '#171717', warm: '#fbf7ef', compact: '#fafafa' };

export function agentRegionMode(preferences: AgentThemePreferences, region: AgentThemeRegion): ThemeMode {
  return preferences.regions[region].mode ?? preferences.regions.chat.mode ?? 'light';
}

export function agentRegionUsesBackground(preferences: AgentThemePreferences, region: AgentThemeRegion): boolean {
  return preferences.regions[region].workspaceBackground ?? (region !== 'composer' && agentRegionMode(preferences, region) !== 'studio-white');
}

export function agentRegionFontStyle(font: AgentThemeFont): CSSProperties {
  const fonts = { default: null, sans: 'var(--sail-font-default-ui)', serif: 'var(--sail-font-default-prose)', mono: 'var(--sail-font-mono)' };
  return {
    '--sail-font-ui': fonts[font] ?? 'var(--sail-font-default-ui)',
    '--sail-font-prose': fonts[font] ?? 'var(--sail-font-default-prose)',
  } as CSSProperties;
}

export function agentTextColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export function agentContrastColor(value: string): string {
  const color = agentTextColor(value) || '#ffffff';
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return luminance > .179 ? '#000000' : '#ffffff';
}

/** Background owns the whole Agent palette, including formerly white controls. */
export function agentBackgroundStyle(value: string): CSSProperties {
  const base = agentTextColor(value) || '#070708';
  const dark = agentContrastColor(base) === '#ffffff';
  const ink = dark ? AGENT_THEME_TEXT_COLORS.dark : '#171717';
  const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, ${base})`;
  const properties: Record<string, string> = {
    colorScheme: dark ? 'dark' : 'light',
    '--iui-canvas': base,
    '--iui-ink': ink,
    '--iui-on-ink': dark ? '#171717' : '#ffffff',
    '--iui-on-status': dark ? '#121212' : '#ffffff',
    '--iui-ink-hover': mix(ink, 85),
    '--iui-muted': mix(ink, dark ? 79 : 72),
    '--iui-faint': mix(ink, dark ? 69 : 64),
    '--iui-label-ink': dark ? mix(ink, 91) : 'var(--iui-muted)',
    '--iui-prose-weight': dark ? '450' : '400',
    '--iui-hover': mix(ink, 8),
    '--iui-pressed': mix(ink, 14),
    '--iui-surface': mix(ink, 5),
    '--iui-surface-hover': mix(ink, 10),
    '--iui-surface-strong': mix(ink, 14),
    '--iui-border': mix(ink, 14),
    '--iui-border-strong': mix(ink, 22),
    '--iui-focus': ink,
    '--iui-ring': ink,
    '--iui-range-track': mix(ink, 18),
    '--iui-range-thumb': ink,
    '--iui-segmented-selected': mix(ink, 14),
    '--iui-photo-empty': mix(ink, 5),
    '--iui-photo-empty-icon': mix(ink, 25),
    '--iui-glass': `color-mix(in srgb, ${base} 86%, transparent)`,
    '--iui-glass-hover': `color-mix(in srgb, ${base} 94%, transparent)`,
    '--iui-shadow': `0 4px 20px rgb(0 0 0 / ${dark ? '35%' : '8%'})`,
    '--iui-shadow-sm': `0 1px 3px rgb(0 0 0 / ${dark ? '25%' : '6%'})`,
    '--iui-map-icon-filter': dark ? 'invert(1)' : 'none',
    '--iui-info': ink,
    '--iui-info-soft': mix(ink, 8),
    '--iui-badge-neutral-soft': mix(ink, 8),
  };
  const tones = {
    success: dark ? '#8fd3b2' : '#1f6b4f', warning: dark ? '#e6c27c' : '#8a5300',
    danger: dark ? '#f0a39b' : '#9f3a33', purple: dark ? '#c3b2f0' : '#5d4596', pink: dark ? '#eeaacb' : '#94456d',
  };
  for (const [name, color] of Object.entries(tones)) {
    properties[`--iui-${name}`] = color;
    properties[`--iui-${name}-soft`] = mix(color, 14);
    properties[`--iui-badge-${name}`] = color;
    properties[`--iui-badge-${name}-soft`] = mix(color, 14);
  }
  return properties as CSSProperties;
}

export function agentTextColorStyle(value: string | null, fallback?: string): CSSProperties | undefined {
  const custom = agentTextColor(value);
  const color = custom || agentTextColor(fallback);
  if (!color) return undefined;
  const muted = !custom && color === '#ffffff'
    ? 'var(--iui-muted)'
    : `color-mix(in srgb, ${color} 72%, transparent)`;
  return {
    '--iua-content-ink': color,
    '--iua-content-muted': muted,
    '--iua-content-on-ink': agentContrastColor(color),
    ...(custom ? { '--iua-custom-ink': custom, '--iua-custom-muted': muted, '--iua-custom-on-ink': agentContrastColor(custom) } : {}),
  } as CSSProperties;
}

export function normalizeAgentSurface(value: unknown, fallback: AgentSurfacePreferences): AgentSurfacePreferences {
  const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const number = (key: 'gray' | 'opacity' | 'blur', max: number) => typeof stored[key] === 'number' && Number.isFinite(stored[key])
    ? Math.round(Math.max(0, Math.min(max, stored[key] as number))) : fallback[key];
  return { enabled: typeof stored.enabled === 'boolean' ? stored.enabled : fallback.enabled, gray: number('gray', 100), opacity: number('opacity', 100), blur: number('blur', 32) };
}

export function agentSurfaceStyle(value: AgentSurfacePreferences, backdrop: string, workspaceBackground: boolean): (CSSProperties & Record<string, string>) | undefined {
  if (!value.enabled) return undefined;
  const base = agentTextColor(backdrop) || '#070708';
  const shade = Math.round(value.gray * 255 / 100);
  const alpha = value.opacity / 100;
  const blended = `#${[1, 3, 5].map(offset => Math.round(shade * alpha + parseInt(base.slice(offset, offset + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
  // Match control contrast to the composited surface, including at zero opacity.
  const palette = agentBackgroundStyle(blended) as Record<string, string>;
  return {
    ...palette,
    '--agent-surface-background': `rgb(${shade} ${shade} ${shade} / ${value.opacity}%)`,
    '--agent-surface-blur': `${value.blur}px`,
    '--agent-surface-underlay': workspaceBackground ? 'transparent' : base,
  };
}

function themeMode(value: unknown, fallback: ThemeMode | null): ThemeMode | null {
  if (value === null) return null;
  return AGENT_THEME_CONFIG.modes.some(mode => mode.value === value) ? value as ThemeMode : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function parseRecord(raw: string | null): Record<string, unknown> {
  try {
    return record(JSON.parse(raw || 'null'));
  } catch { return {}; }
}

export function parseAgentThemePreferences(raw: string | null, legacySurfaceRaw: string | null = null, defaults = AGENT_THEME_DEFAULTS): AgentThemePreferences {
  const stored = parseRecord(raw);
  const regions = record(stored.regions);
  const oldSurfaces = record(stored.surfaces);
  const legacySurfaces = parseRecord(legacySurfaceRaw);
  const readRegion = (region: AgentThemeRegion): AgentRegionPreferences => {
    const fallback = defaults.regions[region];
    const value = record(regions[region]);
    const oldSurface = normalizeAgentSurface(legacySurfaces[region], normalizeAgentSurface(oldSurfaces[region], fallback.surface));
    const legacyComposerBackground = region === 'composer' && (legacySurfaces[region] || oldSurfaces[region]) && oldSurface.enabled;
    const oldBackground = stored.workspaceBackground === false ? false : legacyComposerBackground ? true : fallback.workspaceBackground;
    const background = regions[region] ? value.workspaceBackground : oldBackground;
    const textColor = regions[region] ? value.textColor : stored[`${region}TextColor`];
    return {
      mode: themeMode(value.mode === undefined ? stored[region] : value.mode, fallback.mode),
      workspaceBackground: background === null || typeof background === 'boolean' ? background : fallback.workspaceBackground,
      textColor: textColor === null ? null : agentTextColor(textColor) ?? fallback.textColor,
      font: typeof value.font === 'string' && Object.hasOwn(AGENT_THEME_FONTS, value.font) ? value.font as AgentThemeFont : fallback.font,
      surface: normalizeAgentSurface(value.surface, regions[region] ? fallback.surface : oldSurface),
    };
  };
  return { regions: { sidebar: readRegion('sidebar'), composer: readRegion('composer'), chat: readRegion('chat'), results: readRegion('results') } };
}

export function readAgentThemePreferences(storage: Pick<Storage, 'getItem'>, defaults = AGENT_THEME_DEFAULTS): AgentThemePreferences {
  return parseAgentThemePreferences(storage.getItem(AGENT_THEME_CONFIG.storageKey), storage.getItem(AGENT_THEME_CONFIG.surfaceStorageKey), defaults);
}

export function saveAgentThemePreferences(storage: Pick<Storage, 'setItem'>, preferences: AgentThemePreferences) {
  storage.setItem(AGENT_THEME_CONFIG.storageKey, JSON.stringify(preferences));
}

export function resolveAgentTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  return mode === 'system' ? systemDark ? 'dark' : 'light' : mode;
}
