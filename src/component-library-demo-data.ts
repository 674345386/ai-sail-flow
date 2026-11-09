import type { CanvasComponentInput } from '../shared/agent-canvas-ui';
import { programs } from './intelligent-ui/gallery/programs';

export type DemoScenario = {
  id: string;
  domain: 'video' | 'image' | 'text';
  title: string;
  subtitle: string;
  prompt: string;
  answer: string;
  kind: 'canvas' | 'intelligent' | 'plain';
  components: string[];
  source?: string;
  canvas?: CanvasComponentInput;
  tools: { name: string; args: Record<string, unknown> }[];
  trigger: string;
  interaction: string;
  dependency: string;
};

export const groupLabels: Record<string, string> = {
  Layout: '布局', Text: '文字', Inputs: '输入与操作', 'Media and data': '媒体与数据', Play: '学习与反馈', Drawing: '绘图与页面',
};

export const componentNotes: Record<string, string> = {
  Col: '纵向组织一条完整回答', Row: '把相关内容横向排列', Box: '控制尺寸、留白和背景', Grid: '排列多个候选方案或图片', Card: '归组一段信息', Carousel: '横向浏览候选内容', Popover: '点开查看来源或补充说明', Divider: '分隔内容段落', Spacer: '分配横向剩余空间',
  Title: '标题或重点数字', Text: '简短说明与富文本', Caption: '辅助说明', Label: '表单字段名称', Badge: '状态与简短事实', Link: '打开来源链接', List: '清单、步骤和时间安排', ListItem: '列表中的一个条目', Markdown: '长文、解释与结构化文字', Quote: '引用和提示', Code: '代码块与复制按钮', Math: '数学公式',
  Button: '运行前端动作或继续对话', IconButton: '紧凑的图标操作', Pressable: '让卡片、色块可以选择', Input: '文字或数字输入', TextArea: '多行输入', Select: '从较多选项中选择', SegmentedControl: '切换少量选项', Slider: '连续调整数值', Checkbox: '多选或任务勾选', RadioGroup: '单选一项', DatePicker: '选择日期', Timer: '倒计时与关联状态', Form: '把字段值交给 Agent',
  SearchImage: '按主体查找公开参考照片', Image: '展示工具返回的真实图片 URL', Video: '播放创作工具返回的视频', Icon: '表达状态和含义', Table: '比较方案与结构化数据', Chart: '表达趋势、比例和分布', Map: '展示地点与路线', MapMarker: '地图中的地点', YouTube: '嵌入已知的公开视频',
  Flashcard: '点击翻转知识卡', Celebration: '满足条件时显示庆祝反馈', Svg: '绘制可响应参数的示意图', G: '组合与变换图形', Circle: '圆形', Ellipse: '椭圆', Rect: '矩形', Line: '线段', Path: '路径', Polyline: '折线', Polygon: '多边形', SvgText: '图形中的文字', HtmlView: '在沙箱里运行交互 HTML',
};

export function exampleForComponent(name: string): string {
  if (['Col', 'Row', 'Box', 'Grid', 'Card', 'Divider', 'Spacer'].includes(name)) return 'layout';
  if (['List', 'ListItem'].includes(name)) return 'lists';
  if (['Button', 'IconButton'].includes(name)) return 'buttons';
  if (name === 'SegmentedControl') return 'segmented';
  if (name === 'Slider') return 'gdp';
  if (name === 'Checkbox') return 'checklist';
  if (name === 'Pressable') return 'pressable';
  if (['Input', 'TextArea', 'Select', 'RadioGroup', 'DatePicker', 'Form'].includes(name)) return 'inputs';
  if (name === 'Timer') return 'timer';
  if (['SearchImage', 'Image'].includes(name)) return 'images';
  if (['YouTube', 'Quote', 'Code', 'Math', 'Popover', 'Carousel'].includes(name)) return 'primitives';
  if (name === 'Icon') return 'icons';
  if (name === 'Table') return 'table';
  if (name === 'Chart') return 'chart';
  if (['Map', 'MapMarker'].includes(name)) return 'map';
  if (name === 'HtmlView') return 'html';
  if (['Flashcard', 'Celebration'].includes(name)) return 'flashcards';
  if (['Svg', 'G', 'Circle', 'Ellipse', 'Rect', 'Line', 'Path', 'Polyline', 'Polygon', 'SvgText'].includes(name)) return 'svg';
  return 'text';
}

export function createDemoScenarios(origin: string): DemoScenario[] {
  const image = new URL('/studio/gen/scene-coffee.jpg', origin).href;
  const video = new URL('/assets/landing/v2/tool-create.mp4', origin).href;
  const publish = (title: string, source: string) => ({ name: 'show_intelligent_ui', args: { title, source } });
  const imageSource = `root = Col([Title("温暖的咖啡馆", "lg"), Row([Badge("示例图片"), Badge("16:9", "info")], 2), Image(${JSON.stringify(image)}, "咖啡馆场景示例", 1.78), Text("这里使用站内已有素材演示结果展示，没有调用图片生成接口。", "sm", "muted"), Button("改成夜晚的氛围", @ToAssistant("请将这张咖啡馆图片改成夜晚的氛围"), "outline")])`;
  const comparisonSource = `root = Col([Title("拍摄方案比较", "lg"), Text("以下为演示方案，方便查看 Table、Badge 和 Button 的组合。", "sm", "muted"), Table(["方案", "镜头组织", "适合内容"], [["A · 单镜头", "连续推进", "氛围与风景"], ["B · 三镜头", "远景 → 中景 → 特写", "产品故事"], ["C · 分镜网格", "按既有分镜剪辑", "参考视频复刻"]]), Row([Badge("可继续讨论", "info"), Spacer(), Button("展开方案 B", @ToAssistant("请展开方案 B 的拍摄安排"), "outline")], 2)])`;
  const budgetSource = `root = Col([Title("视频预算计算器", "lg"), Text("修改预算和单条价格，结果在当前页面直接更新。单价是演示输入。", "sm", "muted"), Form([Card([Input($budget, "总预算（元）", "number"), Slider($price, 5, 100, 5, "单条视频价格", "元"), Divider(), Caption("约可生成"), Title(@Format(@Round(@Clamp(@Default($budget, 0), 0, 1000000) / @Clamp(@Default($price, 30), 5, 100), 0)) + " 条", "3xl")], "soft"), Button("请 Agent 制定生成计划", @ToAssistant("请根据当前预算和单条价格制定视频生成计划"), "outline")])])
$budget = 1200
$price = 30`;
  const weatherSource = `root = Col([Title("先确定天气查询地点", "lg"), Text("你想看哪个城市的天气？", "sm"), Form([Input($city, "城市", "text", "例如：上海"), Button("告诉 Agent 查询地点", @ToAssistant("请查询这个城市的天气"))]), Card([Badge("需要天气数据接口", "warning"), Text("当前项目尚未注册实时天气查询工具。这张表单只演示收集城市；真实温度需要工具返回，不能由界面编造。", "sm")], "soft")])
$city = ""`;
  const videoSource = `root = Col([Video(${JSON.stringify(video)}, "视频播放示例 · 站内已有素材", "")])`;
  return [
    {
      id: 'camera', domain: 'video', title: '运镜参数', subtitle: '自定义画布控制器',
      prompt: '给当前片段加一个 3 秒推镜头，幅度设为 6。先把参数展示出来。',
      answer: '运镜控制器已显示在视频画布。你可以继续调整时长、方向和幅度。',
      kind: 'canvas', components: ['CameraMotionController'], canvas: { kind: 'camera', duration: 3, strength: 6, direction: 'push', target: '当前片段' },
      tools: [{ name: 'show_canvas_component', args: { kind: 'camera', duration: 3, strength: 6, direction: 'push', target: '当前片段' } }],
      trigger: 'Agent 判断当前请求需要视频专属参数，并调用 show_canvas_component，kind=camera。',
      interaction: '滑块修改会保存参数；“把参数填入聊天框”先生成一条可审阅的消息。',
      dependency: '显示控制器本身不生成视频。实际出片需要 generate_video 或对应视频工具。',
    },
    {
      id: 'color', domain: 'video', title: '调色预设', subtitle: '自定义画布控制器',
      prompt: '把当前片段调暖一些，色温 3200K，强度 60%。先给我一个调色面板。',
      answer: '已打开调色面板，并填入暖调、3200K 和 60% 强度。',
      kind: 'canvas', components: ['ColorPresetCard'], canvas: { kind: 'color', temperature: 3200, preset: 'warm', intensity: 60, target: '当前片段' },
      tools: [{ name: 'show_canvas_component', args: { kind: 'color', temperature: 3200, preset: 'warm', intensity: 60, target: '当前片段' } }],
      trigger: 'Agent 调用 show_canvas_component，kind=color，并给出预推断的初始参数。',
      interaction: '切换暖调、自然、冷调，或拖动色温和强度；参数先保存到创意状态。',
      dependency: '当前控制器用于收集参数，实际处理画面需要后续创作工具。',
    },
    {
      id: 'storyboard', domain: 'video', title: '选择分镜', subtitle: '自定义画布控制器',
      prompt: '让我选择第 1、2 段分镜，先不要生成视频。', answer: '分镜选择器已打开，初始选中第 1、2 段。',
      kind: 'canvas', components: ['StoryboardSelector'], canvas: { kind: 'storyboard', selectedGridIds: ['demo-grid-1', 'demo-grid-2'], target: '示例创意的分镜' },
      tools: [{ name: 'get_creative', args: {} }, { name: 'show_canvas_component', args: { kind: 'storyboard', selectedGridIds: ['demo-grid-1', 'demo-grid-2'], target: '示例创意的分镜' } }],
      trigger: '先读取当前创意获取有效 grid ID，再调用 show_canvas_component，kind=storyboard。',
      interaction: '勾选改变纳入范围。示范页使用 3 段演示数据，不修改你的项目。',
      dependency: '正式使用时 grid ID 必须属于当前创意，不能由模型随意编造。',
    },
    {
      id: 'video-result', domain: 'video', title: '参考图生成视频', subtitle: '生成工具 + 视频组件',
      prompt: '用参考图 1 生成一条 10 秒、16:9 的视频，镜头缓慢向前推进。',
      answer: '真实流程会先读取参考图 ID，调用视频生成工具，再展示返回的视频。本页播放站内已有视频作为结果示例。',
      kind: 'intelligent', components: ['Video'], source: videoSource,
      tools: [{ name: 'get_creative', args: {} }, { name: 'generate_video', args: { prompt: '以参考图为起点，镜头缓慢向前推进，保持主体与画面结构稳定。', referenceIds: ['示例参考图ID'], duration: 10, aspectRatio: '16:9', resolution: '720p' } }],
      trigger: '用户明确要求生成视频后，Agent 调用 generate_video。生成结果自动进入聊天与产物列表。',
      interaction: '播放、暂停、拖动进度条。视频业务可以继续组合运镜、调色等自定义控制器。',
      dependency: '参考图转视频专用的完整业务面板尚未新增；当前已接通生成工具与视频展示能力。',
    },
    {
      id: 'image', domain: 'image', title: '生成图片与迭代', subtitle: '原生媒体组件',
      prompt: '生成一张温暖的咖啡馆场景图，16:9，并给我一个继续修改的入口。',
      answer: '图片结果可用原生 Image 展示，按钮可以把修改要求交回 Agent。这里展示的是已有素材。',
      kind: 'intelligent', components: ['Image', 'Col', 'Badge', 'Button'], source: imageSource,
      tools: [{ name: 'generate_image', args: { prompt: '温暖的咖啡馆场景，午后光线，写实摄影。', aspectRatio: '16:9' } }, publish('咖啡馆图片', imageSource)],
      trigger: 'generate_image 返回真实图片 URL 后，Agent 可用 show_intelligent_ui 发布含 Image 的界面；聊天也会展示生成媒体。',
      interaction: '点击“改成夜晚的氛围”会产生 @ToAssistant 动作，在真实应用中发起下一轮对话。',
      dependency: 'Image 负责显示图片，实际生成由后端图片服务完成。',
    },
    {
      id: 'plain', domain: 'text', title: '普通文字问答', subtitle: '阅读型回答',
      prompt: '用两句话解释什么是视频景深。', answer: '景深是画面中看起来清晰的距离范围。浅景深让主体清晰、背景虚化；大景深能让前景和背景都保持较清晰。',
      kind: 'plain', components: [], tools: [],
      trigger: '这类请求用普通文字即可，Agent 可以直接回答，不必调用界面工具。',
      interaction: '用户继续输入问题即可。普通文字只显示在聊天中。',
      dependency: '本例不需要生成服务或数据接口。',
    },
    {
      id: 'comparison', domain: 'text', title: '方案对比表', subtitle: '原生数据组件',
      prompt: '用表格比较单镜头、三镜头和分镜网格三种拍摄方案。',
      answer: '这类内容适合用表格并排比较，按钮可以继续展开其中一个方案。',
      kind: 'intelligent', components: ['Table', 'Badge', 'Button'], source: comparisonSource, tools: [publish('拍摄方案比较', comparisonSource)],
      trigger: 'Agent 判断表格更清楚，调用 show_intelligent_ui，source 中包含 Table。',
      interaction: '表格负责阅读；“展开方案 B”通过 @ToAssistant 继续聊天。',
      dependency: '例子是通用拍摄方案。真实价格和性能比较需要来源数据。',
    },
    {
      id: 'budget', domain: 'text', title: '预算计算器', subtitle: '原生响应式交互',
      prompt: '做一个视频预算计算器，能调整总预算和单条视频价格，实时算出能生成多少条。',
      answer: '计算器已准备好。调整预算和单价即可看到结果变化，不需要每次再问模型。',
      kind: 'intelligent', components: ['Input', 'Slider', 'Form', 'Button'], source: budgetSource, tools: [publish('视频预算计算器', budgetSource)],
      trigger: 'Agent 用 $variables、表达式和 @functions 编写完整程序，再通过 show_intelligent_ui 发布。',
      interaction: '修改输入、拖动滑块是前端本地计算；点击制定计划才通过 @ToAssistant 继续调用 Agent。',
      dependency: '演示价格由用户输入，不代表任何模型的真实报价。',
    },
    {
      id: 'weather', domain: 'text', title: '天气与信息补充', subtitle: '表单 + 数据依赖',
      prompt: '今天天气如何？', answer: '需要先知道查询城市。当前应用还需要接入天气数据工具，才能展示可信的实时温度。',
      kind: 'intelligent', components: ['Form', 'Input', 'Button', 'Card'], source: weatherSource, tools: [publish('天气查询地点', weatherSource)],
      trigger: '缺少城市时，Agent 可以发布澄清表单；有了天气数据后，再组合天气展示界面。',
      interaction: '填写城市后提交，@ToAssistant 会把城市字段一起交回 Agent。',
      dependency: '天气界面与天气数据源是两件事。当前工具清单里没有实时天气查询工具。',
    },
    {
      id: 'diagram', domain: 'text', title: '可交互原理图', subtitle: '原生 SVG 绘图',
      prompt: '用一个可以调角度的图，解释两个齿轮的转动关系。',
      answer: '可以用 Svg 绘图，并让 Slider 的数值驱动图形旋转。',
      kind: 'intelligent', components: ['Svg', 'G', 'Circle', 'Line', 'Slider'], source: programs.find(item => item.id === 'svg')!.code,
      tools: [publish('齿轮转动示意', programs.find(item => item.id === 'svg')!.code)],
      trigger: '需要解释形状、运动或结构时，Agent 用 Svg 与图形组件编写示意图。',
      interaction: '拖动角度滑块，图中的齿轮按绑定关系一起变化。', dependency: '图形和计算在浏览器内执行，本例不需要图片生成。',
    },
  ];
}
