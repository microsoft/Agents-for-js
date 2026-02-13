import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import sinon from 'sinon'

import { UserAuthorization } from '../../../src/app/auth/authorization'
import { AgentApplication } from '../../../src/app'
import { MemoryStorage } from '../../../src/storage'
import { AzureBotAuthorizationOptions } from '../../../src/app/auth/handlers'

describe('AgentApplication - Authorization Setup', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should initialize with undefined authorization', () => {
    const app = new AgentApplication()
    assert.equal(app.options.authorization, undefined)
  })

  it('should throw when authorization configured without storage', () => {
    assert.throws(() => {
      const app = new AgentApplication({
        authorization: {
          testAuth: {}
        }
      })
      assert.equal(app.options.authorization, undefined)
    }, { message: 'Storage is required for Authorization. Ensure that a storage provider is configured in the AgentApplication options.' })
  })

  it('should throw when authorization has no handlers', () => {
    assert.throws(() => {
      const app = new AgentApplication({
        storage: new MemoryStorage(),
        authorization: {}
      })
      assert.equal(app.options.authorization, undefined)
    }, { message: 'The AgentApplication.authorization does not have any auth handlers configured.' })
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

  it('should initialize successfully with valid auth configuration from env', () => {
    // Set test environment variables
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'EnvConnection',
      [`${key}__title`]: 'Env Title',
      [`${key}__text`]: 'Env Text'
    }

    const app = new AgentApplication({ storage: new MemoryStorage() })
    assert.equal(app.options.authorization, undefined)
    assert.notEqual(app.authorization, undefined)
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
    const one = authHandlers['authOne'].options
    const two = authHandlers['authTwo'].options
    assert.equal(one.azureBotOAuthConnectionName, 'FirstConnection')
    assert.equal(two.azureBotOAuthConnectionName, 'SecondConnection')
  })

  it('should use connection parameters from environment when not explicitly provided', () => {
    // Set test environment variables
    process.env = {
      ...process.env,
      testAuth_connectionName: 'EnvConnection',
      testAuth_connectionTitle: 'Env Title',
      testAuth_connectionText: 'Env Text'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: { }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'EnvConnection')
    assert.equal(authHandler.title, 'Env Title')
    assert.equal(authHandler.text, 'Env Text')
  })
})

describe('UserAuthorization', () => {
  const createHandler = (id: string) => {
    return {
      id,
      token: sinon.stub().resolves({ token: `${id}-token` }),
      signout: sinon.stub().resolves(true),
      onSuccess: sinon.stub(),
      onFailure: sinon.stub()
    }
  }

  let graph: ReturnType<typeof createHandler>
  let github: ReturnType<typeof createHandler>
  let manager: any
  const context: any = {}

  beforeEach(() => {
    graph = createHandler('graph')
    github = createHandler('github')
    manager = { handlers: [graph, github] }
  })

  it('getToken should call handler.token with context', async () => {
    const auth = new UserAuthorization(manager)
    const result = await auth.getToken(context, graph.id)

    assert.equal(graph.token.calledOnce, true)
    assert.deepEqual(result, { token: `${graph.id}-token` })
  })

  it('exchangeToken should call handler.token with options', async () => {
    const auth = new UserAuthorization(manager)
    const options = { scopes: ['scope.read'], connection: 'oboConn' }
    const result = await auth.exchangeToken(context, graph.id, options)

    assert.equal(graph.token.calledOnce, true)
    assert.deepEqual(result, { token: `${graph.id}-token` })
  })

  it('exchangeToken (deprecated signature) should call handler.token mapping scopes', async () => {
    const auth = new UserAuthorization(manager)
    const result = await auth.exchangeToken(context, ['s1', 's2'], graph.id)

    assert.equal(graph.token.calledOnce, true)
    assert.deepEqual(result, { token: `${graph.id}-token` })
  })

  it('signOut with handler id should call only that handler.signout', async () => {
    const auth = new UserAuthorization(manager)
    await auth.signOut(context, {} as any, graph.id)

    assert.equal(graph.signout.calledOnce, true)
    assert.equal(github.signout.called, false)
  })

  it('signOut without handler id should call signout on all handlers', async () => {
    const auth = new UserAuthorization(manager)
    await auth.signOut(context, {} as any)

    assert.equal(graph.signout.calledOnce, true)
    assert.equal(github.signout.calledOnce, true)
  })

  it('should register onSuccess on every handler and invoke provided handler', async () => {
    const auth = new UserAuthorization(manager)
    const userHandler = sinon.stub().resolves()

    auth.onSignInSuccess(userHandler)

    // registered once per handler
    assert.equal(graph.onSuccess.calledOnce, true)
    assert.equal(github.onSuccess.calledOnce, true)

    // simulate the inner callback being invoked by the handler
    const aCallback = graph.onSuccess.firstCall.args[0] as (ctx: any) => Promise<void>
    await aCallback(context)

    assert.equal(userHandler.calledOnce, true)
  })

  it('should register onFailure on every handler and invoke provided handler', async () => {
    const auth = new UserAuthorization(manager)
    const userHandler = sinon.stub().resolves()

    auth.onSignInFailure(userHandler)

    assert.equal(graph.onFailure.calledOnce, true)
    assert.equal(github.onFailure.calledOnce, true)

    const aCallback = graph.onFailure.firstCall.args[0] as (ctx: any, reason?: string) => Promise<void>
    await aCallback(context, 'error reason')

    assert.equal(userHandler.calledOnce, true)
  })

  it('should throw when using a non-existent auth handler id', async () => {
    const auth = new UserAuthorization(manager)
    await assert.rejects(
      async () => auth.getToken(context, 'nonExistinghandler'),
      { message: "Cannot find auth handler with ID 'nonExistinghandler'. Ensure it is configured in the agent application options." }
    )
  })
})
