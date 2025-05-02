/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing activity importance levels.
 */
export enum ActivityImportance {
  /**
   * Indicates low importance.
   */
  Low = 'low',

  /**
   * Indicates normal importance.
   */
  Normal = 'normal',

  /**
   * Indicates high importance.
   */
  High = 'high',
}

/**
 * Zod schema for validating an ActivityImportance enum.
 */
export const activityImportanceZodSchema = z.enum(['low', 'normal', 'high'])
