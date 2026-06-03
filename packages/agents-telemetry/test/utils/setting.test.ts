import assert from 'assert'
import { describe, it, afterEach } from 'node:test'
import { getSetting } from '../../src/utils/setting'

describe('getSetting', () => {
  const ENV_KEY = 'TEST_AGENTS_TELEMETRY_SETTING'

  afterEach(() => {
    delete process.env[ENV_KEY]
  })

  it('returns the value of an environment variable when set', () => {
    process.env[ENV_KEY] = 'test-value'
    assert.strictEqual(getSetting(ENV_KEY), 'test-value')
  })

  it('returns empty string when environment variable is not set', () => {
    assert.strictEqual(getSetting(ENV_KEY), '')
  })

  it('returns empty string for undefined env var (not null)', () => {
    delete process.env[ENV_KEY]
    assert.strictEqual(getSetting(ENV_KEY), '')
  })
})
