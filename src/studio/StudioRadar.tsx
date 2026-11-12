import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  Grid2X2,
  History,
  ImagePlus,
  Layers3,
  LayoutList,
  LoaderCircle,
  Radio,
  Radar,
  ScanSearch,
  Search,
  Settings2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { downloadBlob } from "../api";
import {
  RADAR_CATEGORIES,
  RADAR_KINDS,
  RADAR_PLATFORMS,
  RADAR_WORKFLOWS,
  formatRadarCount,
  orderRadarItems,
  type RadarCalendarEvent,
  type RadarInput,
  type RadarPlatform,
  type RadarWorkflow,
  type ScoredRadarItem,
} from "../../shared/radar";
import {
  bookmarkRadarItem,
  getRadarCalendar,
  identifyRadarImage,
  importRadarItems,
  interpretRadarRun,
  radarConfig,
  radarLibrary,
  radarRun,
  radarRuns,
  runRadar,
  type RadarRun,
  type RadarRunSummary,
  type RadarSourceStatus,
  type TrendItem,
} from "./studioApi";
import { radarDemo } from "./radar-demo";
import "./radar.css";

const workflowIcons = {
  top: Layers3,
  product: ScanSearch,
  breakout: Activity,
  resonance: Radio,
  calendar: CalendarDays,
};
const platformClass = (platform: string) =>
  platform.toLowerCase().replace(/\s+/g, "-");
const dateLabel = (at: string) =>
  new Date(at).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const kindLabels = {
  video: "视频",
  image: "图片",
  news: "新闻",
  search: "热词",
  product: "商品",
  event: "节点",
};
const regions = {
  US: "美国",
  GB: "英国",
  CA: "加拿大",
  DE: "德国",
  JP: "日本",
  SG: "新加坡",
};
function Platform({
  name,
  short = false,
}: {
  name: RadarPlatform;
  short?: boolean;
}) {
  return (
    <span className={`rd-platform ${platformClass(name)}`}>
      <i aria-hidden="true" />
      {short ? name.replace("Google ", "") : name}
    </span>
  );
}
function SignalNumber({
  value,
  neutral = false,
}: {
  value: number | null;
  neutral?: boolean;
}) {
  return value == null ? (
    <span className="rd-no-score" title="当前证据不足，尚不能计算">
      待验证
    </span>
  ) : (
    <span className={`rd-score ${neutral ? "neutral" : ""}`}>
      {value}
      <small>/100</small>
    </span>
  );
}
function Thumbnail({
  item,
  large = false,
}: {
  item: ScoredRadarItem;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.thumbnail]);
  return (
    <div
      className={`rd-thumb ${large ? "large" : ""} ${platformClass(item.platform)}`}
    >
      {item.thumbnail && !failed ? (
        <img
          src={item.thumbnail}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <Radar size={large ? 38 : 22} strokeWidth={1.2} />
          <span>{kindLabels[item.kind]}</span>
        </>
      )}
      {large && (
        <span className="rd-media-kind">
          {kindLabels[item.kind]}
          {item.provenance === "demo" ? " · 示例素材" : ""}
        </span>
      )}
    </div>
  );
}
const sampleReport =
  "# 一份可以追溯的热点研究报告\n\n当前为演示快照，标题与指标用于展示研究方法，不代表当前热点。运行一次工作流后，这里将生成基于真实来源的报告。\n\n## 我们观察什么\n\n把累计流量、增长动能、互动质量与跨平台印证分开观察。每条线索都保留来源、采集时间和缺失字段。\n\n## 为什么可能传播\n\n传播机制只能作为待验证假设。未经视频、转写或评论正文分析，不从标题推断镜头、钩子或情绪。\n\n## 如何验证潜力\n\n同一内容至少两次、相隔至少 15 分钟的播放量快照；在同平台、同内容类型、同领域的至少 5 个样本中比较。增长与互动信息不足时不生成潜力分数。\n\n## 从研究走向创作\n\n报告包含观察事实、传播假设、选题方向、反例、数据缺口与验证建议。潜力指数是待校准的排序工具，不是爆款概率。";

export default function StudioRadar({
  onRemake,
  initialWorkflow = "top",
}: {
  onRemake: (item: TrendItem) => void;
  initialWorkflow?: RadarWorkflow;
}) {
  const [workflow, setWorkflow] = useState<RadarWorkflow>(initialWorkflow);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("US");
  const [days, setDays] = useState(7);
  const [category, setCategory] = useState("全部领域");
  const [kind, setKind] = useState<keyof typeof RADAR_KINDS>("all");
  const [platforms, setPlatforms] = useState<RadarPlatform[]>([
    ...RADAR_PLATFORMS,
  ]);
  const [run, setRun] = useState<RadarRun | null>(null);
  const [sources, setSources] = useState<RadarSourceStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [libraryItems, setLibraryItems] = useState<ScoredRadarItem[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [sort, setSort] = useState("heat");
  const [panel, setPanel] = useState<"sources" | "history" | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [records, setRecords] = useState<RadarRunSummary[]>([]);
  const [calendar, setCalendar] = useState<RadarCalendarEvent[]>([]);
  const [imagePreview, setImagePreview] = useState("");
  const [imageInfo, setImageInfo] = useState<Awaited<
    ReturnType<typeof identifyRadarImage>
  > | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const userStarted = useRef(false);
  const demo = useMemo(() => orderRadarItems(radarDemo(), "top"), []);
  const data = savedOnly ? libraryItems : run?.items || demo;
  const isDemo = !run;
  const currentWorkflow = RADAR_WORKFLOWS.find((item) => item.id === workflow)!;
  useEffect(() => {
    setWorkflow(initialWorkflow);
    setReportOpen(false);
  }, [initialWorkflow]);
  useEffect(() => {
    mounted.current = true;
    void Promise.allSettled([radarConfig(), radarLibrary(), radarRuns()]).then(
      (results) => {
        if (!mounted.current) return;
        if (results[0].status === "fulfilled")
          setSources(results[0].value.sources);
        if (results[1].status === "fulfilled") {
          setBookmarks(results[1].value.bookmarks);
          setLibraryItems(results[1].value.items);
        }
        if (results[2].status === "fulfilled") {
          setRecords(results[2].value);
          const latest = results[2].value[0];
          if (latest)
            void radarRun(latest.id)
              .then((value) => {
                if (!mounted.current || userStarted.current) return;
                applyRun(value);
                setQuery(value.input.query);
                setRegion(value.input.region);
                setDays(value.input.days);
                setPlatforms(value.input.platforms);
                setCategory(value.input.category);
                setKind(value.input.kind);
                if (initialWorkflow === "top")
                  setWorkflow(value.input.workflow);
              })
              .catch(() => {
                if (mounted.current)
                  setNotice(
                    "上次研究未能恢复，可以重新运行或在研究记录中重试。",
                  );
              });
        }
        if (results.some((result) => result.status === "rejected"))
          setNotice(
            "部分本地记录未能读取。可重新运行研究，或打开「数据源」检查连接。",
          );
      },
    );
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void getRadarCalendar(region)
      .then((value) => {
        if (!cancelled) setCalendar(value);
      })
      .catch(() => {
        if (!cancelled) setCalendar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [region]);
  useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );
  const visible = useMemo(() => {
    const rows = data.filter(
      (item) =>
        platforms.includes(item.platform) &&
        (category === "全部领域" || item.category === category) &&
        (kind === "all" || item.kind === kind) &&
        (!savedOnly || bookmarks.includes(item.id)),
    );
    if (sort === "recent")
      return [...rows].sort((a, b) =>
        (b.publishedAt || b.capturedAt).localeCompare(
          a.publishedAt || a.capturedAt,
        ),
      );
    return orderRadarItems(rows, sort === "potential" ? "breakout" : workflow);
  }, [data, platforms, category, kind, savedOnly, bookmarks, sort, workflow]);
  const selected = visible.find((item) => item.id === selectedId) || visible[0];
  const activeSources = run?.sources || sources;
  const inputChanged =
    !!run &&
    JSON.stringify(run.input) !==
      JSON.stringify({
        workflow,
        query: query.trim(),
        platforms,
        region,
        category,
        kind,
        days,
      });
  function applyRun(value: RadarRun) {
    setRun(value);
    setSelectedId(value.items[0]?.id || "");
    setSavedOnly(false);
    setLibraryItems((previous) => [
      ...new Map(
        [...previous, ...value.items].map((item) => [item.id, item]),
      ).values(),
    ]);
    setRecords((previous) =>
      [
        {
          id: value.id,
          input: value.input,
          createdAt: value.createdAt,
          status: value.status,
          count: value.items.length,
        },
        ...previous.filter((item) => item.id !== value.id),
      ].slice(0, 20),
    );
  }
  async function scan(localOnly = false, override?: Partial<RadarInput>) {
    userStarted.current = true;
    if (busy || identifying) return;
    if (!platforms.length) {
      setError("请至少选择一个数据源。");
      return;
    }
    if (
      !localOnly &&
      (workflow === "product" || workflow === "resonance") &&
      !query.trim() &&
      !override?.query
    ) {
      setError("请先输入主题、品类，或上传图片识别关键词。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setReportOpen(false);
    setPanel(null);
    try {
      const result = await runRadar(
        {
          workflow,
          query: query.trim(),
          platforms,
          region,
          category,
          kind,
          days,
          ...override,
        },
        localOnly,
      );
      if (mounted.current) {
        applyRun(result);
        if (!result.items.length)
          setNotice(
            "本次没有匹配线索。可放宽筛选、更换关键词，或导入已有平台数据。",
          );
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "研究未完成，请检查服务连接后重试。",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function importFile(file: File) {
    setError("");
    setNotice("");
    if (file.size > 3 * 1024 * 1024) {
      setError("JSON 文件不能超过 3 MB。");
      return;
    }
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      const result = await importRadarItems(
        Array.isArray(parsed) ? parsed : parsed.items,
      );
      const value = await runRadar(
        {
          workflow,
          query: "",
          platforms: [...RADAR_PLATFORMS],
          region,
          category: "全部领域",
          kind: "all",
          days: 30,
        },
        true,
      );
      if (mounted.current) {
        setQuery("");
        setPlatforms([...RADAR_PLATFORMS]);
        setCategory("全部领域");
        setKind("all");
        setDays(30);
        applyRun(value);
        setPanel(null);
        setNotice(`已导入 ${result.count} 条记录，并完成本地证据分析。`);
      }
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "文件不是有效 JSON。请下载模板并按格式填写。"
          : e instanceof Error
            ? e.message
            : "导入失败，请检查文件格式。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function uploadImage(file: File) {
    if (
      file.size > 8 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setError("请选择 8 MB 以内的 JPG、PNG 或 WebP 图片。");
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    setImageInfo(null);
    setIdentifying(true);
    setError("");
    try {
      const info = await identifyRadarImage(file);
      if (mounted.current) {
        setImageInfo(info);
        setQuery(info.keywords[0] || info.subject);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "图片识别失败。可手动输入主题继续探索。",
      );
    } finally {
      if (mounted.current) setIdentifying(false);
    }
  }
  async function toggleBookmark(item: ScoredRadarItem) {
    if (item.provenance === "demo" || bookmarkBusy) return;
    setBookmarkBusy(item.id);
    setError("");
    try {
      const result = await bookmarkRadarItem(
        item.id,
        !bookmarks.includes(item.id),
      );
      setBookmarks(result.bookmarks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "收藏未保存，请重试。");
    } finally {
      setBookmarkBusy("");
    }
  }
  function template() {
    const example = [
      {
        title: "替换为真实内容标题",
        platform: "TikTok",
        kind: "video",
        url: "https://www.tiktok.com/@creator/video/REPLACE_WITH_REAL_ID",
        category: "科技数码",
        topic: "替换为主题",
        tags: [],
        capturedAt: new Date().toISOString(),
        metrics: {},
        history: [],
      },
    ];
    downloadBlob(
      new Blob([JSON.stringify(example, null, 2)], {
        type: "application/json",
      }),
      "radar-import-template.json",
    );
  }
  async function openRecord(id: string) {
    setBusy(true);
    setError("");
    try {
      const value = await radarRun(id);
      const input = value.input;
      applyRun(value);
      setWorkflow(input.workflow);
      setQuery(input.query);
      setRegion(input.region);
      setDays(input.days);
      setPlatforms(input.platforms);
      setCategory(input.category);
      setKind(input.kind);
      setPanel(null);
      setReportOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "记录无法读取，请重试。");
    } finally {
      setBusy(false);
    }
  }
  async function interpret() {
    if (!run || interpreting) return;
    setInterpreting(true);
    setError("");
    try {
      const value = await interpretRadarRun(run.id);
      if (mounted.current)
        setRun((current) => (current?.id === value.id ? value : current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "深入解读未完成，请稍后重试。");
    } finally {
      if (mounted.current) setInterpreting(false);
    }
  }
  return (
    <div className="radar-desk" aria-busy={busy}>
      <header className="rd-heading">
        <div>
          <h1>
            发现下一波流量<span className="rd-heading-dot">.</span>
          </h1>
          <p>从全网信号中发现热点，用证据找到值得创作的方向。</p>
        </div>
        <div className="rd-heading-actions">
          <button
            type="button"
            className={`rd-button subtle ${panel === "history" ? "selected" : ""}`}
            onClick={() => setPanel(panel === "history" ? null : "history")}
            aria-expanded={panel === "history"}
          >
            <History size={15} />
            研究记录{records.length > 0 && <span>{records.length}</span>}
          </button>
          <button
            type="button"
            className={`rd-button ${panel === "sources" ? "selected" : ""}`}
            onClick={() => setPanel(panel === "sources" ? null : "sources")}
            aria-expanded={panel === "sources"}
          >
            <Settings2 size={15} />
            数据源与方法
          </button>
        </div>
      </header>
      {panel === "sources" && (
        <section className="rd-config" aria-label="数据源与分析方法">
          <div className="rd-section-title">
            <div>
              <h2>连接信号，保留证据</h2>
              <p>
                公开来源可以直接采集，平台互动数据需要凭证、已有数据集或导入记录。
              </p>
            </div>
            <button
              type="button"
              className="rd-icon-button"
              onClick={() => setPanel(null)}
              aria-label="关闭数据源面板"
            >
              <X size={17} />
            </button>
          </div>
          <div className="rd-source-list">
            {sources.map((source) => (
              <div key={source.platform}>
                <Platform name={source.platform} />
                <span
                  className={source.state === "ready" ? "rd-connected" : ""}
                >
                  {source.state === "ready" ? "可采集" : "待接入"}
                </span>
                <p>{source.detail}</p>
                <a href={source.url} target="_blank" rel="noreferrer">
                  查看来源
                  <ArrowUpRight size={12} />
                </a>
              </div>
            ))}
          </div>
          <div className="rd-config-bottom">
            <div>
              <strong>也可以从已有证据开始</strong>
              <p>
                JSON 支持真实链接、点赞 / 评论 / 收藏 /
                分享、评论正文与历史快照。
              </p>
            </div>
            <button type="button" className="rd-button" onClick={template}>
              <ArrowDownToLine size={14} />
              下载模板
            </button>
            <button
              type="button"
              className="rd-button"
              disabled={busy}
              onClick={() => importRef.current?.click()}
            >
              <Upload size={14} />
              导入 JSON
            </button>
            <button
              type="button"
              className="rd-button accent"
              disabled={busy}
              onClick={() => void scan(true)}
            >
              <Database size={14} />
              分析证据库
            </button>
          </div>
          <details className="rd-method">
            <summary>
              潜力指数如何计算
              <ChevronDown size={13} />
            </summary>
            <p>
              同平台、同内容类型、同领域中比较，至少 5 条有效样本。增长动能 45%
              + 互动质量 30% + 跨源印证 15% + 时效
              10%。增长与互动是必要条件，缺失维度按已观测权重归一。需要间隔至少
              15
              分钟的历史播放量快照。结果是待校准的排序指数，不是爆款概率；评论动机与内容结构需要进一步检查原文。
            </p>
          </details>
        </section>
      )}
      {panel === "history" && (
        <section className="rd-config" aria-label="研究记录">
          <div className="rd-section-title">
            <div>
              <h2>继续一次研究</h2>
              <p>每次运行都保存筛选条件、来源状态、结果与报告。</p>
            </div>
            <button
              type="button"
              className="rd-icon-button"
              onClick={() => setPanel(null)}
              aria-label="关闭研究记录"
            >
              <X size={17} />
            </button>
          </div>
          {records.length ? (
            <div className="rd-history-list">
              {records.map((record) => (
                <button
                  type="button"
                  key={record.id}
                  disabled={busy}
                  onClick={() => void openRecord(record.id)}
                >
                  <FileText size={17} />
                  <div>
                    <strong>{record.input.query || "市场热点概览"}</strong>
                    <span>
                      {
                        RADAR_WORKFLOWS.find(
                          (w) => w.id === record.input.workflow,
                        )?.name
                      }{" "}
                      · {record.input.region} · {record.count} 条线索
                    </span>
                  </div>
                  <time>{dateLabel(record.createdAt)}</time>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <div className="rd-compact-empty">
              还没有研究记录。选择工作流并运行一次，报告会保存在这里。
            </div>
          )}
        </section>
      )}
      <section className="rd-search-workspace" aria-label="热点研究工作流">
        <div className="rd-workflows" role="tablist" aria-label="发现方式">
          {RADAR_WORKFLOWS.map((w) => {
            const Icon = workflowIcons[w.id];
            return (
              <button
                type="button"
                key={w.id}
                role="tab"
                id={`workflow-${w.id}`}
                aria-controls="rd-workflow-panel"
                aria-selected={workflow === w.id}
                tabIndex={workflow === w.id ? 0 : -1}
                className={workflow === w.id ? "active" : ""}
                onClick={() => {
                  setWorkflow(w.id);
                  setReportOpen(false);
                  setSort(w.id === "breakout" ? "potential" : "heat");
                }}
                onKeyDown={(e) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const current = RADAR_WORKFLOWS.findIndex(
                    (entry) => entry.id === workflow,
                  );
                  const index =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 4
                        : (current + (e.key === "ArrowRight" ? 1 : 4)) % 5;
                  const next = RADAR_WORKFLOWS[index].id;
                  setWorkflow(next);
                  setReportOpen(false);
                  document.getElementById(`workflow-${next}`)?.focus();
                }}
              >
                <Icon size={17} strokeWidth={1.7} />
                <span>{w.name}</span>
                {w.id === "breakout" && <i className="rd-tab-dot" />}
              </button>
            );
          })}
        </div>
        <div
          className="rd-workflow-body"
          role="tabpanel"
          id="rd-workflow-panel"
          aria-labelledby={`workflow-${workflow}`}
        >
          <div className="rd-workflow-description">
            <h2>{currentWorkflow.subtitle}</h2>
            <p>{currentWorkflow.description}</p>
          </div>
          <form
            className="rd-search"
            onSubmit={(e) => {
              e.preventDefault();
              void scan();
            }}
          >
            <Search size={19} strokeWidth={1.7} aria-hidden="true" />
            <input
              aria-label="搜索主题、关键词或商品品类"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={160}
              disabled={busy || identifying}
              placeholder={
                workflow === "product"
                  ? "输入主题、商品品类或使用场景，也可以上传图片…"
                  : workflow === "resonance"
                    ? "输入主题，寻找跨平台共同出现的信号…"
                    : "搜索主题、关键词、内容方向… 留空发现全网热点"
              }
            />
            {query && !busy && (
              <button
                type="button"
                className="rd-icon-button"
                onClick={() => setQuery("")}
                aria-label="清空搜索"
              >
                <X size={14} />
              </button>
            )}
            {workflow === "product" && (
              <button
                type="button"
                className="rd-upload-image"
                disabled={busy || identifying}
                onClick={() => imageRef.current?.click()}
                aria-label="上传图片识别线索"
              >
                {identifying ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <ImagePlus size={18} />
                )}
              </button>
            )}
            <button
              type="submit"
              className="rd-search-submit"
              disabled={busy || identifying || !platforms.length}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ScanSearch size={16} />
              )}
              <span>{busy ? "正在研究" : "开始研究"}</span>
              {!busy && <ArrowRight size={15} />}
            </button>
          </form>
          {workflow === "product" && imagePreview && (
            <div className="rd-image-result">
              <img src={imagePreview} alt="上传的探索参考图" />
              <div>
                <strong>
                  {identifying
                    ? "正在识别图片中的可见线索…"
                    : imageInfo?.subject ||
                      "参考图片已选择，可手动输入关键词继续"}
                </strong>
                {imageInfo && (
                  <>
                    <p>{imageInfo.observations.join(" · ")}</p>
                    <div className="rd-keyword-buttons">
                      {imageInfo.keywords.map((word) => (
                        <button
                          type="button"
                          key={word}
                          onClick={() => setQuery(word)}
                        >
                          {word}
                        </button>
                      ))}
                    </div>
                    <small>{imageInfo.uncertainty}</small>
                  </>
                )}
              </div>
              <button
                type="button"
                className="rd-icon-button"
                onClick={() => {
                  setImagePreview("");
                  setImageInfo(null);
                }}
                aria-label="移除参考图片"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="rd-search-options">
            <div className="rd-source-chips">
              {RADAR_PLATFORMS.map((platform) => (
                <button
                  type="button"
                  key={platform}
                  disabled={busy}
                  className={platforms.includes(platform) ? "active" : ""}
                  aria-pressed={platforms.includes(platform)}
                  onClick={() =>
                    setPlatforms((current) =>
                      current.includes(platform)
                        ? current.filter((p) => p !== platform)
                        : [...current, platform],
                    )
                  }
                >
                  <Platform name={platform} short />
                </button>
              ))}
            </div>
            <div className="rd-market-options">
              <label>
                <span className="sr-only">市场</span>
                <select
                  value={region}
                  disabled={busy}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  {Object.entries(regions).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">时间范围</span>
                <select
                  value={days}
                  disabled={busy}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <option value={1}>近 24 小时</option>
                  <option value={7}>近 7 天</option>
                  <option value={30}>近 30 天</option>
                </select>
              </label>
            </div>
          </div>
          <div className="rd-pipeline" aria-label="研究步骤">
            {currentWorkflow.steps.map((step, index) => (
              <div
                key={step}
                className={
                  run && !inputChanged
                    ? run.steps[index]?.status
                    : busy && index === 0
                      ? "running"
                      : ""
                }
              >
                <span>
                  {busy && index === 0 ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : run &&
                    !inputChanged &&
                    run.steps[index]?.status === "completed" ? (
                    <Check size={11} />
                  ) : (
                    <i />
                  )}
                </span>
                {step}
                {index < 3 && (
                  <ChevronRight size={12} className="rd-step-arrow" />
                )}
              </div>
            ))}
            <span className="rd-pipeline-note">
              {busy
                ? "采集来源并保存证据，通常需要 5–15 秒"
                : run && !inputChanged
                  ? "已保存研究记录"
                  : "每一步都有可追溯的证据"}
            </span>
          </div>
        </div>
      </section>
      {error && (
        <div className="rd-message error" role="alert">
          <CircleHelp size={16} />
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="关闭错误提示"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div className="rd-message" role="status">
          <CircleHelp size={16} />
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="关闭提示"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {workflow === "calendar" && (
        <section className="rd-calendar" aria-label="未来内容节点">
          <div className="rd-section-title">
            <h2>提前准备，内容才有窗口</h2>
            <span>
              未来 120 天 · {regions[region as keyof typeof regions]} ·
              节日与营销节点
            </span>
          </div>
          <div className="rd-calendar-track">
            {calendar.length ? (
              calendar.map((event) => (
                <article key={event.id}>
                  <div className="rd-event-time">
                    <time dateTime={event.date}>
                      {new Date(`${event.date}T12:00:00Z`).toLocaleDateString(
                        "zh-CN",
                        { month: "short", day: "numeric", timeZone: "UTC" },
                      )}
                    </time>
                    <span>
                      {event.daysUntil === 0
                        ? "今天"
                        : `${event.daysUntil} 天后`}
                    </span>
                  </div>
                  <h3>{event.name}</h3>
                  <p>{event.angle}</p>
                  <div>
                    {event.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setQuery(event.name);
                      void scan(false, { query: event.name });
                    }}
                  >
                    探索相关选题
                    <ArrowUpRight size={13} />
                  </button>
                  <a
                    href={event.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`核验${event.name}日期`}
                  >
                    日期来源
                    <ExternalLink size={10} />
                  </a>
                </article>
              ))
            ) : (
              <div className="rd-compact-empty">
                暂未取得节点日期。可输入节日或事件名称继续研究。
              </div>
            )}
          </div>
        </section>
      )}
      <div className="rd-research-grid">
        <section
          className="rd-results"
          aria-label={reportOpen ? "研究报告" : "热点线索"}
        >
          <div className="rd-result-tabs">
            <div role="group" aria-label="结果视图">
              <button
                type="button"
                className={!reportOpen ? "active" : ""}
                onClick={() => setReportOpen(false)}
              >
                发现线索<span>{visible.length}</span>
              </button>
              <button
                type="button"
                className={reportOpen ? "active" : ""}
                onClick={() => setReportOpen(true)}
              >
                <FileText size={14} />
                研究报告
              </button>
            </div>
            <span className={`rd-data-label ${isDemo ? "demo" : ""}`}>
              <i />
              {savedOnly
                ? "收藏证据库"
                : isDemo
                  ? "演示快照"
                  : `研究于 ${dateLabel(run.finishedAt)}`}
            </span>
          </div>
          {reportOpen ? (
            <div className="rd-report">
              <div className="rd-report-toolbar">
                <span>
                  <FlaskConical size={14} />
                  事实、假设与验证分开陈述
                </span>
                <div>
                  <button
                    type="button"
                    className="rd-button"
                    disabled={!run || interpreting || busy || !run.items.length}
                    onClick={() => void interpret()}
                  >
                    {interpreting ? (
                      <LoaderCircle size={13} className="spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {interpreting ? "正在深入解读…" : "AI 深入解读"}
                  </button>
                  <button
                    type="button"
                    className="rd-button"
                    onClick={() =>
                      downloadBlob(
                        new Blob([run?.report || sampleReport], {
                          type: "text/markdown;charset=utf-8",
                        }),
                        `热点研究-${run?.id.slice(0, 8) || "示例"}.md`,
                      )
                    }
                  >
                    <ArrowDownToLine size={13} />
                    导出报告
                  </button>
                </div>
              </div>
              <div className="rd-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ children, href }) => (
                      <a href={href} target="_blank" rel="noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {run?.report || sampleReport}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <>
              <div className="rd-categories" role="group" aria-label="内容领域">
                {RADAR_CATEGORIES.map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    className={category === cat ? "active" : ""}
                    aria-pressed={category === cat}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="rd-list-toolbar">
                <label>
                  <span className="sr-only">内容形式</span>
                  <select
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as keyof typeof RADAR_KINDS)
                    }
                  >
                    {Object.entries(RADAR_KINDS).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">排序依据</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="heat">同组热度排序</option>
                    <option value="potential">潜力指数排序</option>
                    <option value="recent">发布时间排序</option>
                  </select>
                </label>
                <span className="rd-toolbar-spacer" />
                <button
                  type="button"
                  className={`rd-icon-button ${savedOnly ? "active" : ""}`}
                  onClick={() => setSavedOnly(!savedOnly)}
                  aria-label={savedOnly ? "显示全部线索" : "只显示收藏"}
                  aria-pressed={savedOnly}
                >
                  <Bookmark
                    size={15}
                    fill={savedOnly ? "currentColor" : "none"}
                  />
                </button>
                <span className="rd-view-toggle">
                  <button
                    type="button"
                    className={layout === "list" ? "active" : ""}
                    onClick={() => setLayout("list")}
                    aria-label="列表视图"
                    aria-pressed={layout === "list"}
                  >
                    <LayoutList size={15} />
                  </button>
                  <button
                    type="button"
                    className={layout === "grid" ? "active" : ""}
                    onClick={() => setLayout("grid")}
                    aria-label="卡片视图"
                    aria-pressed={layout === "grid"}
                  >
                    <Grid2X2 size={14} />
                  </button>
                </span>
              </div>
              {isDemo && !savedOnly && (
                <div className="rd-demo-note">
                  <FlaskConical size={13} />
                  <span>以下为演示数据。开始研究后显示真实采集结果。</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void scan()}
                  >
                    采集真实热点
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              )}
              {inputChanged && (
                <div className="rd-stale-note">
                  筛选条件已更改。当前展示已保存的研究结果，重新运行可获取新证据。
                </div>
              )}
              {layout === "list" && visible.length > 0 && (
                <div className="rd-table-head">
                  <span>#</span>
                  <span>内容与来源</span>
                  <span>播放 / 搜索</span>
                  <span>
                    热度
                    <CircleHelp
                      size={11}
                      aria-label="同平台同类型同领域中的百分位"
                    />
                  </span>
                  <span>潜力指数</span>
                  <span />
                </div>
              )}
              {visible.length ? (
                <div
                  className={
                    layout === "grid" ? "rd-card-grid" : "rd-item-list"
                  }
                >
                  {visible.map((item, index) => (
                    <article
                      key={item.id}
                      className={`${layout === "grid" ? "rd-card" : "rd-row"} ${selected?.id === item.id ? "selected" : ""}`}
                    >
                      <span className="rd-rank">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        className="rd-row-main"
                        onClick={() => setSelectedId(item.id)}
                        aria-label={`查看线索：${item.title}`}
                        aria-pressed={selected?.id === item.id}
                      >
                        <Thumbnail item={item} />
                        <div className="rd-item-copy">
                          <strong>{item.title}</strong>
                          <div>
                            <Platform name={item.platform} short />
                            <span className="rd-kind-text">
                              {kindLabels[item.kind]}
                            </span>
                            <span>{item.category}</span>
                          </div>
                          <p>
                            {item.tags
                              .slice(0, 2)
                              .map((tag) => `#${tag}`)
                              .join("  ")}
                          </p>
                        </div>
                      </button>
                      <div className="rd-row-volume">
                        <strong>
                          {formatRadarCount(
                            item.metrics.views ?? item.metrics.searchVolume,
                          )}
                        </strong>
                        <small>
                          {item.signal.growth == null ? (
                            item.metrics.rank ? (
                              `来源榜单 #${item.metrics.rank}`
                            ) : (
                              "暂无增速快照"
                            )
                          ) : (
                            <span>
                              +{item.signal.growth.toFixed(0)}%{" "}
                              <span className="rd-window">观测窗口</span>
                            </span>
                          )}
                        </small>
                      </div>
                      <div className="rd-row-heat">
                        <SignalNumber value={item.signal.heat} neutral />
                      </div>
                      <div className="rd-row-potential">
                        <SignalNumber value={item.signal.potential} />
                      </div>
                      <button
                        type="button"
                        className={`rd-icon-button rd-bookmark ${bookmarks.includes(item.id) ? "active" : ""}`}
                        disabled={item.provenance === "demo" || !!bookmarkBusy}
                        onClick={() => void toggleBookmark(item)}
                        title={
                          item.provenance === "demo"
                            ? "演示数据不进入证据收藏"
                            : bookmarks.includes(item.id)
                              ? "取消收藏"
                              : "收藏线索"
                        }
                        aria-label={
                          bookmarks.includes(item.id)
                            ? `取消收藏：${item.title}`
                            : `收藏：${item.title}`
                        }
                      >
                        {bookmarkBusy === item.id ? (
                          <LoaderCircle size={14} className="spin" />
                        ) : (
                          <Bookmark
                            size={14}
                            fill={
                              bookmarks.includes(item.id)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        )}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rd-empty">
                  <Radar size={40} strokeWidth={1.1} />
                  <h3>
                    {savedOnly
                      ? "收藏值得继续研究的线索"
                      : workflow === "breakout"
                        ? "等待足够的增长证据"
                        : "还没有匹配的热点线索"}
                  </h3>
                  <p>
                    {savedOnly
                      ? "真实采集结果旁的书签可以把线索保存到证据库。"
                      : "尝试放宽领域或内容筛选，或导入带时间戳和互动指标的真实记录。"}
                  </p>
                  <button
                    type="button"
                    className="rd-button"
                    onClick={() => {
                      setCategory("全部领域");
                      setKind("all");
                      setPlatforms([...RADAR_PLATFORMS]);
                      setSavedOnly(false);
                    }}
                  >
                    重置筛选
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}
              <div className="rd-results-foot">
                <span>
                  {isDemo && !savedOnly
                    ? "示例数据 · 非当前平台排名"
                    : `${visible.length} 条匹配线索 · ${new Set(visible.map((item) => item.platform)).size} 个平台`}
                </span>
                <span>
                  <CircleHelp size={11} />
                  不同平台的原始流量不直接相加
                </span>
              </div>
            </>
          )}
        </section>
        <aside className="rd-evidence" aria-label="线索证据详情">
          <div className="rd-evidence-heading">
            <h2>
              <FlaskConical size={16} />
              信号解读
            </h2>
            <span>证据优先</span>
          </div>
          {selected ? (
            <>
              <Thumbnail item={selected} large />
              <div className="rd-evidence-copy">
                <div className="rd-evidence-meta">
                  <Platform name={selected.platform} />
                  <span>
                    {selected.provenance === "demo"
                      ? "演示线索"
                      : selected.provenance === "import"
                        ? "导入证据"
                        : "已采集"}
                  </span>
                </div>
                <h3>{selected.title}</h3>
                <p>
                  {selected.provenance === "demo"
                    ? "以下指标仅用于说明分析方法，不代表真实内容。"
                    : selected.excerpt?.slice(0, 180) || selected.sourceLabel}
                </p>
                <div className="rd-evidence-metrics">
                  {(
                    [
                      ["播放", selected.metrics.views],
                      ["点赞", selected.metrics.likes],
                      ["评论", selected.metrics.comments],
                      ["分享", selected.metrics.shares],
                      ["收藏", selected.metrics.saves],
                      ["搜索量下界", selected.metrics.searchVolume],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{formatRadarCount(value)}</strong>
                    </div>
                  ))}
                </div>
                <div className="rd-signal-heading">
                  <strong>潜力构成</strong>
                  <span>证据覆盖 {selected.signal.completeness}%</span>
                </div>
                <div className="rd-dimensions">
                  {selected.signal.dimensions.map((d) => (
                    <div key={d.key} title={d.evidence}>
                      <div>
                        <span>
                          {d.label}
                          <small>{d.weight}%</small>
                        </span>
                        <strong>{d.score == null ? "待补充" : d.score}</strong>
                      </div>
                      <div className="rd-dimension-track">
                        <span
                          style={{
                            transform: `scaleX(${(d.score ?? 0) / 100})`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rd-evidence-conclusion">
                  <strong>
                    <Activity size={13} />
                    {selected.signal.potential == null
                      ? "先补全证据，再判断潜力"
                      : selected.signal.potential >= 70
                        ? "值得跟踪的增长信号"
                        : "持续观察增长质量"}
                  </strong>
                  <p>
                    {selected.signal.potential == null
                      ? selected.signal.gaps.slice(0, 2).join("；")
                      : `同名主题出现于 ${selected.signal.crossPlatforms} 个平台。继续采集快照，验证增长能否持续。`}
                  </p>
                </div>
                <details className="rd-gaps">
                  <summary>
                    查看指标缺口与观测时间
                    <ChevronDown size={12} />
                  </summary>
                  <p>
                    采集 {dateLabel(selected.capturedAt)}
                    {selected.publishedAt
                      ? ` · 发布 ${dateLabel(selected.publishedAt)}`
                      : " · 发布时间未知"}
                  </p>
                  <ul>
                    {selected.signal.gaps.map((gap) => (
                      <li key={gap}>{gap}</li>
                    ))}
                  </ul>
                  <p>{selected.sourceLabel}</p>
                </details>
                <div className="rd-evidence-actions">
                  <a
                    className="rd-button"
                    href={selected.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selected.provenance === "demo"
                      ? "打开平台检索"
                      : "查看原始来源"}
                    <ArrowUpRight size={13} />
                  </a>
                  <button
                    type="button"
                    className="rd-button accent"
                    onClick={() => {
                      setWorkflow("resonance");
                      setQuery(selected.topic || selected.title.slice(0, 100));
                      setReportOpen(false);
                    }}
                  >
                    深入研究
                    <ArrowRight size={13} />
                  </button>
                </div>
                {selected.kind === "video" &&
                  selected.provenance !== "demo" && (
                    <button
                      type="button"
                      className="rd-remake"
                      onClick={() =>
                        onRemake({
                          ...selected,
                          author: selected.author || "",
                          thumbnail: selected.thumbnail || "",
                          analysis: { summary: selected.excerpt },
                        })
                      }
                    >
                      带入创作工作流
                      <ArrowUpRight size={13} />
                    </button>
                  )}
              </div>
            </>
          ) : (
            <div className="rd-evidence-empty">
              <ScanSearch size={30} strokeWidth={1.2} />
              <p>选择一条线索，查看它的原始指标、增长证据与研究缺口。</p>
            </div>
          )}
          <div className="rd-research-principle">
            <CircleHelp size={14} />
            <p>
              潜力指数是研究线索，不是爆款概率。相关信号还需要内容与时间验证。
            </p>
          </div>
        </aside>
      </div>
      <footer className="rd-statusbar">
        <span>
          <i />
          {isDemo
            ? "研究台就绪"
            : `本次${run.status === "completed" ? "采集完成" : "部分来源未取得数据"}`}
        </span>
        <div>
          {activeSources.slice(0, 6).map((source) => (
            <button
              type="button"
              key={source.platform}
              title={source.detail}
              onClick={() => setPanel("sources")}
            >
              <i
                className={
                  source.state === "success" || source.state === "ready"
                    ? "ready"
                    : source.state === "error"
                      ? "error"
                      : ""
                }
              />
              {source.platform.replace("Google ", "")}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setPanel("sources")}>
          数据与方法
          <ExternalLink size={11} />
        </button>
      </footer>
      <input
        type="file"
        ref={importRef}
        className="sr-only"
        accept="application/json,.json"
        aria-label="导入热点 JSON"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <input
        type="file"
        ref={imageRef}
        className="sr-only"
        accept="image/jpeg,image/png,image/webp"
        aria-label="上传探索参考图片"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void uploadImage(file);
        }}
      />
    </div>
  );
}
