import { createHash } from "node:crypto";
import { z } from "zod";
import {
  classifyRadarCategory,
  type RadarInput,
  type RadarItem,
  type RadarMetrics,
  type RadarPlatform,
  type RadarSourceStatus,
} from "../shared/radar";

const SOURCE_URLS: Record<RadarPlatform, string> = {
  "Google Trends": "https://trends.google.com/trending",
  "Google News": "https://news.google.com/",
  TikTok: "https://ads.tiktok.com/creative/creativeCenter",
  X: "https://x.com/explore",
  YouTube: "https://www.youtube.com/feed/trending",
  Amazon: "https://www.amazon.com/gp/movers-and-shakers",
  RSSHub: "https://github.com/DIYgod/RSSHub",
};

export const radarMetricsSchema = z.object({
  views: z.number().finite().nonnegative().optional(),
  likes: z.number().finite().nonnegative().optional(),
  comments: z.number().finite().nonnegative().optional(),
  shares: z.number().finite().nonnegative().optional(),
  saves: z.number().finite().nonnegative().optional(),
  searchVolume: z.number().finite().nonnegative().optional(),
  rank: z.number().int().positive().optional(),
});
const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }, "链接必须使用 HTTPS");
export const radarImportSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(160).optional(),
      title: z.string().trim().min(1).max(500),
      platform: z.enum([
        "Google Trends",
        "Google News",
        "TikTok",
        "X",
        "YouTube",
        "Amazon",
        "RSSHub",
      ]),
      kind: z.enum(["video", "image", "news", "search", "product", "event"]),
      url: httpsUrl,
      thumbnail: httpsUrl.optional(),
      author: z.string().max(160).optional(),
      category: z.string().max(60).optional(),
      topic: z.string().max(160).optional(),
      tags: z.array(z.string().max(80)).max(20).default([]),
      excerpt: z.string().max(2000).optional(),
      publishedAt: z.iso.datetime().optional(),
      capturedAt: z.iso.datetime(),
      metrics: radarMetricsSchema.default({}),
      history: z
        .array(z.object({ at: z.iso.datetime(), metrics: radarMetricsSchema }))
        .max(48)
        .default([]),
      comments: z.array(z.string().max(1000)).max(20).optional(),
      region: z.string().max(10).optional(),
    }),
  )
  .min(1)
  .max(300);

export function sourceStatus(): RadarSourceStatus[] {
  return (Object.keys(SOURCE_URLS) as RadarPlatform[]).map((platform) => {
    const configured =
      platform === "Google Trends" ||
      platform === "Google News" ||
      (platform === "X" && !!process.env.SOP_RADAR_X_BEARER_TOKEN) ||
      (platform === "YouTube" && !!process.env.SOP_RADAR_YOUTUBE_API_KEY) ||
      (platform === "RSSHub" && !!process.env.SOP_RADAR_RSSHUB_FEED_URL) ||
      ((platform === "TikTok" || platform === "Amazon") &&
        (!!process.env[`SOP_RADAR_${platform.toUpperCase()}_FEED_URL`] ||
          (!!process.env.SOP_RADAR_APIFY_TOKEN &&
            !!process.env[`SOP_RADAR_${platform.toUpperCase()}_DATASET_ID`])));
    return {
      platform,
      state: configured ? "ready" : "unconfigured",
      count: 0,
      url: SOURCE_URLS[platform],
      detail: configured
        ? ["Google Trends", "Google News"].includes(platform)
          ? "公开 RSS · 可直接采集"
          : "已配置 · 运行时验证连接"
        : platform === "YouTube"
          ? "需要 YouTube Data API Key，或导入数据"
          : platform === "X"
            ? "需要 X API Bearer Token，或导入数据"
            : platform === "RSSHub"
              ? "可配置自建 RSSHub 的 Feed 地址"
              : "可接入 JSON Feed / 已有 Apify 数据集，或导入数据",
    };
  });
}

async function readRemote(url: string, headers?: Record<string, string>) {
  const response = await fetch(url, {
    headers: {
      Accept:
        "application/json, application/rss+xml, application/xml, text/xml",
      ...headers,
    },
    signal: AbortSignal.timeout(12_000),
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`来源返回 HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("来源返回空内容");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("来源响应超过 3 MB，请缩小 Feed");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

const decodeXml = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,
      (all, code: string) => {
        if (!code.startsWith("#"))
          return (
            (
              { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<
                string,
                string
              >
            )[code.toLowerCase()] || all
          );
        const n =
          code[1].toLowerCase() === "x"
            ? parseInt(code.slice(2), 16)
            : Number(code.slice(1));
        return Number.isFinite(n) && n >= 0 && n <= 0x10ffff
          ? String.fromCodePoint(n)
          : "";
      },
    )
    .trim();
const xmlTag = (xml: string, name: string) =>
  decodeXml(
    xml.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"),
    )?.[1] || "",
  );
const safeUrl = (value: unknown) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
};
const number = (value: unknown) => {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const itemId = (platform: string, url: string) =>
  createHash("sha256").update(`${platform}|${url}`).digest("hex").slice(0, 24);
const isoDate = (value: unknown) => {
  const at = Date.parse(String(value || ""));
  return Number.isFinite(at) && at <= Date.now() + 300_000
    ? new Date(at).toISOString()
    : undefined;
};
const trafficValue = (text: string) => {
  const m = text.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  return m
    ? Number(m[1]) *
        ({ K: 1000, M: 1e6, B: 1e9 }[m[2]?.toUpperCase() as "K"] || 1)
    : undefined;
};

function parseFeed(
  xml: string,
  platform: RadarPlatform,
  input: RadarInput,
): RadarItem[] {
  if (!/<rss\b|<feed\b/i.test(xml)) throw new Error("来源未返回 RSS / Atom");
  const records =
    xml.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>|<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi,
    ) || [];
  const now = new Date().toISOString();
  return records.slice(0, 60).flatMap((record, index) => {
    const title = xmlTag(record, "title").slice(0, 500);
    const url = safeUrl(
      xmlTag(record, "link") ||
        record.match(/<link[^>]*href=["']([^"']+)/i)?.[1],
    );
    if (!title || !url) return [];
    const traffic = xmlTag(record, "ht:approx_traffic");
    const topic =
      platform === "Google Trends"
        ? title
        : input.query &&
            title.toLocaleLowerCase().includes(input.query.toLocaleLowerCase())
          ? input.query
          : undefined;
    return [
      {
        id: itemId(platform, url),
        title,
        platform,
        url,
        kind:
          platform === "Google Trends"
            ? ("search" as const)
            : ("news" as const),
        category: classifyRadarCategory(title),
        topic,
        tags: [platform === "Google Trends" ? "搜索热词" : "资讯"],
        excerpt: xmlTag(record, "description").slice(0, 1500),
        thumbnail: safeUrl(xmlTag(record, "ht:picture")) || undefined,
        author: xmlTag(record, "source") || undefined,
        publishedAt: isoDate(
          xmlTag(record, "pubDate") || xmlTag(record, "published"),
        ),
        capturedAt: now,
        metrics: {
          ...(platform === "Google Trends" ? { rank: index + 1 } : {}),
          ...(traffic ? { searchVolume: trafficValue(traffic) } : {}),
        },
        history: [],
        region: input.region,
        provenance: "live" as const,
        sourceLabel:
          platform === "Google Trends"
            ? "Google Trends RSS · 搜索量为区间下界"
            : `${platform} RSS · 新闻线索`,
      },
    ];
  });
}

type LooseRecord = Record<string, any>;
function datasetItems(
  raw: unknown,
  platform: "TikTok" | "Amazon",
  input: RadarInput,
): RadarItem[] {
  const rows: LooseRecord[] = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === "object" &&
        Array.isArray((raw as LooseRecord).items)
      ? (raw as LooseRecord).items
      : [];
  const now = new Date().toISOString();
  return rows.slice(0, 100).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const url = safeUrl(
      row.url ||
        row.webVideoUrl ||
        row.productUrl ||
        (row.asin &&
          `https://www.amazon.com/dp/${encodeURIComponent(row.asin)}`),
    );
    const title = String(row.title || row.text || row.description || "")
      .trim()
      .slice(0, 500);
    if (!title || !url) return [];
    const stats = row.metrics || row.stats || {};
    const metrics: RadarMetrics =
      platform === "TikTok"
        ? {
            views: number(stats.views ?? stats.playCount ?? row.playCount),
            likes: number(stats.likes ?? stats.diggCount ?? row.diggCount),
            comments: number(
              stats.comments ?? stats.commentCount ?? row.commentCount,
            ),
            shares: number(stats.shares ?? stats.shareCount ?? row.shareCount),
            saves: number(
              stats.saves ?? stats.collectCount ?? row.collectCount,
            ),
          }
        : { rank: number(stats.rank ?? row.rank ?? row.bestSellerRank) };
    return [
      {
        id: itemId(platform, url),
        title,
        platform,
        kind: platform === "TikTok" ? ("video" as const) : ("product" as const),
        url,
        thumbnail:
          safeUrl(
            row.thumbnail ||
              row.videoMeta?.coverUrl ||
              row.image ||
              row.imageUrl,
          ) || undefined,
        author: String(
          row.author?.name || row.authorMeta?.name || row.brand || "",
        ).slice(0, 160),
        category: String(row.category || classifyRadarCategory(title)).slice(
          0,
          60,
        ),
        topic:
          typeof row.topic === "string" ? row.topic.slice(0, 160) : undefined,
        tags: Array.isArray(row.tags)
          ? row.tags.filter((v: unknown) => typeof v === "string").slice(0, 12)
          : [],
        publishedAt: isoDate(row.publishedAt || row.createTimeISO),
        capturedAt: isoDate(row.capturedAt) || now,
        metrics: Object.fromEntries(
          Object.entries(metrics).filter(([, v]) => v != null),
        ),
        history: [],
        region: input.region,
        provenance: "live" as const,
        sourceLabel: `${platform} · 已配置的数据集${isoDate(row.capturedAt) ? "（含原始采集时间）" : "（原采集时间未知，时间戳为本次读取时间）"}`,
      },
    ];
  });
}

async function collectX(input: RadarInput): Promise<RadarItem[]> {
  const query = input.query
    .trim()
    .replace(/[^\p{L}\p{N}\s#@-]/gu, " ")
    .trim();
  if (!query) throw new Error("X 搜索需要关键词，请填写主题后再运行");
  const params = new URLSearchParams({
    query: `${query} -is:retweet`,
    max_results: "30",
    "tweet.fields": "created_at,public_metrics,entities,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username",
    "media.fields": "type,preview_image_url,url",
  });
  const data = JSON.parse(
    await readRemote(`https://api.x.com/2/tweets/search/recent?${params}`, {
      Authorization: `Bearer ${process.env.SOP_RADAR_X_BEARER_TOKEN}`,
    }),
  );
  if (data.errors?.length && !data.data)
    throw new Error("X 未返回可用数据，请检查权限与查询条件");
  return (data.data || []).map((row: LooseRecord) => {
    const media = data.includes?.media?.find((entry: LooseRecord) =>
      row.attachments?.media_keys?.includes(entry.media_key),
    );
    const url = `https://x.com/i/status/${row.id}`;
    const topic =
      input.query &&
      row.text.toLocaleLowerCase().includes(input.query.toLocaleLowerCase())
        ? input.query
        : undefined;
    const metrics = row.public_metrics || {};
    return {
      id: itemId("X", url),
      title: String(row.text).slice(0, 500),
      platform: "X",
      kind:
        media?.type === "video"
          ? "video"
          : media?.type === "photo"
            ? "image"
            : "news",
      url,
      thumbnail: safeUrl(media?.preview_image_url || media?.url) || undefined,
      author: data.includes?.users?.find(
        (u: LooseRecord) => u.id === row.author_id,
      )?.username,
      category: classifyRadarCategory(row.text),
      topic,
      tags: (row.entities?.hashtags || [])
        .map((tag: LooseRecord) => tag.tag)
        .slice(0, 12),
      publishedAt: isoDate(row.created_at),
      capturedAt: new Date().toISOString(),
      metrics: {
        views: number(metrics.impression_count),
        likes: number(metrics.like_count),
        comments: number(metrics.reply_count),
        shares: number(metrics.retweet_count),
        saves: number(metrics.bookmark_count),
      },
      history: [],
      region: input.region,
      provenance: "live",
      sourceLabel: "X API v2 · 公开互动指标（回复数不是评论正文）",
    } satisfies RadarItem;
  });
}

async function collectYoutube(input: RadarInput): Promise<RadarItem[]> {
  const key = process.env.SOP_RADAR_YOUTUBE_API_KEY!;
  let ids = "";
  if (input.query) {
    const params = new URLSearchParams({
      part: "id",
      q: input.query,
      type: "video",
      order: "relevance",
      maxResults: "30",
      regionCode: input.region,
      publishedAfter: new Date(Date.now() - input.days * 864e5).toISOString(),
      key,
    });
    const data = JSON.parse(
      await readRemote(
        `https://www.googleapis.com/youtube/v3/search?${params}`,
      ),
    );
    ids = (data.items || [])
      .map((row: LooseRecord) => row.id?.videoId)
      .filter(Boolean)
      .join(",");
    if (!ids) return [];
  }
  const params = new URLSearchParams({
    part: "snippet,statistics",
    maxResults: "30",
    ...(ids ? { id: ids } : { chart: "mostPopular", regionCode: input.region }),
    key,
  });
  const data = JSON.parse(
    await readRemote(`https://www.googleapis.com/youtube/v3/videos?${params}`),
  );
  return (data.items || []).map((row: LooseRecord) => {
    const url = `https://www.youtube.com/watch?v=${row.id}`;
    return {
      id: itemId("YouTube", url),
      title: row.snippet.title,
      platform: "YouTube",
      kind: "video",
      url,
      thumbnail: safeUrl(row.snippet.thumbnails?.medium?.url) || undefined,
      author: row.snippet.channelTitle,
      category: classifyRadarCategory(row.snippet.title),
      tags: (row.snippet.tags || []).slice(0, 12),
      publishedAt: isoDate(row.snippet.publishedAt),
      capturedAt: new Date().toISOString(),
      metrics: {
        views: number(row.statistics?.viewCount),
        likes: number(row.statistics?.likeCount),
        comments: number(row.statistics?.commentCount),
      },
      history: [],
      region: input.region,
      provenance: "live",
      sourceLabel: "YouTube Data API v3 · 公开指标",
    } satisfies RadarItem;
  });
}

export async function collectRadarSources(
  input: RadarInput,
): Promise<{ items: RadarItem[]; sources: RadarSourceStatus[] }> {
  const statuses = sourceStatus().filter((source) =>
    input.platforms.includes(source.platform),
  );
  const results = await Promise.allSettled(
    statuses.map(async (source) => {
      if (source.state === "unconfigured")
        return { items: [] as RadarItem[], source };
      let items: RadarItem[] = [];
      const platform = source.platform;
      if (platform === "Google Trends")
        items = parseFeed(
          await readRemote(
            `https://trends.google.com/trending/rss?geo=${encodeURIComponent(input.region)}`,
          ),
          platform,
          input,
        );
      else if (platform === "Google News") {
        const params = new URLSearchParams({
          ...(input.query ? { q: `${input.query} when:${input.days}d` } : {}),
          hl: "en-US",
          gl: input.region,
          ceid: `${input.region}:en`,
        });
        items = parseFeed(
          await readRemote(
            `https://news.google.com/rss${input.query ? "/search" : ""}?${params}`,
          ),
          platform,
          input,
        );
      } else if (platform === "RSSHub")
        items = parseFeed(
          await readRemote(process.env.SOP_RADAR_RSSHUB_FEED_URL!),
          platform,
          input,
        );
      else if (platform === "X") items = await collectX(input);
      else if (platform === "YouTube") items = await collectYoutube(input);
      else {
        const feed =
          process.env[`SOP_RADAR_${platform.toUpperCase()}_FEED_URL`];
        const dataset =
          process.env[`SOP_RADAR_${platform.toUpperCase()}_DATASET_ID`];
        const url =
          feed ||
          `https://api.apify.com/v2/datasets/${encodeURIComponent(dataset!)}/items?clean=true&limit=100`;
        items = datasetItems(
          JSON.parse(
            await readRemote(
              url,
              feed
                ? undefined
                : {
                    Authorization: `Bearer ${process.env.SOP_RADAR_APIFY_TOKEN}`,
                  },
            ),
          ),
          platform,
          input,
        );
      }
      return {
        items,
        source: {
          ...source,
          state: "success" as const,
          count: items.length,
          detail: items.length
            ? `取得 ${items.length} 条来源记录`
            : "本次没有匹配记录；可更换关键词",
        },
      };
    }),
  );
  return {
    items: results.flatMap((result) =>
      result.status === "fulfilled" ? result.value.items : [],
    ),
    sources: results.map((result, index) =>
      result.status === "fulfilled"
        ? result.value.source
        : {
            ...statuses[index],
            state: "error",
            detail:
              result.reason instanceof Error &&
              /HTTP|来源|响应|Feed|RSS|X 搜索|X 未/.test(result.reason.message)
                ? result.reason.message
                : "连接失败或数据格式不兼容，请检查来源配置后重试",
          },
    ),
  };
}
