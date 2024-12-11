/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { MessageReactionTypes, messageReactionTypesZodSchema } from './MessageReactionTypes'

export interface MessageReaction {
  type: MessageReactionTypes | string
}

export const messageReactionZodSchema = z.object({
  type: z.union([messageReactionTypesZodSchema, z.string().min(1)])
})
