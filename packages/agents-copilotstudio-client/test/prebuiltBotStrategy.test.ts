import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { PrebuiltBotStrategy } from '../src/strategies/prebuiltBotStrategy'

describe('PrebuiltBotStrategy', function () {
  it('should get conversation URL with encoded schema and conversation ID as path segments', function () {
    const schema = 'bot/name?with#reserved characters'
    const conversationId = 'conversation/id?with#reserved characters'
    const strategy = new PrebuiltBotStrategy({
      host: new URL('https://api.example.test'),
      schema
    })

    assert.equal(
      strategy.getConversationUrl(conversationId),
      `https://api.example.test/copilotstudio/prebuilt/authenticated/bots/${encodeURIComponent(schema)}/conversations/${encodeURIComponent(conversationId)}?api-version=2022-03-01-preview`
    )
  })
})
