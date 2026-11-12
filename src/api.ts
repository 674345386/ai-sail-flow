import { publicAuthRequired, supabase } from './auth';

export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  else if (publicAuthRequired && url !== '/api/status') throw new Error('请先登录后再使用工作台。');
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  const data = await response.json().catch(() => ({ error: '服务暂时不可用，请检查本地服务是否正在运行。' }));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data as T;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function apiBlob(url: string): Promise<Blob> {
  const headers = new Headers();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  else if (publicAuthRequired) throw new Error('请先登录后下载交付包。');
  const response = await fetch(url, { headers, credentials: 'same-origin' });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || '交付包下载失败，请重试。'); }
  return response.blob();
}
