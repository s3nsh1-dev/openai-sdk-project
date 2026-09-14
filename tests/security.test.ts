import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { loadConfig } from '../src/server/config';
import { fakeProvider, chunk } from './helpers/provider';
import { close, listen } from './helpers/servers';
it('rejects oversized JSON, unknown settings, and malformed JSON before streaming', async () => {
  const app = createApp(loadConfig({}));
  expect(
    (
      await request(app)
        .post('/api/chat')
        .set('content-type', 'application/json')
        .send('{')
    ).status,
  ).toBe(400);
  expect(
    (
      await request(app)
        .post('/api/chat')
        .send({ large: 'x'.repeat(140000) })
    ).status,
  ).toBe(413);
  expect(
    (
      await request(app)
        .post('/api/chat')
        .send({
          requestId: 'r',
          provider: 'local',
          messages: [{ role: 'user', content: 'Hi' }],
          baseURL: 'https://untrusted.example',
        })
    ).status,
  ).toBe(400);
});
it('does not put prompts, generated text, or keys in request logs', async () => {
  const fake = await fakeProvider([
    chunk({ reasoning: 'fixture-reasoning', content: 'fixture-answer' }),
    chunk({}, 'stop'),
  ]);
  const entries: unknown[] = [];
  const spy = vi
    .spyOn(console, 'info')
    .mockImplementation((value) => entries.push(value));
  try {
    await request(
      createApp(
        loadConfig({
          OLLAMA_BASE_URL: `${fake.url}/v1`,
          GEMINI_API_KEY: 'fixture-secret',
        }),
      ),
    )
      .post('/api/chat')
      .send({
        requestId: 'safe-log',
        provider: 'local',
        thinking: true,
        messages: [{ role: 'user', content: 'fixture-prompt' }],
      });
    expect(entries).toHaveLength(1);
    const serialized = JSON.stringify(entries);
    expect(serialized).toContain('safe-log');
    for (const forbidden of [
      'fixture-prompt',
      'fixture-answer',
      'fixture-reasoning',
      'fixture-secret',
    ])
      expect(serialized).not.toContain(forbidden);
  } finally {
    spy.mockRestore();
    await close(fake.server);
  }
});
it('maps invalid provider JSON to a malformed stream error', async () => {
  const fake = await listen(async (req, res) => {
    for await (const part of req) void part;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('data: {invalid}\n\n');
  });
  try {
    const response = await request(
      createApp(loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1` })),
    )
      .post('/api/chat')
      .send({
        requestId: 'r',
        provider: 'local',
        messages: [{ role: 'user', content: 'Hi' }],
      });
    expect(response.text).toContain('"code":"malformed_stream"');
  } finally {
    await close(fake.server);
  }
});
