import { expect, it } from 'vitest';
import { createProviders } from '../src/server/provider';
import { loadConfig } from './helpers/config';
import { estimateInput } from '../src/server/budget';
import { fakeProvider, chunk } from './helpers/provider';
import { close } from './helpers/servers';
import type { Message } from '../src/shared/protocol';
it('uses spare local context for reasoning and answers without changing model tuning', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fake = await fakeProvider(
    [chunk({ content: 'answer' }), chunk({}, 'stop')],
    { onRequest: (body) => bodies.push(body) },
  );
  try {
    const provider = createProviders(
      loadConfig({ OLLAMA_BASE_URL: `${fake.url}/v1` }),
    );
    const short: Message[] = [
      { role: 'user', content: 'teach me about promises' },
    ];
    const long: Message[] = [{ role: 'user', content: 'x'.repeat(2400) }];
    for (const messages of [short, long]) {
      const stream = await provider.stream(
        { requestId: 'r', provider: 'local', thinking: true, messages },
        new AbortController().signal,
      );
      for await (const value of stream) void value;
    }
    expect(bodies[0].max_tokens).toBeGreaterThan(3000);
    expect(bodies[1].max_tokens).toBeLessThan(bodies[0].max_tokens as number);
    for (const [index, messages] of [short, long].entries()) {
      expect(
        (bodies[index].max_tokens as number) + estimateInput(messages) + 256,
      ).toBeLessThanOrEqual(4096);
      for (const option of [
        'temperature',
        'top_p',
        'presence_penalty',
        'options',
      ])
        expect(bodies[index]).not.toHaveProperty(option);
    }
  } finally {
    await close(fake.server);
  }
});
it('does not request Gemini thought summaries when unchecked', async () => {
  let body: Record<string, unknown> = {};
  const fake = await fakeProvider(
    [chunk({ content: 'answer' }), chunk({}, 'stop')],
    {
      onRequest: (value) => {
        body = value;
      },
    },
  );
  try {
    const providers = createProviders(
      loadConfig({ GEMINI_API_KEY: 'fixture-key' }),
      async (_url, init) => fetch(`${fake.url}/v1/chat/completions`, init),
    );
    const stream = await providers.stream(
      {
        requestId: 'r',
        provider: 'gemini',
        thinking: false,
        messages: [{ role: 'user', content: 'Hi' }],
      },
      new AbortController().signal,
    );
    for await (const value of stream) void value;
    expect(body).not.toHaveProperty('extra_body');
    expect(body).not.toHaveProperty('reasoning_effort');
  } finally {
    await close(fake.server);
  }
});
