import { strict as assert } from 'assert'
import { beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'

import { UserAuthorization } from '../../../src/app/auth/authorization'

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
    manager = { handlers: { graph, github } }
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
