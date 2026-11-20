import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BuiltinVideoSkillMeta {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  tools: string[];
  url: string;
  filePath: string;
}

export interface BuiltinVideoSkill extends BuiltinVideoSkillMeta {
  content: string;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIRS = [
  path.resolve(process.cwd(), 'skills/video-production'),
  path.resolve(moduleDir, '../skills/video-production'),
];

function resolveSkillsDir(): string | null {
  for (const dir of SKILLS_DIRS) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // Try next candidate path.
    }
  }
  return null;
}

function parseList(raw: string): string[] {
  const trimmed = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!trimmed) return [];
  return trimmed
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseFrontmatter(raw: string, fallbackId: string): { meta: Omit<BuiltinVideoSkillMeta, 'url' | 'filePath'>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      meta: { id: fallbackId, title: fallbackId, summary: '', tags: [], tools: [] },
      body: raw.trim(),
    };
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) fields[key] = value;
  }
  return {
    meta: {
      id: fields.id || fallbackId,
      title: fields.title || fields.id || fallbackId,
      summary: fields.summary || '',
      tags: fields.tags ? parseList(fields.tags) : [],
      tools: fields.tools ? parseList(fields.tools) : [],
    },
    body: match[2].trim(),
  };
}

/** Reads built-in video production Skills live from skills/video-production/*.md (hot-editable). */
export function listVideoSkills(): BuiltinVideoSkillMeta[] {
  const dir = resolveSkillsDir();
  if (!dir) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort();
  } catch {
    return [];
  }
  const skills: BuiltinVideoSkillMeta[] = [];
  for (const filename of entries) {
    const filePath = path.join(dir, filename);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const fallbackId = filename.replace(/\.md$/i, '');
      const { meta } = parseFrontmatter(raw, fallbackId);
      skills.push({
        ...meta,
        url: `builtin://${meta.id}`,
        filePath,
      });
    } catch {
      // Skip unreadable file.
    }
  }
  return skills;
}

export function readVideoSkill(idOrUrl: string): BuiltinVideoSkill | null {
  const id = idOrUrl.trim().replace(/^builtin:\/\//i, '').replace(/\.md$/i, '');
  if (!/^[\w-]+$/.test(id)) return null;
  const meta = listVideoSkills().find((item) => item.id === id);
  if (!meta) return null;
  try {
    const content = fs.readFileSync(meta.filePath, 'utf8');
    return { ...meta, content };
  } catch {
    return null;
  }
}

export function searchVideoSkills(query: string): (BuiltinVideoSkillMeta & { relevance: number })[] {
  const all = listVideoSkills();
  const terms = query.toLocaleLowerCase().split(/[\s,，、/+]+/).filter(Boolean);
  const broad = !terms.length || terms.some((t) => ['video', '视频', '制作', '工作流', 'workflow', 'mv', '短片'].includes(t));
  const scored = all.map((skill) => {
    const haystack = [skill.id, skill.title, skill.summary, ...skill.tags, ...skill.tools].join(' ').toLocaleLowerCase();
    const relevance = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    return { ...skill, relevance };
  });
  const matched = scored.filter((item) => item.relevance > 0).sort((a, b) => b.relevance - a.relevance);
  return matched.length ? matched : broad ? scored : [];
}

/** Lightweight progressive-disclosure routing index injected into Agent system instructions. */
export function videoSkillRoutingIndex(): string {
  const skills = listVideoSkills();
  if (!skills.length) return '';
  const lines = skills.map((s) => `- \`builtin://${s.id}\` · **${s.title}**：${s.summary}`);
  return [
    'Built-in Video Production Skills (Progressive Disclosure — DO NOT guess or mix conflicting prompt rules across paradigms):',
    'Before calling `propose-routes` for any video creation, remix, continuity, talking-head, or programmatic video task, pick the 1–3 best-matching Skills below (1 for Native/auto, 2–3 distinct families for explore/research) and load their full 5-section playbook on demand via `read_experiment_method` with `url: "builtin://<id>"`. Cite used Skills in `route.sources` with `kind: "builtin-skill"` and `referenceId: "<id>"`.',
    ...lines,
  ].join('\n');
}
