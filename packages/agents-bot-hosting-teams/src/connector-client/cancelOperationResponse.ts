/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type CancelOperationResponse = {
  _response: Response & {
    bodyAsText: string;
    parsedBody: {};
  };
}
