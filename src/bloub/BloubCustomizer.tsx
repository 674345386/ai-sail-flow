import { Check, Shuffle } from 'lucide-react';
import { BloubAvatar } from './BloubAvatar';
import { COLORS, SHAPES } from './bot/skins';
import { EXPRESSIONS } from './bot/expressions';
import {
  BLOUB_COLOR_LABELS,
  BLOUB_EXPRESSION_LABELS,
  BLOUB_SHAPE_LABELS,
  type BloubAvatarConfig,
} from './bloubConfig';
import './bloub.css';

export function BloubCustomizer({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: BloubAvatarConfig;
  onChange: (next: BloubAvatarConfig) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const shuffle = () => {
    if (disabled) return;
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)]!.id;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]!.id;
    const expression = EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)]!.id;
    onChange({ shape, color, expression });
  };

  return (
    <div className={`bloub-customizer${compact ? ' is-compact' : ''}`}>
      <div className="bloub-customizer-section">
        <div className="bloub-customizer-header">
          <span>形状</span>
          <button
            type="button"
            className="bloub-shuffle-btn"
            disabled={disabled}
            onClick={shuffle}
            title="随机搭配一个 Bloub 头像"
          >
            <Shuffle size={12} aria-hidden="true" />
            <span>随机搭配</span>
          </button>
        </div>
        <div className="bloub-shape-grid" role="group" aria-label="选择 Bloub 形状">
          {SHAPES.map((item) => {
            const active = value.shape === item.id;
            const title = BLOUB_SHAPE_LABELS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`bloub-shape-btn${active ? ' is-selected' : ''}`}
                disabled={disabled}
                aria-label={title}
                aria-pressed={active}
                title={title}
                onClick={() => onChange({ ...value, shape: item.id })}
              >
                <BloubAvatar
                  size={compact ? 26 : 30}
                  shape={item.id}
                  color={value.color}
                  expression={value.expression}
                  frozenAt={0}
                  framed
                />
                {!compact && <small>{title}</small>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bloub-customizer-section">
        <div className="bloub-customizer-header">
          <span>颜色</span>
          <small>{BLOUB_COLOR_LABELS[value.color]}</small>
        </div>
        <div className="bloub-color-grid" role="group" aria-label="选择 Bloub 颜色">
          {COLORS.map((item) => {
            const active = value.color === item.id;
            const title = BLOUB_COLOR_LABELS[item.id];
            const isLight = item.id === 'creme' || item.id === 'ambre' || item.id === 'gris';
            return (
              <button
                key={item.id}
                type="button"
                className={`bloub-color-btn${active ? ' is-selected' : ''}${item.id === 'creme' ? ' is-creme' : ''}`}
                disabled={disabled}
                aria-label={title}
                aria-pressed={active}
                title={title}
                style={{ backgroundColor: item.hex }}
                onClick={() => onChange({ ...value, color: item.id })}
              >
                {active && <Check size={12} strokeWidth={3} color={isLight ? '#181a1f' : '#ffffff'} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bloub-customizer-section">
        <div className="bloub-customizer-header">
          <span>默认神态</span>
          <small>{BLOUB_EXPRESSION_LABELS[value.expression]}</small>
        </div>
        <div className="bloub-expression-grid" role="group" aria-label="选择 Bloub 默认神态">
          {EXPRESSIONS.map((item) => {
            const active = value.expression === item.id;
            const title = BLOUB_EXPRESSION_LABELS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`bloub-expr-btn${active ? ' is-selected' : ''}`}
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onChange({ ...value, expression: item.id })}
              >
                {title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
