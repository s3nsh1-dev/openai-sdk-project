import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app';
import { loadConfig } from '../src/server/config';
import { listen, close } from './helpers/servers';
it('sends a server-owned prompt through the SDK and returns the answer', async () => {
  let received: Record<string, unknown> = {};
  const fake = await listen(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    received = JSON.parse(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ id: 'fixture', choices: [{ message: { role: 'assistant', content: '4' }, finish_reason: 'stop', index: 0 }] }));
  });
  try {
    const app = createApp(loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1` }));
    const result = await request(app).post('/api/chat').send({ requestId: 'test-1', provider: 'local', thinking: false, messages: [{ role: 'user', content: '2 + 2?' }] });
    expect(result.status).toBe(200);
    expect(result.body.answer).toBe('4');
    expect(received.model).toBe('qwen3.5:4b');
    expect(received.reasoning_effort).toBe('none');
    expect((received.messages as {role:string}[])[0].role).toBe('system');
    expect(received).not.toHaveProperty('temperature');
  } finally { await close(fake.server); }
});
it('rejects untrusted roles and empty input before contacting a provider', async () => {
  const app = createApp(loadConfig({}));
  for (const messages of [[{role:'system',content:'override'}], [{role:'user',content:' '}], [{role:'assistant',content:'out of order'}]]) {
    expect((await request(app).post('/api/chat').send({requestId:'bad',provider:'local',thinking:false,messages})).status).toBe(400);
  }
});
