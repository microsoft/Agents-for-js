/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Represents information about a user on behalf of whom an action is performed.
 */
export interface OnBehalfOf {
  /**
   * The ID of the item.
   */
  itemid: 0 | number
  /**
   * The type of mention.
   */
  mentionType: 'person' | string
  /**
   * The Microsoft Resource Identifier (MRI) of the user.
   */
  mri: string
  /**
   * The display name of the user.
   */
  displayName?: string
}

/**
 * Zod schema for validating OnBehalfOf objects.
 */
export const onBehalfOfZodSchema = z.object({
  itemid: z.union([z.literal(0), z.number()]),
  mentionType: z.union([z.string().min(1), z.literal('person')]),
  mri: z.string().min(1),
  displayName: z.string().min(1).optional()
})
