import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CornerUpRight, ListEnd, ListX, MoreHorizontal, PencilLine, Play, Trash2 } from 'lucide-react';
import type { AgentQueuedMessage } from '../shared/intelligent-ui';

export default function AgentQueuedMessages({ messages, paused, disabled, canSteer, queueEnabled, onResume, onRemove, onSteer, onEdit, onAdd, onToggleQueue }: {
  messages: AgentQueuedMessage[]; paused: boolean; disabled: boolean; canSteer: boolean; queueEnabled: boolean;
  onResume: () => Promise<boolean>; onRemove: (id: string) => Promise<boolean>; onSteer: (id: string) => Promise<boolean>;
  onEdit: (id: string, text: string) => Promise<boolean>; onAdd: (text: string) => Promise<boolean>; onToggleQueue: () => void;
}) {
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const root = useRef<HTMLElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editedMessageExists = !!editing && messages.some(message => message.id === editing.id);

  useEffect(() => {
    if (!menu) return;
    menuPanel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setMenu(null); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(null); menuToggle.current?.focus(); }
    };
    const reposition = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [menu?.id]);
  useEffect(() => { if (menu && !messages.some(message => message.id === menu.id)) setMenu(null); }, [messages, menu?.id]);
  useEffect(() => { if (editing) editor.current?.focus({ preventScroll: true }); }, [editing?.id]);

  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  if (!messages.length && !editing) return null;
  return <section ref={root} className="iua-queue" aria-label="待发送消息队列">
    {paused && !!messages.length && <div className="iua-queue-status"><span>队列已暂停</span><button type="button" disabled={disabled} onClick={() => void onResume()}><Play size={13} aria-hidden="true" />继续队列</button></div>}
    <ol className="iua-queue-list" aria-label={`待发送（${messages.length}）`}>
      {messages.map(message => <li className="iua-queue-row" key={message.id}>
        <ListEnd className="iua-queue-mark" size={17} aria-hidden="true" />
        <p className="iua-queue-text" data-no-i18n title={message.text}>{message.text}</p>
        <div className="iua-queue-actions">
          <button type="button" className="iua-queue-steer" disabled={disabled || !canSteer} title="立即向当前任务发送这条消息" aria-label="立即向当前任务发送这条消息" onClick={() => { setMenu(null); void onSteer(message.id); }}><CornerUpRight size={15} aria-hidden="true" /><span>Steer</span></button>
          <button type="button" disabled={disabled} title="移除排队消息" aria-label={`移除排队消息：${message.text.slice(0, 32)}`} onClick={() => { setMenu(null); void onRemove(message.id); }}><Trash2 size={16} aria-hidden="true" /></button>
          <button type="button" disabled={disabled} title="更多消息操作" aria-label="更多消息操作" aria-haspopup="menu" aria-expanded={menu?.id === message.id} onClick={event => {
            if (menu?.id === message.id) { setMenu(null); return; }
            menuToggle.current = event.currentTarget;
            const rect = event.currentTarget.getBoundingClientRect();
            const bounds = root.current!.getBoundingClientRect();
            const conversation = root.current!.closest('.iua-conversation')?.getBoundingClientRect();
            const top = rect.bottom + 110 > (conversation?.bottom ?? window.innerHeight) ? rect.top - 104 : rect.bottom + 6;
            setMenu({ id: message.id, top: Math.max((conversation?.top ?? 0) + 8, top) - bounds.top, left: Math.max(0, Math.min(rect.right - bounds.left - 224, bounds.width - 224)) });
          }}><MoreHorizontal size={18} aria-hidden="true" /></button>
        </div>
      </li>)}
      {editing && <li className="iua-queue-editor"><form onSubmit={event => {
        event.preventDefault();
        if (disabled || !editing.text.trim()) return;
        const operation = editedMessageExists ? onEdit(editing.id, editing.text) : onAdd(editing.text);
        void operation.then(ok => { if (ok) setEditing(null); });
      }}>
        <textarea ref={editor} aria-label="编辑排队消息" rows={3} maxLength={6000} value={editing.text} disabled={disabled} onChange={event => setEditing({ ...editing, text: event.target.value })} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setEditing(null); } }} />
        {!editedMessageExists && <p role="status">原消息已发送或移除，修改后可重新排队。</p>}
        <div><button type="button" disabled={disabled} onClick={() => setEditing(null)}>取消</button><button type="submit" disabled={disabled || !editing.text.trim()}>{editedMessageExists ? '保存消息' : '加入队列'}</button></div>
      </form></li>}
    </ol>
    {menu && <div ref={menuPanel} className="iua-queue-menu" role="menu" aria-label="排队消息操作" style={{ top: menu.top, left: menu.left }} onKeyDown={menuKeys} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && event.relatedTarget !== menuToggle.current) setMenu(null); }}>
      <button type="button" role="menuitem" disabled={disabled} onClick={() => {
        const message = messages.find(message => message.id === menu.id);
        if (message) setEditing({ id: message.id, text: message.text });
        setMenu(null);
      }}><PencilLine size={17} aria-hidden="true" />编辑消息</button>
      <button type="button" role="menuitem" disabled={disabled} onClick={() => { onToggleQueue(); setMenu(null); menuToggle.current?.focus(); }}><ListX size={17} aria-hidden="true" />{queueEnabled ? '关闭排队' : '开启排队'}</button>
    </div>}
  </section>;
}
