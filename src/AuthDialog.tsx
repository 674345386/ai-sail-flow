import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, LoaderCircle, LogOut, Pencil, X } from 'lucide-react';
import { authDisplayName, authEmail, authLoginMethod, supabaseConfigured, validEmailCode, type AuthAvailability, type SailAuthState } from './auth';
import './auth-module.css';
import { useDict, useLang } from './i18n';
import { detectWebmail, WebmailIcon } from './webmail';
import { AUTH_TEXT } from './landing-i18n';

export default function AuthDialog({ open, onClose, auth, availability, email, code, stage, resendSeconds, onEmailChange, onCodeChange, onSendCode, onVerifyCode, onBack, onSignOut, onEditProfile, avatarUrl }: {
  open: boolean; onClose: () => void; auth: SailAuthState; availability: AuthAvailability;
  email: string; code: string; stage: 'email' | 'code'; resendSeconds: number;
  onEmailChange: (value: string) => void; onCodeChange: (value: string) => void;
  onSendCode: () => void; onVerifyCode: () => void; onBack: () => void; onSignOut: () => void; onEditProfile: () => void; avatarUrl: string;
}) {
  const t = useDict(AUTH_TEXT);
  const { lang } = useLang();
  const webmail = stage === 'code' ? detectWebmail(email) : null;
  // Code step: keep the caret in the code field (the webmail link is secondary).
  useEffect(() => { if (open && stage === 'code') window.setTimeout(() => document.querySelector<HTMLInputElement>('.auth-code-input')?.focus(), 0); }, [open, stage]);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const busy = useRef(auth.busy); busy.current = auth.busy;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || []];
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  const locked = auth.busy || !auth.initialized;
  const signedIn = !!auth.user;
  return createPortal(<div className="auth-screen sail-auth-dialog" onClick={event => { if (event.target === event.currentTarget && !auth.busy) onClose(); }}>
    <div className="auth-modal-card" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="auth-screen-title" aria-busy={locked}>
    <button type="button" className="auth-screen-close" aria-label={t.close} disabled={auth.busy} onClick={onClose}><X size={18} /></button>
    <div className="auth-screen-content">
      {signedIn ? <div className="auth-account-view">
        <h1 id="auth-screen-title">{t.account}</h1><div className="auth-account-icon"><img src={avatarUrl} alt={t.avatar} /></div>
        <strong>{authDisplayName(auth.user)}</strong><span>{authEmail(auth.user) || t.account}</span><span className="auth-method-label">{t.method(authLoginMethod(auth.user))}</span>
        <small>{t.kept}</small>
        {auth.error && <div className="auth-error" role="alert">{auth.error}</div>}
        <button type="button" className="btn" disabled={locked} onClick={onEditProfile}><Pencil size={15} />{t.editProfile}</button>
        <button type="button" className="btn" disabled={locked} onClick={onSignOut}>{auth.busy ? <LoaderCircle className="spin" size={15} /> : <LogOut size={15} />}{t.signOut}</button>
      </div> : <>
        <div className="auth-screen-intro"><div className="auth-screen-brand-mark"><img src="/assets/brand/logo/ai-sail-flow-logo-dark.svg" alt="AI-Sail Flow" width={38} height={38} /></div><h1 id="auth-screen-title">{stage === 'code' ? t.codeTitle : t.title}</h1><p>{stage === 'code' ? <>{t.sentTo}<strong>{email}</strong></> : t.intro}</p></div>
        <form className="auth-screen-form" onSubmit={event => { event.preventDefault(); if (stage === 'email') onSendCode(); else onVerifyCode(); }}>
          {!supabaseConfigured && <div className="auth-warning" role="alert">{t.notConnected}</div>}
          {stage === 'email' ? <>
            <label className="auth-input-label"><span>{t.emailLabel}</span><input className="input" type="email" autoComplete="email" maxLength={254} placeholder={t.emailPlaceholder} value={email} disabled={locked} onChange={event => onEmailChange(event.target.value)} required /></label>
            {availability.email === false && <div className="auth-warning" role="alert">{t.emailOff}</div>}
          </> : <>
            <label className="auth-input-label"><span>{t.codeLabel}</span><input className="input auth-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} placeholder={t.codePlaceholder} value={code} disabled={locked} onChange={event => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 10))} required /></label>
            <div className="auth-code-actions"><button type="button" className="auth-change-email" onClick={onBack} disabled={locked}>{t.changeEmail}</button><button type="button" className="auth-change-email" onClick={onSendCode} disabled={locked || resendSeconds > 0}>{resendSeconds ? t.resendIn(resendSeconds) : t.resend}</button></div>
            {webmail && <a className="auth-webmail-link" href={webmail.url} target="_blank" rel="noopener noreferrer"><WebmailIcon provider={webmail} /><span>{t.openMail(webmail.name[lang])}</span><ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only">{t.newTab}</span></a>}
            <p className="auth-delivery-hint">{t.spam}</p>
          </>}
          {auth.error && <div className="auth-error" role="alert">{auth.error}</div>}
          <button type="submit" className="auth-continue-button" disabled={locked || !supabaseConfigured || !email.trim() || availability.email === false || (stage === 'code' ? !validEmailCode(code) : resendSeconds > 0)}>{locked && <LoaderCircle size={17} className="spin" />}{stage === 'code' ? t.verify : resendSeconds ? t.sendIn(resendSeconds) : t.send}</button>
          {stage === 'email' && <p className="auth-legal">{t.noPassword}{availability.signup !== false && t.autoCreate}</p>}
        </form>
      </>}
    </div>
    </div>
  </div>, document.body);
}
