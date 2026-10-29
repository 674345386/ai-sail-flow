import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { VideoAnalysisMethod } from '../shared/video-analysis';
import { dataDir } from './store';

const settingsFile = path.join(dataDir, '.video-analysis-settings.json');

export function getVideoAnalysisMethod(): VideoAnalysisMethod {
  try {
    const value = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    return value.method === 'segmented' ? 'segmented' : 'full';
  } catch { return 'full'; }
}

export function setVideoAnalysisMethod(method: VideoAnalysisMethod) {
  const temporary = `${settingsFile}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ method }), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, settingsFile);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
