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

function createMeetingActivity (name: string, value?: unknown): Activity {
  return Activity.fromObject({
    type: ActivityTypes.Event,
    channelId: 'msteams',
    name,
    from: { id: 'user' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' },
    value: value ?? {}
  })
}

describe('Meeting', () => {
  const adapter = new CloudAdapter()

  it('should fire onStart when receiving a meetingStart event', async () => {
    let handled = false
    let receivedDetails: unknown
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onStart(async (_ctx, _state, details) => {
        handled = true
        receivedDetails = details
      })
    })

    const meetingDetails = { id: 'meeting-1', title: 'Standup' }
    const activity = createMeetingActivity('APPLICATION/VND.MICROSOFT.MEETINGSTART', meetingDetails)
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedDetails, meetingDetails)
  })

  it('should fire onEnd when receiving a meetingEnd event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onEnd(async () => { handled = true })
    })

    const activity = createMeetingActivity('APPLICATION/VND.MICROSOFT.MEETINGEND', { id: 'meeting-1' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onParticipantsJoin when participants join', async () => {
    let handled = false
    let receivedDetails: unknown
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onParticipantsJoin(async (_ctx, _state, details) => {
        handled = true
        receivedDetails = details
      })
    })

    const participantsData = { members: [{ user: { id: 'user-1' }, meeting: { inMeeting: true, role: 'presenter' } }] }
    const activity = createMeetingActivity('APPLICATION/VND.MICROSOFT.MEETINGPARTICIPANTJOIN', participantsData)
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedDetails, participantsData)
  })

  it('should fire onParticipantsLeave when participants leave', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onParticipantsLeave(async () => { handled = true })
    })

    const activity = createMeetingActivity('APPLICATION/VND.MICROSOFT.MEETINGPARTICIPANTLEAVE', { members: [] })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should not fire meeting handlers when the channel is not msteams', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onStart(async () => { handled = true })
    })

    const activity = createMeetingActivity('application/vnd.microsoft.meetingStart')
    activity.channelId = 'emulator'
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('should not fire a meeting handler when the event name does not match', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onStart(async () => { handled = true })
    })

    const activity = createMeetingActivity('application/vnd.microsoft.meetingEnd')
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
