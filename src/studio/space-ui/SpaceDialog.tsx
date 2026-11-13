import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './dialogs.css';
/** Dialog shell and focus/escape behavior adapted from the supplied Dialogs.jsx. */
export default function SpaceDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const root=useRef<HTMLElement>(null),id=useId();const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const timer=setTimeout(()=>root.current?.querySelector<HTMLElement>('input:not([type="file"]),button,textarea,select')?.focus(),20);
 const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}if(event.key==='Tab'){const nodes=[...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not([type="file"]):not(:disabled),select,textarea,[tabindex="0"]')||[])].filter(node=>node.getClientRects().length);if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}}};document.addEventListener('keydown',key);return()=>{clearTimeout(timer);document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};},[]);
 return <div className="oii-modal-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={root} className="oii-modal oii-modal-wide" role="dialog" aria-modal="true" aria-labelledby={id}><header className="oii-modal-header"><h2 id={id}>{title}</h2><button className="oii-icon-btn oii-modal-close" type="button" onClick={onClose} aria-label="关闭窗口"><X size={20}/></button></header><div className="oii-modal-content">{children}</div></section></div>;
}
