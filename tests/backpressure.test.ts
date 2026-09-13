import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { expect, it } from 'vitest';
import { writeFrame } from '../src/server/sse';
it('waits for drain and removes listeners after cancellation', async () => {
  const writable = Object.assign(new EventEmitter(),{destroyed:false,write:() => false});
  const abort = new AbortController();
  let resolved = false;
  const pending = writeFrame(writable as unknown as Response,'data: {}\n\n',abort.signal).then(() => {resolved=true;});
  await Promise.resolve(); expect(resolved).toBe(false);
  writable.emit('drain'); await pending; expect(resolved).toBe(true);
  const cancelled = writeFrame(writable as unknown as Response,'data: {}\n\n',abort.signal);
  abort.abort(); await expect(cancelled).rejects.toThrow();
  expect(writable.listenerCount('drain')).toBe(0); expect(writable.listenerCount('close')).toBe(0);
});
