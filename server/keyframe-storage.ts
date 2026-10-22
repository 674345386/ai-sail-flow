import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import type { Project } from '../shared/domain';
import { keyframeCurrent, type RewriteShot } from '../shared/storyboard';
import { uploadDir } from './store';

let session: { url: string; key: string; bucket: string } | undefined;
const signedImages = new Map<string, { url: string; expiresAt: number }>();
const readyBuckets = new Set<string>();
function connection() {
  return session || { url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SOP_KEYFRAME_BUCKET || 'sop-keyframes' };
}
export function keyframeStorageStatus() {
  const config = connection();
  return { configured: !!config.url && !!config.key, url: config.url, bucket: config.bucket };
}
export function configureKeyframeStorage(url: string, key: string, bucket: string) {
  session = { url, key, bucket };
  signedImages.clear(); readyBuckets.clear();
}

// Private objects use expiring URLs so the video provider can fetch only the selected frame.
export async function publishKeyframe(project: Project, shot: RewriteShot) {
  if (!keyframeCurrent(project, shot) || !shot.keyframe?.filename || !shot.keyframe.mime || !/^recreation-[a-f\d-]+\.(png|jpg|webp)$/.test(shot.keyframe.filename)) {
    throw new Error('请先生成当前镜头的有效复刻关键帧。');
  }
  return publishReferenceImage(project.id, shot.keyframe.filename, shot.keyframe.mime, true);
}

export async function publishReferenceImage(projectId: string, filename: string, mime: string, privateOnly = false) {
  if (!/^(?:recreation|remix-character|tier-frame)-[a-f\d-]+\.(png|jpg|webp)$/.test(filename)) throw new Error('参考图文件无效。');
  const config = connection();
  if (!config.url || !config.key) throw new Error('请在模型连接设置中连接 Supabase 私有图片存储，再生成镜头视频。');
  const cacheKey = `${config.url}:${config.bucket}:${privateOnly}:${projectId}:${filename}`;
  const cached = signedImages.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30 * 60_000) return cached.url;
  const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucketKey = `${config.url}:${config.bucket}:${privateOnly}`;
  if (!readyBuckets.has(bucketKey)) {
    const { data, error } = await client.storage.getBucket(config.bucket);
    if (error) {
      const { error: creationError } = await client.storage.createBucket(config.bucket, {
        public: false, fileSizeLimit: 20 * 1024 * 1024, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });
      if (creationError) {
        const existing = await client.storage.getBucket(config.bucket);
        if (existing.error || !existing.data) throw new Error('Supabase 私有桶连接失败，请检查服务端密钥、桶名称与存储权限。');
        if (privateOnly && existing.data.public) throw new Error('关键帧存储桶必须设为私有，请在 Supabase 中关闭该桶的公开访问。');
      }
    } else if (privateOnly && data.public) throw new Error('关键帧存储桶必须设为私有，请在 Supabase 中关闭该桶的公开访问。');
    readyBuckets.add(bucketKey);
  }
  const objectPath = `${projectId}/${filename}`;
  const buffer = await readFile(path.join(uploadDir, filename));
  const { error: uploadError } = await client.storage.from(config.bucket).upload(objectPath, buffer, {
    contentType: mime, upsert: true,
  });
  if (uploadError) throw new Error('复刻关键帧上传失败，请检查 Supabase 私有存储连接与权限。');
  const lifetimeSeconds = 6 * 60 * 60;
  const { data, error } = await client.storage.from(config.bucket).createSignedUrl(objectPath, lifetimeSeconds);
  if (error || !data.signedUrl) throw new Error('复刻关键帧临时链接生成失败，请检查 Supabase 存储权限。');
  signedImages.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + lifetimeSeconds * 1000 });
  return data.signedUrl;
}
