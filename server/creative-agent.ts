import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { dataDir, getProject, saveProject, uploadDir } from './store';
import type { AgentMessage } from '../shared/agent-message';
import { DEFAULT_AGENT_EFFORT, DEFAULT_AGENT_MODEL } from '../shared/agent-models';
import { canvasComponentInput, type CanvasComponent, type CanvasComponentInput } from '../shared/agent-canvas-ui';
import { isValidOpenUIProgram } from '../shared/openui-creative-library';
import { library as intelligentLibrary, isValidIntelligentUIProgram } from '../src/intelligent-ui/library';
import { promptOptions as intelligentPromptOptions } from '../src/intelligent-ui/prompt-options';

export type { AgentMessage } from '../shared/agent-message';
export type AgentState = { threadId?: string; turnId?: string; model?: string; effort?: string; videoId?: string | null; status: 'idle' | 'running' | 'failed'; error?: string; messages: AgentMessage[]; canvasComponents?: CanvasComponent[]; openuiPanel?: { id: string; title: string; source: string; library?: 'intelligent' | 'openui'; createdAt: string } };
type Wire = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, any>; error?: { message?: string } };

const sessionsDir = path.join(dataDir, 'agent-sessions');
const workDir = path.join(dataDir, 'agent-workspace');
const isolatedCodexHome = process.env.SOP_AGENT_CODEX_HOME || path.join(dataDir, 'agent-codex');
fs.mkdirSync(sessionsDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(workDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(isolatedCodexHome, { recursive: true, mode: 0o700 });
const states = new Map<string, AgentState>();
const clients = new Map<string, AppServerClient>();
const events = new EventEmitter();
events.setMaxListeners(0);
export const agentInternalToken = randomUUID();

function filename(id: string) { return path.join(sessionsDir, `${id}.json`); }
function save(id: string) {
  const state = states.get(id); if (!state) return;
  const dest = filename(id), temp = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temp, dest);
  events.emit(id, state);
}
export function getAgentState(id: string): AgentState {
  const cached = states.get(id); if (cached) {
    if (!cached.model) cached.model = DEFAULT_AGENT_MODEL;
    cached.effort ||= DEFAULT_AGENT_EFFORT;
    syncAgentVideo(id, cached); return cached;
  }
  let state: AgentState = { status: 'idle', model: DEFAULT_AGENT_MODEL, effort: DEFAULT_AGENT_EFFORT, messages: [] };
  try { state = JSON.parse(fs.readFileSync(filename(id), 'utf8')) as AgentState; }
  catch { /* New creative. */ }
  if (!state.model) state.model = DEFAULT_AGENT_MODEL;
  state.effort ||= DEFAULT_AGENT_EFFORT;
  if (state.status === 'running') { state.status = 'failed'; state.error = '服务已重启，上一轮对话中断。可以继续发送消息。'; }
  states.set(id, state);
  syncAgentVideo(id, state);
  return state;
}
export function subscribeAgent(id: string, listener: (state: AgentState) => void) {
  events.on(id, listener);
  return () => events.off(id, listener);
}
export function subscribeAgentNotification(id: string, listener: (message: Wire) => void) {
  const topic = `${id}:notification`;
  events.on(topic, listener);
  return () => events.off(topic, listener);
}
export function showAgentCanvasComponent(id: string, input: CanvasComponentInput) {
  const state = getAgentState(id);
  const parsed = canvasComponentInput.parse(input);
  const now = new Date().toISOString();
  const previous = state.canvasComponents || [];
  const existing = previous.find(component => component.kind === parsed.kind);
  const component: CanvasComponent = { ...parsed, id: existing?.id || randomUUID(), createdAt: existing?.createdAt || now, updatedAt: now };
  state.canvasComponents = [...previous.filter(item => item.kind !== parsed.kind), component].slice(-3);
  save(id);
  return component;
}
export function showAgentOpenUI(id: string, title: string, source: string, requestedLibrary: 'intelligent' | 'openui' = 'intelligent') {
  const library = requestedLibrary === 'intelligent' && isValidIntelligentUIProgram(source) ? 'intelligent'
    : requestedLibrary === 'openui' && isValidOpenUIProgram(source) ? 'openui'
    : isValidIntelligentUIProgram(source) ? 'intelligent'
    : isValidOpenUIProgram(source) ? 'openui' : null;
  if (!library) throw new Error('OpenUI 程序无效，请按完整组件规范修正后重试。');
  const state = getAgentState(id);
  state.openuiPanel = { id: randomUUID(), title: title.trim().slice(0, 100) || 'Agent 界面', source, library, createdAt: new Date().toISOString() };
  save(id);
  return { id: state.openuiPanel.id, title: state.openuiPanel.title };
}
export function updateAgentCanvasComponent(id: string, componentId: string, input: unknown) {
  const state = getAgentState(id);
  const previous = state.canvasComponents || [];
  const existing = previous.find(item => item.id === componentId);
  if (!existing) return null;
  const parsed = canvasComponentInput.parse({ ...existing, ...(input as object), kind: existing.kind });
  if (parsed.kind === 'storyboard' && parsed.selectedGridIds.some(gridId => !getProject(id)?.storyboardGrids?.some(grid => grid.id === gridId))) throw new Error('分镜 ID 不属于当前创意。');
  const updated = { ...parsed, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
  state.canvasComponents = previous.map(item => item.id === componentId ? updated : item);
  save(id);
  return updated;
}
export function closeAgentCanvasComponent(id: string, componentId: string) {
  const state = getAgentState(id);
  const previous = state.canvasComponents || [];
  state.canvasComponents = previous.filter(item => item.id !== componentId);
  if (state.canvasComponents.length === previous.length) return false;
  save(id);
  return true;
}
export function getAgentImageReferences(id: string) {
  return [...new Map(getAgentState(id).messages.flatMap(message => message.images || []).map(image => [image.id, image])).values()];
}
function syncAgentVideo(id: string, state: AgentState) {
  if (!state.messages.length) return;
  const video = getProject(id)?.assets.find(asset => asset.kind === 'video');
  const nextId = video?.id || null;
  if (state.videoId === nextId) return;
  if (state.videoId !== undefined || video) state.messages.push({ id: randomUUID(), role: 'event', text: video ? `已为当前创意添加参考视频：${video.name}` : '已从当前创意移除参考视频。', createdAt: new Date().toISOString() });
  state.videoId = nextId;
  save(id);
}
export function noteAgentVideoChanged(id: string) {
  if (states.has(id) || fs.existsSync(filename(id))) syncAgentVideo(id, getAgentState(id));
}

class AppServerClient {
  private proc: ChildProcessWithoutNullStreams;
  private loadedThreadId: string | undefined;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: Record<string, any>) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private ready: Promise<void>;
  constructor(private projectId: string, private onEvent: (message: Wire) => void) {
    const cmd = process.env.SOP_AGENT_CODEX_BIN || 'codex';
    const env = { ...process.env, CODEX_HOME: isolatedCodexHome };
    this.proc = spawn(cmd, ['app-server', '--stdio'], { cwd: workDir, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      try { this.receive(JSON.parse(line) as Wire); }
      catch { /* Ignore non-protocol output. */ }
    });
    this.proc.stderr.on('data', chunk => { const line = String(chunk).trim(); if (line) console.warn(`Creative agent: ${line.slice(0, 400)}`); });
    this.proc.on('error', error => this.fail(error));
    this.proc.on('exit', () => { this.fail(new Error('Codex app server 已退出。')); clients.delete(projectId); });
    this.ready = this.request('initialize', { clientInfo: { name: 'sail_creation', title: 'Sail Creation Agent', version: '0.1.0' } }).then(() => {
      this.proc.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
    });
  }
  private fail(error: Error) {
    for (const [id, call] of this.pending) { clearTimeout(call.timer); call.reject(error); this.pending.delete(id); }
    const state = getAgentState(this.projectId);
    if (state.status === 'running') { state.status = 'failed'; state.error = error.message; save(this.projectId); }
  }
  private receive(message: Wire) {
    if (typeof message.id === 'number') {
      const call = this.pending.get(message.id);
      if (call) { clearTimeout(call.timer); this.pending.delete(message.id); message.error ? call.reject(new Error(message.error.message || 'Codex 请求失败')) : call.resolve(message.result || {}); }
      else if (message.method) this.proc.stdin.write(`${JSON.stringify({ id: message.id, error: { code: -32601, message: '此操作不可用' } })}\n`);
    } else if (message.method) this.onEvent(message);
  }
  private request(method: string, params: Record<string, unknown>, timeout = 30000): Promise<Record<string, any>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} 超时`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  async call(method: string, params: Record<string, unknown> = {}, timeout?: number) { await this.ready; return this.request(method, params, timeout); }
  hasLoadedThread(threadId: string) { return this.loadedThreadId === threadId; }
  markThreadLoaded(threadId: string) { this.loadedThreadId = threadId; }
}

function configFor(id: string) {
  return { mcp_servers: { sail_creation: {
    command: process.execPath,
    args: [path.join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'), path.join(process.cwd(), 'server/creative-agent-mcp.ts')],
    env: { SOP_AGENT_PROJECT_ID: id, SOP_AGENT_INTERNAL_TOKEN: agentInternalToken, SOP_AGENT_INTERNAL_URL: `http://127.0.0.1:${process.env.SOP_PORT || '4317'}` },
    startup_timeout_sec: 15,
    tool_timeout_sec: 650,
    required: true,
  } } };
}
const instructions = `You are the creation agent inside Sail's Agent mode. Speak Chinese unless the user uses another language. Keep conversational replies concise and natural. Publish visual or interactive answers to the right panel through show_openui_ui using the Open Intelligent UI library; do not print OpenUI Lang as chat prose. Never invent image URLs or facts; render images only when a tool or the current creative provides a real URL, except SearchImage which resolves public reference photos by subject. Your only creation tools are the sail_creation MCP tools. Do not use shell, file editing, web browsing, or other plugins to work on a creative. Never claim a tool ran unless it did. Read current creative state before planning actions. Each creative owns its own reference video; videos attached to other creatives are not attached here. If this creative has no reference video and the user wants video recreation, tell the user to use the persistent "为此创意选择参考视频" control in the chat. If a reference video exists and the user clearly asks to recreate/remix it, call analyze_reference only when no current analysis exists, or when the user explicitly asks to redo it; otherwise reuse the edited analysis and grids. If the user explicitly requests an image, call generate_image with a clear visual prompt and the requested aspect ratio. For edits, get_creative lists imageReferences belonging to this creative; pass the chosen IDs as referenceIds. Generated images can be iterated on by ID. Do not generate extra images just because the user requests video recreation. If input is missing or ambiguous, ask a concise question or propose a plan. A generic request to recreate a video authorizes analysis, but not video generation. Use generate_video for text-to-video or a prompt with 1–7 reference images; referenceIds come from imageReferences or grids in get_creative. Uploaded chat reference images and completed generated images are valid inputs. Use generate_first_last_frame_video when the user specifies a first frame and an end frame, passing their IDs in that order. Use generate_grid_video only for an existing storyboard grid and its saved prompt. Video tools call the real Omni service and do not require video analysis or a storyboard for standalone generation. Default to 720p and 10 seconds; support 8 seconds and 1080p when requested. Only submit video generation when the user requests it, including a clear confirmation of the proposed video prompt. Existing grid prompts are user-editable source of truth. Read get_creative to check pending video records; never submit the same request again just because a tool returns pending or a polling timeout. If a failed video has requestId, use recover_video to resume querying without submitting again. If a submission result is unknown without a requestId, report the uncertainty and ask before creating a new request. After long tools, read the creative again. When analysis or image generation is running, explain progress briefly; don't fabricate results. For text-to-image use generate_image without referenceIds; for image edits pass referenceIds. Image generation uses the configured image provider, not the Omni video endpoint. Do not claim real generated videos are local test clips; get_creative videos contains the actual model and status.`;

const canvasUiInstructions = ` The interface has a left conversation and a right OpenUI surface. For a request that benefits from a visual answer (weather, comparison, table, options, media, dashboard, or editable controls), call show_openui_ui with library="intelligent" and a complete OpenUI Lang program from the Open Intelligent UI component library. Publish it during the turn as soon as grounded data is available; then write a short natural-language answer in chat. Use $variables and @functions for controls that update the displayed UI without another model turn. Never invent facts, sources, weather conditions, or image URLs. If a required detail such as the city is missing, ask for it and you may show a clarification UI. When a user's request involves camera motion, color grading, or choosing storyboard grids, call show_canvas_component as soon as you infer useful initial parameters, before long-running creation tools. The tool reveals an interactive controller on the video canvas. Use camera for camera movement, color for grading, and storyboard for grid selection. Fill parameters from the user's request; do not invent unavailable grid IDs. Showing a controller does not authorize video generation. Later get_creative calls include the user's current canvas controller settings. The original OpenUI library remains available by explicitly setting library="openui" in show_openui_ui.`;
const openuiInstructions = intelligentLibrary.prompt(intelligentPromptOptions);

function onNotification(id: string, message: Wire) {
  events.emit(`${id}:notification`, message);
  const state = getAgentState(id), params = message.params || {};
  if (message.method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
    let item = state.messages.find(entry => entry.itemId === params.itemId);
    if (!item) { item = { id: randomUUID(), itemId: String(params.itemId || randomUUID()), role: 'assistant', text: '', createdAt: new Date().toISOString() }; state.messages.push(item); }
    item.text += params.delta;
    events.emit(id, state);
  }
  if (message.method === 'item/completed') {
    const item = params.item as { id?: string; type?: string; text?: string; content?: { type: string; text?: string }[] } | undefined;
    if (item?.type === 'agentMessage') {
      const text = item.text || item.content?.filter(part => part.type === 'text').map(part => part.text || '').join('') || '';
      const existing = state.messages.find(entry => entry.itemId === item.id);
      if (text && existing) existing.text = text;
      else if (text) state.messages.push({ id: randomUUID(), itemId: item.id, role: 'assistant', text, createdAt: new Date().toISOString() });
      save(id);
    }
  }
  if (message.method === 'turn/completed') {
    const turn = params.turn as { id?: string; status?: string; error?: { message?: string } } | undefined;
    if (state.turnId && turn?.id && turn.id !== state.turnId) return;
    state.status = turn?.status === 'completed' || turn?.status === 'interrupted' ? 'idle' : 'failed';
    state.error = state.status === 'failed' ? turn?.error?.message || 'Agent 执行失败，请重试。' : undefined;
    state.turnId = undefined;
    save(id);
  }
}

async function clientFor(id: string) {
  let client = clients.get(id);
  if (!client) { client = new AppServerClient(id, message => onNotification(id, message)); clients.set(id, client); }
  return client;
}
export async function listAgentModels(id: string) {
  const client = await clientFor(id);
  const result = await client.call('model/list', { includeHidden: false });
  return (result.data || []) as { model: string; displayName?: string; supportedReasoningEfforts?: { reasoningEffort: string }[] }[];
}
export async function startAgentTurn(id: string, prompt: string, imageIds?: string[]): Promise<AgentState> {
  const state = getAgentState(id);
  if (state.status === 'running') throw new Error('Agent 正在执行，请等待或先停止。');
  // Snapshot this turn's references before asynchronous setup or later asset edits.
  const availableReferences = (getProject(id)?.assets || []).filter(asset => asset.kind === 'product');
  const references = (imageIds === undefined ? availableReferences : [...new Set(imageIds)].map(imageId => {
    const image = availableReferences.find(asset => asset.id === imageId);
    if (!image) throw new Error('参考图片已变更，请重新添加后发送。');
    return image;
  })).map(asset => ({ ...asset }));
  const images = references.map(({ id, name, url, filename, mime }) => ({ id, name, url, filename, mime }));
  const imageInputs = references.map(image => {
    const source = path.join(uploadDir, path.basename(image.filename));
    if (!fs.existsSync(source)) throw new Error(`参考图片「${image.name}」无法读取，请重新添加后发送。`);
    return { type: 'localImage' as const, path: source };
  });
  const client = await clientFor(id);
  const selected = state.model || DEFAULT_AGENT_MODEL;
  let effort: string | undefined = state.effort || DEFAULT_AGENT_EFFORT;
  try {
    const models = await listAgentModels(id);
    const current = models.find(item => item.model === selected);
    if (!current?.supportedReasoningEfforts?.some(option => option.reasoningEffort === effort)) effort = undefined;
  } catch { effort = undefined; }
  if (!state.threadId) {
    const started = await client.call('thread/start', { model: selected, cwd: workDir, sandbox: 'danger-full-access', approvalPolicy: 'never', serviceName: 'sail_creation', developerInstructions: openuiInstructions + '\n\n' + instructions + canvasUiInstructions, config: configFor(id) }, 60000);
    state.threadId = started.thread?.id;
    if (state.threadId) client.markThreadLoaded(state.threadId);
  } else if (!client.hasLoadedThread(state.threadId)) {
    await client.call('thread/resume', { threadId: state.threadId, excludeTurns: true, model: selected, cwd: workDir, sandbox: 'danger-full-access', approvalPolicy: 'never', developerInstructions: openuiInstructions + '\n\n' + instructions + canvasUiInstructions, config: configFor(id) }, 60000);
    client.markThreadLoaded(state.threadId);
  }
  if (!state.threadId) throw new Error('无法创建 Codex 对话。');
  state.model = selected;
  state.effort = effort || DEFAULT_AGENT_EFFORT;
  state.videoId = getProject(id)?.assets.find(asset => asset.kind === 'video')?.id || null;
  state.error = undefined;
  state.messages.push({ id: randomUUID(), role: 'user', text: prompt, createdAt: new Date().toISOString(), ...(images.length ? { images } : {}) });
  state.status = 'running'; save(id);
  try {
    const referenceContext = references.length ? `\n\n本条消息附带以下参考图片，编号对应附件顺序：\n${references.map((image, index) => `参考图${index + 1}：${image.name}（referenceId: ${image.id}）`).join('\n')}` : '';
    const started = await client.call('turn/start', { threadId: state.threadId, input: [{ type: 'text', text: prompt + referenceContext }, ...imageInputs], cwd: workDir, approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' }, model: selected, ...(effort ? { effort } : {}) });
    if (state.status === 'running') state.turnId = started.turn?.id;
    // Sent images live with the message; release draft slots while retaining source files.
    const current = getProject(id);
    if (current && images.length) {
      const sentIds = new Set(images.map(image => image.id));
      saveProject({ ...current, assets: current.assets.filter(asset => !sentIds.has(asset.id)) });
    }
    save(id);
  } catch (error) { state.status = 'failed'; state.error = error instanceof Error ? error.message : 'Agent 启动失败'; save(id); throw error; }
  return state;
}
export async function interruptAgentTurn(id: string) {
  const state = getAgentState(id), client = clients.get(id);
  if (!client || !state.threadId || !state.turnId || state.status !== 'running') return state;
  await client.call('turn/interrupt', { threadId: state.threadId, turnId: state.turnId });
  return state;
}

export async function setAgentModel(id: string, model: string): Promise<AgentState> {
  const state = getAgentState(id);
  if (state.status === 'running') throw new Error('Agent 正在执行，无法切换模型。');
  if (!/^[\w./:-]{1,120}$/.test(model)) throw new Error('模型名称格式无效。');

  state.model = model;
  state.effort = DEFAULT_AGENT_EFFORT;
  state.error = undefined;
  save(id);
  return state;
}
