/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export interface BatchOperationStateResponse {
  state: string;
  statusMap: Record<number, number>;
  retryAfter?: Date;
  totalEntriesCount: number;
}
