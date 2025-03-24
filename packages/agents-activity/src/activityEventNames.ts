/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing activity event names.
 */
export enum ActivityEventNames {
  ContinueConversation = 'ContinueConversation',
  CreateConversation = 'CreateConversation',
}

/**
 * Zod schema for validating an ActivityEventNames enum.
 */
export const activityEventNamesZodSchema = z.enum(['ContinueConversation', 'CreateConversation'])
