# Stage 2: First local exchange

Goal: follow one complete request from browser to model and back. Prerequisite: Stage 1, commit `de2f3d3`.

Build the shared request schema first, then the server-owned prompt and SDK call, then the POST route and browser form. Changed files: `src/shared/protocol.ts`, `src/server/prompt.ts`, `provider.ts`, `app.ts`, `src/client/App.tsx`, exchange tests, and the temporary live check script.

The SDK is a TypeScript client that builds HTTP requests. Ollama exposes the compatible API; Qwen generates the answer. The server prepends its system instruction, followed by validated user input. The request cannot override the provider URL, credentials, or system role. `reasoning_effort: 'none'` disables local thinking at this checkpoint without overriding sampling or hardware tuning. The response's first choice contains the assistant message.

This stage deliberately waits for one JSON response. Stage 3 replaces it with streaming; this implementation remains in Git history only. Run `npm run dev` and send a short question to use the checkpoint.

Verification: 5 deterministic tests passed; lint and type checking passed. `npx tsx scripts/check-local-exchange.ts` made one live Ollama request through Express and the SDK and verified the answer contained `4`. It made no cloud calls. The fake HTTP server checks server-owned roles, model selection, and preservation of tuning.

Exercise: trace the three roles from schema through prompt construction. Why is `system` accepted inside the server but rejected at the browser boundary?

Milestone: `feat(stage-2): complete the first local SDK exchange`. See [ISSUE-002](../issues-and-solutions.md#issue-002-express-error-handler-arity-and-linting) for the error-middleware lint convention.
