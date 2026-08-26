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

- `createCloudAdapter(agent, authConfig)` — returns `{ adapter, headerPropagation }` for processing incoming activities. It preserves an `AgentApplication`'s existing adapter; `authConfig` is used only when creating an adapter. Use this from any web framework.
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

## Pluggable configuration sources

Existing environment variables and direct runtime options continue to work
without changes. Additional asynchronous sources can be loaded into an
immutable host-scoped context and then consumed synchronously by auth
configuration, `CloudAdapterOptions`, outbound host validation, and
`AgentApplication` user authorization:

```ts
import {
  AttachmentDownloader,
  CloudAdapter,
  createConfigurationContext,
  createOutboundHostValidator,
  ConfigurationSource,
} from '@microsoft/agents-hosting'

const source: ConfigurationSource = {
  name: 'central-configuration',
  async load () {
    return {
      format: 'document',
      value: {
        cloudAdapterOptions: {
          validateServiceUrl: true
        },
        outboundHostValidator: {
          enabled: true,
          hosts: ['api.contoso.com']
        }
      }
    }
  }
}

const configurationContext = await createConfigurationContext([{
  source,
  mode: 'overrideEnvironment'
}])

const adapter = new CloudAdapter(
  undefined,
  undefined,
  undefined,
  { configurationContext }
)

// Reuse the same policy for code-level outbound consumers such as attachment
// downloaders.
const outboundPolicy = createOutboundHostValidator({ configurationContext })
const downloader = new AttachmentDownloader('inputFiles', outboundPolicy)
```

Context creation is atomic: if a source fails, no partial values are applied.
Create separate contexts for independently configured agents in one process.
Pass the same context to each agent's `CloudAdapter` and
`AgentApplication`. Existing applications may instead call
`preloadConfigurationSources` once before constructing consumers; that API is
the compatibility wrapper over the default process context.

Load the default context before constructing any configuration consumer.
Default-context loading is atomic and retryable after failure, but a successful
load can occur only once and cannot run concurrently. Constructing a consumer
first consumes an empty default snapshot and prevents later preload. To adopt
updated or rotated values, create a new immutable context and reconstruct its
consumers; existing contexts and consumers are not mutated.

Every source must select an explicit mode:

- `fallback`: below Bot Framework compatibility variables and supported modern
  `__` environment configuration.
- `overrideEnvironment`: above environment configuration and below direct
  runtime options.
- `enforce`: above direct runtime options.

Sources in the same mode are applied in registration order, with later values
winning. `enforce` can override values supplied directly by application code
and should be reserved for deliberate central policy enforcement.

Within the environment band, a modern `Connections__*` registry replaces flat
or prefixed Bot Framework authentication variables; the two representations
are not merged property by property. When no modern registry exists, the
legacy flat or prefixed variables remain supported. Existing auth loaders also
require an explicit wildcard/default route and do not infer a default from
connection insertion order.

Supported canonical path families are:

- `connections.<id>.settings.<property>`
- `connectionsMap.<index>.serviceUrl`
- `connectionsMap.<index>.audience`
- `connectionsMap.<index>.connection`
- `cloudAdapterOptions.<property>`
- `outboundHostValidator.<property>`
- `agentApplication.userAuthorization.handlers.<id>.settings.<property>`

Sources return either `{ format: 'canonical', values }` for canonical string
paths or `{ format: 'document', value }` for hierarchical typed JSON.
Existing sources that return a bare canonical record remain supported for
backward compatibility; new sources should use the explicit tagged form.
Canonical paths use current property names only, except for the retained
`WIDAssertionFile` compatibility spelling (prefer `federatedTokenFile`).
Schema-shaped `__`
environment variables are also a permanent first-class input and bind to the
same hierarchy. Bot Framework-era `MicrosoftApp*`, prefixed connection, and
`<handlerId>_*` aliases remain supported through an isolated compatibility
adapter, but are not valid external-source paths. Invalid paths or values fail
loading without including the supplied value in diagnostics.

The provider-neutral hierarchical document shape is defined by
[`agents-configuration.schema.json`](../../docs/schemas/agents-configuration.schema.json).

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

## Outbound request host validation

`OutboundHostValidator` provides an opt-in allowlist for server-side requests made
to activity service URLs and attachment URLs. Enforcement is disabled by default.
It can be configured with environment variables:

```dotenv
OutboundHostValidator__Enabled=true
OutboundHostValidator__IncludeDefaultMicrosoftHosts=true
OutboundHostValidator__Hosts=contoso.com,fabrikam.com
```

Indexed host variables such as `OutboundHostValidator__Hosts__0=contoso.com` are
also supported. A host entry matches both the exact host and its subdomains, and
is normalized (scheme/port/path stripped; a leading `*.` is accepted and ignored).

When enforcement is enabled, `CloudAdapter` rejects inbound activities whose
`serviceUrl` host is not allowlisted, and it also rejects `serviceurl` claim
mismatches (equivalent to `CloudAdapterOptions.validateServiceUrl=true`).

For explicit configuration, reuse the same immutable policy in the adapter and
attachment downloaders:

```ts
import {
  AgentApplication,
  AttachmentDownloader,
  CloudAdapter,
  OutboundHostValidator
} from '@microsoft/agents-hosting'

const outboundHostValidator = new OutboundHostValidator({
  enabled: true,
  hosts: ['contoso.com']
})

const adapter = new CloudAdapter(undefined, undefined, undefined, undefined, outboundHostValidator)

const agent = new AgentApplication({
  adapter,
  fileDownloaders: [new AttachmentDownloader('inputFiles', outboundHostValidator)]
})
```

The validator checks the URL supplied to the downloader. Redirects retain native
`fetch` behavior.
