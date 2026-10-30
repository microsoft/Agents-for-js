import { strict as assert } from 'node:assert'
import { loadAuthConfigFromEnv } from '../../../src'

async function initialize () {
  // Simulate asynchronous secret retrieval after the SDK has been imported.
  await Promise.resolve()
  process.env.clientId = 'late-client-id'
  process.env.clientSecret = 'late-client-secret'
  process.env.tenantId = 'late-tenant-id'

  const configuration = loadAuthConfigFromEnv()
  assert.equal(configuration.clientId, 'late-client-id')
  assert.equal(configuration.clientSecret, 'late-client-secret')
  assert.equal(configuration.tenantId, 'late-tenant-id')
  assert.equal(configuration.connections?.get('serviceConnection')?.clientId, 'late-client-id')
}

initialize().catch(error => {
  console.error(error)
  process.exitCode = 1
})
