/** Materialize the verified receipt-video history in the existing /lab canvas.
 * Reuses local media; never invokes an Agent or a generation provider.
 * Run: node --import tsx scripts/create-receipt-recap.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '../shared/domain';
import type { AgentMessage } from '../shared/agent-message';
import { experimentNodeInput, normalizeExperimentGraph, type ExperimentFile, type ExperimentGraph, type ExperimentMethod, type ExperimentNode, type ExperimentPlan, type ExperimentRun } from '../shared/experiment';
import { syncExperimentSources } from '../server/experiment-workbench';
import { receiptRecapReview } from './receipt-recap-review';

const origin = 'http://127.0.0.1:4317';
const sourceId = 'b0df844d-05ba-4fd0-b9db-eda926d8faf4';
const title = '小票变装复刻 · 完整过程回顾';
const data = path.resolve(process.env.SOP_DATA_DIR || 'data');
const manifestPath = path.join(data, 'receipt-recaps', `${sourceId}.json`);
const readJSON = async <T,>(filename: string): Promise<T> => JSON.parse(await fs.readFile(filename, 'utf8'));
async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(`${origin}${url}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}
const source = await readJSON<Project>(path.join(data, 'projects', `${sourceId}.json`));
const history = await readJSON<{ messages: AgentMessage[]; experiment: ExperimentGraph }>(path.join(data, 'agent-sessions', `${sourceId}.json`));
const original = history.experiment;
const byId = new Map(original.nodes.map(node => [node.id, node]));
const videos = source.generatedVideos;
const person = history.messages.find(message => message.role === 'user' && message.images?.length)?.images?.[0];
assert(person, 'The confirmed identity image is missing.');

const plans: ExperimentPlan[] = [
  { id: 'recap-analysis', title: '01 原片与人物', goal: '确认替换人物，保留原片七镜头、动作、服装、品牌和音轨；理解两张分镜如何获得。', goalId: 'recap-inputs' },
  { id: 'recap-direct', title: '02 整片参考生成', goal: '人物图＋两张分镜，生成第一版15秒768p视频。', goalId: 'recap-video' },
  { id: 'recap-background', title: '03 重建小票背景', goal: '根据用户提出的背景与人物分离思路，重建五套去人物小票参考。', goalId: 'recap-background' },
  { id: 'recap-reference', title: '04 加背景再生成', goal: '加入背景板尝试保留小票，记录模型仍然重绘文字的问题。', goalId: 'recap-video', basedOn: 'recap-direct' },
  { id: 'recap-composite', title: '05 固定背景合成', goal: '生成480p纯色背景人物素材，抠像后合成到静态小票，保留原片音轨。', goalId: 'recap-video', basedOn: 'recap-reference' },
  { id: 'recap-typeset', title: '06 文字校正与交付', goal: '对照原片用字体重新排版，复用人物动画，输出最终文字修正版；遮挡和不可辨认字段留白。', goalId: 'recap-video', basedOn: 'recap-composite', adopted: true, selectedArtifactId: '3d64f076-befa-454b-9f3e-3eaff2d99c8a' },
];
const nodes: ExperimentNode[] = [];
const runs: ExperimentRun[] = [];
const add = (node: ExperimentNode) => { experimentNodeInput.parse(node); nodes.push(node); return node; };
const textNode = (id: string, kind: 'asset' | 'compare', title: string, content: string, inputs: string[], planId: string, x: number, y: number) => add({ id, kind, title, content, description: content, inputs, planId, method: '', prompt: '', status: 'completed', revision: 1, inputRevisions: {}, position: { x, y }, display: { width: 280 } });
function copy(id: string, planId: string, x: number, y: number, label?: string) {
  const saved = byId.get(id); assert(saved, `Missing historical node ${id}`);
  const node = structuredClone(saved);
  node.planId = planId; node.position = { x, y }; node.revision = 1; node.status = 'completed';
  delete node.error; node.title = label || node.title;
  node.display = { width: node.mediaType === 'image' || node.mediaType === 'video' ? 220 : 280, ...node.display };
  add(node); return node;
}
function step(id: string, planId: string, inputs: string[], x: number, y: number, description: string) {
  const node = copy(id, planId, x, y);
  const recorded = original.runs?.find(run => run.stepId === id)?.method || node.methods?.[0];
  assert(recorded, `Missing recorded method ${id}`);
  const method: ExperimentMethod = { ...structuredClone(recorded), inputs: [...inputs] };
  node.inputs = [...inputs]; node.methods = [method]; node.activeMethodId = method.id;
  node.prompt = method.prompt; node.method = method.title; node.description = description;
  // Surface the stage summary on the card, with the complete original prompt in its method.
  node.content = description;
  return node;
}
function artifact(id: string, producer: ExperimentNode, x: number, y: number, label?: string) {
  const node = copy(id, producer.planId!, x, y, label);
  node.inputs = [producer.id]; node.inputRevisions = { [producer.id]: 1 }; return node;
}
function execution(producer: ExperimentNode, outputs: ExperimentNode[], startedAt: string, finishedAt: string) {
  const method = structuredClone(producer.methods![0]);
  const id = `recap-run-${producer.id}`;
  for (const output of outputs) output.runId = id;
  runs.push({ id, stepId: producer.id, planId: producer.planId!, method, inputRevisions: Object.fromEntries(method.inputs.map(id => [id, 1])), artifactIds: outputs.map(node => node.id), status: 'completed', startedAt, finishedAt });
}
const userQuotes = history.messages.filter(message => message.role === 'user').map(message => `${new Date(message.createdAt).toLocaleString('zh-CN', { timeZone: 'America/New_York', hour12: false })}\n「${message.text}」`).join('\n\n');
textNode('recap-brief', 'asset', '创作目标与原始对话', `2026年11月8日 · 纽约时间\n原任务：color\n复刻14.49秒品牌小票变装视频，人物替换为已确认的参考女性，输出15秒。\n\n${userQuotes}`, [], plans[0].id, 0, 0);
const reference = copy('reference_video', plans[0].id, 330, 0, '原片 · 14.49秒 / 720×1280');
const identity = copy('replacement_person', plans[0].id, 610, 0, '已确认人物 · 只替换身份');
const analysis = step('reference_analysis', plans[0].id, [reference.id, 'recap-brief'], 900, 0, '07:24–07:26 · Gemini 3.8 Flash分析原片与音轨，拆出七镜头；analyze_reference自动抽帧并拼成两张3×3分镜。');
analysis.methods![0].model = 'gemini-3.8-flash';
const shotText = artifact('shot_analysis', analysis, 1230, 0, '七镜头 · 顺序、动作与节奏');
shotText.content = source.analysis!.shots.map(shot => `${shot.start.toFixed(2)}–${shot.end.toFixed(2)}秒\n${shot.visual}\n动作：${shot.action}`).join('\n\n');
const gridNodes = source.storyboardGrids!.map((grid, index) => add({ id: `recap-grid-${index + 1}`, kind: 'artifact', title: `自动分镜 ${grid.start}–${grid.end.toFixed(2)}秒 · 3×3`, description: '由原视频自动抽帧拼接，按从左到右、从上到下读取；作为后续模型的图片参考。', method: '', prompt: '', content: '', sourceId: grid.id, url: grid.url, mediaType: 'image', inputs: [analysis.id], planId: analysis.planId, status: 'completed', revision: 1, inputRevisions: { [analysis.id]: 1 }, position: { x: 1570 + index * 280, y: 0 }, display: { width: 220 } }));
execution(analysis, [shotText, ...gridNodes], source.analysisRequest!.recordedAt, source.analysisMeta!.analyzedAt);

const v1 = step('recreate_plan', plans[1].id, [identity.id, ...gridNodes.map(node => node.id)], 900, 660, '07:36–07:40 · 第一次生成：人物图＋两张分镜。H3 Flex，15秒、9:16、768p，38积分。原视频用于分析，H3接收的是三张图片参考。');
const out1 = artifact('output-3b302217-7d40-4579-bbac-505628d80811', v1, 1230, 660, 'V1 整片生成 · 15秒768p');
execution(v1, [out1], videos[0].startedAt, videos[0].finishedAt!);
textNode('recap-feedback-static', 'asset', '07:48 用户提出分离背景', '「其实这种背景不动，只有人物动的，你可以把背景识别出来，弄成参考图片」\n\n转向：人物身份、动作分镜和静态背景分别准备。', [out1.id], plans[1].id, 1570, 660);

const bg = step('background_refs', plans[2].id, ['recap-feedback-static', ...gridNodes.map(node => node.id)], 900, 1320, '07:49–07:51 · GPT Image 2.6 Flare根据两张分镜移除人物、道具与阴影，补全被遮挡区域，重建五品牌背景。2880×1024，单栏576×1024。背景图本身仍有文字瑕疵。');
const board = artifact('output-737e5608-22e1-4285-aeb4-91938edca3fd', bg, 1230, 1320, '五品牌去人物背景 · 模型重建'); board.display = { width: 520, aspectRatio: 2.8125 };
const image = source.agentImages![0];
execution(bg, [board], image.createdAt, '2026-11-08T12:51:48.680Z');

const v2 = step('background-recreation-v2', plans[3].id, [identity.id, board.id, ...gridNodes.map(node => node.id)], 900, 1910, '10:22–10:28 · 人物＋背景板＋两张分镜，四张参考图。H3 Flex，15秒768p，38积分。提示词要求静态背景，但模型仍重绘整幅画面。');
const out2 = artifact('010d04b8-36dc-48ae-b42b-d5f942357fc0', v2, 1230, 1910, 'V2 背景参考版 · 仍有乱码');
execution(v2, [out2], videos[1].startedAt, videos[1].finishedAt!);
textNode('recap-feedback-redraw', 'asset', '10:53 背景参考没有锁定文字', '用户：「截图中的背景小票会有乱码，并没有按照你刚才提取的小票参考图」\n\n复核：背景板只是参考，文字仍被视频模型重绘。\n用户随后要求：「重新生成，480p的就行」\n\n改用固定图片底层＋人物抠像。', [out2.id], plans[3].id, 1570, 1910);

const fg = step('foreground-480', plans[4].id, ['recap-feedback-redraw', identity.id, ...gridNodes.map(node => node.id)], 0, 2570, '10:56–10:58 · H3 Flex单独生成人物动画，纯洋红色背景。15秒、9:16、480p，23积分，关闭生成音频；不生成人物后方的小票。');
const foreground = artifact('88c00775-3b2f-4d9a-962d-718364178192', fg, 330, 2570, '人物前景 · 480p纯色抠像素材');
execution(fg, [foreground], videos[2].startedAt, videos[2].finishedAt!);
const comp = step('composite-480', plans[4].id, [foreground.id, board.id, reference.id], 900, 2570, '10:58–11:02 · 裁切五张背景，OpenCV按实际粉红色域抠像，保护红蓝服装；剔除白底闪帧，重排各服装片段时间。Pillow制作扇形合集，FFmpeg配回原音轨。480×854 / 24fps / 15秒。');
const compOut = artifact('d79df10b-1770-40c9-bf3c-606ab2194189', comp, 1230, 2570, 'V3 固定背景合成 · 文字尚待校正');
const compCode = artifact('c8d34465-5ec0-4d86-8708-b3631e1ae1f4', comp, 1900, 2570, '抠像与合成 · Python源码');
compCode.content = await fs.readFile(path.join(data, 'agent-workspace', sourceId, 'composite_480.py'), 'utf8');
const motion = artifact('79aebe2d-cab0-4467-a101-a7a839f5c368', comp, 1900, 2920, '人物服装实际时间轴 · 调整依据'); motion.display = { width: 380 };
execution(comp, [compOut, compCode, motion], '2026-11-08T15:58:47.771Z', '2026-11-08T16:02:42.181Z');
textNode('recap-feedback-typos', 'asset', '22:47 底图本身还有错别字', '用户：「小票上还是有很多错别字、或者乱码」\n\n固定合成保留了底图像素，也保留了模型重建图里的错字。\n\n下一步：从原片核对文字，用真实字体重排，复用现有人物素材。', [compOut.id], plans[4].id, 1570, 2570);

const fix = step('receipt-text-fix', plans[5].id, ['recap-feedback-typos', reference.id, foreground.id, board.id], 900, 3300, '22:48–22:50 · 对照原片，裁取Logo；用STHeiti Medium真实字体重排品牌、可辨认商品和金额。原片遮挡或无法辨认字段留白。复用人物动画、抠像、时间轴和原音轨，重新合成。');
const fixedBoard = artifact('1f87f768-3025-4d0d-afa8-05d65aef9a18', fix, 1230, 3300, '五张小票 · 字体重排与留白'); fixedBoard.display = { width: 520, aspectRatio: 4800 / 1708 };
const final = artifact('3d64f076-befa-454b-9f3e-3eaff2d99c8a', fix, 1800, 3300, 'V4 最终文字修正版 · 15秒480p');
const verification = artifact('618cfbd5-eb09-4fdb-af21-1fe05e6d74f6', fix, 1230, 3590, '最终七镜头 · 核对图'); verification.display = { width: 520, aspectRatio: 1920 / 1708 };
const textCode = artifact('b55928a6-5f96-453a-a8f6-59474914bcab', fix, 2110, 3300, '文字重排与复用合成 · Python源码');
textCode.content = await fs.readFile(path.join(data, 'agent-workspace', sourceId, 'receipt_text_fix.py'), 'utf8');
const transcription = artifact('9a17c08f-4c2b-4a3a-a089-9d9c93fa5bb6', fix, 2110, 3650, '文字核对 · 商品、金额与留白');
transcription.content = await fs.readFile(path.join(data, 'agent-workspace', sourceId, 'text-fix', 'receipt-transcription.json'), 'utf8');
execution(fix, [fixedBoard, final, verification, textCode, transcription], '2026-11-09T03:48:32.569Z', '2026-11-09T03:50:41.820Z');
const comparison = textNode('recap-version-comparison', 'compare', '四版对比 · 最终采用V4', 'V1：人物与分镜整片生成。\nV2：加入背景板，模型仍重绘文字。\nV3：固定背景＋人物抠像，底图原有错字仍在。\nV4：真实字体重排后复用人物合成，部分不可辨认字段留白。\n\n视频生成记录：38＋38＋23＝99积分，不含背景图片。', [v1.id, v2.id, comp.id, fix.id], plans[5].id, 2470, 3300);
comparison.selectedInput = fix.id;

const files: ExperimentFile[] = structuredClone(original.files || []);
const material = (item: { id: string; filename?: string; url?: string }, label: string, mediaType: ExperimentFile['mediaType'], createdAt?: string) => {
  assert(item.filename && item.url, `Missing media for ${label}`);
  files.push({ id: item.id, title: label, filename: item.filename, url: item.url, mediaType, status: 'completed', storage: 'local', size: 0, createdAt, purpose: 'context' });
};
source.assets.forEach(asset => material(asset, asset.name, 'video', source.createdAt));
material(person, '已确认的人物身份参考', 'image', history.messages[0].createdAt);
source.storyboardGrids!.forEach(grid => material(grid, `${grid.start}–${grid.end}秒原片分镜`, 'image', grid.generatedAt));
source.agentImages!.forEach(image => material(image, '五品牌去人物背景参考板', 'image', image.createdAt));
videos.forEach((video, index) => material(video, ['V1 整片生成', 'V2 加入背景参考', '480p人物前景'][index], 'video', video.finishedAt));
const required = new Set(nodes.flatMap(node => [node.sourceId, ...(node.methods?.flatMap(method => method.referenceIds) || [])]).filter((id): id is string => !!id));
const unique = [...new Map(files.map(file => [file.id, file])).values()];
for (const id of required) assert(unique.some(file => file.id === id), `Missing source ${id}`);
const existingFiles: ExperimentFile[] = [];
for (const file of unique) {
  assert.equal(path.basename(file.filename), file.filename);
  try { file.size = (await fs.stat(path.join(data, 'uploads', file.filename))).size; existingFiles.push(file); }
  catch (error) { if (required.has(file.id)) throw error; }
}
for (const node of nodes) {
  if (node.sourceId) { const file = existingFiles.find(file => file.id === node.sourceId)!; node.url = file.url; node.mediaType = file.mediaType; }
  node.inputRevisions = Object.fromEntries(node.inputs.map(id => [id, 1]));
  for (const id of node.inputs) assert(nodes.some(input => input.id === id), `Missing dependency ${id}`);
}
const visited = new Set<string>(), visiting = new Set<string>();
const visit = (id: string) => { assert(!visiting.has(id), `Dependency cycle at ${id}`); if (visited.has(id)) return; visiting.add(id); nodes.find(node => node.id === id)!.inputs.forEach(visit); visiting.delete(id); visited.add(id); };
nodes.forEach(node => visit(node.id));
const graph: ExperimentGraph = normalizeExperimentGraph({ version: 1, organizationVersion: 1, revision: 1, title, nodes, plans, runs, files: existingFiles, templates: [], review: receiptRecapReview, updatedAt: new Date().toISOString() });

// A separate creative preserves the source's execution history and hand-arranged canvas.
let project: Project;
try {
  const manifest = await readJSON<{ projectId: string }>(manifestPath);
  project = await request<Project>(`/api/projects/${manifest.projectId}`);
  const saved = await readJSON<{ experiment?: ExperimentGraph }>(path.join(data, 'agent-sessions', `${project.id}.json`)).catch(() => ({} as { experiment?: ExperimentGraph }));
  if (saved.experiment?.nodes.length) {
    const live = await request<{ graph: ExperimentGraph }>(`/api/projects/${project.id}/agent/experiment`);
    const updated = JSON.stringify(live.graph.review) === JSON.stringify(receiptRecapReview) ? live.graph : await request<ExperimentGraph>(`/api/projects/${project.id}/agent/experiment`, { op: 'review', review: receiptRecapReview, expectedRevision: live.graph.revision });
    console.log(JSON.stringify({ url: `${origin}/lab?project=${project.id}`, reused: true, nodes: updated.nodes.length, reviewStages: updated.review?.stages.length })); process.exit(0);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  project = await request<Project>('/api/projects', { parentProjectId: source.parentProjectId, title });
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify({ sourceProjectId: sourceId, projectId: project.id, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}
assert.deepEqual(syncExperimentSources(graph, project), graph, 'The recap must survive normal live-source synchronization.');
const introductory: AgentMessage = { id: randomUUID(), role: 'assistant', createdAt: new Date().toISOString(), phase: 'final_answer', text: `已将小票变装复刻整理成六个阶段。\n\n在右侧「执行画布」从上到下回看：原片与人物 → 整片生成 → 重建背景 → 背景参考再生成 → 固定背景合成 → 文字校正与交付。\n\n点击顶部方案切换阶段，点击步骤查看完整提示词、参考图与参数，视频节点可以直接播放。最终采用「V4 最终文字修正版」。\n\n以下保留2026年11月8日的原始创作对话，时间为当时的记录。` };
const session = { status: 'idle', adaptation: 0, presentation: 'auto', messages: [introductory, ...history.messages], experiment: graph };
const destination = path.join(data, 'agent-sessions', `${project.id}.json`), temporary = `${destination}.recap.tmp`;
await fs.writeFile(temporary, JSON.stringify(session), { mode: 0o600 }); await fs.rename(temporary, destination);
const live = await request<{ graph: ExperimentGraph }>(`/api/projects/${project.id}/agent/experiment`);
assert.equal(live.graph.nodes.length, nodes.length);
assert.equal(live.graph.runs?.length, runs.length);
assert(live.graph.nodes.every(node => node.status === 'completed'));
console.log(JSON.stringify({ url: `${origin}/lab?project=${project.id}`, projectId: project.id, plans: plans.length, nodes: nodes.length, runs: runs.length, files: existingFiles.length, adoptedArtifact: final.id }));
