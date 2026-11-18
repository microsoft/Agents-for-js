// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixtureRoot = fileURLToPath(new URL('.', import.meta.url))
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const sdk = pathToFileURL(fileURLToPath(
  new URL('../../agents-hosting/dist/src/index.js', import.meta.url)
)).href
const clientId = '11111111-1111-1111-1111-111111111111'
const tenantId = '22222222-2222-2222-2222-222222222222'

function run (args: string[], env: NodeJS.ProcessEnv = process.env) {
  const child = spawn(process.execPath, ['--import', 'tsx', cli, ...args], {
    env: { ...env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', chunk => {
    output += chunk
  })
  child.stderr.on('data', chunk => {
    output += chunk
  })
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  return { child, exited, output: () => output }
}

async function unusedPort (): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

describe('runner CLI and module startup', { timeout: 30000 }, () => {
  let directory: string
  const children: ChildProcess[] = []

  before(async () => {
    directory = await mkdtemp(join(fixtureRoot, 'runner fixture '))
    await writeFile(join(directory, 'appsettings.json'), JSON.stringify({
      Connections: {
        ServiceConnection: { Settings: { ClientId: clientId, TenantId: tenantId } }
      }
    }))
  })

  after(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }
    }
    await rm(directory, { recursive: true, force: true })
  })

  it('prints help and version without loading an agent', async () => {
    for (const option of ['--help', '-h', '--version']) {
      const result = run([option], {
        ...process.env,
        Connections__ServiceConnection__Settings__ValidateIssuer: 'invalid-boolean'
      })
      assert.equal(await result.exited, 0, result.output())
      assert.match(result.output(), option === '--version' ? /\d+\.\d+\.\d+/ : /--agent-module/)
    }
  })

  it('rejects invalid runner configuration before importing customer code', async () => {
    const invalidDirectory = join(directory, 'invalid configuration')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(invalidDirectory)
    await writeFile(join(invalidDirectory, 'agent.mjs'), 'console.log("AGENT_IMPORTED"); export const agent = {}')
    for (const settings of [
      '{invalid-json',
      JSON.stringify({
        Connections: {
          ServiceConnection: { Settings: { ClientId: clientId, TenantId: 'common' } }
        }
      }),
      JSON.stringify({
        Connections: {
          ServiceConnection: { Settings: { ClientId: clientId, TenantId: tenantId } }
        },
        AgentRunner: { Authentication: { AdditionalEntraIssuers: ['http://insecure.example'] } }
      })
    ]) {
      await writeFile(join(invalidDirectory, 'appsettings.json'), settings)
      const result = run(['--port', '3978', '--agent-module', join(invalidDirectory, 'agent.mjs')])
      assert.equal(await result.exited, 1, result.output())
      assert.doesNotMatch(result.output(), /AGENT_IMPORTED/)
    }
  })

  it('reports invalid arguments and missing or invalid agent exports', async () => {
    const invalid = run(['--port', '0', '--agent-module', 'unused.js'])
    assert.equal(await invalid.exited, 1)
    assert.match(invalid.output(), /port/)

    await writeFile(join(directory, 'invalid.mjs'), 'export const agent = {}')
    for (const file of ['missing.mjs', 'invalid.mjs']) {
      const result = run(['--port', '3978', '--agent-module', join(directory, file)])
      assert.equal(await result.exited, 1)
      assert.match(result.output(), file === 'missing.mjs' ? /Unable to load agent module/ : /must export a named agent/)
    }
  })

  it('loads settings before import, honors environment overrides, and requires authentication even in development', async () => {
    await writeFile(join(directory, 'appsettings.json'), JSON.stringify({
      Connections: {
        ServiceConnection: { Settings: { ClientId: clientId, TenantId: tenantId } }
      }
    }))
    await writeFile(join(directory, 'dependency.mjs'), 'export const marker = "private dependency reached"')
    await writeFile(join(directory, 'agent.mjs'), `
      import assert from 'node:assert/strict'
      import { AgentApplication, loadAuthConfigFromEnv } from ${JSON.stringify(sdk)}
      import { marker } from './dependency.mjs'
      const settings = loadAuthConfigFromEnv('ServiceConnection')
      assert.equal(settings.clientId, ${JSON.stringify(clientId)})
      assert.equal(settings.tenantId, '33333333-3333-3333-3333-333333333333')
      export const agent = new AgentApplication()
      console.log(marker)
    `)
    const port = await unusedPort()
    const result = run(['--port', String(port), '--agent-module', join(directory, 'agent.mjs')], {
      ...process.env,
      Connections__ServiceConnection__Settings__TenantId: '33333333-3333-3333-3333-333333333333'
    })
    children.push(result.child)
    let response: Response | undefined
    for (let attempt = 0; attempt < 100; attempt++) {
      if (result.child.exitCode !== null) {
        assert.fail(result.output())
      }
      try {
        response = await fetch(`http://127.0.0.1:${port}/api/messages`, { method: 'POST' })
        break
      } catch {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    assert.equal(response?.status, 401, result.output())
    assert.match(result.output(), /private dependency reached/)
    assert.match(result.output(), /127\.0\.0\.1/)
    result.child.kill('SIGTERM')
    const exitCode = await result.exited
    if (process.platform !== 'win32') {
      assert.equal(exitCode, 0, result.output())
    }
  })
})
