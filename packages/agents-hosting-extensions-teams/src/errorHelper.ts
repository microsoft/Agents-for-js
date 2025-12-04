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
 *   Errors.ContextRequired
 * );
 * ```
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  // TeamsInfo Errors (-150000 to -150025)
  /**
   * Error thrown when context is required but not provided.
   */
  ContextRequired: {
    code: -150000,
    description: 'context is required.'
  },

  /**
   * Error thrown when meetingId is required but not provided.
   */
  MeetingIdRequired: {
    code: -150001,
    description: 'meetingId is required.'
  },

  /**
   * Error thrown when participantId is required but not provided.
   */
  ParticipantIdRequired: {
    code: -150002,
    description: 'participantId is required.'
  },

  /**
   * Error thrown when teamId is required but not provided.
   */
  TeamIdRequired: {
    code: -150003,
    description: 'teamId is required.'
  },

  /**
   * Error thrown when TurnContext cannot be null.
   */
  TurnContextCannotBeNull: {
    code: -150004,
    description: 'TurnContext cannot be null'
  },

  /**
   * Error thrown when Activity cannot be null.
   */
  ActivityCannotBeNull: {
    code: -150005,
    description: 'Activity cannot be null'
  },

  /**
   * Error thrown when teamsChannelId cannot be null or empty.
   */
  TeamsChannelIdRequired: {
    code: -150006,
    description: 'The teamsChannelId cannot be null or empty'
  },

  /**
   * Error thrown when activity is required but not provided.
   */
  ActivityRequired: {
    code: -150007,
    description: 'activity is required.'
  },

  /**
   * Error thrown when tenantId is required but not provided.
   */
  TenantIdRequired: {
    code: -150008,
    description: 'tenantId is required.'
  },

  /**
   * Error thrown when members list is required but not provided.
   */
  MembersListRequired: {
    code: -150009,
    description: 'members list is required.'
  },

  /**
   * Error thrown when operationId is required but not provided.
   */
  OperationIdRequired: {
    code: -150010,
    description: 'operationId is required.'
  },

  // TeamsConnectorClient Errors (-150011 to -150014)
  /**
   * Error thrown when activity parameter is missing.
   */
  MissingActivityParameter: {
    code: -150011,
    description: 'Missing activity parameter'
  },

  /**
   * Error thrown when method is only valid within MS Teams Team scope.
   */
  OnlyValidInTeamsScope: {
    code: -150012,
    description: 'This method is only valid within the scope of a MS Teams Team.'
  },

  /**
   * Error thrown when userId is required but not provided.
   */
  UserIdRequired: {
    code: -150013,
    description: 'userId is required'
  },

  /**
   * Error thrown when conversationId is required but not provided.
   */
  ConversationIdRequired: {
    code: -150014,
    description: 'conversationId is required'
  },

  /**
   * Error thrown when client is not available in the context.
   */
  ClientNotAvailable: {
    code: -150015,
    description: 'Client is not available in the context.'
  },

  // TaskModule Errors (-150016)
  /**
   * Error thrown when unexpected TaskModules.submit() is triggered.
   */
  UnexpectedTaskModuleSubmit: {
    code: -150016,
    description: 'Unexpected TaskModules.submit() triggered for activity type: {activityType}'
  },

  // TeamsActivityHandler Errors (-150017 to -150018)
  /**
   * Error thrown when method is not implemented.
   */
  NotImplemented: {
    code: -150017,
    description: 'NotImplemented'
  },

  /**
   * Error thrown for bad request.
   */
  BadRequest: {
    code: -150018,
    description: 'BadRequest'
  }
}
