/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface Entity {
  type: string
  [key: string]: unknown
}

export const entityZodSchema = z.object({
  type: z.string().min(1)
})
