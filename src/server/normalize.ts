import { z } from 'zod';
// The compatible APIs add fields beyond the SDK's static types. Validate at runtime.
const chunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({ content: z.string().nullish(), reasoning: z.string().nullish(), reasoning_content: z.string().nullish() }),
    finish_reason: z.string().nullish(),
  })),
  usage: z.object({prompt_tokens:z.number().nonnegative(),completion_tokens:z.number().nonnegative(),total_tokens:z.number().nonnegative()}).nullish(),
});
export class StreamFailure extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function normalizeChunk(raw: unknown) {
  const parsed = chunkSchema.safeParse(raw);
  if (!parsed.success) throw new StreamFailure('malformed_stream', 'The provider sent an invalid stream. Check provider compatibility.');
  const chunk = parsed.data;
  const choice = chunk.choices[0];
  return {
    answer: choice?.delta.content ?? '',
    reasoning: choice?.delta.reasoning || choice?.delta.reasoning_content || '',
    reason: choice?.finish_reason,
    usage: chunk.usage ? {promptTokens:chunk.usage.prompt_tokens,completionTokens:chunk.usage.completion_tokens,totalTokens:chunk.usage.total_tokens} : undefined,
  };
}
