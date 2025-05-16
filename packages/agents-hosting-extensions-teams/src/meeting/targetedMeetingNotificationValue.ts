/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingSurface } from './meetingSurface'

/**
 * Interface representing the value of a targeted meeting notification.
 */
export interface TargetedMeetingNotificationValue {
  /**
   * The recipients of the notification.
   */
  recipients: string[];

  /**
   * The surfaces where the notification will be displayed.
   */
  surfaces: MeetingSurface[];
}
