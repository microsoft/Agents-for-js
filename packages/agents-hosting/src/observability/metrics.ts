// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { metric, MetricNames } from '@microsoft/agents-telemetry'

export const HostingMetrics = {
  // Counters
  activitiesReceivedCounter: metric.counter(MetricNames.ACTIVITIES_RECEIVED, {
    unit: 'activities',
    description: 'Total number of activities received by the adapter'
  }),

  activitiesSentCounter: metric.counter(MetricNames.ACTIVITIES_SENT, {
    unit: 'activities',
    description: 'Total number of outbound activities sent by the adapter'
  }),

  activitiesUpdatedCounter: metric.counter(MetricNames.ACTIVITIES_UPDATED, {
    unit: 'activities',
    description: 'Total number of activities updated by the adapter'
  }),

  activitiesDeletedCounter: metric.counter(MetricNames.ACTIVITIES_DELETED, {
    unit: 'activities',
    description: 'Total number of activities deleted by the adapter'
  }),

  connectorRequestsCounter: metric.counter(MetricNames.CONNECTOR_REQUESTS, {
    unit: 'request',
    description: 'Total number of outbound connector HTTP requests'
  }),

  agentClientRequestsCounter: metric.counter(MetricNames.AGENT_CLIENT_REQUESTS, {
    unit: 'request',
    description: 'Total number of inter-agent calls'
  }),

  turnsTotalCounter: metric.counter(MetricNames.TURNS_COUNT, {
    unit: 'turn',
    description: 'Total turns processed'
  }),

  turnsErrorsCounter: metric.counter(MetricNames.TURNS_ERRORS, {
    unit: 'turn',
    description: 'Total turns that resulted in an error'
  }),

  authTokenRequestsCounter: metric.counter(MetricNames.AUTH_TOKEN_REQUEST_COUNT, {
    unit: 'request',
    description: 'Total number of token acquisition attempts'
  }),

  userTokenClientRequestsCounter: metric.counter(MetricNames.USER_TOKEN_CLIENT_REQUESTS, {
    unit: 'request',
    description: 'Total number of user token client HTTP requests'
  }),

  proactiveOperationCounter: metric.counter(MetricNames.PROACTIVE_OPERATION_COUNT, {
    unit: 'operation',
    description: 'Total number of proactive operations (sendActivity, continueConversation, createConversation)'
  }),

  // Duration Histograms
  adapterProcessDuration: metric.histogram(MetricNames.ADAPTER_PROCESS_DURATION, {
    unit: 'ms',
    description: 'Duration of the adapter process method in milliseconds'
  }),

  connectorRequestDuration: metric.histogram(MetricNames.CONNECTOR_REQUEST_DURATION, {
    unit: 'ms',
    description: 'Duration of outbound connector HTTP requests in milliseconds'
  }),

  agentClientRequestDuration: metric.histogram(MetricNames.AGENT_CLIENT_REQUEST_DURATION, {
    unit: 'ms',
    description: 'Duration of inter-agent call latency in milliseconds'
  }),

  turnDuration: metric.histogram(MetricNames.TURN_DURATION, {
    unit: 'ms',
    description: 'Duration of end-to-end turn processing in milliseconds'
  }),

  storageOperationDuration: metric.histogram(MetricNames.STORAGE_OPERATION_DURATION, {
    unit: 'ms',
    description: 'Duration of storage operations in milliseconds'
  }),

  authTokenDuration: metric.histogram(MetricNames.AUTH_TOKEN_DURATION, {
    unit: 'ms',
    description: 'Duration of token acquisition latency in milliseconds'
  }),

  userTokenClientRequestDuration: metric.histogram(MetricNames.USER_TOKEN_CLIENT_REQUEST_DURATION, {
    unit: 'ms',
    description: 'Duration of user token client HTTP requests in milliseconds'
  }),

  proactiveOperationDuration: metric.histogram(MetricNames.PROACTIVE_OPERATION_DURATION, {
    unit: 'ms',
    description: 'Duration of proactive operations in milliseconds'
  })
}
