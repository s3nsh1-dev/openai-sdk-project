import { afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createApp } from '../src/server/app';
import { createProviders } from '../src/server/provider';
import { createSecurityState } from '../src/server/security-state';
import { loadConfig } from './helpers/config';
import { fakeProvider, chunk } from './helpers/provider';
import { close, listen } from './helpers/servers';

const input = {
  requestId: 'quota-test',
  provider: 'local',
  messages: [{ role: 'user', content: 'Hi' }],
};
const directories: string[] = [];
const apps: ReturnType<typeof createApp>[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.locals.closeSecurityState?.();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function databasePath() {
  const directory = mkdtempSync(path.join(tmpdir(), 'chat-security-'));
  directories.push(directory);
  return path.join(directory, 'quota.sqlite');
}
function app(env: Record<string, string>) {
  const instance = createApp(loadConfig(env));
  apps.push(instance);
  return instance;
}

it('persists accepted request limits across app restarts', async () => {
  const fake = await fakeProvider([
    chunk({ content: 'Answer' }),
    chunk({}, 'stop'),
  ]);
  try {
    const env = {
      SECURITY_STATE_PATH: databasePath(),
      OLLAMA_BASE_URL: `${fake.url}/v1`,
      RATE_LIMIT: '1',
    };
    const first = app(env);
    expect((await request(first).post('/api/chat').send(input)).status).toBe(
      200,
    );
    first.locals.closeSecurityState?.();
    const restarted = app(env);
    const response = await request(restarted).post('/api/chat').send(input);
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
  } finally {
    await close(fake.server);
  }
});

it('reserves daily token allowances before starting another provider request', async () => {
  const fake = await fakeProvider([
    chunk({ content: 'Answer' }),
    chunk({}, 'stop'),
  ]);
  try {
    const env = {
      SECURITY_STATE_PATH: databasePath(),
      OLLAMA_BASE_URL: `${fake.url}/v1`,
      DAILY_TOKEN_LIMIT: '5000',
    };
    const first = app(env);
    expect((await request(first).post('/api/chat').send(input)).status).toBe(
      200,
    );
    first.locals.closeSecurityState?.();
    const restarted = app(env);
    const response = await request(restarted).post('/api/chat').send(input);
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/daily/i);
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(60);
  } finally {
    await close(fake.server);
  }
});

it('coordinates generation slots across app instances sharing a database', async () => {
  const fake = await fakeProvider(
    [chunk({ content: 'Answer' }), chunk({}, 'stop')],
    { delay: 150 },
  );
  const env = {
    SECURITY_STATE_PATH: databasePath(),
    OLLAMA_BASE_URL: `${fake.url}/v1`,
  };
  const first = app(env);
  const second = app(env);
  const server = await listen(first);
  const abort = new AbortController();
  try {
    const response = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    expect((await request(second).post('/api/chat').send(input)).status).toBe(
      409,
    );
    abort.abort();
    await reader.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 60));
    const next = await request(second).post('/api/chat').send(input);
    expect(next.text).toContain('"outcome":"completed"');
  } finally {
    abort.abort();
    await close(server.server);
    await close(fake.server);
  }
});

it('does not refund daily allowance when an upstream request fails', async () => {
  const fake = await fakeProvider([], { status: 503 });
  try {
    const instance = app({
      SECURITY_STATE_PATH: databasePath(),
      OLLAMA_BASE_URL: `${fake.url}/v1`,
      DAILY_TOKEN_LIMIT: '5000',
    });
    const first = await request(instance).post('/api/chat').send(input);
    expect(first.text).toContain('"code":"provider_unavailable"');
    const next = await request(instance).post('/api/chat').send(input);
    expect(next.status).toBe(429);
    expect(next.body.error).toMatch(/daily/i);
  } finally {
    await close(fake.server);
  }
});

it('waits for aborted provider cleanup before closing security state', async () => {
  const fake = await fakeProvider(
    [chunk({ content: 'Answer' }), chunk({}, 'stop')],
    { delay: 150 },
  );
  const env = {
    SECURITY_STATE_PATH: databasePath(),
    OLLAMA_BASE_URL: `${fake.url}/v1`,
  };
  const config = loadConfig(env);
  const original = createProviders(config);
  let iterating = false;
  const providers = {
    ...original,
    async stream(...args: Parameters<typeof original.stream>) {
      const stream = await original.stream(...args);
      const iterator = stream[Symbol.asyncIterator].bind(stream);
      stream[Symbol.asyncIterator] = async function* () {
        iterating = true;
        try {
          yield* { [Symbol.asyncIterator]: iterator };
        } finally {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };
      return stream;
    },
  };
  const first = createApp(config, { providers });
  apps.push(first);
  const server = await listen(first);
  try {
    const response = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const reader = response.body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(iterating).toBe(true));
    const stopped = new Promise<void>((resolve) =>
      server.server.close(() => {
        first.locals.closeSecurityState();
        resolve();
      }),
    );
    server.server.closeAllConnections();
    await stopped;
    await reader.cancel().catch(() => {});
    const restarted = app(env);
    await vi.waitFor(
      async () => {
        const next = await request(restarted).post('/api/chat').send(input);
        expect(next.status).toBe(200);
        expect(next.text).toContain('"outcome":"completed"');
      },
      { timeout: 2000, interval: 30 },
    );
  } finally {
    server.server.closeAllConnections();
    await close(fake.server);
  }
});

it('enforces the same quota across independent Node processes', async () => {
  const filename = databasePath();
  const seeded = app({ SECURITY_STATE_PATH: filename });
  seeded.locals.closeSecurityState();
  const run = async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/quota-worker.ts', filename],
      {
        env: { PATH: process.env.PATH, NODE_ENV: 'test' },
        timeout: 5000,
      },
    );
    return (JSON.parse(stdout) as { status: number }).status;
  };
  const statuses = await Promise.all([run(), run(), run()]);
  expect(statuses.filter((status) => status === 200)).toHaveLength(1);
  expect(statuses.every((status) => [200, 409, 429].includes(status))).toBe(
    true,
  );
  expect(await run()).toBe(429);
});

it('keeps caller rate allowances separate while preserving a total provider budget', () => {
  const state = createSecurityState(
    loadConfig({ RATE_LIMIT: '1', DAILY_TOKEN_LIMIT: '5000' }),
  );
  try {
    const alice = state.acquire('alice', 'local', 2000);
    expect(alice).toHaveProperty('release');
    if ('release' in alice) alice.release();
    expect(state.acquire('alice', 'local', 2000)).toMatchObject({
      status: 429,
    });
    const bob = state.acquire('bob', 'local', 2000);
    expect(bob).toHaveProperty('release');
    if ('release' in bob) bob.release();
    expect(state.acquire('charlie', 'local', 2000)).toMatchObject({
      status: 429,
      error: expect.stringMatching(/daily/i),
    });
  } finally {
    state.close();
  }
});

it('resets the daily allowance at UTC midnight and keeps provider budgets separate', () => {
  const clock = vi
    .spyOn(Date, 'now')
    .mockReturnValue(Date.UTC(2026, 8, 30, 23, 59, 59));
  const state = createSecurityState(loadConfig({ DAILY_TOKEN_LIMIT: '4000' }));
  try {
    const first = state.acquire('owner', 'local', 3840);
    if ('release' in first) first.release();
    expect(state.acquire('owner', 'local', 3840)).toMatchObject({
      status: 429,
      retryAfter: 1,
    });
    const cloud = state.acquire('owner', 'gemini', 3840);
    expect(cloud).toHaveProperty('release');
    if ('release' in cloud) cloud.release();
    clock.mockReturnValue(Date.UTC(2026, 9, 1));
    const nextDay = state.acquire('owner', 'local', 3840);
    expect(nextDay).toHaveProperty('release');
    if ('release' in nextDay) nextDay.release();
  } finally {
    clock.mockRestore();
    state.close();
  }
});

it('expires abandoned leases without allowing stale cleanup to release a newer generation', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 30));
  const state = createSecurityState(loadConfig({ OVERALL_MS: '100' }));
  try {
    const stale = state.acquire('owner', 'local', 3840);
    expect(state.acquire('owner', 'local', 3840)).toMatchObject({
      status: 409,
    });
    clock.mockReturnValue(Date.UTC(2026, 8, 30) + 10101);
    const current = state.acquire('owner', 'local', 3840);
    expect(current).toHaveProperty('release');
    if ('release' in stale) stale.release();
    expect(state.acquire('owner', 'local', 3840)).toMatchObject({
      status: 409,
    });
    if ('release' in current) current.release();
  } finally {
    clock.mockRestore();
    state.close();
  }
});
