// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents an error definition for the Agents SDK.
 * Each error definition includes an error code, description, and help link.
 */
export interface AgentErrorDefinition {
  /**
   * Error code for the exception
   */
  code: number

  /**
   * Displayed error message
   */
  description: string

  /**
   * Help URL link for the error
   */
  helplink: string
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
  static generateException<T extends Error> (
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
