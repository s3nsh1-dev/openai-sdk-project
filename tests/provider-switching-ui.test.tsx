// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { App } from '../src/client/App';
import type { ChatRequest, StreamEvent } from '../src/shared/protocol';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Control only the HTTP boundary. App, its reducer, and the SSE parser stay real.
function setup(
  options: { geminiAvailable?: boolean; httpError?: string } = {},
) {
  const requests: ChatRequest[] = [];
  const streams: {
    emit: (event: StreamEvent) => void;
    start: (model?: string) => void;
    finish: () => void;
  }[] = [];
  const models = { local: 'qwen3.5:4b', gemini: 'gemini-3.8-flash' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init: RequestInit) => {
      if (url === '/api/config')
        return Response.json({
          providers: {
            local: { name: 'Local', model: models.local, available: true },
            gemini: {
              name: 'Gemini',
              model: models.gemini,
              available: options.geminiAvailable ?? true,
            },
          },
          limits: {
            local: { context: 4096, output: 3840, input: 2816 },
            gemini: { output: 4096, input: 24000 },
          },
        });
      const input: ChatRequest = JSON.parse(init.body as string);
      requests.push(input);
      if (options.httpError)
        return Response.json({ error: options.httpError }, { status: 413 });
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            const emit = (event: StreamEvent) =>
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
            streams.push({
              emit,
              start(model = models[input.provider]) {
                emit({
                  type: 'start',
                  requestId: input.requestId,
                  provider: input.provider,
                  model,
                });
              },
              finish() {
                emit({
                  type: 'finish',
                  requestId: input.requestId,
                  outcome: 'completed',
                  reason: 'stop',
                });
                controller.close();
              },
            });
            // Deliberately allow late delivery after abort to exercise request correlation.
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  return {
    user,
    requests,
    streams,
    selector: () => screen.getByRole('combobox', { name: 'Provider' }),
    async send(text: string) {
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), text);
      await user.click(screen.getByRole('button', { name: 'Send message' }));
    },
    async complete(
      index: number,
      answer: string,
      reasoning?: string,
      model?: string,
    ) {
      await act(async () => {
        const requestId = requests[index].requestId;
        streams[index].start(model);
        if (reasoning)
          streams[index].emit({
            type: 'reasoning_delta',
            requestId,
            text: reasoning,
          });
        streams[index].emit({ type: 'answer_delta', requestId, text: answer });
        streams[index].finish();
      });
    },
  };
}

it('switches Local → Gemini → Local with shared completed history and separate thinking settings', async () => {
  const chat = setup();
  await chat.user.click(
    screen.getByRole('checkbox', { name: 'Local thinking' }),
  );
  await chat.send('First question');
  await chat.complete(0, 'Local answer', 'Local reasoning');
  await chat.user.selectOptions(chat.selector(), 'gemini');
  expect(
    screen.getByText(/completed conversation history to Google/),
  ).toBeVisible();
  expect(
    screen.getByRole('checkbox', { name: 'Gemini thought summaries' }),
  ).not.toBeChecked();
  await chat.user.click(
    screen.getByRole('checkbox', { name: 'Gemini thought summaries' }),
  );
  await chat.send('Second question');
  await chat.complete(
    1,
    'Cloud answer',
    'Cloud summary',
    'server-confirmed-gemini',
  );
  await chat.user.selectOptions(chat.selector(), 'local');
  expect(
    screen.getByRole('checkbox', { name: 'Local thinking' }),
  ).toBeChecked();
  await chat.send('Third question');
  await chat.complete(2, 'Last local answer');

  expect(
    chat.requests.map(({ provider, thinking, messages }) => ({
      provider,
      thinking,
      messages,
    })),
  ).toEqual([
    {
      provider: 'local',
      thinking: true,
      messages: [{ role: 'user', content: 'First question' }],
    },
    {
      provider: 'gemini',
      thinking: true,
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'Local answer' },
        { role: 'user', content: 'Second question' },
      ],
    },
    {
      provider: 'local',
      thinking: true,
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'Local answer' },
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Cloud answer' },
        { role: 'user', content: 'Third question' },
      ],
    },
  ]);
  const turns = screen.getAllByRole('region', { name: 'Chat turn' });
  expect(within(turns[0]).getByText('Local · qwen3.5:4b')).toBeVisible();
  expect(
    within(turns[1]).getByText('Gemini · server-confirmed-gemini'),
  ).toBeVisible();
  expect(within(turns[2]).getByText('Local · qwen3.5:4b')).toBeVisible();
  await chat.user.selectOptions(chat.selector(), 'gemini');
  expect(
    screen.getByRole('checkbox', { name: 'Gemini thought summaries' }),
  ).toBeChecked();
});

it('changes selection without generation or losing the draft and resets both preferences on New chat', async () => {
  const chat = setup();
  await chat.user.click(
    screen.getByRole('checkbox', { name: 'Local thinking' }),
  );
  await chat.send('Existing turn');
  await chat.complete(0, 'Existing answer');
  await chat.user.type(screen.getByRole('textbox'), 'Unsent draft');
  await chat.user.selectOptions(chat.selector(), 'gemini');
  await chat.user.click(
    screen.getByRole('checkbox', { name: 'Gemini thought summaries' }),
  );
  expect(chat.requests).toHaveLength(1);
  expect(screen.getByRole('textbox')).toHaveValue('Unsent draft');
  expect(screen.getByText('Existing answer')).toBeVisible();
  await chat.user.click(screen.getByRole('button', { name: 'New chat' }));
  expect(chat.selector()).toHaveValue('local');
  expect(screen.queryAllByRole('region', { name: 'Chat turn' })).toHaveLength(
    0,
  );
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(
    screen.getByRole('checkbox', { name: 'Local thinking' }),
  ).not.toBeChecked();
  await chat.user.selectOptions(chat.selector(), 'gemini');
  expect(
    screen.getByRole('checkbox', { name: 'Gemini thought summaries' }),
  ).not.toBeChecked();
  expect(chat.requests).toHaveLength(1);
});

it('locks selection during waiting, reasoning, and answering, then allows cross-provider Retry after Stop', async () => {
  const chat = setup();
  await chat.send('Retry this question');
  expect(chat.selector()).toBeDisabled();
  await act(async () => {
    chat.streams[0].start();
    chat.streams[0].emit({
      type: 'reasoning_delta',
      requestId: chat.requests[0].requestId,
      text: 'Old reasoning',
    });
  });
  expect(screen.getByRole('status')).toHaveTextContent('receiving reasoning');
  expect(chat.selector()).toBeDisabled();
  await act(async () =>
    chat.streams[0].emit({
      type: 'answer_delta',
      requestId: chat.requests[0].requestId,
      text: 'Partial local answer',
    }),
  );
  expect(chat.selector()).toBeDisabled();
  await chat.user.click(screen.getByRole('button', { name: 'Stop response' }));
  expect(chat.selector()).toBeEnabled();
  await chat.user.selectOptions(chat.selector(), 'gemini');
  await chat.user.click(
    screen.getByRole('checkbox', { name: 'Gemini thought summaries' }),
  );
  await chat.user.click(
    screen.getByRole('button', { name: 'Retry last turn' }),
  );
  expect(chat.requests[1]).toMatchObject({
    provider: 'gemini',
    thinking: true,
    messages: [{ role: 'user', content: 'Retry this question' }],
  });
  expect(chat.requests[1].requestId).not.toBe(chat.requests[0].requestId);
  expect(screen.getAllByText('Retry this question')).toHaveLength(1);
  expect(screen.queryByText('Partial local answer')).not.toBeInTheDocument();
  await act(async () => {
    chat.streams[0].emit({
      type: 'answer_delta',
      requestId: chat.requests[0].requestId,
      text: 'Late local answer',
    });
    chat.streams[0].finish();
  });
  expect(screen.queryByText(/Late local answer/)).not.toBeInTheDocument();
  expect(chat.selector()).toBeDisabled();
  await chat.complete(1, 'Gemini retry answer');
  expect(chat.selector()).toBeEnabled();
  expect(screen.getByText('Gemini · gemini-3.8-flash')).toBeVisible();
});

it.each(['failed', 'incomplete'] as const)(
  'allows switching and Retry after a %s response',
  async (status) => {
    const chat = setup();
    await chat.send('Failed question');
    await act(async () => {
      chat.streams[0].start();
      chat.streams[0].emit({
        type: 'answer_delta',
        requestId: chat.requests[0].requestId,
        text: 'Excluded partial output',
      });
      chat.streams[0].emit(
        status === 'failed'
          ? {
              type: 'error',
              requestId: chat.requests[0].requestId,
              code: 'provider_unavailable',
              message: 'Provider unavailable',
            }
          : {
              type: 'finish',
              requestId: chat.requests[0].requestId,
              outcome: 'incomplete',
              reason: 'length',
            },
      );
    });
    expect(chat.selector()).toBeEnabled();
    await chat.user.selectOptions(chat.selector(), 'gemini');
    await chat.user.click(
      screen.getByRole('button', { name: 'Retry last turn' }),
    );
    expect(chat.requests[1]).toMatchObject({
      provider: 'gemini',
      thinking: false,
      messages: [{ role: 'user', content: 'Failed question' }],
    });
    await chat.complete(1, 'Recovered');
    expect(screen.getAllByText('Failed question')).toHaveLength(1);
  },
);

it('keeps the attempted provider label and selection usable after a pre-stream rejection', async () => {
  const chat = setup({ httpError: 'Conversation exceeds the input budget.' });
  await chat.user.selectOptions(await screen.findByRole('combobox'), 'gemini');
  await chat.send('Rejected question');
  await screen.findByText('Conversation exceeds the input budget.');
  expect(screen.getByText('Gemini · gemini-3.8-flash')).toBeVisible();
  expect(chat.selector()).toBeEnabled();
  await chat.user.selectOptions(chat.selector(), 'local');
  expect(screen.getByText('Gemini · gemini-3.8-flash')).toBeVisible();
  expect(chat.requests).toHaveLength(1);
});

it('keeps unconfigured Gemini disabled after a completed Local turn', async () => {
  const chat = setup({ geminiAvailable: false });
  await chat.send('Local only');
  await chat.complete(0, 'Local reply');
  expect(chat.selector()).toBeEnabled();
  await chat.user.selectOptions(chat.selector(), 'gemini');
  expect(chat.selector()).toHaveValue('local');
  expect(chat.requests).toHaveLength(1);
});
