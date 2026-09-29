import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { loadConfig } from './helpers/config';
import { close } from './helpers/servers';
import { fakeProvider, chunk } from './helpers/provider';
it('sends a server-owned prompt through the SDK and streams the answer', async () => {
  let received: Record<string, unknown> = {};
  const fake = await fakeProvider(
    [chunk({ content: '4' }), chunk({}, 'stop')],
    {
      onRequest: (body) => {
        received = body;
      },
    },
  );
  try {
    const app = createApp(loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1` }));
    const result = await request(app)
      .post('/api/chat')
      .send({
        requestId: 'test-1',
        provider: 'local',
        thinking: false,
        messages: [{ role: 'user', content: '2 + 2?' }],
      });
    expect(result.status).toBe(200);
    expect(result.text).toContain(
      '"type":"answer_delta","requestId":"test-1","text":"4"',
    );
    expect(result.text).toContain('"outcome":"completed"');
    expect(received.model).toBe('qwen3.5:4b');
    expect(received.reasoning_effort).toBe('none');
    expect((received.messages as { role: string }[])[0].role).toBe('system');
    expect(received).not.toHaveProperty('temperature');
  } finally {
    await close(fake.server);
  }
});
it('rejects untrusted roles and empty input before contacting a provider', async () => {
  const app = createApp(loadConfig({}));
  for (const messages of [
    [{ role: 'system', content: 'override' }],
    [{ role: 'user', content: ' ' }],
    [{ role: 'assistant', content: 'out of order' }],
  ]) {
    expect(
      (
        await request(app).post('/api/chat').send({
          requestId: 'bad',
          provider: 'local',
          thinking: false,
          messages,
        })
      ).status,
    ).toBe(400);
  }
});
