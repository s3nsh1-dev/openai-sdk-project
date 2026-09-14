import { z } from 'zod';
export const messageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(24000),
  })
  .strict();
export const chatRequestSchema = z
  .object({
    requestId: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
    provider: z.enum(['local', 'gemini']),
    thinking: z.boolean().default(false),
    messages: z.array(messageSchema).min(1).max(101),
  })
  .strict()
  .refine(
    (request) =>
      request.messages.length % 2 === 1 &&
      request.messages.every(
        (message, index) => message.role === (index % 2 ? 'assistant' : 'user'),
      ),
    'Messages must alternate user and assistant, ending with user.',
  );
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type Message = z.infer<typeof messageSchema>;

const correlation = { requestId: z.string().min(1) };
export const usageSchema = z.object({
  promptTokens: z.number().nonnegative(),
  completionTokens: z.number().nonnegative(),
  totalTokens: z.number().nonnegative(),
});
export const streamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    ...correlation,
    provider: z.enum(['local', 'gemini']),
    model: z.string(),
  }),
  z.object({
    type: z.literal('reasoning_delta'),
    ...correlation,
    text: z.string(),
  }),
  z.object({
    type: z.literal('answer_delta'),
    ...correlation,
    text: z.string(),
  }),
  z.object({
    type: z.literal('finish'),
    ...correlation,
    outcome: z.enum(['completed', 'incomplete', 'blocked']),
    reason: z.string(),
    usage: usageSchema.optional(),
  }),
  z.object({
    type: z.literal('error'),
    ...correlation,
    code: z.string(),
    message: z.string(),
  }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type Usage = z.infer<typeof usageSchema>;

const publicProviderSchema = z.object({
  name: z.string(),
  model: z.string(),
  available: z.boolean(),
});
export const publicConfigSchema = z.object({
  providers: z.object({
    local: publicProviderSchema,
    gemini: publicProviderSchema,
  }),
  limits: z.object({
    local: z.object({
      context: z.number(),
      output: z.number(),
      input: z.number(),
    }),
    gemini: z.object({ output: z.number(), input: z.number() }),
  }),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;
