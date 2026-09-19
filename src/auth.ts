import { createClient, type Session, type User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || '';

export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);
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
  return String(metadata.display_name || metadata.full_name || metadata.name || user.email?.split('@')[0] || 'AI-Sail 用户').trim();
}

export function authEmail(user: User | null) {
  return user?.email || '';
}
