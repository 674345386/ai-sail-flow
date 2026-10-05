import { useEffect, useState } from 'react';

type Connection = { saveData?: boolean; effectiveType?: string };

// Decorative downloads wait until critical content finishes. Slow connections
// retain the existing static artwork and CSS gradients.
export function useDecorativeMedia() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    if (connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType || '')) return;
    let timer = 0;
    const schedule = () => { timer = window.setTimeout(() => setReady(true), 1500); };
    if (document.readyState === 'complete') schedule(); else window.addEventListener('load', schedule, { once: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('load', schedule); };
  }, []);
  return ready;
}
