import type { Response } from 'express';
// Pausing here also pauses the upstream async iterator, bounding queued output.
export async function writeFrame(
  res: Response,
  frame: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (res.destroyed) throw new Error('Client disconnected');
  if (res.write(frame)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      res.off('drain', onDrain);
      res.off('close', onClose);
      signal.removeEventListener('abort', onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Client disconnected'));
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    res.once('drain', onDrain);
    res.once('close', onClose);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
