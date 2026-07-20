# @microsoft/agents-hosting-fastify

## Overview

Fastify hosting integration for the Microsoft 365 Agents SDK. Provides three levels of abstraction:

- **`startServer`** — Quickest way to get running. Creates a Fastify instance, wires JWT auth on the messages route, and starts listening.
- **`agentsHostingFastifyPlugin`** (default export) — A standard (encapsulated) Fastify async plugin you can register on an existing Fastify instance, with optional `prefix`.
- **`createAgentRequestHandler`** — A handler `(request, reply) => Promise<void>` for users who want to register the route themselves.

Fastify parses JSON request bodies automatically, so no equivalent of `express.json()` is required. JWT authorization and rate limiting are applied per-route to the messages endpoint only, so any custom routes you add remain unauthenticated and un-throttled.

The package also re-exports `createCloudAdapter` (and `CloudAdapterResult`) from `@microsoft/agents-hosting`, plus `configureResponseController` for wiring the agent-to-agent response endpoint on a Fastify instance.

## Usage

### Basic — `startServer`

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-fastify'

const app = new AgentApplication<TurnState>()
app.onActivity('message', async (context) => {
  await context.sendActivity('Hello, world!')
})
await startServer(app)
```

### Custom routes alongside the agent endpoint

The `beforeListen` hook runs after the agent messages route is registered but before `fastify.listen()`. Custom routes added here are not subject to the agent's JWT middleware.

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-fastify'

const agent = new AgentApplication<TurnState>()

await startServer(agent, {
  port: 8080,
  routePath: '/bot/messages',
  beforeListen: async (fastify) => {
    fastify.get('/health', async () => ({ status: 'ok' }))
  }
})
```

### Rate limiting

`rateLimit` options are forwarded directly to [`@fastify/rate-limit`](https://github.com/fastify/fastify-rate-limit) and the limiter is **scoped to the agent messages route only** — user routes registered via `beforeListen` are not throttled. Note the option names differ from `express-rate-limit` — Fastify uses `timeWindow` and accepts human strings like `'15 minutes'`.

```ts
await startServer(agent, {
  rateLimit: {
    timeWindow: '15 minutes',
    max: 1000
  }
})
```

### Request body size limit

`bodyLimit` is applied **per-route** to the agent messages endpoint, so any user routes registered via `beforeListen` are unaffected. It defaults to `102400` bytes (100 KB) to match the default of `express.json()` in `@microsoft/agents-hosting-express`, keeping the request-size attack surface comparable across both hosting integrations. Fastify's instance-level default is 1 MB, so override this explicitly if you need to accept larger payloads:

```ts
await startServer(agent, {
  bodyLimit: 1024 * 1024 // 1 MB
})
```

The same `bodyLimit` option is also accepted by `agentsHostingFastifyPlugin`.

### Register on an existing Fastify instance — `agentsHostingFastifyPlugin`

```ts
import Fastify from 'fastify'
import agentsPlugin from '@microsoft/agents-hosting-fastify'
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'

const fastify = Fastify({ logger: true })
const agent = new AgentApplication<TurnState>()

await fastify.register(agentsPlugin, {
  agent,
  routePath: '/api/messages',
  rateLimit: { timeWindow: '1 minute', max: 100 }
})

fastify.get('/health', async () => ({ status: 'ok' }))
await fastify.listen({ port: 3978 })
```

### Custom Fastify setup — `createAgentRequestHandler`

```ts
import Fastify from 'fastify'
import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
import { createAgentRequestHandler } from '@microsoft/agents-hosting-fastify'

const agent = new AgentApplication<TurnState>()
const handler = createAgentRequestHandler(agent)

const fastify = Fastify()
fastify.post('/api/messages', handler)
fastify.get('/health', async () => ({ status: 'ok' }))
await fastify.listen({ port: 3978 })
```

### Typing `request.user`

The plugin copies the verified JWT payload onto `request.user` so downstream Fastify hooks and route handlers can read it. Add a module augmentation to type it:

```ts
import type { JwtPayload } from 'jsonwebtoken'

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload
  }
}
```

## Differences from `@microsoft/agents-hosting-express`

| Concern | Express package | Fastify package |
|---|---|---|
| Body parsing | `express.json()` middleware required (added automatically by `startServer`) | Automatic — Fastify parses JSON by default |
| Rate-limit options shape | `{ windowMs, max }` (express-rate-limit) | `RateLimitPluginOptions` from `@fastify/rate-limit` (e.g. `{ timeWindow, max }`) |
| `beforeListen` callback | Synchronous, receives `express.Express` | Sync or async, receives `FastifyInstance` |
| `startServer` return type | `express.Express` | `Promise<FastifyInstance>` (Fastify `listen` is async) |
| Plugin pattern | `RequestHandler` middleware | Encapsulated Fastify async plugin |
