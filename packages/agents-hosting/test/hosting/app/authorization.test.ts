import { strict as assert } from 'assert'
import { describe, it } from 'node:test'

import { AgentApplication, Authorization } from './../../../src/app'
import { MemoryStorage } from '../../../src/storage'

describe('AgentApplication', () => {
  it('should throw without storage', () => {
    assert.throws(() => new Authorization(new AgentApplication()), { message: 'Storage is required for Authorization. Ensure that a storage provider is configured in the AgentApplication options.' })
  })

  it('should not allow empty handlers', () => {
    assert.throws(() => {
      const app = new AgentApplication({ storage: new MemoryStorage() })
      const auth = new Authorization(app)
      auth.initialize({})
    }, { message: 'Cannot initialize Authorization with empty options' })
  })

  it('should initialize successfully with valid auth configuration', () => {
    const app = new AgentApplication({ storage: new MemoryStorage() })
    const auth = new Authorization(app)
    const guards = auth.initialize({ testAuth: { name: 'TestConnection' } })

    assert.equal(guards.testAuth.settings.name, 'TestConnection')
  })

  it('should support multiple auth handlers', () => {
    const app = new AgentApplication({ storage: new MemoryStorage() })
    const auth = new Authorization(app)
    const guards = auth.initialize({
      authOne: { name: 'FirstConnection', title: 'Auth One' },
      authTwo: { name: 'SecondConnection', title: 'Auth Two' }
    })

    assert.equal(Object.keys(guards).length, 2)
    assert.equal(guards.authOne.settings.name, 'FirstConnection')
    assert.equal(guards.authTwo.settings.name, 'SecondConnection')
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
      const app = new AgentApplication({ storage: new MemoryStorage() })
      const auth = new Authorization(app)
      const guards = auth.initialize({ testAuth: {} })

      assert.equal(guards.testAuth.settings.name, 'EnvConnection')
      assert.equal(guards.testAuth.settings.title, 'Env Title')
      assert.equal(guards.testAuth.settings.text, 'Env Text')
    } finally {
      // Restore original env
      process.env = originalEnv
    }
  })
})
