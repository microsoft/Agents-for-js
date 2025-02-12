/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum ActivityEventNames {
  ContinueConversation = 'ContinueConversation',
  CreateConversation = 'CreateConversation',
}

export const activityEventNamesZodSchema = z.enum(['ContinueConversation', 'CreateConversation'])
