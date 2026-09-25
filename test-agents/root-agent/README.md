# Root delegating agent

This test agent demonstrates **Activity-protocol delegation** from a root
**delegating agent** to a separately hosted **delegated agent**.

> This sample uses the Microsoft Agents SDK Activity callback flow. It is not an
> implementation of the open A2A protocol.

## Topology

```text
Original channel
    |
    | POST /api/messages
    v
Root agent (localhost:3978)
    |
    | AgentClient POST
    v
External Agent1 (localhost:39783)
    |
    | authenticated Activity callback
    v
Root agent /api/agentresponse/v3/conversations/{conversationId}/activities/{activityId}
    |
    v
Original channel conversation
```

This workspace starts only the root agent. It does not include an implementation
of `Agent1`; run a compatible delegated agent separately or change the
`Agent1_*` settings to point to one. Port `39783` is only the template's default
target-agent port. The root agent listens on `PORT`, or `3978` when `PORT` is
unset.

## Prerequisites

- A Microsoft Entra confidential-client application for the root agent.
- A separately hosted Activity-protocol agent with its own client ID.
- An Azure Blob Storage account and container for conversation and user state.
- Network access from the root agent to `Agent1_endpoint`.
- Network access from the delegated agent to `Agent1_serviceUrl`.

The callback can arrive after the original request or at another replica. Blob
storage preserves the original conversation reference and delegated-agent
ownership information needed to authenticate the callback and continue the
conversation.

## Configure

Copy `env.TEMPLATE` to `.env` and set every value:

```dotenv
connections__serviceConnection__settings__clientId=
connections__serviceConnection__settings__clientSecret=
connections__serviceConnection__settings__tenantId=

connectionsMap__0__connection=serviceConnection
connectionsMap__0__serviceUrl=*

BLOB_CONTAINER_ID=
BLOB_STORAGE_CONNECTION_STRING=

Agent1_endpoint=http://localhost:39783/api/messages
Agent1_clientId=<delegated-agent-client-id>
Agent1_serviceUrl=http://localhost:3978/api/agentresponse
```

- `connections__serviceConnection__settings__clientId` is the root agent's
  application client ID.
- `connections__serviceConnection__settings__clientSecret` is the root agent's
  client secret.
- `connections__serviceConnection__settings__tenantId` is its tenant ID.
- `connectionsMap__0__connection` selects that connection.
- `connectionsMap__0__serviceUrl=*` allows it to be used for service URLs.
- `BLOB_CONTAINER_ID` is the Blob container used by the state stores.
- `BLOB_STORAGE_CONNECTION_STRING` connects to the Blob Storage account.
- `Agent1_endpoint` is the delegated agent's Activity endpoint.
- `Agent1_clientId` is the delegated agent application authorized to return the
  callback.
- `Agent1_serviceUrl` is the root agent's callback base URL. A remotely hosted
  delegated agent must be able to reach it; replace localhost with the public or
  private routable address for that deployment.

Do not commit the populated `.env` file.

## Run

Start the external delegated agent first, then run:

```powershell
npm run start --workspace root-agent
```

The root agent exposes:

- `POST /api/messages` for authenticated incoming activities.
- `POST /api/agentresponse/v3/conversations/{conversationId}/activities/{activityId}`
  for the authenticated Activity callback.

Both route groups are limited to 100 requests per 15-minute window.

On the first message, the root agent asks for the user's name and stores it in
user state. Later messages are delegated to `Agent1`. `AgentClient` creates a
delegated conversation, stores the original conversation reference and
`Agent1_clientId`, and supplies `Agent1_serviceUrl` as the callback location.

When an authorized `endOfConversation` callback arrives, the root agent forwards
the optional result to the original conversation and deletes the delegated
conversation state.

## Callback security contract

- On configured or production hosts, missing, malformed, expired, or
  wrong-audience bearer tokens are rejected with `401`.
- A valid token from an application other than the delegated agent stored for
  the conversation is rejected with `403`.
- Missing, malformed, or legacy delegated state without the stored delegated
  agent client ID is rejected with `403`; restart that delegated conversation.
- Anonymous callbacks are allowed only for explicitly unconfigured development
  hosts outside production. A warning is emitted because callback ownership
  cannot be cryptographically verified. Production callbacks require
  authentication.
