export const RADAR_WORKFLOWS = [
  {
    id: "top",
    name: "分类热榜",
    subtitle: "此刻，什么正在流行",
    description: "按领域与内容形式整理热度榜，找到值得跟进的选题。",
    steps: ["采集热点", "同类归一", "分类排序", "研究报告"],
  },
  {
    id: "product",
    name: "反向探索",
    subtitle: "从一个灵感，找到一片机会",
    description:
      "上传商品图片，或输入主题、品类与场景，反查相关内容与搜索需求。",
    steps: ["识别线索", "跨源检索", "关联内容", "选题建议"],
  },
  {
    id: "breakout",
    name: "潜力雷达",
    subtitle: "在爆发之前，发现信号",
    description: "对比多次采集的增长速度与互动质量，发现尚未进入大流量的内容。",
    steps: ["收集快照", "计算增速", "检查互动", "潜力排序"],
  },
  {
    id: "resonance",
    name: "跨平台共振",
    subtitle: "辨别孤立热点与共同趋势",
    description: "沿同一主题交叉检验社交讨论、搜索兴趣与新闻传播。",
    steps: ["主题检索", "主题归并", "来源交叉验证", "证据报告"],
  },
  {
    id: "calendar",
    name: "节点日历",
    subtitle: "提前布局下一个内容窗口",
    description: "把节日、季节与营销节点放进时间轴，连接相关热点与创作准备。",
    steps: ["选择市场", "定位节点", "验证需求", "准备选题"],
  },
] as const;

export type RadarWorkflow = (typeof RADAR_WORKFLOWS)[number]["id"];
export const RADAR_PLATFORMS = [
  "Google Trends",
  "Google News",
  "TikTok",
  "X",
  "YouTube",
  "Amazon",
  "RSSHub",
] as const;
export type RadarPlatform = (typeof RADAR_PLATFORMS)[number];
export const RADAR_CATEGORIES = [
  "全部领域",
  "科技数码",
  "生活方式",
  "美妆个护",
  "美食饮品",
  "旅行户外",
  "娱乐文化",
  "商业财经",
  "运动健康",
] as const;
export const RADAR_KINDS = {
  all: "全部内容",
  video: "视频 / 短视频",
  image: "图片",
  news: "新闻",
  search: "搜索热词",
  product: "商品",
  event: "节日 / 事件",
} as const;
export type RadarKind = Exclude<keyof typeof RADAR_KINDS, "all">;

export type RadarMetrics = Partial<
  Record<
    | "views"
    | "likes"
    | "comments"
    | "shares"
    | "saves"
    | "searchVolume"
    | "rank",
    number
  >
>;
export type RadarSnapshot = { at: string; metrics: RadarMetrics };
export type RadarItem = {
  id: string;
  title: string;
  platform: RadarPlatform;
  kind: RadarKind;
  url: string;
  thumbnail?: string;
  author?: string;
  category: string;
  topic?: string;
  tags: string[];
  excerpt?: string;
  publishedAt?: string;
  capturedAt: string;
  metrics: RadarMetrics;
  history: RadarSnapshot[];
  comments?: string[];
  region?: string;
  provenance: "live" | "import" | "demo";
  sourceLabel: string;
};
export type RadarDimension = {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  evidence: string;
};
export type RadarSignal = {
  heat: number | null;
  potential: number | null;
  engagementRate: number | null;
  growth: number | null;
  velocity: number | null;
  crossPlatforms: number;
  completeness: number;
  dimensions: RadarDimension[];
  gaps: string[];
};
export type ScoredRadarItem = RadarItem & { signal: RadarSignal };
export type RadarInput = {
  workflow: RadarWorkflow;
  query: string;
  platforms: RadarPlatform[];
  region: string;
  category: string;
  kind: keyof typeof RADAR_KINDS;
  days: number;
};
export type RadarSourceStatus = {
  platform: RadarPlatform;
  state: "ready" | "unconfigured" | "error" | "success";
  count: number;
  detail: string;
  url: string;
};
export type RadarStep = {
  tool: string;
  title: string;
  status: "completed" | "partial";
  detail: string;
};
export type RadarRun = {
  id: string;
  input: RadarInput;
  items: ScoredRadarItem[];
  sources: RadarSourceStatus[];
  steps: RadarStep[];
  createdAt: string;
  finishedAt: string;
  status: "completed" | "partial";
  report: string;
};
export type RadarCalendarEvent = {
  id: string;
  name: string;
  date: string;
  region: string;
  daysUntil: number;
  tags: string[];
  angle: string;
  sourceUrl: string;
};

export function formatRadarCount(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(
    value,
  );
}

export function classifyRadarCategory(text: string) {
  const groups: Array<[string, RegExp]> = [
    [
      "科技数码",
      /\b(ai|tech|robot|phone|gadget|software|openai|apple|nvidia)\b|人工智能|科技|数码|机器人/i,
    ],
    ["美妆个护", /skincare|makeup|beauty|cosmetic|护肤|美妆|口红/i],
    ["美食饮品", /coffee|food|recipe|cooking|drink|咖啡|美食|食谱|饮品/i],
    ["旅行户外", /travel|camping|outdoor|hiking|旅行|露营|户外|徒步/i],
    ["运动健康", /fitness|workout|sport|yoga|nba|nfl|运动|健身|健康/i],
    ["商业财经", /finance|stock|market|business|economy|财经|商业|经济|股市/i],
    ["娱乐文化", /movie|music|film|game|celebrity|电影|音乐|游戏|娱乐/i],
  ];
  return groups.find(([, pattern]) => pattern.test(text))?.[0] || "生活方式";
}

const topicKey = (item: RadarItem) =>
  (item.topic || item.title)
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
const volume = (item: RadarItem) =>
  item.metrics.views ??
  item.metrics.searchVolume ??
  (item.platform === "Amazon" && item.metrics.rank ? 1 / item.metrics.rank : undefined);
const rate = (item: RadarItem) => {
  const views = item.metrics.views;
  if (
    !views ||
    !["likes", "comments", "shares", "saves"].some(
      (key) => item.metrics[key as keyof RadarMetrics] != null,
    )
  )
    return null;
  const m = item.metrics;
  // A reproducible interaction index, not a probability. Missing fields stay missing in the evidence.
  return (
    ((m.likes || 0) +
      2 * (m.comments || 0) +
      3 * (m.shares || 0) +
      3 * (m.saves || 0)) /
    views
  );
};
function motion(item: RadarItem) {
  // RSS search-volume buckets are not cumulative counters and cannot be differenced as views.
  const current = item.metrics.views;
  if (current == null) return { growth: null, velocity: null };
  const before = [...item.history]
    .filter((snapshot) => {
      const hours =
        (Date.parse(item.capturedAt) - Date.parse(snapshot.at)) / 3_600_000;
      return (
        hours >= 0.25 &&
        hours <= 48 &&
        snapshot.metrics.views != null &&
        snapshot.metrics.views > 0
      );
    })
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  const previous = before?.metrics.views;
  if (!before || previous == null || previous <= 0 || current < previous)
    return { growth: null, velocity: null };
  const hours =
    (Date.parse(item.capturedAt) - Date.parse(before.at)) / 3_600_000;
  return {
    growth: ((current - previous) / previous) * 100,
    velocity: (current - previous) / hours,
  };
}
function percentile(
  value: number | null | undefined,
  population: Array<number | null | undefined>,
) {
  const values = population.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (
    value == null ||
    values.length < 5 ||
    Math.max(...values) === Math.min(...values)
  )
    return null;
  return Math.round(
    (100 *
      (values.filter((v) => v < value).length +
        (values.filter((v) => v === value).length - 1) / 2)) /
      (values.length - 1),
  );
}

/** v1: within-platform and content-type comparisons; insufficient evidence never becomes a numeric prediction. */
export function scoreRadarItems(
  items: RadarItem[],
  now = Date.now(),
): ScoredRadarItem[] {
  const ageBand = (item: RadarItem) =>
    !item.publishedAt
      ? "unknown"
      : now - Date.parse(item.publishedAt) < 864e5
        ? "day"
        : now - Date.parse(item.publishedAt) < 3 * 864e5
          ? "three-days"
          : "older";
  const interactionFields = (item: RadarItem) =>
    ["likes", "comments", "shares", "saves"]
      .filter((key) => item.metrics[key as keyof RadarMetrics] != null)
      .join("|");
  return items.map((item) => {
    const cohort = items.filter(
      (peer) =>
        peer.platform === item.platform &&
        peer.kind === item.kind &&
        peer.category === item.category &&
        ageBand(peer) === ageBand(item),
    );
    const movement = motion(item);
    const engagementRate = rate(item);
    const sameTopic = items.filter((peer) => topicKey(peer) === topicKey(item));
    const crossPlatforms = new Set(sameTopic.map((peer) => peer.platform)).size;
    const heat = percentile(volume(item), cohort.map(volume));
    const momentum = percentile(
      movement.velocity,
      cohort.map((peer) => motion(peer).velocity),
    );
    const interaction = percentile(
      engagementRate,
      cohort
        .filter((peer) => interactionFields(peer) === interactionFields(item))
        .map(rate),
    );
    const ageHours = item.publishedAt
      ? Math.max(0, (now - Date.parse(item.publishedAt)) / 3_600_000)
      : null;
    const freshness =
      ageHours == null ? null : Math.round(100 * Math.exp(-ageHours / 72));
    const dimensions: RadarDimension[] = [
      {
        key: "momentum",
        label: "增长动能",
        weight: 45,
        score: momentum,
        evidence:
          movement.growth == null
            ? "需要同一内容间隔至少 15 分钟的两次快照"
            : `观测窗口增长 ${movement.growth.toFixed(1)}%；同组 ${cohort.length} 条`,
      },
      {
        key: "interaction",
        label: "互动质量",
        weight: 30,
        score: interaction,
        evidence:
          engagementRate == null
            ? "缺少播放量或互动量"
            : `加权互动指数 ${(engagementRate * 100).toFixed(2)}%；非转化率`,
      },
      {
        key: "resonance",
        label: "跨源印证",
        weight: 15,
        score:
          crossPlatforms > 1 ? Math.min(100, (crossPlatforms - 1) * 25) : null,
        evidence: `${crossPlatforms} 个平台出现同名主题；仍需人工核验语义`,
      },
      {
        key: "freshness",
        label: "内容时效",
        weight: 10,
        score: freshness,
        evidence:
          ageHours == null
            ? "来源未提供发布时间"
            : `发布于 ${Math.round(ageHours)} 小时前`,
      },
    ];
    const completeness = dimensions.reduce(
      (sum, d) => sum + (d.score == null ? 0 : d.weight),
      0,
    );
    const potential =
      momentum == null || interaction == null
        ? null
        : Math.round(
            dimensions.reduce((sum, d) => sum + (d.score ?? 0) * d.weight, 0) /
              Math.max(1, completeness),
          );
    const gaps = [
      ...(cohort.length < 5 ? ["同平台、同内容类型、同领域样本少于 5 条"] : []),
      ...(movement.growth == null ? ["缺少可比较的历史快照"] : []),
      ...(["views", "likes", "comments", "shares", "saves"] as const)
        .filter((key) => item.metrics[key] == null)
        .map(
          (key) =>
            `未提供${{ views: "播放量", likes: "点赞", comments: "评论量", shares: "分享", saves: "收藏" }[key]}`,
        ),
      ...(!item.comments?.length ? ["缺少评论正文，无法验证讨论动机"] : []),
    ];
    return {
      ...item,
      signal: {
        heat,
        potential,
        engagementRate,
        ...movement,
        crossPlatforms,
        completeness,
        dimensions,
        gaps,
      },
    };
  });
}

export function orderRadarItems(
  items: ScoredRadarItem[],
  workflow: RadarWorkflow,
) {
  return [...items].sort((a, b) => {
    if (workflow === "breakout")
      return (b.signal.potential ?? -1) - (a.signal.potential ?? -1);
    if (workflow === "resonance")
      return b.signal.crossPlatforms - a.signal.crossPlatforms;
    // Percentile is comparable; raw view counts and search volumes across platforms are not.
    return (
      (b.signal.heat ?? -1) - (a.signal.heat ?? -1) ||
      a.platform.localeCompare(b.platform) ||
      (a.metrics.rank ?? 9999) - (b.metrics.rank ?? 9999) ||
      b.capturedAt.localeCompare(a.capturedAt)
    );
  });
}
