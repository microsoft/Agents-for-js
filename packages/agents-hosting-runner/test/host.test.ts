// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import jwt from 'jsonwebtoken'
import sinon from 'sinon'
import { clearJwksClients } from '@microsoft/agents-hosting'
import { getJwksClient } from '../../agents-hosting/dist/src/auth/jwt-middleware.js'
import { startAgentRunner } from '../src/runner'

it('hosts the imported application with its own adapter, middleware and header propagation', {
  timeout: 10000
}, async t => {
  const directory = await mkdtemp(fileURLToPath(new URL('host-fixture-', import.meta.url)))
  t.after(async () => await rm(directory, { recursive: true, force: true }))
  const clientId = '11111111-1111-1111-1111-111111111111'
  const tenantId = '22222222-2222-2222-2222-222222222222'
  await writeFile(join(directory, 'appsettings.json'), JSON.stringify({
    Connections: {
      ServiceConnection: { Settings: { ClientId: clientId, TenantId: tenantId, ClientSecret: 'test-secret' } }
    }
  }))
  const sdk = pathToFileURL(fileURLToPath(
    new URL('../../agents-hosting/dist/src/index.js', import.meta.url)
  )).href
  await writeFile(join(directory, 'agent.mjs'), `
    import { AgentApplication, CloudAdapter } from ${JSON.stringify(sdk)}
    export const adapter = new CloudAdapter()
    let middlewareRan = false
    adapter.use({
      onTurn: async (context, next) => {
        middlewareRan = true
        await next()
      }
    })
    let headerValue
    export const agent = new AgentApplication({
      adapter,
      headerPropagation: headers => {
        headerValue = headers.incoming['x-runner-test']
      }
    })
    agent.onActivity('message', async context => {
      await context.sendActivity(middlewareRan ? headerValue : 'missing middleware')
    })
  `)

  const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicKey = key.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  clearJwksClients()
  const stub = sinon.stub(getJwksClient(
    `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
  ), 'getSigningKey').callsFake((_kid, callback) => {
    callback(null, { getPublicKey: () => publicKey, kid: 'test-key' })
  })
  t.after(() => {
    stub.restore()
    clearJwksClients()
  })
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const address = reservation.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const server = await startAgentRunner({ agentModulePath: join(directory, 'agent.mjs'), port })
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  })
  assert.deepEqual(server.address(), { address: '127.0.0.1', family: 'IPv4', port })
  const token = jwt.sign({
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    aud: clientId
  }, key.privateKey, { algorithm: 'RS256', keyid: 'test-key', expiresIn: '1h' })
  const response = await fetch(`http://127.0.0.1:${port}/api/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-runner-test': 'adapter and middleware preserved'
    },
    body: JSON.stringify({
      type: 'message',
      channelId: 'emulator',
      from: { id: 'user' },
      recipient: { id: 'agent' },
      conversation: { id: 'conversation' },
      deliveryMode: 'expectReplies',
      text: 'hello'
    })
  })
  assert.equal(response.status, 200, await response.clone().text())
  const body = await response.json()
  assert.equal(body.activities[0].text, 'adapter and middleware preserved')
})
