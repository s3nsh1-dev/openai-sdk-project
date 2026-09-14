import OpenAI from 'openai';
import type { Config } from './config';
import type { ChatRequest } from '../shared/protocol';
import { SYSTEM_PROMPT } from './prompt';
const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/';
export function createProviders(config: Config, transport?: typeof fetch) {
  const local = new OpenAI({
    apiKey: 'ollama',
    baseURL: config.OLLAMA_BASE_URL,
    maxRetries: 0,
    timeout: config.OVERALL_MS,
    fetch: transport,
  });
  const gemini = config.GEMINI_API_KEY.trim()
    ? new OpenAI({
        apiKey: config.GEMINI_API_KEY,
        baseURL: GEMINI_BASE_URL,
        maxRetries: 0,
        timeout: config.OVERALL_MS,
        fetch: transport,
      })
    : undefined;
  return {
    model(provider: ChatRequest['provider']) {
      return provider === 'local' ? config.OLLAMA_MODEL : config.GEMINI_MODEL;
    },
    async stream(input: ChatRequest, signal: AbortSignal) {
      const client = input.provider === 'local' ? local : gemini;
      if (!client) throw new Error('Gemini key is not configured.');
      return client.chat.completions.create(
        {
          model:
            input.provider === 'local'
              ? config.OLLAMA_MODEL
              : config.GEMINI_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...input.messages,
          ],
          max_tokens: input.provider === 'local' ? 1024 : 4096,
          // Preserve model tuning. Gemini receives no request for thought summaries.
          ...(input.provider === 'local' && !input.thinking
            ? { reasoning_effort: 'none' as const }
            : {}),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      );
    },
  };
}
export type Providers = ReturnType<typeof createProviders>;
