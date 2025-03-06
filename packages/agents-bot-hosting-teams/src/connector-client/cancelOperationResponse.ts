/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the response from a cancel operation.
 */
export type CancelOperationResponse = {
  /**
   * The response object.
   */
  _response: Response & {
    /**
     * The response body as text.
     */
    bodyAsText: string;
    /**
     * The parsed response body.
     */
    parsedBody: {};
  };
}
