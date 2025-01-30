/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { Entity, entityZodSchema } from '../entity/entity'
import { SemanticActionStateTypes, semanticActionStateTypesZodSchema } from './semanticActionStateTypes'

export interface SemanticAction {
  id: string
  state: SemanticActionStateTypes | string
  entities: { [propertyName: string]: Entity }
}

export const semanticActionZodSchema = z.object({
  id: z.string().min(1),
  state: z.union([semanticActionStateTypesZodSchema, z.string().min(1)]),
  entities: z.record(entityZodSchema)
})
