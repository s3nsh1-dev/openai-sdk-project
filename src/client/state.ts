import type { StreamEvent, Usage } from '../shared/protocol';
export type Status = 'waiting' | 'receiving reasoning' | 'answering' | 'completed' | 'stopped' | 'incomplete' | 'failed';
export type Attempt = { requestId: string; user: string; answer: string; reasoning: string; status: Status; startedAt: number; error?: string; usage?: Usage };
export function isActive(status: Status) { return status === 'waiting' || status === 'receiving reasoning' || status === 'answering'; }
export function newAttempt(requestId: string, user: string): Attempt { return {requestId,user,answer:'',reasoning:'',status:'waiting',startedAt:Date.now()}; }
export function reduceAttempt(state: Attempt, event: StreamEvent): Attempt {
  if (state.requestId !== event.requestId || !isActive(state.status)) return state;
  switch (event.type) {
    case 'start': return state;
    case 'reasoning_delta': return event.text ? {...state,reasoning:state.reasoning+event.text,status:state.answer ? 'answering' : 'receiving reasoning'} : state;
    case 'answer_delta': return event.text ? {...state,answer:state.answer+event.text,status:'answering'} : state;
    case 'finish': return {...state,status:event.outcome === 'completed' ? 'completed' : 'incomplete',usage:event.usage,error:event.outcome === 'blocked' ? 'The provider blocked this response.' : event.outcome === 'incomplete' ? 'The response reached an output limit or ended incomplete. Retry or ask a shorter question.' : undefined};
    case 'error': return {...state,status:'failed',error:event.message};
  }
}
