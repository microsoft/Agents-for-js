/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import express from 'express'
import { randomUUID } from 'node:crypto'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface CapturedActivity {
  text?: string
  type?: string
}

const tenantId = requireEnv('TENANT_ID')
const humanClientId = requireEnv('HUMAN_CLIENT_ID')
const humanClientSecret = requireEnv('HUMAN_CLIENT_SECRET')
const catClientId = requireEnv('CAT_CLIENT_ID')
const catClientSecret = requireEnv('CAT_CLIENT_SECRET')
const humanEndpoint = process.env.HUMAN_ENDPOINT ?? 'http://localhost:3978/api/messages'
const channelPort = Number(process.env.MOCK_CHANNEL_PORT ?? 3980)
const channelServiceUrl = `http://localhost:${channelPort}`
const conversationId = `a2a-agent-${randomUUID()}`
const captured: CapturedActivity[] = []

const channel = express()
channel.use(express.json())

const captureActivity = (body: CapturedActivity, res: express.Response) => {
  captured.push(body)
  console.log(`Mock channel received: ${body.text ?? body.type ?? 'activity'}`)
  res.status(200).send({ id: randomUUID() })
}

channel.post('/v3/conversations/:conversationId/activities', (req, res) => captureActivity(req.body, res))
channel.post('/v3/conversations/:conversationId/activities/:activityId', (req, res) => captureActivity(req.body, res))

const server = channel.listen(channelPort, async () => {
  try {
    console.log(`Mock channel listening on ${channelServiceUrl}`)
    const activity = {
      type: 'message',
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      serviceUrl: channelServiceUrl,
      channelId: 'a2a-agent',
      from: { id: 'smoke-user', name: 'Smoke Tester' },
      recipient: { id: humanClientId, name: "I'll Ask My Cat" },
      conversation: { id: conversationId },
      text: "I'll ask my cat: what is the secret to a good afternoon?"
    }

    const missingAuth = await postActivity(activity)
    assertStatus(missingAuth, 401, 'missing Authorization header')

    const wrongAudienceToken = await getAppToken(catClientId, humanClientId, humanClientSecret)
    const wrongAudience = await postActivity(activity, wrongAudienceToken)
    assertStatus(wrongAudience, 401, 'token with the Wise Cat audience')

    const validToken = await getAppToken(humanClientId, catClientId, catClientSecret)
    const accepted = await postActivity(activity, validToken)
    if (!accepted.ok) {
      throw new Error(`Human agent rejected the valid request: ${accepted.status} ${await accepted.text()}`)
    }

    await waitForWiseCat()
    console.log('A2A cat smoke test passed: invalid auth was rejected and the authenticated delegated response returned.')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    server.close()
  }
})

async function getAppToken (audience: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: `${audience}/.default`
  })
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  const token = await response.json() as TokenResponse
  if (!response.ok || !token.access_token) {
    throw new Error(`Token request failed for audience ${audience}: ${token.error_description ?? token.error ?? response.statusText}`)
  }
  return token.access_token
}

async function postActivity (activity: object, token?: string): Promise<Response> {
  return await fetch(humanEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: ['Bear', 'er ', token].join('') } : {})
    },
    body: JSON.stringify(activity)
  })
}

function assertStatus (response: Response, expected: number, scenario: string): void {
  if (response.status !== expected) {
    throw new Error(`Expected ${expected} for ${scenario}, received ${response.status}`)
  }
  console.log(`Auth check passed: ${scenario} returned ${expected}.`)
}

async function waitForWiseCat (): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (captured.some((activity) => activity.text?.startsWith('Wise Cat:'))) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for the Wise Cat response. Captured: ${JSON.stringify(captured)}`)
}

function requireEnv (name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`)
  }
  return value
}
