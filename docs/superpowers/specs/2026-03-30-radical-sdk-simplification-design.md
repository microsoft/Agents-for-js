# Radical SDK Simplification — Design Proposal

**Date:** 2026-03-30
**Status:** Proposal (RFC)
**Scope:** `@microsoft/agents-hosting` and related packages

---

## Problem Statement

The current SDK has two distinct DX problems:

1. **Conceptual overhead.** Developers encounter too many concepts before they can write a working agent: `CloudAdapter`, `ActivityHandler` vs `AgentApplication`, `TurnContext`, `TurnState`, `AuthConfiguration`, `authorizeJWT`, `startServer`. The relationship between these isn't obvious, and there are two overlapping ways to build an agent.

2. **Unnecessary wrapping.** The SDK wraps Express (via `startServer`) and MSAL (529 lines in `msalTokenProvider.ts`). These wrappers add weight, hide behavior, and force developers to learn SDK-specific abstractions for problems already solved by well-maintained external libraries.

---

## Goals

- A developer can write a working agent in ~15 lines they can read and explain top-to-bottom
- One way to build an agent — no `ActivityHandler` vs `AgentApplication` choice
- Auth surface is `appId` + an `@azure/identity` `TokenCredential` — covers all credential types (secret, certificate, managed identity, etc.) with no SDK-owned wrapping
- Developers own their HTTP server (Express, Hono, Fastify) — SDK is middleware
- Opt-in utilities for state, routing, and channel extensions — you pay for what you use
- Invoke activities handled transparently by the adapter (no special developer handling)

---

## Architecture

Three concerns, each with a clear owner:

| Concern | Owner |
|---|---|
| HTTP server | Developer (Express / Hono / Fastify) |
| Channel translation (HTTP ↔ Activity, auth validation, response routing) | `ChannelAdapter` |
| Outbound auth tokens | `@azure/identity` `TokenCredential` |

The SDK shrinks to: **one class (`ChannelAdapter`), one context object (`TurnContext`), and opt-in utilities** (state, routing, channel extensions).

---

## Hello World

```typescript
import express from 'express'
import { ChannelAdapter } from '@microsoft/agents-hosting'
import { ClientSecretCredential } from '@azure/identity'

const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
const adapter = new ChannelAdapter({ appId, credential })

const app = express()
app.use(express.json())
app.post('/api/messages', adapter.middleware(async (ctx) => {
  if (ctx.activity.type === 'message') {
    await ctx.send(`You said: ${ctx.activity.text}`)
  }
}))
app.listen(3978)
```

**What's gone from today's surface:** `startServer`, `ActivityHandler`, `AgentApplication`, `AuthConfiguration`, `loadAuthConfigFromEnv`, `authorizeJWT` middleware, the MSAL wrapper (`msalTokenProvider.ts`), `AgentApplicationOptions`.

---

## `ChannelAdapter`

Single responsibility: translate an HTTP request from Bot Service into an activity, validate the inbound JWT, invoke the handler, and route the response back correctly.

```typescript
class ChannelAdapter {
  constructor(options: { appId: string, credential: TokenCredential })

  // Mount as Express (or compatible) middleware
  middleware(handler: (ctx: TurnContext) => Promise<void>): RequestHandler

  // Send a message outside of a turn (proactive)
  // Uses the adapter's credential. For multi-tenant or agent-to-agent proactive
  // scenarios requiring a different identity, pass an explicit credential override.
  continueConversation(
    ref: ConversationReference,
    handler: (ctx: TurnContext) => Promise<void>,
    credentialOverride?: TokenCredential
  ): Promise<void>
}
```

### Auth

- **Inbound:** JWT validation against Bot Service JWKS endpoints is internal to the adapter. Developers never configure or see this.
- **Outbound:** The adapter uses the provided `TokenCredential` to acquire tokens for connector REST calls. Any `@azure/identity` credential works.
- **Out of scope for this proposal:** Agentic instance tokens and agentic user OBO tokens (used in Copilot Studio / agent-to-agent flows) require specialized token acquisition with tenantId + instanceId parameters that don't map to the `TokenCredential` interface. These flows are not addressed in this proposal and require separate design work.

```typescript
// Client secret (dev/staging)
new ClientSecretCredential(tenantId, clientId, clientSecret)

// Certificate
new ClientCertificateCredential(tenantId, clientId, certPath)

// Managed Identity (Azure-hosted, no secrets)
new ManagedIdentityCredential()

// Auto-select based on environment
new DefaultAzureCredential()
```

### Response Routing

The adapter handles delivery mode transparently — the developer always uses `ctx.send()`:

| Activity type | Delivery |
|---|---|
| `message` | Connector REST API (async) |
| `invoke` | Buffered, returned as HTTP response body |
| `expectReplies` | Collected, returned as batch in HTTP response |

---

## `TurnContext`

Trimmed to its essential surface. Internal middleware hooks (`onSendActivities`, `onUpdateActivity`, `onDeleteActivity`) are removed from the public API — they were implementation details that leaked out and caused bugs.

```typescript
class TurnContext {
  readonly activity: Activity      // incoming activity
  readonly identity: JwtPayload    // decoded JWT claims (appid, azp, etc.)

  send(activityOrText: Activity | string): Promise<void>
  update(activity: Partial<Activity>): Promise<void>
  delete(activityId: string): Promise<void>
}
```

---

## Opt-in Utilities

All higher-level features are explicit wrappers that compose around the handler. You see exactly what you've opted into.

### State

`withState` loads state before the handler runs and saves it after. The `state` object exposes three independently-scoped accessors — `conversation`, `user`, and `temp` — each with typed `.get<T>(key, default?)` and `.set(key, value)` methods. Conversation and user state are persisted to storage; temp state is per-turn only.

```typescript
import { withState, MemoryStorage } from '@microsoft/agents-hosting'

const storage = new MemoryStorage() // or BlobStorage, CosmosStorage

app.post('/api/messages', adapter.middleware(
  withState(storage, async (ctx, state) => {
    const count = state.conversation.get<number>('count', 0)
    await ctx.send(`Message #${count + 1}`)
    state.conversation.set('count', count + 1)
  })
))
```

The state accessor type:

```typescript
interface StateScope {
  get<T>(key: string, defaultValue?: T): T | undefined
  set<T>(key: string, value: T): void
  delete(key: string): void
}

interface AgentState {
  conversation: StateScope
  user: StateScope
  temp: StateScope
}
```

### Router

Replaces the `onMessage`/`onActivity` methods on `AgentApplication`. Handlers are matched in registration order; the first match wins.

`router.message` accepts a string keyword, a `RegExp`, or just a handler (fallback). String matching is case-insensitive exact equality against `activity.text`. RegExp is tested against `activity.text`. A bare handler with no selector matches any message not already handled.

```typescript
import { Router } from '@microsoft/agents-hosting'

const router = new Router()
router.message('/help', async (ctx) => ctx.send('Here is help...'))   // exact match: "/help"
router.message(/^\/\w+/, async (ctx) => ctx.send('Unknown command'))  // regex match
router.activity('conversationUpdate', async (ctx) => { /* ... */ })   // activity type match
router.message(async (ctx) => ctx.send(`You said: ${ctx.activity.text}`)) // fallback

app.post('/api/messages', adapter.middleware(router.handle()))
```

The `router.message` overloads. All variants accept an optional `RouteOptions` as the last argument:

```typescript
interface RouteOptions {
  auth?: OAuthFlow | OAuthFlow[]    // require one or more OAuth tokens
  agentic?: boolean                 // restrict to agentic callers only
}

// keyword string (case-insensitive exact match on activity.text)
message(keyword: string, handler: (ctx: TurnContext) => Promise<void>, options?: RouteOptions): this
// regex test on activity.text
message(pattern: RegExp, handler: (ctx: TurnContext) => Promise<void>, options?: RouteOptions): this
// fallback — matches any unhandled message
message(handler: (ctx: TurnContext) => Promise<void>, options?: RouteOptions): this
```

### Composing utilities

Wrappers compose naturally:

```typescript
app.post('/api/messages', adapter.middleware(
  withState(storage, router.handle())
))
```

### OAuth / SSO

OAuth is handled by `OAuthFlow`, an object that owns the full sign-in lifecycle. The automatic behaviors (intercepting `signin/verifyState` and `signin/tokenExchange` invokes, exchanging codes for tokens, sending `OAuthCard` when no token exists) are preserved — but the wiring is explicit rather than hidden inside `AgentApplication`.

Register the flow once with `router.use`. Then flag individual routes with `{ auth: oauth }` to gate them behind authentication. Token retrieval is explicit via `oauth.getToken(ctx)`.

```typescript
import { OAuthFlow } from '@microsoft/agents-hosting'

const oauth = new OAuthFlow({ connectionName: 'myOAuthConnection' })

// Registers signin/verifyState and signin/tokenExchange invoke handlers on the router.
// This single line is where all OAuth invoke handling lives — visible, traceable.
router.use(oauth)

// Gate a route — sends OAuthCard if no token, only matches when signed in.
router.message(async (ctx) => {
  const token = oauth.getToken(ctx)
  await ctx.send(`Hello! Signed in with token: ${token.slice(0, 10)}...`)
}, { auth: oauth })

// Unprotected fallback
router.message(async (ctx) => {
  await ctx.send('Please sign in first.')
})
```

`OAuthFlow` handles sign-in success and failure internally. If you need to hook into those events:

```typescript
const oauth = new OAuthFlow({
  connectionName: 'myOAuthConnection',
  onSuccess: async (ctx) => { await ctx.send('Welcome!') },
  onFailure: async (ctx) => { await ctx.send('Sign-in failed, please try again.') }
})
```

For routes that need tokens from multiple OAuth connections, register each flow and flag them together:

```typescript
const msGraph = new OAuthFlow({ connectionName: 'msgraph' })
const github = new OAuthFlow({ connectionName: 'github' })

router.use(msGraph)
router.use(github)

// Route only matches when both tokens are present
router.message(async (ctx) => {
  const graphToken = msGraph.getToken(ctx)
  const githubToken = github.getToken(ctx)
  await ctx.send(`Graph: ${graphToken.slice(0, 10)}, GitHub: ${githubToken.slice(0, 10)}`)
}, { auth: [msGraph, github] })
```

Each flow independently manages its own sign-in lifecycle. If any token is missing, the user is prompted for that connection before the handler runs.

#### On-Behalf-Of (OBO)

OBO is entirely outside the SDK — use `@azure/identity`'s `OnBehalfOfCredential` directly. The user token from `OAuthFlow` is the assertion; your app credentials are already in scope from where you created the adapter:

```typescript
import { OnBehalfOfCredential } from '@azure/identity'

const tenantId = '...'
const clientId = '...'
const clientSecret = '...'

const oauth = new OAuthFlow({ connectionName: 'graph' })
router.use(oauth)

router.message(async (ctx) => {
  const userToken = oauth.getToken(ctx)

  const oboCredential = new OnBehalfOfCredential({
    tenantId,
    clientId,
    clientSecret,
    userAssertionToken: userToken
  })

  const graphToken = await oboCredential.getToken('https://graph.microsoft.com/.default')
  // use graphToken to call Graph or any other downstream service
}, { auth: oauth })
```

The SDK has no involvement in OBO. This is a deliberate non-abstraction — `@azure/identity` handles it completely and is well-documented.

### Agentic Identity

Agentic identity allows an agent to act as a **user** in Microsoft 365 rather than as an app. When M365 grants an agent an agentic role, the agent can acquire tokens that give it user-level access to M365 services (Graph, SharePoint, etc.) instead of app-level access. This is signalled by the inbound activity's `recipient.role` being set to `agenticAppInstance` or `agenticUser` by the M365 platform.

The outbound token flow for agentic is a non-standard three-step MSAL process (using `fmi_path` and `user_fic` grant types) that cannot be expressed as a standard `@azure/identity` `TokenCredential`.

The adapter takes an optional `agenticCredential` for this. When an agentic request arrives, the adapter automatically uses it instead of the standard credential:

```typescript
import { AgenticTokenProvider } from '@microsoft/agents-hosting'

const adapter = new ChannelAdapter({
  appId,
  credential,                                          // standard flows
  agenticCredential: new AgenticTokenProvider({ appId, cert })  // agentic flows
})
```

`AgenticFlow` follows the same register-once, flag-routes pattern as `OAuthFlow`:

```typescript
import { AgenticFlow } from '@microsoft/agents-hosting'

const agenticFlow = new AgenticFlow()
router.use(agenticFlow)

// Only matches activities where M365 has granted the agent an agentic role
router.message(async (ctx) => {
  const token = agenticFlow.getToken(ctx)  // user-level M365 token for Graph, SharePoint, etc.
  await ctx.send('Acting as a user in M365')
}, { agentic: true })

// Fallback for regular (app-identity) activities
router.message(async (ctx) => {
  await ctx.send(`You said: ${ctx.activity.text}`)
})
```

`agenticFlow.getToken(ctx)` returns the agentic user token (acquired via the three-step FIC flow), which grants user-level access to M365 services for this turn.

### Teams Extensions

Channel-specific features stay in `agents-hosting-extensions-teams` and plug into the `Router`:

```typescript
import { TeamsExtension } from '@microsoft/agents-hosting-extensions-teams'

const teams = new TeamsExtension()

router.activity('invoke', teams.taskModule(async (ctx, taskData) => {
  return { type: 'continue', value: { title: 'My Task', ... } }
}))

router.activity('invoke', teams.messagingExtension(async (ctx, query) => {
  return { composeExtension: { type: 'result', ... } }
}))
```

---

## Features Noted for Future Utilities

These exist in the current SDK but are absent from this proposal. They should become `withX` wrappers following the same composition pattern rather than being removed permanently:

| Feature | Current location | Proposed future path |
|---|---|---|
| Typing indicator | Baked into `AgentApplication` | `withTypingIndicator(handler)` |
| File downloaders | `AgentApplicationOptions.fileDownloaders` | `withFileDownloads(config, handler)` |
| Transcript logging | `AgentApplicationOptions.transcriptLogger` | `withTranscript(logger, handler)` |
| Mention normalization | `AgentApplicationOptions.normalizeMentions` | Utility fn `normalizeMentions(activity)` |
| Header propagation | `AgentApplicationOptions.headerPropagation` | Middleware or adapter option |

---

## What's Removed vs What's Kept

### Removed
- `startServer` (developer owns HTTP server)
- `ActivityHandler` (replaced by handler function + `Router`)
- `AgentApplication` (replaced by `ChannelAdapter` + `Router` + `withState`)
- `AgentApplicationOptions` (replaced by explicit utility composition)
- `AuthConfiguration` / `loadAuthConfigFromEnv` (replaced by `@azure/identity`)
- `msalTokenProvider.ts` MSAL wrapper (use `@azure/identity` directly)
- `authorizeJWT` Express middleware (inbound validation moves inside adapter)
- `onSendActivities` / `onUpdateActivity` / `onDeleteActivity` public hooks on `TurnContext`
- `TurnState` / `turnStateFactory` as framework concerns (replaced by `withState`)

### Kept
- `botframework-connector` (the connector client remains; the adapter uses it internally)
- `ConversationReference` and activity schema types (from `agents-activity`)
- `MemoryStorage`, `BlobStorage`, `CosmosStorage`
- `agents-hosting-extensions-teams` package (plugs into `Router`)
- `StreamingResponse` (implementation detail of `ctx.send` for streaming)

---

## Open Questions

1. Should `Router` support async selector functions (à la today's `addRoute`)? This proposal uses string/regex only, which is simpler but loses the power of arbitrary async matching logic.
