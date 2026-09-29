import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadConfig, publicConfig } from './helpers/config';
import { createApp } from '../src/server/app';
describe('foundation', () => {
  it('reports app health without contacting a provider', async () => {
    const result = await request(createApp(loadConfig({}))).get('/api/health');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: 'ok' });
  });
  it('exposes availability but never the key or upstream URL', () => {
    const serialized = JSON.stringify(
      publicConfig(loadConfig({ GEMINI_API_KEY: 'test-secret' })),
    );
    expect(serialized).not.toContain('test-secret');
    expect(serialized).not.toContain('http');
    expect(JSON.parse(serialized).providers.gemini.available).toBe(true);
  });
  it('rejects invalid deadlines and URLs on startup', () => {
    expect(() => loadConfig({ IDLE_MS: '-1' })).toThrow();
    expect(() => loadConfig({ OLLAMA_BASE_URL: 'not-a-url' })).toThrow();
  });
});
