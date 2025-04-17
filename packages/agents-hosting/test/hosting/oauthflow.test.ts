import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { CloudAdapter, FlowState, MemoryStorage, OAuthFlow, SigningResource, TokenRequestStatus, TurnContext, UserState, UserTokenClient } from './../../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import sinon from 'sinon'

const createTestActivity = () => Activity.fromObject({
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
  text: 'testText'
})

const testSigninResource : SigningResource = {
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
  const userState = new UserState(new MemoryStorage())
  const fakseUserTokenClient = new UserTokenClient('fakeToken')
  const fakeAdapter = new CloudAdapter({ clientId: 'fakeClientId', clientSecret: 'fakeClientSecret', issuers: [] })
  const context = new TurnContext(fakeAdapter, createTestActivity())
  let oAuthFlow: OAuthFlow
  let mockUserTokenClient: sinon.SinonMock
  let mockTurnContext: sinon.SinonMock
  let testActivity: Activity
  beforeEach(() => {
    testActivity = createTestActivity()
    mockTurnContext = sinon.mock(context)
    mockUserTokenClient = sinon.mock(fakseUserTokenClient)
    oAuthFlow = new OAuthFlow(userState, 'testSSO', fakseUserTokenClient)
  })

  afterEach(() => {
    mockTurnContext.verify()
    mockUserTokenClient.verify()
    mockTurnContext.restore()
    mockUserTokenClient.restore()
    userState.clear(context)
  })

  it('begin flow should succeeds when token found in service', async () => {
    mockTurnContext.expects('sendActivity').never()
    mockUserTokenClient.expects('getSignInResource').never()
    mockUserTokenClient.expects('getUserToken').returns({ token: 'testToken', channelId: 'test', connectionName: 'testSSO', expires: 0, status: TokenRequestStatus.Success })

    const tokenResponse = await oAuthFlow.beginFlow(context)

    assert.strictEqual(tokenResponse.status, TokenRequestStatus.Success)
    assert.strictEqual(tokenResponse.token, 'testToken')
    assert.strictEqual(oAuthFlow.state?.flowStarted, false)
    assert.strictEqual(oAuthFlow.state?.flowExpires, 0)
  })

  it('should call getSigningResource and send OAuth card if token not in service', async () => {
    mockUserTokenClient.expects('getUserToken').once().returns({ status: TokenRequestStatus.Failed })
    mockUserTokenClient.expects('getSignInResource').once().returns(testSigninResource)
    mockTurnContext.expects('sendActivity').once().withArgs(sinon.match.hasNested('attachments[0].contentType', 'application/vnd.microsoft.card.oauth'))

    const tokenResponse = await oAuthFlow.beginFlow(context)

    assert.strictEqual(tokenResponse.token, undefined)
    assert.strictEqual(tokenResponse.status, TokenRequestStatus.InProgress)
    assert.strictEqual(oAuthFlow.state?.flowStarted, true)
    assert.strictEqual(oAuthFlow.state?.flowExpires > 0, true)
  })

  it('should throw error if connectionName is not set', async () => {
    oAuthFlow.absOauthConnectionName = ''
    await assert.rejects(async () => {
      await oAuthFlow.beginFlow(context)
    }, new Error('connectionName is not set in the auth config, review your environment variables'))
  })

  it('should retrieve token using valid magic code from text during continueFlow', async () => {
    const expiredState = { userToken: '', flowStarted: true, flowExpires: Date.now() + 10000 }
    oAuthFlow.state = expiredState
    const magicCode = '12345'
    testActivity.text = magicCode
    sinon.stub(context, 'activity').get(() => testActivity)
    mockUserTokenClient.expects('getSignInResource').never()
    mockTurnContext.expects('sendActivity').never()
    mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser', magicCode).returns({ token: 'retrievedToken', status: TokenRequestStatus.Success })

    const token = await oAuthFlow.continueFlow(context)

    assert.strictEqual(token?.token, 'retrievedToken')
  })

  it('should retrieve token using valid magic code from state during continueFlow', async () => {
    testActivity.type = ActivityTypes.Invoke
    testActivity.name = 'signin/verifyState'
    testActivity.value = { state: '123456' }
    sinon.stub(context, 'activity').get(() => testActivity)
    const expiredState : FlowState = { flowStarted: true, flowExpires: Date.now() + 10000 }
    oAuthFlow.state = expiredState
    mockUserTokenClient.expects('getSignInResource').never()
    mockTurnContext.expects('sendActivity').never()
    mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser', '123456').returns({ token: 'retrievedToken', status: TokenRequestStatus.Success })

    const token = await oAuthFlow.continueFlow(context)
    assert.strictEqual(token?.token, 'retrievedToken')
    assert.strictEqual(oAuthFlow.state?.flowStarted, false)
    assert.strictEqual(oAuthFlow.state?.flowExpires, 0)
  })

  it('should fail when using invalid magic code during continueFlow', async () => {
    const magicCode = 'abc'
    testActivity.text = magicCode
    sinon.stub(context, 'activity').get(() => testActivity)
    const expiredState : FlowState = { flowStarted: true, flowExpires: Date.now() + 10000 }
    oAuthFlow.state = expiredState
    mockTurnContext.expects('sendActivity').never()
    mockUserTokenClient.expects('getUserToken').once().withArgs('testSSO', 'test', 'testUser', magicCode).returns({ token: undefined, status: TokenRequestStatus.Failed })

    const flowResult = await oAuthFlow.continueFlow(context)

    assert.strictEqual(flowResult?.token, undefined)
    assert.strictEqual(oAuthFlow.state?.flowStarted, false)
    assert.strictEqual(oAuthFlow.state?.flowExpires, 0)
  })

  it('should handle token exchange during continueFlow', async () => {
    const expiredState : FlowState = { flowStarted: true, flowExpires: Date.now() + 10000 }
    oAuthFlow.state = expiredState
    const tokenExchangeRequest = { id: 'exchangeId' }
    context.activity.type = ActivityTypes.Invoke
    context.activity.name = 'signin/tokenExchange'
    context.activity.value = tokenExchangeRequest

    mockTurnContext.expects('sendActivity').never()
    mockUserTokenClient.expects('exchangeTokenAsync').once().withArgs('testUser', 'testSSO', 'test', tokenExchangeRequest).returns({ token: 'exchangedToken', status: TokenRequestStatus.Success })

    const flowResult = await oAuthFlow.continueFlow(context)
    assert.strictEqual(flowResult?.token, 'exchangedToken')
  })

  it('should sign out user and clear state', async () => {
    mockUserTokenClient.expects('signOut').once().withArgs('testUser', 'testSSO', 'test')
    await oAuthFlow.signOut(context)
    assert.strictEqual(oAuthFlow.state?.flowStarted, false)
    assert.strictEqual(oAuthFlow.state?.flowExpires, 0)
  })
})

// const oCardActivity = Activity.fromObject({
//   type: 'message',
//   attachmentLayout: 'list',
//   inputHint: 'acceptingInput',
//   attachments: [
//     {
//       contentType: 'application/vnd.microsoft.card.oauth',
//       content: {
//         buttons: [
//           {
//             type: 'signin',
//             title: 'Sign in',
//             value: 'https://test.com'
//           }
//         ],
//         connectionName: 'testSSO',
//         tokenExchangeResource: {
//           id: 'testTokenExchangeId',
//           uri: 'https://test.com'
//         },
//         tokenPostResource: {
//           sasUrl: 'https://test.com'
//         },
//         text: 'login'
//       }
//     }
//   ]
// })
