/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing message reaction types.
 */
export enum MessageReactionTypes {
  Like = 'like',
  PlusOne = 'plusOne',
}

/**
 * Zod schema for validating MessageReactionTypes enum values.
 */
export const messageReactionTypesZodSchema = z.enum(['like', 'plusOne'])
