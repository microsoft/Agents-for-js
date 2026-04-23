/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Environment variable or configuration setting name for disabling spans by category in the Agents SDK telemetry. The value should be comma-separated or whitespace-separated list of span categories to disable. See `SpanCategories` for available categories.
 */
export const AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES = 'AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES'

/**
 * Categories of spans used for telemetry in the Agents SDK. Spans can be disabled by category using the `AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES` environment variable or configuration setting.
 */
export const SpanCategories = {
  STORAGE: ['STORAGE_'],
  AUTHORIZATION: ['AUTHORIZATION_', 'USER_TOKEN_CLIENT_'],
  AUTHENTICATION: ['AUTHENTICATION_'],
} as const

/**
 * Span names used for telemetry in the Agents SDK.
 */
export const SpanNames = {
  // CloudAdapter / BaseAdapter
  ADAPTER_PROCESS: 'agents.adapter.process',
  ADAPTER_SEND_ACTIVITIES: 'agents.adapter.send_activities',
  ADAPTER_UPDATE_ACTIVITY: 'agents.adapter.update_activity',
  ADAPTER_DELETE_ACTIVITY: 'agents.adapter.delete_activity',
  ADAPTER_CONTINUE_CONVERSATION: 'agents.adapter.continue_conversation',
  ADAPTER_CREATE_CONNECTOR_CLIENT: 'agents.adapter.create_connector_client',
  ADAPTER_CREATE_USER_TOKEN_CLIENT: 'agents.adapter.create_user_token_client',

  // AgentApplication
  AGENTS_APP_RUN: 'agents.app.run',
  AGENTS_APP_ROUTE_HANDLER: 'agents.app.route_handler',
  AGENTS_APP_BEFORE_TURN: 'agents.app.before_turn',
  AGENTS_APP_AFTER_TURN: 'agents.app.after_turn',
  AGENTS_APP_DOWNLOAD_FILES: 'agents.app.download_files',

  // ConnectorClient
  CONNECTOR_SEND_TO_CONVERSATION: 'agents.connector.send_to_conversation',
  CONNECTOR_REPLY_TO_ACTIVITY: 'agents.connector.reply_to_activity',
  CONNECTOR_UPDATE_ACTIVITY: 'agents.connector.update_activity',
  CONNECTOR_DELETE_ACTIVITY: 'agents.connector.delete_activity',
  CONNECTOR_CREATE_CONVERSATION: 'agents.connector.create_conversation',
  CONNECTOR_GET_CONVERSATIONS: 'agents.connector.get_conversations',
  CONNECTOR_GET_CONVERSATION_MEMBER: 'agents.connector.get_conversation_member',
  CONNECTOR_UPLOAD_ATTACHMENT: 'agents.connector.upload_attachment',
  CONNECTOR_GET_ATTACHMENT: 'agents.connector.get_attachment',
  CONNECTOR_GET_ATTACHMENT_INFO: 'agents.connector.get_attachment_info',

  // Storage
  STORAGE_READ: 'agents.storage.read',
  STORAGE_WRITE: 'agents.storage.write',
  STORAGE_DELETE: 'agents.storage.delete',

  // AgentClient
  AGENT_CLIENT_POST_ACTIVITY: 'agents.agent_client.post_activity',

  // Authentication
  AUTHENTICATION_GET_ACCESS_TOKEN: 'agents.authentication.get_access_token',
  AUTHENTICATION_ACQUIRE_TOKEN_ON_BEHALF_OF: 'agents.authentication.acquire_token_on_behalf_of',
  AUTHENTICATION_GET_AGENTIC_INSTANCE_TOKEN: 'agents.authentication.get_agentic_instance_token',
  AUTHENTICATION_GET_AGENTIC_USER_TOKEN: 'agents.authentication.get_agentic_user_token',

  // Authorization
  AUTHORIZATION_AGENTIC_TOKEN: 'agents.authorization.agentic_token',
  AUTHORIZATION_AZURE_BOT_TOKEN: 'agents.authorization.azure_bot_token',
  AUTHORIZATION_AZURE_BOT_SIGNIN: 'agents.authorization.azure_bot_signin',
  AUTHORIZATION_AZURE_BOT_SIGNOUT: 'agents.authorization.azure_bot_signout',

  // UserTokenClient
  USER_TOKEN_CLIENT_GET_USER_TOKEN: 'agents.user_token_client.get_user_token',
  USER_TOKEN_CLIENT_SIGN_OUT: 'agents.user_token_client.sign_out',
  USER_TOKEN_CLIENT_GET_SIGN_IN_RESOURCE: 'agents.user_token_client.get_sign_in_resource',
  USER_TOKEN_CLIENT_EXCHANGE_TOKEN: 'agents.user_token_client.exchange_token',
  USER_TOKEN_CLIENT_GET_TOKEN_OR_SIGN_IN_RESOURCE: 'agents.user_token_client.get_token_or_sign_in_resource',
  USER_TOKEN_CLIENT_GET_TOKEN_STATUS: 'agents.user_token_client.get_token_status',
  USER_TOKEN_CLIENT_GET_AAD_TOKENS: 'agents.user_token_client.get_aad_tokens',

  // TurnContext
  TURN_SEND_ACTIVITIES: 'agents.turn.send_activities',

  // Copilot Studio Client
  COPILOT_START_CONVERSATION: 'agents.copilot_client.start_conversation',
  COPILOT_SEND_ACTIVITY: 'agents.copilot_client.send_activity',
  COPILOT_POST_REQUEST: 'agents.copilot_client.post_request',
  COPILOT_CREATE_CONNECTION: 'agents.copilot_client.webchat.create_connection',
  COPILOT_EXECUTE_STREAMING: 'agents.copilot_client.execute_streaming',
  COPILOT_SUBSCRIBE_ASYNC: 'agents.copilot_client.subscribe_async',
} as const

/**
 * Metric names used for telemetry in the Agents SDK.
 */
export const MetricNames = {
  // CloudAdapter
  ADAPTER_PROCESS_DURATION: 'agents.adapter.process.duration',

  // Hosting activity counters
  ACTIVITIES_RECEIVED: 'agents.activities.received',
  ACTIVITIES_SENT: 'agents.activities.sent',
  ACTIVITIES_UPDATED: 'agents.activities.updated',
  ACTIVITIES_DELETED: 'agents.activities.deleted',

  // Connector metrics
  CONNECTOR_REQUESTS: 'agents.connector.request.count',
  CONNECTOR_REQUEST_DURATION: 'agents.connector.request.duration',

  // AgentClient metrics
  AGENT_CLIENT_REQUESTS: 'agents.agent_client.request.count',
  AGENT_CLIENT_REQUEST_DURATION: 'agents.agent_client.request.duration',

  // Turn metrics
  TURNS_COUNT: 'agents.turn.count',
  TURNS_ERRORS: 'agents.turn.error.count',
  TURN_DURATION: 'agents.turn.duration',

  // Storage metrics
  STORAGE_OPERATION_DURATION: 'agents.storage.operation.duration',

  // Authentication metrics
  AUTH_TOKEN_REQUEST_COUNT: 'agents.auth.token.request.count',
  AUTH_TOKEN_DURATION: 'agents.auth.token.duration',

  // UserTokenClient metrics
  USER_TOKEN_CLIENT_REQUESTS: 'agents.user_token_client.request.count',
  USER_TOKEN_CLIENT_REQUEST_DURATION: 'agents.user_token_client.request.duration',

  // Copilot Studio Client
  CSC_ACTIVITIES_RECEIVED: 'agents.copilot_client.activities.received',
  CSC_ACTIVITIES_SENT: 'agents.copilot_client.activities.sent',
  CSC_CONVERSATIONS_STARTED: 'agents.copilot_client.conversations.started',
  CSC_WEBCHAT_CONNECTIONS: 'agents.copilot_client.webchat.connection.count',
  CSC_REQUEST_COUNT: 'agents.copilot_client.request.count',
  CSC_REQUEST_ERRORS: 'agents.copilot_client.request.error.count',
  CSC_STREAM_DURATION: 'agents.copilot_client.stream.duration',
  CSC_REQUEST_DURATION: 'agents.copilot_client.request.duration',
  CSC_EXECUTE_STREAMING: 'agents.copilot_client.execute_streaming.count',
  CSC_SUBSCRIBE_ASYNC: 'agents.copilot_client.subscribe_async.count',
  CSC_SUBSCRIBE_EVENT: 'agents.copilot_client.subscribe_event.count',
} as const
