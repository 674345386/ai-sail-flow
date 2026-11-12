import { z } from 'zod';

const finite = (min: number, max: number) => z.number().finite().min(min).max(max);
const color = z.string().regex(/^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|transparent)$/i);
export const landingStyleSchema = z.object({
  x: finite(-20000, 20000).optional(), y: finite(-20000, 20000).optional(),
  width: finite(1, 10000).optional(), height: finite(1, 20000).optional(),
  fontSize: finite(6, 400).optional(), fontWeight: finite(100, 900).optional(),
  lineHeight: finite(0.5, 5).optional(), letterSpacing: finite(-20, 100).optional(),
  fontFamily: z.enum(['ui', 'serif', 'mono']).optional(),
  color: color.optional(), backgroundColor: color.optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  borderRadius: finite(0, 1000).optional(), opacity: finite(0, 1).optional(),
  rotate: finite(-360, 360).optional(), zIndex: finite(-10, 100).int().optional(),
  paddingTop: finite(0, 2000).optional(), paddingRight: finite(0, 2000).optional(),
  paddingBottom: finite(0, 2000).optional(), paddingLeft: finite(0, 2000).optional(),
  marginTop: finite(-2000, 2000).optional(), marginRight: finite(-2000, 2000).optional(),
  marginBottom: finite(-2000, 2000).optional(), marginLeft: finite(-2000, 2000).optional(),
  gap: finite(0, 1000).optional(), order: finite(-1000, 1000).int().optional(),
  objectFit: z.enum(['cover', 'contain', 'fill', 'none', 'scale-down']).optional(),
  objectPosition: z.enum(['center', 'top', 'bottom', 'left', 'right']).optional(),
}).strict();

export function safeLandingUrl(value: string, link = false) {
  if (/[\u0000-\u001f"'<>\\]/.test(value)) return false;
  if (!value || value.startsWith('/') && !value.startsWith('//') && !/[\s\\\u0000-\u001f]/.test(value)) return true;
  if (link && /^(?:#[\w-]*|mailto:[^\s<>]+|tel:[+\d() -]+)$/.test(value)) return true;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
const assetUrl = z.string().max(2048).refine(value => safeLandingUrl(value), '请使用站内路径或 HTTP/HTTPS 地址。');
const linkUrl = z.string().max(2048).refine(value => safeLandingUrl(value, true), '链接地址无效。');
const languages = z.enum(['en', 'zh-CN']);
export const landingElementSchema = z.object({
  name: z.string().max(120).optional(),
  hidden: z.boolean().optional(),
  desktop: landingStyleSchema.optional(), mobile: landingStyleSchema.optional(),
  text: z.partialRecord(languages, z.array(z.string().max(12000)).max(40)).optional(),
  placeholder: z.partialRecord(languages, z.string().max(3000)).optional(),
  attributes: z.object({ src: assetUrl.optional(), poster: assetUrl.optional(), href: linkUrl.optional(),
    alt: z.string().max(1000).optional(), title: z.string().max(1000).optional(), backgroundImage: assetUrl.optional(),
  }).strict().optional(),
}).strict();
export const landingElementsSchema = z.record(z.string().regex(/^(?:page|lpe-[a-z0-9-]+)$/).max(100), landingElementSchema)
  .refine(elements => Object.keys(elements).length <= 3000, '最多保存 3000 个编辑项。');
export const landingDocumentSchema = z.object({ version: z.literal(1), revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime().nullable(), elements: landingElementsSchema,
}).strict();
export const landingSaveSchema = z.object({ revision: z.number().int().nonnegative(), elements: landingElementsSchema }).strict();
export type LandingDocument = z.infer<typeof landingDocumentSchema>;
export type LandingElementPatch = z.infer<typeof landingElementSchema>;
export type LandingStyle = z.infer<typeof landingStyleSchema>;
export type LandingViewport = 'desktop' | 'mobile';
export type LandingLanguage = 'en' | 'zh-CN';
export const emptyLandingDocument = (): LandingDocument => ({ version: 1, revision: 0, updatedAt: null, elements: {} });

export function landingStyleToCss(style: LandingStyle) {
  const declarations: string[] = [];
  const unitless = new Set(['fontWeight', 'lineHeight', 'opacity', 'zIndex', 'order']);
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || key === 'x' || key === 'y') continue;
    if (key === 'rotate') { declarations.push(`rotate:${value}deg!important`); continue; }
    if (key === 'fontFamily') {
      declarations.push(`font-family:${{ ui: 'var(--sail-font-ui)', serif: 'var(--sail-font-prose)', mono: 'ui-monospace,monospace' }[value as 'ui' | 'serif' | 'mono']}!important`); continue;
    }
    const property = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
    declarations.push(`${property}:${value}${typeof value === 'number' && !unitless.has(key) ? 'px' : ''}!important`);
  }
  if (style.x !== undefined || style.y !== undefined) declarations.push(`translate:${style.x ?? 0}px ${style.y ?? 0}px!important`);
  if (style.width !== undefined) declarations.push('max-width:none!important;min-width:0!important;box-sizing:border-box!important');
  if (style.height !== undefined) declarations.push('max-height:none!important;min-height:0!important;box-sizing:border-box!important');
  return declarations.join(';');
}
