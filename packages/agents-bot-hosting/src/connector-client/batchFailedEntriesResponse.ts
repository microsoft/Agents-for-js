/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { BatchFailedEntry } from '../teams/batch-operations/batchFailedEntry'

export interface BatchFailedEntriesResponse {
  continuationToken: string;
  failedEntryResponses: BatchFailedEntry[];
}
