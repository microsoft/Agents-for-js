# @microsoft/agents-hosting-extensions-slack

Slack channel extension for the Microsoft 365 Agents SDK.

Adds Slack-specific message routing, direct Slack Web API access, and agentic streaming to agents running on Azure Bot Service with the Slack channel configured.

## Installation

```bash
npm install @microsoft/agents-hosting-extensions-slack
```

## Quick Start

```typescript
import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnState } from '@microsoft/agents-hosting'
import { SlackAgentExtension } from '@microsoft/agents-hosting-extensions-slack'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

app.registerExtension(new SlackAgentExtension(app), (slack) => {
  slack.onSlackMessage(async (context, state) => {
    await context.sendActivity('Hello from Slack!')
  })
})

startServer(app)
```

## Token Injection

On each turn, `SlackAgentExtension` automatically resolves the bot token and stores a `SlackApi` client in `context.turnState`. You do not need to construct it yourself.

| Source | Description |
|---|---|
| `activity.channelData.ApiToken` | Injected by Azure Bot Service — preferred |
| `SLACK_TOKEN` env var | Fallback for local dev or custom setups |

## Accessing the Slack API

Retrieve the pre-configured `SlackApi` client from turn state to call any Slack Web API method:

```typescript
import { TurnContext } from '@microsoft/agents-hosting'
import {
  SlackAgentExtension,
  SlackApi,
  SlackApiKey,
  getSlackChannelData,
} from '@microsoft/agents-hosting-extensions-slack'

// Helper used across handlers to extract channel and thread context
function getThreadContext (context: TurnContext) {
  const event = getSlackChannelData(context)?.SlackMessage?.event
  return {
    channelId: event?.channel,
    threadTs: event?.thread_ts ?? event?.ts,
  }
}

app.registerExtension(new SlackAgentExtension(app), (slack) => {
  slack.onSlackMessage(async (context) => {
    const api = context.turnState.get(SlackApiKey) as SlackApi
    const { channelId, threadTs } = getThreadContext(context)

    await api.call('chat.postMessage', {
      channel: channelId,
      thread_ts: threadTs,
      text: 'Hello from the Agents SDK!',
    })
  })
})
```

`api.call(method, options)` posts to `https://slack.com/api/{method}` and throws if the response has `ok: false`.

### Getting the token directly

If you need the raw token — for example, to pass to the official Slack SDK — read it from channel data or the environment:

```typescript
import { getSlackChannelData } from '@microsoft/agents-hosting-extensions-slack'

slack.onSlackMessage(async (context) => {
  const token =
    getSlackChannelData(context)?.ApiToken
  // use token as needed
})
```

## Using Alongside the Official Slack SDK

The `@slack/web-api` package provides a fully-typed client covering the entire Slack API surface. Use it with the token that `SlackAgentExtension` resolves:

```typescript
import { WebClient } from '@slack/web-api'
import { SlackAgentExtension, getSlackChannelData } from '@microsoft/agents-hosting-extensions-slack'

app.registerExtension(new SlackAgentExtension(app), (slack) => {
  slack.onSlackMessage(async (context) => {
    const token =
      getSlackChannelData(context)?.ApiToken

    // Construct a typed WebClient for this turn
    const client = new WebClient(token)

    const event = getSlackChannelData(context)?.SlackMessage?.event
    const channelId = event?.channel!
    const threadTs = event?.thread_ts ?? event?.ts

    // Full type-safety from the official SDK
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '*Hello from Slack!* :wave:' },
        },
      ],
    })

    // Use typed response fields
    const history = await client.conversations.history({ channel: channelId, limit: 5 })
    const messages = history.messages ?? []
    await context.sendActivity(`Last ${messages.length} messages retrieved.`)
  })
})
```

## Routing

### Handle all messages

```typescript
slack.onSlackMessage(async (context, state) => {
  await context.sendActivity('Got your message!')
})
```

### Match exact text

```typescript
slack.onSlackMessage('help', async (context) => {
  await context.sendActivity('Available commands: help, status, stream')
})
```

### Match with a regex

```typescript
slack.onSlackMessage(/^status (.+)/i, async (context) => {
  const status = context.activity.text!.match(/^status (.+)/i)![1].trim()
  await context.sendActivity(`Status: ${status}`)
})
```

### Handle Slack events (e.g. Block Kit actions)

```typescript
import { SlackAction, getSlackChannelData } from '@microsoft/agents-hosting-extensions-slack'

slack.onSlackEvent('block_actions', async (context) => {
  const envelope = getSlackChannelData(context)!.SlackMessage!
  const action = envelope.actions![0] as SlackAction
  await context.sendActivity(`You clicked: ${action.value}`)
})
```

## Calling Slack Assistant APIs

The `assistant.threads.*` family lets you set the title, status, and suggested prompts in a Slack assistant thread.

```typescript
import { SlackApi, SlackApiKey } from '@microsoft/agents-hosting-extensions-slack'

slack.onSlackMessage(async (context) => {
  const api = context.turnState.get(SlackApiKey) as SlackApi
  const { channelId, threadTs } = getThreadContext(context)  // see helper above

  // Set a thinking indicator
  await api.call('assistant.threads.setStatus', {
    channel_id: channelId,
    thread_ts: threadTs,
    status: 'Thinking...',
  })

  // Set the thread title
  await api.call('assistant.threads.setTitle', {
    channel_id: channelId,
    thread_ts: threadTs,
    title: 'My assistant conversation',
  })

  // Offer suggested follow-up prompts
  await api.call('assistant.threads.setSuggestedPrompts', {
    channel_id: channelId,
    thread_ts: threadTs,
    prompts: [
      { title: 'Summarize', message: 'Please summarize' },
      { title: 'Show more', message: 'Show me more detail' },
    ],
  })

  await context.sendActivity('Done!')
})
```

## Streaming (Agentic Responses)

Use `createStream` to send a multi-part streaming response via `chat.startStream` / `chat.appendStream` / `chat.stopStream`.

### Basic streaming

```typescript
import {
  SlackAgentExtension,
  markdown,
} from '@microsoft/agents-hosting-extensions-slack'

slack.onSlackMessage(/stream/i, async (context) => {
  const stream = slack.createStream(context)

  await stream.start()
  await stream.append('Thinking about your question...')
  await stream.append('Here is the answer: **42**.')
  await stream.stop('All done!')
})
```

### Streaming with task updates

```typescript
import {
  SlackAgentExtension,
  SlackTaskStatus,
  markdown,
  taskUpdate,
  planUpdate,
} from '@microsoft/agents-hosting-extensions-slack'

slack.onSlackMessage(/research/i, async (context) => {
  const stream = slack.createStream(context, { taskDisplayMode: 'plan' })

  await stream.start([planUpdate('Researching your topic')])

  await stream.append([
    taskUpdate({ id: 'search', title: 'Searching the web', status: SlackTaskStatus.InProgress }),
  ])

  // ... do work ...

  await stream.append([
    taskUpdate({
      id: 'search',
      title: 'Searching the web',
      status: SlackTaskStatus.Complete,
      output: 'Found 12 results',
      sources: [{ type: 'url', url: 'https://example.com', text: 'Example source' }],
    }),
    markdown('Search complete. Summarizing results...'),
  ])

  await stream.stop('Here is your summary.')
})
```

### Chunk types

| Factory | Description |
|---|---|
| `markdown(text)` | Markdown-formatted text (max 12,000 chars) |
| `blocks(blocks)` | Slack Block Kit blocks (max 50 blocks) |
| `taskUpdate({ id, title, status, details?, output?, sources? })` | Create or update a named task |
| `planUpdate(title)` | Set the plan title in `plan` display mode |

### Task statuses

```typescript
SlackTaskStatus.Pending     // 'pending'
SlackTaskStatus.InProgress  // 'in_progress'
SlackTaskStatus.Complete    // 'complete'
SlackTaskStatus.Error       // 'error'
```

## Helper Functions

```typescript
import {
  getSlackChannelData,  // returns typed SlackChannelData | undefined
  getSlackChannel,      // returns channel ID string | undefined
  getSlackThreadTs,     // returns thread_ts (falls back to ts for first message)
  getSlackUserId,       // returns Slack user ID | undefined
} from '@microsoft/agents-hosting-extensions-slack'
```

## Configuration

| Variable | Source | Description |
|---|---|---|
| Slack bot token | `activity.channelData.ApiToken` | Injected by Azure Bot Service (preferred) |
| `SLACK_TOKEN` | Environment variable | Fallback when not provided by ABS |
