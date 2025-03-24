/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a failed entry in a batch operation.
 */
export interface BatchFailedEntry {
  /**
   * Unique identifier of the failed entry.
   */
  id: string;
  /**
   * Error message associated with the failed entry.
   */
  error: string;
}
