import { strict as assert } from 'assert'
import { afterEach, describe, it } from 'node:test'
import sinon from 'sinon'
import { UserTokenClient } from '../../../src/oauth'
import { AuthProvider } from '../../../src/auth'

describe('UserTokenClient', () => {
  describe('UserTokenClient lazy authentication', () => {
    afterEach(() => {
      sinon.restore()
    })

    it('should not acquire a bearer token until a token-service API is called', async () => {
      const authProvider = {
        getAccessToken: sinon.stub().resolves('lazy-access-token')
      } as unknown as AuthProvider
      const fetchStub = sinon.stub(global, 'fetch').resolves(new Response(JSON.stringify([]), { status: 200 }))

      const client = await UserTokenClient.createClientWithScope(
        'https://api.botframework.com',
        authProvider,
        'https://api.botframework.com'
      )

      assert.strictEqual((authProvider.getAccessToken as sinon.SinonStub).notCalled, true)
      assert.strictEqual(client.client.defaultHeaders.authorization, undefined)

      await client.getTokenStatus('user-id', 'msteams')

      assert.strictEqual((authProvider.getAccessToken as sinon.SinonStub).calledOnceWithExactly('https://api.botframework.com'), true)
      assert.strictEqual(client.client.defaultHeaders.authorization, 'Bearer lazy-access-token')

      const requestHeaders = fetchStub.getCall(0).args[1]?.headers as Headers
      assert.strictEqual(requestHeaders.get('authorization'), 'Bearer lazy-access-token')
    })

    it('should reuse the lazy bearer token for later token-service API calls', async () => {
      const authProvider = {
        getAccessToken: sinon.stub().resolves('lazy-access-token')
      } as unknown as AuthProvider
      sinon.stub(global, 'fetch').callsFake(async () => new Response(JSON.stringify([]), { status: 200 }))

      const client = await UserTokenClient.createClientWithScope(
        'https://api.botframework.com',
        authProvider,
        'https://api.botframework.com'
      )

      await client.getTokenStatus('user-id', 'msteams')
      await client.getTokenStatus('user-id', 'msteams')

      assert.strictEqual((authProvider.getAccessToken as sinon.SinonStub).calledOnce, true)
    })

    it('should retry lazy token acquisition after a short token response', async () => {
      const getAccessToken = sinon.stub()
      getAccessToken.onFirstCall().resolves('x')
      getAccessToken.onSecondCall().resolves('retried-access-token')
      const authProvider = { getAccessToken } as unknown as AuthProvider
      const fetchStub = sinon.stub(global, 'fetch').callsFake(async () => new Response(JSON.stringify([]), { status: 200 }))

      const client = await UserTokenClient.createClientWithScope(
        'https://api.botframework.com',
        authProvider,
        'https://api.botframework.com'
      )

      await client.getTokenStatus('user-id', 'msteams')

      assert.strictEqual(getAccessToken.calledOnceWithExactly('https://api.botframework.com'), true)
      assert.strictEqual(client.client.defaultHeaders.authorization, undefined)
      const firstRequestHeaders = fetchStub.getCall(0).args[1]?.headers as Headers
      assert.strictEqual(firstRequestHeaders.get('authorization'), null)

      await client.getTokenStatus('user-id', 'msteams')

      assert.strictEqual(getAccessToken.calledTwice, true)
      assert.strictEqual(client.client.defaultHeaders.authorization, 'Bearer retried-access-token')
      const secondRequestHeaders = fetchStub.getCall(1).args[1]?.headers as Headers
      assert.strictEqual(secondRequestHeaders.get('authorization'), 'Bearer retried-access-token')
    })
  })
})
