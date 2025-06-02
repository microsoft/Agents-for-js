/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Represents information about a notification.
 */
export interface NotificationInfo {
  /**
   * Indicates whether the notification is an alert.
   */
  alert?: boolean
  /**
   * Indicates whether the alert is in a meeting.
   */
  alertInMeeting?: boolean
  /**
   * The URL of the external resource.
   */
  externalResourceUrl?: string
}

/**
 * Zod schema for validating NotificationInfo objects.
 */
export const notificationInfoZodSchema = z.object({
  alert: z.boolean().optional(),
  alertInMeeting: z.boolean().optional(),
  externalResourceUrl: z.string().min(1).optional()
})
