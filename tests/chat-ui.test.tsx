// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { App } from '../src/client/App';
afterEach(() => {cleanup();vi.unstubAllGlobals();});
it('stops partial output and retries the same user turn without duplicating it', async () => {
  const bodies: {requestId:string;messages:unknown[]}[] = [];
  vi.stubGlobal('fetch',vi.fn(async (_url,init:RequestInit) => {
    const body = JSON.parse(init.body as string); bodies.push(body);
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({type:'answer_delta',requestId:body.requestId,text:bodies.length === 1 ? 'Partial answer' : 'Final answer'})}\n\n`));
      if (bodies.length > 1) {controller.enqueue(encoder.encode(`data: ${JSON.stringify({type:'finish',requestId:body.requestId,outcome:'completed',reason:'stop'})}\n\n`));controller.close();}
      else init.signal?.addEventListener('abort',() => controller.error(new DOMException('Aborted','AbortError')));
    }}),{headers:{'content-type':'text/event-stream'}});
  }));
  const user = userEvent.setup(); render(<App/>);
  await user.type(screen.getByRole('textbox'),'Explain const');
  await user.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText('Partial answer');
  await user.click(screen.getByRole('button',{name:'Stop response'}));
  expect(screen.getByText('Partial answer')).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Retry last turn'}));
  await screen.findByText('Final answer');
  expect(screen.getAllByText('Explain const')).toHaveLength(1);
  expect(bodies[1].messages).toEqual([{role:'user',content:'Explain const'}]);
  expect(bodies[0].requestId).not.toBe(bodies[1].requestId);
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus());
});
