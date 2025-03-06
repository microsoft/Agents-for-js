/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { BatchFailedEntry } from './batchFailedEntry'

/**
 * Represents the response for failed entries in a batch operation.
 */
export interface BatchFailedEntriesResponse {
  /**
   * A token to retrieve the next page of results.
   */
  continuationToken: string;
  /**
   * A list of failed entry responses.
   */
  failedEntryResponses: BatchFailedEntry[];
}
