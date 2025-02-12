/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum ActivityImportance {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
}

export const activityImportanceZodSchema = z.enum(['low', 'normal', 'high'])
