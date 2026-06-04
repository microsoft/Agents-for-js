# Copilot instructions for microsoft/Agents-for-js

The **Microsoft 365 Agents SDK for JavaScript/TypeScript** (successor to BotFramework SDK v4) — a framework for building agents across M365, Teams, Copilot Studio, and Webchat. It is an **npm-workspaces monorepo** (`packages/*` and `test-agents/*`) using **ES modules** (`"type": "module"`, `module: node16`) and TypeScript project references. Requires **Node.js 20+** (CI runs Node 24, which enables `--env-file`).

## Commands

```bash
npm run build            # tsc --build via tsconfig.build.json (project references)
npm run build:clean      # wipe dist/ then rebuild
npm test                 # all tests (node:test runner + tsx, emits test-report.xml)
npm run lint             # eslint (neostandard config)
npm run lint:deps:ci     # knip: unused files/exports/deps must be clean
npm run compat           # api-extractor public-API compatibility check
npm run build:samples    # build the test-agents
```

**Run a single test** (the runner is `node:test` with `tsx`, not jest/mocha):

```bash
node --test --import tsx packages/agents-activity/test/exceptionHelper.test.ts   # one file
node --test --import tsx 'packages/agents-hosting/test/**/*.test.ts'             # one package
```

CI (`.github/workflows/ci.yml`) runs, in order: `lint` → `lint:deps:ci` → `build` → `test` → `build:samples`. Match this before assuming work is done.

## Architecture (the big picture)

Package dependency layering (build bottom-up):
- **agents-activity** — Activity protocol types + Zod validators/schemas. No internal deps. Construct activities with `Activity.fromObject(...)`; they are Zod-validated.
- **agents-hosting** — core runtime: `ActivityHandler`, `AgentApplication`, `TurnContext`, `CloudAdapter`, auth, state, storage. Depends only on agents-activity.
- **agents-hosting-express** / **agents-hosting-fastify** — thin web-framework adapters over agents-hosting.
- **agents-hosting-dialogs**, storage adapters (blob/cosmos), extensions (teams/slack), **agents-copilotstudio-client**, **agents-telemetry** — leaf packages.

Core request flow: `CloudAdapter.process()` authenticates an incoming HTTP request, builds a `TurnContext` for the turn, and runs it through an `ActivityHandler` (event hooks like `onMessage`) or an `AgentApplication` (higher-level routing + `TurnState`). `Storage` (Memory/Blob/Cosmos) persists conversation/user/private state.

**Framework-agnostic hosting (important, cross-cutting):** agents-hosting does **not** import `express`/`fastify` types. `CloudAdapter.process` and `authorizeJWT` accept the structural `WebResponse` interface (`packages/agents-hosting/src/interfaces/webResponse.ts`). Express's `Response` satisfies it directly; Fastify uses `FastifyReplyAdapter` (`implements WebResponse`). When touching these signatures, keep them on `WebResponse`, not concrete framework types. Compile-time guards in `createAgentRequestHandler.ts` (express) and `replyAdapter.ts` (fastify) assert framework types stay assignable to `WebResponse` — they fail the build on drift.

## Conventions

- **Errors — never `throw new Error(...)`/`throw new TypeError(...)` directly.** Every package defines `AgentErrorDefinition` entries in a local `src/errorHelper.ts` (unique numeric `code` per subsystem range, `description`, optional `helplink`) and throws via:
  ```ts
  import { ExceptionHelper } from '@microsoft/agents-activity'
  import { Errors } from '../errorHelper'
  throw ExceptionHelper.generateException(Error, Errors.SomeKey, innerErr?, { tmplKey: value })
  ```
  The returned `AgentError` exposes `.code`, `.helpLink`, `.innerException` — the description is only embedded in the formatted `.message`. New errors continue the package's numeric sequence.
- **Public API is contract-checked.** api-extractor compares each package's `dist/src/index.d.ts` against `compat/baseline/<pkg>.api.md`. After an intentional public-API change, regenerate the baseline: `npm run compat <pkg> -- --local` (e.g. `npm run compat agents-hosting -- --local`), then commit the updated `.api.md`. Prefer backward-compatible changes (additive exports, parameter widening, overloads, structural shims) over breaking ones. Note: per-package compat is reliable; `npm run compat` (all packages) currently errors on `agents-telemetry` because it has no `dist/src/index.d.ts`.
- **Tests** live in each package's `test/` dir as `*.test.ts`, use `node:test` (`describe`/`it`) + `node:assert`. `tsx` transpiles without type-checking — type-level assertions only count if compiled by `npm run build` (i.e. placed in `src/`, not `test/`).
- **ESM**: built output uses explicit file extensions; `engines.node >= 20`. Sample/test-agents load config via Node's `--env-file .env`.
- **Logging**: uses the `debug` library. `debug('agents:<subsystem>')` returns a `Logger` with `.info()/.warn()/.error()/.debug()` (it is not directly callable). Enable with the `DEBUG` env var (e.g. `DEBUG=agents:cloud-adapter:*`); namespaces are documented in `README.md`.
- **test-agents/** are internal samples for testing, not learning examples — those live at https://github.com/microsoft/Agents.
- **Git**: main branch is `main`; feature branches `users/<alias>/<feature>`. Do not auto-commit; commit only when explicitly asked.
