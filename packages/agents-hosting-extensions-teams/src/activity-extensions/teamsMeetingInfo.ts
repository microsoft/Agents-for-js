/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Represents information about a Teams meeting.
 */
export interface TeamsMeetingInfo {
  /**
   * The ID of the meeting.
   */
  id?: string
}

/**
 * Zod schema for validating TeamsMeetingInfo objects.
 */
export const teamsMeetingInfoZodSchema = z.object({
  id: z.string().min(1).optional()
})
