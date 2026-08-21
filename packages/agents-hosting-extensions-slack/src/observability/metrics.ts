// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { metric, MetricNames } from '@microsoft/agents-telemetry'

export const SlackMetrics = {
  apiRequestsCounter: metric.counter(MetricNames.SLACK_API_REQUESTS, {
    unit: 'request',
    description: 'Total number of outbound Slack Web API requests'
  }),

  apiRequestDuration: metric.histogram(MetricNames.SLACK_API_REQUEST_DURATION, {
    unit: 'ms',
    description: 'Duration of outbound Slack Web API requests in milliseconds'
  })
}
