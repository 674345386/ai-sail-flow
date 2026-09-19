import { useCallback, useEffect, useRef, useState, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CirclePlay, Clapperboard, Copy, Download, FileJson, FileText, Film, FolderOpen, Globe2, ImagePlus, Info, LoaderCircle, LogOut, Mail, Package, PanelLeft, Plus, Save, ScanLine, Scissors, Settings2, ShieldCheck, Sparkles, Subtitles, Upload, Video, WandSparkles, X } from 'lucide-react';
import { countries, languages, platforms, roles, timeLabel, validateTimeline, type Project, type ProjectSummary, type Shot, type Product, type Market } from '../shared/domain';
import { buildBrief, buildPrompt, buildExportFiles, subtitles } from '../shared/export';
import { api, downloadBlob } from './api';
import { authDisplayName, authEmail, initialAuthState, supabase, supabaseConfigured, type SailAuthState } from './auth';

const steps = [
  { name: '上传素材', en: 'MATERIALS', icon: Upload, title: '准备你的创意素材', description: '用一条参考视频，定义下一条内容的起点。' },
  { name: '视频拆解', en: 'BREAKDOWN', icon: ScanLine, title: '看懂每一个有效镜头', description: '对照原片，检查动作、口播与商品展示。' },
  { name: '产品与市场改写', en: 'LOCALIZATION', icon: Globe2, title: '让创意适合你的市场', description: '保留有效的表达结构，换成你的产品和当地语言。' },
  { name: '提示词包导出', en: 'EXPORT', icon: Package, title: '把创意交给制作', description: '带走可编辑的提示词、分镜与字幕草稿。' },
];
type Status = { model: string; configured: boolean };
function Field({ label, hint, error, errorId, children, className = '' }: { label: string; hint?: string; error?: string; errorId?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${error ? 'invalid' : ''} ${className}`}><span className="field-label">{label}</span>{children}{error && <span className="field-error" id={errorId}>{error}</span>}{hint && <span className="field-hint">{hint}</span>}</label>;
}
function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`input ${props.className || ''}`} />; }
function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`input textarea ${props.className || ''}`} />; }
function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="toggle-row"><div><span>{label}</span><small>{hint}</small></div><button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button></div>;
}
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-btn" aria-label="关闭" onClick={onClose}><X size={18} /></button></div>{children}</dialog>;
}
function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
type StudioMockupVariant = 'gallery' | 'plan' | 'create' | 'polish';
function StudioMockup({ variant, images }: { variant: StudioMockupVariant; images: string[] }) {
  const labels = variant === 'plan' ? ['创意方向', '受众洞察', '镜头结构', '行动引导'] : variant === 'create' ? ['脚本', '画面', '口播', '字幕'] : ['上传素材', '视频拆解', '市场改写', '提示词包'];
  return <div className={`gf-studio gf-studio-${variant}`} aria-label={`${variant} 工作台示意`}>
    <div className="gf-studio-toolbar"><strong>AI-Sail Flow</strong><span className="gf-studio-address" /><span className="gf-studio-avatar" /></div>
    <div className="gf-studio-body">
      <aside className="gf-studio-sidebar"><span className="active" />{labels.map(label => <span key={label}>{label}</span>)}</aside>
      <div className="gf-studio-canvas">
        {(variant === 'gallery' || variant === 'plan') && <div className="gf-studio-gallery">{Array.from({ length: variant === 'gallery' ? 12 : 8 }, (_, index) => <figure key={index}><img src={images[index % images.length]} alt="" /><figcaption>{['首屏钩子', '产品演示', '细节证明', '场景代入'][index % 4]}</figcaption></figure>)}</div>}
        {variant === 'create' && <div className="gf-create-stage"><img src={images[3]} alt="户外创作者内容预览" /><div className="gf-create-glass"><span>生成中的本地化脚本</span><strong>Show the product in a real-life moment.</strong></div></div>}
        {variant === 'polish' && <><div className="gf-polish-stage"><img src={images[2]} alt="产品视频打磨预览" /><div className="gf-polish-focus" /></div><div className="gf-timeline">{Array.from({ length: 7 }, (_, index) => <span key={index} className={index === 3 ? 'active' : ''} />)}</div></>}
      </div>
      <aside className="gf-studio-inspector"><small>{variant === 'gallery' ? '项目素材' : variant === 'plan' ? '方案建议' : variant === 'create' ? '生成设置' : '镜头调整'}</small>{labels.map((label, index) => <div key={label}><span>{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong><i /></div>)}</aside>
    </div>
    <div className="gf-studio-prompt"><Sparkles size={13} /><span>{variant === 'gallery' ? '分析参考视频中的有效创意结构' : variant === 'plan' ? '为美国 TikTok 生成 3 个创意方向' : variant === 'create' ? '生成 15 秒产品演示脚本' : '让第 4 个镜头更有购买推动力'}</span><ArrowRight size={13} /></div>
  </div>;
}
function SectionBackdrop({ src, className = '' }: { src: string; className?: string }) {
  return <div className={`gf-section-backdrop ${className}`} aria-hidden="true"><img src={src} alt="" /></div>;
}

const landingTools = ['文字叠加', '视频画面调整工具', '图片编辑器', '分镜脚本工作室', '音色翻译', '口播重写', '节奏诊断', '字幕本地化', '产品事实校验', '提示词包导出'];
const landingPlans = [
  { name: '免费', price: '¥0', note: '本地体验', features: ['1 个本地工作区', '视频与音轨理解', '基础提示词包'] },
  { name: 'Creator', price: '即将推出', note: '个人创作者', features: ['完整视频拆解', '多市场改写', '可编辑分镜'] },
  { name: 'Pro', price: '即将推出', note: '增长团队', features: ['批量创意方向', '团队交付格式', '品牌语气模板'] },
  { name: 'Studio', price: '即将推出', note: '内容工作室', features: ['多项目管理', '制作资料包', '团队工作流'] },
  { name: 'Enterprise', price: '联系我们', note: '企业方案', features: ['私有化部署', '自定义模型通道', '专属支持'] },
];
const sizeLabel = (bytes: number) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

function AuthDialog({ open, onClose, auth, email, code, stage, onEmailChange, onCodeChange, onSendCode, onVerifyCode, onGoogleSignIn, onXSignIn, onBack, onSignOut }: {
  open: boolean;
  onClose: () => void;
  auth: SailAuthState;
  email: string;
  code: string;
  stage: 'email' | 'code';
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: () => void;
  onVerifyCode: () => void;
  onGoogleSignIn: () => void;
  onXSignIn: () => void;
  onBack: () => void;
  onSignOut: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
  if (!open) return null;
  const signedIn = !!auth.user;
  if (signedIn) return <Modal title="AI-Sail Flow 账号" onClose={onClose}><div className="auth-account-view"><div className="auth-account-icon"><Mail size={20} /></div><strong>{authDisplayName(auth.user)}</strong><span>{authEmail(auth.user)}</span><small>登录状态已保存在此浏览器。工作台仍保持本地运行。</small><button className="btn" onClick={() => { onSignOut(); onClose(); }}><LogOut size={15} />退出登录</button></div></Modal>;
  return <div className="auth-screen" role="dialog" aria-modal="true" aria-labelledby="auth-screen-title">
    <button className="auth-screen-close" aria-label="返回首页" onClick={onClose}><span>返回首页</span><X size={16} /></button>
    <main className="auth-screen-content">
      <div className="auth-screen-brand"><span className="auth-screen-brand-mark"><img src="/assets/brand/ai-sail-flow-mark.png" alt="" /></span><strong>AI-Sail Flow</strong></div>
      <div className="auth-screen-intro"><span className="auth-screen-eyebrow">AI-SAIL FLOW · CREATIVE OPERATING SYSTEM</span><h1 id="auth-screen-title">{stage === 'code' ? '检查你的邮箱' : '创建你的出海工作区'}</h1><p>{stage === 'code' ? <>我们已将 6 位验证码发送至 <strong>{email}</strong></> : '从一条参考视频开始，生成可以直接交给团队执行的海外内容方案。'}</p></div>
      <form className="auth-screen-form" onSubmit={e => { e.preventDefault(); stage === 'email' ? onSendCode() : onVerifyCode(); }}>
        {!supabaseConfigured && <div className="auth-warning" role="alert">尚未配置 Supabase 环境变量，请在本地 `.env` 中填写登录配置。</div>}
        {stage === 'email' ? <>
          <div className="auth-social-stack">
            <button type="button" className="auth-social-button auth-social-google" onClick={onGoogleSignIn} disabled={auth.busy || !supabaseConfigured}><span className="auth-google-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 12.27c0-.7-.06-1.37-.18-2.02H12v3.83h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.15c1.85-1.7 2.9-4.2 2.9-7.2Z" /><path fill="#34A853" d="M12 21.5c2.64 0 4.86-.87 6.48-2.36l-3.15-2.45c-.87.58-1.98.92-3.33.92-2.56 0-4.73-1.73-5.51-4.06H3.24V16.1A9.8 9.8 0 0 0 12 21.5Z" /><path fill="#FBBC05" d="M6.49 13.55A5.9 5.9 0 0 1 6.18 12c0-.54.11-1.06.31-1.55V8.02H3.24A9.49 9.49 0 0 0 2.2 12c0 1.44.35 2.8 1.04 3.98l3.25-2.43Z" /><path fill="#EA4335" d="M12 6.39c1.44 0 2.73.5 3.75 1.49l2.81-2.81C16.85 3.45 14.63 2.5 12 2.5a9.8 9.8 0 0 0-8.76 5.52l3.25 2.43C7.27 8.12 9.44 6.39 12 6.39Z" /></svg></span><span>使用 Google 继续</span></button>
            <button type="button" className="auth-social-button auth-social-x" onClick={onXSignIn} disabled={auth.busy || !supabaseConfigured}><span className="auth-x-logo" aria-hidden="true">𝕏</span><span>使用 X 继续</span></button>
          </div>
          <div className="auth-divider"><span>或使用邮箱验证码</span></div>
          <label className="auth-input-label"><span>邮箱地址</span><input className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} disabled={auth.busy} onChange={e => onEmailChange(e.target.value)} required /></label>
        </> : <>
          <label className="auth-input-label"><span>6 位验证码</span><input className="input auth-code-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} disabled={auth.busy} onChange={e => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
          <button type="button" className="auth-change-email" onClick={onBack} disabled={auth.busy}>使用其他邮箱</button>
        </>}
        {auth.error && <div className="auth-error" role="alert">{auth.error}</div>}
        {auth.status && <div className="auth-status" role="status">{auth.status}</div>}
        <button type="submit" className="auth-continue-button" disabled={auth.busy || !email.trim() || (stage === 'code' && code.length !== 6) || !supabaseConfigured}>{auth.busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{stage === 'email' ? '继续' : '验证并进入工作区'}</button>
        {stage === 'email' && <p className="auth-legal">继续即表示你同意 AI-Sail Flow 的使用条款与隐私政策。<br />邮箱验证码登录无需密码，首次登录会自动创建账号。</p>}
      </form>
      <div className="auth-screen-footer"><ShieldCheck size={14} /><span>本地部署 · 素材与项目保存在你的设备</span></div>
    </main>
  </div>;
}

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<Status>({ model: 'gemini-3.8-flash', configured: false });
  const [step, setStep] = useState(0);
  const [showLanding, setShowLanding] = useState(true);
  const [selectedShot, setSelectedShot] = useState(0);
  const [selectedRewrite, setSelectedRewrite] = useState(0);
  const [exportTab, setExportTab] = useState('prompt');
  const [modal, setModal] = useState<'settings' | 'guide' | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [showRequiredErrors, setShowRequiredErrors] = useState(false);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bootError, setBootError] = useState('');
  const [auth, setAuth] = useState<SailAuthState>(initialAuthState);
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmailValue, setAuthEmailValue] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authStage, setAuthStage] = useState<'email' | 'code'>('email');
  const current = useRef<Project | null>(null);
  const unsaved = useRef(false);
  const editSequence = useRef(0);
  const savePromise = useRef<Promise<Project | null> | null>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState(false);

  const adopt = useCallback((p: Project) => { current.current = p; setProject(p); }, []);
  const refreshList = useCallback(async () => { setProjects(await api<ProjectSummary[]>('/api/projects')); }, []);
  const change = useCallback((fn: (p: Project) => Project) => {
    const p = current.current;
    if (!p || p.job?.status === 'running') return;
    const next = fn(p);
    const changedInputs = JSON.stringify(next.product) !== JSON.stringify(p.product) || JSON.stringify(next.market) !== JSON.stringify(p.market) || JSON.stringify(next.analysis) !== JSON.stringify(p.analysis);
    next.rewriteStale = p.rewriteStale || (!!next.rewrite && changedInputs);
    editSequence.current++; unsaved.current = true; setDirty(true); adopt(next);
  }, [adopt]);
  const updateProduct = (patch: Partial<Product>) => change(p => ({ ...p, product: { ...p.product, ...patch } }));
  const updateMarket = (patch: Partial<Market>) => change(p => ({ ...p, market: { ...p.market, ...patch } }));
  const save = useCallback(async (): Promise<Project | null> => {
    if (savePromise.current) await savePromise.current;
    if (!unsaved.current || !current.current) return current.current;
    const snapshot = current.current;
    if (snapshot.analysis) { const e = validateTimeline(snapshot.analysis.shots, snapshot.analysis.duration); if (e) throw new Error(e); }
    if (snapshot.rewrite) { const e = validateTimeline(snapshot.rewrite.shots); if (e) throw new Error(e); }
    const seq = editSequence.current;
    setSaving(true);
    const promise = (async () => {
      const saved = await api<Project>(`/api/projects/${snapshot.id}`, { method: 'PUT', body: JSON.stringify({ revision: snapshot.revision, title: snapshot.title.trim() || '未命名创意', product: snapshot.product, market: snapshot.market, analysis: snapshot.analysis, rewrite: snapshot.rewrite }) });
      if (current.current?.id === saved.id) {
        if (editSequence.current === seq) { unsaved.current = false; setDirty(false); adopt(saved); }
        else adopt({ ...current.current, revision: saved.revision, updatedAt: saved.updatedAt, rewriteStale: current.current.rewriteStale || saved.rewriteStale });
      }
      await refreshList();
      return current.current;
    })();
    savePromise.current = promise;
    try { return await promise; } finally { savePromise.current = null; setSaving(false); }
  }, [adopt, refreshList]);
  const flush = useCallback(async () => { await save(); if (unsaved.current) await save(); return current.current; }, [save]);
  const perform = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成'); } finally { setBusy(''); }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, modelStatus] = await Promise.all([api<ProjectSummary[]>('/api/projects'), api<Status>('/api/status')]);
        let preferred = '';
        try { preferred = localStorage.getItem('sop-current-project') || ''; } catch {}
        const id = list.find(p => p.id === preferred)?.id || list[0]?.id;
        const p = id ? await api<Project>(`/api/projects/${id}`) : await api<Project>('/api/projects', { method: 'POST', body: '{}' });
        if (!cancelled) { setStatus(modelStatus); adopt(p); setStep(p.rewrite ? 2 : p.analysis ? 1 : 0); await refreshList(); }
      } catch (e) { if (!cancelled) setBootError(e instanceof Error ? e.message : '无法连接工作台'); }
    })();
    return () => { cancelled = true; };
  }, [adopt, refreshList]);
  useEffect(() => { if (project?.id) { try { localStorage.setItem('sop-current-project', project.id); } catch {} } }, [project?.id]);
  useEffect(() => {
    if (!supabase) { setAuth({ ...initialAuthState, initialized: true }); return; }
    let cancelled = false;
    const applySession = (session: SailAuthState['session'], status = '', error = '') => {
      if (!cancelled) setAuth(current => ({ ...current, initialized: true, session, user: session?.user || null, busy: false, status, error }));
    };
    void supabase.auth.getSession().then(({ data, error }) => applySession(data.session, '', error?.message || ''));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const status = event === 'SIGNED_IN' ? '登录成功' : event === 'SIGNED_OUT' ? '已退出登录' : '';
      applySession(session, status);
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!dirty || busy || project?.job?.status === 'running') return;
    const timer = setTimeout(() => { void save().catch(e => setError(e.message)); }, 1000);
    return () => clearTimeout(timer);
  }, [project, dirty, busy, save]);
  const sendAuthCode = async () => {
    if (!supabase || !authEmailValue.trim()) return;
    setAuth(current => ({ ...current, busy: true, error: '', status: '正在发送验证码…' }));
    const { error: sendError } = await supabase.auth.signInWithOtp({ email: authEmailValue.trim(), options: { shouldCreateUser: true } });
    if (sendError) setAuth(current => ({ ...current, busy: false, status: '', error: sendError.message }));
    else { setAuthStage('code'); setAuth(current => ({ ...current, busy: false, status: '验证码已发送，请检查邮箱。', error: '' })); }
  };
  const signInWithOAuth = async (provider: 'google' | 'twitter', providerName: string) => {
    if (!supabase) return;
    setAuth(current => ({ ...current, busy: true, error: '', status: `正在跳转到 ${providerName}…` }));
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}${window.location.pathname}` } });
    if (oauthError) setAuth(current => ({ ...current, busy: false, status: '', error: oauthError.message }));
  };
  const signInWithGoogle = () => signInWithOAuth('google', 'Google');
  const signInWithX = () => signInWithOAuth('twitter', 'X');
  const verifyAuthCode = async () => {
    if (!supabase || !authEmailValue.trim() || authCode.length !== 6) return;
    setAuth(current => ({ ...current, busy: true, error: '', status: '正在验证…' }));
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email: authEmailValue.trim(), token: authCode, type: 'email' });
    if (verifyError) setAuth(current => ({ ...current, busy: false, status: '', error: verifyError.message }));
    else { setAuth(current => ({ ...current, busy: false, session: data.session, user: data.user, status: '登录成功', error: '' })); setAuthCode(''); setAuthStage('email'); setAuthOpen(false); }
  };
  const signOut = async () => {
    if (!supabase) return;
    setAuth(current => ({ ...current, busy: true, status: '正在退出…', error: '' }));
    const { error: signOutError } = await supabase.auth.signOut();
    setAuth(current => ({ ...current, busy: false, status: signOutError ? '' : '已退出登录', error: signOutError?.message || '' }));
  };
  const openAuth = () => { setAuthOpen(true); setAuthStage(auth.user ? 'email' : authStage); setAuthEmailValue(authEmail(auth.user) || authEmailValue); };
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (unsaved.current) { e.preventDefault(); } };
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void save().catch(err => setError(err.message)); } };
    window.addEventListener('beforeunload', unload); window.addEventListener('keydown', shortcut);
    return () => { window.removeEventListener('beforeunload', unload); window.removeEventListener('keydown', shortcut); };
  }, [save]);
  const running = project?.job?.status === 'running';
  useEffect(() => {
    if (!running || !project) return;
    const id = project.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const p = await api<Project>(`/api/projects/${id}`);
        if (cancelled || current.current?.id !== id) return;
        failures = 0; adopt(p);
        if (p.job?.status === 'running') timer = setTimeout(poll, 1800);
        else { await refreshList(); if (p.job?.status === 'completed') { setStep(p.job.kind === 'analysis' ? 1 : 2); setNotice(p.job.message); } }
      } catch (e) { if (!cancelled) { failures++; setError(failures > 2 ? '暂时无法获取任务进度，正在重新连接…' : '连接暂时中断，任务仍可能在后台运行。'); timer = setTimeout(poll, 4000); } }
    };
    timer = setTimeout(poll, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [running, project?.id, adopt, refreshList]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 3600); return () => clearTimeout(t); } }, [notice]);
  useEffect(() => {
    if (step !== 0 || !focusTarget || busy || running) return;
    const field = document.getElementById(focusTarget);
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'center' });
    setFocusTarget(null);
  }, [step, focusTarget, busy, running]);
  const switchProject = (id: string) => perform('正在打开项目', async () => {
    await flush(); const p = await api<Project>(`/api/projects/${id}`); adopt(p); setDirty(false); unsaved.current = false;
    setStep(p.rewrite ? 2 : p.analysis ? 1 : 0); setSelectedShot(0); setSelectedRewrite(0); setSidebarOpen(false); setShowRequiredErrors(false); setFocusTarget(null);
  });
  const newProject = (demo = false) => perform('正在创建项目', async () => {
    await flush(); const p = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ demo }) });
    adopt(p); setDirty(false); unsaved.current = false; setStep(demo ? 1 : 0); setSelectedShot(0); setSelectedRewrite(0); setShowRequiredErrors(false); setFocusTarget(null); await refreshList(); setSidebarOpen(false);
  });
  const enterWorkspace = (create = false) => { setShowLanding(false); setSidebarOpen(false); if (create) void newProject(); };
  const uploadFiles = (files: FileList | File[], kind: 'video' | 'product') => perform('正在上传素材', async () => {
    const p = await flush(); if (!p) return;
    const list = Array.from(files);
    if (kind === 'video' && list.length !== 1) throw new Error('每个项目使用一条参考视频。');
    if (kind === 'product' && p.assets.filter(a => a.kind === 'product').length + list.length > 3) throw new Error('最多上传 3 张产品图。');
    for (const file of list) {
      const max = kind === 'video' ? 250 : 10;
      if (file.size > max * 1024 * 1024) throw new Error(`文件过大：${kind === 'video' ? '视频' : '图片'}最多 ${max} MB。`);
      const form = new FormData(); form.append('file', file);
      adopt(await api<Project>(`/api/projects/${p.id}/assets/${kind}`, { method: 'POST', body: form }));
    }
    await refreshList(); setNotice('素材已保存到本机');
  });
  const removeAsset = (id: string) => perform('正在移除素材', async () => { const p = await flush(); if (p) adopt(await api<Project>(`/api/projects/${p.id}/assets/${id}`, { method: 'DELETE' })); });
  const startJob = (kind: 'analysis' | 'rewrite') => perform('正在准备任务', async () => {
    const p = await flush(); if (!p) return;
    if (!status.configured) { setModal('settings'); return; }
    adopt(await api<Project>(`/api/projects/${p.id}/jobs/${kind}`, { method: 'POST', body: '{}' }));
    setStep(kind === 'analysis' ? 1 : 2);
  });
  const go = (n: number) => perform('正在保存', async () => { await flush(); setStep(n); setSidebarOpen(false); });
  const fillProductField = (id: string) => perform('正在打开产品资料', async () => {
    await flush(); setShowRequiredErrors(true); setStep(0); setFocusTarget(id); setSidebarOpen(false);
  });
  const exportZip = () => perform('正在打包', async () => {
    const p = await flush(); if (!p) return;
    const response = await fetch(`/api/projects/${p.id}/export`);
    if (!response.ok) throw new Error((await response.json()).error);
    downloadBlob(await response.blob(), `${p.title}.zip`); setNotice('提示词包已导出');
  });
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setNotice('已复制'); } catch { setError('浏览器未允许复制，请使用下载按钮。'); } };

  if (!project) return <div className="boot-screen"><div className="brand-icon"><img src="/assets/brand/ai-sail-flow-mark.png" alt="" /></div><h1>AI-Sail Flow</h1>{bootError ? <><p className="error-text">{bootError}</p><button className="btn" onClick={() => location.reload()}>重新连接</button></> : <><LoaderCircle className="spin" /><p>正在打开工作台…</p></>}</div>;
  const video = project.assets.find(a => a.kind === 'video');
  const productImages = project.assets.filter(a => a.kind === 'product');
  const landingImages = [
    '/assets/landing/workflow-merchant-daylight.png',
    '/assets/landing/workflow-creator-rooftop.png',
    '/assets/landing/workflow-localization.png',
    '/assets/landing/workflow-creator-team.png',
    '/assets/landing/hero-creator-v2.png',
    '/assets/landing/market-creator-v2.png',
    '/assets/landing/social-commerce-toys.png',
    '/assets/landing/social-commerce-travel.png',
    '/assets/landing/models-ambient-v2.png',
    '/assets/landing/product-earbuds-black-creator.png',
    '/assets/landing/product-aroma-south-asian.png',
    '/assets/landing/product-projector-east-asian.png',
    '/assets/landing/product-tote-middle-eastern.png',
    '/assets/landing/global-shipping.png',
    '/assets/landing/smart-home.png',
    '/assets/landing/beauty-demo.png',
    '/assets/landing/outdoor-creator.png',
    '/assets/landing/market-filming.png',
  ];
  if (showLanding) return <div className="landing-page">
    <header className="landing-nav">
      <button className="landing-brand" onClick={() => setShowLanding(true)} aria-label="回到首页"><span>AI-Sail Flow</span></button>
      <nav className="landing-links" aria-label="首页导航"><a href="#overview">概览</a><a href="#models">模型</a><a href="#features">功能</a><a href="#tools">工具</a><a href="#creator">Flow 创作营</a><a href="#pricing">价格</a></nav>
      <div className="landing-social"><span aria-label="X">𝕏</span><span aria-label="Instagram">◎</span><span aria-label="Discord">◉</span><button aria-label="更多选项">⋮</button><button className="landing-account" onClick={openAuth}>{auth.user ? authDisplayName(auth.user) : '登录'}</button></div>
    </header>
    <main className="landing-hero" id="overview">
      <div className="landing-mosaic" aria-hidden="true">
        {Array.from({ length: 16 }, (_, i) => <div className={`landing-tile landing-tile-${i + 1}`} key={i}><img src={landingImages[i % landingImages.length]} alt="" /></div>)}
      </div>
      <div className="landing-shade" />
      <section className="landing-copy">
        <h1>AI-Sail Flow</h1>
        <p>您的专属 AI 出海内容工作室，基于<br />真实视频理解与市场洞察打造而成。</p>
        <button className="landing-cta" onClick={() => enterWorkspace()}><span>进入 AI-Sail Flow 创作</span><ArrowRight size={18} /></button>
        <small className="landing-disclaimer"><ShieldCheck size={13} /> 本地部署 · 素材保存在你的设备</small>
      </section>
      <a className="landing-scroll" href="#made" aria-label="继续探索"><span>向下探索</span><ArrowDownToLine size={17} /></a>
    </main>
    <section className="gf-intro" id="made">
      <SectionBackdrop src="/assets/landing/market-creator-v2.png" className="gf-intro-backdrop" />
      <div className="gf-intro-copy"><h2>成就您的<br />出海创意之作</h2><p>从一条真实参考视频出发，把有效镜头、产品表达和购买动机变成可执行的全球内容方案。</p></div>
      <div className="gf-intro-frame"><StudioMockup variant="gallery" images={landingImages} /></div>
    </section>

    <section className="gf-models" id="models">
      <SectionBackdrop src="/assets/landing/models-ambient-v2.png" className="gf-models-backdrop" />
      <div className="gf-centered-heading"><span>模型</span><h2>我们的模型</h2><p>画面、动作、商品、口播与音轨在同一次分析中被理解，<br />再转换成可以复用的创意结构。</p></div>
      <article className="gf-omni-panel">
        <SectionBackdrop src="/assets/landing/models-ambient-v2.png" className="gf-omni-backdrop" />
        <div className="gf-omni-copy"><small>NATIVE MULTIMODAL VIDEO</small><h3>Gemini 3.8 Flash</h3><p>完整视频和音轨一起输入，理解镜头节奏、口播、商品展示与购买引导，把参考创意拆成可执行的内容资产。</p><div><button onClick={() => enterWorkspace()}>使用 AI-Sail Flow</button><button className="ghost">了解模型</button></div></div>
        <span className="gf-omni-badge">VIDEO · AUDIO · PRODUCT CONTEXT</span>
      </article>
    </section>

    <section className="gf-features" id="features">
      <SectionBackdrop src="/assets/landing/product-projector-east-asian.png" className="gf-features-backdrop" />
      <div className="gf-section-label">功能</div>
      <div className="gf-feature-tabs"><span>方案</span><span>创作</span><span>打磨</span><button onClick={() => enterWorkspace(true)}>使用 AI-Sail Flow 开始创作</button></div>
      <article className="gf-showcase gf-showcase-plan">
        <h2>方案</h2><div className="gf-showcase-glow" />
        <div className="gf-showcase-stack"><span /><span /><StudioMockup variant="plan" images={landingImages} /></div>
        <aside className="gf-glass-note"><span>01</span><strong>从洞察到方向</strong><p>先理解参考视频为什么有效，再结合产品事实和目标市场形成创意方案。</p></aside>
        <p className="gf-showcase-caption">上传参考视频和产品信息，获得开头钩子、受众切入与完整镜头方案。</p>
        <div className="gf-showcase-arrows"><button aria-label="上一个功能">←</button><button aria-label="下一个功能">→</button></div>
      </article>
      <article className="gf-showcase gf-showcase-create">
        <h2>创作</h2><div className="gf-showcase-glow" />
        <div className="gf-showcase-stack"><span /><span /><StudioMockup variant="create" images={landingImages} /></div>
        <aside className="gf-glass-note"><span>02</span><strong>把方案写成镜头</strong><p>按平台、语言和购买路径生成可拍摄、可剪辑、可继续生成的视频脚本。</p></aside>
        <p className="gf-showcase-caption">用当地表达重写口播、画面文字与行动引导，不停留在字面翻译。</p>
        <div className="gf-showcase-arrows"><button aria-label="上一个功能">←</button><button aria-label="下一个功能">→</button></div>
      </article>
      <article className="gf-showcase gf-showcase-polish">
        <h2>打磨</h2><div className="gf-showcase-glow" />
        <div className="gf-showcase-stack"><span /><span /><StudioMockup variant="polish" images={landingImages} /></div>
        <aside className="gf-glass-note"><span>03</span><strong>让交付可以直接制作</strong><p>逐镜检查节奏、字幕、产品露出和合规边界，并导出标准提示词包。</p></aside>
        <p className="gf-showcase-caption">把最终分镜、字幕、制作简报和视频生成提示词一次性带走。</p>
        <div className="gf-showcase-arrows"><button aria-label="上一个功能">←</button><button aria-label="下一个功能">→</button></div>
      </article>
    </section>

    <section className="gf-tools" id="tools">
      <SectionBackdrop src="/assets/landing/product-earbuds-black-creator.png" className="gf-tools-backdrop" />
      <div className="gf-centered-heading"><span>工具</span><h2>用自然语言构建内容工具</h2><p>无需切换十几个应用。描述你想完成的任务，<br />让工作流围绕素材和目标市场组织起来。</p></div>
      <div className="gf-tools-layout">
        <article className="gf-tool-preview"><img src="/assets/landing/product-earbuds-black-creator.png" alt="自然语言内容工具预览" /><div className="gf-tool-preview-shade" /><div className="gf-tool-preview-copy"><small>AI-SAIL TOOL</small><h3>Add your product here</h3><p>把产品放进真实使用情境，再补充当地语言的利益点和行动引导。</p><span>Gemini 3.8 Flash</span></div></article>
        <div className="gf-tool-list">{landingTools.map((tool, index) => <div key={tool}><span>{tool}</span><small>{String(index + 1).padStart(2, '0')}</small><button onClick={() => enterWorkspace(index === 9)}>探索</button></div>)}</div>
      </div>
      <button className="gf-outline-cta" onClick={() => enterWorkspace(true)}>使用 AI-Sail Flow 构建内容 <ArrowRight size={17} /></button>
    </section>

    <section className="gf-creator" id="creator">
      <div className="gf-creator-backdrop" aria-hidden="true">{[landingImages[4], landingImages[6], landingImages[1], landingImages[3], landingImages[0]].map((src, index) => <img src={src} alt="" key={src} className={`creator-image-${index + 1}`} />)}</div>
      <div className="gf-creator-scrim" />
      <div className="gf-creator-grid">
        <div className="gf-creator-list"><h2>Flow<br />创作营</h2><button>DTC 品牌团队</button><button>TikTok Shop 卖家</button><button className="active">独立站增长团队</button><button>海外社媒代理商</button></div>
        <div className="gf-creator-about"><p>面向真实出海任务的创意工作流。参考内容提供方法，产品事实和目标市场决定最终表达。</p><button onClick={() => enterWorkspace()}>进入工作台</button></div>
        <article className="gf-creator-story"><img src="/assets/landing/workflow-creator-team.png" alt="商家与达人共同制作出海视频" /><div><span>创作者案例</span><h3>把一条参考片，变成团队今天就能执行的方案。</h3><p>从镜头理解到本地化改写，再到制作资料包，全部保留在一个项目中。</p><div><button aria-label="上一个案例">←</button><button aria-label="下一个案例">→</button></div></div></article>
      </div>
    </section>

    <section className="gf-pricing" id="pricing">
      <div className="gf-centered-heading"><h2>价格</h2><p>本地版当前开放体验；云端与团队方案将在验证后公布。</p><button className="gf-small-outline" onClick={() => enterWorkspace()}>使用 AI-Sail Flow</button></div>
      <div className="gf-plan-grid">{landingPlans.map((plan, index) => <article key={plan.name} className={index === 0 ? 'active' : ''}><span>{plan.name}</span><small>{plan.note}</small><div className="gf-plan-price">{plan.price}</div><button onClick={() => enterWorkspace()}>{index === 0 ? '立即开始' : '登记意向'}</button><ul>{plan.features.map(feature => <li key={feature}><Check size={13} />{feature}</li>)}</ul></article>)}</div>
      <p className="gf-pricing-note">* 后续方案、额度和价格以正式发布信息为准。</p>
    </section>

    <section className="gf-faq">
      <h2>有疑问?</h2>
      <div>{[
        ['AI-Sail Flow 会保存我的视频吗？', '本地部署版本把上传素材、项目和导出结果保存在你的设备中。'],
        ['Gemini 3.8 Flash 如何理解完整视频？', '视频与音轨通过原生多模态格式一起输入，用于识别镜头、口播、产品展示和节奏。'],
        ['生成的方案可以直接交给制作团队吗？', '可以。导出包包含分镜、字幕草稿、制作简报和视频生成提示词。'],
      ].map(([question, answer]) => <details key={question}><summary><span>{question}</span><Plus size={18} /></summary><p>{answer}</p></details>)}</div>
    </section>
    <footer className="gf-footer"><strong>AI-Sail Flow</strong><span>本地部署 · Gemini 3.8 Flash · V1</span><nav><a href="#overview">回到顶部</a><button onClick={() => enterWorkspace()}>进入工作台</button></nav></footer>
    <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} auth={auth} email={authEmailValue} code={authCode} stage={authStage} onEmailChange={setAuthEmailValue} onCodeChange={setAuthCode} onSendCode={() => { void sendAuthCode(); }} onVerifyCode={() => { void verifyAuthCode(); }} onGoogleSignIn={() => { void signInWithGoogle(); }} onXSignIn={() => { void signInWithX(); }} onBack={() => { setAuthStage('email'); setAuthCode(''); setAuth(current => ({ ...current, error: '', status: '' })); }} onSignOut={() => { void signOut(); }} />
  </div>;
  const disabled = !!busy || running;
  const missingProductFields = [
    ...(!project.product.name.trim() ? [{ id: 'product-name', label: '产品名称' }] : []),
    ...(!project.product.facts.trim() ? [{ id: 'product-facts', label: '已确认的卖点与规格' }] : []),
  ];
  const rewriteBlocked = !project.analysis || missingProductFields.length > 0;
  const available = [true, !!video || !!project.analysis, !!project.analysis, !!project.rewrite];
  const market = countries.find(c => c.code === project.market.country)!;
  const platform = platforms.find(p => p.id === project.market.platform)!;
  const shot = project.analysis?.shots[Math.min(selectedShot, project.analysis.shots.length - 1)];
  const localShot = project.rewrite?.shots[Math.min(selectedRewrite, project.rewrite.shots.length - 1)];
  const updateShot = (index: number, patch: Partial<Shot>, localized = false) => change(p => {
    if (localized && p.rewrite) return { ...p, rewrite: { ...p.rewrite, shots: p.rewrite.shots.map((s, i) => i === index ? { ...s, ...patch } : s) } };
    if (p.analysis) return { ...p, analysis: { ...p.analysis, shots: p.analysis.shots.map((s, i) => i === index ? { ...s, ...patch } : s) } };
    return p;
  });
  const seek = (seconds: number) => { if (player.current) { player.current.currentTime = seconds; player.current.focus(); } };
  const previewVideo = (compact = false) => <div className={`video-stage ${compact ? 'compact' : ''}`}>
    {video ? <video key={video.id} ref={player} src={video.url} poster={video.thumbnail} controls playsInline preload="metadata" aria-label="参考视频播放器" /> : <div className="demo-frame"><Clapperboard size={38} strokeWidth={1.2} /><span>{project.isDemo ? '示例分镜' : '暂无参考视频'}</span><small>{project.isDemo ? '以下为手写示例，非 AI 分析结果' : '上传后可在这里播放原片'}</small></div>}
  </div>;
  const sceneEditor = (s: Shot, index: number, localized = false) => <div className="scene-editor" key={`${localized}-${s.id}`}>
    <div className="scene-heading"><span className="scene-index">{String(index + 1).padStart(2, '0')}</span><h3>{roles[s.role]}</h3><Badge>{localized ? project.market.language : '原片记录'}</Badge></div>
    <div className="form-grid three"><Field label="开始 / 秒"><Input type="number" min="0" step="0.1" value={s.start} disabled={disabled} onChange={e => updateShot(index, { start: Number(e.target.value) }, localized)} /></Field><Field label="结束 / 秒"><Input type="number" min="0" step="0.1" value={s.end} disabled={disabled} onChange={e => updateShot(index, { end: Number(e.target.value) }, localized)} /></Field><Field label="镜头作用"><select className="input" value={s.role} disabled={disabled} onChange={e => updateShot(index, { role: e.target.value as Shot['role'] }, localized)}>{Object.entries(roles).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field></div>
    <Field label="画面与场景"><Textarea rows={2} value={s.visual} disabled={disabled} onChange={e => updateShot(index, { visual: e.target.value }, localized)} /></Field>
    <Field label="人物 / 产品动作"><Textarea rows={2} value={s.action} disabled={disabled} onChange={e => updateShot(index, { action: e.target.value }, localized)} /></Field>
    <div className="form-grid"><Field label="口播"><Textarea rows={3} value={s.narration} placeholder="无口播" disabled={disabled} onChange={e => updateShot(index, { narration: e.target.value }, localized)} /></Field><Field label={localized ? '字幕文案' : '画面文字'}><Textarea rows={3} value={s.onScreenText} placeholder="无画面文字" disabled={disabled || (localized && !project.market.subtitles)} onChange={e => updateShot(index, { onScreenText: e.target.value }, localized)} /></Field></div>
    <details className="advanced"><summary>镜头、声音与产品细节 <ChevronDown size={14} /></summary><div className="details-body"><Field label="镜头语言"><Textarea rows={2} value={s.camera} disabled={disabled} onChange={e => updateShot(index, { camera: e.target.value }, localized)} /></Field><Field label="声音"><Input value={s.sound} disabled={disabled} onChange={e => updateShot(index, { sound: e.target.value }, localized)} /></Field><Field label="产品呈现"><Textarea rows={2} value={s.productPresence} disabled={disabled} onChange={e => updateShot(index, { productPresence: e.target.value }, localized)} /></Field><Field label="待确认内容"><Input value={s.uncertainty} disabled={disabled} onChange={e => updateShot(index, { uncertainty: e.target.value }, localized)} /></Field>{localized && <Field label="视频生成指令 · English"><Textarea rows={4} value={(s as Shot & { generationPrompt: string }).generationPrompt} disabled={disabled} onChange={e => change(p => ({ ...p, rewrite: { ...p.rewrite!, shots: p.rewrite!.shots.map((a, i) => i === index ? { ...a, generationPrompt: e.target.value } : a) } }))} /></Field>}</div></details>
  </div>;

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-icon"><img src="/assets/brand/ai-sail-flow-mark.png" alt="" /></div><div><strong>AI-Sail Flow</strong><span>跨境内容工作台</span></div><Badge>V1</Badge></div>
      <button className="workspace-picker" onClick={() => setModal('guide')}><span className="workspace-avatar">S</span><span>我的工作空间<small>本机项目</small></span><ChevronDown size={15} /></button>
      <div className="nav-section-label">创意工作流</div>
      <nav className="workflow-nav" aria-label="制作流程">{steps.map((s, i) => { const Icon = s.icon; return <button key={s.en} className={`nav-item ${step === i ? 'active' : ''}`} disabled={!available[i] || !!busy} onClick={() => go(i)}><Icon size={18} /><span>{s.name}</span><span className="nav-number">0{i + 1}</span></button>; })}</nav>
      <div className="nav-section-label recent-label">最近项目<button className="icon-btn" aria-label="新建项目" onClick={() => newProject()} disabled={!!busy}><Plus size={16} /></button></div>
      <div className="project-list">{projects.map(p => <button key={p.id} className={`project-link ${p.id === project.id ? 'selected' : ''}`} onClick={() => switchProject(p.id)} disabled={!!busy}><span className="project-dot" /><span>{p.title}</span>{p.isDemo && <small>示例</small>}</button>)}</div>
      <div className="sidebar-bottom"><button className="sidebar-help" onClick={() => setModal('guide')}><CircleHelp size={17} /><span>创意方法与使用指南</span><ArrowUpRight size={14} /></button><button className="model-card" onClick={() => setModal('settings')}><span className="model-symbol"><Sparkles size={18} /></span><span><strong>Gemini 3.8 Flash</strong><small>{status.configured ? '密钥已配置' : '连接视频理解模型'}</small></span><Settings2 size={15} /></button><div className="local-note"><ShieldCheck size={13} /> 项目资料保存在本机</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-btn mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><PanelLeft size={19} /></button><FolderOpen size={16} /><span>工作空间</span><ChevronRight size={14} /><span className="breadcrumb-current">{project.title}</span></div><div className="topbar-actions"><span className="save-status">{saving ? <LoaderCircle size={14} className="spin" /> : dirty ? <span className="unsaved-dot" /> : <CheckCheck size={14} />}{saving ? '保存中' : dirty ? '待保存' : '已保存'}</span><button className="icon-btn" title="保存项目 ⌘S" aria-label="保存项目" disabled={disabled || !dirty} onClick={() => perform('正在保存', async () => { await flush(); setNotice('已保存'); })}><Save size={17} /></button><span className="topbar-divider" /><button className="btn small" onClick={() => newProject()} disabled={!!busy}><Plus size={15} />新建创意</button><button className="account-chip" onClick={openAuth}><span>{auth.user ? authDisplayName(auth.user).slice(0, 1).toUpperCase() : <Mail size={14} />}</span>{auth.user ? authDisplayName(auth.user) : '登录'}</button></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">CREATIVE WORKSPACE <span>/</span> 0{step + 1}</div><h1>{steps[step].title}</h1><p>{steps[step].description}</p></div><button className="model-badge" onClick={() => setModal('settings')}><Sparkles size={15} /><span>Gemini 3.8 Flash</span><span className={`connection-dot ${status.configured ? 'configured' : ''}`} /></button></div>
        <div className="stepper" aria-label="工作流步骤">{steps.map((s, i) => <button key={s.en} className={`step-item ${step === i ? 'current' : ''} ${i < step ? 'passed' : ''}`} disabled={!available[i] || !!busy} onClick={() => go(i)}><span className="step-circle">{i < step ? <Check size={14} /> : i + 1}</span><span>{s.name}</span>{i < 3 && <ChevronRight className="step-chevron" size={16} />}</button>)}</div>
        {project.isDemo && <div className="banner sample"><Info size={16} /><span>当前是手写示例项目，用于体验编辑与导出；不是 Gemini 对真实视频的分析。</span><button onClick={() => newProject()}>新建自己的项目 <ArrowRight size={14} /></button></div>}
        {error && <div className="banner error" role="alert"><Info size={16} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
        {project.job?.status === 'failed' && <div className="banner error" role="alert"><Info size={16} /><span>{project.job.message}</span><button disabled={disabled} onClick={() => startJob(project.job!.kind)}>重试</button></div>}
        {running && <div className="job-banner" role="status"><div className="job-text"><LoaderCircle size={18} className="spin" /><div><strong>{project.job!.kind === 'analysis' ? '正在理解参考视频' : '正在生成本地化方案'}</strong><span>{project.job!.message}</span></div><span className="job-percent">{project.job!.progress}%</span></div><div className="job-track"><span style={{ width: `${project.job!.progress}%` }} /></div></div>}
        <div className="project-title-row"><span className="tiny-label">项目名称</span><input aria-label="项目名称" value={project.title} maxLength={120} disabled={disabled} onChange={e => change(p => ({ ...p, title: e.target.value }))} /><span className="project-id">{project.id.slice(0, 8).toUpperCase()}</span></div>

        {step === 0 && <section className="flow-home-hero" aria-labelledby="flow-home-title">
          <div className="flow-hero-wall" aria-hidden="true">
            <div className="flow-tile flow-tile-wide">{video ? <video key={`hero-${video.id}`} src={video.url} poster={video.thumbnail} muted autoPlay loop playsInline /> : <div className="flow-placeholder"><Film size={24} /><span>REFERENCE VIDEO</span></div>}</div>
            <div className="flow-tile flow-tile-tall">{productImages[0] ? <img src={productImages[0].url} alt="" /> : <div className="flow-placeholder warm"><ImagePlus size={22} /><span>PRODUCT</span></div>}</div>
            <div className="flow-tile flow-tile-small"><div className="flow-gradient" /><span>01 / HOOK</span></div>
            <div className="flow-tile flow-tile-square">{productImages[1] ? <img src={productImages[1].url} alt="" /> : <div className="flow-placeholder violet"><Sparkles size={22} /><span>IDEA</span></div>}</div>
            <div className="flow-tile flow-tile-wide lower">{productImages[2] ? <img src={productImages[2].url} alt="" /> : <div className="flow-placeholder blue"><Globe2 size={22} /><span>LOCALIZE</span></div>}</div>
          </div>
          <div className="flow-hero-copy">
            <span className="flow-kicker">AI CREATIVE WORKSPACE · 01</span>
            <h2 id="flow-home-title">把一条素材，<br /><em>变成一套</em>海外增长方案。</h2>
            <p>从真实视频出发，拆解有效镜头，改写成适合目标市场的可执行内容。</p>
            <div className="flow-hero-actions"><button className="flow-cta" onClick={() => video ? void go(1) : videoInput.current?.click()} disabled={disabled}><span>{video ? '开始拆解素材' : '上传素材开始'}</span><ArrowRight size={17} /></button><span className="flow-hero-note"><ShieldCheck size={13} /> 本机保存 · Gemini 原生视频理解</span></div>
          </div>
        </section>}

        {step === 0 && <div className="workspace-grid materials-grid">
          <div className="main-column">
            <section className="panel"><div className="panel-heading"><div><Video size={18} /><h2>参考视频</h2></div><span className="secondary-label">01 / REFERENCE</span></div>
              <input ref={videoInput} className="sr-only" type="file" accept="video/mp4,video/quicktime,video/webm,.mov" aria-label="选择参考视频" onChange={e => { if (e.target.files?.length) void uploadFiles(e.target.files, 'video'); e.target.value = ''; }} />
              {video ? <><div className="video-file-bar"><Film size={15} /><span>{video.name}</span><button className="text-button" disabled={disabled} onClick={() => videoInput.current?.click()}>更换视频</button></div>{previewVideo()}<div className="video-metadata"><span>{timeLabel(video.duration || 0)} 时长</span><span>{video.width} × {video.height}</span><span>{sizeLabel(video.size)}</span><span>{video.hasAudio ? '含音轨' : '无音轨'}</span></div></> : <button className={`upload-drop ${dragging ? 'dragging' : ''}`} disabled={disabled} onClick={() => videoInput.current?.click()} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled && e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files, 'video'); }}><div className="upload-visual"><span className="upload-outline back" /><span className="upload-outline front"><Film size={27} strokeWidth={1.4} /></span><span className="upload-plus"><Plus size={13} /></span></div><strong>拖入一条值得拆解的视频</strong><span>或点击选择文件</span><small>MP4、MOV、WebM · 最长 10 分钟 · 最大 250 MB</small></button>}
              <div className="panel-footnote"><ScanLine size={15} /><span>分析画面与原始音轨，提取镜头、动作、口播和商品展示。</span></div>
            </section>
            <section className="panel"><div className="panel-heading"><div><ImagePlus size={18} /><h2>产品参考图</h2><Badge>选填</Badge></div><span className="secondary-label">{productImages.length} / 3</span></div>
              <input ref={imageInput} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="选择产品图片" onChange={e => { if (e.target.files?.length) void uploadFiles(e.target.files, 'product'); e.target.value = ''; }} />
              <div className="product-images">{[0, 1, 2].map(i => <div className="product-image-slot" key={i}>{productImages[i] ? <><img src={productImages[i].url} alt={productImages[i].name} /><button className="remove-image" aria-label={`移除 ${productImages[i].name}`} disabled={disabled} onClick={() => removeAsset(productImages[i].id)}><X size={14} /></button><span>{productImages[i].name}</span></> : <button disabled={disabled} onClick={() => imageInput.current?.click()}><Plus size={23} strokeWidth={1.2} /><span>{['产品正面', '侧面 / 细节', '打开 / 使用状态'][i]}</span></button>}</div>)}</div>
              <div className="panel-footnote"><Info size={14} /><span>图片约束产品外观；动作与镜头节奏来自参考视频。每张最大 10 MB。</span></div>
            </section>
            <button className="demo-invite" onClick={() => newProject(true)} disabled={!!busy}><span className="demo-icon"><CirclePlay size={20} /></span><span><strong>先看看，一条创意如何完成</strong><small>用示例项目体验分镜编辑、本地化和导出</small></span><ArrowUpRight size={19} /></button>
          </div>
          <aside className="detail-column"><section className="panel brief-panel"><div className="panel-heading"><div><Package size={18} /><h2>你的产品</h2></div><span className="secondary-label">BRIEF</span></div><div className="panel-body">
            <Field label="产品名称 · 必填" error={showRequiredErrors && !project.product.name.trim() ? '请填写要推广的产品名称' : undefined} errorId="product-name-error"><Input id="product-name" required aria-invalid={showRequiredErrors && !project.product.name.trim()} aria-describedby={showRequiredErrors && !project.product.name.trim() ? 'product-name-error' : undefined} placeholder="例如：便携冷萃咖啡杯" value={project.product.name} disabled={disabled} onChange={e => updateProduct({ name: e.target.value })} /></Field>
            <Field label="产品类别"><select className="input" value={project.product.category} disabled={disabled} onChange={e => updateProduct({ category: e.target.value })}>{['家居生活', '美妆个护', '服饰配件', '数码配件', '户外运动', '宠物用品', '其他'].map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="已确认的卖点与规格 · 必填" hint="写具体事实。参考片里的功效、价格不会自动变成你的产品卖点。" error={showRequiredErrors && !project.product.facts.trim() ? '请填写已确认的产品卖点或规格' : undefined} errorId="product-facts-error"><Textarea id="product-facts" required aria-invalid={showRequiredErrors && !project.product.facts.trim()} aria-describedby={showRequiredErrors && !project.product.facts.trim() ? 'product-facts-error' : undefined} rows={5} placeholder={'例如：\n500 ml 容量\n滤网可拆卸清洗\n杯盖采用旋拧结构'} value={project.product.facts} disabled={disabled} onChange={e => updateProduct({ facts: e.target.value })} /></Field>
            <Field label="目标购买人群" hint="他们在什么情境下，会需要这个产品？"><Textarea rows={2} placeholder="例如：想在家准备咖啡的通勤人群" value={project.product.audience} disabled={disabled} onChange={e => updateProduct({ audience: e.target.value })} /></Field>
          </div></section><div className="insight-card"><span className="tiny-label">创意起点</span><h3>先看见用途，再讲清价值。</h3><p>好的参考片能展示产品如何解决一个具体问题。上传时，优先选择动作完整、声音清晰的片段。</p><button className="text-button" onClick={() => setModal('guide')}>查看创意指南 <ArrowUpRight size={13} /></button></div></aside>
        </div>}

        {step === 1 && <div className="workspace-grid breakdown-grid"><div className="main-column"><section className="panel"><div className="panel-heading"><div><Film size={18} /><h2>原片对照</h2></div><Badge>{video ? timeLabel(video.duration || 0) : '示例'}</Badge></div>{previewVideo(true)}{project.analysis && <div className="scene-timeline">{project.analysis.shots.map((s, i) => <button key={s.id} className={selectedShot === i ? 'selected' : ''} style={{ flex: Math.max(s.end - s.start, 1) }} title={`${timeLabel(s.start)} ${roles[s.role]}`} onClick={() => { setSelectedShot(i); seek(s.start); }}><span>{i + 1}</span></button>)}</div>}<div className="panel-footnote"><CirclePlay size={14} />点击镜头编号定位原片</div></section>
          {project.analysis && <section className="panel"><div className="panel-heading"><div><Sparkles size={17} /><h2>创意结构</h2></div><Badge>{project.isDemo ? '示例' : project.analysisMeta?.mode === 'native-video' ? (project.analysisMeta.audioSubmitted ? '原生视频 · 含音轨' : '原生视频') : project.analysisMeta?.mode === 'sampled-frames' ? '关键帧分析' : 'AI 初稿'}</Badge></div><div className="panel-body"><p className="analysis-summary">{project.analysis.summary}</p><div className="structure-list">{Object.entries(roles).filter(([key]) => project.analysis!.shots.some(s => s.role === key)).map(([key, label]) => <div key={key}><span>{label}</span><span>{project.analysis!.shots.filter(s => s.role === key).length} 个镜头</span></div>)}</div>{project.analysis.uncertainties.length > 0 && <div className="uncertainty-note"><Info size={15} /><div><strong>需要确认</strong>{project.analysis.uncertainties.map((u, i) => <p key={i}>{u}</p>)}</div></div>}</div></section>}
        </div><section className="panel scene-panel"><div className="panel-heading"><div><Clapperboard size={18} /><h2>镜头脚本</h2><Badge>{project.analysis?.shots.length || 0} 个镜头</Badge></div>{project.analysis && <button className="text-button" disabled={disabled || !video} onClick={() => startJob('analysis')}>重新拆解</button>}</div>
          {project.analysis && shot ? <><div className="scene-tabs">{project.analysis.shots.map((s, i) => <button className={selectedShot === i ? 'active' : ''} key={s.id} onClick={() => { setSelectedShot(i); seek(s.start); }}><span>{String(i + 1).padStart(2, '0')}</span>{roles[s.role]}<small>{timeLabel(s.start)}</small></button>)}</div>{sceneEditor(shot, selectedShot)}<div className="scene-actions"><button className="text-button" disabled={disabled || shot.end - shot.start < 0.4 || project.analysis.shots.length >= 120} onClick={() => change(p => { const list = [...p.analysis!.shots]; const middle = Math.round((shot.start + shot.end) * 50) / 100; list.splice(selectedShot, 1, { ...shot, end: middle }, { ...shot, id: crypto.randomUUID(), start: middle }); return { ...p, analysis: { ...p.analysis!, shots: list } }; })}><Scissors size={14} />拆分此镜头</button><span>修改自动保存</span></div></> : <div className="empty-state"><ScanLine size={38} strokeWidth={1.2} /><h3>{running ? '正在逐段理解视频' : '开始拆解你的参考片'}</h3><p>把镜头、口播与商品展示整理成可编辑脚本。</p><button className="btn primary" disabled={disabled || !video} onClick={() => startJob('analysis')}><Sparkles size={16} />{status.configured ? '开始视频拆解' : '连接 Gemini 并开始'}</button></div>}
        </section></div>}

        {step === 2 && <div className="workspace-grid localization-grid"><aside className="detail-column"><section className="panel"><div className="panel-heading"><div><Globe2 size={18} /><h2>目标市场</h2></div><span className="secondary-label">TARGET</span></div><div className="panel-body">
          <div className="form-grid"><Field label="国家 / 地区"><select className="input" disabled={disabled} value={project.market.country} onChange={e => { const c = countries.find(c => c.code === e.target.value)!; updateMarket({ country: c.code, language: c.language }); }}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field><Field label="目标语言"><select className="input" disabled={disabled} value={project.market.language} onChange={e => updateMarket({ language: e.target.value as Market['language'] })}>{languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field></div>
          <Field label="发布平台"><div className="platform-picker">{platforms.map(p => <button key={p.id} disabled={disabled} className={project.market.platform === p.id ? 'selected' : ''} onClick={() => updateMarket({ platform: p.id, ...(p.id !== 'tiktok' ? { destination: 'website' } : {}) })}>{p.name}</button>)}</div></Field>
          <Field label="购买路径"><select className="input" disabled={disabled} value={project.market.destination} onChange={e => updateMarket({ destination: e.target.value as Market['destination'] })}><option value="website">独立站 / 外部网站</option><option value="shop" disabled={project.market.platform !== 'tiktok'}>TikTok Shop 商品卡</option></select></Field>
          <Field label="实际行动引导" hint="例如：点击广告按钮；或前往主页链接。按实际发布方式填写。"><Textarea rows={2} disabled={disabled} value={project.market.cta} placeholder="你希望观众看完后做什么？" onChange={e => updateMarket({ cta: e.target.value })} /></Field>
          {project.market.destination === 'website' && <Field label="产品落地页 · 选填"><Input type="url" disabled={disabled} value={project.product.landingUrl} placeholder="https://your-store.com/products/..." onChange={e => updateProduct({ landingUrl: e.target.value })} /></Field>}
          <div className="form-grid"><Field label="售价 · 选填"><Input disabled={disabled} value={project.product.price} placeholder="不展示价格可留空" onChange={e => updateProduct({ price: e.target.value })} /></Field><Field label="售价币种"><select className="input" disabled={disabled} value={project.product.currency} onChange={e => updateProduct({ currency: e.target.value as Product['currency'] })}>{['USD', 'GBP', 'AUD', 'EUR', 'BRL', 'JPY'].map(c => <option key={c}>{c}</option>)}</select></Field></div>
          <Field label="已确认优惠 · 选填"><Input disabled={disabled} value={project.product.offer} placeholder="没有优惠请留空" onChange={e => updateProduct({ offer: e.target.value })} /></Field>
        </div></section><section className="panel"><div className="panel-heading"><div><Settings2 size={18} /><h2>改写方式</h2></div></div><div className="panel-body"><div className="form-grid"><Field label="目标时长"><select className="input" disabled={disabled} value={project.market.duration} onChange={e => updateMarket({ duration: e.target.value as Market['duration'] })}><option value="original">保持原时长</option>{['15', '30', '45', '60'].map(t => <option key={t} value={t}>{t} 秒</option>)}</select></Field><Field label="画面比例"><select className="input" disabled={disabled} value={project.market.aspectRatio} onChange={e => updateMarket({ aspectRatio: e.target.value as Market['aspectRatio'] })}>{['9:16', '4:5', '1:1'].map(v => <option key={v}>{v}</option>)}</select></Field></div><Field label="人物呈现"><select className="input" disabled={disabled} value={project.market.people} onChange={e => updateMarket({ people: e.target.value as Market['people'] })}><option value="preserve">保留人物角色与构图</option><option value="localize">适配目标市场的角色</option><option value="hands">仅手部 / 产品演示</option></select></Field><Field label="表达语气"><select className="input" disabled={disabled} value={project.market.tone} onChange={e => updateMarket({ tone: e.target.value as Market['tone'] })}><option value="natural">自然分享</option><option value="expert">专业讲解</option><option value="energetic">轻快有活力</option></select></Field><Toggle label="保留镜头结构" hint="保留原片的表达顺序与节奏" checked={project.market.keepStructure} disabled={disabled} onChange={keepStructure => updateMarket({ keepStructure })} /><Toggle label="输出字幕草稿" hint="随提示词包导出 SRT 时间码" checked={project.market.subtitles} disabled={disabled} onChange={subtitles => updateMarket({ subtitles })} /></div></section></aside>
          <div className="main-column"><section className="market-summary"><div className="market-code">{market.code}</div><div><span className="tiny-label">当前创意方向</span><h2>{project.product.name || '你的产品'} <span>→</span> {market.name}</h2><p>{platform.name} · {project.market.language} · {project.market.destination === 'shop' ? '站内商品卡' : '独立站引流'}</p></div><Badge>{project.rewriteStale ? '待更新' : project.rewrite ? '方案已生成' : '待生成'}</Badge></section>
            {project.rewriteStale && <div className="banner sample"><Info size={16} /><span>资料或原片分镜已修改，请重新生成改写方案后导出。</span></div>}
            {project.rewrite ? <><section className="panel"><div className="panel-heading"><div><WandSparkles size={18} /><h2>本地化创意</h2></div><Badge>{project.isDemo ? '示例方案' : 'AI 初稿'}</Badge></div><div className="panel-body"><h3 className="creative-angle">{project.rewrite.angle}</h3><p className="muted body-copy">{project.rewrite.audienceInsight}</p><div className="hook-options"><span className="tiny-label">三个开头方向 · 选择后可继续编辑</span>{project.rewrite.hookVariants.map((h, i) => <button key={i} disabled={disabled} onClick={() => { updateShot(0, { narration: h.text, onScreenText: project.market.subtitles ? h.text : '' }, true); setSelectedRewrite(0); setNotice('已应用到第一个镜头，请检查口播时长'); }}><span className="hook-letter">{String.fromCharCode(65 + i)}</span><span><small>{h.label}</small><strong>{h.text}</strong></span><ArrowRight size={15} /></button>)}</div><div className="localization-notes">{project.rewrite.localizationNotes.map((n, i) => <p key={i}><Check size={14} /><span>{n}</span></p>)}</div></div></section>
              <section className="panel"><div className="panel-heading"><div><Clapperboard size={18} /><h2>改写分镜</h2></div><span className="secondary-label">{project.rewrite.shots.length} SCENES</span></div><div className="scene-tabs">{project.rewrite.shots.map((s, i) => <button className={selectedRewrite === i ? 'active' : ''} key={s.id} onClick={() => setSelectedRewrite(i)}><span>{String(i + 1).padStart(2, '0')}</span>{roles[s.role]}</button>)}</div>{localShot && sceneEditor(localShot, selectedRewrite, true)}</section>
              <section className="panel"><div className="panel-heading"><div><FileText size={17} /><h2>全片生成约束</h2></div></div><div className="panel-body"><Field label="整体视觉指令 · English"><Textarea rows={4} value={project.rewrite.globalPrompt} disabled={disabled} onChange={e => change(p => ({ ...p, rewrite: { ...p.rewrite!, globalPrompt: e.target.value } }))} /></Field><Field label="避免出现的内容"><Textarea rows={3} value={project.rewrite.negativePrompt} disabled={disabled} onChange={e => change(p => ({ ...p, rewrite: { ...p.rewrite!, negativePrompt: e.target.value } }))} /></Field></div></section></> : <section className="panel strategy-preview"><div className="strategy-mark"><Globe2 size={34} strokeWidth={1.3} /></div><h2>把参考创意，变成当地的表达。</h2><p>{market.locale}</p><div className="strategy-steps"><div><span>01</span><div><strong>从购买情境切入</strong><p>{project.product.audience || '回到素材页填写目标购买人群，让开头更有针对性。'}</p></div></div><div><span>02</span><div><strong>用演示说清商品价值</strong><p>{project.product.facts || '回到素材页填写已确认卖点，作为改写依据。'}</p></div></div><div><span>03</span><div><strong>让行动引导与购买路径一致</strong><p>{project.market.destination === 'shop' ? '引导查看 TikTok Shop 商品卡，需你已具备对应站点的实际售卖条件。' : '引导进入真实产品页，使用你填写的链接位置或广告按钮。'}</p></div></div></div><div className="strategy-note"><Sparkles size={15} /><span>生成 3 个开头方向 + 完整分镜 + 视频生成提示词</span></div></section>}
          </div></div>}

        {step === 3 && project.rewrite && <div className="workspace-grid export-grid"><section className="panel export-panel"><div className="panel-heading"><div><FileText size={18} /><h2>交付内容预览</h2></div><button className="btn small" onClick={() => copy(exportTab === 'prompt' ? buildPrompt(project) : exportTab === 'brief' ? buildBrief(project) : exportTab === 'json' ? JSON.stringify(project.rewrite!.shots, null, 2) : subtitles(project.rewrite!.shots))}><Copy size={14} />复制</button></div><div className="export-tabs">{[['prompt', '生成提示词'], ['brief', '创意简报'], ['json', '分镜 JSON'], ...(project.market.subtitles ? [['srt', '字幕草稿']] : [])].map(([id, label]) => <button key={id} className={exportTab === id ? 'active' : ''} onClick={() => setExportTab(id)}>{label}</button>)}</div><pre className="code-preview" tabIndex={0}>{exportTab === 'prompt' ? buildPrompt(project) : exportTab === 'brief' ? buildBrief(project) : exportTab === 'json' ? JSON.stringify(project.rewrite.shots, null, 2) : subtitles(project.rewrite.shots)}</pre><div className="panel-footnote"><Info size={14} /><span>提示词用于制作；字幕时间码需在实际成片后校准。</span></div></section><aside className="detail-column"><section className="panel delivery-card"><div className="delivery-icon"><Package size={28} strokeWidth={1.4} /></div><h2>你的创意制作包</h2><p>从策略到镜头，完整交接。</p><div className="delivery-specs"><div><span>目标市场</span><strong>{market.name} / {project.market.language}</strong></div><div><span>发布平台</span><strong>{platform.name}</strong></div><div><span>画面</span><strong>{project.market.aspectRatio} · {project.rewrite.shots.at(-1)?.end}s</strong></div><div><span>分镜</span><strong>{project.rewrite.shots.length} 个</strong></div></div><div className="file-list">{[[FileText, '创意简报', 'MD'], [FileText, 'Seedance 提示词', 'TXT'], [FileJson, '结构化分镜', 'JSON'], [ScanLine, '原片分析', 'JSON'], ...(project.market.subtitles ? [[Subtitles, '字幕草稿', 'SRT']] : []), [FileJson, '项目清单', 'JSON']].map(([Icon, label, ext], i) => { const FileIcon = Icon as typeof FileText; return <div key={i}><FileIcon size={16} /><span>{label as string}</span><small>{ext as string}</small></div>; })}{productImages.length > 0 && <div><ImagePlus size={16} /><span>产品参考图</span><small>{productImages.length} 张</small></div>}</div><button className="btn primary full" disabled={disabled || project.rewriteStale} onClick={exportZip}><Download size={17} />下载完整 ZIP</button>{project.rewriteStale && <p className="error-text">资料已变更，请回到改写页更新方案。</p>}<button className="text-button full centered" disabled={disabled || project.rewriteStale} onClick={() => perform('正在导出', async () => { const p = await flush(); if (!p) return; const files = buildExportFiles(p); downloadBlob(new Blob([files['02-seedance-prompt.txt']], { type: 'text/plain;charset=utf-8' }), `${p.title}-prompt.txt`); })}>仅下载生成提示词 <ArrowDownToLine size={14} /></button></section><div className="insight-card"><span className="tiny-label">制作交接</span><p>按所用视频生成渠道的时长限制分段制作。包装文字与精准字幕可在后期叠加。</p></div></aside></div>}

        <footer className="action-bar"><div className="action-context">{step === 0 ? <><ShieldCheck size={16} /><span>点击拆解后，参考素材将发送给 Gemini 处理</span></> : <><CheckCheck size={16} /><span>{project.isDemo ? '示例可编辑，可导出' : '所有编辑自动保存到本机'}</span></>}</div><div className="action-controls">{step === 2 && (disabled || rewriteBlocked) && <div className="rewrite-requirements" id="rewrite-requirements" role="status" aria-live="polite"><Info size={14} /><span>{disabled ? (running ? '当前任务正在处理，完成后可生成方案。' : busy) : <>生成前请补齐（点击定位）：{!project.analysis && <button type="button" onClick={() => go(video ? 1 : 0)}>视频拆解</button>}{missingProductFields.map((field, i) => <span key={field.id}>{(!project.analysis || i > 0) && '、'}<button type="button" title="前往上传素材页补填" onClick={() => fillProductField(field.id)}>{field.label}</button></span>)}</>}</span></div>}<div className="action-buttons">{step > 0 && <button className="btn" disabled={!!busy} onClick={() => go(step - 1)}>上一步</button>}{step === 0 && <button className="btn primary" disabled={disabled || !video} onClick={() => startJob('analysis')}>{disabled ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}拆解参考视频<ArrowRight size={16} /></button>}{step === 1 && <button className="btn primary" disabled={disabled || !project.analysis} onClick={() => go(2)}>产品与市场改写<ArrowRight size={16} /></button>}{step === 2 && <><button className={`btn ${!project.rewrite || project.rewriteStale ? 'primary' : ''}`} disabled={disabled || rewriteBlocked} aria-describedby={disabled || rewriteBlocked ? 'rewrite-requirements' : undefined} onClick={() => startJob('rewrite')}><WandSparkles size={16} />{project.rewrite ? '重新生成方案' : '生成本地化方案'}</button>{project.rewrite && <button className="btn primary" disabled={disabled || project.rewriteStale} onClick={() => go(3)}>预览交付包<ArrowRight size={16} /></button>}</>}{step === 3 && <button className="btn primary" disabled={disabled || project.rewriteStale} onClick={exportZip}><Download size={16} />导出提示词包</button>}</div></div></footer>
      </main>
    </div>
    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
    {busy && <div className="busy-indicator" role="status"><LoaderCircle className="spin" size={14} />{busy}</div>}
    {modal === 'settings' && <Modal title="视频理解模型" onClose={() => { setModal(null); setApiKey(''); setBaseUrl(''); }}><div className="settings-model"><span className="model-symbol"><Sparkles size={22} /></span><div><h3>Gemini 3.8 Flash</h3><code>{status.model}</code></div><Badge>{status.configured ? '已配置' : '待连接'}</Badge></div><p className="modal-description">使用你自己的 API Key。密钥只保存在服务端内存中，本次服务重启后失效。</p><Field label="API Key"><Input type="password" autoComplete="off" spellCheck={false} placeholder="输入 API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} /></Field><Field label="兼容接口地址 · 可选" hint="例如 https://maiai.ai/v1"><Input type="url" autoComplete="off" spellCheck={false} placeholder="https://maiai.ai/v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></Field><div className="settings-note"><ShieldCheck size={16} /><p>视频拆解使用 Gemini 原生接口，完整视频与音轨将发送给填写的服务商。文字改写使用 OpenAI 兼容接口；留空则连接 Google 官方服务。</p></div><div className="modal-actions"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">获取 API Key <ArrowUpRight size={14} /></a><button className="btn primary" disabled={!!busy || apiKey.trim().length < 16} onClick={() => perform('正在配置', async () => { await api('/api/settings', { method: 'POST', body: JSON.stringify({ apiKey, baseUrl }) }); setStatus(s => ({ ...s, configured: true })); setApiKey(''); setBaseUrl(''); setModal(null); setNotice('模型连接已配置；开始视频拆解进行真实验证'); })}>连接模型</button></div></Modal>}
    {modal === 'guide' && <Modal title="跨境视频创意指南" wide onClose={() => setModal(null)}><p className="modal-description">把平台的创作原则落实到每个镜头。以下是创意建议，不是流量或转化承诺。</p><div className="guide-grid"><article><span className="guide-number">01</span><h3>用情境吸引注意</h3><p>先让观众识别自己的问题，再用具体动作展示产品价值。采用清晰的开头、主体和行动引导。</p><a href="https://ads.tiktok.com/resources/help/article/creative-best-practices?lang=en" target="_blank" rel="noreferrer">TikTok 创意建议 <ArrowUpRight size={13} /></a></article><article><span className="guide-number">02</span><h3>为竖屏观看设计</h3><p>Reels 优先竖屏、有声音的内容。字幕、商品和关键信息避开界面遮挡，生成后按实际版位检查。</p><a href="https://www.facebook.com/business/ads/facebook-instagram-reels-ads" target="_blank" rel="noreferrer">Meta Reels 创意指南 <ArrowUpRight size={13} /></a></article><article><span className="guide-number">03</span><h3>卖点与产品页一致</h3><p>用目标顾客的语言解释用途与收益，填写真实规格、售价和优惠，让视频承诺与落地页保持一致。</p><a href="https://help.shopify.com/en/manual/products/details/product-descriptions/write" target="_blank" rel="noreferrer">Shopify 产品描述指南 <ArrowUpRight size={13} /></a></article><article><span className="guide-number">04</span><h3>让内容可交接</h3><p>原片拆解与新方案分开保存。修改前提会将旧方案标记为待更新，导出时使用最新的镜头与口播。</p><span className="secondary-label">AI-SAIL FLOW 工作方式</span></article></div><div className="guide-footer"><Info size={15} /><span>V1 提供素材上传、Gemini 分析、改写与文件导出。视频渲染、账号发布和广告投放不在本版范围。</span></div></Modal>}
    <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} auth={auth} email={authEmailValue} code={authCode} stage={authStage} onEmailChange={setAuthEmailValue} onCodeChange={setAuthCode} onSendCode={() => { void sendAuthCode(); }} onVerifyCode={() => { void verifyAuthCode(); }} onGoogleSignIn={() => { void signInWithGoogle(); }} onXSignIn={() => { void signInWithX(); }} onBack={() => { setAuthStage('email'); setAuthCode(''); setAuth(current => ({ ...current, error: '', status: '' })); }} onSignOut={() => { void signOut(); }} />
  </div>;
}
