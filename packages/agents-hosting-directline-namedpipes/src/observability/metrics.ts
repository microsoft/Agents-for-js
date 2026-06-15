// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { metric, MetricNames } from '@microsoft/agents-telemetry'

export const NamedPipeMetrics = {
  connectionsCounter: metric.counter(MetricNames.NAMED_PIPE_CONNECTIONS, {
    unit: 'connection',
    description: 'Total number of named pipe connections established'
  }),

  dispatchesCounter: metric.counter(MetricNames.NAMED_PIPE_DISPATCHES, {
    unit: 'request',
    description: 'Total number of inbound requests dispatched to the activity handler'
  }),

  dispatchErrorsCounter: metric.counter(MetricNames.NAMED_PIPE_DISPATCH_ERRORS, {
    unit: 'error',
    description: 'Total number of dispatch errors'
  }),

  dispatchDuration: metric.histogram(MetricNames.NAMED_PIPE_DISPATCH_DURATION, {
    unit: 'ms',
    description: 'Duration of request dispatch (handler execution) in milliseconds'
  }),

  sendsCounter: metric.counter(MetricNames.NAMED_PIPE_SENDS, {
    unit: 'response',
    description: 'Total number of responses sent over the named pipe'
  }),

  sendDuration: metric.histogram(MetricNames.NAMED_PIPE_SEND_DURATION, {
    unit: 'ms',
    description: 'Duration of response send operations in milliseconds'
  })
}
