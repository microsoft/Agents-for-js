import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ChannelAccount, ConversationAccount, ConversationReference, RoleTypes } from '../../src'
import { conversationReferenceZodSchema } from '../../src/conversation/conversationReference'
import { rev } from '../../src/activityJsonOverrides'
describe('ConversationReference', () => {
  it('should create a ConversationReference with valid properties', () => {
    const channelAccount: ChannelAccount = { id: '123', name: 'user1', role: RoleTypes.User }
    const convAccount: ConversationAccount =
    {
      isGroup: true,
      conversationType: 'conversationType',
      tenantId: 'tenantId',
      id: 'id',
      name: 'name',
      aadObjectId: 'aadObjectId',
      role: RoleTypes.User,
      properties: 'test'
    }
    const conversationRef: ConversationReference = {
      activityId: 'activityId',
      user: channelAccount,
      locale: 'locale',
      agent: channelAccount,
      conversation: convAccount,
      channelId: 'channelId',
      serviceUrl: 'serviceUrl'
    }
    assert.equal(conversationRef.activityId, 'activityId')
    assert.equal(conversationRef.user, channelAccount)
    assert.strictEqual(conversationRef.locale, 'locale')
    assert.equal(conversationRef.agent, channelAccount)
    assert.strictEqual(conversationRef.conversation, convAccount)
    assert.strictEqual(conversationRef.channelId, 'channelId')
    assert.equal(conversationRef.serviceUrl, 'serviceUrl')
  })

  it('should throw an error if bot is missing', () => {
    // @ts-expect-error
    const conversationRef: ConversationReference = { }
    assert.strictEqual(conversationRef.agent, undefined)
  })

  it('should throw an error if conversation is missing', () => {
    // @ts-expect-error
    const conversationRef: ConversationReference = { }
    assert.strictEqual(conversationRef.conversation, undefined)
  })

  it('should throw an error if channelId is missing', () => {
    // @ts-expect-error
    const conversationRef: ConversationReference = { }
    assert.strictEqual(conversationRef.channelId, undefined)
  })

  it('should throw an error if serviceUrl is missing', () => {
    // @ts-expect-error
    const conversationRef: ConversationReference = { }
    assert.strictEqual(conversationRef.serviceUrl, undefined)
  })
})

describe('ConversationReference json deserialization', () => {
  it('Deserialize with known id, name, and role', () => {
    const json = `{
    "activityId": "activityId",
    "user": {
        "id": "123",
        "name": "user1",
        "role": "user"
    },
    "locale": "locale",
    "bot": {
        "id": "123",
        "name": "user1",
        "role": "user"
    },
    "conversation": {
        "isGroup": true,
        "conversationType": "conversationType",
        "tenantId": "tenantId",
        "id": "id",
        "name": "name",
        "aadObjectId": "aadObjectId",
        "role": "user",
        "properties": "test"
    },
    "channelId": "channelId",
    "serviceUrl": "serviceUrl"
    }`
    const channelAccount: ChannelAccount = { id: '123', name: 'user1', role: RoleTypes.User }
    const convAccount: ConversationAccount =
    {
      isGroup: true,
      conversationType: 'conversationType',
      tenantId: 'tenantId',
      id: 'id',
      name: 'name',
      aadObjectId: 'aadObjectId',
      role: RoleTypes.User,
      properties: 'test'
    }
    const conversationRef: ConversationReference = conversationReferenceZodSchema.parse(JSON.parse(json, rev))
    assert.equal(conversationRef.activityId, 'activityId')
    assert.deepEqual(conversationRef.user, channelAccount)
    assert.strictEqual(conversationRef.locale, 'locale')
    assert.deepEqual(conversationRef.agent, channelAccount)
    assert.deepEqual(conversationRef.conversation, convAccount)
    assert.strictEqual(conversationRef.channelId, 'channelId')
    assert.equal(conversationRef.serviceUrl, 'serviceUrl')
  })
})
