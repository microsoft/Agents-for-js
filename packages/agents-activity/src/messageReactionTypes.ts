/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing message reaction types.
 */
export enum MessageReactionTypes {
  /**
   * Represents a 'like' reaction to a message.
   */
  Like = 'like',

  /**
   * Represents a '+1' reaction to a message.
   */
  PlusOne = 'plusOne',
}

/**
 * Zod schema for validating MessageReactionTypes enum values.
 */
export const messageReactionTypesZodSchema = z.enum(['like', 'plusOne'])
