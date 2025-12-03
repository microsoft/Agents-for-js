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
    description: 'Invalid timestamp: must be an instance of Date',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when an empty key is provided.
   */
  EmptyKeyProvided: {
    code: -160001,
    description: 'Please provide a non-empty key',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  },

  /**
   * Error thrown when there is an eTag conflict during storage write.
   */
  ETagConflict: {
    code: -160002,
    description: 'Storage: error writing "{key}" due to eTag conflict.',
    helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#{errorCode}'
  }
}
