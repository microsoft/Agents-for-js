/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingDetailsBase } from './meetingDetailsBase'

export interface MeetingEventDetails extends MeetingDetailsBase {
  meetingType: string
}
