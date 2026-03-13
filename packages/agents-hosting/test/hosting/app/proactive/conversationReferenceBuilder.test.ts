// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
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

    it('returns empty string for unknown channels', () => {
      assert.equal(ConversationReferenceBuilder.serviceUrlForChannel('unknown-channel'), '')
    })
  })

  describe('create()', () => {
    it('sets agent.id to agentClientId', () => {
      const ref = ConversationReferenceBuilder.create('my-client-id', 'webchat').build()
      assert.equal(ref.agent?.id, 'my-client-id')
    })

    it('sets channelId', () => {
      const ref = ConversationReferenceBuilder.create('client-id', 'msteams').build()
      assert.equal(ref.channelId, 'msteams')
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
