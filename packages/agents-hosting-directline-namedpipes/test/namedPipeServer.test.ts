// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { NamedPipeService } from '../src/namedPipeServer.js'
import { CloudAdapter } from '@microsoft/agents-hosting'

const windowsOnly = process.platform === 'win32' ? undefined : 'Named pipe hosting is Windows-only'

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

  it('start() throws PipePlatformNotSupported on non-Windows platforms', async (context) => {
    if (process.platform === 'win32') {
      context.skip('Test asserts non-Windows behavior')
      return
    }
    const adapter = new CloudAdapter()
    const service = new NamedPipeService(adapter, async () => {}, { pipeName: `platform-${process.pid}-${Date.now()}` })
    await assert.rejects(async () => await service.start(), /Named pipe hosting is only supported on Windows/)
  })

  it('rejects ready promise grabbed before start() when platform check fails', async (context) => {
    if (process.platform === 'win32') {
      context.skip('Test asserts non-Windows behavior')
      return
    }
    const adapter = new CloudAdapter()
    const service = new NamedPipeService(adapter, async () => {}, { pipeName: `ready-platform-${process.pid}-${Date.now()}` })
    // Grab the promise BEFORE calling start() — this is the regression case where
    // the constructor's ready promise must be rejected (not orphaned by being
    // replaced with a fresh promise before rejection).
    const heldReady = service.ready
    await assert.rejects(async () => await service.start(), /Named pipe hosting is only supported on Windows/)
    await assert.rejects(async () => await heldReady, /Named pipe hosting is only supported on Windows/)
  })

  it('should reject ready when stopped before connecting', { skip: windowsOnly }, async () => {
    const adapter = new CloudAdapter()
    const service = new NamedPipeService(adapter, async () => {}, { pipeName: `stop-test-${process.pid}-${Date.now()}` })
    const startPromise = service.start()
    const ready = service.ready

    await new Promise(resolve => setTimeout(resolve, 20))
    await service.stop()

    await assert.rejects(async () => await ready, /Named pipe server stopped before connecting/)
    await startPromise
  })
})
