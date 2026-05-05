# @microsoft/agents-hosting-extensions-slack

Slack channel extension for the Microsoft 365 Agents SDK.

Adds Slack-specific message routing and a direct Slack Web API client to agents running on Azure Bot Service.

## Usage

```typescript
import { AgentApplication, MemoryStorage, TurnState } from '@microsoft/agents-hosting'
import { SlackAgentExtension, SlackTaskStatus, taskUpdate } from '@microsoft/agents-hosting-extensions-slack'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

app.registerExtension(new SlackAgentExtension(app), (ext) => {
  ext.onSlackMessage(async (context, state) => {
    // Standard reply via ABS
    await context.sendActivity('Hello from Slack!')
  })

  ext.onSlackMessage(/stream/i, async (context, state) => {
    // Stream an agentic response directly via Slack API
    const stream = ext.createStream(context, { taskDisplayMode: 'plan' })
    await stream.start()
    await stream.append(taskUpdate({
      id: 'task-1',
      title: 'Processing your request',
      status: SlackTaskStatus.InProgress,
    }))
    await stream.stop('Done!')
  })
})
```

## Configuration

| Variable | Source | Description
| --- | --- | ---
| Slack bot token | `activity.channelData.ApiToken` | Injected by Azure Bot Service (preferred)
| `SLACK_TOKEN` | Environment variable | Fallback when not provided by ABS

## Required Slack Scopes

- `chat:write` — for all API calls including streaming
