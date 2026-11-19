import { useEffect, useId, useRef } from 'react';
import { ChevronDown, Palette, RotateCcw } from 'lucide-react';
import { AGENT_SURFACE_DEFAULTS, AGENT_THEME_CONFIG, AGENT_THEME_FONTS, AGENT_THEME_REGIONS, AGENT_THEME_REGION_IDS, agentRegionMode, agentRegionUsesBackground, type AgentRegionPreferences, type AgentSurfacePreferences, type AgentThemeFont, type AgentThemeRegion, type ThemeMode } from './theme';
import type { AgentThemeController } from './useAgentTheme';
import './agent-theme-picker.css';

const modeOptions = AGENT_THEME_CONFIG.modes.map(({ value, label }) => <option key={value} value={value}>{label}</option>);
const fontOptions = Object.entries(AGENT_THEME_FONTS).map(([value, label]) => <option key={value} value={value}>{label}</option>);
const surfaceControls = [
  { key: 'gray', label: '灰度', max: 100, unit: '%' },
  { key: 'opacity', label: '不透明度', max: 100, unit: '%' },
  { key: 'blur', label: '背景模糊', max: 32, unit: 'px' },
] as const;

function TextColorSetting({ color, fallback, onChange }: {
  color: string | null;
  fallback: string;
  onChange: (color: string | null) => void;
}) {
  const id = useId();
  return <div className="iua-theme-color-row"><label htmlFor={id}>文字颜色</label><div className="iua-theme-color-control">
    <input id={id} type="color" value={color || fallback} onChange={event => onChange(event.target.value)} />
    <span>{color?.toUpperCase() || '自动'}</span>
    <button type="button" title="恢复自动颜色" aria-label="恢复自动颜色" disabled={!color} onClick={() => onChange(null)}><RotateCcw size={13} /></button>
  </div></div>;
}

function RegionThemeSettings({ region, group, settings, themeLabel, defaultTextColor, backgroundEnabled, backgroundControlsOpen, onOpenBackgroundControls, onChange }: {
  region: AgentThemeRegion;
  group: string;
  settings: AgentRegionPreferences;
  themeLabel: string | undefined;
  defaultTextColor: string;
  backgroundEnabled: boolean;
  backgroundControlsOpen: boolean;
  onOpenBackgroundControls: () => void;
  onChange: (patch: Partial<AgentRegionPreferences>) => void;
}) {
  const surface = settings.surface;
  const updateSurface = (patch: Partial<AgentSurfacePreferences>) => onChange({ surface: { ...surface, ...patch } });
  return <details className="iua-theme-region" name={group}>
    <summary><span>{AGENT_THEME_REGIONS[region]}</span><span className="iua-theme-region-mode">{themeLabel}</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="iua-theme-region-controls">
      <label>主题<select value={settings.mode ?? ''} onChange={event => onChange({ mode: (event.target.value || null) as ThemeMode | null })}>
        {(region === 'sidebar' || region === 'composer') && <option value="">跟随聊天框</option>}
        {modeOptions}
      </select></label>
      <label>字体<select value={settings.font} onChange={event => onChange({ font: event.target.value as AgentThemeFont })}>{fontOptions}</select></label>
      <TextColorSetting color={settings.textColor} fallback={defaultTextColor} onChange={textColor => onChange({ textColor })} />
      <fieldset className="iua-theme-surface-setting">
        <legend>面板质感</legend>
        <div className="iua-theme-surface-heading">
          <label className="iua-theme-check"><input type="checkbox" checked={surface.enabled} onChange={event => updateSurface({ enabled: event.target.checked })} />灰色面板</label>
          <button type="button" onClick={() => onChange({ surface: { ...AGENT_SURFACE_DEFAULTS[region], enabled: true } })}>参考图灰色</button>
        </div>
        {surfaceControls.map(({ key, label, max, unit }) => <label className="iua-theme-surface-range" key={key}>
          <span>{label}</span><input type="range" min={0} max={max} step={1} value={surface[key]} disabled={!surface.enabled} aria-label={label} onChange={event => updateSurface({ [key]: Number(event.target.value) })} />
          <output>{surface[key]}{unit}</output>
        </label>)}
      </fieldset>
      <label className="iua-theme-check"><input type="checkbox" checked={backgroundEnabled} onChange={event => onChange({ workspaceBackground: event.target.checked })} />应用 Background 背景</label>
      <button className="iua-theme-palette-button" type="button" aria-controls="agent-background-controls" aria-expanded={backgroundControlsOpen} onClick={onOpenBackgroundControls}>
        <Palette size={15} aria-hidden="true" /><span>{backgroundEnabled ? '打开 Background 调色板' : '启用并打开 Background 调色板'}</span>
      </button>
    </div>
  </details>;
}

export function AgentThemePicker({ theme, backgroundControlsOpen, onOpenBackgroundControls }: {
  theme: AgentThemeController;
  backgroundControlsOpen: boolean;
  onOpenBackgroundControls: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const group = useId();
  const { preferences } = theme;
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (details.current?.open && !details.current.contains(event.target as Node)) details.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const chatMode = agentRegionMode(preferences, 'chat');
  const combined = AGENT_THEME_REGION_IDS.every(region => agentRegionMode(preferences, region) === chatMode) ? chatMode : 'custom';
  return <details className="iua-theme-picker" ref={details} onKeyDown={event => {
    if (event.key === 'Escape' && details.current?.open) { details.current.open = false; summary.current?.focus(); event.stopPropagation(); }
  }}>
    <summary ref={summary} title="主题" aria-label="主题"><Palette size={16} /><span>主题</span><ChevronDown size={13} /></summary>
    <div className="iua-theme-menu" role="group" aria-label="Agent 主题设置">
      <label>整体主题<select value={combined} onChange={event => theme.setTheme(event.target.value as ThemeMode)}>
        {combined === 'custom' && <option value="custom" disabled>按区域设置</option>}{modeOptions}
      </select></label>
      <div className="iua-theme-regions">
        {AGENT_THEME_REGION_IDS.map(region => <RegionThemeSettings key={region} region={region} group={group} settings={preferences.regions[region]}
          themeLabel={AGENT_THEME_CONFIG.modes.find(mode => mode.value === agentRegionMode(preferences, region))?.label} defaultTextColor={theme.defaultTextColor(region)}
          backgroundEnabled={agentRegionUsesBackground(preferences, region)} backgroundControlsOpen={backgroundControlsOpen}
          onChange={patch => theme.setRegion(region, patch)} onOpenBackgroundControls={() => {
            if (details.current) details.current.open = false;
            theme.setRegion(region, { workspaceBackground: true });
            onOpenBackgroundControls();
          }} />)}
      </div>
      <button type="button" onClick={theme.resetTheme}>恢复所有区域默认设置</button>
    </div>
  </details>;
}
