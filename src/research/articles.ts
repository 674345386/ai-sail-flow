import { capabilityEvolutionArticle } from './capabilityEvolutionArticle';

export type ResearchIllustration = { src: string; alt: string; caption: string; width: number; height: number };
export type ResearchSection = {
  id: string;
  title: string;
  body: string;
  code?: string;
  codeLanguage?: string;
  liveExample?: boolean;
  illustration?: ResearchIllustration;
};
export type ResearchArticle = {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  publishedAt: string;
  category: string;
  tags: string[];
  image: string;
  imageAlt: string;
  imageCaption?: string;
  byline?: string;
  opening?: { id: string; title: string; body: string };
  sections: ResearchSection[];
};

export const embeddedAgentArticle: ResearchArticle = {
  slug: 'embedded-agent-interface-foundation',
  title: '让 Agent 成为应用的一部分',
  subtitle: '可替换的模型与 Harness，持续生成的交互界面。',
  summary: 'AI Creative Lab 的一项架构探索：将模型接入、Agent 执行与界面渲染拆成独立边界，让对话能够生成、操作并持续更新应用内的可视化组件。',
  publishedAt: '2026-11-05',
  category: '架构与交互',
  tags: ['Embedded Agent', 'Harness', 'A2UI', 'Generative UI'],
  image: '/assets/research/embedded-agent-press-v1.png',
  imageAlt: '两套可替换的字模接入同一印刷底座，连续纸页展开为不同的图表与界面，隐喻可组合的 Agent 基座与持续生成的 UI。',
  sections: [
    {
      id: 'starting-point',
      title: '把一次回答，变成可以继续工作的界面',
      body: `当用户说“帮我安排一个周末”，一个有用的回答可以包含日程、节奏选择、地图与可调整的活动。当用户说“用这张参考图制作视频”，对话还需要连接素材、生成任务与实际产物。这些任务共同提出一个问题：Agent 的输出，怎样进入应用的工作流？

AI Creative Lab 的做法，是把对话、工具调用、可视化组件与创作产物放进同一工作区。Agent 可以给出文字，也可以生成一个有状态的界面；用户在界面里的操作，又可以成为下一轮任务的输入。一次回答因此能够成为后续工作的起点。

这套设计的核心，是让**模型、执行基座与界面分别拥有清楚的边界**。模型可以选择，Harness 可以适配，界面由应用持有的组件系统渲染。它为应用提供了一种持续演进的交互方式，也让不同模型与运行时有机会共享同一套产品界面。`,
    },
    {
      id: 'three-boundaries',
      title: '三个边界：Provider、Harness 与 UI',
      illustration: {
        src: '/assets/research/embedded-agent-tech-architecture-v1.jpg',
        alt: '三块不同的现代计算模块通过统一插槽接入共享底座，右侧延伸出玻璃界面层，表达 Provider、Harness 与 UI 的独立边界。',
        caption: '可替换的模块，共享的界面基座。以计算模块、统一插槽和光学玻璃表达架构边界；AI 生成的概念配图。',
        width: 1672,
        height: 941,
      },
      body: `模型供应方和 Agent 运行时承担不同职责。Provider 提供推理能力与模型协议；Harness 组织上下文、会话、工具、轮次与中断；UI 层则决定什么能够显示，以及用户怎样操作。

| 层 | 负责什么 | 与下一层交换什么 |
| --- | --- | --- |
| LLM Provider | 模型、鉴权、服务地址、推理参数与协议能力 | 模型输入、输出与能力声明 |
| Agent Harness | 会话、上下文、工具循环、事件与任务生命周期 | 文本片段、工具状态、最终结果与交互请求 |
| 应用与组件运行时 | 组件注册、参数校验、渲染、本地状态与动作回传 | 有类型的 UI 程序、表单状态与用户动作 |

这样的划分让两种替换可以独立发生。通过 Provider 切换到兼容模型，不应要求重写卡片、地图和表单；更换 Harness，也应尽量沿用应用侧的组件契约。但替换是否成立，仍取决于协议、工具调用和流式输出等能力是否匹配。

当前代码以 **Codex App Server** 为执行基座，支持选择模型并保留独立配置与会话。其他 Provider 的接入能力由运行时的配置与协议支持决定。DeepSeek 模型的接入，与采用 DeepSeek 驱动的另一套 Harness，是两项不同的适配工作。`,
    },
    {
      id: 'runtime-loop',
      title: '从一条消息，到一个持续运行的任务',
      illustration: {
        src: '/assets/research/embedded-agent-tech-event-stream-v1.jpg',
        alt: '光纤信号经过透明转换层形成图表、滑块与数据界面，交互回路连接回信号源，表达事件流与用户动作回传。',
        caption: '事件持续流入，界面逐步形成，用户操作沿回路进入下一轮任务。AI 生成的概念配图。',
        width: 1672,
        height: 941,
      },
      body: `在现有实现中，应用服务通过 JSON-RPC 与 Codex App Server 的标准输入、输出通信，完成会话创建或恢复、轮次启动与中断。创意拥有自己的会话与消息记录；页面离开后，任务状态仍由服务端维护。

创作能力经 sail_creation MCP 工具暴露，包括读取创意、分析参考视频、生成图片与视频、更新画布组件和发布交互界面。应用负责把工具调用连接到真实的项目状态与生成任务，而不是把一段描述当成已经完成的产物。

一次完整的循环可以分为五步：

1. 用户发送目标，应用附上当前创意与真实参考素材。
2. Harness 组织推理和工具调用，并不断产生事件。
3. 服务端更新会话状态，通过 SSE 把实时状态送到页面。
4. 页面把文字、任务进度、组件程序和实际产物呈现在对应区域。
5. 用户操作组件，应用处理本地动作，或把动作与表单值送回下一轮对话。

**运行状态留在服务端，交互体验留在应用里。** 这条分工使对话、后台任务与多种可视化结果能够协同，而不必挤进同一个消息气泡。`,
    },
    {
      id: 'ui-as-program',
      title: '用有边界的 UI 程序连接 Agent 与界面',
      body: `这里采用的是一种 A2UI／生成式界面设计：Agent 输出结构化的 UI 程序，应用使用已注册的组件渲染。本文用 A2UI 描述“Agent 到用户界面”的关系；当前实现的具体程序格式来自 Open Intelligent UI，不能据此把它视为对某个同名外部协议的兼容声明。

一个界面可以由布局、标题、文本、卡片与输入控件组合而成。以下程序先声明 root，再定义被引用的组件，便于流式生成时逐步形成可见结果：`,
      codeLanguage: 'Open Intelligent UI',
      code: `root = Col([heading, pace, result])
$mode = "精简"
heading = Title("把研究结果整理成一份界面", "md")
pace = SegmentedControl($mode, ["精简", "展开"], true)
result = Card([Text($mode == "精简" ? "呈现核心发现与下一步。" : "增加证据、限制与后续问题。", "sm"), Badge("可继续调整", "info")], "soft")`,
      liveExample: true,
    },
    {
      id: 'component-contract',
      title: '可扩展组件，是应用与模型之间的共同语言',
      body: `组件库决定了 Agent 能够表达的交互词汇。布局、表格、地图、图表、媒体和输入控件提供通用能力；产品还可以注册自己的业务组件，例如证据卡片、镜头控制器或生成任务面板。

扩展一个组件，需要同时定义**名称、参数结构、渲染行为与动作语义**。模型侧看见描述与参数 Schema，应用侧持有真正的 React 实现。这使组件能够随产品能力扩展，同时保留稳定的输入边界。

以科研发现文章为例，一个 EvidenceCard 可以要求标题、来源链接、证据摘要和不确定性说明。Agent 负责组织内容，组件负责把来源、证据与结论清楚地排在一起；数据是否真实，则需要由工具结果、检索来源和服务端验证共同保证。

现有组件库使用 defineComponent 与 Zod 参数结构，再汇入统一注册表。注册组件不是完整的安全保证：富 HTML、外部资源与工具动作仍需要各自的内容策略、隔离和权限校验。把边界写进实现，才让扩展能力具有可维护性。`,
    },
    {
      id: 'live-updates',
      title: '实时更新，需要区分四种状态',
      illustration: {
        src: '/assets/research/embedded-agent-tech-components-v1.jpg',
        alt: '硅片上的六块界面组件保持连接，其中一块蓝色组件被抬起更新，边缘的新组件准备接入，表达组件扩展与局部状态更新。',
        caption: '可扩展的组件阵列与独立更新的状态单元。AI 生成的概念配图。',
        width: 1672,
        height: 941,
      },
      body: `界面随着生成推进、用户输入或工具结果而变化，背后至少有四种状态：会话状态、领域数据、UI 程序和浏览器内的交互状态。把它们分开，才能解释一次更新应该覆盖什么、保留什么。

| 状态 | 当前由谁持有 | 更新时的关键问题 |
| --- | --- | --- |
| 会话与任务 | 服务端 AgentState | 重连后如何恢复消息与任务进度？ |
| 素材与产物 | 创意项目及生成任务记录 | 展示的资源是否真实，任务是否仍在进行？ |
| UI 程序与画布组件 | 会话中的程序、面板与组件记录 | 哪个结果是当前版本，哪个组件按 ID 更新？ |
| 表单与局部选择 | 浏览器组件及渲染器 | 新程序到来时，哪些用户输入应保留？ |

当前页面会识别尚未完成的 UI 程序，并将流式内容交给 Renderer；工具也可以发布完整的中间面板。画布组件能够按稳定 ID 更新，用户可以在不同结果标签与产物之间切换。

这里的“实时”指事件驱动的持续呈现，不代表已经实现任意组件的通用差量更新协议。跨版本表单保留、冲突处理、细粒度补丁与审计轨迹，仍需要明确的状态策略。`,
    },
    {
      id: 'harness-adapters',
      title: '把不同 Harness 接到同一层界面上',
      body: `Codex App Server 已经在项目中承担运行时职责。如果希望换成自建 Harness，或另一套以 DeepSeek 等模型驱动的执行循环，关键工作是把其事件和生命周期映射到应用可以理解的契约。

这份契约需要覆盖会话恢复、消息片段、工具开始与结束、任务失败、轮次完成及中断语义。只更换模型服务地址，不足以完成运行时替换；把完整的执行语义适配过来，界面才有稳定的状态来源。

下面是面向后续适配工作的接口草图：`,
      codeLanguage: 'TypeScript · 设计草图',
      code: `interface HarnessAdapter {
  startSession(context: ProjectContext): Promise<Session>;
  resumeSession(id: string): Promise<Session>;
  runTurn(input: UserInput): AsyncIterable<AgentEvent>;
  interrupt(turnId: string): Promise<void>;
}

// Adapter 将不同 Harness 的原生事件规范化。
// 应用再将 AgentEvent 映射到消息、工具状态与 UI。`,
    },
    {
      id: 'design-contribution',
      title: '这套设计的贡献，落在组合方式上',
      body: `这项探索关注产品架构与交互机制：把可替换的推理与执行基座，连接到有明确契约、可持续更新的界面。值得继续验证的，是这些机制组合后对真实任务的帮助。

**第一，模型能力和产品界面的解耦。** 不同模型可以在共同组件契约内表达结果；应用能够沉淀界面能力，而不必让这些能力依附于某一次模型选择。

**第二，回答成为可操作的中间产物。** UI 程序、状态和用户动作一起构成下一轮任务的上下文。用户可以通过选择、表单和直接操作补充意图，减少仅靠文字描述复杂约束的负担。

**第三，工具结果进入持续可见的工作区。** 对话、进度、生成素材与交互界面各有位置。界面能够随着任务推进发生变化，让用户看见正在发生的工作，并参与其中。

这三个机制为一种内嵌 Agent 的应用基座提供了可行路径。它的价值需要在真实任务中继续验证，例如用户完成任务的时间、修改次数、上下文恢复率，以及组件更新后保留输入的可靠性。`,
    },
    {
      id: 'status-and-next',
      title: '当前实现，与接下来要回答的问题',
      body: `| 已在当前工作区中体现 | 仍需扩展或验证 |
| --- | --- |
| Codex App Server 会话、轮次、恢复与中断 | 多 Harness 的统一适配层与能力协商 |
| 模型选择、独立运行时配置 | 各 Provider 的协议兼容与能力矩阵 |
| MCP 创作工具与真实产物回写 | 更完整的工具权限边界与审计 |
| Open Intelligent UI 组件注册与流式渲染 | 通用 UI Patch、跨版本输入保留与冲突处理 |
| 组件交互、本地状态与动作回传 | 可复现的端到端交互评估 |

Research / Article 将持续记录这些设计与实现。后续文章可以分别讨论 Harness 适配、组件协议、流式 UI 的一致性，以及生成式界面如何在真实创作任务中接受评估。

本文依据当前工作区中的实现整理，主要对应 server/creative-agent.ts、server/creative-agent-mcp.ts、shared/intelligent-ui.ts、src/IntelligentUIAgentWorkspace.tsx 和 src/intelligent-ui/library.ts。概念配图由 AI 生成；它表达模块化基座与变化中的界面之间的关系，不是实际机器或历史档案照片。`,
    },
  ],
};

/** Add another article here to include it in Research and Article indexes. */
export const researchArticles: ResearchArticle[] = [capabilityEvolutionArticle, embeddedAgentArticle];
export const articlePath = (slug: string) => `/research/article/${encodeURIComponent(slug)}`;
export const articleReadingMinutes = (article: ResearchArticle) => Math.max(1, Math.ceil(article.sections.reduce((length, section) => length + section.body.length + (section.code?.length || 0), article.opening?.body.length || 0) / 500));
