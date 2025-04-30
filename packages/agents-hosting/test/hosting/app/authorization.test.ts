import { strict as assert } from 'assert'
import { describe, it } from 'node:test'

import { AgentApplication } from './../../../src/app'

describe('AgentApplication', () => {
  it('should intitalize with underfined authorization', () => {
    const app = new AgentApplication()
    assert.equal(app.options.authorization, undefined)
  })

  it('should allow an empty authorization', () => {
    const app = new AgentApplication({
      authorization: {}
    })
    assert.deepEqual(app.options.authorization, {})
  })

  it('should allow one authHander with no values', () => {
    process.env['graph_connectionName'] = 'testConnectionName'
    const app = new AgentApplication({
      authorization: {
        graph: {}
      }
    })
    assert.equal(app.options.authorization?.graph.name, 'testConnectionName')
    assert.equal(app.options.authorization?.graph.auto, false)
  })

  it('should set the auto', () => {
    process.env['graph_connectionName'] = 'testConnectionName'
    const app1 = new AgentApplication({
      authorization: {
        graph: { auto: false }
      }
    })
    assert.equal(app1.options.authorization?.graph.name, 'testConnectionName')
    assert.equal(app1.options.authorization?.graph.auto, false)

    const app2 = new AgentApplication({
      authorization: {
        graph: { auto: true }
      }
    })
    assert.equal(app2.options.authorization?.graph.name, 'testConnectionName')
    assert.equal(app2.options.authorization?.graph.auto, true)
  })
})
