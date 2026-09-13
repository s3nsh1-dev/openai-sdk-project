# Project instructions

## Start here

Read [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) before planning or implementing changes. It contains the approved scope, architecture, stages, verification requirements, and issues-and-solutions documentation requirement. Do not rely on access to the original chat.

When present, also read `docs/handoff.md`, `architecture.md`, and the current stage document before continuing development. Inspect the actual files and Git status to establish what has already been implemented.

## Working agreements

- This is a beginner learning project. Use readable TypeScript, focused modules, and explanations of important choices. Follow the agreed React + Vite, Express, and OpenAI SDK architecture.
- When asked to implement v1, work through stages 1–8 in order. Continue through routine stage transitions without asking for approval again. Do not treat this file alone as a request to begin coding.
- Use Ollama `qwen3.5:4b` for development. Preserve its existing model tuning. Never fall back automatically to Gemini.
- Keep keys on the server and out of source control, browser bundles, fixtures, and logs. Gemini generation must be explicitly selected or tested; routine tests and CI must not consume its quota.
- Scope v1 to personal, local text chat with in-memory history. Persistence, accounts, tools, retrieval, media, and public deployment are later stages.
- Write stage documentation alongside implementation. Explain what to build first, how the pieces connect, and why the decisions were made.
- Maintain `docs/issues-and-solutions.md` as development happens. Record real symptoms, investigations, failed approaches, root causes, solutions, verification, lessons, and unresolved limitations. Link issues from their stage documents. Never invent entries or claim unverified fixes.
- Each stage needs a runnable checkpoint, relevant checks, updated documentation, and an accurately recorded Git milestone. Do not overwrite unrelated user changes or fabricate commit history.
- Run the checks relevant to each change before claiming success. Before final handoff, run linting, type checking, deterministic tests, browser checks, and the production build once these commands exist.
- Distinguish fixture-tested behavior from live-provider verification. A missing Gemini key means live verification is pending, not passed.
- Keep `docs/handoff.md` and the plan checklist current so another session can resume. Record the next concrete action and any real blockers.

## Git workflow

- Start implementation on a descriptive feature branch, never directly on `main` or `master`. Inspect the current branch and uncommitted work first; preserve unrelated changes.
- Use one milestone commit per verified stage. Additional focused fix or documentation commits are welcome. Use descriptive messages such as `feat(stage-3): stream local answers over SSE`.
- Commit source, relevant tests, and stage documentation together. Record actual hashes in the next checkpoint or handoff; never invent history or mark failed checks as passed.
- Before committing, inspect the staged diff and check for secrets and generated artifacts. Do not commit `.env`, dependencies, build output, or test reports.
- Do not amend, rebase, reset, force-push, merge, or push without user authorization. Leave the implementation branch available for review by default.
- If permissions prevent a Git operation, use the approved permission mechanism and record any remaining limitation.

## Commands

Read `package.json` before running commands. Setup: `npm ci`. Development: `npm run dev`. Verification: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Production: `npm start`. Stage 8 adds the browser test configuration for `npm run test:browser` and the aggregate `npm run check`. Live provider checks remain separate and explicit.
