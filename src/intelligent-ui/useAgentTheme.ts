import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { loadActiveBackgroundBase } from '../landing-background-config';
import { AGENT_THEME_CANVAS_COLORS, AGENT_THEME_CONFIG, AGENT_THEME_DEFAULTS, AGENT_THEME_REGION_IDS, AGENT_THEME_TEXT_COLORS, agentBackgroundStyle, agentContrastColor, agentRegionFontStyle, agentRegionMode, agentRegionUsesBackground, agentSurfaceStyle, agentTextColorStyle, readAgentThemePreferences, resolveAgentTheme, saveAgentThemePreferences, type AgentRegionPreferences, type AgentThemePreferences, type AgentThemeRegion, type ThemeMode } from './theme';

function loadPreferences(): AgentThemePreferences {
  try { return readAgentThemePreferences(window.localStorage); }
  catch { return AGENT_THEME_DEFAULTS; }
}

function controlTextStyle(color: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    '--iui-ink': color,
    '--iui-ink-hover': `color-mix(in srgb, ${color} 85%, var(--iui-canvas))`,
    '--iui-muted': `color-mix(in srgb, ${color} 72%, var(--iui-canvas))`,
    '--iui-faint': 'var(--iui-muted)',
    '--iui-label-ink': color,
    '--iui-on-ink': agentContrastColor(color),
  } as CSSProperties;
}

export function useAgentTheme() {
  const [storedPreferences, setPreferences] = useState(loadPreferences);
  const preferencesRef = useRef(storedPreferences);
  const updatePreferences = (update: (current: AgentThemePreferences) => AgentThemePreferences) => {
    const next = update(preferencesRef.current);
    preferencesRef.current = next;
    try { saveAgentThemePreferences(window.localStorage, next); }
    catch { /* Settings still apply when persistent storage is unavailable. */ }
    setPreferences(next);
  };
  const [backgroundBase, setBackgroundBase] = useState(() => loadActiveBackgroundBase('sail-workspace-bg-v1'));
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    const sync = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === AGENT_THEME_CONFIG.storageKey || event.key === AGENT_THEME_CONFIG.surfaceStorageKey || event.key === null)) {
        const next = loadPreferences();
        preferencesRef.current = next;
        setPreferences(next);
      }
    };
    window.addEventListener('storage', sync);
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', sync); };
  }, []);

  const preferences = storedPreferences;
  const regionTheme = (region: AgentThemeRegion) => resolveAgentTheme(agentRegionMode(preferences, region), systemDark);
  const usesBackground = (region: AgentThemeRegion) => agentRegionUsesBackground(preferences, region);
  const hasWorkspaceBackground = AGENT_THEME_REGION_IDS.some(usesBackground);
  const backgroundStyle = hasWorkspaceBackground ? agentBackgroundStyle(backgroundBase) : undefined;

  function regionPresentation(region: AgentThemeRegion, backgroundAvailable = true) {
    const settings = preferences.regions[region];
    const mode = regionTheme(region);
    const backgroundEnabled = backgroundAvailable && usesBackground(region);
    const surface = agentSurfaceStyle(settings.surface, backgroundEnabled ? backgroundBase : AGENT_THEME_CANVAS_COLORS[mode], backgroundEnabled);
    // Keep the original opaque composer palette while it follows the chat defaults.
    const followsChatPalette = region === 'composer' && backgroundAvailable && settings.mode === null && settings.workspaceBackground === null && !surface && usesBackground('chat');
    const palette = backgroundEnabled || followsChatPalette ? backgroundStyle : undefined;
    const backgroundInk = palette ? agentContrastColor(backgroundBase) : undefined;
    return { settings, mode, backgroundEnabled, surface, palette, backgroundInk };
  }

  return {
    preferences,
    chatTheme: regionTheme('chat'),
    resultsTheme: regionTheme('results'),
    hasWorkspaceBackground, usesBackground, setBackgroundBase, backgroundStyle,
    defaultTextColor: (region: AgentThemeRegion) => {
      const { mode, surface, backgroundInk } = regionPresentation(region);
      return surface?.['--iui-ink'] ?? backgroundInk ?? AGENT_THEME_TEXT_COLORS[mode];
    },
    regionProps: (region: AgentThemeRegion, backgroundAvailable = true) => {
      const { settings, mode, backgroundEnabled, surface, palette, backgroundInk } = regionPresentation(region, backgroundAvailable);
      const contentOnly = region === 'chat' || region === 'results';
      return {
        'data-theme': mode,
        'data-region-background': backgroundEnabled ? 'on' : 'off',
        'data-custom-surface': settings.surface.enabled ? 'on' : 'off',
        style: {
          ...palette,
          ...surface,
          ...agentRegionFontStyle(settings.font),
          ...(contentOnly ? agentTextColorStyle(settings.textColor, surface ? undefined : backgroundInk) : controlTextStyle(settings.textColor)),
        } satisfies CSSProperties,
      };
    },
    setRegion: (region: AgentThemeRegion, patch: Partial<AgentRegionPreferences>) => updatePreferences(current => ({
      regions: { ...current.regions, [region]: { ...current.regions[region], ...patch } },
    })),
    setTheme: (mode: ThemeMode) => updatePreferences(({ regions }) => ({
      regions: {
        sidebar: { ...regions.sidebar, mode: regions.sidebar.mode === null ? null : mode, surface: mode === 'dark' ? { ...regions.sidebar.surface, enabled: true } : regions.sidebar.surface },
        composer: { ...regions.composer, mode: regions.composer.mode === null ? null : mode, surface: mode === 'dark' ? { ...regions.composer.surface, enabled: true } : regions.composer.surface },
        chat: { ...regions.chat, mode },
        results: { ...regions.results, mode },
      },
    })),
    resetTheme: () => updatePreferences(() => AGENT_THEME_DEFAULTS),
  };
}

export type AgentThemeController = ReturnType<typeof useAgentTheme>;
