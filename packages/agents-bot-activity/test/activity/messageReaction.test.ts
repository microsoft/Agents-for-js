import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { MessageReaction, MessageReactionTypes } from '../../src'
import { messageReactionZodSchema } from '../../src/messageReaction'

describe('MessageReaction', () => {
  it('should create a MessageReaction with valid properties', () => {
    const reaction: MessageReaction = { type: MessageReactionTypes.Like }
    assert.strictEqual(reaction.type, MessageReactionTypes.Like)
    assert.strictEqual(reaction.type, 'like')
  })

  it('should throw an error if type is missing', () => {
    // @ts-expect-error
    const reaction: MessageReaction = { }
    assert.strictEqual(reaction.type, undefined)
  })
})

describe('MessageReaction json deserialization', () => {
  it('Deserialize with known type', () => {
    const json = '{ "type" : "like" }'
    const reaction: MessageReaction = messageReactionZodSchema.parse(JSON.parse(json))
    assert.strictEqual(reaction.type, MessageReactionTypes.Like)
    assert.strictEqual(reaction.type, 'like')
  })

  it('Deserialize with bad type', () => {
    const json = '{ "type" : "new_type" }'
    const reaction: MessageReaction = messageReactionZodSchema.parse(JSON.parse(json))
    assert.notEqual(reaction.type, MessageReactionTypes.Like)
    assert.strictEqual(reaction.type, 'new_type')
  })
})
