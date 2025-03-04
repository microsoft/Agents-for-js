/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Channels } from '@microsoft/agents-bot-hosting'

/**
 * @private
 * @param channelId the id of a channel
 * @param buttonCnt count of buttons allowed
 */
export function supportsSuggestedActions (channelId: string, buttonCnt = 100): boolean {
  // TODO: Update channels with support of suggested actions
  switch (channelId) {
    case Channels.Facebook:
    case Channels.Skype:
      return buttonCnt <= 10
    case Channels.Line:
      return buttonCnt <= 13
    case Channels.Telegram:
    case Channels.Emulator:
    case Channels.Directline:
    case Channels.Webchat:
    case Channels.DirectlineSpeech:
      return buttonCnt <= 100
    default:
      return false
  }
}

/**
 * @private
 * @param channelId the id of a channel
 * @param buttonCnt count of buttons allowed
 */
export function supportsCardActions (channelId: string, buttonCnt = 100): boolean {
  // TODO: Update channels with support of choices number
  switch (channelId) {
    case Channels.Facebook:
    case Channels.Skype:
      return buttonCnt <= 3
    case Channels.Msteams:
      return buttonCnt <= 50
    case Channels.Line:
      return buttonCnt <= 99
    case Channels.Slack:
    case Channels.Telegram:
    case Channels.Emulator:
    case Channels.Directline:
    case Channels.DirectlineSpeech:
    case Channels.Webchat:
      return buttonCnt <= 100
    default:
      return false
  }
}
