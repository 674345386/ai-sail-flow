import { z } from 'zod';

export const AGENT_THEME_MODES = ['light', 'studio-white', 'dark', 'warm', 'compact', 'system'] as const;
export type ThemeMode = typeof AGENT_THEME_MODES[number];

const fonts = ['default', 'sans', 'serif', 'mono'] as const;
export type AgentThemeFont = typeof fonts[number];

const surface = z.object({
  enabled: z.boolean(),
  gray: z.number().int().min(0).max(100),
  opacity: z.number().int().min(0).max(100),
  blur: z.number().int().min(0).max(32),
});

const region = z.object({
  mode: z.enum(AGENT_THEME_MODES).nullable(),
  workspaceBackground: z.boolean().nullable(),
  textColor: z.string().regex(/^#[\da-f]{6}$/i).nullable(),
  font: z.enum(fonts),
  surface,
});

export const agentThemeDefaultsSchema = z.object({
  regions: z.object({ sidebar: region, composer: region, chat: region, results: region }),
});

export type AgentThemePreferences = z.infer<typeof agentThemeDefaultsSchema>;
export type AgentRegionPreferences = z.infer<typeof region>;
export type AgentSurfacePreferences = z.infer<typeof surface>;
