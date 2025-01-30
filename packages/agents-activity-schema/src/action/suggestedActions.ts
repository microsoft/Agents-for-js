/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { CardAction, cardActionZodSchema } from './cardAction'

export interface SuggestedActions {
  to: string[]
  actions: CardAction[]
}

export const suggestedActionsZodSchema = z.object({
  to: z.array(z.string().min(1)),
  actions: z.array(cardActionZodSchema)
})
