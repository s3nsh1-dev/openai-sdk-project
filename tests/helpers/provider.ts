import { listen } from './servers';
export function chunk(delta: Record<string, unknown> = {}, finish: string | null = null) {
  return { id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{index:0,delta,finish_reason:finish}] };
}
export async function fakeProvider(chunks: unknown[], options: { delay?: number; status?: number; onRequest?: (body: Record<string, unknown>) => void; onClose?: () => void } = {}) {
  return listen(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    options.onRequest?.(JSON.parse(body));
    res.on('close', () => options.onClose?.());
    if (options.status) { res.writeHead(options.status, {'content-type':'application/json'}); res.end(JSON.stringify({error:{message:'sensitive upstream details',type:'fixture'}})); return; }
    res.writeHead(200, {'content-type':'text/event-stream'}); res.flushHeaders();
    for (const value of chunks) {
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      if (res.destroyed) return;
      res.write(`data: ${JSON.stringify(value)}\n\n`);
    }
    res.end('data: [DONE]\n\n');
  });
}
