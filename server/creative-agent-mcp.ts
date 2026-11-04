import { createInterface } from 'node:readline';

const projectId = process.env.SOP_AGENT_PROJECT_ID || '';
const token = process.env.SOP_AGENT_INTERNAL_TOKEN || '';
const base = process.env.SOP_AGENT_INTERNAL_URL || 'http://127.0.0.1:4317';

const videoProperties = {
  prompt: { type: 'string', description: 'Complete visual, motion, camera and sound prompt.', minLength: 1, maxLength: 12000 },
  duration: { type: 'integer', enum: [8, 10], default: 10, description: 'Video duration in seconds; selects omni_flash_8s or omni_flash_10s.' },
  resolution: { type: 'string', enum: ['720p', '1080p'], default: '720p' },
  aspectRatio: { type: 'string', enum: ['16:9', '9:16'], description: 'Defaults to the current creative aspect ratio.' },
};
const tools = [
  { name: 'get_creative', description: 'Read the current creative, uploaded reference video, analysis, storyboard grids, prompts, and generated clips. Always read again after a user edit or a long task.', inputSchema: { type: 'object', properties: {} } },
  { name: 'show_openui_ui', description: 'Show a complete OpenUI Lang program in the right-side interactive UI panel during this turn. Default to the full Open Intelligent UI library with its layout, charts, maps, drawings, forms and 59 reactive functions. Use library=openui only for the original OpenUI library. All displayed facts must be grounded; SearchImage can resolve public reference photos by subject.', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 100 }, source: { type: 'string', minLength: 1, maxLength: 120000 }, library: { type: 'string', enum: ['intelligent', 'openui'] } }, required: ['title', 'source'], additionalProperties: false } },
  { name: 'show_canvas_component', description: 'Immediately reveal or update an interactive controller on the right video canvas during this turn. Use before long-running tools when camera motion, color grading, or storyboard selection is relevant. This does not generate or modify media. Later get_creative returns updated values chosen by the user.', inputSchema: { type: 'object', properties: {
    kind: { type: 'string', enum: ['camera', 'color', 'storyboard'] },
    duration: { type: 'number', minimum: 0.1, maximum: 30, description: 'Camera motion duration in seconds; camera only.' },
    strength: { type: 'number', minimum: 0, maximum: 10, description: 'Camera motion strength; camera only.' },
    direction: { type: 'string', enum: ['push', 'pull', 'pan-left', 'pan-right'], description: 'Camera movement; camera only.' },
    temperature: { type: 'integer', minimum: 2000, maximum: 10000, description: 'Color temperature in Kelvin; color only.' },
    preset: { type: 'string', enum: ['warm', 'natural', 'cool'], description: 'Color preset; color only.' },
    intensity: { type: 'number', minimum: 0, maximum: 100, description: 'Color preset intensity; color only.' },
    selectedGridIds: { type: 'array', items: { type: 'string' }, description: 'Existing grid IDs from get_creative; storyboard only.' },
    target: { type: 'string', description: 'Human-readable clip or grid target.' },
  }, required: ['kind'], additionalProperties: false } },
  { name: 'analyze_reference', description: 'Analyze the uploaded reference video into editable shots and 10-second storyboard grids. Use when the user clearly requests recreation and a video is present. This may take several minutes.', inputSchema: { type: 'object', properties: {} } },
  { name: 'edit_grid_prompt', description: 'Update one storyboard grid prompt after the user asks for a specific change. This changes the same project data shown in the canvas.', inputSchema: { type: 'object', properties: { gridId: { type: 'string' }, prompt: { type: 'string' } }, required: ['gridId', 'prompt'] } },
  { name: 'generate_grid_video', description: 'Generate a real 10-second, 720p Omni video using an existing storyboard grid and its saved prompt. Use generate_video for an arbitrary reference image and custom prompt, or generate_first_last_frame_video for a transition between two frames. Only call when the user requests a video.', inputSchema: { type: 'object', properties: { gridId: { type: 'string' } }, required: ['gridId'] } },
  { name: 'generate_video', description: 'Generate a real Omni video from a prompt and zero to seven reference images. With referenceIds this is reference-image video; without referenceIds it is text-to-video. No analysis or storyboard grid is required. Read get_creative for imageReferences or grid IDs; uploaded chat images and completed generated images can both be used. Defaults: 720p, 10 seconds. Call only when the user requests a video; never silently retry an uncertain submission.', inputSchema: { type: 'object', properties: { ...videoProperties, referenceIds: { type: 'array', items: { type: 'string' }, maxItems: 7, uniqueItems: true, default: [] } }, required: ['prompt'], additionalProperties: false } },
  { name: 'generate_first_last_frame_video', description: 'Generate a real Omni transition video between an explicit first frame and last frame. Pass their IDs in firstFrameId and lastFrameId; order matters. Read get_creative for valid IDs. No storyboard or analysis is required. Defaults: 720p, 10 seconds. Only call when the user requests a video, and ask for a missing frame rather than inventing an ID.', inputSchema: { type: 'object', properties: { ...videoProperties, firstFrameId: { type: 'string' }, lastFrameId: { type: 'string' } }, required: ['prompt', 'firstFrameId', 'lastFrameId'], additionalProperties: false } },
  { name: 'recover_video', description: 'Resume querying a failed/interrupted video with a saved upstream requestId. Does not submit a new generation or charge for another video. Read get_creative and pass the failed video ID, not its upstream requestId. Use instead of regenerating after a polling timeout.', inputSchema: { type: 'object', properties: { videoId: { type: 'string' } }, required: ['videoId'], additionalProperties: false } },
  { name: 'generate_image', description: 'Text-to-image and image editing: generate one image from a text prompt, optionally using up to four image references from this creative. Use only when the user asks for an image or an image edit. Read get_creative for valid reference IDs. The image appears on the canvas and can be used as a reference in a later call.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, aspectRatio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:5'] }, referenceIds: { type: 'array', items: { type: 'string' }, maxItems: 4 } }, required: ['prompt'] } },
];

async function call(name: string, args: Record<string, unknown>) {
  if (!projectId || !token) throw new Error('创作工具未配置。');
  const suffix = name === 'get_creative' ? '' : name === 'show_openui_ui' ? '/openui-ui' : name === 'show_canvas_component' ? '/canvas-components' : name === 'analyze_reference' ? '/analyze' : name === 'edit_grid_prompt' ? `/grids/${encodeURIComponent(String(args.gridId || ''))}/prompt` : name === 'generate_grid_video' ? `/grids/${encodeURIComponent(String(args.gridId || ''))}/generate` : name === 'generate_image' ? '/images' : name === 'generate_video' ? '/videos' : name === 'generate_first_last_frame_video' ? '/videos/first-last-frame' : name === 'recover_video' ? `/videos/${encodeURIComponent(String(args.videoId || ''))}/recover` : '';
  if (!tools.some(tool => tool.name === name)) throw new Error('未知工具。');
  const method = name === 'get_creative' ? 'GET' : 'POST';
  const response = await fetch(`${base}/api/agent-internal/${projectId}${suffix}`, {
    method, headers: { 'X-SOP-Agent-Token': token, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(args) } : {}),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error || `请求失败 (${response.status})`));
  if (name === 'get_creative' || name === 'edit_grid_prompt' || name === 'show_canvas_component' || name === 'show_openui_ui') return body;
  const deadline = Date.now() + (name === 'analyze_reference' ? 10 : 5) * 60_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const current = await fetch(`${base}/api/agent-internal/${projectId}`, { headers: { 'X-SOP-Agent-Token': token } });
    const state = await current.json() as Record<string, any>;
    if (!current.ok) throw new Error(String(state.error || '无法读取任务状态'));
    if (name === 'generate_image') {
      const image = state.images?.find((item: { id: string }) => item.id === body.imageId);
      if (image?.status === 'failed') throw new Error(String(image.error || '图片生成失败'));
      if (image?.status === 'completed') return { image, imageReferences: state.imageReferences };
      continue;
    }
    if (body.videoId) {
      const video = state.videos?.find((item: { id: string }) => item.id === body.videoId);
      if (video?.status === 'completed') return { video };
      if (video?.status === 'failed') throw new Error(String(video.error || '视频生成失败。若已有 requestId，请使用 recover_video 恢复查询，勿自动重新生成。'));
      continue;
    }
    if (state.job?.id !== body.jobId || state.job?.status === 'running') continue;
    if (state.job?.status === 'failed') throw new Error(String(state.job.message || '任务失败'));
    if (name === 'analyze_reference' && state.analysis) return state;
    if (name === 'generate_grid_video' && state.videos?.some((video: { gridId: string; status: string }) => video.gridId === args.gridId && video.status === 'completed')) return state;
    if (state.job?.status === 'completed') return state;
  }
  const { project: _project, ...pending } = body;
  return { ...pending, pending: true, message: '任务仍在后台执行。请稍后重新读取创意状态。' };
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', line => { void (async () => {
  let id: string | number | undefined;
  try {
    const message = JSON.parse(line) as { id?: string | number; method: string; params?: Record<string, unknown> };
    id = message.id;
    if (id === undefined) return;
    let result: unknown;
    if (message.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sail-creation', version: '1.0.0' } };
    else if (message.method === 'tools/list') result = { tools };
    else if (message.method === 'tools/call') {
      try { result = { content: [{ type: 'text', text: JSON.stringify(await call(String(message.params?.name || ''), (message.params?.arguments || {}) as Record<string, unknown>)) }] }; }
      catch (error) { result = { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : '工具执行失败' }] }; }
    } else throw new Error(`Unsupported method: ${message.method}`);
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
  } catch (error) {
    if (id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : '工具错误' } })}\n`);
  }
})(); });
