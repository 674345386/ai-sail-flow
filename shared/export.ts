import { countries, defaultReplication, defaultWorkspace, platforms, roles, timeLabel, type ProductionMode, type Project, type Shot } from './domain';
import { buildVeoPlan, clipTiming, VEO_CLIP_SECONDS, type VeoPlanUnit } from './veo-plan';
import { selectedFocus, selectedFocusBrief } from './focus';
import { keyframeCurrent } from './storyboard';

function stamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function subtitles(shots: Shot[], mode: ProductionMode = 'veo-native') {
  return shots.filter(s => (mode === 'tts-subtitles' ? s.narration : s.onScreenText || s.narration).trim()).map((s, i) =>
    `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${(mode === 'tts-subtitles' ? s.narration : s.onScreenText || s.narration).trim()}\n`,
  ).join('\n');
}
function veoUnitPromptData(project: Project, unit: VeoPlanUnit, mode: ProductionMode) {
  const rewrite = project.rewrite!;
  const direct = project.promptFlow === 'direct-analysis';
  const shots = rewrite.shots.filter(shot => unit.sourceShotIds.includes(shot.id));
  const renderScale = Math.min(1, VEO_CLIP_SECONDS / unit.targetDuration);
  const firstShot = shots[0];
  const imageInput = direct ? {} : { imageToVideo: {
    mode: 'i2v', sourceShotId: firstShot?.sourceShotId, keyframeShotId: firstShot?.id,
    keyframe: firstShot && keyframeCurrent(project, firstShot) ? firstShot.keyframe?.url : null,
    required: 'The supplied image is the first frame of this single shot. Preserve its product identity, people, composition, lighting and setting. Animate only this shot using the approved action progression, camera movement and visual effects. Do not create another shot, a montage or an internal cut.',
  } };
  const editTiming = { ...clipTiming(unit.targetDuration), rule: unit.targetDuration > VEO_CLIP_SECONDS
    ? 'The single source clip is slowed to the target editorial duration after generation. Complete this shot action within the generated 8 seconds.'
    : 'Complete this shot action within the target editorial duration; remaining provider seconds are trimmed.' };
  const replication = project.replication || defaultReplication;
  const referenceStyle = project.analysis ? {
    referenceStyle: {
      priority: 'The source shots control every element named in preserve. The rewritten storyboard and target appearance control only the approved changes. If they conflict, follow this contract.',
      preserve: replication.preserve,
      allowedChanges: replication.change,
      imageContextRule: 'The target reference image may include a model, mannequin, stand or background. Use those only when they are the item to replace or are explicitly listed under allowedChanges; do not silently replace the source actor or scene.',
      keepShotStructure: true,
      mapping: shots.map(shot => ({ shotId: shot.id, sourceShotId: shot.sourceShotId || shot.id })),
      sourceSummary: project.analysis.summary,
      selectedGlobalFocus: selectedFocus(project.analysis.focusPoints),
      sourceProductAppearance: project.analysis.productAppearance,
      targetAppearance: { facts: project.product.facts, referenceImages: project.assets.filter(asset => asset.kind === 'product').map(asset => asset.name) },
      shots: project.analysis.shots.filter(source => shots.some(shot => (shot.sourceShotId || shot.id) === source.id)).map(shot => ({
        id: shot.id, start: shot.start, end: shot.end, visual: shot.visual,
        action: shot.action, camera: shot.camera, sound: shot.sound,
        subject: shot.subject, effects: shot.effects, transition: shot.transition,
        selectedShotFocus: selectedFocus(shot.focusPoints),
        evidenceFrames: shot.evidenceFrames,
      })),
    },
  } : {};
  if (mode === 'tts-subtitles') return {
    format: 'veo-visual-unit/v1',
    task: direct
      ? 'Recreate this analyzed reference shot as ONE continuous video clip. The voiceover, captions and on-screen copy will be added after video generation.'
      : 'Animate the supplied first frame as ONE continuous product-video shot. The voiceover, captions and on-screen copy will be added after video generation.',
    output: {
      clipDurationSeconds: VEO_CLIP_SECONDS,
      finalEditRangeSeconds: { start: unit.start, end: unit.end, duration: unit.targetDuration },
      aspectRatio: project.market.aspectRatio,
      editTiming,
    },
    ...imageInput,
    ...referenceStyle,
    visualRequirements: 'Follow the visual beats and product actions in order. Keep product identity, people, props, camera and lighting consistent. Leave visual space for later captions. Do not generate speech, subtitles, titles or added text overlays. Preserve only the packaging text naturally present on the product.',
    productFacts: { name: project.product.name, facts: project.product.facts },
    storyboard: shots.map(shot => ({
      id: shot.id, sourceShotId: shot.sourceShotId || shot.id,
      keyframeDirection: shot.keyframePrompt,
      renderRangeSeconds: {
        start: Number((Math.max(0, shot.start - unit.start) * renderScale).toFixed(3)),
        end: Number((Math.min(unit.targetDuration, shot.end - unit.start) * renderScale).toFixed(3)),
      },
      visual: shot.visual, action: shot.action, camera: shot.camera,
      subject: shot.subject, effects: shot.effects, transition: shot.transition,
      productPresence: shot.productPresence, uncertainty: shot.uncertainty,
      generationPrompt: shot.generationPrompt,
    })),
  };
  const cues = shots.map(shot => ({
    shotId: shot.id,
    renderRangeSeconds: {
      start: Number((Math.max(0, shot.start - unit.start) * renderScale).toFixed(3)),
      end: Number((Math.min(unit.targetDuration, shot.end - unit.start) * renderScale).toFixed(3)),
    },
    spokenText: shot.narration,
    onScreenText: shot.onScreenText,
    sound: shot.sound,
  }));
  return {
    format: 'veo-production-unit/v1',
    task: direct
      ? 'Recreate the analyzed reference video for this timeline range. Preserve its observed style, actions, camera, pacing, language, narration, text and sound; apply only the explicitly allowed changes below.'
      : 'Animate the supplied first frame as ONE continuous, finished product-video shot. Follow its action progression, camera movement, visual effects, audio and text cues. Do not introduce other shots or internal cuts.',
    output: {
      clipDurationSeconds: VEO_CLIP_SECONDS,
      finalEditRangeSeconds: { start: unit.start, end: unit.end, duration: unit.targetDuration },
      aspectRatio: project.market.aspectRatio,
      marketLanguage: direct ? project.analysis?.sourceLanguage : project.market.language,
      editTiming,
    },
    ...imageInput,
    ...referenceStyle,
    mandatoryRequirements: {
      audio: direct
        ? 'Preserve the source audio behavior. Reproduce non-empty spokenText in its original language and sound cues as described; do not add speech or music where the source analysis records none.'
        : 'REQUIRED. Generate clear, audible, synchronized human speech. Speak each non-empty spokenText exactly as written in its renderRangeSeconds. Do not omit, summarize, paraphrase, replace, mute, or use another language.',
      onScreenText: direct
        ? 'Preserve each non-empty onScreenText in its original language and wording. Do not add text where the source analysis records none.'
        : 'REQUIRED. Render each non-empty onScreenText as readable on-screen text during its matching renderRangeSeconds. Preserve the words and language exactly.',
      sound: direct ? 'Preserve the source sound and music character described in each timeline cue.' : 'REQUIRED. Reproduce the specified sound and music cues while keeping spoken dialogue intelligible.',
      continuity: 'Keep the product, people, setting, props, camera actions, and timeline cues consistent across the whole clip.',
    },
    productFacts: { name: project.product.name, facts: project.product.facts },
    timelineCues: cues,
    storyboard: shots,
  };
}
export function buildVeoUnitPrompt(project: Project, unit: VeoPlanUnit, mode: ProductionMode = project.productionMode || 'veo-native') {
  return project.rewrite ? JSON.stringify(veoUnitPromptData(project, unit, mode), null, 2) : '';
}
export function buildVeoPromptPreview(project: Project, mode: ProductionMode = project.productionMode || 'veo-native') {
  return project.rewrite ? JSON.stringify(buildVeoPlan(project.rewrite.shots).map(unit => veoUnitPromptData(project, unit, mode)), null, 2) : '';
}
export function buildPrompt(project: Project) {
  const r = project.rewrite;
  if (!r) return '';
  const market = countries.find(c => c.code === project.market.country)!;
  return [
    `# ${project.title} — video generation brief`,
    project.isDemo ? '> DEMONSTRATION DATA. This package is an editable example, not a Gemini analysis.\n' : '',
    `## Creative direction\n${r.globalPrompt}`,
    `## Reference replication\nPreserve: ${(project.replication || defaultReplication).preserve}\nAllowed changes: ${(project.replication || defaultReplication).change}`,
    `## User-selected recreation priorities\n${selectedFocusBrief(project.analysis) || 'No priorities selected; follow the full source observations.'}`,
    `## Product facts\nProduct: ${project.product.name}\n${project.product.facts}`,
    `Price: ${project.product.price ? `${project.product.price} ${project.product.currency}` : 'Not supplied; do not invent.'}\nOffer: ${project.product.offer || 'Not supplied; do not invent.'}`,
    `## Delivery\nMarket: ${market.code}\nLanguage: ${project.market.language}\nPlatform: ${project.market.platform}\nDestination: ${project.market.destination}\nCTA: ${project.market.cta || 'Use the approved CTA in the scene plan.'}\nAspect ratio: ${project.market.aspectRatio}\nTarget duration: ${r.shots.at(-1)?.end ?? 0}s\nPeople: ${project.market.people}`,
    `## Product references\n${project.assets.filter(a => a.kind === 'product').map((a, i) => `Reference ${i + 1}: ${a.name}`).join('\n') || 'No product image supplied. Confirm exact appearance before rendering.'}`,
    '## Editing rule\nThe approved scene/action/camera fields below are the latest user edits and take precedence if the initial English visual direction differs.',
    ...r.shots.map((s, i) => `## Shot ${i + 1} | ${s.start.toFixed(2)}–${s.end.toFixed(2)}s | ${s.role}\nInitial English visual direction: ${s.generationPrompt}\nApproved scene: ${s.visual}\nAction: ${s.action}\nCamera: ${s.camera}\nProduct: ${s.productPresence}\nSpoken words (${project.market.language}): ${s.narration || '[none]'}\nOn-screen text: ${project.market.subtitles ? s.onScreenText || '[none]' : '[no subtitles; add separately only if requested]'}\nSound: ${s.sound}`),
    `## Negative constraints\n${r.negativePrompt}`,
    `## Production notes\n${r.productionNotes.map(n => `- ${n}`).join('\n')}`,
    '\nThis is a production brief. For each generated clip, submit its visual direction, spoken words, on-screen text, and sound requirements to the video model. Review the rendered result and refine any text or audio that the model does not reproduce faithfully.',
  ].filter(Boolean).join('\n\n');
}
export function buildBrief(project: Project) {
  const r = project.rewrite;
  if (!r) return '';
  const replication = project.replication || defaultReplication;
  return `# ${project.title}\n\n${project.isDemo ? '> 示例创意，非真实 AI 分析结果。\n\n' : ''}生成模型：${project.model}\n\n## 投放与产品资料\n\n- 产品：${project.product.name}\n- 市场：${countries.find(c => c.code === project.market.country)?.name}\n- 语言：${project.market.language}\n- 平台：${platforms.find(p => p.id === project.market.platform)?.name}\n- 购买路径：${project.market.destination === 'shop' ? 'TikTok Shop 商品卡' : '独立站 / 外部网站'}\n- 产品地址：${project.product.landingUrl || '未填写'}\n- 已确认卖点：${project.product.facts}\n\n## 参考视频复刻要求\n\n- 保持：${replication.preserve}\n- 允许改变：${replication.change}\n\n## 已选关注重点\n\n${selectedFocusBrief(project.analysis) || '未特别指定'}\n\n## 创意方向\n\n${r.angle}\n\n${r.audienceInsight}\n\n## 可选开头\n\n${r.hookVariants.map(h => `- **${h.label}**：${h.text}`).join('\n')}\n\n## 创意改写说明\n\n${r.localizationNotes.map(n => `- ${n}`).join('\n')}\n\n## 制作备注\n\n${r.productionNotes.map(n => `- ${n}`).join('\n')}\n\n## 分镜脚本\n\n${r.shots.map((s, i) => `### ${i + 1}. ${timeLabel(s.start)}–${timeLabel(s.end)} · ${roles[s.role]}\n\n${s.visual}\n\n原片对应镜头：${s.sourceShotId || s.id}\n\n复刻关键帧：${keyframeCurrent(project, s) ? `recreation-keyframes/shot-${String(i + 1).padStart(2, '0')}.${s.keyframe!.filename?.split('.').at(-1)}` : '待生成或待更新'}\n\n动作：${s.action}\n\n口播：${s.narration || '无'}\n\n字幕：${project.market.subtitles ? s.onScreenText || '无' : '关闭'}\n`).join('\n')}\n\n字幕时间码为分镜草案；生成实际成片后需按成片音轨校准。\n`;
}
export function buildExportFiles(project: Project) {
  if (!project.rewrite || project.rewriteStale) throw new Error('请先生成与当前资料一致的改写方案。');
  const files: Record<string, string> = {
    '01-creative-brief.md': buildBrief(project),
    '02-seedance-prompt.txt': buildPrompt(project),
    '03-storyboard.json': buildVeoPromptPreview(project),
    '04-source-analysis.json': JSON.stringify(project.analysis, null, 2),
    '07-shot-recreation.json': JSON.stringify({ shots: project.rewrite.shots.map(shot => ({ ...shot, keyframeStatus: keyframeCurrent(project, shot) ? 'current' : 'pending-or-stale' })) }, null, 2),
    '06-veo-production-plan.json': JSON.stringify({
      provider: 'veo-3.1',
      sourceClipSeconds: VEO_CLIP_SECONDS,
      finalTimelineSeconds: project.rewrite.shots.at(-1)?.end ?? 0,
      note: 'Each reference shot produces one corresponding i2v source clip from its recreated keyframe and shot description. Veo returns 8 seconds; trim short shots and retime long shots to their editorial duration, then concatenate in source shot order.',
      units: buildVeoPlan(project.rewrite.shots),
    }, null, 2),
    'manifest.json': JSON.stringify({ app: 'AI-Sail Flow', version: 2, model: project.model, productionMode: project.productionMode || 'veo-native', workspaceId: defaultWorkspace.id, projectId: project.parentProjectId || null, creativeId: project.id, title: project.title, demo: project.isDemo, sourceAnalysis: project.analysisMeta || null, selectedFocus: selectedFocusBrief(project.analysis), exportedAt: new Date().toISOString(), product: project.product, market: project.market, replication: project.replication || defaultReplication, productReferences: project.assets.filter(a => a.kind === 'product').map(a => a.name), subtitles: 'Draft timing; align against the final rendered audio.' }, null, 2),
  };
  if (project.market.subtitles || project.productionMode === 'tts-subtitles') files['05-subtitles-draft.srt'] = subtitles(project.rewrite.shots, project.productionMode);
  return files;
}
