/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingDetailsBase } from './meetingDetailsBase'

export interface MeetingDetails extends MeetingDetailsBase {
  msGraphResourceId: string;
  scheduledStartTime?: Date;
  scheduledEndTime?: Date;
  type: string;
}
