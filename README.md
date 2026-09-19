# AI-Sail Flow

面向跨境电商内容团队的本机工作台。第一版交付流程：**上传素材 → 视频拆解 → 产品与市场改写 → 提示词包导出**。

## 运行

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

首页右上角「登录」支持邮箱验证码、Google OAuth 和 X OAuth。Supabase Dashboard 需要开启 Email Provider，并把邮件模板配置为显示 `{{ .Token }}` 六位验证码；Google Provider 需要填入 Google Cloud OAuth Client ID/Secret，X Provider 需要填入 X Developer OAuth 2.0 Client ID/Secret，并分别把 Supabase 回调地址加入对应平台。Redirect URLs 至少加入 `http://127.0.0.1:4317/**` 和 `http://localhost:4317/**`。`SUPABASE_SECRET_KEY` 不参与这一阶段，不能放进 `VITE_*` 或任何浏览器代码。

生产构建：

```sh
npm run build
npm start
```

## 网络与接入渠道

用 `npm run dev` / `npm start` 启动：两个脚本都带 `NODE_USE_ENV_PROXY=1`。Node 的全局 fetch 默认忽略 `HTTPS_PROXY`，直接 `tsx server/index.ts` 起服务会绕过本机代理，Google 直连超时约 10.5 秒、兼容接口被劫持成 404，界面上看到的却是「模型连接失败」或「渠道未提供 gemini-3.8-flash」。

「兼容接口地址」按 OpenAI 协议填 base URL，例如 `https://maiai.ai/v1`。裸域名、`/v1beta` 这类版本根，或整条 `.../v1/chat/completions` 也接受，服务端归一化成同一个 endpoint。

填写 `https://maiai.ai/v1` 后，视频拆解请求 `https://maiai.ai/v1beta/models/gemini-3.8-flash:generateContent`，使用 Gemini 原生 `inline_data` 发送完整视频及其音轨；文字改写继续使用 `/v1/chat/completions`。两种调用使用同一密钥。默认不会自动降级为抽帧，也不再根据固定 token 阈值判定视频是否被读取。

当前原生直传的总请求上限为 20 MB（包括 Base64 和产品图），超限时明确提示压缩，不修改本地原片。大视频上传与分段处理仍待接入。可显式设置 `SOP_VIDEO_ANALYSIS_MODE=frames` 使用原有关键帧模式；它不分析音轨，结果会明确标记。分析模式与是否提交音轨会保存到项目和导出清单。

在 `.env` 配置 `GEMINI_API_KEY`，或在页面「视频理解模型」设置中输入密钥。页面输入的密钥只保留在服务器进程内存；不写入浏览器存储、项目记录或导出包。`.env.example` 是配置模板。模型固定为 **`gemini-3.8-flash`**，不静默替换为其他版本。点击分析时视频及产品图会发送给 Google，Google 侧本次上传文件在任务结束后尝试删除。

当前未配置密钥时，可以创建明确标注的手写示例项目体验编辑和导出；真实分析接口会返回未配置错误，不伪造结果。

## V1 功能

- 一条参考视频：MP4 / MOV / WebM，最大 250 MB、最长 10 分钟；保留音轨，读取真实时长及分辨率，生成本地封面。
- 最多 3 张产品参考图：JPEG / PNG / WebP，每张最大 10 MB，服务端识别实际文件格式。
- Gemini 分析：分镜时间段、作用、画面、动作、口播、画面文字、声音、商品展示及不确定项。
- 模型设置支持 Google 官方 Gemini API，也支持填写网关 API Base URL；视频走 Gemini 原生输入，结果由本地 Schema 和时间轴校验。
- 原片对照与编辑：点击镜头定位播放；编辑时间、文本、动作；拆分镜头。保存前校验时间不重叠、不越界。
- 本地化：7 个目标市场与对应语言、TikTok / Reels / Shorts 创意设置、站内商品卡或独立站路径、用户提供的售价币种与优惠、人物/时长/画幅/字幕设置。
- 产品事实作为改写依据；参考片里的功效、优惠和购买路径不会自动变成目标产品事实。不根据市场自动换算价格。
- 输出 3 个开头方向、完整分镜、局部生成指令、全片视觉指令及负面约束。可选择开头并继续编辑。
- ZIP 包：创意简报 Markdown、Seedance 提示词 TXT、分镜 JSON、原片分析 JSON、项目 manifest、可选 SRT 草稿、已上传的产品图。也支持复制和单独下载提示词。
- 项目与素材保存到 `data/`；草稿自动保存；任务进度持久化；服务重启后中断任务标记失败；修改产品/市场/原片分析后旧改写标记为待更新，阻止误导出。

## 技术结构

- `src/`：React + TypeScript，Linear-inspired 深色工作台；Lucide 图标；响应式 CSS。
- `shared/domain.ts`：共享类型、Zod schema、市场与平台策略、时间线校验。
- `shared/export.ts`：根据最新编辑生成提示词、Markdown、JSON 和 SRT。
- `server/index.ts`：Express API、上传、任务管理、文件打包与同源本机访问限制。
- `server/gemini.ts`：Google 官方 `@google/genai` SDK、Files API、`generateContent` 结构化输出，固定 `gemini-3.8-flash`。每次调用最大输出 24,000 tokens，不自动反复重试计费任务。
- `server/store.ts`：原子 JSON 文件写入、版本冲突检测；适合单进程本机 V1。
- `docs/product-v1.md`：产品边界、行业研究及验收范围。

`SOP_PORT` 可更改端口，`SOP_DATA_DIR` 可更改本地数据目录。更换或移除素材时只移除项目引用，旧原文件保留在 `data/uploads/` 便于恢复。数据目录不提交到 Git。

## 验证与边界

```sh
npm run build
npm run smoke
```

Smoke 检查使用独立临时目录和临时端口，验证项目持久化、视频/图片上传、错误边界、草稿编辑、旧方案失效和 ZIP/SRT 内容，不调用收费模型。

本版未包含视频渲染、自动发布、投放、真实销售看板、团队账户或公网生产部署。Seedance 是输出提示词的目标，不代表已接通 Seedance API；长片按实际生成渠道分段制作。SRT 是分镜时间草稿，生成视频后需重新按音轨校准。

接入真实密钥后的多模态准确率、额度及响应速度需用实际账户与素材验证。UI 浏览器检查未自动运行，遵循用户不使用 browser/computer automation 的要求。

原有 `ai-overseas-tool-functions.html` 与 `assets/ai-overseas-tool/` 作为原始功能资料保留。
