/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingStageSurface } from './meetingStageSurface'
import { MeetingTabIconSurface } from './meetingTabIconSurface'

export type MeetingSurface = MeetingStageSurface<any> | MeetingTabIconSurface
