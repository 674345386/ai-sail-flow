import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listVideoSkills, type BuiltinVideoSkillMeta } from './video-skills';

export type CapabilityTier = 'primary' | 'auxiliary';

export interface RegisteredToolCapability {
  id: string;
  name: string;
  tier: CapabilityTier;
  category: 'image' | 'video' | 'audio' | 'pre-viz' | 'qc' | 'compose' | 'programmatic' | 'mcp' | 'planning';
  description: string;
  source: 'builtin' | 'plugin';
  mediaOutput?: 'image' | 'video' | 'text';
  endpoint?: string;
}

export interface CapabilityRegistrySnapshot {
  updatedAt: string;
  tools: RegisteredToolCapability[];
  skills: BuiltinVideoSkillMeta[];
}

const BUILTIN_CAPABILITIES: RegisteredToolCapability[] = [
  { id: 'generate_image', name: '图片生成与编辑', tier: 'primary', category: 'image', description: '文生图或携带最多 4 张参考图进行构图/关键帧生成', source: 'builtin', mediaOutput: 'image' },
  { id: 'generate_video', name: '通用视频生成与 V2V 编辑', tier: 'primary', category: 'video', description: 'H3 文生/图生/多图参考视频，或 Omni Flash 1.2 原片区间编辑', source: 'builtin', mediaOutput: 'video' },
  { id: 'generate_first_last_frame_video', name: '首尾帧插值视频', tier: 'primary', category: 'video', description: '锁定首帧与尾帧锚点生成丝滑过渡与跨镜连续镜头', source: 'builtin', mediaOutput: 'video' },
  { id: 'generate_grid_video', name: '九宫格分镜生视频', tier: 'primary', category: 'video', description: '基于 3×3 故事板直接生成统一光影的连续片段', source: 'builtin', mediaOutput: 'video' },
  { id: 'generate_minimax_video', name: 'MiniMax 视频生成', tier: 'primary', category: 'video', description: 'MiniMax 渠道幂等视频生成', source: 'builtin', mediaOutput: 'video' },
  { id: 'build_video_storyboard', name: '拼合 3×3 故事板', tier: 'auxiliary', category: 'image', description: '将 1–9 张有序关键帧免费拼合为 3×3 生产分镜图', source: 'builtin', mediaOutput: 'image' },
  { id: 'build_animatic_preview', name: 'Animatic 动态分镜预演', tier: 'auxiliary', category: 'pre-viz', description: '用本地 FFmpeg 将关键帧与可选音频免费合成为带平滑推拉的预演视频', source: 'builtin', mediaOutput: 'video' },
  { id: 'inspect_artifact_quality', name: '产物抽帧与 VLM 质检', tier: 'auxiliary', category: 'qc', description: '自动抽取视频首/中/尾帧或读取图片供多模态核查一致性与畸变', source: 'builtin', mediaOutput: 'text' },
  { id: 'compose_video', name: '本地剪辑与合成', tier: 'primary', category: 'compose', description: '按顺序拼接已完成视频片段、裁切时长或局部替换原片区间', source: 'builtin', mediaOutput: 'video' },
  { id: 'programmatic', name: '程序化代码视频与脚本', tier: 'primary', category: 'programmatic', description: '在独立工作目录编写 Remotion/Manim/FFmpeg 脚本并发布产物', source: 'builtin', mediaOutput: 'video' },
  { id: 'publish_experiment_file', name: '发布本地工作文件', tier: 'auxiliary', category: 'planning', description: '将抽帧图片、渲染视频或代码文件发布到实验台并生成可用 referenceId', source: 'builtin' },
  { id: 'discover_experiment_methods', name: '发现方法与 Skill', tier: 'auxiliary', category: 'planning', description: '检索内置视频 Skill、空间方法、平台资产与 GitHub 仓库', source: 'builtin' },
  { id: 'read_experiment_method', name: '阅读方法与 Skill 全文', tier: 'auxiliary', category: 'planning', description: '按需读取 builtin://<id> 内置视频 Skill 或 GitHub README', source: 'builtin' },
];

const AUXILIARY_SET = new Set(BUILTIN_CAPABILITIES.filter(item => item.tier === 'auxiliary').map(item => item.id));

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_TOOL_DIRS = [
  path.resolve(process.cwd(), 'skills/tools'),
  path.resolve(moduleDir, '../skills/tools'),
];

function loadPluginCapabilities(): RegisteredToolCapability[] {
  for (const dir of PLUGIN_TOOL_DIRS) {
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      const files = fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort();
      const loaded: RegisteredToolCapability[] = [];
      for (const file of files) {
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Partial<RegisteredToolCapability>;
          if (!parsed.id || !/^[a-z][a-z0-9_.:/-]{1,80}$/i.test(parsed.id)) continue;
          loaded.push({
            id: parsed.id,
            name: parsed.name || parsed.id,
            tier: parsed.tier === 'auxiliary' ? 'auxiliary' : 'primary',
            category: parsed.category || 'mcp',
            description: parsed.description || '',
            source: 'plugin',
            mediaOutput: parsed.mediaOutput,
            endpoint: parsed.endpoint,
          });
        } catch {
          // Skip malformed plugin descriptor.
        }
      }
      return loaded;
    } catch {
      // Directory optional.
    }
  }
  return [];
}

export function getCapabilityRegistry(): CapabilityRegistrySnapshot {
  const plugins = loadPluginCapabilities();
  const seen = new Set(BUILTIN_CAPABILITIES.map(item => item.id));
  const tools = [...BUILTIN_CAPABILITIES, ...plugins.filter(item => !seen.has(item.id))];
  return {
    updatedAt: new Date().toISOString(),
    tools,
    skills: listVideoSkills(),
  };
}

export function isAuxiliaryTool(toolId: string): boolean {
  if (AUXILIARY_SET.has(toolId)) return true;
  return loadPluginCapabilities().some(item => item.id === toolId && item.tier === 'auxiliary');
}
