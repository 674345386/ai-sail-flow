import { z } from 'zod';

const reference = z.string().regex(/^[\w-]{1,100}$/);
/** A curated reading order over real execution evidence, independent of canvas positions. */
export const experimentReviewInput = z.object({
  title: z.string().trim().min(1).max(160),
  goal: z.string().trim().min(1).max(1000),
  dateLabel: z.string().max(100),
  finalArtifactId: reference,
  stages: z.array(z.object({
    planId: reference,
    title: z.string().trim().min(1).max(160),
    shortTitle: z.string().trim().min(1).max(40),
    time: z.string().max(100),
    approach: z.string().trim().min(1).max(1000),
    actions: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
    result: z.string().trim().min(1).max(1000),
    finding: z.string().max(1000).optional(),
    quote: z.string().max(1000).optional(),
    decision: z.string().max(1000).optional(),
    outcome: z.enum(['prepared', 'iterate', 'rejected', 'final']),
    stepIds: z.array(reference).min(1).max(12),
    previewNodeIds: z.array(reference).max(3),
  })).min(1).max(20),
});
export type ExperimentReview = z.infer<typeof experimentReviewInput>;
