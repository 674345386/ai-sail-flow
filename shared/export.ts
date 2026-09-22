import { countries, platforms, roles, timeLabel, type Project, type Shot } from './domain';
import { buildVeoPlan, VEO_CLIP_SECONDS } from './veo-plan';

function stamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function subtitles(shots: Shot[]) {
  return shots.filter(s => s.onScreenText.trim() || s.narration.trim()).map((s, i) =>
    `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${(s.onScreenText || s.narration).trim()}\n`,
  ).join('\n');
}
export function buildPrompt(project: Project) {
  const r = project.rewrite;
  if (!r) return '';
  const market = countries.find(c => c.code === project.market.country)!;
  return [
    `# ${project.title} — video generation brief`,
    project.isDemo ? '> DEMONSTRATION DATA. This package is an editable example, not a Gemini analysis.\n' : '',
    `## Creative direction\n${r.globalPrompt}`,
    `## Product facts\nProduct: ${project.product.name}\n${project.product.facts}`,
    `Price: ${project.product.price ? `${project.product.price} ${project.product.currency}` : 'Not supplied; do not invent.'}\nOffer: ${project.product.offer || 'Not supplied; do not invent.'}`,
    `## Delivery\nMarket: ${market.code}\nLanguage: ${project.market.language}\nPlatform: ${project.market.platform}\nDestination: ${project.market.destination}\nCTA: ${project.market.cta || 'Use the approved CTA in the scene plan.'}\nAspect ratio: ${project.market.aspectRatio}\nTarget duration: ${r.shots.at(-1)?.end ?? 0}s\nPeople: ${project.market.people}`,
    `## Product references\n${project.assets.filter(a => a.kind === 'product').map((a, i) => `Reference ${i + 1}: ${a.name}`).join('\n') || 'No product image supplied. Confirm exact appearance before rendering.'}`,
    '## Editing rule\nThe approved scene/action/camera fields below are the latest user edits and take precedence if the initial English visual direction differs.',
    ...r.shots.map((s, i) => `## Shot ${i + 1} | ${s.start.toFixed(2)}–${s.end.toFixed(2)}s | ${s.role}\nInitial English visual direction: ${s.generationPrompt}\nApproved scene: ${s.visual}\nAction: ${s.action}\nCamera: ${s.camera}\nProduct: ${s.productPresence}\nSpoken words (${project.market.language}): ${s.narration || '[none]'}\nOn-screen text: ${project.market.subtitles ? s.onScreenText || '[none]' : '[no subtitles; add separately only if requested]'}\nSound: ${s.sound}`),
    `## Negative constraints\n${r.negativePrompt}`,
    `## Production notes\n${r.productionNotes.map(n => `- ${n}`).join('\n')}`,
    '\nThis is a production brief, not a completed video. Split into clips according to the generation channel you use; composite precise typography in post-production.',
  ].filter(Boolean).join('\n\n');
}
export function buildBrief(project: Project) {
  const r = project.rewrite;
  if (!r) return '';
  return `# ${project.title}\n\n${project.isDemo ? '> 示例项目，非真实 AI 分析结果。\n\n' : ''}生成模型：${project.model}\n\n## 投放与产品资料\n\n- 产品：${project.product.name}\n- 市场：${countries.find(c => c.code === project.market.country)?.name}\n- 语言：${project.market.language}\n- 平台：${platforms.find(p => p.id === project.market.platform)?.name}\n- 购买路径：${project.market.destination === 'shop' ? 'TikTok Shop 商品卡' : '独立站 / 外部网站'}\n- 产品地址：${project.product.landingUrl || '未填写'}\n- 已确认卖点：${project.product.facts}\n\n## 创意方向\n\n${r.angle}\n\n${r.audienceInsight}\n\n## 可选开头\n\n${r.hookVariants.map(h => `- **${h.label}**：${h.text}`).join('\n')}\n\n## 本地化说明\n\n${r.localizationNotes.map(n => `- ${n}`).join('\n')}\n\n## 制作备注\n\n${r.productionNotes.map(n => `- ${n}`).join('\n')}\n\n## 分镜脚本\n\n${r.shots.map((s, i) => `### ${i + 1}. ${timeLabel(s.start)}–${timeLabel(s.end)} · ${roles[s.role]}\n\n${s.visual}\n\n动作：${s.action}\n\n口播：${s.narration || '无'}\n\n字幕：${project.market.subtitles ? s.onScreenText || '无' : '关闭'}\n`).join('\n')}\n\n字幕时间码为分镜草案；生成实际成片后需按成片音轨校准。\n`;
}
export function buildExportFiles(project: Project) {
  if (!project.rewrite || project.rewriteStale) throw new Error('请先生成与当前资料一致的改写方案。');
  const files: Record<string, string> = {
    '01-creative-brief.md': buildBrief(project),
    '02-seedance-prompt.txt': buildPrompt(project),
    '03-storyboard.json': JSON.stringify(project.rewrite.shots, null, 2),
    '04-source-analysis.json': JSON.stringify(project.analysis, null, 2),
    '06-veo-production-plan.json': JSON.stringify({
      provider: 'veo-3.1',
      sourceClipSeconds: VEO_CLIP_SECONDS,
      finalTimelineSeconds: project.rewrite.shots.at(-1)?.end ?? 0,
      note: 'Each unit requests a fixed 8-second Veo source clip. Use targetStart/targetEnd to trim and assemble the final edit; do not render each analysis cut as a separate 8-second clip.',
      units: buildVeoPlan(project.rewrite.shots),
    }, null, 2),
    'manifest.json': JSON.stringify({ app: 'AI-Sail Flow', version: 1, model: project.model, projectId: project.id, title: project.title, demo: project.isDemo, sourceAnalysis: project.analysisMeta || null, exportedAt: new Date().toISOString(), product: project.product, market: project.market, productReferences: project.assets.filter(a => a.kind === 'product').map(a => a.name), subtitles: 'Draft timing; align against the final rendered audio.' }, null, 2),
  };
  if (project.market.subtitles) files['05-subtitles-draft.srt'] = subtitles(project.rewrite.shots);
  return files;
}
