import { useEffect, useId, useRef } from 'react';
import { ChevronDown, Palette, RotateCcw } from 'lucide-react';
import { AGENT_THEME_CONFIG, type AgentSurfacePreferences, type AgentSurfaceScope, type AgentThemePanel, type AgentThemePreferences, type AgentTextColorScope, type ThemeMode } from './theme';
import './agent-theme-picker.css';

function TextColorSetting({ scope, label, color, fallback, mixed = false, onChange }: {
  scope: AgentTextColorScope; label: string; color: string | null; fallback: string; mixed?: boolean;
  onChange: (scope: AgentTextColorScope, color: string | null) => void;
}) {
  const id = `iua-text-color-${scope}`;
  return <div className="iua-theme-color-row"><label htmlFor={id}>{label}</label><div className="iua-theme-color-control">
    <input id={id} type="color" value={color || fallback} aria-label={`${label}颜色`} onChange={event => onChange(scope, event.target.value)} />
    <span title={color || '自动匹配背景'}>{mixed ? '按区域' : color?.toUpperCase() || '自动'}</span>
    <button type="button" title="恢复自动颜色" aria-label={`${label}恢复自动颜色`} disabled={!color && !mixed} onClick={() => onChange(scope, null)}><RotateCcw size={13} /></button>
  </div></div>;
}

function SurfaceSetting({ scope, label, value, onChange }: {
  scope: AgentSurfaceScope; label: string; value: AgentSurfacePreferences;
  onChange: (scope: AgentSurfaceScope, patch: Partial<AgentSurfacePreferences>) => void;
}) {
  const id = useId();
  const controls = [
    { key: 'gray', label: '灰度', max: 100, unit: '%' },
    { key: 'opacity', label: '不透明度', max: 100, unit: '%' },
    { key: 'blur', label: '背景模糊', max: 32, unit: 'px' },
  ] as const;
  return <fieldset className="iua-theme-surface-setting">
    <legend>{label}</legend>
    <label className="iua-theme-surface-toggle"><input type="checkbox" checked={value.enabled} onChange={event => onChange(scope, { enabled: event.target.checked })} /><span>{label}</span></label>
    {controls.map(control => <label className="iua-theme-surface-range" key={control.key} htmlFor={`${id}-${control.key}`}>
      <span>{control.label}</span><input id={`${id}-${control.key}`} type="range" min={0} max={control.max} step={1} value={value[control.key]} disabled={!value.enabled} aria-label={`${label}${control.label}`} onChange={event => onChange(scope, { [control.key]: Number(event.target.value) })} />
      <output htmlFor={`${id}-${control.key}`}>{value[control.key]}{control.unit}</output>
    </label>)}
  </fieldset>;
}

export function AgentThemePicker({ preferences, defaultTextColors, backgroundControlsOpen, onOpenBackgroundControls, onTheme, onPanelTheme, onWorkspaceBackground, onTextColor, onSurface, onGraySurfaces, onReset }: {
  preferences: AgentThemePreferences;
  defaultTextColors: Record<AgentThemePanel, string>;
  backgroundControlsOpen: boolean;
  onOpenBackgroundControls: () => void;
  onTheme: (mode: ThemeMode) => void;
  onPanelTheme: (panel: AgentThemePanel, mode: ThemeMode) => void;
  onWorkspaceBackground: (enabled: boolean) => void;
  onTextColor: (scope: AgentTextColorScope, color: string | null) => void;
  onSurface: (scope: AgentSurfaceScope, patch: Partial<AgentSurfacePreferences>) => void;
  onGraySurfaces: () => void;
  onReset: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (details.current?.open && !details.current.contains(event.target as Node)) details.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const modeOptions = AGENT_THEME_CONFIG.modes.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>);
  const combined = preferences.chat === preferences.results ? preferences.chat : 'custom';
  const mixedText = preferences.chatTextColor !== preferences.resultsTextColor;
  return <details className="iua-theme-picker" ref={details} onKeyDown={event => {
    if (event.key === 'Escape' && details.current?.open) { details.current.open = false; summary.current?.focus(); event.stopPropagation(); }
  }}>
    <summary ref={summary} title="主题" aria-label="主题"><Palette size={16} /><span>主题</span><ChevronDown size={13} /></summary>
    <div className="iua-theme-menu" role="group" aria-label="Agent 主题设置">
      <label>整体主题<select value={combined} onChange={event => onTheme(event.target.value as ThemeMode)}>{combined === 'custom' && <option value="custom" disabled>按区域设置</option>}{modeOptions}</select></label>
      <div className="iua-theme-divider" />
      <div className="iua-theme-surface-heading"><span>面板质感</span><button type="button" onClick={onGraySurfaces}>参考图灰色</button></div>
      <SurfaceSetting scope="sidebar" label="侧栏灰色面板" value={preferences.surfaces.sidebar} onChange={onSurface} />
      <SurfaceSetting scope="composer" label="Prompt 输入框灰色面板" value={preferences.surfaces.composer} onChange={onSurface} />
      <p>灰度从黑到白；不透明度越低，背景越明显。两处可分别启用和调节。</p>
      <div className="iua-theme-divider" />
      <label>左侧聊天栏<select value={preferences.chat} onChange={event => onPanelTheme('chat', event.target.value as ThemeMode)}>{modeOptions}</select></label>
      <label>右侧结果区<select value={preferences.results} onChange={event => onPanelTheme('results', event.target.value as ThemeMode)}>{modeOptions}</select></label>
      <p>{preferences.workspaceBackground ? 'Background 提供整页底色；灰色面板可在上方独立设置。' : '工作空间侧栏和顶部导航跟随左侧聊天栏的主题。'}</p>
      <div className="iua-theme-divider" />
      <label className="iua-theme-background"><input type="checkbox" checked={preferences.workspaceBackground} onChange={event => onWorkspaceBackground(event.target.checked)} /><span>应用 Background 背景</span></label>
      <button type="button" className="iua-theme-palette-button" aria-controls="agent-background-controls" aria-expanded={backgroundControlsOpen} onClick={() => { if (details.current) details.current.open = false; onOpenBackgroundControls(); }}><Palette size={15} aria-hidden="true" /><span>{preferences.workspaceBackground ? '打开 Background 调色板' : '启用并打开 Background 调色板'}</span></button>
      <p>{preferences.workspaceBackground ? '背景覆盖整页；侧栏和输入框的灰度、不透明度与模糊可独立调节。' : '当前使用所选主题；开启后在面板后方显示 Background 背景。'}</p>
      <div className="iua-theme-divider" />
      <TextColorSetting scope="all" label="整体文字" color={mixedText ? null : preferences.chatTextColor} fallback={defaultTextColors.chat} mixed={mixedText} onChange={onTextColor} />
      <TextColorSetting scope="chat" label="聊天文字" color={preferences.chatTextColor} fallback={defaultTextColors.chat} onChange={onTextColor} />
      <TextColorSetting scope="results" label="结果文字" color={preferences.resultsTextColor} fallback={defaultTextColors.results} onChange={onTextColor} />
      <p>正文颜色可单独设置；自动匹配当前背景，控件文字跟随当前界面配色。</p>
      <p>选择会自动保存；跟随系统会随系统外观切换。</p>
      <button type="button" onClick={onReset}>恢复主题、文字与面板默认值</button>
    </div>
  </details>;
}
