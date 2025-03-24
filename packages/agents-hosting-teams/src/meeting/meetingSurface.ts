/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MeetingStageSurface } from './meetingStageSurface'
import { MeetingTabIconSurface } from './meetingTabIconSurface'

/**
 * Type representing a meeting surface, which can be either a stage surface or a tab icon surface.
 */
export type MeetingSurface = MeetingStageSurface<any> | MeetingTabIconSurface
