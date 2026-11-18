/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '../activity'

/**
 * Enum representing the different channels an agent can communicate through.
 */
export enum Channels {
  /**
   * Represents an agentic channel
   */
  Agents = 'agents',
  /**
   * Represents the Alexa channel.
   */
  Alexa = 'alexa',

  /**
   * Represents the Console channel.
   */
  Console = 'console',

  /**
   * Represents the Directline channel.
   */
  Directline = 'directline',

  /**
   * Represents the Directline Speech channel.
   */
  DirectlineSpeech = 'directlinespeech',

  /**
   * Represents the Email channel.
   */
  Email = 'email',

  /**
   * Represents the Emulator channel.
   */
  Emulator = 'emulator',

  /**
   * Represents the Facebook channel.
   */
  Facebook = 'facebook',

  /**
   * Represents the GroupMe channel.
   */
  Groupme = 'groupme',

  /**
   * Represents the Line channel.
   */
  Line = 'line',

  /**
   * Represents the Microsoft Teams channel.
   */
  Msteams = 'msteams',

  /**
   * M365 Copilot Teams Subchannel.
   */
  M365CopilotSubChannel = 'COPILOT',

  /**
   * Represents the Microsoft 365 Copilot channel within Microsoft Teams.
   */
  M365Copilot = `${Msteams}:${M365CopilotSubChannel}`,

  /**
   * Represents the Omnichannel.
   */
  Omni = 'omnichannel',

  /**
   * Represents the Outlook channel.
   */
  Outlook = 'outlook',

  /**
   * Represents the Skype channel.
   */
  Skype = 'skype',

  /**
   * Represents the Slack channel.
   */
  Slack = 'slack',

  /**
   * Represents the SMS channel.
   */
  Sms = 'sms',

  /**
   * Represents the Telegram channel.
   */
  Telegram = 'telegram',

  /**
   * Represents the Telephony channel.
   */
  Telephony = 'telephony',

  /**
   * Represents the Test channel.
   */
  Test = 'test',

  /**
   * Represents the Webchat channel.
   */
  Webchat = 'webchat',
}

/**
 * Determines whether a channel supports video cards.
 * @param channelId The channel identifier to check for video card support.
 * @returns True if the channel supports video cards; otherwise, false.
 */
export function supportsVideoCard (channelId: string): boolean {
  const [channel] = Activity.parseChannelId(channelId)

  switch (channel) {
    case Channels.Alexa:
    case Channels.Msteams: // any "msteams" channel regardless of subchannel since the switch is on channelId.channel
      return false
    default:
      return true
  }
}

/**
 * Determines whether a channel supports receipt cards.
 * @param channelId The channel identifier to check for receipt card support.
 * @returns True if the channel supports receipt cards; otherwise, false.
 */
export function supportsReceiptCard (channelId: string): boolean {
  const [channel] = Activity.parseChannelId(channelId)

  switch (channel) {
    case Channels.Alexa:
    case Channels.Groupme:
    case Channels.Msteams: // any "msteams" channel regardless of subchannel since the switch is on channelId.channel
      return false
    default:
      return true
  }
}

/**
 * Determines whether a channel supports thumbnail cards.
 * @param channelId The channel identifier to check for thumbnail card support.
 * @returns True if the channel supports thumbnail cards; otherwise, false.
 */
export function supportsThumbnailCard (channelId: string): boolean {
  const [channel] = Activity.parseChannelId(channelId)

  switch (channel) {
    case Channels.Alexa:
    case Channels.Groupme:
    case Channels.Line:
    case Channels.Slack:
      return false
    default:
      return true
  }
}

/**
 * Determines whether a channel supports audio cards.
 * @param channelId The channel identifier to check for audio card support.
 * @returns True if the channel supports audio cards; otherwise, false.
 */
export function supportsAudioCard (channelId: string): boolean {
  const [channel] = Activity.parseChannelId(channelId)

  switch (channel) {
    case Channels.Alexa:
    case Channels.Msteams: // any "msteams" channel regardless of subchannel since the switch is on channelId.channel
    case Channels.Email:
    case Channels.Groupme:
    case Channels.Line:
    case Channels.Slack:
    case Channels.Telegram:
      return false
    default:
      return true
  }
}

/**
 * Determines whether a channel supports animation cards.
 * @param channelId The channel identifier to check for animation card support.
 * @returns True if the channel supports animation cards; otherwise, false.
 */
export function supportsAnimationCard (channelId: string): boolean {
  const [channel] = Activity.parseChannelId(channelId)

  switch (channel) {
    case Channels.Alexa:
    case Channels.Msteams: // any "msteams" channel regardless of subchannel since the switch is on channelId.channel
    case Channels.Email:
    case Channels.Groupme:
      return false
    default:
      return true
  }
}

/**
 * Determines whether a channel supports updating activities.
 * @param channelId Channel identifier to check for update activity support.
 * @returns True for Teams; false for other channels.
 */
export function supportsUpdateActivity (channelId: string): boolean {
  const [channel] = Activity.parseChannelId(channelId)

  return channel === Channels.Msteams // any "msteams" channel regardless of subchannel since the switch is on channelId.channel
}

/**
 * Determines whether a channel supports deleting activities.
 * @param channelId Channel identifier to check for delete activity support.
 * @returns True for Teams, Slack, and Telegram; false for other channels.
 */
export function supportsDeleteActivity (channelId: string): boolean {
  const [channel] = Activity.parseChannelId(channelId)

  switch (channel) {
    case Channels.Msteams: // any "msteams" channel regardless of subchannel since the switch is on channelId.channel
    case Channels.Slack:
    case Channels.Telegram:
      return true
    default:
      return false
  }
}
