// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { AgentErrorDefinition } from '@microsoft/agents-activity';

export const Errors: { [key: string]: AgentErrorDefinition } = {
    // ============================================================================
    // TurnContext and Activity Errors (-120000 to -120090)
    // ============================================================================

    /**
     * Error thrown when TurnContext parameter is missing.
     */
    MissingTurnContext: {
        code: -120000,
        description: 'Missing TurnContext parameter',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120000',
    },

    /**
     * Error thrown when TurnContext does not include an activity.
     */
    TurnContextMissingActivity: {
        code: -120010,
        description: 'TurnContext does not include an activity',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120010',
    },

    /**
     * Error thrown when activity is missing its type property.
     */
    ActivityMissingType: {
        code: -120020,
        description: 'Activity is missing its type',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120020',
    },

    /**
     * Error thrown when activity parameter is invalid.
     */
    InvalidActivityObject: {
        code: -120030,
        description: 'Invalid activity object',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120030',
    },

    /**
     * Error thrown when activity is required but not provided.
     */
    ActivityRequired: {
        code: -120040,
        description: 'Activity is required.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120040',
    },

    /**
     * Error thrown when activity parameter is required but missing.
     */
    ActivityParameterRequired: {
        code: -120050,
        description: 'activity parameter required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120050',
    },

    /**
     * Error thrown when activity array is empty.
     */
    EmptyActivitiesArray: {
        code: -120060,
        description: 'Expecting one or more activities, but the array was empty.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120060',
    },

    /**
     * Error thrown when activities parameter is required but missing.
     */
    ActivitiesParameterRequired: {
        code: -120070,
        description: 'activities parameter required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120070',
    },

    /**
     * Error thrown when attempting to set TurnContext.responded to false.
     */
    CannotSetRespondedToFalse: {
        code: -120080,
        description: "TurnContext: cannot set 'responded' to a value of 'false'.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120080',
    },

    /**
     * Error thrown when context parameter is required but missing.
     */
    ContextParameterRequired: {
        code: -120090,
        description: 'context parameter required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120090',
    },

    // ============================================================================
    // Channel and Conversation Errors (-120100 to -120240)
    // ============================================================================

    /**
     * Error thrown when channelId is required but missing.
     */
    ChannelIdRequired: {
        code: -120100,
        description: 'channelId is required.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120100',
    },

    /**
     * Error thrown when conversationId is required but missing.
     */
    ConversationIdRequired: {
        code: -120110,
        description: 'conversationId is required.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120110',
    },

    /**
     * Error thrown when conversation reference object is invalid.
     */
    InvalidConversationReference: {
        code: -120120,
        description: 'Invalid conversation reference object',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120120',
    },

    /**
     * Error thrown when continueConversation receives invalid conversation reference.
     */
    ContinueConversationInvalidReference: {
        code: -120130,
        description: 'continueConversation: Invalid conversation reference object',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120130',
    },

    /**
     * Error thrown when context is required but missing.
     */
    ContextRequired: {
        code: -120140,
        description: 'context is required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120140',
    },

    /**
     * Error thrown when both userId and conversationId are required.
     */
    UserIdAndConversationIdRequired: {
        code: -120150,
        description: 'userId and conversationId are required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120150',
    },

    /**
     * Error thrown when both conversationId and activityId are required.
     */
    ConversationIdAndActivityIdRequired: {
        code: -120160,
        description: 'conversationId and activityId are required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120160',
    },

    /**
     * Error thrown when serviceUrl must be a non-empty string.
     */
    ServiceUrlRequired: {
        code: -120170,
        description: 'serviceUrl must be a non-empty string',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120170',
    },

    /**
     * Error thrown when conversationParameters must be defined.
     */
    ConversationParametersRequired: {
        code: -120180,
        description: 'conversationParameters must be defined',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120180',
    },

    /**
     * Error thrown when activity.channelId is missing.
     */
    MissingActivityChannelId: {
        code: -120190,
        description: 'missing activity.channelId',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120190',
    },

    /**
     * Error thrown when activity.from.id is missing.
     */
    MissingActivityFromId: {
        code: -120200,
        description: 'missing activity.from.id',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120200',
    },

    /**
     * Error thrown when activity.conversation.id is missing.
     */
    MissingActivityConversationId: {
        code: -120210,
        description: 'missing activity.conversation.id',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120210',
    },

    /**
     * Error thrown when context.activity.channelId is missing.
     */
    MissingContextActivityChannelId: {
        code: -120220,
        description: 'missing context.activity.channelId',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120220',
    },

    /**
     * Error thrown when both channelId and from.id are required for operation.
     */
    ChannelIdAndFromIdRequired: {
        code: -120230,
        description: "Both 'activity.channelId' and 'activity.from.id' are required for this operation.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120230',
    },

    /**
     * Error thrown when both channelId and from.id are required for signout.
     */
    ChannelIdAndFromIdRequiredForSignout: {
        code: -120240,
        description: "Both 'activity.channelId' and 'activity.from.id' are required to perform signout.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120240',
    },

    // ============================================================================
    // Attachment Errors (-120250 to -120290)
    // ============================================================================

    /**
     * Error thrown when attachmentData is required but missing.
     */
    AttachmentDataRequired: {
        code: -120250,
        description: 'attachmentData is required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120250',
    },

    /**
     * Error thrown when attachmentId is required but missing.
     */
    AttachmentIdRequired: {
        code: -120260,
        description: 'attachmentId is required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120260',
    },

    /**
     * Error thrown when viewId is required but missing.
     */
    ViewIdRequired: {
        code: -120270,
        description: 'viewId is required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120270',
    },

    /**
     * Error thrown when headers must be provided.
     */
    HeadersRequired: {
        code: -120280,
        description: 'Headers must be provided.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120280',
    },

    /**
     * Error thrown when request.body parameter is required.
     */
    RequestBodyParameterRequired: {
        code: -120290,
        description: 'request.body parameter required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120290',
    },

    // ============================================================================
    // Connection and Authentication Errors (-120300 to -120590)
    // ============================================================================

    /**
     * Error thrown when a connection is not found in environment.
     */
    ConnectionNotFoundInEnvironment: {
        code: -120300,
        description: 'Connection "{connectionName}" not found in environment.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120300',
    },

    /**
     * Error thrown when no default connection is found in environment.
     */
    NoDefaultConnectionFound: {
        code: -120310,
        description: 'No default connection found in environment connections.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120310',
    },

    /**
     * Error thrown when ClientId is required in production.
     */
    ClientIdRequiredInProduction: {
        code: -120320,
        description: 'ClientId required in production',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120320',
    },

    /**
     * Error thrown when ClientId is not found for connection.
     */
    ClientIdNotFoundForConnection: {
        code: -120330,
        description: 'ClientId not found for connection: {connectionName}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120330',
    },

    /**
     * Error thrown when connector client cannot be created for agentic user.
     */
    CannotCreateConnectorClientForAgenticUser: {
        code: -120340,
        description: 'Could not create connector client for agentic user',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120340',
    },

    /**
     * Error thrown when connection is not found by name.
     */
    ConnectionNotFound: {
        code: -120350,
        description: 'Connection not found: {connectionName}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120350',
    },

    /**
     * Error thrown when no connections are found in configuration.
     */
    NoConnectionsFoundInConfiguration: {
        code: -120360,
        description: 'No connections found for this Agent in the Connections Configuration.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120360',
    },

    /**
     * Error thrown when connections option is not available in app options.
     */
    ConnectionsOptionNotAvailable: {
        code: -120370,
        description: "The 'connections' option is not available in the app options. Ensure that the app is properly configured.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120370',
    },

    /**
     * Error thrown when connection settings must be provided.
     */
    ConnectionSettingsRequired: {
        code: -120380,
        description: 'Connection settings must be provided for this operation.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120380',
    },

    /**
     * Error thrown when identity is required to get token provider.
     */
    IdentityRequiredForTokenProvider: {
        code: -120390,
        description: 'Identity is required to get the token provider.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120390',
    },

    /**
     * Error thrown when audience and service URL are required for token provider.
     */
    AudienceAndServiceUrlRequiredForTokenProvider: {
        code: -120400,
        description: 'Audience and Service URL are required to get the token provider.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120400',
    },

    /**
     * Error thrown when no connection found for audience and service URL.
     */
    NoConnectionForAudienceAndServiceUrl: {
        code: -120410,
        description: 'No connection found for audience: {audience} and serviceUrl: {serviceUrl}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120410',
    },

    /**
     * Error thrown when invalid token is provided.
     */
    InvalidToken: {
        code: -120420,
        description: 'invalid token',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120420',
    },

    /**
     * Error thrown when invalid parameters for exchangeToken method.
     */
    InvalidExchangeTokenParameters: {
        code: -120430,
        description: 'Invalid parameters for exchangeToken method.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120430',
    },

    /**
     * Error thrown when invalid authConfig is provided.
     */
    InvalidAuthConfig: {
        code: -120440,
        description: 'Invalid authConfig.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120440',
    },

    /**
     * Error thrown when failed to acquire token.
     */
    FailedToAcquireToken: {
        code: -120450,
        description: 'Failed to acquire token',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120450',
    },

    /**
     * Error thrown when failed to acquire instance token.
     */
    FailedToAcquireInstanceToken: {
        code: -120460,
        description: 'Failed to acquire instance token',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120460',
    },

    /**
     * Error thrown when userTokenClient is not available in adapter.
     */
    UserTokenClientNotAvailable: {
        code: -120470,
        description: "The 'userTokenClient' is not available in the adapter. Ensure that the adapter supports user token operations.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120470',
    },

    /**
     * Error thrown when current token is not exchangeable for OBO flow.
     */
    TokenNotExchangeableForOBO: {
        code: -120480,
        description: "The current token is not exchangeable for an on-behalf-of flow. Ensure the token audience starts with 'api://'.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120480',
    },

    /**
     * Error thrown when name property or connection name env variable is required.
     */
    ConnectionNameOrEnvVariableRequired: {
        code: -120490,
        description: "The 'name' property or '{handlerId}_connectionName' env variable is required to initialize the handler.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120490',
    },

    /**
     * Error thrown when failed to sign out.
     */
    FailedToSignOut: {
        code: -120500,
        description: 'Failed to sign out',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120500',
    },

    /**
     * Error thrown when failed to sign in.
     */
    FailedToSignIn: {
        code: -120510,
        description: 'Failed to sign in',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120510',
    },

    /**
     * Error thrown when at least one scope must be specified for agentic auth handler.
     */
    AtLeastOneScopeRequired: {
        code: -120520,
        description: 'At least one scope must be specified for the Agentic authorization handler.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120520',
    },

    /**
     * Error thrown when authorization option is not available in app options.
     */
    AuthorizationOptionNotAvailable: {
        code: -120530,
        description: 'The Application.authorization property is unavailable because no authorization options were configured.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120530',
    },

    /**
     * Error thrown when auth handler with specified ID cannot be found.
     */
    AuthHandlerNotFound: {
        code: -120540,
        description: "Cannot find auth handler with ID '{handlerId}'. Ensure it is configured in the agent application options.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120540',
    },

    /**
     * Error thrown when auth handlers with specified IDs cannot be found.
     */
    AuthHandlersNotFound: {
        code: -120550,
        description: 'Cannot find auth handlers with ID(s): {handlerIds}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120550',
    },

    /**
     * Error thrown when AgentApplication.authorization does not have any auth handlers.
     */
    NoAuthHandlersConfigured: {
        code: -120560,
        description: 'The AgentApplication.authorization does not have any auth handlers',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120560',
    },

    /**
     * Error thrown when unsupported authorization handler type is encountered.
     */
    UnsupportedAuthHandlerType: {
        code: -120570,
        description: 'Unsupported authorization handler type: {handlerType}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120570',
    },

    /**
     * Error thrown when unexpected registration status is encountered.
     */
    UnexpectedRegistrationStatus: {
        code: -120580,
        description: 'Unexpected registration status: {status}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120580',
    },

    /**
     * Error thrown when storage is required for authorization.
     */
    StorageRequiredForAuthorization: {
        code: -120590,
        description: 'Storage is required for Authorization. Ensure that a storage provider is configured in the app options.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120590',
    },

    // ============================================================================
    // Agent and Client Errors (-120600 to -120630)
    // ============================================================================

    /**
     * Error thrown when missing agent client config for specified agent.
     */
    MissingAgentClientConfig: {
        code: -120600,
        description: 'Missing agent client config for agent {agentName}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120600',
    },

    /**
     * Error thrown when agent name is required.
     */
    AgentNameRequired: {
        code: -120610,
        description: 'Agent name is required',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120610',
    },

    /**
     * Error thrown when failed to post activity to agent.
     */
    FailedToPostActivityToAgent: {
        code: -120620,
        description: 'Failed to post activity to agent: {statusText}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120620',
    },

    /**
     * Error thrown when logic parameter must be defined.
     */
    LogicParameterRequired: {
        code: -120630,
        description: 'logic must be defined',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120630',
    },

    // ============================================================================
    // Storage and State Errors (-120700 to -120730)
    // ============================================================================

    /**
     * Error thrown when storage write operation fails due to eTag conflict.
     */
    StorageETagConflict: {
        code: -120700,
        description: 'Storage: error writing "{key}" due to eTag conflict.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120700',
    },

    /**
     * Error thrown when storage option is not available in app options.
     */
    StorageOptionNotAvailable: {
        code: -120710,
        description: "The 'storage' option is not available in the app options. Ensure that the app is properly configured.",
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120710',
    },

    /**
     * Error thrown when state is not loaded.
     */
    StateNotLoaded: {
        code: -120720,
        description: 'State not loaded. Call load() before accessing state properties.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120720',
    },

    /**
     * Error thrown when invalid state scope is provided.
     */
    InvalidStateScope: {
        code: -120730,
        description: 'Invalid state scope: {scope}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120730',
    },

    // ============================================================================
    // Application Configuration Errors (-120850 to -120900)
    // ============================================================================

    /**
     * Error thrown when longRunningMessages property is unavailable.
     */
    LongRunningMessagesPropertyUnavailable: {
        code: -120850,
        description: 'The Application.longRunningMessages property is unavailable because no adapter was configured in the app.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120850',
    },

    /**
     * Error thrown when transcriptLogger property is unavailable.
     */
    TranscriptLoggerPropertyUnavailable: {
        code: -120860,
        description: 'The Application.transcriptLogger property is unavailable because no adapter was configured in the app.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120860',
    },

    /**
     * Error thrown when TranscriptLoggerMiddleware requires a TranscriptLogger instance.
     */
    TranscriptLoggerInstanceRequired: {
        code: -120870,
        description: 'TranscriptLoggerMiddleware requires a TranscriptLogger instance.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120870',
    },

    /**
     * Error thrown when extension is already registered.
     */
    ExtensionAlreadyRegistered: {
        code: -120880,
        description: 'Extension already registered',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120880',
    },

    /**
     * Error thrown when invalid plugin type is added to MiddlewareSet.
     */
    InvalidMiddlewarePluginType: {
        code: -120890,
        description: 'MiddlewareSet.use(): invalid plugin type being added.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120890',
    },

    /**
     * Error thrown when the stream has already ended.
     */
    StreamAlreadyEnded: {
        code: -120900,
        description: 'The stream has already ended.',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120900',
    },

    // ============================================================================
    // Adaptive Cards Errors (-120950 to -120980)
    // ============================================================================

    /**
     * Error thrown when unexpected AdaptiveCards.actionExecute() is triggered.
     */
    UnexpectedActionExecute: {
        code: -120950,
        description: 'Unexpected AdaptiveCards.actionExecute() triggered for activity type: {activityType}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120950',
    },

    /**
     * Error thrown when unexpected AdaptiveCards.actionSubmit() is triggered.
     */
    UnexpectedActionSubmit: {
        code: -120960,
        description: 'Unexpected AdaptiveCards.actionSubmit() triggered for activity type: {activityType}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120960',
    },

    /**
     * Error thrown when unexpected AdaptiveCards.search() is triggered.
     */
    UnexpectedSearchAction: {
        code: -120970,
        description: 'Unexpected AdaptiveCards.search() triggered for activity type: {activityType}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120970',
    },

    /**
     * Error thrown when invalid action value is provided.
     */
    InvalidActionValue: {
        code: -120980,
        description: 'Invalid action value: {error}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120980',
    },

    // ============================================================================
    // General Errors (-120990)
    // ============================================================================

    /**
     * Error thrown when unknown error type is encountered.
     */
    UnknownErrorType: {
        code: -120990,
        description: 'Unknown error type: {errorMessage}',
        helplink: 'https://aka.ms/M365AgentsErrorCodesJS/#-120990',
    },
};
