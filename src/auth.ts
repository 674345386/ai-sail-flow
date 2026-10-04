import { createClient, type Session, type User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);
export const publicAuthRequired = import.meta.env.VITE_REQUIRE_AUTH === 'true';
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;

export async function syncPublicServerSession(accessToken: string | null) {
  if (!publicAuthRequired) return;
  const response = await fetch('/api/auth/session', {
    method: accessToken ? 'POST' : 'DELETE',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '登录状态同步失败，请重新登录。');
  }
}

export type SailAuthState = {
  initialized: boolean;
  busy: boolean;
  status: string;
  error: string;
  session: Session | null;
  user: User | null;
};

export const initialAuthState: SailAuthState = {
  initialized: false,
  busy: false,
  status: '',
  error: '',
  session: null,
  user: null,
};

export function authDisplayName(user: User | null) {
  if (!user) return '';
  const metadata = user.user_metadata || {};
  return String(metadata.display_name || metadata.full_name || metadata.name || metadata.nickname || user.email || 'AI-Sail 用户').trim();
}

export function authEmail(user: User | null) {
  return user?.email || '';
}

export type AuthAvailability = { email: boolean | null; google: boolean | null; signup: boolean | null };
export const unknownAuthAvailability: AuthAvailability = { email: null, google: null, signup: null };
export async function loadAuthAvailability(): Promise<AuthAvailability> {
  if (!supabaseConfigured) return { email: false, google: false, signup: false };
  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('登录服务暂时无法连接，请稍后重试。');
  const settings = await response.json();
  return { email: settings.external?.email === true, google: settings.external?.google === true, signup: settings.disable_signup !== true };
}

export function authErrorMessage(error: unknown) {
  const value = error as { code?: string; message?: string; status?: number };
  const text = value?.message || (typeof error === 'string' ? error : '');
  if (value?.status === 429 || /over_.*rate_limit|rate_limit/.test(value?.code || '') || /too many|rate limit|after \d+ seconds/i.test(text)) return '请求太频繁，请稍后再试。';
  if (value?.code === 'otp_expired' || /token.*expired|token.*invalid|otp.*expired/i.test(text)) return '验证码已失效或不正确，请检查验证码，或重新发送。';
  if (value?.code === 'email_address_invalid' || /invalid.*email/i.test(text)) return '请填写有效的邮箱地址。';
  if (/signups?.*not allowed|signup.*disabled/i.test(text)) return '当前暂不开放新账号注册，请使用已有账号登录。';
  if (/provider.*not enabled|unsupported provider/i.test(text)) return 'Google 登录暂未开通，请使用邮箱验证码登录。';
  if (/sending.*email|smtp|email.*send/i.test(text)) return '验证码邮件暂时无法发送，请稍后重试。';
  if (/pkce|code verifier|flow state/i.test(text)) return '登录授权已失效，请在当前浏览器重新开始登录。';
  if (/access_denied|denied|cancel/i.test(text)) return '已取消 Google 授权，你可以重新登录或使用邮箱验证码。';
  if (/fetch|network|timeout|abort/i.test(text)) return '网络连接暂时失败，请稍后重试。';
  return '登录未完成，请重试。';
}

export function validEmail(email: string) { return email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }
export function validEmailCode(code: string) { return /^\d{6,10}$/.test(code); }
export function authRedirectUrl() {
  const configured = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  return configured || `${window.location.origin}/auth/callback`;
}
export function readAuthCallback() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const error = url.searchParams.get('error_description') || hash.get('error_description') || url.searchParams.get('error') || hash.get('error') || '';
  return { active: url.pathname === '/auth/callback' || !!error || url.searchParams.has('code') || hash.has('access_token'), error };
}
export function clearAuthCallback() {
  const url = new URL(window.location.href);
  ['code', 'error', 'error_code', 'error_description'].forEach(key => url.searchParams.delete(key));
  if (url.pathname === '/auth/callback') url.pathname = '/';
  const hash = new URLSearchParams(url.hash.slice(1));
  if (['access_token', 'refresh_token', 'error', 'error_description'].some(key => hash.has(key))) url.hash = '';
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
export async function startGoogleSignIn() {
  if (!supabase) throw new Error('尚未配置登录服务。');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google',
    options: { redirectTo: authRedirectUrl(), skipBrowserRedirect: true } });
  if (error) throw error;
  if (!data.url) throw new Error('Google 登录地址暂时无法获取。');
  return data.url;
}

export function authLoginMethod(user: User | null) {
  const providers = user?.identities?.map(identity => identity.provider) || [];
  if (providers.includes('google')) return 'Google';
  if (user?.email) return '邮箱';
  return '账号';
}
