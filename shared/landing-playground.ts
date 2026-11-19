import { z } from 'zod';

const color = z.string().regex(/^#[\da-f]{6}$/i);
const palette = z.array(color).length(8);
const preset = z.string().max(60).nullable();
const copy = z.object({ title: z.string().max(120), message: z.string().max(500), action: z.string().max(60), details: z.string().max(80) });
const bar = z.object({ background: color, height: z.number().int().min(36).max(120), copy: z.object({ en: copy, 'zh-CN': copy }) });

export const playgroundSaveSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['ambient', 'light', 'atmosphere']),
  ambient: z.object({
    preset, base: color, colors: palette, count: z.number().int().min(3).max(8),
    blur: z.number().min(0).max(200), size: z.number().min(15).max(80),
    speed: z.number().min(.1).max(4), amp: z.number().min(0).max(3), breathe: z.number().min(0).max(.6),
    opacity: z.number().min(0).max(1), bright: z.number().min(.3).max(2.5), sat: z.number().min(0).max(2.5),
    blend: z.enum(['normal', 'screen', 'lighten', 'overlay']), vig: z.number().min(0).max(1), grain: z.number().min(0).max(.3), paused: z.boolean(),
  }),
  light: z.object({
    version: z.literal(2), preset, base: color, colors: palette, count: z.number().int().min(0).max(8),
    size: z.number().min(20).max(85), blur: z.number().min(20).max(180), opacity: z.number().min(0).max(1), sat: z.number().min(0).max(2),
    blend: z.enum(['normal', 'multiply']), speed: z.number().min(.1).max(3), drift: z.number().min(0).max(3), breathe: z.number().min(0).max(.4), paused: z.boolean(),
  }),
  atmosphere: z.object({
    version: z.literal(1), preset, composition: z.enum(['halo', 'wash', 'beam']), base: color, primary: color, secondary: color, accent: color,
    focusX: z.number().min(10).max(90), focusY: z.number().min(-20).max(80), spread: z.number().min(.6).max(1.6), angle: z.number().min(-45).max(45),
    softness: z.number().min(0).max(80), intensity: z.number().min(.2).max(1), grain: z.number().min(0).max(.18), dots: z.number().min(0).max(.16),
    speed: z.number().min(.1).max(2), drift: z.number().min(0).max(1.5), paused: z.boolean(), hero: z.enum(['gradient', 'video']),
  }),
  announcements: z.object({ promo: bar, omni: bar }),
});

export type PlaygroundDefaults = z.infer<typeof playgroundSaveSchema>;
