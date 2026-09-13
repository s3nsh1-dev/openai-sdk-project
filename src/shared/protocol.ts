import { z } from 'zod';
export const messageSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(24000) }).strict();
export const chatRequestSchema = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
  provider: z.enum(['local', 'gemini']), thinking: z.boolean().default(false),
  messages: z.array(messageSchema).min(1).max(101),
}).strict().refine(request => request.messages.length % 2 === 1 && request.messages.every((message, index) => message.role === (index % 2 ? 'assistant' : 'user')), 'Messages must alternate user and assistant, ending with user.');
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type Message = z.infer<typeof messageSchema>;
