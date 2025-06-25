import { strict as assert } from 'assert'
import { describe, it } from 'node:test'

import { AgentApplication } from './../../../src/app'
import { MemoryStorage } from '../../../src/storage'

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
    }, { message: 'Storage is required for UserAuthorization' })
  })

  it('should not allow empty handlers', () => {
    assert.throws(() => {
      const app = new AgentApplication({
        storage: new MemoryStorage(),
        authorization: {}
      })
      assert.equal(app.options.authorization, undefined)
    }, { message: 'The authorization does not have any auth handlers' })
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

    const authHandlers = app.authorization._authHandlers
    assert.equal(Object.keys(authHandlers).length, 2)
    const one = app.authorization._authHandlers['authOne']
    const two = app.authorization._authHandlers['authTwo']
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

      const authHandler = app.authorization._authHandlers['testAuth']
      assert.equal(authHandler.name, 'EnvConnection')
      assert.equal(authHandler.title, 'Env Title')
      assert.equal(authHandler.text, 'Env Text')
      assert.equal(authHandler.auto, true)
    } finally {
      // Restore original env
      process.env = originalEnv
    }
  })
})
