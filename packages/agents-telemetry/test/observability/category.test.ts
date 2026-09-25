import assert from 'assert'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'

const SETTING_NAME = 'AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES'
const DEPRECATION_WARNING = `${SETTING_NAME} is deprecated and will be removed in a future release. Configure an OpenTelemetry parent-based sampler instead.`
const categoryModuleUrl = pathToFileURL(resolve(__dirname, '../../src/observability/category.ts')).href
const traceModuleUrl = pathToFileURL(resolve(__dirname, '../../src/observability/trace.ts')).href
const repoDir = resolve(__dirname, '../../../..')

type CategoryProbe = {
  storageRead: boolean
  authorizationSignIn: boolean
  userTokenClientGetToken: boolean
  adapterProcess: boolean
  storageTraceStarted: boolean
  storageTraceCallbackRan: boolean
}

function runCategoryProbe (setting?: string): { probe: CategoryProbe, stderr: string } {
  const env = {
    ...process.env,
    DEBUG: 'agents:telemetry:*',
  }

  if (setting === undefined) {
    delete env[SETTING_NAME]
  } else {
    env[SETTING_NAME] = setting
  }

  const script = `
    const categoryModule = await import(${JSON.stringify(categoryModuleUrl)})
    const traceModule = await import(${JSON.stringify(traceModuleUrl)})
    const { isSpanDisabled } = categoryModule.default ?? categoryModule
    const { traceFactory } = traceModule.default ?? traceModule
    let startedSpans = 0
    let storageTraceCallbackRan = false
    const span = {
      setStatus () {},
      recordException () {},
      end () {},
    }
    const trace = traceFactory({
      trace: {
        getTracer: () => ({
          startSpan: () => {
            startedSpans += 1
            return span
          },
          startActiveSpan: (_name, callback) => {
            startedSpans += 1
            return callback(span)
          },
        }),
      },
      SpanStatusCode: { OK: 1, ERROR: 2 },
    })
    const probe = {
      storageRead: isSpanDisabled('agents.storage.read'),
      authorizationSignIn: isSpanDisabled('agents.authorization.azure_bot_signin'),
      userTokenClientGetToken: isSpanDisabled('agents.user_token_client.get_user_token'),
      adapterProcess: isSpanDisabled('agents.adapter.process'),
    }
    trace(
      { name: 'agents.storage.read', record: {}, end () {} },
      () => { storageTraceCallbackRan = true }
    )
    probe.storageTraceStarted = startedSpans > 0
    probe.storageTraceCallbackRan = storageTraceCallbackRan
    process.stdout.write(JSON.stringify(probe))
  `

  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: repoDir,
    encoding: 'utf8',
    env,
  })

  assert.strictEqual(result.status, 0, result.stderr)

  return {
    probe: JSON.parse(result.stdout) as CategoryProbe,
    stderr: result.stderr,
  }
}

function countOccurrences (value: string, search: string): number {
  return value.split(search).length - 1
}

describe('disabled span categories', () => {
  it('does not warn or disable spans when the deprecated setting is absent', () => {
    const { probe, stderr } = runCategoryProbe()

    assert.deepStrictEqual(probe, {
      storageRead: false,
      authorizationSignIn: false,
      userTokenClientGetToken: false,
      adapterProcess: false,
      storageTraceStarted: true,
      storageTraceCallbackRan: true,
    })
    assert.strictEqual(stderr.includes(DEPRECATION_WARNING), false)
  })

  it('warns once and retains category filtering when the deprecated setting is configured', () => {
    const { probe, stderr } = runCategoryProbe('storage, authorization')

    assert.deepStrictEqual(probe, {
      storageRead: true,
      authorizationSignIn: true,
      userTokenClientGetToken: true,
      adapterProcess: false,
      storageTraceStarted: false,
      storageTraceCallbackRan: true,
    })
    assert.strictEqual(countOccurrences(stderr, DEPRECATION_WARNING), 1)
  })

  it('warns about deprecation and ignores invalid categories', () => {
    const { probe, stderr } = runCategoryProbe('not-a-category')

    assert.deepStrictEqual(probe, {
      storageRead: false,
      authorizationSignIn: false,
      userTokenClientGetToken: false,
      adapterProcess: false,
      storageTraceStarted: true,
      storageTraceCallbackRan: true,
    })
    assert.strictEqual(countOccurrences(stderr, DEPRECATION_WARNING), 1)
    assert.match(stderr, /Invalid span category "NOT-A-CATEGORY"/)
  })
})
