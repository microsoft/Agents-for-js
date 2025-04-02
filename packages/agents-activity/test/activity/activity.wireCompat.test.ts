import assert from 'assert'
import { describe, it } from 'node:test'
import { normalizeIncomingPayload, normalizeOutgoingPayload } from '../../src'

describe('Incoming Activity Wire Compat', () => {
  it('Should translate bot to agent', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        bot: {
          id: 'bot-id',
          name: 'test',
          role: 'skill'
        }
      }
    }
    const normalized = normalizeIncomingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        agent: {
          id: 'bot-id',
          name: 'test',
          role: 'skill'
        }
      }
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should not fail without relatesTo', () => {
    const payload = {
      type: 'message',
      foo: 'bar'
    }
    const normalized = normalizeIncomingPayload(payload)
    const expected = {
      type: 'message',
      foo: 'bar'
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle empty payload gracefully', () => {
    const payload = {}
    const normalized = normalizeIncomingPayload(payload)
    const expected = {}
    assert.deepEqual(normalized, expected)
  })

  it('Should preserve unrelated fields in payload', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        bot: {
          id: 'bot-id',
          name: 'test',
          role: 'skill'
        }
      },
      extraField: 'extraValue'
    }
    const normalized = normalizeIncomingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        agent: {
          id: 'bot-id',
          name: 'test',
          role: 'skill'
        }
      },
      extraField: 'extraValue'
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle empty relatesTo', () => {
    const payload = {
      relatesTo: {}
    }
    const normalized = normalizeIncomingPayload(payload)
    const expected = {
      relatesTo: {}
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle empty bot', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        bot: {}
      },
      extraField: 'extraValue'
    }
    const normalized = normalizeIncomingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        agent: {}
      },
      extraField: 'extraValue'
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle bot as bool', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        bot: true
      }
    }
    const normalized = normalizeIncomingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        agent: true
      }
    }
    assert.deepEqual(normalized, expected)
  })
})

describe('Outgoing Activity Wire Compat', () => {
  it('Should translate agent to bot', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        agent: {
          id: 'agent-id',
          name: 'test',
          role: 'skill'
        }
      }
    }
    const normalized = normalizeOutgoingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        bot: {
          id: 'agent-id',
          name: 'test',
          role: 'skill'
        }
      }
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should not fail without relatesTo', () => {
    const payload = {
      type: 'message',
      foo: 'bar'
    }
    const normalized = normalizeOutgoingPayload(payload)
    const expected = {
      type: 'message',
      foo: 'bar'
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle empty payload gracefully', () => {
    const payload = {}
    const normalized = normalizeOutgoingPayload(payload)
    const expected = {}
    assert.deepEqual(normalized, expected)
  })

  it('Should preserve unrelated fields in payload', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        agent: {
          id: 'agent-id',
          name: 'test',
          role: 'skill'
        }
      },
      extraField: 'extraValue'
    }
    const normalized = normalizeOutgoingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        bot: {
          id: 'agent-id',
          name: 'test',
          role: 'skill'
        }
      },
      extraField: 'extraValue'
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle empty relatesTo', () => {
    const payload = {
      relatesTo: {}
    }
    const normalized = normalizeOutgoingPayload(payload)
    const expected = {
      relatesTo: {}
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle empty agent', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        agent: {}
      },
      extraField: 'extraValue'
    }
    const normalized = normalizeOutgoingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        bot: {}
      },
      extraField: 'extraValue'
    }
    assert.deepEqual(normalized, expected)
  })

  it('Should handle agent as bool', () => {
    const payload = {
      type: 'message',
      relatesTo: {
        agent: true
      }
    }
    const normalized = normalizeOutgoingPayload(payload)
    const expected = {
      type: 'message',
      relatesTo: {
        bot: true
      }
    }
    assert.deepEqual(normalized, expected)
  })
})
