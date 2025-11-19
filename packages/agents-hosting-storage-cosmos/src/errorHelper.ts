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
    description: 'CosmosDbPartitionedStorageOptions is required. Provide a valid configuration object with cosmosClientOptions, databaseId, and containerId properties when initializing CosmosDbPartitionedStorage.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when endpoint in cosmosClientOptions is not provided.
   */
  MissingCosmosEndpoint: {
    code: -100001,
    description: 'The endpoint property in cosmosClientOptions is required. Provide your Cosmos DB account endpoint URL (e.g., https://your-account.documents.azure.com:443/).',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when neither key nor tokenProvider is provided in cosmosClientOptions.
   */
  MissingCosmosCredentials: {
    code: -100002,
    description: 'Authentication credentials are required in cosmosClientOptions. Provide either a key (connection key) or tokenProvider (for token-based authentication).',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when databaseId is not provided.
   */
  MissingDatabaseId: {
    code: -100003,
    description: 'The databaseId property is required in CosmosDbPartitionedStorageOptions. Specify the name of the Cosmos DB database to use for storage.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when containerId is not provided.
   */
  MissingContainerId: {
    code: -100004,
    description: 'The containerId property is required in CosmosDbPartitionedStorageOptions. Specify the name of the Cosmos DB container to use for storage.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when compatibilityMode is enabled with a keySuffix.
   */
  InvalidCompatibilityModeWithKeySuffix: {
    code: -100005,
    description: 'Configuration conflict: compatibilityMode cannot be enabled (true) when using a keySuffix. Either disable compatibilityMode or remove the keySuffix from your configuration.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when keySuffix contains invalid Row Key characters.
   */
  InvalidKeySuffixCharacters: {
    code: -100006,
    description: 'The keySuffix "{keySuffix}" contains invalid characters. Keys cannot contain: \\, ?, /, #, tab, newline, carriage return, or *. Please remove these characters from your keySuffix configuration.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when keys are not provided for reading.
   */
  MissingReadKeys: {
    code: -100007,
    description: 'The keys parameter is required when calling read(). Provide an array of storage keys to read.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when changes are not provided for writing.
   */
  MissingWriteChanges: {
    code: -100008,
    description: 'The changes parameter is required when calling write(). Provide a StoreItems object containing the data to write.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when attempting to use a custom partition key path.
   */
  UnsupportedCustomPartitionKeyPath: {
    code: -100009,
    description: 'The container "{containerId}" uses a custom partition key path "{partitionKeyPath}", which is not supported. This storage implementation requires containers to use either "/id" as the partition key path or no partition key (for compatibility mode). Create a new container with the correct partition key configuration.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when the specified container is not found.
   */
  ContainerNotFound: {
    code: -100010,
    description: 'The Cosmos DB container "{containerId}" was not found and could not be created. Verify the container exists or ensure the client has permissions to create it. If using compatibilityMode, the container must already exist.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when the key parameter is missing in CosmosDbKeyEscape.
   */
  MissingKeyParameter: {
    code: -100011,
    description: 'The key parameter is required and cannot be null or empty. Provide a valid storage key string.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when there is an error reading from the container (404 Not Found).
   */
  ContainerReadNotFound: {
    code: -100012,
    description: 'The requested item was not found in the Cosmos DB container. This is typically not an error during read operations.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when there is an error reading from container (400 Bad Request).
   */
  ContainerReadBadRequest: {
    code: -100013,
    description: 'Bad request error while reading from the Cosmos DB container. This usually indicates a configuration mismatch: the container may be non-partitioned or uses a partition key path other than "/id". Verify your container\'s partition key configuration matches the storage implementation requirements.',
    description: 'Error reading from container. You might be attempting to read from a non-partitioned container or a container that does not use \'/id\' as the partitionKeyPath',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when there is a general error reading from the container.
   */
  ContainerReadError: {
    code: -100014,
    description: 'An unexpected error occurred while reading from the Cosmos DB container. Check the inner exception for details about the specific error.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when there is an error upserting a document.
   */
  DocumentUpsertError: {
    code: -100015,
    description: 'Failed to upsert (insert or update) a document in the Cosmos DB container. This may be due to concurrency conflicts, permission issues, or data size limits. Check the inner exception for specific details.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when there is an error deleting a document (404 Not Found).
   */
  DocumentDeleteNotFound: {
    code: -100016,
    description: 'The document to delete was not found in the Cosmos DB container. This is typically not an error during delete operations.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when unable to delete a document.
   */
  DocumentDeleteError: {
    code: -100017,
    description: 'Failed to delete a document from the Cosmos DB container. This may be due to permission issues or network problems. Check the inner exception for specific details.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when failing to initialize CosmosDB database/container.
   */
  InitializationError: {
    code: -100018,
    description: 'Failed to initialize the Cosmos DB database "{databaseId}" and container "{containerId}". Verify your connection credentials, ensure the account exists, and check that the client has appropriate permissions. See the inner exception for specific error details.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when maximum nesting depth is exceeded.
   */
  MaxNestingDepthExceeded: {
    code: -100019,
    description: 'The data structure exceeds the maximum nesting depth of {maxDepth} levels. {additionalMessage} This limit is imposed to prevent stack overflow errors when storing deeply nested objects in Cosmos DB.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  }
}
