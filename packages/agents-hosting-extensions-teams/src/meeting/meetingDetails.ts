/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingDetailsBase } from './meetingDetailsBase'

/**
 * Interface representing the details of a meeting.
 */
export interface MeetingDetails extends MeetingDetailsBase {
  /** The Microsoft Graph resource ID of the meeting. */
  msGraphResourceId: string;
  /** The scheduled start time of the meeting. */
  scheduledStartTime?: Date;
  /** The scheduled end time of the meeting. */
  scheduledEndTime?: Date;
  /** The type of the meeting. */
  type: string;
}
