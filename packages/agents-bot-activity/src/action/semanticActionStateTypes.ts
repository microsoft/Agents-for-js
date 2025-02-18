/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum SemanticActionStateTypes {
  Start = 'start',
  Continue = 'continue',
  Done = 'done',
}

export const semanticActionStateTypesZodSchema = z.enum(['start', 'continue', 'done'])
