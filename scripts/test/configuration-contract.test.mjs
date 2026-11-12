import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { runConfigurationContract } from '../configuration-contract.mjs'

const sha = 'a'.repeat(40)
const otherSha = 'b'.repeat(40)
const sentinel = 'synthetic-secret-must-not-be-reported'
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    connections: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          settings: {
            type: 'object',
            properties: {
              scopes: { type: 'array', items: { type: 'string' } },
              clientSecret: { type: 'string', writeOnly: true },
              enabled: { type: 'boolean', default: true }
            },
            additionalProperties: false
          }
        },
        required: ['settings'],
        additionalProperties: false
      }
    }
  },
  required: ['connections'],
  additionalProperties: false
}
const directories = []

async function setup (document = { connections: {} }) {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'agents-contract-test-'))
  directories.push(repositoryRoot)
  await writeFile(path.join(repositoryRoot, 'input.json'), JSON.stringify(document))

  return {
    repositoryRoot,
    contractRef: sha,
    inputs: [{ id: 'test-input', file: 'input.json' }]
  }
}

function upstream (artifact = schema, revision = sha) {
  const calls = []

  return {
    calls,
    execFileImpl: async (command, args, options) => {
      assert.equal(command, 'git')
      assert.deepEqual(args, [
        'ls-remote', '--exit-code', 'https://github.com/microsoft/Agents.git', 'refs/heads/main'
      ])
      assert.equal(options.timeout, 15000)
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0')
      calls.push('git:main')

      return { stdout: `${revision}\trefs/heads/main\n` }
    },
    fetchImpl: async (url, options) => {
      calls.push(url)
      assert.equal(options.redirect, 'error')
      assert.ok(options.signal instanceof AbortSignal)
      assert.equal(
        url,
        `https://raw.githubusercontent.com/microsoft/Agents/${revision}/schema/agents-configuration.schema.json`
      )

      return Response.json(artifact)
    }
  }
}

function cacheFile (options, revision = sha) {
  return path.join(
    options.repositoryRoot, 'node_modules', '.cache', 'agents-configuration-contract',
    `${revision}.json`
  )
}

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true, maxRetries: 3 })
  }
})

describe('configuration contract validation', () => {
  it('resolves main once and records exact schema provenance without executing upstream code', async () => {
    const options = await setup()
    const remote = upstream()
    const report = await runConfigurationContract({ ...options, ...remote, contractRef: 'main' })
    assert.equal(report.status, 'passed')
    assert.equal(report.requestedRef, 'main')
    assert.equal(report.resolvedSha, sha)
    assert.equal(
      report.schemaSha256,
      createHash('sha256').update(JSON.stringify(schema)).digest('hex')
    )
    assert.equal(remote.calls.length, 2)

    const cached = JSON.parse(await readFile(cacheFile(options), 'utf8'))
    assert.equal(cached.resolvedSha, sha)
    assert.equal(cached.schemaSha256, report.schemaSha256)
  })

  it('replays an exact SHA without network and still resolves main before using its cache', async () => {
    const options = await setup()
    await runConfigurationContract({ ...options, ...upstream() })

    const offline = async () => {
      throw new Error(sentinel)
    }
    assert.equal(
      (await runConfigurationContract({ ...options, fetchImpl: offline })).status,
      'passed'
    )
    const failedMain = await runConfigurationContract({
      ...options, contractRef: 'main', fetchImpl: offline, execFileImpl: offline
    })
    assert.equal(failedMain.status, 'failed')
    assert.equal(failedMain.resolvedSha, null)
    assert.deepEqual(failedMain.diagnostics, [{ code: 'contract-revision-resolution-failed' }])
    assert.ok(!JSON.stringify(failedMain).includes(sentinel))

    const remote = upstream()
    assert.equal(
      (await runConfigurationContract({ ...options, ...remote, contractRef: 'main' })).status,
      'passed'
    )
    assert.equal(remote.calls.length, 1)
  })

  it('does not use a different cached SHA or silently repair corrupt cached data', async () => {
    const options = await setup()
    await runConfigurationContract({ ...options, ...upstream() })
    const remote = upstream(schema, otherSha)
    const next = await runConfigurationContract({ ...options, ...remote, contractRef: 'main' })
    assert.equal(next.resolvedSha, otherSha)
    assert.equal(remote.calls.length, 2)

    await writeFile(cacheFile(options), JSON.stringify({
      resolvedSha: sha, schema: JSON.stringify(schema), schemaSha256: 'wrong'
    }))
    const corrupt = await runConfigurationContract({ ...options, ...upstream() })
    assert.equal(corrupt.status, 'failed')
    assert.deepEqual(corrupt.diagnostics, [{ code: 'contract-cache-invalid' }])

    await writeFile(cacheFile(options), sentinel)
    const malformed = await runConfigurationContract({ ...options, ...upstream() })
    assert.deepEqual(malformed.diagnostics, [{ code: 'contract-cache-invalid' }])
  })

  it('rejects invalid overrides before retrieval and does not report their raw contents', async () => {
    const options = await setup()
    const remote = upstream()
    for (const contractRef of [sentinel, 'main~1', '1234567', '../main']) {
      const report = await runConfigurationContract({ ...options, ...remote, contractRef })
      assert.equal(report.requestedRef, 'invalid')
      assert.deepEqual(report.diagnostics, [{ code: 'contract-ref-invalid' }])
      assert.ok(!JSON.stringify(report).includes(sentinel))
    }
    assert.equal(remote.calls.length, 0)
  })

  it('fails safely for unsuccessful, interrupted, oversized, and malformed responses', async () => {
    const options = await setup()
    const cases = [
      [() => new Response(sentinel, { status: 404 }), 'contract-retrieval-failed'],
      [() => Promise.reject(new Error(sentinel)), 'contract-retrieval-failed'],
      [() => new Response('x'.repeat(1024 * 1024 + 1)), 'contract-response-too-large'],
      [() => new Response(`{"secret":"${sentinel}"`), 'contract-schema-json-invalid']
    ]
    for (const [fetchImpl, code] of cases) {
      const report = await runConfigurationContract({ ...options, fetchImpl })
      assert.equal(report.status, 'failed')
      assert.deepEqual(report.diagnostics, [{ code }])
      assert.ok(!JSON.stringify(report).includes(sentinel))
    }
    for (const stdout of [
      sentinel,
      `${sha}\trefs/heads/other\n`,
      `${sha}\trefs/heads/main\n${otherSha}\trefs/heads/main\n`
    ]) {
      const report = await runConfigurationContract({
        ...options,
        ...upstream(),
        contractRef: 'main',
        execFileImpl: async () => ({ stdout })
      })
      assert.equal(report.status, 'failed')
      assert.deepEqual(report.diagnostics, [{ code: 'contract-revision-invalid' }])
      assert.ok(!JSON.stringify(report).includes(sentinel))
    }
  })

  it('rejects invalid schemas, unsupported drafts, external references, and strict compilation failures', async () => {
    const options = await setup()
    const cases = [
      [{ ...schema, type: 'not-a-type' }, 'contract-schema-invalid'],
      [{ ...schema, $schema: 'http://json-schema.org/draft-07/schema#' }, 'contract-schema-draft-invalid'],
      [{ ...schema, $ref: `https://example.com/${sentinel}` }, 'contract-schema-external-reference'],
      [{ ...schema, $dynamicRef: 'other.schema.json#anchor' }, 'contract-schema-external-reference'],
      [{ ...schema, $ref: '#/$defs/missing' }, 'contract-schema-compilation-failed'],
      [{ ...schema, unknownKeyword: true }, 'contract-schema-compilation-failed']
    ]
    for (const [artifact, code] of cases) {
      const report = await runConfigurationContract({ ...options, ...upstream(artifact) })
      assert.deepEqual(report.diagnostics, [{ code }])
      assert.ok(!JSON.stringify(report).includes(sentinel))
      await assert.rejects(readFile(cacheFile(options)), { code: 'ENOENT' })
    }
  })

  it('reports safe JSON pointers and keywords without values or dynamic names', async () => {
    const options = await setup({
      connections: { [sentinel]: { settings: { clientSecret: sentinel, scopes: [sentinel, 42] } } }
    })
    const report = await runConfigurationContract({ ...options, ...upstream() })
    assert.equal(report.status, 'failed')
    assert.deepEqual(report.documents[0].diagnostics, [{
      code: 'configuration-schema-violation',
      instancePath: '/connections/*/settings/scopes/1',
      keyword: 'type'
    }])
    assert.ok(!JSON.stringify(report).includes(sentinel))
  })

  it('does not coerce values, inject defaults, remove properties, or follow input $schema URLs', async () => {
    const options = await setup({
      connections: { example: { settings: { enabled: 'true', [sentinel]: sentinel } } }
    })
    const remote = upstream()
    const report = await runConfigurationContract({ ...options, ...remote })
    assert.deepEqual(
      report.documents[0].diagnostics.map(diagnostic => diagnostic.keyword).sort(),
      ['additionalProperties', 'type']
    )
    assert.equal(remote.calls.length, 1)

    const requiredDefault = structuredClone(schema)
    requiredDefault.properties.connections.additionalProperties.properties.settings.required = ['enabled']
    const missing = await setup({ connections: { example: { settings: {} } } })
    const defaults = await runConfigurationContract({ ...missing, ...upstream(requiredDefault) })
    assert.equal(defaults.documents[0].diagnostics[0].keyword, 'required')

    const metadata = await setup({ connections: {}, $schema: `https://example.com/${sentinel}` })
    const withMetadata = { ...schema, additionalProperties: true }
    const metadataRemote = upstream(withMetadata)
    assert.equal(
      (await runConfigurationContract({ ...metadata, ...metadataRemote })).status,
      'passed'
    )
    assert.equal(metadataRemote.calls.length, 1)
  })

  it('retains failures for unreadable/malformed documents while checking remaining inputs', async () => {
    const options = await setup()
    await writeFile(path.join(options.repositoryRoot, 'invalid.json'), `{"${sentinel}":`)
    const report = await runConfigurationContract({
      ...options,
      ...upstream(),
      inputs: [
        { id: 'missing', file: 'missing.json' },
        { id: 'malformed', file: 'invalid.json' },
        ...options.inputs
      ]
    })
    assert.equal(report.status, 'failed')
    assert.deepEqual(report.documents.map(document => document.status), ['failed', 'failed', 'passed'])
    assert.equal(report.documents[0].diagnostics[0].code, 'configuration-read-failed')
    assert.equal(report.documents[1].diagnostics[0].code, 'configuration-json-invalid')
    assert.ok(!JSON.stringify(report).includes(sentinel))
    const empty = await runConfigurationContract({ ...options, ...upstream(), inputs: [] })
    assert.deepEqual(empty.diagnostics, [{ code: 'configuration-inputs-empty' }])
  })

  it('fails instead of bypassing unreadable caches or unwritable cache directories', async () => {
    const options = await setup()
    await mkdir(path.dirname(cacheFile(options)), { recursive: true })
    await mkdir(cacheFile(options))
    const unreadable = await runConfigurationContract({ ...options, ...upstream() })
    assert.equal(unreadable.status, 'failed')

    const blocked = await setup()
    await writeFile(path.join(blocked.repositoryRoot, 'node_modules'), 'not-a-directory')
    const report = await runConfigurationContract({ ...blocked, ...upstream() })
    assert.equal(report.status, 'failed')
    assert.equal(report.documents.length, 0)
  })

  it('returns a nonzero CLI exit and persists only safe diagnostics for invalid input', async () => {
    const options = await setup()
    const script = fileURLToPath(new URL('../configuration-contract.mjs', import.meta.url))
    for (const args of [
      ['--contract-ref', sentinel],
      ['--unexpected', sentinel]
    ]) {
      await assert.rejects(
        promisify(execFile)(process.execPath, [script, ...args], {
          env: { ...process.env, QUALITY_LOG_DIR: options.repositoryRoot }
        }),
        error => {
          assert.equal(error.code, 1)
          assert.ok(!`${error.stdout}${error.stderr}`.includes(sentinel))

          return true
        }
      )
      const report = JSON.parse(await readFile(
        path.join(options.repositoryRoot, 'configuration-contract.report.json'), 'utf8'
      ))
      assert.equal(report.status, 'failed')
      assert.ok(!JSON.stringify(report).includes(sentinel))
    }
  })
})
