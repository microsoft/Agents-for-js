/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing the state types of a semantic action.
 */
export enum SemanticActionStateTypes {
  Start = 'start',
  Continue = 'continue',
  Done = 'done',
}

/**
 * Zod schema for validating SemanticActionStateTypes.
 */
export const semanticActionStateTypesZodSchema = z.enum(['start', 'continue', 'done'])
