import { createApp } from '../../src/server/app';
import { loadConfig } from '../../src/server/config';
import { createProviders } from '../../src/server/provider';
import { listen, close } from '../helpers/servers';
import { chunk } from '../helpers/provider';
// Deliberately ignore process.env and .env. Both provider choices use this fixture.
const attempts = new Map<string, number>();
const fake = await listen(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const input = JSON.parse(raw);
  const last = input.messages.at(-1).content as string;
  const count = (attempts.get(last) ?? 0) + 1;
  attempts.set(last, count);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.flushHeaders();
  const send = (value: unknown) => {
    if (!res.destroyed) res.write(`data: ${JSON.stringify(value)}\n\n`);
  };
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  if (last.includes('[waiting]')) await delay(1500);
  if (res.destroyed) return;
  if (last.includes('[length]')) {
    send(chunk({ reasoning: 'A separately supplied thought summary.' }));
    send(chunk({}, 'length'));
    res.end('data: [DONE]\n\n');
    return;
  }
  if (input.extra_body?.google?.thinking_config?.include_thoughts)
    send(
      chunk({
        reasoning_content: 'A Gemini thought summary supplied separately.',
      }),
    );
  if (input.reasoning_effort !== 'none' && input.model === 'qwen3.5:4b')
    send(
      chunk({ reasoning: 'Consider the binding separately from the value.' }),
    );
  if (last.includes('[slow]') || last.includes('[disconnect]')) {
    send(chunk({ content: 'Partial response stays visible.' }));
    await delay(1200);
    if (res.destroyed) return;
    if (last.includes('[disconnect]')) {
      res.destroy();
      return;
    }
  }
  if (last.includes('[retry]') && count === 1) {
    send(chunk({ content: 'An unfinished attempt.' }));
    res.end('data: [DONE]\n\n');
    return;
  }
  const answer = last.includes('[large-history]')
    ? ['x'.repeat(3000)]
    : last.includes('[long]')
      ? Array.from(
          { length: 50 },
          (_, i) =>
            `Paragraph ${i + 1}. A const binding keeps the same reference.\n\n`,
        )
      : [
          `${input.messages.length === 4 ? 'Follow-up received. ' : ''}A const binding cannot be reassigned.\n\n`,
          '```js\nconst n = 4;\n```\n\n',
          '<script>window.hacked=true</script>\n\n![tracking](https://example.com/track.png)',
        ];
  for (const text of answer) {
    if (res.destroyed) return;
    send(chunk({ content: text }));
    await delay(last.includes('[long]') ? 30 : 25);
  }
  send(chunk({}, 'stop'));
  send({
    choices: [],
    usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
  });
  res.end('data: [DONE]\n\n');
});
const config = loadConfig({
  OLLAMA_BASE_URL: `${fake.url}/v1`,
  GEMINI_API_KEY: 'browser-fixture-key',
  RATE_LIMIT: '1000',
});
const providers = createProviders(config, async (_url, init) =>
  fetch(`${fake.url}/v1/chat/completions`, init),
);
const server = createApp(config, { providers }).listen(4173, '127.0.0.1', () =>
  console.info('Browser fixture app on 4173'),
);
async function shutdown() {
  await close(server);
  await close(fake.server);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
