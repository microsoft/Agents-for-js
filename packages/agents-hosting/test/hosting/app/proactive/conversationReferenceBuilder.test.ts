// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Channels, RoleTypes } from '@microsoft/agents-activity'
import {
  ConversationReferenceBuilder,
  TeamsServiceEndpoints
} from '../../../../src/app/proactive/conversationReferenceBuilder'

describe('TeamsServiceEndpoints', () => {
  it('publicGlobal is the standard Teams service URL', () => {
    assert.equal(TeamsServiceEndpoints.publicGlobal, 'https://smba.trafficmanager.net/teams/')
  })

  it('gcc is the GCC Teams service URL', () => {
    assert.equal(TeamsServiceEndpoints.gcc, 'https://smba.infra.gcc.teams.microsoft.com/teams')
  })

  it('gccHigh is the GCC High Teams service URL', () => {
    assert.equal(TeamsServiceEndpoints.gccHigh, 'https://smba.infra.gov.teams.microsoft.us/teams')
  })

  it('dod is the DoD Teams service URL', () => {
    assert.equal(TeamsServiceEndpoints.dod, 'https://smba.infra.dod.teams.microsoft.us/teams')
  })
})

describe('ConversationReferenceBuilder', () => {
  describe('serviceUrlForChannel()', () => {
    it('returns the public global Teams URL for msteams', () => {
      assert.equal(
        ConversationReferenceBuilder.serviceUrlForChannel('msteams'),
        TeamsServiceEndpoints.publicGlobal
      )
    })

    it('returns the webchat URL for webchat', () => {
      assert.equal(
        ConversationReferenceBuilder.serviceUrlForChannel('webchat'),
        'https://webchat.botframework.com/'
      )
    })

    it('returns the directline URL for directline', () => {
      assert.equal(
        ConversationReferenceBuilder.serviceUrlForChannel('directline'),
        'https://directline.botframework.com/'
      )
    })

    it('returns a botframework.com URL for known non-Teams channels', () => {
      assert.equal(
        ConversationReferenceBuilder.serviceUrlForChannel('webchat'),
        'https://webchat.botframework.com/'
      )
      assert.equal(
        ConversationReferenceBuilder.serviceUrlForChannel('directline'),
        'https://directline.botframework.com/'
      )
    })

    it('returns a constructed botframework.com URL for unrecognized channels (and emits a warning)', () => {
      // Unknown channel IDs still produce a URL so callers are not hard-broken, but a
      // logger.warn is emitted to flag that an explicit serviceUrl should be provided.
      assert.equal(
        ConversationReferenceBuilder.serviceUrlForChannel('unknown-channel'),
        'https://unknown-channel.botframework.com/'
      )
    })

    it('returns empty string when channelId is empty', () => {
      assert.equal(ConversationReferenceBuilder.serviceUrlForChannel(''), '')
    })
  })

  describe('create()', () => {
    it('sets agent.id to agentClientId on non-Teams channels', () => {
      const ref = ConversationReferenceBuilder.create('my-client-id', 'webchat').build()
      assert.equal(ref.agent?.id, 'my-client-id')
    })

    it('prefixes agent.id with 28: on msteams channel', () => {
      const ref = ConversationReferenceBuilder.create('my-client-id', Channels.Msteams).build()
      assert.equal(ref.agent?.id, '28:my-client-id')
    })

    it('sets agent.role to Agent', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat').build()
      assert.equal(ref.agent?.role, RoleTypes.Agent)
    })

    it('sets channelId', () => {
      const ref = ConversationReferenceBuilder.create('client-id', Channels.Msteams).build()
      assert.equal(ref.channelId, Channels.Msteams)
    })

    it('defaults user to role User when withUser is not called', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat').build()
      assert.equal(ref.user?.role, RoleTypes.User)
    })
  })

  describe('withUser()', () => {
    it('sets reference.user with id and name', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withUser('user-1', 'Alice')
        .build()
      assert.equal(ref.user?.id, 'user-1')
      assert.equal(ref.user?.name, 'Alice')
    })

    it('sets reference.user with id only', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withUser('user-1')
        .build()
      assert.equal(ref.user?.id, 'user-1')
    })

    it('sets reference.user from a ChannelAccount', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withUser({ id: 'user-1', name: 'Alice', role: RoleTypes.User })
        .build()
      assert.equal(ref.user?.id, 'user-1')
      assert.equal(ref.user?.role, RoleTypes.User)
    })

    it('sets role to User when using string overload', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withUser('user-1')
        .build()
      assert.equal(ref.user?.role, RoleTypes.User)
    })
  })

  describe('withAgent()', () => {
    it('sets agent from id string on non-Teams channel', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withAgent('new-agent-id', 'MyBot')
        .build()
      assert.equal(ref.agent?.id, 'new-agent-id')
      assert.equal(ref.agent?.name, 'MyBot')
      assert.equal(ref.agent?.role, RoleTypes.Agent)
    })

    it('applies 28: prefix on msteams channel', () => {
      const ref = ConversationReferenceBuilder.create('client-id', Channels.Msteams)
        .withAgent('new-agent-id')
        .build()
      assert.equal(ref.agent?.id, '28:new-agent-id')
    })

    it('sets agent from a ChannelAccount', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withAgent({ id: 'custom-agent', role: RoleTypes.Agent })
        .build()
      assert.equal(ref.agent?.id, 'custom-agent')
    })
  })

  describe('withServiceUrl()', () => {
    it('overrides the service URL', () => {
      const ref = ConversationReferenceBuilder.create('client-id', Channels.Msteams)
        .withServiceUrl('https://custom.example.com/')
        .build()
      assert.equal(ref.serviceUrl, 'https://custom.example.com/')
    })
  })

  describe('withActivityId()', () => {
    it('sets reference.activityId', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withActivityId('act-42')
        .build()
      assert.equal(ref.activityId, 'act-42')
    })
  })

  describe('withLocale()', () => {
    it('sets reference.locale', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withLocale('en-US')
        .build()
      assert.equal(ref.locale, 'en-US')
    })
  })

  describe('withConversationId()', () => {
    it('sets reference.conversation.id', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'webchat')
        .withConversationId('conv-42')
        .build()
      assert.equal(ref.conversation.id, 'conv-42')
    })
  })

  describe('build()', () => {
    it('fills in serviceUrl from channel default when not explicitly set', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'msteams').build()
      assert.equal(ref.serviceUrl, TeamsServiceEndpoints.publicGlobal)
    })

    it('preserves a caller-supplied serviceUrl', () => {
      const ref = ConversationReferenceBuilder
        .create('client-id', 'msteams', 'https://custom.service.url/')
        .build()
      assert.equal(ref.serviceUrl, 'https://custom.service.url/')
    })
  })
})
