import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUpRight, KeyRound, LoaderCircle, LogOut, Mail, Pause, Pencil, Play, Sparkles, X } from 'lucide-react';
import { authDisplayName, authEmail, authLoginMethod, supabaseConfigured, validEmailCode, type AuthAvailability, type SailAuthState } from './auth';
import './auth-module.css';
import { useDict, useLang, type Dict } from './i18n';
import { detectWebmail, WebmailIcon } from './webmail';
import { AUTH_TEXT } from './landing-i18n';

const ARTWORKS = ['flow', 'observe', 'remix', 'motion'] as const;
const DIALOG_COPY: Dict<{
  welcome: string; gallery: string; carousel: string; collection: string;
  showArtwork: string; pause: string; play: string;
  artworks: { title: string; alt: string }[];
}> = {
  en: {
    welcome: 'Welcome back', gallery: 'Ideas in motion', carousel: 'carousel', collection: 'Creative study',
    showArtwork: 'Show artwork', pause: 'Pause artwork slideshow', play: 'Play artwork slideshow',
    artworks: [
      { title: 'Turn ideas into finished work.', alt: 'Fine flowing ink lines cross an orange disc on sage paper.' },
      { title: 'Find the story in every detail.', alt: 'A cobalt blue circle reveals the intricate structure of a leaf.' },
      { title: 'A new perspective. Your creation.', alt: 'Mountain photographs form a new landscape of slices and contour lines.' },
      { title: 'Bring your next story to life.', alt: 'Three engraved birds take flight, frame by frame, along a coral filmstrip.' },
    ],
  },
  'zh-CN': {
    welcome: '欢迎回来', gallery: '流动的创意', carousel: '轮播', collection: '创意图鉴',
    showArtwork: '查看插画', pause: '暂停插画轮播', play: '播放插画轮播',
    artworks: [
      { title: '让灵感，成为作品。', alt: '鼠尾草绿纸面上，细密墨线流经一轮橘色圆盘。' },
      { title: '在细节里，看见创作的线索。', alt: '钴蓝色观察窗映出叶片中细密分叉的叶脉。' },
      { title: '换个视角，创作你的版本。', alt: '山景被分割、重组，从摄影切片延伸为等高线。' },
      { title: '让每一帧，连成新的故事。', alt: '三只不同飞行姿态的线描飞鸟，沿珊瑚色胶片依次起飞。' },
    ],
  },
};

function AuthArtwork() {
  const copy = useDict(DIALOG_COPY);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPlaying(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing || hovered || focused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive(index => (index + 1) % ARTWORKS.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [active, playing, hovered, focused]);
  return <aside
    className="auth-artwork"
    aria-label={copy.gallery}
    aria-roledescription={copy.carousel}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
  >
    <div className="auth-artwork-images">
      {ARTWORKS.map((artwork, index) => <img
        key={artwork}
        className={`auth-artwork-image${index === active ? ' is-active' : ''}`}
        src={`/assets/auth/${artwork}-v1.jpg`}
        alt={copy.artworks[index].alt}
        aria-hidden={index !== active}
        width={1120}
        height={1400}
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
      />)}
    </div>
    <div className="auth-artwork-caption">
      <div className="auth-artwork-copy" aria-live={playing && !focused ? 'off' : 'polite'} aria-atomic="true">
        <span className="auth-artwork-tag"><Sparkles size={14} aria-hidden="true" />{copy.collection} {String(active + 1).padStart(2, '0')}</span>
        <h2>{copy.artworks[active].title}</h2>
      </div>
      <div className="auth-artwork-controls">
        <div className="auth-artwork-pagination" role="group" aria-label={copy.gallery}>
          {ARTWORKS.map((artwork, index) => <button
            key={artwork}
            type="button"
            className={`auth-artwork-page${active === index ? ' is-active' : ''}`}
            aria-label={`${copy.showArtwork} ${index + 1}: ${copy.artworks[index].title}`}
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          ><span /></button>)}
        </div>
        <button type="button" className="auth-artwork-play" aria-label={playing ? copy.pause : copy.play} onClick={() => setPlaying(value => !value)}>
          {playing ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
        </button>
      </div>
    </div>
  </aside>;
}

export default function AuthDialog({ open, onClose, auth, availability, googleBusy, onGoogleSignIn, email, code, stage, resendSeconds, onEmailChange, onCodeChange, onSendCode, onVerifyCode, onBack, onSignOut, onEditProfile, avatarUrl }: {
  open: boolean; onClose: () => void; auth: SailAuthState; availability: AuthAvailability;
  googleBusy: boolean; onGoogleSignIn: () => void;
  email: string; code: string; stage: 'email' | 'code'; resendSeconds: number;
  onEmailChange: (value: string) => void; onCodeChange: (value: string) => void;
  onSendCode: () => void; onVerifyCode: () => void; onBack: () => void; onSignOut: () => void; onEditProfile: () => void; avatarUrl: string;
}) {
  const t = useDict(AUTH_TEXT);
  const copy = useDict(DIALOG_COPY);
  const { lang } = useLang();
  const webmail = stage === 'code' ? detectWebmail(email) : null;
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const busy = useRef(auth.busy); busy.current = auth.busy;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') || []]
        .filter(node => node.getClientRects().length > 0);
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open || !auth.initialized) return;
    const frame = window.requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>('.auth-screen-form input')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, stage, auth.initialized]);
  if (!open) return null;
  const locked = auth.busy || !auth.initialized;
  const signedIn = !!auth.user;
  const submitDisabled = locked || !supabaseConfigured || !email.trim() || availability.email === false || (stage === 'code' ? !validEmailCode(code) : resendSeconds > 0);
  return createPortal(<div className="auth-screen sail-auth-dialog" onClick={event => { if (event.target === event.currentTarget && !auth.busy) onClose(); }}>
    <div
      className={`auth-modal-card${signedIn ? ' auth-modal-card--account' : ''}`}
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-screen-title"
      aria-describedby={signedIn ? undefined : 'auth-screen-description'}
      aria-busy={locked}
    >
      <button type="button" className="auth-screen-close" aria-label={t.close} disabled={auth.busy} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      {!signedIn && <AuthArtwork />}
      <div className="auth-form-panel">
        <div className="auth-screen-content">
          {signedIn ? <div className="auth-account-view">
            <h1 id="auth-screen-title">{t.account}</h1><div className="auth-account-icon"><img src={avatarUrl} alt={t.avatar} /></div>
            <strong>{authDisplayName(auth.user)}</strong><span>{authEmail(auth.user) || t.account}</span><span className="auth-method-label">{t.method(authLoginMethod(auth.user))}</span>
            <small>{t.kept}</small>
            {auth.error && <div className="auth-error" role="alert">{auth.error}</div>}
            <button type="button" className="btn" disabled={locked} onClick={onEditProfile}><Pencil size={15} />{t.editProfile}</button>
            <button type="button" className="btn" disabled={locked} onClick={onSignOut}>{auth.busy ? <LoaderCircle className="spin" size={15} /> : <LogOut size={15} />}{t.signOut}</button>
          </div> : <>
            <div className="auth-login-brand"><img src="/assets/brand/logo/ai-sail-flow-logo-dark.svg" alt="" width={32} height={32} /><span>AI Creative Lab</span></div>
            <div className="auth-screen-intro">
              <h1 id="auth-screen-title">{stage === 'code' ? t.codeTitle : copy.welcome}</h1>
              <p id="auth-screen-description">{stage === 'code' ? <>{t.sentTo}<strong>{email}</strong></> : t.intro}</p>
            </div>
            <form className="auth-screen-form" onSubmit={event => { event.preventDefault(); if (submitDisabled) return; if (stage === 'email') onSendCode(); else onVerifyCode(); }}>
              {!supabaseConfigured && <div className="auth-warning" role="alert">{t.notConnected}</div>}
              {stage === 'email' ? <>
                <button type="button" className="auth-google-button" onClick={onGoogleSignIn} disabled={locked || !supabaseConfigured || availability.google === false} aria-describedby={supabaseConfigured && availability.google === false ? 'auth-google-hint' : undefined}>
                  {googleBusy ? <LoaderCircle size={19} className="spin" aria-hidden="true" /> : <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.32 2.98-7.36Z" />
                    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
                    <path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" />
                    <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z" />
                  </svg>}
                  <span aria-live="polite">{googleBusy ? t.status.google : t.google}</span>
                </button>
                {supabaseConfigured && availability.google === false && <p id="auth-google-hint" className="auth-provider-hint">{t.googleOff}</p>}
                <div className="auth-email-divider"><span>{t.emailDivider}</span></div>
                <label className="auth-input-label">
                  <span>{t.emailLabel}</span>
                  <span className="auth-input-control"><Mail size={19} aria-hidden="true" /><input className="input" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder="name@example.com" value={email} disabled={locked} onChange={event => onEmailChange(event.target.value)} aria-describedby={auth.error ? 'auth-form-error' : undefined} required /></span>
                </label>
                {availability.email === false && <div className="auth-warning" role="alert">{t.emailOff}</div>}
              </> : <>
                <label className="auth-input-label">
                  <span>{t.codeLabel}</span>
                  <span className="auth-input-control"><KeyRound size={19} aria-hidden="true" /><input className="input auth-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} placeholder={t.codePlaceholder} value={code} disabled={locked} onChange={event => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 10))} aria-describedby={`auth-code-hint${auth.error ? ' auth-form-error' : ''}`} required /></span>
                </label>
                <div className="auth-code-actions"><button type="button" className="auth-change-email" onClick={onBack} disabled={locked}>{t.changeEmail}</button><button type="button" className="auth-change-email" onClick={onSendCode} disabled={locked || resendSeconds > 0}>{resendSeconds ? t.resendIn(resendSeconds) : t.resend}</button></div>
              </>}
              {auth.error && <div id="auth-form-error" className="auth-error" role="alert">{auth.error}</div>}
              <button type="submit" className="auth-continue-button" disabled={submitDisabled}>
                {locked && !googleBusy && <LoaderCircle size={17} className="spin" aria-hidden="true" />}
                <span>{auth.busy && !googleBusy ? stage === 'code' ? t.status.verifying : t.status.sending : stage === 'code' ? t.verify : resendSeconds ? t.sendIn(resendSeconds) : t.send}</span>
                {!locked && <ArrowRight size={18} aria-hidden="true" />}
              </button>
              {stage === 'email' ? <p className="auth-legal">{t.noPassword}{availability.signup !== false && t.autoCreate}</p> : <>
                {webmail && <a className="auth-webmail-link" href={webmail.url} target="_blank" rel="noopener noreferrer"><WebmailIcon provider={webmail} /><span>{t.openMail(webmail.name[lang])}</span><ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only">{t.newTab}</span></a>}
                <p id="auth-code-hint" className="auth-delivery-hint">{t.spam}</p>
              </>}
            </form>
          </>}
        </div>
      </div>
    </div>
  </div>, document.body);
}
