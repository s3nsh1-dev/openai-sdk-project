import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { loadConfig } from '../src/server/config';
import { createProviders } from '../src/server/provider';
import { fakeProvider, chunk } from './helpers/provider';
import { close } from './helpers/servers';
const input = {
  requestId: 'gemini',
  provider: 'gemini',
  thinking: true,
  messages: [{ role: 'user', content: 'Hi' }],
};
it('rejects Gemini with no key without trying Local', async () => {
  const result = await request(createApp(loadConfig({})))
    .post('/api/chat')
    .send(input);
  expect(result.status).toBe(503);
  expect(result.body.error).toMatch(/key|configured/i);
});
it('requests Gemini thought summaries only when explicitly selected', async () => {
  let body: Record<string, unknown> = {};
  const fake = await fakeProvider(
    [
      chunk({
        reasoning_content: 'A supplied summary',
        content: 'Gemini answer',
      }),
      chunk({}, 'stop'),
    ],
    {
      onRequest: (value) => {
        body = value;
      },
    },
  );
  try {
    const config = loadConfig({
      GEMINI_API_KEY: 'fixture-key',
      GEMINI_MODEL: 'gemini-3.8-flash',
    });
    const providers = createProviders(config, async (_url, init) =>
      fetch(`${fake.url}/v1/chat/completions`, init),
    );
    const result = await request(createApp(config, { providers }))
      .post('/api/chat')
      .send(input);
    expect(result.text).toContain('Gemini answer');
    expect(result.text).toContain('A supplied summary');
    expect(result.text).toContain('"model":"gemini-3.8-flash"');
    expect(body.max_tokens).toBe(4096);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body.extra_body).toEqual({
      google: { thinking_config: { include_thoughts: true } },
    });
  } finally {
    await close(fake.server);
  }
});
it('never falls back to local after Gemini quota failure', async () => {
  let localCalls = 0;
  let cloudCalls = 0;
  const fake = await fakeProvider([], {
    status: 429,
    onRequest: () => {
      cloudCalls++;
    },
  });
  try {
    const config = loadConfig({ GEMINI_API_KEY: 'fixture-key' });
    const providers = createProviders(config, async (url, init) => {
      if (String(url).includes('11434')) {
        localCalls++;
        throw new Error('Unexpected fallback');
      }
      return fetch(`${fake.url}/v1/chat/completions`, init);
    });
    const result = await request(createApp(config, { providers }))
      .post('/api/chat')
      .send(input);
    expect(result.text).toContain('"code":"quota"');
    expect(localCalls).toBe(0);
    expect(cloudCalls).toBe(1);
  } finally {
    await close(fake.server);
  }
});
it('allows Local and Gemini to generate concurrently with independent slots', async () => {
  const fake = await fakeProvider(
    [chunk({ content: 'answer' }), chunk({}, 'stop')],
    { delay: 100 },
  );
  try {
    const config = loadConfig({ GEMINI_API_KEY: 'fixture-key' });
    const providers = createProviders(config, async (_url, init) =>
      fetch(`${fake.url}/v1/chat/completions`, init),
    );
    const app = createApp(config, { providers });
    const [local, gemini] = await Promise.all([
      request(app)
        .post('/api/chat')
        .send({ ...input, requestId: 'local-concurrent', provider: 'local' }),
      request(app).post('/api/chat').send(input),
    ]);
    expect(local.text).toContain('"outcome":"completed"');
    expect(gemini.text).toContain('"outcome":"completed"');
  } finally {
    await close(fake.server);
  }
});
