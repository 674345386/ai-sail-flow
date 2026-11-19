import { useEffect, useState } from 'react';
import type { PlaygroundDefaults } from '../shared/landing-playground';
import LandingBackground from './LandingBackground';
import { playgroundDefaults } from './landing-playground-defaults';

const overlayKey = 'sail-landing-ambient-overlay-v1';
const accessPath = '/api/landing-playground/access';

async function saveDefaults(config: PlaygroundDefaults) {
  const response = await fetch('/api/landing-playground/defaults', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
  });
  if (response.status !== 204) throw new Error('Could not save the Playground defaults.');
}

export default function LandingPlayground() {
  const [ambient, setAmbient] = useState(() => {
    try {
      const saved = localStorage.getItem(overlayKey);
      if (saved === 'true' || saved === 'false') return saved === 'true';
    } catch { /* Storage is optional. */ }
    return playgroundDefaults.enabled ?? false;
  });
  const [canSave, setCanSave] = useState(false);
  useEffect(() => {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || new URLSearchParams(window.location.search).has('landingPreview')) return;
    const controller = new AbortController();
    void fetch(accessPath, { signal: controller.signal }).then(async response => {
      if (response.ok && (await response.json()).canSave === true) setCanSave(true);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  return <LandingBackground playground onSaveDefaults={canSave ? saveDefaults : undefined} backgroundEnabled={ambient} onBackgroundEnabledChange={enabled => {
    setAmbient(enabled);
    try { localStorage.setItem(overlayKey, String(enabled)); } catch { /* Changes still apply. */ }
  }} />;
}
