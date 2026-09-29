import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { request as httpRequest } from 'node:http';
import { createApp } from '../src/server/app';
import { loadConfig, publicConfig } from './helpers/config';
import { fakeProvider, chunk } from './helpers/provider';
import { close, listen } from './helpers/servers';

const password = 'synthetic-password-for-security-tests-123';
const credentials = `Basic ${Buffer.from(`owner:${password}`).toString('base64')}`;
const input = {
  requestId: 'access-test',
  provider: 'local',
  messages: [{ role: 'user', content: 'Hi' }],
};
const apps: ReturnType<typeof createApp>[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.locals.closeSecurityState?.();
});
function app(env: Record<string, string> = {}) {
  const instance = createApp(loadConfig(env));
  apps.push(instance);
  return instance;
}
const protectedEnv = {
  ACCESS_MODE: 'protected',
  AUTH_USERNAME: 'owner',
  AUTH_PASSWORD: password,
  PUBLIC_ORIGIN: 'https://chat.example',
};

describe('access boundaries', () => {
  it.each([
    'attacker.invalid',
    '127.0.0.1.attacker.invalid',
    'localhost.attacker.invalid',
  ])('rejects an unexpected Host %s', async (host) => {
    const response = await request(app()).get('/api/config').set('Host', host);
    expect(response.status).toBe(421);
  });

  it('does not trust forwarded host or client-IP headers', async () => {
    const response = await request(app())
      .get('/api/config')
      .set('Host', 'attacker.invalid')
      .set('X-Forwarded-Host', 'localhost:3001')
      .set('X-Forwarded-For', '127.0.0.1');
    expect(response.status).toBe(421);
  });

  it('rejects duplicate Host headers rather than choosing one', async () => {
    const server = await listen(app());
    try {
      const status = await new Promise<number | undefined>(
        (resolve, reject) => {
          const outgoing = httpRequest(
            `${server.url}/api/config`,
            {
              headers: ['Host', 'localhost', 'Host', 'attacker.invalid'],
              agent: false,
            },
            (response) => {
              response.resume();
              response.on('end', () => resolve(response.statusCode));
            },
          );
          outgoing.on('error', reject);
          outgoing.end();
        },
      );
      expect(status).toBe(421);
    } finally {
      await close(server.server);
    }
  });

  it('returns a safe unavailable error when the security database cannot be used', async () => {
    const instance = app();
    instance.locals.closeSecurityState?.();
    const response = await request(instance).get('/api/config');
    expect(response.status).toBe(503);
    expect(response.text).not.toMatch(/sqlite|stack|node_modules/i);
  });

  it.each(['https://attacker.invalid', 'null', 'http://localhost:9999'])(
    'rejects an unexpected browser Origin %s before parsing',
    async (origin) => {
      const response = await request(app())
        .post('/api/chat')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send('{');
      expect(response.status).toBe(403);
    },
  );

  it('rejects cross-site fetches even without an Origin', async () => {
    const response = await request(app())
      .post('/api/chat')
      .set('Sec-Fetch-Site', 'cross-site')
      .send(input);
    expect(response.status).toBe(403);
  });

  it('allows the local Vite origin without allowing unrelated ports', async () => {
    const response = await request(app())
      .get('/api/config')
      .set('Origin', 'http://127.0.0.1:5173');
    expect(response.status).toBe(200);
  });

  it.each(['/', '/api/config', '/api/chat', '/assets/missing.js'])(
    'protects the complete application at %s before parsing',
    async (url) => {
      const instance = app(protectedEnv);
      const response =
        url === '/api/chat'
          ? await request(instance)
              .post(url)
              .set('Host', 'chat.example')
              .set('Content-Type', 'application/json')
              .send('{')
          : await request(instance).get(url).set('Host', 'chat.example');
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toContain('Basic');
      expect(response.text).not.toContain(password);
    },
  );

  it.each([
    'Bearer invalid',
    'Basic !!!',
    `Basic ${Buffer.from('owner:wrong').toString('base64')}`,
    `Basic ${Buffer.from(`stranger:${password}`).toString('base64')}`,
  ])('rejects malformed or incorrect authorization', async (authorization) => {
    const response = await request(app(protectedEnv))
      .get('/api/config')
      .set('Host', 'chat.example')
      .set('Authorization', authorization);
    expect(response.status).toBe(401);
  });

  it('authenticates a real streaming request without exposing secrets', async () => {
    const fake = await fakeProvider([
      chunk({ content: 'Authenticated answer' }),
      chunk({}, 'stop'),
    ]);
    try {
      const instance = app({
        ...protectedEnv,
        OLLAMA_BASE_URL: `${fake.url}/v1`,
      });
      const response = await request(instance)
        .post('/api/chat')
        .set('Host', 'chat.example')
        .set('Origin', 'https://chat.example')
        .set('Authorization', credentials)
        .send(input);
      expect(response.status).toBe(200);
      expect(response.text).toContain('Authenticated answer');
      expect(response.text).toContain('"outcome":"completed"');
      expect(response.text).not.toContain(password);
      expect(
        JSON.stringify(publicConfig(loadConfig(protectedEnv))),
      ).not.toContain(password);
    } finally {
      await close(fake.server);
    }
  });

  it('does not let failed authentication consume the owner HTTP allowance', async () => {
    const instance = app({
      ...protectedEnv,
      HTTP_RATE_LIMIT: '1',
      AUTH_FAILURE_LIMIT: '2',
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(instance)
        .get('/api/config')
        .set('Host', 'chat.example')
        .set('Authorization', 'Basic d3Jvbmc6d3Jvbmc=');
      expect(response.status).toBe(attempt < 2 ? 401 : 429);
    }
    // Initial browser challenges must remain available after rejected password guesses.
    const challenge = await request(instance)
      .get('/api/config')
      .set('Host', 'chat.example');
    expect(challenge.status).toBe(401);
    expect(challenge.headers['www-authenticate']).toContain('Basic');
    const owner = await request(instance)
      .get('/api/config')
      .set('Host', 'chat.example')
      .set('Authorization', credentials);
    expect(owner.status).toBe(200);
  });

  it('does not count initial browser challenges as failed password guesses', async () => {
    const instance = app({ ...protectedEnv, AUTH_FAILURE_LIMIT: '2' });
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await request(instance)
        .get('/api/config')
        .set('Host', 'chat.example');
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toContain('Basic');
    }
    const owner = await request(instance)
      .get('/api/config')
      .set('Host', 'chat.example')
      .set('Authorization', credentials);
    expect(owner.status).toBe(200);
  });

  it('rejects every foreign Origin in protected mode, including loopback', async () => {
    const response = await request(app(protectedEnv))
      .post('/api/chat')
      .set('Host', 'chat.example')
      .set('Authorization', credentials)
      .set('Origin', 'http://127.0.0.1:5173')
      .send(input);
    expect(response.status).toBe(403);
  });

  it('rejects same-site subresource requests with cached credentials before charging the owner quota', async () => {
    const instance = app({ ...protectedEnv, HTTP_RATE_LIMIT: '1' });
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(instance)
        .get('/api/config')
        .set('Host', 'chat.example')
        .set('Authorization', credentials)
        .set('Sec-Fetch-Site', 'same-site')
        .set('Sec-Fetch-Dest', 'image');
      expect(response.status).toBe(403);
    }
    const owner = await request(instance)
      .get('/api/config')
      .set('Host', 'chat.example')
      .set('Authorization', credentials)
      .set('Sec-Fetch-Site', 'same-origin');
    expect(owner.status).toBe(200);
  });

  it('applies the ingress limit to malformed JSON before the parser', async () => {
    const instance = app({ HTTP_RATE_LIMIT: '2' });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(instance)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send('{');
      statuses.push(response.status);
    }
    expect(statuses).toEqual([400, 400, 429]);
  });

  it('sets browser containment headers on successful and rejected requests', async () => {
    const instance = app();
    for (const response of [
      await request(instance).get('/api/health'),
      await request(instance)
        .get('/api/config')
        .set('Host', 'attacker.invalid'),
    ]) {
      expect(response.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers['content-security-policy']).toContain(
        "script-src 'self'",
      );
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toContain('no-store');
    }
  });

  it('sets HSTS for the protected HTTPS origin, but keeps local HTTP usable', async () => {
    const protectedResponse = await request(app(protectedEnv))
      .get('/api/config')
      .set('Host', 'chat.example')
      .set('Authorization', credentials);
    expect(protectedResponse.headers['strict-transport-security']).toContain(
      'max-age=',
    );
    const localResponse = await request(app()).get('/api/health');
    expect(localResponse.headers['strict-transport-security']).toBeUndefined();
    expect(localResponse.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    );
  });
});

describe('fail-closed security configuration', () => {
  it.each([
    { NODE_ENV: 'production' },
    { ACCESS_MODE: 'protected' },
    { ...protectedEnv, AUTH_PASSWORD: 'short' },
    { ...protectedEnv, PUBLIC_ORIGIN: 'http://chat.example' },
    { ...protectedEnv, PUBLIC_ORIGIN: 'https://chat.example/path' },
    { ...protectedEnv, PUBLIC_ORIGIN: 'https://user:pass@chat.example' },
    {
      ...protectedEnv,
      NODE_ENV: 'production',
      SECURITY_STATE_PATH: ':memory:',
    },
    { DAILY_TOKEN_LIMIT: '0' },
  ])('refuses unsafe startup settings', (env) => {
    expect(() => loadConfig(env)).toThrow();
  });
});
