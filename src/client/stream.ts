import { createParser } from 'eventsource-parser';
import { streamEventSchema, type StreamEvent } from '../shared/protocol';
export async function consumeStream(
  response: Response,
  onEvent: (event: StreamEvent) => void,
  expectedRequestId: string,
) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : 'The application server rejected this request.',
    );
  }
  if (
    !response.body ||
    !response.headers.get('content-type')?.includes('text/event-stream')
  )
    throw new Error('Expected an event stream.');
  let terminal = false;
  const parser = createParser({
    onEvent(message) {
      if (terminal) return;
      const event = streamEventSchema.parse(JSON.parse(message.data));
      if (event.requestId !== expectedRequestId) return;
      if (event.type === 'finish' || event.type === 'error') terminal = true;
      onEvent(event);
    },
    onError(error) {
      throw error;
    },
    maxBufferSize: 256 * 1024,
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    while (!terminal) {
      const { value, done } = await reader.read();
      if (done) {
        parser.feed(decoder.decode());
        break;
      }
      parser.feed(decoder.decode(value, { stream: true }));
    }
    if (!terminal)
      throw new Error(
        'The stream ended before a final result. Retry explicitly.',
      );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
