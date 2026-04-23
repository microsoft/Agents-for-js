# microsoft/agents-hosting-express

## Overview

Provides integration to host agents with Express. The package offers three levels of abstraction:

- **`startServer`** — Quickest way to get running. Creates an Express app, wires up auth, and starts listening.
- **`createAgentRequestHandler`** — A handler signature without Express imports, for frameworks that can provide Express-compatible request/response objects.
- **`createCloudAdapter`** — Low-level factory to get a `CloudAdapter` for full control over request processing.

## Usage

### Basic — `startServer`

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
import { startServer } from '@microsoft/agents-hosting-express';

const app = new AgentApplication<TurnState>();
app.onActivity('message', async (context) => {
  await context.sendActivity('Hello, world!');
});
startServer(app);
```

### Custom routes alongside the agent endpoint

Use the `beforeListen` hook to add routes before the server starts listening:

```ts
import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
import { startServer } from '@microsoft/agents-hosting-express';

const agent = new AgentApplication<TurnState>();

startServer(agent, {
  port: 8080,
  routePath: '/bot/messages',
  beforeListen: (app) => {
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
  }
});
```

### Custom Express setup — `createAgentRequestHandler`

If you manage your own Express app (or another framework with an adapter that exposes Express-compatible request/response objects), use `createAgentRequestHandler` to get a handler that includes JWT authorization and activity processing:

```ts
import express from 'express';
import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
import { createAgentRequestHandler } from '@microsoft/agents-hosting-express';

const agent = new AgentApplication<TurnState>();
const handler = createAgentRequestHandler(agent);

const app = express();
app.use(express.json());
app.post('/api/messages', handler);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3978);
```

### Advanced — `createCloudAdapter`

For full control, use `createCloudAdapter` to obtain the `CloudAdapter` directly. This is useful when you need to customize request processing and can provide the request/response shape expected by `CloudAdapter.process`.

`CloudAdapter.process` expects:

- a parsed activity body on `req.body` (for example, via `express.json()` in Express)
- a response object that supports `status()`, `setHeader()`, `send()`, and `end()`

If your framework does not expose those members directly, add an adapter layer before calling `adapter.process`.

```ts
import http from 'node:http';
import { AgentApplication, TurnState, getAuthConfigWithDefaults } from '@microsoft/agents-hosting';
import { createCloudAdapter } from '@microsoft/agents-hosting-express';

const agent = new AgentApplication<TurnState>();
const authConfig = getAuthConfigWithDefaults();
const { adapter, headerPropagation } = createCloudAdapter(agent, authConfig);

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/messages') {
    // Adapt request/response as needed so they match CloudAdapter.process expectations.
    await adapter.process(req as any, res as any, (context) => agent.run(context), headerPropagation);
  }
});
server.listen(3978);
```

### Setting up auth middleware manually

If you need to apply JWT authorization on specific routes in your own Express app:

```ts
import express from 'express';
import { authorizeJWT, getAuthConfigWithDefaults, AgentApplication, TurnState } from '@microsoft/agents-hosting';
import { createCloudAdapter } from '@microsoft/agents-hosting-express';

const agent = new AgentApplication<TurnState>();
const authConfig = getAuthConfigWithDefaults();
const { adapter, headerPropagation } = createCloudAdapter(agent, authConfig);

const app = express();
app.use(express.json());

// JWT is applied only on the agent route — custom routes remain unauthenticated
app.post('/api/messages', authorizeJWT(authConfig), (req, res) =>
  adapter.process(req, res, (context) => agent.run(context), headerPropagation)
);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3978);
```
