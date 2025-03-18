/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing the different end of conversation codes.
 */
export enum EndOfConversationCodes {
  Unknown = 'unknown',
  CompletedSuccessfully = 'completedSuccessfully',
  UserCancelled = 'userCancelled',
  BotTimedOut = 'botTimedOut',
  BotIssuedInvalidMessage = 'botIssuedInvalidMessage',
  ChannelFailed = 'channelFailed',
}

/**
 * Zod schema for validating end of conversation codes.
 */
export const endOfConversationCodesZodSchema = z.enum(['unknown', 'completedSuccessfully', 'userCancelled', 'botTimedOut', 'botIssuedInvalidMessage', 'channelFailed'])
