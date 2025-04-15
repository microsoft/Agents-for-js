import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { MemoryStorage, OAuthFlow, SigningResource, TurnContext, UserState, UserTokenClient } from './../../src'
import { TestAdapter } from './testStubs'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import sinon from 'sinon'

const testActivity = Activity.fromObject({
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
  }
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
// class FakeUserTokenClient implements UserTokenClient {
//   client: AxiosInstance
//   constructor () {
//     this.client = null as unknown as AxiosInstance
//   }

//   async getUserToken (connectionName: string, channelId: string, userId: string, code?: string): Promise<TokenResponse | null> {
//     return Promise.resolve({ token: 'testToken', connectionName, channelId, expires: 0 })
//   }

//   async getSignInResource (clientId: string, connectionName: string, activity: Activity): Promise<SigningResource> {
//     return Promise.resolve(testSigninResource)
//   }

//   async signOut (userId: string, connectionName: string, channelId: string): Promise<void> {
//     return Promise.resolve()
//   }

//   async exchangeTokenAsync (userId: string, connectionName: string, channelId: string): Promise<TokenResponse> {
//     return Promise.resolve({
//       token: 'testToken',
//       connectionName,
//       channelId,
//       expires: 0
//     })
//   }
// }

describe('OAuthFlow', () => {
  const userState = new UserState(new MemoryStorage())
  const fakseUserTokenClient = new UserTokenClient('fakeToken')
  const context = new TurnContext(new TestAdapter(), testActivity)
  let oAuthFlow: OAuthFlow
  let mockUserTokenClient: sinon.SinonMock
  // const spy = sinon.spy()
  beforeEach(() => {
    mockUserTokenClient = sinon.mock(fakseUserTokenClient)
    oAuthFlow = new OAuthFlow(userState, 'testSSO', fakseUserTokenClient)
  })

  afterEach(() => {
    mockUserTokenClient.restore()
    userState.clear(context)
  })

  it('should start a new flow for non teams channel', async () => {
    userState.clear(context)
    mockUserTokenClient.expects('getUserToken').returns({ token: 'testToken', channelId: 'test', connectionName: 'testSSO', expires: 0 })
    const tokenResponse = await oAuthFlow.beginFlow(context)
    assert.strictEqual(tokenResponse.channelId, 'test')
    assert.strictEqual(tokenResponse.connectionName, 'testSSO')
    assert.strictEqual(tokenResponse.token, 'testToken')
  })

  it('should call getSigningResource if getUserToken returns null', async () => {
    mockUserTokenClient.expects('getUserToken').returns(null)
    mockUserTokenClient.expects('getSignInResource').once().returns(testSigninResource)
    const tokenResponse = await oAuthFlow.beginFlow(context)
    assert.strictEqual(tokenResponse.channelId, 'test')
    assert.strictEqual(tokenResponse.connectionName, 'testSSO')
    assert.strictEqual(tokenResponse.token, null)
  })
})
