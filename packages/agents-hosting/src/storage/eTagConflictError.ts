/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Error thrown when there is an eTag conflict during a storage operation.
 */
export class ETagConflictError extends Error {
  public readonly code: number = 412
}
