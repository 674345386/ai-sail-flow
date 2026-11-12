# 爆款研究台：工作流与 Agent 接口

入口是 `/studio`（发现与分类热榜）和 `/studio/radar`（反向探索）。目标是全平台热点内容与创作选题，覆盖视频、短视频、图片、新闻、搜索热词、商品和节日节点。

## 五种研究入口

| 工作流 | 输入 | 组织方式 | 输出 |
| --- | --- | --- | --- |
| `top` 分类热榜 | 市场、时间、领域、内容形式、平台 | 在同平台 / 同类型 / 同领域 / 相近内容年龄组内比较热度 | 分类榜、原始指标、来源证据 |
| `product` 反向探索 | 主题、品类、使用场景，或参考图片 | 可见主体识别 → 可修改关键词 → 跨源检索 | 相关内容、需求线索、选题假设 |
| `breakout` 潜力雷达 | 内容池与多次快照 | 每小时新增播放、互动质量、跨源印证、时效 | 潜力排序、指标缺口、继续观察建议 |
| `resonance` 跨平台共振 | 一个明确主题 | 归并同名主题，统计独立平台数 | 共振证据与传播解释假设 |
| `calendar` 节点日历 | 目标市场与节点 | 未来 120 天的规则日期时间轴，选中节点再搜索 | 相关内容与提前准备方向 |

分类目前采用关键词规则，同名主题归并采用规范化文本，属于可解释的第一版，不是语义聚类模型。节日日期由规则计算，不代表节点已经热门。六个市场是美国、英国、加拿大、德国、日本、新加坡；日历包含常见节日与营销节点，不是完整法定假日数据库。

## 当前数据接入

- Google Trends：公开 Trending Now RSS；记录近似搜索量的区间下界和 Feed 顺序。不是关键词历史曲线，也不是 0–100 搜索兴趣指数。
- Google News：公开 RSS / 主题检索；新闻报道用于事件与主题线索，不推断原站阅读量。
- X：配置 `SOP_RADAR_X_BEARER_TOKEN` 后使用官方 v2 最近帖子检索与公开互动字段。需要关键词；权限、时间跨度和限额取决于账号。仅有回复数不等于取得评论正文。
- YouTube：配置 `SOP_RADAR_YOUTUBE_API_KEY` 后使用 Data API v3 的主题检索 / 热门内容与公开视频指标。公开接口不提供分享、收藏或留存。
- TikTok / Amazon：接入服务端配置的 JSON Feed，或读取已有 Apify 数据集。本实现不会启动付费采集任务。Amazon 仅采用已有排名，不把名次换算销量。
- RSSHub：可配置自建实例提供的单个 RSS / Atom Feed，作为补充资讯来源。
- JSON 导入：支持真实平台导出及历史观测。演示快照只在前端存在，不会进入证据库、收藏或真实报告。

配置参见 `.env.example` 的 Radar 段。Token 全部为服务端变量；不写入客户端或报告。配置修改由现有开发服务重启 / watch 载入。

## 评分与科学解释的边界

`shared/radar.ts` 是唯一评分实现。热度是同组百分位，至少 5 条有差异的有效样本；按发布年龄分为 24 小时内、1–3 天、3 天以上、发布时间未知。不同平台的原始流量不直接相加。

潜力指数使用增长动能 45%、互动质量 30%、跨源印证 15%、时效 10%。缺失维度按已观测权重重新归一，增长和互动维度必须同时有效。互动比较只使用可用字段一致的样本，加权互动指数为 `(点赞 + 2×评论 + 3×分享 + 3×收藏) / 播放`。它不是独立用户参与率或转化率。

增长取同一内容 15 分钟至 48 小时内的历史播放量快照，计算观测窗口增幅与每小时新增播放。RSS 搜索量区间不能当累计计数求增速。证据覆盖率是已观测权重，不是统计置信度。指数尚未用回测校准，不能宣称爆款概率或因果预测。

默认报告是确定性的证据与方法报告，包含原始指标、来源状态、观察结论、传播假设、数据缺口及验证建议。可选「AI 深入解读」复用项目文本模型，引用已有 `[E1]` 等证据，并给出创作角度；它不会自行观看视频或抓取评论正文。

## Agent 工具接口

`GET /api/studio/radar/tools` 返回版本、工具名、路径与主要 JSON Schema。前端与 Agent 使用相同接口，不复制业务逻辑。

| 接口 | 用途 |
| --- | --- |
| `GET /api/studio/radar/config` | 检查数据源能力与五种工作流 |
| `POST /api/studio/radar/run` | 采集 → URL 去重 → 保存历史 → 筛选 → 评分 → 生成并保存报告 |
| `POST /api/studio/radar/import` | 导入 `{items: [...]}`，校验链接、指标与时间戳 |
| `POST /api/studio/radar/identify` | multipart 图片识别，字段 `image`，JPG / PNG / WebP，最大 8 MB |
| `GET /api/studio/radar/calendar?region=US` | 取得未来 120 天内容节点 |
| `GET /api/studio/radar/library` | 读取证据库与收藏 ID |
| `GET /api/studio/radar/items/:id` | 读取一条持久化线索，可进入创作工作流 |
| `POST /api/studio/radar/bookmarks/:id` | `{saved: true/false}` 保存或取消收藏 |
| `GET /api/studio/radar/runs` | 最近 20 次运行摘要 |
| `GET /api/studio/radar/runs/:id` | 恢复条件、结果、执行步骤与报告 |
| `POST /api/studio/radar/runs/:id/interpret` | 用已配置文本模型补充深入解读 |

一次运行的输入示例：

```json
{
  "workflow": "resonance",
  "query": "AI video",
  "platforms": ["Google Trends", "Google News", "X", "TikTok"],
  "region": "US",
  "category": "全部领域",
  "kind": "all",
  "days": 7,
  "localOnly": false
}
```

`days` 支持 1 / 7 / 30；来源本身的覆盖范围可能小于筛选窗口。缺少发布时间时以采集时间筛选，并在证据中说明。`localOnly: true` 只分析本地证据，不调用外部平台。工作流结果返回 `completed` 或 `partial`；部分失败仍保留成功来源，并列明失败与未配置来源。

持久化目录为 `${SOP_DATA_DIR || './data'}/studio/radar/`：`items.json` 最多 3000 条内容、每条最多 48 次历史快照；`bookmarks.json` 保存收藏；`runs/` 保存最近 60 次完整研究。服务模块提供 `collectRadarSources`、`executeRadarRun`、`radarReport`，纯评分函数可直接导入。暂未把这些接口注册到现有创作 Agent 的工具表；项目 Skill 可以先通过 HTTP 复用，后续注册无需重写研究逻辑。

## 行业与开源参考

- [TikTok Creative Center](https://ads.tiktok.com/creative/creativeCenter)：参考内容发现、广告案例和趋势入口的组织方式。
- [Google Trends 数据说明](https://newsinitiative.withgoogle.com/en-gb/resources/trainings/fundamentals/google-trends-understanding-the-data/)：区分相对兴趣、采样与搜索需求，避免把趋势指标当销量。
- [RSSHub](https://github.com/DIYgod/RSSHub)：适合扩展资讯与榜单 Feed；当前通过标准 Feed 接口连接，没有复制其采集代码。
- [TrendRadar](https://github.com/sansan0/TrendRadar)：参考多平台聚合、筛选和可供 Agent 调用的结构；没有引入其完整服务或告警组件。
- [trendspyg](https://github.com/flack0x/trendspyg)：后续可评估关键词兴趣历史、相关搜索与地域比较；本版直接读取公开 RSS，未额外安装 Python 数据采集依赖。

这些项目是研究参考或可选接入方向；第三方内容访问权限、Feed 可用性和维护状态需要在实际扩展时重新验证。
