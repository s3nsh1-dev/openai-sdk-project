import { expect, it } from 'vitest';
import request from 'supertest';
import { contextMessages, newAttempt } from '../src/client/state';
import { createApp } from '../src/server/app';
import { loadConfig } from '../src/server/config';
import { createProviders } from '../src/server/provider';
import { chunk, fakeProvider } from './helpers/provider';
import { close } from './helpers/servers';
it('sends only complete exchanges and excludes reasoning and failed attempts', () => {
  const complete = {
    ...newAttempt('one', 'First', 'local', 'qwen3.5:4b'),
    answer: 'Reply',
    reasoning: 'private display',
    status: 'completed' as const,
  };
  const failed = {
    ...newAttempt('two', 'Second', 'gemini', 'gemini-3.8-flash'),
    answer: 'Partial',
    status: 'failed' as const,
  };
  expect(contextMessages([complete, failed], 'Third')).toEqual([
    { role: 'user', content: 'First' },
    { role: 'assistant', content: 'Reply' },
    { role: 'user', content: 'Third' },
  ]);
});
it('rejects oversized local context with an actionable message before generation', async () => {
  const result = await request(createApp(loadConfig({})))
    .post('/api/chat')
    .send({
      requestId: 'budget',
      provider: 'local',
      thinking: false,
      messages: [{ role: 'user', content: 'a'.repeat(3000) }],
    });
  expect(result.status).toBe(413);
  expect(result.body.error).toMatch(/shorten|new chat/i);
});

it('rejects completed Gemini history exceeding Local capacity before generation and accepts explicit Gemini retry', async () => {
  const answer = 'x'.repeat(3000);
  const upstream: Record<string, unknown>[] = [];
  const fake = await fakeProvider(
    [chunk({ content: answer }), chunk({}, 'stop')],
    {
      onRequest: (body) => upstream.push(body),
    },
  );
  try {
    const config = loadConfig({
      GEMINI_API_KEY: 'fixture-key',
      OLLAMA_BASE_URL: `${fake.url}/v1`,
    });
    const providers = createProviders(config, async (_url, init) =>
      fetch(`${fake.url}/v1/chat/completions`, init),
    );
    const app = createApp(config, { providers });
    const first = await request(app)
      .post('/api/chat')
      .send({
        requestId: 'cloud-first',
        provider: 'gemini',
        thinking: false,
        messages: [{ role: 'user', content: 'Keep this reference' }],
      });
    expect(first.status).toBe(200);
    expect(first.text).toContain(answer);
    const completed = {
      ...newAttempt(
        'cloud-first',
        'Keep this reference',
        'gemini',
        'gemini-3.8-flash',
      ),
      answer,
      status: 'completed' as const,
    };
    const messages = contextMessages([completed], 'Use the reference');
    const local = await request(app).post('/api/chat').send({
      requestId: 'local-next',
      provider: 'local',
      thinking: false,
      messages,
    });
    expect(local.status).toBe(413);
    expect(local.body.error).toMatch(/never silently trimmed/);
    expect(upstream).toHaveLength(1);
    const retry = await request(app).post('/api/chat').send({
      requestId: 'cloud-retry',
      provider: 'gemini',
      thinking: false,
      messages,
    });
    expect(retry.status).toBe(200);
    expect(upstream).toHaveLength(2);
    expect(upstream[1]).toMatchObject({
      model: 'gemini-3.8-flash',
      messages: [
        { role: 'system', content: expect.any(String) },
        { role: 'user', content: 'Keep this reference' },
        { role: 'assistant', content: answer },
        { role: 'user', content: 'Use the reference' },
      ],
    });
  } finally {
    await close(fake.server);
  }
});
