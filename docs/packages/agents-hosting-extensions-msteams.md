# @microsoft/agents-hosting-extensions-msteams

Start with the [Microsoft 365 Agents SDK documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
for primary developer guidance. The examples below are excerpts; surrounding
application setup, variables, or imports may be omitted.

See the [package guide index](../PACKAGE-GUIDES.md) for related contributor guides.

For extension registration, meeting handlers, message extensions, and task modules,
see the [official Teams extension guides](https://learn.microsoft.com/microsoft-365/agents-sdk/teams/teams-extension?pivots=nodejs).

## Usage

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
import { TeamsTurnContext } from '@microsoft/agents-hosting-extensions-msteams'

const teamsContext = new TeamsTurnContext(context)
await teamsContext.sendTargetedActivity('Only you can see this message.', member)
```

Add Teams quoted-reply metadata to an outgoing activity:

```typescript
import { MessageFactory } from '@microsoft/agents-hosting'
import { addQuotedReply } from '@microsoft/agents-hosting-extensions-msteams'

const reply = MessageFactory.text('Here is the follow-up.')
addQuotedReply(reply, messageId)
await context.sendActivity(reply)
```

### Message-extension query registration

Query registration also supports a handler without a command selector:
`tae.messageExtensions.onQuery(handler)`.

## Migrating to Teams API 2.1

This release aligns the extension with the Teams SDK 2.1 surface and includes breaking changes:

- Node.js 22.12 or later is required by the Teams SDK dependency.
- `sendTargetedActivity` now requires an explicit recipient and accepts either an activity or text; `sendTargetedActivities` was removed.
- Meeting join and leave handlers use distinct `MeetingParticipantJoinValue` and `MeetingParticipantLeaveValue` payloads.
- Use `addQuotedReply` for quoted responses. Replies to inbound targeted messages automatically receive prompt-preview metadata.

## License

MIT
