# Teams Samples

This directory contains sample agents that demonstrate Microsoft Teams integration features using the Microsoft 365 Agents SDK for JavaScript/TypeScript.

Samples are organized into two groups:

- **Root-level samples** — use the modern `AgentApplication` + `TeamsAgentExtension` API.
- **`compat/` samples** — use the legacy `TeamsActivityHandler` API (compatible with the BotFramework v4 handler pattern).

Both approaches use `startServer()` from `@microsoft/agents-hosting-express` which starts an Express server on port `3978` (or the `PORT` env variable).

---

## Prerequisites

1. **Node.js 20+**
2. **npm workspaces built** — from the repo root run:
   ```bash
   npm install
   npm run build
   ```
3. **Azure Bot registration** — you need an Azure Bot resource with a Microsoft App ID and password. Set these in your `.env` file.
4. **Tunneling** — Teams must be able to reach your local server. Use [Dev Tunnels](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/overview) or ngrok to expose `localhost:3978`.
5. **Teams App Manifest** — each sample needs a `manifest.json` sideloaded into Teams. Use the base manifest in `_resources/appManifest` and add the sample-specific sections described for each sample.

### Environment Variables

Create a `.env` file (or use the `--env-file` flag) with at least:

```env
connections__serviceConnection__settings__clientId=<your-app-id>
connections__serviceConnection__settings__clientSecret=<your-app-password>
connections__serviceConnection__settings__tenantId=<your-tenant-id>
```

### Running a Sample

```bash
# From the repo root
npx tsx --env-file .env samples/teams/<sampleFile>.ts

# Examples
npx tsx --env-file .env samples/teams/teamsConversationExample.ts
npx tsx --env-file .env samples/teams/compat/echo.ts
```

The server will start on `http://localhost:3978` and listen for POST requests at `/api/messages`.

---

## Base Manifest

All samples share the base `manifest.json` in `_resources/appManifest`. Copy it as a starting point and merge in the sample-specific sections documented for each sample below. Package the appManifest content into a `.zip` and sideload it into Teams.

---

## AgentApplication Samples (Root Level)

### `teamsConversationExample.ts` — Teams Conversation

Comprehensive sample demonstrating core Teams conversation features using `AgentApplication` with `TeamsAgentExtension`.

**Features illustrated:**
- Proactive messaging to all team members (`messageall`) via `CreateConversationOptionsBuilder`
- Targeted messages visible only to specific users (`targeted`) via `makeTargetedActivity()`
- @mention a user (`mentionme` / `atmention`)
- Identify the current user via `TeamsInfo.getMember` (`whoami`)
- Update an existing card in-place (`update`)
- Delete a card (`delete`)
- Channel lifecycle events: channel created, renamed, deleted
- Team renamed event
- Member added / removed events
- Hero cards with `MessageBack` actions

**How to test:**
1. Install the sample in a **team channel** or **groupChat**.
2. Send any message in the channel — the bot replies with a Hero Card containing action buttons.
3. Click **"Message all members"** — the bot sends a 1:1 proactive message to every team member.
4. Click **"Who am I?"** — the bot replies with your Teams member name.
5. Click **"Mention Me"** — the bot replies with an @mention of your name.
6. Click **"Update Card"** — the card updates in-place showing an incrementing counter.
7. Click **"Delete Card"** — the card is removed from the conversation.
8. Click **"Send Targeted"** (in a group chat) — each member receives a targeted message only they can see.
9. Add/remove members or create/rename/delete channels or rename the team to see the event handlers fire.

**Manifest — additional sections:**

The base manifest already includes everything needed. No additional sections required.

---

### `cardActions.ts` — Adaptive Card Actions

Demonstrates Adaptive Card `Action.Execute` and `Action.Submit` handling using `AgentApplication.adaptiveCards`.

**Features illustrated:**
- `adaptiveCards.actionExecute('doStuff', ...)` — handles Universal Action `Action.Execute` and returns an updated Adaptive Card.
- `adaptiveCards.actionSubmit('doStuff', ...)` — handles `Action.Submit` and processes the submitted data.
- Sending Adaptive Cards from message commands (`/acExecute`, `/acSubmit`).

**How to test:**
1. Start the sample and sideload the app.
2. Send `/acExecute` — the bot sends an Adaptive Card with an `Action.Execute` button. Type text in the input and click **"Execute doStuff"**. The card refreshes with an acknowledgement.
3. Send `/acSubmit` — the bot sends an Adaptive Card with an `Action.Submit` button. Type text and click **"Submit doStuff"**. The bot sends a text reply with the submitted JSON.

**Manifest — additional sections:**

The base manifest already includes everything needed. No additional sections required.

---

### `meetingsExample.ts` — Teams Meetings

Handles Teams meeting lifecycle events using `TeamsAgentExtension.meetings`. Handlers receive strongly-typed `MeetingDetails` and `MeetingParticipantsEventDetails` objects from `@microsoft/teams.api`.

**Features illustrated:**
- `meetings.onStart(context, state, details: MeetingDetails)` — triggered when a meeting begins, receives meeting details.
- `meetings.onEnd(context, state, details: MeetingDetails)` — triggered when a meeting ends, receives meeting details.
- `meetings.onParticipantsJoin(context, state, details: MeetingParticipantsEventDetails)` — triggered when participants join, receives participant info.
- `meetings.onParticipantsLeave(context, state, details: MeetingParticipantsEventDetails)` — triggered when participants leave, receives participant info.
- Basic message handling with `help` and `meeting info` commands.

**How to test:**
1. Start the sample and sideload the app.
2. Add the bot to a Teams meeting (via the meeting chat or the meeting details "Apps" tab).
3. Start the meeting — the bot sends "Welcome to the meeting!".
4. Have participants join/leave — the bot announces each event.
5. End the meeting — the bot sends a farewell message.
6. In the meeting chat, send `help` for a list of commands.

**Manifest — additional sections:**

Add `authorization` to the base manifest:

```json
"authorization": {
  "permissions": {
    "resourceSpecific": [
      {
          "name": "OnlineMeeting.ReadBasic.Chat",
          "type": "Application"
      },
      {
          "name": "ChannelMeeting.ReadBasic.Group",
          "type": "Application"
      },
      {
          "name": "OnlineMeetingParticipant.Read.Chat",
          "type": "Application"
      }
    ]
  }
```

> **Note:** Meeting events require the bot to be added to the meeting and the meeting must be a scheduled Teams meeting (not an ad-hoc call).

---

### `msgExtensionExample.ts` — Message Extensions

Demonstrates search-based and action-based message extensions using `TeamsAgentExtension.messageExtensions`.

**Features illustrated:**
- `onQuery('searchQuery', ...)` — handles search queries from the compose extension, returning a list of results.
- `onQueryLink(...)` — handles link unfurling, returning a preview card for pasted URLs.
- `onSelectItem(...)` — handles item selection from query results, returning a detailed Adaptive Card.
- `onSubmitAction('createCard', ...)` — handles action-based compose extension submissions, creating cards from user input.
- `onQueryUrlSetting(...)` — provides a configuration URL when the extension settings are requested.

**How to test:**
1. Start the sample and sideload the app with the compose extension manifest entries (see below).
2. In the compose box, click the **"+"** (Actions and Apps) and find your extension.
3. Type a search term — the bot returns a list of thumbnail cards. Click one to insert a detailed card.
4. Use the `create card` action command — fill in Title and Description and submit. The bot inserts an Adaptive Card.
5. Paste a link matching your configured domain — the bot returns a link preview card.

**Manifest — additional sections:**

Add `composeExtensions` to the base manifest:

```json
{
  "composeExtensions": [
    {
      "botId": "<your-app-id>",
      "commands": [
        {
          "id": "searchQuery",
          "type": "query",
          "title": "Search",
          "description": "Search for items",
          "initialRun": true,
          "parameters": [
            {
              "name": "query",
              "title": "Search query",
              "description": "Your search query",
              "inputType": "text"
            }
          ]
        },
        {
          "id": "createCard",
          "type": "action",
          "title": "Create Card",
          "description": "Create a card from user input",
          "fetchTask": true,
          "parameters": [
            { "name": "title", "title": "Title", "inputType": "text" },
            { "name": "description", "title": "Description", "inputType": "text" }
          ]
        }
      ],
      "messageHandlers": [
        {
          "type": "link",
          "value": { "domains": ["*.example.com"] }
        }
      ]
    }
  ]
}
```

> Replace `*.example.com` in `messageHandlers` with the domain(s) you want link unfurling to activate on (e.g.: github.com).

---

### `taskModuleExample.ts` — Task Modules (Dialogs)

Demonstrates task module fetch/submit flows using `TeamsAgentExtension.taskModules`, including multi-step forms.

**Features illustrated:**
- `onFetch('simple_form', ...)` — returns an Adaptive Card form inside a task module dialog.
- `onSubmit('simple_form', ...)` — processes the simple form submission and replies.
- Multi-step form flow: `onFetch('multi_step_form')` → `onSubmit('multi_step_form_submit_name')` → `onSubmit('multi_step_form_submit_email')`.
- Returning `type: 'continue'` to chain task module steps.
- Returning `type: 'message'` to close the dialog with a message.

**How to test:**
1. Start the sample and sideload the app.
2. Send any message — the bot replies with an Adaptive Card with buttons: **Simple Form**, **Multi-Step Form***.
3. Click **"Simple Form"** — a task module dialog opens with a name input. Enter a name and click Submit. The bot sends a confirmation message.
4. Click **"Multi-Step Form"** — Step 1 asks for your name. After submitting, Step 2 asks for your email. After the second submit, the bot confirms both values.

**Manifest — additional sections:**

The base manifest already includes everything needed. No additional sections required.



> Task modules using `task/fetch` require `Action.Submit` with `msteams.type: "task/fetch"` in the card data. The manifest `validDomains` must include any domain used in web-based task modules.

---

### `teamsAttachments.ts` — File Attachments

Demonstrates receiving and counting file attachments sent by users in Teams using `M365AttachmentDownloader`.

**Features illustrated:**
- `M365AttachmentDownloader` — automatically downloads files attached to incoming messages.
- Counting received attachments via turn state.

**How to test:**
1. Start the sample and sideload the app in a personal chat.
2. Send a message with one or more file attachments (drag & drop or use the attach button).
3. The bot replies with "You sent X file(s)".

**Manifest — additional sections:**

Set `"supportsFiles": true` on the bot entry in the base manifest:

```json
{
  "bots": [
    {
      "botId": "<your-app-id>",
      "scopes": ["personal", "team", "groupChat"],
      "supportsFiles": true
    }
  ]
}
```

> **Important:** `"supportsFiles": true` is required for Teams to show the file upload prompt in conversations with the bot.

---

### `teamsInfoExample.ts` — TeamsInfo API

Demonstrates using `TeamsInfo` static methods to query Teams-specific information. Uses `SetTeamsApiClientMiddleware` (required when not using `TeamsAgentExtension`) to initialize the Teams API client on each turn.

**Features illustrated:**
- `TeamsInfo.getMember(context, id)` — get details for a specific team member.
- `TeamsInfo.getTeamDetails(context)` — get the current team's details.
- `TeamsInfo.getTeamChannels(context)` — list channels in the current team.
- `TeamsInfo.getMeetingInfo(context)` — get meeting info (when in a meeting context).
- `TeamsInfo.getPagedMembers(context)` — list team members with paging support.
- `SetTeamsApiClientMiddleware` wired via `startServer`'s `configureAdapter` option.

**How to test:**
1. Start the sample and sideload the app into a team.
2. Send any message — the bot replies with available commands.
3. Send `getMember` — the bot returns your member details as JSON.
4. Send `getTeamDetails` — the bot returns team name, ID, etc. (must be in a team channel, not personal chat).
5. Send `getTeamChannels` — the bot lists all channels.
6. Send `getPagedMembers` — the bot lists all team members.
7. Send `getMeetingInfo` — returns meeting details (only works during a meeting).

**Manifest — additional sections:**

The base manifest already includes everything needed. No additional sections required.

---

## Compat Samples (`compat/`)

These samples use the `TeamsActivityHandler` class (BotFramework v4 handler-style API). They require `SetTeamsApiClientMiddleware` to be wired via `startServer`'s `configureAdapter` option.

### `compat/echo.ts` — Echo Bot

Minimal Teams echo bot.

**Features illustrated:**
- `TeamsActivityHandler` subclass with `onMessage` and `onMembersAdded`.
- `SetTeamsApiClientMiddleware` wiring pattern.

**How to test:**
1. Start the sample and sideload the app.
2. Send any message — the bot echoes it back: "You said: \<your message\>".
3. Add the bot to a conversation — it sends "Welcome to the Teams bot!".

**Manifest — additional sections:**

The base manifest already includes everything needed. No additional sections required.

---

### `compat/msgExtension.ts` — NuGet Search Message Extension

A search-based message extension that queries the NuGet package registry using the `TeamsActivityHandler` override pattern.

**Features illustrated:**
- `handleTeamsMessagingExtensionQuery` — overrides the base handler to search NuGet packages and return thumbnail card results.
- `handleTeamsMessagingExtensionSelectItem` — overrides the base handler to return a detailed card when a search result is selected.
- Building `MessagingExtensionAttachment` objects with preview cards.
- Using `CardFactory.contentTypes.heroCard` for card content types.

**How to test:**
1. Start the sample and sideload the app with compose extension manifest entries.
2. In the compose box, click the **"+"** (Actions and Apps) and find your extension.
3. Type a NuGet package name (e.g., "Newtonsoft") — the bot returns matching packages as thumbnail cards.
4. Click a result — a detailed card is inserted into the compose box with links to the NuGet page and project URL.

**Manifest — additional sections:**

Add `composeExtensions` to the base manifest:

```json
{
  "composeExtensions": [
    {
      "botId": "<your-app-id>",
      "commands": [
        {
          "id": "searchQuery",
          "type": "query",
          "title": "Search NuGet",
          "description": "Search NuGet packages",
          "initialRun": true,
          "parameters": [
            {
              "name": "query",
              "title": "Search query",
              "description": "NuGet package name",
              "inputType": "text"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### `compat/teamsConversation.ts` — Teams Conversation (Compat)

Full-featured conversation bot using `TeamsActivityHandler` — the compat equivalent of `teamsConversationExample.ts`.

**Features illustrated:**
- Proactive messaging to all team members via `CloudAdapter.createConversationAsync` and `continueConversation`.
- @mention a user in a plain text reply.
- @mention a user in an Adaptive Card using the `UserMentionCardTemplate.json` template.
- Identify the current user via `TeamsInfo.getMember`.
- Update a Hero Card in-place with an incrementing counter.
- Delete a card from the conversation.
- `onTeamsMembersAddedEvent` / `onTeamsMembersRemovedEvent` — member lifecycle events.
- `onTeamsChannelCreatedEvent` / `onTeamsChannelRenamedEvent` / `onTeamsChannelDeletedEvent` — channel lifecycle events.
- `onTeamsTeamRenamedEvent` — team renamed event.

**How to test:**
1. Start the sample and sideload the app into a team.
2. Send any message — the bot replies with a Welcome Hero Card with action buttons.
3. Click **"Message all members"** — the bot sends a 1:1 proactive message to every member.
4. Click **"Who am I?"** — the bot replies with your member name.
5. Click **"Find me in Adaptive Card"** — the bot sends an Adaptive Card with your name, UPN, and AAD ID as an @mention.
6. Send `mention` — the bot replies with a plain-text @mention of your name.
7. Click **"Update Card"** — the card is updated in-place with an incrementing counter.
8. Click **"Delete card"** — the card is removed from the conversation.
9. Add/remove members, create/rename/delete channels, or rename the team to observe event handling.

**Manifest — additional sections:**

The base manifest already includes everything needed. No additional sections required.

---

### `compat/teamsEvents.ts` — Teams Events

Demonstrates handling a wide range of Teams lifecycle events using `TeamsActivityHandler` method overrides.

**Features illustrated:**
- **Message events:** `onTeamsMessageEdit`, `onTeamsMessageUndelete`, `onTeamsMessageSoftDelete`
- **Member events:** `onTeamsMembersAdded`, `onTeamsMembersRemoved`
- **Team events:** `onTeamsTeamRenamed`, `onTeamsTeamArchived`, `onTeamsTeamDeleted`, `onTeamsTeamHardDeleted`, `onTeamsTeamRestored`, `onTeamsTeamUnarchived`
- **Channel events:** `onTeamsChannelCreated`, `onTeamsChannelDeleted`, `onTeamsChannelRenamed`, `onTeamsChannelRestored`

**How to test:**
1. Start the sample and sideload the app into a team.
2. Send any message — the bot echoes it.
3. **Edit** a message in the conversation — the bot replies "You edited a message".
4. **Delete** a message — the bot replies "You deleted a message".
5. **Undo delete** (undelete) a message — the bot replies "You undeleted a message".
6. **Add** a member to the team — the bot announces the new member.
7. **Remove** a member — the bot announces the removal.
8. **Rename** the team — the bot announces the name change.
9. **Archive/restore/delete** the team — the bot announces each event.
10. **Create/rename/delete/restore** a channel — the bot announces each event.


**Manifest — additional sections:**

The base manifest already includes everything needed. No additional sections required.

---

## Sample Summary

| Sample | API Style | Key Features |
|--------|-----------|-------------|
| `teamsConversationExample.ts` | AgentApplication | Proactive messages, targeted messages, @mentions, card update/delete, channel & team events |
| `cardActions.ts` | AgentApplication | Adaptive Card `Action.Execute` and `Action.Submit` |
| `meetingsExample.ts` | AgentApplication | Meeting start/end, participant join/leave (typed `MeetingDetails`) |
| `msgExtensionExample.ts` | AgentApplication | Search query, link unfurling, item select, action submit, settings URL |
| `taskModuleExample.ts` | AgentApplication | Task module fetch/submit, multi-step form dialogs |
| `teamsAttachments.ts` | AgentApplication | File attachment download and counting |
| `teamsInfoExample.ts` | AgentApplication | TeamsInfo API queries (member, team, channels, meeting, paged members) |
| `compat/echo.ts` | TeamsActivityHandler | Minimal echo bot |
| `compat/msgExtension.ts` | TeamsActivityHandler | NuGet package search message extension |
| `compat/teamsConversation.ts` | TeamsActivityHandler | Full conversation features, proactive messaging, @mentions, card actions, lifecycle events |
| `compat/teamsEvents.ts` | TeamsActivityHandler | Comprehensive Teams lifecycle event handlers |
