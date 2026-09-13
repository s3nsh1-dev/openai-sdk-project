import type { ChatRequest } from '../shared/protocol';
import { SYSTEM_PROMPT } from './prompt';
// One UTF-8 byte per estimated token intentionally overestimates typical text.
// This is an application guard, not an exact Qwen tokenizer.
export function estimateInput(messages: ChatRequest['messages']) {
  return Buffer.byteLength(SYSTEM_PROMPT, 'utf8') + 16 + messages.reduce((sum, message) => sum + Buffer.byteLength(message.content, 'utf8') + 16, 0);
}
export function inputBudget(provider: ChatRequest['provider']) { return provider === 'local' ? 4096 - 1024 - 256 : 24000; }
