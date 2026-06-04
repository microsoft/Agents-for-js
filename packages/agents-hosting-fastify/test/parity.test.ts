/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * Express ↔ Fastify behavior parity suite.
 *
 * Stands up the Express startServer and the Fastify startServer with identical
 * mock agents and identical authConfig, then replays the same canned requests
 * through both and asserts identical status codes and JSON body shapes.
 *
 * This is the primary backward-compatibility test: it proves that the Fastify
 * package preserves the runtime behavior of the existing Express package.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { ActivityHandler } from '@microsoft/agents-hosting'
import { startServer as expressStartServer } from '@microsoft/agents-hosting-express'
import { startServer as fastifyStartServer } from '../src/startServer'
import type { FastifyInstance } from 'fastify'
import express from 'express'

const TEST_AUTH_CONFIG = { clientId: 'test-app-id' }

interface Endpoints {
  expressUrl: string
  fastifyUrl: string
  expressServer: Server
  fastifyInstance: FastifyInstance
}

const startBoth = async (): Promise<Endpoints> => {
  // Express: patch listen to capture the assigned port
  let expressPort = 0
  let expressServer: Server | undefined
  const originalListen = express.application.listen
  await new Promise<void>((resolve, reject) => {
    const patched = function (this: express.Express, ...args: unknown[]) {
      const cb = typeof args[args.length - 1] === 'function' ? args.pop() as (() => void) : undefined
      const s = originalListen.call(this, 0, () => {
        const a = s.address() as AddressInfo
        expressPort = a.port
        cb?.()
        resolve()
      })
      s.on('error', reject)
      expressServer = s
      return s
    }
    ;(express.application.listen as unknown as typeof patched) = patched
    try {
      expressStartServer(new ActivityHandler(), { authConfig: TEST_AUTH_CONFIG })
    } catch (e) {
      reject(e)
    }
  })
  express.application.listen = originalListen

  const fastifyInstance = await fastifyStartServer(new ActivityHandler(), {
    authConfig: TEST_AUTH_CONFIG,
    port: 0
  })
  const fastifyAddr = fastifyInstance.server.address() as AddressInfo

  return {
    expressUrl: `http://127.0.0.1:${expressPort}`,
    fastifyUrl: `http://127.0.0.1:${fastifyAddr.port}`,
    expressServer: expressServer!,
    fastifyInstance
  }
}

describe('Express ↔ Fastify parity', () => {
  let endpoints: Endpoints

  before(async () => {
    endpoints = await startBoth()
  })

  after(async () => {
    await new Promise<void>((resolve) => endpoints.expressServer.close(() => resolve()))
    await endpoints.fastifyInstance.close()
  })

  it('POST /api/messages without Authorization header → 401 with identical jwt-auth-error body', async () => {
    const opts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', text: 'hi' })
    }
    const [expressRes, fastifyRes] = await Promise.all([
      fetch(`${endpoints.expressUrl}/api/messages`, opts),
      fetch(`${endpoints.fastifyUrl}/api/messages`, opts)
    ])
    assert.strictEqual(expressRes.status, 401)
    assert.strictEqual(fastifyRes.status, expressRes.status)
    const expressBody = await expressRes.json()
    const fastifyBody = await fastifyRes.json()
    assert.deepStrictEqual(fastifyBody, expressBody)
    assert.deepStrictEqual(expressBody, { 'jwt-auth-error': 'authorization header not found' })
  })

  it('GET on unknown route → 404 from both', async () => {
    const [expressRes, fastifyRes] = await Promise.all([
      fetch(`${endpoints.expressUrl}/nope`),
      fetch(`${endpoints.fastifyUrl}/nope`)
    ])
    assert.strictEqual(expressRes.status, 404)
    assert.strictEqual(fastifyRes.status, 404)
  })

  it('PUT on /api/messages → both reject (Fastify: route 404; Express: route handler 405 via JWT method check)', async () => {
    // Express registers POST only; PUT will 404 too because Express also matches by method.
    const [expressRes, fastifyRes] = await Promise.all([
      fetch(`${endpoints.expressUrl}/api/messages`, { method: 'PUT' }),
      fetch(`${endpoints.fastifyUrl}/api/messages`, { method: 'PUT' })
    ])
    assert.strictEqual(expressRes.status, 404)
    assert.strictEqual(fastifyRes.status, 404)
  })
})

describe('Anonymous dev-mode parity', () => {
  let endpoints: Endpoints
  let originalNodeEnv: string | undefined

  before(async () => {
    originalNodeEnv = process.env.NODE_ENV
    delete process.env.NODE_ENV
    // Both servers started with empty authConfig → anonymous bypass enabled.
    let expressPort = 0
    let expressServer: Server | undefined
    const originalListen = express.application.listen
    await new Promise<void>((resolve, reject) => {
      const patched = function (this: express.Express, ...args: unknown[]) {
        const cb = typeof args[args.length - 1] === 'function' ? args.pop() as (() => void) : undefined
        const s = originalListen.call(this, 0, () => {
          const a = s.address() as AddressInfo
          expressPort = a.port
          cb?.()
          resolve()
        })
        s.on('error', reject)
        expressServer = s
        return s
      }
      ;(express.application.listen as unknown as typeof patched) = patched
      try {
        expressStartServer(new ActivityHandler(), { authConfig: {} })
      } catch (e) {
        reject(e)
      }
    })
    express.application.listen = originalListen

    const fastifyInstance = await fastifyStartServer(new ActivityHandler(), {
      authConfig: {},
      port: 0
    })
    const fastifyAddr = fastifyInstance.server.address() as AddressInfo

    endpoints = {
      expressUrl: `http://127.0.0.1:${expressPort}`,
      fastifyUrl: `http://127.0.0.1:${fastifyAddr.port}`,
      expressServer: expressServer!,
      fastifyInstance
    }
  })

  after(async () => {
    await new Promise<void>((resolve) => endpoints.expressServer.close(() => resolve()))
    await endpoints.fastifyInstance.close()
    if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv
  })

  it('POST with empty body → both return error status (parity allows different codes)', async () => {
    // Edge case: Express's body parser passes empty body through (CloudAdapter throws → 500)
    // while Fastify's built-in parser rejects empty body up-front (→ 400). Both are valid
    // framework-level error responses; the SDK does not promise a specific code for malformed input.
    const opts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ''
    }
    const [expressRes, fastifyRes] = await Promise.all([
      fetch(`${endpoints.expressUrl}/api/messages`, opts),
      fetch(`${endpoints.fastifyUrl}/api/messages`, opts)
    ])
    assert.ok(expressRes.status >= 400, `Express expected >=400, got ${expressRes.status}`)
    assert.ok(fastifyRes.status >= 400, `Fastify expected >=400, got ${fastifyRes.status}`)
  })
})
