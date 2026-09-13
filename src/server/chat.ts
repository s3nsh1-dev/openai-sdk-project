import type { Request, Response } from 'express';
import type { Config } from './config';
import { chatRequestSchema, type StreamEvent, type Usage } from '../shared/protocol';
import { normalizeChunk, StreamFailure } from './normalize';
import { streamLocal } from './provider';
export async function chat(config: Config, req: Request, res: Response) {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid conversation input.' }); return; }
  const input = parsed.data;
  if (input.provider !== 'local') { res.status(503).json({ error: 'Gemini is not enabled in this checkpoint.' }); return; }
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  function emit(event: StreamEvent) { if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`); }
  emit({type:'start',requestId:input.requestId,provider:input.provider,model:config.OLLAMA_MODEL});
  let reason: string | null = null;
  let answer = '';
  let usage: Usage | undefined;
  try {
    const stream = await streamLocal(config, input, controller.signal);
    for await (const chunk of stream) {
      const normalized = normalizeChunk(chunk);
      if (normalized.reasoning) emit({type:'reasoning_delta',requestId:input.requestId,text:normalized.reasoning});
      if (normalized.answer) { answer += normalized.answer; emit({type:'answer_delta',requestId:input.requestId,text:normalized.answer}); }
      if (normalized.reason) reason = normalized.reason;
      if (normalized.usage) usage = normalized.usage;
    }
    if (!reason) throw new StreamFailure('unexpected_end', 'The provider stream ended without a final result. Retry explicitly.');
    if (!answer.trim() && reason === 'stop') { emit({type:'error',requestId:input.requestId,code:'empty_answer',message:'The model finished without an answer. Retry explicitly.'}); }
    else emit({type:'finish',requestId:input.requestId,outcome:reason === 'stop' ? 'completed' : reason === 'content_filter' ? 'blocked' : 'incomplete',reason,usage});
  } catch (error) {
    if (!controller.signal.aborted) emit({type:'error',requestId:input.requestId,code:error instanceof StreamFailure ? error.code : 'provider_error',message:error instanceof StreamFailure ? error.message : 'The model stream failed. Check Ollama and retry.'});
  } finally { res.end(); }
}
