/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum MessageReactionTypes {
  Like = 'like',
  PlusOne = 'plusOne',
}

export const messageReactionTypesZodSchema = z.enum(['like', 'plusOne'])
