import path from 'node:path';
import type { Response } from 'express';

export function setShotMediaCacheHeaders(res: Pick<Response, 'setHeader'>, filepath: string) {
  // Derivatives are immutable for a given hash. Keep authenticated media private
  // and limit browser reuse to five minutes; other media retain their existing policy.
  if (/^shot-[a-f\d]{24}(?:\.mp4|-\d+\.jpg)$/.test(path.basename(filepath))) {
    res.setHeader('Cache-Control', 'private, max-age=300, immutable');
  }
}
