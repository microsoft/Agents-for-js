import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ConversationAccount, RoleTypes } from '../'
import { conversationAccountZodSchema } from './conversationAccount'

describe('ConversationAccount', () => {
  it('should create a ConversationAccount with valid properties', () => {
    const account: ConversationAccount =
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
    assert.equal(account.isGroup, true)
    assert.equal(account.conversationType, 'conversationType')
    assert.equal(account.tenantId, 'tenantId')
    assert.equal(account.id, 'id')
    assert.equal(account.name, 'name')
    assert.equal(account.aadObjectId, 'aadObjectId')
    assert.strictEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'user')
    assert.strictEqual(account.properties, 'test')
  })
})

describe('ConversationAccount json deserialization', () => {
  it('Deserialize with known isGroup, conversationType, tenantId, id, aadObjectId, role and properties', () => {
    const json = '{ "isGroup" : true, "conversationType" : "conversationType", "tenantId" : "tenantId", "id": "id", "name": "name", "aadObjectId": "aadObjectId", "role" : "user", "properties": "properties" }'
    const account: ConversationAccount = conversationAccountZodSchema.parse(JSON.parse(json))
    assert.equal(account.isGroup, true)
    assert.equal(account.conversationType, 'conversationType')
    assert.equal(account.tenantId, 'tenantId')
    assert.equal(account.id, 'id')
    assert.equal(account.name, 'name')
    assert.equal(account.aadObjectId, 'aadObjectId')
    assert.strictEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'user')
    assert.strictEqual(account.properties, 'properties')
  })

  it('Deserialize with known isGroup, conversationType, tenantId, id, aadObjectId, properties and bad role', () => {
    const json = '{ "isGroup" : true, "conversationType" : "conversationType", "tenantId" : "tenantId", "id": "id", "name": "name", "aadObjectId": "aadObjectId", "role" : "new_role", "properties": "properties" }'
    const account: ConversationAccount = conversationAccountZodSchema.parse(JSON.parse(json))
    assert.equal(account.isGroup, true)
    assert.equal(account.conversationType, 'conversationType')
    assert.equal(account.tenantId, 'tenantId')
    assert.equal(account.id, 'id')
    assert.equal(account.name, 'name')
    assert.equal(account.aadObjectId, 'aadObjectId')
    assert.strictEqual(account.properties, 'properties')
    assert.notEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'new_role')
  })
})
