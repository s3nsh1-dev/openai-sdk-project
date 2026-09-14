# Learning path

Start the application, send a small question, then read the source in the same order the request travels. Use the stage commits when you want a smaller working example.

1. [Foundation](stages/01-foundation.md): scripts, TypeScript boundaries, environment configuration, and app startup.
2. [First local exchange](stages/02-first-local-exchange.md): SDK versus API versus model, roles, and the server prompt. Read commit `264e653` for the temporary non-streaming version.
3. [Streaming](stages/03-streaming-transport.md): async iteration, UTF-8, SSE frames, and application events.
4. [Reasoning and states](stages/04-reasoning-and-response-states.md): separate fields, optional usage, incomplete responses, and stale events.
5. [Conversation](stages/05-conversation-and-chat-interface.md): memory, conservative input budgets, Markdown, and interaction.
6. [Recovery](stages/06-cancellation-and-failure-recovery.md): abort propagation, deadlines, backpressure, and explicit retry.
7. [Gemini](stages/07-gemini-and-provider-selection.md): provider-specific configuration and cloud selection.
8. [Verification](stages/08-verification-and-handoff.md): fixtures, browser checks, live checks, CI, and extending the project.

## Concept-to-code-to-test map

| Concept | Read this code | Then this test |
|---|---|---|
| Runtime validation vs TypeScript | `src/shared/protocol.ts`, `src/server/config.ts` | `tests/foundation.test.ts`, `tests/security.test.ts` |
| Server-owned prompt and model | `src/server/provider.ts` | `tests/exchange.test.ts` |
| SSE framing and UTF-8 decoding | `src/server/sse.ts`, `src/client/stream.ts` | `tests/stream.test.ts`, `tests/backpressure.test.ts` |
| Provider normalization | `src/server/normalize.ts` | `tests/provider-stream.test.ts` |
| Lifecycle state and request identity | `src/client/state.ts`, `src/client/App.tsx` | `tests/states.test.ts`, `tests/chat-ui.test.tsx` |
| Explicit context and limits | `src/client/state.ts`, `src/server/budget.ts` | `tests/conversation.test.ts` |
| Safe generated content | `src/client/Markdown.tsx` | `tests/rendering.test.tsx` |
| Deadlines, abort and concurrency | `src/server/chat.ts` | `tests/reliability.test.ts` |
| Provider isolation and quota | `src/server/provider.ts`, `src/server/errors.ts` | `tests/gemini.test.ts` |
| End-to-end browser workflow | `src/client/App.tsx` | `tests/browser/chat.spec.ts` |

## Small glossary

- **SDK**: a client library that sends API requests and parses responses. This app uses the OpenAI SDK with two compatible API endpoints.
- **Model**: the program generating text, such as Qwen or Gemini. The SDK itself does not generate answers.
- **Role**: the source of a message. The server owns system instructions; requests may contain user and assistant messages.
- **Context**: messages supplied to one generation. The model does not automatically remember this browser tab.
- **Token**: a model-specific text unit. A network chunk or SSE event is not necessarily one token.
- **Delta**: new text to append to an existing response.
- **Async iterator**: a loop whose next value may arrive later. Awaiting each write lets the server slow its reads when the browser is slow.
- **SSE**: text frames separated by blank lines. Here they arrive as the response to a JSON POST.
- **AbortSignal**: a cancellation notification shared with an asynchronous operation.
- **Backpressure**: the writer pauses because its output buffer is full.
- **Fixture**: controlled provider behavior used to test success and failure without model cost or unpredictable output.

Use `git show <hash>:<path>` to study an older file without changing your working tree. To run an old milestone, create a separate worktree only after preserving current changes. Historical commands use the dependencies and files from that milestone.

The [issues journal](issues-and-solutions.md) explains what actually went wrong. Read it alongside the stage documents; the failed assumptions are part of the lesson.
