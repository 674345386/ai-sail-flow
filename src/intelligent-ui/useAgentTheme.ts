import { useEffect, useRef, useState } from 'react';
import { loadActiveBackgroundBase } from '../landing-background-config';
import { AGENT_SURFACE_DEFAULTS, AGENT_THEME_CANVAS_COLORS, AGENT_THEME_CONFIG, AGENT_THEME_TEXT_COLORS, agentBackgroundStyle, agentContrastColor, agentSurfaceStyle, agentTextColor, agentTextColorStyle, normalizeAgentSurface, readAgentThemePreferences, resolveAgentTheme, saveAgentThemePreferences, type AgentSurfacePreferences, type AgentSurfaceScope, type AgentThemePanel, type AgentThemePreferences, type AgentTextColorScope, type ThemeMode } from './theme';

function loadPreferences(): AgentThemePreferences {
  try { return readAgentThemePreferences(window.localStorage); }
  catch { return { ...AGENT_THEME_CONFIG.defaults }; }
}

export function useAgentTheme() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const preferencesRef = useRef(preferences);
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

  const chatTheme = resolveAgentTheme(preferences.chat, systemDark);
  const resultsTheme = resolveAgentTheme(preferences.results, systemDark);
  const backgroundInk = agentContrastColor(backgroundBase);
  const defaultTextColors = {
    chat: preferences.workspaceBackground ? backgroundInk : AGENT_THEME_TEXT_COLORS[chatTheme],
    results: preferences.workspaceBackground ? backgroundInk : AGENT_THEME_TEXT_COLORS[resultsTheme],
  };
  return {
    preferences,
    chatTheme, resultsTheme, defaultTextColors, setBackgroundBase,
    backgroundStyle: preferences.workspaceBackground ? agentBackgroundStyle(backgroundBase) : undefined,
    backgroundTone: backgroundInk === '#ffffff' ? 'dark' : 'light',
    chatTextStyle: agentTextColorStyle(preferences.chatTextColor, preferences.workspaceBackground ? defaultTextColors.chat : undefined),
    resultsTextStyle: agentTextColorStyle(preferences.resultsTextColor, preferences.workspaceBackground ? defaultTextColors.results : undefined),
    surfaceStyle: (scope: AgentSurfaceScope, backgroundEnabled = preferences.workspaceBackground) => agentSurfaceStyle(preferences.surfaces[scope], backgroundEnabled ? backgroundBase : AGENT_THEME_CANVAS_COLORS[chatTheme], backgroundEnabled),
    setSurface: (scope: AgentSurfaceScope, patch: Partial<AgentSurfacePreferences>) => updatePreferences(current => ({ ...current, surfaces: { ...current.surfaces, [scope]: normalizeAgentSurface({ ...current.surfaces[scope], ...patch }, AGENT_SURFACE_DEFAULTS[scope]) } })),
    setGraySurfaces: () => updatePreferences(current => ({ ...current, surfaces: { sidebar: { ...AGENT_SURFACE_DEFAULTS.sidebar, enabled: true }, composer: { ...AGENT_SURFACE_DEFAULTS.composer, enabled: true } } })),
    setTheme: (mode: ThemeMode) => updatePreferences(current => ({ ...current, chat: mode, results: mode })),
    setPanelTheme: (panel: AgentThemePanel, mode: ThemeMode) => updatePreferences(current => ({ ...current, [panel]: mode })),
    setWorkspaceBackground: (enabled: boolean) => updatePreferences(current => ({ ...current, workspaceBackground: enabled })),
    setTextColor: (scope: AgentTextColorScope, color: string | null) => updatePreferences(current => ({
      ...current,
      ...(scope !== 'results' ? { chatTextColor: agentTextColor(color) } : {}),
      ...(scope !== 'chat' ? { resultsTextColor: agentTextColor(color) } : {}),
    })),
    resetTheme: () => updatePreferences(current => ({ ...current, chat: AGENT_THEME_CONFIG.defaults.chat, results: AGENT_THEME_CONFIG.defaults.results, chatTextColor: null, resultsTextColor: null, surfaces: AGENT_SURFACE_DEFAULTS })),
  };
}

export type AgentThemeController = ReturnType<typeof useAgentTheme>;
