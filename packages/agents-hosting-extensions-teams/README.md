# @microsoft/agents-hosting-extensions-teams

Microsoft Teams extension for the Microsoft 365 Agents SDK for JavaScript.

## Installation

```bash
npm install @microsoft/agents-hosting-extensions-teams
```

## Overview

This package provides Teams-specific functionality for building agents in Microsoft Teams. It includes support for:

- Message handling (edit, delete, undelete)
- Meeting events (start, end, participant join/leave)
- Reactions and screen sharing events
- Message extensions and task modules
- Teams information access

## Usage

### Basic Setup

```typescript
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'

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
  tae.meeting
    .onMeetingStart(async (context, state) => {
      await context.sendActivity('Meeting started! I\'m here to assist.')
    })
    .onMeetingEnd(async (context, state) => {
      await context.sendActivity('The meeting has ended. Thanks for participating!')
    })
    .onParticipantsJoin(async (context, state) => {
      await context.sendActivity('Welcome to the meeting!')
    })
    .onScreenShareStart(async (context, state) => {
      await context.sendActivity('Screen sharing has started.')
    })
    .onRecordingStarted(async (context, state) => {
      await context.sendActivity('Recording has started.')
    })
})
```

### Message Handling

Handle message events in Teams:

```typescript
app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.onMessageEdit(async (context, state) => {
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

### Message Extensions

Work with Teams message extensions:

```typescript
app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.messageExtension
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
  tae.taskModule
    .onFetch(async (context, state) => {
      // Return task module card
    })
    .onSubmit(async (context, state) => {
      // Handle task module submission
    })
})
```

## License

MIT

