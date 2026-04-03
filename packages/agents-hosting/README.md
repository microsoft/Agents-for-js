# microsoft/agents-hosting

## Overview

The `@microsoft/agents-hosting` package provides the necessary tools and components to create and host Microsoft Agents. This package includes a compatible API to migrate a bot using `botbuilder` from the BotFramework SDK.

## Installation

To install the package:

```sh
npm install @microsoft/agents-hosting
```

## Example Usage based on the AgentApplication object

```ts
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

const echo = new AgentApplication<TurnState>({ storage: new MemoryStorage() })
echo.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})
echo.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})
```

## Enable Debug Logging

This package uses the [`debug`](https://github.com/debug-js/debug) library. Set the `DEBUG` environment variable to enable logging for specific subsystems.

### Auth & connections

| Namespace | What it logs |
|---|---|
| `agents:authorization:connections` | Auth connections loaded at startup (clientId, tenantId, authType); which connection is selected per request |
| `agents:authorization:manager` | Auth handlers configured at startup (type, scopes); which handler is invoked per request |
| `agents:authorization:azurebot` | Azure Bot sign-in flow detail (token exchange, magic code, SSO) |
| `agents:authorization:agentic` | Agentic auth flow detail (token acquisition, OBO) |
| `agents:authorization` | High-level authorization middleware decisions |
| `agents:msal` | MSAL token acquisition (token requests, cache hits, OBO) |
| `agents:jwt-middleware` | Incoming JWT validation |
| `agents:authConfiguration` | Auth configuration loading |

### Adapter & request handling

| Namespace | What it logs |
|---|---|
| `agents:cloud-adapter` | Incoming request processing, activity dispatch |
| `agents:base-adapter` | Base adapter lifecycle |
| `agents:connector-client` | Outbound calls to the Bot Connector service |
| `agents:user-token-client` | User token client requests |

### Application & state

| Namespace | What it logs |
|---|---|
| `agents:app` | AgentApplication routing and lifecycle |
| `agents:activity-handler` | ActivityHandler event dispatch |
| `agents:state` | State read/write operations |
| `agents:turnState` | Turn state access |
| `agents:memory-storage` | MemoryStorage read/write |
| `agents:middleware` | Middleware pipeline execution |

### Streaming, attachments & transcripts

| Namespace | What it logs |
|---|---|
| `agents:streamingResponse` | Streaming response lifecycle |
| `agents:attachmentDownloader` | Attachment download requests |
| `agents:M365AttachmentDownloader` | M365-specific attachment downloads |
| `agents:file-transcript-logger` | File transcript write operations |
| `agents:rest-client` | REST client calls (transcript middleware) |

### Agent-to-agent

| Namespace | What it logs |
|---|---|
| `agents:agent-client` | Outbound agent client calls and response handling |

### Examples

```sh
# Show all auth and connection logs
DEBUG=agents:authorization:* node index.js

# Show everything
DEBUG=agents:* node index.js

# Show auth connections + MSAL
DEBUG=agents:authorization:connections,agents:msal node index.js
```

## Example Usage based on bot framework Activity Handler

Create an Echo bot using the ActivityHandler

```ts
// myHandler.ts
import { ActivityHandler, MessageFactory } from '@microsoft/agents-hosting'

export class MyHandler extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      const replyText = `Agent: ${context.activity.text}`
      await context.sendActivity(MessageFactory.text(replyText))
      await next()
    })
  }
}
```

Host the bot with express

```ts
// index.ts
import express, { Response } from 'express'
import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv } from '@microsoft/agents-hosting'
import { EchoBot } from './myHandler'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const adapter = new CloudAdapter(authConfig)
const myHandler = new MyHandler()

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myHandler.run(context))
})

```
