// Share remote verification across API, image and video requests for the same session.
export function createSessionVerifier(verify: (token: string) => Promise<boolean>, now = Date.now) {
  const cached = new Map<string, { allowed: boolean; expiresAt: number }>();
  const pending = new Map<string, Promise<boolean>>();
  const successTTL = 5 * 60_000;
  const failureTTL = 15_000;
  const maxEntries = 128;

  async function isAllowed(token: string): Promise<boolean> {
    if (!token) return false;
    const entry = cached.get(token);
    if (entry && entry.expiresAt > now()) return entry.allowed;
    const existing = pending.get(token);
    if (existing) return existing;

    const request: Promise<boolean> = Promise.resolve().then(async () => {
      const allowed = await verify(token);
      let expiresAt = now() + failureTTL;
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
        // The remote verifier authenticates the token. Its payload only shortens cache life.
        if (Number.isFinite(payload.exp)) expiresAt = Math.min(now() + (allowed ? successTTL : failureTTL), payload.exp * 1000);
      } catch { /* Keep the short fallback TTL when no expiry can be read. */ }
      if (pending.get(token) === request) {
        for (const [key, value] of cached) if (value.expiresAt <= now()) cached.delete(key);
        cached.delete(token);
        if (cached.size >= maxEntries) cached.delete(cached.keys().next().value!);
        cached.set(token, { allowed, expiresAt });
      }
      return allowed;
    });
    pending.set(token, request);
    try { return await request; }
    finally { if (pending.get(token) === request) pending.delete(token); }
  }

  return {
    isAllowed,
    invalidate(token: string) { cached.delete(token); pending.delete(token); },
  };
}
