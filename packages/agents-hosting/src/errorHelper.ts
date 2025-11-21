// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity'

/**
 * Error definitions for the Hosting system.
 * This contains localized error codes for the Hosting subsystem of the AgentSDK.
 *
 * Each error definition includes an error code (starting from -120000), a description, and a help link
 * pointing to an AKA link to get help for the given error.
 *
 * Usage example:
 * ```
 * throw ExceptionHelper.generateException(
 *   Error,
 *   Errors.MissingTurnContext
 * );
 * ```
 */
export const Errors: { [key: string]: AgentErrorDefinition } = {
  // Activity Handler Errors (-120000 to -120019)
  /**
   * Error thrown when TurnContext parameter is missing.
   */
  MissingTurnContext: {
    code: -120000,
    description: 'Missing TurnContext parameter',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when TurnContext does not include an activity.
   */
  TurnContextMissingActivity: {
    code: -120001,
    description: 'TurnContext does not include an activity',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Activity is missing its type.
   */
  ActivityMissingType: {
    code: -120002,
    description: 'Activity is missing its type',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when activity object is invalid.
   */
  InvalidActivityObject: {
    code: -120003,
    description: 'Invalid activity object',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Activity is required.
   */
  ActivityRequired: {
    code: -120004,
    description: 'Activity is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Cloud Adapter Errors (-120020 to -120039)
  /**
   * Error thrown when activity parameter is required.
   */
  ActivityParameterRequired: {
    code: -120020,
    description: '`activity` parameter required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when context parameter is required.
   */
  ContextParameterRequired: {
    code: -120021,
    description: '`context` parameter required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when activities parameter is required.
   */
  ActivitiesParameterRequired: {
    code: -120022,
    description: '`activities` parameter required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when expecting one or more activities, but the array was empty.
   */
  EmptyActivitiesArray: {
    code: -120023,
    description: 'Expecting one or more activities, but the array was empty.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when request.body parameter is required.
   */
  RequestBodyRequired: {
    code: -120024,
    description: '`request.body` parameter required, make sure express.json() is used as middleware',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when conversation reference object is invalid.
   */
  InvalidConversationReference: {
    code: -120025,
    description: 'Invalid conversation reference object',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when continueConversation has invalid conversation reference object.
   */
  ContinueConversationInvalidReference: {
    code: -120026,
    description: 'continueConversation: Invalid conversation reference object',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when continueConversation requires botAppIdOrIdentity.
   */
  ContinueConversationBotAppIdRequired: {
    code: -120027,
    description: 'continueConversation: botAppIdOrIdentity is required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when serviceUrl must be a non-empty string.
   */
  ServiceUrlRequired: {
    code: -120028,
    description: '`serviceUrl` must be a non-empty string',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when conversationParameters must be defined.
   */
  ConversationParametersRequired: {
    code: -120029,
    description: '`conversationParameters` must be defined',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when logic must be defined.
   */
  LogicRequired: {
    code: -120030,
    description: '`logic` must be defined',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when context is required.
   */
  ContextRequired: {
    code: -120031,
    description: 'context is required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when conversationId is required.
   */
  ConversationIdRequired: {
    code: -120032,
    description: 'conversationId is required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when attachmentData is required.
   */
  AttachmentDataRequired: {
    code: -120033,
    description: 'attachmentData is required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when attachmentId is required.
   */
  AttachmentIdRequired: {
    code: -120034,
    description: 'attachmentId is required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when viewId is required.
   */
  ViewIdRequired: {
    code: -120035,
    description: 'viewId is required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when could not create connector client for agentic user.
   */
  CouldNotCreateConnectorClient: {
    code: -120036,
    description: 'Could not create connector client for agentic user',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Storage Errors (-120040 to -120049)
  /**
   * Error thrown when Keys are required when reading.
   */
  KeysRequiredForReading: {
    code: -120040,
    description: 'Keys are required when reading.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Changes are required when writing.
   */
  ChangesRequiredForWriting: {
    code: -120041,
    description: 'Changes are required when writing.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when there is an eTag conflict during storage write.
   */
  StorageEtagConflict: {
    code: -120042,
    description: 'Storage: error writing "{key}" due to eTag conflict.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // State Errors (-120050 to -120059)
  /**
   * Error thrown when activity.channelId is missing.
   */
  MissingActivityChannelId: {
    code: -120050,
    description: 'missing activity.channelId',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when activity.conversation.id is missing.
   */
  MissingActivityConversationId: {
    code: -120051,
    description: 'missing activity.conversation.id',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when activity.from.id is missing.
   */
  MissingActivityFromId: {
    code: -120052,
    description: 'missing activity.from.id',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when context.activity.channelId is missing.
   */
  MissingContextActivityChannelId: {
    code: -120053,
    description: 'missing context.activity.channelId',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when context.activity.conversation.id is missing.
   */
  MissingContextActivityConversationId: {
    code: -120054,
    description: 'missing context.activity.conversation.id',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when context.activity.from.id is missing.
   */
  MissingContextActivityFromId: {
    code: -120055,
    description: 'missing context.activity.from.id',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when context.activity.recipient.id is missing.
   */
  MissingContextActivityRecipientId: {
    code: -120056,
    description: 'missing context.activity.recipient.id',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Turn Context Errors (-120060 to -120069)
  /**
   * Error thrown when attempting to set responded to false.
   */
  CannotSetRespondedToFalse: {
    code: -120060,
    description: "TurnContext: cannot set 'responded' to a value of 'false'.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Header Propagation Errors (-120070 to -120079)
  /**
   * Error thrown when Headers must be provided.
   */
  HeadersRequired: {
    code: -120070,
    description: 'Headers must be provided.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Middleware Errors (-120080 to -120089)
  /**
   * Error thrown when invalid plugin type being added to MiddlewareSet.
   */
  InvalidMiddlewarePlugin: {
    code: -120080,
    description: 'MiddlewareSet.use(): invalid plugin type being added.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Transcript Logger Errors (-120090 to -120099)
  /**
   * Error thrown when TranscriptLoggerMiddleware requires a TranscriptLogger instance.
   */
  TranscriptLoggerRequired: {
    code: -120090,
    description: 'TranscriptLoggerMiddleware requires a TranscriptLogger instance.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when channelId is required for transcript operations.
   */
  TranscriptChannelIdRequired: {
    code: -120091,
    description: 'channelId is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when conversationId is required for transcript operations.
   */
  TranscriptConversationIdRequired: {
    code: -120092,
    description: 'conversationId is required.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Connector Client Errors (-120100 to -120109)
  /**
   * Error thrown when userId and conversationId are required.
   */
  UserIdAndConversationIdRequired: {
    code: -120100,
    description: 'userId and conversationId are required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when conversationId and activityId are required.
   */
  ConversationIdAndActivityIdRequired: {
    code: -120101,
    description: 'conversationId and activityId are required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Agent Client Errors (-120110 to -120119)
  /**
   * Error thrown when failed to post activity to agent.
   */
  FailedToPostActivityToAgent: {
    code: -120110,
    description: 'Failed to post activity to agent: {statusText}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when missing agent client config for agent.
   */
  MissingAgentClientConfig: {
    code: -120111,
    description: 'Missing agent client config for agent {agentName}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Agent name is required.
   */
  AgentNameRequired: {
    code: -120112,
    description: 'Agent name is required',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // OAuth Errors (-120120 to -120129)
  /**
   * Error thrown when failed to sign out.
   */
  FailedToSignOut: {
    code: -120120,
    description: 'Failed to sign out',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Auth Configuration Errors (-120130 to -120159)
  /**
   * Error thrown when Connection not found in environment.
   */
  ConnectionNotFoundInEnvironment: {
    code: -120130,
    description: 'Connection "{cnxName}" not found in environment.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when No default connection found in environment connections.
   */
  NoDefaultConnection: {
    code: -120131,
    description: 'No default connection found in environment connections.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when ClientId required in production.
   */
  ClientIdRequiredInProduction: {
    code: -120132,
    description: 'ClientId required in production',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when ClientId not found for connection.
   */
  ClientIdNotFoundForConnection: {
    code: -120133,
    description: 'ClientId not found for connection: {envPrefix}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // MSAL Connection Manager Errors (-120160 to -120169)
  /**
   * Error thrown when Connection not found.
   */
  ConnectionNotFound: {
    code: -120160,
    description: 'Connection not found: {connectionName}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when No connections found for this Agent in the Connections Configuration.
   */
  NoConnectionsFound: {
    code: -120161,
    description: 'No connections found for this Agent in the Connections Configuration.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Identity is required to get the token provider.
   */
  IdentityRequiredForTokenProvider: {
    code: -120162,
    description: 'Identity is required to get the token provider.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Audience and Service URL are required to get the token provider.
   */
  AudienceAndServiceUrlRequired: {
    code: -120163,
    description: 'Audience and Service URL are required to get the token provider.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when No connection found for audience and serviceUrl.
   */
  NoConnectionForAudienceAndServiceUrl: {
    code: -120164,
    description: 'No connection found for audience: {audience} and serviceUrl: {serviceUrl}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // MSAL Token Provider Errors (-120170 to -120189)
  /**
   * Error thrown when Connection settings must be provided to constructor when calling getAccessToken.
   */
  ConnectionSettingsRequiredForGetAccessToken: {
    code: -120170,
    description: 'Connection settings must be provided to constructor when calling getAccessToken(scope)',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Invalid authConfig.
   */
  InvalidAuthConfig: {
    code: -120171,
    description: 'Invalid authConfig. ',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Failed to acquire token.
   */
  FailedToAcquireToken: {
    code: -120172,
    description: 'Failed to acquire token',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Connection settings must be provided to constructor when calling acquireTokenOnBehalfOf.
   */
  ConnectionSettingsRequiredForAcquireTokenOnBehalfOf: {
    code: -120173,
    description: 'Connection settings must be provided to constructor when calling acquireTokenOnBehalfOf(scopes, oboAssertion)',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Connection settings must be provided when calling getAgenticInstanceToken.
   */
  ConnectionSettingsRequiredForGetAgenticInstanceToken: {
    code: -120174,
    description: 'Connection settings must be provided when calling getAgenticInstanceToken',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Failed to acquire instance token for agent instance.
   */
  FailedToAcquireInstanceToken: {
    code: -120175,
    description: 'Failed to acquire instance token for agent instance: {agentAppInstanceId}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Failed to acquire instance token for user token.
   */
  FailedToAcquireInstanceTokenForUserToken: {
    code: -120176,
    description: 'Failed to acquire instance token for user token: {agentAppInstanceId}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Connection settings must be provided when calling getAgenticApplicationToken.
   */
  ConnectionSettingsRequiredForGetAgenticApplicationToken: {
    code: -120177,
    description: 'Connection settings must be provided when calling getAgenticApplicationToken',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Failed to acquire token for agent instance.
   */
  FailedToAcquireTokenForAgentInstance: {
    code: -120178,
    description: 'Failed to acquire token for agent instance: {agentAppInstanceId}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // JWT Middleware Errors (-120190 to -120199)
  /**
   * Error thrown when token is invalid.
   */
  InvalidToken: {
    code: -120190,
    description: 'invalid token',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // Base Adapter Errors (-120200 to -120209)
  /**
   * Error thrown when unknown error type.
   */
  UnknownErrorType: {
    code: -120200,
    description: 'Unknown error type: {message}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // App Authorization Errors (-120210 to -120249)
  /**
   * Error thrown when The AgentApplication.authorization does not have any auth handlers.
   */
  NoAuthHandlersConfigured: {
    code: -120210,
    description: 'The AgentApplication.authorization does not have any auth handlers',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Unsupported authorization handler type.
   */
  UnsupportedAuthorizationHandlerType: {
    code: -120211,
    description: "Unsupported authorization handler type: '{handlerType}' for auth handler: '{handlerId}'. Supported types are: '{supportedTypes}'.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Unexpected registration status.
   */
  UnexpectedRegistrationStatus: {
    code: -120212,
    description: 'Unexpected registration status: {status}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Failed to sign in.
   */
  FailedToSignIn: {
    code: -120213,
    description: 'Failed to sign in',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Cannot find auth handlers with IDs.
   */
  CannotFindAuthHandlers: {
    code: -120214,
    description: 'Cannot find auth handlers with ID(s): {unknownHandlers}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Storage option is not available in the app options.
   */
  StorageOptionNotAvailable: {
    code: -120215,
    description: "The 'storage' option is not available in the app options. Ensure that the app is properly configured.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Connections option is not available in the app options.
   */
  ConnectionsOptionNotAvailable: {
    code: -120216,
    description: "The 'connections' option is not available in the app options. Ensure that the app is properly configured.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when The name property or connectionName env variable is required.
   */
  ConnectionNameRequired: {
    code: -120217,
    description: "The 'name' property or '{handlerId}_connectionName' env variable is required to initialize the handler.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Both activity.channelId and activity.from.id are required to perform signout.
   */
  ChannelIdAndFromIdRequiredForSignout: {
    code: -120218,
    description: "Both 'activity.channelId' and 'activity.from.id' are required to perform signout.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when The current token is not exchangeable for an on-behalf-of flow.
   */
  TokenNotExchangeable: {
    code: -120219,
    description: "The current token is not exchangeable for an on-behalf-of flow. Ensure the token audience starts with 'api://'.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when The userTokenClient is not available in the adapter.
   */
  UserTokenClientNotAvailable: {
    code: -120220,
    description: "The 'userTokenClient' is not available in the adapter. Ensure that the adapter supports user token operations.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when At least one scope must be specified for the Agentic authorization handler.
   */
  ScopeRequired: {
    code: -120221,
    description: 'At least one scope must be specified for the Agentic authorization handler.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Invalid parameters for exchangeToken method.
   */
  InvalidExchangeTokenParameters: {
    code: -120222,
    description: 'Invalid parameters for exchangeToken method.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Cannot find auth handler with ID.
   */
  CannotFindAuthHandler: {
    code: -120223,
    description: "Cannot find auth handler with ID '{id}'. Ensure it is configured in the agent application options.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Both activity.channelId and activity.from.id are required to generate the HandlerStorage key.
   */
  ChannelIdAndFromIdRequiredForHandlerStorage: {
    code: -120224,
    description: "Both 'activity.channelId' and 'activity.from.id' are required to generate the HandlerStorage key.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // App Application Errors (-120250 to -120269)
  /**
   * Error thrown when Storage is required for Authorization.
   */
  StorageRequiredForAuthorization: {
    code: -120250,
    description: 'Storage is required for Authorization. Ensure that a storage provider is configured in the AgentApplication options.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when The Application.authorization property is unavailable.
   */
  AuthorizationPropertyUnavailable: {
    code: -120251,
    description: 'The Application.authorization property is unavailable because no authorization options were configured.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when The Application.longRunningMessages property is unavailable.
   */
  LongRunningMessagesPropertyUnavailable: {
    code: -120252,
    description: 'The Application.longRunningMessages property is unavailable because no adapter was configured in the app.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when The Application.transcriptLogger property is unavailable.
   */
  TranscriptLoggerPropertyUnavailable: {
    code: -120253,
    description: 'The Application.transcriptLogger property is unavailable because no adapter was configured in the app.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Extension already registered.
   */
  ExtensionAlreadyRegistered: {
    code: -120254,
    description: 'Extension already registered',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // App Turn State Errors (-120270 to -120279)
  /**
   * Error thrown when TurnState hasn't been loaded.
   */
  TurnStateNotLoaded: {
    code: -120270,
    description: "TurnState hasn't been loaded. Call load() first.",
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when TurnState missing state scope.
   */
  TurnStateMissingScope: {
    code: -120271,
    description: 'TurnStateProperty: TurnState missing state scope named "{scope}".',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Invalid state scope.
   */
  InvalidStateScope: {
    code: -120272,
    description: 'Invalid state scope: {scope}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Invalid state path.
   */
  InvalidStatePath: {
    code: -120273,
    description: 'Invalid state path: {path}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // App Adaptive Cards Errors (-120280 to -120289)
  /**
   * Error thrown when Invalid action value.
   */
  InvalidActionValue: {
    code: -120280,
    description: 'Invalid action value: {error}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Unexpected AdaptiveCards.actionExecute() triggered for activity type.
   */
  UnexpectedActionExecute: {
    code: -120281,
    description: 'Unexpected AdaptiveCards.actionExecute() triggered for activity type: {activityType}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Unexpected AdaptiveCards.actionSubmit() triggered for activity type.
   */
  UnexpectedActionSubmit: {
    code: -120282,
    description: 'Unexpected AdaptiveCards.actionSubmit() triggered for activity type: {activityType}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  /**
   * Error thrown when Unexpected AdaptiveCards.search() triggered for activity type.
   */
  UnexpectedSearch: {
    code: -120283,
    description: 'Unexpected AdaptiveCards.search() triggered for activity type: {activityType}',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  },

  // App Streaming Errors (-120290 to -120299)
  /**
   * Error thrown when The stream has already ended.
   */
  StreamAlreadyEnded: {
    code: -120290,
    description: 'The stream has already ended.',
    helplink: 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}'
  }
}
