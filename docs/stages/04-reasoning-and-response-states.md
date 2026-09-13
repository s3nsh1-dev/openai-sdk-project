# Stage 4: Reasoning and response states

Goal: display separately identified reasoning while treating answer text and completion status independently. Prerequisite: Stage 3, commit `369413a`.

Build normalization in `src/server/normalize.ts` before adding the reducer in `src/client/state.ts`, then connect the toggle and panel in `App.tsx`. Provider-compatible fields are runtime data, even when the SDK's types omit them. The normalizer accepts `reasoning` and `reasoning_content`; when both exist it prefers `reasoning`. It never guesses markers inside answer text. Both reasoning and content can be processed from one chunk.

The local toggle is off by default. Off sends `reasoning_effort: 'none'`; on leaves Qwen's default thinking behavior enabled. No sampling or hardware options are changed. Reasoning is display-only text, not conversation history. The panel appears only after nonempty reasoning arrives. A provider summary is not necessarily a full reasoning trace.

The reducer names waiting, receiving reasoning, answering, completed, stopped, incomplete, and failed. Stop is wired in Stage 6. It ignores events for a different request and ignores all updates after a terminal state. A direct answer goes straight from waiting to answering. The elapsed display measures time, not progress.

An output-limit finish remains incomplete even if no answer was generated. A normal stop with no answer becomes `empty_answer`. Malformed chunks and unexpected stream termination have distinct error codes. Partial text remains available.

Verification: 18 deterministic tests passed; lint and type checking passed. Tests cover both reasoning field names, combined fields, empty chunks, usage-only tails, output limits, empty answers, blocked results, missing terminal reasons, malformed chunks, and stale events. Run `npm run dev` and compare thinking off and on.

Exercise: follow a reasoning-only `length` fixture through the normalizer and reducer. Why must an empty answer be checked after examining the finish reason?

Milestone: `feat(stage-4): separate reasoning and response lifecycle states`. The reasoning-only behavior was already a planning observation, not an implementation bug. No new difficulty to add to the [journal](../issues-and-solutions.md).
