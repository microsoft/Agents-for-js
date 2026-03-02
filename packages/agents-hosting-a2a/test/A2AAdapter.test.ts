import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'assert'
import sinon from 'sinon'
import { Activity } from '@microsoft/agents-activity'
import { TurnContext, BaseAdapter } from '@microsoft/agents-hosting'

import { A2AAdapter } from '../src/adapter/A2AAdapter'

class StubAdapter extends BaseAdapter {
  async sendActivities () { return [] }
  async updateActivity () {}
  async deleteActivity () {}
}

function makeTurnContext (adapter: BaseAdapter, activityOverrides: any = {}, turnState?: Map<string, any>): TurnContext {
  const activity = Activity.fromObject({
    type: 'message',
    text: 'hello',
    conversation: { id: 'task-1' },
    channelData: { contextId: 'ctx-1', taskId: 'task-1' },
    ...activityOverrides,
  })
  const ctx = new TurnContext(adapter, activity)
  if (turnState) {
    for (const [key, value] of turnState) {
      ctx.turnState.set(key, value)
    }
  }
  return ctx
}

describe('A2AAdapter', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should create an adapter with the required parameters', () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }

      const adapter = new A2AAdapter(agentCard, logic, storage)

      assert.ok(adapter)
      assert.strictEqual(adapter.logic, logic)
    })

    it('should expose jsonHandler and restHandler', () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }

      const adapter = new A2AAdapter(agentCard, logic, storage)

      assert.ok(adapter.jsonHandler)
      assert.ok(adapter.restHandler)
      assert.strictEqual(typeof adapter.jsonHandler, 'function')
      assert.strictEqual(typeof adapter.restHandler, 'function')
    })
  })

  describe('sendActivities', () => {
    it('should convert and publish message activities to event bus', async () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)

      const publishStub = sandbox.stub()
      const turnState = new Map<string, any>()
      turnState.set('A2AExecutionEventBus', { publish: publishStub })

      const context = makeTurnContext(adapter, {}, turnState)

      const activities = [
        Activity.fromObject({ type: 'message', id: 'act-1', text: 'Hello!' }),
      ]

      const result = await adapter.sendActivities(context, activities)

      assert.deepStrictEqual(result, [])
      sinon.assert.calledOnce(publishStub)

      const published = publishStub.firstCall.args[0]
      assert.strictEqual(published.kind, 'status-update')
    })

    it('should handle multiple activities', async () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)

      const publishStub = sandbox.stub()
      const turnState = new Map<string, any>()
      turnState.set('A2AExecutionEventBus', { publish: publishStub })

      const context = makeTurnContext(adapter, {}, turnState)

      const activities = [
        Activity.fromObject({ type: 'message', id: 'act-1', text: 'First' }),
        Activity.fromObject({ type: 'message', id: 'act-2', text: 'Second' }),
      ]

      await adapter.sendActivities(context, activities)

      assert.strictEqual(publishStub.callCount, 2)
    })

    it('should not throw when event bus is missing', async () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)

      const context = makeTurnContext(adapter)

      const activities = [
        Activity.fromObject({ type: 'message', id: 'act-1', text: 'Hello!' }),
      ]

      // Should not throw
      const result = await adapter.sendActivities(context, activities)
      assert.deepStrictEqual(result, [])
    })

    it('should silently handle unsupported activity types', async () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)

      const publishStub = sandbox.stub()
      const turnState = new Map<string, any>()
      turnState.set('A2AExecutionEventBus', { publish: publishStub })

      const context = makeTurnContext(adapter, {}, turnState)

      const activities = [
        Activity.fromObject({ type: 'event', id: 'act-1' }),
      ]

      // Should not throw - unsupported types are silently dropped
      const result = await adapter.sendActivities(context, activities)
      assert.deepStrictEqual(result, [])
      sinon.assert.notCalled(publishStub)
    })
  })

  describe('unimplemented methods', () => {
    it('updateActivity should throw', async () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)
      const context = makeTurnContext(adapter)

      await assert.rejects(
        () => adapter.updateActivity(context, Activity.fromObject({ type: 'message' })),
        { message: 'Method not implemented.' }
      )
    })

    it('deleteActivity should throw', async () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)
      const context = makeTurnContext(adapter)

      await assert.rejects(
        () => adapter.deleteActivity(context, {}),
        { message: 'Method not implemented.' }
      )
    })

    it('process should throw', async () => {
      const agentCard = { name: 'test-agent', url: 'http://localhost:3000', version: '1.0', capabilities: {} } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)

      await assert.rejects(
        () => adapter.process({} as any, {} as any, (() => {}) as any, logic),
        { message: 'Method not implemented. Pass logic to constructor instead.' }
      )
    })
  })

  describe('handleCardRequest', () => {
    it('should return the agent card as JSON', async () => {
      const agentCard = {
        name: 'test-agent',
        url: 'http://localhost:3000',
        version: '1.0',
        capabilities: { streaming: true }
      } as any
      const logic = sandbox.stub().resolves()
      const storage = { read: sandbox.stub(), write: sandbox.stub(), delete: sandbox.stub() }
      const adapter = new A2AAdapter(agentCard, logic, storage)

      const jsonStub = sandbox.stub()
      const res = { json: jsonStub } as any
      const req = {} as any

      await adapter.handleCardRequest(req, res)

      sinon.assert.calledOnce(jsonStub)
      const card = jsonStub.firstCall.args[0]
      assert.strictEqual(card.name, 'test-agent')
    })
  })
})
