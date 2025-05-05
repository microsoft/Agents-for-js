/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing delivery modes.
 */
export enum DeliveryModes {
  /**
   * Represents the normal delivery mode.
   */
  Normal = 'normal',

  /**
   * Represents a notification delivery mode.
   */
  Notification = 'notification',

  /**
   * Represents a delivery mode where replies are expected.
   */
  ExpectReplies = 'expectReplies',

  /**
   * Represents an ephemeral delivery mode.
   */
  Ephemeral = 'ephemeral',
}

/**
 * Zod schema for validating a DeliveryModes enum.
 */
export const deliveryModesZodSchema = z.enum(['normal', 'notification', 'expectReplies', 'ephemeral'])
