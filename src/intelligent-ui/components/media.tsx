"use client";

import { defineComponent } from "@openuidev/react-lang";
import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod/v4";
import { withBase } from "../base-path";
import { Glyph } from "./glyph";
import { color, cx, fg, mediaUrl, radius, radiusSchema, webUrl } from "./style";

const ICON_SIZE = { sm: 14, md: 18, lg: 24, xl: 32 } as const;

export const Icon = defineComponent({
  name: "Icon",
  props: z.object({
    name: z.string(),
    size: z.enum(["sm", "md", "lg", "xl"]).optional(),
    color: color.optional(),
  }),
  description: 'Lucide icon by name, e.g. "map-pin".',
  component: ({ props }) => (
    <span className="iui-icon" style={{ color: fg(props.color) }}>
      <Glyph name={props.name} size={ICON_SIZE[props.size ?? "md"] ?? 18} />
    </span>
  ),
});

// Image search
const searches = new Map<string, Promise<string[]>>();

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  return response.ok ? ((await response.json()) as Record<string, unknown>) : {};
}

const urls = (value: unknown) => (Array.isArray(value) ? value.flatMap((u) => (webUrl(u) ? [u as string] : [])) : []);

/**
 * Photo URLs for a query: the Wikipedia article with that exact title first
 * (/api/wiki: right for a named place, dish or product), then a Wikipedia and
 * Commons search (/api/image-search). Failures are retried next time.
 */
function searchImages(query: string): Promise<string[]> {
  let request = searches.get(query);
  if (!request) {
    request = Promise.all([
      getJson(withBase(`/api/wiki?title=${encodeURIComponent(query)}`)).catch((): Record<string, unknown> => ({})),
      getJson(withBase(`/api/image-search?q=${encodeURIComponent(query)}`)).catch((): Record<string, unknown> => ({})),
    ]).then(([wiki, found]) => {
      const all = [...urls(wiki.photos), ...urls(found.images)];
      if (!all.length) searches.delete(query);
      return [...new Set(all)];
    });
    if (searches.size > 200) searches.delete(searches.keys().next().value!);
    searches.set(query, request);
  }
  return request;
}

/** Search results for `query`, or undefined while waiting. The query settles first: it may still be streaming. */
function useImageSearch(query: string | null): string[] | undefined {
  const [result, setResult] = useState<{ query: string; images: string[] } | null>(null);
  useEffect(() => {
    if (!query) return;
    let active = true;
    const timer = setTimeout(() => {
      searchImages(query).then((images) => {
        if (active) setResult({ query, images });
      });
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return query && result?.query === query ? result.images : undefined;
}

type PhotoProps = { query: string; src?: string | null; aspectRatio?: number | null; radius?: unknown; fit?: string | null; search?: boolean };

/** Exact supplied media, or an explicit SearchImage lookup. Never substitute a reference image. */
function Photo(props: PhotoProps) {
  const alt = typeof props.query === "string" ? props.query.trim() : "";
  const src = mediaUrl(props.src);
  const [failed, setFailed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const needSearch = props.search === true && (!src || failed.includes(src)) && alt.length > 2;
  const found = useImageSearch(needSearch ? alt : null);
  const current = [src, ...(found ?? [])].find((url): url is string => !!url && !failed.includes(url));
  const settled = !current && (!needSearch || found !== undefined);
  const ratio = typeof props.aspectRatio === "number" && props.aspectRatio > 0.2 && props.aspectRatio < 5 ? props.aspectRatio : 1.5;
  return (
    <div
      className={cx("iui-image", props.fit === "contain" && "is-contain", loaded === current && "is-loaded")}
      style={{ aspectRatio: ratio, borderRadius: radius(props.radius ?? "lg") }}
      role={current ? undefined : "img"}
      aria-label={current ? undefined : alt}
    >
      {current ? (
        <a className="iui-image-link" data-iui-media href={current} target="_blank" rel="noreferrer" aria-label={`查看大图：${alt}`}>
        <img
          key={current}
          src={current}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(current)}
          onError={() => setFailed((list) => [...list, current])}
        />
        </a>
      ) : settled ? (
        <div className="iui-image-error"><ImageIcon aria-hidden className="iui-image-empty" strokeWidth={1.5} /><span>图片暂时无法显示</span>{src && <button type="button" onClick={() => setFailed(list => list.filter(url => url !== src))}>重试</button>}</div>
      ) : null}
    </div>
  );
}

const fit = z.enum(["cover", "contain"]).optional();

export const SearchImage = defineComponent({
  name: "SearchImage",
  props: z.object({ query: z.string(), aspectRatio: z.number().optional(), radius: radiusSchema.optional(), fit }),
  description:
    'A real photo the app finds for query; it needs no URL and no tool. Name the exact thing in 2 to 4 words: "Belém Tower Lisbon", "iPhone 17", "pastel de nata". Use one for every place, dish, product or thing with a look.',
  component: ({ props }) => <Photo {...props} search />,
});

export const Image = defineComponent({
  name: "Image",
  props: z.object({ src: z.string(), alt: z.string(), aspectRatio: z.number().optional(), radius: radiusSchema.optional(), fit }),
  description: "Display the exact image URL supplied by a user or tool, including local /media/ URLs. Failed images show a retry control; they are never replaced by search results.",
  component: ({ props }) => <Photo query={props.alt} src={props.src} aspectRatio={props.aspectRatio} radius={props.radius} fit={props.fit} />,
});

// Sail creation results use real media URLs, alongside the upstream photos.
export const Video = defineComponent({
  name: 'Video',
  props: z.object({ src: z.string(), title: z.string().optional(), poster: z.string().optional() }),
  description: 'Play a real video URL returned by a creative tool; never invent a URL.',
  component: ({ props }) => <figure className="iui-video"><video src={mediaUrl(props.src) || undefined} poster={mediaUrl(props.poster) || undefined} aria-label={props.title || '视频'} controls playsInline preload="metadata" />{props.title && <figcaption className="iui-caption">{props.title}</figcaption>}</figure>,
});
