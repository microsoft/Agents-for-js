# @microsoft/agents-hosting-extensions-msteams

Microsoft Teams extension for the Microsoft 365 Agents SDK for JavaScript.

Requires Node.js 22.12 or later.

## Installation

```bash
npm install @microsoft/agents-hosting-extensions-msteams
```

## Overview

This package provides Teams-specific functionality for building agents in Microsoft Teams. It includes support for:

- Message handling (edit, delete, undelete)
- Meeting events (start, end, participant join/leave)
- Message reactions (added/removed)
- Message extensions and task modules
- Teams information access

## Usage

### Basic Setup

```typescript
import { AgentApplication, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { addQuotedReply, TeamsAgentExtension, TeamsTurnContext } from '@microsoft/agents-hosting-extensions-msteams'

// Create the agent application
const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

// Create and register the Teams extension
const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  // Configure Teams-specific handlers here
  console.log('Teams extension registered')
})

// Handle messages
app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  await context.sendActivity(`I received your message: "${context.activity.text}"`)
})

// Start the server
startServer(app)
```

### Meeting Events

Handle various meeting events in Teams:

```typescript
app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.meetings
    .onStart(async (context, state) => {
      await context.sendActivity('Meeting started! I\'m here to assist.')
    })
    .onEnd(async (context, state) => {
      await context.sendActivity('The meeting has ended. Thanks for participating!')
    })
    .onParticipantsJoin(async (context, state) => {
      await context.sendActivity('Welcome to the meeting!')
    })
    .onParticipantsLeave(async (context, state) => {
      await context.sendActivity('Goodbye from the meeting!')
    })
})
```

### Message Handling

Handle message events in Teams:

```typescript
app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.messages
  .onMessageEdit(async (context, state) => {
    await context.sendActivity('I noticed you edited your message.')
  })

  tae.onMessageDelete(async (context, state) => {
    await context.sendActivity('I noticed you deleted a message.')
  })

  tae.onMessageUndelete(async (context, state) => {
    await context.sendActivity('I noticed you undeleted a message.')
  })
})
```

### Targeted messages and quoted replies

Send a message visible only to a specific member of a group conversation:

```typescript
const teamsContext = new TeamsTurnContext(context)
await teamsContext.sendTargetedActivity('Only you can see this message.', member)
```

Add Teams quoted-reply metadata to an outgoing activity:

```typescript
const reply = MessageFactory.text('Here is the follow-up.')
addQuotedReply(reply, messageId)
await context.sendActivity(reply)
```

### Message Extensions

Work with Teams message extensions:

```typescript
app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.messageExtensions
    .onQuery(async (context, state) => {
      // Handle message extension query
      return {
        composeExtension: {
          type: 'result',
          attachmentLayout: 'list',
          attachments: [
            // Your card attachments here
          ]
        }
      }
    })
    .onSelectItem(async (context, state) => {
      // Handle item selection
    })
})
```

### Task Modules

Handle Teams task modules:

```typescript
app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.taskModules
    .onFetch('simple_form', async (context, state, request) => {
      return {
        task: {
          type: 'message',
          value: 'Open task module'
        }
      }
    })
    .onSubmit('simple_form', async (context, state, request) => {
      return {
        task: {
          type: 'message',
          value: 'Task module submitted'
        }
      }
    })
})
```

## Migrating to Teams API 2.1

This release aligns the extension with the Teams SDK 2.1 surface and includes breaking changes:

- Node.js 22.12 or later is required by the Teams SDK dependency.
- `sendTargetedActivity` now requires an explicit recipient and accepts either an activity or text; `sendTargetedActivities` was removed.
- Meeting join and leave handlers use distinct `MeetingParticipantJoinValue` and `MeetingParticipantLeaveValue` payloads.
- Use `addQuotedReply` for quoted responses. Replies to inbound targeted messages automatically receive prompt-preview metadata.

## License

MIT
