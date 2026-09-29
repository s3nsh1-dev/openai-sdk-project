import { expect, it } from 'vitest';
import { newAttempt, reduceAttempt } from '../src/client/state';
it('accepts direct answers and rejects late events for another request', () => {
  const waiting = newAttempt('r', 'Hi', 'local', 'qwen3.5:4b');
  expect(
    reduceAttempt(waiting, {
      type: 'answer_delta',
      requestId: 'old',
      text: 'wrong',
    }),
  ).toEqual(waiting);
  const answer = reduceAttempt(waiting, {
    type: 'answer_delta',
    requestId: 'r',
    text: 'Hello',
  });
  expect(answer.status).toBe('answering');
  expect(answer.reasoning).toBe('');
  const complete = reduceAttempt(answer, {
    type: 'finish',
    requestId: 'r',
    outcome: 'completed',
    reason: 'stop',
  });
  expect(complete.status).toBe('completed');
  expect(
    reduceAttempt(complete, {
      type: 'answer_delta',
      requestId: 'r',
      text: 'late',
    }),
  ).toEqual(complete);
});
it('preserves reasoning-only output as incomplete', () => {
  let state = newAttempt('r', 'Hi', 'local', 'qwen3.5:4b');
  state = reduceAttempt(state, {
    type: 'reasoning_delta',
    requestId: 'r',
    text: 'A thought summary',
  });
  expect(state.status).toBe('receiving reasoning');
  state = reduceAttempt(state, {
    type: 'finish',
    requestId: 'r',
    outcome: 'incomplete',
    reason: 'length',
  });
  expect(state.status).toBe('incomplete');
  expect(state.reasoning).toBe('A thought summary');
  expect(state.answer).toBe('');
});

it('records the selected provider before output and the server-confirmed model on start', () => {
  const waiting = newAttempt('r', 'Hi', 'gemini', 'configured-model');
  expect(waiting).toMatchObject({
    provider: 'gemini',
    model: 'configured-model',
  });
  const started = reduceAttempt(waiting, {
    type: 'start',
    requestId: 'r',
    provider: 'gemini',
    model: 'server-model',
  });
  expect(started).toMatchObject({ provider: 'gemini', model: 'server-model' });
  expect(waiting.model).toBe('configured-model');
});

it('ignores old start and answer events after Stop or a cross-provider replacement', () => {
  const stopped = {
    ...newAttempt('old', 'Hi', 'local', 'qwen3.5:4b'),
    status: 'stopped' as const,
  };
  const replacement = newAttempt('new', 'Hi', 'gemini', 'gemini-3.8-flash');
  for (const state of [stopped, replacement]) {
    expect(
      reduceAttempt(state, {
        type: 'start',
        requestId: 'old',
        provider: 'local',
        model: 'late-model',
      }),
    ).toEqual(state);
    expect(
      reduceAttempt(state, {
        type: 'answer_delta',
        requestId: 'old',
        text: 'Late local answer',
      }),
    ).toEqual(state);
  }
});
