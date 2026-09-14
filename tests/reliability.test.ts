import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { loadConfig } from '../src/server/config';
import { fakeProvider, chunk } from './helpers/provider';
import { close, listen } from './helpers/servers';
const input = {
  requestId: 'reliability',
  provider: 'local',
  thinking: false,
  messages: [{ role: 'user', content: 'Hi' }],
};
it('times out before first activity and aborts upstream', async () => {
  let closed = false;
  const fake = await fakeProvider([chunk({ content: 'late' })], {
    delay: 250,
    onClose: () => {
      closed = true;
    },
  });
  try {
    const app = createApp(
      loadConfig({
        OLLAMA_BASE_URL: `${fake.url}/v1`,
        FIRST_ACTIVITY_MS: '70',
      }),
    );
    const result = await request(app).post('/api/chat').send(input);
    expect(result.text).toContain('"code":"first_activity_timeout"');
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(closed).toBe(true);
  } finally {
    await close(fake.server);
  }
});
it('rejects concurrent local requests, then frees the slot after disconnect', async () => {
  let calls = 0;
  let closed = false;
  const fake = await fakeProvider(
    [chunk({ content: 'later' }), chunk({}, 'stop')],
    {
      delay: 150,
      onRequest: () => {
        calls++;
      },
      onClose: () => {
        closed = true;
      },
    },
  );
  const app = createApp(loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1` }));
  const server = await listen(app);
  try {
    const abort = new AbortController();
    const first = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: abort.signal,
    });
    const reader = first.body!.getReader();
    await reader.read();
    const second = await request(app)
      .post('/api/chat')
      .send({ ...input, requestId: 'second' });
    expect(second.status).toBe(409);
    abort.abort();
    await reader.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(closed).toBe(true);
    const third = await request(app)
      .post('/api/chat')
      .send({ ...input, requestId: 'third' });
    expect(third.text).toContain('"outcome":"completed"');
    expect(calls).toBe(2);
  } finally {
    await close(server.server);
    await close(fake.server);
  }
});
it('enforces the application rate guard without SDK retries', async () => {
  let calls = 0;
  const fake = await fakeProvider([], {
    status: 429,
    onRequest: () => {
      calls++;
    },
  });
  try {
    const app = createApp(
      loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1`, RATE_LIMIT: '1' }),
    );
    const first = await request(app).post('/api/chat').send(input);
    expect(first.text).toContain('"code":"quota"');
    expect(first.text).not.toContain('sensitive');
    const second = await request(app).post('/api/chat').send(input);
    expect(second.status).toBe(429);
    expect(calls).toBe(1);
  } finally {
    await close(fake.server);
  }
});
it.each([
  ['IDLE_MS', 'idle_timeout'],
  ['OVERALL_MS', 'overall_timeout'],
])('applies %s after partial output', async (setting, code) => {
  const fake = await fakeProvider(
    [
      chunk({ content: 'partial' }),
      chunk({ content: 'more' }),
      chunk({}, 'stop'),
    ],
    { delay: 80 },
  );
  try {
    const app = createApp(
      loadConfig({
        OLLAMA_BASE_URL: `${fake.url}/v1`,
        [setting]: setting === 'IDLE_MS' ? '50' : '130',
      }),
    );
    const result = await request(app).post('/api/chat').send(input);
    expect(result.text).toContain('partial');
    expect(result.text).toContain(`"code":"${code}"`);
  } finally {
    await close(fake.server);
  }
});
it.each([
  [401, 'credentials'],
  [403, 'credentials'],
  [404, 'model_unavailable'],
  [503, 'provider_unavailable'],
] as const)('maps HTTP %i to a safe %s error', async (status, code) => {
  const fake = await fakeProvider([], { status });
  try {
    const response = await request(
      createApp(loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1` })),
    )
      .post('/api/chat')
      .send(input);
    expect(response.text).toContain(`"code":"${code}"`);
    expect(response.text).not.toContain('sensitive upstream details');
  } finally {
    await close(fake.server);
  }
});
it('heartbeats do not postpone the first-activity deadline', async () => {
  const fake = await fakeProvider([chunk({ content: 'late' })], {
    delay: 20000,
  });
  try {
    const response = await request(
      createApp(
        loadConfig({
          OLLAMA_BASE_URL: `${fake.url}/v1`,
          FIRST_ACTIVITY_MS: '15500',
        }),
      ),
    )
      .post('/api/chat')
      .send(input);
    expect(response.text).toContain(': heartbeat');
    expect(response.text).toContain('"code":"first_activity_timeout"');
    expect(response.text).not.toContain('answer_delta');
  } finally {
    await close(fake.server);
  }
}, 18000);
