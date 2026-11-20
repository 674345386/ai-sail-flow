import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from '../shared/image-generation-options';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode, type InputHTMLAttributes } from 'react';
import { Archive, ArchiveRestore, ArrowUpRight, BookOpen, Check, ChevronRight, Clapperboard, FolderOpen, Grid2X2, ImagePlus, Info, ListChecks, LoaderCircle, Mail, MessageCirclePlus, Package, Settings, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import { defaultWorkspace, type Project, type ProjectSummary, type WorkspaceProject } from '../shared/domain';
import { api } from './api';
import { promptMediaKind } from '../shared/prompt-media';
import { useAgentTheme } from './intelligent-ui/useAgentTheme';
import { AgentThemePicker } from './intelligent-ui/AgentThemePicker';
import { authDisplayName, authEmail, authErrorMessage, authRedirectUrl, initialAuthState, publicAuthRequired, syncPublicServerSession, supabase, loadAuthAvailability, unknownAuthAvailability, validEmail, validEmailCode, withAuthTimeout, readAuthCallback, clearAuthCallback, type AuthAvailability, type SailAuthState } from './auth';
import AuthDialog from './AuthDialog';
import WelcomeProfileDialog from './WelcomeProfileDialog';
import { isNewUserFirstLogin, needsProfileSetup, useProfileAvatar, useProfileBloub } from './userProfile';
import { BloubAvatar } from './bloub/BloubAvatar';
import AssetLibrary, { MediaLibraryPage } from './AssetLibrary';
import { SkillAssetPicker } from './SkillAssetCenter';
import type { SkillSelection } from '../shared/skill-assets';
import GenerationTasks from './GenerationTasks';
import type { LibraryMedia } from '../shared/media-library';
import { libraryFile, mediaChanged } from './mediaLibrary';
import ProjectNavigation from './ProjectNavigation';
import { useAgentActivity } from './useAgentActivity';
import { useWorkspaceUpdates } from './useWorkspaceUpdates';
import WorkspaceSearchPalette from './WorkspaceSearchPalette';
import AnimatedBrandMark from './AnimatedBrandMark';
import LandingHero from './LandingHero';
import LandingPromptHero from './LandingPromptHero';
import LandingPlayground from './LandingPlayground';
import LandingPageEditor from './LandingPageEditor';
import LandingAnnouncement from './LandingAnnouncement';
import ScrollBrand from "./ScrollBrand";
import LandingSections from './LandingSections';
import LandingToc from './LandingToc';
import LandingBackground from './LandingBackground';
import { LanguageSwitch, getLang, pick, useDict } from './i18n';
import { AUTH_TEXT, LANDING } from './landing-i18n';
import { appTitle, parseRoute, replaceNextUrl, routePath, useUrlSync, type AppRoute } from './useUrlSync';
import './unified-workspace.css';
const IntelligentUIAgentWorkspace = lazy(() => import('./IntelligentUIAgentWorkspace'));
const AgentLandingPage = lazy(() => import('./AgentLandingPage'));

type Status = {
  imageGeneration?: { configured: boolean; baseUrl: string; model: string; models: string[] };
  keyframeStorage?: { configured: boolean; url: string; bucket: string };
  videoGeneration: { configured: boolean };
};
function Field({ label, hint, error, errorId, children, className = '' }: { label: string; hint?: string; error?: string; errorId?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${error ? 'invalid' : ''} ${className}`}><span className="field-label">{label}</span>{children}{error && <span className="field-error" id={errorId}>{error}</span>}{hint && <span className="field-hint">{hint}</span>}</label>;
}
function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`input ${props.className || ''}`} />; }
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-btn" aria-label="关闭" onClick={onClose}><X size={18} /></button></div>{children}</dialog>;
}
function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function SidebarToggleIcon({ expanded }: { expanded: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    {expanded ? <rect x="5.5" y="5.5" width="4" height="13" rx="1" fill="currentColor" stroke="none" /> : <path d="M9 3.5v17" />}
  </svg>;
}
type OrganizationDialog = { kind: 'project-new' | 'project-edit' | 'creative-new' | 'creative-edit'; parentId: string; title: string };
function OrganizationForm({ dialog, groups, busy, error, onSubmit, onClose }: { dialog: OrganizationDialog; groups: WorkspaceProject[]; busy: boolean; error: string; onSubmit: (title: string, parentId: string, skills: SkillSelection[]) => void; onClose: () => void }) {
  const [title, setTitle] = useState(dialog.title);
  const [parentId, setParentId] = useState(dialog.parentId);
  const [skills, setSkills] = useState<SkillSelection[]>([]);
  const creative = dialog.kind.startsWith('creative');
  const heading = { 'project-new': '新建工作空间', 'project-edit': '重命名工作空间', 'creative-new': '新建创意', 'creative-edit': '编辑创意' }[dialog.kind];
  return <Modal title={heading} onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSubmit(title.trim(), parentId, skills); }}>
    <p className="modal-description">{creative ? '每个创意独立保存参考素材、镜头拆解、Prompt 与生成结果。' : '工作空间用于归类相关创意，例如“夏装”。一个工作空间可以包含多个创意。'}</p>
    {creative && <Field label="所属工作空间"><select className="input" value={parentId} disabled={busy} onChange={event => setParentId(event.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}</select></Field>}
    <Field label={creative ? '创意名称' : '工作空间名称'}><Input autoFocus required maxLength={120} value={title} disabled={busy} placeholder={creative ? '例如：色卡夏装换装上、青少年夏装' : '例如：夏装'} onChange={event => setTitle(event.target.value)} /></Field>
    {dialog.kind === 'creative-new' && <SkillAssetPicker value={skills} onChange={setSkills} disabled={busy} />}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="organization-form-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>取消</button><button className="btn primary" type="submit" disabled={busy || !title.trim() || (creative && !parentId)}>{busy ? '保存中' : dialog.kind === 'project-new' ? '创建工作空间' : dialog.kind === 'creative-new' ? '创建创意' : '保存'}</button></div>
  </form></Modal>;
}
export default function App() {
  const agentTheme = useAgentTheme();
  const [backgroundControlsOpen, setBackgroundControlsOpen] = useState(false);
  const closeBackgroundControls = useCallback(() => {
    setBackgroundControlsOpen(false);
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const target = sidebar && sidebar.getBoundingClientRect().x >= 0 ? '.iua-theme-picker > summary' : '.mobile-menu';
    document.querySelector<HTMLElement>(target)?.focus();
  }, []);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectGroups, setProjectGroups] = useState<WorkspaceProject[]>([]);
  const [organizationDialog, setOrganizationDialog] = useState<OrganizationDialog | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<Status>({ videoGeneration: { configured: false } });
  const [showLanding, setShowLanding] = useState(true);
  const [landingMode, setLandingMode] = useState<'agent' | 'home'>(() => window.location.pathname.replace(/\/+$/, '') === '/agent' ? 'agent' : 'home');
  const [pendingAgentPrompt, setPendingAgentPrompt] = useState<string | null>(() => {
    try { return sessionStorage.getItem('sail-agent-entry-prompt'); } catch { return null; }
  });
  const [agentEntryDraft, setAgentEntryDraft] = useState<{ id: string; text: string } | null>(null);
  const agentEntryStarting = useRef(false);
  const pendingAgentFiles = useRef<File[]>([]);
  const consumeAgentEntryDraft = useCallback(() => setAgentEntryDraft(null), []);
  const [modal, setModal] = useState<'config' | 'settings' | null>(null);
  const [imageApiKey, setImageApiKey] = useState('');
  const [imageBaseUrl, setImageBaseUrl] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [omniApiKey, setOmniApiKey] = useState('');
  const [storageUrl, setStorageUrl] = useState('');
  const [storageKey, setStorageKey] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem('sop-sidebar-collapsed') === 'true'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('sop-sidebar-collapsed', String(sidebarCollapsed)); } catch {} }, [sidebarCollapsed]);
  const [bootError, setBootError] = useState('');
  const [auth, setAuth] = useState<SailAuthState>(initialAuthState);
  const workspaceAccount = publicAuthRequired ? auth.session?.user.id || '' : 'local';
  const [loadedAccount, setLoadedAccount] = useState('');
  const workspaceVisible = !publicAuthRequired || !!workspaceAccount && loadedAccount === workspaceAccount;
  const recentProjectKey = publicAuthRequired ? `sop-current-project:${workspaceAccount}` : 'sop-current-project';
  const [authOpen, setAuthOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSetupPrompt, setProfileSetupPrompt] = useState(false);
  const accountAvatar = useProfileAvatar(auth.user);
  const accountBloub = useProfileBloub(auth.user);
  const profileWelcomeOpen = auth.initialized && !!auth.user && (profileEditing || (profileSetupPrompt && !showLanding && !!project && needsProfileSetup(auth.user)));
  const [authEmailValue, setAuthEmailValue] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authStage, setAuthStage] = useState<'email' | 'code'>('email');
  const [authAvailability, setAuthAvailability] = useState<AuthAvailability>(unknownAuthAvailability);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [authResendAt, setAuthResendAt] = useState(0);
  const [authResendSeconds, setAuthResendSeconds] = useState(0);
  const authRequest = useRef(false);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [initialMedia, setInitialMedia] = useState<LibraryMedia | null>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showGenerationTasks, setShowGenerationTasks] = useState(false);
  const [taskAssetSummary, setTaskAssetSummary] = useState<{ projectId: string; count: number } | null>(null);
  const [taskAssetsProjectId, setTaskAssetsProjectId] = useState<string | null>(null);
  const closeTaskAssets = useCallback(() => setTaskAssetsProjectId(null), []);
  const receiveTaskAssetCount = useCallback((id: string, count: number | null) => {
    setTaskAssetSummary(current => count !== null ? { projectId: id, count } : current?.projectId === id ? null : current);
    if (count === null) setTaskAssetsProjectId(current => current === id ? null : current);
  }, []);
  useEffect(() => {
    if (!agentTheme.hasWorkspaceBackground || showLanding) setBackgroundControlsOpen(false);
  }, [agentTheme.hasWorkspaceBackground, showLanding]);
  const agentConversationVisible = !showLanding && !showMediaLibrary && !showGenerationTasks;
  const agentActivity = useAgentActivity(agentConversationVisible ? project?.id : undefined, auth.user?.id);
  const [routeReady, setRouteReady] = useState(false);
  const current = useRef<Project | null>(null);
  const adopt = useCallback((p: Project) => {
    if (current.current?.id === p.id && current.current.revision > p.revision) return;
    current.current = p;
    setProject(p);
  }, []);
  const adoptAgentUpdate = useCallback((next: Project) => {
    if (current.current?.id === next.id) adopt(next);
  }, [adopt]);
  const refreshList = useCallback(async () => {
    const [creatives, groups] = await Promise.all([api<ProjectSummary[]>('/api/projects'), api<WorkspaceProject[]>('/api/workspace/projects')]);
    setProjects(creatives); setProjectGroups(groups);
  }, []);
  const perform = async (label: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作未完成'); } finally { setBusy(''); }
  };
  const openConfiguration = () => setModal('config');
  useEffect(() => {
    if (!publicAuthRequired) return;
    current.current = null;
    setProject(null); setProjects([]); setProjectGroups([]);
    setLoadedAccount(''); setRouteReady(false);
    setError(''); setBootError(''); setNotice('');
    setOrganizationDialog(null); setAssetLibraryOpen(false); setInitialMedia(null);
  }, [workspaceAccount]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (publicAuthRequired && (!auth.initialized || !auth.session)) return;
        if (publicAuthRequired && auth.session) await syncPublicServerSession(auth.session.access_token);
        const [list, groups, modelStatus] = await Promise.all([api<ProjectSummary[]>('/api/projects'), api<WorkspaceProject[]>('/api/workspace/projects'), api<Status>('/api/status')]);
        let preferred = '';
        try { preferred = localStorage.getItem(recentProjectKey) || ''; } catch {}
        const route = parseRoute(window.location.pathname);
        const wanted = route?.kind === 'creative' ? route.id : '';
        const missing = !!wanted && !list.some(p => p.id === wanted);
        if (wanted && !missing) preferred = wanted;
        const activeProjects = list.filter(p => !p.archivedAt);
        const id = (wanted && !missing ? wanted : '') || activeProjects.find(p => p.id === preferred)?.id || activeProjects[0]?.id || list.find(p => p.id === preferred)?.id || list[0]?.id;
        const p = id ? await api<Project>(`/api/projects/${id}`) : await api<Project>('/api/projects', { method: 'POST', body: '{}' });
        const latestList = id ? list : await api<ProjectSummary[]>('/api/projects');
        if (!cancelled) {
          replaceNextUrl(); setStatus(modelStatus); adopt(p); setShowArchived(Boolean(p.archivedAt));
          if (route && route.kind !== 'landing') {
            setShowLanding(false);
            setShowMediaLibrary(route.kind === 'library');
            setShowGenerationTasks(route.kind === 'jobs');
          }
          if (missing) setError('链接中的创意不存在或已被删除，已为你打开默认创意。');
          setProjects(latestList); setProjectGroups(groups);
          setLoadedAccount(workspaceAccount); setRouteReady(true);
        }
      } catch (e) { if (!cancelled) setBootError(e instanceof Error ? e.message : '无法连接工作台'); }
    })();
    return () => { cancelled = true; };
  }, [adopt, auth.initialized, auth.session?.access_token, recentProjectKey, workspaceAccount]);
  useEffect(() => { if (workspaceVisible && project?.id) { try { localStorage.setItem(recentProjectKey, project.id); } catch {} } }, [workspaceVisible, project?.id, recentProjectKey]);
  useEffect(() => {
    if (!supabase) { setAuth({ ...initialAuthState, initialized: true }); return; }
    let cancelled = false;
    const callback = readAuthCallback();
    const applySession = (session: SailAuthState['session'], status = '', error = '') => {
      if (!cancelled) setAuth(current => ({ ...current, initialized: true, session, user: session?.user || null, status, error }));
    };
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      const failure = callback.error || error;
      applySession(data.session, callback.active && data.session ? '登录成功' : '', failure ? authErrorMessage(failure) : '');
      const requestedRoute = parseRoute(window.location.pathname);
      // Restoring a session must respect both landing URLs, including the root homepage.
      if (data.session && !callback.active && requestedRoute?.kind !== 'landing') { replaceNextUrl(); setShowLanding(false); }
      if (callback.active) {
        clearAuthCallback();
        if (data.session) { replaceNextUrl(); setProfileSetupPrompt(isNewUserFirstLogin(data.session.user)); setShowLanding(false); setAuthOpen(false); }
        else { setAuthOpen(true); if (!failure) setAuth(current => ({ ...current, error: '登录授权未完成，请重新开始登录。' })); }
      }
    }).catch(error => { if (!cancelled) { applySession(null, '', authErrorMessage(error)); if (callback.active) { clearAuthCallback(); setAuthOpen(true); } } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setAuth(current => ({ ...current, initialized: true, session, user: session?.user || null,
        ...(event === 'SIGNED_OUT' ? { status: pick(AUTH_TEXT).status.signedOut, error: '' } : {}) }));
      if (!session) { setProfileEditing(false); setProfileSetupPrompt(false); }
      if (publicAuthRequired && !session) { replaceNextUrl(); setShowLanding(true); }
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!publicAuthRequired || !auth.initialized) return;
    if (!auth.session) { void syncPublicServerSession(null).catch(() => {}); return; }
    void syncPublicServerSession(auth.session.access_token).catch(error => {
      setAuth(current => ({ ...current, error: error instanceof Error ? error.message : '登录状态同步失败，请重新登录。' }));
    });
  }, [auth.initialized, auth.session?.access_token]);
  useEffect(() => {
    if (!authOpen) return;
    let alive = true;
    void loadAuthAvailability().then(value => { if (alive) setAuthAvailability(value); }).catch(() => { if (alive) setAuthAvailability(unknownAuthAvailability); });
    return () => { alive = false; };
  }, [authOpen]);
  useEffect(() => {
    const tick = () => setAuthResendSeconds(Math.max(0, Math.ceil((authResendAt - Date.now()) / 1000)));
    tick(); if (authResendAt <= Date.now()) return;
    const timer = window.setInterval(() => { tick(); if (authResendAt <= Date.now()) window.clearInterval(timer); }, 1000);
    return () => window.clearInterval(timer);
  }, [authResendAt]);
  const signInWithGoogle = async () => {
    if (!supabase || authRequest.current) return;
    authRequest.current = true;
    setGoogleBusy(true);
    setAuth(current => ({ ...current, busy: true, error: '', status: pick(AUTH_TEXT).status.google }));
    try {
      const availability = await loadAuthAvailability();
      setAuthAvailability(availability);
      if (!availability.google) throw { code: 'google_unavailable' };
      const { data, error } = await withAuthTimeout(supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: authRedirectUrl(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      }));
      if (error) throw error;
      if (!data.url) throw new Error(pick(AUTH_TEXT).status.incomplete);
      window.location.assign(data.url);
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setGoogleBusy(false); setAuth(current => ({ ...current, busy: false })); }
  };
  const sendAuthCode = async () => {
    if (!supabase || authRequest.current || authResendAt > Date.now()) return;
    const email = authEmailValue.trim();
    if (!validEmail(email)) { setAuth(current => ({ ...current, error: pick(AUTH_TEXT).status.invalidEmail, status: '' })); return; }
    authRequest.current = true;
    setAuth(current => ({ ...current, busy: true, error: '', status: pick(AUTH_TEXT).status.sending }));
    try {
      const { error } = await withAuthTimeout(supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }));
      if (error) throw error;
      setAuthEmailValue(email); setAuthCode(''); setAuthStage('code'); setAuthResendAt(Date.now() + 60000);
      setAuth(current => ({ ...current, status: pick(AUTH_TEXT).status.sent, error: '' }));
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setAuth(current => ({ ...current, busy: false })); }
  };
  const verifyAuthCode = async () => {
    if (!supabase || authRequest.current || !validEmailCode(authCode)) return;
    authRequest.current = true;
    setAuth(current => ({ ...current, busy: true, error: '', status: pick(AUTH_TEXT).status.verifying }));
    try {
      const { data, error } = await withAuthTimeout(supabase.auth.verifyOtp({ email: authEmailValue.trim(), token: authCode, type: 'email' }));
      if (error) throw error;
      if (!data.session || !data.user) throw new Error(pick(AUTH_TEXT).status.incomplete);
      setProfileSetupPrompt(isNewUserFirstLogin(data.user));
      setAuth(current => ({ ...current, session: data.session, user: data.user, status: pick(AUTH_TEXT).status.success, error: '' }));
      setAuthCode(''); setAuthStage('email'); setAuthOpen(false); setShowLanding(false);
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setAuth(current => ({ ...current, busy: false })); }
  };
  const signOut = async () => {
    if (!supabase || authRequest.current) return;
    authRequest.current = true;
    setAuth(current => ({ ...current, busy: true, status: pick(AUTH_TEXT).status.signingOut, error: '' }));
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setAuth(current => ({ ...current, session: null, user: null, status: '已退出登录', error: '' }));
      setAuthCode(''); setAuthEmailValue(''); setAuthStage('email'); setAuthOpen(false);
    } catch (error) { setAuth(current => ({ ...current, status: '', error: authErrorMessage(error) })); }
    finally { authRequest.current = false; setAuth(current => ({ ...current, busy: false })); }
  };
  const openAuth = () => { setAuthOpen(true); setAuthStage(auth.user ? 'email' : authStage); setAuthEmailValue(authEmail(auth.user) || authEmailValue); };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !showLanding) {
        event.preventDefault();
        setSearchPaletteOpen(value => !value);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [showLanding]);
  const running = project?.job?.status === 'running';
  const updates = useWorkspaceUpdates(
    workspaceVisible && !showLanding ? project?.id : undefined,
    workspaceAccount,
    agentConversationVisible ? 'workspace' : 'sidebar',
    update => {
      if (update.type === 'activities') { agentActivity.receiveActivities(update.entries); return; }
      if (update.type === 'activity') { agentActivity.receiveActivityUpdate(update.id, update.activity); return; }
      if (update.type !== 'project') return;
      const next = update.project;
      const previous = current.current;
      if (!previous || previous.id !== next.id || previous.revision >= next.revision) return;
      adoptAgentUpdate(next);
      if (previous.job?.status === 'running' && next.job?.status !== 'running') {
        void refreshList().catch(error => setError(error.message));
        if (next.job?.status === 'completed') setNotice(next.job.message);
      }
    },
  );
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 3600); return () => clearTimeout(t); } }, [notice]);
  const switchProject = (id: string) => perform('正在打开创意', async () => {
    const next = await api<Project>(`/api/projects/${id}`);
    adopt(next);
    setShowLanding(false);
    setShowMediaLibrary(false);
    setShowGenerationTasks(false);
    setSidebarOpen(false);
  });
  const newProject = (parentId = current.current?.parentProjectId || projectGroups[0]?.id || '') => {
    setError('');
    setOrganizationDialog({ kind: 'creative-new', parentId, title: '' });
  };
  const submitOrganization = (title: string, parentId: string, skills: SkillSelection[] = []) => perform('正在保存', async () => {
    if (!organizationDialog) return;
    if (organizationDialog.kind === 'project-new') {
      const group = await api<WorkspaceProject>('/api/workspace/projects', { method: 'POST', body: JSON.stringify({ title }) });
      await refreshList(); setOrganizationDialog({ kind: 'creative-new', parentId: group.id, title: '' });
      return;
    }
    if (organizationDialog.kind === 'project-edit') {
      const group = projectGroups.find(item => item.id === parentId);
      if (!group) throw new Error('找不到这个项目，请刷新后再试。');
      await api<WorkspaceProject>(`/api/workspace/projects/${parentId}`, { method: 'PUT', body: JSON.stringify({ title, revision: group.revision }) });
      await refreshList();
    } else if (organizationDialog.kind === 'creative-edit') {
      const creative = current.current;
      if (!creative) return;
      const updated = await api<Project>(`/api/projects/${creative.id}`, {
        method: 'PUT', body: JSON.stringify({ revision: creative.revision, title, parentProjectId: parentId }),
      });
      adopt(updated);
      await refreshList();
    } else {
      const next = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ parentProjectId: parentId, title, skills }) });
      adopt(next);
      setShowMediaLibrary(false);
      setShowGenerationTasks(false);
      setShowArchived(false);
      setSidebarOpen(false);
      await refreshList();
    }
    setOrganizationDialog(null);
  });
  const setProjectArchived = (id: string, archived: boolean) => perform(archived ? '正在归档创意' : '正在恢复创意', async () => {
    const updated = await api<Project>(`/api/projects/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived }) });
    if (current.current?.id === id) adopt(updated);
    await refreshList();
    setNotice(archived ? '创意已归档，可在已归档创意中恢复' : '创意已恢复到所属工作空间');
  });
  const enterWorkspace = () => {
    if (publicAuthRequired && !auth.session) { setAuthOpen(true); return; }
    setShowLanding(false);
    setSidebarOpen(false);
    setShowMediaLibrary(false);
    setShowGenerationTasks(false);
  };
  const startAgentEntry = (prompt: string, files: File[] = []) => {
    if (busy || agentEntryStarting.current) return;
    pendingAgentFiles.current = files;
    try { sessionStorage.setItem('sail-agent-entry-prompt', prompt); } catch { /* The in-memory draft still works. */ }
    setPendingAgentPrompt(prompt);
  };
  const clearAgentEntry = () => {
    setPendingAgentPrompt(null);
    pendingAgentFiles.current = [];
    try { sessionStorage.removeItem('sail-agent-entry-prompt'); } catch { /* Storage is optional. */ }
  };
  useEffect(() => {
    if (pendingAgentPrompt === null || agentEntryStarting.current) return;
    if (publicAuthRequired && !auth.initialized) return;
    if (publicAuthRequired && !auth.session) { setAuthOpen(true); return; }
    if (!routeReady || !project || busy) return;
    agentEntryStarting.current = true;
    setBusy('正在准备 Agent 创意'); setError('');
    void (async () => {
      try {
        const title = pendingAgentPrompt.trim().replace(/\s+/g, ' ').slice(0, 40) || (getLang() === 'en' ? 'New creative' : '新的创意');
        const parentProjectId = current.current?.parentProjectId;
        let next = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ title, ...(parentProjectId ? { parentProjectId } : {}) }) });
        for (const file of pendingAgentFiles.current) {
          const mediaKind = promptMediaKind(file);
          if (!mediaKind) throw new Error('不支持的附件类型，请选择视频、图片或音频。');
          const kind = mediaKind === 'image' ? 'product' : mediaKind;
          const body = new FormData(); body.append('file', file);
          next = await api<Project>(`/api/projects/${next.id}/assets/${kind}`, { method: 'POST', body });
        }
        if (pendingAgentFiles.current.length) mediaChanged();
        adopt(next);
        setLandingMode('agent');
        setShowMediaLibrary(false);
        setShowGenerationTasks(false);
        setShowArchived(false);
        setAgentEntryDraft({ id: crypto.randomUUID(), text: pendingAgentPrompt });
        clearAgentEntry(); setAuthOpen(false); setShowLanding(false); setSidebarOpen(false);
        void refreshList().catch(() => {});
      } catch (failure) {
        clearAgentEntry();
        setError(failure instanceof Error ? failure.message : '创作空间暂时无法打开，请重试。');
      } finally { agentEntryStarting.current = false; setBusy(''); }
    })();
  }, [pendingAgentPrompt, auth.initialized, auth.session?.user.id, routeReady, project?.id, busy, adopt, refreshList]);
  const openAssetLibrary = (item: LibraryMedia | null = null) => {
    setInitialMedia(item);
    setAssetLibraryOpen(true);
  };
  const referenceMedia = async (item: LibraryMedia) => {
    if (busy || running) throw new Error('当前创意正在处理，请等待完成后引用素材。');
    const kind = item.kind === 'video' ? 'video' : 'product';
    setBusy('正在引用素材'); setError('');
    try {
      const p = current.current; if (!p) throw new Error('请先打开一个创意。');
      if (p.archivedAt) throw new Error('请先恢复当前创意，再引用素材。');
      if (kind === 'product' && p.assets.filter(asset => asset.kind === 'product').length >= 3) throw new Error('最多使用 3 张产品/主体参考图，请先移除一张。');
      let updated: Project;
      if (item.filename) updated = await api<Project>(`/api/projects/${p.id}/library-assets`, { method: 'POST', body: JSON.stringify({ mediaId: item.id }) });
      else {
        const file = await libraryFile(item);
        const form = new FormData(); form.append('file', file);
        updated = await api<Project>(`/api/projects/${p.id}/assets/${kind}?source=library`, { method: 'POST', body: form });
      }
      adopt(updated); setShowMediaLibrary(false); setShowGenerationTasks(false); mediaChanged();
      await refreshList(); setNotice('素材已添加到当前创意');
    } finally { setBusy(''); }
  };
  const applyRoute = async (route: AppRoute) => {
    if (route.kind === 'landing') {
      setLandingMode(route.mode || 'home');
      setShowLanding(true);
      return;
    }
    if (publicAuthRequired && !auth.session) { setShowLanding(true); setAuthOpen(true); return; }
    setShowLanding(false);
    setSidebarOpen(false);
    if (route.kind === 'creative' && route.id !== current.current?.id) {
      await switchProject(route.id);
      return;
    }
    setShowMediaLibrary(route.kind === 'library');
    setShowGenerationTasks(route.kind === 'jobs');
  };
  const openGenerationTasks = () => {
    setShowLanding(false);
    setShowMediaLibrary(false);
    setShowGenerationTasks(true);
    setSidebarOpen(false);
  };
  const viewRoute: AppRoute | null = showLanding
    ? { kind: 'landing', ...(landingMode === 'agent' ? { mode: 'agent' as const } : {}) }
    : showGenerationTasks ? { kind: 'jobs' } : showMediaLibrary ? { kind: 'library' }
    : project ? { kind: 'creative', id: project.id } : null;
  const viewTitle = !viewRoute || viewRoute.kind === 'landing'
    ? `${appTitle} · ${landingMode === 'agent' ? 'Agent 创作空间' : '跨境内容工作台'}`
    : viewRoute.kind === 'jobs' ? `任务进度 · ${appTitle}`
    : viewRoute.kind === 'library' ? `所有媒体 · ${appTitle}`
    : `${project?.title.trim() || '未命名创意'} · 创作 Agent · ${appTitle}`;
  useUrlSync({ path: viewRoute ? routePath(viewRoute) : '', title: viewTitle, ready: routeReady && workspaceVisible, paused: !!busy && !showLanding && !showGenerationTasks, onRoute: applyRoute });

  const L = useDict(LANDING);
  const accountName = authDisplayName(auth.user);
  const profileName = accountName && accountName !== authEmail(auth.user) ? accountName : '';
  const profileDialog = profileWelcomeOpen && auth.user ? <WelcomeProfileDialog key={auth.user.id} user={auth.user} avatarUrl={accountAvatar} firstRun={profileSetupPrompt && needsProfileSetup(auth.user)} onCancel={() => { setProfileEditing(false); setProfileSetupPrompt(false); }} onComplete={user => {
    setAuth(current => current.user?.id === user.id ? { ...current, user, session: current.session ? { ...current.session, user } : null } : current);
    setProfileEditing(false); setProfileSetupPrompt(false); setAuthOpen(false); setShowLanding(false);
  }} /> : null;
  const authDialog = <AuthDialog availability={authAvailability} googleBusy={googleBusy} onGoogleSignIn={() => { void signInWithGoogle(); }} resendSeconds={authResendSeconds} avatarUrl={accountAvatar} bloub={accountBloub} onEditProfile={() => { setAuthOpen(false); setProfileEditing(true); }} open={authOpen && !profileWelcomeOpen} onClose={() => { clearAgentEntry(); setAuthOpen(false); }} auth={auth} email={authEmailValue} code={authCode} stage={authStage} onEmailChange={setAuthEmailValue} onCodeChange={setAuthCode} onSendCode={() => { void sendAuthCode(); }} onVerifyCode={() => { void verifyAuthCode(); }} onBack={() => { setAuthStage('email'); setAuthCode(''); setAuth(current => ({ ...current, error: '', status: '' })); }} onSignOut={() => { void signOut(); }} />;
  if (publicAuthRequired && !auth.initialized) return <div className="boot-screen"><LoaderCircle className="spin" /><p>{L.boot.restoring}</p></div>;
  if ((showLanding || (publicAuthRequired && !auth.session)) && landingMode === 'agent') return <>
    <Suspense fallback={<div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#fff', color: '#252722' }}><LoaderCircle className="spin" size={22} aria-label="正在打开 Agent 创作首页" /></div>}>
      <AgentLandingPage onStart={startAgentEntry} onAccount={openAuth} accountName={auth.user ? authDisplayName(auth.user) : undefined} busy={!!busy || pendingAgentPrompt !== null} error={error || bootError} />
    </Suspense>
    {profileDialog}
    {authDialog}
  </>;
  if (showLanding || (publicAuthRequired && !auth.session)) return <div className="landing-page landing-dark landing-prompt-page landing-vgpu-page">
    <LandingAnnouncement onEnter={() => enterWorkspace()} />
    <header className="landing-nav">
      <button className="landing-brand" onClick={() => setShowLanding(true)} aria-label={L.nav.home}><img className="landing-brand-logo" src="/assets/brand/sail-mark-dark-bold.svg" alt="" width={30} height={30} /><ScrollBrand /></button>
      <nav className="landing-links" aria-label={L.nav.aria}>
        <a href="#tools">Products</a>
        <a href="/research">Research</a>
        <a href="/lab">Lab</a>
        <a href="/research/article">Resources</a>
      </nav>
      <div className="landing-social">
        <LanguageSwitch />
        <button type="button" className="landing-account" onClick={openAuth} title={profileName || undefined}>
          {auth.user ? (accountBloub ? <BloubAvatar size={26} shape={accountBloub.shape} color={accountBloub.color} expression={accountBloub.expression} framed frozenAt={0} /> : <img src={accountAvatar} alt="" />) : <UserRound size={16} aria-hidden="true" />}
          <span>{auth.user ? profileName || L.nav.account : L.nav.signIn}</span>
        </button>
      </div>
    </header>
    <LandingPromptHero onStart={startAgentEntry} busy={!!busy || pendingAgentPrompt !== null} error={error || bootError} />
    <LandingHero headingLevel={2} authRequired={publicAuthRequired} onEnter={enterWorkspace} onStart={startAgentEntry} busy={!!busy || pendingAgentPrompt !== null} />
    <LandingSections onEnter={() => enterWorkspace()} />
    <LandingToc />
    <footer className="gf-footer"><nav><a href="#create">{L.footer.top}</a><button onClick={() => enterWorkspace()}>{L.footer.enter}</button></nav></footer>
    <LandingPlayground />
    <LandingPageEditor accountKey={auth.user?.id || ''} />
    {profileDialog}
    {authDialog}
  </div>;
  if (!project || !workspaceVisible) return <div className="boot-screen"><div className="brand-icon"><img src="/assets/brand/sail-mark-dark.svg" alt="" /></div><h1>AI Creative Lab</h1>{bootError ? <><p className="error-text">{bootError}</p><button className="btn" onClick={() => location.reload()}>重新连接</button></> : <><LoaderCircle className="spin" /><p>正在打开工作台…</p></>}{profileDialog}</div>;
  const disabled = !!busy || running;
  const parentProject = projectGroups.find(group => group.id === project.parentProjectId);
  const sidebarIsCollapsed = sidebarCollapsed && !sidebarOpen;
  const editParentProject = (group: WorkspaceProject) => { setError(''); setOrganizationDialog({ kind: 'project-edit', parentId: group.id, title: group.title }); };
  const editCreative = () => { setError(''); setOrganizationDialog({ kind: 'creative-edit', parentId: project.parentProjectId || '', title: project.title }); };
  const shellTheme = agentTheme.chatTheme;
  const studioWhiteShell = shellTheme === 'studio-white';
  const shellThemeClass = shellTheme && !studioWhiteShell ? 'agent-shell-surface intelligent-ui-surface' : '';
  const agentWorkflow = agentConversationVisible;
  const sharedAgentBackground = agentWorkflow && agentTheme.hasWorkspaceBackground;
  const chatBackground = sharedAgentBackground && agentTheme.usesBackground('chat');
  return <div className={`app-shell ${agentWorkflow && !studioWhiteShell ? 'workflow-dark' : ''} ${sidebarIsCollapsed ? 'sidebar-collapsed' : ''}`} data-agent-theme={shellTheme} data-agent-background={sharedAgentBackground ? 'on' : 'off'} style={sharedAgentBackground ? agentTheme.backgroundStyle : undefined}>
    {(sharedAgentBackground || backgroundControlsOpen) && <div className="agent-global-background"><LandingBackground storageKey="sail-workspace-bg-v1" uiStorageKey="sail-workspace-bg-ui-v1" onBaseColorChange={agentTheme.setBackgroundBase} controlsOpen={backgroundControlsOpen} onControlsClose={closeBackgroundControls} backgroundEnabled={sharedAgentBackground} /></div>}
    {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside id="workspace-sidebar" aria-label="工作区导航" className={`sidebar ${shellTheme ? 'agent-shell-surface intelligent-ui-surface' : ''} ${sidebarOpen ? 'open' : ''}`} {...(shellTheme ? agentTheme.regionProps('sidebar', sharedAgentBackground) : undefined)}>
      <div className="sidebar-brand-row"><a className="brand" href="/" title="回到门户首页" aria-label="AI Creative Lab，回到门户首页" onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setSidebarOpen(false);
        setLandingMode('home');
        setShowLanding(true);
        window.scrollTo(0, 0);
      }}><span className="brand-compact" aria-hidden="true">CL</span><div className="brand-icon"><img src="/assets/brand/sail-mark-dark.svg" alt="" width={40} height={40} /></div><div><strong>AI Creative Lab</strong><span>跨境内容工作台</span></div><Badge>V1</Badge></a><button className="icon-btn sidebar-toggle sidebar-collapse-toggle" aria-label={sidebarIsCollapsed ? '展开侧边栏' : '收起侧边栏'} title={sidebarIsCollapsed ? '展开侧边栏' : '收起侧边栏'} aria-expanded={!sidebarIsCollapsed} aria-controls="workspace-sidebar" onClick={() => { setSidebarOpen(false); setSidebarCollapsed(!sidebarIsCollapsed); }}><SidebarToggleIcon expanded={!sidebarIsCollapsed} /></button></div>
      <button type="button" className="sidebar-new-session" aria-label="新建会话" title="新建会话" disabled={!!busy} onClick={() => newProject()}><MessageCirclePlus size={18} strokeWidth={1.7} aria-hidden="true" /><span>New Session</span></button>
      <div className="workspace-picker" title={defaultWorkspace.title}><span className="workspace-avatar workspace-brand-avatar"><AnimatedBrandMark /></span><span>{defaultWorkspace.title}<small>工作空间与创意</small></span></div>
      <button type="button" className={`nav-item sidebar-media-button ${showMediaLibrary ? 'active' : ''}`} aria-label="所有媒体" title="所有媒体" aria-pressed={showMediaLibrary} disabled={!!busy} onClick={() => { setShowGenerationTasks(false); setShowMediaLibrary(true); setSidebarOpen(false); }}><Grid2X2 size={18} /><span>所有媒体</span></button>
      <button type="button" className={`nav-item sidebar-generation-button ${showGenerationTasks ? 'active' : ''}`} aria-label="任务进度" title="任务进度" aria-pressed={showGenerationTasks} onClick={openGenerationTasks}><ListChecks size={18} /><span>任务进度</span></button>
      <a href="/research" className="nav-item sidebar-research-button" title="Research" aria-label="Research"><BookOpen size={18} /><span>Research</span></a>
      <ProjectNavigation collapsed={sidebarIsCollapsed} onExpand={() => { setSidebarCollapsed(false); }} onSearch={() => setSearchPaletteOpen(true)} groups={projectGroups} creatives={projects} currentId={showGenerationTasks ? '' : project.id} currentParentId={project.parentProjectId} busy={!!busy} running={running} showArchived={showArchived} onShowArchived={setShowArchived}
        agentActivities={agentActivity.activities} unreadIds={agentActivity.unreadIds}
        onNewProject={() => { setError(''); setOrganizationDialog({ kind: 'project-new', parentId: '', title: '' }); }} onRenameProject={editParentProject} onNewCreative={parentId => newProject(parentId)} onSelect={switchProject} onArchive={setProjectArchived} />
      <div className="sidebar-footer-row"><AgentThemePicker theme={agentTheme} backgroundControlsOpen={backgroundControlsOpen} onOpenBackgroundControls={() => { setBackgroundControlsOpen(true); setSidebarOpen(false); }} /><button className="sidebar-config" title="配置" aria-label="配置" onClick={openConfiguration}><Settings size={16} /><span>配置</span></button></div>
    </aside>
    {searchPaletteOpen && <WorkspaceSearchPalette creatives={projects} groups={projectGroups} busy={!!busy} onChoose={id => { setShowArchived(false); void switchProject(id); }} onCreateCreative={() => { setError(''); newProject(); }} onCreateProject={() => { setError(''); setOrganizationDialog({ kind: 'project-new', parentId: '', title: '' }); }} onClose={() => setSearchPaletteOpen(false)} />}
    <div className="main-shell">
      <header className={`topbar ${chatBackground ? 'agent-shell-surface intelligent-ui-surface' : shellThemeClass}`} data-theme={shellTheme} data-region-background={chatBackground ? 'on' : undefined} style={chatBackground ? agentTheme.backgroundStyle : undefined}><div className="topbar-leading"><button className="icon-btn sidebar-toggle mobile-menu" aria-label={sidebarOpen ? '关闭导航' : '打开导航'} title={sidebarOpen ? '关闭导航' : '打开导航'} aria-expanded={sidebarOpen} aria-controls="workspace-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}><SidebarToggleIcon expanded={sidebarOpen} /></button><span className="topbar-leading-divider" aria-hidden="true" /><div className="breadcrumbs">{showGenerationTasks ? <><ListChecks size={16} /><span>{defaultWorkspace.title}</span><ChevronRight size={14} /><span className="breadcrumb-current">任务进度</span></> : <><FolderOpen size={16} /><span>{defaultWorkspace.title}</span><ChevronRight size={14} /><button className="breadcrumb-project" onClick={() => parentProject && editParentProject(parentProject)} disabled={!!busy} title="重命名工作空间">{parentProject?.title || '默认项目'}</button><ChevronRight size={14} /><button className="breadcrumb-current breadcrumb-creative" onClick={editCreative} disabled={disabled} title="编辑创意名称与所属工作空间">{project.title}</button></>}</div></div><div className="topbar-actions">
        {agentConversationVisible && taskAssetSummary?.projectId === project.id && <button type="button" className="btn small topbar-task-assets" title="当前任务素材" aria-label="当前任务素材" aria-expanded={taskAssetsProjectId === project.id} aria-controls="iua-task-assets" onClick={() => setTaskAssetsProjectId(current => current === project.id ? null : project.id)}>
          <Package size={15} aria-hidden="true" /><span>当前任务素材</span><span className="task-assets-count" aria-hidden="true">{taskAssetSummary.count}</span>
        </button>}
        <button type="button" className="btn small topbar-assets" disabled={disabled} onClick={() => openAssetLibrary()} title="素材库" aria-label="素材库"><FolderOpen size={15} /><span>素材库</span></button>
        <span className="topbar-divider" />
        <LanguageSwitch />
        <button className="account-chip" onClick={openAuth}><span>{auth.user ? (accountBloub ? <BloubAvatar size={24} shape={accountBloub.shape} color={accountBloub.color} expression={accountBloub.expression} framed frozenAt={0} /> : <img src={accountAvatar} alt="" />) : (accountBloub ? <BloubAvatar size={24} shape={accountBloub.shape} color={accountBloub.color} expression={accountBloub.expression} framed frozenAt={0} /> : <Mail size={14} />)}</span>{auth.user ? authDisplayName(auth.user) : '登录'}</button>
      </div></header>
      <main className={showGenerationTasks ? 'generation-workspace-main' : showMediaLibrary ? 'media-workspace-main' : 'canvas-workspace-main'}>
        {showGenerationTasks ? <GenerationTasks theme={shellTheme} busy={!!busy} onOpenCreative={id => { void switchProject(id); }} /> : showMediaLibrary ? <MediaLibraryPage user={auth.user} onSelect={item => openAssetLibrary(item)} onUpload={() => openAssetLibrary()} onSignIn={openAuth} /> : <>
        {project.archivedAt && <div className="banner sample"><Archive size={16} /><span>此创意已归档，素材和制作结果仍保存在本机。</span><button disabled={!!busy || running} onClick={() => setProjectArchived(project.id, false)}>恢复到所属工作空间 <ArchiveRestore size={14} /></button></div>}
        {error && <div className="banner error" role="alert"><Info size={16} /><span>{error}</span><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16} /></button></div>}
        <div className="unified-workspace">
          <div className="agent-canvas-shell"><Suspense fallback={<div className="agent-chat" aria-label="加载创作 Agent" />}><IntelligentUIAgentWorkspace key={project.id} theme={agentTheme} workspaceBackgroundAvailable={sharedAgentBackground} project={project} disabled={disabled} steerDisabled={!!busy} onProjectUpdate={adoptAgentUpdate} onActivity={agentActivity.receiveActivity} liveAgent={updates?.agent} connected={updates?.connected} historyError={updates?.historyError} taskAssetsOpen={taskAssetsProjectId === project.id} onOpenTaskAssets={() => setTaskAssetsProjectId(project.id)} onCloseTaskAssets={closeTaskAssets} onTaskAssetCountChange={receiveTaskAssetCount} entryDraft={agentEntryDraft} onEntryDraftConsumed={consumeAgentEntryDraft} bloubConfig={accountBloub} /></Suspense></div>
        </div>
        </>}
      </main>
    </div>
    {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
    {busy && <div className="busy-indicator" role="status"><LoaderCircle className="spin" size={14} />{busy}</div>}
    {organizationDialog && <OrganizationForm key={`${organizationDialog.kind}:${organizationDialog.parentId}`} dialog={organizationDialog} groups={projectGroups} busy={!!busy} error={error} onSubmit={submitOrganization} onClose={() => { if (!busy) setOrganizationDialog(null); }} />}
    {modal === 'config' && <Modal title="配置" onClose={() => setModal(null)}>
      <section className="configuration-analysis" aria-labelledby="configuration-analysis-title">
        <div className="configuration-analysis-heading"><strong id="configuration-analysis-title">视频拆解模型</strong><small>跟随当前创意的 Agent</small></div>
        <p>从 Agent 对话的模型菜单切换。参考视频在本地抽帧，再由所选模型分析。</p>
      </section>
      <div className="configuration-options">
        <button className="configuration-option" onClick={() => setModal('settings')}><Sparkles size={18} /><span><strong>模型与图片生成</strong><small>{status.imageGeneration?.configured ? '模型已配置' : '配置模型连接'}</small></span><ChevronRight size={16} /></button>
      </div>
      <p className="configuration-local-note"><ShieldCheck size={14} />工作空间与创意资料保存在本机</p>
    </Modal>}
    {modal === 'settings' && <Modal title="模型连接" onClose={() => { setModal(null); setImageApiKey(''); setOmniApiKey(''); setStorageKey(''); }}>
      <div className="settings-model"><span className="model-symbol"><ImagePlus size={22} /></span><div><h3>图片生成 · 创作素材与关键帧</h3><code>{status.imageGeneration?.model || DEFAULT_IMAGE_MODEL}</code></div><Badge>{status.imageGeneration?.configured ? '已配置' : '待连接'}</Badge></div>
      <p className="modal-description">创作 Agent 使用这里配置的图片服务生成素材和场景关键帧。</p>
      <Field label="图片生成 API Key"><Input type="password" autoComplete="off" spellCheck={false} placeholder={status.imageGeneration?.configured ? '已配置，更新时再填写' : '输入图片渠道 Key'} value={imageApiKey} onChange={e => setImageApiKey(e.target.value)} /></Field>
      <Field label="图片生成接口地址"><Input type="url" autoComplete="off" spellCheck={false} placeholder={status.imageGeneration?.baseUrl || 'https://api.qzftech.top/v1'} value={imageBaseUrl} onChange={e => setImageBaseUrl(e.target.value)} /></Field>
      <Field label="图片模型"><select className="input" value={imageModel || status.imageGeneration?.model || DEFAULT_IMAGE_MODEL} onChange={e => setImageModel(e.target.value)}>{(status.imageGeneration?.models || IMAGE_MODELS).map(model => <option key={model} value={model}>{model}</option>)}</select></Field>
      <p className="modal-description">可选模型：Flare 2.6、Sunburst 2.6。这里选择单次请求使用的模型；失败后不会自动降级重发。</p>
      <details className="creative-details"><summary>Omni 视频与参考素材存储</summary>
      <div className="settings-model"><span className="model-symbol"><Clapperboard size={22} /></span><div><h3>Omni Flash 1.2</h3><code>omni_flash-1.2 · 720p</code></div><Badge>{status.videoGeneration.configured ? '已配置' : '待连接'}</Badge></div>
      <Field label="视频服务 API Key"><Input type="password" autoComplete="off" spellCheck={false} placeholder="输入 gaorui.cc 的 API Key" value={omniApiKey} onChange={e => setOmniApiKey(e.target.value)} /></Field>
      <div className="settings-model"><span className="model-symbol"><ImagePlus size={22} /></span><div><h3>Supabase 私有素材存储</h3><code>参考图片与视频使用临时链接</code></div><Badge>{status.keyframeStorage?.configured ? '已配置' : '待连接'}</Badge></div>
      <Field label="Supabase 项目地址" hint="默认沿用当前项目的 Supabase 地址。"><Input type="url" autoComplete="off" value={storageUrl || status.keyframeStorage?.url || ''} placeholder="https://your-project.supabase.co" onChange={event => setStorageUrl(event.target.value)} /></Field>
      <Field label="Supabase 服务端存储密钥" hint="填写 secret key 或 service_role key；只保存到服务端内存，重启后需重新填写。"><Input type="password" autoComplete="off" spellCheck={false} value={storageKey} placeholder={status.keyframeStorage?.configured ? '已配置，更新时再填写' : '输入服务端密钥'} onChange={event => setStorageKey(event.target.value)} /></Field>
      <Field label="存储桶名称"><Input autoComplete="off" value={storageBucket || status.keyframeStorage?.bucket || 'sop-keyframes'} onChange={event => setStorageBucket(event.target.value)} /></Field>
      <div className="settings-note"><ShieldCheck size={16} /><p>Omni 使用私有存储桶中的临时链接读取参考素材。任务 ID 会保存到本机，供后续查询和恢复。</p></div>
      </details>
      <div className="modal-actions"><a href="https://gaoruitech.apifox.cn/doc-8842676" target="_blank" rel="noreferrer">Omni 接口文档 <ArrowUpRight size={14} /></a><button className="btn primary" disabled={!!busy || (imageApiKey.trim().length < 16 && !imageModel && omniApiKey.trim().length < 16 && storageKey.trim().length < 16)} onClick={() => perform('正在配置', async () => { if (imageApiKey.trim() || imageModel || imageBaseUrl.trim()) await api('/api/settings/image-generation', { method: 'POST', body: JSON.stringify({ ...(imageApiKey.trim() ? { apiKey: imageApiKey } : {}), ...(imageBaseUrl.trim() ? { baseUrl: imageBaseUrl } : {}), model: imageModel || status.imageGeneration?.model || DEFAULT_IMAGE_MODEL }) }); if (omniApiKey.trim()) await api('/api/settings/omni', { method: 'POST', body: JSON.stringify({ apiKey: omniApiKey }) }); if (storageKey.trim()) await api('/api/settings/keyframe-storage', { method: 'POST', body: JSON.stringify({ url: storageUrl || status.keyframeStorage?.url, apiKey: storageKey, bucket: storageBucket || status.keyframeStorage?.bucket || 'sop-keyframes' }) }); setStatus(await api<Status>('/api/status')); setImageApiKey(''); setImageModel(''); setImageBaseUrl(''); setOmniApiKey(''); setStorageKey(''); setModal(null); setNotice('模型连接已配置'); })}>保存连接</button></div>
    </Modal>}
    <AssetLibrary open={assetLibraryOpen} user={auth.user} project={project} workspaceProject={parentProject} target="all" initialSelection={initialMedia} onClose={() => { setAssetLibraryOpen(false); }} onReference={referenceMedia} onSignIn={() => { setAssetLibraryOpen(false); openAuth(); }} />
    {profileDialog}
    {authDialog}
  </div>;
}
