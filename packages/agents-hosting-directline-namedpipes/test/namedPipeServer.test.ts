// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { NamedPipeService } from '../src/namedPipeServer.js'
import { CloudAdapter } from '@microsoft/agents-hosting'
import { writeFile, unlink } from 'node:fs/promises'
import { getPipePath } from '../src/transport/namedPipeConnection.js'

describe('NamedPipeService', () => {
  it('should construct with default options', () => {
    const adapter = new CloudAdapter()
    const service = new NamedPipeService(adapter, async () => {})
    assert.strictEqual(service.isConnected, false)
  })

  it('should construct with custom pipe name', () => {
    const adapter = new CloudAdapter()
    const service = new NamedPipeService(adapter, async () => {}, { pipeName: 'custom.pipes' })
    assert.strictEqual(service.isConnected, false)
  })

  it('should reject invalid pipe names during construction', () => {
    const adapter = new CloudAdapter()
    assert.throws(
      () => new NamedPipeService(adapter, async () => {}, { pipeName: '../escape' }),
      /Invalid named pipe name/
    )
  })

  it('should expose messageHandler', () => {
    const adapter = new CloudAdapter()
    const service = new NamedPipeService(adapter, async () => {})
    assert.ok(service.messageHandler)
    assert.strictEqual(service.messageHandler.shouldHandle('urn:botframework:namedpipe:api/messages'), true)
    assert.strictEqual(service.messageHandler.shouldHandle('https://example.com'), false)
  })

  it('should reject ready when stopped before connecting', async () => {
    const adapter = new CloudAdapter()
    const service = new NamedPipeService(adapter, async () => {}, { pipeName: `stop-test-${process.pid}-${Date.now()}` })
    const startPromise = service.start()
    const ready = service.ready

    await new Promise(resolve => setTimeout(resolve, 20))
    await service.stop()

    await assert.rejects(async () => await ready, /Named pipe server stopped before connecting/)
    await startPromise
  })

  it('should reject ready on terminal startup failure', async (context) => {
    if (process.platform === 'win32') {
      context.skip('Unix socket path hardening does not apply on Windows')
      return
    }

    const pipeName = `startup-fail-${process.pid}-${Date.now()}`
    const path = getPipePath(`${pipeName}.incoming`)
    await writeFile(path, 'not a socket')
    try {
      const adapter = new CloudAdapter()
      const service = new NamedPipeService(adapter, async () => {}, { pipeName, autoReconnect: false })
      const startPromise = service.start()

      await assert.rejects(async () => await service.ready, /Named pipe socket path is unsafe/)
      await startPromise
    } finally {
      await unlink(path).catch(() => {})
    }
  })
})
