/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing the state types of a semantic action.
 */
export enum SemanticActionStateTypes {
  /**
   * Indicates the start of a semantic action.
   */
  Start = 'start',

  /**
   * Indicates the continuation of a semantic action.
   */
  Continue = 'continue',

  /**
   * Indicates the completion of a semantic action.
   */
  Done = 'done',
}

/**
 * Zod schema for validating SemanticActionStateTypes.
 */
export const semanticActionStateTypesZodSchema = z.enum(['start', 'continue', 'done'])
