import { expect, it } from 'vitest';
import { consumeStream } from '../src/client/stream';
import type { StreamEvent } from '../src/shared/protocol';
function response(text: string, size: number) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += size)
          controller.enqueue(bytes.slice(i, i + size));
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
const frames =
  ': heartbeat\n\ndata: {"type":"answer_delta","requestId":"r","text":"Hi 🦉"}\n\ndata: {"type":"finish","requestId":"r","outcome":"completed","reason":"stop"}\n\n';
it.each([1, 7, 1000])(
  'decodes UTF-8 and SSE boundaries with read size %i',
  async (size) => {
    const events: StreamEvent[] = [];
    await consumeStream(
      response(frames, size),
      (event) => events.push(event),
      'r',
    );
    expect(events[0]).toEqual({
      type: 'answer_delta',
      requestId: 'r',
      text: 'Hi 🦉',
    });
    expect(events).toHaveLength(2);
  },
);
it('fails when the connection closes without a terminal event', async () => {
  await expect(
    consumeStream(
      response(
        'data: {"type":"answer_delta","requestId":"r","text":"partial"}\n\n',
        1,
      ),
      () => {},
      'r',
    ),
  ).rejects.toThrow(/ended/i);
});
it('rejects malformed application events', async () => {
  await expect(
    consumeStream(
      response('data: {"type":"answer_delta","text":4}\n\n', 8),
      () => {},
      'r',
    ),
  ).rejects.toThrow();
});
it('ignores a stale terminal event before accepting current response events', async () => {
  const events: StreamEvent[] = [];
  const text =
    'data: {"type":"finish","requestId":"old","outcome":"completed","reason":"stop"}\n\n' +
    frames;
  await consumeStream(response(text, 1000), (event) => events.push(event), 'r');
  expect(events.map((event) => event.type)).toEqual(['answer_delta', 'finish']);
});
it('settles after a terminal event even when transport stays open', async () => {
  let cancelled = false;
  const open = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frames));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
  const result = await Promise.race([
    consumeStream(open, () => {}, 'r').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 100)),
  ]);
  expect(result).toBe(true);
  expect(cancelled).toBe(true);
});
