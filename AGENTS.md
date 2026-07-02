# Repository Guidelines

## Project Structure & Module Organization

This is an npm workspace monorepo for a Mastra-powered trading agent and Electron desktop shell.

- `apps/agent-server/src/mastra/` contains the Mastra runtime: `agents/`, `tools/`, `workflows/`, and `index.ts` server wiring.
- `apps/desktop/src/` contains the Electron main process. `apps/desktop/loading.html` is the local splash screen shown while the agent server starts.
- `packages/shared/src/` contains shared Zod schemas and TypeScript types consumed by both apps.
- `docs/plans/` stores project planning notes. Generated outputs such as `.mastra/`, `dist/`, databases, logs, and archives should remain untracked.

## Build, Test, and Development Commands

- `npm install` installs workspace dependencies from the root lockfile.
- `npm run dev:agent` starts `mastra dev` and Mastra Studio for `apps/agent-server`.
- `npm run dev:desktop` or `npm start` builds and launches the Electron desktop app.
- `npm run restart` runs `restart-dev.sh` for a one-command local restart.
- `npm run build -w trading-agent` compiles the Electron app TypeScript.
- `npm run build -w @trading-agent/shared` compiles shared schemas/types.
- `npm run build -w agent-server` builds the Mastra server.
- `npm run pack -w trading-agent` creates an unpacked Electron package; `npm run dist -w trading-agent` creates macOS distributables.

## Coding Style & Naming Conventions

Use TypeScript with `strict` mode. Follow existing two-space indentation, semicolons, and single quotes where practical. Name files by role in kebab case, such as `market-data-tool.ts` or `trading-workflow.ts`. Prefer named exports for shared types, tools, agents, and workflows. Keep runtime schemas in `packages/shared` when multiple workspaces need the same contract.

## Testing Guidelines

No automated test runner is currently configured. Before opening a PR, run the relevant workspace build commands above. When adding tests, colocate them near the code as `*.test.ts` or `*.spec.ts`, and add an npm `test` script for the affected workspace. For tools that call external APIs, mock network responses and cover validation/error paths.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits with scopes, for example `feat(server): enable CORS for localhost:3000` and `feat(desktop): hide title bar`. Keep commits focused and use scopes like `agent`, `server`, `desktop`, `shared`, or `dx`.

PRs should include a short summary, test/build results, linked issues when applicable, and screenshots or recordings for desktop UI changes. Note any new environment variables or migration steps.

## Security & Configuration Tips

Copy `.env.example` to `.env` locally and provide `DEEPSEEK_API_KEY`; optionally set `MASTRA_PLATFORM_ACCESS_TOKEN` for observability. Never commit `.env`, local database files, Mastra runtime output, logs, or packaged app archives.
