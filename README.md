# Local chat lab

A local JavaScript tutor built with React, TypeScript, Express, and the OpenAI SDK. It supports streaming answers, optional local reasoning, multi-turn chat, Markdown, Stop, Retry, and explicit Gemini selection.

Everyday development uses Ollama `qwen3.5:4b`. The app preserves existing model tuning. Gemini defaults to the user's selected `gemini-3.8-flash` and never runs as an automatic fallback.

## Setup

Use Node 22.12 or newer; Node 24 is used in CI and was used for development. Run commands from this project's root directory.

```sh
npm ci
cp .env.example .env
npm run dev
```

If `.env` already exists, edit it instead of copying over it. Keep Ollama running at `http://127.0.0.1:11434` with `qwen3.5:4b` installed. `ollama list` checks installed models; `ollama serve` starts Ollama if it is not already managed by your system. Installation or model downloads are separate setup steps described by [Ollama](https://docs.ollama.com/quickstart).

Open http://127.0.0.1:5173. Vite proxies `/api` to Express on port 3001. Both bind to loopback. If you change `PORT`, also update the proxy target in `vite.config.ts`.

Type a question and press Enter. Shift+Enter inserts a newline. Local thinking is off initially. Provider selection locks after the first turn; New chat clears the conversation and resets Local. Refreshing also clears history. Only completed exchanges become future context; failed, incomplete, and stopped attempts stay visible until replaced by Retry or cleared.

## Configuration

All variables are server-only. Never prefix keys with `VITE_`. `.env` is ignored by Git. Configuration availability does not imply successful provider connectivity or usable account quota.

| Variable | Default or purpose |
|---|---|
| `PORT` | 3001, loopback application server |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` |
| `OLLAMA_MODEL` | `qwen3.5:4b` |
| `GEMINI_API_KEY` | Empty disables Gemini; keep the real value only in `.env` |
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `FIRST_ACTIVITY_MS` | 120000, deadline for first provider chunk |
| `IDLE_MS` | 60000, deadline between provider chunks |
| `OVERALL_MS` | 300000, entire request deadline |
| `RATE_LIMIT` | 10 accepted chat requests per rolling minute |

The Gemini endpoint is fixed on the server. A request cannot supply a URL, key, or system message. The app does not change Ollama GPU, thread, sampling, or context settings. Its local output cap is 1,024 tokens. Gemini's output cap is 4,096. See [architecture](architecture.md) for the conservative input estimate and trust boundaries.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite and Express with automatic reload |
| `npm run lint` | ESLint checks |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Deterministic unit, HTTP integration, and React tests |
| `npm run test:watch` | Rerun deterministic tests while editing |
| `npm run build` | Build browser and server |
| `npm start` | Serve the build at http://127.0.0.1:3001 |
| `npm run test:browser` | Playwright against built client and fake provider server |
| `npm run check` | Lint, types, deterministic tests, build, and browser checks |
| `npm run format` | Format source, tests, scripts, and configuration |
| `npm run format:check` | Check formatting without edits |
| `npm run smoke:local` | Explicit live Ollama streaming, context, reasoning, and cancellation checks |
| `npm run smoke:gemini` | Explicit single live Gemini request; may consume cloud quota |

Install the browser binary once before running browser checks:

```sh
npx playwright install chromium
npm run check
```

On a Linux machine missing browser system libraries, use `npx playwright install --with-deps chromium`. CI uses this command on a fresh runner.

`npm test` uses a network guard that permits only temporary loopback fixture servers. Browser tests ignore `.env`, use synthetic keys and a local fake OpenAI-compatible server for both provider choices, and block external browser requests. CI never invokes either smoke command and has no provider key. Test reports live in ignored `test-results/`.

To run a production build locally:

```sh
npm run build
npm start
```

There is no public deployment in v1. The application has no authentication or persistent storage.

## Troubleshooting and learning

- A busy response means another tab is generating with that provider. Stop it or wait, then retry.
- An input-budget error means the conservative estimate is too large. Shorten the message or start a new chat. History is not silently trimmed.
- An incomplete reasoning-only response can mean the output budget was spent before an answer. Disable Local thinking or ask a shorter question.
- A missing model or provider connection error needs the local model/server or server configuration checked. Gemini failures never trigger Local, and Local failures never trigger Gemini.
- A Playwright executable error usually needs `npx playwright install chromium` for the installed package version.

Read [the learning path](docs/learning-path.md), [protocol](docs/protocol.md), [decisions](docs/decisions.md), and [issues journal](docs/issues-and-solutions.md). [Handoff](docs/handoff.md) records actual checks and remaining live-provider limitations. [The implementation plan](IMPLEMENTATION_PLAN.md) and [AGENTS.md](AGENTS.md) govern future stages and Git workflow.
