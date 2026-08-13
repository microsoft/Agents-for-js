// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

/**
 * Error definitions for the Teams Extensions system.
 * This contains localized error codes for the Teams Extensions subsystem of the AgentSDK.
 *
 * Each error definition includes an error code (starting from -150000), a description, and a help link
 * pointing to an AKA link to get help for the given error.
 *
 * Usage example:
 * ```
 * throw ExceptionHelper.generateException(
 *   Error,
 *   Errors.TeamsApiClientNotAvailable
 * );
 * ```
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  // Teams Graph Errors (-150012 to -150015, -150017 to -150019)
  /**
   * Error thrown when a Graph authorization handler returns an empty token.
   */
  TeamsGraphTokenUnavailable: {
    code: -150012,
    description: 'Unable to acquire a Graph access token using authorization handler {handlerName}.'
  },

  /**
   * Error thrown when no Graph authorization handlers are configured.
   */
  TeamsGraphAuthorizationHandlerRequired: {
    code: -150013,
    description: 'A Graph client requires at least one configured authorization handler.'
  },

  /**
   * Error thrown when multiple Graph authorization handlers are configured and no handler name is provided.
   */
  TeamsGraphAuthorizationHandlerNameRequired: {
    code: -150014,
    description: 'A Graph client requires handlerName when multiple authorization handlers are configured.'
  },

  /**
   * Error thrown when a required Graph client parameter is missing.
   */
  TeamsGraphParameterRequired: {
    code: -150015,
    description: 'The {parameterName} parameter is required to create a Graph client.'
  },

  /**
   * Error thrown when the Graph base URL is invalid.
   */
  TeamsGraphInvalidBaseUrl: {
    code: -150017,
    description: 'The graphBaseUrl parameter must be a valid absolute URL.'
  },

  /**
   * Error thrown when user authorization is unavailable from the current turn.
   */
  TeamsGraphUserAuthorizationNotConfigured: {
    code: -150018,
    description: 'User authorization is not configured on the AgentApplication. A delegated Graph client requires configured user authorization.'
  },

  /**
   * Error thrown when token connections are unavailable.
   */
  TeamsGraphConnectionsNotConfigured: {
    code: -150019,
    description: 'Connections are not configured on the AgentApplication. An app-only Graph client requires a configured token connection.'
  },

  // TaskModule Errors (-150016)
  /**
   * Error thrown when unexpected TaskModules.submit() is triggered.
   */
  UnexpectedTaskModuleSubmit: {
    code: -150016,
    description: 'Unexpected TaskModules.submit() triggered for activity type: {activityType}'
  },

  // TeamsApiClient Errors (-150010 to -150011)
  /**
   * Error thrown when the Teams SDK client is not available in the context.
   */
  TeamsApiClientNotAvailable: {
    code: -150010,
    description: 'Teams API client is not available in the context. Add TeamsAgentExtension to populate it before use.'
  },

  /**
   * Error thrown when Teams API client prerequisites are missing for Teams activities.
   */
  TeamsApiClientSetupFailed: {
    code: -150011,
    description: 'Teams API client setup failed: missing {missing}.'
  }
}
