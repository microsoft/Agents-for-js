/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingDetailsBase } from './meetingDetailsBase'

/**
 * Represents the details of a meeting event.
 */
export interface MeetingEventDetails extends MeetingDetailsBase {
  /** The type of the meeting. */
  meetingType: string
}
