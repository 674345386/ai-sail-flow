import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Globe } from 'lucide-react';
import { applyAppLang } from './app-i18n';

/* Lightweight i18n: a typed dictionary per feature + one context.
   To add a language: add it to LANGUAGES, then TypeScript will flag every dictionary that lacks it. */
export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN', htmlLang: 'en' },
  { code: 'zh-CN', label: '简体中文', short: '中文', htmlLang: 'zh-CN' },
] as const;
export type Lang = typeof LANGUAGES[number]['code'];
export type Dict<T> = Record<Lang, T>;
export const DEFAULT_LANG: Lang = 'en';
const STORAGE_KEY = 'sail-lang';

const isLang = (value: unknown): value is Lang => LANGUAGES.some(item => item.code === value);
function initialLang(): Lang {
  try { const saved = localStorage.getItem(STORAGE_KEY); if (isLang(saved)) return saved; } catch { /* storage unavailable */ }
  return DEFAULT_LANG;
}

// Module-level mirror so non-React helpers (e.g. auth error mapping) can read the current language.
let currentLang: Lang = typeof window === 'undefined' ? DEFAULT_LANG : initialLang();
export const getLang = () => currentLang;
export const pick = <T,>(dict: Dict<T>, lang: Lang = currentLang): T => dict[lang] ?? dict[DEFAULT_LANG];

const I18nContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({ lang: DEFAULT_LANG, setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  currentLang = lang;
  useEffect(() => {
    applyAppLang(lang);
    document.documentElement.lang = LANGUAGES.find(item => item.code === lang)?.htmlLang || lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
  }, [lang]);
  const setLang = useCallback((next: Lang) => { currentLang = next; setLangState(next); }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useLang = () => useContext(I18nContext);
/** Returns the current language's entry of a dictionary, re-rendering on language change. */
export function useDict<T>(dict: Dict<T>): T { const { lang } = useLang(); return pick(dict, lang); }

const SWITCH_TEXT: Dict<{ label: string }> = { en: { label: 'Language' }, 'zh-CN': { label: '语言' } };

/** Header language menu. */
export function LanguageSwitch() {
  const { lang, setLang } = useLang();
  const t = useDict(SWITCH_TEXT);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  const current = LANGUAGES.find(item => item.code === lang) || LANGUAGES[0];
  return <div className={`lang-switch${open ? ' is-open' : ''}`} ref={root}>
    <button type="button" className="lang-switch-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${t.label}: ${current.label}`} onClick={() => setOpen(value => !value)}>
      <Globe size={16} aria-hidden="true" /><span>{current.short}</span>
    </button>
    {open && <ul className="lang-switch-menu" role="listbox" aria-label={t.label}>
      {LANGUAGES.map(item => <li key={item.code} role="option" aria-selected={item.code === lang}>
        <button type="button" lang={item.htmlLang} onClick={() => { setLang(item.code); setOpen(false); }}>
          <span>{item.label}</span>{item.code === lang && <Check size={14} aria-hidden="true" />}
        </button>
      </li>)}
    </ul>}
  </div>;
}
