/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingNotificationRecipientFailureInfo } from '../teams/meeting/meetingNotificationRecipientFailureInfo'

export interface MeetingNotificationResponse {
  recipientsFailureInfo?: MeetingNotificationRecipientFailureInfo[];
}
