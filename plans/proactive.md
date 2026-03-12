# Plan: Proactive Messaging Subsystem

Reference: https://github.com/microsoft/Agents-for-net/pull/694
Reference: https://github.com/microsoft/Agents/issues/454

## Background

The C# SDK PR #694 adds a structured `Proactive` subsystem to `AgentApplication`. The JS SDK
currently has ad-hoc proactive support via `sendProactiveActivity()` and
`continueConversationAsync()` on `AgentApplication`, plus `adapter.createConversationAsync()`.

What's missing from JS:

1. **`Conversation` type** — a serializable wrapper that pairs a `ConversationReference` with JWT
   claims (the bot identity needed to authenticate proactive calls). Without this, callers must
   track the reference and the `botAppId`/`JwtPayload` separately and remember to pass both.

2. **Fluent builders** — `ConversationBuilder`, `ConversationReferenceBuilder`, and
   `CreateConversationOptionsBuilder` for constructing these objects without having to manually
   assemble deeply nested plain objects.

3. **Storage-backed conversation management** — a standard pattern for persisting conversation
   references (by conversation ID) so that a proactive message can be sent later without the
   original `TurnContext` being in scope.

4. **`Proactive` class on `AgentApplication`** — encapsulates the above with a clean, discoverable
   API surface, including full-turn handling (TurnState load/save, auth token acquisition) for
   `continueConversation`.

5. **`ProactiveOptions`** — configuration interface for the proactive subsystem (which `Storage`
   backend to use, behavior flags).

---

## What We Are NOT Porting

The C# PR includes some patterns that don't map naturally to JS:

- **`[ContinueConversation]` attribute + `MapAgentProactiveEndpoints`** — C# uses reflection to
  discover decorated methods and auto-register HTTP endpoints via DI. JS has no equivalent
  attribute/decorator + reflection system in production use. Instead, callers register Express
  routes manually and call `app.proactive.continueConversation()` directly. The test-agent
  (`test-agents/proactive-agent`) demonstrates this pattern. A convenience router helper
  (e.g. `registerProactiveRoutes(router, app)` in `agents-hosting-express`) may be added in a
  future sub-module once the core API stabilises.

- **`ContinueConversationRoute<TAgent>`** — tightly coupled to the C# attribute system above.

- **`UserNotSignedIn` typed exception** — in JS, a plain `Error` with a descriptive message is
  idiomatic. No custom exception class needed.

- **`ProactiveValidationExtensions`** — C# extension methods for validation. In JS, validation
  lives inline in the builder `.build()` method and the `Proactive` class methods.

---

## New Files

All new files go under:
`packages/agents-hosting/src/app/proactive/`

### `conversation.ts`

Defines the `Conversation` class. This is the core serializable type that the storage system
stores and retrieves.

```typescript
export interface ConversationClaims {
  aud: string       // bot client ID (required)
  azp?: string
  appid?: string
  tid?: string
  [key: string]: string | undefined
}

export class Conversation {
  reference: ConversationReference
  claims: ConversationClaims

  // Construct from a TurnContext (normal turn — captures live identity + reference).
  // Reference: context.activity.getConversationReference()
  // Claims: context.identity (the JwtPayload set by CloudAdapter during auth)
  // Note: context.identity may be undefined in unauthenticated dev scenarios;
  // validate() will surface the missing aud.
  constructor(context: TurnContext)
  // Construct from explicit parts
  constructor(reference: ConversationReference, claims: ConversationClaims)

  // Returns a JwtPayload-compatible object for passing to adapter.continueConversation()
  get identity(): JwtPayload

  // Returns a JSON string of { reference, claims } — useful for HTTP request bodies
  toJson(): string
}
```

Validation method used internally:
```typescript
validate(): void  // throws if reference.conversation.id, reference.serviceUrl, or claims.aud are missing
```

**Why**: The C# `Conversation` class stores `IDictionary<string, string> Claims` and a
`ConversationReference`. The JS equivalent uses `JwtPayload` (already in the codebase via
`jsonwebtoken`) as the identity representation, so `claims` is typed as a plain object matching
that shape. `context.identity` is the same value that callers previously had to pass manually
as `botAppIdOrIdentity` to `sendProactiveActivity()`. Serialization to/from storage is handled
via JSON naturally.

---

### `conversationReferenceBuilder.ts`

A fluent builder for `ConversationReference`. Knows the default `serviceUrl` for common channels.

Also exports a `TeamsServiceEndpoints` const for callers in sovereign cloud environments where
the public global URL is not appropriate. Use only when a prior conversation's `serviceUrl` is
unavailable; once you have a real `serviceUrl` from a turn, prefer that.

```typescript
/**
 * Teams service URLs for proactive messaging.
 * Use only when the incoming serviceUrl is unavailable.
 * Once a serviceUrl is received from a real conversation, cache and use that instead.
 */
export const TeamsServiceEndpoints = {
  publicGlobal: 'https://smba.trafficmanager.net/teams/',
  gcc:          'https://smba.infra.gcc.teams.microsoft.com/teams',
  gccHigh:      'https://smba.infra.gov.teams.microsoft.us/teams',
  dod:          'https://smba.infra.dod.teams.microsoft.us/teams',
} as const

export class ConversationReferenceBuilder {
  static create(agentClientId: string, channelId: string, serviceUrl?: string): ConversationReferenceBuilder
  static serviceUrlForChannel(channelId: string): string  // returns known defaults

  withUser(userId: string, userName?: string): this
  withConversationId(id: string): this
  build(): ConversationReference
}
```

Channel serviceUrl defaults (from C# `ConversationReferenceBuilder.ServiceUrlForChannel`):
- `msteams` → `TeamsServiceEndpoints.publicGlobal`
- `webchat` → `https://webchat.botframework.com/`
- `directline` → `https://directline.botframework.com/`
- others → empty string (caller must supply)

**Why**: The existing `samples/basic/proactive.ts` hard-codes service URLs inline. This builder
centralises those defaults.

---

### `conversationBuilder.ts`

A fluent builder for the `Conversation` class.

```typescript
export class ConversationBuilder {
  static create(agentClientId: string, channelId: string, serviceUrl?: string): ConversationBuilder
  static fromContext(context: TurnContext): ConversationBuilder  // pre-populates from live turn

  withUser(userId: string, userName?: string): this
  withConversationId(id: string): this
  withReference(ref: Partial<ConversationReference>): this  // merges into current reference
  build(): Conversation
}
```

`build()` calls `serviceUrlForChannel()` to fill in `serviceUrl` if missing, then validates.

**Why**: Mirrors C# `ConversationBuilder`. Lets callers construct a `Conversation` from just
`agentClientId + channelId + userId` without manually building the nested object graph.

---

### `createConversationOptions.ts`

Data class for new-conversation creation. Passed to `Proactive.createConversation()`.
Flattened relative to the old `CreateConversation` — no nested `Conversation` wrapper.

```typescript
export const AzureBotScope = 'https://api.botframework.com'

export interface CreateConversationOptions {
  /** JWT claims for the agent identity. aud must be the agent's client ID. */
  identity: ConversationClaims
  channelId: string
  serviceUrl: string
  /** OAuth scope. Defaults to AzureBotScope. */
  scope: string
  /** If true, stores the resulting Conversation after creation. Default: false. */
  storeConversation?: boolean
  /** Conversation configuration passed to adapter.createConversationAsync(). */
  parameters: ConversationParameters
}
```

`ConversationParameters` is already defined in `@microsoft/agents-activity` and used in
`CloudAdapter.createConversationAsync()` today.

---

### `createConversationOptionsBuilder.ts`

Fluent builder for `CreateConversationOptions`.

```typescript
export class CreateConversationOptionsBuilder {
  static create(agentClientId: string, channelId: string, serviceUrl?: string, parameters?: ConversationParameters): CreateConversationOptionsBuilder

  withUser(userId: string, userName?: string): this
  withActivity(activity: Partial<Activity>): this
  withChannelData(data: object): this
  withTenantId(tenantId: string): this
  withTeamsChannelId(teamsChannelId: string): this   // sets isGroup + channelData.channel.id
  withTopicName(name: string): this
  isGroup(value: boolean): this
  withScope(scope: string): this
  storeConversation(value: boolean): this
  build(): CreateConversationOptions  // throws if no members defined
}
```

`build()` throws if `parameters.members` is empty (matches C# `ProactiveMissingMembers` error).

**Why**: The existing `samples/basic/proactive.ts` (lines 51-67) assembles the `createConversationAsync`
call arguments inline with hard-coded values. This builder replaces that pattern.

---

### `proactiveOptions.ts`

Configuration for the proactive subsystem.

```typescript
export interface ProactiveOptions {
  /**
   * Storage backend for persisting conversation references.
   * If omitted, falls back to AgentApplicationOptions.storage.
   * A warning is logged when the fallback is used.
   * Throws at initialization time if neither is configured.
   */
  storage?: Storage

  /**
   * When true (default), continueConversation() throws if any requested
   * token handler's user has not previously signed in.
   */
  failOnUnsignedInConnections?: boolean  // default: true
}
```

**Why**: Mirrors C# `ProactiveOptions`. Allows the proactive subsystem to use a different storage
backend from the turn state storage (e.g., a shared external store for conversation references
across multiple instances). Making `storage` optional with a warned fallback reduces boilerplate
for the common case where one storage backend serves everything.

---

### `proactive.ts`

The main class. Added as a property on `AgentApplication`.

```typescript
export class Proactive<TState extends TurnState> {
  constructor(app: AgentApplication<TState>, options: ProactiveOptions)

  // --- Conversation reference storage ---

  // Store from a live TurnContext (captures reference + identity automatically)
  storeConversation(context: TurnContext): Promise<string>
  // Store an explicit Conversation object
  storeConversation(conversation: Conversation): Promise<string>

  // Returns undefined if not found
  getConversation(conversationId: string): Promise<Conversation | undefined>

  // Returns the conversation or throws if not found
  getConversationOrThrow(conversationId: string): Promise<Conversation>

  // Remove from storage
  deleteConversation(conversationId: string): Promise<void>

  // --- Send activity (no state, no auth — just sends) ---

  // Look up stored conversation by ID, then send
  sendActivity(adapter: BaseAdapter, conversationId: string, activity: Partial<Activity>): Promise<ResourceResponse>
  // Send to explicit Conversation object (no storage lookup)
  sendActivity(adapter: BaseAdapter, conversation: Conversation, activity: Partial<Activity>): Promise<ResourceResponse>

  // --- Full-turn handler (loads TurnState, handles auth tokens) ---

  // Look up stored conversation by ID, then run handler
  continueConversation(adapter: BaseAdapter, conversationId: string, handler: RouteHandler<TState>, opts?: ContinueConversationOptions): Promise<void>
  // Run handler against explicit Conversation object
  continueConversation(adapter: BaseAdapter, conversation: Conversation, handler: RouteHandler<TState>, opts?: ContinueConversationOptions): Promise<void>

  // --- Create new conversation ---

  // Creates a new conversation. Returns a Conversation (reference + identity).
  // If createOptions.storeConversation is true, also stores it automatically.
  createConversation(
    adapter: BaseAdapter,
    createOptions: CreateConversationOptions,
    handler?: RouteHandler<TState>,
    opts?: CreateConversationHandlerOptions
  ): Promise<Conversation>
}

export interface ContinueConversationOptions {
  autoSignInHandlers?: string[]            // auth connection names to acquire tokens for
  continuationActivity?: Partial<Activity>  // override the default continuation activity
}

export interface CreateConversationHandlerOptions extends ContinueConversationOptions {
  continuationActivityFactory?: (ref: ConversationReference) => Partial<Activity>
}
```

**Storage key format**: `conversationreferences/{conversationId}` (matches C#).

**`continueConversation` internals** — all of the following happens *inside* the callback passed
to `adapter.continueConversation()`. The adapter swallows exceptions thrown from the callback,
so the implementation uses a capture-and-rethrow pattern:

```typescript
let caughtError: unknown
await adapter.continueConversation(conversation.identity, conversation.reference, async (ctx) => {
  try {
    // 1. Fresh TurnState — not the app's existing state
    const state = app.options.turnStateFactory()
    // 2. Load using app's main storage (not the proactive conversation-reference storage)
    await state.load(ctx, app.options.storage)
    // 3. Token acquisition (optional)
    if (opts?.autoSignInHandlers?.length && app.hasUserAuthorization) {
      const allAcquired = await app.authorization.getSignedInTokens(ctx, opts.autoSignInHandlers)
      if (!allAcquired && options.failOnUnsignedInConnections !== false) {
        throw new Error('Not all token handlers have a signed-in user.')
      }
    }
    // 4. Call handler
    await handler(ctx, state)
    // 5. Save state
    await state.save(ctx, app.options.storage)
  } catch (err) {
    caughtError = err
  } finally {
    // 6. Close streaming response if open (must happen inside the callback — context is gone after)
    if (ctx.streamingResponse?.isStreamStarted()) {
      await ctx.streamingResponse.endStream()
    }
  }
})
if (caughtError !== undefined) throw caughtError
```

---

### `index.ts`

Barrel export for the proactive sub-module.

```typescript
export * from './conversation'
export * from './conversationBuilder'
export * from './conversationReferenceBuilder'
export * from './createConversationOptions'
export * from './createConversationOptionsBuilder'
export * from './proactiveOptions'
export * from './proactive'
```

---

## Modified Files

### `packages/agents-hosting/src/app/agentApplicationOptions.ts`

**Add** one field to the `AgentApplicationOptions<TState>` interface (after `connections`):

```typescript
import { ProactiveOptions } from './proactive'

/**
 * Optional. Configuration for the proactive messaging subsystem.
 * When provided, app.proactive will be available.
 */
proactive?: ProactiveOptions
```

---

### `packages/agents-hosting/src/app/agentApplication.ts`

**Add** import:
```typescript
import { Proactive } from './proactive'
```

**Add** private field (alongside the other private fields around line 76):
```typescript
private readonly _proactive?: Proactive<TState>
```

**Add** initialization in the constructor (after the `authorization` block, around line 131):
```typescript
if (this._options.proactive) {
  this._proactive = new Proactive<TState>(this, this._options.proactive)
}
```

**Add** two public getters (alongside `adapter`, `options`, `adaptiveCards` getters):
```typescript
/**
 * Gets the proactive messaging subsystem.
 *
 * @throws Error if no proactive options were configured.
 */
public get proactive(): Proactive<TState> {
  if (!this._proactive) {
    throw new Error(
      'The Application.proactive property is unavailable because no proactive options were configured.'
    )
  }
  return this._proactive
}

/**
 * Returns true if user authorization was configured, without throwing.
 * Used internally by the Proactive subsystem to safely check whether
 * token acquisition is available.
 */
public get hasUserAuthorization(): boolean {
  return this._authorization !== undefined
}
```

**No changes** to `sendProactiveActivity()` or `continueConversationAsync()` — these remain as-is
for backward compatibility.

---

### `packages/agents-hosting/src/app/index.ts`

**Add** one export line (after the existing exports):

```typescript
export * from './proactive'
```

This re-exports all types from the proactive barrel (`Conversation`, `ConversationBuilder`,
`CreateConversationOptionsBuilder`, `Proactive`, `ProactiveOptions`, etc.) through the app-level index.

---

### `packages/agents-hosting/src/app/agentApplicationBuilder.ts`

**Add** import:
```typescript
import { ProactiveOptions } from './proactive'
```

**Add** method (alongside `withStorage`, `withAuthorization`):
```typescript
/**
 * Configures the proactive messaging subsystem.
 * @param options Proactive options including optional storage backend
 * @returns This builder instance for chaining
 */
public withProactive(options: ProactiveOptions): this {
  this._options.proactive = options
  return this
}
```

---

### `packages/agents-hosting/src/index.ts`

No changes needed. The proactive types flow up through `export * from './app'` already.

---

## New Test Agent

`test-agents/proactive-agent/` — structured identically to `test-agents/empty-agent`:

```
test-agents/proactive-agent/
  src/agent.ts          # main entry point
  package.json          # name: "proactive-agent", same scripts/deps as empty-agent
  tsconfig.json         # extends ../../tsconfig.json, rootDir: src, outDir: dist
  env.TEMPLATE          # tenantId, clientId, clientSecret, authorityEndpoint placeholders
  .npmrc
  Dockerfile
  deploy/to-aca.ps1
```

`src/agent.ts` demonstrates the full proactive pattern:
1. Storing a conversation reference during a normal message turn via `app.proactive.storeConversation(context)`, replying with the conversation ID
2. A POST endpoint (`/api/proactive/:conversationId`) that calls `app.proactive.continueConversation()` with the stored ID, passing any HTTP query parameters via `continuationActivity.value` (with `valueType` set to `'application/vnd.microsoft.activity.continueconversation+json'`). The handler demonstrates reading those args from `context.activity.value`.
3. Teams conversation creation using `CreateConversationOptionsBuilder` via a separate POST endpoint
4. **`AllowCallers` auth**: both proactive endpoints validate the caller's app ID against a
   configured list before proceeding, using the same auth mechanism as `/api/messages`. This
   demonstrates the security pattern callers should follow until a built-in router is available.

---

## Testing

### Framework & Conventions

- **`node:test`** — `describe`, `it`, `beforeEach`, `afterEach`
- **`assert` from `node:assert/strict`**
- **Sinon** — `createSandbox`, `createStubInstance`, `stub()`, `sinon.assert.*`
- **`TestAdapter`** from `test/hosting/testStubs.ts` for adapter-level tests

Test files live at `packages/agents-hosting/test/hosting/app/proactive/`, mirroring the `src`
structure.

---

### `conversation.test.ts`

Pure unit tests, no adapter needed.

- Constructor from `TurnContext` — captures `getConversationReference()` and identity claims correctly
- Constructor from `(reference, claims)` — stores both
- `identity` getter — returns JwtPayload shape with `aud` from claims
- `validate()` — throws if `reference.conversation.id` missing
- `validate()` — throws if `reference.serviceUrl` missing
- `validate()` — throws if `claims.aud` missing
- `validate()` — passes when all required fields present
- JSON roundtrip — `JSON.parse(JSON.stringify(conv))` can be reconstructed with same `reference`
  and `claims` (critical: objects are written to and read from storage; a shape change silently
  breaks the storage lookup)
- `toJson()` returns a JSON string that round-trips back to the same `reference` and `claims`
- `toJson()` output does not include the `identity` getter (derived, not stored)

---

### `conversationReferenceBuilder.test.ts`

- `serviceUrlForChannel('msteams')` returns the correct Teams service URL
- `serviceUrlForChannel('webchat')` returns the correct webchat URL
- `serviceUrlForChannel('unknown-channel')` returns empty string
- `create()` sets `agent.id` to `agentClientId`
- `withUser(userId)` sets `reference.user`
- `withConversationId(id)` sets `reference.conversation.id`
- `build()` fills in `serviceUrl` from channel default when not explicitly set
- `build()` preserves a caller-supplied `serviceUrl`

---

### `conversationBuilder.test.ts`

- `create(agentClientId, channelId)` produces a `Conversation` with `claims.aud === agentClientId`
- `fromContext(turnContext)` captures both the conversation reference and claims
- Fluent chaining — `.withUser().withConversationId().build()` produces the expected shape
- `withReference(ref)` merges into the existing reference rather than replacing it
- `build()` auto-fills `serviceUrl` from `serviceUrlForChannel()` when missing
- `build()` calls `validate()` and throws if `aud` is missing

---

### `createConversationOptionsBuilder.test.ts`

- `build()` throws if `.withUser()` was never called (no members)
- `withUser(userId)` sets `parameters.members`
- `withTenantId(id)` sets `parameters.tenantId`
- `withTenantId(id)` **also** sets `channelData.tenant.id` on `msteams` channel
- `withTenantId(id)` does **not** set `channelData` on non-Teams channels
- `withTeamsChannelId(id)` sets `isGroup = true` and `channelData.channel.id` on `msteams`
- `withTeamsChannelId(id)` does nothing on other channels
- `withActivity(activity)` sets `parameters.activity`; `build()` defaults its type to `'message'`
- `withScope(scope)` overrides the default `AzureBotScope`
- `build()` defaults scope to `AzureBotScope` when not explicitly set
- `withChannelData()` called twice merges rather than replaces
- `storeConversation(true)` sets `storeConversation: true` on the result
- `build()` defaults `storeConversation` to `false` when not set

---

### `proactive.test.ts`

The most complex test file. Requires a stub adapter. `TestAdapter` does not implement
`continueConversation`, so tests use sinon to stub it:

```typescript
let storage: MemoryStorage
let adapter: TestAdapter
let app: AgentApplication<TurnState>
let proactive: Proactive<TurnState>

beforeEach(() => {
  storage = new MemoryStorage()
  adapter = new TestAdapter()
  sinon.stub(adapter, 'continueConversation').callsFake(async (identity, ref, logic) => {
    const ctx = new TurnContext(adapter, Activity.getContinuationActivity(ref))
    await logic(ctx)
  })
  app = new AgentApplication({ storage, proactive: { storage } })
  proactive = app.proactive
})
```

**Storage operations:**

- `storeConversation(context)` writes with key `conversationreferences/{conversationId}` and
  returns the conversation ID
- `storeConversation(conversation)` same behaviour with an explicit `Conversation` object
- `getConversation(id)` reads from storage and returns a `Conversation`
- `getConversation(nonexistent-id)` returns `undefined`
- `getConversationOrThrow(nonexistent-id)` throws
- `deleteConversation(id)` removes the key; subsequent `getConversation` returns `undefined`

**`sendActivity`:**

- String overload calls `adapter.continueConversation` after looking up storage; assert called
  with correct identity and reference
- `Conversation` overload same, without the storage lookup
- Defaults `activity.type` to `'message'` when not set
- Returns the `ResourceResponse` from the inner `context.sendActivity` call
- String overload throws if `conversationId` not found in storage
- Re-throws exceptions that occur inside the adapter callback (the adapter swallows errors
  without this capture-and-rethrow pattern)

**`continueConversation`:**

- String overload calls `adapter.continueConversation` after storage lookup
- `Conversation` overload calls directly with correct identity and reference
- Creates a fresh `TurnState` via `app.options.turnStateFactory()` — not the app's existing state
- Calls `turnState.load(context, app.options.storage)` before invoking the handler
- Calls `turnState.save(context, app.options.storage)` after the handler completes
- Handler receives `(context, state)` — assert both are the correct types
- Re-throws exceptions from inside the handler
- Throws if `conversationId` not found (string overload)

**`AgentApplication.proactive` getter:**

- `.proactive` throws when `options.proactive` was not set
- `.proactive` returns the `Proactive` instance when configured with explicit storage
- When `proactive.storage` is omitted but `options.storage` is set — initialises successfully
  and emits a `warn` log (assert via sinon-stubbed logger)
- When neither `proactive.storage` nor `options.storage` is set — throws at construction time

---

### What We're Not Testing

- `createConversation` — wraps `adapter.createConversationAsync` which requires real
  network/auth. Integration test territory, not unit.
- `CloudAdapter.continueConversation` internals — already covered in `cloudAdapter.test.ts`.

---

## Decisions

1. **`ProactiveOptions.storage` is optional.** If omitted, the subsystem falls back to
   `AgentApplicationOptions.storage`. If that is also absent, initialization throws. A `warn()`
   log is emitted when the fallback is used, to make the implicit dependency visible.

2. **`Proactive.sendActivity` is instance-only.** Both the `conversationId` string overload and
   the `Conversation` object overload are instance methods. No static variant.

3. **`sendProactiveActivity()` is not deprecated.** It stays as-is with no `@deprecated` tag.
   A `@remarks` note pointing to `app.proactive.sendActivity()` as the preferred pattern for
   new code may be added in a follow-up pass once the C# PR merges.
