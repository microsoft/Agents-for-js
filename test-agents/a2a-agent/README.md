# Authenticated agent-to-agent cat smoke test

This test agent pair demonstrates the authenticated callback pattern:

1. **I'll Ask My Cat** receives a user message.
2. It delegates the activity to **The Wise Cat** with `AgentClient`.
3. The Wise Cat replies from a cat's point of view.
4. The reply is posted to the first agent's authenticated `configureResponseController` route.
5. The first agent forwards the reply to the original conversation.

The smoke client verifies that:

- a request without a token is rejected with `401`;
- a valid token for the wrong audience is rejected with `401`;
- a valid token for the human agent is accepted;
- the Wise Cat's independently authenticated callback reaches the original conversation.

## Why authentication looks different in each agent

Both agents use the same SDK authentication stack, but they use different hosting
surfaces:

- **I'll Ask My Cat configures authentication explicitly.** It creates the
  `AuthConfiguration`, `CloudAdapter`, Express `/api/messages` route, and
  `configureResponseController` callback route itself. It needs access to the
  same adapter, authentication configuration, and `ConversationState` when
  `AgentClient` delegates work and when the Wise Cat posts its response. The
  messages route calls `adapter.authorizeRequest` explicitly; the response
  controller calls that same adapter method internally so a host cannot
  accidentally register an unauthenticated callback.
- **The Wise Cat configures authentication implicitly through `startServer`.**
  `startServer` loads the Cat agent's connection settings from `.env.cat`,
  creates its `CloudAdapter`, and applies JWT validation to `/api/messages`.
  When the Cat calls `context.sendActivity()`, that adapter automatically
  acquires a token for the Human agent and posts to the activity's callback
  `serviceUrl`.

The Cat is not anonymous or less protected; its setup is simply hidden behind
the higher-level `startServer` helper. The Human agent uses lower-level hosting
APIs because it must expose both the normal message endpoint and the additional
agent-response endpoint.

For the Human callback endpoint, the shared `CloudAdapter` validates the inbound
JWT once against its configured host connections. The callback handler then
checks that the token's caller application is the Wise Cat client ID stored when
the delegated conversation was created. The conversation ID routes the callback;
it is not treated as an authentication secret.

## Microsoft Entra setup

Create two confidential-client app registrations in the same tenant:

- **Human agent** — the "I'll Ask My Cat" host.
- **Wise Cat agent** — the delegated agent and smoke-test caller.

Expose each application as an API. Grant and admin-consent application permissions in both directions:

- Human agent may request an application token for the Wise Cat API.
- Wise Cat may request an application token for the Human agent API.

The token audience used by this SDK is the target application's client ID. Ensure each app registration accepts client-credential tokens requested with `<target-client-id>/.default`.

The Human agent also sends the final activity through the stored conversation reference. For a real channel, configure the normal Bot Service permissions for the Human agent. The included mock channel accepts the outbound callback and does not validate that channel token.

## Configure

From `test-agents/a2a-agent`, copy and fill in:

```powershell
Copy-Item .env.human.TEMPLATE .env.human
Copy-Item .env.cat.TEMPLATE .env.cat
Copy-Item .env.smoke.TEMPLATE .env.smoke
```

The smoke client uses both app secrets to request one deliberately wrong-audience
token and one valid token. Do not commit the populated `.env.*` files.

## Run

Use three terminals:

```powershell
npm run start:human --workspace a2a-agent
```

```powershell
npm run start:cat --workspace a2a-agent
```

```powershell
npm run smoke --workspace a2a-agent
```

A successful run reports both rejected auth checks and ends with:

```text
A2A cat smoke test passed: invalid auth was rejected and the authenticated delegated response returned.
```
