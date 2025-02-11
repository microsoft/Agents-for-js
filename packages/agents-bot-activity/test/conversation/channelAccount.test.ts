import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ChannelAccount, RoleTypes } from '..'
import { channelAccountZodSchema } from './channelAccount'

describe('ChannelAccount', () => {
  it('should create a ChannelAccount with valid properties', () => {
    const account: ChannelAccount = { id: '123', name: 'user1', role: RoleTypes.User }
    assert.equal(account.id, '123')
    assert.equal(account.name, 'user1')
    assert.strictEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'user')
  })

  it('should create a ChannelAccount without name property', () => {
    const account: ChannelAccount = { id: '123', role: RoleTypes.User }
    assert.equal(account.id, '123')
    assert.strictEqual(account.name, undefined)
    assert.strictEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'user')
  })

  it('should not throw an error if id is missing', () => {
    const account1: ChannelAccount = { name: 'user1' }
    assert.strictEqual(account1.id, undefined)
    const account2: ChannelAccount = { id: 'user1' }
    assert.strictEqual(account2.name, undefined)
  })
})

describe('Channel Account json deserialization', () => {
  it('Deserialize with known id, name, and role', () => {
    const json = '{ "id" : "123", "name" : "user1", "role" : "user" }'
    const account: ChannelAccount = channelAccountZodSchema.parse(JSON.parse(json))
    assert.equal(account.id, '123')
    assert.equal(account.name, 'user1')
    assert.strictEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'user')
  })

  it('Deserialize with known id, empty name, and role', () => {
    const json = '{ "id" : "123", "name" : "", "role" : "user" }'
    const account: ChannelAccount = channelAccountZodSchema.parse(JSON.parse(json))
    assert.equal(account.id, '123')
    assert.equal(account.name, '')
    assert.strictEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'user')
  })

  it('Deserialize with known id and role, without name', () => {
    const json = '{ "id" : "123", "role" : "user" }'
    const account: ChannelAccount = channelAccountZodSchema.parse(JSON.parse(json))
    assert.equal(account.id, '123')
    assert.strictEqual(account.name, undefined)
    assert.strictEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'user')
  })

  it('Deserialize with known id, name, and bad role', () => {
    const json = '{ "id" : "123", "name" : "user1", "role" : "new_role" }'
    const account: ChannelAccount = channelAccountZodSchema.parse(JSON.parse(json))
    assert.equal(account.id, '123')
    assert.equal(account.name, 'user1')
    assert.notEqual(account.role, RoleTypes.User)
    assert.strictEqual(account.role, 'new_role')
  })
})
