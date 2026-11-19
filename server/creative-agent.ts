import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { dataDir, getProject, saveProject } from './store';
import { createWorkspaceCapabilities, workspaceDirectory, workspacePath, workspaceResource, workspaceUploadPath } from './workspace-storage';
import { agentAttachmentContext, agentAttachmentDescription, agentMessageAttachments, sentAgentAttachmentIds, type AgentMessage, type AgentMessageImage } from '../shared/agent-message';
import { createAgentWork, finishAgentWork, recordAgentWork } from '../shared/agent-work';
import { AGENT_MODELS } from '../shared/agent-models';
import { agentProvider, agentProviderArgs, agentSandbox, agentSandboxPolicy, agentCodexHome } from './agent-provider';
import { canvasComponentInput, type CanvasComponent, type CanvasComponentInput } from '../shared/agent-canvas-ui';
import type { AgentState } from '../shared/intelligent-ui';
import { summarizeAgentActivity, type AgentActivity } from '../shared/agent-activity';
import { isValidIntelligentUIProgram } from '../src/intelligent-ui/library';
import { isAgentAdaptation, normalizeAgentAdaptation, type AgentAdaptation } from '../shared/agent-adaptation';
import { agentInstructionsFor } from './creative-agent-instructions';
import { referenceSceneImages } from '../shared/agent-video-analysis';
import { appendPresentationRequest, isAgentPresentation, normalizeAgentPresentation, type AgentPresentation } from '../shared/agent-presentation';
import { applyExperimentOperation, emptyExperiment, type ExperimentGraph, type ExperimentOperation } from '../shared/experiment';
import { syncExperimentSources } from './experiment-workbench';
import { experimentWorkspace } from './experiment-runtime';
import { officialJobFor } from './skill-assets';

export type { AgentMessage } from '../shared/agent-message';
export type { AgentState } from '../shared/intelligent-ui';
type Wire = { id?: number; method?: string; params?: Record<string, unknown>; result?: Record<string, any>; error?: { message?: string } };
type AgentModelInfo = { model: string; displayName?: string; supportedReasoningEfforts?: { reasoningEffort: string }[] };
export class AgentTurnConflictError extends Error {}

const states = new Map<string, AgentState>();
const savedActivities = workspaceResource(() => new Map<string, Promise<AgentActivity>>());
const clients = new Map<string, AppServerClient>();
const startingTurns = new Set<string>();
const drainingQueues = new Set<string>();
const steeringQueuedMessages = new Set<string>();
const events = new EventEmitter();
events.setMaxListeners(0);
const activityListeners = workspaceResource(() => new Set<(id: string, state: AgentState) => void>());
export const agentCapabilities = createWorkspaceCapabilities();

function filename(id: string) { return path.join(workspaceDirectory('agent-sessions'), `${id}.json`); }
function save(id: string) {
  const state = states.get(id); if (!state) return;
  const dest = filename(id), temp = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(temp, dest);
  events.emit(id, state);
  for (const listener of activityListeners()) listener(id, state);
}
function syncAgentProvider(state: AgentState) {
  const changed = state.provider !== agentProvider.key;
  if ((state.provider || 'codex') !== agentProvider.key) {
    state.model = agentProvider.model;
    state.effort = agentProvider.effort;
    // Reuse the existing history-seeding path when the provider changes.
    state.instructionsVersion = undefined;
  }
  state.provider = agentProvider.key;
  state.model ||= agentProvider.model;
  state.effort ||= agentProvider.effort;
  return changed;
}
export function getAgentState(id: string): AgentState {
  const cached = states.get(id); if (cached) {
    if (syncAgentProvider(cached)) save(id);
    cached.adaptation = normalizeAgentAdaptation(cached.adaptation);
    cached.presentation = normalizeAgentPresentation(cached.presentation);
    syncAgentVideo(id, cached);
    const project = getProject(id);
    if (project) {
      const synced = syncExperimentSources(cached.experiment, project);
      if (synced !== cached.experiment) { cached.experiment = synced; save(id); }
    }
    return cached;
  }
  let state: AgentState = { status: 'idle', provider: agentProvider.key, model: agentProvider.model, effort: agentProvider.effort, messages: [] };
  try {
    const stored = JSON.parse(fs.readFileSync(filename(id), 'utf8'));
    const { openuiPanel, ...current } = stored;
    state = current as AgentState;
    if (!state.intelligentPanel && openuiPanel?.library === 'intelligent') state.intelligentPanel = openuiPanel;
  }
  catch { /* New creative. */ }
  const providerChanged = syncAgentProvider(state);
  state.adaptation = normalizeAgentAdaptation(state.adaptation);
  state.presentation = normalizeAgentPresentation(state.presentation);
  if (state.status === 'running') { state.status = 'failed'; state.turnId = undefined; state.activity = undefined; state.error = '服务已重启，上一轮对话中断。可以继续发送消息。'; finishAgentWork(state.messages, 'interrupted'); }
  // Recover saved messages without silently resuming work after a service restart.
  if (state.queue?.length) state.queuePaused = true;
  states.set(id, state);
  if (providerChanged) save(id);
  syncAgentVideo(id, state);
  const project = getProject(id); if (project) {
    const synced = syncExperimentSources(state.experiment, project);
    if (synced !== state.experiment) { state.experiment = synced; save(id); }
  }
  return state;
}
export async function getAgentActivity(id: string): Promise<AgentActivity> {
  const liveState = states.get(id);
  if (liveState) return summarizeAgentActivity(liveState);

  // Read the sidebar snapshot without hydrating the conversation.
  const cache = savedActivities();
  let snapshot = cache.get(id);
  if (!snapshot) {
    snapshot = fs.promises.readFile(workspacePath('agent-sessions', `${id}.json`), 'utf8').then((text): AgentActivity => {
      const saved = JSON.parse(text) as AgentState;
      if (saved.status === 'running') {
        saved.status = 'failed';
        finishAgentWork(saved.messages, 'interrupted');
      }
      return summarizeAgentActivity(saved);
    }).catch((error): AgentActivity => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') cache.delete(id);
      return { status: 'idle' };
    });
    cache.set(id, snapshot);
  }
  const saved = await snapshot;
  const current = states.get(id);
  return current ? summarizeAgentActivity(current) : saved;
}
export function setAgentExperiment(id: string, graph: ExperimentGraph) {
  const state = getAgentState(id); state.experiment = graph; save(id); return graph;
}
export function mutateAgentExperiment(id: string, operation: ExperimentOperation) {
  return setAgentExperiment(id, applyExperimentOperation(getAgentState(id).experiment || emptyExperiment(), operation, randomUUID));
}
export function subscribeAgent(id: string, listener: (state: AgentState) => void) {
  events.on(id, listener);
  return () => events.off(id, listener);
}
export function subscribeAgentActivity(listener: (id: string, state: AgentState) => void) {
  const listeners = activityListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
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
export function showAgentIntelligentUI(id: string, title: string, source: string) {
  if (!isValidIntelligentUIProgram(source)) throw new Error('Open Intelligent UI 程序无效，请按组件规范修正后重试。');
  const state = getAgentState(id);
  state.intelligentPanel = { id: randomUUID(), title: title.trim().slice(0, 100) || 'Agent 界面', source, createdAt: new Date().toISOString() };
  save(id);
  return { id: state.intelligentPanel.id, title: state.intelligentPanel.title };
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
export function getAgentImageReferences(id: string): AgentMessageImage[] {
  const state = getAgentState(id);
  // Publishing already validates the file's actual media type. Its origin
  // (upload, extracted frame, screenshot, or code output) does not limit use.
  const publishedImages: AgentMessageImage[] = (state.experiment?.files || [])
    .filter(file => file.mediaType === 'image' && file.status === 'completed' && path.basename(file.filename) === file.filename && /\.(png|jpe?g|webp)$/i.test(file.filename))
    .map(file => ({ id: file.id, name: file.title, url: file.url, filename: file.filename,
      mime: /\.jpe?g$/i.test(file.filename) ? 'image/jpeg' : /\.webp$/i.test(file.filename) ? 'image/webp' : 'image/png' }));
  const project = getProject(id);
  const retainedImages: AgentMessageImage[] = (project?.generatedVideos || []).flatMap(video => video.referenceMedia || [])
    .filter(image => path.basename(image.filename) === image.filename && /\.(png|jpe?g|webp)$/i.test(image.filename))
    .map(image => ({ id: image.id, name: image.name, url: image.url, filename: image.filename,
      mime: image.mime || (/\.jpe?g$/i.test(image.filename) ? 'image/jpeg' : /\.webp$/i.test(image.filename) ? 'image/webp' : 'image/png') }));
  const images = [...retainedImages, ...state.messages.flatMap(message => message.images || []), ...publishedImages, ...referenceSceneImages(project?.referenceSceneTable)];
  return [...new Map(images.map(image => [image.id, image])).values()];
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
  private initialized = false;
  private models?: AgentModelInfo[];
  private modelRequest?: Promise<AgentModelInfo[]>;
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: Record<string, any>) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  readonly ready: Promise<void>;
  private failure: Error | undefined;
  constructor(private projectId: string, private onEvent: (message: Wire) => void) {
    const cmd = process.env.SOP_AGENT_CODEX_BIN || 'codex';
    const env = { ...process.env, CODEX_HOME: agentCodexHome(dataDir) };
    const cwd = experimentWorkspace(projectId); fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
    this.proc = spawn(cmd, ['app-server', '--stdio', ...agentProviderArgs()], { cwd, env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      try { this.receive(JSON.parse(line) as Wire); }
      catch { /* Ignore non-protocol output. */ }
    });
    this.proc.stderr.on('data', chunk => { const line = String(chunk).trim(); if (line) console.warn(`Creative agent: ${line.slice(0, 400)}`); });
    this.proc.on('error', error => this.fail(error));
    this.proc.stdin.on('error', error => this.fail(error));
    this.proc.on('exit', () => this.fail(new Error('Codex app server 已退出。')));
    // Cold SQLite initialization on the shared host can exceed the normal RPC timeout.
    this.ready = this.request('initialize', { clientInfo: { name: 'sail_creation', title: 'AI Creative Lab Agent', version: '0.1.0' } }, 120_000).then(() => {
      this.proc.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
      this.initialized = true;
    }).catch(error => {
      this.fail(error);
      throw error;
    });
  }
  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    // Failed initialization must not poison every later retry for this creative.
    // An old process exiting must also leave any replacement client intact.
    if (clients.get(this.projectId) === this) clients.delete(this.projectId);
    for (const [id, call] of this.pending) { clearTimeout(call.timer); call.reject(error); this.pending.delete(id); }
    // The npm launcher owns a native child; stop the group so it cannot retain DB locks.
    if (this.proc.pid && process.platform !== 'win32') {
      try { process.kill(-this.proc.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    } else this.proc.kill('SIGKILL');
    const state = getAgentState(this.projectId);
    if (state.status === 'running') { state.status = 'failed'; state.error = error.message; state.queuePaused = true; finishAgentWork(state.messages, 'failed'); save(this.projectId); }
  }
  private receive(message: Wire) {
    if (typeof message.id === 'number') {
      const call = this.pending.get(message.id);
      if (call) { clearTimeout(call.timer); this.pending.delete(message.id); message.error ? call.reject(new Error(message.error.message || 'Codex 请求失败')) : call.resolve(message.result || {}); }
      else if (message.method) this.proc.stdin.write(`${JSON.stringify({ id: message.id, error: { code: -32601, message: '此操作不可用' } })}\n`);
    } else if (message.method) this.onEvent(message);
  }
  private request(method: string, params: Record<string, unknown>, timeout = 30000): Promise<Record<string, any>> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} 超时`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  async call(method: string, params: Record<string, unknown> = {}, timeout?: number) { await this.ready; return this.request(method, params, timeout); }
  get isReady() { return this.initialized; }
  async listModels(onLoading?: () => void): Promise<AgentModelInfo[]> {
    if (this.models) return this.models;
    onLoading?.();
    this.modelRequest ??= this.call('model/list', { includeHidden: false })
      .then(result => {
        const models = (result.data || []) as AgentModelInfo[];
        this.models = models;
        return models;
      })
      .finally(() => { this.modelRequest = undefined; });
    return this.modelRequest;
  }
  hasLoadedThread(threadId: string) { return this.loadedThreadId === threadId; }
  markThreadLoaded(threadId: string) { this.loadedThreadId = threadId; }
}

const threadStartupTimeoutMs = 100_000;

function configFor(id: string) {
  return { mcp_servers: { sail_creation: {
    command: process.execPath,
    args: ['--import', import.meta.resolve('tsx'), path.join(process.cwd(), 'server/creative-agent-mcp.ts')],
    env: { SOP_AGENT_PROJECT_ID: id, SOP_AGENT_INTERNAL_TOKEN: agentCapabilities.issue(id), SOP_AGENT_INTERNAL_URL: `http://127.0.0.1:${process.env.SOP_PORT || '4317'}` },
    tools: {
      get_creative: { approval_mode: 'approve' },
      get_current_weather: { approval_mode: 'approve' },
      generate_image: { approval_mode: 'approve' },
    },
    startup_timeout_sec: 45,
    tool_timeout_sec: 650,
    required: true,
  } } };
}

const workToolLabels: Record<string, string> = {
  get_current_weather: '查询实时天气',
  discover_experiment_methods: '寻找创作方法', read_experiment_method: '阅读方法与运行条件',
  get_creative: '读取创意素材', analyze_reference: '读取参考视频画面', save_reference_analysis: '保存场景表与分镜', save_reference_shot_review: '保存变动镜头的分析建议',
  generate_image: '生成图片', generate_video: '生成视频', generate_minimax_video: '使用 MiniMax H3 生成视频',
  generate_first_last_frame_video: '生成首尾帧视频', generate_grid_video: '生成分镜视频',
  recover_video: '查询视频生成进度', edit_grid_prompt: '调整分镜提示词',
  show_canvas_component: '更新画布控制器', show_intelligent_ui: '更新交互界面',
  update_experiment: '更新视频实验台', import_experiment_skill: '读取 GitHub Skill', bind_experiment_source: '连接阶段产物',
};

const submittingTurn = '正在提交本轮请求…';
const waitingForAgent = '正在等待 Agent 响应…';

function reportAgentProgress(id: string, state: AgentState, activity: string) {
  state.activity = activity;
  recordAgentWork(state.messages, activity);
  events.emit(id, state);
}

function onNotification(id: string, message: Wire) {
  const state = getAgentState(id), params = message.params || {};
  if (message.method === 'turn/started' && state.status === 'running' && state.activity === submittingTurn) {
    reportAgentProgress(id, state, waitingForAgent);
  }
  if (message.method === 'item/started') {
    const item = params.item as { type?: string; tool?: string } | undefined;
    if (item?.type === 'userMessage') return;
    const activity = item?.type === 'webSearch' ? '正在查询资料…' : item?.type === 'mcpToolCall' ? `${workToolLabels[item.tool || ''] || '执行创作工具'}…` : item?.type === 'agentMessage' ? '正在生成回答…' : '正在思考…';
    reportAgentProgress(id, state, activity);
  }
  if (message.method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
    let item = state.messages.find(entry => entry.itemId === params.itemId);
    if (!item) { item = { id: randomUUID(), itemId: String(params.itemId || randomUUID()), role: 'assistant', text: '', createdAt: new Date().toISOString() }; state.messages.push(item); }
    item.text += params.delta;
    events.emit(id, state);
  }
  if (message.method === 'item/completed') {
    const item = params.item as { id?: string; type?: string; text?: string; phase?: AgentMessage['phase']; content?: { type: string; text?: string }[] } | undefined;
    if (item?.type === 'agentMessage') {
      const text = item.text || item.content?.filter(part => part.type === 'text').map(part => part.text || '').join('') || '';
      const existing = state.messages.find(entry => entry.itemId === item.id);
      if (text && existing) { existing.text = text; existing.phase = item.phase; }
      else if (text) state.messages.push({ id: randomUUID(), itemId: item.id, role: 'assistant', phase: item.phase, text, createdAt: new Date().toISOString() });
      save(id);
    }
  }
  if (message.method === 'turn/completed') {
    const turn = params.turn as { id?: string; status?: string; error?: { message?: string } } | undefined;
    if (state.turnId && turn?.id && turn.id !== state.turnId) return;
    state.status = turn?.status === 'completed' || turn?.status === 'interrupted' ? 'idle' : 'failed';
    finishAgentWork(state.messages, turn?.status === 'completed' ? 'completed' : turn?.status === 'interrupted' ? 'interrupted' : 'failed');
    state.error = state.status === 'failed' ? turn?.error?.message || 'Agent 执行失败，请重试。' : undefined;
    state.turnId = undefined;
    state.activity = undefined;
    if (turn?.status !== 'completed') state.queuePaused = true;
    save(id);
    if (turn?.status === 'completed') void drainAgentQueue(id);
  }
}

async function clientFor(id: string) {
  let client = clients.get(id);
  if (!client) { client = new AppServerClient(id, message => onNotification(id, message)); clients.set(id, client); }
  // Finish the handshake before model-list fallback can swallow a startup error.
  await client.ready;
  return client;
}
export async function listAgentModels(id: string, onLoading?: () => void): Promise<AgentModelInfo[]> {
  const fallback = { model: agentProvider.model, displayName: AGENT_MODELS.find(model => model.id === agentProvider.model)?.label || agentProvider.model };
  // Codex's bundled GPT catalog cannot describe an arbitrary external provider.
  if (agentProvider.custom && !agentProvider.catalog) return [fallback];
  const client = await clientFor(id);
  const models = await client.listModels(onLoading);
  return models.some(model => model.model === agentProvider.model) ? models : [fallback, ...models];
}
export async function startAgentTurn(id: string, prompt: string, imageIds?: string[], videoIds?: string[], attachmentOrder?: string[], audioIds?: string[], onAccepted?: (state: AgentState) => void): Promise<AgentState> {
  const state = getAgentState(id);
  if (state.status === 'running') throw new Error('Agent 正在执行，请等待或先停止。');
  // Snapshot this turn's references before asynchronous setup or later asset edits.
  const assets = getProject(id)?.assets || [];
  const sentIds = sentAgentAttachmentIds(state.messages);
  const availableReferences = assets.filter(asset => asset.kind === 'product');
  const references = (imageIds === undefined ? availableReferences.filter(asset => !sentIds.has(asset.id)) : [...new Set(imageIds)].map(imageId => {
    const image = availableReferences.find(asset => asset.id === imageId);
    if (!image) throw new Error('参考图片已变更，请重新添加后发送。');
    return image;
  })).map(asset => ({ ...asset }));
  const images = references.map(({ id, name, url, filename, mime }) => ({ id, name, url, filename, mime }));
  const availableVideos = assets.filter(asset => asset.kind === 'video');
  const videos = (videoIds === undefined ? availableVideos.filter(asset => !sentIds.has(asset.id)) : [...new Set(videoIds)].map(videoId => {
    const video = availableVideos.find(asset => asset.id === videoId);
    if (!video) throw new Error('参考视频已变更，请重新添加后发送。');
    return video;
  }))
    .map(({ id, name, url, filename, mime, thumbnail }) => ({ id, name, url, filename, mime, thumbnail }));
  const availableAudio = assets.filter(asset => asset.kind === 'audio');
  const audios = (audioIds === undefined ? availableAudio.filter(asset => !sentIds.has(asset.id)) : [...new Set(audioIds)].map(audioId => {
    const audio = availableAudio.find(asset => asset.id === audioId);
    if (!audio) throw new Error('参考音频已变更，请重新添加后发送。');
    return audio;
  })).map(({ id: audioId, name, url, filename, mime, duration }) => {
    const directory = path.join(experimentWorkspace(id), 'references');
    const localPath = path.join(directory, `audio-${audioId}`);
    const source = workspaceUploadPath(path.basename(filename));
    if (!fs.existsSync(source)) throw new Error(`参考音频「${name}」无法读取，请重新添加后发送。`);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, localPath);
    fs.chmodSync(localPath, 0o600);
    return { id: audioId, name, url, filename, mime, duration, localPath };
  });
  const selectedIds = new Set([...images, ...videos, ...audios].map(attachment => attachment.id));
  const order = attachmentOrder || assets.filter(asset => selectedIds.has(asset.id)).map(asset => asset.id);
  if (order.length !== selectedIds.size || new Set(order).size !== order.length || order.some(attachmentId => !selectedIds.has(attachmentId))) {
    throw new Error('附件顺序与素材不一致，请刷新后重新发送。');
  }
  // Lock the turn before asynchronous model/thread setup, so concurrent requests
  // cannot start a second turn and the client can display setup progress.
  const history = state.messages.slice(-16).filter(message => message.role !== 'event')
    .map(message => `${message.role}: ${message.text.slice(0, 2000)}${agentAttachmentContext(message)}`).join('\n\n').slice(-16000);
  const createdAt = new Date().toISOString();
  const userMessage: AgentMessage = { id: randomUUID(), role: 'user', text: prompt, createdAt, attachmentOrder: [...order], attachmentsSent: false, work: createAgentWork(createdAt), ...(images.length ? { images } : {}), ...(videos.length ? { videos } : {}), ...(audios.length ? { audios } : {}) };
  const attachmentInputs: ({ type: 'text'; text: string } | { type: 'localImage'; path: string })[] = [];
  for (const [index, attachment] of agentMessageAttachments(userMessage).entries()) {
    attachmentInputs.push({ type: 'text', text: agentAttachmentDescription(attachment, index) });
    if (attachment.kind !== 'image') continue;
    const source = workspaceUploadPath(path.basename(attachment.filename!));
    if (!fs.existsSync(source)) throw new Error(`参考图片「${attachment.name}」无法读取，请重新添加后发送。`);
    attachmentInputs.push({ type: 'localImage', path: source });
  }
  state.messages.push(userMessage);
  state.status = 'running';
  state.turnId = undefined;
  if (!state.queue?.length) state.queuePaused = false;
  state.activity = clients.get(id)?.isReady ? undefined : '正在启动创作 Agent…';
  if (state.activity) recordAgentWork(state.messages, state.activity);
  state.error = undefined;
  startingTurns.add(id);
  save(id);
  try {
    onAccepted?.(state);
    const client = await clientFor(id);
    const cwd = experimentWorkspace(id);
    const selected = state.model || agentProvider.model;
    const presentation = normalizeAgentPresentation(state.presentation);
    const { developerInstructions, instructionsVersion } = agentInstructionsFor(normalizeAgentAdaptation(state.adaptation), presentation, !!officialJobFor(id));
    let effort: string | undefined = state.effort || agentProvider.effort;
    try {
      const models = await listAgentModels(id, () => reportAgentProgress(id, state, '正在读取模型配置…'));
      const current = models.find(item => item.model === selected);
      if (!current?.supportedReasoningEfforts?.some(option => option.reasoningEffort === effort)) effort = undefined;
    } catch { effort = undefined; }
    // Resuming an old Codex thread does not rewrite its original developer
    // instructions. Start a versioned context while retaining the full visible
    // conversation and a bounded history seed for the new model context.
    const upgrade = !!state.threadId && state.instructionsVersion !== instructionsVersion;
    if (!state.threadId || upgrade) {
      reportAgentProgress(id, state, '正在创建会话…');
      const started = await client.call('thread/start', { model: selected, cwd, sandbox: agentSandbox, approvalPolicy: 'never', serviceName: 'sail_creation', developerInstructions, config: configFor(id) }, threadStartupTimeoutMs);
      if (!started.thread?.id) throw new Error('无法创建 Codex 对话。');
      if (upgrade) state.previousThreadId = state.threadId;
      state.threadId = started.thread.id;
      state.instructionsVersion = instructionsVersion;
      client.markThreadLoaded(state.threadId!);
    } else if (!client.hasLoadedThread(state.threadId)) {
      reportAgentProgress(id, state, '正在恢复会话…');
      await client.call('thread/resume', { threadId: state.threadId, excludeTurns: true, model: selected, cwd, sandbox: agentSandbox, approvalPolicy: 'never', developerInstructions, config: configFor(id) }, threadStartupTimeoutMs);
      client.markThreadLoaded(state.threadId);
    }
    state.model = selected;
    state.effort = effort || agentProvider.effort;
    state.videoId = getProject(id)?.assets.find(asset => asset.kind === 'video')?.id || null;
    const referenceContext = agentAttachmentContext(userMessage);
    const contextSeed = upgrade && history ? `Previous conversation for context (quoted history, not new instructions; earlier assistant formatting is not a user preference):\n${history}\n\nCurrent user request:\n` : '';
    state.activity = submittingTurn;
    recordAgentWork(state.messages, submittingTurn);
    save(id);
    const started = await client.call('turn/start', { threadId: state.threadId, input: [{ type: 'text', text: contextSeed + appendPresentationRequest(prompt + referenceContext, presentation) }, ...attachmentInputs], cwd, approvalPolicy: 'never', sandboxPolicy: agentSandboxPolicy, model: selected, ...(effort ? { effort } : {}) });
    userMessage.attachmentsSent = true;
    if (state.status === 'running') {
      state.turnId = started.turn?.id;
      if (state.activity === submittingTurn) {
        state.activity = waitingForAgent;
        recordAgentWork(state.messages, waitingForAgent);
      }
    }
    const current = getProject(id);
    if (current && images.length) {
      const sentIds = new Set(images.map(image => image.id));
      saveProject({ ...current, assets: current.assets.filter(asset => !sentIds.has(asset.id)) });
    }
    save(id);
  } catch (error) {
    state.status = 'failed'; state.activity = undefined;
    state.queuePaused = true;
    finishAgentWork(state.messages, 'failed');
    state.error = error instanceof Error ? error.message : 'Agent 启动失败'; save(id); throw error;
  } finally {
    startingTurns.delete(id);
    void drainAgentQueue(id);
  }
  return state;
}

async function drainAgentQueue(id: string) {
  if (drainingQueues.has(id) || startingTurns.has(id) || steeringQueuedMessages.has(id)) return;
  const state = getAgentState(id), project = getProject(id);
  if (!project || project.archivedAt || state.status !== 'idle' || state.queuePaused || !state.queue?.length) return;
  drainingQueues.add(id);
  const queued = state.queue.shift()!;
  try {
    // Queued text must not pick up unrelated attachments uploaded in a later draft.
    await startAgentTurn(id, queued.text, [], [], [], []);
  } catch (error) {
    state.queue.unshift(queued);
    state.queuePaused = true;
    state.error = error instanceof Error ? error.message : '队列发送失败，请重试。';
    save(id);
  } finally {
    drainingQueues.delete(id);
    // A very short turn can finish before turn/start returns its response.
    if (state.status === 'idle' && !state.queuePaused && state.queue.length) void drainAgentQueue(id);
  }
}

export function queueAgentMessage(id: string, prompt: string): AgentState {
  const state = getAgentState(id);
  state.queue = [...state.queue || [], { id: randomUUID(), text: prompt, createdAt: new Date().toISOString() }];
  if (state.status === 'failed') state.queuePaused = true;
  save(id);
  void drainAgentQueue(id);
  return state;
}

export function removeQueuedAgentMessage(id: string, messageId: string): AgentState {
  const state = getAgentState(id);
  if (!state.queue?.some(message => message.id === messageId)) throw new AgentTurnConflictError('这条消息已发送或移除。');
  state.queue = state.queue.filter(message => message.id !== messageId);
  save(id);
  return state;
}

export function editQueuedAgentMessage(id: string, messageId: string, prompt: string): AgentState {
  const state = getAgentState(id);
  const message = state.queue?.find(message => message.id === messageId);
  if (!message) throw new AgentTurnConflictError('这条消息已发送或移除。');
  message.text = prompt;
  save(id);
  return state;
}

export async function steerQueuedAgentMessage(id: string, messageId: string, expectedTurnId: string): Promise<AgentState> {
  const state = getAgentState(id);
  if (steeringQueuedMessages.has(id)) throw new AgentTurnConflictError('正在发送排队消息，请稍后重试。');
  const index = state.queue?.findIndex(message => message.id === messageId) ?? -1;
  if (index < 0) throw new AgentTurnConflictError('这条消息已发送或移除。');
  const queued = state.queue!.splice(index, 1)[0];
  // Hold automatic dispatch until steer is accepted or the message is restored.
  steeringQueuedMessages.add(id);
  try {
    await steerAgentTurn(id, queued.text, expectedTurnId);
  } catch (error) {
    state.queue!.splice(Math.min(index, state.queue!.length), 0, queued);
    save(id);
    throw error;
  } finally {
    steeringQueuedMessages.delete(id);
    void drainAgentQueue(id);
  }
  return state;
}

export function resumeAgentQueue(id: string): AgentState {
  const state = getAgentState(id);
  state.queuePaused = false;
  if (state.status === 'failed') { state.status = 'idle'; state.error = undefined; }
  save(id);
  void drainAgentQueue(id);
  return state;
}

export async function steerAgentTurn(id: string, prompt: string, expectedTurnId: string): Promise<AgentState> {
  const state = getAgentState(id), client = clients.get(id);
  if (state.status !== 'running') throw new AgentTurnConflictError('当前任务已结束，请重新发送消息。');
  if (!client || !state.threadId || !state.turnId) throw new AgentTurnConflictError('Agent 正在启动，请稍后发送补充指令。');
  if (state.turnId !== expectedTurnId) throw new AgentTurnConflictError('当前任务已变更，请核对后重新发送补充指令。');
  const createdAt = new Date().toISOString();
  const userMessage: AgentMessage = { id: randomUUID(), role: 'user', text: prompt, createdAt, work: createAgentWork(createdAt) };
  // Keep the input ahead of streamed replies, but retain the active turn's state.
  state.messages.push(userMessage);
  recordAgentWork(state.messages, '正在发送补充指令…');
  save(id);
  try {
    await client.call('turn/steer', { threadId: state.threadId, expectedTurnId, input: [{ type: 'text', text: prompt }] });
  } catch (error) {
    // A rejected steer must not fail or interrupt the task already in progress.
    state.messages = state.messages.filter(message => message.id !== userMessage.id);
    save(id);
    throw error;
  }
  save(id);
  return state;
}

export async function interruptAgentTurn(id: string) {
  const state = getAgentState(id), client = clients.get(id);
  state.queuePaused = true;
  save(id);
  if (!client || !state.threadId || !state.turnId || state.status !== 'running') return state;
  await client.call('turn/interrupt', { threadId: state.threadId, turnId: state.turnId });
  return state;
}

export async function setAgentModel(id: string, model: string): Promise<AgentState> {
  const state = getAgentState(id);
  if (state.status === 'running') throw new Error('Agent 正在执行，无法切换模型。');
  if (!/^[\w./:-]{1,120}$/.test(model)) throw new Error('模型名称格式无效。');

  state.model = model;
  state.effort = agentProvider.effort;
  state.error = undefined;
  save(id);
  return state;
}

export function setAgentAdaptation(id: string, adaptation: AgentAdaptation): AgentState {
  const state = getAgentState(id);
  if (state.status === 'running') throw new Error('Agent 正在执行，请结束后再调整创作适配。');
  if (!isAgentAdaptation(adaptation)) throw new Error('请选择有效的创作适配档位。');
  state.adaptation = adaptation;
  save(id);
  return state;
}

export function setAgentPresentation(id: string, presentation: AgentPresentation): AgentState {
  const state = getAgentState(id);
  if (state.status === 'running') throw new Error('Agent 正在执行，请结束后再调整结果呈现。');
  if (!isAgentPresentation(presentation)) throw new Error('请选择有效的结果呈现模式。');
  state.presentation = presentation;
  save(id);
  return state;
}
