import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { createProviders } from '../src/server/provider';
import { loadConfig } from './helpers/config';
import { fakeProvider } from './helpers/provider';
import { close } from './helpers/servers';

const input = {
  requestId: 'provider-error',
  provider: 'gemini',
  thinking: true,
  messages: [{ role: 'user', content: 'fixture-private-question' }],
};

it('identifies a provider HTTP 503 and logs only its safe status without retrying or falling back', async () => {
  let calls = 0;
  const fake = await fakeProvider([], {
    status: 503,
    onRequest: () => calls++,
  });
  const entries: string[] = [];
  const spy = vi.spyOn(console, 'info').mockImplementation((entry) => {
    entries.push(String(entry));
  });
  const config = loadConfig({ GEMINI_API_KEY: 'fixture-secret' });
  const providers = createProviders(config, async (_url, init) =>
    fetch(`${fake.url}/v1/chat/completions`, init),
  );
  const app = createApp(config, { providers });
  try {
    const response = await request(app).post('/api/chat').send(input);
    expect(response.text).toContain('HTTP 503');
    expect(response.text).toMatch(/temporarily unavailable/i);
    expect(response.text).toMatch(/wait.*retry explicitly/i);
    expect(response.text).not.toMatch(/connection failed/i);
    expect(calls).toBe(1);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0])).toMatchObject({
      requestId: 'provider-error',
      provider: 'gemini',
      finishReason: 'provider_unavailable',
      upstreamStatus: 503,
    });
    for (const forbidden of [
      'fixture-private-question',
      'fixture-secret',
      'sensitive upstream details',
    ]) {
      expect(response.text).not.toContain(forbidden);
      expect(entries.join('')).not.toContain(forbidden);
    }
  } finally {
    spy.mockRestore();
    app.locals.closeSecurityState();
    await close(fake.server);
  }
});

it.each([
  [503, 'UNAVAILABLE', 'provider_unavailable'],
  [429, 'RESOURCE_EXHAUSTED', 'quota'],
  [400, 'INVALID_ARGUMENT', 'provider_request'],
] as const)(
  'classifies a Google error with code %i inside an HTTP 200 stream',
  async (status, name, expectedCode) => {
    const fake = await fakeProvider([
      {
        error: { code: status, status: name, message: 'private upstream text' },
      },
    ]);
    const config = loadConfig({ GEMINI_API_KEY: 'fixture-key' });
    const providers = createProviders(config, async (_url, init) =>
      fetch(`${fake.url}/v1/chat/completions`, init),
    );
    const app = createApp(config, { providers });
    try {
      const response = await request(app).post('/api/chat').send(input);
      expect(response.status).toBe(200);
      expect(response.text).toContain(`"code":"${expectedCode}"`);
      expect(response.text).not.toContain('private upstream text');
      if (status === 503) expect(response.text).toContain('HTTP 503');
    } finally {
      app.locals.closeSecurityState();
      await close(fake.server);
    }
  },
);

it('does not trust arbitrary strings supplied as a provider error code', async () => {
  const fake = await fakeProvider([
    { error: { code: 'fixture-secret', message: 'private upstream text' } },
  ]);
  const entries: string[] = [];
  const spy = vi.spyOn(console, 'info').mockImplementation((entry) => {
    entries.push(String(entry));
  });
  const config = loadConfig({ GEMINI_API_KEY: 'fixture-secret' });
  const providers = createProviders(config, async (_url, init) =>
    fetch(`${fake.url}/v1/chat/completions`, init),
  );
  const app = createApp(config, { providers });
  try {
    const response = await request(app).post('/api/chat').send(input);
    expect(JSON.parse(entries[0])).not.toHaveProperty('upstreamStatus');
    expect(response.text + entries.join('')).not.toMatch(
      /fixture-secret|private upstream text/,
    );
  } finally {
    spy.mockRestore();
    app.locals.closeSecurityState();
    await close(fake.server);
  }
});
