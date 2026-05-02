import assert from 'assert'
import { describe, it } from 'node:test'
import { AgentApplication, TurnContext, CloudAdapter } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'

function createTaskActivity (invokeName: string, verb: string) {
  return Activity.fromObject({
    type: ActivityTypes.Invoke,
    channelId: 'msteams',
    name: invokeName,
    from: { id: 'user', name: 'User' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' },
    value: { data: { verb } }
  })
}

describe('TaskModule', function () {
  it('onFetchByVerb matches when data.verb equals the registered verb', async function () {
    const app = new AgentApplication()
    const adapter = new CloudAdapter()
    let handled = false

    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.taskModule.onFetchByVerb('dailyPlan', async (context) => {
        handled = true
        await context.sendActivity(Activity.fromObject({
          value: { status: 200 },
          type: ActivityTypes.InvokeResponse
        }))
      })
    })

    const activity = createTaskActivity('task/fetch', 'dailyPlan')
    const context = new TurnContext(adapter, activity)
    await app.run(context)

    assert.strictEqual(handled, true)
  })

  it('onFetchByVerb does not match when data.verb differs', async function () {
    const app = new AgentApplication()
    const adapter = new CloudAdapter()
    let handled = false

    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.taskModule.onFetchByVerb('dailyPlan', async (context) => {
        handled = true
        await context.sendActivity(Activity.fromObject({
          value: { status: 200 },
          type: ActivityTypes.InvokeResponse
        }))
      })
    })

    const activity = createTaskActivity('task/fetch', 'otherVerb')
    const context = new TurnContext(adapter, activity)
    await app.run(context)

    assert.strictEqual(handled, false)
  })

  it('onSubmitByVerb matches when data.verb equals the registered verb', async function () {
    const app = new AgentApplication()
    const adapter = new CloudAdapter()
    let handled = false

    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.taskModule.onSubmitByVerb('confirm', async (context) => {
        handled = true
        await context.sendActivity(Activity.fromObject({
          value: { status: 200 },
          type: ActivityTypes.InvokeResponse
        }))
      })
    })

    const activity = createTaskActivity('task/submit', 'confirm')
    const context = new TurnContext(adapter, activity)
    await app.run(context)

    assert.strictEqual(handled, true)
  })

  it('onSubmitByVerb does not match when data.verb differs', async function () {
    const app = new AgentApplication()
    const adapter = new CloudAdapter()
    let handled = false

    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.taskModule.onSubmitByVerb('confirm', async (context) => {
        handled = true
        await context.sendActivity(Activity.fromObject({
          value: { status: 200 },
          type: ActivityTypes.InvokeResponse
        }))
      })
    })

    const activity = createTaskActivity('task/submit', 'otherVerb')
    const context = new TurnContext(adapter, activity)
    await app.run(context)

    assert.strictEqual(handled, false)
  })
})
