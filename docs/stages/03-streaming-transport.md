# Stage 3: Streaming transport

Goal: display answer text before generation completes. Prerequisite: Stage 2, commit `264e653`.

Build the event contract first in `src/shared/protocol.ts`, then the SDK async iterator in `src/server/provider.ts`, SSE framing in `chat.ts`, and decoding in `src/client/stream.ts`. `App.tsx` appends answer deltas as they arrive. The temporary non-streaming implementation and live script were removed; use Stage 2's commit to study them.

An SDK async iterator yields provider chunks. Those are not guaranteed to correspond to tokens. Express encodes application events as `data: JSON` followed by two newlines. Network reads can split anywhere, including inside a Unicode character. The streaming TextDecoder preserves UTF-8 fragments; eventsource-parser reconstructs SSE frames. Multiple frames may arrive in one read. A POST with a JSON body uses `fetch`, because browser EventSource cannot send this POST body.

A finish event arrives only after the provider stream ends, allowing a trailing usage-only chunk to be read. A stream ending without a finish reason fails. The browser likewise requires an application terminal event. Request IDs accompany all events.

Verification: 10 deterministic tests passed, including one-byte UTF-8 reads, multiple frames per read, malformed events, premature end, and SDK-to-Express streaming. Lint and type checking passed. Run `npm run dev` and ask a question to see incremental output. Stage 6 will add deadlines, heartbeats, and backpressure handling.

Exercise: change the read sizes in `tests/stream.test.ts`. Explain why parsing each `reader.read()` result as JSON fails.

Milestone: `feat(stage-3): stream local answers over SSE`. No new implementation difficulty occurred in this stage; see the existing [journal](../issues-and-solutions.md).
