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
 * Enhanced error type with additional properties for error code, help link, and inner exception.
 * This interface extends the standard Error type with custom properties added by ExceptionHelper.
 */
export interface AgentError extends Error {
  /**
   * Error code for the exception
   */
  code: number

  /**
   * Help URL link for the error
   */
  helpLink: string

  /**
   * Optional inner exception
   */
  innerException?: Error
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
   * @param params Optional parameters object for message formatting with key-value pairs
   * @returns A new exception instance with error code and help link, typed as AgentError
   */
  static generateException<T extends Error> (
    ErrorType: new (message: string, innerException?: Error) => T,
    errorDefinition: AgentErrorDefinition,
    innerException?: Error,
    params?: { [key: string]: string }
  ): T & AgentError {
    // Format the message with parameters if provided
    let message = errorDefinition.description
    if (params) {
      Object.keys(params).forEach((key) => {
        message = message.replace(`{${key}}`, params[key])
      })
    }

    // Create the exception
    const exception = new ErrorType(message) as T & AgentError

    // Set error code and help link as custom properties
    exception.code = errorDefinition.code
    exception.helpLink = errorDefinition.helplink

    // Store inner exception as a custom property if provided
    if (innerException) {
      exception.innerException = innerException
    }

    return exception
  }
}
