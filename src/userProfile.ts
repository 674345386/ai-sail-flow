import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './auth';

const bucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET?.trim() || 'ai-sail-flow-files';
export const defaultAvatars = [
  '晴空蓝', '雾灰蓝', '海盐蓝', '岩石蓝', '青瓷', '薄荷',
  '新芽', '鼠尾草', '柠檬', '蜜桃', '奶茶', '玫瑰', '樱花', '薰衣草',
].map((name, index) => ({ id: `palette-${index + 1}`, name, url: `/assets/avatars/palette-${index + 1}.svg` }));

export function needsProfileSetup(user: User | null) {
  return !!user && !user.user_metadata?.profile_completed_at;
}

function savedAvatarUrl(user: User | null) {
  const url = user?.user_metadata?.avatar_url;
  return typeof url === 'string' && (defaultAvatars.some(avatar => avatar.url === url) || /^https:\/\//.test(url)) ? url : defaultAvatars[0].url;
}

export function useProfileAvatar(user: User | null) {
  const fallback = savedAvatarUrl(user);
  const path = user?.user_metadata?.avatar_path;
  const ownedPath = user && typeof path === 'string' && path.startsWith(`${user.id}/profile/`) ? path : '';
  const [signed, setSigned] = useState({ path: '', url: '' });
  useEffect(() => {
    if (!ownedPath || !supabase) return;
    let alive = true;
    const refresh = async () => {
      const { data, error } = await supabase!.storage.from(bucket).createSignedUrl(ownedPath, 3600);
      if (alive) setSigned({ path: ownedPath, url: !error && data?.signedUrl ? data.signedUrl : '' });
    };
    void refresh().catch(() => {});
    const timer = window.setInterval(() => { void refresh().catch(() => {}); }, 50 * 60 * 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [ownedPath]);
  return ownedPath && signed.path === ownedPath && signed.url ? signed.url : fallback;
}

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (file.size > 5 * 1024 * 1024) throw new Error('头像图片请小于 5 MB。');
  const image = await createImageBitmap(file).catch(() => { throw new Error('这张图片无法读取，请选择另一张图片。'); });
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('头像处理失败，请重试。');
    const size = Math.min(image.width, image.height);
    context.fillStyle = '#f6f1e9'; context.fillRect(0, 0, 256, 256);
    context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 256, 256);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('头像处理失败，请重试。')), 'image/jpeg', .88));
  } finally { image.close(); }
}

export type AvatarChoice = { kind: 'preset'; url: string } | { kind: 'upload'; blob: Blob } | { kind: 'existing' };
export async function saveUserProfile(user: User, displayName: string, avatar: AvatarChoice) {
  if (!supabase) throw new Error('登录服务尚未连接。');
  const name = displayName.trim();
  if (!name || name.length > 254) throw new Error('请输入名称，最多 254 个字符。');
  if (avatar.kind === 'preset' && !defaultAvatars.some(item => item.url === avatar.url)) throw new Error('请选择一个默认头像。');
  let uploadedPath = '';
  try {
    const { data: session } = await supabase.auth.getSession();
    if (session.session?.user.id !== user.id) throw new Error('登录状态已变化，请重新登录。');
    if (avatar.kind === 'upload') {
      uploadedPath = `${user.id}/profile/avatar-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(bucket).upload(uploadedPath, avatar.blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error('头像上传失败，请稍后重试或选择默认头像。');
    }
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user.id !== user.id) throw new Error('登录状态已变化，请重新登录。');
    const { data, error } = await supabase.auth.updateUser({ data: {
      display_name: name,
      profile_completed_at: user.user_metadata.profile_completed_at || new Date().toISOString(),
      ...(avatar.kind === 'preset' ? { avatar_url: avatar.url, avatar_path: null } : {}),
      ...(avatar.kind === 'upload' ? { avatar_url: null, avatar_path: uploadedPath } : {}),
    } });
    if (error || !data.user) throw new Error('个人资料保存失败，请稍后重试。');
    const oldPath = user.user_metadata.avatar_path;
    if (avatar.kind !== 'existing' && typeof oldPath === 'string' && oldPath.startsWith(`${user.id}/profile/`) && oldPath !== uploadedPath) {
      void supabase.storage.from(bucket).remove([oldPath]).catch(() => {});
    }
    return data.user;
  } catch (error) {
    if (uploadedPath) await supabase.storage.from(bucket).remove([uploadedPath]).catch(() => {});
    throw error;
  }
}
