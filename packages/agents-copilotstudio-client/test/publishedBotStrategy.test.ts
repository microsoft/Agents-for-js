import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { PublishedBotStrategy } from '../src/strategies/publishedBotStrategy'

describe('PublishedBotStrategy', function () {
  it('should get conversation URL with encoded schema and conversation ID as URL path segments', function () {
    const schema = 'bot/name?with#reserved characters'
    const conversationId = 'conversation/id?with#reserved characters'
    const strategy = new PublishedBotStrategy({
      host: new URL('https://api.example.test'),
      schema
    })

    assert.equal(
      strategy.getConversationUrl(conversationId),
      `https://api.example.test/copilotstudio/dataverse-backed/authenticated/bots/${encodeURIComponent(schema)}/conversations/${encodeURIComponent(conversationId)}?api-version=2022-03-01-preview`
    )
  })
})
