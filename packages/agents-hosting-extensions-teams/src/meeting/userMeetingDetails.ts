/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing the details of a user's meeting.
 */
export interface UserMeetingDetails {
  /**
   * Indicates if the user is currently in a meeting.
   */
  inMeeting: boolean;

  /**
   * The role of the user in the meeting.
   */
  role: string;
}
