// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents an error definition for the Agents SDK.
 * Each error definition includes an error code, description, and help link.
 */
export class AgentErrorDefinition {
  /**
   * Error code for the exception
   */
  readonly code: number

  /**
   * Displayed error message
   */
  readonly description: string

  /**
   * Help URL link for the error
   */
  readonly helplink: string

  /**
   * Creates a new AgentErrorDefinition instance.
   * @param code Error code for the exception
   * @param description Displayed error message
   * @param helplink Help URL link for the error
   */
  constructor (code: number, description: string, helplink: string) {
    this.code = code
    this.description = description
    this.helplink = helplink
  }
}

/**
 * Error helper for the CosmosDB storage system.
 * This is used to define localized error codes for the CosmosDB storage subsystem of the AgentSDK.
 *
 * Each error should be created as an AgentErrorDefinition and added to the ErrorHelper class.
 * Each definition should include an error code (starting from -100000), a description, and a help link
 * pointing to an AKA link to get help for the given error.
 *
 * Usage example:
 * ```
 * throw new ReferenceError(ErrorHelper.MissingCosmosDbStorageOptions.description) {
 *   code: ErrorHelper.MissingCosmosDbStorageOptions.code,
 *   // Note: In JavaScript, we use a custom property 'code' instead of HResult
 * };
 * ```
 */
export class ErrorHelper {
  // Base error code for CosmosDB storage: -100000

  /**
   * Error thrown when CosmosDbPartitionedStorageOptions is not provided.
   */
  static readonly MissingCosmosDbStorageOptions = new AgentErrorDefinition(
    -100000,
    'CosmosDbPartitionedStorageOptions is required.',
    'https://aka.ms/M365AgentsErrorCodes/#-100000'
  )

  /**
   * Error thrown when endpoint in cosmosClientOptions is not provided.
   */
  static readonly MissingCosmosEndpoint = new AgentErrorDefinition(
    -100001,
    'endpoint in cosmosClientOptions is required.',
    'https://aka.ms/M365AgentsErrorCodes/#-100001'
  )

  /**
   * Error thrown when neither key nor tokenProvider is provided in cosmosClientOptions.
   */
  static readonly MissingCosmosCredentials = new AgentErrorDefinition(
    -100002,
    'key or tokenProvider in cosmosClientOptions is required.',
    'https://aka.ms/M365AgentsErrorCodes/#-100002'
  )

  /**
   * Error thrown when databaseId is not provided.
   */
  static readonly MissingDatabaseId = new AgentErrorDefinition(
    -100003,
    'databaseId for CosmosDB is required.',
    'https://aka.ms/M365AgentsErrorCodes/#-100003'
  )

  /**
   * Error thrown when containerId is not provided.
   */
  static readonly MissingContainerId = new AgentErrorDefinition(
    -100004,
    'containerId for CosmosDB is required.',
    'https://aka.ms/M365AgentsErrorCodes/#-100004'
  )

  /**
   * Error thrown when compatibilityMode is enabled with a keySuffix.
   */
  static readonly InvalidCompatibilityModeWithKeySuffix = new AgentErrorDefinition(
    -100005,
    'compatibilityMode cannot be true while using a keySuffix.',
    'https://aka.ms/M365AgentsErrorCodes/#-100005'
  )

  /**
   * Error thrown when keySuffix contains invalid Row Key characters.
   */
  static readonly InvalidKeySuffixCharacters = new AgentErrorDefinition(
    -100006,
    'Cannot use invalid Row Key characters: {0} in keySuffix',
    'https://aka.ms/M365AgentsErrorCodes/#-100006'
  )

  /**
   * Error thrown when keys are not provided for reading.
   */
  static readonly MissingReadKeys = new AgentErrorDefinition(
    -100007,
    'Keys are required when reading.',
    'https://aka.ms/M365AgentsErrorCodes/#-100007'
  )

  /**
   * Error thrown when changes are not provided for writing.
   */
  static readonly MissingWriteChanges = new AgentErrorDefinition(
    -100008,
    'Changes are required when writing.',
    'https://aka.ms/M365AgentsErrorCodes/#-100008'
  )

  /**
   * Error thrown when attempting to use a custom partition key path.
   */
  static readonly UnsupportedCustomPartitionKeyPath = new AgentErrorDefinition(
    -100009,
    'Custom Partition Key Paths are not supported. {0} has a custom Partition Key Path of {1}.',
    'https://aka.ms/M365AgentsErrorCodes/#-100009'
  )

  /**
   * Error thrown when the specified container is not found.
   */
  static readonly ContainerNotFound = new AgentErrorDefinition(
    -100010,
    'Container {0} not found.',
    'https://aka.ms/M365AgentsErrorCodes/#-100010'
  )

  /**
   * Error thrown when the key parameter is missing in CosmosDbKeyEscape.
   */
  static readonly MissingKeyParameter = new AgentErrorDefinition(
    -100011,
    "The 'key' parameter is required.",
    'https://aka.ms/M365AgentsErrorCodes/#-100011'
  )

  /**
   * Error thrown when there is an error reading from the container (404 Not Found).
   */
  static readonly ContainerReadNotFound = new AgentErrorDefinition(
    -100012,
    'Not Found',
    'https://aka.ms/M365AgentsErrorCodes/#-100012'
  )

  /**
   * Error thrown when there is an error reading from container (400 Bad Request).
   */
  static readonly ContainerReadBadRequest = new AgentErrorDefinition(
    -100013,
    'Error reading from container. You might be attempting to read from a non-partitioned container or a container that does not use \'/id\' as the partitionKeyPath',
    'https://aka.ms/M365AgentsErrorCodes/#-100013'
  )

  /**
   * Error thrown when there is a general error reading from the container.
   */
  static readonly ContainerReadError = new AgentErrorDefinition(
    -100014,
    'Error reading from container',
    'https://aka.ms/M365AgentsErrorCodes/#-100014'
  )

  /**
   * Error thrown when there is an error upserting a document.
   */
  static readonly DocumentUpsertError = new AgentErrorDefinition(
    -100015,
    'Error upserting document',
    'https://aka.ms/M365AgentsErrorCodes/#-100015'
  )

  /**
   * Error thrown when there is an error deleting a document (404 Not Found).
   */
  static readonly DocumentDeleteNotFound = new AgentErrorDefinition(
    -100016,
    'Not Found',
    'https://aka.ms/M365AgentsErrorCodes/#-100016'
  )

  /**
   * Error thrown when unable to delete a document.
   */
  static readonly DocumentDeleteError = new AgentErrorDefinition(
    -100017,
    'Unable to delete document',
    'https://aka.ms/M365AgentsErrorCodes/#-100017'
  )

  /**
   * Error thrown when failing to initialize CosmosDB database/container.
   */
  static readonly InitializationError = new AgentErrorDefinition(
    -100018,
    'Failed to initialize Cosmos DB database/container: {0}/{1}',
    'https://aka.ms/M365AgentsErrorCodes/#-100018'
  )

  /**
   * Error thrown when maximum nesting depth is exceeded.
   */
  static readonly MaxNestingDepthExceeded = new AgentErrorDefinition(
    -100019,
    'Maximum nesting depth of {0} exceeded. {1}',
    'https://aka.ms/M365AgentsErrorCodes/#-100019'
  )
}

/**
 * Helper class for generating exceptions with error codes.
 */
export class ExceptionHelper {
  /**
   * Generates a typed exception with error code and help link.
   * @param ErrorType The constructor of the error type to create
   * @param errorDefinition The error definition containing code, description, and help link
   * @param innerException Optional inner exception
   * @param messageFormat Optional format parameters for the error message
   * @returns A new exception instance with error code and help link
   */
  static generateException<T extends Error>(
    ErrorType: new (message: string, innerException?: Error) => T,
    errorDefinition: AgentErrorDefinition,
    innerException?: Error,
    ...messageFormat: string[]
  ): T {
    // Format the message with parameters if provided
    let message = errorDefinition.description
    if (messageFormat.length > 0) {
      messageFormat.forEach((param, index) => {
        message = message.replace(`{${index}}`, param)
      })
    }

    // Create the exception
    const exception = new ErrorType(message)

    // Set error code and help link as custom properties
    const exceptionWithProps = exception as any
    exceptionWithProps.code = errorDefinition.code
    exceptionWithProps.helpLink = errorDefinition.helplink

    // Store inner exception as a custom property if provided
    if (innerException) {
      exceptionWithProps.innerException = innerException
    }

    return exception
  }
}
