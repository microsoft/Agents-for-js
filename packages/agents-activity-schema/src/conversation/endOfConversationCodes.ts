/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum EndOfConversationCodes {
  Unknown = 'unknown',
  CompletedSuccessfully = 'completedSuccessfully',
  UserCancelled = 'userCancelled',
  BotTimedOut = 'botTimedOut',
  BotIssuedInvalidMessage = 'botIssuedInvalidMessage',
  ChannelFailed = 'channelFailed',
}

export const endOfConversationCodesZodSchema = z.enum(['unknown', 'completedSuccessfully', 'userCancelled', 'botTimedOut', 'botIssuedInvalidMessage', 'channelFailed'])
