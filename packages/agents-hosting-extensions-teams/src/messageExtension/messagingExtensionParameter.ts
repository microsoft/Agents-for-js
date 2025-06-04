/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Represents a parameter for a messaging extension query.
 */
export interface MessagingExtensionParameter {
  /**
   * The name of the parameter.
   */
  name?: string
  /**
   * The value of the parameter.
   */
  value?: any
}

/**
 * Zod schema for validating MessagingExtensionParameter.
 */
export const messagingExtensionParameterZodSchema = z.object({
  name: z.string().min(1).optional(),
  value: z.any().optional()
})
