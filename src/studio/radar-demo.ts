import {
  classifyRadarCategory,
  scoreRadarItems,
  type RadarItem,
  type RadarPlatform,
  type RadarKind,
} from "../../shared/radar";

/** Illustrative observations only. They never enter the persisted evidence library. */
export function radarDemo() {
  const now = Date.now();
  const examples: Array<
    [string, RadarPlatform, RadarKind, string, string, string, number, number]
  > = [
    [
      "当 AI 短片开始拥有电影感",
      "TikTok",
      "video",
      "AI 视频",
      "科技数码",
      "kv-tech",
      840000,
      260000,
    ],
    [
      "用 AI 把一段日常变成故事",
      "TikTok",
      "video",
      "AI 视频",
      "科技数码",
      "kv-campaign",
      620000,
      290000,
    ],
    [
      "实测：口袋里的 AI 随身助手",
      "TikTok",
      "video",
      "AI 硬件",
      "科技数码",
      "main-earbuds",
      460000,
      180000,
    ],
    [
      "一张照片，三个 AI 创作角度",
      "TikTok",
      "video",
      "AI 视频",
      "科技数码",
      "kv-gift",
      310000,
      220000,
    ],
    [
      "桌面上值得留下的科技小物",
      "TikTok",
      "video",
      "桌面改造",
      "科技数码",
      "main-bottle",
      210000,
      180000,
    ],
    [
      "AI 创作工具的真实使用记录",
      "TikTok",
      "video",
      "AI 工具",
      "科技数码",
      "main-earbuds",
      150000,
      136000,
    ],
    [
      "AI 视频",
      "Google Trends",
      "search",
      "AI 视频",
      "科技数码",
      "kv-tech",
      100000,
      0,
    ],
    [
      "关于 AI 创作，人们正在讨论什么",
      "X",
      "image",
      "AI 视频",
      "科技数码",
      "kv-campaign",
      320000,
      110000,
    ],
    [
      "冬日咖啡：可以被收藏的生活提案",
      "YouTube",
      "video",
      "冬日咖啡",
      "美食饮品",
      "scene-coffee",
      189000,
      98000,
    ],
    [
      "年末旅行，正在出现哪些新偏好",
      "Google News",
      "news",
      "冬季旅行",
      "旅行户外",
      "main-sneakers",
      0,
      0,
    ],
    [
      "有设计感的桌面随行杯",
      "Amazon",
      "product",
      "桌面改造",
      "生活方式",
      "main-bottle",
      0,
      0,
    ],
    [
      "黑色星期五",
      "Google Trends",
      "search",
      "黑色星期五",
      "商业财经",
      "kv-gift",
      50000,
      0,
    ],
  ];
  const rows: RadarItem[] = examples.map(
    ([title, platform, kind, topic, category, image, views, before], index) => {
      const likes = Math.round(views * (0.075 - index * 0.004));
      const urls: Record<RadarPlatform, string> = {
        TikTok: `https://www.tiktok.com/search?q=${encodeURIComponent(topic)}`,
        X: `https://x.com/search?q=${encodeURIComponent(topic)}`,
        YouTube: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}`,
        "Google Trends": `https://trends.google.com/trends/explore?geo=US&q=${encodeURIComponent(topic)}`,
        "Google News": `https://news.google.com/search?q=${encodeURIComponent(topic)}`,
        Amazon: `https://www.amazon.com/s?k=${encodeURIComponent("desk tumbler")}`,
        RSSHub: "https://github.com/DIYgod/RSSHub",
      };
      return {
        id: `demo-${index}`,
        title,
        platform,
        kind,
        url: urls[platform],
        thumbnail: `/studio/gen/${image}.jpg`,
        author: undefined,
        category: category || classifyRadarCategory(title),
        topic,
        tags: [topic, index < 2 ? "叙事表达" : "内容选题"],
        excerpt:
          "演示研究线索。标题、指标与历史快照用于展示工作流，不代表真实内容表现或当前热点。图片使用工作室已有展示素材。",
        publishedAt: new Date(now - (index + 2) * 36e5).toISOString(),
        capturedAt: new Date(now).toISOString(),
        metrics:
          kind === "search"
            ? { searchVolume: views, rank: index === 6 ? 1 : 2 }
            : kind === "product"
              ? { rank: 12 }
              : kind === "news"
                ? {}
                : {
                    views,
                    likes,
                    comments: Math.round(views * 0.008),
                    shares: Math.round(views * 0.015),
                    saves: Math.round(views * 0.02),
                  },
        history: before
          ? [
              {
                at: new Date(now - 6 * 36e5).toISOString(),
                metrics: { views: before },
              },
            ]
          : [],
        region: "US",
        provenance: "demo",
        sourceLabel: "演示数据 · 链接仅指向平台检索页",
      };
    },
  );
  return scoreRadarItems(rows, now);
}
