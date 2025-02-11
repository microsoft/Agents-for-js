/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface AdaptiveCardInvokeAction {
  type: string
  id: string
  verb: string
  data: Record<string, any>
}

export const adaptiveCardInvokeActionZodSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  verb: z.string().min(1),
  data: z.record(z.string().min(1), z.any())
})
