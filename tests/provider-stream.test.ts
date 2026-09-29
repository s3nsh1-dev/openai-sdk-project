import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { loadConfig } from './helpers/config';
import { fakeProvider, chunk } from './helpers/provider';
import { close } from './helpers/servers';
import type { StreamEvent } from '../src/shared/protocol';
export const input = {
  requestId: 'r',
  provider: 'local',
  thinking: true,
  messages: [{ role: 'user', content: 'Explain const' }],
};
export async function runChunks(chunks: unknown[]) {
  const fake = await fakeProvider(chunks);
  try {
    const response = await request(
      createApp(loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1` })),
    )
      .post('/api/chat')
      .send(input);
    return response.text
      .split('\n\n')
      .filter((frame) => frame.startsWith('data: '))
      .map((frame) => JSON.parse(frame.slice(6)) as StreamEvent);
  } finally {
    await close(fake.server);
  }
}
it('handles combined reasoning and answer fields independently, including trailing usage', async () => {
  const events = await runChunks([
    chunk(),
    chunk({ reasoning: 'Think', content: 'Answer' }),
    chunk({}, 'stop'),
    {
      choices: [],
      usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
    },
  ]);
  expect(events.map((event) => event.type)).toEqual([
    'start',
    'reasoning_delta',
    'answer_delta',
    'finish',
  ]);
  expect(events.at(-1)).toMatchObject({
    outcome: 'completed',
    usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
  });
});
it.each([
  {
    chunks: [chunk({ reasoning_content: 'Thinking' }), chunk({}, 'length')],
    type: 'finish',
    outcome: 'incomplete',
  },
  { chunks: [chunk({}, 'stop')], type: 'error', code: 'empty_answer' },
  {
    chunks: [chunk({ content: 'partial' })],
    type: 'error',
    code: 'unexpected_end',
  },
  { chunks: [chunk({}, 'content_filter')], type: 'finish', outcome: 'blocked' },
  {
    chunks: [{ choices: [{ delta: { content: 8 } }] }],
    type: 'error',
    code: 'malformed_stream',
  },
])('classifies $code $outcome', async ({ chunks, type, outcome, code }) => {
  const events = await runChunks(chunks);
  expect(events.at(-1)).toMatchObject({
    type,
    ...(outcome ? { outcome } : { code }),
  });
  expect(
    events.filter((event) => event.type === 'finish' || event.type === 'error'),
  ).toHaveLength(1);
});
