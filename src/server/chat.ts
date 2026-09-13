import type { Request, Response } from 'express';
import { estimateInput, inputBudget } from './budget';
import type { Config } from './config';
import { chatRequestSchema, type StreamEvent, type Usage } from '../shared/protocol';
import { normalizeChunk, StreamFailure } from './normalize';
import { createProviders, type Providers } from './provider';
import { safeError } from './errors';
import { writeFrame } from './sse';
export type RequestLog = {requestId:string;provider:string;durationMs:number;finishReason:string;usage?:Usage};
export function createChatHandler(config: Config, providers: Providers = createProviders(config), log: (entry: RequestLog) => void = entry => console.info(JSON.stringify(entry))) {
  const active = new Set<string>();
  let recent: number[] = [];
  return async function chat(req: Request, res: Response) {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({error:'Invalid conversation input. Use alternating user/assistant text messages, ending with user.'}); return; }
    const input = parsed.data;
    if (input.provider === 'gemini' && !config.GEMINI_API_KEY.trim()) { res.status(503).json({error:'Gemini API key is not configured on the server. Select Local or configure the key.'}); return; }
    if (estimateInput(input.messages) > inputBudget(input.provider)) { res.status(413).json({error:'Conversation exceeds the input budget. Shorten your message or start a new chat. History is never silently trimmed.'}); return; }
    if (active.has(input.provider)) { res.status(409).json({error:'This provider is busy with another request. Stop it or wait, then retry.'}); return; }
    const started = Date.now();
    recent = recent.filter(time => started-time < 60000);
    if (recent.length >= config.RATE_LIMIT) { res.setHeader('Retry-After','60'); res.status(429).json({error:'Application request limit reached. Wait one minute and retry.'}); return; }
    recent.push(started); active.add(input.provider);
    const controller = new AbortController();
    let deadline: StreamFailure | undefined;
    let terminal = false;
    let reason: string | null = null;
    let answer = '';
    let usage: Usage | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const expire = (code: string, message: string) => { deadline = new StreamFailure(code,message); controller.abort(deadline); };
    const firstTimer = setTimeout(() => expire('first_activity_timeout','No provider activity before the deadline. Check the model and retry.'),config.FIRST_ACTIVITY_MS);
    const overallTimer = setTimeout(() => expire('overall_timeout','The overall generation deadline was reached. Partial output is preserved.'),config.OVERALL_MS);
    const disconnected = () => controller.abort();
    res.on('close',disconnected);
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
    const heartbeat = setInterval(() => {if (!res.destroyed && !res.writableNeedDrain) res.write(': heartbeat\n\n');},15000);
    const emit = async (event: StreamEvent) => {
      if (terminal) return;
      await writeFrame(res,`data: ${JSON.stringify(event)}\n\n`,controller.signal);
      if (event.type === 'finish' || event.type === 'error') terminal = true;
    };
    try {
      await emit({type:'start',requestId:input.requestId,provider:input.provider,model:providers.model(input.provider)});
      const stream = await providers.stream(input,controller.signal);
      for await (const chunk of stream) {
        clearTimeout(firstTimer); clearTimeout(idleTimer);
        idleTimer = setTimeout(() => expire('idle_timeout','The provider stopped sending data. Partial output is preserved; retry explicitly.'),config.IDLE_MS);
        const normalized = normalizeChunk(chunk);
        if (normalized.reasoning) await emit({type:'reasoning_delta',requestId:input.requestId,text:normalized.reasoning});
        if (normalized.answer) { answer += normalized.answer; await emit({type:'answer_delta',requestId:input.requestId,text:normalized.answer}); }
        if (normalized.reason) reason = normalized.reason;
        if (normalized.usage) usage = normalized.usage;
      }
      // An aborted SDK iterator may end normally, so check the signal again.
      controller.signal.throwIfAborted();
      if (!reason) throw new StreamFailure('unexpected_end','The provider stream ended without a final result. Retry explicitly.');
      if (!answer.trim() && reason === 'stop') throw new StreamFailure('empty_answer','The model finished without an answer. Retry explicitly.');
      await emit({type:'finish',requestId:input.requestId,outcome:reason === 'stop' ? 'completed' : reason === 'content_filter' ? 'blocked' : 'incomplete',reason,usage});
    } catch (error) {
      const failure = safeError(deadline ?? error);
      reason = controller.signal.aborted && !deadline ? 'stopped' : failure.code;
      // A deadline has already aborted upstream; a small terminal frame can still end the browser response.
      if (!res.destroyed && !terminal) { terminal = true; res.write(`data: ${JSON.stringify({type:'error',requestId:input.requestId,...failure})}\n\n`); }
    } finally {
      clearTimeout(firstTimer); clearTimeout(idleTimer); clearTimeout(overallTimer); clearInterval(heartbeat);
      controller.abort(); res.off('close',disconnected); active.delete(input.provider);
      res.end();
      log({requestId:input.requestId,provider:input.provider,durationMs:Date.now()-started,finishReason:reason ?? 'unknown',usage});
    }
  };
}
