import { useEffect, type RefObject } from 'react';

// Paste events follow keyboard focus, so listen globally while an upload box is hovered.
export function useImagePaste(container: RefObject<HTMLDivElement | null>, enabled: boolean, onUpload: (files: File[]) => void) {
  useEffect(() => {
    if (!enabled) return;
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || !container.current?.querySelector('[data-image-upload]:hover, [data-image-upload]:focus-within')) return;
      const files = Array.from(event.clipboardData?.items || [])
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (!files.length) return;
      event.preventDefault();
      onUpload(files);
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, [container, enabled, onUpload]);
}
