import assert from 'assert'
import { describe, it } from 'node:test'
import { pseudonymizeConversationId, redactScopes, redactString, redactUrl, redactDiagnosticObject } from '../../src/utils/redact'

describe('redactString', () => {
  it('returns undefined for undefined input', () => {
    assert.strictEqual(redactString(undefined), undefined)
  })

  it('returns redacted marker for empty string', () => {
    assert.strictEqual(redactString(''), '<redacted>')
  })

  it('does not reveal short strings when peek is enabled', () => {
    assert.strictEqual(redactString('short', true), '<redacted>')
    assert.strictEqual(redactString('12345678', true), '<redacted>')
  })

  it('reveals only leading peek for long strings when enabled', () => {
    assert.strictEqual(redactString('123456789', true), '12<redacted>')
  })
})

describe('redactUrl', () => {
  it('returns undefined for undefined, empty, or whitespace input', () => {
    assert.strictEqual(redactUrl(undefined), undefined)
    assert.strictEqual(redactUrl(''), undefined)
    assert.strictEqual(redactUrl('   '), undefined)
  })

  it('returns redacted marker for invalid or relative urls', () => {
    assert.strictEqual(redactUrl('not a url'), '<redacted>')
    assert.strictEqual(redactUrl('/relative/path?token=secret'), '<redacted>')
  })

  it('returns only origin when url has no path segments', () => {
    assert.strictEqual(redactUrl('https://example.com'), 'https://example.com')
    assert.strictEqual(redactUrl('https://example.com/?secret=value'), 'https://example.com')
  })

  it('redacts path segments and strips query details when url has a path', () => {
    assert.strictEqual(
      redactUrl('https://example.com/api/v1/users?token=secret'),
      'https://example.com/<redacted> (3 segments)'
    )
  })
})

describe('redactScopes', () => {
  it('returns undefined for undefined input', () => {
    assert.strictEqual(redactScopes(undefined), undefined)
  })

  it('reports count for empty, singular, and plural scope lists', () => {
    assert.strictEqual(redactScopes([]), '<redacted> (0 scopes)')
    assert.strictEqual(redactScopes(['scope.one']), '<redacted> (1 scope)')
    assert.strictEqual(redactScopes(['scope.one', 'scope.two']), '<redacted> (2 scopes)')
  })
})

describe('redactDiagnosticObject', () => {
  it('redacts conversation IDs, activity text, and URLs without changing unrelated request fields', () => {
    const body = {
      emitStartConversationEvent: true,
      locale: 'en-US',
      conversationId: 'conversation-secret',
      activity: {
        type: 'message',
        text: 'activity-text-secret',
        conversation: { id: 'nested-conversation-secret', name: 'Support' },
        attachments: [{ contentUrl: 'https://files.example.com/attachments/private-file?token=secret' }]
      },
      callbackUrl: 'https://example.com/callback/private?code=secret'
    }

    assert.deepEqual(redactDiagnosticObject(body), {
      emitStartConversationEvent: true,
      locale: 'en-US',
      conversationId: pseudonymizeConversationId('conversation-secret'),
      activity: {
        type: 'message',
        text: 'ac<redacted>',
        conversation: { id: pseudonymizeConversationId('nested-conversation-secret'), name: 'Support' },
        attachments: [{ contentUrl: 'https://files.example.com/<redacted> (2 segments)' }]
      },
      callbackUrl: 'https://example.com/<redacted> (2 segments)'
    })

    assert.equal(body.conversationId, 'conversation-secret')
    assert.equal(body.activity.text, 'activity-text-secret')
    assert.equal(body.activity.attachments[0].contentUrl, 'https://files.example.com/attachments/private-file?token=secret')
  })

  it('redacts activityText diagnostic fields and URL aliases', () => {
    assert.deepEqual(redactDiagnosticObject({
      activityText: 'activity-text-secret',
      uri: 'https://example.com/private/resource',
      href: 'https://example.com/private/link'
    }), {
      activityText: 'ac<redacted>',
      uri: 'https://example.com/<redacted> (2 segments)',
      href: 'https://example.com/<redacted> (2 segments)'
    })
  })

  it('uses its conversation-ID pseudonymizer', () => {
    assert.deepEqual(redactDiagnosticObject({
      conversationId: 'conversation-secret',
      activity: { conversation: { id: 'nested-conversation-secret' } }
    }, 'diagnostics-key'), {
      conversationId: pseudonymizeConversationId('conversation-secret', 'diagnostics-key'),
      activity: { conversation: { id: pseudonymizeConversationId('nested-conversation-secret', 'diagnostics-key') } }
    })
  })
})

describe('pseudonymizeConversationId', () => {
  it('creates a stable process-local pseudonym without exposing the conversation ID', () => {
    const conversationId = 'conversation-id-secret'
    const first = pseudonymizeConversationId(conversationId)
    const second = pseudonymizeConversationId(conversationId)

    assert.equal(first, second)
    assert.match(first!, /^cid_[a-f0-9]{32}$/)
    assert.ok(!first!.includes(conversationId))
  })

  it('uses a supplied key for stable cross-process correlation', () => {
    const conversationId = 'conversation-id-secret'
    const key = 'customer-managed-diagnostics-key'

    assert.equal(
      pseudonymizeConversationId(conversationId, key),
      pseudonymizeConversationId(conversationId, key)
    )
    assert.notEqual(
      pseudonymizeConversationId(conversationId, key),
      pseudonymizeConversationId(conversationId, 'different-diagnostics-key')
    )
  })
})
