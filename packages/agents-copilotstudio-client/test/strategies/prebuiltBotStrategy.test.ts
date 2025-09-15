import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import { PrebuiltBotStrategy, type PrebuiltBotStrategySettings } from '../../src/strategies/prebuiltBotStrategy'

describe('PrebuiltBotStrategy', function () {
  const testHost = new URL('https://test.powerplatform.com')
  const testIdentifier = 'test-bot-identifier'

  describe('constructor', function () {
    it('should create instance with valid settings', function () {
      const settings: PrebuiltBotStrategySettings = {
        host: testHost,
        identifier: testIdentifier
      }

      const strategy = new PrebuiltBotStrategy(settings)
      assert(strategy instanceof PrebuiltBotStrategy)
    })

    it('should construct correct base URL with identifier', function () {
      const settings: PrebuiltBotStrategySettings = {
        host: testHost,
        identifier: testIdentifier
      }

      const strategy = new PrebuiltBotStrategy(settings)
      const conversationUrl = strategy.getConversationUrl()

      assert(conversationUrl.includes('/copilotstudio/prebuilt/authenticated/bots/'))
      assert(conversationUrl.includes(testIdentifier))
      assert(conversationUrl.includes('api-version=2022-03-01-preview'))
    })

    it('should handle different host URLs', function () {
      const hosts = [
        new URL('https://api.powerplatform.com'),
        new URL('https://api.preprod.powerplatform.com'),
        new URL('https://custom.domain.com'),
        new URL('https://localhost:8080')
      ]

      hosts.forEach(host => {
        const settings: PrebuiltBotStrategySettings = {
          host,
          identifier: testIdentifier
        }

        const strategy = new PrebuiltBotStrategy(settings)
        const conversationUrl = strategy.getConversationUrl()

        assert(conversationUrl.includes(host.hostname))
      })
    })

    it('should handle special characters in identifier', function () {
      const identifiers = [
        'bot-with-dashes',
        'bot_with_underscores',
        'BotWithCaps',
        'bot123',
        'bot.with.dots'
      ]

      identifiers.forEach(identifier => {
        const settings: PrebuiltBotStrategySettings = {
          host: testHost,
          identifier
        }

        const strategy = new PrebuiltBotStrategy(settings)
        const conversationUrl = strategy.getConversationUrl()

        assert(conversationUrl.includes(identifier))
      })
    })
  })

  describe('getConversationUrl', function () {
    let strategy: PrebuiltBotStrategy

    beforeEach(() => {
      const settings: PrebuiltBotStrategySettings = {
        host: testHost,
        identifier: testIdentifier
      }
      strategy = new PrebuiltBotStrategy(settings)
    })

    it('should return URL without conversation ID', function () {
      const url = strategy.getConversationUrl()

      assert(typeof url === 'string')
      assert(url.length > 0)
      assert(url.includes('/conversations'))
      assert(url.includes('api-version=2022-03-01-preview'))
    })

    it('should return URL with conversation ID', function () {
      const conversationId = 'test-conversation-123'
      const url = strategy.getConversationUrl(conversationId)

      assert(url.includes(conversationId))
      assert(url.includes('/conversations/'))
      // URL should contain the conversation ID in the path, not necessarily at the end due to query params
      assert(url.includes(`/conversations/${conversationId}`))
    })

    it('should handle empty conversation ID', function () {
      const url = strategy.getConversationUrl('')

      // Empty string should be treated as no conversation ID
      assert(url.includes('/conversations'))
      assert(url.includes('api-version=2022-03-01-preview'))
    })

    it('should handle undefined conversation ID', function () {
      const url = strategy.getConversationUrl(undefined)

      assert(url.includes('/conversations'))
      assert(url.includes('api-version=2022-03-01-preview'))
    })

    it('should handle conversation IDs with special characters', function () {
      const conversationIds = [
        'conv-with-dashes',
        'conv_with_underscores',
        'ConvWithCaps',
        'conv123',
        'conv.with.dots',
        'conv%20with%20encoded'
      ]

      conversationIds.forEach(conversationId => {
        const url = strategy.getConversationUrl(conversationId)

        assert(url.includes(conversationId))
        assert(url.includes('/conversations/'))
      })
    })

    it('should generate valid URLs', function () {
      const conversationId = 'test-conversation'
      const url = strategy.getConversationUrl(conversationId)

      // Should be a valid URL
      assert.doesNotThrow(() => {
        const parsedUrl = new URL(url)
        assert(parsedUrl.href === url)
      })
    })

    it('should preserve query parameters', function () {
      const url = strategy.getConversationUrl()

      const parsedUrl = new URL(url)
      assert(parsedUrl.searchParams.has('api-version'))
      assert.strictEqual(parsedUrl.searchParams.get('api-version'), '2022-03-01-preview')
    })

    it('should use HTTPS protocol', function () {
      const url = strategy.getConversationUrl()

      assert(url.startsWith('https://'))
    })

    it('should maintain host information', function () {
      const url = strategy.getConversationUrl()

      assert(url.includes(testHost.hostname))
    })

    it('should include prebuilt path segment', function () {
      const url = strategy.getConversationUrl()

      assert(url.includes('/copilotstudio/prebuilt/authenticated/bots/'))
    })
  })

  describe('URL structure validation', function () {
    it('should generate URLs with expected structure', function () {
      const settings: PrebuiltBotStrategySettings = {
        host: new URL('https://api.powerplatform.com'),
        identifier: 'my-bot'
      }

      const strategy = new PrebuiltBotStrategy(settings)
      const url = strategy.getConversationUrl('my-conversation')

      const expectedPattern = /^https:\/\/api\.powerplatform\.com\/copilotstudio\/prebuilt\/authenticated\/bots\/my-bot\/conversations\/my-conversation\?api-version=2022-03-01-preview$/
      assert(expectedPattern.test(url), `URL ${url} should match expected pattern`)
    })

    it('should generate base URLs with expected structure', function () {
      const settings: PrebuiltBotStrategySettings = {
        host: new URL('https://custom.domain.com'),
        identifier: 'custom-bot'
      }

      const strategy = new PrebuiltBotStrategy(settings)
      const url = strategy.getConversationUrl()

      const expectedPattern = /^https:\/\/custom\.domain\.com\/copilotstudio\/prebuilt\/authenticated\/bots\/custom-bot\/conversations\?api-version=2022-03-01-preview$/
      assert(expectedPattern.test(url), `URL ${url} should match expected pattern`)
    })
  })

  describe('edge cases', function () {
    it('should handle hosts with paths', function () {
      const hostWithPath = new URL('https://api.powerplatform.com/some/path')
      const settings: PrebuiltBotStrategySettings = {
        host: hostWithPath,
        identifier: testIdentifier
      }

      const strategy = new PrebuiltBotStrategy(settings)
      const url = strategy.getConversationUrl()

      // Should handle base URL correctly even with path
      assert(typeof url === 'string')
      assert(url.length > 0)
    })

    it('should handle hosts with query parameters', function () {
      const hostWithQuery = new URL('https://api.powerplatform.com?existing=param')
      const settings: PrebuiltBotStrategySettings = {
        host: hostWithQuery,
        identifier: testIdentifier
      }

      const strategy = new PrebuiltBotStrategy(settings)
      const url = strategy.getConversationUrl()

      // Should maintain api-version parameter
      assert(url.includes('api-version=2022-03-01-preview'))
    })
  })
})
