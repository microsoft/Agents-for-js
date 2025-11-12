import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { createStubInstance } from 'sinon'

import { AgentApplication } from './../../../src/app'
import { MemoryStorage } from '../../../src/storage'
import { CloudAdapter, MsalConnectionManager, TurnContext, UserTokenClient } from '../../../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AzureBotActiveHandler, AzureBotAuthorization, AzureBotAuthorizationOptions } from '../../../src/app/auth/handlers'
import { AuthorizationHandlerStatus } from '../../../src/app/auth/types'

describe('AgentApplication', () => {
  it('should intitalize with underfined authorization', () => {
    const app = new AgentApplication()
    assert.equal(app.options.authorization, undefined)
  })

  it('should throw without storage', () => {
    assert.throws(() => {
      const app = new AgentApplication({
        authorization: {}
      })
      assert.equal(app.options.authorization, undefined)
    }, { message: 'Storage is required for Authorization. Ensure that a storage provider is configured in the AgentApplication options.' })
  })

  it('should not allow empty handlers', () => {
    assert.throws(() => {
      const app = new AgentApplication({
        storage: new MemoryStorage(),
        authorization: {}
      })
      assert.equal(app.options.authorization, undefined)
    }, { message: 'The AgentApplication.authorization does not have any auth handlers' })
  })

  it('should initialize successfully with valid auth configuration', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: { name: 'TestConnection' }
      }
    })
    assert.ok(app.authorization)
    assert.deepEqual(Object.keys(app.options.authorization!), ['testAuth'])
  })

  it('should throw when accessing authorization without configuring it', () => {
    const app = new AgentApplication()
    assert.throws(() => {
      const auth = app.authorization
      assert.equal(auth, undefined)
    }, { message: 'The Application.authorization property is unavailable because no authorization options were configured.' })
  })

  it('should throw when registering onSignInSuccess without authorization', () => {
    const app = new AgentApplication()
    assert.throws(() => {
      app.onSignInSuccess(async () => {})
    }, { message: 'The Application.authorization property is unavailable because no authorization options were configured.' })
  })

  it('should support multiple auth handlers', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        authOne: { name: 'FirstConnection', title: 'Auth One' },
        authTwo: { name: 'SecondConnection', title: 'Auth Two' }
      }
    })

    const authHandlers = (app.authorization as any).manager._handlers
    assert.equal(Object.keys(authHandlers).length, 2)
    const one = authHandlers['authOne']._options
    const two = authHandlers['authTwo']._options
    assert.equal(one.name, 'FirstConnection')
    assert.equal(two.name, 'SecondConnection')
  })

  it('should use connection parameters from environment when not explicitly provided', () => {
    // Save original env
    const originalEnv = process.env

    // Set test environment variables
    process.env = {
      ...process.env,
      testAuth_connectionName: 'EnvConnection',
      testAuth_connectionTitle: 'Env Title',
      testAuth_connectionText: 'Env Text',
      testAuth_connectionAuto: 'true'
    }

    try {
      const app = new AgentApplication({
        storage: new MemoryStorage(),
        authorization: {
          testAuth: { }
        }
      })

      const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth']._options
      assert.equal(authHandler.name, 'EnvConnection')
      assert.equal(authHandler.title, 'Env Title')
      assert.equal(authHandler.text, 'Env Text')
    } finally {
      // Restore original env
      process.env = originalEnv
    }
  })

  it('should throw when using a non-existent auth handler id', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: { name: 'test' }
      }
    })
    assert.rejects(async () => {
      await app.authorization.getToken({} as any, 'nonExistinghandler')
    }, { message: "Cannot find auth handler with ID 'nonExistinghandler'. Ensure it is configured in the agent application options." })
  })

  it('should handle duplicate token exchange requests', async () => {
    const adapter = new CloudAdapter()
    const storage = new MemoryStorage()
    const connections = new MsalConnectionManager()
    const exchangeActivity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      from: { id: 'user1' },
      recipient: { id: 'bot' },
      conversation: { id: 'convo1' },
      name: 'signin/tokenExchange',
      value: { id: 'testId', token: 'incoming-token', connectionName: 'connectionName' }
    })
    const context = new TurnContext(adapter, exchangeActivity)
    const auth = new AzureBotAuthorization('handlerId', { name: 'connectionName' }, { connections, storage })

    const userTokenClient = createStubInstance(UserTokenClient)
    userTokenClient.exchangeTokenAsync.resolves({ token: 'exchanged-token' })
    context.turnState.set(context.adapter.UserTokenClientKey, userTokenClient)

    // Provide an active session to hit the token exchange path
    const active: AzureBotActiveHandler = { id: auth.id, activity: exchangeActivity, attemptsLeft: 2 }
    const first = await auth.signin(context, active)
    const second = await auth.signin(context, active)

    assert.equal(first, AuthorizationHandlerStatus.APPROVED)
    // Second request should be pending to discard the duplicated exchange.
    assert.equal(second, AuthorizationHandlerStatus.PENDING)
  })
})
