import { createApp } from '../src/server/app';
import { loadConfig } from '../src/server/config';
import { consumeStream } from '../src/client/stream';
import { listen, close } from '../tests/helpers/servers';
import type { ChatRequest, StreamEvent, Message } from '../src/shared/protocol';
const selected = process.argv[2];
if (selected !== 'local' && selected !== 'gemini')
  throw new Error('Choose local or gemini explicitly.');
const provider: ChatRequest['provider'] = selected;
const config = loadConfig();
if (provider === 'gemini' && !config.GEMINI_API_KEY.trim())
  throw new Error(
    'Configure GEMINI_API_KEY in .env before explicitly running the Gemini smoke test.',
  );
const server = await listen(createApp(config));
async function exchange(messages: Message[], thinking = false) {
  const events: StreamEvent[] = [];
  const requestId = crypto.randomUUID();
  const response = await fetch(`${server.url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId, provider, thinking, messages }),
  });
  await consumeStream(response, (event) => events.push(event), requestId);
  const terminal = events.at(-1);
  if (terminal?.type !== 'finish')
    throw new Error(
      terminal?.type === 'error' ? terminal.message : 'Missing finish event.',
    );
  return {
    events,
    terminal,
    answer: events
      .filter((event) => event.type === 'answer_delta')
      .map((event) => event.text)
      .join(''),
  };
}
try {
  const first: Message = {
    role: 'user',
    content: 'What is 2 + 2? Reply with just the number.',
  };
  const result = await exchange([first]);
  if (result.terminal.outcome !== 'completed' || !result.answer.trim())
    throw new Error('Direct answer did not complete.');
  console.info(`${provider}: direct streaming answer passed.`);
  if (provider === 'local') {
    const followup = await exchange([
      first,
      { role: 'assistant', content: result.answer },
      {
        role: 'user',
        content: 'Add 3 to that result. Reply with just the number.',
      },
    ]);
    if (
      followup.terminal.outcome !== 'completed' ||
      !followup.answer.includes('7')
    )
      throw new Error('Follow-up check did not return 7.');
    console.info('local: follow-up context passed.');
    const thinking = await exchange(
      [{ role: 'user', content: 'What is 2 + 2? Be brief.' }],
      true,
    );
    if (
      !thinking.events.some(
        (event) => event.type === 'reasoning_delta' && event.text.trim(),
      )
    )
      throw new Error('No separate reasoning observed.');
    console.info(
      `local: separate reasoning observed; outcome ${thinking.terminal.outcome}.`,
    );
    const abort = new AbortController();
    const response = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: abort.signal,
      body: JSON.stringify({
        requestId: 'live-cancel',
        provider,
        thinking: true,
        messages: [
          {
            role: 'user',
            content: 'Explain closures in JavaScript with many examples.',
          },
        ],
      }),
    });
    const reader = response.body!.getReader();
    // Wait for actual provider output, not merely the application's start event.
    let received = '';
    while (!received.includes('_delta')) {
      const part = await reader.read();
      if (part.done) throw new Error('No output to cancel.');
      received += new TextDecoder().decode(part.value);
    }
    abort.abort();
    await reader.cancel().catch(() => {});
    console.info(
      'local: browser-side cancellation sent during provider output; server cleanup is covered by fixtures.',
    );
  }
} finally {
  await close(server.server);
}
