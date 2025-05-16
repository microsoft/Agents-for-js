/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Represents information about a team.
 */
export interface TeamInfo {
  /**
   * The ID of the team.
   */
  id?: string
  /**
   * The name of the team.
   */
  name?: string
  /**
   * The Azure Active Directory group ID of the team.
   */
  aadGroupId?: string
}

/**
 * Zod schema for validating TeamInfo objects.
 */
export const teamInfoZodSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  aadGroupId: z.string().min(1).optional()
})
