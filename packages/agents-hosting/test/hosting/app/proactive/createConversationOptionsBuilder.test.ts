// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import {
  CreateConversationOptionsBuilder
} from '../../../../src/app/proactive/createConversationOptionsBuilder'
import { AzureBotScope } from '../../../../src/app/proactive/createConversationOptions'

describe('CreateConversationOptionsBuilder', () => {
  describe('build()', () => {
    it('throws if withUser() was never called (no members)', () => {
      assert.throws(
        () => CreateConversationOptionsBuilder.create('client-id', 'msteams').build(),
        /members/
      )
    })

    it('defaults scope to AzureBotScope when not explicitly set', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .build()
      assert.equal(opts.scope, AzureBotScope)
    })

    it('defaults storeConversation to false when not set', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .build()
      assert.equal(opts.storeConversation, false)
    })

    it('sets identity.aud to agentClientId', () => {
      const opts = CreateConversationOptionsBuilder.create('my-client-id', 'msteams')
        .withUser('user-1')
        .build()
      assert.equal(opts.identity.aud, 'my-client-id')
    })

    it('sets channelId', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .build()
      assert.equal(opts.channelId, 'msteams')
    })

    it('sets parameters.agent.id to agentClientId', () => {
      const opts = CreateConversationOptionsBuilder.create('my-client-id', 'msteams')
        .withUser('user-1')
        .build()
      assert.equal(opts.parameters.agent?.id, 'my-client-id')
    })
  })

  describe('create() — claims overload', () => {
    it('accepts a ConversationClaims object and sets identity', () => {
      const opts = CreateConversationOptionsBuilder
        .create({ aud: 'my-client-id', tid: 'tenant-1' }, 'msteams')
        .withUser('user-1')
        .build()
      assert.equal(opts.identity.aud, 'my-client-id')
      assert.equal((opts.identity as any).tid, 'tenant-1')
    })

    it('sets parameters.agent.id from claims.aud', () => {
      const opts = CreateConversationOptionsBuilder
        .create({ aud: 'my-client-id' }, 'msteams')
        .withUser('user-1')
        .build()
      assert.equal(opts.parameters.agent?.id, 'my-client-id')
    })
  })

  describe('withUser()', () => {
    it('sets parameters.members', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .build()
      assert.ok(opts.parameters.members?.some((m) => m.id === 'user-1'))
    })
  })

  describe('withTenantId()', () => {
    it('sets parameters.tenantId', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .withTenantId('tenant-99')
        .build()
      assert.equal(opts.parameters.tenantId, 'tenant-99')
    })

    it('sets channelData.tenant.id on msteams channel', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .withTenantId('tenant-99')
        .build()
      assert.equal((opts.parameters.channelData as any)?.tenant?.id, 'tenant-99')
    })

    it('does not set channelData.tenant on non-Teams channels', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'directline')
        .withUser('user-1')
        .withTenantId('tenant-99')
        .build()
      assert.equal((opts.parameters.channelData as any)?.tenant, undefined)
    })
  })

  describe('withTeamsChannelId()', () => {
    it('sets isGroup=true and channelData.channel.id on msteams', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .withTeamsChannelId('teams-ch-1')
        .build()
      assert.equal(opts.parameters.isGroup, true)
      assert.equal((opts.parameters.channelData as any)?.channel?.id, 'teams-ch-1')
    })

    it('does nothing on non-Teams channels', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'directline')
        .withUser('user-1')
        .withTeamsChannelId('teams-ch-1')
        .build()
      assert.equal(opts.parameters.isGroup, undefined)
      assert.equal((opts.parameters.channelData as any)?.channel, undefined)
    })
  })

  describe('withActivity()', () => {
    it('sets parameters.activity', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .withActivity({ text: 'hello' })
        .build()
      assert.equal(opts.parameters.activity?.text, 'hello')
    })

    it("defaults activity.type to 'message' when not set", () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .withActivity({ text: 'hello' })
        .build()
      assert.equal(opts.parameters.activity?.type, 'message')
    })
  })

  describe('withScope()', () => {
    it('overrides the default AzureBotScope', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .withScope('https://custom.scope/')
        .build()
      assert.equal(opts.scope, 'https://custom.scope/')
    })
  })

  describe('withChannelData()', () => {
    it('merges rather than replaces when called twice', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .withChannelData({ foo: 'bar' })
        .withChannelData({ baz: 'qux' })
        .build()
      const cd = opts.parameters.channelData as any
      assert.equal(cd.foo, 'bar')
      assert.equal(cd.baz, 'qux')
    })
  })

  describe('storeConversation()', () => {
    it('sets storeConversation: true on the result', () => {
      const opts = CreateConversationOptionsBuilder.create('client-id', 'msteams')
        .withUser('user-1')
        .storeConversation(true)
        .build()
      assert.equal(opts.storeConversation, true)
    })
  })
})
