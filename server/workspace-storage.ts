import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const dataDir = path.resolve(process.env.SOP_DATA_DIR || path.join(process.cwd(), 'data'));
export const accountWorkspacesEnabled = process.env.SOP_REQUIRE_AUTH === 'true';
const accountsDir = path.join(dataDir, 'accounts');
const account = new AsyncLocalStorage<string>();

export function isWorkspaceAccountId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
}

export function withWorkspaceAccount<T>(id: string, run: () => T): T {
  if (!isWorkspaceAccountId(id)) throw new Error('工作空间账号无效。');
  return account.run(id, run);
}

export function workspaceAccountId() { return account.getStore(); }

export function workspacePath(...parts: string[]) {
  const id = workspaceAccountId();
  if (accountWorkspacesEnabled && !id) throw new Error('缺少已验证的工作空间账号。');
  return path.join(id ? path.join(accountsDir, id) : dataDir, ...parts);
}

export function workspaceDirectory(...parts: string[]) {
  const directory = workspacePath(...parts);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export const workspaceUploadDir = () => workspaceDirectory('uploads');
export function workspaceUploadPath(filename: string) {
  if (!/^[\w.-]+$/.test(filename) || filename === '.' || filename === '..') throw new Error('素材文件名无效。');
  return path.join(workspaceUploadDir(), filename);
}

export function workspaceResource<T>(load: () => T) {
  const resources = new Map<string, T>();
  return () => {
    const root = workspacePath();
    if (!resources.has(root)) resources.set(root, load());
    return resources.get(root)!;
  };
}

export function workspaceAccounts() {
  if (!fs.existsSync(accountsDir)) return [];
  return fs.readdirSync(accountsDir, { withFileTypes: true }).filter(entry => entry.isDirectory() && isWorkspaceAccountId(entry.name)).map(entry => entry.name);
}

export function createWorkspaceCapabilities() {
  const capabilities = new Map<string, { token: string; accountId?: string }>();
  return {
    issue(id: string) {
      const accountId = workspaceAccountId();
      const existing = capabilities.get(id);
      if (existing && existing.accountId === accountId) return existing.token;
      const token = randomUUID();
      capabilities.set(id, { token, accountId });
      return token;
    },
    verify(id: string, token: string | undefined) {
      const capability = capabilities.get(id);
      return capability && capability.token === token ? capability : undefined;
    },
  };
}
