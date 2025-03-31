/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing the different role types in a conversation.
 */
export enum RoleTypes {
  User = 'user',
  Agent = 'bot',
  Skill = 'skill',
}

/**
 * Zod schema for validating role types.
 */
export const roleTypeZodSchema = z.enum(['user', 'bot', 'skill'])
