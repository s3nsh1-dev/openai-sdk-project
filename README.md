# Local chat lab

A learning project using React, Express, TypeScript, and the OpenAI SDK. Everyday development uses local Ollama `qwen3.5:4b`. Gemini runs only when explicitly selected.

## Setup

Use Node 22.12 or newer. This project was developed with Node 24.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to Express on port 3001. If you change PORT, update the Vite proxy too. Keep Ollama running locally with `qwen3.5:4b` installed. The app does not alter the model's tuning.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run Vite and Express together |
| `npm run lint` | Check source with ESLint |
| `npm run typecheck` | Check TypeScript boundaries |
| `npm test` | Run deterministic tests with no cloud calls |
| `npm run build` | Build browser and server |
| `npm start` | Serve the build at http://127.0.0.1:3001 |
| `npm run test:browser` | Browser checks, introduced in Stage 8 |
| `npm run check` | Full verification, usable after Stage 8 |

Only server code reads credentials. Never use a `VITE_` variable for a key. `.env` is ignored. `/api/config` describes configured availability, not successful provider connectivity.

Read [the plan](IMPLEMENTATION_PLAN.md), [architecture](architecture.md), and [handoff](docs/handoff.md) for progress and verified limitations. Stage explanations live in [docs/stages](docs/stages).
