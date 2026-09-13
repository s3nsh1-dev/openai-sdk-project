# Stage 6: Cancellation and failure recovery

Goal: recover from slow, failed, stopped, and overlapping requests without losing partial output. Prerequisite: Stage 5, commit `942d8b9`.

Build the deadline and concurrency logic in `src/server/chat.ts` first, then safe error mapping in `errors.ts`, backpressure in `sse.ts`, and browser Stop/Retry in `App.tsx`. Integration tests use delayed HTTP fixtures so they can observe upstream connection closure.

The browser owns an AbortController per request. Stop first marks the matching attempt stopped, then aborts fetch. Express sees response closure and aborts the SDK request. New chat also stops active work before clearing state. Every handler cleans timers, ends the response, and frees the provider slot in `finally`. The client request reference includes its ID so an old request's cleanup cannot clear a newer request.

Retry replaces the latest unsuccessful attempt with a fresh request ID and the same user text. It builds history from completed earlier exchanges. No duplicate user message is added; nothing retries automatically. The prior partial output remains until the user chooses Retry or New chat.

The first-activity deadline is 120 seconds, idle deadline 60 seconds after provider chunks, and overall deadline 300 seconds. Heartbeat comments every 15 seconds keep transport activity separate from model activity. Awaiting response drain pauses the upstream iterator under backpressure. SDK retries are disabled. One request per provider can run in this application process, and a rolling application guard allows ten accepted chat requests per minute. These are local application limits, not Gemini account quota claims.

Error mapping exposes safe messages for quota, credentials, unavailable models, malformed streams, unexpected ends, empty answers, connection failure, and deadlines. HTTP validation and busy errors happen before streaming. Once SSE begins, an error is a terminal event. Logs include only request ID, provider, duration, finish reason, and available usage.

Verification: 28 deterministic tests passed before adding the separate drain-listener check; the full Stage 6 checkpoint has 29. Lint and type checking passed. Tests prove upstream closure, slot reuse, deadline behavior, quota mapping, no retry, partial preservation, and retry without duplication. Run `npm run dev` to try Stop and Retry.

Exercise: explain why `AbortController.abort()` alone is insufficient to prevent a late UI update. See [ISSUE-004](../issues-and-solutions.md#issue-004-an-abort-can-look-like-an-ordinary-end-of-iteration).

Milestone: `feat(stage-6): add cancellation deadlines and failure recovery`. The user's Gemini model change to `gemini-3.8-flash` is included in configuration and the plan; `.env` remains untouched and ignored.
