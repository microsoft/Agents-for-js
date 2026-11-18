// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { once } from 'node:events'
import { type AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import express from 'express'
import jwt from 'jsonwebtoken'
import sinon from 'sinon'
import { clearJwksClients } from '@microsoft/agents-hosting'
import { getJwksClient } from '../../agents-hosting/dist/src/auth/jwt-middleware.js'
import {
  createRunnerAuthentication,
  validateRunnerIdentity
} from '../src/authentication'

const clientId = '11111111-1111-1111-1111-111111111111'
const tenantId = '22222222-2222-2222-2222-222222222222'
const tenantIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`
const extraIssuer = 'https://login.microsoftonline.com/33333333-3333-3333-3333-333333333333/v2.0'
const botIssuer = 'https://api.botframework.com'

describe('runner identity', () => {
  for (const settings of [
    {},
    { clientId },
    { clientId: 'invalid', tenantId },
    { clientId, tenantId: 'common' }
  ]) {
    it(`requires concrete client and tenant GUIDs: ${JSON.stringify(settings)}`, () => {
      assert.throws(() => validateRunnerIdentity(settings, []))
    })
  }

  it('rejects insecure additional issuers', () => {
    assert.throws(() => validateRunnerIdentity({ clientId, tenantId }, ['http://issuer.example']))
  })
})

describe('runner HTTP authentication', { timeout: 10000 }, () => {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  let baseUrl: string
  let close: () => Promise<void>
  let dispatches = 0

  before(async () => {
    clearJwksClients()
    const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    for (const uri of [
      'https://login.botframework.com/v1/.well-known/keys',
      `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
    ]) {
      sinon.stub(getJwksClient(uri), 'getSigningKey').callsFake((_kid, callback) => {
        callback(null, { getPublicKey: () => publicKey, kid: 'test-key' })
      })
    }

    const app = express()
    app.post('/api/messages', createRunnerAuthentication(
      { clientId, tenantId },
      [extraIssuer]
    ), (_req, res) => {
      dispatches++
      res.sendStatus(202)
    })
    const server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
    close = async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
      })
    }
  })

  after(async () => {
    await close?.()
    sinon.restore()
    clearJwksClients()
  })

  function sign (issuer: string, claims: jwt.JwtPayload = {}, signingKey = key.privateKey): string {
    return jwt.sign({
      iss: issuer,
      aud: clientId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims
    }, signingKey, { algorithm: 'RS256', keyid: 'test-key' })
  }

  async function send (token?: string): Promise<Response> {
    return await fetch(`${baseUrl}/api/messages`, {
      method: 'POST',
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` }
    })
  }

  it('dispatches signed Bot Service, tenant v1/v2 and explicit additional issuer tokens concurrently', async () => {
    const responses = await Promise.all([
      botIssuer, tenantIssuer, `https://sts.windows.net/${tenantId}/`, extraIssuer
    ].map(async issuer => await send(sign(issuer))))
    assert.deepEqual(responses.map(response => response.status), [202, 202, 202, 202])
  })

  it('rejects missing, malformed, unsigned, expired and untrusted tokens before dispatch', async () => {
    const beforeDispatches = dispatches
    const noExpiry = jwt.sign({ iss: tenantIssuer, aud: clientId }, key.privateKey, {
      algorithm: 'RS256', keyid: 'test-key'
    })
    const tokens = [
      undefined,
      'not-a-token',
      'bm90LWpzb24.e30.c2ln',
      'eyJhbGciOiJSUzI1NiJ9.bm90LWpzb24.c2ln',
      jwt.sign({ iss: tenantIssuer, aud: clientId }, '', { algorithm: 'none' }),
      sign(tenantIssuer, { aud: 'wrong-audience' }),
      sign('https://login.microsoftonline.com/44444444-4444-4444-4444-444444444444/v2.0'),
      sign('https://login.microsoftonline.com/d6d49420-f39b-4df7-a1dc-d59a935871db/v2.0'),
      sign(tenantIssuer, { exp: Math.floor(Date.now() / 1000) - 3600 }),
      sign(tenantIssuer, {}, otherKey.privateKey),
      noExpiry
    ]
    for (const token of tokens) {
      assert.equal((await send(token)).status, 401, token)
    }
    assert.equal(dispatches, beforeDispatches)
  })
})
