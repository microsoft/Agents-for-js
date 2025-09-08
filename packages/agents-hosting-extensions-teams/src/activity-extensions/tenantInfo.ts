/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Represents information about a tenant.
 */
export interface TenantInfo {
  /**
   * The ID of the tenant.
   */
  id?: string
}

/**
 * Zod schema for validating TenantInfo objects.
 */
export const tenantInfoZodSchema = z.object({
  id: z.string().min(1).optional()
})
