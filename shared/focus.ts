import type { Analysis, FocusCandidate, FocusPoint, Shot } from './domain';

export const focusCategoryLabels: Record<FocusPoint['category'], string> = {
  scene: '场景', subject: '主体', action: '动作', camera: '镜头', editing: '剪辑',
  audio: '声音', text: '文字', product: '产品', other: '其他',
};

export function aiFocusPoints(candidates: FocusCandidate[], start = 0, end = 2700): FocusPoint[] {
  const seen = new Set<string>();
  const points = candidates.flatMap(candidate => {
    const text = candidate.text.trim();
    const key = `${candidate.category}:${text.toLocaleLowerCase()}`;
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [{ ...candidate, text, id: crypto.randomUUID(), source: 'ai' as const, userEdited: false,
      evidenceAt: candidate.evidenceAt === undefined ? undefined : Math.min(Math.max(candidate.evidenceAt, start), end),
    }];
  });
  if (!points.some(point => point.selected)) points.slice(0, Math.min(3, points.length)).forEach(point => { point.selected = true; });
  return points;
}

export function mergeFocusPoints(current: FocusPoint[] = [], proposed: FocusPoint[] = [], limit = 12): FocusPoint[] {
  const protectedPoints = current.filter(point => point.source === 'user' || point.userEdited);
  const protectedTexts = new Set(protectedPoints.map(point => point.text.trim().toLocaleLowerCase()));
  return [...protectedPoints, ...proposed.filter(point => !protectedTexts.has(point.text.trim().toLocaleLowerCase()))].slice(0, limit);
}

export function selectedFocus(points: FocusPoint[] | undefined): string[] {
  return (points || []).filter(point => point.selected).map(point => `${focusCategoryLabels[point.category]}：${point.text}`);
}

export function selectedFocusBrief(analysis: Analysis | null): string {
  if (!analysis) return '';
  const global = selectedFocus(analysis.focusPoints);
  const shots = analysis.shots.flatMap((shot, index) => selectedFocus(shot.focusPoints).map(text => `镜头 ${index + 1} (${shot.start.toFixed(2)}–${shot.end.toFixed(2)}s)：${text}`));
  return [...global.map(text => `全片：${text}`), ...shots].join('\n');
}

export function selectedShotFocus(shot: Shot): string[] { return selectedFocus(shot.focusPoints); }
