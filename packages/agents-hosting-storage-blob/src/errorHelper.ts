// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

/**
 * Error definitions for the Blob Storage system.
 * This contains localized error codes for the Blob Storage subsystem of the AgentSDK.
 *
 * Each error definition includes an error code (starting from -160000), a description, and a help link
 * pointing to an AKA link to get help for the given error.
 *
 * Usage example:
 * ```
 * throw ExceptionHelper.generateException(
 *   Error,
 *   Errors.InvalidTimestamp
 * );
 * ```
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  /**
   * Error thrown when timestamp is not a valid Date instance.
   */
  InvalidTimestamp: {
    code: -160000,
    description: 'Invalid timestamp: must be an instance of Date'
  },

  /**
   * Error thrown when an empty key is provided.
   */
  EmptyKeyProvided: {
    code: -160001,
    description: 'Please provide a non-empty key'
  },

  /**
   * Error thrown when there is an eTag conflict during storage write.
   */
  ETagConflict: {
    code: -160002,
    description: 'Storage: error writing "{key}" due to eTag conflict.'
  },

  /** Error thrown when an empty V2 storage version token is provided. */
  StorageV2ExpectedVersionEmpty: {
    code: -160003,
    description: 'Storage V2 expectedVersion cannot be empty.'
  },

  /** Error thrown when a V2 value is not a non-array object. */
  StorageV2ValueRequired: {
    code: -160004,
    description: 'Storage V2 values must be non-null, non-array objects.'
  },

  /** Error thrown when an Azure Blob V2 operation fails unexpectedly. */
  StorageV2OperationFailed: {
    code: -160005,
    description: 'Blob Storage V2 {operation} failed for key "{key}".'
  },

  /** Error thrown when a V2 storage key is empty or whitespace. */
  StorageV2KeyRequired: {
    code: -160006,
    description: 'Storage V2 keys must be non-empty strings.'
  },

  /** Error thrown when a V2 write mode is not supported. */
  StorageV2WriteModeUnsupported: {
    code: -160007,
    description: 'Storage V2 write mode "{mode}" is not supported.'
  },

  /** Error thrown when a built-in storage version is not supported. */
  UnsupportedStorageVersion: {
    code: -160008,
    description: 'Storage version "{storageVersion}" is not supported.'
  },

  /** Error thrown when V2 write changes are missing or invalid. */
  StorageV2ChangesRequired: {
    code: -160009,
    description: 'Storage V2 changes must be an object.'
  },

  /** Error thrown when the V2 key collection is missing or invalid. */
  StorageV2KeysRequired: {
    code: -160010,
    description: 'Storage V2 keys must be an array.'
  }
}
