/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing the base details of a meeting.
 */
export interface MeetingDetailsBase {
  /** The unique identifier of the meeting. */
  id: string
  /** The URL to join the meeting. */
  joinUrl: string
  /** The title of the meeting. */
  title: string
}
