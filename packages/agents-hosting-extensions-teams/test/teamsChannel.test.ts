import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CloudAdapter, TurnContext } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'

function addConnectorClientToTurnState (context: TurnContext): void {
  context.turnState.set(context.adapter.ConnectorClientKey, {
    axiosInstance: {
      defaults: {
        baseURL: 'https://service.example.com',
        headers: {
          common: {
            Authorization: 'Bearer token'
          }
        }
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

  it('onChannelEventReceived fires for channelCreated', async () => {
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

  it('onChannelEventReceived fires for channelDeleted', async () => {
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

  it('onChannelEventReceived does not fire for non-channel events', async () => {
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

  it('onCreated fires for channelCreated event', async () => {
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

  it('onDeleted fires for channelDeleted event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onDeleted(async () => { handled = true })
    })

    const activity = createChannelActivity('channelDeleted')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onRenamed fires for channelRenamed event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onRenamed(async () => { handled = true })
    })

    const activity = createChannelActivity('channelRenamed')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onRestored fires for channelRestored event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onRestored(async () => { handled = true })
    })

    const activity = createChannelActivity('channelRestored')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onShared fires for channelShared event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onShared(async () => { handled = true })
    })

    const activity = createChannelActivity('channelShared')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onUnshared fires for channelUnshared event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onUnshared(async () => { handled = true })
    })

    const activity = createChannelActivity('channelUnshared')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onMemberAdded fires when membersAdded is present', async () => {
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
    assert.strictEqual(handled, true)
  })

  it('onMemberAdded does not fire when membersAdded is empty', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onMemberAdded(async () => { handled = true })
    })

    const activity = createMemberActivity([])
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('onMemberRemoved fires when membersRemoved is present', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.channels.onMemberRemoved(async () => { handled = true })
    })

    const activity = createMemberActivity(undefined, [{ id: 'user-left' }])
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('channel handlers do not fire for non-msteams channel', async () => {
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
})
