import { strict as assert } from 'assert'
import { beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'

import { AuthorizationManager } from '../../../src/app/auth/authorizationManager'
import { AgentApplication } from '../../../src/app'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TurnContext } from '../../../src/turnContext'
import { TestAdapter } from '../testStubs'
import { MemoryStorage } from '../../../src/storage'
import { AuthorizationHandlerStatus } from '../../../src/app/auth/types'
import { HandlerStorage } from '../../../src/app/auth/handlerStorage'
import { Connections } from '../../../src/auth/connections'

describe('AuthorizationManager', () => {
  let app: AgentApplication<any>
  let context: TurnContext
  let storage: MemoryStorage
  let mockConnections: Connections
  let testActivity: Activity
  let manager: AuthorizationManager
  let getHandlerIds: sinon.SinonStub

  const createTestActivity = () => Activity.fromObject({
    type: ActivityTypes.Message,
    from: { id: 'user-1' },
    recipient: { id: 'bot-1' },
    conversation: { id: 'conv-1' },
    channelId: 'webchat'
  })

  beforeEach(() => {
    storage = new MemoryStorage()
    testActivity = createTestActivity()
    mockConnections = {} as Connections

    app = new AgentApplication({
      storage,
      authorization: {
        handler1: { name: 'graph' },
        handler2: { type: 'agentic', scopes: ['scope2'] },
        handler3: { name: 'github' }
      }
    })

    const adapter = new TestAdapter()
    context = new TurnContext(adapter, testActivity)
    manager = new AuthorizationManager(app, mockConnections)
    getHandlerIds = sinon.stub().resolves(['handler1'])
  })

  it('should throw error if storage is not configured', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AgentApplication({
        authorization: {
          handler1: { type: 'agentic', scopes: ['scope1'] }
        }
      })
    }, /Storage is required for Authorization/)
  })

  it('should throw error if no authorization handlers are configured', () => {
    const app = new AgentApplication({
      storage
    })

    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AuthorizationManager(app, mockConnections)
    }, /does not have any auth handlers/)
  })

  it('should throw error for unsupported handler type', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AgentApplication({
        storage,
        authorization: {
          handler1: { type: 'unsupported', scopes: ['scope1'] } as any
        }
      })
    }, /Unsupported authorization handler type/)
  })

  it('should create handler instances successfully', () => {
    const manager = new AuthorizationManager(app, mockConnections)

    assert.notEqual(manager.handlers, undefined)
    assert.equal(Object.keys(manager.handlers).length, 3)
    assert.notEqual(manager.handlers['handler1'], undefined)
    assert.notEqual(manager.handlers['handler2'], undefined)
    assert.notEqual(manager.handlers['handler3'], undefined)
  })

  it('should return registered handlers', () => {
    const manager = new AuthorizationManager(app, mockConnections)

    const handlers = manager.handlers

    assert.equal(Object.keys(handlers).length, 3)
    assert.notEqual(handlers['handler1'], undefined)
    assert.notEqual(handlers['handler2'], undefined)
    assert.notEqual(handlers['handler3'], undefined)
  })

  it('should return authorized:true when conversation changes', async () => {
    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: { ...testActivity, conversation: { id: 'changed' } } as any, eTag: '*' })

    const result = await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(result.authorized, true)
    assert.equal(storageResult, undefined)
  })

  it('should return authorized:true when handler returns APPROVED', async () => {
    const handler = manager.handlers['handler1']
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should return authorized:true when handler returns IGNORED', async () => {
    const handler = manager.handlers['handler1']
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.IGNORED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should return authorized:false when handler returns PENDING', async () => {
    const handler = manager.handlers['handler1']
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.PENDING)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should return authorized:false when handler returns REJECTED', async () => {
    const handler = manager.handlers['handler1']
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.REJECTED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should recursively call process when handler returns REVALIDATE', async () => {
    const handler = manager.handlers['handler1']
    const signinStub = sinon.stub(handler, 'signin')
    signinStub.onFirstCall().resolves(AuthorizationHandlerStatus.REVALIDATE)
    signinStub.onSecondCall().resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signinStub.callCount, 2)
  })

  it('should throw error for unexpected status', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').resolves('unexpected_status' as any)

    await assert.rejects(
      async () => await manager.process(context, getHandlerIds),
      /Unexpected registration status/
    )
  })

  it('should process multiple handlers in sequence', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handler1 = manager.handlers['handler1']
    const handler2 = manager.handlers['handler2']
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.calledOnce, true)
  })

  it('should stop processing on first PENDING', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handler1 = manager.handlers['handler1']
    const handler2 = manager.handlers['handler2']
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.PENDING)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.called, false)
  })

  it('should stop processing on first REJECTED', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handler1 = manager.handlers['handler1']
    const handler2 = manager.handlers['handler2']
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.REJECTED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.called, false)
  })

  it('should continue processing on IGNORED', async () => {
    getHandlerIds.resolves(['handler1', 'handler2', 'handler3'])

    const handler1 = manager.handlers['handler1']
    const handler2 = manager.handlers['handler2']
    const handler3 = manager.handlers['handler3']
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.IGNORED)
    const signin3Stub = sinon.stub(handler3, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.calledOnce, true)
    assert.equal(signin3Stub.calledOnce, true)
  })

  it('should delete storage on APPROVED', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should delete storage on IGNORED', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.IGNORED)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should delete storage on REJECTED', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.REJECTED)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should not delete storage on PENDING', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.PENDING)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.notEqual(storageResult, undefined)
  })

  it('should handle active handler session from storage', async () => {
    const originalActivity = createTestActivity()
    originalActivity.text = 'original message'

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: originalActivity, eTag: '*' })

    const handler = manager.handlers['handler1']
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    await manager.process(context, getHandlerIds)

    // Verify the handler received the active handler data
    assert.equal(signinStub.calledOnce, true)
    const activeHandlerArg = signinStub.firstCall.args[1]
    assert.notEqual(activeHandlerArg, undefined)
    assert.equal(activeHandlerArg?.id, 'handler1')
  })

  it('should process active handler first when multiple handlers', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler2', activity: testActivity, eTag: '*' })

    const handler1 = manager.handlers['handler1']
    const handler2 = manager.handlers['handler2']
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    await manager.process(context, getHandlerIds)

    // handler2 should be called first because it's the active handler
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.calledOnce, true)
    assert.ok(signin2Stub.calledBefore(signin1Stub))
  })

  it('should throw error when handler IDs are not found', async () => {
    getHandlerIds.resolves(['nonexistent'])

    await assert.rejects(
      async () => await manager.process(context, getHandlerIds),
      /Cannot find auth handlers with ID\(s\):/
    )
  })

  it('should throw error when signin fails', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').rejects(new Error('Signin failed'))

    await assert.rejects(
      async () => await manager.process(context, getHandlerIds),
      /Failed to sign in/
    )
  })

  it('should delete storage when signin throws error', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').rejects(new Error('Signin failed'))

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    try {
      await manager.process(context, getHandlerIds)
    } catch (error) {
      // Expected error
    }

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should handle getHandlerIds returning empty array', async () => {
    getHandlerIds.resolves([])

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
  })

  it('should call getHandlerIds with current activity', async () => {
    const handler = manager.handlers['handler1']
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    await manager.process(context, getHandlerIds)

    assert.equal(getHandlerIds.calledOnce, true)
    assert.deepEqual(getHandlerIds.firstCall.args[0], testActivity)
  })
})
