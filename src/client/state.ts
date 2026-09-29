import type {
  ChatRequest,
  StreamEvent,
  Usage,
  Message,
} from '../shared/protocol';
export type Status =
  | 'waiting'
  | 'receiving reasoning'
  | 'answering'
  | 'completed'
  | 'stopped'
  | 'incomplete'
  | 'failed';
export type Attempt = {
  requestId: string;
  provider: ChatRequest['provider'];
  model: string;
  user: string;
  answer: string;
  reasoning: string;
  status: Status;
  startedAt: number;
  error?: string;
  usage?: Usage;
};
export function isActive(status: Status) {
  return (
    status === 'waiting' ||
    status === 'receiving reasoning' ||
    status === 'answering'
  );
}
export function newAttempt(
  requestId: string,
  user: string,
  provider: ChatRequest['provider'],
  model: string,
): Attempt {
  return {
    requestId,
    provider,
    model,
    user,
    answer: '',
    reasoning: '',
    status: 'waiting',
    startedAt: Date.now(),
  };
}
export function reduceAttempt(state: Attempt, event: StreamEvent): Attempt {
  if (state.requestId !== event.requestId || !isActive(state.status))
    return state;
  switch (event.type) {
    case 'start':
      return event.provider === state.provider
        ? { ...state, model: event.model }
        : state;
    case 'reasoning_delta':
      return event.text
        ? {
            ...state,
            reasoning: state.reasoning + event.text,
            status: state.answer ? 'answering' : 'receiving reasoning',
          }
        : state;
    case 'answer_delta':
      return event.text
        ? { ...state, answer: state.answer + event.text, status: 'answering' }
        : state;
    case 'finish':
      return {
        ...state,
        status: event.outcome === 'completed' ? 'completed' : 'incomplete',
        usage: event.usage,
        error:
          event.outcome === 'blocked'
            ? 'The provider blocked this response.'
            : event.outcome === 'incomplete'
              ? event.reason === 'length'
                ? 'The response reached its output limit. Reasoning also uses this budget. Ask for a shorter reply or start a new chat.'
                : 'The provider ended this response before completion. Retry explicitly.'
              : undefined,
      };
    case 'error':
      return { ...state, status: 'failed', error: event.message };
  }
}

export function contextMessages(
  attempts: Attempt[],
  nextUser: string,
): Message[] {
  const messages: Message[] = [];
  for (const attempt of attempts) {
    if (attempt.status === 'completed')
      messages.push(
        { role: 'user', content: attempt.user },
        { role: 'assistant', content: attempt.answer },
      );
  }
  return [...messages, { role: 'user', content: nextUser }];
}
