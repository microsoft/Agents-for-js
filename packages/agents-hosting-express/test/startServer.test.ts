/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'assert'
import { createServer, type Server } from 'node:http'
import express, { type Express, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { ActivityHandler, authorizeJWT } from '@microsoft/agents-hosting'
import { startServer, StartServerOptions } from '../src/startServer'

// Using a clientId ensures JWT is enforced (non-empty clientId prevents anonymous fallback)
const TEST_AUTH_CONFIG = { clientId: 'test-app-id' }
describe('startServer', () => {
  let server: Server
  let port: number
  let beforeListenCalled = false
  const originalListen = express.application.listen
  before(() => new Promise<void>((resolve, reject) => {
    const patchedListen = function (this: Express, ...args: unknown[]) {
      const callback = typeof args[args.length - 1] === 'function'
        ? args.pop() as (() => void)
        : undefined
      const listeningServer = originalListen.call(this, 0, () => {
        const addr = listeningServer.address()
        if (addr && typeof addr === 'object') {
          port = addr.port
          callback?.()
          resolve()
        } else {
          reject(new Error('Failed to get server address'))
        }
      })
      listeningServer.on('error', reject)
      server = listeningServer
      return listeningServer
    }
    ;(express.application.listen as unknown as typeof patchedListen) = patchedListen
    try {
      startServer(new ActivityHandler(), {
        authConfig: TEST_AUTH_CONFIG,
        routePath: '/custom/messages',
        beforeListen: (app: Express) => {
          beforeListenCalled = true
          app.get('/health', (_req, res) => {
            res.status(200).json({ status: 'ok' })
          })
        }
      } as StartServerOptions)
    } catch (error) {
      reject(error)
    }
  }))
  after(() => new Promise<void>((resolve, reject) => {
    express.application.listen = originalListen
    if (!server) {
      resolve()
      return
    }
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  }))
  it('should invoke beforeListen and not require JWT for custom routes', async () => {
    assert.strictEqual(beforeListenCalled, true)
    const res = await fetch(`http://localhost:${port}/health`)
    assert.strictEqual(res.status, 200)
    const body = await res.json() as { status: string }
    assert.strictEqual(body.status, 'ok')
  })
  it('should honor routePath and require JWT for the configured messages route', async () => {
    const protectedRes = await fetch(`http://localhost:${port}/custom/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', text: 'hello' })
    })
    assert.strictEqual(protectedRes.status, 401)
    const defaultRouteRes = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', text: 'hello' })
    })
    assert.strictEqual(defaultRouteRes.status, 404)
  })
})

describe('StartServerOptions', () => {
  describe('custom routePath', () => {
    let server: Server
    let port: number

    before(() => new Promise<void>((resolve, reject) => {
      const app = express()
      app.use(express.json())

      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100
      })

      // Simulate startServer with a custom routePath
      app.post('/bot/messages', limiter, authorizeJWT(TEST_AUTH_CONFIG), (_req: Request, res: Response) => {
        res.status(200).send('ok')
      })

      server = createServer(app)
      server.listen(0, () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          port = addr.port
          resolve()
        } else {
          reject(new Error('Failed to get server address'))
        }
      })
      server.on('error', reject)
    }))

    after(() => new Promise<void>((resolve) => server.close(() => resolve())))

    it('should mount the agent on the custom route path', async () => {
      const res = await fetch(`http://localhost:${port}/bot/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'message', text: 'hello' })
      })
      // 401 means the route matched and JWT middleware was applied
      assert.strictEqual(res.status, 401)
    })

    it('should not respond on the default /api/messages path', async () => {
      const res = await fetch(`http://localhost:${port}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'message', text: 'hello' })
      })
      assert.strictEqual(res.status, 404)
    })
  })

  describe('beforeListen hook', () => {
    let server: Server
    let port: number

    before(() => new Promise<void>((resolve, reject) => {
      const app = express()
      app.use(express.json())

      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100
      })

      app.post('/api/messages', limiter, authorizeJWT(TEST_AUTH_CONFIG), (_req: Request, res: Response) => {
        res.status(200).send('ok')
      })

      // Simulate beforeListen adding a custom route
      app.get('/health', (_req: Request, res: Response) => {
        res.status(200).json({ status: 'healthy' })
      })

      server = createServer(app)
      server.listen(0, () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          port = addr.port
          resolve()
        } else {
          reject(new Error('Failed to get server address'))
        }
      })
      server.on('error', reject)
    }))

    after(() => new Promise<void>((resolve) => server.close(() => resolve())))

    it('should make routes added via beforeListen accessible without JWT', async () => {
      const res = await fetch(`http://localhost:${port}/health`)
      assert.strictEqual(res.status, 200)
      const body = await res.json() as { status: string }
      assert.strictEqual(body.status, 'healthy')
    })
  })

  describe('port handling', () => {
    it('should pass non-numeric string listen target unchanged', () => {
      const target = '\\\\.\\pipe\\agents-hosting-express-test'
      let capturedListenTarget: string | number | undefined

      const originalListen = express.application.listen
      ;(express.application as any).listen = function (listenTarget: string | number) {
        capturedListenTarget = listenTarget
        return {
          on: function () {
            return this
          }
        }
      }

      try {
        startServer(new ActivityHandler(), {
          port: target,
          authConfig: { clientId: 'test-app-id' }
        })

        assert.strictEqual(capturedListenTarget, target)
      } finally {
        ;(express.application as any).listen = originalListen
      }
    })
  })
})
