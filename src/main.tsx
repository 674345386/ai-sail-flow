import { createRoot } from 'react-dom/client';
import { Component, type ReactNode } from 'react';
import App from './App';
import './styles.css';
import './elevenlabs.css';
import './creative-workspace.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="boot-screen"><h1>页面遇到了问题</h1><p>已保存的项目仍在本机，可以重新打开。</p><button className="btn primary" onClick={() => location.reload()}>重新加载</button></div> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /></ErrorBoundary>);
