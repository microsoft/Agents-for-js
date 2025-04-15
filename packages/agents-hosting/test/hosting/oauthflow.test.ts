import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import sinon from 'sinon'
import { MemoryStorage, OAuthFlow, TokenResponse, TurnContext, UserState, UserTokenClient } from './../../src'
import { TestAdapter } from './testStubs'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AxiosInstance } from 'axios'
import { SigningResource } from '../oauth/signingResource'

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

class FakeUserTokenClient implements UserTokenClient {
  client: AxiosInstance
  constructor () {
    this.client = null as unknown as AxiosInstance
  }

  async getUserToken (connectionName: string, channelId: string, userId: string, code?: string): Promise<string> {
    return Promise.resolve('testToken')
  }

  async getSignInResource (clientId: string, connectionName: string, activity: Activity): Promise<SigningResource> {
    return Promise.resolve({
      signInLink: 'https://test.com',
      tokenExchangeId: 'testTokenExchangeId',
      tokenExchangeResource: {
        id: 'testTokenExchangeId',
        url: 'https://test.com',
      },
      tokenPostResource: {
        sasUrl: 'https://test.com',
      }
    })
  }

  async signOut (userId: string, connectionName: string, channelId: string): Promise<void> {
    return Promise.resolve()
  }

  async exchangeTokenAsync (userId: string, connectionName: string, channelId: string): Promise<TokenResponse> {
    return Promise.resolve({
      token: 'testToken',
      connectionName,
      channelId,
      expires: 0
    })
  }
}

describe('OAuthFlow', () => {
  const userState = new UserState(new MemoryStorage())
  const oAuthFlow: OAuthFlow = new OAuthFlow(userState, 'testSSO')
  const context = new TurnContext(new TestAdapter(), testActivity)
  beforeEach(() => {
    sinon.replace(oAuthFlow, 'userTokenClient', new FakeUserTokenClient())
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should start a new flow for non teams channel', async () => {
    const tokenResponse = await oAuthFlow.beginFlow(context)
    assert.strictEqual(tokenResponse, null, 'Token response should be null for non Teams channel')
  })
})
