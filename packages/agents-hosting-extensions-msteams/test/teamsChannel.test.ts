import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CloudAdapter, TurnContext } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'

function addConnectorClientToTurnState (context: TurnContext): void {
  context.turnState.set(context.adapter.ConnectorClientKey, {
    httpClient: {
      baseURL: 'https://service.example.com',
      defaultHeaders: {
        Authorization: 'Bearer token'
      }
    }
  })
}

function createChannelActivity (eventType: string, channel?: { id: string }): Activity {
  return Activity.fromObject({
    type: ActivityTypes.ConversationUpdate,
    channelId: 'msteams',
    from: { id: 'user' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' },
    channelData: {
      eventType,
      ...(channel && { channel })
    }
  })
}

function createMemberActivity (membersAdded?: { id: string }[], membersRemoved?: { id: string }[]): Activity {
  return Activity.fromObject({
    type: ActivityTypes.ConversationUpdate,
    channelId: 'msteams',
    from: { id: 'user' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' },
    channelData: {},
    ...(membersAdded && { membersAdded }),
    ...(membersRemoved && { membersRemoved })
  })
}

describe('TeamsChannel', () => {
  const adapter = new CloudAdapter()

  it('should fire onChannelEventReceived when receiving channelCreated', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onChannelEventReceived(async (_ctx, _state, _data) => {
        handled = true
      })
    })

    const activity = createChannelActivity('channelCreated', { id: 'ch-1' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onChannelEventReceived when receiving channelDeleted', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onChannelEventReceived(async (_ctx, _state, _data) => {
        handled = true
      })
    })

    const activity = createChannelActivity('channelDeleted', { id: 'ch-1' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onChannelEventReceived when receiving channel member events', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onChannelEventReceived(async (_ctx, _state, data) => {
        handled = true
        assert.strictEqual(data.id, 'ch-member')
      })
    })

    const activity = createChannelActivity('channelMemberAdded', { id: 'ch-member' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should not fire onChannelEventReceived when receiving non-channel events', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onChannelEventReceived(async (_ctx, _state, _data) => {
        handled = true
      })
    })

    const activity = createChannelActivity('teamRenamed')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('should fire onCreated when receiving a channelCreated event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onCreated(async (_ctx, _state, data) => {
        handled = true
        assert.strictEqual(data.id, 'ch-new')
      })
    })

    const activity = createChannelActivity('channelCreated', { id: 'ch-new' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onDeleted when receiving a channelDeleted event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onDeleted(async () => { handled = true })
    })

    const activity = createChannelActivity('channelDeleted', { id: 'ch-deleted' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onRenamed when receiving a channelRenamed event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onRenamed(async () => { handled = true })
    })

    const activity = createChannelActivity('channelRenamed', { id: 'ch-renamed' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onRestored when receiving a channelRestored event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onRestored(async () => { handled = true })
    })

    const activity = createChannelActivity('channelRestored', { id: 'ch-restored' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onShared when receiving a channelShared event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onShared(async () => { handled = true })
    })

    const activity = createChannelActivity('channelShared', { id: 'ch-shared' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onUnshared when receiving a channelUnshared event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onUnshared(async () => { handled = true })
    })

    const activity = createChannelActivity('channelUnshared', { id: 'ch-unshared' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onMemberAdded when receiving a channelMemberAdded event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onMemberAdded(async (_ctx, _state, data) => {
        handled = true
        assert.strictEqual(data.id, 'ch-member-added')
      })
    })

    const activity = createChannelActivity('channelMemberAdded', { id: 'ch-member-added' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should not fire onMemberAdded when conversation member changes lack channel event data', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onMemberAdded(async () => { handled = true })
    })

    const activity = createMemberActivity([{ id: 'user-new' }])
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('should fire onMemberRemoved when receiving a channelMemberRemoved event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onMemberRemoved(async (_ctx, _state, data) => {
        handled = true
        assert.strictEqual(data.id, 'ch-member-removed')
      })
    })

    const activity = createChannelActivity('channelMemberRemoved', { id: 'ch-member-removed' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should not fire channel handlers when the channel is not msteams', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onCreated(async () => { handled = true })
    })

    const activity = createChannelActivity('channelCreated', { id: 'ch-1' })
    activity.channelId = 'emulator'
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('should not fire channel handlers when channel data is missing', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onCreated(async () => { handled = true })
    })

    const activity = createChannelActivity('channelCreated')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
