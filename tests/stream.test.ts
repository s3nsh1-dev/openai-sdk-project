import { expect, it } from 'vitest';
import { consumeStream } from '../src/client/stream';
import type { StreamEvent } from '../src/shared/protocol';
function response(text: string, size: number) {
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) { for (let i=0;i<bytes.length;i+=size) controller.enqueue(bytes.slice(i,i+size)); controller.close(); } }), {headers:{'content-type':'text/event-stream'}});
}
const frames = ': heartbeat\n\ndata: {"type":"answer_delta","requestId":"r","text":"Hi 🦉"}\n\ndata: {"type":"finish","requestId":"r","outcome":"completed","reason":"stop"}\n\n';
it.each([1, 7, 1000])('decodes UTF-8 and SSE boundaries with read size %i', async size => {
  const events: StreamEvent[] = [];
  await consumeStream(response(frames,size), event => events.push(event));
  expect(events[0]).toEqual({type:'answer_delta',requestId:'r',text:'Hi 🦉'});
  expect(events).toHaveLength(2);
});
it('fails when the connection closes without a terminal event', async () => {
  await expect(consumeStream(response('data: {"type":"answer_delta","requestId":"r","text":"partial"}\n\n',1), () => {})).rejects.toThrow(/ended/i);
});
it('rejects malformed application events', async () => {
  await expect(consumeStream(response('data: {"type":"answer_delta","text":4}\n\n',8), () => {})).rejects.toThrow();
});
