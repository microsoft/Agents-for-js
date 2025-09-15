import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import { PublishedBotStrategy, type PublishedBotStrategySettings } from '../../src/strategies/publishedBotStrategy'

describe('PublishedBotStrategy', function () {
  const testHost = new URL('https://test.powerplatform.com')
  const testSchema = 'test-bot-schema'

  describe('constructor', function () {
    it('should create instance with valid settings', function () {
      const settings: PublishedBotStrategySettings = {
        host: testHost,
        schema: testSchema
      }

      const strategy = new PublishedBotStrategy(settings)
      assert(strategy instanceof PublishedBotStrategy)
    })

    it('should construct correct base URL with schema', function () {
      const settings: PublishedBotStrategySettings = {
        host: testHost,
        schema: testSchema
      }

      const strategy = new PublishedBotStrategy(settings)
      const conversationUrl = strategy.getConversationUrl()

      assert(conversationUrl.includes('/copilotstudio/dataverse-backed/authenticated/bots/'))
      assert(conversationUrl.includes(testSchema))
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
        const settings: PublishedBotStrategySettings = {
          host,
          schema: testSchema
        }

        const strategy = new PublishedBotStrategy(settings)
        const conversationUrl = strategy.getConversationUrl()

        assert(conversationUrl.includes(host.hostname))
      })
    })

    it('should handle special characters in schema', function () {
      const schemas = [
        'schema-with-dashes',
        'schema_with_underscores',
        'SchemaWithCaps',
        'schema123',
        'schema.with.dots'
      ]

      schemas.forEach(schema => {
        const settings: PublishedBotStrategySettings = {
          host: testHost,
          schema
        }

        const strategy = new PublishedBotStrategy(settings)
        const conversationUrl = strategy.getConversationUrl()

        assert(conversationUrl.includes(schema))
      })
    })
  })

  describe('getConversationUrl', function () {
    let strategy: PublishedBotStrategy

    beforeEach(() => {
      const settings: PublishedBotStrategySettings = {
        host: testHost,
        schema: testSchema
      }
      strategy = new PublishedBotStrategy(settings)
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

    it('should include dataverse-backed path segment', function () {
      const url = strategy.getConversationUrl()

      assert(url.includes('/copilotstudio/dataverse-backed/authenticated/bots/'))
    })
  })

  describe('URL structure validation', function () {
    it('should generate URLs with expected structure', function () {
      const settings: PublishedBotStrategySettings = {
        host: new URL('https://api.powerplatform.com'),
        schema: 'my-bot'
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl('my-conversation')

      const expectedPattern = /^https:\/\/api\.powerplatform\.com\/copilotstudio\/dataverse-backed\/authenticated\/bots\/my-bot\/conversations\/my-conversation\?api-version=2022-03-01-preview$/
      assert(expectedPattern.test(url), `URL ${url} should match expected pattern`)
    })

    it('should generate base URLs with expected structure', function () {
      const settings: PublishedBotStrategySettings = {
        host: new URL('https://custom.domain.com'),
        schema: 'custom-bot'
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl()

      const expectedPattern = /^https:\/\/custom\.domain\.com\/copilotstudio\/dataverse-backed\/authenticated\/bots\/custom-bot\/conversations\?api-version=2022-03-01-preview$/
      assert(expectedPattern.test(url), `URL ${url} should match expected pattern`)
    })
  })

  describe('difference from PrebuiltBotStrategy', function () {
    it('should use dataverse-backed path instead of prebuilt', function () {
      const settings: PublishedBotStrategySettings = {
        host: testHost,
        schema: testSchema
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl()

      assert(url.includes('/dataverse-backed/'))
      assert(!url.includes('/prebuilt/'))
    })

    it('should use schema parameter instead of identifier', function () {
      const settings: PublishedBotStrategySettings = {
        host: testHost,
        schema: 'my-schema-name'
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl()

      assert(url.includes('my-schema-name'))
    })
  })

  describe('edge cases', function () {
    it('should handle hosts with paths', function () {
      const hostWithPath = new URL('https://api.powerplatform.com/some/path')
      const settings: PublishedBotStrategySettings = {
        host: hostWithPath,
        schema: testSchema
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl()

      // Should handle base URL correctly even with path
      assert(typeof url === 'string')
      assert(url.length > 0)
    })

    it('should handle hosts with query parameters', function () {
      const hostWithQuery = new URL('https://api.powerplatform.com?existing=param')
      const settings: PublishedBotStrategySettings = {
        host: hostWithQuery,
        schema: testSchema
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl()

      // Should maintain api-version parameter
      assert(url.includes('api-version=2022-03-01-preview'))
    })

    it('should handle long schema names', function () {
      const longSchema = 'a'.repeat(100)
      const settings: PublishedBotStrategySettings = {
        host: testHost,
        schema: longSchema
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl()

      assert(url.includes(longSchema))
    })

    it('should handle schema names with Unicode characters', function () {
      const unicodeSchema = 'schema-with-émojis-🤖'
      const settings: PublishedBotStrategySettings = {
        host: testHost,
        schema: unicodeSchema
      }

      const strategy = new PublishedBotStrategy(settings)
      const url = strategy.getConversationUrl()

      // URL should contain encoded Unicode characters
      assert(typeof url === 'string')
      assert(url.length > 0)
    })
  })
})

