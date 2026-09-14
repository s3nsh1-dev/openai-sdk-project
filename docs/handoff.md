# Handoff

V1 is implemented through all eight stages on `implement-v1`. The branch is left unmerged and unpushed for review. The repository started without commits; the following are actual chronological checkpoints.

| Stage | Commit | Working result |
|---|---|---|
| 1 | `de2f3d3` | React/Express foundation and validated configuration |
| 2 | `264e653` | First non-streaming local SDK exchange |
| 3 | `369413a` | Streaming SSE transport |
| 4 | `456d694` | Reasoning normalization and response states |
| 5 | `942d8b9` | Bounded history and safe chat UI |
| 6 | `286ed9a` | Stop, Retry, deadlines, concurrency, and errors |
| 7 | `8145cb0` | Explicit Gemini 3.8 Flash and provider isolation |
| 8 | `2598c5d` | Browser verification, CI, review fixes, and learning handoff |

## Verification completed on September 14, 2026

- `npm run check` passed in full: ESLint, TypeScript, 43 deterministic tests in 12 files, production build, and 18 Playwright cases across desktop and mobile.
- `npm run format:check` passed. Package manifest and lockfile dependencies agree. Documentation file links were checked.
- Desktop and mobile empty-state and answer screenshots were visually inspected. Generated reports and screenshots remain ignored under `test-results/`.
- An independent code review found two client parser defects. Their regression tests failed before the fix and pass afterward; the focused re-review found no remaining defect. A later scrolling race passed five desktop and five mobile repetitions after its fix and a separate scoped review.
- `npm start` served built HTML, `/api/health`, and the expected public model configuration. That verification server was stopped afterward, leaving the default port free for development.
- A private comparison confirmed that the configured Gemini key was absent from tracked source and build artifacts, without printing the key.
- Live `npm run smoke:local` passed direct streaming, follow-up context returning 7, separately identified reasoning with completed output, and cancellation during output. The server recorded `stopped` for cancellation. No original Ollama tuning was changed; all seven recorded values matched on the final recheck.

## Gemini and remaining limits

Gemini uses the user's `gemini-3.8-flash` setting. A real key is present in ignored `.env`; no live Gemini generation was made. It is implemented and fixture-tested, with live verification pending. `npm run smoke:gemini` performs one explicitly selected cloud request and may consume quota. Neither routine checks nor CI run that command.

The CI workflow is committed but has not run on a hosted service because the branch was not pushed. Browser verification uses Chromium desktop and mobile emulation, not physical phones or every browser engine. Input accounting is a conservative byte estimate, not exact Qwen tokenization. History is in browser memory only. Public deployment, persistence, accounts, tools, retrieval, and media remain outside v1.

## Next concrete action

Run `npm run dev` from the project root and open http://127.0.0.1:5173. Start with [the learning path](learning-path.md), using the Stage 2 commit to study the temporary non-streaming version. If cloud verification is wanted, explicitly run `npm run smoke:gemini`. Future implementation starts on a descriptive feature branch and follows the Git and documentation rules in AGENTS.md.

There are no remaining implementation blockers. The [issues journal](issues-and-solutions.md) records the actual setup, parser, browser-test, and scrolling problems and their verification.
