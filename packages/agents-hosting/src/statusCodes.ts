/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export enum StatusCodes {
  /**
   * The request has succeeded.
   */
  OK = 200,

  /**
   * The request has been fulfilled and resulted in a new resource being created.
   */
  CREATED = 201,

  /**
   * Indicates multiple options for the resource that the client may follow.
   */
  MULTIPLE_CHOICES = 300,

  /**
   * The server cannot or will not process the request due to a client error.
   */
  BAD_REQUEST = 400,

  /**
   * The request requires user authentication.
   */
  UNAUTHORIZED = 401,

  /**
   * The requested resource could not be found.
   */
  NOT_FOUND = 404,

  /**
   * The request method is not allowed for the requested resource.
   */
  METHOD_NOT_ALLOWED = 405,

  /**
   * The request could not be completed due to a conflict with the current state of the resource.
   */
  CONFLICT = 409,

  /**
   * The server does not meet one of the preconditions specified by the client.
   */
  PRECONDITION_FAILED = 412,

  /**
   * The client should switch to a different protocol.
   */
  UPGRADE_REQUIRED = 426,

  /**
   * The server encountered an unexpected condition that prevented it from fulfilling the request.
   */
  INTERNAL_SERVER_ERROR = 500,

  /**
   * The server does not support the functionality required to fulfill the request.
   */
  NOT_IMPLEMENTED = 501,

  /**
   * The server received an invalid response from the upstream server.
   */
  BAD_GATEWAY = 502,
}
