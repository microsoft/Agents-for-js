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

  it('should fire onTeamEventReceived when receiving teamArchived', async () => {
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

  it('should not fire onTeamEventReceived when receiving channel events', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onTeamEventReceived(async () => { handled = true })
    })

    const activity = createTeamActivity('channelCreated', { id: 'team-1' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('should fire onArchived when receiving a teamArchived event', async () => {
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

  it('should fire onUnarchived when receiving a teamUnarchived event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onUnarchived(async () => { handled = true })
    })

    const activity = createTeamActivity('teamUnarchived', { id: 'team-u' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onRenamed when receiving a teamRenamed event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onRenamed(async () => { handled = true })
    })

    const activity = createTeamActivity('teamRenamed', { id: 'team-r' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onRestored when receiving a teamRestored event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onRestored(async () => { handled = true })
    })

    const activity = createTeamActivity('teamRestored', { id: 'team-restored' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onDeleted when receiving a teamDeleted event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onDeleted(async () => { handled = true })
    })

    const activity = createTeamActivity('teamDeleted', { id: 'team-deleted' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onHardDeleted when receiving a teamHardDeleted event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onHardDeleted(async () => { handled = true })
    })

    const activity = createTeamActivity('teamHardDeleted', { id: 'team-hard-deleted' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should not fire team handlers when the channel is not msteams', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onArchived(async () => { handled = true })
    })

    const activity = createTeamActivity('teamArchived', { id: 'team-1' })
    activity.channelId = 'emulator'
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('should not fire team handlers when team data is missing', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.teams.onArchived(async () => { handled = true })
    })

    const activity = createTeamActivity('teamArchived')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
