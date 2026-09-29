# Local chat

A local JavaScript tutor built with React, TypeScript, Express, and the OpenAI SDK. It supports streaming answers, optional local reasoning, multi-turn chat, Markdown, Stop, Retry, and explicit Gemini selection.

Local chat uses Ollama `qwen3.5:4b` by default and preserves existing model tuning. Gemini defaults to `gemini-3.8-flash` and never runs as an automatic fallback.

## Setup

Use Node 22.12 or newer; CI uses Node 24. Run commands from this project's root directory.

```sh
npm ci
cp .env.example .env
npm run dev
```

If `.env` already exists, edit it instead of copying over it. Keep Ollama running at `http://127.0.0.1:11434` with `qwen3.5:4b` installed. `ollama list` checks installed models; `ollama serve` starts Ollama if it is not already managed by your system. Installation or model downloads are separate setup steps described by [Ollama](https://docs.ollama.com/quickstart).

Open http://127.0.0.1:5173. Vite proxies `/api` to Express on port 3001. Both bind to loopback. If you change `PORT`, also update the proxy target in `vite.config.ts`.

Type a question and press Enter. Shift+Enter inserts a newline. Local thinking is off initially. Gemini instead offers a thought-summary checkbox; Gemini thinks internally even when summaries are unchecked. Each provider remembers its own checkbox preference until New chat.

Switch providers between turns using the Provider selector. During generation, use Stop first. Selection preserves the conversation and any unsent draft, and makes no generation request. Send and Retry use the selected provider; Retry replaces the latest unsuccessful attempt without duplicating its question. Each response shows its provider and model.

Both providers receive the same completed conversation history plus the current question. Sending or retrying with Gemini sends that text to Google, including earlier Local exchanges. Reasoning and failed, incomplete, or stopped answers are excluded from future context. Unsuccessful attempts stay visible until replaced by Retry or cleared. New chat clears the conversation, resets Local and both checkbox preferences, and clears the draft. Refreshing also clears history.

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

The Gemini endpoint is fixed on the server. A request cannot supply a URL, key, or system message. The app does not change Ollama GPU, thread, sampling, or context settings. Local output uses the remaining 4,096-token context after estimated input and a 256-token safety margin. The input allowance still reserves at least 1,024 output tokens. Gemini's output cap is 4,096. See [architecture](architecture.md) for the conservative input estimate and trust boundaries.

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

The application is intended for local use and has no authentication or persistent storage.

## Troubleshooting

- A busy response means another tab is generating with that provider. Stop it or wait, then retry.
- An input-budget error means the conservative estimate is too large for the selected provider. Local has a smaller budget than Gemini, so a long Gemini conversation may not fit after switching to Local. The transcript remains visible; select Gemini and explicitly Retry, shorten the message, or start a new chat. History is not silently trimmed.
- An incomplete reasoning-only response can mean the output budget was spent before an answer. Disable Local thinking or ask a shorter question.
- A missing model or provider connection error needs the local model/server or server configuration checked. Gemini failures never trigger Local, and Local failures never trigger Gemini.
- A Playwright executable error usually needs `npx playwright install chromium` for the installed package version.

## Technical documentation

- [Architecture](architecture.md): components, request handling, cancellation, and context limits.
- [Streaming protocol](docs/protocol.md): request validation, SSE events, and error handling.
- [Design decisions](docs/decisions.md): implementation choices and trade-offs.
