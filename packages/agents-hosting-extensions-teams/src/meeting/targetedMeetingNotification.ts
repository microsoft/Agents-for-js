/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingNotificationBase } from './meetingNotificationBase'
import { MeetingNotificationChannelData } from './meetingNotificationChannelData'
import { TargetedMeetingNotificationValue } from './targetedMeetingNotificationValue'

/**
 * Interface representing a targeted meeting notification.
 */
export interface TargetedMeetingNotification extends MeetingNotificationBase<TargetedMeetingNotificationValue> {
  /**
   * The type of the notification.
   */
  type: 'targetedMeetingNotification';

  /**
   * The channel data associated with the notification.
   */
  channelData?: MeetingNotificationChannelData;
}
