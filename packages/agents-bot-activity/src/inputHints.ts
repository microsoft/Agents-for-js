/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing input hints.
 */
export enum InputHints {
  AcceptingInput = 'acceptingInput',
  IgnoringInput = 'ignoringInput',
  ExpectingInput = 'expectingInput',
}

/**
 * Zod schema for validating an InputHints enum.
 */
export const inputHintsZodSchema = z.enum(['acceptingInput', 'ignoringInput', 'expectingInput'])
