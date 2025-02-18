/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingEventDetails } from './meetingEventDetails'

export interface MeetingEndEventDetails extends MeetingEventDetails {
  endTime: Date
}
