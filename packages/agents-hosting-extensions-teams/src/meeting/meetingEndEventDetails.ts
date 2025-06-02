/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingEventDetails } from './meetingEventDetails'

/**
 * Interface representing the details of a meeting end event.
 */
export interface MeetingEndEventDetails extends MeetingEventDetails {
  /** The end time of the meeting. */
  endTime: Date
}
