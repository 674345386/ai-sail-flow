import type { CSSProperties } from 'react';

export type AgentSurfaceScope = 'sidebar' | 'composer';
export type AgentSurfacePreferences = { enabled: boolean; gray: number; opacity: number; blur: number };
export const AGENT_SURFACE_DEFAULTS: Record<AgentSurfaceScope, AgentSurfacePreferences> = {
  sidebar: { enabled: false, gray: 18, opacity: 88, blur: 16 },
  composer: { enabled: false, gray: 16, opacity: 94, blur: 12 },
};

export const AGENT_THEME_CONFIG = {
  storageKey: 'sail-agent-theme-v1',
  surfaceStorageKey: 'sail-agent-surfaces-v1',
  defaults: { chat: 'light', results: 'light', workspaceBackground: true, chatTextColor: null, resultsTextColor: null, surfaces: AGENT_SURFACE_DEFAULTS },
  modes: [
    { value: 'light', label: '官方浅色' },
    { value: 'dark', label: '中性深色' },
    { value: 'warm', label: '暖白阅读' },
    { value: 'compact', label: '紧凑工作台' },
    { value: 'system', label: '跟随系统' },
  ],
} as const;

export type ThemeMode = typeof AGENT_THEME_CONFIG.modes[number]['value'];
export type ResolvedTheme = Exclude<ThemeMode, 'system'>;
export type AgentThemePreferences = { chat: ThemeMode; results: ThemeMode; workspaceBackground: boolean; chatTextColor: string | null; resultsTextColor: string | null; surfaces: Record<AgentSurfaceScope, AgentSurfacePreferences> };
export type AgentThemePanel = 'chat' | 'results';
export type AgentTextColorScope = AgentThemePanel | 'all';
export const AGENT_THEME_TEXT_COLORS: Record<ResolvedTheme, string> = { light: '#0d0d0d', dark: '#ededed', warm: '#332c25', compact: '#202020' };
export const AGENT_THEME_CANVAS_COLORS: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#171717', warm: '#fbf7ef', compact: '#fafafa' };

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
  const ink = dark ? '#ededed' : '#171717';
  const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, ${base})`;
  const properties: Record<string, string> = {
    colorScheme: dark ? 'dark' : 'light',
    '--iui-canvas': base,
    '--iui-ink': ink,
    '--iui-on-ink': dark ? '#171717' : '#ffffff',
    '--iui-ink-hover': mix(ink, 85),
    '--iui-muted': mix(ink, 72),
    '--iui-faint': mix(ink, 64),
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
  const muted = `color-mix(in srgb, ${color} 72%, transparent)`;
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

export function agentSurfaceStyle(value: AgentSurfacePreferences, backdrop: string, workspaceBackground: boolean): CSSProperties | undefined {
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
    '--iua-bg': palette['--iui-canvas'], '--iua-text': palette['--iui-ink'],
    '--iua-muted': palette['--iui-muted'], '--iua-line': palette['--iui-border'], '--iua-raised': palette['--iui-surface'],
  } as CSSProperties;
}

function themeMode(value: unknown, fallback: ThemeMode): ThemeMode {
  return AGENT_THEME_CONFIG.modes.some(mode => mode.value === value) ? value as ThemeMode : fallback;
}

export function parseAgentThemePreferences(raw: string | null): AgentThemePreferences {
  try {
    const value: unknown = JSON.parse(raw || 'null');
    const stored = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const surfaces = stored.surfaces && typeof stored.surfaces === 'object' ? stored.surfaces as Record<string, unknown> : {};
    return {
      chat: themeMode(stored.chat, AGENT_THEME_CONFIG.defaults.chat),
      results: themeMode(stored.results, AGENT_THEME_CONFIG.defaults.results),
      workspaceBackground: typeof stored.workspaceBackground === 'boolean' ? stored.workspaceBackground : AGENT_THEME_CONFIG.defaults.workspaceBackground,
      chatTextColor: agentTextColor(stored.chatTextColor),
      resultsTextColor: agentTextColor(stored.resultsTextColor),
      surfaces: {
        sidebar: normalizeAgentSurface(surfaces.sidebar, AGENT_SURFACE_DEFAULTS.sidebar),
        composer: normalizeAgentSurface(surfaces.composer, AGENT_SURFACE_DEFAULTS.composer),
      },
    };
  } catch { return { ...AGENT_THEME_CONFIG.defaults }; }
}

export function readAgentThemePreferences(storage: Pick<Storage, 'getItem'>): AgentThemePreferences {
  const preferences = parseAgentThemePreferences(storage.getItem(AGENT_THEME_CONFIG.storageKey));
  // Older tabs may rewrite the theme record without the newer surface fields.
  // Keep those settings in their own record so a legacy write cannot clear them.
  try {
    const raw = storage.getItem(AGENT_THEME_CONFIG.surfaceStorageKey);
    if (!raw) return preferences;
    const surfaces = JSON.parse(raw) as Record<string, unknown> | null;
    if (!surfaces || typeof surfaces !== 'object') return preferences;
    return { ...preferences, surfaces: {
      sidebar: normalizeAgentSurface(surfaces.sidebar, preferences.surfaces.sidebar),
      composer: normalizeAgentSurface(surfaces.composer, preferences.surfaces.composer),
    } };
  } catch { return preferences; }
}

export function saveAgentThemePreferences(storage: Pick<Storage, 'setItem'>, preferences: AgentThemePreferences) {
  storage.setItem(AGENT_THEME_CONFIG.surfaceStorageKey, JSON.stringify(preferences.surfaces));
  storage.setItem(AGENT_THEME_CONFIG.storageKey, JSON.stringify(preferences));
}

export function resolveAgentTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  return mode === 'system' ? systemDark ? 'dark' : 'light' : mode;
}
