/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface OnBehalfOf {
  itemid: 0 | number
  mentionType: 'person' | string
  mri: string
  displayName?: string
}

export const onBehalfOfZodSchema = z.object({
  itemid: z.union([z.literal(0), z.number()]),
  mentionType: z.union([z.string().min(1), z.literal('person')]),
  mri: z.string().min(1),
  displayName: z.string().min(1).optional()
})
