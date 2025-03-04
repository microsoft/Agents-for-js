/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingNotificationRecipientFailureInfo } from '../meeting/meetingNotificationRecipientFailureInfo'

/**
 * Represents a response to a meeting notification.
 */
export interface MeetingNotificationResponse {
  /**
   * Information about recipients who failed to receive the notification.
   */
  recipientsFailureInfo?: MeetingNotificationRecipientFailureInfo[];
}
