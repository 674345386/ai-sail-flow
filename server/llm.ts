import { z } from 'zod';
import { generateGpt, gptRequestSchema, gptStatus, type GptResponse, type LlmOptions } from './gpt';

export const llmRequestSchema = gptRequestSchema.extend({ provider: z.literal('gpt').default('gpt') });
export type LlmRequest = z.input<typeof llmRequestSchema>;
export type LlmResponse = GptResponse;
export type { LlmOptions } from './gpt';

export function llmStatus() { return { defaultProvider: 'gpt' as const, providers: { gpt: gptStatus() } }; }

/** Shared server-side entry point for ordinary LLM requests. */
export async function generateLlm(input: LlmRequest, options?: LlmOptions): Promise<LlmResponse> {
  const { provider, ...request } = llmRequestSchema.parse(input);
  return generateGpt(request, options);
}
