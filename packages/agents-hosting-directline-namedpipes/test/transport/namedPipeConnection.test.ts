// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { once } from 'node:events'
import { writeFile, unlink, lstat } from 'node:fs/promises'
import { connect, type Socket } from 'node:net'
import { getPipePath, NamedPipeConnection, validatePipeName } from '../../src/transport/namedPipeConnection.js'

async function delay (ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForSocketPath (path: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const stat = await lstat(path)
      if (stat.isSocket()) return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    await delay(10)
  }
  throw new Error(`Timed out waiting for socket path ${path}`)
}

async function connectToSocket (path: string): Promise<Socket> {
  const socket = connect(path)
  await once(socket, 'connect')
  return socket
}

describe('NamedPipeConnection', () => {
  describe('getPipePath', () => {
    it('should return platform-appropriate path', () => {
      const path = getPipePath('test.pipes')
      if (process.platform === 'win32') {
        assert.strictEqual(path, '\\\\.\\pipe\\test.pipes')
      } else {
        assert.strictEqual(path, '/tmp/CoreFxPipe_test.pipes')
      }
    })

    it('should handle default pipe name', () => {
      const path = getPipePath('bfv4.pipes')
      if (process.platform === 'win32') {
        assert.strictEqual(path, '\\\\.\\pipe\\bfv4.pipes')
      } else {
        assert.strictEqual(path, '/tmp/CoreFxPipe_bfv4.pipes')
      }
    })

    it('should reject unsafe path components', () => {
      for (const name of ['', '..', '../escape', 'escape/name', 'escape\\name', ' pipe', 'pipe ', 'pipe$name']) {
        assert.throws(() => getPipePath(name), /Invalid named pipe name/)
      }
    })
  })

  describe('validatePipeName', () => {
    it('should accept documented pipe name characters', () => {
      assert.doesNotThrow(() => validatePipeName('bfv4.pipes'))
      assert.doesNotThrow(() => validatePipeName('my-custom_pipe.1'))
    })

    it('should reject unsafe public pipe names', () => {
      const tooLong = 'a'.repeat(79)
      for (const name of ['', '..', '../escape', 'escape/name', 'escape\\name', ' pipe', 'pipe ', 'pipe$name', tooLong]) {
        assert.throws(() => validatePipeName(name), /Invalid named pipe name/)
      }
    })
  })

  describe('waitForConnection', () => {
    it('should reject Unix paths that already exist as non-sockets', async (context) => {
      if (process.platform === 'win32') {
        context.skip('Unix socket path hardening does not apply on Windows')
        return
      }

      const pipeName = `agents-test-${process.pid}-${Date.now()}`
      const path = getPipePath(`${pipeName}.incoming`)
      await writeFile(path, 'not a socket')
      try {
        const connection = new NamedPipeConnection(pipeName)
        await assert.rejects(
          async () => await connection.waitForConnection(AbortSignal.timeout(100)),
          /Named pipe socket path is unsafe/
        )
      } finally {
        await unlink(path).catch(() => {})
      }
    })

    it('should create Unix socket paths with owner-only permissions', async (context) => {
      if (process.platform === 'win32') {
        context.skip('Unix socket path hardening does not apply on Windows')
        return
      }

      const pipeName = `agents-test-${process.pid}-${Date.now()}`
      const incomingPath = getPipePath(`${pipeName}.incoming`)
      const outgoingPath = getPipePath(`${pipeName}.outgoing`)
      const connection = new NamedPipeConnection(pipeName)
      const waitPromise = connection.waitForConnection(AbortSignal.timeout(2000))
      let incomingSocket: Socket | null = null
      let outgoingSocket: Socket | null = null

      try {
        await waitForSocketPath(incomingPath)
        const incomingStat = await lstat(incomingPath)
        assert.strictEqual(incomingStat.mode & 0o777, 0o600)

        incomingSocket = await connectToSocket(incomingPath)
        await waitForSocketPath(outgoingPath)
        const outgoingStat = await lstat(outgoingPath)
        assert.strictEqual(outgoingStat.mode & 0o777, 0o600)

        outgoingSocket = await connectToSocket(outgoingPath)
        await waitPromise
      } finally {
        incomingSocket?.destroy()
        outgoingSocket?.destroy()
        await connection.dispose()
        await waitPromise.catch(() => {})
        await unlink(incomingPath).catch(() => {})
        await unlink(outgoingPath).catch(() => {})
      }
    })
  })
})
