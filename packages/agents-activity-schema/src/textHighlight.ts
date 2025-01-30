/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface TextHighlight {
  text: string
  occurrence: number
}

export const textHighlightZodSchema = z.object({
  text: z.string().min(1),
  occurrence: z.number()
})
