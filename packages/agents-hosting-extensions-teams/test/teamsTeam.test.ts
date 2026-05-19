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
        headers: { common: { Authorization: 'Bearer token' } }
      }
    }
  })
}

function createTeamActivity (eventType: string, team?: { id: string }): Activity {
  return Activity.fromObject({
    type: ActivityTypes.ConversationUpdate,
    channelId: 'msteams',
    from: { id: 'user' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' },
    channelData: {
      eventType,
      ...(team && { team })
    }
  })
}

describe('TeamsTeam', () => {
  const adapter = new CloudAdapter()

  it('onTeamEventReceived fires for teamArchived', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onTeamEventReceived(async () => { handled = true })
    })

    const activity = createTeamActivity('teamArchived', { id: 'team-1' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onTeamEventReceived does not fire for channel events', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onTeamEventReceived(async () => { handled = true })
    })

    const activity = createTeamActivity('channelCreated')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('onArchived fires for teamArchived event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onArchived(async (_ctx, _state, data) => {
        handled = true
        assert.strictEqual(data.id, 'team-a')
      })
    })

    const activity = createTeamActivity('teamArchived', { id: 'team-a' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onUnarchived fires for teamUnarchived event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onUnarchived(async () => { handled = true })
    })

    const activity = createTeamActivity('teamUnarchived')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onRenamed fires for teamRenamed event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onRenamed(async () => { handled = true })
    })

    const activity = createTeamActivity('teamRenamed')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onRestored fires for teamRestored event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onRestored(async () => { handled = true })
    })

    const activity = createTeamActivity('teamRestored')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onDeleted fires for teamDeleted event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onDeleted(async () => { handled = true })
    })

    const activity = createTeamActivity('teamDeleted')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onHardDeleted fires for teamHardDeleted event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onHardDeleted(async () => { handled = true })
    })

    const activity = createTeamActivity('teamHardDeleted')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('team handlers do not fire for non-msteams channel', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onArchived(async () => { handled = true })
    })

    const activity = createTeamActivity('teamArchived')
    activity.channelId = 'emulator'
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
