import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import type { Asset } from '../shared/domain';
import type { LibraryMedia } from '../shared/media-library';
import { dataDir, uploadDir, getProject, listProjects } from './store';

const catalogFile = path.join(dataDir, 'media-library.json');
const media = new Map<string, LibraryMedia>();
if (fs.existsSync(catalogFile)) {
  const records: LibraryMedia[] = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  for (const record of records) if (/^[a-f0-9]{64}$/.test(record.id) && record.filename && path.basename(record.filename) === record.filename) media.set(record.id, record);
}
function persist() {
  const temporary = `${catalogFile}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify([...media.values()]), { mode: 0o600 });
  fs.renameSync(temporary, catalogFile);
}
async function fileHash(filename: string) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join(uploadDir, filename))) hash.update(chunk);
  return hash.digest('hex');
}
export async function collectUploadedAsset(asset: Asset, createdAt = new Date().toISOString()) {
  const id = await fileHash(asset.filename);
  const existing = media.get(id);
  if (existing && fs.existsSync(path.join(uploadDir, existing.filename!))) return existing;
  const item: LibraryMedia = { ...asset, id, kind: asset.kind === 'video' ? 'video' : 'image', createdAt };
  media.set(id, item); persist();
  return item;
}
export function listLibraryMedia() {
  return [...media.values()].filter(item => fs.existsSync(path.join(uploadDir, item.filename!))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getLibraryMedia(id: string) { return listLibraryMedia().find(item => item.id === id); }
export function libraryMime(filename: string) { return [...media.values()].find(item => item.filename === filename)?.mime; }

// Recover existing uploads, including files retained after removal from a creative.
export async function initializeMediaLibrary() {
  const known = new Set([...media.values()].map(item => item.filename));
  for (const summary of listProjects()) {
    const project = getProject(summary.id)!;
    if (project.isDemo) continue;
    for (const asset of project.assets) {
      if (known.has(asset.filename) || !fs.existsSync(path.join(uploadDir, asset.filename))) continue;
      await collectUploadedAsset(asset, fs.statSync(path.join(uploadDir, asset.filename)).birthtime.toISOString()); known.add(asset.filename);
    }
  }
  for (const filename of fs.readdirSync(uploadDir)) {
    if (known.has(filename) || !/^[a-f0-9]{32}$/.test(filename)) continue;
    const absolute = path.join(uploadDir, filename);
    const type = await fileTypeFromFile(absolute).catch(() => undefined);
    if (!type || !['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'].includes(type.mime)) continue;
    const info = fs.statSync(absolute), video = type.mime.startsWith('video/');
    await collectUploadedAsset({ id: randomUUID(), kind: video ? 'video' : 'product', filename,
      name: `历史上传-${filename.slice(0, 8)}.${type.ext}`, mime: type.mime, size: info.size, url: `/media/${filename}`,
      ...(video && fs.existsSync(`${absolute}.jpg`) ? { thumbnail: `/media/${filename}.jpg` } : {}) }, info.birthtime.toISOString());
  }
}
