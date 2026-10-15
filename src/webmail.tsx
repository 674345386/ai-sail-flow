import type { Lang } from './i18n';

/* Webmail shortcut for the email-code step: detect the provider from the address domain.
   Unknown domains return null (the button is hidden). URLs open the provider's inbox in a new tab. */
export type Webmail = { id: string; name: Record<Lang, string>; url: string; color: string; mark: string };

const P = (id: string, en: string, zh: string, url: string, color: string, mark: string, domains: string[]) => ({ id, name: { en, 'zh-CN': zh }, url, color, mark, domains });
const PROVIDERS = [
  P('gmail', 'Gmail', 'Gmail', 'https://mail.google.com/mail/u/0/#search/in%3Aanywhere+newer_than%3A1h', '#ea4335', 'G', ['gmail.com', 'googlemail.com']),
  P('outlook', 'Outlook', 'Outlook', 'https://outlook.live.com/mail/', '#0a64d8', 'O', ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.cn', 'hotmail.co.uk', 'live.cn']),
  P('yahoo', 'Yahoo Mail', 'Yahoo 邮箱', 'https://mail.yahoo.com/', '#6001d2', 'Y', ['yahoo.com', 'ymail.com', 'yahoo.co.uk', 'yahoo.co.jp']),
  P('icloud', 'iCloud Mail', 'iCloud 邮件', 'https://www.icloud.com/mail', '#3a8ef6', '', ['icloud.com', 'me.com', 'mac.com']),
  P('proton', 'Proton Mail', 'Proton Mail', 'https://mail.proton.me/', '#6d4aff', 'P', ['proton.me', 'protonmail.com', 'pm.me']),
  P('qq', 'QQ Mail', 'QQ 邮箱', 'https://mail.qq.com/', '#1e9fff', 'QQ', ['qq.com', 'foxmail.com', 'vip.qq.com']),
  P('163', '163 Mail', '163 邮箱', 'https://mail.163.com/', '#d0021b', '163', ['163.com', 'vip.163.com']),
  P('126', '126 Mail', '126 邮箱', 'https://mail.126.com/', '#2f8f3a', '126', ['126.com', 'vip.126.com']),
  P('yeah', 'Yeah.net Mail', 'Yeah 邮箱', 'https://mail.yeah.net/', '#1f7bd8', 'Y', ['yeah.net']),
  P('sina', 'Sina Mail', '新浪邮箱', 'https://mail.sina.com.cn/', '#e6162d', 'S', ['sina.com', 'sina.cn', 'vip.sina.com']),
  P('sohu', 'Sohu Mail', '搜狐邮箱', 'https://mail.sohu.com/', '#f5a623', 'S', ['sohu.com']),
  P('aliyun', 'Aliyun Mail', '阿里邮箱', 'https://mail.aliyun.com/', '#ff6a00', 'A', ['aliyun.com']),
  P('139', '139 Mail', '139 邮箱', 'https://mail.10086.cn/', '#0081cc', '139', ['139.com']),
];

export function detectWebmail(email: string): Webmail | null {
  const domain = email.trim().toLowerCase().split('@')[1]?.replace(/\.$/, '');
  if (!domain) return null;
  return PROVIDERS.find(p => p.domains.includes(domain)) ?? null;
}

/** Small provider mark: Gmail/Outlook/iCloud get simple drawn glyphs, others a brand-tinted tile with their short name. */
export function WebmailIcon({ provider }: { provider: Webmail }) {
  if (provider.id === 'gmail') return <svg className="webmail-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285f4" d="M3 6.5v11A1.5 1.5 0 0 0 4.5 19H7v-8.2l-4-3z" /><path fill="#34a853" d="M17 19h2.5a1.5 1.5 0 0 0 1.5-1.5v-11l-4 3.3z" />
    <path fill="#fbbc04" d="M17 5.6v4.2l4-3.3V6a1.6 1.6 0 0 0-2.6-1.3z" /><path fill="#ea4335" d="M7 10.8V6.6l5 3.8 5-3.8v3.2l-5 3.8z" />
    <path fill="#c5221f" d="M3 6v.5l4 3.3V5.6L5.6 4.7A1.6 1.6 0 0 0 3 6z" />
  </svg>;
  if (provider.id === 'outlook') return <svg className="webmail-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="9" y="5" width="12" height="14" rx="2" fill="#28a8ea" /><path d="M9 11l6 4 6-4v6a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" fill="#0364b8" />
    <rect x="3" y="7" width="10" height="10" rx="2" fill="#0a64d8" /><circle cx="8" cy="12" r="2.6" fill="none" stroke="#fff" strokeWidth="1.6" />
  </svg>;
  if (provider.id === 'icloud') return <svg className="webmail-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" fill="#3a8ef6" /><path d="M8.2 16.5a3 3 0 0 1-.3-6 4.3 4.3 0 0 1 8.2.9 2.6 2.6 0 0 1 .1 5.1z" fill="#fff" />
  </svg>;
  return <span className="webmail-icon webmail-mark" style={{ background: provider.color }} aria-hidden="true">{provider.mark}</span>;
}
