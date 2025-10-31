/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Error thrown when attempting to create an item that already exists in storage.
 */
export class ItemAlreadyExistsError extends Error {
  public readonly code: number = 409
}
