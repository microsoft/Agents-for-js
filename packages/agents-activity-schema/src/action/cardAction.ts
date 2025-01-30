/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { ActionTypes, actionTypesZodSchema } from './actionTypes'

export interface CardAction {
  type: ActionTypes | string
  title: string
  image?: string
  text?: string
  displayText?: string
  value?: any
  channelData?: unknown
  imageAltText?: string
}

export const cardActionZodSchema = z.object({
  type: z.union([actionTypesZodSchema, z.string().min(1)]),
  title: z.string().min(1),
  image: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  displayText: z.string().min(1).optional(),
  value: z.any().optional(),
  channelData: z.unknown().optional(),
  imageAltText: z.string().min(1).optional()
})
