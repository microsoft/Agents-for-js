// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import { TurnContext } from '@microsoft/agents-hosting'
import { Client as TeamsClient } from '@microsoft/teams.api'
import { setTeamsApiClient, TeamsClientKey } from '../../src/teamsApiClientExtensions'

function createContext (serviceUrl: string | undefined, connectorBaseUrl: string = 'https://connector.example.com'): TurnContext {
  const adapter = {
    ConnectorClientKey: Symbol('ConnectorClient'),
    async sendActivities (_context: TurnContext, activities: Activity[]) {
      return activities.map((_activity, index) => ({ id: `activity-${index}` }))
    }
  } as any
  const context = new TurnContext(
    adapter,
    Activity.fromObject({
      type: 'message',
      channelId: 'msteams',
      serviceUrl,
      conversation: { id: 'conversation-id' },
      recipient: { id: 'bot' },
      from: { id: 'user' }
    }),
    {}
  )

  context.turnState.set(adapter.ConnectorClientKey, {
    httpClient: {
      baseURL: connectorBaseUrl,
      defaultHeaders: {
        Authorization: 'Bearer connector-token',
        'Content-Type': 'application/json',
        'User-Agent': 'agents-test/1.0'
      }
    }
  })

  return context
}

function getClientHeaders (client: TeamsClient): Record<string, string> {
  return (client as any).http.options.headers
}

describe('Teams API client boundary', () => {
  it('should use the activity service URL and propagate connector headers to the Teams client', () => {
    const context = createContext('https://activity.example.com')

    setTeamsApiClient(context)

    const client = context.turnState.get<TeamsClient>(TeamsClientKey)
    assert.ok(client)
    assert.strictEqual(client.serviceUrl, 'https://activity.example.com')
    assert.deepStrictEqual(getClientHeaders(client), {
      Authorization: 'Bearer connector-token',
      'Content-Type': 'application/json',
      'User-Agent': 'agents-test/1.0'
    })
  })

  it('should fall back to the connector base URL and snapshot headers once per turn', () => {
    const context = createContext(undefined)
    const connectorClient = context.turnState.get<any>(context.adapter.ConnectorClientKey)

    setTeamsApiClient(context)
    const client = context.turnState.get<TeamsClient>(TeamsClientKey)
    assert.ok(client)
    connectorClient.httpClient.defaultHeaders.Authorization = 'Bearer changed-token'
    setTeamsApiClient(context)

    assert.strictEqual(client.serviceUrl, 'https://connector.example.com')
    assert.strictEqual(getClientHeaders(client).Authorization, 'Bearer connector-token')
    assert.strictEqual(context.turnState.get<TeamsClient>(TeamsClientKey), client)
  })
})
