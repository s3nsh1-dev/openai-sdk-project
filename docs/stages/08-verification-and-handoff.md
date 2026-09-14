# Stage 8: Verification and handoff

Goal: verify the full local workflow, teach how to test nondeterministic providers, and leave a reproducible project. Prerequisite: Stage 7, commit `8145cb0`.

## Build order and walkthrough

1. Add the Playwright fixture server in `tests/browser/server.ts`. It runs the real Express handler and SDK, with both provider transports pointed at a controlled local HTTP server. It ignores `.env` and uses a synthetic key.
2. Add desktop and mobile workflows in `tests/browser/chat.spec.ts`. They exercise built browser assets, keyboard input, safe Markdown, Copy, provider locking, missing-key selection, Stop, Retry, partial failures, reasoning-only limits, scrolling, and viewport fit.
3. Extend deterministic tests for heartbeat deadlines, safe HTTP error mapping, log redaction, invalid JSON, and independent provider slots. Network guards prevent real model requests during tests.
4. Review the implementation independently, add regression tests for findings, and re-review the fixes. The two parser findings are explained in ISSUE-005.
5. Add `.github/workflows/ci.yml`, format the source with Prettier for study, and complete architecture, protocol, decisions, learning path, README, and handoff documents.
6. Run the full check command and separate live Ollama smoke command. Keep cloud generation explicit.

Changed files include the browser fixtures/configuration, CI, security tests, expanded transport/reliability tests, the two client parser fixes, the scrolling race fix, formatting configuration, formatted source, and the completed learning documentation.

## Verification

The final checkpoint uses `npm run check`: lint, type checking, 43 deterministic tests, a production build, and 18 Playwright cases across desktop and mobile. The exact final result and milestone hashes are recorded in [handoff](../handoff.md). Browser screenshots are generated under ignored `test-results/` for visual inspection. `npm start` was separately checked for the built HTML, health endpoint, and public model configuration. A private comparison confirmed the configured key was absent from tracked source and build artifacts without printing it.

`npm run smoke:local` verified a direct answer, a follow-up returning 7, separately identified reasoning that completed, and cancellation during provider output. The cancellation log recorded `stopped`. The model's tuning remained unchanged. These observations describe a live run, while timeout, backpressure, errors, and repeatable lifecycle behavior are tested with fixtures.

Gemini is implemented and fixture-tested with the requested `gemini-3.8-flash`. The real key is present in ignored `.env`; no live cloud generation was made. Run `npm run smoke:gemini` only when explicitly choosing that cloud verification. It performs one request and can consume quota. CI never invokes it. CI configuration is checked in; a hosted CI run has not occurred because this branch has not been pushed.

## Exercises and extension boundaries

Break the fake server's finish reason and observe both server and browser terminal checks. Add a test for a provider HTTP error before changing its message mapping. Trace why heartbeat comments do not prevent a provider inactivity timeout.

For a later persistence stage, first decide which completed and incomplete attempts should be stored and how deletion works. Do not add accounts, tools, retrieval, media, or public hosting to this v1 checkpoint. Future work uses a new descriptive branch and a verified commit per stage, following AGENTS.md.

Milestone: `feat(stage-8): verify browser workflows and complete learning handoff`. The following documentation commit records its actual hash. Related findings: [ISSUE-005](../issues-and-solutions.md#issue-005-browser-terminal-events-needed-correlation-before-parser-state), [ISSUE-006](../issues-and-solutions.md#issue-006-playwrights-installed-browser-revision-did-not-match), [ISSUE-007](../issues-and-solutions.md#issue-007-automatic-approval-review-temporarily-blocked-a-live-check), [ISSUE-009](../issues-and-solutions.md#issue-009-disabled-option-assertion-did-not-reflect-native-selection), and [ISSUE-008](../issues-and-solutions.md#issue-008-browser-locator-confused-label-text-with-accessible-name).

The repeated scroll test exposed and verified a queued-effect race fix. See [ISSUE-010](../issues-and-solutions.md#issue-010-a-queued-auto-scroll-overrode-the-readers-position). Five desktop and five mobile repetitions passed after the fix.
