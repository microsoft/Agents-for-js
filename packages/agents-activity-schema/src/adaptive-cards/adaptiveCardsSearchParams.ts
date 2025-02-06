/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface AdaptiveCardsSearchParams {
  queryText: string;
  dataset: string;
}

export const adaptiveCardsSearchParamsZodSchema = z.object({
  queryText: z.string(),
  dataset: z.string(),
})
