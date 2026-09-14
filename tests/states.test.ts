import { expect, it } from 'vitest';
import { newAttempt, reduceAttempt } from '../src/client/state';
it('accepts direct answers and rejects late events for another request', () => {
  const waiting = newAttempt('r', 'Hi');
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
  let state = newAttempt('r', 'Hi');
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
