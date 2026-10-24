import type { Project } from './domain';
import { tierVideoPrompt } from './tier-prompt';

export function withVideoReferences(prompt: string, images: { label: string }[]) {
  const block = ['【视频参考图】', ...images.map((image, index) => `Reference image ${index + 1}: ${image.label.replace(/[\r\n]/g, ' ')}`), '【视频参考图结束】'].join('\n');
  const previous = /【视频参考图】[\s\S]*?【视频参考图结束】/;
  return previous.test(prompt) ? prompt.replace(previous, () => block) : `${prompt}\n\n${block}`;
}

/** The preview and submission use the same ordered sequence description. */
export function tierGroupPrompt(project: Project, shotIds: string[]) {
  const shots = project.analysis?.shots.filter(shot => shotIds.includes(shot.id)) || [];
  const duration = shots.reduce((sum, shot) => sum + shot.end - shot.start, 0);
  if (shots.length < 2 || shots.length > 3 || shots.length !== new Set(shotIds).size || duration <= 0 || duration > 8) throw new Error('请选择 2–3 个镜头，且总时长不超过 8 秒。');
  let elapsed = 0;
  const timeline = shots.map((shot, index) => {
    const start = elapsed * 8 / duration;
    elapsed += shot.end - shot.start;
    const end = elapsed * 8 / duration;
    const analysis = tierVideoPrompt(shot);
    const edited = project.replication?.shots?.[shot.id]?.videoPrompt;
    const additions = edited?.trim() && edited !== analysis ? `\n\n【用户补充要求】\n${edited}` : '';
    return `SHOT ${index + 1} (${start.toFixed(2)}–${end.toFixed(2)} seconds of the generated video; source shot ${shot.id}, duration ${(shot.end - shot.start).toFixed(2)}s): use references labelled for this source shot when supplied.\n${analysis}${additions}`;
  });
  const priorities = project.analysis?.focusPoints?.filter(point => point.selected).map(point => point.text) || [];
  return [
    `Generate one coherent 8-second video sequence containing exactly ${shots.length} distinct consecutive shots, in the source analysis order. The complete analysis for each selected shot follows; use all its recorded details. Reference images are numbered and labelled in the final reference list; follow that list for their roles and shot associations. They define the target subject identity and appearance. Follow the assigned generated timeline rather than the original source timestamps. Preserve each shot's relative pacing, recorded transition and audio; use a direct cut when no transition is specified. Do not add scenes or unrecorded transitions.`,
    priorities.length ? `已选全片重点：${priorities.join('；')}` : '',
    ...timeline,
  ].filter(Boolean).join('\n\n');
}
