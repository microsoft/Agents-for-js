# Proactive Agent

Demonstrates the proactive messaging subsystem from `@microsoft/agents-hosting`.

The agent does two things during a normal conversation turn:
- Stores the conversation reference (using `app.proactive.storeConversation`)
- Replies with the resulting conversation ID so you can use it to trigger proactive messages later

Two additional HTTP endpoints allow external callers to initiate proactive turns outside of the standard request/response flow.

## Prerequisites

- [Node.js](https://nodejs.org/en) version 20 or higher
- A registered Azure Bot (App ID, secret, tenant ID)
- A tunneling tool such as [dev tunnels](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/get-started?tabs=windows) for local testing

## Setup

1. Copy `env.TEMPLATE` to `.env` and fill in your credentials:

   ```
   connections__serviceConnection__settings__clientId=<your-app-id>
   connections__serviceConnection__settings__clientSecret=<your-client-secret>
   connections__serviceConnection__settings__tenantId=<your-tenant-id>
   ```

2. Install dependencies and start the agent:

   ```bash
   npm install
   npm start
   ```

The server listens on port `3978` by default (override with `PORT`).

## Endpoints

### `POST /api/messages`

Standard Bot Framework messages endpoint. All incoming activities are processed here.

When the agent receives a `message` activity it stores the conversation reference and replies with the conversation ID:

```
Your conversation has been stored. Use this ID to trigger a proactive message:
`19:abc123@thread.tacv2`
```

Send `/teams-payload` as a message to receive a pre-filled JSON body suitable for calling `POST /api/proactive/teams-channel`.

---

### `POST /api/proactive/continue/:conversationId`

Continues a previously stored conversation. The agent sends a message into the conversation as if it were responding to an incoming activity.

**URL parameter**

| Parameter        | Description                                              |
|------------------|----------------------------------------------------------|
| `conversationId` | The ID returned when the conversation was stored         |

**Request body** (optional JSON)

Any fields in the request body are forwarded to the turn handler via `activity.value`. The `message` field is used as the notification text:

```json
{ "message": "Your report is ready." }
```

If `message` is omitted the agent sends a default "You have a proactive message!" text.

**Responses**

| Status | Body                                        | Meaning                                    |
|--------|---------------------------------------------|--------------------------------------------|
| `200`  | `{ "status": "ok", "conversationId": "…" }` | Activity sent successfully                 |
| `404`  | `{ "error": "…" }`                          | No stored conversation for that ID         |
| `500`  | `{ "error": "…" }`                          | Adapter or channel error                   |

**Example**

```bash
curl -X POST http://localhost:3978/api/proactive/continue/19:abc123@thread.tacv2 \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Your nightly report is ready." }'
```

> See [Caller Authentication](#caller-authentication) for how to obtain a JWT token, or disable auth for local testing by leaving `ALLOWED_CALLERS` empty and calling without the `Authorization` header.

---

### `POST /api/proactive/teams-channel`

Creates a brand-new Teams conversation (1:1 or channel) using `CreateConversationOptionsBuilder`. Sends an initial greeting message into the new conversation.

**Request body**

| Field            | Type   | Required | Description                                                           |
|------------------|--------|----------|-----------------------------------------------------------------------|
| `userId`         | string | yes      | AAD object ID of the Teams user to contact                            |
| `tenantId`       | string | yes      | AAD tenant ID                                                         |
| `teamsChannelId` | string | no       | Teams channel ID; omit for a 1:1 personal chat                        |

**Responses**

| Status | Body                                                    | Meaning                          |
|--------|---------------------------------------------------------|----------------------------------|
| `200`  | `{ "status": "ok", "conversationId": "…" }`             | Conversation created             |
| `400`  | `{ "error": "userId and tenantId are required." }`      | Missing required fields          |
| `500`  | `{ "error": "…" }`                                      | Adapter or channel error         |

**Example**

```bash
curl -X POST http://localhost:3978/api/proactive/teams-channel \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "aad-object-id", "tenantId": "tenant-id" }'
```

> See [Caller Authentication](#caller-authentication) for how to obtain a JWT token, or disable auth for local testing by leaving `ALLOWED_CALLERS` empty and calling without the `Authorization` header.

To get the correct values for your current user, send `/teams-payload` to the agent in Teams — it will reply with the pre-filled JSON body to use here.

---

## Caller Authentication

The proactive endpoints (`/api/proactive/*`) require the caller to authenticate using a JWT token (same mechanism as `/api/messages`).

In addition, you can restrict which app IDs are allowed to call these endpoints by setting `ALLOWED_CALLERS` in your `.env` file:

```
ALLOWED_CALLERS=app-id-1,app-id-2
```

When `ALLOWED_CALLERS` is empty, the caller check is skipped. This is convenient for local development but **must not be used in production**.

## Further Reading

- [Proactive messaging concepts](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-howto-proactive-message)
- [Microsoft 365 Agents SDK](https://github.com/microsoft/agents)
