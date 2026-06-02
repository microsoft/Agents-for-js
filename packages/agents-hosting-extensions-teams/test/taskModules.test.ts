import assert from 'assert'
import { beforeEach, describe, it } from 'node:test'
import { AgentApplication, CloudAdapter, INVOKE_RESPONSE_KEY, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import type { TaskModuleResponse } from '@microsoft/teams.api'

interface InvokeValue {
  status: number
  body?: any
}

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

describe('TaskModule', function () {
  let app: AgentApplication<TurnState>
  let adapter: CloudAdapter

  beforeEach(function () {
    app = new AgentApplication()
    adapter = new CloudAdapter()
  })

  it('onFetch sets an InvokeResponse with status and body when handler returns a response', async function () {
    let handled = false
    const teamsExt = new TeamsAgentExtension(app)

    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.taskModules.onFetch('simple_form', async (_context: TurnContext, _state: TurnState, request): Promise<TaskModuleResponse> => {
        handled = true
        assert.strictEqual(request.data?.task, 'simple_form')
        return {
          task: {
            type: 'message',
            value: 'task module opened'
          }
        }
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'task/fetch',
      value: {
        data: {
          task: 'simple_form'
        }
      },
      from: { id: 'user', name: 'User' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' }
    })

    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp, 'invoke response should be set in turnState')

    const invokeValue = invokeResp.value as InvokeValue
    assert.strictEqual(invokeValue.status, 200)
    assert.strictEqual(invokeValue.body.task.type, 'message')
    assert.strictEqual(invokeValue.body.task.value, 'task module opened')
  })

  it('onSubmit sets an InvokeResponse with status and body when handler returns a response', async function () {
    let handled = false
    const teamsExt = new TeamsAgentExtension(app)

    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.taskModules.onSubmit('simple_form', async (_context: TurnContext, _state: TurnState, request): Promise<TaskModuleResponse> => {
        handled = true
        assert.strictEqual(request.data?.task, 'simple_form')
        assert.strictEqual(request.data?.name, 'Ada')
        return {
          task: {
            type: 'message',
            value: 'task module submitted'
          }
        }
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'task/submit',
      value: {
        data: {
          task: 'simple_form',
          name: 'Ada'
        }
      },
      from: { id: 'user', name: 'User' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' }
    })

    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp, 'invoke response should be set in turnState')

    const invokeValue = invokeResp.value as InvokeValue
    assert.strictEqual(invokeValue.status, 200)
    assert.strictEqual(invokeValue.body.task.type, 'message')
    assert.strictEqual(invokeValue.body.task.value, 'task module submitted')
  })
})
