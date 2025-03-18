/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { BatchOperationResponse } from './batchOperationResponse'

/**
 * Represents a response from a batch operation in Teams.
 */
export type TeamsBatchOperationResponse = BatchOperationResponse & {
  /**
   * The raw response object.
   */
  _response: Response & {
    /**
     * The response body as text.
     */
    bodyAsText: string;
    /**
     * The parsed response body.
     */
    parsedBody: BatchOperationResponse | {};
  }
}
