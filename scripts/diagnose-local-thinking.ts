import { createProviders } from '../src/server/provider';
import { loadConfig } from '../src/server/config';
import { normalizeChunk } from '../src/server/normalize';
const providers = createProviders(loadConfig());
const start = Date.now();
let reasoningCharacters = 0;
let answerCharacters = 0;
let finishReason: string | null | undefined;
let usage: unknown;
const stream = await providers.stream(
  {
    requestId: 'thinking-probe',
    provider: 'local',
    thinking: true,
    messages: [{ role: 'user', content: 'teach me about promises' }],
  },
  AbortSignal.timeout(300000),
);
for await (const raw of stream) {
  const chunk = normalizeChunk(raw);
  reasoningCharacters += chunk.reasoning.length;
  answerCharacters += chunk.answer.length;
  if (chunk.reason) finishReason = chunk.reason;
  if (chunk.usage) usage = chunk.usage;
}
console.info(
  JSON.stringify({
    finishReason,
    reasoningCharacters,
    answerCharacters,
    usage,
    durationMs: Date.now() - start,
  }),
);
