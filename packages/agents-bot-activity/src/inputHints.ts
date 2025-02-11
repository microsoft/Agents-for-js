/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum InputHints {
  AcceptingInput = 'acceptingInput',
  IgnoringInput = 'ignoringInput',
  ExpectingInput = 'expectingInput',
}

export const inputHintsZodSchema = z.enum(['acceptingInput', 'ignoringInput', 'expectingInput'])
