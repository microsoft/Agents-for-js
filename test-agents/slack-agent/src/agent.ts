// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import {
  SlackAgentExtension,
  SlackApi,
  SlackApiKey,
  SlackTaskStatus,
  getSlackChannelData,
  markdown,
  taskUpdate,
  type SlackAction,
} from '@microsoft/agents-hosting-extensions-slack'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

// Helper: get channel + threadTs for assistant.threads.* API calls.
// Falls back to event.ts (the message's own ts) when event.thread_ts is absent —
// this happens on the first message in a DM/assistant thread.
function getThreadContext (ctx: TurnContext) {
  const channelData = getSlackChannelData(ctx)
  const event = channelData?.SlackMessage?.event
  return {
    channelId: event?.channel,
    threadTs: event?.thread_ts ?? event?.ts,
  }
}

app.registerExtension<SlackAgentExtension<TurnState>>(new SlackAgentExtension(app), (slack) => {
  // Set the Slack assistant thread title + suggested prompts
  slack.onSlackMessage(/^topic (.+)/i, async (ctx: TurnContext) => {
    const api = ctx.turnState.get(SlackApiKey) as SlackApi
    const { channelId, threadTs } = getThreadContext(ctx)
    const title = ctx.activity.text!.match(/^topic (.+)/i)![1].trim()

    await Promise.all([
      api.call('assistant.threads.setTitle', { channel_id: channelId, thread_ts: threadTs, title }),
    ])
    await ctx.sendActivity(`Title set to: *${title}*`)
  })

  slack.onSlackMessage(/^prompts/i, async (ctx: TurnContext) => {
    const api = ctx.turnState.get(SlackApiKey) as SlackApi
    const { channelId, threadTs } = getThreadContext(ctx)

    await api.call('assistant.threads.setSuggestedPrompts', {
      channel_id: channelId,
      thread_ts: threadTs,
      prompts: [
        { title: 'Stream demo', message: 'stream demo' },
        { title: 'Set status', message: 'status thinking...' },
      ],
    })

    await ctx.sendActivity('Prompts sent')
  })

  // Set the Slack assistant thread status
  slack.onSlackMessage(/^status (.+)/i, async (ctx: TurnContext) => {
    const api = ctx.turnState.get(SlackApiKey) as SlackApi
    const { channelId, threadTs } = getThreadContext(ctx)
    const status = ctx.activity.text!.match(/^status (.+)/i)![1].trim()

    await api.call('assistant.threads.setStatus', { channel_id: channelId, thread_ts: threadTs, status })
    await ctx.sendActivity(`Status set to: _${status}_`)
  })

  // Demonstrate the streaming API with task updates
  slack.onSlackMessage(/^stream demo/i, async (ctx: TurnContext) => {
    const channelData = getSlackChannelData(ctx)!
    const event = channelData.SlackMessage!.event!

    const stream = slack.createStream(ctx, { taskDisplayMode: 'plan', recipientTeamId: event.team as string })

    await stream.start()

    await stream.append([
      markdown('Starting the demo...'),
      taskUpdate({ id: '1', title: 'Finding nails', status: SlackTaskStatus.Pending, details: 'Where can I find nails?' }),
    ])

    await new Promise(resolve => setTimeout(resolve, 3000))

    await stream.append([
      taskUpdate({ id: '1', title: 'Finding nails', status: SlackTaskStatus.InProgress, details: 'Looking in the bucket...' }),
      taskUpdate({ id: '2', title: 'Making Nonsense', status: SlackTaskStatus.InProgress, details: 'This is silly' }),
    ])

    await new Promise(resolve => setTimeout(resolve, 3000))

    await stream.append([
      taskUpdate({ id: '1', title: 'Finding nails', status: SlackTaskStatus.Complete, details: 'Found some nails!', output: '12 nails acquired' }),
      taskUpdate({ id: '2', title: 'Making Nonsense', status: SlackTaskStatus.Complete }),
      markdown('Found some nails. Now hammering...'),
    ])

    await new Promise(resolve => setTimeout(resolve, 3000))

    await stream.stop('All done! Nails have been hammered.')
  })

  // Send a Block Kit message with interactive buttons
  slack.onSlackMessage('buttons', async (ctx: TurnContext) => {
    const api = ctx.turnState.get(SlackApiKey) as SlackApi
    const { channelId, threadTs } = getThreadContext(ctx)

    await api.call('chat.postMessage', {
      channel: channelId,
      thread_ts: threadTs,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: 'Pick an option:' },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Yes' },
              action_id: 'button_yes',
              value: 'yes',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'No' },
              action_id: 'button_no',
              value: 'no',
            },
          ],
        },
      ],
    })
  })

  // Handle Block Kit button clicks
  slack.onSlackEvent('block_actions', async (ctx: TurnContext) => {
    const envelope = getSlackChannelData(ctx)!.SlackMessage!
    const action = envelope.actions![0] as SlackAction
    await ctx.sendActivity(`You clicked: *${action.value}* (action_id: \`${action.action_id}\`)`)
  })

  // Help
  slack.onSlackMessage('help', async (ctx: TurnContext) => {
    await ctx.sendActivity(
      'Commands:\n' +
      '• `topic <title>` — set thread title\n' +
      '• `status <text>` — set thread status\n' +
      '• `stream demo` — demonstrate Slack streaming API'
    )
  })

  // Fallback
  slack.onSlackMessage(async (ctx: TurnContext) => {
    await ctx.sendActivity('Hello Slack!')
  })
})

app.onActivity('message', async (ctx: TurnContext, state: TurnState) => {
  await ctx.sendActivity('Normal activity reply')
})

startServer(app)
