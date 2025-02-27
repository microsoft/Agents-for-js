/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing a meeting.
 */
export interface Meeting {
  /** The role of the participant in the meeting. */
  role?: string;
  /** Indicates whether the participant is currently in the meeting. */
  inMeeting?: boolean;
}
