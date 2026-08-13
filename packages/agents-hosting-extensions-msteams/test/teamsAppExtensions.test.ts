import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CloudAdapter, INVOKE_RESPONSE_KEY, TurnContext, TurnState } from '@microsoft/agents-hosting'
import {
  onTeamsActivity,
  onTeamsConversationUpdate,
  onTeamsEvent,
  onTeamsFeedbackLoop,
  onTeamsHandoff,
  onTeamsMessage,
  onTeamsMessageReactionsAdded,
  onTeamsMessageReactionsRemoved
} from '../src/app/teamsAppExtensions'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import { TeamsTurnContext } from '../src/teamsTurnContext'

function createContext (activity: Partial<Activity>): TurnContext {
  const adapter = new CloudAdapter()
  const context = new TurnContext(adapter, Activity.fromObject({
    channelId: 'msteams',
    from: { id: 'user' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' },
    ...activity
  }))
  context.turnState.set(adapter.ConnectorClientKey, {
    httpClient: {
      baseURL: 'https://service.example.com',
      defaultHeaders: {
        Authorization: 'Bearer token'
      }
    }
  })
  return context
}

function createApp (): AgentApplication<TurnState> {
  const app = new AgentApplication<TurnState>()
  app.registerExtension(new TeamsAgentExtension(app), () => {})
  return app
}

describe('TeamsAppExtensions', () => {
  it('should handle matching Teams activity types with TeamsTurnContext when using onTeamsActivity', async () => {
    const app = createApp()
    let handled = false

    onTeamsActivity(app, ActivityTypes.Typing, async (context) => {
      handled = true
      assert.ok(context instanceof TeamsTurnContext)
    })

    await app.run(createContext({ type: ActivityTypes.Typing }))

    assert.strictEqual(handled, true)
  })

  it('should ignore non-Teams activities when using onTeamsActivity', async () => {
    const app = createApp()
    let handled = false

    onTeamsActivity(app, ActivityTypes.Message, async () => {
      handled = true
    })

    await app.run(createContext({
      type: ActivityTypes.Message,
      channelId: 'emulator',
      text: 'hello'
    }))

    assert.strictEqual(handled, false)
  })

  it('should match exact text case-insensitively and regex text when using onTeamsMessage', async () => {
    const app = createApp()
    const handled: string[] = []

    onTeamsMessage(app, 'hello', async () => {
      handled.push('exact')
    })
    onTeamsMessage(app, /help/i, async () => {
      handled.push('regex')
    })

    await app.run(createContext({
      type: ActivityTypes.Message,
      text: 'HELLO'
    }))
    await app.run(createContext({
      type: ActivityTypes.Message,
      text: 'need help'
    }))

    assert.deepStrictEqual(handled, ['exact', 'regex'])
  })

  it('should match Teams member update events when using onTeamsConversationUpdate', async () => {
    const app = createApp()
    let handled = false

    onTeamsConversationUpdate(app, 'membersAdded', async (context) => {
      handled = true
      assert.ok(context instanceof TeamsTurnContext)
    })

    await app.run(createContext({
      type: ActivityTypes.ConversationUpdate,
      membersAdded: [{ id: 'user' }]
    }))

    assert.strictEqual(handled, true)
  })

  it('should treat unknown events as any Teams conversation update when using onTeamsConversationUpdate', async () => {
    const app = createApp()
    let handled = false

    onTeamsConversationUpdate(app, 'teamRenamed', async () => {
      handled = true
    })

    await app.run(createContext({
      type: ActivityTypes.ConversationUpdate
    }))

    assert.strictEqual(handled, true)
  })

  it('should match event names and custom selectors only when receiving Teams event activities', async () => {
    const app = createApp()
    const handled: string[] = []

    onTeamsEvent(app, 'application/vnd.microsoft.readReceipt', async () => {
      handled.push('name')
    })
    onTeamsEvent(app, async (context) => (context.activity.value as Record<string, unknown> | undefined)?.['kind'] === 'custom', async () => {
      handled.push('selector')
    })

    await app.run(createContext({
      type: ActivityTypes.Event,
      name: 'APPLICATION/VND.MICROSOFT.READRECEIPT'
    }))
    await app.run(createContext({
      type: ActivityTypes.Event,
      value: { kind: 'custom' }
    }))
    await app.run(createContext({
      type: ActivityTypes.Message,
      value: { kind: 'custom' },
      text: 'not an event'
    }))

    assert.deepStrictEqual(handled, ['name', 'selector'])
  })

  it('should match Teams message reactions when using reaction-added and reaction-removed handlers', async () => {
    const app = createApp()
    const handled: string[] = []

    onTeamsMessageReactionsAdded(app, async (context) => {
      handled.push(`added:${context.activity.reactionsAdded?.[0].type}`)
      assert.ok(context instanceof TeamsTurnContext)
    })
    onTeamsMessageReactionsRemoved(app, async (context) => {
      handled.push(`removed:${context.activity.reactionsRemoved?.[0].type}`)
      assert.ok(context instanceof TeamsTurnContext)
    })

    await app.run(createContext({
      type: ActivityTypes.MessageReaction,
      reactionsAdded: [{ type: 'like' }]
    }))
    await app.run(createContext({
      type: ActivityTypes.MessageReaction,
      reactionsRemoved: [{ type: 'like' }]
    }))

    assert.deepStrictEqual(handled, ['added:like', 'removed:like'])
  })

  it('should pass the continuation and send an InvokeResponse when handling a Teams handoff', async () => {
    const app = createApp()
    let continuation = ''
    let handlerContext: TeamsTurnContext | undefined

    onTeamsHandoff(app, async (context, _state, token) => {
      handlerContext = context
      continuation = token
    })

    const context = createContext({
      type: ActivityTypes.Invoke,
      name: 'handoff/action',
      value: { continuation: 'handoff-token' }
    })
    await app.run(context)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(handlerContext instanceof TeamsTurnContext)
    assert.strictEqual(continuation, 'handoff-token')
    assert.strictEqual(invokeResp?.type, ActivityTypes.InvokeResponse)
    assert.deepStrictEqual(invokeResp?.value, { status: 200 })
  })

  it('should pass feedback data with replyToId and send an InvokeResponse when handling Teams feedback', async () => {
    const app = createApp()
    let feedbackReaction: string | undefined
    let feedbackReplyToId: string | undefined

    onTeamsFeedbackLoop(app, async (context, _state, feedbackData) => {
      assert.ok(context instanceof TeamsTurnContext)
      feedbackReaction = feedbackData.actionValue?.reaction
      feedbackReplyToId = feedbackData.replyToId
    })

    const context = createContext({
      type: ActivityTypes.Invoke,
      name: 'message/submitAction',
      replyToId: 'reply-1',
      value: {
        actionName: 'feedback',
        actionValue: {
          reaction: 'like',
          feedback: 'helpful'
        }
      }
    })
    await app.run(context)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.strictEqual(feedbackReaction, 'like')
    assert.strictEqual(feedbackReplyToId, 'reply-1')
    assert.strictEqual(invokeResp?.type, ActivityTypes.InvokeResponse)
    assert.deepStrictEqual(invokeResp?.value, { status: 200 })
  })
})
