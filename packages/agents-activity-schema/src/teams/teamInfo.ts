/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface TeamInfo {
  id?: string
  name?: string
  aadGroupId?: string
}

export const teamInfoZodSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  aadGroupId: z.string().min(1).optional()
})
