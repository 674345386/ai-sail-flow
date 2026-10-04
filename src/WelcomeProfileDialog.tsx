import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@supabase/supabase-js';
import { Check, LoaderCircle, Pencil, Upload, X } from 'lucide-react';
import { authDisplayName } from './auth';
import { defaultAvatars, prepareAvatar, saveUserProfile, type AvatarChoice } from './userProfile';
import './welcome-profile.css';

export default function WelcomeProfileDialog({ user, avatarUrl, firstRun, onComplete, onCancel }: {
  user: User; avatarUrl: string; firstRun: boolean; onComplete: (user: User) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(() => firstRun ? user.email || authDisplayName(user) : authDisplayName(user));
  const [selected, setSelected] = useState(() => firstRun ? defaultAvatars[0].id : 'existing');
  const [upload, setUpload] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLFormElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const cancel = useRef(onCancel); cancel.current = onCancel;
  const uploadedUrl = useMemo(() => upload ? URL.createObjectURL(upload) : '', [upload]);
  useEffect(() => () => { if (uploadedUrl) URL.revokeObjectURL(uploadedUrl); }, [uploadedUrl]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !firstRun && !saving.current) { event.preventDefault(); cancel.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type="file"])') || []];
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [firstRun]);
  const preview = selected === 'custom' ? uploadedUrl : selected === 'existing' ? avatarUrl : defaultAvatars.find(item => item.id === selected)!.url;
  const chooseUpload = async (file?: File) => {
    if (!file || saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { setUpload(await prepareAvatar(file)); setSelected('custom'); }
    catch (error) { setError(error instanceof Error ? error.message : '头像处理失败，请重试。'); }
    finally { saving.current = false; setBusy(false); }
  };
  const save = async () => {
    if (saving.current || !name.trim()) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const avatar: AvatarChoice = selected === 'existing' ? { kind: 'existing' } : selected === 'custom' && upload ? { kind: 'upload', blob: upload } : { kind: 'preset', url: preview };
      onComplete(await saveUserProfile(user, name, avatar));
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。'); }
    finally { saving.current = false; setBusy(false); }
  };
  return createPortal(<div className="profile-welcome-backdrop">
    <form className="profile-welcome-card" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="profile-welcome-title" aria-busy={busy} onSubmit={event => { event.preventDefault(); void save(); }}>
      {!firstRun && <button className="profile-welcome-close" type="button" aria-label="关闭个人资料" disabled={busy} onClick={onCancel}><X size={18} /></button>}
      <div className="profile-welcome-art" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="profile-welcome-portrait"><img src={preview} alt="当前选择的头像" /><button type="button" title="上传头像" aria-label="上传头像" disabled={busy} onClick={() => fileInput.current?.click()}><Pencil size={14} /></button></div>
      <h1 id="profile-welcome-title">{firstRun ? '欢迎使用 AI-Sail Flow！' : '让大家认识你'}</h1>
      <p className="profile-welcome-intro">{firstRun ? '从一个名字开始，让创意有你的色彩。' : '选择头像，也可以换一个喜欢的名字。'}</p>
      <label className="profile-welcome-name"><span>你的名称</span><div><input ref={nameInput} value={name} maxLength={254} autoComplete="nickname" disabled={busy} required onChange={event => setName(event.target.value)} aria-describedby="profile-name-hint" /><button type="button" aria-label="编辑名称" disabled={busy} onClick={() => { nameInput.current?.focus(); nameInput.current?.select(); }}><Pencil size={16} /></button></div></label>
      <p id="profile-name-hint" className="profile-welcome-hint">点击名称即可编辑，之后也可以在账号中修改。</p>
      <fieldset className="profile-welcome-avatars" disabled={busy}><legend>挑一个喜欢的头像</legend><div className="profile-avatar-grid">
        {defaultAvatars.map(avatar => <button key={avatar.id} type="button" className={selected === avatar.id ? 'is-selected' : ''} aria-label={avatar.name} aria-pressed={selected === avatar.id} title={avatar.name} onClick={() => setSelected(avatar.id)}><img src={avatar.url} alt="" />{selected === avatar.id && <span className="profile-avatar-check"><Check size={11} strokeWidth={3} /></span>}</button>)}
        {!firstRun && <button type="button" className={selected === 'existing' ? 'is-selected' : ''} aria-label="原来的头像" aria-pressed={selected === 'existing'} title="原来的头像" onClick={() => setSelected('existing')}><img src={avatarUrl} alt="" />{selected === 'existing' && <span className="profile-avatar-check"><Check size={11} strokeWidth={3} /></span>}</button>}
        {upload && <button type="button" className={selected === 'custom' ? 'is-selected' : ''} aria-label="上传的头像" aria-pressed={selected === 'custom'} onClick={() => setSelected('custom')}><img src={uploadedUrl} alt="" />{selected === 'custom' && <span className="profile-avatar-check"><Check size={11} strokeWidth={3} /></span>}</button>}
        <button className="profile-avatar-upload" type="button" aria-label="上传自定义头像" title="上传自定义头像" onClick={() => fileInput.current?.click()}><Upload size={19} /></button>
      </div></fieldset>
      <input type="file" ref={fileInput} hidden accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void chooseUpload(file); }} />
      <p className="profile-upload-hint">可上传 JPG、PNG、WebP 图片，最大 5 MB。</p>
      {error && <p className="profile-welcome-error" role="alert">{error}</p>}
      <div className="profile-welcome-actions">{!firstRun && <button type="button" disabled={busy} onClick={onCancel}>取消</button>}<button className="profile-welcome-submit" type="submit" disabled={busy || !name.trim()}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? '正在保存…' : firstRun ? '完成，开始创作' : '保存资料'}</button></div>
    </form>
  </div>, document.body);
}
