import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import type { DeliveryFile, SkillEnvironment } from '../shared/skill-assets';
import { ExperimentError } from '../shared/experiment';
import { experimentWorkspace } from './experiment-runtime';

const execute = promisify(execFile);
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const dependencyFile = /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements[^/]*\.txt|pyproject\.toml|uv\.lock|poetry\.lock|Dockerfile|compose\.ya?ml|environment\.ya?ml|\.python-version|\.node-version)$/;
const sourceFile = /\.(?:tsx?|jsx?|mjs|cjs|css|html|json|md|txt|srt|vtt|py|sh|ya?ml|toml|lock)$/i;
const excluded = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', '.cache']);

/** Only deliver source and explicit environment files. Credentials and symlinks never enter a package. */
function workspaceDirectory(projectId: string, relative = '') {
  const workspace = experimentWorkspace(projectId), root = path.resolve(workspace, relative);
  if (path.isAbsolute(relative) || path.relative(workspace, root).startsWith('..')) throw new ExperimentError('只能读取当前创意工作目录内的环境。');
  if (fs.existsSync(root)) {
    const realWorkspace = fs.realpathSync(workspace), realRoot = fs.realpathSync(root);
    if (path.relative(realWorkspace, realRoot).startsWith('..')) throw new ExperimentError('环境目录不能链接到创意之外。');
  }
  return root;
}
export function collectSkillSourceFiles(projectId: string, relative = ''): DeliveryFile[] {
  const root = workspaceDirectory(projectId, relative), files: DeliveryFile[] = [];
  if (!fs.existsSync(root)) return files;
  let total = 0;
  const visit = (directory: string, depth: number) => {
    if (depth > 8) throw new ExperimentError('源文件目录过深，请整理后发布。');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name) || (entry.name.startsWith('.') && !['.python-version', '.node-version'].includes(entry.name))) continue;
      const absolute = path.join(directory, entry.name), relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isDirectory()) { visit(absolute, depth + 1); continue; }
      if (!entry.isFile() || (!sourceFile.test(entry.name) && !dependencyFile.test(relative))) continue;
      const size = fs.statSync(absolute).size;
      if (size > 1_000_000 || total + size > 8_000_000 || files.length >= 100) throw new ExperimentError('交付源文件超过限制（100 个文件、合计 8 MB、单文件 1 MB），请整理工程后发布。');
      const content = fs.readFileSync(absolute, 'utf8'); total += size;
      files.push({ path: relative, sha256: sha256(content), content });
    }
  };
  visit(root, 0);
  return files;
}

export async function captureSkillEnvironment(projectId: string, model?: string, relative = ''): Promise<SkillEnvironment> {
  const root = workspaceDirectory(projectId, relative);
  const sourceFiles = collectSkillSourceFiles(projectId, relative);
  const files = sourceFiles.filter(file => dependencyFile.test(file.path));
  const entries: SkillEnvironment['entries'] = [{ kind: 'runtime', name: 'Node.js', version: process.version, pin: 'exact' }];
  const unresolved: string[] = [];
  const pythonNeeded = sourceFiles.some(file => /\.py$|requirements|pyproject|uv\.lock|poetry\.lock/.test(file.path));
  const venvPython = path.join(root, '.venv', 'bin', 'python');
  const python = fs.existsSync(venvPython) ? venvPython : 'python3';
  const probes = [
    { name: 'git', kind: 'tool' as const, command: 'git', args: ['--version'] },
    ...(ffmpeg ? [{ name: 'FFmpeg', kind: 'tool' as const, command: ffmpeg, args: ['-version'] }] : []),
    ...(pythonNeeded ? [{ name: 'Python', kind: 'runtime' as const, command: python, args: ['--version'] }, { name: 'Python packages', kind: 'dependency' as const, command: python, args: ['-m', 'pip', 'freeze', '--disable-pip-version-check'] }] : []),
  ];
  const results = await Promise.allSettled(probes.map(probe => execute(probe.command, probe.args, { timeout: 6000, maxBuffer: 300_000 })));
  results.forEach((result, index) => {
    const probe = probes[index];
    if (result.status === 'rejected') { if (probe.name === 'Python' || probe.name === 'Python packages') unresolved.push(`未能记录 ${probe.name}，请在工程环境中安装并固定依赖。`); return; }
    const output = result.value.stdout.trim();
    if (probe.name === 'Python packages') {
      for (const line of output.split('\n').filter(Boolean)) {
        const match = /^([\w.-]+)==([^\s]+)$/.exec(line);
        if (match) entries.push({ kind: 'dependency', name: match[1], version: match[2], pin: 'exact' });
        else unresolved.push(`Python 依赖尚未固定版本：${line.slice(0, 300)}`);
      }
    } else entries.push({ kind: probe.kind, name: probe.name, version: output.split('\n')[0].slice(0, 200), pin: 'exact' });
  });
  for (const file of files.filter(file => /package-lock\.json$/.test(file.path))) {
    try {
      const lock = JSON.parse(file.content);
      for (const [location, item] of Object.entries(lock.packages || {}) as [string, { version?: string; resolved?: string }][]) {
        if (location && item.version) entries.push({ kind: 'dependency', name: location.replace(/^.*node_modules\//, ''), version: item.version, pin: 'exact', ...(item.resolved ? { source: item.resolved } : {}) });
      }
    } catch { unresolved.push(`${file.path} 无法解析。`); }
  }
  if (sourceFiles.some(file => /(^|\/)package\.json$/.test(file.path)) && !files.some(file => /(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file.path))) unresolved.push('JavaScript 工程缺少依赖锁文件。');
  if (model) entries.push({ kind: 'model', name: model, version: model, pin: /\d{4}-\d{2}-\d{2}/.test(model) ? 'exact' : 'unversioned', source: '创作 Agent 实际选择的模型；远程别名可能由提供商更新。' });
  const unique = [...new Map(entries.map(entry => [`${entry.kind}:${entry.name}:${entry.version}`, entry])).values()];
  if (unique.length > 1000) throw new ExperimentError('环境依赖超过 1000 项，请使用精简的工程环境。');
  return { capturedAt: new Date().toISOString(), platform: process.platform, architecture: process.arch, workingDirectory: relative || '.', entries: unique, files,
    setup: sourceFiles.find(file => /(?:^|\/)(?:README\.md|setup\.sh|install\.sh)$/.test(file.path))?.content.slice(0, 12000) || '',
    requirements: [], unresolved };
}

export function restoreSkillFiles(projectId: string, assetId: string, releaseId: string, files: DeliveryFile[]) {
  const relativeRoot = `skill-assets/${assetId}/${releaseId}`, root = path.join(experimentWorkspace(projectId), relativeRoot);
  // Destination is a new per-release directory; never follow an existing symlink or overwrite creative code.
  let cursor = experimentWorkspace(projectId);
  fs.mkdirSync(cursor, { recursive: true, mode: 0o700 });
  for (const part of ['skill-assets', assetId, releaseId]) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && (!fs.lstatSync(cursor).isDirectory() || fs.lstatSync(cursor).isSymbolicLink())) throw new ExperimentError('交付目录不是普通目录，请更换创意后重试。');
    fs.mkdirSync(cursor, { recursive: true, mode: 0o700 });
  }
  for (const file of files) {
    if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).some(part => !part || part === '..' || part.startsWith('.') && !['.python-version', '.node-version'].includes(part)) || sha256(file.content) !== file.sha256) throw new ExperimentError('交付文件路径或校验值无效。');
    const destination = path.join(root, file.path);
    let directory = root;
    for (const part of file.path.split('/').slice(0, -1)) {
      directory = path.join(directory, part);
      if (fs.existsSync(directory) && (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink())) throw new ExperimentError('交付路径包含符号链接。');
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    if (fs.existsSync(destination)) {
      if (!fs.lstatSync(destination).isFile() || fs.lstatSync(destination).isSymbolicLink() || sha256(fs.readFileSync(destination)) !== file.sha256) throw new ExperimentError('已有交付副本被修改，请在新的创意中采用这个固定版本。');
    } else fs.writeFileSync(destination, file.content, { flag: 'wx', mode: 0o600 });
  }
  return relativeRoot;
}
