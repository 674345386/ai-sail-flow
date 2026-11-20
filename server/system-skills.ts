import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Skills shipped with the app itself. They are copied into every agent codex
// home so all creatives (and every account workspace) can use them, not only
// the home where the skill happened to be authored.
const bundledRoot = fileURLToPath(new URL('../assets/system-skills', import.meta.url));

/**
 * Idempotently seed bundled platform skills into `<codexHome>/skills/.system`.
 * Existing installs are never overwritten, so user edits survive.
 * Never throws: skill seeding must not block agent startup.
 */
export function ensureSystemSkills(codexHome: string): void {
  try {
    if (!bundledRoot || !fs.existsSync(bundledRoot)) return;
    const entries = fs.readdirSync(bundledRoot, { withFileTypes: true });
    if (entries.length === 0) return;
    const targetRoot = path.join(codexHome, 'skills', '.system');
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dest = path.join(targetRoot, entry.name);
      if (fs.existsSync(dest)) continue;
      fs.mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
      fs.cpSync(path.join(bundledRoot, entry.name), dest, { recursive: true });
    }
  } catch {
    // ignore: a missing skill must never prevent an agent session from starting
  }
}
