import { createRoot } from 'react-dom/client';
import { Component, type ReactNode } from 'react';
import App from './App';
import { I18nProvider, getLang } from './i18n';
import { applyAppLang } from './app-i18n';
import './lang-switch.css';
import './styles.css';
import './elevenlabs.css';
import './creative-workspace.css';
import './shader-surfaces.css';
import './workspace-shell.css';
import './landing-hero.css';
import './creative-showcase.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="boot-screen"><h1>页面遇到了问题</h1><p>已保存的项目与创意仍在本机，可以重新打开。</p><button className="btn primary" onClick={() => location.reload()}>重新加载</button></div> : this.props.children; }
}
applyAppLang(getLang());
createRoot(document.getElementById('root')!).render(<ErrorBoundary><I18nProvider><App /></I18nProvider></ErrorBoundary>);
