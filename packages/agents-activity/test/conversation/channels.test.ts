/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  Channels,
  supportsAnimationCard,
  supportsVideoCard,
  supportsAudioCard,
  supportsReceiptCard,
  supportsThumbnailCard,
  supportsUpdateActivity,
  supportsDeleteActivity
} from '../../src'

describe('channel card and activity support', () => {
  it('reports card and activity support for Alexa', () => {
    const channel = Channels.Alexa

    assert.equal(supportsAnimationCard(channel), false)
    assert.equal(supportsVideoCard(channel), false)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), false)
    assert.equal(supportsThumbnailCard(channel), false)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for Msteams', () => {
    const channel = Channels.Msteams

    assert.equal(supportsAnimationCard(channel), false)
    assert.equal(supportsVideoCard(channel), false)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), false)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), true)
    assert.equal(supportsDeleteActivity(channel), true)
  })

  it('reports card and activity support for M365Copilot', () => {
    const channel = Channels.M365Copilot

    assert.equal(supportsAnimationCard(channel), false)
    assert.equal(supportsVideoCard(channel), false)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), false)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), true)
    assert.equal(supportsDeleteActivity(channel), true)
  })

  it('reports card and activity support for Email', () => {
    const channel = Channels.Email

    assert.equal(supportsAnimationCard(channel), false)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for Groupme', () => {
    const channel = Channels.Groupme

    assert.equal(supportsAnimationCard(channel), false)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), false)
    assert.equal(supportsThumbnailCard(channel), false)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for Line', () => {
    const channel = Channels.Line

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), false)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for Slack', () => {
    const channel = Channels.Slack

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), false)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), true)
  })

  it('reports card and activity support for Telegram', () => {
    const channel = Channels.Telegram

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), false)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), true)
  })

  it('reports card and activity support for Sms', () => {
    const channel = Channels.Sms

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), true)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for Webchat', () => {
    const channel = Channels.Webchat

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), true)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for Directline', () => {
    const channel = Channels.Directline

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), true)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for Facebook', () => {
    const channel = Channels.Facebook

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), true)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for an unknown channel', () => {
    const channel = 'unknown'

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), true)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for an empty channel ID', () => {
    const channel = ''

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), true)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })

  it('reports card and activity support for the uppercase MSTEAMS channel ID', () => {
    const channel = 'MSTEAMS'

    assert.equal(supportsAnimationCard(channel), true)
    assert.equal(supportsVideoCard(channel), true)
    assert.equal(supportsAudioCard(channel), true)
    assert.equal(supportsReceiptCard(channel), true)
    assert.equal(supportsThumbnailCard(channel), true)
    assert.equal(supportsUpdateActivity(channel), false)
    assert.equal(supportsDeleteActivity(channel), false)
  })
})
