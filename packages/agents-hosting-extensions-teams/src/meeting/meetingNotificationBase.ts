/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface representing the base structure of a meeting notification.
 * @template T - The type of the value.
 */
export interface MeetingNotificationBase<T> {
  /** The type of the notification. */
  type: string;
  /** The value associated with the notification. */
  value: T;
}
