import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'assert'
import sinon from 'sinon'
import { A2AExecutor, AgentsA2AUser } from '../src/adapter/A2AExecutor'
import { A2AAdapter } from '../src/adapter/A2AAdapter'

describe('A2AExecutor', () => {
  let sandbox: sinon.SinonSandbox
  let mockAdapter: sinon.SinonStubbedInstance<A2AAdapter>
  let executor: A2AExecutor

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockAdapter = {
      logic: sandbox.stub().resolves(),
    } as any
    executor = new A2AExecutor(mockAdapter as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('execute', () => {
    it('should publish initial task when task does not exist', async () => {
      const publish = sandbox.stub()
      const finished = sandbox.stub()
      const eventBus = { publish, finished } as any

      const requestContext = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'hello' }],
          messageId: 'msg-1',
          kind: 'message',
        },
        task: undefined,
        context: {},
      } as any

      await executor.execute(requestContext, eventBus)

      // First call publishes initial task
      const initialTask = publish.firstCall.args[0]
      assert.strictEqual(initialTask.kind, 'task')
      assert.strictEqual(initialTask.id, 'task-1')
      assert.strictEqual(initialTask.contextId, 'ctx-1')
      assert.strictEqual(initialTask.status.state, 'submitted')

      // Final call publishes completed status
      const finalUpdate = publish.lastCall.args[0]
      assert.strictEqual(finalUpdate.kind, 'status-update')
      assert.strictEqual(finalUpdate.status.state, 'completed')
      assert.strictEqual(finalUpdate.final, true)

      sinon.assert.calledOnce(finished)
    })

    it('should not publish initial task when task already exists', async () => {
      const publish = sandbox.stub()
      const finished = sandbox.stub()
      const eventBus = { publish, finished } as any

      const requestContext = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'hello' }],
          messageId: 'msg-1',
          kind: 'message',
        },
        task: { kind: 'task', id: 'task-1' },
        context: {},
      } as any

      await executor.execute(requestContext, eventBus)

      // Should only publish the final status update, no initial task
      assert.strictEqual(publish.callCount, 1)
      assert.strictEqual(publish.firstCall.args[0].kind, 'status-update')
      assert.strictEqual(publish.firstCall.args[0].status.state, 'completed')
    })

    it('should call adapter logic', async () => {
      const publish = sandbox.stub()
      const finished = sandbox.stub()
      const eventBus = { publish, finished } as any

      const requestContext = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'hello' }],
          messageId: 'msg-1',
          kind: 'message',
        },
        task: { kind: 'task', id: 'task-1' },
        context: {},
      } as any

      await executor.execute(requestContext, eventBus)

      sinon.assert.calledOnce(mockAdapter.logic as sinon.SinonStub)
    })

    it('should pass authenticated user identity to TurnContext', async () => {
      const publish = sandbox.stub()
      const finished = sandbox.stub()
      const eventBus = { publish, finished } as any

      const user: AgentsA2AUser = {
        isAuthenticated: true,
        identity: { sub: 'user-123', name: 'Test User' },
        userName: 'Test User',
      }

      const requestContext = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'hello' }],
          messageId: 'msg-1',
          kind: 'message',
        },
        task: { kind: 'task', id: 'task-1' },
        context: { user },
      } as any

      await executor.execute(requestContext, eventBus)

      sinon.assert.calledOnce(mockAdapter.logic as sinon.SinonStub)
    })

    it('should not publish final update if task was cancelled during execution', async () => {
      const publish = sandbox.stub()
      const finished = sandbox.stub()
      const eventBus = { publish, finished } as any

      // Make logic cancel the task during execution
      ;(mockAdapter.logic as sinon.SinonStub).callsFake(async () => {
        await executor.cancelTask('task-1', { publish: sandbox.stub(), finished: sandbox.stub() } as any)
      })

      const requestContext = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'hello' }],
          messageId: 'msg-1',
          kind: 'message',
        },
        task: { kind: 'task', id: 'task-1' },
        context: {},
      } as any

      await executor.execute(requestContext, eventBus)

      // The main eventBus should not have received a completed status update
      const completedUpdates = publish.getCalls().filter(
        (call: any) => call.args[0].kind === 'status-update' && call.args[0].status.state === 'completed'
      )
      assert.strictEqual(completedUpdates.length, 0)

      // finished should not be called
      sinon.assert.notCalled(finished)
    })
  })

  describe('cancelTask', () => {
    it('should publish a cancelled status update', async () => {
      const publish = sandbox.stub()
      const eventBus = { publish } as any

      await executor.cancelTask('task-1', eventBus)

      sinon.assert.calledOnce(publish)
      const update = publish.firstCall.args[0]
      assert.strictEqual(update.kind, 'status-update')
      assert.strictEqual(update.taskId, 'task-1')
      assert.strictEqual(update.status.state, 'canceled')
      assert.strictEqual(update.final, true)
    })

    it('should use the last known contextId', async () => {
      const publish = sandbox.stub()
      const finished = sandbox.stub()
      const eventBus = { publish, finished } as any

      // Execute first to set the lastContextId
      const requestContext = {
        taskId: 'task-1',
        contextId: 'specific-ctx',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'hello' }],
          messageId: 'msg-1',
          kind: 'message',
        },
        task: { kind: 'task', id: 'task-1' },
        context: {},
      } as any

      await executor.execute(requestContext, eventBus)

      // Now cancel with a different event bus
      const cancelPublish = sandbox.stub()
      await executor.cancelTask('task-2', { publish: cancelPublish } as any)

      const update = cancelPublish.firstCall.args[0]
      assert.strictEqual(update.contextId, 'specific-ctx')
    })
  })
})
