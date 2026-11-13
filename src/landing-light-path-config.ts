export const LIGHT_PATH_STORAGE_KEY = 'sail-landing-spectrum-v1';
export const LIGHT_PATH_EVENT = 'sail:landing-spectrum';
export type PrismShape = 'mixed' | 'triangle' | 'rectangle' | 'diamond';
export type LightPathConfig = {
  enabled: boolean; paused: boolean; beamWidth: number; intensity: number; dispersion: number;
  prismScale: number; glassOpacity: number; mouseStrength: number; scrollStrength: number; shape: PrismShape;
};
export const DEFAULT_LIGHT_PATH: LightPathConfig = {
  enabled: true, paused: false, beamWidth: 3.2, intensity: 1.65, dispersion: 1.25,
  prismScale: 2.25, glassOpacity: .92, mouseStrength: 1, scrollStrength: 1, shape: 'mixed',
};
export function normalizeLightPath(raw: unknown): LightPathConfig {
  const config = { ...DEFAULT_LIGHT_PATH };
  if (!raw || typeof raw !== 'object') return config;
  const values = raw as Record<string, unknown>;
  for (const key of ['enabled', 'paused'] as const) if (typeof values[key] === 'boolean') config[key] = values[key];
  for (const [key, lo, hi] of [
    ['beamWidth', .5, 6], ['intensity', .25, 3], ['dispersion', .5, 2], ['prismScale', 1, 3.5],
    ['glassOpacity', .2, 1], ['mouseStrength', 0, 2], ['scrollStrength', 0, 2],
  ] as const) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) config[key] = Math.max(lo, Math.min(hi, value));
  }
  if (['mixed', 'triangle', 'rectangle', 'diamond'].includes(String(values.shape))) config.shape = values.shape as PrismShape;
  return config;
}
export function loadLightPath(): LightPathConfig {
  try { return normalizeLightPath(JSON.parse(localStorage.getItem(LIGHT_PATH_STORAGE_KEY) || 'null')); }
  catch { return { ...DEFAULT_LIGHT_PATH }; }
}
