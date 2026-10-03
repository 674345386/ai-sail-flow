import type { GeneratedVideo, ProductionMode, Project } from '../shared/domain';
import { buildVeoUnitPrompt } from '../shared/export';
import { buildVeoPlan } from '../shared/veo-plan';
import { keyframeCurrent } from '../shared/storyboard';

export type PipelinePort = { key: string; label: string; value: unknown };
export type PipelineInput = { key: string; label: string; from: { nodeId: string; portKey: string } };
export type PipelineNode = {
  id: string; title: string; eyebrow: string;
  status: 'done' | 'running' | 'waiting' | 'failed';
  evidence: 'recorded' | 'reconstructed' | 'missing';
  inputs: PipelineInput[]; outputs: PipelinePort[]; transform: string;
  links?: { label: string; url: string }[];
};

const input = (key: string, label: string, nodeId: string, portKey: string): PipelineInput => ({ key, label, from: { nodeId, portKey } });
const port = (key: string, label: string, value: unknown): PipelinePort => ({ key, label, value });

export function resolvePipelineInput(nodes: PipelineNode[], item: PipelineInput): PipelinePort | undefined {
  return nodes.find(node => node.id === item.from.nodeId)?.outputs.find(output => output.key === item.from.portKey);
}

function videoRequest(video: GeneratedVideo) {
  return video.providerRequest || {
    model: video.model, prompt: video.prompt, resolution: video.resolution || '720p', aspect_ratio: video.aspectRatio,
    ...(!video.mode || video.mode === 't2v' ? {} : { images: video.imageUrls || [] }),
  };
}

export function buildPipeline(project: Project, mode: ProductionMode, unitId: string, selectedVideoId?: string): PipelineNode[] {
  const nodes: PipelineNode[] = [];
  const add = (node: PipelineNode) => nodes.push(node);
  const reference = project.assets.find(asset => asset.kind === 'video');
  const products = project.assets.filter(asset => asset.kind === 'product');
  const plan = project.rewrite ? buildVeoPlan(project.rewrite.shots) : [];
  const unit = plan.find(item => item.id === unitId) || plan[0];
  const attempts = project.generatedVideos.filter(item => item.unitId === unit?.id && (item.productionMode || 'veo-native') === mode);
  const video = attempts.find(item => item.id === selectedVideoId) || attempts.at(-1);
  const composed = project.composedVideos?.filter(item => item.unitId === unit?.id && video && item.sourceVideoIds.includes(video.id)).at(-1);
  const shots = unit && project.rewrite ? project.rewrite.shots.filter(shot => unit.sourceShotIds.includes(shot.id)) : [];
  const cues = unit ? shots.map(shot => ({ shotId: shot.id, start: Math.max(0, shot.start - unit.start), end: Math.min(unit.targetDuration, shot.end - unit.start), narration: shot.narration, onScreenText: shot.onScreenText })) : [];
  const defaultPrompt = unit && project.rewrite ? video?.defaultPrompt || buildVeoUnitPrompt(project, unit, mode) : null;

  add({ id: 'project', title: '创意输入', eyebrow: '01 · 外部输入', status: reference ? 'done' : 'waiting', evidence: 'recorded', inputs: [],
    outputs: [port('reference', '参考视频', reference ? { name: reference.name, mime: reference.mime, size: reference.size, duration: reference.duration, hasAudio: reference.hasAudio } : null),
      port('images', '产品图片', products.map(asset => ({ name: asset.name, mime: asset.mime, size: asset.size }))), port('product', '目标产品资料', project.product), port('market', '市场与语言设置', project.market)],
    transform: '用户上传与填写的资料。媒体只展示元数据，不把视频二进制或 base64 放进画布。', links: reference?.url ? [{ label: '打开参考视频', url: reference.url }] : [] });
  add({ id: 'analysis-request', title: '原片拆解请求', eyebrow: '02 · Gemini 输入', status: project.job?.kind === 'analysis' && project.job.status === 'running' ? 'running' : project.analysis ? 'done' : 'waiting', evidence: project.analysisRequest ? 'recorded' : project.analysis ? 'missing' : 'reconstructed',
    inputs: [input('reference', '参考视频', 'project', 'reference'), input('images', '产品图片', 'project', 'images')], outputs: [port('request', '模型请求快照', project.analysisRequest || null)],
    transform: '视频与可选产品图进入多模态分析。新任务记录请求文字与参数；历史请求若未留存，不伪造原文。密钥与媒体 base64 不记录。' });
  add({ id: 'analysis', title: '原片分析结果', eyebrow: '03 · Gemini 输出', status: project.analysis ? 'done' : 'waiting', evidence: project.analysis ? 'recorded' : 'missing',
    inputs: [input('request', '模型请求', 'analysis-request', 'request')], outputs: [port('analysis', '结构化原片分析', project.analysis)], transform: '保存 Gemini 返回的场景、动作、原片口播与画面文字。历史请求快照缺失不代表此结果缺失。' });
  const direct = project.promptFlow === 'direct-analysis';
  add({ id: 'rewrite-request', title: direct ? '原片分析直连 Prompt' : '逐镜头产品与创意改写请求', eyebrow: direct ? '04 · 本地整理' : '04 · Gemini 输入', status: project.job?.kind === 'rewrite' && project.job.status === 'running' ? 'running' : project.rewrite ? 'done' : 'waiting', evidence: direct ? 'reconstructed' : project.rewriteRequest ? 'recorded' : project.rewrite ? 'missing' : 'reconstructed',
    inputs: direct ? [input('analysis', '原片分析', 'analysis', 'analysis')] : [input('analysis', '原片分析与关键帧', 'analysis', 'analysis'), input('product', '目标产品', 'project', 'product'), input('images', '产品参考图', 'project', 'images'), input('market', '市场设置', 'project', 'market')], outputs: [port('request', direct ? '无需 Gemini 请求' : '改写请求快照', direct ? null : project.rewriteRequest || null)],
    transform: direct ? '不发起第二次 Gemini 请求。直接将 Gemini 原片分析整理成分镜，再由用户编辑最终 Veo Prompt。' : '以每个原片镜头的分析与关键帧为依据，结合产品资料和参考图，一一生成镜头描述与复刻关键帧。历史真实请求以快照为准。' });
  add({ id: 'rewrite', title: direct ? '原片分镜 / 可编辑' : '交付分镜 JSON', eyebrow: direct ? '05 · 分析结果整理' : '05 · Gemini 输出 / 可编辑', status: project.rewrite ? 'done' : 'waiting', evidence: direct ? 'reconstructed' : project.rewrite ? 'recorded' : 'missing',
    inputs: [input('request', direct ? '原片分析' : '改写请求', direct ? 'analysis' : 'rewrite-request', direct ? 'analysis' : 'request')], outputs: [port('storyboard', '当前分镜 JSON', project.rewrite), port('keyframes', '逐镜头复刻关键帧', project.rewrite?.shots.map(shot => ({ shotId: shot.id, sourceShotId: shot.sourceShotId, keyframe: shot.keyframe, current: keyframeCurrent(project, shot) })) || []), port('narration', '整条视频台词', project.rewrite?.shots.map(shot => ({ shotId: shot.id, preferredStart: shot.start, narration: shot.narration })) || [])], transform: direct ? '分镜字段来自原片分析；最终生成 Prompt 可在 Veo 卡片中检查和编辑。' : '模型输出后可由用户编辑。这里展示当前保存的分镜与关键帧，不一定等于模型最初返回的版本。' });
  add({ id: 'plan', title: '生产单元规划', eyebrow: '06 · 本地转换', status: plan.length ? 'done' : 'waiting', evidence: 'reconstructed',
    inputs: [input('storyboard', '分镜 JSON', 'rewrite', 'storyboard')], outputs: [port('units', '全部对应镜头', plan), port('unit', '当前选中镜头', unit || null)], transform: '一个参考镜头对应一个生成片段。接口源片固定 8 秒；短镜头裁切，长镜头调整速度到目标时长，最后按镜头顺序拼接。画布展开当前镜头。' });
  add({ id: 'slice', title: '当前单元分镜与台词', eyebrow: '07 · 本地转换', status: unit && project.rewrite ? 'done' : 'waiting', evidence: 'reconstructed',
    inputs: [input('storyboard', '完整分镜', 'rewrite', 'storyboard'), input('unit', '当前单元', 'plan', 'unit')],
    outputs: [port('shots', '本单元完整分镜', shots), port('narration', '口播时间片', cues.map(({ shotId, start, end, narration }) => ({ shotId, start, end, narration }))), port('captions', '文字时间片', cues.map(({ shotId, start, end, narration, onScreenText }) => ({ shotId, start, end, narration, onScreenText })))],
    transform: '按 sourceShotIds 取分镜，并把时间换算为片段内的相对时间。' });
  if (!direct) {
    const shot = shots[0];
    const frame = shot?.keyframe;
    add({ id: 'keyframe', title: '当前镜头的复刻关键帧', eyebrow: '07B · 图生视频首帧', status: frame?.status === 'failed' ? 'failed' : frame?.status === 'running' ? 'running' : shot && keyframeCurrent(project, shot) ? 'done' : 'waiting', evidence: frame ? 'recorded' : 'missing',
      inputs: [input('frames', '逐镜头关键帧', 'rewrite', 'keyframes'), input('unit', '对应镜头', 'plan', 'unit')],
      outputs: [port('frame', '当前复刻图与生成记录', shot ? { shotId: shot.id, sourceShotId: shot.sourceShotId, keyframe: frame, current: keyframeCurrent(project, shot) } : null)],
      transform: '使用此镜头当前有效的复刻图作为首帧。提交前由服务端上传到 Supabase 私有桶，并生成临时图片链接。生成记录中的图片标识用于核对是否仍与当前关键帧一致。',
      links: frame?.url ? [{ label: '打开当前复刻关键帧', url: frame.url }] : [] });
  }
  add({ id: 'default-prompt', title: '默认 Veo Prompt', eyebrow: '08 · 本地转换', status: defaultPrompt ? 'done' : 'waiting', evidence: video?.defaultPrompt ? 'recorded' : 'reconstructed',
    inputs: [input('shots', '本单元分镜', 'slice', 'shots'), input('unit', '时间范围', 'plan', 'unit'), input('product', '产品事实', 'project', 'product'), input('market', '语言与画幅', 'project', 'market')], outputs: [port('prompt', '默认 Prompt 全文', defaultPrompt)],
    transform: mode === 'tts-subtitles' ? '只组织画面要求；口播与字幕不发给 Veo，留给本地合成。' : '把画面、口播、画面文字与声音要求组织成 Veo 原生 Prompt。' });
  add({ id: 'submitted-prompt', title: '最终提交的 Prompt', eyebrow: '09 · 用户可编辑', status: video ? 'done' : 'waiting', evidence: video ? 'recorded' : 'missing',
    inputs: [input('default', '默认 Prompt', 'default-prompt', 'prompt')], outputs: [port('prompt', '实际提交的 Prompt', video?.prompt || null)],
    transform: video?.defaultPrompt ? video.prompt === video.defaultPrompt ? '提交时未修改默认 Prompt；服务端随后不再改写此字符串。' : '提交前编辑过 Prompt；服务端随后不再改写此字符串。' : '历史默认 Prompt 未留存，无法判断当时是否编辑；保存的实际提交 Prompt 可查看。' });
  add({ id: 'generation-options', title: '生成参数与图片链接', eyebrow: '10 · 请求输入', status: video ? 'done' : 'waiting', evidence: video ? 'recorded' : 'missing', inputs: direct ? [] : [input('frame', '图生视频首帧', 'keyframe', 'frame')],
    outputs: [port('options', '实际使用的参数', video ? { model: video.model, mode: video.mode || 't2v', resolution: video.resolution || '720p', aspect_ratio: video.aspectRatio, keyframeShotId: video.keyframeShotId, keyframeFilename: video.keyframeFilename, images: video.mode === 't2v' ? undefined : video.imageUrls || [] } : null)], transform: direct ? '使用生成前页面选择的参数。' : '模式固定为首帧图生视频，画幅跟随项目，清晰度由用户选择。图片临时链接来自服务端私有存储；历史链接可能已到期，不影响已下载的镜头片段。' });
  add({ id: 'provider-body', title: '第三方请求体', eyebrow: '11 · POST gaorui.cc', status: video ? 'done' : 'waiting', evidence: video?.providerRequest ? 'recorded' : video ? 'reconstructed' : 'missing',
    inputs: [input('prompt', '最终 Prompt', 'submitted-prompt', 'prompt'), input('options', '生成参数', 'generation-options', 'options')], outputs: [port('body', '发送的 JSON body', video ? videoRequest(video) : null)],
    transform: '组装 POST /v1/videos 的 JSON。可核对 body.prompt 与上一节点的 Prompt 是否完全相同；Authorization 密钥不展示。' });
  add({ id: 'veo-task', title: 'Veo 异步任务', eyebrow: '12 · 第三方返回', status: video?.status === 'failed' ? 'failed' : video?.status === 'running' ? 'running' : video ? 'done' : 'waiting', evidence: video ? 'recorded' : 'missing',
    inputs: [input('body', '请求 JSON', 'provider-body', 'body')], outputs: [port('task', '任务标识与状态', video ? { requestId: video.requestId || null, status: video.status, error: video.error || null } : null)],
    transform: '创建并轮询第三方任务。完整第三方响应未留存；这里只展示本机保存的标识与状态。' });
  add({ id: 'veo-source', title: '下载的 Veo 源片', eyebrow: '13 · 本机文件', status: video?.status === 'failed' ? 'failed' : video?.status === 'running' ? 'running' : video?.status === 'completed' ? 'done' : 'waiting', evidence: video ? 'recorded' : 'missing',
    inputs: [input('task', '第三方任务', 'veo-task', 'task')], outputs: [port('file', '本机 Veo 片段', video ? { id: video.id, status: video.status, filename: video.filename || null, duration: video.duration, width: video.width, height: video.height, hasAudio: video.hasAudio, size: video.size } : null)],
    transform: '根据任务 ID 轮询视频并下载到本机。第三方临时下载地址和完整响应未留存。', links: video?.url ? [{ label: '打开 Veo 源片', url: video.url }] : [] });
  if (mode === 'tts-subtitles') {
    add({ id: 'tts', title: '本机生成配音', eyebrow: '14A · macOS say', status: composed ? 'done' : 'waiting', evidence: composed?.renderTrace ? 'recorded' : composed ? 'missing' : 'reconstructed',
      inputs: [input('narration', '完整口播原文', 'rewrite', 'narration'), input('market', '目标语言', 'project', 'market')], outputs: [port('audio', '本片段实际配音记录', composed?.renderTrace?.voiceSegments || null), port('timeline', '整条视频配音时间线', composed?.renderTrace?.speechTimeline || null)],
      transform: composed && !composed.renderTrace?.timingVersion ? '历史任务使用逐镜头对齐；以当时记录为准。' : `使用 ${composed?.voice || project.ttsVoice || '目标语言默认音色'} 读取完整台词，统一排布连续配音，允许跨镜头和生产单元；必要时最多轻微加速 15%。本机缓存配音供片段与成片复用，不修改台词原文。` });
    add({ id: 'captions', title: '制作字幕图层', eyebrow: '14B · Swift / SRT', status: composed ? 'done' : 'waiting', evidence: composed?.renderTrace ? 'recorded' : composed ? 'missing' : 'reconstructed',
      inputs: [input('cues', '镜头画面文字', 'slice', 'captions'), input('audio', '实际配音时间', 'tts', 'audio')], outputs: [port('layers', '图层时间记录', composed?.renderTrace?.captionCues || null), port('srt', 'SRT 字幕文件', composed?.subtitleFilename || null)],
      transform: '画面文字在上，跟随镜头；口播字幕在下，跟随实际声音时间。Swift 绘制透明 PNG，SRT 使用相同的配音时间码。历史逐镜头任务以其记录为准。', links: composed?.subtitleUrl ? [{ label: '下载 SRT', url: composed.subtitleUrl }] : [] });
    add({ id: 'mux', title: '烧录并混音', eyebrow: '15 · FFmpeg', status: composed ? 'done' : 'waiting', evidence: composed?.renderTrace ? 'recorded' : composed ? 'missing' : 'reconstructed',
      inputs: [input('video', 'Veo 源片', 'veo-source', 'file'), input('audio', '本机配音', 'tts', 'audio'), input('layers', '字幕图层', 'captions', 'layers'), input('unit', '裁切时长', 'plan', 'unit')],
      outputs: [port('video', '带配音字幕的片段', composed ? { filename: composed.filename, duration: composed.duration, voice: composed.voice, sourceVideoIds: composed.sourceVideoIds } : null), port('filter', 'FFmpeg 滤镜图', composed?.renderTrace?.filterGraph || null)],
      transform: '将源片裁切或调整速度到镜头目标时长，移除 Veo 原声、叠加 PNG 字幕图层并混入 TTS，输出 H.264 / AAC。', links: composed?.url ? [{ label: '打开合成片段', url: composed.url }] : [] });
  }
  return nodes;
}
