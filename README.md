# AI Creative Lab

在创作 Agent 中分析参考视频、调整制作方案、生成场景素材与片段、拼接并交付成片。各创意的素材、方案和产物保存在各自的工作空间。

## 项目与创意

视频创作实验台入口：本机启动后打开 `/lab`，或在创作 Agent 右侧选择「创作实验台」。支持动态制作路径、固定版本的 GitHub Skill、输入与阶段产物关联、备选方案、过期提示和流程配方。本机程序化创作使用每个创意独立的代码工作目录；完整产品方案、操作与能力边界见 [视频创作实验台](docs/video-experiment-workbench.md)。

当前默认一个「我的工作空间」，工作空间下有多个项目，每个项目可创建多个创意。例如「夏装」项目下创建「色卡夏装换装上」「青少年夏装」两个创意。项目负责归类；参考视频、产品资料、分析、Prompt、生成任务与成片都独立保存在各自创意中。

左侧「项目」旁的加号创建项目，项目行的加号在该项目下创建创意；展开项目后切换创意。顶部路径显示「我的工作空间 → 项目 → 创意」；点击项目名可重命名，点击创意名可修改名称和所属项目。归档与恢复作用于单个创意。

原有创意自动归入「默认项目」，保留原 ID、素材与制作结果，可通过编辑所属项目整理。项目分类保存在 `data/workspace-projects/`；为兼容原有制作接口，创意记录仍保存在 `data/projects/`，现有 `/api/projects/:id` 制作接口继续使用创意 ID。

## 运行

### 创作 Agent

每个创意关联一条 Codex app-server 对话。左侧是对话和 Prompt，右侧是场景表、制作方案、素材和实验台。对话状态保存在 `data/agent-sessions/`。

本机需安装 `codex` CLI（DeepSeek 模型元数据要求 0.164.0 或以上）。创作 Agent 默认使用 DeepSeek 原生 Responses API：`SOP_AGENT_PROVIDER=deepseek`、`SOP_AGENT_MODEL=deepseek-flash`，在服务端 `.env` 配置 `DEEPSEEK_API_KEY` 后重启服务即可，无需 Codex 登录。[DeepSeek 官方模型表](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)确认 `deepseek-flash` 对应 **DeepSeek-V4.1-Flash-1017**。项目自带最小模型目录，声明图片输入、1M 上下文和工具调用；界面模型列表来自当前 provider 的模型目录。默认推理强度为 `high`，可用 `SOP_AGENT_EFFORT` 指定。

Provider 设置集中在 `server/agent-provider.ts`，只通过启动参数传给独立的 Codex app server，不修改开发者的 Codex 配置。替换为其他 Responses 兼容服务时，修改 `SOP_AGENT_PROVIDER`、`SOP_AGENT_BASE_URL`、`SOP_AGENT_MODEL`、`SOP_AGENT_API_KEY_ENV`（保存 key 的环境变量名）；如需声明模型能力，再设置 `SOP_AGENT_MODEL_CATALOG`。恢复原来的 Codex 登录方式则设置 `SOP_AGENT_PROVIDER=codex`、`SOP_AGENT_MODEL=gpt-6.1-terra`，并在专用目录登录（例如 `CODEX_HOME="$PWD/data/agent-codex" codex login`）。变更 provider 后，下次发消息会创建新的模型上下文，并带入最近的对话摘要，界面保留已有消息。

参考视频分析跟随当前创意所选的 Agent 模型。专用 Codex 目录避免创作 Agent 继承开发者的其它插件和 MCP 工具。公网默认关闭 Agent 内部体验；只在单用户内部环境配置 `SOP_AGENT_ENABLED=true` 和独立的 `SOP_AGENT_CODEX_HOME` 后开放。

创作 Agent 的视频复刻分析共五档，依次为快速看风格、分段拆结构、逐镜头拆解、逐帧和声音对齐、复刻制作方案。五档共用本地抽帧和原片时间码，升级时补查所需证据。完整拆解保存可编辑镜头、分镜网格和「视频复刻 · 场景表」。只制作指定场景时，沿用已有分析并按目标片段取证。逐帧核对可测量短窗口音轨能量，具体鼓点、口播和音效需听辨确认。

需要 Node.js 22.12+（推荐 24）、npm、FFmpeg / ffprobe。

```sh
npm install
npm run dev
```

访问 <http://127.0.0.1:4317>。默认只监听本机，不暴露到局域网或公网。

首次启动前，在本机 `.env` 配置独立 Supabase 项目的前端变量：

```sh
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

首页右上角「登录」使用邮箱数字验证码。Supabase Auth 需要开启 Email Provider，并配置注册确认和登录邮件模板以显示 `{{ .Token }}` 六位验证码。阿里云自托管部署说明见 `docs/supabase-auth-setup.md`；SMTP 授权码与服务端 Key 保存在服务器私密配置中。`SUPABASE_SECRET_KEY` 不能放进 `VITE_*` 或浏览器代码。

生产构建：

```sh
npm run build
npm start
```

## 网络与接入渠道

使用 `npm run dev` 或 `npm start` 启动。两个脚本都带 `NODE_USE_ENV_PROXY=1`。

如果启动终端没有继承本机代理，可在本地 `.env` 设置 `HTTPS_PROXY` 和 `HTTP_PROXY`，并用 `NO_PROXY=localhost,127.0.0.1,::1` 保持本机请求直连。服务器在读取 `.env` 后重新初始化代理，因此文件中的代理也会用于模型请求（需要支持 `http.setGlobalProxyFromEnv` 的 Node.js 版本，当前本机 24.14.1 已验证）。修改后重启服务生效。

Omni Flash 使用 `SOP_OMNI_API_KEY`，也可通过「配置 → 模型连接」设置。已有环境中的 `SOP_VEO_API_KEY` 仍可作为 Omni 密钥读取。需要引用素材时，Omni 通过 Supabase 私有桶临时链接访问图片或待编辑片段。在 `.env` 配置 `SUPABASE_SECRET_KEY` 和可选的 `SOP_KEYFRAME_BUCKET`（默认 `sop-keyframes`）。

创作素材和关键帧使用独立 Images API。通过「模型连接」或服务端的 `SOP_IMAGE_API_KEY`、`SOP_IMAGE_BASE_URL` 和 `SOP_IMAGE_MODEL` 配置。

图片比例与尺寸沿用当前 Images API 适配器的约束，参考 [OpenAI 图片生成文档](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options)：支持自定义 `WIDTHxHEIGHT`，每边须为 16 的倍数且不超过 3840，长短边之比不超过 3:1，总像素为 655,360–8,294,400；超过 3,686,400 像素属于实验范围。`16:9` 精确转换为 `1536x864`，`9:16` 为 `864x1536`，`4:5` 为 `1024x1280`，`1:1` 为 `1024x1024`。工具也接受显式 `size`，与同时指定的比例冲突时直接报错，不自动取整、缩放或换比例。未指定尺寸和比例时使用官方 `size: auto`；未指定质量时使用 `quality: auto`，也可明确选择支持的质量。第三方网关不接受参数时原样报错，不切换尺寸或模型。

生成适配器原样转发最终 Prompt 和参考图片，保留上游返回的 PNG 字节，并记录实际宽高及尺寸不一致警告；不通过裁切、补边、拉伸、扩图或重新生成来掩盖差异。参考图超过接口大小限制时返回错误。

视频素材支持 MP4、MOV、WebM，最大 250 MB、最长 10 分钟。图片支持 JPEG、PNG、WebP，每张最大 10 MB。已登录用户的媒体可按服务端配置同步到 Supabase 私有素材库。

## 技术结构

普通 LLM 调用统一经过 `server/llm.ts` 的 `generateLlm()`，GPT 适配器位于 `server/gpt.ts`，使用 `POST /v1/responses`，支持 `gpt-6.1-sol`（默认）与 `gpt-6.1-terra`。服务端在 `.env` 配置独立的 `SOP_GPT_API_KEY`、`SOP_GPT_BASE_URL=https://maiai.ai` 和可选 `SOP_GPT_MODEL`；Base URL 也接受 `/v1` 或完整 `/v1/responses`。支持文本或多轮文本消息、instructions、输出 token 上限、reasoning effort、JSON Schema、超时和取消；一次调用只提交一次请求。`GET /api/status` 的 `llm` 字段仅返回非密钥配置；同源 `POST /api/llm/responses` 使用相同入口。参考视频分析跟随创作 Agent 的模型设置。

```ts
import { generateLlm } from './server/llm';

const result = await generateLlm({
  provider: 'gpt', model: 'gpt-6.1-terra', input: '用一句话介绍这个产品。',
  maxOutputTokens: 1024, reasoningEffort: 'low',
});
console.log(result.text, result.usage);
```

`npm run check:llm` 执行不计费的请求与错误处理检查；`npm run check:llm -- --live` 读取本地 `.env`，向每个 GPT 模型各提交一次小型真实请求（会消耗渠道额度）。协议参考 [OpenAI Docs：文本生成](https://developers.openai.com/api/docs/guides/text)和[结构化输出](https://developers.openai.com/api/docs/guides/structured-outputs)。

- `src/`：React + TypeScript，Linear-inspired 深色工作台；Lucide 图标；响应式 CSS。
- `shared/domain.ts`：共享类型、Zod schema、市场与平台策略、时间线校验。
- `server/index.ts`：Express API、素材上传、任务入口与访问控制。
- `server/creative-agent-tools.ts`：创作 Agent 的原生工具入口。
- `server/video-production.ts`：场景制作方案、视频模型路由、片段拼接。
- `server/minimax-video.ts` 和 `server/omni.ts`：生成、轮询和保存上游片段。
- `server/compose.ts`：剪裁、拼接本地视频片段。

- `server/store.ts`：原子 JSON 文件写入、版本冲突检测；适合单进程本机 V1。
- `docs/product-v1.md`：产品边界、行业研究及验收范围。

`SOP_PORT` 可更改端口，`SOP_DATA_DIR` 可更改本地数据目录。更换或移除素材时只移除项目引用，旧原文件保留在 `data/uploads/` 便于恢复。数据目录不提交到 Git。

## 验证与边界

```sh
npm run build
npm run smoke
```

Smoke 检查使用临时数据目录和端口，覆盖接口状态、创意编辑、素材上传及退役入口。公网单账号部署模板见 [公网部署说明](docs/public-deployment.md)。

### 视频复刻与局部制作

创作 Agent 和制作接口共用场景制作流程。参考视频拆解保存中英双版母版 Prompt、通用负面词、参数建议，以及带 1–3 张原片关键帧的场景镜卡。调整按复刻等级和用户的保留、替换范围保存，原片分析和调整稿均可在右侧「素材与产物」查看。局部任务可保存目标范围的镜卡和 Prompt，再生成所选场景，用于单独交付或替换回原片。

- `save_video_production` 保存调整后的母版和各场景的关键帧、视频 Prompt；`generate_image` 可用 `sceneIndex` 按调整方案生图。
- `generate_video` 按已保存场景或显式 Prompt 生成片段；`build_video_storyboard` 将按时序选择的关键帧排成 3×3 故事板，`generate_grid_video` 使用保存的网格和 Prompt。两条制作路线的单段目标时长均不超过 10 秒。
- `generate_first_last_frame_video` 支持共享首尾帧以保持衔接；`compose_video` 按顺序拼接片段，可指定裁剪位置或将成片片段接回原视频的指定区间。
- 新流程的 H3 使用 480p 或 720p，模型请求为 4–15 秒。实际编辑原视频且区间至少 4 秒时，使用 `omni_flash-1.2` 的 720p 编辑模式；源视频通过 Supabase 私有视频桶的临时链接发送。显式选择 Omni Flash 1.2 生成时支持 8、10、12、15 秒，双首尾帧最长 10 秒。编辑沿用源视频画幅和时长。[Omni Flash 接口](https://doc.gaoruitech.cn/doc-8842676)
- 创作 Agent 可从 3×3 制作故事板生成 H3 片段，并按用户指定顺序拼接。制作接口位于 `/api/projects/:id/production`；已提交任务可用 `recover_video` 恢复查询。

### MiniMax H3 独立生成服务

按 [Hi/SparkCine 开发文档](https://hi.hi.run/developers) 接入。文档提供原生 `/api/open/v1`、OpenAI 兼容 `/api/openai/v1`、H3 兼容 `/api/h3` 三种协议入口；本实现使用原生接口，直接上传平台参考图，并以 `Idempotency-Key` 防止重复创建任务。新制作流程默认使用此服务生成视频片段；独立接口也可按自身能力使用。

服务端 `.env` 配置 `SOP_MINIMAX_API_KEY`，可用 `SOP_MINIMAX_BASE_URL` 覆盖默认 `https://hi.hi.run/api/open/v1`。密钥不进入前端、工具参数或项目记录。`get_creative.minimaxVideoGeneration` 提供配置状态、模型、画幅和分辨率；`/api/status` 也包含该状态。参考图通过原生 uploads 接口上传，不依赖 Supabase 私有参考图存储。

Agent 调用示例：

```json
{
  "name": "generate_minimax_video",
  "arguments": {
    "prompt": "雨夜便利店门口，一位穿黄色雨衣的女孩收起雨伞。",
    "model": "h3-video",
    "duration": 6,
    "resolution": "768p",
    "aspectRatio": "9:16"
  }
}
```

默认模型 `h3-video`、6 秒、768p，画幅跟随创意，未支持的创意画幅默认使用 9:16。支持 480p／720p／768p／960p／1080p，以及 16:9、9:16、21:9、4:3、1:1、3:4；720p 仅限 16:9 和 9:16。H3 Video 为 4–30 整数秒，768p 21:9 最长 20 秒，960p／1080p 最长 15 秒。`h3-video-flex` 最长 15 秒，其中 1080p 21:9 最长 10 秒。`h3-video-frames` 为 4–15 秒，传 `firstFrameId` 和／或 `lastFrameId`，不能混入普通 `referenceIds`。普通参考图 ID 来自当前创意的 `imageReferences` 或 `grids`。普通 H3 可附加当前创意中的参考视频。

`generateAudio` 默认 true；`optimizePrompt` 默认 false，原样提交提示词。只有明确要求上游改写时才启用优化，会按官方规则另收积分。模型实时能力和价格可通过独立客户端 `listModels()` 查询。

代码分为三层：`shared/minimax-video.ts` 定义参数与 MCP tool；`server/minimax-h3.ts` 提供无项目状态依赖的 `MinimaxH3Client`（上传、提交、查询、轮询、下载）；`server/minimax-video.ts` 负责项目任务、参考图归属校验和结果入库。制作路由在 `server/video-production.ts` 统一选择模型并复用任务和入库逻辑。独立函数 `startMinimaxVideo`、`recoverMinimaxVideo` 可供其他服务端入口复用。

请求体和幂等键在付费提交前写入项目，上游 ID 返回后立即保存。`recover_video` 根据 provider 分派：已有 ID 时仅恢复查询；提交响应丢失时使用原请求体和原幂等键恢复，避免重复生成。`get_creative.videos[].recoverable` 标识可恢复记录。轮询约 5 秒一次，长任务降至 15 秒；工具等待结束后后台继续执行，勿因 pending 重发任务。成功结果校验下载长度后保存至本地 `/media/minimax-<id>.mp4`，不把上游临时链接作为永久素材地址。结果进入现有 `generatedVideos`、画布和实验台步骤绑定。

### 创作 Agent 动态画布组件

Agent 通过 `show_canvas_component` MCP 工具在执行中发布运镜、调色或分镜选择组件及预设参数。工具调用写入当前创意的 Agent 状态，现有 SSE `/api/projects/:id/agent/events` 立即推送到右侧画布。用户调整参数走 `PATCH /api/projects/:id/agent/canvas-components/:componentId`，关闭走 `DELETE`；`get_creative` 会返回最新参数。点击“把参数填入聊天框”可审阅后交给 Agent，不会自动提交视频生成。

### Open Intelligent UI

Agent 工具栏的「主题」支持官方浅色、中性深色、暖白阅读、紧凑工作台与跟随系统，可整体切换，也可分别设置左侧聊天栏和右侧结果区；项目侧边栏和顶部导航跟随左侧聊天栏，共用工作区级别的主题状态。暖白阅读使用米白与暖灰色并放宽行距；紧凑工作台缩小字体、间距、卡片内边距和圆角。默认均为官方浅色，并开启「应用 Background 背景」：复用工作区原有动态底图，Background 面板调整会直接透过 Agent 的面板底色显示，卡片、菜单和输入框保留实色表面；关闭此选项可恢复纯色主题。主题和背景开关按浏览器保存并跨标签页同步。模式、默认值及存储键统一在 `src/intelligent-ui/theme.ts`，颜色、字体、圆角和间距统一在 `src/intelligent-ui/components/theme.css`；组件读取主题变量，不再各自判断深色祖先。切换只更新呈现，不重新调用模型或重置卡片交互。

Agent 模式直接接入 [Thesys Open Intelligent UI](https://github.com/thesysdev/open-intelligent-ui) 的基础组件、59 个响应式函数、动作及生成规则，上游 MIT 许可保存在 `src/intelligent-ui/`。只保留其必需的 `@openuidev/react-lang` / `lang-core` 解析与渲染依赖；旧 OpenUI `AgentInterface`、AG-UI 适配层、旧组件库及 Markdown 右侧兜底已移除。模型以 `root =` 开头直接输出界面程序，通过 `/api/projects/:id/agent/events` 实时推送；Renderer 在程序未完整时即开始渲染，并在生成期间禁用表单交互。普通文字留在聊天区。`show_intelligent_ui` 可在长任务前发布完整的中间面板。右侧保留可关闭、重开的「视频画布 · 产物」和「Intelligent UI」标签页，图片、视频、地图、图表及响应式输入均使用同一组件库；Sail 的 `Video` 是媒体扩展。UI 的 `@ToAssistant` 动作带表单值回到创意对话。旧会话下一次提问会按指令版本自动升级，保留全部可见聊天记录并带入最近对话上下文。

自定义画布组件在 `src/AgentCanvasUI.tsx` 用 Open Intelligent UI 的 `defineComponent` 注册；`canvasLibrary` 从完整内置组件库扩展，`Renderer` 渲染当前控制器。新增画布控制器时同步扩展 `shared/agent-canvas-ui.ts` 的校验和 `server/creative-agent-mcp.ts` 的工具 schema。画布右上角“组件库”可预览自定义控制器、Open Intelligent UI 上游示例与组件目录。此适配层不改 Codex app server 调度及 Provider 配置。
