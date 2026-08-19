# @microsoft/agents-hosting

## Overview

The `@microsoft/agents-hosting` package provides the necessary tools and components to create and host Microsoft Agents. This package includes a compatible API to migrate a bot using `botbuilder` from the BotFramework SDK.

## Installation

To install the package:

```sh
npm install @microsoft/agents-hosting
```

## Hosting integration APIs

To make hosting an agent independent of any single web framework, this package
exposes framework-agnostic primitives that the
[`@microsoft/agents-hosting-express`](../agents-hosting-express) and
[`@microsoft/agents-hosting-fastify`](../agents-hosting-fastify) packages build on:

- `createCloudAdapter(agent, authConfig)` — returns `{ adapter, headerPropagation }` for processing incoming activities. Use this from any web framework.
- `CloudAdapterResult` — return type of `createCloudAdapter`.
- `createAgentResponseHandler(adapter, agent, conversationState)` — framework-agnostic handler `(req, res, params) => Promise<void>` for the authenticated SDK-specific Activity callback route.
- `AgentResponseHandler`, `AgentResponseHandlerParams`, `AGENT_RESPONSE_ROUTE_PATH` — supporting types and the canonical route path.
- `WebResponse`, `NextFunction`, `WebRequestParamsCarrier` — minimal structural interfaces (no Express/Fastify imports) used by the cross-framework helpers above.

Most consumers should keep using `startServer`/`createAgentRequestHandler` from the
Express or Fastify packages; reach for these APIs when adapting another framework.

This Activity callback flow is used for SDK-specific Activity-protocol
delegation.

The Activity callback handler authenticates requests once through the supplied
`CloudAdapter`. That boundary validates the token for any configured host connection;
the handler then verifies that the caller application matches the delegated agent
recorded for that conversation. Existing route-level `authorizeJWT` middleware is
redundant but remains compatible. On configured or production hosts, missing,
invalid, expired, or wrong-audience tokens return `401`. An authenticated caller
that does not match the delegated agent, or missing, malformed, or pre-upgrade
delegated state, returns `403`.
Anonymous callbacks are supported only for unconfigured development hosts
outside production and emit a registration warning because peer ownership cannot
be verified. Pre-upgrade conversations must be restarted.

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
