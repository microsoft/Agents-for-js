// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

/**
 * Error definitions for the CosmosDB storage system.
 * This contains localized error codes for the CosmosDB storage subsystem of the AgentSDK.
 *
 * Each error definition includes an error code (starting from -100000), a description, and a help link
 * pointing to an AKA link to get help for the given error.
 *
 * Usage example:
 * ```
 * throw ExceptionHelper.generateException(
 *   ReferenceError,
 *   Errors.MissingCosmosDbStorageOptions
 * );
 * ```
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  /**
   * Error thrown when CosmosDbPartitionedStorageOptions is not provided.
   */
  MissingCosmosDbStorageOptions: {
    code: -100000,
    description: 'CosmosDbPartitionedStorageOptions is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100000'
  },

  /**
   * Error thrown when endpoint in cosmosClientOptions is not provided.
   */
  MissingCosmosEndpoint: {
    code: -100001,
    description: 'endpoint in cosmosClientOptions is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100001'
  },

  /**
   * Error thrown when neither key nor tokenProvider is provided in cosmosClientOptions.
   */
  MissingCosmosCredentials: {
    code: -100002,
    description: 'key or tokenProvider in cosmosClientOptions is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100002'
  },

  /**
   * Error thrown when databaseId is not provided.
   */
  MissingDatabaseId: {
    code: -100003,
    description: 'databaseId for CosmosDB is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100003'
  },

  /**
   * Error thrown when containerId is not provided.
   */
  MissingContainerId: {
    code: -100004,
    description: 'containerId for CosmosDB is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100004'
  },

  /**
   * Error thrown when compatibilityMode is enabled with a keySuffix.
   */
  InvalidCompatibilityModeWithKeySuffix: {
    code: -100005,
    description: 'compatibilityMode cannot be true while using a keySuffix.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100005'
  },

  /**
   * Error thrown when keySuffix contains invalid Row Key characters.
   */
  InvalidKeySuffixCharacters: {
    code: -100006,
    description: 'Cannot use invalid Row Key characters: {keySuffix} in keySuffix',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100006'
  },

  /**
   * Error thrown when keys are not provided for reading.
   */
  MissingReadKeys: {
    code: -100007,
    description: 'Keys are required when reading.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100007'
  },

  /**
   * Error thrown when changes are not provided for writing.
   */
  MissingWriteChanges: {
    code: -100008,
    description: 'Changes are required when writing.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100008'
  },

  /**
   * Error thrown when attempting to use a custom partition key path.
   */
  UnsupportedCustomPartitionKeyPath: {
    code: -100009,
    description: 'Custom Partition Key Paths are not supported. {containerId} has a custom Partition Key Path of {partitionKeyPath}.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100009'
  },

  /**
   * Error thrown when the specified container is not found.
   */
  ContainerNotFound: {
    code: -100010,
    description: 'Container {containerId} not found.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100010'
  },

  /**
   * Error thrown when the key parameter is missing in CosmosDbKeyEscape.
   */
  MissingKeyParameter: {
    code: -100011,
    description: "The 'key' parameter is required.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100011'
  },

  /**
   * Error thrown when there is an error reading from the container (404 Not Found).
   */
  ContainerReadNotFound: {
    code: -100012,
    description: 'Not Found',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100012'
  },

  /**
   * Error thrown when there is an error reading from container (400 Bad Request).
   */
  ContainerReadBadRequest: {
    code: -100013,
    description: 'Error reading from container. You might be attempting to read from a non-partitioned container or a container that does not use \'/id\' as the partitionKeyPath',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100013'
  },

  /**
   * Error thrown when there is a general error reading from the container.
   */
  ContainerReadError: {
    code: -100014,
    description: 'Error reading from container',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100014'
  },

  /**
   * Error thrown when there is an error upserting a document.
   */
  DocumentUpsertError: {
    code: -100015,
    description: 'Error upserting document',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100015'
  },

  /**
   * Error thrown when there is an error deleting a document (404 Not Found).
   */
  DocumentDeleteNotFound: {
    code: -100016,
    description: 'Not Found',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100016'
  },

  /**
   * Error thrown when unable to delete a document.
   */
  DocumentDeleteError: {
    code: -100017,
    description: 'Unable to delete document',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100017'
  },

  /**
   * Error thrown when failing to initialize CosmosDB database/container.
   */
  InitializationError: {
    code: -100018,
    description: 'Failed to initialize Cosmos DB database/container: {databaseId}/{containerId}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100018'
  },

  /**
   * Error thrown when maximum nesting depth is exceeded.
   */
  MaxNestingDepthExceeded: {
    code: -100019,
    description: 'Maximum nesting depth of {maxDepth} exceeded. {additionalMessage}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#-100019'
  }
}
