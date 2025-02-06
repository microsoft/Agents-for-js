/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface MessagingExtensionParameter {
  name?: string
  value?: any
}

export const messagingExtensionParameterZodSchema = z.object({
  name: z.string().min(1).optional(),
  value: z.any().optional()
})
