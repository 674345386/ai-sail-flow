import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { FolderOpen, Image as ImageIcon, LoaderCircle, Search, Upload, Video, X } from 'lucide-react';
import { supabase } from './auth';
import './asset-library.css';

const BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET?.trim() || 'ai-sail-flow-files';
type LibraryKind = 'image' | 'video';
type LibraryItem = { name: string; metadata: Record<string, unknown> | null; created_at?: string };

function itemKind(item: LibraryItem): LibraryKind | null {
  const type = String(item.metadata?.mimetype || item.metadata?.contentType || '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return null;
}

function itemTitle(item: LibraryItem) {
  const name = item.name.replace(/^[0-9a-f-]{36}-/i, '');
  return String(item.metadata?.originalName || name);
}

function storagePath(userId: string, item: LibraryItem) {
  return `${userId}/${item.name}`;
}

function safeObjectName(filename: string) {
  return filename.normalize('NFC').replace(/[\\/\0-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 180) || 'untitled';
}

export default function AssetLibrary({ open, user, kind, onClose, onSelect }: {
  open: boolean;
  user: User | null;
  kind: LibraryKind;
  onClose: () => void;
  onSelect: (file: File) => void;
}) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user) return;
    setBusy(true); setError('');
    const { data, error: listError } = await supabase.storage.from(BUCKET).list(user.id, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (listError) setError(listError.message);
    else setItems((data || []) as LibraryItem[]);
    setBusy(false);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setSelected(null); setPreviewUrl(''); setQuery('');
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open || !user || !selected || !supabase) { setPreviewUrl(''); return; }
    let alive = true;
    void supabase.storage.from(BUCKET).createSignedUrl(storagePath(user.id, selected), 300)
      .then(({ data, error: linkError }) => {
        if (!alive) return;
        if (linkError) setError(linkError.message);
        else setPreviewUrl(data.signedUrl);
      });
    return () => { alive = false; };
  }, [open, selected, user]);

  const visible = useMemo(() => items
    .filter(item => itemKind(item) === kind)
    .filter(item => itemTitle(item).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [items, kind, query]);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !supabase || !user) return;
    const expected = kind === 'image' ? 'image/' : 'video/';
    if (!file.type.startsWith(expected)) { setError(kind === 'image' ? '请选择图片文件。' : '请选择视频文件。'); return; }
    const limit = kind === 'image' ? 10 : 250;
    if (file.size > limit * 1024 * 1024) { setError(`文件不能超过 ${limit} MB。`); return; }
    setBusy(true); setError('');
    const name = `${crypto.randomUUID()}-${safeObjectName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(`${user.id}/${name}`, file, {
      cacheControl: '3600', contentType: file.type, upsert: false,
      metadata: { originalName: file.name, mediaKind: kind },
    });
    if (uploadError) { setError(uploadError.message); setBusy(false); return; }
    await refresh();
    setSelected({ name, metadata: { mimetype: file.type, originalName: file.name } });
  };

  const addToProject = async () => {
    if (!supabase || !user || !selected) return;
    setBusy(true); setError('');
    const { data, error: downloadError } = await supabase.storage.from(BUCKET).download(storagePath(user.id, selected));
    if (downloadError) { setError(downloadError.message); setBusy(false); return; }
    const file = new File([data], itemTitle(selected), { type: data.type || (kind === 'image' ? 'image/jpeg' : 'video/mp4') });
    setBusy(false);
    onSelect(file);
  };

  if (!open) return null;
  return <div className="asset-library-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="asset-library" role="dialog" aria-modal="true" aria-labelledby="asset-library-title">
      <header className="asset-library-header">
        <div><span className="asset-library-kicker">AI-SAIL FLOW · CLOUD ASSETS</span><h2 id="asset-library-title">快捷素材库</h2></div>
        <button className="asset-library-close" type="button" onClick={onClose} aria-label="关闭素材库"><X size={19} /></button>
      </header>
      <div className="asset-library-toolbar">
        <label className="asset-library-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索素材" /></label>
        <button className="btn small asset-library-upload" type="button" disabled={busy} onClick={() => input.current?.click()}><Upload size={15} />上传素材</button>
        <input ref={input} className="sr-only" type="file" accept={kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/quicktime,video/webm,.mov'} onChange={event => { void upload(event.target.files); event.target.value = ''; }} />
      </div>
      <div className="asset-library-body">
        <aside className="asset-library-categories">
          <span className="asset-library-category active"><FolderOpen size={16} />全部素材</span>
          <span className={`asset-library-category ${kind === 'image' ? 'active' : ''}`}><ImageIcon size={16} />图片</span>
          <span className={`asset-library-category ${kind === 'video' ? 'active' : ''}`}><Video size={16} />视频</span>
          <small>仅显示当前可加入创意的{kind === 'image' ? '图片' : '视频'}</small>
        </aside>
        <div className="asset-library-results" aria-busy={busy}>
          {error && <div className="asset-library-error" role="alert">{error}</div>}
          {busy && !items.length ? <div className="asset-library-empty"><LoaderCircle className="spin" size={22} />正在读取素材</div> : visible.length ? <div className="asset-library-grid">{visible.map(item => {
            const active = selected?.name === item.name;
            return <button type="button" className={`asset-library-card ${active ? 'selected' : ''}`} key={item.name} onClick={() => setSelected(item)}>
              <span className="asset-library-thumb">{active && previewUrl ? kind === 'image' ? <img src={previewUrl} alt="" /> : <video src={previewUrl} muted playsInline preload="metadata" /> : kind === 'image' ? <ImageIcon size={27} /> : <Video size={27} />}</span>
              <span className="asset-library-name" title={itemTitle(item)}>{itemTitle(item)}</span>
            </button>;
          })}</div> : !error && <div className="asset-library-empty"><FolderOpen size={26} /><strong>这里还没有{kind === 'image' ? '图片' : '视频'}</strong><span>上传一次，之后可在不同创意中快速复用。</span><button className="text-button" type="button" onClick={() => input.current?.click()}>上传第一份素材</button></div>}
        </div>
        <aside className="asset-library-preview">
          {selected && previewUrl ? kind === 'image' ? <img src={previewUrl} alt={itemTitle(selected)} /> : <video src={previewUrl} controls playsInline /> : <div className="asset-library-preview-empty"><ImageIcon size={34} /><span>选择素材预览</span></div>}
          <div className="asset-library-preview-info"><strong title={selected ? itemTitle(selected) : ''}>{selected ? itemTitle(selected) : '素材预览'}</strong><span>{kind === 'image' ? '图片' : '视频'} · 私有素材</span></div>
          <button className="asset-library-add" type="button" disabled={!selected || busy} onClick={() => { void addToProject(); }}>{busy ? <LoaderCircle className="spin" size={16} /> : null}添加到当前创意</button>
        </aside>
      </div>
    </section>
  </div>;
}
