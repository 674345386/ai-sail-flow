import { z } from 'zod';

export const canvasComponentInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('camera'), duration: z.number().min(0.1).max(30).default(3), strength: z.number().min(0).max(10).default(6), direction: z.enum(['push', 'pull', 'pan-left', 'pan-right']).default('push'), target: z.string().max(120).default('当前片段') }),
  z.object({ kind: z.literal('color'), temperature: z.number().int().min(2000).max(10000).default(3200), preset: z.enum(['warm', 'natural', 'cool']).default('warm'), intensity: z.number().min(0).max(100).default(60), target: z.string().max(120).default('当前片段') }),
  z.object({ kind: z.literal('storyboard'), selectedGridIds: z.array(z.string().min(1)).max(20).default([]), target: z.string().max(120).default('当前分镜') }),
]);

export type CanvasComponentInput = z.infer<typeof canvasComponentInput>;
export type CanvasComponent = CanvasComponentInput & { id: string; createdAt: string; updatedAt: string };

export const canvasComponentLabels = { camera: '运镜参数控制器', color: '调色预设卡', storyboard: '分镜选择卡' } as const;
