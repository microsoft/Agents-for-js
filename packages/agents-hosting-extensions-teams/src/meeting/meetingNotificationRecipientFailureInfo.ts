/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing the failure information of a meeting notification recipient.
 */
export interface MeetingNotificationRecipientFailureInfo {
  /** The recipient's MRI (Microsoft Resource Identifier). */
  recipientMri: string;
  /** The reason for the failure. */
  failureReason: string;
  /** The error code associated with the failure. */
  errorCode: string;
}
