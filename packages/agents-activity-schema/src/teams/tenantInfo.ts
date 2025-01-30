/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface TenantInfo {
  id?: string
}

export const tenantInfoZodSchema = z.object({
  id: z.string().min(1).optional()
})
