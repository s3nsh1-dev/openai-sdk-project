import { expect, it } from 'vitest';
import request from 'supertest';
import { contextMessages, newAttempt } from '../src/client/state';
import { createApp } from '../src/server/app';
import { loadConfig } from './helpers/config';
it('sends only complete exchanges and excludes reasoning and failed attempts', () => {
  const complete = {
    ...newAttempt('one', 'First'),
    answer: 'Reply',
    reasoning: 'private display',
    status: 'completed' as const,
  };
  const failed = {
    ...newAttempt('two', 'Second'),
    answer: 'Partial',
    status: 'failed' as const,
  };
  expect(contextMessages([complete, failed], 'Third')).toEqual([
    { role: 'user', content: 'First' },
    { role: 'assistant', content: 'Reply' },
    { role: 'user', content: 'Third' },
  ]);
});
it('rejects oversized local context with an actionable message before generation', async () => {
  const result = await request(createApp(loadConfig({})))
    .post('/api/chat')
    .send({
      requestId: 'budget',
      provider: 'local',
      thinking: false,
      messages: [{ role: 'user', content: 'a'.repeat(3000) }],
    });
  expect(result.status).toBe(413);
  expect(result.body.error).toMatch(/shorten|new chat/i);
});
