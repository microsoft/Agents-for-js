/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { OnBehalfOf } from '../activity-extensions/onBehalfOf'

/**
 * Represents the channel data for a meeting notification.
 */
export interface MeetingNotificationChannelData {
  /** Optional list of entities on behalf of whom the notification is sent. */
  onBehalfOf?: OnBehalfOf[];
}
