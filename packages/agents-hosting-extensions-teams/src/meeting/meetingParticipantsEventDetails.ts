/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsMeetingMember } from './teamsMeetingMember'

/**
 * Represents the details of a meeting participants event.
 */
export interface MeetingParticipantsEventDetails {
  /** The list of members participating in the meeting. */
  members: TeamsMeetingMember[]
}
