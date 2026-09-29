import { expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server/app';
import { createProviders } from '../src/server/provider';
import { loadConfig } from './helpers/config';
import { chunk, fakeProvider } from './helpers/provider';
import { close } from './helpers/servers';

it('protects mixed-provider history and preserves the owner generation limit across switches and restart', async () => {
  const upstream: Record<string, unknown>[] = [];
  const fake = await fakeProvider(
    [chunk({ content: 'Local answer' }), chunk({}, 'stop')],
    { onRequest: (body) => upstream.push(body) },
  );
  const directory = mkdtempSync(path.join(tmpdir(), 'chat-switch-security-'));
  const password = 'synthetic-switch-test-password-only-123';
  const config = loadConfig({
    ACCESS_MODE: 'protected',
    AUTH_USERNAME: 'owner',
    AUTH_PASSWORD: password,
    PUBLIC_ORIGIN: 'https://chat.example',
    SECURITY_STATE_PATH: path.join(directory, 'quota.sqlite'),
    OLLAMA_BASE_URL: `${fake.url}/v1`,
    GEMINI_API_KEY: 'fixture-key',
    RATE_LIMIT: '2',
  });
  const providers = createProviders(config, async (_url, init) =>
    fetch(`${fake.url}/v1/chat/completions`, init),
  );
  const apps: ReturnType<typeof createApp>[] = [];
  const app = createApp(config, { providers });
  apps.push(app);
  const first = {
    requestId: 'first-local',
    provider: 'local',
    thinking: false,
    messages: [{ role: 'user', content: 'First question' }],
  };
  const next = {
    requestId: 'next-gemini',
    provider: 'gemini',
    thinking: false,
    messages: [
      ...first.messages,
      { role: 'assistant', content: 'Local answer' },
      { role: 'user', content: 'Follow-up question' },
    ],
  };
  const send = (instance: typeof app, body: typeof first) =>
    request(instance)
      .post('/api/chat')
      .set('Host', 'chat.example')
      .set('Origin', 'https://chat.example')
      .auth('owner', password)
      .send(body);
  try {
    const unauthorized = await request(app)
      .post('/api/chat')
      .set('Host', 'chat.example')
      .send(next);
    expect(unauthorized.status).toBe(401);
    const foreign = await request(app)
      .post('/api/chat')
      .set('Host', 'chat.example')
      .set('Origin', 'https://attacker.example')
      .auth('owner', password)
      .send(next);
    expect(foreign.status).toBe(403);
    expect(upstream).toHaveLength(0);
    const local = await send(app, first);
    expect(local.status).toBe(200);
    expect(local.text).toContain('"outcome":"completed"');
    const cloud = await send(app, next);
    expect(cloud.status).toBe(200);
    expect(cloud.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(cloud.text).toContain('"provider":"gemini"');
    expect(upstream).toHaveLength(2);
    expect(upstream[1]).toMatchObject({
      model: 'gemini-3.8-flash',
      messages: [
        { role: 'system', content: expect.any(String) },
        ...next.messages,
      ],
    });
    // Changing provider cannot grant this owner another accepted request.
    const backToLocal = { ...next, requestId: 'back-local', provider: 'local' };
    const limited = await send(app, backToLocal);
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    app.locals.closeSecurityState();
    const restarted = createApp(config, { providers });
    apps.push(restarted);
    const persisted = await send(restarted, {
      ...next,
      requestId: 'retry-cloud',
    });
    expect(persisted.status).toBe(429);
    expect(upstream).toHaveLength(2);
  } finally {
    for (const instance of apps) instance.locals.closeSecurityState();
    await close(fake.server);
    rmSync(directory, { recursive: true, force: true });
  }
});
