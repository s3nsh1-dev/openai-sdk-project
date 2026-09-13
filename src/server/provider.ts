import OpenAI from 'openai';
import type { Config } from './config';
import type { ChatRequest } from '../shared/protocol';
import { SYSTEM_PROMPT } from './prompt';
export function localClient(config: Config) {
  return new OpenAI({ apiKey: 'ollama', baseURL: config.OLLAMA_BASE_URL, maxRetries: 0 });
}
export async function completeLocal(config: Config, input: ChatRequest) {
  const result = await localClient(config).chat.completions.create({
    model: config.OLLAMA_MODEL, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...input.messages],
    max_tokens: 1024, reasoning_effort: 'none', stream: false,
  });
  return { requestId: input.requestId, answer: result.choices[0]?.message.content ?? '' };
}
