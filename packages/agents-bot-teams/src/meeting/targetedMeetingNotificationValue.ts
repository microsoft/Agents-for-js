/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingSurface } from './meetingSurface'

export interface TargetedMeetingNotificationValue {
  recipients: string[];
  surfaces: MeetingSurface[];
}
