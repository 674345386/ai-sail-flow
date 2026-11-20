import { DEFAULT_COLOR, DEFAULT_SHAPE, COLOR_BY_ID, SHAPE_BY_ID, type ColorId, type ShapeId } from './bot/skins';
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type ExpressionId } from './bot/expressions';
import type { StateId } from './bot/states';

export interface BloubAvatarConfig {
  shape: ShapeId;
  color: ColorId;
  expression: ExpressionId;
}

export const DEFAULT_BLOUB_CONFIG: BloubAvatarConfig = {
  shape: DEFAULT_SHAPE,
  color: DEFAULT_COLOR,
  expression: DEFAULT_EXPRESSION,
};

export const BLOUB_SHAPE_LABELS: Record<ShapeId, string> = {
  cercle: '圆形',
  galet: '鹅卵石',
  squircle: '超椭圆',
  capsule: '胶囊',
  triangle: '三角',
  hexagone: '六边形',
  nuage: '云朵',
  goutte: '水滴',
};

export const BLOUB_COLOR_LABELS: Record<ColorId, string> = {
  encre: '墨黑',
  brun: '焦糖',
  rouge: '绯红',
  orange: '暖橙',
  ambre: '琥珀',
  vert: '翠绿',
  turquoise: '青绿',
  bleu: '天蓝',
  violet: '紫罗兰',
  rose: '玫粉',
  gris: '银灰',
  creme: '奶油',
};

export const BLOUB_EXPRESSION_LABELS: Record<ExpressionId, string> = {
  neutre: '平静',
  attentif: '专注',
  surpris: '惊讶',
  excite: '兴奋',
  heureux: '开心',
  hilare: '大笑',
  colere: '生气',
  triste: '难过',
  effraye: '紧张',
  mefiant: '警惕',
  confus: '疑惑',
  curieux: '好奇',
  fier: '自信',
  timide: '害羞',
  blase: '淡定',
  somnolent: '困倦',
};

export function bloubPaperColor(color: ColorId): string {
  return color === 'creme' ? '#1c1e24' : '#f4f3ee';
}

export function normalizeBloubConfig(raw: unknown): BloubAvatarConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const shape = typeof record.shape === 'string' && SHAPE_BY_ID.has(record.shape) ? (record.shape as ShapeId) : null;
  const color = typeof record.color === 'string' && COLOR_BY_ID.has(record.color) ? (record.color as ColorId) : null;
  const expression = typeof record.expression === 'string' && EXPRESSION_BY_ID.has(record.expression)
    ? (record.expression as ExpressionId)
    : DEFAULT_EXPRESSION;
  if (!shape && !color) return null;
  return {
    shape: shape || DEFAULT_SHAPE,
    color: color || DEFAULT_COLOR,
    expression,
  };
}

const STORAGE_KEY = 'sail-bloub-avatar-v1';
export const BLOUB_CHANGE_EVENT = 'sail-bloub-change';

export function readStoredBloubConfig(): BloubAvatarConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeBloubConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredBloubConfig(config: BloubAvatarConfig | null) {
  try {
    if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BLOUB_CHANGE_EVENT, { detail: config }));
  }
}

export interface AgentBloubContextInput {
  status: 'idle' | 'running' | 'failed';
  sending?: boolean;
  connected?: boolean;
  activity?: string;
  latestStep?: string;
  error?: string;
  queuedCount?: number;
  queuePaused?: boolean;
  justCompleted?: boolean;
  isTyping?: boolean;
}

export interface ResolvedAgentBloubState {
  state: StateId;
  label: string;
  detail: string;
  tone: 'idle' | 'working' | 'success' | 'warn' | 'error';
}

export function resolveAgentBloubState(input: AgentBloubContextInput): ResolvedAgentBloubState {
  if (input.status === 'failed' || input.error) {
    return {
      state: 'alert',
      label: '遇到异常',
      detail: input.error || '本次任务未能完成，请重试或调整要求',
      tone: 'error',
    };
  }
  if (input.connected === false) {
    return {
      state: 'sleep',
      label: '重新连接中',
      detail: '等待工作区连接恢复…',
      tone: 'warn',
    };
  }
  if (input.sending || input.status === 'running') {
    const hint = `${input.activity || ''} ${input.latestStep || ''}`.toLowerCase();
    if (/视频|合成|剪辑|渲染|镜头|首尾帧|video|compose|minimax|ffmpeg/.test(hint)) {
      return {
        state: 'play',
        label: '视频制作中',
        detail: input.activity || input.latestStep || '正在生成或合成视频…',
        tone: 'working',
      };
    }
    if (/图片|生图|画|海报|关键帧|九宫格|image|grid|visual/.test(hint)) {
      return {
        state: 'swirl',
        label: '视觉生成中',
        detail: input.activity || input.latestStep || '正在生成视觉素材…',
        tone: 'working',
      };
    }
    if (/分析|规划|方案|路线|工具|搜索|检索|读取|画布|实验|界面|skill|route|canvas|panel|tool/.test(hint)) {
      return {
        state: 'orbit',
        label: '执行工具中',
        detail: input.activity || input.latestStep || '正在分析上下文并调度工具…',
        tone: 'working',
      };
    }
    return {
      state: 'thinking',
      label: '深度思考中',
      detail: input.activity || input.latestStep || '正在构思方案与回复…',
      tone: 'working',
    };
  }
  if (input.justCompleted) {
    return {
      state: 'burst',
      label: '创作完成',
      detail: '结果已准备好，可在对话或右侧查看',
      tone: 'success',
    };
  }
  if (input.queuePaused) {
    return {
      state: 'notify',
      label: '队列已暂停',
      detail: '有待发送的排队消息等待恢复',
      tone: 'warn',
    };
  }
  if (input.queuedCount && input.queuedCount > 0) {
    return {
      state: 'notify',
      label: `${input.queuedCount} 条待执行`,
      detail: '排队中的指令将自动接续处理',
      tone: 'idle',
    };
  }
  if (input.isTyping) {
    return {
      state: 'wide',
      label: '倾听中',
      detail: '随时准备响应你的创意指令',
      tone: 'idle',
    };
  }
  return {
    state: 'idle',
    label: '待命中',
    detail: '输入想法即可开始协作创作',
    tone: 'idle',
  };
}
