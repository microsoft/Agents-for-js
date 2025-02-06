/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingNotificationBase } from './meetingNotificationBase'
import { MeetingNotificationChannelData } from './meetingNotificationChannelData'
import { TargetedMeetingNotificationValue } from './targetedMeetingNotificationValue'

export interface TargetedMeetingNotification extends MeetingNotificationBase<TargetedMeetingNotificationValue> {
  type: 'targetedMeetingNotification';
  channelData?: MeetingNotificationChannelData;
}
