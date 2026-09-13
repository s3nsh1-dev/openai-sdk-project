# Stage 1: Foundation and project map

Goal: run a React page and an Express health endpoint with validated server configuration. Prerequisites: Node 22.12+, npm, and the approved plan.

## Build order and walkthrough

1. Start with package scripts and TypeScript configuration. One compiler checks both sides, but Vite only follows browser imports.
2. Add `src/server/config.ts`. Zod validates environment values before listening; `publicConfig` deliberately selects safe values.
3. Add `src/server/app.ts` and `index.ts`. Keeping app creation separate from listening lets integration tests start temporary servers.
4. Add `src/client/main.tsx`, `App.tsx`, and CSS. Vite handles browser modules and proxies API calls during development.

Changed files include the package manifest and lockfile, lint/build/test configuration, server/client entry points, `.env.example`, README, architecture, and foundation tests. `.env` remains ignored. Production builds write two directories under `dist`; Express serves the browser build.

## Verification and checkpoint

`npm test`: 3 foundation tests passed. `npm run typecheck`, `npm run lint`, and `npm run build` passed. Tests check health, safe public configuration, and invalid startup values. `npm run dev` is the runnable checkpoint; chat is deliberately absent here.

Milestone: `feat(stage-1): establish React and Express project foundation`. Find it with `git log --oneline --all --grep='feat(stage-1)'`; the next stage records its hash.

Exercise: change a deadline in `.env` to a negative number and observe startup validation, then restore it. Read [ISSUE-001](../issues-and-solutions.md#issue-001-sandbox-blocked-git-and-local-network) for the environment restriction encountered during setup.
