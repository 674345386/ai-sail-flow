import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, LogOut, Pencil, X } from 'lucide-react';
import { authDisplayName, authEmail, authLoginMethod, supabaseConfigured, validEmailCode, type AuthAvailability, type SailAuthState } from './auth';
import './auth-module.css';

export default function AuthDialog({ open, onClose, auth, availability, email, code, stage, resendSeconds, onEmailChange, onCodeChange, onSendCode, onVerifyCode, onGoogleSignIn, onBack, onSignOut, onEditProfile, avatarUrl }: {
  open: boolean; onClose: () => void; auth: SailAuthState; availability: AuthAvailability;
  email: string; code: string; stage: 'email' | 'code'; resendSeconds: number;
  onEmailChange: (value: string) => void; onCodeChange: (value: string) => void;
  onSendCode: () => void; onVerifyCode: () => void; onGoogleSignIn: () => void; onBack: () => void; onSignOut: () => void; onEditProfile: () => void; avatarUrl: string;
}) {
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
    <button type="button" className="auth-screen-close" aria-label="关闭账号窗口" disabled={auth.busy} onClick={onClose}><X size={18} /></button>
    <div className="auth-screen-content">
      {signedIn ? <div className="auth-account-view">
        <h1 id="auth-screen-title">我的账号</h1><div className="auth-account-icon"><img src={avatarUrl} alt="我的头像" /></div>
        <strong>{authDisplayName(auth.user)}</strong><span>{authEmail(auth.user) || '我的账号'}</span><span className="auth-method-label">{authLoginMethod(auth.user)}登录</span>
        <small>登录状态会在此浏览器中保留，你可以使用自己的私有云端素材。</small>
        {auth.error && <div className="auth-error" role="alert">{auth.error}</div>}
        <button type="button" className="btn" disabled={locked} onClick={onEditProfile}><Pencil size={15} />编辑个人资料</button>
        <button type="button" className="btn" disabled={locked} onClick={onSignOut}>{auth.busy ? <LoaderCircle className="spin" size={15} /> : <LogOut size={15} />}退出登录</button>
      </div> : <>
        <div className="auth-screen-intro"><div className="auth-screen-brand-mark"><img src="/assets/brand/logo/ai-sail-flow-logo-dark.svg" alt="AI-Sail Flow" width={38} height={38} /></div><h1 id="auth-screen-title">{stage === 'code' ? '输入邮箱验证码' : '登录 AI-Sail Flow'}</h1><p>{stage === 'code' ? <>验证码已发送至 <strong>{email}</strong></> : '使用邮箱验证码或 Google 账号，进入你的创意工作区。'}</p></div>
        <form className="auth-screen-form" onSubmit={event => { event.preventDefault(); if (stage === 'email') onSendCode(); else onVerifyCode(); }}>
          {!supabaseConfigured && <div className="auth-warning" role="alert">登录服务尚未连接，请联系管理员。</div>}
          {stage === 'email' ? <>
            <button type="button" className="auth-social-button auth-social-google" onClick={onGoogleSignIn} disabled={locked || !supabaseConfigured || availability.google === false}><GoogleMark /><span>使用 Google 账号登录</span>{availability.google === false && <small>暂未开通</small>}</button>
            <div className="auth-divider"><span>或使用邮箱验证码</span></div>
            <label className="auth-input-label"><span>邮箱地址</span><input className="input" type="email" autoComplete="email" maxLength={254} placeholder="输入邮箱地址" value={email} disabled={locked} onChange={event => onEmailChange(event.target.value)} required /></label>
            {availability.email === false && <div className="auth-warning" role="alert">邮箱登录暂未开通，请稍后再试。</div>}
          </> : <>
            <label className="auth-input-label"><span>邮箱中的数字验证码</span><input className="input auth-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} placeholder="输入验证码" value={code} disabled={locked} onChange={event => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 10))} required /></label>
            <div className="auth-code-actions"><button type="button" className="auth-change-email" onClick={onBack} disabled={locked}>更换邮箱</button><button type="button" className="auth-change-email" onClick={onSendCode} disabled={locked || resendSeconds > 0}>{resendSeconds ? `${resendSeconds} 秒后重新发送` : '重新发送验证码'}</button></div>
            <p className="auth-delivery-hint">没有收到邮件时，可以检查垃圾邮件文件夹。</p>
          </>}
          {auth.error && <div className="auth-error" role="alert">{auth.error}</div>}
          <button type="submit" className="auth-continue-button" disabled={locked || !supabaseConfigured || !email.trim() || availability.email === false || (stage === 'code' ? !validEmailCode(code) : resendSeconds > 0)}>{locked && <LoaderCircle size={17} className="spin" />}{stage === 'code' ? '验证并登录' : resendSeconds ? `${resendSeconds} 秒后可再次发送` : '发送邮箱验证码'}</button>
          {stage === 'email' && <p className="auth-legal">无需设置密码。{availability.signup !== false && '首次验证成功后会自动创建账号。'}</p>}
        </form>
      </>}
    </div>
    </div>
  </div>, document.body);
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.31 2.98-7.36Z" /><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.05v2.6A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84v-2.6H3.05a10 10 0 0 0 0 9.04l3.35-2.6Z" /><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.6C7.19 7.72 9.4 5.96 12 5.96Z" /></svg>;
}
