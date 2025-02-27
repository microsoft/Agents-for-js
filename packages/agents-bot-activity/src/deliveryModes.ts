/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum representing delivery modes.
 */
export enum DeliveryModes {
  Normal = 'normal',
  Notification = 'notification',
  ExpectReplies = 'expectReplies',
  Ephemeral = 'ephemeral',
}

/**
 * Zod schema for validating a DeliveryModes enum.
 */
export const deliveryModesZodSchema = z.enum(['normal', 'notification', 'expectReplies', 'ephemeral'])
