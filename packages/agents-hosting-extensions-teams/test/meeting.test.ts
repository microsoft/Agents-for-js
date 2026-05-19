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

  it('onStart fires for meetingStart event', async () => {
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
    const activity = createMeetingActivity('application/vnd.microsoft.meetingStart', meetingDetails)
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedDetails, meetingDetails)
  })

  it('onEnd fires for meetingEnd event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onEnd(async () => { handled = true })
    })

    const activity = createMeetingActivity('application/vnd.microsoft.meetingEnd', { id: 'meeting-1' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onParticipantsJoin fires for participant join event', async () => {
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
    const activity = createMeetingActivity('application/vnd.microsoft.meetingParticipantJoin', participantsData)
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedDetails, participantsData)
  })

  it('onParticipantsLeave fires for participant leave event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.meetings.onParticipantsLeave(async () => { handled = true })
    })

    const activity = createMeetingActivity('application/vnd.microsoft.meetingParticipantLeave', { members: [] })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('meeting handlers do not fire for non-msteams channel', async () => {
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

  it('meeting handler does not fire for mismatched event name', async () => {
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
