import { strict as assert } from 'assert'
import { beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'

import { AzureBotAuthorization } from '../../../src/app/auth/handlers/azureBotAuthorization'
import type { AzureBotAuthorizationSettings } from '../../../src/app/auth/handlers/azureBotAuthorization'
import { MemoryStorage } from '../../../src/storage'
import { UserTokenClient } from '../../../src/oauth'
import { TurnContext } from '../../../src'
import { TestAdapter } from '../testStubs'
import { Activity } from '@microsoft/agents-activity'
import { AuthorizationHandlerStatus } from '../../../src/app/auth/types'
import { ActivityTypes } from '../../../../agents-activity/src'

const createSettings = (): AzureBotAuthorizationSettings => ({
  storage: new MemoryStorage(),
  connections: {
    getDefaultConnection: () => ({ acquireTokenOnBehalfOf: sinon.stub().resolves('obo-token') }),
    getConnection: () => ({ acquireTokenOnBehalfOf: sinon.stub().resolves('obo-token') })
  } as any
})

describe('AzureBotAuthorization', () => {
  let settings: AzureBotAuthorizationSettings
  let mockClient: sinon.SinonStubbedInstance<UserTokenClient>
  const baseAdapter = new TestAdapter()
  const baseActivity = Activity.fromObject({
    type: ActivityTypes.Message,
    from: { id: 'user-1' },
    recipient: { id: 'bot-1' },
    conversation: { id: 'conv-1' },
    channelId: 'webchat'
  })
  const active = { id: 'auth', activity: baseActivity, attemptsLeft: 2 }

  beforeEach(() => {
    settings = createSettings()
    mockClient = sinon.createStubInstance(UserTokenClient)
  })

  it('token should call getTokenOrSignInResource when token not in context', async () => {
    mockClient.getTokenOrSignInResource.resolves({ tokenResponse: { token: 'token' } } as any)
    const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
    const context = new TurnContext(baseAdapter, baseActivity)
    context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
    const result = await handler.token(context)
    assert.deepEqual(result, { token: 'token' })
    assert.equal(mockClient.getTokenOrSignInResource.calledOnce, true)
  })

  it('signout should call UserTokenClient.signOut', async () => {
    const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
    const context = new TurnContext(baseAdapter, baseActivity)
    context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
    const ok = await handler.signout(context)
    assert.equal(ok, true)
    assert.equal(mockClient.signOut.calledOnce, true)
  })

  it('should return pending status when starting the auth flow', async () => {
    mockClient.getTokenOrSignInResource.resolves({ tokenResponse: undefined, signInResource: { signInLink: 'link' } } as any)
    const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
    const context = new TurnContext(baseAdapter, baseActivity)
    context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
    const status = await handler.signin(context)
    assert.equal(status, AuthorizationHandlerStatus.PENDING)
    assert.equal(mockClient.getTokenOrSignInResource.calledOnce, true)
  })

  it('should return approved status on valid magic code', async () => {
    mockClient.getTokenOrSignInResource.resolves({ tokenResponse: { token: 'token' } } as any)
    const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
    const activity = Activity.fromObject({
      ...baseActivity,
      text: '123456'
    })
    const context = new TurnContext(baseAdapter, activity)
    context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
    const status = await handler.signin(context, active)
    assert.equal(status, AuthorizationHandlerStatus.APPROVED)
    assert.equal(mockClient.getTokenOrSignInResource.calledOnce, true)
  })

  it('should return pending status on wrong magic code', async () => {
    const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
    const activity = Activity.fromObject({
      ...baseActivity,
      text: '123'
    })
    const context = new TurnContext(baseAdapter, activity)
    context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
    const status = await handler.signin(context, active)
    assert.equal(status, AuthorizationHandlerStatus.PENDING)
  })

  it('should return rejected status on max attempts exceeded', async () => {
    const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
    const context = new TurnContext(baseAdapter, baseActivity)
    context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
    const status = await handler.signin(context, { ...active, attemptsLeft: 0 })
    assert.equal(status, AuthorizationHandlerStatus.REJECTED)
  })

  describe('Teams flow', () => {
    it('should return approved status on valid signin/verifyState magic code', async () => {
      mockClient.getTokenOrSignInResource.resolves({ tokenResponse: { token: 'token' } } as any)
      const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
      const activity = Activity.fromObject({
        ...baseActivity,
        name: 'signin/verifyState',
        value: { state: '123456' }
      })
      const context = new TurnContext(baseAdapter, activity)
      context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
      const status = await handler.signin(context, active)
      assert.equal(status, AuthorizationHandlerStatus.APPROVED)
      assert.equal(mockClient.getTokenOrSignInResource.calledOnce, true)
    })

    it('should return rejected status on signin/verifyState CancelledByUser', async () => {
      const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
      const activity = Activity.fromObject({
        ...baseActivity,
        name: 'signin/verifyState',
        value: { state: 'CancelledByUser' }
      })
      const context = new TurnContext(baseAdapter, activity)
      context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
      const status = await handler.signin(context, active)
      assert.equal(status, AuthorizationHandlerStatus.REJECTED)
    })

    it('should return rejected status on signin/tokenExchange without token', async () => {
      const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
      const activity = Activity.fromObject({
        ...baseActivity,
        name: 'signin/tokenExchange',
      })
      const context = new TurnContext(baseAdapter, activity)
      context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
      const status = await handler.signin(context, active)
      assert.equal(status, AuthorizationHandlerStatus.REJECTED)
    })

    it('should return rejected status on signin/tokenExchange with different connectionName', async () => {
      const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
      const activity = Activity.fromObject({
        ...baseActivity,
        name: 'signin/tokenExchange',
        value: { token: 'tok-123', connectionName: 'other-connection' },
      })
      const context = new TurnContext(baseAdapter, activity)
      context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
      const status = await handler.signin(context, active)
      assert.equal(status, AuthorizationHandlerStatus.REJECTED)
    })

    it('should return pending status on signin/tokenExchange when unable to exchange the token', async () => {
      mockClient.exchangeTokenAsync.resolves({ token: undefined } as any)
      const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
      const activity = Activity.fromObject({
        ...baseActivity,
        name: 'signin/tokenExchange',
        value: { token: 'token', connectionName: 'connection' },
      })
      const context = new TurnContext(baseAdapter, activity)
      context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
      const status = await handler.signin(context, active)
      assert.equal(status, AuthorizationHandlerStatus.PENDING)
      assert.equal(mockClient.exchangeTokenAsync.called, true)
    })

    it('should return approved status on signin/tokenExchange when exchanging the token', async () => {
      mockClient.exchangeTokenAsync.resolves({ token: 'exchanged' } as any)
      const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
      const activity = Activity.fromObject({
        ...baseActivity,
        name: 'signin/tokenExchange',
        value: { token: 'token', connectionName: 'connection' },
      })
      const context = new TurnContext(baseAdapter, activity)
      context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
      const status = await handler.signin(context, active)
      assert.equal(status, AuthorizationHandlerStatus.APPROVED)
      assert.equal(mockClient.exchangeTokenAsync.called, true)
    })

    it('should return rejected status on signin/failure', async () => {
      const handler = new AzureBotAuthorization('auth', { azureBotOAuthConnectionName: 'connection' }, settings)
      const activity = Activity.fromObject({
        ...baseActivity,
        name: 'signin/failure',
      })
      const context = new TurnContext(baseAdapter, activity)
      context.turnState.set(baseAdapter.UserTokenClientKey, mockClient)
      const status = await handler.signin(context, active)
      assert.equal(status, AuthorizationHandlerStatus.REJECTED)
    })
  })
})
