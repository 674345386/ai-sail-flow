import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, LogOut, Pencil, X } from 'lucide-react';
import { authDisplayName, authEmail, authLoginMethod, supabaseConfigured, validEmailCode, type AuthAvailability, type SailAuthState } from './auth';
import './auth-module.css';

export default function AuthDialog({ open, onClose, auth, availability, email, code, stage, resendSeconds, onEmailChange, onCodeChange, onSendCode, onVerifyCode, onBack, onSignOut, onEditProfile, avatarUrl }: {
  open: boolean; onClose: () => void; auth: SailAuthState; availability: AuthAvailability;
  email: string; code: string; stage: 'email' | 'code'; resendSeconds: number;
  onEmailChange: (value: string) => void; onCodeChange: (value: string) => void;
  onSendCode: () => void; onVerifyCode: () => void; onBack: () => void; onSignOut: () => void; onEditProfile: () => void; avatarUrl: string;
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
        <div className="auth-screen-intro"><div className="auth-screen-brand-mark"><img src="/assets/brand/logo/ai-sail-flow-logo-dark.svg" alt="AI-Sail Flow" width={38} height={38} /></div><h1 id="auth-screen-title">{stage === 'code' ? '输入邮箱验证码' : '登录 AI-Sail Flow'}</h1><p>{stage === 'code' ? <>验证码已发送至 <strong>{email}</strong></> : '使用邮箱验证码，进入你的创意工作区。'}</p></div>
        <form className="auth-screen-form" onSubmit={event => { event.preventDefault(); if (stage === 'email') onSendCode(); else onVerifyCode(); }}>
          {!supabaseConfigured && <div className="auth-warning" role="alert">登录服务尚未连接，请联系管理员。</div>}
          {stage === 'email' ? <>
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
