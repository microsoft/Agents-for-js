/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { BatchOperationResponse } from '../teams/batch-operations/batchOperationResponse'

export type TeamsBatchOperationResponse = BatchOperationResponse & {
  _response: Response & {
    bodyAsText: string;
    parsedBody: BatchOperationResponse | {};
  }
}
