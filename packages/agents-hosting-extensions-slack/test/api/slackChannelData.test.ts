// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getSlackChannelData,
  getSlackChannel,
  getSlackThreadTs,
  getSlackUserId,
} from '../../src/api/slackChannelData.js'
import type { TurnContext } from '@microsoft/agents-hosting'

function makeContext (channelData: unknown): TurnContext {
  return { activity: { channelData } } as unknown as TurnContext
}

describe('SlackChannelData helpers', () => {
  const channelData = {
    ApiToken: 'xoxb-token',
    SlackMessage: {
      team_id: 'T123',
      event: {
        channel: 'C456',
        thread_ts: '111.222',
        user: 'U789',
      },
    },
  }

  it('getSlackChannelData returns typed channel data', () => {
    const ctx = makeContext(channelData)
    const result = getSlackChannelData(ctx)
    assert.equal(result?.ApiToken, 'xoxb-token')
    assert.equal(result?.SlackMessage?.team_id, 'T123')
  })

  it('getSlackChannelData returns undefined for missing channelData', () => {
    const ctx = makeContext(undefined)
    assert.equal(getSlackChannelData(ctx), undefined)
  })

  it('getSlackChannel returns event.channel', () => {
    const ctx = makeContext(channelData)
    assert.equal(getSlackChannel(ctx), 'C456')
  })

  it('getSlackThreadTs returns event.thread_ts', () => {
    const ctx = makeContext(channelData)
    assert.equal(getSlackThreadTs(ctx), '111.222')
  })

  it('getSlackUserId returns event.user', () => {
    const ctx = makeContext(channelData)
    assert.equal(getSlackUserId(ctx), 'U789')
  })

  it('helpers return undefined when channelData is missing', () => {
    const ctx = makeContext(undefined)
    assert.equal(getSlackChannel(ctx), undefined)
    assert.equal(getSlackThreadTs(ctx), undefined)
    assert.equal(getSlackUserId(ctx), undefined)
  })
})
