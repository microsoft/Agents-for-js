/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the state of a batch operation.
 */
export interface BatchOperationStateResponse {
  /**
   * The state of the batch operation.
   */
  state: string;
  /**
   * A map of status codes to their counts.
   */
  statusMap: Record<number, number>;
  /**
   * The retry-after date for the batch operation.
   */
  retryAfter?: Date;
  /**
   * The total number of entries in the batch operation.
   */
  totalEntriesCount: number;
}
