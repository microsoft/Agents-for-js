import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { it } from 'node:test'

it('loads credentials injected after importing the SDK', () => {
  const fixture = fileURLToPath(new URL('./fixtures/authEnvironmentAfterImport.ts', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', 'tsx', fixture], {
    encoding: 'utf8',
    timeout: 15000,
    env: {
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: 'development'
    }
  })

  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
})
