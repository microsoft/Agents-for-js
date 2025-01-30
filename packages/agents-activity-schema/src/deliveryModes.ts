/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export enum DeliveryModes {
  Normal = 'normal',
  Notification = 'notification',
  ExpectReplies = 'expectReplies',
  Ephemeral = 'ephemeral',
}

export const deliveryModesZodSchema = z.enum(['normal', 'notification', 'expectReplies', 'ephemeral'])
