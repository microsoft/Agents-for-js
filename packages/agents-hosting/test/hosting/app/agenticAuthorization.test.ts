import { strict as assert } from 'assert'
import { beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'

import { AgenticAuthorization } from '../../../src/app/auth/handlers/agenticAuthorization'
import type { AgenticAuthorizationSettings } from '../../../src/app/auth/handlers/agenticAuthorization'
import { MemoryStorage } from '../../../src/storage'
import { TurnContext } from '../../../src'
import { TestAdapter } from '../testStubs'
import { Activity } from '@microsoft/agents-activity'
import { AuthorizationHandlerStatus } from '../../../src/app/auth/types'
import { ActivityTypes } from '../../../../agents-activity/src'

const createSettings = (): AgenticAuthorizationSettings => ({
  storage: new MemoryStorage(),
  connections: {
    getDefaultConnection: sinon.stub(),
    getConnection: sinon.stub(),
    getTokenProvider: sinon.stub()
  } as any
})

describe('AgenticAuthorization', () => {
  let settings: AgenticAuthorizationSettings
  const baseAdapter = new TestAdapter()
  const baseActivity = Activity.fromObject({
    type: ActivityTypes.Message,
    from: { id: 'user-1' },
    recipient: {
      id: 'bot-1',
      role: 'agenticUser',
      agenticAppId: 'instance-123',
      agenticUserId: 'agentic-user-456'
    },
    conversation: { id: 'conv-1' },
    channelId: 'webchat'
  })

  beforeEach(() => {
    settings = createSettings()
  })

  it('should create instance with valid options', () => {
    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    assert.equal(handler.id, 'auth')
  })

  it('should throw error if connections is not available', () => {
    const invalidSettings = { ...settings, connections: undefined }
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, invalidSettings as any)
    }, /The 'connections' option is not available/)
  })

  it('should throw error if no scopes are provided', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AgenticAuthorization('auth', { type: 'agentic' }, settings)
    }, /At least one scope must be specified/)
  })

  it('should throw error if scopes array is empty', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AgenticAuthorization('auth', { type: 'agentic', scopes: [] }, settings)
    }, /At least one scope must be specified/)
  })

  it('should load scopes from options', () => {
    const scopes = ['scope1', 'scope2']
    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes }, settings)
    const options = (handler as any).options
    assert.deepEqual(options.scopes, scopes)
  })

  it('should load altBlueprintConnectionName from options', () => {
    const handler = new AgenticAuthorization('auth', {
      type: 'agentic',
      scopes: ['scope1'],
      altBlueprintConnectionName: 'alt-connection'
    }, settings)
    const options = (handler as any).options
    assert.deepEqual(options.altBlueprintConnectionName, 'alt-connection')
  })

  it('should return IGNORED status on signin', async () => {
    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    const status = await handler.signin()
    assert.equal(status, AuthorizationHandlerStatus.IGNORED)
  })

  it('should return false on signout', async () => {
    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    const result = await handler.signout()
    assert.equal(result, false)
  })

  it('should retrieve token using default token provider', async () => {
    const mockTokenProvider = {
      getAgenticUserToken: sinon.stub().resolves('agentic-token-123')
    }
    settings.connections.getTokenProvider = sinon.stub().returns(mockTokenProvider)

    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1', 'scope2'] }, settings)
    const context = new TurnContext(baseAdapter, baseActivity, { claims: [] } as any)

    const result = await handler.token(context)

    assert.equal(result.token, 'agentic-token-123')
    assert.equal((settings.connections.getTokenProvider as sinon.SinonStub).calledOnce, true)
    assert.equal(mockTokenProvider.getAgenticUserToken.calledOnce, true)
    const callArgs = mockTokenProvider.getAgenticUserToken.firstCall.args
    const scopesArg = callArgs.find(a => Array.isArray(a))
    const stringArgs = callArgs.filter(a => typeof a === 'string')
    assert.ok(stringArgs.includes('instance-123'))
    assert.ok(stringArgs.includes('agentic-user-456'))
    assert.deepEqual(scopesArg, ['scope1', 'scope2'])
  })

  it('should retrieve token using altBlueprintConnectionName', async () => {
    const mockConnection = {
      getAgenticUserToken: sinon.stub().resolves('alt-token-456')
    }
    settings.connections.getConnection = sinon.stub().returns(mockConnection)

    const handler = new AgenticAuthorization('auth', {
      type: 'agentic',
      scopes: ['scope1'],
      altBlueprintConnectionName: 'alt-connection'
    }, settings)
    const context = new TurnContext(baseAdapter, baseActivity)

    const result = await handler.token(context)

    assert.equal(result.token, 'alt-token-456')
    assert.equal((settings.connections.getConnection as sinon.SinonStub).calledOnce, true)
    assert.equal((settings.connections.getConnection as sinon.SinonStub).firstCall.args[0], 'alt-connection')
    assert.equal(mockConnection.getAgenticUserToken.calledOnce, true)
  })

  it('should use custom scopes from options parameter', async () => {
    const mockTokenProvider = {
      getAgenticUserToken: sinon.stub().resolves('custom-scope-token')
    }
    settings.connections.getTokenProvider = sinon.stub().returns(mockTokenProvider)

    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['default-scope'] }, settings)
    const context = new TurnContext(baseAdapter, baseActivity, { claims: [] } as any)

    const result = await handler.token(context, { scopes: ['custom-scope1', 'custom-scope2'] })

    assert.equal(result.token, 'custom-scope-token')
    const callArgs = mockTokenProvider.getAgenticUserToken.firstCall.args
    const scopesArg = callArgs.find(a => Array.isArray(a))
    assert.deepEqual(scopesArg, ['custom-scope1', 'custom-scope2'])
  })

  it('should return cached token from turn state', async () => {
    const mockTokenProvider = {
      getAgenticUserToken: sinon.stub().resolves('new-token')
    }
    settings.connections.getTokenProvider = sinon.stub().returns(mockTokenProvider)

    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    const context = new TurnContext(baseAdapter, baseActivity, { claims: [] } as any)

    // First call should fetch token
    const result1 = await handler.token(context)
    assert.equal(result1.token, 'new-token')
    assert.equal(mockTokenProvider.getAgenticUserToken.calledOnce, true)

    // Second call should return cached token
    const result2 = await handler.token(context)
    assert.equal(result2.token, 'new-token')
    assert.equal(mockTokenProvider.getAgenticUserToken.calledOnce, true) // Still called only once
  })

  it('should call onSuccess callback when token is retrieved', async () => {
    const mockTokenProvider = {
      getAgenticUserToken: sinon.stub().resolves('success-token')
    }
    settings.connections.getTokenProvider = sinon.stub().returns(mockTokenProvider)

    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    const onSuccessCallback = sinon.stub()
    handler.onSuccess(onSuccessCallback)

    const context = new TurnContext(baseAdapter, baseActivity, { claims: [] } as any)

    await handler.token(context)

    assert.equal(onSuccessCallback.calledOnce, true)
    assert.equal(onSuccessCallback.firstCall.args[0], context)
  })

  it('should return undefined token on error', async () => {
    const mockTokenProvider = {
      getAgenticUserToken: sinon.stub().rejects(new Error('Token retrieval failed'))
    }
    settings.connections.getTokenProvider = sinon.stub().returns(mockTokenProvider)

    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    const context = new TurnContext(baseAdapter, baseActivity, { claims: [] } as any)

    const result = await handler.token(context)

    assert.equal(result.token, undefined)
  })

  it('should call onFailure callback when token retrieval fails', async () => {
    const mockTokenProvider = {
      getAgenticUserToken: sinon.stub().rejects(new Error('Network error'))
    }
    settings.connections.getTokenProvider = sinon.stub().returns(mockTokenProvider)

    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    const onFailureCallback = sinon.stub()
    handler.onFailure(onFailureCallback)

    const context = new TurnContext(baseAdapter, baseActivity, { claims: [] } as any)

    await handler.token(context)

    assert.equal(onFailureCallback.calledOnce, true)
    assert.equal(onFailureCallback.firstCall.args[0], context)
    assert.ok(onFailureCallback.firstCall.args[1]?.includes('Network error'))
  })

  it('should not call onSuccess when using cached token', async () => {
    const mockTokenProvider = {
      getAgenticUserToken: sinon.stub().resolves('cached-token')
    }
    settings.connections.getTokenProvider = sinon.stub().returns(mockTokenProvider)

    const handler = new AgenticAuthorization('auth', { type: 'agentic', scopes: ['scope1'] }, settings)
    const onSuccessCallback = sinon.stub()
    handler.onSuccess(onSuccessCallback)

    const context = new TurnContext(baseAdapter, baseActivity, { claims: [] } as any)

    // First call
    await handler.token(context)
    assert.equal(onSuccessCallback.calledOnce, true)

    // Second call with cached token
    await handler.token(context)
    assert.equal(onSuccessCallback.calledOnce, true) // Still only called once
  })
})
