/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface TeamsMeetingInfo {
  id?: string
}

export const teamsMeetingInfoZodSchema = z.object({
  id: z.string().min(1).optional()
})
