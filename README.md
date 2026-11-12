# AI Creative Lab

面向跨境电商内容团队的本机工作台。流程：**上传素材 → 视频拆解（逐镜头关键帧＋描述）→ 产品与创意改写（对应的复刻关键帧＋描述）→ 检查与导出关键帧**。当前先完成图生视频所需的图片和描述，视频生成与拼接留待后续。

## 项目与创意

视频创作实验台入口：本机启动后打开 `/lab`，或在创作 Agent 右侧选择「创作实验台」。支持动态制作路径、固定版本的 GitHub Skill、输入与阶段产物关联、备选方案、过期提示和流程配方。本机程序化创作使用每个创意独立的代码工作目录；完整产品方案、操作与能力边界见 [视频创作实验台](docs/video-experiment-workbench.md)。

当前默认一个「我的工作空间」，工作空间下有多个项目，每个项目可创建多个创意。例如「夏装」项目下创建「色卡夏装换装上」「青少年夏装」两个创意。项目负责归类；参考视频、产品资料、分析、Prompt、生成任务与成片都独立保存在各自创意中。

左侧「项目」旁的加号创建项目，项目行的加号在该项目下创建创意；展开项目后切换创意。顶部路径显示「我的工作空间 → 项目 → 创意」；点击项目名可重命名，点击创意名可修改名称和所属项目。归档与恢复作用于单个创意。

原有创意自动归入「默认项目」，保留原 ID、素材与制作结果，可通过编辑所属项目整理。项目分类保存在 `data/workspace-projects/`；为兼容原有制作接口，创意记录仍保存在 `data/projects/`，现有 `/api/projects/:id` 制作接口继续使用创意 ID。

导出包的 `manifest.json` 升为版本 2，分别记录 `workspaceId`、`projectId`（所属项目）和 `creativeId`（制作内容）。

## 运行

### Agent mode 内部体验

Agent mode 以一个创意对应一条 Codex app-server 对话。进入创意时打开自由画布：左侧是流式对话和 Prompt，右侧是从项目实际数据生成组件的画布。Agent 调用项目专属 MCP 工具执行拆解、编辑分镜描述和本地测试视频生成；「流程页面」保留原布局和交互，不放 Agent 对话。对话状态保存在 `data/agent-sessions/`，Studio mode 仍使用原流程。

本机需安装 `codex` CLI（DeepSeek 模型元数据要求 0.164.0 或以上）。创作 Agent 默认使用 DeepSeek 原生 Responses API：`SOP_AGENT_PROVIDER=deepseek`、`SOP_AGENT_MODEL=deepseek-flash`，在服务端 `.env` 配置 `DEEPSEEK_API_KEY` 后重启服务即可，无需 Codex 登录。[DeepSeek 官方模型表](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)确认 `deepseek-flash` 对应 **DeepSeek-V4.1-Flash-1017**。项目自带最小模型目录，声明图片输入、1M 上下文和工具调用；界面模型列表来自当前 provider 的模型目录。默认推理强度为 `high`，可用 `SOP_AGENT_EFFORT` 指定。

Provider 设置集中在 `server/agent-provider.ts`，只通过启动参数传给独立的 Codex app server，不修改开发者的 Codex 配置。替换为其他 Responses 兼容服务时，修改 `SOP_AGENT_PROVIDER`、`SOP_AGENT_BASE_URL`、`SOP_AGENT_MODEL`、`SOP_AGENT_API_KEY_ENV`（保存 key 的环境变量名）；如需声明模型能力，再设置 `SOP_AGENT_MODEL_CATALOG`。恢复原来的 Codex 登录方式则设置 `SOP_AGENT_PROVIDER=codex`、`SOP_AGENT_MODEL=gpt-6.1-terra`，并在专用目录登录（例如 `CODEX_HOME="$PWD/data/agent-codex" codex login`）。变更 provider 后，下次发消息会创建新的模型上下文，并带入最近的对话摘要，界面保留已有消息。

Agent 模型与 Gemini 分析配置相互独立。专用 Codex 目录避免创作 Agent 继承开发者的其它插件和 MCP 工具。公网默认关闭 Agent 内部体验；只在单用户内部环境配置 `SOP_AGENT_ENABLED=true` 和独立的 `SOP_AGENT_CODEX_HOME` 后开放。

需要 Node.js 22.12+（推荐 24）、npm、FFmpeg / ffprobe。本机配音与字幕模式还需要 macOS 的 `say` 与 `swift`。

首页提供 **自动工作流** 和 **手动工作流** 两个入口，共用同一份项目资料、分镜、Prompt 和执行记录。新建创意时也可选择入口；原有项目默认保留手动方式。

工作台顶部提供 **步骤视图 / 画布视图** 切换。画布视图直接打开人物与视频二创画布，展示参考素材、镜头证据、校正和二创流程；点击侧边栏步骤可返回对应的步骤页面。

- 自动工作流先收集参考视频、产品事实与图片、市场语言和成片方式。点击开始后，服务端连续执行拆解、逐镜头改写和复刻关键帧生成，然后停下供用户检查。每个原片镜头对应一张起始关键帧和一份动作、运镜描述。当前默认 target=keyframes，不提交 Veo 请求，不合成视频，也不要求 Supabase 存储密钥。
- 「查看制作步骤」打开只读工作台，「查看输入与输出」打开过程画布，自动任务继续执行。「接管并编辑」等待当前任务完成后停止后续步骤；再切换自动方式并点击继续，会复用仍有效的结果。手动编辑的 Veo Prompt 保存到项目，自动模式直接使用该原文。
- 执行在本机服务端完成，离开页面仍可继续。服务重启会保留结果并暂停流程，等待用户继续。失败时停止推进；已取得 Veo 任务 ID 的片段恢复原任务。没有任务 ID 时，继续按钮明确提示重新提交。不会自动反复重新生成失败片段。
- 产品与创意改写流程先产出 i2v 所需的首帧：产品图决定外观，原片镜头分析与关键帧决定构图、场景、动作和运镜。图片在本机保存，可放大、下载、编辑描述后单张重试。保留的「原片分析直连 Prompt」流程可手动选择 t2v / i2v / r2v。声音字幕方式与自动/手动工作流相互独立。
- 自动和手动工作台均可按项目编辑「保持什么 / 允许改变什么」。这些要求会进入 Gemini 改写、关键帧生成与 Veo 分镜 JSON；参考分析提供原片的场景、人物角色、动作、运镜与节奏依据。第三阶段并排显示原片证据图与复刻图，可修改描述、重试单张图片或下载图生视频输入包。修改上游资料或关键帧后，旧视频会标为待更新。

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

用 `npm run dev` / `npm start` 启动：两个脚本都带 `NODE_USE_ENV_PROXY=1`。Node 的全局 fetch 默认忽略 `HTTPS_PROXY`，直接 `tsx server/index.ts` 起服务会绕过本机代理，Google 直连超时约 10.5 秒、兼容接口被劫持成 404，界面上看到的却是「模型连接失败」或「渠道未提供 gemini-3.8-flash」。

如果启动终端没有继承本机代理，可在本地 `.env` 设置 `HTTPS_PROXY` 和 `HTTP_PROXY`，并用 `NO_PROXY=localhost,127.0.0.1,::1` 保持本机请求直连。服务器在读取 `.env` 后重新初始化代理，因此文件中的代理也会用于模型请求（需要支持 `http.setGlobalProxyFromEnv` 的 Node.js 版本，当前本机 24.14.1 已验证）。修改后重启服务生效。

「兼容接口地址」按 OpenAI 协议填 base URL，例如 `https://maiai.ai/v1`。裸域名、`/v1beta` 这类版本根，或整条 `.../v1/chat/completions` 也接受，服务端归一化成同一个 endpoint。

Veo 3.1 视频生成使用独立的 `SOP_VEO_API_KEY`（或模型设置中的 Veo Key），固定请求 `https://gaorui.cc/v1/videos`，不复用 Gemini / maiai.ai 密钥。文生视频使用 `veo_3_1` 且不传 `images`；首尾帧图生视频使用 `veo_3_1-fl`，传 1–2 张图片 URL（首帧、可选尾帧）；参考图生视频使用 `veo_3_1-components`，传至少 1 张图片 URL。三种模式均发送提示词、`resolution`（`720p` / `1080p` / `lite`）、`aspect_ratio`（`9:16` / `16:9`），固定输出 8 秒，不发送 `duration`。接口图片必须是可访问的 HTTPS 链接。改写流程由服务端自动上传所选复刻关键帧到 Supabase 私有桶，生成有效期 6 小时的临时链接传给 Veo；无需手动复制图片地址。任务提交后按 ID 轮询，完成后下载到本机。若下载失败但上游任务 ID 已取得，可在交付页恢复同一任务，不会再次提交付费生成。[Veo 3.1 接口文档](https://doc.gaoruitech.cn/doc-8981138)。

以下私有图片存储供后续视频生成接入使用；当前关键帧生成无需配置。私有图片存储复用现有 Supabase 项目。可以在「模型连接」填写项目 URL、服务端 Secret Key（或旧版 service_role key）及私有桶名称；页面填写的密钥只留在服务器内存。也可在 `.env` 设置 `SUPABASE_SECRET_KEY` 和可选的 `SOP_KEYFRAME_BUCKET`（默认 `sop-keyframes`）；项目 URL 默认复用 `VITE_SUPABASE_URL`。此服务端密钥不能使用前端 publishable / anon key 代替，也不能放进 `VITE_*`。桶不存在时自动创建私有桶；已存在的公开桶会被拒绝。[Supabase 私有桶与临时链接](https://supabase.com/docs/guides/storage/buckets/fundamentals)。

新人物参考图使用独立的 OpenAI 兼容 Images API（`POST /images/generations`，非流式）；复刻关键帧将原片抽帧作为第一张参考图、商品图作为后续参考图，走同一渠道的 `POST /images/edits` 多图编辑接口。可在「模型连接」填写图片渠道 Key、Base URL 和模型，或通过服务端 `SOP_IMAGE_API_KEY`、`SOP_IMAGE_BASE_URL`、`SOP_IMAGE_MODEL` 配置。默认地址为 `https://api.qzftech.top/v1`，模型选择顺序为 `gpt-image-2.6-flare`、`gpt-image-2.6-sunburst`，默认选 Flare；请求失败不会自动切换模型。每个图片任务在调用前记录到 `data/image-attempts/`，只发一次 POST、禁用自动重试。超时、断线或网关错误视为结果未知，同一任务或同一镜头输入不会自动再次提交；`X-Client-Request-Id` 仅用于追踪，不能替代服务端任务去重。连接配置保存在服务端私有文件 `data/.image-generation.json`，不会返回 API Key。文本分析与改写继续使用 Gemini；关键帧图片不再调用 Gemini 图像模型。

图片比例与尺寸沿用当前 Images API 适配器的约束，参考 [OpenAI 图片生成文档](https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options)：支持自定义 `WIDTHxHEIGHT`，每边须为 16 的倍数且不超过 3840，长短边之比不超过 3:1，总像素为 655,360–8,294,400；超过 3,686,400 像素属于实验范围。`16:9` 精确转换为 `1536x864`，`9:16` 为 `864x1536`，`4:5` 为 `1024x1280`，`1:1` 为 `1024x1024`。工具也接受显式 `size`，与同时指定的比例冲突时直接报错，不自动取整、缩放或换比例。未指定尺寸和比例时使用官方 `size: auto`；未指定质量时使用 `quality: auto`，也可明确选择支持的质量。第三方网关不接受参数时原样报错，不切换尺寸或模型。

生成适配器原样转发最终 Prompt 和参考图片，保留上游返回的 PNG 字节，并记录实际宽高及尺寸不一致警告；不通过裁切、补边、拉伸、扩图或重新生成来掩盖差异。分帧生成不再近似替换源比例或裁切结果，上传帧保留原文件及格式。参考图若超过接口大小限制会明确拒绝，不再在分帧提交时偷偷降采样或重编码。

默认视频拆解使用 Gemini 3.8 Flash 静态模式；兼容中转通过原生 `streamGenerateContent` 流式接收结果，视频和音频仍作为完整视频输入。可显式设置 `SOP_VIDEO_ANALYSIS_MODE=agentic` 让模型动态检查时间线、画面和音轨，或设置 `SOP_VIDEO_ANALYSIS_MODE=frames` 使用无音轨抽帧模式。文字改写在兼容网关模式下继续使用 `/v1/chat/completions`。

Agentic 模式在原有 `generateContent` 请求内传输 Base64 视频；视频超过兼容渠道的内联请求上限时会失败。抽帧模式不分析音轨，结果会明确标记。分析模式与是否提交音轨会保存到项目和导出清单。

在 `.env` 配置 Gemini API Key 和可选兼容网关，或在页面「模型连接」设置中输入对应密钥与地址。页面输入的 Gemini 密钥保存在服务端 `data/.gemini-connection.json`（权限 `0600`），服务重启后继续生效；不会写入浏览器存储、项目记录或导出包。备份或迁移服务端 `data/` 时应将此文件作为密钥管理。`.env.example` 是配置模板。模型固定为 **`gemini-3.8-flash`**，不静默替换为其他版本。点击分析时，视频及产品图会发送给当前配置的模型服务商。

当前未配置密钥时，可以创建明确标注的手写示例项目体验编辑和导出；真实分析接口会返回未配置错误，不伪造结果。

## V1 功能

- 一条参考视频：MP4 / MOV / WebM，最大 250 MB、最长 10 分钟；保留音轨，读取真实时长及分辨率，生成本地封面。上传完成并检查后即可预览、引用，原文件保存在 Sail。登录用户的素材由服务端后台同步到 Supabase，浏览器只查询同步状态，不再下载素材后重新上传。≥8 MB 的视频先生成独立的 H.264/AAC MP4 压缩副本（CRF 27、fast、音频 128k），同步压缩副本；结果未变小或压缩失败时同步原文件。原文件及其内容 ID 保持不变，压缩副本缓存在 `data/media-library-cache/`。同步失败可从素材库重试，关闭网页不影响已启动任务；服务重启后需再次打开素材库或手动同步以补齐未完成素材。8 MB 是触发阈值，不保证输出小于 8 MB；压缩使用 `ffmpeg-static`，读取视频及其他制作步骤仍使用系统 FFmpeg / ffprobe。
- 最多 3 张产品参考图：JPEG / PNG / WebP，每张最大 10 MB，服务端识别实际文件格式。
- Gemini 分析：分镜时间段、作用、画面、动作、口播、画面文字、声音、商品展示及不确定项。
- 模型设置支持 Google 官方 Gemini API，也支持填写网关 API Base URL；视频走 Gemini 原生输入，结果由本地 Schema 和时间轴校验。
- 拆解按一镜头一行展示：从原片截取可播放、可下载的 MP4，保留原声；每镜头提取 1–3 张可放大、下载的关键帧，标明原片绝对时间和选帧依据。Gemini 新分析补充主体外观、动作、运镜、动效、转场/分段依据、英文重建 Prompt 和建议证据时间点。媒体由本机 FFmpeg 按可见行准备并缓存，不追加模型调用；旧分析也可按现有时间线补齐媒体，未记录的字段保持明确标注。编辑镜头边界后切片和关键帧按新区间生成，步骤视图与画布预览共享镜头行。
- 原片对照与编辑：点击镜头定位播放；编辑时间、文本、动作；拆分镜头。保存前校验时间不重叠、不越界。
- 本地化：7 个目标市场与对应语言、TikTok / Reels / Shorts 创意设置、站内商品卡或独立站路径、用户提供的售价币种与优惠、人物/时长/画幅/字幕设置。
- 产品事实作为改写依据；参考片里的功效、优惠和购买路径不会自动变成目标产品事实。不根据市场自动换算价格。
- 输出 3 个开头方向、完整分镜、局部生成指令、全片视觉指令及负面约束。可选择开头并继续编辑。
- Veo 3.1 生产单元：一个参考镜头对应一张复刻关键帧、一份描述和一个生成片段，不跨镜头合并请求。接口固定输出 8 秒源片；短镜头按目标时长裁切，超过 8 秒的镜头调整播放速度到目标时长，再按原片镜头顺序拼接。导出包包含 `06-veo-production-plan.json` 和 `07-shot-recreation.json`，记录目标时间段、原片镜头映射、关键帧及状态。
- 交付页提供两种可保存到项目的成片模式。**Veo 原生**保留旧行为：台词、音频和画面文字都写进可编辑 Veo Prompt，由 Veo 尝试生成。**本地配音与字幕**使用另一份可编辑的纯画面 Prompt；完整台词由本机 TTS 生成，按整条视频统一排布，可跨镜头片段连续播放，必要时最多轻微加速 15%。口播字幕与 SRT 跟随实际声音时间，画面文字仍跟随镜头。单元预览按相同时间线截取，可能从一句话中间开始；最终 MP4 保留完整台词。配音在本机 `data/tts-cache/` 缓存，改变文字或音色才生成新的音频。整条视频放不下时，只提示一次是否延长成片，确认后停留末尾画面到口播结束，复用已有源片，不改写台词也不重新提交 Veo。所有源片完成后自动合成，亦可手动重新合成。此模式移除 Veo 原音轨，不需要额外的 TTS Key。
- 交付页的「制作过程画布」一次聚焦一个对应镜头；每个输入端口明确指向上游节点的输出端口，输出端口列出下游去向。点击端口可查看和复制完整内容，包括 Gemini 请求、分镜、复刻关键帧、默认/实际 Prompt、第三方图片链接与请求体及本地配音字幕合成记录。可切换模式与历史生成记录。新任务保存不含 API Key/媒体 base64 的请求与合成快照；旧任务缺失的细节标记为当前数据推导或未留存，不冒充历史网络请求。
- ZIP 包：创意简报 Markdown、Seedance 提示词 TXT、分镜 JSON、原片分析 JSON、逐镜头映射、生成计划、有效的复刻关键帧、项目 manifest、可选 SRT 草稿、已上传的产品图。也支持复制和单独下载提示词。
- 项目与素材保存到 `data/`；草稿自动保存；任务进度持久化；服务重启后中断任务标记失败；修改产品/市场/原片分析后旧改写标记为待更新，阻止误导出。

## 技术结构

普通 LLM 调用统一经过 `server/llm.ts` 的 `generateLlm()`，GPT 适配器位于 `server/gpt.ts`，使用 `POST /v1/responses`，支持 `gpt-6.1-sol`（默认）与 `gpt-6.1-terra`。服务端在 `.env` 配置独立的 `SOP_GPT_API_KEY`、`SOP_GPT_BASE_URL=https://maiai.ai` 和可选 `SOP_GPT_MODEL`；Base URL 也接受 `/v1` 或完整 `/v1/responses`。支持文本或多轮文本消息、instructions、输出 token 上限、reasoning effort、JSON Schema、超时和取消；一次调用只提交一次请求。`GET /api/status` 的 `llm` 字段仅返回非密钥配置；同源 `POST /api/llm/responses` 使用相同入口。现有视频分析与创作 Agent 沿用各自的调用方式。

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
- `shared/export.ts`：根据最新编辑生成提示词、Markdown、JSON 和 SRT。
- `server/index.ts`：Express API、上传、任务管理、文件打包与同源本机访问限制。
- `server/gemini.ts`：Gemini 原生 `generateContent` 视频与结构化输出，固定 `gemini-3.8-flash`。每次调用最大输出 24,000 tokens，不自动反复重试计费任务。
- `server/veo.ts`：区分三种 Veo 3.1 请求、校验公网图片 URL、提交异步任务、轮询状态并下载成片，由本地 FFmpeg 校验媒体。
- `server/compose.ts` 与 `server/render-captions.swift`：本机配音、文字图层、分镜时间对齐、MP4 合成与 SRT 导出。
- `server/store.ts`：原子 JSON 文件写入、版本冲突检测；适合单进程本机 V1。
- `docs/product-v1.md`：产品边界、行业研究及验收范围。

`SOP_PORT` 可更改端口，`SOP_DATA_DIR` 可更改本地数据目录。更换或移除素材时只移除项目引用，旧原文件保留在 `data/uploads/` 便于恢复。数据目录不提交到 Git。

## 验证与边界

```sh
npm run build
npm run smoke
```

Smoke 检查使用独立临时目录和临时端口，验证项目持久化、视频/图片上传、错误边界、草稿编辑、旧方案失效和 ZIP/SRT 内容，不调用收费模型。

两种成片方式都支持多单元拼接和完整成片下载：Veo 原生模式保留原音轨，本机配音与字幕模式按分镜重新制作配音和文字。系统音色由本机安装决定，人物口型不会自动与后期配音同步。此版不包含自动发布、投放、真实销售看板或团队账户。默认只监听本机；公网单账号部署模板与 ICP 备案要求见 [公网部署说明](docs/public-deployment.md)。Seedance 仍是输出提示词的目标，不代表已接通 Seedance API。

接入真实密钥后的多模态准确率、额度及响应速度需用实际账户与素材验证。UI 浏览器检查未自动运行，遵循用户不使用 browser/computer automation 的要求。

原有 `ai-overseas-tool-functions.html` 与 `assets/ai-overseas-tool/` 作为原始功能资料保留。

产品与创意改写承接视频拆解的每个镜头、证据关键帧和分析描述。改写保持原镜头数量、编号与顺序，目标时长按比例缩放；产品资料和必填产品图控制替换商品的事实与外观。生成每个镜头的中文描述、英文视频生成指令和单张复刻关键帧。图片调用配置好的 Images API 多图编辑接口；渠道需支持所选模型的 `/images/edits`。图像失败保留描述；结果未知时阻止同一输入重复提交，确定未提交的错误可在镜头卡重新生成。修改描述或产品资料后提示更新图片。ZIP 包含复刻图片和原镜头对应清单。


### 创作 Agent 生成工具

创作 Agent 使用 `sail_creation` MCP：

- `generate_image`：文生图；传入 `referenceIds` 时编辑参考图，沿用当前图片服务。
- `generate_video`：Omni 文生视频／参考图视频，`referenceIds` 可省略或提供最多 7 个当前创意图片 ID。
- `generate_minimax_video`：独立的 MiniMax H3 视频工具，支持文生视频、最多 9 张参考图，以及单首帧、单尾帧或首尾帧生成。
- `generate_first_last_frame_video`：通过 `firstFrameId`、`lastFrameId` 指定首尾帧，按此顺序提交 `input_reference`，并设置 `first_last_frame: true`。
- `generate_grid_video`：使用已有网格及其提示词调用真实 Omni 服务。旧 Studio 本地测试入口保持独立。
- `recover_video`：通过项目视频 ID 恢复已有上游任务查询，不重新提交生成。

生成 Prompt 尽可能忠实于用户表达的意图：已有完整 Prompt 时优先直接复用，用户要求优化、翻译或修改时再对应调整；用户明确要求逐字保留时遵守原文。只有简略想法时才组织生成所需的描述，避免增加无关创作设定；迭代只改用户指定内容及为保持一致所必需的关联细节，其余已确定内容保持不变。Agent 可以结合对话指代并将明确参数映射到工具选项，优先做最少必要调整，保留主体、动作、构图、明确指定的风格与参考、配色、画幅及排除项，避免自行换风格、加入冲突细节或追加惯用模板。因模型／provider 限制必须实质改变要求时，应说明变化；普通整理不额外增加预览或确认步骤。聊天入口保留用户原文，生成接口和 provider 适配器将最终工具 Prompt 原样传递（包括首尾空白），空白校验不会修改内容。画布生成记录中的 `prompt` 就是提交给 provider 的文本。图片请求另在 `data/image-attempts/<imageId>.json` 保存 Prompt、模型、请求 ID、接口地址、尺寸和提交时间，不保存 API Key；这是应用发往所配置服务的请求记录，不能据此判断第三方服务内部是否另作处理。

视频默认 `720p`、10 秒，支持显式选择 `1080p` 或 8 秒；模型分别为 `omni_flash_10s` 和 `omni_flash_8s`。画幅为 `16:9`／`9:16`，默认跟随创意。参考图可来自本次／历史聊天上传、当前创意素材、Agent 已完成图片或分镜网格；服务端校验所属创意后发布为私有存储临时链接。无需先分析视频或创建分镜，即可独立生成。任务及上游 ID、请求参数、结果记录到项目，视频显示在 Agent 画布上。

Omni 接口参数依据：https://gaoruitech.apifox.cn/doc-8842676 。文生图继续使用图片服务配置；720p／1080p 是视频分辨率选项。

### MiniMax H3 独立生成服务

按 [Hi/SparkCine 开发文档](https://hi.hi.run/developers) 接入。文档提供原生 `/api/open/v1`、OpenAI 兼容 `/api/openai/v1`、H3 兼容 `/api/h3` 三种协议入口；本实现使用原生接口，直接上传平台参考图，并以 `Idempotency-Key` 防止重复创建任务。默认 Omni/Veo 入口保持各自配置，MiniMax 作为额外生成方式供 Agent 按需选择。

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

默认模型 `h3-video`、6 秒、768p，画幅跟随创意，未支持的创意画幅默认使用 9:16。支持 480p／720p／768p／960p／1080p，以及 16:9、9:16、21:9、4:3、1:1、3:4；720p 仅限 16:9 和 9:16。H3 Video 为 4–30 整数秒，768p 21:9 最长 20 秒，960p／1080p 最长 15 秒。`h3-video-flex` 最长 15 秒，其中 1080p 21:9 最长 10 秒。`h3-video-frames` 为 4–15 秒，传 `firstFrameId` 和／或 `lastFrameId`，不能混入普通 `referenceIds`。普通参考图 ID 来自当前创意的 `imageReferences` 或 `grids`。当前平台工具开放图片参考；底层客户端的素材输入类型也支持音视频角色。

`generateAudio` 默认 true；`optimizePrompt` 默认 false，原样提交提示词。只有明确要求上游改写时才启用优化，会按官方规则另收积分。模型实时能力和价格可通过独立客户端 `listModels()` 查询。

代码分为三层：`shared/minimax-video.ts` 定义参数与 MCP tool；`server/minimax-h3.ts` 提供无项目状态依赖的 `MinimaxH3Client`（上传、提交、查询、轮询、下载）；`server/minimax-video.ts` 负责项目任务、参考图归属校验和结果入库。HTTP 路由只负责转接，不向旧 `tasks.ts` 或 Omni/Veo 适配器增加分支。独立函数 `startMinimaxVideo`、`recoverMinimaxVideo` 可供其他服务端入口复用。

请求体和幂等键在付费提交前写入项目，上游 ID 返回后立即保存。`recover_video` 根据 provider 分派：已有 ID 时仅恢复查询；提交响应丢失时使用原请求体和原幂等键恢复，避免重复生成。`get_creative.videos[].recoverable` 标识可恢复记录。轮询约 5 秒一次，长任务降至 15 秒；工具等待结束后后台继续执行，勿因 pending 重发任务。成功结果校验下载长度后保存至本地 `/media/minimax-<id>.mp4`，不把上游临时链接作为永久素材地址。结果进入现有 `generatedVideos`、画布和实验台步骤绑定。

### 创作 Agent 动态画布组件

Agent 通过 `show_canvas_component` MCP 工具在执行中发布运镜、调色或分镜选择组件及预设参数。工具调用写入当前创意的 Agent 状态，现有 SSE `/api/projects/:id/agent/events` 立即推送到右侧画布。用户调整参数走 `PATCH /api/projects/:id/agent/canvas-components/:componentId`，关闭走 `DELETE`；`get_creative` 会返回最新参数。点击“把参数填入聊天框”可审阅后交给 Agent，不会自动提交视频生成。

### Open Intelligent UI

Agent 工具栏的「主题」支持官方浅色、中性深色、暖白阅读、紧凑工作台与跟随系统，可整体切换，也可分别设置左侧聊天栏和右侧结果区；项目侧边栏和顶部导航跟随左侧聊天栏，共用工作区级别的主题状态。暖白阅读使用米白与暖灰色并放宽行距；紧凑工作台缩小字体、间距、卡片内边距和圆角。默认均为官方浅色，并开启「应用 Background 背景」：复用工作区原有动态底图，Background 面板调整会直接透过 Agent 的面板底色显示，卡片、菜单和输入框保留实色表面；关闭此选项可恢复纯色主题。主题和背景开关按浏览器保存并跨标签页同步。模式、默认值及存储键统一在 `src/intelligent-ui/theme.ts`，颜色、字体、圆角和间距统一在 `src/intelligent-ui/components/theme.css`；组件读取主题变量，不再各自判断深色祖先。切换只更新呈现，不重新调用模型或重置卡片交互。

Agent 模式直接接入 [Thesys Open Intelligent UI](https://github.com/thesysdev/open-intelligent-ui) 的基础组件、59 个响应式函数、动作及生成规则，上游 MIT 许可保存在 `src/intelligent-ui/`。只保留其必需的 `@openuidev/react-lang` / `lang-core` 解析与渲染依赖；旧 OpenUI `AgentInterface`、AG-UI 适配层、旧组件库及 Markdown 右侧兜底已移除。模型以 `root =` 开头直接输出界面程序，通过 `/api/projects/:id/agent/events` 实时推送；Renderer 在程序未完整时即开始渲染，并在生成期间禁用表单交互。普通文字留在聊天区。`show_intelligent_ui` 可在长任务前发布完整的中间面板。右侧保留可关闭、重开的「视频画布 · 产物」和「Intelligent UI」标签页，图片、视频、地图、图表及响应式输入均使用同一组件库；Sail 的 `Video` 是媒体扩展。UI 的 `@ToAssistant` 动作带表单值回到创意对话。旧会话下一次提问会按指令版本自动升级，保留全部可见聊天记录并带入最近对话上下文。

自定义画布组件在 `src/AgentCanvasUI.tsx` 用 Open Intelligent UI 的 `defineComponent` 注册；`canvasLibrary` 从完整内置组件库扩展，`Renderer` 渲染当前控制器。新增画布控制器时同步扩展 `shared/agent-canvas-ui.ts` 的校验和 `server/creative-agent-mcp.ts` 的工具 schema。画布右上角“组件库”可预览自定义控制器、Open Intelligent UI 上游示例与组件目录。此适配层不改 Codex app server 调度及 Provider 配置。
