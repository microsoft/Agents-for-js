import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import {
  ConnectionSettings,
  getCopilotStudioConnectionUrl,
  getCopilotStudioSubscribeUrl,
  getTokenAudience,
  PowerPlatformCloud
} from '../src'

describe('powerPlatformEnvironment', function () {
  const directConnectUrl = 'https://api.example.test/copilotstudio/bots/test-bot'
  const conversationId = 'conversation/id?with#reserved characters'

  it('should create a direct connection URL with an encoded conversation ID path segment', function () {
    const settings: ConnectionSettings = { directConnectUrl }

    assert.equal(
      getCopilotStudioConnectionUrl(settings, conversationId),
      `https://api.example.test/copilotstudio/bots/test-bot/conversations/${encodeURIComponent(conversationId)}?api-version=2022-03-01-preview`
    )
  })

  it('should create a subscribe URL for a direct connection', function () {
    const settings: ConnectionSettings = { directConnectUrl }

    assert.equal(
      getCopilotStudioSubscribeUrl(settings, conversationId),
      `https://api.example.test/copilotstudio/bots/test-bot/conversations/${encodeURIComponent(conversationId)}/subscribe?api-version=2022-03-01-preview`
    )
  })

  it('should get the token audience from a direct connection URL', function () {
    assert.equal(
      getTokenAudience(undefined, PowerPlatformCloud.Unknown, '', 'https://api.powerplatform.com/copilotstudio/bots/test-bot'),
      'https://api.powerplatform.com/.default'
    )
  })
})
