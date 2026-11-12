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

## Teams API 2.2

The extension uses `@microsoft/teams.api` 2.2.0. Targeted messaging and extended
markdown are generally available. Experimental reply chains/threading, Plans and
Steps, HTML widgets, and Socket Mode are not integrated by this upgrade.

### Meeting metadata and event payloads

`teamsGetMeetingInfo(activity)` returns the incoming `channelData.meeting`, typed
as `ChannelData['meeting']`, or `undefined` when absent. It does not fetch full
meeting details; use the Teams client for that separate request.

Meeting start/end handlers now receive `MeetingStartValue` and `MeetingEndValue`,
respectively, using the upstream event payloads. This corrects the previous
`MeetingDetails` REST-model typing and is a public type compatibility change.
Use `Id`, `Title`, `MeetingType`, and `StartTime` or `EndTime`; `JoinUrl` can be
missing or `null`. Incoming values are passed through without renaming fields.

### Extended markdown

Use extended markdown on Teams clients that support it. The normal markdown
default is unchanged; this does not enable HTML widgets.

```typescript
import { Activity, TextFormatTypes } from '@microsoft/agents-activity'

await context.sendActivity(Activity.fromObject({
  type: 'message',
  textFormat: TextFormatTypes.ExtendedMarkdown,
  text: '## Result\n\n**Status:** Complete.'
}))
```

### Sensitivity labels

The shared `SensitivityUsageInfo` now accepts an optional nested `@id` for both
message and citation labels. Teams Purview labels use the actual label GUID;
`position` supplies the priority used to select the most restrictive label.
The shared Activity model does not enforce Teams-specific GUID validation.
Existing `type`, `@type`, and `name` fields remain required for compatibility.

```typescript
import type { SensitivityUsageInfo } from '@microsoft/agents-activity'

const label: SensitivityUsageInfo = {
  type: 'https://schema.org/Message',
  '@type': 'CreativeWork',
  '@id': purviewLabelId,
  name: 'Confidential',
  position: 1
}
context.streamingResponse.setSensitivityLabel(label)
context.streamingResponse.setGeneratedByAILabel(false)
context.streamingResponse.queueTextChunk('Labeled response.')
await context.streamingResponse.endStream()
```

Labels and citations are preserved on final responses even without AI labeling.
A sensitivity label alone does not add `AIGeneratedContent`. Existing root message
metadata is reused, including during timeout recovery.

### Teams streaming behavior

Teams enforces a ten-minute streaming window from the first informative/content
update. A recognized service timeout updates the original activity with the
completed response, preserving text, cards, citations, and labels without stream
markers. Failed recovery returns `StreamingResponseResult.Error`.

A non-timeout Teams `ContentStreamNotAllowed` rejection now returns `Error`, not
`UserCanceled`: it no longer indicates a user pressing the removed Stop button.
Other channels retain their cancellation interpretation. M365 Copilot retains its
separate 35-second working notices and 105-second streaming fallback.

Upstream `ActivityInput.withReplyToId()` was removed. This extension does not use
it; use `addQuotedReply` for the extension's quoted-reply support.

## License

MIT
