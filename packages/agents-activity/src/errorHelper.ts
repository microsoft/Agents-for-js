// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from './exceptionHelper'

/**
 * Error definitions for the Activity system.
 * This contains localized error codes for the Activity subsystem of the AgentSDK.
 *
 * Each error definition includes an error code (starting from -110000), a description, and a help link
 * pointing to an AKA link to get help for the given error.
 *
 * Usage example:
 * ```
 * throw ExceptionHelper.generateException(
 *   Error,
 *   Errors.InvalidActivityTypeUndefined
 * );
 * ```
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  /**
   * Error thrown when ActivityType is undefined.
   */
  InvalidActivityTypeUndefined: {
    code: -110000,
    description: 'Invalid ActivityType: undefined',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when ActivityType is null.
   */
  InvalidActivityTypeNull: {
    code: -110001,
    description: 'Invalid ActivityType: null',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when ActivityType is an empty string.
   */
  InvalidActivityTypeEmptyString: {
    code: -110002,
    description: 'Invalid ActivityType: empty string',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when channelId contains a subChannel but no main channel.
   */
  InvalidChannelIdSubChannelOnly: {
    code: -110003,
    description: 'Invalid channelId {channelId}. Found subChannel but no main channel.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when attempting to set subChannel before setting primary channel.
   */
  PrimaryChannelNotSet: {
    code: -110004,
    description: 'Primary channel must be set before setting subChannel',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Activity Recipient is undefined.
   */
  ActivityRecipientUndefined: {
    code: -110005,
    description: 'Activity Recipient undefined',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Activity Conversation is undefined.
   */
  ActivityConversationUndefined: {
    code: -110006,
    description: 'Activity Conversation undefined',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Activity ChannelId is undefined.
   */
  ActivityChannelIdUndefined: {
    code: -110007,
    description: 'Activity ChannelId undefined',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  }
}
