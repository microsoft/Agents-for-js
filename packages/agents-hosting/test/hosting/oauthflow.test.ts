import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { CloudAdapter, MemoryStorage, OAuthFlow, SignInResource, TurnContext, UserTokenClient, FlowState } from './../../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import sinon from 'sinon'

const createTestActivity = (overrides?: Partial<Activity>) => Activity.fromObject({
  type: ActivityTypes.Message,
  channelId: 'test',
  recipient: {
    id: 'testRecipient'
  },
  serviceUrl: 'https://test.com',
  from: {
    id: 'testUser'
  },
  conversation: {
    id: 'testConversation'
  },
  replyToId: 'testReplyToId',
  text: 'testText',
  ...overrides
})

const testSigninResource : SignInResource = {
  signInLink: 'https://test.com',
  tokenExchangeResource: {
    id: 'testTokenExchangeId',
    uri: 'https://test.com',
  },
  tokenPostResource: {
    sasUrl: 'https://test.com',
  }
}

describe('OAuthFlow', () => {
  const fakeUserTokenClient = new UserTokenClient('fakeToken', '123')
  const fakeAdapter = new CloudAdapter({ clientId: 'fakeClientId', clientSecret: 'fakeClientSecret', issuers: [] })
  let context: TurnContext
  let memory: MemoryStorage
  let oAuthFlow: OAuthFlow
  let mockUserTokenClient: sinon.SinonMock
  let mockTurnContext: sinon.SinonMock
  let testActivity: Activity
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    testActivity = createTestActivity()
    context = new TurnContext(fakeAdapter, testActivity)
    mockTurnContext = sinon.mock(context)
    mockUserTokenClient = sinon.mock(fakeUserTokenClient)
    memory = new MemoryStorage()
    oAuthFlow = new OAuthFlow(memory, 'testSSO', fakeUserTokenClient)
    clock = sinon.useFakeTimers(Date.now())
  })

  afterEach(() => {
    mockTurnContext.verify()
    mockUserTokenClient.verify()
    mockTurnContext.restore()
    mockUserTokenClient.restore()
    clock.restore()
  })

  describe('Constructor', () => {
    it('should create OAuthFlow with default values', () => {
      const flow = new OAuthFlow(memory, 'testConnection')
      assert.strictEqual(flow.absOauthConnectionName, 'testConnection')
      assert.strictEqual(flow.cardTitle, 'Sign in')
      assert.strictEqual(flow.cardText, 'login')
    })

    it('should create OAuthFlow with custom values', () => {
      const flow = new OAuthFlow(memory, 'testConnection', fakeUserTokenClient, 'Custom Title', 'Custom Text')
      assert.strictEqual(flow.absOauthConnectionName, 'testConnection')
      assert.strictEqual(flow.cardTitle, 'Custom Title')
      assert.strictEqual(flow.cardText, 'Custom Text')
    })
  })

  describe('getUserToken', () => {
    it('should retrieve token from service when not cached', async () => {
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser').returns({ token: 'testToken' })

      const tokenResponse = await oAuthFlow.getUserToken(context)

      assert.strictEqual(tokenResponse.token, 'testToken')
    })

    it('should return cached token when available and not expired', async () => {
      // First call to populate cache
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser').returns({ token: 'cachedToken' })
      await oAuthFlow.getUserToken(context)

      // Second call should use cache (no mock expectation)
      const tokenResponse = await oAuthFlow.getUserToken(context)
      assert.strictEqual(tokenResponse.token, 'cachedToken')
    })

    it('should refresh token when cache is expired', async () => {
      // First call to populate cache
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser').returns({ token: 'oldToken' })
      await oAuthFlow.getUserToken(context)

      // Advance time beyond cache expiry (10 minutes)
      clock.tick(11 * 60 * 1000)

      // Second call should refresh token
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser').returns({ token: 'newToken' })
      const tokenResponse = await oAuthFlow.getUserToken(context)
      assert.strictEqual(tokenResponse.token, 'newToken')
    })

    it('should throw error when activity is missing required fields', async () => {
      const invalidActivity = createTestActivity({ channelId: undefined })
      const invalidContext = new TurnContext(fakeAdapter, invalidActivity)

      await assert.rejects(async () => {
        await oAuthFlow.getUserToken(invalidContext)
      }, new Error('UserTokenService requires channelId and from to be set'))
    })

    it('should not cache token when token is undefined', async () => {
      mockUserTokenClient.expects('getUserToken').twice().withArgs('testSSO', 'test', 'testUser').returns({ token: undefined })

      // First call
      await oAuthFlow.getUserToken(context)
      // Second call should also hit the service (not cached)
      await oAuthFlow.getUserToken(context)
    })
  })

  describe('beginFlow', () => {
    it('should succeed when token found in service', async () => {
      mockTurnContext.expects('sendActivity').never()
      mockUserTokenClient.expects('getTokenOrSignInResource').once().returns({ tokenResponse: { token: 'testToken' } })

      const tokenResponse = await oAuthFlow.beginFlow(context)

      assert.strictEqual(tokenResponse?.token, 'testToken')
      assert.strictEqual(oAuthFlow.state?.flowStarted, false)
      assert.strictEqual(oAuthFlow.state?.flowExpires, 0)
    })

    it('should return cached token when available', async () => {
      // First call to populate cache
      mockUserTokenClient.expects('getTokenOrSignInResource').once().returns({ tokenResponse: { token: 'cachedToken' } })
      await oAuthFlow.beginFlow(context)

      // Second call should use cache
      mockTurnContext.expects('sendActivity').never()
      const tokenResponse = await oAuthFlow.beginFlow(context)
      assert.strictEqual(tokenResponse?.token, 'cachedToken')
    })

    it('should send OAuth card if token not in service', async () => {
      mockUserTokenClient.expects('getTokenOrSignInResource').once().returns({ signInResource: testSigninResource })
      mockTurnContext.expects('sendActivity').once().withArgs(sinon.match.hasNested('attachments[0].contentType', 'application/vnd.microsoft.card.oauth'))

      const tokenResponse = await oAuthFlow.beginFlow(context)

      assert.strictEqual(tokenResponse, undefined)
      assert.strictEqual(oAuthFlow.state?.flowStarted, true)
      assert.strictEqual(oAuthFlow.state?.flowExpires! > 0, true)
    })

    it('should throw error if connectionName is not set', async () => {
      oAuthFlow.absOauthConnectionName = ''
      await assert.rejects(async () => {
        await oAuthFlow.beginFlow(context)
      }, new Error('connectionName is not set'))
    })

    it('should cache token when retrieved from service', async () => {
      mockUserTokenClient.expects('getTokenOrSignInResource').once().returns({ tokenResponse: { token: 'newToken' } })

      const tokenResponse = await oAuthFlow.beginFlow(context)

      // Verify token was returned
      assert.strictEqual(tokenResponse?.token, 'newToken')

      // Verify subsequent call uses cache
      const cachedResponse = await oAuthFlow.beginFlow(context)
      assert.strictEqual(cachedResponse?.token, 'newToken')
    })
  })

  describe('continueFlow', () => {
    it('should retrieve token using valid magic code from text', async () => {
      const activeState = { userToken: '', flowStarted: true, flowExpires: Date.now() + 10000, absOauthConnectionName: 'test', continuationActivity: testActivity }
      const stateKey = 'oauth/test/testConversation/testUser/flowState'
      await memory.write({ [stateKey]: activeState })

      const magicCode = '123456'
      testActivity.text = magicCode
      sinon.stub(context, 'activity').get(() => testActivity)
      mockUserTokenClient.expects('getSignInResource').never()
      mockTurnContext.expects('sendActivity').never()
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser', magicCode).returns({ token: 'retrievedToken' })

      const token = await oAuthFlow.continueFlow(context)

      assert.strictEqual(token?.token, 'retrievedToken')
    })

    it('should handle flow expiration', async () => {
      const expiredState: FlowState = { flowStarted: true, flowExpires: Date.now() - 1000, absOauthConnectionName: 'test' }
      // Set state in storage since continueFlow reads from storage
      const stateKey = 'oauth/test/testUser/flowState'
      await memory.write({ [stateKey]: expiredState })

      mockTurnContext.expects('sendActivity').once().withArgs(sinon.match.hasNested('text', 'Sign-in session expired. Please try again.'))

      const token = await oAuthFlow.continueFlow(context)

      assert.strictEqual(token?.token, undefined)
      assert.strictEqual(oAuthFlow.state?.flowStarted, false)
    })

    it('should handle invalid magic code format', async () => {
      const activeState: FlowState = { flowStarted: true, flowExpires: Date.now() + 10000, absOauthConnectionName: 'test' }
      const stateKey = 'oauth/test/testUser/flowState'
      await memory.write({ [stateKey]: activeState })

      testActivity.text = 'invalid'
      sinon.stub(context, 'activity').get(() => testActivity)
      mockTurnContext.expects('sendActivity').once().withArgs(sinon.match.hasNested('text', 'Invalid code format. Please enter a 6-digit code.'))

      const token = await oAuthFlow.continueFlow(context)

      assert.strictEqual(token?.token, undefined)
    })

    it('should handle invalid magic code', async () => {
      const activeState: FlowState = { flowStarted: true, flowExpires: Date.now() + 10000, absOauthConnectionName: 'test' }
      const stateKey = 'oauth/test/testUser/flowState'
      await memory.write({ [stateKey]: activeState })

      const magicCode = '123456'
      testActivity.text = magicCode
      sinon.stub(context, 'activity').get(() => testActivity)
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser', magicCode).returns({ token: undefined })

      const token = await oAuthFlow.continueFlow(context)

      assert.strictEqual(token?.token, undefined)
      assert.strictEqual(oAuthFlow.state?.flowStarted, true)
    })

    it('should handle verifyState invoke activity', async () => {
      const activeState: FlowState = { flowStarted: true, flowExpires: Date.now() + 10000, absOauthConnectionName: 'test' }
      const verifyActivity = createTestActivity({
        type: ActivityTypes.Invoke,
        name: 'signin/verifyState',
        value: { state: '123456' }
      })
      const verifyContext = new TurnContext(fakeAdapter, verifyActivity)
      const stateKey = 'oauth/test/testUser/flowState'
      await memory.write({ [stateKey]: activeState })

      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser', '123456').returns({ token: 'verifiedToken' })

      const token = await oAuthFlow.continueFlow(verifyContext)

      assert.strictEqual(token?.token, 'verifiedToken')
    })

    it('should handle token exchange during continueFlow', async () => {
      const activeState: FlowState = { flowStarted: true, flowExpires: Date.now() + 10000, absOauthConnectionName: 'test', continuationActivity: testActivity }
      const stateKey = 'oauth/test/testUser/flowState'
      await memory.write({ [stateKey]: activeState })

      const tokenExchangeRequest = { id: 'exchangeId' }
      context.activity.type = ActivityTypes.Invoke
      context.activity.name = 'signin/tokenExchange'
      context.activity.value = tokenExchangeRequest

      mockTurnContext.expects('sendActivity').never()
      mockUserTokenClient.expects('exchangeTokenAsync').once().withArgs('testUser', 'testSSO', 'test', tokenExchangeRequest).returns({ token: 'exchangedToken' })

      const flowResult = await oAuthFlow.continueFlow(context)
      assert.strictEqual(flowResult?.token, 'exchangedToken')
    })

    it('should handle duplicate token exchange requests', async () => {
      const activeState: FlowState = { flowStarted: true, flowExpires: Date.now() + 10000, absOauthConnectionName: 'test' }
      const tokenExchangeRequest = { id: 'duplicateId' }
      oAuthFlow.tokenExchangeId = 'duplicateId' // Set as already processed

      const exchangeActivity = createTestActivity({
        type: ActivityTypes.Invoke,
        name: 'signin/tokenExchange',
        value: tokenExchangeRequest
      })
      const exchangeContext = new TurnContext(fakeAdapter, exchangeActivity)
      const stateKey = 'oauth/test/testUser/flowState'
      await memory.write({ [stateKey]: activeState })

      mockUserTokenClient.expects('exchangeTokenAsync').never()

      const token = await oAuthFlow.continueFlow(exchangeContext)

      assert.strictEqual(token?.token, undefined)
    })

    it('should cache token when retrieved via magic code', async () => {
      const activeState: FlowState = { flowStarted: true, flowExpires: Date.now() + 10000, absOauthConnectionName: 'test' }
      const stateKey = 'oauth/test/testUser/flowState'
      await memory.write({ [stateKey]: activeState })

      const magicCode = '123456'
      testActivity.text = magicCode
      sinon.stub(context, 'activity').get(() => testActivity)
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser', magicCode).returns({ token: 'cachedToken' })

      await oAuthFlow.continueFlow(context)

      // Verify token was cached by calling getUserToken which should return cached version
      const cachedToken = await oAuthFlow.getUserToken(context)
      assert.strictEqual(cachedToken.token, 'cachedToken')
    })
  })

  describe('signOut', () => {
    it('should sign out user and clear state', async () => {
      mockUserTokenClient.expects('signOut').once().withArgs('testUser', 'testSSO', 'test')
      await oAuthFlow.signOut(context)
      assert.strictEqual(oAuthFlow.state?.flowStarted, false)
      assert.strictEqual(oAuthFlow.state?.flowExpires, 0)
    })

    it('should clear cached token on sign out', async () => {
      // First populate cache
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser').returns({ token: 'tokenToBeCleared' })
      await oAuthFlow.getUserToken(context)

      // Sign out
      mockUserTokenClient.expects('signOut').once().withArgs('testUser', 'testSSO', 'test')
      await oAuthFlow.signOut(context)

      // Verify cache is cleared by checking if getUserToken hits the service again
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser').returns({ token: 'newToken' })
      const token = await oAuthFlow.getUserToken(context)
      assert.strictEqual(token.token, 'newToken')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing activity properties in flow state key generation', async () => {
      const invalidActivity = createTestActivity({ from: undefined })
      const invalidContext = new TurnContext(fakeAdapter, invalidActivity)
      const invalidFlow = new OAuthFlow(memory, 'testSSO', fakeUserTokenClient)

      await assert.rejects(async () => {
        await invalidFlow.beginFlow(invalidContext)
      }, new Error('ChannelId, conversationId, and userId must be set in the activity'))
    })

    it('should handle missing activity properties in cache key generation', async () => {
      const invalidActivity = createTestActivity({ from: undefined })
      const invalidContext = new TurnContext(fakeAdapter, invalidActivity)
      const invalidFlow = new OAuthFlow(memory, 'testSSO', fakeUserTokenClient)

      await assert.rejects(async () => {
        await invalidFlow.getUserToken(invalidContext)
      }, new Error('UserTokenService requires channelId and from to be set'))
    })

    it('should handle missing conversation id in flow state key generation', async () => {
      const invalidActivity = createTestActivity({ conversation: undefined })
      const invalidContext = new TurnContext(fakeAdapter, invalidActivity)
      const invalidFlow = new OAuthFlow(memory, 'testSSO', fakeUserTokenClient)

      await assert.rejects(async () => {
        await invalidFlow.beginFlow(invalidContext)
      }, /ChannelId, conversationId, and userId must be set/)
    })
  })

  describe('Cache Management', () => {
    it('should use separate cache entries for different users', async () => {
      const user1Activity = createTestActivity({ from: { id: 'user1' } })
      const user2Activity = createTestActivity({ from: { id: 'user2' } })
      const user1Context = new TurnContext(fakeAdapter, user1Activity)
      const user2Context = new TurnContext(fakeAdapter, user2Activity)

      // Setup different tokens for different users
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'user1').returns({ token: 'user1Token' })
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'user2').returns({ token: 'user2Token' })

      const token1 = await oAuthFlow.getUserToken(user1Context)
      const token2 = await oAuthFlow.getUserToken(user2Context)

      assert.strictEqual(token1.token, 'user1Token')
      assert.strictEqual(token2.token, 'user2Token')

      // Verify each user gets their own cached token
      const cachedToken1 = await oAuthFlow.getUserToken(user1Context)
      const cachedToken2 = await oAuthFlow.getUserToken(user2Context)

      assert.strictEqual(cachedToken1.token, 'user1Token')
      assert.strictEqual(cachedToken2.token, 'user2Token')
    })

    it('should use separate cache entries for different channels', async () => {
      const channel1Activity = createTestActivity({ channelId: 'channel1' })
      const channel2Activity = createTestActivity({ channelId: 'channel2' })
      const channel1Context = new TurnContext(fakeAdapter, channel1Activity)
      const channel2Context = new TurnContext(fakeAdapter, channel2Activity)

      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'channel1', 'testUser').returns({ token: 'channel1Token' })
      mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'channel2', 'testUser').returns({ token: 'channel2Token' })

      const token1 = await oAuthFlow.getUserToken(channel1Context)
      const token2 = await oAuthFlow.getUserToken(channel2Context)

      assert.strictEqual(token1.token, 'channel1Token')
      assert.strictEqual(token2.token, 'channel2Token')
    })
  })
})
