import { createClient, type Session, type User } from '@supabase/supabase-js';
import { pick } from './i18n';
import { AUTH_TEXT } from './landing-i18n';

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
  return String(metadata.display_name || metadata.full_name || metadata.name || metadata.nickname || user.email || pick(AUTH_TEXT).defaultUser).trim();
}

export function authEmail(user: User | null) {
  return user?.email || '';
}

export type AuthAvailability = { email: boolean | null; signup: boolean | null };
export const unknownAuthAvailability: AuthAvailability = { email: null, signup: null };
export async function loadAuthAvailability(): Promise<AuthAvailability> {
  if (!supabaseConfigured) return { email: false, signup: false };
  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: publishableKey }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('登录服务暂时无法连接，请稍后重试。');
  const settings = await response.json();
  return { email: settings.external?.email === true, signup: settings.disable_signup !== true };
}

export const AUTH_REQUEST_TIMEOUT_MS = 15000;
export class AuthTimeoutError extends Error {
  code = 'auth_timeout';
  constructor() { super('auth request timeout'); this.name = 'AuthTimeoutError'; }
}
/** Rejects with AuthTimeoutError if the auth request does not settle in time, so the UI never spins forever. */
export function withAuthTimeout<T>(request: Promise<T>, ms = AUTH_REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AuthTimeoutError()), ms); });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

export function authErrorMessage(error: unknown) {
  const m = pick(AUTH_TEXT).errors;
  const value = error as { code?: string; message?: string; status?: number; name?: string };
  const text = value?.message || (typeof error === 'string' ? error : '');
  if (value?.code === 'auth_timeout' || value?.name === 'AuthRetryableFetchError' || error instanceof TypeError || (typeof value?.status === 'number' && (value.status === 0 || value.status >= 500))) return m.network;
  if (value?.status === 429 || /over_.*rate_limit|rate_limit/.test(value?.code || '') || /too many|rate limit|after \d+ seconds/i.test(text)) return m.rate;
  if (value?.code === 'otp_expired' || /token.*expired|token.*invalid|otp.*expired/i.test(text)) return m.otp;
  if (value?.code === 'email_address_invalid' || /invalid.*email/i.test(text)) return m.email;
  if (/signups?.*not allowed|signup.*disabled/i.test(text)) return m.signup;
  if (/sending.*email|smtp|email.*send/i.test(text)) return m.smtp;
  if (/pkce|code verifier|flow state/i.test(text)) return m.pkce;
  if (/access_denied|denied|cancel/i.test(text)) return m.denied;
  if (/fetch|network|timeout|abort/i.test(text)) return m.network;
  return m.generic;
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
export function authLoginMethod(user: User | null) {
  const providers = user?.identities?.map(identity => identity.provider) || [];
  if (providers.includes('google')) return 'Google';
  if (user?.email) return pick(AUTH_TEXT).methods.email;
  return pick(AUTH_TEXT).methods.account;
}
