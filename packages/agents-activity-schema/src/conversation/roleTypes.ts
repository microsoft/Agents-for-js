/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum RoleTypes {
  User = 'user',
  Bot = 'bot',
  Skill = 'skill',
}

export const roleTypeZodSchema = z.enum(['user', 'bot', 'skill'])
