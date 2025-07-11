/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingEventDetails } from './meetingEventDetails'

/**
 * Represents the details of a meeting start event.
 */
export interface MeetingStartEventDetails extends MeetingEventDetails {
  /**
   * The start time of the meeting.
   */
  startTime: Date
}
