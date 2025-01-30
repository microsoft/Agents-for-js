/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface NotificationInfo {
  alert?: boolean
  alertInMeeting?: boolean
  externalResourceUrl?: string
}

export const notificationInfoZodSchema = z.object({
  alert: z.boolean().optional(),
  alertInMeeting: z.boolean().optional(),
  externalResourceUrl: z.string().min(1).optional()
})
