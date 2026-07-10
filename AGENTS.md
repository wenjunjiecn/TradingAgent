# Repository Guidelines

## Project Structure & Module Organization

This is an npm workspace monorepo (managed by Turborepo) for a Mastra-powered trading agent and Electron desktop shell.

### Workspaces

| Workspace | Package name | Path | Description |
|---|---|---|---|
| Agent Server | `@trading-agent/agent-server` | `apps/agent-server` | Mastra runtime: agents, tools, workflows, teams, MCP servers, and custom API routes. |
| Desktop | `@trading-agent/desktop` | `apps/desktop` | Electron + React + Vite desktop shell that embeds the agent server and renders the UI. |
| Shared | `@trading-agent/shared` | `packages/shared` | Shared Zod schemas and TypeScript types consumed by both apps. |
| Playground UI | `@mastra/playground-ui` | `packages/playground-ui` | Local fork of Mastra Playground UI component library (Vite library build). |
| E2E Kitchen Sink | `@trading-agent/e2e-kitchen-sink` | `apps/desktop/e2e/kitchen-sink` | Mastra server used as a fixture backend for Playwright E2E tests. |

### Agent Server (`apps/agent-server/src/mastra/`)

- `agents/` — agent registry and templates (`agent-registry.ts`, `agent-templates.ts`).
- `tools/` — trading tools: market data, fundamentals, news/sentiment, technical analysis, tool factory/registry, and config stores. Includes `__tests__/` with Vitest.
- `workflows/` — trading workflow, collaboration engine, and workflow config store.
- `teams/` — multi-agent team system: chat engine, execution engine, multi-stream, shared memory, config store, and templates.
- `api/` — custom Hono API routes (research, settings, team, team-chat, skill, tool).
- `mcps/` — MCP server definitions (`trading-mcp-server.ts`).
- `reports/` — report storage.
- `db.ts` / `db-migrations.ts` — shared LibSQL database client and migrations. DB defaults to `~/.trading-agent/mastra.db`.
- `index.ts` — Mastra server wiring (agents, workflows, MCP servers, storage, CORS, observability, editor).

### Desktop (`apps/desktop/src/`)

- `main/index.ts` — Electron main process: spawns dev processes (agent server + Vite renderer) or the embedded agent server in production, manages loading screen, window lifecycle.
- `preload/index.ts` — Electron preload script.
- `renderer/` — React 19 + Vite + Tailwind CSS 4 SPA:
  - `domains/` — feature modules: `agents`, `agent-builder`, `teams`, `tools`, `workflows`, `auth`, `datasets`, `experiments`, `llm`, `mcps`, `metrics`, `observability`, `processors`, `scores`, `templates`, `workspace`, and more.
  - `pages/` — route pages mapped to domains.
  - `i18n/` — i18next configuration with `zh-CN` and `en` locales (namespaces: common, nav, dashboard, collaboration, reports, teams, market, settings, tools, skills, agents).
  - `lib/` — shared utilities, API clients (`team-api`, `tool-api`, `research-api`, `skill-api`), routing, analytics.
  - `hooks/` — shared hooks (agent messages, background tasks, templates, workflows).
  - `services/` — Mastra runtime state, stream error handling, tool call provider.
  - `store/` — Zustand stores.
  - `components/` — layout components and shared UI.
  - `ee/signals/` — enterprise edition signals feature.

### Playground UI (`packages/playground-ui/src/`)

- `ds/` — design system primitives.
- `domains/` — domain-specific component groups.
- `ee/` — enterprise edition components.
- `hooks/` — shared React hooks.
- `lib/` — utilities and helpers.
- `utils/` — exported utility functions (cn, errors, formatting, json-schema, etc.).
- `store/` — Zustand stores.
- `index.ts` — barrel export for the library.

### Shared (`packages/shared/src/`)

- `schemas/` — Zod schemas: agent-config, fundamentals, market-data, news, research-report, skill-config, team-config, tool-config.
- `types/` — shared TypeScript types.

### Other directories

- `docs/plans/` — project planning notes.
- `skills/` — Mastra workspace skills (each skill is a directory with `SKILL.md`).
- `apps/desktop/e2e/tests/` — Playwright E2E test specs (BDD-style, enforced by ESLint).
- `apps/desktop/e2e/kitchen-sink/` — Mastra fixture server for E2E tests.

## Build, Test, and Development Commands

### Root-level commands

| Command | Description |
|---|---|
| `npm install` | Install workspace dependencies from the root lockfile. |
| `npm run dev:agent` | Start `mastra dev` and Mastra Studio for the agent server. |
| `npm run dev:desktop` / `npm start` / `npm run dev` | Build Electron main process and launch the desktop app (auto-starts agent server + Vite renderer in dev mode). |
| `npm run dev:renderer` | Build playground-ui then start Vite dev server for the renderer only (port 3000). |
| `npm run dev:all` | Start agent server and desktop app concurrently. |
| `npm run restart` | Kill ports 3000/4111, rebuild shared package, then run `dev:all`. |
| `npm run kill-ports` | Kill processes on ports 3000 and 4111. |
| `npm run build` | Turbo build all workspaces. |
| `npm run build:desktop` | Turbo build only the desktop workspace. |
| `npm run build:dist` | Build both agent-server and desktop. |
| `npm run typecheck` | Turbo typecheck all workspaces. |
| `npm run test` | Turbo test all workspaces (Vitest watch mode). |
| `npm run test:run` | Turbo test all workspaces (Vitest run mode, no watch). |
| `npm run lint` | Turbo lint all workspaces. |

### Per-workspace commands

- `npm run build -w @trading-agent/agent-server` — typecheck + `mastra build`.
- `npm run build -w @trading-agent/desktop` — Vite build + Electron TypeScript build.
- `npm run build -w @trading-agent/shared` — compile shared schemas/types.
- `npm run build -w @mastra/playground-ui` — Vite library build.
- `npm run test -w @trading-agent/agent-server` — Vitest (watch mode).
- `npm run test:run -w @trading-agent/agent-server` — Vitest (run mode).
- `npm run test -w @trading-agent/desktop` — Vitest (watch mode).
- `npm run test:run -w @trading-agent/desktop` — Vitest (run mode).
- `npm run typecheck -w @mastra/playground-ui` — standalone `tsc` type check.
- `npm run pack -w @trading-agent/desktop` — create an unpacked Electron package.
- `npm run dist -w @trading-agent/desktop` — create macOS distributables (dmg + zip).

### E2E tests

Playwright E2E tests live in `apps/desktop/e2e/tests/`. The kitchen-sink Mastra server runs on port 4111. Tests use BDD-style structure enforced by ESLint (`e2e-bdd/test-needs-when-describe` rule): outer `describe` = the unit, inner `describe('when …')` = one precondition, each `test`/`it` = one outcome.

## Coding Style & Naming Conventions

Use TypeScript with `strict` mode. Follow existing two-space indentation, semicolons, and single quotes where practical. Name files by role in kebab case, such as `market-data-tool.ts` or `trading-workflow.ts`. Prefer named exports for shared types, tools, agents, and workflows. Keep runtime schemas in `packages/shared` when multiple workspaces need the same contract.

### Playground UI import rules

The desktop ESLint config enforces subpath imports from `@mastra/playground-ui` — root barrel imports are prohibited. Import components, hooks, icons, and utilities from their specific subpaths (e.g., `@mastra/playground-ui/components/Button` instead of `@mastra/playground-ui`). See `apps/desktop/eslint.config.js` for the full restricted import list.

### i18n

The desktop renderer uses i18next with `zh-CN` (default) and `en` locales. Translation files are in `apps/desktop/src/renderer/i18n/locales/{zh-CN,en}/`. When adding UI text, add keys to the appropriate namespace in both language files.

## Testing Guidelines

- **Vitest + MSW** is the primary testing strategy for the desktop renderer and playground-ui. Drive the real `@mastra/client-js` + React Query stack; only mock the network via MSW handlers. Never `vi.mock` our own data hooks, services, or auth gating. Fixtures live in nearby `__tests__/fixtures/` and must be typed with `@mastra/client-js` response types.
- **Vitest** is used for agent-server tool tests (`apps/agent-server/src/mastra/tools/__tests__/`).
- **Playwright E2E** tests are in `apps/desktop/e2e/tests/` and follow BDD-style structure (see above).
- Before opening a PR, run `npm run typecheck`, `npm run test:run`, and the relevant workspace build commands.
- When adding tests, colocate them near the code as `*.test.ts` or `*.spec.ts`.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commits with scopes, for example `feat(server): enable CORS for localhost:3000` and `feat(desktop): hide title bar`. Keep commits focused and use scopes like `agent`, `server`, `desktop`, `shared`, or `dx`.

PRs should include a short summary, test/build results, linked issues when applicable, and screenshots or recordings for desktop UI changes. Note any new environment variables or migration steps.

## Security & Configuration Tips

Copy `.env.example` to `.env` locally and configure:

- `DEEPSEEK_API_KEY` (required) — DeepSeek API key for the LLM.
- `FINNHUB_API_KEY` (optional) — Finnhub API key for the news/sentiment tool.
- `MASTRA_PLATFORM_ACCESS_TOKEN` (optional) — Mastra Platform token for cloud observability.
- `MASTRA_DB_URL` (optional) — LibSQL database URL, defaults to `file:~/.trading-agent/mastra.db`.

Never commit `.env`, local database files (`~/.trading-agent/`), Mastra runtime output (`.mastra/`), build artifacts (`dist/`, `dist-electron/`, `dist-app/`), logs, or packaged app archives.
